import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("doctor workbench is split into focused clinical workspaces", async () => {
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const workspaceStateSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace-state.ts"),
    "utf8",
  );
  const doctorWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/DoctorWorkspacePage.tsx"),
    "utf8",
  );
  const doctorContainerSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/DoctorWorkspaceContainer.tsx"),
    "utf8",
  );
  const doctorModelSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/doctor-workbench-model.ts"),
    "utf8",
  );
  const doctorActionSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/doctor-workbench-actions.ts"),
    "utf8",
  );
  const doctorStatusSource = visibleStringLiterals(
    sliceBetween(
      workspaceSource,
      "async function handleCreateTtsSpeechOutput",
      "async function handleGrantConsent",
    ),
  );
  const combinedDoctorModules = await readDoctorModules();
  const selectPatientSource = sliceBetween(
    workspaceSource,
    "async function handleSelectPatient",
    "function updateAssessmentForm",
  );
  const clearPatientScopedStateSource = sliceBetween(
    workspaceSource,
    "const clearPatientScopedState",
    "const {",
  );
  const resetPatientScopedStateSource = sliceBetween(
    workspaceStateSource,
    "export function resetPatientScopedWorkspaceState",
    "export function shouldApplyRoleActionSideEffect",
  );
  const confirmRiskSource = sliceBetween(
    workspaceSource,
    "async function handleConfirmRisk",
    "async function handleReturnAssessment",
  );

  assert.match(workspaceSource, /DoctorWorkspaceContainer/);
  assert.match(workspaceSource, /<DoctorWorkspaceContainer\b/);
  assert.match(workspaceSource, /active === "assessment"/);
  assert.match(workspaceSource, /doctorWorkspaceFromNavId/);
  assert.match(doctorWorkspaceSource, /data-testid="doctor-primary-workbench"/);
  assert.match(doctorWorkspaceSource, /activeWorkspace/);
  for (const workspace of [
    "patients",
    "assessment",
    "plan",
    "preparation",
    "review",
  ]) {
    assert.match(doctorWorkspaceSource, new RegExp(`"${workspace}"`));
  }
  const patientsWorkspaceSlice = sliceBetween(
    doctorWorkspaceSource,
    'activeWorkspace === "patients"',
    'activeWorkspace === "assessment"',
  );
  const assessmentWorkspaceSlice = sliceBetween(
    doctorWorkspaceSource,
    'activeWorkspace === "assessment"',
    'activeWorkspace === "plan"',
  );
  const planWorkspaceSlice = sliceBetween(
    doctorWorkspaceSource,
    'activeWorkspace === "plan"',
    'activeWorkspace === "preparation"',
  );
  const preparationWorkspaceSlice = sliceBetween(
    doctorWorkspaceSource,
    'activeWorkspace === "preparation"',
    'activeWorkspace === "review"',
  );
  const reviewWorkspaceSlice = sliceFrom(
    doctorWorkspaceSource,
    'activeWorkspace === "review"',
  );

  assert.match(patientsWorkspaceSlice, /<PatientQueue\b/);
  assert.match(patientsWorkspaceSlice, /<PatientClinicalSummary\b/);
  assert.doesNotMatch(
    patientsWorkspaceSlice,
    /AssessmentReviewPanel|PlanEditor|DataCollectionReviewPanel|TrainingReviewQueue/,
  );
  assert.match(assessmentWorkspaceSlice, /<AssessmentReviewPanel\b/);
  assert.doesNotMatch(
    assessmentWorkspaceSlice,
    /PlanEditor|DataCollectionReviewPanel|TrainingReviewQueue/,
  );
  assert.match(planWorkspaceSlice, /<PlanEditor\b/);
  assert.doesNotMatch(
    planWorkspaceSlice,
    /DataCollectionReviewPanel|TrainingReviewQueue/,
  );
  assert.match(preparationWorkspaceSlice, /<DataCollectionReviewPanel\b/);
  assert.doesNotMatch(
    preparationWorkspaceSlice,
    /<PlanEditor|TrainingReviewQueue/,
  );
  assert.match(reviewWorkspaceSlice, /<TrainingReviewQueue\b/);

  for (const copy of [
    "患者队列",
    "评估复核",
    "计划管理",
    "训练准备",
    "训练复核",
  ]) {
    assert.match(
      doctorWorkspaceSource + combinedDoctorModules,
      new RegExp(copy),
    );
  }
  assert.match(combinedDoctorModules, /确认风险|风险确认/);
  assert.match(
    combinedDoctorModules,
    /创建训练准备|准备记录|设备要求|训练安排|确认计划/,
  );
  assert.match(combinedDoctorModules, /提交复核|保存复核/);
  assert.match(doctorContainerSource, /isPlanBusy=\{isConfirmingPlan\}/);
  assert.match(doctorContainerSource, /isConfirmRiskBusy=\{isConfirmingRisk\}/);
  assert.match(
    doctorContainerSource,
    /isCollectionPreparationBusy=\{isCreatingCollectionBatch\}/,
  );
  assert.match(
    doctorContainerSource,
    /isTrainingReviewBusy=\{isReviewingTraining\}/,
  );
  assert.doesNotMatch(doctorContainerSource, /doctorWorkbenchActionState/);
  assert.match(doctorContainerSource, /buildDoctorWorkbenchModel/);
  assert.match(doctorActionSource, /buildDoctorTrainingReviewPayload/);
  assert.match(doctorContainerSource, /buildDoctorPlanConfirmationPayload/);
  assert.match(workspaceSource, /handleConfirmRisk/);
  assert.match(workspaceSource, /reviewAssessment/);
  assert.match(doctorActionSource, /buildDoctorAssessmentReviewPayload/);
  assert.match(doctorActionSource, /api\.reviewAssessment/);
  assert.match(doctorContainerSource, /onConfirmRisk/);
  assert.doesNotMatch(
    doctorContainerSource,
    /\bisConfirmRiskDisabled\s*(?:\r?\n|\/>)/,
    "risk confirmation cannot be disabled by a bare JSX prop",
  );
  assert.doesNotMatch(
    doctorModelSource,
    /isApproveDisabled:\s*true|isReturnDisabled:\s*true/,
    "assessment review actions must be driven by real assessment state, not hard-disabled",
  );
  assertSourceOrder(
    confirmRiskSource,
    "buildDoctorAssessmentReviewPayload",
    'startBusyAction("confirmRisk")',
  );
  assertSourceOrder(
    confirmRiskSource,
    'startBusyAction("confirmRisk")',
    "reviewAssessment",
  );
  assertSourceOrder(
    confirmRiskSource,
    "reviewAssessment",
    "await reloadRoleData",
  );
  assertSourceOrder(
    confirmRiskSource,
    "await reloadRoleData",
    "评估风险结论已确认",
  );
  assert.doesNotMatch(
    confirmRiskSource,
    /\bsetBusyAction\s*\(/,
    "risk confirmation must use the scoped busy-action lifecycle",
  );
  assert.match(
    confirmRiskSource,
    /finally\s*\{\s*if \(isRoleActionIdentityCurrent\(actionIdentity\)\) \{\s*finishBusyAction\("confirmRisk"\);\s*\}\s*\}/,
    "risk confirmation must release its busy action in the current action identity's finally block",
  );
  assert.match(selectPatientSource, /clearPatientScopedState\(\)/);
  assert.match(
    clearPatientScopedStateSource,
    /collectionBatchForm:\s*\(\)\s*=>\s*setCollectionBatchForm\(emptyCollectionBatchForm\)/,
  );
  for (const resetter of [
    "pendingPlan",
    "selectedTrainingPlanItem",
    "activeTrainingSession",
    "trainingReadiness",
    "trainingResultDraft",
    "trainingReviewForm",
    "collectionBatchForm",
    "browserPoseEvidenceForm",
    "unityFieldEvidenceForm",
    "assessmentForm",
    "aiConversationForm",
    "ad8AssessmentForm",
    "caregiverBindingForm",
    "caregiverNoteForm",
    "caregiverCommentForms",
    "busyActions",
    "actionStatus",
  ]) {
    assert.match(
      resetPatientScopedStateSource,
      new RegExp(`resetters\\.${resetter}\\(\\)`),
    );
  }
  assert.doesNotMatch(
    doctorWorkspaceSource + doctorContainerSource + combinedDoctorModules,
    /康复激励|当前积分|成就|patient-task-nav|rounded-2xl|rounded-3xl|#[0-9a-fA-F]{3,8}|Unity loader|manifest|Provider|Endpoint|endpointRef|rawPayload|rawEvidence|auditId|审计\s*ID|验收|fallback|mock|demo/i,
  );
  assert.doesNotMatch(
    combinedDoctorModules,
    /provider|modelVersion|callId|promptVersion|calledAt|服务方|模型|调用编号|提示词版本|运行方式|runtimeType|manifestUrl/i,
  );
  assert.doesNotMatch(
    combinedDoctorModules,
    /正式采集协议|待配置协议|采集条件摘要|协议版本|批次备注|质量规则/,
  );
  assert.match(
    combinedDoctorModules,
    /doctorPreparationRuleLabel|doctorPreparationConditionLabel/,
    "doctor preparation UI should sanitize backend preparation rule names before rendering",
  );
  assert.doesNotMatch(
    combinedDoctorModules,
    /summaryProtocol\?\.name|summaryCondition\?\.name/,
    "doctor preparation UI must not render raw protocol or condition names directly",
  );
  assert.doesNotMatch(
    doctorStatusSource,
    /调用记录|审计/,
    "doctor primary flow status copy must stay clinical and not expose audit or provider-call wording",
  );
});

