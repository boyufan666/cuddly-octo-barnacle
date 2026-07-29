using System;
using UnityEngine;

namespace Rehab.RhythmReach
{
    public sealed class TargetHitDetector : MonoBehaviour
    {
        [SerializeField] private RhythmTargetSpawner spawner;
        [SerializeField] private PoseInputBridge poseInputBridge;
        [SerializeField] private float maxHitDistance = 0.95f;

        private MetricsAccumulator metricsAccumulator;
        private bool isRunning;

        public void Begin(RhythmTargetSpawner targetSpawner, PoseInputBridge inputBridge, MetricsAccumulator accumulator)
        {
            if (targetSpawner == null)
            {
                throw new ArgumentNullException("targetSpawner");
            }

            if (inputBridge == null)
            {
                throw new ArgumentNullException("inputBridge");
            }

            if (accumulator == null)
            {
                throw new ArgumentNullException("accumulator");
            }

            spawner = targetSpawner;
            poseInputBridge = inputBridge;
            metricsAccumulator = accumulator;
            isRunning = true;
        }

        public void Stop()
        {
            isRunning = false;
            metricsAccumulator = null;
        }

        private void Update()
        {
            if (!isRunning || spawner == null || poseInputBridge == null || metricsAccumulator == null)
            {
                return;
            }

            if (!poseInputBridge.TryConsumeReachHit())
            {
                return;
            }

            TryRecordActiveTargetHit();
        }

        public bool TryRecordActiveTargetHit()
        {
            if (!isRunning || spawner == null || metricsAccumulator == null || !spawner.HasActiveTarget)
            {
                return false;
            }

            float accuracy = ResolveHitAccuracy();
            if (accuracy <= 0f)
            {
                return false;
            }

            bool recorded = metricsAccumulator.RecordHit(spawner.ActiveTargetId, Time.time, accuracy);
            if (!recorded)
            {
                return false;
            }

            spawner.MarkActiveTargetResolved();
            return true;
        }

        private float ResolveHitAccuracy()
        {
            if (spawner.ActiveTarget == null
                || poseInputBridge == null
                || !poseInputBridge.HasDevelopmentPointerWorldPosition)
            {
                return 1f;
            }

            float distance = Vector3.Distance(
                poseInputBridge.DevelopmentPointerWorldPosition,
                spawner.ActiveTarget.transform.position);
            if (maxHitDistance <= 0f)
            {
                return 0f;
            }

            float normalizedDistance = distance / maxHitDistance;
            if (normalizedDistance >= 1f)
            {
                return 0f;
            }

            float positionalAccuracy = 1f - normalizedDistance;
            float confidence = poseInputBridge.ReachHitConfidence;
            if (confidence <= 0f || confidence > 1f)
            {
                return 0f;
            }

            return positionalAccuracy * confidence;
        }
    }
}
