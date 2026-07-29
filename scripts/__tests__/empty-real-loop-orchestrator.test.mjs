import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  buildEmptyRealLoopCommands,
  validateEmptyRealLoopOrchestratorConfig,
  verifyEmptyRealLoopOrchestrator,
} from "../verify-empty-real-loop-orchestrator.mjs";

const execFileAsync = promisify(execFile);

function validConfig(overrides = {}) {
  return deepMerge(
    {
      documentVersion: "empty-real-loop-orchestrator/v1",
      acceptance: {
        customerName: "康复中心",
        acceptedAt: "2026-05-30T10:00:00.000Z",
        testerName: "现场验收员",
        environment: "trial",
      },
      productionGate: {
        customerInputPath: "evidence/customer-production-input.json",
      },
      trialEmptyLoop: {
        required: true,
      },
      formalAcceptanceChain: {
        requiredForLaunch: true,
        chainConfigPath: "evidence/formal-chain/formal-acceptance-chain.json",
      },
      ad8CaregiverInterview: {
        requiredForLaunch: true,
        acceptanceConfigPath:
          "evidence/assessments/ad8-caregiver-interview.acceptance.json",
      },
      aiSpeechTts: {
        aiRequiredForLaunch: true,
        speechRequiredForLaunch: true,
        ttsRequiredForLaunch: true,
        speechAiAssessmentConfigPath:
          "evidence/ai-speech/speech-ai-assessment.acceptance.json",
        speechTranscriptEvidencePath:
          "evidence/ai-speech/speech-transcript.evidence.json",
        speechTranscriptAcceptanceConfigPath:
          "evidence/ai-speech/speech-transcript.acceptance.json",
        ttsEvidencePath: "evidence/ai-speech/tts-speech-output.evidence.json",
        ttsAcceptanceConfigPath:
          "evidence/ai-speech/tts-speech-output.acceptance.json",
        aiAssessmentAcceptanceConfigPath:
          "evidence/ai-speech/ai-assessment.acceptance.json",
      },
      unity: {
        requiredForLaunch: true,
        evidencePath: "evidence/unity/unity-field.evidence.json",
        apiBaseUrl: "https://api.customer-health.cn",
        patientAccount: "unity.patient@customer-health.cn",
        patientPassword: "UnityPatient!2026",
        auditAccount: "unity.audit@customer-health.cn",
        auditPassword: "UnityAudit!2026",
      },
      browserPose: {
        requiredForLaunch: true,
        evidencePath: "evidence/browser-pose/browser-pose.evidence.json",
        apiBaseUrl: "https://api.customer-health.cn",
        patientAccount: "browser.patient@customer-health.cn",
        patientPassword: "BrowserPatient!2026",
        auditAccount: "browser.audit@customer-health.cn",
        auditPassword: "BrowserAudit!2026",
      },
      caregiverAudit: {
        required: true,
        localContractsRequired: true,
        evidenceNotes:
          "家属摘要脱敏、完整训练记录拒绝、撤权阻断、审计反查均已纳入本次验收。",
      },
    },
    overrides,
  );
}

test("empty real loop orchestrator accepts complete formal acceptance config", () => {
  const result = validateEmptyRealLoopOrchestratorConfig(validConfig());

  assert.deepEqual(result.failures, []);
});

