using System;
using System.Globalization;
using UnityEngine;

namespace Rehab
{
    [Serializable]
    public sealed class RehabRuntimeConfig
    {
        public const string ExpectedGameCode = "rhythm_reach_3d";
        public const string ExpectedBridgeProtocolVersion = "1.0.0";
        public const string ExpectedResultContractVersion = "rehab-unity-result-v2";

        public string resultContractVersion;
        public string sessionId;
        public string clientStartedAt;
        public string collectionBatchId;
        public string gameRunId;
        public string gameCode;
        public string gameVersion;
        public string deviceCode;
        public string bridgeProtocolVersion;
        public float durationSeconds;
        public float minConfidence;

        public void Validate()
        {
            Require(resultContractVersion, nameof(resultContractVersion));
            Require(sessionId, nameof(sessionId));
            RequireCanonicalUtcIsoTimestamp(clientStartedAt, nameof(clientStartedAt));
            Require(collectionBatchId, nameof(collectionBatchId));
            Require(gameRunId, nameof(gameRunId));
            Require(gameCode, nameof(gameCode));
            Require(gameVersion, nameof(gameVersion));
            Require(deviceCode, nameof(deviceCode));
            Require(bridgeProtocolVersion, nameof(bridgeProtocolVersion));
            RequirePositive(durationSeconds, nameof(durationSeconds));
            RequireProbability(minConfidence, nameof(minConfidence));

            if (!string.Equals(gameCode, ExpectedGameCode, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Runtime config gameCode must be {ExpectedGameCode}.");
            }

            if (!string.Equals(bridgeProtocolVersion, ExpectedBridgeProtocolVersion, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Runtime config bridgeProtocolVersion must be {ExpectedBridgeProtocolVersion}.");
            }

            if (!string.Equals(resultContractVersion, ExpectedResultContractVersion, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Runtime config resultContractVersion must be {ExpectedResultContractVersion}.");
            }
        }

        public static RehabRuntimeConfig FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Runtime config JSON is required.", nameof(json));
            }

            var config = JsonUtility.FromJson<RehabRuntimeConfig>(json);
            if (config == null)
            {
                throw new InvalidOperationException("Runtime config JSON could not be parsed.");
            }

            config.Validate();
            return config;
        }

        private static void Require(string value, string fieldName)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException($"Runtime config field is required: {fieldName}");
            }
        }

        private static void RequirePositive(float value, string fieldName)
        {
            if (!float.IsFinite(value) || value <= 0f)
            {
                throw new InvalidOperationException(
                    $"Runtime config field must be greater than 0: {fieldName}");
            }
        }

        private static void RequireCanonicalUtcIsoTimestamp(string value, string fieldName)
        {
            Require(value, fieldName);

            DateTime parsed;
            if (!DateTime.TryParseExact(
                    value,
                    "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out parsed))
            {
                throw new InvalidOperationException(
                    $"Runtime config field must be a canonical UTC ISO timestamp: {fieldName}");
            }
        }

        private static void RequireProbability(float value, string fieldName)
        {
            if (!float.IsFinite(value) || value <= 0f || value > 1f)
            {
                throw new InvalidOperationException(
                    $"Runtime config field must be greater than 0 and at most 1: {fieldName}");
            }
        }
    }
}
