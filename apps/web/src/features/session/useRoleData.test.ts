import assert from "node:assert/strict";
import test from "node:test";
import type { AppData } from "./useRoleData";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

test("core load failure clears old patient clinical data without discarding the authorized roster", async () => {
  const roleDataModule = await import("./useRoleData");
  const clearPatientClinicalData = (
    roleDataModule as typeof roleDataModule & {
      clearPatientClinicalData: (data: AppData) => AppData;
    }
  ).clearPatientClinicalData;

  assert.equal(typeof clearPatientClinicalData, "function");

  const patientB = { id: "patient-b", name: "患者 B" } as NonNullable<
    AppData["patient"]
  >;
  const patientC = { id: "patient-c", name: "患者 C" } as NonNullable<
    AppData["patient"]
  >;
  const current: AppData = {
    patients: [patientB, patientC],
    patient: patientB,
    assessments: [{ id: "assessment-b" }] as NonNullable<
      AppData["assessments"]
    >,
    trainingRecords: { patientId: "patient-b" } as unknown as NonNullable<
      AppData["trainingRecords"]
    >,
    rewards: { patientId: "patient-b" } as unknown as NonNullable<
      AppData["rewards"]
    >,
    collectionBatches: [{ id: "batch-b" }] as NonNullable<
      AppData["collectionBatches"]
    >,
    aiConversations: [{ id: "conversation-b" }] as NonNullable<
      AppData["aiConversations"]
    >,
  };

  assert.deepEqual(clearPatientClinicalData(current), {
    patients: [patientB, patientC],
  });
});

test("optional panel failure preserves successful data and reports a scoped error", async () => {
  const roleDataModule = await import("./useRoleData");
  const settleOptionalRoleData = (
    roleDataModule as typeof roleDataModule & {
      settleOptionalRoleData: (requests: Array<{
        label: string;
        load: () => Promise<Partial<AppData>>;
        panel: string;
      }>) => Promise<{
        data: AppData;
        errors: Array<{ label: string; message: string; panel: string }>;
      }>;
    }
  ).settleOptionalRoleData;

  assert.equal(typeof settleOptionalRoleData, "function");

  const careCircle = { patientId: "patient-c" } as unknown as NonNullable<
    AppData["careCircle"]
  >;
  const result = await settleOptionalRoleData([
    {
      panel: "rewards",
      label: "康复奖励",
      load: async () => {
        throw new Error("奖励服务不可用");
      },
    },
    {
      panel: "careCircle",
      label: "家庭照护记录",
      load: async () => ({ careCircle }),
    },
  ]);

  assert.deepEqual(result.data, { careCircle });
  assert.equal("rewards" in result.data, false);
  assert.deepEqual(result.errors, [
    {
      panel: "rewards",
      label: "康复奖励",
      message: "奖励服务不可用",
    },
  ]);
});

test("a new optional load removes stale panel data before failed panels settle", async () => {
  const roleDataModule = await import("./useRoleData");
  const clearOptionalRoleData = (
    roleDataModule as typeof roleDataModule & {
      clearOptionalRoleData: (data: AppData, panels: string[]) => AppData;
    }
  ).clearOptionalRoleData;
  const patient = { id: "patient-old" } as NonNullable<AppData["patient"]>;

  assert.equal(typeof clearOptionalRoleData, "function");
  assert.deepEqual(
    clearOptionalRoleData(
      {
        patient,
        patients: [patient],
        adminDashboard: { stale: true } as unknown as NonNullable<
          AppData["adminDashboard"]
        >,
        adminGameContents: [{ id: "game-old" }] as NonNullable<
          AppData["adminGameContents"]
        >,
        registrationRequests: [{ id: "request-old" }] as NonNullable<
          AppData["registrationRequests"]
        >,
      },
      ["patientRoster", "doctorDashboard", "adminGameContents"],
    ),
    {
      patient,
      registrationRequests: [{ id: "request-old" }],
    },
  );
});

test("caregiver patient options include every and only authorized patient summary", async () => {
  const roleDataModule = await import("./useRoleData");
  const buildCaregiverPatientOptions = (
    roleDataModule as typeof roleDataModule & {
      buildCaregiverPatientOptions: (
        authorizedPatientIds: string[],
        summaries: Array<{
          patient: { id: string; name: string };
        }>,
      ) => Array<{ id: string; name: string }>;
    }
  ).buildCaregiverPatientOptions;

  assert.equal(typeof buildCaregiverPatientOptions, "function");
  assert.deepEqual(
    buildCaregiverPatientOptions(
      ["patient-b", "patient-c"],
      [
        { patient: { id: "patient-c", name: "患者 C" } },
        { patient: { id: "patient-x", name: "未授权患者" } },
        { patient: { id: "patient-b", name: "患者 B" } },
      ],
    ),
    [
      { id: "patient-b", name: "患者 B" },
      { id: "patient-c", name: "患者 C" },
    ],
  );
});

test("caregiver roster request loads authorized choices without an active patient", async () => {
  const { buildRolePatientRosterRequests } = await import("./useRoleData");
  const requestedPatientIds: string[] = [];
  const requests = buildRolePatientRosterRequests(
    "caregiver",
    ["patient-b", "patient-c"],
    {
      loadPatient: async () => {
        throw new Error("doctor loader must not run");
      },
      loadCaregiverSummary: async (patientId: string) => {
        requestedPatientIds.push(patientId);
        return {
          patient: { id: patientId, name: `患者 ${patientId.at(-1)?.toUpperCase()}` },
        } as NonNullable<AppData["caregiverSummary"]>;
      },
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.panel, "caregiverPatientRoster");
  assert.deepEqual(await requests[0]?.load(), {
    caregiverPatientOptions: [
      { id: "patient-b", name: "患者 B" },
      { id: "patient-c", name: "患者 C" },
    ],
  });
  assert.deepEqual(requestedPatientIds, ["patient-b", "patient-c"]);
});
