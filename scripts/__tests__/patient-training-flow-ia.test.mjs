import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("patient workspace owns the patient journey without technical copy", async () => {
  const patientWorkspace = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const resultPage = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const patientNav = sliceBetween(
    roleNavigation,
    "patientTaskNavItems",
    "doctorNavItems",
  );

  assert.match(patientWorkspace, /data-testid="patient-primary-workspace"/);
  for (const entry of ["今日", "训练", "记录", "我的"]) {
    assert.match(patientWorkspace + patientNav, new RegExp(entry));
  }
  assert.match(patientWorkspace, /今日训练/);
  assert.match(patientWorkspace, /训练准备/);
  assert.match(patientWorkspace, /训练结果/);
  assert.match(patientWorkspace, /我的资料与授权/);
  assert.match(patientWorkspace, /TodayTrainingPage/);
  assert.match(patientWorkspace, /TrainingPrepChecklist/);
  assert.match(patientWorkspace, /PatientTrainingSessionPage/);
  assert.match(patientWorkspace, /TrainingResultPage/);
  assert.doesNotMatch(resultPage, /GameLibraryPage|方案游戏库/);
  assert.match(patientWorkspace, /PatientProfilePage/);
  assert.doesNotMatch(
    patientWorkspace,
    /Provider|Endpoint|manifest|runtimeType|审计|导出|质量证据|技术验收|演示|fallback|mock|demo/i,
  );
});

test("patient training flow is task-first and hides game engine metadata", async () => {
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );

  assert.match(todaySource, /今日训练/);
  assert.match(todaySource, /data-testid="patient-next-action"/);
  assert.doesNotMatch(todaySource, /data-testid="patient-today-primary-cta"/);
  assert.match(todaySource, /等待医生下发训练安排/);
  assert.match(todaySource, /下一项训练/);
  assert.match(todaySource, /开始训练准备/);
  assert.match(todaySource, /查看今日训练记录/);
  assert.match(todaySource, /completedPlanItemIds/);
  assert.match(todaySource, /nextTask/);
  assert.doesNotMatch(todaySource, /<TrainingTaskPicker/);
  assert.doesNotMatch(todaySource, /items=\{tasks\}/);
  assert.doesNotMatch(todaySource, /selectedPlanItem/);
  assert.doesNotMatch(todaySource, /onSelectPlanItem/);
  assert.doesNotMatch(todaySource, /今日进度|completionPercent|uppercase/);
  assert.doesNotMatch(todaySource, /训练积分与进展|当前积分|已解锁|最近奖励/);
  assert.doesNotMatch(
    todaySource,
    /RewardProgressPanel|MetricTile|RewardSummaryResponse|能力展示|积分|成就/,
  );
  assert.doesNotMatch(todaySource, /今日训练已完成[\s\S]{0,160}disabled/);
  assert.doesNotMatch(
    todaySource,
    /engine:|license:|sensing:|mediapipe|phaser_canvas|\bMIT\b/i,
  );
});

test("patient task picker uses compact rows and patient-safe tags", async () => {
  const taskPickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );
  const copySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-copy.ts"),
    "utf8",
  );
  const combined = taskPickerSource + copySource;

  assert.match(taskPickerSource, /patientTrainingTagsLabel/);
  assert.match(taskPickerSource, /patientTrainingCategoryLabel/);
  assert.match(taskPickerSource, /patientTrainingDifficultyLabel/);
  assert.match(
    taskPickerSource,
    /done \? `查看训练记录：\$\{task\.gameContent\.name\}` : `选择训练：\$\{task\.gameContent\.name\}`/,
  );
  assert.match(combined, /思维训练/);
  assert.match(combined, /运动训练/);
  assert.match(taskPickerSource, /查看今日训练记录|查看结果/);
  assert.doesNotMatch(taskPickerSource, /trainingTagsLabel/);
  assert.doesNotMatch(taskPickerSource, /runtimeType|engine|manifest/);
  assert.doesNotMatch(taskPickerSource, /min-h-\[168px\]/);
  assert.doesNotMatch(taskPickerSource, /disabled=\{done\}/);
});

