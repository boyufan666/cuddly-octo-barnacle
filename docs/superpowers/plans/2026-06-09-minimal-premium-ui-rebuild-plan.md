# Minimal Premium UI Rebuild Plan

> **Superseded for complete UI overhaul execution:** The user decided the current UI should be pushed over again because it is still too hard to find training and not visually premium enough. Continue execution from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. This file remains historical evidence for completed groundwork.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Before each unit, dispatch read-only subagents first for independent scope, source-boundary, and test-coverage review. For units touching multiple roles, use parallel subagents per role/module where feasible. Do not mark a unit ready for implementation until subagent findings are reconciled into the unit checklist.

**Goal:** Rebuild the Web UI into a simple, premium, role-focused rehabilitation product while preserving the full real business chain from login to training, doctor review, caregiver summary, audit, and desensitized export.

**Architecture:** Keep the real API/data/runtime modules intact, but rebuild the visible product surface around small role workspaces and focused feature modules. `apps/web/src/features/session/role-workspace.tsx` remains the main risk and must be reduced until it only orchestrates session, role selection, and shared reload/status behavior. Patient, caregiver, and doctor primary flows must not expose technical, demo, delivery, runtime, provider, raw evidence, or audit/export content; admin/auditor may see governance and evidence screens only inside permissioned governance pages.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, lucide-react, NestJS, Prisma/PostgreSQL, node:test, tsx TypeScript tests, Jest, Playwright.

---

## Why This Plan Exists

The previous plan `docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md` already completed important groundwork: thin `page.tsx`, role feature modules, real patient training API closure, seed idempotency, and source-boundary tests. The latest product decision is stronger: the UI should be pushed over visually and simplified again, because the current surface still feels too busy and too technical.

This plan supersedes the remaining UI execution work from the 2026-06-08 plan. Keep the completed business-chain and seed work. Do not continue browser regression as a final polish pass until this plan's simplification units are complete.

## Current Findings

- `apps/web/src/app/page.tsx` is already thin, but `apps/web/src/features/session/role-workspace.tsx` is still about 7,371 lines and owns too much orchestration, form state, and cross-role action wiring.
- Patient modules exist, but patient flows still need a stricter product read: one task, one primary action, no capability showcase, no technical status words.
- Doctor and admin pages are functionally real but visually too dense. `DoctorWorkspacePage.tsx` and `AdminOverviewPage.tsx` currently present too many panels at once.
- Visual implementation is inconsistent. Some modules still use raw colors, oversized radius, and local layout styles instead of shared tokens/primitives.
- Playwright specs contain old copy expectations and should be rewritten around the new IA, real requests, screenshots, and no-overflow/no-technical-copy assertions.
- `docs/customer-acceptance-criteria.md` still conflicts with the new IA in role entry names and ordering. This must be synchronized before final acceptance.

## Product Direction

Visual target:

- Quiet clinical premium: off-white background, sharp ink text, restrained teal accent, small semantic status colors, crisp tables/lists, 8px or smaller radius.
- No decorative gradient orbs, bokeh, glass panels, floating marketing cards, oversized hero sections, or nested cards.
- Operational density must match the role. Patient and caregiver pages stay sparse. Doctor and admin pages are compact but not wall-to-wall.
- A page should explain itself through clear hierarchy and actions, not through feature descriptions.

Business target:

- The product helps detect potential disease-risk signals, allows doctor review, gives different intervention/training plans, and collects structured training data.
- Games stay simple. Value comes from plan variety, risk/intervention matching, and collected data quality.
- Patient-facing categories remain `思维训练` and `运动训练`.
- Patient-facing purpose labels remain `风险评估辅助`, `干预训练`, and `数据采集`.

## Non-Negotiable Boundaries

- Do not add fallback, mock, demo, local-only, browser-local, generated evidence, fixed-score, hand-filled runtime result, silent downgrade, auto-recovery, fake success, or fake pass behavior.
- If any fallback strategy looks necessary, stop and get explicit user approval before implementing it.
- If a real dependency is unavailable, record the exact blocker. Do not route around it with mocked UI, generated results, seed-only evidence, or local browser state.
- Patient training preparation cannot create a replacement collection batch. It can only read ready formal preparation state.
- Training start and result submission must use real `api.startTrainingSession` and `api.submitTrainingResult`.
- A formal training loop is incomplete until doctor review succeeds through real `api.reviewTrainingResult`.
- AI/STT/TTS drafts or conversations cannot become formal assessment records without doctor human review.
- Patient/caregiver/doctor primary flows must not show provider payloads, endpoint refs, runtime manifests, audit IDs, raw JSON, quality evidence, acceptance evidence, or delivery scripts.
- Admin/auditor governance pages may show runtime readiness, quality evidence, audit, and export controls, but must not mount patient training runtime components.
- Public social square and wearable physiology collection remain out of this UI rebuild unless the customer confirms their governance, moderation, privacy, SDK/API, protocol, and evidence requirements.

## Target IA

Patient:

