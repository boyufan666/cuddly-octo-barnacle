import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("patient and caregiver shell uses task navigation instead of workbench module switching", async () => {
  const workspaceSource = await readWorkspaceSource();
  const caregiverWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx"),
    "utf8",
  );
  const roleShellSource = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const roleNavigationSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const roleWorkspaceModelSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace-model.ts"),
    "utf8",
  );
  const taskNavigationSource = sliceFrom(
    roleShellSource,
    "function PatientTaskNavigation",
  );
  const patientTaskSource = sliceBetween(
    roleNavigationSource,
    "patientTaskNavItems",
    "doctorNavItems",
  );
  const caregiverTaskSource = sliceBetween(
    roleNavigationSource,
    "caregiverNavItems",
    "roleHome",
  );

  assert.match(
    workspaceSource,
    /from ["']@\/components\/layout\/RoleShell["']/,
  );
  assert.match(roleShellSource, /function PatientTaskNavigation/);
  assert.match(roleShellSource, /data-testid="patient-task-nav"/);
  assert.match(patientTaskSource, /今日/);
  assert.match(patientTaskSource, /训练/);
  assert.match(patientTaskSource, /记录/);
  assert.match(patientTaskSource, /我的/);
  assert.match(
    roleShellSource,
    /patientLikeShell[\s\S]*<PatientTaskNavigation/,
  );
  assert.doesNotMatch(
    workspaceSource,
    /patientLikeShell\s*\?\s*<AppNavigation/,
  );
  assert.match(
    workspaceSource,
    /from ["']@\/features\/caregiver\/CaregiverWorkspacePage["']/,
  );
  assert.match(workspaceSource, /<CaregiverWorkspacePage\b/);
  assert.match(
    workspaceSource,
    /activeSection=\{caregiverWorkspaceSectionFromNavId\(activeNavId\)\}/,
  );
  assert.match(
    roleWorkspaceModelSource,
    /export function caregiverWorkspaceSectionFromNavId/,
  );
  assert.doesNotMatch(workspaceSource, /function FamilyScreen/);
  assert.doesNotMatch(workspaceSource, /function FamilyBinding/);
  assert.doesNotMatch(caregiverTaskSource, /href:/);
  assert.match(caregiverWorkspaceSource, /id="family-overview"/);
  assert.match(caregiverWorkspaceSource, /id="family-progress"/);
  assert.match(caregiverWorkspaceSource, /id="family-alerts"/);
  assert.match(caregiverWorkspaceSource, /id="family-profile"/);
  assert.match(caregiverWorkspaceSource, /activeSection/);
  assert.doesNotMatch(caregiverWorkspaceSource, /aside=/);
  assert.match(taskNavigationSource, /activeNavId === item\.navId/);
  assert.match(
    taskNavigationSource,
    /aria-current=\{isActive \? "page" : undefined\}/,
  );
  assert.doesNotMatch(taskNavigationSource, /caregiverActiveTask|useState/);
  assert.doesNotMatch(taskNavigationSource, /scrollIntoView/);
  assert.doesNotMatch(caregiverTaskSource, /id:\s*"(result|game|prepare)"/);
  assert.doesNotMatch(caregiverTaskSource, /训练/);
});

test("patient profile page shows only profile authorization and caregiver scope", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientProfilePage.tsx"),
    "utf8",
  );

  for (const copy of [
    "我的资料与授权",
    "隐私授权",
    "家属授权绑定",
    "可见范围",
  ]) {
    assert.match(source, new RegExp(copy));
  }
  assert.match(source, /data-testid="patient-profile-page"/);
  assert.match(source, /年龄段/);
  assert.match(source, /function ageRangeLabel/);
  assert.doesNotMatch(source, /\$\{patient\.age\} 岁/);
  assert.doesNotMatch(
    source,
    /审计|导出|provider|runtime|manifest|授权凭证|追溯|患者档案编号/i,
  );
});

test("patient result page does not mount quality evidence export tooling", async () => {
  const workspaceSource = await readWorkspaceSource();
  const resultPageSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const evidenceSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/admin/TrainingQualityEvidenceSection.tsx",
    ),
    "utf8",
  );

  const adminOverviewSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/AdminOverviewPage.tsx"),
    "utf8",
  );

  assert.doesNotMatch(resultPageSource, /BrowserPoseEvidencePanel/);
  assert.doesNotMatch(resultPageSource, /UnityFieldEvidencePanel/);
  assert.doesNotMatch(resultPageSource, /showTechnicalEvidence/);
  assert.doesNotMatch(resultPageSource, /训练质控|审计日志 ID|evidence/i);
  assert.match(adminOverviewSource, /TrainingQualityEvidenceSection/);
  assert.match(evidenceSource, /function BrowserPoseEvidencePanel/);
  assert.match(evidenceSource, /function UnityFieldEvidencePanel/);
});

