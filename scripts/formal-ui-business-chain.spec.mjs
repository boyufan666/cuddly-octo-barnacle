import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import { resolvePlaywrightRegressionEnvironment } from "./playwright-regression-environment.mjs";
import { createProductionAiAssessmentInput } from "./playwright-production-assessment-fixture.mjs";

const playwrightApiPort = requirePlaywrightPort("PLAYWRIGHT_API_PORT");
const playwrightWebPort = requirePlaywrightPort("PLAYWRIGHT_WEB_PORT");
const playwrightAccountPassword =
  resolvePlaywrightRegressionEnvironment().accountPassword;
const apiBaseUrl = `http://127.0.0.1:${playwrightApiPort}`;
const webBaseUrl = `http://127.0.0.1:${playwrightWebPort}`;
const patientExportColumns = [
  "patientExportId",
  "maskedName",
  "gender",
  "age",
  "maskedMobilePhone",
  "maskedCaregiverName",
  "maskedCaregiverPhone",
  "responsibleDoctor",
  "status",
  "createdAt",
];

test("formal UI chain preserves same IDs from clinical review through audit export", async ({
  browser,
}) => {
  const roleClients = await createRoleApiClients(
    { admin: "admin", doctor: "doctor001", patient: "patient001" },
    apiUrl("/"),
  );
  let chainIds;
  let doctorAssessmentPage;
  try {
    chainIds = await prepareFormalSameIdChain(roleClients);

    doctorAssessmentPage = await loginNewPage(browser, "doctor001");
    const selectedAssessmentData = await selectDoctorPatient(
      doctorAssessmentPage,
      chainIds.patientId,
    );
    const selectedAssessment = selectedAssessmentData.patient.assessments?.find(
      (assessment) => assessment.id === chainIds.assessmentId,
    );
    expect(
      selectedAssessment,
      "doctor patient selection must load the prepared assessment",
    ).toBeTruthy();
    const selectedRisk = selectedAssessment.riskGrades?.find(
      (risk) => risk.id === chainIds.riskGradeId,
    );
    expect(
      selectedRisk,
      "doctor patient selection must load the prepared current risk",
    ).toMatchObject({
      id: chainIds.riskGradeId,
      assessmentId: chainIds.assessmentId,
      isCurrent: true,
      confirmedAt: null,
      confirmedById: null,
    });
    await expect(
      doctorAssessmentPage.getByText("医师风险确认").first(),
    ).toBeVisible();
    await expect(
      doctorAssessmentPage.getByText(selectedRisk.reasonSummary, {
        exact: true,
      }),
    ).toBeVisible();
    const confirmRiskButton = doctorAssessmentPage.getByRole("button", {
      name: "确认风险结论",
    });
    await expect(confirmRiskButton).toBeEnabled();
    const assessmentReview = await waitForResponse(
      doctorAssessmentPage,
      "PATCH",
      new RegExp(`/assessments/${escapeRegExp(chainIds.assessmentId)}/review$`),
      200,
      async () => {
        await confirmRiskButton.click();
      },
    );
    expectSameChainId(
      "assessment review id",
      assessmentReview.id,
      chainIds.assessmentId,
    );
    expectSameChainId(
      "assessment review patient id",
      assessmentReview.patientId,
      chainIds.patientId,
    );
    expect(
      Array.isArray(assessmentReview.riskGrades),
      "assessment review must return a risk grade array",
    ).toBe(true);
    const reviewedRisks = assessmentReview.riskGrades.filter(
      (risk) =>
        risk.id === chainIds.riskGradeId &&
        risk.assessmentId === chainIds.assessmentId,
    );
    expect(
      reviewedRisks,
      "assessment review must return exactly one matching reviewed risk",
    ).toHaveLength(1);
    const [reviewedRisk] = reviewedRisks;
    expectSameChainId(
      "assessment risk id",
      reviewedRisk.id,
      chainIds.riskGradeId,
    );
    expect(
      reviewedRisk.confirmedAt,
      "risk must be confirmed after doctor review",
    ).toBeTruthy();
    const reviewedPatient = await reloadAuthenticatedAndCaptureJson(
      doctorAssessmentPage,
      "doctor001",
      "workbench",
      "医师风险确认",
      "GET",
      new RegExp(`/patients/${escapeRegExp(chainIds.patientId)}$`),
    );
    expectSameChainId(
      "reloaded reviewed patient id",
      reviewedPatient.id,
      chainIds.patientId,
    );
    const reloadedReviewedRisk = reviewedPatient.assessments
      ?.find((assessment) => assessment.id === chainIds.assessmentId)
      ?.riskGrades?.find((risk) => risk.id === chainIds.riskGradeId);
    expect(
      reloadedReviewedRisk?.confirmedAt,
      "reloaded patient must retain the doctor-confirmed risk",
    ).toBeTruthy();
    await expect(
      doctorAssessmentPage.getByText(reloadedReviewedRisk.reasonSummary, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      doctorAssessmentPage.getByRole("button", { name: "确认风险结论" }),
    ).toBeDisabled();
    Object.assign(
      chainIds,
      await prepareFormalPlanAndProtocol(roleClients, chainIds),
    );
  } finally {
    await disposeRoleApiClients(roleClients);
  }

  const doctorPlanPage = doctorAssessmentPage;
  await selectDoctorPatient(doctorPlanPage, chainIds.patientId);
  await clickWorkbenchNav(doctorPlanPage, "计划");
  await doctorPlanPage
    .getByLabel("确认或调整依据")
    .fill("Formal UI same-ID plan confirmation");
  const confirmedPlan = await waitForResponse(
    doctorPlanPage,
    "PATCH",
    new RegExp(`/rehab-plans/${escapeRegExp(chainIds.rehabPlanId)}/confirm$`),
    200,
    async () => {
      await doctorPlanPage
        .getByRole("button", { name: "确认并下发方案" })
        .click();
    },
  );
  expectSameChainId(
    "confirmed plan id",
    confirmedPlan.id,
    chainIds.rehabPlanId,
  );
  expectSameChainId(
    "confirmed plan patient id",
    confirmedPlan.patientId,
    chainIds.patientId,
  );
  await expect(
    doctorPlanPage
      .getByText("康复方案已确认下发，患者端将使用新的当前生效方案。")
      .first(),
  ).toBeVisible();
  await reloadAuthenticatedAndExpect(
    doctorPlanPage,
    "doctor001",
    "workbench",
    "计划",
    async () => clickWorkbenchNav(doctorPlanPage, "计划"),
  );
  const doctorPrepPage = doctorPlanPage;
  await clickWorkbenchNav(doctorPrepPage, "准备");
  await expect(
    doctorPrepPage.getByText("创建训练准备记录").first(),
  ).toBeVisible();
  await doctorPrepPage
    .getByLabel("当前方案训练项目")
    .selectOption(chainIds.planItemId);
  await doctorPrepPage
    .getByLabel("训练准备规则")
    .selectOption(chainIds.collectionProtocolId);
  await doctorPrepPage
    .getByLabel("医师准备说明")
    .fill("Formal UI same-ID training preparation");
  const collectionBatch = await waitForResponse(
    doctorPrepPage,
    "POST",
    /\/collection-batches$/,
    201,
    async () => {
      await doctorPrepPage
        .getByRole("button", { name: "创建训练准备记录" })
        .click();
    },
  );
  chainIds.collectionBatchId = collectionBatch.id;
  expectSameChainId(
    "collection batch patient id",
    collectionBatch.patientId,
    chainIds.patientId,
  );
  expectSameChainId(
    "collection batch plan id",
    collectionBatch.rehabPlanId,
    chainIds.rehabPlanId,
  );
  expectSameChainId(
    "collection batch plan item id",
    collectionBatch.planItemId,
    chainIds.planItemId,
  );
  expectSameChainId(
    "collection batch game id",
    collectionBatch.gameContentId,
    chainIds.gameContentId,
  );
  expectSameChainId(
    "collection batch protocol id",
    collectionBatch.protocolId,
    chainIds.collectionProtocolId,
  );
  await reloadAuthenticatedAndExpect(
    doctorPrepPage,
    "doctor001",
    "workbench",
    "已完成准备",
    async () => clickWorkbenchNav(doctorPrepPage, "准备"),
  );
  const patientPage = await loginNewPage(browser, "patient001", "patient");
  await clickPatientTaskNav(patientPage, "今日");
  await expect(patientPage.getByTestId("patient-today-flow")).toBeVisible();
  const todayCta = patientPage.getByTestId("patient-next-action");
  await expect(todayCta).toHaveText("开始训练准备");
  await expect(todayCta).toBeEnabled();
  await patientPage.clock.install({ time: new Date() });
  await todayCta.click();
  await expect(patientPage.getByTestId("patient-prep-flow")).toBeVisible();
  const trainingSession = await waitForResponse(
    patientPage,
    "POST",
    /\/training-sessions$/,
    201,
    async () => {
      await patientPage.getByTestId("patient-prep-start-cta").click();
    },
  );
  chainIds.trainingSessionId = trainingSession.id;
  expectSameChainId(
    "training session patient id",
    trainingSession.patientId,
    chainIds.patientId,
  );
  expectSameChainId(
    "training session plan id",
    trainingSession.rehabPlanId,
    chainIds.rehabPlanId,
  );
  expectSameChainId(
    "training session plan item id",
    trainingSession.planItemId,
    chainIds.planItemId,
  );
  expectSameChainId(
    "training session batch id",
    trainingSession.collectionBatchId,
    chainIds.collectionBatchId,
  );
  expect(
    trainingSession.gameRunId,
    "training session should expose gameRunId",
  ).toBeTruthy();
  chainIds.gameRunId = trainingSession.gameRunId;
  await expect(patientPage.getByText("跟随提示完成训练").first()).toBeVisible();
  let trainingResult;
  try {
    await completeCognitiveTraining(patientPage, {
      clientStartedAt: trainingSession.clientStartedAt,
      durationMinutes: chainIds.trainingDurationMinutes,
    });
    trainingResult = await waitForResponse(
      patientPage,
      "POST",
      new RegExp(
        `/training-sessions/${escapeRegExp(chainIds.trainingSessionId)}/results$`,
      ),
      201,
      async () => {
        await patientPage
          .getByTestId("patient-training-primary-action")
          .getByRole("button", { name: "完成本次训练" })
          .click();
      },
    );
  } finally {
    if (!trainingResult) {
      await abortFormalTrainingSession(chainIds.trainingSessionId);
    }
  }
  chainIds.trainingResultId = trainingResult.id;
  chainIds.trainingResultCreatedAt = trainingResult.createdAt;
  expectSameChainId(
    "training result batch id",
    trainingResult.collectionBatchId,
    chainIds.collectionBatchId,
  );
  expectSameChainId(
    "training result gameRunId",
    trainingResult.gameRunId,
    chainIds.gameRunId,
  );
  expect(trainingResult).toMatchObject({
    abnormalFlag: true,
    qualityFlag: "suspicious",
    qualityReasons: ["反应时间异常"],
  });
  await expect(
    patientPage.getByText("本次训练已保存，医生会查看后给出建议。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(patientPage.getByText("训练结果提交失败")).toHaveCount(0);
  await reloadAuthenticatedAndExpect(
    patientPage,
    "patient001",
    "patient",
    "我的训练进展",
    async () => clickPatientTaskNav(patientPage, "记录"),
  );
  await expect(
    patientPage.getByText("本次训练记录已保存。").first(),
  ).toBeVisible();
  await patientPage.close();

  const doctorReviewPage = doctorPrepPage;
  const pendingReviewRecords = await reloadAuthenticatedAndCaptureJson(
    doctorReviewPage,
    "doctor001",
    "workbench",
    "待复核训练结果",
    "GET",
    new RegExp(
      `/patients/${escapeRegExp(chainIds.patientId)}/training-records$`,
    ),
    async () => clickWorkbenchNav(doctorReviewPage, "复核"),
  );
  expect(
    Array.isArray(pendingReviewRecords.sessions),
    "doctor review reload must return a training session array",
  ).toBe(true);
  const pendingReviewSessions = pendingReviewRecords.sessions.filter(
    (session) => session.id === chainIds.trainingSessionId,
  );
  expect(
    pendingReviewSessions,
    "doctor review reload must return exactly one matching training session",
  ).toHaveLength(1);
  expect(pendingReviewSessions[0].result).toMatchObject({
    id: chainIds.trainingResultId,
    reviewStatus: null,
    reviewConclusion: null,
    reviewedByUserId: null,
    reviewedAt: null,
  });
  const reviewQueueItem = doctorReviewPage
    .getByRole("button")
    .filter({ hasText: `会话 ${shortId(chainIds.trainingSessionId)}` });
  await expect(
    reviewQueueItem,
    "doctor review queue must expose exactly one matching training session",
  ).toHaveCount(1);
  await reviewQueueItem.click();
  await doctorReviewPage
    .getByLabel("复核结论")
    .selectOption("confirmed_abnormal");
  const trainingReviewNote = "Formal UI same-ID training result review";
  await doctorReviewPage.getByLabel("复核说明").fill(trainingReviewNote);
  const reviewedTrainingResult = await waitForResponse(
    doctorReviewPage,
    "PATCH",
    new RegExp(
      `/training-results/${escapeRegExp(chainIds.trainingResultId)}/review$`,
    ),
    200,
    async () => {
      await doctorReviewPage
        .getByRole("button", { name: "保存复核结论" })
        .click();
    },
  );
  expectSameChainId(
    "reviewed training result id",
    reviewedTrainingResult.id,
    chainIds.trainingResultId,
  );
  expect(reviewedTrainingResult.reviewStatus).toBe("reviewed");
  expect(reviewedTrainingResult.reviewConclusion).toBe("confirmed_abnormal");
  expect(reviewedTrainingResult.reviewNote).toBe(trainingReviewNote);
  expect(reviewedTrainingResult.reviewedByUserId).toBe(
    roleClients.doctor.login.user.id,
  );
  expect(new Date(reviewedTrainingResult.reviewedAt).toISOString()).toBe(
    reviewedTrainingResult.reviewedAt,
  );
  await expect(
    doctorReviewPage.getByText("训练复核结论已保存，患者训练记录已刷新。", {
      exact: true,
    }),
  ).toBeVisible();
  const reviewedTrainingRecords = await reloadAuthenticatedAndCaptureJson(
    doctorReviewPage,
    "doctor001",
    "workbench",
    "待复核训练结果",
    "GET",
    new RegExp(
      `/patients/${escapeRegExp(chainIds.patientId)}/training-records$`,
    ),
    async () => clickWorkbenchNav(doctorReviewPage, "复核"),
  );
  expect(
    Array.isArray(reviewedTrainingRecords.sessions),
    "doctor post-review reload must return a training session array",
  ).toBe(true);
  const persistedReviewedSessions = reviewedTrainingRecords.sessions.filter(
    (session) => session.id === chainIds.trainingSessionId,
  );
  expect(
    persistedReviewedSessions,
    "doctor post-review reload must return exactly one matching training session",
  ).toHaveLength(1);
  expect(persistedReviewedSessions[0].result).toMatchObject({
    id: chainIds.trainingResultId,
    reviewStatus: "reviewed",
    reviewConclusion: "confirmed_abnormal",
    reviewNote: trainingReviewNote,
    reviewedByUserId: roleClients.doctor.login.user.id,
    reviewedAt: reviewedTrainingResult.reviewedAt,
  });
  await expect(reviewQueueItem).toHaveCount(0);
  await doctorReviewPage.close();

  const caregiverPage = await loginNewPage(browser, "caregiver001", "patient");
  await expect(
    caregiverPage.getByTestId("caregiver-primary-workspace"),
  ).toBeVisible();
  await selectOnlyAuthorizedCaregiverPatient(caregiverPage);
  await clickPatientTaskNav(caregiverPage, "进展");
  const caregiverSummary = await reloadAuthenticatedAndCaptureJson(
    caregiverPage,
    "caregiver001",
    "patient",
    "训练进展",
    "GET",
    new RegExp(
      `/caregiver/patients/${escapeRegExp(chainIds.patientId)}/summary$`,
    ),
    async () => clickPatientTaskNav(caregiverPage, "进展"),
  );
  expectSameChainId(
    "caregiver summary patient id",
    caregiverSummary.patient.id,
    chainIds.patientId,
  );
  expect(
    caregiverSummary.recentTraining.some(
      (session) =>
        session.gameContent?.name === chainIds.trainingGameName &&
        session.result?.createdAt === chainIds.trainingResultCreatedAt,
    ),
    "caregiver progress should include the refreshed desensitized reviewed training entry",
  ).toBeTruthy();
  const caregiverPayload = JSON.stringify(caregiverSummary);
  for (const internalId of [
    chainIds.planItemId,
    chainIds.trainingSessionId,
    chainIds.trainingResultId,
  ]) {
    expect(caregiverPayload).not.toContain(internalId);
  }
  await expect(
    caregiverPage.getByText(chainIds.trainingGameName).first(),
  ).toBeVisible();
  await expect(caregiverPage.getByText(chainIds.trainingResultId)).toHaveCount(
    0,
  );
  await expect(
    caregiverPage.getByText(/raw|payload|Provider|Endpoint|manifest|审计 ID/i),
  ).toHaveCount(0);
  await caregiverPage.close();

  const adminPage = await loginNewPage(browser, "admin");
  await clickWorkbenchNav(adminPage, "审计");
  await queryAuditLog(
    adminPage,
    "assessment.review",
    "assessment_record",
    chainIds.assessmentId,
  );
  await assertAuditResponseContains(
    adminPage,
    chainIds,
    "assessment.review",
    "assessment_record",
    chainIds.assessmentId,
    {
      expectedMetadata: {
        patientId: chainIds.patientId,
        riskGradeId: chainIds.riskGradeId,
      },
    },
  );
  await queryAuditLog(
    adminPage,
    "rehab_plan.confirm",
    "rehab_plan",
    chainIds.rehabPlanId,
  );
  await assertAuditResponseContains(
    adminPage,
    chainIds,
    "rehab_plan.confirm",
    "rehab_plan",
    chainIds.rehabPlanId,
    {
      expectedMetadata: {
        patientId: chainIds.patientId,
      },
      expectedMetadataArrayIncludes: {
        planItemIds: chainIds.planItemId,
      },
    },
  );
  await queryAuditLog(
    adminPage,
    "collection_batch.create",
    "collection_batch",
    chainIds.collectionBatchId,
  );
  await assertAuditResponseContains(
    adminPage,
    chainIds,
    "collection_batch.create",
    "collection_batch",
    chainIds.collectionBatchId,
    {
      expectedMetadata: {
        patientId: chainIds.patientId,
        rehabPlanId: chainIds.rehabPlanId,
        planItemId: chainIds.planItemId,
        gameContentId: chainIds.gameContentId,
        protocolId: chainIds.collectionProtocolId,
      },
    },
  );
  await queryAuditLog(
    adminPage,
    "training_session.start",
    "training_session",
    chainIds.trainingSessionId,
  );
  await assertAuditResponseContains(
    adminPage,
    chainIds,
    "training_session.start",
    "training_session",
    chainIds.trainingSessionId,
    {
      expectedMetadata: {
        patientId: chainIds.patientId,
        rehabPlanId: chainIds.rehabPlanId,
        planItemId: chainIds.planItemId,
        collectionBatchId: chainIds.collectionBatchId,
        gameContentId: chainIds.gameContentId,
        gameRunId: chainIds.gameRunId,
      },
    },
  );
  await queryAuditLog(
    adminPage,
    "training_result.submit",
    "training_session",
    chainIds.trainingSessionId,
  );
  await assertAuditResponseContains(
    adminPage,
    chainIds,
    "training_result.submit",
    "training_session",
    chainIds.trainingSessionId,
    {
      expectedMetadata: {
        patientId: chainIds.patientId,
        rehabPlanId: chainIds.rehabPlanId,
        planItemId: chainIds.planItemId,
        collectionBatchId: chainIds.collectionBatchId,
        gameContentId: chainIds.gameContentId,
        gameRunId: chainIds.gameRunId,
        trainingResultId: chainIds.trainingResultId,
      },
    },
  );
  await queryAuditLog(
    adminPage,
    "training_result.review",
    "training_result",
    chainIds.trainingResultId,
  );
  await assertAuditResponseContains(
    adminPage,
    chainIds,
    "training_result.review",
    "training_result",
    chainIds.trainingResultId,
    {
      expectedMetadata: {
        patientId: chainIds.patientId,
        sessionId: chainIds.trainingSessionId,
        reviewConclusion: "confirmed_abnormal",
      },
    },
  );
  const exportForm = adminPage.getByTestId("desensitized-export-form");
  const exportReason = `Formal UI same-ID regression ${chainIds.trainingSessionId}`;
  const expectedExportReasonHash = exportReasonHash(exportReason);
  await exportForm.getByLabel("数据类型").selectOption("patients");
  await exportForm.getByLabel("患者档案编号").fill(chainIds.patientId);
  await exportForm.getByLabel("导出原因（必填）").fill(exportReason);
  const exportResponsePromise = adminPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/admin/exports/patients",
  );
  const downloadPromise = adminPage.waitForEvent("download");
  await exportForm.getByRole("button", { name: "生成脱敏 CSV" }).click();
  const [download, exportResponse] = await Promise.all([
    downloadPromise,
    exportResponsePromise,
  ]);
  expect(
    exportResponse.status(),
    "patient CSV export must return HTTP 200",
  ).toBe(200);
  const responseHeaders = exportResponse.headers();
  expect(responseHeaders["content-type"]).toBe("text/csv; charset=utf-8");
  expect(responseHeaders["cache-control"]).toBe("no-store");
  expect(responseHeaders.pragma).toBe("no-cache");
  expect(responseHeaders["x-content-type-options"]).toBe("nosniff");
  expect(
    responseHeaders.date,
    "patient CSV response must include the API server date",
  ).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
  const responseDate = new Date(responseHeaders.date);
  expect(
    Number.isNaN(responseDate.getTime()),
    "patient CSV response date must be valid",
  ).toBe(false);
  const expectedFilename = `rehab-patients-${responseDate
    .toISOString()
    .slice(0, 10)}.csv`;
  expect(responseHeaders["content-disposition"]).toBe(
    `attachment; filename="${expectedFilename}"`,
  );
  expect(download.suggestedFilename()).toBe(expectedFilename);
  const downloadPath = await download.path();
  expect(typeof downloadPath).toBe("string");
  expect(downloadPath.length).toBeGreaterThan(0);
  const csvContent = await readFile(downloadPath, "utf8");
  const expectedPatientExportId = exportStableId("patient", chainIds.patientId);
  expect(
    csvContent.startsWith("\uFEFF"),
    "patient CSV must include a UTF-8 BOM",
  ).toBe(true);
  const csvRows = parseCsv(csvContent.slice(1));
  expect(csvRows).toHaveLength(2);
  expect(csvRows[0]).toEqual(patientExportColumns);
  expect(csvRows[1]).toHaveLength(patientExportColumns.length);
  expect(csvRows[1].slice(0, 9)).toEqual([
    expectedPatientExportId,
    "李*",
    "female",
    "72",
    "138****6721",
    "李*",
    "139****8206",
    "王*",
    "active",
  ]);
  expect(new Date(csvRows[1][9]).toISOString()).toBe(csvRows[1][9]);
  expect(csvContent).not.toContain(chainIds.patientId);
  expect(csvContent).not.toContain(chainIds.trainingSessionId);
  expect(csvContent).not.toContain(chainIds.trainingResultId);
  await expect(
    adminPage.getByText(
      `脱敏导出文件 ${expectedFilename} 已生成，导出操作已写入审计日志。`,
      { exact: true },
    ),
  ).toBeVisible();
  await queryAuditLog(adminPage, "data.export", "data_export", "patients");
  const exportAudit = await assertAuditResponseContains(
    adminPage,
    chainIds,
    "data.export",
    "data_export",
    "patients",
    { expectedPatientExportId, expectedReasonHash: expectedExportReasonHash },
  );
  expect(exportAudit.metadata?.format).toBe("csv");
  expect(exportAudit.metadata?.filters).toEqual({
    dateFrom: null,
    dateTo: null,
    patientFilterApplied: true,
    patientExportId: expectedPatientExportId,
    riskLevel: null,
    qualityFlag: null,
    limit: 100,
  });
  expectSameChainId(
    "export audit patient filter",
    exportAudit.metadata?.filters?.patientExportId,
    expectedPatientExportId,
  );
  expect(exportAudit.metadata?.rowCount).toBe(1);
  expect(exportAudit.metadata?.columns).toEqual(patientExportColumns);
  expect(exportAudit.metadata?.desensitized).toBe(true);
  expect(exportAudit.metadata?.reasonProvided).toBe(true);
  expect(exportAudit.metadata?.reasonLength).toBe(exportReason.length);
  expect(exportAudit.metadata).not.toHaveProperty("patientId");
  expect(JSON.stringify(exportAudit.metadata)).not.toContain(
    chainIds.patientId,
  );
  expect(JSON.stringify(exportAudit.metadata)).not.toContain(
    chainIds.trainingSessionId,
  );
  expect(JSON.stringify(exportAudit.metadata)).not.toContain(
    chainIds.trainingResultId,
  );
  expectSameChainId(
    "export audit reason hash",
    exportAudit.metadata?.reasonHash,
    expectedExportReasonHash,
  );
  await adminPage.close();
});

async function loginNewPage(browser, account, navigation = "workbench") {
  const page = await browser.newPage();
  await page.goto(appUrl(), { waitUntil: "domcontentloaded" });
  await login(page, account, navigation);
  return page;
}

async function selectDoctorPatient(page, patientId) {
  const patientRecord = page
    .getByText(new RegExp(`档案号 ${escapeRegExp(shortId(patientId))}$`))
    .locator("xpath=ancestor::*[.//button[normalize-space()='查看']][1]");
  const selectButton = patientRecord.locator("button:visible", {
    hasText: "查看",
  });
  await expect(
    selectButton,
    `doctor queue must expose exactly one visible selector for patient ${patientId}`,
  ).toHaveCount(1);
  await expect(selectButton).toBeEnabled();

  const expectedRequests = [
    {
      label: "patient detail",
      pattern: new RegExp(`/patients/${escapeRegExp(patientId)}$`),
    },
    {
      label: "patient assessments",
      pattern: new RegExp(`/patients/${escapeRegExp(patientId)}/assessments$`),
    },
    {
      label: "patient training records",
      pattern: new RegExp(
        `/patients/${escapeRegExp(patientId)}/training-records$`,
      ),
    },
  ];
  const responsePromises = expectedRequests.map(({ pattern }) =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        pattern.test(new URL(response.url()).pathname),
    ),
  );
  await selectButton.click();
  const responses = await Promise.all(responsePromises);
  const payloads = [];
  for (const [index, response] of responses.entries()) {
    const { label } = expectedRequests[index];
    expect(
      response.status(),
      `${label} must return HTTP 200 after doctor selects patient ${patientId}`,
    ).toBe(200);
    payloads.push(await response.json());
  }

  const [patient, assessments, trainingRecords] = payloads;
  expectSameChainId("selected doctor patient id", patient.id, patientId);
  expect(
    Array.isArray(assessments),
    "selected doctor patient assessments must be an array",
  ).toBe(true);
  expect(
    Array.isArray(trainingRecords?.sessions),
    "selected doctor patient training records must expose sessions",
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: `${patient.name} · 临床摘要` }),
  ).toBeVisible();
  return { patient, assessments, trainingRecords };
}

