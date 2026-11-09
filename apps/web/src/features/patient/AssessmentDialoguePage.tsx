"use client";

import {
  AudioLines,
  Brain,
  ClipboardCheck,
  Mic,
  Play,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  isAssessmentPhysicalConditionSelectionComplete,
  isAssessmentSubmissionFormComplete,
  normalizeAssessmentPhysicalConditions,
  type Ad8AssessmentFormState,
  type AssessmentDraftFormField,
  type AssessmentDraftFormState,
} from "@/lib/ai-assessment-draft";
import { resolveSupportedAssessmentAudioMimeType } from "@/lib/assessment-speech-transcript";
import { createHighCostIdempotencyKey } from "@/lib/high-cost-request-intent";
import { cn } from "@/lib/utils";
import type {
  AiConversationMessage,
  AiConversationSession,
  AssessmentPhysicalCondition,
  AssessmentRecord,
} from "@/types/api";
import {
  clinicalScoreLabel,
  riskLabel,
  riskTone,
  type StatusTone,
} from "./plan-suggestion-model";

export type AssessmentPhysicalConditionChoice = {
  id: AssessmentPhysicalCondition;
  label: string;
  description: string;
};

export const assessmentPhysicalConditionChoices = [
  {
    id: "no_known_limitations",
    label: "无上述特殊限制",
    description: "已确认不需要针对下列身体情况调整评估流程。",
  },
  {
    id: "wheelchair",
    label: "我需要使用轮椅",
    description: "评估时请安排稳定座位与充足转身空间。",
  },
  {
    id: "upper_limb_limited",
    label: "我上肢活动不便",
    description: "评估时请减少需要抬手或持续握持的动作。",
  },
] as const satisfies readonly AssessmentPhysicalConditionChoice[];

const ad8DraftFieldChoices = [
  ["itemMemoryProblems", "记忆问题（0/1）"],
  ["itemReducedInterest", "兴趣减退（0/1）"],
  ["itemRepeatsQuestions", "重复提问（0/1）"],
  ["itemTroubleLearningTools", "学习工具困难（0/1）"],
  ["itemForgetsMonthYear", "忘记年月（0/1）"],
  ["itemHandlesFinancesPoorly", "财务处理困难（0/1）"],
  ["itemTroubleAppointments", "记住约定困难（0/1）"],
  ["itemDailyThinkingMemoryProblems", "日常思考记忆困难（0/1）"],
] as const satisfies readonly (readonly [AssessmentDraftFormField, string])[];

type AssessmentDialogueActionState = {
  isDisabled?: boolean;
  isLoading?: boolean;
  label?: string;
};

export type AssessmentFormState = AssessmentDraftFormState;

export type AiConversationFormState = {
  sessionId: string;
  content: string;
  summary: string;
  reviewNote: string;
};

export type AssessmentSpeechRecording = {
  recordingId: string;
  audioBlob: Blob;
  startedAtMs: number;
  endedAtMs: number;
};

export const emptyAiConversationForm: AiConversationFormState = {
  sessionId: "",
  content: "",
  summary: "",
  reviewNote: "",
};

export const emptyAd8AssessmentForm: Ad8AssessmentFormState = {
  informantName: "",
  informantRelation: "",
  assessmentSource: "caregiver_interview",
  itemMemoryProblems: "",
  itemReducedInterest: "",
  itemRepeatsQuestions: "",
  itemTroubleLearningTools: "",
  itemForgetsMonthYear: "",
  itemHandlesFinancesPoorly: "",
  itemTroubleAppointments: "",
  itemDailyThinkingMemoryProblems: "",
  summaryText: "",
  clinicianConclusion: "",
  confidence: "",
};

export const emptyAssessmentForm: AssessmentFormState = {
  assessmentType: "",
  riskLevel: "",
  physicalConditions: [],
  informantName: "",
  informantRelation: "",
  assessmentSource: "caregiver_interview",
  mmse: "",
  cdr: "",
  memory: "",
  orientation: "",
  executive: "",
  language: "",
  ad8Total: "",
  itemMemoryProblems: "",
  itemReducedInterest: "",
  itemRepeatsQuestions: "",
  itemTroubleLearningTools: "",
  itemForgetsMonthYear: "",
  itemHandlesFinancesPoorly: "",
  itemTroubleAppointments: "",
  itemDailyThinkingMemoryProblems: "",
  transcript: "",
  reactionDelaySeconds: "",
  modelVersion: "",
  confidence: "",
  analysisSummary: "",
  aiDraftEvidence: undefined,
};

export function findActiveAiConversation(
  conversations?: AiConversationSession[],
) {
  return conversations?.find(
    (conversation) => conversation.status === "active",
  );
}

export function upsertAiConversationSession(
  conversations: AiConversationSession[],
  session: AiConversationSession,
) {
  const existing = conversations.find(
    (conversation) => conversation.id === session.id,
  );
  if (!existing) return [session, ...conversations];
  return conversations.map((conversation) =>
    conversation.id === session.id
      ? {
          ...existing,
          ...session,
          messages: session.messages ?? existing.messages,
        }
      : conversation,
  );
}

export function upsertAiConversationMessages(
  conversations: AiConversationSession[],
  conversationId: string,
  messages: AiConversationMessage[],
) {
  return conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    const currentMessages = conversation.messages ?? [];
    const messageIds = new Set(currentMessages.map((message) => message.id));
    return {
      ...conversation,
      messages: [
        ...currentMessages,
        ...messages.filter((message) => !messageIds.has(message.id)),
      ],
    };
  });
}