test("empty real loop orchestrator builds field commands without legacy token CLI", () => {
  const commandItems = buildEmptyRealLoopCommands(validConfig());
  const commands = commandItems.map((item) =>
    [item.command, ...item.args].join(" "),
  );

  assert.deepEqual(commands, [
    "pnpm delivery:check:production -- --customer-input evidence/customer-production-input.json",
    "pnpm verify:trial-empty-loop",
    "pnpm verify:formal-acceptance-chain -- evidence/formal-chain/formal-acceptance-chain.json",
    "pnpm verify:ad8-caregiver-interview-acceptance -- evidence/assessments/ad8-caregiver-interview.acceptance.json",
    "pnpm verify:ai-assessment-acceptance -- evidence/ai-speech/ai-assessment.acceptance.json",
    "pnpm verify:speech-transcript-evidence -- evidence/ai-speech/speech-transcript.evidence.json",
    "pnpm verify:speech-transcript-acceptance -- evidence/ai-speech/speech-transcript.acceptance.json",
    "pnpm verify:speech-ai-assessment-acceptance -- evidence/ai-speech/speech-ai-assessment.acceptance.json",
    "pnpm verify:tts-speech-output-evidence -- evidence/ai-speech/tts-speech-output.evidence.json",
    "pnpm verify:tts-speech-output-acceptance -- evidence/ai-speech/tts-speech-output.acceptance.json",
    "pnpm verify:unity-field-evidence -- evidence/unity/unity-field.evidence.json",
    "pnpm verify:unity-field-acceptance -- evidence/unity/unity-field.evidence.json --api-base-url https://api.customer-health.cn",
    "pnpm verify:browser-pose-evidence -- evidence/browser-pose/browser-pose.evidence.json",
    "pnpm verify:browser-pose-field-acceptance -- evidence/browser-pose/browser-pose.evidence.json --api-base-url https://api.customer-health.cn",
    "pnpm verify:contracts",
  ]);

  const unity = commandItems.find(
    (item) => item.label === "Unity WebGL 现场只读验真",
  );
  const browser = commandItems.find(
    (item) => item.label === "浏览器体感现场只读验真",
  );
  assert.deepEqual(unity.env, {
    UNITY_FIELD_PATIENT_ACCOUNT: "unity.patient@customer-health.cn",
    UNITY_FIELD_PATIENT_PASSWORD: "UnityPatient!2026",
    UNITY_FIELD_AUDIT_ACCOUNT: "unity.audit@customer-health.cn",
    UNITY_FIELD_AUDIT_PASSWORD: "UnityAudit!2026",
  });
  assert.deepEqual(browser.env, {
    BROWSER_POSE_PATIENT_ACCOUNT: "browser.patient@customer-health.cn",
    BROWSER_POSE_PATIENT_PASSWORD: "BrowserPatient!2026",
    BROWSER_POSE_AUDIT_ACCOUNT: "browser.audit@customer-health.cn",
    BROWSER_POSE_AUDIT_PASSWORD: "BrowserAudit!2026",
  });
  assert.ok(
    commandItems
      .filter((item) => item !== unity && item !== browser)
      .every((item) => item.env === undefined),
  );
  assert.doesNotMatch(
    JSON.stringify(commandItems),
    /readCredentialsPath|read-credentials|patientReadTokenRef|auditReadTokenRef|patient-token-ref|audit-token-ref/,
  );
});

test("field acceptance documentation matches explicit credential and environment boundaries", () => {
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const documentationPaths = [
    "README.md",
    "apps/api/README.md",
    "docs/customer-input-to-launch-gate-runbook.md",
    "docs/formal-training-content-runbook.md",
    "docs/customer-docx-coverage-matrix.md",
  ];
  const documentation = Object.fromEntries(
    documentationPaths.map((path) => [
      path,
      readFileSync(resolve(repositoryRoot, path), "utf8"),
    ]),
  );
  const combinedDocumentation = Object.values(documentation).join("\n");

  assert.doesNotMatch(
    combinedDocumentation,
    /--read-credentials|--patient-token(?:-ref)?|--audit-token(?:-ref)?/,
  );
  for (const environmentName of [
    "BROWSER_POSE_PATIENT_ACCOUNT",
    "BROWSER_POSE_PATIENT_PASSWORD",
    "BROWSER_POSE_AUDIT_ACCOUNT",
    "BROWSER_POSE_AUDIT_PASSWORD",
    "UNITY_FIELD_PATIENT_ACCOUNT",
    "UNITY_FIELD_PATIENT_PASSWORD",
    "UNITY_FIELD_AUDIT_ACCOUNT",
    "UNITY_FIELD_AUDIT_PASSWORD",
  ]) {
    assert.match(combinedDocumentation, new RegExp(environmentName));
  }

  const rootReadme = documentation["README.md"];
  assert.match(
    rootReadme,
    /首个[^。]*delivery:check:production[^。]*读取[^。]*根目录[^。]*\.env/,
  );
  assert.match(
    rootReadme,
    /field[^。]*账号密码[^。]*显式[^。]*总编排配置[^。]*不从[^。]*\.env[^。]*父进程继承/i,
  );
});

