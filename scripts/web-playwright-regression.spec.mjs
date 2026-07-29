import { expect, request as playwrightRequest, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlaywrightRegressionEnvironment } from "./playwright-regression-environment.mjs";

const playwrightApiPort = requirePlaywrightPort("PLAYWRIGHT_API_PORT");
const playwrightWebPort = requirePlaywrightPort("PLAYWRIGHT_WEB_PORT");
const playwrightAccountPassword =
  resolvePlaywrightRegressionEnvironment().accountPassword;
const apiBaseUrl = `http://127.0.0.1:${playwrightApiPort}`;
const webBaseUrl = `http://127.0.0.1:${playwrightWebPort}`;

test.use({ baseURL: webBaseUrl });

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = resolve(rootDir, "output/playwright");

const patientScreenChecks = [
  {
    nav: "今日",
    headings: ["今日训练"],
    texts: ["今日主任务", "选择训练", "今日训练"],
  },
  {
    nav: "训练",
    headings: ["训练前检查"],
    texts: ["请选择训练项目", "训练安排", "动作识别"],
  },
  {
    nav: "记录",
    headings: ["我的训练进展", "训练记录"],
    texts: [
      "本次训练已完成",
      "训练时长",
      "返回今日训练",
      "查看记录",
      "暂无训练结果",
    ],
  },
  {
    nav: "我的",
    headings: ["我的资料与授权", "等待患者建档数据"],
    primaryActionRequired: false,
    texts: ["隐私授权", "家属授权绑定", "等待患者建档数据"],
  },
];

const doctorScreenChecks = [
  {
    nav: "患者",
    headings: ["患者", "负责患者工作清单"],
    texts: ["新建患者档案与登录账号", "训练结果复核", "负责患者"],
  },
  {
    nav: "评估",
    headings: ["评估", "医生结构化评估确认"],
    texts: ["MMSE", "CDR", "AI 和语音材料只作为辅助建议"],
  },
  {
    nav: "计划",
    headings: ["计划", "医师康复计划确认"],
    texts: ["计划摘要", "调整原因", "确认计划"],
  },
  {
    nav: "准备",
    headings: ["准备", "创建训练准备记录"],
    texts: ["创建训练准备记录", "当前方案训练项目", "创建训练准备记录"],
  },
  {
    nav: "复核",
    headings: ["复核", "待复核训练结果"],
    texts: ["训练复核", "复核结论", "训练结果"],
  },
];

const caregiverScreenChecks = [
  {
    nav: "照护",
    anchor: "family-overview",
    headings: ["今日照护", "授权患者"],
    texts: ["照护对象", "今日安排", "近期训练"],
  },
  {
    nav: "进展",
    anchor: "family-progress",
    headings: ["训练进展"],
    texts: ["完成次数", "最近一次", "今日安排"],
  },
  {
    nav: "提醒",
    anchor: "family-alerts",
    headings: ["医生注意事项", "医生发布给家属的注意事项"],
    texts: ["医生发布给家属的提醒", "家庭观察"],
  },
  {
    nav: "我的",
    anchor: "family-profile",
    headings: ["授权范围"],
    texts: ["照护对象", "可查看医生确认后的训练进展"],
  },
];

const adminScreenChecks = [
  {
    nav: "账号",
    headings: ["账号治理", "待审核账号申请"],
    texts: ["账号开通审核", "新建待授权家属账号"],
  },
  {
    nav: "内容",
    headings: ["内容治理", "训练内容管理"],
    texts: ["训练内容管理", "资源配置与上下架"],
  },
  {
    nav: "配置",
    headings: ["配置治理", "基础运营配置"],
    texts: ["采集条件", "采集条件与协议配置"],
  },
  {
    nav: "审计",
    headings: ["安全审计", "导出申请"],
    texts: ["脱敏数据导出", "审计日志筛选", "查询审计日志"],
  },
];

const patientCareTechnicalCopyPattern =
  /engine:|license:|sensing:|MediaPipe|Phaser|manifest|bridge|\bruntime\b|runtimeType|motionMetrics|rawPayloadHash|collectionBatchId|audit ID|raw evidence|raw payload|provider payload|资源清单|证据链|审计|导出治理|模型信息|供应商|Endpoint|Provider|fallback|mock|demo|技术验收/i;

test("login submits the visible credential fields even when filled immediately", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const loginPanel = page.getByTestId("auth-login-panel");
  const accountInput = loginPanel.getByLabel("账号", { exact: true });
  const passwordInput = loginPanel.getByLabel("密码", { exact: true });
  const loginButton = loginPanel.getByRole("button", { name: "进入工作台" });
  await expect(accountInput).toBeEnabled();
  await expect(passwordInput).toBeEnabled();
  await expect(loginButton).toBeEnabled();
  await accountInput.fill("admin");
  await passwordInput.fill(playwrightAccountPassword);
  await expect(accountInput).toHaveValue("admin");
  await expect(passwordInput).toHaveValue(playwrightAccountPassword);

  const loginRequestPromise = page.waitForRequest("**/auth/login");
  await loginButton.click();
  const loginRequest = await loginRequestPromise;

  expect(JSON.parse(loginRequest.postData() ?? "{}")).toEqual({
    account: "admin",
    password: playwrightAccountPassword,
  });
});

test("account request submits the visible review form to the registration API", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const requestPanel = page.getByTestId("auth-account-request");
  await expect(
    requestPanel.getByRole("heading", { name: "没有账号？先提交申请开通" }),
  ).toBeVisible();
  const requestAccount = registrationAccountForProject(testInfo.project.name);
  expect(requestAccount).toMatch(/^[A-Za-z0-9_.-]{4,32}$/);

  await requestPanel.getByLabel("申请身份").selectOption("patient");
  const displayNameInput = requestPanel.getByLabel("姓名");
  const accountInput = requestPanel.getByLabel("登录账号");
  const passwordInput = requestPanel.getByLabel("初始密码");
  const mobileInput = requestPanel.getByLabel("手机号");
  const ageInput = requestPanel.getByLabel("年龄");
  const genderInput = requestPanel.getByLabel("性别");
  const caregiverNameInput = requestPanel.getByLabel("紧急联系人");
  const caregiverPhoneInput = requestPanel.getByLabel("紧急联系电话");
  const healthSummaryInput = requestPanel.getByLabel("补充说明");

  await displayNameInput.fill("回归测试患者");
  await accountInput.fill(requestAccount);
  const { caregiverPhone, mobilePhone } = registrationPhonesForProject(
    testInfo.project.name,
  );
  await passwordInput.fill(playwrightAccountPassword);
  await mobileInput.fill(mobilePhone);
  await ageInput.fill("72");
  await genderInput.selectOption("female");
  await caregiverNameInput.fill("回归测试家属");
  await caregiverPhoneInput.fill(caregiverPhone);
  await healthSummaryInput.fill("用于验证账号申请审核链路。");

  await expect(displayNameInput).toHaveValue("回归测试患者");
  await expect(accountInput).toHaveValue(requestAccount);
  await expect(passwordInput).toHaveValue(playwrightAccountPassword);
  await expect(mobileInput).toHaveValue(mobilePhone);
  await expect(ageInput).toHaveValue("72");
  await expect(genderInput).toHaveValue("female");
  await expect(caregiverNameInput).toHaveValue("回归测试家属");
  await expect(caregiverPhoneInput).toHaveValue(caregiverPhone);
  await expect(healthSummaryInput).toHaveValue("用于验证账号申请审核链路。");

  const registrationResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/auth/registration-requests"),
  );
  const submitButton = requestPanel.getByRole("button", { name: "提交审核" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  const response = await registrationResponse;
  expect(response.status(), "registration request must be persisted").toBe(201);
  const payload = JSON.parse(response.request().postData() ?? "{}");
  const createdRequest = await response.json();

  expect(payload).toMatchObject({
    account: requestAccount,
    displayName: "回归测试患者",
    initialPassword: playwrightAccountPassword,
    mobilePhone,
    profile: {
      age: 72,
      caregiverName: "回归测试家属",
      caregiverPhone,
      gender: "female",
      healthSummary: "用于验证账号申请审核链路。",
    },
    requestedRole: "patient",
  });
  expect(createdRequest).toMatchObject({
    account: requestAccount,
    mobilePhone,
    requestedRole: "patient",
    reviewStatus: "pending",
  });
  expect(JSON.stringify(payload)).not.toMatch(/fallback|mock|demo/i);
});

