import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedSession } from "@/types/api";

const baseSession: AuthenticatedSession = {
  status: "authenticated",
  requestEpoch: "epoch",
  user: {
    id: "user-1",
    account: "user001",
    displayName: "User",
    roles: [],
  },
  context: {
    primaryRole: "caregiver",
    patientIds: [],
    caregiverPatientIds: ["patient-c"],
    doctorPatientIds: [],
    doctorIds: [],
    organizationIds: [],
    caregiverScopes: {
      "patient-c": {
        summary: true,
        reminders: false,
        progress: true,
        rawAssessment: false,
        planEdit: false,
      },
    },
    adminPermissions: [],
  },
};

test("caregiver navigation and write actions follow the selected patient scope", async () => {
  const navigationModule = await import("./role-navigation");
  const resolveAuthorizedRoleNavigationItems = (
    navigationModule as typeof navigationModule & {
      resolveAuthorizedRoleNavigationItems: (
        session: AuthenticatedSession,
        patientId?: string,
      ) => Array<{ id: string }>;
    }
  ).resolveAuthorizedRoleNavigationItems;
  const hasCaregiverPatientScope = (
    navigationModule as typeof navigationModule & {
      hasCaregiverPatientScope: (
        session: AuthenticatedSession,
        patientId: string,
        scope: "summary" | "reminders" | "progress",
      ) => boolean;
    }
  ).hasCaregiverPatientScope;

  assert.equal(typeof resolveAuthorizedRoleNavigationItems, "function");
  assert.equal(typeof hasCaregiverPatientScope, "function");
  assert.deepEqual(
    resolveAuthorizedRoleNavigationItems(baseSession, "patient-c").map(
      (item) => item.id,
    ),
    ["family", "familyProgress", "familyProfile"],
  );
  assert.equal(
    hasCaregiverPatientScope(baseSession, "patient-c", "reminders"),
    false,
  );
  assert.equal(
    hasCaregiverPatientScope(baseSession, "patient-c", "progress"),
    true,
  );
});

test("admin navigation exposes only workspaces backed by granted permissions", async () => {
  const navigationModule = await import("./role-navigation");
  const resolveAuthorizedRoleNavigationItems = (
    navigationModule as typeof navigationModule & {
      resolveAuthorizedRoleNavigationItems: (
        session: AuthenticatedSession,
      ) => Array<{ id: string }>;
    }
  ).resolveAuthorizedRoleNavigationItems;
  const auditorSession: AuthenticatedSession = {
    ...baseSession,
    context: {
      ...baseSession.context,
      primaryRole: "admin_auditor",
      caregiverPatientIds: [],
      caregiverScopes: {},
      adminPermissions: ["audit.read"],
    },
  };

  assert.deepEqual(
    resolveAuthorizedRoleNavigationItems(auditorSession).map((item) => item.id),
    ["security"],
  );
});

test("doctor navigation exposes the patient registration review workspace", async () => {
  const navigationModule = await import("./role-navigation");
  const doctorSession: AuthenticatedSession = {
    ...baseSession,
    context: {
      ...baseSession.context,
      primaryRole: "doctor",
      caregiverPatientIds: [],
      caregiverScopes: {},
      doctorIds: ["doctor-1"],
      doctorPatientIds: ["patient-1"],
    },
  };

  assert.deepEqual(
    navigationModule
      .resolveAuthorizedRoleNavigationItems(doctorSession, "patient-1")
      .map(({ id, label, screenId }) => ({ id, label, screenId })),
    [
      { id: "doctor", label: "患者", screenId: "doctor" },
      { id: "registrationReview", label: "申请", screenId: "doctor" },
      { id: "assessmentReview", label: "评估", screenId: "assessment" },
      { id: "planManagement", label: "计划", screenId: "plan" },
      { id: "preparationManagement", label: "准备", screenId: "plan" },
      { id: "trainingReview", label: "复核", screenId: "result" },
    ],
  );
});

test("patient navigation starts with the AI assessment workspace", async () => {
  const navigationModule = await import("./role-navigation");
  const patientSession: AuthenticatedSession = {
    ...baseSession,
    context: {
      ...baseSession.context,
      primaryRole: "patient",
      caregiverPatientIds: [],
      caregiverScopes: {},
      patientIds: ["patient-1"],
    },
  };

  assert.equal(
    navigationModule.resolveHomeScreen(patientSession),
    "assessment",
  );
  assert.deepEqual(
    navigationModule
      .resolveAuthorizedRoleNavigationItems(patientSession, "patient-1")
      .map(({ id, label, screenId }) => ({ id, label, screenId })),
    [
      { id: "assessment", label: "AI评估", screenId: "assessment" },
      { id: "today", label: "今日", screenId: "today" },
      { id: "prep", label: "训练", screenId: "prep" },
      { id: "result", label: "记录", screenId: "result" },
      { id: "profile", label: "我的", screenId: "profile" },
    ],
  );
});