test("patient training flow avoids technical telemetry labels in the active training screen", async () => {
  const workspaceSource = await readWorkspaceSource();
  const patientWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingRuntimePage.tsx"),
    "utf8",
  );
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const browserPoseSurfaceSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
    ),
    "utf8",
  );
  const unitySurfaceSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );

  const gameScreenMarkupSource = sliceFrom(
    patientWorkspaceSource,
    'if (active === "game")',
  );
  const browserPoseGameSource = sliceBetween(
    browserPoseSurfaceSource,
    "export function BrowserPoseTrainingSurface",
    "function PatientTrainingStat",
  );
  const browserPoseMarkupSource = sliceFrom(browserPoseGameSource, "return (");
  const browserPoseVisibleCopy = visibleJsxTextAndLiteralProps(
    browserPoseMarkupSource,
  );
  const browserPoseQualitySource = sliceBetween(
    browserPoseSurfaceSource,
    "function resolveBrowserPoseQualityReasons",
    "function computeBrowserPoseCompletionRate",
  );
  const browserPoseStatsDisplaySource = sliceBetween(
    browserPoseSurfaceSource,
    "function resolveBrowserPoseGameplayStatsDisplay",
    "function formatPatientHoldProgress",
  );
  const unityGuidanceLabelSource = sliceBetween(
    unitySurfaceSource,
    "function unityPoseGuidanceStatusLabel",
    "type UnityRuntimeDescriptor",
  );
  const unityCameraPreviewSource = sliceBetween(
    unitySurfaceSource,
    "function UnityPoseCameraPreview",
    "function UnityPoseGuidanceOverlay",
  );

  const forbiddenPatientTrainingTerms =
    /采集明细|非可信来源|审计|质控|回传|待回传|异常复核|毫秒|资源清单|协议版本/i;
  const forbiddenVisibleTrainingTerms =
    /采集明细|非可信来源|审计|质控|采样帧|有效帧率|姿态帧|关键点|平均置信度|检查点|同步差|毫秒|回传|体感训练状态|配置|debug|adapter|local|dev|runtime|manifest|bridge/i;
  assert.doesNotMatch(
    runtimeSource,
    /训练监看|采集明细|回传|质控|协议版本|Unity loader|manifest|bridge|runtime|关键点|置信度/i,
  );
  assert.match(runtimeSource, /跟随提示完成训练/);
  assert.match(runtimeSource, /完成本次训练/);
  assert.doesNotMatch(
    resultSource,
    /审计|原始|导出|motionMetrics|rawPayloadHash|provider/i,
  );
  assert.match(resultSource, /返回今日训练/);
  assert.doesNotMatch(resultSource, />\s*查看记录\s*</);
  assert.doesNotMatch(gameScreenMarkupSource, forbiddenPatientTrainingTerms);
  assert.doesNotMatch(browserPoseVisibleCopy, forbiddenVisibleTrainingTerms);
  assert.doesNotMatch(
    visibleStringLiterals(browserPoseQualitySource),
    forbiddenVisibleTrainingTerms,
  );
  assert.doesNotMatch(
    visibleStringLiterals(browserPoseStatsDisplaySource),
    forbiddenVisibleTrainingTerms,
  );
  assert.doesNotMatch(
    visibleStringLiterals(browserPoseStatsDisplaySource),
    /稳定窗口|当前保持|协同窗口|偏移\/方向|平均反应|判断速度|偏离次数|触达\/漏触/,
  );
  assert.doesNotMatch(unityGuidanceLabelSource, /置信度/);
  assert.doesNotMatch(unityCameraPreviewSource, /训练监看/);
  assert.match(gameScreenMarkupSource, /训练表现/);
  assert.match(gameScreenMarkupSource, /完成本次训练/);
  assert.doesNotMatch(
    gameScreenMarkupSource,
    /训练结果记录|训练得分（0-100）|完成度（%）|训练时长（秒）|反应时间（秒）|动作准确率（%）|可提交|待填写完整/,
  );
  assert.doesNotMatch(gameScreenMarkupSource, /<FieldLine|<SelectField/);
});

