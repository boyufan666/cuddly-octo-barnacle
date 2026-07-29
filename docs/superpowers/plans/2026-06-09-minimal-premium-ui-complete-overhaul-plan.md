# Minimal Premium UI Complete Overhaul Implementation Plan

> **Superseded by the 2026-06-10 master closure plan:** Continue all current UI closure execution from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. This file remains historical evidence for the 2026-06-09 reset, Unit 0/1 evidence, and source-discovery context.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Before each implementation unit, dispatch read-only subagents for independent source-boundary, visual-quality, and business-flow review. If subagent infrastructure errors, record the exact tool outage and do not count the subagent-review gate as satisfied until a later review succeeds.

**Goal:** Push over the current Web UI and rebuild it into a minimal, premium, business-first rehabilitation product while keeping the complete real chain from login, assessment, doctor risk review, plan, preparation, training, result submission, doctor review, caregiver visibility, governance, audit, and desensitized export.

**Architecture:** Keep the existing Next.js, NestJS, Prisma, API contracts, formal runtime adapters, seed data, and no-fallback business helpers. Rebuild the visible product around a restrained design system, thin role shell, and small role-owned workspaces; move `apps/web/src/features/session/role-workspace.tsx` to a strict orchestration-only boundary before role pages are rebuilt. Patient, caregiver, and doctor primary flows use business language only; admin/auditor pages expose governance and evidence details only inside focused permission-gated tasks.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, lucide-react, MediaPipe Tasks Vision, Phaser, Unity WebGL, NestJS, Prisma/PostgreSQL, node:test, tsx tests, Jest, Playwright.

---

## Decision Reset

The user decided on 2026-06-09 that the current UI still looked too ugly, busy, and technical. Previous checked work in this file and related UI plans remains useful engineering groundwork, but it is not the final visual/product target. As of 2026-06-10, this file is historical evidence for the reset and early overhaul work.

Current execution continues from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. This historical plan and older UI/design notes may be used only as evidence or source-discovery material; they must not override the 2026-06-10 master plan's visual denial line, business logic closure gate, information architecture, no-fallback policy, or verification gates.

This plan supersedes remaining UI execution from:

- `docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md`
- `docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md`
- `docs/superpowers/plans/2026-06-09-minimal-premium-ui-rebuild-plan.md`

Those files remain historical evidence. Implementation continues from the 2026-06-10 master closure plan.

## Review Corrections Applied

- `role-workspace.tsx` cleanup is moved forward to Unit 3, before patient/doctor/admin/caregiver rebuild work, because it is the highest-risk source of old UI and shared-state regressions.
- Assessment/risk review is a hard completion blocker. If there is no real persisted assessment/risk review path, the formal chain cannot be marked complete.
- Patient assessment is not a top-level tab, but it must be reachable as a `今日` next task and must end in a doctor-confirmation state.
- Admin/operator/auditor pages share top-level IA but must be permission-gated inside each workspace; auditor-only export/evidence controls cannot leak to ordinary operator views.
- Each unit below is an umbrella unit. Before editing code in any unit, the implementer must expand that unit into a 2-5 minute micro-plan in the active task log with exact files, exact test code, exact commands, expected RED, implementation slices, expected GREEN, and read-only review scopes.

## Current Source Findings

- `apps/web/src/features/session/role-workspace.tsx` still owns too many cross-role forms, action states, old helper components, and runtime/admin/doctor/patient wiring.
- `apps/web/src/components/ui/Card.tsx` and `apps/web/src/components/ui/Button.tsx` still make normal business surfaces feel like raised cards because shadows and strong font weights are default.
- `apps/web/src/components/layout/RoleShell.tsx`, `PatientTaskLayout.tsx`, `WorkbenchLayout.tsx`, and `GovernanceLayout.tsx` make every role feel like a dashboard.
- Patient pages still show preparation checklists, device state, runtime labels, score panels, trend explanations, and plan/game-library presentation that feel too demonstrative.
- Caregiver pages still feel like a metrics dashboard instead of an authorized family summary.
- Doctor pages still mix clinical plan confirmation with training preparation execution.
- Admin pages preserve real governance, but audit/export/quality evidence and runtime/content configuration are too dense for one screen.
- Playwright specs previously tolerated result submit failure wording in the formal UI chain; Unit 0 now forbids treating `训练结果提交失败` as success, and later Playwright units must keep that strict behavior in browser evidence.

## Product Thesis

Visual thesis: quiet clinical premium. Use off-white page surfaces, crisp ink, restrained teal, low-contrast lines, compact tables/lists/forms, and 8px or smaller radius. Default surfaces should be flat or lightly bordered, not raised. No marketing hero, decorative gradient, glass, bokeh, oversized cards, nested cards, or feature-showcase panels.

Content thesis: every screen answers one business question:

- Patient: what should I do now, what is blocking me, did my training save, and who can see my data?
- Doctor: which patient needs attention, what risk/assessment needs review, what plan/preparation should be issued, and what result needs review?
- Caregiver: what should I know today, what progress is visible, what should I watch, and what is my authorization scope?
- Admin/auditor: what account/content/config/audit/export operation needs action?

Customer direction:

- The platform supports future measurement of potential disease-risk signals.
- It supports multiple intervention/training plans.
- Games do not need to become complex; value comes from plan variety, intervention matching, and reliable data collection.
- Existing games remain available.
- Patient-facing game grouping remains `思维训练` and `运动训练`.
- Patient-facing purpose labels remain `风险评估辅助` and `干预训练`.
- `数据采集`, runtime readiness, audit evidence, raw payloads, and technical material stay internal/admin-facing only.

## Visual Denial Line

No business surface may use size, shadow, gradient, glass, or feature copy to compensate for unclear task flow. Patient, caregiver, and doctor primary pages must fail review if they look like a marketing hero, decorative dashboard, capability showcase, technical console, acceptance package browser, or large-card presentation. Visual hierarchy must come from task order, compact spacing, typography, low-contrast borders, and one obvious action.

The page must not be considered ready when it merely looks calmer. It must also remove unnecessary demo and technology content from the visible role flow. Admin/auditor governance pages may expose technical evidence only inside permission-gated tasks, and those pages still use restrained operational layouts rather than spectacle.

## Business Logic Closure Gate

