using System;
using System.Collections.Generic;
using Rehab;
using UnityEngine;

namespace Rehab.RhythmReach
{
    public sealed class GameSessionController : MonoBehaviour
    {
        public enum SessionState
        {
            Idle = 0,
            Countdown = 1,
            Running = 2,
            Completed = 3,
            Blocked = 4
        }

        [SerializeField] private string explicitDifficulty;
        [SerializeField] private float countdownSeconds = 3f;
        private float sessionDurationSeconds;
        [SerializeField] private DifficultyController difficultyController;
        [SerializeField] private RhythmTargetSpawner targetSpawner;
        [SerializeField] private TargetHitDetector hitDetector;
        [SerializeField] private PoseInputBridge poseInputBridge;
        [SerializeField] private RehabTrainingResultBridge resultBridge;
        [SerializeField] private string runtimeConfigJson;

        private const int RuntimeDifficultyMinimumSamples = 4;
        private const float ReactionSlowThresholdMs = 1100f;
        private const float AccuracyHighThreshold = 0.88f;
        private const float AccuracyLowThreshold = 0.72f;
        private const float HitRateHighThreshold = 0.92f;
        private const float HitRateLowThreshold = 0.72f;
        private const float FatigueReactionIncreaseMs = 250f;
        private const int MinimumMotionMetricSamples = 4;
        private const int MinimumDifficultyLevel = 1;
        private const int MaximumDifficultyLevel = 3;

        private readonly MetricsAccumulator metricsAccumulator = new MetricsAccumulator();
        private readonly List<DynamicDifficultyEvidenceEvent> runtimeDifficultyEvents =
            new List<DynamicDifficultyEvidenceEvent>();
        private DifficultyController.DifficultySettings activeDifficultySettings;
        private DifficultyController.DifficultySettings initialDifficultySettings;
        private int startingDifficultyLevel;
        private SessionState state = SessionState.Idle;
        private float countdownStartedAtSeconds;
        private float runningStartedAtSeconds;
        private DateTime runningStartedAtUtc;
        private DateTime runningEndedAtUtc;
        private int lastRuntimeDifficultyTargetIndex;
        private int runtimeDifficultyWindowIndex;
        private float lastRuntimeWindowReactionTimeMs;
        private string blockReason = string.Empty;

        public SessionState State
        {
            get { return state; }
        }

        public string BlockReason
        {
            get { return blockReason; }
        }

        public MetricsAccumulator Metrics
        {
            get { return metricsAccumulator; }
        }

        public void SetRuntimeConfigJson(string json)
        {
            runtimeConfigJson = string.Empty;
            sessionDurationSeconds = 0f;

            if (string.IsNullOrWhiteSpace(json))
            {
                Block("Session blocked: runtime config JSON is required.");
                return;
            }

            try
            {
                RehabRuntimeConfig config = RehabRuntimeConfig.FromJson(json);
                TrainingSessionEvidenceContext.FromJson(json);
                sessionDurationSeconds = config.durationSeconds;
                runtimeConfigJson = json;
            }
            catch (Exception exception)
            {
                Block("Session blocked: invalid runtime config. " + exception.Message);
            }
        }

        public void SetExplicitDifficulty(string difficulty)
        {
            if (string.IsNullOrWhiteSpace(difficulty))
            {
                Block("Session blocked: explicit difficulty is required.");
                return;
            }

            explicitDifficulty = difficulty;
        }

        private void OnEnable()
        {
            if (targetSpawner != null)
            {
                targetSpawner.TargetSpawned += HandleTargetSpawned;
                targetSpawner.TargetMissed += HandleTargetMissed;
            }
        }

        private void OnDisable()
        {
            if (targetSpawner != null)
            {
                targetSpawner.TargetSpawned -= HandleTargetSpawned;
                targetSpawner.TargetMissed -= HandleTargetMissed;
            }
        }

