import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("care circle has first-class data models and API endpoints", async () => {
  const schemaSource = await readFile(
    join(rootDir, "packages/db/prisma/schema.prisma"),
    "utf8",
  );
  const controllerSource = await readFile(
    join(rootDir, "apps/api/src/app.controller.ts"),
    "utf8",
  );
  const apiClientSource = await readFile(
    join(rootDir, "apps/web/src/lib/api.ts"),
    "utf8",
  );
  const typeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );
  const serviceSource = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );

  assert.match(schemaSource, /model CareCirclePost/);
  assert.match(schemaSource, /model CareCircleComment/);
  assert.match(schemaSource, /model CareCircleReaction/);
  assert.match(schemaSource, /model CarePrecaution/);
  assert.match(serviceSource, /listCareCirclePosts/);
  assert.match(serviceSource, /createCareCirclePost/);
  assert.match(serviceSource, /createCareCircleComment/);
  assert.match(serviceSource, /moderateCareCirclePost/);
  assert.match(serviceSource, /createCarePrecaution/);
  assert.match(controllerSource, /care-circle\/patients\/:id\/posts/);
  assert.match(controllerSource, /care-circle\/posts\/:id\/comments/);
  assert.match(controllerSource, /care-circle\/posts\/:id\/moderate/);
  assert.match(controllerSource, /care-precautions/);
  assert.match(apiClientSource, /careCircle/);
  assert.match(apiClientSource, /createCareCirclePost/);
  assert.match(typeSource, /export type CareCircleResponse/);
  assert.match(typeSource, /export type CarePrecaution/);
});

test("caregiver workspace is extracted and hides internal identifiers", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const caregiverSource = await readFile(
    join(rootDir, "apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx"),
    "utf8",
  );
  const caregiverModelSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/caregiver/caregiver-workspace-model.ts",
    ),
    "utf8",
  );
  const caregiverModelTestSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/caregiver/caregiver-workspace-model.test.ts",
    ),
    "utf8",
  );
  const caregiverScopeSource = await readFile(
    join(rootDir, "apps/web/src/features/caregiver/CaregiverScopePanel.tsx"),
    "utf8",
  );
  const typeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );
  const serviceSource = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );
  const caregiverSources =
    caregiverSource +
    "\n" +
    caregiverModelSource +
    "\n" +
    (await readCaregiverPanelSources());

  assert.match(workspaceSource, /CaregiverWorkspacePage/);
  assert.match(workspaceSource, /buildCaregiverWorkspaceModel/);
  assert.doesNotMatch(workspaceSource, /function FamilyScreen/);
  assert.doesNotMatch(workspaceSource, /function FamilyBinding/);

  for (const copy of [
    "照护",
    "进展",
    "提醒",
    "我的",
    "授权范围",
    "可见范围",
    "授权患者",
    "今日提醒",
    "医生注意事项",
  ]) {
    assert.match(caregiverSource, new RegExp(copy));
  }
  assert.match(caregiverSource, /activeSection|activeWorkspace/);
  assert.doesNotMatch(caregiverSource, /aside=/);
  for (const section of ["overview", "progress", "alerts", "profile"]) {
    assert.match(caregiverSource, new RegExp(`"${section}"`));
  }
  const overviewSlice = sliceBetween(
    caregiverSource,
    'activeSection === "overview"',
    'activeSection === "progress"',
  );
  const progressSlice = sliceBetween(
    caregiverSource,
    'activeSection === "progress"',
    'activeSection === "alerts"',
  );
  const alertsSlice = sliceBetween(
    caregiverSource,
    'activeSection === "alerts"',
    'activeSection === "profile"',
  );
  const profileSlice = sliceFrom(
    caregiverSource,
    'activeSection === "profile"',
  );
  assert.match(overviewSlice, /CaregiverSummaryPanel/);
  assert.doesNotMatch(
    overviewSlice,
    /CaregiverProgressPanel|CaregiverReminderPanel|CaregiverScopePanel/,
  );
  assert.match(progressSlice, /CaregiverProgressPanel/);
  assert.doesNotMatch(
    progressSlice,
    /CaregiverSummaryPanel|CaregiverReminderPanel|CaregiverScopePanel/,
  );
  assert.match(alertsSlice, /CaregiverReminderPanel/);
  assert.doesNotMatch(
    alertsSlice,
    /CaregiverSummaryPanel|CaregiverProgressPanel|CaregiverScopePanel/,
  );
  assert.match(profileSlice, /CaregiverScopePanel/);
  assert.doesNotMatch(
    profileSlice,
    /CaregiverSummaryPanel|CaregiverProgressPanel|CaregiverReminderPanel/,
  );
  assert.doesNotMatch(
    profileSlice + caregiverScopeSource,
    /提醒等级|风险提醒|riskLabel/,
  );

  assert.doesNotMatch(
    caregiverSources,
    /MetricTile|平均得分|平均完成|averageScore|averageCompletion|account|mobilePhone|authorUserId|actorUserId|原始|payload|rawPayload|rawPayloadHash|audit|data export|export file|审计|导出|Provider|provider|Endpoint|endpoint|runtime|manifest|quality evidence|qualityFlag|qualityReasons|质量证据|技术验收|fallback|mock|demo|planItemId/i,
  );
  const caregiverSummaryType = sliceBetween(
    typeSource,
    "export type CaregiverTrainingResult",
    "export type AuditLog",
  );
  assert.doesNotMatch(
    caregiverSummaryType,
    /export type CaregiverTrainingResult = \{\s*id:|export type CaregiverTrainingSession = \{\s*id:|planItemId/,
    "caregiver summary client payload must not expose training, result, or plan-item identifiers",
  );
  const caregiverSummaryService = sliceBetween(
    serviceSource,
    "async caregiverSummary",
    "  private isPatientOwnedRecordView",
  );
  assert.doesNotMatch(
    caregiverSummaryService,
    /id:\s*session\.id|planItemId:\s*session\.planItemId|id:\s*session\.result\.id/,
    "caregiver summary API must not serialize internal training-chain identifiers",
  );
  assert.doesNotMatch(
    caregiverSource,
    /CaregiverSummaryResponse|CareCircleResponse|TrainingRecordSession|\bcaregiverSummary\b|\bcareCircle\b/,
    "caregiver page should receive a sanitized view model, not full API responses",
  );
  assert.match(caregiverSource, /model:\s*CaregiverWorkspaceModel/);
  assert.doesNotMatch(
    caregiverModelSource,
    /return\s+value\s*(?:\?\?|;)/,
    "caregiver enum label helpers must not expose unknown backend strings",
  );
  for (const expectedTestBoundary of [
    "maps unknown care labels to fixed safe copy",
    "builds an unauthorized empty care model",
    "keeps only published reminders and visible notes",
    "limits caregiver reminders and notes",
    "keeps caregiver progress quiet without average scoring stats",
  ]) {
    assert.match(
      caregiverModelTestSource,
      new RegExp(expectedTestBoundary),
      `missing caregiver model boundary test: ${expectedTestBoundary}`,
    );
  }
  assert.doesNotMatch(caregiverSource, /GlassCard|ScreenGrid|PrimaryButton/);
});

