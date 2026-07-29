using System;
using UnityEngine;

namespace Rehab.RhythmReach
{
    [Serializable]
    public sealed class RhythmTargetRecord
    {
        [SerializeField] private string targetId;
        [SerializeField] private RhythmTargetZone zone;
        [SerializeField] private float spawnedAtSeconds;
        [SerializeField] private bool wasHit;
        [SerializeField] private bool wasMissed;
        [SerializeField] private float hitAtSeconds;
        [SerializeField] private float hitAccuracy;

        public RhythmTargetRecord(string targetId, RhythmTargetZone zone, float spawnedAtSeconds)
        {
            if (string.IsNullOrWhiteSpace(targetId))
            {
                throw new ArgumentException("Target id is required.", "targetId");
            }

            if (spawnedAtSeconds < 0f)
            {
                throw new ArgumentOutOfRangeException("spawnedAtSeconds", spawnedAtSeconds, "Spawn time must not be negative.");
            }

            this.targetId = targetId;
            this.zone = zone;
            this.spawnedAtSeconds = spawnedAtSeconds;
            wasHit = false;
            wasMissed = false;
            hitAtSeconds = 0f;
            hitAccuracy = 0f;
        }

        public string TargetId
        {
            get { return targetId; }
        }

        public RhythmTargetZone Zone
        {
            get { return zone; }
        }

        public float SpawnedAtSeconds
        {
            get { return spawnedAtSeconds; }
        }

        public bool WasHit
        {
            get { return wasHit; }
        }

        public bool WasMissed
        {
            get { return wasMissed; }
        }

        public float HitAtSeconds
        {
            get { return hitAtSeconds; }
        }

        public float HitAccuracy
        {
            get { return hitAccuracy; }
        }

        public float ReactionTimeMilliseconds
        {
            get
            {
                if (!wasHit)
                {
                    return 0f;
                }

                return (hitAtSeconds - spawnedAtSeconds) * 1000f;
            }
        }

        public bool TryMarkHit(float hitAtSeconds, float accuracy)
        {
            if (wasHit || wasMissed)
            {
                return false;
            }

            if (hitAtSeconds < spawnedAtSeconds || accuracy < 0f || accuracy > 1f)
            {
                return false;
            }

            wasHit = true;
            this.hitAtSeconds = hitAtSeconds;
            hitAccuracy = accuracy;
            return true;
        }

        public bool TryMarkMiss()
        {
            if (wasHit || wasMissed)
            {
                return false;
            }

            wasMissed = true;
            return true;
        }
    }
}
