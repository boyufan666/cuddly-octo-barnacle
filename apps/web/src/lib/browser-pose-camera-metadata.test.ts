import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readBrowserPoseCameraMetadata } from "./browser-pose-camera-metadata.ts";
import {
  openBrowserPoseCamera,
  stopMediaStream,
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

class FakeVideoElement {
  autoResolveMetadata = true;
  muted = false;
  playsInline = false;
  assignedStreamCount = 0;
  videoWidth = 1280;
  videoHeight = 720;
  pauseCount = 0;
  private currentSrcObject: unknown = null;
  private listeners = new Map<string, EventListener>();

  get srcObject() {
    return this.currentSrcObject;
  }

  set srcObject(value: unknown) {
    this.currentSrcObject = value;
    if (value) this.assignedStreamCount += 1;
  }

  addEventListener(
    name: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    void options;
    this.listeners.set(name, listener);
    if (name === "loadedmetadata" && this.autoResolveMetadata) {
      queueMicrotask(() => listener(new Event("loadedmetadata")));
    }
  }

  removeEventListener(name: string) {
    this.listeners.delete(name);
  }

  pause() {
    this.pauseCount += 1;
  }
}

function installDocument(video: FakeVideoElement) {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tagName: string) => {
        assert.equal(tagName, "video");
        return video;
      },
    },
  });
  return () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  };
}

function installNavigator(getUserMedia: MediaDevices["getUserMedia"]) {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        enumerateDevices: async () => [videoDevice("camera-device-id")],
        getUserMedia,
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

function fakeMediaStream(onStop: () => void): MediaStream {
  const track = {
    getSettings: () => ({ deviceId: "camera-device-id" }),
    stop: onStop,
  } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function videoDevice(deviceId: string) {
  return {
    deviceId,
    groupId: "camera-group",
    kind: "videoinput",
    label: "Front camera",
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

async function prepareCameraSelection() {
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  const opened = await openBrowserPoseCamera();
  stopMediaStream(opened.stream);
}

test("readBrowserPoseCameraMetadata opens the exact camera and returns real video dimensions", async () => {
  const stoppedTracks: string[] = [];
  let getUserMediaCount = 0;
  const video = new FakeVideoElement();
  const restoreDocument = installDocument(video);
  const restoreNavigator = installNavigator(async (constraints) => {
    getUserMediaCount += 1;
    assert.deepEqual(
      constraints,
      getUserMediaCount === 1
        ? { video: {}, audio: false }
        : {
            video: { deviceId: { exact: "camera-device-id" } },
            audio: false,
          },
    );
    return fakeMediaStream(() => {
      stoppedTracks.push("stopped");
    });
  });

  try {
    await prepareCameraSelection();
    stoppedTracks.length = 0;
    const metadata = await readBrowserPoseCameraMetadata("camera-device-id");
    assert.deepEqual(metadata, {
      cameraDeviceId: "camera-device-id",
      videoWidth: 1280,
      videoHeight: 720,
    });
    assert.equal(video.assignedStreamCount, 1);
    assert.deepEqual(stoppedTracks, ["stopped"]);
    assert.equal(video.srcObject, null);
    assert.equal(video.pauseCount, 1);
  } finally {
    restoreNavigator();
    restoreDocument();
  }
});

test("readBrowserPoseCameraMetadata rejects missing real dimensions and still stops tracks", async () => {
  const stoppedTracks: string[] = [];
  const video = new FakeVideoElement();
  video.videoWidth = 0;
  video.videoHeight = 0;
  const restoreDocument = installDocument(video);
  const restoreNavigator = installNavigator(async () =>
    fakeMediaStream(() => {
      stoppedTracks.push("stopped");
    }),
  );

  try {
    await prepareCameraSelection();
    stoppedTracks.length = 0;
    await assert.rejects(
      readBrowserPoseCameraMetadata("camera-device-id"),
      /真实视频分辨率/,
    );
    assert.deepEqual(stoppedTracks, ["stopped"]);
    assert.equal(video.srcObject, null);
    assert.equal(video.pauseCount, 1);
  } finally {
    restoreNavigator();
    restoreDocument();
  }
});

test("readBrowserPoseCameraMetadata rejects metadata timeout and still stops tracks", async () => {
  const stoppedTracks: string[] = [];
  const video = new FakeVideoElement();
  video.autoResolveMetadata = false;
  const restoreDocument = installDocument(video);
  const restoreNavigator = installNavigator(async () =>
    fakeMediaStream(() => {
      stoppedTracks.push("stopped");
    }),
  );

  try {
    await prepareCameraSelection();
    stoppedTracks.length = 0;
    await assert.rejects(
      readBrowserPoseCameraMetadata("camera-device-id", {
        metadataTimeoutMs: 1,
      }),
      /视频元数据超时/,
    );
    assert.deepEqual(stoppedTracks, ["stopped"]);
    assert.equal(video.srcObject, null);
    assert.equal(video.pauseCount, 1);
  } finally {
    restoreNavigator();
    restoreDocument();
  }
});

test("readBrowserPoseCameraMetadata rejects browsers without getUserMedia", async () => {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: {} },
  });
  synchronizeBrowserPoseCameraConsent(cameraConsent);

  try {
    await assert.rejects(
      readBrowserPoseCameraMetadata("camera-device-id"),
      /不支持摄像头设备检测/,
    );
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});
