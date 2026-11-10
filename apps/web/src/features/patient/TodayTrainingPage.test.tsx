import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  PatientProfile,
  RehabPlan,
  TrainingRecordSession,
  TrainingRecordsResponse,
} from "@/types/api";
import type { ActivePatientTrainingSessionResolution } from "./patient-training-actions";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

const patient = {
  id: "patient-1",
  name: "王阿姨",
} as PatientProfile;
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
  id: "session-secret-id",
  patientId: "patient-1",
  rehabPlanId: "plan-1",
  planItemId: "item-1",
  gameContentId: "game-1",
  collectionBatchId: "batch-secret-id",
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
const resumableResolution: ActivePatientTrainingSessionResolution = {
  status: "resumable",
  session: activeSession,
  planItem: currentPlan.items[0],
};

type TodayTrainingPageTestProps = {
  activeTrainingResolution: ActivePatientTrainingSessionResolution;
  currentPlan: RehabPlan;
  isAbortingTraining: boolean;
  isResumingTraining: boolean;
  onAbortTraining: (reason: string) => Promise<void>;
  onResumeTraining: () => Promise<void>;
  onStartPreparation: () => void;
  onViewRecords: () => void;
  patient: PatientProfile;
  todayTrainingRecords: TrainingRecordsResponse;
};

async function renderToday(
  overrides: Partial<TodayTrainingPageTestProps> = {},
) {
  const { TodayTrainingPage } = await import("./TodayTrainingPage");
  const Component = TodayTrainingPage as unknown as (
    props: TodayTrainingPageTestProps,
  ) => React.ReactNode;
  return renderToStaticMarkup(
    <Component
      activeTrainingResolution={resumableResolution}
      currentPlan={currentPlan}
      isAbortingTraining={false}
      isResumingTraining={false}
      onAbortTraining={async () => undefined}
      onResumeTraining={async () => undefined}
      onStartPreparation={() => undefined}
      onViewRecords={() => undefined}
      patient={patient}
      todayTrainingRecords={todayTrainingRecords}
      {...overrides}
    />,
  );
}

test("Today prioritizes the unfinished session without exposing technical identifiers", async () => {
  const html = await renderToday();

  assert.match(html, /有一项训练尚未完成/);
  assert.match(html, /继续本次训练/);
  assert.match(html, /终止本次训练/);
  assert.doesNotMatch(html, /开始训练准备/);
  assert.doesNotMatch(html, /aria-label="选择训练"|选择训练：/);
  assert.doesNotMatch(html, /session-secret-id|batch-secret-id|Provider/i);
});

test("Today hard-blocks inconsistent active records without offering a session action", async () => {
  const html = await renderToday({
    activeTrainingResolution: {
      status: "blocked",
      message: "训练记录出现异常，暂时无法继续，请联系工作人员处理。",
    },
  });

  assert.match(html, /联系工作人员/);
  assert.doesNotMatch(html, /继续本次训练|终止本次训练|开始训练准备/);
  assert.doesNotMatch(html, /aria-label="选择训练"|选择训练：/);
});

test("Today exposes the current plan choices while retaining its next-task recommendation", async () => {
  const html = await renderToday({
    activeTrainingResolution: { status: "none" },
    currentPlan: {
      ...currentPlan,
      items: [
        ...currentPlan.items,
        {
          ...currentPlan.items[0],
          id: "item-2",
          gameContent: { ...currentPlan.items[0].gameContent, name: "镜像训练" },
        },
      ],
    },
  });

  assert.match(html, /选择训练：记忆训练/);
  assert.match(html, /选择训练：镜像训练/);
  assert.match(html, /建议先做/);
  assert.match(html, /开始训练准备/);
});

test("completed plan items offer records instead of restarting training", async () => {
  const html = await renderToday({
    activeTrainingResolution: { status: "none" },
    todayTrainingRecords: {
      ...todayTrainingRecords,
      sessions: [{ ...activeSession, sessionStatus: "completed", result: {} } as TrainingRecordSession],
    },
  });

  assert.match(html, /查看训练记录：记忆训练/);
  assert.doesNotMatch(html, /选择训练：记忆训练|开始训练准备/);
});

test("resume and abort expose independent busy labels while preventing conflicting actions", async () => {
  const resumeBusyHtml = await renderToday({ isResumingTraining: true });
  const abortBusyHtml = await renderToday({ isAbortingTraining: true });

  assert.match(resumeBusyHtml, /正在继续训练/);
  assert.match(abortBusyHtml, /正在终止训练/);
  assert.match(resumeBusyHtml, /disabled=""/);
  assert.match(abortBusyHtml, /disabled=""/);
});
