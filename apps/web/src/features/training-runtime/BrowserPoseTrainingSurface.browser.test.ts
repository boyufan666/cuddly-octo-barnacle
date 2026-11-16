import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
const webDir = process.cwd();
const rootDir = resolve(webDir, "../..");
const bundle = resolve(tmpdir(), "rehab-four-pose-start.js");
test("four enhanced games render real Phaser stages and open their start gate without a camera", async () => {
  const packages = resolve(rootDir, "node_modules/.pnpm");
  const esbuild = readdirSync(packages).find((name) =>
    name.startsWith("esbuild@"),
  )!;
  execFileSync(resolve(packages, esbuild, "node_modules/esbuild/bin/esbuild"), [
    resolve(
      webDir,
      "src/features/training-runtime/BrowserPoseTrainingSurface.browser.harness.tsx",
    ),
    "--bundle",
    "--format=iife",
    "--platform=browser",
    `--outfile=${bundle}`,
    `--tsconfig=${resolve(webDir, "tsconfig.json")}`,
    '--define:process.env.NEXT_PUBLIC_API_BASE_URL="http://unit.test"',
  ]);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("https://runtime.test/", (route) =>
      route.fulfill({
        contentType: "text/html",
        headers: {
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
        },
        body: `<style>${readFileSync(resolve(webDir, "src/app/globals.css"), "utf8")} section {position:relative;width:960px;height:700px}</style><main id="root"></main>`,
      }),
    );
    await page.goto("https://runtime.test/");
    await page.evaluate(`(() => {
      Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => { throw new Error("camera must not be opened"); } } });
      const request = window.requestAnimationFrame;
      window.requestAnimationFrame = (callback) => request((now) => setTimeout(() => callback(now), 500));
    })()`);
    await page.addScriptTag({ path: bundle });
    for (const code of [
      "balance_breath",
      "orbital_trace_follow",
      "center_shift_bridge",
      "bilateral_rhythm_sync",
    ]) {
      const game = page.locator(`[data-game-code="${code}"]`);
      await game
        .getByRole("button", { name: "正在准备训练画面", exact: true })
        .waitFor();
      assert.equal(
        await game
          .getByRole("button", { name: "正在准备训练画面", exact: true })
          .isDisabled(),
        true,
      );
    }
    for (const code of [
      "balance_breath",
      "orbital_trace_follow",
      "center_shift_bridge",
      "bilateral_rhythm_sync",
    ]) {
      const game = page.locator(`[data-game-code="${code}"]`);
      await game.locator("canvas").waitFor({ timeout: 15_000 });
      await game
        .getByRole("button", { name: "开始训练", exact: true })
        .waitFor({ timeout: 15_000 });
      assert.equal(
        await game
          .getByRole("button", { name: "开始训练", exact: true })
          .isEnabled(),
        true,
      );
      assert.equal(
        await game
          .getByText("训练画面尚未就绪，不能开始本次训练。", { exact: true })
          .count(),
        0,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
