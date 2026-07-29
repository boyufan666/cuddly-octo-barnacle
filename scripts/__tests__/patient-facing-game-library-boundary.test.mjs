import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("patient training screen uses game library copy without exposing engine internals", async () => {
  const browserSurface = await readFile(
    join(rootDir, "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx"),
    "utf8",
  );
  const gameContainerBlock = extractFunctionBlock(browserSurface, "BrowserPoseTrainingSurface");
  const definitionReaderBlock = extractFunctionBlock(
    browserSurface,
    "readBrowserPoseGameDefinitionForScreen",
  );

  assert.match(gameContainerBlock, /readBrowserPoseGameDefinitionForScreen\(game\.code\)/);
  assert.match(definitionReaderBlock, /getBrowserPoseGameDefinition\(code\)/);
  assert.match(gameContainerBlock, /patientInstruction/);
  assert.match(gameContainerBlock, /clinicalPurpose/);
  assert.doesNotMatch(gameContainerBlock, />\s*Phaser\s*</i);
  assert.doesNotMatch(gameContainerBlock, />\s*Canvas\s*</i);
  assert.doesNotMatch(gameContainerBlock, /presentationEngine/i);
  assert.doesNotMatch(gameContainerBlock, /engineLicense/i);
});

test("patient training screen blocks unconfigured browser games instead of reusing another game", async () => {
  const browserSurface = await readFile(
    join(rootDir, "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx"),
    "utf8",
  );
  const gameContainerBlock = extractFunctionBlock(browserSurface, "BrowserPoseTrainingSurface");

  assert.doesNotMatch(gameContainerBlock, /tryGetBrowserPoseGameDefinition/);
  assert.doesNotMatch(gameContainerBlock, /pose_reaction_hit["']?\s*\)/);
});

test("patient game library presents category and plan purpose without runtime labels", async () => {
  const librarySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/GameLibraryPage.tsx"),
    "utf8",
  );
  const copySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-copy.ts"),
    "utf8",
  );

  assert.match(librarySource, /patientTrainingCategoryLabel/);
  assert.match(librarySource, /patientTrainingPurposeLabel/);
  assert.match(librarySource, /groupPatientGamesByCategory/);
  assert.match(librarySource, /categorySections\.map/);
  assert.match(librarySource, /思维训练|运动训练/);
  assert.match(librarySource, /风险评估辅助|干预训练/);
  assert.doesNotMatch(librarySource, /数据采集|purpose:data_capture/);
  assert.match(librarySource, /记忆果篮/);
  assert.match(librarySource, /路径寻宝/);
  assert.match(copySource, /function patientTrainingCategoryLabel|export function patientTrainingCategoryLabel/);
  assert.match(copySource, /function patientTrainingPurposeLabel|export function patientTrainingPurposeLabel/);
  assert.doesNotMatch(
    visibleTextLiterals(librarySource),
    /runtime|runtimeType|Unity|MediaPipe|Phaser|Canvas|manifest|engine|license|sensing|fallback|mock|demo/i,
  );
});

test("patient result flow does not mount the game library", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const navigationSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const patientNav = navigationSource.slice(
    navigationSource.indexOf("patientTaskNavItems"),
    navigationSource.indexOf("doctorNavItems"),
  );

  assert.match(patientNav, /label:\s*"记录"/);
  assert.match(workspaceSource, /<TrainingResultPage/);
  assert.doesNotMatch(resultSource, /<GameLibraryPage/);
  assert.doesNotMatch(resultSource, /方案游戏库|能力展示|demo|mock|fallback/i);
});

function extractFunctionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} not found`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

function visibleTextLiterals(source) {
  return Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) => text.trim())
    .filter(Boolean)
    .join("\n");
}
