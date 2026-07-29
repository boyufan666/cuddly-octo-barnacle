#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CookieSessionClient } from "./local-contract-cookie-session.mjs";
import { verifyCompletedContractChecks } from "./local-contract-checks.mjs";

const patientAccount = requiredEnv("LOCAL_CONTRACT_PATIENT_ACCOUNT");
const patientPassword = requiredEnv("LOCAL_CONTRACT_PATIENT_PASSWORD");
const caregiverAccount = requiredEnv("LOCAL_CONTRACT_CAREGIVER_ACCOUNT");
const caregiverPassword = requiredEnv("LOCAL_CONTRACT_CAREGIVER_PASSWORD");
const adminAccount = requiredEnv("LOCAL_CONTRACT_ADMIN_ACCOUNT");
const adminPassword = requiredEnv("LOCAL_CONTRACT_ADMIN_PASSWORD");
const auditorAccount = requiredEnv("LOCAL_CONTRACT_AUDITOR_ACCOUNT");
const auditorPassword = requiredEnv("LOCAL_CONTRACT_AUDITOR_PASSWORD");
const doctorAccount = requiredEnv("LOCAL_CONTRACT_DOCTOR_ACCOUNT");
const doctorPassword = requiredEnv("LOCAL_CONTRACT_DOCTOR_PASSWORD");
const rootDir = resolve(import.meta.dirname, "..");
const projectEnv = readProjectEnv(resolve(rootDir, ".env"));
const apiBaseUrl = readRequiredConfig(projectEnv, "NEXT_PUBLIC_API_BASE_URL");
const databaseUrl = readRequiredConfig(projectEnv, "DATABASE_URL");
const publicSession = new CookieSessionClient(apiBaseUrl);

process.env.DATABASE_URL = databaseUrl;

const requireFromDbPackage = createRequire(
  resolve(rootDir, "packages/db/package.json"),
);
const { PrismaClient } = requireFromDbPackage("@prisma/client");
const prisma = new PrismaClient();

const runKey = `contract_${Date.now()}_${randomUUID().slice(0, 8)}`;

const created = {
  sessionIds: [],
  revokedConsentTypes: [],
  auditLogIds: [],
  collectionBatchIds: [],
  collectionProtocolIds: [],
  collectionConditionIds: [],
};
const completedChecks = new Set();
const expectedPatientExportColumns = [
  "patientExportId",
  "maskedName",
  "gender",
  "age",
  "maskedMobilePhone",
  "maskedCaregiverName",
  "maskedCaregiverPhone",
  "responsibleDoctor",
  "status",
  "createdAt",
];
const requiredBrowserPoseMetricTypes = [
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
];

console.log(
  "接口契约验收：本脚本验证本地 API 真实写入、运行时约束和清理流程。",
);
console.log("注意：本脚本不进行摄像头实采，也不会生成姿态帧或伪造训练过程。");

