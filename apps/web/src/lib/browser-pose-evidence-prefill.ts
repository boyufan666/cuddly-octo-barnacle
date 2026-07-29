export type BrowserPoseEvidencePrefillForm = {
  acceptedAt: string;
  testerName: string;
  siteName: string;
  environment: string;
  browserName: string;
  browserVersion: string;
  cameraDeviceIdHash: string;
  cameraResolution: string;
  patientExportId: string;
  confirmedByDoctorId: string;
  confirmedAt: string;
  auditLogIdsText: string;
  screenshotPath: string;
  screenshotCapturedAt: string;
  recordingPath: string;
  recordingCapturedAt: string;
};

export type BrowserPoseEvidencePrefillReadiness = {
  cameraDeviceId?: string;
  checkedAt?: string;
};

export type BrowserPoseEvidencePrefillEnvironment = {
  nowIso: string;
  userAgent: string;
  videoWidth?: number;
  videoHeight?: number;
  cameraDeviceId?: string;
};

const autoPrefillFields = [
  "browserName",
  "browserVersion",
  "cameraDeviceIdHash",
  "cameraResolution",
] as const satisfies ReadonlyArray<keyof BrowserPoseEvidencePrefillForm>;

type BrowserPoseEvidenceAutoPrefillField = (typeof autoPrefillFields)[number];

export async function buildBrowserPoseEvidencePrefill(
  current: BrowserPoseEvidencePrefillForm,
  readiness: BrowserPoseEvidencePrefillReadiness,
  environment: BrowserPoseEvidencePrefillEnvironment,
): Promise<Partial<BrowserPoseEvidencePrefillForm>> {
  const cameraDeviceId = environment.cameraDeviceId ?? readiness.cameraDeviceId;
  const next: Partial<BrowserPoseEvidencePrefillForm> = {};
  const browser = parseBrowserIdentity(environment.userAgent);

  if (browser.name && !current.browserName.trim()) {
    next.browserName = browser.name;
  }
  if (browser.version && !current.browserVersion.trim()) {
    next.browserVersion = browser.version;
  }
  if (cameraDeviceId && !current.cameraDeviceIdHash.trim()) {
    next.cameraDeviceIdHash = await sha256DigestText(cameraDeviceId);
  }
  if (
    !current.cameraResolution.trim() &&
    environment.videoWidth &&
    environment.videoHeight
  ) {
    next.cameraResolution = `${environment.videoWidth}x${environment.videoHeight}`;
  }

  return next;
}

export function mergeBrowserPoseEvidencePrefill(
  current: BrowserPoseEvidencePrefillForm,
  prefill: Partial<BrowserPoseEvidencePrefillForm>,
): BrowserPoseEvidencePrefillForm {
  const next = { ...current };

  for (const field of autoPrefillFields) {
    const value = prefill[field];
    if (value && !current[field].trim()) {
      next[field as BrowserPoseEvidenceAutoPrefillField] = value;
    }
  }

  return next;
}

export function parseBrowserIdentity(userAgent: string) {
  const chrome = userAgent.match(/(?:Chrome|CriOS)\/([0-9.]+)/);
  if (chrome && !/Edg\//.test(userAgent)) {
    return { name: "Chrome", version: chrome[1] };
  }
  const edge = userAgent.match(/Edg\/([0-9.]+)/);
  if (edge) {
    return { name: "Edge", version: edge[1] };
  }
  const firefox = userAgent.match(/Firefox\/([0-9.]+)/);
  if (firefox) {
    return { name: "Firefox", version: firefox[1] };
  }
  const safari = userAgent.match(/Version\/([0-9.]+).*Safari\//);
  if (safari && !/Chrome|CriOS|Edg\//.test(userAgent)) {
    return { name: "Safari", version: safari[1] };
  }
  return { name: "", version: "" };
}

export async function sha256DigestText(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前浏览器不支持 SHA-256 摘要能力，不能生成摄像头设备哈希。");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
