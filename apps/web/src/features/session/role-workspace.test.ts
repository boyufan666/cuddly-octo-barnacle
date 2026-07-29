import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrainingSession } from "@/types/api";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

const patientScopedStateKeys = [
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
] as const;

type TestPatientTrainingLifecycleClaim = Readonly<{
  action: "resumeTraining" | "abortTraining";
}>;

test("patient workspace reset clears every patient-scoped state group", async () => {
  const workspaceModule = await import("./role-workspace");
  const resetPatientScopedWorkspaceState = (
    workspaceModule as typeof workspaceModule & {
      resetPatientScopedWorkspaceState?: (
        resetters: Record<(typeof patientScopedStateKeys)[number], () => void>,
      ) => void;
    }
  ).resetPatientScopedWorkspaceState;
  const resetKeys: string[] = [];
  const resetters = {} as Record<
    (typeof patientScopedStateKeys)[number],
    () => void
  >;
  for (const key of patientScopedStateKeys) {
    resetters[key] = () => {
      resetKeys.push(key);
    };
  }

  assert.equal(typeof resetPatientScopedWorkspaceState, "function");
  resetPatientScopedWorkspaceState?.(resetters);
  assert.deepEqual(resetKeys, patientScopedStateKeys);
});

test("role action identity rejects an older patient in the same session", async () => {
  const { shouldApplyRoleActionSideEffect } = await import("./role-workspace");

  assert.equal(
    shouldApplyRoleActionSideEffect({
      operationWorkspaceGeneration: 1,
      activeWorkspaceGeneration: 1,
      isWorkspaceMounted: true,
      operationSessionToken: "session-current",
      activeSessionToken: "session-current",
      operationPatientId: "patient-old",
      activePatientId: "patient-new",
    }),
    false,
  );
});

test("role action identity rejects an older or logged-out session", async () => {
  const { shouldApplyRoleActionSideEffect } = await import("./role-workspace");

  assert.equal(
    shouldApplyRoleActionSideEffect({
      operationWorkspaceGeneration: 1,
      activeWorkspaceGeneration: 1,
      isWorkspaceMounted: true,
      operationSessionToken: "session-old",
      activeSessionToken: "session-new",
      operationPatientId: "patient-a",
      activePatientId: "patient-a",
    }),
    false,
  );
  assert.equal(
    shouldApplyRoleActionSideEffect({
      operationWorkspaceGeneration: 1,
      activeWorkspaceGeneration: 1,
      isWorkspaceMounted: true,
      operationSessionToken: "session-old",
      activeSessionToken: null,
      operationPatientId: "patient-a",
      activePatientId: null,
    }),
    false,
  );
});

test("role action identity accepts only the current patient action", async () => {
  const { shouldApplyRoleActionSideEffect } = await import("./role-workspace");

  assert.equal(
    shouldApplyRoleActionSideEffect({
      operationWorkspaceGeneration: 1,
      activeWorkspaceGeneration: 1,
      isWorkspaceMounted: true,
      operationSessionToken: "session-current",
      activeSessionToken: "session-current",
      operationPatientId: "patient-a",
      activePatientId: "patient-a",
    }),
    true,
  );
});

test("patient training lifecycle claims prevent duplicate and conflicting requests", async () => {
  const {
    claimPatientTrainingLifecycleAction,
    releasePatientTrainingLifecycleAction,
  } = await import("./role-workspace");
  const inFlight = {
    current: null as TestPatientTrainingLifecycleClaim | null,
  };

  const resumeClaim = claimPatientTrainingLifecycleAction(
    inFlight,
    "resumeTraining",
  );
  assert.notEqual(resumeClaim, null);
  assert.equal(
    claimPatientTrainingLifecycleAction(inFlight, "resumeTraining"),
    null,
  );
  assert.equal(
    claimPatientTrainingLifecycleAction(inFlight, "abortTraining"),
    null,
  );
  assert.ok(resumeClaim);
  releasePatientTrainingLifecycleAction(inFlight, resumeClaim);
  assert.notEqual(
    claimPatientTrainingLifecycleAction(inFlight, "abortTraining"),
    null,
  );
});