test("doctor feature modules expose clinical review surfaces", async () => {
  const files = [
    "apps/web/src/features/doctor/PatientQueue.tsx",
    "apps/web/src/features/doctor/PatientClinicalSummary.tsx",
    "apps/web/src/features/doctor/AssessmentReviewPanel.tsx",
    "apps/web/src/features/doctor/PlanEditor.tsx",
    "apps/web/src/features/doctor/DataCollectionReviewPanel.tsx",
    "apps/web/src/features/doctor/TrainingReviewQueue.tsx",
  ];

  const sources = await Promise.all(
    files.map((path) => readFile(join(rootDir, path), "utf8")),
  );
  const combined = sources.join("\n");

  for (const copy of [
    "患者队列",
    "患者摘要",
    "风险确认",
    "计划管理",
    "准备记录",
    "设备要求",
    "训练复核",
  ]) {
    assert.match(combined, new RegExp(copy));
  }
  assert.doesNotMatch(
    combined,
    /provider|modelVersion|callId|promptVersion|endpointRef|rawPayload|rawEvidence|auditId|审计\s*ID|运行方式|runtimeType|manifestUrl|fallback|mock|demo/i,
  );
  assert.doesNotMatch(
    combined,
    /正式采集协议|待配置协议|采集条件摘要|协议版本|批次备注|质量规则/,
  );
});