test("front-end shell keeps all formal delivery entry points navigable", async ({
  page,
}, testInfo) => {
  await mkdir(screenshotDir, { recursive: true });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page
      .getByTestId("auth-login-panel")
      .getByRole("heading", { name: "机构账号登录" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("auth-login-panel")
      .getByRole("button", { name: "进入工作台" }),
  ).toBeVisible();
  await expect(
    page.getByText("请使用机构分配的账号登录").first(),
  ).toBeVisible();
  const requestPanel = page.getByTestId("auth-account-request");
  await expect(
    requestPanel.getByRole("heading", { name: "没有账号？先提交申请开通" }),
  ).toBeVisible();
  await expect(
    requestPanel.getByRole("button", { name: "提交审核" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /manifest|Provider|Endpoint|\bruntime\b|fallback|mock|demo|技术验收/i,
    ),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectScreenGridDoesNotOverlap(page);
  await expectNoVisibleTextClippingAtScrollPositions(page, "login entry");
  await captureVisualEvidence(page, testInfo, "login-entry");

  await login(page, "patient001", playwrightAccountPassword, "patient");
  await expect(page.getByText("今日训练").first()).toBeVisible();
  await expect(page.getByTestId("patient-task-nav")).toBeVisible();
  await expect(page.getByTestId("patient-next-action")).toBeVisible();
  await expect(page.getByTestId("role-sidebar")).toHaveCount(0);
  await expect(page.getByTestId("app-nav")).toHaveCount(0);
  await expect(
    page.getByTestId("patient-task-nav").getByRole("button", { name: "记录" }),
  ).toBeVisible();
  for (const screen of patientScreenChecks) {
    await clickPatientTaskNav(page, screen.nav, screen.anchor);

    await expectAnyHeading(page, screen.headings);
    await expectAnyScreenText(page, screen.texts);
    if (screen.anchor) {
      await expectAnchorInViewport(page, screen.anchor);
    }
    await expectNoHorizontalOverflowAtScrollPositions(page);
    await expectScreenGridDoesNotOverlap(page);
    await expectTrainingCaptureDoesNotOverlap(page);
    await expectPatientTaskContentClearOfNavAtScrollPositions(page);
    if (screen.primaryActionRequired === false) {
      await expectPatientPrimaryActionClearOfNavAtScrollPositions(page, {
        required: false,
        label: `patient ${screen.nav}`,
      });
    } else {
      await expectPatientPrimaryActionClearOfNavAtScrollPositions(page, {
        required: true,
        label: `patient ${screen.nav}`,
      });
    }
    await expectNoVisibleTextClippingAtScrollPositions(
      page,
      `patient ${screen.nav}`,
    );
    await captureVisualEvidence(page, testInfo, `patient-${screen.nav}`);
  }
  await expectPatientTaskTabOrder(page);
  await expectPatientPagesHideTechnicalCopy(
    page,
    patientScreenChecks.map((screen) => screen.nav),
  );

  await logout(page);
  await login(page, "doctor001", playwrightAccountPassword, "workbench");
  await expect(
    page.getByRole("heading", { name: "患者", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "患者" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "评估" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "计划" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "准备" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "复核" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("app-nav")
      .getByRole("button", { name: /患者队列|评估复核|计划管理|训练复核/ }),
  ).toHaveCount(0);
  for (const screen of doctorScreenChecks) {
    await clickWorkbenchNav(page, screen.nav);

    await expectAnyHeading(page, screen.headings);
    await expectAnyScreenText(page, screen.texts);
    await expectNoHorizontalOverflowAtScrollPositions(page);
    await expectScreenGridDoesNotOverlap(page);
    await expectTrainingCaptureDoesNotOverlap(page);
    await expectNoVisibleTextClippingAtScrollPositions(
      page,
      `doctor ${screen.nav}`,
    );
    await expectNoTechnicalCopyInMainContent(page, `doctor ${screen.nav}`);
    await captureVisualEvidence(page, testInfo, `doctor-${screen.nav}`);
  }
  await verifyManualAiAssessmentDraftFlow(page);
  await verifyAd8AssessmentEntry(page);

  await logout(page);
  await login(page, "caregiver001", playwrightAccountPassword, "patient");
  await selectOnlyAuthorizedCaregiverPatient(page);
  await clickPatientTaskNav(page, "照护", "family-overview");
  await expect(
    page.getByRole("heading", { name: "今日照护" }).first(),
  ).toBeVisible();
  await expect(page.getByText("照护").first()).toBeVisible();
  await expect(page.getByTestId("role-sidebar")).toHaveCount(0);
  await expect(page.getByTestId("app-nav")).toHaveCount(0);
  for (const screen of caregiverScreenChecks) {
    await clickPatientTaskNav(page, screen.nav, screen.anchor);

    await expectAnyHeading(page, screen.headings);
    await expectAnyScreenText(page, screen.texts);
    await expectNoHorizontalOverflowAtScrollPositions(page);
    await expectScreenGridDoesNotOverlap(page);
    await expectTrainingCaptureDoesNotOverlap(page);
    await expectPatientTaskContentClearOfNavAtScrollPositions(page);
    await expectPatientPrimaryActionClearOfNavAtScrollPositions(page, {
      required: false,
      label: `caregiver ${screen.nav}`,
    });
    await expectNoVisibleTextClippingAtScrollPositions(
      page,
      `caregiver ${screen.nav}`,
    );
    await captureVisualEvidence(page, testInfo, `caregiver-${screen.nav}`);
  }
  await expectPatientPagesHideTechnicalCopy(
    page,
    caregiverScreenChecks.map((screen) => screen.nav),
  );
  await expect(
    page.getByRole("heading", { name: "训练结果与历史记录" }),
  ).toHaveCount(0);

  await logout(page);
  await login(page, "admin", playwrightAccountPassword, "workbench");
  await expect(
    page.getByRole("heading", { name: "账号治理" }).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "账号" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "内容" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "配置" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("app-nav").getByRole("button", { name: "审计" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("app-nav")
      .getByRole("button", { name: /账号治理|内容治理|配置治理|安全审计/ }),
  ).toHaveCount(0);
  for (const screen of adminScreenChecks) {
    await clickWorkbenchNav(page, screen.nav);

    await expectAnyHeading(page, screen.headings);
    await expectAnyScreenText(page, screen.texts);
    await expectNoHorizontalOverflowAtScrollPositions(page);
    await expectScreenGridDoesNotOverlap(page);
    await expectTrainingCaptureDoesNotOverlap(page);
    await expectNoVisibleTextClippingAtScrollPositions(
      page,
      `admin ${screen.nav}`,
    );
    await captureVisualEvidence(page, testInfo, `admin-${screen.nav}`);
  }
});

test("desensitized CSV export blocks missing reason and downloads with an audit reason", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await login(page, "admin", playwrightAccountPassword, "workbench");
  await clickWorkbenchNav(page, "审计");

  await expect(page.getByText("脱敏数据导出").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "导出申请" })).toBeVisible();

  const exportForm = page.getByTestId("desensitized-export-form");
  const exportButton = exportForm.getByRole("button", { name: "生成脱敏 CSV" });
  await expect(exportButton).toBeDisabled();

  let exportRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/admin/exports/")) exportRequests += 1;
  });

  await expect(
    page.getByText("导出前必须填写用途说明。").first(),
  ).toBeVisible();
  await expect(exportForm.getByText("正在生成导出")).toHaveCount(0);
  await expect(page.getByText("正在生成导出")).toHaveCount(0);
  expect(exportRequests).toBe(0);

  await exportForm.getByLabel("导出原因（必填）").fill("交付回归验证脱敏导出");
  await expect(exportButton).toBeEnabled();
  const exportRequestPromise = page.waitForRequest("**/admin/exports/patients");
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const [exportRequest, download] = await Promise.all([
    exportRequestPromise,
    downloadPromise,
  ]);

  const payload = JSON.parse(exportRequest.postData() ?? "{}");
  expect(payload).toMatchObject({
    format: "csv",
    reason: "交付回归验证脱敏导出",
  });
  expect(download.suggestedFilename()).toMatch(
    /^rehab-patients-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await expect(
    page
      .getByText(/脱敏导出文件 rehab-patients-\d{4}-\d{2}-\d{2}\.csv 已生成/)
      .first(),
  ).toBeVisible();
});

test("training capture layout check fails when no runtime layout is mounted", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    expectTrainingCaptureDoesNotOverlap(page, { requireLayout: true }),
  ).rejects.toThrow(/Expected at least one training capture layout/);
});

test("patient can start formal cognitive training and renders the real training capture shell", async ({
  page,
}) => {
  const preparedTraining = await prepareFormalCognitiveTraining();

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await login(page, "patient001", playwrightAccountPassword, "patient");
  await clickPatientTaskNav(page, "今日");

  await expect(
    page.getByRole("heading", { name: preparedTraining.gameName }),
  ).toBeVisible();
  const todayCta = page.getByTestId("patient-next-action");
  await expect(todayCta).toHaveText("开始训练准备");
  await expect(todayCta).toBeEnabled();
  await todayCta.click();

  await expect(page.getByRole("heading", { name: "训练前检查" })).toBeVisible();
  await expect(page.getByText("本次训练不需要摄像头检查。")).toBeVisible();
  await expect(page.getByText("本次训练不需要站位检查。")).toBeVisible();

  const startButton = page.getByTestId("patient-prep-start-cta");
  await expect(startButton).toBeEnabled();
  const trainingSessionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/training-sessions"),
  );
  await startButton.click();
  const response = await trainingSessionResponse;
  expect(response.status(), "training session must be persisted").toBe(201);
  const requestPayload = JSON.parse(response.request().postData() ?? "{}");
  const trainingSession = await response.json();

  expect(requestPayload.collectionBatchId).toEqual(expect.any(String));
  expect(requestPayload.rehabPlanId).toEqual(expect.any(String));
  expect(requestPayload.planItemId).toEqual(expect.any(String));
  expect(requestPayload.gameContentId).toEqual(expect.any(String));
  expect(JSON.stringify(requestPayload)).not.toMatch(/fallback|mock|demo/i);
  expect(trainingSession).toMatchObject({
    collectionBatchId: requestPayload.collectionBatchId,
    gameContentId: requestPayload.gameContentId,
    id: expect.any(String),
    patientId: expect.any(String),
    planItemId: requestPayload.planItemId,
    rehabPlanId: requestPayload.rehabPlanId,
    sessionStatus: "in_progress",
  });

  try {
    await expect(page.locator(".training-capture-main")).toHaveCount(1);
    await expect(
      page.locator(".training-capture-main .training-stage-shell").first(),
    ).toBeVisible();
    await expect(page.locator(".patient-camera-sidecar")).toHaveCount(0);
    await expect(page.getByText("跟随提示完成训练").first()).toBeVisible();
    await expect(
      page.getByTestId("patient-training-primary-action"),
    ).toBeVisible();
    await expectTrainingCaptureDoesNotOverlap(page, { requireLayout: true });
    await expectNoVisibleTextClippingAtScrollPositions(
      page,
      "patient cognitive training runtime",
    );
  } finally {
    await abortFormalCognitiveTraining(trainingSession.id);
  }
});

