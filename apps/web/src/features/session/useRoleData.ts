import { useCallback, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type {
  AdminDashboardResponse,
  AiConversationSession,
  AssessmentRecord,
  AuditLog,
  AuditLogFilters,
  CareCircleResponse,
  CaregiverSummaryResponse,
  CollectionBatch,
  CollectionCondition,
  CollectionProtocol,
  GameContent,
  AuthenticatedSession,
  PatientProfile,
  RegistrationRequest,
  RewardSummaryResponse,
  TrainingRecordsResponse,
} from "@/types/api";
import { isAdminRole } from "@/features/session/role-navigation";
import { summarizePatientConsents } from "@/features/patient/patient-consent-model";
import {
  synchronizeBrowserPoseCameraConsent,
  type BrowserPoseCameraSelection,
} from "@/lib/browser-pose-camera-access";

export type AppData = {
  patients?: PatientProfile[];
  caregiverPatientOptions?: Array<{ id: string; name: string }>;
  patient?: PatientProfile;
  assessments?: AssessmentRecord[];
  trainingRecords?: TrainingRecordsResponse;
  rewards?: RewardSummaryResponse;
  collectionConditions?: CollectionCondition[];
  collectionProtocols?: CollectionProtocol[];
  collectionBatches?: CollectionBatch[];
  aiConversations?: AiConversationSession[];
  caregiverSummary?: CaregiverSummaryResponse;
  careCircle?: CareCircleResponse;
  adminDashboard?: AdminDashboardResponse;
  adminGameContents?: GameContent[];
  registrationRequests?: RegistrationRequest[];
  auditLogs?: AuditLog[];
};

export type RoleDataPanelError = {
  panel: string;
  label: string;
  message: string;
};

type OptionalRoleDataRequest = {
  panel: string;
  label: string;
  load: () => Promise<Partial<AppData>>;
};

type RolePatientRosterLoaders = {
  loadCaregiverSummary: (
    patientId: string,
  ) => Promise<CaregiverSummaryResponse>;
  loadPatient: (patientId: string) => Promise<PatientProfile>;
};

type UseRoleDataOptions = {
  isRequestCurrent?: (requestEpoch: string) => boolean;
  onUnauthorized?: (message: string) => void;
};

export type RoleDataCameraSelectionTransfer = Readonly<{
  requestEpoch: string;
  patientId: string;
  selection: BrowserPoseCameraSelection;
}>;

type RoleDataLoadContext = {
  signal?: AbortSignal;
  cameraSelectionTransfer?: RoleDataCameraSelectionTransfer;
};

export function useRoleData({
  isRequestCurrent,
  onUnauthorized,
}: UseRoleDataOptions = {}) {
  const [data, setData] = useState<AppData>({});
  const [dataStatus, setDataStatus] = useState("未登录");
  const [dataError, setDataError] = useState<string | null>(null);
  const [panelErrors, setPanelErrors] = useState<RoleDataPanelError[]>([]);
  const currentRequestSequenceRef = useRef(0);

  const loadRoleData = useCallback(
    async (
      loginResponse: AuthenticatedSession,
      requestedPatientId?: string,
      auditFilters: AuditLogFilters = defaultAuditLogFiltersForRoleData,
      context: RoleDataLoadContext = {},
    ) => {
      const patientId =
        requestedPatientId ?? resolveActivePatientId(loginResponse);
      const role = loginResponse.context.primaryRole;
      const requestEpoch = loginResponse.requestEpoch;
      const requestSequence = currentRequestSequenceRef.current + 1;
      currentRequestSequenceRef.current = requestSequence;
      const accessiblePatientIds = resolveAccessiblePatientIds(loginResponse);

      if (
        !isRoleDataRequestCurrent(
          requestEpoch,
          requestSequence,
          currentRequestSequenceRef.current,
          isRequestCurrent,
          context.signal,
        )
      ) {
        return;
      }

      synchronizeRolePatientCameraConsent(undefined);
      setData((current) => clearPatientClinicalData(current));
      setDataStatus("加载核心业务数据");
      setDataError(null);
      setPanelErrors([]);

      try {
        const nextData: AppData = {};
        const optionalRequests: OptionalRoleDataRequest[] = [];
        optionalRequests.push(
          ...buildRolePatientRosterRequests(role, accessiblePatientIds, {
            loadCaregiverSummary: (id) => api.caregiverSummary(id, context),
            loadPatient: (id) => api.patient(id, context),
          }),
        );
        if (patientId && role === "patient") {
          const [patient, assessments, trainingRecords] = await Promise.all([
            api.patient(patientId, context),
            api.assessments(patientId, context),
            api.trainingRecords(patientId, context),
          ]);
          nextData.patients = [patient];
          nextData.patient = patient;
          nextData.assessments = assessments;
          nextData.trainingRecords = trainingRecords;
          optionalRequests.push(
            {
              panel: "rewards",
              label: "康复奖励",
              load: async () => ({
                rewards: await api.patientRewards(patientId, context),
              }),
            },
            {
              panel: "collectionBatches",
              label: "训练准备记录",
              load: async () => ({
                collectionBatches: await api.collectionBatches(
                  patientId,
                  context,
                ),
              }),
            },
            {
              panel: "aiConversations",
              label: "智能评估对话",
              load: async () => ({
                aiConversations: await api.patientAiConversations(
                  patientId,
                  context,
                ),
              }),
            },
          );
        }

        if (patientId && role === "doctor") {
          const [patient, assessments, trainingRecords] = await Promise.all([
            api.patient(patientId, context),
            api.assessments(patientId, context),
            api.trainingRecords(patientId, context),
          ]);
          nextData.patient = patient;
          nextData.assessments = assessments;
          nextData.trainingRecords = trainingRecords;
          optionalRequests.push(
            {
              panel: "rewards",
              label: "康复奖励",
              load: async () => ({
                rewards: await api.patientRewards(patientId, context),
              }),
            },
            {
              panel: "collectionProtocols",
              label: "训练准备协议",
              load: async () => ({
                collectionProtocols: await api.collectionProtocols(context),
              }),
            },
            {
              panel: "collectionBatches",
              label: "训练准备记录",
              load: async () => ({
                collectionBatches: await api.collectionBatches(
                  patientId,
                  context,
                ),
              }),
            },
            {
              panel: "aiConversations",
              label: "智能评估对话",
              load: async () => ({
                aiConversations: await api.patientAiConversations(
                  patientId,
                  context,
                ),
              }),
            },
          );
        }

        if (patientId && role === "caregiver") {
          const caregiverSummary = await api.caregiverSummary(
            patientId,
            context,
          );
          nextData.caregiverSummary = caregiverSummary;
          optionalRequests.push({
            panel: "careCircle",
            label: "家庭照护记录",
            load: async () => ({
              careCircle: await api.careCircle(patientId, context),
            }),
          });
        }

        if (isAdminRole(role)) {
          const canLoadRegistrationRequests =
            loginResponse.context.adminPermissions.includes("user.manage");
          const canLoadCollectionConditions =
            loginResponse.context.adminPermissions.includes("game.manage");
          nextData.adminDashboard = await api.adminDashboard(context);
          optionalRequests.push(
            {
              panel: "adminGameContents",
              label: "训练内容治理",
              load: async () => ({
                adminGameContents: await api.adminGameContents(context),
              }),
            },
            {
              panel: "collectionProtocols",
              label: "采集协议配置",
              load: async () => ({
                collectionProtocols: await api.collectionProtocols(context),
              }),
            },
          );
          if (canLoadCollectionConditions) {
            optionalRequests.push({
              panel: "collectionConditions",
              label: "采集条件配置",
              load: async () => ({
                collectionConditions: await api.collectionConditions(context),
              }),
            });
          }
          if (canLoadRegistrationRequests) {
            optionalRequests.push({
              panel: "registrationRequests",
              label: "账号开通申请",
              load: async () => ({
                registrationRequests: await api.registrationRequests(context),
              }),
            });
          }
          if (loginResponse.context.adminPermissions.includes("audit.read")) {
            optionalRequests.push({
              panel: "auditLogs",
              label: "审计日志",
              load: async () => ({
                auditLogs: await api.auditLogs(auditFilters, context),
              }),
            });
          }
        }

        if (role === "doctor") {
          optionalRequests.push(
            {
              panel: "doctorDashboard",
              label: "医师待办摘要",
              load: async () => ({
                adminDashboard: await api.adminDashboard(context),
              }),
            },
            {
              panel: "registrationRequests",
              label: "患者账号开通申请",
              load: async () => ({
                registrationRequests: await api.registrationRequests(context),
              }),
            },
          );
        }

        if (
          !isRoleDataRequestCurrent(
            requestEpoch,
            requestSequence,
            currentRequestSequenceRef.current,
            isRequestCurrent,
            context.signal,
          )
        ) {
          return;
        }
        synchronizeRolePatientCameraConsent(
          nextData.patient,
          resolveRoleDataCameraSelectionTransfer(
            context.cameraSelectionTransfer,
            requestEpoch,
            patientId,
          ),
        );
        setData((current) => ({
          ...clearOptionalRoleData(
            clearPatientClinicalData(current),
            optionalRequests.map((request) => request.panel),
          ),
          ...nextData,
        }));
        setDataStatus("核心业务数据已加载");

        const optionalResult = await settleOptionalRoleData(
          optionalRequests,
          context.signal,
        );
        if (
          !isRoleDataRequestCurrent(
            requestEpoch,
            requestSequence,
            currentRequestSequenceRef.current,
            isRequestCurrent,
            context.signal,
          )
        ) {
          return;
        }
        if (optionalResult.unauthorizedError) {
          setDataStatus("登录已过期");
          setDataError("登录已过期，请重新登录。");
          onUnauthorized?.("登录已过期，请重新登录。");
          return;
        }
        setData((current) => ({ ...current, ...optionalResult.data }));
        setPanelErrors(optionalResult.errors);
        setDataStatus(
          optionalResult.errors.length
            ? "核心业务数据已加载，部分面板加载失败"
            : "业务数据已加载",
        );
      } catch (error) {
        if (
          !isRoleDataRequestCurrent(
            requestEpoch,
            requestSequence,
            currentRequestSequenceRef.current,
            isRequestCurrent,
            context.signal,
          )
        ) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          synchronizeRolePatientCameraConsent(undefined);
          setDataStatus("登录已过期");
          setDataError("登录已过期，请重新登录。");
          onUnauthorized?.("登录已过期，请重新登录。");
          return;
        }
        synchronizeRolePatientCameraConsent(undefined);
        setData((current) => clearPatientClinicalData(current));
        setPanelErrors([]);
        setDataStatus("核心业务数据加载失败");
        setDataError(
          error instanceof Error ? error.message : "核心业务数据加载失败",
        );
      }
    },
    [isRequestCurrent, onUnauthorized],
  );

  const clearRoleData = useCallback((status: string, message?: string) => {
    currentRequestSequenceRef.current += 1;
    synchronizeRolePatientCameraConsent(undefined);
    setData({});
    setPanelErrors([]);
    setDataStatus(status);
    setDataError(message ?? null);
  }, []);

  return {
    clearRoleData,
    data,
    dataError,
    dataStatus,
    loadRoleData,
    panelErrors,
    setData,
    setDataError,
    setDataStatus,
  };
}

