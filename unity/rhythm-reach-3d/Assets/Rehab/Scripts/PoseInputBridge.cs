using UnityEngine;
using System.Collections.Generic;

namespace Rehab.RhythmReach
{
    public sealed class PoseInputBridge : MonoBehaviour
    {
        [SerializeField] private Camera inputCamera;
        [SerializeField] private KeyCode developmentHitKey = KeyCode.Space;
        [SerializeField] private float developmentPointerDepth = 4f;

        private bool pendingEditorHit;
        private readonly Queue<WebGlReachHitPayload> pendingReachHits = new Queue<WebGlReachHitPayload>();
        private readonly HashSet<string> receivedHitIds = new HashSet<string>();
        [SerializeField] private float targetPlaneDepth = 4f;
        private Vector3 reachHitWorldPosition;
        private bool hasReachHitWorldPosition;
        private string reachHitSource = string.Empty;
        private float reachHitConfidence;

        public bool IsDevelopmentOnlyInput
        {
            get { return true; }
        }

        public Vector3 DevelopmentPointerWorldPosition
        {
            get { return reachHitWorldPosition; }
        }

        public bool HasDevelopmentPointerWorldPosition
        {
            get { return hasReachHitWorldPosition; }
        }

        public string ReachHitSource
        {
            get { return reachHitSource; }
        }

        public float ReachHitConfidence
        {
            get { return reachHitConfidence; }
        }

        private void Update()
        {
#if UNITY_EDITOR
            UpdateEditorDevelopmentInput();
#else
            // WebGL builds only accept explicit reach events from the host page.
            // No synthetic development-only hit is generated outside the editor.
#endif
        }

        public void ReceiveWebGlReachHit(string payloadJson)
        {
            if (string.IsNullOrWhiteSpace(payloadJson))
            {
                return;
            }

            WebGlReachHitPayload payload = JsonUtility.FromJson<WebGlReachHitPayload>(payloadJson);
            if (payload == null || payload.coordinateSpace != "mirrored_viewport"
                || string.IsNullOrWhiteSpace(payload.targetId)
                || (payload.side != "left" && payload.side != "right")
                || !IsFinite(payload.confidence) || payload.confidence <= 0f || payload.confidence > 1f
                || !IsFinite(payload.screenX) || payload.screenX < 0f || payload.screenX > 1f
                || !IsFinite(payload.screenY) || payload.screenY < 0f || payload.screenY > 1f
                || inputCamera == null || !receivedHitIds.Add(payload.targetId))
            {
                return;
            }
            pendingReachHits.Enqueue(payload);
        }

        public void ClearPendingRuntimeInput()
        {
            pendingReachHits.Clear();
            pendingEditorHit = false;
            hasReachHitWorldPosition = false;
        }

        public void ResetRuntimeInput()
        {
            ClearPendingRuntimeInput();
            receivedHitIds.Clear();
            reachHitSource = string.Empty;
            reachHitConfidence = 0f;
        }

        public bool TryConsumeReachHit()
        {
#if UNITY_EDITOR
            if (pendingEditorHit) { pendingEditorHit = false; return true; }
#endif
            if (pendingReachHits.Count == 0) return false;
            WebGlReachHitPayload payload = pendingReachHits.Dequeue();
            Ray ray = inputCamera.ViewportPointToRay(new Vector3(payload.screenX, 1f - payload.screenY, 0f));
            Plane targetPlane = new Plane(Vector3.forward, new Vector3(0f, 0f, targetPlaneDepth));
            float distance;
            if (!targetPlane.Raycast(ray, out distance)) return false;
            reachHitWorldPosition = ray.GetPoint(distance);
            hasReachHitWorldPosition = true;
            reachHitSource = "webgl_pose_event";
            reachHitConfidence = payload.confidence;
            return true;
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        public bool TryConsumeDevelopmentHit()
        {
            return TryConsumeReachHit();
        }

#if UNITY_EDITOR
        private void UpdateEditorDevelopmentInput()
        {
            hasReachHitWorldPosition = false;
            if (inputCamera != null)
            {
                Vector3 mousePosition = Input.mousePosition;
                mousePosition.z = Mathf.Max(0.1f, developmentPointerDepth);
                reachHitWorldPosition = inputCamera.ScreenToWorldPoint(mousePosition);
                hasReachHitWorldPosition = true;
            }

            if (Input.GetMouseButtonDown(0) || Input.GetKeyDown(developmentHitKey))
            {
                pendingEditorHit = true;
                reachHitSource = "development-only";
                reachHitConfidence = 1f;
            }
        }
#endif

        [System.Serializable]
        private sealed class WebGlReachHitPayload
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
