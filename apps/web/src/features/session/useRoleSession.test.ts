import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedSession } from "@/types/api";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

const baseSession: AuthenticatedSession = {
  status: "authenticated",
  requestEpoch: "token",
  user: {
    id: "user-1",
    account: "doctor001",
    displayName: "Doctor",
    roles: [
      {
        roleCode: "doctor",
        relatedObjectType: "doctor",
        relatedObjectId: "doctor-1",
      },
    ],
  },
  context: {
    primaryRole: "doctor",
    patientIds: [],
    doctorPatientIds: ["patient-a", "patient-b"],
    doctorIds: ["doctor-1"],
    caregiverPatientIds: [],
    organizationIds: [],
    caregiverScopes: {},
    adminPermissions: [],
  },
};

test("resolveStoredActivePatientId restores an authorized selected patient", async () => {
  const { resolveStoredActivePatientId } = await import("./useRoleSession");
  assert.equal(resolveStoredActivePatientId(baseSession, "patient-b"), "patient-b");
});

test("resolveStoredActivePatientId leaves a stale doctor selection unresolved", async () => {
  const { resolveStoredActivePatientId } = await import("./useRoleSession");
  assert.equal(resolveStoredActivePatientId(baseSession, "patient-x"), undefined);
});

test("resolveStoredActivePatientId leaves a missing caregiver selection unresolved", async () => {
  const { resolveStoredActivePatientId } = await import("./useRoleSession");
  assert.equal(
    resolveStoredActivePatientId(
      {
        ...baseSession,
        context: {
          ...baseSession.context,
          primaryRole: "caregiver",
          patientIds: ["patient-self"],
          caregiverPatientIds: ["patient-b", "patient-c"],
        },
      },
      null,
    ),
    undefined,
  );
});

test("resolveStoredActivePatientId keeps patient role selection deterministic", async () => {
  const { resolveStoredActivePatientId } = await import("./useRoleSession");
  assert.equal(
    resolveStoredActivePatientId(
      {
        ...baseSession,
        context: {
          ...baseSession.context,
          primaryRole: "patient",
          patientIds: ["patient-self"],
          doctorPatientIds: [],
          doctorIds: [],
        },
      },
      "patient-b",
    ),
    "patient-self",
  );
});

test("patient selection authorization accepts caregiver patients and rejects other ids", async () => {
  const roleSessionModule = await import("./useRoleSession");
  const isPatientSelectionAuthorized = (
    roleSessionModule as typeof roleSessionModule & {
      isPatientSelectionAuthorized: (
        session: AuthenticatedSession,
        patientId: string,
      ) => boolean;
    }
  ).isPatientSelectionAuthorized;
  const caregiverSession: AuthenticatedSession = {
    ...baseSession,
    context: {
      ...baseSession.context,
      primaryRole: "caregiver",
      doctorPatientIds: [],
      doctorIds: [],
      caregiverPatientIds: ["patient-b", "patient-c"],
    },
  };

  assert.equal(typeof isPatientSelectionAuthorized, "function");
  assert.equal(isPatientSelectionAuthorized(caregiverSession, "patient-c"), true);
  assert.equal(isPatientSelectionAuthorized(caregiverSession, "patient-x"), false);
});

test("caregiver primary role resolves only caregiver patient ids in a multi-role session", async () => {
  const { resolveAccessiblePatientIds } = await import("./useRoleData");
  const caregiverSession: AuthenticatedSession = {
    ...baseSession,
    context: {
      ...baseSession.context,
      primaryRole: "caregiver",
      patientIds: ["patient-self"],
      caregiverPatientIds: ["patient-b", "patient-c"],
      doctorPatientIds: ["patient-doctor"],
    },
  };

  assert.deepEqual(resolveAccessiblePatientIds(caregiverSession), [
    "patient-b",
    "patient-c",
  ]);
});

test("shouldApplyCookieSessionRestore rejects stale restore responses", async () => {
  const { shouldApplyCookieSessionRestore } = await import("./useRoleSession");

  assert.equal(
    shouldApplyCookieSessionRestore({
      restoreSequence: 1,
      currentRestoreSequence: 2,
      hasActiveSession: false,
      isMounted: true,
      isAborted: false,
    }),
    false,
  );
  assert.equal(
    shouldApplyCookieSessionRestore({
      restoreSequence: 2,
      currentRestoreSequence: 2,
      hasActiveSession: true,
      isMounted: true,
      isAborted: false,
    }),
    false,
  );
  assert.equal(
    shouldApplyCookieSessionRestore({
      restoreSequence: 2,
      currentRestoreSequence: 2,
      hasActiveSession: false,
      isMounted: true,
      isAborted: false,
    }),
    true,
  );
});

