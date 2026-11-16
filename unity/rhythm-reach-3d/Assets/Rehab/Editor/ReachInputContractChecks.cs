using System;
using System.Reflection;
using Rehab.RhythmReach;
using UnityEngine;

namespace Rehab.EditorTools
{
    // Executes actual Unity camera/input code in Editor mode; no hardware or result submission.
    public static class ReachInputContractChecks
    {
        private static void Require(bool value, string message)
        {
            if (!value) throw new InvalidOperationException("Reach input check failed: " + message);
        }

        private static void Set(object target, string name, object value)
        {
            target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
        }

        private static string Payload(Camera camera, Vector3 point, string id, string side)
        {
            Vector3 viewport = camera.WorldToViewportPoint(point);
            return JsonUtility.ToJson(new InputPayload { targetId = id, side = side,
                coordinateSpace = "mirrored_viewport", screenX = viewport.x,
                screenY = 1f - viewport.y, confidence = 0.9f });
        }

        public static void Run()
        {
            var cameraObject = new GameObject("ContractCamera");
            var inputObject = new GameObject("ContractInput");
            try
            {
                Camera camera = cameraObject.AddComponent<Camera>();
                camera.transform.position = new Vector3(0f, 1.25f, -6f);
                camera.transform.rotation = Quaternion.Euler(8f, 0f, 0f);
                camera.fieldOfView = 56f;
                camera.aspect = 16f / 9f;
                PoseInputBridge input = inputObject.AddComponent<PoseInputBridge>();
                Set(input, "inputCamera", camera);
                Vector3[] targets = { new Vector3(-1.5f, 0f, 4f), new Vector3(1.5f, 0f, 4f),
                    new Vector3(0f, 1.1f, 4f), new Vector3(0f, -1.1f, 4f), new Vector3(0f, 0f, 4f) };
                for (int i = 0; i < targets.Length; i++)
                {
                    input.ReceiveWebGlReachHit(Payload(camera, targets[i], "zone-" + i, "left"));
                    Require(input.TryConsumeReachHit(), "target event consumed " + i);
                    Require(Vector3.Distance(input.DevelopmentPointerWorldPosition, targets[i]) < 0.001f,
                        "actual perspective camera intersects target " + i);
                }
                input.ResetRuntimeInput();
                string left = Payload(camera, targets[0], "same-frame-left", "left");
                input.ReceiveWebGlReachHit(left);
                input.ReceiveWebGlReachHit(Payload(camera, targets[1], "same-frame-right", "right"));
                input.ReceiveWebGlReachHit(left);
                Require(input.TryConsumeReachHit() && Vector3.Distance(input.DevelopmentPointerWorldPosition, targets[0]) < 0.001f, "left FIFO");
                Require(input.TryConsumeReachHit() && Vector3.Distance(input.DevelopmentPointerWorldPosition, targets[1]) < 0.001f, "right FIFO without overwrite");
                Require(!input.TryConsumeReachHit(), "duplicate event rejected");
                input.ReceiveWebGlReachHit("{\"targetId\":\"legacy\",\"screenX\":0.5,\"screenY\":0.5,\"confidence\":0.9,\"side\":\"left\"}");
                Require(!input.TryConsumeReachHit(), "missing coordinateSpace rejected");
                Set(input, "reachHitSource", "development-only");
                TargetHitDetector detector = inputObject.AddComponent<TargetHitDetector>();
                Set(detector, "poseInputBridge", input);
                detector.Stop();
                Require(input.ReachHitSource == "development-only" && input.ReachHitConfidence == 0.9f, "Stop retains result provenance");
                input.ResetRuntimeInput();
                Require(input.ReachHitSource == string.Empty && input.ReachHitConfidence == 0f, "next session clears provenance");
                Debug.Log("REACH_INPUT_CONTRACT_CHECKS_PASSED: five camera targets, dual-hand FIFO, deduplication, explicit coordinate space, Stop provenance, next-session reset");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(inputObject);
                UnityEngine.Object.DestroyImmediate(cameraObject);
            }
        }

        public static void ValidateAndBuild()
        {
            Run();
            RhythmReachWebGlBuilder.BuildFormalWebGl();
        }

        [Serializable]
        private sealed class InputPayload
        {
            public string targetId;
            public string coordinateSpace;
            public string side;
            public float screenX;
            public float screenY;
            public float confidence;
        }
    }
}
