using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Rehab
{
    public sealed class RehabTrainingResultBridge : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void Rehab_PostTrainingResult(string json);
#endif

        public void SubmitResultJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Training result JSON is required.", nameof(json));
            }

#if UNITY_WEBGL && !UNITY_EDITOR
            Rehab_PostTrainingResult(json);
#else
            Debug.Log(json);
#endif
        }

        public void SubmitResult(RehabRuntimeConfig config, TrainingResultInput input)
        {
            SubmitResultJson(TrainingResultBuilder.BuildJson(config, input));
        }
    }
}