async function login(page, account, navigation = "workbench") {
  const loginPanel = page.getByTestId("auth-login-panel");
  await expect(loginPanel).toBeVisible();
  await loginPanel.getByLabel("账号", { exact: true }).fill(account);
  await loginPanel
    .getByLabel("密码", { exact: true })
    .fill(playwrightAccountPassword);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/auth/login",
  );
  await loginPanel.getByRole("button", { name: "进入工作台" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status(), `${account} login must return HTTP 201`).toBe(
    201,
  );
  expect(await loginResponse.json()).toMatchObject({
    status: "authenticated",
    user: { account },
  });
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  if (navigation === "patient") {
    await expect(page.getByTestId("patient-task-nav").first()).toBeVisible();
    return;
  }
  await expect(visibleWorkbenchNav(page)).toBeVisible();
  if (account === "doctor001") {
    await expect(page.getByText("负责患者工作清单").first()).toBeVisible();
  }
  if (account === "admin") {
    await expect(page.getByTestId("admin-governance-workspace")).toBeVisible();
  }
}

async function clickWorkbenchNav(page, name) {
  const nav = visibleWorkbenchNav(page);
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name }).click();
}

async function clickPatientTaskNav(page, name) {
  const nav = page.getByTestId("patient-task-nav").first();
  await expect(nav).toBeVisible();
  const button = nav.getByRole("button", { name });
  await expect(button).toBeVisible();
  await button.click();
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

async function waitForResponse(
  page,
  method,
  urlPattern,
  expectedStatus,
  action,
) {
  const responseDataPromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === method &&
        urlPattern.test(new URL(response.url()).pathname),
    )
    .then(async (response) => {
      expect(
        response.status(),
        `${method} ${urlPattern} must return HTTP ${expectedStatus}`,
      ).toBe(expectedStatus);
      return response.json();
    });
  await action();
  return responseDataPromise;
}