test("patient identity invalidation fences A-B-A lifecycle claims and busy cleanup", async () => {
  const workspaceModule = await import("./role-workspace");
  const {
    claimPatientTrainingLifecycleAction,
    releasePatientTrainingLifecycleAction,
    shouldApplyRoleActionSideEffect,
  } = workspaceModule;
  const invalidatePatientScopedActionIdentity = (
    workspaceModule as typeof workspaceModule & {
      invalidatePatientScopedActionIdentity?: (
        generation: { current: number },
        inFlight: { current: TestPatientTrainingLifecycleClaim | null },
      ) => void;
    }
  ).invalidatePatientScopedActionIdentity;
  assert.equal(typeof invalidatePatientScopedActionIdentity, "function");
  if (!invalidatePatientScopedActionIdentity) return;

  const generation = { current: 1 };
  const inFlight = {
    current: null as TestPatientTrainingLifecycleClaim | null,
  };
  const sessionToken = "session-stable";
  let activePatientId = "patient-a";
  const oldIdentity = {
    operationWorkspaceGeneration: generation.current,
    operationSessionToken: sessionToken,
    operationPatientId: activePatientId,
  };

  const oldClaim = claimPatientTrainingLifecycleAction(
    inFlight,
    "resumeTraining",
  );
  assert.ok(oldClaim);

  invalidatePatientScopedActionIdentity(generation, inFlight);
  activePatientId = "patient-b";
  assert.equal(generation.current, 2);
  const patientBClaim = claimPatientTrainingLifecycleAction(
    inFlight,
    "abortTraining",
  );
  assert.ok(patientBClaim);
  releasePatientTrainingLifecycleAction(inFlight, oldClaim);
  assert.equal(inFlight.current, patientBClaim);

  invalidatePatientScopedActionIdentity(generation, inFlight);
  activePatientId = "patient-a";
  assert.equal(generation.current, 3);
  const newPatientAClaim = claimPatientTrainingLifecycleAction(
    inFlight,
    "resumeTraining",
  );
  assert.ok(newPatientAClaim);
  const busyActions = new Set(["resumeTraining"]);

  releasePatientTrainingLifecycleAction(inFlight, oldClaim);
  const oldIdentityIsCurrent = shouldApplyRoleActionSideEffect({
    ...oldIdentity,
    activeWorkspaceGeneration: generation.current,
    isWorkspaceMounted: true,
    activeSessionToken: sessionToken,
    activePatientId,
  });
  if (oldIdentityIsCurrent) busyActions.delete("resumeTraining");

  assert.equal(oldIdentityIsCurrent, false);
  assert.equal(inFlight.current, newPatientAClaim);
  assert.equal(busyActions.has("resumeTraining"), true);
});

test("patient switching invalidates action identity before changing patient scope", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("async function handleSelectPatient");
  const end = source.indexOf("function updateAssessmentForm", start);
  const handlerSource = source.slice(start, end);
  const invalidation = handlerSource.indexOf(
    "invalidatePatientScopedActionIdentity",
  );
  const patientMutation = handlerSource.indexOf(
    "activePatientIdRef.current = patientId",
  );
  const stateClear = handlerSource.indexOf("clearPatientScopedState()");

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.notEqual(invalidation, -1);
  assert.ok(invalidation < patientMutation);
  assert.ok(patientMutation < stateClear);
});

test("resume success applies the real response, selects its plan item, and enters game", async () => {
  const { applyResumedPatientTrainingSessionState } =
    await import("./role-workspace");
  const resumedSession = {
    id: "session-real-response",
    planItemId: "item-1",
  } as TrainingSession;
  const writes: Array<[string, unknown]> = [];

  applyResumedPatientTrainingSessionState({
    resumedSession,
    setActiveScreen: (screen) => writes.push(["screen", screen]),
    setActiveTrainingSession: (session) => writes.push(["session", session]),
    setSelectedTrainingPlanItemId: (planItemId) =>
      writes.push(["planItem", planItemId]),
    setTrainingResultDraft: (draft) => writes.push(["draft", draft]),
  });

  assert.deepEqual(writes, [
    ["session", resumedSession],
    ["planItem", "item-1"],
    ["draft", null],
    ["screen", "game"],
  ]);
});

