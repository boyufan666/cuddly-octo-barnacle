# Unity Pose Training Usability Implementation Plan

> **Historical capability plan:** This file is not the current UI execution plan. Continue current UI/product closure from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`; use this document only as real camera/pose usability groundwork.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Unity WebGL body-sensing training usable in field testing by showing real camera/pose feedback and stabilizing real pose hit events without adding fallback scores.

**Architecture:** Keep MediaPipe PoseLandmarker as the browser-side pose engine. Move Unity pose hit selection, visual guidance state, and throttling into focused web lib helpers so they can be tested without a browser camera, then consume those helpers from the Unity training page. Unity still receives only real `camera_pose` reach events and training results still come from the Unity bridge.

**Tech Stack:** Next.js, React, TypeScript, MediaPipe Tasks Vision, Unity WebGL bridge, Node test runner.

---

### Task 1: Test and Extract Unity Pose Guidance Helpers

**Files:**
- Create: `apps/web/src/lib/unity-pose-guidance.ts`
- Create: `apps/web/src/lib/unity-pose-guidance.test.ts`
- Modify: `apps/web/src/app/page.tsx`

- [ ] Write tests for `buildUnityPoseGuidanceSnapshot` covering visible left/right wrists, low visibility, and missing pose.
- [ ] Run `pnpm --filter @rehab-platform/web exec node --test src/lib/unity-pose-guidance.test.ts` and confirm the module is missing.
- [ ] Implement `buildUnityPoseGuidanceSnapshot` with no fallback data: it should report `tracking`, `low_visibility`, or `no_pose`.
- [ ] Replace inline Unity wrist selection in `page.tsx` with the helper.

### Task 2: Test and Extract Stable Unity Reach Hit Builder

**Files:**
- Modify: `apps/web/src/lib/unity-pose-guidance.ts`
- Modify: `apps/web/src/lib/unity-pose-guidance.test.ts`
- Modify: `apps/web/src/app/page.tsx`

- [ ] Write tests for `createUnityPoseHitTracker` covering confidence threshold, minimum interval, hand stability, and coordinate mapping.
- [ ] Run the test and confirm it fails because the tracker does not exist.
- [ ] Implement the tracker so it only emits real `camera_pose` events after enough stable frames and never emits fixed/demo/manual data.
- [ ] Wire `startUnityPoseForwarding` to use the tracker and guidance state.

### Task 3: Add Field-Usable Unity Training Overlay

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [ ] Add a visible camera picture-in-picture panel above the Unity canvas.
- [ ] Add left/right wrist cursor dots, current instruction, confidence, and "move closer to target" status from real pose state.
- [ ] Add Playwright shell assertions for the new Unity guidance labels.
- [ ] Do not auto-fill score fields and do not submit training results from the overlay.

### Task 4: Tune Unity New-User Difficulty

**Files:**
- Modify: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/TargetHitDetector.cs`
- Modify: `unity/rhythm-reach-3d/Assets/Rehab/Scripts/DifficultyController.cs`

- [ ] Increase hit tolerance and target lifetime for `easy`/`standard` so first field tests are achievable.
- [ ] Keep all inputs real: WebGL builds still accept only host `camera_pose` reach events.
- [ ] Run Unity source verifier after changes.

### Task 5: Verify

**Files:**
- No new files.

- [ ] Run targeted web unit tests.
- [ ] Run `pnpm test:delivery`.
- [ ] Run `pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false`.
- [ ] Run `pnpm --filter @rehab-platform/web lint`.
- [ ] Run `pnpm --filter @rehab-platform/web build`.
- [ ] Run `pnpm test:playwright`.
- [ ] Re-open Edge and verify real camera permission, pose guidance, and training result flow.