async function reloadAuthenticatedAndExpect(
  page,
  account,
  navigation,
  text,
  afterReload,
) {
  const sessionResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/me",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  const sessionResponse = await sessionResponsePromise;
  expect(
    sessionResponse.status(),
    `${account} session restore must return HTTP 200`,
  ).toBe(200);
  expect(await sessionResponse.json()).toMatchObject({
    user: { account },
  });
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible({
    timeout: 10_000,
  });
  if (navigation === "patient") {
    await expect(page.getByTestId("patient-task-nav").first()).toBeVisible();
  } else {
    await expect(visibleWorkbenchNav(page)).toBeVisible();
  }
  if (afterReload) {
    await afterReload();
  }
  await expect(page.getByText(text).first()).toBeVisible();
}

async function reloadAuthenticatedAndCaptureJson(
  page,
  account,
  navigation,
  text,
  method,
  urlPattern,
  afterReload,
) {
  const navigationResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      urlPattern.test(new URL(response.url()).pathname),
  );
  await reloadAuthenticatedAndExpect(
    page,
    account,
    navigation,
    text,
    afterReload,
  );
  const navigationResponse = await navigationResponsePromise;
  expect(
    navigationResponse.status(),
    `${method} ${urlPattern} must return HTTP 200`,
  ).toBe(200);
  const verificationResponse = await page.request.fetch(
    navigationResponse.url(),
    { method },
  );
  expect(
    verificationResponse.status(),
    `authenticated persistence check for ${method} ${urlPattern} must return HTTP 200`,
  ).toBe(200);
  return verificationResponse.json();
}

