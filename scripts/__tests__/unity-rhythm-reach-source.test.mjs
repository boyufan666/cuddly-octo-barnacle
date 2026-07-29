import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyUnityRhythmReachSource } from "../verify-unity-rhythm-reach-source.mjs";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("Unity Rhythm Reach source project contains the formal bridge and metric files", async () => {
  const result = await verifyUnityRhythmReachSource({
    rootDir,
  });

  assert.deepEqual(result.failures, []);
});

test("Unity Rhythm Reach source project contains a formal WebGL build entrypoint and runtime injection", async () => {
  const unityBuildScriptPath = join(
    rootDir,
    "unity/rhythm-reach-3d/Assets/Rehab/Editor/RhythmReachWebGlBuilder.cs",
  );
  assert.equal((await stat(unityBuildScriptPath)).isFile(), true);

  const unityBuildScript = await readFile(unityBuildScriptPath, "utf8");
  assert.match(unityBuildScript, /BuildPipeline\.BuildPlayer/);
  assert.match(unityBuildScript, /BuildTarget\.WebGL/);
  assert.match(unityBuildScript, /PlayerSettings\.WebGL\.template/);
  assert.match(unityBuildScript, /manifest\.json/);
  assert.match(unityBuildScript, /SHA256/);

  const webRuntimeSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  assert.match(webRuntimeSource, /unitySessionObjectName/);
  assert.match(webRuntimeSource, /SendMessage\(/);
  assert.match(webRuntimeSource, /runtimeConfigMethod/);
  assert.match(webRuntimeSource, /startMethod/);
  assert.match(webRuntimeSource, /reachHitMethod/);
});

test("Unity runtime contract carries the backend batch and approved plan duration end to end", async () => {
  const runtimeConfigSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/RehabRuntimeConfig.cs",
    ),
    "utf8",
  );
  const resultBuilderSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/TrainingResultBuilder.cs",
    ),
    "utf8",
  );
  const sessionControllerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs",
    ),
    "utf8",
  );
  const webRuntimeSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  const runtimeContextSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/runtime-context.ts",
    ),
    "utf8",
  );
  const patientStageSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx",
    ),
    "utf8",
  );
  const parserSource = await readFile(
    join(rootDir, "apps/web/src/lib/unity-training-bridge.ts"),
    "utf8",
  );
  const roleWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const apiTypesSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );
  const publicBridgeSource = await readFile(
    join(rootDir, "apps/web/public/unity/rehab-unity-bridge.js"),
    "utf8",
  );
  const protocolSource = await readFile(
    join(rootDir, "docs/unity/unity-webgl-bridge-protocol.md"),
    "utf8",
  );
  const sceneSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scenes/RhythmReachTraining.unity",
    ),
    "utf8",
  );
  const webGlTemplateSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/WebGLTemplates/RehabWebGL/index.html",
    ),
    "utf8",
  );

  assert.match(runtimeConfigSource, /public string collectionBatchId;/);
  assert.match(runtimeConfigSource, /public string clientStartedAt;/);
  assert.match(runtimeConfigSource, /public float durationSeconds;/);
  assert.match(runtimeConfigSource, /public float minConfidence;/);
  assert.match(
    runtimeConfigSource,
    /ExpectedResultContractVersion = "rehab-unity-result-v2"/,
  );
  assert.match(runtimeConfigSource, /public string resultContractVersion;/);
  assert.match(
    runtimeConfigSource,
    /Require\(collectionBatchId, nameof\(collectionBatchId\)\)/,
  );
  assert.match(
    runtimeConfigSource,
    /RequireCanonicalUtcIsoTimestamp\(clientStartedAt, nameof\(clientStartedAt\)\)/,
  );
  assert.match(runtimeConfigSource, /DateTime\.TryParseExact\(/);
  assert.match(
    runtimeConfigSource,
    /"yyyy-MM-dd'T'HH:mm:ss\.fff'Z'"/,
  );
  assert.match(
    webGlTemplateSource,
    /var requiredConfigFields = \[[\s\S]*?"clientStartedAt",[\s\S]*?\]/,
  );
  assert.match(
    runtimeConfigSource,
    /RequirePositive\(durationSeconds, nameof\(durationSeconds\)\)/,
  );
  assert.match(
    runtimeConfigSource,
    /RequireProbability\(minConfidence, nameof\(minConfidence\)\)/,
  );

  assert.match(
    resultBuilderSource,
    /collectionBatchId = config\.collectionBatchId/,
  );
  assert.match(
    resultBuilderSource,
    /resultContractVersion = config\.resultContractVersion/,
  );
  assert.match(publicBridgeSource, /rehab-unity-result-v2/);
  assert.match(parserSource, /rehab-unity-result-v2/);
  assert.match(
    sessionControllerSource,
    /sessionDurationSeconds = config\.durationSeconds/,
  );
  assert.doesNotMatch(
    sessionControllerSource,
    /sessionDurationSeconds\s*=\s*45f/,
  );
  assert.match(
    sessionControllerSource,
    /runtimeConfigJson = string\.Empty;\s*sessionDurationSeconds = 0f;\s*if \(string\.IsNullOrWhiteSpace\(json\)\)/,
  );
  assert.doesNotMatch(sceneSource, /sessionDurationSeconds:\s*45/);

  assert.match(
    patientStageSource,
    /durationMinutes=\{planItem\.durationMinutes\}/,
  );
  assert.match(webRuntimeSource, /durationMinutes: number/);
  assert.match(
    webRuntimeSource,
    /toUnityRuntimeDurationSeconds\(durationMinutes\)/,
  );
  assert.match(
    webRuntimeSource,
    /resolveExpectedUnityBridgeContext\(\s*trainingSession\.id,\s*trainingSession\.gameRunId,\s*game\.gameVersion,\s*trainingSession\.collectionBatchId/,
  );
  assert.match(
    webRuntimeSource,
    /window\.RehabTrainingRuntimeConfig = \{[\s\S]*?collectionBatchId,/,
  );
  assert.match(
    webRuntimeSource,
    /resultContractVersion:\s*unityTrainingResultContractVersion/,
  );
  assert.match(runtimeContextSource, /readUnityRuntimeMinConfidence/);
  assert.match(
    webRuntimeSource,
    /const minConfidence = readUnityRuntimeMinConfidence\(\s*trainingSession\.runtimeConfigSnapshot,/,
  );
  assert.match(
    webRuntimeSource,
    /window\.RehabTrainingRuntimeConfig = \{[\s\S]*?minConfidence,/,
  );
  assert.match(
    webRuntimeSource,
    /createUnityPoseHitTracker\(\{\s*minVisibility: minConfidence,/,
  );
  assert.doesNotMatch(webRuntimeSource, /minVisibility:\s*0\.45/);
  assert.match(
    webRuntimeSource,
    /isExpectedUnityTrainingMessageSource\([\s\S]*?event,[\s\S]*?window\.location\.origin,[\s\S]*?window/,
  );

  assert.doesNotMatch(
    parserSource,
    /value\.collectionBatchId\s*\?\?\s*metricsSummary\?\.collectionBatchId/,
  );

  const startHandlerSource = roleWorkspaceSource.match(
    /async function handleStartTraining[\s\S]*?async function handleCreateGameContent/,
  )?.[0];
  assert.ok(startHandlerSource, "role workspace start handler is required");
  assert.match(
    startHandlerSource,
    /const responseCollectionBatchId = trainingSession\.collectionBatchId/,
  );
  assert.match(startHandlerSource, /if \(!responseCollectionBatchId\)/);
  assert.match(
    startHandlerSource,
    /responseCollectionBatchId !== preparedCollectionBatch\.id/,
  );
  assert.doesNotMatch(
    startHandlerSource,
    /collectionBatchId:\s*preparedCollectionBatch\.id/,
  );
  assert.match(startHandlerSource, /\.\.\.trainingSession/);
  const trainingSessionTypeSource = apiTypesSource.match(
    /export type TrainingSession = \{[\s\S]*?\n\};/,
  )?.[0];
  assert.ok(trainingSessionTypeSource, "TrainingSession type is required");
  assert.match(trainingSessionTypeSource, /collectionBatchId: string \| null;/);
  assert.doesNotMatch(trainingSessionTypeSource, /collectionBatchId\?:/);

  for (const requiredProtocolSnippet of [
    "rehab-unity-result-v2",
    "collectionBatchId: config.collectionBatchId",
    '"dynamicDifficultyEvidence"',
    '"windowStartedAt"',
    '"windowEndedAt"',
    '"reaction_time_ms"',
    '"target_hit_rate"',
    '"arm_raise_accuracy"',
    '"duration_seconds"',
    '"difficulty_level"',
  ]) {
    assert.match(protocolSource, new RegExp(requiredProtocolSnippet));
  }

  const contextResolverSource = sliceBetween(
    webRuntimeSource,
    "function resolveExpectedUnityBridgeContext",
    "function UnityPoseCameraPreview",
  );
  for (const requiredContextField of [
    "sessionId",
    "gameRunId",
    "gameVersion",
    "collectionBatchId",
  ]) {
    assert.match(
      contextResolverSource,
      new RegExp(
        `${requiredContextField}: readRequiredText\\(\\s*${requiredContextField}`,
      ),
    );
  }
  assert.match(contextResolverSource, /catch \{\s*return null;\s*\}/);

  const messageListenerSource = sliceBetween(
    webRuntimeSource,
    "useEffect(() => {\n    if (!expectedBridgeContext) return;",
    "useEffect(() => {\n    let cancelled = false;",
  );
  assert.ok(
    messageListenerSource.indexOf("if (!expectedBridgeContext) return;") <
      messageListenerSource.indexOf('window.addEventListener("message"'),
    "invalid Unity result context must not register the message listener",
  );

  const loadUnitySource = sliceBetween(
    webRuntimeSource,
    "async function loadUnity()",
    "void loadUnity();",
  );
  const invalidContextSource = sliceBetween(
    loadUnitySource,
    "if (!expectedBridgeContext)",
    "if (!isGameReadyForTraining(game))",
  );
  assert.match(invalidContextSource, /state: "error"/);
  assert.match(invalidContextSource, /setRuntimeState\("error"\)/);
  assert.match(invalidContextSource, /return;/);
});

test("Unity source README documents the complete formal runtime config", async () => {
  const readmeSource = await readFile(
    join(rootDir, "unity/rhythm-reach-3d/README.md"),
    "utf8",
  );

  for (const requiredField of [
    '"resultContractVersion": "rehab-unity-result-v2"',
    '"collectionBatchId": "real-collection-batch-id"',
    '"runtimeConfigMethod": "SetRuntimeConfigJson"',
    '"startMethod": "StartConfiguredSession"',
    '"reachHitMethod": "ReceiveWebGlReachHit"',
    '"difficultyMethod": "SetExplicitDifficulty"',
    '"approvedPlanItemId": "real-approved-plan-item-id"',
    '"assessmentSourceId": "real-approved-assessment-id"',
    '"startingLevelSource": "clinician_approved_plan"',
    '"startingDifficultyLevel": 2',
    '"durationSeconds": 900',
    '"minConfidence": 0.8',
  ]) {
    assert.match(readmeSource, new RegExp(escapeRegExp(requiredField)));
  }
  assert.match(
    readmeSource,
    /`explicitDifficulty` is derived from\s+`startingDifficultyLevel`; it is not an independent setting\./,
  );
  assert.match(
    readmeSource,
    /`1 -> easy`, `2 -> standard`, and `3 -> advanced`/,
  );
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Unity Rhythm Reach target rendering does not depend on runtime primitive colliders", async () => {
  const targetSpawnerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    ),
    "utf8",
  );

  assert.doesNotMatch(targetSpawnerSource, /GameObject\.CreatePrimitive/);
  assert.doesNotMatch(targetSpawnerSource, /PrimitiveType\.Sphere/);
  assert.doesNotMatch(targetSpawnerSource, /SphereCollider/);
});

test("Unity Rhythm Reach blocks missing render dependencies before countdown", async () => {
  const targetSpawnerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    ),
    "utf8",
  );
  const sessionControllerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs",
    ),
    "utf8",
  );

  assert.match(
    targetSpawnerSource,
    /public static bool TryValidateRenderDependencies\(out string reason\)/,
  );
  assert.match(targetSpawnerSource, /Shader\.Find\("Standard"\)/);
  assert.match(
    targetSpawnerSource,
    /reason = "Session blocked: Unity Standard shader is required for rhythm target rendering\."/,
  );

  const createVisualTargetMatch = targetSpawnerSource.match(
    /private static GameObject CreateVisualTarget\([\s\S]*?\n        private static Mesh GetTargetMesh\(/,
  );
  assert.ok(
    createVisualTargetMatch,
    "RhythmTargetSpawner.CreateVisualTarget is required",
  );
  assert.doesNotMatch(
    createVisualTargetMatch[0],
    /Shader\.Find/,
    "render dependency lookup must run before target spawning",
  );

  assert.match(sessionControllerSource, /ValidateRenderDependencies\(\)/);
  assert.match(
    sessionControllerSource,
    /RhythmTargetSpawner\.TryValidateRenderDependencies\(out reason\)/,
  );
  assert.match(
    sessionControllerSource,
    /if \(!ValidateRenderDependencies\(\)\)\s*\{\s*return false;\s*\}/,
  );
  assert.doesNotMatch(
    targetSpawnerSource,
    /Sprites\/Default|Unlit\/Color|fallback/i,
  );
});

test("Unity Rhythm Reach result metrics bind the server session start to the real Unity completion time", async () => {
  const runtimeConfigSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/RehabRuntimeConfig.cs",
    ),
    "utf8",
  );
  const sessionControllerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs",
    ),
    "utf8",
  );
  const resultBuilderSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/TrainingResultBuilder.cs",
    ),
    "utf8",
  );
  const resultInputBuilderSource = sliceBetween(
    sessionControllerSource,
    "private TrainingResultInput BuildTrainingResultInput",
    "private float ResolveMotionMetricConfidence",
  );

  assert.match(sessionControllerSource, /runningStartedAtUtc/);
  assert.match(sessionControllerSource, /DateTime\.UtcNow/);
  assert.match(runtimeConfigSource, /public string clientStartedAt;/);
  assert.match(
    runtimeConfigSource,
    /RequireCanonicalUtcIsoTimestamp\(clientStartedAt, nameof\(clientStartedAt\)\)/,
  );
  assert.match(
    resultInputBuilderSource,
    /string windowStartedAt = config\.clientStartedAt/,
  );
  assert.doesNotMatch(
    resultInputBuilderSource,
    /string windowStartedAt = ToUtcIsoTimestamp\(runningStartedAtUtc\)/,
  );
  assert.match(
    resultInputBuilderSource,
    /string windowEndedAt = ToUtcIsoTimestamp\(runningEndedAtUtc\)/,
  );
  assert.match(resultInputBuilderSource, /clientGeneratedAt = windowEndedAt/);
  assert.match(resultInputBuilderSource, /windowStartedAt = windowStartedAt/);
  assert.match(resultInputBuilderSource, /windowEndedAt = windowEndedAt/);
  assert.match(sessionControllerSource, /ToUtcIsoTimestamp/);

  assert.match(resultBuilderSource, /RequireUtcIsoTimestamp\(windowStartedAt/);
  assert.match(resultBuilderSource, /RequireUtcIsoTimestamp\(windowEndedAt/);
  assert.match(
    resultBuilderSource,
    /windowStartedAt must not be later than windowEndedAt/,
  );
  assert.match(resultBuilderSource, /!float\.IsFinite\(metricValue\)/);
  assert.match(resultBuilderSource, /!float\.IsFinite\(confidence\)/);
  assert.match(resultBuilderSource, /confidence < 0f \|\| confidence > 1f/);
  assert.match(resultBuilderSource, /public string qualityFlag;/);
  assert.match(
    resultBuilderSource,
    /qualityFlag != "valid" && qualityFlag != "suspicious"/,
  );
  assert.doesNotMatch(sessionControllerSource, /confidence\s*=\s*1f/);
  assert.match(
    sessionControllerSource,
    /float confidence = ResolveMotionMetricConfidence\(record\)/,
  );
  assert.match(sessionControllerSource, /target\.HitAccuracy/);
  assert.match(
    sessionControllerSource,
    /float averageObservedConfidence = observedConfidenceTotal \/ observedSampleCount/,
  );
  assert.match(
    sessionControllerSource,
    /float observedSampleCoverage = \(float\)observedSampleCount \/ record\.SampleCount/,
  );
  assert.match(
    sessionControllerSource,
    /float confidence = averageObservedConfidence \* observedSampleCoverage/,
  );
  assert.match(
    sessionControllerSource,
    /qualityFlag = ResolveMotionMetricQualityFlag\(\s*confidence,\s*record\.SampleCount,\s*config\.minConfidence\)/,
  );
  assert.match(
    sessionControllerSource,
    /confidence >= minConfidence\s*&& sampleCount >= MinimumMotionMetricSamples\s*\? "valid"\s*: "suspicious"/,
  );
  assert.doesNotMatch(sessionControllerSource, /MinimumMotionMetricConfidence/);
});