export function clearPatientClinicalData(data: AppData): AppData {
  const sharedData = { ...data };
  delete sharedData.patient;
  delete sharedData.assessments;
  delete sharedData.trainingRecords;
  delete sharedData.rewards;
  delete sharedData.collectionBatches;
  delete sharedData.aiConversations;
  delete sharedData.caregiverSummary;
  delete sharedData.careCircle;
  return sharedData;
}

const optionalPanelDataKey: Record<string, keyof AppData | undefined> = {
  rewards: "rewards",
  collectionBatches: "collectionBatches",
  aiConversations: "aiConversations",
  collectionProtocols: "collectionProtocols",
  careCircle: "careCircle",
  adminGameContents: "adminGameContents",
  collectionConditions: "collectionConditions",
  registrationRequests: "registrationRequests",
  auditLogs: "auditLogs",
  patientRoster: "patients",
  caregiverPatientRoster: "caregiverPatientOptions",
  doctorDashboard: "adminDashboard",
};

export function clearOptionalRoleData(
  data: AppData,
  panels: string[],
): AppData {
  const next = { ...data };
  for (const panel of panels) {
    const key = optionalPanelDataKey[panel];
    if (key) delete next[key];
  }
  return next;
}

export function synchronizeRolePatientCameraConsent(
  patient: PatientProfile | undefined,
  cameraSelection?: BrowserPoseCameraSelection,
) {
  synchronizeBrowserPoseCameraConsent(
    patient ? summarizePatientConsents(patient).camera_capture : undefined,
    cameraSelection,
  );
}

