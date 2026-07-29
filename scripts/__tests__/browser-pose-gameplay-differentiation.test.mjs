import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

const formalBrowserPoseGames = [
  ["garden_reach", "reaction_reach"],
  ["mirror_sequence", "memory_sequence"],
  ["nebula_sort", "selective_sort"],
  ["balance_breath", "steady_breath"],
  ["bilateral_rhythm_sync", "bilateral_coordination"],
  ["orbital_trace_follow", "trajectory_tracking"],
  ["center_shift_bridge", "balance_shift"],
];

const scoringProfileGameplayTerms = {
  reaction_reach: ["反应", "触达"],
  memory_sequence: ["序列", "记忆"],
  selective_sort: ["分拣", "干扰"],
  steady_breath: ["呼吸", "稳定"],
  bilateral_coordination: ["双手", "协同"],
  trajectory_tracking: ["轨迹", "追踪"],
  balance_shift: ["重心", "平衡"],
};

test("formal browser pose games expose one distinct scoringProfile per game", async () => {
  const librarySource = await readFile(
    join(rootDir, "apps/web/src/lib/browser-pose-game-library.ts"),
    "utf8",
  );

  const profiles = [];
  for (const [code, scoringProfile] of formalBrowserPoseGames) {
    const block = extractObjectBlockContaining(
      librarySource,
      `code: "${code}"`,
    );
    assert.match(block, /runtimeType:\s*"browser_pose_canvas"/);
    assert.match(
      block,
      new RegExp(`scoringProfile:\\s*"${escapeRegExp(scoringProfile)}"`),
      `${code} must declare the ${scoringProfile} scoringProfile`,
    );
    profiles.push(scoringProfile);
  }

  assert.equal(
    new Set(profiles).size,
    formalBrowserPoseGames.length,
    "each formal browser pose game should have a different scoringProfile",
  );
});

test("browser pose runtime reads scoringProfile for gameplay copy and summary labels", async () => {
  const [runtimeSurfaceSource, stageSource, rulesSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/components/training/PhaserPoseStage.tsx"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
  ]);
  const runtimeSurfaceBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "BrowserPoseTrainingSurface",
  );
  const targetFactoryBlock = extractFunctionBlock(
    rulesSource,
    "createBrowserPoseTarget",
  );

  assert.match(
    runtimeSurfaceBlock,
    /profile=\{gameDefinition\.scoringProfile\}/,
    "the runtime surface must pass scoringProfile to the active stage",
  );
  assert.match(
    stageSource,
    /profile:\s*BrowserPoseGameDefinition\["scoringProfile"\]/,
    "the Phaser stage must accept scoringProfile as an explicit runtime input",
  );
  assert.doesNotMatch(
    targetFactoryBlock,
    /targetPattern[\s\S]*label:\s*pattern\.label[\s\S]*$/,
    "target labels should not be produced only from targetPattern; scoringProfile must shape gameplay labels",
  );

  const runtimeCopySource = `${runtimeSurfaceBlock}\n${stageSource}`;
  for (const [profile, requiredTerms] of Object.entries(
    scoringProfileGameplayTerms,
  )) {
    assert.match(
      runtimeCopySource,
      new RegExp(escapeRegExp(profile)),
      `${profile} must be handled in runtime gameplay copy or summary labels`,
    );
    for (const term of requiredTerms) {
      assert.match(
        runtimeCopySource,
        new RegExp(escapeRegExp(term)),
        `${profile} needs patient-facing scoring hints or result labels that mention ${term}`,
      );
    }
  }
});

test("browser pose result payload records scoringProfile and profile-specific evidence", async () => {
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
    "utf8",
  );

  assert.match(resultSource, /scoringProfile:\s*stats\.scoringProfile/);
  assert.match(resultSource, /gameplayResultLabel/);
  assert.match(resultSource, /profileStats/);

  const expectedProfileStats = {
    reaction_reach: ["reactionWindowCount", "reactionScore"],
    memory_sequence: ["sequenceStepCount", "sequenceRetentionScore"],
    selective_sort: ["sortedTargetCount", "selectiveAttentionScore"],
    steady_breath: ["rhythmWindowCount", "stabilityScore"],
    bilateral_coordination: ["coordinationWindowCount", "coordinationScore"],
    trajectory_tracking: ["trackingWindowCount", "trajectoryTrackingScore"],
    balance_shift: ["balanceWindowCount", "balanceShiftScore"],
  };

  for (const [profile, fields] of Object.entries(expectedProfileStats)) {
    assert.match(resultSource, new RegExp(escapeRegExp(profile)));
    for (const field of fields) {
      assert.match(
        resultSource,
        new RegExp(escapeRegExp(field)),
        `${profile} payload evidence must include ${field}`,
      );
    }
  }
});

