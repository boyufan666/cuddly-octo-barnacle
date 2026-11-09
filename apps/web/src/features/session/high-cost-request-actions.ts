import { api } from "@/lib/api";
import {
  deriveCurrentPageHighCostRequestIntent,
  executeCurrentPageHighCostRequest,
  type CurrentPageHighCostRequestRegistry,
} from "@/lib/high-cost-request-intent";
import type {
  AssessmentPhysicalCondition,
  CreateAiAssessmentDraftRequest,
  CreateAssessmentSpeechTranscriptRequest,
  CreateTtsSpeechOutputRequest,
} from "@/types/api";

type AiAssessmentDraftRequest = Omit<
  CreateAiAssessmentDraftRequest,
  "idempotencyKey"
>;
type AssessmentSpeechTranscriptRequest = Omit<
  CreateAssessmentSpeechTranscriptRequest,
  "idempotencyKey"
>;
type TtsSpeechOutputRequest = Omit<
  CreateTtsSpeechOutputRequest,
  "idempotencyKey"
>;

export async function requestAiAssessmentDraft({
  registry,
  draftRequest,
}: {
  registry: CurrentPageHighCostRequestRegistry;
  draftRequest: AiAssessmentDraftRequest;
}) {
  return executeCurrentPageHighCostRequest({
    registry,
    intent: await deriveCurrentPageHighCostRequestIntent({
      operation: "ai_assessment_draft",
      patientId: draftRequest.patientId,
      fields: [
        draftRequest.assessmentType ?? "",
        ...(draftRequest.physicalConditions ?? []),
        draftRequest.transcript,
      ],
    }),
    request: (idempotencyKey) =>
      api.createAiAssessmentDraft({ ...draftRequest, idempotencyKey }),
  });
}

export async function requestAiConversationMessage({
  registry,
  patientId,
  conversationId,
  assessmentType,
  physicalConditions,
  content,
}: {
  registry: CurrentPageHighCostRequestRegistry;
  patientId: string;
  conversationId: string;
  assessmentType: string;
  physicalConditions: AssessmentPhysicalCondition[];
  content: string;
}) {
  return executeCurrentPageHighCostRequest({
    registry,
    intent: await deriveCurrentPageHighCostRequestIntent({
      operation: "ai_conversation_message",
      patientId,
      fields: [
        conversationId,
        assessmentType,
        ...physicalConditions,
        content,
      ],
    }),
    request: (idempotencyKey) =>
      api.appendAiConversationMessage(conversationId, {
        content,
        contentSnapshot: {
          assessmentType,
          physicalConditions,
          enteredAt: new Date().toISOString(),
        },
        idempotencyKey,
      }),
  });
}

export async function requestAssessmentSpeechTranscript({
  registry,
  recordingId,
  speechTranscriptRequest,
}: {
  registry: CurrentPageHighCostRequestRegistry;
  recordingId: string;
  speechTranscriptRequest: AssessmentSpeechTranscriptRequest;
}) {
  return executeCurrentPageHighCostRequest({
    registry,
    intent: await deriveCurrentPageHighCostRequestIntent({
      operation: "speech_transcript",
      patientId: speechTranscriptRequest.patientId,
      fields: [recordingId],
    }),
    request: (idempotencyKey) =>
      api.createAssessmentSpeechTranscript({
        ...speechTranscriptRequest,
        idempotencyKey,
      }),
  });
}

export async function requestTtsSpeechOutput({
  registry,
  ttsRequest,
}: {
  registry: CurrentPageHighCostRequestRegistry;
  ttsRequest: TtsSpeechOutputRequest;
}) {
  return executeCurrentPageHighCostRequest({
    registry,
    intent: await deriveCurrentPageHighCostRequestIntent({
      operation: "tts_speech_output",
      patientId: ttsRequest.patientId,
      fields: [ttsRequest.scenario ?? "", ttsRequest.text],
    }),
    request: (idempotencyKey) =>
      api.createTtsSpeechOutput({ ...ttsRequest, idempotencyKey }),
  });
}
