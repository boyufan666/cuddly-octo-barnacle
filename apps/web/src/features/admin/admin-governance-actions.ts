import { api } from "@/lib/api";
import type {
  AuditLog,
  AuditLogFilters,
  DataExportRequest,
  DownloadedExport,
  RegistrationRequest,
  ReviewRegistrationRequest,
  UpdateGameContentStatusRequest,
} from "@/types/api";
import type {
  BrowserPoseEvidenceFormState,
  UnityFieldEvidenceFormState,
} from "./TrainingQualityEvidenceSection";
import type {
  CaregiverAccountFormState,
  DataExportFormState,
  GameContentCreateFormState,
  UnityBuildFormState,
} from "./admin-governance-forms";
import type {
  CollectionConditionGovernanceFormState,
  CollectionProtocolGovernanceFormState,
} from "./CollectionConditionGovernance";

export type AdminGovernancePermissions = {
  canCreateCaregiver: boolean;
  canExportData: boolean;
  canManageGames: boolean;
  canManageQualityEvidence: boolean;
  canPublishGames: boolean;
  canReadAuditLogs: boolean;
};

export type AdminGovernanceBusyState = {
  auditLogs: boolean;
  createCaregiver: boolean;
  createCollectionCondition: boolean;
  createCollectionProtocol: boolean;
  createGameContent: boolean;
  exportData: boolean;
  reviewRegistrationRequest: boolean;
  updateGameContentStatus: boolean;
  updateUnityBuild: boolean;
};

export type AdminGovernanceForms = {
  browserPoseEvidence: BrowserPoseEvidenceFormState;
  caregiverAccount: CaregiverAccountFormState;
  collectionCondition: CollectionConditionGovernanceFormState;
  collectionProtocol: CollectionProtocolGovernanceFormState;
  dataExport: DataExportFormState;
  filters: AuditLogFilters;
  gameContentCreate: GameContentCreateFormState;
  unityBuild: UnityBuildFormState;
  unityEvidence: UnityFieldEvidenceFormState;
};

export type AdminGovernanceFormHandlers = {
  onBrowserPoseEvidenceFormChange: (
    field: keyof BrowserPoseEvidenceFormState,
    value: string,
  ) => void;
  onBrowserPoseEvidenceFormPrefill: (
    prefill: Partial<BrowserPoseEvidenceFormState>,
  ) => void;
  onCaregiverAccountFormChange: (
    field: keyof CaregiverAccountFormState,
    value: string,
  ) => void;
  onCollectionConditionFormChange: <
    K extends keyof CollectionConditionGovernanceFormState,
  >(
    field: K,
    value: CollectionConditionGovernanceFormState[K],
  ) => void;
  onCollectionProtocolFormChange: <
    K extends keyof CollectionProtocolGovernanceFormState,
  >(
    field: K,
    value: CollectionProtocolGovernanceFormState[K],
  ) => void;
  onDataExportFormChange: (
    field: keyof DataExportFormState,
    value: DataExportFormState[keyof DataExportFormState],
  ) => void;
  onFiltersChange: (
    field: keyof AuditLogFilters,
    value: AuditLogFilters[keyof AuditLogFilters],
  ) => void;
  onGameContentCreateFormChange: <K extends keyof GameContentCreateFormState>(
    field: K,
    value: GameContentCreateFormState[K],
  ) => void;
  onUnityBuildFormChange: <K extends keyof UnityBuildFormState>(
    field: K,
    value: UnityBuildFormState[K],
  ) => void;
  onUnityEvidenceFormChange: (
    field: keyof UnityFieldEvidenceFormState,
    value: string,
  ) => void;
};

export type AdminGovernanceActions = {
  onCreateCaregiverAccount: (form: CaregiverAccountFormState) => Promise<void>;
  onCreateCollectionCondition: (
    form: CollectionConditionGovernanceFormState,
  ) => Promise<void>;
  onCreateCollectionProtocol: (
    form: CollectionProtocolGovernanceFormState,
  ) => Promise<void>;
  onCreateGameContent: (form: GameContentCreateFormState) => Promise<void>;
  onExportData: (form: DataExportFormState) => Promise<void>;
  onRefreshAuditLogs: (filters: AuditLogFilters) => Promise<void>;
  onReviewRegistrationRequest: (
    request: RegistrationRequest,
    decision: ReviewRegistrationRequest["decision"],
    decisionReason: string,
  ) => Promise<void>;
  onUpdateGameContentStatus: (
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) => Promise<void>;
  onUpdateUnityBuild: (form: UnityBuildFormState) => Promise<void>;
};

export type AdminGovernanceExportRequest = DataExportRequest;

export async function auditLogs(
  filters: AuditLogFilters,
): Promise<AuditLog[]> {
  return api.auditLogs(filters);
}

export async function exportData(
  payload: DataExportRequest,
): Promise<DownloadedExport> {
  return api.exportData(payload);
}

export function downloadExportedFile(exported: DownloadedExport) {
  const url = URL.createObjectURL(exported.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