test("empty real loop orchestrator rejects missing formal acceptance chain config when launch scope is true", () => {
  const result = validateEmptyRealLoopOrchestratorConfig(
    validConfig({
      formalAcceptanceChain: {
        requiredForLaunch: true,
        chainConfigPath: "",
      },
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /formalAcceptanceChain\.chainConfigPath/,
  );
});

test("empty real loop orchestrator rejects missing AD-8 caregiver interview acceptance config when launch scope is true", () => {
  const result = validateEmptyRealLoopOrchestratorConfig(
    validConfig({
      ad8CaregiverInterview: {
        requiredForLaunch: true,
        acceptanceConfigPath: "",
      },
    }),
  );

  assert.match(
    result.failures.join("\n"),
    /ad8CaregiverInterview\.acceptanceConfigPath/,
  );
});

test("empty real loop orchestrator requires all eight explicit field credentials before commands run", async () => {
  const credentialFields = [
    ["unity", "patientAccount"],
    ["unity", "patientPassword"],
    ["unity", "auditAccount"],
    ["unity", "auditPassword"],
    ["browserPose", "patientAccount"],
    ["browserPose", "patientPassword"],
    ["browserPose", "auditAccount"],
    ["browserPose", "auditPassword"],
  ];

  for (const [scope, field] of credentialFields) {
    const calls = [];
    const result = await verifyEmptyRealLoopOrchestrator(
      validConfig({ [scope]: { [field]: "" } }),
      {
        runCommand: async (command) => {
          calls.push(command);
          return { status: 0 };
        },
      },
    );

    assert.deepEqual(calls, [], `${scope}.${field} 缺失时不得启动子进程`);
    assert.match(result.failures.join("\n"), new RegExp(`${scope}\\.${field}`));
  }
});

test("empty real loop orchestrator rejects shared Browser and Unity accounts", () => {
  const config = validConfig({
    browserPose: {
      patientAccount: "unity.patient@customer-health.cn",
      auditAccount: "unity.audit@customer-health.cn",
    },
  });
  const result = validateEmptyRealLoopOrchestratorConfig(config);

  assert.match(result.failures.join("\n"), /Browser.*Unity.*账号.*不同/);
});

test("empty real loop orchestrator rejects legacy field credential config instead of ignoring it", async () => {
  const config = validConfig({
    fieldAcceptance: {
      readCredentialsPath: "evidence/field-read-credentials.json",
    },
    unity: {
      patientReadTokenRef: "secret-manager://rehab/unity-patient-read",
      auditReadTokenRef: "secret-manager://rehab/unity-audit-read",
    },
    browserPose: {
      patientReadTokenRef: "secret-manager://rehab/browser-patient-read",
      auditReadTokenRef: "secret-manager://rehab/browser-audit-read",
    },
  });
  const calls = [];

  const result = await verifyEmptyRealLoopOrchestrator(config, {
    runCommand: async (command) => {
      calls.push(command);
      return { status: 0 };
    },
  });

  assert.deepEqual(calls, []);
  assert.match(result.failures.join("\n"), /不支持的配置字段/);
});

test("empty real loop orchestrator rejects missing AI, speech, and TTS acceptance files when launch scope is true", () => {
  const result = validateEmptyRealLoopOrchestratorConfig(
    validConfig({
      aiSpeechTts: {
        aiRequiredForLaunch: true,
        speechRequiredForLaunch: true,
        ttsRequiredForLaunch: true,
        speechAiAssessmentConfigPath: "",
        speechTranscriptEvidencePath: "",
        speechTranscriptAcceptanceConfigPath: "",
        ttsEvidencePath: "",
        ttsAcceptanceConfigPath: "",
        aiAssessmentAcceptanceConfigPath: "",
      },
    }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /aiAssessmentAcceptanceConfigPath/);
  assert.match(failures, /speechTranscriptEvidencePath/);
  assert.match(failures, /speechAiAssessmentConfigPath/);
  assert.match(failures, /ttsEvidencePath/);
  assert.match(failures, /ttsAcceptanceConfigPath/);
});

test("empty real loop orchestrator requires Unity, caregiver, and audit evidence gates", () => {
  const result = validateEmptyRealLoopOrchestratorConfig(
    validConfig({
      unity: {
        requiredForLaunch: true,
        evidencePath: "",
        apiBaseUrl: "",
        patientAccount: "",
        patientPassword: "",
        auditAccount: "",
        auditPassword: "",
      },
      caregiverAudit: {
        required: false,
        localContractsRequired: false,
      },
    }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /unity\.evidencePath/);
  assert.match(failures, /unity\.apiBaseUrl/);
  assert.match(failures, /caregiverAudit\.required/);
  assert.match(failures, /caregiverAudit\.localContractsRequired/);
});

test("empty real loop orchestrator rejects placeholders, fallback markers, and raw tokens", () => {
  const result = validateEmptyRealLoopOrchestratorConfig(
    validConfig({
      unity: {
        apiBaseUrl: "https://fallback.customer-health.cn",
      },
      browserPose: {
        evidencePath: "evidence/<browser-pose-evidence>.json",
      },
      caregiverAudit: {
        evidenceNotes: "Bearer raw-secret-token",
      },
    }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /mock\/demo\/seed\/fallback\/fixed\/manual/);
  assert.match(failures, /占位符/);
  assert.match(failures, /敏感字段或原始载荷/);
});

test("empty real loop orchestrator executes commands in order and stops on first failure", async () => {
  const calls = [];
  const result = await verifyEmptyRealLoopOrchestrator(validConfig(), {
    runCommand: async (command) => {
      calls.push(command.label);
      if (command.label === "AI 评估正式验收") {
        return { status: 1 };
      }
      return { status: 0 };
    },
  });

  assert.deepEqual(calls, [
    "生产配置门禁",
    "空库最小业务闭环",
    "正式业务链只读验真",
    "AD-8 照护者访谈正式验收",
    "AI 评估正式验收",
  ]);
  assert.match(result.failures.join("\n"), /AI 评估正式验收/);
});

test("empty real loop orchestrator writes a sanitized acceptance report when explicitly requested", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empty-real-loop-report-"));
  const reportPath = join(dir, "acceptance-report.json");
  const result = await verifyEmptyRealLoopOrchestrator(validConfig(), {
    reportOutputPath: reportPath,
    now: fixedClock(),
    runCommand: async () => ({ status: 0 }),
  });

  assert.deepEqual(result.failures, []);
  const report = JSON.parse(await readFile(reportPath, "utf8"));

  assert.equal(report.documentVersion, "empty-real-loop-acceptance-report/v1");
  assert.equal(report.status, "PASSED");
  assert.equal(report.summary.totalSteps, 15);
  assert.equal(report.summary.passedSteps, 15);
  assert.equal(report.summary.blockedSteps, 0);
  assert.equal(report.steps.length, 15);
  assert.ok(report.steps.every((step) => step.status === "PASSED"));
  assert.ok(report.steps.every((step) => typeof step.label === "string"));
  assert.ok(report.steps.every((step) => typeof step.startedAt === "string"));
  assert.ok(report.steps.every((step) => typeof step.endedAt === "string"));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /secret-manager:\/\//);
  assert.doesNotMatch(
    serialized,
    /Bearer|token|rawPayload|requestBody|responseBody/i,
  );
});

test("empty real loop orchestrator writes a BLOCKED report and leaves later steps unrun on failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empty-real-loop-blocked-report-"));
  const reportPath = join(dir, "acceptance-report.json");
  const calls = [];
  const result = await verifyEmptyRealLoopOrchestrator(validConfig(), {
    reportOutputPath: reportPath,
    now: fixedClock(),
    runCommand: async (command) => {
      calls.push(command.label);
      if (command.label === "AI 评估正式验收") {
        return { status: 1 };
      }
      return { status: 0 };
    },
  });

  assert.match(result.failures.join("\n"), /AI 评估正式验收/);
  assert.deepEqual(calls, [
    "生产配置门禁",
    "空库最小业务闭环",
    "正式业务链只读验真",
    "AD-8 照护者访谈正式验收",
    "AI 评估正式验收",
  ]);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.summary.passedSteps, 4);
  assert.equal(report.summary.blockedSteps, 1);
  assert.equal(report.summary.notRunSteps, 10);
  assert.equal(report.steps[4].status, "BLOCKED");
  assert.ok(report.steps.slice(5).every((step) => step.status === "NOT_RUN"));
});

