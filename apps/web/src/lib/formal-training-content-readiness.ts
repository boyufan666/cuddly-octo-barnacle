import type { FormalTrainingRuntime, GameContent } from "@/types/api";
import { browserPoseRequiredMetricContract } from "./browser-pose-game-library";
import { dynamicDifficultyTriggerReasons } from "./dynamic-difficulty-evidence";

export const unityWebglRequiredMetrics = [
  "reaction_time_ms",
  "target_hit_rate",
  "arm_raise_accuracy",
  "duration_seconds",
  "difficulty_level",
] as const;

export const cognitiveWebRequiredMetrics = [
  "sequence_recall_rate",
  "path_completion_rate",
] as const;

export function isGameReadyForTraining(game: GameContent) {
  if (game.runtimeType === "browser_pose_canvas") {
    return isBrowserPoseGameReady(game);
  }
  if (game.runtimeType === "cognitive_web") {
    return isCognitiveWebGameReady(game);
  }
  return (
    game.status === "active" &&
    game.runtimeType === "unity_webgl" &&
    game.buildStatus === "released" &&
    game.releaseChannel === "production" &&
    Boolean(game.manifestUrl?.trim()) &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0" &&
    game.supportsCamera === true &&
    game.supportedInputModes.includes("camera_pose") &&
    requiredMetricsExactlyMatch(
      game.requiredMetrics,
      unityWebglRequiredMetrics,
    ) &&
    hasFormalPublishMetadata(game, ["camera_capture"])
  );
}

export function isCognitiveWebGameReady(game: GameContent) {
  return (
    game.status === "active" &&
    game.runtimeType === "cognitive_web" &&
    game.buildStatus === "released" &&
    game.releaseChannel === "production" &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0" &&
    game.supportsCamera === false &&
    (game.supportedInputModes.includes("touch") ||
      game.supportedInputModes.includes("keyboard")) &&
    cognitiveWebRequiredMetrics.every((metricType) =>
      requiredMetricsInclude(game.requiredMetrics, metricType),
    )
  );
}

export function isBrowserPoseGameReady(game: GameContent) {
  return (
    game.status === "active" &&
    game.runtimeType === "browser_pose_canvas" &&
    game.buildStatus === "released" &&
    game.releaseChannel === "production" &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0" &&
    game.supportsCamera === true &&
    game.supportedInputModes.length === 1 &&
    game.supportedInputModes[0] === "camera_pose" &&
    requiredMetricsExactlyMatchContract(
      game.requiredMetrics,
      browserPoseRequiredMetricContract,
    ) &&
    hasFormalPublishMetadata(game, ["camera_capture"])
  );
}

export type FormalRuntimeCameraConfiguration =
  | { valid: true; requiresCamera: boolean }
  | { valid: false; requiresCamera: false; message: string };

export type TrainingPrepCameraRequirement =
  | { ready: true; requiresCameraCheck: boolean }
  | { ready: false; reason: string };

export function resolveFormalRuntimeCameraConfiguration(game: {
  runtimeType: FormalTrainingRuntime;
  supportsCamera: boolean;
  supportedInputModes: string[];
  requiredPermissions?: string[] | null;
}): FormalRuntimeCameraConfiguration {
  if (game.runtimeType === "browser_pose_canvas") {
    if (
      game.supportsCamera === true &&
      game.supportedInputModes.includes("camera_pose")
    ) {
      return { valid: true, requiresCamera: true };
    }
    return {
      valid: false,
      requiresCamera: false,
      message: "浏览器体感训练缺少明确摄像头配置，不能开始训练。",
    };
  }

  if (game.runtimeType === "unity_webgl") {
    const declaresCamera =
      game.supportsCamera === true ||
      Boolean(game.requiredPermissions?.includes("camera_capture"));
    if (declaresCamera) {
      if (!game.supportedInputModes.includes("camera_pose")) {
        return {
          valid: false,
          requiresCamera: false,
          message:
            "Unity 训练摄像头配置缺少 camera_pose 输入方式，不能开始训练。",
        };
      }
      return { valid: true, requiresCamera: true };
    }
    if (
      game.supportsCamera === false &&
      !game.requiredPermissions?.includes("camera_capture")
    ) {
      return { valid: true, requiresCamera: false };
    }
    return {
      valid: false,
      requiresCamera: false,
      message: "Unity 训练缺少明确摄像头正式配置，不能开始训练。",
    };
  }

  if (game.runtimeType === "cognitive_web") {
    if (
      game.supportsCamera === false &&
      !game.supportedInputModes.includes("camera_pose") &&
      !game.requiredPermissions?.includes("camera_capture")
    ) {
      return { valid: true, requiresCamera: false };
    }
    return {
      valid: false,
      requiresCamera: false,
      message: "认知训练不能声明摄像头要求。",
    };
  }

  return {
    valid: false,
    requiresCamera: false,
    message: "不支持的训练运行方式，不能开始训练。",
  };
}

