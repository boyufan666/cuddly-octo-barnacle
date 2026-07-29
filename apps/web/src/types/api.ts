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
  | "game.publish"
  | "quality_evidence.manage";

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

export type AuthenticatedLoginResponse = {
  status: "authenticated";
  user: CurrentUser;
  context: UserContext;
};

export type PasswordResetRequiredResponse = {
  status: "password_reset_required";
  user: Pick<CurrentUser, "account" | "displayName">;
};

export type LoginApiResponse =
  | AuthenticatedLoginResponse
  | PasswordResetRequiredResponse;

// UI-only request epoch used to reject stale async responses. It is never an
// authentication credential and is never persisted or sent for authentication.
export type AuthenticatedSession = AuthenticatedLoginResponse & {
  requestEpoch: string;
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
  runtimeType: "unity_webgl" | "browser_pose_canvas" | "cognitive_web";
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
  difficultyPolicy?: unknown;
  dynamicDifficultyTriggers?: string[];
  requiredPermissions?: string[];
  resultSchema?: unknown;
  publishedStatus?: "draft" | "published" | "retired";
  status: "active" | "inactive" | "archived";
};

export type FormalTrainingRuntime = GameContent["runtimeType"];

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
  difficultyPolicy?: unknown;
  dynamicDifficultyTriggers?: string[];
  requiredPermissions?: string[];
  resultSchema?: unknown;
  publishedStatus?: "draft" | "published" | "retired";
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
  difficultyPolicy?: unknown;
  dynamicDifficultyTriggers?: string[];
  requiredPermissions?: string[];
  resultSchema?: unknown;
  publishedStatus?: "draft" | "published" | "retired";
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
  confirmedById?: string | null;
  confirmedAt?: string | null;
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
  status?: string;
  scoreSummary: Record<string, unknown>;
  rawInputSummary: Record<string, unknown>;
  completedAt?: string | null;
  createdAt: string;
  riskGrades?: RiskGrade[];
  aiAnalyses?: AiAnalysis[];
};

export type AssessmentScoreSummary = {
  mmse: number;
  cdr: number;
  memory: number;
  orientation: number;
  executive: number;
  language: number;
};

export type CreateAiAssessmentDraftRequest = {
  patientId: string;
  assessmentType?: string;
  transcript: string;
  idempotencyKey: string;
};

export type ReviewAssessmentRequest = {
  decision: "approved" | "returned";
  manualRiskLevel?: RiskGrade["riskLevel"];
  reviewNote: string;
};

export type CreateAssessmentSpeechTranscriptRequest = {
  patientId: string;
  assessmentType?: string;
  idempotencyKey: string;
  audio: {
    contentBase64: string;
    mimeType: "audio/webm" | "audio/wav" | "audio/mpeg" | "audio/mp4";
    durationSeconds: number;
  };
};

export type AssessmentSpeechTranscriptResponse = {
  patientId: string;
  assessmentType: string;
  status: "transcribed";
  transcript: string;
  speechEvidence: {
    provider: string;
    modelVersion: string;
    callId: string;
    endpointRef: string;
    source: "provider_audio_understanding";
    calledAt: string;
    audio: {
      mimeType: string;
      durationSeconds: number;
    };
  };
};

export type CreateTtsSpeechOutputRequest = {
  patientId: string;
  text: string;
  scenario?: "training_cue" | "training_encouragement" | "assessment_prompt";
  idempotencyKey: string;
};

export type TtsSpeechOutputResponse = {
  patientId: string;
  status: "synthesized";
  audio: {
    contentBase64: string;
    mimeType: "audio/mpeg" | "audio/wav";
    byteLength: number;
  };
  ttsEvidence: {
    provider: string;
    modelVersion: string;
    callId: string;
    endpointRef: string;
    source: "provider_text_to_speech";
    calledAt: string;
    voiceId: string;
    scenario: string;
    inputTextHash: string;
    audio: {
      mimeType: "audio/mpeg" | "audio/wav";
      format: "mp3" | "wav";
      byteLength: number;
    };
  };
};

export type AiAssessmentDraftResponse = {
  patientId: string;
  assessmentType: string;
  status: "pending_human_review";
  riskLevel: "low" | "moderate" | "high";
  scoreSummary: AssessmentScoreSummary;
  rawInputSummary: {
    source: "production_ai_assessment";
    transcript: string;
    analysisSummary: string;
    modelVersion: string;
    confidence: number;
    evidence?: Record<string, unknown>;
  };
};

export type AiConversationMessage = {
  id: string;
  sessionId: string;
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  contentSnapshot?: Record<string, unknown>;
  evidenceMetadata?: Record<string, unknown>;
  createdAt: string;
};

