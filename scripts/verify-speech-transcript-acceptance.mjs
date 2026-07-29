#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const requiredConsentTypes = [
  "privacy_policy",
  "ai_processing",
  "microphone_capture",
];
const expectedProvider = "xiaomi-mimo-audio-understanding";
const expectedAction = "ai.assessment_speech_transcript.generate";
const expectedSource = "provider_audio_understanding";
const supportedAudioMimeTypes = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
]);
const demoMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual|synthetic)([^a-z0-9]|$)/i;
const demoMarkerKeyPattern =
  /(mock|demo|seed|fallback|fixed|manual|synthetic)/i;
const allowedAuditMetadataKeys = new Set([
  "provider",
  "modelVersion",
  "callId",
  "endpointRef",
  "source",
  "calledAt",
  "audio",
]);
const allowedAuditAudioMetadataKeys = new Set(["mimeType", "durationSeconds"]);

export async function verifySpeechTranscriptAcceptance({
  apiBaseUrl,
  patientAccount,
  patientPassword,
  auditAccount,
  auditPassword,
  patientId,
  assessmentType = "MMSE/CDR",
  audioFilePath,
  audioMimeType,
  durationSeconds,
} = {}) {
  const failures = [];

  const apiBaseUrlValidation = validateHttpsUrl(apiBaseUrl);
  if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
    failures.push("apiBaseUrl 必须显式提供正式 API 地址。");
  } else if (!apiBaseUrlValidation.valid) {
    failures.push("apiBaseUrl 必须使用正式 HTTPS 地址。");
  } else if (demoMarkerPattern.test(apiBaseUrl)) {
    failures.push(
      "apiBaseUrl 不能包含 mock/demo/seed/fallback/fixed/manual 标记。",
    );
  }
  requireString(failures, patientAccount, "patientAccount");
  requireString(failures, patientPassword, "patientPassword");
  requireString(failures, auditAccount, "auditAccount");
  requireString(failures, auditPassword, "auditPassword");
  if (
    typeof patientAccount === "string" &&
    typeof auditAccount === "string" &&
    patientAccount.trim() &&
    patientAccount.trim() === auditAccount.trim()
  ) {
    failures.push("patientAccount 与 auditAccount 必须使用不同账号。");
  }
  requireString(failures, patientId, "patientId");
  validateAudioInputConfig(failures, {
    audioFilePath,
    audioMimeType,
    durationSeconds,
  });

  if (failures.length) return { failures };

  const audioContentBase64 = readAudioFileAsBase64(failures, audioFilePath);
  if (!audioContentBase64) return { failures };

  const patientClient = new CookieSessionClient(apiBaseUrl);
  const patientLoggedIn = await loginSession(failures, {
    client: patientClient,
    account: patientAccount,
    password: patientPassword,
    label: "患者验收账号",
  });
  if (!patientLoggedIn) return { failures };

  const patient = await fetchJson(failures, {
    client: patientClient,
    path: `/patients/${encodeURIComponent(patientId)}`,
    label: "患者详情 API",
    expectedType: "object",
  });
  if (!patient) return { failures };

  verifyRequiredConsents(failures, patient.consents);
  if (failures.length) return { failures };

  const transcript = await postJson(failures, {
    client: patientClient,
    path: "/ai/assessment-speech-transcripts",
    label: "语音转写 API",
    expectedType: "object",
    body: {
      patientId,
      assessmentType,
      audio: {
        contentBase64: audioContentBase64,
        mimeType: audioMimeType,
        durationSeconds,
      },
    },
  });
  if (!transcript) return { failures };

  verifyTranscriptResponse(failures, {
    transcript,
    expectedPatientId: patientId,
    expectedAssessmentType: assessmentType,
    expectedAudioMimeType: audioMimeType,
    expectedDurationSeconds: durationSeconds,
  });
  if (failures.length) return { failures };

  const auditClient = new CookieSessionClient(apiBaseUrl);
  const auditLoggedIn = await loginSession(failures, {
    client: auditClient,
    account: auditAccount,
    password: auditPassword,
    label: "审计验收账号",
  });
  if (!auditLoggedIn) return { failures };

  await verifyAuditLog(failures, {
    client: auditClient,
    patientId,
    speechEvidence: transcript.speechEvidence,
  });

  return { failures };
}

function validateAudioInputConfig(
  failures,
  { audioFilePath, audioMimeType, durationSeconds },
) {
  requireString(failures, audioFilePath, "audioFilePath");
  requireString(failures, audioMimeType, "audioMimeType");
  if (
    typeof audioMimeType === "string" &&
    !supportedAudioMimeTypes.has(audioMimeType)
  ) {
    failures.push("audioMimeType 必须是小米音频理解支持的正式音频格式。");
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    failures.push("durationSeconds 必须是大于 0 的整数。");
  }
}

function verifyRequiredConsents(failures, consents) {
  if (!Array.isArray(consents)) {
    failures.push("患者详情 API 返回的 consents 必须是数组。");
    return;
  }

  for (const consentType of requiredConsentTypes) {
    const record = consents.find(
      (consent) =>
        consent?.consentType === consentType &&
        consent.status === "granted" &&
        !consent.revokedAt,
    );
    if (!record) {
      failures.push(`患者缺少有效 ${consentType} 授权，不能执行语音转写验收。`);
    }
  }
}