test("selective sort uses real distractor inhibition rules instead of counting every contact as a hit", async () => {
  const [runtimeSurfaceSource, rulesSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const targetKindBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetKind",
  );
  const interactionBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetInteraction",
  );
  const profileStatsBlock = extractFunctionBlock(
    resultSource,
    "buildBrowserPoseProfileStats",
  );

  assert.match(targetKindBlock, /scoringProfile\s*===\s*"selective_sort"/);
  assert.match(targetKindBlock, /return\s+"distractor"/);
  assert.match(interactionBlock, /target\.kind\s*===\s*"distractor"/);
  assert.match(interactionBlock, /distractorErrorCount\s*\+=\s*1/);
  assert.match(interactionBlock, /distractorAvoidanceCount\s*\+=\s*1/);
  const distractorBranch = sliceBetween(
    interactionBlock,
    'if (target.kind === "distractor")',
    '\n\n  if (target.kind === "sequence_step")',
  );
  assert.doesNotMatch(
    distractorBranch,
    /reactionTimes\.push/,
    "distractor interactions must not be stored as normal reaction hits",
  );
  assert.match(
    runtimeSurfaceSource,
    /resolveBrowserPoseTargetInteraction\(\s*stats,\s*target/,
  );
  assert.match(runtimeSurfaceSource, /target\.kind\s*===\s*"distractor"/);
  assert.match(profileStatsBlock, /sortedTargetCount:\s*stats\.actionHitCount/);
  assert.doesNotMatch(profileStatsBlock, /actionHitCount\s*\?\?/);
  assert.match(profileStatsBlock, /distractorAvoidanceCount/);
  assert.match(profileStatsBlock, /distractorErrorCount/);
});

test("memory sequence records real sequence step and round evidence", async () => {
  const [runtimeSurfaceSource, rulesSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const targetKindBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetKind",
  );
  const interactionBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetInteraction",
  );
  const profileStatsBlock = extractFunctionBlock(
    resultSource,
    "buildBrowserPoseProfileStats",
  );
  const displayBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "resolveBrowserPoseGameplayStatsDisplay",
  );

  assert.match(targetKindBlock, /scoringProfile\s*===\s*"memory_sequence"/);
  assert.match(targetKindBlock, /return\s+"sequence_step"/);
  assert.match(interactionBlock, /target\.kind\s*===\s*"sequence_step"/);
  assert.match(interactionBlock, /sequenceCorrectStepCount\s*\+=\s*1/);
  assert.match(interactionBlock, /sequenceCompletedRoundCount\s*\+=\s*1/);
  assert.match(interactionBlock, /sequenceErrorCount\s*\+=\s*1/);
  assert.match(profileStatsBlock, /sequenceCorrectStepCount/);
  assert.match(profileStatsBlock, /sequenceCompletedRoundCount/);
  assert.match(profileStatsBlock, /sequenceErrorCount/);
  assert.match(displayBlock, /当前进度/);
  assert.match(displayBlock, /完成情况/);
});

test("steady breath records sustained hold stability evidence instead of simple touch hits", async () => {
  const [runtimeSurfaceSource, rulesSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const targetKindBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetKind",
  );
  const interactionBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetInteraction",
  );
  const profileStatsBlock = extractFunctionBlock(
    resultSource,
    "buildBrowserPoseProfileStats",
  );
  const displayBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "resolveBrowserPoseGameplayStatsDisplay",
  );

  assert.match(targetKindBlock, /scoringProfile\s*===\s*"steady_breath"/);
  assert.match(targetKindBlock, /return\s+"steady_hold"/);
  assert.match(interactionBlock, /target\.kind\s*===\s*"steady_hold"/);
  assert.match(interactionBlock, /steadyHoldStartedAtMs\s*===\s*undefined/);
  assert.match(
    interactionBlock,
    /holdDurationMs\s*>=\s*target\.steadyHoldRequiredMs/,
  );
  assert.match(interactionBlock, /steadyStableWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /steadyMissedWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /steadyHoldBreakCount\s*\+=\s*1/);
  assert.match(
    interactionBlock,
    /steadyHoldDurationMsTotal\s*\+=\s*holdDurationMs/,
  );
  assert.match(interactionBlock, /reactionTimes\.push\(holdDurationMs\)/);
  const steadyHoldBranch = sliceBetween(
    interactionBlock,
    'if (target.kind === "steady_hold")',
    '\n\n  if (target.kind === "bilateral_pair")',
  );
  assert.doesNotMatch(
    steadyHoldBranch,
    /timestampMs\s*-\s*target\.appearedAtMs/,
    "steady breath must record sustained hold duration, not first-touch reaction time",
  );
  assert.match(
    profileStatsBlock,
    /rhythmWindowCount:\s*stats\.steadyWindowCount/,
  );
  assert.match(
    profileStatsBlock,
    /stableWindowCount:\s*stats\.steadyStableWindowCount/,
  );
  assert.match(
    profileStatsBlock,
    /driftWindowCount:\s*stats\.steadyMissedWindowCount/,
  );
  assert.match(
    profileStatsBlock,
    /holdBreakCount:\s*stats\.steadyHoldBreakCount/,
  );
  assert.match(profileStatsBlock, /averageHoldMs/);
  assert.match(
    profileStatsBlock,
    /bestHoldMs:\s*Math\.round\(stats\.steadyBestHoldMs\)/,
  );
  assert.match(
    profileStatsBlock,
    /requiredHoldMs:\s*stats\.steadyHoldRequiredMs/,
  );
  assert.match(displayBlock, /保持完成/);
  assert.match(displayBlock, /保持状态/);
});

