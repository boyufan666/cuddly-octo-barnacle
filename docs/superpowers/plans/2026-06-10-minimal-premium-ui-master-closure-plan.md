# Minimal Premium UI Master Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Before each unit, dispatch read-only subagents for source-boundary, business-flow, visual-quality, and test-coverage review. Reconcile every finding before editing. If subagent infrastructure fails, record the exact outage and do not count the review gate as satisfied.

**Goal:** Make this the single execution entry point for the minimal premium UI closure, finish the remaining real business chain and visual cleanup without adding fallback behavior, and prove completion through source tests, browser flow, API persistence, refresh visibility, and final manual smoke.

**Architecture:** Keep the existing Next.js, NestJS, Prisma, seed data, real API contracts, and formal runtime adapters. Rebuild only the visible role workspaces and their orchestration boundaries: patient, caregiver, and doctor primary flows must be quiet business tools; admin/auditor flows may expose governance evidence only inside permission-gated tasks. `role-workspace.tsx` must become orchestration-only, while domain UI/action logic moves into role-owned modules.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, lucide-react, MediaPipe Tasks Vision, Phaser, Unity WebGL, NestJS, Prisma/PostgreSQL, node:test, tsx tests, Jest, Playwright.

---

## Single Source Of Execution Truth

This file supersedes all UI execution plans before it. Do not execute older UI plans directly.

Historical plans remain useful only as evidence and source-discovery material:

- `docs/superpowers/plans/2026-05-24-unity-rhythm-reach-3d-implementation-plan.md`
- `docs/superpowers/plans/2026-05-30-unity-pose-training-usability.md`
- `docs/superpowers/plans/2026-05-31-collection-condition-data-capture.md`
- `docs/superpowers/plans/2026-06-03-docx-gap-closure.md`
- `docs/superpowers/plans/2026-06-05-docx-delivery-ui-functional-closure.md`
- `docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md`
- `docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md`
- `docs/superpowers/plans/2026-06-09-minimal-premium-ui-rebuild-plan.md`
- `docs/superpowers/plans/2026-06-09-minimal-premium-ui-complete-overhaul-plan.md`

Those plans explain how we got here. This plan defines what remains and how it is accepted.

## Adjacent Historical Capability Plans

The older Unity, collection-condition, and DOCX gap plans were capability groundwork. They are not current UI execution plans. Use them only for source-discovery evidence when implementing the units in this master plan:

- `2026-05-24-unity-rhythm-reach-3d-implementation-plan.md`: Unity source and WebGL bridge groundwork.
- `2026-05-30-unity-pose-training-usability.md`: real camera/pose usability groundwork.
- `2026-05-31-collection-condition-data-capture.md`: formal protocol/condition/batch data capture groundwork.
- `2026-06-03-docx-gap-closure.md`: customer DOCX software-gap groundwork.

## Why There Were Several Plans

The plan sequence happened because earlier work made real technical progress but did not yet satisfy the product target: the UI still felt busy, hard to navigate, and too technical. The user then reset the visual/product requirement: simple, premium, role-first, no extra demo or technical display, with all business logic still real.

The new rule is therefore:

- old plans = historical groundwork and evidence
- this plan = current execution authority
- no unit is complete because it “looks calmer”; it is complete only when the real role action succeeds through the configured API and is visible after reload

## Current Verified State