test("empty real loop orchestrator writes a sanitized BLOCKED report for config validation failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empty-real-loop-config-report-"));
  const reportPath = join(dir, "acceptance-report.json");
  const calls = [];
  const result = await verifyEmptyRealLoopOrchestrator(
    validConfig({
      browserPose: {
        requiredForLaunch: true,
        evidencePath: "evidence/<browser-pose-evidence>.json",
        apiBaseUrl: "https://api.customer-health.cn",
        patientAccount: "browser.patient@customer-health.cn",
        patientPassword: "BrowserPatient!2026",
        auditAccount: "browser.audit@customer-health.cn",
        auditPassword: "BrowserAudit!2026",
      },
      caregiverAudit: {
        evidenceNotes: "Bearer raw-secret-token",
      },
    }),
    {
      reportOutputPath: reportPath,
      now: fixedClock(),
      runCommand: async (command) => {
        calls.push(command.label);
        return { status: 0 };
      },
    },
  );

  assert.deepEqual(calls, []);
  assert.match(result.failures.join("\n"), /占位符|敏感字段或原始载荷/);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.summary.totalSteps, 0);
  assert.equal(report.summary.passedSteps, 0);
  assert.equal(report.summary.blockedSteps, 1);
  assert.equal(report.summary.notRunSteps, 0);
  assert.deepEqual(report.steps, []);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /Bearer raw-secret-token/);
  assert.doesNotMatch(serialized, /secret-manager:\/\//);
  assert.doesNotMatch(serialized, /browser-pose-evidence/);
});

