import assert from "node:assert/strict";
import test from "node:test";
import type { RehabPlanItem } from "@/types/api";
import {
  buildPlanEditorConfirmationPayload,
  isPlanEditorFormComplete,
  type PlanEditorFormState,
} from "./PlanEditor.tsx";

const item: RehabPlanItem = {
  id: "plan-item-id",
  rehabPlanId: "pending-plan-id",
  gameContentId: "memory-path",
  sequence: 1,
  durationMinutes: 12,
  frequencyPerWeek: 3,
  difficulty: "basic",
  gameContent: {
    id: "memory-path",
    code: "memory-path",
    name: "记忆路径",
    trainingTargets: ["记忆"],
    tags: ["认知"],
    defaultDuration: 10,
    defaultDifficulty: "basic",
    runtimeType: "cognitive_web",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    supportsCamera: false,
    supportsMicrophone: false,
    supportedInputModes: ["keyboard"],
    requiredMetrics: [{ metricType: "completionRate", unit: "ratio" }],
    status: "active",
  },
};

test("plan editor builds confirmation payload from doctor-adjusted values", () => {
  const form: PlanEditorFormState = {
    dailyDuration: "28",
    weekFrequency: "5",
    adjustmentReason: "结合正式评估与风险结论调整训练强度。",
    itemAdjustments: [
      {
        gameContentId: item.gameContentId,
        durationMinutes: "16",
        frequencyPerWeek: "4",
        difficulty: "moderate",
      },
    ],
  };

  assert.equal(isPlanEditorFormComplete(form, [item]), true);
  assert.deepEqual(buildPlanEditorConfirmationPayload(form, [item]), {
    dailyDuration: 28,
    weekFrequency: 5,
    adjustmentReason: "结合正式评估与风险结论调整训练强度。",
    itemAdjustments: [
      {
        gameContentId: "memory-path",
        durationMinutes: 16,
        frequencyPerWeek: 4,
        difficulty: "moderate",
      },
    ],
  });
});

test("plan editor blocks instead of falling back to recommendation item values", () => {
  const form: PlanEditorFormState = {
    dailyDuration: "24",
    weekFrequency: "4",
    adjustmentReason: "确认推荐方案符合当前临床目标。",
    itemAdjustments: [],
  };

  assert.equal(isPlanEditorFormComplete(form, [item]), false);
  assert.throws(
    () => buildPlanEditorConfirmationPayload(form, [item]),
    /参数不完整/,
  );
});
