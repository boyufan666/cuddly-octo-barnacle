# DOCX Delivery Closure And Global UI Optimization Implementation Plan

> Superseded for UI execution by `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. Keep this document as the formal delivery capability record; do not use its technical UI surfaces as the target product experience.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the software-side requirements from `客户提供/康复平台设计(1).docx` and rebuild the Web experience into a formal role/task product flow, with AI, STT, TTS, browser pose games, Unity, data collection, clinician review, family view, privacy, audit, export, and regression evidence connected end-to-end.

**Architecture:** Keep the existing Next.js + NestJS + Prisma architecture, but stop treating `apps/web/src/app/page.tsx` as the product boundary. First add failing boundary tests, then split role-specific UI into patient/doctor/admin/caregiver feature modules, preserve strict backend gates, and verify every DOCX requirement through API tests, Node delivery tests, Playwright, and acceptance scripts. Wearables and production deployment remain explicit customer-input gates, not implementation work in this batch.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, NestJS, Prisma/PostgreSQL, Redis, MediaPipe Tasks Vision, Phaser, Unity WebGL, Xiaomi MiMo AI/STT/TTS provider paths, node:test, Jest, Playwright.

---

## Non-Negotiable Boundaries

- Do not add fallback, mock, demo, browser-local, fixed-score, generated-evidence, or silent downgrade behavior.
- If AI/STT/TTS/Unity/browser pose/collection/export/audit prerequisites are missing, the flow must block with a clear reason and write the appropriate failure evidence only where the existing API contract already requires it.
- Do not commit raw API keys. Runtime keys may be used only through ignored local `.env` during local testing; production docs and checks must keep `secret-manager://...` references.
- Do not make production deployment or wearable-device integration appear complete. They remain gated by customer-provided server/domain/HTTPS/database/Redis/backup/monitoring and device model/protocol/API/metric-range details.
- Patient and caregiver UI must not expose internal wording such as `engine:`, `license:`, `sensing:`, `MediaPipe`, `Phaser`, `manifest`, `bridge`, `audit ID`, raw evidence JSON, raw provider payloads, or data-export governance terms.
- Do not introduce display fallback copy. If a patient-visible label, tag, or status cannot be derived from approved business data, hide that nonessential display area or show a blocking reason tied to the formal gate.
- Public social-square behavior is not treated as complete in this batch. The current implementation target is privacy-safe family/care-circle interaction; a wider social square requires customer confirmation, moderation rules, consent wording, privacy review, and operational ownership.

## Customer DOCX Coverage Map

| DOCX requirement | Target closure in this plan | Primary verification |
| --- | --- | --- |
| 用户注册/登录 | Login plus institution-reviewed account opening requests for patient/caregiver/doctor/admin | API Jest, Playwright login and registration request checks |
| 个人信息管理 | Patient profile, consent, caregiver binding, accessible patient "我的" page | Playwright patient/caregiver navigation |
| 指标数据录入与查看 | Assessment metrics, AD-8/MMSE/CDR, training metrics, collection batches | API Jest, `verify:formal-acceptance-chain`, `verify:multi-condition-data-capture` |
| AI 对话入口/AI 分析展示 | Xiaomi-backed AI assessment draft, STT transcript, TTS prompts, multi-turn AI dialogue, clinician review | `verify:ai-assessment-acceptance`, `verify:speech-ai-assessment-acceptance`, `verify:tts-speech-output-acceptance` |
| Unity 小游戏入口 | Formal Unity WebGL runtime entry with bridge result submission, dynamic difficulty evidence, and field evidence | `verify:unity-rhythm-reach-webgl-build`, `verify:unity-field-acceptance` |
| 游戏记录与结果查看 | Patient training result, clinician review, family summary, audit trail | Playwright, API Jest, `verify:formal-acceptance-chain` |
| 管理后台 | Account review, user/metric/AI/game/content/audit/export governance | Node boundary tests, Playwright admin checks |
| AI 能力模块 | Xiaomi MiMo text, audio-understanding STT, MiMo TTS with strict config | API unit tests and field acceptance scripts |
| 游戏内实时数据采集 | Camera pose, wrist trajectory, reaction, accuracy, motion intensity, dynamic difficulty, capture conditions; wearable physiology stays customer-gated | Browser pose tests, Unity bridge tests, multi-condition acceptance |
| 安全与隐私 | Encryption envelope, RBAC, consent, desensitized export, audit logs | sensitive encryption tests, delivery checks, export Playwright |
| 社交模块/家属端 | Family care summary, precautions, care circle, progress visibility | care-circle privacy tests, caregiver Playwright checks |
| 社交广场 | Customer-confirmed public social scope only; not counted complete by private care circle alone | coverage boundary and privacy tests |

## Target Information Architecture

Patient experience:

- `今日`: one main task decision, no technical tags, one primary CTA.
- `训练`: ordered preparation checklist, then runtime page, then result confirmation.
- `记录`: progress, completed training, rewards, friendly feedback.
- `我的`: profile, consent, caregiver binding, permissions.

