import type { ExportDataset } from "@/types/api";
import type { DataExportFormState } from "./admin-governance-forms";

const datasetOptions: Array<[ExportDataset, string]> = [
  ["patients", "患者档案"],
  ["consents", "授权记录"],
  ["audit-logs", "审计日志"],
];

export function exportDatasetOptions({
  canExportAuditLogs,
}: {
  canExportAuditLogs: boolean;
}) {
  return datasetOptions.filter(
    ([value]) => value !== "audit-logs" || canExportAuditLogs,
  );
}

export function canSubmitDesensitizedExport({
  canExportAuditLogs,
  canExportData,
  form,
}: {
  canExportAuditLogs: boolean;
  canExportData: boolean;
  form: DataExportFormState;
}) {
  const selectedDatasetAvailable = exportDatasetOptions({
    canExportAuditLogs,
  }).some(([value]) => value === form.dataset);

  return (
    canExportData && selectedDatasetAvailable && form.reason.trim().length >= 4
  );
}