async function queryAuditLog(page, action, targetType, targetId) {
  await page.getByLabel("动作").selectOption(action);
  await page.getByLabel("目标类型").selectOption(targetType);
  await page.getByLabel("对象编号").fill(targetId);
  await waitForResponse(page, "GET", /\/admin\/audit-logs$/, 200, async () => {
    await page.getByRole("button", { name: "查询审计日志" }).click();
  });
}

async function assertAuditResponseContains(
  page,
  chainIds,
  action,
  targetType,
  targetId,
  options,
) {
  const auditLogs = await waitForResponse(
    page,
    "GET",
    /\/admin\/audit-logs$/,
    200,
    async () => {
      await page.getByRole("button", { name: "查询审计日志" }).click();
    },
  );
  const matchingLogs = auditLogs.filter(
    (log) =>
      log.action === action &&
      log.targetType === targetType &&
      log.targetId === targetId &&
      log.result === "success" &&
      (options.expectedPatientExportId === undefined ||
        log.metadata?.filters?.patientExportId ===
          options.expectedPatientExportId) &&
      (options.expectedReasonHash === undefined ||
        log.metadata?.reasonHash === options.expectedReasonHash) &&
      metadataMatches(log.metadata, options.expectedMetadata) &&
      metadataArrayIncludes(
        log.metadata,
        options.expectedMetadataArrayIncludes,
      ),
  );
  expect(
    matchingLogs,
    `audit log ${action} ${targetId} must be unique`,
  ).toHaveLength(1);
  const [matchingLog] = matchingLogs;
  if (options.expectedMetadata !== undefined) {
    for (const [key, expected] of Object.entries(options.expectedMetadata)) {
      expectSameChainId(
        `audit metadata ${key}`,
        matchingLog.metadata?.[key],
        expected,
      );
    }
  }
  if (options.expectedMetadataArrayIncludes !== undefined) {
    for (const [key, expected] of Object.entries(
      options.expectedMetadataArrayIncludes,
    )) {
      expect(matchingLog.metadata?.[key]).toContain(expected);
    }
  }
  return matchingLog;
}