test("Unity Rhythm Reach serializes Prisma integer result fields from measured values", async () => {
  const sessionControllerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs",
    ),
    "utf8",
  );
  const resultBuilderSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/TrainingResultBuilder.cs",
    ),
    "utf8",
  );

  assert.match(
    sessionControllerSource,
    /score = Mathf\.RoundToInt\(ResolveScore\(hitRate, accuracy\)\)/,
  );
  assert.match(
    sessionControllerSource,
    /durationSeconds = Mathf\.RoundToInt\(durationSeconds\)/,
  );
  assert.match(
    sessionControllerSource,
    /reactionTimeMs = Mathf\.RoundToInt\(reactionTimeMs\)/,
  );
  assert.equal(resultBuilderSource.match(/public int score;/g)?.length, 3);
  assert.equal(resultBuilderSource.match(/public int durationSeconds;/g)?.length, 3);
  assert.equal(resultBuilderSource.match(/public int reactionTimeMs;/g)?.length, 3);
  assert.doesNotMatch(resultBuilderSource, /public float score;/);
  assert.doesNotMatch(resultBuilderSource, /public float durationSeconds;/);
  assert.doesNotMatch(resultBuilderSource, /public float reactionTimeMs;/);
});

test("Unity dynamic difficulty runtime identities are bound to the configured game run", async () => {
  const sessionControllerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs",
    ),
    "utf8",
  );
  const runtimeConfigSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/RehabRuntimeConfig.cs",
    ),
    "utf8",
  );

  assert.match(
    runtimeConfigSource,
    /Require\(gameRunId, nameof\(gameRunId\)\)/,
  );
  assert.match(
    sessionControllerSource,
    /private string ResolveRuntimeFrameId\(\)\s*\{\s*RehabRuntimeConfig config = RehabRuntimeConfig\.FromJson\(runtimeConfigJson\);\s*return config\.gameRunId \+ ":frame:" \+ Time\.frameCount;\s*\}/,
  );
  assert.equal(
    sessionControllerSource.match(/runtimeFrameId = ResolveRuntimeFrameId\(\)/g)
      ?.length,
    2,
  );
  assert.match(
    sessionControllerSource,
    /return config\.gameRunId \+ ":window:" \+ windowStartedAt \+ "-" \+ windowEndedAt;/,
  );
  assert.match(
    sessionControllerSource,
    /return config\.gameRunId\s*\+ ":runtime-window:"\s*\+ window\.windowIndex/,
  );
  assert.doesNotMatch(sessionControllerSource, /unity-(?:frame|window)-/);
});