export function isAssessmentFormComplete(form: AssessmentFormState) {
  return isAssessmentSubmissionFormComplete(form);
}

export function toggleAssessmentPhysicalCondition(
  current: AssessmentPhysicalCondition[],
  condition: AssessmentPhysicalCondition,
) {
  if (!current.length) return [condition];

  const normalizedCurrent = normalizeAssessmentPhysicalConditions(current);
  if (condition === "no_known_limitations") {
    return [condition];
  }

  const currentLimitations = normalizedCurrent.filter(
    (value) => value !== "no_known_limitations",
  );
  if (currentLimitations.includes(condition)) {
    return currentLimitations.length === 1
      ? normalizedCurrent
      : currentLimitations.filter((value) => value !== condition);
  }
  return normalizeAssessmentPhysicalConditions([
    ...currentLimitations,
    condition,
  ]);
}

type AssessmentScreenProps = {
  assessments?: AssessmentRecord[];
  onCreateAiAssessmentDraft: (form: AssessmentFormState) => Promise<void>;
  onCreateAssessmentSpeechTranscript: (
    recording: AssessmentSpeechRecording,
  ) => Promise<void>;
  onCreateSpeechAiAssessmentDraft: (
    recording: AssessmentSpeechRecording,
  ) => Promise<void>;
  onCreateTtsSpeechOutput: (text: string) => Promise<void>;
  aiConversations?: AiConversationSession[];
  aiConversationForm: AiConversationFormState;
  onAiConversationFormChange: <K extends keyof AiConversationFormState>(
    field: K,
    value: AiConversationFormState[K],
  ) => void;
  onStartAiConversation: () => Promise<void>;
  onAppendAiConversationMessage: () => Promise<void>;
  onCompleteAiConversation: () => Promise<void>;
  assessmentForm: AssessmentFormState;
  onAssessmentFormChange: (
    field: AssessmentDraftFormField,
    value: string,
  ) => void;
  onAssessmentPhysicalConditionsChange: (
    physicalConditions: AssessmentPhysicalCondition[],
  ) => void;
  hasMicrophoneConsent: boolean;
  isDraftBusy: boolean;
  isSpeechBusy: boolean;
  isSpeechAiDraftBusy: boolean;
  isTtsBusy: boolean;
  isAiConversationBusy: boolean;
  showTechnicalEvidence: boolean;
  canUseAiAssessment: boolean;
};

