import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const launcherPath = resolve(import.meta.dirname, "../start-customer-mac.sh");
const source = readFileSync(launcherPath, "utf8");
const stopLauncherPath = resolve(
  import.meta.dirname,
  "../stop-customer-mac.sh",
);
const stopSource = readFileSync(stopLauncherPath, "utf8");
const readme = readFileSync(
  resolve(import.meta.dirname, "../../README.md"),
  "utf8",
);

const validCustomerEnv = {
  DATABASE_URL:
    "postgresql://rehab:customer-password@localhost:55432/rehab_platform",
  JWT_SECRET: "customer-session-secret-with-at-least-32-bytes",
  WEB_ORIGIN: "http://localhost:3000",
  PORT: "4000",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
  COOKIE_SECURE: "false",
  PUBLIC_CREDENTIAL_THROTTLE_LIMIT: "7",
  PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: "45000",
  DEFAULT_PATIENT_PASSWORD: "customer-seed-password",
  SENSITIVE_DATA_KEY_REF: "secret-manager://rehab/customer-sensitive-key",
  SENSITIVE_DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
  POSTGRES_PASSWORD: "customer-postgres-password",
};

function runConfigurationPrefix({
  overrides = {},
  omitted = [],
  writeEnv = true,
} = {}) {
  const firstPrerequisite =
    'command_exists docker || fail "Docker is not installed or not in PATH."';
  const prefixEnd = source.indexOf(firstPrerequisite);

  assert.notEqual(prefixEnd, -1, "Docker prerequisite marker must exist");

  const root = mkdtempSync(join(tmpdir(), "customer-launcher-contract-"));
  const scriptsDirectory = join(root, "scripts");
  const probePath = join(scriptsDirectory, "start-customer-mac.sh");
  mkdirSync(scriptsDirectory, { recursive: true });
  writeFileSync(probePath, `${source.slice(0, prefixEnd)}\nexit 0\n`);

  if (writeEnv) {
    const env = { ...validCustomerEnv, ...overrides };
    for (const name of omitted) delete env[name];
    writeFileSync(
      join(root, ".env"),
      `${Object.entries(env)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n")}\n`,
    );
  }

  try {
    return spawnSync("/bin/bash", [probePath], {
      encoding: "utf8",
      env: { ...process.env, HOME: root },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

const apiPreflightLsofEvent =
  "lsof:pid=:port=4000:fd=:args=-nP -iTCP:4000 -sTCP:LISTEN -Fp";

function countApiOwnedLsofQueries(events) {
  return events.filter(
    (event) =>
      event.startsWith("lsof:pid=") &&
      event.includes(":port=4000:fd=:args=-nP -a -p ") &&
      event.endsWith("-iTCP:4000 -sTCP:LISTEN -Fp"),
  ).length;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    const state = spawnSync("/bin/ps", ["-p", String(pid), "-o", "stat="], {
      encoding: "utf8",
    });
    return state.status === 0 && !state.stdout.trim().startsWith("Z");
  } catch {
    return false;
  }
}

function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processIsAlive(pid) && Date.now() < deadline) {
    spawnSync("/bin/sleep", ["0.1"]);
  }
  return !processIsAlive(pid);
}

function spawnWithOwnershipFd(command, args, { cwd, ownerFile }) {
  const ownerFd = openSync(ownerFile, "r");
  const stdio = Array(10).fill("ignore");
  stdio[9] = ownerFd;
  try {
    return spawn(command, args, { cwd, stdio });
  } finally {
    closeSync(ownerFd);
  }
}

function createStopFixture(prefix) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  const scriptsDirectory = join(root, "scripts");
  const webDirectory = join(root, "apps/web");
  const runtimeDirectory = join(root, ".customer-runtime");
  const launcher = join(scriptsDirectory, "stop-customer-mac.sh");
  mkdirSync(scriptsDirectory, { recursive: true });
  mkdirSync(webDirectory, { recursive: true });
  mkdirSync(runtimeDirectory, { recursive: true });
  writeFileSync(launcher, stopSource);
  return { root, webDirectory, runtimeDirectory, launcher };
}

function writeOwnershipRecords(
  runtimeDirectory,
  name,
  expectedCwd,
  suffix = "ABC123",
) {
  const ownerRecord = join(runtimeDirectory, `${name}.command`);
  const ownerFile = `${ownerRecord}.owner.${suffix}`;
  writeFileSync(ownerFile, `${expectedCwd}\n`);
  writeFileSync(ownerRecord, `${ownerFile}\n`);
  return { ownerRecord, ownerFile };
}

function countLinesIfPresent(path) {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).length;
}

function spawnTermObserver({ cwd, ownerFile, termLog, ignoreTerm = false }) {
  const script = ignoreTerm
    ? 'trap \'printf "TERM\\n" >> "$1"\' TERM; end=$((SECONDS + 8)); while (( SECONDS < end )); do /bin/sleep 0.2; done'
    : 'trap \'printf "TERM\\n" >> "$1"; exit 0\' TERM; while :; do /bin/sleep 0.2; done';
  return spawnWithOwnershipFd(
    "/bin/bash",
    ["-c", script, "customer-stop-term-observer", termLog],
    { cwd, ownerFile },
  );
}

