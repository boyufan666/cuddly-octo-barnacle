using UnityEngine;

namespace Rehab.RhythmReach
{
    public sealed class PoseInputBridge : MonoBehaviour
    {
        [SerializeField] private Camera inputCamera;
        [SerializeField] private KeyCode developmentHitKey = KeyCode.Space;
        [SerializeField] private float developmentPointerDepth = 4f;

        private bool pendingReachHit;
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
            if (payload == null || payload.confidence <= 0f || payload.confidence > 1f)
            {
                return;
            }

            reachHitWorldPosition = new Vector3(payload.x, payload.y, payload.z);
            hasReachHitWorldPosition = true;
            pendingReachHit = true;
            reachHitSource = "webgl_pose_event";
            reachHitConfidence = payload.confidence;
        }

        public bool TryConsumeReachHit()
        {
            if (!pendingReachHit)
            {
                return false;
            }

            pendingReachHit = false;
            return true;
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
                pendingReachHit = true;
                reachHitSource = "development-only";
                reachHitConfidence = 1f;
            }
        }
#endif

        [System.Serializable]
        private sealed class WebGlReachHitPayload
        {
            public float x;
            public float y;
            public float z;
            public float confidence;
        }
    }
}