A page is not complete until its real role action succeeds through the configured API and the returned persisted state is visible after reload. `训练结果提交失败` is a blocking failure, not an acceptable completion state, not a doctor-review input, and not evidence for caregiver progress or audit/export closure.

Every role unit must prove the relevant chain step with real state:

- Assessment next task ends in a persisted doctor-confirmation state.
- Doctor risk review, plan confirmation, preparation creation, and result review use their configured API paths.
- Patient training start and result submission use real session and result APIs.
- Caregiver progress reads only authorized desensitized saved state.
- Audit and export read/write only permissioned governance state with a required export reason.

## Non-Negotiable Boundaries

- Do not add fallback, mock, demo, local-only, browser-local, generated evidence, fixed-score, hand-filled runtime result, silent downgrade, auto-recovery, fake success, fake readiness, fake pass, or fake data behavior.
- If any fallback strategy looks necessary, stop that implementation unit and ask the user before adding it. The default action is to record the real blocker.
- Patient training preparation cannot create a replacement collection batch. It can only read formal preparation state.
- Training start must use real `api.startTrainingSession`.
- Training result submission must use real `api.submitTrainingResult`.
- Doctor training result review must use real `api.reviewTrainingResult`.
- Doctor plan confirmation must use real `api.confirmPlan`.
- Doctor preparation creation must use real `api.createCollectionBatch`.
- Assessment/risk review must persist through a real existing or newly implemented API path before the formal chain can be marked complete.
- AI/STT/TTS drafts or conversations cannot become formal assessment records without doctor review.
- Patient/caregiver/doctor primary flows must not show provider payloads, endpoint refs, runtime manifests, raw JSON, audit IDs, quality evidence internals, acceptance evidence, delivery scripts, implementation status, or engineering console language.
- Admin/auditor governance pages may show runtime readiness, quality evidence, audit, and export controls only inside permission-gated governance tasks.
- Public social square and wearable physiology collection remain out of scope unless customer governance/protocol requirements are confirmed.

## Final Information Architecture

Patient:

- `今日`: one next task, including assessment when due, one blocker if blocked, one primary CTA.
- `训练`: preparation, device/camera/posture checks when needed, formal training runtime, result confirmation.
- `记录`: recent saved results, doctor-safe feedback, simple trend only when backed by real records.
- `我的`: profile, consent, caregiver binding, visible scope.

Doctor:

- `患者`: assigned patient queue, selected patient summary, pending attention count.
- `评估`: MMSE/CDR/AD-8/AI/STT summary and persisted doctor risk confirmation.
- `计划`: plan recommendation, adjustment, confirmation.
- `准备`: formal training preparation creation for the selected current plan.
- `复核`: new/abnormal/low-quality training result review.

Caregiver:

- `照护`: authorized patient summary and today reminder.
- `进展`: desensitized trend and completed training summary.
- `提醒`: doctor precautions and attention items.
- `我的`: binding relation, authorization state, visible scope.

Admin/operator/auditor:

- `账号`: registration review, role activation, caregiver account creation.
- `内容`: cognitive/movement game content and plan-library release state.
- `配置`: runtime readiness, collection condition, collection protocol readiness.
- `审计`: audit search, quality evidence, reason-required desensitized export, each gated by permission.

## Real Business Chain To Preserve

1. Login through `api.login`; session restore through `api.me`.
2. Role context loads authorized patient, doctor, caregiver, admin, and auditor scopes.
3. Patient profile, consent, caregiver bindings, assessments, training records, rewards, AI conversations, and collection batches remain role-scoped.
4. Patient or clinician produces a real assessment record; AI/STT/TTS draft material remains draft until doctor review.
5. Doctor reviews assessment evidence and persists risk/assessment confirmation.
6. Admin/operator releases formal game content and collection protocols.
7. Doctor confirms/adjusts the current rehab plan.
8. Doctor or authorized staff creates ready training preparation/collection batch records.
9. Patient selects today's training and completes real readiness checks.
10. Runtime submits formal metrics through real result builders and `api.submitTrainingResult`.
11. Patient sees only saved results/history returned by real data.
12. Doctor reviews the training result.
13. Caregiver sees desensitized progress and reminders only.
14. Admin/auditor inspects audit and exports desensitized data with a required reason.

## Completion Gate For Every Unit

1. Use SuperPower skills before implementation: TDD for behavior changes, systematic debugging for failures, verification before completion before any success claim.
2. Dispatch read-only subagents before implementation when the unit touches visible UI, role boundaries, business flow, or tests.
3. Expand the unit into 2-5 minute micro-steps before edits.
4. Add or strengthen failing tests first.
5. Run the focused test and capture RED.
6. Implement the smallest complete real product change.
7. Run focused tests GREEN.
8. Run `pnpm --filter @rehab-platform/web lint` when web files change.
9. Run `pnpm --filter @rehab-platform/web exec tsc --noEmit` when TypeScript contracts change.
10. Run role/business behavior tests relevant to the unit.
11. Run desktop and mobile Playwright checks once a role flow becomes visible in browser.
12. Record exact blockers for unavailable Docker/Postgres/browser/external credentials. Do not add mocks or fallback routes.
13. Do not enter the next unit until the current unit is verified or has a real recorded blocker.

---

## Unit 0: Make This New Rebuild Plan Authoritative

**Purpose:** Reset the implementation target so old completed UI work does not pull the product back toward the current busy interface.

**Files:**

- Modify: `docs/superpowers/plans/2026-06-09-minimal-premium-ui-complete-overhaul-plan.md`
- Modify: `docs/superpowers/plans/2026-06-09-minimal-premium-ui-rebuild-plan.md`
- Modify: `docs/rehab-platform-ui-design-spec.md`
- Modify: `docs/rehab-platform-role-flows-and-pages.md`
- Modify: `docs/customer-acceptance-criteria.md`
- Modify: `scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs`

- [x] **Step 1: Add failing authority assertions**

Add assertions that require:

```js
assert.match(activePlan, /Push over the current Web UI/);
assert.match(activePlan, /minimal, premium, business-first rehabilitation product/);
assert.match(activePlan, /2026-06-10-minimal-premium-ui-master-closure-plan\.md/);
assert.match(activePlan, /historical evidence for the reset and early overhaul work/);
assert.match(activePlan, /Games do not need to become complex/);
assert.match(activePlan, /plan variety, intervention matching, and reliable data collection/);
assert.match(activePlan, /Assessment\/risk review is a hard completion blocker/);
assert.match(activePlan, /result submit failure wording in the formal UI chain; final UI closure must only accept real saved\/completed chain success/);
assert.match(customerAcceptance, /医师端最终入口为 `患者 -> 评估 -> 计划 -> 准备 -> 复核`/);
assert.match(roleFlows, /医师 \| `患者 -> 评估 -> 计划 -> 准备 -> 复核`/);
```

