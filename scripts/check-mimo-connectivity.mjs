#!/usr/bin/env node

const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const aiMarker = "MIMO_CONNECTIVITY_OK";
const ttsText = "训练开始，请保持舒适站位。";

export async function verifyMimoConnectivity({
  env = process.env,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const config = readConfig(env);
  const startedAt = now();

  const aiResponse = await requestJson({
    stage: "AI",
    endpoint: chatCompletionsEndpoint(config.ai.endpoint),
    apiKey: config.apiKey,
    authorizationScheme: "bearer",
    timeoutMs: config.ai.timeoutMs,
    maxResponseBytes: config.ai.maxResponseBytes,
    body: {
      model: config.ai.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `Reply with exactly ${aiMarker}.`,
        },
      ],
    },
    fetchImpl,
  });
  const aiContent = requireMessageContent(aiResponse, "AI");
  if (!aiContent.includes(aiMarker)) {
    throw new Error("AI 响应未满足固定连通性合同。");
  }

  const ttsResponse = await requestJson({
    stage: "TTS",
    endpoint: config.tts.endpoint,
    apiKey: config.apiKey,
    authorizationScheme: "api-key",
    timeoutMs: config.tts.timeoutMs,
    maxResponseBytes: config.tts.maxResponseBytes,
    body: {
      model: config.tts.model,
      messages: [
        {
          role: "user",
          content: "使用清晰、温和的普通话，语速适中。",
        },
        { role: "assistant", content: ttsText },
      ],
      audio: {
        format: config.tts.outputFormat,
        voice: config.tts.voiceId,
      },
    },
    fetchImpl,
  });
  const audio = requireTtsAudio(ttsResponse, config.tts.outputFormat);

  const sttResponse = await requestJson({
    stage: "STT",
    endpoint: config.stt.endpoint,
    apiKey: config.apiKey,
    authorizationScheme: "api-key",
    timeoutMs: config.stt.timeoutMs,
    maxResponseBytes: config.stt.maxResponseBytes,
    body: {
      model: config.stt.model,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "只返回 JSON，不要返回 Markdown。JSON 必须包含 transcript 字段。",
        },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: `data:${audio.mimeType};base64,${audio.contentBase64}`,
              },
            },
            {
              type: "text",
              text: "请逐字转写这段普通话音频，只输出包含 transcript 字段的 JSON。",
            },
          ],
        },
      ],
    },
    fetchImpl,
  });
  requireTranscript(sttResponse);

  return {
    stages: ["AI", "TTS", "STT"],
    durationMs: Math.max(0, now() - startedAt),
  };
}

function readConfig(env) {
  const apiKey = requiredText(env, "MIMO_API_KEY");
  return {
    apiKey,
    ai: {
      endpoint: requiredHttpsEndpoint(env, "AI_MODEL_ENDPOINT"),
      model: requiredText(env, "AI_MODEL_VERSION"),
      timeoutMs: requiredPositiveInteger(env, "AI_PROVIDER_TIMEOUT_MS"),
      maxResponseBytes: requiredPositiveInteger(
        env,
        "AI_PROVIDER_MAX_RESPONSE_BYTES",
      ),
    },
    tts: {
      endpoint: requiredHttpsEndpoint(env, "TTS_ENDPOINT"),
      model: requiredText(env, "TTS_MODEL_VERSION"),
      voiceId: requiredText(env, "TTS_VOICE_ID"),
      outputFormat: requiredOutputFormat(env),
      timeoutMs: requiredPositiveInteger(env, "TTS_PROVIDER_TIMEOUT_MS"),
      maxResponseBytes: requiredPositiveInteger(
        env,
        "TTS_PROVIDER_MAX_RESPONSE_BYTES",
      ),
    },
    stt: {
      endpoint: requiredHttpsEndpoint(env, "SPEECH_TO_TEXT_ENDPOINT"),
      model: requiredText(env, "SPEECH_MODEL_VERSION"),
      timeoutMs: requiredPositiveInteger(env, "SPEECH_PROVIDER_TIMEOUT_MS"),
      maxResponseBytes: requiredPositiveInteger(
        env,
        "SPEECH_PROVIDER_MAX_RESPONSE_BYTES",
      ),
    },
  };
}

