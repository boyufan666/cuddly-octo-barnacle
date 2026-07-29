import assert from "node:assert/strict";
import test from "node:test";
import {
  CurrentPageHighCostRequestBlockedError,
  createCurrentPageHighCostRequestRegistry,
  deriveCurrentPageHighCostRequestIntent,
  executeCurrentPageHighCostRequest,
} from "./high-cost-request-intent";

test("current-page high-cost requests retain one key and block an unknown re-send", async () => {
  const generatedKeys = ["intent-key-1", "intent-key-2"];
  const registry = createCurrentPageHighCostRequestRegistry(() => {
    const key = generatedKeys.shift();
    if (!key) throw new Error("test key exhausted");
    return key;
  });
  const intent = await deriveCurrentPageHighCostRequestIntent({
    operation: "ai_assessment_draft",
    patientId: "patient-1",
    fields: ["MMSE/CDR", "同一份问答转写"],
  });
  let requestCount = 0;

  await assert.rejects(
    executeCurrentPageHighCostRequest({
      registry,
      intent,
      request: async (idempotencyKey) => {
        requestCount += 1;
        assert.equal(idempotencyKey, "intent-key-1");
        throw new Error("response status unknown");
      },
    }),
    /response status unknown/,
  );

  await assert.rejects(
    executeCurrentPageHighCostRequest({
      registry,
      intent,
      request: async () => {
        requestCount += 1;
        return "must not call";
      },
    }),
    CurrentPageHighCostRequestBlockedError,
  );
  assert.equal(requestCount, 1);
});

test("current-page high-cost request identity is content-scoped and clears after a known response", async () => {
  const generatedKeys = ["intent-key-1", "intent-key-2", "intent-key-3"];
  const registry = createCurrentPageHighCostRequestRegistry(() => {
    const key = generatedKeys.shift();
    if (!key) throw new Error("test key exhausted");
    return key;
  });
  const initialIntent = await deriveCurrentPageHighCostRequestIntent({
    operation: "ai_conversation_message",
    patientId: "patient-1",
    fields: ["conversation-1", "本轮内容"],
  });
  const sameIntent = await deriveCurrentPageHighCostRequestIntent({
    operation: "ai_conversation_message",
    patientId: "patient-1",
    fields: ["conversation-1", "本轮内容"],
  });
  const nextIntent = await deriveCurrentPageHighCostRequestIntent({
    operation: "ai_conversation_message",
    patientId: "patient-1",
    fields: ["conversation-1", "下一轮内容"],
  });

  assert.equal(initialIntent, sameIntent);
  assert.notEqual(initialIntent, nextIntent);
  assert.equal(initialIntent.includes("本轮内容"), false);

  await assert.doesNotReject(
    executeCurrentPageHighCostRequest({
      registry,
      intent: initialIntent,
      request: async (idempotencyKey) => {
        assert.equal(idempotencyKey, "intent-key-1");
        return "received";
      },
    }),
  );
  await assert.doesNotReject(
    executeCurrentPageHighCostRequest({
      registry,
      intent: initialIntent,
      request: async (idempotencyKey) => {
        assert.equal(idempotencyKey, "intent-key-2");
        return "new confirmed intent";
      },
    }),
  );

  registry.clear();
  await assert.doesNotReject(
    executeCurrentPageHighCostRequest({
      registry,
      intent: nextIntent,
      request: async (idempotencyKey) => {
        assert.equal(idempotencyKey, "intent-key-3");
        return "new page scope";
      },
    }),
  );
});
