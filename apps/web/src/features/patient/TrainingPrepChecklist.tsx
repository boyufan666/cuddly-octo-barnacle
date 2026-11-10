import { PoseCheckPreview, type CheckPoseAction } from "./PoseCheckPreview";
import { Camera, CheckCircle2, Footprints, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  StatusBadge,
  type StatusBadgeStatus,
} from "@/components/ui/StatusBadge";
import { resolveTrainingStartReadiness } from "@/lib/training-start-readiness";
import type { RehabPlan } from "@/types/api";

type TrainingTask = RehabPlan["items"][number];

type TrainingReadinessView = {
  cameraPermission: "unknown" | "requesting" | "granted" | "denied";
  cameraDeviceId?: string;
  checkedAt?: string;
  error?: string;
  poseCheckStatus: "unknown" | "loading" | "ready" | "error";
  poseCheckedAt?: string;
  poseError?: string;
};

type TrainingPrepChecklistProps = {
  gameReady: boolean;
  hasCameraConsent: boolean;
  hasTrainingPreparation: boolean;
  isBusy: boolean;
  isRefreshingPreparation: boolean;
  onCheckDevice: () => Promise<void>;
  onCheckPose: CheckPoseAction;
  onRefreshTrainingPreparation: (planItem?: TrainingTask) => Promise<void>;
  onStartTraining: () => Promise<void>;
  planItem?: TrainingTask;
  readiness: TrainingReadinessView;
  requiresCameraCheck: boolean;
};

