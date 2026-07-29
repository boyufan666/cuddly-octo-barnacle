import { isPlainObject } from "@/features/training-runtime/runtime-context";

const unityMetricContract = Object.freeze({
  reaction_time_ms: { unit: "ms", min: 0, max: 60000 },
  target_hit_rate: { unit: "ratio", min: 0, max: 1 },
  arm_raise_accuracy: { unit: "ratio", min: 0, max: 1 },
  duration_seconds: { unit: "seconds", min: 1, max: 3600 },
  difficulty_level: { unit: "level", min: 1, max: 3 },
});

const unityBuildFields = [
  "loaderUrl",
  "dataUrl",
  "frameworkUrl",
  "codeUrl",
] as const;

type UnityBuildField = (typeof unityBuildFields)[number];

export type UnityManifest = {
  releaseStatus: "released";
  gameCode: string;
  gameName: string;
  gameVersion: string;
  bridgeProtocolVersion: string;
  buildTarget: "WebGL";
  runtime?: {
    unitySessionObjectName?: string;
    startMethod?: string;
    runtimeConfigMethod?: string;
    reachHitMethod?: string;
    difficultyMethod?: string;
  };
  build: Record<UnityBuildField, string>;
  runtimeRequirements: {
    cameraRequired: true;
    microphoneRequired: false;
    supportedInputModes: ["camera_pose"];
  };
  requiredResultMetrics: UnityMetric[];
  artifacts: UnityArtifact[];
};

type UnityMetric = {
  metricType: keyof typeof unityMetricContract;
  unit: string;
  min: number;
  max: number;
};

type UnityArtifact = {
  path: string;
  url: string;
  sha256: string;
  sizeBytes: number;
};

export type UnityManifestGameContract = {
  code: string;
  gameVersion?: string | null;
  bridgeProtocolVersion: string;
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchValidatedUnityManifest({
  manifestUrl,
  game,
  origin,
  fetchImplementation = fetch,
  allowInsecureOrigin = false,
}: {
  manifestUrl: string;
  game: UnityManifestGameContract;
  origin: string;
  fetchImplementation?: FetchImplementation;
  allowInsecureOrigin?: boolean;
}): Promise<UnityManifest> {
  const resolvedManifestUrl = resolveManifestUrl(
    manifestUrl,
    game,
    origin,
    allowInsecureOrigin,
  );
  const response = await fetchImplementation(resolvedManifestUrl, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`Unity 资源清单读取失败：${response.status}`);
  }
  if (response.url && response.url !== resolvedManifestUrl) {
    throw new Error("Unity 资源清单发生重定向，已阻断加载。");
  }
  const manifest = await response.json();
  if (!isUnityManifest(manifest)) {
    throw new Error("Unity 资源清单结构无效。");
  }
  validateUnityManifest(manifest, game, origin, allowInsecureOrigin);
  return manifest;
}

