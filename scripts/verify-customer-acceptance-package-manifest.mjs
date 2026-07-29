#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const expectedDocumentVersion = "customer-acceptance-package-manifest/v1";
const emptyLoopReportVersion = "empty-real-loop-acceptance-report/v1";
const forbiddenMarkerPattern = new RegExp(
  "(^|[^a-z0-9])(m[o]ck|d[e]mo|s[e]ed|f[a]llback|f[i]xed|m[a]nual|l[o]cal)([^a-z0-9]|$)",
  "i",
);
const forbiddenMarkerLabel = [
  "m" + "ock",
  "demo",
  "seed",
  "fall" + "back",
  "fixed",
  "manual",
  "local",
].join("/");
const sensitiveKeyNames = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "audiobase64",
  "audiocontentbase64",
  "contentbase64",
  "fulltranscript",
  "key",
  "payload",
  "raw",
  "rawmotionpayload",
  "rawpayload",
  "rawpayloadbase64",
  "rawproviderpayload",
  "requestbody",
  "responsebody",
  "secret",
  "synthesizedaudiobase64",
  "text",
  "token",
  "transcript",
]);
const requiredAuditActions = [
  "consent.grant",
  "assessment.create",
  "rehab_plan.confirm",
  "training_session.start",
  "training_result.submit",
  "caregiver.summary.view",
];
const manifestKeys = new Set([
  "documentVersion",
  "package",
  "productionInput",
  "emptyRealLoop",
  "formalAcceptanceChain",
  "ad8CaregiverInterview",
  "aiSpeechTts",
  "unity",
  "browserPose",
  "requiredArtifacts",
  "auditEvidence",
  "privacyEvidence",
  "checks",
]);
const packageInfoKeys = new Set([
  "customerName",
  "acceptanceOwner",
  "acceptedAt",
  "environment",
  "targetLaunchDate",
  "deploymentMode",
]);
const productionInputKeys = new Set([
  "customerInputPath",
  "customerInputSha256",
  "verifiedBy",
  "verifiedAt",
]);
const emptyRealLoopKeys = new Set([
  "orchestratorConfigPath",
  "acceptanceReportPath",
  "acceptanceReportSha256",
]);
const conditionalConfigKeys = new Set(["requiredForLaunch", "configPath"]);
const aiSpeechTtsKeys = new Set([
  "aiRequiredForLaunch",
  "speechRequiredForLaunch",
  "ttsRequiredForLaunch",
  "aiAssessmentAcceptanceConfigPath",
  "speechTranscriptEvidencePath",
  "speechTranscriptAcceptanceConfigPath",
  "speechAiAssessmentConfigPath",
  "ttsEvidencePath",
  "ttsAcceptanceConfigPath",
]);
const trainingRuntimeKeys = new Set([
  "requiredForLaunch",
  "evidencePath",
  "artifactPaths",
]);
const requiredArtifactKeys = new Set(["label", "path", "sha256", "capturedAt"]);
const auditEvidenceKeys = new Set([
  "auditLogExportPath",
  "desensitizedExportPath",
  "requiredActions",
  "checkedAt",
]);
const privacyEvidenceKeys = new Set([
  "caregiverSummaryDesensitized",
  "exportDesensitized",
  "consentWithdrawalBlocked",
  "rawMediaExcluded",
  "checkedBy",
  "checkedAt",
]);
const checksKeys = new Set(["generatedBy", "checkedAt", "toolVersions"]);
const toolVersionKeys = new Set(["customerAcceptancePackageVerifier"]);
const emptyLoopReportKeys = new Set([
  "documentVersion",
  "status",
  "acceptance",
  "startedAt",
  "finishedAt",
  "summary",
  "steps",
  "failures",
]);
const emptyLoopAcceptanceKeys = new Set([
  "customerName",
  "acceptedAt",
  "testerName",
  "environment",
]);
const emptyLoopSummaryKeys = new Set([
  "totalSteps",
  "passedSteps",
  "blockedSteps",
  "notRunSteps",
  "blockedStepLabel",
]);
const emptyLoopStepKeys = new Set([
  "index",
  "label",
  "commandName",
  "status",
  "exitCode",
  "startedAt",
  "endedAt",
]);

