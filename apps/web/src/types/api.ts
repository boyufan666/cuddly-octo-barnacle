export type RoleCode =
  | "patient"
  | "caregiver"
  | "doctor"
  | "admin"
  | "admin_super"
  | "admin_operator"
  | "admin_auditor";

export type AdminPermission =
  | "dashboard.view"
  | "audit.read"
  | "data.export"
  | "user.manage"
  | "game.manage"
  | "game.publish";

export type ConsentType =
  | "privacy_policy"
  | "ai_processing"
  | "camera_capture"
  | "microphone_capture"
  | "caregiver_sharing";

export type UserRole = {
  roleCode: RoleCode;
  relatedObjectType: string;
  relatedObjectId: string;
  organizationId?: string;
};

export type CurrentUser = {
  id: string;
  account: string;
  displayName: string;
  roles: UserRole[];
};

export type UserContext = {
  primaryRole?: RoleCode;
  patientIds: string[];
  caregiverPatientIds: string[];
  doctorPatientIds: string[];
  doctorIds: string[];
  organizationIds: string[];
  caregiverScopes: Record<string, unknown>;
  adminPermissions: AdminPermission[];
};

export type LoginResponse = {
  accessToken: string;
  user: CurrentUser;
  context: UserContext;
};

export type MeResponse = {
  user: CurrentUser;
  homePath: string;
  context: UserContext;
};

export type GameContent = {
  id: string;
  code: string;
  name: string;
  trainingTargets: string[];
  tags: string[];
  defaultDuration: number;
  defaultDifficulty: string;
  runtimeType: "unity_webgl" | "browser_pose_game";
  manifestUrl?: string | null;
  buildBaseUrl?: string | null;
  gameVersion?: string | null;
  bridgeProtocolVersion: string;
  buildStatus: "pending_assets" | "validating" | "released" | "rejected";
  releaseChannel: "development" | "staging" | "production";
  supportsCamera: boolean;
  supportsMicrophone: boolean;
  supportedInputModes: string[];
  requiredMetrics: unknown;
  status: "active" | "inactive" | "archived";
};

export type CreateGameContentRequest = {
  code: string;
  name: string;
  runtimeType: GameContent["runtimeType"];
  gameVersion?: string;
  trainingTargets: string[];
  tags: string[];
  defaultDuration: number;
  defaultDifficulty: string;
  supportsCamera: boolean;
  supportsMicrophone: boolean;
  supportedInputModes: string[];
  requiredMetrics: unknown;
};

export type UpdateGameContentStatusRequest = {
  status: "active" | "inactive" | "archived";
};

export type UpdateUnityBuildRequest = {
  manifestUrl: string;
  buildBaseUrl: string;
  gameVersion: string;
  bridgeProtocolVersion: "1.0.0";
  buildStatus: "pending_assets" | "validating" | "released" | "rejected";
  releaseChannel: "development" | "staging" | "production";
  supportsCamera: boolean;
  supportsMicrophone: boolean;
  supportedInputModes: string[];
  requiredMetrics: unknown;
};

export type RehabPlanItem = {
  id: string;
  rehabPlanId: string;
  gameContentId: string;
  sequence: number;
  durationMinutes: number;
  frequencyPerWeek: number;
  difficulty: string;
  adaptiveRules?: unknown;
  gameContent: GameContent;
};

export type RehabPlan = {
  id: string;
  patientId: string;
  doctorId?: string | null;
  planName: string;
  status: string;
  isCurrent: boolean;
  weekFrequency: number;
  dailyDuration: number;
  difficultyLadder?: unknown;
  recommendationReason: string;
  confirmedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items: RehabPlanItem[];
};

export type RiskGrade = {
  id: string;
  riskLevel: "low" | "moderate" | "high";
  systemRiskLevel: "low" | "moderate" | "high";
  manualRiskLevel?: "low" | "moderate" | "high" | null;
  reasonSummary: string;
  isCurrent: boolean;
};

export type AiAnalysis = {
  id: string;
  analysisScene: string;
  modelVersion: string;
  confidence: number;
  inputSummary: unknown;
  outputSummary: unknown;
};

