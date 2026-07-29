import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("assessment screen exposes a real speech-to-AI draft flow without formal auto-submit", async () => {
  const workspaceSource = await readWorkspaceSource();
  const assessmentSource = await readAssessmentSource();
  const combinedSource = `${workspaceSource}\n${assessmentSource}`;

  assert.match(workspaceSource, /applySpeechAiAssessmentDraftToForm/);
  assert.match(workspaceSource, /"speechAiAssessmentDraft"/);
  assert.match(assessmentSource, /onCreateSpeechAiAssessmentDraft/);
  assert.match(assessmentSource, /handleStopSpeechRecordingAndCreateDraft/);
  assert.match(
    workspaceSource,
    /const transcribedForm = applyAssessmentSpeechTranscriptToForm/,
  );
  assert.match(workspaceSource, /transcript: transcribedForm\.transcript/);
  assert.match(assessmentSource, /AssessmentProgressPanel/);
  assert.match(assessmentSource, /智能评估进度/);
  assert.match(assessmentSource, /语音识别状态/);
  assert.match(assessmentSource, /智能建议状态/);
  assert.match(assessmentSource, /医生复核状态/);
  assert.match(
    combinedSource,
    /rawInputSummary|audio\.contentBase64|requestBody|responseBody/,
  );
  assert.match(assessmentSource, /停止转写并生成评估建议/);
  assert.match(assessmentSource, /生成待复核评估建议/);
  assert.match(
    workspaceSource,
    /语音转写和评估建议已填入表单，请医生复核后再正式提交。/,
  );
  assert.match(
    workspaceSource,
    /const nextForm = applySpeechAiAssessmentDraftToForm/,
  );
  assert.match(workspaceSource, /setAssessmentForm\(nextForm\)/);
  const patientAssessmentPanel = sliceBetween(
    assessmentSource,
    "function AssessmentProgressPanel",
    "function ProgressStatusCard",
  );
  assert.doesNotMatch(
    patientAssessmentPanel,
    /Provider|Model|Call ID|Source|Endpoint|Prompt|Human Review/,
  );
  assert.doesNotMatch(
    workspaceSource,
    /setAssessmentForm\(\(current\)\s*=>\s*applySpeechAiAssessmentDraftToForm\(current, transcript, draft\)/,
  );
  assert.doesNotMatch(
    combinedSource,
    /onCreateSpeechAiAssessmentDraft\(recording\);\s*await onCreateAssessment/,
  );
});

test("patient assessment dialogue feature uses platform STT and TTS without browser fallback", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
  const workspaceSource = await readWorkspaceSource();

  for (const copy of [
    "我需要使用轮椅",
    "我上肢活动不便",
    "语音输入",
    "播放题目语音",
    "待医生确认",
  ]) {
    assert.match(source, new RegExp(copy));
  }
  assert.match(source, /voiceInput/);
  assert.match(source, /onStopTranscript/);
  assert.match(source, /onStopTranscriptAndDraft/);
  assert.match(
    workspaceSource,
    /onCreateAssessmentSpeechTranscript=\{\s*handleCreateAssessmentSpeechTranscript\s*\}/,
  );
  assert.match(
    workspaceSource,
    /onCreateSpeechAiAssessmentDraft=\{\s*handleCreateSpeechAiAssessmentDraft\s*\}/,
  );
  assert.match(source, /onCreateTtsSpeechOutput/);
  assert.match(source, /onCreateAiAssessmentDraft/);
  assert.doesNotMatch(
    source + workspaceSource,
    /speechSynthesis|webkitSpeechRecognition|fixed transcript|fallback|mock|demo/i,
  );
});

test("doctor assessment review feature exposes structured evidence before approval", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/doctor/AssessmentReviewPanel.tsx"),
    "utf8",
  );

  for (const copy of [
    "MMSE",
    "CDR",
    "AD-8",
    "评估摘要",
    "医生结论",
    "待医生确认",
    "批准正式评估",
    "退回复核",
  ]) {
    assert.match(source, new RegExp(copy));
  }
  assert.doesNotMatch(
    source,
    /provider|modelVersion|callId|promptVersion|calledAt|服务方|模型|调用编号|提示词版本|Endpoint|endpointRef|raw request|raw response|audioBase64|contentBase64|fallback|mock|demo/i,
  );
});