async function login(page, account, password, navigation = "workbench") {
  const loginPanel = page.getByTestId("auth-login-panel");
  await loginPanel.getByLabel("账号", { exact: true }).fill(account);
  await loginPanel.getByLabel("密码", { exact: true }).fill(password);
  await loginPanel.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  if (navigation === "patient") {
    await expect(page.getByTestId("patient-task-nav").first()).toBeVisible();
    return;
  }
  await expectVisibleWorkbenchNav(page);
}

async function expectDesktopOnlyShellText(page, text) {
  const viewport = page.viewportSize();
  const width =
    viewport?.width ?? (await page.evaluate(() => window.innerWidth));
  if (width >= 1280) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
}

async function expectVisibleWorkbenchNav(page) {
  await expect(visibleWorkbenchNav(page)).toBeVisible();
  await expectWorkbenchNavigationFullyVisible(page);
}

async function clickWorkbenchNav(page, name) {
  const nav = visibleWorkbenchNav(page);
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name }).click();
}

async function clickPatientTaskNav(page, name, anchor) {
  const nav = page.getByTestId("patient-task-nav");
  await expect(nav).toBeVisible();
  const button = nav.getByRole("button", { name });
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "page");
  if (anchor) {
    await expectAnchorInViewport(page, anchor);
  }
}

async function selectOnlyAuthorizedCaregiverPatient(page) {
  const selector = page.getByLabel("选择授权患者");
  await expect(selector).toBeVisible();
  const authorizedOptions = selector.locator("option:not([disabled])");
  await expect(
    authorizedOptions,
    "caregiver001 must have exactly one authorized patient fixture",
  ).toHaveCount(1);
  const patientId = await authorizedOptions.first().getAttribute("value");
  expect(
    patientId,
    "authorized patient option must expose its patient id",
  ).toEqual(expect.any(String));
  expect(patientId).not.toBe("");
  await selector.selectOption(patientId);
  await expect(selector).toHaveValue(patientId);
}

