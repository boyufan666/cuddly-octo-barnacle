import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("web UI exposes cognitive web as a formal non-pose runtime without technical patient copy", async () => {
  const source = await readRoleWorkspaceSource();
  const adminContentSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/TrainingContentGovernance.tsx"),
    "utf8",
  );
  assert.match(adminContentSource, /\["cognitive_web",\s*"认知训练"\]/);
  assert.match(
    adminContentSource,
    /if \(value === "cognitive_web"\) return "认知训练"/,
  );
  assert.doesNotMatch(
    source,
    /return value;\s*\}\s*\n\s*function registrationRoleLabel/,
  );
});

test("training start gate derives camera requirements from selected runtime", async () => {
  const source = await readRoleWorkspaceSource();
  const startBlock = extractFunctionBlock(source, "handleStartTraining");
  assert.match(
    startBlock,
    /trainingRuntimeRequiresCamera\(\s*planItemForTraining\.gameContent,?\s*\)/,
  );
  assert.match(
    startBlock,
    /if \(requiresCamera && !consentState\.camera_capture\)/,
  );
  assert.match(startBlock, /if\s*\(\s*requiresCamera\s*&&\s*\(/);
  assert.match(
    startBlock,
    /const selectedCamera = requiresCamera\s*\? requireBrowserPoseCameraSelection\(trainingReadiness\.cameraDeviceId\)\s*:\s*undefined/,
  );
  assert.match(
    startBlock,
    /const cameraSelectionTransfer = selectedCamera[\s\S]*?requestEpoch: session\.requestEpoch,[\s\S]*?patientId: data\.patient\.id,[\s\S]*?selection: selectedCamera/,
  );
  assert.match(
    startBlock,
    /startTrainingSession\(\{[\s\S]*?cameraDeviceId: selectedCamera\?\.deviceId/,
  );
  assert.match(
    startBlock,
    /setActiveTrainingSession\(\{[\s\S]*?deviceCode: selectedCamera\?\.deviceId/,
  );
  assert.match(
    startBlock,
    /reloadRoleData\(\s*session,\s*data\.patient\.id,\s*cameraSelectionTransfer,?\s*\)/,
  );
  assert.match(startBlock, /calibrationStatus: "checked"/);
  assert.doesNotMatch(startBlock, /if \(!consentState\.camera_capture\)/);
});

test("browser pose runtime difficulty receives approved assessment context before training", async () => {
  const source = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
    ),
    "utf8",
  );
  const contextSource = await readFile(
    join(rootDir, "apps/web/src/features/training-runtime/runtime-context.ts"),
    "utf8",
  );
  const runtimeSetupBlock = extractFunctionBlock(
    source,
    "createInitialBrowserPoseStats",
  );
  assert.match(runtimeSetupBlock, /readTrainingRuntimeEvidenceContext\(/);
  assert.match(runtimeSetupBlock, /trainingSession\.runtimeConfigSnapshot/);
  assert.match(runtimeSetupBlock, /createBrowserPoseRuntimeDifficulty\(\{/);
  assert.match(
    runtimeSetupBlock,
    /assessmentSourceId: evidenceContext\.assessmentSourceId/,
  );
  assert.match(
    runtimeSetupBlock,
    /startingLevel: evidenceContext\.startingDifficultyLevel/,
  );
  assert.match(
    runtimeSetupBlock,
    /approvedPlanItemId: evidenceContext\.approvedPlanItemId/,
  );
  assert.match(contextSource, /function readTrainingRuntimeEvidenceContext/);
  assert.match(contextSource, /startingLevelSource/);
});

test("unity runtime config uses clinician approved starting difficulty", async () => {
  const source = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  const containerBlock = extractFunctionBlock(source, "UnityTrainingSurface");
  assert.match(
    containerBlock,
    /readTrainingRuntimeEvidenceContext\(\s*trainingSession\.runtimeConfigSnapshot,?\s*\)/,
  );
  assert.match(
    containerBlock,
    /approvedPlanItemId: evidenceContext\.approvedPlanItemId/,
  );
  assert.match(
    containerBlock,
    /assessmentSourceId: evidenceContext\.assessmentSourceId/,
  );
  assert.match(
    containerBlock,
    /startingLevelSource: evidenceContext\.startingLevelSource/,
  );
  assert.match(
    containerBlock,
    /startingDifficultyLevel: evidenceContext\.startingDifficultyLevel/,
  );
  assert.match(
    containerBlock,
    /explicitDifficulty: toUnityExplicitDifficultyFromStartingLevel\(\s*evidenceContext\.startingDifficultyLevel,\s*\)/,
  );
  assert.doesNotMatch(
    containerBlock,
    /explicitDifficulty: toUnityExplicitDifficulty\(game\.defaultDifficulty\)/,
  );
});

test("admin create payload includes formal publish metadata for inline runtimes", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-payload-builders.ts"),
    "utf8",
  );
  const builderBlock = extractFunctionBlock(
    source,
    "buildGameContentCreatePayload",
  );

  assert.match(
    builderBlock,
    /form\.runtimeType === "browser_pose_canvas"\s*\|\|\s*form\.runtimeType === "cognitive_web"/,
  );
  assert.match(
    builderBlock,
    /difficultyPolicy: buildFormalGameDifficultyPolicy\(/,
  );
  assert.match(
    builderBlock,
    /dynamicDifficultyTriggers: formalDynamicDifficultyTriggers/,
  );
  assert.match(
    builderBlock,
    /requiredPermissions: buildFormalGameRequiredPermissions\(/,
  );
  assert.match(builderBlock, /resultSchema: buildFormalGameResultSchema\(/);
  assert.match(builderBlock, /publishedStatus: "published"/);
  assert.match(source, /export function buildFormalGameDifficultyPolicy/);
  assert.match(source, /export function buildFormalGameRequiredPermissions/);
  assert.match(source, /export function buildFormalGameResultSchema/);
  assert.match(
    source,
    /throw new Error\("训练资源状态无效，不能编辑训练资源配置。"\)/,
  );
  assert.match(
    source,
    /throw new Error\("训练资源发布通道无效，不能编辑训练资源配置。"\)/,
  );
  assert.doesNotMatch(source, /:\s*"pending_assets"/);
  assert.doesNotMatch(source, /:\s*"development"/);
});

test("admin Unity publish payload includes formal publish metadata without runtime fallback", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-payload-builders.ts"),
    "utf8",
  );
  const builderBlock = extractFunctionBlock(source, "buildUnityBuildPayload");

  assert.match(builderBlock, /form\.buildStatus === "released"/);
  assert.match(
    builderBlock,
    /difficultyPolicy: buildFormalGameDifficultyPolicy\("unity_webgl"\)/,
  );
  assert.match(
    builderBlock,
    /dynamicDifficultyTriggers: formalDynamicDifficultyTriggers/,
  );
  assert.match(
    builderBlock,
    /requiredPermissions: buildFormalGameRequiredPermissions\("unity_webgl"\)/,
  );
  assert.match(
    builderBlock,
    /resultSchema: buildFormalGameResultSchema\(\s*"unity_webgl",\s*requiredMetrics,?\s*\)/,
  );
  assert.match(builderBlock, /publishedStatus: "published"/);
  assert.match(
    source,
    /runtimeType === "unity_webgl"\) return \["camera_capture"\]/,
  );
  assert.doesNotMatch(builderBlock, /browser_pose_canvas|cognitive_web/);
});

test("runtime surfaces keep real adapters while patient-visible copy stays product-safe", async () => {
  const browserSurface = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
    ),
    "utf8",
  );
  const unitySurface = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  const unityBridgeSource = await readFile(
    join(rootDir, "apps/web/src/lib/unity-training-bridge.ts"),
    "utf8",
  );
  const runtimePage = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingRuntimePage.tsx"),
    "utf8",
  );
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  const browserPoseMarkupSource = sliceFrom(
    extractFunctionBlock(browserSurface, "BrowserPoseTrainingSurface"),
    "return (\n    <div",
  );
  const browserRuntimeStateCopy = visibleStringLiterals(
    extractFunctionBlock(browserSurface, "BrowserPoseTrainingSurface"),
  );
  const unityMarkupSource = sliceFrom(
    extractFunctionBlock(unitySurface, "UnityTrainingSurface"),
    "return (\n    <div",
  );
  const prepMarkupSource = sliceFrom(prepSource, "return (");
  const patientVisibleRuntimeTerms =
    /Unity loader|Unity runtime|manifest|bridge|runtime|采集明细|采样帧|有效帧率|姿态帧|关键点|平均置信度|置信度|检查点|同步差|协议版本|资源清单|回传|质控|训练监看|体感训练状态|配置|debug|adapter|local|dev/i;
  const browserVisibleCopy = visibleJsxTextAndLiteralProps(
    browserPoseMarkupSource,
  );
  const unityVisibleCopy = visibleJsxTextAndLiteralProps(unityMarkupSource);
  const browserGameplayProfileVisibleCopy =
    visibleRuntimeGameplayProfileStrings(
      await readFile(
        join(rootDir, "apps/web/src/lib/browser-pose-game-library.ts"),
        "utf8",
      ),
    );
  const browserTargetLabelSource = visibleStringLiterals(
    extractFunctionBlock(
      await readFile(
        join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
        "utf8",
      ),
      "buildBrowserPoseTargetGameplayLabel",
    ),
  );
  const browserVisibleStatsCopy = visibleStringLiterals(
    extractFunctionBlock(
      browserSurface,
      "resolveBrowserPoseGameplayStatsDisplay",
    ),
  );
  const browserQualityCopy = visibleStringLiterals(
    extractFunctionBlock(browserSurface, "resolveBrowserPoseQualityReasons"),
  );
  const patientVisibleGameplayTelemetryTerms =
    /系统重点记录|有效动作窗口|稳定保持窗口|双手协同窗口|轨迹追踪窗口|重心转移窗口|有效触达动作|稳定窗口|当前保持|协同窗口|偏移\/方向|平均反应|判断速度|偏离次数|触达\/漏触|检查点进度|触达准确度|同步差|毫秒|证据/;
  const rawVisibleRuntimeStyleTerms =
    /rounded-2xl|rounded-3xl|rounded-\[(?:2[0-9]|3[0-9])px\]|backdrop-blur|bg-\[#|text-\[#|border-\[#|bg-white\/|border-white\/|text-white\/|font-mono|radial-gradient|linear-gradient/i;

  assert.match(browserSurface, /export function BrowserPoseTrainingSurface/);
  assert.match(unitySurface, /export function UnityTrainingSurface/);
  assert.match(browserSurface, /const capturedRunToken = runTokenRef\.current/);
  assert.match(browserSurface, /runTokenRef\.current !== capturedRunToken/);
  assert.match(browserSurface, /createPoseTrainingRuntime/);
  assert.match(browserSurface, /runtime\.detect\(timestampMs\)/);
  assert.match(browserSurface, /buildBrowserPoseTrainingResultPayload/);
  assert.match(unitySurface, /parseUnityTrainingResultBridgeEvent/);
  assert.match(unitySurface, /fetchValidatedUnityManifest/);
  assert.match(
    unitySurface,
    /allowInsecureOrigin: process\.env\.NODE_ENV !== "production"/,
  );
  assert.match(unitySurface, /readUnityRuntime/);
  assert.match(unitySurface, /isExpectedUnityTrainingMessageSource/);
  const unityMessageSourceGate = sliceBetween(
    unityBridgeSource,
    "export function isExpectedUnityTrainingMessageSource",
    "export function isUnityTrainingResultCandidate",
  );
  assert.match(unityMessageSourceGate, /event\.origin === expectedOrigin/);
  assert.match(unityMessageSourceGate, /event\.source === expectedSource/);
  assert.match(unitySurface, /createUnityTrainingRuntimeFailureState/);
  assert.match(unitySurface, /failUnityTrainingRuntime\("source"\)/);
  assert.match(unitySurface, /failUnityTrainingRuntime\("result"\)/);
  assert.match(unitySurface, /setManifestState\(failure\.manifestState\)/);
  assert.match(unitySurface, /setRuntimeState\(failure\.runtimeState\)/);
  assert.match(
    unitySurface,
    /failedRuntimeSessionIdRef\.current === trainingSession\.id/,
  );
  assert.match(unitySurface, /runtimeAttemptBlocked/);
  assert.match(
    unitySurface,
    /window\.removeEventListener\("message", handleMessage\)/,
  );
  assert.match(unitySurface, /delete window\.RehabTrainingRuntimeConfig/);
  assert.match(unitySurface, /activeUnityInstance\.instance\.Quit/);
  assert.doesNotMatch(
    unityMarkupSource,
    /trainingScreenReady\s*\?\s*"训练画面已准备"/,
  );
  assert.match(
    unityMarkupSource,
    /trainingScreenActive\s*\?\s*"训练画面已准备"/,
  );
  assert.match(
    unitySurface,
    /onResultReady:\s*\(payload:\s*SubmitTrainingResultRequest\)\s*=>\s*void/,
  );
  assert.doesNotMatch(
    runtimePage + browserVisibleCopy + unityVisibleCopy,
    /fallback|mock|demo/i,
  );
  assert.doesNotMatch(
    browserSurface + unitySurface + runtimePage,
    /fixedScore|manualResult|fake/i,
  );
  assert.doesNotMatch(
    runtimePage,
    /Unity loader|manifest|bridge|runtime|采样帧|平均置信度|审计|质控/i,
  );
  assert.doesNotMatch(browserVisibleCopy, patientVisibleRuntimeTerms);
  assert.doesNotMatch(browserRuntimeStateCopy, /成绩/);
  assert.doesNotMatch(browserVisibleStatsCopy, patientVisibleRuntimeTerms);
  assert.doesNotMatch(
    browserVisibleStatsCopy,
    patientVisibleGameplayTelemetryTerms,
  );
  assert.doesNotMatch(
    browserGameplayProfileVisibleCopy,
    patientVisibleRuntimeTerms,
  );
  assert.doesNotMatch(
    browserGameplayProfileVisibleCopy,
    patientVisibleGameplayTelemetryTerms,
  );
  assert.doesNotMatch(browserTargetLabelSource, patientVisibleRuntimeTerms);
  assert.doesNotMatch(browserQualityCopy, patientVisibleRuntimeTerms);
  assert.doesNotMatch(browserQualityCopy, patientVisibleGameplayTelemetryTerms);
  assert.doesNotMatch(unityVisibleCopy, patientVisibleRuntimeTerms);
  assert.doesNotMatch(
    browserPoseMarkupSource + unityMarkupSource,
    rawVisibleRuntimeStyleTerms,
  );
  assert.match(browserPoseMarkupSource, /training-stage-shell/);
  assert.match(unityMarkupSource, /training-stage-shell/);
  assert.match(browserPoseMarkupSource + unityMarkupSource, /aspect-video/);
  assert.match(browserPoseMarkupSource + unityMarkupSource, /min-h-\[clamp/);
  assert.doesNotMatch(
    browserPoseMarkupSource,
    /sampleCount|validFrameCount|averageVisibility|poseModelVersion|poseLandmarkCount|poseAverageVisibility/,
  );
  assert.doesNotMatch(
    prepMarkupSource,
    /poseError|关键点|置信度|poseModelVersion|poseLandmarkCount|poseAverageVisibility/,
  );
  assert.match(prepSource, /画面不够稳定，请调整站位后重试/);
  assert.match(
    browserVisibleCopy + unityVisibleCopy,
    /正在准备训练|训练进行中|训练暂不可开始|站位情况|训练准备状态/,
  );
});

async function readRoleWorkspaceSource() {
  return readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
}

function extractFunctionBlock(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${functionName}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      opened = true;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (opened && depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unterminated function ${functionName}`);
}

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  return source.slice(start);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end =
    typeof endMarker === "string"
      ? source.indexOf(endMarker, start)
      : start + source.slice(start).search(endMarker);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function visibleJsxTextAndLiteralProps(source) {
  const textNodes = Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) =>
    text.trim(),
  ).filter(Boolean);
  const literalProps = Array.from(
    source.matchAll(
      /\b(?:label|title|description|aria-label)=["']([^"']+)["']/g,
    ),
    ([, text]) => text.trim(),
  ).filter(Boolean);
  const literalBranches = Array.from(
    source.matchAll(/:\s*["']([^"']+)["']/g),
    ([, text]) => text.trim(),
  ).filter(Boolean);
  return [...textNodes, ...literalProps, ...literalBranches].join("\n");
}

function visibleStringLiterals(source) {
  return Array.from(
    source.matchAll(/["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g),
    ([, text]) => text.trim(),
  )
    .filter(Boolean)
    .join("\n");
}

function visibleRuntimeGameplayProfileStrings(source) {
  const profileBlock = sliceBetween(
    source,
    "const gameplayProfiles = {",
    /\}\s+as const satisfies Record<\s*BrowserPoseScoringProfile,\s*BrowserPoseGameplayProfile\s*>;/,
  );
  return Array.from(
    profileBlock.matchAll(
      /\b(?:targetPrefix|stagePrompt|scoringHint|liveStatLabels):\s*(?:"([^"]*)"|\{([\s\S]*?)\})/g,
    ),
    ([, text, nested]) => text ?? nested ?? "",
  )
    .flatMap((text) =>
      Array.from(
        text.matchAll(/["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g),
        ([, literal]) => literal.trim(),
      ),
    )
    .filter(Boolean)
    .join("\n");
}