try {
  await step("健康检查 /health/live", async () => {
    const health = await request("/health/live", { session: publicSession });
    assert(health.status === "live", "健康检查 status 应为 live。");
    assert(
      health.service === "rehab-platform-api",
      "健康检查 service 应为 rehab-platform-api。",
    );
  });

  const patientLogin = await step("患者账号登录", async () => {
    const loginResponse = await login(patientAccount, patientPassword);
    assert(
      loginResponse.context?.primaryRole === "patient",
      `${patientAccount} 的 primaryRole 应为 patient。`,
    );
    assert(
      loginResponse.context?.patientIds?.length > 0,
      `${patientAccount} 未绑定 patientId，请先执行 seed。`,
    );
    return loginResponse;
  });

  const patientId = patientLogin.context.patientIds[0];
  const adminLogin = await step("管理员账号登录", async () => {
    const loginResponse = await login(adminAccount, adminPassword);
    assert(
      loginResponse.context?.adminPermissions?.includes("audit.read"),
      `${adminAccount} 缺少 audit.read 权限。`,
    );
    assert(
      loginResponse.context?.adminPermissions?.includes("data.export"),
      `${adminAccount} 缺少 data.export 权限。`,
    );
    return loginResponse;
  });

  const doctorLogin = await step("负责医师账号登录", async () => {
    const loginResponse = await login(doctorAccount, doctorPassword);
    assert(
      loginResponse.context?.doctorPatientIds?.includes(patientId),
      `${doctorAccount} 未绑定 ${patientAccount} 负责患者，请先执行 seed。`,
    );
    completedChecks.add("doctor_login_verified");
    return loginResponse;
  });

  const auditorLogin = await step("只读审计账号登录", async () => {
    const loginResponse = await login(auditorAccount, auditorPassword);
    assert(
      loginResponse.context?.adminPermissions?.includes("audit.read"),
      `${auditorAccount} 缺少 audit.read 权限。`,
    );
    assert(
      !loginResponse.context?.adminPermissions?.includes("data.export"),
      `${auditorAccount} 不应具备 data.export 权限。`,
    );
    return loginResponse;
  });

  const caregiverLogin = await step("家属账号登录", async () => {
    const loginResponse = await login(caregiverAccount, caregiverPassword);
    assert(
      loginResponse.context?.primaryRole === "caregiver",
      `${caregiverAccount} 的 primaryRole 应为 caregiver。`,
    );
    assert(
      loginResponse.context?.caregiverPatientIds?.includes(patientId),
      `${caregiverAccount} 未绑定 ${patientAccount} 授权患者，请先执行 seed。`,
    );
    completedChecks.add("caregiver_login_verified");
    return loginResponse;
  });

  const { patient, currentPlan, planItem, game } = await step(
    "读取患者当前计划和 Browser Pose Game",
    async () => {
      const patientProfile = await request(`/patients/${patientId}`, {
        session: patientLogin.session,
      });
      const activePlan = patientProfile.rehabPlans?.find(
        (plan) => plan.isCurrent && plan.status === "active",
      );
      assert(activePlan, "患者没有当前 active 康复计划，请先执行 seed。");
      const browserPoseItem = findReleasedBrowserPosePlanItem(activePlan.items);
      assert(
        browserPoseItem,
        "当前计划中没有已发布且包含必要指标的 browser_pose_canvas 训练项目。",
      );
      const content = browserPoseItem.gameContent;
      const metricTypes = collectRequiredMetricTypes(content.requiredMetrics);
      for (const metricType of requiredBrowserPoseMetricTypes) {
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

  await step("家属端摘要只返回脱敏摘要", async () => {
    const requestedAt = new Date().toISOString();
    const summary = await request(`/caregiver/patients/${patient.id}/summary`, {
      session: caregiverLogin.session,
    });
    const completedAt = new Date().toISOString();
    assert(summary.patient?.id === patient.id, "家属摘要 patient.id 不正确。");
    assert(summary.patient?.name === "李*", "家属摘要患者姓名必须脱敏。");
    assert(summary.patient?.age === patient.age, "家属摘要患者年龄不正确。");
    assert(
      summary.permissions?.fullMedicalRecord === false,
      "家属摘要不得开放完整病历。",
    );
    assert(
      summary.permissions?.rawAssessment === false,
      "家属摘要不得开放原始评估。",
    );
    assert(
      summary.permissions?.planEdit === false,
      "家属摘要不得开放方案编辑。",
    );
    assert(
      Array.isArray(summary.recentTraining),
      "家属摘要 recentTraining 必须是数组。",
    );
    assert(
      !containsKeyDeep(summary, "motionMetrics"),
      "家属摘要不得包含原始动作指标 motionMetrics。",
    );
    assert(
      !containsKeyDeep(summary, "metricsSummary"),
      "家属摘要不得包含训练原始 metricsSummary。",
    );
    assert(
      !containsKeyDeep(summary, "rawInputSummary"),
      "家属摘要不得包含原始评估输入 rawInputSummary。",
    );
    const summaryText = JSON.stringify(summary);
    assert(!summaryText.includes("李秀兰"), "家属摘要不得包含患者完整姓名。");
    assert(
      !summaryText.includes("13800006721"),
      "家属摘要不得包含患者完整手机号。",
    );
    assert(
      !summaryText.includes("13900008206"),
      "家属摘要不得包含照护人完整手机号。",
    );
    completedChecks.add("caregiver_summary_desensitized");

    const summaryLog = await findAuditLog({
      adminSession: adminLogin.session,
      actorUserId: caregiverLogin.user.id,
      actorRole: "caregiver",
      action: "caregiver.summary.view",
      targetType: "patient_profile",
      targetId: patient.id,
      result: "success",
      requestedAt,
      dateTo: completedAt,
      expectedMetadata: isEmptyMetadata,
    });
    created.auditLogIds.push(summaryLog.id);
    completedChecks.add("caregiver_summary_view_audit_log_persisted");
  });

  await step("家属账号不能读取完整训练记录并记录拒绝审计", async () => {
    const requestedAt = new Date().toISOString();
    const denied = await request(`/patients/${patient.id}/training-records`, {
      session: caregiverLogin.session,
      expectedStatus: 403,
    });
    const completedAt = new Date().toISOString();
    assert(
      typeof denied.message === "string" && denied.message.length > 0,
      "家属读取完整训练记录被拒绝时应返回明确错误消息。",
    );
    completedChecks.add("caregiver_full_training_records_denied");

    const deniedLog = await findAuditLog({
      adminSession: adminLogin.session,
      actorUserId: caregiverLogin.user.id,
      actorRole: "caregiver",
      action: "access.denied",
      targetType: "patient_profile",
      targetId: patient.id,
      result: "denied",
      requestedAt,
      dateTo: completedAt,
      expectedMetadata: isEmptyMetadata,
    });
    created.auditLogIds.push(deniedLog.id);
    completedChecks.add("caregiver_full_record_denied_audit_log_persisted");
  });

  const collectionCondition = await step("管理员创建正式采集条件", async () => {
    const response = await createFormalCollectionCondition({
      session: adminLogin.session,
    });
    assert(response.id, "采集条件未返回 id。");
    assert(response.status === "active", "采集条件状态应为 active。");
    return response;
  });

  const collectionProtocol = await step("管理员创建正式采集协议", async () => {
    const response = await createFormalCollectionProtocol({
      session: adminLogin.session,
      condition: collectionCondition,
      game,
    });
    assert(response.id, "采集协议未返回 id。");
    assert(response.status === "active", "采集协议状态应为 active。");
    assert(
      response.conditionId === collectionCondition.id,
      "采集协议未绑定本次采集条件。",
    );
    assert(response.gameContentId === game.id, "采集协议未绑定本次训练内容。");
    assert(
      response.runtimeType === "browser_pose_canvas",
      "采集协议 runtimeType 应为 browser_pose_canvas。",
    );
    return response;
  });

  const collectionBatch = await step("医师创建正式采集批次", async () => {
    const response = await createFormalCollectionBatch({
      session: doctorLogin.session,
      patient,
      currentPlan,
      planItem,
      game,
      protocol: collectionProtocol,
    });
    assert(response.id, "采集批次未返回 id。");
    assert(response.status === "ready", "采集批次状态应为 ready。");
    assert(response.patientId === patient.id, "采集批次 patientId 不正确。");
    assert(
      response.rehabPlanId === currentPlan.id,
      "采集批次 rehabPlanId 不正确。",
    );
    assert(response.planItemId === planItem.id, "采集批次 planItemId 不正确。");
    assert(
      response.gameContentId === game.id,
      "采集批次 gameContentId 不正确。",
    );
    assert(
      response.protocolId === collectionProtocol.id,
      "采集批次未绑定本次采集协议。",
    );
    assert(response.conditionId, "采集批次缺少 conditionId。");
    assert(
      response.protocolVersion === collectionProtocol.version,
      "采集批次协议版本应与采集协议一致。",
    );
    assert(
      response.consentSnapshot?.status === "granted",
      "采集批次授权快照应为 granted。",
    );
    return response;
  });

  const session = await step("创建正式训练会话", async () => {
    const response = await createTrainingSession({
      session: patientLogin.session,
      patient,
      currentPlan,
      planItem,
      game,
      collectionBatch,
      caseKey: "valid",
    });
    assert(response.id, "创建训练会话未返回 id。");
    assert(
      response.sessionStatus === "in_progress",
      "训练会话状态应为 in_progress。",
    );
    assert(
      response.gameRunId === `${runKey}_valid_browser_pose`,
      "训练会话 gameRunId 与请求不一致。",
    );
    assert(
      response.runtimeConfigSnapshot?.runtimeType === "browser_pose_canvas",
      "runtimeConfigSnapshot.runtimeType 应为 browser_pose_canvas。",
    );
    assert(
      response.collectionBatchId === collectionBatch.id,
      "训练会话未绑定正式采集批次。",
    );
    assert(
      response.runtimeConfigSnapshot?.collectionBatch?.id ===
        collectionBatch.id,
      "runtimeConfigSnapshot 未保留采集批次快照。",
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
      session: patientLogin.session,
      body: buildTrainingResultPayload({
        source: "unity_webgl",
        session,
        game,
        collectionBatch,
      }),
      expectedStatus: 400,
    });
    assert(
      typeof mismatch.message === "string" && mismatch.message.length > 0,
      "运行时不匹配时应返回明确错误消息。",
    );
  });

  const result = await step(
    "提交合法 Browser Pose 结构化训练结果",
    async () => {
      const response = await request(
        `/training-sessions/${session.id}/results`,
        {
          method: "POST",
          session: patientLogin.session,
          body: buildTrainingResultPayload({
            source: "browser_pose_canvas",
            session,
            game,
            collectionBatch,
          }),
        },
      );
      assert(response.source === "browser_pose_canvas", "结果 source 不正确。");
      assert(
        response.gameRunId === session.gameRunId,
        "结果 gameRunId 不正确。",
      );
      assert(
        response.gameVersion === game.gameVersion,
        "结果 gameVersion 不正确。",
      );
      assert(
        response.bridgeProtocolVersion === game.bridgeProtocolVersion,
        "结果 bridgeProtocolVersion 不正确。",
      );
      assert(
        response.qualityFlag === "valid",
        "合法结果 qualityFlag 应为 valid。",
      );
      assert(
        response.abnormalFlag === false,
        "合法结果 abnormalFlag 应为 false。",
      );
      assert(
        response.collectionBatchId === collectionBatch.id,
        "合法结果未绑定正式采集批次。",
      );
      return response;
    },
  );

  await step("训练记录可查询且动作指标已入库", async () => {
    const records = await request(`/patients/${patient.id}/training-records`, {
      session: doctorLogin.session,
    });
    const persistedSession = records.sessions?.find(
      (item) => item.id === session.id,
    );
    assert(persistedSession, "训练记录中未找到刚提交的 session。");
    assert(
      persistedSession.sessionStatus === "completed",
      "提交合法结果后 sessionStatus 应为 completed。",
    );
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

  await step("拒绝正常训练结果进入人工复核", async () => {
    const rejectedReview = await request(
      `/training-results/${result.id}/review`,
      {
        method: "PATCH",
        session: doctorLogin.session,
        body: {
          reviewConclusion: "accepted_valid",
          reviewNote: "正常训练结果不应进入人工复核流程。",
        },
        expectedStatus: 400,
      },
    );
    assert(
      typeof rejectedReview.message === "string" &&
        rejectedReview.message.length > 0,
      "正常训练结果复核被拒绝时应返回明确错误消息。",
    );
    completedChecks.add("valid_result_review_rejected");
  });

  const suspiciousSession = await step("创建可疑训练复核会话", async () => {
    const response = await createTrainingSession({
      session: patientLogin.session,
      patient,
      currentPlan,
      planItem,
      game,
      collectionBatch,
      caseKey: "suspicious_review",
    });
    assert(response.id, "创建可疑训练会话未返回 id。");
    assert(
      response.sessionStatus === "in_progress",
      "可疑训练会话状态应为 in_progress。",
    );
    assert(
      response.gameRunId === `${runKey}_suspicious_review_browser_pose`,
      "可疑训练会话 gameRunId 与请求不一致。",
    );
    return response;
  });

  const suspiciousResult = await step(
    "提交可疑 Browser Pose 训练结果并触发复核",
    async () => {
      const response = await request(
        `/training-sessions/${suspiciousSession.id}/results`,
        {
          method: "POST",
          session: patientLogin.session,
          body: buildTrainingResultPayload({
            source: "browser_pose_canvas",
            session: suspiciousSession,
            game,
            collectionBatch,
            caseKey: "suspicious_review",
            overrides: {
              durationSeconds: 45,
            },
          }),
        },
      );
      assert(response.id, "提交可疑训练结果未返回 id。");
      assert(
        response.qualityFlag === "suspicious",
        "可疑结果 qualityFlag 应为 suspicious。",
      );
      assert(
        response.abnormalFlag === true,
        "可疑结果 abnormalFlag 应为 true。",
      );
      assert(
        response.qualityReasons?.includes("训练时长过短"),
        "可疑结果 qualityReasons 应包含训练时长过短。",
      );
      assert(
        response.collectionBatchId === collectionBatch.id,
        "可疑结果未绑定正式采集批次。",
      );
      completedChecks.add("suspicious_result_created");
      return response;
    },
  );

  const reviewedResult = await step("负责医师复核可疑训练结果", async () => {
    const response = await request(
      `/training-results/${suspiciousResult.id}/review`,
      {
        method: "PATCH",
        session: doctorLogin.session,
        body: {
          reviewConclusion: "needs_retrain",
          reviewNote:
            "训练时长过短，本次结果不纳入有效训练趋势，请患者重新完成训练。",
        },
      },
    );
    assert(
      response.id === suspiciousResult.id,
      "复核结果 id 与可疑结果不一致。",
    );
    assert(
      response.reviewStatus === "reviewed",
      "复核后 reviewStatus 应为 reviewed。",
    );
    assert(
      response.reviewConclusion === "needs_retrain",
      "复核结论应为 needs_retrain。",
    );
    assert(
      response.reviewNote ===
        "训练时长过短，本次结果不纳入有效训练趋势，请患者重新完成训练。",
      "复核说明与请求不一致。",
    );
    assert(response.reviewedByUserId, "复核结果缺少 reviewedByUserId。");
    assert(response.reviewedAt, "复核结果缺少 reviewedAt。");
    assert(
      response.qualityFlag === "suspicious",
      "人工复核不应改写原始 qualityFlag。",
    );
    assert(
      response.abnormalFlag === true,
      "人工复核不应改写原始 abnormalFlag。",
    );
    completedChecks.add("suspicious_result_reviewed");
    return response;
  });

  await step("训练记录持久化复核结论且保留原始质量状态", async () => {
    const records = await request(`/patients/${patient.id}/training-records`, {
      session: doctorLogin.session,
    });
    const persistedSession = records.sessions?.find(
      (item) => item.id === suspiciousSession.id,
    );
    assert(persistedSession, "训练记录中未找到可疑训练 session。");
    assert(
      persistedSession.sessionStatus === "upload_failed",
      "可疑训练结果应将 sessionStatus 标记为 upload_failed。",
    );
    assert(
      persistedSession.result?.id === suspiciousResult.id,
      "训练记录未关联可疑 result。",
    );
    assert(
      persistedSession.result?.reviewStatus === "reviewed",
      "训练记录未持久化 reviewStatus。",
    );
    assert(
      persistedSession.result?.reviewConclusion === "needs_retrain",
      "训练记录未持久化 reviewConclusion。",
    );
    assert(
      persistedSession.result?.reviewNote === reviewedResult.reviewNote,
      "训练记录未持久化 reviewNote。",
    );
    completedChecks.add("review_fields_persisted");
    assert(
      persistedSession.result?.qualityFlag === "suspicious",
      "训练记录中原始 qualityFlag 不应被复核改写。",
    );
    assert(
      persistedSession.result?.abnormalFlag === true,
      "训练记录中原始 abnormalFlag 不应被复核改写。",
    );
    completedChecks.add("review_preserved_quality_flags");
  });

  await step("审计日志记录训练结果复核", async () => {
    const reviewLogs = await request(
      `/admin/audit-logs?${new URLSearchParams({
        action: "training_result.review",
        targetType: "training_result",
        targetId: suspiciousResult.id,
        result: "success",
        limit: "10",
      })}`,
      { session: adminLogin.session },
    );
    assert(reviewLogs.length > 0, "未查询到 training_result.review 审计日志。");
    const reviewLog = reviewLogs.find(
      (item) =>
        item.metadata?.sessionId === suspiciousSession.id &&
        item.metadata?.patientId === patient.id &&
        item.metadata?.reviewConclusion === "needs_retrain",
    );
    assert(
      reviewLog,
      "training_result.review 审计日志缺少 sessionId/patientId/reviewConclusion 元数据。",
    );
    completedChecks.add("review_audit_log_persisted");
  });

  await step("拒绝重复复核同一可疑训练结果", async () => {
    const duplicateReview = await request(
      `/training-results/${suspiciousResult.id}/review`,
      {
        method: "PATCH",
        session: doctorLogin.session,
        body: {
          reviewConclusion: "excluded_from_analysis",
          reviewNote: "重复复核应被阻断。",
        },
        expectedStatus: 400,
      },
    );
    assert(
      typeof duplicateReview.message === "string" &&
        duplicateReview.message.length > 0,
      "重复复核被拒绝时应返回明确错误消息。",
    );
    completedChecks.add("duplicate_review_rejected");
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
      { session: adminLogin.session },
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
      { session: adminLogin.session },
    );
    assert(submitLogs.length > 0, "未查询到 training_result.submit 审计日志。");
  });

  const revokedCameraConsent = await step(
    "患者撤回摄像头授权并阻断后续训练",
    async () => {
      const cameraConsent = findCurrentConsent(
        patient.consents,
        "camera_capture",
      );
      assert(
        cameraConsent,
        "未找到当前 camera_capture 授权，无法验证撤回阻断。",
      );
      const currentCameraConsentIds = await currentConsentIds(
        patient.id,
        patient.userId,
        "camera_capture",
      );
      assert(
        currentCameraConsentIds.includes(cameraConsent.id),
        "当前 camera_capture 授权列表与患者详情不一致。",
      );
      const revokeRequestedAt = new Date().toISOString();

      const revoked = await request(`/consents/${cameraConsent.id}/revoke`, {
        method: "PATCH",
        session: patientLogin.session,
      });
      created.revokedConsentTypes.push("camera_capture");
      assert(
        revoked.status === "revoked",
        "摄像头授权撤回后 status 应为 revoked。",
      );
      assert(revoked.revokedAt, "摄像头授权撤回后应记录 revokedAt。");
      const revokedSnapshots = await revokedConsentSnapshots(
        currentCameraConsentIds,
      );
      assert(
        revokedSnapshots.length === currentCameraConsentIds.length,
        "摄像头授权撤回后未找到所有授权快照。",
      );
      for (const snapshot of revokedSnapshots) {
        assert(
          snapshot.status === "revoked" && snapshot.revokedAt,
          "摄像头授权撤回后所有当前授权都应为 revoked。",
        );
      }
      completedChecks.add("camera_consent_revoked");

      const blocked = await request("/training-sessions", {
        method: "POST",
        session: patientLogin.session,
        body: buildTrainingSessionPayload({
          patient,
          currentPlan,
          planItem,
          game,
          collectionBatch,
          caseKey: "camera_revoked_block",
        }),
        expectedStatus: 403,
      });
      assert(
        typeof blocked.message === "string" &&
          blocked.message.includes("camera_capture"),
        "摄像头授权撤回后开始训练应被明确阻断。",
      );
      completedChecks.add("revoked_camera_consent_blocks_training");

      return { ...revoked, revokeRequestedAt };
    },
  );

  await step("审计日志记录摄像头授权撤回", async () => {
    const revokeLog = await findAuditLog({
      adminSession: adminLogin.session,
      actorUserId: patient.userId,
      actorRole: "patient",
      action: "consent.revoke",
      targetType: "consent_record",
      targetId: revokedCameraConsent.id,
      result: "success",
      requestedAt: revokedCameraConsent.revokeRequestedAt,
      expectedMetadata: (metadata) =>
        metadata.patientId === patient.id &&
        metadata.consentType === "camera_capture",
    });
    created.auditLogIds.push(revokeLog.id);
    completedChecks.add("consent_revoke_audit_log_persisted");
  });

  const revokedCaregiverSharingConsent = await step(
    "患者撤回家属共享授权并阻断家属摘要",
    async () => {
      const caregiverSharingConsent = findCurrentConsent(
        patient.consents,
        "caregiver_sharing",
      );
      assert(
        caregiverSharingConsent,
        "未找到当前 caregiver_sharing 授权，无法验证撤回阻断。",
      );
      const currentCaregiverSharingConsentIds = await currentConsentIds(
        patient.id,
        patient.userId,
        "caregiver_sharing",
      );
      assert(
        currentCaregiverSharingConsentIds.includes(caregiverSharingConsent.id),
        "当前 caregiver_sharing 授权列表与患者详情不一致。",
      );
      const revokeRequestedAt = new Date().toISOString();

      const revoked = await request(
        `/consents/${caregiverSharingConsent.id}/revoke`,
        {
          method: "PATCH",
          session: patientLogin.session,
        },
      );
      created.revokedConsentTypes.push("caregiver_sharing");
      assert(
        revoked.status === "revoked",
        "家属共享授权撤回后 status 应为 revoked。",
      );
      assert(revoked.revokedAt, "家属共享授权撤回后应记录 revokedAt。");
      const revokedSnapshots = await revokedConsentSnapshots(
        currentCaregiverSharingConsentIds,
      );
      assert(
        revokedSnapshots.length === currentCaregiverSharingConsentIds.length,
        "家属共享授权撤回后未找到所有授权快照。",
      );
      for (const snapshot of revokedSnapshots) {
        assert(
          snapshot.status === "revoked" && snapshot.revokedAt,
          "家属共享授权撤回后所有当前授权都应为 revoked。",
        );
      }
      completedChecks.add("caregiver_sharing_consent_revoked");

      const blockedRequestedAt = new Date().toISOString();
      const blocked = await request(
        `/caregiver/patients/${patient.id}/summary`,
        {
          session: caregiverLogin.session,
          expectedStatus: 403,
        },
      );
      const blockedCompletedAt = new Date().toISOString();
      assert(
        typeof blocked.message === "string" &&
          (blocked.message.includes("家属共享授权") ||
            blocked.message.includes("无权访问")),
        "家属共享授权撤回后摘要查看应被明确阻断。",
      );
      completedChecks.add("revoked_caregiver_sharing_blocks_summary");

      const blockedLog = await findAuditLog({
        adminSession: adminLogin.session,
        actorUserId: caregiverLogin.user.id,
        actorRole: "caregiver",
        action: "access.denied",
        targetType: "patient_profile",
        targetId: patient.id,
        result: "denied",
        requestedAt: blockedRequestedAt,
        dateTo: blockedCompletedAt,
        expectedMetadata: isEmptyMetadata,
      });
      created.auditLogIds.push(blockedLog.id);
      completedChecks.add(
        "revoked_caregiver_summary_denied_audit_log_persisted",
      );

      return { ...revoked, revokeRequestedAt };
    },
  );

  await step("审计日志记录家属共享授权撤回", async () => {
    const revokeLog = await findAuditLog({
      adminSession: adminLogin.session,
      actorUserId: patient.userId,
      actorRole: "patient",
      action: "consent.revoke",
      targetType: "consent_record",
      targetId: revokedCaregiverSharingConsent.id,
      result: "success",
      requestedAt: revokedCaregiverSharingConsent.revokeRequestedAt,
      expectedMetadata: (metadata) =>
        metadata.patientId === patient.id &&
        metadata.consentType === "caregiver_sharing",
    });
    created.auditLogIds.push(revokeLog.id);
    completedChecks.add("caregiver_sharing_revoke_audit_log_persisted");
  });

  const exportReason = `本地契约验收导出原因 ${runKey}：验证脱敏，不应出现在导出结果或审计 metadata。`;
  await step("管理员脱敏导出患者数据", async () => {
    const requestedAt = new Date().toISOString();
    const exported = await request("/admin/exports/patients", {
      method: "POST",
      session: adminLogin.session,
      body: {
        format: "json",
        reason: exportReason,
        patientId: patient.id,
        limit: "10",
      },
    });
    const payload = exported;
    assert(payload?.dataset === "patients", "患者导出 dataset 应为 patients。");
    assert(payload?.format === "json", "患者导出 format 应为 json。");
    assert(payload?.rowCount === 1, "按 patientId 导出患者数据应只有 1 行。");
    assertStringArrayEqual(
      payload.columns,
      expectedPatientExportColumns,
      "患者导出 columns 必须是完整脱敏列集合。",
    );
    const row = payload.rows?.[0];
    assert(row, "患者导出缺少数据行。");
    assert(
      typeof row.patientExportId === "string" &&
        row.patientExportId.startsWith("patient_"),
      "患者导出必须使用伪匿名 patientExportId。",
    );
    assert(row.maskedName === "李*", "患者导出姓名必须脱敏。");
    assert(row.maskedMobilePhone === "138****6721", "患者导出手机号必须脱敏。");
    assert(row.maskedCaregiverName === "李*", "照护人姓名必须脱敏。");
    assert(
      row.maskedCaregiverPhone === "139****8206",
      "照护人手机号必须脱敏。",
    );
    const exportedText = JSON.stringify(exported);
    assert(
      !exportedText.includes(patient.id),
      "患者导出不得包含原始 patientId。",
    );
    assert(!exportedText.includes("李秀兰"), "患者导出不得包含完整姓名。");
    assert(!exportedText.includes("李明"), "患者导出不得包含完整照护人姓名。");
    assert(
      !exportedText.includes("13800006721"),
      "患者导出不得包含完整手机号。",
    );
    assert(
      !exportedText.includes("13900008206"),
      "患者导出不得包含完整照护人手机号。",
    );
    assert(
      !exportedText.includes(exportReason),
      "患者导出不得包含导出原因全文。",
    );
    completedChecks.add("desensitized_patient_export_verified");

    const exportLog = await findDataExportAuditLog({
      adminSession: adminLogin.session,
      actorUserId: adminLogin.user.id,
      dataset: "patients",
      result: "success",
      requestedAt,
      reason: exportReason,
      expectedMetadata: (metadata) =>
        metadata?.desensitized === true &&
        metadata?.format === "json" &&
        metadata?.rowCount === 1 &&
        metadata?.reasonLength === exportReason.length &&
        assertStringArrayEqual(
          metadata.columns,
          expectedPatientExportColumns,
          "data.export 审计 columns 必须是完整患者脱敏导出列集合。",
        ) &&
        metadata?.filters?.patientFilterApplied === true &&
        typeof metadata?.filters?.patientExportId === "string" &&
        metadata.filters.patientExportId.startsWith("patient_"),
    });
    created.auditLogIds.push(exportLog.id);
    const auditText = JSON.stringify(exportLog);
    assert(!auditText.includes(exportReason), "导出审计不得保存原因全文。");
    assert(!auditText.includes(patient.id), "导出审计不得保存原始 patientId。");
    assert(!auditText.includes("李明"), "导出审计不得保存完整照护人姓名。");
    completedChecks.add("data_export_audit_log_persisted");
  });

  await step("拒绝医师账号导出患者数据并记录审计", async () => {
    const deniedReason = `医师越权导出契约验收原因 ${runKey}`;
    const requestedAt = new Date().toISOString();
    const denied = await request("/admin/exports/patients", {
      method: "POST",
      session: doctorLogin.session,
      body: {
        format: "json",
        reason: deniedReason,
        patientId: patient.id,
        limit: "10",
      },
      expectedStatus: 403,
    });
    assert(
      typeof denied.message === "string" && denied.message.length > 0,
      "医师越权导出被拒绝时应返回明确错误消息。",
    );
    const deniedLog = await findDataExportAuditLog({
      adminSession: adminLogin.session,
      actorUserId: doctorLogin.user.id,
      dataset: "patients",
      result: "denied",
      requestedAt,
      reason: deniedReason,
      expectedMetadata: (metadata) =>
        metadata?.desensitized === true &&
        metadata?.stage === "authorization" &&
        metadata?.requestedDatasetKnown === true,
    });
    created.auditLogIds.push(deniedLog.id);
    const auditText = JSON.stringify(deniedLog);
    assert(!auditText.includes(deniedReason), "拒绝导出审计不得保存原因全文。");
    assert(
      !auditText.includes(patient.id),
      "拒绝导出审计不得保存原始 patientId。",
    );
    assert(!auditText.includes("李明"), "拒绝导出审计不得保存完整照护人姓名。");
    completedChecks.add("doctor_export_role_denied");
  });

  await step("拒绝只读审计账号导出患者数据并记录审计", async () => {
    const deniedReason = `只读审计越权导出契约验收原因 ${runKey}`;
    const requestedAt = new Date().toISOString();
    const denied = await request("/admin/exports/patients", {
      method: "POST",
      session: auditorLogin.session,
      body: {
        format: "json",
        reason: deniedReason,
        patientId: patient.id,
        limit: "10",
      },
      expectedStatus: 403,
    });
    assert(
      typeof denied.message === "string" && denied.message.length > 0,
      "只读审计越权导出被拒绝时应返回明确错误消息。",
    );
    const deniedLog = await findDataExportAuditLog({
      adminSession: adminLogin.session,
      actorUserId: auditorLogin.user.id,
      dataset: "patients",
      result: "denied",
      requestedAt,
      reason: deniedReason,
      expectedMetadata: (metadata) =>
        metadata?.desensitized === true &&
        metadata?.stage === "authorization" &&
        metadata?.requestedDatasetKnown === true,
    });
    created.auditLogIds.push(deniedLog.id);
    const auditText = JSON.stringify(deniedLog);
    assert(
      !auditText.includes(deniedReason),
      "只读审计拒绝导出审计不得保存原因全文。",
    );
    assert(
      !auditText.includes(patient.id),
      "只读审计拒绝导出审计不得保存原始 patientId。",
    );
    assert(
      !auditText.includes("李明"),
      "只读审计拒绝导出审计不得保存完整照护人姓名。",
    );
    completedChecks.add("auditor_export_role_denied");
  });

  const missingChecks = verifyCompletedContractChecks(completedChecks);
  assert(
    missingChecks.length === 0,
    `接口契约验收缺少复核闭环检查：${missingChecks.join("、")}。`,
  );

  console.log("接口契约验收通过。");
} finally {
  await cleanupCreatedData();
  await prisma.$disconnect();
}

async function login(account, password) {
  const session = new CookieSessionClient(apiBaseUrl);
  const loginResponse = await session.login(account, password);
  assert(
    loginResponse.status === "authenticated",
    `${account} 登录 status 必须是 authenticated。`,
  );
  assert(loginResponse.context, `${account} 登录响应缺少 context。`);
  return { ...loginResponse, session };
}

function findReleasedBrowserPosePlanItem(items) {
  return items?.find((item) => {
    const content = item.gameContent;
    if (!content) return false;
    if (content.runtimeType !== "browser_pose_canvas") return false;
    if (content.status !== "active") return false;
    if (content.buildStatus !== "released") return false;
    return hasRequiredBrowserPoseMetrics(content.requiredMetrics);
  });
}

function hasRequiredBrowserPoseMetrics(requiredMetrics) {
  const metricTypes = collectRequiredMetricTypes(requiredMetrics);
  return requiredBrowserPoseMetricTypes.every((metricType) =>
    metricTypes.has(metricType),
  );
}

function collectRequiredMetricTypes(requiredMetrics) {
  const metricTypes = new Set();
  if (!Array.isArray(requiredMetrics)) return metricTypes;
  for (const metric of requiredMetrics) {
    if (metric && typeof metric === "object") {
      metricTypes.add(metric.metricType);
    }
  }
  return metricTypes;
}

async function createFormalCollectionCondition({ session }) {
  const response = await request("/admin/collection-conditions", {
    method: "POST",
    session,
    body: {
      code: `${runKey}_clinic_capture`.slice(0, 64),
      name: "接口契约验收诊室采集条件",
      description: "接口契约验收使用的诊室光照、上肢入镜和摄像头准备条件。",
      environment: {
        lighting: "standard_clinic",
        distanceMeters: 1.5,
        posture: "standing_or_seated",
      },
      deviceRequirements: {
        camera: "front_rgb",
        minResolution: "720p",
        browser: "chromium_or_edge",
      },
      taskParameters: {
        bodyScope: "upper_body",
        expectedDurationSeconds: 120,
      },
      qualityRules: {
        minPoseVisibility: 0.8,
        requiredMetrics: requiredBrowserPoseMetricTypes,
      },
    },
  });
  created.collectionConditionIds.push(response.id);
  return response;
}

async function createFormalCollectionProtocol({ session, condition, game }) {
  const response = await request("/admin/collection-protocols", {
    method: "POST",
    session,
    body: {
      conditionId: condition.id,
      gameContentId: game.id,
      code: `${runKey}_pose_protocol`.slice(0, 64),
      name: "接口契约验收体感采集协议",
      version: "1.0.0",
      runtimeType: "browser_pose_canvas",
      requiredConsentTypes: ["privacy_policy", "camera_capture"],
      requiredInputModes: ["camera_pose"],
      requiredMetrics: requiredBrowserPoseMetricTypes.map((metricType) =>
        requiredMetric(metricType, metricUnit(metricType)),
      ),
      conditionRules: {
        requireUpperBodyInFrame: true,
        minDistanceMeters: 1.2,
        maxDistanceMeters: 2,
      },
      samplingConfig: {
        sampleRateHz: 30,
        windowSeconds: 120,
      },
      qualityGate: {
        minPoseVisibility: 0.8,
        requireQualityFlag: "valid",
      },
    },
  });
  created.collectionProtocolIds.push(response.id);
  return response;
}

async function createFormalCollectionBatch({
  session,
  patient,
  currentPlan,
  planItem,
  game,
  protocol,
}) {
  const response = await request("/collection-batches", {
    method: "POST",
    session,
    body: {
      patientId: patient.id,
      rehabPlanId: currentPlan.id,
      planItemId: planItem.id,
      gameContentId: game.id,
      protocolId: protocol.id,
      idempotencyKey: `${runKey}_collection_batch`,
      operatorNotes: "接口契约验收正式采集批次。",
    },
  });
  created.collectionBatchIds.push(response.id);
  return response;
}

async function createTrainingSession({
  session,
  patient,
  currentPlan,
  planItem,
  game,
  collectionBatch,
  caseKey,
}) {
  const response = await request("/training-sessions", {
    method: "POST",
    session,
    body: buildTrainingSessionPayload({
      patient,
      currentPlan,
      planItem,
      game,
      collectionBatch,
      caseKey,
    }),
  });
  created.sessionIds.push(response.id);
  return response;
}

function buildTrainingSessionPayload({
  patient,
  currentPlan,
  planItem,
  game,
  collectionBatch,
  caseKey,
}) {
  return {
    patientId: patient.id,
    rehabPlanId: currentPlan.id,
    planItemId: planItem.id,
    gameContentId: game.id,
    collectionBatchId: collectionBatch.id,
    idempotencyKey: `${runKey}_${caseKey}`,
    gameRunId: `${runKey}_${caseKey}_browser_pose`,
    deviceCode: `${runKey}_${caseKey}_camera_device`,
    calibrationStatus: "checked",
    clientStartedAt: new Date().toISOString(),
  };
}

function findCurrentConsent(consents, consentType) {
  return consents?.find(
    (consent) =>
      consent.consentType === consentType &&
      consent.consentVersion === "v1.2" &&
      consent.status === "granted" &&
      !consent.revokedAt,
  );
}

async function currentConsentIds(patientId, subjectUserId, consentType) {
  const consents = await prisma.consentRecord.findMany({
    where: {
      patientId,
      subjectUserId,
      consentType,
      consentVersion: "v1.2",
      status: "granted",
      revokedAt: null,
    },
    select: { id: true },
  });
  return consents.map((consent) => consent.id);
}

async function revokedConsentSnapshots(consentIds) {
  return prisma.consentRecord.findMany({
    where: { id: { in: consentIds } },
    select: { id: true, status: true, revokedAt: true },
  });
}

function buildTrainingResultPayload({
  source,
  session,
  game,
  collectionBatch,
  caseKey = "valid",
  overrides = {},
}) {
  const clientGeneratedAt = new Date().toISOString();
  const metricsSummary = {
    source,
    gameRunId: session.gameRunId,
    gameVersion: game.gameVersion,
    protocolVersion: session.bridgeProtocolVersion,
    clientGeneratedAt,
    collectionBatchId: collectionBatch.id,
    dynamicDifficultyEvidence: buildDynamicDifficultyEvidence({
      session,
      clientGeneratedAt,
    }),
    rawPayloadHash: hashPayload({
      runKey,
      caseKey,
      source,
      sessionId: session.id,
      collectionBatchId: collectionBatch.id,
      clientGeneratedAt,
      overrides,
    }),
    contractVerification: true,
  };

  const payload = {
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
  return { ...payload, ...overrides, metricsSummary };
}

function requiredMetric(metricType, unit) {
  return { metricType, unit, min: 0, ...(unit === "ratio" ? { max: 1 } : {}) };
}

function metricUnit(metricType) {
  if (
    metricType === "target_hit_rate" ||
    metricType === "pose_visibility_avg" ||
    metricType === "arm_raise_accuracy"
  ) {
    return "ratio";
  }
  return "ms";
}

function buildDynamicDifficultyEvidence({ session, clientGeneratedAt }) {
  const approvedPlanItemId = session.runtimeConfigSnapshot?.approvedPlanItemId;
  const assessmentSourceId = session.runtimeConfigSnapshot?.assessmentSourceId;
  const startingDifficultyLevel =
    session.runtimeConfigSnapshot?.startingDifficultyLevel;

  assert(approvedPlanItemId, "训练会话缺少 approvedPlanItemId 难度证据。");
  assert(assessmentSourceId, "训练会话缺少 assessmentSourceId 难度证据。");
  assert(
    Number.isFinite(startingDifficultyLevel),
    "训练会话缺少 startingDifficultyLevel 难度证据。",
  );

  return {
    schemaVersion: "1.0.0",
    events: [
      {
        startingLevel: startingDifficultyLevel,
        startingLevelSource: "clinician_approved_plan",
        approvedPlanItemId,
        assessmentSourceId,
        triggerReason: "accuracy_high",
        before: {
          speed: 1,
          complexityLevel: startingDifficultyLevel,
        },
        after: {
          speed: 1.2,
          complexityLevel: Math.min(startingDifficultyLevel + 1, 3),
        },
        adjustedAt: clientGeneratedAt,
        runtimeFrameId: `${session.gameRunId}:frame:72`,
        runtimeWindowId: `${session.gameRunId}:window:0-120000`,
        ...(startingDifficultyLevel >= 3
          ? { safetyClampReason: "clinician_limit:no_runtime_change" }
          : {}),
      },
    ],
  };
}

async function findDataExportAuditLog({
  adminSession,
  actorUserId,
  dataset,
  result,
  requestedAt,
  reason,
  expectedMetadata,
}) {
  const logs = await request(
    `/admin/audit-logs?${new URLSearchParams({
      action: "data.export",
      targetType: "data_export",
      targetId: dataset,
      actorUserId,
      dateFrom: requestedAt,
      result,
      limit: "200",
    })}`,
    { session: adminSession },
  );
  const reasonHash = hashText(reason).slice(0, 16);
  const requestedAtMs = new Date(requestedAt).getTime();
  const log = logs.find((item) => {
    const metadata = item.metadata ?? {};
    return (
      item.actorUserId === actorUserId &&
      new Date(item.createdAt).getTime() >= requestedAtMs &&
      metadata.reasonHash === reasonHash &&
      expectedMetadata(metadata)
    );
  });
  assert(log, `未查询到本次 ${dataset} ${result} data.export 审计日志。`);
  return log;
}

async function findAuditLog({
  adminSession,
  actorUserId,
  actorRole,
  action,
  targetType,
  targetId,
  result,
  requestedAt,
  dateTo,
  expectedMetadata,
}) {
  const searchParams = new URLSearchParams({
    action,
    targetType,
    targetId,
    actorUserId,
    actorRole,
    dateFrom: requestedAt,
    result,
    limit: "200",
  });
  if (dateTo) {
    searchParams.set("dateTo", dateTo);
  }
  const logs = await request(`/admin/audit-logs?${searchParams}`, {
    session: adminSession,
  });
  const requestedAtMs = new Date(requestedAt).getTime();
  const dateToMs = dateTo ? new Date(dateTo).getTime() : undefined;
  const log = logs.find((item) => {
    const metadata = item.metadata ?? {};
    return (
      item.actorUserId === actorUserId &&
      item.actorRole === actorRole &&
      item.action === action &&
      item.targetType === targetType &&
      item.targetId === targetId &&
      item.result === result &&
      new Date(item.createdAt).getTime() >= requestedAtMs &&
      (dateToMs === undefined ||
        new Date(item.createdAt).getTime() <= dateToMs) &&
      expectedMetadata(metadata)
    );
  });
  assert(log, `未查询到本次 ${action} ${result} 审计日志。`);
  return log;
}

function assertStringArrayEqual(actual, expected, message) {
  assert(Array.isArray(actual), message);
  assert(actual.length === expected.length, message);
  for (const [index, value] of expected.entries()) {
    assert(actual[index] === value, message);
  }
  return true;
}

function isEmptyMetadata(metadata) {
  return Object.keys(metadata).length === 0;
}

function containsKeyDeep(value, targetKey) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsKeyDeep(item, targetKey));
  }
  return Object.entries(value).some(
    ([key, childValue]) =>
      key === targetKey || containsKeyDeep(childValue, targetKey),
  );
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

async function request(path, { session, ...options }) {
  assert(
    session instanceof CookieSessionClient,
    `${path} 请求必须显式使用对应角色的 cookie session。`,
  );
  return session.request(path, options);
}

async function cleanupCreatedData() {
  await restoreRevokedConsents();
  await cleanupRecordedAuditLogs();
  const sessionIds = [...created.sessionIds].filter(Boolean);
  if (sessionIds.length) {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: sessionIds } },
    });
    await prisma.motionMetric.deleteMany({
      where: { trainingSessionId: { in: sessionIds } },
    });
    const createdResults = await prisma.trainingResult.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true },
    });
    const resultIds = createdResults.map((result) => result.id);
    if (resultIds.length) {
      await prisma.auditLog.deleteMany({
        where: { targetType: "training_result", targetId: { in: resultIds } },
      });
      await prisma.trainingResult.deleteMany({
        where: { id: { in: resultIds } },
      });
    }
    await prisma.trainingSession.deleteMany({
      where: { id: { in: sessionIds } },
    });
    const remaining = await prisma.trainingSession.count({
      where: { id: { in: sessionIds } },
    });
    assert(remaining === 0, "接口契约验收训练数据清理失败。");
  }

  await cleanupCreatedCollectionRecords();
  console.log("已清理本次接口契约验收数据。");
}

