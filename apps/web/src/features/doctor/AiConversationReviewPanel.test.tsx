import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AiConversationSession,
  AssessmentPhysicalCondition,
} from "@/types/api";

process.env.NEXT_PUBLIC_API_BASE_URL ??= "https://api.example.test";

function makePendingConversation(): AiConversationSession {
  return {
    id: "conversation-pending-001",
    patientId: "patient-001",
    createdByUserId: "patient-user-001",
    assessmentType: "MMSE/CDR",
    status: "pending_human_review",
    startedAt: "2026-08-15T01:00:00.000Z",
    completedAt: "2026-08-15T01:05:00.000Z",
    provider: "xiaomi-mimo",
    modelVersion: "mimo-v2.5",
    callId: "conversation-call-001",
    endpointRef: "https://provider.example.test/v1/chat/completions",
    promptVersion: "conversation-v1",
    summary: "患者近期出现日期定向下降，并反复询问同一问题。",
    reviewNote: "请医师结合量表分数复核记忆和定向能力。",
    metadata: {
      humanReview: { required: true, status: "pending_human_review" },
    },
    messages: [
      {
        id: "message-user-001",
        sessionId: "conversation-pending-001",
        turnIndex: 1,
        role: "user",
        content: "今天是几月？",
        contentSnapshot: {
          assessmentType: "MMSE/CDR",
          physicalConditions: ["wheelchair", "upper_limb_limited"],
          enteredAt: "2026-08-15T01:01:00.000Z",
        },
        createdAt: "2026-08-15T01:01:00.000Z",
      },
      {
        id: "message-assistant-001",
        sessionId: "conversation-pending-001",
        turnIndex: 2,
        role: "assistant",
        content: "请回忆一下现在的月份和季节。",
        createdAt: "2026-08-15T01:01:02.000Z",
        evidenceMetadata: {
          provider: "xiaomi-mimo",
          model: "mimo-v2.5",
          modelVersion: "mimo-v2.5",
          callId: "conversation-call-001",
          endpointRef: "https://provider.example.test/v1/chat/completions",
          promptVersion: "conversation-v1",
          calledAt: "2026-08-15T01:01:01.000Z",
          source: "provider_conversation_turn",
        },
      },
    ],
  };
}

test("renders a pending AI conversation with summary, messages, and provider evidence", async () => {
  const { AiConversationReviewPanel } =
    await import("./AiConversationReviewPanel");
  const conversation = makePendingConversation();
  const html = renderToStaticMarkup(
    createElement(AiConversationReviewPanel, {
      aiConversations: [conversation],
      assessments: [],
      onCreateAssessment: async () => {
        throw new Error("not called during render");
      },
      onReviewAiConversation: async () => {
        throw new Error("not called during render");
      },
      patientId: conversation.patientId,
    }),
  );

  assert.match(html, /患者近期出现日期定向下降/);
  assert.match(html, /请医师结合量表分数复核/);
  assert.match(html, /今天是几月/);
  assert.match(html, /请回忆一下现在的月份和季节/);
  assert.match(html, /xiaomi-mimo/);
  assert.match(html, /mimo-v2\.5/);
  assert.match(html, /conversation-call-001/);
  assert.match(html, /conversation-pending-001/);
});

test("blocks draft generation when there is no pending_human_review conversation", async () => {
  const { AiConversationReviewPanel } =
    await import("./AiConversationReviewPanel");
  const html = renderToStaticMarkup(
    createElement(AiConversationReviewPanel, {
      aiConversations: [],
      assessments: [],
      onCreateAssessment: async () => {
        throw new Error("not called during render");
      },
      onReviewAiConversation: async () => {
        throw new Error("not called during render");
      },
      patientId: "patient-001",
    }),
  );

  assert.match(html, /没有 pending_human_review 的 AI 对话/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>/);
  assert.match(html, /生成结构化评估建议/);
});

