import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve(
  import.meta.dirname,
  "../verify-trial-empty-loop.mjs",
);
const runbookPath = resolve(
  import.meta.dirname,
  "../../docs/trial-empty-loop-runbook.md",
);

test("trial empty loop creates a formal collection chain before training starts", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /\/admin\/collection-conditions/);
  assert.match(source, /\/admin\/collection-protocols/);
  assert.match(source, /\/collection-batches/);
  assert.match(source, /TRIAL_VERIFY_COLLECTION_CONDITION_CODE/);
  assert.match(source, /TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE/);
  assert.match(source, /const collectionBatch = await step/);
  assert.match(source, /collectionBatchId:\s*collectionBatch\.id/);
  assert.match(
    source,
    /metricsSummary:[\s\S]*collectionBatchId:\s*session\.collectionBatchId/,
  );
});

test("trial empty loop runbook documents formal collection condition and protocol inputs", () => {
  const runbook = readFileSync(runbookPath, "utf8");

  assert.match(runbook, /管理员创建正式采集条件/);
  assert.match(runbook, /管理员创建正式采集协议/);
  assert.match(runbook, /医师创建正式采集批次/);
  assert.match(runbook, /TRIAL_VERIFY_COLLECTION_CONDITION_CODE/);
  assert.match(runbook, /TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE/);
  assert.match(runbook, /collectionBatchId/);
});

test("trial empty loop blocks recommendation inputs that cannot enter the top-three rule match", () => {
  const source = readFileSync(scriptPath, "utf8");
  const runbook = readFileSync(runbookPath, "utf8");

  assert.match(source, /assertTrialGameRecommendationTags\(/);
  assert.match(
    source,
    /TRIAL_VERIFY_GAME_TAGS 必须包含可被推荐规则识别的强度标签/,
  );
  assert.match(runbook, /moderate_intensity/);
  assert.match(runbook, /中低强度/);
});

test("trial empty loop runbook requires isolated cookie and csrf authentication", () => {
  const runbook = readFileSync(runbookPath, "utf8");

  assert.match(runbook, /管理员、医师、患者各自使用独立的 Cookie 会话/);
  assert.match(runbook, /\/auth\/csrf[\s\S]*\/auth\/login/);
  assert.match(runbook, /rehab_session/);
  assert.match(runbook, /x-csrf-token/);
  assert.match(runbook, /password_reset_required/);
  for (const envName of [
    "TRIAL_VERIFY_ADMIN_ACCOUNT",
    "TRIAL_VERIFY_ADMIN_PASSWORD",
    "TRIAL_VERIFY_DOCTOR_ACCOUNT",
    "TRIAL_VERIFY_DOCTOR_PASSWORD",
    "TRIAL_VERIFY_PATIENT_ACCOUNT",
    "TRIAL_VERIFY_PATIENT_PASSWORD",
  ]) {
    assert.match(runbook, new RegExp(`${envName}.*缺失.*网络请求`));
  }
  assert.doesNotMatch(runbook, /accessToken|Authorization|Bearer|token-ref/);
});
