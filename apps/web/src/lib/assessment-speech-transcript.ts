import type {
  AssessmentSpeechTranscriptResponse,
  AssessmentPhysicalCondition,
  CreateAssessmentSpeechTranscriptRequest,
} from "@/types/api";
import type { AssessmentDraftFormState } from "./ai-assessment-draft";

const supportedAudioMimeTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/mpeg",
] as const;

type SupportedAudioMimeType = (typeof supportedAudioMimeTypes)[number];

const providerReadyAudioMimeTypes = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
] as const;

type AudioContextGlobal = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export async function buildAssessmentSpeechTranscriptRequest({
  patientId,
  assessmentType,
  physicalConditions,
  audioBlob,
  startedAtMs,
  endedAtMs,
}: {
  patientId: string;
  assessmentType: string;
  physicalConditions: AssessmentPhysicalCondition[];
  audioBlob: Blob;
  startedAtMs: number;
  endedAtMs: number;
}): Promise<Omit<CreateAssessmentSpeechTranscriptRequest, "idempotencyKey">> {
  const durationSeconds = Math.round((endedAtMs - startedAtMs) / 1000);
  if (durationSeconds < 1) {
    throw new Error("录音时长必须至少 1 秒，不能提交过短音频。");
  }
  if (durationSeconds > 600) {
    throw new Error("录音时长不能超过 600 秒。");
  }
  if (audioBlob.size <= 0) {
    throw new Error("录音内容为空，不能提交语音转写。");
  }
  assertAssessmentPhysicalConditions(physicalConditions);
  const providerReadyAudio = await prepareProviderReadyAudio(audioBlob);

  return {
    patientId,
    assessmentType,
    physicalConditions,
    audio: {
      contentBase64: await blobToBase64(providerReadyAudio.blob),
      mimeType: providerReadyAudio.mimeType,
      durationSeconds,
    },
  };
}

function assertAssessmentPhysicalConditions(
  values: readonly AssessmentPhysicalCondition[],
) {
  const supported = new Set<AssessmentPhysicalCondition>([
    "no_known_limitations",
    "wheelchair",
    "upper_limb_limited",
  ]);
  if (!values.length || values.some((value) => !supported.has(value))) {
    throw new Error("请明确选择受支持的身体情况后再提交语音转写。");
  }
  if (new Set(values).size !== values.length) {
    throw new Error("身体状况选项不能重复。");
  }
  if (values.includes("no_known_limitations") && values.length > 1) {
    throw new Error("无上述特殊限制不能与其他身体限制同时选择。");
  }
}

export function applyAssessmentSpeechTranscriptToForm(
  current: AssessmentDraftFormState,
  response: AssessmentSpeechTranscriptResponse,
): AssessmentDraftFormState {
  assertMatchingAssessmentPhysicalConditions(
    current.physicalConditions,
    response.physicalConditions,
  );
  const transcript = readRequiredTranscript(response.transcript);
  const speechEvidence = readRequiredSpeechEvidence(response.speechEvidence);
  return {
    ...current,
    assessmentType: response.assessmentType,
    transcript,
    speechEvidence,
    aiDraftEvidence: undefined,
  };
}

function assertMatchingAssessmentPhysicalConditions(
  current: readonly AssessmentPhysicalCondition[],
  response: readonly AssessmentPhysicalCondition[] | undefined,
) {
  if (!response?.length) {
    throw new Error("语音转写响应缺少身体状况证据，已阻止回填。");
  }
  const currentSet = new Set(current);
  const responseSet = new Set(response);
  if (
    currentSet.size !== responseSet.size ||
    [...currentSet].some((condition) => !responseSet.has(condition))
  ) {
    throw new Error("语音转写期间身体状况发生变化，已阻止绑定旧转写结果。");
  }
}

export function resolveSupportedAssessmentAudioMimeType(
  isTypeSupported: (mimeType: string) => boolean,
) {
  const selected = supportedAudioMimeTypes.find((mimeType) =>
    isTypeSupported(mimeType),
  );
  if (!selected) {
    throw new Error("当前浏览器不支持平台验收要求的录音格式。");
  }
  return selected;
}

function normalizeAssessmentAudioMimeType(
  value: string,
): SupportedAudioMimeType {
  const normalized = value.split(";")[0]?.trim().toLowerCase();
  if (isSupportedAudioMimeType(normalized)) {
    return normalized;
  }
  throw new Error("浏览器录音格式不受支持，不能提交语音转写。");
}

