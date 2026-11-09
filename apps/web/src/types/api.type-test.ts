import type {
  PatientRiskGrade,
  PatientTrainingRecordSession,
  PatientTrainingRecordsResponse,
  PatientTrainingResult,
  RiskGrade,
} from "./api";

const patientRiskGrade = {
  riskLevel: "moderate",
  systemRiskLevel: "moderate",
  manualRiskLevel: null,
  reasonSummary: "医生已确认的患者风险摘要。",
  isCurrent: true,
  confirmedAt: "2026-08-15T08:00:00.000Z",
} satisfies PatientRiskGrade;

const clinicianRiskGrade = {
  id: "risk-grade-id",
  riskLevel: "moderate",
  systemRiskLevel: "moderate",
  manualRiskLevel: null,
  reasonSummary: "医生工作台风险证据。",
  isCurrent: true,
  confirmedById: null,
  confirmedAt: null,
} satisfies RiskGrade;

const patientTrainingResult = {
  id: "training-result-id",
  score: 86,
  completionRate: 0.9,
  durationSeconds: 180,
  reactionTimeMs: 420,
  motionAccuracy: 0.91,
  exerciseIntensity: "moderate",
  abnormalFlag: false,
  qualityFlag: "valid",
  reviewStatus: null,
  reviewConclusion: null,
  reviewNote: null,
  reviewedAt: null,
  createdAt: "2026-08-15T08:00:00.000Z",
} satisfies PatientTrainingResult;

const patientTrainingRecordSession = {
  id: "training-session-id",
  planItemId: "plan-item-id",
  calibrationStatus: "checked",
  sessionStatus: "completed",
  startedAt: "2026-08-15T07:55:00.000Z",
  endedAt: "2026-08-15T08:00:00.000Z",
  interruptReason: null,
  syncStatus: "synced",
  gameContent: {
    id: "game-content-id",
    name: "节奏触达",
    trainingTargets: ["上肢触达", "反应速度"],
    tags: ["低强度"],
    defaultDuration: 10,
    defaultDifficulty: "基础",
  },
  result: patientTrainingResult,
} satisfies PatientTrainingRecordSession;

const patientRiskResponse: RiskGrade = patientRiskGrade;
const clinicianRiskResponse: RiskGrade = clinicianRiskGrade;
const patientTrainingRecordsResponse = {
  sessions: [patientTrainingRecordSession],
  summary: {
    totalSessions: 1,
    completedSessions: 1,
    averageScore: 86,
    abnormalCount: 0,
  },
} satisfies PatientTrainingRecordsResponse;

const unsafePatientRiskGrade = {
  ...patientRiskGrade,
  // @ts-expect-error 患者脱敏风险响应不包含内部风险记录 ID。
  id: "internal-risk-id",
} satisfies PatientRiskGrade;

const unsafePatientTrainingResult = {
  ...patientTrainingResult,
  // @ts-expect-error 患者脱敏训练结果不包含原始载荷哈希。
  rawPayloadHash: "sha256:internal-payload",
} satisfies PatientTrainingResult;

const unsafePatientTrainingSession = {
  ...patientTrainingRecordSession,
  // @ts-expect-error 患者脱敏训练记录顶层不包含 patientId。
  patientId: "patient-profile-id",
} satisfies PatientTrainingRecordSession;

const unsafePatientGameContent = {
  ...patientTrainingRecordSession,
  gameContent: {
    ...patientTrainingRecordSession.gameContent,
    // @ts-expect-error 患者训练记录中的游戏信息不包含运行时类型。
    runtimeType: "browser_pose_canvas",
  },
} satisfies PatientTrainingRecordSession;

void patientRiskResponse;
void clinicianRiskResponse;
void patientTrainingRecordsResponse;
void unsafePatientRiskGrade;
void unsafePatientTrainingResult;
void unsafePatientTrainingSession;
void unsafePatientGameContent;
