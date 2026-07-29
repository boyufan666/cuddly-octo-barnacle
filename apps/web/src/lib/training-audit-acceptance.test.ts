import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrainingAuditAcceptanceRequiredActions,
  buildTrainingAuditAcceptanceSummary,
  type TrainingAuditAcceptanceAction,
} from "./training-audit-acceptance.ts";
import type { AuditLog, TrainingRecordSession } from "@/types/api";

const submittedAt = "2026-05-30T10:05:00.000Z";

test("training audit acceptance summary matches required start and submit logs", () => {
  const summary = buildTrainingAuditAcceptanceSummary({
    session: buildSession({
      abnormalFlag: false,
      qualityFlag: "valid",
    }),
    auditLogs: [
      buildAuditLog({
        id: "audit-start",
        action: "training_session.start",
        targetType: "training_session",
        targetId: "session-1",
      }),
      buildAuditLog({
        id: "audit-submit",
        action: "training_result.submit",
        targetType: "training_session",
        targetId: "session-1",
      }),
    ],
  });

  assert.equal(summary.ready, true);
  assert.deepEqual(summary.requiredActions, [
    "training_session.start",
    "training_result.submit",
  ]);
  assert.deepEqual(summary.auditLogIds, ["audit-start", "audit-submit"]);
  assert.deepEqual(summary.failures, []);
});

test("training audit acceptance summary requires review audit for reviewed suspicious results", () => {
  const summary = buildTrainingAuditAcceptanceSummary({
    session: buildSession({
      abnormalFlag: true,
      qualityFlag: "suspicious",
      reviewStatus: "reviewed",
      reviewConclusion: "needs_retrain",
    }),
    auditLogs: [
      buildAuditLog({
        id: "audit-start",
        action: "training_session.start",
        targetType: "training_session",
        targetId: "session-1",
      }),
      buildAuditLog({
        id: "audit-submit",
        action: "training_result.submit",
        targetType: "training_session",
        targetId: "session-1",
      }),
      buildAuditLog({
        id: "audit-review",
        action: "training_result.review",
        targetType: "training_result",
        targetId: "result-1",
        metadata: {
          sessionId: "session-1",
          reviewConclusion: "needs_retrain",
        },
      }),
    ],
  });

  assert.equal(summary.ready, true);
  assert.deepEqual(summary.requiredActions, [
    "training_session.start",
    "training_result.submit",
    "training_result.review",
  ]);
  assert.deepEqual(summary.auditLogIds, [
    "audit-start",
    "audit-submit",
    "audit-review",
  ]);
});

test("training audit acceptance required actions come from result status without audit logs", () => {
  const actions = buildTrainingAuditAcceptanceRequiredActions(
    buildSession({
      abnormalFlag: true,
      qualityFlag: "suspicious",
      reviewStatus: "reviewed",
      reviewConclusion: "needs_retrain",
    }),
  );

  assert.deepEqual(actions, [
    "training_session.start",
    "training_result.submit",
    "training_result.review",
  ]);
});

test("training audit acceptance summary fails when required audit actions are missing or denied", () => {
  const summary = buildTrainingAuditAcceptanceSummary({
    session: buildSession({
      abnormalFlag: true,
      qualityFlag: "suspicious",
      reviewStatus: "reviewed",
      reviewConclusion: "confirmed_abnormal",
    }),
    auditLogs: [
      buildAuditLog({
        id: "audit-start",
        action: "training_session.start",
        targetType: "training_session",
        targetId: "session-1",
      }),
      buildAuditLog({
        id: "audit-submit-denied",
        action: "training_result.submit",
        targetType: "training_session",
        targetId: "session-1",
        result: "denied",
      }),
    ],
  });

  assert.equal(summary.ready, false);
  assert.match(summary.failures.join("\n"), /training_result\.submit/);
  assert.match(summary.failures.join("\n"), /training_result\.review/);
  assert.deepEqual(summary.auditLogIds, ["audit-start"]);
});

test("training audit acceptance summary rejects logs targeting another session or result", () => {
  const summary = buildTrainingAuditAcceptanceSummary({
    session: buildSession({
      abnormalFlag: false,
      qualityFlag: "valid",
    }),
    auditLogs: [
      buildAuditLog({
        id: "audit-start-other",
        action: "training_session.start",
        targetType: "training_session",
        targetId: "session-other",
      }),
      buildAuditLog({
        id: "audit-submit-result",
        action: "training_result.submit",
        targetType: "training_result",
        targetId: "result-1",
      }),
    ],
  });

  assert.equal(summary.ready, false);
  assert.deepEqual(summary.auditLogIds, []);
  assert.match(summary.failures.join("\n"), /training_session\.start/);
  assert.match(summary.failures.join("\n"), /training_result\.submit/);
});

function buildSession({
  abnormalFlag,
  qualityFlag,
  reviewStatus = null,
  reviewConclusion = null,
}: {
  abnormalFlag: boolean;
  qualityFlag: string;
  reviewStatus?: "reviewed" | null;
  reviewConclusion?: TrainingRecordSession["result"] extends infer Result
    ? Result extends { reviewConclusion?: infer Conclusion }
      ? Conclusion
      : never
    : never;
}): TrainingRecordSession {
  return {
    id: "session-1",
    patientId: "patient-1",
    rehabPlanId: "plan-1",
    planItemId: "plan-item-1",
    gameContentId: "game-1",
    collectionBatchId: "collection-batch-1",
    gameRunId: "run-1",
    clientStartedAt: "2026-05-30T10:00:00.000Z",
    clientEndedAt: submittedAt,
    deviceCode: "camera-01",
    calibrationStatus: "checked",
    uploadAttemptCount: 1,
    sessionStatus: "completed",
    startedAt: "2026-05-30T10:00:00.000Z",
    endedAt: submittedAt,
    syncStatus: "synced",
    gameContent: {
      id: "game-1",
      code: "browser_pose_reach",
      name: "上肢触达训练",
      trainingTargets: ["reaction"],
      tags: ["upper_limb"],
      defaultDuration: 10,
      defaultDifficulty: "medium",
      runtimeType: "browser_pose_canvas",
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
      buildStatus: "released",
      releaseChannel: "production",
      supportsCamera: true,
      supportsMicrophone: false,
      supportedInputModes: ["camera"],
      requiredMetrics: [],
      status: "active",
    },
    result: {
      id: "result-1",
      source: "browser_pose_canvas",
      gameRunId: "run-1",
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
      submittedAt,
      rawPayloadHash: "sha256:training-result",
      score: 86,
      completionRate: 0.93,
      durationSeconds: 600,
      reactionTimeMs: 820,
      motionAccuracy: 0.88,
      exerciseIntensity: "moderate",
      abnormalFlag,
      qualityFlag,
      qualityReasons: abnormalFlag ? ["pose_visibility_low"] : [],
      reviewStatus,
      reviewConclusion,
      createdAt: submittedAt,
    },
    motionMetrics: [],
  };
}

function buildAuditLog({
  id,
  action,
  targetType,
  targetId,
  result = "success",
  metadata = {},
}: {
  id: string;
  action: TrainingAuditAcceptanceAction;
  targetType: string;
  targetId: string;
  result?: AuditLog["result"];
  metadata?: unknown;
}): AuditLog {
  return {
    id,
    action,
    targetType,
    targetId,
    result,
    metadata,
    createdAt: submittedAt,
    actorRole: "doctor",
  };
}
