import { isLoopbackHttpOrigin } from "./runtime-origin";
import type { ConsentRecord } from "@/types/api";

export type BrowserPoseCameraSelection = {
  deviceId: string;
  label?: string;
  patientId: string;
  selectedAt: string;
};

export type OpenBrowserPoseCameraOptions = Omit<
  MediaTrackConstraints,
  "deviceId"
> & {
  deviceId?: string;
};

export type OpenedBrowserPoseCamera = BrowserPoseCameraSelection & {
  consentRecordId: string;
  stream: MediaStream;
};

let activeCameraConsent: ConsentRecord | undefined;
let activeCameraSelection: BrowserPoseCameraSelection | undefined;

export function synchronizeBrowserPoseCameraConsent(
  consent: ConsentRecord | undefined,
  cameraSelection?: BrowserPoseCameraSelection,
) {
  if (!consent) {
    activeCameraConsent = undefined;
    activeCameraSelection = undefined;
    return;
  }
  if (
    consent.consentType !== "camera_capture" ||
    consent.status !== "granted" ||
    Boolean(consent.revokedAt) ||
    !consent.id.trim() ||
    !consent.patientId.trim() ||
    !consent.grantedAt.trim()
  ) {
    activeCameraConsent = undefined;
    activeCameraSelection = undefined;
    throw new Error("摄像头采集授权记录无效，不能访问摄像头。");
  }

  let nextSelection = activeCameraSelection;
  if (cameraSelection) {
    try {
      nextSelection = validateCameraSelection(
        cameraSelection,
        consent.patientId,
      );
    } catch (error) {
      activeCameraConsent = undefined;
      activeCameraSelection = undefined;
      throw error;
    }
  } else if (activeCameraConsent?.patientId !== consent.patientId) {
    nextSelection = undefined;
  }
  activeCameraConsent = consent;
  activeCameraSelection = nextSelection;
}

export function readBrowserPoseCameraSelection() {
  return activeCameraSelection ? { ...activeCameraSelection } : undefined;
}

export function requireBrowserPoseCameraDeviceId(deviceId?: string | null) {
  return requireBrowserPoseCameraSelection(deviceId).deviceId;
}

export function requireBrowserPoseCameraSelection(deviceId?: string | null) {
  const consent = requireCameraConsent();
  const selection = activeCameraSelection;
  if (!selection || selection.patientId !== consent.patientId) {
    throw new Error("尚未完成摄像头检测，不能开始姿态预检或正式训练。");
  }
  if (deviceId === null) {
    throw new Error("训练记录缺少摄像头设备标识，正式训练不能启动。");
  }
  if (deviceId !== undefined && deviceId.trim() !== selection.deviceId) {
    throw new Error("训练记录中的设备与已选摄像头不一致，训练不会自动换设备。");
  }
  return { ...selection };
}

export async function openBrowserPoseCamera(
  options: OpenBrowserPoseCameraOptions = {},
): Promise<OpenedBrowserPoseCamera> {
  const consent = requireCameraConsent();
  requireSecureDeviceContext();
  const mediaDevices = requireMediaDevices();
  const requestedDeviceId = options.deviceId?.trim();
  const { deviceId: ignoredDeviceId, ...videoConstraints } = options;
  void ignoredDeviceId;

  if (!activeCameraSelection && !requestedDeviceId) {
    return openInitialCameraSelection(
      mediaDevices,
      consent,
      videoConstraints,
    );
  }

  const availableBeforeOpen = await mediaDevices.enumerateDevices();
  const selection = resolveCameraSelection(
    availableBeforeOpen,
    consent.patientId,
    requestedDeviceId,
  );

  let stream: MediaStream;
  try {
    stream = await mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: selection.deviceId },
        ...videoConstraints,
      },
      audio: false,
    });
  } catch (error) {
    if (isMissingDeviceError(error)) {
      throw new Error("已选摄像头已缺失或发生变化，训练不会自动改用其他设备。");
    }
    throw error;
  }

  try {
    const videoTrack = stream.getVideoTracks()[0];
    const openedDeviceId = videoTrack?.getSettings().deviceId?.trim();
    if (!openedDeviceId) {
      throw new Error("摄像头没有返回真实设备标识，不能继续训练。");
    }
    if (openedDeviceId !== selection.deviceId) {
      throw new Error("浏览器返回了不同摄像头，训练已停止且不会自动换设备。");
    }

    const availableAfterOpen = await mediaDevices.enumerateDevices();
    const openedDevice = findVideoDevice(
      availableAfterOpen,
      selection.deviceId,
    );
    if (!openedDevice) {
      throw new Error("已选摄像头已缺失或发生变化，训练不会自动改用其他设备。");
    }
    activeCameraSelection = {
      ...selection,
      ...(openedDevice.label.trim()
        ? { label: openedDevice.label.trim() }
        : {}),
    };

    return {
      ...activeCameraSelection,
      consentRecordId: consent.id,
      stream,
    };
  } catch (error) {
    stopMediaStream(stream);
    throw error;
  }
}

