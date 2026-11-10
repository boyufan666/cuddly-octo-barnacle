import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditResult,
  BindingStatus,
  GameContent,
  Prisma,
  RiskLevel,
  RoleCode,
  TrainingSessionStatus,
} from '@prisma/client';
import { createHash, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createSessionToken } from './auth-session';
import {
  requireMimoApiKey,
  requireMimoProviderRequestLimits,
  requireSttInputLimits,
  SENSITIVE_ENCRYPTION_KEY,
} from './config';
import {
  MIMO_USAGE_GATE,
  MimoQuotaExceededException,
  MimoUsageGate,
  requireMimoUsageIdempotencyKey,
} from './mimo-usage-gate';
import {
  CredentialPasswordPolicyError,
  hashCredential,
  validateCredentialPassword,
  verifyCredential,
} from './credential-security';
import { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';
import { ProviderRequestError, requestProviderJson } from './provider-request';
import {
  ProviderResponseRejectedException,
  ProviderUnavailableException,
} from './provider-outcome';
import {
  ProviderTelemetryService,
  type ProviderTelemetryRecord,
} from './provider-telemetry.service';
import {
  ProviderOperationService,
  type AcceptedProviderOperation,
  type ProviderOperationSnapshot,
} from './provider-operation.service';
import {
  createProviderOperationResponseHmac,
  type ProviderOperationKind,
} from './provider-operation';
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionAad,
  type SensitiveEncryptionEnvelope,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';
import {
  InvalidUserIdentityPayloadError,
  parseUserIdentityPayload,
} from './user-identity';
import { emitProductionRuntimeEvent } from './production-runtime-event';

type ProviderOperation = 'ai' | 'speech' | 'tts';
type ProviderFailureStage = 'provider_call' | 'provider_response_validation';

class ProviderAuditWriteFailure extends Error {
  constructor(readonly operation: ProviderOperation) {
    super('Provider audit write failed.');
    this.name = 'ProviderAuditWriteFailure';
  }
}

const currentConsentVersion = 'v1.2';
const registrationCredentialTtlMs = 24 * 60 * 60 * 1000;
const supportedFormalRuntimeTypes = [
  'unity_webgl',
  'browser_pose_canvas',
  'cognitive_web',
] as const;
const supportedAssessmentPhysicalConditions = [
  'wheelchair',
  'upper_limb_limited',
  'no_known_limitations',
] as const;
const providerOperationResponseHmacSalt = Buffer.from(
  'rehab-provider-operation-hmac-v1',
  'utf8',
);
const providerOperationResponseHmacInfo = Buffer.from(
  'canonical-response-hmac',
  'utf8',
);
const unityWebglRequiredMetricTypes = [
  'reaction_time_ms',
  'target_hit_rate',
  'arm_raise_accuracy',
  'duration_seconds',
  'difficulty_level',
] as const;
const unityWebglResultContractVersion = 'rehab-unity-result-v2';
const unityWebglMetricContract = {
  reaction_time_ms: { unit: 'ms', min: 0, max: 60000 },
  target_hit_rate: { unit: 'ratio', min: 0, max: 1 },
  arm_raise_accuracy: { unit: 'ratio', min: 0, max: 1 },
  duration_seconds: { unit: 'seconds', min: 1, max: 3600 },
  difficulty_level: { unit: 'level', min: 1, max: 3 },
} as const;
const browserPoseGameRequiredMetricTypes = [
  'reaction_time_ms',
  'target_hit_rate',
  'pose_visibility_avg',
  'arm_raise_accuracy',
] as const;
const browserPoseResultContractVersion = 'browser-pose-result-v1';
const browserPoseMetricContract = {
  reaction_time_ms: { unit: 'ms', min: 0, max: 60000 },
  target_hit_rate: { unit: 'ratio', min: 0, max: 1 },
  pose_visibility_avg: { unit: 'ratio', min: 0, max: 1 },
  arm_raise_accuracy: { unit: 'ratio', min: 0, max: 1 },
} as const;
const browserPoseDifficultyWindowTargetCount = 4;
const browserPoseRuntimeGames = {
  garden_reach: { targetIntervalMs: 1200, targetLifetimeMs: 2600 },
  mirror_sequence: { targetIntervalMs: 1050, targetLifetimeMs: 3000 },
  nebula_sort: { targetIntervalMs: 950, targetLifetimeMs: 2400 },
  balance_breath: { targetIntervalMs: 1400, targetLifetimeMs: 3400 },
  bilateral_rhythm_sync: { targetIntervalMs: 1100, targetLifetimeMs: 2800 },
  orbital_trace_follow: { targetIntervalMs: 300, targetLifetimeMs: 1800 },
  center_shift_bridge: { targetIntervalMs: 1250, targetLifetimeMs: 3200 },
} as const;
const browserPoseDifficultyEventKeys = [
  'startingLevel',
  'startingLevelSource',
  'approvedPlanItemId',
  'assessmentSourceId',
  'triggerReason',
  'before',
  'after',
  'metricsWindow',
  'adjustedAt',
  'runtimeFrameId',
  'runtimeWindowId',
  'safetyClampReason',
] as const;
const browserPoseDifficultyParameterKeys = [
  'speed',
  'complexityLevel',
  'targetSizeScale',
  'minimumLandmarkVisibility',
  'holdDurationScale',
  'targetIntervalMs',
  'targetLifetimeMs',
] as const;
const browserPoseDifficultyWindowKeys = [
  'windowStartedAt',
  'windowEndedAt',
  'hitCount',
  'missCount',
  'sampleCount',
  'validFrameCount',
  'averageReactionTimeMs',
  'completionRate',
  'validFrameRatio',
  'motionAccuracy',
] as const;
const cognitiveWebRequiredMetricTypes = [
  'sequence_recall_rate',
  'path_completion_rate',
] as const;
const cognitiveMetricsSummaryKeys = [
  'source',
  'gameRunId',
  'sequenceRecallRate',
  'pathCompletionRate',
  'completedRoundCount',
  'attemptCount',
  'correctStepCount',
  'totalStepCount',
  'mistakeCount',
  'rounds',
  'collectionBatchId',
  'gameVersion',
  'protocolVersion',
  'clientGeneratedAt',
  'prescribedDurationSeconds',
  'difficultyAdjustmentCount',
  'rawPayloadHash',
  'rawInputStored',
  'dynamicDifficultyEvidence',
] as const;
const cognitiveRoundKeys = [
  'id',
  'sequence',
  'answers',
  'difficulty',
  'difficultyLevel',
  'presentedAtMs',
  'answerStartedAtMs',
  'completedAtMs',
] as const;
const cognitiveDifficultyKeys = [
  'level',
  'sequenceLength',
  'optionCount',
  'presentationMs',
] as const;
const cognitiveDynamicDifficultyEvidenceKeys = [
  'schemaVersion',
  'events',
] as const;
const cognitiveDifficultyEventKeys = [
  'startingLevel',
  'startingLevelSource',
  'approvedPlanItemId',
  'assessmentSourceId',
  'triggerReason',
  'before',
  'after',
  'windowRoundIds',
  'windowMetrics',
  'adjustedAt',
  'runtimeFrameId',
  'runtimeWindowId',
] as const;
const cognitiveDifficultySnapshotKeys = [
  'speed',
  'complexityLevel',
  'sequenceLength',
  'optionCount',
  'presentationMs',
] as const;
const cognitiveWindowMetricsKeys = [
  'attemptCount',
  'correctCount',
  'accuracy',
  'averageResponseTimeMs',
] as const;
const cognitiveMotionMetricKeys = [
  'metricType',
  'metricValue',
  'confidence',
  'unit',
  'sampleCount',
  'windowStartedAt',
  'windowEndedAt',
  'qualityFlag',
  'rawSummary',
] as const;
const cognitiveRawSummaryKeys = [
  'source',
  'gameRunId',
  'sequenceRecallRate',
  'pathCompletionRate',
  'completedRoundCount',
  'attemptCount',
  'correctStepCount',
  'totalStepCount',
  'mistakeCount',
] as const;
const cognitiveDifficultyLadder = [
  { level: 1, sequenceLength: 2, optionCount: 3, presentationMs: 3800 },
  { level: 1, sequenceLength: 3, optionCount: 4, presentationMs: 3200 },
  { level: 2, sequenceLength: 4, optionCount: 5, presentationMs: 2600 },
  { level: 3, sequenceLength: 5, optionCount: 6, presentationMs: 2000 },
  { level: 3, sequenceLength: 6, optionCount: 7, presentationMs: 1500 },
] as const;
const dynamicDifficultyTriggerReasons = [
  'prior_assessment',
  'reaction_slow',
  'accuracy_high',
  'accuracy_low',
  'fatigue_risk',
  'clinician_limit',
] as const;
const physiologicalMetricTypePattern =
  /(?:heart[_-]?rate|blood[_-]?oxygen|spo2|blood[_-]?pressure|respiratory[_-]?rate|body[_-]?temperature|ecg|electrocardiogram)/i;
const trainingReviewConclusions = [
  'confirmed_abnormal',
  'accepted_valid',
  'excluded_from_analysis',
  'needs_retrain',
] as const;
const productionAiAssessmentSources = [
  'production_ai_assessment',
  'speech_ai_assessment',
] as const;
const speechAiAssessmentSources = ['speech_ai_assessment'] as const;
const humanReviewConclusions = [
  'approved',
  'rejected',
  'needs_revision',
] as const;
const xiaomiSpeechAudioMimeTypes = [
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
] as const;
const ad8AssessmentItemFields = [
  'itemMemoryProblems',
  'itemReducedInterest',
  'itemRepeatsQuestions',
  'itemTroubleLearningTools',
  'itemForgetsMonthYear',
  'itemHandlesFinancesPoorly',
  'itemTroubleAppointments',
  'itemDailyThinkingMemoryProblems',
] as const;
const nonProductionMarkerPattern =
  /(^|[^a-z0-9])(mock|demo|local|manual|fallback)(?=$|[^a-z0-9])/i;
const registrationRequestResponseSelect = {
  id: true,
  requestedRole: true,
  account: true,
  identityEnvelope: true,
  reviewStatus: true,
  reviewEnvelope: true,
  reviewedByUserId: true,
  reviewedAt: true,
  createdUserId: true,
  createdPatientId: true,
  createdAt: true,
  updatedAt: true,
  credentialExpiresAt: true,
} satisfies Prisma.RegistrationRequestSelect;
const registrationRequestReviewSelect = {
  id: true,
  requestedRole: true,
  account: true,
  initialPasswordHash: true,
  credentialExpiresAt: true,
  identityEnvelope: true,
  reviewStatus: true,
} satisfies Prisma.RegistrationRequestSelect;
type RegistrationRequestResponse = Prisma.RegistrationRequestGetPayload<{
  select: typeof registrationRequestResponseSelect;
}>;
const patientProfileEnvelopeSelect = {
  id: true,
  userId: true,
  responsibleDoctorId: true,
  identityEnvelope: true,
  contactEnvelope: true,
  careDetailsEnvelope: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientProfileSelect;
const trainingResultEnvelopeSelect = {
  id: true,
  sessionId: true,
  collectionBatchId: true,
  source: true,
  gameRunId: true,
  gameVersion: true,
  bridgeProtocolVersion: true,
  submittedByUserId: true,
  submittedAt: true,
  clientGeneratedAt: true,
  rawPayloadHash: true,
  score: true,
  completionRate: true,
  durationSeconds: true,
  reactionTimeMs: true,
  motionAccuracy: true,
  exerciseIntensity: true,
  abnormalFlag: true,
  qualityFlag: true,
  qualityReasons: true,
  reviewStatus: true,
  reviewConclusion: true,
  reviewEnvelope: true,
  reviewedByUserId: true,
  reviewedAt: true,
  metricsSummary: true,
  createdAt: true,
} satisfies Prisma.TrainingResultSelect;
const trainingResultReviewAccessSelect = {
  id: true,
  sessionId: true,
  qualityFlag: true,
  abnormalFlag: true,
  reviewStatus: true,
  reviewConclusion: true,
  reviewEnvelope: true,
  reviewedByUserId: true,
  reviewedAt: true,
  session: {
    select: {
      patientId: true,
      patient: { select: { id: true, responsibleDoctorId: true } },
    },
  },
} satisfies Prisma.TrainingResultSelect;
type TrainingResultEnvelopeRecord = Prisma.TrainingResultGetPayload<{
  select: typeof trainingResultEnvelopeSelect;
}>;

type FormalRuntimeType = (typeof supportedFormalRuntimeTypes)[number];
type AssessmentPhysicalCondition =
  (typeof supportedAssessmentPhysicalConditions)[number];
type TrainingReviewConclusion = (typeof trainingReviewConclusions)[number];
type ProductionAiAssessmentSource =
  (typeof productionAiAssessmentSources)[number];
type DynamicDifficultyTriggerReason =
  (typeof dynamicDifficultyTriggerReasons)[number];
type CognitiveDifficultyRule = (typeof cognitiveDifficultyLadder)[number];
type CognitiveRoundEvidence = {
  id: string;
  sequence: string[];
  answers: string[];
  difficulty: CognitiveDifficultyRule;
  difficultyLadderIndex: number;
  difficultyLevel: number;
  presentedAtMs: number;
  answerStartedAtMs: number;
  completedAtMs: number;
};
type ParsedTrainingMotionMetric = {
  metricType: string;
  metricValue: number;
  unit: string | undefined;
  confidence: number | undefined;
  sampleCount: number | undefined;
  windowStartedAt: Date | undefined;
  windowEndedAt: Date | undefined;
  qualityFlag: string;
  bodyPart: string | undefined;
  jointName: string | undefined;
  rawSummary: Prisma.JsonObject | undefined;
};

type LoginDto = {
  account: string;
  password: string;
};

type ResetPasswordDto = {
  newPassword?: string;
};

type PatientDto = {
  account: string;
  initialPassword: string;
  name: string;
  gender: string;
  age: number;
  mobilePhone?: string;
  caregiverName?: string;
  caregiverPhone?: string;
  responsibleDoctorId?: string;
  healthMetrics?: Prisma.InputJsonValue;
};

type CaregiverAccountDto = {
  account: string;
  initialPassword: string;
  displayName: string;
  mobilePhone?: string;
};

type RegistrationRequestDto = {
  requestedRole?: string;
  account?: string;
  initialPassword?: string;
  displayName?: string;
  mobilePhone?: string;
  profile?: Prisma.InputJsonValue;
};

type ReviewRegistrationRequestDto = {
  decision?: string;
  decisionReason?: string;
};

type ConsentDto = {
  patientId: string;
  subjectUserId: string;
  consentType:
    | 'privacy_policy'
    | 'ai_processing'
    | 'camera_capture'
    | 'microphone_capture'
    | 'caregiver_sharing';
  consentVersion: string;
  evidenceSnapshot?: Prisma.InputJsonValue;
};

type CaregiverRelationDto = {
  caregiverAccount?: string;
  relation?: string;
  scope?: Prisma.InputJsonValue;
};

type AssessmentDto = {
  patientId: string;
  assessmentType?: string;
  scoreSummary?: Prisma.InputJsonValue;
  rawInputSummary?: Prisma.InputJsonValue;
  physicalConditions?: unknown;
};

type ReviewAssessmentDto = {
  decision?: string;
  manualRiskLevel?: string;
  reviewNote?: string;
};

type AiAssessmentDraftDto = {
  patientId: string;
  assessmentType?: string;
  physicalConditions?: unknown;
  transcript?: string;
  idempotencyKey?: string;
};

type StartAiConversationDto = {
  patientId: string;
  assessmentType?: string;
  physicalConditions?: unknown;
};

type AppendAiConversationMessageDto = {
  content?: string;
  contentSnapshot?: Prisma.InputJsonValue;
  idempotencyKey?: string;
};

type CompleteAiConversationDto = {
  summary?: string;
  reviewNote?: string;
};

type ReviewAiConversationDto = {
  conclusion?: string;
  reviewNote?: string;
};

type CareCirclePostDto = {
  body?: string;
  mood?: string;
  privateMetadata?: Prisma.InputJsonValue;
};

type CareCircleCommentDto = {
  body?: string;
  privateMetadata?: Prisma.InputJsonValue;
};

type ModerateCareCirclePostDto = {
  moderationStatus?: string;
  reason?: string;
};

type CarePrecautionDto = {
  patientId?: string;
  title?: string;
  content?: string;
  category?: string;
  priority?: string;
  status?: string;
};

type AssessmentSpeechTranscriptDto = {
  patientId: string;
  assessmentType?: string;
  physicalConditions?: unknown;
  audio?: Prisma.InputJsonValue;
  idempotencyKey?: string;
};

type TtsSpeechOutputDto = {
  patientId: string;
  text?: string;
  scenario?: string;
  idempotencyKey?: string;
};

type RecommendPlanDto = {
  patientId: string;
  gameContentIds?: string[];
};

type ConfirmPlanDto = {
  dailyDuration: number;
  weekFrequency: number;
  adjustmentReason: string;
  difficultyLadder?: Prisma.InputJsonValue;
  itemAdjustments?: Array<{
    gameContentId: string;
    durationMinutes: number;
    frequencyPerWeek: number;
    difficulty: string;
  }>;
};

type StartTrainingDto = {
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  collectionBatchId: string;
  idempotencyKey?: string;
  gameRunId?: string;
  deviceCode?: string;
  calibrationStatus?: string;
  clientStartedAt?: string;
};

type AbortTrainingSessionDto = {
  reason?: unknown;
};

type SubmitTrainingResultDto = {
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: string;
  metricsSummary?: Prisma.InputJsonValue;
  motionMetrics?: Array<{
    metricType: string;
    metricValue: number;
    confidence?: number;
    unit?: string;
    sampleCount?: number;
    windowStartedAt?: string;
    windowEndedAt?: string;
    qualityFlag?: string;
    bodyPart?: string;
    jointName?: string;
    rawSummary?: Prisma.InputJsonValue;
  }>;
};

type ReviewTrainingResultDto = {
  reviewConclusion?: string;
  reviewNote?: string;
};

type AuditLogQueryDto = {
  result?: string;
  actorRole?: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorAccount?: string;
  from?: string;
  to?: string;
  dateFrom?: string;
  dateTo?: string;
  take?: string | number;
  limit?: string | number;
};

type ExportDataset =
  | 'patients'
  | 'assessments'
  | 'training-records'
  | 'consents'
  | 'audit-logs';

type ExportFormat = 'csv' | 'json';

type ExportDatasetQueryDto = {
  format?: string;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
  riskLevel?: string;
  qualityFlag?: string;
  limit?: string | number;
};

type ExportFilters = {
  reason: string;
  dateFrom?: Date;
  dateTo?: Date;
  patientId?: string;
  riskLevel?: RiskLevel;
  qualityFlag?: string;
  limit: number;
};

type ExportCellValue = string | number | boolean | null;
type ExportRow = Record<string, ExportCellValue>;

type ExportPayload = {
  dataset: ExportDataset;
  format: ExportFormat;
  generatedAt: string;
  rowCount: number;
  columns: string[];
  rows: ExportRow[];
};

type AdminPermission =
  | 'dashboard.view'
  | 'audit.read'
  | 'data.export'
  | 'user.manage'
  | 'game.manage'
  | 'game.publish'
  | 'quality_evidence.manage';

type UpdateUnityBuildDto = {
  manifestUrl?: string | null;
  buildBaseUrl?: string | null;
  gameVersion?: string | null;
  bridgeProtocolVersion?: string;
  buildStatus?: string;
  releaseChannel?: string;
  supportsCamera?: boolean;
  supportsMicrophone?: boolean;
  supportedInputModes?: unknown;
  requiredMetrics?: unknown;
  difficultyPolicy?: unknown;
  dynamicDifficultyTriggers?: unknown;
  requiredPermissions?: unknown;
  resultSchema?: unknown;
  publishedStatus?: string;
};

type CreateGameContentDto = {
  code: string;
  name: string;
  runtimeType: string;
  gameVersion?: string | null;
  trainingTargets: unknown;
  tags: unknown;
  defaultDuration: number;
  defaultDifficulty: string;
  supportsCamera: boolean;
  supportsMicrophone: boolean;
  supportedInputModes: unknown;
  requiredMetrics: unknown;
  difficultyPolicy?: unknown;
  dynamicDifficultyTriggers?: unknown;
  requiredPermissions?: unknown;
  resultSchema?: unknown;
  publishedStatus?: string;
};

type FormalPublishMetadataInput = {
  difficultyPolicy?: unknown;
  dynamicDifficultyTriggers?: unknown;
  requiredPermissions?: unknown;
  resultSchema?: unknown;
  publishedStatus?: string;
};

type PatientTrainingGameContent = Pick<
  GameContent,
  | 'id'
  | 'code'
  | 'name'
  | 'trainingTargets'
  | 'tags'
  | 'defaultDuration'
  | 'defaultDifficulty'
  | 'runtimeType'
  | 'manifestUrl'
  | 'buildBaseUrl'
  | 'gameVersion'
  | 'bridgeProtocolVersion'
  | 'buildStatus'
  | 'releaseChannel'
  | 'supportsCamera'
  | 'supportsMicrophone'
  | 'supportedInputModes'
  | 'requiredMetrics'
  | 'difficultyPolicy'
  | 'dynamicDifficultyTriggers'
  | 'requiredPermissions'
  | 'resultSchema'
  | 'publishedStatus'
  | 'status'
>;

type UpdateGameContentStatusDto = {
  status: string;
};

type CreateCollectionConditionDto = {
  code: string;
  name: string;
  description?: string;
  environment: unknown;
  deviceRequirements: unknown;
  taskParameters: unknown;
  qualityRules: unknown;
};

type CreateCollectionProtocolDto = {
  conditionId: string;
  gameContentId?: string;
  code: string;
  name: string;
  version: string;
  runtimeType: string;
  requiredConsentTypes: unknown;
  requiredInputModes: unknown;
  requiredMetrics: unknown;
  conditionRules: unknown;
  samplingConfig: unknown;
  qualityGate: unknown;
};

type CreateCollectionBatchDto = {
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  protocolId: string;
  idempotencyKey?: string;
  operatorNotes?: string;
};

type AiRuntimeConfig = {
  provider: string;
  modelVersion: string;
  endpoint: string;
  chatCompletionsEndpoint: string;
  apiKey: string;
  apiKeyRef: string;
  promptVersion: string;
  requestLimits: ReturnType<typeof requireMimoProviderRequestLimits>;
};

type SpeechRuntimeConfig = {
  provider: string;
  modelVersion: string;
  endpoint: string;
  apiKey: string;
  apiKeyRef: string;
  requestLimits: ReturnType<typeof requireMimoProviderRequestLimits>;
  inputLimits: ReturnType<typeof requireSttInputLimits>;
};

type TtsRuntimeConfig = {
  provider: string;
  modelVersion: string;
  endpoint: string;
  apiKey: string;
  apiKeyRef: string;
  requestLimits: ReturnType<typeof requireMimoProviderRequestLimits>;
  voiceId: string;
  outputFormat: 'mp3' | 'wav';
  outputMimeType: 'audio/mpeg' | 'audio/wav';
};

type SpeechAudioInput = {
  contentBase64: string;
  mimeType: string;
  durationSeconds: number;
};

type TtsSynthesisInput = {
  text: string;
  scenario: string;
  styleInstruction: string;
};

type ProviderOperationRuntimeMetadata = {
  provider: string;
  modelVersion: string;
  endpoint: string;
  apiKeyRef: string;
  promptVersion?: string;
};

type CollectionBatchWithProtocol = Prisma.CollectionBatchGetPayload<{
  include: {
    protocol: true;
    condition: true;
  };
}>;

type TrainingConsentSnapshot = {
  version: string;
  requiredTypes: ConsentDto['consentType'][];
  grantedConsentIds: string[];
  grants: Array<{
    id: string;
    consentType: ConsentDto['consentType'];
    consentVersion: string;
    status: string;
    grantedAt: string;
  }>;
  status: 'granted';
};

type TrainingResultForCompletionSummary = {
  score: number;
  abnormalFlag: boolean;
  qualityFlag: string;
};

type TrainingSessionForCompletionSummary = {
  sessionStatus: TrainingSessionStatus;
  result?: TrainingResultForCompletionSummary | null;
};

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SENSITIVE_ENCRYPTION_KEY)
    private readonly sensitiveEncryptionKey: SensitiveEncryptionKey,
    @Optional()
    @Inject(MIMO_USAGE_GATE)
    private readonly mimoUsageGate?: MimoUsageGate,
    @Optional()
    private readonly providerTelemetry?: ProviderTelemetryService,
    @Optional()
    private readonly providerOperationService?: ProviderOperationService,
  ) {}

  async login(dto: LoginDto) {
    const account = this.validateAccount(dto?.account, '登录账号格式无效。');
    const password = this.validateLoginPassword(dto?.password);
    const user = await this.prisma.user.findUnique({
      where: { account },
      select: {
        id: true,
        account: true,
        passwordHash: true,
        credentialVersion: true,
        passwordResetRequired: true,
        authSessionVersion: true,
        accountStatus: true,
        identityEnvelope: true,
        roleBindings: {
          where: { bindingStatus: 'active' },
          select: {
            roleCode: true,
            relatedObjectType: true,
            relatedObjectId: true,
            organizationId: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }

    if (!user.passwordResetRequired && password.length < 8) {
      throw new UnauthorizedException('账号或密码错误');
    }

    if (
      user.credentialVersion !== 1 ||
      !(await verifyCredential(user.passwordHash, password))
    ) {
      throw new UnauthorizedException('账号或密码错误');
    }

    if (user.accountStatus !== 'active') {
      throw new ForbiddenException('账号不可用');
    }
    const identity = this.decryptUserIdentity(user.id, user.identityEnvelope);

    const payload: RequestUser = {
      id: user.id,
      account: user.account,
      displayName: identity.displayName,
      roles: user.roleBindings.map((binding) => ({
        roleCode: binding.roleCode,
        relatedObjectType: binding.relatedObjectType,
        relatedObjectId: binding.relatedObjectId,
        organizationId: binding.organizationId ?? undefined,
      })),
    };

    if (!payload.roles.length) {
      throw new ForbiddenException('账号未绑定可用角色');
    }

    if (user.passwordResetRequired) {
      await this.audit(
        user.id,
        this.primaryRole(payload),
        'auth.login.password_reset_required',
        'user',
        user.id,
        'success',
      );
      return {
        status: 'password_reset_required' as const,
        user: {
          account: user.account,
          displayName: identity.displayName,
        },
        resetToken: createSessionToken(
          {
            sub: user.id,
            authSessionVersion: user.authSessionVersion,
            purpose: 'password-reset',
          },
          '15m',
        ),
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: { id: true },
    });

    const sessionToken = createSessionToken(
      {
        sub: user.id,
        authSessionVersion: user.authSessionVersion,
        purpose: 'auth',
      },
      '8h',
    );

    await this.audit(
      user.id,
      this.primaryRole(payload),
      'auth.login',
      'user',
      user.id,
      'success',
    );

    const context = await this.buildUserContext(payload);

    return {
      status: 'authenticated' as const,
      sessionToken,
      user: payload,
      context,
    };
  }

  async me(user: RequestUser) {
    const roleCodes = user.roles.map((role) => role.roleCode);
    return {
      user,
      homePath: this.resolveHomePath(roleCodes),
      context: await this.buildUserContext(user),
    };
  }

  async logout(user: RequestUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { authSessionVersion: { increment: 1 } },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'auth.logout',
          targetType: 'user',
          targetId: user.id,
          result: 'success',
          metadata: {},
        },
      });
    });
    return { status: 'logged_out' as const };
  }

  async adminResetPassword(
    actor: RequestUser,
    accountValue: string,
    dto: ResetPasswordDto,
  ) {
    this.requireAdminPermission(actor, 'user.manage');
    const account = this.validateAccount(accountValue, '目标账号不能为空。');
    const password = this.validateInitialPassword(dto.newPassword, '临时');
    const passwordHash = await hashCredential(password);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const lockedTargets = await tx.$queryRaw<
          Array<{ id: string; account: string }>
        >(Prisma.sql`
          SELECT "id", "account"
          FROM "user"
          WHERE "account" = ${account}
          FOR UPDATE
        `);
        const target = lockedTargets[0];
        if (!target) return { outcome: 'not_found' as const };

        const lockedRoleBindings = await tx.$queryRaw<
          Array<{ roleCode: RoleCode; bindingStatus: BindingStatus }>
        >(Prisma.sql`
          SELECT "roleCode", "bindingStatus"
          FROM "user_role_binding"
          WHERE "userId" = ${target.id}
          FOR UPDATE
        `);
        const targetRoleCodes = lockedRoleBindings
          .filter((binding) => binding.bindingStatus === 'active')
          .map((binding) => binding.roleCode);
        if (targetRoleCodes.some((roleCode) => this.isAdminRole(roleCode))) {
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              actorRole: this.primaryRole(actor),
              action: 'auth.password.admin_reset',
              targetType: 'user',
              targetId: target.id,
              result: 'denied',
              metadata: {
                reason: 'administrator_password_reset_forbidden',
                targetRoleCodes,
              },
            },
          });
          return { outcome: 'denied' as const };
        }

        const updated = await tx.user.update({
          where: { id: target.id },
          data: {
            passwordHash,
            credentialVersion: 1,
            passwordResetRequired: true,
            passwordUpdatedAt: new Date(),
            authSessionVersion: { increment: 1 },
          },
          select: { id: true, account: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            actorRole: this.primaryRole(actor),
            action: 'auth.password.admin_reset',
            targetType: 'user',
            targetId: target.id,
            result: 'success',
            metadata: {},
          },
        });
        return {
          outcome: 'success' as const,
          response: {
            status: 'password_reset_required' as const,
            user: updated,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    if (result.outcome === 'not_found') {
      throw new NotFoundException('目标账号不存在。');
    }
    if (result.outcome === 'denied') {
      throw new ForbiddenException('管理员账号密码不得通过此入口重置。');
    }
    return result.response;
  }

  async completePasswordReset(
    userId: string,
    authSessionVersion: number,
    dto: ResetPasswordDto,
  ) {
    const password = this.validateInitialPassword(dto.newPassword, '新');
    const passwordHash = await hashCredential(password);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          passwordResetRequired: true,
          authSessionVersion,
        },
        data: {
          passwordHash,
          credentialVersion: 1,
          passwordResetRequired: false,
          passwordUpdatedAt: new Date(),
          authSessionVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new UnauthorizedException('密码重置凭证已过期，请重新登录。');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'auth.password.required_reset_complete',
          targetType: 'user',
          targetId: userId,
          result: 'success',
          metadata: {},
        },
      });
    });
    return { status: 'password_reset_complete' as const };
  }

  async createPatient(user: RequestUser, dto: PatientDto) {
    if (!this.hasAnyAdminRole(user)) {
      this.requireAnyRole(user, ['doctor']);
    }
    if (this.hasAnyAdminRole(user)) {
      this.requireAdminPermission(user, 'user.manage');
    }
    const account = this.validateAccount(dto.account);
    const initialPassword = this.validateInitialPassword(dto.initialPassword);
    const name = this.requiredString(dto.name, '患者姓名不能为空。');
    const gender = this.requiredString(dto.gender, '患者性别不能为空。');
    const age = this.requiredInteger(dto.age, '患者年龄不能为空。');
    this.assertRange(age, 1, 120, '患者年龄必须在 1 到 120 岁之间。');
    const mobilePhone = this.optionalString(
      dto.mobilePhone,
      '患者手机号必须是文本。',
    );
    const caregiverName = this.optionalString(
      dto.caregiverName,
      '照护人姓名必须是文本。',
    );
    const caregiverPhone = this.optionalString(
      dto.caregiverPhone,
      '照护人联系方式必须是文本。',
    );
    const healthMetrics =
      dto.healthMetrics === undefined
        ? {}
        : this.requiredJsonObject(
            dto.healthMetrics,
            '基础健康指标必须是结构化对象。',
          );
    const responsibleDoctorId = await this.resolveResponsibleDoctorId(
      user,
      dto.responsibleDoctorId,
    );

    await this.ensurePatientLoginAvailable(account, mobilePhone);

    const passwordHash = await hashCredential(initialPassword);
    const patientUserId = randomUUID();
    const patientProfileId = randomUUID();
    const patient = await this.prisma
      .$transaction(async (tx) => {
        const patientUser = await tx.user.create({
          data: {
            id: patientUserId,
            account,
            passwordHash,
            passwordUpdatedAt: new Date(),
            passwordResetRequired: true,
            identityEnvelope: this.encryptSensitiveJsonField(
              { displayName: name, mobilePhone: mobilePhone ?? null },
              {
                tableName: 'user',
                recordId: patientUserId,
                fieldName: 'identityEnvelope',
              },
            ),
            mobilePhoneLookup: this.phoneLookup(mobilePhone),
          },
          select: { id: true },
        });

        const patientProfile = await tx.patientProfile.create({
          data: {
            id: patientProfileId,
            userId: patientUser.id,
            responsibleDoctorId,
            identityEnvelope: this.encryptSensitiveJsonField(
              { name, gender, age },
              {
                tableName: 'patient_profile',
                recordId: patientProfileId,
                fieldName: 'identityEnvelope',
              },
            ),
            contactEnvelope: this.encryptSensitiveJsonField(
              {
                mobilePhone: mobilePhone ?? null,
                caregiverName: caregiverName ?? null,
                caregiverPhone: caregiverPhone ?? null,
              },
              {
                tableName: 'patient_profile',
                recordId: patientProfileId,
                fieldName: 'contactEnvelope',
              },
            ),
            careDetailsEnvelope: this.encryptSensitiveJsonField(
              { healthMetrics },
              {
                tableName: 'patient_profile',
                recordId: patientProfileId,
                fieldName: 'careDetailsEnvelope',
              },
            ),
          },
          select: {
            id: true,
            userId: true,
            responsibleDoctorId: true,
            identityEnvelope: true,
            contactEnvelope: true,
            careDetailsEnvelope: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.userRoleBinding.create({
          data: {
            userId: patientUser.id,
            roleCode: 'patient',
            relatedObjectType: 'patient',
            relatedObjectId: patientProfile.id,
          },
        });

        return this.patientProfileResponse(patientProfile);
      })
      .catch((error: unknown) => {
        if (this.isUserLoginUniqueConstraintError(error)) {
          throw new BadRequestException('患者账号或手机号已存在。');
        }
        throw error;
      });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'patient.create',
      'patient_profile',
      patient.id,
      'success',
    );
    return patient;
  }

  async createCaregiverAccount(user: RequestUser, dto: CaregiverAccountDto) {
    this.requireAdminPermission(user, 'user.manage');
    const account = this.validateAccount(dto.account, '家属登录账号不能为空。');
    const initialPassword = this.validateInitialPassword(
      dto.initialPassword,
      '家属',
    );
    const displayName = this.requiredString(
      dto.displayName,
      '家属姓名不能为空。',
    );
    const mobilePhone = this.optionalString(
      dto.mobilePhone,
      '家属手机号必须是文本。',
    );

    await this.ensureCaregiverLoginAvailable(account, mobilePhone);

    const passwordHash = await hashCredential(initialPassword);
    const caregiverUserId = randomUUID();
    const caregiver = await this.prisma.user
      .create({
        data: {
          id: caregiverUserId,
          account,
          passwordHash,
          passwordUpdatedAt: new Date(),
          passwordResetRequired: true,
          identityEnvelope: this.encryptSensitiveJsonField(
            { displayName, mobilePhone: mobilePhone ?? null },
            {
              tableName: 'user',
              recordId: caregiverUserId,
              fieldName: 'identityEnvelope',
            },
          ),
          mobilePhoneLookup: this.phoneLookup(mobilePhone),
        },
        select: {
          id: true,
          account: true,
          identityEnvelope: true,
          accountStatus: true,
          createdAt: true,
        },
      })
      .catch((error: unknown) => {
        if (this.isUserLoginUniqueConstraintError(error)) {
          throw new BadRequestException('家属账号或手机号已存在。');
        }
        throw error;
      });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'user.create.caregiver',
      'user',
      caregiver.id,
      'success',
    );

    return this.userIdentityResponse(caregiver);
  }

  async createRegistrationRequest(dto: RegistrationRequestDto) {
    const requestedRole = this.validateRegistrationRequestedRole(
      dto.requestedRole,
    );
    const account = this.validateAccount(dto.account, '申请登录账号不能为空。');
    const initialPassword = this.validateInitialPassword(
      dto.initialPassword,
      '申请账号',
    );
    const displayName = this.requiredString(
      dto.displayName,
      '申请人姓名不能为空。',
    );
    const mobilePhone = this.optionalString(
      dto.mobilePhone,
      '申请人手机号必须是文本。',
    );
    const profileSnapshot =
      dto.profile === undefined
        ? {}
        : this.requiredJsonObject(dto.profile, '申请资料必须是结构化对象。');
    const requestId = randomUUID();
    const identityEnvelope = this.encryptSensitiveJsonField(
      {
        displayName,
        mobilePhone: mobilePhone ?? null,
        profileSnapshot,
      },
      {
        tableName: 'registration_request',
        recordId: requestId,
        fieldName: 'identityEnvelope',
      },
    );
    const mobilePhoneLookup = this.phoneLookup(mobilePhone);

    const initialPasswordHash = await hashCredential(initialPassword);
    const now = new Date();
    const credentialExpiresAt = new Date(
      now.getTime() + registrationCredentialTtlMs,
    );

    return this.prisma.$transaction(async (tx) => {
      const matchingLogin = {
        OR: [
          { account },
          ...(mobilePhoneLookup ? [{ mobilePhoneLookup }] : []),
        ],
      };
      const expiredRequests = await tx.registrationRequest.findMany({
        where: {
          reviewStatus: 'pending',
          credentialExpiresAt: { lte: now },
          ...matchingLogin,
        },
        select: { id: true, requestedRole: true },
      });
      for (const expiredRequest of expiredRequests) {
        const reviewEnvelope = this.encryptSensitiveJsonField(
          { reviewNote: '申请凭证已过期，申请已自动拒绝。' },
          {
            tableName: 'registration_request',
            recordId: expiredRequest.id,
            fieldName: 'reviewEnvelope',
          },
        );
        const expired = await tx.registrationRequest.updateMany({
          where: {
            id: expiredRequest.id,
            reviewStatus: 'pending',
            credentialExpiresAt: { lte: now },
          },
          data: {
            reviewStatus: 'rejected',
            reviewEnvelope,
            reviewedAt: now,
            initialPasswordHash: null,
          },
        });
        if (expired.count === 1) {
          await tx.auditLog.create({
            data: {
              action: 'registration_request.expire',
              targetType: 'registration_request',
              targetId: expiredRequest.id,
              result: 'success',
              metadata: { requestedRole: expiredRequest.requestedRole },
            },
          });
        }
      }

      const existingUser = await tx.user.findFirst({
        where: matchingLogin,
        select: { id: true },
      });
      if (existingUser) {
        throw new BadRequestException('申请账号或手机号已存在。');
      }
      const existingRequest = await tx.registrationRequest.findFirst({
        where: {
          reviewStatus: 'pending',
          credentialExpiresAt: { gt: now },
          ...matchingLogin,
        },
        select: { id: true },
      });
      if (existingRequest) {
        throw new BadRequestException('该账号或手机号已有待审核注册申请。');
      }

      const request = await tx.registrationRequest.create({
        data: {
          id: requestId,
          requestedRole,
          account,
          initialPasswordHash,
          credentialExpiresAt,
          identityEnvelope,
          mobilePhoneLookup,
          reviewStatus: 'pending',
        },
        select: registrationRequestResponseSelect,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: undefined,
          actorRole: undefined,
          action: 'registration_request.create',
          targetType: 'registration_request',
          targetId: request.id,
          result: 'success',
          metadata: { requestedRole },
        },
      });
      return this.registrationRequestResponse(request);
    });
  }

  async listRegistrationRequests(user: RequestUser) {
    const reviewableRoles: RoleCode[] = [];
    if (this.hasRole(user, 'doctor')) reviewableRoles.push('patient');
    if (this.hasAdminPermission(user, 'user.manage')) {
      reviewableRoles.push('caregiver');
    }
    if (!reviewableRoles.length) {
      if (this.hasAnyAdminRole(user)) {
        this.requireAdminPermission(user, 'user.manage');
      }
      this.requireAnyRole(user, ['doctor']);
    }

    const requests = await this.prisma.registrationRequest.findMany({
      where:
        reviewableRoles.length === 1
          ? { requestedRole: reviewableRoles[0] }
          : { requestedRole: { in: reviewableRoles } },
      orderBy: { createdAt: 'desc' },
      select: registrationRequestResponseSelect,
    });
    return requests.map((request) => this.registrationRequestResponse(request));
  }

  async reviewRegistrationRequest(
    user: RequestUser,
    requestId: string,
    dto: ReviewRegistrationRequestDto,
  ) {
    const id = this.requiredString(requestId, '注册申请 ID 不能为空。');
    const decision = this.validateRegistrationDecision(dto.decision);
    const decisionReason = this.requiredString(
      dto.decisionReason,
      '审核原因不能为空。',
    );

    const existing = await this.prisma.registrationRequest.findUnique({
      where: { id },
      select: registrationRequestReviewSelect,
    });
    if (!existing) {
      throw new NotFoundException('注册申请不存在。');
    }
    await this.assertRegistrationReviewAccess(user, existing.requestedRole, id);
    if (existing.reviewStatus !== 'pending') {
      throw new ConflictException('该注册申请已审核，不能重复处理。');
    }
    const registrationIdentity = this.decryptRegistrationIdentity(
      existing.id,
      existing.identityEnvelope,
    );

    const reviewedAt = new Date();
    if (existing.credentialExpiresAt.getTime() <= reviewedAt.getTime()) {
      const reviewEnvelope = this.encryptSensitiveJsonField(
        { reviewNote: '申请凭证已过期，申请已自动拒绝。' },
        {
          tableName: 'registration_request',
          recordId: existing.id,
          fieldName: 'reviewEnvelope',
        },
      );
      await this.prisma.$transaction(async (tx) => {
        const expired = await tx.registrationRequest.updateMany({
          where: {
            id,
            reviewStatus: 'pending',
            credentialExpiresAt: { lte: reviewedAt },
          },
          data: {
            reviewStatus: 'rejected',
            reviewEnvelope,
            reviewedByUserId: user.id,
            reviewedAt,
            initialPasswordHash: null,
          },
        });
        if (expired.count !== 1) {
          throw new ConflictException('该注册申请状态已变化。');
        }
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: this.primaryRole(user),
            action: 'registration_request.expire',
            targetType: 'registration_request',
            targetId: id,
            result: 'success',
            metadata: { requestedRole: existing.requestedRole },
          },
        });
      });
      throw new ConflictException('申请凭证已过期，请重新提交注册申请。');
    }

    const reviewed = await this.prisma
      .$transaction(async (tx) => {
        const reviewEnvelope = this.encryptSensitiveJsonField(
          { reviewNote: decisionReason },
          {
            tableName: 'registration_request',
            recordId: existing.id,
            fieldName: 'reviewEnvelope',
          },
        );
        const claimed = await tx.registrationRequest.updateMany({
          where: {
            id,
            reviewStatus: 'pending',
            ...(decision === 'approved'
              ? { credentialExpiresAt: { gt: reviewedAt } }
              : {}),
          },
          data: {
            reviewStatus: decision,
            reviewEnvelope,
            reviewedByUserId: user.id,
            reviewedAt,
            initialPasswordHash: null,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('该注册申请状态已变化。');
        }

        let createdUserId: string | null = null;
        let createdPatientId: string | null = null;
        if (decision === 'approved') {
          if (!existing.initialPasswordHash) {
            throw new BadRequestException(
              '申请凭证已失效，请申请人重新提交注册申请。',
            );
          }
          await this.ensureLoginAvailable(
            existing.account,
            registrationIdentity.mobilePhone ?? undefined,
            '申请账号',
          );
          if (!existing.initialPasswordHash.startsWith('$argon2id$')) {
            throw new BadRequestException(
              '申请凭证版本已失效，请申请人重新提交注册申请。',
            );
          }
          const initialPasswordHash = existing.initialPasswordHash;
          const createdUserIdValue = randomUUID();
          const createdUser = await tx.user.create({
            data: {
              id: createdUserIdValue,
              account: existing.account,
              passwordHash: initialPasswordHash,
              passwordUpdatedAt: new Date(),
              passwordResetRequired: true,
              identityEnvelope: this.encryptSensitiveJsonField(
                {
                  displayName: registrationIdentity.displayName,
                  mobilePhone: registrationIdentity.mobilePhone,
                },
                {
                  tableName: 'user',
                  recordId: createdUserIdValue,
                  fieldName: 'identityEnvelope',
                },
              ),
              mobilePhoneLookup: this.phoneLookup(
                registrationIdentity.mobilePhone ?? undefined,
              ),
            },
            select: { id: true },
          });
          createdUserId = createdUser.id;

          if (existing.requestedRole === 'patient') {
            const profile = registrationIdentity.profileSnapshot;
            const gender = this.requiredString(
              profile.gender,
              '患者注册申请缺少性别。',
            );
            const age = this.requiredInteger(
              profile.age,
              '患者注册申请缺少年龄。',
            );
            this.assertRange(age, 1, 120, '患者年龄必须在 1 到 120 岁之间。');
            const healthMetrics =
              profile.healthMetrics === undefined
                ? {}
                : this.requiredJsonObject(
                    profile.healthMetrics,
                    '患者健康指标必须是结构化对象。',
                  );
            const caregiverName = this.optionalString(
              profile.caregiverName,
              '照护人姓名必须是文本。',
            );
            const caregiverPhone = this.optionalString(
              profile.caregiverPhone,
              '照护人联系方式必须是文本。',
            );
            const patientId = randomUUID();
            const patient = await tx.patientProfile.create({
              data: {
                id: patientId,
                userId: createdUser.id,
                responsibleDoctorId: this.registrationResponsibleDoctorId(user),
                identityEnvelope: this.encryptSensitiveJsonField(
                  { name: registrationIdentity.displayName, gender, age },
                  {
                    tableName: 'patient_profile',
                    recordId: patientId,
                    fieldName: 'identityEnvelope',
                  },
                ),
                contactEnvelope: this.encryptSensitiveJsonField(
                  {
                    mobilePhone: registrationIdentity.mobilePhone,
                    caregiverName: caregiverName ?? null,
                    caregiverPhone: caregiverPhone ?? null,
                  },
                  {
                    tableName: 'patient_profile',
                    recordId: patientId,
                    fieldName: 'contactEnvelope',
                  },
                ),
                careDetailsEnvelope: this.encryptSensitiveJsonField(
                  { healthMetrics },
                  {
                    tableName: 'patient_profile',
                    recordId: patientId,
                    fieldName: 'careDetailsEnvelope',
                  },
                ),
              },
              select: { id: true },
            });
            createdPatientId = patient.id;
            await tx.userRoleBinding.create({
              data: {
                userId: createdUser.id,
                roleCode: 'patient',
                relatedObjectType: 'patient',
                relatedObjectId: patient.id,
              },
            });
          } else {
            await tx.userRoleBinding.create({
              data: {
                userId: createdUser.id,
                roleCode: 'caregiver',
                relatedObjectType: 'pending_caregiver',
                relatedObjectId: createdUser.id,
              },
            });
          }
        }

        const result = await tx.registrationRequest.update({
          where: { id },
          data: { createdUserId, createdPatientId },
          select: registrationRequestResponseSelect,
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: this.primaryRole(user),
            action: 'registration_request.review',
            targetType: 'registration_request',
            targetId: id,
            result: 'success',
            metadata: {
              decision,
              requestedRole: existing.requestedRole,
            },
          },
        });
        return result;
      })
      .catch((error: unknown) => {
        if (this.isUserLoginUniqueConstraintError(error)) {
          throw new BadRequestException('申请账号或手机号已存在。');
        }
        throw error;
      });

    return this.registrationRequestResponse(reviewed);
  }

  async getPatient(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    const patientOwnedRecordView = this.isPatientOwnedRecordView(
      user,
      patientId,
    );

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        userId: true,
        responsibleDoctorId: true,
        identityEnvelope: true,
        contactEnvelope: true,
        careDetailsEnvelope: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        responsibleDoctor: {
          select: {
            id: true,
            title: true,
            department: true,
            user: { select: { id: true, identityEnvelope: true } },
          },
        },
        riskGrades: { where: { isCurrent: true }, take: 1 },
        rehabPlans: {
          where: patientOwnedRecordView
            ? { isCurrent: true, status: 'active' }
            : {
                OR: [{ isCurrent: true }, { status: 'pending_confirm' }],
              },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          include: {
            items: {
              orderBy: { sequence: 'asc' },
              include: { gameContent: true },
            },
          },
        },
        trainingSessions: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          include: { result: true, gameContent: true },
        },
        caregiverRelations: {
          where: {
            authorizationStatus: 'active',
            revokedAt: null,
          },
          orderBy: { authorizedAt: 'desc' },
          include: {
            caregiver: {
              select: {
                id: true,
                account: true,
                identityEnvelope: true,
              },
            },
          },
        },
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: {
            aiAnalyses: true,
            riskGrades: { orderBy: { createdAt: 'desc' } },
          },
        },
        consents: {
          orderBy: { grantedAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('患者不存在');
    }

    await this.audit(
      user.id,
      this.primaryRole(user),
      'patient.view',
      'patient_profile',
      patientId,
      'success',
    );
    const patientResponse = this.patientProfileResponse({
      id: patient.id,
      userId: patient.userId,
      responsibleDoctorId: patient.responsibleDoctorId,
      identityEnvelope: patient.identityEnvelope,
      contactEnvelope: patient.contactEnvelope,
      careDetailsEnvelope: patient.careDetailsEnvelope,
      status: patient.status,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    });
    const responsibleDoctorIdentity = this.decryptUserIdentity(
      patient.responsibleDoctor.user.id,
      patient.responsibleDoctor.user.identityEnvelope,
    );
    return {
      ...patientResponse,
      responsibleDoctor: {
        id: patient.responsibleDoctor.id,
        title: patient.responsibleDoctor.title,
        department: patient.responsibleDoctor.department,
        user: {
          id: patient.responsibleDoctor.user.id,
          displayName: responsibleDoctorIdentity.displayName,
        },
      },
      riskGrades: patient.riskGrades.map((risk) =>
        patientOwnedRecordView
          ? this.patientRiskGradeResponse(risk)
          : this.riskGradeResponse(risk),
      ),
      rehabPlans: patientOwnedRecordView
        ? patient.rehabPlans.map((plan) =>
            this.serializeRehabPlanForPatientProgress(plan),
          )
        : patient.rehabPlans,
      trainingSessions: patient.trainingSessions.map((session) =>
        patientOwnedRecordView
          ? this.serializeTrainingSessionForPatientProgress(session)
          : {
              ...session,
              result: session.result
                ? this.trainingResultResponse(session.result)
                : null,
            },
      ),
      caregiverRelations: patient.caregiverRelations.map((relation) =>
        this.caregiverRelationResponse(relation),
      ),
      assessments: patient.assessments.map((assessment) =>
        patientOwnedRecordView
          ? this.serializeAssessmentForPatientProgress(assessment)
          : this.assessmentRecordResponse(assessment),
      ),
      consents: patient.consents,
    };
  }

  async createConsent(user: RequestUser, dto: ConsentDto) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: dto.patientId },
      select: { id: true, userId: true },
    });
    if (!patient) {
      throw new NotFoundException('患者不存在');
    }
    const subjectUserId = this.requiredString(
      dto.subjectUserId,
      '授权签署主体不能为空。',
    );
    if (subjectUserId !== patient.userId || subjectUserId !== user.id) {
      throw new ForbiddenException('仅患者本人账号可签署该患者授权。');
    }
    await this.assertPatientAccess(user, dto.patientId, 'full');
    const consentType = this.validateConsentType(dto.consentType);
    const consentVersion = this.requiredString(
      dto.consentVersion,
      '授权协议版本不能为空。',
    );
    if (consentVersion !== currentConsentVersion) {
      throw new BadRequestException(
        `授权协议版本必须为当前版本 ${currentConsentVersion}。`,
      );
    }
    const evidenceSnapshot = this.requiredJsonObject(
      dto.evidenceSnapshot,
      '缺少授权证据快照，不能创建授权记录。',
    );

    return this.prisma
      .$transaction(async (tx) => {
        const consent = await tx.consentRecord.create({
          data: {
            patientId: dto.patientId,
            subjectUserId,
            consentType,
            consentVersion,
            evidenceSnapshot,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: this.primaryRole(user),
            action: 'consent.grant',
            targetType: 'consent_record',
            targetId: consent.id,
            result: 'success',
            metadata: {
              patientId: dto.patientId,
              consentType,
              consentVersion,
            },
          },
        });
        return consent;
      })
      .catch((error: unknown) => {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException('该授权版本已签署，无需重复提交。');
        }
        throw error;
      });
  }

  async revokeConsent(user: RequestUser, consentId: string) {
    const consent = await this.prisma.consentRecord.findUnique({
      where: { id: consentId },
      select: {
        id: true,
        patientId: true,
        subjectUserId: true,
        consentType: true,
        consentVersion: true,
        status: true,
        revokedAt: true,
      },
    });
    if (!consent) {
      throw new NotFoundException('授权记录不存在。');
    }
    if (consent.subjectUserId !== user.id) {
      throw new ForbiddenException('仅患者本人账号可撤回该患者授权。');
    }
    await this.assertPatientSelf(user, consent.patientId);

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: consent.patientId },
      select: { id: true, userId: true },
    });
    if (!patient) {
      throw new NotFoundException('患者不存在');
    }
    if (patient.userId !== user.id) {
      throw new ForbiddenException('仅患者本人账号可撤回该患者授权。');
    }
    if (consent.status !== 'granted' || consent.revokedAt) {
      throw new ConflictException('授权记录已撤回，请勿重复操作。');
    }

    const revokedAt = new Date();
    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consentRecord.updateMany({
        where: {
          id: consent.id,
          status: 'granted',
          revokedAt: null,
        },
        data: {
          status: 'revoked',
          revokedAt,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('授权记录状态已变化。');
      }

      if (consent.consentType === 'caregiver_sharing') {
        const activeRelations = await tx.caregiverRelation.findMany({
          where: {
            patientId: consent.patientId,
            authorizationStatus: 'active',
            revokedAt: null,
          },
          select: { id: true, caregiverUserId: true },
        });
        await tx.caregiverRelation.updateMany({
          where: {
            patientId: consent.patientId,
            authorizationStatus: 'active',
            revokedAt: null,
          },
          data: {
            authorizationStatus: 'inactive',
            revokedAt,
          },
        });
        const caregiverUserIds = Array.from(
          new Set(activeRelations.map((relation) => relation.caregiverUserId)),
        );
        if (caregiverUserIds.length) {
          await tx.userRoleBinding.updateMany({
            where: {
              userId: { in: caregiverUserIds },
              roleCode: 'caregiver',
              relatedObjectType: 'patient',
              relatedObjectId: consent.patientId,
              bindingStatus: 'active',
            },
            data: { bindingStatus: 'inactive' },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'consent.revoke',
          targetType: 'consent_record',
          targetId: consent.id,
          result: 'success',
          metadata: {
            patientId: consent.patientId,
            consentType: consent.consentType,
          },
        },
      });
      return tx.consentRecord.findUnique({
        where: { id: consent.id },
      });
    });

    if (!revoked) {
      throw new NotFoundException('授权记录不存在。');
    }

    return revoked;
  }

  async listCaregiverRelations(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    await this.assertCurrentConsent(patientId, 'caregiver_sharing');

    const relations = await this.prisma.caregiverRelation.findMany({
      where: {
        patientId,
        authorizationStatus: 'active',
        revokedAt: null,
      },
      orderBy: { authorizedAt: 'desc' },
      include: {
        caregiver: {
          select: {
            id: true,
            account: true,
            identityEnvelope: true,
          },
        },
      },
    });
    return relations.map((relation) =>
      this.caregiverRelationResponse(relation),
    );
  }

  async createCaregiverRelation(
    user: RequestUser,
    patientId: string,
    dto: CaregiverRelationDto,
  ) {
    await this.assertPatientSelf(user, patientId);
    const currentConsent = await this.assertCurrentConsent(
      patientId,
      'caregiver_sharing',
    );

    const caregiverAccount = this.validateAccount(
      dto.caregiverAccount,
      '家属登录账号不能为空。',
    );
    const relation = this.requiredString(dto.relation, '家属关系不能为空。');
    const scope = this.validateCaregiverScope(dto.scope);

    const caregiverUser = await this.prisma.user.findUnique({
      where: { account: caregiverAccount },
      select: {
        id: true,
        account: true,
        identityEnvelope: true,
        accountStatus: true,
      },
    });
    if (!caregiverUser) {
      throw new BadRequestException('家属账号不存在，请先由管理员创建账号。');
    }
    if (caregiverUser.accountStatus !== 'active') {
      throw new ForbiddenException('家属账号不可用。');
    }
    if (caregiverUser.id === user.id) {
      throw new BadRequestException('患者本人账号不能绑定为家属。');
    }

    return this.prisma.$transaction(async (tx) => {
      const lockedConsents = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "consent_record"
          WHERE "id" = ${currentConsent.id}
            AND "patientId" = ${patientId}
            AND "consentType" = CAST(${'caregiver_sharing'} AS "ConsentType")
            AND "consentVersion" = ${currentConsentVersion}
            AND "status" = CAST(${'granted'} AS "ConsentStatus")
            AND "revokedAt" IS NULL
          FOR UPDATE
        `,
      );
      if (lockedConsents.length !== 1) {
        throw new ForbiddenException('缺少 caregiver_sharing 授权');
      }

      const record = await tx.caregiverRelation.upsert({
        where: {
          caregiverUserId_patientId: {
            caregiverUserId: caregiverUser.id,
            patientId,
          },
        },
        update: {
          relation,
          authorizationStatus: 'active',
          revokedAt: null,
          authorizedAt: new Date(),
          scope,
        },
        create: {
          caregiverUserId: caregiverUser.id,
          patientId,
          relation,
          authorizedAt: new Date(),
          scope,
        },
        include: {
          caregiver: {
            select: {
              id: true,
              account: true,
              identityEnvelope: true,
            },
          },
        },
      });

      await tx.userRoleBinding.upsert({
        where: {
          userId_roleCode_relatedObjectId: {
            userId: caregiverUser.id,
            roleCode: 'caregiver',
            relatedObjectId: patientId,
          },
        },
        update: {
          relatedObjectType: 'patient',
          bindingStatus: 'active',
        },
        create: {
          userId: caregiverUser.id,
          roleCode: 'caregiver',
          relatedObjectType: 'patient',
          relatedObjectId: patientId,
          bindingStatus: 'active',
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'caregiver_relation.create',
          targetType: 'caregiver_relation',
          targetId: record.id,
          result: 'success',
          metadata: {
            patientId,
            caregiverUserId: caregiverUser.id,
            scope,
          },
        },
      });
      return this.caregiverRelationResponse(record);
    });
  }

  async revokeCaregiverRelation(
    user: RequestUser,
    patientId: string,
    relationId: string,
  ) {
    await this.assertPatientSelf(user, patientId);

    const relation = await this.prisma.caregiverRelation.findFirst({
      where: {
        id: relationId,
        patientId,
      },
      select: {
        id: true,
        caregiverUserId: true,
        authorizationStatus: true,
        revokedAt: true,
      },
    });
    if (!relation) {
      throw new NotFoundException('家属绑定关系不存在。');
    }
    if (relation.authorizationStatus !== 'active' || relation.revokedAt) {
      throw new ConflictException('家属绑定关系已撤回。');
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.caregiverRelation.updateMany({
        where: {
          id: relation.id,
          patientId,
          caregiverUserId: relation.caregiverUserId,
          authorizationStatus: 'active',
          revokedAt: null,
        },
        data: {
          authorizationStatus: 'inactive',
          revokedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('家属绑定关系状态已变化。');
      }

      const binding = await tx.userRoleBinding.updateMany({
        where: {
          userId: relation.caregiverUserId,
          roleCode: 'caregiver',
          relatedObjectType: 'patient',
          relatedObjectId: patientId,
          bindingStatus: 'active',
        },
        data: { bindingStatus: 'inactive' },
      });
      if (binding.count !== 1) {
        throw new ConflictException('家属角色绑定状态不一致。');
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'caregiver_relation.revoke',
          targetType: 'caregiver_relation',
          targetId: relation.id,
          result: 'success',
          metadata: { patientId, caregiverUserId: relation.caregiverUserId },
        },
      });
      const revoked = await tx.caregiverRelation.findUnique({
        where: { id: relation.id },
        include: {
          caregiver: {
            select: {
              id: true,
              account: true,
              identityEnvelope: true,
            },
          },
        },
      });
      if (!revoked) {
        throw new ConflictException('家属绑定关系状态已变化。');
      }
      return this.caregiverRelationResponse(revoked);
    });
  }

  async listCareCirclePosts(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'summary');
    let canReadPrecautions = true;
    if (this.hasRole(user, 'caregiver')) {
      const caregiverRelation = await this.findActiveCaregiverAuthorization(
        user.id,
        patientId,
      );
      if (!caregiverRelation) {
        throw new ForbiddenException('缺少有效家属共享授权。');
      }
      const caregiverScope = this.validateCaregiverScope(
        caregiverRelation.scope,
      );
      canReadPrecautions = caregiverScope.reminders;
    }

    const posts = await this.prisma.careCirclePost.findMany({
      where: {
        patientId,
        moderationStatus: 'visible',
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        contentEnvelope: true,
        moderationStatus: true,
        moderationEnvelope: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            identityEnvelope: true,
          },
        },
        comments: {
          where: { moderationStatus: 'visible' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            contentEnvelope: true,
            moderationStatus: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                identityEnvelope: true,
              },
            },
          },
        },
        reactions: {
          select: { reactionType: true },
        },
      },
    });
    const precautions = canReadPrecautions
      ? await this.prisma.carePrecaution.findMany({
          where: {
            patientId,
            status: 'published',
          },
          orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
          select: {
            id: true,
            contentEnvelope: true,
            category: true,
            priority: true,
            status: true,
            publishedAt: true,
            createdAt: true,
          },
        })
      : [];

    const postViews = posts.map((post) => this.toCareCirclePostView(post));
    const precautionViews = precautions.map((precaution) =>
      this.toCarePrecautionView(precaution),
    );

    await this.audit(
      user.id,
      this.primaryRole(user),
      'care_circle.list',
      'patient_profile',
      patientId,
      'success',
      {
        postCount: posts.length,
        precautionCount: precautions.length,
      },
    );

    return {
      posts: postViews,
      precautions: precautionViews,
    };
  }

  async createCareCirclePost(
    user: RequestUser,
    patientId: string,
    dto: CareCirclePostDto,
  ) {
    await this.assertPatientAccess(user, patientId, 'summary');
    if (this.hasRole(user, 'caregiver')) {
      const caregiverRelation = await this.findActiveCaregiverAuthorization(
        user.id,
        patientId,
      );
      if (!caregiverRelation) {
        throw new ForbiddenException('缺少有效家属共享授权。');
      }
    }

    const body = this.validateCareCircleBody(dto.body, '关爱动态内容');
    const mood = this.optionalString(dto.mood, '关爱动态心情必须是文本。');
    const postId = randomUUID();
    const privateMetadata =
      dto.privateMetadata === undefined
        ? null
        : this.requiredJsonObject(
            dto.privateMetadata,
            '关爱动态私密补充信息必须是结构化对象。',
          );
    const contentEnvelope = this.encryptSensitiveJsonField(
      { body, mood: mood ?? null, privateMetadata },
      {
        tableName: 'care_circle_post',
        recordId: postId,
        fieldName: 'contentEnvelope',
      },
    );
    const post = await this.prisma.careCirclePost.create({
      data: {
        id: postId,
        patientId,
        authorUserId: user.id,
        contentEnvelope,
        moderationStatus: 'visible',
      },
      select: {
        id: true,
        contentEnvelope: true,
        moderationStatus: true,
        moderationEnvelope: true,
        createdAt: true,
      },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'care_circle.post.create',
      'care_circle_post',
      post.id,
      'success',
      {
        patientId,
        bodyLength: body.length,
      },
    );

    return this.toCareCirclePostView(post);
  }

  async createCareCircleComment(
    user: RequestUser,
    postId: string,
    dto: CareCircleCommentDto,
  ) {
    const post = await this.prisma.careCirclePost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        patientId: true,
        moderationStatus: true,
        patient: { select: { id: true, responsibleDoctorId: true } },
      },
    });
    if (!post || post.moderationStatus !== 'visible') {
      throw new NotFoundException('关爱动态不存在或不可评论。');
    }

    await this.assertPatientAccess(user, post.patientId, 'summary');
    if (this.hasRole(user, 'caregiver')) {
      const caregiverRelation = await this.findActiveCaregiverAuthorization(
        user.id,
        post.patientId,
      );
      if (!caregiverRelation) {
        throw new ForbiddenException('缺少有效家属共享授权。');
      }
    }

    const body = this.validateCareCircleBody(dto.body, '关爱评论内容');
    const commentId = randomUUID();
    const privateMetadata =
      dto.privateMetadata === undefined
        ? null
        : this.requiredJsonObject(
            dto.privateMetadata,
            '关爱评论私密补充信息必须是结构化对象。',
          );
    const contentEnvelope = this.encryptSensitiveJsonField(
      { body, privateMetadata },
      {
        tableName: 'care_circle_comment',
        recordId: commentId,
        fieldName: 'contentEnvelope',
      },
    );
    const comment = await this.prisma.careCircleComment.create({
      data: {
        id: commentId,
        postId,
        authorUserId: user.id,
        contentEnvelope,
        moderationStatus: 'visible',
      },
      select: {
        id: true,
        contentEnvelope: true,
        moderationStatus: true,
        createdAt: true,
      },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'care_circle.comment.create',
      'care_circle_comment',
      comment.id,
      'success',
      {
        patientId: post.patientId,
        postId,
        bodyLength: body.length,
      },
    );

    return this.toCareCircleCommentView(comment);
  }

  async moderateCareCirclePost(
    user: RequestUser,
    postId: string,
    dto: ModerateCareCirclePostDto,
  ) {
    const post = await this.prisma.careCirclePost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        patientId: true,
        patient: { select: { id: true, responsibleDoctorId: true } },
      },
    });
    if (!post) throw new NotFoundException('关爱动态不存在。');
    await this.assertCareCircleModerationAccess(user, post.patient);

    const moderationStatus = this.requiredString(
      dto.moderationStatus,
      '处理状态不能为空。',
    );
    if (!['visible', 'hidden'].includes(moderationStatus)) {
      throw new BadRequestException('处理状态只能是 visible 或 hidden。');
    }
    const reason = this.optionalString(dto.reason, '处理原因必须是文本。');
    const moderationEnvelope = this.encryptSensitiveJsonField(
      { moderationReason: reason ?? null },
      {
        tableName: 'care_circle_post',
        recordId: postId,
        fieldName: 'moderationEnvelope',
      },
    );
    const moderated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.careCirclePost.update({
        where: { id: postId },
        data: {
          moderationStatus,
          moderationEnvelope,
          moderatedByUserId: user.id,
          moderatedAt: new Date(),
        },
        select: {
          id: true,
          contentEnvelope: true,
          moderationStatus: true,
          moderationEnvelope: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'care_circle.post.moderate',
          targetType: 'care_circle_post',
          targetId: postId,
          result: 'success',
          metadata: {
            patientId: post.patientId,
            moderationStatus,
            hasReason: Boolean(reason),
          },
        },
      });

      return updated;
    });

    return this.toCareCirclePostView(moderated);
  }

  async createCarePrecaution(user: RequestUser, dto: CarePrecautionDto) {
    const patientId = this.requiredString(dto.patientId, '患者 ID 不能为空。');
    const status =
      this.optionalString(dto.status, '注意事项状态必须是文本。') ?? 'draft';
    if (!['draft', 'published'].includes(status)) {
      throw new BadRequestException('注意事项状态只能是 draft 或 published。');
    }
    await this.assertCarePrecautionWriteAccess(user, patientId);
    const title = this.validateCareCircleBody(dto.title, '注意事项标题', 80);
    const content = this.validateCareCircleBody(
      dto.content,
      '注意事项内容',
      800,
    );
    const category = this.requiredString(
      dto.category,
      '注意事项分类不能为空。',
    );
    const priority =
      this.optionalString(dto.priority, '注意事项优先级必须是文本。') ??
      'normal';
    if (!['low', 'normal', 'high'].includes(priority)) {
      throw new BadRequestException(
        '注意事项优先级只能是 low、normal 或 high。',
      );
    }

    const precautionId = randomUUID();
    const contentEnvelope = this.encryptSensitiveJsonField(
      { title, content },
      {
        tableName: 'care_precaution',
        recordId: precautionId,
        fieldName: 'contentEnvelope',
      },
    );
    const precaution = await this.prisma.carePrecaution.create({
      data: {
        id: precautionId,
        patientId,
        createdByUserId: user.id,
        contentEnvelope,
        category,
        priority,
        status,
        publishedAt: status === 'published' ? new Date() : null,
      },
      select: {
        id: true,
        contentEnvelope: true,
        category: true,
        priority: true,
        status: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'care_precaution.create',
      'care_precaution',
      precaution.id,
      'success',
      {
        patientId,
        category,
        priority,
        status,
        contentLength: content.length,
      },
    );

    return this.toCarePrecautionView(precaution);
  }

  async createAssessment(user: RequestUser, dto: AssessmentDto) {
    await this.assertClinicalAssessmentWriteAccess(user, dto.patientId);

    await this.assertCurrentConsent(dto.patientId, 'privacy_policy');
    await this.assertCurrentConsent(dto.patientId, 'ai_processing');

    const assessmentType = this.requiredString(
      dto.assessmentType,
      '评估类型不能为空。',
    );
    const scoreSummary = this.requiredJsonObject(
      dto.scoreSummary,
      '缺少有效评估数据，请先完成 MMSE/CDR 量表或上传已批准的生产 AI 评估结果。',
    );
    this.validateAssessmentScoreSummary(assessmentType, scoreSummary);
    const clientRawInputSummary = this.requiredJsonObject(
      dto.rawInputSummary,
      '缺少评估分析结果，不能创建风险评级记录。',
    );
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      dto.physicalConditions,
      '正式评估必须明确选择患者身体状况。',
    );
    const source = this.requiredString(
      clientRawInputSummary.source,
      '缺少评估来源，不能创建评估记录。',
    );
    this.assertProductionAiAssessmentSource(source);
    const reviewedAt = new Date();
    const rawInputSummary = this.bindFormalAssessmentHumanReview(
      clientRawInputSummary,
      source,
      user.id,
      reviewedAt,
    );
    const transcript = this.requiredString(
      rawInputSummary.transcript,
      '缺少语音转写或评估摘要，不能创建评估记录。',
    );
    const analysisSummary = this.requiredString(
      rawInputSummary.analysisSummary,
      '缺少 AI 分析摘要，不能创建风险评级记录。',
    );
    if (this.isAd8AssessmentType(assessmentType)) {
      this.validateAd8Informant(rawInputSummary.informant);
    }
    const modelVersion = this.requiredString(
      rawInputSummary.modelVersion,
      '缺少 AI 分析模型版本。',
    );
    const confidence = this.requiredNumber(
      rawInputSummary.confidence,
      '缺少 AI 分析置信度。',
    );
    this.assertRange(confidence, 0, 1, 'AI 分析置信度必须在 0 到 1 之间。');
    this.assertProductionAssessmentEvidence(rawInputSummary, source);
    await this.assertProductionAssessmentEvidenceBoundToProviderLedger(
      dto.patientId,
      scoreSummary,
      rawInputSummary,
      transcript,
      analysisSummary,
      physicalConditions,
      source,
    );
    if (this.isSpeechAiAssessmentSource(source)) {
      await this.assertCurrentConsent(dto.patientId, 'microphone_capture');
    }

    const riskLevel = this.calculateRiskLevel(assessmentType, scoreSummary);
    const reasonSummary = this.riskReason(
      assessmentType,
      riskLevel,
      scoreSummary,
    );

    const assessmentId = randomUUID();
    const riskGradeId = randomUUID();
    const aiAnalysisId = randomUUID();
    const resultEnvelope = this.encryptSensitiveJsonField(
      {
        scoreSummary,
        rawInputSummary,
        ...(physicalConditions === undefined ? {} : { physicalConditions }),
      },
      {
        tableName: 'assessment_record',
        recordId: assessmentId,
        fieldName: 'resultEnvelope',
      },
    );
    const reasonEnvelope = this.encryptSensitiveJsonField(
      { reasonSummary },
      {
        tableName: 'risk_grade_record',
        recordId: riskGradeId,
        fieldName: 'reasonEnvelope',
      },
    );
    const inputEnvelope = this.encryptSensitiveJsonField(
      { inputSummary: rawInputSummary },
      {
        tableName: 'ai_analysis_record',
        recordId: aiAnalysisId,
        fieldName: 'inputEnvelope',
      },
    );
    const outputSummary = {
      riskLevel,
      reasonSummary,
      transcript,
      analysisSummary,
      ...(physicalConditions === undefined ? {} : { physicalConditions }),
    };
    const outputEnvelope = this.encryptSensitiveJsonField(
      { outputSummary },
      {
        tableName: 'ai_analysis_record',
        recordId: aiAnalysisId,
        fieldName: 'outputEnvelope',
      },
    );

    const record = await this.prisma
      .$transaction(async (tx) => {
        const record = await tx.assessmentRecord.create({
          data: {
            id: assessmentId,
            patientId: dto.patientId,
            assessmentType,
            source,
            resultEnvelope,
            completedAt: reviewedAt,
          },
          select: {
            id: true,
            patientId: true,
            assessmentType: true,
            source: true,
            status: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
          },
        });

        await tx.rehabPlan.updateMany({
          where: {
            patientId: dto.patientId,
            status: { in: ['active', 'pending_confirm'] },
          },
          data: { isCurrent: false, status: 'ended' },
        });

        await tx.riskGradeRecord.updateMany({
          where: { patientId: dto.patientId, isCurrent: true },
          data: { isCurrent: false },
        });

        await tx.riskGradeRecord.create({
          data: {
            id: riskGradeId,
            patientId: dto.patientId,
            assessmentId,
            riskLevel,
            systemRiskLevel: riskLevel,
            isCurrent: true,
            reasonEnvelope,
          },
        });

        await tx.aiAnalysisRecord.create({
          data: {
            id: aiAnalysisId,
            patientId: dto.patientId,
            assessmentId,
            analysisScene: 'assessment_summary',
            modelVersion,
            confidence,
            inputEnvelope,
            outputEnvelope,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: this.primaryRole(user),
            action: 'assessment.create',
            targetType: 'assessment_record',
            targetId: assessmentId,
            result: 'success',
            metadata: { patientId: dto.patientId },
          },
        });
        return record;
      })
      .catch((error: unknown) => {
        if (this.isCurrentRiskGradeUniqueConstraintError(error)) {
          throw new ConflictException('患者当前风险评级已发生变化。');
        }
        throw error;
      });
    return {
      ...record,
      id: assessmentId,
      scoreSummary,
      rawInputSummary,
      ...(physicalConditions === undefined ? {} : { physicalConditions }),
    };
  }

  private isCurrentRiskGradeUniqueConstraintError(error: unknown) {
    if (!this.isUniqueConstraintError(error)) return false;
    const meta = error.meta;
    if (!meta || Object.keys(meta).length !== 2) return false;
    const target = meta.target;
    return (
      meta.modelName === 'RiskGradeRecord' &&
      Array.isArray(target) &&
      target.length === 1 &&
      target[0] === 'patientId'
    );
  }

  async reviewAssessment(
    user: RequestUser,
    assessmentId: string,
    dto: ReviewAssessmentDto,
  ) {
    const id = this.requiredString(assessmentId, '评估记录 ID 不能为空。');
    const decision = this.validateAssessmentReviewDecision(dto.decision);
    const reviewNote = this.requiredString(
      dto.reviewNote,
      '评估复核说明不能为空。',
    );
    const manualRiskLevel = this.validateOptionalRiskLevel(dto.manualRiskLevel);

    const assessment = await this.prisma.assessmentRecord.findUnique({
      where: { id },
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        source: true,
        status: true,
        resultEnvelope: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        patient: { select: patientProfileEnvelopeSelect },
        riskGrades: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            riskLevel: true,
            systemRiskLevel: true,
            manualRiskLevel: true,
            isCurrent: true,
            reasonEnvelope: true,
            confirmedById: true,
            confirmedAt: true,
            createdAt: true,
          },
        },
        aiAnalyses: {
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            trainingSessionId: true,
            analysisScene: true,
            modelVersion: true,
            confidence: true,
            inputEnvelope: true,
            outputEnvelope: true,
            createdAt: true,
          },
        },
      },
    });
    if (!assessment) throw new NotFoundException('评估记录不存在');

    await this.assertAssessmentReviewAccess(user, assessment.patient);
    if (assessment.status !== 'completed') {
      throw new ConflictException('该评估记录状态已变化。');
    }

    const reviewedAt = new Date();
    const assessmentResult = this.decryptAssessmentResult(
      assessment.id,
      assessment.resultEnvelope,
    );
    const rawInputSummary = this.requireAssessmentEnvelopeJsonObject(
      this.appendAssessmentDoctorReview(assessmentResult.rawInputSummary, {
        decision,
        reviewNote,
        reviewerUserId: user.id,
        reviewedAt: reviewedAt.toISOString(),
      }),
      '评估复核加密载荷格式无效。',
    );

    let riskGradeId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      const currentRisk = await tx.riskGradeRecord.findFirst({
        where: {
          assessmentId: assessment.id,
          patientId: assessment.patientId,
          isCurrent: true,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          patientId: true,
          assessmentId: true,
          riskLevel: true,
          systemRiskLevel: true,
          manualRiskLevel: true,
          isCurrent: true,
          reasonEnvelope: true,
          confirmedById: true,
          confirmedAt: true,
          createdAt: true,
        },
      });
      if (
        decision === 'returned' &&
        (currentRisk?.confirmedAt || currentRisk?.confirmedById)
      ) {
        throw new ConflictException('当前评估已确认，不能退回复核。');
      }

      if (decision === 'approved') {
        if (!currentRisk) {
          throw new BadRequestException('缺少当前风险评级，不能确认评估。');
        }
        const currentReason = this.decryptRiskReason(
          currentRisk.id,
          currentRisk.reasonEnvelope,
        );
        if (currentRisk.confirmedAt || currentRisk.confirmedById) {
          throw new ConflictException('当前风险结论已确认，不能重复确认。');
        }
        riskGradeId = currentRisk.id;
        const reasonSummary = `${currentReason.reasonSummary}\n医生确认：${reviewNote}`;
        const riskUpdate = await tx.riskGradeRecord.updateMany({
          where: {
            id: currentRisk.id,
            assessmentId: assessment.id,
            patientId: assessment.patientId,
            isCurrent: true,
            confirmedAt: null,
            confirmedById: null,
          },
          data: {
            riskLevel: manualRiskLevel ?? currentRisk.riskLevel,
            manualRiskLevel: manualRiskLevel ?? currentRisk.riskLevel,
            confirmedById: user.id,
            confirmedAt: reviewedAt,
            reasonEnvelope: this.encryptSensitiveJsonField(
              { reasonSummary },
              {
                tableName: 'risk_grade_record',
                recordId: currentRisk.id,
                fieldName: 'reasonEnvelope',
              },
            ),
          },
        });
        if (riskUpdate.count !== 1) {
          throw new ConflictException('当前风险结论已确认，不能重复确认。');
        }
      }

      const assessmentUpdate = await tx.assessmentRecord.updateMany({
        where: { id, status: 'completed' },
        data: {
          status:
            decision === 'approved'
              ? 'doctor_confirmed'
              : 'returned_for_review',
          resultEnvelope: this.encryptSensitiveJsonField(
            {
              scoreSummary: assessmentResult.scoreSummary,
              rawInputSummary,
              ...(assessmentResult.physicalConditions === undefined
                ? {}
                : { physicalConditions: assessmentResult.physicalConditions }),
            },
            {
              tableName: 'assessment_record',
              recordId: assessment.id,
              fieldName: 'resultEnvelope',
            },
          ),
        },
      });
      if (assessmentUpdate.count !== 1) {
        throw new ConflictException('该评估记录状态已变化。');
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'assessment.review',
          targetType: 'assessment_record',
          targetId: id,
          result: 'success',
          metadata: riskGradeId
            ? {
                patientId: assessment.patientId,
                decision,
                riskGradeId,
              }
            : {
                patientId: assessment.patientId,
                decision,
              },
        },
      });
    });

    const reviewed = await this.prisma.assessmentRecord.findUnique({
      where: { id },
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        source: true,
        status: true,
        resultEnvelope: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        patient: { select: patientProfileEnvelopeSelect },
        riskGrades: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            riskLevel: true,
            systemRiskLevel: true,
            manualRiskLevel: true,
            isCurrent: true,
            reasonEnvelope: true,
            confirmedById: true,
            confirmedAt: true,
            createdAt: true,
          },
        },
        aiAnalyses: {
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            trainingSessionId: true,
            analysisScene: true,
            modelVersion: true,
            confidence: true,
            inputEnvelope: true,
            outputEnvelope: true,
            createdAt: true,
          },
        },
      },
    });
    if (!reviewed) {
      throw new ConflictException('该评估记录状态已变化。');
    }
    return this.assessmentRecordResponse(reviewed);
  }

  private decryptAssessmentResult(recordId: string, envelope: unknown) {
    const decrypted = decryptSensitiveJson<unknown>(
      envelope,
      {
        tableName: 'assessment_record',
        recordId,
        fieldName: 'resultEnvelope',
      },
      this.sensitiveEncryptionKey,
    );
    const hasPhysicalConditions =
      Boolean(decrypted) &&
      typeof decrypted === 'object' &&
      !Array.isArray(decrypted) &&
      Object.prototype.hasOwnProperty.call(decrypted, 'physicalConditions');
    const payload = this.requireExactAssessmentEnvelopeObject(
      decrypted,
      hasPhysicalConditions
        ? ['physicalConditions', 'rawInputSummary', 'scoreSummary']
        : ['rawInputSummary', 'scoreSummary'],
      '评估结果加密载荷格式无效。',
    );
    return {
      scoreSummary: this.requireAssessmentEnvelopeJsonObject(
        payload.scoreSummary,
        '评估分数加密载荷格式无效。',
      ),
      rawInputSummary: this.requireAssessmentEnvelopeJsonObject(
        payload.rawInputSummary,
        '评估输入加密载荷格式无效。',
      ),
      ...(hasPhysicalConditions
        ? {
            physicalConditions: this.requireAssessmentPhysicalConditions(
              payload.physicalConditions,
            ),
          }
        : {}),
    };
  }

  private requireAssessmentPhysicalConditions(value: unknown) {
    if (
      !Array.isArray(value) ||
      value.some(
        (condition) =>
          typeof condition !== 'string' || condition.trim().length === 0,
      )
    ) {
      throw new Error('评估身体状况加密载荷格式无效。');
    }
    return value as string[];
  }

  private decryptRiskReason(recordId: string, envelope: unknown) {
    const payload = this.requireExactAssessmentEnvelopeObject(
      decryptSensitiveJson<unknown>(
        envelope,
        {
          tableName: 'risk_grade_record',
          recordId,
          fieldName: 'reasonEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
      ['reasonSummary'],
      '风险原因加密载荷格式无效。',
    );
    if (
      typeof payload.reasonSummary !== 'string' ||
      payload.reasonSummary.trim().length === 0
    ) {
      throw new Error('风险原因加密载荷格式无效。');
    }
    return { reasonSummary: payload.reasonSummary };
  }

  private decryptAiAnalysisInput(recordId: string, envelope: unknown) {
    const payload = this.requireExactAssessmentEnvelopeObject(
      decryptSensitiveJson<unknown>(
        envelope,
        {
          tableName: 'ai_analysis_record',
          recordId,
          fieldName: 'inputEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
      ['inputSummary'],
      'AI 分析输入加密载荷格式无效。',
    );
    return this.requireAssessmentEnvelopeJsonObject(
      payload.inputSummary,
      'AI 分析输入加密载荷格式无效。',
    );
  }

  private decryptAiAnalysisOutput(recordId: string, envelope: unknown) {
    const payload = this.requireExactAssessmentEnvelopeObject(
      decryptSensitiveJson<unknown>(
        envelope,
        {
          tableName: 'ai_analysis_record',
          recordId,
          fieldName: 'outputEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
      ['outputSummary'],
      'AI 分析输出加密载荷格式无效。',
    );
    return this.requireAssessmentEnvelopeJsonObject(
      payload.outputSummary,
      'AI 分析输出加密载荷格式无效。',
    );
  }

  private requireExactAssessmentEnvelopeObject(
    value: unknown,
    expectedKeys: string[],
    message: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(message);
    }
    const keys = Object.keys(value).sort();
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== [...expectedKeys].sort()[index])
    ) {
      throw new Error(message);
    }
    return value as Record<string, unknown>;
  }

  private requireAssessmentEnvelopeJsonObject(
    value: unknown,
    message: string,
  ): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(message);
    }
    return value;
  }

  private riskGradeResponse<T extends { id: string; reasonEnvelope: unknown }>(
    risk: T,
  ) {
    const { reasonEnvelope, ...safeRisk } = risk;
    return {
      ...safeRisk,
      ...this.decryptRiskReason(risk.id, reasonEnvelope),
    };
  }

  private aiAnalysisResponse<
    T extends {
      id: string;
      inputEnvelope: unknown;
      outputEnvelope: unknown;
    },
  >(analysis: T) {
    const { inputEnvelope, outputEnvelope, ...safeAnalysis } = analysis;
    return {
      ...safeAnalysis,
      inputSummary: this.decryptAiAnalysisInput(analysis.id, inputEnvelope),
      outputSummary: this.decryptAiAnalysisOutput(analysis.id, outputEnvelope),
    };
  }

  private assessmentRecordResponse<
    T extends {
      id: string;
      resultEnvelope: unknown;
      patient?: Parameters<AppService['patientProfileResponse']>[0];
      riskGrades?: Array<{ id: string; reasonEnvelope: unknown }>;
      aiAnalyses?: Array<{
        id: string;
        inputEnvelope: unknown;
        outputEnvelope: unknown;
      }>;
    },
  >(assessment: T) {
    const {
      resultEnvelope,
      patient,
      riskGrades,
      aiAnalyses,
      ...safeAssessment
    } = assessment;
    return {
      ...safeAssessment,
      ...this.decryptAssessmentResult(assessment.id, resultEnvelope),
      ...(patient
        ? { patient: this.patientProfileResponse(patient) }
        : undefined),
      ...(riskGrades
        ? { riskGrades: riskGrades.map((risk) => this.riskGradeResponse(risk)) }
        : undefined),
      ...(aiAnalyses
        ? {
            aiAnalyses: aiAnalyses.map((analysis) =>
              this.aiAnalysisResponse(analysis),
            ),
          }
        : undefined),
    };
  }

  private patientRiskGradeResponse(risk: {
    id: string;
    riskLevel: string;
    systemRiskLevel: string;
    manualRiskLevel: string | null;
    isCurrent: boolean;
    reasonEnvelope: unknown;
    confirmedById: string | null;
    confirmedAt: Date | null;
  }) {
    const decrypted = this.riskGradeResponse(risk);
    return {
      riskLevel: decrypted.riskLevel,
      systemRiskLevel: decrypted.systemRiskLevel,
      manualRiskLevel: decrypted.manualRiskLevel,
      reasonSummary: decrypted.reasonSummary,
      isCurrent: decrypted.isCurrent,
      confirmedAt: decrypted.confirmedAt,
    };
  }

  private serializeAssessmentForPatientProgress<
    T extends {
      id: string;
      assessmentType: string;
      status: string;
      resultEnvelope: unknown;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      riskGrades?: Array<{
        id: string;
        riskLevel: string;
        systemRiskLevel: string;
        manualRiskLevel: string | null;
        isCurrent: boolean;
        reasonEnvelope: unknown;
        confirmedById: string | null;
        confirmedAt: Date | null;
      }>;
      aiAnalyses?: Array<{
        id: string;
        analysisScene: string;
        confidence: number;
        inputEnvelope: unknown;
        outputEnvelope: unknown;
      }>;
    },
  >(assessment: T) {
    const result = this.decryptAssessmentResult(
      assessment.id,
      assessment.resultEnvelope,
    );
    const isDoctorConfirmed = assessment.status === 'doctor_confirmed';
    const confirmedRiskGrades = isDoctorConfirmed
      ? (assessment.riskGrades ?? [])
          .filter((risk) => Boolean(risk.confirmedAt || risk.confirmedById))
          .map((risk) => this.patientRiskGradeResponse(risk))
      : [];
    const safeAiAnalyses = isDoctorConfirmed
      ? (assessment.aiAnalyses ?? []).map((analysis) => ({
          id: analysis.id,
          analysisScene: analysis.analysisScene,
          confidence: analysis.confidence,
        }))
      : [];

    return {
      id: assessment.id,
      assessmentType: assessment.assessmentType,
      status: assessment.status,
      scoreSummary: isDoctorConfirmed ? result.scoreSummary : {},
      ...(result.physicalConditions === undefined
        ? {}
        : { physicalConditions: result.physicalConditions }),
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
      createdAt: assessment.createdAt,
      riskGrades: confirmedRiskGrades,
      ...(safeAiAnalyses.length ? { aiAnalyses: safeAiAnalyses } : {}),
    };
  }

  async createAiAssessmentDraft(user: RequestUser, dto: AiAssessmentDraftDto) {
    await this.assertPatientAccess(user, dto.patientId, 'full');

    await this.assertCurrentConsent(dto.patientId, 'privacy_policy');
    await this.assertCurrentConsent(dto.patientId, 'ai_processing');

    const config = this.requireAiRuntimeConfig();
    const assessmentType = this.normalizeAiConversationAssessmentType(
      this.requiredString(dto.assessmentType, '评估类型不能为空。'),
    );
    const transcript = this.requiredString(
      dto.transcript,
      'AI 评估草稿必须提供评估转写或临床摘要。',
    );
    const selectedPhysicalConditions =
      this.requireExplicitAssessmentPhysicalConditions(
        dto.physicalConditions,
        'AI 评估草稿必须明确选择患者身体状况。',
      );
    const providerOperation = await this.acceptProviderOperation(
      user,
      dto.patientId,
      'assessment_draft',
      dto.idempotencyKey,
      {
        assessmentType,
        transcript,
        ...(selectedPhysicalConditions === undefined
          ? {}
          : { physicalConditions: selectedPhysicalConditions }),
      },
      {
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
      },
    );
    try {
      if (!providerOperation || providerOperation.status === 'accepted') {
        await this.reserveMimoUsage(
          user,
          dto.patientId,
          'ai',
          dto.idempotencyKey,
        );
        await this.reserveAcceptedProviderOperation(providerOperation);
      }
    } catch (error) {
      await this.auditAiAssessmentDraftFailure(
        user,
        dto.patientId,
        config,
        'quota_gate',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'ai',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        requestId: dto.idempotencyKey,
        statusCategory: 'quota_blocked',
        requestContentHash: this.hashTextForEvidence(transcript),
      });
      throw error;
    }

    await this.markProviderOperationDispatching(providerOperation);
    const calledAt = new Date().toISOString();
    const providerStartedAt = Date.now();
    let modelResponse: { callId: string; content: string };
    try {
      modelResponse = await this.callOpenAiCompatibleAssessmentModel(
        config,
        assessmentType,
        transcript,
        selectedPhysicalConditions,
      );
    } catch (error) {
      if (error instanceof ProviderResponseRejectedException) {
        await this.finalizeProviderOperation(providerOperation, {
          status: 'response_rejected',
          providerRespondedAt: new Date(),
          ...(error.callId ? { providerCallId: error.callId } : {}),
          failureCategory: 'provider_response_validation',
        });
        await this.auditAiAssessmentDraftFailure(
          user,
          dto.patientId,
          config,
          'provider_response_validation',
          error.callId,
        );
        await this.recordProviderTelemetry({
          actorUserId: user.id,
          patientId: dto.patientId,
          operation: 'ai',
          provider: config.provider,
          modelVersion: config.modelVersion,
          endpoint: config.chatCompletionsEndpoint,
          apiKeyRef: config.apiKeyRef,
          promptVersion: config.promptVersion,
          ...(error.callId ? { callId: error.callId } : {}),
          requestId: dto.idempotencyKey,
          statusCategory: 'response_rejected',
          durationMs: Date.now() - providerStartedAt,
          requestContentHash: this.hashTextForEvidence(transcript),
        });
        throw error;
      }
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        failureCategory: 'provider_transport_or_timeout',
      });
      await this.auditAiAssessmentDraftFailure(
        user,
        dto.patientId,
        config,
        'provider_call',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'ai',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        requestId: dto.idempotencyKey,
        statusCategory: 'provider_failure',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashTextForEvidence(transcript),
      });
      throw error;
    }

    let scoreSummary: Prisma.JsonObject;
    let analysisSummary: string;
    let confidence: number;
    let providerPhysicalConditions: string[] | undefined;
    try {
      const draftPayload = this.parseAiAssessmentDraftPayload(modelResponse);
      const providerScoreSummary = this.requiredJsonObject(
        draftPayload.scoreSummary,
        'AI 评估草稿缺少结构化评分。',
      );
      scoreSummary = this.normalizeAssessmentScoreSummaryByType(
        assessmentType,
        providerScoreSummary,
      );
      analysisSummary = this.requiredString(
        draftPayload.analysisSummary,
        'AI 评估草稿缺少分析摘要。',
      );
      confidence = this.requiredNumber(
        draftPayload.confidence,
        'AI 评估草稿缺少置信度。',
      );
      this.assertRange(confidence, 0, 1, 'AI 分析置信度必须在 0 到 1 之间。');
      providerPhysicalConditions =
        draftPayload.physicalConditions === undefined
          ? undefined
          : this.validateStringArrayAllowEmpty(
              draftPayload.physicalConditions,
              'AI 评估草稿 physicalConditions 必须是字符串数组。',
            );
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'response_rejected',
        providerRespondedAt: new Date(),
        providerCallId: modelResponse.callId,
        response: { providerContent: modelResponse.content },
        failureCategory: 'provider_response_validation',
      });
      await this.auditAiAssessmentDraftFailure(
        user,
        dto.patientId,
        config,
        'provider_response_validation',
        modelResponse.callId,
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'ai',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        callId: modelResponse.callId,
        requestId: dto.idempotencyKey,
        statusCategory: 'response_rejected',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashTextForEvidence(transcript),
        responseContentHash: this.hashTextForEvidence(modelResponse.content),
      });
      throw this.providerResponseRejection(error, modelResponse.callId);
    }
    const riskLevel = this.calculateRiskLevel(assessmentType, scoreSummary);
    const rawInputSummary = {
      source: 'production_ai_assessment',
      transcript,
      analysisSummary,
      modelVersion: config.modelVersion,
      confidence,
      ...(selectedPhysicalConditions === undefined
        ? {}
        : { physicalConditions: selectedPhysicalConditions }),
      evidence: {
        provider: config.provider,
        model: config.modelVersion,
        modelVersion: config.modelVersion,
        callId: modelResponse.callId,
        endpointRef: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        calledAt,
        humanReview: {
          required: true,
          status: 'pending_human_review',
        },
        ...(providerPhysicalConditions === undefined
          ? {}
          : {
              providerIdentifiedPhysicalConditions: providerPhysicalConditions,
            }),
      },
    };

    const result = {
      patientId: dto.patientId,
      assessmentType,
      status: 'pending_human_review' as const,
      riskLevel,
      scoreSummary,
      rawInputSummary,
      ...(selectedPhysicalConditions === undefined
        ? {}
        : { physicalConditions: selectedPhysicalConditions }),
    };
    const auditWriteFailure = new ProviderAuditWriteFailure('ai');
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.finalizeProviderOperationInTransaction(
          tx,
          providerOperation,
          {
            status: 'completed',
            providerRespondedAt: new Date(),
            providerCallId: modelResponse.callId,
            response: {
              providerContent: modelResponse.content,
              result,
            },
          },
        );
        try {
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              actorRole: this.primaryRole(user),
              action: 'ai.assessment_draft.generate',
              targetType: 'patient_profile',
              targetId: dto.patientId,
              result: 'success',
              metadata: {
                provider: config.provider,
                modelVersion: config.modelVersion,
                apiKeyRef: config.apiKeyRef,
                promptVersion: config.promptVersion,
                callId: modelResponse.callId,
                status: 'pending_human_review',
              },
            },
          });
        } catch {
          throw auditWriteFailure;
        }
      });
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        providerCallId: modelResponse.callId,
        response: {
          providerContent: modelResponse.content,
          result,
        },
        failureCategory: 'business_effect_or_audit_commit_failed',
      });
      if (error === auditWriteFailure) {
        this.throwProviderAuditWriteFailure('ai');
      }
      throw error;
    }
    await this.recordProviderTelemetry({
      actorUserId: user.id,
      patientId: dto.patientId,
      operation: 'ai',
      provider: config.provider,
      modelVersion: config.modelVersion,
      endpoint: config.chatCompletionsEndpoint,
      apiKeyRef: config.apiKeyRef,
      promptVersion: config.promptVersion,
      callId: modelResponse.callId,
      requestId: dto.idempotencyKey,
      statusCategory: 'provider_success',
      durationMs: Date.now() - providerStartedAt,
      requestContentHash: this.hashTextForEvidence(transcript),
      responseContentHash: this.hashTextForEvidence(modelResponse.content),
    });

    return result;
  }

  private async auditAiAssessmentDraftFailure(
    user: RequestUser,
    patientId: string,
    config: AiRuntimeConfig,
    failureStage:
      | 'quota_gate'
      | 'provider_call'
      | 'provider_response_validation',
    callId?: string,
  ) {
    await this.auditProviderOperation(
      'ai',
      () =>
        this.audit(
          user.id,
          this.primaryRole(user),
          'ai.assessment_draft.generate',
          'patient_profile',
          patientId,
          'failed',
          {
            provider: config.provider,
            modelVersion: config.modelVersion,
            apiKeyRef: config.apiKeyRef,
            promptVersion: config.promptVersion,
            ...(callId ? { callId } : {}),
            failureStage,
          },
        ),
      failureStage === 'quota_gate' ? undefined : failureStage,
    );
  }

  async startAiConversation(user: RequestUser, dto: StartAiConversationDto) {
    const patientId = this.requiredString(dto.patientId, '患者 ID 不能为空。');
    await this.assertPatientAccess(user, patientId, 'full');
    const privacyConsent = await this.assertCurrentConsent(
      patientId,
      'privacy_policy',
    );
    const aiProcessingConsent = await this.assertCurrentConsent(
      patientId,
      'ai_processing',
    );

    const config = this.requireAiRuntimeConfig();
    const assessmentType = this.normalizeAiConversationAssessmentType(
      this.requiredString(dto.assessmentType, '评估类型不能为空。'),
    );
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      dto.physicalConditions,
      'AI 会话必须明确选择患者身体状况。',
    );

    const sessionId = randomUUID();
    const session = await this.prisma.aiConversationSession.create({
      data: {
        id: sessionId,
        patientId,
        createdByUserId: user.id,
        assessmentType,
        status: 'active',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpointRef: config.chatCompletionsEndpoint,
        promptVersion: config.promptVersion,
        metadata: {
          turnCount: 0,
          humanReview: {
            required: true,
            status: 'not_submitted',
          },
          consentSnapshot: this.buildAiConversationConsentSnapshot([
            privacyConsent,
            aiProcessingConsent,
          ]),
          ...(physicalConditions === undefined
            ? {}
            : { assessmentContext: { physicalConditions } }),
        },
      },
      select: {
        id: true,
        patientId: true,
        createdByUserId: true,
        assessmentType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        provider: true,
        modelVersion: true,
        callId: true,
        endpointRef: true,
        promptVersion: true,
        summaryEnvelope: true,
        reviewEnvelope: true,
        reviewedByUserId: true,
        reviewedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'ai.conversation.start',
      'ai_conversation_session',
      session.id,
      'success',
      {
        patientId,
        assessmentType,
        provider: config.provider,
        modelVersion: config.modelVersion,
        promptVersion: config.promptVersion,
        endpointRef: config.chatCompletionsEndpoint,
      },
    );

    return this.aiConversationSessionResponse(session);
  }

  async appendAiConversationMessage(
    user: RequestUser,
    sessionId: string,
    dto: AppendAiConversationMessageDto,
  ) {
    const id = this.requiredString(sessionId, 'AI 会话 ID 不能为空。');
    const session = await this.prisma.aiConversationSession.findUnique({
      where: { id },
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        status: true,
        metadata: true,
      },
    });
    if (!session) {
      throw new NotFoundException('AI 会话不存在。');
    }
    await this.assertPatientAccess(user, session.patientId, 'full');
    if (session.status !== 'active') {
      throw new BadRequestException('AI 会话已提交复核，不能继续追加消息。');
    }

    await this.assertCurrentConsent(session.patientId, 'privacy_policy');
    await this.assertCurrentConsent(session.patientId, 'ai_processing');

    const config = this.requireAiRuntimeConfig();
    const assessmentType = this.normalizeAiConversationAssessmentType(
      session.assessmentType,
    );
    const content = this.requiredString(
      dto.content,
      'AI 会话消息内容不能为空。',
    );
    const contentSnapshot =
      dto.contentSnapshot === undefined
        ? {}
        : this.requiredJsonObject(
            dto.contentSnapshot,
            'AI 会话消息快照必须是结构化对象。',
          );
    const recentMessages = await this.prisma.aiConversationMessage.findMany({
      where: { sessionId: id },
      orderBy: { turnIndex: 'desc' },
      take: 20,
      select: {
        id: true,
        sessionId: true,
        turnIndex: true,
        role: true,
        contentEnvelope: true,
        createdAt: true,
      },
    });
    const latestTurnIndex =
      this.resolveLatestAiConversationTurnIndex(recentMessages);
    const previousMessageViews = recentMessages
      .map((message) => this.aiConversationMessageResponse(message))
      .sort((left, right) => left.turnIndex - right.turnIndex);
    const { metadata: sessionMetadata, turnCount: observedTurnCount } =
      this.requiredAiConversationTurnState(session.metadata);
    const physicalConditions =
      this.readAiConversationPhysicalConditions(sessionMetadata);
    if (latestTurnIndex !== observedTurnCount) {
      throw new ConflictException('AI 会话消息版本与会话状态不一致。');
    }
    const nextUserTurnIndex = observedTurnCount + 1;
    const nextAssistantTurnIndex = nextUserTurnIndex + 1;
    const providerOperation = await this.acceptProviderOperation(
      user,
      session.patientId,
      'conversation_turn',
      dto.idempotencyKey,
      {
        sessionId: id,
        assessmentType,
        observedTurnCount,
        content,
        contentSnapshot,
        ...(physicalConditions === undefined ? {} : { physicalConditions }),
        previousMessageHashes: previousMessageViews.map((message) => ({
          turnIndex: message.turnIndex,
          role: message.role,
          contentHash: this.hashTextForEvidence(message.content),
        })),
      },
      {
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
      },
      {
        type: 'ai_conversation_session',
        id,
        version: String(observedTurnCount),
      },
    );

    const userMessageId = randomUUID();
    const userContentEnvelope = this.encryptSensitiveJsonField(
      {
        content,
        contentSnapshot,
        evidenceMetadata: { source: 'clinician_or_patient_input' },
      },
      {
        tableName: 'ai_conversation_message',
        recordId: userMessageId,
        fieldName: 'contentEnvelope',
      },
    );
    try {
      if (!providerOperation || providerOperation.status === 'accepted') {
        await this.reserveMimoUsage(
          user,
          session.patientId,
          'ai',
          dto.idempotencyKey,
        );
        await this.reserveAcceptedProviderOperation(providerOperation);
      }
    } catch (error) {
      await this.auditAiConversationFailure(
        user,
        session,
        config,
        'quota_gate',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: session.patientId,
        operation: 'ai',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        requestId: dto.idempotencyKey,
        statusCategory: 'quota_blocked',
        requestContentHash: this.hashTextForEvidence(content),
      });
      throw error;
    }
    await this.markProviderOperationDispatching(providerOperation);
    const calledAt = new Date().toISOString();
    const providerStartedAt = Date.now();
    let modelResponse: { callId: string; content: string };
    try {
      modelResponse = await this.callOpenAiCompatibleConversationModel(
        config,
        assessmentType,
        previousMessageViews,
        content,
        physicalConditions,
      );
    } catch (error) {
      if (error instanceof ProviderResponseRejectedException) {
        await this.finalizeProviderOperation(providerOperation, {
          status: 'response_rejected',
          providerRespondedAt: new Date(),
          ...(error.callId ? { providerCallId: error.callId } : {}),
          failureCategory: 'provider_response_validation',
        });
        await this.auditAiConversationFailure(
          user,
          session,
          config,
          'provider_response_validation',
          error.callId,
        );
        await this.recordProviderTelemetry({
          actorUserId: user.id,
          patientId: session.patientId,
          operation: 'ai',
          provider: config.provider,
          modelVersion: config.modelVersion,
          endpoint: config.chatCompletionsEndpoint,
          apiKeyRef: config.apiKeyRef,
          promptVersion: config.promptVersion,
          ...(error.callId ? { callId: error.callId } : {}),
          requestId: dto.idempotencyKey,
          statusCategory: 'response_rejected',
          durationMs: Date.now() - providerStartedAt,
          requestContentHash: this.hashTextForEvidence(content),
        });
        throw error;
      }
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        failureCategory: 'provider_transport_or_timeout',
      });
      await this.auditAiConversationFailure(
        user,
        session,
        config,
        'provider_call',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: session.patientId,
        operation: 'ai',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        requestId: dto.idempotencyKey,
        statusCategory: 'provider_failure',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashTextForEvidence(content),
      });
      throw error;
    }

    let parsed: { reply: string; evidence: Prisma.JsonObject };
    try {
      parsed = this.parseAiConversationReplyPayload(modelResponse);
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'response_rejected',
        providerRespondedAt: new Date(),
        providerCallId: modelResponse.callId,
        response: { providerContent: modelResponse.content },
        failureCategory: 'provider_response_validation',
      });
      await this.auditAiConversationFailure(
        user,
        session,
        config,
        'provider_response_validation',
        modelResponse.callId,
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: session.patientId,
        operation: 'ai',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.chatCompletionsEndpoint,
        apiKeyRef: config.apiKeyRef,
        promptVersion: config.promptVersion,
        callId: modelResponse.callId,
        requestId: dto.idempotencyKey,
        statusCategory: 'response_rejected',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashTextForEvidence(content),
        responseContentHash: this.hashTextForEvidence(modelResponse.content),
      });
      throw this.providerResponseRejection(error, modelResponse.callId);
    }

    const evidenceMetadata = {
      provider: config.provider,
      model: config.modelVersion,
      modelVersion: config.modelVersion,
      callId: modelResponse.callId,
      endpointRef: config.chatCompletionsEndpoint,
      apiKeyRef: config.apiKeyRef,
      promptVersion: config.promptVersion,
      calledAt,
      source: 'provider_conversation_turn',
      evidence: parsed.evidence,
      humanReview: {
        required: true,
        status: 'pending_conversation_completion',
      },
    };

    const assistantMessageId = randomUUID();
    const assistantContentEnvelope = this.encryptSensitiveJsonField(
      {
        content: parsed.reply,
        contentSnapshot: {
          contentHash: this.hashTextForEvidence(parsed.reply),
          generatedAt: calledAt,
        },
        evidenceMetadata,
      },
      {
        tableName: 'ai_conversation_message',
        recordId: assistantMessageId,
        fieldName: 'contentEnvelope',
      },
    );
    const auditWriteFailure = new ProviderAuditWriteFailure('ai');
    const response = await this.prisma
      .$transaction(async (tx) => {
        const claimed = await tx.aiConversationSession.updateMany({
          where: {
            id,
            status: 'active',
            metadata: { path: ['turnCount'], equals: observedTurnCount },
          },
          data: {
            callId: modelResponse.callId,
            provider: config.provider,
            modelVersion: config.modelVersion,
            endpointRef: config.chatCompletionsEndpoint,
            promptVersion: config.promptVersion,
            metadata: {
              ...sessionMetadata,
              turnCount: nextAssistantTurnIndex,
            },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('AI 会话状态或消息版本已变化。');
        }

        const userMessage = await tx.aiConversationMessage.create({
          data: {
            id: userMessageId,
            sessionId: id,
            turnIndex: nextUserTurnIndex,
            role: 'user',
            contentEnvelope: userContentEnvelope,
          },
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        });
        const assistantMessage = await tx.aiConversationMessage.create({
          data: {
            id: assistantMessageId,
            sessionId: id,
            turnIndex: nextAssistantTurnIndex,
            role: 'assistant',
            contentEnvelope: assistantContentEnvelope,
          },
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        });

        try {
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              actorRole: this.primaryRole(user),
              action: 'ai.conversation.message.append',
              targetType: 'ai_conversation_session',
              targetId: id,
              result: 'success',
              metadata: {
                patientId: session.patientId,
                provider: config.provider,
                modelVersion: config.modelVersion,
                promptVersion: config.promptVersion,
                callId: modelResponse.callId,
                endpointRef: config.chatCompletionsEndpoint,
                apiKeyRef: config.apiKeyRef,
                userMessageId: userMessage.id,
                assistantMessageId: assistantMessage.id,
                userContentHash: this.hashTextForEvidence(content),
                assistantContentHash: this.hashTextForEvidence(parsed.reply),
              },
            },
          });
        } catch {
          throw auditWriteFailure;
        }

        const response = {
          sessionId: id,
          userMessage: this.aiConversationMessageResponse(userMessage),
          assistantMessage:
            this.aiConversationMessageResponse(assistantMessage),
        };
        const providerEvidenceResult = {
          sessionId: id,
          userMessage: this.aiConversationProviderMessageResponse(userMessage),
          assistantMessage:
            this.aiConversationProviderMessageResponse(assistantMessage),
        };
        await this.finalizeProviderOperationInTransaction(
          tx,
          providerOperation,
          {
            status: 'completed',
            providerRespondedAt: new Date(),
            providerCallId: modelResponse.callId,
            response: {
              providerContent: modelResponse.content,
              result: providerEvidenceResult,
            },
          },
        );
        return response;
      })
      .catch((error: unknown) => {
        const finalized = this.finalizeProviderOperation(providerOperation, {
          status: 'outcome_unknown',
          providerRespondedAt: new Date(),
          providerCallId: modelResponse.callId,
          response: { providerContent: modelResponse.content },
          failureCategory: 'business_effect_or_audit_commit_failed',
        });
        if (error === auditWriteFailure) {
          return finalized.then(() =>
            this.throwProviderAuditWriteFailure(auditWriteFailure.operation),
          );
        }
        return finalized.then(() => {
          throw error;
        });
      });
    await this.recordProviderTelemetry({
      actorUserId: user.id,
      patientId: session.patientId,
      operation: 'ai',
      provider: config.provider,
      modelVersion: config.modelVersion,
      endpoint: config.chatCompletionsEndpoint,
      apiKeyRef: config.apiKeyRef,
      promptVersion: config.promptVersion,
      callId: modelResponse.callId,
      requestId: dto.idempotencyKey,
      statusCategory: 'provider_success',
      durationMs: Date.now() - providerStartedAt,
      requestContentHash: this.hashTextForEvidence(content),
      responseContentHash: this.hashTextForEvidence(modelResponse.content),
    });
    return response;
  }

  async completeAiConversation(
    user: RequestUser,
    sessionId: string,
    dto: CompleteAiConversationDto,
  ) {
    const id = this.requiredString(sessionId, 'AI 会话 ID 不能为空。');
    const session = await this.prisma.aiConversationSession.findUnique({
      where: { id },
      select: {
        id: true,
        patientId: true,
        status: true,
        metadata: true,
      },
    });
    if (!session) {
      throw new NotFoundException('AI 会话不存在。');
    }
    await this.assertPatientAccess(user, session.patientId, 'full');
    if (session.status !== 'active') {
      throw new ConflictException('AI 会话已提交复核，请勿重复提交。');
    }

    const summary = this.requiredString(dto.summary, 'AI 会话总结不能为空。');
    const reviewNote = this.requiredString(
      dto.reviewNote,
      '人工复核说明不能为空。',
    );
    const summaryEnvelope = this.encryptSensitiveJsonField(
      { summary },
      {
        tableName: 'ai_conversation_session',
        recordId: id,
        fieldName: 'summaryEnvelope',
      },
    );
    const reviewEnvelope = this.encryptSensitiveJsonField(
      { reviewNote },
      {
        tableName: 'ai_conversation_session',
        recordId: id,
        fieldName: 'reviewEnvelope',
      },
    );
    const { metadata: sessionMetadata, turnCount: observedTurnCount } =
      this.requiredAiConversationTurnState(session.metadata);

    const completedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiConversationSession.updateMany({
        where: {
          id,
          patientId: session.patientId,
          status: 'active',
          metadata: { path: ['turnCount'], equals: observedTurnCount },
        },
        data: {
          status: 'pending_human_review',
          summaryEnvelope,
          reviewEnvelope,
          completedAt,
          reviewedByUserId: null,
          reviewedAt: null,
          metadata: {
            ...sessionMetadata,
            turnCount: observedTurnCount,
            humanReview: {
              required: true,
              status: 'pending_human_review',
            },
            summaryHash: this.hashTextForEvidence(summary),
            reviewNoteHash: this.hashTextForEvidence(reviewNote),
          },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('AI 会话状态已变化。');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'ai.conversation.complete',
          targetType: 'ai_conversation_session',
          targetId: id,
          result: 'success',
          metadata: {
            patientId: session.patientId,
            status: 'pending_human_review',
            summaryHash: this.hashTextForEvidence(summary),
            reviewNoteHash: this.hashTextForEvidence(reviewNote),
          },
        },
      });
      const completed = await tx.aiConversationSession.findUnique({
        where: { id },
        select: {
          id: true,
          patientId: true,
          createdByUserId: true,
          assessmentType: true,
          status: true,
          startedAt: true,
          completedAt: true,
          provider: true,
          modelVersion: true,
          callId: true,
          endpointRef: true,
          promptVersion: true,
          summaryEnvelope: true,
          reviewEnvelope: true,
          reviewedByUserId: true,
          reviewedAt: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            orderBy: { turnIndex: 'asc' },
            select: {
              id: true,
              sessionId: true,
              turnIndex: true,
              role: true,
              contentEnvelope: true,
              createdAt: true,
            },
          },
        },
      });
      if (!completed) {
        throw new ConflictException('AI 会话状态已变化。');
      }
      return this.aiConversationSessionResponse(completed);
    });
  }

  async reviewAiConversation(
    user: RequestUser,
    sessionId: string,
    dto: ReviewAiConversationDto,
  ) {
    const id = this.requiredString(sessionId, 'AI 会话 ID 不能为空。');
    const session = await this.prisma.aiConversationSession.findUnique({
      where: { id },
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        status: true,
        summaryEnvelope: true,
        reviewEnvelope: true,
        reviewedByUserId: true,
        reviewedAt: true,
        metadata: true,
      },
    });
    if (!session) {
      throw new NotFoundException('AI 会话不存在。');
    }
    await this.assertResponsibleDoctorAccess(
      user,
      session.patientId,
      'ai_conversation_session',
      'ai_conversation_review_required',
    );
    if (session.status !== 'pending_human_review') {
      throw new ConflictException('AI 会话尚未提交医生复核或已完成复核。');
    }
    const conclusion = this.validateAiConversationReviewConclusion(
      dto.conclusion,
    );
    const reviewNote = this.requiredString(
      dto.reviewNote,
      'AI 会话复核说明不能为空。',
    );
    if (conclusion === 'approved') {
      const formalAssessments = await this.prisma.assessmentRecord.findMany({
        where: {
          patientId: session.patientId,
          assessmentType: session.assessmentType,
          status: 'completed',
        },
        orderBy: { completedAt: 'desc' },
        select: { id: true, resultEnvelope: true },
      });
      const hasLinkedFormalAssessment = formalAssessments.some(
        (formalAssessment) => {
          const formalAssessmentResult = this.decryptAssessmentResult(
            formalAssessment.id,
            formalAssessment.resultEnvelope,
          );
          const conversationEvidence =
            formalAssessmentResult.rawInputSummary.conversationEvidence;
          if (
            !conversationEvidence ||
            typeof conversationEvidence !== 'object' ||
            Array.isArray(conversationEvidence)
          ) {
            return false;
          }
          return (
            conversationEvidence.sessionId === id &&
            conversationEvidence.patientId === session.patientId &&
            conversationEvidence.assessmentType === session.assessmentType &&
            conversationEvidence.status === 'pending_human_review'
          );
        },
      );
      if (!hasLinkedFormalAssessment) {
        throw new BadRequestException(
          '请先保存本次 AI 对话生成的待复核正式评估，再批准 AI 对话。',
        );
      }
    }
    const reviewedAt = new Date();
    const metadata = this.asJsonObject(session.metadata);
    this.decryptAiConversationSummary(id, session.summaryEnvelope);
    this.decryptAiConversationReview(id, session.reviewEnvelope);
    const reviewEnvelope = this.encryptSensitiveJsonField(
      { reviewNote },
      {
        tableName: 'ai_conversation_session',
        recordId: id,
        fieldName: 'reviewEnvelope',
      },
    );
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiConversationSession.updateMany({
        where: {
          id,
          patientId: session.patientId,
          status: 'pending_human_review',
          reviewedByUserId: null,
          reviewedAt: null,
        },
        data: {
          status: conclusion === 'approved' ? 'reviewed' : 'active',
          reviewEnvelope,
          reviewedByUserId: user.id,
          reviewedAt,
          metadata: {
            ...metadata,
            humanReview: {
              required: true,
              status: conclusion === 'approved' ? 'reviewed' : 'returned',
              conclusion,
              reviewerUserId: user.id,
              reviewedAt: reviewedAt.toISOString(),
              reviewNoteHash: this.hashTextForEvidence(reviewNote),
            },
          },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('AI 会话复核状态已变化。');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'ai.conversation.review',
          targetType: 'ai_conversation_session',
          targetId: id,
          result: 'success',
          metadata: {
            patientId: session.patientId,
            conclusion,
            reviewNoteHash: this.hashTextForEvidence(reviewNote),
          },
        },
      });
      const reviewed = await tx.aiConversationSession.findUnique({
        where: { id },
        select: {
          id: true,
          patientId: true,
          createdByUserId: true,
          assessmentType: true,
          status: true,
          startedAt: true,
          completedAt: true,
          provider: true,
          modelVersion: true,
          callId: true,
          endpointRef: true,
          promptVersion: true,
          summaryEnvelope: true,
          reviewEnvelope: true,
          reviewedByUserId: true,
          reviewedAt: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            orderBy: { turnIndex: 'asc' },
            select: {
              id: true,
              sessionId: true,
              turnIndex: true,
              role: true,
              contentEnvelope: true,
              createdAt: true,
            },
          },
        },
      });
      if (!reviewed) {
        throw new ConflictException('AI 会话复核状态已变化。');
      }
      return this.aiConversationSessionResponse(reviewed);
    });
  }

  async getAiConversationAssessmentDraft(user: RequestUser, sessionId: string) {
    const id = this.requiredString(sessionId, 'AI 会话 ID 不能为空。');
    const session = await this.prisma.aiConversationSession.findUnique({
      where: { id },
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        status: true,
        summaryEnvelope: true,
        metadata: true,
        messages: {
          orderBy: { turnIndex: 'asc' },
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('AI 会话不存在。');
    }
    await this.assertResponsibleDoctorAccess(
      user,
      session.patientId,
      'ai_conversation_session',
      'ai_conversation_review_required',
    );
    if (session.status !== 'pending_human_review') {
      throw new ConflictException('AI 会话尚未提交医生复核或已完成复核。');
    }

    const assessmentType = this.normalizeAiConversationAssessmentType(
      session.assessmentType,
    );
    const physicalConditions = this.readAiConversationPhysicalConditions(
      this.requiredJsonObject(session.metadata, 'AI 会话元数据无效。'),
    );
    const summary = this.decryptAiConversationSummary(
      session.id,
      session.summaryEnvelope,
    );
    const messages = session.messages
      .map((message) => this.aiConversationMessageResponse(message))
      .sort((left, right) => left.turnIndex - right.turnIndex);
    const transcript = this.buildAiConversationAssessmentDraftTranscript({
      assessmentType,
      messages,
      sessionId: session.id,
      summary,
      physicalConditions,
    });
    const expectedRequest = {
      assessmentType,
      transcript,
      physicalConditions,
    };
    const candidates = await this.prisma.providerOperation.findMany({
      where: {
        patientId: session.patientId,
        operation: 'assessment_draft',
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        modelVersion: true,
        endpointHost: true,
        apiKeyRef: true,
        promptVersion: true,
        providerCallId: true,
        requestCiphertext: true,
        responseCiphertext: true,
        responseHmac: true,
      },
    });
    const matches = candidates.filter((candidate) =>
      isDeepStrictEqual(
        this.readProviderOperationRequest(candidate, 'AI 评估草稿'),
        expectedRequest,
      ),
    );
    if (!matches.length) return null;
    if (matches.length !== 1) {
      throw new ConflictException(
        '同一 AI 会话存在多份匹配的已完成评估草稿证据，已阻止恢复。',
      );
    }
    return this.recoverAiConversationAssessmentDraft(
      matches[0],
      expectedRequest,
      session.patientId,
    );
  }

  async listPatientAiConversations(user: RequestUser, patientId: string) {
    const id = this.requiredString(patientId, '患者 ID 不能为空。');
    await this.assertPatientAccess(user, id, 'full');
    const sessions = await this.prisma.aiConversationSession.findMany({
      where: { patientId: id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        patientId: true,
        createdByUserId: true,
        assessmentType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        provider: true,
        modelVersion: true,
        callId: true,
        endpointRef: true,
        promptVersion: true,
        summaryEnvelope: true,
        reviewEnvelope: true,
        reviewedByUserId: true,
        reviewedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { turnIndex: 'asc' },
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        },
      },
    });
    return sessions.map((session) =>
      this.isPatientOwnedRecordView(user, id)
        ? this.aiConversationPatientResponse(session)
        : this.aiConversationSessionResponse(session),
    );
  }

  private aiConversationMessageResponse<
    T extends {
      id: string;
      contentEnvelope: unknown;
    },
  >(message: T) {
    const { contentEnvelope, ...safeMessage } = message;
    return {
      ...safeMessage,
      ...this.decryptAiConversationMessageContent(message.id, contentEnvelope),
    };
  }

  private aiConversationProviderMessageResponse(message: {
    id: string;
    sessionId: string;
    turnIndex: number;
    role: string;
    contentEnvelope: unknown;
    createdAt: Date;
  }) {
    return {
      ...this.aiConversationMessageResponse(message),
      createdAt: message.createdAt.toISOString(),
    };
  }

  private aiConversationPatientMessageResponse(message: {
    id: string;
    sessionId: string;
    turnIndex: number;
    role: string;
    contentEnvelope: unknown;
    createdAt: Date;
  }) {
    const { content } = this.decryptAiConversationMessageContent(
      message.id,
      message.contentEnvelope,
    );
    return {
      id: message.id,
      sessionId: message.sessionId,
      turnIndex: message.turnIndex,
      role: message.role,
      content,
      createdAt: message.createdAt,
    };
  }

  private decryptAiConversationMessageContent(
    recordId: string,
    envelope: unknown,
  ) {
    const payload = this.requireExactAiConversationObject(
      decryptSensitiveJson<unknown>(
        envelope,
        {
          tableName: 'ai_conversation_message',
          recordId,
          fieldName: 'contentEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
      ['content', 'contentSnapshot', 'evidenceMetadata'],
      'AI 会话消息加密载荷格式无效。',
    );
    return {
      content: this.requiredString(
        payload.content,
        'AI 会话消息加密内容无效。',
      ),
      contentSnapshot: this.requiredJsonObject(
        payload.contentSnapshot,
        'AI 会话消息快照加密载荷无效。',
      ),
      evidenceMetadata: this.requiredJsonObject(
        payload.evidenceMetadata,
        'AI 会话消息证据加密载荷无效。',
      ),
    };
  }

  private requiredAiConversationTurnState(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('AI 会话元数据必须是结构化对象。');
    }
    const metadata = value as Prisma.JsonObject;
    const turnCount = metadata.turnCount;
    if (
      typeof turnCount !== 'number' ||
      !Number.isInteger(turnCount) ||
      turnCount < 0
    ) {
      throw new BadRequestException('AI 会话消息版本数据无效。');
    }
    return { metadata, turnCount };
  }

  private readAiConversationPhysicalConditions(
    metadata: Prisma.JsonObject,
  ): AssessmentPhysicalCondition[] {
    const context = metadata.assessmentContext;
    if (context === undefined) {
      throw new BadRequestException('AI 会话缺少身体状况安全上下文。');
    }
    const assessmentContext = this.requiredJsonObject(
      context,
      'AI 会话评估上下文必须是结构化对象。',
    );
    if (assessmentContext.physicalConditions === undefined) {
      throw new BadRequestException('AI 会话缺少身体状况安全上下文。');
    }
    return this.requireExplicitAssessmentPhysicalConditions(
      assessmentContext.physicalConditions,
      'AI 会话必须明确选择患者身体状况。',
    );
  }

  private decryptAiConversationSummary(recordId: string, envelope: unknown) {
    const payload = this.requireExactAiConversationObject(
      decryptSensitiveJson<unknown>(
        envelope,
        {
          tableName: 'ai_conversation_session',
          recordId,
          fieldName: 'summaryEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
      ['summary'],
      'AI 会话总结加密载荷格式无效。',
    );
    return this.requiredString(payload.summary, 'AI 会话总结加密内容无效。');
  }

  private decryptAiConversationReview(recordId: string, envelope: unknown) {
    const payload = this.requireExactAiConversationObject(
      decryptSensitiveJson<unknown>(
        envelope,
        {
          tableName: 'ai_conversation_session',
          recordId,
          fieldName: 'reviewEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
      ['reviewNote'],
      'AI 会话复核加密载荷格式无效。',
    );
    return this.requiredString(payload.reviewNote, 'AI 会话复核加密内容无效。');
  }

  private aiConversationSessionResponse<
    T extends {
      id: string;
      status: string;
      summaryEnvelope: unknown;
      reviewEnvelope: unknown;
      messages?: Array<{ id: string; contentEnvelope: unknown }>;
    },
  >(session: T) {
    const { summaryEnvelope, reviewEnvelope, messages, ...safeSession } =
      session;
    const requiresCompletedContent = [
      'pending_human_review',
      'reviewed',
    ].includes(session.status);
    if (
      requiresCompletedContent &&
      (summaryEnvelope === null || reviewEnvelope === null)
    ) {
      throw new BadRequestException('AI 会话缺少加密总结或复核内容。');
    }
    const summary =
      summaryEnvelope === null
        ? null
        : this.decryptAiConversationSummary(session.id, summaryEnvelope);
    const reviewNote =
      reviewEnvelope === null
        ? null
        : this.decryptAiConversationReview(session.id, reviewEnvelope);
    return {
      ...safeSession,
      summary,
      reviewNote,
      ...(messages
        ? {
            messages: messages.map((message) =>
              this.aiConversationMessageResponse(message),
            ),
          }
        : undefined),
    };
  }

  private aiConversationPatientResponse<
    T extends {
      id: string;
      patientId: string;
      assessmentType?: string;
      status: string;
      startedAt?: Date;
      completedAt?: Date | null;
      summaryEnvelope: unknown;
      reviewEnvelope: unknown;
      createdAt?: Date;
      updatedAt?: Date;
      messages?: Array<{
        id: string;
        sessionId: string;
        turnIndex: number;
        role: string;
        contentEnvelope: unknown;
        createdAt: Date;
      }>;
    },
  >(session: T) {
    const requiresCompletedContent = [
      'pending_human_review',
      'reviewed',
    ].includes(session.status);
    if (
      requiresCompletedContent &&
      (session.summaryEnvelope === null || session.reviewEnvelope === null)
    ) {
      throw new BadRequestException('AI 会话缺少加密总结或复核内容。');
    }
    return {
      id: session.id,
      patientId: session.patientId,
      status: session.status,
      summary:
        session.summaryEnvelope === null
          ? null
          : this.decryptAiConversationSummary(
              session.id,
              session.summaryEnvelope,
            ),
      ...(session.assessmentType === undefined
        ? {}
        : { assessmentType: session.assessmentType }),
      ...(session.startedAt === undefined
        ? {}
        : { startedAt: session.startedAt }),
      ...(session.completedAt === undefined
        ? {}
        : { completedAt: session.completedAt }),
      ...(session.createdAt === undefined
        ? {}
        : { createdAt: session.createdAt }),
      ...(session.updatedAt === undefined
        ? {}
        : { updatedAt: session.updatedAt }),
      ...(session.messages
        ? {
            messages: session.messages.map((message) =>
              this.aiConversationPatientMessageResponse(message),
            ),
          }
        : undefined),
    };
  }

  private requireExactAiConversationObject(
    value: unknown,
    expectedKeys: string[],
    message: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    const keys = Object.keys(value).sort();
    const sortedExpectedKeys = [...expectedKeys].sort();
    if (
      keys.length !== sortedExpectedKeys.length ||
      keys.some((key, index) => key !== sortedExpectedKeys[index])
    ) {
      throw new BadRequestException(message);
    }
    return value as Record<string, unknown>;
  }

  private async auditAiConversationFailure(
    user: RequestUser,
    session: { id: string; patientId: string },
    config: AiRuntimeConfig,
    failureStage:
      | 'quota_gate'
      | 'provider_call'
      | 'provider_response_validation',
    callId?: string,
  ) {
    await this.auditProviderOperation(
      'ai',
      () =>
        this.audit(
          user.id,
          this.primaryRole(user),
          'ai.conversation.message.append',
          'ai_conversation_session',
          session.id,
          'failed',
          {
            patientId: session.patientId,
            provider: config.provider,
            modelVersion: config.modelVersion,
            promptVersion: config.promptVersion,
            endpointRef: config.chatCompletionsEndpoint,
            apiKeyRef: config.apiKeyRef,
            ...(callId ? { callId } : {}),
            failureStage,
          },
        ),
      failureStage === 'quota_gate' ? undefined : failureStage,
    );
  }

  async createAssessmentSpeechTranscript(
    user: RequestUser,
    dto: AssessmentSpeechTranscriptDto,
  ) {
    await this.assertPatientAccess(user, dto.patientId, 'full');

    await this.assertCurrentConsent(dto.patientId, 'privacy_policy');
    await this.assertCurrentConsent(dto.patientId, 'ai_processing');
    await this.assertCurrentConsent(dto.patientId, 'microphone_capture');

    const config = this.requireSpeechRuntimeConfig();
    const audio = this.validateSpeechAudioInput(dto.audio, config.inputLimits);
    const assessmentType = this.normalizeAiConversationAssessmentType(
      this.requiredString(dto.assessmentType, '评估类型不能为空。'),
    );
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      dto.physicalConditions,
      '语音评估必须明确选择患者身体状况。',
    );
    const providerOperation = await this.acceptProviderOperation(
      user,
      dto.patientId,
      'speech_transcript',
      dto.idempotencyKey,
      {
        assessmentType,
        physicalConditions,
        audio: {
          contentHash: this.hashBase64ForEvidence(audio.contentBase64),
          mimeType: audio.mimeType,
          durationSeconds: audio.durationSeconds,
        },
      },
      {
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
      },
    );
    try {
      if (!providerOperation || providerOperation.status === 'accepted') {
        await this.reserveMimoUsage(
          user,
          dto.patientId,
          'speech',
          dto.idempotencyKey,
          audio.durationSeconds,
        );
        await this.reserveAcceptedProviderOperation(providerOperation);
      }
    } catch (error) {
      await this.auditSpeechTranscriptFailure(
        user,
        dto.patientId,
        config,
        'quota_gate',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'speech',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
        requestId: dto.idempotencyKey,
        statusCategory: 'quota_blocked',
        requestContentHash: this.hashBase64ForEvidence(audio.contentBase64),
      });
      throw error;
    }
    await this.markProviderOperationDispatching(providerOperation);
    const calledAt = new Date().toISOString();
    const providerStartedAt = Date.now();

    let providerResponse: { callId: string; content: string };
    try {
      providerResponse = await this.callXiaomiAudioUnderstandingForTranscript(
        config,
        audio,
      );
    } catch (error) {
      if (error instanceof ProviderResponseRejectedException) {
        await this.finalizeProviderOperation(providerOperation, {
          status: 'response_rejected',
          providerRespondedAt: new Date(),
          ...(error.callId ? { providerCallId: error.callId } : {}),
          failureCategory: 'provider_response_validation',
        });
        await this.auditSpeechTranscriptFailure(
          user,
          dto.patientId,
          config,
          'provider_response_validation',
          error.callId,
        );
        await this.recordProviderTelemetry({
          actorUserId: user.id,
          patientId: dto.patientId,
          operation: 'speech',
          provider: config.provider,
          modelVersion: config.modelVersion,
          endpoint: config.endpoint,
          apiKeyRef: config.apiKeyRef,
          ...(error.callId ? { callId: error.callId } : {}),
          requestId: dto.idempotencyKey,
          statusCategory: 'response_rejected',
          durationMs: Date.now() - providerStartedAt,
          requestContentHash: this.hashBase64ForEvidence(audio.contentBase64),
        });
        throw error;
      }
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        failureCategory: 'provider_transport_or_timeout',
      });
      await this.auditSpeechTranscriptFailure(
        user,
        dto.patientId,
        config,
        'provider_call',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'speech',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
        requestId: dto.idempotencyKey,
        statusCategory: 'provider_failure',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashBase64ForEvidence(audio.contentBase64),
      });
      throw error;
    }

    let transcript: string;
    try {
      transcript = this.parseSpeechTranscriptPayload(providerResponse);
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'response_rejected',
        providerRespondedAt: new Date(),
        providerCallId: providerResponse.callId,
        response: { providerContent: providerResponse.content },
        failureCategory: 'provider_response_validation',
      });
      await this.auditSpeechTranscriptFailure(
        user,
        dto.patientId,
        config,
        'provider_response_validation',
        providerResponse.callId,
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'speech',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
        callId: providerResponse.callId,
        requestId: dto.idempotencyKey,
        statusCategory: 'response_rejected',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashBase64ForEvidence(audio.contentBase64),
        responseContentHash: this.hashTextForEvidence(providerResponse.content),
      });
      throw this.providerResponseRejection(error, providerResponse.callId);
    }

    const speechEvidence = {
      provider: config.provider,
      modelVersion: config.modelVersion,
      callId: providerResponse.callId,
      endpointRef: config.endpoint,
      apiKeyRef: config.apiKeyRef,
      source: 'provider_audio_understanding',
      calledAt,
      audio: {
        mimeType: audio.mimeType,
        durationSeconds: audio.durationSeconds,
      },
    };

    const result = {
      patientId: dto.patientId,
      assessmentType,
      physicalConditions,
      status: 'transcribed' as const,
      transcript,
      speechEvidence,
    };
    const auditWriteFailure = new ProviderAuditWriteFailure('speech');
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.finalizeProviderOperationInTransaction(
          tx,
          providerOperation,
          {
            status: 'completed',
            providerRespondedAt: new Date(),
            providerCallId: providerResponse.callId,
            response: {
              providerContent: providerResponse.content,
              result,
            },
          },
        );
        try {
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              actorRole: this.primaryRole(user),
              action: 'ai.assessment_speech_transcript.generate',
              targetType: 'patient_profile',
              targetId: dto.patientId,
              result: 'success',
              metadata: {
                provider: config.provider,
                modelVersion: config.modelVersion,
                callId: providerResponse.callId,
                endpointRef: config.endpoint,
                apiKeyRef: config.apiKeyRef,
                source: speechEvidence.source,
                calledAt,
                audio: speechEvidence.audio,
              },
            },
          });
        } catch {
          throw auditWriteFailure;
        }
      });
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        providerCallId: providerResponse.callId,
        response: {
          providerContent: providerResponse.content,
          result,
        },
        failureCategory: 'business_effect_or_audit_commit_failed',
      });
      if (error === auditWriteFailure) {
        this.throwProviderAuditWriteFailure('speech');
      }
      throw error;
    }
    await this.recordProviderTelemetry({
      actorUserId: user.id,
      patientId: dto.patientId,
      operation: 'speech',
      provider: config.provider,
      modelVersion: config.modelVersion,
      endpoint: config.endpoint,
      apiKeyRef: config.apiKeyRef,
      callId: providerResponse.callId,
      requestId: dto.idempotencyKey,
      statusCategory: 'provider_success',
      durationMs: Date.now() - providerStartedAt,
      requestContentHash: this.hashBase64ForEvidence(audio.contentBase64),
      responseContentHash: this.hashTextForEvidence(providerResponse.content),
    });

    return result;
  }

  private async auditSpeechTranscriptFailure(
    user: RequestUser,
    patientId: string,
    config: SpeechRuntimeConfig,
    failureStage:
      | 'quota_gate'
      | 'provider_call'
      | 'provider_response_validation',
    callId?: string,
  ) {
    await this.auditProviderOperation(
      'speech',
      () =>
        this.audit(
          user.id,
          this.primaryRole(user),
          'ai.assessment_speech_transcript.generate',
          'patient_profile',
          patientId,
          'failed',
          {
            provider: config.provider,
            modelVersion: config.modelVersion,
            endpointRef: config.endpoint,
            apiKeyRef: config.apiKeyRef,
            ...(callId ? { callId } : {}),
            failureStage,
          },
        ),
      failureStage === 'quota_gate' ? undefined : failureStage,
    );
  }

  async createTtsSpeechOutput(user: RequestUser, dto: TtsSpeechOutputDto) {
    await this.assertPatientAccess(user, dto.patientId, 'full');

    await this.assertCurrentConsent(dto.patientId, 'privacy_policy');
    await this.assertCurrentConsent(dto.patientId, 'ai_processing');

    const config = this.requireTtsRuntimeConfig();
    const synthesisInput = this.validateTtsSynthesisInput(dto);
    const providerOperation = await this.acceptProviderOperation(
      user,
      dto.patientId,
      'tts_output',
      dto.idempotencyKey,
      synthesisInput,
      {
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
      },
    );
    try {
      if (!providerOperation || providerOperation.status === 'accepted') {
        await this.reserveMimoUsage(
          user,
          dto.patientId,
          'tts',
          dto.idempotencyKey,
          synthesisInput.text.length,
        );
        await this.reserveAcceptedProviderOperation(providerOperation);
      }
    } catch (error) {
      await this.auditTtsSpeechOutputFailure(
        user,
        dto.patientId,
        config,
        'quota_gate',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'tts',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
        requestId: dto.idempotencyKey,
        statusCategory: 'quota_blocked',
        requestContentHash: this.hashTextForEvidence(synthesisInput.text),
      });
      throw error;
    }
    await this.markProviderOperationDispatching(providerOperation);
    const calledAt = new Date().toISOString();
    const providerStartedAt = Date.now();

    let providerResponse: { callId: string; message: Prisma.JsonObject };
    try {
      providerResponse = await this.callXiaomiTtsForSpeechOutput(
        config,
        synthesisInput,
      );
    } catch (error) {
      if (error instanceof ProviderResponseRejectedException) {
        await this.finalizeProviderOperation(providerOperation, {
          status: 'response_rejected',
          providerRespondedAt: new Date(),
          ...(error.callId ? { providerCallId: error.callId } : {}),
          failureCategory: 'provider_response_validation',
        });
        await this.auditTtsSpeechOutputFailure(
          user,
          dto.patientId,
          config,
          'provider_response_validation',
          error.callId,
        );
        await this.recordProviderTelemetry({
          actorUserId: user.id,
          patientId: dto.patientId,
          operation: 'tts',
          provider: config.provider,
          modelVersion: config.modelVersion,
          endpoint: config.endpoint,
          apiKeyRef: config.apiKeyRef,
          ...(error.callId ? { callId: error.callId } : {}),
          requestId: dto.idempotencyKey,
          statusCategory: 'response_rejected',
          durationMs: Date.now() - providerStartedAt,
          requestContentHash: this.hashTextForEvidence(synthesisInput.text),
        });
        throw error;
      }
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        failureCategory: 'provider_transport_or_timeout',
      });
      await this.auditTtsSpeechOutputFailure(
        user,
        dto.patientId,
        config,
        'provider_call',
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'tts',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
        requestId: dto.idempotencyKey,
        statusCategory: 'provider_failure',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashTextForEvidence(synthesisInput.text),
      });
      throw error;
    }

    let audio: {
      contentBase64: string;
      mimeType: TtsRuntimeConfig['outputMimeType'];
      byteLength: number;
    };
    try {
      audio = this.parseTtsSpeechOutputPayload(providerResponse, config);
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'response_rejected',
        providerRespondedAt: new Date(),
        providerCallId: providerResponse.callId,
        response: { providerResponseReceived: true },
        failureCategory: 'provider_response_validation',
      });
      await this.auditTtsSpeechOutputFailure(
        user,
        dto.patientId,
        config,
        'provider_response_validation',
        providerResponse.callId,
      );
      await this.recordProviderTelemetry({
        actorUserId: user.id,
        patientId: dto.patientId,
        operation: 'tts',
        provider: config.provider,
        modelVersion: config.modelVersion,
        endpoint: config.endpoint,
        apiKeyRef: config.apiKeyRef,
        callId: providerResponse.callId,
        requestId: dto.idempotencyKey,
        statusCategory: 'response_rejected',
        durationMs: Date.now() - providerStartedAt,
        requestContentHash: this.hashTextForEvidence(synthesisInput.text),
      });
      throw this.providerResponseRejection(error, providerResponse.callId);
    }

    const ttsEvidence = {
      provider: config.provider,
      modelVersion: config.modelVersion,
      callId: providerResponse.callId,
      endpointRef: config.endpoint,
      apiKeyRef: config.apiKeyRef,
      source: 'provider_text_to_speech',
      calledAt,
      voiceId: config.voiceId,
      scenario: synthesisInput.scenario,
      inputTextHash: this.hashTextForEvidence(synthesisInput.text),
      audio: {
        mimeType: audio.mimeType,
        format: config.outputFormat,
        byteLength: audio.byteLength,
      },
    };

    const result = {
      patientId: dto.patientId,
      status: 'synthesized' as const,
      ttsEvidence,
    };
    const auditWriteFailure = new ProviderAuditWriteFailure('tts');
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.finalizeProviderOperationInTransaction(
          tx,
          providerOperation,
          {
            status: 'completed',
            providerRespondedAt: new Date(),
            providerCallId: providerResponse.callId,
            // TTS bytes require the separately approved encrypted asset store.
            response: { result },
          },
        );
        try {
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              actorRole: this.primaryRole(user),
              action: 'ai.tts_speech_output.generate',
              targetType: 'patient_profile',
              targetId: dto.patientId,
              result: 'success',
              metadata: {
                provider: config.provider,
                modelVersion: config.modelVersion,
                callId: providerResponse.callId,
                endpointRef: config.endpoint,
                apiKeyRef: config.apiKeyRef,
                source: ttsEvidence.source,
                calledAt,
                voiceId: config.voiceId,
                scenario: synthesisInput.scenario,
                inputTextHash: ttsEvidence.inputTextHash,
                audio: ttsEvidence.audio,
              },
            },
          });
        } catch {
          throw auditWriteFailure;
        }
      });
    } catch (error) {
      await this.finalizeProviderOperation(providerOperation, {
        status: 'outcome_unknown',
        providerRespondedAt: new Date(),
        providerCallId: providerResponse.callId,
        // TTS bytes require the separately approved encrypted asset store.
        response: { result },
        failureCategory: 'business_effect_or_audit_commit_failed',
      });
      if (error === auditWriteFailure) {
        this.throwProviderAuditWriteFailure('tts');
      }
      throw error;
    }
    await this.recordProviderTelemetry({
      actorUserId: user.id,
      patientId: dto.patientId,
      operation: 'tts',
      provider: config.provider,
      modelVersion: config.modelVersion,
      endpoint: config.endpoint,
      apiKeyRef: config.apiKeyRef,
      callId: providerResponse.callId,
      requestId: dto.idempotencyKey,
      statusCategory: 'provider_success',
      durationMs: Date.now() - providerStartedAt,
      requestContentHash: this.hashTextForEvidence(synthesisInput.text),
      responseContentHash: this.hashBase64ForEvidence(audio.contentBase64),
    });

    return {
      ...result,
      audio,
    };
  }

  private async auditTtsSpeechOutputFailure(
    user: RequestUser,
    patientId: string,
    config: TtsRuntimeConfig,
    failureStage:
      | 'quota_gate'
      | 'provider_call'
      | 'provider_response_validation',
    callId?: string,
  ) {
    await this.auditProviderOperation(
      'tts',
      () =>
        this.audit(
          user.id,
          this.primaryRole(user),
          'ai.tts_speech_output.generate',
          'patient_profile',
          patientId,
          'failed',
          {
            provider: config.provider,
            modelVersion: config.modelVersion,
            endpointRef: config.endpoint,
            apiKeyRef: config.apiKeyRef,
            voiceId: config.voiceId,
            ...(callId ? { callId } : {}),
            failureStage,
          },
        ),
      failureStage === 'quota_gate' ? undefined : failureStage,
    );
  }

  async listAssessments(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    const assessments = await this.prisma.assessmentRecord.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        source: true,
        status: true,
        resultEnvelope: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        riskGrades: {
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            riskLevel: true,
            systemRiskLevel: true,
            manualRiskLevel: true,
            isCurrent: true,
            reasonEnvelope: true,
            confirmedById: true,
            confirmedAt: true,
            createdAt: true,
          },
        },
        aiAnalyses: {
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            trainingSessionId: true,
            analysisScene: true,
            modelVersion: true,
            confidence: true,
            inputEnvelope: true,
            outputEnvelope: true,
            createdAt: true,
          },
        },
      },
    });
    return assessments.map((assessment) =>
      this.isPatientOwnedRecordView(user, patientId)
        ? this.serializeAssessmentForPatientProgress(assessment)
        : this.assessmentRecordResponse(assessment),
    );
  }

  async recommendPlan(user: RequestUser, dto: RecommendPlanDto) {
    const actingDoctorId = await this.assertResponsibleDoctorAccess(
      user,
      dto.patientId,
      'rehab_plan',
      'rehab_plan_recommend_required',
    );

    let requestedGameIds: string[] | undefined;
    if (dto.gameContentIds !== undefined) {
      if (
        !Array.isArray(dto.gameContentIds) ||
        dto.gameContentIds.length === 0 ||
        dto.gameContentIds.length > 9 ||
        dto.gameContentIds.some(
          (id) => typeof id !== 'string' || !id.trim() || id !== id.trim(),
        )
      ) {
        throw new BadRequestException(
          '显式选择必须包含 1 到 9 个有效训练游戏 ID。',
        );
      }
      if (new Set(dto.gameContentIds).size !== dto.gameContentIds.length) {
        throw new BadRequestException('显式选择不能包含重复训练游戏。');
      }
      requestedGameIds = dto.gameContentIds;
    }

    const currentRisk = await this.prisma.riskGradeRecord.findFirst({
      where: { patientId: dto.patientId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        riskLevel: true,
        systemRiskLevel: true,
        manualRiskLevel: true,
        confirmedById: true,
        confirmedAt: true,
        assessment: {
          select: {
            id: true,
            resultEnvelope: true,
          },
        },
      },
    });
    if (!currentRisk) {
      throw new BadRequestException(
        '患者尚无当前风险评级，请先完成评估后再生成康复方案。',
      );
    }
    if (!currentRisk.confirmedById || !currentRisk.confirmedAt) {
      throw new BadRequestException(
        '当前风险评级尚未经过医师确认，不能生成康复方案。',
      );
    }
    const candidateGames = await this.prisma.gameContent.findMany({
      where: {
        status: 'active',
        runtimeType: { in: [...supportedFormalRuntimeTypes] },
        buildStatus: 'released',
        gameVersion: { not: null },
        bridgeProtocolVersion: '1.0.0',
      },
      orderBy: { name: 'asc' },
    });
    const games = candidateGames.filter((game) =>
      this.isGameReadyForFormalTraining(game),
    );
    if (!games.length) {
      throw new BadRequestException(
        '没有已发布且配置完整的正式训练游戏，无法生成康复方案。',
      );
    }

    const assessmentResult = this.decryptAssessmentResult(
      currentRisk.assessment.id,
      currentRisk.assessment.resultEnvelope,
    );
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      assessmentResult.physicalConditions,
      '当前评估缺少身体状况安全结论，请重新完成评估后再生成康复方案。',
    );
    const effectiveRiskLevel =
      currentRisk.manualRiskLevel ?? currentRisk.riskLevel;
    const safeGames = this.filterGamesByPhysicalConditions(
      games,
      physicalConditions,
    );
    if (physicalConditions?.length && !safeGames.length) {
      throw new BadRequestException(
        '当前身体状况没有已配置安全准入条件的正式训练游戏，不能生成康复方案。',
      );
    }

    const scoredGames = safeGames.map((game) => ({
      game,
      score: this.scoreGame(
        game.trainingTargets,
        game.tags,
        effectiveRiskLevel,
        physicalConditions,
      ),
    }));
    const selectedGames = requestedGameIds
      ? requestedGameIds.map((id) => {
          const selected = scoredGames.find(({ game }) => game.id === id);
          if (!selected) {
            throw new BadRequestException(
              '显式选择包含不存在、未正式发布或不满足当前身体状况准入的训练游戏。',
            );
          }
          return selected;
        })
      : scoredGames
          .sort((a, b) => this.compareGameRecommendationCandidates(a, b))
          .slice(0, 3);

    return this.prisma
      .$transaction(async (tx) => {
        const plan = await tx.rehabPlan.create({
          data: {
            patientId: dto.patientId,
            doctorId: actingDoctorId,
            planName: '系统推荐个性化康复计划',
            status: 'pending_confirm',
            isCurrent: false,
            weekFrequency: effectiveRiskLevel === 'high' ? 3 : 4,
            dailyDuration: effectiveRiskLevel === 'high' ? 16 : 24,
            difficultyLadder: {
              mode: 'rule_based',
              firstWeek: effectiveRiskLevel === 'high' ? 'low' : 'moderate',
            },
            recommendationReason: physicalConditions?.length
              ? `根据认知评级、患者身体状况（${physicalConditions.join('、')}）的游戏安全准入标签和训练目标生成，可由医师调整。`
              : '根据认知评级、游戏标签和训练目标生成，可由医师调整。',
            items: {
              create: selectedGames.map(({ game, score }, index) => ({
                gameContentId: game.id,
                sequence: index + 1,
                durationMinutes: game.defaultDuration,
                frequencyPerWeek: index === 0 ? 5 : 3,
                difficulty: game.defaultDifficulty,
                adaptiveRules: {
                  source: 'rule_based',
                  physicalConditions: physicalConditions ?? [],
                  physicalConditionSafety: physicalConditions?.length
                    ? {
                        requiredTags: physicalConditions.map(
                          (condition) => `safety:${condition}_compatible`,
                        ),
                        matched: true,
                      }
                    : {
                        requiredTags: [],
                        matched: true,
                      },
                  recommendationScore: score,
                  increaseWhenAccuracyAbove: 0.9,
                  reduceWhenMissesAbove: 5,
                },
              })),
            },
          },
          include: {
            items: {
              orderBy: { sequence: 'asc' },
              include: { gameContent: true },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: this.primaryRole(user),
            action: 'rehab_plan.recommend',
            targetType: 'rehab_plan',
            targetId: plan.id,
            result: 'success',
            metadata: {
              patientId: dto.patientId,
              riskGradeId: currentRisk.id,
              doctorId: actingDoctorId,
              selectionSource: requestedGameIds
                ? 'explicit_game_selection'
                : 'ranked_recommendation',
              selectedGameContentIds: selectedGames.map(({ game }) => game.id),
            },
          },
        });
        return plan;
      })
      .catch((error: unknown) => {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException('患者已有待确认康复方案。');
        }
        throw error;
      });
  }

  async confirmPlan(user: RequestUser, planId: string, dto: ConfirmPlanDto) {
    const plan = await this.prisma.rehabPlan.findUnique({
      where: { id: planId },
      include: {
        patient: { select: { id: true, responsibleDoctorId: true } },
        items: { include: { gameContent: true } },
      },
    });
    if (!plan) throw new NotFoundException('计划不存在');
    const actingDoctorId = await this.assertResponsibleDoctorForPatient(
      user,
      plan.patient,
      'rehab_plan',
      'rehab_plan_confirm_required',
    );
    if (plan.status !== 'pending_confirm' || plan.isCurrent) {
      throw new ConflictException('康复方案状态已变化。');
    }

    const dailyDuration = this.requiredInteger(
      dto.dailyDuration,
      '每日训练时长必须是整数。',
    );
    this.assertRange(
      dailyDuration,
      1,
      240,
      '每日训练时长必须在 1 到 240 分钟之间。',
    );
    const weekFrequency = this.requiredInteger(
      dto.weekFrequency,
      '每周训练频次必须是整数。',
    );
    this.assertRange(weekFrequency, 1, 7, '每周训练频次必须在 1 到 7 次之间。');
    const adjustmentReason = this.requiredString(
      dto.adjustmentReason,
      '医生调整说明不能为空。',
    );
    const currentRisk = await this.prisma.riskGradeRecord.findFirst({
      where: { patientId: plan.patientId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: {
        confirmedById: true,
        confirmedAt: true,
        assessment: { select: { id: true, resultEnvelope: true } },
      },
    });
    if (!currentRisk?.confirmedById || !currentRisk.confirmedAt) {
      throw new BadRequestException(
        '当前风险评级尚未经过医师确认，不能启用康复方案。',
      );
    }
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      this.decryptAssessmentResult(
        currentRisk.assessment.id,
        currentRisk.assessment.resultEnvelope,
      ).physicalConditions,
      '当前评估缺少身体状况安全结论，不能启用康复方案。',
    );
    this.assertGamesSafeForPhysicalConditions(
      plan.items.map((item) => item.gameContent),
      physicalConditions,
    );
    const itemAdjustments = dto.itemAdjustments ?? [];
    const seenAdjustmentGameIds = new Set<string>();
    for (const item of itemAdjustments) {
      const gameContentId = this.requiredString(
        item.gameContentId,
        '计划调整缺少训练游戏。',
      );
      if (seenAdjustmentGameIds.has(gameContentId)) {
        throw new BadRequestException('同一训练游戏不能重复调整。');
      }
      seenAdjustmentGameIds.add(gameContentId);
      if (
        !plan.items.some((planItem) => planItem.gameContentId === gameContentId)
      ) {
        throw new BadRequestException('计划调整项不属于当前康复方案。');
      }
      const durationMinutes = this.requiredInteger(
        item.durationMinutes,
        '训练项目时长必须是整数。',
      );
      this.assertRange(
        durationMinutes,
        1,
        240,
        '训练项目时长必须在 1 到 240 分钟之间。',
      );
      const frequencyPerWeek = this.requiredInteger(
        item.frequencyPerWeek,
        '训练项目频次必须是整数。',
      );
      this.assertRange(
        frequencyPerWeek,
        1,
        7,
        '训练项目频次必须在 1 到 7 次之间。',
      );
      this.requiredString(item.difficulty, '训练项目难度不能为空。');
    }

    return this.prisma
      .$transaction(async (tx) => {
        await tx.rehabPlan.updateMany({
          where: { patientId: plan.patientId, isCurrent: true },
          data: { isCurrent: false, status: 'ended' },
        });
        const difficultyLadder = this.jsonInput(
          dto.difficultyLadder ?? plan.difficultyLadder ?? {},
        );

        const claimed = await tx.rehabPlan.updateMany({
          where: {
            id: planId,
            patientId: plan.patientId,
            doctorId: actingDoctorId,
            status: 'pending_confirm',
            isCurrent: false,
          },
          data: {
            doctorId: actingDoctorId,
            dailyDuration,
            weekFrequency,
            difficultyLadder,
            status: 'active',
            isCurrent: true,
            confirmedAt: new Date(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('康复方案状态已变化。');
        }

        if (itemAdjustments.length) {
          for (const item of itemAdjustments) {
            const updated = await tx.rehabPlanItem.updateMany({
              where: { rehabPlanId: planId, gameContentId: item.gameContentId },
              data: {
                durationMinutes: item.durationMinutes,
                frequencyPerWeek: item.frequencyPerWeek,
                difficulty: item.difficulty,
              },
            });
            if (updated.count !== 1) {
              throw new ConflictException('康复方案训练项目已发生变化。');
            }
          }
        }

        await tx.planAdjustmentRecord.create({
          data: {
            rehabPlanId: planId,
            doctorId: actingDoctorId,
            originalSnapshot: {
              dailyDuration: plan.dailyDuration,
              weekFrequency: plan.weekFrequency,
              difficultyLadder: this.jsonInput(plan.difficultyLadder ?? {}),
              items: plan.items,
            },
            adjustedSnapshot: {
              dailyDuration,
              weekFrequency,
              difficultyLadder,
              itemAdjustments,
            },
            adjustmentReason,
          },
        });
        const confirmed = await tx.rehabPlan.findUnique({
          where: { id: planId },
          include: {
            items: {
              orderBy: { sequence: 'asc' },
              include: { gameContent: true },
            },
          },
        });
        if (!confirmed) {
          throw new ConflictException('康复方案状态已变化。');
        }
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: this.primaryRole(user),
            action: 'rehab_plan.confirm',
            targetType: 'rehab_plan',
            targetId: planId,
            result: 'success',
            metadata: {
              patientId: confirmed.patientId,
              doctorId: confirmed.doctorId,
              planItemIds: confirmed.items.map((item) => item.id),
            },
          },
        });
        return confirmed;
      })
      .catch((error: unknown) => {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException('患者当前康复方案已发生变化。');
        }
        throw error;
      });
  }

  async startTrainingSession(user: RequestUser, dto: StartTrainingDto) {
    await this.assertTrainingWriteAccess(user, dto.patientId);

    const planItem = await this.prisma.rehabPlanItem.findFirst({
      where: {
        id: dto.planItemId,
        rehabPlanId: dto.rehabPlanId,
        gameContentId: dto.gameContentId,
        rehabPlan: {
          patientId: dto.patientId,
          status: 'active',
          isCurrent: true,
        },
      },
      include: { gameContent: true, rehabPlan: true },
    });
    if (!planItem) {
      throw new BadRequestException('训练项目不属于当前生效计划');
    }
    this.assertGameReadyForFormalTraining(planItem.gameContent);

    const collectionBatchId = this.requiredString(
      dto.collectionBatchId,
      '采集批次 ID 不能为空，请先创建正式采集批次后再开始训练。',
    );
    const collectionBatch = await this.prisma.collectionBatch.findUnique({
      where: { id: collectionBatchId },
      include: { protocol: true, condition: true },
    });
    this.assertCollectionBatchMatchesTrainingContext(
      collectionBatch,
      dto,
      planItem.gameContent,
    );
    await this.assertTrainingRuntimeConsents(
      dto.patientId,
      planItem.gameContent,
      collectionBatch.protocol.requiredConsentTypes,
      collectionBatch.protocol.requiredInputModes,
    );
    const currentRisk = await this.prisma.riskGradeRecord.findFirst({
      where: { patientId: dto.patientId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: {
        assessmentId: true,
        riskLevel: true,
        manualRiskLevel: true,
        confirmedById: true,
        confirmedAt: true,
        assessment: { select: { id: true, resultEnvelope: true } },
      },
    });
    const trainingAssessment = this.assertConfirmedAssessmentForFormalTraining(
      currentRisk,
      '缺少已确认评估来源，不能开始正式训练。',
    );
    const physicalConditions = trainingAssessment.physicalConditions;
    this.assertCollectionProtocolMatchesAssessment(
      collectionBatch.protocol,
      trainingAssessment,
    );
    this.assertGamesSafeForPhysicalConditions(
      [planItem.gameContent],
      physicalConditions,
    );

    const runtimeContext = this.buildTrainingRuntimeContext(
      dto,
      planItem,
      planItem.gameContent,
      collectionBatch,
      trainingAssessment.assessmentId,
    );

    const idempotencyKey = this.optionalString(
      dto.idempotencyKey,
      '训练会话幂等键必须是文本。',
    );
    const candidateSessionId = randomUUID();
    const createData = {
      id: candidateSessionId,
      patientId: dto.patientId,
      createdByUserId: user.id,
      rehabPlanId: dto.rehabPlanId,
      planItemId: dto.planItemId,
      gameContentId: dto.gameContentId,
      collectionBatchId,
      idempotencyKey,
      ...runtimeContext,
      sessionStatus: 'in_progress' as const,
    };

    return this.prisma
      .$transaction(async (tx) => {
        const session = idempotencyKey
          ? await tx.trainingSession.upsert({
              where: {
                patientId_idempotencyKey: {
                  patientId: dto.patientId,
                  idempotencyKey,
                },
              },
              update: {},
              create: createData,
            })
          : await tx.trainingSession.create({ data: createData });
        const created = !idempotencyKey || session.id === candidateSessionId;

        if (idempotencyKey) {
          this.assertImmutableIdempotencyContext(
            '训练会话',
            {
              patientId: session.patientId,
              rehabPlanId: session.rehabPlanId,
              planItemId: session.planItemId,
              gameContentId: session.gameContentId,
              collectionBatchId: session.collectionBatchId,
              idempotencyKey: session.idempotencyKey,
              gameRunId: session.gameRunId,
              deviceCode: session.deviceCode,
              calibrationStatus: session.calibrationStatus,
              clientStartedAt: session.clientStartedAt,
              runtimeConfigSnapshot: session.runtimeConfigSnapshot,
              unityBuildVersion: session.unityBuildVersion,
              bridgeProtocolVersion: session.bridgeProtocolVersion,
            },
            {
              patientId: createData.patientId,
              rehabPlanId: createData.rehabPlanId,
              planItemId: createData.planItemId,
              gameContentId: createData.gameContentId,
              collectionBatchId: createData.collectionBatchId,
              idempotencyKey,
              gameRunId: createData.gameRunId,
              deviceCode: createData.deviceCode ?? null,
              calibrationStatus: createData.calibrationStatus,
              clientStartedAt: createData.clientStartedAt,
              runtimeConfigSnapshot: createData.runtimeConfigSnapshot,
              unityBuildVersion: createData.unityBuildVersion ?? null,
              bridgeProtocolVersion: createData.bridgeProtocolVersion,
            },
          );
        }

        if (created) {
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              actorRole: this.primaryRole(user),
              action: 'training_session.start',
              targetType: 'training_session',
              targetId: session.id,
              result: 'success',
              metadata: {
                patientId: session.patientId,
                rehabPlanId: session.rehabPlanId,
                planItemId: session.planItemId,
                collectionBatchId: session.collectionBatchId,
                gameContentId: session.gameContentId,
                gameRunId: session.gameRunId,
              },
            },
          });
        }
        return session;
      })
      .catch((error: unknown) => {
        if (this.isActiveTrainingSessionConstraintError(error)) {
          throw new ConflictException('该训练项目已有进行中的训练会话。');
        }
        throw error;
      });
  }

  async resumeTrainingSession(user: RequestUser, sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { result: true },
    });
    if (!session) throw new NotFoundException('训练会话不存在');

    await this.assertTrainingWriteAccess(user, session.patientId);
    if (
      !['started', 'in_progress'].includes(session.sessionStatus) ||
      session.result
    ) {
      throw new ConflictException('训练会话当前状态不可恢复。');
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.trainingSession.updateMany({
        where: {
          id: sessionId,
          sessionStatus: { in: ['started', 'in_progress'] },
          result: { is: null },
        },
        data: { sessionStatus: 'in_progress' },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('训练会话状态已变化，无法恢复。');
      }

      const resumed = await tx.trainingSession.findUnique({
        where: { id: sessionId },
      });
      if (!resumed) {
        throw new ConflictException('训练会话状态已变化，无法恢复。');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'training_session.resume',
          targetType: 'training_session',
          targetId: sessionId,
          result: 'success',
          metadata: {
            patientId: session.patientId,
            rehabPlanId: session.rehabPlanId,
            planItemId: session.planItemId,
            gameContentId: session.gameContentId,
          },
        },
      });
      return resumed;
    });
  }

  async abortTrainingSession(
    user: RequestUser,
    sessionId: string,
    dto: AbortTrainingSessionDto | undefined,
  ) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { result: true },
    });
    if (!session) throw new NotFoundException('训练会话不存在');

    await this.assertTrainingWriteAccess(user, session.patientId);
    const abortReason = this.validateCareCircleBody(
      dto?.reason,
      '训练中止原因',
      500,
    );
    if (
      !['started', 'in_progress'].includes(session.sessionStatus) ||
      session.result
    ) {
      throw new ConflictException('训练会话当前状态不可中止。');
    }

    return this.prisma.$transaction(async (tx) => {
      const abortedAt = new Date();
      const claimed = await tx.trainingSession.updateMany({
        where: {
          id: sessionId,
          sessionStatus: { in: ['started', 'in_progress'] },
          result: { is: null },
        },
        data: {
          sessionStatus: 'aborted',
          abortedAt,
          endedAt: abortedAt,
          abortedByUserId: user.id,
          abortReason,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('训练会话状态已变化，无法中止。');
      }

      const aborted = await tx.trainingSession.findUnique({
        where: { id: sessionId },
      });
      if (!aborted) {
        throw new ConflictException('训练会话状态已变化，无法中止。');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'training_session.abort',
          targetType: 'training_session',
          targetId: sessionId,
          result: 'success',
          metadata: {
            patientId: session.patientId,
            rehabPlanId: session.rehabPlanId,
            planItemId: session.planItemId,
            gameContentId: session.gameContentId,
            reasonLength: abortReason.length,
          },
        },
      });
      return aborted;
    });
  }

  async submitTrainingResult(
    user: RequestUser,
    sessionId: string,
    dto: SubmitTrainingResultDto,
  ) {
    const cognitiveDtoSnapshot = structuredClone(dto);
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        result: true,
        gameContent: true,
        collectionBatch: { include: { protocol: true, condition: true } },
      },
    });
    if (!session) throw new NotFoundException('训练会话不存在');

    await this.assertTrainingWriteAccess(user, session.patientId);

    if (session.result) {
      throw new BadRequestException('该训练会话已提交结果，请勿重复回传。');
    }

    const isCognitiveWeb = session.gameContent.runtimeType === 'cognitive_web';
    const isUnityWebgl = session.gameContent.runtimeType === 'unity_webgl';
    const isBrowserPose =
      session.gameContent.runtimeType === 'browser_pose_canvas';
    const submissionDto = isCognitiveWeb ? cognitiveDtoSnapshot : dto;
    const cognitiveDurationSeconds = isCognitiveWeb
      ? this.requiredCognitiveDurationSeconds(submissionDto.durationSeconds)
      : undefined;
    this.validateTrainingResult(submissionDto);
    const submittedMetricsSummary = this.requiredJsonObject(
      submissionDto.metricsSummary,
      '缺少真实训练结果，请完成体感游戏后再回传。',
    );
    const cognitiveInput = isCognitiveWeb
      ? this.canonicalizeCognitiveSubmission(
          submittedMetricsSummary,
          submissionDto.motionMetrics,
        )
      : undefined;
    const metricsSummary = isCognitiveWeb
      ? cognitiveInput!.metricsSummary
      : submittedMetricsSummary;
    const submittedMotionMetrics = isCognitiveWeb
      ? cognitiveInput!.motionMetrics
      : submissionDto.motionMetrics;
    const validationTrainingResult = isCognitiveWeb
      ? {
          ...submissionDto,
          metricsSummary,
          motionMetrics: submittedMotionMetrics,
        }
      : submissionDto;
    const collectionBatchId = this.requiredString(
      session.collectionBatchId,
      '训练会话缺少正式采集批次，不能提交训练结果。',
    );
    if (!session.collectionBatch) {
      throw new BadRequestException('训练会话绑定的采集批次不存在。');
    }
    if (!['ready', 'in_progress'].includes(session.collectionBatch.status)) {
      throw new BadRequestException('训练会话绑定的采集批次状态不可写入结果。');
    }
    await this.assertTrainingRuntimeConsents(
      session.patientId,
      session.gameContent,
      session.collectionBatch.protocol.requiredConsentTypes,
      session.collectionBatch.protocol.requiredInputModes,
    );
    const resultCollectionBatchId = this.requiredString(
      metricsSummary.collectionBatchId,
      '缺少采集批次 ID，请由正式采集流程回传 collectionBatchId。',
    );
    if (resultCollectionBatchId !== collectionBatchId) {
      throw new BadRequestException(
        '训练结果 collectionBatchId 与当前训练会话不一致。',
      );
    }
    const resultSource = this.requiredString(
      metricsSummary.source,
      '缺少训练结果来源，请由体感游戏回传结构化结果。',
    );
    if (/demo|mock/i.test(resultSource)) {
      throw new BadRequestException(
        '训练结果来源不能使用 demo/mock 标记，请接入真实采集结果后再回传。',
      );
    }
    this.assertTrainingResultSourceMatchesRuntime(
      resultSource,
      session.gameContent.runtimeType,
    );
    const gameRunId = this.requiredString(
      metricsSummary.gameRunId,
      '缺少游戏运行批次 ID，请由训练过程回传 gameRunId。',
    );
    if (session.gameRunId !== gameRunId) {
      throw new BadRequestException(
        '训练结果 gameRunId 与当前训练会话不一致。',
      );
    }
    const gameVersion = this.requiredString(
      metricsSummary.gameVersion,
      '缺少游戏版本，请由训练过程回传 gameVersion。',
    );
    const expectedGameVersion =
      session.gameContent.runtimeType === 'unity_webgl'
        ? session.unityBuildVersion
        : session.gameContent.gameVersion;
    if (expectedGameVersion && expectedGameVersion !== gameVersion) {
      throw new BadRequestException('训练结果 gameVersion 与会话版本不一致。');
    }
    const protocolVersion = this.requiredString(
      metricsSummary.protocolVersion,
      '缺少桥接协议版本，请由训练过程回传 protocolVersion。',
    );
    if (session.bridgeProtocolVersion !== protocolVersion) {
      throw new BadRequestException('训练结果桥接协议版本与会话不一致。');
    }
    const clientGeneratedAt = this.parseDate(
      this.requiredString(
        metricsSummary.clientGeneratedAt,
        '缺少客户端结果生成时间。',
      ),
      '客户端结果生成时间无效。',
    );
    const unityWindowStartedAt = isUnityWebgl
      ? this.requiredUnityWebglSessionStartedAt(session.clientStartedAt)
      : undefined;
    const cognitiveWindowStartedAt = isCognitiveWeb
      ? this.requiredCognitiveSessionStartedAt(session.clientStartedAt)
      : undefined;
    const browserPoseWindowStartedAt = isBrowserPose
      ? this.requiredBrowserPoseSessionStartedAt(session.clientStartedAt)
      : undefined;
    const rawPayloadHash = this.requiredString(
      metricsSummary.rawPayloadHash,
      '缺少训练结果 payload 哈希，请由训练过程生成后回传。',
    );
    this.assertDynamicDifficultyEvidence(
      metricsSummary.dynamicDifficultyEvidence,
      {
        resultSource,
        gameRunId,
        gameCode: session.gameContent.code,
        planItemId: session.planItemId,
        sessionStartedAt: session.clientStartedAt,
        resultCompletedAt: clientGeneratedAt,
        runtimeConfigSnapshot: session.runtimeConfigSnapshot,
        metricsSummary,
        difficultyAdjustmentCount: metricsSummary.difficultyAdjustmentCount,
        trainingResult: validationTrainingResult,
      },
    );
    if (!submittedMotionMetrics?.length) {
      throw new BadRequestException(
        '缺少训练结果指标，请完成正式训练后再回传。',
      );
    }
    this.assertCognitiveWebResultMetrics(
      session.gameContent.runtimeType,
      submittedMotionMetrics,
    );
    const parsedMotionMetrics = submittedMotionMetrics.map((metric) => {
      const metricType = this.requiredString(
        metric.metricType,
        '动作指标类型不能为空。',
      );
      this.assertNonPhysiologicalMotionMetricType(metricType);
      const metricValue = this.requiredNumber(
        metric.metricValue,
        '动作指标数值不能为空。',
      );
      const confidence =
        metric.confidence === undefined
          ? undefined
          : this.requiredNumber(metric.confidence, '动作指标置信度无效。');
      if (confidence !== undefined) {
        this.assertRange(
          confidence,
          0,
          1,
          '动作指标置信度必须在 0 到 1 之间。',
        );
      }
      const rawSummary =
        metric.rawSummary === undefined
          ? undefined
          : this.requiredJsonObject(
              metric.rawSummary,
              '动作指标摘要必须是对象。',
            );
      const unit = this.optionalString(metric.unit, '动作指标单位必须是文本。');
      const sampleCount =
        metric.sampleCount === undefined
          ? undefined
          : this.requiredInteger(
              metric.sampleCount,
              '动作指标采样数必须是整数。',
            );
      if (sampleCount !== undefined && sampleCount <= 0) {
        throw new BadRequestException('动作指标采样数必须大于 0。');
      }
      const windowStartedAt = metric.windowStartedAt
        ? this.parseDate(metric.windowStartedAt, '动作指标窗口开始时间无效。')
        : undefined;
      const windowEndedAt = metric.windowEndedAt
        ? this.parseDate(metric.windowEndedAt, '动作指标窗口结束时间无效。')
        : undefined;
      if (
        windowStartedAt &&
        windowEndedAt &&
        windowStartedAt.getTime() > windowEndedAt.getTime()
      ) {
        throw new BadRequestException('动作指标窗口开始时间不能晚于结束时间。');
      }
      if (
        isCognitiveWeb &&
        (windowStartedAt?.getTime() !== cognitiveWindowStartedAt!.getTime() ||
          windowEndedAt?.getTime() !== clientGeneratedAt.getTime())
      ) {
        throw new BadRequestException(
          '认知训练动作指标窗口必须精确绑定训练会话 clientStartedAt 与结果完成时间。',
        );
      }
      const qualityFlag = this.requiredString(
        metric.qualityFlag,
        '动作指标质量标记不能为空。',
      );
      const bodyPart = this.optionalString(
        metric.bodyPart,
        '身体部位必须是文本。',
      );
      const jointName = this.optionalString(
        metric.jointName,
        '关节点名称必须是文本。',
      );
      return {
        metricType,
        metricValue,
        unit,
        confidence,
        sampleCount,
        windowStartedAt,
        windowEndedAt,
        qualityFlag,
        bodyPart,
        jointName,
        rawSummary,
      };
    });
    const unityMetricQualityReasons = this.assertUnityWebglResultMetrics(
      session.gameContent.runtimeType,
      parsedMotionMetrics,
      {
        sessionStartedAt: unityWindowStartedAt,
        resultCompletedAt: clientGeneratedAt,
        runtimeConfigSnapshot: session.runtimeConfigSnapshot,
        protocolSnapshot: session.collectionBatch.protocolSnapshot,
        metricsSummary,
        trainingResult: submissionDto,
      },
    );
    this.assertBrowserPoseResultMetrics(
      session.gameContent.runtimeType,
      parsedMotionMetrics,
      {
        sessionStartedAt: browserPoseWindowStartedAt,
        resultCompletedAt: clientGeneratedAt,
        runtimeConfigSnapshot: session.runtimeConfigSnapshot,
        protocolSnapshot: session.collectionBatch.protocolSnapshot,
        metricsSummary,
        trainingResult: submissionDto,
      },
    );
    const cognitivePersistence = isCognitiveWeb
      ? this.buildCanonicalCognitivePersistence({
          metricsSummary,
          parsedMotionMetrics,
          sessionStartedAt: cognitiveWindowStartedAt,
          resultCompletedAt: clientGeneratedAt,
          collectionBatchId,
          gameRunId,
          gameVersion,
          protocolVersion,
          clientGeneratedAt,
          rawPayloadHash,
          durationSeconds: cognitiveDurationSeconds!,
        })
      : undefined;
    const persistedMetricsSummary = isCognitiveWeb
      ? cognitivePersistence!.metricsSummary
      : metricsSummary;
    const persistedMotionMetrics = isCognitiveWeb
      ? cognitivePersistence!.motionMetrics
      : parsedMotionMetrics;
    const quality = this.evaluateTrainingQuality(
      validationTrainingResult,
      unityMetricQualityReasons,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trainingResult.create({
        data: {
          sessionId,
          collectionBatchId,
          source: resultSource,
          gameRunId,
          gameVersion,
          bridgeProtocolVersion: protocolVersion,
          submittedByUserId: user.id,
          submittedAt: new Date(),
          clientGeneratedAt,
          rawPayloadHash,
          score: isCognitiveWeb
            ? cognitivePersistence!.score
            : submissionDto.score,
          completionRate: isCognitiveWeb
            ? cognitivePersistence!.completionRate
            : submissionDto.completionRate,
          durationSeconds: isCognitiveWeb
            ? cognitiveDurationSeconds!
            : submissionDto.durationSeconds,
          reactionTimeMs: isCognitiveWeb
            ? cognitivePersistence!.reactionTimeMs
            : submissionDto.reactionTimeMs,
          motionAccuracy: isCognitiveWeb
            ? cognitivePersistence!.motionAccuracy
            : submissionDto.motionAccuracy,
          exerciseIntensity: submissionDto.exerciseIntensity,
          abnormalFlag: quality.abnormalFlag,
          qualityFlag: quality.qualityFlag,
          qualityReasons: quality.qualityReasons,
          metricsSummary: persistedMetricsSummary,
        },
      });

      const completed = await tx.trainingSession.updateMany({
        where: {
          id: sessionId,
          sessionStatus: { in: ['started', 'in_progress'] },
        },
        data: {
          sessionStatus: quality.sessionStatus,
          syncStatus: 'synced',
          clientEndedAt: clientGeneratedAt,
          endedAt: new Date(),
          interruptReason: quality.reason,
          uploadAttemptCount: { increment: 1 },
        },
      });
      if (completed.count !== 1) {
        throw new ConflictException('训练会话状态已变化，无法提交结果。');
      }

      await tx.motionMetric.createMany({
        data: persistedMotionMetrics.map((metric) => ({
          trainingSessionId: sessionId,
          collectionBatchId,
          gameRunId,
          source: resultSource,
          metricType: metric.metricType,
          metricValue: metric.metricValue,
          unit: metric.unit,
          confidence: metric.confidence,
          sampleCount: metric.sampleCount,
          windowStartedAt: metric.windowStartedAt,
          windowEndedAt: metric.windowEndedAt,
          qualityFlag: metric.qualityFlag,
          bodyPart: metric.bodyPart,
          jointName: metric.jointName,
          ...(metric.rawSummary ? { rawSummary: metric.rawSummary } : {}),
        })),
      });

      await this.issueTrainingRewardsIfEligible(tx, {
        patientId: session.patientId,
        result: created,
        quality,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'training_result.submit',
          targetType: 'training_session',
          targetId: sessionId,
          result: 'success',
          metadata: {
            ...quality,
            patientId: session.patientId,
            rehabPlanId: session.rehabPlanId,
            planItemId: session.planItemId,
            collectionBatchId,
            gameContentId: session.gameContentId,
            gameRunId,
            trainingResultId: created.id,
          },
        },
      });

      return created;
    });
    return result;
  }

  async listTrainingRecords(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    const sessions = await this.prisma.trainingSession.findMany({
      where: { patientId },
      orderBy: { startedAt: 'desc' },
      include: {
        result: { select: trainingResultEnvelopeSelect },
        gameContent: true,
        motionMetrics: true,
      },
    });

    const responseSessions = sessions.map((session) =>
      this.isPatientOwnedRecordView(user, patientId)
        ? this.serializeTrainingSessionForPatientProgress(session)
        : {
            ...session,
            result: session.result
              ? this.trainingResultResponse(session.result)
              : null,
          },
    );

    const completedResults = responseSessions
      .filter(
        (session) =>
          session.sessionStatus === 'completed' && Boolean(session.result),
      )
      .map((session) => session.result)
      .filter((result): result is NonNullable<typeof result> =>
        Boolean(result),
      );
    const validResults = completedResults.filter(
      (result) => result.qualityFlag === 'valid' && !result.abnormalFlag,
    );

    return {
      sessions: responseSessions,
      summary: {
        totalSessions: responseSessions.length,
        completedSessions: responseSessions.filter((session) =>
          this.hasCompletedTrainingResult(session),
        ).length,
        averageScore: validResults.length
          ? Math.round(
              validResults.reduce((sum, result) => sum + result.score, 0) /
                validResults.length,
            )
          : 0,
        abnormalCount: completedResults.filter(
          (result) => result.abnormalFlag || result.qualityFlag !== 'valid',
        ).length,
      },
    };
  }

  async listPatientRewards(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'summary');
    if (this.hasRole(user, 'caregiver')) {
      const caregiverRelation = await this.findActiveCaregiverAuthorization(
        user.id,
        patientId,
      );
      if (!caregiverRelation) {
        throw new ForbiddenException('缺少有效家属共享授权。');
      }
      const caregiverScope = this.validateCaregiverScope(
        caregiverRelation.scope,
      );
      if (!caregiverScope.progress) {
        await this.audit(
          user.id,
          this.primaryRole(user),
          'access.denied',
          'patient_profile',
          patientId,
          'denied',
          { reason: 'caregiver_progress_scope_required' },
        );
        throw new ForbiddenException('家属授权未开放训练进展查看。');
      }
    }

    const [ledger, achievements] = await Promise.all([
      this.prisma.rewardLedger.findMany({
        where: {
          patientId,
          status: 'issued',
        },
        orderBy: { issuedAt: 'desc' },
        take: 20,
        include: {
          rule: { select: { code: true, name: true } },
          trainingResult: {
            select: {
              id: true,
              score: true,
              qualityFlag: true,
              abnormalFlag: true,
            },
          },
        },
      }),
      this.prisma.achievement.findMany({
        where: { patientId },
        orderBy: [{ unlockedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    await this.audit(
      user.id,
      this.primaryRole(user),
      'reward.summary.view',
      'patient_profile',
      patientId,
      'success',
      {
        ledgerCount: ledger.length,
        achievementCount: achievements.length,
      },
    );

    return {
      totalPoints: ledger.reduce((sum, item) => sum + item.points, 0),
      ledger: ledger.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        points: item.points,
        status: item.status,
        issuedAt: item.issuedAt,
        rule: item.rule,
        trainingResult: item.trainingResult,
      })),
      achievements: achievements.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        level: item.level,
        progress: item.progress,
        target: item.target,
        unlockedAt: item.unlockedAt,
      })),
    };
  }

  async reviewTrainingResult(
    user: RequestUser,
    resultId: string,
    dto: ReviewTrainingResultDto,
  ) {
    const reviewConclusion = this.validateTrainingReviewConclusion(
      dto.reviewConclusion,
    );
    const reviewNote = this.requiredString(
      dto.reviewNote,
      '训练复核说明不能为空。',
    );

    const result = await this.prisma.trainingResult.findUnique({
      where: { id: resultId },
      select: trainingResultReviewAccessSelect,
    });
    if (!result) throw new NotFoundException('训练结果不存在');
    await this.assertTrainingReviewAccess(user, result.session.patient);
    this.trainingResultResponse(result);
    this.assertTrainingResultRequiresReview(result);
    this.assertTrainingResultNotReviewed(result);

    const reviewedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const reviewEnvelope = this.encryptSensitiveJsonField(
        { reviewNote },
        {
          tableName: 'training_result',
          recordId: result.id,
          fieldName: 'reviewEnvelope',
        },
      );
      const claimed = await tx.trainingResult.updateMany({
        where: {
          id: resultId,
          sessionId: result.sessionId,
          reviewStatus: null,
          reviewConclusion: null,
          reviewedByUserId: null,
          reviewedAt: null,
        },
        data: {
          reviewStatus: 'reviewed',
          reviewConclusion,
          reviewEnvelope,
          reviewedByUserId: user.id,
          reviewedAt,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('训练结果复核状态已变化。');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'training_result.review',
          targetType: 'training_result',
          targetId: resultId,
          result: 'success',
          metadata: {
            patientId: result.session.patientId,
            sessionId: result.sessionId,
            reviewConclusion,
          },
        },
      });
      const reviewed = await tx.trainingResult.findUnique({
        where: { id: resultId },
        select: trainingResultEnvelopeSelect,
      });
      if (!reviewed) {
        throw new ConflictException('训练结果复核状态已变化。');
      }
      return this.trainingResultResponse(reviewed);
    });
  }

  async caregiverSummary(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'summary');
    const caregiverRelation = await this.findActiveCaregiverAuthorization(
      user.id,
      patientId,
    );
    if (!caregiverRelation) {
      throw new ForbiddenException('缺少有效家属共享授权。');
    }
    const caregiverScope = this.validateCaregiverScope(caregiverRelation.scope);

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        identityEnvelope: true,
        riskGrades: {
          where: { isCurrent: true },
          take: 1,
          select: { riskLevel: true },
        },
        rehabPlans: {
          where: { isCurrent: true },
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              orderBy: { sequence: 'asc' },
              include: { gameContent: true },
            },
          },
          take: 1,
        },
        trainingSessions: {
          orderBy: { startedAt: 'desc' },
          take: caregiverScope.progress ? 7 : 0,
          include: {
            result: {
              select: {
                score: true,
                completionRate: true,
                durationSeconds: true,
                reactionTimeMs: true,
                motionAccuracy: true,
                exerciseIntensity: true,
                abnormalFlag: true,
                createdAt: true,
              },
            },
            gameContent: true,
          },
        },
      },
    });

    if (!patient) throw new NotFoundException('患者不存在');
    const patientIdentity = this.decryptPatientIdentity(
      patient.id,
      patient.identityEnvelope,
    );
    const currentRisk = patient.riskGrades[0]?.riskLevel;

    await this.audit(
      user.id,
      'caregiver',
      'caregiver.summary.view',
      'patient_profile',
      patientId,
      'success',
    );

    return {
      patient: {
        id: patient.id,
        name: this.maskName(patientIdentity.name),
        age: patientIdentity.age,
      },
      currentRisk: currentRisk ?? null,
      currentPlan: patient.rehabPlans[0]
        ? this.serializeRehabPlanForCaregiverProgress(patient.rehabPlans[0])
        : undefined,
      recentTraining: caregiverScope.progress
        ? patient.trainingSessions.map((session) => ({
            sessionStatus: session.sessionStatus,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            gameContent: this.serializeGameContentForProgress(
              session.gameContent,
            ),
            result: session.result
              ? {
                  score: session.result.score,
                  completionRate: session.result.completionRate,
                  durationSeconds: session.result.durationSeconds,
                  reactionTimeMs: session.result.reactionTimeMs,
                  motionAccuracy: session.result.motionAccuracy,
                  exerciseIntensity: session.result.exerciseIntensity,
                  abnormalFlag: session.result.abnormalFlag,
                  createdAt: session.result.createdAt,
                }
              : null,
          }))
        : [],
      permissions: {
        rawAssessment: caregiverScope.rawAssessment,
        planEdit: caregiverScope.planEdit,
        fullMedicalRecord: false,
      },
    };
  }

  private isPatientOwnedRecordView(user: RequestUser, patientId: string) {
    return (
      !this.hasAnyAdminRole(user) &&
      !this.hasRole(user, 'doctor') &&
      user.roles.some(
        (role) =>
          role.roleCode === 'patient' && role.relatedObjectId === patientId,
      )
    );
  }

  private serializeGameContentForProgress(gameContent: {
    id: string;
    name: string;
    trainingTargets?: unknown;
    tags?: unknown;
    defaultDuration?: number;
    defaultDifficulty?: string;
  }) {
    return {
      id: gameContent.id,
      name: gameContent.name,
      trainingTargets: Array.isArray(gameContent.trainingTargets)
        ? gameContent.trainingTargets
        : [],
      tags: Array.isArray(gameContent.tags) ? gameContent.tags : [],
      defaultDuration: gameContent.defaultDuration,
      defaultDifficulty: gameContent.defaultDifficulty,
    };
  }

  private serializeGameContentForPatientTraining(
    gameContent: PatientTrainingGameContent,
  ) {
    return {
      id: gameContent.id,
      code: gameContent.code,
      name: gameContent.name,
      trainingTargets: gameContent.trainingTargets,
      tags: gameContent.tags,
      defaultDuration: gameContent.defaultDuration,
      defaultDifficulty: gameContent.defaultDifficulty,
      runtimeType: gameContent.runtimeType,
      manifestUrl: gameContent.manifestUrl,
      buildBaseUrl: gameContent.buildBaseUrl,
      gameVersion: gameContent.gameVersion,
      bridgeProtocolVersion: gameContent.bridgeProtocolVersion,
      buildStatus: gameContent.buildStatus,
      releaseChannel: gameContent.releaseChannel,
      supportsCamera: gameContent.supportsCamera,
      supportsMicrophone: gameContent.supportsMicrophone,
      supportedInputModes: gameContent.supportedInputModes,
      requiredMetrics: gameContent.requiredMetrics,
      difficultyPolicy: gameContent.difficultyPolicy,
      dynamicDifficultyTriggers: gameContent.dynamicDifficultyTriggers,
      requiredPermissions: gameContent.requiredPermissions,
      resultSchema: gameContent.resultSchema,
      publishedStatus: gameContent.publishedStatus,
      status: gameContent.status,
    };
  }

  private serializeTrainingResultForProgress(
    result: TrainingResultEnvelopeRecord | null,
  ) {
    if (!result) return null;
    const reviewedResult = this.trainingResultResponse(result);
    return {
      id: reviewedResult.id,
      score: reviewedResult.score,
      completionRate: reviewedResult.completionRate,
      durationSeconds: reviewedResult.durationSeconds,
      reactionTimeMs: reviewedResult.reactionTimeMs,
      motionAccuracy: reviewedResult.motionAccuracy,
      exerciseIntensity: reviewedResult.exerciseIntensity,
      abnormalFlag: reviewedResult.abnormalFlag,
      qualityFlag: reviewedResult.qualityFlag,
      reviewStatus: reviewedResult.reviewStatus,
      reviewConclusion: reviewedResult.reviewConclusion,
      reviewNote: reviewedResult.reviewNote,
      reviewedAt: reviewedResult.reviewedAt,
      createdAt: reviewedResult.createdAt,
    };
  }

  private trainingResultResponse<
    T extends {
      id: string;
      reviewStatus: string | null;
      reviewConclusion: string | null;
      reviewEnvelope: unknown;
      reviewedByUserId: string | null;
      reviewedAt: Date | null;
    },
  >(result: T) {
    const { reviewEnvelope, ...safeResult } = result;
    const isUnreviewed =
      result.reviewStatus === null &&
      result.reviewConclusion === null &&
      result.reviewedByUserId === null &&
      result.reviewedAt === null;
    if (isUnreviewed) {
      if (reviewEnvelope !== null) {
        throw new Error('训练复核状态与加密载荷不一致。');
      }
      return { ...safeResult, reviewNote: null };
    }
    if (
      result.reviewStatus !== 'reviewed' ||
      typeof result.reviewConclusion !== 'string' ||
      !trainingReviewConclusions.includes(
        result.reviewConclusion as TrainingReviewConclusion,
      ) ||
      typeof result.reviewedByUserId !== 'string' ||
      result.reviewedByUserId.trim().length === 0 ||
      !(result.reviewedAt instanceof Date) ||
      reviewEnvelope === null
    ) {
      throw new Error('训练复核状态与加密载荷不一致。');
    }
    return {
      ...safeResult,
      ...this.decryptTrainingReview(result.id, reviewEnvelope),
    };
  }

  private decryptTrainingReview(recordId: string, envelope: unknown) {
    const payload = decryptSensitiveJson<unknown>(
      envelope,
      {
        tableName: 'training_result',
        recordId,
        fieldName: 'reviewEnvelope',
      },
      this.sensitiveEncryptionKey,
    );
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(payload, 'reviewNote')
    ) {
      throw new Error('训练复核加密载荷格式无效。');
    }
    const reviewNote = (payload as Record<string, unknown>).reviewNote;
    if (typeof reviewNote !== 'string' || reviewNote.trim().length === 0) {
      throw new Error('训练复核加密载荷格式无效。');
    }
    return { reviewNote };
  }

  private serializeTrainingSessionForPatientProgress(session: {
    id: string;
    patientId: string;
    rehabPlanId: string;
    planItemId: string;
    gameContentId: string;
    collectionBatchId: string | null;
    gameRunId: string | null;
    clientStartedAt: Date | null;
    deviceCode?: string | null;
    calibrationStatus: string;
    runtimeConfigSnapshot: unknown;
    unityBuildVersion?: string | null;
    bridgeProtocolVersion: string | null;
    sessionStatus: TrainingSessionStatus;
    startedAt: Date;
    endedAt?: Date | null;
    interruptReason?: string | null;
    syncStatus: string;
    result?: TrainingResultEnvelopeRecord | null;
    gameContent: {
      id: string;
      name: string;
      trainingTargets?: unknown;
      tags?: unknown;
      defaultDuration?: number;
      defaultDifficulty?: string;
    };
  }) {
    return {
      id: session.id,
      planItemId: session.planItemId,
      calibrationStatus: session.calibrationStatus,
      sessionStatus: session.sessionStatus,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      interruptReason: session.interruptReason,
      syncStatus: session.syncStatus,
      gameContent: this.serializeGameContentForProgress(session.gameContent),
      result: this.serializeTrainingResultForProgress(session.result ?? null),
      ...((session.sessionStatus === 'started' ||
        session.sessionStatus === 'in_progress') &&
      session.result === null
        ? {
            recoveryContext: {
              patientId: session.patientId,
              rehabPlanId: session.rehabPlanId,
              planItemId: session.planItemId,
              gameContentId: session.gameContentId,
              collectionBatchId: session.collectionBatchId,
              gameRunId: session.gameRunId,
              clientStartedAt: session.clientStartedAt,
              deviceCode: session.deviceCode,
              calibrationStatus: session.calibrationStatus,
              runtimeConfigSnapshot: session.runtimeConfigSnapshot,
              unityBuildVersion: session.unityBuildVersion,
              bridgeProtocolVersion: session.bridgeProtocolVersion,
              startedAt: session.startedAt,
            },
          }
        : {}),
    };
  }

  private serializeRehabPlanForPatientProgress(plan: {
    id: string;
    patientId: string;
    planName: string;
    status: string;
    isCurrent: boolean;
    weekFrequency: number;
    dailyDuration: number;
    recommendationReason: string;
    confirmedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    items: Array<{
      id: string;
      rehabPlanId: string;
      gameContentId: string;
      sequence: number;
      durationMinutes: number;
      frequencyPerWeek: number;
      difficulty: string;
      gameContent: PatientTrainingGameContent;
    }>;
  }) {
    return {
      id: plan.id,
      patientId: plan.patientId,
      planName: plan.planName,
      status: plan.status,
      isCurrent: plan.isCurrent,
      weekFrequency: plan.weekFrequency,
      dailyDuration: plan.dailyDuration,
      recommendationReason: plan.recommendationReason,
      confirmedAt: plan.confirmedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      items: plan.items.map((item) => ({
        id: item.id,
        rehabPlanId: item.rehabPlanId,
        gameContentId: item.gameContentId,
        sequence: item.sequence,
        durationMinutes: item.durationMinutes,
        frequencyPerWeek: item.frequencyPerWeek,
        difficulty: item.difficulty,
        gameContent: this.serializeGameContentForPatientTraining(
          item.gameContent,
        ),
      })),
    };
  }

  private serializeCollectionBatchForPatientProgress(batch: {
    id: string;
    patientId: string;
    rehabPlanId: string;
    planItemId: string;
    gameContentId: string;
    protocolId: string;
    conditionId: string;
    protocolVersion: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    protocol?: {
      id: string;
      gameContentId: string | null;
      runtimeType: string;
      status: string;
    } | null;
    gameContent?: {
      id: string;
      name: string;
      trainingTargets?: unknown;
      tags?: unknown;
      defaultDuration?: number;
      defaultDifficulty?: string;
    } | null;
  }) {
    return {
      id: batch.id,
      patientId: batch.patientId,
      rehabPlanId: batch.rehabPlanId,
      planItemId: batch.planItemId,
      gameContentId: batch.gameContentId,
      protocolId: batch.protocolId,
      conditionId: batch.conditionId,
      protocolVersion: batch.protocolVersion,
      status: batch.status,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      ...(batch.protocol
        ? {
            protocol: {
              id: batch.protocol.id,
              gameContentId: batch.protocol.gameContentId,
              runtimeType: batch.protocol.runtimeType,
              status: batch.protocol.status,
            },
          }
        : {}),
      ...(batch.gameContent
        ? {
            gameContent: this.serializeGameContentForProgress(
              batch.gameContent,
            ),
          }
        : {}),
    };
  }

  private serializeRehabPlanForCaregiverProgress(plan: {
    id: string;
    planName: string;
    status: string;
    isCurrent: boolean;
    weekFrequency: number;
    dailyDuration: number;
    items: Array<{
      id: string;
      sequence: number;
      durationMinutes: number;
      frequencyPerWeek: number;
      difficulty: string;
      gameContent: {
        id: string;
        name: string;
        trainingTargets?: unknown;
        tags?: unknown;
        defaultDuration?: number;
        defaultDifficulty?: string;
      };
    }>;
  }) {
    return {
      id: plan.id,
      planName: plan.planName,
      status: plan.status,
      isCurrent: plan.isCurrent,
      weekFrequency: plan.weekFrequency,
      dailyDuration: plan.dailyDuration,
      items: plan.items.map((item) => ({
        sequence: item.sequence,
        durationMinutes: item.durationMinutes,
        frequencyPerWeek: item.frequencyPerWeek,
        difficulty: item.difficulty,
        gameContent: this.serializeGameContentForProgress(item.gameContent),
      })),
    };
  }

  async auditLogs(user: RequestUser, query: AuditLogQueryDto = {}) {
    this.requireAdminPermission(user, 'audit.read');
    const where = this.buildAuditLogWhere(query);
    const take = this.resolveAuditLogTake(query.take ?? query.limit);
    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: {
          select: { id: true, account: true, identityEnvelope: true },
        },
      },
    });
    return logs.map((log) => this.auditLogActorResponse(log));
  }

  async exportDataset(
    user: RequestUser,
    datasetParam: string,
    query: ExportDatasetQueryDto = {},
  ) {
    const actorRole = this.primaryRole(user);
    const requestedDataset = this.safeExportTargetId(datasetParam);
    const reasonHash = this.exportReasonHash(query.reason);

    if (!this.hasAdminPermission(user, 'data.export')) {
      await this.audit(
        user.id,
        actorRole,
        'data.export',
        'data_export',
        requestedDataset,
        'denied',
        {
          requestedDatasetKnown: requestedDataset !== 'invalid_dataset',
          reasonHash,
          stage: 'authorization',
          desensitized: true,
        },
      );
      throw new ForbiddenException('角色权限不足');
    }

    let dataset: ExportDataset | undefined;
    let format: ExportFormat | undefined;
    let filters: ExportFilters | undefined;
    let stage: 'validation' | 'query' = 'validation';
    let payload: ExportPayload;
    let authorizationDenied = false;

    try {
      dataset = this.validateExportDataset(datasetParam);
      format = this.resolveExportFormat(query.format);
      filters = this.resolveExportFilters(query);
      if (
        dataset === 'audit-logs' &&
        !this.hasAdminPermission(user, 'audit.read')
      ) {
        authorizationDenied = true;
        await this.audit(
          user.id,
          actorRole,
          'data.export',
          'data_export',
          dataset,
          'denied',
          {
            requestedDatasetKnown: true,
            format,
            filters: this.exportAuditFilters(filters),
            reasonHash,
            stage: 'authorization',
            desensitized: true,
          },
        );
        throw new ForbiddenException('角色权限不足');
      }
      if (
        filters.riskLevel !== undefined ||
        filters.qualityFlag !== undefined
      ) {
        authorizationDenied = true;
        await this.audit(
          user.id,
          actorRole,
          'data.export',
          'data_export',
          dataset,
          'denied',
          {
            requestedDatasetKnown: true,
            format,
            filters: this.exportAuditFilters(filters),
            reasonHash,
            stage: 'authorization',
            desensitized: true,
          },
        );
        throw new ForbiddenException(
          '后台导出不提供患者级临床正文或精确指标。',
        );
      }
      stage = 'query';
      payload = await this.buildExportPayload(dataset, format, filters);
    } catch (error) {
      if (error instanceof ForbiddenException && authorizationDenied) {
        throw error;
      }
      await this.audit(
        user.id,
        actorRole,
        'data.export',
        'data_export',
        dataset ?? requestedDataset,
        'failed',
        {
          requestedDatasetKnown: requestedDataset !== 'invalid_dataset',
          format: format ?? null,
          filters: filters ? this.exportAuditFilters(filters) : null,
          reasonHash,
          stage,
          errorType: this.safeErrorType(error),
          desensitized: true,
        },
      );
      throw error;
    }

    await this.audit(
      user.id,
      actorRole,
      'data.export',
      'data_export',
      dataset,
      'success',
      {
        format,
        filters: this.exportAuditFilters(filters),
        rowCount: payload.rowCount,
        columns: payload.columns,
        desensitized: true,
        reasonProvided: true,
        reasonLength: filters.reason.length,
        reasonHash,
      },
    );

    if (format === 'csv') {
      return {
        format,
        filename: this.exportFilename(dataset),
        content: this.toCsv(payload.columns, payload.rows),
        payload,
      };
    }

    return {
      format,
      filename: this.exportFilename(dataset, 'json'),
      content: JSON.stringify(payload),
      payload,
    };
  }

  async dashboard(user: RequestUser) {
    if (this.hasAnyAdminRole(user)) {
      this.requireAdminPermission(user, 'dashboard.view');
    } else {
      this.requireAnyRole(user, ['doctor']);
    }
    const isAdmin = this.hasAnyAdminRole(user);
    const canReadAudit = this.hasAdminPermission(user, 'audit.read');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const doctorIds = user.roles
      .filter((role) => role.roleCode === 'doctor')
      .map((role) => role.relatedObjectId);
    const patientWhere: Prisma.PatientProfileWhereInput = isAdmin
      ? {}
      : { responsibleDoctorId: { in: doctorIds } };
    const relatedPatients = await this.prisma.patientProfile.findMany({
      where: patientWhere,
      select: { id: true, userId: true },
    });
    const patientIds = relatedPatients.map((patient) => patient.id);
    const patientUserIds = relatedPatients.map((patient) => patient.userId);
    const scopedPatientFilter: Prisma.AssessmentRecordWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedPlanFilter: Prisma.RehabPlanWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedSessionFilter: Prisma.TrainingSessionWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedConsentFilter: Prisma.ConsentRecordWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedRiskFilter: Prisma.RiskGradeRecordWhereInput = isAdmin
      ? { isCurrent: true }
      : { patientId: { in: patientIds }, isCurrent: true };
    const scopedTrainingResultFilter: Prisma.TrainingResultWhereInput = isAdmin
      ? {}
      : { session: { patientId: { in: patientIds } } };
    const scopedValidTrainingResultFilter: Prisma.TrainingResultWhereInput = {
      ...scopedTrainingResultFilter,
      qualityFlag: 'valid',
      abnormalFlag: false,
    };

    const [assessmentIds, planIds, sessionRecords, consentIds] = isAdmin
      ? [[], [], [], []]
      : await Promise.all([
          this.prisma.assessmentRecord
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true },
            })
            .then((records) => records.map((record) => record.id)),
          this.prisma.rehabPlan
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true },
            })
            .then((records) => records.map((record) => record.id)),
          this.prisma.trainingSession
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true, deviceId: true },
            })
            .then((records) => records),
          this.prisma.consentRecord
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true },
            })
            .then((records) => records.map((record) => record.id)),
        ]);
    const sessionIds = sessionRecords.map((record) => record.id);
    const scopedDeviceIds = Array.from(
      new Set(
        sessionRecords
          .map((record) => record.deviceId)
          .filter((deviceId): deviceId is string => Boolean(deviceId)),
      ),
    );
    const scopedDeviceFilter: Prisma.DeviceRegistryWhereInput = isAdmin
      ? {}
      : { id: { in: scopedDeviceIds } };
    const auditWhere: Prisma.AuditLogWhereInput = isAdmin
      ? {}
      : {
          OR: [
            { actorUserId: user.id },
            { targetType: 'patient_profile', targetId: { in: patientIds } },
            {
              targetType: 'assessment_record',
              targetId: { in: assessmentIds },
            },
            { targetType: 'rehab_plan', targetId: { in: planIds } },
            {
              targetType: 'training_session',
              targetId: { in: sessionIds },
            },
            { targetType: 'consent_record', targetId: { in: consentIds } },
          ],
        };
    const userWhere: Prisma.UserWhereInput = isAdmin
      ? {}
      : {
          OR: [
            { id: { in: patientUserIds } },
            {
              roleBindings: {
                some: {
                  roleCode: 'doctor',
                  relatedObjectId: { in: doctorIds },
                },
              },
            },
            {
              caregiverRelations: {
                some: {
                  patientId: { in: patientIds },
                  authorizationStatus: 'active',
                  revokedAt: null,
                },
              },
            },
          ],
        };

    const [
      users,
      activeUsers,
      patients,
      doctors,
      caregiverRelations,
      assessments,
      todayAssessments,
      trainings,
      todayTrainings,
      completedTrainings,
      activePlans,
      pendingPlans,
      consentRecords,
      deviceTotal,
      deviceOnline,
      abnormalResults,
      deniedAudits,
      failedAudits,
      qualityAggregate,
      riskRows,
      planStatusRows,
      sessionStatusRows,
      consentStatusRows,
      consentTypeRows,
      deviceStatusRows,
      qualityFlagRows,
      auditResultRows,
      recentActionRows,
      auditLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({
        where: { ...userWhere, accountStatus: 'active' },
      }),
      this.prisma.patientProfile.count({ where: patientWhere }),
      isAdmin
        ? this.prisma.doctorProfile.count()
        : Promise.resolve(doctorIds.length),
      this.prisma.caregiverRelation.count({
        where: isAdmin
          ? { authorizationStatus: 'active', revokedAt: null }
          : {
              patientId: { in: patientIds },
              authorizationStatus: 'active',
              revokedAt: null,
            },
      }),
      this.prisma.assessmentRecord.count({ where: scopedPatientFilter }),
      this.prisma.assessmentRecord.count({
        where: { ...scopedPatientFilter, createdAt: { gte: todayStart } },
      }),
      this.prisma.trainingSession.count({ where: scopedSessionFilter }),
      this.prisma.trainingSession.count({
        where: { ...scopedSessionFilter, startedAt: { gte: todayStart } },
      }),
      this.prisma.trainingSession.count({
        where: { ...scopedSessionFilter, sessionStatus: 'completed' },
      }),
      this.prisma.rehabPlan.count({
        where: { ...scopedPlanFilter, status: 'active', isCurrent: true },
      }),
      this.prisma.rehabPlan.count({
        where: { ...scopedPlanFilter, status: 'pending_confirm' },
      }),
      this.prisma.consentRecord.count({ where: scopedConsentFilter }),
      this.prisma.deviceRegistry.count({ where: scopedDeviceFilter }),
      this.prisma.deviceRegistry.count({
        where: { ...scopedDeviceFilter, status: 'online' },
      }),
      this.prisma.trainingResult.count({
        where: { ...scopedTrainingResultFilter, abnormalFlag: true },
      }),
      canReadAudit
        ? this.prisma.auditLog.count({
            where: { ...auditWhere, result: 'denied' },
          })
        : Promise.resolve(undefined),
      canReadAudit
        ? this.prisma.auditLog.count({
            where: { ...auditWhere, result: 'failed' },
          })
        : Promise.resolve(undefined),
      this.prisma.trainingResult.aggregate({
        where: scopedValidTrainingResultFilter,
        _avg: {
          score: true,
          completionRate: true,
          durationSeconds: true,
          motionAccuracy: true,
          reactionTimeMs: true,
        },
      }),
      this.prisma.riskGradeRecord.groupBy({
        by: ['riskLevel'],
        where: scopedRiskFilter,
        _count: { _all: true },
      }),
      this.prisma.rehabPlan.groupBy({
        by: ['status'],
        where: scopedPlanFilter,
        _count: { _all: true },
      }),
      this.prisma.trainingSession.groupBy({
        by: ['sessionStatus'],
        where: scopedSessionFilter,
        _count: { _all: true },
      }),
      this.prisma.consentRecord.groupBy({
        by: ['status'],
        where: scopedConsentFilter,
        _count: { _all: true },
      }),
      this.prisma.consentRecord.groupBy({
        by: ['consentType', 'status'],
        where: scopedConsentFilter,
        _count: { _all: true },
      }),
      this.prisma.deviceRegistry.groupBy({
        by: ['status'],
        where: scopedDeviceFilter,
        _count: { _all: true },
      }),
      this.prisma.trainingResult.groupBy({
        by: ['qualityFlag'],
        where: scopedTrainingResultFilter,
        _count: { _all: true },
      }),
      canReadAudit
        ? this.prisma.auditLog.groupBy({
            by: ['result'],
            where: auditWhere,
            _count: { _all: true },
          })
        : Promise.resolve(undefined),
      canReadAudit
        ? this.prisma.auditLog.groupBy({
            by: ['action'],
            where: auditWhere,
            _count: { _all: true },
          })
        : Promise.resolve(undefined),
      canReadAudit
        ? this.prisma.auditLog.findMany({
            where: auditWhere,
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
              actor: {
                select: { id: true, account: true, identityEnvelope: true },
              },
            },
          })
        : Promise.resolve(undefined),
    ]);
    const onlineRate = deviceTotal
      ? `${Math.round((deviceOnline / deviceTotal) * 100)}%`
      : '0%';
    const toCountRows = <T extends Record<string, unknown>, K extends keyof T>(
      rows: Array<T & { _count: { _all: number } }>,
      key: K,
    ) =>
      rows.map((row) => ({
        key: String(row[key]),
        count: row._count._all,
      }));

    return {
      scope: {
        role: isAdmin ? (this.primaryRole(user) ?? 'admin') : 'doctor',
        doctorIds,
        patientIds: isAdmin ? [] : patientIds,
        permissions: { auditRead: canReadAudit },
      },
      metrics: {
        users,
        patients,
        doctors,
        assessments,
        trainings,
        activePlans,
        pendingPlans,
        abnormalResults,
        onlineRate,
      },
      overview: {
        activeUsers,
        caregiverRelations,
        completedTrainings,
        todayAssessments,
        todayTrainings,
        consentRecords,
        ...(canReadAudit ? { deniedAudits, failedAudits } : {}),
      },
      distributions: {
        riskLevels: toCountRows(riskRows, 'riskLevel'),
        planStatuses: toCountRows(planStatusRows, 'status'),
        sessionStatuses: toCountRows(sessionStatusRows, 'sessionStatus'),
        consentStatuses: toCountRows(consentStatusRows, 'status'),
        deviceStatuses: toCountRows(deviceStatusRows, 'status'),
        qualityFlags: toCountRows(qualityFlagRows, 'qualityFlag'),
        ...(canReadAudit
          ? { auditResults: toCountRows(auditResultRows!, 'result') }
          : {}),
      },
      quality: {
        averageScore:
          qualityAggregate._avg.score === null
            ? null
            : Math.round(qualityAggregate._avg.score),
        averageCompletionRate: qualityAggregate._avg.completionRate,
        averageDurationSeconds:
          qualityAggregate._avg.durationSeconds === null
            ? null
            : Math.round(qualityAggregate._avg.durationSeconds),
        averageMotionAccuracy: qualityAggregate._avg.motionAccuracy,
        averageReactionTimeMs:
          qualityAggregate._avg.reactionTimeMs === null
            ? null
            : Math.round(qualityAggregate._avg.reactionTimeMs),
      },
      devices: {
        total: deviceTotal,
        online: deviceOnline,
        offline: Math.max(deviceTotal - deviceOnline, 0),
        onlineRate,
      },
      consents: {
        total: consentRecords,
        byType: consentTypeRows.map((row) => ({
          consentType: row.consentType,
          status: row.status,
          count: row._count._all,
        })),
      },
      ...(canReadAudit
        ? {
            recentActions: recentActionRows!
              .map((row) => ({
                action: row.action,
                count: row._count._all,
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 8),
            auditLogs: auditLogs!.map((log) => this.auditLogActorResponse(log)),
          }
        : {}),
    };
  }

  async listGameContents(user: RequestUser) {
    if (!this.hasAnyAdminRole(user)) {
      throw new ForbiddenException('仅后台账号可查看游戏内容配置。');
    }
    this.requireAdminPermission(user, 'dashboard.view');
    return this.prisma.gameContent.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createGameContent(user: RequestUser, dto: CreateGameContentDto) {
    this.requireAdminPermission(user, 'game.manage');

    const code = this.validateGameCode(dto.code);
    const name = this.requiredString(dto.name, '游戏名称不能为空。');
    const runtimeType = this.validateFormalRuntimeType(dto.runtimeType);
    const trainingTargets = this.validateStringArray(
      dto.trainingTargets,
      'trainingTargets 必须是非空字符串数组。',
    );
    const tags = this.validateStringArray(
      dto.tags,
      'tags 必须是非空字符串数组。',
    );
    const defaultDuration = this.requiredInteger(
      dto.defaultDuration,
      '默认训练时长必须是整数分钟。',
    );
    this.assertRange(
      defaultDuration,
      1,
      180,
      '默认训练时长必须在 1 到 180 分钟之间。',
    );
    const defaultDifficulty = this.requiredString(
      dto.defaultDifficulty,
      '默认难度不能为空。',
    );
    const supportsCamera = this.requiredBoolean(
      dto.supportsCamera,
      'supportsCamera 必须是布尔值。',
    );
    const supportsMicrophone = this.requiredBoolean(
      dto.supportsMicrophone,
      'supportsMicrophone 必须是布尔值。',
    );
    const supportedInputModes = this.validateStringArray(
      dto.supportedInputModes,
      'supportedInputModes 必须是非空字符串数组。',
    );
    const requiredMetrics = this.validateRequiredMetrics(dto.requiredMetrics);

    if (supportsCamera && !supportedInputModes.includes('camera_pose')) {
      throw new BadRequestException(
        '启用摄像头采集的游戏必须包含 camera_pose 输入模式。',
      );
    }
    const isInlinePublishedRuntime =
      runtimeType === 'browser_pose_canvas' || runtimeType === 'cognitive_web';
    const inlinePublishedGameVersion = isInlinePublishedRuntime
      ? this.validateGameVersion(
          this.requiredString(
            dto.gameVersion,
            '平台内置训练内容必须填写 gameVersion。',
          ),
        )
      : null;
    let formalMetadata:
      | {
          difficultyPolicy: Prisma.InputJsonValue;
          dynamicDifficultyTriggers: string[];
          requiredPermissions: string[];
          resultSchema: Prisma.InputJsonValue;
          publishedStatus: string;
        }
      | undefined;
    if (runtimeType === 'browser_pose_canvas') {
      this.requireAdminPermission(user, 'game.publish');
      this.assertBrowserPoseCreateCanBeReleased({
        name,
        supportsCamera,
        supportedInputModes,
        requiredMetrics,
      });
      formalMetadata = this.validateGameContentPublishMetadata(dto, [
        'camera_capture',
      ]);
    }
    if (runtimeType === 'cognitive_web') {
      this.requireAdminPermission(user, 'game.publish');
      this.assertCognitiveWebCreateCanBeReleased({
        name,
        supportsCamera,
        supportedInputModes,
        requiredMetrics,
      });
      formalMetadata = this.validateGameContentPublishMetadata(dto, []);
    }
    if (runtimeType === 'unity_webgl') {
      this.assertUnityCreateConfig({
        supportsCamera,
        supportedInputModes,
      });
    }
    const existing = await this.prisma.gameContent.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('游戏编码已存在。');
    }

    try {
      const created = await this.prisma.gameContent.create({
        data: {
          code,
          name,
          trainingTargets,
          tags,
          defaultDuration,
          defaultDifficulty,
          runtimeType,
          manifestUrl: isInlinePublishedRuntime ? null : undefined,
          buildBaseUrl: isInlinePublishedRuntime ? null : undefined,
          gameVersion: isInlinePublishedRuntime
            ? inlinePublishedGameVersion
            : undefined,
          buildStatus: isInlinePublishedRuntime ? 'released' : 'pending_assets',
          releaseChannel: isInlinePublishedRuntime
            ? 'production'
            : 'development',
          bridgeProtocolVersion: '1.0.0',
          supportsCamera,
          supportsMicrophone,
          supportedInputModes,
          requiredMetrics,
          ...(formalMetadata ?? {}),
          status: 'active',
        },
      });

      await this.audit(
        user.id,
        this.primaryRole(user),
        runtimeType === 'browser_pose_canvas'
          ? 'game_content.publish_browser_pose'
          : runtimeType === 'cognitive_web'
            ? 'game_content.publish_cognitive_web'
            : 'game_content.create',
        'game_content',
        created.id,
        'success',
        {
          code: created.code,
          buildStatus: created.buildStatus,
          status: created.status,
        },
      );

      return created;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('游戏编码已存在。');
      }
      throw error;
    }
  }

  async updateGameContentStatus(
    user: RequestUser,
    gameContentId: string,
    dto: UpdateGameContentStatusDto,
  ) {
    this.requireAdminPermission(user, 'game.manage');

    const status = this.validateGameStatus(dto.status);
    const current = await this.prisma.gameContent.findUnique({
      where: { id: gameContentId },
    });
    if (!current) {
      throw new NotFoundException('游戏内容不存在');
    }

    if (current.status === status) {
      return current;
    }

    const updated = await this.prisma.gameContent.update({
      where: { id: gameContentId },
      data: { status },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      status === 'active'
        ? 'game_content.enable'
        : status === 'inactive'
          ? 'game_content.disable'
          : 'game_content.archive',
      'game_content',
      gameContentId,
      'success',
      {
        code: updated.code,
        previousStatus: current.status,
        status: updated.status,
        buildStatus: updated.buildStatus,
      },
    );

    return updated;
  }

  async updateUnityBuildConfig(
    user: RequestUser,
    gameContentId: string,
    dto: UpdateUnityBuildDto,
  ) {
    this.requireAdminPermission(user, 'game.manage');

    const current = await this.prisma.gameContent.findUnique({
      where: { id: gameContentId },
    });
    if (!current) {
      throw new NotFoundException('游戏内容不存在');
    }

    const nextConfig = this.resolveUnityBuildConfig(current, dto);
    if (nextConfig.buildStatus === 'released') {
      this.requireAdminPermission(user, 'game.publish');
      this.assertUnityBuildCanBeReleased(nextConfig);
    }

    const updated = await this.prisma.gameContent.update({
      where: { id: gameContentId },
      data: nextConfig,
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      nextConfig.buildStatus === 'released'
        ? 'game_content.publish_unity_build'
        : 'game_content.update_unity_build',
      'game_content',
      gameContentId,
      'success',
      {
        code: updated.code,
        buildStatus: updated.buildStatus,
        gameVersion: updated.gameVersion,
        bridgeProtocolVersion: updated.bridgeProtocolVersion,
      },
    );

    return updated;
  }

  async listCollectionProtocols(user: RequestUser) {
    if (this.hasAnyAdminRole(user)) {
      this.requireAdminPermission(user, 'dashboard.view');
    } else {
      this.requireAnyRole(user, ['doctor']);
    }

    return this.prisma.collectionProtocol.findMany({
      where: { status: 'active' },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      include: { condition: true, gameContent: true },
    });
  }

  async listCollectionConditions(user: RequestUser) {
    this.requireAdminPermission(user, 'game.manage');

    return this.prisma.collectionCondition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCollectionCondition(
    user: RequestUser,
    dto: CreateCollectionConditionDto,
  ) {
    this.requireAdminPermission(user, 'game.manage');

    const code = this.validateCollectionCode(
      dto.code,
      '采集条件编码不能为空。',
    );
    const name = this.requiredFormalCollectionText(dto.name, '采集条件名称');
    const description = this.optionalFormalCollectionText(
      dto.description,
      '采集条件说明',
    );
    const environment = this.validateFormalCollectionObject(
      dto.environment,
      '采集环境',
    );
    const deviceRequirements = this.validateFormalCollectionObject(
      dto.deviceRequirements,
      '设备要求',
    );
    const taskParameters = this.validateFormalCollectionObject(
      dto.taskParameters,
      '任务参数',
    );
    const qualityRules = this.validateFormalCollectionObject(
      dto.qualityRules,
      '质量规则',
    );

    const created = await this.prisma.collectionCondition.create({
      data: {
        code,
        name,
        description,
        environment,
        deviceRequirements,
        taskParameters,
        qualityRules,
        status: 'active',
        createdByUserId: user.id,
      },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'collection_condition.create',
      'collection_condition',
      created.id,
      'success',
      { code: created.code, status: created.status },
    );

    return created;
  }

  async createCollectionProtocol(
    user: RequestUser,
    dto: CreateCollectionProtocolDto,
  ) {
    this.requireAdminPermission(user, 'game.manage');

    const conditionId = this.requiredString(
      dto.conditionId,
      '采集条件 ID 不能为空。',
    );
    const condition = await this.prisma.collectionCondition.findFirst({
      where: { id: conditionId, status: 'active' },
    });
    if (!condition) {
      throw new BadRequestException('采集条件不存在或未启用。');
    }

    const gameContentId = this.optionalString(
      dto.gameContentId,
      '训练内容 ID 必须是文本。',
    );
    const gameContent = gameContentId
      ? await this.prisma.gameContent.findUnique({
          where: { id: gameContentId },
        })
      : null;
    if (gameContentId && !gameContent) {
      throw new BadRequestException('训练内容不存在。');
    }
    if (gameContent) {
      this.assertGameReadyForFormalTraining(gameContent);
    }

    const runtimeType = this.validateFormalRuntimeType(dto.runtimeType);
    if (gameContent && gameContent.runtimeType !== runtimeType) {
      throw new BadRequestException('采集协议运行时与训练内容不一致。');
    }

    const requiredConsentTypes = this.validateCollectionConsentTypes(
      dto.requiredConsentTypes,
    );
    const requiredInputModes = this.validateFormalCollectionStringArray(
      dto.requiredInputModes,
      '采集协议输入模式',
    );
    const requiredMetrics = this.validateRequiredMetrics(
      dto.requiredMetrics,
      true,
    );
    const qualityGate =
      runtimeType === 'unity_webgl'
        ? this.validateUnityWebglQualityGate(dto.qualityGate)
        : this.validateFormalCollectionObject(dto.qualityGate, '质量门禁');

    if (gameContent) {
      this.assertCollectionProtocolMatchesGame(
        {
          runtimeType,
          gameContentId,
          requiredInputModes,
          requiredMetrics,
        },
        gameContent,
      );
    }

    const created = await this.prisma.collectionProtocol.create({
      data: {
        conditionId,
        gameContentId,
        code: this.validateCollectionCode(dto.code, '采集协议编码不能为空。'),
        name: this.requiredFormalCollectionText(dto.name, '采集协议名称'),
        version: this.validateGameVersion(
          this.requiredFormalCollectionText(dto.version, '采集协议版本'),
        ),
        runtimeType,
        requiredConsentTypes,
        requiredInputModes,
        requiredMetrics,
        conditionRules: this.validateFormalCollectionObject(
          dto.conditionRules,
          '协议条件规则',
        ),
        samplingConfig: this.validateFormalCollectionObject(
          dto.samplingConfig,
          '采样配置',
        ),
        qualityGate,
        status: 'active',
        createdByUserId: user.id,
      },
      include: { condition: true, gameContent: true },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'collection_protocol.create',
      'collection_protocol',
      created.id,
      'success',
      {
        code: created.code,
        version: created.version,
        runtimeType: created.runtimeType,
        conditionId,
        gameContentId: gameContentId ?? null,
      },
    );

    return created;
  }

  async createCollectionBatch(
    user: RequestUser,
    dto: CreateCollectionBatchDto,
  ) {
    if (this.hasAnyAdminRole(user)) {
      this.requireAdminPermission(user, 'game.manage');
    } else {
      this.requireAnyRole(user, ['doctor']);
    }

    await this.assertTrainingWriteAccess(user, dto.patientId);

    const planItem = await this.prisma.rehabPlanItem.findFirst({
      where: {
        id: dto.planItemId,
        rehabPlanId: dto.rehabPlanId,
        gameContentId: dto.gameContentId,
        rehabPlan: {
          patientId: dto.patientId,
          status: 'active',
          isCurrent: true,
        },
      },
      include: { gameContent: true },
    });
    if (!planItem) {
      throw new BadRequestException('训练项目不属于当前生效计划');
    }
    this.assertGameReadyForFormalTraining(planItem.gameContent);

    const protocol = await this.prisma.collectionProtocol.findFirst({
      where: { id: dto.protocolId, status: 'active' },
      include: { condition: true },
    });
    if (!protocol || protocol.condition.status !== 'active') {
      throw new BadRequestException('采集协议不存在或未启用。');
    }
    this.assertCollectionProtocolMatchesGame(protocol, planItem.gameContent);
    this.assertUnityWebglCollectionProtocolQualityGate(protocol);
    this.assertFormalCollectionSnapshot(protocol.condition, '采集条件快照');
    this.assertFormalCollectionSnapshot(protocol, '采集协议快照');

    const currentRisk = await this.prisma.riskGradeRecord.findFirst({
      where: { patientId: dto.patientId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: {
        assessmentId: true,
        riskLevel: true,
        manualRiskLevel: true,
        confirmedById: true,
        confirmedAt: true,
        assessment: { select: { id: true, resultEnvelope: true } },
      },
    });
    const trainingAssessment = this.assertConfirmedAssessmentForFormalTraining(
      currentRisk,
      '缺少已确认评估来源，不能创建正式采集批次。',
    );
    this.assertCollectionProtocolMatchesAssessment(
      protocol,
      trainingAssessment,
    );

    const conditionSnapshot = this.buildConditionSnapshot(protocol.condition);
    const protocolSnapshot = this.buildProtocolSnapshot(protocol);
    const consentSnapshot = await this.assertTrainingRuntimeConsents(
      dto.patientId,
      planItem.gameContent,
      protocol.requiredConsentTypes,
      protocol.requiredInputModes,
    );
    const idempotencyKey = this.optionalString(
      dto.idempotencyKey,
      '采集批次幂等键必须是文本。',
    );

    const createData = {
      patientId: dto.patientId,
      rehabPlanId: dto.rehabPlanId,
      planItemId: dto.planItemId,
      gameContentId: dto.gameContentId,
      protocolId: protocol.id,
      conditionId: protocol.conditionId,
      protocolVersion: protocol.version,
      status: 'ready',
      idempotencyKey,
      conditionSnapshot,
      protocolSnapshot,
      consentSnapshot,
      operatorNotes: this.optionalFormalCollectionText(
        dto.operatorNotes,
        '采集批次备注',
      ),
      createdByUserId: user.id,
    };

    return this.prisma.$transaction(async (tx) => {
      const created = idempotencyKey
        ? await tx.collectionBatch.upsert({
            where: {
              patientId_idempotencyKey: {
                patientId: dto.patientId,
                idempotencyKey,
              },
            },
            update: {},
            create: createData,
            include: { protocol: true, condition: true },
          })
        : await tx.collectionBatch.create({
            data: createData,
            include: { protocol: true, condition: true },
          });

      if (idempotencyKey) {
        this.assertImmutableIdempotencyContext(
          '采集批次',
          {
            patientId: created.patientId,
            rehabPlanId: created.rehabPlanId,
            planItemId: created.planItemId,
            gameContentId: created.gameContentId,
            protocolId: created.protocolId,
            conditionId: created.conditionId,
            protocolVersion: created.protocolVersion,
            idempotencyKey: created.idempotencyKey,
            conditionSnapshot: created.conditionSnapshot,
            protocolSnapshot: created.protocolSnapshot,
            consentSnapshot: created.consentSnapshot,
            operatorNotes: created.operatorNotes,
            createdByUserId: created.createdByUserId,
          },
          {
            patientId: createData.patientId,
            rehabPlanId: createData.rehabPlanId,
            planItemId: createData.planItemId,
            gameContentId: createData.gameContentId,
            protocolId: createData.protocolId,
            conditionId: createData.conditionId,
            protocolVersion: createData.protocolVersion,
            idempotencyKey,
            conditionSnapshot: createData.conditionSnapshot,
            protocolSnapshot: createData.protocolSnapshot,
            consentSnapshot: createData.consentSnapshot,
            operatorNotes: createData.operatorNotes ?? null,
            createdByUserId: createData.createdByUserId,
          },
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: this.primaryRole(user),
          action: 'collection_batch.create',
          targetType: 'collection_batch',
          targetId: created.id,
          result: 'success',
          metadata: {
            patientId: created.patientId,
            rehabPlanId: created.rehabPlanId,
            planItemId: created.planItemId,
            gameContentId: created.gameContentId,
            protocolId: created.protocolId,
          },
        },
      });
      return created;
    });
  }

  async listPatientCollectionBatches(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    const batches = await this.prisma.collectionBatch.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { protocol: true, condition: true, gameContent: true },
    });
    return this.isPatientOwnedRecordView(user, patientId)
      ? batches.map((batch) =>
          this.serializeCollectionBatchForPatientProgress(batch),
        )
      : batches;
  }

  private async assertPatientAccess(
    user: RequestUser,
    patientId: string,
    access: 'summary' | 'full',
  ) {
    const patientRole = user.roles.find(
      (role) =>
        role.roleCode === 'patient' && role.relatedObjectId === patientId,
    );
    if (patientRole) return;

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { id: true, responsibleDoctorId: true },
    });
    if (!patient) throw new NotFoundException('患者不存在');

    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (doctorRole) return;

    const caregiverRole = user.roles.find(
      (role) => role.roleCode === 'caregiver',
    );
    if (caregiverRole && access === 'summary') {
      const relation = await this.findActiveCaregiverAuthorization(
        user.id,
        patientId,
      );
      if (relation) return;
    }

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'patient_profile',
      patientId,
      'denied',
    );
    throw new ForbiddenException('无权访问该患者数据');
  }

  private async assertClinicalAssessmentWriteAccess(
    user: RequestUser,
    patientId: string,
  ) {
    await this.assertResponsibleDoctorAccess(
      user,
      patientId,
      'assessment_record',
      'clinical_assessment_write_required',
    );
  }

  private async assertAssessmentReviewAccess(
    user: RequestUser,
    patient: { id: string; responsibleDoctorId: string | null },
  ) {
    await this.assertResponsibleDoctorForPatient(
      user,
      patient,
      'assessment_record',
      'assessment_review_required',
    );
  }

  private async assertTrainingWriteAccess(
    user: RequestUser,
    patientId: string,
  ) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { id: true, responsibleDoctorId: true },
    });
    if (!patient) throw new NotFoundException('患者不存在');

    const patientRole = user.roles.find(
      (role) =>
        role.roleCode === 'patient' && role.relatedObjectId === patient.id,
    );
    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (patientRole || doctorRole) return;

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'patient_profile',
      patientId,
      'denied',
      { reason: 'training_write_required' },
    );
    throw new ForbiddenException('无权写入训练数据');
  }

  private async assertTrainingReviewAccess(
    user: RequestUser,
    patient: { id: string; responsibleDoctorId: string | null },
  ) {
    await this.assertResponsibleDoctorForPatient(
      user,
      patient,
      'training_result',
      'training_review_required',
    );
  }

  private async assertResponsibleDoctorAccess(
    user: RequestUser,
    patientId: string,
    targetType: string,
    denialReason: string,
  ) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { id: true, responsibleDoctorId: true },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    return this.assertResponsibleDoctorForPatient(
      user,
      patient,
      targetType,
      denialReason,
    );
  }

  private async assertResponsibleDoctorForPatient(
    user: RequestUser,
    patient: { id: string; responsibleDoctorId: string | null },
    targetType: string,
    denialReason: string,
  ) {
    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        patient.responsibleDoctorId !== null &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (doctorRole) return doctorRole.relatedObjectId;

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      targetType,
      patient.id,
      'denied',
      { reason: denialReason },
    );
    throw new ForbiddenException('仅当前负责医师可执行该临床操作。');
  }

  private async assertCareCircleModerationAccess(
    user: RequestUser,
    patient: { id: string; responsibleDoctorId: string | null },
  ) {
    if (
      this.hasRole(user, 'admin') ||
      this.hasRole(user, 'admin_super') ||
      this.hasRole(user, 'admin_operator')
    ) {
      return;
    }

    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        patient.responsibleDoctorId !== null &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (doctorRole) return;

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'care_circle_post',
      patient.id,
      'denied',
      { reason: 'care_circle_moderation_required' },
    );
    throw new ForbiddenException('无权处理关爱动态。');
  }

  private async assertCarePrecautionWriteAccess(
    user: RequestUser,
    patientId: string,
  ) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { id: true, responsibleDoctorId: true },
    });
    if (!patient) throw new NotFoundException('患者不存在');

    await this.assertResponsibleDoctorForPatient(
      user,
      patient,
      'care_precaution',
      'care_precaution_responsible_doctor_required',
    );
  }

  private async buildUserContext(user: RequestUser) {
    const context: {
      primaryRole: RoleCode | undefined;
      patientIds: string[];
      caregiverPatientIds: string[];
      doctorPatientIds: string[];
      doctorIds: string[];
      organizationIds: string[];
      caregiverScopes: Record<string, Prisma.JsonValue>;
      adminPermissions: AdminPermission[];
    } = {
      primaryRole: this.primaryRole(user),
      patientIds: [],
      caregiverPatientIds: [],
      doctorPatientIds: [],
      doctorIds: [],
      organizationIds: [],
      caregiverScopes: {},
      adminPermissions: [],
    };

    for (const role of user.roles) {
      if (role.roleCode === 'patient') {
        context.patientIds.push(role.relatedObjectId);
      }
      if (
        role.roleCode === 'caregiver' &&
        role.relatedObjectType === 'patient'
      ) {
        context.caregiverPatientIds.push(role.relatedObjectId);
      }
      if (role.roleCode === 'doctor') {
        context.doctorIds.push(role.relatedObjectId);
      }
      if (role.organizationId) {
        context.organizationIds.push(role.organizationId);
      }
      if (this.isAdminRole(role.roleCode)) {
        context.adminPermissions.push(...this.adminPermissions(role.roleCode));
      }
    }

    context.adminPermissions = Array.from(new Set(context.adminPermissions));

    if (context.caregiverPatientIds.length) {
      const relations = await this.prisma.caregiverRelation.findMany({
        where: {
          caregiverUserId: user.id,
          patientId: { in: context.caregiverPatientIds },
          authorizationStatus: 'active',
          revokedAt: null,
        },
        select: { patientId: true, scope: true },
      });
      context.caregiverScopes = Object.fromEntries(
        relations.map((relation) => [relation.patientId, relation.scope]),
      );
    }

    if (context.doctorIds.length) {
      const patients = await this.prisma.patientProfile.findMany({
        where: { responsibleDoctorId: { in: context.doctorIds } },
        select: { id: true },
      });
      context.doctorPatientIds = patients.map((patient) => patient.id);
    }

    return context;
  }

  private async resolveResponsibleDoctorId(
    user: RequestUser,
    requestedDoctorId: string | undefined,
  ) {
    const doctorRole = user.roles.find((role) => role.roleCode === 'doctor');

    if (!this.hasAnyAdminRole(user)) {
      if (!doctorRole) {
        throw new ForbiddenException('当前账号未绑定医师身份');
      }
      if (
        requestedDoctorId &&
        requestedDoctorId !== doctorRole.relatedObjectId
      ) {
        throw new ForbiddenException('普通医师只能创建自己负责的患者');
      }
      return doctorRole.relatedObjectId;
    }

    if (!requestedDoctorId) {
      throw new BadRequestException('管理员创建患者时必须指定负责医师');
    }

    const doctorByProfileId = await this.prisma.doctorProfile.findUnique({
      where: { id: requestedDoctorId },
      select: { id: true },
    });
    if (doctorByProfileId) return doctorByProfileId.id;

    const doctorByAccount = await this.prisma.doctorProfile.findFirst({
      where: { user: { account: requestedDoctorId } },
      select: { id: true },
    });
    if (doctorByAccount) return doctorByAccount.id;

    throw new BadRequestException('负责医师不存在');
  }

  private async assertPatientSelf(user: RequestUser, patientId: string) {
    const patientRole = user.roles.find(
      (role) =>
        role.roleCode === 'patient' && role.relatedObjectId === patientId,
    );
    if (!patientRole) {
      await this.audit(
        user.id,
        this.primaryRole(user),
        'access.denied',
        'patient_profile',
        patientId,
        'denied',
        { reason: 'patient_self_required' },
      );
      throw new ForbiddenException('仅患者本人账号可管理家属共享授权。');
    }
  }

  private async assertCurrentConsent(
    patientId: string,
    consentType: ConsentDto['consentType'],
  ) {
    const consent = await this.prisma.consentRecord.findFirst({
      where: {
        patientId,
        consentType,
        consentVersion: currentConsentVersion,
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });

    if (!consent) {
      throw new ForbiddenException(`缺少 ${consentType} 授权`);
    }
    return consent;
  }

  private async findActiveCaregiverAuthorization(
    caregiverUserId: string,
    patientId: string,
  ) {
    const [relation, consent] = await Promise.all([
      this.prisma.caregiverRelation.findFirst({
        where: {
          caregiverUserId,
          patientId,
          authorizationStatus: 'active',
          revokedAt: null,
        },
      }),
      this.prisma.consentRecord.findFirst({
        where: {
          patientId,
          consentType: 'caregiver_sharing',
          consentVersion: currentConsentVersion,
          status: 'granted',
          revokedAt: null,
        },
      }),
    ]);

    return relation && consent ? relation : null;
  }

  private evaluateTrainingQuality(
    dto: SubmitTrainingResultDto,
    evidenceReasons: string[],
  ) {
    const reasons = [...evidenceReasons];
    if (dto.durationSeconds < 60) reasons.push('训练时长过短');
    if (dto.completionRate < 0.5) reasons.push('完成率过低');
    if (dto.reactionTimeMs <= 0 || dto.reactionTimeMs > 10000)
      reasons.push('反应时间异常');
    if (dto.motionAccuracy < 0 || dto.motionAccuracy > 1)
      reasons.push('动作准确率超范围');

    return {
      abnormalFlag: reasons.length > 0,
      qualityFlag: reasons.length > 0 ? 'suspicious' : 'valid',
      qualityReasons: reasons,
      sessionStatus: (reasons.length > 0
        ? 'upload_failed'
        : 'completed') as TrainingSessionStatus,
      reason: reasons.join('；') || undefined,
    };
  }

  private async issueTrainingRewardsIfEligible(
    tx: Prisma.TransactionClient,
    context: {
      patientId: string;
      result: {
        id: string;
        score: number;
        completionRate: number;
        durationSeconds: number;
        reactionTimeMs: number;
        motionAccuracy: number;
        exerciseIntensity: string;
        abnormalFlag: boolean;
        qualityFlag: string;
      };
      quality: { abnormalFlag: boolean; qualityFlag: string };
    },
  ) {
    if (
      context.quality.abnormalFlag ||
      context.quality.qualityFlag !== 'valid' ||
      context.result.abnormalFlag ||
      context.result.qualityFlag !== 'valid'
    ) {
      return;
    }

    const eventType = 'training_result.valid_completed';
    const rules = await tx.rewardRule.findMany({
      where: {
        eventType,
        status: 'active',
      },
    });

    for (const rule of rules) {
      if (!this.trainingResultMatchesRewardRule(context.result, rule)) {
        continue;
      }

      const ledger = await tx.rewardLedger.upsert({
        where: {
          patientId_eventType_eventId_ruleId: {
            patientId: context.patientId,
            eventType,
            eventId: context.result.id,
            ruleId: rule.id,
          },
        },
        update: {},
        create: {
          patientId: context.patientId,
          trainingResultId: context.result.id,
          ruleId: rule.id,
          eventType,
          eventId: context.result.id,
          points: rule.points,
          status: 'issued',
          evidence: {
            source: 'training_result',
            score: context.result.score,
            completionRate: context.result.completionRate,
            qualityFlag: context.result.qualityFlag,
          },
        },
      });

      if (rule.achievementCode) {
        const target = rule.achievementTarget ?? 1;
        await tx.achievement.upsert({
          where: {
            patientId_code: {
              patientId: context.patientId,
              code: rule.achievementCode,
            },
          },
          update: {
            progress: { increment: 1 },
            sourceLedgerId: ledger.id,
            evidence: {
              latestRuleCode: rule.code,
              latestLedgerId: ledger.id,
            },
          },
          create: {
            patientId: context.patientId,
            code: rule.achievementCode,
            name: rule.achievementName ?? rule.name,
            progress: 1,
            target,
            unlockedAt: target <= 1 ? new Date() : null,
            sourceLedgerId: ledger.id,
            evidence: {
              latestRuleCode: rule.code,
              latestLedgerId: ledger.id,
            },
          },
        });
      }
    }
  }

  private trainingResultMatchesRewardRule(
    result: {
      score: number;
      completionRate: number;
      durationSeconds: number;
      motionAccuracy: number;
    },
    rule: {
      eligibility: Prisma.JsonValue;
    },
  ) {
    const eligibility =
      rule.eligibility &&
      typeof rule.eligibility === 'object' &&
      !Array.isArray(rule.eligibility)
        ? rule.eligibility
        : {};
    const minScore = this.optionalRewardNumber(eligibility.minScore);
    const minCompletionRate = this.optionalRewardNumber(
      eligibility.minCompletionRate,
    );
    const minDurationSeconds = this.optionalRewardNumber(
      eligibility.minDurationSeconds,
    );
    const minMotionAccuracy = this.optionalRewardNumber(
      eligibility.minMotionAccuracy,
    );

    if (minScore !== undefined && result.score < minScore) return false;
    if (
      minCompletionRate !== undefined &&
      result.completionRate < minCompletionRate
    ) {
      return false;
    }
    if (
      minDurationSeconds !== undefined &&
      result.durationSeconds < minDurationSeconds
    ) {
      return false;
    }
    if (
      minMotionAccuracy !== undefined &&
      result.motionAccuracy < minMotionAccuracy
    ) {
      return false;
    }
    return true;
  }

  private optionalRewardNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return undefined;
    return numberValue;
  }

  private hasCompletedTrainingResult(
    session: TrainingSessionForCompletionSummary,
  ) {
    const result = session.result;
    return (
      session.sessionStatus === 'completed' &&
      result !== null &&
      result !== undefined &&
      result.qualityFlag === 'valid' &&
      result.abnormalFlag === false
    );
  }

  private assertGameReadyForFormalTraining(game: GameContent) {
    if (game.status !== 'active') {
      throw new BadRequestException('训练游戏未启用，不能开始训练。');
    }
    const runtimeType = this.validateFormalRuntimeType(game.runtimeType);
    if (runtimeType === 'unity_webgl') {
      this.assertUnityWebglGameReady(game);
      return;
    }
    if (runtimeType === 'browser_pose_canvas') {
      this.assertBrowserPoseGameReady(game);
      return;
    }
    this.assertCognitiveWebGameReady(game);
  }

  private isGameReadyForFormalTraining(game: GameContent) {
    try {
      this.assertGameReadyForFormalTraining(game);
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return false;
      }
      throw error;
    }
  }

  private validateFormalRuntimeType(value: string): FormalRuntimeType {
    if (supportedFormalRuntimeTypes.includes(value as FormalRuntimeType)) {
      return value as FormalRuntimeType;
    }
    throw new BadRequestException(
      `训练游戏运行时不受支持：${value}。当前仅支持 unity_webgl、browser_pose_canvas 或 cognitive_web。`,
    );
  }

  private validateCollectionCode(value: unknown, message: string) {
    const code = this.requiredFormalCollectionText(value, '采集编码');
    if (!/^[a-z0-9_-]{2,64}$/.test(code)) {
      throw new BadRequestException(
        `${message}编码只能包含小写字母、数字、下划线或短横线，长度 2 到 64 位。`,
      );
    }
    return code;
  }

  private requiredFormalCollectionText(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    this.assertNoDemoMockLocalManual(text, label);
    return text;
  }

  private optionalFormalCollectionText(value: unknown, label: string) {
    const text = this.optionalString(value, `${label}必须是文本。`);
    if (text) this.assertNoDemoMockLocalManual(text, label);
    return text;
  }

  private validateFormalCollectionObject(value: unknown, label: string) {
    const object = this.requiredJsonObject(value, `${label}必须是对象。`);
    this.assertFormalCollectionSnapshot(object, label);
    return this.jsonInput(object);
  }

  private validateUnityWebglQualityGate(value: unknown) {
    const qualityGate = this.requiredJsonObject(
      value,
      'Unity WebGL 采集协议 qualityGate 必须是对象。',
    );
    this.assertFormalCollectionSnapshot(
      qualityGate,
      'Unity WebGL 采集协议 qualityGate',
    );
    this.unityWebglQualityGateMinConfidence(
      qualityGate,
      'Unity WebGL 采集协议 qualityGate',
    );
    return this.jsonInput(qualityGate);
  }

  private unityWebglQualityGateMinConfidence(value: unknown, label: string) {
    const qualityGate = this.requiredJsonObject(value, `${label}必须是对象。`);
    const keys = Object.keys(qualityGate);
    if (keys.length !== 1 || keys[0] !== 'minConfidence') {
      throw new BadRequestException(
        `${label}必须精确为 { minConfidence: number }。`,
      );
    }
    const minConfidence = qualityGate.minConfidence;
    if (typeof minConfidence !== 'number' || !Number.isFinite(minConfidence)) {
      throw new BadRequestException(`${label}.minConfidence 无效。`);
    }
    if (minConfidence <= 0 || minConfidence > 1) {
      throw new BadRequestException(
        `${label}.minConfidence 必须大于 0 且小于等于 1。`,
      );
    }
    return minConfidence;
  }

  private assertUnityWebglCollectionProtocolQualityGate(protocol: {
    runtimeType: string;
    qualityGate: unknown;
  }) {
    if (protocol.runtimeType === 'unity_webgl') {
      this.unityWebglQualityGateMinConfidence(
        protocol.qualityGate,
        'Unity WebGL 采集协议 qualityGate',
      );
    }
  }

  private validateFormalCollectionStringArray(value: unknown, label: string) {
    const items = this.validateStringArray(
      value,
      `${label}必须是非空字符串数组。`,
    );
    for (const item of items) {
      this.assertNoDemoMockLocalManual(item, label);
    }
    return items;
  }

  private validateCollectionConsentTypes(value: unknown) {
    const consentTypes = this.validateFormalCollectionStringArray(
      value,
      '采集协议授权类型',
    );
    const validTypes: Array<ConsentDto['consentType']> = [
      'privacy_policy',
      'ai_processing',
      'camera_capture',
      'microphone_capture',
      'caregiver_sharing',
    ];
    for (const consentType of consentTypes) {
      if (!validTypes.includes(consentType as ConsentDto['consentType'])) {
        throw new BadRequestException('采集协议授权类型无效。');
      }
    }
    return consentTypes;
  }

  private assertFormalCollectionSnapshot(value: unknown, label: string) {
    const raw = JSON.stringify(value ?? {});
    if (nonProductionMarkerPattern.test(raw)) {
      throw new BadRequestException(
        `${label} 不能包含 mock、demo、local、manual 或 fallback。`,
      );
    }
  }

  private assertConfirmedAssessmentForFormalTraining(
    currentRisk: {
      assessmentId: string | null;
      riskLevel: string;
      manualRiskLevel: string | null;
      confirmedById: string | null;
      confirmedAt: Date | null;
      assessment: { id: string; resultEnvelope: unknown } | null;
    } | null,
    missingAssessmentMessage: string,
  ) {
    if (
      !currentRisk?.assessmentId ||
      !currentRisk.confirmedById ||
      !currentRisk.confirmedAt ||
      !currentRisk.assessment ||
      currentRisk.assessment.id !== currentRisk.assessmentId
    ) {
      throw new BadRequestException(missingAssessmentMessage);
    }

    const riskLevel = this.requireFormalTrainingRiskLevel(
      currentRisk.manualRiskLevel ?? currentRisk.riskLevel,
    );
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      this.decryptAssessmentResult(
        currentRisk.assessment.id,
        currentRisk.assessment.resultEnvelope,
      ).physicalConditions,
      '当前评估缺少身体状况安全结论，不能进行正式训练。',
    );

    return {
      assessmentId: currentRisk.assessmentId,
      riskLevel,
      physicalConditions,
    };
  }

  private requireFormalTrainingRiskLevel(value: unknown): RiskLevel {
    const riskLevel = this.requiredString(
      value,
      '当前风险评级缺少有效 riskLevel，不能进行正式训练。',
    );
    if (!['low', 'moderate', 'high'].includes(riskLevel)) {
      throw new BadRequestException(
        '当前风险评级缺少有效 riskLevel，不能进行正式训练。',
      );
    }
    return riskLevel as RiskLevel;
  }

  private validateCollectionProtocolRiskLevels(value: unknown): RiskLevel[] {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(
        '采集协议 conditionRules.riskLevels 必须是非空数组。',
      );
    }
    const riskLevels = Array.from(
      new Set(
        value.map((item) =>
          this.requiredString(
            item,
            '采集协议 conditionRules.riskLevels 必须是风险等级数组。',
          ),
        ),
      ),
    );
    if (
      riskLevels.some(
        (riskLevel) => !['low', 'moderate', 'high'].includes(riskLevel),
      )
    ) {
      throw new BadRequestException(
        '采集协议 conditionRules.riskLevels 只能包含 low、moderate 或 high。',
      );
    }
    return riskLevels as RiskLevel[];
  }

  private assertCollectionProtocolMatchesAssessment(
    protocol: { conditionRules: unknown },
    assessment: {
      riskLevel: RiskLevel;
      physicalConditions: AssessmentPhysicalCondition[];
    },
  ) {
    const conditionRules = this.requiredJsonObject(
      protocol.conditionRules,
      '采集协议缺少 conditionRules，不能进行正式训练。',
    );
    const allowedPhysicalConditions = this.validateAssessmentPhysicalConditions(
      conditionRules.physicalConditions,
      '采集协议 conditionRules.physicalConditions 必须是身体状况数组。',
    );
    if (!allowedPhysicalConditions.length) {
      throw new BadRequestException(
        '采集协议 conditionRules.physicalConditions 不能为空。',
      );
    }
    const allowedRiskLevels = this.validateCollectionProtocolRiskLevels(
      conditionRules.riskLevels,
    );

    const disallowedPhysicalConditions = assessment.physicalConditions.filter(
      (condition) => !allowedPhysicalConditions.includes(condition),
    );
    if (disallowedPhysicalConditions.length) {
      throw new BadRequestException(
        `患者身体状况不满足采集协议 conditionRules：${disallowedPhysicalConditions.join('、')}。`,
      );
    }
    if (!allowedRiskLevels.includes(assessment.riskLevel)) {
      throw new BadRequestException(
        `患者风险等级不满足采集协议 conditionRules：${assessment.riskLevel}。`,
      );
    }
  }

  private assertCollectionProtocolMatchesGame(
    protocol: {
      runtimeType: string;
      gameContentId?: string | null;
      requiredInputModes: string[];
      requiredMetrics: unknown;
    },
    game: GameContent,
  ) {
    if (protocol.runtimeType !== game.runtimeType) {
      throw new BadRequestException('采集协议运行时与训练内容不一致。');
    }
    if (protocol.gameContentId && protocol.gameContentId !== game.id) {
      throw new BadRequestException('采集协议不属于当前训练内容。');
    }
    const gameInputModes = new Set(game.supportedInputModes);
    const missingInputModes = protocol.requiredInputModes.filter(
      (mode) => !gameInputModes.has(mode),
    );
    if (missingInputModes.length) {
      throw new BadRequestException(
        `训练内容缺少采集协议要求的输入模式：${missingInputModes.join('、')}。`,
      );
    }
    const protocolMetrics = this.metricTypesFromJson(
      protocol.requiredMetrics,
      '采集协议 requiredMetrics 必须是对象数组。',
    );
    const gameMetrics = new Set(
      this.metricTypesFromJson(
        game.requiredMetrics,
        '训练内容 requiredMetrics 必须是对象数组。',
      ),
    );
    const missingMetricTypes = protocolMetrics.filter(
      (metricType) => !gameMetrics.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `训练内容缺少采集协议要求的动作指标：${missingMetricTypes.join('、')}。`,
      );
    }
  }

  private metricTypesFromJson(value: unknown, message: string) {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(message);
    }
    return value.map((item) => {
      const metric = this.requiredJsonObject(item, message);
      return this.requiredString(metric.metricType, message);
    });
  }

  private buildConditionSnapshot(condition: {
    id: string;
    code: string;
    name: string;
    environment: Prisma.JsonValue;
    deviceRequirements: Prisma.JsonValue;
    taskParameters: Prisma.JsonValue;
    qualityRules: Prisma.JsonValue;
    status: string;
  }) {
    return this.jsonInput({
      id: condition.id,
      code: condition.code,
      name: condition.name,
      environment: condition.environment,
      deviceRequirements: condition.deviceRequirements,
      taskParameters: condition.taskParameters,
      qualityRules: condition.qualityRules,
      status: condition.status,
    });
  }

  private buildProtocolSnapshot(protocol: {
    id: string;
    code: string;
    name: string;
    version: string;
    runtimeType: string;
    requiredConsentTypes: string[];
    requiredInputModes: string[];
    requiredMetrics: Prisma.JsonValue;
    conditionRules: Prisma.JsonValue;
    samplingConfig: Prisma.JsonValue;
    qualityGate: Prisma.JsonValue;
    status: string;
  }) {
    return this.jsonInput({
      id: protocol.id,
      code: protocol.code,
      name: protocol.name,
      version: protocol.version,
      runtimeType: protocol.runtimeType,
      requiredConsentTypes: protocol.requiredConsentTypes,
      requiredInputModes: protocol.requiredInputModes,
      requiredMetrics: protocol.requiredMetrics,
      conditionRules: protocol.conditionRules,
      samplingConfig: protocol.samplingConfig,
      qualityGate: protocol.qualityGate,
      status: protocol.status,
    });
  }

  private buildTrainingConsentSnapshot(
    consents: Array<{
      id: string;
      consentType: ConsentDto['consentType'];
      consentVersion: string;
      status: string;
      grantedAt: Date;
      revokedAt?: Date | null;
    }>,
  ): TrainingConsentSnapshot & Prisma.JsonObject {
    const snapshot: TrainingConsentSnapshot = {
      version: currentConsentVersion,
      requiredTypes: consents.map((consent) => consent.consentType),
      grantedConsentIds: consents.map((consent) => consent.id),
      grants: consents.map((consent) => ({
        id: consent.id,
        consentType: consent.consentType,
        consentVersion: consent.consentVersion,
        status: consent.status,
        grantedAt: consent.grantedAt.toISOString(),
      })),
      status: 'granted',
    };
    return snapshot;
  }

  private assertTrainingConsentSnapshot(value: unknown) {
    const snapshot = this.requiredJsonObject(
      value,
      '采集批次缺少授权快照，请重新创建正式采集批次。',
    );
    const version = this.requiredString(
      snapshot.version,
      '采集批次授权快照缺少版本。',
    );
    if (version !== currentConsentVersion) {
      throw new BadRequestException('采集批次授权快照版本不是当前正式版本。');
    }
    if (snapshot.status !== 'granted') {
      throw new BadRequestException('采集批次授权快照未处于 granted 状态。');
    }
    const requiredTypes = this.validateConsentSnapshotStringArray(
      snapshot.requiredTypes,
      '采集批次授权快照缺少 requiredTypes。',
    );
    if (!requiredTypes.includes('privacy_policy')) {
      throw new BadRequestException('采集批次授权快照缺少 privacy_policy。');
    }
    const grantedConsentIds = this.validateConsentSnapshotStringArray(
      snapshot.grantedConsentIds,
      '采集批次授权快照缺少 grantedConsentIds。',
    );
    if (grantedConsentIds.length !== requiredTypes.length) {
      throw new BadRequestException('采集批次授权快照授权数量不一致。');
    }
    if (!Array.isArray(snapshot.grants) || !snapshot.grants.length) {
      throw new BadRequestException('采集批次授权快照缺少 grants。');
    }
    const grantedTypes = new Set<ConsentDto['consentType']>();
    for (const grant of snapshot.grants) {
      const grantObject = this.requiredJsonObject(
        grant,
        '采集批次授权快照 grants 必须是对象。',
      );
      const id = this.requiredString(
        grantObject.id,
        '采集批次授权快照 grant 缺少 id。',
      );
      if (!grantedConsentIds.includes(id)) {
        throw new BadRequestException('采集批次授权快照 grant id 不一致。');
      }
      const consentType = this.validateConsentType(grantObject.consentType);
      if (!requiredTypes.includes(consentType)) {
        throw new BadRequestException('采集批次授权快照 grant 类型不一致。');
      }
      if (grantObject.consentVersion !== currentConsentVersion) {
        throw new BadRequestException('采集批次授权快照 grant 版本不一致。');
      }
      if (grantObject.status !== 'granted') {
        throw new BadRequestException(
          '采集批次授权快照 grant 状态不是 granted。',
        );
      }
      this.parseDate(
        this.requiredString(
          grantObject.grantedAt,
          '采集批次授权快照 grant 缺少 grantedAt。',
        ),
        '采集批次授权快照 grant grantedAt 无效。',
      );
      grantedTypes.add(consentType);
    }
    if (grantedTypes.size !== requiredTypes.length) {
      throw new BadRequestException(
        '采集批次授权快照 requiredTypes 未全部覆盖。',
      );
    }
  }

  private validateConsentSnapshotStringArray(value: unknown, message: string) {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(message);
    }
    return value.map((item) => this.requiredString(item, message));
  }

  private assertCollectionBatchMatchesTrainingContext(
    batch: CollectionBatchWithProtocol | null,
    dto: StartTrainingDto,
    game: GameContent,
  ): asserts batch is CollectionBatchWithProtocol {
    if (!batch) {
      throw new BadRequestException('采集批次不存在或不属于当前训练上下文。');
    }
    if (batch.status !== 'ready') {
      throw new BadRequestException('采集批次状态不是 ready，不能开始训练。');
    }
    if (
      batch.patientId !== dto.patientId ||
      batch.rehabPlanId !== dto.rehabPlanId ||
      batch.planItemId !== dto.planItemId ||
      batch.gameContentId !== dto.gameContentId
    ) {
      throw new BadRequestException('采集批次不存在或不属于当前训练上下文。');
    }
    if (
      batch.protocol.status !== 'active' ||
      batch.condition.status !== 'active'
    ) {
      throw new BadRequestException('采集批次关联的协议或条件未启用。');
    }
    if (batch.protocolVersion !== batch.protocol.version) {
      throw new BadRequestException('采集批次协议版本与当前协议不一致。');
    }
    this.assertFormalCollectionSnapshot(
      batch.conditionSnapshot,
      '采集批次条件快照',
    );
    this.assertFormalCollectionSnapshot(
      batch.protocolSnapshot,
      '采集批次协议快照',
    );
    this.assertTrainingConsentSnapshot(batch.consentSnapshot);
    this.assertCollectionProtocolMatchesGame(batch.protocol, game);
    this.assertUnityWebglCollectionProtocolQualityGate(batch.protocol);
  }

  private assertUnityWebglGameReady(game: GameContent) {
    if (game.buildStatus !== 'released') {
      throw new BadRequestException(
        `训练游戏 ${game.name} 尚未发布正式 Unity WebGL 构建，当前状态：${game.buildStatus}。请先上传并配置正式构建资产。`,
      );
    }
    if (!game.manifestUrl?.trim()) {
      throw new BadRequestException(
        `训练游戏 ${game.name} 缺少 manifestUrl，不能开始正式训练。`,
      );
    }
    if (!game.gameVersion?.trim()) {
      throw new BadRequestException(
        `训练游戏 ${game.name} 缺少 gameVersion，不能开始正式训练。`,
      );
    }
    if (game.bridgeProtocolVersion !== '1.0.0') {
      throw new BadRequestException(
        `训练游戏 ${game.name} 的桥接协议版本不受支持：${game.bridgeProtocolVersion}。`,
      );
    }
    this.assertRequiredMetricTypes(
      game.requiredMetrics,
      [...unityWebglRequiredMetricTypes],
      `训练游戏 ${game.name} 缺少正式动作指标配置。`,
    );
    this.validateExistingGamePublishMetadata(game, ['camera_capture']);
  }

  private assertBrowserPoseGameReady(game: GameContent) {
    if (game.buildStatus !== 'released') {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 尚未发布正式版本，当前状态：${game.buildStatus}。`,
      );
    }
    if (game.releaseChannel !== 'production') {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 未发布到 production 通道，不能开始正式训练。`,
      );
    }
    if (!game.gameVersion?.trim()) {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 缺少 gameVersion，不能开始正式训练。`,
      );
    }
    if (game.bridgeProtocolVersion !== '1.0.0') {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 的桥接协议版本不受支持：${game.bridgeProtocolVersion}。`,
      );
    }
    if (!game.supportsCamera) {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 必须启用摄像头采集。`,
      );
    }
    if (
      game.supportedInputModes.length !== 1 ||
      game.supportedInputModes[0] !== 'camera_pose'
    ) {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 的正式输入模式必须精确为 camera_pose。`,
      );
    }
    this.assertCanonicalBrowserPoseMetricContract(
      game.requiredMetrics,
      `浏览器体感游戏 ${game.name}`,
    );
    this.validateExistingGamePublishMetadata(game, ['camera_capture']);
  }

  private assertCognitiveWebGameReady(game: GameContent) {
    if (game.buildStatus !== 'released') {
      throw new BadRequestException(
        `认知训练 ${game.name} 尚未发布正式版本，当前状态：${game.buildStatus}。`,
      );
    }
    if (!game.gameVersion?.trim()) {
      throw new BadRequestException(
        `认知训练 ${game.name} 缺少 gameVersion，不能开始正式训练。`,
      );
    }
    if (game.bridgeProtocolVersion !== '1.0.0') {
      throw new BadRequestException(
        `认知训练 ${game.name} 的结果协议版本不受支持：${game.bridgeProtocolVersion}。`,
      );
    }
    if (
      !game.supportedInputModes.includes('touch') &&
      !game.supportedInputModes.includes('keyboard')
    ) {
      throw new BadRequestException(
        `认知训练 ${game.name} 必须包含 touch 或 keyboard 输入模式。`,
      );
    }
    this.assertRequiredMetricTypes(
      game.requiredMetrics,
      ['sequence_recall_rate', 'path_completion_rate'],
      `认知训练 ${game.name} 缺少正式结果指标配置。`,
    );
  }

  private assertBrowserPoseCreateCanBeReleased(config: {
    name: string;
    supportsCamera: boolean;
    supportedInputModes: string[];
    requiredMetrics: unknown;
  }) {
    if (!config.supportsCamera) {
      throw new BadRequestException('浏览器体感游戏必须启用摄像头采集。');
    }
    if (
      config.supportedInputModes.length !== 1 ||
      config.supportedInputModes[0] !== 'camera_pose'
    ) {
      throw new BadRequestException(
        '浏览器体感游戏的正式输入模式必须精确为 camera_pose。',
      );
    }
    this.assertCanonicalBrowserPoseMetricContract(
      config.requiredMetrics,
      `浏览器体感游戏 ${config.name}`,
    );
  }

  private assertCognitiveWebCreateCanBeReleased(config: {
    name: string;
    supportsCamera: boolean;
    supportedInputModes: string[];
    requiredMetrics: unknown;
  }) {
    if (config.supportsCamera) {
      throw new BadRequestException('认知训练不应启用摄像头采集。');
    }
    if (
      !config.supportedInputModes.includes('touch') &&
      !config.supportedInputModes.includes('keyboard')
    ) {
      throw new BadRequestException(
        '认知训练必须包含 touch 或 keyboard 输入模式。',
      );
    }
    this.assertRequiredMetricTypes(
      config.requiredMetrics,
      [...cognitiveWebRequiredMetricTypes],
      `认知训练 ${config.name} 缺少正式结果指标配置。`,
    );
  }

  private assertUnityCreateConfig(config: {
    supportsCamera: boolean;
    supportedInputModes: string[];
  }) {
    if (
      config.supportsCamera &&
      !config.supportedInputModes.includes('camera_pose')
    ) {
      throw new BadRequestException(
        '启用摄像头采集的 Unity 训练必须包含 camera_pose 输入模式。',
      );
    }
  }

  private validateGameContentPublishMetadata(
    dto: FormalPublishMetadataInput,
    expectedRequiredPermissions: string[],
  ) {
    const difficultyPolicy = this.requiredJsonObject(
      dto.difficultyPolicy,
      '正式训练内容必须填写 difficultyPolicy。',
    );
    const resultSchema = this.requiredJsonObject(
      dto.resultSchema,
      '正式训练内容必须填写 resultSchema。',
    );
    const dynamicDifficultyTriggers = this.validateStringArray(
      dto.dynamicDifficultyTriggers,
      'dynamicDifficultyTriggers 必须是非空字符串数组。',
    );
    for (const trigger of dynamicDifficultyTriggers) {
      if (
        !dynamicDifficultyTriggerReasons.includes(
          trigger as DynamicDifficultyTriggerReason,
        )
      ) {
        throw new BadRequestException(
          'dynamicDifficultyTriggers 包含不支持的触发原因。',
        );
      }
    }
    const requiredPermissions = this.validateStringArrayAllowEmpty(
      dto.requiredPermissions,
      '正式训练内容必须填写 requiredPermissions 数组。',
    );
    if (
      requiredPermissions.length !== expectedRequiredPermissions.length ||
      expectedRequiredPermissions.some(
        (permission) => !requiredPermissions.includes(permission),
      )
    ) {
      throw new BadRequestException(
        'requiredPermissions 与训练运行方式不一致。',
      );
    }
    const publishedStatus = this.requiredString(
      dto.publishedStatus,
      '正式训练内容必须填写 publishedStatus。',
    );
    if (publishedStatus !== 'published') {
      throw new BadRequestException(
        '正式训练内容 publishedStatus 必须为 published。',
      );
    }
    return {
      difficultyPolicy: this.jsonInput(difficultyPolicy),
      dynamicDifficultyTriggers,
      requiredPermissions,
      resultSchema: this.jsonInput(resultSchema),
      publishedStatus,
    };
  }

  private validateExistingGamePublishMetadata(
    game: GameContent,
    expectedRequiredPermissions: string[],
  ) {
    this.validateGameContentPublishMetadata(
      {
        difficultyPolicy: game.difficultyPolicy,
        dynamicDifficultyTriggers: game.dynamicDifficultyTriggers,
        requiredPermissions: game.requiredPermissions,
        resultSchema: game.resultSchema,
        publishedStatus: game.publishedStatus ?? undefined,
      },
      expectedRequiredPermissions,
    );
  }

  private assertRequiredMetricTypes(
    value: unknown,
    requiredMetricTypes: string[],
    message: string,
  ) {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(message);
    }
    const metricTypes = new Set(
      value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new BadRequestException(message);
        }
        const metric = item as Record<string, unknown>;
        return this.requiredString(metric.metricType, message);
      }),
    );
    const missingMetricTypes = requiredMetricTypes.filter(
      (metricType) => !metricTypes.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `${message} 缺少：${missingMetricTypes.join('、')}。`,
      );
    }
  }

  private assertTrainingResultSourceMatchesRuntime(
    resultSource: string,
    runtimeType: string,
  ) {
    const formalRuntimeType = this.validateFormalRuntimeType(runtimeType);
    if (resultSource !== formalRuntimeType) {
      throw new BadRequestException(
        `训练结果来源 ${resultSource} 与游戏运行时 ${formalRuntimeType} 不匹配。`,
      );
    }
  }

  private canonicalizeCognitiveSubmission(
    metricsSummary: Prisma.JsonObject,
    motionMetrics: SubmitTrainingResultDto['motionMetrics'],
  ) {
    this.assertExactCognitiveKeys(
      metricsSummary,
      cognitiveMetricsSummaryKeys,
      'metricsSummary',
    );
    const rounds = this.requiredCognitiveArray(
      metricsSummary.rounds,
      '认知训练 metricsSummary.rounds 必须是非空逐轮事实数组。',
    ).map((rawRound, index) => {
      const round = this.requiredJsonObject(
        rawRound,
        `认知训练 round 第 ${index + 1} 项必须是对象。`,
      );
      this.assertExactCognitiveKeys(round, cognitiveRoundKeys, 'round');
      const difficulty = this.requiredJsonObject(
        round.difficulty,
        `认知训练 round 第 ${index + 1} 项 difficulty 必须是对象。`,
      );
      this.assertExactCognitiveKeys(
        difficulty,
        cognitiveDifficultyKeys,
        'difficulty',
      );
      const sequence = this.requiredCognitiveArray(
        round.sequence,
        `认知训练 round 第 ${index + 1} 项 sequence 必须是数组。`,
      );
      const answers = this.requiredCognitiveArray(
        round.answers,
        `认知训练 round 第 ${index + 1} 项 answers 必须是数组。`,
      );
      return {
        id: this.requiredCognitiveCanonicalString(
          round.id,
          `round-${index + 1} round.id`,
        ),
        sequence: [...sequence],
        answers: [...answers],
        difficulty: {
          level: difficulty.level,
          sequenceLength: difficulty.sequenceLength,
          optionCount: difficulty.optionCount,
          presentationMs: difficulty.presentationMs,
        },
        difficultyLevel: round.difficultyLevel,
        presentedAtMs: round.presentedAtMs,
        answerStartedAtMs: round.answerStartedAtMs,
        completedAtMs: round.completedAtMs,
      };
    });
    const evidence = this.requiredJsonObject(
      metricsSummary.dynamicDifficultyEvidence,
      '认知训练 dynamicDifficultyEvidence 必须是对象。',
    );
    this.assertExactCognitiveKeys(
      evidence,
      cognitiveDynamicDifficultyEvidenceKeys,
      'dynamicDifficultyEvidence',
    );
    const events = this.requiredCognitiveArray(
      evidence.events,
      '认知训练 dynamicDifficultyEvidence.events 必须是数组。',
    ).map((rawEvent, index) => {
      const event = this.requiredJsonObject(
        rawEvent,
        `认知训练 event 第 ${index + 1} 项必须是对象。`,
      );
      this.assertExactCognitiveKeys(
        event,
        cognitiveDifficultyEventKeys,
        'event',
      );
      const before = this.canonicalizeCognitiveDifficultySnapshot(
        event.before,
        'before',
      );
      const after = this.canonicalizeCognitiveDifficultySnapshot(
        event.after,
        'after',
      );
      const windowMetrics = this.requiredJsonObject(
        event.windowMetrics,
        `认知训练 event 第 ${index + 1} 项 windowMetrics 必须是对象。`,
      );
      this.assertExactCognitiveKeys(
        windowMetrics,
        cognitiveWindowMetricsKeys,
        'windowMetrics',
      );
      const windowRoundIds = this.requiredCognitiveArray(
        event.windowRoundIds,
        `认知训练 event 第 ${index + 1} 项 windowRoundIds 必须是数组。`,
      ).map((roundId) =>
        this.requiredCognitiveCanonicalString(roundId, 'event.windowRoundIds'),
      );
      return {
        startingLevel: event.startingLevel,
        startingLevelSource: this.requiredCognitiveCanonicalString(
          event.startingLevelSource,
          'event.startingLevelSource',
        ),
        approvedPlanItemId: this.requiredCognitiveCanonicalString(
          event.approvedPlanItemId,
          'event.approvedPlanItemId',
        ),
        assessmentSourceId: this.requiredCognitiveCanonicalString(
          event.assessmentSourceId,
          'event.assessmentSourceId',
        ),
        triggerReason: this.requiredCognitiveCanonicalString(
          event.triggerReason,
          'event.triggerReason',
        ),
        before,
        after,
        windowRoundIds,
        windowMetrics: {
          attemptCount: windowMetrics.attemptCount,
          correctCount: windowMetrics.correctCount,
          accuracy: windowMetrics.accuracy,
          averageResponseTimeMs: windowMetrics.averageResponseTimeMs,
        },
        adjustedAt: this.requiredCognitiveCanonicalString(
          event.adjustedAt,
          'event.adjustedAt',
        ),
        runtimeFrameId: this.requiredCognitiveCanonicalString(
          event.runtimeFrameId,
          'event.runtimeFrameId',
        ),
        runtimeWindowId: this.requiredCognitiveCanonicalString(
          event.runtimeWindowId,
          'event.runtimeWindowId',
        ),
      };
    });
    const source = this.requiredCognitiveCanonicalString(
      metricsSummary.source,
      'metricsSummary.source',
    );
    const gameRunId = this.requiredCognitiveCanonicalString(
      metricsSummary.gameRunId,
      'metricsSummary.gameRunId',
    );
    const rawPayloadHash = this.requiredCognitiveCanonicalString(
      metricsSummary.rawPayloadHash,
      'metricsSummary.rawPayloadHash',
    );
    if (!/^sha256:[a-f0-9]{64}$/.test(rawPayloadHash)) {
      throw new BadRequestException(
        '认知训练 metricsSummary.rawPayloadHash 必须是精确 sha256 字符串。',
      );
    }
    if (metricsSummary.rawInputStored !== false) {
      throw new BadRequestException(
        '认知训练 metricsSummary.rawInputStored 必须精确为 false。',
      );
    }
    this.requiredCognitiveDurationSeconds(
      metricsSummary.prescribedDurationSeconds,
      'metricsSummary.prescribedDurationSeconds',
    );
    const canonicalSummary = {
      source,
      gameRunId,
      sequenceRecallRate: metricsSummary.sequenceRecallRate,
      pathCompletionRate: metricsSummary.pathCompletionRate,
      completedRoundCount: metricsSummary.completedRoundCount,
      attemptCount: metricsSummary.attemptCount,
      correctStepCount: metricsSummary.correctStepCount,
      totalStepCount: metricsSummary.totalStepCount,
      mistakeCount: metricsSummary.mistakeCount,
      rounds,
      collectionBatchId: this.requiredCognitiveCanonicalString(
        metricsSummary.collectionBatchId,
        'metricsSummary.collectionBatchId',
      ),
      gameVersion: this.requiredCognitiveCanonicalString(
        metricsSummary.gameVersion,
        'metricsSummary.gameVersion',
      ),
      protocolVersion: this.requiredCognitiveCanonicalString(
        metricsSummary.protocolVersion,
        'metricsSummary.protocolVersion',
      ),
      clientGeneratedAt: this.requiredCognitiveCanonicalString(
        metricsSummary.clientGeneratedAt,
        'metricsSummary.clientGeneratedAt',
      ),
      prescribedDurationSeconds: metricsSummary.prescribedDurationSeconds,
      difficultyAdjustmentCount: metricsSummary.difficultyAdjustmentCount,
      rawPayloadHash,
      rawInputStored: false,
      dynamicDifficultyEvidence: {
        schemaVersion: this.requiredCognitiveCanonicalString(
          evidence.schemaVersion,
          'dynamicDifficultyEvidence.schemaVersion',
        ),
        events,
      },
    } as Prisma.JsonObject;

    if (!Array.isArray(motionMetrics)) {
      throw new BadRequestException(
        '认知训练 motionMetrics 必须且只能提供两项 canonical 指标。',
      );
    }
    const canonicalMetrics = motionMetrics.map((rawMetric) => {
      const metric = this.requiredJsonObject(
        rawMetric,
        '认知训练 motionMetrics 每项必须是对象。',
      );
      this.assertExactCognitiveKeys(
        metric,
        cognitiveMotionMetricKeys,
        'motionMetrics',
      );
      const metricType = this.requiredCognitiveCanonicalString(
        metric.metricType,
        'motionMetrics.metricType',
      );
      if (
        !cognitiveWebRequiredMetricTypes.includes(
          metricType as (typeof cognitiveWebRequiredMetricTypes)[number],
        )
      ) {
        throw new BadRequestException(
          '认知训练 motionMetrics 指标集合必须精确等于两项 canonical metricType。',
        );
      }
      const rawSummary = this.requiredJsonObject(
        metric.rawSummary,
        `认知训练 ${metricType}.rawSummary 必须是对象。`,
      );
      this.assertExactCognitiveKeys(
        rawSummary,
        cognitiveRawSummaryKeys,
        'rawSummary',
      );
      return {
        metricType,
        metricValue: metric.metricValue,
        confidence: metric.confidence,
        unit: this.requiredCognitiveCanonicalString(
          metric.unit,
          'motionMetrics.unit',
        ),
        sampleCount: metric.sampleCount,
        windowStartedAt: this.requiredCognitiveCanonicalString(
          metric.windowStartedAt,
          'motionMetrics.windowStartedAt',
        ),
        windowEndedAt: this.requiredCognitiveCanonicalString(
          metric.windowEndedAt,
          'motionMetrics.windowEndedAt',
        ),
        qualityFlag: this.requiredCognitiveCanonicalString(
          metric.qualityFlag,
          'motionMetrics.qualityFlag',
        ),
        rawSummary: {
          source: this.requiredCognitiveCanonicalString(
            rawSummary.source,
            'rawSummary.source',
          ),
          gameRunId: this.requiredCognitiveCanonicalString(
            rawSummary.gameRunId,
            'rawSummary.gameRunId',
          ),
          sequenceRecallRate: rawSummary.sequenceRecallRate,
          pathCompletionRate: rawSummary.pathCompletionRate,
          completedRoundCount: rawSummary.completedRoundCount,
          attemptCount: rawSummary.attemptCount,
          correctStepCount: rawSummary.correctStepCount,
          totalStepCount: rawSummary.totalStepCount,
          mistakeCount: rawSummary.mistakeCount,
        },
      };
    });
    if (
      canonicalMetrics.length !== cognitiveWebRequiredMetricTypes.length ||
      new Set(canonicalMetrics.map((metric) => metric.metricType)).size !==
        cognitiveWebRequiredMetricTypes.length
    ) {
      const presentMetricTypes = new Set(
        canonicalMetrics.map((metric) => metric.metricType),
      );
      const missingMetricTypes = cognitiveWebRequiredMetricTypes.filter(
        (metricType) => !presentMetricTypes.has(metricType),
      );
      throw new BadRequestException(
        `认知训练 motionMetrics 必须且只能提供两项 canonical 指标；缺少：${missingMetricTypes.join('、') || '无'}。`,
      );
    }
    return {
      metricsSummary: canonicalSummary,
      motionMetrics: cognitiveWebRequiredMetricTypes.map((metricType) => {
        const metric = canonicalMetrics.find(
          (candidate) => candidate.metricType === metricType,
        );
        if (!metric) {
          throw new BadRequestException(
            '认知训练 motionMetrics 指标集合必须精确等于两项 canonical metricType。',
          );
        }
        return metric;
      }) as NonNullable<SubmitTrainingResultDto['motionMetrics']>,
    };
  }

  private canonicalizeCognitiveDifficultySnapshot(
    value: unknown,
    label: 'before' | 'after',
  ) {
    const snapshot = this.requiredJsonObject(
      value,
      `认知训练 ${label} 必须是对象。`,
    );
    this.assertExactCognitiveKeys(
      snapshot,
      cognitiveDifficultySnapshotKeys,
      label,
    );
    return {
      speed: snapshot.speed,
      complexityLevel: snapshot.complexityLevel,
      sequenceLength: snapshot.sequenceLength,
      optionCount: snapshot.optionCount,
      presentationMs: snapshot.presentationMs,
    };
  }

  private assertExactCognitiveKeys(
    value: Record<string, unknown>,
    expectedKeys: readonly string[],
    label: string,
  ) {
    const actualKeys = Object.keys(value).sort();
    const canonicalKeys = [...expectedKeys].sort();
    const missingKeys = canonicalKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(value, key),
    );
    const extraKeys = actualKeys.filter((key) => !expectedKeys.includes(key));
    if (
      actualKeys.length !== canonicalKeys.length ||
      actualKeys.some((key, index) => key !== canonicalKeys[index])
    ) {
      throw new BadRequestException(
        `认知训练 ${label} 字段必须精确匹配正式键集合，不允许额外字段；缺少：${missingKeys.join('、') || '无'}；额外：${extraKeys.join('、') || '无'}。`,
      );
    }
  }

  private requiredCognitiveArray(value: unknown, message: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private requiredCognitiveCanonicalString(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.length || value !== value.trim()) {
      throw new BadRequestException(
        `认知训练 ${label} 必须是未带首尾空白的精确 canonical 字符串。`,
      );
    }
    return value;
  }

  private buildCanonicalCognitivePersistence(context: {
    metricsSummary: Prisma.JsonObject;
    parsedMotionMetrics: ParsedTrainingMotionMetric[];
    sessionStartedAt: unknown;
    resultCompletedAt: Date;
    collectionBatchId: string;
    gameRunId: string;
    gameVersion: string;
    protocolVersion: string;
    clientGeneratedAt: Date;
    rawPayloadHash: string;
    durationSeconds: number;
  }) {
    if (
      !(context.sessionStartedAt instanceof Date) ||
      !Number.isFinite(context.sessionStartedAt.getTime())
    ) {
      throw new BadRequestException(
        '训练会话缺少有效 clientStartedAt，不能重建认知训练 canonical 结果。',
      );
    }
    const aggregates = this.recomputeCognitiveRoundAggregates(
      context.metricsSummary.rounds,
      context.sessionStartedAt.getTime(),
      context.resultCompletedAt.getTime(),
    );
    const evidence = this.requiredJsonObject(
      context.metricsSummary.dynamicDifficultyEvidence,
      '认知训练 dynamicDifficultyEvidence 必须是对象。',
    );
    const events = this.requiredCognitiveArray(
      evidence.events,
      '认知训练 dynamicDifficultyEvidence.events 必须是数组。',
    ).map((rawEvent) => {
      const event = this.requiredJsonObject(
        rawEvent,
        '认知训练 event 必须是对象。',
      );
      const before = this.requiredJsonObject(
        event.before,
        '认知训练 before 必须是对象。',
      );
      const after = this.requiredJsonObject(
        event.after,
        '认知训练 after 必须是对象。',
      );
      const windowMetrics = this.requiredJsonObject(
        event.windowMetrics,
        '认知训练 windowMetrics 必须是对象。',
      );
      return {
        startingLevel: event.startingLevel,
        startingLevelSource: event.startingLevelSource,
        approvedPlanItemId: event.approvedPlanItemId,
        assessmentSourceId: event.assessmentSourceId,
        triggerReason: event.triggerReason,
        before: {
          speed: before.speed,
          complexityLevel: before.complexityLevel,
          sequenceLength: before.sequenceLength,
          optionCount: before.optionCount,
          presentationMs: before.presentationMs,
        },
        after: {
          speed: after.speed,
          complexityLevel: after.complexityLevel,
          sequenceLength: after.sequenceLength,
          optionCount: after.optionCount,
          presentationMs: after.presentationMs,
        },
        windowRoundIds: [
          ...this.requiredCognitiveArray(
            event.windowRoundIds,
            '认知训练 event.windowRoundIds 必须是数组。',
          ),
        ],
        windowMetrics: {
          attemptCount: windowMetrics.attemptCount,
          correctCount: windowMetrics.correctCount,
          accuracy: windowMetrics.accuracy,
          averageResponseTimeMs: windowMetrics.averageResponseTimeMs,
        },
        adjustedAt: event.adjustedAt,
        runtimeFrameId: event.runtimeFrameId,
        runtimeWindowId: event.runtimeWindowId,
      };
    });
    const rawSummary = {
      source: 'cognitive_web',
      gameRunId: context.gameRunId,
      sequenceRecallRate: aggregates.sequenceRecallRate,
      pathCompletionRate: aggregates.pathCompletionRate,
      completedRoundCount: aggregates.completedRoundCount,
      attemptCount: aggregates.attemptCount,
      correctStepCount: aggregates.correctStepCount,
      totalStepCount: aggregates.totalStepCount,
      mistakeCount: aggregates.mistakeCount,
    };
    const prescribedDurationSeconds = this.requiredCognitiveDurationSeconds(
      context.metricsSummary.prescribedDurationSeconds,
      'metricsSummary.prescribedDurationSeconds',
    );
    const metricsSummary = {
      ...rawSummary,
      rounds: aggregates.rounds.map((round) => ({
        id: round.id,
        sequence: [...round.sequence],
        answers: [...round.answers],
        difficulty: {
          level: round.difficulty.level,
          sequenceLength: round.difficulty.sequenceLength,
          optionCount: round.difficulty.optionCount,
          presentationMs: round.difficulty.presentationMs,
        },
        difficultyLevel: round.difficultyLevel,
        presentedAtMs: round.presentedAtMs,
        answerStartedAtMs: round.answerStartedAtMs,
        completedAtMs: round.completedAtMs,
      })),
      collectionBatchId: context.collectionBatchId,
      gameVersion: context.gameVersion,
      protocolVersion: context.protocolVersion,
      clientGeneratedAt: context.clientGeneratedAt.toISOString(),
      prescribedDurationSeconds,
      difficultyAdjustmentCount: events.length,
      rawPayloadHash: context.rawPayloadHash,
      rawInputStored: false,
      dynamicDifficultyEvidence: {
        schemaVersion: '1.0.0',
        events,
      },
    } as Prisma.JsonObject;
    const metricByType = new Map(
      context.parsedMotionMetrics.map((metric) => [metric.metricType, metric]),
    );
    const motionMetrics = cognitiveWebRequiredMetricTypes.map((metricType) => {
      const metric = metricByType.get(metricType);
      if (!metric) {
        throw new BadRequestException(
          '认知训练 motionMetrics 指标集合必须精确等于两项 canonical metricType。',
        );
      }
      return {
        ...metric,
        metricType,
        metricValue:
          metricType === 'sequence_recall_rate'
            ? aggregates.sequenceRecallRate
            : aggregates.pathCompletionRate,
        confidence: 1,
        unit: 'ratio',
        sampleCount: aggregates.completedRoundCount,
        windowStartedAt: new Date((context.sessionStartedAt as Date).getTime()),
        windowEndedAt: new Date(context.clientGeneratedAt.getTime()),
        qualityFlag: 'valid',
        bodyPart: undefined,
        jointName: undefined,
        rawSummary: { ...rawSummary },
      };
    });
    return {
      score: aggregates.score,
      completionRate: aggregates.pathCompletionRate,
      durationSeconds: context.durationSeconds,
      reactionTimeMs: aggregates.reactionTimeMs,
      motionAccuracy: aggregates.sequenceRecallRate,
      metricsSummary,
      motionMetrics,
    };
  }

  private assertDynamicDifficultyEvidence(
    value: unknown,
    context: {
      resultSource: string;
      gameRunId: string;
      gameCode: string;
      planItemId: string;
      sessionStartedAt: unknown;
      resultCompletedAt: Date;
      runtimeConfigSnapshot: unknown;
      metricsSummary: Prisma.JsonObject;
      difficultyAdjustmentCount: unknown;
      trainingResult: SubmitTrainingResultDto;
    },
  ) {
    const evidence = this.requiredJsonObject(
      value,
      '缺少动态难度证据，不能提交正式训练结果。',
    );
    if (evidence.schemaVersion !== '1.0.0') {
      throw new BadRequestException(
        '动态难度证据 schemaVersion 必须是 1.0.0。',
      );
    }
    if (!Array.isArray(evidence.events)) {
      throw new BadRequestException('动态难度证据 events 必须是数组。');
    }
    if (context.resultSource === 'cognitive_web') {
      this.assertCognitiveDynamicDifficultyEvidence(evidence.events, context);
      return;
    }
    if (context.resultSource === 'browser_pose_canvas') {
      this.assertBrowserPoseDynamicDifficultyEvidence(evidence.events, context);
      return;
    }
    if (!evidence.events.length) {
      throw new BadRequestException('动态难度证据 events 必须是非空数组。');
    }
    const runtimeConfigSnapshot = this.requiredJsonObject(
      context.runtimeConfigSnapshot,
      '训练会话缺少服务端运行配置快照，不能校验动态难度证据。',
    );
    const expectedApprovedPlanItemId = this.requiredString(
      runtimeConfigSnapshot.approvedPlanItemId,
      '训练会话运行配置缺少 approvedPlanItemId。',
    );
    const expectedAssessmentSourceId = this.requiredString(
      runtimeConfigSnapshot.assessmentSourceId,
      '训练会话运行配置缺少 assessmentSourceId。',
    );
    const expectedStartingLevel = this.requiredNumber(
      runtimeConfigSnapshot.startingDifficultyLevel,
      '训练会话运行配置缺少 startingDifficultyLevel。',
    );
    evidence.events.forEach((rawEvent, index) => {
      const event = this.requiredJsonObject(
        rawEvent,
        `动态难度证据第 ${index + 1} 项必须是对象。`,
      );
      const startingLevel = this.requiredNumber(
        event.startingLevel,
        `动态难度证据第 ${index + 1} 项缺少 startingLevel。`,
      );
      this.assertRange(
        startingLevel,
        1,
        3,
        `动态难度证据第 ${index + 1} 项 startingLevel 必须在 1 到 3 之间。`,
      );
      if (startingLevel !== expectedStartingLevel) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 startingLevel 与训练会话运行配置不一致。`,
        );
      }
      const startingLevelSource = this.requiredString(
        event.startingLevelSource,
        `动态难度证据第 ${index + 1} 项缺少 startingLevelSource。`,
      );
      if (
        startingLevelSource !== 'clinician_approved_plan' &&
        startingLevelSource !== 'clinician_approved_assessment'
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 startingLevelSource 无效。`,
        );
      }
      const approvedPlanItemId = this.requiredString(
        event.approvedPlanItemId,
        `动态难度证据第 ${index + 1} 项缺少 approvedPlanItemId。`,
      );
      if (approvedPlanItemId !== expectedApprovedPlanItemId) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 approvedPlanItemId 与训练会话运行配置不一致。`,
        );
      }
      const assessmentSourceId = this.requiredString(
        event.assessmentSourceId,
        `动态难度证据第 ${index + 1} 项缺少 assessmentSourceId。`,
      );
      if (assessmentSourceId !== expectedAssessmentSourceId) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 assessmentSourceId 与训练会话运行配置不一致。`,
        );
      }
      const triggerReason = this.requiredString(
        event.triggerReason,
        `动态难度证据第 ${index + 1} 项缺少 triggerReason。`,
      );
      if (
        !dynamicDifficultyTriggerReasons.includes(
          triggerReason as DynamicDifficultyTriggerReason,
        )
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 triggerReason 无效。`,
        );
      }
      const before = this.validateDynamicDifficultySnapshot(
        event.before,
        index,
        'before',
      );
      const after = this.validateDynamicDifficultySnapshot(
        event.after,
        index,
        'after',
      );
      this.parseDate(
        this.requiredString(
          event.adjustedAt,
          `动态难度证据第 ${index + 1} 项缺少 adjustedAt。`,
        ),
        `动态难度证据第 ${index + 1} 项 adjustedAt 无效。`,
      );
      const runtimeFrameId = this.requiredString(
        event.runtimeFrameId,
        `动态难度证据第 ${index + 1} 项缺少 runtimeFrameId。`,
      );
      if (!runtimeFrameId.startsWith(`${context.gameRunId}:`)) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 runtimeFrameId 不属于当前 gameRunId。`,
        );
      }
      const runtimeWindowId = this.requiredString(
        event.runtimeWindowId,
        `动态难度证据第 ${index + 1} 项缺少 runtimeWindowId。`,
      );
      if (!runtimeWindowId.startsWith(`${context.gameRunId}:`)) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 runtimeWindowId 不属于当前 gameRunId。`,
        );
      }
      const unchanged =
        before.speed === after.speed &&
        before.complexityLevel === after.complexityLevel;
      if (unchanged) {
        this.requiredString(
          event.safetyClampReason,
          `动态难度证据第 ${index + 1} 项难度未变化时必须填写 safetyClampReason。`,
        );
      }
    });
  }

  private assertBrowserPoseDynamicDifficultyEvidence(
    events: unknown[],
    context: {
      gameRunId: string;
      gameCode: string;
      planItemId: string;
      sessionStartedAt: unknown;
      resultCompletedAt: Date;
      runtimeConfigSnapshot: unknown;
      metricsSummary: Prisma.JsonObject;
      difficultyAdjustmentCount: unknown;
      trainingResult: SubmitTrainingResultDto;
    },
  ) {
    if (!events.length) {
      throw new BadRequestException(
        '浏览器体感训练动态难度证据必须包含至少一个运行时事件。',
      );
    }
    const runtimeConfigSnapshot = this.requiredJsonObject(
      context.runtimeConfigSnapshot,
      '训练会话缺少服务端运行配置快照，不能校验浏览器体感动态难度证据。',
    );
    if (
      this.requiredString(
        runtimeConfigSnapshot.resultContractVersion,
        '浏览器体感训练会话运行配置缺少结果合同版本。',
      ) !== browserPoseResultContractVersion
    ) {
      throw new BadRequestException(
        `浏览器体感训练会话结果合同版本必须是 ${browserPoseResultContractVersion}。`,
      );
    }
    const expectedApprovedPlanItemId = this.requiredString(
      runtimeConfigSnapshot.approvedPlanItemId,
      '训练会话运行配置缺少 approvedPlanItemId。',
    );
    if (expectedApprovedPlanItemId !== context.planItemId) {
      throw new BadRequestException(
        '浏览器体感训练会话运行配置 approvedPlanItemId 与当前训练项目不一致。',
      );
    }
    const expectedAssessmentSourceId = this.requiredString(
      runtimeConfigSnapshot.assessmentSourceId,
      '训练会话运行配置缺少 assessmentSourceId。',
    );
    if (
      this.requiredString(
        runtimeConfigSnapshot.startingLevelSource,
        '训练会话运行配置缺少 startingLevelSource。',
      ) !== 'clinician_approved_plan'
    ) {
      throw new BadRequestException(
        '浏览器体感训练会话起始等级必须来自医师已批准方案。',
      );
    }
    const expectedStartingLevel = this.requiredInteger(
      runtimeConfigSnapshot.startingDifficultyLevel,
      '训练会话运行配置 startingDifficultyLevel 必须是 1 到 3 的整数。',
    );
    if (expectedStartingLevel < 1 || expectedStartingLevel > 3) {
      throw new BadRequestException(
        '训练会话运行配置 startingDifficultyLevel 必须是 1 到 3 的整数。',
      );
    }
    if (
      !(context.sessionStartedAt instanceof Date) ||
      !Number.isFinite(context.sessionStartedAt.getTime())
    ) {
      throw new BadRequestException(
        '浏览器体感训练会话缺少有效 clientStartedAt，不能校验动态难度证据。',
      );
    }
    if (
      context.resultCompletedAt.getTime() < context.sessionStartedAt.getTime()
    ) {
      throw new BadRequestException(
        '浏览器体感训练结果完成时间不能早于训练会话开始时间。',
      );
    }
    const adjustmentCount = this.requiredInteger(
      context.difficultyAdjustmentCount,
      '浏览器体感训练结果 difficultyAdjustmentCount 必须是正整数。',
    );
    if (adjustmentCount <= 0 || adjustmentCount !== events.length) {
      throw new BadRequestException(
        '浏览器体感训练结果 difficultyAdjustmentCount 与动态难度事件数量不一致。',
      );
    }
    const gameRuntime =
      browserPoseRuntimeGames[
        context.gameCode as keyof typeof browserPoseRuntimeGames
      ];
    if (!gameRuntime) {
      throw new BadRequestException(
        '浏览器体感训练内容没有受支持的正式运行时参数，不能校验动态难度证据。',
      );
    }

    let expectedBefore = this.browserPoseDifficultyParameters(
      expectedStartingLevel,
      gameRuntime,
    );
    let previousWindowEndedAt = new Date(context.sessionStartedAt.getTime());
    events.forEach((rawEvent, index) => {
      const event = this.requiredJsonObject(
        rawEvent,
        `浏览器体感动态难度证据第 ${index + 1} 项必须是对象。`,
      );
      const expectedEventKeys = Object.prototype.hasOwnProperty.call(
        event,
        'safetyClampReason',
      )
        ? browserPoseDifficultyEventKeys
        : browserPoseDifficultyEventKeys.filter(
            (key) => key !== 'safetyClampReason',
          );
      this.assertExactBrowserPoseKeys(
        event,
        expectedEventKeys,
        `动态难度证据第 ${index + 1} 项`,
      );
      const startingLevel = this.requiredInteger(
        event.startingLevel,
        `动态难度证据第 ${index + 1} 项 startingLevel 必须是整数。`,
      );
      if (startingLevel !== expectedStartingLevel) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 startingLevel 与训练会话运行配置不一致。`,
        );
      }
      if (
        this.requiredString(
          event.startingLevelSource,
          `动态难度证据第 ${index + 1} 项缺少 startingLevelSource。`,
        ) !== 'clinician_approved_plan'
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 startingLevelSource 必须是 clinician_approved_plan。`,
        );
      }
      if (
        this.requiredString(
          event.approvedPlanItemId,
          `动态难度证据第 ${index + 1} 项缺少 approvedPlanItemId。`,
        ) !== expectedApprovedPlanItemId ||
        this.requiredString(
          event.assessmentSourceId,
          `动态难度证据第 ${index + 1} 项缺少 assessmentSourceId。`,
        ) !== expectedAssessmentSourceId
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项与训练会话批准方案或评估来源不一致。`,
        );
      }
      const before = this.assertBrowserPoseDifficultySnapshot(
        event.before,
        expectedBefore,
        index,
        'before',
      );
      const window = this.assertBrowserPoseDifficultyWindow(
        event.metricsWindow,
        index,
      );
      if (
        window.windowStartedAt.getTime() !== previousWindowEndedAt.getTime()
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项的指标窗口必须与前一窗口连续，首项必须从 clientStartedAt 开始。`,
        );
      }
      if (
        window.windowEndedAt.getTime() > context.resultCompletedAt.getTime()
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项的指标窗口不能晚于结果完成时间。`,
        );
      }
      const adjustedAt = this.requiredBrowserPoseCanonicalUtcDate(
        event.adjustedAt,
        `动态难度证据第 ${index + 1} 项 adjustedAt`,
      );
      if (adjustedAt.getTime() !== window.windowEndedAt.getTime()) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 adjustedAt 必须精确等于指标窗口结束时间。`,
        );
      }
      const expectedTriggerReason = this.browserPoseTriggerReason(window);
      if (
        this.requiredString(
          event.triggerReason,
          `动态难度证据第 ${index + 1} 项缺少 triggerReason。`,
        ) !== expectedTriggerReason
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项 triggerReason 与真实指标窗口不一致。`,
        );
      }
      const expectedAfter = this.browserPoseDifficultyParameters(
        this.browserPoseDifficultyLevelAfter(
          before.complexityLevel,
          expectedTriggerReason,
        ),
        gameRuntime,
      );
      this.assertBrowserPoseDifficultySnapshot(
        event.after,
        expectedAfter,
        index,
        'after',
      );
      const isClamped =
        expectedAfter.complexityLevel === before.complexityLevel;
      if (isClamped) {
        const expectedClampReason = this.browserPoseSafetyClampReason(
          before.complexityLevel,
          expectedTriggerReason,
        );
        if (
          this.requiredString(
            event.safetyClampReason,
            `动态难度证据第 ${index + 1} 项难度未变化时必须填写 safetyClampReason。`,
          ) !== expectedClampReason
        ) {
          throw new BadRequestException(
            `动态难度证据第 ${index + 1} 项 safetyClampReason 与真实安全限制不一致。`,
          );
        }
      } else if (
        Object.prototype.hasOwnProperty.call(event, 'safetyClampReason')
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${index + 1} 项难度已变化时不能包含 safetyClampReason。`,
        );
      }
      this.assertBrowserPoseRuntimeIdentifiers(event, index, context.gameRunId);
      expectedBefore = expectedAfter;
      previousWindowEndedAt = window.windowEndedAt;
    });
  }

  private assertCognitiveDynamicDifficultyEvidence(
    events: unknown[],
    context: {
      gameRunId: string;
      planItemId: string;
      sessionStartedAt: unknown;
      resultCompletedAt: Date;
      runtimeConfigSnapshot: unknown;
      metricsSummary: Prisma.JsonObject;
      difficultyAdjustmentCount: unknown;
      trainingResult: SubmitTrainingResultDto;
    },
  ) {
    const runtimeConfigSnapshot = this.requiredJsonObject(
      context.runtimeConfigSnapshot,
      '训练会话缺少服务端运行配置快照，不能校验认知动态难度证据。',
    );
    const expectedApprovedPlanItemId = this.requiredString(
      runtimeConfigSnapshot.approvedPlanItemId,
      '训练会话运行配置缺少 approvedPlanItemId。',
    );
    if (expectedApprovedPlanItemId !== context.planItemId) {
      throw new BadRequestException(
        '训练会话运行配置 approvedPlanItemId 与当前训练项目不一致。',
      );
    }
    const expectedAssessmentSourceId = this.requiredString(
      runtimeConfigSnapshot.assessmentSourceId,
      '训练会话运行配置缺少 assessmentSourceId。',
    );
    const expectedStartingLevelSource = this.requiredString(
      runtimeConfigSnapshot.startingLevelSource,
      '训练会话运行配置缺少 startingLevelSource。',
    );
    if (
      expectedStartingLevelSource !== 'clinician_approved_plan' &&
      expectedStartingLevelSource !== 'clinician_approved_assessment'
    ) {
      throw new BadRequestException(
        '训练会话运行配置 startingLevelSource 无效。',
      );
    }
    const expectedStartingLevel = this.requiredCognitiveEvidenceInteger(
      runtimeConfigSnapshot.startingDifficultyLevel,
      '训练会话运行配置 startingDifficultyLevel 必须是 1 到 3 的整数。',
    );
    if (expectedStartingLevel < 1 || expectedStartingLevel > 3) {
      throw new BadRequestException(
        '训练会话运行配置 startingDifficultyLevel 必须是 1 到 3 的整数。',
      );
    }
    const startingLadderIndex =
      expectedStartingLevel === 1 ? 1 : expectedStartingLevel === 2 ? 2 : 3;
    const sessionStartedAt = context.sessionStartedAt;
    if (
      !(sessionStartedAt instanceof Date) ||
      !Number.isFinite(sessionStartedAt.getTime())
    ) {
      throw new BadRequestException(
        '训练会话缺少有效 clientStartedAt，不能校验认知动态难度证据。',
      );
    }
    if (context.resultCompletedAt.getTime() < sessionStartedAt.getTime()) {
      throw new BadRequestException(
        '认知训练结果完成时间不能早于训练会话开始时间。',
      );
    }
    const roundAggregates = this.recomputeCognitiveRoundAggregates(
      context.metricsSummary.rounds,
      sessionStartedAt.getTime(),
      context.resultCompletedAt.getTime(),
    );

    const adjustmentCount = this.requiredCognitiveEvidenceInteger(
      context.difficultyAdjustmentCount,
      '认知训练结果 difficultyAdjustmentCount 必须是非负整数。',
    );
    if (adjustmentCount < 0 || adjustmentCount !== events.length) {
      throw new BadRequestException(
        '认知训练结果 difficultyAdjustmentCount 与动态难度事件数量不一致。',
      );
    }
    const completedRoundCount = this.requiredCognitiveEvidenceInteger(
      context.metricsSummary.completedRoundCount,
      '认知训练结果 completedRoundCount 必须是正整数。',
    );
    if (completedRoundCount <= 0) {
      throw new BadRequestException(
        '认知训练结果 completedRoundCount 必须是正整数。',
      );
    }
    const attemptCount = this.requiredCognitiveEvidenceInteger(
      context.metricsSummary.attemptCount,
      '认知训练结果 attemptCount 必须是正整数。',
    );
    const correctStepCount = this.requiredCognitiveEvidenceInteger(
      context.metricsSummary.correctStepCount,
      '认知训练结果 correctStepCount 必须是非负整数。',
    );
    const totalStepCount = this.requiredCognitiveEvidenceInteger(
      context.metricsSummary.totalStepCount,
      '认知训练结果 totalStepCount 必须是正整数。',
    );
    const mistakeCount = this.requiredCognitiveEvidenceInteger(
      context.metricsSummary.mistakeCount,
      '认知训练结果 mistakeCount 必须是非负整数。',
    );
    if (
      completedRoundCount !== roundAggregates.completedRoundCount ||
      attemptCount !== roundAggregates.attemptCount ||
      correctStepCount !== roundAggregates.correctStepCount ||
      totalStepCount !== roundAggregates.totalStepCount ||
      mistakeCount !== roundAggregates.mistakeCount
    ) {
      throw new BadRequestException(
        '认知训练结果汇总计数与逐轮 sequence/answers 作答事实不一致。',
      );
    }
    this.assertCognitiveDerivedNumber(
      context.metricsSummary.sequenceRecallRate,
      roundAggregates.sequenceRecallRate,
      'metricsSummary.sequenceRecallRate',
    );
    this.assertCognitiveDerivedNumber(
      context.metricsSummary.pathCompletionRate,
      roundAggregates.pathCompletionRate,
      'metricsSummary.pathCompletionRate',
    );
    this.assertCognitiveDerivedNumber(
      context.trainingResult.score,
      roundAggregates.score,
      'score',
    );
    this.assertCognitiveDerivedNumber(
      context.trainingResult.completionRate,
      roundAggregates.pathCompletionRate,
      'completionRate',
    );
    this.assertCognitiveDerivedNumber(
      context.trainingResult.motionAccuracy,
      roundAggregates.sequenceRecallRate,
      'motionAccuracy',
    );
    this.assertCognitiveDerivedNumber(
      context.trainingResult.reactionTimeMs,
      roundAggregates.reactionTimeMs,
      'reactionTimeMs',
    );
    this.assertCognitiveMotionMetrics(
      context.trainingResult.motionMetrics,
      context.gameRunId,
      roundAggregates,
    );
    if (
      attemptCount <= 0 ||
      totalStepCount <= 0 ||
      correctStepCount < 0 ||
      mistakeCount < 0 ||
      totalStepCount !== attemptCount ||
      correctStepCount + mistakeCount !== attemptCount
    ) {
      throw new BadRequestException(
        '认知训练结果 attemptCount、correctStepCount、totalStepCount 与 mistakeCount 不一致。',
      );
    }

    this.assertCognitiveRoundDifficultyChain(events, roundAggregates.rounds, {
      gameRunId: context.gameRunId,
      expectedApprovedPlanItemId,
      expectedAssessmentSourceId,
      expectedStartingLevel,
      expectedStartingLevelSource,
      startingLadderIndex,
    });
  }

  private assertCognitiveRoundDifficultyChain(
    events: unknown[],
    rounds: CognitiveRoundEvidence[],
    context: {
      gameRunId: string;
      expectedApprovedPlanItemId: string;
      expectedAssessmentSourceId: string;
      expectedStartingLevel: number;
      expectedStartingLevelSource: string;
      startingLadderIndex: number;
    },
  ) {
    if (rounds[0]?.difficultyLadderIndex !== context.startingLadderIndex) {
      throw new BadRequestException(
        '认知训练首轮 difficulty 与服务端 runtimeConfigSnapshot 起始难度不一致。',
      );
    }
    const eventByRoundIndex = new Map<number, true>();
    let previousRoundIndex = -1;
    let previousAdjustedAtMs = -1;

    events.forEach((rawEvent, eventIndex) => {
      const event = this.requiredJsonObject(
        rawEvent,
        `认知动态难度证据第 ${eventIndex + 1} 项必须是对象。`,
      );
      const startingLevel = this.requiredCognitiveEvidenceInteger(
        event.startingLevel,
        `认知动态难度证据第 ${eventIndex + 1} 项 startingLevel 必须是整数。`,
      );
      const startingLevelSource = this.requiredString(
        event.startingLevelSource,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 startingLevelSource。`,
      );
      const approvedPlanItemId = this.requiredString(
        event.approvedPlanItemId,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 approvedPlanItemId。`,
      );
      const assessmentSourceId = this.requiredString(
        event.assessmentSourceId,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 assessmentSourceId。`,
      );
      if (startingLevel !== context.expectedStartingLevel) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 startingLevel 与服务端会话不一致。`,
        );
      }
      if (startingLevelSource !== context.expectedStartingLevelSource) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 startingLevelSource 与服务端会话不一致。`,
        );
      }
      if (approvedPlanItemId !== context.expectedApprovedPlanItemId) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 approvedPlanItemId 与服务端会话不一致。`,
        );
      }
      if (assessmentSourceId !== context.expectedAssessmentSourceId) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 assessmentSourceId 与服务端会话不一致。`,
        );
      }
      if (
        !Array.isArray(event.windowRoundIds) ||
        event.windowRoundIds.length !== 1
      ) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 windowRoundIds 必须只包含一个轮次。`,
        );
      }
      const roundId = this.requiredString(
        event.windowRoundIds[0],
        `认知动态难度证据第 ${eventIndex + 1} 项 windowRoundIds 轮次无效。`,
      );
      const roundIndex = rounds.findIndex((round) => round.id === roundId);
      if (
        roundIndex < 0 ||
        roundIndex <= previousRoundIndex ||
        roundIndex >= rounds.length - 1 ||
        eventByRoundIndex.has(roundIndex)
      ) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项窗口轮次不存在、重复、乱序或没有后续完成轮次。`,
        );
      }
      const round = rounds[roundIndex];
      const nextRound = rounds[roundIndex + 1];
      const runtimeFrameId = this.requiredString(
        event.runtimeFrameId,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 runtimeFrameId。`,
      );
      const runtimeWindowId = this.requiredString(
        event.runtimeWindowId,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 runtimeWindowId。`,
      );
      if (
        runtimeFrameId !== `${context.gameRunId}:cognitive-round-${round.id}` ||
        runtimeWindowId !==
          `${context.gameRunId}:rounds:${round.id}-${round.id}`
      ) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 runtimeFrameId/runtimeWindowId 与真实轮次不一致。`,
        );
      }
      const before = this.validateCognitiveDifficultySnapshot(
        event.before,
        eventIndex,
        'before',
      );
      if (before.ladderIndex !== round.difficultyLadderIndex) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 before 与真实轮次 difficulty 不一致。`,
        );
      }
      const expectedMetrics = this.cognitiveWindowMetrics(round);
      const windowMetrics = this.requiredJsonObject(
        event.windowMetrics,
        `认知动态难度证据第 ${eventIndex + 1} 项 windowMetrics 必须是对象。`,
      );
      const windowAttemptCount = this.requiredCognitiveEvidenceInteger(
        windowMetrics.attemptCount,
        `认知动态难度证据第 ${eventIndex + 1} 项 windowMetrics.attemptCount 必须是整数。`,
      );
      const windowCorrectCount = this.requiredCognitiveEvidenceInteger(
        windowMetrics.correctCount,
        `认知动态难度证据第 ${eventIndex + 1} 项 windowMetrics.correctCount 必须是整数。`,
      );
      const windowAccuracy = this.requiredCognitiveEvidenceNumber(
        windowMetrics.accuracy,
        `认知动态难度证据第 ${eventIndex + 1} 项 windowMetrics.accuracy 无效。`,
      );
      const windowAverageResponseTimeMs = this.requiredCognitiveEvidenceNumber(
        windowMetrics.averageResponseTimeMs,
        `认知动态难度证据第 ${eventIndex + 1} 项 windowMetrics.averageResponseTimeMs 无效。`,
      );
      if (
        windowAttemptCount !== expectedMetrics.attemptCount ||
        windowCorrectCount !== expectedMetrics.correctCount ||
        windowAccuracy !== expectedMetrics.accuracy ||
        windowAverageResponseTimeMs !== expectedMetrics.averageResponseTimeMs
      ) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 windowMetrics 与 windowRoundIds 指向的真实轮次不一致。`,
        );
      }
      const expectedTriggerReason =
        this.cognitiveTriggerReason(expectedMetrics);
      const triggerReason = this.requiredString(
        event.triggerReason,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 triggerReason。`,
      );
      if (triggerReason !== expectedTriggerReason) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 triggerReason 与真实轮次重算结果不一致。`,
        );
      }
      const expectedAfterLadderIndex =
        round.difficultyLadderIndex +
        (expectedTriggerReason === 'accuracy_high' ? 1 : -1);
      if (!cognitiveDifficultyLadder[expectedAfterLadderIndex]) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项声称了边界难度下不存在的调整。`,
        );
      }
      const after = this.validateCognitiveDifficultySnapshot(
        event.after,
        eventIndex,
        'after',
      );
      if (
        after.ladderIndex !== expectedAfterLadderIndex ||
        nextRound.difficultyLadderIndex !== expectedAfterLadderIndex
      ) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 after 与真实连续难度链的下一轮 difficulty 不一致。`,
        );
      }
      const adjustedAtText = this.requiredString(
        event.adjustedAt,
        `认知动态难度证据第 ${eventIndex + 1} 项缺少 adjustedAt。`,
      );
      const adjustedAt = this.parseDate(
        adjustedAtText,
        `认知动态难度证据第 ${eventIndex + 1} 项 adjustedAt 无效。`,
      );
      const adjustedAtMs = adjustedAt.getTime();
      if (
        adjustedAt.toISOString() !== adjustedAtText ||
        adjustedAtMs <= previousAdjustedAtMs ||
        adjustedAtMs < round.presentedAtMs ||
        adjustedAtMs > round.completedAtMs
      ) {
        throw new BadRequestException(
          `认知动态难度证据第 ${eventIndex + 1} 项 adjustedAt 必须位于 windowRoundIds 指向的真实轮次时间内且顺序有效。`,
        );
      }
      eventByRoundIndex.set(roundIndex, true);
      previousRoundIndex = roundIndex;
      previousAdjustedAtMs = adjustedAtMs;
    });

    for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
      const round = rounds[roundIndex];
      const nextRound = rounds[roundIndex + 1];
      const triggerReason = this.cognitiveTriggerReason(
        this.cognitiveWindowMetrics(round),
      );
      const expectedAfterLadderIndex =
        round.difficultyLadderIndex +
        (triggerReason === 'accuracy_high' ? 1 : -1);
      const adjustmentExists = Boolean(
        cognitiveDifficultyLadder[expectedAfterLadderIndex],
      );
      const hasEvent = eventByRoundIndex.has(roundIndex);
      if (adjustmentExists) {
        if (
          !hasEvent ||
          nextRound.difficultyLadderIndex !== expectedAfterLadderIndex
        ) {
          throw new BadRequestException(
            '认知动态难度事件缺失，或后续真实轮次未应用服务端重算出的连续难度调整。',
          );
        }
      } else if (
        hasEvent ||
        nextRound.difficultyLadderIndex !== round.difficultyLadderIndex
      ) {
        throw new BadRequestException(
          '认知动态难度边界轮次包含伪造 event 或后续真实轮次发生难度漂移。',
        );
      }
    }
  }

  private cognitiveWindowMetrics(round: CognitiveRoundEvidence) {
    const attemptCount = round.answers.length;
    const correctCount = round.sequence.reduce(
      (count, expected, index) =>
        count + (round.answers[index] === expected ? 1 : 0),
      0,
    );
    return {
      attemptCount,
      correctCount,
      accuracy: correctCount / attemptCount,
      averageResponseTimeMs:
        (round.completedAtMs - round.answerStartedAtMs) / attemptCount,
    };
  }

  private cognitiveTriggerReason(metrics: {
    accuracy: number;
    averageResponseTimeMs: number;
  }) {
    if (metrics.averageResponseTimeMs > 2500) return 'reaction_slow';
    return metrics.accuracy >= 0.8 ? 'accuracy_high' : 'accuracy_low';
  }

  private recomputeCognitiveRoundAggregates(
    value: unknown,
    sessionStartedAtMs: number,
    resultCompletedAtMs: number,
  ) {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(
        '认知训练结果 metricsSummary.rounds 必须是非空逐轮事实数组。',
      );
    }
    let attemptCount = 0;
    let correctStepCount = 0;
    let totalStepCount = 0;
    let totalRoundResponseTimeMs = 0;
    const rounds: CognitiveRoundEvidence[] = [];
    value.forEach((rawRound, index) => {
      const round = this.requiredJsonObject(
        rawRound,
        `认知训练结果 rounds 第 ${index + 1} 项必须是对象。`,
      );
      const id = this.requiredString(
        round.id,
        `认知训练结果 rounds 第 ${index + 1} 项 id 必须是非空字符串。`,
      );
      const expectedId = `round-${index + 1}`;
      if (round.id !== expectedId) {
        throw new BadRequestException(
          `认知训练结果 rounds 第 ${index + 1} 项 id 必须连续且等于 ${expectedId}，不能重复或跳号。`,
        );
      }
      const sequence = this.requiredUniqueCognitiveStringArray(
        round.sequence,
        `认知训练结果 rounds 第 ${index + 1} 项 sequence`,
      );
      const answers = this.requiredUniqueCognitiveStringArray(
        round.answers,
        `认知训练结果 rounds 第 ${index + 1} 项 answers`,
      );
      const difficulty = this.requiredJsonObject(
        round.difficulty,
        `认知训练结果 rounds 第 ${index + 1} 项 difficulty 必须是对象。`,
      );
      const difficultyLevel = this.requiredCognitiveEvidenceInteger(
        round.difficultyLevel,
        `认知训练结果 rounds 第 ${index + 1} 项 difficultyLevel 必须是整数。`,
      );
      const level = this.requiredCognitiveEvidenceInteger(
        difficulty.level,
        `认知训练结果 rounds 第 ${index + 1} 项 difficulty.level 必须是整数。`,
      );
      const sequenceLength = this.requiredCognitiveEvidenceInteger(
        difficulty.sequenceLength,
        `认知训练结果 rounds 第 ${index + 1} 项 difficulty.sequenceLength 必须是整数。`,
      );
      const optionCount = this.requiredCognitiveEvidenceInteger(
        difficulty.optionCount,
        `认知训练结果 rounds 第 ${index + 1} 项 difficulty.optionCount 必须是整数。`,
      );
      const presentationMs = this.requiredCognitiveEvidenceInteger(
        difficulty.presentationMs,
        `认知训练结果 rounds 第 ${index + 1} 项 difficulty.presentationMs 必须是整数。`,
      );
      const difficultyLadderIndex = cognitiveDifficultyLadder.findIndex(
        (rule) =>
          rule.level === level &&
          rule.sequenceLength === sequenceLength &&
          rule.optionCount === optionCount &&
          rule.presentationMs === presentationMs,
      );
      const difficultyRule = cognitiveDifficultyLadder[difficultyLadderIndex];
      if (!difficultyRule) {
        throw new BadRequestException(
          `认知训练结果 rounds 第 ${index + 1} 项 difficulty 与服务端难度阶梯不一致。`,
        );
      }
      if (difficultyLevel !== level) {
        throw new BadRequestException(
          `认知训练结果 rounds 第 ${index + 1} 项 difficultyLevel 与 difficulty.level 不一致。`,
        );
      }
      if (
        sequence.length !== difficultyRule.sequenceLength ||
        answers.length !== sequence.length
      ) {
        throw new BadRequestException(
          `认知训练结果 rounds 第 ${index + 1} 项 answers.length、sequence.length 与 difficulty.sequenceLength 必须一致。`,
        );
      }
      const presentedAtMs = this.requiredCognitiveEvidenceInteger(
        round.presentedAtMs,
        `认知训练结果 rounds 第 ${index + 1} 项 presentedAtMs 必须是整数时间戳。`,
      );
      const answerStartedAtMs = this.requiredCognitiveEvidenceInteger(
        round.answerStartedAtMs,
        `认知训练结果 rounds 第 ${index + 1} 项 answerStartedAtMs 必须是整数时间戳。`,
      );
      const completedAtMs = this.requiredCognitiveEvidenceInteger(
        round.completedAtMs,
        `认知训练结果 rounds 第 ${index + 1} 项 completedAtMs 必须是整数时间戳。`,
      );
      const previousRound = rounds[index - 1];
      if (
        presentedAtMs < sessionStartedAtMs ||
        presentedAtMs > answerStartedAtMs ||
        answerStartedAtMs > completedAtMs ||
        completedAtMs > resultCompletedAtMs ||
        (previousRound !== undefined &&
          presentedAtMs < previousRound.completedAtMs)
      ) {
        throw new BadRequestException(
          `认知训练结果 rounds 第 ${index + 1} 项时间必须位于会话窗口内、有序且不得与前一轮重叠。`,
        );
      }
      attemptCount += answers.length;
      totalStepCount += sequence.length;
      correctStepCount += sequence.reduce(
        (count, expected, answerIndex) =>
          count + (answers[answerIndex] === expected ? 1 : 0),
        0,
      );
      totalRoundResponseTimeMs +=
        (completedAtMs - answerStartedAtMs) / answers.length;
      rounds.push({
        id,
        sequence,
        answers,
        difficulty: difficultyRule,
        difficultyLadderIndex,
        difficultyLevel,
        presentedAtMs,
        answerStartedAtMs,
        completedAtMs,
      });
    });
    const completedRoundCount = rounds.length;
    const mistakeCount = attemptCount - correctStepCount;
    const rawSequenceRecallRate = correctStepCount / attemptCount;
    const rawPathCompletionRate = completedRoundCount / rounds.length;
    const sequenceRecallRate = Number(
      Math.min(1, Math.max(0, rawSequenceRecallRate)).toFixed(3),
    );
    const pathCompletionRate = Number(
      Math.min(1, Math.max(0, rawPathCompletionRate)).toFixed(3),
    );
    return {
      rounds,
      completedRoundCount,
      attemptCount,
      correctStepCount,
      totalStepCount,
      mistakeCount,
      sequenceRecallRate,
      pathCompletionRate,
      reactionTimeMs: Math.round(totalRoundResponseTimeMs / rounds.length),
      score: Math.round(
        Math.min(
          100,
          Math.max(0, rawSequenceRecallRate * 80 + rawPathCompletionRate * 20),
        ),
      ),
    };
  }

  private requiredUniqueCognitiveStringArray(value: unknown, label: string) {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(`${label} 必须是非空字符串数组。`);
    }
    const strings = value.map((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException(`${label} 必须是非空字符串数组。`);
      }
      return item;
    });
    if (new Set(strings).size !== strings.length) {
      throw new BadRequestException(`${label} 的值必须唯一，不能重复。`);
    }
    return strings;
  }

  private assertCognitiveDerivedNumber(
    value: unknown,
    expected: number,
    label: string,
  ) {
    const actual = this.requiredCognitiveEvidenceNumber(
      value,
      `认知训练结果 ${label} 必须是有限数字。`,
    );
    if (actual !== expected) {
      throw new BadRequestException(
        `认知训练结果 ${label} 与逐轮事实服务端重算值不一致。`,
      );
    }
  }

  private assertCognitiveMotionMetrics(
    value: SubmitTrainingResultDto['motionMetrics'],
    gameRunId: string,
    aggregates: ReturnType<AppService['recomputeCognitiveRoundAggregates']>,
  ) {
    if (
      !Array.isArray(value) ||
      value.length !== cognitiveWebRequiredMetricTypes.length
    ) {
      throw new BadRequestException(
        '认知训练 motionMetrics 必须且只能提供两项 canonical 指标。',
      );
    }
    const expectedMetrics = [
      {
        metricType: 'sequence_recall_rate',
        metricValue: aggregates.sequenceRecallRate,
      },
      {
        metricType: 'path_completion_rate',
        metricValue: aggregates.pathCompletionRate,
      },
    ];
    for (const expectedMetric of expectedMetrics) {
      const matchingMetrics = value.filter(
        (metric) => metric.metricType === expectedMetric.metricType,
      );
      if (matchingMetrics.length !== 1) {
        throw new BadRequestException(
          `认知训练指标 ${expectedMetric.metricType} 必须且只能提供一次。`,
        );
      }
      const metric = matchingMetrics[0];
      this.assertCognitiveDerivedNumber(
        metric.metricValue,
        expectedMetric.metricValue,
        `${expectedMetric.metricType}.metricValue`,
      );
      const sampleCount = this.requiredCognitiveEvidenceInteger(
        metric.sampleCount,
        `认知训练指标 ${expectedMetric.metricType}.sampleCount 必须是整数。`,
      );
      if (sampleCount !== aggregates.completedRoundCount) {
        throw new BadRequestException(
          `认知训练指标 ${expectedMetric.metricType}.sampleCount 与逐轮事实不一致。`,
        );
      }
      if (
        metric.confidence !== 1 ||
        metric.unit !== 'ratio' ||
        metric.qualityFlag !== 'valid'
      ) {
        throw new BadRequestException(
          `认知训练指标 ${expectedMetric.metricType} 的 confidence、unit、qualityFlag 与正式规则不一致。`,
        );
      }
      const rawSummary = this.requiredJsonObject(
        metric.rawSummary,
        `认知训练指标 ${expectedMetric.metricType}.rawSummary 必须是对象。`,
      );
      const rawSource = this.requiredString(
        rawSummary.source,
        `认知训练指标 ${expectedMetric.metricType}.rawSummary.source 缺失。`,
      );
      const rawGameRunId = this.requiredString(
        rawSummary.gameRunId,
        `认知训练指标 ${expectedMetric.metricType}.rawSummary.gameRunId 缺失。`,
      );
      if (rawSource !== 'cognitive_web' || rawGameRunId !== gameRunId) {
        throw new BadRequestException(
          `认知训练指标 ${expectedMetric.metricType}.rawSummary 身份与当前训练不一致。`,
        );
      }
      const rawSummaryFields = [
        ['sequenceRecallRate', aggregates.sequenceRecallRate],
        ['pathCompletionRate', aggregates.pathCompletionRate],
        ['completedRoundCount', aggregates.completedRoundCount],
        ['attemptCount', aggregates.attemptCount],
        ['correctStepCount', aggregates.correctStepCount],
        ['totalStepCount', aggregates.totalStepCount],
        ['mistakeCount', aggregates.mistakeCount],
      ] as const;
      for (const [field, expected] of rawSummaryFields) {
        this.assertCognitiveDerivedNumber(
          rawSummary[field],
          expected,
          `${expectedMetric.metricType}.rawSummary.${field}`,
        );
      }
    }
  }

  private validateCognitiveDifficultySnapshot(
    value: unknown,
    eventIndex: number,
    label: 'before' | 'after',
  ) {
    const snapshot = this.requiredJsonObject(
      value,
      `认知动态难度证据第 ${eventIndex + 1} 项 ${label} 必须是对象。`,
    );
    const speed = this.requiredCognitiveEvidenceNumber(
      snapshot.speed,
      `认知动态难度证据第 ${eventIndex + 1} 项 ${label}.speed 无效。`,
    );
    const complexityLevel = this.requiredCognitiveEvidenceInteger(
      snapshot.complexityLevel,
      `认知动态难度证据第 ${eventIndex + 1} 项 ${label}.complexityLevel 无效。`,
    );
    const sequenceLength = this.requiredCognitiveEvidenceInteger(
      snapshot.sequenceLength,
      `认知动态难度证据第 ${eventIndex + 1} 项 ${label}.sequenceLength 无效。`,
    );
    const optionCount = this.requiredCognitiveEvidenceInteger(
      snapshot.optionCount,
      `认知动态难度证据第 ${eventIndex + 1} 项 ${label}.optionCount 无效。`,
    );
    const presentationMs = this.requiredCognitiveEvidenceInteger(
      snapshot.presentationMs,
      `认知动态难度证据第 ${eventIndex + 1} 项 ${label}.presentationMs 无效。`,
    );
    const ladderIndex = cognitiveDifficultyLadder.findIndex(
      (rule) =>
        complexityLevel === rule.level &&
        sequenceLength === rule.sequenceLength &&
        optionCount === rule.optionCount &&
        presentationMs === rule.presentationMs &&
        speed === Number((3200 / rule.presentationMs).toFixed(3)),
    );
    if (ladderIndex < 0) {
      throw new BadRequestException(
        `认知动态难度证据第 ${eventIndex + 1} 项 ${label} 的 speed、complexityLevel、sequenceLength、optionCount、presentationMs 与服务端难度规则不一致。`,
      );
    }
    const rule = cognitiveDifficultyLadder[ladderIndex];
    if (!rule) {
      throw new BadRequestException('认知动态难度规则不存在。');
    }
    return { ladderIndex, rule };
  }

  private requiredCognitiveEvidenceNumber(value: unknown, message: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private requiredCognitiveDurationSeconds(
    value: unknown,
    label = 'durationSeconds',
  ) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new BadRequestException(
        `认知训练 ${label} 必须是有限且大于 0 的正整数。`,
      );
    }
    return value;
  }

  private requiredCognitiveSessionStartedAt(value: unknown) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new BadRequestException(
        '认知训练会话缺少有效 clientStartedAt，不能绑定动作指标窗口。',
      );
    }
    return new Date(value.getTime());
  }

  private requiredCognitiveEvidenceInteger(value: unknown, message: string) {
    const numberValue = this.requiredCognitiveEvidenceNumber(value, message);
    if (!Number.isInteger(numberValue)) {
      throw new BadRequestException(message);
    }
    return numberValue;
  }

  private validateDynamicDifficultySnapshot(
    value: unknown,
    eventIndex: number,
    label: string,
  ) {
    const snapshot = this.requiredJsonObject(
      value,
      `动态难度证据第 ${eventIndex + 1} 项 ${label} 必须是对象。`,
    );
    const speed = this.requiredNumber(
      snapshot.speed,
      `动态难度证据第 ${eventIndex + 1} 项 ${label}.speed 必须大于 0。`,
    );
    if (speed <= 0) {
      throw new BadRequestException(
        `动态难度证据第 ${eventIndex + 1} 项 ${label}.speed 必须大于 0。`,
      );
    }
    const complexityLevel = this.requiredNumber(
      snapshot.complexityLevel,
      `动态难度证据第 ${eventIndex + 1} 项 ${label}.complexityLevel 必须在 1 到 3 之间。`,
    );
    this.assertRange(
      complexityLevel,
      1,
      3,
      `动态难度证据第 ${eventIndex + 1} 项 ${label}.complexityLevel 必须在 1 到 3 之间。`,
    );
    return { speed, complexityLevel };
  }

  private assertBrowserPoseResultMetrics(
    runtimeType: string,
    motionMetrics: Array<{
      metricType: string;
      metricValue: number;
      unit: string | undefined;
      confidence: number | undefined;
      sampleCount: number | undefined;
      windowStartedAt: Date | undefined;
      windowEndedAt: Date | undefined;
      qualityFlag: string;
    }>,
    context: {
      sessionStartedAt: Date | undefined;
      resultCompletedAt: Date;
      runtimeConfigSnapshot: unknown;
      protocolSnapshot: unknown;
      metricsSummary: Prisma.JsonObject;
      trainingResult: SubmitTrainingResultDto;
    },
  ) {
    if (runtimeType !== 'browser_pose_canvas') return;

    const runtimeConfigSnapshot = this.requiredJsonObject(
      context.runtimeConfigSnapshot,
      '浏览器体感训练会话缺少服务端运行配置快照。',
    );
    if (
      this.requiredString(
        runtimeConfigSnapshot.resultContractVersion,
        '浏览器体感训练会话运行配置缺少结果合同版本。',
      ) !== browserPoseResultContractVersion ||
      this.requiredString(
        context.metricsSummary.resultContractVersion,
        '浏览器体感训练结果缺少结果合同版本。',
      ) !== browserPoseResultContractVersion
    ) {
      throw new BadRequestException(
        `浏览器体感训练结果合同版本必须是 ${browserPoseResultContractVersion}。`,
      );
    }
    const snapshotCollectionBatchId = this.requiredString(
      runtimeConfigSnapshot.collectionBatchId,
      '浏览器体感训练会话运行配置缺少采集批次 ID。',
    );
    if (
      snapshotCollectionBatchId !==
      this.requiredString(
        context.metricsSummary.collectionBatchId,
        '浏览器体感训练结果缺少采集批次 ID。',
      )
    ) {
      throw new BadRequestException('浏览器体感训练会话与结果采集批次不一致。');
    }
    this.assertCanonicalBrowserPoseMetricContract(
      runtimeConfigSnapshot.requiredMetrics,
      '浏览器体感训练会话运行配置',
    );
    const protocolSnapshot = this.requiredJsonObject(
      context.protocolSnapshot,
      '浏览器体感训练会话缺少采集协议快照。',
    );
    this.assertCanonicalBrowserPoseMetricContract(
      protocolSnapshot.requiredMetrics,
      '浏览器体感采集协议快照',
    );
    if (!context.sessionStartedAt) {
      throw new BadRequestException(
        '浏览器体感训练会话缺少有效 clientStartedAt，不能绑定动作指标窗口。',
      );
    }
    const snapshotStartedAt = this.requiredBrowserPoseCanonicalUtcDate(
      runtimeConfigSnapshot.clientStartedAt,
      '浏览器体感训练会话运行配置 clientStartedAt',
    );
    if (snapshotStartedAt.getTime() !== context.sessionStartedAt.getTime()) {
      throw new BadRequestException(
        '浏览器体感训练会话运行配置 clientStartedAt 与训练会话不一致。',
      );
    }
    const prescribedDurationSeconds = this.requiredInteger(
      runtimeConfigSnapshot.prescribedDurationSeconds,
      '浏览器体感训练会话运行配置缺少有效 prescribedDurationSeconds。',
    );
    const resultTargetDurationSeconds = this.requiredInteger(
      context.metricsSummary.targetDurationSeconds,
      '浏览器体感训练结果缺少有效 targetDurationSeconds。',
    );
    if (
      prescribedDurationSeconds <= 0 ||
      resultTargetDurationSeconds !== prescribedDurationSeconds ||
      context.trainingResult.durationSeconds !== prescribedDurationSeconds
    ) {
      throw new BadRequestException(
        '浏览器体感训练时长必须与训练会话冻结的处方时长一致。',
      );
    }
    const validFrameRatio = this.requiredNumber(
      context.metricsSummary.validFrameRatio,
      '浏览器体感训练结果缺少有效 validFrameRatio。',
    );
    this.assertRange(
      validFrameRatio,
      0,
      1,
      '浏览器体感训练结果 validFrameRatio 必须在 0 到 1 之间。',
    );

    const byMetricType = new Map<string, (typeof motionMetrics)[number]>();
    for (const metric of motionMetrics) {
      if (byMetricType.has(metric.metricType)) {
        throw new BadRequestException(
          `浏览器体感训练结果指标 ${metric.metricType} 不能重复。`,
        );
      }
      byMetricType.set(metric.metricType, metric);
    }
    const missingMetricTypes = browserPoseGameRequiredMetricTypes.filter(
      (metricType) => !byMetricType.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `浏览器体感训练结果缺少正式动作指标：${missingMetricTypes.join('、')}。`,
      );
    }
    if (
      byMetricType.size !== browserPoseGameRequiredMetricTypes.length ||
      motionMetrics.length !== browserPoseGameRequiredMetricTypes.length
    ) {
      throw new BadRequestException(
        '浏览器体感训练结果指标集合必须精确等于四项正式指标。',
      );
    }

    for (const metricType of browserPoseGameRequiredMetricTypes) {
      const metric = byMetricType.get(metricType)!;
      const contract = browserPoseMetricContract[metricType];
      if (
        metric.unit !== contract.unit ||
        metric.metricValue < contract.min ||
        metric.metricValue > contract.max
      ) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 的单位或数值超出正式合同范围。`,
        );
      }
      if (metric.confidence === undefined) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 缺少置信度。`,
        );
      }
      if (metric.sampleCount === undefined) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 缺少采样数。`,
        );
      }
      if (metric.confidence !== validFrameRatio) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 的置信度必须精确等于 validFrameRatio。`,
        );
      }
      if (!metric.windowStartedAt || !metric.windowEndedAt) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 缺少完整采样窗口。`,
        );
      }
      if (
        metric.windowStartedAt.getTime() !==
          context.sessionStartedAt.getTime() ||
        metric.windowEndedAt.getTime() !== context.resultCompletedAt.getTime()
      ) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 的采样窗口必须精确绑定训练会话 clientStartedAt 与结果完成时间。`,
        );
      }
      if (metric.qualityFlag !== 'valid') {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 的 qualityFlag 必须显式为 valid。`,
        );
      }
    }
    this.assertBrowserPoseMetricValueMatches(
      byMetricType,
      'reaction_time_ms',
      context.trainingResult.reactionTimeMs,
      'reactionTimeMs',
    );
    this.assertBrowserPoseMetricValueMatches(
      byMetricType,
      'target_hit_rate',
      context.trainingResult.completionRate,
      'completionRate',
    );
    this.assertBrowserPoseMetricValueMatches(
      byMetricType,
      'arm_raise_accuracy',
      context.trainingResult.motionAccuracy,
      'motionAccuracy',
    );
  }

  private assertBrowserPoseDifficultySnapshot(
    value: unknown,
    expected: ReturnType<AppService['browserPoseDifficultyParameters']>,
    eventIndex: number,
    label: 'before' | 'after',
  ) {
    const snapshot = this.requiredJsonObject(
      value,
      `动态难度证据第 ${eventIndex + 1} 项 ${label} 必须是对象。`,
    );
    this.assertExactBrowserPoseKeys(
      snapshot,
      browserPoseDifficultyParameterKeys,
      `动态难度证据第 ${eventIndex + 1} 项 ${label}`,
    );
    for (const key of browserPoseDifficultyParameterKeys) {
      if (
        this.requiredNumber(
          snapshot[key],
          `动态难度证据第 ${eventIndex + 1} 项 ${label}.${key} 无效。`,
        ) !== expected[key]
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${eventIndex + 1} 项 ${label}.${key} 与浏览器体感正式难度规则不一致。`,
        );
      }
    }
    return expected;
  }

  private assertBrowserPoseDifficultyWindow(
    value: unknown,
    eventIndex: number,
  ) {
    const window = this.requiredJsonObject(
      value,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow 必须是对象。`,
    );
    this.assertExactBrowserPoseKeys(
      window,
      browserPoseDifficultyWindowKeys,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow`,
    );
    const windowStartedAt = this.requiredBrowserPoseCanonicalUtcDate(
      window.windowStartedAt,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.windowStartedAt`,
    );
    const windowEndedAt = this.requiredBrowserPoseCanonicalUtcDate(
      window.windowEndedAt,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.windowEndedAt`,
    );
    if (windowStartedAt.getTime() >= windowEndedAt.getTime()) {
      throw new BadRequestException(
        `动态难度证据第 ${eventIndex + 1} 项 metricsWindow 时间顺序非法。`,
      );
    }
    const hitCount = this.requiredInteger(
      window.hitCount,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.hitCount 必须是非负整数。`,
    );
    const missCount = this.requiredInteger(
      window.missCount,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.missCount 必须是非负整数。`,
    );
    if (
      hitCount < 0 ||
      missCount < 0 ||
      hitCount + missCount !== browserPoseDifficultyWindowTargetCount
    ) {
      throw new BadRequestException(
        `动态难度证据第 ${eventIndex + 1} 项必须精确记录 ${browserPoseDifficultyWindowTargetCount} 个动作窗口。`,
      );
    }
    const sampleCount = this.requiredInteger(
      window.sampleCount,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.sampleCount 必须是正整数。`,
    );
    const validFrameCount = this.requiredInteger(
      window.validFrameCount,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.validFrameCount 必须是非负整数。`,
    );
    if (
      sampleCount <= 0 ||
      validFrameCount < 0 ||
      validFrameCount > sampleCount
    ) {
      throw new BadRequestException(
        `动态难度证据第 ${eventIndex + 1} 项 metricsWindow 采样帧数不一致。`,
      );
    }
    const averageReactionTimeMs = this.requiredInteger(
      window.averageReactionTimeMs,
      `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.averageReactionTimeMs 必须是非负整数。`,
    );
    if (averageReactionTimeMs < 0 || averageReactionTimeMs > 60000) {
      throw new BadRequestException(
        `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.averageReactionTimeMs 超出正式范围。`,
      );
    }
    const completionRate = this.browserPoseRoundedRatio(
      hitCount,
      hitCount + missCount,
    );
    const validFrameRatio = this.browserPoseRoundedRatio(
      validFrameCount,
      sampleCount,
    );
    const motionAccuracy = Number(
      Math.min(
        1,
        Math.max(0, completionRate * 0.8 + validFrameRatio * 0.2),
      ).toFixed(3),
    );
    for (const [key, expected] of [
      ['completionRate', completionRate],
      ['validFrameRatio', validFrameRatio],
      ['motionAccuracy', motionAccuracy],
    ] as const) {
      if (
        this.requiredNumber(
          window[key],
          `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.${key} 无效。`,
        ) !== expected
      ) {
        throw new BadRequestException(
          `动态难度证据第 ${eventIndex + 1} 项 metricsWindow.${key} 与真实采样窗口不一致。`,
        );
      }
    }
    return {
      windowStartedAt,
      windowEndedAt,
      hitCount,
      missCount,
      sampleCount,
      validFrameCount,
      averageReactionTimeMs,
      completionRate,
      validFrameRatio,
      motionAccuracy,
    };
  }

  private browserPoseDifficultyParameters(
    level: number,
    game: (typeof browserPoseRuntimeGames)[keyof typeof browserPoseRuntimeGames],
  ) {
    const levels = {
      1: {
        speed: 0.8,
        targetSizeScale: 1.15,
        minimumLandmarkVisibility: 0.4,
        holdDurationScale: 0.85,
      },
      2: {
        speed: 1,
        targetSizeScale: 1,
        minimumLandmarkVisibility: 0.45,
        holdDurationScale: 1,
      },
      3: {
        speed: 1.2,
        targetSizeScale: 0.85,
        minimumLandmarkVisibility: 0.5,
        holdDurationScale: 1.15,
      },
    }[level];
    if (!levels) {
      throw new BadRequestException('浏览器体感训练动态难度等级无效。');
    }
    return {
      speed: levels.speed,
      complexityLevel: level,
      targetSizeScale: levels.targetSizeScale,
      minimumLandmarkVisibility: levels.minimumLandmarkVisibility,
      holdDurationScale: levels.holdDurationScale,
      targetIntervalMs: Math.round(game.targetIntervalMs / levels.speed),
      targetLifetimeMs: Math.round(game.targetLifetimeMs / levels.speed),
    };
  }

  private browserPoseDifficultyLevelAfter(
    beforeLevel: number,
    triggerReason: string,
  ) {
    const delta =
      triggerReason === 'accuracy_high'
        ? 1
        : ['reaction_slow', 'accuracy_low', 'fatigue_risk'].includes(
              triggerReason,
            )
          ? -1
          : 0;
    return Math.min(3, Math.max(1, beforeLevel + delta));
  }

  private browserPoseTriggerReason(window: {
    averageReactionTimeMs: number;
    completionRate: number;
    motionAccuracy: number;
  }) {
    if (window.averageReactionTimeMs >= 1100) return 'reaction_slow';
    if (window.completionRate >= 0.9 && window.motionAccuracy >= 0.88) {
      return 'accuracy_high';
    }
    if (window.completionRate < 0.7 || window.motionAccuracy < 0.72) {
      return 'accuracy_low';
    }
    return 'clinician_limit';
  }

  private browserPoseSafetyClampReason(level: number, triggerReason: string) {
    if (level === 3 && triggerReason === 'accuracy_high') {
      return 'clinician_limit:max_complexity';
    }
    if (
      level === 1 &&
      ['reaction_slow', 'accuracy_low', 'fatigue_risk'].includes(triggerReason)
    ) {
      return 'clinician_limit:min_complexity';
    }
    return 'clinician_limit:no_runtime_change';
  }

  private browserPoseRoundedRatio(numerator: number, denominator: number) {
    return Number((numerator / denominator).toFixed(3));
  }

  private assertBrowserPoseRuntimeIdentifiers(
    event: Prisma.JsonObject,
    eventIndex: number,
    gameRunId: string,
  ) {
    const runtimeFrameId = this.requiredString(
      event.runtimeFrameId,
      `动态难度证据第 ${eventIndex + 1} 项缺少 runtimeFrameId。`,
    );
    const runtimeWindowId = this.requiredString(
      event.runtimeWindowId,
      `动态难度证据第 ${eventIndex + 1} 项缺少 runtimeWindowId。`,
    );
    const escapedGameRunId = gameRunId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      !new RegExp(`^${escapedGameRunId}:frame:[0-9]+$`).test(runtimeFrameId) ||
      !new RegExp(
        `^${escapedGameRunId}:difficulty-window:${eventIndex + 1}:[0-9]+-[0-9]+$`,
      ).test(runtimeWindowId)
    ) {
      throw new BadRequestException(
        `动态难度证据第 ${eventIndex + 1} 项 runtimeFrameId/runtimeWindowId 与当前训练运行时窗口不一致。`,
      );
    }
  }

  private assertExactBrowserPoseKeys(
    value: Record<string, unknown>,
    expectedKeys: readonly string[],
    label: string,
  ) {
    const actualKeys = Object.keys(value).sort();
    const canonicalKeys = [...expectedKeys].sort();
    if (
      actualKeys.length !== canonicalKeys.length ||
      actualKeys.some((key, index) => key !== canonicalKeys[index])
    ) {
      throw new BadRequestException(`${label} 字段必须精确匹配正式键集合。`);
    }
  }

  private requiredBrowserPoseCanonicalUtcDate(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    const date = this.parseDate(text, `${label}无效。`);
    if (date.toISOString() !== text) {
      throw new BadRequestException(
        `${label}必须是精确 canonical UTC ISO 时间。`,
      );
    }
    return date;
  }

  private assertBrowserPoseMetricValueMatches(
    metrics: Map<string, { metricValue: number }>,
    metricType: (typeof browserPoseGameRequiredMetricTypes)[number],
    expectedValue: number,
    expectedLabel: string,
  ) {
    if (metrics.get(metricType)?.metricValue !== expectedValue) {
      throw new BadRequestException(
        `浏览器体感训练指标 ${metricType} 必须与 ${expectedLabel} 一致。`,
      );
    }
  }

  private requiredBrowserPoseSessionStartedAt(value: unknown) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new BadRequestException(
        '浏览器体感训练会话缺少有效 clientStartedAt，不能绑定动作指标窗口。',
      );
    }
    return new Date(value.getTime());
  }

  private assertCognitiveWebResultMetrics(
    runtimeType: string,
    motionMetrics: Array<{
      metricType: string;
      qualityFlag?: string;
    }>,
  ) {
    if (runtimeType !== 'cognitive_web') return;

    const byMetricType = new Map(
      motionMetrics.map((metric) => [metric.metricType, metric]),
    );
    const missingMetricTypes = cognitiveWebRequiredMetricTypes.filter(
      (metricType) => !byMetricType.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `认知训练结果缺少正式结果指标：${missingMetricTypes.join('、')}。`,
      );
    }
    for (const metricType of cognitiveWebRequiredMetricTypes) {
      const metric = byMetricType.get(metricType);
      if (!metric) continue;
      if (metric.qualityFlag !== 'valid') {
        throw new BadRequestException(
          `认知训练指标 ${metricType} 的 qualityFlag 必须显式为 valid。`,
        );
      }
    }
  }

  private resolveUnityBuildConfig(
    current: GameContent,
    dto: UpdateUnityBuildDto,
  ): Prisma.GameContentUpdateInput {
    const buildStatus =
      dto.buildStatus === undefined
        ? current.buildStatus
        : this.validateBuildStatus(dto.buildStatus);
    const releaseChannel =
      dto.releaseChannel === undefined
        ? current.releaseChannel
        : this.validateReleaseChannel(dto.releaseChannel);
    const bridgeProtocolVersion =
      dto.bridgeProtocolVersion === undefined
        ? current.bridgeProtocolVersion
        : this.validateBridgeProtocolVersion(dto.bridgeProtocolVersion);
    const manifestUrl =
      dto.manifestUrl === undefined
        ? current.manifestUrl
        : this.optionalString(dto.manifestUrl, 'manifestUrl 必须是文本。');
    const buildBaseUrl =
      dto.buildBaseUrl === undefined
        ? current.buildBaseUrl
        : this.optionalString(dto.buildBaseUrl, 'buildBaseUrl 必须是文本。');
    const gameVersion =
      dto.gameVersion === undefined
        ? current.gameVersion
        : this.optionalString(dto.gameVersion, 'gameVersion 必须是文本。');
    const supportsCamera =
      dto.supportsCamera === undefined
        ? current.supportsCamera
        : this.requiredBoolean(
            dto.supportsCamera,
            'supportsCamera 必须是布尔值。',
          );
    const supportsMicrophone =
      dto.supportsMicrophone === undefined
        ? current.supportsMicrophone
        : this.requiredBoolean(
            dto.supportsMicrophone,
            'supportsMicrophone 必须是布尔值。',
          );
    const supportedInputModes =
      dto.supportedInputModes === undefined
        ? current.supportedInputModes
        : this.validateStringArray(
            dto.supportedInputModes,
            'supportedInputModes 必须是字符串数组。',
          );
    const requiredMetrics =
      dto.requiredMetrics === undefined
        ? this.jsonInput(current.requiredMetrics ?? [])
        : this.validateRequiredMetrics(dto.requiredMetrics);
    const difficultyPolicy: Prisma.InputJsonValue =
      dto.difficultyPolicy === undefined
        ? this.jsonInput(current.difficultyPolicy)
        : this.jsonInput(
            this.requiredJsonObject(
              dto.difficultyPolicy,
              '正式训练内容必须填写 difficultyPolicy。',
            ),
          );
    const dynamicDifficultyTriggers =
      dto.dynamicDifficultyTriggers === undefined
        ? current.dynamicDifficultyTriggers
        : this.validateStringArray(
            dto.dynamicDifficultyTriggers,
            'dynamicDifficultyTriggers 必须是非空字符串数组。',
          );
    const requiredPermissions =
      dto.requiredPermissions === undefined
        ? current.requiredPermissions
        : this.validateStringArrayAllowEmpty(
            dto.requiredPermissions,
            'requiredPermissions 必须是字符串数组。',
          );
    const resultSchema: Prisma.InputJsonValue =
      dto.resultSchema === undefined
        ? this.jsonInput(current.resultSchema)
        : this.jsonInput(
            this.requiredJsonObject(
              dto.resultSchema,
              '正式训练内容必须填写 resultSchema。',
            ),
          );
    const publishedStatus =
      dto.publishedStatus === undefined
        ? current.publishedStatus
        : this.requiredString(
            dto.publishedStatus,
            '正式训练内容必须填写 publishedStatus。',
          );

    return {
      runtimeType: 'unity_webgl',
      manifestUrl,
      buildBaseUrl,
      gameVersion,
      bridgeProtocolVersion,
      buildStatus,
      releaseChannel,
      supportsCamera,
      supportsMicrophone,
      supportedInputModes,
      requiredMetrics,
      difficultyPolicy,
      dynamicDifficultyTriggers,
      requiredPermissions,
      resultSchema,
      publishedStatus,
    };
  }

  private assertUnityBuildCanBeReleased(config: Prisma.GameContentUpdateInput) {
    if (config.runtimeType !== 'unity_webgl') {
      throw new BadRequestException('一期只允许发布 Unity WebGL 游戏。');
    }
    const manifestUrl = this.requiredString(
      config.manifestUrl,
      '发布正式构建前必须填写 manifestUrl。',
    );
    if (
      !manifestUrl.startsWith('/unity/') ||
      !manifestUrl.endsWith('/manifest.json')
    ) {
      throw new BadRequestException(
        'manifestUrl 必须是 /unity/.../manifest.json 形式的正式站内资源路径。',
      );
    }
    const buildBaseUrl = this.requiredString(
      config.buildBaseUrl,
      '发布正式构建前必须填写 buildBaseUrl。',
    );
    if (!manifestUrl.startsWith(`${buildBaseUrl}/`)) {
      throw new BadRequestException(
        'manifestUrl 必须位于 buildBaseUrl 目录下。',
      );
    }
    this.validateGameVersion(
      this.requiredString(
        config.gameVersion,
        '发布正式构建前必须填写 gameVersion。',
      ),
    );
    this.validateBridgeProtocolVersion(
      this.requiredString(
        config.bridgeProtocolVersion,
        '发布正式构建前必须填写 bridgeProtocolVersion。',
      ),
    );
    if (config.releaseChannel !== 'production') {
      throw new BadRequestException(
        '发布 released 构建时 releaseChannel 必须是 production。',
      );
    }
    const supportedInputModes = this.validateStringArray(
      config.supportedInputModes,
      '发布正式构建前必须填写 supportedInputModes。',
    );
    if (config.supportsCamera && !supportedInputModes.includes('camera_pose')) {
      throw new BadRequestException(
        '启用摄像头采集的正式构建必须包含 camera_pose 输入模式。',
      );
    }
    this.assertRequiredMetricTypes(
      config.requiredMetrics,
      [...unityWebglRequiredMetricTypes],
      '发布正式 Unity 构建前缺少正式动作指标配置。',
    );
    this.validateGameContentPublishMetadata(
      {
        difficultyPolicy: config.difficultyPolicy,
        dynamicDifficultyTriggers: config.dynamicDifficultyTriggers,
        requiredPermissions: config.requiredPermissions,
        resultSchema: config.resultSchema,
        publishedStatus:
          typeof config.publishedStatus === 'string'
            ? config.publishedStatus
            : undefined,
      },
      ['camera_capture'],
    );
    if (/demo|mock|seed_import/i.test(JSON.stringify(config))) {
      throw new BadRequestException(
        '正式 Unity 构建配置不能包含 demo/mock/seed_import 标记。',
      );
    }
  }

  private validateBuildStatus(value: unknown) {
    const status = this.requiredString(value, 'buildStatus 不能为空。');
    if (
      !['pending_assets', 'validating', 'released', 'rejected'].includes(status)
    ) {
      throw new BadRequestException(
        'buildStatus 必须是 pending_assets、validating、released 或 rejected。',
      );
    }
    return status;
  }

  private validateReleaseChannel(value: unknown) {
    const channel = this.requiredString(value, 'releaseChannel 不能为空。');
    if (!['development', 'staging', 'production'].includes(channel)) {
      throw new BadRequestException(
        'releaseChannel 必须是 development、staging 或 production。',
      );
    }
    return channel;
  }

  private validateBridgeProtocolVersion(value: unknown) {
    const version = this.requiredString(
      value,
      'bridgeProtocolVersion 不能为空。',
    );
    if (version !== '1.0.0') {
      throw new BadRequestException('bridgeProtocolVersion 当前仅支持 1.0.0。');
    }
    return version;
  }

  private validateGameVersion(value: string) {
    if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value)) {
      throw new BadRequestException(
        'gameVersion 必须是语义化版本号，例如 1.0.0。',
      );
    }
    return value;
  }

  private validateGameCode(value: unknown) {
    const code = this.requiredString(value, '游戏编码不能为空。');
    if (!/^[a-z0-9_-]{2,64}$/.test(code)) {
      throw new BadRequestException(
        '游戏编码只能包含小写字母、数字、下划线或短横线，长度 2 到 64 位。',
      );
    }
    return code;
  }

  private validateGameStatus(value: unknown) {
    const status = this.requiredString(value, '游戏状态不能为空。');
    if (!['active', 'inactive', 'archived'].includes(status)) {
      throw new BadRequestException(
        '游戏状态必须是 active、inactive 或 archived。',
      );
    }
    return status;
  }

  private validateStringArray(value: unknown, message: string) {
    if (!Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    const normalized = value.map((item) => this.requiredString(item, message));
    if (!normalized.length) {
      throw new BadRequestException(message);
    }
    return Array.from(new Set(normalized));
  }

  private validateStringArrayAllowEmpty(value: unknown, message: string) {
    if (!Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    return Array.from(
      new Set(value.map((item) => this.requiredString(item, message))),
    );
  }

  private validateAssessmentPhysicalConditions(
    value: unknown,
    message: string,
  ): AssessmentPhysicalCondition[] {
    const normalized = this.validateStringArrayAllowEmpty(value, message);
    const unsupported = normalized.filter(
      (condition): condition is string =>
        !supportedAssessmentPhysicalConditions.includes(
          condition as AssessmentPhysicalCondition,
        ),
    );
    if (unsupported.length) {
      throw new BadRequestException(
        `${message}仅支持：${supportedAssessmentPhysicalConditions.join('、')}。`,
      );
    }
    return normalized as AssessmentPhysicalCondition[];
  }

  private requireExplicitAssessmentPhysicalConditions(
    value: unknown,
    message: string,
  ): AssessmentPhysicalCondition[] {
    if (value === undefined) {
      throw new BadRequestException(message);
    }
    const normalized = this.validateAssessmentPhysicalConditions(
      value,
      'physicalConditions 必须是字符串数组。',
    );
    if (!normalized.length) {
      throw new BadRequestException(message);
    }
    const hasNoKnownLimitations = normalized.includes('no_known_limitations');
    if (hasNoKnownLimitations && normalized.length !== 1) {
      throw new BadRequestException(
        '无特殊限制不能与轮椅或上肢活动不便同时选择。',
      );
    }
    return normalized;
  }

  private validateRequiredMetrics(value: unknown, requireNonEmpty = false) {
    if (!Array.isArray(value)) {
      throw new BadRequestException('requiredMetrics 必须是数组。');
    }
    if (requireNonEmpty && !value.length) {
      throw new BadRequestException(
        '发布正式构建前 requiredMetrics 不能为空。',
      );
    }
    const metrics = value.map((item, index) => {
      const metric = this.requiredJsonObject(
        item,
        `requiredMetrics 第 ${index + 1} 项必须是对象。`,
      );
      const metricType = this.requiredString(
        metric.metricType,
        `requiredMetrics 第 ${index + 1} 项缺少 metricType。`,
      );
      const unit = this.requiredString(
        metric.unit,
        `requiredMetrics 第 ${index + 1} 项缺少 unit。`,
      );
      const min =
        metric.min === undefined
          ? undefined
          : this.requiredNumber(
              metric.min,
              `requiredMetrics 第 ${index + 1} 项 min 无效。`,
            );
      const max =
        metric.max === undefined
          ? undefined
          : this.requiredNumber(
              metric.max,
              `requiredMetrics 第 ${index + 1} 项 max 无效。`,
            );
      if (min !== undefined && max !== undefined && min > max) {
        throw new BadRequestException(
          `requiredMetrics 第 ${index + 1} 项 min 不能大于 max。`,
        );
      }
      return {
        metricType,
        unit,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      };
    });
    return this.jsonInput(metrics);
  }

  private trainingRuntimeRequiresCamera(
    game: GameContent,
    requiredInputModes: string[] = [],
  ) {
    const requiredPermissions = this.readGameRequiredPermissions(game);
    return (
      game.supportsCamera ||
      requiredPermissions.includes('camera_capture') ||
      game.supportedInputModes.includes('camera_pose') ||
      requiredInputModes.includes('camera_pose')
    );
  }

  private readGameRequiredPermissions(game: GameContent) {
    if (!Array.isArray(game.requiredPermissions)) {
      throw new BadRequestException(
        `训练内容 ${game.name} 缺少 requiredPermissions 配置。`,
      );
    }
    return game.requiredPermissions;
  }

  private async assertTrainingRuntimeConsents(
    patientId: string,
    game: GameContent,
    protocolConsentTypes: string[],
    requiredInputModes: string[] = [],
  ): Promise<TrainingConsentSnapshot> {
    const consentTypes = new Set<ConsentDto['consentType']>(['privacy_policy']);
    for (const consentType of protocolConsentTypes) {
      consentTypes.add(consentType as ConsentDto['consentType']);
    }
    for (const permission of this.readGameRequiredPermissions(game)) {
      const consentType = permission as ConsentDto['consentType'];
      if (
        ![
          'privacy_policy',
          'ai_processing',
          'camera_capture',
          'microphone_capture',
          'caregiver_sharing',
        ].includes(consentType)
      ) {
        throw new BadRequestException(
          `训练内容 ${game.name} 的 requiredPermissions 包含无效授权类型。`,
        );
      }
      consentTypes.add(consentType);
    }
    if (this.trainingRuntimeRequiresCamera(game, requiredInputModes)) {
      consentTypes.add('camera_capture');
    }
    const consents = [];
    for (const consentType of consentTypes) {
      consents.push(await this.assertCurrentConsent(patientId, consentType));
    }
    return this.buildTrainingConsentSnapshot(consents);
  }

  private resolveStartingDifficultyLevel(value: string) {
    const normalized = value.trim().toLowerCase();
    if (
      [
        'easy',
        'low',
        '基础',
        '低',
        '低强度',
        '三步路径',
        '三步序列',
        '慢节律',
      ].includes(normalized)
    ) {
      return 1;
    }
    if (
      [
        'standard',
        'moderate',
        '标准',
        '中等',
        '中低强度',
        '双色分拣',
        '左右节拍',
        '重心转移',
      ].includes(normalized)
    ) {
      return 2;
    }
    if (['advanced', 'high', '高级', '高', '四点光轨'].includes(normalized)) {
      return 3;
    }
    throw new BadRequestException(
      `训练项目难度 ${value} 未映射到正式动态难度等级。`,
    );
  }

  private buildTrainingRuntimeContext(
    dto: StartTrainingDto,
    planItem: {
      id: string;
      difficulty: string;
      durationMinutes: number;
      adaptiveRules?: Prisma.JsonValue;
    },
    game: GameContent,
    collectionBatch: CollectionBatchWithProtocol,
    assessmentSourceId: string,
  ) {
    const gameRunId = this.requiredString(
      dto.gameRunId,
      '游戏运行批次 ID 不能为空，请由前端设备检测通过后生成并传入。',
    );
    const requiresCamera = this.trainingRuntimeRequiresCamera(
      game,
      collectionBatch.protocol.requiredInputModes,
    );
    const deviceCode = requiresCamera
      ? this.requiredString(
          dto.deviceCode,
          '设备编号不能为空，请完成摄像头设备识别后再开始训练。',
        )
      : this.optionalString(dto.deviceCode, '设备编号必须是文本。');
    const calibrationStatus = this.requiredString(
      dto.calibrationStatus,
      '校准状态不能为空，请完成设备检测后再开始训练。',
    );
    if (!['checked', 'completed'].includes(calibrationStatus)) {
      throw new BadRequestException(
        '开始正式训练前，设备校准状态必须是 checked 或 completed。',
      );
    }
    const clientStartedAt = this.requiredString(
      dto.clientStartedAt,
      '客户端训练开始时间不能为空。',
    );
    const parsedClientStartedAt = this.parseDate(
      clientStartedAt,
      '客户端训练开始时间无效。',
    );
    const startingDifficultyLevel = this.resolveStartingDifficultyLevel(
      planItem.difficulty,
    );
    const prescribedDurationMinutes = this.requiredInteger(
      planItem.durationMinutes,
      '训练项目处方时长必须是整数。',
    );
    if (prescribedDurationMinutes <= 0) {
      throw new BadRequestException('训练项目处方时长必须大于 0。');
    }
    const minConfidence =
      game.runtimeType === 'unity_webgl'
        ? this.unityWebglQualityGateMinConfidence(
            collectionBatch.protocol.qualityGate,
            'Unity WebGL 采集协议 qualityGate',
          )
        : undefined;

    return {
      gameRunId,
      deviceCode,
      calibrationStatus,
      clientStartedAt: parsedClientStartedAt,
      runtimeConfigSnapshot: this.jsonInput({
        runtimeType: game.runtimeType,
        manifestUrl: game.manifestUrl,
        buildBaseUrl: game.buildBaseUrl,
        gameVersion: game.gameVersion,
        bridgeProtocolVersion: game.bridgeProtocolVersion,
        ...(game.runtimeType === 'unity_webgl'
          ? {
              resultContractVersion: unityWebglResultContractVersion,
              clientStartedAt: parsedClientStartedAt.toISOString(),
              collectionBatchId: collectionBatch.id,
              durationSeconds: prescribedDurationMinutes * 60,
              minConfidence,
            }
          : game.runtimeType === 'browser_pose_canvas'
            ? {
                resultContractVersion: browserPoseResultContractVersion,
                clientStartedAt: parsedClientStartedAt.toISOString(),
                collectionBatchId: collectionBatch.id,
              }
            : {}),
        releaseChannel: game.releaseChannel,
        supportedInputModes: game.supportedInputModes,
        requiredMetrics: game.requiredMetrics,
        difficultyPolicy: game.difficultyPolicy,
        dynamicDifficultyTriggers: game.dynamicDifficultyTriggers,
        requiredPermissions: game.requiredPermissions,
        resultSchema: game.resultSchema,
        publishedStatus: game.publishedStatus,
        approvedPlanItemId: planItem.id,
        prescribedDurationSeconds: prescribedDurationMinutes * 60,
        assessmentSourceId,
        startingLevelSource: 'clinician_approved_plan',
        startingDifficultyLevel,
        adaptiveRules: planItem.adaptiveRules ?? {},
        deviceMetadata: {
          deviceCode: deviceCode ?? null,
          calibrationStatus,
          requiredInputModes: collectionBatch.protocol.requiredInputModes,
        },
        collectionBatch: {
          id: collectionBatch.id,
          status: collectionBatch.status,
          protocolId: collectionBatch.protocolId,
          protocolVersion: collectionBatch.protocolVersion,
          conditionId: collectionBatch.conditionId,
          conditionSnapshot: collectionBatch.conditionSnapshot,
          protocolSnapshot: collectionBatch.protocolSnapshot,
          consentSnapshot: collectionBatch.consentSnapshot,
        },
      }),
      unityBuildVersion:
        game.runtimeType === 'unity_webgl' ? game.gameVersion : undefined,
      bridgeProtocolVersion: game.bridgeProtocolVersion,
    };
  }

  private calculateRiskLevel(
    assessmentType: string,
    scoreSummary: Prisma.JsonObject,
  ): RiskLevel {
    if (this.isAd8AssessmentType(assessmentType)) {
      const ad8Total = this.requiredNumber(
        scoreSummary.ad8Total,
        'AD-8 总分不能为空。',
      );
      if (ad8Total >= 6) return 'high';
      if (ad8Total >= 2) return 'moderate';
      return 'low';
    }

    const mmse = this.requiredNumber(scoreSummary.mmse, 'MMSE 分数不能为空。');
    const cdr = this.requiredNumber(scoreSummary.cdr, 'CDR 分数不能为空。');
    if (mmse < 18 || cdr >= 2) return 'high';
    if (mmse < 24 || cdr >= 1) return 'moderate';
    return 'low';
  }

  private riskReason(
    assessmentType: string,
    level: RiskLevel,
    scoreSummary: Prisma.JsonObject,
  ) {
    if (this.isAd8AssessmentType(assessmentType)) {
      const ad8Total = this.requiredNumber(
        scoreSummary.ad8Total,
        'AD-8 总分不能为空。',
      );
      const screeningText =
        ad8Total >= 2 ? '提示认知改变可能' : '未达到明显认知改变筛查阈值';
      return `AD-8 ${ad8Total}/8，${screeningText}，系统判定为${this.riskLabel(level)}。`;
    }

    const mmse = this.requiredNumber(scoreSummary.mmse, 'MMSE 分数不能为空。');
    const cdr = this.requiredNumber(scoreSummary.cdr, 'CDR 分数不能为空。');
    return `MMSE ${mmse}/30，CDR ${cdr}，系统判定为${this.riskLabel(level)}。`;
  }

  private riskLabel(level: RiskLevel) {
    return level === 'high'
      ? '高风险'
      : level === 'moderate'
        ? '中度风险'
        : '低风险';
  }

  private filterGamesByPhysicalConditions(
    games: GameContent[],
    physicalConditions: AssessmentPhysicalCondition[] | undefined,
  ) {
    if (!physicalConditions?.length) return [];
    if (physicalConditions.includes('no_known_limitations')) return games;
    return games.filter((game) =>
      physicalConditions.every((condition) =>
        game.tags.some(
          (tag) =>
            this.normalizeGameMatchTerm(tag) ===
            `safety:${condition}_compatible`,
        ),
      ),
    );
  }

  private assertGamesSafeForPhysicalConditions(
    games: GameContent[],
    physicalConditions: AssessmentPhysicalCondition[],
  ) {
    const unsafeGames = games.filter(
      (game) =>
        this.filterGamesByPhysicalConditions([game], physicalConditions)
          .length === 0,
    );
    if (unsafeGames.length) {
      throw new BadRequestException(
        `训练方案包含与患者身体状况不匹配的训练内容：${unsafeGames
          .map((game) => game.name)
          .join('、')}。`,
      );
    }
  }

  private scoreGame(
    trainingTargets: string[],
    tags: string[],
    riskLevel: RiskLevel,
    physicalConditions: string[] | undefined,
  ) {
    const text = [...trainingTargets, ...tags].join(',');
    let score = 50;
    if (this.includesAnyTrainingTag(text, ['近记忆', '记忆', 'memory'])) {
      score += 20;
    }
    if (this.includesAnyTrainingTag(text, ['反应', 'reaction'])) {
      score += 15;
    }
    if (this.includesAnyTrainingTag(text, ['执行力', 'executive'])) {
      score += 12;
    }
    if (
      riskLevel === 'high' &&
      this.includesAnyTrainingTag(text, ['低强度', 'low_intensity'])
    ) {
      score += 20;
    }
    if (
      riskLevel !== 'high' &&
      this.includesAnyTrainingTag(text, [
        '中低强度',
        'moderate_intensity',
        'low_intensity',
      ])
    ) {
      score += 10;
    }
    score +=
      this.countPhysicalConditionMatches(physicalConditions, trainingTargets) *
      30;
    score += this.countPhysicalConditionMatches(physicalConditions, tags) * 20;
    return score;
  }

  private countPhysicalConditionMatches(
    physicalConditions: string[] | undefined,
    gameAttributes: string[],
  ) {
    if (physicalConditions === undefined) return 0;
    const normalizedAttributes = gameAttributes
      .map((attribute) => this.normalizeGameMatchTerm(attribute))
      .filter((attribute) => !attribute.startsWith('safety:'));
    return physicalConditions.filter((condition) => {
      const normalizedCondition = this.normalizeGameMatchTerm(condition);
      return normalizedAttributes.some(
        (attribute) =>
          attribute === normalizedCondition ||
          attribute.includes(normalizedCondition) ||
          normalizedCondition.includes(attribute),
      );
    }).length;
  }

  private normalizeGameMatchTerm(value: string) {
    return value
      .trim()
      .toLocaleLowerCase('zh-CN')
      .replace(/[\s-]+/g, '_');
  }

  private includesAnyTrainingTag(text: string, tags: string[]) {
    return tags.some((tag) => text.includes(tag));
  }

  private compareGameRecommendationCandidates(
    left: { game: GameContent; score: number },
    right: { game: GameContent; score: number },
  ) {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) return scoreDelta;

    const leftReleasedAt = this.gameRecommendationFreshness(left.game);
    const rightReleasedAt = this.gameRecommendationFreshness(right.game);
    if (leftReleasedAt !== rightReleasedAt) {
      return rightReleasedAt - leftReleasedAt;
    }

    return left.game.name.localeCompare(right.game.name, 'zh-Hans-CN');
  }

  private gameRecommendationFreshness(game: GameContent) {
    const updatedAt = game.updatedAt?.getTime() ?? 0;
    const createdAt = game.createdAt?.getTime() ?? 0;
    return Math.max(updatedAt, createdAt);
  }

  private async ensurePatientLoginAvailable(
    account: string,
    mobilePhone: string | undefined,
  ) {
    await this.ensureLoginAvailable(account, mobilePhone, '患者');
  }

  private async ensureCaregiverLoginAvailable(
    account: string,
    mobilePhone: string | undefined,
  ) {
    await this.ensureLoginAvailable(account, mobilePhone, '家属');
  }

  private async ensureLoginAvailable(
    account: string,
    mobilePhone: string | undefined,
    label: string,
  ) {
    const mobilePhoneLookup = this.phoneLookup(mobilePhone);
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { account },
          ...(mobilePhoneLookup ? [{ mobilePhoneLookup }] : []),
        ],
      },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException(`${label}账号或手机号已存在。`);
    }
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isUserLoginUniqueConstraintError(error: unknown) {
    if (!this.isUniqueConstraintError(error)) return false;
    const meta = error.meta;
    if (!meta || Object.keys(meta).length !== 2) return false;
    const target = meta.target;
    return (
      meta.modelName === 'User' &&
      Array.isArray(target) &&
      target.length === 1 &&
      (target[0] === 'account' || target[0] === 'mobilePhoneLookup')
    );
  }

  private isActiveTrainingSessionConstraintError(error: unknown) {
    if (!this.isUniqueConstraintError(error)) return false;
    const meta = error.meta;
    if (!meta || Object.keys(meta).length !== 2) return false;
    const target = meta.target;
    return (
      meta.modelName === 'TrainingSession' &&
      Array.isArray(target) &&
      target.length === 1 &&
      target[0] === 'planItemId'
    );
  }

  private jsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  }

  private assertImmutableIdempotencyContext(
    resource: string,
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
  ) {
    const actualCanonical = JSON.stringify(
      this.canonicalizeImmutableContext(actual),
    );
    const expectedCanonical = JSON.stringify(
      this.canonicalizeImmutableContext(expected),
    );
    if (actualCanonical !== expectedCanonical) {
      throw new ConflictException(`${resource}幂等键对应的请求上下文不一致。`);
    }
  }

  private canonicalizeImmutableContext(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalizeImmutableContext(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalizeImmutableContext(item)]),
      );
    }
    return value;
  }

  private appendAssessmentDoctorReview(
    rawInputSummary: unknown,
    review: {
      decision: string;
      reviewNote: string;
      reviewerUserId: string | undefined;
      reviewedAt: string;
    },
  ): Prisma.InputJsonValue {
    const current =
      rawInputSummary &&
      typeof rawInputSummary === 'object' &&
      !Array.isArray(rawInputSummary)
        ? (rawInputSummary as Record<string, unknown>)
        : {};
    return this.jsonInput({
      ...current,
      doctorReview: review,
    });
  }

  private bindFormalAssessmentHumanReview(
    rawInputSummary: Prisma.JsonObject,
    source: string,
    reviewerUserId: string,
    reviewedAt: Date,
  ): Prisma.JsonObject {
    if (!this.isProductionAiAssessmentSource(source)) {
      return rawInputSummary;
    }
    const evidence = this.requiredJsonObject(
      rawInputSummary.evidence,
      '生产 AI/语音评估必须提供供应商调用证据。',
    );
    const clientHumanReview = this.requiredJsonObject(
      evidence.humanReview,
      '生产 AI/语音评估必须提供人工复核记录。',
    );
    return this.jsonInput({
      ...rawInputSummary,
      evidence: {
        ...evidence,
        humanReview: {
          ...clientHumanReview,
          reviewerUserId,
          reviewedAt: reviewedAt.toISOString(),
        },
      },
    }) as Prisma.JsonObject;
  }

  private normalizeAiConversationAssessmentType(value: string) {
    const assessmentType = this.requiredString(value, '评估类型不能为空。');
    const normalized = assessmentType.trim().toUpperCase();
    if (
      normalized === 'MMSE' ||
      normalized === 'CDR' ||
      normalized === 'AD8' ||
      normalized === 'AD-8' ||
      normalized === 'MMSE/CDR' ||
      normalized === 'COMBINED'
    ) {
      return normalized === 'AD8' ? 'AD-8' : assessmentType.trim();
    }
    throw new BadRequestException(
      'AI 会话评估类型只能是 MMSE、CDR、AD-8 或综合评估。',
    );
  }

  private buildAiConversationConsentSnapshot(
    consents: Array<{
      id: string;
      consentType: ConsentDto['consentType'];
      consentVersion: string;
      status: string;
      revokedAt?: Date | null;
    }>,
  ): Prisma.JsonObject {
    return {
      version: currentConsentVersion,
      requiredTypes: consents.map((consent) => consent.consentType),
      grantedConsentIds: consents.map((consent) => consent.id),
      status: consents.every(
        (consent) =>
          consent.consentVersion === currentConsentVersion &&
          consent.status === 'granted' &&
          !consent.revokedAt,
      )
        ? 'granted'
        : 'blocked',
    };
  }

  private resolveLatestAiConversationTurnIndex(
    messages: Array<{ turnIndex?: number | null }>,
  ) {
    return messages.reduce((latest, message) => {
      const turnIndex = message.turnIndex;
      if (typeof turnIndex !== 'number' || !Number.isInteger(turnIndex)) {
        throw new BadRequestException('AI 会话消息缺少正式轮次编号。');
      }
      return Math.max(latest, turnIndex);
    }, 0);
  }

  private validateAiConversationReviewConclusion(value: unknown) {
    const conclusion = this.requiredString(value, 'AI 会话复核结论不能为空。');
    if (conclusion !== 'approved' && conclusion !== 'returned') {
      throw new BadRequestException(
        'AI 会话复核结论只能是 approved 或 returned。',
      );
    }
    return conclusion;
  }

  private validateAssessmentReviewDecision(value: unknown) {
    const decision = this.requiredString(value, '评估复核决定不能为空。');
    if (decision !== 'approved' && decision !== 'returned') {
      throw new BadRequestException(
        '评估复核决定只能是 approved 或 returned。',
      );
    }
    return decision;
  }

  private validateOptionalRiskLevel(value: unknown): RiskLevel | undefined {
    const riskLevel = this.optionalString(value, '人工风险等级必须是文本。');
    if (!riskLevel) return undefined;
    if (!['low', 'moderate', 'high'].includes(riskLevel)) {
      throw new BadRequestException(
        '人工风险等级必须是 low、moderate 或 high。',
      );
    }
    return riskLevel as RiskLevel;
  }

  private validateRegistrationRequestedRole(value: unknown): RoleCode {
    const role = this.requiredString(value, '申请角色不能为空。');
    if (!['patient', 'caregiver'].includes(role)) {
      throw new BadRequestException('申请角色只能是 patient 或 caregiver。');
    }
    return role as RoleCode;
  }

  private validateRegistrationDecision(
    value: unknown,
  ): 'approved' | 'rejected' {
    const decision = this.requiredString(value, '审核决定不能为空。');
    if (!['approved', 'rejected'].includes(decision)) {
      throw new BadRequestException('审核决定只能是 approved 或 rejected。');
    }
    return decision as 'approved' | 'rejected';
  }

  private registrationRequestResponse(request: RegistrationRequestResponse) {
    const identity = this.decryptRegistrationIdentity(
      request.id,
      request.identityEnvelope,
    );
    const review =
      request.reviewStatus === 'pending'
        ? null
        : this.decryptRegistrationReview(request.id, request.reviewEnvelope);
    return {
      id: request.id,
      requestedRole: request.requestedRole,
      account: request.account,
      displayName: identity.displayName,
      mobilePhone: identity.mobilePhone,
      reviewStatus: request.reviewStatus,
      reviewNote: review?.reviewNote ?? null,
      reviewedByUserId: request.reviewedByUserId,
      reviewedAt: request.reviewedAt,
      createdUserId: request.createdUserId,
      createdPatientId: request.createdPatientId,
      credentialExpiresAt: request.credentialExpiresAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private registrationResponsibleDoctorId(user: RequestUser) {
    const doctorId = user.roles.find(
      (role) => role.roleCode === 'doctor',
    )?.relatedObjectId;
    if (!doctorId) {
      throw new ForbiddenException('患者注册必须由接诊医师审核。');
    }
    return doctorId;
  }

  private async assertRegistrationReviewAccess(
    user: RequestUser,
    requestedRole: RoleCode,
    requestId: string,
  ) {
    const allowed =
      requestedRole === 'patient'
        ? this.hasRole(user, 'doctor')
        : requestedRole === 'caregiver' &&
          this.hasAdminPermission(user, 'user.manage');
    if (allowed) return;

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'registration_request',
      requestId,
      'denied',
      { reason: 'registration_review_role_required', requestedRole },
    );
    throw new ForbiddenException('当前角色无权审核该类注册申请。');
  }

  private requiredJsonObject(
    value: unknown,
    message: string,
  ): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private encryptSensitiveJsonField(
    value: Prisma.JsonObject,
    aad: SensitiveEncryptionAad,
  ): Prisma.InputJsonValue {
    return encryptSensitiveJson(value, aad, this.sensitiveEncryptionKey);
  }

  private phoneLookup(phone: string | undefined): string | null {
    return phone
      ? createPhoneLookupHmac(phone, this.sensitiveEncryptionKey.key)
      : null;
  }

  private userIdentityResponse<
    T extends {
      id: string;
      identityEnvelope: Prisma.JsonValue;
    },
  >(user: T) {
    const { identityEnvelope, ...safeUser } = user;
    return {
      ...safeUser,
      ...this.decryptUserIdentity(user.id, identityEnvelope),
    };
  }

  private caregiverRelationResponse<
    T extends {
      caregiver: {
        id: string;
        identityEnvelope: Prisma.JsonValue;
      };
    },
  >(relation: T) {
    return {
      ...relation,
      caregiver: this.userIdentityResponse(relation.caregiver),
    };
  }

  private auditLogActorResponse<
    T extends {
      actor: {
        id: string;
        account: string;
        identityEnvelope: Prisma.JsonValue;
      } | null;
    },
  >(log: T) {
    const actor = log.actor;
    if (!actor) {
      return { ...log, actor: null };
    }
    const identity = this.decryptUserIdentity(actor.id, actor.identityEnvelope);
    return {
      ...log,
      actor: {
        account: actor.account,
        displayName: identity.displayName,
      },
    };
  }

  private patientProfileResponse<
    T extends {
      id: string;
      identityEnvelope: Prisma.JsonValue;
      contactEnvelope: Prisma.JsonValue;
      careDetailsEnvelope: Prisma.JsonValue;
    },
  >(patient: T) {
    const {
      identityEnvelope,
      contactEnvelope,
      careDetailsEnvelope,
      ...safePatient
    } = patient;
    return {
      ...safePatient,
      ...this.decryptPatientIdentity(patient.id, identityEnvelope),
      ...this.decryptPatientContact(patient.id, contactEnvelope),
      ...this.decryptPatientCareDetails(patient.id, careDetailsEnvelope),
    };
  }

  private decryptUserIdentity(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      { tableName: 'user', recordId: id, fieldName: 'identityEnvelope' },
      '用户身份数据必须使用敏感数据加密信封。',
    );
    try {
      return parseUserIdentityPayload(payload);
    } catch (error) {
      if (error instanceof InvalidUserIdentityPayloadError) {
        throw new BadRequestException('用户身份数据无效。');
      }
      throw error;
    }
  }

  private decryptPatientIdentity(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'patient_profile',
        recordId: id,
        fieldName: 'identityEnvelope',
      },
      '患者身份数据必须使用敏感数据加密信封。',
    );
    return {
      name: this.requiredString(payload.name, '患者姓名数据无效。'),
      gender: this.requiredString(payload.gender, '患者性别数据无效。'),
      age: this.requiredPatientAge(payload.age),
    };
  }

  private requiredPatientAge(value: unknown) {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 120
    ) {
      throw new BadRequestException('患者年龄数据无效。');
    }
    return value;
  }

  private decryptPatientContact(id: string, value: Prisma.JsonValue) {
    if (value === null) {
      return {
        mobilePhone: null,
        caregiverName: null,
        caregiverPhone: null,
      };
    }
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'patient_profile',
        recordId: id,
        fieldName: 'contactEnvelope',
      },
      '患者联系数据必须使用敏感数据加密信封。',
    );
    return {
      mobilePhone: this.requiredNullableString(
        payload.mobilePhone,
        '患者手机号数据无效。',
      ),
      caregiverName: this.requiredNullableString(
        payload.caregiverName,
        '照护人姓名数据无效。',
      ),
      caregiverPhone: this.requiredNullableString(
        payload.caregiverPhone,
        '照护人联系方式数据无效。',
      ),
    };
  }

  private decryptPatientCareDetails(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'patient_profile',
        recordId: id,
        fieldName: 'careDetailsEnvelope',
      },
      '患者照护数据必须使用敏感数据加密信封。',
    );
    return {
      healthMetrics: this.requiredJsonObject(
        payload.healthMetrics,
        '患者健康指标数据无效。',
      ),
    };
  }

  private decryptRegistrationIdentity(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'registration_request',
        recordId: id,
        fieldName: 'identityEnvelope',
      },
      '注册申请身份数据必须使用敏感数据加密信封。',
    );
    return {
      displayName: this.requiredString(
        payload.displayName,
        '申请人姓名数据无效。',
      ),
      mobilePhone: this.requiredNullableString(
        payload.mobilePhone,
        '申请人手机号数据无效。',
      ),
      profileSnapshot: this.requiredJsonObject(
        payload.profileSnapshot,
        '注册申请资料数据无效。',
      ),
    };
  }

  private decryptRegistrationReview(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'registration_request',
        recordId: id,
        fieldName: 'reviewEnvelope',
      },
      '注册申请审核数据必须使用敏感数据加密信封。',
    );
    return {
      reviewNote: this.requiredString(
        payload.reviewNote,
        '注册审核备注数据无效。',
      ),
    };
  }

  private decryptSensitiveObject(
    value: Prisma.JsonValue,
    aad: SensitiveEncryptionAad,
    message: string,
  ): Prisma.JsonObject {
    const envelope = this.requiredSensitiveEncryptionEnvelope(value, message);
    const payload = decryptSensitiveJson<unknown>(
      envelope,
      aad,
      this.sensitiveEncryptionKey,
    );
    return this.requiredJsonObject(payload, message);
  }

  private requiredNullableString(
    value: unknown,
    message: string,
  ): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') throw new BadRequestException(message);
    return value;
  }

  private requiredSensitiveEncryptionEnvelope(
    value: Prisma.JsonValue,
    message: string,
  ): SensitiveEncryptionEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    const envelope = value as Record<string, unknown>;
    if (
      envelope.v !== 1 ||
      envelope.alg !== 'AES-256-GCM' ||
      typeof envelope.kid !== 'string' ||
      typeof envelope.nonce !== 'string' ||
      typeof envelope.ciphertext !== 'string' ||
      typeof envelope.tag !== 'string' ||
      typeof envelope.aad !== 'object' ||
      envelope.aad === null ||
      Array.isArray(envelope.aad) ||
      envelope.contentType !== 'application/json'
    ) {
      throw new BadRequestException(message);
    }
    return value as unknown as SensitiveEncryptionEnvelope;
  }

  private requiredString(value: unknown, message: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(message);
    }
    return value.trim();
  }

  private optionalString(value: unknown, message: string) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private requiredNumber(value: unknown, message: string) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException(message);
    }
    return numberValue;
  }

  private requiredBoolean(value: unknown, message: string) {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(message);
    }
    return value;
  }

  private requiredInteger(value: unknown, message: string) {
    const numberValue = this.requiredNumber(value, message);
    if (!Number.isInteger(numberValue)) {
      throw new BadRequestException(message);
    }
    return numberValue;
  }

  private assertRange(
    value: number,
    min: number,
    max: number,
    message: string,
  ) {
    if (value < min || value > max) {
      throw new BadRequestException(message);
    }
  }

  private validateAccount(value: unknown, message = '患者登录账号不能为空。') {
    const account = this.requiredString(value, message);
    if (!/^[a-zA-Z0-9_.-]{4,32}$/.test(account)) {
      throw new BadRequestException(
        '登录账号需为 4-32 位字母、数字、下划线、点或短横线。',
      );
    }
    return account;
  }

  private validateCaregiverScope(value: unknown) {
    const scope = this.requiredJsonObject(
      value,
      '家属授权范围不能为空，且必须是结构化对象。',
    );
    const summary = this.requiredBoolean(
      scope.summary,
      '家属授权范围必须明确 summary 权限。',
    );
    const reminders = this.requiredBoolean(
      scope.reminders,
      '家属授权范围必须明确 reminders 权限。',
    );
    const progress = this.requiredBoolean(
      scope.progress,
      '家属授权范围必须明确 progress 权限。',
    );
    const rawAssessment = this.requiredBoolean(
      scope.rawAssessment,
      '家属授权范围必须明确 rawAssessment 权限。',
    );
    const planEdit = this.requiredBoolean(
      scope.planEdit,
      '家属授权范围必须明确 planEdit 权限。',
    );
    if (!summary) {
      throw new BadRequestException('家属绑定必须至少授予 summary 摘要权限。');
    }
    if (rawAssessment || planEdit) {
      throw new BadRequestException(
        '一期家属端仅允许摘要、提醒和进展查看，不开放原始评估或计划编辑。',
      );
    }
    return {
      summary,
      reminders,
      progress,
      rawAssessment,
      planEdit,
    };
  }

  private validateCareCircleBody(
    value: unknown,
    label: string,
    maxLength = 500,
  ) {
    const body = this.requiredString(value, `${label}不能为空。`);
    if (body.length > maxLength) {
      throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符。`);
    }
    return body;
  }

  private toCareCirclePostView(post: {
    id: string;
    contentEnvelope: Prisma.JsonValue;
    moderationStatus: string;
    moderationEnvelope: Prisma.JsonValue;
    createdAt: Date;
    author?: {
      id: string;
      identityEnvelope: Prisma.JsonValue;
    } | null;
    comments?: Array<{
      id: string;
      contentEnvelope: Prisma.JsonValue;
      moderationStatus: string;
      createdAt: Date;
      author?: {
        id: string;
        identityEnvelope: Prisma.JsonValue;
      } | null;
    }>;
    reactions?: Array<{
      reactionType: string;
    }>;
  }) {
    const content = this.decryptCareCirclePostContent(
      post.id,
      post.contentEnvelope,
    );
    if (post.moderationEnvelope !== null) {
      this.decryptCareCirclePostModeration(post.id, post.moderationEnvelope);
    }
    const author = post.author ? this.userIdentityResponse(post.author) : null;
    return {
      id: post.id,
      body: content.body,
      mood: content.mood,
      moderationStatus: post.moderationStatus,
      createdAt: post.createdAt,
      author: {
        displayName: this.maskNullableName(author?.displayName),
      },
      comments: (post.comments ?? []).map((comment) =>
        this.toCareCircleCommentView(comment),
      ),
      reactions: this.summarizeCareCircleReactions(post.reactions ?? []),
    };
  }

  private toCareCircleCommentView(comment: {
    id: string;
    contentEnvelope: Prisma.JsonValue;
    moderationStatus: string;
    createdAt: Date;
    author?: {
      id: string;
      identityEnvelope: Prisma.JsonValue;
    } | null;
  }) {
    const content = this.decryptCareCircleCommentContent(
      comment.id,
      comment.contentEnvelope,
    );
    const author = comment.author
      ? this.userIdentityResponse(comment.author)
      : null;
    return {
      id: comment.id,
      body: content.body,
      moderationStatus: comment.moderationStatus,
      createdAt: comment.createdAt,
      author: {
        displayName: this.maskNullableName(author?.displayName),
      },
    };
  }

  private decryptCareCirclePostContent(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'care_circle_post',
        recordId: id,
        fieldName: 'contentEnvelope',
      },
      '关爱动态内容必须使用敏感数据加密信封。',
    );
    if (payload.privateMetadata !== null) {
      this.requiredJsonObject(
        payload.privateMetadata,
        '关爱动态私密补充信息数据无效。',
      );
    }
    return {
      body: this.requiredString(payload.body, '关爱动态内容数据无效。'),
      mood: this.requiredNullableString(payload.mood, '关爱动态心情数据无效。'),
    };
  }

  private decryptCareCirclePostModeration(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'care_circle_post',
        recordId: id,
        fieldName: 'moderationEnvelope',
      },
      '关爱动态处理数据必须使用敏感数据加密信封。',
    );
    return {
      moderationReason: this.requiredNullableString(
        payload.moderationReason,
        '关爱动态处理原因数据无效。',
      ),
    };
  }

  private decryptCareCircleCommentContent(id: string, value: Prisma.JsonValue) {
    const payload = this.decryptSensitiveObject(
      value,
      {
        tableName: 'care_circle_comment',
        recordId: id,
        fieldName: 'contentEnvelope',
      },
      '关爱评论内容必须使用敏感数据加密信封。',
    );
    if (payload.privateMetadata !== null) {
      this.requiredJsonObject(
        payload.privateMetadata,
        '关爱评论私密补充信息数据无效。',
      );
    }
    return {
      body: this.requiredString(payload.body, '关爱评论内容数据无效。'),
    };
  }

  private summarizeCareCircleReactions(
    reactions: Array<{ reactionType: string }>,
  ) {
    const summary = new Map<string, number>();
    for (const reaction of reactions) {
      summary.set(
        reaction.reactionType,
        (summary.get(reaction.reactionType) ?? 0) + 1,
      );
    }
    return Array.from(summary.entries()).map(([reactionType, count]) => ({
      reactionType,
      count,
    }));
  }

  private toCarePrecautionView(precaution: {
    id: string;
    contentEnvelope: Prisma.JsonValue;
    category: string;
    priority: string;
    status: string;
    publishedAt: Date | null;
    createdAt: Date;
  }) {
    const payload = this.decryptSensitiveObject(
      precaution.contentEnvelope,
      {
        tableName: 'care_precaution',
        recordId: precaution.id,
        fieldName: 'contentEnvelope',
      },
      '注意事项内容必须使用敏感数据加密信封。',
    );
    return {
      id: precaution.id,
      title: this.requiredString(payload.title, '注意事项标题数据无效。'),
      content: this.requiredString(payload.content, '注意事项内容数据无效。'),
      category: precaution.category,
      priority: precaution.priority,
      status: precaution.status,
      publishedAt: precaution.publishedAt,
      createdAt: precaution.createdAt,
    };
  }

  private validateInitialPassword(value: unknown, label = '患者') {
    return this.validatePassword(value, `${label}初始密码`);
  }

  private validateLoginPassword(value: unknown) {
    if (typeof value !== 'string') {
      throw new BadRequestException('登录密码必须是文本。');
    }
    if (value.length < 1 || value.length > 128) {
      throw new BadRequestException('登录密码长度必须在 1 到 128 位之间。');
    }
    return value;
  }

  private validatePassword(value: unknown, label: string) {
    try {
      return validateCredentialPassword(value);
    } catch (error: unknown) {
      if (error instanceof CredentialPasswordPolicyError) {
        if (typeof value !== 'string') {
          throw new BadRequestException(`${label}必须是文本。`);
        }
        throw new BadRequestException(`${label}长度必须在 8 到 128 位之间。`);
      }
      throw error;
    }
  }

  private validateAssessmentScoreSummary(
    assessmentType: string,
    scoreSummary: Prisma.JsonObject,
  ) {
    this.normalizeAssessmentScoreSummaryByType(assessmentType, scoreSummary);
  }

  private normalizeAssessmentScoreSummaryByType(
    assessmentType: string,
    scoreSummary: Prisma.JsonObject,
  ) {
    if (this.isAd8AssessmentType(assessmentType)) {
      return this.normalizeAd8AssessmentScoreSummary(scoreSummary);
    }

    return this.normalizeAssessmentScoreSummary(scoreSummary);
  }

  private normalizeAssessmentScoreSummary(scoreSummary: Prisma.JsonObject) {
    const requiredFields = [
      'mmse',
      'cdr',
      'memory',
      'orientation',
      'executive',
      'language',
    ] as const;
    const normalized: Prisma.JsonObject = {};
    for (const field of requiredFields) {
      normalized[field] = this.requiredNumber(
        scoreSummary[field],
        '评估分数字段不完整：mmse、cdr、memory、orientation、executive、language 为必填。',
      );
    }

    this.assertRange(
      Number(normalized.mmse),
      0,
      30,
      'MMSE 分数必须在 0 到 30 之间。',
    );
    this.assertRange(
      Number(normalized.cdr),
      0,
      3,
      'CDR 分数必须在 0 到 3 之间。',
    );
    for (const field of ['memory', 'orientation', 'executive', 'language']) {
      this.assertRange(
        Number(normalized[field]),
        0,
        100,
        '评估分项分数必须在 0 到 100 之间。',
      );
    }
    return normalized;
  }

  private normalizeAd8AssessmentScoreSummary(scoreSummary: Prisma.JsonObject) {
    const normalized: Prisma.JsonObject = {};
    let total = 0;

    for (const field of ad8AssessmentItemFields) {
      const value = this.requiredInteger(
        scoreSummary[field],
        'AD-8 评估分数字段不完整：8 个题项均为必填。',
      );
      if (value !== 0 && value !== 1) {
        throw new BadRequestException('AD-8 每个题项只能填写 0 或 1。');
      }
      normalized[field] = value;
      total += value;
    }

    const ad8Total = this.requiredInteger(
      scoreSummary.ad8Total,
      'AD-8 总分不能为空。',
    );
    this.assertRange(ad8Total, 0, 8, 'AD-8 总分必须在 0 到 8 之间。');
    if (ad8Total !== total) {
      throw new BadRequestException('AD-8 总分必须等于 8 个题项得分之和。');
    }
    normalized.ad8Total = ad8Total;
    return normalized;
  }

  private validateAd8Informant(value: unknown) {
    const informant = this.requiredJsonObject(
      value,
      'AD-8 必须记录信息提供者，不能跳过家属/照护者访谈来源。',
    );
    this.requiredString(informant.name, 'AD-8 信息提供者姓名不能为空。');
    this.requiredString(informant.relation, 'AD-8 信息提供者关系不能为空。');
  }

  private isAd8AssessmentType(assessmentType: string) {
    return assessmentType.trim().toUpperCase() === 'AD-8';
  }

  private assertProductionAiAssessmentSource(source: string) {
    if (!this.isProductionAiAssessmentSource(source)) {
      throw new BadRequestException(
        '正式评估来源必须为 production_ai_assessment 或 speech_ai_assessment。',
      );
    }
  }

  private async acceptProviderOperation(
    user: RequestUser,
    patientId: string,
    operation:
      | 'assessment_draft'
      | 'conversation_turn'
      | 'speech_transcript'
      | 'tts_output',
    idempotencyKey: unknown,
    request: unknown,
    runtime: ProviderOperationRuntimeMetadata,
    expectedBusinessObject?: { type: string; id: string; version: string },
  ): Promise<AcceptedProviderOperation | undefined> {
    // The customer Mac launcher uses local Secret values and therefore does
    // not run with NODE_ENV=production. Real provider calls still need the
    // same operation-ledger evidence in that environment so a returned AI
    // draft can be bound to the formal assessment it creates.
    if (
      !this.providerOperationService &&
      process.env.NODE_ENV !== 'production'
    ) {
      return undefined;
    }

    const usageOperation = this.providerOperationUsageOperation(operation);
    const clientIdempotencyKey = requireMimoUsageIdempotencyKey(idempotencyKey);
    const scope = await this.resolveProviderOperationScope(
      user,
      patientId,
      usageOperation,
    );
    const accepted = await this.requireProviderOperationService(
      usageOperation,
    ).createOrReadAccepted({
      identity: {
        organizationId: scope.organizationId,
        patientId: scope.patientId,
        actorUserId: scope.userId,
        operation,
        clientIdempotencyKey,
      },
      request,
      provider: runtime.provider,
      modelVersion: runtime.modelVersion,
      endpoint: runtime.endpoint,
      apiKeyRef: runtime.apiKeyRef,
      ...(runtime.promptVersion
        ? { promptVersion: runtime.promptVersion }
        : {}),
      ...(expectedBusinessObject ? { expectedBusinessObject } : {}),
    });

    if (accepted.status !== 'accepted') {
      throw new ConflictException(
        accepted.status === 'reserved'
          ? '该幂等键的共享配额预留状态无法安全恢复，等待人工核对，不能外呼。'
          : '该幂等键对应的供应商调用已处理或等待人工核对，不能再次外呼。',
      );
    }
    return accepted;
  }

  private async reserveAcceptedProviderOperation(
    operation: AcceptedProviderOperation | undefined,
  ) {
    if (!operation) return;
    if (operation.status !== 'accepted') {
      throw new ConflictException(
        '只有新接受的供应商操作可以进入共享配额预留。',
      );
    }
    await this.requireProviderOperationService(
      this.providerOperationUsageOperation(operation.operation),
    ).reserve(operation.id);
  }

  private async markProviderOperationDispatching(
    operation: AcceptedProviderOperation | undefined,
  ) {
    if (!operation) return;
    await this.requireProviderOperationService(
      this.providerOperationUsageOperation(operation.operation),
    ).markDispatching(operation.id, new Date());
  }

  private async finalizeProviderOperation(
    operation: AcceptedProviderOperation | undefined,
    input: {
      status:
        | 'completed'
        | 'provider_failed'
        | 'response_rejected'
        | 'outcome_unknown';
      providerRespondedAt: Date;
      providerCallId?: string;
      providerRequestId?: string;
      response?: unknown;
      failureCategory?: string;
    },
  ): Promise<ProviderOperationSnapshot | undefined> {
    if (!operation) return undefined;
    return this.requireProviderOperationService(
      this.providerOperationUsageOperation(operation.operation),
    ).finalize({
      operationId: operation.id,
      ...input,
    });
  }

  private async finalizeProviderOperationInTransaction(
    tx: Prisma.TransactionClient,
    operation: AcceptedProviderOperation | undefined,
    input: {
      status:
        | 'completed'
        | 'provider_failed'
        | 'response_rejected'
        | 'outcome_unknown';
      providerRespondedAt: Date;
      providerCallId?: string;
      providerRequestId?: string;
      response?: unknown;
      failureCategory?: string;
    },
  ): Promise<ProviderOperationSnapshot | undefined> {
    if (!operation) return undefined;
    return this.requireProviderOperationService(
      this.providerOperationUsageOperation(operation.operation),
    ).finalizeInTransaction(tx, {
      operationId: operation.id,
      ...input,
    });
  }

  private requireProviderOperationService(operation: ProviderOperation) {
    if (this.providerOperationService) return this.providerOperationService;
    emitProductionRuntimeEvent({
      eventCode: 'mimo.provider.failed',
      operation,
      failureStage: 'provider_call',
    });
    throw new ServiceUnavailableException(
      '供应商操作账本未初始化，已阻断高成本供应商调用。',
    );
  }

  private async resolveProviderOperationScope(
    user: RequestUser,
    patientId: string,
    operation: ProviderOperation,
  ) {
    const patient = await this.prisma.patientProfile
      .findUnique({
        where: { id: patientId },
        select: {
          id: true,
          responsibleDoctor: { select: { organizationId: true } },
        },
      })
      .catch((error: unknown) => {
        emitProductionRuntimeEvent({
          eventCode: 'mimo.high_cost.rejected',
          operation,
          reasonCode: 'scope_unavailable',
        });
        throw error;
      });
    if (!patient?.responsibleDoctor.organizationId) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.high_cost.rejected',
        operation,
        reasonCode: 'scope_unavailable',
      });
      throw new ServiceUnavailableException(
        '患者所属机构未就绪，已阻断供应商调用。',
      );
    }
    return {
      userId: user.id,
      patientId: patient.id,
      organizationId: patient.responsibleDoctor.organizationId,
    };
  }

  private providerOperationUsageOperation(
    operation:
      | 'assessment_draft'
      | 'conversation_turn'
      | 'speech_transcript'
      | 'tts_output',
  ): ProviderOperation {
    if (operation === 'speech_transcript') return 'speech';
    if (operation === 'tts_output') return 'tts';
    return 'ai';
  }

  private async reserveMimoUsage(
    user: RequestUser,
    patientId: string,
    operation: 'ai' | 'speech' | 'tts',
    idempotencyKey: unknown,
    quantity?: number,
  ) {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    if (!this.mimoUsageGate) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.high_cost.rejected',
        operation,
        reasonCode: 'gate_uninitialized',
      });
      throw new ServiceUnavailableException(
        '共享 AI 配额服务未初始化，已阻断供应商调用。',
      );
    }
    const patient = await this.prisma.patientProfile
      .findUnique({
        where: { id: patientId },
        select: {
          id: true,
          responsibleDoctor: { select: { organizationId: true } },
        },
      })
      .catch((error: unknown) => {
        emitProductionRuntimeEvent({
          eventCode: 'mimo.high_cost.rejected',
          operation,
          reasonCode: 'scope_unavailable',
        });
        throw error;
      });
    if (!patient?.responsibleDoctor.organizationId) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.high_cost.rejected',
        operation,
        reasonCode: 'scope_unavailable',
      });
      throw new ServiceUnavailableException(
        '患者所属机构未就绪，已阻断供应商调用。',
      );
    }
    const requiredIdempotencyKey = this.requiredString(
      idempotencyKey,
      '高成本调用必须提供幂等键。',
    );
    try {
      await this.mimoUsageGate.reserve({
        operation,
        scope: {
          userId: user.id,
          patientId: patient.id,
          organizationId: patient.responsibleDoctor.organizationId,
        },
        idempotencyKey: requiredIdempotencyKey,
        quantity,
      });
    } catch (error) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.high_cost.rejected',
        operation,
        reasonCode:
          error instanceof MimoQuotaExceededException
            ? 'quota_exceeded'
            : error instanceof ConflictException
              ? 'duplicate_or_invalid_request'
              : 'key_value_unavailable',
      });
      throw error;
    }
  }

  private async recordProviderTelemetry(record: ProviderTelemetryRecord) {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    if (!this.providerTelemetry) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.provider.telemetry_write.failed',
        operation: record.operation,
      });
      throw new ServiceUnavailableException(
        '供应商遥测服务未初始化，已阻断高成本供应商调用。',
      );
    }
    try {
      await this.providerTelemetry.record(record);
    } catch {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.provider.telemetry_write.failed',
        operation: record.operation,
      });
      throw new ServiceUnavailableException(
        '供应商遥测记录失败，已阻断高成本供应商调用。',
      );
    }
  }

  private hashBase64ForEvidence(value: string) {
    return createHash('sha256')
      .update(Buffer.from(value, 'base64'))
      .digest('hex');
  }

  private requireAiRuntimeConfig(): AiRuntimeConfig {
    if (process.env.AI_REQUIRED_FOR_LAUNCH !== 'true') {
      throw new BadRequestException(
        'AI 评估草稿要求 AI_REQUIRED_FOR_LAUNCH=true，当前未启用正式 AI 能力。',
      );
    }
    if (process.env.AI_HUMAN_REVIEW_REQUIRED !== 'true') {
      throw new BadRequestException('AI 评估草稿必须要求人工复核。');
    }

    const provider = this.requiredAiRuntimeText(
      process.env.AI_PROVIDER,
      'AI 供应商',
    );
    if (provider !== 'xiaomi-mimo') {
      throw new BadRequestException('当前 AI 评估接口仅支持小米 MiMo 协议。');
    }
    const modelVersion = this.requiredAiRuntimeText(
      process.env.AI_MODEL_VERSION,
      'AI 模型版本',
    );
    const endpoint = this.requiredAiHttpsEndpoint(
      process.env.AI_MODEL_ENDPOINT,
      'AI 模型 endpoint',
    );
    const mimoSecret = requireMimoApiKey();
    const apiKey = mimoSecret.key;
    const promptVersion = this.requiredAiRuntimeText(
      process.env.AI_PROMPT_VERSION,
      'AI 提示词版本',
    );
    const requestLimits = requireMimoProviderRequestLimits('ai');

    return {
      provider,
      modelVersion,
      endpoint,
      chatCompletionsEndpoint:
        endpoint.endsWith('/chat/completions') ||
        endpoint.endsWith('/chat/completions/')
          ? endpoint.replace(/\/$/, '')
          : `${endpoint.replace(/\/$/, '')}/chat/completions`,
      apiKey,
      apiKeyRef: mimoSecret.ref,
      promptVersion,
      requestLimits,
    };
  }

  private requireSpeechRuntimeConfig(): SpeechRuntimeConfig {
    if (process.env.SPEECH_REQUIRED_FOR_LAUNCH !== 'true') {
      throw new BadRequestException(
        '语音转写要求 SPEECH_REQUIRED_FOR_LAUNCH=true，当前未启用正式语音能力。',
      );
    }

    const provider = this.requiredAiRuntimeText(
      process.env.SPEECH_PROVIDER,
      '语音识别供应商',
    );
    if (provider !== 'xiaomi-mimo-audio-understanding') {
      throw new BadRequestException(
        '当前语音转写接口仅支持小米 MiMo 音频理解协议。',
      );
    }
    const endpoint = this.requiredAiHttpsEndpoint(
      process.env.SPEECH_TO_TEXT_ENDPOINT,
      '语音转文字 endpoint',
    );
    const mimoSecret = requireMimoApiKey();
    const apiKeyRef = mimoSecret.ref;
    const modelVersion = this.requiredAiRuntimeText(
      process.env.SPEECH_MODEL_VERSION,
      '语音模型版本',
    );
    if (modelVersion !== 'mimo-v2.5-asr') {
      throw new BadRequestException(
        '语音模型版本必须是小米 MiMo 当前支持的 mimo-v2.5-asr。',
      );
    }
    const apiKey = mimoSecret.key;
    const requestLimits = requireMimoProviderRequestLimits('speech');
    const inputLimits = requireSttInputLimits();

    return {
      provider,
      modelVersion,
      endpoint,
      apiKey,
      apiKeyRef,
      requestLimits,
      inputLimits,
    };
  }

  private requireTtsRuntimeConfig(): TtsRuntimeConfig {
    if (process.env.TTS_REQUIRED_FOR_LAUNCH !== 'true') {
      throw new BadRequestException(
        '语音输出要求 TTS_REQUIRED_FOR_LAUNCH=true，当前未启用正式 TTS 能力。',
      );
    }

    const provider = this.requiredAiRuntimeText(
      process.env.TTS_PROVIDER,
      'TTS 供应商',
    );
    if (provider !== 'xiaomi-mimo-tts') {
      throw new BadRequestException(
        '当前语音输出接口仅支持小米 MiMo TTS 协议。',
      );
    }
    const endpoint = this.requiredAiHttpsEndpoint(
      process.env.TTS_ENDPOINT,
      'TTS endpoint',
    );
    const mimoSecret = requireMimoApiKey();
    const apiKeyRef = mimoSecret.ref;
    const modelVersion = this.requiredAiRuntimeText(
      process.env.TTS_MODEL_VERSION,
      'TTS 模型版本',
    );
    if (
      ![
        'mimo-v2.5-tts',
        'mimo-v2.5-tts-voicedesign',
        'mimo-v2.5-tts-voiceclone',
      ].includes(modelVersion)
    ) {
      throw new BadRequestException(
        'TTS 模型版本必须是小米 MiMo-V2.5-TTS 系列。',
      );
    }
    const voiceId = this.requiredAiRuntimeText(
      process.env.TTS_VOICE_ID,
      'TTS 音色',
    );
    const outputFormat = this.requiredAiRuntimeText(
      process.env.TTS_OUTPUT_FORMAT,
      'TTS 输出格式',
    );
    if (outputFormat !== 'mp3' && outputFormat !== 'wav') {
      throw new BadRequestException('TTS 输出格式必须是 mp3 或 wav。');
    }
    const apiKey = mimoSecret.key;
    const requestLimits = requireMimoProviderRequestLimits('tts');

    return {
      provider,
      modelVersion,
      endpoint,
      apiKey,
      apiKeyRef,
      requestLimits,
      voiceId,
      outputFormat,
      outputMimeType: outputFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav',
    };
  }

  private validateSpeechAudioInput(
    value: unknown,
    limits: ReturnType<typeof requireSttInputLimits>,
  ): SpeechAudioInput {
    const audio = this.requiredJsonObject(value, '语音转写必须提供音频内容。');
    const contentBase64 = this.requiredString(
      audio.contentBase64,
      '语音转写音频不能为空。',
    );
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) {
      throw new BadRequestException('语音转写音频必须是有效 Base64。');
    }
    const byteLength = Buffer.byteLength(contentBase64, 'base64');
    if (byteLength <= 0) {
      throw new BadRequestException('语音转写音频不能为空。');
    }
    if (byteLength > limits.maxDecodedAudioBytes) {
      throw new BadRequestException(
        `语音转写音频解码后不能超过 ${limits.maxDecodedAudioBytes} 字节。`,
      );
    }
    const mimeType = this.requiredString(
      audio.mimeType,
      '语音转写音频类型不能为空。',
    );
    if (
      !xiaomiSpeechAudioMimeTypes.includes(
        mimeType as (typeof xiaomiSpeechAudioMimeTypes)[number],
      )
    ) {
      throw new BadRequestException(
        '语音转写音频类型必须是小米支持的正式音频格式：audio/wav、audio/mpeg、audio/mp4、audio/ogg 或 audio/flac。',
      );
    }
    const durationSeconds = this.requiredNumber(
      audio.durationSeconds,
      '语音转写音频时长不能为空。',
    );
    if (
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > limits.maxDurationSeconds
    ) {
      throw new BadRequestException(
        `语音转写音频时长必须是 1 到 ${limits.maxDurationSeconds} 之间的整数秒。`,
      );
    }
    return { contentBase64, mimeType, durationSeconds };
  }

  private validateTtsSynthesisInput(
    dto: TtsSpeechOutputDto,
  ): TtsSynthesisInput {
    const text = this.requiredString(dto.text, 'TTS 合成文本不能为空。');
    if (text.length < 2 || text.length > 240) {
      throw new BadRequestException('TTS 合成文本长度必须在 2 到 240 字之间。');
    }
    this.assertNoDemoMockLocalManual(text, 'TTS 合成文本');

    const scenario =
      this.optionalString(dto.scenario, 'TTS 播放场景必须是文本。') ??
      'training_cue';
    this.assertNoDemoMockLocalManual(scenario, 'TTS 播放场景');
    if (
      !['training_cue', 'training_encouragement', 'assessment_prompt'].includes(
        scenario,
      )
    ) {
      throw new BadRequestException(
        'TTS 播放场景必须是 training_cue、training_encouragement 或 assessment_prompt。',
      );
    }

    return {
      text,
      scenario,
      styleInstruction:
        '使用清晰、温和、适合老年康复训练的普通话语气，语速适中，避免夸张或惊吓。',
    };
  }

  private requiredAiRuntimeText(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    this.assertNoDemoMockLocalManual(text, label);
    return text;
  }

  private requiredAiHttpsEndpoint(value: unknown, label: string) {
    const endpoint = this.requiredAiRuntimeText(value, label);
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException(`${label} 必须是有效的 HTTPS 地址。`);
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException(`${label} 必须使用 HTTPS。`);
    }
    if (url.username || url.password) {
      throw new BadRequestException(`${label} 不能包含访问凭据。`);
    }
    for (const queryName of url.searchParams.keys()) {
      if (
        /authorization|api[-_ ]?key|token|secret|password|credential|cookie/i.test(
          queryName,
        )
      ) {
        throw new BadRequestException(
          `${label} 不能在查询参数中包含访问凭据。`,
        );
      }
    }
    this.assertNoDemoMockLocalManual(url.hostname, label);
    if (
      ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) ||
      url.hostname.endsWith('.local')
    ) {
      throw new BadRequestException(`${label} 不能指向本地或测试地址。`);
    }
    return endpoint.replace(/\/$/, '');
  }

  private async callOpenAiCompatibleAssessmentModel(
    config: AiRuntimeConfig,
    assessmentType: string,
    transcript: string,
    physicalConditions?: string[],
  ) {
    const responseBody = await this.requestMimoProviderJson(
      config.chatCompletionsEndpoint,
      {
        method: 'POST',
        redirect: 'error',
        timeoutMs: config.requestLimits.timeoutMs,
        maxResponseBytes: config.requestLimits.maxResponseBytes,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.modelVersion,
          temperature: 0.1,
          thinking: { type: 'disabled' },
          max_completion_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '你是认知康复平台的评估助手。只返回 JSON，不要返回 Markdown。用户 JSON 的 assessmentType 决定唯一允许使用的量表路径和 scoreSummary 字段：不得自行切换量表、混用其他路径字段或省略必填字段。JSON 必须包含 scoreSummary、analysisSummary、confidence；可包含 physicalConditions 字符串数组，用于列出评估中明确识别的身体状况。所有 scoreSummary 字段和 confidence 必须是 JSON number，不能使用文本或数字字符串。confidence 必须在 0 到 1（含边界）之间，例如 0.82；禁止使用 "high"、"medium"、"low" 或任何其他文本。若 assessmentType 为 AD-8，必须先将 8 个题项逐项相加，再将精确相等的整数写入 ad8Total；不一致的结果不得返回。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                assessmentType,
                transcript,
                ...(physicalConditions === undefined
                  ? {}
                  : { physicalConditions }),
                responseContract: {
                  assessmentType:
                    '必须严格使用请求中的 assessmentType，不能自行切换量表路径。',
                  scoreSummary:
                    '必须且只能包含 requiredScoreSummaryFields 中列出的 JSON number 字段，并逐项满足 scoreRules。',
                  analysisSummary: '中文评估摘要字符串。',
                  confidence:
                    '0 到 1（含边界）的 JSON number，例如 0.82；不得使用文本或字符串。',
                  physicalConditions:
                    '可选，且仅在有明确证据时提供字符串数组。',
                },
                ...this.assessmentModelScoreInstructions(assessmentType),
              }),
            },
          ],
        }),
      },
    );
    const { callId, message } = this.requireMimoProviderMessage(
      responseBody,
      'AI 评估模型',
    );
    return {
      callId,
      content: this.requireMimoProviderContent(
        message,
        callId,
        'AI 评估模型响应内容不能为空。',
      ),
    };
  }

  private async callOpenAiCompatibleConversationModel(
    config: AiRuntimeConfig,
    assessmentType: string,
    previousMessages: Array<{ role: string; content: string }>,
    content: string,
    physicalConditions?: string[],
  ) {
    const responseBody = await this.requestMimoProviderJson(
      config.chatCompletionsEndpoint,
      {
        method: 'POST',
        redirect: 'error',
        timeoutMs: config.requestLimits.timeoutMs,
        maxResponseBytes: config.requestLimits.maxResponseBytes,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.modelVersion,
          temperature: 0.2,
          thinking: { type: 'disabled' },
          max_completion_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '你是认知康复平台的连续评估访谈助手。只返回 JSON，不要返回 Markdown。JSON 必须包含 reply 字段，可选 evidence 对象。不要生成诊断结论，最终结果必须交给医生复核。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                assessmentType,
                ...(physicalConditions === undefined
                  ? {}
                  : { physicalConditions }),
                previousTurns: previousMessages.map((message) => ({
                  role: message.role,
                  content: message.content,
                })),
                message: content,
                responseContract: {
                  reply: '下一轮面向患者或医生的中文追问或整理',
                  evidence: '脱敏结构化元数据，不包含原始请求或响应正文',
                },
              }),
            },
          ],
        }),
      },
    );
    const { callId, message } = this.requireMimoProviderMessage(
      responseBody,
      'AI 会话模型',
    );
    return {
      callId,
      content: this.requireMimoProviderContent(
        message,
        callId,
        'AI 会话模型响应内容不能为空。',
      ),
    };
  }

  private parseAiConversationReplyPayload(modelResponse: {
    callId: string;
    content: string;
  }) {
    let payload: Prisma.JsonObject;
    try {
      payload = this.requiredJsonObject(
        JSON.parse(modelResponse.content) as unknown,
        'AI 会话回复必须是 JSON 对象。',
      );
    } catch {
      throw new BadRequestException(
        'AI 会话模型未返回有效 JSON，不能生成回复。',
      );
    }
    const reply = this.requiredString(
      payload.reply,
      'AI 会话回复缺少 reply 字段。',
    );
    const evidence =
      payload.evidence === undefined
        ? {}
        : this.requiredJsonObject(
            payload.evidence,
            'AI 会话 evidence 必须是结构化对象。',
          );
    return { reply, evidence };
  }

  private assessmentModelScoreInstructions(assessmentType: string) {
    if (this.isAd8AssessmentType(assessmentType)) {
      return {
        requiredScoreSummaryFields: ['ad8Total', ...ad8AssessmentItemFields],
        scoreRules: {
          ad8Total: '0-8 integer; must equal sum of the 8 AD-8 item scores',
          itemMemoryProblems: '0 or 1',
          itemReducedInterest: '0 or 1',
          itemRepeatsQuestions: '0 or 1',
          itemTroubleLearningTools: '0 or 1',
          itemForgetsMonthYear: '0 or 1',
          itemHandlesFinancesPoorly: '0 or 1',
          itemTroubleAppointments: '0 or 1',
          itemDailyThinkingMemoryProblems: '0 or 1',
        },
        validationChecklist: [
          'assessmentType must remain AD-8',
          'scoreSummary must contain exactly ad8Total plus the 8 named AD-8 item fields',
          'every AD-8 item score must be the JSON number 0 or 1',
          'calculate ad8Total as the arithmetic sum of the 8 item scores before returning',
          'ad8Total must exactly equal that sum',
        ],
      };
    }

    return {
      requiredScoreSummaryFields: [
        'mmse',
        'cdr',
        'memory',
        'orientation',
        'executive',
        'language',
      ],
      scoreRules: {
        mmse: '0-30',
        cdr: '0-3',
        memory: '0-100',
        orientation: '0-100',
        executive: '0-100',
        language: '0-100',
      },
      validationChecklist: [
        'assessmentType must remain MMSE/CDR',
        'scoreSummary must contain exactly mmse, cdr, memory, orientation, executive, and language',
        'every scoreSummary field must be a JSON number within scoreRules',
        'do not return any AD-8 field',
      ],
    };
  }

  private async callXiaomiAudioUnderstandingForTranscript(
    config: SpeechRuntimeConfig,
    audio: SpeechAudioInput,
  ) {
    const audioData = `data:${audio.mimeType};base64,${audio.contentBase64}`;
    const responseBody = await this.requestMimoProviderJson(config.endpoint, {
      method: 'POST',
      redirect: 'error',
      timeoutMs: config.requestLimits.timeoutMs,
      maxResponseBytes: config.requestLimits.maxResponseBytes,
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.modelVersion,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: audioData,
                },
              },
            ],
          },
        ],
        asr_options: {
          language: 'zh',
        },
      }),
    });
    const { callId, message } = this.requireMimoProviderMessage(
      responseBody,
      '语音转写模型',
    );
    return {
      callId,
      content: this.requireMimoProviderContent(
        message,
        callId,
        '语音转写模型响应内容不能为空。',
      ),
    };
  }

  private async callXiaomiTtsForSpeechOutput(
    config: TtsRuntimeConfig,
    synthesisInput: TtsSynthesisInput,
  ) {
    const responseBody = await this.requestMimoProviderJson(config.endpoint, {
      method: 'POST',
      redirect: 'error',
      timeoutMs: config.requestLimits.timeoutMs,
      maxResponseBytes: config.requestLimits.maxResponseBytes,
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.modelVersion,
        messages: [
          {
            role: 'user',
            content: synthesisInput.styleInstruction,
          },
          {
            role: 'assistant',
            content: synthesisInput.text,
          },
        ],
        audio: {
          format: config.outputFormat,
          voice: config.voiceId,
        },
      }),
    });
    const { callId, message } = this.requireMimoProviderMessage(
      responseBody,
      'TTS 模型',
    );
    return { callId, message };
  }

  private async requestMimoProviderJson(
    input: string,
    options: NonNullable<Parameters<typeof requestProviderJson>[1]>,
  ) {
    try {
      return await requestProviderJson(input, options);
    } catch (error) {
      if (!(error instanceof ProviderRequestError)) {
        throw error;
      }
      if (error.kind === 'invalid_response') {
        throw new ProviderResponseRejectedException();
      }
      throw new ProviderUnavailableException(error);
    }
  }

  private requireMimoProviderMessage(
    responseBody: unknown,
    providerLabel: string,
  ) {
    let callId: string | undefined;
    try {
      const body = this.requiredJsonObject(
        responseBody,
        `${providerLabel}响应格式无效。`,
      );
      callId = this.requiredString(
        body.id,
        `${providerLabel}响应缺少调用 ID。`,
      );
      const choices = Array.isArray(body.choices) ? body.choices : [];
      const firstChoice = this.requiredJsonObject(
        choices[0],
        `${providerLabel}响应缺少候选结果。`,
      );
      return {
        callId,
        message: this.requiredJsonObject(
          firstChoice.message,
          `${providerLabel}响应缺少消息内容。`,
        ),
      };
    } catch {
      throw new ProviderResponseRejectedException(callId);
    }
  }

  private requireMimoProviderContent(
    message: Prisma.JsonObject,
    callId: string,
    errorMessage: string,
  ) {
    try {
      return this.requiredString(message.content, errorMessage);
    } catch {
      throw new ProviderResponseRejectedException(callId);
    }
  }

  private providerResponseRejection(error: unknown, callId?: string) {
    return error instanceof ProviderResponseRejectedException
      ? error
      : new ProviderResponseRejectedException(callId);
  }

  private parseAiAssessmentDraftPayload(modelResponse: {
    callId: string;
    content: string;
  }) {
    try {
      return this.requiredJsonObject(
        JSON.parse(modelResponse.content) as unknown,
        'AI 评估草稿必须是 JSON 对象。',
      );
    } catch {
      throw new BadRequestException(
        'AI 评估模型未返回有效 JSON，不能生成草稿。',
      );
    }
  }

  private parseSpeechTranscriptPayload(providerResponse: {
    callId: string;
    content: string;
  }) {
    const transcript = this.requiredString(
      providerResponse.content,
      '语音转写模型响应内容不能为空。',
    );
    if (transcript.length < 2) {
      throw new BadRequestException('语音转写文本过短，不能生成转写。');
    }
    return transcript;
  }

  private parseTtsSpeechOutputPayload(
    providerResponse: { callId: string; message: Prisma.JsonObject },
    config: TtsRuntimeConfig,
  ) {
    const audio = this.requiredJsonObject(
      providerResponse.message.audio,
      'TTS 模型响应缺少音频内容。',
    );
    const audioBase64 = this.requiredString(
      audio.data,
      'TTS 模型响应音频不能为空。',
    );
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) {
      throw new BadRequestException('TTS 模型响应音频必须是有效 Base64。');
    }
    const byteLength = Buffer.byteLength(audioBase64, 'base64');
    if (byteLength <= 0) {
      throw new BadRequestException('TTS 模型响应音频不能为空。');
    }
    const maxAudioBytes = 10 * 1024 * 1024;
    if (byteLength > maxAudioBytes) {
      throw new BadRequestException('TTS 模型响应音频不能超过 10MB。');
    }
    const audioBytes = Buffer.from(audioBase64, 'base64');
    this.assertTtsAudioBytesMatchFormat(audioBytes, config.outputFormat);
    return {
      contentBase64: audioBase64,
      mimeType: config.outputMimeType,
      byteLength,
    };
  }

  private assertTtsAudioBytesMatchFormat(
    audioBytes: Buffer,
    format: 'mp3' | 'wav',
  ) {
    if (format === 'wav') {
      const isWav =
        audioBytes.length >= 12 &&
        audioBytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        audioBytes.subarray(8, 12).toString('ascii') === 'WAVE';
      if (!isWav) {
        throw new BadRequestException('TTS 模型响应音频不是有效 WAV 数据。');
      }
      return;
    }

    const hasId3Header =
      audioBytes.length >= 3 &&
      audioBytes.subarray(0, 3).toString('ascii') === 'ID3';
    const hasMp3FrameSync =
      audioBytes.length >= 2 &&
      audioBytes[0] === 0xff &&
      (audioBytes[1] & 0xe0) === 0xe0;
    if (!hasId3Header && !hasMp3FrameSync) {
      throw new BadRequestException('TTS 模型响应音频不是有效 MP3 数据。');
    }
  }

  private hashTextForEvidence(text: string) {
    return createHash('sha256').update(text).digest('hex');
  }

  private assertProductionAssessmentEvidence(
    rawInputSummary: Prisma.JsonObject,
    source: string,
  ) {
    if (!this.isProductionAiAssessmentSource(source)) {
      return;
    }

    const evidence = this.requiredJsonObject(
      rawInputSummary.evidence,
      '生产 AI/语音评估必须提供供应商调用证据。',
    );
    const aiEvidence = this.isSpeechAiAssessmentSource(source)
      ? this.requiredJsonObject(
          evidence.ai,
          '语音 AI 评估必须提供 AI 供应商调用证据。',
        )
      : evidence;
    this.assertProductionAiCallEvidence(aiEvidence);
    this.assertProductionHumanReviewEvidence(evidence.humanReview);

    if (this.isSpeechAiAssessmentSource(source)) {
      const speech = this.requiredJsonObject(
        evidence.speech,
        '语音 AI 评估必须提供语音转写供应商调用证据。',
      );
      this.assertProductionSpeechCallEvidence(speech);
    }
  }

  private async assertProductionAssessmentEvidenceBoundToProviderLedger(
    patientId: string,
    scoreSummary: Prisma.JsonObject,
    rawInputSummary: Prisma.JsonObject,
    transcript: string,
    analysisSummary: string,
    physicalConditions: AssessmentPhysicalCondition[],
    source: string,
  ) {
    if (!this.isProductionAiAssessmentSource(source)) {
      return;
    }

    const evidence = this.requiredJsonObject(
      rawInputSummary.evidence,
      '生产 AI/语音评估必须提供供应商调用证据。',
    );
    const aiEvidence = this.isSpeechAiAssessmentSource(source)
      ? this.requiredJsonObject(
          evidence.ai,
          '语音 AI 评估必须提供 AI 供应商调用证据。',
        )
      : evidence;

    const aiResult = await this.assertProviderLedgerEvidence(
      patientId,
      'assessment_draft',
      aiEvidence,
      'AI 评估供应商调用',
    );
    this.assertAiAssessmentLedgerResultMatches(
      aiResult,
      scoreSummary,
      transcript,
      analysisSummary,
      physicalConditions,
    );
    if (this.isSpeechAiAssessmentSource(source)) {
      const speechEvidence = this.requiredJsonObject(
        evidence.speech,
        '语音 AI 评估必须提供语音转写供应商调用证据。',
      );
      const speechResult = await this.assertProviderLedgerEvidence(
        patientId,
        'speech_transcript',
        speechEvidence,
        '语音转写供应商调用',
      );
      this.assertSpeechAssessmentLedgerResultMatches(
        speechResult,
        transcript,
        physicalConditions,
      );
    }
  }

  private async assertProviderLedgerEvidence(
    patientId: string,
    operation: Extract<
      ProviderOperationKind,
      'assessment_draft' | 'speech_transcript'
    >,
    evidence: Prisma.JsonObject,
    label: string,
  ) {
    const provider = this.requiredProductionEvidenceText(
      evidence.provider,
      `${label}供应商`,
    );
    const modelVersion = this.requiredProductionEvidenceText(
      evidence.modelVersion,
      `${label}模型版本`,
    );
    const callId = this.requiredProductionEvidenceText(
      evidence.callId,
      `${label}调用 ID`,
    );
    const endpointRef = this.assertProductionEvidenceHttpsRef(
      evidence.endpointRef,
      `${label} endpoint`,
    );
    const endpointHost = new URL(endpointRef).host;
    const ledgerOperation = await this.prisma.providerOperation.findFirst({
      where: {
        patientId,
        operation,
        providerCallId: callId,
        status: 'completed',
      },
      select: {
        id: true,
        provider: true,
        modelVersion: true,
        endpointHost: true,
        responseCiphertext: true,
        responseHmac: true,
      },
    });
    if (!ledgerOperation) {
      throw new BadRequestException(
        `${label}未在供应商操作账本中找到已完成且匹配的调用记录。`,
      );
    }
    if (
      ledgerOperation.provider !== provider ||
      ledgerOperation.modelVersion !== modelVersion ||
      ledgerOperation.endpointHost !== endpointHost
    ) {
      throw new BadRequestException(
        `${label}证据与供应商操作账本不匹配，不能入库。`,
      );
    }
    return this.readProviderOperationResponseResult(ledgerOperation, label);
  }

  private readProviderOperationResponseResult(
    ledgerOperation: {
      id: string;
      responseCiphertext: Prisma.JsonValue | null;
      responseHmac: string | null;
    },
    label: string,
  ) {
    try {
      const response = decryptSensitiveJson<unknown>(
        ledgerOperation.responseCiphertext,
        {
          tableName: 'provider_operation',
          recordId: ledgerOperation.id,
          fieldName: 'responseCiphertext',
        },
        this.sensitiveEncryptionKey,
      );
      this.assertProviderOperationResponseHmac(
        ledgerOperation.id,
        response,
        ledgerOperation.responseHmac,
      );
      const payload = this.requiredJsonObject(
        response,
        `${label}账本响应证据格式无效。`,
      );
      return this.requiredJsonObject(
        payload.result,
        `${label}账本响应缺少结构化结果。`,
      );
    } catch {
      throw new BadRequestException(`${label}账本响应证据无法验证，不能入库。`);
    }
  }

  private readProviderOperationRequest(
    ledgerOperation: { id: string; requestCiphertext: Prisma.JsonValue },
    label: string,
  ) {
    try {
      return this.requiredJsonObject(
        decryptSensitiveJson<unknown>(
          ledgerOperation.requestCiphertext,
          {
            tableName: 'provider_operation',
            recordId: ledgerOperation.id,
            fieldName: 'requestCiphertext',
          },
          this.sensitiveEncryptionKey,
        ),
        `${label}账本请求证据格式无效。`,
      );
    } catch {
      throw new BadRequestException(`${label}账本请求证据无法验证，不能恢复。`);
    }
  }

  private recoverAiConversationAssessmentDraft(
    ledgerOperation: {
      id: string;
      provider: string;
      modelVersion: string;
      endpointHost: string;
      apiKeyRef: string;
      promptVersion: string | null;
      providerCallId: string | null;
      responseCiphertext: Prisma.JsonValue | null;
      responseHmac: string | null;
    },
    expectedRequest: {
      assessmentType: string;
      transcript: string;
      physicalConditions: AssessmentPhysicalCondition[];
    },
    expectedPatientId: string,
  ) {
    const result = this.readProviderOperationResponseResult(
      ledgerOperation,
      'AI 评估草稿',
    );
    const patientId = this.requiredString(
      result.patientId,
      'AI 评估草稿账本响应缺少患者 ID。',
    );
    if (patientId !== expectedPatientId) {
      throw new BadRequestException(
        'AI 评估草稿账本响应的患者与当前会话不一致。',
      );
    }
    const assessmentType = this.normalizeAiConversationAssessmentType(
      this.requiredString(
        result.assessmentType,
        'AI 评估草稿账本响应缺少评估类型。',
      ),
    );
    if (assessmentType !== expectedRequest.assessmentType) {
      throw new BadRequestException(
        'AI 评估草稿账本响应的评估类型与当前会话不一致。',
      );
    }
    const status = this.requiredString(
      result.status,
      'AI 评估草稿账本响应缺少人工复核状态。',
    );
    if (status !== 'pending_human_review') {
      throw new BadRequestException(
        'AI 评估草稿账本响应不处于待人工复核状态，不能恢复。',
      );
    }
    const scoreSummary = this.normalizeAssessmentScoreSummaryByType(
      assessmentType,
      this.requiredJsonObject(
        result.scoreSummary,
        'AI 评估草稿账本响应缺少结构化评分。',
      ),
    );
    const calculatedRiskLevel = this.calculateRiskLevel(
      assessmentType,
      scoreSummary,
    );
    const riskLevel = this.requiredString(
      result.riskLevel,
      'AI 评估草稿账本响应缺少风险建议。',
    );
    if (riskLevel !== calculatedRiskLevel) {
      throw new BadRequestException(
        'AI 评估草稿账本响应的风险建议与结构化评分不一致。',
      );
    }
    const rawInputSummary = this.requiredJsonObject(
      result.rawInputSummary,
      'AI 评估草稿账本响应缺少分析输入摘要。',
    );
    if (rawInputSummary.source !== 'production_ai_assessment') {
      throw new BadRequestException('AI 评估草稿账本响应来源无效。');
    }
    const transcript = this.requiredString(
      rawInputSummary.transcript,
      'AI 评估草稿账本响应缺少对话转写。',
    );
    if (transcript !== expectedRequest.transcript) {
      throw new BadRequestException(
        'AI 评估草稿账本响应的对话转写与当前会话不一致。',
      );
    }
    this.requiredString(
      rawInputSummary.analysisSummary,
      'AI 评估草稿账本响应缺少分析摘要。',
    );
    const confidence = this.requiredNumber(
      rawInputSummary.confidence,
      'AI 评估草稿账本响应缺少置信度。',
    );
    this.assertRange(
      confidence,
      0,
      1,
      'AI 评估草稿账本响应置信度必须在 0 到 1 之间。',
    );
    const physicalConditions = this.requireExplicitAssessmentPhysicalConditions(
      result.physicalConditions,
      'AI 评估草稿账本响应缺少身体状况。',
    );
    if (
      !isDeepStrictEqual(physicalConditions, expectedRequest.physicalConditions)
    ) {
      throw new BadRequestException(
        'AI 评估草稿账本响应的身体状况与当前会话不一致。',
      );
    }
    const evidence = this.requiredJsonObject(
      rawInputSummary.evidence,
      'AI 评估草稿账本响应缺少供应商证据。',
    );
    const endpointRef = this.assertProductionEvidenceHttpsRef(
      evidence.endpointRef,
      'AI 评估草稿账本响应 endpoint',
    );
    if (
      this.requiredProductionEvidenceText(
        evidence.provider,
        'AI 评估草稿供应商',
      ) !== ledgerOperation.provider ||
      this.requiredProductionEvidenceText(
        evidence.modelVersion,
        'AI 评估草稿模型版本',
      ) !== ledgerOperation.modelVersion ||
      new URL(endpointRef).host !== ledgerOperation.endpointHost ||
      this.requiredProductionEvidenceText(
        evidence.apiKeyRef,
        'AI 评估草稿密钥引用',
      ) !== ledgerOperation.apiKeyRef ||
      this.requiredProductionEvidenceText(
        evidence.promptVersion,
        'AI 评估草稿提示词版本',
      ) !== ledgerOperation.promptVersion ||
      this.requiredProductionEvidenceText(
        evidence.callId,
        'AI 评估草稿调用 ID',
      ) !== ledgerOperation.providerCallId
    ) {
      throw new BadRequestException(
        'AI 评估草稿账本响应的供应商证据与调用记录不一致。',
      );
    }
    return {
      patientId,
      assessmentType,
      status: 'pending_human_review' as const,
      riskLevel: calculatedRiskLevel,
      scoreSummary,
      rawInputSummary,
      physicalConditions,
    };
  }

  private buildAiConversationAssessmentDraftTranscript(input: {
    assessmentType: string;
    messages: Array<{ turnIndex: number; role: string; content: string }>;
    sessionId: string;
    summary: string;
    physicalConditions: AssessmentPhysicalCondition[];
  }) {
    return [
      `AI 对话会话：${input.sessionId}`,
      `评估类型：${input.assessmentType}`,
      `身体状况：${input.physicalConditions.join('、') || '未选择'}`,
      `对话摘要：${input.summary}`,
      '对话消息：',
      ...input.messages.map(
        (message) =>
          `[${message.turnIndex}] ${message.role === 'assistant' ? 'AI' : '患者/录入者'}：${message.content}`,
      ),
    ].join('\n');
  }

  private assertProviderOperationResponseHmac(
    operationId: string,
    response: unknown,
    responseHmac: string | null,
  ) {
    if (!responseHmac || !/^[0-9a-f]{64}$/.test(responseHmac)) {
      throw new Error('Invalid provider operation response HMAC.');
    }
    const hmacKey = Buffer.from(
      hkdfSync(
        'sha256',
        this.sensitiveEncryptionKey.key,
        providerOperationResponseHmacSalt,
        providerOperationResponseHmacInfo,
        32,
      ),
    );
    const expectedHmac = createProviderOperationResponseHmac(
      operationId,
      response,
      hmacKey,
    );
    if (
      !timingSafeEqual(
        Buffer.from(responseHmac, 'hex'),
        Buffer.from(expectedHmac, 'hex'),
      )
    ) {
      throw new Error('Provider operation response HMAC mismatch.');
    }
  }

  private assertAiAssessmentLedgerResultMatches(
    result: Prisma.JsonObject,
    scoreSummary: Prisma.JsonObject,
    transcript: string,
    analysisSummary: string,
    physicalConditions: AssessmentPhysicalCondition[],
  ) {
    const ledgerScoreSummary = this.requiredJsonObject(
      result.scoreSummary,
      'AI 评估供应商调用账本响应缺少评分结果。',
    );
    const ledgerRawInputSummary = this.requiredJsonObject(
      result.rawInputSummary,
      'AI 评估供应商调用账本响应缺少分析结果。',
    );
    const ledgerTranscript = this.requiredString(
      ledgerRawInputSummary.transcript,
      'AI 评估供应商调用账本响应缺少转写内容。',
    );
    const ledgerAnalysisSummary = this.requiredString(
      ledgerRawInputSummary.analysisSummary,
      'AI 评估供应商调用账本响应缺少分析摘要。',
    );
    const ledgerPhysicalConditions =
      this.requireExplicitAssessmentPhysicalConditions(
        result.physicalConditions,
        'AI 评估供应商调用账本响应缺少身体状况。',
      );

    this.assertProviderAssessmentFieldMatches(
      scoreSummary,
      ledgerScoreSummary,
      'scoreSummary',
      'AI 评估',
    );
    this.assertProviderAssessmentFieldMatches(
      transcript,
      ledgerTranscript,
      'transcript',
      'AI 评估',
    );
    this.assertProviderAssessmentFieldMatches(
      analysisSummary,
      ledgerAnalysisSummary,
      'analysisSummary',
      'AI 评估',
    );
    this.assertProviderAssessmentFieldMatches(
      physicalConditions,
      ledgerPhysicalConditions,
      'physicalConditions',
      'AI 评估',
    );
  }

  private assertSpeechAssessmentLedgerResultMatches(
    result: Prisma.JsonObject,
    transcript: string,
    physicalConditions: AssessmentPhysicalCondition[],
  ) {
    const ledgerTranscript = this.requiredString(
      result.transcript,
      '语音转写供应商调用账本响应缺少转写内容。',
    );
    const ledgerPhysicalConditions =
      this.requireExplicitAssessmentPhysicalConditions(
        result.physicalConditions,
        '语音转写供应商调用账本响应缺少身体状况。',
      );

    this.assertProviderAssessmentFieldMatches(
      transcript,
      ledgerTranscript,
      'transcript',
      '语音转写',
    );
    this.assertProviderAssessmentFieldMatches(
      physicalConditions,
      ledgerPhysicalConditions,
      'physicalConditions',
      '语音转写',
    );
  }

  private assertProviderAssessmentFieldMatches(
    submittedValue: unknown,
    ledgerValue: unknown,
    fieldName: string,
    sourceLabel: string,
  ) {
    if (!isDeepStrictEqual(submittedValue, ledgerValue)) {
      throw new BadRequestException(
        `正式评估 ${fieldName} 与${sourceLabel}供应商调用账本响应不一致，不能入库。`,
      );
    }
  }

  private assertProductionAiCallEvidence(evidence: Prisma.JsonObject) {
    this.requiredProductionEvidenceText(evidence.provider, 'AI 供应商');
    this.requiredProductionEvidenceText(evidence.model, 'AI 模型');
    this.requiredProductionEvidenceText(evidence.modelVersion, 'AI 模型版本');
    this.requiredProductionEvidenceText(evidence.callId, 'AI 调用 ID');
    this.assertProductionEvidenceHttpsRef(evidence.endpointRef, 'AI endpoint');
    this.requiredProductionEvidenceText(evidence.promptVersion, '提示词版本');
    this.requiredIsoDate(evidence.calledAt, 'AI 调用时间');
  }

  private assertProductionHumanReviewEvidence(humanReviewValue: unknown) {
    const humanReview = this.requiredJsonObject(
      humanReviewValue,
      '生产 AI/语音评估必须提供人工复核记录。',
    );
    const reviewRequired = this.requiredBoolean(
      humanReview.required,
      '生产 AI/语音评估必须明确人工复核 required=true。',
    );
    if (!reviewRequired) {
      throw new BadRequestException('生产 AI/语音评估必须经过人工复核。');
    }
    this.requiredProductionEvidenceText(
      humanReview.reviewerUserId,
      '人工复核人',
    );
    this.requiredIsoDate(humanReview.reviewedAt, '人工复核时间');
    const conclusion = this.requiredProductionEvidenceText(
      humanReview.conclusion,
      '人工复核结论',
    );
    if (!humanReviewConclusions.includes(conclusion as never)) {
      throw new BadRequestException(
        '人工复核结论必须为 approved、rejected 或 needs_revision。',
      );
    }
    if (conclusion !== 'approved') {
      throw new BadRequestException(
        '生产 AI/语音评估必须经人工复核批准后才能入库。',
      );
    }
  }

  private assertProductionSpeechCallEvidence(speech: Prisma.JsonObject) {
    this.requiredProductionEvidenceText(speech.provider, '语音识别供应商');
    this.requiredProductionEvidenceText(speech.modelVersion, '语音模型版本');
    this.requiredProductionEvidenceText(speech.callId, '语音调用 ID');
    this.assertProductionEvidenceHttpsRef(
      speech.endpointRef,
      '语音识别 endpoint',
    );
    const source = this.requiredProductionEvidenceText(
      speech.source,
      '语音识别来源',
    );
    if (source !== 'provider_audio_understanding') {
      throw new BadRequestException(
        '语音识别来源必须是 provider_audio_understanding。',
      );
    }
    this.requiredIsoDate(speech.calledAt, '语音识别调用时间');
    const audio = this.requiredJsonObject(
      speech.audio,
      '语音 AI 评估必须提供音频摘要证据。',
    );
    const mimeType = this.requiredProductionEvidenceText(
      audio.mimeType,
      '语音音频类型',
    );
    if (
      !xiaomiSpeechAudioMimeTypes.includes(
        mimeType as (typeof xiaomiSpeechAudioMimeTypes)[number],
      )
    ) {
      throw new BadRequestException(
        '语音音频类型必须是小米支持的正式音频格式：audio/wav、audio/mpeg、audio/mp4、audio/ogg 或 audio/flac。',
      );
    }
    const durationSeconds = this.requiredNumber(
      audio.durationSeconds,
      '语音音频时长不能为空。',
    );
    if (durationSeconds <= 0) {
      throw new BadRequestException('语音音频时长必须大于 0。');
    }
  }

  private isProductionAiAssessmentSource(
    source: string,
  ): source is ProductionAiAssessmentSource {
    return productionAiAssessmentSources.includes(source as never);
  }

  private isSpeechAiAssessmentSource(source: string) {
    return speechAiAssessmentSources.includes(source as never);
  }

  private requiredProductionEvidenceText(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    this.assertNoDemoMockLocalManual(text, label);
    return text;
  }

  private assertProductionEvidenceHttpsRef(value: unknown, label: string) {
    const endpointRef = this.requiredProductionEvidenceText(value, label);
    let url: URL;
    try {
      url = new URL(endpointRef);
    } catch {
      throw new BadRequestException(`${label} 必须是有效的 HTTPS 地址。`);
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException(`${label} 必须使用 HTTPS。`);
    }
    this.assertNoDemoMockLocalManual(url.hostname, label);
    if (
      ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) ||
      url.hostname.endsWith('.local')
    ) {
      throw new BadRequestException(`${label} 不能指向本地或测试地址。`);
    }
    return endpointRef;
  }

  private requiredIsoDate(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException(`${label}必须为有效 ISO 时间。`);
    }
    return text;
  }

  private assertNoDemoMockLocalManual(value: string, label: string) {
    if (nonProductionMarkerPattern.test(value)) {
      throw new BadRequestException(
        `${label} 不能包含 mock、demo、local、manual 或 fallback。`,
      );
    }
  }

  private assertUnityWebglResultMetrics(
    runtimeType: string,
    motionMetrics: Array<{
      metricType: string;
      metricValue: number;
      unit: string | undefined;
      confidence: number | undefined;
      sampleCount: number | undefined;
      windowStartedAt: Date | undefined;
      windowEndedAt: Date | undefined;
      qualityFlag: string;
    }>,
    context: {
      sessionStartedAt: Date | undefined;
      resultCompletedAt: Date;
      runtimeConfigSnapshot: unknown;
      protocolSnapshot: unknown;
      metricsSummary: Prisma.JsonObject;
      trainingResult: SubmitTrainingResultDto;
    },
  ) {
    if (runtimeType !== 'unity_webgl') return [];

    if (context.metricsSummary.source_only_not_camera_pose !== false) {
      throw new BadRequestException(
        'Unity WebGL 正式训练结果必须明确证明 source_only_not_camera_pose=false。',
      );
    }
    const runtimeConfigSnapshot = this.requiredJsonObject(
      context.runtimeConfigSnapshot,
      'Unity WebGL 训练会话缺少服务端运行配置快照。',
    );
    if (
      this.requiredString(
        runtimeConfigSnapshot.resultContractVersion,
        'Unity WebGL 训练会话运行配置缺少结果合同版本。',
      ) !== unityWebglResultContractVersion
    ) {
      throw new BadRequestException(
        `Unity WebGL 训练会话结果合同版本必须是 ${unityWebglResultContractVersion}。`,
      );
    }
    const snapshotCollectionBatchId = this.requiredString(
      runtimeConfigSnapshot.collectionBatchId,
      'Unity WebGL 训练会话运行配置缺少采集批次 ID。',
    );
    const resultCollectionBatchId = this.requiredString(
      context.metricsSummary.collectionBatchId,
      'Unity WebGL 训练结果缺少采集批次 ID。',
    );
    if (snapshotCollectionBatchId !== resultCollectionBatchId) {
      throw new BadRequestException(
        'Unity WebGL 训练会话与结果采集批次不一致。',
      );
    }
    if (
      this.requiredString(
        context.metricsSummary.resultContractVersion,
        'Unity WebGL 训练结果缺少结果合同版本。',
      ) !== unityWebglResultContractVersion
    ) {
      throw new BadRequestException(
        `Unity WebGL 训练结果合同版本必须是 ${unityWebglResultContractVersion}。`,
      );
    }
    this.assertCanonicalUnityWebglMetricContract(
      runtimeConfigSnapshot.requiredMetrics,
      'Unity WebGL 训练会话运行配置',
    );
    const protocolSnapshot = this.requiredJsonObject(
      context.protocolSnapshot,
      'Unity WebGL 训练会话缺少采集协议快照。',
    );
    this.assertCanonicalUnityWebglMetricContract(
      protocolSnapshot.requiredMetrics,
      'Unity WebGL 采集协议快照',
    );
    const qualityGate = this.requiredJsonObject(
      protocolSnapshot.qualityGate,
      'Unity WebGL 采集协议快照缺少 qualityGate。',
    );
    const minMetricConfidence = this.unityWebglQualityGateMinConfidence(
      qualityGate,
      'Unity WebGL 采集协议 qualityGate',
    );
    const runtimeMinConfidence = runtimeConfigSnapshot.minConfidence;
    if (
      typeof runtimeMinConfidence !== 'number' ||
      !Number.isFinite(runtimeMinConfidence)
    ) {
      throw new BadRequestException(
        'Unity WebGL 训练会话运行配置 minConfidence 无效。',
      );
    }
    if (runtimeMinConfidence <= 0 || runtimeMinConfidence > 1) {
      throw new BadRequestException(
        'Unity WebGL 训练会话运行配置 minConfidence 必须大于 0 且小于等于 1。',
      );
    }
    if (runtimeMinConfidence !== minMetricConfidence) {
      throw new BadRequestException(
        'Unity WebGL 训练会话运行配置 minConfidence 与采集协议质量门禁不一致。',
      );
    }

    const byMetricType = new Map<string, (typeof motionMetrics)[number]>();
    for (const metric of motionMetrics) {
      if (byMetricType.has(metric.metricType)) {
        throw new BadRequestException(
          `Unity WebGL 训练结果指标 ${metric.metricType} 不能重复。`,
        );
      }
      byMetricType.set(metric.metricType, metric);
    }
    const missingMetricTypes = unityWebglRequiredMetricTypes.filter(
      (metricType) => !byMetricType.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `Unity WebGL 训练结果缺少正式动作指标：${missingMetricTypes.join('、')}。`,
      );
    }
    if (
      byMetricType.size !== unityWebglRequiredMetricTypes.length ||
      motionMetrics.length !== unityWebglRequiredMetricTypes.length
    ) {
      throw new BadRequestException(
        'Unity WebGL 训练结果指标集合必须精确等于五项正式指标。',
      );
    }

    if (!context.sessionStartedAt) {
      throw new BadRequestException(
        'Unity WebGL 训练会话缺少有效 clientStartedAt，不能绑定动作指标窗口。',
      );
    }
    const qualityReasons: string[] = [];
    for (const metricType of unityWebglRequiredMetricTypes) {
      const metric = byMetricType.get(metricType)!;
      const contract = unityWebglMetricContract[metricType];
      if (metric.unit !== contract.unit) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 的单位必须是 ${contract.unit}。`,
        );
      }
      if (
        metric.metricValue < contract.min ||
        ('max' in contract && metric.metricValue > contract.max)
      ) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 超出正式合同范围。`,
        );
      }
      if (metric.confidence === undefined) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 缺少置信度。`,
        );
      }
      if (metric.sampleCount === undefined) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 缺少采样数。`,
        );
      }
      if (!metric.windowStartedAt || !metric.windowEndedAt) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 缺少完整采样窗口。`,
        );
      }
      if (
        metric.windowStartedAt.getTime() !==
          context.sessionStartedAt.getTime() ||
        metric.windowEndedAt.getTime() !== context.resultCompletedAt.getTime()
      ) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 的采样窗口必须精确绑定训练会话 clientStartedAt 与结果完成时间。`,
        );
      }
      if (!['valid', 'suspicious'].includes(metric.qualityFlag)) {
        throw new BadRequestException(
          `Unity WebGL 训练指标 ${metricType} 的 qualityFlag 只能是 valid 或 suspicious。`,
        );
      }
      if (metric.qualityFlag === 'suspicious') {
        qualityReasons.push(`动作指标 ${metricType} 标记为可疑`);
      }
      if (metric.confidence < minMetricConfidence) {
        qualityReasons.push(
          `动作指标 ${metricType} 置信度低于采集协议质量门禁`,
        );
      }
    }

    this.assertUnityWebglMetricValueMatches(
      byMetricType,
      'reaction_time_ms',
      context.trainingResult.reactionTimeMs,
      'reactionTimeMs',
    );
    this.assertUnityWebglMetricValueMatches(
      byMetricType,
      'arm_raise_accuracy',
      context.trainingResult.motionAccuracy,
      'motionAccuracy',
    );
    this.assertUnityWebglMetricValueMatches(
      byMetricType,
      'duration_seconds',
      context.trainingResult.durationSeconds,
      'durationSeconds',
    );
    const prescribedDurationSeconds = this.requiredInteger(
      runtimeConfigSnapshot.prescribedDurationSeconds,
      'Unity WebGL 训练会话运行配置缺少有效 prescribedDurationSeconds。',
    );
    const snapshotDurationSeconds = this.requiredInteger(
      runtimeConfigSnapshot.durationSeconds,
      'Unity WebGL 训练会话运行配置缺少有效 durationSeconds。',
    );
    if (
      prescribedDurationSeconds <= 0 ||
      snapshotDurationSeconds !== prescribedDurationSeconds ||
      context.trainingResult.durationSeconds !== prescribedDurationSeconds
    ) {
      throw new BadRequestException(
        'Unity WebGL 训练时长必须与训练会话冻结的处方时长一致。',
      );
    }

    const dynamicDifficultyEvidence = this.requiredJsonObject(
      context.metricsSummary.dynamicDifficultyEvidence,
      'Unity WebGL 训练结果缺少动态难度证据。',
    );
    if (
      !Array.isArray(dynamicDifficultyEvidence.events) ||
      !dynamicDifficultyEvidence.events.length
    ) {
      throw new BadRequestException(
        'Unity WebGL 训练结果动态难度证据必须包含事件。',
      );
    }
    const finalDifficultyEvent = this.requiredJsonObject(
      dynamicDifficultyEvidence.events[
        dynamicDifficultyEvidence.events.length - 1
      ],
      'Unity WebGL 训练结果最终动态难度事件无效。',
    );
    const finalDifficulty = this.requiredJsonObject(
      finalDifficultyEvent.after,
      'Unity WebGL 训练结果最终动态难度状态无效。',
    );
    this.assertUnityWebglMetricValueMatches(
      byMetricType,
      'difficulty_level',
      this.requiredNumber(
        finalDifficulty.complexityLevel,
        'Unity WebGL 训练结果最终动态难度等级无效。',
      ),
      '最终动态难度证据',
    );
    return qualityReasons;
  }

  private assertCanonicalUnityWebglMetricContract(
    value: unknown,
    label: string,
  ) {
    if (
      !Array.isArray(value) ||
      value.length !== unityWebglRequiredMetricTypes.length
    ) {
      throw new BadRequestException(
        `${label} requiredMetrics 必须精确包含五项指标。`,
      );
    }
    const seenMetricTypes = new Set<string>();
    for (const rawMetric of value) {
      const metric = this.requiredJsonObject(
        rawMetric,
        `${label} requiredMetrics 指标无效。`,
      );
      const metricType = this.requiredString(
        metric.metricType,
        `${label} requiredMetrics 缺少 metricType。`,
      );
      if (
        !unityWebglRequiredMetricTypes.includes(
          metricType as (typeof unityWebglRequiredMetricTypes)[number],
        ) ||
        seenMetricTypes.has(metricType)
      ) {
        throw new BadRequestException(
          `${label} requiredMetrics 必须是五项唯一正式指标。`,
        );
      }
      seenMetricTypes.add(metricType);
      const contract =
        unityWebglMetricContract[
          metricType as (typeof unityWebglRequiredMetricTypes)[number]
        ];
      if (
        this.requiredString(
          metric.unit,
          `${label} 指标 ${metricType} 缺少单位。`,
        ) !== contract.unit ||
        this.requiredNumber(
          metric.min,
          `${label} 指标 ${metricType} 缺少有效 min。`,
        ) !== contract.min
      ) {
        throw new BadRequestException(
          `${label} 指标 ${metricType} 的单位或范围与正式合同不一致。`,
        );
      }
      const expectedMax = 'max' in contract ? contract.max : undefined;
      if (
        (expectedMax === undefined && metric.max !== undefined) ||
        (expectedMax !== undefined &&
          this.requiredNumber(
            metric.max,
            `${label} 指标 ${metricType} 缺少有效 max。`,
          ) !== expectedMax)
      ) {
        throw new BadRequestException(
          `${label} 指标 ${metricType} 的单位或范围与正式合同不一致。`,
        );
      }
    }
  }

  private assertCanonicalBrowserPoseMetricContract(
    value: unknown,
    label: string,
  ) {
    if (
      !Array.isArray(value) ||
      value.length !== browserPoseGameRequiredMetricTypes.length
    ) {
      throw new BadRequestException(
        `${label} requiredMetrics 必须精确包含四项浏览器体感指标。`,
      );
    }
    const seenMetricTypes = new Set<string>();
    for (const rawMetric of value) {
      const metric = this.requiredJsonObject(
        rawMetric,
        `${label} requiredMetrics 指标无效。`,
      );
      const metricType = this.requiredString(
        metric.metricType,
        `${label} requiredMetrics 缺少 metricType。`,
      );
      if (
        !browserPoseGameRequiredMetricTypes.includes(
          metricType as (typeof browserPoseGameRequiredMetricTypes)[number],
        ) ||
        seenMetricTypes.has(metricType)
      ) {
        throw new BadRequestException(
          `${label} requiredMetrics 必须是四项唯一浏览器体感指标。`,
        );
      }
      seenMetricTypes.add(metricType);
      const contract =
        browserPoseMetricContract[
          metricType as (typeof browserPoseGameRequiredMetricTypes)[number]
        ];
      if (
        this.requiredString(
          metric.unit,
          `${label} 指标 ${metricType} 缺少单位。`,
        ) !== contract.unit ||
        this.requiredNumber(
          metric.min,
          `${label} 指标 ${metricType} 缺少有效 min。`,
        ) !== contract.min ||
        this.requiredNumber(
          metric.max,
          `${label} 指标 ${metricType} 缺少有效 max。`,
        ) !== contract.max
      ) {
        throw new BadRequestException(
          `${label} 指标 ${metricType} 的单位或范围与浏览器体感正式合同不一致。`,
        );
      }
    }
  }

  private assertUnityWebglMetricValueMatches(
    metrics: Map<string, { metricValue: number }>,
    metricType: (typeof unityWebglRequiredMetricTypes)[number],
    expectedValue: number,
    expectedLabel: string,
  ) {
    if (metrics.get(metricType)?.metricValue !== expectedValue) {
      throw new BadRequestException(
        `Unity WebGL 训练指标 ${metricType} 必须与 ${expectedLabel} 一致。`,
      );
    }
  }

  private requiredUnityWebglSessionStartedAt(value: unknown) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new BadRequestException(
        'Unity WebGL 训练会话缺少有效 clientStartedAt，不能绑定动作指标窗口。',
      );
    }
    return new Date(value.getTime());
  }

  private assertNonPhysiologicalMotionMetricType(metricType: string) {
    if (!physiologicalMetricTypePattern.test(metricType)) return;
    throw new BadRequestException(
      '缺少客户提供的穿戴设备型号、SDK/API/协议、采样规则、阈值范围、授权范围和现场证据，不能采集或声称生理指标。',
    );
  }

  private validateTrainingResult(dto: SubmitTrainingResultDto) {
    this.assertRange(
      this.requiredNumber(dto.score, '训练得分不能为空。'),
      0,
      100,
      '训练得分必须在 0 到 100 之间。',
    );
    this.assertRange(
      this.requiredNumber(dto.completionRate, '训练完成率不能为空。'),
      0,
      1,
      '训练指标超出有效范围：completionRate/motionAccuracy 必须在 0 到 1 之间。',
    );
    this.assertRange(
      this.requiredNumber(dto.motionAccuracy, '动作准确率不能为空。'),
      0,
      1,
      '训练指标超出有效范围：completionRate/motionAccuracy 必须在 0 到 1 之间。',
    );
    const durationSeconds = this.requiredNumber(
      dto.durationSeconds,
      '训练时长不能为空。',
    );
    if (durationSeconds <= 0) {
      throw new BadRequestException('训练时长必须大于 0。');
    }
    const reactionTimeMs = this.requiredNumber(
      dto.reactionTimeMs,
      '反应时间不能为空。',
    );
    if (reactionTimeMs <= 0) {
      throw new BadRequestException('反应时间必须大于 0。');
    }
    const intensity = this.requiredString(
      dto.exerciseIntensity,
      '运动强度不能为空。',
    );
    if (!['low', 'moderate', 'high'].includes(intensity)) {
      throw new BadRequestException('运动强度必须是 low、moderate 或 high。');
    }
  }

  private validateTrainingReviewConclusion(
    value: unknown,
  ): TrainingReviewConclusion {
    const conclusion = this.requiredString(value, '训练复核结论不能为空。');
    if (
      !trainingReviewConclusions.includes(
        conclusion as TrainingReviewConclusion,
      )
    ) {
      throw new BadRequestException(
        '训练复核结论必须是 confirmed_abnormal、accepted_valid、excluded_from_analysis 或 needs_retrain。',
      );
    }
    return conclusion as TrainingReviewConclusion;
  }

  private assertTrainingResultRequiresReview(result: {
    abnormalFlag: boolean;
    qualityFlag: string;
  }) {
    if (result.abnormalFlag || result.qualityFlag !== 'valid') return;
    throw new BadRequestException(
      '该训练结果未被标记为异常或可疑，无需人工复核。',
    );
  }

  private assertTrainingResultNotReviewed(result: {
    reviewStatus: string | null;
  }) {
    if (result.reviewStatus !== 'reviewed') return;
    throw new BadRequestException('该训练结果已完成复核，请勿重复提交。');
  }

  private validateConsentType(value: unknown): ConsentDto['consentType'] {
    const validTypes: Array<ConsentDto['consentType']> = [
      'privacy_policy',
      'ai_processing',
      'camera_capture',
      'microphone_capture',
      'caregiver_sharing',
    ];
    if (
      typeof value !== 'string' ||
      !validTypes.includes(value as ConsentDto['consentType'])
    ) {
      throw new BadRequestException('授权类型无效。');
    }
    return value as ConsentDto['consentType'];
  }

  private validateExportDataset(value: string): ExportDataset {
    const datasets: ExportDataset[] = [
      'patients',
      'assessments',
      'training-records',
      'consents',
      'audit-logs',
    ];
    if (!datasets.includes(value as ExportDataset)) {
      throw new BadRequestException('导出数据集无效。');
    }
    return value as ExportDataset;
  }

  private resolveExportFormat(value: unknown): ExportFormat {
    if (value === undefined || value === null || value === '') return 'csv';
    const format = this.optionalString(value, '导出格式必须是文本。');
    if (format !== 'csv' && format !== 'json') {
      throw new BadRequestException('导出格式必须是 csv 或 json。');
    }
    return format;
  }

  private resolveExportFilters(query: ExportDatasetQueryDto): ExportFilters {
    const reason = this.requiredString(query.reason, '导出原因不能为空。');
    const dateFromText = this.optionalString(
      query.dateFrom,
      '导出开始时间必须是文本。',
    );
    const dateToText = this.optionalString(
      query.dateTo,
      '导出结束时间必须是文本。',
    );
    const dateFrom = dateFromText
      ? this.parseDate(dateFromText, '导出开始时间无效。')
      : undefined;
    const dateTo = dateToText
      ? this.parseDate(dateToText, '导出结束时间无效。')
      : undefined;
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException('导出开始时间不能晚于结束时间。');
    }

    const patientId = this.optionalString(
      query.patientId,
      '患者 ID 必须是文本。',
    );
    const riskLevelText = this.optionalString(
      query.riskLevel,
      '风险等级必须是文本。',
    );
    if (riskLevelText && !['low', 'moderate', 'high'].includes(riskLevelText)) {
      throw new BadRequestException('风险等级必须是 low、moderate 或 high。');
    }
    const qualityFlag = this.optionalString(
      query.qualityFlag,
      '数据质量标记必须是文本。',
    );

    return {
      reason,
      dateFrom,
      dateTo,
      patientId,
      riskLevel: riskLevelText as RiskLevel | undefined,
      qualityFlag,
      limit: this.resolveExportLimit(query.limit),
    };
  }

  private resolveExportLimit(value: unknown) {
    if (value === undefined || value === null || value === '') return 100;
    const limit = this.requiredInteger(value, '导出条数必须是整数。');
    this.assertRange(limit, 1, 500, '导出条数必须在 1 到 500 之间。');
    return limit;
  }

  private async buildExportPayload(
    dataset: ExportDataset,
    format: ExportFormat,
    filters: ExportFilters,
  ): Promise<ExportPayload> {
    const rows = await this.buildExportRows(dataset, filters);
    const columns = this.exportColumns(dataset);
    return {
      dataset,
      format,
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      columns,
      rows,
    };
  }

  private buildExportRows(dataset: ExportDataset, filters: ExportFilters) {
    if (dataset === 'patients') return this.exportPatients(filters);
    if (dataset === 'assessments') return this.exportAssessments(filters);
    if (dataset === 'training-records')
      return this.exportTrainingRecords(filters);
    if (dataset === 'consents') return this.exportConsents(filters);
    return this.exportAuditLogs(filters);
  }

  private exportColumns(dataset: ExportDataset) {
    const columns: Record<ExportDataset, string[]> = {
      patients: [
        'patientExportId',
        'maskedName',
        'gender',
        'age',
        'maskedMobilePhone',
        'maskedCaregiverName',
        'maskedCaregiverPhone',
        'responsibleDoctor',
        'status',
        'createdAt',
      ],
      assessments: [
        'assessmentExportId',
        'patientExportId',
        'maskedPatientName',
        'assessmentType',
        'mmse',
        'cdr',
        'memory',
        'orientation',
        'executive',
        'language',
        'riskLevel',
        'aiConfidence',
        'createdAt',
      ],
      'training-records': [
        'sessionExportId',
        'patientExportId',
        'maskedPatientName',
        'gameName',
        'sessionStatus',
        'syncStatus',
        'score',
        'completionRate',
        'durationSeconds',
        'reactionTimeMs',
        'motionAccuracy',
        'exerciseIntensity',
        'abnormalFlag',
        'qualityFlag',
        'resultStatus',
        'reviewStatus',
        'reviewConclusion',
        'startedAt',
      ],
      consents: [
        'consentExportId',
        'patientExportId',
        'maskedPatientName',
        'consentType',
        'consentVersion',
        'status',
        'grantedAt',
        'revokedAt',
      ],
      'audit-logs': [
        'auditLogExportId',
        'actorRole',
        'maskedActorAccount',
        'action',
        'targetType',
        'targetExportId',
        'result',
        'createdAt',
      ],
    };
    return columns[dataset];
  }

  private async exportPatients(filters: ExportFilters): Promise<ExportRow[]> {
    const where: Prisma.PatientProfileWhereInput = {};
    if (filters.patientId) where.id = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    const patients = await this.prisma.patientProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        identityEnvelope: true,
        contactEnvelope: true,
        careDetailsEnvelope: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        responsibleDoctor: {
          select: {
            user: { select: { id: true, identityEnvelope: true } },
          },
        },
      },
    });

    return patients.map((patient) => {
      const decryptedPatient = this.patientProfileResponse(patient);
      const responsibleDoctor = patient.responsibleDoctor
        ? this.userIdentityResponse(patient.responsibleDoctor.user).displayName
        : '未绑定';
      return {
        patientExportId: this.exportStableId('patient', patient.id),
        maskedName: this.maskName(decryptedPatient.name),
        gender: decryptedPatient.gender,
        age: decryptedPatient.age,
        maskedMobilePhone: this.maskPhone(decryptedPatient.mobilePhone),
        maskedCaregiverName: this.maskNullableName(
          decryptedPatient.caregiverName,
        ),
        maskedCaregiverPhone: this.maskPhone(decryptedPatient.caregiverPhone),
        responsibleDoctor:
          responsibleDoctor === '未绑定'
            ? responsibleDoctor
            : this.maskName(responsibleDoctor),
        status: patient.status,
        createdAt: patient.createdAt.toISOString(),
      };
    });
  }

  private async exportAssessments(
    filters: ExportFilters,
  ): Promise<ExportRow[]> {
    const where: Prisma.AssessmentRecordWhereInput = {
      status: 'doctor_confirmed',
    };
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.riskGrades = {
        some: {
          riskLevel: filters.riskLevel,
          confirmedById: { not: null },
          confirmedAt: { not: null },
        },
      };
    }

    const assessments = await this.prisma.assessmentRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        resultEnvelope: true,
        createdAt: true,
        patient: { select: { id: true, identityEnvelope: true } },
        riskGrades: {
          where: {
            confirmedById: { not: null },
            confirmedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { riskLevel: true },
        },
        aiAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { confidence: true },
        },
      },
    });

    return assessments.map((assessment) => {
      const score = this.decryptAssessmentResult(
        assessment.id,
        assessment.resultEnvelope,
      ).scoreSummary;
      return {
        assessmentExportId: this.exportStableId('assessment', assessment.id),
        patientExportId: this.exportStableId('patient', assessment.patientId),
        maskedPatientName: this.maskName(
          this.decryptPatientIdentity(
            assessment.patient.id,
            assessment.patient.identityEnvelope,
          ).name,
        ),
        assessmentType: assessment.assessmentType,
        mmse: this.exportNumber(score.mmse),
        cdr: this.exportNumber(score.cdr),
        memory: this.exportNumber(score.memory),
        orientation: this.exportNumber(score.orientation),
        executive: this.exportNumber(score.executive),
        language: this.exportNumber(score.language),
        riskLevel: assessment.riskGrades[0]?.riskLevel ?? null,
        aiConfidence: assessment.aiAnalyses[0]?.confidence ?? null,
        createdAt: assessment.createdAt.toISOString(),
      };
    });
  }

  private async exportTrainingRecords(
    filters: ExportFilters,
  ): Promise<ExportRow[]> {
    const where: Prisma.TrainingSessionWhereInput = {
      sessionStatus: 'completed',
    };
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.startedAt = {};
      if (filters.dateFrom) where.startedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.startedAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.patient = {
        riskGrades: {
          some: { riskLevel: filters.riskLevel, isCurrent: true },
        },
      };
    }
    if (filters.qualityFlag) {
      where.result = { qualityFlag: filters.qualityFlag };
    }

    const sessions = await this.prisma.trainingSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        patientId: true,
        sessionStatus: true,
        syncStatus: true,
        startedAt: true,
        patient: { select: { id: true, identityEnvelope: true } },
        gameContent: { select: { name: true } },
        result: {
          select: {
            score: true,
            completionRate: true,
            durationSeconds: true,
            reactionTimeMs: true,
            motionAccuracy: true,
            exerciseIntensity: true,
            abnormalFlag: true,
            qualityFlag: true,
            reviewStatus: true,
            reviewConclusion: true,
          },
        },
      },
    });

    return sessions.map((session) => {
      const result = session.result;
      const resultStatus = result
        ? result.abnormalFlag
          ? 'abnormal'
          : result.qualityFlag === 'valid'
            ? 'valid'
            : 'review_required'
        : null;
      return {
        sessionExportId: this.exportStableId('session', session.id),
        patientExportId: this.exportStableId('patient', session.patientId),
        maskedPatientName: this.maskName(
          this.decryptPatientIdentity(
            session.patient.id,
            session.patient.identityEnvelope,
          ).name,
        ),
        gameName: session.gameContent.name,
        sessionStatus: session.sessionStatus,
        syncStatus: session.syncStatus,
        score: result?.score ?? null,
        completionRate: result?.completionRate ?? null,
        durationSeconds: result?.durationSeconds ?? null,
        reactionTimeMs: result?.reactionTimeMs ?? null,
        motionAccuracy: result?.motionAccuracy ?? null,
        exerciseIntensity: result?.exerciseIntensity ?? null,
        abnormalFlag: result?.abnormalFlag ?? null,
        qualityFlag: result?.qualityFlag ?? null,
        resultStatus,
        reviewStatus: result?.reviewStatus ?? null,
        reviewConclusion: result?.reviewConclusion ?? null,
        startedAt: session.startedAt.toISOString(),
      };
    });
  }

  private async exportConsents(filters: ExportFilters): Promise<ExportRow[]> {
    const where: Prisma.ConsentRecordWhereInput = {};
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.grantedAt = {};
      if (filters.dateFrom) where.grantedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.grantedAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.patient = {
        riskGrades: {
          some: { riskLevel: filters.riskLevel, isCurrent: true },
        },
      };
    }

    const consents = await this.prisma.consentRecord.findMany({
      where,
      orderBy: { grantedAt: 'desc' },
      take: filters.limit,
      include: {
        patient: { select: { id: true, identityEnvelope: true } },
      },
    });

    return consents.map((consent) => ({
      consentExportId: this.exportStableId('consent', consent.id),
      patientExportId: this.exportStableId('patient', consent.patientId),
      maskedPatientName: this.maskName(
        this.decryptPatientIdentity(
          consent.patient.id,
          consent.patient.identityEnvelope,
        ).name,
      ),
      consentType: consent.consentType,
      consentVersion: consent.consentVersion,
      status: consent.status,
      grantedAt: consent.grantedAt.toISOString(),
      revokedAt: consent.revokedAt?.toISOString() ?? null,
    }));
  }

  private async exportAuditLogs(filters: ExportFilters): Promise<ExportRow[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    if (filters.patientId) {
      where.OR = [
        { targetId: filters.patientId },
        {
          metadata: {
            path: ['patientId'],
            equals: filters.patientId,
          },
        },
      ];
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      include: { actor: { select: { account: true } } },
    });

    return logs.map((log) => ({
      auditLogExportId: this.exportStableId('audit', log.id),
      actorRole: log.actorRole ?? null,
      maskedActorAccount: this.maskAccount(log.actor?.account),
      action: log.action,
      targetType: log.targetType,
      targetExportId: log.targetId
        ? this.exportStableId(log.targetType, log.targetId)
        : null,
      result: log.result,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  private exportAuditFilters(filters: ExportFilters) {
    return {
      dateFrom: filters.dateFrom?.toISOString() ?? null,
      dateTo: filters.dateTo?.toISOString() ?? null,
      patientFilterApplied: Boolean(filters.patientId),
      patientExportId: filters.patientId
        ? this.exportStableId('patient', filters.patientId)
        : null,
      riskLevel: filters.riskLevel ?? null,
      qualityFlag: filters.qualityFlag ?? null,
      limit: filters.limit,
    };
  }

  private exportFilename(dataset: ExportDataset, format: ExportFormat = 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    return `rehab-${dataset}-${stamp}.${format}`;
  }

  private toCsv(columns: string[], rows: ExportRow[]) {
    const bom = '\uFEFF';
    const lines = [
      columns.map((column) => this.escapeCsvValue(column)).join(','),
      ...rows.map((row) =>
        columns.map((column) => this.escapeCsvValue(row[column])).join(','),
      ),
    ];
    return `${bom}${lines.join('\n')}`;
  }

  private escapeCsvValue(value: ExportCellValue | undefined) {
    const rawText = value === null || value === undefined ? '' : String(value);
    const text = /^[=+\-@\t\r]/.test(rawText) ? `'${rawText}` : rawText;
    if (/[",\n\r]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  private asJsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private exportNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private exportStableId(scope: string, id: string) {
    return `${scope}_${createHash('sha256')
      .update(`${scope}:${id}`)
      .digest('hex')
      .slice(0, 12)}`;
  }

  private exportReasonHash(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
  }

  private safeExportTargetId(value: string) {
    return [
      'patients',
      'assessments',
      'training-records',
      'consents',
      'audit-logs',
    ].includes(value)
      ? value
      : 'invalid_dataset';
  }

  private safeErrorType(error: unknown) {
    if (error instanceof BadRequestException) return 'BadRequestException';
    if (error instanceof ForbiddenException) return 'ForbiddenException';
    if (error instanceof NotFoundException) return 'NotFoundException';
    return error instanceof Error ? error.constructor.name : 'UnknownError';
  }

  private buildAuditLogWhere(
    query: AuditLogQueryDto,
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    const result = this.optionalString(query.result, '审计结果必须是文本。');
    if (result) {
      if (!['success', 'failed', 'denied'].includes(result)) {
        throw new BadRequestException(
          '审计结果必须是 success、failed 或 denied。',
        );
      }
      where.result = result as AuditResult;
    }

    const actorRole = this.optionalString(
      query.actorRole,
      '操作者角色必须是文本。',
    );
    if (actorRole) {
      if (!this.isRoleCode(actorRole)) {
        throw new BadRequestException('操作者角色无效。');
      }
      where.actorRole = actorRole as RoleCode;
    }

    const actorUserId = this.optionalString(
      query.actorUserId,
      '操作者 ID 必须是文本。',
    );
    if (actorUserId) where.actorUserId = actorUserId;

    const action = this.optionalString(query.action, '审计动作必须是文本。');
    if (action) where.action = action;

    const targetType = this.optionalString(
      query.targetType,
      '目标类型必须是文本。',
    );
    if (targetType) where.targetType = targetType;

    const targetId = this.optionalString(
      query.targetId,
      '目标 ID 必须是文本。',
    );
    if (targetId) where.targetId = targetId;

    const actorAccount = this.optionalString(
      query.actorAccount,
      '操作者账号必须是文本。',
    );
    if (actorAccount) {
      where.actor = {
        account: { contains: actorAccount, mode: 'insensitive' },
      };
    }

    const dateFrom = this.optionalString(
      query.dateFrom ?? query.from,
      '开始时间必须是文本。',
    );
    const dateTo = this.optionalString(
      query.dateTo ?? query.to,
      '结束时间必须是文本。',
    );
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom)
        where.createdAt.gte = this.parseDate(dateFrom, '开始时间无效。');
      if (dateTo)
        where.createdAt.lte = this.parseDate(dateTo, '结束时间无效。');
    }

    return where;
  }

  private resolveAuditLogTake(value: unknown) {
    if (value === undefined || value === null || value === '') return 100;
    const take = this.requiredInteger(value, '审计日志条数必须是整数。');
    this.assertRange(take, 1, 200, '审计日志条数必须在 1 到 200 之间。');
    return take;
  }

  private parseDate(value: string, message: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(message);
    }
    return date;
  }

  private requireAnyRole(user: RequestUser, roles: RoleCode[]) {
    if (!roles.some((role) => this.hasRole(user, role))) {
      throw new ForbiddenException('角色权限不足');
    }
  }

  private hasRole(user: RequestUser, role: RoleCode) {
    return user.roles.some((userRole) => userRole.roleCode === role);
  }

  private hasAnyAdminRole(user: RequestUser) {
    return user.roles.some((role) => this.isAdminRole(role.roleCode));
  }

  private isAdminRole(role: RoleCode) {
    return ['admin', 'admin_super', 'admin_operator', 'admin_auditor'].includes(
      role,
    );
  }

  private hasAdminPermission(user: RequestUser, permission: AdminPermission) {
    return user.roles.some((role) =>
      this.adminPermissions(role.roleCode).includes(permission),
    );
  }

  private requireAdminPermission(
    user: RequestUser,
    permission: AdminPermission,
  ) {
    if (!this.hasAdminPermission(user, permission)) {
      throw new ForbiddenException('后台权限不足');
    }
  }

  private adminPermissions(role: RoleCode): AdminPermission[] {
    if (role === 'admin' || role === 'admin_super') {
      return [
        'dashboard.view',
        'audit.read',
        'data.export',
        'user.manage',
        'game.manage',
        'game.publish',
        'quality_evidence.manage',
      ];
    }
    if (role === 'admin_operator') {
      return ['dashboard.view', 'user.manage', 'game.manage'];
    }
    if (role === 'admin_auditor') {
      return ['dashboard.view', 'audit.read'];
    }
    return [];
  }

  private isRoleCode(value: string) {
    return [
      'patient',
      'caregiver',
      'doctor',
      'admin',
      'admin_super',
      'admin_operator',
      'admin_auditor',
    ].includes(value);
  }

  private primaryRole(user: RequestUser): RoleCode | undefined {
    const priority: RoleCode[] = [
      'admin_super',
      'admin_operator',
      'admin_auditor',
      'admin',
      'doctor',
      'caregiver',
      'patient',
    ];
    return priority.find((role) => this.hasRole(user, role));
  }

  private resolveHomePath(roles: RoleCode[]) {
    if (roles.some((role) => this.isAdminRole(role))) return '/admin';
    if (roles.includes('doctor')) return '/doctor';
    if (roles.includes('caregiver')) return '/family';
    return '/patient';
  }

  private maskName(name: string) {
    return name.length > 1 ? `${name[0]}*` : '*';
  }

  private maskNullableName(name?: string | null) {
    return name ? this.maskName(name) : null;
  }

  private maskPhone(phone?: string | null) {
    if (!phone) return null;
    if (phone.length < 7) return '*'.repeat(phone.length);
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  private maskAccount(account?: string | null) {
    if (!account) return null;
    if (account.length <= 2) return '*'.repeat(account.length);
    if (account.length <= 6) return `${account[0]}***${account.slice(-1)}`;
    return `${account.slice(0, 3)}***${account.slice(-2)}`;
  }

  private async auditProviderOperation(
    operation: ProviderOperation,
    writeAudit: () => Promise<void>,
    failureStage?: ProviderFailureStage,
  ) {
    if (failureStage) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.provider.failed',
        operation,
        failureStage,
      });
    }
    try {
      await writeAudit();
    } catch {
      this.throwProviderAuditWriteFailure(operation);
    }
  }

  private throwProviderAuditWriteFailure(operation: ProviderOperation): never {
    emitProductionRuntimeEvent({
      eventCode: 'mimo.provider.audit_write.failed',
      operation,
    });
    throw new ServiceUnavailableException(
      '供应商审计记录失败，已阻断高成本供应商调用。',
    );
  }

  private async audit(
    actorUserId: string | undefined,
    actorRole: RoleCode | undefined,
    action: string,
    targetType: string,
    targetId: string | undefined,
    result: AuditResult,
    metadata: Prisma.InputJsonValue = {},
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        actorRole,
        action,
        targetType,
        targetId,
        result,
        metadata,
      },
    });
  }
}
