#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedDocumentVersion = "empty-real-loop-orchestrator/v1";
const reportDocumentVersion = "empty-real-loop-acceptance-report/v1";
const forbiddenMarkerPattern =
  /(^|[^a-z0-9])(m[o]ck|d[e]mo|s[e]ed|f[a]llback|f[i]xed|m[a]nual)([^a-z0-9]|$)/i;
const forbiddenMarkerLabel = [
  "m" + "ock",
  "demo",
  "seed",
  "fall" + "back",
  "fixed",
  "manual",
].join("/");
const sensitiveKeyNames = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "contentbase64",
  "key",
  "payload",
  "raw",
  "rawpayload",
  "requestbody",
  "responsebody",
  "secret",
  "token",
]);
const fieldCredentialEnvironmentNames = new Set([
  "BROWSER_POSE_PATIENT_ACCOUNT",
  "BROWSER_POSE_PATIENT_PASSWORD",
  "BROWSER_POSE_AUDIT_ACCOUNT",
  "BROWSER_POSE_AUDIT_PASSWORD",
  "UNITY_FIELD_PATIENT_ACCOUNT",
  "UNITY_FIELD_PATIENT_PASSWORD",
  "UNITY_FIELD_AUDIT_ACCOUNT",
  "UNITY_FIELD_AUDIT_PASSWORD",
]);
const orchestratorConfigKeys = new Set([
  "documentVersion",
  "acceptance",
  "productionGate",
  "trialEmptyLoop",
  "formalAcceptanceChain",
  "ad8CaregiverInterview",
  "aiSpeechTts",
  "unity",
  "browserPose",
  "caregiverAudit",
]);
const fieldVerifierConfigKeys = new Set([
  "requiredForLaunch",
  "evidencePath",
  "apiBaseUrl",
  "patientAccount",
  "patientPassword",
  "auditAccount",
  "auditPassword",
]);

export function validateEmptyRealLoopOrchestratorConfig(config) {
  const failures = [];

  if (!isObject(config)) {
    return { failures: ["新库真实总闭环配置必须是 JSON 对象。"] };
  }

  validateAllowedKeys(failures, config, orchestratorConfigKeys, "$");
  validateAllowedKeys(failures, config.unity, fieldVerifierConfigKeys, "unity");
  validateAllowedKeys(
    failures,
    config.browserPose,
    fieldVerifierConfigKeys,
    "browserPose",
  );

  requireEqual(
    failures,
    config.documentVersion,
    expectedDocumentVersion,
    "documentVersion 必须为 empty-real-loop-orchestrator/v1。",
  );

  validateAcceptance(failures, config.acceptance);
  validateProductionGate(failures, config.productionGate);
  validateTrialEmptyLoop(failures, config.trialEmptyLoop);
  validateFormalAcceptanceChain(failures, config.formalAcceptanceChain);
  validateAd8CaregiverInterview(failures, config.ad8CaregiverInterview);
  validateAiSpeechTts(failures, config.aiSpeechTts);
  validateFieldAcceptance(failures, config.unity, "unity");
  validateFieldAcceptance(failures, config.browserPose, "browserPose");
  validateDistinctFieldAccounts(failures, config.unity, config.browserPose);
  validateCaregiverAudit(failures, config.caregiverAudit);
  validateNoPlaceholders(failures, config, "$");
  validateNoForbiddenMarkers(failures, config, "$");
  validateNoSensitiveValues(failures, config, "$");

  return { failures };
}

