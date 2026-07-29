import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchValidatedUnityManifest,
  resolveManifestUrl,
  validateUnityManifest,
  type UnityManifest,
} from "./unity-manifest";

const origin = "https://app.rehab.example";
const game = {
  code: "rhythm_reach_3d",
  gameVersion: "0.1.2",
  bridgeProtocolVersion: "1.0.0",
};

function createManifest(): UnityManifest {
  const base = "/unity/rhythm_reach_3d/0.1.2/Build";
  const artifact = (name: string, hash: string, sizeBytes: number) => ({
    path: `Build/${name}`,
    url: `${base}/${name}?hash=${hash}`,
    sha256: `sha256:${hash}`,
    sizeBytes,
  });
  const loader = artifact("0.1.2.loader.js", "a".repeat(64), 10);
  const data = artifact("0.1.2.data", "b".repeat(64), 11);
  const framework = artifact("0.1.2.framework.js", "c".repeat(64), 12);
  const code = artifact("0.1.2.wasm", "d".repeat(64), 13);
  return {
    releaseStatus: "released",
    gameCode: game.code,
    gameName: "Rhythm Reach 3D",
    gameVersion: game.gameVersion,
    bridgeProtocolVersion: game.bridgeProtocolVersion,
    buildTarget: "WebGL",
    runtime: {
      unitySessionObjectName: "RhythmReachSession",
      startMethod: "StartConfiguredSession",
      runtimeConfigMethod: "SetRuntimeConfigJson",
      reachHitMethod: "ReceiveWebGlReachHit",
      difficultyMethod: "SetExplicitDifficulty",
    },
    build: {
      loaderUrl: loader.url,
      dataUrl: data.url,
      frameworkUrl: framework.url,
      codeUrl: code.url,
    },
    runtimeRequirements: {
      cameraRequired: true,
      microphoneRequired: false,
      supportedInputModes: ["camera_pose"],
    },
    requiredResultMetrics: [
      { metricType: "reaction_time_ms", unit: "ms", min: 0, max: 60000 },
      { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
      { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
      { metricType: "duration_seconds", unit: "seconds", min: 1, max: 3600 },
      { metricType: "difficulty_level", unit: "level", min: 1, max: 3 },
    ],
    artifacts: [loader, framework, data, code],
  };
}

test("validates one released same-origin Unity WebGL manifest before use", async () => {
  const manifest = createManifest();
  let requestedUrl: string | undefined;
  let requestedInit: RequestInit | undefined;

  const loaded = await fetchValidatedUnityManifest({
    manifestUrl: "/unity/rhythm_reach_3d/0.1.2/manifest.json",
    game,
    origin,
    fetchImplementation: async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return {
        ok: true,
        status: 200,
        url: requestedUrl,
        json: async () => manifest,
      } as Response;
    },
  });

  assert.equal(loaded, manifest);
  assert.equal(
    requestedUrl,
    "https://app.rehab.example/unity/rhythm_reach_3d/0.1.2/manifest.json",
  );
  assert.equal(requestedInit?.redirect, "error");
  assert.equal(requestedInit?.credentials, "same-origin");
  assert.equal(requestedInit?.cache, "no-store");
});

test("rejects a cross-origin, malformed, or unexpected manifest address", () => {
  for (const manifestUrl of [
    "https://attacker.example/manifest.json",
    "/unity/rhythm_reach_3d/0.1.2/manifest.json?hash=abc",
    "/unity/rhythm_reach_3d/0.1.3/manifest.json",
    "/unity/rhythm_reach_3d/0.1.2/Build/manifest.json",
  ]) {
    assert.throws(
      () => resolveManifestUrl(manifestUrl, game, origin),
      /已发布版本路径/,
    );
  }
});

test("rejects redirected, altered, unapproved, and incomplete Unity artifacts", async () => {
  const manifest = createManifest();
  await assert.rejects(
    fetchValidatedUnityManifest({
      manifestUrl: "/unity/rhythm_reach_3d/0.1.2/manifest.json",
      game,
      origin,
      fetchImplementation: async () =>
        ({
          ok: true,
          status: 200,
          url: "https://app.rehab.example/redirected-manifest.json",
          json: async () => manifest,
        }) as Response,
    }),
    /重定向/,
  );

  const cases: Array<(candidate: UnityManifest) => void> = [
    (candidate) => {
      candidate.releaseStatus = "draft" as "released";
    },
    (candidate) => {
      candidate.runtimeRequirements.supportedInputModes = ["keyboard"] as unknown as ["camera_pose"];
    },
    (candidate) => {
      candidate.artifacts[0]!.sha256 = `sha256:${"f".repeat(64)}`;
    },
    (candidate) => {
      candidate.artifacts.pop();
    },
    (candidate) => {
      candidate.build.loaderUrl = "https://attacker.example/loader.js?hash=" + "a".repeat(64);
    },
  ];
  for (const alter of cases) {
    const candidate = structuredClone(manifest);
    alter(candidate);
    assert.throws(() => validateUnityManifest(candidate, game, origin));
  }
});
