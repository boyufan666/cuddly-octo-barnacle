"use client";

import {
  Bot,
  CheckCircle2,
  FilePlus2,
  FileSearch,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import {
  normalizeAiAssessmentType,
  normalizeAssessmentPhysicalConditions,
} from "@/lib/ai-assessment-draft";
import {
  createCurrentPageHighCostRequestRegistry,
  deriveCurrentPageHighCostRequestIntent,
  executeCurrentPageHighCostRequest,
} from "@/lib/high-cost-request-intent";
import type {
  AiAssessmentDraftResponse,
  AiConversationMessage,
  AiConversationSession,
  AssessmentPhysicalCondition,
  AssessmentRecord,
  CreateAssessmentRequest,
  ReviewAiConversationRequest,
} from "@/types/api";

type LoadState = "idle" | "loading" | "ready" | "error";
type ActionState = "idle" | "generating" | "saving" | "approving" | "returning";
type DraftRecoveryState = "idle" | "loading" | "ready" | "error";

export type StagedDraft = {
  response: AiAssessmentDraftResponse;
  sessionId: string;
  transcript: string;
  physicalConditions: AssessmentPhysicalCondition[];
};

export type Ad8Informant = {
  name: string;
  relation: string;
};

type AiConversationReviewPanelProps = {
  aiConversations?: AiConversationSession[];
  assessments?: AssessmentRecord[];
  patientId?: string | null;
  onCreateAssessment: (
    payload: CreateAssessmentRequest,
  ) => Promise<AssessmentRecord>;
  onReviewAiConversation: (
    sessionId: string,
    payload: ReviewAiConversationRequest,
  ) => Promise<AiConversationSession>;
};

type AiConversationReviewViewProps = {
  actionError: string | null;
  actionState: ActionState;
  ad8Informant: Ad8Informant;
  conversation?: AiConversationSession;
  draft?: AiAssessmentDraftResponse;
  draftRecoveryState: DraftRecoveryState;
  fatalValidationError: string | null;
  isAssessmentSaved: boolean;
  canReturnAfterDraftFailure: boolean;
  loadError: string | null;
  loadState: LoadState;
  notice: string | null;
  onApprove: () => void | Promise<void>;
  onAd8InformantChange: (field: keyof Ad8Informant, value: string) => void;
  onGenerateDraft: () => void | Promise<void>;
  onReturn: () => void | Promise<void>;
  onReviewNoteChange: (value: string) => void;
  onSaveAssessment: () => void | Promise<void>;
  patientId?: string | null;
  pendingCount: number;
  reviewNote: string;
};

const ad8ItemFields = [
  "itemMemoryProblems",
  "itemReducedInterest",
  "itemRepeatsQuestions",
  "itemTroubleLearningTools",
  "itemForgetsMonthYear",
  "itemHandlesFinancesPoorly",
  "itemTroubleAppointments",
  "itemDailyThinkingMemoryProblems",
] as const;

export function AiConversationReviewPanel(props: AiConversationReviewPanelProps) {
  const selection = selectPendingConversation(
    props.aiConversations,
    props.assessments,
    props.patientId,
  );
  return (
    <AiConversationReviewSession
      key={JSON.stringify([props.patientId, selection.conversation?.id])}
      {...props}
    />
  );
}

function AiConversationReviewSession({
  aiConversations,
  assessments,
  patientId,
  onCreateAssessment,
  onReviewAiConversation,
}: AiConversationReviewPanelProps) {
  const [actionFatalValidationError, setFatalValidationError] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [stagedDraft, setStagedDraft] = useState<StagedDraft | undefined>();
  const [draftRecoveryState, setDraftRecoveryState] =
    useState<DraftRecoveryState>(() =>
      patientId && selectPendingConversation(aiConversations, assessments, patientId).conversation
        ? "loading"
        : "idle",
    );
  const [savedAssessment, setSavedAssessment] = useState<
    AssessmentRecord | undefined
  >();
  const [savedForSessionId, setSavedForSessionId] = useState<string | null>(
    null,
  );
  const [canReturnAfterDraftFailure, setCanReturnAfterDraftFailure] =
    useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [ad8Informant, setAd8Informant] = useState<Ad8Informant>({
    name: "",
    relation: "",
  });
  const draftRequestRegistryRef = useRef(
    createCurrentPageHighCostRequestRegistry(),
  );
  const patientIdRef = useRef(patientId);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const selection = useMemo(
    () => selectPendingConversation(aiConversations, assessments, patientId),
    [aiConversations, assessments, patientId],
  );
  const conversation = selection.conversation;
  const [recoveryConversation, setRecoveryConversation] = useState(conversation);
  if (recoveryConversation !== conversation) {
    setRecoveryConversation(conversation);
    setStagedDraft(undefined);
    setFatalValidationError(null);
    setNotice(null);
    setCanReturnAfterDraftFailure(false);
    setDraftRecoveryState(patientId && conversation ? "loading" : "idle");
  }
  const fatalValidationError =
    actionFatalValidationError ?? selection.validationError;
  const isAssessmentSaved = Boolean(
    conversation &&
    ((savedAssessment && savedForSessionId === conversation.id) ||
      selection.linkedAssessment),
  );

  useEffect(() => {
    patientIdRef.current = patientId;
    conversationIdRef.current = conversation?.id;
    return () => {
      patientIdRef.current = undefined;
      conversationIdRef.current = undefined;
    };
  }, [conversation?.id, patientId]);

  useEffect(() => {
    if (!patientId || !conversation) return;
    let disposed = false;

    void (async () => {
      try {
        const assessmentType = conversation.assessmentType;
        if (!assessmentType) {
          throw new Error("AI 会话缺少评估类型，已阻止恢复评估建议。");
        }
        validatePendingConversation(conversation, patientId);
        const recoveredDraft = await api.aiConversationAssessmentDraft(
          conversation.id,
        );
        if (disposed) return;
        if (!recoveredDraft) {
          setDraftRecoveryState("ready");
          return;
        }

        const transcript = buildAiConversationDraftTranscript(conversation);
        const physicalConditions = readAiConversationPhysicalConditions(
          conversation,
        );
        validateAiAssessmentDraft(recoveredDraft, {
          assessmentType,
          patientId,
          transcript,
        });
        setStagedDraft({
          response: recoveredDraft,
          sessionId: conversation.id,
          transcript,
          physicalConditions,
        });
        setNotice(
          "已从已验证的供应商调用记录恢复结构化评估建议，可继续补充信息后保存。",
        );
        setDraftRecoveryState("ready");
      } catch (error) {
        if (disposed) return;
        setCanReturnAfterDraftFailure(true);
        setFatalValidationError(
          errorMessage(
            error,
            "已完成的结构化评估建议证据无法验证，已阻止继续操作。",
          ),
        );
        setDraftRecoveryState("error");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [conversation, patientId]);

  async function generateDraft() {
    if (
      !patientId ||
      !conversation ||
      actionState !== "idle" ||
      draftRecoveryState !== "ready"
    ) {
      return;
    }
    if (fatalValidationError) return;
    const assessmentType = conversation.assessmentType;
    if (!assessmentType) {
      handleActionFailure(
        new Error("AI 会话缺少评估类型，已阻止后续操作。"),
        "AI 会话数据不完整，无法生成评估建议。",
      );
      return;
    }

    setActionState("generating");
    setActionError(null);
    setNotice(null);
    try {
      validatePendingConversation(conversation, patientId);
      const transcript = buildAiConversationDraftTranscript(conversation);
      const physicalConditions = readAiConversationPhysicalConditions(
        conversation,
      );
      const intent = await deriveCurrentPageHighCostRequestIntent({
        operation: "ai_assessment_draft",
        patientId,
        fields: [
          assessmentType,
          ...physicalConditions,
          transcript,
        ],
      });
      const draft = await executeCurrentPageHighCostRequest({
        registry: draftRequestRegistryRef.current,
        intent,
        request: (idempotencyKey) =>
          api.createAiAssessmentDraft({
          patientId,
          assessmentType,
            physicalConditions,
            transcript,
            idempotencyKey,
          }),
      });
      assertCurrentContext(
        patientId,
        conversation.id,
        patientIdRef,
        conversationIdRef,
      );
      validateAiAssessmentDraft(draft, {
        assessmentType,
        patientId,
        transcript,
      });
      setStagedDraft({
        response: draft,
        sessionId: conversation.id,
        transcript,
        physicalConditions,
      });
      setNotice(
        "结构化评估建议已返回。请核对分数、摘要、置信度和供应商证据后再保存。",
      );
    } catch (error) {
      setCanReturnAfterDraftFailure(true);
      handleActionFailure(
        error,
        "结构化评估建议生成失败；为避免重复高成本调用，本会话已阻止再次生成。医生可填写说明后退回患者补充。",
      );
    } finally {
      setActionState("idle");
    }
  }

  async function saveAssessment() {
    if (
      !patientId ||
      !conversation ||
      !stagedDraft ||
      actionState !== "idle" ||
      fatalValidationError ||
      isAssessmentSaved
    ) {
      return;
    }
    const assessmentType = conversation.assessmentType;
    if (!assessmentType) {
      setActionError("AI 会话缺少评估类型，已阻止保存正式评估。");
      return;
    }
    if (isAd8AssessmentType(assessmentType)) {
      try {
        requireAd8Informant(ad8Informant);
      } catch (error) {
        setActionError(
          errorMessage(error, "请完整记录 AD-8 信息提供者和与患者的关系。"),
        );
        return;
      }
    }

    setActionState("saving");
    setActionError(null);
    setNotice(null);
    try {
      validatePendingConversation(conversation, patientId);
      if (stagedDraft.sessionId !== conversation.id) {
        throw new AsyncResultValidationError(
          "评估建议与当前 AI 会话不一致，已阻止保存。",
        );
      }
      validateAiAssessmentDraft(stagedDraft.response, {
        assessmentType,
        patientId,
        transcript: stagedDraft.transcript,
      });
      const payload = buildCreateAssessmentPayload(
        patientId,
        conversation,
        stagedDraft,
        ad8Informant,
      );
      const assessment = await onCreateAssessment(payload);
      assertCurrentContext(
        patientId,
        conversation.id,
        patientIdRef,
        conversationIdRef,
      );
      validateCreatedAssessment(assessment, payload, conversation.id);

      setSavedAssessment(assessment);
      setSavedForSessionId(conversation.id);
      setNotice(
        "正式评估已保存为待医师复核状态。AI 对话现在可以批准；正式结论仍需使用下方既有评估复核按钮确认。",
      );
    } catch (error) {
      handleActionFailure(
        error,
        "正式评估保存结果未确认，已阻止重复保存和批准 AI 对话。",
      );
    } finally {
      setActionState("idle");
    }
  }

  async function reviewConversation(conclusion: "approved" | "returned") {
    if (!patientId || !conversation || actionState !== "idle") return;
    if (
      fatalValidationError &&
      !(conclusion === "returned" && canReturnAfterDraftFailure)
    ) {
      return;
    }

    const trimmedReviewNote = reviewNote.trim();
    if (!trimmedReviewNote) {
      setActionError(
        conclusion === "returned"
          ? "退回 AI 对话前必须填写医师说明。"
          : "批准 AI 对话前必须填写医师复核说明。",
      );
      return;
    }
    if (conclusion === "approved" && !isAssessmentSaved) {
      setActionError("必须先成功保存本会话对应的正式评估，才能批准 AI 对话。");
      return;
    }

    setActionState(conclusion === "approved" ? "approving" : "returning");
    setActionError(null);
    setNotice(null);
    try {
      validatePendingConversation(conversation, patientId);
      const reviewed = await onReviewAiConversation(conversation.id, {
        conclusion,
        reviewNote: trimmedReviewNote,
      });
      assertCurrentContext(
        patientId,
        conversation.id,
        patientIdRef,
        conversationIdRef,
      );
      validateReviewedConversation(reviewed, {
        conclusion,
        patientId,
        sessionId: conversation.id,
      });

      setStagedDraft(undefined);
      setReviewNote("");
      setNotice(
        conclusion === "approved"
          ? "AI 对话已批准并完成复核。正式评估仍需在下方单独确认。"
          : "AI 对话已退回，患者可继续补充对话后再次提交。",
      );
    } catch (error) {
      handleActionFailure(error, "AI 对话复核失败，已阻止继续操作。");
    } finally {
      setActionState("idle");
    }
  }

  function handleActionFailure(error: unknown, defaultMessage: string) {
    const message = errorMessage(error, defaultMessage);
    setFatalValidationError(message);
  }

  return (
    <AiConversationReviewView
      actionError={actionError}
      actionState={actionState}
      ad8Informant={ad8Informant}
      canReturnAfterDraftFailure={canReturnAfterDraftFailure}
      conversation={conversation}
      draft={stagedDraft?.response}
      draftRecoveryState={draftRecoveryState}
      fatalValidationError={fatalValidationError}
      isAssessmentSaved={isAssessmentSaved}
      loadError={null}
      loadState={selection.loadState}
      notice={notice}
      onApprove={() => reviewConversation("approved")}
      onAd8InformantChange={(field, value) =>
        setAd8Informant((current) => ({ ...current, [field]: value }))
      }
      onGenerateDraft={generateDraft}
      onReturn={() => reviewConversation("returned")}
      onReviewNoteChange={setReviewNote}
      onSaveAssessment={saveAssessment}
      patientId={patientId}
      pendingCount={selection.pendingCount}
      reviewNote={reviewNote}
    />
  );
}

export function AiConversationReviewView({
  actionError,
  actionState,
  ad8Informant,
  canReturnAfterDraftFailure,
  conversation,
  draft,
  draftRecoveryState,
  fatalValidationError,
  isAssessmentSaved,
  loadError,
  loadState,
  notice,
  onApprove,
  onAd8InformantChange,
  onGenerateDraft,
  onReturn,
  onReviewNoteChange,
  onSaveAssessment,
  patientId,
  pendingCount,
  reviewNote,
}: AiConversationReviewViewProps) {
  const messages = useMemo(
    () =>
      [...(conversation?.messages ?? [])].sort(
        (a, b) => a.turnIndex - b.turnIndex,
      ),
    [conversation],
  );
  const blocked = Boolean(fatalValidationError || loadError);
  const returnBlocked = !canReturnAiConversationReview(
    fatalValidationError,
    loadError,
    canReturnAfterDraftFailure,
  );
  const busy = actionState !== "idle";

  return (
    <Card
      className="mt-5 overflow-hidden border-[var(--line-strong)] p-0"
      data-testid="ai-conversation-review-panel"
      tone="workbench"
    >
      <div className="border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              AI 对话证据复核
            </div>
            <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)] md:text-3xl">
              患者智能对话审阅台
            </h3>
            <p className="mt-3 max-w-4xl font-bold leading-7 text-[var(--ink-soft)]">
              先核验原始对话与供应商证据，再生成结构化建议。AI
              结果不会自动成为正式评估。
            </p>
          </div>
          <StatusBadge
            status={
              blocked
                ? "blocked"
                : conversation
                  ? isAssessmentSaved
                    ? "complete"
                    : "pending"
                  : "review"
            }
          >
            {blocked
              ? "证据校验阻断"
              : conversation
                ? isAssessmentSaved
                  ? "正式评估已保存"
                  : `${pendingCount} 条待复核`
                : "无待复核对话"}
          </StatusBadge>
        </div>
      </div>

      <div className="grid gap-5 p-5 md:p-6">
        {!patientId ? (
          <BlockedState message="请先选择患者，才能加载 AI 对话复核证据。" />
        ) : loadState === "loading" ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-5 font-bold text-[var(--ink-soft)]">
            正在加载当前患者的 AI 对话证据…
          </div>
        ) : !conversation ? (
          <BlockedState
            message={
              fatalValidationError ??
              loadError ??
              "当前患者没有 pending_human_review 的 AI 对话，已阻止生成结构化评估建议。"
            }
          />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)]">
              <div className="grid gap-4">
                <EvidenceTextBlock
                  label="患者提交摘要"
                  value={conversation.summary}
                />
                <EvidenceTextBlock
                  label="提交时复核说明"
                  value={conversation.reviewNote}
                />
              </div>
              <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent-strong)]">
                  <FileSearch className="h-4 w-4" aria-hidden="true" />
                  <h4 className="font-black">会话级供应商证据</h4>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <EvidenceRow
                    label="patientId"
                    value={conversation.patientId}
                  />
                  <EvidenceRow label="sessionId" value={conversation.id} />
                  <EvidenceRow label="status" value={conversation.status} />
                  <EvidenceRow label="provider" value={conversation.provider} />
                  <EvidenceRow
                    label="model"
                    value={conversation.modelVersion}
                  />
                  <EvidenceRow label="callId" value={conversation.callId} />
                  <EvidenceRow
                    label="endpoint"
                    value={conversation.endpointRef}
                  />
                  <EvidenceRow
                    label="prompt"
                    value={conversation.promptVersion}
                  />
                  <EvidenceRow
                    label="startedAt"
                    value={conversation.startedAt}
                  />
                  <EvidenceRow
                    label="completedAt"
                    value={conversation.completedAt}
                  />
                </dl>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                    Conversation transcript
                  </p>
                  <h4 className="mt-2 text-xl font-black text-[var(--ink-strong)]">
                    原始消息对话
                  </h4>
                </div>
                <span className="text-sm font-bold text-[var(--ink-subtle)]">
                  {messages.length} 条持久化消息
                </span>
              </div>
              <ol className="mt-4 grid gap-3">
                {messages.map((message) => (
                  <ConversationMessage key={message.id} message={message} />
                ))}
              </ol>
            </section>

            {fatalValidationError ? (
              <AlertBox message={fatalValidationError} />
            ) : null}
            {actionError ? <AlertBox message={actionError} /> : null}
            {notice ? (
              <div
                className="rounded-[var(--radius-card)] border border-[var(--success-line)] bg-[var(--success-soft)] p-4 font-bold leading-7 text-[var(--ink-strong)]"
                role="status"
              >
                {notice}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line-subtle)] pt-5">
              <Button
                disabled={
                  blocked ||
                  busy ||
                  Boolean(draft) ||
                  draftRecoveryState !== "ready"
                }
                isLoading={actionState === "generating"}
                onClick={onGenerateDraft}
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                  生成结构化评估建议
                </span>
              </Button>
              <p className="max-w-2xl text-sm font-bold leading-6 text-[var(--ink-subtle)]">
                {draftRecoveryState === "loading"
                  ? "正在核验是否存在已完成的结构化评估草稿…"
                  : "请求仅使用上方已持久化的摘要和消息；分数必须来自真实 AI 响应。"}
              </p>
            </div>

            {draft ? (
              <DraftReview
                actionState={actionState}
                ad8Informant={ad8Informant}
                disabled={blocked || busy || isAssessmentSaved}
                draft={draft}
                isAssessmentSaved={isAssessmentSaved}
                onAd8InformantChange={onAd8InformantChange}
                onSaveAssessment={onSaveAssessment}
              />
            ) : null}

            <section className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-4 md:p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert
                  className="mt-1 h-5 w-5 shrink-0 text-[var(--warning)]"
                  aria-hidden="true"
                />
                <div>
                  <h4 className="text-lg font-black text-[var(--ink-strong)]">
                    医师对话复核结论
                  </h4>
                  <p className="mt-1 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                    批准仅在正式评估成功保存后解锁；退回必须说明需要患者补充或更正的内容。
                  </p>
                </div>
              </div>
              <label className="mt-4 block text-sm font-black text-[var(--ink-strong)]">
                医师复核说明
                <textarea
                  className="mt-2 min-h-28 w-full resize-y rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-3 font-bold leading-6 text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
                  disabled={returnBlocked || busy}
                  onChange={(event) => onReviewNoteChange(event.target.value)}
                  placeholder="记录批准依据，或明确退回后需要补充的内容"
                  value={reviewNote}
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  className="bg-[var(--ink-strong)] hover:bg-[var(--ink-strong)]"
                  disabled={
                    blocked || busy || !isAssessmentSaved || !reviewNote.trim()
                  }
                  isLoading={actionState === "approving"}
                  onClick={onApprove}
                >
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    批准 AI 对话
                  </span>
                </Button>
                <Button
                  disabled={returnBlocked || busy || !reviewNote.trim()}
                  intent="danger"
                  isLoading={actionState === "returning"}
                  onClick={onReturn}
                >
                  <span className="inline-flex items-center gap-2">
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    退回补充
                  </span>
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </Card>
  );
}