export function buildEmptyRealLoopCommands(config) {
  const commands = [
    command("生产配置门禁", "pnpm", [
      "delivery:check:production",
      "--",
      "--customer-input",
      config.productionGate.customerInputPath,
    ]),
    command("空库最小业务闭环", "pnpm", ["verify:trial-empty-loop"]),
  ];

  if (config.formalAcceptanceChain.requiredForLaunch) {
    commands.push(
      command("正式业务链只读验真", "pnpm", [
        "verify:formal-acceptance-chain",
        "--",
        config.formalAcceptanceChain.chainConfigPath,
      ]),
    );
  }

  if (config.ad8CaregiverInterview.requiredForLaunch) {
    commands.push(
      command("AD-8 照护者访谈正式验收", "pnpm", [
        "verify:ad8-caregiver-interview-acceptance",
        "--",
        config.ad8CaregiverInterview.acceptanceConfigPath,
      ]),
    );
  }

  const aiSpeechTts = config.aiSpeechTts;
  if (aiSpeechTts.aiRequiredForLaunch) {
    commands.push(
      command("AI 评估正式验收", "pnpm", [
        "verify:ai-assessment-acceptance",
        "--",
        aiSpeechTts.aiAssessmentAcceptanceConfigPath,
      ]),
    );
  }
  if (aiSpeechTts.speechRequiredForLaunch) {
    commands.push(
      command("语音转写证据自检", "pnpm", [
        "verify:speech-transcript-evidence",
        "--",
        aiSpeechTts.speechTranscriptEvidencePath,
      ]),
      command("语音转写现场验收", "pnpm", [
        "verify:speech-transcript-acceptance",
        "--",
        aiSpeechTts.speechTranscriptAcceptanceConfigPath,
      ]),
      command("语音 AI 评估组合验收", "pnpm", [
        "verify:speech-ai-assessment-acceptance",
        "--",
        aiSpeechTts.speechAiAssessmentConfigPath,
      ]),
    );
  }
  if (aiSpeechTts.ttsRequiredForLaunch) {
    commands.push(
      command("TTS 语音输出证据自检", "pnpm", [
        "verify:tts-speech-output-evidence",
        "--",
        aiSpeechTts.ttsEvidencePath,
      ]),
      command("TTS 语音输出现场验收", "pnpm", [
        "verify:tts-speech-output-acceptance",
        "--",
        aiSpeechTts.ttsAcceptanceConfigPath,
      ]),
    );
  }

  if (config.unity.requiredForLaunch) {
    commands.push(
      command("Unity WebGL 证据自检", "pnpm", [
        "verify:unity-field-evidence",
        "--",
        config.unity.evidencePath,
      ]),
      command(
        "Unity WebGL 现场只读验真",
        "pnpm",
        [
          "verify:unity-field-acceptance",
          "--",
          config.unity.evidencePath,
          "--api-base-url",
          config.unity.apiBaseUrl,
        ],
        {
          UNITY_FIELD_PATIENT_ACCOUNT: config.unity.patientAccount,
          UNITY_FIELD_PATIENT_PASSWORD: config.unity.patientPassword,
          UNITY_FIELD_AUDIT_ACCOUNT: config.unity.auditAccount,
          UNITY_FIELD_AUDIT_PASSWORD: config.unity.auditPassword,
        },
      ),
    );
  }

  if (config.browserPose.requiredForLaunch) {
    commands.push(
      command("浏览器体感证据自检", "pnpm", [
        "verify:browser-pose-evidence",
        "--",
        config.browserPose.evidencePath,
      ]),
      command(
        "浏览器体感现场只读验真",
        "pnpm",
        [
          "verify:browser-pose-field-acceptance",
          "--",
          config.browserPose.evidencePath,
          "--api-base-url",
          config.browserPose.apiBaseUrl,
        ],
        {
          BROWSER_POSE_PATIENT_ACCOUNT: config.browserPose.patientAccount,
          BROWSER_POSE_PATIENT_PASSWORD: config.browserPose.patientPassword,
          BROWSER_POSE_AUDIT_ACCOUNT: config.browserPose.auditAccount,
          BROWSER_POSE_AUDIT_PASSWORD: config.browserPose.auditPassword,
        },
      ),
    );
  }

  commands.push(
    command("家属授权、脱敏摘要和后台审计契约验收", "pnpm", [
      "verify:contracts",
    ]),
  );

  return commands;
}

