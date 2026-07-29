import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowserPoseEvidencePrefill,
  mergeBrowserPoseEvidencePrefill,
  parseBrowserIdentity,
  sha256DigestText,
  type BrowserPoseEvidencePrefillForm,
} from "./browser-pose-evidence-prefill.ts";

const realChromeUa =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36";
const realEdgeUa =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68";
const realSafariUa =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

function emptyForm(
  overrides: Partial<BrowserPoseEvidencePrefillForm> = {},
): BrowserPoseEvidencePrefillForm {
  return {
    acceptedAt: "",
    testerName: "",
    siteName: "",
    environment: "",
    browserName: "",
    browserVersion: "",
    cameraDeviceIdHash: "",
    cameraResolution: "",
    patientExportId: "",
    confirmedByDoctorId: "",
    confirmedAt: "",
    auditLogIdsText: "",
    screenshotPath: "",
    screenshotCapturedAt: "",
    recordingPath: "",
    recordingCapturedAt: "",
    ...overrides,
  };
}

test("parseBrowserIdentity extracts Chrome, Edge, and Safari identities", () => {
  assert.deepEqual(parseBrowserIdentity(realChromeUa), {
    name: "Chrome",
    version: "126.0.6478.127",
  });
  assert.deepEqual(parseBrowserIdentity(realEdgeUa), {
    name: "Edge",
    version: "126.0.2592.68",
  });
  assert.deepEqual(parseBrowserIdentity(realSafariUa), {
    name: "Safari",
    version: "17.5",
  });
});

test("parseBrowserIdentity returns empty fields for unknown browser agents", () => {
  assert.deepEqual(parseBrowserIdentity("RealDeviceBrowser/1.2.3"), {
    name: "",
    version: "",
  });
});

test("buildBrowserPoseEvidencePrefill fills only browser and camera fields from real runtime inputs", async () => {
  const prefill = await buildBrowserPoseEvidencePrefill(
    emptyForm(),
    { cameraDeviceId: "real-camera-device-id" },
    {
      nowIso: "2026-05-28T10:00:00.000Z",
      userAgent: realChromeUa,
      videoWidth: 1280,
      videoHeight: 720,
    },
  );

  assert.equal(prefill.browserName, "Chrome");
  assert.equal(prefill.browserVersion, "126.0.6478.127");
  assert.equal(prefill.cameraResolution, "1280x720");
  assert.match(String(prefill.cameraDeviceIdHash), /^sha256:[a-f0-9]{64}$/);

  assert.equal("acceptedAt" in prefill, false);
  assert.equal("testerName" in prefill, false);
  assert.equal("siteName" in prefill, false);
  assert.equal("environment" in prefill, false);
  assert.equal("patientExportId" in prefill, false);
  assert.equal("confirmedByDoctorId" in prefill, false);
  assert.equal("confirmedAt" in prefill, false);
  assert.equal("auditLogIdsText" in prefill, false);
  assert.equal("screenshotPath" in prefill, false);
  assert.equal("screenshotCapturedAt" in prefill, false);
  assert.equal("recordingPath" in prefill, false);
  assert.equal("recordingCapturedAt" in prefill, false);
});

test("buildBrowserPoseEvidencePrefill never returns fields that would overwrite existing manual evidence", async () => {
  const prefill = await buildBrowserPoseEvidencePrefill(
    emptyForm({
      acceptedAt: "2026-05-28T09:00:00.000Z",
      browserName: "现场确认浏览器",
      browserVersion: "现场确认版本",
      cameraDeviceIdHash: "sha256:existing",
      cameraResolution: "1920x1080",
    }),
    { cameraDeviceId: "real-camera-device-id" },
    {
      nowIso: "2026-05-28T10:00:00.000Z",
      userAgent: realChromeUa,
      videoWidth: 1280,
      videoHeight: 720,
    },
  );

  assert.equal("browserName" in prefill, false);
  assert.equal("browserVersion" in prefill, false);
  assert.equal("cameraDeviceIdHash" in prefill, false);
  assert.equal("cameraResolution" in prefill, false);
});

test("mergeBrowserPoseEvidencePrefill writes only fields that are still empty at merge time", () => {
  const merged = mergeBrowserPoseEvidencePrefill(
    emptyForm({
      browserName: "用户读取中手动填写的浏览器",
      cameraResolution: "1920x1080",
    }),
    {
      browserName: "Chrome",
      browserVersion: "126.0.6478.127",
      cameraDeviceIdHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      cameraResolution: "1280x720",
      testerName: "不应写入的字段",
    },
  );

  assert.equal(merged.browserName, "用户读取中手动填写的浏览器");
  assert.equal(merged.cameraResolution, "1920x1080");
  assert.equal(merged.browserVersion, "126.0.6478.127");
  assert.equal(
    merged.cameraDeviceIdHash,
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(merged.testerName, "");
});

test("buildBrowserPoseEvidencePrefill does not invent browser, hash, or resolution values when real inputs are missing", async () => {
  const prefill = await buildBrowserPoseEvidencePrefill(
    emptyForm(),
    {},
    {
      nowIso: "2026-05-28T10:00:00.000Z",
      userAgent: "UnknownBrowser/1.0",
    },
  );

  assert.deepEqual(prefill, {});
});

test("sha256DigestText returns a SHA-256 digest and fails when Web Crypto is unavailable", async () => {
  const originalCrypto = globalThis.crypto;

  try {
    const digest = await sha256DigestText("real-camera-device-id");
    assert.match(digest, /^sha256:[a-f0-9]{64}$/);

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    await assert.rejects(
      sha256DigestText("real-camera-device-id"),
      /SHA-256 摘要能力/,
    );
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  }
});
