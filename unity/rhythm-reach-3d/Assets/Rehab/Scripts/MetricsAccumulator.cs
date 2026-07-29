using System;
using System.Collections.Generic;
using UnityEngine;

namespace Rehab.RhythmReach
{
    public sealed class MetricsAccumulator
    {
        public const string ReactionTimeMetric = "reaction_time_ms";
        public const string TargetHitRateMetric = "target_hit_rate";
        public const string ArmRaiseAccuracyMetric = "arm_raise_accuracy";
        public const string DurationSecondsMetric = "duration_seconds";
        public const string DifficultyLevelMetric = "difficulty_level";
        public const string NoValidSamplesReason = "No valid training samples: at least one spawned target is required.";

        private readonly Dictionary<string, RhythmTargetRecord> targetsById = new Dictionary<string, RhythmTargetRecord>();
        private readonly List<RhythmTargetRecord> orderedTargets = new List<RhythmTargetRecord>();
        private float sessionStartedAtSeconds = -1f;
        private float sessionEndedAtSeconds = -1f;

        public IReadOnlyList<RhythmTargetRecord> Targets
        {
            get { return orderedTargets; }
        }

        public void BeginSession(float startedAtSeconds)
        {
            targetsById.Clear();
            orderedTargets.Clear();
            sessionStartedAtSeconds = Mathf.Max(0f, startedAtSeconds);
            sessionEndedAtSeconds = -1f;
        }

        public bool RecordSpawn(string targetId, RhythmTargetZone zone, float spawnedAtSeconds)
        {
            if (string.IsNullOrWhiteSpace(targetId) || targetsById.ContainsKey(targetId))
            {
                return false;
            }

            if (sessionStartedAtSeconds < 0f)
            {
                sessionStartedAtSeconds = Mathf.Max(0f, spawnedAtSeconds);
            }

            RhythmTargetRecord record = new RhythmTargetRecord(targetId, zone, spawnedAtSeconds);
            targetsById.Add(targetId, record);
            orderedTargets.Add(record);
            return true;
        }

        public bool RecordHit(string targetId, float hitAtSeconds, float accuracy)
        {
            RhythmTargetRecord record;
            if (!targetsById.TryGetValue(targetId, out record))
            {
                return false;
            }

            return record.TryMarkHit(hitAtSeconds, accuracy);
        }

        public bool RecordMiss(string targetId)
        {
            RhythmTargetRecord record;
            if (!targetsById.TryGetValue(targetId, out record))
            {
                return false;
            }

            return record.TryMarkMiss();
        }

        public void EndSession(float endedAtSeconds)
        {
            sessionEndedAtSeconds = Mathf.Max(0f, endedAtSeconds);
        }

        public bool TryBuildMetricRecords(
            int explicitDifficultyLevel,
            out List<TrainingMetricRecord> metrics,
            out string blockReason)
        {
            metrics = new List<TrainingMetricRecord>();
            blockReason = string.Empty;

            int spawnedCount = orderedTargets.Count;
            if (spawnedCount <= 0)
            {
                blockReason = NoValidSamplesReason;
                return false;
            }

            int hitCount = 0;
            float reactionTimeTotalMs = 0f;
            float accuracyTotal = 0f;

            for (int i = 0; i < orderedTargets.Count; i += 1)
            {
                RhythmTargetRecord target = orderedTargets[i];
                if (!target.WasHit)
                {
                    continue;
                }

                hitCount += 1;
                reactionTimeTotalMs += target.ReactionTimeMilliseconds;
                accuracyTotal += target.HitAccuracy;
            }

            if (hitCount <= 0)
            {
                blockReason = "No valid training samples: at least one hit target is required.";
                return false;
            }

            float durationSeconds = ResolveDurationSeconds();
            if (durationSeconds <= 0f)
            {
                blockReason = "No valid training samples: positive duration_seconds is required.";
                return false;
            }

            float reactionTimeMs = reactionTimeTotalMs / hitCount;
            float targetHitRate = (float)hitCount / spawnedCount;
            float armRaiseAccuracy = accuracyTotal / hitCount;

            metrics.Add(new TrainingMetricRecord(ReactionTimeMetric, reactionTimeMs, "ms", hitCount));
            metrics.Add(new TrainingMetricRecord(TargetHitRateMetric, targetHitRate, "ratio", spawnedCount));
            metrics.Add(new TrainingMetricRecord(ArmRaiseAccuracyMetric, armRaiseAccuracy, "ratio", hitCount));
            metrics.Add(new TrainingMetricRecord(DurationSecondsMetric, durationSeconds, "seconds", spawnedCount));
            metrics.Add(new TrainingMetricRecord(DifficultyLevelMetric, explicitDifficultyLevel, "level", spawnedCount));
            return true;
        }

        private float ResolveDurationSeconds()
        {
            if (sessionStartedAtSeconds < 0f)
            {
                return 0f;
            }

            float endedAt = sessionEndedAtSeconds;
            if (endedAt < 0f && orderedTargets.Count > 0)
            {
                RhythmTargetRecord lastTarget = orderedTargets[orderedTargets.Count - 1];
                endedAt = lastTarget.WasHit ? lastTarget.HitAtSeconds : lastTarget.SpawnedAtSeconds;
            }

            return Mathf.Max(0f, endedAt - sessionStartedAtSeconds);
        }
    }
}