export function AssessmentScreen({
  assessments,
  onCreateAiAssessmentDraft,
  onCreateAssessmentSpeechTranscript,
  onCreateSpeechAiAssessmentDraft,
  onCreateTtsSpeechOutput,
  aiConversations,
  aiConversationForm,
  onAiConversationFormChange,
  onStartAiConversation,
  onAppendAiConversationMessage,
  onCompleteAiConversation,
  assessmentForm,
  onAssessmentFormChange,
  onAssessmentPhysicalConditionsChange,
  hasMicrophoneConsent,
  isDraftBusy,
  isSpeechBusy,
  isSpeechAiDraftBusy,
  isTtsBusy,
  isAiConversationBusy,
  showTechnicalEvidence,
  canUseAiAssessment,
}: AssessmentScreenProps) {
  const assessment = assessments?.[0];
  const transcript = readString(
    assessment?.rawInputSummary?.transcript,
    "等待评估人员录入问答转写或摘要",
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecorderStatus, setSpeechRecorderStatus] = useState<
    string | null
  >(null);

  useEffect(() => {
    return () => {
      releaseAssessmentSpeechRecorder({
        mediaRecorderRef,
        recordingStreamRef,
        recordingChunksRef,
        recordingStartedAtMsRef,
      });
    };
  }, []);

  if (!canUseAiAssessment) {
    return <PatientAssessmentSummaryScreen assessments={assessments} />;
  }

  const hasExplicitPhysicalCondition =
    isAssessmentPhysicalConditionSelectionComplete(
      assessmentForm.physicalConditions,
    );

  function requireExplicitPhysicalCondition() {
    if (hasExplicitPhysicalCondition) return true;
    setSpeechRecorderStatus(
      "请先明确选择身体情况，再提交 AI 评估、语音或智能对话。",
    );
    return false;
  }

  async function handleStartSpeechRecording() {
    if (!requireExplicitPhysicalCondition()) return;
    if (!hasMicrophoneConsent) {
      setSpeechRecorderStatus("请先签署语音评估授权，再开始语音评估录音。");
      return;
    }
    if (
      isRecording ||
      isDraftBusy ||
      isSpeechBusy ||
      isSpeechAiDraftBusy ||
      isTtsBusy
    ) {
      return;
    }

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error("当前浏览器不支持评估录音，请更换浏览器后再试。");
      }
      if (typeof MediaRecorder === "undefined") {
        throw new Error(
          "当前浏览器不支持评估录音，请更换为最新版 Chrome、Edge 或 Safari 后再试。",
        );
      }

      const mimeType = resolveSupportedAssessmentAudioMimeType((candidate) =>
        MediaRecorder.isTypeSupported(candidate),
      );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });

      recordingChunksRef.current = [];
      recordingStartedAtMsRef.current = Date.now();
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        setSpeechRecorderStatus(
          "录音设备发生错误，本次语音转写未提交。请检查麦克风权限和设备状态。",
        );
        setIsRecording(false);
        releaseAssessmentSpeechRecorder({
          mediaRecorderRef,
          recordingStreamRef,
          recordingChunksRef,
          recordingStartedAtMsRef,
        });
      });

      recorder.start();
      setIsRecording(true);
      setSpeechRecorderStatus("录音中，请完成本轮评估问答后点击停止并转写。");
    } catch (error) {
      setIsRecording(false);
      releaseAssessmentSpeechRecorder({
        mediaRecorderRef,
        recordingStreamRef,
        recordingChunksRef,
        recordingStartedAtMsRef,
      });
      setSpeechRecorderStatus(
        error instanceof Error ? error.message : "语音录音启动失败。",
      );
    }
  }

  async function handleStopSpeechRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setSpeechRecorderStatus("当前没有正在进行的评估录音。");
      return;
    }

    setSpeechRecorderStatus("正在结束录音并提交语音转写。");
    setIsRecording(false);

    try {
      const recording = await stopAssessmentSpeechRecorder({
        recorder,
        mediaRecorderRef,
        recordingStreamRef,
        recordingChunksRef,
        recordingStartedAtMsRef,
      });
      if (!requireExplicitPhysicalCondition()) return;
      await onCreateAssessmentSpeechTranscript(recording);
      setSpeechRecorderStatus(
        "录音已结束。若转写成功，文本会回填到下方问答转写框。",
      );
    } catch (error) {
      releaseAssessmentSpeechRecorder({
        mediaRecorderRef,
        recordingStreamRef,
        recordingChunksRef,
        recordingStartedAtMsRef,
      });
      setSpeechRecorderStatus(
        error instanceof Error ? error.message : "语音录音结束失败。",
      );
    }
  }

  async function handleStopSpeechRecordingAndCreateDraft() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setSpeechRecorderStatus("当前没有正在进行的评估录音。");
      return;
    }

    setSpeechRecorderStatus("正在结束录音，转写后生成待复核评估建议。");
    setIsRecording(false);

    try {
      const recording = await stopAssessmentSpeechRecorder({
        recorder,
        mediaRecorderRef,
        recordingStreamRef,
        recordingChunksRef,
        recordingStartedAtMsRef,
      });
      if (!requireExplicitPhysicalCondition()) return;
      await onCreateSpeechAiAssessmentDraft(recording);
      setSpeechRecorderStatus(
        "录音已结束。语音转写和评估建议会填入表单，医生复核前不会提交正式评估。",
      );
    } catch (error) {
      releaseAssessmentSpeechRecorder({
        mediaRecorderRef,
        recordingStreamRef,
        recordingChunksRef,
        recordingStartedAtMsRef,
      });
      setSpeechRecorderStatus(
        error instanceof Error ? error.message : "语音评估建议生成失败。",
      );
    }
  }

  const questionPrompt = "请告诉我，今天是星期几？";
  return (
    <div className="grid gap-5">
      <AssessmentDialoguePage
        assessmentStatusLabel={patientAssessmentStatusLabel(assessment)}
        aiDraftStatusLabel={
          assessmentForm.aiDraftEvidence ? "待医生确认" : "等待智能建议"
        }
        physicalConditions={assessmentForm.physicalConditions}
        onPhysicalConditionsChange={onAssessmentPhysicalConditionsChange}
        hasMicrophoneConsent={hasMicrophoneConsent}
        isRecording={isRecording}
        questionPrompt={questionPrompt}
        speechRecorderStatus={speechRecorderStatus}
        transcriptSummary={transcript}
        isPhysicalConditionSelectionDisabled={
          isRecording ||
          isDraftBusy ||
          isSpeechBusy ||
          isSpeechAiDraftBusy ||
          isTtsBusy ||
          isAiConversationBusy
        }
        voiceInput={{
          isDisabled:
            !hasExplicitPhysicalCondition ||
            isDraftBusy ||
            isSpeechBusy ||
            isSpeechAiDraftBusy ||
            isTtsBusy ||
            isAiConversationBusy,
          isLoading: isSpeechBusy || isSpeechAiDraftBusy,
          label: !hasExplicitPhysicalCondition
            ? "请先明确身体情况"
            : hasMicrophoneConsent
              ? "开始语音评估录音"
              : "需先签署麦克风授权",
          stopTranscriptLabel: isSpeechBusy ? "正在转写" : "停止并转写",
          stopTranscriptAndDraftLabel: isSpeechAiDraftBusy
            ? "正在生成评估建议"
            : "停止转写并生成评估建议",
          onStart: () => void handleStartSpeechRecording(),
          onStopTranscript: () => void handleStopSpeechRecording(),
          onStopTranscriptAndDraft: () =>
            void handleStopSpeechRecordingAndCreateDraft(),
        }}
        ttsPlayback={{
          isDisabled:
            isDraftBusy ||
            isSpeechBusy ||
            isSpeechAiDraftBusy ||
            isTtsBusy ||
            isRecording ||
            isAiConversationBusy,
          isLoading: isTtsBusy,
          label: isTtsBusy ? "正在生成语音" : "播放评估题目语音",
          onCreateTtsSpeechOutput: () =>
            void onCreateTtsSpeechOutput(questionPrompt),
        }}
        aiDraft={{
          isDisabled:
            !hasExplicitPhysicalCondition ||
            isDraftBusy ||
            isSpeechBusy ||
            isSpeechAiDraftBusy ||
            isTtsBusy ||
            isRecording ||
            isAiConversationBusy ||
            !assessmentForm.transcript.trim() ||
            Boolean(assessmentForm.aiDraftEvidence),
          isLoading: isDraftBusy,
          label: isDraftBusy
            ? "正在生成评估建议"
            : !hasExplicitPhysicalCondition
              ? "请先明确身体情况"
              : assessmentForm.aiDraftEvidence
                ? "待医生复核评估建议"
                : "生成待复核评估建议",
          onCreateAiAssessmentDraft: () => {
            if (!requireExplicitPhysicalCondition()) return;
            void onCreateAiAssessmentDraft(assessmentForm);
          },
        }}
      />
      <p className="sr-only">
        智能对话材料需提交给医生复核，且不会直接保存为正式评估。
      </p>
      <AiConversationPanel
        conversations={aiConversations}
        form={aiConversationForm}
        onChange={onAiConversationFormChange}
        onStart={async () => {
          if (!requireExplicitPhysicalCondition()) return;
          await onStartAiConversation();
        }}
        onAppend={async () => {
          if (!requireExplicitPhysicalCondition()) return;
          await onAppendAiConversationMessage();
        }}
        onComplete={async () => {
          if (!requireExplicitPhysicalCondition()) return;
          await onCompleteAiConversation();
        }}
        isBusy={isAiConversationBusy}
        disabled={
          !hasExplicitPhysicalCondition ||
          isDraftBusy ||
          isSpeechBusy ||
          isSpeechAiDraftBusy ||
          isTtsBusy ||
          isRecording ||
          isAiConversationBusy
        }
      />
      <AssessmentInputPanel
        form={assessmentForm}
        onChange={onAssessmentFormChange}
        showTechnicalEvidence={showTechnicalEvidence}
        disabled={
          isDraftBusy ||
          isSpeechBusy ||
          isSpeechAiDraftBusy ||
          isAiConversationBusy
        }
      />
    </div>
  );
}

