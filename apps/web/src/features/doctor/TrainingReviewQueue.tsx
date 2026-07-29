"use client";

import { Activity, MonitorCheck } from "lucide-react";
import type {
  SubmitTrainingReviewRequest,
  TrainingRecordSession,
  TrainingRecordsResponse,
  TrainingReviewConclusion,
} from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type TrainingReviewQueueFormState = {
  resultId: string;
  reviewConclusion: "" | TrainingReviewConclusion;
  reviewNote: string;
};

type TrainingReviewQueueProps = {
  trainingRecords?: TrainingRecordsResponse | null;
  form: TrainingReviewQueueFormState;
  onChange: <K extends keyof TrainingReviewQueueFormState>(
    field: K,
    value: TrainingReviewQueueFormState[K],
  ) => void;
  onSubmit: (
    resultId: string,
    payload: SubmitTrainingReviewRequest,
  ) => void | Promise<void>;
  isBusy?: boolean;
};

export function TrainingReviewQueue({
  trainingRecords,
  form,
  onChange,
  onSubmit,
  isBusy,
}: TrainingReviewQueueProps) {
  const sessions = findTrainingSessionsRequiringReview(trainingRecords);
  const selectedSession = sessions.find(
    (session) => session.result?.id === form.resultId,
  );
  const canSubmit = Boolean(selectedSession && isTrainingReviewFormComplete(form));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSession?.result || !canSubmit || isBusy) return;
    void onSubmit(selectedSession.result.id, {
      reviewConclusion: form.reviewConclusion as TrainingReviewConclusion,
      reviewNote: form.reviewNote.trim(),
    });
  }

  return (
    <Card tone="workbench">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <MonitorCheck className="h-4 w-4" aria-hidden="true" />
            训练复核
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            待复核训练结果
          </h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            仅列出真实回传且被标记为异常或质量可疑的训练结果。必须选择结果、人工结论和复核说明后才能保存。
          </p>
        </div>
        <StatusBadge status={sessions.length ? "pending" : "complete"}>
          {sessions.length ? `${sessions.length} 条待复核` : "无待复核结果"}
        </StatusBadge>
      </div>

      {sessions.length ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)]">
            {sessions.map((session) => {
              const result = session.result;
              const selected = result?.id === form.resultId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onChange("resultId", result?.id ?? "")}
                  className={[
                    "block w-full border-b border-[var(--line-subtle)] bg-[var(--surface-paper)] p-5 text-left transition last:border-b-0 hover:bg-[var(--surface-muted)]",
                    selected ? "bg-[var(--surface-muted)] ring-2 ring-inset ring-[var(--accent-strong)]/30" : "",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-[var(--ink-strong)]">
                        {session.gameContent.name}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[var(--ink-subtle)]">
                        {formatDateTime(session.startedAt)} · 会话 {shortId(session.id)}
                      </p>
                    </div>
                    <StatusBadge status={result?.abnormalFlag ? "blocked" : "pending"}>
                      {qualityLabel(result?.qualityFlag)}
                    </StatusBadge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <ResultMetric label="得分" value={scoreLabel(result?.score, "分")} />
                    <ResultMetric
                      label="完成率"
                      value={percentLabel(result?.completionRate)}
                    />
                    <ResultMetric
                      label="反应时间"
                      value={scoreLabel(result?.reactionTimeMs, "ms")}
                    />
                    <ResultMetric
                      label="动作准确率"
                      value={percentLabel(result?.motionAccuracy)}
                    />
                  </div>
                  <p className="mt-4 rounded-[var(--radius-card)] bg-[var(--warning-soft)] px-4 py-3 text-sm font-bold leading-6 text-[var(--warning-strong)]">
                    {result?.qualityReasons?.length
                      ? result.qualityReasons.join("；")
                      : "质量原因未记录"}
                  </p>
                </button>
              );
            })}
          </div>

          <form
            onSubmit={submit}
            className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5"
          >
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Activity className="h-5 w-5" aria-hidden="true" />
              <h4 className="text-xl font-black text-[var(--ink-strong)]">录入复核结论</h4>
            </div>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-subtle)]">
              {selectedSession
                ? `${selectedSession.gameContent.name} · 结果 ${shortId(selectedSession.result?.id ?? selectedSession.id)}`
                : "请先选择待复核训练结果"}
            </p>
            <SelectField
              label="复核结论"
              value={form.reviewConclusion}
              disabled={!selectedSession || isBusy}
              onChange={(value) =>
                onChange(
                  "reviewConclusion",
                  value as TrainingReviewQueueFormState["reviewConclusion"],
                )
              }
              options={[
                ["", "请选择人工结论"],
                ["confirmed_abnormal", "确认异常"],
                ["accepted_valid", "人工采纳为有效"],
                ["excluded_from_analysis", "排除统计分析"],
                ["needs_retrain", "建议重新训练"],
              ]}
            />
            <TextAreaField
              label="复核说明"
              value={form.reviewNote}
              onChange={(value) => onChange("reviewNote", value)}
              disabled={!selectedSession || isBusy}
            />
            <Button
              className="mt-5 w-full"
              disabled={!canSubmit || isBusy}
              isLoading={isBusy}
              type="submit"
            >
              保存复核结论
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-paper)] p-5 font-bold leading-7 text-[var(--ink-subtle)]">
          当前患者没有需要医师复核的训练结果。
        </div>
      )}
    </Card>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-2">
      <p className="text-xs font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-black text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 font-mono text-lg font-bold outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-soft)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-32 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 text-lg font-bold leading-7 outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-soft)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </label>
  );
}

function findTrainingSessionsRequiringReview(
  trainingRecords?: TrainingRecordsResponse | null,
): TrainingRecordSession[] {
  return (trainingRecords?.sessions ?? []).filter(
    (session): session is TrainingRecordSession =>
      Boolean(session.result) &&
      (session.result?.abnormalFlag === true ||
        session.result?.qualityFlag !== "valid") &&
      session.result?.reviewStatus !== "reviewed",
  );
}

function isTrainingReviewFormComplete(form: TrainingReviewQueueFormState) {
  return Boolean(
    form.resultId.trim() && form.reviewConclusion && form.reviewNote.trim(),
  );
}

function qualityLabel(value?: string | null) {
  if (value === "valid") return "质量有效";
  if (value === "low_quality") return "质量可疑";
  if (value === "invalid") return "质量无效";
  return value || "质量未标记";
}

function scoreLabel(value: number | undefined, unit: string) {
  if (value === undefined) return "未记录";
  return `${value}${unit}`;
}

function percentLabel(value: number | undefined) {
  if (value === undefined) return "未记录";
  return `${Math.round(value * 100)}%`;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDateTime(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
