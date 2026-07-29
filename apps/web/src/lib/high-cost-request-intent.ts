const currentPageBlockedMessage =
  "本次高成本请求的最终状态尚未确认。为避免重复调用，请保持当前页面并联系管理员处理。";

type CurrentPageAttemptState = "in_flight" | "uncertain";

type CurrentPageAttempt = Readonly<{
  idempotencyKey: string;
  state: CurrentPageAttemptState;
}>;

export type CurrentPageHighCostRequestRegistry = Readonly<{
  begin: (intent: string) =>
    | Readonly<{ status: "started"; idempotencyKey: string }>
    | Readonly<{
        status: CurrentPageAttemptState;
        idempotencyKey: string;
      }>;
  markUncertain: (intent: string, idempotencyKey: string) => void;
  markResponseReceived: (intent: string, idempotencyKey: string) => void;
  clear: () => void;
}>;

export class CurrentPageHighCostRequestBlockedError extends Error {
  constructor() {
    super(currentPageBlockedMessage);
    this.name = "CurrentPageHighCostRequestBlockedError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createHighCostIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("浏览器缺少安全幂等键能力，不能提交高成本服务请求。");
  }
  return globalThis.crypto.randomUUID();
}

export function createCurrentPageHighCostRequestRegistry(
  createIdempotencyKey: () => string = createHighCostIdempotencyKey,
): CurrentPageHighCostRequestRegistry {
  const attempts = new Map<string, CurrentPageAttempt>();

  return {
    begin(intent) {
      const existing = attempts.get(intent);
      if (existing) {
        return {
          status: existing.state,
          idempotencyKey: existing.idempotencyKey,
        };
      }

      const idempotencyKey = createIdempotencyKey();
      attempts.set(intent, { idempotencyKey, state: "in_flight" });
      return { status: "started", idempotencyKey };
    },
    markUncertain(intent, idempotencyKey) {
      const existing = attempts.get(intent);
      if (existing?.idempotencyKey !== idempotencyKey) return;
      attempts.set(intent, { idempotencyKey, state: "uncertain" });
    },
    markResponseReceived(intent, idempotencyKey) {
      const existing = attempts.get(intent);
      if (existing?.idempotencyKey === idempotencyKey) {
        attempts.delete(intent);
      }
    },
    clear() {
      attempts.clear();
    },
  };
}

export async function executeCurrentPageHighCostRequest<T>({
  registry,
  intent,
  request,
}: {
  registry: CurrentPageHighCostRequestRegistry;
  intent: string;
  request: (idempotencyKey: string) => Promise<T>;
}): Promise<T> {
  const attempt = registry.begin(intent);
  if (attempt.status !== "started") {
    throw new CurrentPageHighCostRequestBlockedError();
  }

  try {
    const response = await request(attempt.idempotencyKey);
    registry.markResponseReceived(intent, attempt.idempotencyKey);
    return response;
  } catch (error) {
    registry.markUncertain(intent, attempt.idempotencyKey);
    throw error;
  }
}

export async function deriveCurrentPageHighCostRequestIntent({
  operation,
  patientId,
  fields,
}: {
  operation:
    | "ai_assessment_draft"
    | "ai_conversation_message"
    | "speech_transcript"
    | "tts_speech_output";
  patientId: string;
  fields: readonly string[];
}) {
  if (
    !operation ||
    !patientId ||
    fields.some((field) => typeof field !== "string")
  ) {
    throw new Error("高成本请求身份缺少完整逻辑范围，不能提交服务请求。");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("浏览器缺少安全请求身份能力，不能提交高成本服务请求。");
  }

  const canonicalInput = JSON.stringify({
    version: 1,
    operation,
    patientId,
    fields,
  });
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalInput),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