type AssessmentDialoguePageProps = {
  assessmentStatusLabel: string;
  questionPrompt: string;
  transcriptSummary: string;
  aiDraftStatusLabel: string;
  speechRecorderStatus?: string | null;
  hasMicrophoneConsent: boolean;
  isRecording: boolean;
  isPhysicalConditionSelectionDisabled: boolean;
  physicalConditions: AssessmentPhysicalCondition[];
  onPhysicalConditionsChange: (
    physicalConditions: AssessmentPhysicalCondition[],
  ) => void;
  voiceInput: AssessmentDialogueActionState & {
    stopTranscriptLabel?: string;
    stopTranscriptAndDraftLabel?: string;
    onStart: () => void;
    onStopTranscript: () => void;
    onStopTranscriptAndDraft: () => void;
  };
  ttsPlayback: AssessmentDialogueActionState & {
    onCreateTtsSpeechOutput: () => void;
  };
  aiDraft: AssessmentDialogueActionState & {
    onCreateAiAssessmentDraft: () => void;
  };
  children?: ReactNode;
};

export function AssessmentDialoguePage({
  assessmentStatusLabel,
  questionPrompt,
  transcriptSummary,
  aiDraftStatusLabel,
  speechRecorderStatus,
  hasMicrophoneConsent,
  isRecording,
  isPhysicalConditionSelectionDisabled,
  physicalConditions,
  onPhysicalConditionsChange,
  voiceInput,
  ttsPlayback,
  aiDraft,
  children,
}: AssessmentDialoguePageProps) {
  const hasExplicitPhysicalCondition =
    isAssessmentPhysicalConditionSelectionComplete(physicalConditions);
  const isVoiceActionBlocked =
    Boolean(voiceInput.isDisabled) || !hasMicrophoneConsent;
  const isSpeechStopBlocked = Boolean(voiceInput.isDisabled) || !isRecording;

  return (
    <div className="grid gap-5">
      <Card tone="patient" className="overflow-hidden p-0">
        <div className="bg-[var(--surface-muted)] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-panel)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
                <Brain className="h-4 w-4" aria-hidden="true" />
                认知评估
              </div>
              <h3 className="mt-5 max-w-4xl break-words text-3xl font-black leading-tight text-[var(--ink-strong)] md:text-4xl">
                {questionPrompt}
              </h3>
              <p className="mt-4 max-w-3xl text-lg font-bold leading-8 text-[var(--ink-soft)]">
                按现场引导完成问答和必要说明，医生确认后才会形成正式评估记录。
              </p>
            </div>
            <StatusBadge status={isRecording ? "pending" : "review"}>
              {assessmentStatusLabel}
            </StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
                  <AudioLines className="h-4 w-4" aria-hidden="true" />
                  身体情况
                </div>
                <StatusBadge
                  status={hasExplicitPhysicalCondition ? "ready" : "blocked"}
                >
                  {hasExplicitPhysicalCondition ? "已明确" : "必须选择"}
                </StatusBadge>
              </div>
              <p
                aria-live="polite"
                className={cn(
                  "mt-3 text-sm font-bold leading-6",
                  hasExplicitPhysicalCondition
                    ? "text-[var(--ink-soft)]"
                    : "text-[var(--danger)]",
                )}
              >
                {hasExplicitPhysicalCondition
                  ? "已记录本次评估需要考虑的身体情况。"
                  : "请明确选择一种身体状态后再开始 AI 评估、语音或智能对话。"}
              </p>
              <div className="mt-4 grid gap-3">
                {assessmentPhysicalConditionChoices.map((choice) => {
                  const isSelected = physicalConditions.includes(choice.id);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      disabled={isPhysicalConditionSelectionDisabled}
                      className={cn(
                        "flex gap-3 rounded-[var(--radius-card)] border bg-[var(--surface-panel)] p-4 text-left disabled:cursor-not-allowed disabled:opacity-55",
                        isSelected
                          ? "border-[var(--accent-strong)]"
                          : "border-[var(--line-subtle)]",
                      )}
                      onClick={() =>
                        onPhysicalConditionsChange(
                          toggleAssessmentPhysicalCondition(
                            physicalConditions,
                            choice.id,
                          ),
                        )
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1 h-4 w-4 shrink-0 rounded-[var(--radius-control)] border border-[var(--accent-strong)]",
                          isSelected
                            ? "bg-[var(--accent-strong)]"
                            : "bg-[var(--surface-paper)]",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-black text-[var(--ink-strong)]">
                          {choice.label}
                        </span>
                        <span className="mt-1 block break-words text-sm font-bold leading-6 text-[var(--ink-soft)]">
                          {choice.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    语音输入
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                    录音结束后会整理为评估文字，供医生确认后使用。
                  </p>
                </div>
                <StatusBadge
                  status={hasMicrophoneConsent ? "ready" : "blocked"}
                >
                  {hasMicrophoneConsent ? "已授权" : "待授权"}
                </StatusBadge>
              </div>

              {speechRecorderStatus ? (
                <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                  {speechRecorderStatus}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  className="min-h-12 px-5 text-base"
                  disabled={isVoiceActionBlocked || isRecording}
                  isLoading={voiceInput.isLoading && !isRecording}
                  onClick={voiceInput.onStart}
                >
                  {voiceInput.label ??
                    (hasMicrophoneConsent ? "开始语音输入" : "需先完成授权")}
                </Button>
                <Button
                  className="min-h-12 px-5 text-base"
                  disabled={isSpeechStopBlocked}
                  intent="secondary"
                  onClick={voiceInput.onStopTranscript}
                >
                  {voiceInput.stopTranscriptLabel ?? "停止并转写"}
                </Button>
                <Button
                  className="min-h-12 px-5 text-base"
                  disabled={isSpeechStopBlocked}
                  intent="secondary"
                  onClick={voiceInput.onStopTranscriptAndDraft}
                >
                  {voiceInput.stopTranscriptAndDraftLabel ??
                    "停止转写并生成评估建议"}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card tone="patient">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
                <Play className="h-4 w-4" aria-hidden="true" />
                播放题目语音
              </div>
              <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">
                播放当前题目，便于现场保持一致引导。
              </p>
            </div>
            <StatusBadge status={ttsPlayback.isLoading ? "pending" : "ready"}>
              {ttsPlayback.isLoading ? "正在生成" : "可播放"}
            </StatusBadge>
          </div>
          <Button
            className="mt-5 w-full"
            disabled={ttsPlayback.isDisabled}
            isLoading={ttsPlayback.isLoading}
            onClick={ttsPlayback.onCreateTtsSpeechOutput}
          >
            {ttsPlayback.label ?? "播放题目语音"}
          </Button>
        </Card>

        <Card tone="patient">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                评估建议
              </div>
              <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">
                当前转写：{transcriptSummary}
              </p>
            </div>
            <StatusBadge status="review">{aiDraftStatusLabel}</StatusBadge>
          </div>
          <div className="mt-5">
            <Button
              className="w-full"
              disabled={aiDraft.isDisabled}
              isLoading={aiDraft.isLoading}
              onClick={aiDraft.onCreateAiAssessmentDraft}
            >
              {aiDraft.label ?? "生成待医生确认建议"}
            </Button>
          </div>
        </Card>
      </div>
      {children}
    </div>
  );
}

function PatientAssessmentSummaryScreen({
  assessments,
}: {
  assessments?: AssessmentRecord[];
}) {
  const latestAssessment = assessments?.[0];
  const latestAd8 = assessments?.find(
    (record) => record.assessmentType === "AD-8",
  );
  const latestRisk = latestAssessment?.riskGrades?.find(
    (risk) => risk.isCurrent,
  );
  const assessmentStatus = assessmentDoctorConfirmationStatus(latestAssessment);
  const assessmentDate = latestAssessment
    ? formatDateTime(latestAssessment.createdAt)
    : "等待医生完成评估";

  return (
    <div className="grid gap-5">
      <Card tone="patient">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge label="评估状态" icon={ClipboardCheck} />
            <h3 className="mt-4 text-3xl font-black text-[var(--ink-strong)]">
              {assessmentStatus.title}
            </h3>
            <p className="mt-3 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
              {latestAssessment
                ? `最近评估时间：${assessmentDate}。${assessmentStatus.description}`
                : "医生完成评估并确认结果后，这里会显示评估状态和后续训练安排。"}
            </p>
          </div>
          <StatusBadge status={assessmentStatus.status}>
            {assessmentStatus.label}
          </StatusBadge>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="最近评估"
          value={
            assessmentStatus.isConfirmed
              ? (latestAssessment?.assessmentType ?? "待安排")
              : latestAssessment
                ? "待医生确认"
                : "待安排"
          }
          description={
            assessmentStatus.isConfirmed
              ? "医生会根据患者状态选择合适的量表。"
              : latestAssessment
                ? "评估记录已提交，等待医生确认。"
                : "请等待医师或评估人员安排。"
          }
        />
        <SummaryCard
          title="风险提示"
          value={
            assessmentStatus.isConfirmed
              ? riskLabel(latestRisk?.riskLevel)
              : "待医生确认"
          }
          description={
            assessmentStatus.isConfirmed
              ? `当前状态：${riskTone(latestRisk?.riskLevel) === "warning" ? "需关注" : "按医嘱跟进"}`
              : "医生确认后再展示必要提示。"
          }
        />
        <SummaryCard
          title="AD-8 访谈"
          value={
            assessmentStatus.isConfirmed && latestAd8
              ? clinicalScoreLabel(latestAd8.scoreSummary.ad8Total, "/8")
              : assessmentStatus.isConfirmed
                ? "按需安排"
                : "待医生确认"
          }
          description="仅展示医生确认后的必要摘要。"
        />
      </div>
    </div>
  );
}

function assessmentDoctorConfirmationStatus(assessment?: AssessmentRecord) {
  if (!assessment) {
    return {
      description:
        "医生完成评估并确认结果后，这里会显示评估状态和后续训练安排。",
      isConfirmed: false,
      label: "待评估",
      status: "pending" as const,
      title: "等待医生完成评估",
    };
  }

  if (isDoctorConfirmedAssessment(assessment)) {
    return {
      description:
        "医生已确认评估记录，如已下发康复计划，可回到今日训练继续完成处方。",
      isConfirmed: true,
      label: "医生已确认",
      status: "complete" as const,
      title: "医生已确认评估",
    };
  }

  return {
    description: "评估记录已提交，医生确认后才会形成正式评估结论。",
    isConfirmed: false,
    label: "待医生确认",
    status: "review" as const,
    title: "评估待医生确认",
  };
}

function patientAssessmentStatusLabel(assessment?: AssessmentRecord) {
  if (!assessment) return "AI评估待完成";
  if (assessment.status === "doctor_confirmed") return "已有正式评估";
  if (assessment.status === "completed") return "待医生确认";
  if (assessment.status === "returned_for_review") return "已退回复核";
  return "评估状态待确认";
}

function isDoctorConfirmedAssessment(assessment: AssessmentRecord) {
  return assessment.status === "doctor_confirmed";
}

function AiConversationPanel({
  conversations,
  form,
  onChange,
  onStart,
  onAppend,
  onComplete,
  isBusy,
  disabled,
}: {
  conversations?: AiConversationSession[];
  form: AiConversationFormState;
  onChange: <K extends keyof AiConversationFormState>(
    field: K,
    value: AiConversationFormState[K],
  ) => void;
  onStart: () => Promise<void>;
  onAppend: () => Promise<void>;
  onComplete: () => Promise<void>;
  isBusy: boolean;
  disabled: boolean;
}) {
  const conversationsUnavailable = conversations === undefined;
  const activeConversation =
    conversations?.find((conversation) => conversation.id === form.sessionId) ??
    findActiveAiConversation(conversations) ??
    conversations?.[0];
  const messages = activeConversation?.messages ?? [];
  const activeSessionId = activeConversation?.id ?? "";
  const canSend =
    Boolean(activeSessionId) &&
    activeConversation?.status === "active" &&
    Boolean(form.content.trim()) &&
    !disabled &&
    !isBusy;
  const canComplete =
    Boolean(activeSessionId) &&
    activeConversation?.status === "active" &&
    Boolean(form.summary.trim()) &&
    Boolean(form.reviewNote.trim()) &&
    !disabled &&
    !isBusy;

  return (
    <Card tone="patient" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="智能对话" icon={Sparkles} />
          <h3 className="mt-3 text-3xl font-black text-[var(--ink-strong)]">
            多轮问答评估
          </h3>
          <p className="mt-3 max-w-4xl font-bold leading-7 text-[var(--ink-soft)]">
            围绕记忆、定向力、睡眠、用药和日常活动逐轮追问。对话只形成待复核材料，
            不会直接保存为正式评估。
          </p>
        </div>
        <StatusBadge status={activeConversation ? "ready" : "pending"}>
          {activeConversation
            ? activeConversation.status === "pending_human_review"
              ? "已提交复核"
              : "对话进行中"
            : "待开始"}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[var(--accent-strong)]">
                对话记录
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                页面只展示医生需要阅读的对话内容。
              </p>
            </div>
            <Button
              disabled={
                disabled || isBusy || activeConversation?.status === "active"
              }
              onClick={() => void onStart()}
            >
              {isBusy && !activeConversation ? "正在开始" : "开始智能对话"}
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {conversationsUnavailable ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 text-center font-bold leading-7 text-[var(--warning)]">
                智能评估对话未加载，暂时无法显示历史对话。
              </div>
            ) : messages.length ? (
              messages.map((message) => (
                <AiConversationMessageBubble
                  key={message.id}
                  message={message}
                />
              ))
            ) : (
              <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-paper)] p-5 text-center font-bold leading-7 text-[var(--ink-subtle)]">
                暂无对话。开始后可先输入患者或家属描述，系统会继续追问需要补充的信息。
              </div>
            )}
          </div>

          <div className="mt-5">
            <FormTextarea
              label="本轮问答内容"
              value={form.content}
              onChange={(value) => onChange("content", value)}
            />
            <Button
              className="mt-4"
              disabled={!canSend}
              onClick={() => void onAppend()}
            >
              {isBusy && form.content.trim() ? "正在发送" : "发送本轮对话"}
            </Button>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
          <p className="text-sm font-black text-[var(--accent-strong)]">
            医生复核
          </p>
          <h4 className="mt-3 text-2xl font-black text-[var(--ink-strong)]">
            提交给医生复核
          </h4>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            请整理本轮对话摘要和复核说明。提交后会进入待复核状态，不能自动写入正式评估记录。
          </p>
          <FormTextarea
            label="对话摘要"
            value={form.summary}
            onChange={(value) => onChange("summary", value)}
          />
          <FormTextarea
            label="复核说明"
            value={form.reviewNote}
            onChange={(value) => onChange("reviewNote", value)}
          />
          <Button
            className="mt-4 bg-[var(--ink-strong)] hover:bg-[var(--ink-strong)]"
            disabled={!canComplete}
            onClick={() => void onComplete()}
          >
            {isBusy ? "正在提交复核" : "提交给医生复核"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AssessmentInputPanel({
  form,
  onChange,
  showTechnicalEvidence,
  disabled,
}: {
  form: AssessmentFormState;
  onChange: (field: AssessmentDraftFormField, value: string) => void;
  showTechnicalEvidence: boolean;
  disabled: boolean;
}) {
  return (
    <Card tone="workbench" className="mt-5">
      <Badge label="AI评估草稿" icon={ClipboardCheck} />
      <p className="mt-3 font-bold leading-7 text-[var(--ink-soft)]">
        这里按明确评估路径整理 MMSE/CDR 或 AD-8 量表、问答文本和 AI
        分析摘要。内容只作为待医生复核的草稿，患者端不能保存为正式评估。
      </p>
      <p className="mt-3 text-sm font-black text-[var(--accent-strong)]">
        评估路径：{form.assessmentType || "首次 AI 初筛将使用 MMSE/CDR"}
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {form.assessmentType === "AD-8" ? (
          <>
            <FormInput
              label="AD-8 信息提供者姓名"
              value={form.informantName}
              onChange={(value) => onChange("informantName", value)}
              disabled={disabled}
            />
            <FormInput
              label="AD-8 信息提供者关系"
              value={form.informantRelation}
              onChange={(value) => onChange("informantRelation", value)}
              disabled={disabled}
            />
            <FormInput
              label="AD-8 评估来源"
              value={form.assessmentSource}
              onChange={(value) => onChange("assessmentSource", value)}
              disabled={disabled}
            />
            <FormInput
              label="AD-8 总分（0-8）"
              value={form.ad8Total}
              onChange={(value) => onChange("ad8Total", value)}
              type="number"
              disabled={disabled}
            />
            {ad8DraftFieldChoices.map(([field, label]) => (
              <FormInput
                key={field}
                label={label}
                value={form[field]}
                onChange={(value) => onChange(field, value)}
                type="number"
                disabled={disabled}
              />
            ))}
          </>
        ) : form.assessmentType === "MMSE/CDR" ? (
          <>
            <FormInput
              label="MMSE（0-30）"
              value={form.mmse}
              onChange={(value) => onChange("mmse", value)}
              type="number"
              disabled={disabled}
            />
            <FormInput
              label="CDR（0-3）"
              value={form.cdr}
              onChange={(value) => onChange("cdr", value)}
              type="number"
              disabled={disabled}
            />
            <FormInput
              label="记忆力（0-100）"
              value={form.memory}
              onChange={(value) => onChange("memory", value)}
              type="number"
              disabled={disabled}
            />
            <FormInput
              label="定向力（0-100）"
              value={form.orientation}
              onChange={(value) => onChange("orientation", value)}
              type="number"
              disabled={disabled}
            />
            <FormInput
              label="执行力（0-100）"
              value={form.executive}
              onChange={(value) => onChange("executive", value)}
              type="number"
              disabled={disabled}
            />
            <FormInput
              label="语言表达（0-100）"
              value={form.language}
              onChange={(value) => onChange("language", value)}
              type="number"
              disabled={disabled}
            />
          </>
        ) : null}
        {showTechnicalEvidence ? (
          <FormInput
            label="分析置信度（0-1）"
            value={form.confidence}
            onChange={(value) => onChange("confidence", value)}
            type="number"
            disabled={disabled}
          />
        ) : null}
        <FormInput
          label="反应延迟（秒）"
          value={form.reactionDelaySeconds}
          onChange={(value) => onChange("reactionDelaySeconds", value)}
          type="number"
          disabled={disabled}
        />
        {showTechnicalEvidence ? (
          <FormInput
            label="来源/模型版本"
            value={form.modelVersion}
            onChange={(value) => onChange("modelVersion", value)}
            disabled={disabled}
          />
        ) : null}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FormTextarea
          label="问答转写/评估摘要"
          value={form.transcript}
          onChange={(value) => onChange("transcript", value)}
          disabled={disabled}
        />
        <FormTextarea
          label="评估分析摘要"
          value={form.analysisSummary}
          onChange={(value) => onChange("analysisSummary", value)}
          disabled={disabled}
        />
      </div>
      <AssessmentProgressPanel form={form} />
    </Card>
  );
}

function stopAssessmentSpeechRecorder({
  recorder,
  mediaRecorderRef,
  recordingStreamRef,
  recordingChunksRef,
  recordingStartedAtMsRef,
}: {
  recorder: MediaRecorder;
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>;
  recordingStreamRef: React.MutableRefObject<MediaStream | null>;
  recordingChunksRef: React.MutableRefObject<Blob[]>;
  recordingStartedAtMsRef: React.MutableRefObject<number | null>;
}) {
  return new Promise<AssessmentSpeechRecording>((resolve, reject) => {
    const startedAtMs = recordingStartedAtMsRef.current;
    const mimeType = recorder.mimeType;
    if (!startedAtMs) {
      reject(new Error("录音开始时间缺失，不能提交语音转写。"));
      return;
    }

    recorder.addEventListener(
      "stop",
      () => {
        const endedAtMs = Date.now();
        const chunks = [...recordingChunksRef.current];
        releaseAssessmentSpeechRecorder({
          mediaRecorderRef,
          recordingStreamRef,
          recordingChunksRef,
          recordingStartedAtMsRef,
        });
        if (!chunks.length) {
          reject(new Error("录音内容为空，不能提交语音转写。"));
          return;
        }
        try {
          resolve({
            recordingId: createHighCostIdempotencyKey(),
            audioBlob: new Blob(chunks, { type: mimeType }),
            startedAtMs,
            endedAtMs,
          });
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );

    recorder.stop();
  });
}

function releaseAssessmentSpeechRecorder({
  mediaRecorderRef,
  recordingStreamRef,
  recordingChunksRef,
  recordingStartedAtMsRef,
}: {
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>;
  recordingStreamRef: React.MutableRefObject<MediaStream | null>;
  recordingChunksRef: React.MutableRefObject<Blob[]>;
  recordingStartedAtMsRef: React.MutableRefObject<number | null>;
}) {
  recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  recordingStreamRef.current = null;
  mediaRecorderRef.current = null;
  recordingChunksRef.current = [];
  recordingStartedAtMsRef.current = null;
}

function AssessmentProgressPanel({ form }: { form: AssessmentFormState }) {
  const hasSpeechEvidence = Boolean(form.speechEvidence);
  const hasAiEvidence = Boolean(form.aiDraftEvidence);
  const isReadyForReview = isAssessmentFormComplete(form);

  return (
    <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="智能评估进度" icon={Sparkles} />
          <h4 className="mt-3 text-2xl font-black text-[var(--ink-strong)]">
            评估建议等待医生复核
          </h4>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            语音识别和智能建议只用于辅助录入。正式评估必须由医生核对量表分数、问答摘要和分析说明后提交。
          </p>
        </div>
        <StatusBadge status={isReadyForReview ? "ready" : "pending"}>
          {isReadyForReview ? "可进入复核" : "待补齐评估信息"}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <ProgressStatusCard
          title="语音识别状态"
          value={hasSpeechEvidence ? "语音识别已完成" : "等待录音或文本录入"}
          description={
            hasSpeechEvidence
              ? "问答内容已回填到评估摘要，请核对是否符合现场记录。"
              : "可录音转写，也可由评估人员直接录入问答摘要。"
          }
          tone={
            hasSpeechEvidence || form.transcript.trim() ? "success" : "warning"
          }
        />
        <ProgressStatusCard
          title="智能建议状态"
          value={hasAiEvidence ? "智能建议已生成" : "等待生成评估建议"}
          description={
            hasAiEvidence
              ? "量表分数和分析摘要已填入表单，仍需医生人工复核。"
              : "填写问答摘要后，可生成待复核评估建议。"
          }
          tone={hasAiEvidence ? "success" : "warning"}
        />
        <ProgressStatusCard
          title="医生复核状态"
          value={isReadyForReview ? "待医生确认提交" : "评估信息未完整"}
          description={
            isReadyForReview
              ? "正式评估仍由医生在医师工作台复核并提交。"
              : "请补齐量表分数、摘要、置信度和反应延迟。"
          }
          tone={isReadyForReview ? "success" : "warning"}
        />
      </div>
    </div>
  );
}

function ProgressStatusCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
  tone: StatusTone;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-[var(--ink-strong)]">{title}</p>
        <StatusBadge status="review">{value}</StatusBadge>
      </div>
      <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        {description}
      </p>
    </div>
  );
}

function AiConversationMessageBubble({
  message,
}: {
  message: AiConversationMessage;
}) {
  const isAssistant = message.role === "assistant";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border p-4",
        isAssistant
          ? "border-[var(--line-strong)] bg-[var(--surface-muted)] text-[var(--ink-strong)]"
          : "border-[var(--line-subtle)] bg-[var(--surface-paper)] text-[var(--ink-soft)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-black text-[var(--accent-strong)]">
          {isAssistant ? "智能追问" : "现场记录"}
        </p>
        <span className="text-xs font-bold text-[var(--ink-subtle)]">
          {formatDateTime(message.createdAt)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-base font-bold leading-7">
        {message.content}
      </p>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card tone="patient">
      <h4 className="text-xl font-black text-[var(--ink-strong)]">{title}</h4>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        {description}
      </p>
    </Card>
  );
}

function Badge({ label, icon: Icon }: { label: string; icon: typeof Brain }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  disabled?: boolean;
}) {
  const inputId = useId();
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        id={inputId}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 font-bold text-[var(--ink-strong)] outline-none focus:border-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FormTextarea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const textAreaId = useId();
  return (
    <label className="mt-4 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <textarea
        id={textAreaId}
        className="mt-2 min-h-32 w-full resize-y rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-3 font-bold leading-7 text-[var(--ink-strong)] outline-none focus:border-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function readString(value: unknown, defaultValue: string) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : defaultValue;
}

function formatDateTime(value?: string) {
  if (!value) return "待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