export function resolveManifestUrl(
  manifestUrl: string,
  game: UnityManifestGameContract,
  origin: string,
  allowInsecureOrigin = false,
) {
  const expectedOrigin = parseOrigin(
    origin,
    "Unity 页面来源无效。",
    allowInsecureOrigin,
  );
  const gameCode = requireSafePathSegment(game.code, "Unity 训练内容编码无效。");
  const gameVersion = requireSafePathSegment(
    game.gameVersion,
    "Unity 训练内容版本无效。",
  );
  let url: URL;
  try {
    url = new URL(manifestUrl, expectedOrigin);
  } catch {
    throw new Error("Unity 资源清单地址无效。");
  }
  if (
    url.origin !== expectedOrigin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/unity/${gameCode}/${gameVersion}/manifest.json`
  ) {
    throw new Error("Unity 资源清单必须是当前站点的已发布版本路径。");
  }
  return url.toString();
}

export function validateUnityManifest(
  manifest: UnityManifest,
  game: UnityManifestGameContract,
  origin: string,
  allowInsecureOrigin = false,
) {
  const expectedOrigin = parseOrigin(
    origin,
    "Unity 页面来源无效。",
    allowInsecureOrigin,
  );
  const gameCode = requireSafePathSegment(game.code, "Unity 训练内容编码无效。");
  const gameVersion = requireSafePathSegment(
    game.gameVersion,
    "Unity 训练内容版本无效。",
  );
  if (
    manifest.releaseStatus !== "released" ||
    manifest.buildTarget !== "WebGL" ||
    manifest.gameCode !== game.code ||
    manifest.gameVersion !== game.gameVersion ||
    manifest.bridgeProtocolVersion !== game.bridgeProtocolVersion
  ) {
    throw new Error("Unity 资源清单的发布身份或协议与训练内容不匹配。");
  }
  if (
    manifest.runtimeRequirements.cameraRequired !== true ||
    manifest.runtimeRequirements.microphoneRequired !== false ||
    manifest.runtimeRequirements.supportedInputModes.length !== 1 ||
    manifest.runtimeRequirements.supportedInputModes[0] !== "camera_pose"
  ) {
    throw new Error("Unity 资源清单不满足正式摄像头姿态训练要求。");
  }
  assertUnityMetricContract(manifest.requiredResultMetrics);
  assertUnityArtifacts(manifest, expectedOrigin, gameCode, gameVersion);
}

function isUnityManifest(value: unknown): value is UnityManifest {
  if (!isPlainObject(value)) return false;
  const build = value.build;
  if (!isPlainObject(build)) return false;
  if (
    value.releaseStatus !== "released" ||
    value.buildTarget !== "WebGL" ||
    !isText(value.gameCode) ||
    !isText(value.gameName) ||
    !isText(value.gameVersion) ||
    !isText(value.bridgeProtocolVersion) ||
    !isPlainObject(value.runtimeRequirements) ||
    !Array.isArray(value.requiredResultMetrics) ||
    !Array.isArray(value.artifacts)
  ) {
    return false;
  }
  return unityBuildFields.every((field) => isText(build[field]));
}

function assertUnityMetricContract(value: UnityMetric[]) {
  const entries = Object.entries(unityMetricContract) as Array<
    [keyof typeof unityMetricContract, (typeof unityMetricContract)[keyof typeof unityMetricContract]]
  >;
  if (value.length !== entries.length) {
    throw new Error("Unity 资源清单必须精确声明五项正式结果指标。");
  }
  const seen = new Set<string>();
  for (const metric of value) {
    if (!isPlainObject(metric) || typeof metric.metricType !== "string") {
      throw new Error("Unity 资源清单结果指标无效。");
    }
    const expected = unityMetricContract[
      metric.metricType as keyof typeof unityMetricContract
    ];
    if (
      !expected ||
      seen.has(metric.metricType) ||
      metric.unit !== expected.unit ||
      metric.min !== expected.min ||
      metric.max !== expected.max
    ) {
      throw new Error("Unity 资源清单结果指标与正式合同不一致。");
    }
    seen.add(metric.metricType);
  }
}

function assertUnityArtifacts(
  manifest: UnityManifest,
  origin: string,
  gameCode: string,
  gameVersion: string,
) {
  if (manifest.artifacts.length !== unityBuildFields.length) {
    throw new Error("Unity 资源清单必须精确声明四个发布构建工件。");
  }
  const artifactsByUrl = new Map<string, UnityArtifact>();
  const expectedPrefix = `/unity/${gameCode}/${gameVersion}/`;
  for (const artifact of manifest.artifacts) {
    if (!isPlainObject(artifact) || !isText(artifact.url) || !isText(artifact.path)) {
      throw new Error("Unity 构建工件无效。");
    }
    const artifactUrl = parseSameOriginArtifactUrl(artifact.url, origin, expectedPrefix);
    const expectedPath = artifactUrl.pathname.slice(expectedPrefix.length);
    if (
      artifact.path !== expectedPath ||
      !/^sha256:[a-f0-9]{64}$/.test(String(artifact.sha256)) ||
      !Number.isSafeInteger(artifact.sizeBytes) ||
      artifact.sizeBytes < 1 ||
      artifactsByUrl.has(artifactUrl.toString())
    ) {
      throw new Error("Unity 构建工件路径、哈希或大小无效。");
    }
    const hash = artifactUrl.searchParams.get("hash");
    if (
      artifactUrl.searchParams.size !== 1 ||
      !hash ||
      artifact.sha256 !== `sha256:${hash}`
    ) {
      throw new Error("Unity 构建工件哈希参数无效。");
    }
    artifactsByUrl.set(artifactUrl.toString(), artifact as UnityArtifact);
  }

  const buildUrls = new Set<string>();
  for (const field of unityBuildFields) {
    const buildUrl = parseSameOriginArtifactUrl(
      manifest.build[field],
      origin,
      expectedPrefix,
    ).toString();
    if (buildUrls.has(buildUrl) || !artifactsByUrl.has(buildUrl)) {
      throw new Error("Unity 构建地址未映射到唯一、经哈希验证的发布工件。");
    }
    buildUrls.add(buildUrl);
  }
}

function parseSameOriginArtifactUrl(
  value: string,
  origin: string,
  expectedPrefix: string,
) {
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    throw new Error("Unity 构建工件地址无效。");
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(expectedPrefix) ||
    url.pathname.includes("..")
  ) {
    throw new Error("Unity 构建工件必须位于当前站点的已发布版本目录。");
  }
  return url;
}

function parseOrigin(
  value: string,
  message: string,
  allowInsecureOrigin: boolean,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(message);
  }
  if (
    url.origin !== value ||
    (url.protocol !== "https:" &&
      !(allowInsecureOrigin && url.protocol === "http:"))
  ) {
    throw new Error(message);
  }
  return url.origin;
}

function requireSafePathSegment(value: unknown, message: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(message);
  }
  return value;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
