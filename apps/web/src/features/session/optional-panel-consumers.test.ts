import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const optionalConsumers = [
  ["../admin/AccountReviewPanel.tsx", "requests === undefined", "账号开通申请未加载"],
  ["../admin/TrainingContentGovernance.tsx", "gameContents === undefined", "训练内容未加载"],
  ["../admin/AdminOverviewPage.tsx", "gameContents === undefined", "训练内容未加载"],
  ["../admin/OperationConfigPanel.tsx", "collectionProtocols === undefined", "采集协议未加载"],
  ["../admin/CollectionConditionGovernance.tsx", "collectionConditions === undefined", "采集条件未加载"],
  ["../caregiver/CaregiverReminderPanel.tsx", "isAvailable", "家庭照护记录未加载"],
  ["../patient/AssessmentDialoguePage.tsx", "conversations === undefined", "智能评估对话未加载"],
  ["../doctor/DataCollectionReviewPanel.tsx", "matchingProtocols === undefined", "训练准备协议未加载"],
  ["../doctor/PatientQueue.tsx", "patients === undefined", "授权患者列表未加载"],
  ["./CaregiverPatientSelector.tsx", "options === undefined", "授权患者列表未加载"],
] as const;

test("optional panel consumers distinguish unavailable data from successful empty arrays", async () => {
  for (const [relativePath, branch, unavailableCopy] of optionalConsumers) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.ok(source.includes(branch), `${relativePath} must branch on ${branch}`);
    assert.ok(
      source.includes(unavailableCopy),
      `${relativePath} must render ${unavailableCopy}`,
    );
  }
});

test("workspace and doctor container preserve optional roster state at component boundaries", async () => {
  const [workspaceSource, doctorSource] = await Promise.all([
    readFile(new URL("./role-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../doctor/DoctorWorkspaceContainer.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(workspaceSource, /options=\{data\.caregiverPatientOptions \?\? \[\]\}/);
  assert.doesNotMatch(doctorSource, /patients=\{patients \?\? \[\]\}/);
});
