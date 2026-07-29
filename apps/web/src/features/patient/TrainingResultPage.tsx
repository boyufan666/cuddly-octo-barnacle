import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TrainingRecordsResponse } from "@/types/api";

type TrainingResultPageProps = {
  onBackToday: () => void;
  trainingRecords?: TrainingRecordsResponse;
};

export function TrainingResultPage({
  onBackToday,
  trainingRecords,
}: TrainingResultPageProps) {
  const latest = trainingRecords?.sessions.find((session) => session.result);
  const result = latest?.result;
  const doctorStatus = result
    ? patientDoctorReviewStatus(result.reviewConclusion, result.abnormalFlag)
    : "完成训练后，医生会看到需要关注的情况。";
  const completedSessions = trainingRecords?.sessions.filter((session) => session.result) ?? [];
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
                <p className="text-sm font-black text-[var(--accent-strong)]">训练记录</p>
                <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
                  最近一次训练已经进入记录页，可按今日安排继续下一项。
                </p>
              </div>
              <div>
                <p className="text-sm font-black text-[var(--accent-strong)]">医生状态</p>
                <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
                  {doctorStatus}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-[var(--line-subtle)] bg-[var(--surface-panel)] p-6">
            <h3 className="text-2xl font-black text-[var(--ink-strong)]">暂无训练结果</h3>
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
          <ResultFact label="已保存记录" value={`${completedSessions.length} 次`} />
          <ResultFact label="最近训练" value={latest?.gameContent.name ?? "待训练"} />
          <ResultFact label="医生状态" value={doctorStatus} />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onBackToday}>
          返回今日训练
        </Button>
      </div>
    </section>
  );
}

function ResultFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4">
      <div className="text-sm font-black text-[var(--accent-strong)]">{label}</div>
      <p className="mt-2 break-words text-base font-black leading-6 text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function summarizeTrend(sessions: TrainingRecordsResponse["sessions"]) {
  if (!sessions.length) {
    return {
      averageCompletion: "待生成",
      averageMotion: "待生成",
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

function patientDoctorReviewStatus(
  reviewConclusion?: string | null,
  abnormalFlag?: boolean,
) {
  if (reviewConclusion === "needs_retrain") return "医生建议重新训练，请按提醒安排下一次训练。";
  if (reviewConclusion) return "医生已确认本次训练记录。";
  return abnormalFlag ? "本次表现等待医生确认。" : "本次训练记录已保存。";
}
