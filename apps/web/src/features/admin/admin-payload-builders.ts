import type {
  CollectionProtocolGovernanceFormState,
  CollectionConditionGovernanceFormState,
} from "./CollectionConditionGovernance";
import type {
  CaregiverAccountFormState,
  DataExportFormState,
  GameContentCreateFormState,
  UnityBuildFormState,
} from "./admin-governance-forms";
import { browserPoseGameRequiredMetrics } from "@/lib/browser-pose-game-library";
import { dynamicDifficultyTriggerReasons } from "@/lib/dynamic-difficulty-evidence";
import {
  cognitiveWebRequiredMetrics,
  requiredMetricsInclude,
  resolveFormalRuntimeCameraConfiguration,
} from "@/lib/formal-training-content-readiness";
import type {
  CreateCaregiverAccountRequest,
  CreateCollectionConditionRequest,
  CreateCollectionProtocolRequest,
  CreateGameContentRequest,
  DataExportRequest,
  FormalTrainingRuntime,
  GameContent,
  UpdateUnityBuildRequest,
} from "@/types/api";

const formalDynamicDifficultyTriggers = [...dynamicDifficultyTriggerReasons];

export function buildUnityBuildForm(game: GameContent): UnityBuildFormState {
  if (!isBuildStatus(game.buildStatus)) {
    throw new Error("训练资源状态无效，不能编辑训练资源配置。");
  }
  if (!isReleaseChannel(game.releaseChannel)) {
    throw new Error("训练资源发布通道无效，不能编辑训练资源配置。");
  }
  return {
    gameContentId: game.id,
    manifestUrl: game.manifestUrl ?? "",
    buildBaseUrl: game.buildBaseUrl ?? "",
    gameVersion: game.gameVersion ?? "",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: game.buildStatus,
    releaseChannel: game.releaseChannel,
    supportsCamera: game.supportsCamera,
    supportsMicrophone: game.supportsMicrophone,
    supportedInputModesText: game.supportedInputModes.join(", "),
    requiredMetricsText: JSON.stringify(game.requiredMetrics ?? [], null, 2),
  };
}

export function buildGameContentCreatePayload(
  form: GameContentCreateFormState,
): CreateGameContentRequest {
  const code = form.code.trim();
  if (!/^[a-z0-9_-]{2,64}$/.test(code)) {
    throw new Error(
      "训练内容编码只能包含小写字母、数字、下划线或短横线，长度 2 到 64 位。",
    );
  }
  const name = form.name.trim();
  if (!name) {
    throw new Error("游戏名称不能为空。");
  }
  const isInlinePublishedRuntime =
    form.runtimeType === "browser_pose_canvas" ||
    form.runtimeType === "cognitive_web";
  const gameVersion = form.gameVersion.trim();
  if (isInlinePublishedRuntime && !gameVersion) {
    throw new Error("训练版本号不能为空。");
  }
  if (
    gameVersion &&
    !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(gameVersion)
  ) {
    throw new Error("训练版本号必须是语义化版本，例如 1.0.0。");
  }
  const trainingTargets = parseCommaSeparatedList(
    form.trainingTargetsText,
    "训练目标至少需要填写一项。",
  );
  const tags = parseCommaSeparatedList(
    form.tagsText,
    "匹配标签至少需要填写一项。",
  );
  const defaultDuration = parseRequiredNumber(
    form.defaultDuration,
    "默认训练时长",
  );
  if (!Number.isInteger(defaultDuration) || defaultDuration < 1) {
    throw new Error("默认训练时长必须是正整数分钟。");
  }
  const defaultDifficulty = form.defaultDifficulty.trim();
  if (!defaultDifficulty) {
    throw new Error("默认难度不能为空。");
  }
  const supportsCamera = parseRequiredBoolean(
    form.supportsCamera,
    "请选择游戏是否需要摄像头。",
  );
  const supportsMicrophone = parseRequiredBoolean(
    form.supportsMicrophone,
    "请选择游戏是否需要麦克风。",
  );
  const supportedInputModes = parseCommaSeparatedList(
    form.supportedInputModesText,
    "训练采集方式至少需要填写一项。",
  );
  if (supportsCamera && !supportedInputModes.includes("camera_pose")) {
    throw new Error("需要摄像头的游戏必须包含摄像头体感采集方式。");
  }
  const requiredMetrics = parseJson(
    form.requiredMetricsText,
    "训练结果指标配置必须是结构化数组。",
  );
  if (!Array.isArray(requiredMetrics)) {
    throw new Error("训练结果指标配置必须是结构化数组。");
  }
  if (
    form.runtimeType === "browser_pose_canvas" &&
    !browserPoseGameRequiredMetrics.every((metricType) =>
      requiredMetricsInclude(requiredMetrics, metricType),
    )
  ) {
    throw new Error(
      "浏览器体感训练必须包含反应时间、命中率、姿态可见度、上肢动作准确率四项指标。",
    );
  }
  if (
    form.runtimeType === "cognitive_web" &&
    !cognitiveWebRequiredMetrics.every((metricType) =>
      requiredMetricsInclude(requiredMetrics, metricType),
    )
  ) {
    throw new Error("认知训练必须包含序列回忆率和路径完成率两项指标。");
  }

  const formalPublishMetadata = isInlinePublishedRuntime
    ? {
        difficultyPolicy: buildFormalGameDifficultyPolicy(form.runtimeType),
        dynamicDifficultyTriggers: formalDynamicDifficultyTriggers,
        requiredPermissions: buildFormalGameRequiredPermissions(
          form.runtimeType,
        ),
        resultSchema: buildFormalGameResultSchema(
          form.runtimeType,
          requiredMetrics,
        ),
        publishedStatus: "published" as const,
      }
    : {};

  return {
    code,
    name,
    runtimeType: form.runtimeType,
    ...(gameVersion ? { gameVersion } : {}),
    trainingTargets,
    tags,
    defaultDuration,
    defaultDifficulty,
    supportsCamera,
    supportsMicrophone,
    supportedInputModes,
    requiredMetrics,
    ...formalPublishMetadata,
  };
}