async function prepareProviderReadyAudio(audioBlob: Blob): Promise<{
  blob: Blob;
  mimeType: (typeof providerReadyAudioMimeTypes)[number];
}> {
  const mimeType = normalizeAssessmentAudioMimeType(audioBlob.type);
  if (isProviderReadyAudioMimeType(mimeType)) {
    return { blob: audioBlob, mimeType };
  }
  const wavBlob = await transcodeBrowserRecordingToWav(audioBlob);
  return { blob: wavBlob, mimeType: "audio/wav" };
}

function isProviderReadyAudioMimeType(
  value: SupportedAudioMimeType,
): value is (typeof providerReadyAudioMimeTypes)[number] {
  return providerReadyAudioMimeTypes.includes(
    value as (typeof providerReadyAudioMimeTypes)[number],
  );
}

async function transcodeBrowserRecordingToWav(audioBlob: Blob) {
  const audioGlobal = globalThis as AudioContextGlobal;
  const AudioContextConstructor =
    audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("当前浏览器缺少音频解码能力，不能转换语音转写音频。");
  }

  const audioContext = new AudioContextConstructor();
  try {
    const decoded = await audioContext.decodeAudioData(
      await audioBlob.arrayBuffer(),
    );
    return new Blob([encodeAudioBufferToWav(decoded)], {
      type: "audio/wav",
    });
  } catch {
    throw new Error("浏览器录音无法转换为 WAV，不能提交语音转写。");
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  if (channelCount < 1) {
    throw new Error("录音缺少有效音轨，不能提交语音转写。");
  }

  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataByteLength = audioBuffer.length * blockAlign;
  const wavByteLength = 44 + dataByteLength;
  const buffer = new ArrayBuffer(wavByteLength);
  const view = new DataView(buffer);
  let offset = 0;

  offset = writeAscii(view, offset, "RIFF");
  view.setUint32(offset, wavByteLength - 8, true);
  offset += 4;
  offset = writeAscii(view, offset, "WAVE");
  offset = writeAscii(view, offset, "fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true);
  offset += 2;
  offset = writeAscii(view, offset, "data");
  view.setUint32(offset, dataByteLength, true);
  offset += 4;

  const channels = Array.from({ length: channelCount }, (_, channelIndex) =>
    audioBuffer.getChannelData(channelIndex),
  );
  for (
    let sampleIndex = 0;
    sampleIndex < audioBuffer.length;
    sampleIndex += 1
  ) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(
        -1,
        Math.min(1, channels[channelIndex][sampleIndex] ?? 0),
      );
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
  return offset + value.length;
}

function isSupportedAudioMimeType(
  value: string | undefined,
): value is SupportedAudioMimeType {
  return supportedAudioMimeTypes.includes(value as SupportedAudioMimeType);
}

async function blobToBase64(blob: Blob) {
  return arrayBufferToBase64(await blob.arrayBuffer());
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  if (typeof globalThis.btoa !== "function") {
    throw new Error("当前运行环境缺少音频编码能力，不能提交语音转写。");
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    for (const byte of chunk) {
      binary += String.fromCharCode(byte);
    }
  }
  return globalThis.btoa(binary);
}

function readRequiredTranscript(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("语音转写结果为空，不能回填评估表单。");
  }
  return value.trim();
}

function readRequiredSpeechEvidence(
  value: AssessmentSpeechTranscriptResponse["speechEvidence"],
) {
  const requiredFields = [
    "provider",
    "modelVersion",
    "callId",
    "endpointRef",
    "calledAt",
  ] as const;
  for (const field of requiredFields) {
    readRequiredText(value?.[field], "语音转写缺少供应商调用证据。");
  }
  if (value.source !== "provider_audio_understanding") {
    throw new Error("语音转写缺少供应商调用证据。");
  }
  if (!value.audio || typeof value.audio !== "object") {
    throw new Error("语音转写缺少音频证据。");
  }
  readRequiredText(value.audio.mimeType, "语音转写缺少音频证据。");
  if (
    typeof value.audio.durationSeconds !== "number" ||
    !Number.isFinite(value.audio.durationSeconds)
  ) {
    throw new Error("语音转写缺少音频证据。");
  }
  return value;
}

function readRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}