export function validateCustomerAcceptancePackageManifest(
  manifest,
  options = {},
) {
  const failures = [];
  const packageRoot = options.packageRoot;

  if (!isObject(manifest)) {
    return { failures: ["客户验收包 manifest 必须是 JSON 对象。"] };
  }

  validateAllowedKeys(failures, manifest, manifestKeys, "$");
  requireEqual(
    failures,
    manifest.documentVersion,
    expectedDocumentVersion,
    "documentVersion 必须为 customer-acceptance-package-manifest/v1。",
  );
  validatePackageRoot(failures, packageRoot);

  validatePackageInfo(failures, manifest.package);
  validateProductionInput(failures, manifest.productionInput, packageRoot);
  validateEmptyRealLoop(failures, manifest.emptyRealLoop, packageRoot);
  validateConditionalConfig(
    failures,
    manifest.formalAcceptanceChain,
    "formalAcceptanceChain",
    "configPath",
    packageRoot,
  );
  validateConditionalConfig(
    failures,
    manifest.ad8CaregiverInterview,
    "ad8CaregiverInterview",
    "configPath",
    packageRoot,
  );
  validateAiSpeechTts(failures, manifest.aiSpeechTts, packageRoot);
  validateTrainingRuntime(failures, manifest.unity, "unity", packageRoot);
  validateTrainingRuntime(
    failures,
    manifest.browserPose,
    "browserPose",
    packageRoot,
  );
  validateRequiredArtifacts(failures, manifest.requiredArtifacts, packageRoot);
  validateAuditEvidence(failures, manifest.auditEvidence, packageRoot);
  validatePrivacyEvidence(failures, manifest.privacyEvidence);
  validateChecks(failures, manifest.checks);
  validateNoPlaceholders(failures, manifest, "$");
  validateNoForbiddenMarkers(failures, manifest, "$");
  validateNoTemplateValues(failures, manifest, "$");
  validateNoSensitiveValues(failures, manifest, "$");

  return { failures };
}

function validatePackageInfo(failures, info) {
  requireObject(failures, info, "package 必须是对象。");
  if (!isObject(info)) return;
  validateAllowedKeys(failures, info, packageInfoKeys, "package");
  requireString(failures, info.customerName, "package.customerName");
  requireString(failures, info.acceptanceOwner, "package.acceptanceOwner");
  requireIsoDateTime(failures, info.acceptedAt, "package.acceptedAt");
  requireString(failures, info.environment, "package.environment");
  requireIsoDate(failures, info.targetLaunchDate, "package.targetLaunchDate");
  requireEnum(
    failures,
    info.deploymentMode,
    new Set(["public_cloud", "private_cloud", "intranet"]),
    "package.deploymentMode",
  );
}

function validateProductionInput(failures, productionInput, packageRoot) {
  requireObject(failures, productionInput, "productionInput 必须是对象。");
  if (!isObject(productionInput)) return;
  validateAllowedKeys(
    failures,
    productionInput,
    productionInputKeys,
    "productionInput",
  );
  requirePackageFile(failures, packageRoot, productionInput.customerInputPath, {
    label: "productionInput.customerInputPath",
  });
  requireFileSha256(failures, packageRoot, productionInput.customerInputPath, {
    hash: productionInput.customerInputSha256,
    label: "productionInput.customerInputSha256",
  });
  requireString(
    failures,
    productionInput.verifiedBy,
    "productionInput.verifiedBy",
  );
  requireIsoDateTime(
    failures,
    productionInput.verifiedAt,
    "productionInput.verifiedAt",
  );
}

