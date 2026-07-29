import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import type { ConsentRecord, PatientProfile } from "@/types/api";
import {
  openBrowserPoseCamera,
  requireBrowserPoseCameraDeviceId,
  requireBrowserPoseCameraSelection,
  synchronizeBrowserPoseCameraConsent,
} from "@/lib/browser-pose-camera-access";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

const cameraConsent: ConsentRecord = {
  id: "consent-c",
  patientId: "patient-c",
  subjectUserId: "user-c",
  consentType: "camera_capture",
  consentVersion: "v1.2",
  status: "granted",
  grantedAt: "2026-07-13T08:00:00.000Z",
  revokedAt: null,
  evidenceSnapshot: { source: "patient-confirmation" },
};

afterEach(() => {
  synchronizeBrowserPoseCameraConsent(undefined);
});

test("role data synchronizes camera consent before preparation and clears it with clinical data", async () => {
  const roleDataModule = await import("./useRoleData");
  const synchronizeRolePatientCameraConsent = (
    roleDataModule as typeof roleDataModule & {
      synchronizeRolePatientCameraConsent: (
        patient: PatientProfile | undefined,
      ) => void;
    }
  ).synchronizeRolePatientCameraConsent;

  assert.equal(typeof synchronizeRolePatientCameraConsent, "function");
  const restoreNavigator = installMediaDevices();
  try {
    synchronizeRolePatientCameraConsent({
      id: "patient-c",
      consents: [cameraConsent],
    } as PatientProfile);
    const opened = await openBrowserPoseCamera();
    assert.equal(opened.patientId, "patient-c");
    opened.stream.getTracks().forEach((track) => track.stop());

    synchronizeRolePatientCameraConsent(undefined);
    await assert.rejects(openBrowserPoseCamera(), /有效的摄像头采集授权/);
  } finally {
    restoreNavigator();
  }
});

test("device page no longer competes for camera consent ownership", async () => {
  const source = await readFile(
    new URL("../patient/DevicePermissionCenterPage.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /synchronizeBrowserPoseCameraConsent|useEffect/);
});

test("role-data reload restores a camera selection only for the same session and patient", async () => {
  const roleDataModule = await import("./useRoleData");
  const { resolveRoleDataCameraSelectionTransfer } = roleDataModule;
  const restoreNavigator = installMediaDevices();
  const patient = {
    id: "patient-c",
    consents: [cameraConsent],
  } as PatientProfile;

  try {
    roleDataModule.synchronizeRolePatientCameraConsent(patient);
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());
    const selection = requireBrowserPoseCameraSelection("camera-c");
    const transfer = {
      requestEpoch: "session-current",
      patientId: "patient-c",
      selection,
    };

    roleDataModule.synchronizeRolePatientCameraConsent(undefined);
    roleDataModule.synchronizeRolePatientCameraConsent(
      patient,
      resolveRoleDataCameraSelectionTransfer(
        transfer,
        "session-current",
        "patient-c",
      ),
    );
    assert.equal(requireBrowserPoseCameraDeviceId("camera-c"), "camera-c");

    assert.throws(
      () =>
        resolveRoleDataCameraSelectionTransfer(
          transfer,
          "session-other",
          "patient-c",
        ),
      /登录身份不一致/,
    );
    assert.throws(
      () =>
        resolveRoleDataCameraSelectionTransfer(
          transfer,
          "session-current",
          "patient-other",
        ),
      /患者身份不一致/,
    );
  } finally {
    restoreNavigator();
  }
});

function installMediaDevices() {
  const originalNavigator = globalThis.navigator;
  const track = {
    getSettings: () => ({ deviceId: "camera-c" }),
    stop: () => undefined,
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const device = {
    deviceId: "camera-c",
    groupId: "camera-group",
    kind: "videoinput",
    label: "Camera C",
    toJSON: () => ({}),
  } as MediaDeviceInfo;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        enumerateDevices: async () => [device],
        getUserMedia: async () => stream,
      },
    },
  });
  return () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  };
}