function visibleWorkbenchNav(page) {
  return page.locator('[data-testid="app-nav"]:visible').first();
}

async function logout(page) {
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(
    page
      .getByTestId("auth-login-panel")
      .getByRole("heading", { name: "机构账号登录" }),
  ).toBeVisible();
}

async function captureVisualEvidence(page, testInfo, label) {
  await mkdir(screenshotDir, { recursive: true });
  await resetVisualEvidenceScroll(page);
  await page.screenshot({
    path: resolve(
      screenshotDir,
      `web-regression-${sanitizeFileSegment(label)}-${sanitizeFileSegment(testInfo.project.name)}.png`,
    ),
    fullPage: true,
  });
}

async function resetVisualEvidenceScroll(page) {
  await page.evaluate(() => {
    const appScrollRegion = document.querySelector(
      '[data-testid="app-scroll-region"]',
    );
    if (!(appScrollRegion instanceof HTMLElement)) {
      throw new Error(
        "Expected the application scroll region before screenshot capture",
      );
    }
    appScrollRegion.scrollTo(0, 0);

    const patientScrollRegion = document.querySelector(
      '[data-testid="patient-task-scroll-region"]',
    );
    if (patientScrollRegion instanceof HTMLElement) {
      patientScrollRegion.scrollTo(0, 0);
    }

    for (const navigation of document.querySelectorAll(
      '[data-testid="app-nav-items"]',
    )) {
      if (!(navigation instanceof HTMLElement)) {
        throw new Error("Expected workbench navigation to be an HTMLElement");
      }
      navigation.scrollTo(0, 0);
    }
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const appScrollRegion = document.querySelector(
          '[data-testid="app-scroll-region"]',
        );
        if (!(appScrollRegion instanceof HTMLElement)) {
          throw new Error(
            "Expected the application scroll region after screenshot reset",
          );
        }
        const patientScrollRegion = document.querySelector(
          '[data-testid="patient-task-scroll-region"]',
        );
        const navigationRegions = Array.from(
          document.querySelectorAll('[data-testid="app-nav-items"]'),
        );
        return (
          appScrollRegion.scrollTop === 0 &&
          appScrollRegion.scrollLeft === 0 &&
          (!(patientScrollRegion instanceof HTMLElement) ||
            (patientScrollRegion.scrollTop === 0 &&
              patientScrollRegion.scrollLeft === 0)) &&
          navigationRegions.every(
            (navigation) =>
              navigation instanceof HTMLElement && navigation.scrollLeft === 0,
          )
        );
      }),
    )
    .toBe(true);
}

async function expectWorkbenchNavigationFullyVisible(page) {
  const items = visibleWorkbenchNav(page).getByTestId("app-nav-items");
  await expect(items).toHaveCount(1);
  const geometry = await items.evaluate((container) => {
    if (!(container instanceof HTMLElement)) {
      throw new Error("Expected workbench navigation items container");
    }
    const containerRect = container.getBoundingClientRect();
    const buttons = Array.from(container.querySelectorAll("button"));
    return {
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      buttonCount: buttons.length,
      clippedButtons: buttons
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return (
            rect.left < containerRect.left - 1 ||
            rect.right > containerRect.right + 1
          );
        })
        .map((button) => button.textContent?.trim() ?? ""),
    };
  });

  expect(geometry.buttonCount).toBeGreaterThan(0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.clippedButtons).toEqual([]);
}

async function verifyManualAiAssessmentDraftFlow(page) {
  await clickWorkbenchNav(page, "评估");
  await expect(
    page.getByRole("heading", { name: "医生结构化评估确认" }),
  ).toBeVisible();
  await expect(
    page.getByText("AI 和语音材料只作为辅助建议").first(),
  ).toBeVisible();
  await expect(page.getByText("批准正式评估").first()).toBeVisible();
  await expect(page.getByText("Provider").first()).toHaveCount(0);
  await expect(page.getByText("Call ID").first()).toHaveCount(0);
  await expect(page.getByText("Endpoint").first()).toHaveCount(0);
}

async function verifyAd8AssessmentEntry(page) {
  await clickWorkbenchNav(page, "评估");
  await expect(page.getByText("AD-8").first()).toBeVisible();
  await expect(
    page.getByText("复核 MMSE、CDR、AD-8 分数").first(),
  ).toBeVisible();
}

async function expectPatientPagesHideTechnicalCopy(page, navLabels) {
  for (const navLabel of navLabels) {
    await clickPatientTaskNav(page, navLabel);
    await expectNoTechnicalCopyInMainContent(page, navLabel);
    await expect(page.getByLabel("MMSE（0-30）")).toHaveCount(0);
    await expect(page.getByLabel("分析置信度（0-1）")).toHaveCount(0);
    await expect(page.getByText("平均置信度").first()).toHaveCount(0);
    await expect(page.getByText("关键点数量").first()).toHaveCount(0);
    await expect(page.getByText("角色权限不足").first()).toHaveCount(0);
    await expect(page.getByText("训练会话").first()).toHaveCount(0);
    await expect(page.getByText("业务工作区").first()).toHaveCount(0);
  }
}

async function expectNoTechnicalCopyInMainContent(page, navLabel) {
  const visibleText = await page
    .locator("body")
    .evaluate((body) => body.innerText);
  expect(
    patientCareTechnicalCopyPattern.test(visibleText),
    `Expected no patient/caregiver technical copy on ${navLabel}`,
  ).toBe(false);
}

async function expectPatientPrimaryActionClearOfNavAtScrollPositions(
  page,
  { label = "current patient screen", required = false } = {},
) {
  for (const position of ["top", "middle", "bottom"]) {
    await scrollToPagePosition(page, position);
    await expectPatientPrimaryActionClearOfNav(page, {
      label,
      position,
      required,
    });
  }
}

async function expectPatientTaskContentClearOfNavAtScrollPositions(page) {
  for (const position of ["top", "middle", "bottom"]) {
    await scrollToPagePosition(page, position);
    await expectPatientTaskContentClearOfNav(page, position);
  }
}