function validateEmptyRealLoop(failures, emptyRealLoop, packageRoot) {
  requireObject(failures, emptyRealLoop, "emptyRealLoop 必须是对象。");
  if (!isObject(emptyRealLoop)) return;
  validateAllowedKeys(
    failures,
    emptyRealLoop,
    emptyRealLoopKeys,
    "emptyRealLoop",
  );
  requirePackageFile(
    failures,
    packageRoot,
    emptyRealLoop.orchestratorConfigPath,
    {
      label: "emptyRealLoop.orchestratorConfigPath",
    },
  );
  const reportPath = requirePackageFile(
    failures,
    packageRoot,
    emptyRealLoop.acceptanceReportPath,
    {
      label: "emptyRealLoop.acceptanceReportPath",
    },
  );
  requireFileSha256(failures, packageRoot, emptyRealLoop.acceptanceReportPath, {
    hash: emptyRealLoop.acceptanceReportSha256,
    label: "emptyRealLoop.acceptanceReportSha256",
  });
  if (reportPath) validateEmptyLoopReport(failures, reportPath);
}

function validateEmptyLoopReport(failures, absolutePath) {
  let report;
  try {
    report = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    failures.push("emptyRealLoop.acceptanceReportPath 必须是有效 JSON 报告。");
    return;
  }
  if (report?.documentVersion !== emptyLoopReportVersion) {
    failures.push(
      "emptyRealLoop.acceptanceReportPath 必须是新库真实总闭环验收报告。",
    );
  }
  if (report?.status !== "PASSED") {
    failures.push("emptyRealLoop.acceptanceReportPath 状态必须为 PASSED。");
  }
  if (!isObject(report)) return;
  validateAllowedKeys(
    failures,
    report,
    emptyLoopReportKeys,
    "emptyRealLoop.acceptanceReport",
  );
  validateEmptyLoopAcceptance(failures, report.acceptance);
  requireIsoDateTime(
    failures,
    report.startedAt,
    "emptyRealLoop.acceptanceReport.startedAt",
  );
  requireIsoDateTime(
    failures,
    report.finishedAt,
    "emptyRealLoop.acceptanceReport.finishedAt",
  );
  validateEmptyLoopPassedSteps(failures, report.summary, report.steps);
  if (!Array.isArray(report.failures) || report.failures.length !== 0) {
    failures.push(
      "emptyRealLoop.acceptanceReport.failures 必须是空数组，PASSED 报告不能包含失败项。",
    );
  }
}

function validateEmptyLoopAcceptance(failures, acceptance) {
  requireObject(
    failures,
    acceptance,
    "emptyRealLoop.acceptanceReport.acceptance 必须是对象。",
  );
  if (!isObject(acceptance)) return;
  validateAllowedKeys(
    failures,
    acceptance,
    emptyLoopAcceptanceKeys,
    "emptyRealLoop.acceptanceReport.acceptance",
  );
  requireString(
    failures,
    acceptance.customerName,
    "emptyRealLoop.acceptanceReport.acceptance.customerName",
  );
  requireIsoDateTime(
    failures,
    acceptance.acceptedAt,
    "emptyRealLoop.acceptanceReport.acceptance.acceptedAt",
  );
  requireString(
    failures,
    acceptance.testerName,
    "emptyRealLoop.acceptanceReport.acceptance.testerName",
  );
  requireString(
    failures,
    acceptance.environment,
    "emptyRealLoop.acceptanceReport.acceptance.environment",
  );
}

