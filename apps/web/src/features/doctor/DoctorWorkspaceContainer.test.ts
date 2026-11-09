import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("doctor workspace preserves concurrent busy booleans across the content boundary", async () => {
  const source = await readFile(
    new URL("./DoctorWorkspaceContainer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /isPlanBusy=\{isConfirmingPlan\}/);
  assert.match(source, /isConfirmRiskBusy=\{isConfirmingRisk\}/);
  assert.match(
    source,
    /isCollectionPreparationBusy=\{isCreatingCollectionBatch\}/,
  );
  assert.match(source, /isTrainingReviewBusy=\{isReviewingTraining\}/);
  assert.match(source, /api\.recommendPlan\(\{ patientId: patient\.id \}\)/);
  assert.match(source, /recommendation\.status !== "pending_confirm"/);
  assert.doesNotMatch(source, /buildDoctorPlanConfirmationPayload/);
  assert.doesNotMatch(source, /doctorWorkbenchActionState|\?\s*"confirmPlan"/);
});

test("doctor workspace receives data.aiConversations and connects formal assessment refresh callbacks", async () => {
  const containerSource = await readFile(
    new URL("./DoctorWorkspaceContainer.tsx", import.meta.url),
    "utf8",
  );
  const workspaceSource = await readFile(
    new URL("../session/role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const actionSource = await readFile(
    new URL("../session/ai-conversation-actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /aiConversations=\{data\.aiConversations\}/);
  assert.match(
    workspaceSource,
    /onCreateAssessment=\{handleCreateAssessmentFromAiConversation\}/,
  );
  assert.match(
    workspaceSource,
    /onReviewAiConversation=\{handleReviewAiConversationFromDoctor\}/,
  );
  assert.match(actionSource, /api\.createAssessment\(payload\)/);
  assert.match(actionSource, /api\.reviewAiConversation\(sessionId, payload\)/);
  assert.match(
    actionSource,
    /reloadRoleData\(session, payload\.patientId\)/,
  );
  assert.match(
    actionSource,
    /当前 AI 对话尚无成功保存的正式评估，不能执行批准/,
  );
  assert.match(
    containerSource,
    /aiConversations,\s*assessments: patient\?\.assessments/,
  );
});

test("doctor workspace loads, navigates to, and reviews existing patient registration requests", async () => {
  const containerSource = await readFile(
    new URL("./DoctorWorkspaceContainer.tsx", import.meta.url),
    "utf8",
  );
  const pageSource = await readFile(
    new URL("./DoctorWorkspacePage.tsx", import.meta.url),
    "utf8",
  );
  const roleDataSource = await readFile(
    new URL("../session/useRoleData.ts", import.meta.url),
    "utf8",
  );
  const workspaceSource = await readFile(
    new URL("../session/role-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    roleDataSource,
    /label: "患者账号开通申请"[\s\S]*api\.registrationRequests\(context\)/,
  );
  assert.match(
    workspaceSource,
    /registrationRequests=\{data\.registrationRequests\}/,
  );
  assert.match(
    workspaceSource,
    /onReviewRegistrationRequest=\{handleReviewRegistrationRequest\}/,
  );
  assert.match(containerSource, /requests: registrationRequests/);
  assert.match(containerSource, /canReview: true/);
  assert.match(
    pageSource,
    /activeWorkspace === "registration"[\s\S]*AccountReviewPanel/,
  );
});
