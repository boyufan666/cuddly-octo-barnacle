#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";

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
assertTrialGameRecommendationTags(gameTrainingTargets, gameTags);
const gameDefaultDuration = integerEnv("TRIAL_VERIFY_GAME_DEFAULT_DURATION");
const gameDefaultDifficulty = requiredEnv(
  "TRIAL_VERIFY_GAME_DEFAULT_DIFFICULTY",
);
const collectionConditionCode = requiredEnv(
  "TRIAL_VERIFY_COLLECTION_CONDITION_CODE",
);
const collectionConditionName = requiredEnv(
  "TRIAL_VERIFY_COLLECTION_CONDITION_NAME",
);
const collectionProtocolCode = requiredEnv(
  "TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE",
);
const collectionProtocolName = requiredEnv(
  "TRIAL_VERIFY_COLLECTION_PROTOCOL_NAME",
);
const collectionProtocolVersion = requiredEnv(
  "TRIAL_VERIFY_COLLECTION_PROTOCOL_VERSION",
);
const adminClient = new CookieSessionClient(apiBaseUrl);
const doctorClient = new CookieSessionClient(apiBaseUrl);
const patientClient = new CookieSessionClient(apiBaseUrl);
const runKey = `trial_${Date.now()}_${randomUUID().slice(0, 8)}`;
const consentVersion = "v1.2";

console.log(
  "trial 空库闭环验收：通过真实 API 验证 seed-trial 后的最小业务路径。",
);
console.log(
  "注意：本脚本不打印认证凭据，不依赖 patient001/admin 示例 seed 数据。",
);

await main();

