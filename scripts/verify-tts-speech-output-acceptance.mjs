#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

const requiredConsentTypes = ["privacy_policy", "ai_processing"];
const expectedProvider = "xiaomi-mimo-tts";
const expectedAction = "ai.tts_speech_output.generate";
const expectedSource = "provider_text_to_speech";
const supportedAudioMimeTypes = new Set(["audio/wav"]);
const supportedWavChannels = new Set([1, 2]);
const supportedWavSampleRates = new Set([
  8000, 16000, 22050, 24000, 32000, 44100, 48000,
]);
const supportedWavBitsPerSample = new Set([8, 16, 24, 32]);
const forbiddenMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|seed|fallback|fixed|manual|synthetic)([^a-z0-9]|$)/i;
const forbiddenMarkerKeyPattern =
  /(mock|demo|seed|fallback|fixed|manual|synthetic)/i;
const allowedAuditMetadataKeys = new Set([
  "provider",
  "modelVersion",
  "callId",
  "endpointRef",
  "source",
  "calledAt",
  "voiceId",
  "scenario",
  "inputTextHash",
  "audio",
]);
const allowedAuditAudioMetadataKeys = new Set([
  "mimeType",
  "format",
  "byteLength",
]);

export async function verifyTtsSpeechOutputAcceptance({
  apiBaseUrl,
  patientAccount,
  patientPassword,
  auditAccount,
  auditPassword,
  patientId,
  text,
  scenario = "assessment_prompt",
} = {}) {
  const failures = [];

  const apiBaseUrlValidation = validateHttpsUrl(apiBaseUrl);
  if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
    failures.push("apiBaseUrl 必须显式提供正式 API 地址。");
  } else if (!apiBaseUrlValidation.valid) {
    failures.push("apiBaseUrl 必须使用正式 HTTPS 地址。");
  } else if (forbiddenMarkerPattern.test(apiBaseUrl)) {
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
  requireString(failures, text, "text");
  if (typeof text === "string" && forbiddenMarkerPattern.test(text)) {
    failures.push("text 不能包含 mock/demo/seed/fallback/fixed/manual 标记。");
  }
  requireString(failures, scenario, "scenario");

  if (failures.length) return { failures };

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

  const output = await postJson(failures, {
    client: patientClient,
    path: "/ai/tts-speech-outputs",
    label: "TTS 语音输出 API",
    expectedType: "object",
    body: {
      patientId,
      text,
      scenario,
    },
  });
  if (!output) return { failures };

  verifyTtsResponse(failures, {
    output,
    expectedPatientId: patientId,
    expectedScenario: scenario,
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
    ttsEvidence: output.ttsEvidence,
  });

  return { failures };
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
      failures.push(`患者缺少有效 ${consentType} 授权，不能执行 TTS 验收。`);
    }
  }
}

function verifyTtsResponse(
  failures,
  { output, expectedPatientId, expectedScenario },
) {
  compareFields(failures, "TTS 语音输出响应", output, {
    patientId: expectedPatientId,
    status: "synthesized",
  });
  const audio = output.audio;
  if (!isObject(audio)) {
    failures.push("TTS 语音输出响应 audio 必须是对象。");
  } else {
    requireString(failures, audio.contentBase64, "audio.contentBase64");
    requireString(failures, audio.mimeType, "audio.mimeType");
    if (
      typeof audio.mimeType === "string" &&
      !supportedAudioMimeTypes.has(audio.mimeType)
    ) {
      failures.push("audio.mimeType 必须是 audio/wav。");
    }
    if (!Number.isInteger(audio.byteLength) || audio.byteLength <= 0) {
      failures.push("audio.byteLength 必须是大于 0 的整数。");
    }
    if (typeof audio.contentBase64 === "string") {
      const bytes = decodeBase64Bytes(audio.contentBase64);
      if (!bytes) {
        failures.push("audio.contentBase64 必须是有效 Base64 WAV 音频。");
      } else {
        if (
          Number.isInteger(audio.byteLength) &&
          audio.byteLength !== bytes.length
        ) {
          failures.push(
            `audio.byteLength 必须等于 Base64 解码后的实际字节数 ${bytes.length}。`,
          );
        }
        const wavFailure = validateWavBytes(bytes);
        if (wavFailure) {
          failures.push(
            `audio.contentBase64 不是受支持的完整 WAV：${wavFailure}`,
          );
        }
      }
    }
  }

  const evidence = output.ttsEvidence;
  if (!isObject(evidence)) {
    failures.push("ttsEvidence 必须是对象。");
    return;
  }
  compareFields(failures, "ttsEvidence", evidence, {
    provider: expectedProvider,
    source: expectedSource,
    scenario: expectedScenario,
  });
  requireString(failures, evidence.modelVersion, "ttsEvidence.modelVersion");
  requireString(failures, evidence.callId, "ttsEvidence.callId");
  requireString(failures, evidence.voiceId, "ttsEvidence.voiceId");
  requireString(failures, evidence.inputTextHash, "ttsEvidence.inputTextHash");
  if (
    typeof evidence.inputTextHash === "string" &&
    !/^[a-f0-9]{64}$/i.test(evidence.inputTextHash)
  ) {
    failures.push("ttsEvidence.inputTextHash 必须是 64 位十六进制 SHA-256。");
  }
  requireIsoDate(failures, evidence.calledAt, "ttsEvidence.calledAt");
  requireHttpsUrl(failures, evidence.endpointRef, "ttsEvidence.endpointRef");
  validateNoForbiddenMarkers(failures, output, "TTS 语音输出响应");
  if (!isObject(evidence.audio)) {
    failures.push("ttsEvidence.audio 必须是对象。");
    return;
  }
  compareFields(failures, "ttsEvidence.audio", evidence.audio, {
    mimeType: audio?.mimeType,
    format: "wav",
    byteLength: audio?.byteLength,
  });
}

