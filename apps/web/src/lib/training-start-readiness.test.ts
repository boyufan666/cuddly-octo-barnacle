import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTrainingStartReadiness,
  type TrainingStartReadinessInput,
} from "./training-start-readiness.ts";

const readyInput: TrainingStartReadinessInput = {
  hasPlanItem: true,
  gameReady: true,
  requiresCameraCheck: true,
  deviceReady: true,
  poseReady: true,
  trainingPreparationReady: true,
  isBusy: false,
};

test("training start is blocked when formal training preparation is missing", () => {
  const readiness = resolveTrainingStartReadiness({
    ...readyInput,
    trainingPreparationReady: false,
  });

  assert.deepEqual(readiness, {
    canStart: false,
    blockedKey: "training_preparation",
    message: "今天的训练还未完成准备，请联系医师或工作人员处理。",
  });
});

test("training start is allowed only when all formal start conditions are ready", () => {
  const readiness = resolveTrainingStartReadiness(readyInput);

  assert.equal(readiness.canStart, true);
  assert.equal(readiness.blockedKey, undefined);
  assert.equal(readiness.message, undefined);
});

test("training start reports the first patient-actionable missing condition", () => {
  const readiness = resolveTrainingStartReadiness({
    ...readyInput,
    deviceReady: false,
    poseReady: false,
    trainingPreparationReady: false,
  });

  assert.equal(readiness.canStart, false);
  assert.equal(readiness.blockedKey, "device");
  assert.equal(
    readiness.message,
    "请先完成摄像头设备检测，再开始训练。",
  );
});

test("non-camera training is not blocked by camera or pose checks", () => {
  const readiness = resolveTrainingStartReadiness({
    ...readyInput,
    requiresCameraCheck: false,
    deviceReady: false,
    poseReady: false,
  });

  assert.deepEqual(readiness, {
    canStart: true,
  });
});