async function main() {
  await step("健康检查 /health/live", async () => {
    const health = await adminClient.request("/health/live");
    assert(health.status === "live", "健康检查 status 应为 live。");
    assert(
      health.service === "rehab-platform-api",
      "健康检查 service 应为 rehab-platform-api。",
    );
  });

  const adminLogin = await step("trial 管理员账号存在且可登录", async () => {
    const loginResponse = await adminClient.login(adminAccount, adminPassword);
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
    const loginResponse = await doctorClient.login(
      doctorAccount,
      doctorPassword,
    );
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

  const patient = await step(
    "管理员按医师账号通过正式 API 创建患者",
    async () => {
      const response = await adminClient.request("/patients", {
        method: "POST",
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
    },
  );

  const patientLogin = await step("新建患者账号可登录", async () => {
    const loginResponse = await patientClient.login(
      patientAccount,
      patientPassword,
    );
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
      const consent = await patientClient.request("/consents", {
        method: "POST",
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
      assert(
        consent.status === "granted",
        `${consentType} 授权状态应为 granted。`,
      );
    }
  });

  const assessment = await step("录入真实结构化评估记录", async () => {
    const response = await doctorClient.request("/assessments", {
      method: "POST",
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
    const assessments = await doctorClient.request(
      `/patients/${patient.id}/assessments`,
    );
    assert(
      assessments.some((item) => item.id === assessment.id),
      "医师查询不到刚录入的评估记录。",
    );
  });

  const game = await step(
    "管理员创建并发布 browser_pose_canvas 正式训练内容",
    async () => {
      const response = await adminClient.request("/admin/game-contents", {
        method: "POST",
        body: {
          code: gameCode,
          name: gameName,
          runtimeType: "browser_pose_canvas",
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
      assert(
        response.runtimeType === "browser_pose_canvas",
        "训练内容 runtimeType 不正确。",
      );
      assert(
        response.status === "active",
        "browser_pose_canvas 创建后应为 active。",
      );
      assert(
        response.buildStatus === "released",
        "browser_pose_canvas 创建后应为 released。",
      );
      return response;
    },
  );

  const recommendedPlan = await step("生成系统推荐康复方案", async () => {
    const response = await doctorClient.request("/rehab-plans/recommend", {
      method: "POST",
      body: { patientId: patient.id },
    });
    assert(response.id, "推荐方案未返回 id。");
    assert(
      response.status === "pending_confirm",
      "推荐方案状态应为 pending_confirm。",
    );
    assert(
      response.items?.some((item) => item.gameContentId === game.id),
      "推荐方案未包含刚发布的 browser_pose_canvas。",
    );
    return response;
  });

  const confirmedPlan = await step("医师确认康复方案", async () => {
    const response = await doctorClient.request(
      `/rehab-plans/${recommendedPlan.id}/confirm`,
      {
        method: "PATCH",
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
      },
    );
    assert(response.status === "active", "确认后方案状态应为 active。");
    assert(response.isCurrent === true, "确认后方案应为当前方案。");
    return response;
  });

  const planItem = confirmedPlan.items.find(
    (item) => item.gameContentId === game.id,
  );
  assert(planItem, "确认后的当前方案缺少 browser_pose_canvas 项。");

  const collectionCondition = await step("管理员创建正式采集条件", async () => {
    const response = await adminClient.request("/admin/collection-conditions", {
      method: "POST",
      body: {
        code: collectionConditionCode,
        name: collectionConditionName,
        description: "trial 空库闭环使用的诊室标准光照、上半身入镜采集条件。",
        environment: {
          lighting: "standard_clinic",
          distanceMeters: 1.5,
          posture: "standing",
        },
        deviceRequirements: {
          camera: "front_rgb",
          minResolution: "720p",
          browser: "chromium_or_edge",
        },
        taskParameters: {
          bodyScope: "upper_body",
          expectedDurationSeconds: integerEnv(
            "TRIAL_VERIFY_RESULT_DURATION_SECONDS",
          ),
        },
        qualityRules: {
          minPoseVisibility: numberEnv("TRIAL_VERIFY_METRIC_POSE_CONFIDENCE"),
          requiredMetrics: [
            "reaction_time_ms",
            "target_hit_rate",
            "pose_visibility_avg",
            "arm_raise_accuracy",
          ],
        },
      },
    });
    assert(response.id, "采集条件未返回 id。");
    assert(response.status === "active", "采集条件状态应为 active。");
    return response;
  });

  const collectionProtocol = await step("管理员创建正式采集协议", async () => {
    const response = await adminClient.request("/admin/collection-protocols", {
      method: "POST",
      body: {
        conditionId: collectionCondition.id,
        gameContentId: game.id,
        code: collectionProtocolCode,
        name: collectionProtocolName,
        version: collectionProtocolVersion,
        runtimeType: "browser_pose_canvas",
        requiredConsentTypes: ["privacy_policy", "camera_capture"],
        requiredInputModes: ["camera_pose"],
        requiredMetrics: [
          requiredMetric("reaction_time_ms", "ms"),
          requiredMetric("target_hit_rate", "ratio"),
          requiredMetric("pose_visibility_avg", "ratio"),
          requiredMetric("arm_raise_accuracy", "ratio"),
        ],
        conditionRules: {
          requireUpperBodyInFrame: true,
          minDistanceMeters: 1.2,
          maxDistanceMeters: 2,
        },
        samplingConfig: {
          sampleRateHz: 30,
          windowSeconds: 180,
        },
        qualityGate: {
          minPoseVisibility: numberEnv("TRIAL_VERIFY_METRIC_POSE_CONFIDENCE"),
          requireQualityFlag: "valid",
        },
      },
    });
    assert(response.id, "采集协议未返回 id。");
    assert(response.status === "active", "采集协议状态应为 active。");
    assert(
      response.conditionId === collectionCondition.id,
      "采集协议未绑定刚创建的采集条件。",
    );
    assert(
      response.gameContentId === game.id,
      "采集协议未绑定刚创建的训练内容。",
    );
    return response;
  });

  const collectionBatch = await step("医师创建正式采集批次", async () => {
    const response = await doctorClient.request("/collection-batches", {
      method: "POST",
      body: {
        patientId: patient.id,
        rehabPlanId: confirmedPlan.id,
        planItemId: planItem.id,
        gameContentId: game.id,
        protocolId: collectionProtocol.id,
        idempotencyKey: `${runKey}_collection_batch`,
        operatorNotes: "trial 空库闭环验收正式采集批次。",
      },
    });
    assert(response.id, "采集批次未返回 id。");
    assert(response.status === "ready", "采集批次状态应为 ready。");
    assert(
      response.protocolId === collectionProtocol.id,
      "采集批次未绑定刚创建的采集协议。",
    );
    assert(
      response.conditionId === collectionCondition.id,
      "采集批次未绑定刚创建的采集条件。",
    );
    assert(
      response.protocolVersion === collectionProtocol.version,
      "采集批次协议版本应与采集协议一致。",
    );
    return response;
  });

  const session = await step("创建训练 session", async () => {
    const response = await patientClient.request("/training-sessions", {
      method: "POST",
      body: {
        patientId: patient.id,
        rehabPlanId: confirmedPlan.id,
        planItemId: planItem.id,
        gameContentId: game.id,
        collectionBatchId: collectionBatch.id,
        idempotencyKey: runKey,
        gameRunId: `${runKey}_browser_pose`,
        deviceCode: `${runKey}_browser_camera`,
        calibrationStatus: "checked",
        clientStartedAt: new Date().toISOString(),
      },
    });
    assert(response.id, "训练 session 未返回 id。");
    assert(
      response.sessionStatus === "in_progress",
      "训练 session 应为 in_progress。",
    );
    assert(
      response.collectionBatchId === collectionBatch.id,
      "训练 session 未绑定正式采集批次。",
    );
    assert(
      response.runtimeConfigSnapshot?.runtimeType === "browser_pose_canvas",
      "runtimeConfigSnapshot.runtimeType 应为 browser_pose_canvas。",
    );
    assert(
      response.runtimeConfigSnapshot?.collectionBatch?.id ===
        collectionBatch.id,
      "runtimeConfigSnapshot 未保留采集批次快照。",
    );
    return response;
  });

  const result = await step("提交结构化训练结果", async () => {
    const response = await patientClient.request(
      `/training-sessions/${session.id}/results`,
      {
        method: "POST",
        body: buildTrainingResultPayload(session, game),
      },
    );
    assert(response.id, "训练结果未返回 id。");
    assert(
      response.source === "browser_pose_canvas",
      "训练结果 source 不正确。",
    );
    assert(
      response.qualityFlag === "valid",
      "训练结果 qualityFlag 应为 valid。",
    );
    assert(
      response.abnormalFlag === false,
      "训练结果 abnormalFlag 应为 false。",
    );
    assert(
      response.collectionBatchId === session.collectionBatchId,
      "训练结果 collectionBatchId 应与训练 session 一致。",
    );
    return response;
  });

  await step("训练记录可查询且动作指标已入库", async () => {
    const records = await doctorClient.request(
      `/patients/${patient.id}/training-records`,
    );
    const persistedSession = records.sessions?.find(
      (item) => item.id === session.id,
    );
    assert(persistedSession, "训练记录中未找到刚提交的 session。");
    assert(
      persistedSession.result?.id === result.id,
      "训练记录 result 未关联。",
    );
    assert(
      persistedSession.motionMetrics?.length === 4,
      "训练记录应包含 4 条动作指标。",
    );
    assert(
      persistedSession.collectionBatchId === collectionBatch.id,
      "训练记录 session.collectionBatchId 应绑定正式采集批次。",
    );
    assert(
      persistedSession.result?.collectionBatchId === collectionBatch.id,
      "训练记录 result.collectionBatchId 应绑定正式采集批次。",
    );
    assert(
      persistedSession.motionMetrics.every(
        (metric) => metric.collectionBatchId === collectionBatch.id,
      ),
      "每条动作指标都应绑定正式采集批次。",
    );
    assert(
      records.summary.completedSessions >= 1,
      "训练记录 summary.completedSessions 应包含本次完成训练。",
    );
  });

  console.log("trial 空库闭环验收通过。");
}

function buildTrainingResultPayload(session, game) {
  const clientGeneratedAt = new Date().toISOString();
  const rawPayloadHash = hashPayload({
    runKey,
    sessionId: session.id,
    gameRunId: session.gameRunId,
    clientGeneratedAt,
    source: "browser_pose_canvas",
  });

  return {
    score: integerEnv("TRIAL_VERIFY_RESULT_SCORE"),
    completionRate: numberEnv("TRIAL_VERIFY_RESULT_COMPLETION_RATE"),
    durationSeconds: integerEnv("TRIAL_VERIFY_RESULT_DURATION_SECONDS"),
    reactionTimeMs: integerEnv("TRIAL_VERIFY_RESULT_REACTION_TIME_MS"),
    motionAccuracy: numberEnv("TRIAL_VERIFY_RESULT_MOTION_ACCURACY"),
    exerciseIntensity: requiredEnv("TRIAL_VERIFY_RESULT_EXERCISE_INTENSITY"),
    metricsSummary: {
      source: "browser_pose_canvas",
      gameRunId: session.gameRunId,
      gameVersion: game.gameVersion,
      protocolVersion: session.bridgeProtocolVersion,
      clientGeneratedAt,
      rawPayloadHash,
      collectionBatchId: session.collectionBatchId,
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

function assertTrialGameRecommendationTags(trainingTargets, tags) {
  const text = [...trainingTargets, ...tags].join(",");
  const tagText = tags.join(",");
  const hasReactionIntent = ["reaction", "反应"].some((tag) =>
    text.includes(tag),
  );
  const hasRecommendedIntensity = [
    "moderate_intensity",
    "low_intensity",
    "中低强度",
    "低强度",
  ].some((tag) => tagText.includes(tag));

  assert(
    hasReactionIntent,
    "TRIAL_VERIFY_GAME_TRAINING_TARGETS 或 TRIAL_VERIFY_GAME_TAGS 必须包含 reaction 或 反应，确保本次正式训练内容能匹配推荐规则。",
  );
  assert(
    hasRecommendedIntensity,
    "TRIAL_VERIFY_GAME_TAGS 必须包含可被推荐规则识别的强度标签，例如 moderate_intensity、low_intensity、中低强度或低强度。",
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