test("patient difficulty copy is explicit and never passes raw config codes through", async () => {
  const copySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-copy.ts"),
    "utf8",
  );
  const pickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );

  for (const difficulty of [
    "standard",
    "基础",
    "三步序列",
    "双色分拣",
    "慢节律",
    "左右节拍",
    "重心转移",
    "四点光轨",
    "三步路径",
  ]) {
    assert.match(copySource, new RegExp(escapeRegExp(difficulty)));
  }

  assert.match(copySource, /return null/);
  assert.doesNotMatch(copySource, /return mapped \?\? normalized/);
  assert.doesNotMatch(copySource, /return mapped \|\| normalized/);
  assert.doesNotMatch(pickerSource + todaySource, /难度 \{task\.difficulty\}/);
  assert.doesNotMatch(todaySource, /\$\{focusTask\.difficulty\}/);
});

test("patient prep screen renders as an ordered three-step checklist", async () => {
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  for (const step of ["训练安排", "摄像头", "站位"]) {
    assert.match(prepSource, new RegExp(step));
  }
  assert.match(prepSource, /resolveTrainingStartReadiness/);
  assert.match(
    prepSource,
    /disabled=\{!startReadiness\.canStart \|\| isBusy\}/,
  );
  assert.doesNotMatch(prepSource, /aria-disabled/);
  assert.doesNotMatch(prepSource, /if \(!startReadiness\.canStart\) return/);
  assert.match(prepSource, /requiresCameraCheck \?/);
  assert.match(prepSource, /检测摄像头/);
  assert.match(prepSource, /站位检查/);
  assert.doesNotMatch(
    prepSource,
    /<ScreenGrid|采集批次|采集协议|质量门禁|qualityGate|collection|protocol|runtime|manifest|uppercase/i,
  );
  assert.doesNotMatch(prepSource, /fallback|mock|demo/i);
});

test("patient prep start guards use patient-safe camera authorization copy", async () => {
  const pageSource = await readWorkspaceSource();
  const prepEntrySource = sliceBetween(
    pageSource,
    "function handleEnterTrainingPrep",
    "async function handleRefreshTrainingPreparation",
  );
  const startSource = sliceBetween(
    pageSource,
    "async function handleStartTraining",
    'startBusyAction("startTraining")',
  );

  assert.match(prepEntrySource + startSource, /摄像头授权/);
  assert.doesNotMatch(prepEntrySource, /采集授权|体感采集授权/);
  assert.doesNotMatch(startSource, /采集授权|体感采集授权/);
});

test("patient prep status copy only asks for camera checks when required", async () => {
  const pageSource = await readWorkspaceSource();
  const prepEntrySource = sliceBetween(
    pageSource,
    "function handleEnterTrainingPrep",
    "async function handleRefreshTrainingPreparation",
  );
  const refreshSource = sliceBetween(
    pageSource,
    "async function handleRefreshTrainingPreparation",
    "async function handleCheckTrainingDevice",
  );
  const patientWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const prepComponentSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  assert.match(prepEntrySource, /requiresCamera/);
  assert.match(refreshSource, /selectedPlanItem/);
  assert.match(
    refreshSource,
    /planItemOverride\?:\s*RehabPlan\["items"\]\[number\]/,
  );
  assert.match(
    prepEntrySource,
    /handleRefreshTrainingPreparation\(planItemForPrep\)/,
  );
  assert.match(
    patientWorkspaceSource,
    /onRefreshTrainingPreparation:\s*\(planItem\?:\s*TrainingTask\) => Promise<void>/,
  );
  assert.match(
    patientWorkspaceSource,
    /onRefreshTrainingPreparation\(selectedPlanItem\)/,
  );
  assert.match(
    prepComponentSource,
    /onRefreshTrainingPreparation:\s*\(planItem\?:\s*TrainingTask\) => Promise<void>/,
  );
  assert.match(prepComponentSource, /onRefreshTrainingPreparation\(planItem\)/);
  assert.match(refreshSource, /resolveTrainingPrepCameraRequirement/);
  assert.doesNotMatch(
    prepEntrySource,
    /setActionStatus\("请先完成摄像头设备检测，再创建训练记录。"\)/,
  );
  assert.doesNotMatch(
    refreshSource,
    /setActionStatus\("训练安排已同步，请继续完成摄像头和动作识别检查。"\)/,
  );
});