export type AssessmentRecord = {
  id: string;
  assessmentType: string;
  scoreSummary: Record<string, unknown>;
  rawInputSummary: Record<string, unknown>;
  completedAt?: string | null;
  createdAt: string;
  riskGrades?: RiskGrade[];
  aiAnalyses?: AiAnalysis[];
};

export type ConsentRecord = {
  id: string;
  patientId: string;
  subjectUserId: string;
  consentType: ConsentType;
  consentVersion: string;
  status: "granted" | "revoked";
  grantedAt: string;
  revokedAt?: string | null;
  evidenceSnapshot: Record<string, unknown>;
};

export type CaregiverAccount = {
  id: string;
  account: string;
  displayName: string;
  mobilePhone?: string | null;
  accountStatus: "active" | "disabled" | "frozen" | "pending";
  createdAt: string;
};

export type CaregiverScope = {
  summary: boolean;
  reminders: boolean;
  progress: boolean;
  rawAssessment: boolean;
  planEdit: boolean;
};

export type CaregiverRelation = {
  id: string;
  caregiverUserId: string;
  patientId: string;
  relation: string;
  authorizationStatus: "active" | "inactive";
  authorizedAt: string;
  revokedAt?: string | null;
  scope: CaregiverScope;
  caregiver: {
    id: string;
    account: string;
    displayName: string;
    mobilePhone?: string | null;
  };
};

export type TrainingResult = {
  id: string;
  source: string;
  gameRunId: string;
  gameVersion: string;
  bridgeProtocolVersion: string;
  submittedByUserId?: string | null;
  submittedAt: string;
  clientGeneratedAt?: string | null;
  rawPayloadHash: string;
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: string;
  abnormalFlag: boolean;
  qualityFlag: string;
  qualityReasons: string[];
  metricsSummary?: unknown;
  createdAt: string;
};

export type TrainingSession = {
  id: string;
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  gameRunId?: string | null;
  clientStartedAt?: string | null;
  clientEndedAt?: string | null;
  deviceCode?: string | null;
  calibrationStatus: string;
  runtimeConfigSnapshot?: unknown;
  unityBuildVersion?: string | null;
  bridgeProtocolVersion?: string | null;
  uploadAttemptCount: number;
  lastUploadError?: string | null;
  sessionStatus: string;
  startedAt: string;
  endedAt?: string | null;
  interruptReason?: string | null;
  syncStatus: string;
  result?: TrainingResult | null;
  gameContent?: GameContent;
  motionMetrics?: unknown[];
};

export type TrainingRecordSession = TrainingSession & {
  gameContent: GameContent;
};

export type CreateAssessmentRequest = {
  patientId: string;
  assessmentType: string;
  scoreSummary: Record<string, number>;
  rawInputSummary: Record<string, unknown>;
};

export type CreatePatientRequest = {
  account: string;
  initialPassword: string;
  name: string;
  gender: string;
  age: number;
  mobilePhone?: string;
  caregiverName?: string;
  caregiverPhone?: string;
  responsibleDoctorId?: string;
  healthMetrics?: Record<string, unknown>;
};

export type CreateCaregiverAccountRequest = {
  account: string;
  initialPassword: string;
  displayName: string;
  mobilePhone?: string;
};

export type CreateConsentRequest = {
  patientId: string;
  subjectUserId: string;
  consentType: ConsentType;
  consentVersion: string;
  evidenceSnapshot: Record<string, unknown>;
};

export type CreateCaregiverRelationRequest = {
  caregiverAccount: string;
  relation: string;
  scope: CaregiverScope;
};

export type RecommendPlanRequest = {
  patientId: string;
};

export type ConfirmPlanRequest = {
  dailyDuration: number;
  weekFrequency: number;
  adjustmentReason: string;
  difficultyLadder?: Record<string, unknown>;
  itemAdjustments?: Array<{
    gameContentId: string;
    durationMinutes: number;
    frequencyPerWeek: number;
    difficulty: string;
  }>;
};

export type StartTrainingSessionRequest = {
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  idempotencyKey: string;
  gameRunId: string;
  deviceCode: string;
  calibrationStatus: "checked" | "completed";
  clientStartedAt: string;
};

