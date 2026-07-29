import test from "node:test";
import assert from "node:assert/strict";
import { validateTtsSpeechOutputEvidence } from "../verify-tts-speech-output-evidence.mjs";

function validEvidence(overrides = {}) {
  return deepMerge(
    {
      evidenceVersion: "tts-speech-output-acceptance/v1",
      acceptance: {
        acceptedAt: "2026-05-29T10:00:00.000Z",
        testerName: "现场验收员",
        siteName: "康复中心试点现场",
        environment: "trial",
      },
      browser: {
        name: "Chrome",
        version: "126.0.0.0",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
        pageUrl: "https://rehab.example.com/assessment",
      },
      patient: {
        patientId: "patient_real_001",
        patientExportId: "patient_export_8a72",
      },
      consent: {
        privacyConsentId: "consent_privacy_real_001",
        aiProcessingConsentId: "consent_ai_real_001",
        consentVersion: "v1.2",
        privacyStatus: "granted",
        aiProcessingStatus: "granted",
        grantedAt: "2026-05-29T09:50:00.000Z",
      },
      ttsProvider: {
        provider: "xiaomi-mimo-tts",
        modelVersion: "mimo-v2.5-tts",
        endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
        apiKeyRef: "secret-manager://tts/xiaomi-mimo-key",
        accountOwner: "客户供应商账号负责人",
        voiceId: "Chloe",
        callLogRetentionDays: 180,
      },
      synthesisRequest: {
        scenario: "assessment_prompt",
        inputTextHash:
          "3f8f0e7b1d0f3c6a42c77bd88d2e90bc67504a1a4a887a5e25f44fd595b7c57e",
        fullTextStored: false,
        sentThroughPlatformApi: true,
      },
      synthesisResult: {
        patientId: "patient_real_001",
        status: "synthesized",
        callId: "tts-call-real-001",
        calledAt: "2026-05-29T09:58:45.000Z",
        source: "provider_text_to_speech",
        inputTextHash:
          "3f8f0e7b1d0f3c6a42c77bd88d2e90bc67504a1a4a887a5e25f44fd595b7c57e",
        audio: {
          mimeType: "audio/wav",
          format: "wav",
          byteLength: 20480,
          rawAudioStored: false,
        },
      },
      playbackResult: {
        playedInBrowser: true,
        playedAt: "2026-05-29T09:59:00.000Z",
        userGesture: "assessment_play_tts_button",
        usedBrowserSpeechSynthesis: false,
        usedPreGeneratedAudio: false,
      },
      auditEvidence: {
        auditLogIds: ["audit_tts_output_001"],
        requiredActions: ["ai.tts_speech_output.generate"],
        checkedAt: "2026-05-29T10:05:00.000Z",
      },
      artifacts: {
        screenshots: [
          {
            label: "评估页 TTS 播放验收",
            path: "artifacts/tts-speech-output.png",
            capturedAt: "2026-05-29T10:03:00.000Z",
          },
        ],
      },
    },
    overrides,
  );
}

test("TTS speech output evidence accepts complete real provider acceptance data", () => {
  const result = validateTtsSpeechOutputEvidence(validEvidence());

  assert.deepEqual(result.failures, []);
});

test("TTS speech output evidence rejects browser speech synthesis and pre-generated audio", () => {
  const result = validateTtsSpeechOutputEvidence(
    validEvidence({
      playbackResult: {
        usedBrowserSpeechSynthesis: true,
        usedPreGeneratedAudio: true,
      },
    }),
  );

  assert.match(result.failures.join("\n"), /SpeechSynthesis/);
  assert.match(result.failures.join("\n"), /预生成音频/);
});

test("TTS speech output evidence rejects non Xiaomi provider and local endpoints", () => {
  const result = validateTtsSpeechOutputEvidence(
    validEvidence({
      ttsProvider: {
        provider: "vendor-tts",
        endpointRef: "http://localhost:9000/tts",
        apiKeyRef: "raw-key-value",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /小米 MiMo TTS/);
  assert.match(result.failures.join("\n"), /正式 HTTPS/);
  assert.match(result.failures.join("\n"), /secret-manager/);
});

test("TTS speech output evidence rejects full text, base64 audio, and fallback markers", () => {
  const result = validateTtsSpeechOutputEvidence(
    validEvidence({
      synthesisRequest: {
        text: "请告诉我今天是星期几？",
      },
      synthesisResult: {
        synthesizedAudioBase64: Buffer.from("formal-audio").toString("base64"),
      },
      playbackResult: {
        userGesture: "fallback-manual-play",
      },
    }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /敏感字段|原始载荷/);
  assert.match(failures, /fallback|manual/);
  assert.doesNotMatch(failures, /ttsProvider\.endpointRef/);
});

test("TTS speech output evidence rejects raw payload fields and token-like endpointRef URL parts", () => {
  const result = validateTtsSpeechOutputEvidence(
    validEvidence({
      ttsProvider: {
        endpointRef:
          "https://token-plan-secretabcdefgh.xiaomimimo.com/v1/chat/completions",
      },
      synthesisResult: {
        rawPayload: {
          providerRequestId: "provider-request-001",
          summary: "structured provider response envelope",
        },
      },
    }),
  );

  const failures = result.failures.join("\n");
  assert.match(failures, /ttsProvider\.endpointRef/);
  assert.match(failures, /synthesisResult\.rawPayload/);
});

test("TTS speech output evidence rejects unresolved placeholders", () => {
  const result = validateTtsSpeechOutputEvidence(
    validEvidence({
      ttsProvider: {
        voiceId: "<customer-approved-voice>",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /占位符/);
});

function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
