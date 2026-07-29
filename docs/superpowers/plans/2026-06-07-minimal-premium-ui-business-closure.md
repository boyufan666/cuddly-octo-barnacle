# Minimal Premium UI Business Closure Implementation Plan

> **Superseded for UI execution:** Continue all current UI closure execution from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. The older 2026-06-09 complete-overhaul plan remains historical evidence, but this file is not the current execution plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Web UI into a simple, premium, role-focused rehabilitation product while preserving the complete formal business chain from account access through assessment, plan, preparation, training, result, doctor review, caregiver summary, audit, and desensitized export.

**Architecture:** Keep the existing Next.js + NestJS + Prisma contracts, but stop treating `apps/web/src/app/page.tsx` as a technical delivery console. Move product-facing UI into small role workspaces, keep runtime/provider/audit details inside admin or verification-only surfaces, and validate every unit with TDD before implementation and regression before moving on.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, lucide-react, NestJS, Prisma/PostgreSQL, node:test, tsx behavior tests, Jest, Playwright.

---

## Product Decision

The current UI should be treated as structurally useful but visually and informationally overexposed. The rebuild must look like a finished rehabilitation product, not a demo screen, technology console, or acceptance package browser.

Design direction:

- Minimal, calm, premium clinical product.
- Low visual noise, large readable hierarchy, no decorative dashboard clutter.
- One primary task per patient/caregiver screen.
- Doctor screens are quiet workbenches: queue, clinical review, plan issue, result review.
- Admin screens are restrained governance tools: accounts, content, configuration, security, audit, export.
- Game value is not game complexity. The product value is risk measurement support, plan variety, intervention matching, and data collection.
- Existing training categories remain: `思维训练` and `运动训练`.
- Existing training games stay available; add customer-requested plan-variety framing around potential disease-risk measurement, intervention plans, and measurable data collection.

## Non-Negotiable Boundaries

- Do not add fallback, mock, demo, seed-only, browser-local, fixed-score, generated evidence, silent downgrade, or auto-recovery behavior. If an implementation appears to require fallback behavior, stop that unit, record the exact blocker in the plan/runbook, and the fallback must first be confirmed by the user. Until that confirmation exists, the fallback must not be implemented or routed around.
- Patient and caregiver UI must not show technical delivery terms or variants: `engine`, `license`, `sensing`, `MediaPipe`, `Phaser`, `Unity loader`, `manifest`, `bridge`, `runtimeType`, `provider`, `Provider`, `Endpoint`, `audit ID`, `auditId`, `审计ID`, `审计 Id`, raw evidence, raw payload, original transcript payload, export governance, quality evidence, `质量证据`, acceptance package, `技术验收`, secret reference, `fallback`, `mock`, or `demo`.
- Doctor UI may show clinical evidence summaries and quality status only as business fields: scale score, risk grade, assessment summary, doctor conclusion, review status, completion rate, score, duration, abnormal flag, and quality summary. Doctor UI must not show raw provider payloads, endpoint refs, runtime manifests, secret refs, acceptance evidence, audit IDs, raw motion metrics JSON, raw transcript payloads, or hashed payload internals.
- Admin UI may show governance details, but must not mount patient training runtime components.
- Patient training start must require the existing formal chain: current active plan, selected plan item, not already completed today, released game content, required consent, required device check, required pose check, and a matching ready collection batch when required.
- Patient result submission must be produced by the formal runtime path and keep `collectionBatchId`, `gameRunId`, `gameVersion`, `protocolVersion`, `metricsSummary.source`, `rawPayloadHash`, dynamic difficulty evidence, and motion metrics consistent with the active session.
- A formal training loop is incomplete until a doctor reviews the training result.
- Wearable physiology, public social square, production deployment, and unsupported provider/device integrations remain outside this UI rewrite unless customer supplies concrete protocols and approval.

## Target Information Architecture

Patient:

- `今日`: next task, blockers, single primary CTA.
- `训练`: preparation checklist, training runtime, result confirmation.
- `记录`: simple history, trend, doctor feedback, plan variety library.
- `我的`: profile, consent, caregiver binding, visible scope.

Doctor:

- `患者队列`: assigned patients, risk, pending work, recent status.
- `评估复核`: MMSE/CDR/AD-8/AI/STT summaries and risk confirmation.
- `计划管理`: plan issue/editing, plan item selection, training preparation creation.
- `训练复核`: new, abnormal, and low-quality result review.

Caregiver:

- `照护`: authorized patient summary and today's reminder.
- `进展`: desensitized recent trend and completed training summary.
- `提醒`: doctor precautions and attention items.
- `我的`: binding relation, authorization state, visible-scope explanation.

Admin/operator/auditor:

- `账号治理`: registration requests, role activation, caregiver accounts.
- `内容治理`: cognitive/movement training content, plan library, release status.
- `配置治理`: provider/runtime readiness and collection condition/protocol readiness.
- `安全审计`: audit search and desensitized export.

## Formal Business Chain

The UI is accepted only when this chain works end to end:

