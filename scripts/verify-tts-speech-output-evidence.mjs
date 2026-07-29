#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedEvidenceVersion = "tts-speech-output-acceptance/v1";
const expectedProvider = "xiaomi-mimo-tts";
const expectedSource = "provider_text_to_speech";
const requiredAuditActions = ["ai.tts_speech_output.generate"];
const supportedAudioMimeTypes = new Set(["audio/mpeg", "audio/wav"]);
const forbiddenMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual)([^a-z0-9]|$)/i;
const sensitiveEvidenceKeys = new Set([
  "accesstoken",
  "apikey",
  "audiobase64",
  "authorization",
  "contentbase64",
  "key",
  "payload",
  "raw",
  "rawpayload",
  "requestbody",
  "responsebody",
  "secret",
  "synthesizedaudiobase64",
  "text",
  "token",
]);

export function validateTtsSpeechOutputEvidence(evidence) {
  const failures = [];

  if (!isObject(evidence)) {
    return { failures: ["证据文件必须是 JSON 对象。"] };
  }

  requireEqual(
    failures,
    evidence.evidenceVersion,
    expectedEvidenceVersion,
    "evidenceVersion 必须使用 tts-speech-output-acceptance/v1。",
  );

  validateAcceptance(failures, evidence.acceptance);
  validateBrowser(failures, evidence.browser);
  validatePatient(failures, evidence.patient);
  validateConsent(failures, evidence.consent);
  validateTtsProvider(failures, evidence.ttsProvider);
  validateSynthesisRequest(failures, evidence.synthesisRequest);
  validateSynthesisResult(failures, evidence.synthesisResult);
  validatePlaybackResult(failures, evidence.playbackResult);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateCrossReferences(failures, evidence);
  validateNoForbiddenMarkers(failures, evidence);
  validateNoSensitiveEvidence(failures, evidence);
  validateNoPlaceholders(failures, evidence);

  return { failures };
}

function validateAcceptance(failures, acceptance) {
  requireObject(failures, acceptance, "acceptance 必须是对象。");
  if (!isObject(acceptance)) return;
  requireIsoDate(failures, acceptance.acceptedAt, "acceptance.acceptedAt");
  requireString(failures, acceptance.testerName, "acceptance.testerName");
  requireString(failures, acceptance.siteName, "acceptance.siteName");
  requireString(failures, acceptance.environment, "acceptance.environment");
}

function validateBrowser(failures, browser) {
  requireObject(failures, browser, "browser 必须是对象。");
  if (!isObject(browser)) return;
  requireString(failures, browser.name, "browser.name");
  requireString(failures, browser.version, "browser.version");
  requireString(failures, browser.userAgent, "browser.userAgent");
  requireHttpsUrl(failures, browser.pageUrl, "browser.pageUrl");
}

function validatePatient(failures, patient) {
  requireObject(failures, patient, "patient 必须是对象。");
  if (!isObject(patient)) return;
  requireString(failures, patient.patientId, "patient.patientId");
  requireString(failures, patient.patientExportId, "patient.patientExportId");
}

function validateConsent(failures, consent) {
  requireObject(failures, consent, "consent 必须是对象。");
  if (!isObject(consent)) return;
  requireString(failures, consent.privacyConsentId, "consent.privacyConsentId");
  requireString(failures, consent.aiProcessingConsentId, "consent.aiProcessingConsentId");
  requireEqual(
    failures,
    consent.privacyStatus,
    "granted",
    "隐私协议授权必须处于 granted 状态。",
  );
  requireEqual(
    failures,
    consent.aiProcessingStatus,
    "granted",
    "AI 处理授权必须处于 granted 状态。",
  );
  requireString(failures, consent.consentVersion, "consent.consentVersion");
  requireIsoDate(failures, consent.grantedAt, "consent.grantedAt");
}

function validateTtsProvider(failures, ttsProvider) {
  requireObject(failures, ttsProvider, "ttsProvider 必须是对象。");
  if (!isObject(ttsProvider)) return;
  requireEqual(
    failures,
    ttsProvider.provider,
    expectedProvider,
    "ttsProvider.provider 必须使用小米 MiMo TTS 协议。",
  );
  requireString(failures, ttsProvider.modelVersion, "ttsProvider.modelVersion");
  requireHttpsUrl(failures, ttsProvider.endpointRef, "ttsProvider.endpointRef");
  requireSecretRef(failures, ttsProvider.apiKeyRef, "ttsProvider.apiKeyRef");
  requireString(failures, ttsProvider.accountOwner, "ttsProvider.accountOwner");
  requireString(failures, ttsProvider.voiceId, "ttsProvider.voiceId");
  requireIntegerInRange(
    failures,
    ttsProvider.callLogRetentionDays,
    "ttsProvider.callLogRetentionDays",
    30,
    3650,
  );
}