test("abort success reloads real role data before clearing training state and returning Today", async () => {
  const { finalizeAbortedPatientTrainingSessionState } =
    await import("./role-workspace");
  const events: string[] = [];

  const finalized = await finalizeAbortedPatientTrainingSessionState({
    clearActiveTrainingSession: () => events.push("clear-session"),
    clearSelectedTrainingPlanItem: () => events.push("clear-selection"),
    clearTrainingResultDraft: () => events.push("clear-draft"),
    reloadRoleData: async () => {
      events.push("reload-role-data");
      return true;
    },
    showToday: () => events.push("show-today"),
  });

  assert.equal(finalized, true);
  assert.deepEqual(events, [
    "reload-role-data",
    "clear-session",
    "clear-draft",
    "clear-selection",
    "show-today",
  ]);
});

test("abort reload failure preserves the visible training session and drafts", async () => {
  const { finalizeAbortedPatientTrainingSessionState } =
    await import("./role-workspace");
  const events: string[] = [];

  const finalized = await finalizeAbortedPatientTrainingSessionState({
    clearActiveTrainingSession: () => events.push("clear-session"),
    clearSelectedTrainingPlanItem: () => events.push("clear-selection"),
    clearTrainingResultDraft: () => events.push("clear-draft"),
    reloadRoleData: async () => {
      events.push("reload-role-data");
      return false;
    },
    showToday: () => events.push("show-today"),
  });

  assert.equal(finalized, false);
  assert.deepEqual(events, ["reload-role-data"]);
});

test("every async workspace action with deferred state writes captures and rechecks identity", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const actionNames = [
    "handleRefreshAuditLogs",
    "handleExportData",
    "handleCreateRegistrationRequest",
    "handleReviewRegistrationRequest",
    "handleCreateCaregiverAccount",
    "handleCreateAssessment",
    "handleCreateAd8Assessment",
    "handleCreateAiAssessmentDraft",
    "handleStartAiConversation",
    "handleAppendAiConversationMessage",
    "handleCompleteAiConversation",
    "handleCreateAssessmentSpeechTranscript",
    "handleCreateSpeechAiAssessmentDraft",
    "handleCreateTtsSpeechOutput",
    "handleGrantConsent",
    "handleRevokeConsent",
    "handleBindCaregiver",
    "handleRevokeCaregiver",
    "handleCreateCareCirclePost",
    "handleCreateCareCircleComment",
    "handleConfirmRisk",
    "handleReturnAssessment",
    "handleRecommendPlan",
    "handleConfirmPlan",
    "handleRefreshTrainingPreparation",
    "handleCheckTrainingDevice",
    "handleCheckPoseReadiness",
    "handleStartTraining",
    "handleResumeTraining",
    "handleAbortTraining",
    "handleCreateGameContent",
    "handleUpdateGameContentStatus",
    "handleUpdateUnityBuild",
    "handleCreateCollectionCondition",
    "handleCreateCollectionProtocol",
    "handleCreateCollectionBatch",
    "handleSubmitTrainingResult",
    "handleSubmitTrainingReview",
  ] as const;

  for (const [index, actionName] of actionNames.entries()) {
    const start = source.indexOf(`async function ${actionName}`);
    const nextName = actionNames[index + 1];
    const end = nextName
      ? source.indexOf(`async function ${nextName}`, start + 1)
      : source.indexOf("\n  return (", start + 1);
    assert.notEqual(start, -1, `${actionName} must exist`);
    assert.notEqual(end, -1, `${actionName} boundary must exist`);
    const actionSource = source.slice(start, end);
    assert.match(
      actionSource,
      /const actionIdentity = captureRoleActionIdentity\(\);/,
      `${actionName} must capture workspace, session, and patient identity before awaiting`,
    );
    assert.match(
      actionSource,
      /isRoleActionIdentityCurrent\(actionIdentity\)/,
      `${actionName} must reject stale deferred state writes`,
    );
  }
});