1. Institution account login loads role-specific context.
2. Patient profile, consent, and caregiver binding are visible only within authorized scope.
3. Admin/operator has released formal training content and collection protocols.
4. Doctor reviews assessment evidence and confirms current risk grade.
5. Doctor recommends, adjusts, and confirms an active current rehab plan.
6. Doctor creates a ready training preparation record for the selected plan item and active collection protocol.
7. Patient chooses today's training, completes readiness checks, and starts training.
8. Runtime submits formal metrics and result evidence through existing API contracts.
9. Patient sees simple result and history.
10. Doctor reviews abnormal, low-quality, or new training result.
11. Caregiver sees only desensitized progress and reminders.
12. Admin/auditor can inspect audit and desensitized export with required reason.

## File Responsibility Map

Keep file responsibilities small and explicit:

- `apps/web/src/app/page.tsx`: orchestration only. It may own session state, selected role/screen, API callbacks, and routing between role workspaces. It must not contain large runtime containers, feature markup, provider evidence panels, or admin subforms.
- `apps/web/src/app/globals.css`: global tokens, layout primitives, responsive constraints.
- `apps/web/src/components/ui/*`: shared minimal UI primitives. No business logic.
- `apps/web/src/components/layout/*`: role shell layouts. No provider/runtime logic.
- `apps/web/src/features/patient/*`: patient-facing tasks and copy helpers. No technical vocabulary in visible text.
- `apps/web/src/features/doctor/*`: clinical queue, assessment review, plan editing, result review.
- `apps/web/src/features/caregiver/*`: caregiver summary, progress, alerts, scope. If caregiver remains in `page.tsx` temporarily, the plan must extract it in Unit 8.
- `apps/web/src/features/admin/*`: governance forms, audit, export, provider/runtime readiness.
- `apps/web/src/features/training-runtime/*`: formal runtime wrappers and result adapters that hide engine details from product copy.
- `apps/web/src/lib/*`: pure helpers and contracts. Runtime technical terms are allowed here, but not exported as patient/caregiver visible copy.
- `packages/db/prisma/seed.ts`: deterministic formal seed data, idempotent across repeated runs.
- `scripts/__tests__/*.test.mjs`: source boundary and workflow-contract tests.
- `apps/web/src/lib/*.test.ts`: behavior tests for pure TypeScript helpers, run with `pnpm --filter @rehab-platform/web exec tsx --test`.
- `scripts/web-playwright-regression.spec.mjs`: browser smoke and visual/business-flow regression.

## Execution Rules

- Work one unit at a time.
- For each unit: write or strengthen failing tests first, run and confirm red, implement the smallest complete product change, run focused tests green, run lint where relevant, then continue.
- Each unit ends with a local commit when the user has asked for commits in that execution session; otherwise leave the worktree unstaged and record exact changed files in the final unit summary.
- Prefer subagents for independent review or bounded worker tasks. Do not let subagents edit overlapping files in the same unit unless the write sets are explicitly disjoint.
- Do not rely on source-scan tests alone for behavior that can be tested by pure helper imports or browser/API flows.
- Never revert user or unrelated work in the dirty worktree.
- Use `apply_patch` for manual edits.
- Add English logs only where operationally useful, for example around formal training start/result submission/admin export failure paths. Do not add noisy UI logs.
- Performance and stability take priority over flourish: smaller bundles, role-lazy modules where possible, stable dimensions, no layout shifts, no unnecessary polling.

---

## Unit 0: Rebaseline Scope And Tests

**Purpose:** Lock the new UI direction before touching implementation.

**Files:**

- Modify: `docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md`
- Modify: `docs/superpowers/plans/2026-06-05-docx-delivery-ui-functional-closure.md`
- Modify: `docs/rehab-platform-ui-design-spec.md`
- Modify: `docs/rehab-platform-role-flows-and-pages.md`
- Test: `scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`

- [x] **Step 1: Strengthen scope boundary test**

Add assertions that this plan contains the new product direction and removal boundaries:

```js
for (const phrase of [
  "simple, premium, role-focused rehabilitation product",
  "not a demo screen, technology console, or acceptance package browser",
  "risk measurement support, plan variety, intervention matching, and data collection",
  "Existing training categories remain: `思维训练` and `运动训练`",
  "A formal training loop is incomplete until a doctor reviews the training result",
  "Unit 12: Full Regression And Manual Smoke",
]) {
  assert.match(plan, new RegExp(escapeRegExp(phrase)), `missing phrase: ${phrase}`);
}
```

- [x] **Step 2: Run the red check**

Run:

```bash
node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs
```

Expected before this rewrite is fully reflected in tests: fail on at least one missing phrase.

- [x] **Step 3: Update docs to match the new direction**

Update:

- `docs/superpowers/plans/2026-06-05-docx-delivery-ui-functional-closure.md`: state it remains the formal delivery capability record, not the target UI plan.
- `docs/rehab-platform-ui-design-spec.md`: change the visual direction to `Minimal Premium Clinical`, with less decoration, fewer cards, 8px or smaller card radius where the component is not a patient task surface, and no technology-first modules in patient/caregiver/doctor primary flows.
- `docs/rehab-platform-role-flows-and-pages.md`: keep the four role IA above, and explicitly place runtime/provider/audit evidence under admin/auditor workflows.