function readAudioFileAsBase64(failures, audioFilePath) {
  const absolutePath = resolve(process.cwd(), audioFilePath);
  if (!existsSync(absolutePath)) {
    failures.push(`音频文件不存在：${absolutePath}`);
    return undefined;
  }
  const bytes = readFileSync(absolutePath);
  if (bytes.length <= 0) {
    failures.push(`音频文件为空：${absolutePath}`);
    return undefined;
  }
  return bytes.toString("base64");
}

function verifyTranscriptResponse(
  failures,
  {
    transcript,
    expectedPatientId,
    expectedAssessmentType,
    expectedAudioMimeType,
    expectedDurationSeconds,
  },
) {
  compareFields(failures, "语音转写响应", transcript, {
    patientId: expectedPatientId,
    assessmentType: expectedAssessmentType,
    status: "transcribed",
  });
  requireString(failures, transcript.transcript, "transcript");
  const evidence = transcript.speechEvidence;
  if (!isObject(evidence)) {
    failures.push("speechEvidence 必须是对象。");
    return;
  }
  compareFields(failures, "speechEvidence", evidence, {
    provider: expectedProvider,
    source: expectedSource,
  });
  requireString(failures, evidence.modelVersion, "speechEvidence.modelVersion");
  requireString(failures, evidence.callId, "speechEvidence.callId");
  requireIsoDate(failures, evidence.calledAt, "speechEvidence.calledAt");
  requireHttpsUrl(failures, evidence.endpointRef, "speechEvidence.endpointRef");
  validateNoDemoMarkers(failures, transcript, "语音转写响应");
  if (!isObject(evidence.audio)) {
    failures.push("speechEvidence.audio 必须是对象。");
    return;
  }
  compareFields(failures, "speechEvidence.audio", evidence.audio, {
    mimeType: expectedAudioMimeType,
    durationSeconds: expectedDurationSeconds,
  });
}

async function verifyAuditLog(failures, { client, patientId, speechEvidence }) {
  const searchParams = new URLSearchParams({
    action: expectedAction,
    targetType: "patient_profile",
    targetId: patientId,
    result: "success",
    limit: "200",
  });

  const logs = await fetchJson(failures, {
    client,
    path: `/admin/audit-logs?${searchParams}`,
    label: "语音转写审计 API",
    expectedType: "array",
  });
  if (!logs) return;
  if (!Array.isArray(logs)) {
    failures.push("语音转写审计 API 返回值必须是数组。");
    return;
  }

  const candidates = logs.filter(
    (log) =>
      log?.action === expectedAction &&
      log.targetType === "patient_profile" &&
      log.targetId === patientId &&
      log.result === "success",
  );
  for (const candidate of candidates) {
    validateAuditMetadataSafe(failures, candidate.metadata);
  }
  if (candidates.length !== 1) {
    failures.push(
      `语音转写成功审计候选必须恰好 1 条，实际为 ${candidates.length} 条。`,
    );
    return;
  }

  const metadata = candidates[0].metadata;
  if (
    metadata?.provider !== speechEvidence.provider ||
    metadata?.modelVersion !== speechEvidence.modelVersion ||
    metadata?.callId !== speechEvidence.callId ||
    metadata?.endpointRef !== speechEvidence.endpointRef ||
    metadata?.source !== speechEvidence.source ||
    metadata?.calledAt !== speechEvidence.calledAt ||
    !valuesEqual(metadata?.audio, speechEvidence.audio)
  ) {
    failures.push("未找到与语音供应商调用证据匹配的成功审计日志。");
  }
}

async function loginSession(failures, { client, account, password, label }) {
  try {
    await client.login(account, password);
    return true;
  } catch (error) {
    failures.push(formatRequestFailure(`${label}登录 API`, error));
    return false;
  }
}

async function fetchJson(failures, { client, path, label, expectedType }) {
  return requestJson(failures, {
    client,
    path,
    label,
    expectedType,
    method: "GET",
  });
}

async function postJson(failures, { client, path, label, expectedType, body }) {
  return requestJson(failures, {
    client,
    path,
    label,
    expectedType,
    method: "POST",
    body,
  });
}

async function requestJson(
  failures,
  { client, path, label, expectedType, method, body },
) {
  try {
    const value = await client.request(path, {
      method,
      headers: {
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body }),
    });
    if (responseType(value) !== expectedType) {
      failures.push(
        `${label} response：期望类型 ${expectedType}，实际类型 ${responseType(value)}。`,
      );
      return null;
    }
    return value;
  } catch (error) {
    failures.push(formatRequestFailure(label, error));
    return null;
  }
}

function formatRequestFailure(label, error) {
  const status = String(error?.message ?? "").match(/^HTTP (\d{3})\b/)?.[1];
  if (status) {
    return `${label} 返回 HTTP ${status}：响应体已隐藏，避免泄露账号口令、cookie、密钥、音频或完整转写。`;
  }
  return `${label} 请求失败：错误详情已隐藏，避免泄露账号口令、cookie、密钥、音频或完整转写。`;
}

