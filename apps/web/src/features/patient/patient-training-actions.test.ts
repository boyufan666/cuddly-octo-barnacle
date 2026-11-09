import assert from "node:assert/strict";
import test from "node:test";
import { validateCapturedPatientTrainingResult } from "./patient-training-result-boundary";
import type {
  GameContent,
  RehabPlan,
  SubmitTrainingResultRequest,
  TrainingRecordSession,
  TrainingRecordsResponse,
  TrainingSession,
} from "@/types/api";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://unit.test";

const validPayload: SubmitTrainingResultRequest = {
  score: 86,
  completionRate: 0.92,
  durationSeconds: 180,
  reactionTimeMs: 640,
  motionAccuracy: 0.88,
  exerciseIntensity: "moderate",
  metricsSummary: {
    source: "browser_pose_canvas",
    collectionBatchId: "batch-1",
    gameRunId: "patient-1:reach:run-1",
    gameVersion: "1.0.0",
    protocolVersion: "1.0.0",
    clientGeneratedAt: "2026-06-10T08:00:00.000Z",
    rawPayloadHash: "sha256:valid",
  },
  motionMetrics: [
    {
      confidence: 0.94,
      metricType: "target_hit_rate",
      metricValue: 0.9,
      sampleCount: 24,
      unit: "ratio",
      windowEndedAt: "2026-06-10T08:03:00.000Z",
      windowStartedAt: "2026-06-10T08:00:00.000Z",
    },
  ],
};

const gameContent: GameContent = {
  id: "game-1",
  code: "memory-grid",
  name: "记忆训练",
  trainingTargets: ["memory"],
  tags: ["认知"],
  defaultDuration: 10,
  defaultDifficulty: "medium",
  runtimeType: "cognitive_web",
  bridgeProtocolVersion: "1.0.0",
  buildStatus: "released",
  releaseChannel: "production",
  supportsCamera: false,
  supportsMicrophone: false,
  supportedInputModes: ["pointer"],
  requiredMetrics: {},
  publishedStatus: "published",
  status: "active",
};

const currentPlan: RehabPlan = {
  id: "plan-1",
  patientId: "patient-1",
  planName: "当前训练方案",
  status: "active",
  isCurrent: true,
  weekFrequency: 5,
  dailyDuration: 20,
  recommendationReason: "评估后制定",
  items: [
    {
      id: "item-1",
      rehabPlanId: "plan-1",
      gameContentId: "game-1",
      sequence: 1,
      durationMinutes: 10,
      frequencyPerWeek: 5,
      difficulty: "medium",
      gameContent,
    },
  ],
};

const activeRecoveryContext = {
  patientId: "patient-1",
  rehabPlanId: "plan-1",
  planItemId: "item-1",
  gameContentId: "game-1",
  collectionBatchId: "batch-1",
  gameRunId: "patient-1:memory-grid:run-1",
  clientStartedAt: "2026-07-13T08:00:00.000Z",
  deviceCode: "camera-1",
  calibrationStatus: "checked",
  runtimeConfigSnapshot: {
    runtimeType: "cognitive_web",
    approvedPlanItemId: "item-1",
    assessmentSourceId: "assessment-1",
    startingLevelSource: "clinician_approved_plan",
    startingDifficultyLevel: 2,
    collectionBatch: { id: "batch-1" },
  },
  unityBuildVersion: null,
  bridgeProtocolVersion: "1.0.0",
  startedAt: "2026-07-13T08:00:00.000Z",
};

const activeTrainingRecord = {
  id: "session-1",
  planItemId: "item-1",
  calibrationStatus: "checked",
  sessionStatus: "started",
  startedAt: "2026-07-13T08:00:00.000Z",
  syncStatus: "pending",
  result: null,
  gameContent,
  recoveryContext: activeRecoveryContext,
} as unknown as TrainingRecordSession;

function trainingRecordWithRecoveryContext(
  recoveryContext: unknown,
): TrainingRecordSession {
  return {
    ...activeTrainingRecord,
    recoveryContext,
  } as unknown as TrainingRecordSession;
}

