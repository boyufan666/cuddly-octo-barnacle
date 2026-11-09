import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("Phaser pose stage is a client-only runtime and blocks on load errors", async () => {
  const componentSource = await readFile(
    join(rootDir, "apps/web/src/components/training/PhaserPoseStage.tsx"),
    "utf8",
  );

  assert.match(componentSource, /^"use client";/);
  assert.match(componentSource, /await import\("phaser"\)/);
  assert.doesNotMatch(componentSource, /import Phaser from "phaser"/);
  assert.match(componentSource, /onError\(message\)/);
  assert.match(componentSource, /new Phaser\.Game/);
  assert.doesNotMatch(componentSource, /fallback/i);
});

test("training page requires Phaser stage readiness before Phaser games start", async () => {
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx"),
    "utf8",
  );
  const gameContainerBlock = extractFunctionBlock(runtimeSource, "BrowserPoseTrainingSurface");

  assert.match(runtimeSource, /PhaserPoseStage as TrainingMotionStage/);
  assert.match(gameContainerBlock, /<TrainingMotionStage/);
  assert.match(gameContainerBlock, /requiresEnhancedStage/);
  assert.match(
    gameContainerBlock,
    /!isMotionStageReadyForTraining\(motionStageReady, motionStageReadyRef\)/,
  );
  assert.match(gameContainerBlock, /训练画面尚未就绪，不能开始本次训练。/);
  assert.doesNotMatch(gameContainerBlock, /fallback/i);
});

test("training page renders bilateral targets from hand-specific visible zones", async () => {
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx"),
    "utf8",
  );
  const gameContainerBlock = extractFunctionBlock(runtimeSource, "BrowserPoseTrainingSurface");
  const visibleTargetBlock = extractFunctionBlock(
    runtimeSource,
    "renderBrowserPoseVisibleTargets",
  );

  assert.match(gameContainerBlock, /renderBrowserPoseVisibleTargets/);
  assert.match(visibleTargetBlock, /bilateralLeftTarget/);
  assert.match(visibleTargetBlock, /bilateralRightTarget/);
  assert.match(visibleTargetBlock, /左手/);
  assert.match(visibleTargetBlock, /右手/);
});

test("Phaser pose stage includes patient-facing bilateral coordination copy", async () => {
  const componentSource = await readFile(
    join(rootDir, "apps/web/src/components/training/PhaserPoseStage.tsx"),
    "utf8",
  );

  assert.match(componentSource, /bilateral_coordination/);
  assert.match(componentSource, /双手节拍协同/);
  assert.match(componentSource, /按节拍完成左右手协同/);
});

test("Phaser pose stage includes patient-facing trajectory tracking copy", async () => {
  const componentSource = await readFile(
    join(rootDir, "apps/web/src/components/training/PhaserPoseStage.tsx"),
    "utf8",
  );

  assert.match(componentSource, /trajectory_tracking/);
  assert.match(componentSource, /轨迹追踪巡航/);
  assert.match(componentSource, /沿着光轨平稳追踪/);
});

test("Phaser pose stage includes patient-facing balance shift copy", async () => {
  const componentSource = await readFile(
    join(rootDir, "apps/web/src/components/training/PhaserPoseStage.tsx"),
    "utf8",
  );

  assert.match(componentSource, /balance_shift/);
  assert.match(componentSource, /重心转移星桥/);
  assert.match(componentSource, /跟随星桥提示平稳转移重心/);
  assert.match(componentSource, /centerline|重心线|balanceRail/);
});

function extractFunctionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} not found`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}