        private void Update()
        {
            if (state == SessionState.Countdown)
            {
                if (Time.time - countdownStartedAtSeconds >= countdownSeconds)
                {
                    EnterRunning();
                }

                return;
            }

            if (state == SessionState.Running
                && Time.time - runningStartedAtSeconds >= sessionDurationSeconds)
            {
                CompleteSession();
                return;
            }

            if (state == SessionState.Running)
            {
                EvaluateRuntimeDifficultyWindow();
            }
        }

        public bool StartSession(string difficulty)
        {
            if (state == SessionState.Countdown || state == SessionState.Running)
            {
                Block("Session blocked: cannot start while a session is already active.");
                return false;
            }

            if (!ValidateRequiredComponents())
            {
                return false;
            }

            TrainingSessionEvidenceContext evidenceContext;
            RehabRuntimeConfig config;
            string contextDifficulty;
            try
            {
                config = RehabRuntimeConfig.FromJson(runtimeConfigJson);
                sessionDurationSeconds = config.durationSeconds;
                evidenceContext = TrainingSessionEvidenceContext.FromJson(runtimeConfigJson);
                contextDifficulty = ResolveDifficultyNameFromStartingLevel(evidenceContext.startingDifficultyLevel);
            }
            catch (Exception exception)
            {
                Block("Session blocked: clinician-approved difficulty context is required. " + exception.Message);
                return false;
            }

            if (!string.Equals(difficulty, contextDifficulty, StringComparison.OrdinalIgnoreCase))
            {
                Block(
                    "Session blocked: requested difficulty must match clinician-approved startingDifficultyLevel.");
                return false;
            }

            DifficultyController.DifficultySettings resolvedSettings;
            string reason;
            if (!difficultyController.TryResolveDifficulty(difficulty, out resolvedSettings, out reason))
            {
                Block(reason);
                return false;
            }

            if (!ValidateSessionSettings(resolvedSettings, out reason))
            {
                Block(reason);
                return false;
            }

            if (!ValidateRenderDependencies())
            {
                return false;
            }

            explicitDifficulty = difficulty;
            activeDifficultySettings = resolvedSettings;
            initialDifficultySettings = resolvedSettings;
            startingDifficultyLevel = evidenceContext.startingDifficultyLevel;
            runtimeDifficultyEvents.Clear();
            lastRuntimeDifficultyTargetIndex = 0;
            runtimeDifficultyWindowIndex = 0;
            lastRuntimeWindowReactionTimeMs = 0f;
            blockReason = string.Empty;
            state = SessionState.Countdown;
            countdownStartedAtSeconds = Time.time;
            runningStartedAtUtc = default(DateTime);
            runningEndedAtUtc = default(DateTime);
            return true;
        }

        public bool StartConfiguredSession()
        {
            return StartSession(ResolveStartingDifficultyNameFromEvidenceContext());
        }

        public void CompleteSession()
        {
            if (state != SessionState.Running)
            {
                return;
            }

            runningEndedAtUtc = DateTime.UtcNow;
            RecordActiveTargetMiss();
            targetSpawner.Stop();
            hitDetector.Stop();
            metricsAccumulator.EndSession(Time.time);

            List<TrainingMetricRecord> metricRecords;
            string reason;
            if (!metricsAccumulator.TryBuildMetricRecords(
                    activeDifficultySettings.DifficultyLevel,
                    out metricRecords,
                    out reason))
            {
                Block(reason);
                return;
            }

            SubmitResult(metricRecords);
        }

        private void EnterRunning()
        {
            if (activeDifficultySettings == null)
            {
                Block("Session blocked: active difficulty settings are required.");
                return;
            }

            runningStartedAtUtc = DateTime.UtcNow;
            runningEndedAtUtc = default(DateTime);
            runningStartedAtSeconds = Time.time;
            metricsAccumulator.BeginSession(runningStartedAtSeconds);
            targetSpawner.Begin(activeDifficultySettings, runningStartedAtSeconds);
            hitDetector.Begin(targetSpawner, poseInputBridge, metricsAccumulator);
            state = SessionState.Running;
        }

        private bool ValidateRenderDependencies()
        {
            string reason;
            if (!RhythmTargetSpawner.TryValidateRenderDependencies(out reason))
            {
                Block(reason);
                return false;
            }

            return true;
        }

