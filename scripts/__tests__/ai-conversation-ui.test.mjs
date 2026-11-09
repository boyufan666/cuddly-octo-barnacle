import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("frontend API client exposes formal AI conversation endpoints", async () => {
  const apiSource = await readFile(
    join(rootDir, "apps/web/src/lib/api.ts"),
    "utf8",
  );
  const typeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );

  assert.match(typeSource, /export type AiConversationSession/);
  assert.match(typeSource, /export type AiConversationMessage/);
  assert.match(typeSource, /export type StartAiConversationRequest/);
  assert.match(typeSource, /export type AppendAiConversationMessageRequest/);
  assert.match(typeSource, /export type CompleteAiConversationRequest/);
  assert.match(typeSource, /export type ReviewAiConversationRequest/);
  assert.match(typeSource, /turnIndex: number/);
  assert.match(typeSource, /reviewedByUserId/);
  assert.match(
    typeSource,
    /status:\s*"active"\s*\|\s*"completed"\s*\|\s*"pending_human_review"\s*\|\s*"reviewed"/,
  );
  assert.match(apiSource, /startAiConversation/);
  assert.match(apiSource, /"\/ai\/conversations"/);
  assert.match(apiSource, /appendAiConversationMessage/);
  assert.match(
    apiSource,
    /`\/ai\/conversations\/\$\{conversationId\}\/messages`/,
  );
  assert.match(apiSource, /completeAiConversation/);
  assert.match(
    apiSource,
    /`\/ai\/conversations\/\$\{conversationId\}\/complete`/,
  );
  assert.match(apiSource, /reviewAiConversation/);
  assert.match(
    apiSource,
    /`\/ai\/conversations\/\$\{conversationId\}\/review`/,
  );
  assert.match(apiSource, /patientAiConversations/);
  assert.match(apiSource, /`\/patients\/\$\{patientId\}\/ai-conversations`/);
});

test("assessment page has guided AI conversation without direct formal assessment save", async () => {
  const roleWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const assessmentDialogueSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
  const highCostRequestActionsSource = await readFile(
    join(rootDir, "apps/web/src/features/session/high-cost-request-actions.ts"),
    "utf8",
  );
  const doctorWorkspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/doctor/DoctorWorkspacePage.tsx"),
    "utf8",
  );
  const doctorConversationReviewSource = await readFile(
    join(
      rootDir,
      "apps/web/src/features/doctor/AiConversationReviewPanel.tsx",
    ),
    "utf8",
  );
  const patientConversationSource = sliceBetween(
    assessmentDialogueSource,
    "function AiConversationPanel",
    "function AssessmentInputPanel",
  );
  const patientConversationMessageSource = sliceBetween(
    assessmentDialogueSource,
    "function AiConversationMessageBubble",
    "function SummaryCard",
  );

  assert.match(roleWorkspaceSource, /aiConversationForm/);
  assert.match(roleWorkspaceSource, /handleStartAiConversation/);
  assert.match(roleWorkspaceSource, /handleAppendAiConversationMessage/);
  assert.match(roleWorkspaceSource, /handleCompleteAiConversation/);
  assert.doesNotMatch(roleWorkspaceSource, /function AssessmentScreen/);
  assert.match(assessmentDialogueSource, /AiConversationPanel/);
  assert.match(assessmentDialogueSource, /onStartAiConversation/);
  assert.match(assessmentDialogueSource, /onAppendAiConversationMessage/);
  assert.match(assessmentDialogueSource, /onCompleteAiConversation/);
  assert.match(assessmentDialogueSource, /智能对话/);
  assert.match(assessmentDialogueSource, /提交给医生复核/);
  assert.match(assessmentDialogueSource, /不会直接保存为正式评估/);
  assert.match(assessmentDialogueSource, /医生确认后才会形成正式评估记录/);
  assert.match(assessmentDialogueSource, /AI评估草稿/);
  assert.doesNotMatch(
    assessmentDialogueSource,
    /formalSubmit|onCreateAssessment\b|handleCreateAssessment|批准正式评估|由医师确认正式评估/,
  );
  assert.match(
    roleWorkspaceSource,
    /canUseAiAssessment=\{canUsePatientAiAssessment\(primaryRole\)\}/,
  );
  assert.match(
    roleWorkspaceSource,
    /onCreateAssessment=\{handleCreateAssessmentFromAiConversation\}/,
  );
  assert.match(doctorWorkspaceSource, /<AiConversationReviewPanel/);
  assert.match(doctorWorkspaceSource, /<AssessmentReviewPanel/);
  assert.match(doctorConversationReviewSource, /保存为待复核正式评估/);
  assert.match(doctorConversationReviewSource, /onCreateAssessment\(payload\)/);
  assert.match(roleWorkspaceSource, /requestAssessmentSpeechTranscript/);
  assert.match(roleWorkspaceSource, /requestAiAssessmentDraft/);
  assert.match(roleWorkspaceSource, /requestTtsSpeechOutput/);
  assert.match(
    highCostRequestActionsSource,
    /api\.createAssessmentSpeechTranscript/,
  );
  assert.match(highCostRequestActionsSource, /api\.createAiAssessmentDraft/);
  assert.match(highCostRequestActionsSource, /api\.createTtsSpeechOutput/);
  assert.match(roleWorkspaceSource, /playTtsSpeechOutputAudio/);
  assert.doesNotMatch(
    assessmentDialogueSource,
    /onCreateAssessment\([^)]*conversation|handleCompleteAiConversation[\s\S]{0,800}onCreateAssessment/,
  );
  assert.doesNotMatch(
    assessmentDialogueSource,
    /requestBody|responseBody|audio\.contentBase64|Provider|Endpoint|Call ID|rawPayload|manifest|runtime/i,
  );
  assert.doesNotMatch(
    patientConversationSource + patientConversationMessageSource,
    /provider|modelVersion|callId|endpointRef|promptVersion|evidenceMetadata/i,
  );
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
