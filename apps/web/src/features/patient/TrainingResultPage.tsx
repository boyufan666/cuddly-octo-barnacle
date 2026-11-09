import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  StatusBadge,
  type StatusBadgeStatus,
} from "@/components/ui/StatusBadge";
import type {
  TrainingRecordSession,
  TrainingRecordsResponse,
  TrainingResult,
} from "@/types/api";

type TrainingResultPageProps = {
  onBackToday: () => void;
  trainingRecords?: TrainingRecordsResponse;
};

export function TrainingResultPage({
  onBackToday,
  trainingRecords,
}: TrainingResultPageProps) {
  const savedSessions =
    trainingRecords?.sessions.filter(hasTrainingResult) ?? [];
  const completedSessions = savedSessions.filter(isValidTrainingResult);
  const latest = savedSessions[0];
  const result = latest?.result;
  const doctorReview = result ? patientDoctorReviewStatus(result) : undefined;
  const trend = summarizeTrend(completedSessions);

  return (
    <section className="grid gap-5" data-testid="patient-result-flow">
      <div>
        <p className="text-sm font-black text-[var(--accent-strong)]">记录</p>
        <h2 className="mt-2 text-3xl font-black text-[var(--ink-strong)] md:text-4xl">
          我的训练进展
        </h2>
        <p className="mt-3 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
          查看已经完成的训练、近期表现和医生提醒。
        </p>
      </div>

      <Card tone="patient">
        <StatusBadge status={result ? "complete" : "pending"}>
          {result ? "本次训练已完成" : "等待训练完成"}
        </StatusBadge>
        {result && latest ? (
          <>
            <h3 className="mt-4 min-w-0 break-words text-3xl font-black text-[var(--ink-strong)]">
              {latest.gameContent.name}
            </h3>
            <p className="mt-3 text-lg font-bold leading-8 text-[var(--ink-soft)]">
              本次训练记录已保存。医生会结合多次记录判断是否需要调整方案。
            </p>
            <div className="mt-6 grid gap-3 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-5 md:grid-cols-2">
              <div>
                <p className="text-sm font-black text-[var(--accent-strong)]">
                  训练记录
                </p>
                <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
                  最近一次训练已经进入记录页，可按今日安排继续下一项。
                </p>
              </div>
              <div>
                <p className="text-sm font-black text-[var(--accent-strong)]">
                  医师复核
                </p>
                <StatusBadge className="mt-2" status={doctorReview?.status}>
                  {doctorReview?.label}
                </StatusBadge>
                <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
                  {doctorReview?.description}
                </p>
                {doctorReview?.reviewed ? (
                  <p className="mt-3 whitespace-pre-wrap break-words font-bold leading-7 text-[var(--ink-strong)]">
                    {doctorReview.reviewNote}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-[var(--line-subtle)] bg-[var(--surface-panel)] p-6">
            <h3 className="text-2xl font-black text-[var(--ink-strong)]">
              暂无训练结果
            </h3>
            <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
              完成训练并保存后，这里会显示训练记录和医生提醒。
            </p>
          </div>
        )}
      </Card>

      <Card tone="patient" className="grid gap-4">
        <div>
          <StatusBadge status={completedSessions.length ? "ready" : "pending"}>
            近期趋势
          </StatusBadge>
          <h3 className="mt-3 text-2xl font-black text-[var(--ink-strong)]">
            {trend.title}
          </h3>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            {trend.description}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ResultFact
            label="已保存记录"
            value={`${savedSessions.length} 次`}
          />
          <ResultFact
            label="最近训练"
            value={latest?.gameContent.name ?? "待训练"}
          />
          <ResultFact
            label="医生状态"
            value={
              doctorReview?.description ??
              "完成训练后，医生会看到需要关注的情况。"
            }
          />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onBackToday}>返回今日训练</Button>
      </div>
    </section>
  );
}

type CompletedTrainingSession = TrainingRecordSession & {
  result: NonNullable<TrainingRecordSession["result"]>;
};

function hasTrainingResult(
  session: TrainingRecordSession,
): session is CompletedTrainingSession {
  return session.sessionStatus === "completed" && Boolean(session.result);
}

function isValidTrainingResult(session: CompletedTrainingSession) {
  return session.result.qualityFlag === "valid" && !session.result.abnormalFlag;
}

function ResultFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4">
      <div className="text-sm font-black text-[var(--accent-strong)]">
        {label}
      </div>
      <p className="mt-2 break-words text-base font-black leading-6 text-[var(--ink-strong)]">
        {value}
      </p>
    </div>
  );
}

function summarizeTrend(sessions: CompletedTrainingSession[]) {
  if (!sessions.length) {
    return {
      description: "完成训练后，这里会显示近期完成情况和变化方向。",
      title: "暂无近期趋势",
    };
  }

  const direction =
    sessions.length === 1
      ? "已形成第一条训练记录。"
      : "近期训练记录已持续保存。";

  return {
    description: `${direction} 医生会结合多次记录判断是否调整方案。`,
    title: "近期趋势",
  };
}

type DoctorReviewPresentation = {
  description: string;
  label: string;
  status: StatusBadgeStatus;
} & ({ reviewed: false } | { reviewNote: string; reviewed: true });

function patientDoctorReviewStatus(
  result: TrainingResult,
): DoctorReviewPresentation {
  if (result.reviewStatus !== "reviewed") {
    return result.abnormalFlag || result.qualityFlag !== "valid"
      ? {
          description: "本次记录需要医师复核，请等待医师给出具体建议。",
          label: "尚未复核",
          reviewed: false,
          status: "pending",
        }
      : {
          description: "本次训练记录已保存，无需医师复核。",
          label: "无需复核",
          reviewed: false,
          status: "ready",
        };
  }

  if (typeof result.reviewNote !== "string" || !result.reviewNote.trim()) {
    throw new Error("已复核训练结果缺少具体复核建议。");
  }

  const reviewedState = {
    reviewNote: result.reviewNote,
    reviewed: true as const,
  };
  switch (result.reviewConclusion) {
    case "accepted_valid":
      return {
        ...reviewedState,
        description: "医师已接受本次训练记录。",
        label: "已接受",
        status: "complete",
      };
    case "confirmed_abnormal":
      return {
        ...reviewedState,
        description: "医师确认本次训练存在需要关注的情况。",
        label: "需关注",
        status: "blocked",
      };
    case "excluded_from_analysis":
      return {
        ...reviewedState,
        description: "医师已将本次记录排除在后续分析之外。",
        label: "需关注",
        status: "blocked",
      };
    case "needs_retrain":
      return {
        ...reviewedState,
        description: "医师建议重新训练。",
        label: "需关注",
        status: "blocked",
      };
    default:
      throw new Error("已复核训练结果包含无效复核结论。");
  }
}