async function expectPatientTaskContentClearOfNav(page, position = "current") {
  const nav = page.getByTestId("patient-task-nav");
  if ((await nav.count()) === 0) return;

  const overlaps = await page.evaluate(() => {
    const navElement = document.querySelector(
      '[data-testid="patient-task-nav"]',
    );
    if (!navElement) return [];
    const navRect = navElement.getBoundingClientRect();
    const contentElements = Array.from(
      document.querySelectorAll(
        [
          '[data-testid="patient-today-flow"] button',
          '[data-testid="patient-prep-flow"] button',
          '[data-testid="patient-result-flow"] button',
          '[data-testid="patient-training-primary-action"]',
          "#family-overview",
          "#family-progress",
          "#family-alerts",
          "#family-profile",
        ].join(","),
      ),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (navElement.contains(element)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    return contentElements
      .map((element) => {
        const rect = visibleRectForElement(element);
        if (!rect) {
          return {
            label: readElementLabel(element),
            overlapArea: 0,
          };
        }
        const width = Math.max(
          0,
          Math.min(rect.right, navRect.right) -
            Math.max(rect.left, navRect.left),
        );
        const height = Math.max(
          0,
          Math.min(rect.bottom, navRect.bottom) -
            Math.max(rect.top, navRect.top),
        );
        return {
          label: readElementLabel(element),
          overlapArea: width * height,
        };
      })
      .filter((item) => item.overlapArea > 8);

    function readElementLabel(element) {
      return (
        element.getAttribute("aria-label") ||
        element.getAttribute("data-testid") ||
        element.id ||
        element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
        element.tagName
      );
    }

    function visibleRectForElement(element) {
      const rect = element.getBoundingClientRect();
      let top = Math.max(rect.top, 0);
      let right = Math.min(rect.right, window.innerWidth);
      let bottom = Math.min(rect.bottom, window.innerHeight);
      let left = Math.max(rect.left, 0);

      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = window.getComputedStyle(parent);
        const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
        const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
        if (!clipsX && !clipsY) continue;

        const parentRect = parent.getBoundingClientRect();
        if (clipsX) {
          left = Math.max(left, parentRect.left);
          right = Math.min(right, parentRect.right);
        }
        if (clipsY) {
          top = Math.max(top, parentRect.top);
          bottom = Math.min(bottom, parentRect.bottom);
        }
      }

      if (right <= left || bottom <= top) return null;
      return { top, right, bottom, left };
    }
  });

  expect(
    overlaps,
    `Expected patient/caregiver content not to overlap bottom nav at ${position}`,
  ).toEqual([]);
}

async function expectPatientPrimaryActionClearOfNav(
  page,
  {
    label = "current patient screen",
    position = "current",
    required = false,
  } = {},
) {
  const nav = page.getByTestId("patient-task-nav");
  if ((await nav.count()) === 0) return;

  const result = await page.evaluate(() => {
    const navElement = document.querySelector(
      '[data-testid="patient-task-nav"]',
    );
    const actionElements = Array.from(
      document.querySelectorAll(
        [
          '[data-testid="patient-next-action"]',
          '[data-testid="patient-prep-start-cta"]',
          '[data-testid="patient-training-primary-action"] button',
          '[data-testid="patient-result-flow"] button',
        ].join(","),
      ),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (navElement?.contains(element)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    if (!navElement) {
      return {
        actionCount: actionElements.length,
        overlaps: [],
      };
    }
    const tolerance = 1;
    const navRect = navElement.getBoundingClientRect();
    const overlaps = actionElements
      .map((actionElement) => {
        const actionRect = visibleRectForElement(actionElement);
        if (!actionRect) return null;
        const overlapsNav = !(
          navRect.right <= actionRect.left + tolerance ||
          actionRect.right <= navRect.left + tolerance ||
          navRect.bottom <= actionRect.top + tolerance ||
          actionRect.bottom <= navRect.top + tolerance
        );
        return overlapsNav
          ? {
              label: readElementLabel(actionElement),
              rect: actionRect,
            }
          : null;
      })
      .filter(Boolean);

    return {
      actionCount: actionElements.length,
      overlaps,
    };

    function readElementLabel(element) {
      return (
        element.getAttribute("aria-label") ||
        element.getAttribute("data-testid") ||
        element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
        element.tagName
      );
    }

    function visibleRectForElement(element) {
      const rect = element.getBoundingClientRect();
      let top = Math.max(rect.top, 0);
      let right = Math.min(rect.right, window.innerWidth);
      let bottom = Math.min(rect.bottom, window.innerHeight);
      let left = Math.max(rect.left, 0);

      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = window.getComputedStyle(parent);
        const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
        const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
        if (!clipsX && !clipsY) continue;

        const parentRect = parent.getBoundingClientRect();
        if (clipsX) {
          left = Math.max(left, parentRect.left);
          right = Math.min(right, parentRect.right);
        }
        if (clipsY) {
          top = Math.max(top, parentRect.top);
          bottom = Math.min(bottom, parentRect.bottom);
        }
      }

      if (right <= left || bottom <= top) return null;
      return { top, right, bottom, left };
    }
  });

  if (required) {
    expect(
      result.actionCount,
      `Expected a patient primary action to be present on ${label} at ${position}`,
    ).toBeGreaterThan(0);
  }
  expect(
    result.overlaps,
    `Expected patient primary action not to overlap bottom nav on ${label} at ${position}`,
  ).toEqual([]);
}

async function expectPatientTaskTabOrder(page) {
  await clickPatientTaskNav(page, "今日");
  const todaySteps = await collectKeyboardFocusSteps(page, 40);
  const todayCtaIndex = todaySteps.findIndex(
    (step) => step.isPrepCta || /开始训练准备|进入 .* 准备/.test(step.label),
  );
  expect(
    todayCtaIndex,
    "Expected keyboard focus to reach the patient primary training CTA",
  ).toBeGreaterThanOrEqual(0);

  await clickPatientTaskNav(page, "训练");
  const prepSteps = await collectKeyboardFocusSteps(page, 50);
  const checklistIndex = prepSteps.findIndex((step) =>
    /同步训练安排|检测摄像头|站位检查/.test(step.label),
  );
  const startIndex = prepSteps.findIndex((step) => step.isPrepStartCta);
  const startButton = page.getByTestId("patient-prep-start-cta");

  expect(
    checklistIndex,
    "Expected keyboard focus to reach the prep checklist",
  ).toBeGreaterThanOrEqual(0);
  if (await startButton.isEnabled()) {
    expect(
      startIndex,
      "Expected keyboard focus to reach the start training CTA",
    ).toBeGreaterThanOrEqual(0);
    expect(
      checklistIndex,
      "Expected checklist focus before start CTA focus",
    ).toBeLessThan(startIndex);
  } else {
    await expect(startButton).toBeDisabled();
  }

  const finishIndex = prepSteps.findIndex((step) =>
    /完成本次训练/.test(step.label),
  );
  if (finishIndex >= 0 && startIndex >= 0) {
    expect(
      startIndex,
      "Expected finish CTA after start CTA when both are present",
    ).toBeLessThan(finishIndex);
  }
}

async function expectAnyHeading(page, candidates) {
  const visible = await Promise.all(
    candidates.map(async (name) => {
      try {
        await expect(page.getByRole("heading", { name }).first()).toBeVisible({
          timeout: 2_000,
        });
        return true;
      } catch {
        return false;
      }
    }),
  );

  expect(
    visible.some(Boolean),
    `Expected one of these headings to be visible: ${candidates.join(" / ")}`,
  ).toBe(true);
}

async function collectKeyboardFocusLabels(page, maxTabs) {
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  return collectKeyboardFocusLabelsFromCurrent(page, maxTabs);
}

async function collectKeyboardFocusSteps(page, maxTabs) {
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  return collectKeyboardFocusStepsFromCurrent(page, maxTabs);
}

async function collectKeyboardFocusLabelsFromCurrent(page, maxTabs) {
  const labels = [];
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    labels.push(await readActiveElementLabel(page));
  }
  return labels.filter(Boolean);
}

async function collectKeyboardFocusStepsFromCurrent(page, maxTabs) {
  const steps = [];
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    steps.push(await readActiveElementFocusStep(page));
  }
  return steps;
}

async function tabUntilActiveLabel(page, pattern, maxTabs) {
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const label = await readActiveElementLabel(page);
    if (pattern.test(label)) {
      return index;
    }
  }
  return -1;
}