async function cleanupCreatedCollectionRecords() {
  const collectionBatchIds = Array.from(
    new Set(created.collectionBatchIds),
  ).filter(Boolean);
  if (collectionBatchIds.length) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "collection_batch",
        targetId: { in: collectionBatchIds },
      },
    });
    await prisma.collectionBatch.deleteMany({
      where: { id: { in: collectionBatchIds } },
    });
  }

  const collectionProtocolIds = Array.from(
    new Set(created.collectionProtocolIds),
  ).filter(Boolean);
  if (collectionProtocolIds.length) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "collection_protocol",
        targetId: { in: collectionProtocolIds },
      },
    });
    await prisma.collectionProtocol.deleteMany({
      where: { id: { in: collectionProtocolIds } },
    });
  }

  const collectionConditionIds = Array.from(
    new Set(created.collectionConditionIds),
  ).filter(Boolean);
  if (collectionConditionIds.length) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "collection_condition",
        targetId: { in: collectionConditionIds },
      },
    });
    await prisma.collectionCondition.deleteMany({
      where: { id: { in: collectionConditionIds } },
    });
  }
}

async function restoreRevokedConsents() {
  const consentTypes = Array.from(new Set(created.revokedConsentTypes)).filter(
    Boolean,
  );
  if (!consentTypes.length) return;

  const patientLogin = await login(patientAccount, patientPassword);
  const patientId = patientLogin.context?.patientIds?.[0];
  assert(patientId, "恢复授权失败：患者登录上下文缺少 patientId。");

  for (const consentType of consentTypes) {
    const activeConsent = await prisma.consentRecord.findFirst({
      where: {
        patientId,
        subjectUserId: patientLogin.user.id,
        consentType,
        consentVersion: "v1.2",
        status: "granted",
        revokedAt: null,
      },
    });
    if (activeConsent) continue;

    const requestedAt = new Date().toISOString();
    const restoredConsent = await request("/consents", {
      method: "POST",
      session: patientLogin.session,
      body: {
        patientId,
        subjectUserId: patientLogin.user.id,
        consentType,
        consentVersion: "v1.2",
        evidenceSnapshot: {
          source: "local_contract_restore",
          runKey,
          restoredAt: new Date().toISOString(),
        },
      },
    });
    const grantLog = await findAuditLog({
      adminSession: (await login(adminAccount, adminPassword)).session,
      actorUserId: patientLogin.user.id,
      actorRole: "patient",
      action: "consent.grant",
      targetType: "consent_record",
      targetId: restoredConsent.id,
      result: "success",
      requestedAt,
      expectedMetadata: isEmptyMetadata,
    });
    created.auditLogIds.push(grantLog.id);
  }
  console.log("已通过正式授权 API 恢复本次接口契约验收临时撤回的授权。");
}

async function cleanupRecordedAuditLogs() {
  if (created.auditLogIds.length) {
    await prisma.auditLog.deleteMany({
      where: { id: { in: Array.from(new Set(created.auditLogIds)) } },
    });
  }
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

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`缺少环境变量 ${name}。`);
  }
  return value;
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
