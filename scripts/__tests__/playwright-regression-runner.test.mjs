import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolvePlaywrightRegressionEnvironment } from "../playwright-regression-environment.mjs";
import {
  cleanPlaywrightRegressionArtifacts,
  playwrightBusinessProjects,
  playwrightRegressionCommands,
  runPlaywrightRegression,
} from "../run-playwright-regression.mjs";

function validEnvironment() {
  return {
    PLAYWRIGHT_DATABASE_URL:
      "postgresql://regression:secret@127.0.0.1:5432/rehab_playwright_test",
    PLAYWRIGHT_CONFIRM_DISPOSABLE: "YES",
    PLAYWRIGHT_WEB_PORT: "3100",
    PLAYWRIGHT_API_PORT: "4100",
    PLAYWRIGHT_JWT_SECRET:
      "playwright-regression-jwt-secret-with-at-least-32-bytes",
    PLAYWRIGHT_COOKIE_SECURE: "false",
    PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT: "100",
    PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: "60000",
    PLAYWRIGHT_SENSITIVE_DATA_KEY_REF: "regression://playwright/key-v1",
    PLAYWRIGHT_SENSITIVE_DATA_KEY: Buffer.alloc(32, 12).toString("base64"),
    PLAYWRIGHT_SEED_PASSWORD: "Playwright-Seed-253913!",
    PLAYWRIGHT_ACCOUNT_PASSWORD: "Playwright-Final-253913!",
  };
}

test("rejects every missing input before resetting the database", () => {
  for (const name of Object.keys(validEnvironment())) {
    const env = validEnvironment();
    delete env[name];
    const calls = [];
    const cleanups = [];
    assert.throws(() =>
      runPlaywrightRegression(
        env,
        (entry) => calls.push(entry),
        () => cleanups.push("clean"),
      ),
    );
    assert.deepEqual(calls, [], name);
    assert.deepEqual(cleanups, [], name);
  }
});

test("requires the dedicated whole database and exact disposable confirmation", () => {
  assert.throws(
    () =>
      resolvePlaywrightRegressionEnvironment({
        ...validEnvironment(),
        PLAYWRIGHT_DATABASE_URL:
          "postgresql://regression:secret@127.0.0.1:5432/project_database",
      }),
    /database name must be rehab_playwright_test/,
  );
  assert.throws(
    () =>
      resolvePlaywrightRegressionEnvironment({
        ...validEnvironment(),
        PLAYWRIGHT_CONFIRM_DISPOSABLE: "true",
      }),
    /PLAYWRIGHT_CONFIRM_DISPOSABLE=YES/,
  );
});

test("requires distinct policy-valid seed and final passwords", () => {
  assert.throws(
    () =>
      resolvePlaywrightRegressionEnvironment({
        ...validEnvironment(),
        PLAYWRIGHT_SEED_PASSWORD: "short",
      }),
    /between 8 and 128/,
  );
  assert.throws(
    () =>
      resolvePlaywrightRegressionEnvironment({
        ...validEnvironment(),
        PLAYWRIGHT_ACCOUNT_PASSWORD:
          validEnvironment().PLAYWRIGHT_SEED_PASSWORD,
      }),
    /must differ/,
  );
});

test("builds once and runs every browser project from an isolated reset and encrypted seed", () => {
  const resetCommand =
    "--filter @rehab-platform/db exec prisma migrate reset --force --skip-seed";
  const seedCommand = "--filter @rehab-platform/db exec tsx prisma/seed.ts";
  assert.deepEqual(
    playwrightRegressionCommands.map(({ args }) => args.join(" ")),
    [
      "--filter @rehab-platform/web build",
      "--filter @rehab-platform/db build",
      ...playwrightBusinessProjects.flatMap((project) => [
        resetCommand,
        seedCommand,
        `exec playwright test --config scripts/playwright-regression.config.mjs --project ${project}`,
      ]),
    ],
  );
  assert.equal(
    playwrightRegressionCommands.filter(({ args }) =>
      args.includes("playwright"),
    ).length,
    playwrightBusinessProjects.length,
  );
  for (const [index, project] of playwrightBusinessProjects.entries()) {
    const projectCommandIndex = 4 + index * 3;
    assert.equal(
      playwrightRegressionCommands[projectCommandIndex - 2].args.join(" "),
      resetCommand,
    );
    assert.equal(
      playwrightRegressionCommands[projectCommandIndex - 1].args.join(" "),
      seedCommand,
    );
    assert.deepEqual(
      playwrightRegressionCommands[projectCommandIndex].args.slice(-2),
      ["--project", project],
    );
    assert.equal(
      playwrightRegressionCommands[projectCommandIndex].args.includes(
        "--no-deps",
      ),
      false,
    );
  }
  const events = [];
  runPlaywrightRegression(
    validEnvironment(),
    (entry, childEnv) => {
      events.push(entry);
      assert.equal(
        childEnv.DATABASE_URL,
        validEnvironment().PLAYWRIGHT_DATABASE_URL,
      );
      assert.equal(
        childEnv.DEFAULT_PATIENT_PASSWORD,
        validEnvironment().PLAYWRIGHT_SEED_PASSWORD,
      );
      assert.equal(childEnv.NEXT_PUBLIC_API_BASE_URL, "http://127.0.0.1:4100");
    },
    () => events.push("clean"),
  );
  assert.deepEqual(events, ["clean", ...playwrightRegressionCommands]);
});

test("stops on the first failed command", () => {
  const calls = [];
  assert.throws(
    () =>
      runPlaywrightRegression(
        validEnvironment(),
        (entry) => {
          calls.push(entry);
          if (calls.length === 2) throw new Error("build failed");
        },
        () => {},
      ),
    /build failed/,
  );
  assert.deepEqual(calls, playwrightRegressionCommands.slice(0, 2));
});

test("does not run database commands when artifact cleanup fails", () => {
  const calls = [];
  assert.throws(
    () =>
      runPlaywrightRegression(
        validEnvironment(),
        (entry) => calls.push(entry),
        () => {
          throw new Error("artifact cleanup failed");
        },
      ),
    /artifact cleanup failed/,
  );
  assert.deepEqual(calls, []);
});

test("cleans only runner-managed screenshots and Playwright results", (t) => {
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "rehab-playwright-output-"),
  );
  t.after(() => rmSync(outputDirectory, { force: true, recursive: true }));
  mkdirSync(join(outputDirectory, "test-results", "failed-case"), {
    recursive: true,
  });
  writeFileSync(join(outputDirectory, "test-results", ".last-run.json"), "{}");
  writeFileSync(
    join(outputDirectory, "test-results", "failed-case", "trace.zip"),
    "trace",
  );
  writeFileSync(
    join(outputDirectory, "web-regression-shell-chromium-1280.png"),
    "current",
  );
  writeFileSync(join(outputDirectory, "web-regression-shell.png"), "legacy");
  writeFileSync(
    join(outputDirectory, "patient-consent-current-version.png"),
    "keep",
  );

  cleanPlaywrightRegressionArtifacts(outputDirectory);

  assert.equal(existsSync(join(outputDirectory, "test-results")), false);
  assert.equal(
    existsSync(join(outputDirectory, "web-regression-shell-chromium-1280.png")),
    false,
  );
  assert.equal(
    existsSync(join(outputDirectory, "web-regression-shell.png")),
    false,
  );
  assert.equal(
    existsSync(join(outputDirectory, "patient-consent-current-version.png")),
    true,
  );
});