export function buildCreateCaregiverAccountPayload(
  form: CaregiverAccountFormState,
): CreateCaregiverAccountRequest {
  const payload: CreateCaregiverAccountRequest = {
    account: form.account.trim(),
    initialPassword: form.initialPassword,
    displayName: form.displayName.trim(),
  };
  const mobilePhone = form.mobilePhone.trim();
  if (mobilePhone) {
    payload.mobilePhone = mobilePhone;
  }
  return payload;
}

export function buildFormalGameDifficultyPolicy(
  runtimeType: FormalTrainingRuntime,
) {
  return {
    source: "clinician_approved_plan",
    startingLevel: "from_latest_approved_assessment_and_plan_item",
    runtimeType,
    levels: [
      { level: 1, speed: 0.8, complexityLevel: 1 },
      { level: 2, speed: 1, complexityLevel: 2 },
      { level: 3, speed: 1.2, complexityLevel: 3 },
    ],
    safetyLimits: {
      minLevel: 1,
      maxLevel: 3,
      unchangedRequiresSafetyClampReason: true,
    },
  };
}

export function buildFormalGameRequiredPermissions(
  runtimeType: FormalTrainingRuntime,
) {
  if (runtimeType === "unity_webgl") return ["camera_capture"];
  if (runtimeType === "browser_pose_canvas") return ["camera_capture"];
  if (runtimeType === "cognitive_web") return [];
  throw new Error("只有平台内置训练内容可以直接发布。");
}

export function buildFormalGameResultSchema(
  runtimeType: FormalTrainingRuntime,
  requiredMetrics: unknown[],
) {
  return {
    schemaVersion: "1.0.0",
    runtimeType,
    requiredMetrics: requiredMetrics
      .map((metric) =>
        metric && typeof metric === "object" && "metricType" in metric
          ? String((metric as { metricType?: unknown }).metricType ?? "").trim()
          : "",
      )
      .filter(Boolean),
    requiredEvidence: [
      "dynamicDifficultyEvidence",
      "runtimeFrameId",
      "runtimeWindowId",
      "safetyClampReasonWhenUnchanged",
    ],
    dynamicDifficultyEvidence: "required",
  };
}

export function assertFormalRuntimeCameraConfiguration(game: {
  runtimeType: FormalTrainingRuntime;
  supportsCamera: boolean;
  supportedInputModes: string[];
  requiredPermissions?: string[] | null;
}) {
  const configuration = resolveFormalRuntimeCameraConfiguration(game);
  if (!configuration.valid) {
    throw new Error(configuration.message);
  }
  return configuration.requiresCamera;
}