- [x] **Step 2: Run RED**

```bash
node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs
```

Expected: fail until this plan and linked docs name the new reset target and doctor `准备` IA.

Evidence captured during execution: `node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs` failed with 2 failures after adding stricter assertions because the plan did not yet contain `Visual Denial Line` and the UI design spec did not yet contain `视觉否决线`; the failure also exposed old design-spec wording such as welcome-page title, large-card form priority, and heavier patient shadows.

- [x] **Step 3: Synchronize docs**

Implementation slices:

1. Mark older June 09 rebuild plan as superseded for complete UI overhaul execution.
2. Update UI design spec with the product thesis: minimal premium over feature showcase.
3. Update role-flow docs with doctor `准备`, assessment as patient `今日` next task, and admin permission gating.
4. Update customer acceptance with simple games, multiple plans, intervention matching, risk measurement support, reliable data collection, and doctor `准备`.
5. State that technical/governance material belongs only to admin/auditor pages.

- [x] **Step 4: Run GREEN**

```bash
node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: plan/doc tests pass; lint exits 0 with no new errors.

Evidence captured during execution:

- `node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs` passed with `5` tests, `0` failures.
- `node --check scripts/formal-ui-business-chain.spec.mjs` exited `0`.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `13` existing warnings in `apps/web/src/features/session/role-workspace.tsx`; those warnings remain the known Unit 3 cleanup target.

- [x] **Review gate**

Dispatch:

- Plan authority reviewer: all old docs defer to this plan.
- Scope reviewer: no fallback/mock/demo/fake readiness/result language was introduced.

Review evidence captured during execution:

- Plan/scope subagent review `APPROVED`: confirmed this plan carries the user requirement to push over the UI, keep simple games with plan variety, retain `思维训练` / `运动训练`, bind start/result/review/plan/preparation to real APIs, and forbid fallback/mock/demo/fake success/readiness/result.
- UI-spec subagent review initially `NOT_APPROVED`: identified old wording in `docs/rehab-platform-ui-design-spec.md` around `温暖`, `Warm Clinical Calm`, welcome-page title, large-card/shadow language, and patient-card defaults.
- Test-boundary subagent review initially `NOT_APPROVED`: requested stronger assertions for authoritative plan, visual denial line, full business chain, result-submit failure strictness, no fallback/mock/demo/fake behavior, doctor `准备`, and patient assessment as `今日` next task.
- Final read-only subagent review `APPROVED`: confirmed old UI wording is covered or removed, authority points to this plan, result failure/pending-sync/pending-compensation cannot count as success, no fallback strategy was introduced, and the boundary test passes.

---

## Unit 1: Minimal Premium Design System Reset

**Purpose:** Remove the current raised-card/dashboard feel before rebuilding role pages.

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/ui/Button.tsx`
- Modify: `apps/web/src/components/ui/Card.tsx`
- Modify: `apps/web/src/components/ui/StatusBadge.tsx`
- Modify: `apps/web/src/components/ui/MetricTile.tsx`
- Modify: `apps/web/src/components/ui/PageHeader.tsx`
- Modify: `apps/web/src/components/ui/EmptyState.tsx`
- Modify: `scripts/__tests__/minimal-ui-design-system.test.mjs`
- Modify: `scripts/__tests__/global-ui-component-boundary.test.mjs`

- [x] **Step 1: Add failing visual-system assertions**

Add tests equivalent to:

```js
assert.match(globals, /--surface-page/);
assert.match(globals, /--radius-card:\s*8px/);
assert.match(globals, /--radius-control:\s*8px/);
assert.doesNotMatch(visibleSources, /rounded-xl|rounded-2xl|rounded-3xl|rounded-full/);
assert.doesNotMatch(visibleSources, /bg-gradient|linear-gradient|conic-gradient|backdrop-|blur-|bokeh|orb|glass/i);
assert.doesNotMatch(visibleSources, /shadow-xl|shadow-2xl|hover:-translate|text-5xl|text-6xl|text-7xl/);
assert.doesNotMatch(cardSource, /shadow-\[var\(--shadow-panel\)\]/);
assert.doesNotMatch(buttonSource, /shadow-\[var\(--shadow-panel\)\]/);
```

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail while heavy shadows, large typography, old decorative styles, or raised-card defaults remain.

Evidence captured during execution:

- After adding strict shared-primitive assertions, `node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs` failed with 2 expected failures: `button must not use the panel shadow as a default action style` and `card must be a flat bordered panel by default`.
- After adding dynamic text and fake-interaction assertions, the same command failed with the expected `assessment prompt heading must wrap long dynamic prompt text` failure before implementation.

- [x] **Step 3: Rebuild primitives**

Implementation slices:

1. Normalize semantic tokens: `--surface-*`, `--ink-*`, `--accent-*`, `--line-*`, `--radius-*`, `--shadow-*`.
2. Keep `--shadow-panel` only for overlays, menus, and bottom nav when necessary.
3. Make `Card` a flat bordered panel by default; no default shadow.
4. Make `Button` compact, stable, no default shadow, `type="button"`, `aria-busy`, focus-visible, and no text overflow.
5. Add or standardize simple `Field`, `ListRow`, `Section`, or equivalent primitives when repeated Tailwind blocks remain.
6. Preserve public component APIs unless the focused test proves the old API is harmful.

- [x] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

Evidence captured during execution:

- `Button.tsx` no longer applies `shadow-[var(--shadow-panel)]` to primary or danger buttons by default.
- `Card.tsx` no longer applies `shadow-[var(--shadow-panel)]` to `patient`, `workbench`, or `governance` tones by default.
- `MetricTile.tsx` label/helper and `EmptyState.tsx` title/description now use `break-words`.
- `AssessmentDialoguePage.tsx` dynamic prompt uses `break-words` and `md:text-4xl`; unbound physical-condition checkboxes were converted to non-interactive `aria-hidden` visual markers.
- Legacy dynamic text in `role-workspace.tsx` now wraps safely, and the scoped `hover:-translate` / `text-5xl` visual debt was removed.
- `node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs` passed with `12` tests, `0` failures.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `13` existing warnings in `apps/web/src/features/session/role-workspace.tsx`; those warnings remain the known Unit 3 cleanup target.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.