test("steady breath realtime accuracy uses the same sustained-hold scoring formula as the saved result", async () => {
  const [runtimeSurfaceSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const pageAccuracyBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "computeBrowserPoseAccuracy",
  );
  const resultAccuracyBlock = extractFunctionBlock(
    resultSource,
    "computeBrowserPoseAccuracy",
  );

  for (const source of [pageAccuracyBlock, resultAccuracyBlock]) {
    assert.match(
      source,
      /scoringProfile[^\n]*===\s*"steady_breath"|gameDefinition\.scoringProfile\s*===\s*"steady_breath"/,
    );
    assert.match(source, /steadyHoldScore/);
    assert.match(source, /steadyHoldDurationMsTotal/);
    assert.match(source, /steadyStableWindowCount/);
    assert.match(source, /steadyHoldRequiredMs/);
    assert.match(
      source,
      /stabilityScore\s*\*\s*0\.42\s*\+\s*hitRate\s*\*\s*0\.36\s*\+\s*steadyHoldScore\s*\*\s*0\.22/,
    );
  }
});

test("bilateral coordination records hand-specific sync evidence instead of generic action hits", async () => {
  const [runtimeSurfaceSource, rulesSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const targetKindBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetKind",
  );
  const interactionBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetInteraction",
  );
  const profileStatsBlock = extractFunctionBlock(
    resultSource,
    "buildBrowserPoseProfileStats",
  );
  const displayBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "resolveBrowserPoseGameplayStatsDisplay",
  );

  assert.match(
    targetKindBlock,
    /scoringProfile\s*===\s*"bilateral_coordination"/,
  );
  assert.match(targetKindBlock, /return\s+"bilateral_pair"/);
  assert.match(interactionBlock, /target\.kind\s*===\s*"bilateral_pair"/);
  assert.match(interactionBlock, /bilateralWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /bilateralCompletedWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /bilateralMissedWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /bilateralWrongSideCount\s*\+=\s*1/);
  assert.match(interactionBlock, /bilateralPairTimeDiffs\.push/);
  assert.match(
    profileStatsBlock,
    /coordinationWindowCount:\s*stats\.bilateralWindowCount/,
  );
  assert.match(
    profileStatsBlock,
    /wrongSideCount:\s*stats\.bilateralWrongSideCount/,
  );
  assert.match(profileStatsBlock, /averagePairTimeDiffMs/);
  assert.match(profileStatsBlock, /coordinationScore/);
  assert.match(displayBlock, /双手完成/);
  assert.match(displayBlock, /配合节奏/);
  assert.match(displayBlock, /bilateralWrongSideCount/);
  assert.match(displayBlock, /bilateralPairTimeDiffMsTotal/);
});

