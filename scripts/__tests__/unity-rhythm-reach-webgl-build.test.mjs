import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyUnityRhythmReachWebGlBuild } from "../verify-unity-rhythm-reach-webgl-build.mjs";

test("Unity Rhythm Reach WebGL build accepts the checked-in versioned result contract", async () => {
  const result = await verifyUnityRhythmReachWebGlBuild({
    rootDir: fileURLToPath(new URL("../..", import.meta.url)),
  });

  assert.deepEqual(result.failures, []);
});

test("Unity Rhythm Reach WebGL build rejects a fixture without the compiled versioned marker", async () => {
  const rootDir = await createMinimalBuildFixture({
    includeCompiledResultContract: false,
  });

  const result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
  });

  assert.match(result.failures.join("\n"), /编译产物.*rehab-unity-result-v2/);
});

test("Unity Rhythm Reach WebGL build reads each artifact once for hash and marker validation", async () => {
  const rootDir = await createMinimalBuildFixture();
  const readCounts = new Map();

  const result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
    readArtifact: async (path) => {
      readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
      return readFile(path);
    },
  });

  assert.match(result.failures.join("\n"), /hash 参数/);
  assert.doesNotMatch(result.failures.join("\n"), /rehab-unity-result-v2/);
  assert.equal(readCounts.size, 4);
  for (const count of readCounts.values()) {
    assert.equal(count, 1);
  }
});

test("Unity Rhythm Reach WebGL build URLs are pinned to artifact hashes", async () => {
  const rootDir = await createMinimalBuildFixture();

  let result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
  });
  let failures = result.failures.join("\n");

  assert.match(failures, /hash 参数/);

  const manifestPath = join(
    rootDir,
    "apps/web/public/unity/rhythm_reach_3d/0.1.0/manifest.json",
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const artifactHashes = Object.fromEntries(
    manifest.artifacts.map((artifact) => [
      artifact.path,
      artifact.sha256.replace("sha256:", ""),
    ]),
  );
  manifest.build.loaderUrl = withHash(
    manifest.build.loaderUrl,
    artifactHashes["Build/0.1.0.loader.js"],
  );
  manifest.build.frameworkUrl = withHash(
    manifest.build.frameworkUrl,
    artifactHashes["Build/0.1.0.framework.js"],
  );
  manifest.build.dataUrl = withHash(
    manifest.build.dataUrl,
    artifactHashes["Build/0.1.0.data"],
  );
  manifest.build.codeUrl = withHash(
    manifest.build.codeUrl,
    artifactHashes["Build/0.1.0.wasm"],
  );
  manifest.artifacts = manifest.artifacts.map((artifact) => ({
    ...artifact,
    url: withHash(artifact.url, artifact.sha256.replace("sha256:", "")),
  }));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
  });

  assert.deepEqual(result.failures, []);
});

test("Unity Rhythm Reach WebGL build requires the platform bridge batch contract", async () => {
  const rootDir = await createMinimalBuildFixture({
    includeBatchContract: false,
  });

  const result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
  });

  assert.match(result.failures.join("\n"), /collectionBatchId/);
});

test("Unity Rhythm Reach source builder pins manifest URLs to artifact hashes", async () => {
  const rootDir = fileURLToPath(new URL("../..", import.meta.url));
  const builderSource = await readFile(
    join(
      rootDir,
      "unity/rhythm-reach-3d/Assets/Rehab/Editor/RhythmReachWebGlBuilder.cs",
    ),
    "utf8",
  );

  assert.match(builderSource, /BuildVersionedUrl/);
  assert.match(builderSource, /\?hash=/);
  assert.match(
    builderSource,
    /artifact\.sha256\.Substring\("sha256:"\.Length\)/,
  );
});