export function TrainingPrepChecklist({
  gameReady,
  hasCameraConsent,
  hasTrainingPreparation,
  isBusy,
  isRefreshingPreparation,
  onCheckDevice,
  onCheckPose,
  onRefreshTrainingPreparation,
  onStartTraining,
  planItem,
  readiness,
  requiresCameraCheck,
}: TrainingPrepChecklistProps) {
  const cameraDeviceReady =
    readiness.cameraPermission === "granted" &&
    Boolean(readiness.cameraDeviceId);
  const poseCheckReady = readiness.poseCheckStatus === "ready";
  const poseCheckDescription = resolvePatientPoseCheckDescription(
    readiness.poseCheckStatus,
    requiresCameraCheck,
    readiness.poseError,
  );
  const deviceReady = !requiresCameraCheck || cameraDeviceReady;
  const poseReady = !requiresCameraCheck || poseCheckReady;
  const startReadiness = resolveTrainingStartReadiness({
    hasPlanItem: Boolean(planItem),
    gameReady,
    requiresCameraCheck,
    deviceReady,
    poseReady,
    trainingPreparationReady: hasTrainingPreparation,
    isBusy,
  });

  const steps: Array<{
    action: string;
    description: string;
    icon: typeof ListChecks;
    label: string;
    ready: boolean;
    status: string;
  }> = [
    {
      action: hasTrainingPreparation
        ? "训练结果会按本次安排保存。"
        : "请联系医师或工作人员确认今日准备状态，也可以手动同步一次。",
      description: planItem
        ? `${planItem.gameContent.name}，${planItem.durationMinutes} 分钟。`
        : "请先回到今日页面选择训练项目。",
      icon: ListChecks,
      label: "训练安排",
      ready: Boolean(planItem) && gameReady && hasTrainingPreparation,
      status: hasTrainingPreparation ? "可以训练" : "待确认",
    },
    {
      action: !requiresCameraCheck
        ? "本次训练不需要摄像头检查。"
        : cameraDeviceReady
          ? "保持摄像头角度不变。"
          : "请点击检测摄像头，并允许使用摄像头。",
      description: !requiresCameraCheck
        ? "按训练提示完成操作即可。"
        : hasCameraConsent
          ? "摄像头授权已开启。"
          : "请先到我的页面确认摄像头授权。",
      icon: Camera,
      label: "摄像头",
      ready: deviceReady,
      status: deviceReady ? "已确认" : "待检测",
    },
    {
      action: !requiresCameraCheck
        ? "本次训练不需要站位检查。"
        : poseCheckReady
          ? "检查已通过，训练时请保持上半身入镜。"
          : "请在实时画面中调整位置，再完成站位检查。",
      description: !requiresCameraCheck
        ? "训练过程中请跟随页面提示。"
        : poseCheckDescription,
      icon: Footprints,
      label: "站位",
      ready: poseReady,
      status: poseReady ? "已确认" : "待检查",
    },
  ];

  return (
    <section
      className="patient-task-layout grid gap-5"
      data-testid="patient-prep-flow"
    >
      <div>
        <p className="text-sm font-black text-[var(--accent-strong)]">
          训练准备
        </p>
        <h2 className="mt-2 text-3xl font-black text-[var(--ink-strong)] md:text-4xl">
          训练前检查
        </h2>
        <p className="mt-3 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
          按顺序完成三步检查。全部通过后，开始按钮会自动可用。
        </p>
      </div>

      <Card tone="patient" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusBadge status={startReadiness.canStart ? "ready" : "pending"}>
              {startReadiness.canStart ? "可以训练" : "继续检查"}
            </StatusBadge>
            <h3 className="mt-3 break-words text-2xl font-black text-[var(--ink-strong)]">
              {planItem?.gameContent.name ?? "请选择训练项目"}
            </h3>
          </div>
          {!hasTrainingPreparation ? (
            <Button
              intent="secondary"
              isLoading={isRefreshingPreparation}
              onClick={() => void onRefreshTrainingPreparation(planItem)}
            >
              同步训练安排
            </Button>
          ) : null}
        </div>

        <ol className="grid gap-3">
          {steps.map((step, index) => (
            <PrepStepCard key={step.label} index={index + 1} {...step} />
          ))}
        </ol>

        {requiresCameraCheck ? (
          <div className="grid gap-3 md:grid-cols-2 md:items-start">
            <Button
              intent="secondary"
              isLoading={readiness.cameraPermission === "requesting"}
              onClick={() => void onCheckDevice()}
            >
              检测摄像头
            </Button>
            <PoseCheckPreview
              onCheckPose={onCheckPose}
              disabled={!hasCameraConsent || !cameraDeviceReady}
              isChecking={readiness.poseCheckStatus === "loading"}
            />
          </div>
        ) : null}

        <Button
          className="w-full"
          data-testid="patient-prep-start-cta"
          disabled={!startReadiness.canStart || isBusy}
          isLoading={isBusy}
          onClick={() => void onStartTraining()}
        >
          检查完成，开始训练
        </Button>
        {!startReadiness.canStart ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 font-bold leading-7 text-[var(--warning-strong)]">
            {startReadiness.message}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function resolvePatientPoseCheckDescription(
  status: TrainingReadinessView["poseCheckStatus"],
  requiresCameraCheck: boolean,
  poseError?: string,
) {
  if (!requiresCameraCheck) {
    return "训练过程中请跟随页面提示。";
  }
  if (status === "ready") {
    return "站位检查通过后即可进入训练。";
  }
  if (status === "error") {
    return poseError ?? "站位检查未完成，请查看检查提示。";
  }
  if (status === "loading") {
    return "正在读取摄像头姿态，请保持上半身入镜。";
  }
  return "站位检查通过后即可进入训练。";
}

function PrepStepCard({
  action,
  description,
  icon: Icon,
  index,
  label,
  ready,
  status,
}: {
  action: string;
  description: string;
  icon: typeof ListChecks;
  index: number;
  label: string;
  ready: boolean;
  status: string;
}) {
  const badgeStatus: StatusBadgeStatus = ready ? "complete" : "pending";
  return (
    <li className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent-soft)] text-lg font-black text-[var(--accent-strong)]">
        {index}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-5 w-5 text-[var(--accent-strong)]" />
          <h4 className="text-lg font-black text-[var(--ink-strong)]">
            {label}
          </h4>
          {ready ? (
            <CheckCircle2 className="h-5 w-5 text-[var(--success-strong)]" />
          ) : null}
        </div>
        <p className="mt-1 font-bold leading-6 text-[var(--ink-soft)]">
          {description}
        </p>
        <p className="mt-1 text-sm font-bold leading-6 text-[var(--ink-soft)]">
          {action}
        </p>
      </div>
      <StatusBadge status={badgeStatus}>{status}</StatusBadge>
    </li>
  );
}