export async function verifyEmptyRealLoopOrchestrator(config, options = {}) {
  const reportOutputPath = options.reportOutputPath;
  const reportPathFailures = validateReportOutputPath(reportOutputPath);
  if (reportPathFailures.length) {
    return { failures: reportPathFailures };
  }

  const validation = validateEmptyRealLoopOrchestratorConfig(config);
  if (validation.failures.length) {
    return writeReportAndReturn({
      config,
      commands: [],
      steps: [],
      failures: validation.failures,
      reportOutputPath,
      startedAt: readNow(options),
      finishedAt: readNow(options),
    });
  }

  const runCommand = options.runCommand ?? runCommandInProcess;
  const startedAt = readNow(options);
  const failures = [];
  const commands = buildEmptyRealLoopCommands(config);
  const steps = createInitialReportSteps(commands);

  for (const [index, item] of commands.entries()) {
    const stepStartedAt = readNow(options);
    const result = await runCommand(item);
    const stepEndedAt = readNow(options);
    steps[index] = {
      ...steps[index],
      status: result.status === 0 ? "PASSED" : "BLOCKED",
      exitCode: result.status,
      startedAt: stepStartedAt,
      endedAt: stepEndedAt,
    };
    if (result.status !== 0) {
      failures.push(`${item.label} 未通过，退出码 ${result.status}。`);
      break;
    }
  }

  return writeReportAndReturn({
    config,
    commands,
    steps,
    failures,
    reportOutputPath,
    startedAt,
    finishedAt: readNow(options),
  });
}

function createInitialReportSteps(commands) {
  return commands.map((item, index) => ({
    index: index + 1,
    label: item.label,
    commandName: item.command,
    status: "NOT_RUN",
    exitCode: null,
    startedAt: null,
    endedAt: null,
  }));
}

function writeReportAndReturn({
  config,
  commands,
  steps,
  failures,
  reportOutputPath,
  startedAt,
  finishedAt,
}) {
  if (!reportOutputPath) return { failures };

  const report = buildAcceptanceReport({
    config,
    commands,
    steps,
    failures,
    startedAt,
    finishedAt,
  });
  try {
    writeFileSync(reportOutputPath, JSON.stringify(report, null, 2));
  } catch (error) {
    return {
      failures: [
        ...failures,
        `reportOutputPath 写入失败：${error instanceof Error ? error.message : "未知错误"}。`,
      ],
    };
  }
  return { failures };
}

function buildAcceptanceReport({
  config,
  commands,
  steps,
  failures,
  startedAt,
  finishedAt,
}) {
  const passedSteps = steps.filter((step) => step.status === "PASSED").length;
  const blockedSteps = steps.filter((step) => step.status === "BLOCKED").length;
  const notRunSteps = steps.filter((step) => step.status === "NOT_RUN").length;
  const blockedStep = steps.find((step) => step.status === "BLOCKED");
  return {
    documentVersion: reportDocumentVersion,
    status: failures.length ? "BLOCKED" : "PASSED",
    acceptance: {
      customerName: isObject(config?.acceptance)
        ? config.acceptance.customerName
        : undefined,
      acceptedAt: isObject(config?.acceptance)
        ? config.acceptance.acceptedAt
        : undefined,
      testerName: isObject(config?.acceptance)
        ? config.acceptance.testerName
        : undefined,
      environment: isObject(config?.acceptance)
        ? config.acceptance.environment
        : undefined,
    },
    startedAt,
    finishedAt,
    summary: {
      totalSteps: commands.length,
      passedSteps,
      blockedSteps: failures.length && !blockedSteps ? 1 : blockedSteps,
      notRunSteps,
      blockedStepLabel: blockedStep?.label ?? null,
    },
    steps,
    failures: failures.map(sanitizeReportText),
  };
}

function sanitizeReportText(value) {
  return String(value)
    .replace(/secret-manager:\/\/[^\s"]+/g, "[secret-ref]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "[hidden-bearer]")
    .replace(
      /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/gi,
      "[hidden-secret]",
    )
    .replace(/(?:[A-Za-z0-9+/]{40,}={0,2})/g, "[hidden-base64]");
}

function validateReportOutputPath(reportOutputPath) {
  if (reportOutputPath === undefined) return [];
  const failures = [];
  requireString(failures, reportOutputPath, "reportOutputPath");
  if (typeof reportOutputPath !== "string" || !reportOutputPath.trim()) {
    return failures;
  }
  if (/<[^>]+>/.test(reportOutputPath)) {
    failures.push("reportOutputPath 包含占位符，必须替换为现场真实报告路径。");
  }
  if (
    forbiddenMarkerPattern.test(reportOutputPath) ||
    isUnsafeReportPath(reportOutputPath)
  ) {
    failures.push("reportOutputPath 包含不允许写入交付报告的标记或敏感文本。");
  }
  return failures;
}

function isUnsafeReportPath(value) {
  return (
    /secret-manager:\/\//i.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i.test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(
      value,
    )
  );
}

