import assert from "node:assert/strict";
import test from "node:test";
import {
  createCognitiveSubmissionGuard,
  resolveCognitiveAnswerFocus,
  runCognitiveSubmission,
  shouldRunCognitiveClock,
  startCognitiveClock,
  type CognitivePhase,
} from "./cognitive-training-lifecycle.ts";

test("session switch invalidates the old submission token", async () => {
  const oldGuard = createCognitiveSubmissionGuard("session-old");
  const build = deferred<string>();
  const delivered: string[] = [];
  const phases: CognitivePhase[] = [];
  const submission = runCognitiveSubmission({
    guard: oldGuard,
    buildPayload: () => build.promise,
    submitPayload: async (payload) => {
      delivered.push(payload);
    },
    onPhaseChange: (phase) => phases.push(phase),
  });

  oldGuard.invalidate();
  const newGuard = createCognitiveSubmissionGuard("session-new");
  build.resolve("old-payload");

  assert.deepEqual(await submission, { status: "stale" });
  assert.deepEqual(delivered, []);
  assert.deepEqual(phases, ["submitting"]);
  assert.ok(newGuard.begin());
});

test("effect replay reactivates the guard without reviving an invalidated token", async () => {
  const guard = createCognitiveSubmissionGuard("session-1");
  const firstBuild = deferred<string>();
  const delivered: string[] = [];
  const first = runCognitiveSubmission({
    guard,
    buildPayload: () => firstBuild.promise,
    submitPayload: async (payload) => {
      delivered.push(payload);
    },
    onPhaseChange: () => undefined,
  });

  guard.invalidate();
  guard.activate();
  const second = await runCognitiveSubmission({
    guard,
    buildPayload: async () => "current-payload",
    submitPayload: async (payload) => {
      delivered.push(payload);
    },
    onPhaseChange: () => undefined,
  });
  firstBuild.resolve("stale-payload");

  assert.deepEqual(second, { status: "completed" });
  assert.deepEqual(await first, { status: "stale" });
  assert.deepEqual(delivered, ["current-payload"]);
});

test("failed submission returns error and can retry without concurrent duplication", async () => {
  const guard = createCognitiveSubmissionGuard("session-1");
  const phases: CognitivePhase[] = [];
  const firstDelivery = deferred<void>();
  const first = runCognitiveSubmission({
    guard,
    buildPayload: async () => "payload",
    submitPayload: () => firstDelivery.promise,
    onPhaseChange: (phase) => phases.push(phase),
  });
  const duplicate = await runCognitiveSubmission({
    guard,
    buildPayload: async () => "duplicate",
    submitPayload: async () => undefined,
    onPhaseChange: (phase) => phases.push(phase),
  });

  assert.deepEqual(duplicate, { status: "busy" });
  firstDelivery.reject(new Error("提交失败"));
  assert.deepEqual(await first, {
    status: "error",
    error: new Error("提交失败"),
  });

  const retry = await runCognitiveSubmission({
    guard,
    buildPayload: async () => "payload",
    submitPayload: async () => undefined,
    onPhaseChange: (phase) => phases.push(phase),
  });

  assert.deepEqual(retry, { status: "completed" });
  assert.deepEqual(phases, ["submitting", "error", "submitting", "completed"]);
});

test("payload build failure is retryable without delivering an invalid result", async () => {
  const guard = createCognitiveSubmissionGuard("session-1");
  const phases: CognitivePhase[] = [];
  let buildAttempt = 0;
  let deliveryCount = 0;
  const submit = () =>
    runCognitiveSubmission({
      guard,
      buildPayload: async () => {
        buildAttempt += 1;
        if (buildAttempt === 1) throw new Error("结果构建失败");
        return "payload";
      },
      submitPayload: async () => {
        deliveryCount += 1;
      },
      onPhaseChange: (phase) => phases.push(phase),
    });

  assert.deepEqual(await submit(), {
    status: "error",
    error: new Error("结果构建失败"),
  });
  assert.equal(deliveryCount, 0);
  assert.deepEqual(await submit(), { status: "completed" });
  assert.equal(deliveryCount, 1);
  assert.deepEqual(phases, ["submitting", "error", "submitting", "completed"]);
});

test("cognitive clock stops on submitting completed timeout error and unmount", () => {
  const activePhases: CognitivePhase[] = ["memorize", "answer", "feedback"];
  const stoppedPhases: CognitivePhase[] = [
    "timed_out",
    "submitting",
    "error",
    "completed",
  ];
  assert.ok(activePhases.every(shouldRunCognitiveClock));
  assert.ok(stoppedPhases.every((phase) => !shouldRunCognitiveClock(phase)));

  let callback: (() => void) | undefined;
  const cleared: number[] = [];
  let ticks = 0;
  const clock = startCognitiveClock({
    onTick: () => {
      ticks += 1;
    },
    scheduler: {
      setInterval: (next, intervalMs) => {
        assert.equal(intervalMs, 250);
        callback = next;
        return 17;
      },
      clearInterval: (id) => cleared.push(id),
    },
  });

  assert.equal(ticks, 1);
  callback?.();
  assert.equal(ticks, 2);
  clock.stop();
  clock.stop();
  assert.deepEqual(cleared, [17]);
});

test("answer focus moves to the next available option or progress region", () => {
  assert.deepEqual(resolveCognitiveAnswerFocus(["蓝", "绿", "黄"], ["蓝"]), {
    type: "option",
    option: "绿",
  });
  assert.deepEqual(
    resolveCognitiveAnswerFocus(["蓝", "绿", "黄"], ["蓝", "绿", "黄"]),
    { type: "progress" },
  );
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
