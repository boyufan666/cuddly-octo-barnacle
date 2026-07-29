import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("frontend API client exposes formal collection setup mutations", async () => {
  const apiSource = await readFile(
    join(rootDir, "apps/web/src/lib/api.ts"),
    "utf8",
  );
  const typeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );

  assert.match(typeSource, /export type CreateCollectionConditionRequest/);
  assert.match(typeSource, /export type CreateCollectionProtocolRequest/);
  assert.match(typeSource, /export type CreateCollectionBatchRequest/);
  assert.match(apiSource, /collectionConditions/);
  assert.match(apiSource, /"\/admin\/collection-conditions"/);
  assert.match(apiSource, /createCollectionCondition/);
  assert.match(apiSource, /"\/admin\/collection-conditions"/);
  assert.match(apiSource, /createCollectionProtocol/);
  assert.match(apiSource, /"\/admin\/collection-protocols"/);
  assert.match(apiSource, /createCollectionBatch/);
  assert.match(apiSource, /"\/collection-batches"/);
});

test("admin and doctor screens provide formal collection preparation entry points", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const patientTrainingActionsSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-actions.ts"),
    "utf8",
  );
  const doctorPanelSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/DataCollectionReviewPanel.tsx"),
    "utf8",
  );
  const doctorWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/DoctorWorkspacePage.tsx"),
    "utf8",
  );
  const adminOverviewSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/AdminOverviewPage.tsx"),
    "utf8",
  );
  const adminPanelSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/CollectionConditionGovernance.tsx"),
    "utf8",
  );

  assert.match(doctorWorkspaceSource, /DataCollectionReviewPanel/);
  assert.match(adminOverviewSource, /CollectionConditionGovernance/);
  assert.match(adminOverviewSource, /collectionCondition/);
  assert.match(adminOverviewSource, /collectionProtocol/);
  assert.match(workspaceSource, /collectionConditionForm/);
  assert.match(workspaceSource, /collectionProtocolForm/);
  assert.match(workspaceSource, /collectionBatchForm/);
  assert.match(workspaceSource, /handleCreateCollectionCondition/);
  assert.match(workspaceSource, /handleCreateCollectionProtocol/);
  assert.match(workspaceSource, /handleCreateCollectionBatch/);
  assert.match(adminPanelSource, /创建采集条件/);
  assert.match(adminPanelSource, /创建采集协议/);
  assert.match(adminPanelSource, /正式采集条件/);
  assert.match(adminPanelSource, /正式采集协议/);
  assert.match(adminPanelSource, /采集环境 JSON/);
  assert.match(adminPanelSource, /设备要求 JSON/);
  assert.match(adminPanelSource, /条件规则 JSON/);
  assert.match(adminPanelSource, /采样配置 JSON/);
  assert.match(adminPanelSource, /质量门禁 JSON/);
  assert.match(doctorPanelSource, /患者训练准备/);
  assert.match(doctorPanelSource, /创建训练准备记录/);
  assert.match(doctorPanelSource, /设备要求/);
  assert.match(doctorPanelSource, /训练安排/);
  assert.match(doctorPanelSource, /训练准备/);
  assert.match(doctorPanelSource, /训练前检查/);
  assert.match(doctorPanelSource, /训练质量/);
  assert.doesNotMatch(doctorPanelSource, /采集条件摘要|协议版本|质量规则/);
});

test("patient training copy keeps collection batch details out of patient flow", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const checklistSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );
  const patientWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );

  const prepSource = sliceBetween(
    patientWorkspaceSource,
    'if (active === "prep")',
    'if (active === "game")',
  );

  assert.match(workspaceSource, /今天的训练还未完成准备，请联系医师或工作人员处理。/);
  assert.match(checklistSource, /同步训练安排/);
  assert.match(prepSource, /onRefreshTrainingPreparation/);
  assert.doesNotMatch(
    `${prepSource}\n${checklistSource}`,
    /采集批次|采集协议|collectionBatch|protocolId/i,
  );
});

