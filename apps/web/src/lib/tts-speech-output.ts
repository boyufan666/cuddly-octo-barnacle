import type {
  CreateTtsSpeechOutputRequest,
  TtsSpeechOutputResponse,
} from "@/types/api";

type TtsSpeechOutputRequestIdentity = Pick<
  CreateTtsSpeechOutputRequest,
  "patientId" | "text" | "scenario"
>;

type TtsAudioPlayer = Pick<
  HTMLAudioElement,
  "play" | "addEventListener"
>;

export type StagedTtsSpeechOutput = Readonly<{
  request: TtsSpeechOutputRequestIdentity;
  output: TtsSpeechOutputResponse;
}>;

export function createStagedTtsSpeechOutput(
  request: TtsSpeechOutputRequestIdentity,
  output: TtsSpeechOutputResponse,
): StagedTtsSpeechOutput {
  return {
    request: { ...request },
    output,
  };
}

export function isStagedTtsSpeechOutputForRequest(
  staged: StagedTtsSpeechOutput | null,
  request: TtsSpeechOutputRequestIdentity,
) {
  return (
    staged !== null &&
    staged.request.patientId === request.patientId &&
    staged.request.text === request.text &&
    staged.request.scenario === request.scenario
  );
}

export function playTtsSpeechOutputAudio(
  output: TtsSpeechOutputResponse,
  createAudioElement: (source: string) => TtsAudioPlayer = (source) =>
    new Audio(source),
) {
  const audio = output.audio;
  if (!audio.contentBase64.trim()) {
    throw new Error("TTS 语音输出缺少音频内容，不能播放。");
  }
  if (audio.byteLength <= 0) {
    throw new Error("TTS 语音输出音频为空，不能播放。");
  }
  if (!["audio/mpeg", "audio/wav"].includes(audio.mimeType)) {
    throw new Error("TTS 语音输出音频格式不受支持。");
  }

  const audioBytes = decodeBase64Bytes(audio.contentBase64);
  if (!ttsAudioBytesMatchMimeType(audioBytes, audio.mimeType)) {
    throw new Error("TTS 语音输出音频格式与内容不匹配，不能播放。");
  }

  const audioObjectUrl = URL.createObjectURL(
    new Blob([audioBytes], { type: audio.mimeType }),
  );
  let objectUrlReleased = false;
  const releaseObjectUrl = () => {
    if (objectUrlReleased) {
      return;
    }
    objectUrlReleased = true;
    URL.revokeObjectURL(audioObjectUrl);
  };

  try {
    const player = createAudioElement(audioObjectUrl);
    player.addEventListener("ended", releaseObjectUrl, { once: true });
    player.addEventListener("error", releaseObjectUrl, { once: true });
    return player.play().catch((error) => {
      releaseObjectUrl();
      throw error;
    });
  } catch (error) {
    releaseObjectUrl();
    throw error;
  }
}

function ttsAudioBytesMatchMimeType(
  bytes: Uint8Array,
  mimeType: "audio/mpeg" | "audio/wav",
) {
  if (mimeType === "audio/wav") {
    return (
      bytes.length >= 12 &&
      asciiSlice(bytes, 0, 4) === "RIFF" &&
      asciiSlice(bytes, 8, 12) === "WAVE"
    );
  }

  return (
    (bytes.length >= 3 && asciiSlice(bytes, 0, 3) === "ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

function decodeBase64Bytes(contentBase64: string) {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asciiSlice(bytes: Uint8Array, start: number, end: number) {
  let text = "";
  for (let index = start; index < end; index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}
