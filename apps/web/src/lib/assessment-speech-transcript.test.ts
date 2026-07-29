import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAssessmentSpeechTranscriptToForm,
  buildAssessmentSpeechTranscriptRequest,
  resolveSupportedAssessmentAudioMimeType,
} from "./assessment-speech-transcript.ts";
import type { AssessmentSpeechTranscriptResponse } from "@/types/api";

const form = {
  mmse: "",
  cdr: "",
  memory: "",
  orientation: "",
  executive: "",
  language: "",
  transcript: "原有手工记录",
  reactionDelaySeconds: "",
  modelVersion: "",
  confidence: "",
  analysisSummary: "",
  aiDraftEvidence: {
    provider: "xiaomi-mimo",
  },
};

test("buildAssessmentSpeechTranscriptRequest converts provider-ready audio bytes to API base64 payload", async () => {
  const request = await buildAssessmentSpeechTranscriptRequest({
    patientId: "patient-profile-id",
    assessmentType: "MMSE/CDR",
    audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: "audio/wav",
    }),
    startedAtMs: 1000,
    endedAtMs: 43000,
  });

  assert.equal(request.patientId, "patient-profile-id");
  assert.equal(request.assessmentType, "MMSE/CDR");
  assert.equal(request.audio.mimeType, "audio/wav");
  assert.equal(request.audio.durationSeconds, 42);
  assert.equal(request.audio.contentBase64, "AQIDBA==");
});

test("buildAssessmentSpeechTranscriptRequest transcodes browser webm recording to wav before provider upload", async () => {
  const originalAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = class FakeAudioContext {
    async decodeAudioData() {
      return {
        sampleRate: 8000,
        numberOfChannels: 1,
        length: 2,
        getChannelData() {
          return new Float32Array([0, 0.5]);
        },
      };
    }

    async close() {}
  } as unknown as typeof AudioContext;

  try {
    const request = await buildAssessmentSpeechTranscriptRequest({
      patientId: "patient-profile-id",
      assessmentType: "MMSE/CDR",
      audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: "audio/webm;codecs=opus",
      }),
      startedAtMs: 1000,
      endedAtMs: 43000,
    });

    assert.equal(request.audio.mimeType, "audio/wav");
    assert.equal(request.audio.durationSeconds, 42);
    assert.equal(base64AsciiSlice(request.audio.contentBase64, 0, 4), "RIFF");
    assert.equal(base64AsciiSlice(request.audio.contentBase64, 8, 12), "WAVE");
  } finally {
    globalThis.AudioContext = originalAudioContext;
  }
});

test("buildAssessmentSpeechTranscriptRequest keeps browser mp4 recording as provider-ready audio", async () => {
  const request = await buildAssessmentSpeechTranscriptRequest({
    patientId: "patient-profile-id",
    assessmentType: "MMSE/CDR",
    audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: "audio/mp4",
    }),
    startedAtMs: 1000,
    endedAtMs: 43000,
  });

  assert.equal(request.audio.mimeType, "audio/mp4");
  assert.equal(request.audio.contentBase64, "AQIDBA==");
});

test("buildAssessmentSpeechTranscriptRequest converts audio bytes without Node Buffer", async () => {
  const originalBuffer = globalThis.Buffer;
  globalThis.Buffer = undefined as unknown as typeof Buffer;
  try {
    const request = await buildAssessmentSpeechTranscriptRequest({
      patientId: "patient-profile-id",
      assessmentType: "MMSE/CDR",
      audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: "audio/wav",
      }),
      startedAtMs: 1000,
      endedAtMs: 43000,
    });

    assert.equal(request.audio.contentBase64, "AQIDBA==");
  } finally {
    globalThis.Buffer = originalBuffer;
  }
});

test("buildAssessmentSpeechTranscriptRequest rejects short recordings before API upload", async () => {
  await assert.rejects(
    () =>
      buildAssessmentSpeechTranscriptRequest({
        patientId: "patient-profile-id",
        assessmentType: "MMSE/CDR",
        audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], {
          type: "audio/webm",
        }),
        startedAtMs: 1000,
        endedAtMs: 1400,
      }),
    /录音时长必须至少 1 秒/,
  );
});