test("empty real loop orchestrator rejects unsafe report output paths before running commands", async () => {
  const calls = [];
  const result = await verifyEmptyRealLoopOrchestrator(validConfig(), {
    reportOutputPath: "reports/<acceptance-report>.json",
    runCommand: async (command) => {
      calls.push(command.label);
      return { status: 0 };
    },
  });

  assert.deepEqual(calls, []);
  assert.match(result.failures.join("\n"), /reportOutputPath/);
  assert.match(result.failures.join("\n"), /占位符/);
});

test("empty real loop orchestrator source does not introduce fallback behavior", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../verify-empty-real-loop-orchestrator.mjs"),
    "utf8",
  );

  assert.doesNotMatch(source, /fallback/i);
  assert.doesNotMatch(source, /mock/i);
  assert.doesNotMatch(
    source,
    /readCredentialsPath|read-credentials|patientReadTokenRef|auditReadTokenRef|patient-token-ref|audit-token-ref/,
  );
  assert.match(source, /PATH:\s*executablePath/);
  assert.match(source, /\.\.\.item\.env/);
  assert.doesNotMatch(source, /\.\.\.process\.env/);
  assert.match(source, /verify:trial-empty-loop/);
  assert.match(source, /verify:formal-acceptance-chain/);
  assert.match(source, /verify:ad8-caregiver-interview-acceptance/);
  assert.match(source, /verify:speech-ai-assessment-acceptance/);
  assert.match(source, /verify:unity-field-acceptance/);
  assert.match(source, /verify:contracts/);
});

test("empty real loop orchestrator module can be imported without CLI argv", async () => {
  const moduleUrl = new URL(
    "../verify-empty-real-loop-orchestrator.mjs",
    import.meta.url,
  );
  const imported = await import(`${moduleUrl.href}?import-check=${Date.now()}`);

  assert.equal(
    typeof imported.validateEmptyRealLoopOrchestratorConfig,
    "function",
  );
});

