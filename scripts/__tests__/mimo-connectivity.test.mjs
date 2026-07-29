import assert from "node:assert/strict";
import test from "node:test";
import { verifyMimoConnectivity } from "../check-mimo-connectivity.mjs";

const wavBase64 = Buffer.from("RIFF0000WAVE").toString("base64");

function validEnv() {
  return {
    MIMO_API_KEY: "test-mimo-key",
    AI_MODEL_ENDPOINT: "https://token-plan-cn.xiaomimimo.com/v1",
    AI_MODEL_VERSION: "mimo-v2.5",
    AI_PROVIDER_TIMEOUT_MS: "15000",
    AI_PROVIDER_MAX_RESPONSE_BYTES: "1048576",
    TTS_ENDPOINT: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
    TTS_MODEL_VERSION: "mimo-v2.5-tts",
    TTS_VOICE_ID: "Chloe",
    TTS_OUTPUT_FORMAT: "wav",
    TTS_PROVIDER_TIMEOUT_MS: "15000",
    TTS_PROVIDER_MAX_RESPONSE_BYTES: "1048576",
    SPEECH_TO_TEXT_ENDPOINT:
      "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
    SPEECH_MODEL_VERSION: "mimo-v2.5-asr",
    SPEECH_PROVIDER_TIMEOUT_MS: "15000",
    SPEECH_PROVIDER_MAX_RESPONSE_BYTES: "1048576",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("MiMo connectivity checks the AI, TTS, and STT contracts without exposing payloads", async () => {
  const calls = [];
  const responses = [
    {
      id: "ai-call",
      choices: [{ message: { content: "MIMO_CONNECTIVITY_OK" } }],
    },
    {
      id: "tts-call",
      choices: [{ message: { audio: { data: wavBase64 } } }],
    },
    {
      id: "stt-call",
      choices: [
        { message: { content: JSON.stringify({ transcript: "训练开始" }) } },
      ],
    },
  ];
  const result = await verifyMimoConnectivity({
    env: validEnv(),
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(responses.shift());
    },
    now: (() => {
      let time = 100;
      return () => (time += 25);
    })(),
  });

  assert.deepEqual(result.stages, ["AI", "TTS", "STT"]);
  assert.equal(calls.length, 3);
  assert.equal(
    calls[0].input,
    "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
  );
  assert.match(calls[0].init.headers.Authorization, /^Bearer /);
  assert.equal(calls[1].init.headers["api-key"], "test-mimo-key");
  assert.match(calls[2].init.body, /data:audio\/wav;base64,/);
});

test("MiMo connectivity rejects non-HTTPS endpoints before making a request", async () => {
  const env = validEnv();
  env.AI_MODEL_ENDPOINT = "http://localhost:4000";
  await assert.rejects(
    () =>
      verifyMimoConnectivity({
        env,
        fetchImpl: async () => {
          throw new Error("must not be called");
        },
      }),
    /AI_MODEL_ENDPOINT 必须是不含访问凭据的 HTTPS 地址。/,
  );
});

test("MiMo connectivity rejects a TTS response whose audio bytes do not match its declared format", async () => {
  const responses = [
    {
      id: "ai-call",
      choices: [{ message: { content: "MIMO_CONNECTIVITY_OK" } }],
    },
    {
      id: "tts-call",
      choices: [
        {
          message: {
            audio: { data: Buffer.from("not-a-wav").toString("base64") },
          },
        },
      ],
    },
  ];
  await assert.rejects(
    () =>
      verifyMimoConnectivity({
        env: validEnv(),
        fetchImpl: async () => jsonResponse(responses.shift()),
      }),
    /TTS 音频格式与 TTS_OUTPUT_FORMAT 不一致。/,
  );
});