test("draft generation uses persisted summary and messages without hard-coded scores", async () => {
  const { buildAiConversationDraftTranscript } =
    await import("./AiConversationReviewPanel");
  const conversation = makePendingConversation();
  const transcript = buildAiConversationDraftTranscript(conversation);
  const source = await readFile(
    new URL("./AiConversationReviewPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(transcript, /对话摘要：患者近期出现日期定向下降/);
  assert.match(
    transcript,
    /身体状况：upper_limb_limited、wheelchair/,
  );
  assert.match(transcript, /\[1\] 患者\/录入者：今天是几月/);
  assert.match(transcript, /\[2\] AI：请回忆一下现在的月份和季节/);
  assert.match(source, /api\.createAiAssessmentDraft\(\{/);
  assert.match(source, /physicalConditions,/);
  assert.match(source, /transcript,/);
  assert.doesNotMatch(
    source,
    /scoreSummary\s*:\s*\{\s*(?:mmse|cdr|ad8Total)\s*:\s*\d/,
  );
});

test("formal assessment payload preserves the conversation physical conditions", async () => {
  const { buildCreateAssessmentPayload, buildAiConversationDraftTranscript } =
    await import("./AiConversationReviewPanel");
  const conversation = makePendingConversation();
  const transcript = buildAiConversationDraftTranscript(conversation);
  const payload = buildCreateAssessmentPayload(
    conversation.patientId,
    conversation,
    {
      sessionId: conversation.id,
      transcript,
      physicalConditions: ["wheelchair", "upper_limb_limited"],
      response: {
        patientId: conversation.patientId,
        assessmentType: "MMSE/CDR",
        status: "pending_human_review",
        riskLevel: "moderate",
        scoreSummary: {
          mmse: 22,
          cdr: 1,
          memory: 48,
          orientation: 58,
          executive: 52,
          language: 73,
        },
        rawInputSummary: {
          source: "production_ai_assessment",
          transcript,
          analysisSummary: "建议医生复核。",
          modelVersion: "mimo-v2.5",
          confidence: 0.84,
          evidence: {
            provider: "xiaomi-mimo",
            model: "mimo-v2.5",
            modelVersion: "mimo-v2.5",
            callId: "draft-call-001",
            endpointRef:
              "https://provider.example.test/v1/chat/completions",
            promptVersion: "assessment-v1",
            calledAt: "2026-08-15T01:06:00.000Z",
            humanReview: {
              required: true,
              status: "pending_human_review",
            },
          },
        },
      },
    },
  );

  assert.deepEqual(payload.rawInputSummary.physicalConditions, [
    "upper_limb_limited",
    "wheelchair",
  ]);
  assert.deepEqual(
    (
      payload.rawInputSummary.conversationEvidence as {
        physicalConditions: string[];
      }
    ).physicalConditions,
    ["upper_limb_limited", "wheelchair"],
  );
});

test("AD-8 formal assessment requires and preserves the clinician-entered informant", async () => {
  const { buildCreateAssessmentPayload, buildAiConversationDraftTranscript } =
    await import("./AiConversationReviewPanel");
  const conversation = makePendingConversation();
  conversation.assessmentType = "AD-8";
  conversation.messages = conversation.messages?.map((message) =>
    message.role === "user"
      ? {
          ...message,
          contentSnapshot: {
            assessmentType: "AD-8",
            physicalConditions: ["no_known_limitations"],
            enteredAt: "2026-08-15T01:01:00.000Z",
          },
        }
      : message,
  );
  const transcript = buildAiConversationDraftTranscript(conversation);
  const stagedDraft = {
    sessionId: conversation.id,
    transcript,
    physicalConditions: [
      "no_known_limitations",
    ] as AssessmentPhysicalCondition[],
    response: {
      patientId: conversation.patientId,
      assessmentType: "AD-8",
      status: "pending_human_review" as const,
      riskLevel: "low" as const,
      scoreSummary: {
        itemMemoryProblems: 0,
        itemReducedInterest: 0,
        itemRepeatsQuestions: 0,
        itemTroubleLearningTools: 0,
        itemForgetsMonthYear: 0,
        itemHandlesFinancesPoorly: 0,
        itemTroubleAppointments: 1,
        itemDailyThinkingMemoryProblems: 0,
        ad8Total: 1,
      },
      rawInputSummary: {
        source: "production_ai_assessment" as const,
        transcript,
        analysisSummary: "仅预约安排遗忘阳性。",
        modelVersion: "mimo-v2.5",
        confidence: 0.9,
        evidence: {
          provider: "xiaomi-mimo",
          model: "mimo-v2.5",
          modelVersion: "mimo-v2.5",
          callId: "draft-call-ad8-001",
          endpointRef: "https://provider.example.test/v1/chat/completions",
          promptVersion: "assessment-v1",
          calledAt: "2026-08-15T01:06:00.000Z",
          humanReview: {
            required: true,
            status: "pending_human_review",
          },
        },
      },
    },
  };

  assert.throws(
    () => buildCreateAssessmentPayload(conversation.patientId, conversation, stagedDraft),
    /AD-8 必须填写信息提供者姓名和与患者的关系/,
  );

  const payload = buildCreateAssessmentPayload(
    conversation.patientId,
    conversation,
    stagedDraft,
    { name: "本机验收家属", relation: "女儿" },
  );

  assert.deepEqual(payload.rawInputSummary.informant, {
    name: "本机验收家属",
    relation: "女儿",
  });
});

test("conversation physical-condition validation accepts no known limitations", async () => {
  const { readAiConversationPhysicalConditions } =
    await import("./AiConversationReviewPanel");
  const conversation = makePendingConversation();
  conversation.messages = [
    {
      ...conversation.messages![0],
      contentSnapshot: {
        assessmentType: "MMSE/CDR",
        physicalConditions: ["no_known_limitations"],
        enteredAt: "2026-08-15T01:01:00.000Z",
      },
    },
  ];

  assert.deepEqual(
    readAiConversationPhysicalConditions(conversation),
    ["no_known_limitations"],
  );
});

test("allows returning a pending conversation after only draft generation is blocked", async () => {
  const { canReturnAiConversationReview } =
    await import("./AiConversationReviewPanel");

  assert.equal(
    canReturnAiConversationReview("供应商返回格式无效", null, true),
    true,
  );
  assert.equal(
    canReturnAiConversationReview("供应商返回格式无效", null, false),
    false,
  );
  assert.equal(
    canReturnAiConversationReview(null, "加载失败", true),
    false,
  );
});

test("allows returning a pending conversation when persisted draft evidence cannot be recovered", async () => {
  const { canReturnAiConversationReview } =
    await import("./AiConversationReviewPanel");

  assert.equal(
    canReturnAiConversationReview(
      "AI 评估草稿账本响应证据无法验证，不能恢复。",
      null,
      true,
    ),
    true,
  );
});
