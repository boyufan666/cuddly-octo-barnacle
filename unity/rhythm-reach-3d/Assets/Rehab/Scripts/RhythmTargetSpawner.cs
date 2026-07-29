using System;
using UnityEngine;

namespace Rehab.RhythmReach
{
    public sealed class RhythmTargetSpawner : MonoBehaviour
    {
        [SerializeField] private Transform targetParent;
        [SerializeField] private float horizontalOffset = 1.5f;
        [SerializeField] private float verticalOffset = 1.1f;
        [SerializeField] private float targetDepth = 4f;
        [SerializeField] private float targetDiameter = 0.35f;

        private static Mesh targetMesh;
        private static Shader targetShader;

        private DifficultyController.DifficultySettings settings;
        private GameObject activeTarget;
        private string activeTargetId;
        private RhythmTargetZone activeZone;
        private float activeSpawnTime;
        private float nextSpawnTime;
        private int spawnedCount;
        private bool isRunning;

        public event Action<string, RhythmTargetZone, float, GameObject> TargetSpawned;
        public event Action<string> TargetMissed;

        public bool HasActiveTarget
        {
            get { return activeTarget != null && !string.IsNullOrWhiteSpace(activeTargetId); }
        }

        public string ActiveTargetId
        {
            get { return activeTargetId; }
        }

        public RhythmTargetZone ActiveZone
        {
            get { return activeZone; }
        }

        public float ActiveSpawnTime
        {
            get { return activeSpawnTime; }
        }

        public GameObject ActiveTarget
        {
            get { return activeTarget; }
        }

        public static bool TryValidateRenderDependencies(out string reason)
        {
            targetShader = Shader.Find("Standard");
            if (targetShader == null)
            {
                reason = "Session blocked: Unity Standard shader is required for rhythm target rendering.";
                return false;
            }

            reason = string.Empty;
            return true;
        }

        public void Begin(DifficultyController.DifficultySettings explicitSettings, float startedAtSeconds)
        {
            if (explicitSettings == null)
            {
                throw new ArgumentNullException("explicitSettings");
            }

            if (!HasUsableSettings(explicitSettings))
            {
                throw new ArgumentException("Spawner requires positive timing values and at least one active zone.", "explicitSettings");
            }

            ClearActiveTarget(false);
            settings = explicitSettings;
            spawnedCount = 0;
            nextSpawnTime = Mathf.Max(0f, startedAtSeconds);
            isRunning = true;
        }

        public void UpdateSettings(
            DifficultyController.DifficultySettings explicitSettings,
            float nextEligibleSpawnTimeSeconds)
        {
            if (explicitSettings == null)
            {
                throw new ArgumentNullException("explicitSettings");
            }

            if (!HasUsableSettings(explicitSettings))
            {
                throw new ArgumentException("Spawner requires positive timing values and at least one active zone.", "explicitSettings");
            }

            settings = explicitSettings;
            if (!HasActiveTarget && nextSpawnTime < Time.time)
            {
                nextSpawnTime = Mathf.Max(Time.time, nextEligibleSpawnTimeSeconds);
            }
        }

        public void Stop()
        {
            isRunning = false;
            ClearActiveTarget(false);
            settings = null;
        }

        public void MarkActiveTargetResolved()
        {
            ClearActiveTarget(false);
            if (settings != null)
            {
                nextSpawnTime = Time.time + settings.SpawnIntervalSeconds;
            }
        }

        private void Update()
        {
            if (!isRunning || settings == null)
            {
                return;
            }

            float now = Time.time;
            if (HasActiveTarget)
            {
                if (now - activeSpawnTime >= settings.TargetLifetimeSeconds)
                {
                    string missedTargetId = activeTargetId;
                    ClearActiveTarget(false);
                    TargetMissed?.Invoke(missedTargetId);
                    nextSpawnTime = now + settings.SpawnIntervalSeconds;
                }

                return;
            }

            if (now >= nextSpawnTime)
            {
                SpawnTarget(now);
            }
        }

        private void SpawnTarget(float spawnedAtSeconds)
        {
            RhythmTargetZone zone = settings.ActiveZones[spawnedCount % settings.ActiveZones.Length];
            activeTargetId = "rhythm-target-" + spawnedCount.ToString("D4");
            activeZone = zone;
            activeSpawnTime = spawnedAtSeconds;
            activeTarget = CreateVisualTarget(ResolveZoneColor(zone));
            activeTarget.name = activeTargetId + "-" + zone;
            activeTarget.transform.SetParent(targetParent != null ? targetParent : transform, false);
            activeTarget.transform.localPosition = ResolveZonePosition(zone);
            activeTarget.transform.localScale = Vector3.one * Mathf.Max(0.05f, targetDiameter);

            spawnedCount += 1;
            TargetSpawned?.Invoke(activeTargetId, zone, activeSpawnTime, activeTarget);
        }