async function readActiveElementLabel(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return "";
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("data-testid") ||
      element.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
  });
}

async function readActiveElementFocusStep(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      return {
        isPatientTaskNavButton: false,
        isPrepStartCta: false,
        isPrepCta: false,
        label: "",
      };
    }
    const label = (
      element.getAttribute("aria-label") ||
      element.getAttribute("data-testid") ||
      element.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    return {
      isPatientTaskNavButton: Boolean(
        element.closest('[data-testid="patient-task-nav"]'),
      ),
      isPrepStartCta:
        element.getAttribute("data-testid") === "patient-prep-start-cta",
      isPrepCta: element.getAttribute("data-testid") === "patient-next-action",
      label,
    };
  });
}

async function expectAnyScreenText(page, candidates) {
  const visible = await Promise.all(
    candidates.map(async (text) => {
      try {
        await expect(page.getByText(text).first()).toBeVisible({
          timeout: 2_000,
        });
        return true;
      } catch {
        return false;
      }
    }),
  );

  expect(
    visible.some(Boolean),
    `Expected one of these texts to be visible: ${candidates.join(" / ")}`,
  ).toBe(true);
}

async function expectAnchorInViewport(page, anchor) {
  await expect
    .poll(
      () =>
        page.evaluate((anchorId) => {
          const element = document.getElementById(anchorId);
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        }, anchor),
      {
        message: `Expected #${anchor} in viewport after navigation`,
      },
    )
    .toBe(true);
}

async function expectNoHorizontalOverflow(page) {
  const size = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  const maxScrollWidth = Math.max(
    size.bodyScrollWidth,
    size.documentScrollWidth,
  );

  expect(
    maxScrollWidth <= size.clientWidth + 1,
    `Expected no horizontal overflow, got scrollWidth=${maxScrollWidth}, clientWidth=${size.clientWidth}, innerWidth=${size.innerWidth}`,
  ).toBe(true);
}

async function expectNoHorizontalOverflowAtScrollPositions(page) {
  for (const position of ["top", "middle", "bottom"]) {
    await scrollToPagePosition(page, position);
    await expectNoHorizontalOverflow(page);
  }
}

async function expectNoVisibleTextClippingAtScrollPositions(page, label) {
  for (const position of ["top", "middle", "bottom"]) {
    await scrollToPagePosition(page, position);
    await expectNoVisibleTextClipping(page, `${label} at ${position}`);
  }
}

async function expectNoVisibleTextClipping(page, label) {
  const clipped = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "button",
          "a",
          "label",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "p",
          "li",
          "dt",
          "dd",
          "summary",
          '[role="button"]',
          '[role="tab"]',
          '[role="link"]',
          '[role="heading"]',
          '[data-testid="patient-next-action"]',
          '[data-testid="patient-prep-start-cta"]',
          '[data-testid="patient-training-primary-action"]',
        ].join(","),
      ),
    );

    return candidates
      .map((element) => inspectTextElement(element))
      .filter(Boolean)
      .slice(0, 20);

    function inspectTextElement(element) {
      if (!(element instanceof HTMLElement)) return null;
      if (element.closest("[aria-hidden='true'], [hidden]")) return null;

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const text = (element.innerText || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (
        !text ||
        rect.width <= 1 ||
        rect.height <= 1 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        return null;
      }

      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      const clipsX =
        /(hidden|clip)/.test(overflowX) || style.textOverflow === "ellipsis";
      const clipsY = /(hidden|clip)/.test(overflowY);
      const horizontallyScrollableAncestor = hasScrollableAncestor(
        element,
        "x",
      );
      const verticallyScrollableAncestor = hasScrollableAncestor(element, "y");
      const ancestorClipRect = ancestorClipRectForElement(element);
      const horizontalOverflow =
        element.scrollWidth > Math.ceil(element.clientWidth) + 3 &&
        clipsX &&
        !horizontallyScrollableAncestor;
      const verticalOverflow =
        element.scrollHeight > Math.ceil(element.clientHeight) + 4 &&
        clipsY &&
        !verticallyScrollableAncestor;
      const ancestorHorizontalClip =
        ancestorClipRect &&
        !horizontallyScrollableAncestor &&
        (rect.left < ancestorClipRect.left - 3 ||
          rect.right > ancestorClipRect.right + 3);
      const ancestorVerticalClip =
        ancestorClipRect &&
        !verticallyScrollableAncestor &&
        (rect.top < ancestorClipRect.top - 3 ||
          rect.bottom > ancestorClipRect.bottom + 3);

      if (
        !horizontalOverflow &&
        !verticalOverflow &&
        !ancestorHorizontalClip &&
        !ancestorVerticalClip
      ) {
        return null;
      }

      return {
        tagName: element.tagName.toLowerCase(),
        label:
          element.getAttribute("aria-label") ||
          element.getAttribute("data-testid") ||
          text.slice(0, 100),
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        textOverflow: style.textOverflow,
        overflowX,
        overflowY,
        ancestorClipRect,
      };
    }

    function ancestorClipRectForElement(element) {
      let clipRect = null;
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = window.getComputedStyle(parent);
        const clipsX = /(hidden|clip)/.test(style.overflowX);
        const clipsY = /(hidden|clip)/.test(style.overflowY);
        if (!clipsX && !clipsY) continue;

        const parentRect = parent.getBoundingClientRect();
        const nextClipRect = {
          bottom: clipsY ? parentRect.bottom : Number.POSITIVE_INFINITY,
          left: clipsX ? parentRect.left : Number.NEGATIVE_INFINITY,
          right: clipsX ? parentRect.right : Number.POSITIVE_INFINITY,
          top: clipsY ? parentRect.top : Number.NEGATIVE_INFINITY,
        };
        clipRect = clipRect
          ? {
              bottom: Math.min(clipRect.bottom, nextClipRect.bottom),
              left: Math.max(clipRect.left, nextClipRect.left),
              right: Math.min(clipRect.right, nextClipRect.right),
              top: Math.max(clipRect.top, nextClipRect.top),
            }
          : nextClipRect;
      }
      return clipRect;
    }

    function hasScrollableAncestor(element, axis) {
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = window.getComputedStyle(parent);
        const overflow = axis === "x" ? style.overflowX : style.overflowY;
        const scrollable = /(auto|scroll)/.test(overflow);
        if (!scrollable) continue;
        if (axis === "x" && parent.scrollWidth > parent.clientWidth + 3)
          return true;
        if (axis === "y" && parent.scrollHeight > parent.clientHeight + 3)
          return true;
      }
      return false;
    }
  });

  expect(clipped, `Expected no visible text clipping on ${label}`).toEqual([]);
}

async function scrollToPagePosition(page, position) {
  await page.evaluate((targetPosition) => {
    const patientScrollRegion = document.querySelector(
      '[data-testid="patient-task-scroll-region"]',
    );
    const appScrollRegion = document.querySelector(
      '[data-testid="app-scroll-region"]',
    );
    if (!(appScrollRegion instanceof HTMLElement)) {
      throw new Error("Expected the application scroll region");
    }
    let target = appScrollRegion;
    if (patientScrollRegion instanceof HTMLElement) {
      target = patientScrollRegion;
    }
    const maxY = Math.max(0, target.scrollHeight - target.clientHeight);
    const y =
      targetPosition === "top"
        ? 0
        : targetPosition === "middle"
          ? Math.round(maxY / 2)
          : maxY;
    target.scrollTo(0, y);
  }, position);
}

