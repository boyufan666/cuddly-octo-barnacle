import assert from "node:assert/strict";
import test from "node:test";
import {
  readUnityRuntimeClientStartedAt,
  readUnityRuntimeMinConfidence,
} from "./runtime-context.ts";

test("readUnityRuntimeMinConfidence reads the server-frozen Unity threshold", () => {
  assert.equal(readUnityRuntimeMinConfidence({ minConfidence: 0.8 }), 0.8);
});

test("readUnityRuntimeMinConfidence rejects missing, legacy, and malformed thresholds", () => {
  assert.throws(
    () => readUnityRuntimeMinConfidence({}),
    /minConfidence/,
  );
  assert.throws(
    () => readUnityRuntimeMinConfidence({ minPoseVisibility: 0.8 }),
    /minConfidence/,
  );
  assert.throws(
    () => readUnityRuntimeMinConfidence({ minConfidence: "0.8" }),
    /minConfidence/,
  );
  assert.throws(
    () => readUnityRuntimeMinConfidence({ minConfidence: 1.01 }),
    /minConfidence/,
  );
  assert.throws(
    () => readUnityRuntimeMinConfidence({ minConfidence: 0 }), /minConfidence/);
});

test("readUnityRuntimeClientStartedAt forwards the server-frozen canonical session timestamp", () => {
  const clientStartedAt = "2026-07-21T04:05:40.773Z";

  assert.equal(
    readUnityRuntimeClientStartedAt(
      { clientStartedAt },
      clientStartedAt,
    ),
    clientStartedAt,
  );
});

test("readUnityRuntimeClientStartedAt blocks missing, malformed, and divergent session timestamps", () => {
  const clientStartedAt = "2026-07-21T04:05:40.773Z";
  const cases: Array<{
    snapshot: unknown;
    sessionClientStartedAt: unknown;
    expectedError: RegExp;
  }> = [
    {
      snapshot: {},
      sessionClientStartedAt: clientStartedAt,
      expectedError: /runtimeConfigSnapshot\.clientStartedAt/,
    },
    {
      snapshot: { clientStartedAt: "2026-07-21T12:05:40.773+08:00" },
      sessionClientStartedAt: clientStartedAt,
      expectedError: /runtimeConfigSnapshot\.clientStartedAt/,
    },
    {
      snapshot: { clientStartedAt },
      sessionClientStartedAt: " 2026-07-21T04:05:40.773Z ",
      expectedError: /训练会话 clientStartedAt/,
    },
    {
      snapshot: { clientStartedAt },
      sessionClientStartedAt: "2026-07-21T04:05:40.774Z",
      expectedError: /不一致/,
    },
  ];

  for (const { snapshot, sessionClientStartedAt, expectedError } of cases) {
    assert.throws(
      () =>
        readUnityRuntimeClientStartedAt(snapshot, sessionClientStartedAt),
      expectedError,
    );
  }
});
