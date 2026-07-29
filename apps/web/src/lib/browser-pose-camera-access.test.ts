import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  openBrowserPoseCamera,
  readBrowserPoseCameraSelection,
  requireBrowserPoseCameraDeviceId,
  requireBrowserPoseCameraSelection,
  synchronizeBrowserPoseCameraConsent,
} from "./browser-pose-camera-access.ts";
import type { ConsentRecord } from "@/types/api";

const cameraConsent: ConsentRecord = {
  id: "camera-consent-record-001",
  patientId: "patient-001",
  subjectUserId: "patient-user-001",
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

test("camera access validates camera_capture consent before getUserMedia", async () => {
  let enumerateCount = 0;
  let getUserMediaCount = 0;
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => {
      enumerateCount += 1;
      return [videoDevice("camera-a", "Front camera")];
    },
    getUserMedia: async () => {
      getUserMediaCount += 1;
      return fakeMediaStream("camera-a");
    },
  });

  try {
    await assert.rejects(openBrowserPoseCamera(), /摄像头采集授权/);
    assert.equal(enumerateCount, 0);
    assert.equal(getUserMediaCount, 0);
  } finally {
    restoreNavigator();
  }
});

test("camera access rejects an insecure browser context before requesting permission", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  let getUserMediaCount = 0;
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => [videoDevice("camera-a", "Front camera")],
    getUserMedia: async () => {
      getUserMediaCount += 1;
      return fakeMediaStream("camera-a");
    },
  });
  const restoreWindow = installWindow({
    isSecureContext: false,
    location: { protocol: "http:" },
  });

  try {
    await assert.rejects(openBrowserPoseCamera(), /不是安全上下文/);
    assert.equal(getUserMediaCount, 0);
  } finally {
    restoreWindow();
    restoreNavigator();
  }
});

test("camera detection requests permission before requiring a real device id", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  let requestedConstraints: MediaStreamConstraints | undefined;
  let permissionGranted = false;
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () =>
      permissionGranted
        ? [
            videoDevice("camera-a", "Front camera"),
            videoDevice("camera-b", "Desk camera"),
          ]
        : [],
    getUserMedia: async (constraints) => {
      requestedConstraints = constraints;
      permissionGranted = true;
      return fakeMediaStream("camera-a");
    },
  });

  try {
    const opened = await openBrowserPoseCamera({
      width: { ideal: 640 },
      height: { ideal: 480 },
    });

    assert.deepEqual(requestedConstraints, {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    assert.equal(opened.deviceId, "camera-a");
    assert.equal(opened.consentRecordId, cameraConsent.id);
    assert.deepEqual(readBrowserPoseCameraSelection(), {
      deviceId: "camera-a",
      label: "Front camera",
      patientId: cameraConsent.patientId,
      selectedAt: opened.selectedAt,
    });
  } finally {
    restoreNavigator();
  }
});

test("formal training captures the complete authorized camera selection", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => [videoDevice("camera-a", "Front camera")],
    getUserMedia: async () => fakeMediaStream("camera-a"),
  });

  try {
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());

    assert.deepEqual(requireBrowserPoseCameraSelection("camera-a"), {
      deviceId: "camera-a",
      label: "Front camera",
      patientId: cameraConsent.patientId,
      selectedAt: opened.selectedAt,
    });
    assert.throws(
      () => requireBrowserPoseCameraSelection("camera-b"),
      /与已选摄像头不一致/,
    );
  } finally {
    restoreNavigator();
  }
});

