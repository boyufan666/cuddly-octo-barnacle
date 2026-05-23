#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";

const apiBaseUrl = requiredEnv("TRIAL_VERIFY_API_BASE_URL").replace(/\/$/, "");
const adminAccount = requiredEnv("TRIAL_VERIFY_ADMIN_ACCOUNT");
const adminPassword = requiredEnv("TRIAL_VERIFY_ADMIN_PASSWORD");
const doctorAccount = requiredEnv("TRIAL_VERIFY_DOCTOR_ACCOUNT");
const doctorPassword = requiredEnv("TRIAL_VERIFY_DOCTOR_PASSWORD");
const patientAccount = requiredEnv("TRIAL_VERIFY_PATIENT_ACCOUNT");
const patientPassword = requiredEnv("TRIAL_VERIFY_PATIENT_PASSWORD");
const patientName = requiredEnv("TRIAL_VERIFY_PATIENT_NAME");
const patientGender = requiredEnv("TRIAL_VERIFY_PATIENT_GENDER");
const patientAge = integerEnv("TRIAL_VERIFY_PATIENT_AGE");
const assessmentTranscript = requiredEnv("TRIAL_VERIFY_ASSESSMENT_TRANSCRIPT");
const assessmentAnalysisSummary = requiredEnv(
  "TRIAL_VERIFY_ASSESSMENT_ANALYSIS_SUMMARY",
);
const gameCode = requiredEnv("TRIAL_VERIFY_GAME_CODE");
const gameName = requiredEnv("TRIAL_VERIFY_GAME_NAME");
const gameVersion = requiredEnv("TRIAL_VERIFY_GAME_VERSION");
const gameTrainingTargets = csvEnv("TRIAL_VERIFY_GAME_TRAINING_TARGETS");
const gameTags = csvEnv("TRIAL_VERIFY_GAME_TAGS");
const gameDefaultDuration = integerEnv("TRIAL_VERIFY_GAME_DEFAULT_DURATION");
const gameDefaultDifficulty = requiredEnv("TRIAL_VERIFY_GAME_DEFAULT_DIFFICULTY");
const runKey = `trial_${Date.now()}_${randomUUID().slice(0, 8)}`;
const consentVersion = "v1.2";

console.log("trial 空库闭环验收：通过真实 API 验证 seed-trial 后的最小业务路径。");
console.log("注意：本脚本不打印密码或 token，不依赖 patient001/admin 示例 seed 数据。");

await main();