export function buildUnityBuildPayload(
  form: UnityBuildFormState,
  canPublishGames: boolean,
): UpdateUnityBuildRequest {
  if (!form.gameContentId) {
    throw new Error("请先选择训练内容。");
  }
  if (form.buildStatus === "released" && !canPublishGames) {
    throw new Error("当前账号没有发布正式训练资源的权限。");
  }
  const supportedInputModes = parseCommaSeparatedList(
    form.supportedInputModesText,
    "训练采集方式至少需要填写一项。",
  );
  const requiredMetrics = parseJson(
    form.requiredMetricsText,
    "训练结果指标配置必须是结构化数组。",
  );
  if (!Array.isArray(requiredMetrics)) {
    throw new Error("训练结果指标配置必须是结构化数组。");
  }
  if (form.buildStatus === "released") {
    assertFormalRuntimeCameraConfiguration({
      runtimeType: "unity_webgl",
      supportsCamera: form.supportsCamera,
      supportedInputModes,
      requiredPermissions: buildFormalGameRequiredPermissions("unity_webgl"),
    });
  }
  const formalPublishMetadata =
    form.buildStatus === "released"
      ? {
          difficultyPolicy: buildFormalGameDifficultyPolicy("unity_webgl"),
          dynamicDifficultyTriggers: formalDynamicDifficultyTriggers,
          requiredPermissions:
            buildFormalGameRequiredPermissions("unity_webgl"),
          resultSchema: buildFormalGameResultSchema(
            "unity_webgl",
            requiredMetrics,
          ),
          publishedStatus: "published" as const,
        }
      : {};

  return {
    manifestUrl: form.manifestUrl.trim(),
    buildBaseUrl: form.buildBaseUrl.trim(),
    gameVersion: form.gameVersion.trim(),
    bridgeProtocolVersion: "1.0.0",
    buildStatus: form.buildStatus,
    releaseChannel: form.releaseChannel,
    supportsCamera: form.supportsCamera,
    supportsMicrophone: form.supportsMicrophone,
    supportedInputModes,
    requiredMetrics,
    ...formalPublishMetadata,
  };
}

export function buildCollectionConditionPayload(
  form: CollectionConditionGovernanceFormState,
): CreateCollectionConditionRequest {
  const code = parseCollectionCode(form.code, "采集条件编码");
  const name = parseRequiredTrimmedText(form.name, "采集条件名称");
  const description = form.description.trim();

  return {
    code,
    name,
    ...(description ? { description } : {}),
    environment: parseJsonObject(
      form.environmentText,
      "采集环境必须是结构化对象。",
    ),
    deviceRequirements: parseJsonObject(
      form.deviceRequirementsText,
      "设备要求必须是结构化对象。",
    ),
    taskParameters: parseJsonObject(
      form.taskParametersText,
      "任务参数必须是结构化对象。",
    ),
    qualityRules: parseJsonObject(
      form.qualityRulesText,
      "质量规则必须是结构化对象。",
    ),
  };
}

export function buildCollectionProtocolPayload(
  form: CollectionProtocolGovernanceFormState,
): CreateCollectionProtocolRequest {
  const conditionId = parseRequiredTrimmedText(form.conditionId, "采集条件");
  const gameContentId = parseRequiredTrimmedText(
    form.gameContentId,
    "训练内容",
  );
  const requiredInputModes = parseCommaSeparatedList(
    form.requiredInputModesText,
    "采集输入方式至少需要填写一项。",
  );
  const requiredMetrics = parseJson(
    form.requiredMetricsText,
    "要求指标必须是结构化数组。",
  );
  if (!Array.isArray(requiredMetrics) || !requiredMetrics.length) {
    throw new Error("要求指标必须是非空结构化数组。");
  }
  if (!form.requiredConsentTypes.length) {
    throw new Error("采集协议至少需要选择一项授权类型。");
  }
  const qualityGate = parseCollectionProtocolQualityGate(
    form.runtimeType,
    form.qualityGateText,
  );

  return {
    conditionId,
    gameContentId,
    code: parseCollectionCode(form.code, "采集协议编码"),
    name: parseRequiredTrimmedText(form.name, "采集协议名称"),
    version: parseSemanticVersion(form.version, "采集协议版本"),
    runtimeType: form.runtimeType,
    requiredConsentTypes: form.requiredConsentTypes,
    requiredInputModes,
    requiredMetrics,
    conditionRules: parseJsonObject(
      form.conditionRulesText,
      "条件规则必须是结构化对象。",
    ),
    samplingConfig: parseJsonObject(
      form.samplingConfigText,
      "采样配置必须是结构化对象。",
    ),
    qualityGate,
  };
}

