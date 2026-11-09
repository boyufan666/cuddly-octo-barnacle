"use client";

import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrowserPoseTrainingSurface } from "@/features/training-runtime/BrowserPoseTrainingSurface";
import { CognitiveTrainingSurface } from "@/features/training-runtime/CognitiveTrainingSurface";
import { UnityTrainingSurface } from "@/features/training-runtime/UnityTrainingSurface";
import type {
  RehabPlan,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";

type PatientTrainingRuntimeStageProps = {
  isTtsBusy: boolean;
  onCreateTtsSpeechOutput: (
    request: PatientTrainingEncouragementRequest,
  ) => Promise<void>;
  onResultReady: (payload: SubmitTrainingResultRequest) => void;
  planItem?: RehabPlan["items"][number];
  trainingSession: TrainingSession | null;
};

export type PatientTrainingEncouragementRequest = Readonly<{
  scenario: "training_encouragement";
  text: string;
}>;

export function PatientTrainingRuntimeStage({
  isTtsBusy,
  onCreateTtsSpeechOutput,
  onResultReady,
  planItem,
  trainingSession,
}: PatientTrainingRuntimeStageProps) {
  if (!planItem || !trainingSession) {
    return <TrainingRuntimeUnavailable reason="训练尚未开始，请先完成训练准备。" />;
  }
  const encouragementRequest = buildPatientTrainingEncouragementRequest(
    planItem.gameContent.name,
  );
  let trainingSurface;
  if (planItem.gameContent.runtimeType === "unity_webgl") {
    trainingSurface = (
      <UnityTrainingSurface
        durationMinutes={planItem.durationMinutes}
        game={planItem.gameContent}
        onResultReady={onResultReady}
        trainingSession={trainingSession}
      />
    );
  } else if (planItem.gameContent.runtimeType === "browser_pose_canvas") {
    trainingSurface = (
      <BrowserPoseTrainingSurface
        durationMinutes={planItem.durationMinutes}
        game={planItem.gameContent}
        trainingSession={trainingSession}
        onResultReady={onResultReady}
      />
    );
  } else if (planItem.gameContent.runtimeType === "cognitive_web") {
    trainingSurface = (
      <CognitiveTrainingSurface
        durationMinutes={planItem.durationMinutes}
        game={planItem.gameContent}
        key={trainingSession.id}
        trainingSession={trainingSession}
        onResultReady={onResultReady}
      />
    );
  } else {
    return <TrainingRuntimeUnavailable reason="训练内容未准备好，请联系工作人员" />;
  }

  return (
    <section aria-label="训练运行区" className="grid">
      <PatientTrainingEncouragementControl
        isTtsBusy={isTtsBusy}
        onCreateTtsSpeechOutput={onCreateTtsSpeechOutput}
        request={encouragementRequest}
      />
      {trainingSurface}
    </section>
  );
}

export function PatientTrainingEncouragementControl({
  isTtsBusy,
  onCreateTtsSpeechOutput,
  request,
}: {
  isTtsBusy: boolean;
  onCreateTtsSpeechOutput: (
    request: PatientTrainingEncouragementRequest,
  ) => Promise<void>;
  request: PatientTrainingEncouragementRequest;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line-inverse)] bg-[var(--surface-inverse-muted)] p-4 text-[var(--ink-inverse)]">
      <div className="flex min-w-0 items-start gap-3">
        <Volume2
          aria-hidden="true"
          className="mt-1 h-5 w-5 shrink-0 text-[var(--accent-soft)]"
        />
        <div className="min-w-0">
          <p className="font-black">需要一点鼓励？</p>
          <p
            className="mt-1 max-w-2xl text-sm font-bold leading-6 text-[var(--ink-inverse-soft)]"
            id="training-encouragement-description"
          >
            仅在你点击后生成并播放一次训练鼓励，不会自动连续调用。
          </p>
        </div>
      </div>
      <Button
        aria-describedby="training-encouragement-description"
        disabled={isTtsBusy}
        intent="secondary"
        isLoading={isTtsBusy}
        onClick={() => {
          void onCreateTtsSpeechOutput(request);
        }}
        size="sm"
      >
        播放训练鼓励
      </Button>
    </div>
  );
}

export function buildPatientTrainingEncouragementRequest(
  gameName: string,
): PatientTrainingEncouragementRequest {
  const normalizedGameName = gameName.trim();
  if (!normalizedGameName) {
    throw new Error("训练内容名称不能为空，不能生成训练鼓励。");
  }
  return {
    scenario: "training_encouragement",
    text: `你正在进行${normalizedGameName}。保持节奏，专注完成每一步，你做得很好。`,
  };
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
