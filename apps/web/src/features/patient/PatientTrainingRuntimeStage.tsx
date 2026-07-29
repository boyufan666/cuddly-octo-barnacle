"use client";

import { BrowserPoseTrainingSurface } from "@/features/training-runtime/BrowserPoseTrainingSurface";
import { CognitiveTrainingSurface } from "@/features/training-runtime/CognitiveTrainingSurface";
import { UnityTrainingSurface } from "@/features/training-runtime/UnityTrainingSurface";
import type {
  RehabPlan,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";

type PatientTrainingRuntimeStageProps = {
  onResultReady: (payload: SubmitTrainingResultRequest) => void;
  planItem?: RehabPlan["items"][number];
  trainingSession: TrainingSession | null;
};

export function PatientTrainingRuntimeStage({
  onResultReady,
  planItem,
  trainingSession,
}: PatientTrainingRuntimeStageProps) {
  if (!planItem || !trainingSession) {
    return <TrainingRuntimeUnavailable reason="训练尚未开始，请先完成训练准备。" />;
  }
  if (planItem.gameContent.runtimeType === "unity_webgl") {
    return (
      <UnityTrainingSurface
        durationMinutes={planItem.durationMinutes}
        game={planItem.gameContent}
        onResultReady={onResultReady}
        trainingSession={trainingSession}
      />
    );
  }
  if (planItem.gameContent.runtimeType === "browser_pose_canvas") {
    return (
      <BrowserPoseTrainingSurface
        durationMinutes={planItem.durationMinutes}
        game={planItem.gameContent}
        trainingSession={trainingSession}
        onResultReady={onResultReady}
      />
    );
  }
  if (planItem.gameContent.runtimeType === "cognitive_web") {
    return (
      <CognitiveTrainingSurface
        durationMinutes={planItem.durationMinutes}
        game={planItem.gameContent}
        key={trainingSession.id}
        trainingSession={trainingSession}
        onResultReady={onResultReady}
      />
    );
  }
  return <TrainingRuntimeUnavailable reason="训练内容未准备好，请联系工作人员" />;
}

function TrainingRuntimeUnavailable({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-6 text-center">
      <p className="max-w-xl text-xl font-black leading-8 text-[var(--warning-strong)]">
        {reason}
      </p>
    </div>
  );
}