function validateEmptyLoopPassedSteps(failures, summary, steps) {
  requireObject(
    failures,
    summary,
    "emptyRealLoop.acceptanceReport.summary 必须是对象。",
  );
  if (isObject(summary)) {
    validateAllowedKeys(
      failures,
      summary,
      emptyLoopSummaryKeys,
      "emptyRealLoop.acceptanceReport.summary",
    );
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    failures.push("emptyRealLoop.acceptanceReport.steps 必须是非空数组。");
    return;
  }
  steps.forEach((step, index) => {
    const label = `emptyRealLoop.acceptanceReport.steps[${index}]`;
    requireObject(failures, step, `${label} 必须是对象。`);
    if (!isObject(step)) return;
    validateAllowedKeys(failures, step, emptyLoopStepKeys, label);
    if (step.index !== index + 1)
      failures.push(`${label}.index 必须连续且从 1 开始。`);
    requireString(failures, step.label, `${label}.label`);
    requireString(failures, step.commandName, `${label}.commandName`);
    if (step.status !== "PASSED")
      failures.push(`${label}.status 必须为 PASSED。`);
    if (step.exitCode !== 0) failures.push(`${label}.exitCode 必须为 0。`);
    requireIsoDateTime(failures, step.startedAt, `${label}.startedAt`);
    requireIsoDateTime(failures, step.endedAt, `${label}.endedAt`);
  });
  if (!isObject(summary)) return;
  if (
    summary.totalSteps !== steps.length ||
    summary.passedSteps !== steps.length ||
    summary.blockedSteps !== 0 ||
    summary.notRunSteps !== 0 ||
    summary.blockedStepLabel !== null
  ) {
    failures.push(
      "emptyRealLoop.acceptanceReport.summary 必须与全部 PASSED steps 严格一致。",
    );
  }
}

function validateConditionalConfig(
  failures,
  value,
  label,
  pathField,
  packageRoot,
) {
  requireObject(failures, value, `${label} 必须是对象。`);
  if (!isObject(value)) return;
  validateAllowedKeys(failures, value, conditionalConfigKeys, label);
  requireBoolean(
    failures,
    value.requiredForLaunch,
    `${label}.requiredForLaunch`,
  );
  if (!value.requiredForLaunch) return;
  requirePackageFile(failures, packageRoot, value[pathField], {
    label: `${label}.${pathField}`,
  });
}

function validateAiSpeechTts(failures, aiSpeechTts, packageRoot) {
  requireObject(failures, aiSpeechTts, "aiSpeechTts 必须是对象。");
  if (!isObject(aiSpeechTts)) return;
  validateAllowedKeys(failures, aiSpeechTts, aiSpeechTtsKeys, "aiSpeechTts");
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
    requirePackageFile(
      failures,
      packageRoot,
      aiSpeechTts.aiAssessmentAcceptanceConfigPath,
      { label: "aiSpeechTts.aiAssessmentAcceptanceConfigPath" },
    );
  }
  if (aiSpeechTts.speechRequiredForLaunch) {
    for (const field of [
      "speechTranscriptEvidencePath",
      "speechTranscriptAcceptanceConfigPath",
      "speechAiAssessmentConfigPath",
    ]) {
      requirePackageFile(failures, packageRoot, aiSpeechTts[field], {
        label: `aiSpeechTts.${field}`,
      });
    }
  }
  if (aiSpeechTts.ttsRequiredForLaunch) {
    for (const field of ["ttsEvidencePath", "ttsAcceptanceConfigPath"]) {
      requirePackageFile(failures, packageRoot, aiSpeechTts[field], {
        label: `aiSpeechTts.${field}`,
      });
    }
  }
}

function validateTrainingRuntime(failures, runtime, label, packageRoot) {
  requireObject(failures, runtime, `${label} 必须是对象。`);
  if (!isObject(runtime)) return;
  validateAllowedKeys(failures, runtime, trainingRuntimeKeys, label);
  requireBoolean(
    failures,
    runtime.requiredForLaunch,
    `${label}.requiredForLaunch`,
  );
  if (!runtime.requiredForLaunch) return;
  requirePackageFile(failures, packageRoot, runtime.evidencePath, {
    label: `${label}.evidencePath`,
  });
  requireStringArray(failures, runtime.artifactPaths, `${label}.artifactPaths`);
  if (Array.isArray(runtime.artifactPaths)) {
    runtime.artifactPaths.forEach((path, index) => {
      requirePackageFile(failures, packageRoot, path, {
        label: `${label}.artifactPaths[${index}]`,
      });
    });
  }
}