test("patient facing screens hide internal evidence, confidence, and review vocabulary", async () => {
  const workspaceSource = await readWorkspaceSource();
  const unitySurfaceSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  const patientProfileSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientProfilePage.tsx"),
    "utf8",
  );
  const trainingResultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const devicePageSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/DevicePermissionCenterPage.tsx",
    ),
    "utf8",
  );
  const planSuggestionSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PlanSuggestionPage.tsx"),
    "utf8",
  );

  const deviceSource = sliceBetween(
    devicePageSource,
    "export function DevicePermissionCenterPage",
    "function DeviceConsentCard",
  );
  const poseCheckSource = sliceBetween(
    devicePageSource,
    "function PoseCheckCard",
    "function SectionLabel",
  );
  const matchSource = sliceBetween(
    planSuggestionSource,
    "export function PlanSuggestionPage",
    "function PlanRecommendation",
  );
  const unityPoseOverlaySource = sliceBetween(
    unitySurfaceSource,
    "function UnityPoseGuidanceOverlay",
    "function UnityPoseCursorOverlay",
  );
  const patientReviewLabelSource = sliceFrom(
    trainingResultSource,
    "function patientDoctorReviewStatus",
  );
  const unityGameSource = sliceBetween(
    unitySurfaceSource,
    "export function UnityTrainingSurface",
    "function UnityPoseCameraPreview",
  );
  const unityGameMarkupSource = sliceFrom(unityGameSource, "return (");
  const unityGameVisibleCopy = visibleJsxTextAndLiteralProps(
    unityGameMarkupSource,
  );

  assert.doesNotMatch(
    patientProfileSource,
    /患者档案编号|shortId\(patient\.id\)|授权凭证|追溯/,
  );
  assert.doesNotMatch(deviceSource, /审计|授权记录/);
  assert.doesNotMatch(
    devicePageSource,
    /readiness\.error|readiness\.poseError/,
  );
  assert.doesNotMatch(
    poseCheckSource,
    /运行状态|识别服务|关键点数量|平均置信度|poseModelVersion|poseLandmarkCount|poseAverageVisibility|关键点|置信度/,
  );
  assert.doesNotMatch(matchSource, /分析置信/);
  assert.doesNotMatch(
    unityPoseOverlaySource,
    /平均置信度|稳定帧|命中状态|最近发送/,
  );
  assert.doesNotMatch(
    workspaceSource,
    /function TrainingFeedbackPanel|function HistoryPanel/,
  );
  assert.doesNotMatch(
    patientReviewLabelSource,
    /确认异常|排除统计分析|人工采纳为有效|未复核/,
  );
  assert.doesNotMatch(
    unityGameVisibleCopy,
    /资源清单|协议版本|Unity loader|Unity runtime|加载失败：/i,
  );
  assert.doesNotMatch(
    unityGameVisibleCopy,
    /训练资源|资源校验|加载状态|加载中|加载失败/i,
  );
  assert.match(unityGameVisibleCopy, /正在准备训练|训练进行中|训练暂不可开始/);
});

test("patient training preparation maps raw pose errors to fixed user copy", async () => {
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );
  const prepMarkupSource = sliceFrom(prepSource, "return (");

  assert.doesNotMatch(
    prepMarkupSource,
    /readiness\.poseError|poseModelVersion|poseLandmarkCount|poseAverageVisibility|关键点|置信度/,
  );
  assert.match(prepSource, /画面不够稳定，请调整站位后重试/);
});

test("patient-facing action feedback uses user language instead of audit or session jargon", async () => {
  const workspaceSource = await readWorkspaceSource();
  const grantConsentSource = sliceBetween(
    workspaceSource,
    "async function handleGrantConsent",
    "async function handleRevokeConsent",
  );
  const revokeConsentSource = sliceBetween(
    workspaceSource,
    "async function handleRevokeConsent",
    "async function handleBindCaregiver",
  );
  const startTrainingSource = sliceBetween(
    workspaceSource,
    "async function handleStartTraining",
    "async function handleCreateGameContent",
  );

  assert.doesNotMatch(grantConsentSource, /写入审计/);
  assert.doesNotMatch(revokeConsentSource, /平台拦截|数据采集/);
  assert.doesNotMatch(startTrainingSource, /训练会话|会话创建/);
  assert.match(grantConsentSource, /授权已保存/);
  assert.match(startTrainingSource, /训练已开始/);
});

