import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

const testFilePath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(testFilePath), "../../..");
const stageBundlePromise = buildStageBundle();

test("Phaser stage survives StrictMode replay and profile replacement without stale errors", async () => {
  const mounted = await mountStage();
  try {
    await mountProfile(mounted.page, "镜像序列", "memory_sequence");
    await assertCurrentStageReady(mounted.page);

    await mountProfile(mounted.page, "星云分拣", "selective_sort");
    await assertCurrentStageReady(mounted.page);
  } finally {
    await mounted.close();
  }
});

async function mountProfile(
  page: Page,
  gameName: string,
  profile: "memory_sequence" | "selective_sort",
) {
  await page.evaluate(
    ({ nextGameName, nextProfile }) =>
      window.__phaserPoseStageHarness.mount(nextGameName, nextProfile),
    { nextGameName: gameName, nextProfile: profile },
  );
}

async function assertCurrentStageReady(page: Page) {
  await page.waitForFunction(() =>
    window.__phaserPoseStageHarness.events().includes("ready"),
  );
  await page.waitForTimeout(100);

  assert.deepEqual(
    await page.evaluate(() => window.__phaserPoseStageHarness.events()),
    ["ready"],
  );
  assert.equal(await page.locator("canvas").count(), 1);
}

async function mountStage() {
  const server = await startStageTestServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Phaser stage 测试服务器地址无效。");
    }
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.addScriptTag({ content: await stageBundlePromise });
    const mountedBrowser = browser;
    return {
      page,
      async close() {
        await mountedBrowser.close();
        await closeServer(server);
      },
    };
  } catch (error) {
    await Promise.allSettled([browser?.close(), closeServer(server)]);
    throw error;
  }
}

function startStageTestServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head>
          <style>
            :root {
              --accent-soft-strong: rgb(80, 140, 240);
              --danger-line: rgb(220, 80, 90);
              --ink-inverse: rgb(255, 255, 255);
              --warning-line: rgb(235, 175, 45);
            }
            #root { width: 960px; height: 540px; }
            #root > div, #root > div > div { width: 100%; height: 100%; }
          </style>
        </head>
        <body><div id="root"></div></body>
      </html>`);
  });
  return new Promise<Server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function buildStageBundle() {
  const requireFromTest = createRequire(import.meta.url);
  const requireFromTsx = createRequire(
    requireFromTest.resolve("tsx/package.json"),
  );
  const esbuild = requireFromTsx("esbuild") as {
    build: (options: Record<string, unknown>) => Promise<{
      outputFiles?: Array<{ text: string }>;
    }>;
  };
  const entrySource = `
    import React from "react";
    import { flushSync } from "react-dom";
    import { createRoot } from "react-dom/client";
    import { PhaserPoseStage } from "./src/components/training/PhaserPoseStage.tsx";

    const root = createRoot(document.getElementById("root"));
    let events = [];

    window.__phaserPoseStageHarness = {
      events() {
        return [...events];
      },
      mount(gameName, profile) {
        events = [];
        flushSync(() => {
          root.render(
            <React.StrictMode>
              <PhaserPoseStage
                gameName={gameName}
                onError={() => events.push("error")}
                onReady={() => events.push("ready")}
                phase="idle"
                profile={profile}
              />
            </React.StrictMode>,
          );
        });
      },
    };
  `;
  const result = await esbuild.build({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    format: "iife",
    logLevel: "silent",
    platform: "browser",
    stdin: {
      contents: entrySource,
      loader: "tsx",
      resolveDir: webRoot,
      sourcefile: "PhaserPoseStage.browser-test.tsx",
    },
    target: "chrome120",
    tsconfig: path.join(webRoot, "tsconfig.json"),
    write: false,
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("未生成 Phaser stage 浏览器测试包。");
  return output;
}

declare global {
  interface Window {
    __phaserPoseStageHarness: {
      events: () => string[];
      mount: (
        gameName: string,
        profile: "memory_sequence" | "selective_sort",
      ) => void;
    };
  }
}
