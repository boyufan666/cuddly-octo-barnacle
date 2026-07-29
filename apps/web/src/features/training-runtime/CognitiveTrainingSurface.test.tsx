import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CognitiveAnswerChoices } from "./CognitiveTrainingSurface.tsx";

const testFilePath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(testFilePath), "../../..");
const surfaceBundlePromise = buildSurfaceBundle();
const startedAtMs = Date.parse("2026-07-13T09:00:00.000Z");

test("cognitive answer choices render keyboard buttons and live progress", () => {
  const markup = renderToStaticMarkup(
    <CognitiveAnswerChoices
      answers={["蓝"]}
      onChoose={() => undefined}
      optionContainerRefs={{ current: [] }}
      options={["蓝", "绿", "黄"]}
      progressRef={createRef<HTMLSpanElement>()}
      sequenceLength={2}
    />,
  );

  assert.equal((markup.match(/<button/g) ?? []).length, 3);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>.*蓝/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /1\/2/);
});

test("an answer at the prescribed deadline cannot complete a round", async () => {
  const mounted = await mountSurface();
  try {
    const sequence = await readMemorizeSequence(mounted.page);
    await mounted.page.clock.fastForward(2_600);
    await assertAnswerPhase(mounted.page);

    for (const answer of sequence.slice(0, -1)) {
      await mounted.page
        .getByRole("button", { exact: true, name: answer })
        .click();
    }
    assert.match(await readAnswerProgress(mounted.page), /^3\/4$/);

    const surfaceStartedAtMs = await mounted.page.evaluate(() =>
      window.__cognitiveSurfaceHarness.mountedAt(),
    );
    await clickAnswerAtTime(
      mounted.page,
      sequence.at(-1)!,
      surfaceStartedAtMs + 60_000,
    );

    assert.match(await readFeedback(mounted.page), /尚未完成有效轮次/);
    assert.equal(await readSubmissionCount(mounted.page), 0);
    assert.match(await mounted.page.locator("body").innerText(), /已完成 0 轮/);
    assert.match(
      await mounted.page.locator("body").innerText(),
      /难度调整 0 次/,
    );
  } finally {
    await mounted.close();
  }
});

