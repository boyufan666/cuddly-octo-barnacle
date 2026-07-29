import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyUnityRhythmReachSource(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const projectDir = resolve(rootDir, "unity/rhythm-reach-3d");
  const failures = [];

  await requireFile(projectDir, "README.md", failures);
  await requireFile(projectDir, "Packages/manifest.json", failures);
  await requireFile(projectDir, "ProjectSettings/ProjectVersion.txt", failures);
  await requireFile(
    projectDir,
    "Assets/Plugins/WebGL/RehabTrainingBridge.jslib",
    failures,
  );
  await requireFile(
    projectDir,
    "Assets/WebGLTemplates/RehabWebGL/index.html",
    failures,
  );
  await requireFile(projectDir, "BuildManifest.draft.json", failures);
  await requireFile(
    projectDir,
    "Assets/Rehab/Scenes/RhythmReachTraining.unity",
    failures,
  );
  await requireFile(
    projectDir,
    "Assets/Rehab/Editor/RhythmReachSceneBuilder.cs",
    failures,
  );
  await requireFile(
    projectDir,
    "Assets/Rehab/Editor/RhythmReachWebGlBuilder.cs",
    failures,
  );

  const requiredScripts = [
    "DifficultyController.cs",
    "GameSessionController.cs",
    "MetricsAccumulator.cs",
    "PoseInputBridge.cs",
    "RehabRuntimeConfig.cs",
    "RehabTrainingResultBridge.cs",
    "RhythmTargetRecord.cs",
    "RhythmTargetSpawner.cs",
    "RhythmTargetZone.cs",
    "TargetHitDetector.cs",
    "TrainingMetricRecord.cs",
    "TrainingResultBuilder.cs",
  ];

  for (const scriptName of requiredScripts) {
    await requireFile(
      projectDir,
      `Assets/Rehab/Scripts/${scriptName}`,
      failures,
    );
  }

  await requireContains(
    projectDir,
    "Assets/Plugins/WebGL/RehabTrainingBridge.jslib",
    [
      "Rehab_PostTrainingResult",
      "window.RehabUnityBridge.postTrainingResultJson",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/WebGLTemplates/RehabWebGL/index.html",
    [
      "/unity/rehab-unity-bridge.js",
      "RehabTrainingRuntimeConfig",
      "resultContractVersion",
      "bridgeProtocolVersion",
      "deviceCode",
      "runtimeConfigMethod",
      "startMethod",
      "reachHitMethod",
      "difficultyMethod",
      "createUnityInstance",
      "startConfiguredSession",
      ".catch",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/TrainingResultBuilder.cs",
    [
      "DynamicDifficultyEvidence",
      "dynamicDifficultyEvidence",
      "schemaVersion",
      "startingLevelSource",
      "approvedPlanItemId",
      "assessmentSourceId",
      "triggerReason",
      "runtimeFrameId",
      "runtimeWindowId",
      "safetyClampReason",
      "RequireDynamicDifficultyEvidence",
      "rawPayloadHash",
      "SHA256",
      "motionMetrics",
      "unity_webgl",
      "source_only_not_camera_pose",
      "collectionBatchId = config.collectionBatchId",
      "resultContractVersion = config.resultContractVersion",
      "!float.IsFinite(metricValue)",
      "!float.IsFinite(confidence)",
      "RequireUtcIsoTimestamp(windowStartedAt",
      "RequireUtcIsoTimestamp(windowEndedAt",
      "windowStartedAt must not be later than windowEndedAt",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/MetricsAccumulator.cs",
    ["No valid training samples", "reaction_time_ms", "target_hit_rate"],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/RehabRuntimeConfig.cs",
    [
      "bridgeProtocolVersion",
      "ExpectedBridgeProtocolVersion",
      "ExpectedResultContractVersion",
      "rehab-unity-result-v2",
      "resultContractVersion",
      "deviceCode",
      "collectionBatchId",
      "durationSeconds",
      "RequirePositive(durationSeconds",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/GameSessionController.cs",
    [
      "TrainingSessionEvidenceContext",
      "approvedPlanItemId",
      "assessmentSourceId",
      "startingDifficultyLevel",
      "startingLevelSource",
      "ResolveStartingDifficultyNameFromEvidenceContext",
      "ResolveDifficultyNameFromStartingLevel",
      "StartSession(ResolveStartingDifficultyNameFromEvidenceContext())",
      "requested difficulty must match clinician-approved startingDifficultyLevel",
      "triggerReason = \"prior_assessment\"",
      "RuntimeDifficultyWindow",
      "EvaluateRuntimeDifficultyWindow",
      "TryBuildRuntimeDifficultyWindow",
      "ApplyRuntimeDifficultyDecision",
      "ResolveRuntimeDifficultyTriggerReason",
      "return \"reaction_slow\"",
      "return \"accuracy_high\"",
      "return \"accuracy_low\"",
      "return \"fatigue_risk\"",
      "return \"clinician_limit\"",
      "runtimeDifficultyEvents.Add",
      "runtimeFrameId",
      "runtimeWindowId",
      "safetyClampReason = \"clinician_limit:no_runtime_change\"",
      "clinician_limit:min_complexity",
      "clinician_limit:max_complexity",
      "RuntimeDifficultyMinimumSamples",
      "ReactionSlowThresholdMs",
      "AccuracyHighThreshold",
      "AccuracyLowThreshold",
      "targetSpawner.UpdateSettings(",
      "dynamicDifficultyEvidence = BuildDynamicDifficultyEvidence",
      "SetRuntimeConfigJson",
      "runtimeConfigJson = string.Empty",
      "sessionDurationSeconds = 0f",
      "sessionDurationSeconds = config.durationSeconds",
      "SetExplicitDifficulty",
      "ValidateRenderDependencies()",
      "RhythmTargetSpawner.TryValidateRenderDependencies(out reason)",
      "runningStartedAtUtc",
      "runningEndedAtUtc",
      "DateTime.UtcNow",
      "clientGeneratedAt = windowEndedAt",
      "windowStartedAt = windowStartedAt",
      "windowEndedAt = windowEndedAt",
      "ToUtcIsoTimestamp",
      "low",
      "moderate",
      "high",
      "catch (Exception",
    ],
    failures,
  );
  await requireContains(
    rootDir,
    "apps/web/public/unity/rehab-unity-bridge.js",
    [
      "dynamicDifficultyEvidence",
      "validateDynamicDifficultyEvidence",
      "startingLevelSource",
      "approvedPlanItemId",
      "assessmentSourceId",
      "triggerReason",
      "runtimeFrameId",
      "runtimeWindowId",
      "safetyClampReason",
      "collectionBatchId",
      "metricsSummaryCollectionBatchId !== collectionBatchId",
      "collectionBatchId fields must match",
      "rehab-unity-result-v2",
      "resultContractVersion",
      "validateRequiredMetricTypes",
      "windowStartedAt",
      "windowEndedAt",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/PoseInputBridge.cs",
    [
      "ReceiveWebGlReachHit",
      "TryConsumeReachHit",
      "webgl_pose_event",
      "development-only",
      "ReachHitConfidence",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/TargetHitDetector.cs",
    [
      "Vector3.Distance",
      "accuracy <= 0f",
      "ReachHitConfidence",
      "return 0f",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    [
      "new GameObject(\"Rhythm Target Visual\")",
      "AddComponent<MeshFilter>",
      "AddComponent<MeshRenderer>",
      "BuildUvSphereMesh",
      "TryValidateRenderDependencies(out string reason)",
      "Shader.Find(\"Standard\")",
      "Session blocked: Unity Standard shader is required for rhythm target rendering.",
      "UpdateSettings(",
      "nextEligibleSpawnTimeSeconds",
      "HasUsableSettings(explicitSettings)",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "BuildManifest.draft.json",
    ["source_only_not_built", "rhythm_reach_3d", "1.0.0"],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Scenes/RhythmReachTraining.unity",
    [
      "RhythmReachSession",
      "Clinical Training Lane",
      "Target Spawn Root",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "ProjectSettings/EditorBuildSettings.asset",
    ["Assets/Rehab/Scenes/RhythmReachTraining.unity"],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Editor/RhythmReachSceneBuilder.cs",
    [
      "BuildDefaultScene",
      "RhythmReachSession",
      "EditorBuildSettings.scenes",
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "Assets/Rehab/Editor/RhythmReachWebGlBuilder.cs",
    [
      "BuildFormalWebGl",
      "BuildPipeline.BuildPlayer",
      "BuildTarget.WebGL",
      "PlayerSettings.WebGL.template",
      "PROJECT:RehabWebGL",
      "manifest.json",
      "SHA256",
      "BuildVersionedUrl",
      "?hash=",
      "artifact.sha256.Substring(\"sha256:\".Length)",
      "rhythm_reach_3d",
      "0.1.2",
      "bridgeProtocolVersion",
      "unitySessionObjectName",
      "runtimeConfigMethod",
      "SetRuntimeConfigJson",
      "startMethod",
      "StartConfiguredSession",
      "reachHitMethod",
      "ReceiveWebGlReachHit",
      "difficultyMethod",
      "SetExplicitDifficulty",
      "duration_seconds",
    ],
    failures,
  );
  await requireContains(
    rootDir,
    "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    [
      "unitySessionObjectName",
      "SendMessage(",
      "runtimeConfigMethod",
      "startMethod",
      "reachHitMethod",
      "difficultyMethod",
      "createPoseTrainingRuntime",
      "poseRuntimeRef",
      "isExpectedUnityTrainingMessageSource",
      "window.location.origin",
      "toUnityRuntimeDurationSeconds(durationMinutes)",
      "collectionBatchId",
      "durationSeconds",
      "unityTrainingResultContractVersion",
      "resultContractVersion",
      "createUnityPoseHitTracker",
      "UnityPoseGuidanceOverlay",
    ],
    failures,
  );
  await requireContains(
    rootDir,
    "apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx",
    ["durationMinutes={planItem.durationMinutes}"],
    failures,
  );
  await requireContains(
    rootDir,
    "apps/web/src/lib/unity-training-bridge.ts",
    [
      "rehab-unity-result-v2",
      "unityTrainingResultContractVersion",
      "metricsSummary.resultContractVersion",
    ],
    failures,
  );
  await requireContainsInOrder(
    rootDir,
    "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    [
      "const {",
      "reachHit,",
      "} = hitTracker.update(landmarks, timestampMs);",
      "if (reachHit) {",
      "unityInstance.SendMessage(",
      "runtime.reachHitMethod",
      "JSON.stringify(reachHit)",
    ],
    failures,
  );
  await requireContains(
    rootDir,
    "apps/web/src/lib/unity-pose-guidance.ts",
    [
      "defaultReachYMin = -1.1",
      "defaultReachYMax = 1.1",
      "reachYMax - wrist.screenY",
      "stableFrameCount",
      "minIntervalMs",
      "minVisibility",
    ],
    failures,
  );
  await requireContains(
    rootDir,
    "apps/web/src/lib/unity-pose-guidance.test.ts",
    [
      "rejects low confidence",
      "lowConfidence.reachHit, undefined",
      'lowConfidence.guidance.status, "low_visibility"',
    ],
    failures,
  );
  await requireContains(
    projectDir,
    "ProjectSettings/ProjectSettings.asset",
    ["webGLTemplate: PROJECT:RehabWebGL"],
    failures,
  );
  await requireNotContains(
    projectDir,
    "Assets/Rehab/Scripts/GameSessionController.cs",
    ["light", "vigorous"],
    failures,
  );
  await requireNotContains(
    projectDir,
    "Assets/Rehab/Scripts/RehabRuntimeConfig.cs",
    [
      "public string gameCode =",
      "public string gameVersion =",
      "public string protocolVersion =",
      "public string bridgeProtocolVersion =",
    ],
    failures,
  );
  await requireNotContains(
    projectDir,
    "Assets/Rehab/Scripts/TrainingResultBuilder.cs",
    ["Clamp(", "Clamp01(", "Mathf.Max(0.001f"],
    failures,
  );
  await requireNotContains(
    projectDir,
    "Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    [
      "GameObject.CreatePrimitive",
      "PrimitiveType.Sphere",
      "SphereCollider",
      "Sprites/Default",
      "Unlit/Color",
      "fallback",
      "Fallback",
    ],
    failures,
  );
  await requireMethodNotContains(
    projectDir,
    "Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    "private static GameObject CreateVisualTarget(",
    ["Shader.Find("],
    failures,
  );
  await requireNotContains(
    projectDir,
    "Assets/Rehab/Scripts/GameSessionController.cs",
    ["targetSpawner.Begin(activeDifficultySettings, Time.time)"],
    failures,
  );
  await requireMethodNotContains(
    projectDir,
    "Assets/Rehab/Scripts/RhythmTargetSpawner.cs",
    "public void UpdateSettings(",
    [
      "ClearActiveTarget(",
      "spawnedCount =",
      "nextSpawnTime = Mathf.Max(0f, nextEligibleSpawnTimeSeconds)",
    ],
    failures,
  );
  await requireNotContains(
    projectDir,
    "Assets/Rehab/Editor/RhythmReachWebGlBuilder.cs",
    ["training_duration_seconds"],
    failures,
  );
  await requireNotContains(
    rootDir,
    "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ['streamingAssetsUrl ?? ""', '"SetExplicitDifficulty"'],
    failures,
  );

  return { failures };
}

async function requireFile(projectDir, relativePath, failures) {
  try {
    const info = await stat(resolve(projectDir, relativePath));
    if (!info.isFile()) {
      failures.push(`${relativePath} 不是文件`);
    }
  } catch {
    failures.push(`缺少文件: ${relativePath}`);
  }
}

async function requireContains(projectDir, relativePath, fragments, failures) {
  let source = "";
  try {
    source = await readFile(resolve(projectDir, relativePath), "utf8");
  } catch {
    failures.push(`无法读取文件: ${relativePath}`);
    return;
  }

  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      failures.push(`${relativePath} 缺少内容: ${fragment}`);
    }
  }
}

async function requireContainsInOrder(projectDir, relativePath, fragments, failures) {
  let source = "";
  try {
    source = await readFile(resolve(projectDir, relativePath), "utf8");
  } catch {
    failures.push(`无法读取文件: ${relativePath}`);
    return;
  }

  let fromIndex = 0;
  for (const fragment of fragments) {
    const foundIndex = source.indexOf(fragment, fromIndex);
    if (foundIndex === -1) {
      failures.push(`${relativePath} 缺少顺序内容: ${fragment}`);
      return;
    }
    fromIndex = foundIndex + fragment.length;
  }
}

async function requireNotContains(projectDir, relativePath, fragments, failures) {
  let source = "";
  try {
    source = await readFile(resolve(projectDir, relativePath), "utf8");
  } catch {
    failures.push(`无法读取文件: ${relativePath}`);
    return;
  }

  for (const fragment of fragments) {
    if (source.includes(fragment)) {
      failures.push(`${relativePath} 不应包含内容: ${fragment}`);
    }
  }
}

async function requireMethodNotContains(
  projectDir,
  relativePath,
  methodSignature,
  fragments,
  failures,
) {
  let source = "";
  try {
    source = await readFile(resolve(projectDir, relativePath), "utf8");
  } catch {
    failures.push(`无法读取文件: ${relativePath}`);
    return;
  }

  const methodStart = source.indexOf(methodSignature);
  if (methodStart === -1) {
    failures.push(`${relativePath} 缺少方法: ${methodSignature}`);
    return;
  }

  const methodBody = source.slice(methodStart, findMethodEnd(source, methodStart));
  for (const fragment of fragments) {
    if (methodBody.includes(fragment)) {
      failures.push(`${relativePath} 方法 ${methodSignature} 不应包含内容: ${fragment}`);
    }
  }
}

function findMethodEnd(source, methodStart) {
  const openBrace = source.indexOf("{", methodStart);
  if (openBrace === -1) {
    return source.length;
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return source.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyUnityRhythmReachSource();
  if (result.failures.length > 0) {
    console.error("Unity Rhythm Reach source verification failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Unity Rhythm Reach source verification passed.");
  }
}
