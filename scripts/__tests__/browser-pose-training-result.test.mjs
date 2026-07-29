import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("browser pose result builder emits only runtime-recorded dynamic difficulty evidence", async () => {
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
    "utf8",
  );
  const evidenceSource = await readFile(
    join(rootDir, "apps/web/src/lib/dynamic-difficulty-evidence.ts"),
    "utf8",
  );
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/lib/browser-pose-dynamic-difficulty.ts"),
    "utf8",
  );
  const source = `${resultSource}\n${evidenceSource}\n${runtimeSource}`;

  assert.match(source, /dynamicDifficultyEvidence/);
  assert.match(source, /startingLevel/);
  assert.match(source, /assessmentSourceId/);
  assert.match(source, /approvedPlanItemId/);
  assert.match(source, /runtimeWindowId/);
  assert.match(source, /runtimeFrameId/);
  assert.match(source, /safetyClampReason/);
  assert.match(source, /triggerReason/);
  assert.match(source, /metricsWindow/);
  assert.match(source, /targetSizeScale/);
  assert.match(source, /minimumLandmarkVisibility/);
  assert.match(resultSource, /events:\s*stats\.difficultyAdjustmentEvents/);
  assert.doesNotMatch(evidenceSource, /resolveBrowserPoseTriggerReason/);
  assert.match(source, /accuracy_high|accuracy_low|reaction_slow|fatigue_risk|clinician_limit/);
});

test("Unity bridge parser requires the same dynamic difficulty evidence contract", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/lib/unity-training-bridge.ts"),
    "utf8",
  );

  assert.match(source, /dynamicDifficultyEvidence/);
  assert.match(source, /validateDynamicDifficultyEvidence/);
  assert.match(source, /startingLevelSource/);
  assert.match(source, /triggerReason/);
  assert.match(source, /runtimeFrameId/);
  assert.match(source, /runtimeWindowId/);
  assert.match(source, /safetyClampReason/);
});

test("API service rejects training results without dynamic difficulty evidence", async () => {
  const source = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );

  assert.match(source, /assertDynamicDifficultyEvidence/);
  assert.match(source, /dynamicDifficultyEvidence/);
  assert.match(source, /startingLevelSource/);
  assert.match(source, /runtimeFrameId/);
  assert.match(source, /runtimeWindowId/);
  assert.match(source, /safetyClampReason/);
});
