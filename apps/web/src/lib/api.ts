import type {
  AbortTrainingSessionRequest,
  AdminDashboardResponse,
  AiConversationSession,
  AppendAiConversationMessageRequest,
  AppendAiConversationMessageResponse,
  AssessmentSpeechTranscriptResponse,
  AiAssessmentDraftResponse,
  AssessmentRecord,
  AuditLog,
  AuditLogFilters,
  CaregiverSummaryResponse,
  CareCircleResponse,
  GameContent,
  CaregiverRelation,
  ConfirmPlanRequest,
  CreateAssessmentRequest,
  CreateCaregiverAccountRequest,
  CreateCareCircleCommentRequest,
  CreateCareCirclePostRequest,
  CreateCarePrecautionRequest,
  CreateGameContentRequest,
  CreateCaregiverRelationRequest,
  CreateConsentRequest,
  CreatePatientRequest,
  CreateRegistrationRequest,
  ConsentRecord,
  DataExportRequest,
  DownloadedExport,
  CaregiverAccount,
  CollectionBatch,
  CollectionCondition,
  CollectionProtocol,
  CreateCollectionBatchRequest,
  CreateCollectionConditionRequest,
  CreateCollectionProtocolRequest,
  CreateAiAssessmentDraftRequest,
  CreateAssessmentSpeechTranscriptRequest,
  CreateTtsSpeechOutputRequest,
  CompleteAiConversationRequest,
  LoginApiResponse,
  MeResponse,
  PatientProfile,
  RecommendPlanRequest,
  RegistrationRequest,
  RehabPlan,
  RewardSummaryResponse,
  ReviewRegistrationRequest,
  ModerateCareCirclePostRequest,
  ReviewAiConversationRequest,
  ReviewAssessmentRequest,
  StartAiConversationRequest,
  StartTrainingSessionRequest,
  SubmitTrainingReviewRequest,
  SubmitTrainingResultRequest,
  TrainingRecordsResponse,
  TrainingResult,
  TrainingSession,
  TtsSpeechOutputResponse,
  UpdateGameContentStatusRequest,
  UpdateUnityBuildRequest,
} from "@/types/api";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!apiBase) {
  throw new Error("服务配置缺失，请联系管理员。");
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  csrfToken?: string;
  signal?: AbortSignal;
};

type ApiRequestContext = Pick<ApiOptions, "signal">;

let csrfTokenInMemory: string | undefined;