async function main() {
  await step("健康检查 /health", async () => {
    const health = await request("/health");
    assert(health.status === "ok", "健康检查 status 应为 ok。");
    assert(
      health.service === "rehab-platform-api",
      "健康检查 service 应为 rehab-platform-api。",
    );
  });

  const adminLogin = await step("trial 管理员账号存在且可登录", async () => {
    const loginResponse = await login(adminAccount, adminPassword);
    assert(loginResponse.accessToken, "管理员登录未返回 accessToken。");
    assert(
      loginResponse.context?.adminPermissions?.includes("user.manage"),
      "trial 管理员缺少 user.manage 权限。",
    );
    assert(
      loginResponse.context?.adminPermissions?.includes("game.manage"),
      "trial 管理员缺少 game.manage 权限，不能创建正式训练内容。",
    );
    assert(
      loginResponse.context?.adminPermissions?.includes("game.publish"),
      "trial 管理员缺少 game.publish 权限，不能发布正式训练内容。",
    );
    return loginResponse;
  });

  const doctorLogin = await step("trial 医师账号存在且可登录", async () => {
    const loginResponse = await login(doctorAccount, doctorPassword);
    assert(loginResponse.accessToken, "医师登录未返回 accessToken。");
    assert(
      loginResponse.context?.primaryRole === "doctor",
      "trial 医师账号 primaryRole 应为 doctor。",
    );
    assert(
      loginResponse.context?.doctorIds?.length === 1,
      "trial 医师账号应绑定且仅绑定一个 doctor profile。",
    );
    return loginResponse;
  });

  const patient = await step("管理员按医师账号通过正式 API 创建患者", async () => {
    const response = await request("/patients", {
      method: "POST",
      token: adminLogin.accessToken,
      body: {
        account: patientAccount,
        initialPassword: patientPassword,
        name: patientName,
        gender: patientGender,
        age: patientAge,
        responsibleDoctorId: doctorAccount,
        healthMetrics: {
          source: "trial_empty_loop_acceptance",
          capturedBy: "admin_create_patient_api",
        },
      },
    });
    assert(response.id, "创建患者未返回 id。");
    assert(
      doctorLogin.context.doctorIds.includes(response.responsibleDoctorId),
      "患者 responsibleDoctorId 未解析到 trial 医师账号绑定的 doctor profile。",
    );
    return response;
  });

  const patientLogin = await step("新建患者账号可登录", async () => {
    const loginResponse = await login(patientAccount, patientPassword);
    assert(loginResponse.accessToken, "患者登录未返回 accessToken。");
    assert(
      loginResponse.context?.patientIds?.includes(patient.id),
      "患者登录上下文未包含刚创建的 patientId。",
    );
    return loginResponse;
  });

  await step("患者签署必要授权", async () => {
    for (const consentType of [
      "privacy_policy",
      "ai_processing",
      "camera_capture",
    ]) {
      const consent = await request("/consents", {
        method: "POST",
        token: patientLogin.accessToken,
        body: {
          patientId: patient.id,
          subjectUserId: patientLogin.user.id,
          consentType,
          consentVersion,
          evidenceSnapshot: {
            source: "trial_empty_loop_acceptance",
            signedAt: new Date().toISOString(),
            actorAccount: patientAccount,
          },
        },
      });
      assert(consent.id, `${consentType} 授权未返回 id。`);
      assert(consent.status === "granted", `${consentType} 授权状态应为 granted。`);
    }
  });

  const assessment = await step("录入真实结构化评估记录", async () => {
    const response = await request("/assessments", {
      method: "POST",
      token: doctorLogin.accessToken,
      body: {
        patientId: patient.id,
        assessmentType: "MMSE_CDR_AI_SUMMARY",
        scoreSummary: {
          mmse: numberEnv("TRIAL_VERIFY_ASSESSMENT_MMSE"),
          cdr: numberEnv("TRIAL_VERIFY_ASSESSMENT_CDR"),
          memory: numberEnv("TRIAL_VERIFY_ASSESSMENT_MEMORY"),
          orientation: numberEnv("TRIAL_VERIFY_ASSESSMENT_ORIENTATION"),
          executive: numberEnv("TRIAL_VERIFY_ASSESSMENT_EXECUTIVE"),
          language: numberEnv("TRIAL_VERIFY_ASSESSMENT_LANGUAGE"),
        },
        rawInputSummary: {
          source: "clinician_recorded_trial_assessment",
          transcript: assessmentTranscript,
          analysisSummary: assessmentAnalysisSummary,
          modelVersion: requiredEnv("TRIAL_VERIFY_ASSESSMENT_MODEL_VERSION"),
          confidence: numberEnv("TRIAL_VERIFY_ASSESSMENT_CONFIDENCE"),
        },
      },
    });
    assert(response.id, "评估记录未返回 id。");
    return response;
  });

  await step("评估记录可由医师查询", async () => {
    const assessments = await request(`/patients/${patient.id}/assessments`, {
      token: doctorLogin.accessToken,
    });
    assert(
      assessments.some((item) => item.id === assessment.id),
      "医师查询不到刚录入的评估记录。",
    );
  });

  const game = await step("管理员创建并发布 browser_pose_game 正式训练内容", async () => {
    const response = await request("/admin/game-contents", {
      method: "POST",
      token: adminLogin.accessToken,
      body: {
        code: gameCode,
        name: gameName,
        runtimeType: "browser_pose_game",
        gameVersion,
        trainingTargets: gameTrainingTargets,
        tags: gameTags,
        defaultDuration: gameDefaultDuration,
        defaultDifficulty: gameDefaultDifficulty,
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          requiredMetric("reaction_time_ms", "ms"),
          requiredMetric("target_hit_rate", "ratio"),
          requiredMetric("pose_visibility_avg", "ratio"),
          requiredMetric("arm_raise_accuracy", "ratio"),
        ],
      },
    });
    assert(response.id, "训练内容未返回 id。");
    assert(response.runtimeType === "browser_pose_game", "训练内容 runtimeType 不正确。");
    assert(response.status === "active", "browser_pose_game 创建后应为 active。");
    assert(response.buildStatus === "released", "browser_pose_game 创建后应为 released。");
    return response;
  });

  const recommendedPlan = await step("生成系统推荐康复方案", async () => {
    const response = await request("/rehab-plans/recommend", {
      method: "POST",
      token: doctorLogin.accessToken,
      body: { patientId: patient.id },
    });
    assert(response.id, "推荐方案未返回 id。");
    assert(response.status === "pending_confirm", "推荐方案状态应为 pending_confirm。");
    assert(
      response.items?.some((item) => item.gameContentId === game.id),
      "推荐方案未包含刚发布的 browser_pose_game。",
    );
    return response;
  });

  const confirmedPlan = await step("医师确认康复方案", async () => {
    const response = await request(`/rehab-plans/${recommendedPlan.id}/confirm`, {
      method: "PATCH",
      token: doctorLogin.accessToken,
      body: {
        dailyDuration: recommendedPlan.dailyDuration,
        weekFrequency: recommendedPlan.weekFrequency,
        difficultyLadder: recommendedPlan.difficultyLadder,
        itemAdjustments: recommendedPlan.items.map((item) => ({
          gameContentId: item.gameContentId,
          durationMinutes: item.durationMinutes,
          frequencyPerWeek: item.frequencyPerWeek,
          difficulty: item.difficulty,
        })),
        adjustmentReason: "trial 空库闭环验收确认推荐方案。",
      },
    });
    assert(response.status === "active", "确认后方案状态应为 active。");
    assert(response.isCurrent === true, "确认后方案应为当前方案。");
    return response;
  });

  const planItem = confirmedPlan.items.find((item) => item.gameContentId === game.id);
  assert(planItem, "确认后的当前方案缺少 browser_pose_game 项。");

  const session = await step("创建训练 session", async () => {
    const response = await request("/training-sessions", {
      method: "POST",
      token: patientLogin.accessToken,
      body: {
        patientId: patient.id,
        rehabPlanId: confirmedPlan.id,
        planItemId: planItem.id,
        gameContentId: game.id,
        idempotencyKey: runKey,
        gameRunId: `${runKey}_browser_pose`,
        deviceCode: `${runKey}_browser_camera`,
        calibrationStatus: "checked",
        clientStartedAt: new Date().toISOString(),
      },
    });
    assert(response.id, "训练 session 未返回 id。");
    assert(response.sessionStatus === "in_progress", "训练 session 应为 in_progress。");
    assert(
      response.runtimeConfigSnapshot?.runtimeType === "browser_pose_game",
      "runtimeConfigSnapshot.runtimeType 应为 browser_pose_game。",
    );
    return response;
  });

  const result = await step("提交结构化训练结果", async () => {
    const response = await request(`/training-sessions/${session.id}/results`, {
      method: "POST",
      token: patientLogin.accessToken,
      body: buildTrainingResultPayload(session, game),
    });
    assert(response.id, "训练结果未返回 id。");
    assert(response.source === "browser_pose_game", "训练结果 source 不正确。");
    assert(response.qualityFlag === "valid", "训练结果 qualityFlag 应为 valid。");
    assert(response.abnormalFlag === false, "训练结果 abnormalFlag 应为 false。");
    return response;
  });

  await step("训练记录可查询且动作指标已入库", async () => {
    const records = await request(`/patients/${patient.id}/training-records`, {
      token: doctorLogin.accessToken,
    });
    const persistedSession = records.sessions?.find((item) => item.id === session.id);
    assert(persistedSession, "训练记录中未找到刚提交的 session。");
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

  console.log("trial 空库闭环验收通过。");
}

async function login(account, password) {
  return request("/auth/login", {
    method: "POST",
    body: { account, password },
  });
}

function buildTrainingResultPayload(session, game) {
  const clientGeneratedAt = new Date().toISOString();
  const rawPayloadHash = hashPayload({
    runKey,
    sessionId: session.id,
    gameRunId: session.gameRunId,
    clientGeneratedAt,
    source: "browser_pose_game",
  });

  return {
    score: integerEnv("TRIAL_VERIFY_RESULT_SCORE"),
    completionRate: numberEnv("TRIAL_VERIFY_RESULT_COMPLETION_RATE"),
    durationSeconds: integerEnv("TRIAL_VERIFY_RESULT_DURATION_SECONDS"),
    reactionTimeMs: integerEnv("TRIAL_VERIFY_RESULT_REACTION_TIME_MS"),
    motionAccuracy: numberEnv("TRIAL_VERIFY_RESULT_MOTION_ACCURACY"),
    exerciseIntensity: requiredEnv("TRIAL_VERIFY_RESULT_EXERCISE_INTENSITY"),
    metricsSummary: {
      source: "browser_pose_game",
      gameRunId: session.gameRunId,
      gameVersion: game.gameVersion,
      protocolVersion: session.bridgeProtocolVersion,
      clientGeneratedAt,
      rawPayloadHash,
      captureMode: "browser_camera_pose",
      acceptanceRunKey: runKey,
    },
    motionMetrics: [
      metric(
        "reaction_time_ms",
        numberEnv("TRIAL_VERIFY_METRIC_REACTION_TIME_MS"),
        "ms",
        integerEnv("TRIAL_VERIFY_METRIC_REACTION_SAMPLE_COUNT"),
        numberEnv("TRIAL_VERIFY_METRIC_REACTION_CONFIDENCE"),
      ),
      metric(
        "target_hit_rate",
        numberEnv("TRIAL_VERIFY_METRIC_TARGET_HIT_RATE"),
        "ratio",
        integerEnv("TRIAL_VERIFY_METRIC_TARGET_SAMPLE_COUNT"),
        numberEnv("TRIAL_VERIFY_METRIC_TARGET_CONFIDENCE"),
      ),
      metric(
        "pose_visibility_avg",
        numberEnv("TRIAL_VERIFY_METRIC_POSE_VISIBILITY_AVG"),
        "ratio",
        integerEnv("TRIAL_VERIFY_METRIC_POSE_SAMPLE_COUNT"),
        numberEnv("TRIAL_VERIFY_METRIC_POSE_CONFIDENCE"),
      ),
      metric(
        "arm_raise_accuracy",
        numberEnv("TRIAL_VERIFY_METRIC_ARM_RAISE_ACCURACY"),
        "ratio",
        integerEnv("TRIAL_VERIFY_METRIC_ARM_SAMPLE_COUNT"),
        numberEnv("TRIAL_VERIFY_METRIC_ARM_CONFIDENCE"),
      ),
    ],
  };
}

function metric(metricType, metricValue, unit, sampleCount, confidence) {
  return {
    metricType,
    metricValue,
    unit,
    confidence,
    sampleCount,
    qualityFlag: "valid",
    windowStartedAt: new Date(Date.now() - 180_000).toISOString(),
    windowEndedAt: new Date().toISOString(),
    bodyPart: "upper_limb",
    rawSummary: {
      source: "trial_empty_loop_acceptance",
      runKey,
    },
  };
}

function requiredMetric(metricType, unit) {
  return {
    metricType,
    unit,
    required: true,
    description: `${metricType} from browser camera pose runtime`,
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
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${path}: ${formatErrorBody(
        body,
      )}`,
    );
  }
  return body;
}

function formatErrorBody(body) {
  if (!body || typeof body !== "object") return "empty response body";
  return JSON.stringify({
    message: body.message,
    error: body.error,
    statusCode: body.statusCode,
  });
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
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

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}。`);
  }
  return value;
}

function integerEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    throw new Error(`缺少环境变量 ${name}。`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} 必须是整数。`);
  }
  return value;
}

function numberEnv(name) {
  const raw = requiredEnv(name);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} 必须是数字。`);
  }
  return value;
}

function csvEnv(name) {
  const items = requiredEnv(name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) {
    throw new Error(`${name} 必须是逗号分隔的非空列表。`);
  }
  return items;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