Doctor experience:

- `患者队列`: assigned patient list and risk/abnormal indicators.
- `计划管理`: AI recommendation review, manual adjustment, weekly plan issuance.
- `评估复核`: MMSE/CDR/AD-8/STT/AI evidence summary and final clinical approval.
- `训练复核`: abnormal/low-quality training review and patient progress.

Admin/operator experience:

- `运营控制台`: account approval, content governance, game library status, statistics.
- `安全审计`: desensitized export, audit filtering, sensitive-data checks.
- `配置治理`: AI/STT/TTS/Unity/browser pose readiness visibility, operation configuration, statistics query, without exposing secrets.

Caregiver experience:

- `照护`: authorized patient summary and next action.
- `进展`: desensitized progress trends.
- `提醒`: doctor precautions.
- `我的`: binding and visible-scope explanation.

---

## Task 1: Freeze DOCX Coverage And Delivery Gates

**Files:**
- Create: `docs/customer-docx-coverage-matrix.md`
- Modify: `docs/customer-acceptance-criteria.md`
- Modify: `docs/delivery-boundary-and-readiness.md`
- Add: `scripts/__tests__/customer-docx-coverage-boundary.test.mjs`

- [x] **Step 1: Write the failing coverage boundary test**

Add a test that requires every DOCX module to have a requirement ID, implementation target, verification command, and delivery boundary.

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("customer DOCX coverage matrix lists every formal delivery module", async () => {
  const source = await readFile(
    join(rootDir, "docs/customer-docx-coverage-matrix.md"),
    "utf8",
  );
  for (const id of [
    "DOCX-USER-LOGIN",
    "DOCX-PATIENT-PROFILE",
    "DOCX-METRIC-DATA",
    "DOCX-AI-DIALOGUE",
    "DOCX-AI-RESULT",
    "DOCX-UNITY-GAME",
    "DOCX-GAME-RESULT",
    "DOCX-ADMIN-USERS",
    "DOCX-ADMIN-METRICS",
    "DOCX-ADMIN-AI",
    "DOCX-ADMIN-GAMES",
    "DOCX-AI-STT-TTS",
    "DOCX-PLAN-MATCHING",
    "DOCX-REALTIME-CAPTURE",
    "DOCX-PRIVACY-AUDIT",
    "DOCX-FAMILY-SOCIAL",
  ]) {
    assert.match(source, new RegExp(`\\\\| ${id} \\\\|`), `missing ${id}`);
  }
  assert.match(source, /No fallback allowed/);
  assert.match(source, /Wearable device integration is customer-gated/);
  assert.match(source, /Production deployment is customer-gated/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/__tests__/customer-docx-coverage-boundary.test.mjs`

Expected: FAIL because `docs/customer-docx-coverage-matrix.md` does not exist yet.

- [x] **Step 3: Create the coverage matrix**

Create `docs/customer-docx-coverage-matrix.md` with one table row per `DOCX-*` ID. Each row must include:

- customer wording from `康复平台设计(1).docx`
- current implementation target
- required test or acceptance command
- delivery status: `done`, `needs-ui-closure`, `needs-functional-closure`, or `customer-gated`
- explicit boundary note

- [x] **Step 4: Update acceptance docs**

Update `docs/customer-acceptance-criteria.md` and `docs/delivery-boundary-and-readiness.md` to reference the new matrix as the top-level requirement map.

- [x] **Step 5: Verify**

Run:

```bash
node --test scripts/__tests__/customer-docx-coverage-boundary.test.mjs
pnpm test:delivery
```

Expected: new coverage test passes; existing delivery tests remain green.

---

## Task 2: Add UI Architecture Boundary Tests Before Refactor

**Files:**
- Add: `scripts/__tests__/global-ui-component-boundary.test.mjs`
- Add: `scripts/__tests__/patient-training-flow-ia.test.mjs`
- Add: `scripts/__tests__/doctor-workbench-ia.test.mjs`
- Add: `scripts/__tests__/admin-governance-ia.test.mjs`
- Modify: `scripts/__tests__/patient-training-task-library.test.mjs`
- Modify: `scripts/__tests__/training-capture-layout.test.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [x] **Step 1: Add global component boundary test**

The test should fail while `page.tsx` still owns all major role screens and shared UI primitives.

```js
test("role UI is split into feature modules instead of one page file", async () => {
  const pageSource = await readFile(join(rootDir, "apps/web/src/app/page.tsx"), "utf8");
  assert.doesNotMatch(pageSource, /function TodayScreen/);
  assert.doesNotMatch(pageSource, /function PrepScreen/);
  assert.doesNotMatch(pageSource, /function GameScreen/);
  assert.doesNotMatch(pageSource, /function GlassCard/);
  assert.doesNotMatch(pageSource, /function PrimaryButton/);

  for (const path of [
    "apps/web/src/features/patient/TodayTrainingPage.tsx",
    "apps/web/src/features/patient/TrainingPrepChecklist.tsx",
    "apps/web/src/features/patient/TrainingRuntimePage.tsx",
    "apps/web/src/features/doctor/DoctorWorkspacePage.tsx",
    "apps/web/src/features/admin/AdminOverviewPage.tsx",
    "apps/web/src/components/ui/Button.tsx",
    "apps/web/src/components/ui/Card.tsx",
  ]) {
    await readFile(join(rootDir, path), "utf8");
  }
});
```

- [x] **Step 2: Add patient IA test**

Require a task-first patient experience and forbid technical training tags.

```js
test("patient training flow is task-first and hides game engine metadata", async () => {
  const patientSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  assert.match(patientSource, /今日主任务/);
  assert.match(patientSource, /选择训练/);
  assert.doesNotMatch(patientSource, /今日训练已完成.*disabled/);
  assert.doesNotMatch(patientSource, /engine:|license:|sensing:|mediapipe|phaser_canvas|MIT/i);
});
```

- [x] **Step 3: Add doctor/admin IA tests**

Doctor test must require patient queue, clinical summary, assessment review, plan editor, and training review queue. Admin test must require account approval, content governance, desensitized export, and audit log areas, and must forbid using the patient training runtime as an admin primary action.

- [x] **Step 4: Update existing patient visible-term tests**

Extend `scripts/__tests__/patient-training-task-library.test.mjs` forbidden text from `Phaser|Canvas|runtimeType|manifest|seed|mock|demo` to:

```js
/\b(Phaser|Canvas|runtimeType|manifest|seed|mock|demo|MediaPipe|MIT)\b|engine:|license:|sensing:|mediapipe|phaser_canvas/i
```

- [x] **Step 5: Update Playwright regression expectations**

Add assertions for:

- mobile and desktop patient CTA not covered by bottom navigation
- tab order: task card -> prep checklist -> start training -> finish training
- no horizontal overflow
- no technical copy in patient/caregiver role flows
- mobile projects: add at least one Pixel-sized and one iPhone-sized viewport in `scripts/playwright-regression.config.mjs` in addition to existing desktop projects
- bottom safe-area: patient/caregiver layouts reserve bottom padding equal to bottom nav height plus `env(safe-area-inset-bottom)` or an equivalent measured CSS token
- scroll coverage: run no-overlap and no-overflow checks at top, middle, and bottom scroll positions
- all-role navigation smoke: doctor `患者队列/计划管理/评估复核/训练复核`, admin `运营控制台/安全审计/配置治理`, caregiver `照护/进展/提醒/我的`

- [x] **Step 6: Verify red**

Run:

```bash
node --test \
  scripts/__tests__/global-ui-component-boundary.test.mjs \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs
```

Expected: new architecture tests fail until refactor tasks land.

- [x] **Step 7: Fix Task 2 test design issues from review before marking complete**

Before Task 2 can be marked complete, adjust the tests so they fail only on real future work and not on obsolete `page.tsx` slice assumptions:

- replace `function TodayScreen`/`function PrepScreen` slice-only assertions with feature-module assertions that still pass after the refactor
- keep shared primitive tests focused on required role-neutral behavior and avoid over-locking exact TypeScript union formatting
- add mobile Playwright projects and confirm `pnpm exec playwright test --config scripts/playwright-regression.config.mjs --list` lists both desktop and mobile projects
- implement keyboard-only Tab assertions with real `page.keyboard.press("Tab")` navigation from task card to prep checklist to start CTA to finish CTA
- sweep patient and caregiver tabs for forbidden technical copy: `engine:|license:|sensing:|MediaPipe|Phaser|manifest|bridge|audit ID|raw evidence|provider payload|资源清单|证据链|审计|导出治理`

Run:

```bash
node --check scripts/web-playwright-regression.spec.mjs
pnpm exec playwright test --config scripts/playwright-regression.config.mjs --list
git diff --check
```

Expected: Playwright spec loads, mobile and desktop projects are listed, and whitespace checks pass. The UI architecture tests may still be red until Task 3/4/8 land.

---

## Task 3: Split Shared UI Primitives And Layouts

**Files:**
- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/Card.tsx`
- Create: `apps/web/src/components/ui/StatusBadge.tsx`
- Create: `apps/web/src/components/ui/MetricTile.tsx`
- Create: `apps/web/src/components/layout/AppShell.tsx`
- Create: `apps/web/src/components/layout/PatientTaskLayout.tsx`
- Create: `apps/web/src/components/layout/WorkbenchLayout.tsx`
- Create: `apps/web/src/components/layout/GovernanceLayout.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [x] **Step 1: Implement shared primitives without behavior changes**

Move visual-only primitives out of `page.tsx`. Keep props explicit:

- `Button`: `intent="primary" | "secondary" | "danger" | "quiet"`, `isLoading`, `disabled`, `children`
- `Card`: `tone="patient" | "workbench" | "governance" | "plain"`
- `StatusBadge`: `status="ready" | "pending" | "blocked" | "complete" | "review"`
- `MetricTile`: label/value/helper without backend jargon

Do not change API calls, readiness checks, or state transitions in this step.

- [x] **Step 2: Add role-specific layouts**

Create:

- `PatientTaskLayout`: light shell, top identity strip, one content canvas, bottom navigation
- `WorkbenchLayout`: doctor workbench with queue/detail structure
- `GovernanceLayout`: admin/operator governance with dense panels and filters

- [x] **Step 3: Replace `GlassCard`, `PrimaryButton`, and `ScreenGrid` imports in `page.tsx`**

Keep temporary aliases only inside the same commit if required for incremental compilation. Remove final `function GlassCard`, `function PrimaryButton`, and patient usage of `ScreenGrid`.

- [x] **Step 4: Verify component boundary**

Run:

```bash
node --test scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: boundary test passes; lint passes.

---

## Task 4: Rebuild Patient Today/Prep/Game Flow

**Files:**
- Create: `apps/web/src/features/patient/patient-training-copy.ts`
- Create: `apps/web/src/features/patient/PatientHomeNav.tsx`
- Create: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Create: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Create: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Create: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Create: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `scripts/__tests__/patient-training-task-library.test.mjs`
- Modify: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Modify: `scripts/__tests__/training-capture-layout.test.mjs`

- [x] **Step 1: Implement patient-safe copy helper**

Add `patientTrainingTagsLabel(values: string[])` that filters internal tags and maps only patient-friendly rehabilitation concepts. If no patient-visible tags remain, return an empty array/string and do not render the optional tag area. Do not introduce default/fallback patient labels without explicit product confirmation.

```ts
const hiddenPatientTagPatterns = [
  /^engine:/i,
  /^license:/i,
  /^sensing:/i,
  /^runtime:/i,
  /mediapipe/i,
  /phaser/i,
  /unity_webgl/i,
];
```

This is display filtering only; it must not change training content selection, game runtime selection, or backend validation.

- [x] **Step 2: Redesign `TodayTrainingPage`**

Use a `Care Path` layout:

- top: `本日任务` with patient name and readiness summary
- primary focus card: selected or next recommended task
- compact task picker: rows no taller than `min-h-20`
- single CTA: `开始训练准备`
- secondary reward/progress area below, not competing with CTA

The CTA states must be distinct:

- no active plan: `等待医生下发训练安排`
- no selected task: `请先选择今日训练`
- all complete: `查看今日训练记录`
- ready: `开始训练准备`

Hard acceptance rules:

- exactly one primary CTA is visible in the viewport
- reward/progress content appears after the main task CTA
- task picker rows remain compact and do not render as multiple large cards competing with the primary task
- patient technical terms remain hidden across `我的`, `今日`, `训练`, and `记录`

- [x] **Step 3: Redesign `TrainingPrepChecklist`**

Use exactly three ordered steps:

1. `训练安排`
2. `摄像头`
3. `动作识别`

Each step has one status and one recovery instruction. Keep the existing strict `resolveTrainingStartReadiness` gate and existing `handleCreateCollectionBatchForSelectedTask` behavior. Do not create any automatic fallback batch.

- [x] **Step 4: Redesign `TrainingRuntimePage`**

Use:

- main stage: Unity/browser pose/Phaser runtime
- side monitor: small patient-friendly camera guidance
- bottom action bar: `完成本次训练` or blocked reason
- result review sheet after completion, not an always-visible backend-style form

Keep formal result validation and source checks unchanged.

- [x] **Step 4a: Add runtime guidance without panel overlap**

The runtime page must keep the game stage, camera monitor, and bottom action bar in stable layout regions:

- the game stage owns the largest visual area
- camera monitor is patient-friendly and does not cover the game target area
- bottom action bar remains reachable after scrolling on mobile and desktop
- `patient-training-primary-action` and bottom nav bounding boxes must never overlap
- no result form fields are permanently visible before the runtime emits a complete formal result event

- [x] **Step 5: Verify patient flow tests**

Run:

```bash
node --test \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs \
  scripts/__tests__/patient-training-flow-ia.test.mjs
```

Expected: all patient UI boundary tests pass.

---

## Task 5: Close AI, STT, TTS, MMSE, And AD-8 Assessment Flow

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/ai-assessment-draft.ts`
- Modify: `apps/web/src/lib/assessment-speech-transcript.ts`
- Modify: `apps/web/src/lib/tts-speech-output.ts`
- Create: `apps/web/src/features/patient/AssessmentDialoguePage.tsx`
- Create: `apps/web/src/features/doctor/AssessmentReviewPanel.tsx`
- Modify: `scripts/__tests__/speech-ai-assessment-ui.test.mjs`
- Modify: `scripts/__tests__/ai-conversation-ui.test.mjs`
- Modify: `scripts/__tests__/ad8-caregiver-interview-acceptance.test.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [x] **Step 1: Verify strict provider tests are present**

Ensure tests cover:

- `AI_REQUIRED_FOR_LAUNCH=true` is required for formal AI draft generation
- `SPEECH_REQUIRED_FOR_LAUNCH=true` is required for STT
- `TTS_REQUIRED_FOR_LAUNCH=true` is required for TTS
- Xiaomi MiMo provider response must include required structured fields
- missing runtime key fails clearly
- browser speech synthesis is never used as fallback
- AI draft cannot write a formal assessment until clinician approval

- [x] **Step 2: Add multi-turn AI dialogue boundary if missing**

If `AiConversationSession` and `AiConversationMessage` are incomplete, finish them with:

- patient ID
- assessment type: `MMSE`, `CDR`, `AD8`, or combined
- turn index
- provider evidence metadata
- consent snapshot
- status: `active`, `completed`, `pending_human_review`, `reviewed`

No raw request body, raw response body, raw audio base64, or full transcript should appear in audit metadata.

- [x] **Step 3: Build patient assessment dialogue UI**

Patient UI must show:

- simple question prompt
- optional physical-condition choices from the DOCX intent, such as `我需要使用轮椅` and `我上肢活动不便`
- voice input action that calls platform STT API
- TTS prompt playback action that calls platform TTS API
- AI generated draft shown as `待医生确认`

No local browser speech fallback or fixed transcript is allowed.

- [x] **Step 4: Build doctor assessment review UI**

Doctor UI must show:

- MMSE/CDR/AD-8 structured scores
- AI evidence summary: provider, model, call ID, prompt version, calledAt
- STT evidence summary if voice was used
- TTS evidence summary if playback was used
- approve/reject/edit before formal assessment write

- [x] **Step 5: Verify assessment closure**

Run:

```bash
pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts
node --test \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/ai-conversation-ui.test.mjs \
  scripts/__tests__/ad8-caregiver-interview-acceptance.test.mjs
pnpm verify:ai-assessment-acceptance -- docs/templates/ai-assessment-acceptance-config.template.json
pnpm verify:speech-ai-assessment-acceptance -- docs/templates/speech-ai-assessment-acceptance-config.template.json
```

Expected: unit/source tests pass. Acceptance commands require a filled real config; template execution should fail only because template placeholders are not real evidence.

---

## Task 6: Expand Formal Game Library Without Locking To One Runtime

**Files:**
- Modify: `packages/db/prisma/seed.ts`
- Modify: `apps/web/src/lib/browser-pose-game-library.ts`
- Modify: `apps/web/src/lib/browser-pose-gameplay-rules.ts`
- Modify: `apps/web/src/lib/browser-pose-training-result.ts`
- Modify: `apps/web/src/lib/unity-runtime-bridge.ts`
- Modify: `apps/web/src/lib/unity-training-bridge.ts`
- Create: `apps/web/src/features/patient/GameLibraryPage.tsx`
- Create: `apps/web/src/features/admin/TrainingContentGovernance.tsx`
- Modify: `scripts/__tests__/browser-pose-game-library-seed.test.mjs`
- Modify: `scripts/__tests__/browser-pose-gameplay-differentiation.test.mjs`
- Modify: `scripts/__tests__/phaser-pose-stage.test.mjs`
- Modify: `scripts/__tests__/unity-rhythm-reach-source.test.mjs`
- Modify: `scripts/__tests__/unity-rhythm-reach-webgl-build.test.mjs`

- [x] **Step 1: Define formal runtime categories**

Use runtime categories as internal metadata only:

- `unity_webgl` for Unity WebGL builds
- `browser_pose_canvas` for MediaPipe + Canvas/Phaser browser games
- `cognitive_web` for non-pose cognitive games

Patient-facing UI must show rehabilitation purposes, not runtime names.

- [x] **Step 2: Add at least three deliverable game definitions**

Seed or content governance should include:

- `rhythm_reach_3d`: Unity WebGL upper-limb/reaction training
- `garden_reach`: browser pose reaching and attention training
- `memory_path`: cognitive memory/sequence game

Each content item must include:

- targets
- duration
- difficulty policy
- dynamic difficulty triggers based on prior assessment score, recent runtime performance, and safety limits
- required permissions
- result schema
- published status
- license/source notes visible only in admin governance

- [x] **Step 3: Implement runtime selection without fallback**

If selected game runtime assets are missing, show `训练内容未准备好，请联系工作人员` and block start. Do not silently launch another game.

- [x] **Step 4: Implement dynamic difficulty evidence**

Add runtime-agnostic dynamic difficulty evidence so Unity and browser games can both report:

- starting level derived from clinician-approved assessment/plan data
- trigger reason: `prior_assessment`, `reaction_slow`, `accuracy_high`, `accuracy_low`, `fatigue_risk`, or `clinician_limit`
- before/after speed or complexity level
- timestamp and runtime frame/window ID
- safety clamp reason when the level is not changed

The game may adjust speed/complexity only from verified runtime performance and clinician-approved plan constraints. If the runtime cannot emit difficulty events, the content item cannot claim real-time difficulty adjustment.

- [x] **Step 5: Verify game library**

Run:

```bash
node --test \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/browser-pose-gameplay-differentiation.test.mjs \
  scripts/__tests__/phaser-pose-stage.test.mjs \
  scripts/__tests__/browser-pose-training-result.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/unity-rhythm-reach-source.test.mjs \
  scripts/__tests__/unity-rhythm-reach-webgl-build.test.mjs
pnpm verify:unity-rhythm-reach-webgl-build
```

Expected: game definitions are distinct, patient copy hides runtime metadata, dynamic difficulty evidence is enforced, and Unity build checks pass when the real build exists.

---

## Task 7: Complete Multi-Condition Data Collection Closure

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/features/doctor/DataCollectionReviewPanel.tsx`
- Create: `apps/web/src/features/admin/CollectionConditionGovernance.tsx`
- Modify: `scripts/__tests__/collection-condition-schema.test.mjs`
- Modify: `scripts/__tests__/collection-condition-ui.test.mjs`
- Modify: `scripts/__tests__/multi-condition-data-capture.test.mjs`
- Modify: `docs/collection-condition-data-capture-runbook.md`

- [x] **Step 1: Verify collection batches are formal prerequisites**

Tests must prove training start requires a ready formal collection batch tied to:

- patient
- plan item
- game content
- condition label
- camera/device metadata
- consent snapshot

No auto-created fallback batch may be used when the batch is absent.

- [x] **Step 2: Add doctor/admin review surfaces**

Doctor sees collection condition summaries and training quality. Admin sees condition configuration/governance. Patient sees only friendly readiness and instructions.

- [x] **Step 3: Ensure metrics match DOCX data collection needs**

Training result payload must include:

- action trajectory summary
- reaction time
- action accuracy
- completion rate
- motion intensity
- dynamic difficulty events and safety clamp reason
- duration
- quality flag
- abnormal flag
- runtime evidence metadata

Physiological metrics boundary:

- do not generate, infer, or reuse physiological metrics without customer-provided wearable model, SDK/API/protocol, sampling rules, threshold ranges, consent scope, and field evidence
- when no wearable evidence exists, mark physiological metrics as `customer-gated` or block the formal claim; do not display them as collected
- motion intensity from camera/game runtime may be recorded separately, but it must not be renamed as physiological data

- [x] **Step 4: Verify multi-condition closure**

Run:

```bash
node --test \
  scripts/__tests__/collection-condition-schema.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/multi-condition-data-capture.test.mjs
pnpm verify:multi-condition-data-capture -- docs/templates/multi-condition-data-capture.template.json
```

Expected: source tests pass. Acceptance command requires a filled real evidence file and must reject the template placeholders.

---

## Task 8: Rebuild Doctor, Admin, And Caregiver Workflows

**Files:**
- Create: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Create: `apps/web/src/features/doctor/PatientQueue.tsx`
- Create: `apps/web/src/features/doctor/PatientClinicalSummary.tsx`
- Create: `apps/web/src/features/doctor/PlanEditor.tsx`
- Create: `apps/web/src/features/doctor/TrainingReviewQueue.tsx`
- Create: `apps/web/src/features/admin/AdminOverviewPage.tsx`
- Create: `apps/web/src/features/admin/AccountReviewPanel.tsx`
- Create: `apps/web/src/features/admin/OperationConfigPanel.tsx`
- Create: `apps/web/src/features/admin/StatisticsQueryPanel.tsx`
- Create: `apps/web/src/features/admin/SecurityAuditPage.tsx`
- Create: `apps/web/src/features/admin/DesensitizedExportPanel.tsx`
- Create: `apps/web/src/features/caregiver/CaregiverCareCenter.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `scripts/__tests__/doctor-workbench-ia.test.mjs`
- Modify: `scripts/__tests__/admin-governance-ia.test.mjs`
- Modify: `scripts/__tests__/care-circle-privacy.test.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [x] **Step 1: Doctor workflow**

Create a main/detail workbench:

- queue on the left
- selected patient clinical summary
- assessment review
- plan editor
- training result review queue

Doctor can adjust recommendations and approve assessments. Doctor cannot bypass required evidence or submit incomplete formal training results.

- [x] **Step 2: Admin workflow**

Create governance panels for:

- account requests and role management
- user information management
- AI/STT/TTS provider readiness visibility
- game content status
- basic operation configuration: institution, role policy, consent versions, content publish windows, collection condition presets
- statistics query: patient counts, assessment completion, training completion, collection quality, abnormal review counts, export history
- desensitized export
- audit log query

Admin technical details stay here, not in patient UI.

Statistics must be computed from stored formal records and audit-linked events. Do not infer missing metrics or fill empty dates with generated values.

- [x] **Step 3: Caregiver workflow**

Create a family care center:

- authorized progress summary
- doctor precautions
- care circle posts/comments
- visible permission scope

Caregiver must not see raw assessment payloads, raw motion metrics, audit IDs, or export controls.

- [x] **Step 3a: Mark public social square as customer-confirmation gated**

Do not implement or claim an open public social square in this batch. The implemented caregiver interaction is a private care-circle surface. A public social square requires customer confirmation of:

- visible audience and account types
- moderation responsibility
- report/block process
- consent wording
- clinical privacy review
- audit and retention policy

Docs and UI must avoid wording that implies a public social square is fully delivered.

- [x] **Step 4: Verify role workflows**

Run:

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm exec playwright test --config scripts/playwright-regression.config.mjs --project chromium-1280 --project chromium-pixel
```

Expected: role-specific IA and privacy boundaries pass; Playwright covers doctor, admin, caregiver, and patient primary navigation without technical copy leakage.

---

## Task 9: Close Security, Privacy, Export, And Acceptance Package Evidence

**Files:**
- Modify: `apps/api/src/sensitive-encryption.ts`
- Modify: `apps/api/src/sensitive-encryption.spec.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `scripts/check-delivery-readiness.mjs`
- Modify: `scripts/verify-customer-acceptance-package-manifest.mjs`
- Modify: `scripts/__tests__/sensitive-encryption-boundary.test.mjs`
- Modify: `scripts/__tests__/customer-acceptance-package-manifest.test.mjs`
- Modify: `docs/templates/customer-acceptance-package-manifest.template.json`

- [x] **Step 1: Verify encryption envelope**

Sensitive envelope tests must prove:

- `SENSITIVE_DATA_KEY_REF` is required
- key ref must be `secret-manager://...`
- algorithm, IV, tag, ciphertext, and version exist
- missing key material fails
- audit metadata never contains plaintext sensitive fields

- [x] **Step 2: Verify desensitized export**

Export tests must prove:

- reason is required before showing progress
- backend-generated filename is used
- identity fields are masked
- audit log is written
- patient/caregiver UI has no export tooling

- [x] **Step 3: Verify acceptance package**

Manifest verification must reject:

- placeholder paths
- empty files
- hash mismatch
- mock/demo/seed/fallback/fixed/manual markers
- raw tokens, raw payloads, full transcripts, base64 audio, or raw motion payloads

- [x] **Step 4: Verify security closure**

Run:

```bash
pnpm --filter @rehab-platform/api exec jest --runInBand \
  apps/api/src/sensitive-encryption.spec.ts \
  apps/api/src/app.service.spec.ts
node --test \
  scripts/__tests__/sensitive-encryption-boundary.test.mjs \
  scripts/__tests__/customer-acceptance-package-manifest.test.mjs
pnpm delivery:check
```

Expected: security tests and delivery checks pass in local configured environment.

---

## Task 10: Update Documentation For One-Time Client Delivery

**Files:**
- Modify: `README.md`
- Modify: `docs/rehab-platform-role-flows-and-pages.md`
- Modify: `docs/rehab-platform-ui-design-spec.md`
- Modify: `docs/formal-delivery-acceptance-runbook.md`
- Modify: `docs/customer-acceptance-criteria.md`
- Modify: `docs/customer-delivery-progress-and-input-summary.md`
- Modify: `docs/empty-real-loop-acceptance-runbook.md`
- Modify: `docs/web-playwright-regression-runbook.md`

- [x] **Step 1: Document final role flows**

Update role docs to match:

- patient: `我的 -> 今日 -> 训练 -> 记录`
- doctor: patient queue, assessment review, plan management, training review
- admin: account/content/provider/audit/export governance
- caregiver: care center, progress, precautions, profile

- [x] **Step 2: Document formal capability wording**

Use safe delivery wording:

- `已实现平台接入小米 MiMo AI/STT/TTS 的严格调用链路`
- `正式交付需通过真实客户账号、运行时密钥、供应商调用日志和验收脚本`
- `浏览器体感与 Unity WebGL 均可作为训练运行时，后续游戏不强制使用 Unity`
- `穿戴设备和生产部署为客户资料门禁`
- `公开社交广场需客户确认范围、审核机制、隐私协议和运营责任后另行验收；本期交付为私有照护圈`

Do not write that production deployment or wearable integration is complete.

- [x] **Step 3: Document data collection**

Explain collected data:

- profile and consent data
- assessment scores and AI/STT/TTS evidence metadata
- collection condition and camera/device metadata
- pose/game metrics
- dynamic difficulty events from verified runtime rules
- clinician review result
- family-visible desensitized progress
- audit and export evidence
- wearable physiological metrics are not collected or claimed unless customer device evidence is supplied

- [x] **Step 4: Verify docs**

Run:

```bash
pnpm test:delivery
git diff --check
```

Expected: delivery tests pass and markdown has no whitespace errors.

---

## Task 11: Full Regression And Manual Smoke

**Files:**
- Modify only files required by verified failures.

- [x] **Step 1: Start local services**

Run API and Web with the existing local configuration:

```bash
pnpm infra:up
pnpm dev:api
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 pnpm --filter @rehab-platform/web dev --hostname localhost --port 3000
```

Expected:

- API health responds at `http://localhost:4000/health`
- Web opens at `http://localhost:3000`

- [x] **Step 2: Run automated regression**

Run:

```bash
pnpm test:delivery
pnpm delivery:check
pnpm --filter @rehab-platform/api exec jest --runInBand
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs --project chromium-1280 --project chromium-1366 --project chromium-1440 --project chromium-pixel --project chromium-iphone
pnpm verify:contracts
git diff --check
```

Expected: all commands pass. If any command fails, debug the root cause and fix only the verified defect.

- [x] **Step 3: Run formal acceptance readiness and template rejection checks**

When real local/field config files are available, run:

```bash
pnpm verify:empty-real-loop -- <filled-orchestrator-config-json>
pnpm verify:formal-acceptance-chain -- <filled-formal-chain-config-json>
pnpm verify:multi-condition-data-capture -- <filled-multi-condition-config-json>
pnpm verify:browser-pose-field-acceptance -- <filled-browser-pose-evidence-json> --api-base-url <api-url> --read-credentials <read-credentials-json> --patient-token-ref <secret-ref> --audit-token-ref <secret-ref>
pnpm verify:unity-field-acceptance -- <filled-unity-evidence-json> --api-base-url <api-url> --read-credentials <read-credentials-json> --patient-token-ref <secret-ref> --audit-token-ref <secret-ref>
pnpm verify:ai-assessment-acceptance -- <filled-ai-config-json>
pnpm verify:speech-ai-assessment-acceptance -- <filled-speech-ai-config-json>
pnpm verify:tts-speech-output-acceptance -- <filled-tts-config-json>
pnpm verify:customer-acceptance-package-manifest -- <filled-manifest-json> --package-root <acceptance-package-dir>
```

Expected: scripts pass only with real evidence. Template or placeholder configs must fail.

Verified on 2026-06-06: local Unity Editor `6000.0.75f1` is discoverable, `verify:unity-rhythm-reach-source` and `verify:unity-rhythm-reach-webgl-build` pass, and template/placeholder configs are rejected. No filled customer field configs are present in the repository or local output directory, so real-config field acceptance remains customer-evidence gated rather than simulated.

- [x] **Step 4: Manual browser smoke**

Use Chrome/Edge/Safari target versions:

- patient login: `patient001 / 253913`
- doctor login: `doctor001 / 253913`
- admin login: `admin / 253913`
- operator login: `operator001 / 253913`

Smoke paths:

- patient chooses a task, completes prep, enters game, sees self/camera guidance, completes training, sees result
- doctor reviews assessment and training result
- admin opens account/content/provider/audit/export governance
- caregiver views desensitized progress and precautions

Expected: no overlapping panels, no hidden CTA behind bottom nav, no technical training terms in patient/caregiver UI, and no browser console runtime error.

Manual UI acceptance rules:

- patient/caregiver bottom navigation never covers CTA or content after scrolling to top, middle, or bottom
- patient Today screen shows one primary action, with reward/progress below the task decision
- keyboard-only Tab order reaches task card, prep checklist, start training, and finish training in visual order
- doctor/admin/caregiver pages each show one clear page title and one primary work area
- admin statistics and operation configuration are visible only in governance UI
- no page claims wearable physiological metrics unless customer device evidence exists

Verified on 2026-06-06 with in-app Browser smoke: patient, doctor, admin, operator, and caregiver logins/navigation completed with zero browser console errors. A mobile 390×844 smoke found and fixed patient/caregiver bottom-navigation content overlap; Playwright now checks patient/caregiver content and CTAs at top, middle, and bottom scroll positions across desktop, Pixel, and iPhone projects.

---

## Recommended Execution Order

1. Task 1: freeze DOCX coverage.
2. Task 2: add failing UI and IA boundary tests.
3. Task 3: split UI primitives/layouts.
4. Task 4: rebuild patient Today/Prep/Game flow.
5. Task 5: close AI/STT/TTS/MMSE/AD-8 assessment flow.
6. Task 6: expand formal game library.
7. Task 7: close multi-condition data collection.
8. Task 8: rebuild doctor/admin/caregiver workflows.
9. Task 9: close security/privacy/export/acceptance package.
10. Task 10: update one-time delivery documentation.
11. Task 11: full regression and manual smoke.

## Completion Criteria

- `docs/customer-docx-coverage-matrix.md` maps every customer DOCX requirement to implementation and verification.
- Patient UI is task-first, uncluttered, and free of technical/runtime/evidence vocabulary.
- Doctor UI supports clinical review, plan adjustment, and training result review.
- Admin UI supports account/content/provider/audit/export governance.
- Caregiver UI supports desensitized progress, precautions, and social/care interactions.
- AI/STT/TTS use Xiaomi MiMo provider paths with strict configuration and no fallback.
- Unity WebGL and browser pose/Phaser game runtimes are both represented in the formal game library; future games are runtime-flexible.
- Multi-condition collection records real training context and metrics.
- Dynamic difficulty events are generated only by verified runtime rules and recorded with trigger, before/after level, timestamp, and safety clamp reason.
- Operation configuration and statistics query are available in admin governance and backed by formal records.
- Wearable physiological metrics and public social square remain customer-gated unless the customer supplies required device/social-policy inputs.
- Privacy, encryption, consent, RBAC, desensitized export, and audit remain enforced.
- Full local regression commands pass, and field acceptance scripts are ready for real evidence configs.
