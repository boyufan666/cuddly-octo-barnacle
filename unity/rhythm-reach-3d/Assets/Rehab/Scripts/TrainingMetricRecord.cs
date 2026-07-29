using System;
using UnityEngine;

namespace Rehab.RhythmReach
{
    [Serializable]
    public sealed class TrainingMetricRecord
    {
        [SerializeField] private string metricType;
        [SerializeField] private float metricValue;
        [SerializeField] private string unit;
        [SerializeField] private int sampleCount;

        public TrainingMetricRecord(string metricType, float metricValue, string unit, int sampleCount)
        {
            if (string.IsNullOrWhiteSpace(metricType))
            {
                throw new ArgumentException("Metric type is required.", "metricType");
            }

            if (string.IsNullOrWhiteSpace(unit))
            {
                throw new ArgumentException("Metric unit is required.", "unit");
            }

            if (sampleCount <= 0)
            {
                throw new ArgumentOutOfRangeException("sampleCount", sampleCount, "Metric sample count must be positive.");
            }

            this.metricType = metricType;
            this.metricValue = metricValue;
            this.unit = unit;
            this.sampleCount = sampleCount;
        }

        public string MetricType
        {
            get { return metricType; }
        }

        public float MetricValue
        {
            get { return metricValue; }
        }

        public string Unit
        {
            get { return unit; }
        }

        public int SampleCount
        {
            get { return sampleCount; }
        }
    }
}