- [x] **Step 4: Run Unit 0 verification**

Run:

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
```

Expected: pass.

---

## Unit 1: Minimal Premium Design System

**Purpose:** Replace the current heavy rounded/gradient look with a restrained, high-end product system.

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/ui/Button.tsx`
- Modify: `apps/web/src/components/ui/Card.tsx`
- Modify: `apps/web/src/components/ui/StatusBadge.tsx`
- Modify: `apps/web/src/components/ui/MetricTile.tsx`
- Modify: `apps/web/src/components/ui/PageHeader.tsx`
- Modify: `apps/web/src/components/ui/EmptyState.tsx`
- Test: `scripts/__tests__/minimal-ui-design-system.test.mjs`
- Test: `scripts/__tests__/global-ui-component-boundary.test.mjs`

- [x] **Step 1: Write failing design-system assertions**

In `scripts/__tests__/minimal-ui-design-system.test.mjs`, assert:

```js
const globals = await readFile(join(rootDir, "apps/web/src/app/globals.css"), "utf8");
assert.match(globals, /--color-ink:/);
assert.match(globals, /--color-surface:/);
assert.match(globals, /--color-accent:/);
assert.doesNotMatch(globals, /gradient-orb|bokeh|blob|purple/i);

const card = await readFile(join(rootDir, "apps/web/src/components/ui/Card.tsx"), "utf8");
assert.match(card, /rounded-\[8px\]|rounded-lg|rounded-md/);
assert.doesNotMatch(card, /rounded-\[2[0-9]px\]|rounded-3xl/);

const button = await readFile(join(rootDir, "apps/web/src/components/ui/Button.tsx"), "utf8");
assert.match(button, /focus-visible/);
assert.doesNotMatch(button, /shadow-\[0_18px|rounded-\[22px\]/);
```

- [x] **Step 2: Run red check**

Run:

```bash
node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail on current visual tokens or component shapes.

- [x] **Step 3: Implement restrained tokens and primitives**

Implementation requirements:

- Use a quiet surface system: off-white, ink, muted line, restrained teal accent, small semantic status colors.
- Limit radius to 8px for normal cards/buttons/panels unless an existing patient task component requires a larger touch target container.
- Remove page-level decorative gradients, orbs, bokeh, and large marketing-style hero effects.
- Keep buttons stable-height and icon-friendly; use lucide icons where a command needs an icon.
- Ensure text does not scale with viewport width and letter spacing stays `0`.
- Keep component APIs compatible with current callers.

- [x] **Step 4: Run Unit 1 verification**

Run:

```bash
node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: tests pass; lint has no new errors.

---

## Unit 2: Role-First Shell And Page Decomposition

**Purpose:** Turn `page.tsx` into orchestration and move visible role pages into focused feature modules.

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/components/layout/PatientTaskLayout.tsx`
- Modify: `apps/web/src/components/layout/WorkbenchLayout.tsx`
- Modify: `apps/web/src/components/layout/GovernanceLayout.tsx`
- Add: `apps/web/src/components/layout/RoleShell.tsx`
- Add: `apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx`
- Add: `apps/web/src/features/training-runtime/UnityTrainingSurface.tsx`
- Test: `scripts/__tests__/role-first-shell-navigation.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Test: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`

- [x] **Step 1: Add failing decomposition checks**

Add checks that:

```js
const page = await readFile(join(rootDir, "apps/web/src/app/page.tsx"), "utf8");
assert.doesNotMatch(page, /function UnityGameContainer/);
assert.doesNotMatch(page, /function BrowserPoseGameContainer/);
assert.doesNotMatch(page, /function BrowserPoseEvidencePanel/);
assert.match(page, /BrowserPoseTrainingSurface|UnityTrainingSurface/);
```

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs
```

Expected: fail because `page.tsx` still owns visible runtime/caregiver/evidence components.

- [x] **Step 3: Extract role and runtime surfaces**

Implementation requirements:

- `page.tsx` retains state, handlers, session, API calls, and role switching.
- Extract patient, doctor, and admin visible markup to feature components in this unit. Caregiver extraction is owned by Unit 8 so file ownership remains unambiguous.
- Extract browser pose and Unity runtime containers to `apps/web/src/features/training-runtime/*`.
- Runtime components expose product copy only; internal technical errors are mapped to patient-safe blocking copy.
- Admin security/evidence sections remain in admin modules, not patient result screens.
- Do not introduce fallback behavior while extracting runtime surfaces; if extraction exposes a missing real dependency, record the blocker and keep the formal gate.

- [x] **Step 4: Run Unit 2 verification**

Run:

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: tests pass; lint has no new errors.

---

## Unit 3: Login And Account Entry

**Purpose:** Make entry feel like a real institution product, not a feature demo.

**Files:**