        private void HandleTargetSpawned(string targetId, RhythmTargetZone zone, float spawnedAtSeconds, GameObject target)
        {
            metricsAccumulator.RecordSpawn(targetId, zone, spawnedAtSeconds);
        }

        private void HandleTargetMissed(string targetId)
        {
            metricsAccumulator.RecordMiss(targetId);
        }

        private void RecordActiveTargetMiss()
        {
            if (targetSpawner != null && targetSpawner.HasActiveTarget)
            {
                metricsAccumulator.RecordMiss(targetSpawner.ActiveTargetId);
            }
        }

        private void SubmitResult(IReadOnlyList<TrainingMetricRecord> metricRecords)
        {
            if (resultBridge == null)
            {
                Block("Session blocked: RehabTrainingResultBridge is required.");
                return;
            }

            if (string.IsNullOrWhiteSpace(runtimeConfigJson))
            {
                Block("Session blocked: runtimeConfigJson is required.");
                return;
            }

            try
            {
                RehabRuntimeConfig config = RehabRuntimeConfig.FromJson(runtimeConfigJson);
                TrainingResultInput input = BuildTrainingResultInput(metricRecords, config);
                resultBridge.SubmitResult(config, input);
                state = SessionState.Completed;
            }
            catch (Exception exception)
            {
                Block("Session blocked: training result submission failed. " + exception.Message);
            }
        }

        private TrainingResultInput BuildTrainingResultInput(
            IReadOnlyList<TrainingMetricRecord> metricRecords,
            RehabRuntimeConfig config)
        {
            if (config == null)
            {
                throw new ArgumentNullException(nameof(config));
            }

            MotionMetric[] motionMetrics = new MotionMetric[metricRecords.Count];
            float reactionTimeMs = 0f;
            float hitRate = 0f;
            float accuracy = 0f;
            float durationSeconds = 0f;
            string windowStartedAt = config.clientStartedAt;
            string windowEndedAt = ToUtcIsoTimestamp(runningEndedAtUtc);

            for (int i = 0; i < metricRecords.Count; i += 1)
            {
                TrainingMetricRecord record = metricRecords[i];
                float confidence = ResolveMotionMetricConfidence(record);
                motionMetrics[i] = new MotionMetric
                {
                    metricType = record.MetricType,
                    metricValue = record.MetricValue,
                    confidence = confidence,
                    unit = record.Unit,
                    sampleCount = record.SampleCount,
                    qualityFlag = ResolveMotionMetricQualityFlag(
                        confidence,
                        record.SampleCount,
                        config.minConfidence),
                    windowStartedAt = windowStartedAt,
                    windowEndedAt = windowEndedAt
                };

                if (record.MetricType == MetricsAccumulator.ReactionTimeMetric)
                {
                    reactionTimeMs = record.MetricValue;
                }
                else if (record.MetricType == MetricsAccumulator.TargetHitRateMetric)
                {
                    hitRate = record.MetricValue;
                }
                else if (record.MetricType == MetricsAccumulator.ArmRaiseAccuracyMetric)
                {
                    accuracy = record.MetricValue;
                }
                else if (record.MetricType == MetricsAccumulator.DurationSecondsMetric)
                {
                    durationSeconds = record.MetricValue;
                }
            }

            return new TrainingResultInput
            {
                clientGeneratedAt = windowEndedAt,
                score = Mathf.RoundToInt(ResolveScore(hitRate, accuracy)),
                completionRate = hitRate,
                durationSeconds = Mathf.RoundToInt(durationSeconds),
                reactionTimeMs = Mathf.RoundToInt(reactionTimeMs),
                motionAccuracy = accuracy,
                exerciseIntensity = ResolveExerciseIntensity(),
                source_only_not_camera_pose = poseInputBridge != null
                    && string.Equals(
                        poseInputBridge.ReachHitSource,
                        "development-only",
                        StringComparison.Ordinal),
                motionMetrics = motionMetrics,
                dynamicDifficultyEvidence = BuildDynamicDifficultyEvidence(windowEndedAt)
            };
        }