function resumedSession(
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: activeTrainingRecord.id,
    ...activeRecoveryContext,
    uploadAttemptCount: 0,
    sessionStatus: "in_progress",
    syncStatus: "pending",
    result: null,
    ...overrides,
  };
}

function trainingRecords(
  sessions: TrainingRecordSession[],
): TrainingRecordsResponse {
  return {
    sessions,
    summary: {
      totalSessions: sessions.length,
      completedSessions: 0,
      averageScore: 0,
      abnormalCount: 0,
    },
  };
}

test("active session parsing returns the unique unfinished session in the current patient plan", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const resolution = resolveActivePatientTrainingSession({
    currentPlan,
    patientId: "patient-1",
    trainingRecords: trainingRecords([activeTrainingRecord]),
  });

  assert.equal(resolution.status, "resumable");
  if (resolution.status !== "resumable") return;
  assert.equal(resolution.session, activeTrainingRecord);
  assert.equal(resolution.planItem, currentPlan.items[0]);
});

test("active session parsing hard-blocks multiple unfinished sessions without choosing one", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const resolution = resolveActivePatientTrainingSession({
    currentPlan,
    patientId: "patient-1",
    trainingRecords: trainingRecords([
      activeTrainingRecord,
      {
        ...activeTrainingRecord,
        id: "session-2",
        sessionStatus: "in_progress",
      },
    ]),
  });

  assert.equal(resolution.status, "blocked");
  assert.match(
    resolution.status === "blocked" ? resolution.message : "",
    /联系工作人员/,
  );
  assert.equal("session" in resolution, false);
});

test("active session parsing hard-blocks an active record that already carries a result", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const resolution = resolveActivePatientTrainingSession({
    currentPlan,
    patientId: "patient-1",
    trainingRecords: trainingRecords([
      {
        ...activeTrainingRecord,
        result: { id: "unexpected-result" } as TrainingRecordSession["result"],
      },
    ]),
  });

  assert.equal(resolution.status, "blocked");
  assert.match(
    resolution.status === "blocked" ? resolution.message : "",
    /联系工作人员/,
  );
  assert.equal("session" in resolution, false);
});

test("active session parsing hard-blocks unavailable real training records", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const resolution = resolveActivePatientTrainingSession({
    currentPlan,
    patientId: "patient-1",
    trainingRecords: undefined,
  });

  assert.equal(resolution.status, "blocked");
  assert.match(
    resolution.status === "blocked" ? resolution.message : "",
    /联系工作人员/,
  );
});

test("active session parsing fail-closes malformed serialized training records", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const malformedTrainingRecords: unknown[] = [
    "not-an-object",
    [],
    new Date(),
    {},
    { sessions: undefined },
    { sessions: null },
    { sessions: "not-an-array" },
    { sessions: [null] },
    { sessions: [1] },
    { sessions: ["not-a-session"] },
  ];

  for (const value of malformedTrainingRecords) {
    const resolution = resolveActivePatientTrainingSession({
      currentPlan,
      patientId: "patient-1",
      trainingRecords: value as TrainingRecordsResponse,
    });
    assert.equal(resolution.status, "blocked");
    assert.equal("session" in resolution, false);
  }
});

test("active session parsing hard-blocks root or recovery identity outside the current patient plan item", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const mismatchedRecords: TrainingRecordSession[] = [
    { ...activeTrainingRecord, id: "" },
    { ...activeTrainingRecord, planItemId: "item-other" },
    {
      ...activeTrainingRecord,
      gameContent: undefined as unknown as GameContent,
    },
    {
      ...activeTrainingRecord,
      gameContent: { ...gameContent, id: "game-other" },
    },
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      patientId: "patient-other",
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      rehabPlanId: "plan-other",
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      planItemId: "item-other",
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      gameContentId: "game-other",
    }),
  ];

  for (const session of mismatchedRecords) {
    const resolution = resolveActivePatientTrainingSession({
      currentPlan,
      patientId: "patient-1",
      trainingRecords: trainingRecords([session]),
    });
    assert.equal(resolution.status, "blocked");
    assert.match(
      resolution.status === "blocked" ? resolution.message : "",
      /联系工作人员/,
    );
    assert.equal("session" in resolution, false);
  }
});