export type AiConversationSession = {
  id: string;
  patientId: string;
  createdByUserId: string;
  assessmentType: string;
  status: "active" | "completed" | "pending_human_review" | "reviewed";
  startedAt: string;
  completedAt?: string | null;
  provider: string;
  modelVersion: string;
  callId?: string | null;
  endpointRef: string;
  promptVersion?: string | null;
  summary?: string | null;
  reviewNote?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  messages?: AiConversationMessage[];
};

export type StartAiConversationRequest = {
  patientId: string;
  assessmentType?: string;
};

export type AppendAiConversationMessageRequest = {
  content: string;
  contentSnapshot?: Record<string, unknown>;
  idempotencyKey: string;
};

export type CompleteAiConversationRequest = {
  summary: string;
  reviewNote: string;
};

export type ReviewAiConversationRequest = {
  conclusion: "approved" | "returned";
  reviewNote: string;
};

export type AppendAiConversationMessageResponse = {
  sessionId: string;
  userMessage: AiConversationMessage;
  assistantMessage: AiConversationMessage;
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

export type RegistrationReviewStatus = "pending" | "approved" | "rejected";

export type CreateRegistrationRequest = {
  requestedRole: "patient" | "caregiver";
  account: string;
  initialPassword: string;
  displayName: string;
  mobilePhone?: string;
  profile?: Record<string, unknown>;
};

export type RegistrationRequest = {
  id: string;
  requestedRole: "patient" | "caregiver";
  account: string;
  displayName: string;
  mobilePhone?: string | null;
  reviewStatus: RegistrationReviewStatus;
  reviewNote?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  createdUserId?: string | null;
  createdPatientId?: string | null;
  credentialExpiresAt: string;
  createdAt: string;
  updatedAt?: string;
};

export type ReviewRegistrationRequest = {
  decision: "approved" | "rejected";
  decisionReason: string;
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

export type CareCircleReactionSummary = {
  reactionType: string;
  count: number;
};

export type CareCircleComment = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    displayName?: string | null;
  };
};

export type CareCirclePost = {
  id: string;
  body: string;
  mood?: string | null;
  moderationStatus: "visible" | "hidden" | string;
  createdAt: string;
  author: {
    displayName?: string | null;
  };
  comments: CareCircleComment[];
  reactions: CareCircleReactionSummary[];
};

export type CarePrecaution = {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: "low" | "normal" | "high" | string;
  status: "draft" | "published" | string;
  publishedAt?: string | null;
  createdAt: string;
};

export type CareCircleResponse = {
  posts: CareCirclePost[];
  precautions: CarePrecaution[];
};

export type CreateCareCirclePostRequest = {
  body: string;
  mood?: string;
};

export type CreateCareCircleCommentRequest = {
  body: string;
};

export type ModerateCareCirclePostRequest = {
  moderationStatus: "visible" | "hidden";
  reason?: string;
};

export type CreateCarePrecautionRequest = {
  patientId: string;
  title: string;
  content: string;
  category: string;
  priority?: "low" | "normal" | "high";
  status?: "draft" | "published";
};

export type TrainingResult = {
  id: string;
  collectionBatchId?: string | null;
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
  reviewStatus?: "reviewed" | null;
  reviewConclusion?: TrainingReviewConclusion | null;
  reviewNote?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  metricsSummary?: unknown;
  createdAt: string;
};