test("Unity Rhythm Reach WebGL build rejects an unused StreamingAssets declaration", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "unity-build-consistency-"));
  const buildDir = join(rootDir, "apps/web/public/unity/rhythm_reach_3d/0.1.0");
  const artifactDir = join(buildDir, "Build");
  await mkdir(artifactDir, { recursive: true });
  await mkdir(join(rootDir, "apps/web/public/unity"), { recursive: true });
  await writeFile(join(artifactDir, "0.1.0.loader.js"), "loader");
  await writeFile(join(artifactDir, "0.1.0.framework.js"), "framework");
  await writeFile(join(artifactDir, "0.1.0.data"), "data");
  await writeFile(join(artifactDir, "0.1.0.wasm"), "wasm");
  await writeFile(
    join(rootDir, "apps/web/public/unity/rehab-unity-bridge.js"),
    "window.RehabUnityBridge = {};",
  );
  await writeFile(
    join(buildDir, "index.html"),
    [
      '<script src="/unity/rehab-unity-bridge.js"></script>',
      "window.RehabTrainingRuntimeConfig",
      "createUnityInstance",
      "0.1.0.loader.js",
      "0.1.0.data",
      "0.1.0.framework.js",
      "0.1.0.wasm",
      "RhythmReachSession",
      "SetRuntimeConfigJson",
      "StartConfiguredSession",
      "ReceiveWebGlReachHit",
      "SetExplicitDifficulty",
    ].join("\n"),
  );
  await writeFile(
    join(buildDir, "manifest.json"),
    JSON.stringify(
      {
        releaseStatus: "released",
        gameCode: "rhythm_reach_3d",
        gameName: "Rhythm Reach 3D",
        gameVersion: "0.1.0",
        bridgeProtocolVersion: "1.0.0",
        buildTarget: "WebGL",
        runtime: {
          unitySessionObjectName: "RhythmReachSession",
          runtimeConfigMethod: "SetRuntimeConfigJson",
          startMethod: "StartConfiguredSession",
          reachHitMethod: "ReceiveWebGlReachHit",
          difficultyMethod: "SetExplicitDifficulty",
        },
        build: {
          loaderUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.loader.js",
          dataUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.data",
          frameworkUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.framework.js",
          codeUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.wasm",
          streamingAssetsUrl: "/unity/rhythm_reach_3d/0.1.0/StreamingAssets",
        },
        requiredResultMetrics: [
          { metricType: "reaction_time_ms" },
          { metricType: "target_hit_rate" },
          { metricType: "arm_raise_accuracy" },
          { metricType: "duration_seconds" },
          { metricType: "difficulty_level" },
        ],
        artifacts: [
          { path: "Build/0.1.0.loader.js", sizeBytes: 6, sha256: "sha256:bad" },
          {
            path: "Build/0.1.0.framework.js",
            sizeBytes: 9,
            sha256: "sha256:bad",
          },
          { path: "Build/0.1.0.data", sizeBytes: 4, sha256: "sha256:bad" },
          { path: "Build/0.1.0.wasm", sizeBytes: 4, sha256: "sha256:bad" },
        ],
      },
      null,
      2,
    ),
  );

  const result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /StreamingAssets/);
});

