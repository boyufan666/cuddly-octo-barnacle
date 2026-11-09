import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  TrainingRecordSession,
  TrainingRecordsResponse,
} from "@/types/api";
import {
  TrainingReviewQueue,
  type TrainingReviewQueueFormState,
} from "./TrainingReviewQueue";

const form: TrainingReviewQueueFormState = {
  resultId: "",
  reviewConclusion: "",
  reviewNote: "",
};

function renderQueue(trainingRecords?: TrainingRecordsResponse | null) {
  return renderToStaticMarkup(
    <TrainingReviewQueue
      form={form}
      onChange={() => undefined}
      onSubmit={() => undefined}
      trainingRecords={trainingRecords}
    />,
  );
}

function emptyTrainingRecords(): TrainingRecordsResponse {
  return {
    sessions: [],
    summary: {
      totalSessions: 0,
      completedSessions: 0,
      averageScore: 0,
      abnormalCount: 0,
    },
  };
}

function pendingReviewTrainingRecords(): TrainingRecordsResponse {
  const session = {
    id: "session-1",
    gameContent: { id: "game-1", name: "节律触达训练" },
    result: {
      id: "result-1",
      abnormalFlag: true,
      qualityFlag: "suspicious",
      qualityReasons: ["动作质量可疑"],
      reviewStatus: null,
      score: 76,
      completionRate: 0.82,
      reactionTimeMs: 950,
      motionAccuracy: 0.71,
    },
  } as unknown as TrainingRecordSession;

  return {
    sessions: [session],
    summary: {
      totalSessions: 1,
      completedSessions: 1,
      averageScore: 76,
      abnormalCount: 1,
    },
  };
}

test("undefined training records render an explicit not-loaded state", () => {
  const markup = renderQueue(undefined);

  assert.match(markup, /训练结果未加载/);
  assert.match(
    markup,
    /训练结果尚未加载，暂时无法判断当前患者是否有待复核结果/,
  );
  assert.doesNotMatch(
    markup,
    /无待复核结果|当前患者没有需要医师复核的训练结果/,
  );
});

test("null training records render the same explicit not-loaded state", () => {
  const markup = renderQueue(null);

  assert.match(markup, /训练结果未加载/);
  assert.doesNotMatch(
    markup,
    /无待复核结果|当前患者没有需要医师复核的训练结果/,
  );
});

test("loaded empty training records render the real empty state", () => {
  const markup = renderQueue(emptyTrainingRecords());

  assert.match(markup, /无待复核结果/);
  assert.match(markup, /当前患者没有需要医师复核的训练结果/);
  assert.doesNotMatch(markup, /训练结果未加载/);
});

test("loaded training records with a review item render the review queue", () => {
  const markup = renderQueue(pendingReviewTrainingRecords());

  assert.match(markup, /1 条待复核/);
  assert.match(markup, /节律触达训练/);
  assert.doesNotMatch(
    markup,
    /训练结果未加载|无待复核结果|当前患者没有需要医师复核的训练结果/,
  );
});