        private float ResolveMotionMetricConfidence(TrainingMetricRecord record)
        {
            if (record == null)
            {
                throw new InvalidOperationException("Session blocked: motion metric record is required.");
            }

            if (record.SampleCount <= 0)
            {
                throw new InvalidOperationException("Session blocked: motion metric sample count must be positive.");
            }

            float observedConfidenceTotal = 0f;
            int observedSampleCount = 0;
            IReadOnlyList<RhythmTargetRecord> targets = metricsAccumulator.Targets;
            for (int i = 0; i < targets.Count; i += 1)
            {
                RhythmTargetRecord target = targets[i];
                if (!target.WasHit)
                {
                    continue;
                }

                if (!float.IsFinite(target.HitAccuracy)
                    || target.HitAccuracy <= 0f
                    || target.HitAccuracy > 1f)
                {
                    throw new InvalidOperationException(
                        "Session blocked: observed pose-weighted hit confidence is invalid.");
                }

                observedConfidenceTotal += target.HitAccuracy;
                observedSampleCount += 1;
            }

            if (observedSampleCount <= 0 || observedSampleCount > record.SampleCount)
            {
                throw new InvalidOperationException(
                    "Session blocked: motion metric confidence requires observed pose samples.");
            }

            float averageObservedConfidence = observedConfidenceTotal / observedSampleCount;
            float observedSampleCoverage = (float)observedSampleCount / record.SampleCount;
            float confidence = averageObservedConfidence * observedSampleCoverage;
            if (!float.IsFinite(confidence) || confidence <= 0f || confidence > 1f)
            {
                throw new InvalidOperationException(
                    "Session blocked: calculated motion metric confidence is invalid.");
            }

            return confidence;
        }

        private static string ResolveMotionMetricQualityFlag(
            float confidence,
            int sampleCount,
            float minConfidence)
        {
            if (!float.IsFinite(confidence) || confidence < 0f || confidence > 1f)
            {
                throw new InvalidOperationException(
                    "Session blocked: motion metric confidence must be between 0 and 1.");
            }

            return confidence >= minConfidence
                && sampleCount >= MinimumMotionMetricSamples
                ? "valid"
                : "suspicious";
        }

        private DynamicDifficultyEvidence BuildDynamicDifficultyEvidence(string adjustedAt)
        {
            if (initialDifficultySettings == null)
            {
                throw new InvalidOperationException("Session blocked: initial difficulty settings are required.");
            }

            TrainingSessionEvidenceContext context = TrainingSessionEvidenceContext.FromJson(runtimeConfigJson);
            string runtimeWindowId = ResolveRuntimeWindowId();
            var events = new List<DynamicDifficultyEvidenceEvent>
            {
                new DynamicDifficultyEvidenceEvent
                {
                    startingLevel = startingDifficultyLevel,
                    startingLevelSource = context.startingLevelSource,
                    approvedPlanItemId = context.approvedPlanItemId,
                    assessmentSourceId = context.assessmentSourceId,
                    triggerReason = "prior_assessment",
                    before = BuildDifficultyLevelSnapshot(initialDifficultySettings),
                    after = BuildDifficultyLevelSnapshot(initialDifficultySettings),
                    adjustedAt = adjustedAt,
                    runtimeFrameId = ResolveRuntimeFrameId(),
                    runtimeWindowId = runtimeWindowId,
                    safetyClampReason = "clinician_limit:no_runtime_change"
                }
            };

            events.AddRange(runtimeDifficultyEvents);
            return new DynamicDifficultyEvidence
            {
                schemaVersion = "1.0.0",
                events = events.ToArray()
            };
        }

        private string ResolveStartingDifficultyNameFromEvidenceContext()
        {
            TrainingSessionEvidenceContext context = TrainingSessionEvidenceContext.FromJson(runtimeConfigJson);
            return ResolveDifficultyNameFromStartingLevel(context.startingDifficultyLevel);
        }