- `今日`: one next task, one blocker if blocked, one primary CTA.
- `训练`: preparation, device/camera/posture checks, runtime, result confirmation.
- `记录`: recent results, trend, doctor-safe feedback, plan/game variety library.
- `我的`: profile, consent, caregiver binding, visible scope.

Doctor:

- `患者`: assigned patient list and current patient summary.
- `评估`: MMSE/CDR/AD-8/AI/STT summaries and doctor confirmation.
- `计划`: recommendation, adjustment, confirmation, preparation creation.
- `复核`: new/abnormal/low-quality training result review.

Caregiver:

- `照护`: authorized patient summary and today's reminder.
- `进展`: desensitized trend and completed training summary.
- `提醒`: doctor precautions and attention items.
- `我的`: binding relation, authorization state, visible scope.

Admin/operator/auditor:

- `账号`: registration review, role activation, caregiver accounts.
- `内容`: cognitive/movement content and plan library release state.
- `配置`: runtime readiness, collection condition, protocol readiness.
- `审计`: audit search, quality evidence, reason-required desensitized export.

## Page Action To API Acceptance Map

| UI action | Required real API path | Success evidence |
|---|---|---|
| Login | `api.login`, then `api.me` on restore | Role context shows authorized scope |
| Patient data load | `api.patient`, role-scoped summary/history calls | Patient page shows real current plan or truthful blocker |
| Doctor risk confirmation | assessment/risk review API already wired in `role-workspace.tsx` | Risk status updates and audit exists |
| Doctor plan confirmation | `api.confirmPlan` through doctor action helpers | Current plan becomes active/current |
| Doctor preparation creation | `api.createCollectionBatch` | Ready batch is tied to patient, plan item, game, protocol |
| Patient training start | `api.startTrainingSession` | Session has idempotency key and collection batch |
| Patient result submit | `api.submitTrainingResult` | Result has score, completion, duration, metrics, quality flags |
| Doctor training review | `api.reviewTrainingResult` | Result review status and reviewer fields update |
| Caregiver summary | caregiver summary/care circle API | Desensitized authorized summary only |
| Audit search | `api.auditLogs` | Permissioned audit list only |
| Desensitized export | `api.exportData` | Reason required, CSV download, audit event |

## Completion Gate For Every Unit

For each unit:

1. Add or strengthen failing tests first.
2. Run the focused test and capture RED.
3. Implement the smallest complete product change.
4. Run focused tests GREEN.
5. Run `pnpm --filter @rehab-platform/web lint` when web files change.
6. Run `pnpm --filter @rehab-platform/web exec tsc --noEmit` when TypeScript contracts change.
7. Use at least one read-only subagent review for scope/quality before marking the unit complete.
8. Do not enter the next unit until the current unit has passed or has a recorded real blocker.

---

## Unit 0: Freeze New IA And Acceptance Documents

**Purpose:** Make the new IA and simplified UI direction authoritative so old documents do not pull the implementation back into the previous flow.

**Files:**

- Modify: `docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md`
- Modify: `docs/customer-acceptance-criteria.md`
- Modify: `docs/rehab-platform-ui-design-spec.md`
- Modify: `docs/rehab-platform-role-flows-and-pages.md`
- Modify: `scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs`
- Modify: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`

- [x] **Step 1: Add failing IA synchronization tests**

Add assertions that require this plan path, the new patient/doctor/caregiver/admin IA, and a single source of truth:

```js
assert.match(customerAcceptance, /患者端最终入口为 `今日 -> 训练 -> 记录 -> 我的`/);
assert.match(customerAcceptance, /家属端最终入口为 `照护 -> 进展 -> 提醒 -> 我的`/);
assert.match(customerAcceptance, /管理员端最终入口为 `账号 -> 内容 -> 配置 -> 审计`/);
assert.doesNotMatch(customerAcceptance, /我的 -> 今日 -> 训练 -> 记录/);
assert.doesNotMatch(customerAcceptance, /供应商治理 -> 审计治理 -> 导出治理/);
assert.match(uiSpec, /Minimal Premium Clinical Rebuild/);
assert.match(roleFlows, /技术\/运行时\/审计证据只属于管理员和审计员治理页/);
```

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
```

Expected: fail while customer acceptance docs still contain old IA.

Evidence captured during execution: `node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs` failed as expected because `docs/customer-acceptance-criteria.md` still used the old patient entry `我的 -> 今日 -> 训练 -> 记录`.

- [x] **Step 3: Synchronize docs**

Implementation requirements:

- Mark `2026-06-08-minimal-premium-ui-total-rebuild.md` as superseded for remaining UI execution by this plan.
- Update customer acceptance role entries to exactly match Target IA.
- Add the priority line to the UI design spec: `简约高级 > 功能展示；业务任务 > 能力说明；克制界面 > 情绪化/游戏化表达。`
- Keep technical Unity/AI/STT/TTS acceptance requirements in backend/admin/runbook sections, not in patient/caregiver/doctor primary UI requirements.

- [x] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass, with no new lint errors.

Evidence captured during execution:

- `node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs` passed with `7` tests, `0` failures.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `17` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.
- Unit 0 specification subagent review: `APPROVED`. The reviewer confirmed the 06-08 plan points to this 06-09 plan, customer acceptance entries use `今日 -> 训练 -> 记录 -> 我的`, `照护 -> 进展 -> 提醒 -> 我的`, `患者 -> 评估 -> 计划 -> 复核`, and `账号 -> 内容 -> 配置 -> 审计`; the UI spec contains the current priority sentence; role-flow docs contain `技术/运行时/审计证据只属于管理员和审计员治理页`; no fallback/mock/demo strategy was introduced and backend/admin/runbook technical acceptance requirements remain.

---

## Unit 1: Visual Token And Primitive Rebuild

**Purpose:** Create a restrained premium visual foundation before rewriting screens.

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

- [x] **Step 1: Add failing visual system assertions**

Require tokenized color, stable sizing, 8px radius, and no decorative visual language:

```js
assert.match(globals, /--surface-page:/);
assert.match(globals, /--ink-strong:/);
assert.match(globals, /--accent-strong:/);
assert.match(globals, /--radius-card:\s*8px/);
assert.match(globals, /--radius-control:\s*8px/);
assert.doesNotMatch(globals, /orb|blob|bokeh|glass|gradient-purple|letter-spacing:\s*-/i);
assert.doesNotMatch(sharedPrimitives, /rounded-2xl|rounded-3xl|backdrop-blur|#[0-9a-f]{3,8}/i);
assert.match(sharedPrimitives, /focus-visible/);
assert.match(sharedPrimitives, /min-h-/);
```

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail while raw colors, large radii, or unstable primitives remain.

Evidence captured during execution: after adding the Unit 1 assertions, `node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs` failed first because `apps/web/src/app/globals.css` lacked `--surface-page`, then failed again after stricter review assertions because global aliases still pointed at old tokens and `Button.tsx` still depended on `--brand-primary` / `--ink-primary`.

- [x] **Step 3: Rebuild primitives**

Implementation requirements:

- Use off-white page, paper surfaces, ink text, one restrained teal accent, and semantic status tokens.
- Keep normal cards, buttons, fields, badges, and task rows at 8px or smaller radius.
- Buttons must preserve default `type="button"`, loading disabled state, `aria-busy`, focus-visible outline, and stable min height.
- Cards are only for individual repeated items, forms, and modals. Page sections use full-width unframed layout or simple bordered panels.
- No nested card styles in shared primitives.

- [x] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

Evidence captured during execution:

- `node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs` passed with `8` tests, `0` failures.
- `rg -n -- "--brand-primary|--brand-primary-strong|--brand-soft|--ink-primary|--ink-secondary|--ink-muted|\\b(?:bg|text|border)-white(?:\\b|/)" apps/web/src/components/ui` produced no matches.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `17` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.

---

## Unit 2: Application Shell Simplification

**Purpose:** Make the logged-in shell feel like a product workspace instead of a demo console.

**Files:**

