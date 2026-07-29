import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  PatientProfile,
  RehabPlan,
  TrainingRecordSession,
  TrainingRecordsResponse,
} from "@/types/api";
import { TodayTrainingPage } from "./TodayTrainingPage";

declare global {
  interface Window {
    todayTrainingHarness: {
      showActiveSession: () => void;
      snapshot: () => {
        abortReasons: string[];
        resumeCalls: number;
      };
      succeedNextAbort: () => void;
    };
  }
}

const patient = { id: "patient-1", name: "王阿姨" } as PatientProfile;
const gameContent = {
  id: "game-1",
  name: "记忆训练",
  trainingTargets: ["memory"],
  tags: ["认知"],
  runtimeType: "cognitive_web",
};
const currentPlan = {
  id: "plan-1",
  patientId: "patient-1",
  items: [
    {
      id: "item-1",
      rehabPlanId: "plan-1",
      gameContentId: "game-1",
      durationMinutes: 10,
      difficulty: "medium",
      gameContent,
    },
  ],
} as RehabPlan;
const activeSession = {
  id: "session-1",
  patientId: "patient-1",
  rehabPlanId: "plan-1",
  planItemId: "item-1",
  gameContentId: "game-1",
  collectionBatchId: "batch-1",
  sessionStatus: "started",
  result: null,
  gameContent,
} as TrainingRecordSession;
const todayTrainingRecords = {
  sessions: [activeSession],
  summary: {
    totalSessions: 1,
    completedSessions: 0,
    averageScore: 0,
    abnormalCount: 0,
  },
} as TrainingRecordsResponse;

function Harness() {
  const [abortReasons, setAbortReasons] = useState<string[]>([]);
  const [abortOutcome, setAbortOutcome] = useState<"failure" | "success">(
    "failure",
  );
  const [hasActiveSession, setHasActiveSession] = useState(true);
  const [isAborting, setIsAborting] = useState(false);
  const [resumeCalls, setResumeCalls] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    window.todayTrainingHarness = {
      showActiveSession: () => setHasActiveSession(true),
      snapshot: () => ({ abortReasons, resumeCalls }),
      succeedNextAbort: () => setAbortOutcome("success"),
    };
  }, [abortReasons, resumeCalls]);

  return (
    <>
      {status ? <p role="alert">{status}</p> : null}
      <TodayTrainingPage
        activeTrainingResolution={
          hasActiveSession
            ? {
                status: "resumable",
                session: activeSession,
                planItem: currentPlan.items[0],
              }
            : { status: "none" }
        }
        currentPlan={currentPlan}
        isAbortingTraining={isAborting}
        isResumingTraining={false}
        onAbortTraining={async (reason) => {
          setIsAborting(true);
          setAbortReasons((current) => [...current, reason]);
          await Promise.resolve();
          if (abortOutcome === "success") {
            setHasActiveSession(false);
            setStatus("本次训练已终止。");
          } else {
            setStatus("终止失败，本次训练仍可继续，请稍后再试。");
          }
          setIsAborting(false);
        }}
        onResumeTraining={async () => {
          setResumeCalls((current) => current + 1);
        }}
        onStartPreparation={() => undefined}
        onViewRecords={() => undefined}
        patient={patient}
        todayTrainingRecords={todayTrainingRecords}
      />
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Harness />);
