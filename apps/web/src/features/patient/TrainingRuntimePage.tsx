import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  RehabPlan,
  SubmitTrainingResultRequest,
} from "@/types/api";

export type PatientTrainingResultDraft = {
  payload: SubmitTrainingResultRequest;
};

type PatientTrainingSessionPageProps = {
  ariaSummary?: string;
  isBusy: boolean;
  onTrainingResultReady: (payload: SubmitTrainingResultRequest) => void;
  onSubmitResult: () => Promise<void>;
  planItem: RehabPlan["items"][number];
  primaryActionLabel?: string;
  renderTrainingStage: (
    onResultReady: (payload: SubmitTrainingResultRequest) => void,
  ) => ReactNode;
  resultDraft?: PatientTrainingResultDraft | null;
};

export function PatientTrainingSessionPage({
  ariaSummary = "训练表现",
  isBusy,
  onTrainingResultReady,
  onSubmitResult,
  planItem,
  primaryActionLabel = "完成本次训练",
  renderTrainingStage,
  resultDraft,
}: PatientTrainingSessionPageProps) {
  const isResultReady = Boolean(resultDraft);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isResultReady || isBusy) return;
    void onSubmitResult();
  }

  return (
    <section
      className="training-capture-layout grid min-h-[680px] gap-4"
    >
      <div className="training-capture-main grid gap-4">
        <div className="training-stage-shell min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--ink-strong)] p-4 text-[var(--ink-inverse)] shadow-[var(--shadow-panel)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-2xl font-black sm:text-3xl">
                {planItem.gameContent.name}
              </h3>
              <p className="mt-2 font-bold leading-6 text-[var(--accent-soft)]">
                跟随提示完成训练，结束后确认保存本次表现。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={isResultReady ? "complete" : "ready"}>
                {isResultReady ? "可以确认" : "训练中"}
              </StatusBadge>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-inverse)] bg-[var(--surface-inverse-muted)]">
            {renderTrainingStage(onTrainingResultReady)}
          </div>
        </div>
      </div>

      {isResultReady ? (
        <Card tone="patient" className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusBadge status="complete">本次表现摘要</StatusBadge>
              <h4 className="mt-3 text-2xl font-black text-[var(--ink-strong)]">
                训练已完成，请确认保存
              </h4>
              <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
                本次训练记录已经生成。确认后，医生可以查看记录并按需要给出建议。
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <form
        onSubmit={submit}
        aria-label={ariaSummary}
        className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4 shadow-[var(--shadow-panel)] md:static"
        data-testid="patient-training-primary-action"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            {isResultReady
              ? "确认后，医生可以查看本次训练表现并按需要给出建议。"
              : "请先完成屏幕中的训练，生成本次表现摘要后再确认。"}
          </p>
          <Button disabled={!isResultReady || isBusy} isLoading={isBusy} type="submit">
            {primaryActionLabel}
          </Button>
        </div>
      </form>
    </section>
  );
}