test("trajectory tracking records ordered path evidence instead of generic action hits", async () => {
  const [runtimeSurfaceSource, rulesSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const targetKindBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetKind",
  );
  const interactionBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetInteraction",
  );
  const profileStatsBlock = extractFunctionBlock(
    resultSource,
    "buildBrowserPoseProfileStats",
  );
  const displayBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "resolveBrowserPoseGameplayStatsDisplay",
  );
  const visibleTargetBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "renderBrowserPoseVisibleTargets",
  );
  const hitBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "isBrowserPoseTargetHit",
  );
  const runtimeUpdateBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "updateBrowserPoseStats",
  );

  assert.match(targetKindBlock, /scoringProfile\s*===\s*"trajectory_tracking"/);
  assert.match(targetKindBlock, /return\s+"trajectory_trace"/);
  assert.match(interactionBlock, /target\.kind\s*===\s*"trajectory_trace"/);
  assert.match(interactionBlock, /trajectoryCheckpointHitCount\s*\+=\s*1/);
  assert.match(interactionBlock, /trajectoryOffPathCount\s*\+=\s*1/);
  assert.match(
    interactionBlock,
    /trajectoryPathDeviationTotal\s*\+=\s*trajectoryDeviation/,
  );
  assert.match(interactionBlock, /trajectoryCompletedWindowCount\s*\+=\s*1/);
  assert.match(
    profileStatsBlock,
    /checkpointHitCount:\s*stats\.trajectoryCheckpointHitCount/,
  );
  assert.match(
    profileStatsBlock,
    /offPathCount:\s*stats\.trajectoryOffPathCount/,
  );
  assert.match(profileStatsBlock, /averagePathDeviation/);
  assert.match(profileStatsBlock, /trajectoryTrackingScore/);
  assert.match(displayBlock, /路线进度/);
  assert.match(displayBlock, /跟随状态/);
  assert.match(visibleTargetBlock, /trajectoryCheckpoints/);
  assert.match(hitBlock, /target\.kind\s*===\s*"trajectory_trace"/);
  assert.match(hitBlock, /isBrowserPoseTrajectoryCheckpointHit/);
  const trajectoryHitBranch = sliceBetween(
    hitBlock,
    'if (target.kind === "trajectory_trace")',
    '\n  if (target.side === "both")',
  );
  assert.doesNotMatch(
    trajectoryHitBranch,
    /target\.side\s*===\s*"both"/,
    "trajectory tracking must judge the active checkpoint, not fall back to the generic both-hands target",
  );
  assert.doesNotMatch(
    runtimeUpdateBlock,
    /trajectoryDeviation\s*===\s*undefined\)\s*\{\s*return;\s*\}/,
    "missing trajectory evidence must still let the active window expire as a missed tracking window",
  );
});

test("balance shift records centerline posture evidence instead of generic action hits", async () => {
  const [runtimeSurfaceSource, rulesSource, resultSource] = await Promise.all([
    readBrowserPoseSurfaceSource(),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
      "utf8",
    ),
  ]);
  const targetKindBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetKind",
  );
  const interactionBlock = extractFunctionBlock(
    rulesSource,
    "resolveBrowserPoseTargetInteraction",
  );
  const profileStatsBlock = extractFunctionBlock(
    resultSource,
    "buildBrowserPoseProfileStats",
  );
  const displayBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "resolveBrowserPoseGameplayStatsDisplay",
  );
  const hitBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "isBrowserPoseTargetHit",
  );
  const updateBlock = extractFunctionBlock(
    runtimeSurfaceSource,
    "updateBrowserPoseStats",
  );

  assert.match(targetKindBlock, /scoringProfile\s*===\s*"balance_shift"/);
  assert.match(targetKindBlock, /return\s+"balance_shift_zone"/);
  assert.match(interactionBlock, /target\.kind\s*===\s*"balance_shift_zone"/);
  assert.match(interactionBlock, /balanceShiftStableWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /balanceShiftMissedWindowCount\s*\+=\s*1/);
  assert.match(interactionBlock, /balanceDirectionErrorCount\s*\+=\s*1/);
  assert.match(
    interactionBlock,
    /balanceCenterOffsetTotal\s*\+=\s*balanceCenterOffset/,
  );
  assert.match(
    interactionBlock,
    /balanceHoldDurationMsTotal\s*\+=\s*balanceHoldDurationMs/,
  );
  const balanceBranch = sliceBetween(
    interactionBlock,
    'if (target.kind === "balance_shift_zone")',
    '\n\n  if (target.kind === "trajectory_trace")',
  );
  assert.doesNotMatch(
    balanceBranch,
    /actionHitCount\s*\+=\s*1/,
    "balance shift must not count a stable posture window as a generic hand hit",
  );
  assert.match(
    profileStatsBlock,
    /balanceWindowCount:\s*stats\.balanceShiftWindowCount/,
  );
  assert.match(profileStatsBlock, /averageCenterOffset/);
  assert.match(profileStatsBlock, /balanceShiftScore/);
  assert.match(displayBlock, /平衡进度/);
  assert.match(displayBlock, /移动状态/);
  assert.match(hitBlock, /target\.kind\s*===\s*"balance_shift_zone"/);
  assert.match(hitBlock, /isBrowserPoseBalanceShiftHit/);
  assert.match(updateBlock, /resolveBrowserPoseBalanceEvidence/);
  assert.doesNotMatch(
    updateBlock,
    /balanceEvidence\s*===\s*undefined\)\s*\{\s*return;\s*\}/,
    "missing balance evidence must still allow the active window to expire as a missed balance window",
  );
});

function extractObjectBlockContaining(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `source is missing ${marker}`);
  const start = source.lastIndexOf("{", markerIndex);
  assert.notEqual(start, -1, `object start not found for ${marker}`);
  return extractBalancedBlock(source, start);
}

function readBrowserPoseSurfaceSource() {
  return readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
    ),
    "utf8",
  );
}

function extractFunctionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} not found`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1
    ? source.slice(start)
    : source.slice(start, nextFunction);
}

function extractBalancedBlock(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`balanced block starting at ${start} was not closed`);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