- Modify: `apps/web/src/features/auth/LoginPanel.tsx`
- Modify: `apps/web/src/features/auth/AccountRequestPanel.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `scripts/__tests__/minimal-auth-entry.test.mjs`
- Test: `scripts/__tests__/registration-request-ui.test.mjs`

- [ ] **Step 1: Add failing entry tests**

Assert:

```js
assert.match(loginSource, /机构账号/);
assert.match(loginSource, /登录/);
assert.doesNotMatch(loginSource, /演示|demo|mock|测试账号|技术验收/i);
assert.match(requestSource, /申请开通/);
assert.match(requestSource, /提交审核/);
assert.doesNotMatch(requestSource, /provider|runtime|manifest|Endpoint/i);
```

- [ ] **Step 2: Run red check**

Run:

```bash
node --test scripts/__tests__/minimal-auth-entry.test.mjs scripts/__tests__/registration-request-ui.test.mjs
```

Expected: fail if demo/testing/technical entry copy remains.

- [ ] **Step 3: Implement quiet entry**

Implementation requirements:

- One login panel, one registration request panel.
- No technical feature list, no acceptance language, no demo accounts surfaced in UI.
- Keep existing API login and registration request contracts unchanged.
- On login success, route by role home using existing `roleHome` logic.

- [ ] **Step 4: Run Unit 3 verification**

Run:

```bash
node --test scripts/__tests__/minimal-auth-entry.test.mjs scripts/__tests__/registration-request-ui.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 4: Patient Today, Preparation, Runtime, Result

**Purpose:** Create a simple patient training journey with one obvious action at each step.

**Files:**

- Modify: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/features/patient/patient-training-copy.ts`
- Modify: `apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/UnityTrainingSurface.tsx`
- Test: `scripts/__tests__/patient-training-flow-ia.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Test: `apps/web/src/lib/training-start-readiness.test.ts`

- [ ] **Step 1: Add failing patient-flow assertions**

Assert:

```js
assert.match(todaySource, /data-testid="patient-today-primary-cta"/);
assert.match(prepSource, /data-testid="patient-prep-primary-cta"/);
assert.match(runtimeSource, /完成本次训练/);
assert.match(resultSource, /返回今日训练/);
assert.doesNotMatch(todaySource + prepSource + runtimeSource + resultSource, /采集明细|协议版本|manifest|bridge|runtimeType|provider|Provider|Endpoint|审计\s*ID|审计\s*Id|审计|质量证据|技术验收|质控|fallback|mock|demo/i);
```

- [ ] **Step 2: Run red check**

Run:

```bash
node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/training-start-readiness.test.ts
```

Expected: fail where UI still leaks technical labels or lacks stable CTAs.

- [ ] **Step 3: Implement patient journey**

Implementation requirements:

- `TodayTrainingPage` shows selected/next task, completion, blockers, and one primary CTA.
- `TrainingPrepChecklist` shows only readiness tasks the patient understands: authorization, device, posture/space, doctor arrangement.
- `TrainingRuntimePage` wraps actual runtime surfaces with patient-safe labels and stable controls.
- `TrainingResultPage` shows score, completion, simple feedback, history entry, and doctor review status in patient-safe language.
- Training cannot start unless `resolveTrainingStartReadiness` allows it.
- Do not remove runtime validation; hide it from patient copy.

- [ ] **Step 4: Run Unit 4 verification**

Run:

```bash
node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/training-start-readiness.test.ts
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 5: Patient Records And Plan Variety Library

**Purpose:** Add customer-requested positioning: more plans, risk measurement support, intervention matching, and data collection without making games look complex or technical.

**Files:**

- Modify: `apps/web/src/features/patient/GameLibraryPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Modify: `apps/web/src/features/patient/patient-training-copy.ts`
- Modify: `packages/db/prisma/seed.ts`
- Test: `scripts/__tests__/patient-facing-game-library-boundary.test.mjs`
- Test: `scripts/__tests__/patient-training-task-library.test.mjs`
- Test: `scripts/__tests__/browser-pose-game-library-seed.test.mjs`
- Test: `apps/web/src/lib/browser-pose-game-library.test.ts`

- [ ] **Step 1: Add failing behavior tests for category and purpose**

In a TypeScript behavior test, assert:

```ts
assert.equal(patientTrainingCategoryLabel(["思维训练", "memory", "purpose:risk_assessment"]), "思维训练");
assert.equal(patientTrainingCategoryLabel(["运动训练", "upper_limb", "purpose:data_capture"]), "运动训练");
assert.deepEqual(patientTrainingPurposeLabel(["purpose:risk_assessment", "purpose:intervention", "purpose:data_capture"]), [
  "风险评估辅助",
  "干预训练",
  "数据采集",
]);
assert.deepEqual(patientTrainingPurposeLabel(["unknown-purpose"]), []);
```

Also assert `TrainingTaskPicker.tsx` passes combined `trainingTargets + tags` into `patientTrainingCategoryLabel`, not only `runtimeType`.

