import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canSubmitDesensitizedExport,
  exportDatasetOptions,
} from "./admin-export-policy";
import { buildDataExportPayload } from "./admin-payload-builders";
import type { DataExportFormState } from "./admin-governance-forms";

const baseForm: DataExportFormState = {
  dataset: "patients",
  dateFrom: "",
  dateTo: "",
  format: "csv",
  limit: "",
  patientId: "",
  reason: "clinical review",
};

test("operator export options hide audit logs without audit read permission", () => {
  const options = exportDatasetOptions({ canExportAuditLogs: false });

  assert.deepEqual(
    options.map(([dataset]) => dataset),
    ["patients", "assessments", "training-records", "consents"],
  );
});

test("audited export options include audit logs only for audit readers", () => {
  const options = exportDatasetOptions({ canExportAuditLogs: true });

  assert.deepEqual(
    options.map(([dataset]) => dataset),
    ["patients", "assessments", "training-records", "consents", "audit-logs"],
  );
});

test("desensitized export submit requires data permission available dataset and reason", () => {
  assert.equal(
    canSubmitDesensitizedExport({
      canExportAuditLogs: true,
      canExportData: false,
      form: baseForm,
    }),
    false,
  );
  assert.equal(
    canSubmitDesensitizedExport({
      canExportAuditLogs: false,
      canExportData: true,
      form: { ...baseForm, dataset: "audit-logs" },
    }),
    false,
  );
  assert.equal(
    canSubmitDesensitizedExport({
      canExportAuditLogs: true,
      canExportData: true,
      form: { ...baseForm, reason: "  " },
    }),
    false,
  );
  assert.equal(
    canSubmitDesensitizedExport({
      canExportAuditLogs: true,
      canExportData: true,
      form: { ...baseForm, reason: "abc" },
    }),
    false,
  );
  assert.equal(
    canSubmitDesensitizedExport({
      canExportAuditLogs: false,
      canExportData: true,
      form: baseForm,
    }),
    true,
  );
  for (const form of [
    { ...baseForm, dataset: "assessments" as const },
    { ...baseForm, dataset: "training-records" as const },
  ]) {
    assert.equal(
      canSubmitDesensitizedExport({
        canExportAuditLogs: true,
        canExportData: true,
        form,
      }),
      true,
    );
  }
});

test("admin export entry is independent from audit-read permission", async () => {
  const source = await readFile(
    new URL("./AdminOverviewPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /\{permissions\.canExportData \? \(/);
  assert.match(
    source,
    /canExportAuditLogs=\{permissions\.canReadAuditLogs\}[\s\S]*canExportData=\{permissions\.canExportData\}/,
  );
  assert.doesNotMatch(
    source,
    /permissions\.canExportData && permissions\.canReadAuditLogs \? \([\s\S]*DesensitizedExportPanel/,
  );
});

test("export payload builder allows desensitized assessment and training datasets", () => {
  for (const dataset of ["assessments", "training-records"] as const) {
    const formWithUnapprovedRuntimeFields = {
      ...baseForm,
      dataset,
      dateFrom: "2026-07-17T08:30",
      dateTo: "2026-07-17T09:30",
      limit: "25",
      patientId: "  patient-id  ",
      clinicalText: "raw clinical narrative",
      provider: "internal-ai-provider",
      callId: "provider-call-id",
      endpoint: "https://provider.invalid",
      rawTrainingPayload: { samples: [1, 2, 3] },
      deviceInternalFields: { serialNumber: "device-serial" },
    };

    assert.deepEqual(buildDataExportPayload(formWithUnapprovedRuntimeFields), {
      dataset,
      format: "csv",
      reason: "clinical review",
      dateFrom: new Date("2026-07-17T08:30").toISOString(),
      dateTo: new Date("2026-07-17T09:30").toISOString(),
      patientId: "patient-id",
      limit: 25,
    });
  }
});

test("export payload builder canonicalizes every supplied field before transport", () => {
  assert.deepEqual(
    buildDataExportPayload({
      ...baseForm,
      dateFrom: "2026-07-17T08:30",
      dateTo: "2026-07-17T09:30",
      limit: "1",
      patientId: "  patient-id  ",
      reason: "  clinical review  ",
    }),
    {
      dataset: "patients",
      format: "csv",
      reason: "clinical review",
      dateFrom: new Date("2026-07-17T08:30").toISOString(),
      dateTo: new Date("2026-07-17T09:30").toISOString(),
      patientId: "patient-id",
      limit: 1,
    },
  );
});

test("export payload builder preserves purpose date and limit validation", () => {
  assert.throws(
    () => buildDataExportPayload({ ...baseForm, reason: "  " }),
    /请填写导出原因/,
  );
  assert.throws(
    () => buildDataExportPayload({ ...baseForm, limit: "0" }),
    /导出条数必须是 1 到 500 的整数/,
  );
  assert.throws(
    () => buildDataExportPayload({ ...baseForm, limit: "501" }),
    /导出条数必须是 1 到 500 的整数/,
  );
  assert.throws(
    () => buildDataExportPayload({ ...baseForm, dateFrom: "not-a-date" }),
    /开始时间格式无效/,
  );
  assert.throws(
    () =>
      buildDataExportPayload({
        ...baseForm,
        dateFrom: "2026-07-18T08:30",
        dateTo: "2026-07-17T09:30",
      }),
    /导出开始时间不能晚于结束时间/,
  );
});