async function completeCognitiveTraining(
  page,
  { clientStartedAt, durationMinutes },
) {
  const sequenceItems = page.locator('ol[aria-label="本轮记忆序列"] li');
  await expect(sequenceItems.first()).toBeVisible();
  const sequence = (await sequenceItems.allTextContents()).map((item) =>
    item.trim(),
  );
  expect(
    sequence.length,
    "formal cognitive training must expose a non-empty memory sequence",
  ).toBeGreaterThan(0);

  const startedAtMs = Date.parse(clientStartedAt);
  expect(
    Number.isFinite(startedAtMs),
    "training session must expose a valid clientStartedAt timestamp",
  ).toBe(true);
  expect(
    Number.isInteger(durationMinutes) && durationMinutes > 0,
    "formal cognitive plan item must expose a positive durationMinutes",
  ).toBe(true);

  await page.clock.fastForward(10_000);
  await expect(
    page.getByRole("heading", { name: "选择第 1 个位置" }),
  ).toBeVisible();
  const slowAnswerDelayMs = sequence.length * 10_000 + 1_000;
  expect(
    10_000 + slowAnswerDelayMs < durationMinutes * 60_000,
    "formal cognitive prescription must retain enough time to capture a slow-response review case",
  ).toBe(true);
  await page.clock.fastForward(slowAnswerDelayMs);
  for (const option of sequence) {
    await page.getByRole("button", { name: option, exact: true }).click();
  }
  const feedbackStatus = page.locator(
    '.training-stage-shell p[role="status"]',
  );
  await expect(feedbackStatus).toHaveCount(1);
  await expect(feedbackStatus).toHaveText(
    `本轮正确 ${sequence.length}/${sequence.length}`,
  );
  await page.clock.setFixedTime(
    new Date(startedAtMs + durationMinutes * 60_000),
  );
  await page.clock.fastForward(250);
  await expect(feedbackStatus).toHaveText("本次训练已完成，请确认保存。");
}