- [ ] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/browser-pose-game-library.test.ts
```

Expected: fail if categories/purposes are source-only or inconsistent.

- [ ] **Step 3: Implement plan-variety copy and seed tags**

Implementation requirements:

- `GameLibraryPage` shows `思维训练` / `运动训练` and purposes `风险评估辅助` / `干预训练` / `数据采集`.
- No patient/caregiver visible runtime, provider, engine, manifest, bridge, or license terms.
- Existing games remain available.
- Add formal seed tags for purposes and categories in both `create` and `update` branches.
- Do not default unknown purposes to `干预训练`; unknown values must produce no visible purpose label.
- `TrainingTaskPicker` and `GameLibraryPage` use the same category logic.

- [ ] **Step 4: Run Unit 5 verification**

Run:

```bash
node --test \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/browser-pose-game-library.test.ts
pnpm db:seed
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 6: Doctor Workbench

**Purpose:** Make doctor pages clinically focused and remove patient/admin/demo clutter.

**Files:**

- Modify: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Modify: `apps/web/src/features/doctor/PatientQueue.tsx`
- Modify: `apps/web/src/features/doctor/PatientClinicalSummary.tsx`
- Modify: `apps/web/src/features/doctor/AssessmentReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/PlanEditor.tsx`
- Modify: `apps/web/src/features/doctor/TrainingReviewQueue.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `scripts/__tests__/doctor-workbench-ia.test.mjs`
- Test: `scripts/__tests__/speech-ai-assessment-ui.test.mjs`
- Test: `scripts/__tests__/ai-assessment-ui.test.mjs`

- [ ] **Step 1: Add failing doctor IA tests**

Assert:

```js
for (const copy of ["患者队列", "评估复核", "计划管理", "训练复核"]) {
  assert.match(combined, new RegExp(copy));
}
assert.match(workspaceSource, /data-testid="doctor-primary-workbench"/);
assert.doesNotMatch(workspaceSource, /康复激励|成就|patient-task-nav|Unity loader|manifest|Provider|provider|Endpoint|endpointRef|rawPayload|rawEvidence|auditId|审计\s*ID|验收|fallback|mock|demo/i);
```

- [ ] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/ai-assessment-ui.test.mjs
```

Expected: fail if doctor pages still contain technical/provider surfaces or lack stable workbench structure.

- [ ] **Step 3: Implement doctor workbench**

Implementation requirements:

- Queue first, detail second.
- Keep assessment review summaries structured and clinically readable.
- Allowed doctor-visible fields are scale score, risk grade, assessment summary, doctor conclusion, review status, completion rate, score, duration, abnormal flag, and quality summary.
- Forbidden doctor-visible fields are provider payload, endpoint ref, manifest URL, runtime bridge fields, audit ID, raw evidence JSON, raw motion metric JSON, raw transcript payload, secret ref, and acceptance evidence.
- Plan editor shows current plan, selected content, frequency/duration/difficulty, and preparation creation action.
- Training review queue shows new/abnormal/low-quality records with doctor action.
- Do not expose raw provider payloads or admin evidence.

- [ ] **Step 4: Run Unit 6 verification**

Run:

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/ai-assessment-ui.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 7: Admin Governance Workspaces

**Purpose:** Keep technical/governance capability, but make it clearly admin-only and visually restrained.

**Files:**

- Modify: `apps/web/src/features/admin/AdminOverviewPage.tsx`
- Modify: `apps/web/src/features/admin/AccountReviewPanel.tsx`
- Modify: `apps/web/src/features/admin/TrainingContentGovernance.tsx`
- Modify: `apps/web/src/features/admin/OperationConfigPanel.tsx`
- Modify: `apps/web/src/features/admin/CollectionConditionGovernance.tsx`
- Modify: `apps/web/src/features/admin/StatisticsQueryPanel.tsx`
- Modify: `apps/web/src/features/admin/SecurityAuditPage.tsx`
- Modify: `apps/web/src/features/admin/DesensitizedExportPanel.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `scripts/__tests__/admin-governance-ia.test.mjs`
- Test: `scripts/__tests__/collection-condition-ui.test.mjs`
- Test: `scripts/__tests__/training-capture-layout.test.mjs`

- [ ] **Step 1: Add failing admin boundary tests**

Assert:

```js
for (const copy of ["账号治理", "内容治理", "配置治理", "安全审计"]) {
  assert.match(adminSource, new RegExp(copy));
}
assert.doesNotMatch(adminSource, /TrainingRuntimePage|BrowserPoseTrainingSurface|UnityTrainingSurface|完成本次训练/);
assert.doesNotMatch(adminSource, /demo|mock|fallback/i);
```

- [ ] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs
```

Expected: fail if admin still reads as broad demo dashboard or mounts training runtime surfaces.

- [ ] **Step 3: Implement admin workspaces**

Implementation requirements:

- Split admin page into four visible workspace sections matching target IA.
- Keep provider/runtime/config terms only inside admin configuration and security sections.
- Keep desensitized export behind reason form and existing API.
- Keep audit logs searchable; do not expose audit IDs to patient/caregiver.
- Preserve permission checks.

- [ ] **Step 4: Run Unit 7 verification**

Run:

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 8: Caregiver Workspace

**Purpose:** Extract caregiver UI into its own simple workspace and keep it desensitized.

**Files:**

