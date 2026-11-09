import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("app page delegates shared shell and UI primitives out of the page file", async () => {
  const pageSource = await readFile(
    join(rootDir, "apps/web/src/app/page.tsx"),
    "utf8",
  );
  const roleShellSource = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );

  for (const importPath of [
    "@/features/session/role-workspace",
  ]) {
    assert.match(pageSource, new RegExp(`from ["']${escapeRegExp(importPath)}["']`));
  }
  assert.match(pageSource, /<RoleWorkspace \/>/);
  assert.ok(pageSource.split("\n").length < 1800, "page.tsx must stay thin");

  for (const localDefinition of [
    "ScreenGrid",
    "DashboardShell",
    "MetricCard",
    "Badge",
    "Chip",
    "FieldLine",
    "SelectField",
    "CheckLine",
    "TextAreaField",
    "NumberField",
    "StatusList",
    "Progress",
    "Ring",
  ]) {
    assert.doesNotMatch(
      pageSource,
      new RegExp(`^(?:function|const) ${localDefinition}\\b`, "m"),
      `page.tsx must not define local UI primitive ${localDefinition}`,
    );
  }

  assert.doesNotMatch(pageSource, /^const (GlassCard|PrimaryButton|ScreenGrid)\s*=\s*function\b/m);

  assert.match(
    roleShellSource,
    /from ["']@\/components\/layout\/PatientTaskLayout["']/,
    "RoleShell must own PatientTaskLayout composition for patient-like workspaces",
  );

  for (const path of [
    "apps/web/src/components/ui/Button.tsx",
    "apps/web/src/components/ui/Card.tsx",
    "apps/web/src/components/ui/StatusBadge.tsx",
    "apps/web/src/components/ui/MetricTile.tsx",
    "apps/web/src/components/layout/AppShell.tsx",
    "apps/web/src/components/layout/PatientTaskLayout.tsx",
    "apps/web/src/components/layout/WorkbenchLayout.tsx",
    "apps/web/src/components/layout/GovernanceLayout.tsx",
    "apps/web/src/features/session/role-workspace.tsx",
    "apps/web/src/features/session/role-navigation.ts",
    "apps/web/src/features/session/useRoleSession.ts",
    "apps/web/src/features/session/useRoleData.ts",
  ]) {
    await readFile(join(rootDir, path), "utf8");
  }
});

test("shared UI primitives expose role-neutral component APIs", async () => {
  const buttonSource = await readFile(
    join(rootDir, "apps/web/src/components/ui/Button.tsx"),
    "utf8",
  );
  const cardSource = await readFile(
    join(rootDir, "apps/web/src/components/ui/Card.tsx"),
    "utf8",
  );

  assert.match(buttonSource, /\bintent\b/);
  assert.match(buttonSource, /\bisLoading\b/);
  assert.match(buttonSource, /\bdisabled\b/);
  assert.match(buttonSource, /\bchildren\b/);
  for (const intent of ["primary", "secondary", "danger", "quiet"]) {
    assert.match(buttonSource, new RegExp(`["']${intent}["']`));
  }

  assert.match(cardSource, /\btone\b/);
  for (const tone of ["patient", "workbench", "governance", "plain"]) {
    assert.match(cardSource, new RegExp(`["']${tone}["']`));
  }
});

test("legacy patient today and prep screens no longer reuse workbench grid", async () => {
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  assert.doesNotMatch(todaySource, /<ScreenGrid/);
  assert.doesNotMatch(prepSource, /<ScreenGrid/);
});

test("secondary patient screens are extracted from role workspace", async () => {
  const roleWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const devicePageSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/DevicePermissionCenterPage.tsx"),
    "utf8",
  );
  const planSuggestionSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PlanSuggestionPage.tsx"),
    "utf8",
  );

  for (const oldFunction of [
    "AssessmentScreen",
    "RecognitionPanel",
    "AiConversationPanel",
    "Ad8AssessmentPanel",
    "DevicePermissionCenterScreen",
    "PoseCheckCard",
    "MatchScreen",
    "PlanRecommendation",
    "TrainingFeedbackPanel",
    "HistoryPanel",
  ]) {
    assert.doesNotMatch(
      roleWorkspaceSource,
      new RegExp(`function ${oldFunction}\\b`),
      `${oldFunction} should live outside role-workspace.tsx`,
    );
  }
  assert.doesNotMatch(
    roleWorkspaceSource,
    /const GlassCard|const PrimaryButton|function FieldLine|function SelectField|ScreenGrid/,
  );
  assert.match(devicePageSource, /export function DevicePermissionCenterPage/);
  assert.match(devicePageSource, /PoseCheckCard/);
  assert.match(planSuggestionSource, /export function PlanSuggestionPage/);
  assert.match(planSuggestionSource, /PlanRecommendation/);
});