async function expectScreenGridDoesNotOverlap(page) {
  const grids = await page
    .locator('[data-testid="screen-grid"]')
    .evaluateAll((nodes) => {
      function isVisibleLayoutElement(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.closest("[hidden], [aria-hidden='true']")) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      return nodes.filter(isVisibleLayoutElement).map((node) => {
        const readRect = (selector) => {
          const element = node.querySelector(selector);
          if (!isVisibleLayoutElement(element)) return null;
          const rect = element.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          };
        };
        return {
          main: readRect('[data-testid="screen-grid-main"]'),
          aside: readRect('[data-testid="screen-grid-aside"]'),
        };
      });
    });

  for (const grid of grids) {
    if (!grid.main || !grid.aside) continue;
    expect(rectsOverlap(grid.main, grid.aside)).toBe(false);
    expect(grid.main.width > 280).toBe(true);
    expect(grid.aside.width > 280).toBe(true);
  }
}

async function expectTrainingCaptureDoesNotOverlap(page, options = {}) {
  const { requireLayout = false } = options;
  const layout = await page
    .locator(".training-capture-main")
    .evaluateAll((nodes) => {
      function isVisibleLayoutElement(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.closest("[hidden], [aria-hidden='true']")) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      return nodes.filter(isVisibleLayoutElement).map((node) => {
        const readRect = (selector) => {
          const element = node.querySelector(selector);
          if (!isVisibleLayoutElement(element)) return null;
          const rect = element.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          };
        };
        return {
          stage: readRect(".unity-stage-shell, .training-stage-shell"),
          sidecar: readRect(".unity-pose-sidecar, .patient-camera-sidecar"),
        };
      });
    });

  if (requireLayout) {
    expect(
      layout.length,
      "Expected at least one training capture layout to be mounted",
    ).toBeGreaterThan(0);
  }

  for (const item of layout) {
    if (!item.stage) {
      if (requireLayout) {
        expect(
          item.stage,
          "Expected training capture layout to include a patient stage",
        ).not.toBeNull();
      }
      continue;
    }
    expect(item.stage.width > 280).toBe(true);
    if (item.sidecar) {
      expect(rectsOverlap(item.stage, item.sidecar)).toBe(false);
      expect(item.sidecar.width > 160).toBe(true);
    }
  }
}

async function prepareFormalCognitiveTraining() {
  const roleClients = await createRoleApiClients(
    { admin: "admin", doctor: "doctor001", patient: "patient001" },
    apiUrl("/"),
  );
  try {
    const patientId = roleClients.patient.login.context.patientIds[0];
    expect(patientId, "Expected patient001 to have a patient profile").toEqual(
      expect.any(String),
    );

    const assessment = await apiPost(
      roleClients.doctor.context,
      "/assessments",
      {
        patientId,
        assessmentType: "MMSE/CDR",
        scoreSummary: {
          mmse: 16,
          cdr: 2,
          memory: 48,
          orientation: 58,
          executive: 52,
          language: 73,
        },
        rawInputSummary: {
          source: "clinician_input",
          transcript: "Playwright 认知训练回归前结构化评估。",
          analysisSummary: "MMSE 16、CDR 2，建议进行低强度记忆与执行功能训练。",
          modelVersion: "clinician-structured-input",
          confidence: 0.9,
          reactionSeconds: 2.4,
          reviewerUserId: roleClients.doctor.login.user.id,
          reviewedAt: new Date().toISOString(),
        },
      },
      201,
    );
    expect(assessment).toMatchObject({
      patientId,
      status: "completed",
    });
    const refreshedAssessments = await apiGet(
      roleClients.doctor.context,
      `/patients/${patientId}/assessments`,
      200,
    );
    const createdAssessment = refreshedAssessments.find(
      (item) => item.id === assessment.id,
    );
    expect(
      createdAssessment,
      "Expected the structured assessment to be listed for the patient",
    ).toBeTruthy();
    const pendingRisk = createdAssessment.riskGrades?.find(
      (risk) => risk.isCurrent,
    );
    expect(
      pendingRisk,
      "Expected the structured assessment to create a current risk grade",
    ).toBeTruthy();
    expect(pendingRisk.confirmedAt).toBeNull();
    expect(pendingRisk.confirmedById).toBeNull();

    const reviewedAssessment = await apiPatch(
      roleClients.doctor.context,
      `/assessments/${assessment.id}/review`,
      {
        decision: "approved",
        reviewNote: "Playwright 认知训练正式回归风险确认。",
      },
      200,
    );
    const confirmedRisk = reviewedAssessment.riskGrades?.find(
      (risk) => risk.id === pendingRisk.id,
    );
    expect(
      confirmedRisk,
      "Expected the doctor review to return the same confirmed risk grade",
    ).toBeTruthy();
    expect(confirmedRisk.confirmedAt).toEqual(expect.any(String));
    expect(confirmedRisk.confirmedById).toEqual(expect.any(String));

    const recommendedPlan = await apiPost(
      roleClients.doctor.context,
      "/rehab-plans/recommend",
      { patientId },
      201,
    );
    expect(recommendedPlan).toMatchObject({
      patientId,
      status: "pending_confirm",
      isCurrent: false,
    });
    const recommendedFirstItem = recommendedPlan.items?.[0];
    expect(
      recommendedFirstItem,
      "Expected the formal recommendation to include a first plan item",
    ).toBeTruthy();
    expect(recommendedFirstItem.gameContent.runtimeType).toBe("cognitive_web");

    const currentPlan = await apiPatch(
      roleClients.doctor.context,
      `/rehab-plans/${recommendedPlan.id}/confirm`,
      {
        adjustmentReason: "Playwright 认知训练正式回归计划确认。",
        dailyDuration: recommendedPlan.dailyDuration,
        difficultyLadder: recommendedPlan.difficultyLadder,
        weekFrequency: recommendedPlan.weekFrequency,
      },
      200,
    );
    expect(currentPlan).toMatchObject({
      id: recommendedPlan.id,
      patientId,
      status: "active",
      isCurrent: true,
    });
    const planItem = currentPlan.items?.[0];
    expect(
      planItem,
      "Expected the confirmed plan to preserve the recommended first item",
    ).toBeTruthy();
    expect(planItem.gameContent.code).toBe(
      recommendedFirstItem.gameContent.code,
    );
    expect(planItem.gameContent.runtimeType).toBe("cognitive_web");

    const runKey = `pw_cognitive_${Date.now()}`;
    const requiredMetrics = [
      requiredMetric("sequence_recall_rate", "ratio"),
      requiredMetric("path_completion_rate", "ratio"),
    ];

    const condition = await apiPost(
      roleClients.admin.context,
      "/admin/collection-conditions",
      {
        code: `${runKey}_condition`.slice(0, 64),
        name: "认知训练正式采集条件",
        description: "用于记忆路径训练的安静环境、触控或键盘操作采集条件。",
        environment: {
          room: "clinic_quiet",
          lighting: "standard_clinic",
          seating: "stable_chair",
        },
        deviceRequirements: {
          input: "touch_or_keyboard",
          display: "tablet_or_desktop",
        },
        taskParameters: {
          expectedDurationSeconds: 480,
          cognitiveTask: "sequence_path",
        },
        qualityRules: {
          minCompletionRate: 0.5,
          requiredMetrics: requiredMetrics.map((metric) => metric.metricType),
        },
      },
      201,
    );

    const protocol = await apiPost(
      roleClients.admin.context,
      "/admin/collection-protocols",
      {
        conditionId: condition.id,
        gameContentId: planItem.gameContentId,
        code: `${runKey}_protocol`.slice(0, 64),
        name: "认知训练正式采集协议",
        version: "1.0.0",
        runtimeType: "cognitive_web",
        requiredConsentTypes: ["privacy_policy"],
        requiredInputModes: ["touch", "keyboard"],
        requiredMetrics,
        conditionRules: {
          requireQuietRoom: true,
          allowKeyboard: true,
          allowTouch: true,
        },
        samplingConfig: {
          eventSource: "cognitive_web",
          windowSeconds: 480,
        },
        qualityGate: {
          minCompletionRate: 0.5,
          requireCompletedPath: true,
        },
      },
      201,
    );

    const batch = await apiPost(
      roleClients.doctor.context,
      "/collection-batches",
      {
        patientId,
        rehabPlanId: currentPlan.id,
        planItemId: planItem.id,
        gameContentId: planItem.gameContentId,
        protocolId: protocol.id,
        idempotencyKey: `${runKey}_batch`,
        operatorNotes: "正式训练前准备完成。",
      },
      201,
    );
    expect(batch.status).toBe("ready");
    expect(batch.planItemId).toBe(planItem.id);
    expect(batch.gameContentId).toBe(planItem.gameContentId);
    return {
      gameCode: planItem.gameContent.code,
      gameName: planItem.gameContent.name,
    };
  } finally {
    await disposeRoleApiClients(roleClients);
  }
}

