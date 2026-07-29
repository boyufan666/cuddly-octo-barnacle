"use client";

import { Download } from "lucide-react";
import { FormEvent } from "react";
import type { ExportDataset } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DataExportFormState } from "./admin-governance-forms";
import {
  canSubmitDesensitizedExport,
  exportDatasetOptions,
} from "./admin-export-policy";

type DesensitizedExportPanelProps = {
  canExportAuditLogs: boolean;
  canExportData: boolean;
  form: DataExportFormState;
  isExporting: boolean;
  onChange: (
    field: keyof DataExportFormState,
    value: DataExportFormState[keyof DataExportFormState],
  ) => void;
  onExportData: (form: DataExportFormState) => Promise<void>;
};

export function DesensitizedExportPanel({
  canExportAuditLogs,
  canExportData,
  form,
  isExporting,
  onChange,
  onExportData,
}: DesensitizedExportPanelProps) {
  const availableDatasetOptions = exportDatasetOptions({ canExportAuditLogs });
  const selectedDatasetAvailable = availableDatasetOptions.some(
    ([value]) => value === form.dataset,
  );
  const canSubmit = canSubmitDesensitizedExport({
    canExportAuditLogs,
    canExportData,
    form,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isExporting) return;
    void onExportData(form);
  }

  return (
    <Card tone="governance" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge status={canExportData ? "pending" : "review"}>
            脱敏数据导出
          </StatusBadge>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            导出申请
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            导出前必须填写用途说明。平台通过后端导出接口生成脱敏文件，并记录审计日志。
          </p>
        </div>
        <Download
          aria-hidden="true"
          className="h-5 w-5 text-[var(--accent-strong)]"
        />
      </div>

      {!canExportData ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--warning)]">
          当前账号没有脱敏数据导出权限。
        </p>
      ) : null}

      <form data-testid="desensitized-export-form" onSubmit={submit}>
        <fieldset
          className="grid gap-4 disabled:opacity-60 md:grid-cols-4"
          disabled={!canExportData || isExporting}
        >
          <SelectInput
            label="数据类型"
            onChange={(value) => onChange("dataset", value as ExportDataset)}
            options={availableDatasetOptions}
            value={selectedDatasetAvailable ? form.dataset : ""}
          />
          <TextInput
            label="患者档案编号"
            onChange={(value) => onChange("patientId", value)}
            value={form.patientId}
          />
          <TextInput
            label="开始时间"
            onChange={(value) => onChange("dateFrom", value)}
            type="datetime-local"
            value={form.dateFrom}
          />
          <TextInput
            label="结束时间"
            onChange={(value) => onChange("dateTo", value)}
            type="datetime-local"
            value={form.dateTo}
          />
          <TextInput
            label="导出条数"
            onChange={(value) => onChange("limit", value)}
            type="number"
            value={form.limit}
          />
          <TextInput
            label="导出原因（必填）"
            onChange={(value) => onChange("reason", value)}
            value={form.reason}
          />
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line-subtle)] pt-4">
          <p className="max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)]">
            导出文件由正式接口生成；未填写原因时不会提交导出申请。
          </p>
          <Button disabled={!canSubmit} isLoading={isExporting} type="submit">
            生成脱敏 CSV
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <select
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