test("patient workspace screens are constrained to the patient role", async () => {
  const pageSource = await readWorkspaceSource();
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const patientWorkspaceRenderSource = sliceBetween(
    pageSource,
    '{primaryRole === "patient" && isPatientWorkspaceScreen(active) && (',
    '{active === "device" && (',
  );
  const doctorNavSource = sliceBetween(
    roleNavigation,
    "doctorNavItems",
    "adminNavItems",
  );

  assert.match(
    doctorNavSource,
    /id:\s*"trainingReview"[\s\S]*screenId:\s*"result"/,
  );
  assert.match(patientWorkspaceRenderSource, /<PatientWorkspacePage/);
  assert.match(patientWorkspaceRenderSource, /active=\{active\}/);
  assert.doesNotMatch(
    pageSource,
    /\{isPatientWorkspaceScreen\(active\) && \(/,
    "doctor result navigation must not be intercepted by the patient workspace",
  );
});

test("doctor training review result route renders the doctor workspace", async () => {
  const pageSource = await readWorkspaceSource();
  const doctorRenderSource = sliceBetween(
    pageSource,
    '{primaryRole === "doctor" &&',
    '{active === "plan" && primaryRole !== "doctor" && (',
  );

  assert.match(doctorRenderSource, /<DoctorWorkspaceContainer/);
  assert.match(
    doctorRenderSource,
    /trainingRecords=\{visibleTrainingRecords\}/,
  );
  assert.match(
    doctorRenderSource,
    /isReviewingTraining=\{busyActions\.has\("reviewTraining"\)\}/,
  );
});

test("patient camera and pose check actions are guarded by camera requirement", async () => {
  const pageSource = await readWorkspaceSource();
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );
  const deviceCheckSource = sliceBetween(
    pageSource,
    "async function handleCheckTrainingDevice",
    "async function handleCheckPoseReadiness",
  );
  const poseCheckSource = sliceBetween(
    pageSource,
    "async function handleCheckPoseReadiness",
    "async function handleStartTraining",
  );

  assert.match(prepSource, /requiresCameraCheck \?/);
  assert.match(prepSource, /onCheckDevice/);
  assert.match(prepSource, /onCheckPose/);
  assert.match(deviceCheckSource, /selectedPlanItem/);
  assert.match(deviceCheckSource, /resolveTrainingPrepCameraRequirement/);
  assert.match(poseCheckSource, /selectedPlanItem/);
  assert.match(poseCheckSource, /resolveTrainingPrepCameraRequirement/);
});

test("patient prep camera requirement is stable outside render", async () => {
  const pageSource = await readWorkspaceSource();
  const readinessSource = await readFile(
    join(rootDir, "apps/web/src/lib/formal-training-content-readiness.ts"),
    "utf8",
  );
  const patientWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const prepScreenSource = sliceBetween(
    patientWorkspaceSource,
    'if (active === "prep")',
    'if (active === "game")',
  );
  const prepEntrySource = sliceBetween(
    pageSource,
    "function handleEnterTrainingPrep",
    "async function handleRefreshTrainingPreparation",
  );
  const refreshSource = sliceBetween(
    pageSource,
    "async function handleRefreshTrainingPreparation",
    "async function handleCheckTrainingDevice",
  );
  const deviceCheckSource = sliceBetween(
    pageSource,
    "async function handleCheckTrainingDevice",
    "async function handleCheckPoseReadiness",
  );
  const poseCheckSource = sliceBetween(
    pageSource,
    "async function handleCheckPoseReadiness",
    "async function handleStartTraining",
  );
  const adminPayloadSource = await readFile(
    join(rootDir, "apps/web/src/features/admin/admin-payload-builders.ts"),
    "utf8",
  );
  const unityBuildSource = sliceBetween(
    adminPayloadSource,
    "function buildUnityBuildPayload",
    "function buildCollectionConditionPayload",
  );

  assert.match(
    readinessSource,
    /export function resolveTrainingPrepCameraRequirement/,
  );
  assert.match(readinessSource, /export type TrainingPrepCameraRequirement/);
  assert.match(prepEntrySource, /resolveTrainingPrepCameraRequirement/);
  assert.match(refreshSource, /resolveTrainingPrepCameraRequirement/);
  assert.match(deviceCheckSource, /resolveTrainingPrepCameraRequirement/);
  assert.match(poseCheckSource, /resolveTrainingPrepCameraRequirement/);
  assert.doesNotMatch(prepScreenSource, /trainingRuntimeRequiresCamera/);
  assert.match(unityBuildSource, /assertFormalRuntimeCameraConfiguration/);
});

test("patient runtime keeps one primary action region", async () => {
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingRuntimePage.tsx"),
    "utf8",
  );

  assert.match(runtimeSource, /data-testid="patient-training-primary-action"/);
  assert.match(runtimeSource, /完成本次训练/);
  assert.doesNotMatch(runtimeSource, /data-training-session-id/);
  assert.doesNotMatch(runtimeSource, /<FieldLine|<SelectField/);
  assert.doesNotMatch(runtimeSource, /审计|质控|回传|manifest|loader/i);
});