export function trainingRuntimeRequiresCamera(
  game: GameContent | undefined,
): boolean {
  if (!game) {
    throw new Error("训练内容缺失，不能判断摄像头要求。");
  }
  const configuration = resolveFormalRuntimeCameraConfiguration(game);
  if (!configuration.valid) {
    throw new Error(configuration.message);
  }
  return configuration.requiresCamera;
}

export function resolveTrainingPrepCameraRequirement(
  game: GameContent | undefined,
): TrainingPrepCameraRequirement {
  if (!game) {
    return { ready: false, reason: "请先选择训练项目。" };
  }
  if (!isGameReadyForTraining(game)) {
    return { ready: false, reason: "训练内容尚未完成正式配置。" };
  }
  const configuration = resolveFormalRuntimeCameraConfiguration(game);
  if (!configuration.valid) {
    return { ready: false, reason: configuration.message };
  }
  return {
    ready: true,
    requiresCameraCheck: configuration.requiresCamera,
  };
}

export function requiredMetricsInclude(value: unknown, metricType: string) {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        isPlainObject(item) &&
        typeof item.metricType === "string" &&
        item.metricType === metricType,
    )
  );
}

function requiredMetricsExactlyMatch(
  value: unknown,
  expectedMetricTypes: readonly string[],
) {
  if (!Array.isArray(value) || value.length !== expectedMetricTypes.length) {
    return false;
  }
  const metricTypes = value.map((item) =>
    isPlainObject(item) && typeof item.metricType === "string"
      ? item.metricType
      : undefined,
  );
  if (metricTypes.some((metricType) => metricType === undefined)) {
    return false;
  }
  const distinctMetricTypes = new Set(metricTypes);
  return (
    distinctMetricTypes.size === expectedMetricTypes.length &&
    expectedMetricTypes.every((metricType) =>
      distinctMetricTypes.has(metricType),
    )
  );
}

function requiredMetricsExactlyMatchContract(
  value: unknown,
  expected: ReadonlyArray<{
    metricType: string;
    unit: string;
    min: number;
    max?: number;
  }>,
) {
  if (!Array.isArray(value) || value.length !== expected.length) {
    return false;
  }
  const metricsByType = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.metricType !== "string") {
      return false;
    }
    if (metricsByType.has(item.metricType)) return false;
    metricsByType.set(item.metricType, item);
  }
  return expected.every((contract) => {
    const metric = metricsByType.get(contract.metricType);
    return (
      metric?.unit === contract.unit &&
      metric.min === contract.min &&
      metric.max === contract.max
    );
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasFormalPublishMetadata(
  game: GameContent,
  expectedRequiredPermissions: string[],
) {
  return (
    isPlainObject(game.difficultyPolicy) &&
    isPlainObject(game.resultSchema) &&
    Array.isArray(game.dynamicDifficultyTriggers) &&
    game.dynamicDifficultyTriggers.length > 0 &&
    game.dynamicDifficultyTriggers.every((trigger) =>
      dynamicDifficultyTriggerReasons.includes(
        trigger as (typeof dynamicDifficultyTriggerReasons)[number],
      ),
    ) &&
    Array.isArray(game.requiredPermissions) &&
    game.requiredPermissions.length === expectedRequiredPermissions.length &&
    expectedRequiredPermissions.every((permission) =>
      game.requiredPermissions?.includes(permission),
    ) &&
    game.publishedStatus === "published"
  );
}