test("Unity Rhythm Reach dynamic difficulty is driven by clinician snapshot and verified runtime windows", async () => {
  const sessionControllerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs",
    ),
    "utf8",
  );

  assert.match(sessionControllerSource, /startingDifficultyLevel/);
  assert.match(
    sessionControllerSource,
    /ResolveStartingDifficultyNameFromEvidenceContext/,
  );
  assert.match(
    sessionControllerSource,
    /ResolveDifficultyNameFromStartingLevel/,
  );
  assert.match(
    sessionControllerSource,
    /StartSession\(ResolveStartingDifficultyNameFromEvidenceContext\(\)\)/,
  );
  assert.match(
    sessionControllerSource,
    /requested difficulty must match clinician-approved startingDifficultyLevel/,
  );
  assert.match(sessionControllerSource, /RuntimeDifficultyWindow/);
  assert.match(sessionControllerSource, /EvaluateRuntimeDifficultyWindow/);
  assert.match(sessionControllerSource, /TryBuildRuntimeDifficultyWindow/);
  assert.match(sessionControllerSource, /ApplyRuntimeDifficultyDecision/);
  assert.match(sessionControllerSource, /runtimeDifficultyEvents\.Add/);
  assert.match(
    sessionControllerSource,
    /ResolveRuntimeDifficultyTriggerReason/,
  );
  assert.match(sessionControllerSource, /return "reaction_slow"/);
  assert.match(sessionControllerSource, /return "accuracy_high"/);
  assert.match(sessionControllerSource, /return "accuracy_low"/);
  assert.match(sessionControllerSource, /return "fatigue_risk"/);
  assert.match(sessionControllerSource, /return "clinician_limit"/);
  assert.match(sessionControllerSource, /"clinician_limit:no_runtime_change"/);
  assert.match(sessionControllerSource, /"clinician_limit:min_complexity"/);
  assert.match(sessionControllerSource, /"clinician_limit:max_complexity"/);
  assert.match(sessionControllerSource, /RuntimeDifficultyMinimumSamples/);
  assert.match(sessionControllerSource, /ReactionSlowThresholdMs/);
  assert.match(sessionControllerSource, /AccuracyHighThreshold/);
  assert.match(sessionControllerSource, /AccuracyLowThreshold/);
  assert.doesNotMatch(
    sessionControllerSource,
    /private void EnterRunning\(\)\s*\{\s*\{/,
  );
  assert.match(sessionControllerSource, /targetSpawner\.UpdateSettings\(/);
  assert.doesNotMatch(
    sessionControllerSource,
    /targetSpawner\.Begin\(activeDifficultySettings, Time\.time\)/,
  );

  const targetSpawnerSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    ),
    "utf8",
  );
  const updateSettingsMatch = targetSpawnerSource.match(
    /public void UpdateSettings\([\s\S]*?\n        public void Stop\(/,
  );
  assert.ok(
    updateSettingsMatch,
    "RhythmTargetSpawner.UpdateSettings is required",
  );
  assert.match(updateSettingsMatch[0], /nextEligibleSpawnTimeSeconds/);
  assert.match(updateSettingsMatch[0], /HasUsableSettings\(explicitSettings\)/);
  assert.doesNotMatch(
    updateSettingsMatch[0],
    /ClearActiveTarget\(/,
    "runtime difficulty updates must preserve the current active target",
  );
  assert.doesNotMatch(
    updateSettingsMatch[0],
    /spawnedCount\s*=/,
    "runtime difficulty updates must preserve target id sequence",
  );
  assert.doesNotMatch(
    updateSettingsMatch[0],
    /nextSpawnTime\s*=\s*Mathf\.Max\(0f,\s*nextEligibleSpawnTimeSeconds\)/,
    "runtime difficulty updates must not restart the spawn cadence",
  );
  assert.match(
    targetSpawnerSource,
    /public void Begin\([\s\S]*?spawnedCount = 0;/,
  );

  const fixedPriorAssessmentOnly =
    /events = new\[\]\s*\{\s*new DynamicDifficultyEvidenceEvent\s*\{[\s\S]*?triggerReason = "prior_assessment"[\s\S]*?safetyClampReason = "clinician_limit:no_runtime_change"[\s\S]*?\}\s*\}/;
  assert.doesNotMatch(sessionControllerSource, fixedPriorAssessmentOnly);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
