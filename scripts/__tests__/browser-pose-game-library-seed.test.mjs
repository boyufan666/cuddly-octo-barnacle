import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const formalBrowserPoseGameCodes = [
  "garden_reach",
  "mirror_sequence",
  "nebula_sort",
  "balance_breath",
  "bilateral_rhythm_sync",
  "center_shift_bridge",
  "orbital_trace_follow",
];
const requiredMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
];
const requiredBusinessCategories = ["思维训练", "运动训练"];
const requiredPlanUseCases = ["风险评估辅助", "干预训练", "数据采集"];
const formalPlanVarietyGameCodes = [
  "rhythm_reach_3d",
  "garden_reach",
  "mirror_sequence",
  "nebula_sort",
  "balance_breath",
  "bilateral_rhythm_sync",
  "center_shift_bridge",
  "orbital_trace_follow",
  "memory_path",
];
const allPatientPlanVarietyGameCodes = [
  ...formalPlanVarietyGameCodes,
  "memory_basket",
  "path_treasure",
];

test("seed exposes a formal multi-game browser pose library", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );
  const browserPoseMetadataBlock = extractConstObject(
    seedSource,
    "formalBrowserPoseGameMetadata",
  );
  const publishedMetadataBlock = extractConstObject(
    seedSource,
    "formalPublishedGameMetadata",
  );
  const browserPoseMetricsBlock = extractConstArray(
    seedSource,
    "browserPoseRequiredMetrics",
  );

  assert.match(publishedMetadataBlock, /difficultyPolicy:\s*formalDynamicDifficultyPolicy/);
  assert.match(publishedMetadataBlock, /dynamicDifficultyTriggers/);
  assert.match(publishedMetadataBlock, /publishedStatus:\s*"published"/);
  assert.match(publishedMetadataBlock, /status:\s*"active"/);
  assert.match(browserPoseMetadataBlock, /\.\.\.formalPublishedGameMetadata/);
  assert.match(browserPoseMetadataBlock, /requiredPermissions:\s*\["camera_capture"\]/);
  assert.match(browserPoseMetadataBlock, /resultSchema:\s*browserPoseResultSchema/);
  assert.match(seedSource, /prior_assessment/);
  assert.match(seedSource, /reaction_slow|accuracy_high|accuracy_low|fatigue_risk/);
  assert.match(seedSource, /clinician_limit/);
  assert.match(seedSource, /safetyLimits/);
  for (const metricType of requiredMetricTypes) {
    assert.match(
      browserPoseMetricsBlock,
      new RegExp(`metricType:\\s*"${escapeRegExp(metricType)}"`),
    );
  }
  for (const code of formalBrowserPoseGameCodes) {
    const block = extractGameUpsertBlock(seedSource, code);
    assert.match(block, /runtimeType:\s*"browser_pose_canvas"/);
    assert.match(block, /manifestUrl:\s*null/);
    assert.match(block, /buildBaseUrl:\s*null/);
    assert.match(block, /buildStatus:\s*"released"/);
    assert.match(block, /releaseChannel:\s*"production"/);
    assert.match(block, /supportedInputModes:\s*\["camera_pose"\]/);
    assert.match(block, /requiredMetrics:\s*browserPoseRequiredMetrics/);
    assert.match(block, /\.\.\.formalBrowserPoseGameMetadata/);
    assert.doesNotMatch(block, /mock|demo|seed_import|fallback|fixed/i);
  }
});

test("seed exposes required Unity, browser pose, and cognitive deliverable games", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  const unityBlock = extractGameUpsertBlock(seedSource, "rhythm_reach_3d");
  assert.match(unityBlock, /runtimeType:\s*"unity_webgl"/);
  assert.match(unityBlock, /difficultyPolicy/);
  assert.match(unityBlock, /dynamicDifficultyTriggers/);
  assert.match(unityBlock, /difficulty_level/);

  const browserBlock = extractGameUpsertBlock(seedSource, "garden_reach");
  assert.match(browserBlock, /runtimeType:\s*"browser_pose_canvas"/);
  assert.match(browserBlock, /supportedInputModes:\s*\["camera_pose"\]/);
  assert.match(browserBlock, /\.\.\.formalBrowserPoseGameMetadata/);

  const cognitiveBlock = extractGameUpsertBlock(seedSource, "memory_path");
  assert.match(cognitiveBlock, /runtimeType:\s*"cognitive_web"/);
  assert.match(cognitiveBlock, /supportedInputModes:\s*\["touch",\s*"keyboard"\]/);
  assert.match(cognitiveBlock, /supportsCamera:\s*false/);
  assert.match(cognitiveBlock, /requiredMetrics:\s*cognitiveRequiredMetrics/);
  assert.match(cognitiveBlock, /\.\.\.formalCognitiveGameMetadata/);
  assert.match(cognitiveBlock, /memory_sequence|sequence_recall|path_completion_rate/);
  assert.doesNotMatch(cognitiveBlock, /camera_pose|mediapipe|phaser/i);
});