test("manual AI assessment draft success clears stale failure service status", async () => {
  const pageSource = await readWorkspaceSource();
  const busyDispatcherSource = sliceBetween(
    pageSource,
    "const startBusyAction",
    "const setActive",
  );
  const draftHandlerSource = sliceBetween(
    pageSource,
    "async function handleCreateAiAssessmentDraft",
    "async function handleStartAiConversation",
  );

  assert.match(
    busyDispatcherSource,
    /setBusyActions\(\(current\) => updateBusyActions\(current, action, true\)\)/,
  );
  assert.match(
    busyDispatcherSource,
    /setBusyActions\(\(current\) => updateBusyActions\(current, action, false\)\)/,
  );
  assert.match(draftHandlerSource, /startBusyAction\("aiAssessmentDraft"\)/);
  assert.match(draftHandlerSource, /setDataError\(null\)/);
  assert.match(draftHandlerSource, /setDataStatus\("待复核评估建议已生成"\)/);
  assert.match(
    draftHandlerSource,
    /待复核评估建议已填入表单，请由医生复核分数、摘要和置信度后再正式提交。/,
  );
  assert.match(
    draftHandlerSource,
    /finally \{\s*if \(isRoleActionIdentityCurrent\(actionIdentity\)\) \{\s*finishBusyAction\("aiAssessmentDraft"\)/,
  );
});

test("main shell uses role workbench navigation instead of demo page switching", async () => {
  const shellSource = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const navigationSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const workspaceSource = await readWorkspaceSource();
  const pageSource =
    shellSource + "\n" + navigationSource + "\n" + workspaceSource;

  assert.match(pageSource, /function AppNavigation/);
  assert.match(pageSource, /function isPatientLikeRole/);
  assert.match(pageSource, /function PatientTaskNavigation/);
  assert.match(pageSource, /data-testid="app-nav"/);
  assert.match(pageSource, /data-testid="patient-task-nav"/);
  assert.match(pageSource, /buildNavigationSections/);
  assert.match(pageSource, /工作台导航/);
  assert.match(pageSource, /患者任务导航/);
  assert.match(pageSource, /!patientLikeShell \?\s*\(\s*<AppNavigation/);
  for (const patientTask of ["今日", "训练", "记录", "我的"]) {
    assert.match(pageSource, new RegExp(patientTask));
  }
  for (const doctorNav of [
    /id: "doctor", label: "患者"/,
    /id: "assessmentReview", label: "评估"/,
    /id: "planManagement",\s*label: "计划"/,
    /id: "trainingReview", label: "复核"/,
  ]) {
    assert.match(navigationSource, doctorNav);
  }
  for (const governanceNav of ["账号", "内容", "配置", "审计"]) {
    assert.match(navigationSource, new RegExp(`label: "${governanceNav}"`));
  }
  assert.match(
    pageSource,
    /patientLikeShell && role \?\s*\(\s*<PatientTaskNavigation/,
  );
  assert.doesNotMatch(pageSource, /patientLikeShell\s*\?\s*<AppNavigation/);
  assert.doesNotMatch(pageSource, /patient:\s*\[\s*"login"/);
  assert.doesNotMatch(pageSource, /doctor:\s*\[\s*"login"/);
  assert.doesNotMatch(pageSource, /admin:\s*\[\s*"login"/);
  assert.doesNotMatch(pageSource, /caregiver:\s*\[\s*"login"/);
});

test("main shell surfaces business status instead of raw demo service status", async () => {
  const pageSource = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );

  assert.match(pageSource, /actionStatus/);
  assert.match(pageSource, /dataError/);
  assert.match(pageSource, /headerMeta/);
  assert.match(pageSource, /请使用机构分配的账号登录/);
  assert.doesNotMatch(
    pageSource,
    /<p className="text-xs font-black uppercase text-\[#25859a\]">\s*服务状态\s*<\/p>/,
  );
  assert.doesNotMatch(
    pageSource,
    /平台服务|资料更新|当前进度|Provider|Endpoint|runtime manifest|implementation status|fallback|mock|demo/i,
  );
});

test("assessment screen contains a formal AD-8 caregiver interview workflow", async () => {
  const workspaceSource = await readWorkspaceSource();
  const assessmentSource = await readAssessmentSource();

  assert.match(assessmentSource, /Ad8AssessmentPanel/);
  assert.match(assessmentSource, /AD-8照护者访谈/);
  assert.match(workspaceSource, /buildAd8AssessmentSubmission/);
  assert.match(assessmentSource, /isAd8AssessmentSubmissionFormComplete/);
  assert.match(workspaceSource, /handleCreateAd8Assessment/);
  assert.match(assessmentSource, /itemMemoryProblems/);
  assert.match(assessmentSource, /itemDailyThinkingMemoryProblems/);
  assert.match(assessmentSource, /医生复核后保存 AD-8 正式筛查记录/);
});

test("patient and caregiver facing copy avoids technical implementation details", async () => {
  const assessmentSource = await readAssessmentSource();

  const patientAssessmentSource = sliceBetween(
    assessmentSource,
    "function AssessmentInputPanel",
    "function ProgressStatusCard",
  );
  assert.doesNotMatch(
    patientAssessmentSource,
    /供应商|模型信息|调用记录|Provider|Call ID|Endpoint|Prompt/,
  );

  const patientTrainingSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingRuntimePage.tsx"),
    "utf8",
  );
  assert.doesNotMatch(
    patientTrainingSource,
    /查看数据明细|结果摘要原文|采集明细原文|非可信来源|超范围数值|最近采集状态/,
  );

  const familySource = await readCaregiverSources();
  assert.doesNotMatch(
    familySource,
    /原始评估|完整病历|评估对话|可编辑|方案修改/,
  );
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

async function readAssessmentSource() {
  return readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
}

async function readCaregiverSources() {
  const files = [
    "apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx",
    "apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx",
    "apps/web/src/features/caregiver/CaregiverProgressPanel.tsx",
    "apps/web/src/features/caregiver/CaregiverReminderPanel.tsx",
    "apps/web/src/features/caregiver/CaregiverScopePanel.tsx",
    "apps/web/src/features/caregiver/caregiver-workspace-model.ts",
  ];
  const sources = await Promise.all(
    files.map((path) => readFile(join(rootDir, path), "utf8")),
  );
  return sources.join("\n");
}