test("camera consent restores only an explicitly supplied matching selection", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => [videoDevice("camera-a", "Front camera")],
    getUserMedia: async () => fakeMediaStream("camera-a"),
  });

  try {
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());
    const selection = requireBrowserPoseCameraSelection("camera-a");

    synchronizeBrowserPoseCameraConsent(undefined);
    synchronizeBrowserPoseCameraConsent(cameraConsent);
    assert.throws(
      () => requireBrowserPoseCameraDeviceId("camera-a"),
      /尚未完成摄像头检测/,
    );

    synchronizeBrowserPoseCameraConsent(undefined);
    synchronizeBrowserPoseCameraConsent(cameraConsent, selection);
    assert.equal(requireBrowserPoseCameraDeviceId("camera-a"), "camera-a");

    synchronizeBrowserPoseCameraConsent(undefined);
    assert.throws(
      () =>
        synchronizeBrowserPoseCameraConsent(cameraConsent, {
          ...selection,
          patientId: "patient-other",
        }),
      /当前患者身份不一致/,
    );
    assert.throws(
      () => requireBrowserPoseCameraDeviceId("camera-a"),
      /有效的摄像头采集授权/,
    );
  } finally {
    restoreNavigator();
  }
});

test("camera access rejects a different requested device instead of switching", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  let getUserMediaCount = 0;
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => [
      videoDevice("camera-a", "Front camera"),
      videoDevice("camera-b", "Desk camera"),
    ],
    getUserMedia: async () => {
      getUserMediaCount += 1;
      return fakeMediaStream("camera-a");
    },
  });

  try {
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());

    await assert.rejects(
      openBrowserPoseCamera({ deviceId: "camera-b" }),
      /与已选摄像头不一致/,
    );
    assert.equal(getUserMediaCount, 1);
  } finally {
    restoreNavigator();
  }
});

test("camera access hard-fails when the selected device disappears", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  let availableDevices = [videoDevice("camera-a", "Front camera")];
  let getUserMediaCount = 0;
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => availableDevices,
    getUserMedia: async () => {
      getUserMediaCount += 1;
      return fakeMediaStream("camera-a");
    },
  });

  try {
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());
    availableDevices = [videoDevice("camera-b", "Desk camera")];

    await assert.rejects(
      openBrowserPoseCamera({ deviceId: "camera-a" }),
      /缺失或发生变化/,
    );
    assert.equal(getUserMediaCount, 1);
  } finally {
    restoreNavigator();
  }
});

test("camera access stops a stream whose reported device id does not match", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  let stopped = false;
  let getUserMediaCount = 0;
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => [videoDevice("camera-a", "Front camera")],
    getUserMedia: async () => {
      getUserMediaCount += 1;
      return fakeMediaStream(
        getUserMediaCount === 1 ? "camera-a" : "camera-b",
        () => {
          stopped = true;
        },
      );
    },
  });

  try {
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());
    stopped = false;

    await assert.rejects(
      openBrowserPoseCamera({ deviceId: "camera-a" }),
      /返回了不同摄像头/,
    );
    assert.equal(stopped, true);
  } finally {
    restoreNavigator();
  }
});

test("formal training hard-fails when its recorded device id is missing", async () => {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  const restoreNavigator = installMediaDevices({
    enumerateDevices: async () => [videoDevice("camera-a", "Front camera")],
    getUserMedia: async () => fakeMediaStream("camera-a"),
  });

  try {
    const opened = await openBrowserPoseCamera();
    opened.stream.getTracks().forEach((track) => track.stop());
    assert.throws(
      () => requireBrowserPoseCameraDeviceId(null),
      /训练记录缺少摄像头设备标识/,
    );
  } finally {
    restoreNavigator();
  }
});

function installMediaDevices({
  enumerateDevices,
  getUserMedia,
}: {
  enumerateDevices: MediaDevices["enumerateDevices"];
  getUserMedia: MediaDevices["getUserMedia"];
}) {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { enumerateDevices, getUserMedia } },
  });
  return () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  };
}

function installWindow(value: unknown) {
  const originalWindow = (globalThis as { window?: Window }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  });
  return () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  };
}

function videoDevice(deviceId: string, label: string) {
  return {
    deviceId,
    groupId: "camera-group",
    kind: "videoinput",
    label,
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

function fakeMediaStream(
  deviceId: string,
  onStop: () => void = () => undefined,
) {
  const track = {
    getSettings: () => ({ deviceId }),
    stop: onStop,
  } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}
