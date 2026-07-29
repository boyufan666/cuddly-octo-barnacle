import assert from "node:assert/strict";
import test from "node:test";
import {
  isBenignPoseRuntimeConsoleError,
  withBenignPoseConsoleErrorSuppressed,
} from "./pose-runtime-console.ts";

test("isBenignPoseRuntimeConsoleError accepts the TensorFlow Lite XNNPACK info line", () => {
  assert.equal(
    isBenignPoseRuntimeConsoleError([
      "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
    ]),
    true,
  );
});

test("isBenignPoseRuntimeConsoleError rejects real runtime errors", () => {
  assert.equal(isBenignPoseRuntimeConsoleError(["Failed to load pose model"]), false);
  assert.equal(isBenignPoseRuntimeConsoleError(["Error: camera failed"]), false);
  assert.equal(isBenignPoseRuntimeConsoleError([new Error("camera denied")]), false);
  assert.equal(isBenignPoseRuntimeConsoleError([]), false);
});

test("withBenignPoseConsoleErrorSuppressed only suppresses the known runtime info line", () => {
  const originalConsoleError = console.error;
  const forwarded: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    forwarded.push(args);
  };

  try {
    withBenignPoseConsoleErrorSuppressed(() => {
      console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
      console.error("Failed to load pose model");
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(forwarded, [["Failed to load pose model"]]);
});

test("withBenignPoseConsoleErrorSuppressed restores console.error after failures", () => {
  const originalConsoleError = console.error;
  assert.throws(
    () =>
      withBenignPoseConsoleErrorSuppressed(() => {
        throw new Error("pose detection failed");
      }),
    /pose detection failed/,
  );
  assert.equal(console.error, originalConsoleError);
});

test("withBenignPoseConsoleErrorSuppressed keeps suppression active until overlapping async operations finish", async () => {
  const originalConsoleError = console.error;
  const forwarded: unknown[][] = [];
  const baseConsoleError = (...args: unknown[]) => {
    forwarded.push(args);
  };
  console.error = baseConsoleError;

  let finishFirst!: () => void;
  let finishSecond!: () => void;

  try {
    const first = withBenignPoseConsoleErrorSuppressed(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const second = withBenignPoseConsoleErrorSuppressed(
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );

    finishFirst();
    await first;

    console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
    console.error("pose model still loading");

    finishSecond();
    await second;

    assert.equal(console.error, baseConsoleError);
    assert.deepEqual(forwarded, [["pose model still loading"]]);
  } finally {
    console.error = originalConsoleError;
  }
});
