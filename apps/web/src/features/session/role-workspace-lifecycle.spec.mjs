import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sessionDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(sessionDir, "../../..");
const rootDir = resolve(sessionDir, "../../../../..");
const bundlePath = resolve(tmpdir(), "rehab-role-workspace-lifecycle.js");
const noCameraConsentMessage = "请先完成有效的摄像头采集授权，再访问摄像头。";

test.use({ channel: "chrome" });

test.beforeAll(() => {
  const pnpmModules = resolve(rootDir, "node_modules/.pnpm");
  const esbuildPackage = readdirSync(pnpmModules).find((name) =>
    name.startsWith("esbuild@"),
  );
  if (!esbuildPackage) throw new Error("esbuild package is unavailable");
  const esbuild = resolve(
    pnpmModules,
    esbuildPackage,
    "node_modules/esbuild/bin/esbuild",
  );
  execFileSync(esbuild, [
    resolve(sessionDir, "role-workspace-lifecycle.harness.tsx"),
    "--bundle",
    "--format=iife",
    "--platform=browser",
    `--outfile=${bundlePath}`,
    `--tsconfig=${resolve(webDir, "tsconfig.json")}`,
    '--define:process.env.NEXT_PUBLIC_API_BASE_URL="http://unit.test"',
  ]);
});

test.beforeEach(async ({ page }) => {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ path: bundlePath });
  await page.waitForFunction(() => Boolean(window.roleLifecycleHarness));
});

test("mounted role data ignores an older patient response after patient switch", async ({
  page,
}) => {
  const api = await installDeferredPatientApi(page);
  const patientBRequest = api.waitForPatient("patient-b");
  await startLoad(page, "patient-b", "patientB");
  const deferredPatientB = await patientBRequest;

  const patientCRequest = api.waitForPatient("patient-c");
  await startLoad(page, "patient-c", "patientC");
  const deferredPatientC = await patientCRequest;
  await deferredPatientC.fulfill({ json: patientProfile("patient-c", false) });
  await awaitLoad(page, "patientC");

  await deferredPatientB.fulfill({ json: patientProfile("patient-b", true) });
  await awaitLoad(page, "patientB");

  await expect.poll(() => snapshot(page)).toMatchObject({
    patientId: "patient-c",
    status: "业务数据已加载",
  });
  await expect.poll(() => probeCameraConsent(page)).toBe(noCameraConsentMessage);
});

test("mounted role data ignores a deferred response after logout", async ({ page }) => {
  const api = await installDeferredPatientApi(page);
  const patientBRequest = api.waitForPatient("patient-b");
  await startLoad(page, "patient-b", "logoutLoad");
  const deferredPatientB = await patientBRequest;

  await page.evaluate(() => window.roleLifecycleHarness.logout());
  await deferredPatientB.fulfill({ json: patientProfile("patient-b", true) });
  await awaitLoad(page, "logoutLoad");

  await expect.poll(() => snapshot(page)).toEqual({
    error: null,
    status: "已退出登录",
  });
  await expect.poll(() => probeCameraConsent(page)).toBe(noCameraConsentMessage);
});

test("unmounted role data ignores a deferred response and cannot restore consent", async ({
  page,
}) => {
  const api = await installDeferredPatientApi(page);
  const patientBRequest = api.waitForPatient("patient-b");
  await startLoad(page, "patient-b", "unmountLoad");
  const deferredPatientB = await patientBRequest;

  await page.evaluate(() => window.roleLifecycleHarness.unmount());
  await deferredPatientB.fulfill({ json: patientProfile("patient-b", true) });
  await awaitLoad(page, "unmountLoad");

  await expect.poll(() => probeCameraConsent(page)).toBe(noCameraConsentMessage);
});

async function installDeferredPatientApi(page) {
  const patientWaiters = new Map();
  await page.route("http://unit.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const patientMatch = path.match(/^\/patients\/([^/]+)$/);
    if (patientMatch) {
      const patientId = patientMatch[1];
      const waiter = patientWaiters.get(patientId);
      if (!waiter) throw new Error(`No deferred waiter for ${patientId}`);
      patientWaiters.delete(patientId);
      waiter(route);
      return;
    }
    if (path.endsWith("/assessments")) {
      await route.fulfill({ json: [] });
      return;
    }
    if (path.endsWith("/training-records")) {
      await route.fulfill({
        json: {
          sessions: [],
          summary: {
            totalSessions: 0,
            completedSessions: 0,
            averageScore: 0,
            abnormalCount: 0,
          },
        },
      });
      return;
    }
    if (path.endsWith("/rewards")) {
      await route.fulfill({ json: { ledger: [], achievements: [] } });
      return;
    }
    if (path.endsWith("/collection-batches") || path.endsWith("/ai-conversations")) {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({ status: 404, json: { message: `Unhandled ${path}` } });
  });

  return {
    waitForPatient(patientId) {
      return new Promise((resolveRequest) => {
        patientWaiters.set(patientId, resolveRequest);
      });
    },
  };
}

async function startLoad(page, patientId, promiseKey) {
  await page.evaluate(
    ({ patientId: id, promiseKey: key }) => {
      window.roleLifecyclePromises[key] =
        window.roleLifecycleHarness.loadPatient(id);
    },
    { patientId, promiseKey },
  );
}

async function awaitLoad(page, promiseKey) {
  await page.evaluate((key) => window.roleLifecyclePromises[key], promiseKey);
}

function snapshot(page) {
  return page.evaluate(() => window.roleLifecycleHarness.snapshot());
}

function probeCameraConsent(page) {
  return page.evaluate(() => window.roleLifecycleHarness.probeCameraConsent());
}

function patientProfile(patientId, hasCameraConsent) {
  return {
    id: patientId,
    userId: `user-${patientId}`,
    name: patientId === "patient-b" ? "患者 B" : "患者 C",
    gender: "female",
    age: 72,
    healthMetrics: {},
    riskGrades: [],
    rehabPlans: [],
    trainingSessions: [],
    assessments: [],
    caregiverRelations: [],
    consents: hasCameraConsent
      ? [
          {
            id: `consent-${patientId}`,
            patientId,
            subjectUserId: `user-${patientId}`,
            consentType: "camera_capture",
            consentVersion: "1",
            status: "granted",
            grantedAt: "2026-07-13T00:00:00.000Z",
            evidenceSnapshot: {},
          },
        ]
      : [],
  };
}