test("empty real loop orchestrator CLI parses explicit report output path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empty-real-loop-cli-report-"));
  const configPath = join(dir, "orchestrator.json");
  const reportPath = join(dir, "report.json");
  await writeFile(configPath, JSON.stringify(validConfig(), null, 2));
  const fakeBinDir = join(dir, "bin");
  const fakePnpmPath = join(fakeBinDir, "pnpm");
  const childEnvLogPath = join(dir, "child-env.log");
  await mkdir(fakeBinDir, { recursive: true });
  await writeFile(
    fakePnpmPath,
    `#!/bin/sh\nprintf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\\n' "$*" "$UNITY_FIELD_PATIENT_ACCOUNT" "$UNITY_FIELD_PATIENT_PASSWORD" "$UNITY_FIELD_AUDIT_ACCOUNT" "$UNITY_FIELD_AUDIT_PASSWORD" "$BROWSER_POSE_PATIENT_ACCOUNT" "$BROWSER_POSE_PATIENT_PASSWORD" "$BROWSER_POSE_AUDIT_ACCOUNT" "$BROWSER_POSE_AUDIT_PASSWORD" "$PARENT_RUNTIME_SETTING" >> "${childEnvLogPath}"\nexit 0\n`,
  );
  await chmod(fakePnpmPath, 0o755);

  const { stdout } = await execFileAsync(
    "node",
    [
      "scripts/verify-empty-real-loop-orchestrator.mjs",
      configPath,
      "--report-output",
      reportPath,
    ],
    {
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        PARENT_RUNTIME_SETTING: "required-by-non-field",
        UNITY_FIELD_PATIENT_ACCOUNT: "must-not-be-inherited",
        BROWSER_POSE_PATIENT_ACCOUNT: "must-not-be-inherited",
      },
    },
  );

  assert.match(stdout, /新库真实总闭环验收编排通过/);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.status, "PASSED");
  const childCalls = (await readFile(childEnvLogPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => line.split("|"));
  const unityCall = childCalls.find(([args]) =>
    args.startsWith("verify:unity-field-acceptance "),
  );
  const browserCall = childCalls.find(([args]) =>
    args.startsWith("verify:browser-pose-field-acceptance "),
  );
  assert.equal(unityCall.at(-1), "");
  assert.equal(browserCall.at(-1), "");
  assert.ok(
    childCalls
      .filter((call) => call !== unityCall && call !== browserCall)
      .every(
        (parts) =>
          parts.slice(1, 9).every((value) => value === "") &&
          parts.at(-1) === "required-by-non-field",
      ),
  );
  assert.deepEqual(unityCall.slice(1, 9), [
    "unity.patient@customer-health.cn",
    "UnityPatient!2026",
    "unity.audit@customer-health.cn",
    "UnityAudit!2026",
    "",
    "",
    "",
    "",
  ]);
  assert.deepEqual(browserCall.slice(1, 9), [
    "",
    "",
    "",
    "",
    "browser.patient@customer-health.cn",
    "BrowserPatient!2026",
    "browser.audit@customer-health.cn",
    "BrowserAudit!2026",
  ]);
});

test("empty real loop orchestrator CLI rejects missing report output value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empty-real-loop-cli-bad-report-"));
  const configPath = join(dir, "orchestrator.json");
  await writeFile(configPath, JSON.stringify(validConfig(), null, 2));

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-empty-real-loop-orchestrator.mjs",
        configPath,
        "--report-output",
      ]),
    (error) => {
      assert.match(error.stderr, /--report-output 必须提供报告输出路径/);
      return true;
    },
  );
});

function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides))
    return overrides ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fixedClock() {
  const times = [
    "2026-05-30T10:00:00.000Z",
    "2026-05-30T10:00:01.000Z",
    "2026-05-30T10:00:02.000Z",
    "2026-05-30T10:00:03.000Z",
    "2026-05-30T10:00:04.000Z",
    "2026-05-30T10:00:05.000Z",
    "2026-05-30T10:00:06.000Z",
    "2026-05-30T10:00:07.000Z",
    "2026-05-30T10:00:08.000Z",
    "2026-05-30T10:00:09.000Z",
    "2026-05-30T10:00:10.000Z",
    "2026-05-30T10:00:11.000Z",
    "2026-05-30T10:00:12.000Z",
    "2026-05-30T10:00:13.000Z",
    "2026-05-30T10:00:14.000Z",
    "2026-05-30T10:00:15.000Z",
    "2026-05-30T10:00:16.000Z",
    "2026-05-30T10:00:17.000Z",
    "2026-05-30T10:00:18.000Z",
    "2026-05-30T10:00:19.000Z",
    "2026-05-30T10:00:20.000Z",
    "2026-05-30T10:00:21.000Z",
    "2026-05-30T10:00:22.000Z",
    "2026-05-30T10:00:23.000Z",
    "2026-05-30T10:00:24.000Z",
    "2026-05-30T10:00:25.000Z",
    "2026-05-30T10:00:26.000Z",
    "2026-05-30T10:00:27.000Z",
    "2026-05-30T10:00:28.000Z",
    "2026-05-30T10:00:29.000Z",
    "2026-05-30T10:00:30.000Z",
    "2026-05-30T10:00:31.000Z",
    "2026-05-30T10:00:32.000Z",
    "2026-05-30T10:00:33.000Z",
  ];
  let index = 0;
  return () => times[index++] ?? "2026-05-30T10:00:34.000Z";
}
