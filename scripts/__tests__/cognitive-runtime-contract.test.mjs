import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const rootDir = process.cwd();

test("cognitive runtime receives the prescribed duration without a game default", async () => {
  const [stageSource, surfaceSource] = await Promise.all([
    read("apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx"),
    read("apps/web/src/features/training-runtime/CognitiveTrainingSurface.tsx"),
  ]);
  const cognitiveStage = sliceBetween(
    stageSource,
    'runtimeType === "cognitive_web"',
    "return <TrainingRuntimeUnavailable",
  );

  assert.match(cognitiveStage, /durationMinutes=\{planItem\.durationMinutes\}/);
  assert.match(cognitiveStage, /key=\{trainingSession\.id\}/);
  assert.match(surfaceSource, /durationMinutes: number/);
  assert.match(
    surfaceSource,
    /requireCognitiveDurationSeconds\(durationMinutes\)/,
  );
  assert.doesNotMatch(surfaceSource, /game\.defaultDuration/);
});

test("cognitive runtime has explicit memorize answer feedback and completed phases", async () => {
  const [surfaceSource, lifecycleSource] = await Promise.all([
    read("apps/web/src/features/training-runtime/CognitiveTrainingSurface.tsx"),
    read("apps/web/src/lib/cognitive-training-lifecycle.ts"),
  ]);

  assert.match(lifecycleSource, /export type CognitivePhase/);
  assert.match(lifecycleSource, /\| "timed_out"/);
  assert.match(lifecycleSource, /\| "submitting"/);
  assert.match(lifecycleSource, /\| "error"/);
  assert.match(surfaceSource, /phase === "memorize"/);
  assert.match(surfaceSource, /round\.sequence\.map/);
  assert.match(surfaceSource, /phase === "answer"/);
  assert.match(surfaceSource, /phase === "feedback"/);
  assert.match(surfaceSource, /phase === "completed"/);
  assert.match(surfaceSource, /aria-live="polite"/);
  assert.match(surfaceSource, /剩余时间/);
});

test("cognitive runtime cannot repeat a choice and does not sort to fake randomness", async () => {
  const [surfaceSource, runtimeSource] = await Promise.all([
    read("apps/web/src/features/training-runtime/CognitiveTrainingSurface.tsx"),
    read("apps/web/src/lib/cognitive-training-runtime.ts"),
  ]);

  assert.match(surfaceSource, /appendCognitiveAnswer/);
  assert.match(surfaceSource, /answers\.includes\(option\)/);
  assert.match(surfaceSource, /createCognitiveRound/);
  assert.doesNotMatch(surfaceSource, /shuffleStable|\.sort\(/);
  assert.match(runtimeSource, /random = Math\.random/);
  assert.match(runtimeSource, /for \(let index = shuffled\.length - 1/);
  assert.doesNotMatch(runtimeSource, /\.sort\(/);
});

test("cognitive runtime only completes on the prescription clock and passes runtime adjustments", async () => {
  const [surfaceSource, resultSource] = await Promise.all([
    read("apps/web/src/features/training-runtime/CognitiveTrainingSurface.tsx"),
    read("apps/web/src/lib/cognitive-web-training-result.ts"),
  ]);

  assert.match(surfaceSource, /isCognitivePrescriptionComplete/);
  assert.match(
    surfaceSource,
    /completionReason: "prescribed_duration_elapsed"/,
  );
  assert.match(surfaceSource, /difficultyAdjustmentEvents:/);
  assert.match(surfaceSource, /createCognitiveDifficultyAdjustment/);
  assert.doesNotMatch(surfaceSource, /生成本次表现|canComplete/);
  assert.match(resultSource, /stats\.difficultyAdjustmentEvents/);
  assert.doesNotMatch(
    resultSource,
    /buildBrowserPoseDynamicDifficultyEvidence|browser-frame|browser-pose/i,
  );
});

test("cognitive surface guards async submission and exposes retryable timeout states", async () => {
  const surfaceSource = await read(
    "apps/web/src/features/training-runtime/CognitiveTrainingSurface.tsx",
  );

  assert.match(surfaceSource, /createCognitiveSubmissionGuard/);
  assert.match(surfaceSource, /runCognitiveSubmission/);
  assert.match(surfaceSource, /submissionGuard\.activate\(\)/);
  assert.match(surfaceSource, /submissionGuard\.invalidate\(\)/);
  assert.match(surfaceSource, /startCognitiveClock/);
  assert.match(surfaceSource, /phase === "submitting"/);
  assert.match(surfaceSource, /phase === "timed_out"/);
  assert.match(surfaceSource, /phase === "error"/);
  assert.match(surfaceSource, /重新提交训练结果/);
  assert.match(surfaceSource, /aria-live="polite"/);
});

async function read(path) {
  return readFile(join(rootDir, path), "utf8");
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