test("patient assessment entry stays secondary and hides speech AI implementation copy", async () => {
  const assessmentSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
  const visibleCopy = visibleJsxTextAndLiteralProps(assessmentSource);

  assert.match(assessmentSource, /认知评估/);
  assert.doesNotMatch(
    visibleCopy,
    /onCreateAssessmentSpeechTranscript|onCreateTtsSpeechOutput|onCreateAiAssessmentDraft/,
  );
  assert.doesNotMatch(
    visibleCopy,
    /平台语音转写|平台语音播报服务|统一流程处理|语音输入、题目播报/i,
  );
});

test("patient assessment summary does not fake doctor confirmation", async () => {
  const assessmentSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
  const summarySource = sliceBetween(
    assessmentSource,
    "function PatientAssessmentSummaryScreen",
    "function AiConversationPanel",
  );

  assert.match(summarySource, /assessmentDoctorConfirmationStatus/);
  assert.match(summarySource, /待医生确认/);
  assert.match(summarySource, /医生已确认/);
  assert.match(summarySource, /risk\.confirmedAt \|\| risk\.confirmedById/);
  assert.match(summarySource, /assessmentStatus\.isConfirmed && latestAd8/);
  assert.doesNotMatch(summarySource, /latestAssessment \? "评估已完成"/);
  assert.doesNotMatch(
    summarySource,
    /status=\{latestAssessment \? "complete" : "pending"\}/,
  );
});

test("patient result page has one clear primary action", async () => {
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const buttonCount = (resultSource.match(/<Button\b/g) ?? []).length;

  assert.equal(buttonCount, 1);
  assert.match(resultSource, /返回今日训练|查看记录/);
  assert.match(resultSource, /近期趋势/);
  assert.doesNotMatch(
    resultSource,
    /方案游戏库|<GameLibraryPage|能力展示|demo|mock|fallback/i,
  );
  assert.doesNotMatch(
    resultSource,
    /MetricTile|rawPayload|motionMetrics|collectionBatchId|audit|provider/i,
  );
});