- Add: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/types/api.ts` if prop typing needs narrowing
- Test: `scripts/__tests__/care-circle-privacy.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`

- [ ] **Step 1: Add failing caregiver extraction tests**

Assert:

```js
const page = await readFile(join(rootDir, "apps/web/src/app/page.tsx"), "utf8");
const caregiver = await readFile(join(rootDir, "apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx"), "utf8");
assert.doesNotMatch(page, /function FamilyScreen/);
for (const copy of ["照护", "进展", "提醒", "我的", "可见范围"]) {
  assert.match(caregiver, new RegExp(copy));
}
assert.doesNotMatch(caregiver, /原始|payload|审计\s*ID|审计\s*Id|导出|Provider|provider|Endpoint|runtime|manifest|质量证据|技术验收|fallback|mock|demo/i);
```

- [ ] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
```

Expected: fail until caregiver is extracted and copy is cleaned.

- [ ] **Step 3: Implement caregiver workspace**

Implementation requirements:

- Show authorized patient summary, today reminder, desensitized trend, doctor precautions, and binding scope.
- No raw assessment text, raw motion metrics, audit IDs, export entry, admin terms, or clinical overclaiming.
- Caregiver cannot modify plans or submit doctor review.

- [ ] **Step 4: Run Unit 8 verification**

Run:

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 9: Seed Idempotency And Formal Data Stability

**Purpose:** Ensure repeated local setup does not create duplicate mutable clinical records or break manual testing.

**Files:**

- Modify: `packages/db/prisma/seed.ts`
- Inspect: `packages/db/prisma/schema.prisma`
- Test: `scripts/__tests__/browser-pose-game-library-seed.test.mjs`
- Test: `scripts/__tests__/formal-acceptance-chain.test.mjs`
- Add: `scripts/verify-seed-idempotency.mjs`
- Add: `scripts/__tests__/seed-idempotency-script.test.mjs`

- [ ] **Step 1: Add failing seed idempotency tests**

In `scripts/__tests__/browser-pose-game-library-seed.test.mjs`, assert the seed does not use unguarded mutable clinical creates:

```js
const forbiddenCreatePatterns = [
  /prisma\.consentRecord\.create\(/,
  /prisma\.assessmentRecord\.create\(/,
  /prisma\.riskGradeRecord\.create\(/,
  /prisma\.aiAnalysisRecord\.create\(/,
  /prisma\.rehabPlan\.create\(/,
  /prisma\.rehabPlanItem\.create\(/,
  /prisma\.planAdjustmentRecord\.create\(/,
  /prisma\.auditLog\.createMany\(/,
];
for (const pattern of forbiddenCreatePatterns) {
  assert.doesNotMatch(seedSource, pattern, `seed contains unguarded mutable create: ${pattern}`);
}
assert.match(seedSource, /upsert/);
assert.match(seedSource, /SEED_/);
```

If a model has no unique business key, the implementation must use a fixed seed `id` or a stable `findFirst` plus update/create-if-missing pattern. Do not delete existing data.

- [ ] **Step 2: Add failing database idempotency verifier**

Create `scripts/verify-seed-idempotency.mjs`:

```js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const snapshot = await readSeedSnapshot();
  if (!snapshot.seedPatient) {
    throw new Error("Seed patient is missing; run pnpm db:seed before verifier.");
  }
  console.log(JSON.stringify(snapshot, null, 2));
} finally {
  await prisma.$disconnect();
}

async function readSeedSnapshot() {
  const seedPatient = await prisma.patientProfile.findFirst({
    where: { medicalRecordNo: "SEED-ALZ-0001" },
    select: { id: true },
  });
  if (!seedPatient) {
    return { seedPatient: false };
  }
  const where = { patientId: seedPatient.id };
  return {
    seedPatient: true,
    consentRecords: await prisma.consentRecord.count({ where }),
    assessmentRecords: await prisma.assessmentRecord.count({ where }),
    riskGradeRecords: await prisma.riskGradeRecord.count({ where }),
    rehabPlans: await prisma.rehabPlan.count({ where }),
    currentRehabPlans: await prisma.rehabPlan.count({
      where: { ...where, status: "current" },
    }),
    trainingSessions: await prisma.trainingSession.count({ where }),
    trainingResults: await prisma.trainingResult.count({ where }),
  };
}
```

Create `scripts/__tests__/seed-idempotency-script.test.mjs` to assert this verifier exists, imports `PrismaClient`, checks `SEED-ALZ-0001`, prints JSON, and reports `currentRehabPlans`.