        private static string ResolveDifficultyNameFromStartingLevel(int clinicianApprovedStartingLevel)
        {
            if (clinicianApprovedStartingLevel == 1)
            {
                return DifficultyController.Easy;
            }

            if (clinicianApprovedStartingLevel == 2)
            {
                return DifficultyController.Standard;
            }

            if (clinicianApprovedStartingLevel == 3)
            {
                return DifficultyController.Advanced;
            }

            throw new InvalidOperationException(
                "Session blocked: startingDifficultyLevel must be between 1 and 3.");
        }

        private void EvaluateRuntimeDifficultyWindow()
        {
            if (activeDifficultySettings == null)
            {
                Block("Session blocked: active difficulty settings are required.");
                return;
            }

            RuntimeDifficultyWindow window;
            if (!TryBuildRuntimeDifficultyWindow(out window))
            {
                return;
            }

            ApplyRuntimeDifficultyDecision(window);
        }

        private bool TryBuildRuntimeDifficultyWindow(out RuntimeDifficultyWindow window)
        {
            window = null;
            IReadOnlyList<RhythmTargetRecord> targets = metricsAccumulator.Targets;
            int resolvedCount = 0;
            for (int i = lastRuntimeDifficultyTargetIndex; i < targets.Count; i += 1)
            {
                RhythmTargetRecord target = targets[i];
                if (target.WasHit || target.WasMissed)
                {
                    resolvedCount += 1;
                }
            }

            if (resolvedCount < RuntimeDifficultyMinimumSamples)
            {
                return false;
            }

            int spawnedCount = 0;
            int hitCount = 0;
            int missCount = 0;
            float reactionTimeTotalMs = 0f;
            float accuracyTotal = 0f;
            float windowStartedAtSeconds = 0f;
            float windowEndedAtSeconds = 0f;

            for (int i = lastRuntimeDifficultyTargetIndex; i < targets.Count; i += 1)
            {
                RhythmTargetRecord target = targets[i];
                if (!target.WasHit && !target.WasMissed)
                {
                    continue;
                }

                if (spawnedCount == 0)
                {
                    windowStartedAtSeconds = target.SpawnedAtSeconds;
                }

                spawnedCount += 1;
                if (target.WasHit)
                {
                    hitCount += 1;
                    reactionTimeTotalMs += target.ReactionTimeMilliseconds;
                    accuracyTotal += target.HitAccuracy;
                    windowEndedAtSeconds = target.HitAtSeconds;
                }
                else
                {
                    missCount += 1;
                    windowEndedAtSeconds = Time.time;
                }
            }

            if (spawnedCount < RuntimeDifficultyMinimumSamples || hitCount <= 0)
            {
                lastRuntimeDifficultyTargetIndex = targets.Count;
                return false;
            }

            window = new RuntimeDifficultyWindow
            {
                windowIndex = runtimeDifficultyWindowIndex,
                startedAtSeconds = windowStartedAtSeconds,
                endedAtSeconds = windowEndedAtSeconds,
                spawnedCount = spawnedCount,
                hitCount = hitCount,
                missCount = missCount,
                averageReactionTimeMs = reactionTimeTotalMs / hitCount,
                hitRate = (float)hitCount / spawnedCount,
                averageAccuracy = accuracyTotal / hitCount
            };

            lastRuntimeDifficultyTargetIndex = targets.Count;
            runtimeDifficultyWindowIndex += 1;
            return true;
        }