async function abortFormalCognitiveTraining(sessionId) {
  const context = await playwrightRequest.newContext({ baseURL: apiUrl("/") });
  try {
    await apiLogin(context, "patient001");
    const aborted = await apiPost(
      context,
      `/training-sessions/${sessionId}/abort`,
      { reason: "Playwright 认知训练运行界面验证完成。" },
      200,
    );
    expect(aborted).toMatchObject({
      id: sessionId,
      sessionStatus: "aborted",
    });
  } finally {
    await context.dispose();
  }
}

async function createRoleApiClients(accounts, baseURL) {
  const clients = {};
  try {
    for (const [role, account] of Object.entries(accounts)) {
      const context = await playwrightRequest.newContext({ baseURL });
      clients[role] = { context, login: undefined };
      clients[role].login = await apiLogin(context, account);
    }
    return clients;
  } catch (error) {
    await disposeRoleApiClients(clients);
    throw error;
  }
}

async function disposeRoleApiClients(clients) {
  await Promise.all(
    Object.values(clients).map(({ context }) => context.dispose()),
  );
}

async function apiLogin(context, account) {
  const csrfResponse = await apiGet(context, "/auth/csrf", 200);
  const csrfCookie = await requireApiCookie(context, "rehab_csrf");
  if (
    typeof csrfResponse?.csrfToken !== "string" ||
    csrfResponse.csrfToken !== csrfCookie
  ) {
    throw new Error(
      `${account} login CSRF response does not match the rehab_csrf cookie`,
    );
  }
  const login = await apiPost(
    context,
    "/auth/login",
    {
      account,
      password: playwrightAccountPassword,
    },
    201,
  );
  if (
    login?.status !== "authenticated" ||
    typeof login.context !== "object" ||
    login.context === null ||
    Array.isArray(login.context)
  ) {
    throw new Error(`${account} login did not return authenticated context`);
  }
  await requireApiCookie(context, "rehab_session");
  return login;
}

async function apiGet(context, path, expectedStatus) {
  return apiRequest(context, "GET", path, {}, expectedStatus);
}

async function apiPost(context, path, body, expectedStatus) {
  return apiRequest(context, "POST", path, { data: body }, expectedStatus);
}

async function apiPatch(context, path, body, expectedStatus) {
  return apiRequest(context, "PATCH", path, { data: body }, expectedStatus);
}

async function apiRequest(context, method, path, options, expectedStatus) {
  const normalizedMethod = method.toUpperCase();
  const requestOptions = { method: normalizedMethod };
  if (options.data !== undefined) requestOptions.data = options.data;
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    requestOptions.headers = {
      "X-CSRF-Token": await requireApiCookie(context, "rehab_csrf"),
    };
  }
  const response = await context.fetch(path, requestOptions);
  return parseApiResponse(response, normalizedMethod, path, expectedStatus);
}

async function requireApiCookie(context, name) {
  const matches = (await context.storageState()).cookies.filter(
    (cookie) => cookie.name === name,
  );
  if (matches.length !== 1 || !matches[0].value) {
    throw new Error(
      `Expected exactly one ${name} cookie in the API request context`,
    );
  }
  return matches[0].value;
}

async function parseApiResponse(response, method, path, expectedStatus) {
  const text = await response.text();
  if (response.status() !== expectedStatus) {
    throw new Error(
      `${method} ${path} returned ${response.status()}, expected ${expectedStatus}: ${text}`,
    );
  }
  if (!text) {
    throw new Error(`${method} ${path} returned an empty JSON response`);
  }
  return JSON.parse(text);
}

function requiredMetric(metricType, unit) {
  return {
    metricType,
    unit,
    min: 0,
    max: unit === "seconds" ? 3600 : unit === "level" ? 5 : 1,
  };
}

function apiUrl(path) {
  return new URL(path, apiBaseUrl).toString();
}

function requirePlaywrightPort(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be an integer from 1 through 65535.`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535.`);
  }
  return port;
}

function rectsOverlap(a, b) {
  const tolerance = 1;
  return !(
    a.right <= b.left + tolerance ||
    b.right <= a.left + tolerance ||
    a.bottom <= b.top + tolerance ||
    b.bottom <= a.top + tolerance
  );
}

function sanitizeFileSegment(value) {
  return value
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function registrationPhonesForProject(projectName) {
  const suffixByProject = Object.freeze({
    "chromium-1280": "101",
    "chromium-1366": "102",
    "chromium-1440": "103",
    "chromium-pixel": "104",
    "chromium-iphone": "105",
  });
  const suffix = suffixByProject[projectName];
  if (!suffix) {
    throw new Error(`No registration phone allocation for ${projectName}.`);
  }
  return {
    mobilePhone: `13800000${suffix}`,
    caregiverPhone: `13900000${suffix}`,
  };
}

function registrationAccountForProject(projectName) {
  const projectSegment = sanitizeFileSegment(projectName).replace(/-/g, "_");
  const account = `pw_${projectSegment}_${Date.now().toString(36)}`;
  if (!/^[A-Za-z0-9_.-]{4,32}$/.test(account)) {
    throw new Error(
      `Registration account for ${projectName} violates the API account contract.`,
    );
  }
  return account;
}
