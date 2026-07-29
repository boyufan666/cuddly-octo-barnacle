export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

export function readManifestString(value: unknown, fieldName: string) {
  return readRequiredText(value, `Unity 资源清单缺少 ${fieldName}。`);
}

export function readRequiredFiniteNumber(value: unknown, message: string) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(message);
  }
  return numberValue;
}

export function readUnityRuntimeMinConfidence(snapshot: unknown) {
  if (!isPlainObject(snapshot)) {
    throw new Error("训练会话缺少 Unity 动作置信度门禁，不能启动正式训练。");
  }
  const minConfidence = snapshot.minConfidence;
  if (typeof minConfidence !== "number" || !Number.isFinite(minConfidence)) {
    throw new Error(
      "训练会话 Unity 动作置信度门禁 minConfidence 必须是有效数值。",
    );
  }
  if (minConfidence <= 0 || minConfidence > 1) {
    throw new Error(
      "训练会话 Unity 动作置信度门禁 minConfidence 必须大于 0 且不大于 1。",
    );
  }
  return minConfidence;
}

function readCanonicalUtcIso(value: unknown, message: string) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(message);
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(message);
  }
  return value;
}

export function readUnityRuntimeClientStartedAt(
  snapshot: unknown,
  trainingSessionClientStartedAt: unknown,
) {
  if (!isPlainObject(snapshot)) {
    throw new Error(
      "训练会话缺少服务端冻结的 clientStartedAt，不能启动正式 Unity 训练。",
    );
  }
  const snapshotClientStartedAt = readCanonicalUtcIso(
    snapshot.clientStartedAt,
    "训练会话 runtimeConfigSnapshot.clientStartedAt 必须是精确 canonical UTC ISO 时间。",
  );
  const sessionClientStartedAt = readCanonicalUtcIso(
    trainingSessionClientStartedAt,
    "训练会话 clientStartedAt 必须是精确 canonical UTC ISO 时间。",
  );
  if (snapshotClientStartedAt !== sessionClientStartedAt) {
    throw new Error(
      "训练会话服务端冻结 clientStartedAt 与会话开始时间不一致，不能启动正式 Unity 训练。",
    );
  }
  return snapshotClientStartedAt;
}

export function readTrainingRuntimeEvidenceContext(snapshot: unknown): {
  approvedPlanItemId: string;
  assessmentSourceId: string;
  startingLevelSource: "clinician_approved_plan";
  startingDifficultyLevel: number;
} {
  if (!isPlainObject(snapshot)) {
    throw new Error("训练会话缺少已批准评估上下文，不能启动正式训练。");
  }
  const approvedPlanItemId = readRequiredText(
    snapshot.approvedPlanItemId,
    "训练会话缺少已批准方案项目，不能启动正式训练。",
  );
  const assessmentSourceId = readRequiredText(
    snapshot.assessmentSourceId,
    "训练会话缺少已批准评估来源，不能启动正式训练。",
  );
  const startingLevelSource = readRequiredText(
    snapshot.startingLevelSource,
    "训练会话缺少起始等级来源，不能启动正式训练。",
  );
  if (startingLevelSource !== "clinician_approved_plan") {
    throw new Error("训练会话起始等级来源必须来自医师已批准方案。");
  }
  const startingDifficultyLevel = readRequiredFiniteNumber(
    snapshot.startingDifficultyLevel,
    "训练会话缺少起始难度等级，不能启动正式训练。",
  );
  if (
    !Number.isInteger(startingDifficultyLevel) ||
    startingDifficultyLevel < 1 ||
    startingDifficultyLevel > 3
  ) {
    throw new Error("训练会话起始难度等级必须是 1 到 3 的整数。");
  }
  return {
    approvedPlanItemId,
    assessmentSourceId,
    startingLevelSource,
    startingDifficultyLevel,
  };
}
