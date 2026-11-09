import test from "node:test";
import assert from "node:assert/strict";
import {
  createStagedTtsSpeechOutput,
  isStagedTtsSpeechOutputForRequest,
  playTtsSpeechOutputAudio,
} from "./tts-speech-output.ts";
import type { TtsSpeechOutputResponse } from "@/types/api";

const validWavAudioBase64 = Buffer.from(
  "RIFF$\x00\x00\x00WAVEfmt ",
  "binary",
).toString("base64");

function ttsOutput(
  overrides: Partial<TtsSpeechOutputResponse["audio"]> = {},
): TtsSpeechOutputResponse {
  return {
    patientId: "patient-profile-id",
    status: "synthesized",
    audio: {
      contentBase64: validWavAudioBase64,
      mimeType: "audio/wav",
      byteLength: Buffer.byteLength(validWavAudioBase64, "base64"),
      ...overrides,
    },
    ttsEvidence: {
      provider: "xiaomi-mimo-tts",
      modelVersion: "mimo-v2.5-tts",
      callId: "tts-call-real-001",
      endpointRef: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
      source: "provider_text_to_speech",
      calledAt: "2026-05-29T10:00:00.000Z",
      voiceId: "Chloe",
      scenario: "training_cue",
      inputTextHash: "hash",
      audio: {
        mimeType: "audio/wav",
        format: "wav",
        byteLength: 16,
      },
    },
  };
}

test("plays provider TTS audio from a CSP-compatible blob URL", async () => {
  let source = "";
  let played = false;
  let endedListener: (() => void) | undefined;
  let revokedSource = "";
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:test-tts-audio";
  URL.revokeObjectURL = (objectUrl) => {
    revokedSource = objectUrl;
  };

  try {
    await playTtsSpeechOutputAudio(ttsOutput(), (nextSource) => {
      source = nextSource;
      return {
        addEventListener: (
          eventName: string,
          listener: EventListenerOrEventListenerObject,
        ) => {
          if (eventName === "ended") {
            endedListener = listener as () => void;
          }
        },
        play: () => {
          played = true;
          return Promise.resolve();
        },
      };
    });

    assert.equal(played, true);
    assert.equal(source, "blob:test-tts-audio");
    assert.equal(revokedSource, "");

    endedListener?.();
    assert.equal(revokedSource, "blob:test-tts-audio");
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test("staged TTS output is replayed only for the same patient and request", () => {
  const request = {
    patientId: "patient-profile-id",
    text: "请告诉我，今天是星期几？",
    scenario: "assessment_prompt" as const,
  };
  const staged = createStagedTtsSpeechOutput(request, ttsOutput());

  assert.equal(isStagedTtsSpeechOutputForRequest(staged, request), true);
  assert.equal(
    isStagedTtsSpeechOutputForRequest(staged, {
      ...request,
      patientId: "other-patient",
    }),
    false,
  );
  assert.equal(
    isStagedTtsSpeechOutputForRequest(staged, {
      ...request,
      text: "另一道题目",
    }),
    false,
  );
});

test("rejects empty provider TTS audio instead of playing a fallback", () => {
  assert.throws(
    () =>
      playTtsSpeechOutputAudio(ttsOutput({ contentBase64: "", byteLength: 0 })),
    /缺少音频内容/,
  );
});

test("rejects provider TTS audio bytes that do not match the declared format", () => {
  assert.throws(
    () =>
      playTtsSpeechOutputAudio(
        ttsOutput({
          contentBase64: Buffer.from("formal-tts-audio").toString("base64"),
          byteLength: 16,
        }),
      ),
    /音频格式/,
  );
});