function validateSynthesisRequest(failures, synthesisRequest) {
  requireObject(failures, synthesisRequest, "synthesisRequest 必须是对象。");
  if (!isObject(synthesisRequest)) return;
  requireString(failures, synthesisRequest.scenario, "synthesisRequest.scenario");
  requireString(failures, synthesisRequest.inputTextHash, "synthesisRequest.inputTextHash");
  requireEqual(
    failures,
    synthesisRequest.fullTextStored,
    false,
    "synthesisRequest.fullTextStored 必须为 false，不保存完整待合成文本。",
  );
  requireEqual(
    failures,
    synthesisRequest.sentThroughPlatformApi,
    true,
    "TTS 必须通过平台 API 触发，不能直接调用供应商密钥。",
  );
}

function validateSynthesisResult(failures, synthesisResult) {
  requireObject(failures, synthesisResult, "synthesisResult 必须是对象。");
  if (!isObject(synthesisResult)) return;
  requireString(failures, synthesisResult.patientId, "synthesisResult.patientId");
  requireEqual(
    failures,
    synthesisResult.status,
    "synthesized",
    "synthesisResult.status 必须是 synthesized。",
  );
  requireString(failures, synthesisResult.callId, "synthesisResult.callId");
  requireIsoDate(failures, synthesisResult.calledAt, "synthesisResult.calledAt");
  requireEqual(
    failures,
    synthesisResult.source,
    expectedSource,
    "synthesisResult.source 必须是 provider_text_to_speech。",
  );
  requireAudioSummary(failures, synthesisResult.audio, "synthesisResult.audio");
}

function validatePlaybackResult(failures, playbackResult) {
  requireObject(failures, playbackResult, "playbackResult 必须是对象。");
  if (!isObject(playbackResult)) return;
  requireEqual(
    failures,
    playbackResult.playedInBrowser,
    true,
    "playbackResult.playedInBrowser 必须为 true。",
  );
  requireIsoDate(failures, playbackResult.playedAt, "playbackResult.playedAt");
  requireString(failures, playbackResult.userGesture, "playbackResult.userGesture");
  requireEqual(
    failures,
    playbackResult.usedBrowserSpeechSynthesis,
    false,
    "正式 TTS 验收不能使用浏览器 SpeechSynthesis。",
  );
  requireEqual(
    failures,
    playbackResult.usedPreGeneratedAudio,
    false,
    "正式 TTS 验收不能使用预生成音频。",
  );
}

function validateAuditEvidence(failures, auditEvidence) {
  requireObject(failures, auditEvidence, "auditEvidence 必须是对象。");
  if (!isObject(auditEvidence)) return;
  requireStringArray(failures, auditEvidence.auditLogIds, "auditEvidence.auditLogIds");
  requireStringArray(
    failures,
    auditEvidence.requiredActions,
    "auditEvidence.requiredActions",
  );
  requireIsoDate(failures, auditEvidence.checkedAt, "auditEvidence.checkedAt");
  if (Array.isArray(auditEvidence.requiredActions)) {
    for (const action of requiredAuditActions) {
      if (!auditEvidence.requiredActions.includes(action)) {
        failures.push(`auditEvidence.requiredActions 缺少 ${action}。`);
      }
    }
  }
}

function validateArtifacts(failures, artifacts) {
  requireObject(failures, artifacts, "artifacts 必须是对象。");
  if (!isObject(artifacts)) return;
  if (!Array.isArray(artifacts.screenshots) || artifacts.screenshots.length === 0) {
    failures.push("artifacts.screenshots 至少需要一张 TTS 语音输出验收截图。");
    return;
  }
  artifacts.screenshots.forEach((item, index) =>
    validateArtifact(failures, item, `artifacts.screenshots[${index}]`),
  );
}

function validateArtifact(failures, artifact, path) {
  requireObject(failures, artifact, `${path} 必须是对象。`);
  if (!isObject(artifact)) return;
  requireString(failures, artifact.label, `${path}.label`);
  requireString(failures, artifact.path, `${path}.path`);
  requireIsoDate(failures, artifact.capturedAt, `${path}.capturedAt`);
}

function validateCrossReferences(failures, evidence) {
  compareWhenPresent(
    failures,
    evidence.patient?.patientId,
    evidence.synthesisResult?.patientId,
    "patient.patientId 与 synthesisResult.patientId 必须一致。",
  );
  compareWhenPresent(
    failures,
    evidence.synthesisRequest?.inputTextHash,
    evidence.synthesisResult?.inputTextHash,
    "synthesisRequest.inputTextHash 与 synthesisResult.inputTextHash 必须一致。",
  );
}

