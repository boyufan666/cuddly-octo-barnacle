import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyUnityRhythmReachWebGlBuild(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const readArtifact = options.readArtifact ?? readFile;
  const gameVersion = options.gameVersion ?? "0.1.2";
  const buildDir = resolve(
    rootDir,
    `apps/web/public/unity/rhythm_reach_3d/${gameVersion}`,
  );
  const failures = [];

  const manifest = await readJson(resolve(buildDir, "manifest.json"), failures);
  if (!manifest) return { failures };

  await validateIndexHtml(failures, buildDir, gameVersion);
  await validatePlatformBridge(failures, rootDir);

  requireStringValue(failures, manifest.releaseStatus, "released", "releaseStatus");
  requireStringValue(failures, manifest.gameCode, "rhythm_reach_3d", "gameCode");
  requireNonEmptyString(failures, manifest.gameName, "gameName");
  requireStringValue(failures, manifest.gameVersion, gameVersion, "gameVersion");
  requireStringValue(
    failures,
    manifest.bridgeProtocolVersion,
    "1.0.0",
    "bridgeProtocolVersion",
  );
  requireNonEmptyString(failures, manifest.unityVersion, "unityVersion");
  requireIsoDate(failures, manifest.generatedAt, "generatedAt");
  requireStringValue(failures, manifest.buildTarget, "WebGL", "buildTarget");

  if (!isObject(manifest.runtime)) {
    failures.push("manifest.runtime 必须是对象。");
  } else {
    requireStringValue(
      failures,
      manifest.runtime.unitySessionObjectName,
      "RhythmReachSession",
      "runtime.unitySessionObjectName",
    );
    requireStringValue(
      failures,
      manifest.runtime.runtimeConfigMethod,
      "SetRuntimeConfigJson",
      "runtime.runtimeConfigMethod",
    );
    requireStringValue(
      failures,
      manifest.runtime.startMethod,
      "StartConfiguredSession",
      "runtime.startMethod",
    );
    requireStringValue(
      failures,
      manifest.runtime.reachHitMethod,
      "ReceiveWebGlReachHit",
      "runtime.reachHitMethod",
    );
    requireStringValue(
      failures,
      manifest.runtime.difficultyMethod,
      "SetExplicitDifficulty",
      "runtime.difficultyMethod",
    );
  }

  if (!isObject(manifest.build)) {
    failures.push("manifest.build 必须是对象。");
  } else {
    if ("streamingAssetsUrl" in manifest.build) {
      failures.push(
        "manifest.build 不应声明 streamingAssetsUrl：当前 Unity 构建不包含 StreamingAssets 资源。",
      );
    }
    await validateBuildDirectory(failures, buildDir, gameVersion);
  }

  validateRuntimeRequirements(failures, manifest.runtimeRequirements);

  if (!Array.isArray(manifest.requiredResultMetrics)) {
    failures.push("manifest.requiredResultMetrics 必须是数组。");
  } else {
    const metricTypes = new Set(
      manifest.requiredResultMetrics
        .filter(isObject)
        .map((metric) => metric.metricType),
    );
    for (const requiredMetric of [
      "reaction_time_ms",
      "target_hit_rate",
      "arm_raise_accuracy",
      "duration_seconds",
      "difficulty_level",
    ]) {
      if (!metricTypes.has(requiredMetric)) {
        failures.push(`manifest.requiredResultMetrics 缺少 ${requiredMetric}。`);
      }
    }
    if (metricTypes.has("training_duration_seconds")) {
      failures.push(
        "manifest.requiredResultMetrics 不应包含 training_duration_seconds。",
      );
    }
  }

  if (!Array.isArray(manifest.artifacts)) {
    failures.push("manifest.artifacts 必须是数组。");
  } else {
    let compiledResultContractFound = false;
    const requiredPaths = new Set([
      `Build/${gameVersion}.loader.js`,
      `Build/${gameVersion}.framework.js`,
      `Build/${gameVersion}.data`,
      `Build/${gameVersion}.wasm`,
    ]);
    const expectedArtifactUrls = expectedBuildArtifactUrls(gameVersion);
    const artifactsByPath = new Map();
    const seenPaths = new Set();
    const seenUrls = new Set();
    for (const artifact of manifest.artifacts) {
      validateArtifactUrl(failures, artifact, expectedArtifactUrls, seenPaths, seenUrls);
      const artifactValidation = await validateArtifact(
        failures,
        buildDir,
        artifact,
        readArtifact,
      );
      if (artifactValidation?.containsResultContractMarker) {
        compiledResultContractFound = true;
      }
      if (isObject(artifact) && typeof artifact.path === "string") {
        requiredPaths.delete(artifact.path);
        artifactsByPath.set(artifact.path, artifact);
      }
    }
    for (const missingPath of requiredPaths) {
      failures.push(`manifest.artifacts 缺少 ${missingPath}。`);
    }
    if (isObject(manifest.build)) {
      validateBuildUrl(
        failures,
        manifest.build.loaderUrl,
        `Build/${gameVersion}.loader.js`,
        artifactsByPath,
        gameVersion,
      );
      validateBuildUrl(
        failures,
        manifest.build.dataUrl,
        `Build/${gameVersion}.data`,
        artifactsByPath,
        gameVersion,
      );
      validateBuildUrl(
        failures,
        manifest.build.frameworkUrl,
        `Build/${gameVersion}.framework.js`,
        artifactsByPath,
        gameVersion,
      );
      validateBuildUrl(
        failures,
        manifest.build.codeUrl,
        `Build/${gameVersion}.wasm`,
        artifactsByPath,
        gameVersion,
      );
    }
    if (!compiledResultContractFound) {
      failures.push(
        "Unity WebGL 编译产物缺少 rehab-unity-result-v2，当前 build 与 C# source contract 不一致，必须正式重建。",
      );
    }
  }

  return { failures };
}

