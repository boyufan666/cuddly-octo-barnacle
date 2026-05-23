"use client";

import {
  Activity,
  AudioWaveform,
  BadgeCheck,
  BarChart3,
  Brain,
  Camera,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Gamepad2,
  HeartPulse,
  History,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  MonitorCheck,
  Radar,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Video,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import {
  buildBrowserPoseEvidenceInputFromRecord,
} from "@/lib/browser-pose-evidence";
import {
  checkPoseReadiness,
  createPoseTrainingRuntime,
  poseModelVersion,
  type PoseLandmark,
  type PoseReadinessResult,
  type PoseTrainingRuntime,
} from "@/lib/pose-readiness";
import {
  isUnityTrainingResultCandidate,
  parseUnityTrainingResultBridgeEvent,
} from "@/lib/unity-training-bridge";
import { cn } from "@/lib/utils";
import type {
  AdminDashboardResponse,
  AdminPermission,
  AssessmentRecord,
  AuditLog,
  AuditLogFilters,
  CaregiverSummaryResponse,
  ConsentType,
  CaregiverRelation,
  CaregiverScope,
  ConsentRecord,
  CreateCaregiverAccountRequest,
  CreateGameContentRequest,
  CreatePatientRequest,
  DataExportRequest,
  DashboardCountRow,
  DownloadedExport,
  ExportDataset,
  GameContent,
  LoginResponse,
  PatientProfile,
  RehabPlan,
  RoleCode,
  SubmitTrainingResultRequest,
  SubmitTrainingReviewRequest,
  TrainingRecordsResponse,
  TrainingRecordSession,
  TrainingSession,
  TrainingReviewConclusion,
  UpdateGameContentStatusRequest,
  UpdateUnityBuildRequest,
} from "@/types/api";

type ScreenId =
  | "login"
  | "profile"
  | "device"
  | "assessment"
  | "match"
  | "today"
  | "prep"
  | "game"
  | "result"
  | "family"
  | "doctor"
  | "plan"
  | "admin"
  | "security";

const screens: Array<{ id: ScreenId; label: string; icon: typeof Brain }> = [
  { id: "login", label: "账号登录", icon: KeyRound },
  { id: "profile", label: "建档授权", icon: ShieldCheck },
  { id: "device", label: "设备权限", icon: Video },
  { id: "assessment", label: "AI评估", icon: Brain },
  { id: "match", label: "智能匹配", icon: WandSparkles },
  { id: "today", label: "今日训练", icon: HeartPulse },
  { id: "prep", label: "训练准备", icon: Camera },
  { id: "game", label: "实时采集", icon: Gamepad2 },
  { id: "result", label: "训练反馈", icon: History },
  { id: "family", label: "家属协同", icon: UsersRound },
  { id: "doctor", label: "患者管理", icon: Stethoscope },
  { id: "plan", label: "方案调整", icon: ClipboardCheck },
  { id: "admin", label: "运营管理", icon: LayoutDashboard },
  { id: "security", label: "权限与审计", icon: LockKeyhole },
];

type AppData = {
  patients?: PatientProfile[];
  patient?: PatientProfile;
  assessments?: AssessmentRecord[];
  trainingRecords?: TrainingRecordsResponse;
  caregiverSummary?: CaregiverSummaryResponse;
  adminDashboard?: AdminDashboardResponse;
  adminGameContents?: GameContent[];
  auditLogs?: AuditLog[];
};

type StatusTone = "info" | "success" | "warning" | "danger" | "muted";

type PlanPrerequisiteState = {
  canRecommend: boolean;
  items: Array<[string, string, StatusTone]>;
  blockers: Array<[string, string]>;
};

const defaultAuditLogFilters: AuditLogFilters = {
  result: "all",
  actorRole: "all",
  limit: 100,
};

const auditActionOptions: Array<[string, string]> = [
  ["", "全部动作"],
  ["auth.login", "账号登录"],
  ["patient.create", "创建患者"],
  ["user.create.caregiver", "创建家属账号"],
  ["patient.view", "查看患者"],
  ["consent.grant", "授权留痕"],
  ["consent.revoke", "撤回授权"],
  ["assessment.create", "创建 AI 评估"],
  ["rehab_plan.recommend", "生成推荐方案"],
  ["rehab_plan.confirm", "确认康复方案"],
  ["training_session.start", "开始训练"],
  ["training_result.submit", "提交训练结果"],
  ["game_content.create", "创建训练内容"],
  ["game_content.enable", "启用训练内容"],
  ["game_content.disable", "下架训练内容"],
  ["game_content.archive", "归档训练内容"],
  ["game_content.update_unity_build", "更新训练资源"],
  ["game_content.publish_unity_build", "发布训练资源"],
  ["caregiver.summary.view", "家属查看摘要"],
  ["data.export", "脱敏数据导出"],
  ["audit.export_desensitized", "脱敏审计导出"],
  ["plan.adjust", "调整康复方案"],
  ["access.denied", "访问被拒绝"],
];

const auditTargetTypeOptions: Array<[string, string]> = [
  ["", "全部目标"],
  ["user", "用户"],
  ["patient_profile", "患者档案"],
  ["consent_record", "授权记录"],
  ["assessment_record", "评估记录"],
  ["rehab_plan", "康复方案"],
  ["training_session", "训练会话"],
  ["game_content", "训练内容"],
  ["audit_log", "审计日志"],
  ["data_export", "数据导出"],
];

const auditActorRoleOptions: Array<[string, string]> = [
  ["all", "全部角色"],
  ["patient", "患者"],
  ["caregiver", "家属"],
  ["doctor", "医师"],
  ["admin", "管理员"],
  ["admin_super", "平台管理人员"],
  ["admin_operator", "普通运营"],
  ["admin_auditor", "审计查看人员"],
];

const trainingInputModeOptions: Array<[string, string]> = [
  ["camera_pose", "摄像头体感采集"],
];

const planPrerequisiteLabels = {
  patientProfile: "患者已建档",
  privacyConsent: "隐私授权已签署",
  aiConsent: "AI 授权已签署",
  currentRisk: "当前风险评级",
  releasedTraining: "已发布正式训练内容",
  planState: "方案状态",
} as const;

const roleHome: Record<RoleCode, ScreenId> = {
  patient: "today",
  caregiver: "family",
  doctor: "doctor",
  admin: "admin",
  admin_super: "admin",
  admin_operator: "admin",
  admin_auditor: "security",
};

const visibleScreensByRole: Record<RoleCode, ScreenId[]> = {
  patient: [
    "login",
    "profile",
    "device",
    "assessment",
    "match",
    "today",
    "prep",
    "game",
    "result",
  ],
  caregiver: ["login", "family", "today"],
  doctor: ["login", "doctor", "plan", "assessment", "match", "result"],
  admin: ["login", "admin", "security", "doctor", "plan", "result"],
  admin_super: ["login", "admin", "security", "doctor", "plan", "result"],
  admin_operator: ["login", "admin", "doctor", "plan", "result"],
  admin_auditor: ["login", "admin", "security"],
};

const sessionTokenKey = "rehab-platform-session-token";
const consentVersion = "v1.2";
const consentDefinitions: Array<{
  type: ConsentType;
  title: string;
  description: string;
}> = [
  {
    type: "privacy_policy",
    title: "隐私协议",
    description: "允许平台保存账号、建档资料、授权记录与必要业务日志。",
  },
  {
    type: "ai_processing",
    title: "AI 数据处理",
    description: "允许平台处理语音转写、量表分数和 AI 分析摘要。",
  },
  {
    type: "camera_capture",
    title: "摄像头体感采集",
    description: "允许训练时采集肢体轨迹、动作准确率和反应时间。",
  },
  {
    type: "microphone_capture",
    title: "麦克风语音采集",
    description: "允许评估时采集语音并转写为结构化文本。",
  },
  {
    type: "caregiver_sharing",
    title: "家属共享授权",
    description: "允许授权家属查看脱敏训练进展和必要提醒摘要。",
  },
];

type ActionKey =
  | "assessment"
  | "recommend"
  | "confirmPlan"
  | "startTraining"
  | "checkDevice"
  | "checkPose"
  | "submitResult"
  | "reviewTraining"
  | "consent"
  | "revokeConsent"
  | "createPatient"
  | "createCaregiver"
  | "bindCaregiver"
  | "revokeCaregiver"
  | "createGameContent"
  | "updateGameContentStatus"
  | "updateUnityBuild"
  | "auditLogs"
  | "exportData";

type AssessmentFormState = {
  mmse: string;
  cdr: string;
  memory: string;
  orientation: string;
  executive: string;
  language: string;
  transcript: string;
  reactionDelaySeconds: string;
  modelVersion: string;
  confidence: string;
  analysisSummary: string;
};

const emptyAssessmentForm: AssessmentFormState = {
  mmse: "",
  cdr: "",
  memory: "",
  orientation: "",
  executive: "",
  language: "",
  transcript: "",
  reactionDelaySeconds: "",
  modelVersion: "",
  confidence: "",
  analysisSummary: "",
};

type PatientFormState = {
  account: string;
  initialPassword: string;
  name: string;
  gender: string;
  age: string;
  mobilePhone: string;
  caregiverName: string;
  caregiverPhone: string;
  responsibleDoctorId: string;
  bloodPressure: string;
  heartRate: string;
  gaitRisk: string;
};

const emptyPatientForm: PatientFormState = {
  account: "",
  initialPassword: "",
  name: "",
  gender: "",
  age: "",
  mobilePhone: "",
  caregiverName: "",
  caregiverPhone: "",
  responsibleDoctorId: "",
  bloodPressure: "",
  heartRate: "",
  gaitRisk: "",
};

type CaregiverAccountFormState = {
  account: string;
  initialPassword: string;
  displayName: string;
  mobilePhone: string;
};

const emptyCaregiverAccountForm: CaregiverAccountFormState = {
  account: "",
  initialPassword: "",
  displayName: "",
  mobilePhone: "",
};

type CaregiverBindingFormState = {
  caregiverAccount: string;
  relation: string;
  summary: boolean;
  reminders: boolean;
  progress: boolean;
};

const emptyCaregiverBindingForm: CaregiverBindingFormState = {
  caregiverAccount: "",
  relation: "",
  summary: true,
  reminders: true,
  progress: true,
};

type DataExportFormState = {
  dataset: ExportDataset;
  format: "csv";
  reason: string;
  dateFrom: string;
  dateTo: string;
  patientId: string;
  riskLevel: DataExportRequest["riskLevel"];
  qualityFlag: string;
  limit: string;
};

const emptyDataExportForm: DataExportFormState = {
  dataset: "patients",
  format: "csv",
  reason: "",
  dateFrom: "",
  dateTo: "",
  patientId: "",
  riskLevel: "all",
  qualityFlag: "",
  limit: "100",
};

type GameContentCreateFormState = {
  code: string;
  name: string;
  runtimeType: GameContent["runtimeType"];
  gameVersion: string;
  trainingTargetsText: string;
  tagsText: string;
  defaultDuration: string;
  defaultDifficulty: string;
  supportsCamera: "" | "true" | "false";
  supportsMicrophone: "" | "true" | "false";
  supportedInputModesText: string;
  requiredMetricsText: string;
};

const emptyGameContentCreateForm: GameContentCreateFormState = {
  code: "",
  name: "",
  runtimeType: "unity_webgl",
  gameVersion: "",
  trainingTargetsText: "",
  tagsText: "",
  defaultDuration: "",
  defaultDifficulty: "",
  supportsCamera: "",
  supportsMicrophone: "",
  supportedInputModesText: "",
  requiredMetricsText: "",
};

type UnityBuildFormState = {
  gameContentId: string;
  manifestUrl: string;
  buildBaseUrl: string;
  gameVersion: string;
  bridgeProtocolVersion: "1.0.0";
  buildStatus: UpdateUnityBuildRequest["buildStatus"];
  releaseChannel: UpdateUnityBuildRequest["releaseChannel"];
  supportsCamera: boolean;
  supportsMicrophone: boolean;
  supportedInputModesText: string;
  requiredMetricsText: string;
};

const emptyUnityBuildForm: UnityBuildFormState = {
  gameContentId: "",
  manifestUrl: "",
  buildBaseUrl: "",
  gameVersion: "",
  bridgeProtocolVersion: "1.0.0",
  buildStatus: "pending_assets",
  releaseChannel: "development",
  supportsCamera: true,
  supportsMicrophone: false,
  supportedInputModesText: "camera_pose",
  requiredMetricsText: "",
};

type TrainingResultFormState = {
  score: string;
  completionRatePercent: string;
  durationSeconds: string;
  reactionTimeMs: string;
  motionAccuracyPercent: string;
  exerciseIntensity: "" | SubmitTrainingResultRequest["exerciseIntensity"];
  metricsSummary: string;
  motionMetrics: string;
};

const emptyTrainingResultForm: TrainingResultFormState = {
  score: "",
  completionRatePercent: "",
  durationSeconds: "",
  reactionTimeMs: "",
  motionAccuracyPercent: "",
  exerciseIntensity: "",
  metricsSummary: "",
  motionMetrics: "",
};

type TrainingReviewFormState = {
  resultId: string;
  reviewConclusion: "" | TrainingReviewConclusion;
  reviewNote: string;
};

const emptyTrainingReviewForm: TrainingReviewFormState = {
  resultId: "",
  reviewConclusion: "",
  reviewNote: "",
};

type BrowserPoseEvidenceFormState = {
  testerName: string;
  siteName: string;
  environment: string;
  browserName: string;
  browserVersion: string;
  cameraDeviceIdHash: string;
  cameraResolution: string;
  patientExportId: string;
  confirmedByDoctorId: string;
  confirmedAt: string;
  auditLogIdsText: string;
  screenshotPath: string;
  screenshotCapturedAt: string;
  recordingPath: string;
  recordingCapturedAt: string;
};

const emptyBrowserPoseEvidenceForm: BrowserPoseEvidenceFormState = {
  testerName: "",
  siteName: "",
  environment: "",
  browserName: "",
  browserVersion: "",
  cameraDeviceIdHash: "",
  cameraResolution: "",
  patientExportId: "",
  confirmedByDoctorId: "",
  confirmedAt: "",
  auditLogIdsText: "",
  screenshotPath: "",
  screenshotCapturedAt: "",
  recordingPath: "",
  recordingCapturedAt: "",
};

type UnityTrainingBridgeStatus =
  | {
      state: "idle";
      message: string;
      sessionId?: string;
    }
  | {
      state: "accepted";
      message: string;
      at: string;
      sessionId: string;
    }
  | {
      state: "rejected";
      message: string;
      at: string;
      sessionId: string;
    };

const emptyUnityTrainingBridgeStatus: UnityTrainingBridgeStatus = {
  state: "idle",
  message: "等待训练结果回传",
};

type TrainingReadiness = {
  cameraPermission: "unknown" | "requesting" | "granted" | "denied";
  cameraDeviceId?: string;
  cameraLabel?: string;
  checkedAt?: string;
  error?: string;
  poseRuntimeStatus: "unknown" | "loading" | "ready" | "error";
  poseModelVersion?: string;
  poseLandmarkCount?: number;
  poseAverageVisibility?: number;
  poseQualityFlag?: "valid";
  poseCheckedAt?: string;
  poseError?: string;
};

const emptyTrainingReadiness: TrainingReadiness = {
  cameraPermission: "unknown",
  poseRuntimeStatus: "unknown",
};

type UnityManifest = {
  gameCode: string;
  gameName: string;
  gameVersion: string;
  bridgeProtocolVersion: string;
  build: {
    loaderUrl: string;
    dataUrl: string;
    frameworkUrl: string;
    codeUrl: string;
    streamingAssetsUrl?: string;
  };
  runtimeRequirements?: {
    cameraRequired?: boolean;
    microphoneRequired?: boolean;
    supportedInputModes?: string[];
  };
  requiredResultMetrics?: unknown[];
};

type UnityManifestState =
  | { state: "idle"; message: string }
  | { state: "loading"; message: string }
  | { state: "ready"; message: string; manifest: UnityManifest }
  | { state: "error"; message: string };

type FormalTrainingRuntime = GameContent["runtimeType"];

type BrowserPoseTarget = {
  id: number;
  side: "left" | "right";
  x: number;
  y: number;
  radius: number;
  appearedAtMs: number;
  expiresAtMs: number;
};

type BrowserPoseGameSnapshot = {
  phase: "idle" | "loading" | "running" | "completed" | "error";
  message: string;
  elapsedSeconds: number;
  target?: BrowserPoseTarget;
  sampleCount: number;
  validFrameCount: number;
  averageVisibility: number;
  hits: number;
  misses: number;
  averageReactionTimeMs?: number;
  motionAccuracy: number;
  qualityReasons: string[];
  resultGeneratedAt?: string;
};

type BrowserPoseGameStats = {
  startedAtMs: number;
  startedAtIso: string;
  targetDurationSeconds: number;
  sampleCount: number;
  validFrameCount: number;
  visibilityTotal: number;
  hits: number;
  misses: number;
  reactionTimes: number[];
  activeTarget?: BrowserPoseTarget;
  nextTargetId: number;
  lastTargetEndedAtMs: number;
  previousLeftWrist?: { x: number; y: number };
  previousRightWrist?: { x: number; y: number };
  motionTravel: number;
  lastSnapshotAtMs: number;
  qualityReasons: string[];
};

declare global {
  interface Window {
    RehabTrainingRuntimeConfig?: Record<string, unknown>;
    createUnityInstance?: (
      canvas: HTMLCanvasElement,
      config: Record<string, unknown>,
    ) => Promise<{ Quit?: () => Promise<void> }>;
  }
}

export default function Home() {
  const [active, setActive] = useState<ScreenId>("login");
  const [apiStatus, setApiStatus] = useState("服务检测中");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [data, setData] = useState<AppData>({});
  const [dataStatus, setDataStatus] = useState("未登录");
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<RehabPlan | null>(null);
  const [activeTrainingSession, setActiveTrainingSession] =
    useState<TrainingSession | null>(null);
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [assessmentForm, setAssessmentForm] =
    useState<AssessmentFormState>(emptyAssessmentForm);
  const [patientForm, setPatientForm] =
    useState<PatientFormState>(emptyPatientForm);
  const [caregiverAccountForm, setCaregiverAccountForm] =
    useState<CaregiverAccountFormState>(emptyCaregiverAccountForm);
  const [caregiverBindingForm, setCaregiverBindingForm] =
    useState<CaregiverBindingFormState>(emptyCaregiverBindingForm);
  const [dataExportForm, setDataExportForm] =
    useState<DataExportFormState>(emptyDataExportForm);
  const [gameContentCreateForm, setGameContentCreateForm] =
    useState<GameContentCreateFormState>(emptyGameContentCreateForm);
  const [unityBuildForm, setUnityBuildForm] =
    useState<UnityBuildFormState>(emptyUnityBuildForm);
  const [trainingResultForm, setTrainingResultForm] =
    useState<TrainingResultFormState>(emptyTrainingResultForm);
  const [trainingReviewForm, setTrainingReviewForm] =
    useState<TrainingReviewFormState>(emptyTrainingReviewForm);
  const [browserPoseEvidenceForm, setBrowserPoseEvidenceForm] =
    useState<BrowserPoseEvidenceFormState>(emptyBrowserPoseEvidenceForm);
  const [trainingReadiness, setTrainingReadiness] = useState<TrainingReadiness>(
    emptyTrainingReadiness,
  );
  const [auditLogFilters, setAuditLogFilters] = useState<AuditLogFilters>(
    defaultAuditLogFilters,
  );

  useEffect(() => {
    api
      .health()
      .then(() => setApiStatus("服务可用"))
      .catch(() => setApiStatus("服务暂不可用"));
  }, []);

  const primaryRole = session?.context.primaryRole;
  const visibleScreens = primaryRole
    ? screens.filter((screen) =>
        visibleScreensByRole[primaryRole].includes(screen.id),
      )
    : screens;
  const currentPlan = resolveConfirmedCurrentPlan(data.patient);
  const visibleTrainingRecords =
    data.trainingRecords ?? buildCaregiverTrainingRecords(data.caregiverSummary);
  const todayTrainingRecords = buildTodayTrainingRecords(visibleTrainingRecords);
  const nextPlanItem = currentPlan
    ? resolveNextPlanItem(currentPlan, todayTrainingRecords)
    : undefined;
  const activePlanItem = activeTrainingSession
    ? findPlanItem(currentPlan, activeTrainingSession.planItemId)
    : nextPlanItem;
  const adminPermissions = session?.context.adminPermissions ?? [];
  const canManageUsers = hasAdminPermission(adminPermissions, "user.manage");
  const canReadAuditLogs = hasAdminPermission(adminPermissions, "audit.read");
  const canExportData = hasAdminPermission(adminPermissions, "data.export");
  const canCreatePatient = canManageUsers || primaryRole === "doctor";
  const canCreateCaregiver = canManageUsers;
  const canManageGames = hasAdminPermission(adminPermissions, "game.manage");
  const canPublishGames = hasAdminPermission(adminPermissions, "game.publish");

  async function reloadRoleData(
    loginResponse: LoginResponse,
    requestedPatientId?: string,
  ) {
    await loadRoleData(loginResponse, requestedPatientId, auditLogFilters);
  }

  const clearAuthenticatedState = useCallback((status: string, message?: string) => {
    window.localStorage.removeItem(sessionTokenKey);
    setSession(null);
    setData({});
    setSelectedPatientId(null);
    setPendingPlan(null);
    setActiveTrainingSession(null);
    setTrainingReadiness(emptyTrainingReadiness);
    setTrainingResultForm(emptyTrainingResultForm);
    setTrainingReviewForm(emptyTrainingReviewForm);
    setBrowserPoseEvidenceForm(emptyBrowserPoseEvidenceForm);
    setGameContentCreateForm(emptyGameContentCreateForm);
    setUnityBuildForm(emptyUnityBuildForm);
    setAuditLogFilters(defaultAuditLogFilters);
    setBusyAction(null);
    setActionStatus(null);
    setDataStatus(status);
    setDataError(message ?? null);
    setActive("login");
  }, []);

  function handleLogout() {
    clearAuthenticatedState("已退出登录");
  }

  function handleRequestError(error: unknown, defaultMessage: string) {
    if (error instanceof ApiError && error.status === 401) {
      clearAuthenticatedState("登录已过期", "登录已过期，请重新登录。");
      return;
    }
    setDataStatus(defaultMessage);
    setDataError(error instanceof Error ? error.message : defaultMessage);
  }

  const loadRoleData = useCallback(
    async (
      loginResponse: LoginResponse,
      requestedPatientId?: string,
      auditFilters: AuditLogFilters = defaultAuditLogFilters,
    ) => {
      const patientId = requestedPatientId ?? resolveActivePatientId(loginResponse);
      const role = loginResponse.context.primaryRole;
      const token = loginResponse.accessToken;
      const accessiblePatientIds = resolveAccessiblePatientIds(loginResponse);

      setDataStatus("加载业务数据");

      try {
        const nextData: AppData = {};
        if (patientId && role !== "caregiver") {
          const patientListPromise =
            role === "doctor" && accessiblePatientIds.length
              ? Promise.all(
                  accessiblePatientIds.map((id) => api.patient(token, id)),
                )
              : Promise.resolve<PatientProfile[]>([]);
          const [patient, assessments, trainingRecords, patients] =
            await Promise.all([
              api.patient(token, patientId),
              api.assessments(token, patientId),
              api.trainingRecords(token, patientId),
              patientListPromise,
            ]);
          nextData.patients = patients.length ? patients : [patient];
          nextData.patient = patient;
          nextData.assessments = assessments;
          nextData.trainingRecords = trainingRecords;
        }

        if (patientId && role === "caregiver") {
          const caregiverSummary = await api.caregiverSummary(token, patientId);
          nextData.caregiverSummary = caregiverSummary;
        }

        if (isAdminRole(role)) {
          const [adminDashboard, adminGameContents] = await Promise.all([
            api.adminDashboard(token),
            api.adminGameContents(token),
          ]);
          nextData.adminDashboard = adminDashboard;
          nextData.adminGameContents = adminGameContents;
          if (
            loginResponse.context.adminPermissions.includes("audit.read")
          ) {
            nextData.auditLogs = await api.auditLogs(token, auditFilters);
          }
        }

        if (role === "doctor") {
          nextData.adminDashboard = await api.adminDashboard(token);
        }

        setData(nextData);
        setDataStatus("业务数据已加载");
        setDataError(null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearAuthenticatedState("登录已过期", "登录已过期，请重新登录。");
          return;
        }
        setData({});
        setDataStatus("业务数据加载失败");
        setDataError(error instanceof Error ? error.message : "业务数据加载失败");
      }
    },
    [clearAuthenticatedState],
  );

  useEffect(() => {
    const token = window.localStorage.getItem(sessionTokenKey);
    if (!token) return;
    const accessToken = token;

    async function restoreSession() {
      setDataStatus("恢复登录状态");
      try {
        const meResponse = await api.me(accessToken);
        const restoredSession: LoginResponse = {
          accessToken,
          user: meResponse.user,
          context: meResponse.context,
        };
        const patientId = resolveActivePatientId(restoredSession);
        setSession(restoredSession);
        setSelectedPatientId(patientId ?? null);
        setActive(resolveHomeScreen(restoredSession));
        await loadRoleData(restoredSession, patientId);
      } catch (error) {
        clearAuthenticatedState(
          "登录已过期",
          error instanceof Error ? error.message : "登录已过期，请重新登录",
        );
      }
    }

    void restoreSession();
  }, [clearAuthenticatedState, loadRoleData]);

  async function handleLogin(account: string, password: string) {
    setDataStatus("登录中");
    setDataError(null);

    try {
      const loginResponse = await api.login(account, password);
      const patientId = resolveActivePatientId(loginResponse);
      window.localStorage.setItem(sessionTokenKey, loginResponse.accessToken);
      setSession(loginResponse);
      setSelectedPatientId(patientId ?? null);
      setActive(resolveHomeScreen(loginResponse));
      setAuditLogFilters(defaultAuditLogFilters);
      await loadRoleData(loginResponse, patientId, defaultAuditLogFilters);
    } catch (error) {
      setData({});
      setSession(null);
      window.localStorage.removeItem(sessionTokenKey);
      setDataStatus("登录失败");
      setDataError(error instanceof Error ? error.message : "登录失败");
      setActive("login");
    }
  }

  async function handleSelectPatient(patientId: string) {
    if (!session) return;
    setSelectedPatientId(patientId);
    setActiveTrainingSession(null);
    setTrainingReadiness(emptyTrainingReadiness);
    setTrainingResultForm(emptyTrainingResultForm);
    setTrainingReviewForm(emptyTrainingReviewForm);
    setBrowserPoseEvidenceForm(emptyBrowserPoseEvidenceForm);
    await reloadRoleData(session, patientId);
  }

  function updateAssessmentForm(
    field: keyof AssessmentFormState,
    value: string,
  ) {
    setAssessmentForm((current) => ({ ...current, [field]: value }));
  }

  function updatePatientForm(field: keyof PatientFormState, value: string) {
    setPatientForm((current) => ({ ...current, [field]: value }));
  }

  function updateCaregiverAccountForm(
    field: keyof CaregiverAccountFormState,
    value: string,
  ) {
    setCaregiverAccountForm((current) => ({ ...current, [field]: value }));
  }

  function updateCaregiverBindingForm(
    field: keyof CaregiverBindingFormState,
    value: string | boolean,
  ) {
    setCaregiverBindingForm((current) => ({ ...current, [field]: value }));
  }

  function updateAuditLogFilters(
    field: keyof AuditLogFilters,
    value: AuditLogFilters[keyof AuditLogFilters],
  ) {
    setAuditLogFilters((current) => ({ ...current, [field]: value }));
  }

  function updateDataExportForm(
    field: keyof DataExportFormState,
    value: DataExportFormState[keyof DataExportFormState],
  ) {
    setDataExportForm((current) => ({ ...current, [field]: value }));
  }

  function updateBrowserPoseEvidenceForm(
    field: keyof BrowserPoseEvidenceFormState,
    value: string,
  ) {
    setBrowserPoseEvidenceForm((current) => ({ ...current, [field]: value }));
  }

  function updateGameContentCreateForm<K extends keyof GameContentCreateFormState>(
    field: K,
    value: GameContentCreateFormState[K],
  ) {
    setGameContentCreateForm((current) => ({ ...current, [field]: value }));
  }

  function updateUnityBuildForm<K extends keyof UnityBuildFormState>(
    field: K,
    value: UnityBuildFormState[K],
  ) {
    if (field === "gameContentId" && typeof value === "string") {
      const selectedGame = data.adminGameContents?.find((game) => game.id === value);
      setUnityBuildForm(selectedGame ? buildUnityBuildForm(selectedGame) : emptyUnityBuildForm);
      return;
    }
    setUnityBuildForm((current) => ({ ...current, [field]: value }));
  }

  function updateTrainingResultForm<K extends keyof TrainingResultFormState>(
    field: K,
    value: TrainingResultFormState[K],
  ) {
    setTrainingResultForm((current) => ({ ...current, [field]: value }));
  }

  function updateTrainingReviewForm<K extends keyof TrainingReviewFormState>(
    field: K,
    value: TrainingReviewFormState[K],
  ) {
    setTrainingReviewForm((current) => ({ ...current, [field]: value }));
  }

  async function handleRefreshAuditLogs(filters: AuditLogFilters) {
    if (!session) return;
    if (!canReadAuditLogs) {
      setActionStatus("当前账号没有审计日志查询权限。");
      return;
    }

    setBusyAction("auditLogs");
    setDataError(null);
    setActionStatus("正在查询审计日志");

    try {
      validateAuditLogFilters(filters);
      const auditLogs = await api.auditLogs(session.accessToken, filters);
      setAuditLogFilters(filters);
      setData((current) => ({ ...current, auditLogs }));
      setDataStatus("审计日志已加载");
      setActionStatus(`已按筛选条件查询到 ${auditLogs.length} 条审计日志。`);
    } catch (error) {
      handleRequestError(error, "审计日志查询失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExportData(form: DataExportFormState) {
    if (!session) return;
    if (!canExportData) {
      setActionStatus("当前账号没有脱敏数据导出权限。");
      return;
    }

    setBusyAction("exportData");
    setDataError(null);
    setActionStatus("正在生成脱敏导出文件");

    try {
      const payload = buildDataExportPayload(form);
      const exported = await api.exportData(session.accessToken, payload);
      downloadExportedFile(exported);
      if (canReadAuditLogs) {
        const auditLogs = await api.auditLogs(session.accessToken, auditLogFilters);
        setData((current) => ({ ...current, auditLogs }));
      }
      setActionStatus(
        canReadAuditLogs
          ? `脱敏导出文件 ${exported.filename} 已生成，导出操作已写入审计日志。`
          : `脱敏导出文件 ${exported.filename} 已生成，导出操作已写入审计日志。当前账号无审计查询权限，不能直接刷新日志列表。`,
      );
    } catch (error) {
      handleRequestError(error, "脱敏数据导出失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreatePatient(form: PatientFormState) {
    if (!session) return;
    if (!canCreatePatient) {
      setActionStatus("当前账号没有患者建档权限。");
      return;
    }

    setBusyAction("createPatient");
    setDataError(null);
    setActionStatus("正在创建患者档案");

    try {
      const payload = buildCreatePatientPayload(form);
      const created = await api.createPatient(session.accessToken, payload);
      const meResponse = await api.me(session.accessToken);
      const refreshedSession: LoginResponse = {
        accessToken: session.accessToken,
        user: meResponse.user,
        context: meResponse.context,
      };
      setSession(refreshedSession);
      setSelectedPatientId(created.id);
      setPatientForm(emptyPatientForm);
      await loadRoleData(refreshedSession, created.id, auditLogFilters);
      setActionStatus(
        `患者 ${created.name} 档案已创建，登录账号 ${payload.account} 已绑定患者角色。`,
      );
      setActive("profile");
    } catch (error) {
      handleRequestError(error, "患者建档失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateCaregiverAccount(form: CaregiverAccountFormState) {
    if (!session) return;
    if (!canCreateCaregiver) {
      setActionStatus("当前账号没有家属账号创建权限。");
      return;
    }

    setBusyAction("createCaregiver");
    setDataError(null);
    setActionStatus("正在创建家属登录账号");

    try {
      const payload = buildCreateCaregiverAccountPayload(form);
      const caregiver = await api.createCaregiverAccount(
        session.accessToken,
        payload,
      );
      setCaregiverAccountForm(emptyCaregiverAccountForm);
      await loadRoleData(
        session,
        selectedPatientId ?? undefined,
        auditLogFilters,
      );
      setActionStatus(
        `家属账号 ${caregiver.account} 已创建。需患者本人签署家属共享授权并绑定后，家属才能查看摘要。`,
      );
    } catch (error) {
      handleRequestError(error, "家属账号创建失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateAssessment(form: AssessmentFormState) {
    if (!session || !data.patient) return;

    setBusyAction("assessment");
    setDataError(null);
    setActionStatus("正在写入 AI 评估记录");

    try {
      const scoreSummary = {
        mmse: parseRequiredNumber(form.mmse, "MMSE"),
        cdr: parseRequiredNumber(form.cdr, "CDR"),
        memory: parseRequiredNumber(form.memory, "记忆力"),
        orientation: parseRequiredNumber(form.orientation, "定向力"),
        executive: parseRequiredNumber(form.executive, "执行力"),
        language: parseRequiredNumber(form.language, "语言表达"),
      };
      const transcript = form.transcript.trim();
      const analysisSummary = form.analysisSummary.trim();
      const modelVersion = form.modelVersion.trim();
      if (!transcript || !analysisSummary || !modelVersion) {
        throw new Error("请填写语音转写、AI 分析摘要和模型版本。");
      }

      await api.createAssessment(session.accessToken, {
        patientId: data.patient.id,
        assessmentType: "MMSE/CDR",
        scoreSummary,
        rawInputSummary: {
          source: "clinician_input",
          transcript,
          analysisSummary,
          modelVersion,
          confidence: parseRequiredNumber(form.confidence, "AI 置信度"),
          reactionDelaySeconds: parseRequiredNumber(
            form.reactionDelaySeconds,
            "反应延迟",
          ),
          capturedAt: new Date().toISOString(),
        },
      });
      setAssessmentForm(emptyAssessmentForm);
      await reloadRoleData(session, data.patient.id);
      setActionStatus("AI 评估已保存，风险评级与分析摘要已刷新。");
      setActive("match");
    } catch (error) {
      handleRequestError(error, "AI 评估写入失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGrantConsent(consentType: ConsentType) {
    if (!session || !data.patient) return;

    setBusyAction("consent");
    setDataError(null);
    setActionStatus("正在写入授权记录");

    try {
      await api.createConsent(session.accessToken, {
        patientId: data.patient.id,
        subjectUserId: session.user.id,
        consentType,
        consentVersion,
        evidenceSnapshot: {
          source: "patient_web_consent",
          consentVersion,
          consentType,
          subjectUserId: session.user.id,
          signedBy: session.user.displayName,
          signedAt: new Date().toISOString(),
        },
      });
      await reloadRoleData(session, data.patient.id);
      setActionStatus(`${consentLabel(consentType)} 已完成签署并写入审计。`);
    } catch (error) {
      handleRequestError(error, "授权签署失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRevokeConsent(record: ConsentRecord) {
    if (!session || !data.patient) return;

    setBusyAction("revokeConsent");
    setDataError(null);
    setActionStatus("正在撤回授权记录");

    try {
      await api.revokeConsent(session.accessToken, record.id);
      await reloadRoleData(session, data.patient.id);
      setActionStatus(
        record.consentType === "caregiver_sharing"
          ? "已撤回家属共享授权，家属端摘要和训练记录访问将立即失效。"
          : `${consentLabel(record.consentType)} 已撤回，相关数据采集或处理入口将被平台拦截。`,
      );
    } catch (error) {
      handleRequestError(error, "授权撤回失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleBindCaregiver(form: CaregiverBindingFormState) {
    if (!session || !data.patient) return;

    setBusyAction("bindCaregiver");
    setDataError(null);
    setActionStatus("正在绑定家属账号");

    try {
      const payload = buildCaregiverRelationPayload(form);
      await api.createCaregiverRelation(
        session.accessToken,
        data.patient.id,
        payload,
      );
      const meResponse = await api.me(session.accessToken);
      setSession({
        accessToken: session.accessToken,
        user: meResponse.user,
        context: meResponse.context,
      });
      setCaregiverBindingForm(emptyCaregiverBindingForm);
      await reloadRoleData(session, data.patient.id);
      setActionStatus(`家属账号 ${payload.caregiverAccount} 已完成授权绑定。`);
    } catch (error) {
      handleRequestError(error, "家属绑定失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRevokeCaregiver(relation: CaregiverRelation) {
    if (!session || !data.patient) return;

    setBusyAction("revokeCaregiver");
    setDataError(null);
    setActionStatus("正在撤回家属绑定");

    try {
      await api.revokeCaregiverRelation(
        session.accessToken,
        data.patient.id,
        relation.id,
      );
      await reloadRoleData(session, data.patient.id);
      setActionStatus(`已撤回 ${relation.caregiver.displayName} 的家属访问权限。`);
    } catch (error) {
      handleRequestError(error, "家属绑定撤回失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRecommendPlan() {
    if (!session || !data.patient) return;

    const readiness = buildPlanPrerequisiteState(data.patient, pendingPlan);
    if (!readiness.canRecommend) {
      setActionStatus(
        `暂不能生成推荐方案：${readiness.blockers
          .map(([label, value]) => `${label}：${value}`)
          .join("；")}。`,
      );
      return;
    }

    setBusyAction("recommend");
    setDataError(null);
    setActionStatus("正在生成待医师确认的个性化方案");

    try {
      const plan = await api.recommendPlan(session.accessToken, {
        patientId: data.patient.id,
      });
      setPendingPlan(plan);
      setActionStatus("已生成待医师确认方案，患者训练仍使用当前生效方案。");
      setActive("match");
    } catch (error) {
      handleRequestError(error, "康复方案生成失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmPlan(
    plan: RehabPlan,
    options: {
      dailyDuration: number;
      weekFrequency: number;
      adjustmentReason: string;
      itemAdjustments: Array<{
        gameContentId: string;
        durationMinutes: number;
        frequencyPerWeek: number;
        difficulty: string;
      }>;
    },
  ) {
    if (!session || !data.patient) return;

    setBusyAction("confirmPlan");
    setDataError(null);
    setActionStatus("正在确认并下发康复方案");

    try {
      const confirmed = await api.confirmPlan(session.accessToken, plan.id, {
        dailyDuration: options.dailyDuration,
        weekFrequency: options.weekFrequency,
        adjustmentReason: options.adjustmentReason,
        difficultyLadder: {
          source: "doctor_adjustment",
          confirmedFromPlanId: plan.id,
          confirmedAt: new Date().toISOString(),
        },
        itemAdjustments: options.itemAdjustments,
      });
      setPendingPlan(null);
      await reloadRoleData(session, confirmed.patientId);
      setSelectedPatientId(confirmed.patientId);
      setActionStatus("康复方案已确认下发，患者端将使用新的当前生效方案。");
      setActive("plan");
    } catch (error) {
      handleRequestError(error, "康复方案确认失败");
    } finally {
      setBusyAction(null);
    }
  }

  function handleEnterTrainingPrep() {
    if (!data.patient || !currentPlan || !nextPlanItem) return;
    const consentState = summarizeConsents(data.patient);
    if (!consentState.camera_capture) {
      setDataError("请先在设备与权限中心签署摄像头体感采集授权。");
      setActive("device");
      return;
    }
    setActionStatus("请先完成摄像头设备检测，再创建训练记录。");
    setActive("prep");
  }

  async function handleCheckTrainingDevice() {
    setBusyAction("checkDevice");
    setDataError(null);
    setTrainingReadiness((current) => ({
      ...current,
      cameraPermission: "requesting",
      error: undefined,
    }));

    try {
      const readiness = await checkCameraReadiness();
      setTrainingReadiness((current) => ({
        ...current,
        ...readiness,
      }));
      setActionStatus(
        `摄像头设备已识别：${readiness.cameraLabel ?? readiness.cameraDeviceId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "摄像头检测失败";
      setTrainingReadiness((current) => ({
        ...current,
        cameraPermission: "denied",
        error: message,
      }));
      setDataError(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCheckPoseReadiness() {
    setBusyAction("checkPose");
    setDataError(null);
    setTrainingReadiness((current) => ({
      ...current,
      poseRuntimeStatus: "loading",
      poseError: undefined,
    }));

    try {
      const result = await checkPoseReadiness();
      setTrainingReadiness((current) => mergePoseReadiness(current, result));
      setActionStatus(
        `姿态识别已就绪：${result.poseLandmarkCount} 个关键点，平均置信度 ${Math.round(
          result.poseAverageVisibility * 100,
        )}%`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "姿态识别检测失败";
      setTrainingReadiness((current) => ({
        ...current,
        poseRuntimeStatus: "error",
        poseError: message,
      }));
      setDataError(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartTraining() {
    if (!session || !data.patient || !currentPlan || !nextPlanItem) return;
    const consentState = summarizeConsents(data.patient);
    if (!consentState.camera_capture) {
      setDataError("缺少摄像头体感采集授权，不能开始训练。");
      setActive("device");
      return;
    }
    if (!isGameReadyForTraining(nextPlanItem.gameContent)) {
      setDataError(
        `训练内容 ${nextPlanItem.gameContent.name} 尚未完成发布配置，不能开始训练。`,
      );
      setActive("prep");
      return;
    }
    if (
      trainingReadiness.cameraPermission !== "granted" ||
      !trainingReadiness.cameraDeviceId
    ) {
      setDataError("请先完成摄像头设备检测，再开始训练。");
      setActive("prep");
      return;
    }
    if (trainingReadiness.poseRuntimeStatus !== "ready") {
      setDataError("请先完成体感姿态识别检测，再开始训练。");
      setActive("prep");
      return;
    }

    setBusyAction("startTraining");
    setDataError(null);
    setActionStatus("正在创建训练会话");

    try {
      const gameRunId = createGameRunId(data.patient.id, nextPlanItem.gameContent.code);
      const clientStartedAt = new Date().toISOString();
      const trainingSession = await api.startTrainingSession(session.accessToken, {
        patientId: data.patient.id,
        rehabPlanId: currentPlan.id,
        planItemId: nextPlanItem.id,
        gameContentId: nextPlanItem.gameContentId,
        gameRunId,
        deviceCode: trainingReadiness.cameraDeviceId,
        calibrationStatus: "checked",
        clientStartedAt,
        idempotencyKey: [
          "web-training",
          data.patient.id,
          nextPlanItem.id,
          gameRunId,
        ].join(":"),
      });
      setActiveTrainingSession({
        ...trainingSession,
        gameContent: nextPlanItem.gameContent,
        gameRunId,
        deviceCode: trainingReadiness.cameraDeviceId,
        calibrationStatus: "checked",
        clientStartedAt,
      });
      await reloadRoleData(session, data.patient.id);
      setActionStatus(`训练会话已开始：${nextPlanItem.gameContent.name}`);
      setActive("game");
    } catch (error) {
      handleRequestError(error, "训练会话创建失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateGameContent(form: GameContentCreateFormState) {
    if (!session) return;
    if (!canManageGames) {
      setActionStatus("当前账号没有训练内容管理权限。");
      return;
    }

    setBusyAction("createGameContent");
    setDataError(null);
    setActionStatus("正在创建训练内容");

    try {
      const payload = buildGameContentCreatePayload(form);
      const created = await api.createGameContent(session.accessToken, payload);
      const refreshedGames = await api.adminGameContents(session.accessToken);
      setData((current) => ({
        ...current,
        adminGameContents: refreshedGames,
      }));
      setGameContentCreateForm(emptyGameContentCreateForm);
      if (created.runtimeType === "unity_webgl") {
        setUnityBuildForm(buildUnityBuildForm(created));
      }
      setActionStatus(
        created.runtimeType === "browser_pose_game"
          ? `${created.name} 已作为浏览器体感训练发布，可进入康复方案推荐。`
          : `${created.name} 已创建为 ${gameContentStatusLabel(
              created.status,
            )}，资源状态为 ${gameBuildStatusLabel(
              created.buildStatus,
            )}。请继续上传并配置训练资源。`,
      );
    } catch (error) {
      handleRequestError(error, "训练内容创建失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateGameContentStatus(
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) {
    if (!session) return;
    if (!canManageGames) {
      setActionStatus("当前账号没有训练内容管理权限。");
      return;
    }

    setBusyAction("updateGameContentStatus");
    setDataError(null);
    setActionStatus("正在更新训练内容运营状态");

    try {
      const updated = await api.updateGameContentStatus(
        session.accessToken,
        gameContentId,
        { status },
      );
      const refreshedGames = await api.adminGameContents(session.accessToken);
      setData((current) => ({
        ...current,
        adminGameContents: refreshedGames,
      }));
      setActionStatus(`${updated.name} 已更新为 ${gameContentStatusLabel(updated.status)}。`);
    } catch (error) {
      handleRequestError(error, "训练内容状态更新失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateUnityBuild(form: UnityBuildFormState) {
    if (!session) return;

    setBusyAction("updateUnityBuild");
    setDataError(null);
    setActionStatus("正在保存训练资源配置");

    try {
      const payload = buildUnityBuildPayload(form, canPublishGames);
      const updated = await api.updateUnityBuild(
        session.accessToken,
        form.gameContentId,
        payload,
      );
      const refreshedGames = await api.adminGameContents(session.accessToken);
      setData((current) => ({
        ...current,
        adminGameContents: refreshedGames,
      }));
      setUnityBuildForm(buildUnityBuildForm(updated));
      setActionStatus(
        updated.buildStatus === "released"
          ? `${updated.name} 已发布为训练资源。`
          : `${updated.name} 训练资源配置已保存为 ${gameBuildStatusLabel(
              updated.buildStatus,
            )}。`,
      );
    } catch (error) {
      handleRequestError(error, "训练资源配置保存失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitTrainingResult(form: TrainingResultFormState) {
    if (!session || !data.patient || !activeTrainingSession || !activePlanItem) {
      return;
    }

    setBusyAction("submitResult");
    setDataError(null);
    setActionStatus("正在提交本次训练结果");

    try {
      const payload = buildTrainingResultPayload(
        form,
        activePlanItem.gameContent.runtimeType,
      );
      const result = await api.submitTrainingResult(
        session.accessToken,
        activeTrainingSession.id,
        payload,
      );
      setActiveTrainingSession((current) =>
        current
          ? {
              ...current,
              result,
              sessionStatus:
                result.qualityFlag === "valid" ? "completed" : "upload_failed",
              syncStatus: result.qualityFlag === "valid" ? "synced" : "failed",
              endedAt: new Date().toISOString(),
            }
          : current,
      );
      setTrainingResultForm(emptyTrainingResultForm);
      await reloadRoleData(session, data.patient.id);
      setActionStatus(
        result.qualityFlag === "valid"
          ? "训练结果已回传，动作指标和训练记录已刷新。"
          : "训练结果已保存，但被标记为可疑数据，请医师在工作台复核。",
      );
      setActive("result");
    } catch (error) {
      handleRequestError(error, "训练结果提交失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitTrainingReview(form: TrainingReviewFormState) {
    if (!session || !data.patient) return;

    setBusyAction("reviewTraining");
    setDataError(null);
    setActionStatus("正在提交训练复核结论");

    try {
      const payload = buildTrainingReviewPayload(form);
      await api.reviewTrainingResult(session.accessToken, form.resultId, payload);
      setTrainingReviewForm(emptyTrainingReviewForm);
      await reloadRoleData(session, data.patient.id);
      setActionStatus("训练复核结论已保存，审计日志已记录本次操作。");
    } catch (error) {
      handleRequestError(error, "训练复核提交失败");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(117,207,209,0.35),transparent_28%),linear-gradient(135deg,#f7fbf8_0%,#e8f5f4_48%,#f8f4ee_100%)] text-[#16333d]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(22,51,61,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(22,51,61,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="relative mx-auto flex min-h-dvh max-w-[1500px] gap-5 px-5 py-5">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-white/70 bg-white/55 p-4 shadow-[0_24px_80px_rgba(22,51,61,0.14)] backdrop-blur-2xl xl:block">
          <div className="mb-6 flex items-center gap-3 p-2">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1f7a8c] text-xl font-black text-white shadow-lg shadow-cyan-900/20">
              康
            </div>
            <div>
              <p className="text-xs font-black uppercase text-[#25859a]">
                认知康复服务
              </p>
              <h1 className="text-lg font-black">认知康复平台</h1>
            </div>
          </div>
          <nav className="grid gap-2">
            {visibleScreens.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left text-sm font-black transition",
                    active === item.id
                      ? "bg-[#173945] text-white shadow-lg shadow-cyan-950/20"
                      : "text-[#58717a] hover:bg-white/70",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-[#e8f8f8]/80 p-4">
            <p className="text-xs font-black uppercase text-[#25859a]">
              服务状态
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-[#42616b]">{apiStatus}</span>
              <span
                className={cn(
                  "h-3 w-3 rounded-full shadow-[0_0_18px_rgba(16,185,129,0.8)]",
                  apiStatus === "服务可用" ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
            </div>
            <p className="mt-2 text-xs font-bold text-[#58717a]">{dataStatus}</p>
            {actionStatus && (
              <p className="mt-2 text-xs font-bold leading-5 text-[#1f7a8c]">
                {actionStatus}
              </p>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/55 px-5 py-4 shadow-[0_18px_60px_rgba(22,51,61,0.1)] backdrop-blur-2xl">
            <div>
              <p className="text-xs font-black uppercase text-[#25859a]">
                认知康复管理平台
              </p>
              <h2 className="text-2xl font-black md:text-3xl">
                认知康复服务平台
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {session ? (
                <>
                  <span className="rounded-full border border-[#c9e3e7] bg-white/70 px-4 py-2 text-sm font-black text-[#42616b]">
                    {session.user.displayName} · {roleLabel(primaryRole)}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="min-h-10 rounded-full border border-[#c9e3e7] bg-white/70 px-4 py-2 text-sm font-black text-[#42616b] transition hover:bg-white"
                  >
                    退出登录
                  </button>
                </>
              ) : (
                <span className="rounded-full border border-[#c9e3e7] bg-white/70 px-4 py-2 text-sm font-black text-[#42616b]">
                  请使用机构分配的账号登录
                </span>
              )}
            </div>
          </header>

          <div className="xl:hidden mb-4 flex gap-2 overflow-x-auto pb-2">
            {visibleScreens.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={cn(
                  "min-h-11 shrink-0 rounded-full px-4 text-sm font-black",
                  active === item.id
                    ? "bg-[#173945] text-white"
                    : "bg-white/70 text-[#58717a]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {dataError && (
            <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50/90 px-5 py-4 font-bold text-amber-800">
              {dataError}
            </div>
          )}
          {actionStatus && (
            <div className="mb-4 rounded-3xl border border-[#b9e2d5] bg-[#eefaf7]/90 px-5 py-4 font-bold text-[#1f7a8c]">
              {actionStatus}
            </div>
          )}

          <div className="min-h-[720px] flex-1 rounded-[34px] border border-white/70 bg-white/45 p-4 shadow-[0_26px_90px_rgba(22,51,61,0.16)] backdrop-blur-2xl md:p-6">
            {active === "login" && (
              <LoginScreen
                session={session}
                onLogin={handleLogin}
                dataStatus={dataStatus}
              />
            )}
            {active === "profile" && (
              <ProfileScreen
                patient={data.patient}
                onOpenAssessment={() => setActive("assessment")}
                onOpenDeviceCenter={() => setActive("device")}
                onGrantConsent={handleGrantConsent}
                onRevokeConsent={handleRevokeConsent}
                caregiverBindingForm={caregiverBindingForm}
                onCaregiverBindingFormChange={updateCaregiverBindingForm}
                onBindCaregiver={handleBindCaregiver}
                onRevokeCaregiver={handleRevokeCaregiver}
                isBusy={busyAction === "assessment"}
                isConsentBusy={busyAction === "consent"}
                isRevokingConsent={busyAction === "revokeConsent"}
                isBindingCaregiver={busyAction === "bindCaregiver"}
                isRevokingCaregiver={busyAction === "revokeCaregiver"}
              />
            )}
            {active === "device" && (
              <DevicePermissionCenterScreen
                patient={data.patient}
                readiness={trainingReadiness}
                onGrantConsent={handleGrantConsent}
                onRevokeConsent={handleRevokeConsent}
                onCheckDevice={handleCheckTrainingDevice}
                onCheckPose={handleCheckPoseReadiness}
                isConsentBusy={busyAction === "consent"}
                isRevokingConsent={busyAction === "revokeConsent"}
                isCheckingDevice={busyAction === "checkDevice"}
                isCheckingPose={busyAction === "checkPose"}
              />
            )}
            {active === "assessment" && (
              <AssessmentScreen
                assessments={data.assessments}
                onCreateAssessment={handleCreateAssessment}
                assessmentForm={assessmentForm}
                onAssessmentFormChange={updateAssessmentForm}
                isBusy={busyAction === "assessment"}
              />
            )}
            {active === "match" && (
              <MatchScreen
                patient={data.patient}
                pendingPlan={pendingPlan}
                onRecommendPlan={handleRecommendPlan}
                isBusy={busyAction === "recommend"}
              />
            )}
            {active === "today" && (
              <TodayScreen
                patient={data.patient}
                caregiverSummary={data.caregiverSummary}
                todayTrainingRecords={todayTrainingRecords}
                onEnterTrainingPrep={handleEnterTrainingPrep}
                nextPlanItem={nextPlanItem}
              />
            )}
            {active === "prep" && (
              <PrepScreen
                planItem={nextPlanItem}
                onStartTraining={handleStartTraining}
                onCheckDevice={handleCheckTrainingDevice}
                onCheckPose={handleCheckPoseReadiness}
                readiness={trainingReadiness}
                isBusy={busyAction === "startTraining"}
                hasCameraConsent={
                  data.patient
                    ? Boolean(summarizeConsents(data.patient).camera_capture)
                    : false
                }
              />
            )}
            {active === "game" && (
              <GameScreen
                trainingSession={activeTrainingSession}
                planItem={activePlanItem}
                form={trainingResultForm}
                onFormChange={updateTrainingResultForm}
                onSubmitResult={handleSubmitTrainingResult}
                isBusy={busyAction === "submitResult"}
              />
            )}
            {active === "result" && (
              <ResultScreen
                patient={data.patient}
                currentPlan={currentPlan}
                trainingRecords={visibleTrainingRecords}
                readiness={trainingReadiness}
                evidenceForm={browserPoseEvidenceForm}
                onEvidenceFormChange={updateBrowserPoseEvidenceForm}
              />
            )}
            {active === "family" && (
              <FamilyScreen caregiverSummary={data.caregiverSummary} />
            )}
            {active === "doctor" && (
              <DoctorScreen
                patients={data.patients}
                patient={data.patient}
                selectedPatientId={selectedPatientId}
                onSelectPatient={handleSelectPatient}
                patientForm={patientForm}
                onPatientFormChange={updatePatientForm}
                onCreatePatient={handleCreatePatient}
                isCreatingPatient={busyAction === "createPatient"}
                primaryRole={primaryRole}
                canCreatePatient={canCreatePatient}
                trainingRecords={visibleTrainingRecords}
                reviewForm={trainingReviewForm}
                onReviewFormChange={updateTrainingReviewForm}
                onSubmitTrainingReview={handleSubmitTrainingReview}
                isReviewingTraining={busyAction === "reviewTraining"}
              />
            )}
            {active === "plan" && (
              <PlanScreen
                patient={data.patient}
                onConfirmPlan={handleConfirmPlan}
                isBusy={busyAction === "confirmPlan"}
              />
            )}
            {active === "admin" && (
              <AdminScreen
                dashboard={data.adminDashboard}
                gameContents={data.adminGameContents}
                gameContentCreateForm={gameContentCreateForm}
                onGameContentCreateFormChange={updateGameContentCreateForm}
                onCreateGameContent={handleCreateGameContent}
                onUpdateGameContentStatus={handleUpdateGameContentStatus}
                unityBuildForm={unityBuildForm}
                onUnityBuildFormChange={updateUnityBuildForm}
                onUpdateUnityBuild={handleUpdateUnityBuild}
                caregiverAccountForm={caregiverAccountForm}
                onCaregiverAccountFormChange={updateCaregiverAccountForm}
                onCreateCaregiverAccount={handleCreateCaregiverAccount}
                isCreatingCaregiver={busyAction === "createCaregiver"}
                isCreatingGameContent={busyAction === "createGameContent"}
                isUpdatingGameContentStatus={
                  busyAction === "updateGameContentStatus"
                }
                isUpdatingUnityBuild={busyAction === "updateUnityBuild"}
                canCreateCaregiver={canCreateCaregiver}
                canManageGames={canManageGames}
                canPublishGames={canPublishGames}
              />
            )}
            {active === "security" && (
              <SecurityScreen
                auditLogs={data.auditLogs}
                filters={auditLogFilters}
                exportForm={dataExportForm}
                onFiltersChange={updateAuditLogFilters}
                onExportFormChange={updateDataExportForm}
                onRefreshAuditLogs={handleRefreshAuditLogs}
                onExportData={handleExportData}
                isLoading={busyAction === "auditLogs"}
                isExporting={busyAction === "exportData"}
                canReadAuditLogs={canReadAuditLogs}
                canExportData={canExportData}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginScreen({
  session,
  onLogin,
  dataStatus,
}: {
  session: LoginResponse | null;
  onLogin: (account: string, password: string) => Promise<void>;
  dataStatus: string;
}) {
  return (
    <ScreenGrid
      eyebrow="账号登录"
      title="欢迎使用认知康复平台"
      subtitle="请使用机构分配的账号登录。系统会根据角色展示患者训练、医师管理、家属授权或运营管理功能。"
      aside={
        <LoginPanel session={session} onLogin={onLogin} dataStatus={dataStatus} />
      }
    >
      <LoopStrip />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard value="分级授权" label="按角色控制数据范围" icon={UsersRound} />
        <MetricCard value="操作留痕" label="关键操作可追溯" icon={ShieldCheck} />
        <MetricCard value="知情同意" label="隐私授权逐项校验" icon={Database} />
      </div>
      <GlassCard className="mt-4">
        <h3 className="text-2xl font-black">登录与数据访问说明</h3>
        <p className="mt-3 text-lg leading-8 text-[#4f6670]">
          平台仅展示当前账号被授权访问的数据范围。涉及智能评估分析、摄像头采集、家属共享和数据导出的操作会校验授权状态，并写入审计日志。
        </p>
      </GlassCard>
    </ScreenGrid>
  );
}

function LoginPanel({
  session,
  onLogin,
  dataStatus,
}: {
  session: LoginResponse | null;
  onLogin: (account: string, password: string) => Promise<void>;
  dataStatus: string;
}) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onLogin(account, password);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <GlassCard className="h-full">
      <Badge label="账号密码登录" icon={KeyRound} />
      <div className="mt-6 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
        <h3 className="text-2xl font-black text-[#173945]">登录工作台</h3>
        <p className="mt-2 font-bold leading-7 text-[#526b74]">
          患者、家属、医师和运营人员共用同一入口。登录后会自动进入对应工作台。
        </p>
      </div>
      <form onSubmit={submit}>
        <FieldLine
          label="账号"
          value={account}
          onChange={(value) => setAccount(value)}
        />
        <FieldLine
          label="密码"
          type="password"
          value={password}
          onChange={(value) => setPassword(value)}
        />
        <div className="mt-5 flex gap-3 rounded-2xl border border-[#c9e3e7] bg-white/75 p-4">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" />
          <p className="text-sm font-bold leading-6 text-[#4f6670]">
            登录成功后将根据账号权限加载可查看内容，并记录本次登录。
            {session
              ? ` 当前身份：${session.user.displayName} / ${roleLabel(
                  session.context.primaryRole,
                )}。`
              : ""}
          </p>
        </div>
        <PrimaryButton
          className="mt-5 w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? dataStatus : "进入康复平台"}
        </PrimaryButton>
      </form>
    </GlassCard>
  );
}

function ProfileScreen({
  patient,
  onOpenAssessment,
  onOpenDeviceCenter,
  onGrantConsent,
  onRevokeConsent,
  caregiverBindingForm,
  onCaregiverBindingFormChange,
  onBindCaregiver,
  onRevokeCaregiver,
  isBusy,
  isConsentBusy,
  isRevokingConsent,
  isBindingCaregiver,
  isRevokingCaregiver,
}: {
  patient?: PatientProfile;
  onOpenAssessment: () => void;
  onOpenDeviceCenter: () => void;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  caregiverBindingForm: CaregiverBindingFormState;
  onCaregiverBindingFormChange: (
    field: keyof CaregiverBindingFormState,
    value: string | boolean,
  ) => void;
  onBindCaregiver: (form: CaregiverBindingFormState) => Promise<void>;
  onRevokeCaregiver: (relation: CaregiverRelation) => Promise<void>;
  isBusy: boolean;
  isConsentBusy: boolean;
  isRevokingConsent: boolean;
  isBindingCaregiver: boolean;
  isRevokingCaregiver: boolean;
}) {
  if (!patient) {
    return (
      <MissingDataCard
        title="等待患者建档数据"
        message="请先登录患者、医师或管理员账号，并确保该角色已绑定可访问的患者档案。"
      />
    );
  }

  return (
    <ScreenGrid
      eyebrow="建档与授权"
      title="患者建档与知情同意"
      subtitle="训练和评估前请先完成隐私协议、AI 数据处理、摄像头和麦克风授权。"
      aside={
        <AuthorizationPanel
          patient={patient}
          onOpenAssessment={onOpenAssessment}
          onOpenDeviceCenter={onOpenDeviceCenter}
          onGrantConsent={onGrantConsent}
          caregiverBindingForm={caregiverBindingForm}
          onCaregiverBindingFormChange={onCaregiverBindingFormChange}
          onBindCaregiver={onBindCaregiver}
          onRevokeCaregiver={onRevokeCaregiver}
          isBusy={isBusy}
          isConsentBusy={isConsentBusy}
          isBindingCaregiver={isBindingCaregiver}
          isRevokingCaregiver={isRevokingCaregiver}
        />
      }
    >
      <GlassCard>
        <div className="grid gap-4 md:grid-cols-2">
          <FormBlock label="姓名" value={patient.name} />
          <FormBlock label="年龄" value={`${patient.age} 岁`} />
          <FormBlock
            label="联系方式"
            value={maskPhone(patient.mobilePhone)}
          />
          <FormBlock
            label="照护人"
            value={patient.caregiverName ?? "未绑定"}
          />
        </div>
        <div className="mt-4 rounded-3xl bg-[#e9f8f6] p-5">
          <p className="text-sm font-black text-[#25859a]">基础健康指标</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {healthMetricChips(patient.healthMetrics).map((item) => (
              <Chip key={item}>{item}</Chip>
            ))}
          </div>
        </div>
      </GlassCard>
      <ConsentChecklist
        patient={patient}
        onGrantConsent={onGrantConsent}
        onRevokeConsent={onRevokeConsent}
        isBusy={isConsentBusy}
        isRevoking={isRevokingConsent}
      />
    </ScreenGrid>
  );
}

function AuthorizationPanel({
  patient,
  onOpenAssessment,
  onOpenDeviceCenter,
  onGrantConsent,
  caregiverBindingForm,
  onCaregiverBindingFormChange,
  onBindCaregiver,
  onRevokeCaregiver,
  isBusy,
  isConsentBusy,
  isBindingCaregiver,
  isRevokingCaregiver,
}: {
  patient: PatientProfile;
  onOpenAssessment: () => void;
  onOpenDeviceCenter: () => void;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  caregiverBindingForm: CaregiverBindingFormState;
  onCaregiverBindingFormChange: (
    field: keyof CaregiverBindingFormState,
    value: string | boolean,
  ) => void;
  onBindCaregiver: (form: CaregiverBindingFormState) => Promise<void>;
  onRevokeCaregiver: (relation: CaregiverRelation) => Promise<void>;
  isBusy: boolean;
  isConsentBusy: boolean;
  isBindingCaregiver: boolean;
  isRevokingCaregiver: boolean;
}) {
  const consentState = summarizeConsents(patient);
  const canStartAssessment = Boolean(consentState.ai_processing);
  const canManageCaregiver = Boolean(consentState.caregiver_sharing);
  return (
    <GlassCard>
      <Badge label="授权状态" icon={ShieldCheck} />
      <div className="mt-5 grid gap-3">
        {[
          ["患者档案编号", shortId(patient.id)],
          ["负责医师", patient.responsibleDoctor?.user.displayName ?? "未绑定"],
          [
            "隐私协议",
            consentState.privacy_policy ? "已签署" : "待签署",
          ],
          [
            "AI处理授权",
            consentState.ai_processing ? "已签署" : "待签署",
          ],
          [
            "家属共享授权",
            consentState.caregiver_sharing ? "已签署" : "待签署",
          ],
          [
            "家属绑定",
            patient.caregiverRelations.length
              ? `${patient.caregiverRelations.length} 位`
              : "未绑定",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-2xl border border-[#c9e3e7] bg-white/75 p-4"
          >
            <span className="font-black">{label}</span>
            <Chip tone={value === "已签署" ? "success" : "warning"}>
              {value}
            </Chip>
          </div>
        ))}
      </div>
      {!canStartAssessment && (
        <PrimaryButton
          className="mt-5 w-full bg-[#b9e2d5] text-[#173945] hover:bg-white"
          disabled={isConsentBusy}
          onClick={() => void onGrantConsent("ai_processing")}
        >
          {isConsentBusy ? "正在签署授权" : "先签署 AI 数据处理授权"}
        </PrimaryButton>
      )}
      <PrimaryButton
        className={cn("w-full", canStartAssessment ? "mt-5" : "mt-3")}
        disabled={isBusy || !canStartAssessment}
        onClick={onOpenAssessment}
      >
        {isBusy
          ? "正在写入评估"
          : canStartAssessment
            ? "进入 AI 评估录入"
            : "签署 AI 授权后可评估"}
      </PrimaryButton>
      <PrimaryButton
        className="mt-3 w-full bg-[#173945] hover:bg-[#1f7a8c]"
        onClick={onOpenDeviceCenter}
      >
        进入设备与权限中心
      </PrimaryButton>
      <CaregiverBindingPanel
        patient={patient}
        form={caregiverBindingForm}
        onChange={onCaregiverBindingFormChange}
        onBindCaregiver={onBindCaregiver}
        onRevokeCaregiver={onRevokeCaregiver}
        canManageCaregiver={canManageCaregiver}
        isBinding={isBindingCaregiver}
        isRevoking={isRevokingCaregiver}
        onGrantCaregiverSharing={() => void onGrantConsent("caregiver_sharing")}
        isConsentBusy={isConsentBusy}
      />
    </GlassCard>
  );
}

function CaregiverBindingPanel({
  patient,
  form,
  onChange,
  onBindCaregiver,
  onRevokeCaregiver,
  canManageCaregiver,
  isBinding,
  isRevoking,
  onGrantCaregiverSharing,
  isConsentBusy,
}: {
  patient: PatientProfile;
  form: CaregiverBindingFormState;
  onChange: (
    field: keyof CaregiverBindingFormState,
    value: string | boolean,
  ) => void;
  onBindCaregiver: (form: CaregiverBindingFormState) => Promise<void>;
  onRevokeCaregiver: (relation: CaregiverRelation) => Promise<void>;
  canManageCaregiver: boolean;
  isBinding: boolean;
  isRevoking: boolean;
  onGrantCaregiverSharing: () => void;
  isConsentBusy: boolean;
}) {
  const canSubmit =
    canManageCaregiver &&
    form.caregiverAccount.trim().length >= 4 &&
    form.relation.trim().length > 0 &&
    form.summary;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBinding) return;
    void onBindCaregiver(form);
  }

  return (
    <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xl font-black">家属授权绑定</h4>
          <p className="mt-1 text-sm font-bold leading-6 text-[#526b74]">
            仅绑定已存在家属账号；绑定前必须签署当前版本家属共享授权。
          </p>
        </div>
        <Chip tone={canManageCaregiver ? "success" : "warning"}>
          {canManageCaregiver ? "共享授权已签署" : "待签共享授权"}
        </Chip>
      </div>
      {!canManageCaregiver && (
        <PrimaryButton
          className="mt-4 w-full bg-[#b9e2d5] text-base text-[#173945] hover:bg-white"
          disabled={isConsentBusy}
          onClick={onGrantCaregiverSharing}
        >
          {isConsentBusy ? "正在签署授权" : "先签署家属共享授权"}
        </PrimaryButton>
      )}
      <div className="mt-4 grid gap-3">
        {patient.caregiverRelations.length ? (
          patient.caregiverRelations.map((relation) => (
            <div
              key={relation.id}
              className="rounded-2xl border border-[#d7e8ec] bg-[#f8fcfb] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black">
                    {relation.caregiver.displayName} · {relation.relation}
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-[#6a8088]">
                    {relation.caregiver.account} · {formatDateTime(relation.authorizedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={() => void onRevokeCaregiver(relation)}
                  className="min-h-11 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRevoking ? "撤回中" : "撤回"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {caregiverScopeChips(relation.scope).map((item) => (
                  <Chip key={item} tone="info">
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-[#c9e3e7] bg-white/60 p-4 text-sm font-bold text-[#6a8088]">
            暂无家属绑定。完成绑定后，家属账号重新登录即可查看授权范围内摘要。
          </p>
        )}
      </div>
      <form onSubmit={submit} className="mt-4">
        <FieldLine
          label="家属登录账号"
          value={form.caregiverAccount}
          onChange={(value) => onChange("caregiverAccount", value)}
        />
        <FieldLine
          label="与患者关系"
          value={form.relation}
          onChange={(value) => onChange("relation", value)}
        />
        <div className="mt-4 grid gap-2">
          <CheckLine
            label="训练与计划摘要"
            checked={form.summary}
            disabled
            onChange={(value) => onChange("summary", value)}
          />
          <CheckLine
            label="每日提醒"
            checked={form.reminders}
            onChange={(value) => onChange("reminders", value)}
          />
          <CheckLine
            label="阶段进展"
            checked={form.progress}
            onChange={(value) => onChange("progress", value)}
          />
        </div>
        <PrimaryButton
          className="mt-4 w-full text-base"
          disabled={!canSubmit || isBinding}
          type="submit"
        >
          {isBinding
            ? "正在绑定家属"
            : canManageCaregiver
              ? "绑定家属账号"
              : "签署共享授权后可绑定"}
        </PrimaryButton>
      </form>
    </div>
  );
}

function ConsentChecklist({
  patient,
  onGrantConsent,
  onRevokeConsent,
  isBusy,
  isRevoking,
}: {
  patient: PatientProfile;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  isBusy: boolean;
  isRevoking: boolean;
}) {
  const consentState = summarizeConsents(patient);
  return (
    <GlassCard className="mt-5">
      <Badge label={`协议版本 ${consentVersion}`} icon={FileText} />
      <h3 className="mt-5 text-3xl font-black">知情同意逐项签署</h3>
      <p className="mt-3 font-bold leading-7 text-[#526b74]">
        每一项授权都会记录签署人、协议版本、签署时间和授权凭证，便于后续追溯。
      </p>
      <div className="mt-5 grid gap-3">
        {consentDefinitions.map((definition) => {
          const record = consentState[definition.type];
          const isCaregiverSharing = definition.type === "caregiver_sharing";
          return (
            <div
              key={definition.type}
              className="grid gap-4 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xl font-black">{definition.title}</h4>
                  <Chip tone={record ? "success" : "warning"}>
                    {record ? "已签署" : "待签署"}
                  </Chip>
                </div>
                <p className="mt-2 font-bold leading-7 text-[#526b74]">
                  {definition.description}
                </p>
                {isCaregiverSharing && (
                  <p className="mt-2 rounded-2xl border border-[#c9e3e7] bg-[#f8fcfb] px-4 py-3 text-sm font-black leading-6 text-[#526b74]">
                    {record
                      ? "家属共享授权已生效，已绑定家属可查看授权范围内摘要。"
                      : "家属共享授权未生效，家属端摘要与训练记录访问不可用。"}
                  </p>
                )}
                <p className="mt-2 font-mono text-xs font-bold text-[#6a8088]">
                  {record
                    ? `版本 ${record.consentVersion} · ${formatDateTime(
                        record.grantedAt,
                      )}`
                    : `待签署版本 ${consentVersion}`}
                </p>
              </div>
              {record ? (
                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={() => void onRevokeConsent(record)}
                  className="min-h-14 min-w-36 self-center rounded-2xl border border-rose-200 bg-rose-50 px-7 text-base font-black text-rose-700 shadow-lg shadow-rose-950/5 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRevoking ? "撤回中" : "撤回授权"}
                </button>
              ) : (
                <PrimaryButton
                  className="min-w-36 self-center text-base"
                  disabled={isBusy}
                  onClick={() => void onGrantConsent(definition.type)}
                >
                  {isBusy ? "签署中" : "签署"}
                </PrimaryButton>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function DevicePermissionCenterScreen({
  patient,
  readiness,
  onGrantConsent,
  onRevokeConsent,
  onCheckDevice,
  onCheckPose,
  isConsentBusy,
  isRevokingConsent,
  isCheckingDevice,
  isCheckingPose,
}: {
  patient?: PatientProfile;
  readiness: TrainingReadiness;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  onCheckDevice: () => Promise<void>;
  onCheckPose: () => Promise<void>;
  isConsentBusy: boolean;
  isRevokingConsent: boolean;
  isCheckingDevice: boolean;
  isCheckingPose: boolean;
}) {
  if (!patient) {
    return (
      <MissingDataCard
        title="等待患者设备上下文"
        message="请先登录患者账号，或由医师/管理员选择一个患者后再检查设备与权限。"
      />
    );
  }

  const consentState = summarizeConsents(patient);
  const cameraConsent = consentState.camera_capture;
  const microphoneConsent = consentState.microphone_capture;
  const cameraReady =
    readiness.cameraPermission === "granted" && Boolean(readiness.cameraDeviceId);
  const poseReady = readiness.poseRuntimeStatus === "ready";

  return (
    <ScreenGrid
      eyebrow="设备与权限"
      title="设备与权限中心"
      subtitle="训练前会分别校验知情同意、浏览器权限、摄像头设备和体感识别状态，确保采集条件完整。"
      aside={
        <DeviceReadinessSummary
          cameraConsent={Boolean(cameraConsent)}
          microphoneConsent={Boolean(microphoneConsent)}
          cameraReady={cameraReady}
          poseReady={poseReady}
        />
      }
    >
      <GlassCard>
        <Badge label="权限签署" icon={ShieldCheck} />
        <h3 className="mt-5 text-3xl font-black">采集授权状态</h3>
        <p className="mt-3 font-bold leading-7 text-[#526b74]">
          浏览器允许摄像头不等于平台知情同意。训练前，两者都必须完成，并写入审计与授权记录。
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <DeviceConsentCard
            title="摄像头体感采集"
            description="用于识别肢体关键点、动作轨迹、反应时间和动作准确率。"
            record={cameraConsent}
            consentType="camera_capture"
            onGrantConsent={onGrantConsent}
            onRevokeConsent={onRevokeConsent}
            isBusy={isConsentBusy}
            isRevoking={isRevokingConsent}
          />
          <DeviceConsentCard
            title="麦克风语音采集"
            description="用于后续语音评估、语音输入和训练鼓励反馈。"
            record={microphoneConsent}
            consentType="microphone_capture"
            onGrantConsent={onGrantConsent}
            onRevokeConsent={onRevokeConsent}
            isBusy={isConsentBusy}
            isRevoking={isRevokingConsent}
          />
        </div>
      </GlassCard>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <CameraCheck
          readiness={readiness}
          onCheckDevice={onCheckDevice}
          isChecking={isCheckingDevice}
        />
        <PoseCheckCard
          readiness={readiness}
          onCheckPose={onCheckPose}
          isChecking={isCheckingPose}
          cameraReady={cameraReady}
          hasCameraConsent={Boolean(cameraConsent)}
        />
      </div>
    </ScreenGrid>
  );
}

function DeviceConsentCard({
  title,
  description,
  record,
  consentType,
  onGrantConsent,
  onRevokeConsent,
  isBusy,
  isRevoking,
}: {
  title: string;
  description: string;
  record?: ConsentRecord;
  consentType: ConsentType;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  isBusy: boolean;
  isRevoking: boolean;
}) {
  return (
    <div className="rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xl font-black">{title}</h4>
        <Chip tone={record ? "success" : "warning"}>
          {record ? "已签署" : "待签署"}
        </Chip>
      </div>
      <p className="mt-3 font-bold leading-7 text-[#526b74]">{description}</p>
      <p className="mt-3 font-mono text-xs font-bold text-[#6a8088]">
        {record
          ? `版本 ${record.consentVersion} · ${formatDateTime(record.grantedAt)}`
          : `待签署版本 ${consentVersion}`}
      </p>
      {record ? (
        <button
          type="button"
          disabled={isRevoking}
          onClick={() => void onRevokeConsent(record)}
          className="mt-4 min-h-12 w-full rounded-2xl border border-rose-200 bg-rose-50 px-5 text-base font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRevoking ? "撤回中" : "撤回授权"}
        </button>
      ) : (
        <PrimaryButton
          className="mt-4 w-full text-base"
          disabled={isBusy}
          onClick={() => void onGrantConsent(consentType)}
        >
          {isBusy ? "签署中" : "签署授权"}
        </PrimaryButton>
      )}
    </div>
  );
}

function DeviceReadinessSummary({
  cameraConsent,
  microphoneConsent,
  cameraReady,
  poseReady,
}: {
  cameraConsent: boolean;
  microphoneConsent: boolean;
  cameraReady: boolean;
  poseReady: boolean;
}) {
  const readyCount = [cameraConsent, microphoneConsent, cameraReady, poseReady].filter(Boolean).length;
  return (
    <GlassCard>
      <Badge label="训练准备度" icon={MonitorCheck} />
      <h3 className="mt-5 text-3xl font-black">{readyCount}/4 项完成</h3>
      <StatusList
        items={[
          ["摄像头授权", cameraConsent ? "已签署" : "待签署", cameraConsent ? "success" : "warning"],
          ["麦克风授权", microphoneConsent ? "已签署" : "待签署", microphoneConsent ? "success" : "warning"],
          ["摄像头硬件", cameraReady ? "已识别" : "待检测", cameraReady ? "success" : "warning"],
          ["姿态识别", poseReady ? "已就绪" : "待检测", poseReady ? "success" : "warning"],
        ]}
      />
      <p className="mt-5 rounded-2xl border border-[#c9e3e7] bg-[#f8fcfb] p-4 font-bold leading-7 text-[#526b74]">
        后续训练只保存结构化关键点指标与质量摘要，不保存完整视频。
      </p>
    </GlassCard>
  );
}

function PoseCheckCard({
  readiness,
  onCheckPose,
  isChecking,
  cameraReady,
  hasCameraConsent,
}: {
  readiness: TrainingReadiness;
  onCheckPose: () => Promise<void>;
  isChecking: boolean;
  cameraReady: boolean;
  hasCameraConsent: boolean;
}) {
  const poseReady = readiness.poseRuntimeStatus === "ready";
  const blocked = !hasCameraConsent || !cameraReady;
  return (
    <GlassCard>
      <Badge label="体感姿态识别" icon={Radar} />
      <div className="mt-5 grid h-72 place-items-center overflow-hidden rounded-3xl border border-[#c9e3e7] bg-[#102d36]">
        <div className="relative h-48 w-56">
          <span className="absolute inset-x-0 top-1/2 h-px bg-cyan-200/25" />
          <span className="absolute left-1/2 top-2 h-11 w-11 -translate-x-1/2 rounded-full border-4 border-cyan-200 shadow-[0_0_30px_rgba(125,211,252,0.55)]" />
          <span className="absolute left-1/2 top-14 h-24 w-1 -translate-x-1/2 rounded-full bg-cyan-200" />
          <span className="absolute left-12 top-20 h-1 w-32 rotate-[-18deg] rounded-full bg-cyan-200" />
          <span className="absolute left-14 top-36 h-1 w-24 rotate-[-48deg] rounded-full bg-cyan-200" />
          <span className="absolute right-14 top-36 h-1 w-24 rotate-[48deg] rounded-full bg-cyan-200" />
          <span className="absolute bottom-0 left-0 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-cyan-100">
            {poseReady ? "识别就绪" : isChecking ? "检测中" : "待检测"}
          </span>
        </div>
      </div>
      <StatusList
        items={[
          [
            "运行状态",
            isChecking
              ? "加载中"
              : poseReady
                ? "已就绪"
                : readiness.poseRuntimeStatus === "error"
                  ? "检测失败"
                  : "未检测",
            poseReady ? "success" : isChecking ? "info" : "warning",
          ],
          [
            "识别服务",
            readiness.poseModelVersion ?? "未加载",
            readiness.poseModelVersion ? "success" : "warning",
          ],
          [
            "关键点数量",
            readiness.poseLandmarkCount
              ? `${readiness.poseLandmarkCount} 个`
              : "未识别",
            readiness.poseLandmarkCount ? "success" : "warning",
          ],
          [
            "平均置信度",
            readiness.poseAverageVisibility !== undefined
              ? `${Math.round(readiness.poseAverageVisibility * 100)}%`
              : "未识别",
            readiness.poseAverageVisibility !== undefined ? "success" : "warning",
          ],
        ]}
      />
      {readiness.poseError ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 font-bold leading-7 text-rose-700">
          {readiness.poseError}
        </p>
      ) : null}
      <PrimaryButton
        className="mt-5 w-full bg-[#173945] hover:bg-[#1f7a8c]"
        disabled={blocked || isChecking}
        onClick={() => void onCheckPose()}
      >
        {isChecking
          ? "正在检测姿态"
          : blocked
            ? "先完成摄像头授权与检测"
            : "检测体感识别状态"}
      </PrimaryButton>
    </GlassCard>
  );
}

function AssessmentScreen({
  assessments,
  onCreateAssessment,
  assessmentForm,
  onAssessmentFormChange,
  isBusy,
}: {
  assessments?: AssessmentRecord[];
  onCreateAssessment: (form: AssessmentFormState) => Promise<void>;
  assessmentForm: AssessmentFormState;
  onAssessmentFormChange: (
    field: keyof AssessmentFormState,
    value: string,
  ) => void;
  isBusy: boolean;
}) {
  const assessment = assessments?.[0];
  const scoreSummary = assessment?.scoreSummary ?? {};
  const transcript = readString(
    assessment?.rawInputSummary?.transcript,
    "等待 AI 评估转写结果",
  );

  return (
    <ScreenGrid
      eyebrow="AI 认知评估"
      title="AI 语音认知评估"
      subtitle="语音转文字、MMSE/CDR 进度、识别置信度和 AI 对话留存。"
      aside={<RecognitionPanel assessment={assessment} />}
    >
      <GlassCard>
        <div className="rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge label="评估状态" icon={Brain} />
            <Chip tone={assessment ? "success" : "warning"}>
              {assessment ? "已完成评估" : "待提交评估"}
            </Chip>
          </div>
          <p className="mt-3 font-bold leading-7 text-[#526b74]">
            {assessment
              ? `最近一次评估完成于 ${formatDateTime(assessment.createdAt)}。`
              : "请根据本轮问答录入 MMSE/CDR、语音转写和 AI 分析摘要，提交后系统生成风险评级。"}
          </p>
        </div>
        <Badge label="当前题目：时间定向力" icon={Brain} className="mt-6" />
        <h3 className="mt-8 text-4xl font-black md:text-5xl">
          请告诉我，今天是星期几？
        </h3>
        <p className="mt-4 text-xl font-bold text-[#526b74]">
          您可以直接说出来，系统会自动转成文字。
        </p>
        <div className="mt-10 grid gap-5 rounded-3xl border border-[#c9e3e7] bg-white/75 p-6 md:grid-cols-[220px_1fr]">
          <Waveform />
          <div>
            <h4 className="text-2xl font-black">正在听您回答</h4>
            <p className="mt-3 text-lg font-bold text-[#526b74]">
              语音转文字：{transcript}
            </p>
            <p className="mt-2 font-mono text-sm font-bold text-[#6a8088]">
              MMSE {clinicalScoreLabel(scoreSummary.mmse, "/30")} · CDR{" "}
              {clinicalScoreLabel(scoreSummary.cdr)}
            </p>
            <PrimaryButton
              className="mt-5"
              disabled={isBusy || !isAssessmentFormComplete(assessmentForm)}
              onClick={() => void onCreateAssessment(assessmentForm)}
            >
              {isBusy
                ? "正在保存评估"
                : isAssessmentFormComplete(assessmentForm)
                  ? "完成本轮评估并生成评级"
                  : "填写评估数据后可提交"}
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
      <AssessmentInputPanel
        form={assessmentForm}
        onChange={onAssessmentFormChange}
      />
    </ScreenGrid>
  );
}

function RecognitionPanel({
  assessment,
}: {
  assessment?: AssessmentRecord;
}) {
  const analysis = assessment?.aiAnalyses?.[0];
  return (
    <GlassCard>
      <Badge label="实时识别状态" icon={AudioWaveform} />
      <StatusList
        items={[
          ["评估类型", assessment?.assessmentType ?? "等待评估", "info"],
          [
            "评估来源",
            analysis?.modelVersion ?? "等待 AI 分析",
            analysis ? "success" : "warning",
          ],
          [
            "AI 置信度",
            analysis ? `${Math.round(analysis.confidence * 100)}%` : "待生成",
            analysis ? "success" : "warning",
          ],
        ]}
      />
      <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
        <h4 className="font-black">AI 对话记录</h4>
        <p className="mt-3 text-sm font-bold leading-7 text-[#526b74]">
          {readString(
            assessment?.rawInputSummary?.transcript,
            "登录并完成评估后，系统会在这里展示结构化转写摘要。",
          )}
        </p>
      </div>
    </GlassCard>
  );
}

function AssessmentInputPanel({
  form,
  onChange,
}: {
  form: AssessmentFormState;
  onChange: (field: keyof AssessmentFormState, value: string) => void;
}) {
  return (
    <GlassCard className="mt-5">
        <Badge label="评估结果录入" icon={ClipboardCheck} />
      <p className="mt-3 font-bold leading-7 text-[#526b74]">
        这里录入实际 MMSE/CDR、语音转写和 AI 分析摘要。未填写完整时不会写入评估记录。
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <FieldLine
          label="MMSE（0-30）"
          value={form.mmse}
          onChange={(value) => onChange("mmse", value)}
          type="number"
        />
        <FieldLine
          label="CDR（0-3）"
          value={form.cdr}
          onChange={(value) => onChange("cdr", value)}
          type="number"
        />
        <FieldLine
          label="AI置信度（0-1）"
          value={form.confidence}
          onChange={(value) => onChange("confidence", value)}
          type="number"
        />
        <FieldLine
          label="记忆力（0-100）"
          value={form.memory}
          onChange={(value) => onChange("memory", value)}
          type="number"
        />
        <FieldLine
          label="定向力（0-100）"
          value={form.orientation}
          onChange={(value) => onChange("orientation", value)}
          type="number"
        />
        <FieldLine
          label="执行力（0-100）"
          value={form.executive}
          onChange={(value) => onChange("executive", value)}
          type="number"
        />
        <FieldLine
          label="语言表达（0-100）"
          value={form.language}
          onChange={(value) => onChange("language", value)}
          type="number"
        />
        <FieldLine
          label="反应延迟（秒）"
          value={form.reactionDelaySeconds}
          onChange={(value) => onChange("reactionDelaySeconds", value)}
          type="number"
        />
        <FieldLine
          label="模型版本"
          value={form.modelVersion}
          onChange={(value) => onChange("modelVersion", value)}
        />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextAreaField
          label="语音转写/评估摘要"
          value={form.transcript}
          onChange={(value) => onChange("transcript", value)}
        />
        <TextAreaField
          label="AI 分析摘要"
          value={form.analysisSummary}
          onChange={(value) => onChange("analysisSummary", value)}
        />
      </div>
    </GlassCard>
  );
}

function MatchScreen({
  patient,
  pendingPlan,
  onRecommendPlan,
  isBusy,
}: {
  patient?: PatientProfile;
  pendingPlan?: RehabPlan | null;
  onRecommendPlan: () => Promise<void>;
  isBusy: boolean;
}) {
  const risk = resolveCurrentRisk(patient);
  const assessment = patient?.assessments?.[0];
  const scoreSummary = assessment?.scoreSummary ?? {};
  const aiAnalysis = assessment?.aiAnalyses?.[0];
  const displayPlan = pendingPlan ?? resolveConfirmedCurrentPlan(patient);
  const readiness = buildPlanPrerequisiteState(patient, pendingPlan);
  const currentTrainingState = summarizeTrainingContentReadiness(displayPlan);

  return (
    <ScreenGrid
      eyebrow="智能方案匹配"
      title="评估结果与智能方案匹配"
      subtitle="系统根据评估结果、训练目标和内容标签生成推荐方案，医师确认后下发给患者。"
      aside={
        <PlanRecommendation
          plan={displayPlan}
          pendingPlan={pendingPlan}
          onRecommendPlan={onRecommendPlan}
          isBusy={isBusy}
          readiness={readiness}
        />
      }
    >
      <GlassCard>
        <Badge label={aiAnalysis?.modelVersion ?? "AI 分析待生成"} icon={Sparkles} />
        <h3 className="mt-5 text-4xl font-black text-[#9d4747]">
          当前认知评级：{riskLabel(risk?.riskLevel)}
        </h3>
        <p className="mt-4 text-lg font-bold leading-8 text-[#526b74]">
          {risk?.reasonSummary ?? "等待 AI 评估生成风险说明。"}
        </p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <MetricCard
            value={clinicalScoreLabel(scoreSummary.mmse)}
            label="MMSE"
            icon={Brain}
          />
          <MetricCard
            value={clinicalScoreLabel(scoreSummary.cdr)}
            label="CDR"
            icon={FileText}
          />
          <MetricCard
            value={aiAnalysis ? `${Math.round(aiAnalysis.confidence * 100)}%` : "待生成"}
            label="AI置信"
            icon={Radar}
          />
        </div>
        <CapabilityBars scoreSummary={scoreSummary} />
      </GlassCard>
      <GlassCard>
        <Badge label="生成前置条件" icon={ClipboardCheck} />
        <h3 className="mt-4 text-2xl font-black">正式建档后的引导闭环</h3>
        <p className="mt-2 font-bold leading-7 text-[#526b74]">
          系统只在关键条件齐备后触发推荐方案生成；缺失项会指向下一步处理，不使用空值或默认值替代。
        </p>
        <StatusList items={readiness.items} />
        <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-white/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-black text-[#16333d]">
              {planPrerequisiteLabels.releasedTraining}
            </span>
            <Chip tone={currentTrainingState.tone}>{currentTrainingState.label}</Chip>
          </div>
          <p className="mt-3 font-bold leading-7 text-[#526b74]">
            {currentTrainingState.description}
          </p>
        </div>
      </GlassCard>
    </ScreenGrid>
  );
}

function PlanRecommendation({
  plan,
  pendingPlan,
  onRecommendPlan,
  isBusy,
  readiness,
}: {
  plan?: RehabPlan | null;
  pendingPlan?: RehabPlan | null;
  onRecommendPlan: () => Promise<void>;
  isBusy: boolean;
  readiness: PlanPrerequisiteState;
}) {
  const blockingMessages = readiness.items
    .filter(([, , tone]) => tone === "warning" || tone === "danger")
    .map(([label, value]) => `${label}：${value}`);

  return (
    <GlassCard>
      <Badge label="推荐游戏" icon={WandSparkles} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone={pendingPlan ? "warning" : plan ? "success" : "muted"}>
          {pendingPlan
            ? "待医师确认"
            : plan
              ? plan.status === "active"
                ? "当前生效方案"
                : plan.status
              : "等待生成"}
        </Chip>
        {plan?.recommendationReason && <Chip tone="info">可解释推荐</Chip>}
      </div>
      <div className="mt-5 grid gap-3">
        {plan?.items?.length ? (
          plan.items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-3xl border border-[#c9e3e7] bg-white/75 p-5"
            >
              <Chip>推荐 {index + 1}</Chip>
              <h4 className="mt-3 text-xl font-black">
                {item.gameContent.name}
              </h4>
              <p className="mt-2 font-bold leading-7 text-[#526b74]">
                每次 {item.durationMinutes} 分钟，每周 {item.frequencyPerWeek} 次，
                难度 {item.difficulty}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-3xl border border-[#c9e3e7] bg-white/75 p-5 font-bold text-[#526b74]">
            暂无推荐计划，请先完成 AI 评估并生成康复方案。
          </p>
        )}
      </div>
      <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-[#e9f8f6]/80 p-5">
        <h4 className="font-black text-[#16333d]">生成推荐方案前置状态</h4>
        <StatusList items={readiness.items} />
        {!readiness.canRecommend && (
          <p className="mt-4 font-bold leading-7 text-[#9d4747]">
            暂不能生成推荐方案：{blockingMessages.join("；")}。
          </p>
        )}
      </div>
      {plan?.recommendationReason && (
        <p className="mt-4 rounded-3xl bg-[#e9f8f6] p-4 text-sm font-bold leading-6 text-[#526b74]">
          {plan.recommendationReason}
        </p>
      )}
      <PrimaryButton
        className="mt-5 w-full"
        disabled={!readiness.canRecommend || isBusy}
        onClick={() => void onRecommendPlan()}
      >
        {isBusy
          ? "正在生成方案"
          : readiness.canRecommend
            ? "生成推荐康复方案"
            : "前置条件未满足"}
      </PrimaryButton>
    </GlassCard>
  );
}

function TodayScreen({
  patient,
  caregiverSummary,
  todayTrainingRecords,
  onEnterTrainingPrep,
  nextPlanItem,
}: {
  patient?: PatientProfile;
  caregiverSummary?: CaregiverSummaryResponse;
  todayTrainingRecords?: TrainingRecordsResponse;
  onEnterTrainingPrep: () => void;
  nextPlanItem?: RehabPlan["items"][number];
}) {
  const displayName = patient?.name ?? caregiverSummary?.patient.name ?? "用户";
  const currentPlan =
    resolveConfirmedCurrentPlan(patient) ?? caregiverSummary?.currentPlan ?? undefined;
  const completed = todayTrainingRecords?.summary.completedSessions ?? 0;
  const totalTasks = currentPlan?.items.length ?? 0;
  const progress = totalTasks ? Math.min(100, Math.round((completed / totalTasks) * 100)) : 0;
  const hasCompletedTraining = completed > 0;
  const averageScore = todayTrainingRecords?.summary.averageScore;
  const hasCurrentPlan = Boolean(currentPlan);

  return (
    <ScreenGrid
      eyebrow="患者训练"
      title="今日训练"
      subtitle="根据当前康复方案展示今日待完成训练，训练结果将回传给医师与运营管理端。"
      aside={<TaskList plan={currentPlan} todayTrainingRecords={todayTrainingRecords} />}
    >
      <GlassCard>
        <h3 className="text-5xl font-black">早上好，{displayName}</h3>
        <p className="mt-4 text-xl font-bold text-[#526b74]">
          {currentPlan
            ? `今日处方训练 ${currentPlan.dailyDuration} 分钟，请按顺序完成下方训练项目。`
            : "暂无今日训练任务，请等待医师确认康复方案。"}
        </p>
        {hasCurrentPlan ? (
          <div className="mt-12 grid items-center gap-10 md:grid-cols-[230px_1fr]">
            <Ring value={`${progress}%`} />
            <div>
              <h4 className="text-4xl font-black">
                今日 {totalTasks} 项训练
              </h4>
              <p className="mt-3 text-lg font-bold text-[#526b74]">
                已完成 {completed} 项
                {hasCompletedTraining
                  ? `，${
                      typeof averageScore === "number"
                        ? `平均得分 ${averageScore}`
                        : "平均分待生成"
                    }。`
                  : "，暂无今日成绩。"}
              </p>
              <PrimaryButton
                className="mt-6"
                disabled={!nextPlanItem || !patient}
                onClick={onEnterTrainingPrep}
              >
                {nextPlanItem
                  ? `准备 ${nextPlanItem.gameContent.name}`
                  : "今日训练已完成"}
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-dashed border-[#c9e3e7] bg-white/70 p-8">
            <h4 className="text-3xl font-black text-[#173945]">
              暂无今日训练任务
            </h4>
            <p className="mt-3 text-lg font-bold leading-8 text-[#526b74]">
              医师确认康复方案后，这里会展示今日训练项目、时长和完成进度。
            </p>
          </div>
        )}
      </GlassCard>
    </ScreenGrid>
  );
}

function TaskList({
  plan,
  todayTrainingRecords,
}: {
  plan?: RehabPlan;
  todayTrainingRecords?: TrainingRecordsResponse;
}) {
  const completedPlanItemIds = new Set(
    todayTrainingRecords?.sessions
      .filter(isCompletedTrainingSession)
      .map((session) => session.planItemId),
  );
  const items = plan?.items ?? [];
  const nextPendingItemId = items.find(
    (item) => !completedPlanItemIds.has(item.id),
  )?.id;

  return (
    <div className="grid gap-4">
      {items.length ? (
        items.map((item) => {
          const done = completedPlanItemIds.has(item.id);
          const isNext = item.id === nextPendingItemId;
          return (
            <GlassCard
              key={item.id}
              className={cn(isNext && "border-[#63bfd0]")}
            >
              <Chip tone={done ? "success" : isNext ? "info" : "muted"}>
                {done ? "已完成" : isNext ? "下一项" : "未开始"}
              </Chip>
              <h4 className="mt-4 text-2xl font-black">
                {item.gameContent.name}
              </h4>
              <p className="mt-2 font-bold text-[#526b74]">
                {item.durationMinutes} 分钟 · {trainingTagsLabel(item.gameContent.tags)}
              </p>
            </GlassCard>
          );
        })
      ) : (
        <GlassCard>
          <Chip tone="warning">暂无计划</Chip>
          <h4 className="mt-4 text-2xl font-black">等待医师确认康复方案</h4>
          <p className="mt-2 font-bold text-[#526b74]">
            登录成功并生成计划后，这里会展示每日训练项目。
          </p>
        </GlassCard>
      )}
    </div>
  );
}

function PrepScreen({
  planItem,
  onStartTraining,
  onCheckDevice,
  onCheckPose,
  readiness,
  isBusy,
  hasCameraConsent,
}: {
  planItem?: RehabPlan["items"][number];
  onStartTraining: () => Promise<void>;
  onCheckDevice: () => Promise<void>;
  onCheckPose: () => Promise<void>;
  readiness: TrainingReadiness;
  isBusy: boolean;
  hasCameraConsent: boolean;
}) {
  const gameReady = planItem ? isGameReadyForTraining(planItem.gameContent) : false;
  const deviceReady =
    readiness.cameraPermission === "granted" && Boolean(readiness.cameraDeviceId);
  const poseReady = readiness.poseRuntimeStatus === "ready";
  const canStart = Boolean(planItem) && gameReady && deviceReady && poseReady && !isBusy;
  const game = planItem?.gameContent;
  const isBrowserPoseGame = game?.runtimeType === "browser_pose_game";

  return (
    <ScreenGrid
      eyebrow="体感训练准备"
      title="体感训练准备"
      subtitle="平台账号已绑定，开始前必须完成摄像头授权、设备识别、体感姿态识别和训练内容状态检查。"
      aside={
        <div className="grid gap-5">
          <CameraCheck readiness={readiness} onCheckDevice={onCheckDevice} />
          <PoseCheckCard
            readiness={readiness}
            onCheckPose={onCheckPose}
            isChecking={readiness.poseRuntimeStatus === "loading"}
            cameraReady={deviceReady}
            hasCameraConsent={hasCameraConsent}
          />
        </div>
      }
    >
      <GlassCard>
        <Badge label={planItem?.gameContent.name ?? "等待训练项目"} icon={Gamepad2} />
        <h3 className="mt-6 text-4xl font-black">
          {planItem
            ? trainingTargetsLabel(planItem.gameContent.trainingTargets)
            : "等待训练项目安排"}
        </h3>
        <p className="mt-4 text-lg font-bold leading-8 text-[#526b74]">
          {planItem
            ? "跟随屏幕节奏挥动双手，系统记录肢体轨迹、反应时间和动作准确率。"
            : "医师确认康复方案后，这里会展示训练目标和开始条件。"}
        </p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <MetricCard
            value={planItem ? `${planItem.durationMinutes}分钟` : "待安排"}
            label="预计时长"
            icon={Activity}
          />
          <MetricCard value={planItem?.difficulty ?? "待定"} label="初始难度" icon={HeartPulse} />
          <MetricCard
            value={game?.gameVersion ?? "未配置"}
            label="训练版本"
            icon={Radar}
          />
        </div>
        <div className="mt-6 grid gap-3 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
          <StatusList
            items={[
              [
                "训练内容状态",
                gameReady
                  ? "已发布"
                  : game
                    ? gameBuildStatusLabel(game.buildStatus)
                    : "未选择项目",
                gameReady ? "success" : "danger",
              ],
              [
                "训练资源",
                isBrowserPoseGame
                  ? "平台内置资源"
                  : game?.manifestUrl
                    ? "已配置"
                    : "缺失",
                isBrowserPoseGame || game?.manifestUrl ? "success" : "danger",
              ],
              [
                "结果回传状态",
                game?.bridgeProtocolVersion ?? "未配置",
                game?.bridgeProtocolVersion === "1.0.0"
                  ? "success"
                  : "danger",
              ],
              [
                "摄像头设备",
                deviceReady ? "已授权识别" : "待检测",
                deviceReady ? "success" : "warning",
              ],
              [
                "姿态识别",
                poseReady ? "已就绪" : "待检测",
                poseReady ? "success" : "warning",
              ],
            ]}
          />
        </div>
        <div className="mt-6 rounded-3xl bg-[#e9f8f6] p-6">
          <h4 className="text-2xl font-black">请站在摄像头前 1.5 米处</h4>
          <p className="mt-2 font-bold text-[#526b74]">
            保持上半身入镜，双脚站稳，旁边留出安全空间。设备检测通过后才会创建训练记录。
          </p>
        </div>
        <PrimaryButton
          className="mt-6 w-full"
          disabled={!canStart}
          onClick={() => void onStartTraining()}
        >
          {isBusy ? "正在创建训练" : "检查完成，开始训练"}
        </PrimaryButton>
        {!canStart ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-bold leading-7 text-amber-800">
            训练记录不会在训练内容、摄像头或体感识别未就绪时创建。请先完成摄像头检测、体感识别检测，并确认训练内容已发布。
          </p>
        ) : null}
      </GlassCard>
    </ScreenGrid>
  );
}

function CameraCheck({
  readiness,
  onCheckDevice,
  isChecking: isCheckingOverride,
}: {
  readiness: TrainingReadiness;
  onCheckDevice: () => Promise<void>;
  isChecking?: boolean;
}) {
  const isChecking = isCheckingOverride ?? readiness.cameraPermission === "requesting";
  const isGranted = readiness.cameraPermission === "granted";

  return (
    <GlassCard>
      <Badge label="设备检测" icon={Camera} />
      <div className="mt-5 grid h-72 place-items-center rounded-3xl border border-[#c9e3e7] bg-[linear-gradient(rgba(22,51,61,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(22,51,61,0.06)_1px,transparent_1px)] bg-[size:28px_28px]">
        <div className="relative h-48 w-40">
          <span className="absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 rounded-full bg-[#2a8aa0]" />
          <span className="absolute left-1/2 top-14 h-28 w-3 -translate-x-1/2 rounded-full bg-[#2a8aa0]" />
          <span className="absolute left-3 top-20 h-3 w-32 rotate-[-20deg] rounded-full bg-[#2a8aa0]" />
          <span className="absolute left-5 top-36 h-3 w-24 rotate-[-55deg] rounded-full bg-[#2a8aa0]" />
          <span className="absolute right-5 top-36 h-3 w-24 rotate-[55deg] rounded-full bg-[#2a8aa0]" />
        </div>
      </div>
      <StatusList
        items={[
          [
            "摄像头权限",
            isChecking ? "请求中" : isGranted ? "已授权" : "未授权",
            isGranted ? "success" : isChecking ? "info" : "warning",
          ],
          [
            "摄像头设备",
            readiness.cameraDeviceId ? "已识别" : "未识别",
            readiness.cameraDeviceId ? "success" : "warning",
          ],
          [
            "检测时间",
            readiness.checkedAt ? formatDateTime(readiness.checkedAt) : "未检测",
            readiness.checkedAt ? "success" : "warning",
          ],
        ]}
      />
      {readiness.error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 font-bold leading-7 text-rose-700">
          {readiness.error}
        </p>
      ) : null}
      <PrimaryButton
        className="mt-5 w-full bg-[#173945] hover:bg-[#1f7a8c]"
        disabled={isChecking}
        onClick={() => void onCheckDevice()}
      >
        {isChecking ? "正在请求摄像头" : "检测摄像头设备"}
      </PrimaryButton>
    </GlassCard>
  );
}

function UnityGameContainer({
  game,
  trainingSession,
}: {
  game: RehabPlan["items"][number]["gameContent"];
  trainingSession: TrainingSession;
}) {
  const [manifestState, setManifestState] = useState<UnityManifestState>({
    state: "idle",
    message: "等待加载训练资源",
  });
  const [runtimeState, setRuntimeState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  useEffect(() => {
    let cancelled = false;
    let unityInstance: { Quit?: () => Promise<void> } | null = null;

    async function loadUnity() {
      if (!isGameReadyForTraining(game)) {
        setManifestState({
          state: "error",
          message:
            "该训练内容尚未配置已发布资源，不能加载。",
        });
        setRuntimeState("error");
        return;
      }

      const manifestUrl = game.manifestUrl;
      if (!manifestUrl) {
        setManifestState({
          state: "error",
          message: "缺少训练资源地址。",
        });
        setRuntimeState("error");
        return;
      }

      setManifestState({ state: "loading", message: "正在读取训练资源" });
      setRuntimeState("loading");

      try {
        const manifest = await fetchUnityManifest(manifestUrl);
        validateUnityManifest(manifest, game);
        if (cancelled) return;
        setManifestState({
          state: "ready",
          message: "训练资源校验通过",
          manifest,
        });
        window.RehabTrainingRuntimeConfig = {
          type: "training_config",
          action: "training_config",
          protocolVersion: game.bridgeProtocolVersion,
          sessionId: trainingSession.id,
          gameRunId: trainingSession.gameRunId,
          gameCode: game.code,
          gameVersion: manifest.gameVersion,
          planItemId: trainingSession.planItemId,
          patientId: trainingSession.patientId,
          deviceCode: trainingSession.deviceCode,
          requiredMetrics: game.requiredMetrics,
          generatedAt: new Date().toISOString(),
        };

        await loadScriptOnce(manifest.build.loaderUrl);
        if (cancelled) return;

        const createUnityInstance = readUnityLoader();
        const canvas = document.getElementById(
          unityCanvasId(trainingSession.id),
        ) as HTMLCanvasElement | null;
        if (!canvas) {
          throw new Error("Unity canvas 未找到。");
        }

        unityInstance = await createUnityInstance(canvas, {
          dataUrl: manifest.build.dataUrl,
          frameworkUrl: manifest.build.frameworkUrl,
          codeUrl: manifest.build.codeUrl,
          streamingAssetsUrl: manifest.build.streamingAssetsUrl ?? "",
          companyName: "Rehab Platform",
          productName: game.name,
          productVersion: manifest.gameVersion,
        });

        if (cancelled) return;
        setRuntimeState("ready");
      } catch (error) {
        if (cancelled) return;
        setManifestState({
          state: "error",
          message: error instanceof Error ? error.message : "Unity 加载失败",
        });
        setRuntimeState("error");
      }
    }

    void loadUnity();

    return () => {
      cancelled = true;
      if (unityInstance?.Quit) {
        void unityInstance.Quit();
      }
      if (window.RehabTrainingRuntimeConfig?.sessionId === trainingSession.id) {
        delete window.RehabTrainingRuntimeConfig;
      }
    };
  }, [game, trainingSession]);

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-white/20 bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-white/10 px-5 py-4">
        <div>
          <p className="text-xs font-black uppercase text-[#b9e2d5]">
            训练资源加载中
          </p>
          <p className="mt-1 text-xs font-bold text-white/70">
            {game.manifestUrl ? "训练资源已配置" : "训练资源未配置"}
          </p>
        </div>
        <Chip tone={runtimeState === "ready" ? "success" : runtimeState === "error" ? "danger" : "warning"}>
          {runtimeState === "ready"
            ? "运行中"
            : runtimeState === "error"
              ? "加载失败"
              : "加载中"}
        </Chip>
      </div>
      <div className="relative aspect-video min-h-[420px] bg-[#071b22]">
        <canvas
          id={unityCanvasId(trainingSession.id)}
          className="h-full w-full bg-[#071b22]"
        />
        {runtimeState !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_35%,rgba(185,226,213,0.18),transparent_45%),linear-gradient(135deg,rgba(18,53,65,0.94),rgba(7,27,34,0.98))] p-8 text-center">
            <div className="max-w-xl rounded-[28px] border border-white/15 bg-white/10 p-7 shadow-2xl">
              <Badge label="加载状态" icon={MonitorCheck} />
              <h4 className="mt-5 text-3xl font-black">
                {manifestState.state === "error"
                  ? "训练资源未就绪"
                  : "正在加载训练资源"}
              </h4>
              <p className="mt-3 font-bold leading-7 text-white/75">
                {manifestState.message}
              </p>
              <p className="mt-4 text-xs font-bold text-white/55">
                训练记录已创建，结果将在完成后回传。
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BrowserPoseGameContainer({
  game,
  trainingSession,
  onResultReady,
}: {
  game: RehabPlan["items"][number]["gameContent"];
  trainingSession: TrainingSession;
  onResultReady: (payload: SubmitTrainingResultRequest) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runtimeRef = useRef<PoseTrainingRuntime | null>(null);
  const animationRef = useRef<number | null>(null);
  const resultSubmittedRef = useRef(false);
  const mountedRef = useRef(false);
  const runTokenRef = useRef(0);
  const statsRef = useRef<BrowserPoseGameStats | null>(null);
  const [snapshot, setSnapshot] = useState<BrowserPoseGameSnapshot>({
    phase: "idle",
    message: "等待开始体感采集",
    elapsedSeconds: 0,
    sampleCount: 0,
    validFrameCount: 0,
    averageVisibility: 0,
    hits: 0,
    misses: 0,
    motionAccuracy: 0,
    qualityReasons: [],
  });

  const targetDurationSeconds = resolveBrowserPoseTargetDurationSeconds(game);
  const isRunning = snapshot.phase === "loading" || snapshot.phase === "running";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runTokenRef.current += 1;
      stopBrowserPoseRuntime(runtimeRef, animationRef);
    };
  }, []);

  async function startGame() {
    if (!videoRef.current || isRunning) return;
    if (!isBrowserPoseGameReady(game)) {
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: "该训练内容尚未发布，不能采集结果。",
      }));
      return;
    }

    stopBrowserPoseRuntime(runtimeRef, animationRef);
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;
    resultSubmittedRef.current = false;
    statsRef.current = createInitialBrowserPoseStats(targetDurationSeconds);
    setSnapshot({
      phase: "loading",
      message: "正在打开摄像头并加载体感识别服务",
      elapsedSeconds: 0,
      sampleCount: 0,
      validFrameCount: 0,
      averageVisibility: 0,
      hits: 0,
      misses: 0,
      motionAccuracy: 0,
      qualityReasons: [],
    });

    try {
      const runtime = await createPoseTrainingRuntime({
        videoElement: videoRef.current,
        deviceId: trainingSession.deviceCode ?? undefined,
      });
      if (!mountedRef.current || runTokenRef.current !== runToken) {
        runtime.stop();
        return;
      }
      runtimeRef.current = runtime;
      setSnapshot((current) => ({
        ...current,
        phase: "running",
        message: "采集中，请按屏幕提示用左右手触达光标",
      }));
      animationRef.current = window.requestAnimationFrame((timestampMs) =>
        tickBrowserPoseGame(timestampMs),
      );
    } catch (error) {
      stopBrowserPoseRuntime(runtimeRef, animationRef);
      if (!mountedRef.current || runTokenRef.current !== runToken) return;
      setSnapshot((current) => ({
        ...current,
        phase: "error",
        message: error instanceof Error ? error.message : "浏览器体感采集启动失败",
      }));
    }
  }

  function tickBrowserPoseGame(timestampMs: number) {
    const runtime = runtimeRef.current;
    const stats = statsRef.current;
    if (!runtime || !stats) return;

    const landmarks = runtime.detect(timestampMs);
    updateBrowserPoseStats(stats, landmarks, timestampMs);
    const nextSnapshot = buildBrowserPoseSnapshot(stats, "running", "采集中，请按屏幕提示用左右手触达光标");
    const isFinished = nextSnapshot.elapsedSeconds >= stats.targetDurationSeconds;

    if (isFinished) {
      finishGame(timestampMs);
      return;
    }

    if (timestampMs - stats.lastSnapshotAtMs >= 250) {
      stats.lastSnapshotAtMs = timestampMs;
      setSnapshot(nextSnapshot);
    }
    animationRef.current = window.requestAnimationFrame((nextTimestampMs) =>
      tickBrowserPoseGame(nextTimestampMs),
    );
  }

  function finishGame(completedAtMs: number) {
    const stats = statsRef.current;
    if (!stats || resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    expireCurrentTarget(stats, completedAtMs);
    const qualityReasons = resolveBrowserPoseQualityReasons(stats, completedAtMs);
    if (qualityReasons.length) {
      setSnapshot(
        buildBrowserPoseSnapshot(
          { ...stats, qualityReasons },
          "error",
          `采集质量不足：${qualityReasons.join("；")}`,
        ),
      );
      stopBrowserPoseRuntime(runtimeRef, animationRef);
      return;
    }

    try {
      const payload = buildBrowserPoseTrainingResultPayload({
        stats,
        game,
        trainingSession,
        completedAtMs,
      });
      onResultReady(payload);
      setSnapshot({
        ...buildBrowserPoseSnapshot(stats, "completed", "体感训练结果已生成，请提交本次结果"),
        resultGeneratedAt: String(payload.metricsSummary.clientGeneratedAt),
      });
      stopBrowserPoseRuntime(runtimeRef, animationRef);
    } catch (error) {
      setSnapshot(
        buildBrowserPoseSnapshot(
          stats,
          "error",
          error instanceof Error ? error.message : "训练结果生成失败",
        ),
      );
    }
  }

  function stopGame() {
    runTokenRef.current += 1;
    stopBrowserPoseRuntime(runtimeRef, animationRef);
    statsRef.current = null;
    setSnapshot((current) => ({
      ...current,
      phase: "idle",
      message: "采集已停止，未生成训练结果",
      target: undefined,
    }));
  }

  const progress = Math.min(
    100,
    Math.round((snapshot.elapsedSeconds / targetDurationSeconds) * 100),
  );
  const activeTarget = snapshot.target;

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-white/20 bg-[#071b22]/80">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-white/10 px-5 py-4">
        <div>
          <p className="text-xs font-black uppercase text-[#b9e2d5]">
            浏览器体感训练
          </p>
          <p className="mt-1 font-mono text-xs text-white/70">
            训练内容已加载 · {game.gameVersion ?? "版本未配置"}
          </p>
        </div>
        <Chip tone={snapshot.phase === "completed" ? "success" : snapshot.phase === "error" ? "danger" : snapshot.phase === "running" ? "info" : "warning"}>
          {browserPosePhaseLabel(snapshot.phase)}
        </Chip>
      </div>
      <div className="relative aspect-video min-h-[420px] overflow-hidden bg-[#061820]">
        <video
          ref={videoRef}
          className="h-full w-full scale-x-[-1] object-cover opacity-70"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(151,213,199,0.22),transparent_36%),linear-gradient(180deg,rgba(7,27,34,0),rgba(7,27,34,0.45))]" />
        <div className="pointer-events-none absolute inset-5 rounded-[28px] border border-cyan-100/20" />
        {activeTarget ? (
          <div
            className={cn(
              "pointer-events-none absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 shadow-[0_0_34px_rgba(185,226,213,0.68)]",
              activeTarget.side === "left"
                ? "border-cyan-100 bg-cyan-200/20"
                : "border-emerald-100 bg-emerald-200/20",
            )}
            style={{
              left: `${activeTarget.x * 100}%`,
              top: `${activeTarget.y * 100}%`,
              height: `${activeTarget.radius * 220}px`,
              width: `${activeTarget.radius * 220}px`,
            }}
          >
            <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-black text-[#173945]">
              {activeTarget.side === "left" ? "左手" : "右手"}
            </span>
          </div>
        ) : null}
        {snapshot.phase !== "running" ? (
          <div className="absolute inset-0 grid place-items-center bg-[#071b22]/70 p-8 text-center">
            <div className="max-w-xl rounded-[28px] border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-xl">
              <Badge label="体感采集状态" icon={Radar} />
              <h4 className="mt-5 text-3xl font-black">
                {snapshot.phase === "completed"
                  ? "采集完成"
                  : snapshot.phase === "error"
                    ? "采集未通过"
                    : "准备开始上肢反应触达"}
              </h4>
              <p className="mt-3 font-bold leading-7 text-white/75">
                {snapshot.message}
              </p>
              <p className="mt-4 font-mono text-xs text-white/55">
                本次采集至少 {targetDurationSeconds} 秒，不保存完整视频。
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 border-t border-white/15 bg-white/10 p-5 md:grid-cols-4">
        <div className="md:col-span-4">
          <Progress value={progress} />
        </div>
        <PoseRuntimeStat label="采样帧" value={String(snapshot.sampleCount)} />
        <PoseRuntimeStat
          label="有效帧率"
          value={
            snapshot.sampleCount
              ? `${Math.round((snapshot.validFrameCount / snapshot.sampleCount) * 100)}%`
              : "待采样"
          }
        />
        <PoseRuntimeStat label="命中/漏击" value={`${snapshot.hits}/${snapshot.misses}`} />
        <PoseRuntimeStat
          label="平均反应"
          value={
            snapshot.averageReactionTimeMs
              ? `${Math.round(snapshot.averageReactionTimeMs)}ms`
              : "采集中"
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/15 bg-[#071b22]/70 p-5">
        <p className="max-w-2xl font-bold leading-7 text-white/75">
          {snapshot.message}
        </p>
        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            className="bg-[#b9e2d5] text-[#173945] hover:bg-white"
            disabled={isRunning}
            onClick={() => void startGame()}
          >
            {snapshot.phase === "completed" ? "重新采集" : "开始采集"}
          </PrimaryButton>
          {isRunning ? (
            <button
              type="button"
              onClick={stopGame}
              className="min-h-14 rounded-2xl border border-white/20 px-7 text-lg font-black text-white transition hover:bg-white/10"
            >
              停止采集
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PoseRuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
      <p className="text-xs font-black uppercase text-[#b9e2d5]">{label}</p>
      <strong className="mt-2 block font-mono text-2xl font-black text-white">
        {value}
      </strong>
    </div>
  );
}

function stopBrowserPoseRuntime(
  runtimeRef: React.MutableRefObject<PoseTrainingRuntime | null>,
  animationRef: React.MutableRefObject<number | null>,
) {
  if (animationRef.current !== null) {
    window.cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }
  runtimeRef.current?.stop();
  runtimeRef.current = null;
}

function createInitialBrowserPoseStats(
  targetDurationSeconds: number,
): BrowserPoseGameStats {
  const startedAtMs = performance.now();
  return {
    startedAtMs,
    startedAtIso: new Date().toISOString(),
    targetDurationSeconds,
    sampleCount: 0,
    validFrameCount: 0,
    visibilityTotal: 0,
    hits: 0,
    misses: 0,
    reactionTimes: [],
    nextTargetId: 1,
    lastTargetEndedAtMs: startedAtMs - 1400,
    motionTravel: 0,
    lastSnapshotAtMs: startedAtMs,
    qualityReasons: [],
  };
}

function updateBrowserPoseStats(
  stats: BrowserPoseGameStats,
  landmarks: PoseLandmark[],
  timestampMs: number,
) {
  stats.sampleCount += 1;
  const visibility = averagePoseVisibility(landmarks);
  if (visibility >= 0.45 && landmarks.length >= 20) {
    stats.validFrameCount += 1;
    stats.visibilityTotal += visibility;
  }

  updateWristTravel(stats, landmarks);
  if (!stats.activeTarget && timestampMs - stats.lastTargetEndedAtMs >= 1200) {
    stats.activeTarget = createBrowserPoseTarget(stats.nextTargetId, timestampMs);
    stats.nextTargetId += 1;
  }

  if (!stats.activeTarget) return;
  const target = stats.activeTarget;
  const wrist = selectTargetWrist(landmarks, target.side);
  if (wrist && isWristInsideTarget(wrist, target)) {
    stats.hits += 1;
    stats.reactionTimes.push(timestampMs - target.appearedAtMs);
    stats.activeTarget = undefined;
    stats.lastTargetEndedAtMs = timestampMs;
    return;
  }

  if (timestampMs >= target.expiresAtMs) {
    expireCurrentTarget(stats, timestampMs);
  }
}

function createBrowserPoseTarget(id: number, timestampMs: number): BrowserPoseTarget {
  const side: BrowserPoseTarget["side"] = id % 2 === 0 ? "left" : "right";
  const patternIndex = (id - 1) % 6;
  const y = [0.34, 0.52, 0.42, 0.62, 0.3, 0.56][patternIndex];
  const x =
    side === "left"
      ? [0.28, 0.22, 0.36, 0.26, 0.34, 0.2][patternIndex]
      : [0.72, 0.78, 0.64, 0.74, 0.66, 0.8][patternIndex];

  return {
    id,
    side,
    x,
    y,
    radius: 0.12,
    appearedAtMs: timestampMs,
    expiresAtMs: timestampMs + 2600,
  };
}

function expireCurrentTarget(stats: BrowserPoseGameStats, timestampMs: number) {
  if (!stats.activeTarget) return;
  stats.misses += 1;
  stats.activeTarget = undefined;
  stats.lastTargetEndedAtMs = timestampMs;
}

function averagePoseVisibility(landmarks: PoseLandmark[]) {
  if (!landmarks.length) return 0;
  return (
    landmarks.reduce((sum, landmark) => sum + (landmark.visibility ?? 0), 0) /
    landmarks.length
  );
}

function selectTargetWrist(landmarks: PoseLandmark[], side: BrowserPoseTarget["side"]) {
  const wrist = landmarks[side === "left" ? 15 : 16];
  if (!wrist || (wrist.visibility ?? 0) < 0.45) return undefined;
  return wrist;
}

function isWristInsideTarget(wrist: PoseLandmark, target: BrowserPoseTarget) {
  const mirroredX = 1 - wrist.x;
  const dx = mirroredX - target.x;
  const dy = wrist.y - target.y;
  return Math.sqrt(dx * dx + dy * dy) <= target.radius;
}

function updateWristTravel(stats: BrowserPoseGameStats, landmarks: PoseLandmark[]) {
  const leftWrist = selectTargetWrist(landmarks, "left");
  const rightWrist = selectTargetWrist(landmarks, "right");
  if (leftWrist && stats.previousLeftWrist) {
    stats.motionTravel += distanceBetweenPosePoints(stats.previousLeftWrist, leftWrist);
  }
  if (rightWrist && stats.previousRightWrist) {
    stats.motionTravel += distanceBetweenPosePoints(stats.previousRightWrist, rightWrist);
  }
  if (leftWrist) {
    stats.previousLeftWrist = { x: leftWrist.x, y: leftWrist.y };
  }
  if (rightWrist) {
    stats.previousRightWrist = { x: rightWrist.x, y: rightWrist.y };
  }
}

function distanceBetweenPosePoints(
  previous: { x: number; y: number },
  current: { x: number; y: number },
) {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildBrowserPoseSnapshot(
  stats: BrowserPoseGameStats,
  phase: BrowserPoseGameSnapshot["phase"],
  message: string,
): BrowserPoseGameSnapshot {
  const elapsedSeconds = Math.max(
    0,
    Math.round((performance.now() - stats.startedAtMs) / 1000),
  );
  const averageVisibility =
    stats.validFrameCount > 0 ? stats.visibilityTotal / stats.validFrameCount : 0;
  return {
    phase,
    message,
    elapsedSeconds,
    target: stats.activeTarget,
    sampleCount: stats.sampleCount,
    validFrameCount: stats.validFrameCount,
    averageVisibility: Number(averageVisibility.toFixed(3)),
    hits: stats.hits,
    misses: stats.misses,
    averageReactionTimeMs: average(stats.reactionTimes),
    motionAccuracy: computeBrowserPoseAccuracy(stats),
    qualityReasons: stats.qualityReasons,
  };
}

function resolveBrowserPoseQualityReasons(
  stats: BrowserPoseGameStats,
  completedAtMs: number,
) {
  const durationSeconds = Math.round((completedAtMs - stats.startedAtMs) / 1000);
  const reasons: string[] = [];
  const validFrameRatio =
    stats.sampleCount > 0 ? stats.validFrameCount / stats.sampleCount : 0;
  const averageVisibility =
    stats.validFrameCount > 0 ? stats.visibilityTotal / stats.validFrameCount : 0;

  if (durationSeconds < 60) {
    reasons.push("训练时长不足 60 秒");
  }
  if (stats.sampleCount <= 0) {
    reasons.push("没有采集到姿态帧");
  }
  if (validFrameRatio < 0.7) {
    reasons.push("有效姿态帧比例低于 70%");
  }
  if (averageVisibility < 0.45) {
    reasons.push("姿态关键点平均置信度不足");
  }
  if (stats.hits + stats.misses < 6) {
    reasons.push("有效动作窗口不足");
  }
  if (!stats.reactionTimes.length) {
    reasons.push("没有有效命中反应时间");
  }
  return reasons;
}

function buildBrowserPoseTrainingResultPayload({
  stats,
  game,
  trainingSession,
  completedAtMs,
}: {
  stats: BrowserPoseGameStats;
  game: RehabPlan["items"][number]["gameContent"];
  trainingSession: TrainingSession;
  completedAtMs: number;
}): SubmitTrainingResultRequest {
  const durationSeconds = Math.max(
    1,
    Math.round((completedAtMs - stats.startedAtMs) / 1000),
  );
  const averageReactionTimeMs = Math.round(average(stats.reactionTimes) ?? 0);
  const completionRate = computeBrowserPoseCompletionRate(stats);
  const motionAccuracy = computeBrowserPoseAccuracy(stats);
  const averageVisibility =
    stats.validFrameCount > 0 ? stats.visibilityTotal / stats.validFrameCount : 0;
  const validFrameRatio =
    stats.sampleCount > 0 ? stats.validFrameCount / stats.sampleCount : 0;
  const exerciseIntensity = resolveExerciseIntensity(stats.motionTravel, durationSeconds);
  const score = Math.round(
    clamp(
      completionRate * 52 +
        motionAccuracy * 28 +
        validFrameRatio * 12 +
        clamp(1 - averageReactionTimeMs / 2600, 0, 1) * 8,
      0,
      100,
    ),
  );
  const clientGeneratedAt = new Date().toISOString();
  const rawPayloadHash = createTrainingPayloadHash({
    sessionId: trainingSession.id,
    gameRunId: trainingSession.gameRunId,
    stats: {
      sampleCount: stats.sampleCount,
      validFrameCount: stats.validFrameCount,
      hits: stats.hits,
      misses: stats.misses,
      reactionTimes: stats.reactionTimes,
      motionTravel: stats.motionTravel,
      durationSeconds,
    },
  });
  const windowStartedAt = stats.startedAtIso;
  const windowEndedAt = clientGeneratedAt;
  const commonSummary = {
    validFrameRatio: Number(validFrameRatio.toFixed(3)),
    hitCount: stats.hits,
    missCount: stats.misses,
    sampleCount: stats.sampleCount,
    poseModelVersion,
  };

  return {
    score,
    completionRate: Number(completionRate.toFixed(3)),
    durationSeconds,
    reactionTimeMs: averageReactionTimeMs,
    motionAccuracy: Number(motionAccuracy.toFixed(3)),
    exerciseIntensity,
    metricsSummary: {
      source: "browser_pose_game",
      gameRunId: trainingSession.gameRunId,
      gameVersion: game.gameVersion,
      protocolVersion: game.bridgeProtocolVersion,
      clientGeneratedAt,
      rawPayloadHash,
      deviceCode: trainingSession.deviceCode,
      poseModelVersion,
      validFrameRatio: Number(validFrameRatio.toFixed(3)),
      targetDurationSeconds: stats.targetDurationSeconds,
      rawVideoStored: false,
    },
    motionMetrics: [
      {
        metricType: "reaction_time_ms",
        metricValue: averageReactionTimeMs,
        unit: "ms",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.reactionTimes.length,
        windowStartedAt,
        windowEndedAt,
        bodyPart: "upper_limb",
        rawSummary: commonSummary,
      },
      {
        metricType: "target_hit_rate",
        metricValue: Number(completionRate.toFixed(3)),
        unit: "ratio",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.hits + stats.misses,
        windowStartedAt,
        windowEndedAt,
        bodyPart: "upper_limb",
        rawSummary: commonSummary,
      },
      {
        metricType: "pose_visibility_avg",
        metricValue: Number(averageVisibility.toFixed(3)),
        unit: "ratio",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.validFrameCount,
        windowStartedAt,
        windowEndedAt,
        rawSummary: commonSummary,
      },
      {
        metricType: "arm_raise_accuracy",
        metricValue: Number(motionAccuracy.toFixed(3)),
        unit: "ratio",
        confidence: Number(validFrameRatio.toFixed(3)),
        sampleCount: stats.hits + stats.misses,
        windowStartedAt,
        windowEndedAt,
        bodyPart: "upper_limb",
        rawSummary: commonSummary,
      },
    ],
  };
}

function computeBrowserPoseCompletionRate(stats: BrowserPoseGameStats) {
  const totalTargets = stats.hits + stats.misses;
  if (!totalTargets) return 0;
  return clamp(stats.hits / totalTargets, 0, 1);
}

function computeBrowserPoseAccuracy(stats: BrowserPoseGameStats) {
  const hitRate = computeBrowserPoseCompletionRate(stats);
  const reactionScore =
    stats.reactionTimes.length > 0
      ? clamp(1 - (average(stats.reactionTimes) ?? 2600) / 2600, 0, 1)
      : 0;
  return clamp(hitRate * 0.75 + reactionScore * 0.25, 0, 1);
}

function resolveExerciseIntensity(
  motionTravel: number,
  durationSeconds: number,
): SubmitTrainingResultRequest["exerciseIntensity"] {
  const travelPerMinute = durationSeconds > 0 ? motionTravel / (durationSeconds / 60) : 0;
  if (travelPerMinute >= 18) return "high";
  if (travelPerMinute >= 8) return "moderate";
  return "low";
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createTrainingPayloadHash(value: unknown) {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function resolveBrowserPoseTargetDurationSeconds(
  game: RehabPlan["items"][number]["gameContent"],
) {
  return Math.max(60, game.defaultDuration * 60);
}

function browserPosePhaseLabel(phase: BrowserPoseGameSnapshot["phase"]) {
  if (phase === "loading") return "加载中";
  if (phase === "running") return "采集中";
  if (phase === "completed") return "已生成";
  if (phase === "error") return "未通过";
  return "待开始";
}

function GameScreen({
  trainingSession,
  planItem,
  form,
  onFormChange,
  onSubmitResult,
  isBusy,
}: {
  trainingSession?: TrainingSession | null;
  planItem?: RehabPlan["items"][number];
  form: TrainingResultFormState;
  onFormChange: (field: keyof TrainingResultFormState, value: string) => void;
  onSubmitResult: (form: TrainingResultFormState) => Promise<void>;
  isBusy: boolean;
}) {
  const [bridgeStatus, setBridgeStatus] = useState<UnityTrainingBridgeStatus>(
    emptyUnityTrainingBridgeStatus,
  );
  const visibleBridgeStatus =
    trainingSession && bridgeStatus.sessionId === trainingSession.id
      ? bridgeStatus
      : emptyUnityTrainingBridgeStatus;

  useEffect(() => {
    if (!trainingSession || planItem?.gameContent.runtimeType !== "unity_webgl") {
      return;
    }

    const sessionId = trainingSession.id;

    function handleMessage(event: MessageEvent) {
      if (!isUnityTrainingResultCandidate(event.data)) {
        return;
      }

      const parsed = parseUnityTrainingResultBridgeEvent(event.data, sessionId);

      if (!parsed.ok) {
        setBridgeStatus({
          state: "rejected",
          message: parsed.error,
          at: new Date().toISOString(),
          sessionId,
        });
        return;
      }

      onFormChange("score", String(parsed.value.score));
      onFormChange(
        "completionRatePercent",
        String(parsed.value.completionRate * 100),
      );
      onFormChange("durationSeconds", String(parsed.value.durationSeconds));
      onFormChange("reactionTimeMs", String(parsed.value.reactionTimeMs));
      onFormChange(
        "motionAccuracyPercent",
        String(parsed.value.motionAccuracy * 100),
      );
      onFormChange("exerciseIntensity", parsed.value.exerciseIntensity);
      onFormChange(
        "metricsSummary",
        JSON.stringify(
          {
            ...parsed.value.metricsSummary,
            source: "unity_webgl",
            gameRunId: parsed.value.gameRunId,
            gameVersion: parsed.value.gameVersion,
            protocolVersion: parsed.value.protocolVersion,
            clientGeneratedAt: parsed.value.clientGeneratedAt,
            rawPayloadHash: parsed.value.rawPayloadHash,
          },
          null,
          2,
        ),
      );
      onFormChange(
        "motionMetrics",
        JSON.stringify(parsed.value.motionMetrics, null, 2),
      );
      setBridgeStatus({
        state: "accepted",
        message: "已接收训练结果",
        at: new Date().toISOString(),
        sessionId,
      });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onFormChange, planItem?.gameContent.runtimeType, trainingSession]);

  if (!trainingSession || !planItem) {
    return (
      <MissingDataCard
        title="训练会话尚未开始"
        message="请先在今日训练或训练准备页面创建训练会话，再进入实时采集页面提交游戏结果。"
      />
    );
  }

  const isComplete = isTrainingResultFormComplete(form);
  const liveReactionTime = form.reactionTimeMs.trim()
    ? `${form.reactionTimeMs.trim()}ms`
    : "待采集";
  const liveMotionAccuracy = form.motionAccuracyPercent.trim()
    ? `${form.motionAccuracyPercent.trim()}%`
    : "待采集";
  const liveIntensity = form.exerciseIntensity
    ? intensityLabel(form.exerciseIntensity)
    : "待采集";
  const runtimeType = planItem.gameContent.runtimeType;
  const isUnityRuntime = runtimeType === "unity_webgl";
  const isBrowserPoseRuntime = runtimeType === "browser_pose_game";
  const runtimeLabel = isBrowserPoseRuntime
    ? "浏览器体感采集"
    : "训练资源采集";
  const formLabel = isBrowserPoseRuntime ? "浏览器体感结果" : "训练结果回传";
  const resultDescription = isBrowserPoseRuntime
    ? "训练结果由浏览器姿态识别数据生成，需完成连续采样并通过质量校验后才能提交。"
    : "训练结果由训练资源回传生成，提交前可人工复核；来源、动作指标和置信度将写入训练结果。";
  const parsedMetricsSummary = parseFormJsonObject(form.metricsSummary);
  const parsedMotionMetrics = parseFormJsonArray(form.motionMetrics);
  const metricCards: Array<[string, string, typeof Activity]> = [
    ["训练得分", form.score.trim() || "待采集", BadgeCheck],
    ["完成度", form.completionRatePercent.trim() ? `${form.completionRatePercent.trim()}%` : "待采集", ClipboardCheck],
    ["训练时长", form.durationSeconds.trim() ? `${form.durationSeconds.trim()}秒` : "待采集", Activity],
    ["采集明细", parsedMotionMetrics ? `${parsedMotionMetrics.length} 项` : "待采集", Radar],
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isComplete || isBusy) return;
    void onSubmitResult(form);
  }

  function fillTrainingResultForm(payload: SubmitTrainingResultRequest) {
    onFormChange("score", String(payload.score));
    onFormChange(
      "completionRatePercent",
      String(Number((payload.completionRate * 100).toFixed(1))),
    );
    onFormChange("durationSeconds", String(payload.durationSeconds));
    onFormChange("reactionTimeMs", String(payload.reactionTimeMs));
    onFormChange(
      "motionAccuracyPercent",
      String(Number((payload.motionAccuracy * 100).toFixed(1))),
    );
    onFormChange("exerciseIntensity", payload.exerciseIntensity);
    onFormChange("metricsSummary", JSON.stringify(payload.metricsSummary, null, 2));
    onFormChange("motionMetrics", JSON.stringify(payload.motionMetrics, null, 2));
  }

  return (
    <div className="grid min-h-[680px] gap-5 lg:grid-cols-[1fr_330px]">
      <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-[linear-gradient(135deg,#123541,#24666b_58%,#3e7669)] p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[#b9e2d5]">
              {runtimeLabel}
            </p>
            <h3 className="text-3xl font-black">
              {planItem.gameContent.name} · 训练结果采集
            </h3>
          </div>
          <Chip>训练记录已创建</Chip>
        </div>
        {isUnityRuntime ? (
          <UnityGameContainer
            game={planItem.gameContent}
            trainingSession={trainingSession}
          />
        ) : (
          <BrowserPoseGameContainer
            game={planItem.gameContent}
            trainingSession={trainingSession}
            onResultReady={fillTrainingResultForm}
          />
        )}
      </div>
      <GlassCard className="bg-[#173945]/85 text-white">
        <Badge label="实时采集" icon={Database} />
        <div className="mt-5 grid gap-4">
          <MetricCard value={liveReactionTime} label="反应时间" icon={Activity} dark />
          <MetricCard value={liveMotionAccuracy} label="动作准确率" icon={BadgeCheck} dark />
          <MetricCard value={liveIntensity} label="运动强度" icon={HeartPulse} dark />
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
            <Chip tone={isComplete ? "success" : "warning"}>
              {isComplete ? "结果已生成" : "等待采集"}
            </Chip>
            <p className="mt-3 font-bold leading-7 text-white/80">
              {isBrowserPoseRuntime
                ? "当前训练记录已创建。系统会从摄像头姿态帧计算结果，未完成有效采集前不会生成成绩。"
                : "当前训练记录已创建。训练资源完成结果回传前不能提交。"}
            </p>
            {isUnityRuntime ? (
              <div className="mt-4 rounded-3xl border border-white/15 bg-black/10 p-4">
                <p className="text-xs font-black uppercase text-[#b9e2d5]">
                  最近采集状态
                </p>
                <p className="mt-2 text-sm font-bold text-white/90">
                  {visibleBridgeStatus.message}
                </p>
                {"at" in visibleBridgeStatus ? (
                  <p className="mt-1 break-all font-mono text-[11px] text-white/55">
                    {visibleBridgeStatus.at}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="rounded-3xl border border-white/15 bg-white/10 p-5 font-bold leading-7 text-white/80">
            本次训练记录已创建，完成后会关联当前患者、康复方案和训练内容。
          </p>
        </div>
      </GlassCard>
      <form
        onSubmit={submit}
        className="rounded-[30px] border border-[#c9e3e7] bg-white/80 p-5 shadow-xl shadow-cyan-950/10 lg:col-span-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge label={formLabel} icon={ClipboardCheck} />
            <h4 className="mt-4 text-3xl font-black text-[#173945]">
              提交本次训练结果
            </h4>
            <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
              {resultDescription}
            </p>
          </div>
          <Chip tone={isComplete ? "success" : "warning"}>
            {isComplete ? "可提交" : "待填写完整"}
          </Chip>
        </div>
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          <FieldLine
            label="训练得分（0-100）"
            value={form.score}
            onChange={(value) => onFormChange("score", value)}
            type="number"
            readOnly={isBrowserPoseRuntime}
          />
          <FieldLine
            label="完成度（%）"
            value={form.completionRatePercent}
            onChange={(value) => onFormChange("completionRatePercent", value)}
            type="number"
            readOnly={isBrowserPoseRuntime}
          />
          <FieldLine
            label="训练时长（秒）"
            value={form.durationSeconds}
            onChange={(value) => onFormChange("durationSeconds", value)}
            type="number"
            readOnly={isBrowserPoseRuntime}
          />
          <FieldLine
            label="反应时间（毫秒）"
            value={form.reactionTimeMs}
            onChange={(value) => onFormChange("reactionTimeMs", value)}
            type="number"
            readOnly={isBrowserPoseRuntime}
          />
          <FieldLine
            label="动作准确率（%）"
            value={form.motionAccuracyPercent}
            onChange={(value) => onFormChange("motionAccuracyPercent", value)}
            type="number"
            readOnly={isBrowserPoseRuntime}
          />
          <SelectField
            label="运动强度"
            value={form.exerciseIntensity}
            onChange={(value) => onFormChange("exerciseIntensity", value)}
            disabled={isBrowserPoseRuntime}
            options={[
              ["", "请选择采集强度"],
              ["low", "低强度"],
              ["moderate", "中等强度"],
              ["high", "高强度"],
            ]}
          />
        </div>
        <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h5 className="text-xl font-black text-[#173945]">训练结果摘要</h5>
            <Chip tone={parsedMetricsSummary && parsedMotionMetrics ? "success" : "warning"}>
              {parsedMetricsSummary && parsedMotionMetrics ? "采集明细已生成" : "等待完整采集"}
            </Chip>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {metricCards.map(([label, value, icon]) => (
              <MetricCard key={label} value={value} label={label} icon={icon} />
            ))}
          </div>
          <details className="mt-4 rounded-2xl border border-dashed border-[#c9e3e7] bg-[#f8fcfb] p-4">
            <summary className="cursor-pointer font-black text-[#1f7a8c]">
              查看采集原文
            </summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <TextAreaField
                label="结果摘要原文"
                value={form.metricsSummary}
                onChange={(value) => onFormChange("metricsSummary", value)}
                readOnly={isBrowserPoseRuntime}
              />
              <TextAreaField
                label="采集明细原文"
                value={form.motionMetrics}
                onChange={(value) => onFormChange("motionMetrics", value)}
                readOnly={isBrowserPoseRuntime}
              />
            </div>
          </details>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#c9e3e7] bg-[#eefaf7] p-4">
          <p className="font-bold leading-7 text-[#526b74]">
            提交后系统会拒绝重复结果、非可信来源、缺少动作指标或超范围数值，并将可疑训练数据标记给医师复核。
          </p>
          <PrimaryButton
            className="bg-[#173945] hover:bg-[#1f7a8c]"
            disabled={!isComplete || isBusy}
            type="submit"
          >
            {isBusy ? "正在提交结果" : "提交训练结果"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function ResultScreen({
  patient,
  currentPlan,
  trainingRecords,
  readiness,
  evidenceForm,
  onEvidenceFormChange,
}: {
  patient?: PatientProfile;
  currentPlan?: RehabPlan | null;
  trainingRecords?: TrainingRecordsResponse;
  readiness: TrainingReadiness;
  evidenceForm: BrowserPoseEvidenceFormState;
  onEvidenceFormChange: (
    field: keyof BrowserPoseEvidenceFormState,
    value: string,
  ) => void;
}) {
  const latest = trainingRecords?.sessions.find((session) => session.result);
  const result = latest?.result;
  const browserPoseSession =
    latest?.gameContent.runtimeType === "browser_pose_game" ? latest : undefined;

  return (
    <ScreenGrid
      eyebrow="训练记录"
      title="训练结果与历史记录"
      subtitle="展示已回传的训练结果、动作质量和近期训练趋势。"
      aside={<HistoryPanel trainingRecords={trainingRecords} />}
    >
      <GlassCard>
        <Chip tone={result ? (result.abnormalFlag ? "warning" : "success") : "info"}>
          {result ? qualityLabel(result.qualityFlag) : "等待训练结果"}
        </Chip>
        <h3 className="mt-5 text-4xl font-black">
          {result ? "训练结果已回传" : "等待训练结果回传"}
        </h3>
        {result && latest ? (
          <>
            <div className="mt-8 font-mono text-9xl font-black text-[#2a8aa0]">
              {result.score}
            </div>
            <p className="text-lg font-bold text-[#526b74]">
              {latest.gameContent.name} 已回传，动作准确率{" "}
              {toPercent(result.motionAccuracy)}，反应时间{" "}
              {result.reactionTimeMs}ms。
            </p>
            <div className="mt-7 grid gap-4 md:grid-cols-4">
              <MetricCard
                value={toPercent(result.completionRate)}
                label="完成度"
                icon={BadgeCheck}
              />
              <MetricCard
                value={toPercent(result.motionAccuracy)}
                label="准确率"
                icon={Radar}
              />
              <MetricCard
                value={`${(result.reactionTimeMs / 1000).toFixed(2)}s`}
                label="反应时间"
                icon={Activity}
              />
              <MetricCard
                value={intensityLabel(result.exerciseIntensity)}
                label="运动强度"
                icon={HeartPulse}
              />
            </div>
            {browserPoseSession ? (
              <BrowserPoseEvidencePanel
                patient={patient}
                currentPlan={currentPlan}
                session={browserPoseSession}
                readiness={readiness}
                form={evidenceForm}
                onFormChange={onEvidenceFormChange}
              />
            ) : null}
          </>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-[#c9e3e7] bg-white/70 p-8">
            <h4 className="text-2xl font-black text-[#173945]">
              暂无训练结果
            </h4>
            <p className="mt-3 text-lg font-bold leading-8 text-[#526b74]">
              完成训练并通过质量校验后，这里会显示得分、完成度、反应时间和动作准确率。
            </p>
          </div>
        )}
      </GlassCard>
    </ScreenGrid>
  );
}

function BrowserPoseEvidencePanel({
  patient,
  currentPlan,
  session,
  readiness,
  form,
  onFormChange,
}: {
  patient?: PatientProfile;
  currentPlan?: RehabPlan | null;
  session: TrainingRecordsResponse["sessions"][number];
  readiness: TrainingReadiness;
  form: BrowserPoseEvidenceFormState;
  onFormChange: (
    field: keyof BrowserPoseEvidenceFormState,
    value: string,
  ) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const result = session.result;
  const planItem = currentPlan?.items.find((item) => item.id === session.planItemId);
  const browserRuntimeReady =
    readiness.poseRuntimeStatus === "ready" &&
    Boolean(readiness.poseModelVersion) &&
    Boolean(readiness.poseLandmarkCount) &&
    readiness.poseAverageVisibility !== undefined &&
    Boolean(readiness.poseCheckedAt);

  function handleDownload() {
    setMessage(null);
    if (!patient || !currentPlan || !planItem || !result) {
      setMessage("缺少患者、当前方案、方案项目或训练结果，不能导出实机证据。");
      return;
    }
    if (!browserRuntimeReady) {
      setMessage("缺少姿态识别就绪记录，请先在训练准备页完成摄像头和姿态检测。");
      return;
    }

    const evidenceResult = buildBrowserPoseEvidenceInputFromRecord({
      acceptance: {
        acceptedAt: result.submittedAt,
        testerName: form.testerName.trim(),
        siteName: form.siteName.trim(),
        environment: form.environment.trim(),
      },
      browser: {
        name: form.browserName.trim(),
        version: form.browserVersion.trim(),
        userAgent: navigator.userAgent,
        pageUrl: window.location.href,
      },
      device: {
        deviceCode: session.deviceCode ?? "",
        cameraLabel: readiness.cameraLabel ?? "",
        cameraDeviceIdHash: form.cameraDeviceIdHash.trim(),
        resolution: form.cameraResolution.trim(),
      },
      poseRuntime: {
        runtimeType: "browser_pose_game",
        modelName: "MediaPipe PoseLandmarker",
        modelVersion: readiness.poseModelVersion ?? "",
        poseLandmarkCount: readiness.poseLandmarkCount ?? 0,
        checkedAt: readiness.poseCheckedAt ?? "",
        averageVisibility: readiness.poseAverageVisibility ?? Number.NaN,
      },
      patient: {
        patientId: patient.id,
        patientExportId: form.patientExportId.trim(),
      },
      gameContent: session.gameContent,
      rehabPlan: {
        rehabPlanId: currentPlan.id,
        planItemId: planItem.id,
        confirmedByDoctorId: form.confirmedByDoctorId.trim(),
        confirmedAt: form.confirmedAt.trim(),
      },
      trainingSession: session,
      trainingResult: result,
      motionMetrics: session.motionMetrics ?? [],
      auditEvidence: {
        auditLogIds: parseEvidenceTextList(form.auditLogIdsText),
        requiredActions: ["training_session.start", "training_result.submit"],
        checkedAt: new Date().toISOString(),
      },
      artifacts: {
        screenshots: [
          {
            label: "训练完成页",
            path: form.screenshotPath.trim(),
            capturedAt: form.screenshotCapturedAt.trim(),
          },
        ],
        recordings: [
          {
            label: "训练过程录屏",
            path: form.recordingPath.trim(),
            capturedAt: form.recordingCapturedAt.trim(),
          },
        ],
      },
    });

    if (!evidenceResult.ok) {
      setMessage(evidenceResult.error);
      return;
    }

    downloadJsonFile(
      evidenceResult.evidence,
      `browser-pose-evidence-${session.id}.json`,
    );
    setMessage("浏览器体感实机证据 JSON 已生成，请使用 pnpm verify:browser-pose-evidence 校验。");
  }

  return (
    <div className="mt-8 rounded-[28px] border border-[#c9e3e7] bg-[#eefaf7] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="实机证据包" icon={FileText} />
          <h4 className="mt-3 text-2xl font-black text-[#173945]">
            导出浏览器体感验收 JSON
          </h4>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            仅在训练结果已入库后生成证据。现场验收人、审计日志和截图录屏必须显式填写，系统不会自动补造缺失证据。
          </p>
        </div>
        <Chip tone={browserRuntimeReady ? "success" : "warning"}>
          {browserRuntimeReady ? "姿态记录已就绪" : "缺姿态就绪记录"}
        </Chip>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <FieldLine
          label="验收人员"
          value={form.testerName}
          onChange={(value) => onFormChange("testerName", value)}
        />
        <FieldLine
          label="验收现场"
          value={form.siteName}
          onChange={(value) => onFormChange("siteName", value)}
        />
        <FieldLine
          label="环境标识"
          value={form.environment}
          onChange={(value) => onFormChange("environment", value)}
        />
        <FieldLine
          label="浏览器名称"
          value={form.browserName}
          onChange={(value) => onFormChange("browserName", value)}
        />
        <FieldLine
          label="浏览器版本"
          value={form.browserVersion}
          onChange={(value) => onFormChange("browserVersion", value)}
        />
        <FieldLine
          label="摄像头分辨率"
          value={form.cameraResolution}
          onChange={(value) => onFormChange("cameraResolution", value)}
        />
        <FieldLine
          label="摄像头设备哈希"
          value={form.cameraDeviceIdHash}
          onChange={(value) => onFormChange("cameraDeviceIdHash", value)}
        />
        <FieldLine
          label="脱敏患者导出 ID"
          value={form.patientExportId}
          onChange={(value) => onFormChange("patientExportId", value)}
        />
        <FieldLine
          label="确认方案医师 ID"
          value={form.confirmedByDoctorId}
          onChange={(value) => onFormChange("confirmedByDoctorId", value)}
        />
        <FieldLine
          label="方案确认时间"
          value={form.confirmedAt}
          onChange={(value) => onFormChange("confirmedAt", value)}
        />
        <FieldLine
          label="训练完成截图路径"
          value={form.screenshotPath}
          onChange={(value) => onFormChange("screenshotPath", value)}
        />
        <FieldLine
          label="截图时间"
          value={form.screenshotCapturedAt}
          onChange={(value) => onFormChange("screenshotCapturedAt", value)}
        />
        <FieldLine
          label="训练录屏路径"
          value={form.recordingPath}
          onChange={(value) => onFormChange("recordingPath", value)}
        />
        <FieldLine
          label="录屏时间"
          value={form.recordingCapturedAt}
          onChange={(value) => onFormChange("recordingCapturedAt", value)}
        />
        <TextAreaField
          label="审计日志 ID（每行一条）"
          value={form.auditLogIdsText}
          onChange={(value) => onFormChange("auditLogIdsText", value)}
        />
      </div>

      <div className="mt-5 rounded-3xl border border-white/75 bg-white/70 p-4">
        <StatusList
          items={[
            ["训练会话", `${session.sessionStatus} / ${session.syncStatus}`, session.sessionStatus === "completed" && session.syncStatus === "synced" ? "success" : "warning"],
            ["训练来源", result?.source ?? "待采集", result?.source === "browser_pose_game" ? "success" : "warning"],
            ["动作指标", `${session.motionMetrics?.length ?? 0} 项`, (session.motionMetrics?.length ?? 0) >= 4 ? "success" : "warning"],
            ["摄像头标签", readiness.cameraLabel ?? "未记录", readiness.cameraLabel ? "success" : "warning"],
          ]}
        />
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-[#d8b76a] bg-[#fff8db] p-4 font-bold leading-7 text-[#7a5a1f]">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="font-bold leading-7 text-[#526b74]">
          导出后请把 JSON、截图、录屏和审计截图一起归档；模板占位符或空字段会被校验脚本拒绝。
        </p>
        <PrimaryButton
          className="bg-[#173945] hover:bg-[#1f7a8c]"
          onClick={handleDownload}
          type="button"
        >
          导出证据 JSON
        </PrimaryButton>
      </div>
    </div>
  );
}

function FamilyScreen({
  caregiverSummary,
}: {
  caregiverSummary?: CaregiverSummaryResponse;
}) {
  return (
    <ScreenGrid
      eyebrow="家属协同"
      title="家属登录与授权绑定"
      subtitle="家属只看必要摘要、提醒和进展，不开放原始评估、完整病史和方案修改。"
      aside={<FamilyBinding caregiverSummary={caregiverSummary} />}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            "今日任务提醒",
            caregiverSummary?.currentPlan
              ? `${caregiverSummary.patient.name} 今日计划 ${caregiverSummary.currentPlan.dailyDuration} 分钟。`
              : "登录家属账号后查看训练提醒。",
          ],
          [
            "阶段进展摘要",
            `近 7 天记录 ${caregiverSummary?.recentTraining.length ?? 0} 条。`,
          ],
          [
            "隐私授权边界",
            caregiverSummary?.permissions.rawAssessment
              ? "当前授权包含原始评估。"
              : "仅展示脱敏摘要，不开放完整病历与原始评估对话。",
          ],
        ].map(([title, desc]) => (
          <GlassCard key={title}>
            <h3 className="text-2xl font-black">{title}</h3>
            <p className="mt-3 font-bold leading-7 text-[#526b74]">{desc}</p>
          </GlassCard>
        ))}
      </div>
    </ScreenGrid>
  );
}

function FamilyBinding({
  caregiverSummary,
}: {
  caregiverSummary?: CaregiverSummaryResponse;
}) {
  return (
    <GlassCard>
      <Badge label="授权绑定" icon={UsersRound} />
      <StatusList
        items={[
          ["绑定患者", caregiverSummary?.patient.name ?? "等待登录", "info"],
          [
            "风险评级",
            riskLabel(caregiverSummary?.currentRisk),
            caregiverSummary ? "warning" : "info",
          ],
          [
            "授权边界",
            caregiverSummary?.permissions.planEdit ? "可编辑" : "仅摘要",
            "success",
          ],
        ]}
      />
      <PrimaryButton className="mt-5 w-full">进入家属端</PrimaryButton>
    </GlassCard>
  );
}

function DoctorScreen({
  patients,
  patient,
  selectedPatientId,
  onSelectPatient,
  patientForm,
  onPatientFormChange,
  onCreatePatient,
  isCreatingPatient,
  primaryRole,
  canCreatePatient,
  trainingRecords,
  reviewForm,
  onReviewFormChange,
  onSubmitTrainingReview,
  isReviewingTraining,
}: {
  patients?: PatientProfile[];
  patient?: PatientProfile;
  selectedPatientId?: string | null;
  onSelectPatient: (patientId: string) => Promise<void>;
  patientForm: PatientFormState;
  onPatientFormChange: (field: keyof PatientFormState, value: string) => void;
  onCreatePatient: (form: PatientFormState) => Promise<void>;
  isCreatingPatient: boolean;
  primaryRole?: RoleCode;
  canCreatePatient: boolean;
  trainingRecords?: TrainingRecordsResponse;
  reviewForm: TrainingReviewFormState;
  onReviewFormChange: <K extends keyof TrainingReviewFormState>(
    field: K,
    value: TrainingReviewFormState[K],
  ) => void;
  onSubmitTrainingReview: (form: TrainingReviewFormState) => Promise<void>;
  isReviewingTraining: boolean;
}) {
  const assessment = patient?.assessments?.[0];
  const scoreSummary = assessment?.scoreSummary ?? {};
  const aiAnalysis = assessment?.aiAnalyses?.[0];
  const currentPlan = resolvePendingPlan(patient) ?? resolveConfirmedCurrentPlan(patient);
  const currentRisk = resolveCurrentRisk(patient);
  const prerequisiteState = buildPlanPrerequisiteState(patient, resolvePendingPlan(patient));

  return (
    <DashboardShell
      title={patient ? `${patient.name} · 患者管理` : "患者管理"}
      role="医师工作台"
    >
      <GlassCard className="md:col-span-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge label="负责患者" icon={Stethoscope} />
            <h3 className="mt-4 text-2xl font-black">患者队列与当前档案</h3>
            <p className="mt-2 font-bold text-[#526b74]">
              先选择负责患者，再查看评估、方案、授权与训练结果。
            </p>
          </div>
          <select
            value={selectedPatientId ?? ""}
            onChange={(event) => void onSelectPatient(event.target.value)}
            className="min-h-12 rounded-2xl border border-[#c9e3e7] bg-white/85 px-4 font-bold text-[#16333d] outline-none focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
          >
            {(patients?.length ? patients : patient ? [patient] : []).map(
              (item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.age}岁 · 档案号 {shortId(item.id)}
                </option>
              ),
            )}
          </select>
        </div>
        <DoctorPatientTable
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={onSelectPatient}
        />
      </GlassCard>
      <MetricCard
        value={clinicalScoreLabel(scoreSummary.mmse)}
        label="MMSE 认知筛查"
        icon={Brain}
      />
      <MetricCard
        value={clinicalScoreLabel(scoreSummary.cdr)}
        label="CDR 临床分级"
        icon={FileText}
      />
      <MetricCard
        value={riskLabel(currentRisk?.riskLevel)}
        label="当前评级"
        icon={Radar}
      />
      <MetricCard
        value={aiAnalysis ? `${Math.round(aiAnalysis.confidence * 100)}%` : "未生成"}
        label="分析可信度"
        icon={Sparkles}
      />
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">当前康复计划</h3>
        <PlanRows plan={currentPlan} />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <Badge label="匹配闭环" icon={ClipboardCheck} />
        <h3 className="mt-4 text-2xl font-black">生成推荐方案前置条件</h3>
        <StatusList items={prerequisiteState.items} />
      </GlassCard>
      <DoctorPatientAlerts patient={patient} />
      <TrainingReviewPanel
        trainingRecords={trainingRecords}
        form={reviewForm}
        onChange={onReviewFormChange}
        onSubmit={onSubmitTrainingReview}
        isBusy={isReviewingTraining}
      />
      <PatientCreatePanel
        form={patientForm}
        onChange={onPatientFormChange}
        onCreatePatient={onCreatePatient}
        isBusy={isCreatingPatient}
        primaryRole={primaryRole}
        canCreatePatient={canCreatePatient}
      />
    </DashboardShell>
  );
}

function PatientCreatePanel({
  form,
  onChange,
  onCreatePatient,
  isBusy,
  primaryRole,
  canCreatePatient,
}: {
  form: PatientFormState;
  onChange: (field: keyof PatientFormState, value: string) => void;
  onCreatePatient: (form: PatientFormState) => Promise<void>;
  isBusy: boolean;
  primaryRole?: RoleCode;
  canCreatePatient: boolean;
}) {
  const isAdmin = isAdminRole(primaryRole);
  const canSubmit =
    canCreatePatient && isPatientFormComplete(form, primaryRole);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onCreatePatient(form);
  }

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="患者建档" icon={FileText} />
          <h3 className="mt-4 text-2xl font-black">新建患者档案与登录账号</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            医师或具备建档权限的工作人员录入患者资料后，系统会创建患者账号与患者档案，自动完成账号权限配置，并保留操作记录。不会自动生成评估、授权、康复计划或训练记录。
          </p>
        </div>
        <Chip tone={!canCreatePatient ? "muted" : isAdmin ? "warning" : "info"}>
          {!canCreatePatient
            ? "当前角色只读"
            : isAdmin
              ? "需指定负责医师"
              : "绑定当前医师"}
        </Chip>
      </div>
      {!canCreatePatient && (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 font-bold leading-7 text-amber-800">
          当前账号没有患者建档权限。审计查看人员可以查看运营统计和审计日志，但不能创建或修改患者业务数据。
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset
          disabled={!canCreatePatient || isBusy}
          className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-4"
        >
          <FieldLine
            label="患者登录账号"
            value={form.account}
            onChange={(value) => onChange("account", value)}
          />
          <FieldLine
            label="患者初始密码"
            type="password"
            value={form.initialPassword}
            onChange={(value) => onChange("initialPassword", value)}
          />
          <FieldLine
            label="患者姓名"
            value={form.name}
            onChange={(value) => onChange("name", value)}
          />
          <FieldLine
            label="年龄"
            type="number"
            value={form.age}
            onChange={(value) => onChange("age", value)}
          />
          <SelectField
            label="性别"
            value={form.gender}
            onChange={(value) => onChange("gender", value)}
            options={[
              ["", "请选择"],
              ["female", "女"],
              ["male", "男"],
              ["other", "其他"],
            ]}
          />
          <FieldLine
            label="患者手机号"
            value={form.mobilePhone}
            onChange={(value) => onChange("mobilePhone", value)}
          />
          <FieldLine
            label="照护人姓名"
            value={form.caregiverName}
            onChange={(value) => onChange("caregiverName", value)}
          />
          <FieldLine
            label="照护人电话"
            value={form.caregiverPhone}
            onChange={(value) => onChange("caregiverPhone", value)}
          />
          {isAdmin && (
            <FieldLine
              label="负责医师账号或编号"
              value={form.responsibleDoctorId}
              onChange={(value) => onChange("responsibleDoctorId", value)}
            />
          )}
          <FieldLine
            label="血压"
            value={form.bloodPressure}
            onChange={(value) => onChange("bloodPressure", value)}
          />
          <FieldLine
            label="心率"
            type="number"
            value={form.heartRate}
            onChange={(value) => onChange("heartRate", value)}
          />
          <SelectField
            label="步态风险"
            value={form.gaitRisk}
            onChange={(value) => onChange("gaitRisk", value)}
            options={[
              ["", "未评估"],
              ["low", "低"],
              ["moderate", "中"],
              ["high", "高"],
            ]}
          />
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#c9e3e7] bg-[#e9f8f6]/80 p-5">
          <p className="max-w-3xl font-bold leading-7 text-[#526b74]">
            创建后请让患者使用录入账号登录，在“建档授权”页逐项签署当前版本授权，再继续 AI 评估和训练采集。
          </p>
          <PrimaryButton disabled={!canSubmit || isBusy} type="submit">
            {isBusy
              ? "正在创建患者"
              : canCreatePatient
                ? "创建患者档案"
                : "无建档权限"}
          </PrimaryButton>
        </div>
      </form>
    </GlassCard>
  );
}

function DoctorPatientTable({
  patients,
  selectedPatientId,
  onSelectPatient,
}: {
  patients?: PatientProfile[];
  selectedPatientId?: string | null;
  onSelectPatient: (patientId: string) => Promise<void>;
}) {
  const rows = patients ?? [];
  if (!rows.length) {
    return (
      <div className="mt-5 rounded-3xl border border-dashed border-[#c9e3e7] bg-white/60 p-6 font-bold text-[#6a8088]">
        当前账号暂无负责患者档案。创建患者或完成医患绑定后会显示患者队列。
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded-3xl border border-[#c9e3e7]">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[1.1fr_0.8fr_1fr_1fr_1fr] gap-3 border-b border-[#d7e8ec] bg-[#e8f8f8]/80 p-4 text-xs font-black uppercase tracking-[0.16em] text-[#25859a]">
          <span>患者</span>
          <span>评级</span>
          <span>方案</span>
          <span>最近训练</span>
          <span>操作</span>
        </div>
        {rows.slice(0, 8).map((item) => {
          const risk = resolveCurrentRisk(item);
          const plan = resolvePendingPlan(item) ?? resolveConfirmedCurrentPlan(item);
          const latestTraining = latestTrainingSession(item);
          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[1.1fr_0.8fr_1fr_1fr_1fr] items-center gap-3 border-b border-[#e1edf0] bg-white/70 p-4 text-sm font-bold last:border-b-0",
                selectedPatientId === item.id && "bg-[#eefaf7]",
              )}
            >
              <span>
                <span className="block text-base font-black text-[#16333d]">
                  {item.name}
                </span>
                <span className="mt-1 block text-xs text-[#6a8088]">
                  {item.age}岁 · 档案号 {shortId(item.id)}
                </span>
              </span>
              <span>
                <Chip tone={riskTone(risk?.riskLevel)}>
                  {riskLabel(risk?.riskLevel)}
                </Chip>
              </span>
              <span>{plan ? statusLabel(plan.status) : "暂无方案"}</span>
              <span>{latestTraining ? formatDateTime(latestTraining.startedAt) : "暂无记录"}</span>
              <span>
                <button
                  type="button"
                  onClick={() => void onSelectPatient(item.id)}
                  className="min-h-11 rounded-2xl border border-[#1f7a8c]/25 bg-white px-4 font-black text-[#1f7a8c] transition hover:bg-[#e9f8f6]"
                >
                  查看档案
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DoctorPatientAlerts({ patient }: { patient?: PatientProfile }) {
  const items = buildPatientAlertItems(patient);
  return (
    <GlassCard className="md:col-span-2">
      <h3 className="text-2xl font-black">当前患者待关注事项</h3>
      <StatusList items={items} />
    </GlassCard>
  );
}

function TrainingReviewPanel({
  trainingRecords,
  form,
  onChange,
  onSubmit,
  isBusy,
}: {
  trainingRecords?: TrainingRecordsResponse;
  form: TrainingReviewFormState;
  onChange: <K extends keyof TrainingReviewFormState>(
    field: K,
    value: TrainingReviewFormState[K],
  ) => void;
  onSubmit: (form: TrainingReviewFormState) => Promise<void>;
  isBusy: boolean;
}) {
  const reviewSessions = findTrainingSessionsRequiringReview(trainingRecords);
  const selectedSession = reviewSessions.find(
    (session) => session.result?.id === form.resultId,
  );
  const canSubmit = isTrainingReviewFormComplete(form);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onSubmit(form);
  }

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="人工复核" icon={MonitorCheck} />
          <h3 className="mt-4 text-2xl font-black">待复核训练结果</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            系统只列出真实回传且被标记为异常或可疑的训练结果。复核结论不会自动生成，需要医师根据质量原因、动作指标和患者状态手动填写。
          </p>
        </div>
        <Chip tone={reviewSessions.length ? "warning" : "success"}>
          {reviewSessions.length ? `${reviewSessions.length} 条待复核` : "暂无待复核"}
        </Chip>
      </div>

      {reviewSessions.length ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-3xl border border-[#c9e3e7]">
            {reviewSessions.map((session) => {
              const result = session.result;
              const isSelected = result?.id === form.resultId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onChange("resultId", result?.id ?? "")}
                  className={cn(
                    "block w-full border-b border-[#e1edf0] bg-white/70 p-5 text-left last:border-b-0 transition hover:bg-[#e9f8f6]",
                    isSelected && "bg-[#e9f8f6] ring-2 ring-inset ring-[#1f7a8c]/30",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-[#16333d]">
                        {session.gameContent.name}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#6a8088]">
                        {formatDateTime(session.startedAt)} · 会话 {shortId(session.id)}
                      </p>
                    </div>
                    <Chip tone={result?.abnormalFlag ? "danger" : "warning"}>
                      {qualityLabel(result?.qualityFlag)}
                    </Chip>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <FormBlock label="得分" value={formatNullableNumber(result?.score, "分")} />
                    <FormBlock
                      label="完成率"
                      value={formatNullablePercent(result?.completionRate)}
                    />
                    <FormBlock
                      label="反应时间"
                      value={formatNullableNumber(result?.reactionTimeMs, "ms")}
                    />
                    <FormBlock
                      label="动作准确率"
                      value={formatNullablePercent(result?.motionAccuracy)}
                    />
                  </div>
                  <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
                    {result?.qualityReasons?.length
                      ? result.qualityReasons.join("；")
                      : "系统未返回质量原因，请查看动作指标后再复核。"}
                  </p>
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="rounded-3xl border border-[#c9e3e7] bg-white/70 p-5">
            <h4 className="text-xl font-black">录入复核结论</h4>
            <p className="mt-2 text-sm font-bold leading-6 text-[#6a8088]">
              {selectedSession
                ? `当前复核：${selectedSession.gameContent.name} · ${shortId(selectedSession.result?.id ?? selectedSession.id)}`
                : "请先从左侧选择一条待复核训练结果。"}
            </p>
            <SelectField
              label="复核结论"
              value={form.reviewConclusion}
              disabled={!form.resultId || isBusy}
              onChange={(value) =>
                onChange("reviewConclusion", value as TrainingReviewFormState["reviewConclusion"])
              }
              options={[
                ["", "请选择人工结论"],
                ["confirmed_abnormal", "确认异常"],
                ["accepted_valid", "人工采纳为有效"],
                ["excluded_from_analysis", "排除统计分析"],
                ["needs_retrain", "建议重新训练"],
              ]}
            />
            <TextAreaField
              label="复核说明"
              value={form.reviewNote}
              onChange={(value) => onChange("reviewNote", value)}
              readOnly={!form.resultId || isBusy}
            />
            <PrimaryButton
              type="submit"
              disabled={!canSubmit || isBusy}
              className="mt-5 w-full"
            >
              {isBusy ? "正在保存复核" : "保存复核结论"}
            </PrimaryButton>
          </form>
        </div>
      ) : (
        <div className="mt-5 rounded-3xl border border-dashed border-[#c9e3e7] bg-white/60 p-6 font-bold leading-7 text-[#6a8088]">
          当前患者没有待复核训练。只有系统标记为异常或可疑、且尚未人工复核的真实训练结果会进入这里。
        </div>
      )}
    </GlassCard>
  );
}

function PlanScreen({
  patient,
  onConfirmPlan,
  isBusy,
}: {
  patient?: PatientProfile;
  onConfirmPlan: (
    plan: RehabPlan,
    options: {
      dailyDuration: number;
      weekFrequency: number;
      adjustmentReason: string;
      itemAdjustments: Array<{
        gameContentId: string;
        durationMinutes: number;
        frequencyPerWeek: number;
        difficulty: string;
      }>;
    },
  ) => Promise<void>;
  isBusy: boolean;
}) {
  const pending = resolvePendingPlan(patient);
  const activePlan = resolveConfirmedCurrentPlan(patient);
  const plan = pending ?? activePlan;
  const risk = resolveCurrentRisk(patient);
  const prerequisiteState = buildPlanPrerequisiteState(patient, pending);
  const trainingState = summarizeTrainingContentReadiness(plan);

  return (
    <DashboardShell title="康复计划确认与人工调整" role="医师工作台">
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">系统推荐方案</h3>
        <StatusList
          items={[
            ["认知评级", riskLabel(risk?.riskLevel), "warning"],
            ["每日时长", plan ? `${plan.dailyDuration} 分钟` : "暂无方案", "info"],
            ["每周频次", plan ? `${plan.weekFrequency} 天` : "暂无方案", "info"],
            [
              "方案状态",
              pending ? "待医师确认" : plan ? statusLabel(plan.status) : "等待生成",
              pending ? "warning" : plan ? "success" : "info",
            ],
          ]}
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <Badge label="确认闭环" icon={ShieldCheck} />
        <h3 className="mt-4 text-2xl font-black">方案确认前置状态</h3>
        <StatusList
          items={[
            ...prerequisiteState.items,
            [
              planPrerequisiteLabels.releasedTraining,
              trainingState.label,
              trainingState.tone,
            ],
          ]}
        />
        <p className="mt-4 font-bold leading-7 text-[#526b74]">
          {trainingState.description}
        </p>
      </GlassCard>
      {!plan && (
        <GlassCard className="md:col-span-2">
          <Badge label="待生成方案" icon={ClipboardCheck} />
          <h3 className="mt-4 text-2xl font-black">暂无可调整康复方案</h3>
          <p className="mt-3 font-bold leading-7 text-[#526b74]">
            请先让患者完成 AI 评估，并在“智能匹配”中生成推荐方案；系统返回待确认方案后，医师才能调整并下发。
          </p>
        </GlassCard>
      )}
      <PlanConfirmPanel
        key={plan?.id ?? "empty-plan"}
        plan={plan}
        pending={pending}
        isBusy={isBusy}
        onConfirmPlan={onConfirmPlan}
      />
      <GlassCard className="md:col-span-3">
        <h3 className="text-2xl font-black">训练项目安排</h3>
        <PlanRows plan={plan} />
      </GlassCard>
    </DashboardShell>
  );
}

function PlanConfirmPanel({
  plan,
  pending,
  isBusy,
  onConfirmPlan,
}: {
  plan?: RehabPlan;
  pending?: RehabPlan;
  isBusy: boolean;
  onConfirmPlan: (
    plan: RehabPlan,
    options: {
      dailyDuration: number;
      weekFrequency: number;
      adjustmentReason: string;
      itemAdjustments: Array<{
        gameContentId: string;
        durationMinutes: number;
        frequencyPerWeek: number;
        difficulty: string;
      }>;
    },
  ) => Promise<void>;
}) {
  const [dailyDuration, setDailyDuration] = useState(
    plan ? String(plan.dailyDuration) : "",
  );
  const [weekFrequency, setWeekFrequency] = useState(
    plan ? String(plan.weekFrequency) : "",
  );
  const [adjustmentReason, setAdjustmentReason] = useState(
    "",
  );

  const parsedDailyDuration = readNumber(dailyDuration, 0);
  const parsedWeekFrequency = readNumber(weekFrequency, 0);
  const canConfirm =
    Boolean(pending) &&
    parsedDailyDuration > 0 &&
    parsedWeekFrequency > 0 &&
    adjustmentReason.trim().length >= 6;

  function submitConfirm() {
    if (!pending || !canConfirm) return;
    void onConfirmPlan(pending, {
      dailyDuration: parsedDailyDuration,
      weekFrequency: parsedWeekFrequency,
      adjustmentReason: adjustmentReason.trim(),
      itemAdjustments: pending.items.map((item) => ({
        gameContentId: item.gameContentId,
        durationMinutes: item.durationMinutes,
        frequencyPerWeek: item.frequencyPerWeek,
        difficulty: item.difficulty,
      })),
    });
  }

  return (
    <GlassCard className="md:col-span-2">
      <h3 className="text-2xl font-black">医师调整</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <NumberField
          label="每日训练时长"
          value={dailyDuration}
          suffix="分钟"
          disabled={!pending}
          onChange={setDailyDuration}
        />
        <NumberField
          label="每周训练频次"
          value={weekFrequency}
          suffix="天"
          disabled={!pending}
          onChange={setWeekFrequency}
        />
        <FormBlock
          label="推荐来源"
          value={pending ? "AI 推荐待确认" : plan ? "当前生效方案" : "暂无方案"}
        />
        <FormBlock
          label="方案生成时间"
          value={formatDateTime(plan?.createdAt)}
        />
      </div>
      <div className="mt-4">
        <label className="text-sm font-black text-[#526b74]">调整原因</label>
        <textarea
          value={adjustmentReason}
          disabled={!pending}
          placeholder={
            pending
              ? "请填写确认或调整该方案的临床依据。"
              : "当前没有待确认方案。"
          }
          onChange={(event) => setAdjustmentReason(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-3xl border border-[#c9e3e7] bg-white/80 px-4 py-4 text-base font-bold leading-7 text-[#16333d] outline-none transition disabled:bg-slate-50 disabled:text-[#6a8088] focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
        />
        <p className="mt-2 text-sm font-bold text-[#6a8088]">
          确认后会结束旧当前方案，并将该方案设为患者端新的当前生效方案。
        </p>
      </div>
      <PrimaryButton
        className="mt-5 w-full"
        disabled={!canConfirm || isBusy}
        onClick={submitConfirm}
      >
        {isBusy
          ? "正在确认下发"
          : pending
            ? "确认并下发康复方案"
            : "暂无待确认方案"}
      </PrimaryButton>
    </GlassCard>
  );
}

function AdminScreen({
  dashboard,
  gameContents,
  gameContentCreateForm,
  onGameContentCreateFormChange,
  onCreateGameContent,
  onUpdateGameContentStatus,
  unityBuildForm,
  onUnityBuildFormChange,
  onUpdateUnityBuild,
  caregiverAccountForm,
  onCaregiverAccountFormChange,
  onCreateCaregiverAccount,
  isCreatingCaregiver,
  isCreatingGameContent,
  isUpdatingGameContentStatus,
  isUpdatingUnityBuild,
  canCreateCaregiver,
  canManageGames,
  canPublishGames,
}: {
  dashboard?: AdminDashboardResponse;
  gameContents?: GameContent[];
  gameContentCreateForm: GameContentCreateFormState;
  onGameContentCreateFormChange: <K extends keyof GameContentCreateFormState>(
    field: K,
    value: GameContentCreateFormState[K],
  ) => void;
  onCreateGameContent: (form: GameContentCreateFormState) => Promise<void>;
  onUpdateGameContentStatus: (
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) => Promise<void>;
  unityBuildForm: UnityBuildFormState;
  onUnityBuildFormChange: <K extends keyof UnityBuildFormState>(
    field: K,
    value: UnityBuildFormState[K],
  ) => void;
  onUpdateUnityBuild: (form: UnityBuildFormState) => Promise<void>;
  caregiverAccountForm: CaregiverAccountFormState;
  onCaregiverAccountFormChange: (
    field: keyof CaregiverAccountFormState,
    value: string,
  ) => void;
  onCreateCaregiverAccount: (
    form: CaregiverAccountFormState,
  ) => Promise<void>;
  isCreatingCaregiver: boolean;
  isCreatingGameContent: boolean;
  isUpdatingGameContentStatus: boolean;
  isUpdatingUnityBuild: boolean;
  canCreateCaregiver: boolean;
  canManageGames: boolean;
  canPublishGames: boolean;
}) {
  const riskRows = dashboard?.distributions.riskLevels ?? [];
  const planRows = dashboard?.distributions.planStatuses ?? [];
  const sessionRows = dashboard?.distributions.sessionStatuses ?? [];
  const qualityRows = dashboard?.distributions.qualityFlags ?? [];
  const actionRows = dashboard?.recentActions ?? [];
  const alertLogs =
    dashboard?.auditLogs.filter((log) => log.result !== "success") ?? [];
  const games = gameContents;

  return (
    <DashboardShell title="运营概览与训练内容管理" role="运营管理">
      <AdminOperationsPanel dashboard={dashboard} gameContents={games} />
      <MetricCard
        value={dashboardMetric(dashboard, dashboard?.metrics.patients)}
        label="患者档案"
        icon={FileText}
      />
      <MetricCard
        value={dashboardMetric(dashboard, dashboard?.metrics.pendingPlans)}
        label="待确认方案"
        icon={ClipboardCheck}
      />
      <MetricCard
        value={dashboardMetric(dashboard, dashboard?.metrics.abnormalResults)}
        label="异常训练结果"
        icon={Radar}
      />
      <MetricCard
        value={dashboardMetric(dashboard, dashboard?.overview.consentRecords)}
        label="授权留痕"
        icon={ShieldCheck}
      />
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">认知风险分布</h3>
        <DashboardBars
          rows={riskRows}
          labels={{
            low: "低风险",
            moderate: "中度风险",
            high: "高风险",
          }}
          emptyText="完成 AI 评估后展示风险分布"
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">康复方案状态</h3>
        <DashboardBars
          rows={planRows}
          labels={{
            draft: "草稿",
            pending_confirm: "待确认",
            active: "生效中",
            paused: "已暂停",
            ended: "已结束",
          }}
          emptyText="生成康复方案后展示状态分布"
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">训练质量监测</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FormBlock
            label="平均得分"
            value={formatNullableNumber(dashboard?.quality.averageScore, "分")}
          />
          <FormBlock
            label="平均完成率"
            value={formatNullablePercent(dashboard?.quality.averageCompletionRate)}
          />
          <FormBlock
            label="平均动作准确率"
            value={formatNullablePercent(dashboard?.quality.averageMotionAccuracy)}
          />
          <FormBlock
            label="平均反应时间"
            value={formatNullableNumber(
              dashboard?.quality.averageReactionTimeMs,
              "ms",
            )}
          />
        </div>
        <DashboardBars
          rows={qualityRows}
          labels={{ valid: "有效数据", suspicious: "可疑数据" }}
          emptyText="训练结果回传后展示质量标记"
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">设备与训练状态</h3>
        <StatusList
          items={[
            [
              "设备总数",
              dashboardMetric(dashboard, dashboard?.devices.total, "台"),
              dashboard?.devices.total ? "success" : "info",
            ],
            [
              "在线设备",
              dashboardMetric(dashboard, dashboard?.devices.online, "台"),
              dashboard?.devices.online ? "success" : "info",
            ],
            [
              "今日训练",
              dashboardMetric(dashboard, dashboard?.overview.todayTrainings, "次"),
              dashboard?.overview.todayTrainings ? "success" : "info",
            ],
            [
              "已完成训练",
              dashboardMetric(
                dashboard,
                dashboard?.overview.completedTrainings,
                "次",
              ),
              dashboard?.overview.completedTrainings ? "success" : "info",
            ],
          ]}
        />
        <DashboardBars
          rows={sessionRows}
          labels={{
            started: "已创建",
            in_progress: "训练中",
            completed: "已完成",
            interrupted: "已中断",
            upload_failed: "上传失败",
          }}
          emptyText="训练开始后展示会话状态"
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">近期审计动作统计</h3>
        <DashboardBars
          rows={actionRows.map((row) => ({ key: row.action, count: row.count }))}
          labels={auditActionLabels}
          emptyText="产生审计日志后展示动作分布"
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">最近风险事件</h3>
        <StatusList
          items={
            alertLogs.length
              ? alertLogs.slice(0, 4).map((log) => [
                  auditResultLabel(log.result),
                  `${auditActionLabel(log.action)} · ${targetTypeLabel(
                    log.targetType,
                  )}`,
                  log.result === "denied" ? "danger" : "warning",
                ])
              : [["当前查询范围", "暂无失败或拒绝记录", "success"]]
          }
        />
      </GlassCard>
      <CaregiverAccountCreatePanel
        form={caregiverAccountForm}
        onChange={onCaregiverAccountFormChange}
        onCreateCaregiverAccount={onCreateCaregiverAccount}
        isBusy={isCreatingCaregiver}
        canCreateCaregiver={canCreateCaregiver}
      />
      <GameContentCreatePanel
        form={gameContentCreateForm}
        onChange={onGameContentCreateFormChange}
        onCreateGameContent={onCreateGameContent}
        isBusy={isCreatingGameContent}
        canManageGames={canManageGames}
        canPublishGames={canPublishGames}
      />
      <AdminTrainingContentReadinessPanel gameContents={gameContents} />
      <UnityBuildManagementPanel
        gameContents={gameContents}
        form={unityBuildForm}
        onChange={onUnityBuildFormChange}
        onUpdateUnityBuild={onUpdateUnityBuild}
        onUpdateGameContentStatus={onUpdateGameContentStatus}
        isBusy={isUpdatingUnityBuild}
        isUpdatingStatus={isUpdatingGameContentStatus}
        canManageGames={canManageGames}
        canPublishGames={canPublishGames}
      />
    </DashboardShell>
  );
}

function AdminOperationsPanel({
  dashboard,
  gameContents,
}: {
  dashboard?: AdminDashboardResponse;
  gameContents?: GameContent[];
}) {
  const pendingGames = gameContents?.filter(
    (game) => game.status !== "active" || game.buildStatus !== "released",
  );
  const deniedAudits = dashboard?.overview.deniedAudits;
  const failedAudits = dashboard?.overview.failedAudits;
  const items: Array<[string, string, StatusTone]> = [
    [
      "待确认方案",
      dashboardMetric(dashboard, dashboard?.metrics.pendingPlans, "个"),
      dashboard?.metrics.pendingPlans ? "warning" : "success",
    ],
    [
      "异常训练结果",
      dashboardMetric(dashboard, dashboard?.metrics.abnormalResults, "条"),
      dashboard?.metrics.abnormalResults ? "danger" : "success",
    ],
    [
      "拒绝访问",
      dashboardMetric(dashboard, deniedAudits, "条"),
      deniedAudits ? "danger" : "success",
    ],
    [
      "失败操作",
      dashboardMetric(dashboard, failedAudits, "条"),
      failedAudits ? "warning" : "success",
    ],
    [
      "待处理训练内容",
      pendingGames ? `${pendingGames.length} 个` : "暂无内容数据",
      pendingGames?.length ? "warning" : pendingGames ? "success" : "info",
    ],
  ];

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="运营待办" icon={ClipboardCheck} />
          <h3 className="mt-4 text-2xl font-black">今日需要处理的事项</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            这里只展示当前已获取的待办、异常、审计和内容发布状态，便于运营优先处理影响训练闭环的事项。
          </p>
        </div>
        <Chip tone={items.some(([, , tone]) => tone === "danger" || tone === "warning") ? "warning" : "success"}>
          {dashboard ? "运营数据已更新" : "暂无运营数据"}
        </Chip>
      </div>
      <StatusList items={items} />
    </GlassCard>
  );
}

function CaregiverAccountCreatePanel({
  form,
  onChange,
  onCreateCaregiverAccount,
  isBusy,
  canCreateCaregiver,
}: {
  form: CaregiverAccountFormState;
  onChange: (field: keyof CaregiverAccountFormState, value: string) => void;
  onCreateCaregiverAccount: (
    form: CaregiverAccountFormState,
  ) => Promise<void>;
  isBusy: boolean;
  canCreateCaregiver: boolean;
}) {
  const canSubmit =
    canCreateCaregiver && isCaregiverAccountFormComplete(form);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onCreateCaregiverAccount(form);
  }

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="家属账号管理" icon={UsersRound} />
          <h3 className="mt-4 text-2xl font-black">新建待授权家属账号</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            管理员只负责创建家属登录账号。患者本人签署家属共享授权并绑定该账号后，系统才会生成家属角色和可访问的数据范围。
          </p>
        </div>
        <Chip tone={canCreateCaregiver ? "warning" : "muted"}>
          {canCreateCaregiver ? "只建账号，不自动授权" : "当前角色只读"}
        </Chip>
      </div>
      {!canCreateCaregiver && (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 font-bold leading-7 text-amber-800">
          当前账号没有家属账号创建权限。当前账号仅可查看运营概览与审计日志，不能新建账号。
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset
          disabled={!canCreateCaregiver || isBusy}
          className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-4"
        >
          <FieldLine
            label="家属登录账号"
            value={form.account}
            onChange={(value) => onChange("account", value)}
          />
          <FieldLine
            label="家属初始密码"
            type="password"
            value={form.initialPassword}
            onChange={(value) => onChange("initialPassword", value)}
          />
          <FieldLine
            label="家属姓名"
            value={form.displayName}
            onChange={(value) => onChange("displayName", value)}
          />
          <FieldLine
            label="家属手机号"
            value={form.mobilePhone}
            onChange={(value) => onChange("mobilePhone", value)}
          />
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#c9e3e7] bg-[#e9f8f6]/80 p-5">
          <div className="max-w-3xl">
            <p className="font-bold leading-7 text-[#526b74]">
              账号创建后还不能直接进入家属端，因为没有任何患者授权范围。请让患者登录后在“建档授权”页输入该账号完成绑定。
            </p>
            <p className="mt-2 text-sm font-black text-[#25859a]">
              账号创建操作会记录到审计日志，便于运营追溯。
            </p>
          </div>
          <PrimaryButton disabled={!canSubmit || isBusy} type="submit">
            {isBusy
              ? "正在创建家属"
              : canCreateCaregiver
                ? "创建家属账号"
                : "无创建权限"}
          </PrimaryButton>
        </div>
      </form>
    </GlassCard>
  );
}

function AdminTrainingContentReadinessPanel({
  gameContents,
}: {
  gameContents?: GameContent[];
}) {
  const releasedGames = gameContents?.filter(isReleasedGameContent);
  const pendingGames = gameContents?.filter(
    (game) => !isReleasedGameContent(game),
  );

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="方案匹配前置" icon={WandSparkles} />
          <h3 className="mt-4 text-2xl font-black">正式训练内容发布状态</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            推荐方案只能引用已启用且资源已发布的正式训练内容。这里仅展示当前管理端实际获取到的内容状态。
          </p>
        </div>
        <Chip
          tone={
            releasedGames?.length
              ? "success"
              : gameContents
                ? "warning"
                : "info"
          }
        >
          {releasedGames
            ? releasedGames.length
              ? "已有正式训练内容"
              : "暂无已发布正式内容"
            : "待采集内容状态"}
        </Chip>
      </div>
      <StatusList
        items={[
          [
            planPrerequisiteLabels.releasedTraining,
            releasedGames
              ? releasedGames.length
                ? `${releasedGames.length} 个可用于方案匹配`
                : "暂无"
              : "待采集",
            releasedGames?.length ? "success" : "warning",
          ],
          [
            "待处理训练内容",
            pendingGames
              ? pendingGames.length
                ? `${pendingGames.length} 个待发布或启用`
                : "暂无"
              : "待采集",
            pendingGames?.length ? "warning" : pendingGames ? "success" : "info",
          ],
        ]}
      />
    </GlassCard>
  );
}

function GameContentCreatePanel({
  form,
  onChange,
  onCreateGameContent,
  isBusy,
  canManageGames,
  canPublishGames,
}: {
  form: GameContentCreateFormState;
  onChange: <K extends keyof GameContentCreateFormState>(
    field: K,
    value: GameContentCreateFormState[K],
  ) => void;
  onCreateGameContent: (form: GameContentCreateFormState) => Promise<void>;
  isBusy: boolean;
  canManageGames: boolean;
  canPublishGames: boolean;
}) {
  const isBrowserPose = form.runtimeType === "browser_pose_game";
  const canSubmit =
    canManageGames &&
    (!isBrowserPose || canPublishGames) &&
    form.code.trim().length > 0 &&
    form.name.trim().length > 0 &&
    (!isBrowserPose || form.gameVersion.trim().length > 0) &&
    form.trainingTargetsText.trim().length > 0 &&
    form.tagsText.trim().length > 0 &&
    form.defaultDuration.trim().length > 0 &&
    form.defaultDifficulty.trim().length > 0 &&
    form.supportsCamera !== "" &&
    form.supportsMicrophone !== "" &&
    form.supportedInputModesText.trim().length > 0 &&
    form.requiredMetricsText.trim().length > 0 &&
    (!isBrowserPose ||
      browserPoseGameRequiredMetrics.every((metricType) =>
        requiredMetricsInclude(parseJsonOrUndefined(form.requiredMetricsText), metricType),
      ));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onCreateGameContent(form);
  }

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="训练内容管理" icon={Gamepad2} />
          <h3 className="mt-4 text-2xl font-black">新建训练内容</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            Unity 内容创建后继续上传资源；浏览器体感内容会在指标校验通过后直接发布为平台内置训练项目。
          </p>
        </div>
        <Chip tone={canManageGames ? "warning" : "muted"}>
          {canManageGames
            ? isBrowserPose
              ? "可直接发布体感训练"
              : "创建后待完善资源"
            : "当前角色只读"}
        </Chip>
      </div>
      {!canManageGames && (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 font-bold leading-7 text-amber-800">
          当前账号没有训练内容管理权限。只读账号可以查看内容信息，但不能创建、启用或下架训练内容。
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset
          disabled={!canManageGames || isBusy}
          className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-4"
        >
          <FieldLine
            label="游戏编码（唯一）"
            value={form.code}
            onChange={(value) => onChange("code", value)}
          />
          <FieldLine
            label="训练内容名称"
            value={form.name}
            onChange={(value) => onChange("name", value)}
          />
          <SelectField
            label="训练运行方式"
            value={form.runtimeType}
            onChange={(value) =>
              onChange("runtimeType", value as GameContentCreateFormState["runtimeType"])
            }
            options={[
              ["unity_webgl", "Unity WebGL"],
              ["browser_pose_game", "浏览器体感"],
            ]}
          />
          <FieldLine
            label={isBrowserPose ? "训练版本号" : "训练版本号（发布时填写）"}
            value={form.gameVersion}
            onChange={(value) => onChange("gameVersion", value)}
          />
          <FieldLine
            label="默认时长（分钟）"
            type="number"
            value={form.defaultDuration}
            onChange={(value) => onChange("defaultDuration", value)}
          />
          <FieldLine
            label="默认难度"
            value={form.defaultDifficulty}
            onChange={(value) => onChange("defaultDifficulty", value)}
          />
          <FieldLine
            label="训练目标"
            value={form.trainingTargetsText}
            onChange={(value) => onChange("trainingTargetsText", value)}
          />
          <FieldLine
            label="适用标签"
            value={form.tagsText}
            onChange={(value) => onChange("tagsText", value)}
          />
          <SelectField
            label="是否需要摄像头"
            value={form.supportsCamera}
            onChange={(value) =>
              onChange(
                "supportsCamera",
                value as GameContentCreateFormState["supportsCamera"],
              )
            }
            options={[
              ["", "请选择"],
              ["true", "是"],
              ["false", "否"],
            ]}
          />
          <SelectField
            label="是否需要麦克风"
            value={form.supportsMicrophone}
            onChange={(value) =>
              onChange(
                "supportsMicrophone",
                value as GameContentCreateFormState["supportsMicrophone"],
              )
            }
            options={[
              ["", "请选择"],
              ["true", "是"],
              ["false", "否"],
            ]}
          />
        </fieldset>
        <div className="grid gap-x-4 md:grid-cols-2">
          <TrainingInputModePicker
            label="训练采集方式"
            value={form.supportedInputModesText}
            onChange={(value) => onChange("supportedInputModesText", value)}
          />
          <TextAreaField
            label="训练结果指标配置"
            value={form.requiredMetricsText}
            onChange={(value) => onChange("requiredMetricsText", value)}
          />
          <p className="mt-2 text-sm font-bold leading-6 text-[#6a8088] md:col-span-2">
            浏览器体感必须包含 reaction_time_ms、target_hit_rate、pose_visibility_avg、arm_raise_accuracy 四项正式动作指标。
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#c9e3e7] bg-[#e9f8f6]/80 p-5">
          <div className="max-w-3xl">
            <p className="font-bold leading-7 text-[#526b74]">
              {isBrowserPose
                ? "浏览器体感内容创建成功后将立即进入已发布状态，可用于评估后的方案推荐。"
                : "Unity 内容创建成功后处于启用状态，但训练资源仍需配置。患者端只有在资源发布后才能开始训练。"}
            </p>
            {isBrowserPose && !canPublishGames ? (
              <p className="mt-2 font-bold text-rose-700">
                当前账号没有训练发布权限，不能创建已发布的浏览器体感内容。
              </p>
            ) : null}
            <p className="mt-2 text-sm font-black text-[#25859a]">
              创建操作会记录到审计日志。
            </p>
          </div>
          <PrimaryButton disabled={!canSubmit || isBusy} type="submit">
            {isBusy
              ? "正在创建训练内容"
              : canManageGames
                ? "创建训练内容"
                : "无创建权限"}
          </PrimaryButton>
        </div>
      </form>
    </GlassCard>
  );
}

function UnityBuildManagementPanel({
  gameContents,
  form,
  onChange,
  onUpdateUnityBuild,
  onUpdateGameContentStatus,
  isBusy,
  isUpdatingStatus,
  canManageGames,
  canPublishGames,
}: {
  gameContents?: GameContent[];
  form: UnityBuildFormState;
  onChange: <K extends keyof UnityBuildFormState>(
    field: K,
    value: UnityBuildFormState[K],
  ) => void;
  onUpdateUnityBuild: (form: UnityBuildFormState) => Promise<void>;
  onUpdateGameContentStatus: (
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) => Promise<void>;
  isBusy: boolean;
  isUpdatingStatus: boolean;
  canManageGames: boolean;
  canPublishGames: boolean;
}) {
  const games = gameContents ?? [];
  const configurableGames = games.filter((game) => game.runtimeType === "unity_webgl");
  const selectedGame = configurableGames.find((game) => game.id === form.gameContentId);
  const selectedGameIsConfigurable = Boolean(selectedGame);
  const requiredMetricsConfigured = isJsonArrayText(form.requiredMetricsText);
  const releaseRequirementsMet =
    form.buildStatus !== "released" ||
    (form.manifestUrl.trim().length > 0 &&
      form.buildBaseUrl.trim().length > 0 &&
      form.releaseChannel === "production" &&
      requiredMetricsConfigured);
  const canSubmit =
    canManageGames &&
    selectedGameIsConfigurable &&
    form.gameVersion.trim().length > 0 &&
    form.bridgeProtocolVersion === "1.0.0" &&
    releaseRequirementsMet;
  const isPublishing = form.buildStatus === "released";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onUpdateUnityBuild(form);
  }

  return (
    <GlassCard className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="训练资源管理" icon={Gamepad2} />
          <h3 className="mt-4 text-2xl font-black">训练资源发布配置</h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
            这里维护训练资源、版本、采集方式和结果指标。只有已发布内容才能用于患者训练。
          </p>
        </div>
        <Chip tone={canManageGames ? "warning" : "muted"}>
          {canManageGames
            ? canPublishGames
              ? "可维护并发布"
              : "可维护，暂无发布权限"
            : "当前角色只读"}
        </Chip>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid gap-3">
          {games.length ? (
            games.map((game) => {
              const isConfigurable = game.runtimeType === "unity_webgl";
              return (
              <div
                key={game.id}
                className={cn(
                  "rounded-3xl border p-4 text-left transition",
                  form.gameContentId === game.id
                    ? "border-[#1f7a8c] bg-[#e9f8f6] shadow-lg shadow-cyan-900/10"
                    : "border-[#c9e3e7] bg-white/70 hover:border-[#63bfd0]",
                )}
              >
                <button
                  type="button"
                  disabled={!isConfigurable}
                  onClick={() => onChange("gameContentId", game.id)}
                  className="w-full text-left disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xl font-black">{game.name}</strong>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Chip tone={gameStatusTone(game.status)}>
                        {gameContentStatusLabel(game.status)}
                      </Chip>
                      <Chip tone={game.buildStatus === "released" ? "success" : "warning"}>
                        {gameBuildStatusLabel(game.buildStatus)}
                      </Chip>
                      <Chip tone={isConfigurable ? "info" : "muted"}>
                        {trainingRuntimeLabel(game.runtimeType)}
                      </Chip>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[#526b74]">
                    内容标识 {game.code} · {game.gameVersion ? `版本 ${game.gameVersion}` : "暂无版本"}
                  </p>
                  <p className="mt-2 text-sm font-bold text-[#6a8088]">
                    {game.manifestUrl ? "训练资源已配置" : "训练资源未配置"}
                    · {trainingInputModesLabel(game.supportedInputModes)}
                  </p>
                  {!isConfigurable ? (
                    <p className="mt-2 rounded-2xl border border-[#d7e8ec] bg-white/60 px-3 py-2 text-sm font-bold text-[#6a8088]">
                      该内容使用平台内置体感采集，不需要上传独立训练资源。
                    </p>
                  ) : null}
                </button>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={!canManageGames || isUpdatingStatus || game.status === "active"}
                    onClick={() => void onUpdateGameContentStatus(game.id, "active")}
                    className="min-h-11 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    启用
                  </button>
                  <button
                    type="button"
                    disabled={!canManageGames || isUpdatingStatus || game.status === "inactive"}
                    onClick={() => void onUpdateGameContentStatus(game.id, "inactive")}
                    className="min-h-11 rounded-2xl border border-amber-200 bg-amber-50 px-3 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下架
                  </button>
                  <button
                    type="button"
                    disabled={!canManageGames || isUpdatingStatus || game.status === "archived"}
                    onClick={() => void onUpdateGameContentStatus(game.id, "archived")}
                    className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    归档
                  </button>
                </div>
              </div>
              );
            })
          ) : (
            <div className="rounded-3xl border border-dashed border-[#c9e3e7] bg-white/60 p-6 font-bold text-[#6a8088]">
              暂无训练内容。请先创建训练内容。
            </div>
          )}
        </div>
        <form onSubmit={submit} className="rounded-[30px] border border-[#c9e3e7] bg-white/70 p-5">
          <fieldset disabled={!canManageGames || isBusy || !selectedGame} className="disabled:opacity-60">
            <div className="grid gap-x-4 md:grid-cols-2">
              <FieldLine
                label="训练资源地址"
                value={form.manifestUrl}
                onChange={(value) => onChange("manifestUrl", value)}
              />
              <FieldLine
                label="资源文件目录"
                value={form.buildBaseUrl}
                onChange={(value) => onChange("buildBaseUrl", value)}
              />
              <FieldLine
                label="训练资源版本"
                value={form.gameVersion}
                onChange={(value) => onChange("gameVersion", value)}
              />
              <SelectField
                label="资源状态"
                value={form.buildStatus}
                onChange={(value) =>
                  onChange(
                    "buildStatus",
                    value as UpdateUnityBuildRequest["buildStatus"],
                  )
                }
                options={[
                  ["pending_assets", "待上传资源"],
                  ["validating", "校验中"],
                  ["released", "已发布"],
                  ["rejected", "已驳回"],
                ]}
              />
              <SelectField
                label="发布通道"
                value={form.releaseChannel}
                onChange={(value) =>
                  onChange(
                    "releaseChannel",
                    value as UpdateUnityBuildRequest["releaseChannel"],
                  )
                }
                options={[
                  ["development", "内部测试"],
                  ["staging", "验收测试"],
                  ["production", "正式使用"],
                ]}
              />
              <SelectField
                label="结果数据版本"
                value={form.bridgeProtocolVersion}
                onChange={() => onChange("bridgeProtocolVersion", "1.0.0")}
                options={[["1.0.0", "1.0.0"]]}
              />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <CheckLine
                label="需要摄像头体感采集"
                checked={form.supportsCamera}
                onChange={(value) => onChange("supportsCamera", value)}
              />
              <CheckLine
                label="需要麦克风采集"
                checked={form.supportsMicrophone}
                onChange={(value) => onChange("supportsMicrophone", value)}
              />
            </div>
            <TrainingInputModePicker
              label="训练采集方式"
              value={form.supportedInputModesText}
              onChange={(value) => onChange("supportedInputModesText", value)}
            />
            <TextAreaField
              label="训练结果指标配置"
              value={form.requiredMetricsText}
              onChange={(value) => onChange("requiredMetricsText", value)}
            />
            <p className="mt-2 text-sm font-bold leading-6 text-[#6a8088]">
              按指标模板填写训练结果指标；发布时必须配置训练资源地址、资源文件目录、正式使用通道和非空指标。
            </p>
          </fieldset>
          <div className="mt-5 rounded-3xl border border-[#c9e3e7] bg-[#eefaf7] p-4">
            <p className="font-bold leading-7 text-[#526b74]">
              发布为已发布时，平台会校验训练资源地址、正式使用通道、体感采集方式和训练指标配置。
            </p>
            {isPublishing && !canPublishGames ? (
              <p className="mt-2 font-bold text-rose-700">
                当前账号没有发布权限，不能发布训练资源。
              </p>
            ) : null}
            {isPublishing && canPublishGames && !releaseRequirementsMet ? (
              <p className="mt-2 font-bold text-amber-800">
                发布前请补齐训练资源地址、资源文件目录、正式使用通道和训练指标配置。
              </p>
            ) : null}
            <PrimaryButton
              className="mt-4 w-full bg-[#173945] hover:bg-[#1f7a8c]"
              disabled={!canSubmit || isBusy || (isPublishing && !canPublishGames)}
              type="submit"
            >
              {isBusy ? "正在保存配置" : isPublishing ? "发布训练资源" : "保存资源配置"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </GlassCard>
  );
}

function SecurityScreen({
  auditLogs,
  filters,
  exportForm,
  onFiltersChange,
  onExportFormChange,
  onRefreshAuditLogs,
  onExportData,
  isLoading,
  isExporting,
  canReadAuditLogs,
  canExportData,
}: {
  auditLogs?: AuditLog[];
  filters: AuditLogFilters;
  exportForm: DataExportFormState;
  onFiltersChange: (
    field: keyof AuditLogFilters,
    value: AuditLogFilters[keyof AuditLogFilters],
  ) => void;
  onExportFormChange: (
    field: keyof DataExportFormState,
    value: DataExportFormState[keyof DataExportFormState],
  ) => void;
  onRefreshAuditLogs: (filters: AuditLogFilters) => Promise<void>;
  onExportData: (form: DataExportFormState) => Promise<void>;
  isLoading: boolean;
  isExporting: boolean;
  canReadAuditLogs: boolean;
  canExportData: boolean;
}) {
  const logs = auditLogs ?? [];
  const successCount = logs.filter((log) => log.result === "success").length;
  const deniedCount = logs.filter((log) => log.result === "denied").length;
  const failedCount = logs.filter((log) => log.result === "failed").length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || !canReadAuditLogs) return;
    void onRefreshAuditLogs(filters);
  }

  function submitExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExporting || !canExportData) return;
    void onExportData(exportForm);
  }

  return (
    <DashboardShell title="权限、脱敏与审计" role="运营管理">
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">分级访问控制</h3>
        <StatusList
          items={[
            ["平台管理人员", "账号、权限、审计、配置管理", "info"],
            ["普通运营", "查看脱敏数据，维护内容与设备", "info"],
            ["审计查看人员", "仅查看日志，不可修改业务数据", "info"],
          ]}
        />
      </GlassCard>
      <GlassCard className="md:col-span-2">
        <h3 className="text-2xl font-black">隐私保护状态</h3>
        <StatusList
          items={[
            ["敏感字段", "姓名、联系方式、健康指标纳入保护范围", "info"],
            ["授权留痕", "隐私协议、AI处理、摄像头、家属共享逐项记录", "info"],
            ["导出要求", "导出时按角色做身份信息脱敏", "warning"],
            ["审计追踪", "访问、修改、导出操作写入审计日志", "success"],
          ]}
        />
      </GlassCard>
      <MetricCard value={String(logs.length)} label="本次查询记录数" icon={History} />
      <MetricCard value={String(successCount)} label="成功操作" icon={BadgeCheck} />
      <MetricCard value={String(deniedCount)} label="拒绝访问" icon={ShieldCheck} />
      <MetricCard value={String(failedCount)} label="失败操作" icon={Radar} />
      <GlassCard className="md:col-span-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge label="脱敏数据导出" icon={Download} />
            <h3 className="mt-4 text-2xl font-black">脱敏数据导出</h3>
            <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
              平台会生成脱敏 CSV 文件，姓名、联系方式、档案编号、记录编号等标识信息
              将统一脱敏或伪匿名化。原始健康指标、AI 转写、动作原始摘要和授权证据快照不会进入文件。
            </p>
          </div>
          <Chip tone={canExportData ? "success" : "muted"}>
            {canExportData ? "成功导出必审计" : "当前角色不可导出"}
          </Chip>
        </div>
        {!canExportData && (
          <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 font-bold leading-7 text-amber-800">
            当前账号没有脱敏数据导出权限。审计查看人员只能查看审计日志，不能导出业务数据。
          </div>
        )}
        <form onSubmit={submitExport}>
          <fieldset
            disabled={!canExportData || isExporting}
            className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-4"
          >
            <SelectField
              label="数据类型"
              value={exportForm.dataset}
              onChange={(value) =>
                onExportFormChange("dataset", value as ExportDataset)
              }
              options={[
                ["patients", "患者档案"],
                ["assessments", "AI评估记录"],
                ["training-records", "训练记录"],
                ["consents", "授权记录"],
                ["audit-logs", "审计日志"],
              ]}
            />
            <SelectField
              label="风险等级"
              value={exportForm.riskLevel ?? "all"}
              onChange={(value) =>
                onExportFormChange(
                  "riskLevel",
                  value as DataExportRequest["riskLevel"],
                )
              }
              options={[
                ["all", "全部风险"],
                ["low", "低风险"],
                ["moderate", "中风险"],
                ["high", "高风险"],
              ]}
            />
            <FieldLine
              label="患者档案编号（可选）"
              value={exportForm.patientId}
              onChange={(value) => onExportFormChange("patientId", value)}
            />
            <SelectField
              label="训练数据质量"
              value={exportForm.qualityFlag || "all"}
              onChange={(value) =>
                onExportFormChange(
                  "qualityFlag",
                  value === "all" ? "" : value,
                )
              }
              options={[
                ["all", "全部质量"],
                ["valid", "有效数据"],
                ["suspicious", "可疑数据"],
              ]}
            />
            <FieldLine
              label="开始时间"
              type="datetime-local"
              value={exportForm.dateFrom}
              onChange={(value) => onExportFormChange("dateFrom", value)}
            />
            <FieldLine
              label="结束时间"
              type="datetime-local"
              value={exportForm.dateTo}
              onChange={(value) => onExportFormChange("dateTo", value)}
            />
            <FieldLine
              label="导出条数"
              type="number"
              value={exportForm.limit}
              onChange={(value) => onExportFormChange("limit", value)}
            />
            <FieldLine
              label="导出原因（必填）"
              value={exportForm.reason}
              onChange={(value) => onExportFormChange("reason", value)}
            />
          </fieldset>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#c9e3e7] bg-[linear-gradient(135deg,rgba(232,248,248,0.92),rgba(255,255,255,0.72))] p-5">
            <div className="max-w-3xl">
              <p className="font-bold leading-7 text-[#526b74]">
                文件格式：CSV。导出操作会记录到审计日志，下载文件不在浏览器缓存中保留。
              </p>
              <p className="mt-2 text-sm font-black text-[#25859a]">
                导出文件统一由平台脱敏流程生成，确保符合数据保护要求。
              </p>
            </div>
            <PrimaryButton disabled={!canExportData || isExporting} type="submit">
              {isExporting
                ? "正在生成导出"
                : canExportData
                  ? "生成脱敏 CSV"
                  : "无导出权限"}
            </PrimaryButton>
          </div>
        </form>
      </GlassCard>
      <GlassCard className="md:col-span-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge label="审计查询" icon={Radar} />
            <h3 className="mt-4 text-2xl font-black">审计日志筛选</h3>
            <p className="mt-2 max-w-3xl font-bold leading-7 text-[#526b74]">
              按操作者、角色、动作、业务对象和时间范围追溯关键操作记录。
            </p>
          </div>
          <Chip tone={canReadAuditLogs ? "info" : "muted"}>
            {canReadAuditLogs ? "单次查询上限 200 条" : "当前角色不可查询"}
          </Chip>
        </div>
        {!canReadAuditLogs && (
          <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 font-bold leading-7 text-amber-800">
            当前账号没有审计日志查询权限。普通运营可以查看运营概览和执行脱敏导出，但不能查看审计日志明细。
          </div>
        )}
        <form onSubmit={submit}>
          <fieldset
            disabled={!canReadAuditLogs || isLoading}
            className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-4"
          >
            <SelectField
              label="结果"
              value={filters.result ?? "all"}
              onChange={(value) =>
                onFiltersChange("result", value as AuditLogFilters["result"])
              }
              options={[
                ["all", "全部结果"],
                ["success", "成功"],
                ["denied", "拒绝"],
                ["failed", "失败"],
              ]}
            />
            <SelectField
              label="操作者角色"
              value={filters.actorRole ?? "all"}
              onChange={(value) =>
                onFiltersChange(
                  "actorRole",
                  value as AuditLogFilters["actorRole"],
                )
              }
              options={auditActorRoleOptions}
            />
            <SelectField
              label="动作"
              value={filters.action ?? ""}
              onChange={(value) => onFiltersChange("action", value)}
              options={auditActionOptions}
            />
            <SelectField
              label="目标类型"
              value={filters.targetType ?? ""}
              onChange={(value) => onFiltersChange("targetType", value)}
              options={auditTargetTypeOptions}
            />
            <FieldLine
              label="操作者账号"
              value={filters.actorAccount ?? ""}
              onChange={(value) => onFiltersChange("actorAccount", value)}
            />
            <FieldLine
              label="对象编号 / 档案或记录编号"
              value={filters.targetId ?? ""}
              onChange={(value) => onFiltersChange("targetId", value)}
            />
            <FieldLine
              label="开始时间"
              type="datetime-local"
              value={filters.dateFrom ?? ""}
              onChange={(value) => onFiltersChange("dateFrom", value)}
            />
            <FieldLine
              label="结束时间"
              type="datetime-local"
              value={filters.dateTo ?? ""}
              onChange={(value) => onFiltersChange("dateTo", value)}
            />
            <FieldLine
              label="返回条数"
              type="number"
              value={String(filters.limit ?? "")}
              onChange={(value) =>
                onFiltersChange("limit", value ? Number(value) : undefined)
              }
            />
          </fieldset>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#c9e3e7] bg-[#e9f8f6]/80 p-5">
            <p className="max-w-3xl font-bold leading-7 text-[#526b74]">
              用于追溯登录、建档、授权、训练采集、拒绝访问等关键操作。未填写的条件不参与筛选。
            </p>
            <PrimaryButton disabled={!canReadAuditLogs || isLoading} type="submit">
              {isLoading
                ? "正在查询审计日志"
                : canReadAuditLogs
                  ? "查询审计日志"
                  : "无查询权限"}
            </PrimaryButton>
          </div>
        </form>
      </GlassCard>
      <GlassCard className="md:col-span-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black">审计日志列表</h3>
            <p className="mt-2 font-bold text-[#6a8088]">
              展示本次查询返回的审计记录，包含操作者、动作、目标、结果和时间。
            </p>
          </div>
          <Chip tone={deniedCount || failedCount ? "warning" : "success"}>
            {deniedCount + failedCount} 条需关注
          </Chip>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#c9e3e7]">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[1.1fr_1.1fr_1.4fr_1.1fr_0.8fr] gap-3 border-b border-[#d7e8ec] bg-[#e8f8f8]/80 p-4 text-xs font-black uppercase tracking-[0.18em] text-[#25859a]">
              <span>时间</span>
              <span>操作者</span>
              <span>动作</span>
              <span>目标</span>
              <span>结果</span>
            </div>
            {logs.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-[1.1fr_1.1fr_1.4fr_1.1fr_0.8fr] gap-3 border-b border-[#e1edf0] bg-white/70 p-4 text-sm font-bold last:border-b-0"
              >
                <span>{formatDateTime(log.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block truncate">
                    {log.actor?.displayName ??
                      roleLabel(log.actorRole ?? undefined) ??
                      "系统"}
                  </span>
                  {log.actor?.account && (
                    <span className="mt-1 block truncate font-mono text-xs text-[#6a8088]">
                      {log.actor.account}
                    </span>
                  )}
                </span>
                <span>{auditActionLabel(log.action)}</span>
                <span>
                  {targetTypeLabel(log.targetType)}
                  {log.targetId ? ` · ${shortId(log.targetId)}` : ""}
                </span>
                <span>
                  <Chip tone={auditTone(log.result)}>
                    {auditResultLabel(log.result)}
                  </Chip>
                </span>
              </div>
            ))}
            {!logs.length && (
              <div className="bg-white/70 p-6 text-center font-bold text-[#6a8088]">
                当前筛选条件下没有审计日志，请调整条件后重新查询。
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </DashboardShell>
  );
}

function ScreenGrid({
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_390px]">
      <div>
        <p className="text-xs font-black uppercase text-[#25859a]">{eyebrow}</p>
        <h2 className="mt-2 text-4xl font-black md:text-5xl">{title}</h2>
        <p className="mt-4 max-w-3xl text-lg font-bold leading-8 text-[#526b74]">
          {subtitle}
        </p>
        <div className="mt-8">{children}</div>
      </div>
      <aside>{aside}</aside>
    </div>
  );
}

function DashboardShell({
  title,
  role,
  children,
}: {
  title: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-[#25859a]">{role}</p>
      <h2 className="mt-2 text-4xl font-black">{title}</h2>
      <div className="mt-8 grid gap-5 md:grid-cols-4">{children}</div>
    </div>
  );
}

function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/70 bg-white/65 p-5 shadow-[0_18px_60px_rgba(22,51,61,0.1)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MetricCard({
  value,
  label,
  icon: Icon,
  dark,
}: {
  value: string;
  label: string;
  icon: typeof Brain;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-5",
        dark ? "border-white/15 bg-white/10" : "border-[#c9e3e7] bg-white/70",
      )}
    >
      <Icon className={cn("h-6 w-6", dark ? "text-[#b9e2d5]" : "text-[#25859a]")} />
      <strong className="mt-4 block font-mono text-4xl font-black">{value}</strong>
      <span className={cn("mt-2 block font-bold", dark ? "text-white/75" : "text-[#6a8088]")}>
        {label}
      </span>
    </div>
  );
}

function Badge({
  label,
  icon: Icon,
  className,
}: {
  label: string;
  icon: typeof Brain;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-[#e2f3f4] px-3 py-2 text-sm font-black text-[#25859a]",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function PrimaryButton({
  className,
  children,
  disabled,
  onClick,
  type = "button",
}: {
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-14 rounded-2xl bg-[#1f7a8c] px-7 text-lg font-black text-white shadow-lg shadow-cyan-900/20 transition hover:bg-[#173945] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
}) {
  const tones = {
    info: "bg-blue-100 text-blue-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    muted: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-sm font-black", tones[tone])}>
      {children}
    </span>
  );
}

function FieldLine({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password" | "number" | "datetime-local";
  readOnly?: boolean;
}) {
  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[#526b74]">{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-2xl border border-[#c9e3e7] bg-white/80 px-4 py-4 font-mono text-lg font-bold outline-none transition read-only:bg-slate-50 read-only:text-[#526b74] focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[#526b74]">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-2xl border border-[#c9e3e7] bg-white/80 px-4 py-4 font-mono text-lg font-bold outline-none transition disabled:bg-slate-50 disabled:text-[#526b74] focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckLine({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-[#c9e3e7] bg-white/75 px-4 py-3 font-bold text-[#526b74]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[#1f7a8c] disabled:opacity-60"
      />
    </label>
  );
}

function TrainingInputModePicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectedModes = new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  function toggleMode(mode: string, checked: boolean) {
    const nextModes = checked
      ? Array.from(new Set([...selectedModes, mode]))
      : Array.from(selectedModes).filter((item) => item !== mode);
    onChange(nextModes.join(", "));
  }

  return (
    <div className="mt-5">
      <p className="text-sm font-black text-[#526b74]">{label}</p>
      <div className="mt-2 grid gap-3">
        {trainingInputModeOptions.map(([mode, labelText]) => (
          <CheckLine
            key={mode}
            label={labelText}
            checked={selectedModes.has(mode)}
            disabled={disabled}
            onChange={(checked) => toggleMode(mode, checked)}
          />
        ))}
      </div>
      <p className="mt-2 text-sm font-bold leading-6 text-[#6a8088]">
        当前一期已接通摄像头体感采集；如已有内容包含其他采集方式，可在高级配置中查看和维护。
      </p>
      <details className="mt-3 rounded-2xl border border-[#d7e8ec] bg-white/60 p-3">
        <summary className="cursor-pointer text-sm font-black text-[#25859a]">
          高级配置：采集方式标识
        </summary>
        <p className="mt-2 text-sm font-bold leading-6 text-[#6a8088]">
          仅在维护既有训练内容或接入新采集方式时调整，多个标识请用英文逗号分隔。
        </p>
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-2xl border border-[#c9e3e7] bg-white/80 px-4 font-mono text-sm font-bold text-[#526b74] outline-none transition disabled:bg-slate-50 disabled:text-[#6a8088] focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
        />
      </details>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[#526b74]">{label}</label>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-2xl border border-[#c9e3e7] bg-white/80 px-4 py-4 text-lg font-bold leading-7 outline-none transition read-only:bg-slate-50 read-only:text-[#526b74] focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
      />
    </div>
  );
}

function FormBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
      <p className="text-sm font-black text-[#6a8088]">{label}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
      <label className="text-sm font-black text-[#6a8088]">{label}</label>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="number"
          min="1"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-12 w-full rounded-2xl border border-[#c9e3e7] bg-white/85 px-4 font-mono text-2xl font-black text-[#16333d] outline-none transition disabled:bg-slate-50 disabled:text-[#6a8088] focus:border-[#1f7a8c] focus:ring-4 focus:ring-[#1f7a8c]/15"
        />
        <span className="font-black text-[#526b74]">{suffix}</span>
      </div>
    </div>
  );
}

function StatusList({
  items,
}: {
  items: Array<[string, string, StatusTone]>;
}) {
  return (
    <div className="mt-4 grid gap-3">
      {items.map(([label, value, tone], index) => (
        <div
          key={`${label}-${value}-${index}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-[#c9e3e7] bg-white/75 p-4"
        >
          <span className="font-black">{label}</span>
          <Chip tone={tone}>{value}</Chip>
        </div>
      ))}
    </div>
  );
}

function DashboardBars({
  rows,
  labels,
  emptyText,
}: {
  rows: DashboardCountRow[];
  labels: Record<string, string>;
  emptyText: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (!rows.length || total === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[#c9e3e7] bg-white/55 p-5 font-bold text-[#6a8088]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4">
      {rows.map((row) => {
        const percent = Math.round((row.count / total) * 100);
        return (
          <div key={row.key}>
            <div className="mb-2 flex items-center justify-between gap-4 font-black">
              <span>{labels[row.key] ?? row.key}</span>
              <span className="font-mono text-[#25859a]">
                {row.count} · {percent}%
              </span>
            </div>
            <Progress value={percent} />
          </div>
        );
      })}
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-4 rounded-full border border-[#c9e3e7] bg-white/80 p-1">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#1f7a8c,#b9e2d5)]"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function Waveform() {
  return (
    <div className="flex h-24 items-center justify-center gap-3">
      {[32, 58, 80, 50, 70, 38].map((height, index) => (
        <span
          key={index}
          className="w-3 rounded-full bg-[#2a8aa0]"
          style={{ height }}
        />
      ))}
    </div>
  );
}

function CapabilityBars({
  scoreSummary = {},
}: {
  scoreSummary?: Record<string, unknown>;
}) {
  const rows: Array<[string, number | null]> = [
    ["记忆力", readOptionalNumber(scoreSummary.memory)],
    ["定向力", readOptionalNumber(scoreSummary.orientation)],
    ["执行力", readOptionalNumber(scoreSummary.executive)],
    ["语言表达", readOptionalNumber(scoreSummary.language)],
  ];
  const hasScores = rows.some(([, value]) => typeof value === "number");

  if (!hasScores) {
    return (
      <div className="mt-7 rounded-3xl border border-dashed border-[#c9e3e7] bg-white/60 p-5 font-bold text-[#6a8088]">
        能力维度待评估，完成评估后展示记忆力、定向力、执行力和语言表达。
      </div>
    );
  }

  return (
    <div className="mt-7 grid gap-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="mb-2 flex justify-between font-black">
            <span>{label}</span>
            <span>{typeof value === "number" ? `${value}%` : "待评估"}</span>
          </div>
          {typeof value === "number" ? (
            <Progress value={value} />
          ) : (
            <div className="h-4 rounded-full border border-dashed border-[#c9e3e7] bg-white/60" />
          )}
        </div>
      ))}
    </div>
  );
}

function Ring({ value }: { value: string }) {
  return (
    <div className="grid h-56 w-56 place-items-center rounded-full bg-[conic-gradient(#1f7a8c_0_33%,#e4eef0_33%_100%)]">
      <div className="grid h-40 w-40 place-items-center rounded-full bg-white text-5xl font-black text-[#1f7a8c]">
        {value}
      </div>
    </div>
  );
}

function HistoryPanel({
  trainingRecords,
}: {
  trainingRecords?: TrainingRecordsResponse;
}) {
  const sessions = trainingRecords?.sessions ?? [];
  const resultSessions = sessions.filter((session) => session.result);
  const barValues = resultSessions
    .slice(0, 7)
    .reverse()
    .flatMap((session) =>
      typeof session.result?.score === "number" ? [session.result.score] : [],
    );

  return (
    <GlassCard>
      <Badge label="最近 7 次记录" icon={BarChart3} />
      {barValues.length ? (
        <div className="mt-5 flex h-56 items-end gap-3 rounded-3xl border border-[#c9e3e7] bg-white/75 p-5">
          {barValues.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-2xl bg-[linear-gradient(180deg,#1f7a8c,#b9e2d5)]"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid h-56 place-items-center rounded-3xl border border-dashed border-[#c9e3e7] bg-white/60 p-5 text-center font-bold text-[#6a8088]">
          暂无已回传成绩，完成训练后展示趋势。
        </div>
      )}
      <StatusList
        items={
          sessions.length
            ? sessions.slice(0, 3).map((session) => [
	                session.gameContent.name,
	                session.result
	                  ? `${formatDateTime(session.startedAt)} · 得分 ${session.result.score} · ${trainingReviewConclusionLabel(session.result.reviewConclusion)}`
	                  : `${formatDateTime(session.startedAt)} · 待回传结果`,
                session.result?.abnormalFlag
                  ? "warning"
                  : session.result
                    ? "success"
                    : "info",
              ])
            : [["暂无记录", "完成训练后展示趋势", "info"]]
        }
      />
    </GlassCard>
  );
}

function LoopStrip() {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3">
      {["AI评估", "风险分级", "方案匹配", "体感训练", "医师回看"].map((item) => (
        <Chip key={item}>{item}</Chip>
      ))}
    </div>
  );
}

function PlanRows({ plan }: { plan?: RehabPlan }) {
  const rows = plan?.items?.length
    ? plan.items.map((item) => [
        item.gameContent.name,
        `每周 ${item.frequencyPerWeek} 次 · ${item.durationMinutes} 分钟 · ${item.difficulty}`,
      ])
    : [];

  if (!rows.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[#c9e3e7] bg-white/55 p-5 font-bold text-[#6a8088]">
        暂无康复计划数据，生成并确认方案后展示训练项目。
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#c9e3e7]">
      {rows.map(([name, value]) => (
        <div
          key={name}
          className="flex items-center justify-between gap-4 border-b border-[#e1edf0] bg-white/70 p-4 last:border-b-0"
        >
          <span className="font-black text-[#1f7a8c]">{name}</span>
          <span className="font-bold text-[#526b74]">{value}</span>
        </div>
      ))}
    </div>
  );
}

function MissingDataCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <GlassCard>
      <Badge label="等待数据" icon={Database} />
      <h2 className="mt-5 text-4xl font-black">{title}</h2>
      <p className="mt-4 max-w-2xl text-lg font-bold leading-8 text-[#526b74]">
        {message}
      </p>
    </GlassCard>
  );
}

function resolveActivePatientId(session: LoginResponse | null) {
  if (!session) return undefined;
  return resolveAccessiblePatientIds(session)[0];
}

function resolveHomeScreen(session: LoginResponse) {
  return roleHome[session.context.primaryRole ?? "patient"];
}

function resolveAccessiblePatientIds(session: LoginResponse) {
  return (
    session.context.patientIds.length
      ? session.context.patientIds
      : session.context.caregiverPatientIds.length
        ? session.context.caregiverPatientIds
        : session.context.doctorPatientIds
  );
}

function buildCreatePatientPayload(form: PatientFormState): CreatePatientRequest {
  const age = parseRequiredNumber(form.age, "患者年龄");
  const heartRate = form.heartRate.trim()
    ? parseRequiredNumber(form.heartRate, "心率")
    : undefined;
  const healthMetrics = Object.fromEntries(
    [
      ["bloodPressure", form.bloodPressure.trim()],
      ["heartRate", heartRate],
      ["gaitRisk", form.gaitRisk.trim()],
    ].filter(([, value]) => value !== undefined && value !== ""),
  );
  const payload: CreatePatientRequest = {
    account: form.account.trim(),
    initialPassword: form.initialPassword,
    name: form.name.trim(),
    gender: form.gender.trim(),
    age,
    healthMetrics,
  };
  const optionalFields: Array<
    [keyof CreatePatientRequest, string]
  > = [
    ["mobilePhone", form.mobilePhone],
    ["caregiverName", form.caregiverName],
    ["caregiverPhone", form.caregiverPhone],
    ["responsibleDoctorId", form.responsibleDoctorId],
  ];
  for (const [field, value] of optionalFields) {
    const trimmed = value.trim();
    if (trimmed) {
      Object.assign(payload, { [field]: trimmed });
    }
  }
  return payload;
}

function buildCreateCaregiverAccountPayload(
  form: CaregiverAccountFormState,
): CreateCaregiverAccountRequest {
  const payload: CreateCaregiverAccountRequest = {
    account: form.account.trim(),
    initialPassword: form.initialPassword,
    displayName: form.displayName.trim(),
  };
  const mobilePhone = form.mobilePhone.trim();
  if (mobilePhone) {
    payload.mobilePhone = mobilePhone;
  }
  return payload;
}

function buildCaregiverRelationPayload(form: CaregiverBindingFormState) {
  return {
    caregiverAccount: form.caregiverAccount.trim(),
    relation: form.relation.trim(),
    scope: {
      summary: form.summary,
      reminders: form.reminders,
      progress: form.progress,
      rawAssessment: false,
      planEdit: false,
    } satisfies CaregiverScope,
  };
}

function buildTrainingResultPayload(
  form: TrainingResultFormState,
  runtimeType: FormalTrainingRuntime,
): SubmitTrainingResultRequest {
  const score = parseRequiredNumber(form.score, "训练得分");
  assertNumberRange(score, 0, 100, "训练得分必须在 0 到 100 之间。");

  const completionRate = parsePercentToRatio(form.completionRatePercent, "完成度");
  const motionAccuracy = parsePercentToRatio(
    form.motionAccuracyPercent,
    "动作准确率",
  );
  const durationSeconds = parseRequiredNumber(form.durationSeconds, "训练时长");
  const reactionTimeMs = parseRequiredNumber(form.reactionTimeMs, "反应时间");
  if (durationSeconds <= 0) {
    throw new Error("训练时长必须大于 0 秒。");
  }
  if (reactionTimeMs <= 0) {
    throw new Error("反应时间必须大于 0 毫秒。");
  }

  const exerciseIntensity = parseExerciseIntensity(form.exerciseIntensity);
  const metricsSummary = parseJsonObject(
    form.metricsSummary,
    "训练运行摘要必须是结构化对象。",
  );
  validateTrainingMetricsSummary(metricsSummary, runtimeType);
  const motionMetrics = parseMotionMetrics(form.motionMetrics);

  return {
    score,
    completionRate,
    durationSeconds,
    reactionTimeMs,
    motionAccuracy,
    exerciseIntensity,
    metricsSummary,
    motionMetrics,
  };
}

function buildTrainingReviewPayload(
  form: TrainingReviewFormState,
): SubmitTrainingReviewRequest {
  const reviewConclusion = parseTrainingReviewConclusion(form.reviewConclusion);
  const reviewNote = form.reviewNote.trim();
  if (!reviewNote) {
    throw new Error("训练复核说明不能为空。");
  }

  return {
    reviewConclusion,
    reviewNote,
  };
}

function buildUnityBuildForm(game: GameContent): UnityBuildFormState {
  return {
    gameContentId: game.id,
    manifestUrl: game.manifestUrl ?? "",
    buildBaseUrl: game.buildBaseUrl ?? "",
    gameVersion: game.gameVersion ?? "",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: isBuildStatus(game.buildStatus)
      ? game.buildStatus
      : "pending_assets",
    releaseChannel: isReleaseChannel(game.releaseChannel)
      ? game.releaseChannel
      : "development",
    supportsCamera: game.supportsCamera,
    supportsMicrophone: game.supportsMicrophone,
    supportedInputModesText: game.supportedInputModes.join(", "),
    requiredMetricsText: JSON.stringify(game.requiredMetrics ?? [], null, 2),
  };
}

function buildGameContentCreatePayload(
  form: GameContentCreateFormState,
): CreateGameContentRequest {
  const code = form.code.trim();
  if (!/^[a-z0-9_-]{2,64}$/.test(code)) {
    throw new Error("游戏编码只能包含小写字母、数字、下划线或短横线，长度 2 到 64 位。");
  }
  const name = form.name.trim();
  if (!name) {
    throw new Error("游戏名称不能为空。");
  }
  const gameVersion = form.gameVersion.trim();
  if (form.runtimeType === "browser_pose_game" && !gameVersion) {
    throw new Error("训练版本号不能为空。");
  }
  if (gameVersion && !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(gameVersion)) {
    throw new Error("训练版本号必须是语义化版本，例如 1.0.0。");
  }
  const trainingTargets = parseCommaSeparatedList(
    form.trainingTargetsText,
    "训练目标至少需要填写一项。",
  );
  const tags = parseCommaSeparatedList(form.tagsText, "匹配标签至少需要填写一项。");
  const defaultDuration = parseRequiredNumber(
    form.defaultDuration,
    "默认训练时长",
  );
  if (!Number.isInteger(defaultDuration) || defaultDuration < 1) {
    throw new Error("默认训练时长必须是正整数分钟。");
  }
  const defaultDifficulty = form.defaultDifficulty.trim();
  if (!defaultDifficulty) {
    throw new Error("默认难度不能为空。");
  }
  const supportsCamera = parseRequiredBoolean(
    form.supportsCamera,
    "请选择游戏是否需要摄像头。",
  );
  const supportsMicrophone = parseRequiredBoolean(
    form.supportsMicrophone,
    "请选择游戏是否需要麦克风。",
  );
  const supportedInputModes = parseCommaSeparatedList(
    form.supportedInputModesText,
    "训练采集方式至少需要填写一项。",
  );
  if (supportsCamera && !supportedInputModes.includes("camera_pose")) {
    throw new Error("需要摄像头的游戏必须包含摄像头体感采集方式。");
  }
  const requiredMetrics = parseJson(
    form.requiredMetricsText,
    "训练结果指标配置必须是结构化数组。",
  );
  if (!Array.isArray(requiredMetrics)) {
    throw new Error("训练结果指标配置必须是结构化数组。");
  }
  if (
    form.runtimeType === "browser_pose_game" &&
    !browserPoseGameRequiredMetrics.every((metricType) =>
      requiredMetricsInclude(requiredMetrics, metricType),
    )
  ) {
    throw new Error(
      "浏览器体感训练必须包含反应时间、命中率、姿态可见度、上肢动作准确率四项指标。",
    );
  }

  return {
    code,
    name,
    runtimeType: form.runtimeType,
    ...(gameVersion ? { gameVersion } : {}),
    trainingTargets,
    tags,
    defaultDuration,
    defaultDifficulty,
    supportsCamera,
    supportsMicrophone,
    supportedInputModes,
    requiredMetrics,
  };
}

function buildUnityBuildPayload(
  form: UnityBuildFormState,
  canPublishGames: boolean,
): UpdateUnityBuildRequest {
  if (!form.gameContentId) {
    throw new Error("请先选择训练内容。");
  }
  if (form.buildStatus === "released" && !canPublishGames) {
    throw new Error("当前账号没有发布正式训练资源的权限。");
  }
  const supportedInputModes = parseCommaSeparatedList(
    form.supportedInputModesText,
    "训练采集方式至少需要填写一项。",
  );
  const requiredMetrics = parseJson(
    form.requiredMetricsText,
    "训练结果指标配置必须是结构化数组。",
  );
  if (!Array.isArray(requiredMetrics)) {
    throw new Error("训练结果指标配置必须是结构化数组。");
  }

  return {
    manifestUrl: form.manifestUrl.trim(),
    buildBaseUrl: form.buildBaseUrl.trim(),
    gameVersion: form.gameVersion.trim(),
    bridgeProtocolVersion: "1.0.0",
    buildStatus: form.buildStatus,
    releaseChannel: form.releaseChannel,
    supportsCamera: form.supportsCamera,
    supportsMicrophone: form.supportsMicrophone,
    supportedInputModes,
    requiredMetrics,
  };
}

function isBuildStatus(value: string): value is UpdateUnityBuildRequest["buildStatus"] {
  return (
    value === "pending_assets" ||
    value === "validating" ||
    value === "released" ||
    value === "rejected"
  );
}

function isReleaseChannel(
  value: string,
): value is UpdateUnityBuildRequest["releaseChannel"] {
  return value === "development" || value === "staging" || value === "production";
}

function parseCommaSeparatedList(value: string, message: string) {
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!list.length) {
    throw new Error(message);
  }
  return Array.from(new Set(list));
}

function parseRequiredBoolean(value: "" | "true" | "false", message: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(message);
}

function gameContentStatusLabel(value?: string) {
  if (value === "active") return "已启用";
  if (value === "inactive") return "已下架";
  if (value === "archived") return "已归档";
  return value ?? "未知状态";
}

function gameBuildStatusLabel(value?: string) {
  if (value === "pending_assets") return "待上传资源";
  if (value === "validating") return "校验中";
  if (value === "released") return "已发布";
  if (value === "rejected") return "已驳回";
  return value ?? "未知状态";
}

function trainingInputModeLabel(value?: string) {
  if (value === "camera_pose") return "摄像头体感采集";
  return value ?? "未配置";
}

function trainingInputModesLabel(values?: string[]) {
  if (!values?.length) return "未配置";
  return values.map((value) => trainingInputModeLabel(value)).join(" / ");
}

function trainingRuntimeLabel(value: GameContent["runtimeType"]) {
  if (value === "unity_webgl") return "外部训练资源";
  if (value === "browser_pose_game") return "浏览器体感";
  return value;
}

const trainingTermLabels: Record<string, string> = {
  attention: "注意力",
  cognitive: "认知训练",
  executive: "执行力",
  "gait-balance": "步态平衡",
  language: "语言表达",
  low_intensity: "低强度",
  memory: "记忆力",
  moderate_intensity: "中等强度",
  motor: "动作训练",
  path_planning: "路径规划",
  reaction: "反应能力",
  upper_limb: "上肢训练",
};

function trainingTargetsLabel(values: string[]) {
  return values.map((value) => trainingTermLabel(value)).join("与");
}

function trainingTagsLabel(values: string[]) {
  return values.map((value) => trainingTermLabel(value)).join(" / ");
}

function trainingTermLabel(value: string) {
  return trainingTermLabels[value] ?? value;
}

function isJsonArrayText(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function gameStatusTone(value?: string): "info" | "success" | "warning" | "danger" | "muted" {
  if (value === "active") return "success";
  if (value === "inactive") return "warning";
  if (value === "archived") return "muted";
  return "info";
}

function parsePercentToRatio(value: string, label: string) {
  const percent = parseRequiredNumber(value, label);
  assertNumberRange(percent, 0, 100, `${label}必须在 0 到 100 之间。`);
  return percent / 100;
}

function parseExerciseIntensity(
  value: TrainingResultFormState["exerciseIntensity"],
) {
  if (value === "low" || value === "moderate" || value === "high") {
    return value;
  }
  throw new Error("请选择本次训练采集到的运动强度。");
}

function parseTrainingReviewConclusion(
  value: TrainingReviewFormState["reviewConclusion"],
): TrainingReviewConclusion {
  if (
    value === "confirmed_abnormal" ||
    value === "accepted_valid" ||
    value === "excluded_from_analysis" ||
    value === "needs_retrain"
  ) {
    return value;
  }
  throw new Error("请选择训练复核结论。");
}

function parseJsonObject(value: string, message: string): Record<string, unknown> {
  const parsed = parseJson(value, message);
  if (!isPlainObject(parsed)) {
    throw new Error(message);
  }
  return parsed;
}

function parseFormJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseFormJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseMotionMetrics(
  value: string,
): SubmitTrainingResultRequest["motionMetrics"] {
  const parsed = parseJson(value, "动作识别指标明细必须是结构化数组。");
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("动作识别指标明细不能为空。");
  }

  return parsed.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new Error(`动作识别指标明细第 ${index + 1} 项格式无效。`);
    }
    const metricType = readRequiredText(
      item.metricType,
      `动作识别指标明细第 ${index + 1} 项缺少指标类型。`,
    );
    const metricValue = readRequiredFiniteNumber(
      item.metricValue,
      `动作识别指标明细第 ${index + 1} 项指标值必须是数字。`,
    );
    const confidence = readRequiredFiniteNumber(
      item.confidence,
      `动作识别指标明细第 ${index + 1} 项置信度必须是数字。`,
    );
    assertNumberRange(
      confidence,
      0,
      1,
      `动作识别指标明细第 ${index + 1} 项置信度必须在 0 到 1 之间。`,
    );

    const metric: SubmitTrainingResultRequest["motionMetrics"][number] = {
      metricType,
      metricValue,
      confidence,
    };
    const unit = readOptionalText(item.unit);
    if (unit) {
      metric.unit = unit;
    }
    if (item.sampleCount !== undefined) {
      const sampleCount = readRequiredFiniteNumber(
        item.sampleCount,
        `动作识别指标明细第 ${index + 1} 项采样数量必须是数字。`,
      );
      if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
        throw new Error(`动作识别指标明细第 ${index + 1} 项采样数量必须是正整数。`);
      }
      metric.sampleCount = sampleCount;
    }
    const windowStartedAt = readOptionalText(item.windowStartedAt);
    if (windowStartedAt) {
      assertValidDateText(windowStartedAt, `动作识别指标明细第 ${index + 1} 项采样开始时间无效。`);
      metric.windowStartedAt = windowStartedAt;
    }
    const windowEndedAt = readOptionalText(item.windowEndedAt);
    if (windowEndedAt) {
      assertValidDateText(windowEndedAt, `动作识别指标明细第 ${index + 1} 项采样结束时间无效。`);
      metric.windowEndedAt = windowEndedAt;
    }
    if (
      windowStartedAt &&
      windowEndedAt &&
      new Date(windowStartedAt).getTime() > new Date(windowEndedAt).getTime()
    ) {
      throw new Error(`动作识别指标明细第 ${index + 1} 项采样开始时间不能晚于结束时间。`);
    }
    const qualityFlag = readOptionalText(item.qualityFlag);
    if (qualityFlag) {
      metric.qualityFlag = qualityFlag;
    }
    const bodyPart = readOptionalText(item.bodyPart);
    if (bodyPart) {
      metric.bodyPart = bodyPart;
    }
    const jointName = readOptionalText(item.jointName);
    if (jointName) {
      metric.jointName = jointName;
    }
    if (item.rawSummary !== undefined) {
      if (!isPlainObject(item.rawSummary)) {
        throw new Error(
          `动作识别指标明细第 ${index + 1} 项原始摘要格式无效。`,
        );
      }
      metric.rawSummary = item.rawSummary;
    }
    return metric;
  });
}

function validateTrainingMetricsSummary(
  summary: Record<string, unknown>,
  runtimeType: FormalTrainingRuntime,
) {
  const source = readRequiredText(
    summary.source,
    "训练运行摘要缺少结果来源。",
  );
  if (source !== runtimeType) {
    throw new Error("训练运行摘要的结果来源与当前游戏运行方式不一致。");
  }
  readRequiredText(summary.gameRunId, "训练运行摘要缺少运行批次。");
  readRequiredText(summary.gameVersion, "训练运行摘要缺少游戏版本。");
  const protocolVersion = readRequiredText(
    summary.protocolVersion,
    "训练运行摘要缺少数据版本。",
  );
  if (protocolVersion !== "1.0.0") {
    throw new Error("训练运行摘要的数据版本不符合要求。");
  }
  const clientGeneratedAt = readRequiredText(
    summary.clientGeneratedAt,
    "训练运行摘要缺少结果生成时间。",
  );
  assertValidDateText(clientGeneratedAt, "训练运行摘要的结果生成时间无效。");
  readRequiredText(summary.rawPayloadHash, "训练运行摘要缺少数据指纹。");
}

function parseJson(value: string, message: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(message);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(message);
  }
}

function parseJsonOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

function readOptionalText(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function readRequiredFiniteNumber(value: unknown, message: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(message);
  }
  return numberValue;
}

function assertValidDateText(value: string, message: string) {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(message);
  }
}

function assertNumberRange(
  value: number,
  min: number,
  max: number,
  message: string,
) {
  if (value < min || value > max) {
    throw new Error(message);
  }
}

function isPatientFormComplete(form: PatientFormState, primaryRole?: RoleCode) {
  const age = Number(form.age);
  const isAdmin = isAdminRole(primaryRole);
  return (
    form.account.trim().length >= 4 &&
    form.initialPassword.length >= 6 &&
    form.name.trim().length > 0 &&
    form.gender.trim().length > 0 &&
    Number.isInteger(age) &&
    age > 0 &&
    (!isAdmin || form.responsibleDoctorId.trim().length > 0)
  );
}

function isCaregiverAccountFormComplete(form: CaregiverAccountFormState) {
  return (
    form.account.trim().length >= 4 &&
    form.initialPassword.length >= 6 &&
    form.displayName.trim().length > 0
  );
}

function isTrainingResultFormComplete(form: TrainingResultFormState) {
  return (
    form.score.trim().length > 0 &&
    form.completionRatePercent.trim().length > 0 &&
    form.durationSeconds.trim().length > 0 &&
    form.reactionTimeMs.trim().length > 0 &&
    form.motionAccuracyPercent.trim().length > 0 &&
    form.exerciseIntensity.length > 0 &&
    form.metricsSummary.trim().length > 0 &&
    form.motionMetrics.trim().length > 0
  );
}

function caregiverScopeChips(scope: CaregiverScope) {
  const rows: Array<[keyof CaregiverScope, string]> = [
    ["summary", "摘要"],
    ["reminders", "提醒"],
    ["progress", "进展"],
    ["rawAssessment", "原始评估"],
    ["planEdit", "计划编辑"],
  ];
  return rows
    .filter(([key]) => scope[key])
    .map(([, label]) => label);
}

function resolveConfirmedCurrentPlan(patient?: PatientProfile) {
  return patient?.rehabPlans.find(
    (plan) => plan.isCurrent && plan.status === "active",
  );
}

function resolveCurrentRisk(patient?: PatientProfile) {
  return patient?.riskGrades.find((riskGrade) => riskGrade.isCurrent);
}

function resolvePendingPlan(patient?: PatientProfile) {
  return patient?.rehabPlans.find((plan) => plan.status === "pending_confirm");
}

function buildPlanPrerequisiteState(
  patient?: PatientProfile,
  pendingPlan?: RehabPlan | null,
): PlanPrerequisiteState {
  const consentSummary = patient ? summarizeConsents(patient) : {};
  const currentRisk = resolveCurrentRisk(patient);
  const activePlan = resolveConfirmedCurrentPlan(patient);
  const items: Array<[string, string, StatusTone]> = [
    [
      planPrerequisiteLabels.patientProfile,
      patient ? "已建档" : "待采集",
      patient ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.privacyConsent,
      consentSummary.privacy_policy ? "已签署" : "待签署",
      consentSummary.privacy_policy ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.aiConsent,
      consentSummary.ai_processing ? "已签署" : "待签署",
      consentSummary.ai_processing ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.currentRisk,
      currentRisk ? riskLabel(currentRisk.riskLevel) : "未评估",
      currentRisk ? "success" : "warning",
    ],
    [
      planPrerequisiteLabels.planState,
      pendingPlan
        ? "待医师确认"
        : activePlan
          ? "已确认生效"
          : "待生成",
      pendingPlan ? "warning" : activePlan ? "success" : "info",
    ],
  ];
  const blockers = items
    .slice(0, 4)
    .filter(([, , tone]) => tone === "warning" || tone === "danger")
    .map(([label, value]) => [label, value] as [string, string]);

  return {
    canRecommend: blockers.length === 0,
    items,
    blockers,
  };
}

function isReleasedGameContent(game: GameContent) {
  return game.status === "active" && game.buildStatus === "released";
}

function summarizeTrainingContentReadiness(plan?: RehabPlan | null): {
  label: string;
  description: string;
  tone: StatusTone;
} {
  if (!plan) {
    return {
      label: "待生成",
      description:
        "当前前端上下文还没有推荐或已确认方案，因此尚未取得方案引用的训练内容状态。",
      tone: "info",
    };
  }

  if (!plan.items.length) {
    return {
      label: "暂无",
      description: "当前方案没有训练项目，医师确认前需要先生成包含正式训练内容的方案。",
      tone: "warning",
    };
  }

  const unreleasedItems = plan.items.filter(
    (item) => !isReleasedGameContent(item.gameContent),
  );
  if (unreleasedItems.length) {
    return {
      label: `${unreleasedItems.length} 项待发布`,
      description: `训练内容 ${unreleasedItems
        .map((item) => item.gameContent.name)
        .join("、")} 尚未同时满足启用和资源发布状态。`,
      tone: "warning",
    };
  }

  return {
    label: "已发布",
    description: "当前方案引用的训练内容均为已启用且资源已发布状态。",
    tone: "success",
  };
}

function latestTrainingSession(patient?: PatientProfile) {
  return patient?.trainingSessions?.[0];
}

function findTrainingSessionsRequiringReview(
  trainingRecords?: TrainingRecordsResponse,
): TrainingRecordSession[] {
  return (trainingRecords?.sessions ?? []).filter(
    (session): session is TrainingRecordSession =>
      Boolean(session.result) &&
      (session.result?.abnormalFlag === true ||
        session.result?.qualityFlag !== "valid") &&
      session.result?.reviewStatus !== "reviewed",
  );
}

function isTrainingReviewFormComplete(form: TrainingReviewFormState) {
  return Boolean(
    form.resultId.trim() &&
      form.reviewConclusion &&
      form.reviewNote.trim(),
  );
}

function buildPatientAlertItems(
  patient?: PatientProfile,
): Array<[string, string, StatusTone]> {
  if (!patient) {
    return [["患者档案", "请先选择患者", "info"]];
  }

  const pendingPlan = resolvePendingPlan(patient);
  const currentPlan = resolveConfirmedCurrentPlan(patient);
  const currentRisk = resolveCurrentRisk(patient);
  const latestTraining = latestTrainingSession(patient);
  const consentSummary = summarizeConsents(patient);
  const grantedConsentCount = Object.values(consentSummary).filter(Boolean).length;
  const items: Array<[string, string, StatusTone]> = [];

  if (pendingPlan) {
    items.push(["康复方案", "有待确认方案", "warning"]);
  } else if (currentPlan) {
    items.push(["康复方案", "当前方案已生效", "success"]);
  } else {
    items.push(["康复方案", "暂无方案", "warning"]);
  }

  if (currentRisk?.riskLevel === "high") {
    items.push(["认知评级", "高风险需重点随访", "danger"]);
  } else if (currentRisk?.riskLevel === "moderate") {
    items.push(["认知评级", "中度风险需关注", "warning"]);
  } else if (currentRisk?.riskLevel === "low") {
    items.push(["认知评级", "低风险", "success"]);
  } else {
    items.push(["认知评级", "未完成评估", "warning"]);
  }

  if (latestTraining?.result?.abnormalFlag) {
    items.push(["最近训练", "结果异常需复核", "danger"]);
  } else if (latestTraining) {
    items.push(["最近训练", statusLabel(latestTraining.sessionStatus), "success"]);
  } else {
    items.push(["最近训练", "暂无训练记录", "info"]);
  }

  items.push([
    "授权记录",
    `${grantedConsentCount}/${consentDefinitions.length} 项已授权`,
    grantedConsentCount === consentDefinitions.length ? "success" : "warning",
  ]);

  return items;
}

function resolveNextPlanItem(
  plan: RehabPlan,
  trainingRecords?: TrainingRecordsResponse,
) {
  const completedPlanItemIds = new Set(
    trainingRecords?.sessions
      .filter(isCompletedTrainingSession)
      .map((session) => session.planItemId),
  );
  return (
    plan.items.find((item) => !completedPlanItemIds.has(item.id)) ??
    plan.items[0]
  );
}

function buildCaregiverTrainingRecords(
  caregiverSummary?: CaregiverSummaryResponse,
): TrainingRecordsResponse | undefined {
  if (!caregiverSummary) return undefined;
  const sessions = caregiverSummary.recentTraining;
  const validResults = sessions
    .filter(isCompletedTrainingSession)
    .map((session) => session.result)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      completedSessions: sessions.filter(isCompletedTrainingSession).length,
      averageScore: validResults.length
        ? Math.round(
            validResults.reduce((sum, result) => sum + result.score, 0) /
              validResults.length,
          )
        : 0,
      abnormalCount: validResults.filter((result) => result.abnormalFlag).length,
    },
  };
}

function buildTodayTrainingRecords(
  trainingRecords?: TrainingRecordsResponse,
): TrainingRecordsResponse | undefined {
  if (!trainingRecords) return undefined;
  const todaySessions = trainingRecords.sessions.filter((session) =>
    isTodayDateTime(session.startedAt),
  );
  return buildTrainingRecordsFromSessions(todaySessions);
}

function buildTrainingRecordsFromSessions(
  sessions: TrainingRecordsResponse["sessions"],
): TrainingRecordsResponse {
  const validResults = sessions
    .filter(isCompletedTrainingSession)
    .map((session) => session.result)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      completedSessions: sessions.filter(isCompletedTrainingSession).length,
      averageScore: validResults.length
        ? Math.round(
            validResults.reduce((sum, result) => sum + result.score, 0) /
              validResults.length,
          )
        : 0,
      abnormalCount: validResults.filter((result) => result.abnormalFlag).length,
    },
  };
}

function isCompletedTrainingSession(
  session: TrainingRecordsResponse["sessions"][number],
) {
  return session.sessionStatus === "completed" && Boolean(session.result);
}

function isTodayDateTime(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function findPlanItem(plan: RehabPlan | undefined, planItemId: string) {
  return plan?.items.find((item) => item.id === planItemId);
}

function mergePoseReadiness(
  current: TrainingReadiness,
  result: PoseReadinessResult,
): TrainingReadiness {
  return {
    ...current,
    poseRuntimeStatus: result.poseRuntimeStatus,
    poseModelVersion: result.poseModelVersion,
    poseLandmarkCount: result.poseLandmarkCount,
    poseAverageVisibility: result.poseAverageVisibility,
    poseQualityFlag: result.poseQualityFlag,
    poseCheckedAt: result.checkedAt,
    poseError: undefined,
  };
}

async function checkCameraReadiness(): Promise<TrainingReadiness> {
  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices.enumerateDevices) {
    throw new Error("当前浏览器不支持摄像头设备检测，请使用 Chrome、Edge 或 Safari 16.4+。");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevice = devices.find((device) => device.kind === "videoinput");
    if (!videoDevice?.deviceId) {
      throw new Error("未识别到可用摄像头设备。");
    }
    return {
      cameraPermission: "granted",
      cameraDeviceId: videoDevice.deviceId,
      cameraLabel: videoDevice.label || "已授权摄像头",
      checkedAt: new Date().toISOString(),
      poseRuntimeStatus: "unknown",
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function isGameReadyForTraining(game: RehabPlan["items"][number]["gameContent"]) {
  if (game.runtimeType === "browser_pose_game") {
    return isBrowserPoseGameReady(game);
  }
  return (
    game.status === "active" &&
    game.runtimeType === "unity_webgl" &&
    game.buildStatus === "released" &&
    Boolean(game.manifestUrl?.trim()) &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0"
  );
}

function isBrowserPoseGameReady(game: RehabPlan["items"][number]["gameContent"]) {
  return (
    game.status === "active" &&
    game.runtimeType === "browser_pose_game" &&
    game.buildStatus === "released" &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0" &&
    game.supportedInputModes.includes("camera_pose") &&
    browserPoseGameRequiredMetrics.every((metricType) =>
      requiredMetricsInclude(game.requiredMetrics, metricType),
    )
  );
}

const browserPoseGameRequiredMetrics = [
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
];

function requiredMetricsInclude(value: unknown, metricType: string) {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        isPlainObject(item) &&
        typeof item.metricType === "string" &&
        item.metricType === metricType,
    )
  );
}

function createGameRunId(patientId: string, gameCode: string) {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("当前浏览器不支持安全随机 ID，不能创建正式训练运行批次。");
  }
  const randomId = crypto.randomUUID();
  return `${patientId}:${gameCode}:${randomId}`;
}

async function fetchUnityManifest(manifestUrl: string) {
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unity 资源清单读取失败：${response.status}`);
  }
  const manifest = (await response.json()) as unknown;
  if (!isUnityManifest(manifest)) {
    throw new Error("Unity 资源清单结构无效。");
  }
  return manifest;
}

function isUnityManifest(value: unknown): value is UnityManifest {
  if (!isPlainObject(value) || !isPlainObject(value.build)) return false;
  return (
    typeof value.gameCode === "string" &&
    typeof value.gameName === "string" &&
    typeof value.gameVersion === "string" &&
    typeof value.bridgeProtocolVersion === "string" &&
    typeof value.build.loaderUrl === "string" &&
    typeof value.build.dataUrl === "string" &&
    typeof value.build.frameworkUrl === "string" &&
    typeof value.build.codeUrl === "string"
  );
}

function validateUnityManifest(
  manifest: UnityManifest,
  game: RehabPlan["items"][number]["gameContent"],
) {
  if (manifest.gameCode !== game.code) {
    throw new Error(`Unity 资源清单游戏编码不匹配：${manifest.gameCode}`);
  }
  if (manifest.gameVersion !== game.gameVersion) {
    throw new Error(`Unity 资源清单游戏版本不匹配：${manifest.gameVersion}`);
  }
  if (manifest.bridgeProtocolVersion !== game.bridgeProtocolVersion) {
    throw new Error(
      `Unity 资源清单协议版本不匹配：${manifest.bridgeProtocolVersion}`,
    );
  }
}

function loadScriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-unity-loader="${src}"]`,
    );
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.dataset.unityLoader = src;
    script.async = true;
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Unity loader 加载失败：${src}`));
    if (!existing) {
      document.body.appendChild(script);
    }
  });
}

function readUnityLoader() {
  if (typeof window.createUnityInstance !== "function") {
    throw new Error("Unity loader 未提供 createUnityInstance。");
  }
  return window.createUnityInstance;
}

function unityCanvasId(sessionId: string) {
  return `unity-canvas-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function roleLabel(role?: RoleCode) {
  const labels: Record<RoleCode, string> = {
    patient: "患者端",
    caregiver: "家属端",
    doctor: "医师端",
    admin: "管理员",
    admin_super: "平台管理人员",
    admin_operator: "普通运营",
    admin_auditor: "审计查看人员",
  };
  return role ? labels[role] : "未登录";
}

function isAdminRole(role?: RoleCode) {
  return (
    role === "admin" ||
    role === "admin_super" ||
    role === "admin_operator" ||
    role === "admin_auditor"
  );
}

function hasAdminPermission(
  permissions: AdminPermission[],
  permission: AdminPermission,
) {
  return permissions.includes(permission);
}

function riskLabel(risk?: "low" | "moderate" | "high" | null) {
  if (risk === "high") return "高风险";
  if (risk === "moderate") return "中度风险";
  if (risk === "low") return "低风险";
  return "未评估";
}

function riskTone(risk?: "low" | "moderate" | "high" | null): StatusTone {
  if (risk === "high") return "danger";
  if (risk === "moderate") return "warning";
  if (risk === "low") return "success";
  return "info";
}

function clinicalScoreLabel(value: unknown, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "未评估";
  return suffix ? `${value}${suffix}` : String(value);
}

function consentLabel(type: ConsentType) {
  return consentDefinitions.find((definition) => definition.type === type)?.title ?? type;
}

function summarizeConsents(patient: PatientProfile) {
  return consentDefinitions.reduce(
    (summary, definition) => {
      summary[definition.type] = patient.consents.find(
        (consent) =>
          consent.consentType === definition.type &&
          consent.consentVersion === consentVersion &&
          consent.status === "granted" &&
          !consent.revokedAt,
      );
      return summary;
    },
    {} as Partial<Record<ConsentType, PatientProfile["consents"][number]>>,
  );
}

const auditActionLabels: Record<string, string> = {
  "auth.login": "账号登录",
  "patient.create": "创建患者",
  "user.create.caregiver": "创建家属账号",
  "patient.view": "查看患者",
  "consent.grant": "授权留痕",
  "consent.revoke": "撤回授权",
  "assessment.create": "创建 AI 评估",
  "rehab_plan.recommend": "生成推荐方案",
  "rehab_plan.confirm": "确认康复方案",
  "training_session.start": "开始训练",
  "training_result.submit": "提交训练结果",
  "training_result.review": "复核训练结果",
  "game_content.create": "创建训练内容",
  "game_content.enable": "启用训练内容",
  "game_content.disable": "下架训练内容",
  "game_content.archive": "归档训练内容",
  "game_content.update_unity_build": "更新训练资源",
  "game_content.publish_unity_build": "发布训练资源",
  "caregiver.summary.view": "家属查看摘要",
  "data.export": "脱敏数据导出",
  "audit.export_desensitized": "脱敏审计导出",
  "plan.adjust": "调整康复方案",
  "access.denied": "访问被拒绝",
};

function auditActionLabel(action: string) {
  return auditActionLabels[action] ?? action;
}

function statusLabel(value?: string) {
  if (value === "active") return "当前生效";
  if (value === "pending_confirm") return "待医师确认";
  if (value === "ended") return "已结束";
  if (value === "paused") return "已暂停";
  if (value === "draft") return "草稿";
  if (value === "started") return "已创建";
  if (value === "in_progress") return "训练中";
  if (value === "completed") return "已完成";
  if (value === "interrupted") return "已中断";
  if (value === "upload_failed") return "上传失败";
  return value ?? "等待生成";
}

function readNumber(value: unknown, defaultValue: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : defaultValue;
}

function readOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readString(value: unknown, defaultValue: string) {
  return typeof value === "string" && value.length ? value : defaultValue;
}

function parseRequiredNumber(value: string, label: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} 需要填写有效数字。`);
  }
  return numberValue;
}

function validateAuditLogFilters(filters: AuditLogFilters) {
  if (
    filters.limit !== undefined &&
    (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 200)
  ) {
    throw new Error("审计日志返回条数必须是 1 到 200 的整数。");
  }

  const dateFrom = parseOptionalDate(filters.dateFrom, "开始时间");
  const dateTo = parseOptionalDate(filters.dateTo, "结束时间");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new Error("开始时间不能晚于结束时间。");
  }
}

function buildDataExportPayload(form: DataExportFormState): DataExportRequest {
  const reason = form.reason.trim();
  if (!reason) {
    throw new Error("请填写导出原因，便于审计追溯。");
  }
  const limit = parseOptionalInteger(form.limit, "导出条数");
  if (limit !== undefined && (limit < 1 || limit > 500)) {
    throw new Error("导出条数必须是 1 到 500 的整数。");
  }
  const dateFrom = parseOptionalDate(form.dateFrom, "开始时间");
  const dateTo = parseOptionalDate(form.dateTo, "结束时间");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new Error("导出开始时间不能晚于结束时间。");
  }

  return {
    dataset: form.dataset,
    format: "csv",
    reason,
    dateFrom: form.dateFrom || undefined,
    dateTo: form.dateTo || undefined,
    patientId: form.patientId.trim() || undefined,
    riskLevel: form.riskLevel ?? "all",
    qualityFlag: form.qualityFlag.trim() || undefined,
    limit,
  };
}

function parseOptionalInteger(value: string, label: string) {
  if (!value.trim()) return undefined;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label}必须是整数。`);
  }
  return numberValue;
}

function downloadExportedFile(exported: DownloadedExport) {
  const url = URL.createObjectURL(exported.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadJsonFile(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadExportedFile({ blob, filename });
}

function parseEvidenceTextList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalDate(value: string | undefined, label: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label}格式无效。`);
  }
  return date;
}

function isAssessmentFormComplete(form: AssessmentFormState) {
  return Object.values(form).every((value) => value.trim().length > 0);
}

function maskPhone(value?: string | null) {
  if (!value) return "未填写";
  if (value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function healthMetricChips(metrics: Record<string, unknown>) {
  const chips = [
    ["血压", metrics.bloodPressure],
    ["心率", metrics.heartRate],
    ["步态风险", metrics.gaitRisk],
  ]
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => `${label} ${String(value)}`);
  return chips.length ? chips : ["暂无健康指标"];
}

function toPercent(value?: number) {
  if (typeof value !== "number") return "0%";
  return `${Math.round(value * 100)}%`;
}

function intensityLabel(value?: string) {
  if (value === "moderate") return "中等";
  if (value === "low") return "低";
  if (value === "high") return "高";
  return value ?? "待采集";
}

function qualityLabel(value?: string) {
  if (value === "valid") return "已完成";
  if (value === "suspicious") return "数据可疑";
  return value ?? "等待训练结果";
}

function trainingReviewConclusionLabel(value?: string | null) {
  if (value === "confirmed_abnormal") return "确认异常";
  if (value === "accepted_valid") return "人工采纳为有效";
  if (value === "excluded_from_analysis") return "排除统计分析";
  if (value === "needs_retrain") return "建议重新训练";
  return "未复核";
}

function targetTypeLabel(value: string) {
  const labels: Record<string, string> = {
    user: "用户",
    patient_profile: "患者档案",
    consent_record: "授权记录",
    assessment_record: "评估记录",
    rehab_plan: "康复方案",
    training_session: "训练会话",
    training_result: "训练结果",
    game_content: "训练内容",
    audit_log: "审计日志",
    data_export: "数据导出",
  };
  return labels[value] ?? value;
}

function dashboardMetric(
  dashboard: AdminDashboardResponse | undefined,
  value: number | undefined,
  suffix = "",
) {
  if (!dashboard || typeof value !== "number") return "待同步";
  return suffix ? `${value} ${suffix}` : String(value);
}

function auditResultLabel(value: AuditLog["result"]) {
  if (value === "success") return "成功";
  if (value === "failed") return "失败";
  return "拒绝";
}

function auditTone(value: AuditLog["result"]) {
  if (value === "success") return "success";
  if (value === "failed") return "warning";
  return "danger";
}

function formatNullableNumber(value: number | null | undefined, suffix: string) {
  return typeof value === "number" ? `${value}${suffix}` : "暂无数据";
}

function formatNullablePercent(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "暂无数据";
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

function formatDateTime(value?: string) {
  if (!value) return "待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