test("cookie session restore rejects aborted and unmounted responses", async () => {
  const { shouldApplyCookieSessionRestore } = await import("./useRoleSession");

  assert.equal(
    shouldApplyCookieSessionRestore({
      restoreSequence: 1,
      currentRestoreSequence: 1,
      hasActiveSession: false,
      isMounted: true,
      isAborted: true,
    }),
    false,
  );
  assert.equal(
    shouldApplyCookieSessionRestore({
      restoreSequence: 1,
      currentRestoreSequence: 1,
      hasActiveSession: false,
      isMounted: false,
      isAborted: false,
    }),
    false,
  );
});

test("cookie session restore lifecycle prevents duplicate in-flight me requests", async () => {
  const sessionModule = await import("./useRoleSession");
  const createCookieSessionRestoreLifecycle = (
    sessionModule as typeof sessionModule & {
      createCookieSessionRestoreLifecycle?: () => {
        begin: () => { sequence: number; signal: AbortSignal } | null;
        cancel: () => void;
        mount: () => void;
        unmount: () => void;
      };
    }
  ).createCookieSessionRestoreLifecycle;

  assert.equal(typeof createCookieSessionRestoreLifecycle, "function");
  const lifecycle = createCookieSessionRestoreLifecycle?.();
  lifecycle?.mount();
  const first = lifecycle?.begin();
  assert.ok(first);
  assert.equal(lifecycle?.begin(), null);

  lifecycle?.cancel();
  assert.equal(first.signal.aborted, true);
  const second = lifecycle?.begin();
  assert.ok(second);

  assert.equal(lifecycle?.begin(), null);
  lifecycle?.unmount();
  assert.equal(second.signal.aborted, true);
});

test("shouldApplyAuthenticatedSideEffect rejects stale async role data responses", async () => {
  const { shouldApplyAuthenticatedSideEffect } = await import("./useRoleSession");

  assert.equal(
    shouldApplyAuthenticatedSideEffect({
      operationToken: "old-token",
      activeSessionToken: "new-token",
    }),
    false,
  );
  assert.equal(
    shouldApplyAuthenticatedSideEffect({
      operationToken: "current-token",
      activeSessionToken: null,
    }),
    false,
  );
  assert.equal(
    shouldApplyAuthenticatedSideEffect({
      operationToken: "current-token",
      activeSessionToken: "current-token",
    }),
    true,
  );
});

test("role data response identity rejects an older patient load in the same session", async () => {
  const roleDataModule = await import("./useRoleData");
  const shouldApplyRoleDataResult = (
    roleDataModule as typeof roleDataModule & {
      shouldApplyRoleDataResult: (input: {
        activeSessionToken: string | null;
        currentRequestSequence: number;
        isAborted: boolean;
        requestEpoch: string;
        requestSequence: number;
      }) => boolean;
    }
  ).shouldApplyRoleDataResult;

  assert.equal(typeof shouldApplyRoleDataResult, "function");
  assert.equal(
    shouldApplyRoleDataResult({
      activeSessionToken: "same-login",
      currentRequestSequence: 2,
      isAborted: false,
      requestEpoch: "same-login",
      requestSequence: 1,
    }),
    false,
  );
  assert.equal(
    shouldApplyRoleDataResult({
      activeSessionToken: "same-login",
      currentRequestSequence: 2,
      isAborted: false,
      requestEpoch: "same-login",
      requestSequence: 2,
    }),
    true,
  );
});

test("role data response identity rejects an aborted restore load", async () => {
  const { shouldApplyRoleDataResult } = await import("./useRoleData");

  assert.equal(
    shouldApplyRoleDataResult({
      activeSessionToken: "same-login",
      currentRequestSequence: 2,
      isAborted: true,
      requestEpoch: "same-login",
      requestSequence: 2,
    }),
    false,
  );
});

test("a 401 password-reset response exits reset mode and returns to login", async () => {
  const { ApiError } = await import("@/lib/api");
  const { resolvePasswordResetFailure } = await import("./useRoleSession");

  assert.deepEqual(
    resolvePasswordResetFailure(
      new ApiError("密码重置凭证已过期，请重新登录。", 401),
    ),
    {
      passwordResetRequired: false,
      status: "密码重置会话已过期",
      message: "密码重置会话已过期，请使用临时密码重新登录。",
    },
  );
});

test("a validation failure keeps the password-reset form available", async () => {
  const { ApiError } = await import("@/lib/api");
  const { resolvePasswordResetFailure } = await import("./useRoleSession");

  assert.deepEqual(
    resolvePasswordResetFailure(new ApiError("新密码长度不符合要求。", 400)),
    {
      passwordResetRequired: true,
      status: "密码更新失败",
      message: "新密码长度不符合要求。",
    },
  );
});