export function canReturnAiConversationReview(
  fatalValidationError: string | null,
  loadError: string | null,
  canReturnAfterDraftFailure: boolean,
) {
  if (loadError) return false;
  return !fatalValidationError || canReturnAfterDraftFailure;
}

function DraftReview({
  actionState,
  ad8Informant,
  disabled,
  draft,
  isAssessmentSaved,
  onAd8InformantChange,
  onSaveAssessment,
}: {
  actionState: ActionState;
  ad8Informant: Ad8Informant;
  disabled: boolean;
  draft: AiAssessmentDraftResponse;
  isAssessmentSaved: boolean;
  onAd8InformantChange: (field: keyof Ad8Informant, value: string) => void;
  onSaveAssessment: () => void | Promise<void>;
}) {
  const scores = draft.scoreSummary as unknown as Record<string, unknown>;
  const evidence = readObject(draft.rawInputSummary.evidence);

  return (
    <section className="rounded-[var(--radius-card)] border-2 border-[var(--accent-strong)] bg-[var(--surface-paper)] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            AI assessment draft
          </p>
          <h4 className="mt-2 text-2xl font-black text-[var(--ink-strong)]">
            结构化评估建议
          </h4>
        </div>
        <StatusBadge status={isAssessmentSaved ? "complete" : "pending"}>
          {isAssessmentSaved ? "已保存待正式复核" : "AI 返回·待医师核对"}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ScoreTile label="MMSE" range="0–30" value={scores.mmse} />
        <ScoreTile label="CDR" range="0–3" value={scores.cdr} />
        <ScoreTile label="AD-8" range="0–8" value={scores.ad8Total} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <div className="rounded-[var(--radius-card)] bg-[var(--surface-muted)] p-4">
          <p className="text-sm font-black text-[var(--accent-strong)]">
            AI 评估摘要
          </p>
          <p className="mt-3 whitespace-pre-wrap font-bold leading-7 text-[var(--ink-strong)]">
            {draft.rawInputSummary.analysisSummary}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status="review">
              置信度 {formatConfidence(draft.rawInputSummary.confidence)}
            </StatusBadge>
            <StatusBadge status="review">
              风险建议 {riskLabel(draft.riskLevel)}
            </StatusBadge>
            <StatusBadge status="review">{draft.assessmentType}</StatusBadge>
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] p-4">
          <p className="text-sm font-black text-[var(--accent-strong)]">
            本次草稿供应商证据
          </p>
          <dl className="mt-3 grid gap-3 text-sm">
            <EvidenceRow
              label="provider"
              value={readString(evidence, "provider")}
            />
            <EvidenceRow label="model" value={readString(evidence, "model")} />
            <EvidenceRow
              label="callId"
              value={readString(evidence, "callId")}
            />
            <EvidenceRow
              label="prompt"
              value={readString(evidence, "promptVersion")}
            />
            <EvidenceRow
              label="calledAt"
              value={readString(evidence, "calledAt")}
            />
          </dl>
        </div>
      </div>

      {isAd8AssessmentType(draft.assessmentType) ? (
        <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4">
          <h5 className="font-black text-[var(--ink-strong)]">
            AD-8 信息提供者（必填）
          </h5>
          <p className="mt-1 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            AD-8 需记录实际接受访谈的家属或照护者；未填写不会保存正式评估。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-[var(--ink-strong)]">
              信息提供者姓名
              <input
                className="rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-3 py-2 font-bold text-[var(--ink-strong)]"
                disabled={disabled}
                onChange={(event) =>
                  onAd8InformantChange("name", event.target.value)
                }
                value={ad8Informant.name}
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-[var(--ink-strong)]">
              与患者关系
              <input
                className="rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-3 py-2 font-bold text-[var(--ink-strong)]"
                disabled={disabled}
                onChange={(event) =>
                  onAd8InformantChange("relation", event.target.value)
                }
                value={ad8Informant.relation}
              />
            </label>
          </div>
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line-subtle)] pt-5">
        <Button
          disabled={disabled}
          isLoading={actionState === "saving"}
          onClick={onSaveAssessment}
        >
          <span className="inline-flex items-center gap-2">
            <FilePlus2 className="h-5 w-5" aria-hidden="true" />
            保存为待复核正式评估
          </span>
        </Button>
        <p className="max-w-2xl text-sm font-bold leading-6 text-[var(--ink-subtle)]">
          保存只建立正式评估记录，不会替代下方“由医师确认正式评估”的既有复核动作。
        </p>
      </div>
    </section>
  );
}