async function validateIndexHtml(failures, buildDir, gameVersion) {
  const content = await readTextFile(resolve(buildDir, "index.html"), failures, "index.html");
  if (!content) return;

  for (const requiredSnippet of [
    "/unity/rehab-unity-bridge.js",
    "window.RehabUnityBridge",
    "window.RehabTrainingRuntimeConfig",
    "createUnityInstance",
    `${gameVersion}.loader.js`,
    `${gameVersion}.data`,
    `${gameVersion}.framework.js`,
    `${gameVersion}.wasm`,
    "requiredConfigFields",
    "sessionId",
    "gameRunId",
    "gameCode",
    "gameVersion",
    "deviceCode",
    "bridgeProtocolVersion",
    "unitySessionObjectName",
    "runtimeConfigMethod",
    "startMethod",
    "reachHitMethod",
    "difficultyMethod",
    "unityInstance.SendMessage",
    "startConfiguredSession",
    "receiveWebGlReachHit",
  ]) {
    if (!content.includes(requiredSnippet)) {
      failures.push(`index.html 缺少 ${requiredSnippet}。`);
    }
  }
}

async function validatePlatformBridge(failures, rootDir) {
  const bridgePath = resolve(rootDir, "apps/web/public/unity/rehab-unity-bridge.js");
  const content = await readTextFile(
    bridgePath,
    failures,
    "apps/web/public/unity/rehab-unity-bridge.js",
  );
  if (!content) return;

  for (const requiredSnippet of [
    "protocolVersion = \"1.0.0\"",
    "eventType = \"training_result\"",
    "buildTrainingResultEvent",
    "postTrainingResultJson",
    "motionMetrics must be a non-empty array",
    "validateDynamicDifficultyEvidence",
    "metricsSummary.dynamicDifficultyEvidence",
    "dynamicDifficultyEvidence.schemaVersion",
    "dynamicDifficultyEvidence.events",
    "startingLevelSource",
    "approvedPlanItemId",
    "assessmentSourceId",
    "triggerReason",
    "runtimeFrameId",
    "runtimeWindowId",
    "safetyClampReason",
    "destination.postMessage",
    "global.location.origin",
    "metricsSummary.source = \"unity_webgl\"",
    "result.collectionBatchId",
    "metricsSummary.collectionBatchId",
    "collectionBatchId: collectionBatchId",
    "metricsSummaryCollectionBatchId !== collectionBatchId",
    "collectionBatchId fields must match",
    "rehab-unity-result-v2",
    "resultContractVersion",
    "validateRequiredMetricTypes",
  ]) {
    if (!content.includes(requiredSnippet)) {
      failures.push(`rehab-unity-bridge.js 缺少 ${requiredSnippet}。`);
    }
  }
}

