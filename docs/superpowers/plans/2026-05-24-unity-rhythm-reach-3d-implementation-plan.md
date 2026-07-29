# Unity Rhythm Reach 3D Implementation Plan

> **Historical capability plan:** This file is not the current UI execution plan. Continue current UI/product closure from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`; use this document only as Unity source and WebGL bridge groundwork.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-developed Unity WebGL source project for `rhythm_reach_3d` that records real gameplay-derived rehabilitation metrics and submits them through the existing bridge protocol.

**Architecture:** The Unity source project lives under `unity/rhythm-reach-3d/`, separate from the Next.js and NestJS apps. Gameplay scripts are split by session state, target spawning, hit detection, metric accumulation, result building, and WebGL bridge submission. WebGL output is not committed until Unity Editor generates a real build.

**Tech Stack:** Unity 6000.0.75f1, C#, Unity WebGL `.jslib`, protocol `1.0.0`, existing `apps/web/public/unity/rehab-unity-bridge.js`.

---

## File Structure

- Modify `.gitignore` to exclude Unity generated folders and generated IDE files while allowing source project folders.
- Create `unity/rhythm-reach-3d/README.md` to document scope, build steps, and non-production editor input.
- Create `unity/rhythm-reach-3d/Packages/manifest.json` for Unity package dependencies.
- Create `unity/rhythm-reach-3d/ProjectSettings/ProjectVersion.txt` to pin the Unity editor version.
- Create `unity/rhythm-reach-3d/Assets/Rehab/Scripts/*.cs` for the runtime game logic.
- Create `unity/rhythm-reach-3d/Assets/Plugins/WebGL/RehabTrainingBridge.jslib` for Unity-to-web submission.
- Create `unity/rhythm-reach-3d/Assets/WebGLTemplates/RehabWebGL/index.html` to load `/unity/rehab-unity-bridge.js`.
- Create `unity/rhythm-reach-3d/BuildManifest.draft.json` as a non-release manifest template for the future real WebGL build.

## Task 1: Repository Hygiene And Plan Baseline

**Files:**
- Modify: `.gitignore`
- Create: `docs/superpowers/plans/2026-05-24-unity-rhythm-reach-3d-implementation-plan.md`

- [ ] **Step 1: Add Unity ignore rules**

Add Unity generated folders and IDE outputs to `.gitignore`, including `[Ll]ibrary/`, `[Tt]emp/`, `[Oo]bj/`, `[Bb]uild/`, `[Bb]uilds/`, `[Ll]ogs/`, `[Uu]ser[Ss]ettings/`, `*.csproj`, and `*.sln`.

- [ ] **Step 2: Verify ignored root Unity residue**

Run:

```bash
git status --short --ignored
```

Expected: root `Library/`, `Temp/`, and `UserSettings/` appear as ignored, while source files under `unity/rhythm-reach-3d/` remain trackable.

## Task 2: Unity Project Skeleton

**Files:**
- Create: `unity/rhythm-reach-3d/README.md`
- Create: `unity/rhythm-reach-3d/Packages/manifest.json`
- Create: `unity/rhythm-reach-3d/ProjectSettings/ProjectVersion.txt`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scenes/README.md`

- [ ] **Step 1: Create source project folders**

Create the Unity project folder under `unity/rhythm-reach-3d/` rather than the repository root.

- [ ] **Step 2: Pin Unity version**

Write `ProjectSettings/ProjectVersion.txt` with:

```text
m_EditorVersion: 6000.0.75f1
m_EditorVersionWithRevision: 6000.0.75f1
```

- [ ] **Step 3: Add minimal package manifest**

Write `Packages/manifest.json` with Unity registry packages required for a lightweight 3D WebGL project.

- [ ] **Step 4: Document source/build boundary**

State that the project contains Unity source only until a real WebGL build creates `.loader.js`, `.framework.js`, `.data`, and `.wasm`.

## Task 3: Gameplay Domain Scripts

**Files:**
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/RhythmTargetZone.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/RhythmTargetRecord.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/TrainingMetricRecord.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/MetricsAccumulator.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/DifficultyController.cs`

- [ ] **Step 1: Define target zones**

Create `RhythmTargetZone` enum values `Left`, `Right`, `High`, `Middle`, and `Low`.

- [ ] **Step 2: Define target records**

Create immutable-like serializable records for target spawn, hit time, target zone, hit accuracy, and miss state.

- [ ] **Step 3: Implement metric accumulator**

Accumulate only actual spawned targets, hits, misses, reaction times, and accuracy samples. Ending with no spawned targets must return an invalid result and reason, not a generated score.

- [ ] **Step 4: Implement explicit difficulty settings**

Expose easy, standard, and advanced difficulty settings with named values. Do not silently select a hidden default when config is missing in production mode.

## Task 4: Session, Spawning, And Hit Detection

**Files:**
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/GameSessionController.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/RhythmTargetSpawner.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/TargetHitDetector.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/PoseInputBridge.cs`

- [ ] **Step 1: Implement session lifecycle**

`GameSessionController` controls idle, countdown, running, completed, and blocked states.

- [ ] **Step 2: Implement target spawning**

`RhythmTargetSpawner` creates visible primitive targets using configured zones and spawn interval.

- [ ] **Step 3: Implement hit detection**

`TargetHitDetector` records hits from active targets and computes reaction time from spawn time to hit time.

- [ ] **Step 4: Keep editor input labelled development-only**

`PoseInputBridge` may expose mouse/keyboard hit input in Unity Editor, but the result builder must label it as development input and not claim camera-based production pose metrics.

## Task 5: Bridge Payload Builder And WebGL Submission

**Files:**
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/RehabRuntimeConfig.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/TrainingResultBuilder.cs`
- Create: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/RehabTrainingResultBridge.cs`
- Create: `unity/rhythm-reach-3d/Assets/Plugins/WebGL/RehabTrainingBridge.jslib`

- [ ] **Step 1: Define runtime config**

Define required config keys `sessionId`, `gameRunId`, `gameCode`, `gameVersion`, `deviceCode`, and `bridgeProtocolVersion`.

- [ ] **Step 2: Build protocol payload**

`TrainingResultBuilder` creates JSON with `sessionId`, `gameRunId`, `gameVersion`, `clientGeneratedAt`, `rawPayloadHash`, `score`, `completionRate`, `durationSeconds`, `reactionTimeMs`, `motionAccuracy`, `exerciseIntensity`, `metricsSummary`, and non-empty `motionMetrics`.

- [ ] **Step 3: Compute raw payload hash**

Compute a deterministic SHA-256 hash from the actual result body before bridge wrapping. Do not use a fixed hash value.

- [ ] **Step 4: Add WebGL interop**

`.jslib` exposes `Rehab_PostTrainingResult(jsonPtr)` and calls `window.RehabUnityBridge.postTrainingResultJson(json)`. Missing bridge must throw an error.

## Task 6: WebGL Template And Manifest Draft

**Files:**
- Create: `unity/rhythm-reach-3d/Assets/WebGLTemplates/RehabWebGL/index.html`
- Create: `unity/rhythm-reach-3d/BuildManifest.draft.json`

- [ ] **Step 1: Add WebGL template**

Template loads `/unity/rehab-unity-bridge.js`, checks `window.RehabTrainingRuntimeConfig`, and fails visibly when required runtime config is missing.

- [ ] **Step 2: Add non-release manifest draft**

Manifest draft uses `releaseStatus: "source_only_not_built"` and does not list fake WebGL build files.

## Task 7: Unity Load Verification

**Files:**
- Modify only if Unity Editor reports source project errors.

- [ ] **Step 1: Run Unity batchmode project load**

Run:

```bash
"/Volumes/UnityEditors/Hub/Editor/6000.0.75f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode \
  -nographics \
  -quit \
  -projectPath "/Users/thl/IdeaProjects/Rehabilitation platform/unity/rhythm-reach-3d" \
  -logFile "/Users/thl/IdeaProjects/Rehabilitation platform/unity-rhythm-reach-load.log"
```

Expected: Unity exits successfully or reports only project-generation warnings that do not block opening the project. Any C# compile error must be fixed before continuing.

- [ ] **Step 2: Check generated folders stay ignored**

Run:

```bash
git status --short --ignored
```

Expected: generated `Library/`, `Temp/`, `Logs/`, and `UserSettings/` folders under the Unity project are ignored.

## Task 8: Platform Verification

**Files:**
- No production file changes unless verification finds a real issue.

- [ ] **Step 1: Run repository checks**

Run:

```bash
pnpm lint
pnpm build
pnpm --filter @rehab-platform/api exec jest --runInBand
```

Expected: checks pass, or any pre-existing failure is documented with exact output.

- [ ] **Step 2: Review delivery boundary**

Confirm README and Unity docs do not claim a WebGL build exists before Unity generates real build files.
