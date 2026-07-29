import assert from "node:assert/strict";
import test from "node:test";
import {
  browserPoseGameRequiredMetrics,
  getBrowserPoseGameDefinition,
  listBrowserPoseGameDefinitions,
} from "./browser-pose-game-library.ts";

test("browser pose game library exposes multiple formal free training games", () => {
  const definitions = listBrowserPoseGameDefinitions();

  assert.ok(definitions.length >= 7);
  assert.deepEqual(
    definitions.map((definition) => definition.code).sort(),
    [
      "balance_breath",
      "bilateral_rhythm_sync",
      "center_shift_bridge",
      "garden_reach",
      "mirror_sequence",
      "nebula_sort",
      "orbital_trace_follow",
    ],
  );

  for (const definition of definitions) {
    assert.equal(definition.runtimeType, "browser_pose_canvas");
    assert.equal(definition.bridgeProtocolVersion, "1.0.0");
    assert.equal(definition.status, "active");
    assert.equal(definition.buildStatus, "released");
    assert.equal(definition.releaseChannel, "production");
    assert.ok(definition.supportedInputModes.includes("camera_pose"));
    assert.deepEqual(
      definition.requiredMetrics.map((metric) => metric.metricType).sort(),
      [...browserPoseGameRequiredMetrics].sort(),
    );
    assert.equal(definition.publishedStatus, "published");
    assert.deepEqual(definition.requiredPermissions, ["camera_capture"]);
    assert.ok(definition.dynamicDifficultyTriggers.includes("prior_assessment"));
    assert.ok(definition.dynamicDifficultyTriggers.includes("clinician_limit"));
    assert.ok("safetyLimits" in definition.difficultyPolicy);
    assert.ok("requiredEvidence" in definition.resultSchema);
    assert.ok(
      definition.trainingTargets.some((target) =>
        target === "思维训练" || target === "运动训练",
      ),
      `${definition.code} missing business training category`,
    );
    assert.ok(
      definition.tags.some((tag) => tag.startsWith("purpose:")),
      `${definition.code} missing explicit business purpose tag`,
    );
    assert.doesNotMatch(
      `${definition.code} ${definition.name} ${definition.patientInstruction} ${definition.clinicalPurpose}`,
      /mock|demo|seed|fallback|fixed|manual/i,
    );
  }
});

test("browser pose definitions carry plan-variety categories and purposes at source", () => {
  const definitions = listBrowserPoseGameDefinitions();
  const combined = definitions.flatMap((definition) => [
    ...definition.trainingTargets,
    ...definition.tags,
  ]);

  for (const category of ["思维训练", "运动训练"]) {
    assert.ok(combined.includes(category), `missing source category ${category}`);
  }
  for (const purpose of [
    "purpose:risk_assessment",
    "purpose:intervention",
    "purpose:data_capture",
  ]) {
    assert.ok(combined.includes(purpose), `missing source purpose ${purpose}`);
  }
});

test("phaser browser pose games declare the free engine without becoming the sensing source", () => {
  const phaserGames = listBrowserPoseGameDefinitions().filter(
    (definition) => definition.presentationEngine === "phaser_canvas",
  );

  assert.ok(phaserGames.length >= 3);
  for (const definition of phaserGames) {
    assert.equal(definition.engineLicense, "MIT");
    assert.equal(definition.sensingSource, "mediapipe_pose");
    assert.ok(definition.targetPattern.length >= 6);
  }
});

test("bilateral rhythm sync declares a distinct bilateral coordination protocol", () => {
  const definition = getBrowserPoseGameDefinition("bilateral_rhythm_sync");
  const targetSides = definition.targetPattern.map((target) => target.side);

  assert.equal(definition.name, "双手节拍协同");
  assert.equal(definition.scoringProfile, "bilateral_coordination");
  assert.equal(definition.presentationEngine, "phaser_canvas");
  assert.equal(definition.targetIntervalMs, 1100);
  assert.equal(definition.targetExpiresMs, 2800);
  assert.equal(definition.minActionWindows, 7);
  assert.ok(targetSides.includes("both"));
  assert.ok(targetSides.includes("left"));
  assert.ok(targetSides.includes("right"));
  assert.match(definition.clinicalPurpose, /双侧|节拍|左右/);
  assert.match(definition.patientInstruction, /左右手|双手|同时/);
});

test("orbital trace follow declares a distinct trajectory tracking protocol", () => {
  const definition = getBrowserPoseGameDefinition("orbital_trace_follow");
  const targetSides = definition.targetPattern.map((target) => target.side);

  assert.equal(definition.name, "轨迹追踪巡航");
  assert.equal(definition.scoringProfile, "trajectory_tracking");
  assert.equal(definition.presentationEngine, "phaser_canvas");
  assert.equal(definition.targetIntervalMs, 300);
  assert.equal(definition.targetExpiresMs, 1800);
  assert.equal(definition.minActionWindows, 12);
  assert.ok(targetSides.includes("both"));
  assert.match(definition.clinicalPurpose, /视觉追踪|轨迹|平滑/);
  assert.match(definition.patientInstruction, /光轨|跟随|平稳/);
});

test("center shift bridge declares a distinct balance shift protocol", () => {
  const definition = getBrowserPoseGameDefinition("center_shift_bridge");
  const targetSides = definition.targetPattern.map((target) => target.side);

  assert.equal(definition.name, "重心转移星桥");
  assert.equal(definition.scoringProfile, "balance_shift");
  assert.equal(definition.presentationEngine, "phaser_canvas");
  assert.equal(definition.targetIntervalMs, 1250);
  assert.equal(definition.targetExpiresMs, 3200);
  assert.equal(definition.minActionWindows, 7);
  assert.ok(targetSides.includes("left"));
  assert.ok(targetSides.includes("right"));
  assert.ok(targetSides.includes("both"));
  assert.match(definition.clinicalPurpose, /重心|平衡|姿态/);
  assert.match(definition.patientInstruction, /身体中线|左右|稳定/);
});

test("unknown browser pose game codes are blocked instead of using a default game", () => {
  assert.throws(
    () => getBrowserPoseGameDefinition("unknown_training_game"),
    /未配置正式浏览器体感游戏/,
  );
});