test("patient training prep can refresh formal preparation without creating fallback data", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const patientWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const patientTrainingActionsSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-actions.ts"),
    "utf8",
  );
  const refreshSource = sliceBetween(
    workspaceSource,
    "async function handleRefreshTrainingPreparation",
    "async function handleCheckTrainingDevice",
  );
  const prepUsageSource = sliceBetween(
    patientWorkspaceSource,
    'if (active === "prep")',
    'if (active === "game")',
  );

  assert.match(patientTrainingActionsSource, /refreshTrainingPreparation/);
  assert.match(patientTrainingActionsSource, /api\.collectionBatches/);
  assert.match(refreshSource, /refreshTrainingPreparation/);
  assert.match(refreshSource, /setData\(\(current\)/);
  assert.doesNotMatch(refreshSource + patientTrainingActionsSource, /api\.createCollectionBatch/);
  assert.doesNotMatch(refreshSource + patientTrainingActionsSource, /createCollectionBatch|POST|fallback/i);
  assert.match(prepUsageSource, /onRefreshTrainingPreparation/);
});

test("patient role data loading does not request doctor collection protocol catalog", async () => {
  const roleDataSource = await readFile(
    join(rootDir, "apps/web/src/features/session/useRoleData.ts"),
    "utf8",
  );
  const patientDataLoadSource = sliceBetween(
    roleDataSource,
    'if (patientId && role === "patient")',
    'if (patientId && role === "doctor")',
  );
  const doctorDataLoadSource = sliceBetween(
    roleDataSource,
    'if (patientId && role === "doctor")',
    'if (patientId && role === "caregiver")',
  );
  const adminDataLoadSource = sliceBetween(
    roleDataSource,
    'if (isAdminRole(role))',
    'if (role === "doctor")',
  );

  assert.doesNotMatch(patientDataLoadSource, /api\.collectionProtocols/);
  assert.match(patientDataLoadSource, /api\.collectionBatches/);
  assert.match(doctorDataLoadSource, /api\.collectionProtocols/);
  assert.match(adminDataLoadSource, /api\.collectionConditions/);
}
);

test("patient and caregiver visible surfaces do not expose collection or runtime evidence terms", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const roleShellSource = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const patientFeatureSources = await Promise.all(
    [
      "TodayTrainingPage.tsx",
      "TrainingTaskPicker.tsx",
      "TrainingPrepChecklist.tsx",
      "TrainingRuntimePage.tsx",
      "TrainingResultPage.tsx",
      "GameLibraryPage.tsx",
      "PatientHomeNav.tsx",
      "AssessmentDialoguePage.tsx",
      "DevicePermissionCenterPage.tsx",
      "PlanSuggestionPage.tsx",
      "patient-training-copy.ts",
    ].map((fileName) =>
      readFile(join(rootDir, "apps/web/src/features/patient", fileName), "utf8"),
    ),
  );
  const caregiverFeatureSources = await Promise.all(
    [
      "CaregiverWorkspacePage.tsx",
      "CaregiverSummaryPanel.tsx",
      "CaregiverProgressPanel.tsx",
      "CaregiverReminderPanel.tsx",
      "CaregiverScopePanel.tsx",
      "caregiver-workspace-model.ts",
    ].map((fileName) =>
      readFile(join(rootDir, "apps/web/src/features/caregiver", fileName), "utf8"),
    ),
  );
  const pagePatientSlices = [
    sliceBetween(roleShellSource, "export function RoleShell", "function AppNavigation"),
    sliceFrom(roleShellSource, "function PatientTaskNavigation"),
  ].join("\n");
  const visibleCopy = visibleTextLiterals(
    `${patientFeatureSources.join("\n")}\n${caregiverFeatureSources.join("\n")}\n${pagePatientSlices}`,
  );

  assert.doesNotMatch(
    visibleCopy,
    /采集批次|采集协议|collectionBatch|protocolId|runtimeConfigSnapshot|rawPayload|rawSummary|manifestUrl|bridgeProtocol|gameRunId|deviceCode|MediaPipe|Phaser|Unity loader|审计日志 ID|payload|provider/i,
  );
  assert.match(visibleCopy, /训练安排|开始训练准备|完成本次训练|今日训练记录|家属/);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  return source.slice(start);
}

function visibleTextLiterals(source) {
  return Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) => text.trim())
    .filter(Boolean)
    .join("\n");
}