async function abortFormalTrainingSession(sessionId) {
  const context = await playwrightRequest.newContext({ baseURL: apiUrl("/") });
  try {
    await apiLogin(context, "patient001");
    const aborted = await apiPost(
      context,
      `/training-sessions/${sessionId}/abort`,
      { reason: "Formal UI chain failed before training result submission." },
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

async function prepareFormalSameIdChain(roleClients) {
  const patientIds = roleClients.doctor.login.context.doctorPatientIds;
  expect(
    patientIds,
    "patient001 must have exactly one patient profile",
  ).toHaveLength(1);
  const [patientId] = patientIds;
  expect(typeof patientId).toBe("string");
  expect(patientId.length).toBeGreaterThan(0);

  const assessmentInput = await createProductionAiAssessmentInput({
    apiPost,
    context: roleClients.doctor.context,
    patientId,
    assessmentType: "MMSE/CDR",
    physicalConditions: ["no_known_limitations"],
    transcript:
      "原始量表记录：MMSE 总分 16/30，CDR 2，记忆 48/100，定向 52/100，执行 44/100，语言 58/100。患者能够回答部分定向问题，但回忆和执行功能表现需要进一步复核。",
  });
  const assessment = await apiPost(
    roleClients.doctor.context,
    "/assessments",
    { patientId, assessmentType: "MMSE/CDR", ...assessmentInput },
    201,
  );
  expectSameChainId(
    "created assessment patient id",
    assessment.patientId,
    patientId,
  );
  const refreshedAssessments = await apiGet(
    roleClients.doctor.context,
    `/patients/${patientId}/assessments`,
    200,
  );
  const createdAssessments = refreshedAssessments.filter(
    (item) => item.id === assessment.id,
  );
  expect(
    createdAssessments,
    "created assessment must be unique in patient assessments",
  ).toHaveLength(1);
  const [createdAssessment] = createdAssessments;
  const currentRiskGrades = createdAssessment.riskGrades.filter(
    (risk) => risk.isCurrent,
  );
  expect(
    currentRiskGrades,
    "created assessment must have exactly one current risk grade",
  ).toHaveLength(1);
  const [riskGrade] = currentRiskGrades;
  expect(riskGrade.confirmedAt).toBeNull();

  return {
    patientId,
    assessmentId: assessment.id,
    riskGradeId: riskGrade.id,
  };
}

async function prepareFormalPlanAndProtocol(roleClients, chainIds) {
  const recommendedPlan = await apiPost(
    roleClients.doctor.context,
    "/rehab-plans/recommend",
    { patientId: chainIds.patientId },
    201,
  );
  expectSameChainId(
    "recommended plan patient id",
    recommendedPlan.patientId,
    chainIds.patientId,
  );
  expect(recommendedPlan.status).toBe("pending_confirm");
  expect(Array.isArray(recommendedPlan.items)).toBe(true);
  expect(recommendedPlan.items.length).toBeGreaterThan(0);
  const planItem = recommendedPlan.items[0];
  expect(
    planItem.gameContent.runtimeType,
    "Formal UI regression requires the visible next patient task to be no-camera cognitive web training",
  ).toBe("cognitive_web");

  const runKey = `formal_ui_${Date.now()}`;
  const requiredMetrics = readRequiredMetrics(
    planItem.gameContent.requiredMetrics,
  );
  const condition = await apiPost(
    roleClients.admin.context,
    "/admin/collection-conditions",
    {
      code: `${runKey}_condition`.slice(0, 64),
      name: "正式认知训练准备条件",
      description: "用于正式认知训练的安静空间和屏幕操作准备。",
      environment: {
        room: "clinic_quiet_area",
        lighting: "standard_clinic",
        seatedSpace: "table_and_chair",
      },
      deviceRequirements: {
        display: "desktop_or_tablet",
        input: "pointer_or_touch",
      },
      taskParameters: {
        expectedDurationSeconds: 90,
        runtimeType: planItem.gameContent.runtimeType,
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
      name: "正式认知训练准备规则",
      version: "1.0.0",
      runtimeType: planItem.gameContent.runtimeType,
      requiredConsentTypes: ["privacy_policy"],
      requiredInputModes: ["keyboard"],
      requiredMetrics,
      conditionRules: {
        requireCamera: false,
        requirePoseCheck: false,
        physicalConditions: ["no_known_limitations"],
        riskLevels: ["low", "moderate", "high"],
      },
      samplingConfig: {
        eventSource: planItem.gameContent.runtimeType,
        windowSeconds: 90,
      },
      qualityGate: {
        minCompletionRate: 0.5,
      },
    },
    201,
  );

  return {
    rehabPlanId: recommendedPlan.id,
    planItemId: planItem.id,
    gameContentId: planItem.gameContentId,
    trainingGameName: planItem.gameContent.name,
    trainingDurationMinutes: planItem.durationMinutes,
    collectionConditionId: condition.id,
    collectionProtocolId: protocol.id,
  };
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

function readRequiredMetrics(value) {
  expect(
    Array.isArray(value),
    "Expected selected game to expose requiredMetrics",
  ).toBe(true);
  const metrics = value.map((metric, index) => {
    expect(
      metric && typeof metric === "object",
      `requiredMetrics[${index}] must be an object`,
    ).toBe(true);
    expect(typeof metric.metricType).toBe("string");
    expect(metric.metricType.trim().length).toBeGreaterThan(0);
    expect(typeof metric.unit).toBe("string");
    expect(metric.unit.trim().length).toBeGreaterThan(0);
    const parsedMetric = {
      metricType: metric.metricType,
      unit: metric.unit,
    };
    for (const boundary of ["min", "max"]) {
      if (Object.hasOwn(metric, boundary)) {
        expect(
          Number.isFinite(metric[boundary]),
          `requiredMetrics[${index}].${boundary} must be finite when present`,
        ).toBe(true);
        parsedMetric[boundary] = metric[boundary];
      }
    }
    return parsedMetric;
  });
  expect(
    metrics.length,
    "Expected selected game to require formal metrics",
  ).toBeGreaterThan(0);
  return metrics;
}

function expectSameChainId(label, actual, expected) {
  expect(actual, label).toBe(expected);
}

function exportStableId(scope, id) {
  return `${scope}_${createHash("sha256").update(`${scope}:${id}`).digest("hex").slice(0, 12)}`;
}

function exportReasonHash(reason) {
  return createHash("sha256").update(reason.trim()).digest("hex").slice(0, 16);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote && character !== "," && character !== "\n") {
      throw new Error("CSV contains characters after a closing quote");
    }
    if (character === '"') {
      if (field !== "") {
        throw new Error("CSV quote must begin at the start of a field");
      }
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
      continue;
    }
    if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      closedQuote = false;
      continue;
    }
    if (character === "\r") {
      throw new Error("CSV must use LF record separators");
    }
    field += character;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field");
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function metadataMatches(metadata, expectedMetadata) {
  if (expectedMetadata === undefined) return true;
  return Object.entries(expectedMetadata).every(
    ([key, expected]) => metadata?.[key] === expected,
  );
}

function metadataArrayIncludes(metadata, expectedMetadataArrayIncludes) {
  if (expectedMetadataArrayIncludes === undefined) return true;
  return Object.entries(expectedMetadataArrayIncludes).every(
    ([key, expected]) =>
      Array.isArray(metadata?.[key]) && metadata[key].includes(expected),
  );
}

function shortId(value) {
  return value.slice(0, 8);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function apiUrl(path) {
  return new URL(path, apiBaseUrl).toString();
}

function appUrl() {
  return webBaseUrl;
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