test("desensitized export validates before showing generation progress", async () => {
  const workspaceSource = await readWorkspaceSource();
  const apiSource = await readFile(
    join(rootDir, "apps/web/src/lib/api.ts"),
    "utf8",
  );
  const exportHandlerSource = sliceBetween(
    workspaceSource,
    "async function handleExportData",
    "async function handleCreateRegistrationRequest",
  );

  const payloadIndex = exportHandlerSource.indexOf(
    "buildDataExportPayload(form)",
  );
  const progressIndex = exportHandlerSource.indexOf(
    'setActionStatus("正在生成脱敏导出文件");',
  );

  assert.notEqual(payloadIndex, -1, "Export handler should validate the form.");
  assert.notEqual(progressIndex, -1, "Export handler should show progress.");
  assert.ok(
    payloadIndex < progressIndex,
    "Export handler must not show generation progress before validation passes.",
  );
  assert.doesNotMatch(
    apiSource,
    /rehab-export\.csv/,
    "Downloaded export filenames must come from the service header instead of a frontend fallback.",
  );
});

test("form actions validate synchronously before showing busy progress", async () => {
  const workspaceSource = await readWorkspaceSource();
  const actionChecks = [
    {
      handler: "handleRefreshAuditLogs",
      end: "async function handleExportData",
      validation: "validateAuditLogFilters(filters)",
      progress: 'setActionStatus("正在查询审计日志")',
    },
    {
      handler: "handleCreateRegistrationRequest",
      end: "async function handleReviewRegistrationRequest",
      validation: "buildCreateRegistrationRequestPayload(form)",
      progress: 'setActionStatus("正在提交账号开通申请")',
    },
    {
      handler: "handleCreateCaregiverAccount",
      end: "async function handleCreateAssessment",
      validation: "buildCreateCaregiverAccountPayload(form)",
      progress: 'setActionStatus("正在创建家属登录账号")',
    },
    {
      handler: "handleCreateAssessment",
      end: "async function handleCreateAd8Assessment",
      validation: "buildAssessmentSubmission({",
      progress: 'setActionStatus("正在写入结构化评估记录")',
    },
    {
      handler: "handleCreateAd8Assessment",
      end: "async function handleCreateAiAssessmentDraft",
      validation: "buildAd8AssessmentSubmission({",
      progress: 'setActionStatus("正在保存 AD-8 照护者访谈记录")',
    },
    {
      handler: "handleCreateAiAssessmentDraft",
      end: "async function handleStartAiConversation",
      validation: "const transcript = form.transcript.trim();",
      progress: 'setActionStatus("正在生成待复核评估建议")',
    },
    {
      handler: "handleCreateTtsSpeechOutput",
      end: "async function handleGrantConsent",
      validation:
        'const speechText = parseRequiredTrimmedText(text, "题目播报文本");',
      progress: 'setActionStatus("正在生成题目播报语音")',
    },
    {
      handler: "handleCreateGameContent",
      end: "async function handleUpdateGameContentStatus",
      validation: "buildGameContentCreatePayload(form)",
      progress: 'setActionStatus("正在创建训练内容")',
    },
    {
      handler: "handleUpdateUnityBuild",
      end: "async function handleCreateCollectionCondition",
      validation: "buildUnityBuildPayload(form, canPublishGames)",
      progress: 'setActionStatus("正在保存训练资源配置")',
    },
    {
      handler: "handleCreateCollectionCondition",
      end: "async function handleCreateCollectionProtocol",
      validation: "buildCollectionConditionPayload(form)",
      progress: 'setActionStatus("正在创建正式采集条件")',
    },
    {
      handler: "handleCreateCollectionProtocol",
      end: "async function handleCreateCollectionBatch",
      validation: "buildCollectionProtocolPayload(form)",
      progress: 'setActionStatus("正在创建正式采集协议")',
    },
    {
      handler: "handleCreateCollectionBatch",
      end: "async function handleSubmitTrainingResult",
      validation: "buildDoctorCollectionBatchPayload(form, data.patient, plan)",
      progress: 'setActionStatus("正在创建患者训练准备记录")',
    },
    {
      handler: "handleSubmitTrainingResult",
      end: "async function handleSubmitTrainingReview",
      validation: "validateCapturedPatientTrainingResult(",
      progress: 'setActionStatus("正在提交本次训练结果")',
    },
    {
      handler: "handleSubmitTrainingReview",
      end: "return (",
      validation: "buildDoctorTrainingReviewPayload(form)",
      progress: 'setActionStatus("正在提交训练复核结论")',
    },
  ];

  const assessmentSpeechTranscriptSource = sliceBetween(
    workspaceSource,
    "async function handleCreateAssessmentSpeechTranscript",
    "async function handleCreateSpeechAiAssessmentDraft",
  );
  const assessmentSpeechTranscriptValidationIndex =
    assessmentSpeechTranscriptSource.search(
      /^[\t ]*const speechTranscriptRequest =[\t ]*\r?\n[\t ]+await buildAssessmentSpeechTranscriptRequest\(\{/m,
    );
  const assessmentSpeechTranscriptProgressIndex =
    assessmentSpeechTranscriptSource.indexOf(
      'setActionStatus("正在上传本次评估录音并调用语音转写服务")',
    );

  assert.notEqual(
    assessmentSpeechTranscriptValidationIndex,
    -1,
    "handleCreateAssessmentSpeechTranscript should run synchronous validation or payload building.",
  );
  assert.notEqual(
    assessmentSpeechTranscriptProgressIndex,
    -1,
    "handleCreateAssessmentSpeechTranscript should still show async progress after validation.",
  );
  assert.ok(
    assessmentSpeechTranscriptValidationIndex <
      assessmentSpeechTranscriptProgressIndex,
    "handleCreateAssessmentSpeechTranscript must validate before showing busy progress.",
  );

  const speechAiAssessmentDraftSource = sliceBetween(
    workspaceSource,
    "async function handleCreateSpeechAiAssessmentDraft",
    "async function handleCreateTtsSpeechOutput",
  );
  const speechAiAssessmentDraftValidationIndex =
    speechAiAssessmentDraftSource.search(
      /^[\t ]*const speechTranscriptRequest =[\t ]*\r?\n[\t ]+await buildAssessmentSpeechTranscriptRequest\(\{/m,
    );
  const speechAiAssessmentDraftProgressIndex =
    speechAiAssessmentDraftSource.indexOf(
      'setActionStatus("正在转写评估录音，并生成待复核评估建议")',
    );

  assert.notEqual(
    speechAiAssessmentDraftValidationIndex,
    -1,
    "handleCreateSpeechAiAssessmentDraft should run synchronous validation or payload building.",
  );
  assert.notEqual(
    speechAiAssessmentDraftProgressIndex,
    -1,
    "handleCreateSpeechAiAssessmentDraft should still show async progress after validation.",
  );
  assert.ok(
    speechAiAssessmentDraftValidationIndex <
      speechAiAssessmentDraftProgressIndex,
    "handleCreateSpeechAiAssessmentDraft must validate before showing busy progress.",
  );

  for (const check of actionChecks) {
    const handlerSource = sliceBetween(
      workspaceSource,
      `async function ${check.handler}`,
      check.end,
    );
    const validationIndex = handlerSource.indexOf(check.validation);
    const progressIndex = handlerSource.indexOf(check.progress);

    assert.notEqual(
      validationIndex,
      -1,
      `${check.handler} should run synchronous validation or payload building.`,
    );
    assert.notEqual(
      progressIndex,
      -1,
      `${check.handler} should still show async progress after validation.`,
    );
    assert.ok(
      validationIndex < progressIndex,
      `${check.handler} must validate before showing busy progress.`,
    );
  }
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

async function readWorkspaceSource() {
  return readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
}

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  return source.slice(start);
}

function visibleJsxTextAndLiteralProps(source) {
  const textNodes = Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) =>
    text.trim(),
  ).filter(Boolean);
  const literalProps = Array.from(
    source.matchAll(
      /\b(?:label|title|description|aria-label)=["']([^"']+)["']/g,
    ),
    ([, text]) => text.trim(),
  ).filter(Boolean);
  const literalBranches = Array.from(
    source.matchAll(/:\s*["']([^"']+)["']/g),
    ([, text]) => text.trim(),
  ).filter(Boolean);
  return [...textNodes, ...literalProps, ...literalBranches].join("\n");
}

function visibleStringLiterals(source) {
  return Array.from(
    source.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g),
    ([, doubleQuoted, singleQuoted, templateQuoted]) =>
      doubleQuoted ?? singleQuoted ?? templateQuoted ?? "",
  )
    .filter(Boolean)
    .join("\n");
}
