#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedEvidenceVersion = "speech-transcript-acceptance/v1";
const expectedProvider = "xiaomi-mimo-audio-understanding";
const requiredAuditActions = ["ai.assessment_speech_transcript.generate"];
const supportedAudioMimeTypes = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
]);
const demoMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual)([^a-z0-9]|$)/i;

export function validateSpeechTranscriptEvidence(evidence) {
  const failures = [];

  if (!isObject(evidence)) {
    return { failures: ["证据文件必须是 JSON 对象。"] };
  }

  requireEqual(
    failures,
    evidence.evidenceVersion,
    expectedEvidenceVersion,
    "evidenceVersion 必须使用 speech-transcript-acceptance/v1。",
  );

  validateAcceptance(failures, evidence.acceptance);
  validateBrowser(failures, evidence.browser);
  validatePatient(failures, evidence.patient);
  validateConsent(failures, evidence.consent);
  validateSpeechProvider(failures, evidence.speechProvider);
  validateAudioCapture(failures, evidence.audioCapture);
  validateTranscriptResult(failures, evidence.transcriptResult);
  validateHumanReview(failures, evidence.humanReview);
  validateAuditEvidence(failures, evidence.auditEvidence);
  validateArtifacts(failures, evidence.artifacts);
  validateCrossReferences(failures, evidence);
  validateNoDemoMarkers(failures, evidence);
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
  requireString(
    failures,
    consent.microphoneConsentId,
    "consent.microphoneConsentId",
  );
  requireEqual(
    failures,
    consent.consentType,
    "microphone_capture",
    "consent.consentType 必须是 microphone_capture。",
  );
  requireString(failures, consent.consentVersion, "consent.consentVersion");
  requireIsoDate(failures, consent.grantedAt, "consent.grantedAt");
  requireEqual(
    failures,
    consent.status,
    "granted",
    "microphone_capture 授权必须处于 granted 状态。",
  );
}

function validateSpeechProvider(failures, speechProvider) {
  requireObject(failures, speechProvider, "speechProvider 必须是对象。");
  if (!isObject(speechProvider)) return;
  requireEqual(
    failures,
    speechProvider.provider,
    expectedProvider,
    "speechProvider.provider 必须使用小米 MiMo 音频理解协议。",
  );
  requireString(failures, speechProvider.modelVersion, "speechProvider.modelVersion");
  requireHttpsUrl(failures, speechProvider.endpointRef, "speechProvider.endpointRef");
  requireSecretRef(failures, speechProvider.apiKeyRef, "speechProvider.apiKeyRef");
  requireString(failures, speechProvider.accountOwner, "speechProvider.accountOwner");
  requireIntegerInRange(
    failures,
    speechProvider.callLogRetentionDays,
    "speechProvider.callLogRetentionDays",
    30,
    3650,
  );
}

function validateAudioCapture(failures, audioCapture) {
  requireObject(failures, audioCapture, "audioCapture 必须是对象。");
  if (!isObject(audioCapture)) return;
  requireString(failures, audioCapture.mimeType, "audioCapture.mimeType");
  if (
    typeof audioCapture.mimeType === "string" &&
    !supportedAudioMimeTypes.has(audioCapture.mimeType)
  ) {
    failures.push("audioCapture.mimeType 必须是小米音频理解支持的正式音频格式。");
  }
  requirePositiveInteger(
    failures,
    audioCapture.durationSeconds,
    "audioCapture.durationSeconds",
  );
  requireIsoDate(failures, audioCapture.capturedAt, "audioCapture.capturedAt");
  requireEqual(
    failures,
    audioCapture.rawAudioStored,
    false,
    "audioCapture.rawAudioStored 必须为 false，不长期保存原始音频。",
  );
  requireString(failures, audioCapture.browserRecorder, "audioCapture.browserRecorder");
}

function validateTranscriptResult(failures, transcriptResult) {
  requireObject(failures, transcriptResult, "transcriptResult 必须是对象。");
  if (!isObject(transcriptResult)) return;
  requireString(failures, transcriptResult.patientId, "transcriptResult.patientId");
  requireEqual(
    failures,
    transcriptResult.assessmentType,
    "MMSE/CDR",
    "transcriptResult.assessmentType 必须是 MMSE/CDR。",
  );
  requireEqual(
    failures,
    transcriptResult.status,
    "transcribed",
    "transcriptResult.status 必须是 transcribed。",
  );
  requireString(failures, transcriptResult.transcript, "transcriptResult.transcript");
  requireString(failures, transcriptResult.callId, "transcriptResult.callId");
  requireIsoDate(failures, transcriptResult.calledAt, "transcriptResult.calledAt");
  requireEqual(
    failures,
    transcriptResult.source,
    "provider_audio_understanding",
    "transcriptResult.source 必须是 provider_audio_understanding。",
  );
}

function validateHumanReview(failures, humanReview) {
  requireObject(failures, humanReview, "humanReview 必须是对象。");
  if (!isObject(humanReview)) return;
  requireEqual(
    failures,
    humanReview.required,
    true,
    "humanReview.required 必须显式为 true。",
  );
  requireString(failures, humanReview.reviewerUserId, "humanReview.reviewerUserId");
  requireIsoDate(failures, humanReview.reviewedAt, "humanReview.reviewedAt");
  requireString(failures, humanReview.nextAction, "humanReview.nextAction");
  requireEqual(
    failures,
    humanReview.formalAssessmentCreatedAutomatically,
    false,
    "语音转写只回填待复核文本，不会自动创建正式评估。",
  );
}

function validateAuditEvidence(failures, auditEvidence) {
  requireObject(failures, auditEvidence, "auditEvidence 必须是对象。");
  if (!isObject(auditEvidence)) return;
  requireStringArray(
    failures,
    auditEvidence.auditLogIds,
    "auditEvidence.auditLogIds",
  );
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
    failures.push("artifacts.screenshots 至少需要一张语音转写验收截图。");
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
    evidence.transcriptResult?.patientId,
    "patient.patientId 与 transcriptResult.patientId 必须一致。",
  );
}

function validateNoDemoMarkers(failures, evidence) {
  const paths = [];
  collectDemoMarkerPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 包含 mock/demo/seed/fallback/fixed/manual 标记，不能作为正式语音转写验收证据。`);
  }
}

function validateNoPlaceholders(failures, evidence) {
  const paths = [];
  collectPlaceholderPaths(evidence, "$", paths);
  for (const path of paths) {
    failures.push(`${path} 仍包含占位符，必须替换为现场真实语音转写证据。`);
  }
}

function collectDemoMarkerPaths(value, path, paths) {
  if (typeof value === "string") {
    if (demoMarkerPattern.test(value)) {
      paths.push(path);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDemoMarkerPaths(item, `${path}[${index}]`, paths),
    );
    return;
  }

  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectDemoMarkerPaths(nested, `${path}.${key}`, paths);
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEvidenceFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function cli() {
  const evidencePath =
    process.argv.slice(2).find((arg) => arg !== "--") ??
    process.env.SPEECH_TRANSCRIPT_EVIDENCE_FILE;

  if (!evidencePath) {
    console.error(
      "缺少证据文件路径。请传入 JSON 文件路径，或设置 SPEECH_TRANSCRIPT_EVIDENCE_FILE。",
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

  const result = validateSpeechTranscriptEvidence(readEvidenceFile(absolutePath));
  if (result.failures.length) {
    console.error("语音转写验收证据校验失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("语音转写验收证据校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