async function openInitialCameraSelection(
  mediaDevices: MediaDevices,
  consent: ConsentRecord,
  videoConstraints: MediaTrackConstraints,
): Promise<OpenedBrowserPoseCamera> {
  const stream = await mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });

  try {
    const videoTrack = stream.getVideoTracks()[0];
    const openedDeviceId = videoTrack?.getSettings().deviceId?.trim();
    if (!openedDeviceId) {
      throw new Error("摄像头没有返回真实设备标识，不能继续训练。");
    }

    const availableAfterOpen = await mediaDevices.enumerateDevices();
    const openedDevice = findVideoDevice(availableAfterOpen, openedDeviceId);
    if (!openedDevice) {
      throw new Error("已打开的摄像头未出现在设备列表中，不能继续训练。");
    }

    activeCameraSelection = {
      deviceId: openedDeviceId,
      ...(openedDevice.label.trim()
        ? { label: openedDevice.label.trim() }
        : {}),
      patientId: consent.patientId,
      selectedAt: new Date().toISOString(),
    };

    return {
      ...activeCameraSelection,
      consentRecordId: consent.id,
      stream,
    };
  } catch (error) {
    stopMediaStream(stream);
    throw error;
  }
}

export function stopMediaStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function requireCameraConsent() {
  if (!activeCameraConsent) {
    throw new Error("请先完成有效的摄像头采集授权，再访问摄像头。");
  }
  return activeCameraConsent;
}

function requireMediaDevices() {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    !navigator.mediaDevices.enumerateDevices
  ) {
    throw new Error("当前浏览器不支持摄像头设备检测。");
  }
  return navigator.mediaDevices;
}

export function requireSecureDeviceContext() {
  if (typeof window === "undefined") {
    // Server rendering cannot access navigator.mediaDevices; keep that explicit
    // capability check in requireMediaDevices while allowing node unit tests.
    return;
  }
  if (!window.isSecureContext) {
    throw new Error("当前页面不是安全上下文，必须通过 HTTPS 才能使用摄像头。");
  }
  if (
    process.env.NODE_ENV === "production" &&
    window.location.protocol !== "https:" &&
    !isLoopbackHttpOrigin(window.location.origin)
  ) {
    throw new Error("生产训练必须通过 HTTPS 才能使用摄像头。");
  }
}

function resolveCameraSelection(
  devices: MediaDeviceInfo[],
  patientId: string,
  requestedDeviceId: string | undefined,
) {
  if (activeCameraSelection) {
    if (activeCameraSelection.patientId !== patientId) {
      throw new Error("摄像头选择与当前患者身份不一致。");
    }
    if (
      requestedDeviceId &&
      requestedDeviceId !== activeCameraSelection.deviceId
    ) {
      throw new Error("请求的设备与已选摄像头不一致，训练不会自动换设备。");
    }
    const selectedDevice = findVideoDevice(
      devices,
      activeCameraSelection.deviceId,
    );
    if (!selectedDevice) {
      throw new Error("已选摄像头已缺失或发生变化，训练不会自动改用其他设备。");
    }
    return activeCameraSelection;
  }

  if (requestedDeviceId) {
    throw new Error("尚未完成摄像头检测，不能直接指定正式训练设备。");
  }
  const selectedDevice = devices.find(
    (device) => device.kind === "videoinput" && Boolean(device.deviceId.trim()),
  );
  if (!selectedDevice) {
    throw new Error("未识别到带真实设备标识的摄像头。");
  }
  activeCameraSelection = {
    deviceId: selectedDevice.deviceId,
    ...(selectedDevice.label.trim()
      ? { label: selectedDevice.label.trim() }
      : {}),
    patientId,
    selectedAt: new Date().toISOString(),
  };
  return activeCameraSelection;
}

function findVideoDevice(devices: MediaDeviceInfo[], deviceId: string) {
  return devices.find(
    (device) => device.kind === "videoinput" && device.deviceId === deviceId,
  );
}

function validateCameraSelection(
  selection: BrowserPoseCameraSelection,
  patientId: string,
): BrowserPoseCameraSelection {
  if (selection.patientId !== patientId) {
    throw new Error("摄像头选择与当前患者身份不一致。");
  }
  if (
    !selection.deviceId.trim() ||
    selection.deviceId !== selection.deviceId.trim() ||
    !selection.selectedAt.trim() ||
    Number.isNaN(Date.parse(selection.selectedAt)) ||
    (selection.label !== undefined && !selection.label.trim())
  ) {
    throw new Error("摄像头选择记录无效，不能继续正式训练。");
  }
  return { ...selection };
}

function isMissingDeviceError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  );
}