export type SubmitTrainingResultRequest = {
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: "low" | "moderate" | "high";
  metricsSummary: Record<string, unknown>;
  motionMetrics: Array<{
    metricType: string;
    metricValue: number;
    confidence: number;
    unit?: string;
    sampleCount?: number;
    windowStartedAt?: string;
    windowEndedAt?: string;
    qualityFlag?: string;
    bodyPart?: string;
    jointName?: string;
    rawSummary?: Record<string, unknown>;
  }>;
};

export type DoctorProfile = {
  id: string;
  title: string;
  department: string;
  user: {
    displayName: string;
    account: string;
  };
};

export type PatientProfile = {
  id: string;
  userId: string;
  responsibleDoctorId?: string | null;
  name: string;
  gender: string;
  age: number;
  mobilePhone?: string | null;
  caregiverName?: string | null;
  caregiverPhone?: string | null;
  healthMetrics: Record<string, unknown>;
  responsibleDoctor?: DoctorProfile | null;
  riskGrades: RiskGrade[];
  rehabPlans: RehabPlan[];
  trainingSessions: TrainingRecordSession[];
  assessments: AssessmentRecord[];
  consents: ConsentRecord[];
  caregiverRelations: CaregiverRelation[];
};

export type TrainingRecordsResponse = {
  sessions: TrainingRecordSession[];
  summary: {
    totalSessions: number;
    completedSessions: number;
    averageScore: number;
    abnormalCount: number;
  };
};

export type CaregiverSummaryResponse = {
  patient: {
    id: string;
    name: string;
    age: number;
  };
  currentRisk: "low" | "moderate" | "high" | null;
  currentPlan?: RehabPlan | null;
  recentTraining: TrainingRecordSession[];
  permissions: {
    rawAssessment: boolean;
    planEdit: boolean;
    fullMedicalRecord: boolean;
  };
};

export type AuditLog = {
  id: string;
  actorRole?: RoleCode | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  result: "success" | "failed" | "denied";
  metadata?: unknown;
  createdAt: string;
  actor?: {
    displayName: string;
    account: string;
  } | null;
};

export type AuditLogFilters = {
  result?: "all" | AuditLog["result"];
  action?: string;
  targetType?: string;
  actorRole?: "all" | RoleCode;
  actorAccount?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type ExportDataset =
  | "patients"
  | "assessments"
  | "training-records"
  | "consents"
  | "audit-logs";

export type ExportFormat = "csv" | "json";

export type DataExportRequest = {
  dataset: ExportDataset;
  format: ExportFormat;
  reason: string;
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
  riskLevel?: "all" | "low" | "moderate" | "high";
  qualityFlag?: string;
  limit?: number;
};

export type DownloadedExport = {
  blob: Blob;
  filename: string;
};

export type DashboardCountRow = {
  key: string;
  count: number;
};

export type AdminDashboardResponse = {
  scope: {
    role: RoleCode;
    doctorIds: string[];
    patientIds: string[];
  };
  metrics: {
    users: number;
    patients: number;
    doctors: number;
    assessments: number;
    trainings: number;
    activePlans: number;
    pendingPlans: number;
    abnormalResults: number;
    onlineRate: string;
  };
  overview: {
    activeUsers: number;
    caregiverRelations: number;
    completedTrainings: number;
    todayAssessments: number;
    todayTrainings: number;
    consentRecords: number;
    deniedAudits: number;
    failedAudits: number;
  };
  distributions: {
    riskLevels: DashboardCountRow[];
    planStatuses: DashboardCountRow[];
    sessionStatuses: DashboardCountRow[];
    consentStatuses: DashboardCountRow[];
    deviceStatuses: DashboardCountRow[];
    qualityFlags: DashboardCountRow[];
    auditResults: DashboardCountRow[];
  };
  quality: {
    averageScore: number | null;
    averageCompletionRate: number | null;
    averageDurationSeconds: number | null;
    averageMotionAccuracy: number | null;
    averageReactionTimeMs: number | null;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    onlineRate: string;
  };
  consents: {
    total: number;
    byType: Array<{
      consentType: string;
      status: string;
      count: number;
    }>;
  };
  recentActions: Array<{
    action: string;
    count: number;
  }>;
  auditLogs: AuditLog[];
};
