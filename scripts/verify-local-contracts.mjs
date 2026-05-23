#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConsentRestoreWhere,
  verifyCompletedContractChecks,
} from "./local-contract-checks.mjs";

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
const auditorAccount = "auditor001";
const doctorAccount = "doctor001";
const runKey = `contract_${Date.now()}_${randomUUID().slice(0, 8)}`;

const created = {
  sessionIds: [],
  revokedConsentIds: [],
  revokedAtByConsentId: {},
  auditLogIds: [],
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
  "currentRiskLevel",
  "status",
  "createdAt",
];

console.log(
  "接口契约验收：本脚本验证本地 API 真实写入、运行时约束和清理流程。",
);
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
    assert(
      loginResponse.context?.adminPermissions?.includes("data.export"),
      "admin 缺少 data.export 权限。",
    );
    return loginResponse;
  });

  const doctorLogin = await step("负责医师账号登录", async () => {
    const loginResponse = await login(doctorAccount);
    assert(loginResponse.accessToken, "负责医师登录未返回 accessToken。");
    assert(
      loginResponse.context?.doctorPatientIds?.includes(patientId),
      "doctor001 未绑定 patient001 负责患者，请先执行 seed。",
    );
    completedChecks.add("doctor_login_verified");
    return loginResponse;
  });

  const auditorLogin = await step("只读审计账号登录", async () => {
    const loginResponse = await login(auditorAccount);
    assert(loginResponse.accessToken, "只读审计登录未返回 accessToken。");
    assert(
      loginResponse.context?.adminPermissions?.includes("audit.read"),
      "auditor001 缺少 audit.read 权限。",
    );
    assert(
      !loginResponse.context?.adminPermissions?.includes("data.export"),
      "auditor001 不应具备 data.export 权限。",
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
    const response = await createTrainingSession({
      token: patientLogin.accessToken,
      patient,
      currentPlan,
      planItem,
      game,
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

  const result = await step(
    "提交合法 Browser Pose 结构化训练结果",
    async () => {
      const response = await request(
        `/training-sessions/${session.id}/results`,
        {
          method: "POST",
          token: patientLogin.accessToken,
          body: buildTrainingResultPayload({
            source: "browser_pose_game",
            session,
            game,
          }),
        },
      );
      assert(response.source === "browser_pose_game", "结果 source 不正确。");
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
      return response;
    },
  );

  await step("训练记录可查询且动作指标已入库", async () => {
    const records = await request(`/patients/${patient.id}/training-records`, {
      token: patientLogin.accessToken,
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
      records.summary.completedSessions >= 1,
      "训练记录 summary.completedSessions 应包含本次完成训练。",
    );
  });

  await step("拒绝正常训练结果进入人工复核", async () => {
    const rejectedReview = await request(
      `/training-results/${result.id}/review`,
      {
        method: "PATCH",
        token: doctorLogin.accessToken,
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
      token: patientLogin.accessToken,
      patient,
      currentPlan,
      planItem,
      game,
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
          token: patientLogin.accessToken,
          body: buildTrainingResultPayload({
            source: "browser_pose_game",
            session: suspiciousSession,
            game,
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
      completedChecks.add("suspicious_result_created");
      return response;
    },
  );

  const reviewedResult = await step("负责医师复核可疑训练结果", async () => {
    const response = await request(
      `/training-results/${suspiciousResult.id}/review`,
      {
        method: "PATCH",
        token: doctorLogin.accessToken,
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
      token: patientLogin.accessToken,
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
      { token: adminLogin.accessToken },
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
        token: doctorLogin.accessToken,
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
        token: patientLogin.accessToken,
      });
      created.revokedConsentIds.push(...currentCameraConsentIds);
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
        created.revokedAtByConsentId[snapshot.id] = snapshot.revokedAt;
      }
      completedChecks.add("camera_consent_revoked");

      const blocked = await request("/training-sessions", {
        method: "POST",
        token: patientLogin.accessToken,
        body: buildTrainingSessionPayload({
          patient,
          currentPlan,
          planItem,
          game,
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
    const revokeLogs = await request(
      `/admin/audit-logs?${new URLSearchParams({
        action: "consent.revoke",
        targetType: "consent_record",
        targetId: revokedCameraConsent.id,
        result: "success",
        limit: "10",
      })}`,
      { token: adminLogin.accessToken },
    );
    assert(revokeLogs.length > 0, "未查询到 consent.revoke 审计日志。");
    const candidateLogs = revokeLogs.filter(
      (item) =>
        item.actorUserId === patient.userId &&
        new Date(item.createdAt).getTime() >=
          new Date(revokedCameraConsent.revokeRequestedAt).getTime(),
    );
    created.auditLogIds.push(...candidateLogs.map((item) => item.id));
    const revokeLog = candidateLogs.find(
      (item) =>
        item.metadata?.patientId === patient.id &&
        item.metadata?.consentType === "camera_capture",
    );
    assert(
      revokeLog,
      "consent.revoke 审计日志缺少 patientId/consentType 元数据。",
    );
    created.auditLogIds.push(revokeLog.id);
    completedChecks.add("consent_revoke_audit_log_persisted");
  });

  const exportReason = `本地契约验收导出原因 ${runKey}：验证脱敏，不应出现在导出结果或审计 metadata。`;
  await step("管理员脱敏导出患者数据", async () => {
    const requestedAt = new Date().toISOString();
    const exported = await request("/admin/exports/patients", {
      method: "POST",
      token: adminLogin.accessToken,
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
      adminToken: adminLogin.accessToken,
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
      token: doctorLogin.accessToken,
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
      adminToken: adminLogin.accessToken,
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
      token: auditorLogin.accessToken,
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
      adminToken: adminLogin.accessToken,
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

async function login(account) {
  return request("/auth/login", {
    method: "POST",
    body: { account, password: seedPassword },
  });
}

async function createTrainingSession({
  token,
  patient,
  currentPlan,
  planItem,
  game,
  caseKey,
}) {
  const response = await request("/training-sessions", {
    method: "POST",
    token,
    body: buildTrainingSessionPayload({
      patient,
      currentPlan,
      planItem,
      game,
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
  caseKey,
}) {
  return {
    patientId: patient.id,
    rehabPlanId: currentPlan.id,
    planItemId: planItem.id,
    gameContentId: game.id,
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
    rawPayloadHash: hashPayload({
      runKey,
      caseKey,
      source,
      sessionId: session.id,
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

async function findDataExportAuditLog({
  adminToken,
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
    { token: adminToken },
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

function assertStringArrayEqual(actual, expected, message) {
  assert(Array.isArray(actual), message);
  assert(actual.length === expected.length, message);
  for (const [index, value] of expected.entries()) {
    assert(actual[index] === value, message);
  }
  return true;
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
  await restoreRevokedConsents();
  await cleanupRecordedAuditLogs();
  if (!created.sessionIds.length) return;
  const sessionIds = [...created.sessionIds].filter(Boolean);
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
  assert(remaining === 0, "接口契约验收数据清理失败。");
  console.log("已清理本次接口契约验收数据。");
}

async function restoreRevokedConsents() {
  if (!created.revokedConsentIds.length) return;
  const consentIds = Array.from(new Set(created.revokedConsentIds)).filter(
    Boolean,
  );
  await prisma.consentRecord.updateMany({
    where: buildConsentRestoreWhere(consentIds, created.revokedAtByConsentId),
    data: {
      status: "granted",
      revokedAt: null,
    },
  });
  console.log("已恢复本次接口契约验收临时撤回的授权。");
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
