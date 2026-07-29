using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Rehab.EditorTools
{
    public static class RhythmReachWebGlBuilder
    {
        private const string GameCode = "rhythm_reach_3d";
        private const string GameName = "Rhythm Reach 3D";
        private const string GameVersion = "0.1.2";
        private const string BridgeProtocolVersion = "1.0.0";
        private const string ScenePath = "Assets/Rehab/Scenes/RhythmReachTraining.unity";
        private const string WebGlTemplate = "PROJECT:RehabWebGL";
        private const string PublicUrlBase = "/unity/" + GameCode + "/" + GameVersion;

        [MenuItem("Rehab/Rhythm Reach/Build Formal WebGL")]
        public static void BuildFormalWebGl()
        {
            string outputDirectory = ResolveBuildOutputDirectory();
            PreparePlayerSettings();
            Directory.CreateDirectory(outputDirectory);

            var buildOptions = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputDirectory,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            };

            BuildReport report = BuildPipeline.BuildPlayer(buildOptions);
            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new InvalidOperationException(
                    "Rhythm Reach 3D WebGL build failed: " + report.summary.result);
            }

            WriteManifest(outputDirectory);
        }

        private static void PreparePlayerSettings()
        {
            EditorUserBuildSettings.SwitchActiveBuildTarget(
                BuildTargetGroup.WebGL,
                BuildTarget.WebGL);
            PlayerSettings.companyName = "Rehab Platform";
            PlayerSettings.productName = GameName;
            PlayerSettings.bundleVersion = GameVersion;
            PlayerSettings.WebGL.template = WebGlTemplate;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.dataCaching = true;
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(ScenePath, true)
            };
        }

        private static string ResolveBuildOutputDirectory()
        {
            string explicitOutput = ReadCommandLineValue("--build-output");
            if (!string.IsNullOrWhiteSpace(explicitOutput))
            {
                return Path.GetFullPath(explicitOutput);
            }

            string projectRoot = Directory.GetParent(Application.dataPath).FullName;
            string unityRoot = Directory.GetParent(projectRoot).FullName;
            string repositoryRoot = Directory.GetParent(unityRoot).FullName;
            return Path.Combine(
                repositoryRoot,
                "apps",
                "web",
                "public",
                "unity",
                GameCode,
                GameVersion);
        }

        private static string ReadCommandLineValue(string key)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int index = 0; index < args.Length - 1; index += 1)
            {
                if (string.Equals(args[index], key, StringComparison.Ordinal))
                {
                    return args[index + 1];
                }
            }

            return string.Empty;
        }

        private static void WriteManifest(string outputDirectory)
        {
            string buildDirectory = Path.Combine(outputDirectory, "Build");
            if (!Directory.Exists(buildDirectory))
            {
                throw new DirectoryNotFoundException(
                    "Unity WebGL Build directory is missing: " + buildDirectory);
            }

            string loader = RequireSingleFile(buildDirectory, "*.loader.js");
            string framework = RequireSingleFile(buildDirectory, "*.framework.js");
            string data = RequireSingleFile(buildDirectory, "*.data");
            string wasm = RequireSingleFile(buildDirectory, "*.wasm");
            var artifacts = new[]
            {
                BuildArtifact(outputDirectory, loader),
                BuildArtifact(outputDirectory, framework),
                BuildArtifact(outputDirectory, data),
                BuildArtifact(outputDirectory, wasm)
            };

            string manifestJson = BuildManifestJson(artifacts);
            File.WriteAllText(
                Path.Combine(outputDirectory, "manifest.json"),
                manifestJson,
                new UTF8Encoding(false));
        }

        private static string RequireSingleFile(string directory, string pattern)
        {
            string[] matches = Directory.GetFiles(directory, pattern, SearchOption.TopDirectoryOnly);
            if (matches.Length != 1)
            {
                throw new InvalidOperationException(
                    $"Expected exactly one Unity WebGL artifact matching {pattern}, found {matches.Length}.");
            }

            return matches[0];
        }

        private static Artifact BuildArtifact(string outputDirectory, string filePath)
        {
            var info = new FileInfo(filePath);
            string relativePath = ToManifestPath(outputDirectory, filePath);
            return new Artifact
            {
                path = relativePath,
                sizeBytes = info.Length,
                sha256 = "sha256:" + ComputeSha256(filePath)
            };
        }

        private static string BuildManifestJson(IReadOnlyList<Artifact> artifacts)
        {
            string loaderUrl = ResolveArtifactUrl(artifacts, ".loader.js");
            string frameworkUrl = ResolveArtifactUrl(artifacts, ".framework.js");
            string dataUrl = ResolveArtifactUrl(artifacts, ".data");
            string codeUrl = ResolveArtifactUrl(artifacts, ".wasm");

            var builder = new StringBuilder();
            builder.AppendLine("{");
            AppendJsonLine(builder, 1, "releaseStatus", "released", true);
            AppendJsonLine(builder, 1, "gameCode", GameCode, true);
            AppendJsonLine(builder, 1, "gameName", GameName, true);
            AppendJsonLine(builder, 1, "gameVersion", GameVersion, true);
            AppendJsonLine(builder, 1, "bridgeProtocolVersion", BridgeProtocolVersion, true);
            AppendJsonLine(builder, 1, "unityVersion", Application.unityVersion, true);
            AppendJsonLine(builder, 1, "buildTarget", "WebGL", true);
            AppendJsonLine(builder, 1, "generatedAt", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), true);
            builder.AppendLine("  \"runtime\": {");
            AppendJsonLine(builder, 2, "unitySessionObjectName", "RhythmReachSession", true);
            AppendJsonLine(builder, 2, "runtimeConfigMethod", "SetRuntimeConfigJson", true);
            AppendJsonLine(builder, 2, "startMethod", "StartConfiguredSession", true);
            AppendJsonLine(builder, 2, "reachHitMethod", "ReceiveWebGlReachHit", true);
            AppendJsonLine(builder, 2, "difficultyMethod", "SetExplicitDifficulty", false);
            builder.AppendLine("  },");
            builder.AppendLine("  \"build\": {");
            AppendJsonLine(builder, 2, "loaderUrl", loaderUrl, true);
            AppendJsonLine(builder, 2, "dataUrl", dataUrl, true);
            AppendJsonLine(builder, 2, "frameworkUrl", frameworkUrl, true);
            AppendJsonLine(builder, 2, "codeUrl", codeUrl, false);
            builder.AppendLine("  },");
            builder.AppendLine("  \"runtimeRequirements\": {");
            builder.AppendLine("    \"cameraRequired\": true,");
            builder.AppendLine("    \"microphoneRequired\": false,");
            builder.AppendLine("    \"supportedInputModes\": [\"camera_pose\"]");
            builder.AppendLine("  },");
            builder.AppendLine("  \"requiredResultMetrics\": [");
            AppendMetricRequirement(builder, "reaction_time_ms", "ms", 0, 60000, true);
            AppendMetricRequirement(builder, "target_hit_rate", "ratio", 0, 1, true);
            AppendMetricRequirement(builder, "arm_raise_accuracy", "ratio", 0, 1, true);
            AppendMetricRequirement(builder, "duration_seconds", "seconds", 1, 3600, true);
            AppendMetricRequirement(builder, "difficulty_level", "level", 1, 3, false);
            builder.AppendLine("  ],");
            builder.AppendLine("  \"artifacts\": [");
            for (int index = 0; index < artifacts.Count; index += 1)
            {
                Artifact artifact = artifacts[index];
                builder.AppendLine("    {");
                AppendJsonLine(builder, 3, "path", artifact.path, true);
                AppendJsonLine(builder, 3, "url", BuildVersionedUrl(artifact), true);
                AppendJsonLine(builder, 3, "sha256", artifact.sha256, true);
                AppendNumberLine(builder, 3, "sizeBytes", artifact.sizeBytes, false);
                builder.Append("    }");
                builder.AppendLine(index == artifacts.Count - 1 ? string.Empty : ",");
            }
            builder.AppendLine("  ]");
            builder.AppendLine("}");
            return builder.ToString();
        }

        private static string ResolveArtifactUrl(IReadOnlyList<Artifact> artifacts, string suffix)
        {
            foreach (Artifact artifact in artifacts)
            {
                if (artifact.path.EndsWith(suffix, StringComparison.Ordinal))
                {
                    return BuildVersionedUrl(artifact);
                }
            }

            throw new InvalidOperationException("Unity artifact is missing: " + suffix);
        }

        private static string BuildVersionedUrl(Artifact artifact)
        {
            return PublicUrlBase
                + "/"
                + artifact.path
                + "?hash="
                + artifact.sha256.Substring("sha256:".Length);
        }

        private static void AppendMetricRequirement(
            StringBuilder builder,
            string metricType,
            string unit,
            int min,
            int max,
            bool trailingComma)
        {
            builder.Append("    { \"metricType\": ");
            AppendJsonString(builder, metricType);
            builder.Append(", \"unit\": ");
            AppendJsonString(builder, unit);
            builder.Append(", \"min\": ");
            builder.Append(min);
            builder.Append(", \"max\": ");
            builder.Append(max);
            builder.Append(" }");
            builder.AppendLine(trailingComma ? "," : string.Empty);
        }

        private static void AppendJsonLine(
            StringBuilder builder,
            int indentLevel,
            string key,
            string value,
            bool trailingComma)
        {
            builder.Append(new string(' ', indentLevel * 2));
            AppendJsonString(builder, key);
            builder.Append(": ");
            AppendJsonString(builder, value);
            builder.AppendLine(trailingComma ? "," : string.Empty);
        }

        private static void AppendNumberLine(
            StringBuilder builder,
            int indentLevel,
            string key,
            long value,
            bool trailingComma)
        {
            builder.Append(new string(' ', indentLevel * 2));
            AppendJsonString(builder, key);
            builder.Append(": ");
            builder.Append(value);
            builder.AppendLine(trailingComma ? "," : string.Empty);
        }

        private static void AppendJsonString(StringBuilder builder, string value)
        {
            builder.Append('"');
            foreach (char character in value)
            {
                switch (character)
                {
                    case '\\':
                        builder.Append("\\\\");
                        break;
                    case '"':
                        builder.Append("\\\"");
                        break;
                    case '\n':
                        builder.Append("\\n");
                        break;
                    case '\r':
                        builder.Append("\\r");
                        break;
                    case '\t':
                        builder.Append("\\t");
                        break;
                    default:
                        builder.Append(character);
                        break;
                }
            }
            builder.Append('"');
        }

        private static string ToManifestPath(string outputDirectory, string filePath)
        {
            string relativePath = Path.GetRelativePath(outputDirectory, filePath);
            return relativePath.Replace(Path.DirectorySeparatorChar, '/');
        }

        private static string ComputeSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                byte[] bytes = sha256.ComputeHash(stream);
                var builder = new StringBuilder(bytes.Length * 2);
                foreach (byte value in bytes)
                {
                    builder.Append(value.ToString("x2"));
                }

                return builder.ToString();
            }
        }

        private sealed class Artifact
        {
            public string path;
            public long sizeBytes;
            public string sha256;
        }
    }
}