export function buildDataExportPayload(
  form: DataExportFormState,
): DataExportRequest {
  const reason = form.reason.trim();
  if (!reason) {
    throw new Error("请填写导出原因，便于审计追溯。");
  }
  const limit = parseOptionalInteger(form.limit, "导出条数");
  if (limit !== undefined && (limit < 1 || limit > 500)) {
    throw new Error("导出条数必须是 1 到 500 的整数。");
  }
  const dateFrom = parseOptionalDate(form.dateFrom, "开始时间");
  const dateTo = parseOptionalDate(form.dateTo, "结束时间");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new Error("导出开始时间不能晚于结束时间。");
  }

  return {
    dataset: form.dataset,
    format: "csv",
    reason,
    ...(dateFrom ? { dateFrom: dateFrom.toISOString() } : {}),
    ...(dateTo ? { dateTo: dateTo.toISOString() } : {}),
    ...(form.patientId.trim() ? { patientId: form.patientId.trim() } : {}),
    ...(limit === undefined ? {} : { limit }),
  };
}

export function validateAuditLogFilters(filters: {
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  if (
    filters.limit !== undefined &&
    (!Number.isInteger(filters.limit) ||
      filters.limit < 1 ||
      filters.limit > 200)
  ) {
    throw new Error("审计日志返回条数必须是 1 到 200 的整数。");
  }

  const dateFrom = parseOptionalDate(filters.dateFrom, "开始时间");
  const dateTo = parseOptionalDate(filters.dateTo, "结束时间");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new Error("开始时间不能晚于结束时间。");
  }
}

function parseCollectionCode(value: string, label: string) {
  const code = parseRequiredTrimmedText(value, label);
  if (!/^[a-z0-9_-]{2,64}$/.test(code)) {
    throw new Error(
      `${label}只能包含小写字母、数字、下划线或短横线，长度 2 到 64 位。`,
    );
  }
  return code;
}

function parseRequiredTrimmedText(value: string, label: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${label}不能为空。`);
  }
  return text;
}

function parseSemanticVersion(value: string, label: string) {
  const version = parseRequiredTrimmedText(value, label);
  if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error(`${label}必须是语义化版本，例如 1.0.0。`);
  }
  return version;
}

function isBuildStatus(
  value: string,
): value is UpdateUnityBuildRequest["buildStatus"] {
  return (
    value === "pending_assets" ||
    value === "validating" ||
    value === "released" ||
    value === "rejected"
  );
}

function isReleaseChannel(
  value: string,
): value is UpdateUnityBuildRequest["releaseChannel"] {
  return (
    value === "development" || value === "staging" || value === "production"
  );
}

function parseCommaSeparatedList(value: string, message: string) {
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!list.length) {
    throw new Error(message);
  }
  return Array.from(new Set(list));
}

function parseRequiredBoolean(value: "" | "true" | "false", message: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(message);
}

function parseJsonObject(
  value: string,
  message: string,
): Record<string, unknown> {
  const parsed = parseJson(value, message);
  if (!isPlainObject(parsed)) {
    throw new Error(message);
  }
  return parsed;
}

function parseCollectionProtocolQualityGate(
  runtimeType: FormalTrainingRuntime,
  value: string,
): Record<string, unknown> {
  const qualityGate = parseJsonObject(value, "质量门禁必须是结构化对象。");
  if (runtimeType !== "unity_webgl") {
    return qualityGate;
  }

  const keys = Object.keys(qualityGate);
  if (keys.length !== 1 || keys[0] !== "minConfidence") {
    throw new Error(
      "Unity WebGL 质量门禁必须且只能配置数值字段 minConfidence。",
    );
  }
  const minConfidence = qualityGate.minConfidence;
  if (
    typeof minConfidence !== "number" ||
    !Number.isFinite(minConfidence) ||
    minConfidence <= 0 ||
    minConfidence > 1
  ) {
    throw new Error(
      "Unity WebGL 质量门禁 minConfidence 必须大于 0 且不大于 1。",
    );
  }
  return { minConfidence };
}

function parseJson(value: string, message: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(message);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(message);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRequiredNumber(value: string, label: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} 需要填写有效数字。`);
  }
  return numberValue;
}

function parseOptionalInteger(value: string, label: string) {
  if (!value.trim()) return undefined;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label}必须是整数。`);
  }
  return numberValue;
}

function parseOptionalDate(value: string | undefined, label: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label}格式无效。`);
  }
  return date;
}
