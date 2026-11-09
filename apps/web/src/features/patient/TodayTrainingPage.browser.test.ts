import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const patientDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(patientDir, "../../..");
const rootDir = resolve(patientDir, "../../../../..");
const bundlePath = resolve(tmpdir(), "rehab-today-training-page.js");

test.before(() => {
  const pnpmModules = resolve(rootDir, "node_modules/.pnpm");
  const esbuildPackage = readdirSync(pnpmModules).find((name) =>
    name.startsWith("esbuild@"),
  );
  if (!esbuildPackage) throw new Error("esbuild package is unavailable");
  execFileSync(
    resolve(
      pnpmModules,
      esbuildPackage,
      "node_modules/esbuild/bin/esbuild",
    ),
    [
      resolve(patientDir, "TodayTrainingPage.browser.harness.tsx"),
      "--bundle",
      "--format=iife",
      "--platform=browser",
      `--outfile=${bundlePath}`,
      `--tsconfig=${resolve(webDir, "tsconfig.json")}`,
      '--define:process.env.NEXT_PUBLIC_API_BASE_URL="http://unit.test"',
    ],
  );
});

test("abort requires a bounded reason and a second explicit confirmation", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(2_000);
  try {
    await page.setContent('<main id="root"></main>');
    await page.addScriptTag({ path: bundlePath });

    await page.getByRole("button", { name: "终止本次训练" }).click();
    const reason = page.getByLabel("终止原因");
    const confirm = page.getByRole("button", { name: "确认终止本次训练" });
    await reason.waitFor();
    assert.equal(await confirm.isDisabled(), true);
    assert.deepEqual(await snapshot(page), { abortReasons: [], resumeCalls: 0 });

    await reason.fill("a".repeat(501));
    assert.equal(await confirm.isDisabled(), true);
    assert.match(await page.locator("body").innerText(), /500/);

    await reason.fill("  患者感到不适  ");
    assert.equal(await confirm.isEnabled(), true);
    assert.deepEqual(await snapshot(page), { abortReasons: [], resumeCalls: 0 });
    await confirm.click();

    await page.getByRole("alert").waitFor();
    assert.deepEqual(await snapshot(page), {
      abortReasons: ["患者感到不适"],
      resumeCalls: 0,
    });
    assert.equal(await reason.inputValue(), "  患者感到不适  ");
    assert.match(await page.locator("body").innerText(), /有一项训练尚未完成/);
    assert.match(await page.getByRole("alert").innerText(), /仍可继续/);
  } finally {
    await browser.close();
  }
});

test("successful abort clears the local reason before a future active session", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(2_000);
  try {
    await page.setContent('<main id="root"></main>');
    await page.addScriptTag({ path: bundlePath });

    await page.getByRole("button", { name: "终止本次训练" }).click();
    await page.getByLabel("终止原因").fill("患者需要休息");
    await page.evaluate(() => window.todayTrainingHarness.succeedNextAbort());
    await page
      .getByRole("button", { name: "确认终止本次训练" })
      .click();
    await page.getByText("本次训练已终止。").waitFor();
    assert.equal(await page.getByText("有一项训练尚未完成").count(), 0);

    await page.evaluate(() => window.todayTrainingHarness.showActiveSession());
    await page.getByTestId("patient-open-abort-training").waitFor();
    assert.equal(await page.getByLabel("终止原因").count(), 0);
  } finally {
    await browser.close();
  }
});

function snapshot(page: Page) {
  return page.evaluate(() => window.todayTrainingHarness.snapshot());
}
