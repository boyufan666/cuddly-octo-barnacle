import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { webcrypto } from "node:crypto";
import type { ConsentRecord } from "@/types/api";
import {
  createPoseTrainingRuntime,
} from "./pose-readiness.ts";
import {
  openBrowserPoseCamera,
  stopMediaStream,
  synchronizeBrowserPoseCameraConsent,
} from "./browser-pose-camera-access.ts";

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

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length) restorers.pop()?.();
  synchronizeBrowserPoseCameraConsent(undefined);
});

test("pose runtime abort releases the selected camera while preparation is pending", async () => {
  const video = new FakeVideoElement(false);
  let stopped = false;
  installBrowserEnvironment(() => {
    stopped = true;
  });
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  await prepareCameraSelection();
  stopped = false;
  const controller = new AbortController();

  const runtimePromise = createPoseTrainingRuntime({
    videoElement: video as unknown as HTMLVideoElement,
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();

  await assert.rejects(runtimePromise, /训练准备已停止/);
  assert.equal(stopped, true);
  assert.equal(video.srcObject, null);
  assert.equal(video.pauseCount, 1);
});

test("pose runtime releases video and camera when local model preparation fails", async () => {
  const video = new FakeVideoElement(true);
  let stopped = false;
  installBrowserEnvironment(() => {
    stopped = true;
  });
  installGlobal("fetch", async () => new Response(null, { status: 404 }));
  installGlobal("crypto", webcrypto);
  synchronizeBrowserPoseCameraConsent(cameraConsent);
  await prepareCameraSelection();
  stopped = false;

  await assert.rejects(
    createPoseTrainingRuntime({
      videoElement: video as unknown as HTMLVideoElement,
    }),
    /本地训练识别资源缺失/,
  );
  assert.equal(stopped, true);
  assert.equal(video.srcObject, null);
  assert.equal(video.pauseCount, 1);
});

class FakeVideoElement {
  muted = false;
  playsInline = false;
  autoplay = false;
  pauseCount = 0;
  private currentSrcObject: unknown = null;
  private listeners = new Map<string, EventListener>();

  constructor(private readonly resolveMetadata: boolean) {}

  get srcObject() {
    return this.currentSrcObject;
  }

  set srcObject(value: unknown) {
    this.currentSrcObject = value;
    if (value && this.resolveMetadata) {
      queueMicrotask(() => {
        this.listeners.get("loadedmetadata")?.(new Event("loadedmetadata"));
      });
    }
  }

  addEventListener(name: string, listener: EventListener) {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string) {
    this.listeners.delete(name);
  }

  play() {
    return Promise.resolve();
  }

  pause() {
    this.pauseCount += 1;
  }
}

function installBrowserEnvironment(onStop: () => void) {
  installGlobal("window", {
    isSecureContext: true,
    setTimeout: (callback: TimerHandler) =>
      globalThis.setTimeout(callback, 10),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
  installGlobal("navigator", {
    mediaDevices: {
      enumerateDevices: async () => [videoDevice("camera-a")],
      getUserMedia: async () => fakeMediaStream("camera-a", onStop),
    },
  });
}

async function prepareCameraSelection() {
  const opened = await openBrowserPoseCamera();
  stopMediaStream(opened.stream);
}

function installGlobal(name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
  restorers.push(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  });
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

function fakeMediaStream(deviceId: string, onStop: () => void) {
  const track = {
    getSettings: () => ({ deviceId }),
    stop: onStop,
  } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}