function requiredText(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} 必须是非空文本。`);
  }
  return value.trim();
}

function requiredHttpsEndpoint(env, name) {
  const value = requiredText(env, name);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是有效 HTTPS 地址。`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${name} 必须是不含访问凭据的 HTTPS 地址。`);
  }
  return url.toString().replace(/\/$/, "");
}

function requiredPositiveInteger(env, name) {
  const value = requiredText(env, name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} 必须是正整数。`);
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > (name.endsWith("TIMEOUT_MS") ? MAX_TIMEOUT_MS : MAX_RESPONSE_BYTES)
  ) {
    throw new Error(`${name} 超出允许范围。`);
  }
  return parsed;
}

function requiredOutputFormat(env) {
  const value = requiredText(env, "TTS_OUTPUT_FORMAT");
  if (value !== "mp3" && value !== "wav") {
    throw new Error("TTS_OUTPUT_FORMAT 必须为 mp3 或 wav。");
  }
  return value;
}

function chatCompletionsEndpoint(endpoint) {
  return endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint}/chat/completions`;
}

async function requestJson({
  stage,
  endpoint,
  apiKey,
  authorizationScheme,
  timeoutMs,
  maxResponseBytes,
  body,
  fetchImpl,
}) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers:
          authorizationScheme === "bearer"
            ? {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              }
            : {
                "api-key": apiKey,
                "Content-Type": "application/json",
              },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(`${stage} 请求未能完成。`);
    }

    const contentLength = response.headers.get("content-length");
    if (
      contentLength !== null &&
      /^\d+$/.test(contentLength) &&
      Number(contentLength) > maxResponseBytes
    ) {
      throw new Error(`${stage} 响应超过配置大小限制。`);
    }

    const rawBody = await response.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxResponseBytes) {
      throw new Error(`${stage} 响应超过配置大小限制。`);
    }
    if (!response.ok) {
      throw new Error(`${stage} 返回 HTTP ${response.status}。`);
    }
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new Error(`${stage} 未返回有效 JSON。`);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function requireMessageContent(body, stage) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error(`${stage} 响应缺少消息内容。`);
  }
  return content;
}

function requireTtsAudio(body, outputFormat) {
  const contentBase64 = body?.choices?.[0]?.message?.audio?.data;
  if (
    typeof contentBase64 !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)
  ) {
    throw new Error("TTS 响应缺少有效音频载荷。");
  }
  const bytes = Buffer.from(contentBase64, "base64");
  if (
    bytes.length === 0 ||
    bytes.toString("base64").replace(/=+$/, "") !==
      contentBase64.replace(/=+$/, "")
  ) {
    throw new Error("TTS 音频 Base64 无法解码。");
  }
  const isWav =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WAVE";
  const isMp3 =
    (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (
    (outputFormat === "wav" && !isWav) ||
    (outputFormat === "mp3" && !isMp3)
  ) {
    throw new Error("TTS 音频格式与 TTS_OUTPUT_FORMAT 不一致。");
  }
  return {
    contentBase64,
    mimeType: outputFormat === "wav" ? "audio/wav" : "audio/mpeg",
  };
}

function requireTranscript(body) {
  const content = requireMessageContent(body, "STT");
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("STT 消息内容不是 JSON。`transcript` 不会输出。");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.transcript !== "string" ||
    payload.transcript.trim().length < 2
  ) {
    throw new Error("STT JSON 缺少有效 transcript。`transcript` 不会输出。");
  }
}

async function main() {
  try {
    const result = await verifyMimoConnectivity();
    console.log(
      `MiMo 配置连通性检查通过：${result.stages.join("、")}（${result.durationMs}ms）。`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误。";
    console.error(`MiMo 配置连通性检查失败：${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("check-mimo-connectivity.mjs")) {
  await main();
}
