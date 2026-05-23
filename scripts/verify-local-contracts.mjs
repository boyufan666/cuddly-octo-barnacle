#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const projectEnv = readProjectEnv(resolve(rootDir, ".env"));
const apiBaseUrl = readRequiredConfig(projectEnv, "NEXT_PUBLIC_API_BASE_URL");
const databaseUrl = readRequiredConfig(projectEnv, "DATABASE_URL");

process.env.DATABASE_URL = databaseUrl;

const requireFromDbPackage = createRequire(
  resolve(rootDir, "packages/db/package.json"),
);
const { PrismaClient } = requireFromDbPackage("@prisma/client");
const prisma = new PrismaClient();

const seedPassword = "253913";
const patientAccount = "patient001";
const adminAccount = "admin";
const runKey = `contract_${Date.now()}_${randomUUID().slice(0, 8)}`;

const created = {
  sessionId: undefined,
};

console.log("接口契约验收：本脚本验证本地 API 真实写入、运行时约束和清理流程。");
console.log("注意：本脚本不进行摄像头实采，也不会生成姿态帧或伪造训练过程。");

try {
  await step("健康检查 /health", async () => {
    const health = await request("/health");
    assert(health.status === "ok", "健康检查 status 应为 ok。");
    assert(
      health.service === "rehab-platform-api",
      "健康检查 service 应为 rehab-platform-api。",
    );
  });

  const patientLogin = await step("患者账号登录", async () => {
    const loginResponse = await login(patientAccount);
    assert(loginResponse.accessToken, "患者登录未返回 accessToken。");
    assert(
      loginResponse.context?.primaryRole === "patient",
      "patient001 的 primaryRole 应为 patient。",
    );
    assert(
      loginResponse.context?.patientIds?.length > 0,
      "patient001 未绑定 patientId，请先执行 seed。",
    );
    return loginResponse;
  });

  const patientId = patientLogin.context.patientIds[0];
  const adminLogin = await step("管理员账号登录", async () => {
    const loginResponse = await login(adminAccount);
    assert(loginResponse.accessToken, "管理员登录未返回 accessToken。");
    assert(
      loginResponse.context?.adminPermissions?.includes("audit.read"),
      "admin 缺少 audit.read 权限。",
    );
    return loginResponse;
  });

  const { patient, currentPlan, planItem, game } = await step(
    "读取患者当前计划和 Browser Pose Game",
    async () => {
      const patientProfile = await request(`/patients/${patientId}`, {
        token: patientLogin.accessToken,
      });
      const activePlan = patientProfile.rehabPlans?.find(
        (plan) => plan.isCurrent && plan.status === "active",
      );
      assert(activePlan, "患者没有当前 active 康复计划，请先执行 seed。");
      const browserPoseItem = activePlan.items?.find((item) => {
        const content = item.gameContent;
        return (
          content?.code === "pose_reaction_hit" &&
          content.runtimeType === "browser_pose_game" &&
          content.status === "active" &&
          content.buildStatus === "released"
        );
      });
      assert(
        browserPoseItem,
        "当前计划中没有已发布的 pose_reaction_hit browser_pose_game 项。",
      );
      const content = browserPoseItem.gameContent;
      const metricTypes = new Set(
        (content.requiredMetrics ?? []).map((metric) => metric.metricType),
      );
      for (const metricType of [
        "reaction_time_ms",
        "target_hit_rate",
        "pose_visibility_avg",
        "arm_raise_accuracy",
      ]) {
        assert(
          metricTypes.has(metricType),
          `游戏 requiredMetrics 缺少 ${metricType}。`,
        );
      }
      return {
        patient: patientProfile,
        currentPlan: activePlan,
        planItem: browserPoseItem,
        game: content,
      };
    },
  );

  const session = await step("创建正式训练会话", async () => {
    const startedAt = new Date().toISOString();
    const response = await request("/training-sessions", {
      method: "POST",
      token: patientLogin.accessToken,
      body: {
        patientId: patient.id,
        rehabPlanId: currentPlan.id,
        planItemId: planItem.id,
        gameContentId: game.id,
        idempotencyKey: runKey,
        gameRunId: `${runKey}_browser_pose`,
        deviceCode: `${runKey}_camera_device`,
        calibrationStatus: "checked",
        clientStartedAt: startedAt,
      },
    });
    created.sessionId = response.id;
    assert(response.id, "创建训练会话未返回 id。");
    assert(
      response.sessionStatus === "in_progress",
      "训练会话状态应为 in_progress。",
    );
    assert(
      response.gameRunId === `${runKey}_browser_pose`,
      "训练会话 gameRunId 与请求不一致。",
    );
    assert(
      response.runtimeConfigSnapshot?.runtimeType === "browser_pose_game",
      "runtimeConfigSnapshot.runtimeType 应为 browser_pose_game。",
    );
    assert(
      response.bridgeProtocolVersion === game.bridgeProtocolVersion,
      "训练会话 bridgeProtocolVersion 与游戏配置不一致。",
    );
    return response;
  });

  await step("拒绝 source/runtime mismatch", async () => {
    const mismatch = await request(`/training-sessions/${session.id}/results`, {
      method: "POST",
      token: patientLogin.accessToken,
      body: buildTrainingResultPayload({
        source: "unity_webgl",
        session,
        game,
      }),
      expectedStatus: 400,
    });
    assert(
      typeof mismatch.message === "string" && mismatch.message.length > 0,
      "运行时不匹配时应返回明确错误消息。",
    );
  });

  const result = await step("提交合法 Browser Pose 结构化训练结果", async () => {
    const response = await request(`/training-sessions/${session.id}/results`, {
      method: "POST",
      token: patientLogin.accessToken,
      body: buildTrainingResultPayload({
        source: "browser_pose_game",
        session,
        game,
      }),
    });
    assert(response.source === "browser_pose_game", "结果 source 不正确。");
    assert(response.gameRunId === session.gameRunId, "结果 gameRunId 不正确。");
    assert(response.gameVersion === game.gameVersion, "结果 gameVersion 不正确。");
    assert(
      response.bridgeProtocolVersion === game.bridgeProtocolVersion,
      "结果 bridgeProtocolVersion 不正确。",
    );
    assert(response.qualityFlag === "valid", "合法结果 qualityFlag 应为 valid。");
    assert(response.abnormalFlag === false, "合法结果 abnormalFlag 应为 false。");
    return response;
  });

  await step("训练记录可查询且动作指标已入库", async () => {
    const records = await request(`/patients/${patient.id}/training-records`, {
      token: patientLogin.accessToken,
    });
    const persistedSession = records.sessions?.find((item) => item.id === session.id);
    assert(persistedSession, "训练记录中未找到刚提交的 session。");
    assert(
      persistedSession.sessionStatus === "completed",
      "提交合法结果后 sessionStatus 应为 completed。",
    );
    assert(persistedSession.result?.id === result.id, "训练记录 result 未关联。");
    assert(
      persistedSession.motionMetrics?.length === 4,
      "训练记录应包含 4 条动作指标。",
    );
    assert(
      records.summary.completedSessions >= 1,
      "训练记录 summary.completedSessions 应包含本次完成训练。",
    );
  });

  await step("审计日志记录训练开始与结果提交", async () => {
    const startLogs = await request(
      `/admin/audit-logs?${new URLSearchParams({
        action: "training_session.start",
        targetType: "training_session",
        targetId: session.id,
        result: "success",
        limit: "10",
      })}`,
      { token: adminLogin.accessToken },
    );
    assert(startLogs.length > 0, "未查询到 training_session.start 审计日志。");

    const submitLogs = await request(
      `/admin/audit-logs?${new URLSearchParams({
        action: "training_result.submit",
        targetType: "training_session",
        targetId: session.id,
        result: "success",
        limit: "10",
      })}`,
      { token: adminLogin.accessToken },
    );
    assert(submitLogs.length > 0, "未查询到 training_result.submit 审计日志。");
  });

  console.log("接口契约验收通过。");
} finally {
  await cleanupCreatedData();
  await prisma.$disconnect();
}