test("patient resume and abort handlers use the approved lifecycle without fallback paths", async () => {
  const [workspaceSource, actionSource, todaySource] = await Promise.all([
    readFile(new URL("./role-workspace.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../patient/patient-training-actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../patient/TodayTrainingPage.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const resumeStart = workspaceSource.indexOf(
    "async function handleResumeTraining",
  );
  const abortStart = workspaceSource.indexOf(
    "async function handleAbortTraining",
  );
  const nextStart = workspaceSource.indexOf(
    "async function handleCreateGameContent",
  );

  assert.notEqual(resumeStart, -1);
  assert.notEqual(abortStart, -1);
  assert.notEqual(nextStart, -1);
  const resumeSource = workspaceSource.slice(resumeStart, abortStart);
  const abortSource = workspaceSource.slice(abortStart, nextStart);

  assert.match(resumeSource, /claimPatientTrainingLifecycleAction/);
  assert.match(resumeSource, /resumePatientTrainingSession/);
  assert.match(resumeSource, /applyResumedPatientTrainingSessionState/);
  assert.match(resumeSource, /patientSafeTrainingActionErrorMessage/);
  assert.match(resumeSource, /releasePatientTrainingLifecycleAction/);
  assert.doesNotMatch(resumeSource, /startTrainingSession|\b409\b|retry/i);

  assert.match(abortSource, /claimPatientTrainingLifecycleAction/);
  assert.match(abortSource, /abortPatientTrainingSession/);
  assert.match(abortSource, /finalizeAbortedPatientTrainingSessionState/);
  assert.match(abortSource, /reloadRoleData/);
  assert.match(abortSource, /patientSafeTrainingActionErrorMessage/);
  assert.match(abortSource, /releasePatientTrainingLifecycleAction/);
  assert.doesNotMatch(abortSource, /startTrainingSession|\b409\b|retry/i);

  assert.doesNotMatch(
    `${actionSource}\n${todaySource}`,
    /localStorage|sessionStorage/,
  );
});

test("training start carries one verified camera selection through the role-data reload", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("async function handleStartTraining");
  const end = source.indexOf("async function handleResumeTraining", start);
  const handlerSource = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(handlerSource, /requireBrowserPoseCameraSelection/);
  assert.match(handlerSource, /requestEpoch: session\.requestEpoch/);
  assert.match(handlerSource, /patientId: data\.patient\.id/);
  assert.match(handlerSource, /selection: selectedCamera/);
  assert.match(
    handlerSource,
    /reloadRoleData\(\s*session,\s*data\.patient\.id,\s*cameraSelectionTransfer,?\s*\)/,
  );
  assert.doesNotMatch(
    handlerSource,
    /localStorage|sessionStorage|defaultDevice|retry|fallback/i,
  );
});

test("role action identity also rejects an unmounted workspace generation", async () => {
  const { shouldApplyRoleActionSideEffect } = await import("./role-workspace");

  assert.equal(
    shouldApplyRoleActionSideEffect({
      operationWorkspaceGeneration: 3,
      activeWorkspaceGeneration: 4,
      isWorkspaceMounted: false,
      operationSessionToken: "session-current",
      activeSessionToken: "session-current",
      operationPatientId: "patient-a",
      activePatientId: "patient-a",
    }),
    false,
  );
});

test("authenticated workspace cleanup uses role-data cleanup so panel errors are cleared", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const cleanupSource = source.match(
    /const clearAuthenticatedState = useCallback\(([\s\S]*?)\n\s*const handleAuthenticated/,
  )?.[1];

  assert.ok(cleanupSource);
  assert.match(cleanupSource, /clearRoleData\(status, message\)/);
  assert.doesNotMatch(cleanupSource, /setData\(\{\}\)/);
});

test("restore abort signal reaches role-data loading through onAuthenticated", async () => {
  const [sessionSource, workspaceSource] = await Promise.all([
    readFile(new URL("./useRoleSession.ts", import.meta.url), "utf8"),
    readFile(new URL("./role-workspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(
    sessionSource,
    /onAuthenticated\(restoredSession, patientId, \{\s*signal: operation\.signal,?\s*\}\)/,
  );
  assert.match(
    workspaceSource,
    /signal\?: AbortSignal[\s\S]*?loadRoleData\(loginResponse, requestedPatientId, auditFilters, \{\s*signal,?\s*\}\)/,
  );
});

test("high-cost AI and TTS results are staged before later UI work", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const aiStart = source.indexOf(
    "async function handleCreateAiAssessmentDraft",
  );
  const conversationStart = source.indexOf(
    "async function handleStartAiConversation",
  );
  const speechAiStart = source.indexOf(
    "async function handleCreateSpeechAiAssessmentDraft",
  );
  const ttsStart = source.indexOf("async function handleCreateTtsSpeechOutput");
  const consentStart = source.indexOf("async function handleGrantConsent");

  assert.notEqual(aiStart, -1);
  assert.notEqual(conversationStart, -1);
  assert.notEqual(speechAiStart, -1);
  assert.notEqual(ttsStart, -1);
  assert.notEqual(consentStart, -1);

  const aiSource = source.slice(aiStart, conversationStart);
  const speechAiSource = source.slice(speechAiStart, ttsStart);
  const ttsSource = source.slice(ttsStart, consentStart);
  const cleanupSource = source.slice(
    source.indexOf("const clearPatientScopedState"),
    source.indexOf("const {", source.indexOf("const clearPatientScopedState")),
  );

  assert.match(aiSource, /isStagedAiAssessmentDraftForRequest/);
  assert.match(aiSource, /createStagedAiAssessmentDraft/);
  assert.match(
    speechAiSource,
    /setAssessmentForm\(transcribedForm\)[\s\S]*?requestAiAssessmentDraft/,
  );
  assert.match(ttsSource, /isStagedTtsSpeechOutputForRequest/);
  assert.match(
    ttsSource,
    /createStagedTtsSpeechOutput[\s\S]*?playTtsSpeechOutputAudio/,
  );
  assert.match(cleanupSource, /stagedAiAssessmentDraftRef\.current = null/);
  assert.match(cleanupSource, /stagedTtsSpeechOutputRef\.current = null/);
});

test("high-cost workspace calls use current-page stable identities and clear them with patient scope", async () => {
  const source = await readFile(
    new URL("./role-workspace.tsx", import.meta.url),
    "utf8",
  );
  const requestActionsSource = await readFile(
    new URL("./high-cost-request-actions.ts", import.meta.url),
    "utf8",
  );
  const actionNames = [
    "requestAiAssessmentDraft",
    "requestAiConversationMessage",
    "requestAssessmentSpeechTranscript",
    "requestTtsSpeechOutput",
  ];

  for (const actionName of actionNames) {
    const start = requestActionsSource.indexOf(`async function ${actionName}`);
    assert.notEqual(start, -1);
    const actionSource = requestActionsSource.slice(
      start,
      requestActionsSource.indexOf("\nexport async function ", start + 1),
    );
    assert.match(actionSource, /executeCurrentPageHighCostRequest/);
    assert.match(actionSource, /deriveCurrentPageHighCostRequestIntent/);
    assert.match(actionSource, /idempotencyKey/);
  }

  assert.match(source, /requestAiAssessmentDraft/);
  assert.match(source, /requestAiConversationMessage/);
  assert.match(source, /requestAssessmentSpeechTranscript/);
  assert.match(source, /requestTtsSpeechOutput/);

  const clearStart = source.indexOf("const clearPatientScopedState");
  const clearEnd = source.indexOf("const clearAuthenticatedState", clearStart);
  const clearSource = source.slice(clearStart, clearEnd);
  assert.match(clearSource, /highCostRequestRegistryRef\.current\.clear\(\)/);
  assert.match(source, /recordingId/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