type DownloadOptions = {
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

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const csrfToken: string | undefined =
    method === "GET"
      ? undefined
      : (options.csrfToken ?? (await ensureCsrfToken()));
  const response = await fetch(`${apiBase}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
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

async function download(
  path: string,
  options: DownloadOptions,
): Promise<DownloadedExport> {
  const csrfToken = await ensureCsrfToken();
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
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

function storeCsrfToken(response: { csrfToken: string }) {
  if (!response.csrfToken) {
    throw new Error("服务端未签发 CSRF 令牌，请联系管理员。");
  }
  csrfTokenInMemory = response.csrfToken;
  return response;
}

async function fetchCsrfToken(): Promise<{ csrfToken: string }> {
  return storeCsrfToken(await request<{ csrfToken: string }>("/auth/csrf"));
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfTokenInMemory) return csrfTokenInMemory;
  return (await fetchCsrfToken()).csrfToken;
}

function readDownloadFilename(headers: Headers) {
  const disposition = headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1]?.trim();
  if (!filename) {
    throw new Error("导出文件缺少服务端文件名，请联系管理员检查导出响应配置。");
  }
  return filename;
}

function requireHighCostIdempotencyKey<T extends { idempotencyKey: string }>(
  body: T,
): T {
  if (
    typeof body.idempotencyKey !== "string" ||
    !body.idempotencyKey ||
    body.idempotencyKey.trim() !== body.idempotencyKey
  ) {
    throw new Error("高成本服务请求缺少有效幂等键，已阻断提交。");
  }
  return { ...body };
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

function toIsoDateTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("审计时间格式无效。");
  }
  return date.toISOString();
}

export const api = {
  health: () => request<{ status: "live"; service: string }>("/health/live"),
  csrf: fetchCsrfToken,
  login: async (account: string, password: string) => {
    const { csrfToken } = await fetchCsrfToken();
    return request<LoginApiResponse>("/auth/login", {
      method: "POST",
      body: { account, password },
      csrfToken,
    });
  },
  createRegistrationRequest: async (body: CreateRegistrationRequest) => {
    const { csrfToken } = await fetchCsrfToken();
    return request<RegistrationRequest>("/auth/registration-requests", {
      method: "POST",
      body,
      csrfToken,
    });
  },
  me: (context: ApiRequestContext = {}) => request<MeResponse>("/me", context),
  logout: () =>
    request<{ status: "logged_out" }>("/auth/logout", { method: "POST" }),
  completePasswordReset: (newPassword: string) =>
    request<{ status: "password_reset_complete" }>("/auth/password-reset", {
      method: "POST",
      body: { newPassword },
    }),
  patient: (patientId: string, context: ApiRequestContext = {}) =>
    request<PatientProfile>(`/patients/${patientId}`, context),
  createPatient: (body: CreatePatientRequest) =>
    request<PatientProfile>("/patients", {
      method: "POST",
      body,
    }),
  createCaregiverAccount: (body: CreateCaregiverAccountRequest) =>
    request<CaregiverAccount>("/caregivers", {
      method: "POST",
      body,
    }),
  assessments: (patientId: string, context: ApiRequestContext = {}) =>
    request<AssessmentRecord[]>(`/patients/${patientId}/assessments`, context),
  createAssessment: (body: CreateAssessmentRequest) =>
    request<AssessmentRecord>("/assessments", {
      method: "POST",
      body,
    }),
  reviewAssessment: (assessmentId: string, body: ReviewAssessmentRequest) =>
    request<AssessmentRecord>(`/assessments/${assessmentId}/review`, {
      method: "PATCH",
      body,
    }),
  createAiAssessmentDraft: (body: CreateAiAssessmentDraftRequest) =>
    request<AiAssessmentDraftResponse>("/ai/assessment-drafts", {
      method: "POST",
      body: requireHighCostIdempotencyKey(body),
    }),
  startAiConversation: (body: StartAiConversationRequest) =>
    request<AiConversationSession>("/ai/conversations", {
      method: "POST",
      body,
    }),
  appendAiConversationMessage: (
    conversationId: string,
    body: AppendAiConversationMessageRequest,
  ) =>
    request<AppendAiConversationMessageResponse>(
      `/ai/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: requireHighCostIdempotencyKey(body),
      },
    ),
  completeAiConversation: (
    conversationId: string,
    body: CompleteAiConversationRequest,
  ) =>
    request<AiConversationSession>(
      `/ai/conversations/${conversationId}/complete`,
      {
        method: "PATCH",
        body,
      },
    ),
  reviewAiConversation: (
    conversationId: string,
    body: ReviewAiConversationRequest,
  ) =>
    request<AiConversationSession>(
      `/ai/conversations/${conversationId}/review`,
      {
        method: "PATCH",
        body,
      },
    ),
  patientAiConversations: (
    patientId: string,
    context: ApiRequestContext = {},
  ) =>
    request<AiConversationSession[]>(
      `/patients/${patientId}/ai-conversations`,
      context,
    ),
  createAssessmentSpeechTranscript: (
    body: CreateAssessmentSpeechTranscriptRequest,
  ) =>
    request<AssessmentSpeechTranscriptResponse>(
      "/ai/assessment-speech-transcripts",
      {
        method: "POST",
        body: requireHighCostIdempotencyKey(body),
      },
    ),
  createTtsSpeechOutput: (body: CreateTtsSpeechOutputRequest) =>
    request<TtsSpeechOutputResponse>("/ai/tts-speech-outputs", {
      method: "POST",
      body: requireHighCostIdempotencyKey(body),
    }),
  createConsent: (body: CreateConsentRequest) =>
    request<ConsentRecord>("/consents", {
      method: "POST",
      body,
    }),
  revokeConsent: (consentId: string) =>
    request<ConsentRecord>(`/consents/${consentId}/revoke`, {
      method: "PATCH",
    }),
  caregiverRelations: (patientId: string) =>
    request<CaregiverRelation[]>(`/patients/${patientId}/caregivers`),
  createCaregiverRelation: (
    patientId: string,
    body: CreateCaregiverRelationRequest,
  ) =>
    request<CaregiverRelation>(`/patients/${patientId}/caregivers`, {
      method: "POST",
      body,
    }),
  revokeCaregiverRelation: (patientId: string, relationId: string) =>
    request<CaregiverRelation>(
      `/patients/${patientId}/caregivers/${relationId}/revoke`,
      {
        method: "PATCH",
      },
    ),
  careCircle: (patientId: string, context: ApiRequestContext = {}) =>
    request<CareCircleResponse>(
      `/care-circle/patients/${patientId}/posts`,
      context,
    ),
  createCareCirclePost: (
    patientId: string,
    body: CreateCareCirclePostRequest,
  ) =>
    request<CareCircleResponse["posts"][number]>(
      `/care-circle/patients/${patientId}/posts`,
      {
        method: "POST",
        body,
      },
    ),
  createCareCircleComment: (
    postId: string,
    body: CreateCareCircleCommentRequest,
  ) =>
    request<CareCircleResponse["posts"][number]["comments"][number]>(
      `/care-circle/posts/${postId}/comments`,
      {
        method: "POST",
        body,
      },
    ),
  moderateCareCirclePost: (
    postId: string,
    body: ModerateCareCirclePostRequest,
  ) =>
    request<CareCircleResponse["posts"][number]>(
      `/care-circle/posts/${postId}/moderate`,
      {
        method: "PATCH",
        body,
      },
    ),
  createCarePrecaution: (body: CreateCarePrecautionRequest) =>
    request<CareCircleResponse["precautions"][number]>("/care-precautions", {
      method: "POST",
      body,
    }),
  recommendPlan: (body: RecommendPlanRequest) =>
    request<RehabPlan>("/rehab-plans/recommend", {
      method: "POST",
      body,
    }),
  confirmPlan: (planId: string, body: ConfirmPlanRequest) =>
    request<RehabPlan>(`/rehab-plans/${planId}/confirm`, {
      method: "PATCH",
      body,
    }),
  collectionProtocols: (context: ApiRequestContext = {}) =>
    request<CollectionProtocol[]>("/collection-protocols", context),
  collectionBatches: (patientId: string, context: ApiRequestContext = {}) =>
    request<CollectionBatch[]>(
      `/patients/${patientId}/collection-batches`,
      context,
    ),
  collectionConditions: (context: ApiRequestContext = {}) =>
    request<CollectionCondition[]>("/admin/collection-conditions", context),
  createCollectionCondition: (body: CreateCollectionConditionRequest) =>
    request<CollectionCondition>("/admin/collection-conditions", {
      method: "POST",
      body,
    }),
  createCollectionProtocol: (body: CreateCollectionProtocolRequest) =>
    request<CollectionProtocol>("/admin/collection-protocols", {
      method: "POST",
      body,
    }),
  createCollectionBatch: (body: CreateCollectionBatchRequest) =>
    request<CollectionBatch>("/collection-batches", {
      method: "POST",
      body,
    }),
  startTrainingSession: (body: StartTrainingSessionRequest) =>
    request<TrainingSession>("/training-sessions", {
      method: "POST",
      body,
    }),
  resumeTrainingSession: (sessionId: string) =>
    request<TrainingSession>(`/training-sessions/${sessionId}/resume`, {
      method: "POST",
    }),
  abortTrainingSession: (
    sessionId: string,
    body: AbortTrainingSessionRequest,
  ) =>
    request<TrainingSession>(`/training-sessions/${sessionId}/abort`, {
      method: "POST",
      body,
    }),
  submitTrainingResult: (
    sessionId: string,
    body: SubmitTrainingResultRequest,
  ) =>
    request<TrainingResult>(`/training-sessions/${sessionId}/results`, {
      method: "POST",
      body,
    }),
  reviewTrainingResult: (resultId: string, body: SubmitTrainingReviewRequest) =>
    request<TrainingResult>(`/training-results/${resultId}/review`, {
      method: "PATCH",
      body,
    }),
  trainingRecords: (patientId: string, context: ApiRequestContext = {}) =>
    request<TrainingRecordsResponse>(
      `/patients/${patientId}/training-records`,
      context,
    ),
  patientRewards: (patientId: string, context: ApiRequestContext = {}) =>
    request<RewardSummaryResponse>(`/patients/${patientId}/rewards`, context),
  caregiverSummary: (patientId: string, context: ApiRequestContext = {}) =>
    request<CaregiverSummaryResponse>(
      `/caregiver/patients/${patientId}/summary`,
      context,
    ),
  adminDashboard: (context: ApiRequestContext = {}) =>
    request<AdminDashboardResponse>("/admin/dashboard", context),
  adminGameContents: (context: ApiRequestContext = {}) =>
    request<GameContent[]>("/admin/game-contents", context),
  createGameContent: (body: CreateGameContentRequest) =>
    request<GameContent>("/admin/game-contents", {
      method: "POST",
      body,
    }),
  updateGameContentStatus: (
    gameContentId: string,
    body: UpdateGameContentStatusRequest,
  ) =>
    request<GameContent>(`/admin/game-contents/${gameContentId}/status`, {
      method: "PATCH",
      body,
    }),
  updateUnityBuild: (gameContentId: string, body: UpdateUnityBuildRequest) =>
    request<GameContent>(`/admin/game-contents/${gameContentId}/unity-build`, {
      method: "PATCH",
      body,
    }),
  registrationRequests: (context: ApiRequestContext = {}) =>
    request<RegistrationRequest[]>("/admin/registration-requests", context),
  reviewRegistrationRequest: (
    requestId: string,
    body: ReviewRegistrationRequest,
  ) =>
    request<RegistrationRequest>(
      `/admin/registration-requests/${requestId}/review`,
      {
        method: "PATCH",
        body,
      },
    ),
  auditLogs: (filters?: AuditLogFilters, context: ApiRequestContext = {}) =>
    request<AuditLog[]>(
      `/admin/audit-logs${buildAuditLogQuery(filters)}`,
      context,
    ),
  exportData: ({ dataset, ...body }: DataExportRequest) =>
    download(`/admin/exports/${dataset}`, { body }),
};