        private void ApplyRuntimeDifficultyDecision(RuntimeDifficultyWindow window)
        {
            string triggerReason = ResolveRuntimeDifficultyTriggerReason(window);
            if (triggerReason == "clinician_limit")
            {
                AddRuntimeDifficultyEvent(
                    window,
                    triggerReason,
                    activeDifficultySettings,
                    activeDifficultySettings,
                    "clinician_limit:no_runtime_change");
                lastRuntimeWindowReactionTimeMs = window.averageReactionTimeMs;
                return;
            }

            DifficultyController.DifficultySettings beforeSettings = activeDifficultySettings;
            int targetLevel = ResolveTargetDifficultyLevel(beforeSettings.DifficultyLevel, triggerReason);
            int clinicianApprovedLevel = ResolveClinicianApprovedDifficultyLevel(targetLevel);
            string safetyClampReason = ResolveSafetyClampReason(
                beforeSettings.DifficultyLevel,
                clinicianApprovedLevel,
                triggerReason);

            DifficultyController.DifficultySettings afterSettings = beforeSettings;
            if (clinicianApprovedLevel != beforeSettings.DifficultyLevel)
            {
                string reason;
                if (!TryResolveDifficultyByLevel(clinicianApprovedLevel, out afterSettings, out reason))
                {
                    Block(reason);
                    return;
                }

                activeDifficultySettings = afterSettings;
                targetSpawner.UpdateSettings(activeDifficultySettings, Time.time);
                Debug.Log(
                    "Runtime difficulty adjusted from level "
                    + beforeSettings.DifficultyLevel
                    + " to "
                    + afterSettings.DifficultyLevel
                    + " because "
                    + triggerReason
                    + ".");
            }

            AddRuntimeDifficultyEvent(window, triggerReason, beforeSettings, afterSettings, safetyClampReason);
            lastRuntimeWindowReactionTimeMs = window.averageReactionTimeMs;
        }

        private string ResolveRuntimeDifficultyTriggerReason(RuntimeDifficultyWindow window)
        {
            if (lastRuntimeWindowReactionTimeMs > 0f
                && window.averageReactionTimeMs - lastRuntimeWindowReactionTimeMs >= FatigueReactionIncreaseMs
                && window.hitRate <= HitRateLowThreshold)
            {
                return "fatigue_risk";
            }

            if (window.averageReactionTimeMs >= ReactionSlowThresholdMs)
            {
                return "reaction_slow";
            }

            if (window.hitRate >= HitRateHighThreshold && window.averageAccuracy >= AccuracyHighThreshold)
            {
                return "accuracy_high";
            }

            if (window.hitRate < HitRateLowThreshold || window.averageAccuracy < AccuracyLowThreshold)
            {
                return "accuracy_low";
            }

            return "clinician_limit";
        }

        private int ResolveTargetDifficultyLevel(int currentLevel, string triggerReason)
        {
            if (triggerReason == "accuracy_high")
            {
                return currentLevel + 1;
            }

            if (triggerReason == "reaction_slow"
                || triggerReason == "accuracy_low"
                || triggerReason == "fatigue_risk")
            {
                return currentLevel - 1;
            }

            return currentLevel;
        }

        private static int ResolveClinicianApprovedDifficultyLevel(int requestedLevel)
        {
            if (requestedLevel < MinimumDifficultyLevel)
            {
                return MinimumDifficultyLevel;
            }

            if (requestedLevel > MaximumDifficultyLevel)
            {
                return MaximumDifficultyLevel;
            }

            return requestedLevel;
        }

        private static string ResolveSafetyClampReason(int beforeLevel, int afterLevel, string triggerReason)
        {
            if (beforeLevel != afterLevel)
            {
                return null;
            }

            if (triggerReason == "accuracy_high" && beforeLevel >= MaximumDifficultyLevel)
            {
                return "clinician_limit:max_complexity";
            }

            if ((triggerReason == "reaction_slow"
                    || triggerReason == "accuracy_low"
                    || triggerReason == "fatigue_risk")
                && beforeLevel <= MinimumDifficultyLevel)
            {
                return "clinician_limit:min_complexity";
            }

            return "clinician_limit:no_runtime_change";
        }

        private void AddRuntimeDifficultyEvent(
            RuntimeDifficultyWindow window,
            string triggerReason,
            DifficultyController.DifficultySettings beforeSettings,
            DifficultyController.DifficultySettings afterSettings,
            string safetyClampReason)
        {
            TrainingSessionEvidenceContext context = TrainingSessionEvidenceContext.FromJson(runtimeConfigJson);
            var evidenceEvent = new DynamicDifficultyEvidenceEvent
            {
                startingLevel = startingDifficultyLevel,
                startingLevelSource = context.startingLevelSource,
                approvedPlanItemId = context.approvedPlanItemId,
                assessmentSourceId = context.assessmentSourceId,
                triggerReason = triggerReason,
                before = BuildDifficultyLevelSnapshot(beforeSettings),
                after = BuildDifficultyLevelSnapshot(afterSettings),
                adjustedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                runtimeFrameId = ResolveRuntimeFrameId(),
                runtimeWindowId = ResolveRuntimeWindowId(window)
            };

            if (!string.IsNullOrWhiteSpace(safetyClampReason))
            {
                evidenceEvent.safetyClampReason = safetyClampReason;
            }

            runtimeDifficultyEvents.Add(evidenceEvent);
        }