function validateRequiredArtifacts(failures, requiredArtifacts, packageRoot) {
  if (!Array.isArray(requiredArtifacts) || requiredArtifacts.length === 0) {
    failures.push("requiredArtifacts 必须是非空数组。");
    return;
  }
  requiredArtifacts.forEach((artifact, index) => {
    const label = `requiredArtifacts[${index}]`;
    requireObject(failures, artifact, `${label} 必须是对象。`);
    if (!isObject(artifact)) return;
    validateAllowedKeys(failures, artifact, requiredArtifactKeys, label);
    requireString(failures, artifact.label, `${label}.label`);
    requirePackageFile(failures, packageRoot, artifact.path, {
      label: `${label}.path`,
    });
    requireFileSha256(failures, packageRoot, artifact.path, {
      hash: artifact.sha256,
      label: `${label}.sha256`,
    });
    requireIsoDateTime(failures, artifact.capturedAt, `${label}.capturedAt`);
  });
}

function validateAuditEvidence(failures, auditEvidence, packageRoot) {
  requireObject(failures, auditEvidence, "auditEvidence 必须是对象。");
  if (!isObject(auditEvidence)) return;
  validateAllowedKeys(
    failures,
    auditEvidence,
    auditEvidenceKeys,
    "auditEvidence",
  );
  requirePackageFile(failures, packageRoot, auditEvidence.auditLogExportPath, {
    label: "auditEvidence.auditLogExportPath",
  });
  requirePackageFile(
    failures,
    packageRoot,
    auditEvidence.desensitizedExportPath,
    {
      label: "auditEvidence.desensitizedExportPath",
    },
  );
  requireStringArray(
    failures,
    auditEvidence.requiredActions,
    "auditEvidence.requiredActions",
  );
  if (Array.isArray(auditEvidence.requiredActions)) {
    for (const action of requiredAuditActions) {
      if (!auditEvidence.requiredActions.includes(action)) {
        failures.push(`auditEvidence.requiredActions 缺少 ${action}。`);
      }
    }
  }
  requireIsoDateTime(
    failures,
    auditEvidence.checkedAt,
    "auditEvidence.checkedAt",
  );
}

function validatePrivacyEvidence(failures, privacyEvidence) {
  requireObject(failures, privacyEvidence, "privacyEvidence 必须是对象。");
  if (!isObject(privacyEvidence)) return;
  validateAllowedKeys(
    failures,
    privacyEvidence,
    privacyEvidenceKeys,
    "privacyEvidence",
  );
  for (const field of [
    "caregiverSummaryDesensitized",
    "exportDesensitized",
    "consentWithdrawalBlocked",
    "rawMediaExcluded",
  ]) {
    requireTrue(
      failures,
      privacyEvidence[field],
      `privacyEvidence.${field} 必须为 true。`,
    );
  }
  requireString(
    failures,
    privacyEvidence.checkedBy,
    "privacyEvidence.checkedBy",
  );
  requireIsoDateTime(
    failures,
    privacyEvidence.checkedAt,
    "privacyEvidence.checkedAt",
  );
}

function validateChecks(failures, checks) {
  requireObject(failures, checks, "checks 必须是对象。");
  if (!isObject(checks)) return;
  validateAllowedKeys(failures, checks, checksKeys, "checks");
  requireString(failures, checks.generatedBy, "checks.generatedBy");
  requireIsoDateTime(failures, checks.checkedAt, "checks.checkedAt");
  requireObject(
    failures,
    checks.toolVersions,
    "checks.toolVersions 必须是对象。",
  );
  validateAllowedKeys(
    failures,
    checks.toolVersions,
    toolVersionKeys,
    "checks.toolVersions",
  );
}

