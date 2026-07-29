import test from "node:test";
import assert from "node:assert/strict";
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
    ["patients", "consents"],
  );
});

test("audited export options include audit logs only for audit readers", () => {
  const options = exportDatasetOptions({ canExportAuditLogs: true });

  assert.deepEqual(
    options.map(([dataset]) => dataset),
    ["patients", "consents", "audit-logs"],
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
      false,
    );
  }
});

test("export payload builder rejects clinical datasets", () => {
  for (const form of [
    { ...baseForm, dataset: "assessments" as const },
    { ...baseForm, dataset: "training-records" as const },
  ]) {
    assert.throws(
      () => buildDataExportPayload(form),
      /不提供患者级临床正文或精确指标/,
    );
  }
  assert.deepEqual(buildDataExportPayload(baseForm), {
    dataset: "patients",
    format: "csv",
    reason: "clinical review",
  });
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