test("active session parsing hard-blocks root recovery fields that disagree with the recovery context", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const inconsistentRecords: TrainingRecordSession[] = [
    {
      ...activeTrainingRecord,
      startedAt: "2026-07-13T08:01:00.000Z",
    },
    {
      ...activeTrainingRecord,
      calibrationStatus: "unchecked",
    },
  ];

  for (const session of inconsistentRecords) {
    const resolution = resolveActivePatientTrainingSession({
      currentPlan,
      patientId: "patient-1",
      trainingRecords: trainingRecords([session]),
    });
    assert.equal(resolution.status, "blocked");
    assert.equal("session" in resolution, false);
  }
});

test("active session parsing hard-blocks missing and extra recovery context fields", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const recoveryEntries = Object.entries(activeRecoveryContext);
  const invalidRecords = [
    trainingRecordWithRecoveryContext(undefined),
    ...recoveryEntries.map(([missingKey]) =>
      trainingRecordWithRecoveryContext(
        Object.fromEntries(
          recoveryEntries.filter(([key]) => key !== missingKey),
        ),
      ),
    ),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      idempotencyKey: "must-not-be-accepted",
    }),
  ];

  for (const session of invalidRecords) {
    const resolution = resolveActivePatientTrainingSession({
      currentPlan,
      patientId: "patient-1",
      trainingRecords: trainingRecords([session]),
    });
    assert.equal(resolution.status, "blocked");
    assert.equal("session" in resolution, false);
  }
});

test("active session parsing hard-blocks a non-current plan or mismatched runtime context", async () => {
  const { resolveActivePatientTrainingSession } =
    await import("./patient-training-actions");
  const invalidPlans: RehabPlan[] = [
    { ...currentPlan, isCurrent: false },
    { ...currentPlan, status: "paused" },
  ];
  for (const invalidPlan of invalidPlans) {
    const resolution = resolveActivePatientTrainingSession({
      currentPlan: invalidPlan,
      patientId: "patient-1",
      trainingRecords: trainingRecords([activeTrainingRecord]),
    });
    assert.equal(resolution.status, "blocked");
  }

  const invalidRuntimeRecords: TrainingRecordSession[] = [
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      collectionBatchId: null,
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      collectionBatchId: "",
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      gameRunId: "",
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      gameRunId: null,
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      clientStartedAt: null,
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      bridgeProtocolVersion: null,
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      runtimeConfigSnapshot: undefined,
    }),
    {
      ...trainingRecordWithRecoveryContext({
        ...activeRecoveryContext,
        runtimeConfigSnapshot: {
          ...activeRecoveryContext.runtimeConfigSnapshot,
          assessmentSourceId: "",
        },
      }),
    },
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      runtimeConfigSnapshot: {
        ...activeRecoveryContext.runtimeConfigSnapshot,
        runtimeType: "unity_webgl",
      },
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      runtimeConfigSnapshot: {
        ...activeRecoveryContext.runtimeConfigSnapshot,
        approvedPlanItemId: "item-other",
      },
    }),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      runtimeConfigSnapshot: {
        ...activeRecoveryContext.runtimeConfigSnapshot,
        collectionBatch: { id: "batch-other" },
      },
    }),
  ];

  for (const session of invalidRuntimeRecords) {
    const resolution = resolveActivePatientTrainingSession({
      currentPlan,
      patientId: "patient-1",
      trainingRecords: trainingRecords([session]),
    });
    assert.equal(resolution.status, "blocked");
    assert.match(
      resolution.status === "blocked" ? resolution.message : "",
      /联系工作人员/,
    );
    assert.equal("session" in resolution, false);
  }
});

