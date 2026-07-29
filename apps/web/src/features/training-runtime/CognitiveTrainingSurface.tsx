"use client";

import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  createCognitiveSubmissionGuard,
  resolveCognitiveAnswerFocus,
  runCognitiveSubmission,
  shouldRunCognitiveClock,
  startCognitiveClock,
  type CognitivePhase,
} from "@/lib/cognitive-training-lifecycle";
import {
  appendCognitiveAnswer,
  cognitiveDifficultyForLevel,
  createCognitiveDifficultyAdjustment,
  createCognitiveRound,
  createCognitiveRoundResult,
  isCognitivePrescriptionComplete,
  requireCognitiveClientStartedAt,
  requireCognitiveDurationSeconds,
  type CognitiveDifficultyAdjustmentEvent,
  type CognitiveRoundResult,
} from "@/lib/cognitive-training-runtime";
import { buildCognitiveWebTrainingResultPayload } from "@/lib/cognitive-web-training-result";
import type {
  GameContent,
  SubmitTrainingResultRequest,
  TrainingSession,
} from "@/types/api";
import {
  readRequiredText,
  readTrainingRuntimeEvidenceContext,
} from "./runtime-context";

type CognitiveTrainingSurfaceProps = {
  durationMinutes: number;
  game: GameContent;
  onResultReady: (payload: SubmitTrainingResultRequest) => void | Promise<void>;
  trainingSession: TrainingSession;
};

