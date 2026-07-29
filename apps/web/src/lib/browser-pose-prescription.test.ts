import assert from "node:assert/strict";
import test from "node:test";
import {
  hasBrowserPosePrescriptionDurationElapsed,
  requireBrowserPosePrescriptionDurationSeconds,
} from "./browser-pose-prescription.ts";

test("browser pose duration uses the prescribed whole minutes exactly", () => {
  assert.equal(requireBrowserPosePrescriptionDurationSeconds(7), 420);
});

test("browser pose duration hard-fails when prescribed minutes are missing or illegal", () => {
  for (const value of [undefined, null, "7", Number.NaN, 0, -1, 1.5]) {
    assert.throws(
      () => requireBrowserPosePrescriptionDurationSeconds(value),
      /处方时长/,
    );
  }
});

test("browser pose duration completes only after the full prescribed runtime has elapsed", () => {
  assert.equal(
    hasBrowserPosePrescriptionDurationElapsed({
      startedAtMs: 1_000,
      timestampMs: 60_999,
      targetDurationSeconds: 60,
    }),
    false,
  );
  assert.equal(
    hasBrowserPosePrescriptionDurationElapsed({
      startedAtMs: 1_000,
      timestampMs: 61_000,
      targetDurationSeconds: 60,
    }),
    true,
  );
});