function readNow(options) {
  const now = options.now;
  if (typeof now === "function") return now();
  return new Date().toISOString();
}

function validateAcceptance(failures, acceptance) {
  requireObject(failures, acceptance, "acceptance 必须是对象。");
  if (!isObject(acceptance)) return;
  requireString(failures, acceptance.customerName, "acceptance.customerName");
  requireIsoDate(failures, acceptance.acceptedAt, "acceptance.acceptedAt");
  requireString(failures, acceptance.testerName, "acceptance.testerName");
  requireString(failures, acceptance.environment, "acceptance.environment");
}

function validateProductionGate(failures, productionGate) {
  requireObject(failures, productionGate, "productionGate 必须是对象。");
  if (!isObject(productionGate)) return;
  requireString(
    failures,
    productionGate.customerInputPath,
    "productionGate.customerInputPath",
  );
}

function validateTrialEmptyLoop(failures, trialEmptyLoop) {
  requireObject(failures, trialEmptyLoop, "trialEmptyLoop 必须是对象。");
  if (!isObject(trialEmptyLoop)) return;
  requireTrue(
    failures,
    trialEmptyLoop.required,
    "trialEmptyLoop.required 必须为 true。",
  );
}

function validateFormalAcceptanceChain(failures, formalAcceptanceChain) {
  requireObject(
    failures,
    formalAcceptanceChain,
    "formalAcceptanceChain 必须是对象。",
  );
  if (!isObject(formalAcceptanceChain)) return;
  requireBoolean(
    failures,
    formalAcceptanceChain.requiredForLaunch,
    "formalAcceptanceChain.requiredForLaunch",
  );
  if (!formalAcceptanceChain.requiredForLaunch) return;
  requireString(
    failures,
    formalAcceptanceChain.chainConfigPath,
    "formalAcceptanceChain.chainConfigPath",
  );
}

function validateAd8CaregiverInterview(failures, ad8CaregiverInterview) {
  requireObject(
    failures,
    ad8CaregiverInterview,
    "ad8CaregiverInterview 必须是对象。",
  );
  if (!isObject(ad8CaregiverInterview)) return;
  requireBoolean(
    failures,
    ad8CaregiverInterview.requiredForLaunch,
    "ad8CaregiverInterview.requiredForLaunch",
  );
  if (!ad8CaregiverInterview.requiredForLaunch) return;
  requireString(
    failures,
    ad8CaregiverInterview.acceptanceConfigPath,
    "ad8CaregiverInterview.acceptanceConfigPath",
  );
}

function validateAiSpeechTts(failures, aiSpeechTts) {
  requireObject(failures, aiSpeechTts, "aiSpeechTts 必须是对象。");
  if (!isObject(aiSpeechTts)) return;
  requireBoolean(
    failures,
    aiSpeechTts.aiRequiredForLaunch,
    "aiSpeechTts.aiRequiredForLaunch",
  );
  requireBoolean(
    failures,
    aiSpeechTts.speechRequiredForLaunch,
    "aiSpeechTts.speechRequiredForLaunch",
  );
  requireBoolean(
    failures,
    aiSpeechTts.ttsRequiredForLaunch,
    "aiSpeechTts.ttsRequiredForLaunch",
  );
  if (aiSpeechTts.aiRequiredForLaunch) {
    requireString(
      failures,
      aiSpeechTts.aiAssessmentAcceptanceConfigPath,
      "aiSpeechTts.aiAssessmentAcceptanceConfigPath",
    );
  }
  if (aiSpeechTts.speechRequiredForLaunch) {
    requireString(
      failures,
      aiSpeechTts.speechTranscriptEvidencePath,
      "aiSpeechTts.speechTranscriptEvidencePath",
    );
    requireString(
      failures,
      aiSpeechTts.speechTranscriptAcceptanceConfigPath,
      "aiSpeechTts.speechTranscriptAcceptanceConfigPath",
    );
    requireString(
      failures,
      aiSpeechTts.speechAiAssessmentConfigPath,
      "aiSpeechTts.speechAiAssessmentConfigPath",
    );
  }
  if (aiSpeechTts.ttsRequiredForLaunch) {
    requireString(
      failures,
      aiSpeechTts.ttsEvidencePath,
      "aiSpeechTts.ttsEvidencePath",
    );
    requireString(
      failures,
      aiSpeechTts.ttsAcceptanceConfigPath,
      "aiSpeechTts.ttsAcceptanceConfigPath",
    );
  }
}