async function readDoctorModules() {
  const files = [
    "apps/web/src/features/doctor/DoctorWorkspacePage.tsx",
    "apps/web/src/features/doctor/PatientQueue.tsx",
    "apps/web/src/features/doctor/PatientClinicalSummary.tsx",
    "apps/web/src/features/doctor/AssessmentReviewPanel.tsx",
    "apps/web/src/features/doctor/PlanEditor.tsx",
    "apps/web/src/features/doctor/DataCollectionReviewPanel.tsx",
    "apps/web/src/features/doctor/TrainingReviewQueue.tsx",
  ];
  const sources = await Promise.all(
    files.map((path) => readFile(join(rootDir, path), "utf8")),
  );
  return sources.join("\n");
}

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

function assertSourceOrder(source, before, after) {
  const beforeIndex = source.indexOf(before);
  assert.notEqual(beforeIndex, -1, `Missing source marker: ${before}`);
  const afterIndex = source.indexOf(after);
  assert.notEqual(afterIndex, -1, `Missing source marker: ${after}`);
  assert.ok(
    beforeIndex < afterIndex,
    `Expected ${before} to appear before ${after}`,
  );
}

function visibleStringLiterals(source) {
  return Array.from(
    source.matchAll(/["'`]([^"'`{}]*[\u4e00-\u9fa5][^"'`{}]*)["'`]/g),
    ([, text]) => text.trim(),
  ).join("\n");
}
