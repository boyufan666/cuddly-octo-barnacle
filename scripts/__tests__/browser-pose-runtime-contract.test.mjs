import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("browser pose runtime uses only the prescribed plan-item duration", async () => {
  const [stageSource, surfaceSource] = await Promise.all([
    readFile(
      join(
        rootDir,
        "apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx",
      ),
      "utf8",
    ),
    readFile(
      join(
        rootDir,
        "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
      ),
      "utf8",
    ),
  ]);
  const browserPoseStage = sliceBetween(
    stageSource,
    'runtimeType === "browser_pose_canvas"',
    'runtimeType === "cognitive_web"',
  );

  assert.match(
    browserPoseStage,
    /durationMinutes=\{planItem\.durationMinutes\}/,
  );
  assert.match(surfaceSource, /durationMinutes:\s*number/);
  assert.match(
    surfaceSource,
    /requireBrowserPosePrescriptionDurationSeconds\(durationMinutes\)/,
  );
  const startGameSource = sliceBetween(
    surfaceSource,
    "async function startGame()",
    "function tickBrowserPoseGame",
  );
  assert.ok(
    startGameSource.indexOf("await createPoseTrainingRuntime") <
      startGameSource.indexOf("createInitialBrowserPoseStats"),
    "prescribed runtime must start after camera and pose preparation",
  );
  assert.match(surfaceSource, /hasBrowserPosePrescriptionDurationElapsed\(\{/);
  const tickSource = sliceBetween(
    surfaceSource,
    "function tickBrowserPoseGame",
    "function finishGame",
  );
  assert.ok(
    tickSource.indexOf("hasBrowserPosePrescriptionDurationElapsed") <
      tickSource.indexOf("} catch (error)"),
    "prescription timer failures must use the visible runtime error path",
  );
  assert.doesNotMatch(surfaceSource, /game\.defaultDuration/);
});

test("camera consent and one selected device guard every browser pose camera path", async () => {
  const [
    permissionSource,
    roleDataSource,
    orchestrationSource,
    poseSource,
    surfaceSource,
    metadataSource,
  ] = await Promise.all([
    readFile(
      join(
        rootDir,
        "apps/web/src/features/patient/DevicePermissionCenterPage.tsx",
      ),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/features/session/useRoleData.ts"),
      "utf8",
    ),
    readFile(
      join(
        rootDir,
        "apps/web/src/features/patient/patient-readiness-orchestration.ts",
      ),
      "utf8",
    ),
    readFile(join(rootDir, "apps/web/src/lib/pose-readiness.ts"), "utf8"),
    readFile(
      join(
        rootDir,
        "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
      ),
      "utf8",
    ),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-camera-metadata.ts"),
      "utf8",
    ),
  ]);

  const consentOwnerSource = sliceBetween(
    roleDataSource,
    "export function synchronizeRolePatientCameraConsent",
    "export async function settleOptionalRoleData",
  );
  assert.match(
    consentOwnerSource,
    /synchronizeBrowserPoseCameraConsent\([\s\S]*?summarizePatientConsents\(patient\)\.camera_capture/,
  );
  assert.match(
    roleDataSource,
    /synchronizeRolePatientCameraConsent\(\s*nextData\.patient,\s*resolveRoleDataCameraSelectionTransfer\(\s*context\.cameraSelectionTransfer,\s*requestEpoch,\s*patientId,?\s*\),?\s*\);\s*setData/,
  );
  assert.match(
    roleDataSource,
    /if \(transfer\.requestEpoch !== requestEpoch\)[\s\S]*?transfer\.patientId !== patientId[\s\S]*?transfer\.selection\.patientId !== patientId[\s\S]*?return \{ \.\.\.transfer\.selection \}/,
  );
  assert.match(
    roleDataSource,
    /const clearRoleData = useCallback\([\s\S]*?synchronizeRolePatientCameraConsent\(undefined\)/,
  );
  assert.doesNotMatch(
    permissionSource,
    /synchronizeBrowserPoseCameraConsent|useEffect/,
  );
  assert.match(
    permissionSource,
    /hasCameraConsent=\{Boolean\(cameraConsent\)\}/,
  );
  assert.match(
    permissionSource,
    /disabled=\{!hasCameraConsent \|\| isChecking\}/,
  );
  assert.match(orchestrationSource, /openBrowserPoseCamera\(/);
  assert.doesNotMatch(orchestrationSource, /getUserMedia\(/);
  assert.match(poseSource, /openBrowserPoseCamera\(\{/);
  assert.match(poseSource, /deviceId/);
  assert.doesNotMatch(poseSource, /getUserMedia\(/);
  assert.match(
    surfaceSource,
    /requireBrowserPoseCameraDeviceId\(\s*trainingSession\.deviceCode\s*\?\?\s*null\s*,?\s*\)/,
  );
  assert.match(
    metadataSource,
    /openBrowserPoseCamera\(\{\s*deviceId:\s*cameraDeviceId/,
  );
  assert.doesNotMatch(metadataSource, /getUserMedia\(/);
});

test("pose runtime verifies repository-local MediaPipe assets without CDN URLs", async () => {
  const [poseSource, assetSource] = await Promise.all([
    readFile(join(rootDir, "apps/web/src/lib/pose-readiness.ts"), "utf8"),
    readFile(
      join(rootDir, "apps/web/src/lib/browser-pose-runtime-assets.ts"),
      "utf8",
    ),
  ]);

  assert.match(poseSource, /await ensureBrowserPoseRuntimeAssets\(\)/);
  assert.match(
    poseSource,
    /FilesetResolver\.forVisionTasks\(browserPoseWasmBaseUrl\)/,
  );
  assert.match(poseSource, /modelAssetPath:\s*browserPoseModelUrl/);
  assert.doesNotMatch(poseSource, /https?:\/\//);
  assert.match(assetSource, /\/mediapipe\/tasks-vision\/wasm/);
  assert.match(assetSource, /\/mediapipe\/models\/pose_landmarker_lite\.task/);
  assert.match(assetSource, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(assetSource, /await digestSha256\(bytes\)/);
  assert.doesNotMatch(assetSource, /https?:\/\//);
});

test("browser pose changes real target parameters during runtime and saves only recorded events", async () => {
  const [surfaceSource, gameplaySource, resultSource, evidenceSource] =
    await Promise.all([
      readFile(
        join(
          rootDir,
          "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
        ),
        "utf8",
      ),
      readFile(
        join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
        "utf8",
      ),
      readFile(
        join(rootDir, "apps/web/src/lib/browser-pose-training-result.ts"),
        "utf8",
      ),
      readFile(
        join(rootDir, "apps/web/src/lib/dynamic-difficulty-evidence.ts"),
        "utf8",
      ),
    ]);

  assert.match(surfaceSource, /createBrowserPoseRuntimeDifficulty\(\{/);
  assert.match(surfaceSource, /maybeUpdateBrowserPoseRuntimeDifficulty\(/);
  assert.match(surfaceSource, /applyBrowserPoseDifficultyToTarget\(/);
  assert.match(
    surfaceSource,
    /runtimeDifficulty\.currentParameters\.targetIntervalMs/,
  );
  assert.match(surfaceSource, /minimumLandmarkVisibility/);
  assert.match(gameplaySource, /targetSizeScale/);
  assert.match(gameplaySource, /targetLifetimeMs/);
  assert.match(gameplaySource, /holdDurationScale/);
  assert.match(resultSource, /events:\s*stats\.difficultyAdjustmentEvents/);
  const evidenceBuildSource = sliceBetween(
    resultSource,
    "const dynamicDifficultyEvidence",
    "const durationSeconds",
  );
  assert.doesNotMatch(
    evidenceBuildSource,
    /averageReactionTimeMs|completionRate|motionAccuracy/,
  );
  assert.doesNotMatch(evidenceSource, /resolveBrowserPoseTriggerReason/);
});

test("browser pose keyboard, touch, video listeners, errors, and camera cleanup are explicit", async () => {
  const [surfaceSource, poseSource, permissionSource] = await Promise.all([
    readFile(
      join(
        rootDir,
        "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
      ),
      "utf8",
    ),
    readFile(join(rootDir, "apps/web/src/lib/pose-readiness.ts"), "utf8"),
    readFile(
      join(
        rootDir,
        "apps/web/src/features/patient/DevicePermissionCenterPage.tsx",
      ),
      "utf8",
    ),
  ]);

  assert.match(surfaceSource, /addEventListener\("keydown"/);
  assert.match(surfaceSource, /removeEventListener\("keydown"/);
  assert.match(surfaceSource, /event\.key === "Escape"/);
  const keyboardHandlerSource = sliceBetween(
    surfaceSource,
    "const handleKeyDown",
    'window.addEventListener("keydown"',
  );
  assert.match(keyboardHandlerSource, /preparationAbortRef\.current/);
  assert.match(surfaceSource, /aria-keyshortcuts="Escape"/);
  assert.match(surfaceSource, /touch-manipulation/);
  const finishSource = sliceBetween(
    surfaceSource,
    "function finishGame",
    "function stopGame",
  );
  assert.match(
    finishSource,
    /stopBrowserPoseRuntime\([\s\S]*?\);\s*try \{\s*buildBrowserPoseTrainingResultPayload/,
  );
  const motionStageErrorSource = sliceBetween(
    surfaceSource,
    "onError={() => {",
    "/>\n        ) : null}",
  );
  assert.match(motionStageErrorSource, /stopBrowserPoseRuntime\(/);
  assert.match(poseSource, /addEventListener\("loadedmetadata"/);
  assert.match(poseSource, /removeEventListener\("loadedmetadata"/);
  assert.match(poseSource, /addEventListener\("error"/);
  assert.match(poseSource, /removeEventListener\("error"/);
  assert.doesNotMatch(poseSource, /\.onloadedmetadata\s*=|\.onerror\s*=/);
  assert.match(poseSource, /video\.pause\(\)/);
  assert.match(poseSource, /video\.srcObject\s*=\s*null/);
  assert.match(permissionSource, /\{cameraCheckError\}/);
  assert.match(permissionSource, /\{poseError\}/);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