test("resume response validation accepts only the same session and nested recovery context", async () => {
  const { validateResumedPatientTrainingSession } =
    await import("./patient-training-actions");
  const validResponse = resumedSession();

  const validated = validateResumedPatientTrainingSession({
    currentPlan,
    patientId: "patient-1",
    recordedSession: activeTrainingRecord,
    resumedSession: validResponse,
  });

  assert.equal(validated, validResponse);
});

test("resume response validation hard-fails root recovery fields that disagree with the recovery context", async () => {
  const { validateResumedPatientTrainingSession } =
    await import("./patient-training-actions");
  const inconsistentRecords: TrainingRecordSession[] = [
    {
      ...activeTrainingRecord,
      startedAt: "2026-07-13T08:01:00.000Z",
    },
    {
      ...activeTrainingRecord,
      calibrationStatus: "unchecked",
    },
  ];

  for (const recordedSession of inconsistentRecords) {
    assert.throws(
      () =>
        validateResumedPatientTrainingSession({
          currentPlan,
          patientId: "patient-1",
          recordedSession,
          resumedSession: resumedSession(),
        }),
      /联系工作人员/,
    );
  }
});

test("resume response validation accepts only an exact null result", async () => {
  const { validateResumedPatientTrainingSession } =
    await import("./patient-training-actions");
  const missingResult = resumedSession();
  delete (missingResult as Partial<TrainingSession>).result;
  const invalidResponses: Array<[string, TrainingSession]> = [
    ["missing", missingResult],
    [
      "undefined",
      { ...resumedSession(), result: undefined } as unknown as TrainingSession,
    ],
    [
      "false",
      { ...resumedSession(), result: false } as unknown as TrainingSession,
    ],
    ["zero", { ...resumedSession(), result: 0 } as unknown as TrainingSession],
    [
      "empty string",
      { ...resumedSession(), result: "" } as unknown as TrainingSession,
    ],
  ];

  for (const [label, response] of invalidResponses) {
    assert.throws(
      () =>
        validateResumedPatientTrainingSession({
          currentPlan,
          patientId: "patient-1",
          recordedSession: activeTrainingRecord,
          resumedSession: response,
        }),
      /联系工作人员/,
      label,
    );
  }
});

test("resume response validation hard-fails every recovery field or JSON mismatch", async () => {
  const { validateResumedPatientTrainingSession } =
    await import("./patient-training-actions");
  const validResponse = resumedSession();
  const mismatchedResponses: TrainingSession[] = [
    resumedSession({ id: "session-other" }),
    resumedSession({ patientId: "patient-other" }),
    resumedSession({ rehabPlanId: "plan-other" }),
    resumedSession({ planItemId: "item-other" }),
    resumedSession({ gameContentId: "game-other" }),
    resumedSession({ collectionBatchId: "batch-other" }),
    resumedSession({ gameRunId: "run-other" }),
    resumedSession({ clientStartedAt: "2026-07-13T08:01:00.000Z" }),
    resumedSession({ deviceCode: "camera-other" }),
    resumedSession({ calibrationStatus: "unchecked" }),
    resumedSession({ unityBuildVersion: "unexpected-build" }),
    resumedSession({ bridgeProtocolVersion: "2.0.0" }),
    resumedSession({ startedAt: "2026-07-13T08:01:00.000Z" }),
    resumedSession({
      runtimeConfigSnapshot: {
        ...activeRecoveryContext.runtimeConfigSnapshot,
        startingDifficultyLevel: 3,
      },
    }),
    { ...validResponse, sessionStatus: "completed" },
    {
      ...validResponse,
      result: { id: "unexpected-result" } as TrainingSession["result"],
    },
  ];

  for (const mismatchedResponse of mismatchedResponses) {
    assert.throws(
      () =>
        validateResumedPatientTrainingSession({
          currentPlan,
          patientId: "patient-1",
          recordedSession: activeTrainingRecord,
          resumedSession: mismatchedResponse,
        }),
      /联系工作人员/,
    );
  }

  for (const invalidRecordedSession of [
    trainingRecordWithRecoveryContext(undefined),
    trainingRecordWithRecoveryContext({
      ...activeRecoveryContext,
      lastUploadError: "must-not-be-accepted",
    }),
  ]) {
    assert.throws(
      () =>
        validateResumedPatientTrainingSession({
          currentPlan,
          patientId: "patient-1",
          recordedSession: invalidRecordedSession,
          resumedSession: validResponse,
        }),
      /联系工作人员/,
    );
  }
});

