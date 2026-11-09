import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("admin governance focuses on account content export and audit operations", async () => {
  const overviewSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/AdminOverviewPage.tsx"),
    "utf8",
  );
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const actionSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-governance-actions.ts"),
    "utf8",
  );
  const payloadBuilderSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-payload-builders.ts"),
    "utf8",
  );
  const exportPanelSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/DesensitizedExportPanel.tsx"),
    "utf8",
  );
  const exportPolicySource = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-export-policy.ts"),
    "utf8",
  );
  const securityAuditSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/SecurityAuditPage.tsx"),
    "utf8",
  );
  const apiTypeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );
  const apiServiceSource = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );
  const roleNavigationSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );

  for (const copy of ["账号", "内容", "配置", "审计"]) {
    assert.match(overviewSource, new RegExp(copy));
  }
  assert.match(overviewSource, /activeWorkspace/);
  assert.match(overviewSource, /activeWorkspace:\s*AdminWorkspaceId/);
  for (const workspace of ["accounts", "content", "config", "audit"]) {
    assert.match(overviewSource, new RegExp(`"${workspace}"`));
  }
  const accountsWorkspaceSlice = sliceBetween(
    overviewSource,
    'activeWorkspace === "accounts"',
    'activeWorkspace === "content"',
  );
  const contentWorkspaceSlice = sliceBetween(
    overviewSource,
    'activeWorkspace === "content"',
    'activeWorkspace === "config"',
  );
  const configWorkspaceSlice = sliceBetween(
    overviewSource,
    'activeWorkspace === "config"',
    'activeWorkspace === "audit"',
  );
  const auditWorkspaceSlice = sliceFrom(
    overviewSource,
    'activeWorkspace === "audit"',
  );
  assert.match(accountsWorkspaceSlice, /AccountReviewPanel/);
  assert.match(accountsWorkspaceSlice, /CaregiverAccountCreatePanel/);
  assert.doesNotMatch(
    accountsWorkspaceSlice,
    /TrainingContentGovernance|CollectionConditionGovernance|SecurityAuditPage|TrainingQualityEvidenceSection/,
  );
  assert.match(contentWorkspaceSlice, /TrainingContentGovernance/);
  assert.match(contentWorkspaceSlice, /PlanLibraryReleaseSummary/);
  assert.match(contentWorkspaceSlice, /方案库发布状态/);
  assert.doesNotMatch(
    contentWorkspaceSlice,
    /OperationConfigPanel|CollectionConditionGovernance|SecurityAuditPage|DesensitizedExportPanel|TrainingQualityEvidenceSection/,
  );
  assert.match(configWorkspaceSlice, /RuntimeReadinessSummary/);
  assert.match(configWorkspaceSlice, /readiness/);
  assert.match(configWorkspaceSlice, /运行就绪摘要|训练运行就绪/);
  assert.match(configWorkspaceSlice, /OperationConfigPanel/);
  assert.match(configWorkspaceSlice, /CollectionConditionGovernance/);
  assert.doesNotMatch(
    configWorkspaceSlice,
    /SecurityAuditPage|DesensitizedExportPanel|TrainingQualityEvidenceSection/,
  );
  assert.match(auditWorkspaceSlice, /StatisticsQueryPanel/);
  assert.match(auditWorkspaceSlice, /DesensitizedExportPanel/);
  assert.match(auditWorkspaceSlice, /SecurityAuditPage/);
  assert.match(auditWorkspaceSlice, /TrainingQualityEvidenceSection/);
  assert.match(auditWorkspaceSlice, /canExportData/);
  assert.match(auditWorkspaceSlice, /canReadAuditLogs/);
  assert.match(auditWorkspaceSlice, /canManageQualityEvidence/);
  assert.match(
    auditWorkspaceSlice,
    /permissions\.canExportData\s*\?\s*\([\s\S]*DesensitizedExportPanel/,
  );
  assert.match(
    auditWorkspaceSlice,
    /permissions\.canManageQualityEvidence\s*\?\s*\([\s\S]*TrainingQualityEvidenceSection/,
  );
  assert.match(actionSource, /canManageQualityEvidence:\s*boolean/);
  assert.match(apiTypeSource, /"quality_evidence\.manage"/);
  assert.match(apiServiceSource, /'quality_evidence\.manage'/);
  assert.doesNotMatch(
    sliceBetween(
      apiServiceSource,
      "if (role === 'admin_operator')",
      "if (role === 'admin_auditor')",
    ),
    /'data\.export'/,
  );
  assert.match(exportPanelSource, /canExportAuditLogs:\s*boolean/);
  assert.match(exportPanelSource, /exportDatasetOptions/);
  assert.match(exportPanelSource, /canSubmitDesensitizedExport/);
  assert.match(exportPolicySource, /datasetOptions\.filter/);
  assert.match(exportPanelSource, /canExportAuditLogs/);
  assert.doesNotMatch(
    exportPanelSource,
    /actionStatus|dataError|exportFeedback/,
    "export feedback must render once through the role shell status region",
  );
  for (const formalAction of [
    "assessment.review",
    "rehab_plan.confirm",
    "collection_batch.create",
    "training_session.start",
    "training_result.submit",
    "training_result.review",
  ]) {
    assert.match(
      securityAuditSource,
      new RegExp(`"${escapeRegExp(formalAction)}"`),
    );
  }
  for (const formalTargetType of [
    "assessment_record",
    "rehab_plan",
    "collection_batch",
    "training_session",
    "training_result",
    "data_export",
  ]) {
    assert.match(
      securityAuditSource,
      new RegExp(`"${escapeRegExp(formalTargetType)}"`),
    );
  }
  assert.match(workspaceSource, /adminWorkspaceFromNavId/);
  assert.match(
    workspaceSource,
    /activeWorkspace=\{adminWorkspaceFromNavId\(activeNavId\)\}/,
  );
  for (const adminNav of [
    /id: "admin", label: "账号"/,
    /id: "contentGovernance", label: "内容"/,
    /id: "operationConfig", label: "配置"/,
    /id: "security", label: "审计"/,
  ]) {
    assert.match(roleNavigationSource, adminNav);
  }
  assert.match(actionSource, /export type AdminGovernanceActions/);
  assert.match(actionSource, /export type AdminGovernancePermissions/);
  assert.match(
    payloadBuilderSource,
    /export function buildGameContentCreatePayload/,
  );
  assert.match(payloadBuilderSource, /export function buildUnityBuildPayload/);
  assert.match(
    payloadBuilderSource,
    /export function buildCollectionConditionPayload/,
  );
  assert.match(
    payloadBuilderSource,
    /export function buildCollectionProtocolPayload/,
  );
  assert.match(payloadBuilderSource, /export function buildDataExportPayload/);
  assert.match(overviewSource, /type AdminOverviewPageProps/);
  assert.match(overviewSource, /actions:\s*AdminGovernanceActions/);
  for (const component of [
    "AccountReviewPanel",
    "TrainingContentGovernance",
    "OperationConfigPanel",
    "CollectionConditionGovernance",
    "StatisticsQueryPanel",
    "DesensitizedExportPanel",
    "SecurityAuditPage",
  ]) {
    assert.match(overviewSource, new RegExp(`<${component}\\b`));
  }

  assert.match(workspaceSource, /<AdminOverviewPage\b/);
  assert.doesNotMatch(workspaceSource, /function AdminScreen/);
  assert.doesNotMatch(workspaceSource, /function SecurityScreen/);
  assert.doesNotMatch(overviewSource, /aside=/);
  assert.doesNotMatch(
    overviewSource,
    /TrainingRuntimePage|BrowserPoseTrainingSurface|UnityTrainingSurface|BrowserPoseGameContainer|UnityGameContainer/,
  );
  assert.doesNotMatch(overviewSource, /patient-task-nav|完成本次训练/);
  assert.doesNotMatch(overviewSource, /fallback|mock|demo/i);
});

test("admin feature modules keep governance details out of patient runtime", async () => {
  const files = [
    "apps/web/src/features/admin/AccountReviewPanel.tsx",
    "apps/web/src/features/admin/TrainingContentGovernance.tsx",
    "apps/web/src/features/admin/OperationConfigPanel.tsx",
    "apps/web/src/features/admin/CollectionConditionGovernance.tsx",
    "apps/web/src/features/admin/StatisticsQueryPanel.tsx",
    "apps/web/src/features/admin/DesensitizedExportPanel.tsx",
    "apps/web/src/features/admin/SecurityAuditPage.tsx",
  ];

  const sources = await Promise.all(
    files.map((path) => readFile(join(rootDir, path), "utf8")),
  );
  const combined = sources.join("\n");

  for (const copy of [
    "账号开通审核",
    "训练内容管理",
    "配置治理",
    "采集条件与协议配置",
    "查询统计",
    "脱敏数据导出",
    "审计日志",
  ]) {
    assert.match(combined, new RegExp(copy));
  }
  assert.doesNotMatch(combined, /检查完成，开始训练|请站在摄像头前/);
});

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  return source.slice(start);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