test("patient result page avoids exact runtime metric readouts", async () => {
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );
  const visibleCopy = visibleJsxTextAndLiteralProps(resultSource);

  assert.match(resultSource, /医生状态/);
  assert.match(resultSource, /patientDoctorReviewStatus/);
  assert.doesNotMatch(
    visibleCopy,
    /本次得分|训练得分|反应时间|平均反应用时|动作表现|训练时长|运动强度|平均动作表现|平均完成度/,
  );
  assert.doesNotMatch(
    resultSource,
    /result\.score|result\.motionAccuracy|result\.reactionTimeMs|result\.durationSeconds|result\.exerciseIntensity/,
  );
});

test("patient runtime result boundary submits the captured formal payload", async () => {
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingRuntimePage.tsx"),
    "utf8",
  );
  const resultBoundarySource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/patient-training-result-boundary.ts",
    ),
    "utf8",
  );
  const formStateSource = sliceBetween(
    runtimeSource,
    "export type PatientTrainingResultDraft",
    "type PatientTrainingSessionPageProps",
  );
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
    "utf8",
  );
  const roleWorkspaceSource = await readWorkspaceSource();
  const submitSource = sliceBetween(
    roleWorkspaceSource,
    "async function handleSubmitTrainingResult",
    "async function handleSubmitTrainingReview",
  );

  assert.match(formStateSource, /payload:\s*SubmitTrainingResultRequest/);
  assert.match(resultBoundarySource, /validateCapturedPatientTrainingResult/);
  assert.match(resultBoundarySource, /payload\.metricsSummary/);
  assert.match(resultBoundarySource, /payload\.motionMetrics/);
  assert.match(
    workspaceSource,
    /onTrainingResultReady=\{onTrainingResultReady\}/,
  );
  assert.match(workspaceSource, /onSubmitResult\(\)/);
  assert.match(submitSource, /trainingResultDraft\?\.payload/);
  assert.match(submitSource, /validateCapturedPatientTrainingResult/);
  assert.match(submitSource, /payload,\s*\)/);
  assert.doesNotMatch(
    runtimeSource,
    /metricsSummary:\s*string|motionMetrics:\s*string/,
  );
  assert.doesNotMatch(
    workspaceSource,
    /applyPatientTrainingResultDraft|onTrainingResultFormChange|trainingResultForm/,
  );
  assert.doesNotMatch(
    submitSource,
    /buildTrainingResultPayload\(|form,\s*activePlanItem\.gameContent\.runtimeType/,
  );
});