test("non-empty difficulty events use the current game run prefix", async () => {
  const mounted = await mountSurface();
  try {
    await completeRound(mounted.page, {
      completedAtMs: startedAtMs + 2_600,
      presentationMs: 2_600,
      sequenceLength: 4,
    });
    await mounted.page.clock.fastForward(1_000);
    await completeRound(mounted.page, {
      completedAtMs: startedAtMs + 6_000,
      presentationMs: 2_000,
      sequenceLength: 5,
    });

    await mounted.page.clock.setFixedTime(new Date(startedAtMs + 60_000));
    await mounted.page.clock.fastForward(250);
    await mounted.page.evaluate(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(
      await readFeedback(mounted.page),
      "本次训练已完成，请确认保存。",
    );

    const payload = await mounted.page.evaluate(() =>
      window.__cognitiveSurfaceHarness.latestSubmission(),
    );
    const evidence = payload.metricsSummary.dynamicDifficultyEvidence;
    assert.equal(evidence.events.length, 1);
    for (const event of evidence.events) {
      assert.match(event.runtimeFrameId, /^run-training-session-id:/);
      assert.match(event.runtimeWindowId, /^run-training-session-id:/);
    }
  } finally {
    await mounted.close();
  }
});

test("cognitive metric windows start at the canonical clientStartedAt", async () => {
  const clientStartedAt = new Date(startedAtMs - 1_000).toISOString();
  const mounted = await mountSurface({ clientStartedAt });
  try {
    await completeOneRoundAndExpire(mounted.page);
    const payload = await mounted.page.evaluate(() =>
      window.__cognitiveSurfaceHarness.latestSubmission(),
    );
    assert.ok(payload.motionMetrics.length > 0);
    assert.ok(
      payload.motionMetrics.every(
        (metric) => metric.windowStartedAt === clientStartedAt,
      ),
    );
  } finally {
    await mounted.close();
  }
});

test("Strict Mode effect replay keeps the first completed result submission active", async () => {
  const mounted = await mountSurface({ strictMode: true });
  try {
    await completeOneRoundAndExpire(mounted.page);
    assert.equal(await readSubmissionCount(mounted.page), 1);
    assert.equal(
      await readFeedback(mounted.page),
      "本次训练已完成，请确认保存。",
    );
    assert.equal(
      await mounted.page
        .getByRole("button", { name: "重新提交训练结果" })
        .count(),
      0,
    );
  } finally {
    await mounted.close();
  }
});

test("session replacement and unmount ignore stale async submissions", async () => {
  const mounted = await mountSurface({
    sessionId: "session-a",
    submissionMode: "pending",
  });
  try {
    await completeOneRoundAndExpire(mounted.page);
    assert.equal(await readFeedback(mounted.page), "正在提交本次训练结果。");

    await mounted.page.evaluate(() => {
      window.__cognitiveSurfaceHarness.mount({
        clientStartedAt: new Date(Date.now()).toISOString(),
        sessionId: "session-b",
        submissionMode: "pending",
      });
    });
    assert.equal(await readFeedback(mounted.page), "请记住当前顺序。");
    assert.equal(
      await readMemorizeSequence(mounted.page).then((items) => items.length),
      4,
    );

    await settleSubmission(mounted.page, "resolve");
    assert.equal(await readFeedback(mounted.page), "请记住当前顺序。");

    await completeOneRoundAndExpire(mounted.page);
    assert.equal(await readSubmissionCount(mounted.page), 2);
    assert.equal(await readFeedback(mounted.page), "正在提交本次训练结果。");
    await mounted.page.evaluate(() => {
      window.__cognitiveSurfaceHarness.unmount();
    });
    await settleSubmission(mounted.page, "resolve");
    assert.equal(await mounted.page.locator("#root").innerHTML(), "");
  } finally {
    await mounted.close();
  }
});

test("failed submission exposes one manual retry and submitting hides it", async () => {
  const mounted = await mountSurface({ submissionMode: "pending" });
  try {
    await completeOneRoundAndExpire(mounted.page);
    assert.equal(await readFeedback(mounted.page), "正在提交本次训练结果。");
    assert.equal(
      await mounted.page
        .getByRole("button", { name: "重新提交训练结果" })
        .count(),
      0,
    );

    await settleSubmission(mounted.page, "reject", "提交失败测试");
    assert.equal(await readFeedback(mounted.page), "提交失败测试");
    const retryButton = mounted.page.getByRole("button", {
      name: "重新提交训练结果",
    });
    assert.equal(await retryButton.count(), 1);
    assert.equal(await activeElementText(mounted.page), "提交失败测试");

    await retryButton.click();
    assert.equal(await readSubmissionCount(mounted.page), 2);
    assert.equal(await readFeedback(mounted.page), "正在提交本次训练结果。");
    assert.equal(await retryButton.count(), 0);

    await settleSubmission(mounted.page, "resolve");
    assert.equal(
      await readFeedback(mounted.page),
      "本次训练已完成，请确认保存。",
    );
  } finally {
    await mounted.close();
  }
});

test("mounted answer and feedback states manage live regions and focus", async () => {
  const mounted = await mountSurface();
  try {
    const sequence = await readMemorizeSequence(mounted.page);
    await mounted.page.clock.fastForward(2_600);
    await assertAnswerPhase(mounted.page);

    const initialFocus = await activeElementState(mounted.page);
    assert.equal(initialFocus.tagName, "BUTTON");
    assert.equal(initialFocus.disabled, false);
    assert.equal(
      await mounted.page
        .locator('span[role="status"]')
        .getAttribute("aria-live"),
      "polite",
    );

    await mounted.page
      .getByRole("button", { exact: true, name: sequence[0]! })
      .click();
    assert.equal(await readAnswerProgress(mounted.page), "1/4");
    const progressedFocus = await activeElementState(mounted.page);
    assert.equal(progressedFocus.tagName, "BUTTON");
    assert.equal(progressedFocus.disabled, false);
    assert.notEqual(progressedFocus.text, sequence[0]);

    for (const answer of sequence.slice(1)) {
      await mounted.page
        .getByRole("button", { exact: true, name: answer })
        .click();
    }
    assert.match(await readFeedback(mounted.page), /本轮正确/);
    assert.match(await activeElementText(mounted.page), /本轮正确/);
    assert.equal(
      await mounted.page.locator('p[role="status"]').getAttribute("aria-live"),
      "polite",
    );
  } finally {
    await mounted.close();
  }
});

async function mountSurface(
  options: {
    clientStartedAt?: string;
    sessionId?: string;
    strictMode?: boolean;
    submissionMode?: "pending" | "resolve";
  } = {},
) {
  const server = await startSurfaceTestServer();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.clock.install({ time: new Date(startedAtMs) });
  await page.clock.setFixedTime(new Date(startedAtMs));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("认知训练 Surface 测试服务器地址无效。");
  }
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.addScriptTag({ content: await surfaceBundlePromise });
  await page.evaluate(
    (mountOptions) => window.__cognitiveSurfaceHarness.mount(mountOptions),
    options,
  );
  return {
    browser,
    page,
    async close() {
      await browser.close();
      await closeServer(server);
    },
  };
}

function startSurfaceTestServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      '<!doctype html><html><body><div id="root"></div></body></html>',
    );
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

async function readMemorizeSequence(page: Page, expectedLength = 4) {
  const sequence = await page
    .locator('ol[aria-label="本轮记忆序列"] li')
    .allTextContents();
  assert.equal(sequence.length, expectedLength);
  return sequence.map((value) => value.trim());
}

function clickAnswerAtTime(page: Page, answer: string, timestampMs: number) {
  return page.evaluate(
    ({ expectedAnswer, interactionTimestampMs }) => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === expectedAnswer,
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`找不到认知训练答案按钮：${expectedAnswer}`);
      }
      const originalDateNow = Date.now;
      Date.now = () => interactionTimestampMs;
      try {
        button.click();
      } finally {
        Date.now = originalDateNow;
      }
    },
    { expectedAnswer: answer, interactionTimestampMs: timestampMs },
  );
}

async function completeRound(
  page: Page,
  options: {
    completedAtMs: number;
    presentationMs: number;
    sequenceLength: number;
  },
) {
  const sequence = await readMemorizeSequence(page, options.sequenceLength);
  await page.clock.fastForward(options.presentationMs);
  await assertAnswerPhase(page);
  await page.clock.setFixedTime(new Date(options.completedAtMs));
  for (const answer of sequence) {
    await page.getByRole("button", { exact: true, name: answer }).click();
  }
  assert.match(await readFeedback(page), /本轮正确/);
}

async function completeOneRoundAndExpire(page: Page) {
  const sessionStartedAtMs = await page.evaluate(() =>
    window.__cognitiveSurfaceHarness.mountedAt(),
  );
  await completeRound(page, {
    completedAtMs: sessionStartedAtMs + 2_600,
    presentationMs: 2_600,
    sequenceLength: 4,
  });
  await page.clock.setFixedTime(new Date(sessionStartedAtMs + 60_000));
  await page.clock.fastForward(250);
  await flushBrowserMicrotasks(page);
}

async function assertAnswerPhase(page: Page) {
  assert.equal(
    await page.locator("#cognitive-answer-heading").textContent(),
    "选择第 1 个位置",
  );
}

async function readAnswerProgress(page: Page) {
  return (
    (await page.locator('span[role="status"]').textContent()) ?? ""
  ).trim();
}

async function readFeedback(page: Page) {
  return ((await page.locator('p[role="status"]').textContent()) ?? "").trim();
}

function readSubmissionCount(page: Page) {
  return page.evaluate(() =>
    window.__cognitiveSurfaceHarness.submissionCount(),
  );
}

function activeElementText(page: Page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}

function activeElementState(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    return {
      disabled:
        element instanceof HTMLButtonElement ? element.disabled : undefined,
      tagName: element?.tagName ?? "",
      text: element?.textContent?.trim() ?? "",
    };
  });
}

async function settleSubmission(
  page: Page,
  outcome: "reject" | "resolve",
  message?: string,
) {
  await page.evaluate(
    ({ rejectionMessage, submissionOutcome }) => {
      const harness = window.__cognitiveSurfaceHarness;
      if (submissionOutcome === "reject") {
        harness.rejectSubmission(rejectionMessage ?? "提交失败");
      } else {
        harness.resolveSubmission();
      }
    },
    { rejectionMessage: message, submissionOutcome: outcome },
  );
  await flushBrowserMicrotasks(page);
}

function flushBrowserMicrotasks(page: Page) {
  return page.evaluate(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(undefined);
    });
  });
}