- [ ] **Step 3: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/seed-idempotency-script.test.mjs
```

Expected: fail if seed still appends consent, assessment, risk, AI, plan, adjustment, or audit rows on every run.

- [ ] **Step 4: Implement deterministic seed**

Implementation requirements:

- Use fixed IDs or true `upsert` for patient, consent, assessment, risk, AI analysis, current rehab plan, plan items, preparation/session seed records, adjustment records, and audit logs.
- Use existing unique constraints where available, especially `[rehabPlanId, gameContentId]` for plan items.
- Never end the current plan and create a new current plan on every seed run.
- Preserve formal content tags from Unit 5 in both create and update paths.
- Do not run destructive deletes or resets.

- [ ] **Step 5: Run Unit 9 verification**

Run:

```bash
node --test \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/seed-idempotency-script.test.mjs
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
```

Expected: both seed runs succeed; verifier output remains stable for mutable formal records and `currentRehabPlans` remains `1`.

---

## Unit 10: API Business Closure And Error Stability

**Purpose:** Confirm the new UI still calls real APIs and does not hide broken business states behind local UI assumptions.

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Modify: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Modify: `apps/web/src/features/admin/AdminOverviewPage.tsx`
- Test: `scripts/__tests__/formal-acceptance-chain.test.mjs`
- Test: `scripts/__tests__/trial-empty-loop-collection-chain.test.mjs`
- Test: `scripts/__tests__/empty-real-loop-orchestrator.test.mjs`
- Test: `apps/api/src/app.controller.spec.ts`

- [ ] **Step 1: Add failing API closure assertions**

Assert:

```js
assert.doesNotMatch(webSource, /localStorage.*trainingResult|Math\.random\(\).*score|mock|demo|fallback/i);
assert.match(apiSource, /startTrainingSession/);
assert.match(apiSource, /submitTrainingResult/);
assert.match(apiSource, /reviewTrainingResult/);
```

- [ ] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/trial-empty-loop-collection-chain.test.mjs \
  scripts/__tests__/empty-real-loop-orchestrator.test.mjs
pnpm --filter @rehab-platform/api exec jest apps/api/src/app.controller.spec.ts
```

Expected: fail if any UI path bypasses formal APIs or hides errors.

- [ ] **Step 3: Implement API closure fixes**

Implementation requirements:

- All training start, result submit, plan confirm, preparation, review, caregiver summary, audit, and export actions use `apps/web/src/lib/api.ts`.
- UI copy can be patient-safe, but state must be truthful: blocked, waiting, failed, ready, complete.
- Error logs in API-facing actions should be concise English operational logs where they help diagnose real failures.
- No fallback or local fake success state.

- [ ] **Step 4: Run Unit 10 verification**

Run:

```bash
node --test \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/trial-empty-loop-collection-chain.test.mjs \
  scripts/__tests__/empty-real-loop-orchestrator.test.mjs
pnpm --filter @rehab-platform/api exec jest apps/api/src/app.controller.spec.ts
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 11: Browser Regression And Visual QA

**Purpose:** Verify the rebuilt UI in a real browser across roles and screen sizes.

**Files:**

- Modify: `scripts/web-playwright-regression.spec.mjs`
- Modify: `scripts/playwright-regression.config.mjs`
- Add: `scripts/formal-ui-business-chain.spec.mjs`
- Add screenshots only if the existing regression workflow stores them intentionally
- Test: `scripts/web-playwright-regression.spec.mjs`
- Test: `scripts/formal-ui-business-chain.spec.mjs`

- [ ] **Step 1: Add failing Playwright role smoke checks**

Add role smoke checks:

```js
await expect(page.getByRole("button", { name: /登录/ })).toBeVisible();
await expect(page.getByText("今日训练")).toBeVisible();
await expect(page.getByText("患者队列")).toBeVisible();
await expect(page.getByText("账号治理")).toBeVisible();
await expect(page.getByText("照护")).toBeVisible();
await expect(page.getByText(/manifest|Provider|Endpoint|fallback|mock|demo/i)).toHaveCount(0);
```

Use exact selectors that match the implemented pages; do not add broad waits to mask slowness.

- [ ] **Step 2: Add failing full business-chain Playwright check**

Create `scripts/formal-ui-business-chain.spec.mjs` to exercise the seeded formal browser path without mocks:

```js
import { expect, test } from "@playwright/test";