async function validateBuildDirectory(failures, buildDir, gameVersion) {
  const artifactDir = resolve(buildDir, "Build");
  let entries;
  try {
    entries = await readdir(artifactDir, { withFileTypes: true });
  } catch (error) {
    failures.push(
      error instanceof Error
        ? `Build 目录无法读取：${error.message}`
        : "Build 目录无法读取。",
    );
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.(loader\.js|framework\.js|data|wasm)$/.test(entry.name) && !entry.name.startsWith(`${gameVersion}.`)) {
      failures.push(`Build 目录包含其他版本产物：${entry.name}`);
    }
  }
}

function validateRuntimeRequirements(failures, runtimeRequirements) {
  if (!isObject(runtimeRequirements)) {
    failures.push("manifest.runtimeRequirements 必须是对象。");
    return;
  }
  if (runtimeRequirements.cameraRequired !== true) {
    failures.push("manifest.runtimeRequirements.cameraRequired 必须是 true。");
  }
  if (runtimeRequirements.microphoneRequired !== false) {
    failures.push("manifest.runtimeRequirements.microphoneRequired 必须是 false。");
  }
  if (
    !Array.isArray(runtimeRequirements.supportedInputModes) ||
    runtimeRequirements.supportedInputModes.length !== 1 ||
    runtimeRequirements.supportedInputModes[0] !== "camera_pose"
  ) {
    failures.push("manifest.runtimeRequirements.supportedInputModes 必须只包含 camera_pose。");
  }
}

function validateArtifactUrl(failures, artifact, expectedArtifactUrls, seenPaths, seenUrls) {
  if (!isObject(artifact)) return;
  if (typeof artifact.path === "string") {
    if (seenPaths.has(artifact.path)) {
      failures.push(`manifest.artifacts 存在重复 path：${artifact.path}`);
    }
    seenPaths.add(artifact.path);
  }
  if (typeof artifact.url === "string") {
    if (seenUrls.has(artifact.url)) {
      failures.push(`manifest.artifacts 存在重复 url：${artifact.url}`);
    }
    seenUrls.add(artifact.url);
  }
  const expectedUrl = expectedArtifactUrls.get(artifact.path);
  if (!expectedUrl) return;
  if (artifact.url !== buildHashedUrl(expectedUrl, artifact.sha256)) {
    failures.push(`artifact.url 与 manifest.build 不一致：${artifact.path}`);
  }
}

function expectedBuildArtifactUrls(gameVersion) {
  return new Map([
    [`Build/${gameVersion}.loader.js`, `/unity/rhythm_reach_3d/${gameVersion}/Build/${gameVersion}.loader.js`],
    [`Build/${gameVersion}.framework.js`, `/unity/rhythm_reach_3d/${gameVersion}/Build/${gameVersion}.framework.js`],
    [`Build/${gameVersion}.data`, `/unity/rhythm_reach_3d/${gameVersion}/Build/${gameVersion}.data`],
    [`Build/${gameVersion}.wasm`, `/unity/rhythm_reach_3d/${gameVersion}/Build/${gameVersion}.wasm`],
  ]);
}