        private bool TryResolveDifficultyByLevel(
            int difficultyLevel,
            out DifficultyController.DifficultySettings settings,
            out string blockReason)
        {
            settings = null;
            blockReason = string.Empty;

            string difficultyName;
            if (difficultyLevel == 1)
            {
                difficultyName = DifficultyController.Easy;
            }
            else if (difficultyLevel == 2)
            {
                difficultyName = DifficultyController.Standard;
            }
            else if (difficultyLevel == 3)
            {
                difficultyName = DifficultyController.Advanced;
            }
            else
            {
                blockReason = "Difficulty blocked: clinician-approved difficulty level is outside 1 to 3.";
                return false;
            }

            if (!difficultyController.TryResolveDifficulty(difficultyName, out settings, out blockReason))
            {
                return false;
            }

            if (settings.DifficultyLevel != difficultyLevel)
            {
                blockReason = "Difficulty blocked: resolved difficulty level does not match clinician-approved level.";
                settings = null;
                return false;
            }

            return true;
        }

        private static DifficultyLevelSnapshot BuildDifficultyLevelSnapshot(
            DifficultyController.DifficultySettings settings)
        {
            if (settings == null)
            {
                throw new InvalidOperationException("Session blocked: difficulty settings are required.");
            }

            return new DifficultyLevelSnapshot
            {
                speed = settings.TargetSpeed,
                complexityLevel = settings.DifficultyLevel
            };
        }

        private string ResolveRuntimeFrameId()
        {
            RehabRuntimeConfig config = RehabRuntimeConfig.FromJson(runtimeConfigJson);
            return config.gameRunId + ":frame:" + Time.frameCount;
        }

        private string ResolveRuntimeWindowId()
        {
            RehabRuntimeConfig config = RehabRuntimeConfig.FromJson(runtimeConfigJson);
            string windowStartedAt = ToUtcIsoTimestamp(runningStartedAtUtc);
            string windowEndedAt = ToUtcIsoTimestamp(runningEndedAtUtc);
            return config.gameRunId + ":window:" + windowStartedAt + "-" + windowEndedAt;
        }

        private string ResolveRuntimeWindowId(RuntimeDifficultyWindow window)
        {
            RehabRuntimeConfig config = RehabRuntimeConfig.FromJson(runtimeConfigJson);
            string windowStartedAt = ToUtcIsoTimestamp(
                runningStartedAtUtc.AddSeconds(window.startedAtSeconds - runningStartedAtSeconds));
            string windowEndedAt = ToUtcIsoTimestamp(
                runningStartedAtUtc.AddSeconds(window.endedAtSeconds - runningStartedAtSeconds));
            return config.gameRunId
                + ":runtime-window:"
                + window.windowIndex
                + ":"
                + windowStartedAt
                + "-"
                + windowEndedAt;
        }

        private static string ToUtcIsoTimestamp(DateTime value)
        {
            if (value == default(DateTime))
            {
                throw new InvalidOperationException("Session blocked: UTC metric window timestamp is required.");
            }

            return value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        }

        private static float ResolveScore(float hitRate, float accuracy)
        {
            if (hitRate < 0f || hitRate > 1f || accuracy < 0f || accuracy > 1f)
            {
                throw new InvalidOperationException("Session blocked: score inputs must be between 0 and 1.");
            }

            return ((hitRate + accuracy) * 0.5f) * 100f;
        }

        private string ResolveExerciseIntensity()
        {
            if (activeDifficultySettings == null)
            {
                throw new InvalidOperationException("Session blocked: active difficulty settings are required.");
            }

            if (activeDifficultySettings.DifficultyLevel >= 3)
            {
                return "high";
            }

            if (activeDifficultySettings.DifficultyLevel <= 1)
            {
                return "low";
            }

            return "moderate";
        }

