# Rhythm Reach 3D Unity Source

This directory is a real Unity source project skeleton for `rhythm_reach_3d`.

Unity version is pinned to `6000.0.75f1` in `ProjectSettings/ProjectVersion.txt`.

## Build Status

This source project can now produce a formal WebGL build through the Unity
Editor build entrypoint:

```bash
"/Volumes/UnityEditors/Hub/Editor/6000.0.75f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode \
  -nographics \
  -quit \
  -projectPath "/Users/thl/IdeaProjects/Rehabilitation platform/unity/rhythm-reach-3d" \
  -executeMethod Rehab.EditorTools.RhythmReachWebGlBuilder.BuildFormalWebGl \
  -logFile "/Users/thl/IdeaProjects/Rehabilitation platform/unity-rhythm-reach-webgl-build.log"
```

The default output directory is:

```text
apps/web/public/unity/rhythm_reach_3d/0.1.2/
```

It must not be described as browser-runnable until Unity has produced the real WebGL output files:

- `.loader.js`
- `.framework.js`
- `.data`
- `.wasm`

The draft build manifest records the source-only status. The formal build
entrypoint writes a separate runtime `manifest.json` beside the generated
WebGL artifacts and records SHA-256 hashes for those real files.

## Scope

This source tree is intended to hold the Unity project files, runtime bridge integration, scenes, scripts, and build configuration needed for Rhythm Reach 3D rehabilitation training.

## Scene And Runtime Wiring

The default training scene is:

```text
Assets/Rehab/Scenes/RhythmReachTraining.unity
```

The scene contains the session object named `RhythmReachSession`. The host
WebGL runtime config must bind the backend session and collection batch, use
the fixed result contract, include the manifest-declared dispatch methods, and
carry the clinician-approved starting level:

```json
{
  "resultContractVersion": "rehab-unity-result-v2",
  "sessionId": "real-training-session-id",
  "clientStartedAt": "2026-05-20T06:15:00.000Z",
  "collectionBatchId": "real-collection-batch-id",
  "gameRunId": "real-game-run-id",
  "gameCode": "rhythm_reach_3d",
  "gameVersion": "0.1.2",
  "deviceCode": "real-device-code",
  "bridgeProtocolVersion": "1.0.0",
  "unitySessionObjectName": "RhythmReachSession",
  "runtimeConfigMethod": "SetRuntimeConfigJson",
  "startMethod": "StartConfiguredSession",
  "reachHitMethod": "ReceiveWebGlReachHit",
  "difficultyMethod": "SetExplicitDifficulty",
  "explicitDifficulty": "standard",
  "approvedPlanItemId": "real-approved-plan-item-id",
  "assessmentSourceId": "real-approved-assessment-id",
  "startingLevelSource": "clinician_approved_plan",
  "startingDifficultyLevel": 2,
  "durationSeconds": 900,
  "minConfidence": 0.8
}
```

`resultContractVersion` is fixed. `collectionBatchId` and `clientStartedAt`
come from the started training session, and `durationSeconds` is the approved
plan duration in seconds and must be greater than zero. `explicitDifficulty` is derived from
`startingDifficultyLevel`; it is not an independent setting. `minConfidence`
is the frozen Unity collection-protocol quality threshold and must be greater
than zero and at most one. The strict mapping is `1 -> easy`, `2 -> standard`, and `3 -> advanced`.

The WebGL template injects this config into Unity with `SetRuntimeConfigJson`. The host page may then call:

```javascript
window.RehabRhythmReachUnity.startConfiguredSession();
window.RehabRhythmReachUnity.receiveWebGlReachHit({
  x: 0,
  y: 0,
  z: 4,
  confidence: 1,
});
```

Missing config fields, invalid protocol version, missing bridge, invalid metrics, or no valid training samples block the session instead of producing a synthetic result.