export type TrainingSession = {
  id: string;
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  collectionBatchId: string | null;
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

export type TrainingRecoveryContext = {
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  collectionBatchId: string | null;
  gameRunId: string | null;
  clientStartedAt: string | null;
  deviceCode: string | null;
  calibrationStatus: string;
  runtimeConfigSnapshot: unknown;
  unityBuildVersion: string | null;
  bridgeProtocolVersion: string | null;
  startedAt: string;
};

type PatientTrainingRecordSession = Pick<
  TrainingSession,
  | "id"
  | "planItemId"
  | "calibrationStatus"
  | "sessionStatus"
  | "startedAt"
  | "endedAt"
  | "interruptReason"
  | "syncStatus"
  | "result"
> & {
  gameContent: GameContent;
  recoveryContext?: TrainingRecoveryContext;
  patientId?: never;
  rehabPlanId?: never;
  gameContentId?: never;
  collectionBatchId?: never;
  gameRunId?: never;
  clientStartedAt?: never;
  clientEndedAt?: never;
  deviceCode?: never;
  runtimeConfigSnapshot?: never;
  unityBuildVersion?: never;
  bridgeProtocolVersion?: never;
  uploadAttemptCount?: never;
  lastUploadError?: never;
  motionMetrics?: never;
};

type DoctorTrainingRecordSession = TrainingSession & {
  gameContent: GameContent;
  recoveryContext?: never;
};

export type TrainingRecordSession =
  | PatientTrainingRecordSession
  | DoctorTrainingRecordSession;

export type CollectionCondition = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  environment: Record<string, unknown>;
  deviceRequirements: Record<string, unknown>;
  taskParameters: Record<string, unknown>;
  qualityRules: Record<string, unknown>;
  status: "active" | string;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionProtocol = {
  id: string;
  conditionId: string;
  gameContentId?: string | null;
  code: string;
  name: string;
  version: string;
  runtimeType: FormalTrainingRuntime;
  requiredConsentTypes: ConsentType[];
  requiredInputModes: string[];
  requiredMetrics: unknown;
  conditionRules: Record<string, unknown>;
  samplingConfig: Record<string, unknown>;
  qualityGate: Record<string, unknown>;
  status: "active" | string;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  condition?: CollectionCondition;
  gameContent?: GameContent | null;
};

export type CollectionBatch = {
  id: string;
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  protocolId: string;
  conditionId: string;
  protocolVersion: string;
  status: "ready" | "in_progress" | "completed" | "cancelled" | string;
  idempotencyKey?: string | null;
  conditionSnapshot: Record<string, unknown>;
  protocolSnapshot: Record<string, unknown>;
  consentSnapshot?: Record<string, unknown>;
  operatorNotes?: string | null;
  createdByUserId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  protocol?: CollectionProtocol;
  condition?: CollectionCondition;
  gameContent?: GameContent;
};

export type CreateCollectionConditionRequest = {
  code: string;
  name: string;
  description?: string;
  environment: Record<string, unknown>;
  deviceRequirements: Record<string, unknown>;
  taskParameters: Record<string, unknown>;
  qualityRules: Record<string, unknown>;
};

export type CreateCollectionProtocolRequest = {
  conditionId: string;
  gameContentId?: string;
  code: string;
  name: string;
  version: string;
  runtimeType: FormalTrainingRuntime;
  requiredConsentTypes: ConsentType[];
  requiredInputModes: string[];
  requiredMetrics: unknown;
  conditionRules: Record<string, unknown>;
  samplingConfig: Record<string, unknown>;
  qualityGate: Record<string, unknown>;
};

export type CreateCollectionBatchRequest = {
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  protocolId: string;
  idempotencyKey?: string;
  operatorNotes?: string;
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
  collectionBatchId: string;
  idempotencyKey: string;
  gameRunId: string;
  deviceCode?: string;
  calibrationStatus: "checked" | "completed";
  clientStartedAt: string;
};

export type AbortTrainingSessionRequest = {
  reason: string;
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

export type TrainingReviewConclusion =
  | "confirmed_abnormal"
  | "accepted_valid"
  | "excluded_from_analysis"
  | "needs_retrain";

export type SubmitTrainingReviewRequest = {
  reviewConclusion: TrainingReviewConclusion;
  reviewNote: string;
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

export type RewardLedgerItem = {
  id: string;
  eventType: string;
  points: number;
  status: "issued" | string;
  issuedAt: string;
  rule?: {
    code: string;
    name: string;
  } | null;
  trainingResult?: {
    id: string;
    score: number;
    qualityFlag: string;
    abnormalFlag: boolean;
  } | null;
};

export type AchievementItem = {
  id: string;
  code: string;
  name: string;
  level: number;
  progress: number;
  target: number;
  unlockedAt?: string | null;
};

export type RewardSummaryResponse = {
  totalPoints: number;
  ledger: RewardLedgerItem[];
  achievements: AchievementItem[];
};

export type CaregiverTrainingResult = {
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: string;
  abnormalFlag: boolean;
  createdAt: string;
};

export type CaregiverTrainingSession = {
  sessionStatus: string;
  startedAt: string;
  endedAt?: string | null;
  gameContent: Pick<
    GameContent,
    | "id"
    | "name"
    | "trainingTargets"
    | "tags"
    | "defaultDuration"
    | "defaultDifficulty"
  >;
  result?: CaregiverTrainingResult | null;
};

export type CaregiverPlanItem = Pick<
  RehabPlanItem,
  "sequence" | "durationMinutes" | "frequencyPerWeek" | "difficulty"
> & {
  gameContent: Pick<
    GameContent,
    | "id"
    | "name"
    | "trainingTargets"
    | "tags"
    | "defaultDuration"
    | "defaultDifficulty"
  >;
};

export type CaregiverPlan = Pick<
  RehabPlan,
  "id" | "planName" | "status" | "isCurrent" | "weekFrequency" | "dailyDuration"
> & {
  items: CaregiverPlanItem[];
};

export type CaregiverSummaryResponse = {
  patient: {
    id: string;
    name: string;
    age: number;
  };
  currentRisk: "low" | "moderate" | "high" | null;
  currentPlan?: CaregiverPlan | null;
  recentTraining: CaregiverTrainingSession[];
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

export type DataExportRequest = {
  dataset: Exclude<ExportDataset, "assessments" | "training-records">;
  format: "csv";
  reason: string;
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
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