        private static GameObject CreateVisualTarget(Color color)
        {
            GameObject target = new GameObject("Rhythm Target Visual");
            var meshFilter = target.AddComponent<MeshFilter>();
            var meshRenderer = target.AddComponent<MeshRenderer>();
            meshFilter.sharedMesh = GetTargetMesh();

            if (targetShader == null)
            {
                throw new InvalidOperationException(
                    "Rhythm target rendering dependencies must be validated before spawning targets.");
            }

            var material = new Material(targetShader)
            {
                color = color
            };
            meshRenderer.material = material;
            return target;
        }

        private static Mesh GetTargetMesh()
        {
            if (targetMesh != null)
            {
                return targetMesh;
            }

            targetMesh = BuildUvSphereMesh(12, 16);
            targetMesh.name = "Rhythm Reach Target Mesh";
            return targetMesh;
        }

        private static Mesh BuildUvSphereMesh(int latitudeSegments, int longitudeSegments)
        {
            int rings = latitudeSegments + 1;
            var vertices = new Vector3[rings * (longitudeSegments + 1)];
            var normals = new Vector3[vertices.Length];
            var triangles = new int[latitudeSegments * longitudeSegments * 6];

            int vertexIndex = 0;
            for (int latitude = 0; latitude <= latitudeSegments; latitude += 1)
            {
                float polar = Mathf.PI * latitude / latitudeSegments;
                float sinPolar = Mathf.Sin(polar);
                float cosPolar = Mathf.Cos(polar);

                for (int longitude = 0; longitude <= longitudeSegments; longitude += 1)
                {
                    float azimuth = 2f * Mathf.PI * longitude / longitudeSegments;
                    var normal = new Vector3(
                        sinPolar * Mathf.Cos(azimuth),
                        cosPolar,
                        sinPolar * Mathf.Sin(azimuth));
                    normals[vertexIndex] = normal;
                    vertices[vertexIndex] = normal * 0.5f;
                    vertexIndex += 1;
                }
            }

            int triangleIndex = 0;
            int rowLength = longitudeSegments + 1;
            for (int latitude = 0; latitude < latitudeSegments; latitude += 1)
            {
                for (int longitude = 0; longitude < longitudeSegments; longitude += 1)
                {
                    int current = latitude * rowLength + longitude;
                    int next = current + rowLength;

                    triangles[triangleIndex] = current;
                    triangles[triangleIndex + 1] = next;
                    triangles[triangleIndex + 2] = current + 1;
                    triangles[triangleIndex + 3] = current + 1;
                    triangles[triangleIndex + 4] = next;
                    triangles[triangleIndex + 5] = next + 1;
                    triangleIndex += 6;
                }
            }

            var mesh = new Mesh
            {
                vertices = vertices,
                normals = normals,
                triangles = triangles
            };
            mesh.RecalculateBounds();
            return mesh;
        }

        private void ClearActiveTarget(bool notifyMiss)
        {
            string clearedTargetId = activeTargetId;
            if (activeTarget != null)
            {
                Destroy(activeTarget);
            }

            activeTarget = null;
            activeTargetId = string.Empty;
            activeSpawnTime = 0f;

            if (notifyMiss && !string.IsNullOrWhiteSpace(clearedTargetId))
            {
                TargetMissed?.Invoke(clearedTargetId);
            }
        }

        private Vector3 ResolveZonePosition(RhythmTargetZone zone)
        {
            switch (zone)
            {
                case RhythmTargetZone.Left:
                    return new Vector3(-horizontalOffset, 0f, targetDepth);
                case RhythmTargetZone.Right:
                    return new Vector3(horizontalOffset, 0f, targetDepth);
                case RhythmTargetZone.High:
                    return new Vector3(0f, verticalOffset, targetDepth);
                case RhythmTargetZone.Middle:
                    return new Vector3(0f, 0f, targetDepth);
                case RhythmTargetZone.Low:
                    return new Vector3(0f, -verticalOffset, targetDepth);
                default:
                    throw new ArgumentOutOfRangeException("zone", zone, "Unsupported rhythm target zone.");
            }
        }

        private static Color ResolveZoneColor(RhythmTargetZone zone)
        {
            switch (zone)
            {
                case RhythmTargetZone.Left:
                    return new Color(0.2f, 0.55f, 1f);
                case RhythmTargetZone.Right:
                    return new Color(1f, 0.35f, 0.35f);
                case RhythmTargetZone.High:
                    return new Color(0.9f, 0.85f, 0.2f);
                case RhythmTargetZone.Middle:
                    return new Color(0.35f, 0.9f, 0.45f);
                case RhythmTargetZone.Low:
                    return new Color(0.95f, 0.45f, 0.95f);
                default:
                    throw new ArgumentOutOfRangeException("zone", zone, "Unsupported rhythm target zone.");
            }
        }

        private static bool HasUsableSettings(DifficultyController.DifficultySettings candidate)
        {
            return candidate != null
                && candidate.SpawnIntervalSeconds > 0f
                && candidate.TargetLifetimeSeconds > 0f
                && candidate.ActiveZones != null
                && candidate.ActiveZones.Length > 0;
        }
    }
}