test("patient training result boundary validates captured numeric payload and sample counts", async () => {
  const resultBoundarySource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/patient-training-result-boundary.ts",
    ),
    "utf8",
  );

  assert.match(
    resultBoundarySource,
    /export function validateCapturedPatientTrainingResult/,
  );
  assert.match(resultBoundarySource, /assertFiniteNumber\(payload\.score/);
  assert.match(
    resultBoundarySource,
    /assertNumberRange\(payload\.score,\s*0,\s*100/,
  );
  assert.match(
    resultBoundarySource,
    /assertNumberRange\(payload\.completionRate,\s*0,\s*1/,
  );
  assert.match(resultBoundarySource, /Number\.isInteger\(sampleCount\)/);
  assert.match(
    resultBoundarySource,
    /throw new Error\(patientResultIncompleteMessage\)/,
  );
  assert.doesNotMatch(
    resultBoundarySource,
    /parseRequiredNumber|parseJson|JSON\.parse|metricsSummary:\s*string|motionMetrics:\s*string/,
  );
  assert.doesNotMatch(resultBoundarySource, /Math\.round\(sampleCount\)/);
});

test("patient visible training screens use design tokens instead of raw colors", async () => {
  for (const path of [
    "apps/web/src/features/patient/TodayTrainingPage.tsx",
    "apps/web/src/features/patient/TrainingTaskPicker.tsx",
    "apps/web/src/features/patient/TrainingPrepChecklist.tsx",
    "apps/web/src/features/patient/TrainingRuntimePage.tsx",
    "apps/web/src/features/patient/TrainingResultPage.tsx",
    "apps/web/src/features/patient/PatientProfilePage.tsx",
    "apps/web/src/features/patient/GameLibraryPage.tsx",
    "apps/web/src/features/patient/AssessmentDialoguePage.tsx",
    "apps/web/src/features/patient/PatientHomeNav.tsx",
  ]) {
    const source = await readFile(join(rootDir, path), "utf8");
    assert.doesNotMatch(
      source,
      /#[0-9a-fA-F]{3,8}|rgba\(/,
      `raw color leaks in ${path}`,
    );
    assert.doesNotMatch(
      source,
      /--brand-primary|--brand-primary-strong|--brand-soft|--ink-primary|--ink-secondary|--ink-muted/,
      `legacy token leaks in ${path}`,
    );
    assert.doesNotMatch(
      source,
      /rounded-2xl|rounded-3xl|backdrop-blur|\b(?:bg|text|border)-white(?:\b|\/)|text-emerald-|bg-amber-|border-amber-|text-amber-/,
      `old visual utility leaks in ${path}`,
    );
    assert.doesNotMatch(
      source,
      /linear-gradient\([^)]*#[0-9a-fA-F]{3,8}/,
      `raw gradient leaks in ${path}`,
    );
  }
});

test("patient start handler keeps real formal preparation and API ordering", async () => {
  const pageSource = await readWorkspaceSource();
  const startSource = sliceBetween(
    pageSource,
    "async function handleStartTraining",
    "async function handleResumeTraining",
  );
  const preparationGuardIndex = startSource.indexOf(
    "if (!preparedCollectionBatch)",
  );
  const startBusyIndex = startSource.indexOf(
    'startBusyAction("startTraining")',
  );
  const apiIndex = startSource.indexOf("await startTrainingSession({");
  const finishBusyIndex = startSource.indexOf(
    'finishBusyAction("startTraining")',
  );

  assert.notEqual(
    preparationGuardIndex,
    -1,
    "start must guard formal preparation",
  );
  assert.notEqual(
    startBusyIndex,
    -1,
    "start should only show busy after guards",
  );
  assert.notEqual(
    apiIndex,
    -1,
    "start must call the real startTrainingSession helper",
  );
  assert.notEqual(
    finishBusyIndex,
    -1,
    "start must clear busy state after the API lifecycle",
  );
  assert.ok(
    preparationGuardIndex < startBusyIndex,
    "formal preparation guard must run before busy state",
  );
  assert.ok(
    startBusyIndex < apiIndex,
    "busy state must start before the API call",
  );
  assert.ok(
    preparationGuardIndex < apiIndex,
    "formal preparation guard must run before API start",
  );
  assert.ok(
    apiIndex < finishBusyIndex,
    "busy state must finish after the API call",
  );
  assert.match(startSource, /collectionBatch:\s*preparedCollectionBatch/);
  assert.doesNotMatch(
    startSource,
    /localStorage|sessionStorage|Math\.random|fixedScore|manualResult|fake|fallback|mock|demo/i,
  );
});

test("every training-ready patient runtime has a real patient training stage", async () => {
  const pageSource = await readWorkspaceSource();
  const stageFileSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx",
    ),
    "utf8",
  );
  const readinessSource = await readFile(
    join(rootDir, "apps/web/src/lib/formal-training-content-readiness.ts"),
    "utf8",
  );
  const readySource = sliceBetween(
    readinessSource,
    "export function isGameReadyForTraining",
    "export type FormalRuntimeCameraConfiguration",
  );
  const stageSource = sliceBetween(
    stageFileSource,
    "export function PatientTrainingRuntimeStage",
    "function TrainingRuntimeUnavailable",
  );

  assert.match(readySource, /browser_pose_canvas/);
  assert.match(readySource, /unity_webgl/);
  assert.match(readySource, /cognitive_web/);
  assert.match(pageSource, /<PatientTrainingRuntimeStage/);
  assert.match(stageSource, /runtimeType === "browser_pose_canvas"/);
  assert.match(stageSource, /runtimeType === "unity_webgl"/);
  assert.match(stageSource, /runtimeType === "cognitive_web"/);
  assert.match(stageSource, /<CognitiveTrainingSurface/);
  const cognitiveStageSource = sliceBetween(
    stageSource,
    'runtimeType === "cognitive_web"',
    "return <TrainingRuntimeUnavailable",
  );
  assert.doesNotMatch(cognitiveStageSource, /TrainingRuntimeUnavailable/);
});