async function login(account) {
  return request("/auth/login", {
    method: "POST",
    body: { account, password: seedPassword },
  });
}

function buildTrainingResultPayload({ source, session, game }) {
  const clientGeneratedAt = new Date().toISOString();
  const metricsSummary = {
    source,
    gameRunId: session.gameRunId,
    gameVersion: game.gameVersion,
    protocolVersion: session.bridgeProtocolVersion,
    clientGeneratedAt,
    rawPayloadHash: hashPayload({
      runKey,
      source,
      sessionId: session.id,
      clientGeneratedAt,
    }),
    contractVerification: true,
  };

  return {
    score: 88,
    completionRate: 0.86,
    durationSeconds: 120,
    reactionTimeMs: 820,
    motionAccuracy: 0.88,
    exerciseIntensity: "moderate",
    metricsSummary,
    motionMetrics: [
      metric("reaction_time_ms", 820, "ms", 36),
      metric("target_hit_rate", 0.86, "ratio", 36),
      metric("pose_visibility_avg", 0.92, "ratio", 360),
      metric("arm_raise_accuracy", 0.88, "ratio", 36),
    ],
  };
}

function metric(metricType, metricValue, unit, sampleCount) {
  return {
    metricType,
    metricValue,
    unit,
    confidence: 0.92,
    sampleCount,
    qualityFlag: "valid",
    windowStartedAt: new Date(Date.now() - 120_000).toISOString(),
    windowEndedAt: new Date().toISOString(),
    bodyPart: "upper_limb",
    rawSummary: {
      contractRunKey: runKey,
      captureNote: "API contract verification metric, not camera frame data.",
    },
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const body = await readResponseBody(response);
  const expectedStatus = options.expectedStatus;
  const statusMatches =
    expectedStatus === undefined
      ? response.ok
      : response.status === expectedStatus;

  if (!statusMatches) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${path}: ${JSON.stringify(
        body,
      )}`,
    );
  }

  return body;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function cleanupCreatedData() {
  if (!created.sessionId) return;
  await prisma.auditLog.deleteMany({
    where: { targetId: created.sessionId },
  });
  await prisma.motionMetric.deleteMany({
    where: { trainingSessionId: created.sessionId },
  });
  await prisma.trainingResult.deleteMany({
    where: { sessionId: created.sessionId },
  });
  await prisma.trainingSession.deleteMany({
    where: { id: created.sessionId },
  });
  const remaining = await prisma.trainingSession.count({
    where: { id: created.sessionId },
  });
  assert(remaining === 0, "接口契约验收数据清理失败。");
  console.log("已清理本次接口契约验收数据。");
}

async function step(label, action) {
  process.stdout.write(`- ${label} ... `);
  const result = await action();
  console.log("通过");
  return result;
}

function hashPayload(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readProjectEnv(path) {
  const content = readFileSync(path, "utf8");
  const entries = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    entries[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return entries;
}

function readRequiredConfig(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`缺少 ${key}，请先配置项目根目录 .env。`);
  }
  return value;
}