test("session workspace delegates payload builders and status helpers", async () => {
  const roleWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const adminPayloadBuildersSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-payload-builders.ts"),
    "utf8",
  );
  const patientReadinessSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-readiness-orchestration.ts"),
    "utf8",
  );
  const actionStatusSource = await readFile(
    join(rootDir, "apps/web/src/features/session/action-status.ts"),
    "utf8",
  );
  const aiConversationReviewSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/AiConversationReviewPanel.tsx"),
    "utf8",
  );
  const planEditorSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/PlanEditor.tsx"),
    "utf8",
  );
  const trainingResultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );

  assert.ok(
    roleWorkspaceSource.split("\n").length < 3100,
    "role-workspace.tsx must stay below 3100 lines and only own session, routing, and real API orchestration",
  );

  for (const [delegatedDefinition, delegatedSource] of [
    ["AiConversationReviewPanel", aiConversationReviewSource],
    ["buildPlanEditorConfirmationPayload", planEditorSource],
    ["patientDoctorReviewStatus", trainingResultSource],
  ]) {
    assert.doesNotMatch(
      roleWorkspaceSource,
      new RegExp(`function ${delegatedDefinition}\\b`),
      `${delegatedDefinition} should live outside role-workspace.tsx`,
    );
    assert.match(
      delegatedSource,
      new RegExp(`(?:export )?function ${delegatedDefinition}\\b`),
      `${delegatedDefinition} must be owned by its focused feature module`,
    );
  }

  for (const localDefinition of [
    "DashboardShell",
    "SurfacePanel",
    "Badge",
    "Chip",
    "FormInput",
    "FormSelect",
    "ReadonlyFormBlock",
    "PlanNumberInput",
    "StatusList",
    "Waveform",
    "Ring",
    "PlanRows",
    "MissingDataCard",
    "RewardProgressPanel",
    "TaskList",
    "PatientCreatePanel",
    "buildCreatePatientPayload",
    "buildCreateCaregiverAccountPayload",
    "buildCreateRegistrationRequestPayload",
    "buildCaregiverRelationPayload",
    "parseRequiredTrimmedText",
    "assertNumberRange",
    "readNumber",
    "parseRequiredNumber",
    "downloadExportedFile",
  ]) {
    assert.doesNotMatch(
      roleWorkspaceSource,
      new RegExp(`^(?:function|const) ${localDefinition}\\b`, "m"),
      `${localDefinition} should live outside role-workspace.tsx`,
    );
  }

  assert.doesNotMatch(
    roleWorkspaceSource,
    /rounded-2xl|rounded-3xl|backdrop-blur|bg-\[#|text-\[#|border-\[#|bg-white\/|border-white\/|text-white\/|font-mono|radial-gradient|linear-gradient|shadow-\[/i,
    "role-workspace.tsx must not carry raw visual styling; use extracted UI/layout primitives",
  );

  for (const extractedBuilder of [
    "buildGameContentCreatePayload",
    "buildUnityBuildPayload",
    "buildCollectionConditionPayload",
    "buildCollectionProtocolPayload",
    "buildDataExportPayload",
  ]) {
    assert.doesNotMatch(
      roleWorkspaceSource,
      new RegExp(`function ${extractedBuilder}\\b`),
      `${extractedBuilder} should live outside role-workspace.tsx`,
    );
    assert.match(
      adminPayloadBuildersSource,
      new RegExp(`export function ${extractedBuilder}\\b`),
      `${extractedBuilder} should be exported by admin payload builders`,
    );
  }

  assert.doesNotMatch(
    roleWorkspaceSource,
    /function buildFormalGameDifficultyPolicy|function buildFormalGameRequiredPermissions|function buildFormalGameResultSchema/,
  );
  assert.match(adminPayloadBuildersSource, /buildFormalGameDifficultyPolicy/);
  assert.match(adminPayloadBuildersSource, /buildFormalGameRequiredPermissions/);
  assert.match(adminPayloadBuildersSource, /buildFormalGameResultSchema/);

  assert.match(patientReadinessSource, /resolveTrainingPrepCameraRequirement/);
  assert.match(patientReadinessSource, /patientTrainingPrepNextStepMessage/);
  assert.match(patientReadinessSource, /trainingPrepSyncedStatus/);
  assert.match(patientReadinessSource, /batch\.patientId === patientId/);
  assert.doesNotMatch(patientReadinessSource, /Boolean\(batch\.patientId\)/);

  assert.match(actionStatusSource, /doctorSafeActionStatus/);
  assert.match(actionStatusSource, /patientSafeActionStatus/);
  assert.match(actionStatusSource, /adminActionStatus/);
  assert.doesNotMatch(actionStatusSource, /fallback|mock|demo/i);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