async function verifyAuditLog(failures, { client, patientId, ttsEvidence }) {
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
    label: "TTS 语音输出审计 API",
    expectedType: "array",
  });
  if (!logs) return;
  if (!Array.isArray(logs)) {
    failures.push("TTS 语音输出审计 API 返回值必须是数组。");
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
      `TTS 成功审计候选必须恰好 1 条，实际为 ${candidates.length} 条。`,
    );
    return;
  }

  const metadata = candidates[0].metadata;
  if (
    metadata?.provider !== ttsEvidence.provider ||
    metadata?.modelVersion !== ttsEvidence.modelVersion ||
    metadata?.callId !== ttsEvidence.callId ||
    metadata?.endpointRef !== ttsEvidence.endpointRef ||
    metadata?.source !== ttsEvidence.source ||
    metadata?.calledAt !== ttsEvidence.calledAt ||
    metadata?.voiceId !== ttsEvidence.voiceId ||
    metadata?.scenario !== ttsEvidence.scenario ||
    metadata?.inputTextHash !== ttsEvidence.inputTextHash ||
    !valuesEqual(metadata?.audio, ttsEvidence.audio)
  ) {
    failures.push("未找到与 TTS 供应商调用证据匹配的成功审计日志。");
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
    return `${label} 返回 HTTP ${status}：响应体已隐藏，避免泄露账号口令、cookie、密钥、音频或完整文本。`;
  }
  return `${label} 请求失败：错误详情已隐藏，避免泄露账号口令、cookie、密钥、音频或完整文本。`;
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

function decodeBase64Bytes(contentBase64) {
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) ||
    contentBase64.length % 4 === 1 ||
    (contentBase64.includes("=") && contentBase64.length % 4 !== 0)
  ) {
    return null;
  }
  const bytes = Buffer.from(contentBase64, "base64");
  const normalizedInput = contentBase64.replace(/=+$/, "");
  const normalizedDecoded = bytes.toString("base64").replace(/=+$/, "");
  return normalizedInput === normalizedDecoded ? bytes : null;
}