test("Unity Rhythm Reach WebGL build rejects stale build files and manifest URL drift", async () => {
  const rootDir = await createMinimalBuildFixture();
  await writeFile(
    join(
      rootDir,
      "apps/web/public/unity/rhythm_reach_3d/0.1.0/Build/0.2.0.loader.js",
    ),
    "stale-loader",
  );
  const manifestPath = join(
    rootDir,
    "apps/web/public/unity/rhythm_reach_3d/0.1.0/manifest.json",
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.gameName = "";
  manifest.unityVersion = "";
  manifest.generatedAt = "<generated>";
  manifest.runtimeRequirements = {
    cameraRequired: false,
    microphoneRequired: false,
    supportedInputModes: ["camera_pose", "keyboard"],
  };
  manifest.artifacts[0].url =
    "/unity/rhythm_reach_3d/0.1.0/Build/wrong.loader.js?hash=bad";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const result = await verifyUnityRhythmReachWebGlBuild({
    rootDir,
    gameVersion: "0.1.0",
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /gameName/);
  assert.match(failures, /unityVersion/);
  assert.match(failures, /generatedAt/);
  assert.match(failures, /cameraRequired/);
  assert.match(failures, /supportedInputModes/);
  assert.match(failures, /artifact.url/);
  assert.match(failures, /0\.2\.0\.loader\.js/);
});

async function createMinimalBuildFixture({
  includeBatchContract = true,
  includeCompiledResultContract = true,
} = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "unity-build-consistency-"));
  const buildDir = join(rootDir, "apps/web/public/unity/rhythm_reach_3d/0.1.0");
  const artifactDir = join(buildDir, "Build");
  await mkdir(artifactDir, { recursive: true });
  await mkdir(join(buildDir, "StreamingAssets"), { recursive: true });
  await mkdir(join(rootDir, "apps/web/public/unity"), { recursive: true });
  await writeFile(join(artifactDir, "0.1.0.loader.js"), "loader");
  await writeFile(join(artifactDir, "0.1.0.framework.js"), "framework");
  const dataContent = includeCompiledResultContract
    ? "data:rehab-unity-result-v2"
    : "data:collectionBatchId";
  await writeFile(join(artifactDir, "0.1.0.data"), dataContent);
  await writeFile(join(artifactDir, "0.1.0.wasm"), "wasm");
  await writeFile(
    join(rootDir, "apps/web/public/unity/rehab-unity-bridge.js"),
    [
      'var protocolVersion = "1.0.0";',
      'var eventType = "training_result";',
      'var resultContractVersion = "rehab-unity-result-v2";',
      "function buildTrainingResultEvent() {}",
      "function postTrainingResultJson() {}",
      'throw new Error("motionMetrics must be a non-empty array.");',
      "function validateDynamicDifficultyEvidence() {}",
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
      "destination.postMessage(message, global.location.origin);",
      'metricsSummary.source = "unity_webgl";',
      ...(includeBatchContract
        ? [
            "result.collectionBatchId",
            "metricsSummary.collectionBatchId",
            "collectionBatchId: collectionBatchId",
            "metricsSummaryCollectionBatchId !== collectionBatchId",
            "collectionBatchId fields must match",
            "resultContractVersion",
            "validateRequiredMetricTypes",
          ]
        : []),
    ].join("\n"),
  );
  await writeFile(
    join(buildDir, "index.html"),
    [
      '<script src="/unity/rehab-unity-bridge.js"></script>',
      "window.RehabUnityBridge",
      "window.RehabTrainingRuntimeConfig",
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
      "createUnityInstance",
      "0.1.0.loader.js",
      "0.1.0.data",
      "0.1.0.framework.js",
      "0.1.0.wasm",
      "unityInstance.SendMessage",
      "startConfiguredSession",
      "receiveWebGlReachHit",
    ].join("\n"),
  );
  await writeFile(
    join(buildDir, "manifest.json"),
    JSON.stringify(
      createMinimalManifest({
        loaderHash: sha256("loader"),
        frameworkHash: sha256("framework"),
        dataHash: sha256(dataContent),
        dataSizeBytes: Buffer.byteLength(dataContent),
        wasmHash: sha256("wasm"),
      }),
      null,
      2,
    ),
  );
  return rootDir;
}

function createMinimalManifest({
  loaderHash,
  frameworkHash,
  dataHash,
  dataSizeBytes,
  wasmHash,
}) {
  return {
    releaseStatus: "released",
    gameCode: "rhythm_reach_3d",
    gameName: "Rhythm Reach 3D",
    gameVersion: "0.1.0",
    bridgeProtocolVersion: "1.0.0",
    unityVersion: "6000.0.75f1",
    generatedAt: "2026-05-25T08:48:27.089Z",
    buildTarget: "WebGL",
    runtime: {
      unitySessionObjectName: "RhythmReachSession",
      runtimeConfigMethod: "SetRuntimeConfigJson",
      startMethod: "StartConfiguredSession",
      reachHitMethod: "ReceiveWebGlReachHit",
      difficultyMethod: "SetExplicitDifficulty",
    },
    build: {
      loaderUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.loader.js",
      dataUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.data",
      frameworkUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.framework.js",
      codeUrl: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.wasm",
    },
    runtimeRequirements: {
      cameraRequired: true,
      microphoneRequired: false,
      supportedInputModes: ["camera_pose"],
    },
    requiredResultMetrics: [
      { metricType: "reaction_time_ms" },
      { metricType: "target_hit_rate" },
      { metricType: "arm_raise_accuracy" },
      { metricType: "duration_seconds" },
      { metricType: "difficulty_level" },
    ],
    artifacts: [
      {
        path: "Build/0.1.0.loader.js",
        url: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.loader.js",
        sizeBytes: 6,
        sha256: loaderHash,
      },
      {
        path: "Build/0.1.0.framework.js",
        url: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.framework.js",
        sizeBytes: 9,
        sha256: frameworkHash,
      },
      {
        path: "Build/0.1.0.data",
        url: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.data",
        sizeBytes: dataSizeBytes,
        sha256: dataHash,
      },
      {
        path: "Build/0.1.0.wasm",
        url: "/unity/rhythm_reach_3d/0.1.0/Build/0.1.0.wasm",
        sizeBytes: 4,
        sha256: wasmHash,
      },
    ],
  };
}

function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function withHash(url, hash) {
  return `${url}?hash=${hash}`;
}