function validatePackageRoot(failures, packageRoot) {
  requireString(failures, packageRoot, "packageRoot");
  if (typeof packageRoot !== "string" || !packageRoot.trim()) return;
  if (!existsSync(resolve(packageRoot))) {
    failures.push("packageRoot 指向的客户验收包根目录不存在。");
  }
}

function requirePackageFile(
  failures,
  packageRoot,
  value,
  { label, inspectBytes = true },
) {
  requireString(failures, value, label);
  if (typeof packageRoot !== "string" || !packageRoot.trim()) return null;
  if (typeof value !== "string" || !value.trim()) return null;
  const resolvedRoot = resolve(packageRoot);
  const resolvedPath = resolvePackagePath(failures, resolvedRoot, value, label);
  if (!resolvedPath) return null;
  let stats;
  try {
    stats = statSync(resolvedPath);
  } catch {
    failures.push(`${label} 指向的文件不存在。`);
    return null;
  }
  if (!stats.isFile()) {
    failures.push(`${label} 必须指向文件。`);
    return null;
  }
  const containedPath = resolveContainedRealPath(
    failures,
    resolvedRoot,
    resolvedPath,
    label,
  );
  if (!containedPath) return null;
  if (stats.size <= 0) {
    failures.push(`${label} 指向的文件不能为空。`);
    return null;
  }
  if (inspectBytes) {
    try {
      readFileSync(containedPath);
    } catch {
      failures.push(`${label} 指向的文件不可读取。`);
      return null;
    }
  }
  return containedPath;
}

function requireFileSha256(failures, packageRoot, pathValue, { hash, label }) {
  requireHashDigest(failures, hash, label);
  if (
    typeof packageRoot !== "string" ||
    !packageRoot.trim() ||
    typeof pathValue !== "string" ||
    !pathValue.trim() ||
    !isHashDigest(hash)
  ) {
    return;
  }
  const resolvedRoot = resolve(packageRoot);
  const resolvedPath = resolvePackagePath(
    failures,
    resolvedRoot,
    pathValue,
    label,
  );
  if (!resolvedPath || !existsSync(resolvedPath)) return;
  const containedPath = resolveContainedRealPath(
    failures,
    resolvedRoot,
    resolvedPath,
    label,
  );
  if (!containedPath) return;
  let actual;
  try {
    actual = `sha256:${createHash("sha256").update(readFileSync(containedPath)).digest("hex")}`;
  } catch {
    return;
  }
  if (actual.toLowerCase() !== hash.toLowerCase()) {
    failures.push(`${label} 与文件内容不匹配。`);
  }
}

function resolvePackagePath(failures, resolvedRoot, value, label) {
  if (isAbsolute(value)) {
    failures.push(`${label} 必须是客户验收包目录内的相对路径。`);
    return null;
  }
  const resolvedPath = resolve(resolvedRoot, value);
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${sep}`)
  ) {
    failures.push(`${label} 必须位于客户验收包目录内。`);
    return null;
  }
  return resolvedPath;
}

function resolveContainedRealPath(failures, resolvedRoot, resolvedPath, label) {
  let realRoot;
  let realPath;
  try {
    realRoot = realpathSync(resolvedRoot);
    realPath = realpathSync(resolvedPath);
  } catch {
    failures.push(`${label} 的真实路径不可解析。`);
    return null;
  }
  if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${sep}`)) {
    failures.push(`${label} 的真实路径必须位于客户验收包目录内。`);
    return null;
  }
  return realPath;
}

function requireObject(failures, value, message) {
  if (!isObject(value)) failures.push(message);
}

function validateAllowedKeys(failures, value, allowedKeys, path) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(`${path}.${key} 是不支持的 manifest 字段。`);
    }
  }
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireStringArray(failures, value, label) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    failures.push(`${label} 必须是非空字符串数组。`);
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