function ConversationMessage({ message }: { message: AiConversationMessage }) {
  const assistant = message.role === "assistant";
  const evidence = readObject(message.evidenceMetadata);
  return (
    <li
      className={`rounded-[var(--radius-card)] border p-4 ${
        assistant
          ? "border-[var(--line-strong)] bg-[var(--surface-muted)]"
          : "border-[var(--line-subtle)] bg-[var(--surface-paper)]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-[var(--ink-strong)]">
          {assistant ? (
            <Bot
              className="h-5 w-5 text-[var(--accent-strong)]"
              aria-hidden="true"
            />
          ) : (
            <UserRound
              className="h-5 w-5 text-[var(--accent-strong)]"
              aria-hidden="true"
            />
          )}
          {assistant ? "AI 助手" : "患者/录入者"}
        </div>
        <span className="font-mono text-xs font-bold text-[var(--ink-subtle)]">
          turn {message.turnIndex} · {message.createdAt}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words font-bold leading-7 text-[var(--ink-strong)]">
        {message.content}
      </p>
      {assistant ? (
        <details className="mt-3 rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-black text-[var(--accent-strong)]">
            查看本轮 provider / model / callId 证据
          </summary>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <EvidenceRow
              label="provider"
              value={readString(evidence, "provider")}
            />
            <EvidenceRow
              label="model"
              value={readString(evidence, "modelVersion")}
            />
            <EvidenceRow
              label="callId"
              value={readString(evidence, "callId")}
            />
            <EvidenceRow
              label="calledAt"
              value={readString(evidence, "calledAt")}
            />
          </dl>
        </details>
      ) : null}
    </li>
  );
}

function BlockedState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]"
          aria-hidden="true"
        />
        <div>
          <h4 className="font-black text-[var(--ink-strong)]">
            AI 对话复核已阻断
          </h4>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            {message}
          </p>
        </div>
      </div>
      <Button className="mt-4" disabled>
        生成结构化评估建议
      </Button>
    </div>
  );
}

function AlertBox({ message }: { message: string }) {
  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 font-bold leading-7 text-[var(--ink-strong)]"
      role="alert"
    >
      {message}
    </div>
  );
}

function EvidenceTextBlock({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
      <p className="text-sm font-black text-[var(--accent-strong)]">{label}</p>
      <p className="mt-3 whitespace-pre-wrap break-words font-bold leading-7 text-[var(--ink-strong)]">
        {value}
      </p>
    </div>
  );
}

function EvidenceRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-2">
      <dt className="font-black text-[var(--ink-subtle)]">{label}</dt>
      <dd className="break-all font-mono font-bold text-[var(--ink-strong)]">
        {value || "证据缺失"}
      </dd>
    </div>
  );
}

function ScoreTile({
  label,
  range,
  value,
}: {
  label: string;
  range: string;
  value: unknown;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-black text-[var(--accent-strong)]">{label}</p>
        <span className="text-xs font-bold text-[var(--ink-subtle)]">
          {range}
        </span>
      </div>
      <p className="mt-2 text-3xl font-black text-[var(--ink-strong)]">
        {typeof value === "number" ? value : "本次未返回"}
      </p>
    </div>
  );
}

export function buildAiConversationDraftTranscript(
  conversation: AiConversationSession,
) {
  const messages = [...(conversation.messages ?? [])].sort(
    (left, right) => left.turnIndex - right.turnIndex,
  );
  return [
    `AI 对话会话：${conversation.id}`,
    `评估类型：${conversation.assessmentType}`,
    `身体状况：${readAiConversationPhysicalConditions(conversation).join("、") || "未选择"}`,
    `对话摘要：${conversation.summary}`,
    "对话消息：",
    ...messages.map(
      (message) =>
        `[${message.turnIndex}] ${message.role === "assistant" ? "AI" : "患者/录入者"}：${message.content}`,
    ),
  ].join("\n");
}

export function readAiConversationPhysicalConditions(
  conversation: AiConversationSession,
) {
  const latestUserMessage = [...(conversation.messages ?? [])]
    .filter((message) => message.role === "user")
    .sort((left, right) => right.turnIndex - left.turnIndex)[0];
  if (!latestUserMessage) {
    throw new AsyncResultValidationError(
      "AI 对话缺少患者输入消息，无法确认身体状况快照。",
    );
  }
  const snapshot = requireObject(
    latestUserMessage.contentSnapshot,
    "AI 对话患者消息缺少身体状况快照，已阻止后续操作。",
  );
  const assessmentType = conversation.assessmentType;
  if (!assessmentType) {
    throw new AsyncResultValidationError(
      "AI 会话缺少评估类型，已阻止后续操作。",
    );
  }
  if (
    typeof snapshot.assessmentType !== "string" ||
    normalizeAiAssessmentType(snapshot.assessmentType) !==
      normalizeAiAssessmentType(assessmentType)
  ) {
    throw new AsyncResultValidationError(
      "AI 对话患者消息的评估路径与会话不一致，已阻止后续操作。",
    );
  }
  if (!Array.isArray(snapshot.physicalConditions)) {
    throw new AsyncResultValidationError(
      "AI 对话患者消息缺少 physicalConditions 数组，已阻止后续操作。",
    );
  }
  if (
    snapshot.physicalConditions.some(
      (value) =>
        value !== "no_known_limitations" &&
        value !== "wheelchair" &&
        value !== "upper_limb_limited",
    )
  ) {
    throw new AsyncResultValidationError(
      "AI 对话患者消息包含不受支持的身体状况，已阻止后续操作。",
    );
  }
  return normalizeAssessmentPhysicalConditions(
    snapshot.physicalConditions as AssessmentPhysicalCondition[],
  );
}

function selectPendingConversation(
  aiConversations: AiConversationSession[] | undefined,
  assessments: AssessmentRecord[] | undefined,
  patientId: string | null | undefined,
): {
  conversation?: AiConversationSession;
  linkedAssessment?: AssessmentRecord;
  loadState: LoadState;
  pendingCount: number;
  validationError: string | null;
} {
  if (!patientId) {
    return {
      loadState: "idle",
      pendingCount: 0,
      validationError: null,
    };
  }
  if (aiConversations === undefined) {
    return {
      loadState: "loading",
      pendingCount: 0,
      validationError: null,
    };
  }

  try {
    if (!Array.isArray(aiConversations)) {
      throw new AsyncResultValidationError(
        "data.aiConversations 响应格式无效，已阻止后续操作。",
      );
    }
    for (const session of aiConversations) {
      if (session.patientId !== patientId) {
        throw new AsyncResultValidationError(
          "data.aiConversations 包含其他患者的会话，已阻止展示和后续操作。",
        );
      }
    }
    const pendingSessions = aiConversations.filter(
      (session) => session.status === "pending_human_review",
    );
    const conversation = pendingSessions[0];
    if (conversation) {
      validatePendingConversation(conversation, patientId);
    }
    return {
      conversation,
      linkedAssessment: conversation
        ? findLinkedFormalAssessment(assessments, patientId, conversation.id)
        : undefined,
      loadState: "ready",
      pendingCount: pendingSessions.length,
      validationError: null,
    };
  } catch (error) {
    return {
      loadState: "error",
      pendingCount: 0,
      validationError: errorMessage(
        error,
        "data.aiConversations 校验失败，已阻止后续操作。",
      ),
    };
  }
}

export function buildCreateAssessmentPayload(
  patientId: string,
  conversation: AiConversationSession,
  stagedDraft: StagedDraft,
  ad8Informant?: Ad8Informant,
): CreateAssessmentRequest {
  const draft = stagedDraft.response;
  const providerEvidence = requireObject(
    draft.rawInputSummary.evidence,
    "AI 评估建议缺少供应商证据，已阻止保存。",
  );
  const humanReview = requireObject(
    providerEvidence.humanReview,
    "AI 评估建议缺少人工复核证据，已阻止保存。",
  );
  const informant = isAd8AssessmentType(draft.assessmentType)
    ? requireAd8Informant(ad8Informant)
    : undefined;

  return {
    patientId,
    assessmentType: draft.assessmentType,
    scoreSummary: {
      ...validateScoreSummary(draft.assessmentType, draft.scoreSummary),
    },
    physicalConditions: normalizeAssessmentPhysicalConditions(
      stagedDraft.physicalConditions,
    ),
    rawInputSummary: {
      ...draft.rawInputSummary,
      physicalConditions: normalizeAssessmentPhysicalConditions(
        stagedDraft.physicalConditions,
      ),
      evidence: {
        ...providerEvidence,
        humanReview: {
          ...humanReview,
          required: true,
          status: "pending_human_review",
          conclusion: "approved",
        },
      },
      ...(informant === undefined ? {} : { informant }),
      conversationEvidence: {
        patientId,
        sessionId: conversation.id,
        status: conversation.status,
        assessmentType: conversation.assessmentType,
        physicalConditions: normalizeAssessmentPhysicalConditions(
          stagedDraft.physicalConditions,
        ),
        provider: conversation.provider,
        model: conversation.modelVersion,
        modelVersion: conversation.modelVersion,
        callId: conversation.callId,
        endpointRef: conversation.endpointRef,
        promptVersion: conversation.promptVersion,
        startedAt: conversation.startedAt,
        completedAt: conversation.completedAt,
        messages: (conversation.messages ?? []).map((message) => ({
          id: message.id,
          sessionId: message.sessionId,
          turnIndex: message.turnIndex,
          role: message.role,
          createdAt: message.createdAt,
          evidenceMetadata: message.evidenceMetadata,
        })),
      },
    },
  };
}

function isAd8AssessmentType(assessmentType: string) {
  const normalized = assessmentType.trim().toUpperCase();
  return normalized === "AD-8" || normalized === "AD8";
}

function requireAd8Informant(value: Ad8Informant | undefined): Ad8Informant {
  const name = value?.name.trim();
  const relation = value?.relation.trim();
  if (!name || !relation) {
    throw new AsyncResultValidationError(
      "AD-8 必须填写信息提供者姓名和与患者的关系。",
    );
  }
  return { name, relation };
}

function validatePendingConversation(
  conversation: AiConversationSession,
  patientId: string,
) {
  if (conversation.patientId !== patientId) {
    throw new AsyncResultValidationError(
      "AI 对话 patientId 与当前患者不一致，已阻止后续操作。",
    );
  }
  if (conversation.status !== "pending_human_review") {
    throw new AsyncResultValidationError(
      "AI 对话状态不是 pending_human_review，已阻止后续操作。",
    );
  }
  requireText(conversation.id, "AI 对话缺少 sessionId，已阻止后续操作。");
  requireText(
    conversation.assessmentType,
    "AI 对话缺少评估类型，已阻止后续操作。",
  );
  requireText(conversation.summary, "AI 对话缺少摘要，已阻止后续操作。");
  requireText(
    conversation.reviewNote,
    "AI 对话缺少提交复核说明，已阻止后续操作。",
  );
  readAiConversationPhysicalConditions(conversation);
  requireProviderEvidence(
    {
      provider: conversation.provider,
      model: conversation.modelVersion,
      modelVersion: conversation.modelVersion,
      callId: conversation.callId,
      endpointRef: conversation.endpointRef,
      promptVersion: conversation.promptVersion,
    },
    "AI 对话会话",
  );
  requireIsoDate(conversation.startedAt, "AI 对话 startedAt 无效。");
  requireIsoDate(conversation.completedAt, "AI 对话 completedAt 无效。");

  const metadata = requireObject(
    conversation.metadata,
    "AI 对话缺少会话元数据，已阻止后续操作。",
  );
  const humanReview = requireObject(
    metadata.humanReview,
    "AI 对话缺少人工复核状态证据，已阻止后续操作。",
  );
  if (
    humanReview.required !== true ||
    humanReview.status !== "pending_human_review"
  ) {
    throw new AsyncResultValidationError(
      "AI 对话人工复核状态证据无效，已阻止后续操作。",
    );
  }

  const messages = conversation.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AsyncResultValidationError(
      "AI 对话没有持久化消息，已阻止生成结构化建议。",
    );
  }
  const sortedMessages = [...messages].sort(
    (left, right) => left.turnIndex - right.turnIndex,
  );
  let assistantCount = 0;
  for (const [index, message] of sortedMessages.entries()) {
    if (message.sessionId !== conversation.id) {
      throw new AsyncResultValidationError(
        "AI 对话消息 sessionId 与当前会话不一致，已阻止后续操作。",
      );
    }
    if (message.turnIndex !== index + 1) {
      throw new AsyncResultValidationError(
        "AI 对话消息 turnIndex 不连续，已阻止后续操作。",
      );
    }
    requireText(message.id, "AI 对话消息缺少 ID，已阻止后续操作。");
    requireText(message.content, "AI 对话消息内容为空，已阻止后续操作。");
    requireIsoDate(message.createdAt, "AI 对话消息 createdAt 无效。");
    if (message.role === "assistant") {
      assistantCount += 1;
      const evidence = requireObject(
        message.evidenceMetadata,
        "AI 回复缺少供应商证据，已阻止后续操作。",
      );
      requireProviderEvidence(evidence, `AI 第 ${message.turnIndex} 轮回复`);
      requireIsoDate(
        evidence.calledAt,
        `AI 第 ${message.turnIndex} 轮回复 calledAt 无效。`,
      );
      if (evidence.source !== "provider_conversation_turn") {
        throw new AsyncResultValidationError(
          `AI 第 ${message.turnIndex} 轮回复来源证据无效，已阻止后续操作。`,
        );
      }
    }
  }
  if (!assistantCount) {
    throw new AsyncResultValidationError(
      "AI 对话没有带供应商证据的助手回复，已阻止后续操作。",
    );
  }
  const lastAssistant = [...sortedMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const lastEvidence = requireObject(
    lastAssistant?.evidenceMetadata,
    "AI 对话末轮回复证据缺失，已阻止后续操作。",
  );
  if (lastEvidence.callId !== conversation.callId) {
    throw new AsyncResultValidationError(
      "AI 对话会话 callId 与末轮回复证据不一致，已阻止后续操作。",
    );
  }
}

function validateAiAssessmentDraft(
  draft: AiAssessmentDraftResponse,
  expected: { assessmentType: string; patientId: string; transcript: string },
) {
  if (draft.patientId !== expected.patientId) {
    throw new AsyncResultValidationError(
      "AI 评估建议 patientId 与当前患者不一致，已阻止展示和保存。",
    );
  }
  if (draft.assessmentType !== expected.assessmentType) {
    throw new AsyncResultValidationError(
      "AI 评估建议类型与当前会话不一致，已阻止展示和保存。",
    );
  }
  if (draft.status !== "pending_human_review") {
    throw new AsyncResultValidationError(
      "AI 评估建议状态不是 pending_human_review，已阻止展示和保存。",
    );
  }
  if (!["low", "moderate", "high"].includes(draft.riskLevel)) {
    throw new AsyncResultValidationError(
      "AI 评估建议风险等级无效，已阻止展示和保存。",
    );
  }
  validateScoreSummary(draft.assessmentType, draft.scoreSummary);
  if (draft.rawInputSummary.source !== "production_ai_assessment") {
    throw new AsyncResultValidationError(
      "AI 评估建议来源不是 production_ai_assessment，已阻止保存。",
    );
  }
  if (draft.rawInputSummary.transcript !== expected.transcript) {
    throw new AsyncResultValidationError(
      "AI 评估建议 transcript 与本次对话输入不一致，已阻止保存。",
    );
  }
  requireText(
    draft.rawInputSummary.analysisSummary,
    "AI 评估建议缺少摘要，已阻止保存。",
  );
  requireText(
    draft.rawInputSummary.modelVersion,
    "AI 评估建议缺少模型版本，已阻止保存。",
  );
  requireNumberInRange(
    draft.rawInputSummary.confidence,
    0,
    1,
    "AI 评估建议置信度无效，已阻止保存。",
  );
  const evidence = requireObject(
    draft.rawInputSummary.evidence,
    "AI 评估建议缺少供应商证据，已阻止保存。",
  );
  requireProviderEvidence(evidence, "AI 评估建议");
  requireIsoDate(evidence.calledAt, "AI 评估建议 calledAt 无效。");
  if (evidence.modelVersion !== draft.rawInputSummary.modelVersion) {
    throw new AsyncResultValidationError(
      "AI 评估建议模型版本与供应商证据不一致，已阻止保存。",
    );
  }
  const humanReview = requireObject(
    evidence.humanReview,
    "AI 评估建议缺少人工复核状态证据，已阻止保存。",
  );
  if (
    humanReview.required !== true ||
    humanReview.status !== "pending_human_review"
  ) {
    throw new AsyncResultValidationError(
      "AI 评估建议人工复核状态证据无效，已阻止保存。",
    );
  }
}

function validateCreatedAssessment(
  assessment: AssessmentRecord,
  request: CreateAssessmentRequest,
  sessionId: string,
) {
  requireText(assessment.id, "正式评估响应缺少 assessmentId，已阻止继续操作。");
  if (assessment.status !== "completed") {
    throw new AsyncResultValidationError(
      "正式评估响应状态不是 completed，已阻止批准 AI 对话。",
    );
  }
  if (assessment.assessmentType !== request.assessmentType) {
    throw new AsyncResultValidationError(
      "正式评估响应类型与保存请求不一致，已阻止批准 AI 对话。",
    );
  }
  assertScoreEvidenceEqual(
    request.assessmentType,
    assessment.scoreSummary,
    request.scoreSummary,
  );
  const expectedRaw = requireObject(
    request.rawInputSummary,
    "正式评估请求 rawInputSummary 无效。",
  );
  const actualRaw = requireObject(
    assessment.rawInputSummary,
    "正式评估响应 rawInputSummary 无效，已阻止批准 AI 对话。",
  );
  for (const field of [
    "source",
    "transcript",
    "analysisSummary",
    "modelVersion",
    "confidence",
  ]) {
    if (actualRaw[field] !== expectedRaw[field]) {
      throw new AsyncResultValidationError(
        `正式评估响应 ${field} 与保存请求不一致，已阻止批准 AI 对话。`,
      );
    }
  }
  if (
    !Array.isArray(actualRaw.physicalConditions) ||
    !Array.isArray(expectedRaw.physicalConditions)
  ) {
    throw new AsyncResultValidationError(
      "正式评估响应缺少 physicalConditions，已阻止批准 AI 对话。",
    );
  }
  const actualPhysicalConditions = normalizeAssessmentPhysicalConditions(
    actualRaw.physicalConditions as AssessmentPhysicalCondition[],
  );
  const expectedPhysicalConditions = normalizeAssessmentPhysicalConditions(
    expectedRaw.physicalConditions as AssessmentPhysicalCondition[],
  );
  if (
    actualPhysicalConditions.length !== expectedPhysicalConditions.length ||
    actualPhysicalConditions.some(
      (value, index) => value !== expectedPhysicalConditions[index],
    )
  ) {
    throw new AsyncResultValidationError(
      "正式评估响应的身体状况与保存请求不一致，已阻止批准 AI 对话。",
    );
  }
  assertProviderEvidenceEqual(actualRaw.evidence, expectedRaw.evidence);
  const conversationEvidence = requireObject(
    actualRaw.conversationEvidence,
    "正式评估响应缺少 AI 对话证据，已阻止批准 AI 对话。",
  );
  if (
    conversationEvidence.patientId !== request.patientId ||
    conversationEvidence.sessionId !== sessionId ||
    conversationEvidence.status !== "pending_human_review"
  ) {
    throw new AsyncResultValidationError(
      "正式评估响应的 patientId/sessionId/status 对话证据不一致，已阻止批准 AI 对话。",
    );
  }
}

function findLinkedFormalAssessment(
  assessments: AssessmentRecord[] | undefined,
  patientId: string,
  sessionId: string,
) {
  if (!assessments) return undefined;
  const matches: AssessmentRecord[] = [];
  for (const assessment of assessments) {
    const rawInputSummary = readObject(assessment.rawInputSummary);
    const conversationEvidence = readObject(
      rawInputSummary.conversationEvidence,
    );
    if (conversationEvidence.sessionId !== sessionId) continue;
    if (
      conversationEvidence.patientId !== patientId ||
      conversationEvidence.status !== "pending_human_review"
    ) {
      throw new AsyncResultValidationError(
        "已保存正式评估的 patientId/sessionId/status 对话证据不一致，已阻止批准 AI 对话。",
      );
    }
    if (
      assessment.status !== "completed" &&
      assessment.status !== "doctor_confirmed"
    ) {
      throw new AsyncResultValidationError(
        "关联正式评估不处于可复核或已确认状态，已阻止批准 AI 对话。",
      );
    }
    validateScoreSummary(assessment.assessmentType, assessment.scoreSummary);
    const evidence = requireObject(
      rawInputSummary.evidence,
      "关联正式评估缺少供应商证据，已阻止批准 AI 对话。",
    );
    requireProviderEvidence(evidence, "关联正式评估");
    matches.push(assessment);
  }
  if (matches.length > 1) {
    throw new AsyncResultValidationError(
      "同一 AI 会话关联了多条正式评估，已阻止批准 AI 对话。",
    );
  }
  return matches[0];
}

function validateReviewedConversation(
  conversation: AiConversationSession,
  expected: {
    conclusion: "approved" | "returned";
    patientId: string;
    sessionId: string;
  },
) {
  if (
    conversation.id !== expected.sessionId ||
    conversation.patientId !== expected.patientId
  ) {
    throw new AsyncResultValidationError(
      "AI 对话复核响应的 patientId/sessionId 不一致，已阻止继续操作。",
    );
  }
  const expectedStatus =
    expected.conclusion === "approved" ? "reviewed" : "active";
  if (conversation.status !== expectedStatus) {
    throw new AsyncResultValidationError(
      `AI 对话复核响应状态不是 ${expectedStatus}，已阻止继续操作。`,
    );
  }
  for (const message of conversation.messages ?? []) {
    if (message.sessionId !== expected.sessionId) {
      throw new AsyncResultValidationError(
        "AI 对话复核响应包含 sessionId 不一致的消息，已阻止继续操作。",
      );
    }
  }
}

function validateScoreSummary(assessmentType: string, value: unknown) {
  const scores = requireObject(
    value,
    "AI 评估建议缺少结构化分数，已阻止保存。",
  );
  if (assessmentType.trim().toUpperCase() === "AD-8") {
    let total = 0;
    for (const field of ad8ItemFields) {
      const score = requireIntegerInRange(
        scores[field],
        0,
        1,
        `AI 评估建议 ${field} 不是 0 或 1，已阻止保存。`,
      );
      total += score;
    }
    const ad8Total = requireIntegerInRange(
      scores.ad8Total,
      0,
      8,
      "AI 评估建议 AD-8 总分无效，已阻止保存。",
    );
    if (ad8Total !== total) {
      throw new AsyncResultValidationError(
        "AI 评估建议 AD-8 总分与 8 个题项不一致，已阻止保存。",
      );
    }
    return Object.fromEntries([
      ...ad8ItemFields.map((field) => [field, scores[field] as number]),
      ["ad8Total", ad8Total],
    ]);
  }

  const ranges = {
    mmse: [0, 30],
    cdr: [0, 3],
    memory: [0, 100],
    orientation: [0, 100],
    executive: [0, 100],
    language: [0, 100],
  } as const;
  return Object.fromEntries(
    Object.entries(ranges).map(([field, [min, max]]) => [
      field,
      requireNumberInRange(
        scores[field],
        min,
        max,
        `AI 评估建议 ${field} 分数无效，已阻止保存。`,
      ),
    ]),
  );
}

function assertScoreEvidenceEqual(
  assessmentType: string,
  actual: unknown,
  expected: unknown,
) {
  const actualScores = validateScoreSummary(assessmentType, actual);
  const expectedScores = validateScoreSummary(assessmentType, expected);
  for (const [field, expectedValue] of Object.entries(expectedScores)) {
    if (actualScores[field] !== expectedValue) {
      throw new AsyncResultValidationError(
        `正式评估响应 ${field} 分数与 AI 证据不一致，已阻止批准 AI 对话。`,
      );
    }
  }
}

function assertProviderEvidenceEqual(
  actualValue: unknown,
  expectedValue: unknown,
) {
  const actual = requireObject(
    actualValue,
    "正式评估响应缺少供应商证据，已阻止批准 AI 对话。",
  );
  const expected = requireObject(expectedValue, "正式评估请求缺少供应商证据。");
  for (const field of [
    "provider",
    "model",
    "modelVersion",
    "callId",
    "endpointRef",
    "promptVersion",
    "calledAt",
  ]) {
    if (actual[field] !== expected[field]) {
      throw new AsyncResultValidationError(
        `正式评估响应 ${field} 供应商证据与 AI 草稿不一致，已阻止批准 AI 对话。`,
      );
    }
  }
}

function requireProviderEvidence(
  value: Record<string, unknown>,
  label: string,
) {
  requireText(value.provider, `${label}缺少 provider 证据。`);
  requireText(value.model, `${label}缺少 model 证据。`);
  requireText(value.modelVersion, `${label}缺少 modelVersion 证据。`);
  requireText(value.callId, `${label}缺少 callId 证据。`);
  const endpointRef = requireText(
    value.endpointRef,
    `${label}缺少 endpointRef 证据。`,
  );
  let endpoint: URL;
  try {
    endpoint = new URL(endpointRef);
  } catch {
    throw new AsyncResultValidationError(`${label} endpointRef 证据无效。`);
  }
  if (endpoint.protocol !== "https:") {
    throw new AsyncResultValidationError(
      `${label} endpointRef 不是 HTTPS 证据。`,
    );
  }
  requireText(value.promptVersion, `${label}缺少 promptVersion 证据。`);
}

function requireObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AsyncResultValidationError(message);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AsyncResultValidationError(message);
  }
  return value;
}

function requireIsoDate(value: unknown, message: string) {
  const text = requireText(value, message);
  if (Number.isNaN(Date.parse(text))) {
    throw new AsyncResultValidationError(message);
  }
  return text;
}

function requireNumberInRange(
  value: unknown,
  min: number,
  max: number,
  message: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new AsyncResultValidationError(message);
  }
  return value;
}

function requireIntegerInRange(
  value: unknown,
  min: number,
  max: number,
  message: string,
) {
  const result = requireNumberInRange(value, min, max, message);
  if (!Number.isInteger(result)) {
    throw new AsyncResultValidationError(message);
  }
  return result;
}

function assertCurrentContext(
  patientId: string,
  sessionId: string,
  patientRef: { current: string | null | undefined },
  conversationRef: { current: string | undefined },
) {
  if (
    patientRef.current !== patientId ||
    conversationRef.current !== sessionId
  ) {
    throw new AsyncResultValidationError(
      "异步响应返回时 patientId/sessionId 已变化，已阻止继续操作。",
    );
  }
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: Record<string, unknown>, field: string) {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function formatConfidence(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function riskLabel(value: AiAssessmentDraftResponse["riskLevel"]) {
  if (value === "low") return "低";
  if (value === "moderate") return "中";
  return "高";
}

function errorMessage(error: unknown, defaultMessage: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : defaultMessage;
}

class AsyncResultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncResultValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