function requireAudioSummary(failures, audio, path) {
  requireObject(failures, audio, `${path} 必须是对象。`);
  if (!isObject(audio)) return;
  requireString(failures, audio.mimeType, `${path}.mimeType`);
  if (typeof audio.mimeType === "string" && !supportedAudioMimeTypes.has(audio.mimeType)) {
    failures.push(`${path}.mimeType 必须是平台支持的 TTS 音频格式。`);
  }
  requireString(failures, audio.format, `${path}.format`);
  requirePositiveInteger(failures, audio.byteLength, `${path}.byteLength`);
  requireEqual(
    failures,
    audio.rawAudioStored,
    false,
    `${path}.rawAudioStored 必须为 false，不长期保存原始 TTS 音频。`,
  );
}

function validateNoForbiddenMarkers(failures, evidence) {
  const paths = [];
  collectForbiddenMarkerPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 包含 mock/demo/seed/fallback/fixed/manual 标记，不能作为正式 TTS 验收证据。`);
  }
}

function validateNoSensitiveEvidence(failures, evidence) {
  const paths = [];
  collectSensitiveEvidencePaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 包含敏感字段或原始载荷，不能作为正式 TTS 验收证据。`);
  }
}

function validateNoPlaceholders(failures, evidence) {
  const paths = [];
  collectPlaceholderPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 仍包含占位符，必须替换为现场真实 TTS 证据。`);
  }
}

function collectForbiddenMarkerPaths(value, path, paths) {
  if (typeof value === "string") {
    if (forbiddenMarkerPattern.test(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectForbiddenMarkerPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectForbiddenMarkerPaths(nested, `${path}.${key}`, paths);
  }
}

function collectSensitiveEvidencePaths(value, path, paths) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSensitiveEvidencePaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    const normalizedKey = normalizeKey(key);
    if (normalizedKey === "apikeyref" && isSecretRef(nested)) {
      continue;
    }
    if (normalizedKey.endsWith("hash")) {
      continue;
    }
    if (normalizedKey === "endpointref" && typeof nested === "string") {
      if (isUnsafeEndpointRefValue(nested)) {
        paths.push(nestedPath);
      }
      continue;
    }
    if (sensitiveEvidenceKeys.has(normalizedKey)) {
      paths.push(nestedPath);
      continue;
    }
    if (typeof nested === "string" && isUnsafeValue(nested)) {
      paths.push(nestedPath);
      continue;
    }
    collectSensitiveEvidencePaths(nested, nestedPath, paths);
  }
}

function collectPlaceholderPaths(value, path, paths) {
  if (typeof value === "string") {
    if (/<[^>]+>/.test(value)) paths.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectPlaceholderPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectPlaceholderPaths(nested, `${path}.${key}`, paths);
  }
}

function compareWhenPresent(failures, left, right, message) {
  if (left && right && left !== right) failures.push(message);
}

function requireObject(failures, value, message) {
  if (!isObject(value)) failures.push(message);
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
  }
}

function requireStringArray(failures, value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(`${label} 必须是非空文本数组。`);
    return;
  }
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      failures.push(`${label} 只能包含非空文本。`);
      return;
    }
  }
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

function requirePositiveInteger(failures, value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    failures.push(`${label} 必须是大于 0 的整数。`);
  }
}

function requireIntegerInRange(failures, value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    failures.push(`${label} 必须是 ${min} 到 ${max} 之间的整数。`);
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

function requireSecretRef(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  if (!value.startsWith("secret-manager://")) {
    failures.push(`${label} 必须使用 secret-manager:// 形式的密钥引用。`);
  }
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isUnsafeValue(value) {
  return (
    forbiddenMarkerPattern.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i.test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(value) ||
    /(?:[A-Za-z0-9+/]{40,}={0,2})/g.test(value)
  );
}

function isUnsafeEndpointRefValue(value) {
  if (forbiddenMarkerPattern.test(value)) return true;
  let url;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    return true;
  }
  return [...url.hostname.split("."), ...url.pathname.split("/")]
    .filter(Boolean)
    .some(isUnsafeEndpointUrlPart);
}

function isUnsafeEndpointUrlPart(value) {
  if (value.toLowerCase() === "token-plan-cn") return false;
  return isUnsafeValue(value);
}

function isSecretRef(value) {
  return typeof value === "string" && value.startsWith("secret-manager://");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEvidenceFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function cli() {
  const evidencePath =
    process.argv.slice(2).find((arg) => arg !== "--") ??
    process.env.TTS_SPEECH_OUTPUT_EVIDENCE_FILE;

  if (!evidencePath) {
    console.error(
      "缺少证据文件路径。请传入 JSON 文件路径，或设置 TTS_SPEECH_OUTPUT_EVIDENCE_FILE。",
    );
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), evidencePath);
  if (!existsSync(absolutePath)) {
    console.error(`证据文件不存在：${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  const result = validateTtsSpeechOutputEvidence(readEvidenceFile(absolutePath));
  if (result.failures.length) {
    console.error("TTS 语音输出验收证据校验失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("TTS 语音输出验收证据校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