function validateBuildUrl(
  failures,
  value,
  expectedPath,
  artifactsByPath,
  gameVersion,
) {
  const baseUrl = `/unity/rhythm_reach_3d/${gameVersion}/${expectedPath}`;
  const artifact = artifactsByPath.get(expectedPath);
  if (!artifact) {
    failures.push(`build.${expectedPath} 缺少对应 artifact。`);
    return;
  }
  const expected = buildHashedUrl(baseUrl, artifact.sha256);
  requireStringValue(failures, value, expected, `build.${expectedPath}`);
}

function buildHashedUrl(baseUrl, sha256) {
  if (typeof sha256 !== "string" || !sha256.startsWith("sha256:")) {
    return `${baseUrl}?hash=`;
  }
  return `${baseUrl}?hash=${sha256.slice("sha256:".length)}`;
}

async function readJson(path, failures) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    failures.push(
      error instanceof Error
        ? `manifest.json 无法读取或解析：${error.message}`
        : "manifest.json 无法读取或解析。",
    );
    return undefined;
  }
}

async function readTextFile(path, failures, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    failures.push(
      error instanceof Error
        ? `${label} 无法读取：${error.message}`
        : `${label} 无法读取。`,
    );
    return undefined;
  }
}

async function validateArtifact(failures, buildDir, artifact, readArtifact) {
  if (!isObject(artifact)) {
    failures.push("artifact 必须是对象。");
    return;
  }
  if (typeof artifact.path !== "string" || !artifact.path.trim()) {
    failures.push("artifact.path 必须是非空字符串。");
    return;
  }
  if (artifact.path.startsWith("/") || artifact.path.includes("..")) {
    failures.push(`artifact.path 非法：${artifact.path}`);
    return;
  }

  const artifactPath = resolve(buildDir, artifact.path);
  let fileInfo;
  try {
    fileInfo = await stat(artifactPath);
  } catch {
    failures.push(`缺少 Unity WebGL 产物：${artifact.path}`);
    return;
  }
  if (!fileInfo.isFile()) {
    failures.push(`Unity WebGL 产物不是文件：${artifact.path}`);
    return;
  }
  if (artifact.sizeBytes !== fileInfo.size) {
    failures.push(
      `${artifact.path} sizeBytes 不匹配：manifest=${artifact.sizeBytes}, actual=${fileInfo.size}`,
    );
  }
  let content;
  try {
    content = await readArtifact(artifactPath);
  } catch {
    failures.push(`Unity WebGL 产物无法读取：${artifact.path}`);
    return undefined;
  }
  const actualHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  if (artifact.sha256 !== actualHash) {
    failures.push(`${artifact.path} sha256 不匹配。`);
  }
  return {
    containsResultContractMarker:
      isCompiledRuntimeArtifact(artifact.path) &&
      content.includes(Buffer.from("rehab-unity-result-v2", "utf8")),
  };
}

function isCompiledRuntimeArtifact(path) {
  return /\.(framework\.js|data|wasm)$/.test(path);
}

function requireStringValue(failures, value, expected, label) {
  if (value !== expected) {
    const hashHint = expected.includes("?hash=") ? "，必须带 artifact sha256 hash 参数" : "";
    failures.push(`${label} 必须是 ${expected}${hashHint}。`);
  }
}

function requireNonEmptyString(failures, value, label) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} 必须是非空字符串。`);
  }
}

function requireIsoDate(failures, value, label) {
  requireNonEmptyString(failures, value, label);
  if (typeof value !== "string" || !value.trim()) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    failures.push(`${label} 必须是 ISO 8601 UTC 时间。`);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyUnityRhythmReachWebGlBuild();
  if (result.failures.length > 0) {
    console.error("Unity Rhythm Reach WebGL build verification failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Unity Rhythm Reach WebGL build verification passed.");
  }
}