function requireEnum(failures, value, allowedValues, label) {
  requireString(failures, value, label);
  if (
    typeof value === "string" &&
    value.trim() &&
    !allowedValues.has(value.trim())
  ) {
    failures.push(
      `${label} 必须是 ${Array.from(allowedValues).join("、")} 之一。`,
    );
  }
}

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    failures.push(`${label} 必须是 YYYY-MM-DD 日期。`);
  }
}

function requireIsoDateTime(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function requireHashDigest(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value === "string" && value.trim() && !isHashDigest(value)) {
    failures.push(`${label} 必须是 sha256:<64位十六进制> 摘要。`);
  }
}

function validateNoPlaceholders(failures, value, path) {
  if (typeof value === "string") {
    if (/<[^>]+>/.test(value)) {
      failures.push(`${path} 含占位符，必须替换为客户验收现场资料。`);
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
        `${path} 包含 ${forbiddenMarkerLabel} 标记，不能作为客户验收包证据。`,
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

function validateNoTemplateValues(failures, value, path) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (/\bexample\.(com|cn|org|net)\b/i.test(trimmed)) {
      failures.push(`${path} 使用示例域名，必须替换为客户验收现场资料。`);
    }
    if (trimmed.includes(" | ")) {
      failures.push(`${path} 使用模板枚举提示，必须选择单一正式值。`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoTemplateValues(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    validateNoTemplateValues(failures, nested, `${path}.${key}`);
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
    if (normalizedKey.endsWith("ref") && isSecretRef(nested)) continue;
    if (sensitiveKeyNames.has(normalizedKey)) {
      failures.push(
        `${nestedPath} 包含敏感字段或原始载荷，不能写入客户验收包 manifest。`,
      );
      continue;
    }
    if (typeof nested === "string" && isUnsafeText(nested)) {
      failures.push(
        `${nestedPath} 包含敏感字段或原始载荷，不能写入客户验收包 manifest。`,
      );
      continue;
    }
    validateNoSensitiveValues(failures, nested, nestedPath);
  }
}

function isUnsafeText(value) {
  if (isHashDigest(value) || isSecretRef(value)) return false;
  return (
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i.test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(
      value,
    ) ||
    /(?:[A-Za-z0-9+/]{80,}={0,2})/g.test(value)
  );
}

function isHashDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function isSecretRef(value) {
  return typeof value === "string" && value.startsWith("secret-manager://");
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    if (arg === "--package-root") {
      if (options.packageRoot !== undefined) {
        options.failures.push("--package-root 只能提供一次。");
        index += 1;
        continue;
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        options.failures.push("--package-root 必须提供客户验收包根目录。");
        continue;
      }
      options.packageRoot = value;
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
    options.failures.push("缺少客户验收包 manifest JSON 路径。");
  }
  if (options.positional.length > 1) {
    options.failures.push("只能提供一个客户验收包 manifest JSON 路径。");
  }
  if (!options.packageRoot) {
    options.failures.push("--package-root 必须提供客户验收包根目录。");
  }
  return {
    manifestPath: options.positional[0],
    packageRoot: options.packageRoot,
    failures: options.failures,
  };
}

function cli() {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.failures.length) {
    for (const failure of options.failures) console.error(failure);
    process.exitCode = 1;
    return;
  }

  const absoluteManifestPath = resolve(process.cwd(), options.manifestPath);
  if (!existsSync(absoluteManifestPath)) {
    console.error("客户验收包 manifest 文件不存在。");
    process.exitCode = 1;
    return;
  }

  const manifest = readJsonFile(absoluteManifestPath);
  if (manifest.error) {
    console.error("客户验收包 manifest 不是有效 JSON。");
    process.exitCode = 1;
    return;
  }

  const result = validateCustomerAcceptancePackageManifest(manifest.value, {
    packageRoot: resolve(process.cwd(), options.packageRoot),
  });
  if (result.failures.length) {
    console.error("客户验收包 manifest 校验失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("客户验收包 manifest 校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