function compareFields(failures, label, actual, expected) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[field];
    if (actualValue !== expectedValue) {
      failures.push(
        `${label}.${field}：期望类型 ${responseType(expectedValue)}，实际类型 ${responseType(actualValue)}，值不符合预期。`,
      );
    }
  }
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须显式提供非空文本。`);
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

function requireIsoDate(failures, value, label) {
  requireString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function validateNoDemoMarkers(failures, value, label) {
  const paths = [];
  collectDemoMarkerPaths(value, label, paths);
  for (const path of new Set(paths)) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual 标记，不能作为正式语音转写验收结果。`,
    );
  }
}

function collectDemoMarkerPaths(value, path, paths) {
  if (typeof value === "string") {
    if (demoMarkerPattern.test(value)) paths.push(path);
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
    const nestedPath = `${path}.${key}`;
    if (demoMarkerKeyPattern.test(key)) paths.push(nestedPath);
    collectDemoMarkerPaths(nested, nestedPath, paths);
  }
}

function validateAuditMetadataSafe(failures, metadata) {
  if (!isObject(metadata)) {
    failures.push("语音转写审计 metadata 必须是对象。");
    return;
  }

  const unsafePaths = [];
  collectUnsafeMetadataPaths(metadata, "审计 metadata", unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段或原始载荷，不能作为正式语音转写审计记录。`,
    );
  }
}

function collectUnsafeMetadataPaths(value, path, paths) {
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (!allowedAuditMetadataKeys.has(key)) {
      paths.push(nestedPath);
      continue;
    }
    if (key === "endpointRef" && typeof nested === "string") {
      if (isUnsafeEndpointRefValue(nested)) {
        paths.push(nestedPath);
      }
      continue;
    }
    if (key === "callId") {
      if (typeof nested !== "string" || isUnsafeCallIdValue(nested)) {
        paths.push(nestedPath);
      }
      continue;
    }
    if (key === "audio") {
      collectUnsafeAuditAudioMetadataPaths(nested, nestedPath, paths);
      continue;
    }
    if (typeof nested === "string" && isUnsafeMetadataValue(nested)) {
      paths.push(nestedPath);
      continue;
    }
    if (isObject(nested) || Array.isArray(nested)) paths.push(nestedPath);
  }
}

function collectUnsafeAuditAudioMetadataPaths(value, path, paths) {
  if (!isObject(value)) {
    paths.push(path);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (
      !allowedAuditAudioMetadataKeys.has(key) ||
      demoMarkerKeyPattern.test(key)
    ) {
      paths.push(nestedPath);
      continue;
    }
    if (typeof nested === "string" && isUnsafeMetadataValue(nested)) {
      paths.push(nestedPath);
      continue;
    }
    if (isObject(nested) || Array.isArray(nested)) paths.push(nestedPath);
  }
}

function isUnsafeMetadataValue(value) {
  return (
    demoMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(value) ||
    base64LikePattern().test(value)
  );
}

function isUnsafeCallIdValue(value) {
  if (
    demoMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    secretLikePattern().test(value)
  ) {
    return true;
  }
  if (/^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value)) {
    return false;
  }
  if (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  ) {
    return false;
  }
  return (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ||
    base64LikePattern().test(value)
  );
}

function isUnsafeEndpointRefValue(value) {
  if (demoMarkerPattern.test(value)) return true;
  let url;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return true;
  }
  return [...url.hostname.split("."), ...url.pathname.split("/")]
    .filter(Boolean)
    .some(isUnsafeEndpointUrlPart);
}

function isUnsafeEndpointUrlPart(value) {
  if (value.toLowerCase() === "token-plan-cn") return false;
  return isUnsafeMetadataValue(value);
}

function base64LikePattern() {
  return /(?:[A-Za-z0-9+/]{40,}={0,2})/g;
}

function bearerTokenPattern() {
  return /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}(?![A-Za-z0-9._~+/=-])/i;
}

function secretLikePattern() {
  return /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i;
}

function responseType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return { valid: false };
  try {
    const url = new URL(value);
    return { valid: url.protocol === "https:" };
  } catch {
    return { valid: false };
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readJsonFile(path) {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { error };
  }
}

async function cli() {
  const configPath =
    process.argv.slice(2).find((arg) => arg !== "--") ??
    process.env.SPEECH_TRANSCRIPT_ACCEPTANCE_CONFIG;

  if (!configPath) {
    console.error(
      "缺少配置文件路径。请传入 JSON 文件路径，或设置 SPEECH_TRANSCRIPT_ACCEPTANCE_CONFIG。",
    );
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), configPath);
  if (!existsSync(absolutePath)) {
    console.error(`配置文件不存在：${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  const readResult = readJsonFile(absolutePath);
  if (readResult.error) {
    console.error("配置文件不是有效 JSON：解析详情已隐藏。");
    process.exitCode = 1;
    return;
  }

  const result = await verifySpeechTranscriptAcceptance(readResult.value);
  if (result.failures.length) {
    console.error("语音转写现场验收失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("语音转写现场验收通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli();
}