test("abort reason validation trims and accepts reasons from 1 through 500 characters", async () => {
  const { validateTrainingAbortReason } =
    await import("./patient-training-actions");

  assert.equal(validateTrainingAbortReason("  患者感到不适  "), "患者感到不适");
  assert.equal(validateTrainingAbortReason("a".repeat(500)).length, 500);
});

test("abort reason validation rejects blank and over-500-character reasons", async () => {
  const { validateTrainingAbortReason } =
    await import("./patient-training-actions");

  assert.throws(() => validateTrainingAbortReason("   "), /请填写终止原因/);
  assert.throws(() => validateTrainingAbortReason("a".repeat(501)), /500/);
});

test("patient lifecycle actions resume the recorded session and abort with the validated reason", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    const path = String(input);
    if (path.endsWith("/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken: "lifecycle-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const session = resumedSession({
      sessionStatus: path.endsWith("/abort") ? "aborted" : "in_progress",
    });
    return new Response(JSON.stringify(session), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const { abortPatientTrainingSession, resumePatientTrainingSession } =
    await import("./patient-training-actions");

  const resumed = await resumePatientTrainingSession({
    currentPlan,
    patientId: "patient-1",
    recordedSession: activeTrainingRecord,
  });
  const aborted = await abortPatientTrainingSession(
    activeTrainingRecord.id,
    "  患者感到不适  ",
  );

  assert.equal(resumed.id, activeTrainingRecord.id);
  assert.equal(aborted.sessionStatus, "aborted");
  assert.deepEqual(
    calls.map(([url]) => String(url).replace("http://unit.test", "")),
    [
      "/auth/csrf",
      "/training-sessions/session-1/resume",
      "/training-sessions/session-1/abort",
    ],
  );
  assert.deepEqual(JSON.parse(String(calls[2][1]?.body)), {
    reason: "患者感到不适",
  });
});

test("validateCapturedPatientTrainingResult accepts a matching formal payload", () => {
  const payload = validateCapturedPatientTrainingResult(
    validPayload,
    "browser_pose_canvas",
    "batch-1",
  );

  assert.deepEqual(payload, validPayload);
  assert.equal(payload.motionMetrics[0]?.sampleCount, 24);
});

test("validateCapturedPatientTrainingResult rejects mismatched runtime and batch", () => {
  assert.throws(
    () =>
      validateCapturedPatientTrainingResult(
        {
          ...validPayload,
          metricsSummary: {
            ...validPayload.metricsSummary,
            source: "unity_webgl",
          },
        },
        "browser_pose_canvas",
        "batch-1",
      ),
    /训练结果信息不完整/,
  );

  assert.throws(
    () =>
      validateCapturedPatientTrainingResult(
        {
          ...validPayload,
          metricsSummary: {
            ...validPayload.metricsSummary,
            collectionBatchId: "other-batch",
          },
        },
        "browser_pose_canvas",
        "batch-1",
      ),
    /训练结果信息不完整/,
  );
});

test("validateCapturedPatientTrainingResult rejects invalid protocol and sample counts", () => {
  assert.throws(
    () =>
      validateCapturedPatientTrainingResult(
        {
          ...validPayload,
          metricsSummary: {
            ...validPayload.metricsSummary,
            protocolVersion: "0.9.0",
          },
        },
        "browser_pose_canvas",
        "batch-1",
      ),
    /训练结果信息不完整/,
  );

  assert.throws(
    () =>
      validateCapturedPatientTrainingResult(
        {
          ...validPayload,
          motionMetrics: [
            {
              ...validPayload.motionMetrics[0],
              sampleCount: 1.5,
            },
          ],
        },
        "browser_pose_canvas",
        "batch-1",
      ),
    /训练结果信息不完整/,
  );
});