test("buildAssessmentSpeechTranscriptRequest rejects unsupported audio types", async () => {
  await assert.rejects(
    () =>
      buildAssessmentSpeechTranscriptRequest({
        patientId: "patient-profile-id",
        assessmentType: "MMSE/CDR",
        audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], {
          type: "text/plain",
        }),
        startedAtMs: 1000,
        endedAtMs: 43000,
      }),
    /浏览器录音格式不受支持/,
  );
});

test("applyAssessmentSpeechTranscriptToForm fills transcript and clears stale AI evidence", () => {
  const transcript = applyAssessmentSpeechTranscriptToForm(
    form,
    validTranscriptResponse(),
  );

  assert.equal(transcript.transcript, "今天是星期一，我记得三个词。");
  assert.equal(transcript.aiDraftEvidence, undefined);
});

test("applyAssessmentSpeechTranscriptToForm stores required speech evidence for later AI review", () => {
  const transcript = applyAssessmentSpeechTranscriptToForm(
    form,
    validTranscriptResponse(),
  );

  assert.deepEqual(transcript.speechEvidence, {
    provider: "xiaomi-mimo-audio-understanding",
    modelVersion: "mimo-v2.5",
    callId: "mimo-audio-call-001",
    endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
    source: "provider_audio_understanding",
    calledAt: "2026-05-27T09:58:45.000Z",
    audio: {
      mimeType: "audio/webm",
      durationSeconds: 42,
    },
  });
});

test("applyAssessmentSpeechTranscriptToForm rejects empty provider transcript", () => {
  assert.throws(
    () =>
      applyAssessmentSpeechTranscriptToForm(
        form,
        validTranscriptResponse({ transcript: "" }),
      ),
    /语音转写结果为空/,
  );
});

test("applyAssessmentSpeechTranscriptToForm rejects missing speech evidence fields", () => {
  assert.throws(
    () =>
      applyAssessmentSpeechTranscriptToForm(
        form,
        validTranscriptResponse({
          speechEvidence: {
            provider: "xiaomi-mimo-audio-understanding",
            modelVersion: "mimo-v2.5",
            callId: "",
            endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_audio_understanding",
            calledAt: "2026-05-27T09:58:45.000Z",
            audio: {
              mimeType: "audio/webm",
              durationSeconds: 42,
            },
          },
        }),
      ),
    /语音转写缺少供应商调用证据/,
  );
});

test("applyAssessmentSpeechTranscriptToForm rejects missing speech audio evidence", () => {
  assert.throws(
    () =>
      applyAssessmentSpeechTranscriptToForm(
        form,
        validTranscriptResponse({
          speechEvidence: {
            provider: "xiaomi-mimo-audio-understanding",
            modelVersion: "mimo-v2.5",
            callId: "mimo-audio-call-001",
            endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
            source: "provider_audio_understanding",
            calledAt: "2026-05-27T09:58:45.000Z",
          } as AssessmentSpeechTranscriptResponse["speechEvidence"],
        }),
      ),
    /语音转写缺少音频证据/,
  );
});

test("resolveSupportedAssessmentAudioMimeType chooses a browser-supported recording type", () => {
  const selected = resolveSupportedAssessmentAudioMimeType((mimeType) =>
    mimeType === "audio/mp4",
  );

  assert.equal(selected, "audio/mp4");
});

test("resolveSupportedAssessmentAudioMimeType fails explicitly when MediaRecorder has no supported type", () => {
  assert.throws(
    () => resolveSupportedAssessmentAudioMimeType(() => false),
    /当前浏览器不支持平台验收要求的录音格式/,
  );
});

function validTranscriptResponse(
  overrides: Partial<AssessmentSpeechTranscriptResponse> = {},
): AssessmentSpeechTranscriptResponse {
  return {
    patientId: "patient-profile-id",
    assessmentType: "MMSE/CDR",
    status: "transcribed",
    transcript: "今天是星期一，我记得三个词。",
    speechEvidence: {
      provider: "xiaomi-mimo-audio-understanding",
      modelVersion: "mimo-v2.5",
      callId: "mimo-audio-call-001",
      endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
      source: "provider_audio_understanding",
      calledAt: "2026-05-27T09:58:45.000Z",
      audio: {
        mimeType: "audio/webm",
        durationSeconds: 42,
      },
    },
    ...overrides,
  };
}

function base64AsciiSlice(base64: string, start: number, end: number) {
  return globalThis.atob(base64).slice(start, end);
}
