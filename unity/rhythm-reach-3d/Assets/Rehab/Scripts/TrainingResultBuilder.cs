using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace Rehab
{
    public static class TrainingResultBuilder
    {
        private const string ResultType = "training_result";
        private const string MetricsSource = "unity_webgl";

        public static string BuildJson(RehabRuntimeConfig config, TrainingResultInput input)
        {
            if (config == null)
            {
                throw new ArgumentNullException(nameof(config));
            }

            if (input == null)
            {
                throw new ArgumentNullException(nameof(input));
            }

            config.Validate();
            input.Validate();

            var generatedAt = string.IsNullOrWhiteSpace(input.clientGeneratedAt)
                ? DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                : input.clientGeneratedAt;

            var rawPayload = new RawTrainingPayload
            {
                resultContractVersion = config.resultContractVersion,
                sessionId = config.sessionId,
                collectionBatchId = config.collectionBatchId,
                gameRunId = config.gameRunId,
                gameCode = config.gameCode,
                gameVersion = config.gameVersion,
                deviceCode = config.deviceCode,
                bridgeProtocolVersion = config.bridgeProtocolVersion,
                clientGeneratedAt = generatedAt,
                score = input.score,
                completionRate = input.completionRate,
                durationSeconds = input.durationSeconds,
                reactionTimeMs = input.reactionTimeMs,
                motionAccuracy = input.motionAccuracy,
                exerciseIntensity = input.exerciseIntensity,
                source_only_not_camera_pose = input.source_only_not_camera_pose,
                motionMetrics = input.motionMetrics
            };

            var rawPayloadJson = JsonUtility.ToJson(rawPayload);
            var rawPayloadHash = ComputeSha256(rawPayloadJson);
            var result = new TrainingResultEnvelope
            {
                type = ResultType,
                action = ResultType,
                protocolVersion = config.bridgeProtocolVersion,
                resultContractVersion = config.resultContractVersion,
                sessionId = config.sessionId,
                collectionBatchId = config.collectionBatchId,
                gameRunId = config.gameRunId,
                gameVersion = config.gameVersion,
                clientGeneratedAt = generatedAt,
                rawPayloadHash = rawPayloadHash,
                score = rawPayload.score,
                completionRate = rawPayload.completionRate,
                durationSeconds = rawPayload.durationSeconds,
                reactionTimeMs = rawPayload.reactionTimeMs,
                motionAccuracy = rawPayload.motionAccuracy,
                exerciseIntensity = rawPayload.exerciseIntensity,
                metricsSummary = new MetricsSummary
                {
                    source = MetricsSource,
                    resultContractVersion = config.resultContractVersion,
                    collectionBatchId = config.collectionBatchId,
                    gameCode = config.gameCode,
                    gameVersion = config.gameVersion,
                    deviceCode = config.deviceCode,
                    gameRunId = config.gameRunId,
                    protocolVersion = config.bridgeProtocolVersion,
                    clientGeneratedAt = generatedAt,
                    rawPayloadHash = rawPayloadHash,
                    source_only_not_camera_pose = input.source_only_not_camera_pose,
                    dynamicDifficultyEvidence = input.dynamicDifficultyEvidence
                },
                motionMetrics = input.motionMetrics,
                unity_webgl = new UnityWebGlSummary
                {
                    source = MetricsSource,
                    resultContractVersion = config.resultContractVersion,
                    collectionBatchId = config.collectionBatchId,
                    gameCode = config.gameCode,
                    gameVersion = config.gameVersion,
                    deviceCode = config.deviceCode,
                    gameRunId = config.gameRunId,
                    protocolVersion = config.bridgeProtocolVersion,
                    source_only_not_camera_pose = input.source_only_not_camera_pose
                }
            };

            return JsonUtility.ToJson(result);
        }

        private static string ComputeSha256(string payload)
        {
            using (var sha256 = SHA256.Create())
            {
                var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(payload));
                var builder = new StringBuilder(bytes.Length * 2);
                foreach (var value in bytes)
                {
                    builder.Append(value.ToString("x2"));
                }

                return builder.ToString();
            }
        }

    }

    [Serializable]
    public sealed class TrainingResultInput
    {
        public string clientGeneratedAt;
        public int score;
        public float completionRate;
        public int durationSeconds;
        public int reactionTimeMs;
        public float motionAccuracy;
        public string exerciseIntensity = "moderate";
        public bool source_only_not_camera_pose;
        public MotionMetric[] motionMetrics;
        public DynamicDifficultyEvidence dynamicDifficultyEvidence;

        public void Validate()
        {
            if (string.IsNullOrWhiteSpace(exerciseIntensity))
            {
                throw new InvalidOperationException("exerciseIntensity is required.");
            }

            if (exerciseIntensity != "low" && exerciseIntensity != "moderate" && exerciseIntensity != "high")
            {
                throw new InvalidOperationException("exerciseIntensity must be low, moderate, or high.");
            }

            RequireRange(score, "score", 0f, 100f);
            RequireRange(completionRate, "completionRate", 0f, 1f);
            RequirePositive(durationSeconds, "durationSeconds");
            RequirePositive(reactionTimeMs, "reactionTimeMs");
            RequireRange(motionAccuracy, "motionAccuracy", 0f, 1f);

            if (motionMetrics == null || motionMetrics.Length == 0)
            {
                throw new InvalidOperationException("motionMetrics must contain at least one metric.");
            }

            for (var index = 0; index < motionMetrics.Length; index++)
            {
                if (motionMetrics[index] == null)
                {
                    throw new InvalidOperationException($"motionMetrics[{index}] is required.");
                }

                motionMetrics[index].Validate(index);
            }

            RequireDynamicDifficultyEvidence(dynamicDifficultyEvidence);
        }

        private static void RequireDynamicDifficultyEvidence(DynamicDifficultyEvidence evidence)
        {
            if (evidence == null)
            {
                throw new InvalidOperationException("dynamicDifficultyEvidence is required.");
            }

            evidence.Validate();
        }

        private static void RequirePositive(float value, string label)
        {
            if (!float.IsFinite(value) || value <= 0f)
            {
                throw new InvalidOperationException(label + " must be greater than 0.");
            }
        }

        private static void RequireRange(float value, string label, float minimum, float maximum)
        {
            if (!float.IsFinite(value) || value < minimum || value > maximum)
            {
                throw new InvalidOperationException(
                    label + " must be between " + minimum + " and " + maximum + ".");
            }
        }
    }

    [Serializable]
    public sealed class MotionMetric
    {
        public string metricType;
        public float metricValue;
        public float confidence;
        public string unit;
        public int sampleCount;
        public string qualityFlag;
        public string windowStartedAt;
        public string windowEndedAt;
        public RawMetricSummary rawSummary;

        public void Validate(int index)
        {
            if (string.IsNullOrWhiteSpace(metricType))
            {
                throw new InvalidOperationException($"motionMetrics[{index}].metricType is required.");
            }

            if (!float.IsFinite(metricValue))
            {
                throw new InvalidOperationException($"motionMetrics[{index}].metricValue must be finite.");
            }

            if (!float.IsFinite(confidence))
            {
                throw new InvalidOperationException($"motionMetrics[{index}].confidence must be finite.");
            }

            if (confidence < 0f || confidence > 1f)
            {
                throw new InvalidOperationException($"motionMetrics[{index}].confidence must be between 0 and 1.");
            }

            if (sampleCount < 0)
            {
                throw new InvalidOperationException($"motionMetrics[{index}].sampleCount must not be negative.");
            }

            if (sampleCount == 0)
            {
                throw new InvalidOperationException($"motionMetrics[{index}].sampleCount must be positive.");
            }

            if (qualityFlag != "valid" && qualityFlag != "suspicious")
            {
                throw new InvalidOperationException(
                    $"motionMetrics[{index}].qualityFlag must be valid or suspicious.");
            }

            DateTime startedAt = RequireUtcIsoTimestamp(windowStartedAt, $"motionMetrics[{index}].windowStartedAt");
            DateTime endedAt = RequireUtcIsoTimestamp(windowEndedAt, $"motionMetrics[{index}].windowEndedAt");
            if (startedAt > endedAt)
            {
                throw new InvalidOperationException(
                    $"motionMetrics[{index}].windowStartedAt must not be later than windowEndedAt.");
            }
        }

        private static DateTime RequireUtcIsoTimestamp(string value, string label)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException(label + " is required.");
            }

            DateTime parsed;
            if (!DateTime.TryParse(
                    value,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out parsed))
            {
                throw new InvalidOperationException(label + " must be a valid UTC ISO timestamp.");
            }

            return parsed.ToUniversalTime();
        }
    }

    [Serializable]
    public sealed class RawMetricSummary
    {
        public int sampleCount;
        public int hitCount;
        public int missCount;
        public float minValue;
        public float maxValue;
        public float averageValue;
        public string source_only_not_camera_pose;
    }

    [Serializable]
    public sealed class DynamicDifficultyEvidence
    {
        public string schemaVersion;
        public DynamicDifficultyEvidenceEvent[] events;

        public void Validate()
        {
            if (!string.Equals(schemaVersion, "1.0.0", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("dynamicDifficultyEvidence.schemaVersion must be 1.0.0.");
            }

            if (events == null || events.Length == 0)
            {
                throw new InvalidOperationException("dynamicDifficultyEvidence.events must contain at least one event.");
            }

            for (var index = 0; index < events.Length; index += 1)
            {
                if (events[index] == null)
                {
                    throw new InvalidOperationException($"dynamicDifficultyEvidence.events[{index}] is required.");
                }

                events[index].Validate(index);
            }
        }
    }

    [Serializable]
    public sealed class DynamicDifficultyEvidenceEvent
    {
        public int startingLevel;
        public string startingLevelSource;
        public string approvedPlanItemId;
        public string assessmentSourceId;
        public string triggerReason;
        public DifficultyLevelSnapshot before;
        public DifficultyLevelSnapshot after;
        public string adjustedAt;
        public string runtimeFrameId;
        public string runtimeWindowId;
        public string safetyClampReason;

        public void Validate(int index)
        {
            if (startingLevel < 1 || startingLevel > 3)
            {
                throw new InvalidOperationException(
                    $"dynamicDifficultyEvidence.events[{index}].startingLevel must be between 1 and 3.");
            }

            if (startingLevelSource != "clinician_approved_plan"
                && startingLevelSource != "clinician_approved_assessment")
            {
                throw new InvalidOperationException(
                    $"dynamicDifficultyEvidence.events[{index}].startingLevelSource is invalid.");
            }

            RequireNonEmpty(approvedPlanItemId, $"dynamicDifficultyEvidence.events[{index}].approvedPlanItemId");
            RequireNonEmpty(assessmentSourceId, $"dynamicDifficultyEvidence.events[{index}].assessmentSourceId");
            RequireValidTriggerReason(triggerReason, index);
            RequireSnapshot(before, index, "before");
            RequireSnapshot(after, index, "after");
            RequireUtcIsoTimestamp(adjustedAt, $"dynamicDifficultyEvidence.events[{index}].adjustedAt");
            RequireNonEmpty(runtimeFrameId, $"dynamicDifficultyEvidence.events[{index}].runtimeFrameId");
            RequireNonEmpty(runtimeWindowId, $"dynamicDifficultyEvidence.events[{index}].runtimeWindowId");

            if (before.speed == after.speed && before.complexityLevel == after.complexityLevel)
            {
                RequireNonEmpty(safetyClampReason, $"dynamicDifficultyEvidence.events[{index}].safetyClampReason");
            }
        }

        private static void RequireValidTriggerReason(string value, int index)
        {
            if (value == "prior_assessment"
                || value == "reaction_slow"
                || value == "accuracy_high"
                || value == "accuracy_low"
                || value == "fatigue_risk"
                || value == "clinician_limit")
            {
                return;
            }

            throw new InvalidOperationException(
                $"dynamicDifficultyEvidence.events[{index}].triggerReason is invalid.");
        }

        private static void RequireSnapshot(DifficultyLevelSnapshot snapshot, int index, string label)
        {
            if (snapshot == null)
            {
                throw new InvalidOperationException(
                    $"dynamicDifficultyEvidence.events[{index}].{label} is required.");
            }

            snapshot.Validate($"dynamicDifficultyEvidence.events[{index}].{label}");
        }

        private static void RequireNonEmpty(string value, string label)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException(label + " is required.");
            }
        }

        private static DateTime RequireUtcIsoTimestamp(string value, string label)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException(label + " is required.");
            }

            DateTime parsed;
            if (!DateTime.TryParse(
                    value,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out parsed))
            {
                throw new InvalidOperationException(label + " must be a valid UTC ISO timestamp.");
            }

            return parsed.ToUniversalTime();
        }
    }

    [Serializable]
    public sealed class DifficultyLevelSnapshot
    {
        public float speed;
        public int complexityLevel;

        public void Validate(string label)
        {
            if (!float.IsFinite(speed) || speed <= 0f)
            {
                throw new InvalidOperationException(label + ".speed must be greater than 0.");
            }

            if (complexityLevel < 1 || complexityLevel > 3)
            {
                throw new InvalidOperationException(label + ".complexityLevel must be between 1 and 3.");
            }
        }
    }

    [Serializable]
    internal sealed class RawTrainingPayload
    {
        public string resultContractVersion;
        public string sessionId;
        public string collectionBatchId;
        public string gameRunId;
        public string gameCode;
        public string gameVersion;
        public string deviceCode;
        public string bridgeProtocolVersion;
        public string clientGeneratedAt;
        public int score;
        public float completionRate;
        public int durationSeconds;
        public int reactionTimeMs;
        public float motionAccuracy;
        public string exerciseIntensity;
        public bool source_only_not_camera_pose;
        public MotionMetric[] motionMetrics;
    }

    [Serializable]
    internal sealed class TrainingResultEnvelope
    {
        public string type;
        public string action;
        public string protocolVersion;
        public string resultContractVersion;
        public string sessionId;
        public string collectionBatchId;
        public string gameRunId;
        public string gameVersion;
        public string clientGeneratedAt;
        public string rawPayloadHash;
        public int score;
        public float completionRate;
        public int durationSeconds;
        public int reactionTimeMs;
        public float motionAccuracy;
        public string exerciseIntensity;
        public MetricsSummary metricsSummary;
        public MotionMetric[] motionMetrics;
        public UnityWebGlSummary unity_webgl;
    }

    [Serializable]
    internal sealed class MetricsSummary
    {
        public string source;
        public string resultContractVersion;
        public string collectionBatchId;
        public string gameCode;
        public string gameVersion;
        public string deviceCode;
        public string gameRunId;
        public string protocolVersion;
        public string clientGeneratedAt;
        public string rawPayloadHash;
        public bool source_only_not_camera_pose;
        public DynamicDifficultyEvidence dynamicDifficultyEvidence;
    }

    [Serializable]
    internal sealed class UnityWebGlSummary
    {
        public string source;
        public string resultContractVersion;
        public string collectionBatchId;
        public string gameCode;
        public string gameVersion;
        public string deviceCode;
        public string gameRunId;
        public string protocolVersion;
        public bool source_only_not_camera_pose;
    }
}
