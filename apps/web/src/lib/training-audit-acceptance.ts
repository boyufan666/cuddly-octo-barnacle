import type { AuditLog, TrainingRecordSession } from "@/types/api";

export type TrainingAuditAcceptanceAction =
  | "training_session.start"
  | "training_result.submit"
  | "training_result.review";

export type TrainingAuditAcceptanceItem = {
  action: TrainingAuditAcceptanceAction;
  label: string;
  required: boolean;
  matched: boolean;
  auditLogId?: string;
  detail: string;
  failures: string[];
};

export type TrainingAuditAcceptanceSummary = {
  ready: boolean;
  requiredActions: TrainingAuditAcceptanceAction[];
  auditLogIds: string[];
  items: TrainingAuditAcceptanceItem[];
  failures: string[];
};

type RequiredAuditRule = {
  action: TrainingAuditAcceptanceAction;
  label: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, string>;
};

export function buildTrainingAuditAcceptanceSummary({
  session,
  auditLogs,
}: {
  session: TrainingRecordSession;
  auditLogs: AuditLog[];
}): TrainingAuditAcceptanceSummary {
  const result = session.result;
  const rules = buildRequiredAuditRules(session);
  const items = rules.map((rule) => buildAuditItem(rule, auditLogs));
  const failures = items.flatMap((item) => item.failures);

  if (!result) {
    failures.push("训练会话缺少训练结果，不能生成训练验收审计清单。");
  }

  return {
    ready: failures.length === 0,
    requiredActions: rules.map((rule) => rule.action),
    auditLogIds: items
      .map((item) => item.auditLogId)
      .filter((value): value is string => Boolean(value)),
    items,
    failures,
  };
}

export function buildTrainingAuditAcceptanceRequiredActions(
  session: TrainingRecordSession,
): TrainingAuditAcceptanceAction[] {
  return buildRequiredAuditRules(session).map((rule) => rule.action);
}

function buildRequiredAuditRules(
  session: TrainingRecordSession,
): RequiredAuditRule[] {
  const rules: RequiredAuditRule[] = [
    {
      action: "training_session.start",
      label: "训练开始审计",
      targetType: "training_session",
      targetId: session.id,
    },
    {
      action: "training_result.submit",
      label: "训练结果提交审计",
      targetType: "training_session",
      targetId: session.id,
    },
  ];

  const result = session.result;
  if (
    result &&
    result.reviewStatus === "reviewed" &&
    (result.abnormalFlag || result.qualityFlag !== "valid")
  ) {
    rules.push({
      action: "training_result.review",
      label: "训练结果人工复核审计",
      targetType: "training_result",
      targetId: result.id,
      metadata: {
        sessionId: session.id,
        ...(result.reviewConclusion
          ? { reviewConclusion: result.reviewConclusion }
          : {}),
      },
    });
  }

  return rules;
}

function buildAuditItem(
  rule: RequiredAuditRule,
  auditLogs: AuditLog[],
): TrainingAuditAcceptanceItem {
  const match = auditLogs.find((log) => auditLogMatchesRule(log, rule));
  if (match) {
    return {
      action: rule.action,
      label: rule.label,
      required: true,
      matched: true,
      auditLogId: match.id,
      detail: `${rule.action} 已匹配成功审计日志。`,
      failures: [],
    };
  }

  return {
    action: rule.action,
    label: rule.label,
    required: true,
    matched: false,
    detail: `${rule.action} 未匹配到成功审计日志。`,
    failures: [
      `${rule.action} 缺少 targetType=${rule.targetType}、targetId=${rule.targetId}、result=success 的审计日志。`,
    ],
  };
}

function auditLogMatchesRule(log: AuditLog, rule: RequiredAuditRule) {
  if (log.action !== rule.action) return false;
  if (log.targetType !== rule.targetType) return false;
  if (log.targetId !== rule.targetId) return false;
  if (log.result !== "success") return false;
  return metadataMatches(log.metadata, rule.metadata);
}

function metadataMatches(
  metadata: unknown,
  expected?: Record<string, string>,
) {
  if (!expected) return true;
  if (!isRecord(metadata)) return false;

  return Object.entries(expected).every(
    ([key, value]) => metadata[key] === value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