function validateWavBytes(bytes) {
  if (bytes.length < 44) return "文件短于最小 WAV 结构。";
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF") {
    return "缺少 RIFF 标识。";
  }
  if (bytes.readUInt32LE(4) !== bytes.length - 8) {
    return "RIFF size 与完整文件长度不一致。";
  }
  if (bytes.subarray(8, 12).toString("ascii") !== "WAVE") {
    return "缺少 WAVE 标识。";
  }

  let offset = 12;
  let format;
  let dataSize;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return "chunk header 越过文件边界。";
    const chunkId = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;
    const paddedChunkEnd = chunkDataEnd + (chunkSize % 2);
    if (chunkDataEnd > bytes.length || paddedChunkEnd > bytes.length) {
      return `chunk ${chunkId} 的数据或 padding 越过文件边界。`;
    }

    if (chunkId === "fmt ") {
      if (format) return "fmt chunk 不能重复。";
      if (dataSize !== undefined) return "fmt chunk 必须位于 data chunk 之前。";
      if (chunkSize !== 16) return "fmt chunk 必须是 16 字节 PCM 格式。";
      format = {
        audioFormat: bytes.readUInt16LE(chunkDataStart),
        channels: bytes.readUInt16LE(chunkDataStart + 2),
        sampleRate: bytes.readUInt32LE(chunkDataStart + 4),
        byteRate: bytes.readUInt32LE(chunkDataStart + 8),
        blockAlign: bytes.readUInt16LE(chunkDataStart + 12),
        bitsPerSample: bytes.readUInt16LE(chunkDataStart + 14),
      };
    } else if (chunkId === "data") {
      if (dataSize !== undefined) return "data chunk 不能重复。";
      if (!format) return "data chunk 之前必须存在 fmt chunk。";
      if (chunkSize === 0) return "data chunk 不能为空。";
      dataSize = chunkSize;
    }

    offset = paddedChunkEnd;
  }

  if (!format) return "缺少 fmt chunk。";
  if (dataSize === undefined) return "缺少 data chunk。";
  if (format.audioFormat !== 1) return "仅支持 PCM 编码 audioFormat=1。";
  if (!supportedWavChannels.has(format.channels)) {
    return "仅支持 1 或 2 声道。";
  }
  if (!supportedWavSampleRates.has(format.sampleRate)) {
    return "采样率不在受支持集合内。";
  }
  if (!supportedWavBitsPerSample.has(format.bitsPerSample)) {
    return "位深不在受支持集合内。";
  }
  const expectedBlockAlign = format.channels * (format.bitsPerSample / 8);
  if (format.blockAlign !== expectedBlockAlign) {
    return "blockAlign 与声道和位深不一致。";
  }
  if (format.byteRate !== format.sampleRate * format.blockAlign) {
    return "byteRate 与采样率和 blockAlign 不一致。";
  }
  if (dataSize % format.blockAlign !== 0) {
    return "data chunk 字节数必须按 blockAlign 对齐。";
  }
  return null;
}

function validateNoForbiddenMarkers(failures, value, label) {
  const paths = [];
  collectForbiddenMarkerPaths(value, label, paths);
  for (const path of new Set(paths)) {
    failures.push(
      `${path} 包含 mock/demo/seed/fallback/fixed/manual/synthetic 标记，不能作为正式 TTS 验收结果。`,
    );
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
    const nestedPath = `${path}.${key}`;
    if (forbiddenMarkerKeyPattern.test(key)) paths.push(nestedPath);
    collectForbiddenMarkerPaths(nested, nestedPath, paths);
  }
}

function validateAuditMetadataSafe(failures, metadata) {
  if (!isObject(metadata)) {
    failures.push("TTS 语音输出审计 metadata 必须是对象。");
    return;
  }

  const unsafePaths = [];
  collectUnsafeMetadataPaths(metadata, "审计 metadata", unsafePaths);
  for (const path of unsafePaths) {
    failures.push(
      `${path} 包含敏感字段或原始载荷，不能作为正式 TTS 审计记录。`,
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
    if (key === "inputTextHash") {
      if (typeof nested !== "string" || !/^[a-f0-9]{64}$/i.test(nested)) {
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
      forbiddenMarkerKeyPattern.test(key)
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
    forbiddenMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(
      value,
    ) ||
    base64LikePattern().test(value)
  );
}

function isUnsafeCallIdValue(value) {
  if (
    forbiddenMarkerPattern.test(value) ||
    bearerTokenPattern().test(value) ||
    /\b(?:sk|ak|api[_-]?key|secret|token)[_-]?[A-Za-z0-9._~+/=-]{8,}\b/i.test(
      value,
    )
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

function bearerTokenPattern() {
  return /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}(?![A-Za-z0-9._~+/=-])/i;
}

function base64LikePattern() {
  return /(?:[A-Za-z0-9+/]{40,}={0,2})/;
}

function isUnsafeEndpointRefValue(value) {
  if (forbiddenMarkerPattern.test(value)) return true;
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
    process.env.TTS_SPEECH_OUTPUT_ACCEPTANCE_CONFIG;

  if (!configPath) {
    console.error(
      "缺少配置文件路径。请传入 JSON 文件路径，或设置 TTS_SPEECH_OUTPUT_ACCEPTANCE_CONFIG。",
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

  const result = await verifyTtsSpeechOutputAcceptance(readResult.value);
  if (result.failures.length) {
    console.error("TTS 语音输出现场验收失败：");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("TTS 语音输出现场验收通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli();
}
