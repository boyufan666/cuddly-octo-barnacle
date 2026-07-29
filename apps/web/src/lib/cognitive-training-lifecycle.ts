export type CognitivePhase =
  | "memorize"
  | "answer"
  | "feedback"
  | "timed_out"
  | "submitting"
  | "error"
  | "completed";

type CognitiveSubmissionToken = {
  sessionId: string;
  attempt: number;
};

export type CognitiveSubmissionGuard = {
  activate: () => void;
  begin: () => CognitiveSubmissionToken | null;
  finish: (token: CognitiveSubmissionToken) => void;
  invalidate: () => void;
  isCurrent: (token: CognitiveSubmissionToken) => boolean;
};

export function createCognitiveSubmissionGuard(
  sessionId: string,
): CognitiveSubmissionGuard {
  if (!sessionId.trim()) {
    throw new Error("认知训练会话标识不能为空。");
  }
  let mounted = true;
  let attempt = 0;
  let activeToken: CognitiveSubmissionToken | null = null;
  return {
    activate() {
      mounted = true;
    },
    begin() {
      if (!mounted || activeToken) return null;
      attempt += 1;
      activeToken = { sessionId, attempt };
      return activeToken;
    },
    finish(token) {
      if (activeToken === token) activeToken = null;
    },
    invalidate() {
      mounted = false;
      activeToken = null;
    },
    isCurrent(token) {
      return mounted && activeToken === token && token.sessionId === sessionId;
    },
  };
}

export async function runCognitiveSubmission<Payload>({
  guard,
  buildPayload,
  submitPayload,
  onPhaseChange,
}: {
  guard: CognitiveSubmissionGuard;
  buildPayload: () => Payload | Promise<Payload>;
  submitPayload: (payload: Payload) => void | Promise<void>;
  onPhaseChange: (
    phase: Extract<CognitivePhase, "submitting" | "error" | "completed">,
    error?: Error,
  ) => void;
}): Promise<
  { status: "busy" | "completed" | "stale" } | { status: "error"; error: Error }
> {
  const token = guard.begin();
  if (!token) return { status: "busy" };
  onPhaseChange("submitting");
  try {
    const payload = await buildPayload();
    if (!guard.isCurrent(token)) return { status: "stale" };
    await submitPayload(payload);
    if (!guard.isCurrent(token)) return { status: "stale" };
    onPhaseChange("completed");
    return { status: "completed" };
  } catch (error) {
    if (!guard.isCurrent(token)) return { status: "stale" };
    if (!(error instanceof Error)) throw error;
    onPhaseChange("error", error);
    return { status: "error", error };
  } finally {
    guard.finish(token);
  }
}

export function shouldRunCognitiveClock(phase: CognitivePhase) {
  return phase === "memorize" || phase === "answer" || phase === "feedback";
}

export function startCognitiveClock({
  onTick,
  scheduler,
}: {
  onTick: () => void;
  scheduler: {
    setInterval: (callback: () => void, intervalMs: number) => number;
    clearInterval: (id: number) => void;
  };
}) {
  onTick();
  const intervalId = scheduler.setInterval(onTick, 250);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      scheduler.clearInterval(intervalId);
    },
  };
}

export function resolveCognitiveAnswerFocus(
  options: readonly string[],
  answers: readonly string[],
): { type: "option"; option: string } | { type: "progress" } {
  const nextOption = options.find((option) => !answers.includes(option));
  return nextOption
    ? { type: "option", option: nextOption }
    : { type: "progress" };
}