test("caregiver family observations use real care-circle actions and reload", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const caregiverPanelSource = await readFile(
    join(rootDir, "apps/web/src/features/caregiver/CaregiverReminderPanel.tsx"),
    "utf8",
  );

  assert.match(caregiverPanelSource, /onCreateNote/);
  assert.match(caregiverPanelSource, /onCreateComment/);
  assert.match(workspaceSource, /handleCreateCareCirclePost/);
  assert.match(workspaceSource, /api\.createCareCirclePost/);
  assert.match(workspaceSource, /handleCreateCareCircleComment/);
  assert.match(workspaceSource, /api\.createCareCircleComment/);
  assert.match(
    sliceBetween(
      workspaceSource,
      "async function handleCreateCareCirclePost",
      "async function handleCreateCareCircleComment",
    ),
    /await reloadRoleData\(session,\s*patientId\)/,
  );
  assert.match(
    sliceBetween(
      workspaceSource,
      "async function handleCreateCareCircleComment",
      "  return (\n    <AppShell",
    ),
    /await reloadRoleData\(session,\s*patientId\)/,
  );
  assert.doesNotMatch(workspaceSource, /setData\([^)]*careCircle/);
});

test("care-circle audit metadata excludes raw post and comment body text", async () => {
  const serviceSpecSource = await readFile(
    join(rootDir, "apps/api/src/app.service.spec.ts"),
    "utf8",
  );
  const testSource = sliceBetween(
    serviceSpecSource,
    "creates posts and comments with exact row-bound envelopes and no legacy plaintext writes",
    "allows doctors to hide inappropriate posts from caregiver lists",
  );

  assert.match(
    testSource,
    /expect\(auditPayload\)\.toContain\((['"])care_circle\.post\.create\1\)/,
  );
  assert.match(
    testSource,
    /expect\(auditPayload\)\.toContain\((['"])care_circle\.comment\.create\1\)/,
  );
  assert.match(
    testSource,
    /expect\(auditPayload\)\.not\.toContain\((['"])妈妈今天主动完成训练\1\)/,
  );
  assert.match(
    testSource,
    /expect\(auditPayload\)\.not\.toContain\((['"])继续加油\1\)/,
  );
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

async function readCaregiverPanelSources() {
  const files = [
    "apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx",
    "apps/web/src/features/caregiver/CaregiverProgressPanel.tsx",
    "apps/web/src/features/caregiver/CaregiverReminderPanel.tsx",
    "apps/web/src/features/caregiver/CaregiverScopePanel.tsx",
  ];
  const sources = await Promise.all(
    files.map((path) => readFile(join(rootDir, path), "utf8")),
  );
  return sources.join("\n");
}
