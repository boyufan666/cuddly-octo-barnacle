import type {
  AdminDashboardResponse,
  AssessmentRecord,
  AuditLog,
  AuditLogFilters,
  CaregiverSummaryResponse,
  GameContent,
  CaregiverRelation,
  ConfirmPlanRequest,
  CreateAssessmentRequest,
  CreateCaregiverAccountRequest,
  CreateGameContentRequest,
  CreateCaregiverRelationRequest,
  CreateConsentRequest,
  CreatePatientRequest,
  ConsentRecord,
  DataExportRequest,
  DownloadedExport,
  CaregiverAccount,
  LoginResponse,
  MeResponse,
  PatientProfile,
  RecommendPlanRequest,
  RehabPlan,
  StartTrainingSessionRequest,
  SubmitTrainingReviewRequest,
  SubmitTrainingResultRequest,
  TrainingRecordsResponse,
  TrainingResult,
  TrainingSession,
  UpdateGameContentStatusRequest,
  UpdateUnityBuildRequest,
} from "@/types/api";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!apiBase) {
  throw new Error("服务配置缺失，请联系管理员。");
}

type ApiOptions = {
  token?: string;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

type DownloadOptions = {
  token: string;
  body: Omit<DataExportRequest, "dataset">;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options: ApiOptions = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : "服务请求失败，请稍后重试。";
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

async function download(path: string, options: DownloadOptions): Promise<DownloadedExport> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify(options.body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : "服务请求失败，请稍后重试。";
    throw new ApiError(message, response.status);
  }

  return {
    blob: await response.blob(),
    filename: readDownloadFilename(response.headers),
  };
}

function readDownloadFilename(headers: Headers) {
  const disposition = headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? "rehab-export.csv";
}

function buildAuditLogQuery(filters?: AuditLogFilters) {
  if (!filters) return "";

  const params = new URLSearchParams();
  if (filters.result && filters.result !== "all") {
    params.set("result", filters.result);
  }
  if (filters.actorRole && filters.actorRole !== "all") {
    params.set("actorRole", filters.actorRole);
  }
  if (filters.action?.trim()) {
    params.set("action", filters.action.trim());
  }
  if (filters.targetType?.trim()) {
    params.set("targetType", filters.targetType.trim());
  }
  if (filters.actorAccount?.trim()) {
    params.set("actorAccount", filters.actorAccount.trim());
  }
  if (filters.targetId?.trim()) {
    params.set("targetId", filters.targetId.trim());
  }
  const dateFrom = toIsoDateTime(filters.dateFrom);
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  const dateTo = toIsoDateTime(filters.dateTo);
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  if (filters.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildExportBody(request: DataExportRequest): Omit<DataExportRequest, "dataset"> {
  const body: Omit<DataExportRequest, "dataset"> = {
    format: request.format,
    reason: request.reason.trim(),
  };
  const dateFrom = toIsoDateTime(request.dateFrom);
  if (dateFrom) {
    body.dateFrom = dateFrom;
  }
  const dateTo = toIsoDateTime(request.dateTo);
  if (dateTo) {
    body.dateTo = dateTo;
  }
  if (request.patientId?.trim()) {
    body.patientId = request.patientId.trim();
  }
  if (request.riskLevel && request.riskLevel !== "all") {
    body.riskLevel = request.riskLevel;
  }
  if (request.qualityFlag?.trim()) {
    body.qualityFlag = request.qualityFlag.trim();
  }
  if (request.limit !== undefined) {
    body.limit = request.limit;
  }
  return body;
}

function toIsoDateTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("审计时间格式无效。");
  }
  return date.toISOString();
}

export const api = {
  health: () => request<{ status: string; service: string }>("/health"),
  login: (account: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: { account, password },
    }),
  me: (token: string) => request<MeResponse>("/me", { token }),
  patient: (token: string, patientId: string) =>
    request<PatientProfile>(`/patients/${patientId}`, { token }),
  createPatient: (token: string, body: CreatePatientRequest) =>
    request<PatientProfile>("/patients", {
      token,
      method: "POST",
      body,
    }),
  createCaregiverAccount: (
    token: string,
    body: CreateCaregiverAccountRequest,
  ) =>
    request<CaregiverAccount>("/caregivers", {
      token,
      method: "POST",
      body,
    }),
  assessments: (token: string, patientId: string) =>
    request<AssessmentRecord[]>(`/patients/${patientId}/assessments`, {
      token,
    }),
  createAssessment: (token: string, body: CreateAssessmentRequest) =>
    request<AssessmentRecord>("/assessments", {
      token,
      method: "POST",
      body,
    }),
  createConsent: (token: string, body: CreateConsentRequest) =>
    request<ConsentRecord>("/consents", {
      token,
      method: "POST",
      body,
    }),
  revokeConsent: (token: string, consentId: string) =>
    request<ConsentRecord>(`/consents/${consentId}/revoke`, {
      token,
      method: "PATCH",
    }),
  caregiverRelations: (token: string, patientId: string) =>
    request<CaregiverRelation[]>(`/patients/${patientId}/caregivers`, {
      token,
    }),
  createCaregiverRelation: (
    token: string,
    patientId: string,
    body: CreateCaregiverRelationRequest,
  ) =>
    request<CaregiverRelation>(`/patients/${patientId}/caregivers`, {
      token,
      method: "POST",
      body,
    }),
  revokeCaregiverRelation: (
    token: string,
    patientId: string,
    relationId: string,
  ) =>
    request<CaregiverRelation>(
      `/patients/${patientId}/caregivers/${relationId}/revoke`,
      {
        token,
        method: "PATCH",
      },
    ),
  recommendPlan: (token: string, body: RecommendPlanRequest) =>
    request<RehabPlan>("/rehab-plans/recommend", {
      token,
      method: "POST",
      body,
    }),
  confirmPlan: (token: string, planId: string, body: ConfirmPlanRequest) =>
    request<RehabPlan>(`/rehab-plans/${planId}/confirm`, {
      token,
      method: "PATCH",
      body,
    }),
  startTrainingSession: (token: string, body: StartTrainingSessionRequest) =>
    request<TrainingSession>("/training-sessions", {
      token,
      method: "POST",
      body,
    }),
  submitTrainingResult: (
    token: string,
    sessionId: string,
    body: SubmitTrainingResultRequest,
  ) =>
    request<TrainingResult>(`/training-sessions/${sessionId}/results`, {
      token,
      method: "POST",
      body,
    }),
  reviewTrainingResult: (
    token: string,
    resultId: string,
    body: SubmitTrainingReviewRequest,
  ) =>
    request<TrainingResult>(`/training-results/${resultId}/review`, {
      token,
      method: "PATCH",
      body,
    }),
  trainingRecords: (token: string, patientId: string) =>
    request<TrainingRecordsResponse>(`/patients/${patientId}/training-records`, {
      token,
    }),
  caregiverSummary: (token: string, patientId: string) =>
    request<CaregiverSummaryResponse>(`/caregiver/patients/${patientId}/summary`, {
      token,
    }),
  adminDashboard: (token: string) =>
    request<AdminDashboardResponse>("/admin/dashboard", { token }),
  adminGameContents: (token: string) =>
    request<GameContent[]>("/admin/game-contents", { token }),
  createGameContent: (token: string, body: CreateGameContentRequest) =>
    request<GameContent>("/admin/game-contents", {
      token,
      method: "POST",
      body,
    }),
  updateGameContentStatus: (
    token: string,
    gameContentId: string,
    body: UpdateGameContentStatusRequest,
  ) =>
    request<GameContent>(`/admin/game-contents/${gameContentId}/status`, {
      token,
      method: "PATCH",
      body,
    }),
  updateUnityBuild: (
    token: string,
    gameContentId: string,
    body: UpdateUnityBuildRequest,
  ) =>
    request<GameContent>(`/admin/game-contents/${gameContentId}/unity-build`, {
      token,
      method: "PATCH",
      body,
    }),
  auditLogs: (token: string, filters?: AuditLogFilters) =>
    request<AuditLog[]>(`/admin/audit-logs${buildAuditLogQuery(filters)}`, {
      token,
    }),
  exportData: (token: string, body: DataExportRequest) =>
    download(`/admin/exports/${body.dataset}`, {
      token,
      body: buildExportBody(body),
    }),
};