function spawnDetachedTermObserver({
  cwd,
  ownerFile,
  termLog,
  ignoreTerm = false,
}) {
  const script = ignoreTerm
    ? 'trap \'printf "TERM\\n" >> "$1"\' TERM; end=$((SECONDS + 8)); while (( SECONDS < end )); do /bin/sleep 0.2; done'
    : 'trap \'printf "TERM\\n" >> "$1"; exit 0\' TERM; while :; do /bin/sleep 0.2; done';
  const ownerFd = openSync(ownerFile, "r");
  const stdio = Array(10).fill("ignore");
  stdio[1] = "pipe";
  stdio[2] = "pipe";
  stdio[9] = ownerFd;
  try {
    const result = spawnSync(
      "/bin/bash",
      [
        "-c",
        '/bin/bash -c "$1" customer-stop-term-observer "$2" >/dev/null 2>&1 </dev/null & printf "%s\\n" "$!"',
        "customer-stop-detach-parent",
        script,
        termLog,
      ],
      { cwd, encoding: "utf8", stdio },
    );
    assert.equal(result.status, 0, combinedOutput(result));
    const pid = Number(result.stdout.trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    return pid;
  } finally {
    closeSync(ownerFd);
  }
}

function runStopAgainstTermIgnoringProcess() {
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), "customer-launcher-stop-"),
  );
  const scriptsDirectory = join(root, "scripts");
  const webDirectory = join(root, "apps/web");
  const runtimeDirectory = join(root, ".customer-runtime");
  const launcher = join(scriptsDirectory, "stop-customer-mac.sh");
  const termLog = join(root, "term.log");
  const ownerRecord = join(runtimeDirectory, "web.command");
  const ownerFile = `${ownerRecord}.owner.ABC123`;
  mkdirSync(scriptsDirectory, { recursive: true });
  mkdirSync(webDirectory, { recursive: true });
  mkdirSync(runtimeDirectory, { recursive: true });
  writeFileSync(launcher, stopSource);
  writeFileSync(ownerFile, `${webDirectory}\n`);
  writeFileSync(ownerRecord, `${ownerFile}\n`);

  const child = spawnWithOwnershipFd(
    "/bin/bash",
    [
      "-c",
      'trap \'printf "TERM\\n" >> "$1"\' TERM; end=$((SECONDS + 6)); while (( SECONDS < end )); do /bin/sleep 0.2; done',
      "customer-stop-term-observer",
      termLog,
    ],
    { cwd: webDirectory, ownerFile },
  );
  assert.ok(child.pid);
  writeFileSync(join(runtimeDirectory, "web.pid"), String(child.pid));

  try {
    const result = spawnSync("/bin/bash", [launcher], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, HOME: root },
    });
    const termCount = (() => {
      try {
        return readFileSync(termLog, "utf8").trim().split("\n").filter(Boolean)
          .length;
      } catch {
        return 0;
      }
    })();
    const readOptional = (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    };
    return {
      result,
      termCount,
      alive: processIsAlive(child.pid),
      pidRecord: readOptional(join(runtimeDirectory, "web.pid")),
      ownerRecord: readOptional(ownerRecord),
      ownerFileExists: existsSync(ownerFile),
      childPid: child.pid,
      ownerFile,
      root,
    };
  } catch (error) {
    waitForProcessExit(child.pid, 7_000);
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

test("stop launcher sends one TERM and preserves ownership records when a real process stays alive", () => {
  const observation = runStopAgainstTermIgnoringProcess();
  try {
    assert.notEqual(
      observation.result.status,
      0,
      combinedOutput(observation.result),
    );
    assert.equal(observation.termCount, 1, "stop must send exactly one TERM");
    assert.equal(
      observation.alive,
      true,
      "the TERM-ignoring process must still be alive when stop returns",
    );
    assert.equal(observation.pidRecord, String(observation.childPid));
    assert.equal(observation.ownerRecord, `${observation.ownerFile}\n`);
    assert.equal(observation.ownerFileExists, true);
    assert.doesNotMatch(
      combinedOutput(observation.result),
      /Application processes stopped/,
    );
  } finally {
    assert.equal(waitForProcessExit(observation.childPid, 7_000), true);
    rmSync(observation.root, { recursive: true, force: true });
  }
});

test("stop launcher does not signal a reused PID from another cwd even with the recorded ownership FD", () => {
  const canonicalTmp = realpathSync(tmpdir());
  const root = mkdtempSync(join(canonicalTmp, "customer-launcher-owner-"));
  const otherRoot = mkdtempSync(
    join(canonicalTmp, "customer-launcher-other-project-"),
  );
  const scriptsDirectory = join(root, "scripts");
  const runtimeDirectory = join(root, ".customer-runtime");
  const launcher = join(scriptsDirectory, "stop-customer-mac.sh");
  const termLog = join(otherRoot, "term.log");
  const ownerRecord = join(runtimeDirectory, "api.command");
  const ownerFile = `${ownerRecord}.owner.ABC123`;
  mkdirSync(scriptsDirectory, { recursive: true });
  mkdirSync(runtimeDirectory, { recursive: true });
  writeFileSync(launcher, stopSource);
  writeFileSync(ownerFile, `${root}\n`);
  writeFileSync(ownerRecord, `${ownerFile}\n`);

  const child = spawnWithOwnershipFd(
    "/bin/bash",
    [
      "-c",
      'trap \'printf "TERM\\n" >> "$1"; exit 0\' TERM; while :; do /bin/sleep 0.2; done',
      "customer-stop-other-cwd",
      termLog,
    ],
    { cwd: otherRoot, ownerFile },
  );
  assert.ok(child.pid);
  writeFileSync(join(runtimeDirectory, "api.pid"), String(child.pid));

  try {
    const result = spawnSync("/bin/bash", [launcher], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, HOME: root },
    });
    const termCount = (() => {
      try {
        return readFileSync(termLog, "utf8").trim().split("\n").filter(Boolean)
          .length;
      } catch {
        return 0;
      }
    })();

    assert.notEqual(result.status, 0, combinedOutput(result));
    assert.equal(
      termCount,
      0,
      "a process owned by another cwd must not receive TERM",
    );
    assert.equal(processIsAlive(child.pid), true);
    assert.equal(
      readFileSync(join(runtimeDirectory, "api.pid"), "utf8"),
      String(child.pid),
    );
    assert.equal(readFileSync(ownerRecord, "utf8"), `${ownerFile}\n`);
    assert.equal(existsSync(ownerFile), true);
  } finally {
    if (processIsAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    assert.equal(waitForProcessExit(child.pid, 3_000), true);
    rmSync(root, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

test("stop launcher does not signal a same-cwd process that lacks the exclusive ownership FD", () => {
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), "customer-launcher-no-owner-fd-"),
  );
  const scriptsDirectory = join(root, "scripts");
  const runtimeDirectory = join(root, ".customer-runtime");
  const launcher = join(scriptsDirectory, "stop-customer-mac.sh");
  const termLog = join(root, "term.log");
  const ownerRecord = join(runtimeDirectory, "api.command");
  const ownerFile = `${ownerRecord}.owner.ABC123`;
  mkdirSync(scriptsDirectory, { recursive: true });
  mkdirSync(runtimeDirectory, { recursive: true });
  writeFileSync(launcher, stopSource);
  writeFileSync(ownerFile, `${root}\n`);
  writeFileSync(ownerRecord, `${ownerFile}\n`);

  const child = spawn(
    "/bin/bash",
    [
      "-c",
      'trap \'printf "TERM\\n" >> "$1"; exit 0\' TERM; while :; do /bin/sleep 0.2; done',
      "customer-stop-no-owner-fd",
      termLog,
    ],
    { cwd: root, stdio: "ignore" },
  );
  assert.ok(child.pid);
  writeFileSync(join(runtimeDirectory, "api.pid"), String(child.pid));

  try {
    const result = spawnSync("/bin/bash", [launcher], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, HOME: root },
    });
    const termCount = existsSync(termLog)
      ? readFileSync(termLog, "utf8").trim().split("\n").filter(Boolean).length
      : 0;

    assert.notEqual(result.status, 0, combinedOutput(result));
    assert.equal(
      termCount,
      0,
      "same cwd without the launcher-owned FD must not receive TERM",
    );
    assert.equal(processIsAlive(child.pid), true);
    assert.equal(
      readFileSync(join(runtimeDirectory, "api.pid"), "utf8"),
      String(child.pid),
    );
    assert.equal(readFileSync(ownerRecord, "utf8"), `${ownerFile}\n`);
    assert.equal(existsSync(ownerFile), true);
  } finally {
    if (processIsAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    assert.equal(waitForProcessExit(child.pid, 3_000), true);
    rmSync(root, { recursive: true, force: true });
  }
});

