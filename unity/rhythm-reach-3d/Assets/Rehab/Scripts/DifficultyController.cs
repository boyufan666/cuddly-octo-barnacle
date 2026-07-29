using System;
using UnityEngine;

namespace Rehab.RhythmReach
{
    public sealed class DifficultyController : MonoBehaviour
    {
        [Serializable]
        public sealed class DifficultySettings
        {
            [SerializeField] private string difficulty;
            [SerializeField] private int difficultyLevel;
            [SerializeField] private float spawnIntervalSeconds;
            [SerializeField] private float targetLifetimeSeconds;
            [SerializeField] private float targetSpeed;
            [SerializeField] private RhythmTargetZone[] activeZones;

            public DifficultySettings(
                string difficulty,
                int difficultyLevel,
                float spawnIntervalSeconds,
                float targetLifetimeSeconds,
                float targetSpeed,
                RhythmTargetZone[] activeZones)
            {
                this.difficulty = difficulty;
                this.difficultyLevel = difficultyLevel;
                this.spawnIntervalSeconds = spawnIntervalSeconds;
                this.targetLifetimeSeconds = targetLifetimeSeconds;
                this.targetSpeed = targetSpeed;
                this.activeZones = activeZones;
            }

            public string Difficulty
            {
                get { return difficulty; }
            }

            public int DifficultyLevel
            {
                get { return difficultyLevel; }
            }

            public float SpawnIntervalSeconds
            {
                get { return spawnIntervalSeconds; }
            }

            public float TargetLifetimeSeconds
            {
                get { return targetLifetimeSeconds; }
            }

            public float TargetSpeed
            {
                get { return targetSpeed; }
            }

            public RhythmTargetZone[] ActiveZones
            {
                get { return activeZones; }
            }
        }

        public const string Easy = "easy";
        public const string Standard = "standard";
        public const string Advanced = "advanced";

        [SerializeField] private DifficultySettings[] explicitDifficulties = CreateDefaultDifficultySettings();

        public DifficultySettings[] ExplicitDifficulties
        {
            get { return explicitDifficulties; }
        }

        public bool TryResolveDifficulty(string explicitDifficulty, out DifficultySettings settings, out string blockReason)
        {
            settings = null;
            blockReason = string.Empty;

            if (string.IsNullOrWhiteSpace(explicitDifficulty))
            {
                blockReason = "Difficulty blocked: explicit difficulty is required.";
                return false;
            }

            for (int i = 0; i < explicitDifficulties.Length; i += 1)
            {
                DifficultySettings candidate = explicitDifficulties[i];
                if (candidate == null)
                {
                    continue;
                }

                if (string.Equals(candidate.Difficulty, explicitDifficulty, StringComparison.OrdinalIgnoreCase))
                {
                    settings = candidate;
                    return true;
                }
            }

            blockReason = "Difficulty blocked: unknown explicit difficulty '" + explicitDifficulty + "'.";
            return false;
        }

        private static DifficultySettings[] CreateDefaultDifficultySettings()
        {
            return new[]
            {
                new DifficultySettings(
                    Easy,
                    1,
                    2.2f,
                    3.4f,
                    0.8f,
                    new[] { RhythmTargetZone.Left, RhythmTargetZone.Right, RhythmTargetZone.Middle }),
                new DifficultySettings(
                    Standard,
                    2,
                    1.7f,
                    2.8f,
                    1.1f,
                    new[]
                    {
                        RhythmTargetZone.Left,
                        RhythmTargetZone.Right,
                        RhythmTargetZone.High,
                        RhythmTargetZone.Middle
                    }),
                new DifficultySettings(
                    Advanced,
                    3,
                    1.0f,
                    1.7f,
                    1.45f,
                    new[]
                    {
                        RhythmTargetZone.Left,
                        RhythmTargetZone.Right,
                        RhythmTargetZone.High,
                        RhythmTargetZone.Middle,
                        RhythmTargetZone.Low
                    })
            };
        }
    }
}
