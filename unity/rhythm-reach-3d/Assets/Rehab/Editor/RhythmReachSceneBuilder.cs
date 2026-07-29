using System;
using Rehab;
using Rehab.RhythmReach;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Rehab.EditorTools
{
    public static class RhythmReachSceneBuilder
    {
        private const string ScenePath = "Assets/Rehab/Scenes/RhythmReachTraining.unity";

        [MenuItem("Rehab/Rhythm Reach/Build Default Scene")]
        public static void BuildDefaultScene()
        {
            var scene = EditorSceneManager.NewScene(
                NewSceneSetup.EmptyScene,
                NewSceneMode.Single);

            RenderSettings.ambientLight = new Color(0.68f, 0.82f, 0.86f);
            CreateCamera();
            CreateLight();
            CreateTrainingLane();

            GameObject session = new GameObject("RhythmReachSession");
            var difficulty = session.AddComponent<DifficultyController>();
            var spawner = session.AddComponent<RhythmTargetSpawner>();
            var hitDetector = session.AddComponent<TargetHitDetector>();
            var poseInput = session.AddComponent<PoseInputBridge>();
            var bridge = session.AddComponent<RehabTrainingResultBridge>();
            var controller = session.AddComponent<GameSessionController>();

            GameObject spawnRoot = new GameObject("Target Spawn Root");
            spawnRoot.transform.SetParent(session.transform, false);

            SetPrivateField(controller, "explicitDifficulty", DifficultyController.Standard);
            SetPrivateField(controller, "difficultyController", difficulty);
            SetPrivateField(controller, "targetSpawner", spawner);
            SetPrivateField(controller, "hitDetector", hitDetector);
            SetPrivateField(controller, "poseInputBridge", poseInput);
            SetPrivateField(controller, "resultBridge", bridge);
            SetPrivateField(spawner, "targetParent", spawnRoot.transform);
            SetPrivateField(poseInput, "inputCamera", Camera.main);

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(ScenePath, true)
            };
        }

        private static void CreateCamera()
        {
            GameObject cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            cameraObject.transform.position = new Vector3(0f, 1.25f, -6f);
            cameraObject.transform.rotation = Quaternion.Euler(8f, 0f, 0f);
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.72f, 0.88f, 0.92f);
            camera.fieldOfView = 56f;
        }

        private static void CreateLight()
        {
            GameObject lightObject = new GameObject("Soft Clinical Key Light");
            lightObject.transform.rotation = Quaternion.Euler(48f, -28f, 0f);
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            light.color = new Color(0.84f, 0.96f, 1f);
        }

        private static void CreateTrainingLane()
        {
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            floor.name = "Clinical Training Lane";
            floor.transform.position = new Vector3(0f, -0.32f, 2.1f);
            floor.transform.localScale = new Vector3(4.6f, 0.06f, 7.2f);
            floor.GetComponent<Renderer>().sharedMaterial = CreateMaterial(
                "Clinical Lane Material",
                new Color(0.56f, 0.78f, 0.82f));

            GameObject centerLine = GameObject.CreatePrimitive(PrimitiveType.Cube);
            centerLine.name = "Soft Guidance Line";
            centerLine.transform.position = new Vector3(0f, -0.27f, 2.1f);
            centerLine.transform.localScale = new Vector3(0.05f, 0.025f, 7.0f);
            centerLine.GetComponent<Renderer>().sharedMaterial = CreateMaterial(
                "Guidance Line Material",
                new Color(0.18f, 0.68f, 0.78f));
        }

        private static Material CreateMaterial(string name, Color color)
        {
            var material = new Material(Shader.Find("Standard"));
            material.name = name;
            material.color = color;
            return material;
        }

        private static void SetPrivateField(object target, string fieldName, object value)
        {
            var field = target.GetType().GetField(
                fieldName,
                System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.NonPublic);
            if (field == null)
            {
                throw new MissingFieldException(target.GetType().Name, fieldName);
            }

            field.SetValue(target, value);
            EditorUtility.SetDirty((UnityEngine.Object)target);
        }
    }
}
