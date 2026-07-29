import test from "node:test";
import assert from "node:assert/strict";
import { validateSpeechTranscriptEvidence } from "../verify-speech-transcript-evidence.mjs";

function validEvidence(overrides = {}) {
  return deepMerge(
    {
      evidenceVersion: "speech-transcript-acceptance/v1",
      acceptance: {
        acceptedAt: "2026-05-27T10:00:00.000Z",
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
        microphoneConsentId: "consent_microphone_real_001",
        consentType: "microphone_capture",
        consentVersion: "v1.2",
        grantedAt: "2026-05-27T09:50:00.000Z",
        status: "granted",
      },
      speechProvider: {
        provider: "xiaomi-mimo-audio-understanding",
        modelVersion: "mimo-v2.5",
        endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
        apiKeyRef: "secret-manager://speech/xiaomi-mimo-key",
        accountOwner: "客户供应商账号负责人",
        callLogRetentionDays: 180,
      },
      audioCapture: {
        mimeType: "audio/wav",
        durationSeconds: 42,
        capturedAt: "2026-05-27T09:58:00.000Z",
        rawAudioStored: false,
        browserRecorder: "MediaRecorder",
      },
      transcriptResult: {
        patientId: "patient_real_001",
        assessmentType: "MMSE/CDR",
        status: "transcribed",
        transcript: "今天是星期三，我记得苹果、桌子、硬币三个词。",
        callId: "speech-call-real-001",
        calledAt: "2026-05-27T09:58:45.000Z",
        source: "provider_audio_understanding",
      },
      humanReview: {
        required: true,
        reviewerUserId: "doctor_real_001",
        reviewedAt: "2026-05-27T10:02:00.000Z",
        nextAction: "generate_ai_assessment_draft",
        formalAssessmentCreatedAutomatically: false,
      },
      auditEvidence: {
        auditLogIds: ["audit_speech_transcript_001"],
        requiredActions: ["ai.assessment_speech_transcript.generate"],
        checkedAt: "2026-05-27T10:05:00.000Z",
      },
      artifacts: {
        screenshots: [
          {
            label: "评估页语音转写回填",
            path: "artifacts/speech-transcript-filled.png",
            capturedAt: "2026-05-27T10:03:00.000Z",
          },
        ],
      },
    },
    overrides,
  );
}

test("speech transcript evidence accepts complete real provider acceptance data", () => {
  const result = validateSpeechTranscriptEvidence(validEvidence());

  assert.deepEqual(result.failures, []);
});

test("speech transcript evidence rejects browser webm as formal provider audio", () => {
  const result = validateSpeechTranscriptEvidence(
    validEvidence({
      audioCapture: {
        mimeType: "audio/webm",
      },
    }),
  );

  assert.match(result.failures.join("\n"), /正式音频格式/);
});

test("speech transcript evidence rejects missing microphone consent and automatic assessment creation", () => {
  const evidence = validEvidence({
    consent: {
      status: "revoked",
    },
    humanReview: {
      formalAssessmentCreatedAutomatically: true,
    },
  });

  const result = validateSpeechTranscriptEvidence(evidence);

  assert.match(result.failures.join("\n"), /microphone_capture/);
  assert.match(result.failures.join("\n"), /不会自动创建正式评估/);
});

test("speech transcript evidence rejects non Xiaomi provider and local endpoints", () => {
  const evidence = validEvidence({
    speechProvider: {
      provider: "vendor-standard-stt",
      endpointRef: "http://localhost:9000/stt",
      apiKeyRef: "raw-key-value",
    },
  });

  const result = validateSpeechTranscriptEvidence(evidence);

  assert.match(result.failures.join("\n"), /小米 MiMo 音频理解协议/);
  assert.match(result.failures.join("\n"), /正式 HTTPS/);
  assert.match(result.failures.join("\n"), /secret-manager/);
});

test("speech transcript evidence rejects demo, mock, seed, fixed, fallback, and manual markers", () => {
  const evidence = validEvidence({
    patient: {
      patientId: "patient_seed_001",
    },
    transcriptResult: {
      transcript: "demo fixed transcript fallback manual",
    },
  });

  const result = validateSpeechTranscriptEvidence(evidence);

  assert.match(result.failures.join("\n"), /mock\/demo\/seed\/fallback\/fixed\/manual/);
});

test("speech transcript evidence rejects unresolved placeholders", () => {
  const evidence = validEvidence({
    speechProvider: {
      endpointRef: "https://<speech-endpoint>",
    },
  });

  const result = validateSpeechTranscriptEvidence(evidence);

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
