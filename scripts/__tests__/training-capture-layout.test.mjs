import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("training capture page avoids cramped desktop breakpoints and overlapping Unity overlays", async () => {
  const runtimeSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingRuntimePage.tsx"),
    "utf8",
  );

  assert.doesNotMatch(runtimeSource, /lg:grid-cols-\[1fr_330px\]/);
  assert.doesNotMatch(runtimeSource, /min-h-\[420px\]/);
  assert.doesNotMatch(runtimeSource, /min-w-72/);
  assert.doesNotMatch(runtimeSource, /absolute bottom-5 right-5/);
  assert.doesNotMatch(runtimeSource, /absolute left-5 top-5 max-w-lg/);
  assert.doesNotMatch(runtimeSource, /2xl:grid-cols-\[minmax\(0,1fr\)_330px\]/);
  assert.doesNotMatch(runtimeSource, /xl:grid-cols-\[minmax\(0,1fr\)_clamp/);
  assert.doesNotMatch(runtimeSource, /xl:w-\[clamp\(180px,28vw,320px\)\]/);

  assert.match(runtimeSource, /training-capture-layout/);
  assert.match(runtimeSource, /training-capture-main/);
  assert.match(runtimeSource, /unity-stage-shell|training-stage-shell/);
  assert.match(runtimeSource, /patient-training-primary-action/);
  assert.match(runtimeSource, /跟随提示完成训练/);
  assert.doesNotMatch(runtimeSource, /patient-camera-sidecar|训练监看/);
  assert.doesNotMatch(runtimeSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax/);
  assert.match(runtimeSource, /grid|flex/);
});

test("patient result page stays business-only with one clear next action", async () => {
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );

  for (const copy of [
    "本次训练已完成",
    "已保存记录",
    "最近训练",
    "医生",
    "返回今日训练",
  ]) {
    assert.match(resultSource, new RegExp(copy));
  }
  assert.equal((resultSource.match(/<Button\b/g) ?? []).length, 1);
  assert.doesNotMatch(resultSource, />\s*查看记录\s*</);
  assert.doesNotMatch(
    resultSource,
    /本次得分|训练得分|反应时间|平均反应用时|动作表现|训练时长|运动强度|motionMetrics|rawPayloadHash|collectionBatchId|audit|provider|原始|导出/i,
  );
});

test("shared screen grid stays single-column until wide desktop", async () => {
  const layoutSource = await readFile(
    join(rootDir, "apps/web/src/components/layout/WorkbenchLayout.tsx"),
    "utf8",
  );

  assert.doesNotMatch(layoutSource, /lg:grid-cols-\[1fr_390px\]/);
  assert.doesNotMatch(layoutSource, /\b(?:md|lg|xl|2xl):grid-cols-\[/);
  assert.match(layoutSource, /data-testid="screen-grid"/);
  assert.match(layoutSource, /data-testid="screen-grid-main"/);
  assert.match(layoutSource, /data-testid="screen-grid-aside"/);
});

test("patient training flow does not reuse the workbench screen grid", async () => {
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );

  assert.doesNotMatch(todaySource, /<ScreenGrid/);
  assert.doesNotMatch(prepSource, /<ScreenGrid/);
  assert.match(todaySource + prepSource, /PatientTaskLayout|patient-task-layout/);
});
