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