export function CognitiveTrainingSurface({
  durationMinutes,
  game,
  onResultReady,
  trainingSession,
}: CognitiveTrainingSurfaceProps) {
  const prescribedDurationSeconds =
    requireCognitiveDurationSeconds(durationMinutes);
  const evidenceContext = useMemo(
    () =>
      readTrainingRuntimeEvidenceContext(trainingSession.runtimeConfigSnapshot),
    [trainingSession.runtimeConfigSnapshot],
  );
  const gameRunId = useMemo(
    () =>
      readRequiredText(
        trainingSession.gameRunId,
        "训练会话缺少运行批次，不能启动认知训练。",
      ),
    [trainingSession.gameRunId],
  );
  const started = useMemo(
    () => requireCognitiveClientStartedAt(trainingSession.clientStartedAt),
    [trainingSession.clientStartedAt],
  );
  const startingDifficulty = useMemo(
    () => cognitiveDifficultyForLevel(evidenceContext.startingDifficultyLevel),
    [evidenceContext.startingDifficultyLevel],
  );
  const [round, setRound] = useState(() =>
    createCognitiveRound({
      roundNumber: 1,
      difficulty: startingDifficulty,
      nowMs: started.ms,
    }),
  );
  const [phase, setPhase] = useState<CognitivePhase>("memorize");
  const [answers, setAnswers] = useState<string[]>([]);
  const [answerStartedAtMs, setAnswerStartedAtMs] = useState<number | null>(
    null,
  );
  const [feedback, setFeedback] = useState("请记住当前顺序。");
  const [remainingSeconds, setRemainingSeconds] = useState(
    Math.ceil(prescribedDurationSeconds),
  );
  const [completedRoundCount, setCompletedRoundCount] = useState(0);
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const submissionGuard = useMemo(
    () => createCognitiveSubmissionGuard(trainingSession.id),
    [trainingSession.id],
  );
  const answersRef = useRef<string[]>([]);
  const phaseRef = useRef<CognitivePhase>("memorize");
  const roundNumberRef = useRef(1);
  const currentDifficultyRef = useRef(startingDifficulty);
  const completedRoundsRef = useRef<CognitiveRoundResult[]>([]);
  const difficultyEventsRef = useRef<CognitiveDifficultyAdjustmentEvent[]>([]);
  const pendingDifficultyEventRef =
    useRef<CognitiveDifficultyAdjustmentEvent | null>(null);
  const timedOutAtMsRef = useRef<number | null>(null);
  const feedbackRegionRef = useRef<HTMLParagraphElement | null>(null);
  const answerProgressRef = useRef<HTMLSpanElement | null>(null);
  const optionContainerRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const submitTraining = useCallback(
    async (completedAtMs: number) => {
      timedOutAtMsRef.current = completedAtMs;
      await runCognitiveSubmission({
        guard: submissionGuard,
        buildPayload: () =>
          buildCognitiveWebTrainingResultPayload({
            stats: {
              startedAtMs: started.ms,
              startedAtIso: started.iso,
              prescribedDurationSeconds,
              completionReason: "prescribed_duration_elapsed",
              rounds: completedRoundsRef.current,
              difficultyAdjustmentEvents: difficultyEventsRef.current,
            },
            game,
            trainingSession,
            completedAtMs,
          }),
        submitPayload: async (payload) => {
          await onResultReady(payload);
        },
        onPhaseChange: (nextPhase, error) => {
          phaseRef.current = nextPhase;
          setPhase(nextPhase);
          if (nextPhase === "submitting") {
            setFeedback("正在提交本次训练结果。");
          } else if (nextPhase === "completed") {
            setFeedback("本次训练已完成，请确认保存。");
          } else if (nextPhase === "error") {
            if (!error) throw new Error("认知训练提交失败但缺少错误信息。");
            setFeedback(error.message);
          }
        },
      });
    },
    [
      game,
      onResultReady,
      prescribedDurationSeconds,
      started,
      submissionGuard,
      trainingSession,
    ],
  );

  const handlePrescriptionElapsed = useCallback(
    (completedAtMs: number) => {
      if (!shouldRunCognitiveClock(phaseRef.current)) return;
      timedOutAtMsRef.current = completedAtMs;
      setRemainingSeconds(0);
      phaseRef.current = "timed_out";
      setPhase("timed_out");
      if (!completedRoundsRef.current.length) {
        setFeedback("处方时间已结束，但尚未完成有效轮次，不能生成训练结果。");
        return;
      }
      setFeedback("处方时间已结束，正在准备训练结果。");
      void submitTraining(completedAtMs);
    },
    [submitTraining],
  );

  useEffect(() => {
    submissionGuard.activate();
    return () => submissionGuard.invalidate();
  }, [submissionGuard]);

  useEffect(() => {
    if (!shouldRunCognitiveClock(phase)) return;
    const updateClock = () => {
      const now = Date.now();
      const elapsedSeconds = (now - started.ms) / 1_000;
      setRemainingSeconds(
        Math.max(0, Math.ceil(prescribedDurationSeconds - elapsedSeconds)),
      );
      if (
        isCognitivePrescriptionComplete(
          started.ms,
          now,
          prescribedDurationSeconds,
        )
      ) {
        handlePrescriptionElapsed(now);
      }
    };
    const clock = startCognitiveClock({
      onTick: updateClock,
      scheduler: {
        setInterval: (callback, intervalMs) =>
          window.setInterval(callback, intervalMs),
        clearInterval: (id) => window.clearInterval(id),
      },
    });
    return () => clock.stop();
  }, [handlePrescriptionElapsed, phase, prescribedDurationSeconds, started.ms]);

  useEffect(() => {
    if (phase !== "memorize") return;
    const timeoutId = window.setTimeout(() => {
      const now = Date.now();
      if (
        isCognitivePrescriptionComplete(
          started.ms,
          now,
          prescribedDurationSeconds,
        )
      ) {
        handlePrescriptionElapsed(now);
        return;
      }
      answersRef.current = [];
      setAnswers([]);
      setAnswerStartedAtMs(now);
      phaseRef.current = "answer";
      setPhase("answer");
      setFeedback("按刚才的顺序作答。");
    }, round.difficulty.presentationMs);
    return () => window.clearTimeout(timeoutId);
  }, [
    handlePrescriptionElapsed,
    phase,
    prescribedDurationSeconds,
    round,
    started.ms,
  ]);

  useEffect(() => {
    if (phase !== "feedback") return;
    const timeoutId = window.setTimeout(() => {
      const now = Date.now();
      if (
        isCognitivePrescriptionComplete(
          started.ms,
          now,
          prescribedDurationSeconds,
        )
      ) {
        handlePrescriptionElapsed(now);
        return;
      }
      roundNumberRef.current += 1;
      const nextRound = createCognitiveRound({
        roundNumber: roundNumberRef.current,
        difficulty: currentDifficultyRef.current,
        nowMs: now,
      });
      answersRef.current = [];
      setAnswers([]);
      setAnswerStartedAtMs(null);
      setRound(nextRound);
      phaseRef.current = "memorize";
      setPhase("memorize");
      setFeedback("请记住当前顺序。");
    }, 1_000);
    return () => window.clearTimeout(timeoutId);
  }, [handlePrescriptionElapsed, phase, prescribedDurationSeconds, started.ms]);

  useEffect(() => {
    if (phase === "answer") {
      const focusTarget = resolveCognitiveAnswerFocus(round.options, answers);
      if (focusTarget.type === "option") {
        const optionIndex = round.options.indexOf(focusTarget.option);
        optionContainerRefs.current[optionIndex]
          ?.querySelector("button")
          ?.focus();
      } else {
        answerProgressRef.current?.focus();
      }
      return;
    }
    if (
      phase === "feedback" ||
      phase === "timed_out" ||
      phase === "submitting" ||
      phase === "error" ||
      phase === "completed"
    ) {
      feedbackRegionRef.current?.focus();
    }
  }, [answers, phase, round.options]);

  function chooseOption(option: string) {
    if (phaseRef.current !== "answer" || answerStartedAtMs === null) return;
    const interactionAtMs = Date.now();
    if (
      isCognitivePrescriptionComplete(
        started.ms,
        interactionAtMs,
        prescribedDurationSeconds,
      )
    ) {
      handlePrescriptionElapsed(interactionAtMs);
      return;
    }
    const nextAnswers = appendCognitiveAnswer(
      answersRef.current,
      option,
      round.sequence.length,
    );
    if (nextAnswers === answersRef.current) return;
    answersRef.current = [...nextAnswers];
    setAnswers([...nextAnswers]);
    if (nextAnswers.length !== round.sequence.length) return;
    answerProgressRef.current?.focus();

    const completedAtMs = interactionAtMs;
    const completedRound = createCognitiveRoundResult({
      round,
      answers: nextAnswers,
      answerStartedAtMs,
      completedAtMs,
    });
    const confirmedDifficultyEvent = pendingDifficultyEventRef.current;
    if (confirmedDifficultyEvent) {
      difficultyEventsRef.current = [
        ...difficultyEventsRef.current,
        confirmedDifficultyEvent,
      ];
      pendingDifficultyEventRef.current = null;
      setAdjustmentCount(difficultyEventsRef.current.length);
    }
    completedRoundsRef.current = [
      ...completedRoundsRef.current,
      completedRound,
    ];
    setCompletedRoundCount(completedRoundsRef.current.length);

    const adjustment = createCognitiveDifficultyAdjustment({
      rounds: [completedRound],
      startingLevel: evidenceContext.startingDifficultyLevel,
      currentDifficulty: currentDifficultyRef.current,
      approvedPlanItemId: evidenceContext.approvedPlanItemId,
      assessmentSourceId: evidenceContext.assessmentSourceId,
      gameRunId,
      adjustedAt: new Date(completedAtMs).toISOString(),
    });
    if (adjustment) {
      currentDifficultyRef.current = {
        level: adjustment.after.complexityLevel,
        sequenceLength: adjustment.after.sequenceLength,
        optionCount: adjustment.after.optionCount,
        presentationMs: adjustment.after.presentationMs,
      };
      pendingDifficultyEventRef.current = adjustment;
    }

    const correctCount = countPositionMatches(nextAnswers, round.sequence);
    setFeedback(`本轮正确 ${correctCount}/${round.sequence.length}`);
    phaseRef.current = "feedback";
    setPhase("feedback");
  }

  const phaseLabel =
    phase === "memorize"
      ? "记忆阶段"
      : phase === "answer"
        ? "作答阶段"
        : phase === "feedback"
          ? "本轮反馈"
          : phase === "timed_out"
            ? "训练计时结束"
            : phase === "submitting"
              ? "正在提交"
              : phase === "error"
                ? "提交失败"
                : "训练结束";

  return (
    <div className="training-stage-shell grid min-h-[460px] gap-5 bg-[var(--surface-page)] p-5 text-[var(--ink-strong)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <StatusBadge status={phase === "completed" ? "ready" : "pending"}>
            {phaseLabel}
          </StatusBadge>
          <h4 className="mt-3 text-2xl font-black">{game.name}</h4>
        </div>
        <div className="grid gap-1 text-right font-bold text-[var(--ink-soft)]">
          <span>剩余时间 {formatRemainingTime(remainingSeconds)}</span>
          <span>已完成 {completedRoundCount} 轮</span>
          <span>难度调整 {adjustmentCount} 次</span>
        </div>
      </div>

      <p
        aria-live="polite"
        className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-lg font-black"
        ref={feedbackRegionRef}
        role="status"
        tabIndex={-1}
      >
        {feedback}
      </p>

      {phase === "memorize" ? (
        <ol
          aria-label="本轮记忆序列"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {round.sequence.map((value, index) => (
            <li
              key={`${round.id}-${index}`}
              className="flex min-h-24 items-center justify-center rounded-[var(--radius-card)] border-2 border-[var(--accent-strong)] bg-[var(--accent-soft)] text-2xl font-black"
            >
              {value}
            </li>
          ))}
        </ol>
      ) : null}

      {phase === "answer" ? (
        <CognitiveAnswerChoices
          answers={answers}
          onChoose={chooseOption}
          optionContainerRefs={optionContainerRefs}
          options={round.options}
          progressRef={answerProgressRef}
          sequenceLength={round.sequence.length}
        />
      ) : null}

      {phase === "feedback" ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--success-line)] bg-[var(--success-soft)] p-5 text-center text-xl font-black text-[var(--success-strong)]">
          {feedback}
        </div>
      ) : null}

      {phase === "completed" ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-panel)] p-5 text-center text-xl font-black">
          {feedback}
        </div>
      ) : null}

      {phase === "submitting" || phase === "timed_out" || phase === "error" ? (
        <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-panel)] p-5 text-center text-xl font-black">
          <span>{feedback}</span>
          {phase === "error" ||
          (phase === "timed_out" && completedRoundCount > 0) ? (
            <Button
              onClick={() => {
                const completedAtMs = timedOutAtMsRef.current;
                if (completedAtMs === null) {
                  throw new Error("认知训练缺少计时结束时间，不能重试提交。");
                }
                void submitTraining(completedAtMs);
              }}
            >
              重新提交训练结果
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CognitiveAnswerChoices({
  answers,
  onChoose,
  optionContainerRefs,
  options,
  progressRef,
  sequenceLength,
}: {
  answers: readonly string[];
  onChoose: (option: string) => void;
  optionContainerRefs: MutableRefObject<Array<HTMLSpanElement | null>>;
  options: readonly string[];
  progressRef: RefObject<HTMLSpanElement | null>;
  sequenceLength: number;
}) {
  return (
    <section aria-labelledby="cognitive-answer-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 id="cognitive-answer-heading" className="text-lg font-black">
          选择第 {answers.length + 1} 个位置
        </h5>
        <span
          aria-live="polite"
          className="font-bold text-[var(--ink-soft)]"
          ref={progressRef}
          role="status"
          tabIndex={-1}
        >
          {answers.length}/{sequenceLength}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((option, index) => (
          <span
            className="[&>button]:w-full"
            key={option}
            ref={(node) => {
              optionContainerRefs.current[index] = node;
            }}
          >
            <Button
              className="min-h-16 text-xl"
              disabled={answers.includes(option)}
              intent="secondary"
              onClick={() => onChoose(option)}
            >
              {option}
            </Button>
          </span>
        ))}
      </div>
    </section>
  );
}

function countPositionMatches(
  answers: readonly string[],
  sequence: readonly string[],
) {
  return sequence.reduce(
    (count, value, index) => count + (answers[index] === value ? 1 : 0),
    0,
  );
}

function formatRemainingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
