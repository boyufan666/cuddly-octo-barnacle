import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  TrainingRecordSession,
  TrainingRecordsResponse,
  TrainingResult,
  TrainingReviewConclusion,
} from "@/types/api";
import { TrainingResultPage } from "./TrainingResultPage";

const baseResult: TrainingResult = {
  abnormalFlag: true,
  bridgeProtocolVersion: "1.0.0",
  completionRate: 0.82,
  createdAt: "2026-08-15T02:00:00.000Z",
  durationSeconds: 420,
  exerciseIntensity: "moderate",
  gameRunId: "game-run-sensitive-id",
  gameVersion: "1.0.0",
  id: "result-sensitive-id",
  motionAccuracy: 0.71,
  qualityFlag: "suspicious",
  qualityReasons: ["internal-quality-audit-detail"],
  rawPayloadHash: "raw-payload-sensitive-hash",
  reactionTimeMs: 950,
  reviewConclusion: null,
  reviewNote: null,
  reviewStatus: null,
  reviewedAt: null,
  reviewedByUserId: null,
  score: 76,
  source: "unity_webgl",
  submittedAt: "2026-08-15T02:00:00.000Z",
  submittedByUserId: "submitter-sensitive-id",
};

function trainingRecords(
  resultOverrides: Partial<TrainingResult> = {},
): TrainingRecordsResponse {
  const result = { ...baseResult, ...resultOverrides };
  const session = {
    calibrationStatus: "completed",
    endedAt: "2026-08-15T02:00:00.000Z",
    gameContent: {
      id: "game-1",
      name: "节律触达训练",
    },
    id: "session-sensitive-id",
    interruptReason: null,
    planItemId: "plan-item-sensitive-id",
    result,
    sessionStatus: "completed",
    startedAt: "2026-08-15T01:50:00.000Z",
    syncStatus: "synced",
  } as TrainingRecordSession;

  return {
    sessions: [session],
    summary: {
      abnormalCount: result.abnormalFlag ? 1 : 0,
      averageScore: result.score,
      completedSessions: 1,
      totalSessions: 1,
    },
  };
}

function renderResult(resultOverrides: Partial<TrainingResult> = {}) {
  return renderToStaticMarkup(
    <TrainingResultPage
      onBackToday={() => undefined}
      trainingRecords={trainingRecords(resultOverrides)}
    />,
  );
}

test("shows saved record and physician review without exposing runtime metrics", () => {
  const markup = renderResult();

  assert.match(markup, /节律触达训练/);
  assert.match(markup, /本次训练记录已保存/);
  assert.match(markup, /已保存记录/);
  assert.match(markup, /近期趋势/);
  assert.match(markup, /尚未复核/);
  assert.doesNotMatch(
    markup,
    /76 分|训练得分|完成率|训练时长|平均反应时间|动作准确度|训练强度|raw-payload-sensitive-hash|internal-quality-audit-detail/,
  );
});

test("shows the real physician review note without exposing sensitive fields", () => {
  const markup = renderResult({
    abnormalFlag: false,
    qualityFlag: "valid",
    reviewConclusion: "accepted_valid",
    reviewNote: "训练完成情况稳定，请继续按当前计划练习。",
    reviewStatus: "reviewed",
    reviewedAt: "2026-08-15T03:00:00.000Z",
    reviewedByUserId: "doctor-sensitive-id",
  });

  assert.match(markup, /已接受/);
  assert.match(markup, /训练完成情况稳定，请继续按当前计划练习。/);
  assert.doesNotMatch(
    markup,
    /doctor-sensitive-id|raw-payload-sensitive-hash|submitter-sensitive-id|2026-08-15T03:00:00.000Z/,
  );
});

test("shows the real physician recommendation for every attention conclusion", () => {
  for (const [reviewConclusion, description] of [
    ["confirmed_abnormal", "医师确认本次训练存在需要关注的情况。"],
    ["excluded_from_analysis", "医师已将本次记录排除在后续分析之外。"],
    ["needs_retrain", "医师建议重新训练。"],
  ] satisfies Array<[TrainingReviewConclusion, string]>) {
    const reviewNote = `针对 ${reviewConclusion} 的具体医师建议`;
    const markup = renderResult({
      reviewConclusion,
      reviewNote,
      reviewStatus: "reviewed",
    });

    assert.match(markup, /需关注/);
    assert.match(markup, new RegExp(description));
    assert.match(markup, new RegExp(reviewNote));
  }
});

test("shows no result state before a training record is saved", () => {
  const markup = renderToStaticMarkup(
    <TrainingResultPage onBackToday={() => undefined} trainingRecords={{ sessions: [], summary: { abnormalCount: 0, averageScore: 0, completedSessions: 0, totalSessions: 0 } }} />,
  );

  assert.match(markup, /暂无训练结果/);
  assert.match(markup, /完成训练并保存后/);
  assert.doesNotMatch(markup, /尚未复核|无需复核|已接受/);
});