function validateFieldAcceptance(failures, value, label) {
  requireObject(failures, value, `${label} 必须是对象。`);
  if (!isObject(value)) return;
  requireBoolean(
    failures,
    value.requiredForLaunch,
    `${label}.requiredForLaunch`,
  );
  requireString(failures, value.patientAccount, `${label}.patientAccount`);
  requireString(failures, value.patientPassword, `${label}.patientPassword`);
  requireString(failures, value.auditAccount, `${label}.auditAccount`);
  requireString(failures, value.auditPassword, `${label}.auditPassword`);
  if (
    typeof value.patientAccount === "string" &&
    value.patientAccount.trim() &&
    value.patientAccount === value.auditAccount
  ) {
    failures.push(`${label} 的患者读取账号与审计读取账号必须不同。`);
  }
  if (!value.requiredForLaunch) return;
  requireString(failures, value.evidencePath, `${label}.evidencePath`);
  requireHttpsUrl(failures, value.apiBaseUrl, `${label}.apiBaseUrl`);
}

function validateDistinctFieldAccounts(failures, unity, browserPose) {
  if (!isObject(unity) || !isObject(browserPose)) return;
  const unityAccounts = [unity.patientAccount, unity.auditAccount];
  const browserAccounts = [
    browserPose.patientAccount,
    browserPose.auditAccount,
  ];
  if (
    [...unityAccounts, ...browserAccounts].every(
      (account) => typeof account === "string" && account.trim(),
    ) &&
    browserAccounts.some((account) => unityAccounts.includes(account))
  ) {
    failures.push("Browser Pose 与 Unity field acceptance 账号必须彼此不同。");
  }
}

function validateCaregiverAudit(failures, caregiverAudit) {
  requireObject(failures, caregiverAudit, "caregiverAudit 必须是对象。");
  if (!isObject(caregiverAudit)) return;
  requireTrue(
    failures,
    caregiverAudit.required,
    "caregiverAudit.required 必须为 true。",
  );
  requireTrue(
    failures,
    caregiverAudit.localContractsRequired,
    "caregiverAudit.localContractsRequired 必须为 true。",
  );
  requireString(
    failures,
    caregiverAudit.evidenceNotes,
    "caregiverAudit.evidenceNotes",
  );
}