test("seed formal content carries patient-safe plan variety metadata", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  const gameBlocks = formalPlanVarietyGameCodes.map((code) =>
    extractGameUpsertBlock(seedSource, code),
  );
  const combined = gameBlocks.join("\n");

  assert.match(combined, /purpose:risk_assessment/);
  assert.match(combined, /purpose:intervention/);
  assert.match(combined, /purpose:data_capture/);

  for (const category of requiredBusinessCategories) {
    assert.match(
      combined,
      new RegExp(`"${escapeRegExp(category)}"`),
      `missing business category: ${category}`,
    );
  }
  for (const useCase of requiredPlanUseCases) {
    assert.match(
      combined,
      new RegExp(`"${escapeRegExp(useCase)}"`),
      `missing plan use case: ${useCase}`,
    );
  }
  assert.ok(
    gameBlocks.length >= 5,
    `expected at least five formal plan-variety games, got ${gameBlocks.length}`,
  );
  assert.ok(
    gameBlocks.filter((block) => /"思维训练"/.test(block)).length >= 1,
    "expected at least one cognitive formal game",
  );
  assert.ok(
    gameBlocks.filter((block) => /"运动训练"/.test(block)).length >= 2,
    "expected at least two movement formal games",
  );
  assert.doesNotMatch(combined, /mock|demo|fallback|fixed/i);
});

test("seed patient plan-variety update and create paths carry one business target set", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  for (const code of allPatientPlanVarietyGameCodes) {
    const block = extractGameUpsertBlock(seedSource, code);
    const updateBlock = extractObjectPropertyBlock(block, "update");
    const createBlock = extractObjectPropertyBlock(block, "create");

    for (const [branchName, branchBlock] of [
      ["update", updateBlock],
      ["create", createBlock],
    ]) {
      assert.equal(
        countProperty(branchBlock, "trainingTargets"),
        1,
        `${code} ${branchName} must define trainingTargets once`,
      );
      assert.equal(
        countProperty(branchBlock, "tags"),
        1,
        `${code} ${branchName} must define tags once`,
      );
      assert.match(
        branchBlock,
        /"思维训练"|"运动训练"/,
        `${code} ${branchName} must include a business category`,
      );
      assert.match(
        branchBlock,
        /purpose:(risk_assessment|intervention|data_capture)/,
        `${code} ${branchName} must include an explicit plan purpose`,
      );
    }
  }
});

test("seed formal plan-variety games all carry complete risk intervention and data purposes", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  for (const code of formalPlanVarietyGameCodes) {
    const block = extractGameUpsertBlock(seedSource, code);
    for (const branchName of ["update", "create"]) {
      const branchBlock = extractObjectPropertyBlock(block, branchName);
      for (const purpose of [
        "purpose:risk_assessment",
        "purpose:intervention",
        "purpose:data_capture",
      ]) {
        assert.match(
          branchBlock,
          new RegExp(escapeRegExp(purpose)),
          `${code} ${branchName} missing ${purpose}`,
        );
      }
      for (const purposeLabel of ["风险评估辅助", "干预训练", "数据采集"]) {
        assert.match(
          branchBlock,
          new RegExp(escapeRegExp(purposeLabel)),
          `${code} ${branchName} missing ${purposeLabel}`,
        );
      }
    }
  }
});

test("seed documents Phaser as a free presentation engine without changing sensing source", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  assert.match(seedSource, /"engine:phaser_canvas"/);
  assert.match(seedSource, /"license:MIT"/);
  assert.match(seedSource, /"sensing:mediapipe_pose"/);
});

test("seed does not append duplicate mutable clinical records", async () => {
  const seedSource = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );
  const forbiddenCreatePatterns = [
    /prisma\.consentRecord\.create\(/,
    /prisma\.assessmentRecord\.create\(/,
    /prisma\.riskGradeRecord\.create\(/,
    /prisma\.aiAnalysisRecord\.create\(/,
    /prisma\.rehabPlan\.create\(/,
    /prisma\.rehabPlanItem\.create\(/,
    /prisma\.planAdjustmentRecord\.create\(/,
    /prisma\.auditLog\.createMany\(/,
  ];

  for (const pattern of forbiddenCreatePatterns) {
    assert.doesNotMatch(
      seedSource,
      pattern,
      `seed contains unguarded mutable create: ${pattern}`,
    );
  }
  assert.match(seedSource, /upsert|findFirst/);
  assert.match(seedSource, /SEED-/);
});

function extractGameUpsertBlock(seedSource, code) {
  const startMarker = `where: { code: "${code}" }`;
  const start = seedSource.indexOf(startMarker);
  assert.notEqual(start, -1, `seed is missing ${code}`);
  const nextUpsert = seedSource.indexOf("prisma.gameContent.upsert({", start + 1);
  return nextUpsert === -1
    ? seedSource.slice(start)
    : seedSource.slice(start, nextUpsert);
}

function extractConstObject(source, name) {
  const startMarker = `const ${name} = {`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${name}`);
  const nextConst = source.indexOf("\nconst ", start + startMarker.length);
  return nextConst === -1 ? source.slice(start) : source.slice(start, nextConst);
}

function extractConstArray(source, name) {
  const startMarker = `const ${name} = [`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${name}`);
  const nextConst = source.indexOf("\nconst ", start + startMarker.length);
  return nextConst === -1 ? source.slice(start) : source.slice(start, nextConst);
}

function extractObjectPropertyBlock(source, propertyName) {
  const marker = `${propertyName}: {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing object property: ${propertyName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }
  assert.fail(`unterminated object property: ${propertyName}`);
}

function countProperty(source, propertyName) {
  return Array.from(source.matchAll(new RegExp(`\\b${propertyName}:`, "g"))).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