- Unit 0 from the previous complete-overhaul plan is verified: plan authority, visual denial line, business logic closure gate, customer acceptance IA, and result-submit failure strictness were added and tested.
- Unit 1 is verified: shared UI primitives moved toward flat bordered panels, compact buttons, stable text wrapping, no default raised-card shadow, and the focused design-system tests passed.
- Unit 2 is complete in code and tests: login/account request controls are product-first and form-submittable, doctor navigation exposes `患者 / 评估 / 计划 / 准备 / 复核`, `准备` maps to the independent doctor `preparation` workspace, `计划` renders only plan confirmation, `准备` renders only training preparation creation, and old shell dashboard grids were removed.
- Unit 2 verification already run in this thread:
  - `node --test scripts/__tests__/minimal-auth-entry.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs` passed with `24` tests and `0` failures.
  - `pnpm --filter @rehab-platform/web lint` exited `0` with `13` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.
  - `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.
  - Two read-only subagent reviews approved the Unit 2 spec and code quality.
- Playwright browser verification for Unit 2 is not counted complete yet because local sandbox access to `localhost:4000` failed while the real API process was compiling/running. That is a recorded environment/tooling verification gap, not permission to add mocks or a fallback.

## Open Global Gaps

Highest priority gaps:

- role-workspace.tsx remains the highest-risk frontend boundary. It is still about 4,060 lines and owns too much state, role wiring, local UI, and cross-role action logic.
- `app.service.ts` remains a large backend service file. It does not block the UI closure by itself, but high-risk backend changes should be isolated if later units expose persistence bugs.
- `AssessmentDialoguePage.tsx` is still too large and mixes scale forms, AD-8, AI draft, speech transcript, TTS, and conversation review concerns.
- Patient result UI still contains `方案游戏库`, which is a plan-library/showcase concept and must not remain in the patient result surface.
- Patient runtime result submission still moves through form-like technical state (`metricsSummary`, `motionMetrics`) rather than a role-safe runtime result object boundary.
- Doctor AI conversation review is present in API wrappers but not fully completed as a doctor workspace action.
- Doctor preparation copy still exposes operational terms such as collection protocol/condition/batch; it should become doctor-facing language: training arrangement, device requirement, preparation record.
- Caregiver is mostly read-only. The backend supports care-circle posts/comments/precautions, but the frontend lacks a clear family observation or participation write path. This must be included only if it serves the user-facing business scope and remains authorized/desensitized.
- Admin governance is real but dense. Quality evidence and runtime/config material must remain admin/auditor-only and permission-gated.
- formal Playwright chain must carry the same IDs across login, assessment, plan, preparation, training, result, review, caregiver, audit, and export.
- Browser tests must prove refresh-after-action visibility for patient records, doctor review status, caregiver progress, and audit/export.

## Final Information Architecture

Patient:

- `今日`: one next task, including assessment when due, one blocker if blocked, one primary action.
- `训练`: formal preparation, camera/device/posture checks when needed, training runtime, result save.
- `记录`: saved results, doctor-safe review status, simple trend only from real records.
- `我的`: profile, consent, caregiver binding, visible sharing scope.

Doctor:

- `患者`: assigned patient queue, selected patient summary, pending attention.
- `评估`: MMSE/CDR/AD-8/AI/STT evidence summary and persisted doctor risk/assessment confirmation.
- `计划`: plan adjustment, patient-visible reason, confirmation through real API.
- `准备`: visible doctor workspace that creates formal training preparation through real API.
- `复核`: training result review through real API.

Caregiver:

- `照护`: authorized patient summary and today reminder.
- `进展`: desensitized completed-training progress.
- `提醒`: doctor precautions and authorized household observations.
- `我的`: relationship, authorization state, visible scope.

Admin/operator/auditor:

- `账号`: registration review, role activation, caregiver account creation.
- `内容`: cognitive/movement game content and plan-library release state.
- `配置`: runtime readiness, collection condition, collection protocol readiness.
- `审计`: audit search, quality evidence, reason-required desensitized export.

## Non-Negotiable Boundaries

- No fallback, mock, demo, fake readiness, fake result, fake success, silent downgrade, or route fulfill may be added without explicit user approval.
- If fallback is necessary, stop and ask the user before implementing it.
- Do not use seed-only, browser-local, generated, manually typed, or fixed-score evidence to claim a real business action succeeded.
- Patient training preparation cannot create a replacement collection batch. It can only read formal preparation state.
- Training start must use real `api.startTrainingSession`.
- Training result submission must use real `api.submitTrainingResult`.
- Doctor plan confirmation must use real `api.confirmPlan`.
- Doctor preparation must be performed through the visible `准备` workspace and call real `api.createCollectionBatch`.
- Doctor result review must use real `api.reviewTrainingResult`.
- assessment/risk review must persist through a real API and be visible after reload.
- caregiver progress must prove desensitized refreshed visibility.
- Patient/caregiver/doctor primary flows must not show provider payloads, endpoints, manifests, raw JSON, audit IDs, acceptance evidence, quality-evidence internals, or implementation status.
- Admin/auditor may show technical evidence only inside permission-gated governance tasks.

## Source Ownership Map

- `apps/web/src/features/session/role-workspace.tsx`: session, active role/nav, selected patient, reload orchestration, real action dispatch only.
- `apps/web/src/features/auth/*`: login and account request only.
- `apps/web/src/features/patient/*`: patient task, assessment entry, training prep/runtime/result/profile. No admin evidence, raw payload, or doctor-only plan management.
- `apps/web/src/features/doctor/*`: patient queue, assessment/risk confirmation, plan confirmation, preparation creation, training result review.
- `apps/web/src/features/caregiver/*`: authorized/desensitized summary, progress, reminders, relation/scope.
- `apps/web/src/features/admin/*`: account/content/config/audit/export/evidence governance.
- `apps/web/src/features/training-runtime/*`: technical runtime adapters may remain technical internally, but patient-visible copy must be role-safe.
- `apps/web/src/lib/api.ts`: stable API surface. Split only when tests force it or unit ownership becomes safer.
- `apps/api/src/app.service.ts`: preserve behavior. Do not refactor broadly during UI units unless a real persistence bug requires it.

## Execution Units

### Unit 0: Master Plan Authority

**Purpose:** Make this plan the only current execution entry point and prevent future plan drift.

**Files:**

- Create: `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`
- Modify: `docs/superpowers/plans/2026-06-09-minimal-premium-ui-complete-overhaul-plan.md`
- Test: `scripts/__tests__/latest-ui-master-plan-authority.test.mjs`

- [x] **Step 1: RED**

Run:

```bash
node --test scripts/__tests__/latest-ui-master-plan-authority.test.mjs
```

Expected: fail until this plan exists and the 2026-06-09 complete-overhaul plan points here.

Evidence captured during execution: `node --test scripts/__tests__/latest-ui-master-plan-authority.test.mjs` failed because `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md` did not exist.

- [x] **Step 2: GREEN**

Add this plan and mark the previous complete-overhaul plan as superseded by this file.

Run:

```bash
node --test scripts/__tests__/latest-ui-master-plan-authority.test.mjs
```

Expected: pass.

Evidence captured during execution: `node --test scripts/__tests__/latest-ui-master-plan-authority.test.mjs scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs` passed with `6` tests and `0` failures after this master plan was created, the older 2026-06-09 complete-overhaul plan was marked superseded, and acceptance/design/role-flow documents were repointed to this 2026-06-10 plan.

- [x] **Step 3: Review gate**

Dispatch a read-only plan reviewer to verify no old plan can be mistaken for the current execution target.

Review evidence captured during execution:

- Plan-chain reviewer confirmed the earlier sequence caused confusion because multiple historical plans preserved useful evidence while only the latest complete-overhaul plan was intended as the execution target.
- Source-gap reviewer confirmed the remaining high-priority gaps: `role-workspace.tsx`, patient result/game-library leakage, doctor AI/risk/preparation closure, caregiver participation/refresh visibility, admin governance density, and oversized source boundaries.
- Test-gap reviewer confirmed the remaining verification gaps: same-ID formal Playwright chain, reload-after-action visibility, doctor `准备` through UI, assessment/risk browser closure, result submit ID/audit proof, caregiver desensitized visibility, and export/audit proof.

### Unit 1: Session Orchestration Cleanup

**Purpose:** Reduce `role-workspace.tsx` until it is orchestration-only and remove stale UI helpers/warnings.

**Files:**

- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Modify: `apps/web/src/features/session/action-status.ts`
- Modify: `apps/web/src/features/session/useRoleData.ts`
- Modify only if extracted boundaries require it: role-owned feature files under `apps/web/src/features/{patient,doctor,caregiver,admin}/`
- Test: `scripts/__tests__/global-ui-component-boundary.test.mjs`
- Test: `scripts/__tests__/role-first-shell-navigation.test.mjs`
- Test: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`

- [x] **Step 1: RED**

Strengthen source-boundary tests to require:

```js
assert.ok(roleWorkspaceSource.split("\n").length < 3000);
assert.doesNotMatch(roleWorkspaceSource, /function SurfacePanel|function MissingDataCard|function Waveform|function Ring|function Badge|function Chip/);
assert.doesNotMatch(roleWorkspaceSource, /function RewardProgressPanel|function TaskList|function PatientCreatePanel/);
assert.doesNotMatch(roleWorkspaceSource, /text-5xl|shadow-\\[|rounded-2xl|hover:-translate/);
```

Run:

```bash
node --test scripts/__tests__/global-ui-component-boundary.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/formal-runtime-ui-contract.test.mjs
```

Expected: fail while `role-workspace.tsx` still owns old UI primitives or is over the line budget.

Evidence captured during execution:

- `node --test scripts/__tests__/global-ui-component-boundary.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/formal-runtime-ui-contract.test.mjs` first failed as expected because `role-workspace.tsx` was still over the `3000` line boundary and retained local session UI/helper definitions.
- A focused action-order RED was then added to `scripts/__tests__/role-first-shell-navigation.test.mjs`; it failed because `handleCreateCaregiverAccount` reset local form state before `loadRoleData`.
- Reviewer-driven RED coverage was added for `handleCreateAssessment`, `handleRecommendPlan`, `handleCreateCollectionCondition`, and logged-out login/account-request error surfacing; the tests failed before implementation, proving the assertions covered real gaps.

- [x] **Step 2: Implement**

Extract remaining local UI helpers into role-owned modules, delete unused state/functions, and keep real API action order:

1. validate
2. set busy status
3. call real API/helper
4. reload role data
5. clear busy status
6. surface real error

Use English logs only on real failure paths, for example:

```ts
console.error("[training] submit result failed", error);
```

Implementation evidence captured during execution:

- `role-workspace.tsx` was reduced to `2543` lines and now mounts extracted `AuthEntryPanel`, `DoctorWorkspaceContainer`, `PlanConfirmationWorkspace`, and `PatientTrainingRuntimeStage`.
- Local forbidden UI/helpers were removed from `role-workspace.tsx`; payload builders and download behavior are delegated to auth/admin/patient modules.
- Success handlers now reload/refetch before local form reset for assessment, AD-8, caregiver account creation, caregiver binding, plan confirmation, recommendation, training result submission, training review, data export, and collection condition creation.
- Logged-out failures now surface through `displayedDataError = session ? dataError : sessionDataError ?? dataError`, and `handleRequestError` clears stale action status on failures.

- [x] **Step 3: GREEN**

Run:

```bash
node --test scripts/__tests__/global-ui-component-boundary.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/formal-runtime-ui-contract.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass with no unused warnings from the extracted code.

Evidence captured during execution:

- `node --test scripts/__tests__/global-ui-component-boundary.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/formal-runtime-ui-contract.test.mjs` passed with `26` tests, `0` failures.
- `node --test scripts/__tests__/minimal-auth-entry.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs` passed with `26` tests, `0` failures after adjacent stale boundary assertions were updated to the extracted modules.
- `pnpm --filter @rehab-platform/web lint` exited `0` with no warnings.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.

- [x] **Step 4: Review gate**

Dispatch source-boundary and API-semantics reviewers.

Review evidence captured during execution:

- Initial read-only Unit 1 subagents identified the high-risk residual local UI/helper definitions, stale imports, lint warnings, and action-order risks.
- First spec/code-quality re-review blocked completion on reset-before-reload paths, no refetch after recommendation/collection-condition creation, and hidden login failure status.
- Final focused re-review approved Unit 1 with no remaining blockers after verifying the adjacent auth/patient boundary group, Unit 1 boundary group, lint, and TypeScript checks.

### Unit 2: Patient Today, Assessment, Prep, Runtime, Result, Profile

**Purpose:** Make patient flow sparse and obvious while keeping assessment, training, and result submission real.

**Files:**

- Modify: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Modify: `apps/web/src/features/patient/AssessmentDialoguePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/features/patient/PatientProfilePage.tsx`
- Modify: `apps/web/src/features/patient/patient-readiness-orchestration.ts`
- Modify: `apps/web/src/features/patient/patient-training-actions.ts`
- Create: `apps/web/src/features/patient/patient-training-result-boundary.ts`
- Create: `apps/web/src/features/patient/patient-training-actions.test.ts`
- Modify: `apps/web/src/types/api.ts`
- Test: `scripts/__tests__/patient-training-flow-ia.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Test: `scripts/__tests__/patient-facing-game-library-boundary.test.mjs`
- Test: `scripts/__tests__/training-capture-layout.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Test: `scripts/__tests__/patient-training-task-library.test.mjs`
- Test: relevant `apps/web/src/features/patient/*.test.ts`

- [x] **Step 1: RED**

Add/strengthen assertions:

```js
assert.match(todaySource, /data-testid="patient-next-action"/);
assert.doesNotMatch(resultSource, /方案游戏库|能力展示|demo|mock|fallback/i);
assert.doesNotMatch(patientVisibleSources, /Provider|Endpoint|manifest|runtimeType|rawPayload|auditId|quality evidence/i);
assert.match(assessmentSource, /待医生确认|医生确认/);
```

Run:

```bash
node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/patient-facing-game-library-boundary.test.mjs scripts/__tests__/training-capture-layout.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/patient/*.test.ts src/lib/training-start-readiness.test.ts src/lib/browser-pose-training-result.test.ts src/lib/cognitive-web-training-result.test.ts src/lib/unity-training-bridge.test.ts
```

Expected: fail until patient-facing result/library/technical-copy boundaries and readiness/result behavior are corrected.

Evidence captured during execution:

- Initial Unit 2 source RED failed with `36/38` pass and `2` expected failures because `TrainingResultPage.tsx` still imported/rendered `GameLibraryPage` and `方案游戏库`.
- After reversing stale assertions, the Unit 2 RED group failed on the intended remaining gaps: old `buildTrainingResultPayload(form)` validation, `TodayTrainingPage` still using full `TrainingTaskPicker`, missing `PatientTrainingResultDraft`, raw readiness error propagation, and assessment summary treating any record as completed.
- A reviewer-driven executable RED was added in `apps/web/src/features/patient/patient-training-actions.test.ts`; it initially failed because importing `patient-training-actions.ts` pulled in `api.ts` and required `NEXT_PUBLIC_API_BASE_URL`, proving the validator needed a pure no-API boundary rather than a test-only environment workaround.

- [x] **Step 2: Implement**

1. `今日` chooses one next task: assessment due or training due.
2. Assessment ends in a doctor-confirmation state, never fake completion.
3. `训练` shows only truthful blockers and the next real action.
4. Runtime result state moves through a typed result object boundary instead of exposing technical form concepts to the patient page.
5. `记录` shows saved records and doctor-safe status only; remove `方案游戏库`.
6. `我的` keeps profile, consent, caregiver binding, and sharing scope.
7. Patient-visible result explanation must be derived from real saved metrics or shown as unavailable.

Implementation evidence captured during execution:

- `TodayTrainingPage.tsx` now computes `nextTask` and renders only the next unfinished item with one `patient-next-action`; full `TrainingTaskPicker` remains as a component/library surface but is no longer mounted in `今日`.
- `TrainingRuntimePage.tsx` now accepts `PatientTrainingResultDraft { payload: SubmitTrainingResultRequest }` and shows only a patient-safe save confirmation, not score/motion metric form fields.
- `patient-training-result-boundary.ts` owns pure captured-payload validation for score/rates/duration/reaction/source/runtime/collection batch/protocol/motion metrics, while `patient-training-actions.ts` stays API-only for `api.collectionBatches`, `api.startTrainingSession`, and `api.submitTrainingResult`.
- `role-workspace.tsx` stores `trainingResultDraft`, clears it on auth reset/patient switch/prep/start/success, validates the captured payload before `submitTrainingResult`, and no longer reparses `metricsSummary`/`motionMetrics` from patient form strings.
- `TrainingResultPage.tsx` no longer imports or renders `GameLibraryPage`, removes exact patient-facing runtime metric readouts, keeps saved-record and doctor-status copy, and adds `break-words` guards for long training names/review text.
- `AssessmentDialoguePage.tsx` no longer treats `completedAt`/`createdAt` as doctor confirmation; it shows `待医生确认` unless an explicit future confirmation field or the real included `riskGrades.confirmedAt/confirmedById` is present.
- Readiness device/pose catch paths now use `patientSafeTrainingActionErrorMessage`, including WASM/CDN/MediaPipe/network terms in the sanitized technical-error pattern.

- [x] **Step 3: GREEN**

Run the RED commands again, then:

```bash
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Evidence captured during execution:

- `node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/patient-facing-game-library-boundary.test.mjs scripts/__tests__/training-capture-layout.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-training-task-library.test.mjs` passed with `51` tests and `0` failures. It emitted the existing `MODULE_TYPELESS_PACKAGE_JSON` warning from direct TS ESM import in the source-boundary test path.
- `noglob pnpm --filter @rehab-platform/web exec tsx --test src/features/patient/*.test.ts src/lib/training-start-readiness.test.ts src/lib/browser-pose-training-result.test.ts src/lib/cognitive-web-training-result.test.ts src/lib/unity-training-bridge.test.ts` passed with `29` tests and `0` failures.
- `pnpm --filter @rehab-platform/web lint` exited `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.

- [x] **Step 4: Review gate**

Dispatch patient-flow, runtime-result, and technical-copy reviewers.

Review evidence captured during execution:

- Read-only Unit 2 source/business/visual/test-coverage reviewers identified the patient result game-library leak, full-task today picker, patient result string form boundary, exact patient metric readouts, raw readiness errors, and fake assessment completion.
- Spec reviewer approved Unit 2 after checking one-next-task today flow, patient nav, no result `GameLibraryPage`, captured `SubmitTrainingResultRequest`, pending/confirmed assessment state, and patient-safe readiness copy; it also reproduced a `47/47` targeted source-test pass including `formal-runtime-ui-contract`.
- Code-quality reviewer first blocked approval on assessment confirmation fields, long-text overflow risk, and source-only validator coverage.
- After fixes, code-quality re-review approved Unit 2: assessment confirmation now uses real included `riskGrades.confirmedAt/confirmedById` and avoids `completedAt`, result text has wrapping guards, validator is pure/API-free with executable tests, and no mock/demo/fallback behavior was found.

### Unit 3: Doctor Clinical Chain

**Purpose:** Complete doctor assessment/risk, plan, preparation, and training review as real focused workspaces.

**Files:**

- Modify: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Modify: `apps/web/src/features/doctor/AssessmentReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/PatientClinicalSummary.tsx`
- Modify: `apps/web/src/features/doctor/PlanEditor.tsx`
- Modify: `apps/web/src/features/doctor/DataCollectionReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/TrainingReviewQueue.tsx`
- Modify: `apps/web/src/features/doctor/doctor-workbench-actions.ts`
- Modify: `apps/web/src/features/doctor/doctor-workbench-model.ts`
- Modify if real API is missing: `apps/web/src/lib/api.ts`, `apps/web/src/types/api.ts`, `apps/api/src/app.controller.ts`, `apps/api/src/app.service.ts`
- Test: `scripts/__tests__/doctor-workbench-ia.test.mjs`
- Test: `apps/web/src/features/doctor/*.test.ts`

- [x] **Step 1: RED**

Add/strengthen assertions:

```js
assert.match(doctorWorkspaceSource, /"patients"|"assessment"|"plan"|"preparation"|"review"/);
assert.doesNotMatch(doctorVisibleSources, /Provider|Endpoint|manifest|rawPayload|auditId|fallback|mock|demo/i);
assert.match(doctorVisibleSources, /风险确认|评估复核|创建训练准备记录|保存复核结论/);
```

Run:

```bash
node --test scripts/__tests__/doctor-workbench-ia.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/doctor/*.test.ts src/lib/ai-assessment-draft.test.ts
```

Expected: fail until doctor action builders and UI boundaries enforce real plan/preparation/review behavior.

Evidence captured during execution:

- Read-only source-boundary, business-flow, visual-quality, and test-coverage reviewers confirmed the main Unit 3 gap: doctor assessment/risk confirmation had no real persisted review API/wiring, doctor preparation copy still exposed collection/protocol/batch language, and stale tests did not prove reload-safe clinical state.
- RED coverage was added in `scripts/__tests__/doctor-workbench-ia.test.mjs`, `apps/api/src/app.controller.spec.ts`, `apps/api/src/app.service.spec.ts`, `apps/web/src/features/doctor/doctor-workbench-actions.test.ts`, and `apps/web/src/features/session/action-status.test.ts`; the first runs failed on the intended gaps before implementation.
- Reviewer-driven REDs were added after code-quality findings: transaction-scoped `assessment.review` audit, guarded concurrent risk confirmation, assessment-scoped risk binding in the doctor workbench, stale patient-level risk usage in `PatientClinicalSummary`, clinical action-status wording preservation, and backend rejection of `returned` after a confirmed assessment. Each failed against the pre-fix implementation.

- [x] **Step 2: Implement**

1. Doctor `评估` must persist risk/assessment confirmation through a real API. If the API path is missing, stop this unit and record the blocker; do not fake the state.
2. Doctor `计划` calls real `api.confirmPlan` and shows adjustment reason/history as business content.
3. Doctor `准备` calls real `api.createCollectionBatch` from the visible `准备` workspace.
4. Replace doctor-facing collection/protocol/batch wording with training arrangement/device requirement/preparation record.
5. Doctor `复核` calls real `api.reviewTrainingResult`.
6. Add doctor AI conversation review UI only if it uses the existing real review API and persists after reload.

Implementation evidence captured during execution:

- Added real `PATCH /assessments/:id/review` controller/API/client/type wiring and `api.reviewAssessment`.
- Implemented `reviewAssessment` persistence in `apps/api/src/app.service.ts`: assessment status becomes `doctor_confirmed` or `returned_for_review`, doctor review metadata is appended to `rawInputSummary`, current risk confirmation is guarded by transaction-local `findFirst` plus `updateMany` with `confirmedAt: null` / `confirmedById: null`, and `assessment.review` audit is written inside the same transaction.
- Added backend integrity protection so stale/direct `decision: "returned"` cannot overwrite a `doctor_confirmed` assessment or a risk already carrying `confirmedById/confirmedAt`.
- Included assessment-level `riskGrades` in patient detail loading and updated doctor UI/model paths to bind confirmation to `assessment.riskGrades`, not stale patient-level risk.
- Wired doctor assessment approve/return buttons through real session handlers and preserved the real action order: validate -> busy -> real API -> reload/refetch -> reset state/status -> clear busy.
- Kept doctor `计划`, `准备`, and `复核` on real `api.confirmPlan`, `api.createCollectionBatch`, and `api.reviewTrainingResult`; preparation copy now uses doctor business language such as training arrangement, device requirements, preparation rules, and preparation record.
- Narrowed action-status technical sanitization so provider/runtime/payload tokens are hidden while normal clinical wording such as `原始摘要` remains visible to doctors.

- [x] **Step 3: GREEN**

Run:

```bash
node --test scripts/__tests__/doctor-workbench-ia.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/doctor/*.test.ts src/lib/ai-assessment-draft.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Evidence captured during execution:

- `node --test scripts/__tests__/doctor-workbench-ia.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs` passed with `6` tests and `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/features/doctor/doctor-workbench-actions.test.ts src/features/doctor/doctor-workbench-model.test.ts src/features/doctor/PatientClinicalSummary.test.tsx src/features/session/action-status.test.ts src/lib/ai-assessment-draft.test.ts` passed with `22` tests and `0` failures.
- `pnpm --filter @rehab-platform/api exec jest --runInBand` passed with `4` suites and `244` tests.
- `pnpm --filter @rehab-platform/web lint` exited `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.

- [x] **Step 4: Review gate**

Dispatch clinical-flow, persistence, and copy-boundary reviewers.

Review evidence captured during execution:

- Spec reviewer approved the real Unit 3 chain after confirming `PATCH /assessments/:id/review`, `confirmPlan`, visible `准备` -> `createCollectionBatch`, `reviewTrainingResult`, and doctor business copy were all wired to real APIs without fallback/mock/demo state.
- Code-quality reviewer initially rejected the implementation because `assessment.review` audit was outside the transaction and duplicate risk confirmation used a pre-transaction snapshot plus unguarded `update`; both were fixed with transaction-local audit and guarded `updateMany`.
- Code-quality reviewer then rejected an alternate UI path where `PatientClinicalSummary` could confirm the selected assessment using patient-level stale risk; this was fixed and covered by `PatientClinicalSummary.test.tsx`.
- Code-quality reviewer finally rejected stale/direct `returned` review after confirmation; this was fixed in the backend transaction before assessment update/audit and covered by `app.service.spec.ts`.
- Final spec re-review approved assessment-scoped risk binding and real API wiring.
- Final code-quality re-review approved the transaction, guarded update, stale-return protection, assessment-scoped UI risk binding, and action-status sanitization boundaries.

### Unit 4: Caregiver Authorized Participation

**Purpose:** Keep caregiver calm and desensitized, and add only the real participation actions already supported by policy and API.

**Files:**

- Modify: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverProgressPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverReminderPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverScopePanel.tsx`
- Modify: `apps/web/src/features/caregiver/caregiver-workspace-model.ts`
- Modify if participation action is enabled: `apps/web/src/lib/api.ts`, `apps/web/src/types/api.ts`, `apps/web/src/features/session/role-workspace.tsx`
- Test: `scripts/__tests__/care-circle-privacy.test.mjs`
- Test: `apps/web/src/features/caregiver/caregiver-workspace-model.test.ts`

- [x] **Step 1: RED**

Add/strengthen assertions:

```js
assert.doesNotMatch(caregiverSources, /MetricTile|平均得分|审计|导出|provider|runtime|manifest|rawPayload|质量证据|fallback|mock|demo/i);
assert.match(caregiverSources, /照护|进展|提醒|我的/);
```

Run:

```bash
node --test scripts/__tests__/care-circle-privacy.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/caregiver/caregiver-workspace-model.test.ts
```

Evidence captured during execution:

- `node --test scripts/__tests__/care-circle-privacy.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs` failed as expected before implementation because caregiver sources still contained `MetricTile`/average-stat UI and lacked real `onCreateNote`/`onCreateComment` wiring through `api.createCareCirclePost` / `api.createCareCircleComment` plus `reloadRoleData`.
- `pnpm --filter @rehab-platform/web exec tsx --test src/features/caregiver/caregiver-workspace-model.test.ts` failed as expected because the model still returned `平均完成` and `平均得分` stats.
- `pnpm --filter @rehab-platform/api exec jest --runInBand src/app.service.spec.ts --runTestsByPath` failed as expected for the new caregiver authorization tests: `progress=false` still returned `recentTraining`, and `reminders=false` still queried/returned published precautions.
- Reviewer-driven RED was added for caregiver summary quality desensitization; the focused test failed while `caregiverSummary.recentTraining.result` still contained `qualityFlag`.

- [x] **Step 2: Implement**

1. `照护` shows authorized summary and today reminder.
2. `进展` shows desensitized progress after refresh.
3. `提醒` shows published doctor precautions.
4. `我的` shows relation and authorization scope.
5. If adding family observation/comment action, use real care-circle API, reload after submit, and keep moderation/visibility rules explicit.
6. Revoked or absent authorization must show empty state, not cached data.

Implementation evidence captured during execution:

- `apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx` and `CaregiverProgressPanel.tsx` no longer import/render `MetricTile`; caregiver visible stats are quiet bordered rows.
- `apps/web/src/features/caregiver/caregiver-workspace-model.ts` now returns `完成次数 / 最近一次 / 今日安排`, removes average completion/score helpers, and keeps unknown backend labels mapped to fixed family-safe copy.
- `apps/web/src/features/caregiver/CaregiverReminderPanel.tsx` now exposes controlled family observation and comment forms; it does not mutate care-circle state locally.
- `apps/web/src/features/session/role-workspace.tsx` now owns caregiver note/comment form state and handlers `handleCreateCareCirclePost` / `handleCreateCareCircleComment`, with real action order: validate -> busy -> `api.createCareCirclePost`/`api.createCareCircleComment` -> `await reloadRoleData(session, patientId)` -> reset submitted input -> success/error -> clear busy. No `setData(...careCircle...)` optimistic path was added.
- `apps/api/src/app.service.ts` now honors caregiver scope: `progress=false` uses `take: 0` and returns `recentTraining: []`; `reminders=false` skips `carePrecaution.findMany` and returns `precautions: []`; caregiver training result serialization omits `qualityFlag`, raw metrics, and quality-evidence internals.
- `apps/web/src/types/api.ts` now uses caregiver-specific `CaregiverTrainingSession` / `CaregiverTrainingResult` types without `qualityFlag` or raw fields, and the obsolete `buildCaregiverTrainingRecords` bridge was removed.
- The over-broad source-boundary assertion that treated TypeScript `export` syntax as visible export copy was narrowed to export/governance language without weakening the visible caregiver boundary.

- [x] **Step 3: GREEN**

Run RED commands again plus:

```bash
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Evidence captured during execution:

- `node --test scripts/__tests__/care-circle-privacy.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs` passed with `13` tests and `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/features/caregiver/caregiver-workspace-model.test.ts` passed with `5` tests and `0` failures.
- `pnpm --filter @rehab-platform/api exec jest --runInBand src/app.service.spec.ts --runTestsByPath` passed with `217` tests and `0` failures after the Unit 4 backend scope tests were added.
- `pnpm --filter @rehab-platform/api exec jest --runInBand src/app.service.spec.ts --runTestsByPath --testNamePattern "returns caregiver summary without technical plan and game metadata"` passed after `qualityFlag` was removed from caregiver summary.
- `pnpm --filter @rehab-platform/web lint` exited `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.
- `pnpm --filter @rehab-platform/api exec jest --runInBand` passed with `4` suites, `246` tests, and `0` failures. The only non-failing output was a Watchman permission warning for a macOS Frecents directory.

- [x] **Step 4: Review gate**

Dispatch caregiver privacy and authorization reviewers.

Review evidence captured during execution:

- Initial read-only Unit 4 reviewers rejected the caregiver boundary because average score/completion UI, `MetricTile`, missing real family observation write actions, and backend scope leaks were still present.
- Spec reviewer initially rejected the implementation because caregiver summary still returned `qualityFlag`; the gap was fixed and the spec re-review approved with no remaining gaps.
- Code-quality reviewer approved with no critical or important issues. Its minor least-privilege note about selecting caregiver author `account/mobilePhone` was fixed by trimming the Prisma author select to `displayName` only; API Jest, web TypeScript, and source-boundary tests were rerun successfully after the fix.

### Unit 5: Admin Governance And Audit

**Purpose:** Keep governance real but focused, permissioned, and out of primary patient/doctor/caregiver flows.

**Files:**

- Modify: `apps/web/src/features/admin/AdminOverviewPage.tsx`
- Modify: `apps/web/src/features/admin/AccountReviewPanel.tsx`
- Modify: `apps/web/src/features/admin/TrainingContentGovernance.tsx`
- Modify: `apps/web/src/features/admin/OperationConfigPanel.tsx`
- Modify: `apps/web/src/features/admin/CollectionConditionGovernance.tsx`
- Modify: `apps/web/src/features/admin/TrainingQualityEvidenceSection.tsx`
- Modify: `apps/web/src/features/admin/DesensitizedExportPanel.tsx`
- Modify: `apps/web/src/features/admin/SecurityAuditPage.tsx`
- Modify: `apps/web/src/features/admin/admin-payload-builders.ts`
- Test: `scripts/__tests__/admin-governance-ia.test.mjs`
- Test: `scripts/__tests__/registration-request-ui.test.mjs`
- Test: `scripts/__tests__/collection-condition-ui.test.mjs`
- Test: `apps/web/src/features/admin/*.test.ts`

- [x] **Step 1: RED**

Add/strengthen assertions:

```js
assert.doesNotMatch(adminOverviewSource, /TrainingRuntimePage|BrowserPoseTrainingSurface|UnityTrainingSurface|完成本次训练|fallback|mock|demo/i);
assert.match(auditSlice, /canExportData|canReadAuditLogs|canManageQualityEvidence/);
```

Run:

```bash
node --test scripts/__tests__/admin-governance-ia.test.mjs scripts/__tests__/registration-request-ui.test.mjs scripts/__tests__/collection-condition-ui.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/admin/*.test.ts
```

Evidence captured during execution:

- RED coverage was added to `scripts/__tests__/admin-governance-ia.test.mjs` for `canManageQualityEvidence`, export UI gating, operator permission boundaries, quality evidence render gating, and the shared export policy. The first focused run failed while `DesensitizedExportPanel` was unconditionally mounted and `admin_operator` still had `data.export`.
- RED coverage was added to `scripts/__tests__/collection-condition-ui.test.mjs`, `apps/api/src/app.service.spec.ts`, and `apps/api/src/app.controller.spec.ts`; the first runs failed because `api.collectionConditions`, `service.listCollectionConditions`, and `controller.listCollectionConditions` did not exist.
- RED coverage was added to `apps/web/src/features/admin/admin-export-policy.test.ts`; it failed because `admin-export-policy` did not exist.
- Reviewer-driven RED coverage was added to `apps/api/src/app.service.spec.ts` for registration review desensitization; it failed because `reviewRegistrationRequest()` returned `initialPasswordHash` and encrypted `profileSnapshot` from the Prisma update result.

- [x] **Step 2: Implement**

1. `账号`: registration review, role activation, caregiver account creation.
2. `内容`: training content and plan-library release state.
3. `配置`: runtime readiness, collection condition/protocol forms, refresh-visible condition/protocol state.
4. `审计`: audit search, quality evidence, reason-required export.
5. Auditor-only controls must not appear for operator-only users.
6. CSV export must be desensitized and audit-logged.

Implementation evidence captured during execution:

- Admin workspace remains limited to `账号 / 内容 / 配置 / 审计`, with `TrainingQualityEvidenceSection` mounted only through `permissions.canManageQualityEvidence`.
- `quality_evidence.manage` was added to web/API admin permission types and granted only to `admin`/`admin_super`.
- `admin_operator` no longer receives `data.export`; the export API denies users without `data.export` and writes denied audit evidence with a hashed reason.
- `DesensitizedExportPanel` is only mounted when `permissions.canExportData && permissions.canReadAuditLogs`; shared `admin-export-policy.ts` keeps audit-log dataset filtering and reason-required submit logic in one tested place.
- Registration request list and review responses use explicit white-list selection plus response mapping, so `initialPasswordHash` and encrypted `profileSnapshot` do not leave the service.
- Real collection condition listing was added as `GET /admin/collection-conditions`, backed by Prisma and loaded by admin role data only when the session has `game.manage`; create condition/protocol now refetches real condition/protocol state after mutation.

- [x] **Step 3: GREEN**

Run RED commands again plus:

```bash
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Evidence captured during execution:

- `node --test scripts/__tests__/admin-governance-ia.test.mjs scripts/__tests__/registration-request-ui.test.mjs scripts/__tests__/collection-condition-ui.test.mjs` passed with `10` tests and `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/features/admin/*.test.ts` was run through `/bin/bash` glob expansion and passed with `3` tests and `0` failures.
- `pnpm --filter @rehab-platform/api exec jest --runInBand` passed with `4` suites and `248` tests. Watchman emitted a local permission warning only.
- `pnpm --filter @rehab-platform/web lint` exited `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.

- [x] **Step 4: Review gate**

Dispatch admin-governance and security/audit reviewers.

Review evidence captured during execution:

- Admin governance spec reviewer first requested changes because `admin_operator` still had `data.export` and could see/use `DesensitizedExportPanel`; after removing operator export permission and gating the export panel behind `canExportData && canReadAuditLogs`, re-review approved Unit 5.
- Security/code-quality reviewer first requested changes because `reviewRegistrationRequest()` returned an unsanitized Prisma update row; after adding `registrationRequestResponseSelect` and `registrationRequestResponse()`, re-review approved the registration review/list and admin export permission paths.

### Unit 6: Formal Browser Business Chain

**Purpose:** Turn Playwright from shell smoke into real same-ID business-chain evidence.

**Files:**

- Modify: `scripts/formal-ui-business-chain.spec.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`
- Modify: `scripts/playwright-regression.config.mjs` only if startup timing needs a real non-fallback fix.
- Modify: `docs/web-playwright-regression-runbook.md`

- [x] **Step 1: RED**

Add assertions that fail until the browser chain:

```js
assert.doesNotMatch(formalSpec, /page\\.route\\([\\s\\S]*fulfill/);
assert.match(formalSpec, /waitForResponse\\([\\s\\S]*training-sessions/);
assert.match(formalSpec, /waitForResponse\\([\\s\\S]*training-sessions\\/:id\\/results|training-results/);
assert.match(formalSpec, /reload\\(/);
assert.match(formalSpec, /audit-logs/);
```

Run:

```bash
node --test scripts/__tests__/latest-ui-master-plan-authority.test.mjs
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280
```

Expected: fail until the formal browser chain captures real responses and does not use route fulfillment.

Evidence captured during execution:

- Initial Unit 6 RED was strengthened in `scripts/__tests__/latest-ui-master-plan-authority.test.mjs`, `apps/web/src/features/session/useRoleSession.test.ts`, and `apps/api/src/app.service.spec.ts`; the first runs failed because the formal spec did not assert every same-chain audit action, `shouldApplyAuthenticatedSideEffect` did not exist, and backend audit metadata for `rehab_plan.confirm`, `training_session.start`, and `training_result.submit` lacked same-chain fields.
- Reviewer-driven RED was added after the first Playwright pass: `reloadAuthenticatedAndExpect()` still allowed a hidden re-login path, export audit matching could be satisfied by historical same-patient runs, and logout did not synchronously invalidate pending role-data loads. Those RED checks failed before implementation.

- [x] **Step 2: Implement**

1. Use real local API and web only.
2. Browser chain creates/uses assessment, doctor risk review, plan confirmation, visible doctor preparation, training start, result submit, doctor review, caregiver summary, audit search, and export.
3. Capture response IDs and assert they remain the same chain.
4. Reload after each role-changing action and assert persisted state is visible.
5. Treat `训练结果提交失败` as a blocking failure.
6. Do not use `page.route(...fulfill)` to simulate business state.

Implementation evidence captured during execution:

- `scripts/formal-ui-business-chain.spec.mjs` now uses the browser UI and real API responses to carry one `chainIds` object through assessment risk confirmation, plan confirmation, visible doctor preparation, patient training start, result submission, doctor review, caregiver summary, audit search, and reason-required desensitized export.
- Reload helpers now require the existing session to restore after `page.reload()` and no longer call `login()` after reload.
- Export evidence reads the downloaded CSV, verifies desensitized `patientExportId` and `sessionExportId`, rejects raw patient/session/result IDs, and binds the export audit to the current run through a reason hash that includes `chainIds.trainingSessionId`.
- Backend audit metadata now carries same-chain identifiers for `rehab_plan.confirm`, `training_session.start`, and `training_result.submit`; existing `assessment.review`, `collection_batch.create`, `training_result.review`, and `data.export` metadata are asserted by the browser chain.
- Session restore now rejects stale `api.me` responses and stale async role-data tails; `clearAuthenticatedState` synchronously clears `activeRoleDataTokenRef` before resetting data.

- [x] **Step 3: GREEN**

Run:

```bash
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280
```

If Docker/PostgreSQL/browser localhost is unavailable, record the exact blocker. Do not add fallback.

Evidence captured during execution:

- `node --test scripts/__tests__/latest-ui-master-plan-authority.test.mjs scripts/__tests__/admin-governance-ia.test.mjs scripts/__tests__/role-first-shell-navigation.test.mjs` passed with `19` tests and `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/features/doctor/doctor-workbench-model.test.ts src/features/session/useRoleSession.test.ts` passed with `8` tests and `0` failures.
- `pnpm --filter @rehab-platform/api exec jest --runInBand` passed with `4` suites, `249` tests, and `0` failures. Watchman emitted a local permission warning only.
- `pnpm --filter @rehab-platform/web lint` exited `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280` passed with `1` test and `0` failures. Playwright webServer emitted transient startup `curl` connection attempts while the local API was starting.

- [x] **Step 4: Review gate**

Dispatch Playwright and business-chain reviewers.

Review evidence captured during execution:

- Unit 6 spec reviewer first rejected the implementation because the browser chain only queried `assessment.review`, `training_result.review`, and `data.export` audit logs; after adding audit assertions for `rehab_plan.confirm`, `collection_batch.create`, `training_session.start`, and `training_result.submit`, and after adding same-chain backend audit metadata, re-review approved Unit 6 scoped compliance.
- Unit 6 code-quality reviewer first rejected the implementation because stale role-data tails could still mutate state after a newer login and export audit matching used a reusable reason hash; after adding current-token gating, synchronous clear invalidation, and a per-training-session export reason hash, final re-review approved with no blockers, important issues, or minor issues.

### Unit 7: Visual Browser Regression

**Purpose:** Prove the UI is simple, stable, non-overlapping, and role-safe in desktop and mobile browsers.

**Files:**

- Modify: `scripts/web-playwright-regression.spec.mjs`
- Modify: `docs/web-playwright-regression-runbook.md`

- [x] **Step 1: RED**

Add browser assertions:

```ts
await expect(page.getByText(/Provider|Endpoint|manifest|runtimeType|fallback|mock|demo|技术验收/i)).toHaveCount(0);
expect(await hasHorizontalOverflow(page)).toBe(false);
expect(await primaryActionCoveredByNav(page)).toBe(false);
```

Run:

```bash
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/web-playwright-regression.spec.mjs --project=chromium-1280
```

Evidence captured during execution:

- Initial Unit 7 RED was added as `scripts/__tests__/web-playwright-visual-regression-boundary.test.mjs`; the first run failed `0/3` because `scripts/web-playwright-regression.spec.mjs` still used browser route fulfillment, did not assert visible text clipping, and the runbook did not explicitly record Unit 7 screenshot evidence.
- Code-reviewer RED was added after the first GREEN attempt; `node --test scripts/__tests__/web-playwright-visual-regression-boundary.test.mjs` failed `2/3` because primary patient CTA checks could silently pass when the CTA was missing, text clipping did not inspect hidden/clip ancestors, screenshots assumed a pre-created directory, and layout overlap checks did not filter hidden responsive copies.
- The strengthened browser check then exposed a real mobile UI failure: Pixel/iPhone failed on doctor `患者` because wide table content and workbench copy were clipped by the mobile viewport rather than wrapping into a mobile-safe layout.

- [x] **Step 2: Implement**

1. Cover patient, doctor, caregiver, admin nav.
2. Cover 1280, 1366, 1440, Pixel, and iPhone projects.
3. Capture screenshots for role landing and primary workflows.
4. Verify no horizontal overflow, text clipping, bottom-nav overlap, or patient/caregiver/doctor technical copy leakage.

Implementation evidence captured during execution:

- `scripts/web-playwright-regression.spec.mjs` now covers login, account request, patient `今日 / 训练 / 记录 / 我的`, doctor `患者 / 评估 / 计划 / 准备 / 复核`, caregiver `照护 / 进展 / 提醒 / 我的`, admin `账号 / 内容 / 配置 / 审计`, and formal cognitive training runtime rendering.
- Visual guards now check no horizontal overflow at top/middle/bottom scroll positions, patient bottom-nav and primary action clearance, visible text clipping including hidden/clip ancestor containers, screen-grid/training-capture overlap, and patient/caregiver/doctor technical-copy leakage. The spec has a static guard banning `page.route(...fulfill)` and `route.fulfill`.
- Screenshot evidence is written by `captureVisualEvidence()` after creating `output/playwright`; current run produced `96` local screenshot files under `output/playwright/web-regression-*.png`, including per-role/per-project paths documented in `docs/web-playwright-regression-runbook.md`.
- Mobile doctor patient layout was fixed as real UI: `apps/web/src/features/doctor/PatientQueue.tsx` renders a compact card list on mobile and keeps the wider table only from `md` up; `apps/web/src/components/ui/Card.tsx` now uses `min-w-0` so nested content cannot force card overflow.
- Account-request browser coverage was hardened with client-ready gating in `apps/web/src/features/auth/AccountRequestPanel.tsx`, unique per-project request accounts, and `toHaveValue()` assertions before submitting the real registration request.

- [x] **Step 3: GREEN**

Run:

```bash
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/web-playwright-regression.spec.mjs
```

Evidence captured during execution:

- `node --test scripts/__tests__/web-playwright-visual-regression-boundary.test.mjs` passed with `3` tests and `0` failures.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/web-playwright-regression.spec.mjs --project=chromium-1280` passed with `6/6` tests.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/web-playwright-regression.spec.mjs --project=chromium-pixel --project=chromium-iphone` passed with `12/12` tests after the mobile doctor layout fix.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/web-playwright-regression.spec.mjs` passed with `30/30` tests across `chromium-1280`, `chromium-1366`, `chromium-1440`, `chromium-pixel`, and `chromium-iphone`.
- `pnpm --filter @rehab-platform/web lint` completed with exit `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` completed with exit `0`.

- [x] **Step 4: Review gate**

Dispatch visual and mobile-layout reviewers.

Review evidence captured during execution:

- Unit 7 spec reviewer confirmed role coverage, five Playwright projects, overflow/nav/text-clipping/technical-copy guards, no route-fulfill business simulation, screenshot evidence, and RED/GREEN source boundary coverage.
- Unit 7 code-quality reviewer initially rejected the implementation because text clipping ignored ancestor clipping, primary-action checks could silently downgrade, the static boundary was too shallow, screenshot directory creation was assumed, and hidden responsive layouts were not filtered. Those findings were addressed with stronger source guards, helper changes, and a real mobile doctor queue UI fix before the final browser GREEN run.
- Final retry reviewers were dispatched after the final `30/30` browser GREEN; the first retry attempt hit an external `504 Gateway Timeout`, so the review was re-dispatched with reduced context and this plan records that external-review transport failure separately from code/test status.
- Final Unit 7 spec reviewer approved the scoped evidence: four-role coverage, five Playwright projects, documented screenshot evidence, no overflow/text clipping/bottom-nav/technical-copy regressions, and no `page.route(...fulfill)` or mock/fallback business state.
- Final Unit 7 code-quality reviewer approved the helper and UI fixes: ancestor clipping with scrollable ancestor allowance, required patient CTA failure semantics, screenshot directory creation, hidden-layout filtering, mobile doctor queue card UI, and account-request client-ready/unique-account hardening.

### Unit 8: Full Regression And Evidence Docs

**Purpose:** Prove the rebuilt UI and business chain through all local source, type, API, verifier, browser, and evidence docs.

**Files:**

- Modify: `docs/customer-delivery-progress-and-input-summary.md`
- Modify: `docs/formal-delivery-acceptance-runbook.md`
- Modify: `docs/web-playwright-regression-runbook.md`
- Modify: `docs/customer-acceptance-criteria.md` only if verified behavior changes accepted wording.

- [x] **Step 1: Source and type regression**

Run:

```bash
node --test scripts/__tests__/*.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/lib/*.test.ts src/features/patient/*.test.ts src/features/doctor/*.test.ts src/features/caregiver/*.test.ts src/features/admin/*.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Evidence captured during execution:

- `node --test scripts/__tests__/*.test.mjs` completed with exit `0`: `452` tests, `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test 'src/lib/*.test.ts' 'src/features/patient/*.test.ts' 'src/features/doctor/*.test.ts' 'src/features/doctor/*.test.tsx' 'src/features/caregiver/*.test.ts' 'src/features/admin/*.test.ts' 'src/features/session/*.test.ts'` completed with exit `0`: `160` tests, `0` failures.
- `pnpm --filter @rehab-platform/web lint` completed with exit `0`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` completed with exit `0`.
- During Step 1, stale source-boundary tests were updated to point at current role-owned modules instead of old `app/page.tsx`/monolithic `role-workspace.tsx`; dynamic patient training titles were also hardened with `break-words` in `TodayTrainingPage`, `TrainingPrepChecklist`, and `TrainingTaskPicker`.

- [x] **Step 2: API and DB regression**

Run:

```bash
pnpm --filter @rehab-platform/api exec jest --runInBand
pnpm --filter @rehab-platform/db exec prisma validate
```

Evidence captured during execution:

- `pnpm infra:up` completed with exit `0`; Postgres and Redis containers were running.
- `pnpm db:migrate` completed with exit `1` and remains blocked by Prisma `Error: Schema engine error:` from `prisma migrate dev --name init`.
- `pnpm --filter @rehab-platform/db exec prisma migrate status` completed with exit `0`: `14 migrations found`; `Database schema is up to date!`.
- `pnpm db:seed` completed with exit `0`: `Seed completed. Local initialization accounts are ready.`
- `pnpm --filter @rehab-platform/api exec jest --runInBand` completed with exit `0`: `4` suites and `249` tests passed.
- `pnpm --filter @rehab-platform/api exec jest --config ./test/jest-e2e.json --runInBand --watchman=false` completed with exit `0`: `1` suite and `4` tests passed. The direct `test:e2e` wrapper was first blocked by Watchman state-file permissions; disabling Watchman did not alter business behavior.
- `pnpm --filter @rehab-platform/db exec prisma validate` completed with exit `0`: schema valid.

- [x] **Step 3: Formal verifier regression**

Run:

```bash
pnpm verify:contracts
pnpm verify:formal-acceptance-chain
pnpm verify:multi-condition-data-capture
pnpm verify:browser-pose-evidence
pnpm verify:browser-pose-field-acceptance
pnpm verify:unity-field-evidence
pnpm verify:unity-field-acceptance
pnpm verify:speech-transcript-evidence
pnpm verify:speech-transcript-acceptance
pnpm verify:ai-assessment-acceptance
pnpm verify:speech-ai-assessment-acceptance
pnpm verify:tts-speech-output-evidence
pnpm verify:tts-speech-output-acceptance
pnpm verify:customer-acceptance-package-manifest
pnpm delivery:check
```

If external credentials or devices are missing, record exact blocker and keep other checks running.

Evidence captured during execution:

- `pnpm verify:contracts` completed with exit `0` after starting the real local API; it verified local API writes, runtime constraints, authorization, revocation, review, desensitized export, and audit cleanup.
- `pnpm verify:unity-rhythm-reach-source` completed with exit `0`.
- `pnpm verify:unity-rhythm-reach-webgl-build` completed with exit `0`.
- `pnpm delivery:check` completed with exit `0`: `交付前检查通过。`
- Blocked without formal customer/site evidence: `verify:formal-acceptance-chain`, `verify:multi-condition-data-capture`, `verify:browser-pose-evidence`, `verify:browser-pose-field-acceptance`, `verify:unity-field-evidence`, `verify:unity-field-acceptance`, `verify:speech-transcript-evidence`, `verify:speech-transcript-acceptance`, `verify:ai-assessment-acceptance`, `verify:speech-ai-assessment-acceptance`, `verify:tts-speech-output-evidence`, `verify:tts-speech-output-acceptance`, and `verify:customer-acceptance-package-manifest`. Exact blocker text is recorded in `docs/formal-delivery-acceptance-runbook.md`.

- [x] **Step 4: Browser regression**

Run:

```bash
pnpm test:playwright
```

Evidence captured during execution:

- First sandbox run was blocked before tests by local service startup/port restrictions: API child process reported Prisma `P1001`, and direct Web dev bind reported `listen EPERM ::1:3000`.
- After clearing the stale 4000 listener and rerunning in an authorized environment, `pnpm test:playwright` completed with exit `0`: `35 passed (2.8m)`.
- The run covered `scripts/formal-ui-business-chain.spec.mjs` and `scripts/web-playwright-regression.spec.mjs` across `chromium-1280`, `chromium-1366`, `chromium-1440`, `chromium-pixel`, and `chromium-iphone`.
- Screenshot evidence: `96` files under `output/playwright/web-regression-*.png`; Playwright status: `output/playwright/test-results/.last-run.json` with `status: passed`.

- [x] **Step 5: Evidence docs**

Record exact command outputs, blockers, screenshot paths, no-fallback statement, and manual smoke URL.

Evidence captured during execution:

- Updated `docs/web-playwright-regression-runbook.md` with Unit 8 browser command evidence, screenshot paths, screenshot count, service-start blocker, and no-fallback statement.
- Updated `docs/formal-delivery-acceptance-runbook.md` with Unit 8 command table, formal verifier blocker table, Playwright evidence, and final IA manual-smoke role checklist wording.
- Updated `docs/customer-delivery-progress-and-input-summary.md` with Unit 1-8 progress summary, Unit 8 pass list, remaining formal evidence blockers, and no-fallback statement.
- Updated `docs/customer-acceptance-criteria.md` to require final-IA role entrance screenshot/smoke coverage rather than a vague per-role screenshot.
- Local manual smoke URLs for Unit 9 are recorded as `http://localhost:3000` for Web and `http://localhost:4000` for API; they are local regression URLs only, not customer production acceptance URLs.

- [x] **Step 6: Review gate**

Dispatch evidence-doc and regression reviewers.

Review evidence captured during execution:

- Unit 8 evidence-doc reviewer approved with no Critical or Important findings. Minor follow-up: `docs/web-playwright-regression-runbook.md` now expands concrete role screenshot paths instead of leaving the main role evidence as path templates.
- Unit 8 code-quality reviewer approved with no Critical or Important findings. Minor follow-up: `TrainingTaskPicker` now renders business purpose badges when `purpose:risk_assessment` or `purpose:intervention` exists even if no separate patient tag maps.
- Additional Unit 9 pre-review found caregiver summary API leaked internal training-chain identifiers to the caregiver client. That privacy gap was closed under Unit 9 before completion signoff; Unit 8 remains approved because the blocker was discovered as part of the Unit 9 source/business pre-review and is not being converted into Unit 8 pass evidence.

### Unit 9: Manual Product Smoke And Completion Audit

**Purpose:** Confirm the product manually before claiming the goal is complete.

**Files:**

- Modify this plan only for final evidence/checkmarks.
- Modify evidence docs only if manual smoke changes verified facts.

- [x] **Step 1: Start local app**

Run:

```bash
pnpm infra:up
pnpm db:seed
pnpm dev
```

Expected: API and Web start. If startup is blocked, record exact output. Do not fake services.

- Evidence captured 2026-06-11: `pnpm infra:up` and `pnpm db:seed` passed earlier in the Unit 8/9 local regression run. Initial sandboxed `pnpm dev` was blocked by local port permission (`listen EPERM 0.0.0.0:3000`); authorized `pnpm dev` started the real local app. Health checks passed with API `http://localhost:4000/health` and Web `http://localhost:3000` returning HTTP 200.

- [x] **Step 2: Patient smoke**

Verify `今日`, assessment-next-task if due, `训练`, preparation blockers, runtime, real result submit, `记录`, `我的`, no technical/demo text.

- Evidence captured 2026-06-11: manual browser smoke on `http://localhost:3000` with `patient001/253913` verified `今日 / 训练 / 记录 / 我的`, one visible next task, saved training records, profile/authorization page, and no patient technical/demo copy. Real Unity movement training start was blocked by the product's device/posture requirements (`请先完成摄像头设备检测，再开始训练。`); no mock camera or fixed result was used. Real result persistence remains covered by the formal same-ID cognitive browser chain in `scripts/formal-ui-business-chain.spec.mjs`.

- [x] **Step 3: Doctor smoke**

Verify `患者`, persisted `评估`/risk confirmation, `计划`, visible `准备`, `复核`, and no raw provider/audit/runtime copy in doctor primary flow.

- Evidence captured 2026-06-11: manual browser smoke with `doctor001/253913` verified `患者 / 评估 / 计划 / 准备 / 复核`, persisted doctor-confirmed risk state, current plan, visible preparation record, suspicious result review queue, and no raw provider/audit/runtime copy in the primary doctor flow. RED/GREEN follow-up: `scripts/__tests__/doctor-workbench-ia.test.mjs` first failed because `DataCollectionReviewPanel.tsx` rendered raw backend preparation names; after `doctorPreparationRuleLabel` / `doctorPreparationConditionLabel` mapping, the test passed. Screenshot: `output/manual-smoke/unit9-doctor-preparation.png`.

- [x] **Step 4: Caregiver smoke**

Verify `照护`, `进展`, `提醒`, `我的`, authorization empty/revoked states, desensitized progress after reload.

- Evidence captured 2026-06-11: manual browser smoke with `caregiver001/253913` verified `照护 / 进展 / 提醒 / 我的`, reload-stable authorized summary, desensitized patient name `李*`, refreshed progress, and no technical copy. A real unbound caregiver account `unit9_unbound_76141349` was created through the admin UI without patient binding; login was blocked before any workspace with `账号未绑定可用角色`, proving no cached patient progress was shown without authorization. Structured evidence: `output/manual-smoke/unit9-manual-smoke-evidence.json`; screenshot: `output/manual-smoke/unit9-caregiver-progress.png`.

- [x] **Step 5: Admin smoke**

Verify `账号`, `内容`, `配置`, permission-gated `审计`, reason-required export, audit log after export, and no mounted patient runtime actions.

- Evidence captured 2026-06-11: manual browser smoke with `admin/253913` verified `账号 / 内容 / 配置 / 审计`, reason-required export (`生成脱敏 CSV` disabled until reason was filled), real desensitized CSV export success, and UI audit query for `脱敏数据导出 / 数据导出 / 成功`. Visible export/audit text did not contain raw patient or caregiver phone numbers. Structured evidence: `output/manual-smoke/unit9-manual-smoke-evidence.json`; screenshot: `output/manual-smoke/unit9-admin-audit-export.png`.

- [x] **Step 6: Completion audit**

Before completion:

1. Re-read this plan.
2. Confirm every unit has RED evidence, GREEN evidence, and review evidence.
3. Re-run the final verification matrix.
4. Inspect source for forbidden fallback/mock/demo/fake behavior.
5. Inspect browser screenshots/state for simple premium UI, no overflow, no text clipping, and no bottom-nav overlap.
6. Confirm no required unit remains blocked or unverified.
7. Only then mark the active goal complete.

Evidence captured 2026-06-11 19:38 CST:

- Re-read this plan and confirmed Units 1-9 now have RED/GREEN/review/evidence entries or exact blockers recorded.
- RED/GREEN follow-up 1: `scripts/__tests__/latest-ui-master-plan-authority.test.mjs` failed first because `scripts/formal-ui-business-chain.spec.mjs` did not capture `trainingResult.createdAt` for the caregiver refresh assertion; after updating the formal chain to match caregiver progress by the actual saved result timestamp instead of requiring `sessionStatus === "completed"`, the test passed (`4/4`).
- RED/GREEN follow-up 2: `pnpm --filter @rehab-platform/api exec jest src/app.service.spec.ts --runInBand --watchman=false --runTestsByPath --testNamePattern "caregiver"` failed first because caregiver `currentPlan.items[0]` still serialized `id: "plan-item-id"`; after removing plan-item IDs from caregiver plan serialization and adding caregiver-specific web API types, the focused Jest run passed (`16` caregiver tests, `0` failures).
- Focused browser GREEN: `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280` passed (`1/1`).
- Final local service evidence: `pnpm infra:up` passed; `pnpm db:seed` passed; `pnpm db:migrate` remains a real Prisma `Schema engine error` blocker and is not marked passed.
- Final source regression: `node --test scripts/__tests__/*.test.mjs` passed (`453/453`).
- Final web feature regression: `pnpm --filter @rehab-platform/web exec tsx --test src/lib/*.test.ts src/features/patient/*.test.ts src/features/doctor/*.test.ts src/features/caregiver/*.test.ts src/features/admin/*.test.ts src/features/session/*.test.ts` passed (`159/159`; Node emitted only the existing module-type performance warning).
- Final web gates: `pnpm --filter @rehab-platform/web lint` passed; `pnpm --filter @rehab-platform/web exec tsc --noEmit` passed.
- Final API gates: `pnpm --filter @rehab-platform/api exec jest --runInBand --watchman=false` passed (`4` suites, `249` tests); `pnpm --filter @rehab-platform/api exec tsc --noEmit --pretty false` passed.
- Final DB and delivery gates: `pnpm --filter @rehab-platform/db exec prisma validate` passed; `pnpm verify:contracts` passed with real local API/DB writes and cleanup; `pnpm delivery:check` passed.
- Final browser regression: `pnpm test:playwright` passed (`35 passed (3.3m)`) across `chromium-1280`, `chromium-1366`, `chromium-1440`, `chromium-pixel`, and `chromium-iphone`.
- Formal customer/site verifier blockers were rerun and remain exact missing-input blockers: formal acceptance config JSON, multi-condition evidence JSON, Browser Pose evidence JSON, Unity evidence JSON, speech/TTS evidence/config JSONs, AI acceptance config JSON, and customer acceptance package manifest plus `--package-root`.
- No fallback/mock/demo/fake readiness/fake result/fake success/silent downgrade or `page.route(...fulfill)` was added. Missing customer configs, field evidence, device materials, and token references remain blockers instead of being bypassed.

## Verification Matrix

Minimum final commands:

```bash
node --test scripts/__tests__/*.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/lib/*.test.ts src/features/patient/*.test.ts src/features/doctor/*.test.ts src/features/caregiver/*.test.ts src/features/admin/*.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
pnpm --filter @rehab-platform/api exec jest --runInBand
pnpm --filter @rehab-platform/db exec prisma validate
pnpm verify:contracts
pnpm verify:formal-acceptance-chain
pnpm verify:multi-condition-data-capture
pnpm verify:browser-pose-evidence
pnpm verify:browser-pose-field-acceptance
pnpm verify:unity-field-evidence
pnpm verify:unity-field-acceptance
pnpm verify:speech-transcript-evidence
pnpm verify:speech-transcript-acceptance
pnpm verify:ai-assessment-acceptance
pnpm verify:speech-ai-assessment-acceptance
pnpm verify:tts-speech-output-evidence
pnpm verify:tts-speech-output-acceptance
pnpm verify:customer-acceptance-package-manifest
pnpm delivery:check
pnpm test:playwright
```

## Blocker Log

Record real blockers here during execution. Do not convert blockers into fallback behavior.

- 2026-06-10: Unit 2 Playwright follow-up was attempted after code/static verification. The real API took longer than the Playwright webServer timeout to compile/start, and sandboxed `curl` to `localhost:4000` could not prove health despite `lsof` showing a listener. Browser verification remains a Unit 6/7 task, not a reason to add mocks.

## Completion Criteria

Completion is impossible until every unit has RED, GREEN, review, and evidence.

The goal is complete only when:

- this file is the only active UI execution plan
- all units above are checked with evidence
- patient, doctor, caregiver, and admin IA match the final IA
- assessment/risk review persists through a real API and survives reload
- doctor preparation is created through the visible `准备` workspace
- training start/result/review uses real APIs and carries the same chain IDs
- caregiver progress is desensitized and refresh-visible
- export requires a reason, produces desensitized output, and writes audit evidence
- full source, type, API, verifier, Playwright, and manual smoke checks pass or have exact real blockers recorded
- no fallback/mock/demo/fake readiness/result/success/silent downgrade behavior was added