test("stop launcher removes valid ownership records for a stale PID", () => {
  const fixture = createStopFixture("customer-launcher-stale-pid-");
  const stalePid = "2147483647";
  const { ownerRecord, ownerFile } = writeOwnershipRecords(
    fixture.runtimeDirectory,
    "api",
    fixture.root,
  );
  const pidFile = join(fixture.runtimeDirectory, "api.pid");
  writeFileSync(pidFile, stalePid);
  assert.equal(
    processIsAlive(Number(stalePid)),
    false,
    "fixture PID must be stale",
  );

  try {
    const result = spawnSync("/bin/bash", [fixture.launcher], {
      cwd: fixture.root,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, HOME: fixture.root },
    });

    assert.equal(result.status, 0, combinedOutput(result));
    assert.match(
      combinedOutput(result),
      new RegExp(`API PID ${stalePid} is not running`),
    );
    assert.equal(existsSync(pidFile), false);
    assert.equal(existsSync(ownerRecord), false);
    assert.equal(existsSync(ownerFile), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stop launcher rejects a tampered ownership-file path without signaling", () => {
  const fixture = createStopFixture("customer-launcher-owner-path-tamper-");
  const termLog = join(fixture.root, "term.log");
  const ownerRecord = join(fixture.runtimeDirectory, "api.command");
  const tamperedOwnerFile = join(
    fixture.runtimeDirectory,
    "tampered-owner-file",
  );
  writeFileSync(tamperedOwnerFile, `${fixture.root}\n`);
  writeFileSync(ownerRecord, `${tamperedOwnerFile}\n`);
  const child = spawnTermObserver({
    cwd: fixture.root,
    ownerFile: tamperedOwnerFile,
    termLog,
  });
  assert.ok(child.pid);
  const pidFile = join(fixture.runtimeDirectory, "api.pid");
  writeFileSync(pidFile, String(child.pid));

  try {
    const result = spawnSync("/bin/bash", [fixture.launcher], {
      cwd: fixture.root,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, HOME: fixture.root },
    });

    assert.notEqual(result.status, 0, combinedOutput(result));
    assert.equal(countLinesIfPresent(termLog), 0);
    assert.equal(processIsAlive(child.pid), true);
    assert.equal(readFileSync(pidFile, "utf8"), String(child.pid));
    assert.equal(readFileSync(ownerRecord, "utf8"), `${tamperedOwnerFile}\n`);
    assert.equal(existsSync(tamperedOwnerFile), true);
  } finally {
    if (processIsAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    assert.equal(waitForProcessExit(child.pid, 3_000), true);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stop launcher rejects a same-cwd process whose FD9 was replaced", () => {
  const fixture = createStopFixture("customer-launcher-owner-fd-replaced-");
  const termLog = join(fixture.root, "term.log");
  const { ownerRecord, ownerFile } = writeOwnershipRecords(
    fixture.runtimeDirectory,
    "api",
    fixture.root,
  );
  const replacementOwnerFile = join(
    fixture.runtimeDirectory,
    "replacement-owner-file",
  );
  writeFileSync(replacementOwnerFile, `${fixture.root}\n`);
  const child = spawnTermObserver({
    cwd: fixture.root,
    ownerFile: replacementOwnerFile,
    termLog,
  });
  assert.ok(child.pid);
  const pidFile = join(fixture.runtimeDirectory, "api.pid");
  writeFileSync(pidFile, String(child.pid));

  try {
    const result = spawnSync("/bin/bash", [fixture.launcher], {
      cwd: fixture.root,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, HOME: fixture.root },
    });

    assert.notEqual(result.status, 0, combinedOutput(result));
    assert.equal(countLinesIfPresent(termLog), 0);
    assert.equal(processIsAlive(child.pid), true);
    assert.equal(readFileSync(pidFile, "utf8"), String(child.pid));
    assert.equal(readFileSync(ownerRecord, "utf8"), `${ownerFile}\n`);
    assert.equal(existsSync(ownerFile), true);
  } finally {
    if (processIsAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    assert.equal(waitForProcessExit(child.pid, 3_000), true);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stop launcher records Web and API outcomes independently in the same run", () => {
  const fixture = createStopFixture("customer-launcher-stop-two-services-");
  const webTermLog = join(fixture.root, "web-term.log");
  const apiTermLog = join(fixture.root, "api-term.log");
  const webOwnership = writeOwnershipRecords(
    fixture.runtimeDirectory,
    "web",
    fixture.webDirectory,
  );
  const apiOwnership = writeOwnershipRecords(
    fixture.runtimeDirectory,
    "api",
    fixture.root,
  );
  const webPid = spawnDetachedTermObserver({
    cwd: fixture.webDirectory,
    ownerFile: webOwnership.ownerFile,
    termLog: webTermLog,
    ignoreTerm: true,
  });
  const apiPid = spawnDetachedTermObserver({
    cwd: fixture.root,
    ownerFile: apiOwnership.ownerFile,
    termLog: apiTermLog,
  });
  const webPidFile = join(fixture.runtimeDirectory, "web.pid");
  const apiPidFile = join(fixture.runtimeDirectory, "api.pid");
  writeFileSync(webPidFile, String(webPid));
  writeFileSync(apiPidFile, String(apiPid));

  try {
    const result = spawnSync("/bin/bash", [fixture.launcher], {
      cwd: fixture.root,
      encoding: "utf8",
      timeout: 12_000,
      env: { ...process.env, HOME: fixture.root },
    });

    assert.notEqual(result.status, 0, combinedOutput(result));
    assert.equal(
      countLinesIfPresent(webTermLog),
      1,
      "Web must receive one TERM",
    );
    assert.equal(
      countLinesIfPresent(apiTermLog),
      1,
      "API must receive one TERM",
    );
    assert.equal(processIsAlive(webPid), true);
    assert.equal(existsSync(webPidFile), true);
    assert.equal(existsSync(webOwnership.ownerRecord), true);
    assert.equal(existsSync(webOwnership.ownerFile), true);
    assert.equal(processIsAlive(apiPid), false);
    assert.equal(existsSync(apiPidFile), false);
    assert.equal(existsSync(apiOwnership.ownerRecord), false);
    assert.equal(existsSync(apiOwnership.ownerFile), false);
    assert.doesNotMatch(
      combinedOutput(result),
      /Application processes stopped/,
    );
  } finally {
    if (processIsAlive(apiPid)) process.kill(apiPid, "SIGTERM");
    assert.equal(waitForProcessExit(apiPid, 3_000), true);
    assert.equal(waitForProcessExit(webPid, 9_000), true);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("customer launchers contain no silent fallback, repeated TERM, or SIGKILL path", () => {
  assert.doesNotMatch(source, /\|\|\s*true/);
  assert.doesNotMatch(stopSource, /\|\|\s*true/);
  assert.doesNotMatch(
    `${source}\n${stopSource}`,
    /SIGKILL|kill\s+-KILL|kill\s+-9/,
  );
  assert.doesNotMatch(stopSource, /sending TERM again|再次.*TERM/i);
  assert.equal(
    stopSource.match(/kill -TERM "\$pid"/g)?.length,
    1,
    "stop must have exactly one TERM send site per process invocation",
  );
});

test("start and stop use only exact cwd plus the exclusive inherited ownership FD", () => {
  for (const [label, script] of [
    ["start", source],
    ["stop", stopSource],
  ]) {
    const cwdFunctionStart = script.indexOf("process_cwd() {");
    const fdFunctionStart = script.indexOf("process_holds_ownership_fd() {");
    const matchFunctionStart = script.indexOf("process_matches_expected() {");
    assert.notEqual(cwdFunctionStart, -1, `${label} process_cwd must exist`);
    assert.notEqual(
      fdFunctionStart,
      -1,
      `${label} process_holds_ownership_fd must exist`,
    );
    assert.notEqual(
      matchFunctionStart,
      -1,
      `${label} process_matches_expected must exist`,
    );
    const cwdBody = script.slice(cwdFunctionStart, fdFunctionStart);
    assert.equal(
      cwdBody.match(/lsof\b/g)?.length,
      1,
      `${label} must query cwd once`,
    );
    assert.match(cwdBody, /lsof -nP -a -p "\$pid" -d cwd -Fn/);
    const nextFunction = script.indexOf(
      "() {",
      matchFunctionStart + "process_matches_expected() {".length,
    );
    const matchBody = script.slice(
      matchFunctionStart,
      nextFunction === -1 ? undefined : nextFunction,
    );
    assert.match(matchBody, /actual_cwd="\$\(process_cwd "\$pid"\)"/);
    assert.match(matchBody, /"\$actual_cwd" == "\$expected_cwd"/);
    assert.match(
      matchBody,
      /process_holds_ownership_fd "\$pid" "\$owner_file"/,
    );
    assert.doesNotMatch(
      script,
      /process_command|ps -p .*command=|REHAB_CUSTOMER_PROCESS_OWNER|lstart/,
    );
  }
});

const fullLauncherStubs = String.raw`
record_launcher_event() {
  printf '%s\n' "$*" >> "$LAUNCHER_EVENT_LOG"
}

docker() {
  if [[ "$1" == "info" ]]; then
    local count_file="$LAUNCHER_TEST_ROOT/docker-info.count"
    local count=0
    if [[ -f "$count_file" ]]; then
      read -r count < "$count_file"
    fi
    count=$((count + 1))
    printf '%s' "$count" > "$count_file"
    record_launcher_event "docker:info"
    if [[ "$LAUNCHER_DOCKER_INFO_MODE" == "ready" ]]; then
      return 0
    fi
    if [[ "$LAUNCHER_DOCKER_INFO_MODE" == "first-fails-then-ready" ]]; then
      (( count > 1 ))
      return
    fi
    return 1
  fi
  if [[ "$1" == "image" && "$2" == "inspect" && "$3" == "postgres:18" ]]; then
    record_launcher_event "docker:image:inspect"
    return 0
  fi
  if [[ "$1" == "inspect" ]]; then
    record_launcher_event "docker:health"
    printf 'healthy\n'
    return 0
  fi
  record_launcher_event "docker:unexpected:$*"
  return 97
}

pnpm() {
  record_launcher_event "pnpm:$*"
  case "$*" in
    "infra:up")
      record_launcher_event "compose-password:$POSTGRES_PASSWORD"
      return 0
      ;;
    "db:generate"|"db:migrate:deploy")
      return 0
      ;;
    "--filter @rehab-platform/api build")
      mkdir -p "$LAUNCHER_TEST_ROOT/apps/api/dist"
      : > "$LAUNCHER_TEST_ROOT/apps/api/dist/main.js"
      return 0
      ;;
    "--filter @rehab-platform/web build")
      mkdir -p "$LAUNCHER_TEST_ROOT/apps/web/.next"
      printf 'fixture-build\n' > "$LAUNCHER_TEST_ROOT/apps/web/.next/BUILD_ID"
      return 0
      ;;
  esac
  return 96
}

node() {
  return 0
}

curl() {
  if [[ "$LAUNCHER_CURL_MODE" == "web-fails" && "$*" == *"http://localhost:3000"* ]]; then
    record_launcher_event "curl:web:failed"
    return 22
  fi
  if [[ "$LAUNCHER_CURL_MODE" == "web-delayed" && "$*" == *"http://localhost:3000"* ]]; then
    local count_file="$LAUNCHER_TEST_ROOT/curl-web.count"
    local count=0
    [[ ! -f "$count_file" ]] || read -r count < "$count_file"
    count=$((count + 1))
    printf '%s' "$count" > "$count_file"
    record_launcher_event "curl:web:attempt:$count"
    (( count >= 3 ))
    return
  fi
  return 0
}

sleep() {
  if [[ "$LAUNCHER_CURL_MODE" == "web-delayed" ]]; then
    SECONDS=$((SECONDS + 1))
  else
    SECONDS=$((SECONDS + 61))
  fi
  return 0
}

lsof() {
  local requested_pid=""
  local requested_port=""
  local requested_fd=""
  local previous=""
  local argument
  for argument in "$@"; do
    if [[ "$previous" == "-p" ]]; then
      requested_pid="$argument"
    elif [[ "$previous" == "-d" ]]; then
      requested_fd="$argument"
    fi
    if [[ "$argument" == "-iTCP:4000" ]]; then
      requested_port="4000"
    elif [[ "$argument" == "-iTCP:3000" ]]; then
      requested_port="3000"
    fi
    previous="$argument"
  done
  record_launcher_event "lsof:pid=$requested_pid:port=$requested_port:fd=$requested_fd:args=$*"

  local api_pid=""
  local web_pid=""
  [[ ! -f "$LAUNCHER_TEST_ROOT/.customer-runtime/api.pid" ]] || read -r api_pid < "$LAUNCHER_TEST_ROOT/.customer-runtime/api.pid"
  [[ ! -f "$LAUNCHER_TEST_ROOT/.customer-runtime/web.pid" ]] || read -r web_pid < "$LAUNCHER_TEST_ROOT/.customer-runtime/web.pid"

  local process_name=""
  if [[ "$requested_pid" == "$api_pid" ]]; then
    process_name="api"
  elif [[ "$requested_pid" == "$web_pid" ]]; then
    process_name="web"
  fi

  if [[ "$requested_fd" == "cwd" ]]; then
    [[ -n "$process_name" ]] || return 1
    builtin kill -0 "$requested_pid" >/dev/null 2>&1 || return 1
    local cwd_file="$LAUNCHER_TEST_ROOT/$process_name.cwd"
    [[ -f "$cwd_file" ]] || return 1
    local process_cwd
    read -r process_cwd < "$cwd_file"
    printf 'p%s\nfcwd\nn%s\n' "$requested_pid" "$process_cwd"
    return 0
  fi

  if [[ "$requested_fd" == "9" ]]; then
    [[ -n "$process_name" ]] || return 1
    builtin kill -0 "$requested_pid" >/dev/null 2>&1 || return 1
    local owner_fd_file="$LAUNCHER_TEST_ROOT/$process_name.owner-fd"
    [[ -f "$owner_fd_file" ]] || return 1
    local owner_file
    read -r owner_file < "$owner_fd_file"
    printf 'p%s\nf9\nn%s\n' "$requested_pid" "$owner_file"
    return 0
  fi

  local owner_pid=""
  if [[ "$requested_port" == "4000" ]]; then
    owner_pid="$api_pid"
  elif [[ "$requested_port" == "3000" ]]; then
    owner_pid="$web_pid"
  fi
  if [[ -z "$owner_pid" ]]; then
    case "$LAUNCHER_LSOF_MODE" in
      "preflight-exit-42")
        return 42
        ;;
      "preflight-exit-1-stderr")
        printf 'lsof fixture diagnostic\n' >&2
        return 1
        ;;
      "preflight-exit-0-stderr")
        printf 'p91234\nf15\n'
        printf 'lsof fixture warning\n' >&2
        return 0
        ;;
      "preflight-exit-0-empty")
        return 0
        ;;
      "preflight-exit-0-malformed")
        printf 'COMMAND PID USER\n'
        return 0
        ;;
      "preflight-exit-0-multiple")
        printf 'p91234\np91235\n'
        return 0
        ;;
      "preflight-exit-0-nonnumeric")
        printf 'pnot-a-pid\n'
        return 0
        ;;
      "preflight-exit-0-zero-pid")
        printf 'p0\nf15\n'
        return 0
        ;;
      "preflight-exit-0-leading-zero-pid")
        printf 'p01\nf15\n'
        return 0
        ;;
      "preflight-exit-0-pid-only")
        printf 'p91234\n'
        return 0
        ;;
      "preflight-exit-0-missing-final-newline")
        printf 'p91234\nf15'
        return 0
        ;;
      "preflight-exit-0-terminal-nul")
        printf 'p91234\nf15\0'
        return 0
        ;;
      "preflight-exit-0-nul-in-pid")
        printf 'p91234\0\nf15\n'
        return 0
        ;;
      "preflight-exit-0-nul-in-fd")
        printf 'p91234\nf15\0\n'
        return 0
        ;;
      "preflight-exit-0-nonnumeric-fd")
        printf 'p91234\nfnot-an-fd\n'
        return 0
        ;;
      "preflight-exit-0-leading-zero-fd")
        printf 'p91234\nf01\n'
        return 0
        ;;
      "preflight-exit-0-negative-fd")
        printf 'p91234\nf-1\n'
        return 0
        ;;
      "preflight-exit-0-unknown-field")
        printf 'p91234\nf15\nXbad\n'
        return 0
        ;;
      "preflight-exit-0-fd-before-pid")
        printf 'f14\np91234\nf15\n'
        return 0
        ;;
      "preflight-exit-0-fd-after-second-pid")
        printf 'p91234\np91235\nf15\n'
        return 0
        ;;
      "preflight-exit-0-duplicate-pid")
        printf 'p91234\nf15\np91234\nf16\n'
        return 0
        ;;
      "preflight-canonical-occupied")
        printf 'p91240\nf15\n'
        return 0
        ;;
    esac
    return 1
  fi
  builtin kill -0 "$owner_pid" >/dev/null 2>&1 || return 1
  if [[ "$LAUNCHER_LSOF_MODE" == "wrong-api-port-owner" && "$requested_port" == "4000" && -n "$requested_pid" ]]; then
    return 1
  fi
  if [[ "$LAUNCHER_LSOF_MODE" == "wrong-api-port-owner" && "$requested_port" == "4000" ]]; then
    printf 'p91236\nf15\n'
    return 0
  fi
  if [[ -n "$requested_pid" && "$requested_pid" != "$owner_pid" ]]; then
    return 1
  fi
  if [[ -n "$requested_pid" ]]; then
    case "$LAUNCHER_LSOF_MODE" in
      "owned-query-exit-42")
        return 42
        ;;
      "owned-query-exit-1-stderr")
        printf 'lsof owned fixture diagnostic\n' >&2
        return 1
        ;;
      "owned-query-exit-0-stderr")
        printf 'p%s\nf15\n' "$owner_pid"
        printf 'lsof owned fixture warning\n' >&2
        return 0
        ;;
      "owned-query-exit-0-empty")
        return 0
        ;;
      "owned-query-exit-0-malformed")
        printf 'COMMAND PID USER\n'
        return 0
        ;;
      "owned-query-exit-0-multiple")
        printf 'p%s\np91237\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-nonnumeric")
        printf 'pnot-a-pid\n'
        return 0
        ;;
      "owned-query-exit-0-zero-pid")
        printf 'p0\nf15\n'
        return 0
        ;;
      "owned-query-exit-0-leading-zero-pid")
        printf 'p01\nf15\n'
        return 0
        ;;
      "owned-query-wrong-exact-pid")
        printf 'p91238\nf15\n'
        return 0
        ;;
      "owned-query-exit-0-pid-only")
        printf 'p%s\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-missing-final-newline")
        printf 'p%s\nf15' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-terminal-nul")
        printf 'p%s\nf15\0' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-nul-in-pid")
        printf 'p%s\0\nf15\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-nul-in-fd")
        printf 'p%s\nf15\0\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-nonnumeric-fd")
        printf 'p%s\nfnot-an-fd\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-leading-zero-fd")
        printf 'p%s\nf01\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-negative-fd")
        printf 'p%s\nf-1\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-unknown-field")
        printf 'p%s\nf15\nXbad\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-fd-before-pid")
        printf 'f14\np%s\nf15\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-fd-after-second-pid")
        printf 'p%s\np91239\nf15\n' "$owner_pid"
        return 0
        ;;
      "owned-query-exit-0-duplicate-pid")
        printf 'p%s\nf15\np%s\nf16\n' "$owner_pid" "$owner_pid"
        return 0
        ;;
    esac
  fi
  if [[ "$LAUNCHER_LSOF_MODE" == "real-macos-field-output" ]]; then
    record_launcher_event "lsof:real-macos-field-output:pid=$requested_pid:port=$requested_port:args=$*"
    printf 'p%s\nf15\nf16\n' "$owner_pid"
    return 0
  fi
  printf 'p%s\nf15\n' "$owner_pid"
  return 0
}

ps() {
  local requested_pid=""
  local previous=""
  local argument
  for argument in "$@"; do
    if [[ "$previous" == "-p" ]]; then
      requested_pid="$argument"
    fi
    previous="$argument"
  done
  local api_pid=""
  local web_pid=""
  [[ ! -f "$LAUNCHER_TEST_ROOT/.customer-runtime/api.pid" ]] || read -r api_pid < "$LAUNCHER_TEST_ROOT/.customer-runtime/api.pid"
  [[ ! -f "$LAUNCHER_TEST_ROOT/.customer-runtime/web.pid" ]] || read -r web_pid < "$LAUNCHER_TEST_ROOT/.customer-runtime/web.pid"
  if [[ "$requested_pid" == "$api_pid" ]]; then
    printf '%s\n' 'node /fixture/apps/api/dist/main.js'
    return 0
  fi
  if [[ "$requested_pid" == "$web_pid" ]]; then
    printf '%s\n' "$LAUNCHER_WEB_PROCESS_COMMAND"
    return 0
  fi
  return 1
}

nohup() {
  local expected_cwd="$5"
  local owner_file="$6"
  cd "$expected_cwd" || return 125
  exec 9<"$owner_file" || return 126
  if [[ "$*" == *"apps/api/dist/main.js"* ]]; then
    local process_name="api"
    record_launcher_event "start:api"
  else
    local process_name="web"
    record_launcher_event "start:web"
  fi
  printf '%s\n' "$PWD" > "$LAUNCHER_TEST_ROOT/$process_name.cwd"
  record_launcher_event "start:$process_name:cwd:$PWD"
  if [[ "$process_name" == "web" ]]; then
    if [[ -f "$PWD/.next/BUILD_ID" ]]; then
      record_launcher_event "start:web:production-build-visible"
    else
      record_launcher_event "start:web:production-build-missing"
    fi
  fi
  local owner_record="$LAUNCHER_TEST_ROOT/.customer-runtime/$process_name.command"
  if [[ -r /dev/fd/9 && -f "$owner_record" ]]; then
    local owner_file
    read -r owner_file < "$owner_record"
    if [[ -f "$owner_file" && "$(< /dev/fd/9)" == "$PWD" ]]; then
      printf '%s\n' "$owner_file" > "$LAUNCHER_TEST_ROOT/$process_name.owner-fd"
      record_launcher_event "owner-fd:$process_name:$owner_file"
    fi
  fi
  if [[ "$LAUNCHER_START_MODE" == "web-exits" && "$process_name" == "web" ]]; then
    record_launcher_event "exit:web"
    return 17
  fi
  if [[ "$LAUNCHER_START_MODE" == "api-exits" && "$process_name" == "api" ]]; then
    record_launcher_event "exit:api"
    return 18
  fi
  if [[ "$LAUNCHER_TERM_MODE" == "api-stays-alive" && "$process_name" == "api" ]]; then
    trap '' TERM
    trap 'exit 0' USR1
    while :; do
      /bin/sleep 1
    done
  fi
  trap 'record_launcher_event "term:'"$process_name"'"; exit 0' TERM
  while :; do
    /bin/sleep 1
  done
}

open() {
  record_launcher_event "open:$*"
  return 0
}

find() {
  if [[ "$LAUNCHER_FINGERPRINT_MODE" == "fail" && "$*" == *"/apps/web/src"* ]]; then
    record_launcher_event "fingerprint:find:failed"
    return 42
  fi
  /usr/bin/find "$@"
}
`;

function terminateFixtureProcesses(root) {
  for (const name of ["api.pid", "web.pid"]) {
    const path = join(root, ".customer-runtime", name);
    try {
      const pid = Number(readFileSync(path, "utf8"));
      if (Number.isInteger(pid) && pid > 0 && processIsAlive(pid)) {
        process.kill(pid, "SIGUSR1");
        waitForProcessExit(pid, 3_000);
      }
    } catch {
      // The launcher can fail before creating process records.
    }
  }
}

function runFullLauncher({
  overrides = {},
  dockerInfoMode = "ready",
  fingerprintMode = "ok",
  curlMode = "ready",
  lsofMode = "owned",
  startMode = "running",
  termMode = "responsive",
  unreadableFingerprintInput = undefined,
  unreadableStoredFingerprint = false,
  changeNextConfigBetweenRuns = false,
  existingWebBuild = false,
  webProcessCommand = "next start --hostname 0.0.0.0 --port 3000",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "customer-launcher-full-"));
  const scriptsDirectory = join(root, "scripts");
  const launcher = join(scriptsDirectory, "start-customer-mac.sh");
  const bashEnv = join(root, "launcher-stubs.bash");
  const eventLog = join(root, "launcher-events.log");

  mkdirSync(scriptsDirectory, { recursive: true });
  mkdirSync(join(root, "apps/api"), { recursive: true });
  mkdirSync(join(root, "apps/web/src"), { recursive: true });
  mkdirSync(join(root, "apps/web/public"), { recursive: true });
  mkdirSync(join(root, "apps/web/node_modules/.bin"), { recursive: true });
  writeFileSync(launcher, source);
  writeFileSync(bashEnv, fullLauncherStubs);
  writeFileSync(
    join(root, "apps/web/package.json"),
    '{"name":"fixture-web"}\n',
  );
  writeFileSync(join(root, "apps/web/next.config.ts"), "export default {};\n");
  writeFileSync(
    join(root, "apps/web/postcss.config.mjs"),
    "export default {};\n",
  );
  writeFileSync(join(root, "apps/web/tsconfig.json"), "{}\n");
  writeFileSync(
    join(root, "apps/web/eslint.config.mjs"),
    "export default [];\n",
  );
  writeFileSync(join(root, "apps/web/src/page.tsx"), "export default null;\n");
  writeFileSync(join(root, "apps/web/public/asset.txt"), "fixture\n");
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const nextBin = join(root, "apps/web/node_modules/.bin/next");
  writeFileSync(nextBin, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(nextBin, 0o755);

  if (existingWebBuild) {
    mkdirSync(join(root, "apps/web/.next"), { recursive: true });
    mkdirSync(join(root, ".customer-runtime"), { recursive: true });
    writeFileSync(join(root, "apps/web/.next/BUILD_ID"), "stale-build\n");
    writeFileSync(
      join(root, ".customer-runtime/web-build.fingerprint"),
      "stale\n",
    );
  }
  if (unreadableFingerprintInput) {
    chmodSync(join(root, unreadableFingerprintInput), 0o000);
  }
  if (unreadableStoredFingerprint) {
    chmodSync(join(root, ".customer-runtime/web-build.fingerprint"), 0o000);
  }

  const env = { ...validCustomerEnv, ...overrides };
  writeFileSync(
    join(root, ".env"),
    `${Object.entries(env)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );

  let result;
  let firstResult;
  let events = [];
  let runtime = {};
  try {
    const launcherEnvironment = {
      ...process.env,
      BASH_ENV: bashEnv,
      HOME: root,
      LAUNCHER_DOCKER_INFO_MODE: dockerInfoMode,
      LAUNCHER_CURL_MODE: curlMode,
      LAUNCHER_LSOF_MODE: lsofMode,
      LAUNCHER_START_MODE: startMode,
      LAUNCHER_TERM_MODE: termMode,
      LAUNCHER_EVENT_LOG: eventLog,
      LAUNCHER_FINGERPRINT_MODE: fingerprintMode,
      LAUNCHER_TEST_ROOT: root,
      LAUNCHER_WEB_PROCESS_COMMAND: webProcessCommand,
    };
    const executeLauncher = () =>
      spawnSync("/bin/bash", [launcher], {
        encoding: "utf8",
        timeout: 10_000,
        env: launcherEnvironment,
      });
    result = executeLauncher();
    if (changeNextConfigBetweenRuns) {
      firstResult = result;
      terminateFixtureProcesses(root);
      writeFileSync(
        join(root, "apps/web/next.config.ts"),
        "export default { output: 'standalone' };\n",
      );
      writeFileSync(eventLog, "");
      result = executeLauncher();
    }
    try {
      events = readFileSync(eventLog, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      events = [];
    }
    for (const name of ["api", "web"]) {
      const pidPath = join(root, ".customer-runtime", `${name}.pid`);
      const commandPath = join(root, ".customer-runtime", `${name}.command`);
      let pid;
      try {
        pid = Number(readFileSync(pidPath, "utf8"));
      } catch {
        pid = undefined;
      }
      let alive = false;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
      }
      runtime[name] = {
        pid,
        alive,
        pidRecordExists: Number.isInteger(pid),
        commandRecordExists: (() => {
          try {
            readFileSync(commandPath);
            return true;
          } catch {
            return false;
          }
        })(),
      };
    }
    return { result, firstResult, events, runtime };
  } finally {
    terminateFixtureProcesses(root);
    rmSync(root, { recursive: true, force: true });
  }
}

test("complete launcher starts Web from apps/web where the production build exists", () => {
  const { result, events } = runFullLauncher();

  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  const cwdEvent = events.find((event) => event.startsWith("start:web:cwd:"));
  assert.ok(cwdEvent, "Web start cwd must be observable");
  assert.match(cwdEvent, /\/apps\/web$/);
  assert.ok(events.includes("start:web:production-build-visible"));
  assert.ok(!events.includes("start:web:production-build-missing"));
});

test("complete launcher accepts readiness after Next rewrites its process title", () => {
  const { result, events } = runFullLauncher({
    webProcessCommand: "next-server (v16.2.6)",
  });

  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.equal(events.filter((event) => event === "start:web").length, 1);
});

test("complete launcher gives API and Web distinct inherited ownership files", () => {
  const { result, events } = runFullLauncher();

  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  const ownerEvents = events.filter((event) => event.startsWith("owner-fd:"));
  assert.equal(ownerEvents.length, 2, events.join("\n"));
  const ownerFiles = ownerEvents.map((event) =>
    event.split(":").slice(2).join(":"),
  );
  assert.notEqual(ownerFiles[0], ownerFiles[1]);
  assert.match(ownerFiles[0], /\.command\.owner\.[A-Za-z0-9]{6}$/);
  assert.match(ownerFiles[1], /\.command\.owner\.[A-Za-z0-9]{6}$/);
});

test("complete launcher rebuilds Web when only next.config.ts changes", () => {
  const { firstResult, result, events } = runFullLauncher({
    changeNextConfigBetweenRuns: true,
  });

  assert.equal(firstResult.status, 0, combinedOutput(firstResult));
  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.ok(
    events.includes("pnpm:--filter @rehab-platform/web build"),
    "a config-only change must invalidate the Web build fingerprint",
  );
});

test("Web fingerprint covers every build configuration that actually exists", () => {
  const webRoot = resolve(import.meta.dirname, "../../apps/web");
  const actualBuildConfigs = [
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "eslint.config.mjs",
  ];
  for (const config of actualBuildConfigs) {
    assert.equal(
      existsSync(join(webRoot, config)),
      true,
      `${config} fixture must actually exist`,
    );
    assert.ok(
      config === "tsconfig.json" || config.includes("config."),
      `${config} must match the production fingerprint discovery rule`,
    );
  }
  assert.match(source, /find "\$ROOT_DIR\/apps\/web" -maxdepth 1 -type f/);
  assert.match(source, /-name '\*config\.\*' -o -name 'tsconfig\.json'/);
});

test("complete launcher hard-fails an unreadable Web config without stale build reuse", () => {
  const { result, events } = runFullLauncher({
    existingWebBuild: true,
    unreadableFingerprintInput: "apps/web/next.config.ts",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /Web fingerprint.*失败/);
  assert.ok(!events.includes("pnpm:--filter @rehab-platform/web build"));
  assert.ok(!events.includes("start:api"));
});

test("complete launcher hard-fails an unreadable stored fingerprint without starting", () => {
  const { result, events } = runFullLauncher({
    existingWebBuild: true,
    unreadableStoredFingerprint: true,
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /Web fingerprint 读取失败/);
  assert.ok(!events.includes("pnpm:--filter @rehab-platform/web build"));
  assert.ok(!events.includes("start:api"));
});

test("complete launcher accepts delayed Web readiness without restarting Web", () => {
  const { result, events } = runFullLauncher({ curlMode: "web-delayed" });

  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.deepEqual(
    events.filter((event) => event.startsWith("curl:web:attempt:")),
    ["curl:web:attempt:1", "curl:web:attempt:2", "curl:web:attempt:3"],
  );
  assert.equal(events.filter((event) => event === "start:web").length, 1);
});

test("complete launcher accepts real macOS lsof PID and numeric FD fields", () => {
  const { result, events } = runFullLauncher({
    lsofMode: "real-macos-field-output",
  });

  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.equal(events.filter((event) => event === "start:api").length, 1);
  assert.equal(events.filter((event) => event === "start:web").length, 1);
  assert.equal(
    events.filter(
      (event) =>
        event ===
        "lsof:real-macos-field-output:pid=:port=4000:args=-nP -iTCP:4000 -sTCP:LISTEN -Fp",
    ).length,
    1,
  );
  assert.equal(
    events.filter((event) =>
      /^lsof:real-macos-field-output:pid=[1-9][0-9]*:port=4000:args=-nP -a -p [1-9][0-9]* -iTCP:4000 -sTCP:LISTEN -Fp$/.test(
        event,
      ),
    ).length,
    2,
  );
});

for (const lsofMode of [
  "preflight-exit-42",
  "preflight-exit-1-stderr",
  "preflight-exit-0-stderr",
  "preflight-exit-0-empty",
  "preflight-exit-0-malformed",
  "preflight-exit-0-multiple",
  "preflight-exit-0-nonnumeric",
  "preflight-exit-0-zero-pid",
  "preflight-exit-0-leading-zero-pid",
  "preflight-exit-0-pid-only",
  "preflight-exit-0-missing-final-newline",
  "preflight-exit-0-terminal-nul",
  "preflight-exit-0-nul-in-pid",
  "preflight-exit-0-nul-in-fd",
  "preflight-exit-0-nonnumeric-fd",
  "preflight-exit-0-leading-zero-fd",
  "preflight-exit-0-negative-fd",
  "preflight-exit-0-unknown-field",
  "preflight-exit-0-fd-before-pid",
  "preflight-exit-0-fd-after-second-pid",
  "preflight-exit-0-duplicate-pid",
]) {
  test(`complete launcher treats ${lsofMode} as an indeterminate port query`, () => {
    const { result, events } = runFullLauncher({ lsofMode });

    assert.notEqual(
      result.status,
      0,
      `${combinedOutput(result)}\n${events.join("\n")}`,
    );
    assert.match(
      combinedOutput(result),
      /lsof failed or returned malformed output/,
    );
    assert.ok(!events.includes("start:api"));
    assert.ok(!events.includes("start:web"));
    assert.equal(
      events.filter((event) => event === apiPreflightLsofEvent).length,
      1,
      "the malformed API preflight query must execute exactly once",
    );
  });
}

for (const lsofMode of [
  "owned-query-exit-42",
  "owned-query-exit-1-stderr",
  "owned-query-exit-0-stderr",
  "owned-query-exit-0-empty",
  "owned-query-exit-0-malformed",
  "owned-query-exit-0-multiple",
  "owned-query-exit-0-nonnumeric",
  "owned-query-exit-0-zero-pid",
  "owned-query-exit-0-leading-zero-pid",
  "owned-query-wrong-exact-pid",
  "owned-query-exit-0-pid-only",
  "owned-query-exit-0-missing-final-newline",
  "owned-query-exit-0-terminal-nul",
  "owned-query-exit-0-nul-in-pid",
  "owned-query-exit-0-nul-in-fd",
  "owned-query-exit-0-nonnumeric-fd",
  "owned-query-exit-0-leading-zero-fd",
  "owned-query-exit-0-negative-fd",
  "owned-query-exit-0-unknown-field",
  "owned-query-exit-0-fd-before-pid",
  "owned-query-exit-0-fd-after-second-pid",
  "owned-query-exit-0-duplicate-pid",
]) {
  test(`complete launcher rejects ${lsofMode} from process_owns_port and cleans API`, () => {
    const { result, events, runtime } = runFullLauncher({ lsofMode });

    assert.notEqual(
      result.status,
      0,
      `${combinedOutput(result)}\n${events.join("\n")}`,
    );
    assert.match(
      combinedOutput(result),
      /lsof failed or returned malformed output/,
    );
    assert.ok(events.includes("start:api"));
    assert.ok(events.includes("term:api"));
    assert.ok(!events.includes("start:web"));
    assert.equal(runtime.api.alive, false);
    assert.equal(runtime.api.pidRecordExists, false);
    assert.equal(runtime.api.commandRecordExists, false);
    assert.equal(
      countApiOwnedLsofQueries(events),
      1,
      "the rejected API owned query must execute exactly once",
    );
  });
}

test("complete launcher hard-rejects a canonical occupied API preflight without starting or reusing it", () => {
  const { result, events } = runFullLauncher({
    lsofMode: "preflight-canonical-occupied",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /API port 4000 is already in use/);
  assert.doesNotMatch(
    combinedOutput(result),
    /lsof failed or returned malformed output/,
  );
  assert.equal(
    events.filter((event) => event === apiPreflightLsofEvent).length,
    1,
  );
  assert.equal(
    events.filter(
      (event) =>
        event ===
        "lsof:pid=:port=3000:fd=:args=-nP -iTCP:3000 -sTCP:LISTEN -Fp",
    ).length,
    0,
  );
  assert.ok(!events.includes("start:api"));
  assert.ok(!events.includes("start:web"));
  assert.ok(!events.some((event) => event.startsWith("open:")));
});

test("complete launcher rejects a listening port owned by the wrong PID and cleans API", () => {
  const { result, events, runtime } = runFullLauncher({
    lsofMode: "wrong-api-port-owner",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(
    combinedOutput(result),
    /port 4000 became occupied by a process not owned by this launch/,
  );
  assert.ok(events.includes("start:api"));
  assert.ok(events.includes("term:api"));
  assert.ok(!events.includes("start:web"));
  assert.equal(runtime.api.alive, false);
  assert.equal(runtime.api.pidRecordExists, false);
  assert.equal(runtime.api.commandRecordExists, false);
});

test("complete launcher cleans API when Web exits immediately after start", () => {
  const { result, events, runtime } = runFullLauncher({
    startMode: "web-exits",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(
    combinedOutput(result),
    /Web process PID .* exited before startup completed/,
  );
  assert.ok(events.includes("start:api"));
  assert.ok(events.includes("start:web"));
  assert.ok(events.includes("exit:web"));
  assert.ok(events.includes("term:api"));
  assert.equal(runtime.api.alive, false);
  assert.equal(runtime.web.alive, false);
  assert.equal(runtime.api.pidRecordExists, false);
  assert.equal(runtime.web.pidRecordExists, false);
});

test("complete launcher hard-fails an immediate API start failure and removes its records", () => {
  const { result, events, runtime } = runFullLauncher({
    startMode: "api-exits",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(
    combinedOutput(result),
    /API process PID .* exited before startup completed/,
  );
  assert.ok(events.includes("start:api"));
  assert.ok(events.includes("exit:api"));
  assert.ok(!events.includes("start:web"));
  assert.equal(runtime.api.alive, false);
  assert.equal(runtime.api.pidRecordExists, false);
  assert.equal(runtime.api.commandRecordExists, false);
});

test("complete launcher preserves API ownership records when API stays alive after TERM", () => {
  const { result, events, runtime } = runFullLauncher({
    curlMode: "web-fails",
    termMode: "api-stays-alive",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /API PID .* still running after TERM/);
  assert.match(combinedOutput(result), /Startup cleanup is incomplete/);
  assert.doesNotMatch(combinedOutput(result), /Startup complete/);
  assert.equal(runtime.web.alive, false);
  assert.equal(runtime.web.pidRecordExists, false);
  assert.equal(runtime.api.alive, true);
  assert.equal(runtime.api.pidRecordExists, true);
  assert.equal(runtime.api.commandRecordExists, true);
});

test("complete launcher cleans this launch's API and Web when Web readiness fails", () => {
  const { result, events, runtime } = runFullLauncher({
    curlMode: "web-fails",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /Web.*did not respond/);
  assert.ok(events.includes("start:api"));
  assert.ok(events.includes("start:web"));
  assert.ok(events.includes("term:web"));
  assert.ok(events.includes("term:api"));
  assert.equal(
    runtime.web.alive,
    false,
    "Web started by this launch must have exited",
  );
  assert.equal(
    runtime.api.alive,
    false,
    "API started by this launch must have exited",
  );
  assert.equal(runtime.web.pidRecordExists, false);
  assert.equal(runtime.web.commandRecordExists, false);
  assert.equal(runtime.api.pidRecordExists, false);
  assert.equal(runtime.api.commandRecordExists, false);
});

function functionBody(name, nextName) {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf(`${nextName}() {`, start);

  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("complete customer launcher process migrates after infrastructure and before builds and starts", () => {
  const { result, events } = runFullLauncher();
  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );

  const requiredOrder = [
    "pnpm:infra:up",
    "pnpm:db:generate",
    "pnpm:db:migrate:deploy",
    "pnpm:--filter @rehab-platform/api build",
    "pnpm:--filter @rehab-platform/web build",
    "start:api",
    "start:web",
  ];
  let previousIndex = -1;
  for (const event of requiredOrder) {
    const index = events.indexOf(event);
    assert.notEqual(index, -1, `missing full-process event: ${event}`);
    assert.ok(index > previousIndex, `${event} must follow the previous event`);
    previousIndex = index;
  }
  for (const event of ["pnpm:infra:up", "start:api", "start:web"]) {
    assert.equal(
      events.filter((candidate) => candidate === event).length,
      1,
      `${event} must execute exactly once`,
    );
  }
});

test("complete customer launcher process hard-fails fingerprint errors without stale build reuse", () => {
  const { result, events } = runFullLauncher({
    existingWebBuild: true,
    fingerprintMode: "fail",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /Web fingerprint.*失败/);
  assert.ok(events.includes("fingerprint:find:failed"));
  assert.ok(!events.includes("pnpm:--filter @rehab-platform/web build"));
  assert.ok(!events.includes("start:api"));
  assert.ok(!events.includes("start:web"));
});

test("complete customer launcher process checks Docker readiness once and hard-fails", () => {
  const { result, events } = runFullLauncher({
    dockerInfoMode: "first-fails-then-ready",
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /Docker Desktop 未运行.*请先手动启动/);
  assert.equal(events.filter((event) => event === "docker:info").length, 1);
  assert.ok(!events.some((event) => event === "open:-a Docker"));
  assert.ok(!events.includes("pnpm:infra:up"));
  assert.ok(!events.includes("start:api"));
  assert.ok(!events.includes("start:web"));
});

test("complete customer launcher process rejects whitespace-only POSTGRES_PASSWORD before Docker", () => {
  const { result, events } = runFullLauncher({
    overrides: { POSTGRES_PASSWORD: "   " },
  });

  assert.notEqual(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.match(combinedOutput(result), /POSTGRES_PASSWORD.*不得为空或纯空白/);
  assert.equal(events.length, 0);
});

for (const { name, value } of [
  { name: "COOKIE_SECURE", value: '"false' },
  { name: "COOKIE_SECURE", value: 'false"' },
  { name: "POSTGRES_PASSWORD", value: "'customer-password" },
  { name: "POSTGRES_PASSWORD", value: "customer-password'" },
  { name: "POSTGRES_PASSWORD", value: "\"customer-password'" },
]) {
  test(`complete customer launcher process rejects unpaired or mismatched quotes for ${name}=${JSON.stringify(value)}`, () => {
    const { result, events } = runFullLauncher({
      overrides: { [name]: value },
    });

    assert.notEqual(
      result.status,
      0,
      `${combinedOutput(result)}\n${events.join("\n")}`,
    );
    assert.match(
      combinedOutput(result),
      new RegExp(`${name}.*引号必须成对且类型一致`),
    );
    assert.equal(events.length, 0);
  });
}

test("complete customer launcher process unwraps one strictly paired quote set exactly", () => {
  const { result, events } = runFullLauncher({
    overrides: {
      COOKIE_SECURE: "'false'",
      POSTGRES_PASSWORD: '"quoted customer password"',
    },
  });

  assert.equal(
    result.status,
    0,
    `${combinedOutput(result)}\n${events.join("\n")}`,
  );
  assert.ok(events.includes("compose-password:quoted customer password"));
});

test("customer launcher always rebuilds the API before executing dist", () => {
  const buildCommand = "pnpm --filter @rehab-platform/api build";
  const startCommand = 'node "$ROOT_DIR/apps/api/dist/main.js"';
  const buildIndex = source.indexOf(buildCommand);
  const startIndex = source.indexOf(startCommand);

  assert.notEqual(buildIndex, -1, "API build command must exist");
  assert.notEqual(startIndex, -1, "API dist start command must exist");
  assert.ok(buildIndex < startIndex, "API must build before dist is started");
  assert.doesNotMatch(
    source,
    /if\s+\[\[\s+!\s+-f\s+"\$ROOT_DIR\/apps\/api\/dist\/main\.js"\s+\]\];\s+then[\s\S]*?@rehab-platform\/api build[\s\S]*?\nfi/,
    "an existing ignored dist must never bypass the API build",
  );
  assert.match(
    source,
    /if ! pnpm --filter @rehab-platform\/api build >>"\$START_LOG" 2>&1; then\s+fail "API build failed/,
    "API build failure must terminate startup visibly",
  );
});

test("customer launcher rejects occupied API and Web ports instead of reusing listeners", () => {
  const ensurePortBody = functionBody(
    "ensure_port_available",
    "wait_for_owned_port",
  );

  assert.match(ensurePortBody, /port_listening "\$port"/);
  assert.match(ensurePortBody, /fail "\$label port \$port is already in use/);
  assert.match(source, /ensure_port_available "\$API_PORT" "API"/);
  assert.match(source, /ensure_port_available "\$WEB_PORT" "Web"/);
  assert.doesNotMatch(source, /reusing existing process/i);
});

test("customer launcher accepts readiness only from the PID record it created", () => {
  const ownerBody = functionBody("process_owns_port", "ensure_port_available");
  const waitBody = functionBody("wait_for_owned_port", "wait_for_http");
  const queryStart = source.indexOf("query_port_owner() {");
  const queryEnd = source.indexOf("process_owns_port() {", queryStart);
  const queryBody = source.slice(queryStart, queryEnd);

  assert.match(
    queryBody,
    /lsof[^\n]*-a[^\n]*-p "\$requested_pid"[^\n]*-iTCP:"\$port"[^\n]*LISTEN[^\n]*-Fp/,
  );
  assert.match(queryBody, /parse_unique_lsof_pid "\$output_file"/);
  assert.match(ownerBody, /query_port_owner "\$port" "\$pid"/);
  assert.match(ownerBody, /"\$owner_pid" == "\$pid"/);
  assert.match(waitBody, /kill -0 "\$pid"/);
  assert.match(
    waitBody,
    /process_matches_expected "\$pid" "\$owner_record_file" "\$expected_cwd"/,
  );
  assert.match(waitBody, /process_owns_port "\$pid" "\$port"/);
  assert.match(
    waitBody,
    /fail "\$label process PID \$pid exited before startup completed/,
  );
  assert.match(
    source,
    /wait_for_owned_port "\$API_PORT" "API" "\$API_PID_FILE" "\$API_OWNER_RECORD_FILE" "\$ROOT_DIR"/,
  );
  assert.match(
    source,
    /wait_for_owned_port "\$WEB_PORT" "Web" "\$WEB_PID_FILE" "\$WEB_OWNER_RECORD_FILE" "\$ROOT_DIR\/apps\/web"/,
  );
});

test("customer launcher hard-fails API and Web build or start failures", () => {
  const startBody = functionBody("start_process", "hash_if_exists");

  assert.doesNotMatch(startBody, /already running[\s\S]*return 0/);
  assert.match(
    source,
    /if ! pnpm --filter @rehab-platform\/web build >>"\$START_LOG" 2>&1; then\s+fail "Web build failed/,
  );
  assert.match(
    source,
    /wait_for_http[^\n]*"\$API_PID_FILE" "\$API_OWNER_RECORD_FILE" "\$ROOT_DIR"/,
  );
  assert.match(
    source,
    /wait_for_http[^\n]*"\$WEB_PID_FILE" "\$WEB_OWNER_RECORD_FILE" "\$ROOT_DIR\/apps\/web"/,
  );
});

test("customer launcher validates project .env before prerequisites, containers, builds, starts, or ports", () => {
  const validationCall = source.indexOf("\nvalidate_customer_configuration\n");
  assert.notEqual(
    validationCall,
    -1,
    "configuration validation call must exist",
  );

  for (const operation of [
    "command_exists docker",
    "docker info",
    "pnpm infra:up",
    "pnpm --filter @rehab-platform/api build",
    'ensure_port_available "$API_PORT"',
    'start_process "API"',
  ]) {
    const operationIndex = source.indexOf(operation, validationCall);
    assert.notEqual(
      operationIndex,
      -1,
      `${operation} must exist after validation`,
    );
    assert.ok(
      validationCall < operationIndex,
      `configuration must be validated before ${operation}`,
    );
  }

  const result = runConfigurationPrefix({ writeEnv: false });
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /项目根目录缺少 \.env.*请创建/);
});

for (const name of [
  "COOKIE_SECURE",
  "PORT",
  "PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
  "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
  "DEFAULT_PATIENT_PASSWORD",
  "SENSITIVE_DATA_KEY_REF",
  "SENSITIVE_DATA_KEY",
  "POSTGRES_PASSWORD",
]) {
  test(`customer launcher hard-fails a missing ${name} with an actionable Chinese error`, () => {
    const result = runConfigurationPrefix({ omitted: [name] });
    assert.notEqual(result.status, 0);
    assert.match(combinedOutput(result), new RegExp(`${name}.*请.*\\.env`));
  });
}

for (const value of ["", "TRUE", "False", "1", "true "]) {
  test(`customer launcher rejects non-exact COOKIE_SECURE=${JSON.stringify(value)}`, () => {
    const result = runConfigurationPrefix({
      overrides: { COOKIE_SECURE: value },
    });
    assert.notEqual(result.status, 0);
    assert.match(
      combinedOutput(result),
      /COOKIE_SECURE.*精确填写 COOKIE_SECURE=true 或 COOKIE_SECURE=false/,
    );
  });
}

for (const name of [
  "PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
  "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
]) {
  for (const value of [
    "",
    "0",
    "01",
    "-1",
    "+1",
    "1.5",
    "1e3",
    "9007199254740992",
  ]) {
    test(`customer launcher rejects ${name}=${JSON.stringify(value)} as a base-10 positive safe integer`, () => {
      const result = runConfigurationPrefix({ overrides: { [name]: value } });
      assert.notEqual(result.status, 0);
      assert.match(
        combinedOutput(result),
        new RegExp(`${name}.*base-10 正安全整数`),
      );
    });
  }
}

for (const value of ["0", "3000", "65536", "4000x"]) {
  test(`customer launcher rejects invalid API PORT=${JSON.stringify(value)}`, () => {
    const result = runConfigurationPrefix({ overrides: { PORT: value } });
    assert.notEqual(result.status, 0);
    assert.match(combinedOutput(result), /PORT.*(无效|冲突)/);
  });
}

for (const value of ["1234567", "x".repeat(129)]) {
  test(`customer launcher rejects invalid DEFAULT_PATIENT_PASSWORD length`, () => {
    const result = runConfigurationPrefix({
      overrides: { DEFAULT_PATIENT_PASSWORD: value },
    });
    assert.notEqual(result.status, 0);
    assert.match(
      combinedOutput(result),
      /DEFAULT_PATIENT_PASSWORD.*8 到 128 位/,
    );
  });
}

for (const value of ["", " leading-key-ref", "trailing-key-ref "]) {
  test(`customer launcher rejects non-exact SENSITIVE_DATA_KEY_REF=${JSON.stringify(value)}`, () => {
    const result = runConfigurationPrefix({
      overrides: { SENSITIVE_DATA_KEY_REF: value },
    });
    assert.notEqual(result.status, 0);
    assert.match(
      combinedOutput(result),
      /SENSITIVE_DATA_KEY_REF.*非空且没有首尾空格/,
    );
  });
}

for (const value of [
  "",
  Buffer.alloc(31, 7).toString("base64"),
  Buffer.alloc(32, 7).toString("base64").replace(/=$/, ""),
  `${Buffer.alloc(32, 0).toString("base64").slice(0, -2)}B=`,
]) {
  test(`customer launcher rejects non-canonical 32-byte SENSITIVE_DATA_KEY=${JSON.stringify(value)}`, () => {
    const result = runConfigurationPrefix({
      overrides: { SENSITIVE_DATA_KEY: value },
    });
    assert.notEqual(result.status, 0);
    assert.match(
      combinedOutput(result),
      /SENSITIVE_DATA_KEY.*canonical base64.*32 bytes/,
    );
  });
}

test("customer launcher accepts and exports only the explicit hard configuration contract", () => {
  const result = runConfigurationPrefix();
  assert.equal(result.status, 0, combinedOutput(result));

  for (const name of Object.keys(validCustomerEnv)) {
    assert.match(source, new RegExp(`export ${name}(?:=|\\n)`));
  }

  const configurationBlock = source.slice(
    source.indexOf("read_env_value() {"),
    source.indexOf("port_listening() {"),
  );
  assert.doesNotMatch(configurationBlock, /\.env\.example/);
  assert.doesNotMatch(configurationBlock, /\|\|\s*true/);
  assert.doesNotMatch(configurationBlock, /\$\{[^}]+:-/);
  assert.doesNotMatch(configurationBlock, /fallback|legacy|兼容|兜底/i);
  assert.doesNotMatch(configurationBlock, />>?\s*"?\$ROOT_DIR\/\.env/);
});

test("README documents direct customer Mac startup hard configuration without inference", () => {
  assert.match(readme, /## 客户 Mac 一键启动/);
  assert.match(readme, /一键启动康复平台\.command/);
  for (const name of Object.keys(validCustomerEnv)) {
    assert.match(readme, new RegExp(`\\b${name}\\b`));
  }
  assert.match(readme, /本地 HTTP.*COOKIE_SECURE=false/);
  assert.match(readme, /不会.*默认值|不会.*推断/);
});