test("formal UI chain reaches reviewed training and desensitized caregiver summary", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("账号").fill("doctor.seed@rehab.local");
  await page.getByLabel("密码").fill("RehabSeed#2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("患者队列")).toBeVisible();
  await page.getByText("评估复核").click();
  await page.getByRole("button", { name: /确认风险|保存风险/ }).click();
  await page.getByText("计划管理").click();
  await page.getByRole("button", { name: /确认计划|下发计划|创建训练准备/ }).click();

  await page.goto("/");
  await page.getByLabel("账号").fill("patient.seed@rehab.local");
  await page.getByLabel("密码").fill("RehabSeed#2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("今日训练")).toBeVisible();
  await page.getByTestId("patient-today-primary-cta").click();
  await page.getByTestId("patient-prep-primary-cta").click();
  await page.getByRole("button", { name: "完成本次训练" }).click();
  await expect(page.getByText("返回今日训练")).toBeVisible();

  await page.goto("/");
  await page.getByLabel("账号").fill("doctor.seed@rehab.local");
  await page.getByLabel("密码").fill("RehabSeed#2026");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("训练复核").click();
  await page.getByRole("button", { name: /提交复核|保存复核/ }).click();

  await page.goto("/");
  await page.getByLabel("账号").fill("caregiver.seed@rehab.local");
  await page.getByLabel("密码").fill("RehabSeed#2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("照护")).toBeVisible();
  await expect(page.getByText(/raw|payload|Provider|Endpoint|manifest|审计 ID/i)).toHaveCount(0);

  await page.goto("/");
  await page.getByLabel("账号").fill("auditor.seed@rehab.local");
  await page.getByLabel("密码").fill("RehabSeed#2026");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("安全审计").click();
  await page.getByLabel(/导出原因|申请原因/).fill("Formal UI regression");
  await page.getByRole("button", { name: /脱敏导出|导出/ }).click();
  await expect(page.getByText(/导出成功|已生成|已提交/)).toBeVisible();
});
```

If the seeded account names differ, update this test and `packages/db/prisma/seed.ts` together in Unit 9 so the formal browser chain has deterministic credentials. Do not introduce browser-local credentials or a mock login path.

- [ ] **Step 3: Run red check**

Run:

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
```

Expected: fail where screens are not yet reachable, business actions do not use real API state, deterministic seed users are missing, or copy leaks remain.

- [ ] **Step 4: Implement browser-facing fixes**

Implementation requirements:

- Desktop and mobile nav fit without overlap.
- Patient runtime canvas/video areas have stable aspect ratios and do not push CTAs off-screen.
- No text overflow in buttons, cards, bottom nav, or status badges.
- No page reads as a landing page or technology demo.
- Keep dev server and API usage consistent with existing Playwright config.
- The full browser chain must perform real login, real doctor plan/preparation action, real patient training submission, real doctor review, real caregiver summary read, and real admin/auditor export request against seeded data.

- [ ] **Step 5: Run Unit 11 verification**

Run:

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

---

## Unit 12: Full Regression And Manual Smoke

**Purpose:** Prove the rewrite is complete before claiming done.

**Files:**

- Modify: `docs/web-playwright-regression-runbook.md`
- Modify: `docs/formal-acceptance-chain-runbook.md`
- Modify: `docs/customer-delivery-progress-and-input-summary.md`
- Test: all affected automated suites

- [ ] **Step 1: Run focused source and behavior tests**

Run:

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  apps/web/src/lib/browser-pose-game-library.test.ts \
  apps/web/src/lib/training-start-readiness.test.ts \
  apps/web/src/lib/browser-pose-training-result.test.ts \
  apps/web/src/lib/unity-training-bridge.test.ts
```

Expected: pass.

- [ ] **Step 2: Run service and seed verification**

Run:

```bash
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/api exec jest
pnpm db:seed
pnpm verify:contracts
pnpm verify:formal-acceptance-chain
```

Expected: pass.

- [ ] **Step 3: Run browser regression**

Run:

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
```

Expected: pass across configured desktop/mobile projects.

- [ ] **Step 4: Manual smoke checklist**

Start the product:

```bash
pnpm infra:up
pnpm db:seed
pnpm dev
```

Open the Web URL printed by the dev server, usually `http://localhost:3000`.

Manual checks:

- Login as patient: verify `今日 -> 训练 -> 记录 -> 我的`, no technical terms, no demo copy.
- Login as doctor: verify `患者队列 -> 评估复核 -> 计划管理 -> 训练复核`, plan and review actions use real API states.
- Login as caregiver: verify `照护 -> 进展 -> 提醒 -> 我的`, desensitized only.
- Login as admin/auditor: verify `账号治理 -> 内容治理 -> 配置治理 -> 安全审计`, export reason required, audit remains admin-only.
- Complete the deterministic seeded formal browser path from doctor preparation through patient result, doctor review, caregiver summary, and admin/auditor export. If a required real dependency is unavailable, record the exact blocker and do not add fallback.

- [ ] **Step 5: Update runbooks and progress docs**

Update:

- `docs/web-playwright-regression-runbook.md`: record how to run the new role smoke.
- `docs/formal-acceptance-chain-runbook.md`: record the rebuilt UI path through the formal chain.
- `docs/customer-delivery-progress-and-input-summary.md`: state that the UI was rebuilt as minimal premium, technical/demo surfaces were hidden from product flows, and customer-requested plan variety/risk/intervention/data-collection framing is included.

- [ ] **Step 6: Completion review**

Use `superpowers:requesting-code-review` for a final whole-branch review. The final review must check:

- Patient/caregiver visible copy has no forbidden technical terms.
- Doctor pages do not expose raw provider/runtime/evidence internals.
- Admin pages do not mount training runtime.
- Seed is idempotent.
- Formal chain and Playwright regression pass.
- Full browser business-chain regression passes.
- No fallback/mock/demo behavior was introduced.

Only after this review and all commands pass may this plan be marked complete.

## Completion Criteria

This plan is complete only when all of the following are proven by current evidence:

- Units 0 through 12 are checked off.
- All listed focused tests pass.
- `pnpm --filter @rehab-platform/web lint` passes.
- `pnpm --filter @rehab-platform/api exec jest` passes.
- `pnpm db:seed` passes twice without duplicate mutable clinical seed records.
- `pnpm verify:contracts` passes.
- `pnpm verify:formal-acceptance-chain` passes.
- `pnpm test:playwright` passes.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs` passes.
- Manual smoke confirms the UI is simple, premium, role-focused, and free of demo/technical product clutter.
- No fallback/mock/demo/silent-downgrade strategy was added, requested, or routed around.