- Modify: `apps/web/src/components/layout/RoleShell.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/components/layout/PatientTaskLayout.tsx`
- Modify: `apps/web/src/components/layout/WorkbenchLayout.tsx`
- Modify: `apps/web/src/components/layout/GovernanceLayout.tsx`
- Modify: `apps/web/src/features/session/role-navigation.ts`
- Modify: `scripts/__tests__/role-first-shell-navigation.test.mjs`
- Modify: `scripts/__tests__/global-ui-component-boundary.test.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [x] **Step 1: Add failing shell assertions**

```js
assert.match(roleNavigation, /今日/);
assert.match(roleNavigation, /训练/);
assert.match(roleNavigation, /记录/);
assert.match(roleNavigation, /我的/);
assert.doesNotMatch(roleNavigation, /技术验收|供应商治理|导出治理|功能演示/);
assert.doesNotMatch(shellSources, /hero|feature-grid|marketing|验收材料|能力展示/i);
assert.doesNotMatch(shellSources, /rounded-2xl|rounded-3xl|backdrop-blur|#[0-9a-f]{3,8}/i);
assert.match(shellSources, /data-testid="patient-task-nav"/);
assert.match(shellSources, /safe-area-inset-bottom/);
```

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail if shell still includes old IA, raw visual styles, or console-like copy.

Evidence captured during execution: `node --test scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs` failed as expected with `3` failures: doctor/admin navigation still exposed old labels (`患者队列`, `评估复核`, `计划管理`, `训练复核`, `账号治理`, `内容治理`, `配置治理`, `安全审计`); shell/layout sources still used old visual boundaries; and the runtime boundary test used stale `function GameScreen` / `function ResultScreen` markers after runtime extraction.

- [x] **Step 3: Simplify shell**

Implementation requirements:

- Desktop: slim header, one role nav, one content column or two-column workbench only where the role needs it.
- Mobile: patient/caregiver bottom task navigation with safe-area padding and no horizontal scroll.
- Remove role shells that advertise product capabilities, acceptance package, technical modules, or demo paths.
- Keep `page.tsx` thin and do not move screen markup back into it.

- [x] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

Evidence captured during execution:

- `node --test scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs` passed with `13` tests, `0` failures.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `16` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.
- `node --check scripts/web-playwright-regression.spec.mjs` exited `0`.
- `rg -n -- "--brand-primary|--brand-primary-strong|--brand-soft|--ink-primary|--ink-secondary|--ink-muted|#[0-9a-fA-F]{3,8}|\\b(?:bg|text|border)-white(?:\\b|/)|bg-emerald-|bg-amber-|rounded-2xl|rounded-3xl|backdrop-blur|患者队列|评估复核|计划管理|训练复核|账号治理|内容治理|配置治理|安全审计" apps/web/src/components/layout apps/web/src/features/session/role-navigation.ts` produced no matches.
- Unit 2 read-only spec/quality subagent review: `APPROVED`. The reviewer confirmed `RoleShell` uses a simplified header, role nav, and patient-like bottom nav; the new IA entries are present for all roles; `PatientTaskLayout` keeps `safe-area-inset-bottom`; no fallback/mock/demo/fake success/silent downgrade or business API/runtime/review/export change was introduced. The reviewer noted the existing `scripts/web-playwright-regression.spec.mjs` `route.fulfill` for missing collection batches was not introduced by Unit 2 and should be moved into the later regression-unit cleanup rather than block this shell unit.

---

## Unit 3: Patient Workspace Product Rebuild

**Purpose:** Make patient UI extremely clear: today's action, preparation, training, result, records, profile/authorization.

**Files:**

- Modify: `apps/web/src/features/patient/PatientWorkspacePage.tsx`
- Modify: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/features/patient/GameLibraryPage.tsx`
- Modify: `apps/web/src/features/patient/AssessmentDialoguePage.tsx`
- Modify: `apps/web/src/features/patient/PatientProfilePage.tsx`
- Modify: `apps/web/src/features/patient/patient-training-copy.ts`
- Modify: `scripts/__tests__/patient-training-flow-ia.test.mjs`
- Modify: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Modify: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Modify: `scripts/__tests__/patient-facing-game-library-boundary.test.mjs`

- [x] **Step 1: Add failing patient simplicity assertions**

```js
assert.match(patientWorkspace, /data-testid="patient-primary-workspace"/);
for (const entry of ["今日", "训练", "记录", "我的"]) {
  assert.match(patientWorkspace + navSource, new RegExp(entry));
}
assert.match(todaySource, /data-testid="patient-today-primary-cta"/);
assert.match(todaySource, /开始训练准备|查看今日训练记录|等待医师下发/);
assert.doesNotMatch(patientSources, /技术验收|演示|demo|mock|fallback|Provider|Endpoint|manifest|bridge|runtimeType|审计|导出|质量证据|采集批次|协议版本/i);
assert.match(gameLibrarySource, /思维训练/);
assert.match(gameLibrarySource, /运动训练/);
assert.match(gameLibrarySource, /风险评估辅助/);
assert.match(gameLibrarySource, /干预训练/);
assert.match(gameLibrarySource, /数据采集/);
```

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/lib/training-start-readiness.test.ts
```

Expected: fail if patient UI is still complex, technical, or missing the category/purpose framing.

Evidence captured during execution: after strengthening Unit 3 assertions, `node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-facing-game-library-boundary.test.mjs` failed as expected with `5` patient UI failures: missing `data-testid="patient-primary-workspace"`, runtime page exposing `data-training-session-id`, assessment entry still showing STT/TTS/AI implementation copy and sr-only handler names, result page still having two CTA buttons, and patient visible pages still depending on old `--brand-*` / `--ink-*` tokens plus old visual utilities.

- [x] **Step 3: Rebuild patient pages**

Implementation requirements:

- `今日` must show one selected training and one primary CTA. If blocked, show exactly one truthful business blocker.
- `训练` must show `训练安排 -> 摄像头/设备 -> 站位 -> 开始训练`. It must not mention runtime internals.
- `记录` must show recent result, trend, doctor-safe feedback, and the simple plan library grouped by `思维训练` / `运动训练`.
- `我的` must show profile, consent, caregiver binding, and visible scope. It must not become a settings/technical page.
- `AssessmentDialoguePage` should become a secondary assessment entry, not a visible capability showcase. Hide provider/TTS/STT implementation details from patient copy.
- Keep real patient action helpers. Do not create collection batches or results locally.

- [x] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/lib/training-start-readiness.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

Evidence captured during execution:

- `node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-facing-game-library-boundary.test.mjs` passed with `33` tests, `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/lib/training-start-readiness.test.ts` passed with `4` tests, `0` failures.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `16` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.
- Unit 3 read-only spec/quality subagent review: `APPROVED`. The reviewer confirmed the patient IA and primary workspace test id, one primary task/CTA on today, preparation checklist without runtime implementation copy, one result CTA with doctor-safe status, profile/consent/caregiver scope in `我的`, runtime DOM no longer exposing the session id, assessment copy no longer exposing STT/TTS/AI implementation labels or sr-only handler names, no fallback/mock/demo/fake success/silent downgrade, no patient-side creation/spoofing of collection batch/result/readiness, and the real start/submit API chain remains intact.

---

## Unit 4: Runtime Presentation Without Technical Leakage

**Purpose:** Keep browser pose and Unity real while making the patient-visible runtime feel simple and stable.

**Files:**

- Modify: `apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/UnityTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/runtime-context.ts`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`
- Modify: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Modify: `scripts/__tests__/patient-training-flow-ia.test.mjs`

- [x] **Step 1: Add failing runtime visible-copy assertions**

```js
assert.match(browserSurface, /export function BrowserPoseTrainingSurface/);
assert.match(unitySurface, /export function UnityTrainingSurface/);
assert.match(browserSurface, /runTokenRef/);
assert.match(unitySurface, /parseUnityTrainingResultBridgeEvent/);
assert.doesNotMatch(patientRuntimeMarkup, /Unity loader|manifest|bridge|runtime|采样帧|关键点|平均置信度|协议版本|资源清单|回传|debug|adapter|local|dev/i);
assert.match(patientRuntimeMarkup, /正在准备训练|训练进行中|训练暂不可开始|站位情况|训练准备状态/);
assert.doesNotMatch(runtimeSources, /fallback|mock|demo|fixedScore|manualResult/i);
```

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-training-flow-ia.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/lib/browser-pose-training-result.test.ts \
  src/lib/unity-training-bridge.test.ts
```

Expected: fail if patient runtime markup or helper-returned labels expose technical details.

Evidence captured during execution:

- `node --test scripts/__tests__/formal-runtime-ui-contract.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-training-flow-ia.test.mjs` failed as expected with `2` Unit 4 failures: dynamic gameplay profile text still exposed telemetry-style labels such as `触达/漏触`, `平均反应`, `同步差`, `偏离次数`, `偏移/方向`; Browser Pose visible runtime still used old dark/glass styling such as `rounded-3xl`, raw hex utilities, `backdrop-blur`, `font-mono`, and rendered raw `sampleCount` / `validFrameCount` as `入镜状态`.
- After read-only review found a fake-readiness risk, `node --test scripts/__tests__/formal-runtime-ui-contract.test.mjs` failed as expected because Unity visible copy still used `trainingScreenReady ? "训练画面已准备"` instead of tying readiness to actual `runtimeState === "ready"`.

- [x] **Step 3: Rebuild runtime presentation**

Implementation requirements:

- Runtime internals remain in runtime modules and admin evidence modules only.
- Patient visible state uses plain blocking language, such as `动作识别不稳定，请调整站位后重试。`
- Canvas/video areas use stable aspect ratios and do not resize around button or status changes.
- Finish action remains disabled until real result readiness. Do not add fake readiness.
- Browser pose and Unity cleanup must remain safe for async completion and unmount.

- [x] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-training-flow-ia.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/lib/browser-pose-training-result.test.ts \
  src/lib/unity-training-bridge.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

Evidence captured during execution:

- `node --test scripts/__tests__/formal-runtime-ui-contract.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-training-flow-ia.test.mjs` passed with `28` tests, `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/lib/browser-pose-training-result.test.ts src/lib/unity-training-bridge.test.ts` passed with `15` tests, `0` failures.
- Additional regression guard: `node --test scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/browser-pose-gameplay-differentiation.test.mjs scripts/__tests__/unity-pose-guidance-page.test.mjs scripts/__tests__/training-capture-layout.test.mjs` passed with `24` tests, `0` failures.
- `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `16` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` exited `0`.
- Unit 4 read-only review first returned `NOT APPROVED` for a real fake-readiness issue: Unity showed `训练画面已准备` from manifest URL presence. The issue was fixed so `训练画面已准备` is now only tied to `runtimeState === "ready"` / `trainingScreenActive`, with a RED assertion added.
- Unit 4 read-only re-review: `APPROVED`. The reviewer confirmed the fake-readiness finding was resolved and independently ran `node --test scripts/__tests__/formal-runtime-ui-contract.test.mjs` (`7/7`) and `node --test scripts/__tests__/patient-care-technical-copy-ban.test.mjs` (`2/2`).

---

## Unit 5: Doctor Workspace Simplification

**Purpose:** Turn doctor UI from a dense all-in-one dashboard into focused clinical workspaces.

**Files:**

- Modify: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Modify: `apps/web/src/features/doctor/PatientQueue.tsx`
- Modify: `apps/web/src/features/doctor/PatientClinicalSummary.tsx`
- Modify: `apps/web/src/features/doctor/AssessmentReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/PlanEditor.tsx`
- Modify: `apps/web/src/features/doctor/DataCollectionReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/TrainingReviewQueue.tsx`
- Modify: `apps/web/src/features/doctor/doctor-workbench-model.ts`
- Modify: `scripts/__tests__/doctor-workbench-ia.test.mjs`
- Modify: `scripts/__tests__/speech-ai-assessment-ui.test.mjs`

- [ ] **Step 1: Add failing doctor focus assertions**

```js
assert.match(doctorWorkspace, /data-testid="doctor-primary-workbench"/);
for (const entry of ["患者", "评估", "计划", "复核"]) {
  assert.match(doctorWorkspace + navigationSource, new RegExp(entry));
}
assert.match(doctorSources, /患者队列|评估复核|计划管理|训练复核/);
assert.doesNotMatch(doctorSources, /Provider|Endpoint|endpointRef|promptVersion|callId|rawPayload|rawEvidence|auditId|manifestUrl|runtimeType|Unity loader|技术验收|fallback|mock|demo/i);
assert.doesNotMatch(doctorSources, /rounded-2xl|rounded-3xl|#[0-9a-f]{3,8}/i);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/lib/ai-assessment-draft.test.ts
```

Expected: fail if doctor UI still exposes technical fields or overly dense layouts.

- [ ] **Step 3: Simplify doctor workspaces**

Implementation requirements:

- `患者`: queue plus selected patient summary only.
- `评估`: clinical summaries and doctor confirmation. No provider/call/prompt/endpoint fields.
- `计划`: current plan, selected content, frequency, duration, difficulty, adjustment reason, confirmation, preparation creation.
- `复核`: new/abnormal/low-quality results with a clear review form.
- Keep real `confirmPlan`, `createCollectionBatch`, and `reviewTrainingResult` action helpers.
- Switching selected patient must reset stale plan/protocol/preparation forms.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/lib/ai-assessment-draft.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

---

## Unit 6: Caregiver Workspace Simplification

**Purpose:** Make caregiver UI a calm desensitized care companion, not a clinical or audit screen.

**Files:**

- Modify: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverProgressPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverReminderPanel.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverScopePanel.tsx`
- Modify: `apps/web/src/features/caregiver/caregiver-workspace-model.ts`
- Modify: `apps/web/src/features/caregiver/caregiver-workspace-model.test.ts`
- Modify: `scripts/__tests__/care-circle-privacy.test.mjs`
- Modify: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`

- [ ] **Step 1: Add failing caregiver simplicity assertions**

```js
assert.match(caregiverWorkspace, /data-testid="caregiver-primary-workspace"/);
for (const entry of ["照护", "进展", "提醒", "我的"]) {
  assert.match(caregiverWorkspace + navigationSource, new RegExp(entry));
}
assert.match(caregiverSources, /可见范围/);
assert.doesNotMatch(caregiverSources, /原始|payload|审计|导出|Provider|Endpoint|manifest|runtime|质量证据|技术验收|accountId|authorUserId|actorUserId|fallback|mock|demo/i);
assert.doesNotMatch(caregiverSources, /rounded-2xl|rounded-3xl|#[0-9a-f]{3,8}/i);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/caregiver/caregiver-workspace-model.test.ts
```

Expected: fail if caregiver UI leaks raw/internal data or visual clutter.

- [ ] **Step 3: Simplify caregiver pages**

Implementation requirements:

- `照护`: patient summary, today status, next reminder.
- `进展`: desensitized trend and completed training summary.
- `提醒`: doctor precautions and attention items only.
- `我的`: binding relation, authorization state, visible scope.
- Unknown backend enum values must fail the focused model test or show a truthful blocker only after explicit product approval. Do not silently map unknown backend values to generic safe labels or pass raw values through to visible copy.
- Caregiver cannot access plan editing, doctor review, audit, export, raw transcript, or raw motion metrics.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test src/features/caregiver/caregiver-workspace-model.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

---

## Unit 7: Admin Governance Simplification

**Purpose:** Keep admin power, but turn the UI into a clean governance console rather than a technical showcase.

**Files:**

- Modify: `apps/web/src/features/admin/AdminOverviewPage.tsx`
- Modify: `apps/web/src/features/admin/AccountReviewPanel.tsx`
- Modify: `apps/web/src/features/admin/TrainingContentGovernance.tsx`
- Modify: `apps/web/src/features/admin/OperationConfigPanel.tsx`
- Modify: `apps/web/src/features/admin/CollectionConditionGovernance.tsx`
- Modify: `apps/web/src/features/admin/StatisticsQueryPanel.tsx`
- Modify: `apps/web/src/features/admin/SecurityAuditPage.tsx`
- Modify: `apps/web/src/features/admin/DesensitizedExportPanel.tsx`
- Modify: `apps/web/src/features/admin/TrainingQualityEvidenceSection.tsx`
- Modify: `scripts/__tests__/admin-governance-ia.test.mjs`
- Modify: `scripts/__tests__/collection-condition-ui.test.mjs`
- Modify: `scripts/__tests__/training-capture-layout.test.mjs`

- [ ] **Step 1: Add failing admin governance assertions**

```js
for (const entry of ["账号", "内容", "配置", "审计"]) {
  assert.match(adminSources + navigationSource, new RegExp(entry));
}
for (const component of [
  "AccountReviewPanel",
  "TrainingContentGovernance",
  "OperationConfigPanel",
  "CollectionConditionGovernance",
  "DesensitizedExportPanel",
  "SecurityAuditPage",
]) {
  assert.match(adminOverview, new RegExp(`<${component}\\b`));
}
assert.doesNotMatch(adminOverview, /TrainingRuntimePage|BrowserPoseTrainingSurface|UnityTrainingSurface|完成本次训练/);
assert.doesNotMatch(adminSources, /rounded-2xl|rounded-3xl|backdrop-blur|#[0-9a-f]{3,8}/i);
assert.doesNotMatch(adminSources, /demo|mock|fallback/i);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs
```

Expected: fail if admin pages still look like a technical demo or mount runtime surfaces.

- [ ] **Step 3: Simplify admin**

Implementation requirements:

- `账号`: registration requests, role activation, caregiver account creation.
- `内容`: content release, simple cognitive/movement plan library, status.
- `配置`: runtime readiness, collection conditions, protocols.
- `审计`: audit search, quality evidence, reason-required export.
- Quality evidence stays admin/auditor-only and visually secondary.
- Preserve permission gates and real API action helpers.
- Do not remove governance capability; only simplify presentation.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass.

---

## Unit 8: Role Workspace Reduction And Action Boundaries

**Purpose:** Reduce `role-workspace.tsx` so future UI changes are localized and less risky.

**Files:**

- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Modify: `apps/web/src/features/session/useRoleData.ts`
- Modify: `apps/web/src/features/patient/patient-training-actions.ts`
- Modify: `apps/web/src/features/doctor/doctor-workbench-actions.ts`
- Modify: `apps/web/src/features/admin/admin-governance-actions.ts`
- Create or modify focused model/action files only when they remove real duplicated responsibility.
- Modify: `scripts/__tests__/role-first-shell-navigation.test.mjs`
- Modify: `scripts/__tests__/formal-acceptance-chain.test.mjs`
- Modify: `scripts/__tests__/global-ui-component-boundary.test.mjs`

- [ ] **Step 1: Add failing boundary assertions**

```js
assert.ok(roleWorkspace.split("\n").length < 5000, "role-workspace.tsx should keep shrinking");
assert.doesNotMatch(roleWorkspace, /function (AdminScreen|SecurityScreen|FamilyScreen|DoctorScreen)\b/);
assert.doesNotMatch(roleWorkspace, /function buildFormalGameDifficultyPolicy|function buildFormalGameRequiredPermissions|function buildFormalGameResultSchema/);
assert.doesNotMatch(roleWorkspace, /api\.submitTrainingResult|api\.startTrainingSession|api\.reviewTrainingResult|api\.exportData/);
assert.match(patientActions, /api\.startTrainingSession/);
assert.match(patientActions, /api\.submitTrainingResult/);
assert.match(doctorActions, /api\.reviewTrainingResult/);
assert.match(adminActions, /api\.exportData/);
```

- [ ] **Step 2: Run RED**

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail while `role-workspace.tsx` still owns too much visible or role-specific logic.

- [ ] **Step 3: Extract without changing API semantics**

Implementation requirements:

- Move role-specific payload builders and form model helpers into feature-owned files.
- Keep top-level reload/status orchestration in `role-workspace.tsx` only when genuinely shared.
- Preserve real API calls through existing feature action files.
- Do not add adapter fallback or duplicate local action state.

- [ ] **Step 4: Run GREEN**

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: pass and `role-workspace.tsx` line count is below the unit threshold.

---

## Unit 9: Playwright Regression Rewrite

**Purpose:** Replace old browser expectations with product-quality, real-business, visual QA checks.

**Files:**

- Modify: `scripts/playwright-regression.config.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`
- Modify: `scripts/formal-ui-business-chain.spec.mjs`
- Modify: `docs/web-playwright-regression-runbook.md`

- [ ] **Step 1: Add failing browser QA expectations**

Implementation requirements for the spec:

- Use real seeded accounts: `patient001`, `doctor001`, `caregiver001`, `operator001`, `admin`, password `253913`.
- Do not use `*.seed@rehab.local` accounts.
- Use `operator001`, not auditor, for successful desensitized export.
- Verify desktop and mobile viewports.
- Capture screenshots for patient, doctor, caregiver, and admin primary screens.
- Check no horizontal overflow.
- Check primary CTAs are visible and not covered by mobile nav.
- Check patient/caregiver pages contain no forbidden technical copy.
- Check real browser request payloads for login and account request.
- Check the formal UI business chain uses real API requests and no route fulfill/mock.

- [ ] **Step 2: Run RED**

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280
```

Expected: fail until specs and UI are aligned.

- [ ] **Step 3: Rewrite specs**

Implementation requirements:

- `web-playwright-regression.spec.mjs` becomes role smoke plus visual/no-overflow/copy-boundary QA.
- `formal-ui-business-chain.spec.mjs` performs the real chain:
  1. doctor confirms current plan or creates required preparation through real UI/API-supported state,
  2. patient selects a real ready training,
  3. patient completes real runtime result readiness,
  4. doctor reviews the result,
  5. caregiver reads desensitized summary,
  6. operator generates desensitized CSV with a reason.
- If a browser action cannot be completed because a true dependency is missing, record blocker. Do not use route fulfill, mocked session, fake result readiness, or fake export success.

- [ ] **Step 4: Run GREEN**

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 10: Full Business Regression

**Purpose:** Prove simplification did not break backend contracts, seed stability, or real formal chain behavior.

**Files:**

- Modify only files required by failing tests.
- Update runbooks after verification:
  - `docs/formal-acceptance-chain-runbook.md`
  - `docs/web-playwright-regression-runbook.md`
  - `docs/customer-delivery-progress-and-input-summary.md`

- [ ] **Step 1: Run source and behavior suites**

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/minimal-auth-entry.test.mjs \
  scripts/__tests__/registration-request-ui.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/trial-empty-loop-collection-chain.test.mjs \
  scripts/__tests__/empty-real-loop-orchestrator.test.mjs \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/seed-idempotency-script.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  src/lib/browser-pose-game-library.test.ts \
  src/lib/training-start-readiness.test.ts \
  src/lib/browser-pose-training-result.test.ts \
  src/lib/unity-training-bridge.test.ts \
  src/lib/ai-assessment-draft.test.ts \
  src/features/caregiver/caregiver-workspace-model.test.ts
```

Expected: pass.

- [ ] **Step 2: Run service and contract checks**

```bash
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
pnpm --filter @rehab-platform/api exec jest
pnpm --filter @rehab-platform/db exec tsc --noEmit
pnpm verify:contracts
```

Expected: pass.

- [ ] **Step 3: Run seed idempotency**

```bash
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
```

Expected: both JSON outputs match exactly.

- [ ] **Step 4: Run formal and browser chains**

```bash
pnpm verify:formal-acceptance-chain
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
```

Expected: pass. If config inputs are required, use the repo runbooks and do not synthesize fake configs.

- [ ] **Step 5: Update runbooks and progress docs**

Record:

- The new IA.
- The real account list for manual testing.
- The browser regression commands.
- The formal UI chain behavior.
- Any real environment blockers and how to restart without fallback.
- The customer-facing statement: UI rebuilt as minimal premium, technical/demo surfaces removed from product flows, plan variety/risk/intervention/data-collection framing included.

---

## Unit 11: Manual Product Smoke

**Purpose:** Give the user a stable product to test manually.

**Files:**

- Modify only if smoke finds a real bug.

- [ ] **Step 1: Start real local services**

```bash
pnpm infra:up
pnpm db:seed
pnpm dev
```

Expected: Web and API start against the real local database.

- [ ] **Step 2: Manual patient smoke**

Login:

- account: `patient001`
- password: `253913`

Verify:

- Entries are `今日 -> 训练 -> 记录 -> 我的`.
- Patient first screen has one obvious primary CTA or one truthful blocker.
- Training can reach preparation and runtime only through real ready state.
- No technical/demo/provider/audit/export wording appears.

- [ ] **Step 3: Manual doctor smoke**

Login:

- account: `doctor001`
- password: `253913`

Verify:

- Entries are `患者 -> 评估 -> 计划 -> 复核`.
- Doctor can confirm plan, create preparation, and review result through real action states.
- No raw provider payload, endpoint, manifest, runtime JSON, audit ID, or acceptance evidence appears.

- [ ] **Step 4: Manual caregiver smoke**

Login:

- account: `caregiver001`
- password: `253913`

Verify:

- Entries are `照护 -> 进展 -> 提醒 -> 我的`.
- Only desensitized authorized summary appears.
- No raw transcript, raw motion metrics, audit/export/admin actions appear.

- [ ] **Step 5: Manual admin/operator smoke**

Login:

- account: `operator001` or `admin`
- password: `253913`

Verify:

- Entries are `账号 -> 内容 -> 配置 -> 审计`.
- Desensitized export requires a reason.
- Technical readiness and quality evidence stay inside governance only.
- Admin pages do not mount training runtime components.

---

## Final Completion Criteria

This plan is complete only when all criteria below are proven with current evidence:

- Units 0 through 11 are checked off.
- All focused `node --test` and `tsx --test` suites listed in Unit 10 pass.
- `pnpm --filter @rehab-platform/web lint` passes with no errors.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` passes.
- `pnpm --filter @rehab-platform/api exec jest` passes.
- `pnpm --filter @rehab-platform/db exec tsc --noEmit` passes.
- `pnpm db:seed` passes twice.
- `node scripts/verify-seed-idempotency.mjs` produces identical output after both seed runs.
- `pnpm verify:contracts` passes.
- `pnpm verify:formal-acceptance-chain` passes with real config/evidence.
- `pnpm test:playwright` passes.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs` passes.
- Manual smoke confirms the UI is simple, premium, role-focused, and free of demo/technical clutter in patient/caregiver/doctor product flows.
- No fallback/mock/demo/silent-downgrade/fake-success behavior was introduced.