export function resolveRoleDataCameraSelectionTransfer(
  transfer: RoleDataCameraSelectionTransfer | undefined,
  requestEpoch: string,
  patientId: string | undefined,
) {
  if (!transfer) return undefined;
  if (transfer.requestEpoch !== requestEpoch) {
    throw new Error("摄像头选择传递的登录身份不一致，训练不会继续。");
  }
  if (
    !patientId ||
    transfer.patientId !== patientId ||
    transfer.selection.patientId !== patientId
  ) {
    throw new Error("摄像头选择传递的患者身份不一致，训练不会继续。");
  }
  return { ...transfer.selection };
}

export async function settleOptionalRoleData(
  requests: OptionalRoleDataRequest[],
  signal?: AbortSignal,
) {
  const results = await Promise.allSettled(
    requests.map((request) => request.load()),
  );
  const data: AppData = {};
  const errors: RoleDataPanelError[] = [];
  let unauthorizedError: ApiError | undefined;

  results.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      Object.assign(data, result.value);
      return;
    }
    if (signal?.aborted || isAbortError(result.reason)) {
      return;
    }
    if (result.reason instanceof ApiError && result.reason.status === 401) {
      unauthorizedError = result.reason;
      return;
    }
    errors.push({
      panel: request.panel,
      label: request.label,
      message:
        result.reason instanceof Error && result.reason.message.trim()
          ? result.reason.message
          : `${request.label}加载失败`,
    });
  });

  return {
    data,
    errors,
    ...(unauthorizedError ? { unauthorizedError } : {}),
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function buildCaregiverPatientOptions(
  authorizedPatientIds: string[],
  summaries: Array<Pick<CaregiverSummaryResponse, "patient">>,
) {
  const summaryByPatientId = new Map(
    summaries.map((summary) => [summary.patient.id, summary.patient.name]),
  );
  return authorizedPatientIds.flatMap((patientId) => {
    const name = summaryByPatientId.get(patientId);
    return name ? [{ id: patientId, name }] : [];
  });
}

export function buildRolePatientRosterRequests(
  role: AuthenticatedSession["context"]["primaryRole"],
  accessiblePatientIds: string[],
  loaders: RolePatientRosterLoaders,
): OptionalRoleDataRequest[] {
  if (role === "doctor") {
    return [
      {
        panel: "patientRoster",
        label: "授权患者列表",
        load: async () => ({
          patients: await Promise.all(
            accessiblePatientIds.map((id) => loaders.loadPatient(id)),
          ),
        }),
      },
    ];
  }
  if (role === "caregiver") {
    return [
      {
        panel: "caregiverPatientRoster",
        label: "授权患者列表",
        load: async () => {
          const summaries = await Promise.all(
            accessiblePatientIds.map((id) => loaders.loadCaregiverSummary(id)),
          );
          return {
            caregiverPatientOptions: buildCaregiverPatientOptions(
              accessiblePatientIds,
              summaries,
            ),
          };
        },
      },
    ];
  }
  return [];
}

function isRoleDataRequestCurrent(
  requestEpoch: string,
  requestSequence: number,
  currentRequestSequence: number,
  isRequestCurrent?: (requestEpoch: string) => boolean,
  signal?: AbortSignal,
) {
  return shouldApplyRoleDataResult({
    activeSessionToken:
      !isRequestCurrent || isRequestCurrent(requestEpoch) ? requestEpoch : null,
    currentRequestSequence,
    isAborted: signal?.aborted ?? false,
    requestEpoch,
    requestSequence,
  });
}

export function shouldApplyRoleDataResult({
  activeSessionToken,
  currentRequestSequence,
  isAborted,
  requestEpoch,
  requestSequence,
}: {
  activeSessionToken: string | null;
  currentRequestSequence: number;
  isAborted: boolean;
  requestEpoch: string;
  requestSequence: number;
}) {
  return (
    !isAborted &&
    activeSessionToken === requestEpoch &&
    requestSequence === currentRequestSequence
  );
}

export const defaultAuditLogFiltersForRoleData: AuditLogFilters = {
  result: "all",
  actorRole: "all",
  limit: 100,
};

export function resolveActivePatientId(session: AuthenticatedSession | null) {
  if (!session) return undefined;
  return session.context.primaryRole === "patient"
    ? session.context.patientIds[0]
    : undefined;
}

export function resolveAccessiblePatientIds(session: AuthenticatedSession) {
  if (session.context.primaryRole === "patient") {
    return session.context.patientIds;
  }
  if (session.context.primaryRole === "caregiver") {
    return session.context.caregiverPatientIds;
  }
  if (session.context.primaryRole === "doctor") {
    return session.context.doctorPatientIds;
  }
  return [];
}