type SurfaceHarness = {
  latestSubmission: () => SubmittedPayload;
  mount: (options: {
    clientStartedAt?: string;
    sessionId?: string;
    strictMode?: boolean;
    submissionMode?: "pending" | "resolve";
  }) => void;
  mountedAt: () => number;
  rejectSubmission: (message: string) => void;
  resolveSubmission: () => void;
  submissionCount: () => number;
  unmount: () => void;
};

declare global {
  interface Window {
    __cognitiveSurfaceHarness: SurfaceHarness;
  }
}

type SubmittedPayload = {
  motionMetrics: Array<{ windowStartedAt: string }>;
  metricsSummary: {
    dynamicDifficultyEvidence: {
      events: Array<{
        runtimeFrameId: string;
        runtimeWindowId: string;
      }>;
    };
  };
};

async function buildSurfaceBundle() {
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
    import { CognitiveTrainingSurface } from "./src/features/training-runtime/CognitiveTrainingSurface.tsx";

    const game = {
      id: "game-content-id",
      code: "memory_path",
      name: "记忆路径",
      trainingTargets: ["思维训练", "memory", "sequence", "executive"],
      tags: ["近记忆", "序列回忆"],
      defaultDuration: 1,
      defaultDifficulty: "三步路径",
      runtimeType: "cognitive_web",
      manifestUrl: null,
      buildBaseUrl: null,
      gameVersion: "1.0.0",
      bridgeProtocolVersion: "1.0.0",
      buildStatus: "released",
      releaseChannel: "production",
      supportsCamera: false,
      supportsMicrophone: false,
      supportedInputModes: ["touch", "keyboard"],
      requiredMetrics: [],
      status: "active",
    };
    const root = createRoot(document.getElementById("root"));
    const submissions = [];
    const pendingSubmissions = [];
    let mountedAt = 0;
    let submissionMode = "resolve";

    function trainingSession(id, clientStartedAt) {
      return {
        id,
        patientId: "patient-profile-id",
        rehabPlanId: "rehab-plan-id",
        planItemId: "plan-item-id",
        gameContentId: "game-content-id",
        collectionBatchId: "collection-batch-real-001",
        gameRunId: "run-" + id,
        clientStartedAt,
        calibrationStatus: "checked",
        runtimeConfigSnapshot: {
          approvedPlanItemId: "plan-item-id",
          assessmentSourceId: "assessment-approved-001",
          startingLevelSource: "clinician_approved_plan",
          startingDifficultyLevel: 2,
        },
        uploadAttemptCount: 0,
        sessionStatus: "in_progress",
        startedAt: "2026-07-13T09:00:00.000Z",
        syncStatus: "pending",
      };
    }

    window.__cognitiveSurfaceHarness = {
      latestSubmission() {
        return submissions.at(-1);
      },
      mount({ clientStartedAt = "2026-07-13T09:00:00.000Z", sessionId = "training-session-id", strictMode = false, submissionMode: nextMode = "resolve" } = {}) {
        mountedAt = Date.now();
        submissionMode = nextMode;
        flushSync(() => {
          const surface = (
            <CognitiveTrainingSurface
              durationMinutes={1}
              game={game}
              key={sessionId}
              onResultReady={(payload) => {
                submissions.push(payload);
                if (submissionMode === "pending") {
                  return new Promise((resolve, reject) => {
                    pendingSubmissions.push({ reject, resolve });
                  });
                }
              }}
              trainingSession={trainingSession(sessionId, clientStartedAt)}
            />
          );
          root.render(
            strictMode ? <React.StrictMode>{surface}</React.StrictMode> : surface,
          );
        });
      },
      mountedAt() {
        return mountedAt;
      },
      rejectSubmission(message) {
        const pending = pendingSubmissions.shift();
        if (!pending) throw new Error("没有待拒绝的认知训练提交。");
        pending.reject(new Error(message));
      },
      resolveSubmission() {
        const pending = pendingSubmissions.shift();
        if (!pending) throw new Error("没有待完成的认知训练提交。");
        pending.resolve();
      },
      submissionCount() {
        return submissions.length;
      },
      unmount() {
        flushSync(() => root.unmount());
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
      sourcefile: "CognitiveTrainingSurface.browser-test.tsx",
    },
    target: "chrome120",
    tsconfig: path.join(webRoot, "tsconfig.json"),
    write: false,
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("未生成认知训练 Surface 浏览器测试包。");
  return output;
}
