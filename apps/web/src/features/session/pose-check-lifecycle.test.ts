import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Execute the actual handler body with deferred model/camera work, without real hardware.
async function harness() {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("  async function handleCheckPoseReadiness(");
  const end = source.indexOf("  async function handleStartTraining()", start);
  const section = source.slice(start, end);
  const body = section.slice(
    section.indexOf("    const actionIdentity"),
    section.lastIndexOf("  }"),
  );
  const pending: Array<{
    resolve: (value: object) => void;
    reject: (error: Error) => void;
  }> = [];
  const writes: string[] = [];
  let busy = false;
  let state = {};
  const deps = {
    captureRoleActionIdentity: () => ({}),
    isRoleActionIdentityCurrent: () => true,
    resolveTrainingPrepCameraRequirement: () => ({
      ready: true,
      requiresCameraCheck: true,
    }),
    selectedPlanItem: { gameContent: {} },
    poseCheckGenerationRef: { current: 0 },
    startBusyAction: () => {
      busy = true;
    },
    finishBusyAction: () => {
      busy = false;
      writes.push("finish");
    },
    setDataError: (value: string | null) => {
      if (value) writes.push(value);
    },
    setActive: () => {},
    setActionStatus: (value: string) => writes.push(value),
    setTrainingReadiness: (update: (value: object) => object) => {
      state = update(state);
    },
    mergePoseReadiness: (_: object, result: object) => result,
    patientSafeTrainingActionErrorMessage: (error: Error) => error.message,
    checkPoseReadiness: () =>
      new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  const handler = new Function(
    ...Object.keys(deps),
    `return async function(videoElement, signal) {${body}}`,
  )(...Object.values(deps)) as (
    _video: object,
    signal: AbortSignal,
  ) => Promise<void>;
  return { handler, pending, writes, busy: () => busy, state: () => state };
}

test("cancelled old pose check cannot overwrite a newer check or clear its busy flag", async () => {
  const h = await harness();
  const old = new AbortController();
  const first = h.handler({}, old.signal);
  old.abort();
  assert.equal(h.busy(), false);
  assert.equal(
    (h.state() as { poseRuntimeStatus: string }).poseRuntimeStatus,
    "unknown",
  );
  h.writes.length = 0;
  const second = h.handler({}, new AbortController().signal);
  h.pending[0].reject(new Error("obsolete model failure"));
  await first;
  assert.equal(h.busy(), true);
  assert.deepEqual(h.writes, []);
  h.pending[1].resolve({ poseRuntimeStatus: "ready" });
  await second;
  assert.equal(h.busy(), false);
  assert.deepEqual(h.state(), { poseRuntimeStatus: "ready" });
  assert.equal(h.writes.filter((value) => value === "finish").length, 1);
});

test("cancelled current check clears busy without surfacing a failure or stale success", async () => {
  for (const outcome of ["resolve", "reject"] as const) {
    const h = await harness();
    const controller = new AbortController();
    const request = h.handler({}, controller.signal);
    controller.abort();
    assert.equal(
      h.busy(),
      false,
      "cancel releases busy before the model settles",
    );
    assert.equal(
      (h.state() as { poseRuntimeStatus: string }).poseRuntimeStatus,
      "unknown",
    );
    if (outcome === "resolve")
      h.pending[0].resolve({ poseRuntimeStatus: "ready" });
    else h.pending[0].reject(new Error("cancelled camera"));
    await request;
    assert.equal(h.busy(), false);
    assert.deepEqual(h.writes, ["finish"]);
    assert.notEqual(
      (h.state() as { poseRuntimeStatus?: string }).poseRuntimeStatus,
      "ready",
    );
  }
});
