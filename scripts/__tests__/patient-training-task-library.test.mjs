import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patientTrainingCategoryLabel,
  patientTrainingPurposeLabel,
} from "../../apps/web/src/features/patient/patient-training-copy.ts";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("patient training category and purpose helpers map only business labels", () => {
  assert.equal(
    patientTrainingCategoryLabel(["思维训练", "memory", "purpose:risk_assessment"]),
    "思维训练",
  );
  assert.equal(
    patientTrainingCategoryLabel(["运动训练", "upper_limb", "purpose:data_capture"]),
    "运动训练",
  );
  assert.deepEqual(
    patientTrainingPurposeLabel([
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
    ]),
    ["风险评估辅助", "干预训练"],
  );
  assert.deepEqual(patientTrainingPurposeLabel(["purpose:data_capture", "数据采集"]), []);
  assert.deepEqual(patientTrainingPurposeLabel(["unknown-purpose"]), []);
});

test("patient today training shows only the next plan item before prep", async () => {
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  const taskPickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  assert.match(todaySource, /currentPlan\??\.items|plan\??\.items|tasks/);
  assert.match(taskPickerSource, /items\.map|tasks\.map/);
  assert.match(taskPickerSource, /onSelectPlanItem|onSelectTask/);
  assert.match(taskPickerSource, /aria-label=.*gameContent\.name|aria-label=.*task\.name|选择训练/);
  assert.match(todaySource, /下一项训练/);
  assert.match(todaySource, /onStartPreparation\(nextTask\)/);
  assert.doesNotMatch(todaySource, /<TrainingTaskPicker\b/);
  assert.doesNotMatch(todaySource, /selected\w*PlanItem|selected\w*Task/);
  assert.doesNotMatch(todaySource, /items=\{tasks\}/);
  assert.match(todaySource, /开始训练准备|进入 .* 准备/);
  assert.match(prepSource, /planItem\?\.gameContent\.name|selectedTask\?\.name|训练安排/);
});

test("patient today training does not restart the first task after all tasks are complete", async () => {
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  const taskPickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );

  assert.doesNotMatch(todaySource + taskPickerSource, /\?\?\s*(plan\.)?items\[0\]/);
  assert.match(todaySource + taskPickerSource, /find\(|every\(|completedPlanItemIds|completedTaskIds/);
  assert.match(todaySource, /查看今日训练记录/);
});

test("patient task selection surfaces patient copy without visible engine or fixture terms", async () => {
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  const taskPickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );
  const copySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-copy.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    visibleTextLiterals([todaySource, taskPickerSource, copySource].join("\n")),
    /\b(Phaser|Canvas|runtimeType|manifest|seed|mock|demo|MediaPipe|MIT)\b|engine:|license:|sensing:|mediapipe|phaser_canvas/i,
  );

  assert.match(taskPickerSource + copySource, /patientTrainingTagsLabel/);
  assert.match(taskPickerSource, /patientTrainingPurposeLabel/);
  assert.match(taskPickerSource, /trainingTargets[\s\S]*tags|tags[\s\S]*trainingTargets/);
  assert.doesNotMatch(taskPickerSource, /trainingTagsLabel\(item\.gameContent\.tags\)/);
  assert.doesNotMatch(copySource, /按医生安排训练/);
});

test("patient training copy helper filters internal runtime tags without default labels", async () => {
  const copySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-copy.ts"),
    "utf8",
  );

  assert.match(copySource, /hiddenPatientTagPatterns/);
  assert.match(copySource, /patientTrainingTagsLabel/);
  assert.match(copySource, /\^engine:/);
  assert.match(copySource, /\^license:/);
  assert.match(copySource, /\^sensing:/);
  assert.match(copySource, /\^runtime:/);
  assert.match(copySource, /mediapipe/i);
  assert.match(copySource, /phaser/i);
  assert.match(copySource, /unity_webgl/i);
  assert.match(copySource, /return \[\]/);
  assert.doesNotMatch(copySource, /按医生安排训练|康复训练|训练标签/);
});

test("patient training purpose helper returns only explicit business purposes", async () => {
  const copySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/patient-training-copy.ts"),
    "utf8",
  );
  const pickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );

  assert.match(copySource, /patientTrainingPurposeLabel/);
  for (const label of ["风险评估辅助", "干预训练"]) {
    assert.match(copySource, new RegExp(label));
  }
  assert.match(copySource, /purpose:risk_assessment/);
  assert.match(copySource, /purpose:intervention/);
  assert.doesNotMatch(copySource, /purpose:data_capture|数据采集/);
  assert.doesNotMatch(copySource, /return "干预训练"|return '干预训练'/);
  assert.match(pickerSource, /purposes\.length\s*\|\|\s*tags\.length/);
  assert.doesNotMatch(pickerSource, /\{tags\.length\s*\?\s*\(/);
});

test("patient training prep uses action-oriented readiness copy instead of release wording", async () => {
  const readinessSource = await readFile(
    join(rootDir, "apps/web/src/lib/training-start-readiness.ts"),
    "utf8",
  );
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  assert.doesNotMatch(
    visibleTextLiterals(prepSource),
    /训练内容|训练画面|训练记录|已发布|发布|训练资源|manifest|bridgeProtocolVersion/i,
  );
  assert.match(prepSource, /训练项目|训练安排/);
  assert.match(prepSource, /站位检查|动作识别/);
  assert.match(prepSource, /训练结果|可以训练/);
  assert.match(prepSource, /训练安排/);
  assert.match(prepSource, /resolveTrainingStartReadiness/);
  assert.match(prepSource, /startReadiness\.message/);
  assert.match(readinessSource, /今天的训练还未完成准备，请联系医师或工作人员处理。/);
  assert.doesNotMatch(visibleTextLiterals(prepSource), /collectionBatch|采集批次/);
});

function visibleTextLiterals(source) {
  return Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) => text.trim())
    .filter(Boolean)
    .join("\n");
}