test("patient training errors are sanitized on patient start and submit paths", async () => {
  const pageSource = await readWorkspaceSource();
  const actionStatusSource = await readFile(
    join(rootDir, "apps/web/src/features/session/action-status.ts"),
    "utf8",
  );
  const requestErrorSource = sliceBetween(
    pageSource,
    "function handleRequestError",
    "function handleRoleNavigationChange",
  );
  const deviceCheckSource = sliceBetween(
    pageSource,
    "async function handleCheckTrainingDevice",
    "async function handleCheckPoseReadiness",
  );
  const poseCheckSource = sliceBetween(
    pageSource,
    "async function handleCheckPoseReadiness",
    "async function handleStartTraining",
  );
  const startSource = sliceBetween(
    pageSource,
    "async function handleStartTraining",
    "async function handleResumeTraining",
  );
  const submitSource = sliceBetween(
    pageSource,
    "async function handleSubmitTrainingResult",
    "async function handleSubmitTrainingReview",
  );
  const patientSanitizerSource = sliceBetween(
    actionStatusSource,
    "export function patientSafeTrainingActionErrorMessage",
    "\n}",
  );

  assert.match(
    requestErrorSource,
    /extractErrorMessage\(error, defaultMessage\)/,
  );
  assert.match(deviceCheckSource, /摄像头设备已确认/);
  assert.match(
    deviceCheckSource,
    /patientSafeTrainingActionErrorMessage\(\s*error,\s*"摄像头检测失败",?\s*\)/,
  );
  assert.match(
    poseCheckSource,
    /patientSafeTrainingActionErrorMessage\(\s*error,\s*"站位检查失败",?\s*\)/,
  );
  assert.doesNotMatch(
    deviceCheckSource + poseCheckSource,
    /error\.message|cameraLabel \?\? readiness\.cameraDeviceId/,
  );
  assert.match(
    startSource,
    /patientSafeTrainingActionErrorMessage\(\s*error,\s*"训练开始失败",?\s*\)/,
  );
  assert.match(
    submitSource,
    /patientSafeTrainingActionErrorMessage\(\s*error,\s*"训练结果提交失败",?\s*\)/,
  );
  assert.doesNotMatch(
    startSource + submitSource,
    /handleRequestError\(error, "训练(?:开始|结果提交)失败"\)/,
  );
  assert.match(
    patientSanitizerSource,
    /训练暂时无法完成，请稍后重试或联系医师。/,
  );
  assert.doesNotMatch(
    visibleStringLiterals(patientSanitizerSource),
    /运行批次|游戏版本|数据指纹|rawPayload|runtimeType|collectionBatchId|protocolVersion|wasm|mediapipe|cdn|stack/,
  );
});

test("patient result copy never displays raw enum values", async () => {
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );

  assert.match(resultSource, /patientDoctorReviewStatus/);
  assert.doesNotMatch(resultSource, /exerciseIntensity/);
  assert.doesNotMatch(resultSource, /return value;/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
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

async function readWorkspaceSource() {
  return readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
}