        private bool ValidateRequiredComponents()
        {
            if (difficultyController == null)
            {
                Block("Session blocked: DifficultyController is required.");
                return false;
            }

            if (targetSpawner == null)
            {
                Block("Session blocked: RhythmTargetSpawner is required.");
                return false;
            }

            if (hitDetector == null)
            {
                Block("Session blocked: TargetHitDetector is required.");
                return false;
            }

            if (poseInputBridge == null)
            {
                Block("Session blocked: PoseInputBridge is required.");
                return false;
            }

            return true;
        }

        private bool ValidateSessionSettings(DifficultyController.DifficultySettings settings, out string reason)
        {
            reason = string.Empty;
            if (settings == null)
            {
                reason = "Session blocked: resolved difficulty settings are required.";
                return false;
            }

            if (settings.SpawnIntervalSeconds <= 0f)
            {
                reason = "Session blocked: spawnIntervalSeconds must be positive.";
                return false;
            }

            if (settings.TargetLifetimeSeconds <= 0f)
            {
                reason = "Session blocked: targetLifetimeSeconds must be positive.";
                return false;
            }

            if (settings.ActiveZones == null || settings.ActiveZones.Length == 0)
            {
                reason = "Session blocked: active target zones are required.";
                return false;
            }

            if (sessionDurationSeconds <= 0f)
            {
                reason = "Session blocked: sessionDurationSeconds must be positive.";
                return false;
            }

            if (countdownSeconds < 0f)
            {
                reason = "Session blocked: countdownSeconds must not be negative.";
                return false;
            }

            return true;
        }

        private sealed class RuntimeDifficultyWindow
        {
            public int windowIndex;
            public float startedAtSeconds;
            public float endedAtSeconds;
            public int spawnedCount;
            public int hitCount;
            public int missCount;
            public float averageReactionTimeMs;
            public float hitRate;
            public float averageAccuracy;
        }

        private void Block(string reason)
        {
            if (targetSpawner != null)
            {
                targetSpawner.Stop();
            }

            if (hitDetector != null)
            {
                hitDetector.Stop();
            }

            blockReason = string.IsNullOrWhiteSpace(reason) ? "Session blocked." : reason;
            state = SessionState.Blocked;
            Debug.LogWarning(blockReason);
        }

        [Serializable]
        private sealed class TrainingSessionEvidenceContext
        {
            public string startingLevelSource;
            public int startingDifficultyLevel;
            public string approvedPlanItemId;
            public string assessmentSourceId;

            public static TrainingSessionEvidenceContext FromJson(string json)
            {
                if (string.IsNullOrWhiteSpace(json))
                {
                    throw new InvalidOperationException("Session blocked: runtime config JSON is required.");
                }

                TrainingSessionEvidenceContext context = JsonUtility.FromJson<TrainingSessionEvidenceContext>(json);
                if (context == null)
                {
                    throw new InvalidOperationException("Session blocked: training evidence context could not be parsed.");
                }

                context.Validate();
                return context;
            }

            private void Validate()
            {
                if (startingLevelSource != "clinician_approved_plan"
                    && startingLevelSource != "clinician_approved_assessment")
                {
                    throw new InvalidOperationException(
                        "Session blocked: startingLevelSource must be clinician_approved_plan or clinician_approved_assessment.");
                }

                Require(approvedPlanItemId, "approvedPlanItemId");
                Require(assessmentSourceId, "assessmentSourceId");

                if (startingDifficultyLevel < MinimumDifficultyLevel
                    || startingDifficultyLevel > MaximumDifficultyLevel)
                {
                    throw new InvalidOperationException(
                        "Session blocked: startingDifficultyLevel must be between 1 and 3.");
                }
            }

            private static void Require(string value, string fieldName)
            {
                if (string.IsNullOrWhiteSpace(value))
                {
                    throw new InvalidOperationException(
                        "Session blocked: runtime config field is required: " + fieldName);
                }
            }
        }
    }
}