function validateNoPlaceholders(failures, value, path) {
  if (typeof value === "string") {
    if (/<[^>]+>/.test(value)) {
      failures.push(`${path} 包含占位符，必须替换为现场真实配置或证据路径。`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoPlaceholders(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    validateNoPlaceholders(failures, nested, `${path}.${key}`);
  }
}

function validateNoForbiddenMarkers(failures, value, path) {
  if (typeof value === "string") {
    if (forbiddenMarkerPattern.test(value)) {
      failures.push(
        `${path} 包含 ${forbiddenMarkerLabel} 标记，不能作为新库真实总闭环验收配置。`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoForbiddenMarkers(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    validateNoForbiddenMarkers(failures, nested, `${path}.${key}`);
  }
}

function validateNoSensitiveValues(failures, value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoSensitiveValues(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const nestedPath = `${path}.${key}`;
    if (normalizedKey.endsWith("ref") && isSecretRef(nested)) {
      continue;
    }
    if (sensitiveKeyNames.has(normalizedKey)) {
      failures.push(`${nestedPath} 包含敏感字段或原始载荷，不能写入编排配置。`);
      continue;
    }
    if (typeof nested === "string" && isUnsafeText(nested)) {
      failures.push(`${nestedPath} 包含敏感字段或原始载荷，不能写入编排配置。`);
      continue;
    }
    validateNoSensitiveValues(failures, nested, nestedPath);
  }
}

function requireObject(failures, value, message) {
  if (!isObject(value)) failures.push(message);
}

function validateAllowedKeys(failures, value, allowedKeys, path) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(`${path}.${key} 是不支持的配置字段。`);
    }
  }
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireBoolean(failures, value, label) {
  if (typeof value !== "boolean") {
    failures.push(`${label} 必须是布尔值。`);
  }
}

function requireTrue(failures, value, message) {
  if (value !== true) failures.push(message);
}

function requireEqual(failures, value, expected, message) {
  if (value !== expected) failures.push(message);
}

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function requireHttpsUrl(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      failures.push(`${label} 必须是正式 HTTPS 地址。`);
    }
  } catch {
    failures.push(`${label} 必须是有效 URL。`);
  }
}

function isSecretRef(value) {
  return typeof value === "string" && value.startsWith("secret-manager://");
}

function isUnsafeText(value) {
  return (
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i.test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(
      value,
    ) ||
    /(?:[A-Za-z0-9+/]{40,}={0,2})/g.test(value)
  );
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function command(label, commandName, args, env) {
  return {
    label,
    command: commandName,
    args,
    ...(env === undefined ? {} : { env }),
  };
}

async function runCommandInProcess(item) {
  console.log(`- ${item.label} ...`);
  const executablePath = process.env.PATH;
  if (typeof executablePath !== "string" || !executablePath.trim()) {
    return { status: 1 };
  }
  const env = item.env
    ? { PATH: executablePath, ...item.env }
    : Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !fieldCredentialEnvironmentNames.has(name),
        ),
      );
  return new Promise((resolve) => {
    const child = spawn(item.command, item.args, {
      stdio: "inherit",
      shell: false,
      env,
    });
    child.on("close", (status) => resolve({ status }));
    child.on("error", () => resolve({ status: 1 }));
  });
}

function readJsonFile(path) {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error };
  }
}

function parseCliOptions(argv) {
  const options = {
    positional: [],
    failures: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--report-output") {
      if (options.reportOutputPath !== undefined) {
        options.failures.push("--report-output 只能提供一次。");
        index += 1;
        continue;
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        options.failures.push("--report-output 必须提供报告输出路径。");
        continue;
      }
      options.reportOutputPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      options.failures.push(`未知参数：${arg}`);
      continue;
    }
    options.positional.push(arg);
  }
  if (options.positional.length === 0) {
    options.failures.push(
      "缺少新库真实总闭环配置文件路径。请显式传入 JSON 文件路径。",
    );
  }
  if (options.positional.length > 1) {
    options.failures.push("只能提供一个新库真实总闭环配置文件路径。");
  }
  return {
    configPath: options.positional[0],
    reportOutputPath: options.reportOutputPath,
    failures: options.failures,
  };
}

async function cli() {
  const options = parseCliOptions(process.argv.slice(2));

  if (options.failures.length) {
    for (const failure of options.failures) {
      console.error(failure);
    }
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), options.configPath);
  if (!existsSync(absolutePath)) {
    console.error(`配置文件不存在：${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  const readResult = readJsonFile(absolutePath);
  if (readResult.error) {
    console.error(`配置文件不是有效 JSON：${readResult.error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await verifyEmptyRealLoopOrchestrator(readResult.value, {
    reportOutputPath: options.reportOutputPath
      ? resolve(process.cwd(), options.reportOutputPath)
      : undefined,
  });
  if (result.failures.length) {
    console.error("新库真实总闭环验收编排失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("新库真实总闭环验收编排通过。");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cli();
}