- [x] **Review gate**

Dispatch design-system and accessibility reviewers for tokens, component APIs, text wrapping, focus state, and no fallback behavior.

Review evidence captured during execution:

- Unit 1 design-system reviewer `APPROVED`: confirmed `Button` and `Card` no longer default to `shadow-panel`, tests cover compact radius, large-radius bans, decorative visual bans, `text-5xl+`, and `hover:-translate`, and no fallback/mock/demo/fake behavior was added.
- Unit 1 code-quality reviewer initially `NOT_APPROVED`: identified dynamic text overflow risks in `AssessmentDialoguePage.tsx` and legacy `role-workspace.tsx`, plus unbound physical-condition checkboxes.
- Unit 1 code-quality re-review `APPROVED`: confirmed dynamic prompt/text wrapping was added, unbound checkboxes were replaced with non-interactive markers, `hover:-translate` / `text-5xl` were removed, and the new focused tests cover these points.

---

## Unit 2: Quiet Login And Thin Role Shell

**Purpose:** Make the first experience and role navigation feel like a product, not a demo or technical console.

**Files:**

- Modify: `apps/web/src/features/auth/LoginPanel.tsx`
- Modify: `apps/web/src/features/auth/AccountRequestPanel.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/components/layout/RoleShell.tsx`
- Modify: `apps/web/src/components/layout/PatientTaskLayout.tsx`
- Modify: `apps/web/src/components/layout/WorkbenchLayout.tsx`
- Modify: `apps/web/src/components/layout/GovernanceLayout.tsx`
- Modify: `apps/web/src/features/session/role-navigation.ts`
- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Modify: `scripts/__tests__/minimal-auth-entry.test.mjs`
- Modify: `scripts/__tests__/role-first-shell-navigation.test.mjs`

- [ ] **Step 1: Add failing shell assertions**

Add tests equivalent to:

```js
assert.doesNotMatch(loginSource, /hero|能力展示|功能演示|技术验收|demo|mock|runtime|manifest|Provider|Endpoint/i);
assert.match(loginSource, /机构账号登录/);
assert.match(loginSource, /进入工作台/);
assert.doesNotMatch(roleShellSource, /uppercase|section\.description|headerMeta\.subtitle/);
assert.match(roleShellSource, /data-testid="app-nav"/);
assert.match(roleShellSource, /data-testid="patient-task-nav"/);
assert.doesNotMatch(layoutSources, /md:grid-cols-4|2xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/minimal-auth-entry.test.mjs \
  scripts/__tests__/role-first-shell-navigation.test.mjs
```

Expected: fail while login/shell still expose old decorative structure, role descriptions, or dashboard layouts.

- [ ] **Step 3: Rebuild shell**

Implementation slices:

1. Login page becomes compact institution account form plus account request entry.
2. Remove feature list, technical delivery copy, test/demo account copy, provider/runtime words, and hero pitch.
3. Role shell header shows role, current scope name, and logout only.
4. Navigation labels are short; no visible nav descriptions.
5. Patient/caregiver bottom nav is safe-area-aware and visually lighter.
6. Doctor/admin shell uses compact tabs or rail navigation, not a card grid.
7. Preserve real `api.login`, `api.me`, registration-request submission, session restore, and logout behavior.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/minimal-auth-entry.test.mjs \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch auth/shell and visual reviewers for real callbacks, accessibility labels, mobile nav, and no technical/demo copy.

---

## Unit 3: Session Orchestration And Old UI Cleanup

**Purpose:** Move `role-workspace.tsx` to an orchestration-only boundary before role pages are rebuilt.

**Files:**

- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Modify: `apps/web/src/features/session/action-status.ts`
- Modify: `apps/web/src/features/session/useRoleData.ts`
- Modify: `apps/web/src/features/session/useRoleSession.ts`
- Modify: `apps/web/src/features/session/role-navigation.ts`
- Create focused modules only when extracting real UI from `role-workspace.tsx`.
- Modify: `scripts/__tests__/global-ui-component-boundary.test.mjs`
- Modify: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`

- [ ] **Step 1: Add failing orchestration assertions**

Add tests equivalent to:

```js
assert.ok(roleWorkspaceSource.split("\n").length < 3000);
assert.doesNotMatch(roleWorkspaceSource, /function SurfacePanel|function MissingDataCard|function Waveform|function Ring|function Badge|function Chip/);
assert.doesNotMatch(roleWorkspaceSource, /text-5xl|text-4xl|font-black|shadow-\[|rounded-xl|rounded-2xl|hover:-translate/);
assert.doesNotMatch(roleWorkspaceSource, /function .*Screen\(/);
assert.match(roleWorkspaceSource, /useRoleSession/);
assert.match(roleWorkspaceSource, /useRoleData/);
assert.match(roleWorkspaceSource, /startTrainingSession/);
assert.match(roleWorkspaceSource, /submitTrainingResult/);
assert.match(roleWorkspaceSource, /confirmDoctorPlan/);
assert.match(roleWorkspaceSource, /createDoctorCollectionBatch/);
assert.match(roleWorkspaceSource, /reviewTrainingResult/);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/global-ui-component-boundary.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: fail until `role-workspace.tsx` stops owning old UI presentation.

- [ ] **Step 3: Extract and clean**

Implementation slices:

1. Keep session, active role/nav, selected patient, action state, real API actions, and reload orchestration in `role-workspace.tsx`.
2. Move remaining local screen/component/panel primitives into feature modules or shared primitives.
3. Remove unused state, stale imports, old helper components, and old style classes after each extraction.
4. Keep real API ordering: validation, set busy status, call API, reload data, clear busy.
5. Add English logs only on real failure paths where they improve debugging, for example `console.error("[training] submit result failed", error);`.
6. Do not swallow errors or turn failures into success.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/global-ui-component-boundary.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/admin-governance-ia.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch source-boundary and code-quality reviewers for line-count reduction, no stale UI primitives, and unchanged API semantics.

---

## Unit 4: Patient Assessment, Today, And Training Preparation

**Purpose:** Make assessment and training entry obvious: one next task, one blocker, one next action.

**Files:**

- Modify: `apps/web/src/features/patient/AssessmentDialoguePage.tsx`
- Modify: `apps/web/src/features/patient/PatientWorkspacePage.tsx`
- Modify: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/patient-readiness-orchestration.ts`
- Create: `apps/web/src/features/patient/patient-readiness-orchestration.test.ts`
- Modify: `apps/web/src/lib/formal-training-content-readiness.ts`
- Modify: `scripts/__tests__/patient-training-flow-ia.test.mjs`
- Modify: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Modify: `scripts/__tests__/speech-ai-assessment-ui.test.mjs`

- [ ] **Step 1: Add failing patient-task and assessment assertions**

Add tests equivalent to:

```js
assert.match(todaySource, /data-testid="patient-next-action"/);
assert.match(todaySource, /评估|训练/);
assert.doesNotMatch(todaySource, /MetricTile|积分|成就|能力展示|方案游戏库/);
assert.doesNotMatch(prepSource, /4\/4|准备度|硬件|检测时间|qualityGate|collectionBatchId|protocolVersion/i);
assert.doesNotMatch(assessmentSource, /Provider|Endpoint|modelVersion|callId|promptVersion|rawPayload|payload/i);
assert.match(assessmentSource, /医生确认|待医生确认/);
```

Create `patient-readiness-orchestration.test.ts` with concrete cases:

```ts
test("findReadyCollectionBatch rejects a ready batch for another patient", () => {
  const result = findReadyCollectionBatch([readyBatch({ patientId: "other" })], [activeProtocol()], "patient-1", "plan-1", planItem());
  assert.equal(result, undefined);
});

test("resolveNextPlanItem skips today's completed sessions", () => {
  const result = resolveNextPlanItem(planWithTwoItems(), recordsWithCompletedFirstItemToday());
  assert.equal(result?.id, "plan-item-2");
});
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/lib/training-start-readiness.test.ts \
  src/features/patient/patient-readiness-orchestration.test.ts
```

Expected: fail until patient assessment/today/prep pages and readiness tests match the simplified task flow.

- [ ] **Step 3: Rebuild assessment/today/prep**

Implementation slices:

1. Let `今日` select between assessment-due and training-due tasks.
2. Assessment task shows single input/review flow and ends in doctor-confirmation state.
3. Today training shows current patient greeting, selected/next task, real blocker if blocked, and one primary action.
4. Task list is simple; no game showcase, runtime details, or technical metadata.
5. Preparation shows only the current required action: sync preparation, camera permission/check, posture check, or start.
6. Preserve real `resolveNextPlanItem`, `findReadyCollectionBatch`, `checkCameraReadiness`, `mergePoseReadiness`, `isGameReadyForTraining`, and `api.startTrainingSession`.
7. If content/preparation/camera/pose is not ready, show a truthful blocker and do not start.
8. Do not create replacement collection batches from patient UI.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/lib/training-start-readiness.test.ts \
  src/features/patient/patient-readiness-orchestration.test.ts \
  src/lib/ai-assessment-draft.test.ts \
  src/lib/assessment-speech-transcript.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch patient-flow, assessment-boundary, and business-chain reviewers for no fake readiness, no fake assessment completion, no patient batch creation, and no technical copy leakage.

---

## Unit 5: Patient Runtime, Result, Records, And Profile

**Purpose:** Keep real training runtimes, but simplify what patients see before and after training.

**Files:**

- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/features/patient/GameLibraryPage.tsx`
- Modify: `apps/web/src/features/patient/PatientProfilePage.tsx`
- Modify: `apps/web/src/features/patient/patient-training-actions.ts`
- Create: `apps/web/src/features/patient/patient-training-actions.test.ts`
- Modify: `apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/CognitiveTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/UnityTrainingSurface.tsx`
- Modify: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`
- Modify: `scripts/__tests__/patient-facing-game-library-boundary.test.mjs`
- Modify: `scripts/__tests__/training-capture-layout.test.mjs`

- [ ] **Step 1: Add failing runtime/result assertions**

Add tests equivalent to:

```js
assert.doesNotMatch(runtimeVisibleSources, /Unity|WebGL|canvas|manifest|bridge|runtimeType|motionMetrics|rawPayload|debug|adapter/i);
assert.match(runtimePageSource, /data-testid="patient-training-primary-action"/);
assert.doesNotMatch(resultSource, /GameLibraryPage|方案游戏库|第一条记录|假趋势|mock|demo|fallback/i);
assert.match(profileSource, /caregiver_sharing/);
```

Create `patient-training-actions.test.ts` with concrete cases:

```ts
test("buildTrainingResultPayload rejects missing metrics summary", () => {
  assert.throws(() => buildTrainingResultPayload(validForm({ metricsSummary: "" }), "browser_pose_canvas", "batch-1"), /训练结果信息不完整/);
});

test("buildTrainingResultPayload keeps collection batch and runtime source aligned", () => {
  const payload = buildTrainingResultPayload(validForm(), "browser_pose_canvas", "batch-1");
  assert.equal(payload.collectionBatchId, "batch-1");
  assert.equal(payload.source, "browser_pose_canvas");
});
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/patient/patient-training-actions.test.ts \
  src/lib/browser-pose-training-result.test.ts \
  src/lib/cognitive-web-training-result.test.ts \
  src/lib/unity-training-bridge.test.ts
```

Expected: fail until runtime/result/profile pages are patient-safe and result builders are fully tested.

- [ ] **Step 3: Rebuild runtime/result/profile**

Implementation slices:

1. Runtime page shows simple states: preparing, training, result ready, save result, blocked.
2. Keep real `renderTrainingStage`, `onResultReady`, runtime cleanup, Unity manifest validation, origin checks, BrowserPose detection, Cognitive payload builder, and `submitTrainingResult`.
3. Result page shows only real latest saved results and doctor-safe status.
4. If no result exists, show empty state, not a trend.
5. Remove patient result page embedded game library.
6. Patient can see `思维训练` / `运动训练` only where it helps task selection.
7. Profile page keeps profile, consent, caregiver binding, revoke actions, and visible scope.
8. Do not display raw metrics JSON or internal runtime identifiers in patient-visible UI.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/patient/patient-training-actions.test.ts \
  src/lib/browser-pose-training-result.test.ts \
  src/lib/cognitive-web-training-result.test.ts \
  src/lib/unity-training-bridge.test.ts \
  src/lib/unity-runtime-bridge.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch runtime and patient-result reviewers for no fake result, no technical copy, no runtime regressions, and real payload validation.

---

## Unit 6: Caregiver Workspace Rebuild

**Purpose:** Make caregiver pages calm, sparse, authorized, and clearly non-clinical.

**Files:**

- Modify: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverProgressPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverReminderPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverScopePanel.tsx`
- Modify: `apps/web/src/features/caregiver/caregiver-workspace-model.ts`
- Modify: `apps/web/src/features/caregiver/caregiver-workspace-model.test.ts`
- Modify: `apps/web/src/features/session/role-navigation.ts`
- Modify: `scripts/__tests__/care-circle-privacy.test.mjs`
- Modify: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`

- [ ] **Step 1: Add failing caregiver assertions**

Add tests equivalent to:

```js
assert.match(caregiverWorkspaceSource, /activeSection/);
assert.doesNotMatch(caregiverSources, /MetricTile|平均得分|审计|导出|provider|runtime|manifest|rawPayload|质量证据|fallback|mock|demo/i);
assert.match(caregiverSources, /照护/);
assert.match(caregiverSources, /进展/);
assert.match(caregiverSources, /提醒/);
assert.match(caregiverSources, /我的/);
```

Strengthen model tests:

```ts
test("caregiver model hides data when authorization summary is absent", () => {
  const model = buildCaregiverWorkspaceModel(undefined, undefined);
  assert.equal(model.hasSummary, false);
  assert.deepEqual(model.recentTraining, []);
});

test("caregiver model only exposes published precautions and visible notes", () => {
  const model = buildCaregiverWorkspaceModel(summary(), circleWithDraftAndHiddenItems());
  assert.equal(model.reminders.every((item) => item.status === "published"), true);
  assert.equal(model.notes.every((item) => item.moderationStatus === "visible"), true);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/caregiver/caregiver-workspace-model.test.ts
```

Expected: fail until caregiver UI removes dashboard-like metrics and preserves authorization filters.

- [ ] **Step 3: Rebuild caregiver pages**

Implementation slices:

1. `照护` shows authorized patient summary and today reminder only.
2. `进展` shows desensitized completed-training summary; no raw clinical detail.
3. `提醒` shows published doctor precautions and visible household notes.
4. `我的` shows relation, authorization, and visible scope.
5. Model keeps published/visible filters, fixed limits, explicit missing-state labels, and unauthorized empty state.
6. Do not read full patient records from caregiver UI.
7. Do not show cached history after authorization is absent or revoked.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/caregiver/caregiver-workspace-model.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch caregiver privacy and visual reviewers for desensitization, sparse UI, and no fake/technical content.

---

## Unit 7: Doctor Clinical Workspaces Rebuild

**Purpose:** Make doctor pages focused clinical tools with real assessment/risk confirmation, plan, preparation, and review actions.

**Files:**

- Modify: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Modify: `apps/web/src/features/doctor/PatientQueue.tsx`
- Modify: `apps/web/src/features/doctor/PatientClinicalSummary.tsx`
- Modify: `apps/web/src/features/doctor/AssessmentReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/PlanEditor.tsx`
- Modify: `apps/web/src/features/doctor/DataCollectionReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/TrainingReviewQueue.tsx`
- Modify: `apps/web/src/features/doctor/doctor-workbench-actions.ts`
- Modify: `apps/web/src/features/doctor/doctor-workbench-model.ts`
- Create: `apps/web/src/features/doctor/doctor-workbench-actions.test.ts`
- Modify: `apps/web/src/features/doctor/doctor-workbench-model.test.ts`
- Modify: `apps/web/src/features/session/role-navigation.ts`
- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Modify: `scripts/__tests__/doctor-workbench-ia.test.mjs`

- [ ] **Step 1: Add failing doctor assertions**

Add tests equivalent to:

```js
for (const workspace of ["patients", "assessment", "plan", "preparation", "review"]) {
  assert.match(doctorWorkspaceSource, new RegExp(`"${workspace}"`));
}
assert.doesNotMatch(doctorSources, /Unity|WebGL|JSON|设备哈希|loader|Canvas|manifest|Provider|Endpoint|rawPayload|auditId|fallback|mock|demo/i);
assert.match(doctorSources, /医生确认|风险确认|评估复核/);
```

Create action tests:

```ts
test("buildDoctorCollectionBatchPayload rejects missing current plan", () => {
  assert.throws(() => buildDoctorCollectionBatchPayload(collectionForm(), patient(), null), /没有生效康复方案/);
});

test("buildDoctorTrainingReviewPayload requires review note", () => {
  assert.throws(() => buildDoctorTrainingReviewPayload({ resultId: "r1", reviewConclusion: "accepted_valid", reviewNote: "" }), /复核说明不能为空/);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test scripts/__tests__/doctor-workbench-ia.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/doctor/doctor-workbench-actions.test.ts \
  src/features/doctor/doctor-workbench-model.test.ts \
  src/lib/ai-assessment-draft.test.ts
```

Expected: fail until doctor IA, helper tests, and technical-copy boundaries match the rebuild.

- [ ] **Step 3: Rebuild doctor workspaces**

Implementation slices:

1. `患者`: queue, selected summary, pending attention, no technical evidence.
2. `评估`: assessment records and persisted doctor risk/assessment conclusion. If the real API path is absent, stop the unit with a blocker; do not mark UI complete.
3. `计划`: plan adjustment and `api.confirmPlan` only.
4. `准备`: create formal collection/training preparation via `api.createCollectionBatch` only.
5. `复核`: review real training results through `api.reviewTrainingResult`.
6. Payload builders throw before API calls when plan/protocol/result/conclusion is missing.
7. Use compact list/form layout, no explanatory hero or dense dashboard.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/doctor/doctor-workbench-actions.test.ts \
  src/features/doctor/doctor-workbench-model.test.ts \
  src/lib/ai-assessment-draft.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch doctor clinical-flow and action-builder reviewers for real API behavior, doctor role scope, persisted assessment/risk confirmation, and no technical/governance leakage.

---

## Unit 8: Admin Governance Rebuild

**Purpose:** Keep admin capability real while turning governance into focused permission-gated operational tasks.

**Files:**

- Modify: `apps/web/src/features/admin/AdminOverviewPage.tsx`
- Modify: `apps/web/src/features/admin/AccountReviewPanel.tsx`
- Modify: `apps/web/src/features/admin/TrainingContentGovernance.tsx`
- Modify: `apps/web/src/features/admin/OperationConfigPanel.tsx`
- Modify: `apps/web/src/features/admin/CollectionConditionGovernance.tsx`
- Modify: `apps/web/src/features/admin/StatisticsQueryPanel.tsx`
- Modify: `apps/web/src/features/admin/DesensitizedExportPanel.tsx`
- Modify: `apps/web/src/features/admin/SecurityAuditPage.tsx`
- Modify: `apps/web/src/features/admin/TrainingQualityEvidenceSection.tsx`
- Modify: `apps/web/src/features/admin/admin-payload-builders.ts`
- Create: `apps/web/src/features/admin/admin-payload-builders.test.ts`
- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Modify: `scripts/__tests__/admin-governance-ia.test.mjs`
- Modify: `scripts/__tests__/registration-request-ui.test.mjs`
- Modify: `scripts/__tests__/collection-condition-ui.test.mjs`

- [ ] **Step 1: Add failing admin assertions**

Add tests equivalent to:

```js
for (const workspace of ["accounts", "content", "config", "audit"]) {
  assert.match(adminOverviewSource, new RegExp(`"${workspace}"`));
}
assert.doesNotMatch(adminOverviewSource, /TrainingRuntimePage|BrowserPoseTrainingSurface|UnityTrainingSurface|完成本次训练|fallback|mock|demo/i);
assert.doesNotMatch(accountsSlice, /TrainingContentGovernance|CollectionConditionGovernance|SecurityAuditPage|TrainingQualityEvidenceSection/);
assert.match(auditSlice, /canExportData|canReadAuditLogs|canManageQualityEvidence/);
```

Create payload tests:

```ts
test("buildDataExportPayload requires reason", () => {
  assert.throws(() => buildDataExportPayload(exportForm({ reason: "" })), /导出原因/);
});

test("buildUnityBuildPayload rejects release without production build data", () => {
  assert.throws(() => buildUnityBuildPayload(unityForm({ buildStatus: "released", releaseChannel: "development" }), true), /production|正式/);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/registration-request-ui.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/admin/admin-payload-builders.test.ts
```

Expected: fail until admin workspace, permission gates, payload-builder tests, and governance boundaries match the rebuild.

- [ ] **Step 3: Rebuild admin pages**

Implementation slices:

1. `账号`: registration review, role activation, caregiver account creation.
2. `内容`: training content list, simple release state, plan library availability; JSON/runtime detail behind deliberate admin-only detail sections.
3. `配置`: runtime readiness summary, collection condition, collection protocol forms.
4. `审计`: audit search, statistics, desensitized export, training quality evidence as focused subflows.
5. Gate audit/export/quality evidence by actual permission flags. Auditor-only controls must not appear for operator-only users.
6. Do not mount patient runtime components or training actions in admin pages.
7. Preserve all real admin action APIs.
8. Export reason remains required; failed/denied audit logs never count as pass.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/registration-request-ui.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/delivery-readiness.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/features/admin/admin-payload-builders.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: tests, lint, and typecheck pass.

- [ ] **Review gate**

Dispatch admin-governance and security/audit reviewers for focused pages, real API actions, permission gates, reason-required export, and no fake evidence.

---

## Unit 9: Playwright Visual And Flow Regression

**Purpose:** Verify the rebuilt UI in a real browser at desktop and mobile sizes.

**Files:**

- Modify: `scripts/web-playwright-regression.spec.mjs`
- Modify: `scripts/formal-ui-business-chain.spec.mjs`
- Modify: `scripts/playwright-regression.config.mjs`
- Modify: `docs/web-playwright-regression-runbook.md`

- [ ] **Step 1: Add failing browser assertions**

Use these real local accounts after `pnpm db:seed`:

- `admin` / `253913`
- `doctor001` / `253913`
- `patient001` / `253913`
- `caregiver001` / `253913`

Add assertions equivalent to:

```js
await expect(page.getByTestId("patient-task-nav")).toBeVisible();
await expect(page.getByTestId("patient-next-action")).toBeVisible();
await expect(page.getByText(/Provider|Endpoint|manifest|runtime|Unity|WebGL|canvas|demo|mock|fallback/i)).toHaveCount(0);
expect(await hasHorizontalOverflow(page)).toBe(false);
expect(await primaryActionCoveredByNav(page)).toBe(false);
expect(await countFirstViewportPanels(page)).toBeLessThanOrEqual(2);
```

Also verify:

- Login page contains no demo/technical copy.
- Patient `今日 -> 训练 -> 记录 -> 我的` works.
- Doctor `患者 -> 评估 -> 计划 -> 准备 -> 复核` works.
- Caregiver `照护 -> 进展 -> 提醒 -> 我的` works.
- Admin `账号 -> 内容 -> 配置 -> 审计` works.
- At least one cognitive runtime entry and one pose/Unity runtime entry remain reachable without fake results.
- Screenshots are captured for 1280, 1366, 1440, Pixel, and iPhone projects.
- `formal-ui-business-chain.spec.mjs` does not accept `训练结果提交失败` as success.

- [ ] **Step 2: Run RED**

```bash
pnpm exec playwright test --config scripts/playwright-regression.config.mjs --list
pnpm exec playwright test --config scripts/playwright-regression.config.mjs --project chromium-1280
```

Expected: fail until Playwright specs and UI behavior match the new IA. If local services or database are unavailable, record the exact environment blocker; do not add mocks.

- [ ] **Step 3: Rewrite Playwright specs**

Implementation slices:

1. Use real API on `localhost:4000` and web on `localhost:3000` from the Playwright config.
2. Avoid test-only UI shortcuts.
3. Cover top/middle/bottom scroll positions.
4. Check no overlap, no horizontal overflow, button text containment, and patient/caregiver/doctor no-technical-copy.
5. Keep admin technical copy checks scoped to governance pages.
6. Use screenshot artifacts for login and all role primary workspaces.
7. Formal chain must run or verify: login, assessment record, doctor assessment/risk review, plan confirmation, preparation creation, training start, saved result, doctor result review, caregiver summary, audit/export.
8. If any real dependency is missing, stop with an exact blocker.

- [ ] **Step 4: Run GREEN**

```bash
pnpm exec playwright test --config scripts/playwright-regression.config.mjs
```

Expected: Playwright suite passes, or a real external environment blocker is recorded with exact command output.

- [ ] **Review gate**

Dispatch Playwright and visual reviewers for specs, screenshots, no-overflow assertions, assessment/risk chain strictness, and real result-chain strictness.

---

## Unit 10: Full Business Regression

**Purpose:** Prove the UI rebuild did not break the formal business chain.

**Files:**

- Modify only if a test exposes a real regression:
  - `apps/api/src/app.service.ts`
  - `apps/api/src/app.controller.ts`
  - `apps/web/src/lib/api.ts`
  - `apps/web/src/types/api.ts`
  - `packages/db/prisma/seed.ts`
  - relevant verification scripts
- Update: `docs/customer-delivery-progress-and-input-summary.md`
- Update: `docs/formal-delivery-acceptance-runbook.md`

- [ ] **Step 1: Run source and UI suites**

```bash
node --test scripts/__tests__/*.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/lib/*.test.ts \
  src/features/patient/*.test.ts \
  src/features/doctor/*.test.ts \
  src/features/caregiver/*.test.ts \
  src/features/admin/*.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass. Any failure must be debugged with `superpowers:systematic-debugging`.

- [ ] **Step 2: Run API and DB suites**

```bash
pnpm --filter @rehab-platform/api exec jest --runInBand
pnpm --filter @rehab-platform/db exec prisma validate
```

Expected: pass.

- [ ] **Step 3: Run formal verification commands**

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

Expected: pass where local prerequisites exist. If a command requires unavailable external credentials or services, record the exact blocker and do not add fallback/mocks.

- [ ] **Step 4: Run seed idempotency when database is available**

```bash
pnpm infra:up
pnpm db:seed
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
```

Expected: pass. If Docker/PostgreSQL is unavailable, record the exact environment blocker and continue other non-blocked verification.

- [ ] **Review gate**

Dispatch regression reviewers for source tests, API tests, verifier commands, and exact blocker/evidence logs.

---

## Unit 11: Evidence Docs And Runbook Closure

**Purpose:** Keep execution evidence outside the plan except for final checkbox/evidence updates.

**Files:**

- Modify: `docs/customer-delivery-progress-and-input-summary.md`
- Modify: `docs/formal-delivery-acceptance-runbook.md`
- Modify: `docs/web-playwright-regression-runbook.md`
- Modify: `docs/customer-acceptance-criteria.md` only if final verified behavior changes acceptance wording.

- [ ] **Step 1: Add failing docs assertions**

Strengthen source/docs tests so evidence docs must include:

```js
assert.match(progressDoc, /No fallback\/mock\/demo\/fake readiness\/result behavior was added/);
assert.match(progressDoc, /Playwright screenshot artifacts/);
assert.match(runbook, /assessment.*risk.*plan.*preparation.*training.*review/i);
assert.doesNotMatch(runbook, /训练结果提交失败.*通过/);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/delivery-readiness.test.mjs
```

Expected: fail until runbooks and evidence docs reflect final verification.

- [ ] **Step 3: Update evidence docs**

Record:

- exact commands run
- pass/fail result
- real blockers
- no-fallback statement
- Playwright screenshot artifact paths
- manual smoke URL if a dev server is started

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/delivery-readiness.test.mjs
```

Expected: docs checks pass.

- [ ] **Review gate**

Dispatch evidence-doc reviewer for command accuracy, blocker accuracy, and no unsupported completion claims.

---

## Unit 12: Manual Product Smoke And Completion Audit

**Purpose:** Let the user and agent verify the rebuilt UI as a product, not just source text.

**Files:**

- Modify: this plan only for final checkbox/evidence lines after all verification passes.
- Modify evidence docs if manual smoke reveals a real blocker.

- [ ] **Step 1: Start local app**

```bash
pnpm infra:up
pnpm db:seed
pnpm dev
```

Expected: API and Web start successfully. If infrastructure is unavailable, record the exact blocker. Do not create fake data or fake services.

- [ ] **Step 2: Manual patient smoke**

Verify login, `今日`, assessment-next-task if due, `训练`, real preparation blockers, real runtime, result submit through API, `记录`, `我的`, and no technical/demo text.

- [ ] **Step 3: Manual doctor smoke**

Verify `患者`, persisted `评估`/risk confirmation, `计划` via real API, `准备` via real `api.createCollectionBatch`, `复核` via real API, and no provider/raw/audit id copy in doctor primary flow.

- [ ] **Step 4: Manual caregiver smoke**

Verify `照护`, `进展`, `提醒`, `我的`, authorization empty state, revoked/no-authorization empty state, and no clinical raw data or audit/export wording.

- [ ] **Step 5: Manual admin smoke**

Verify `账号`, `内容`, `配置`, permission-gated `审计`, reason-required export, quality evidence permissions, and no mounted patient runtime actions.

- [ ] **Step 6: Completion audit**

Before claiming completion:

1. Re-read this plan.
2. Check every checkbox and evidence line.
3. Re-run the full verification commands that prove final state.
4. Inspect current source for forbidden fallback/mock/demo behavior.
5. Inspect screenshots/browser state for visual simplicity, no overflow, no text clipping, and no bottom-nav overlap.
6. Confirm no required unit is blocked or unverified.
7. Only then mark the active goal complete.

## Completion Criteria

The overhaul is complete only when:

- The 2026-06-10 master closure plan is the authoritative execution plan.
- All 12 units are checked with RED/GREEN evidence.
- Patient, doctor, caregiver, and admin IA match the final IA.
- Assessment/risk review is real and persisted before plan/preparation/training completion is claimed.
- Patient can find assessment/training without confusion.
- Visual system is simple, tokenized, and free of old decorative/raw styles.
- Patient/caregiver/doctor primary flows hide technical/acceptance/governance internals.
- Admin/auditor pages retain necessary governance and evidence only in focused permission-gated tasks.
- Formal API/runtime chain remains real.
- Full source, type, lint, behavior, API, verifier, and browser checks pass or have exact real external blockers recorded.
- No fallback/mock/demo/fake readiness/result/pass behavior has been added.
