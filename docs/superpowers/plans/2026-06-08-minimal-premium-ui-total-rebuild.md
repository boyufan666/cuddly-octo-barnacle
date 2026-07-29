# Minimal Premium UI Total Rebuild Implementation Plan

> **Superseded for remaining UI execution:** Units 0-11 in this plan recorded useful completed groundwork. Current UI closure work is now governed by `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`, which consolidates the latest complete-overhaul decision and remaining verification gaps.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Web UI from the product surface down into a simple, premium, role-focused rehabilitation platform while keeping the real business chain fully runnable: account access, consent, assessment, plan, preparation, training, result, doctor review, caregiver summary, governance, audit, and desensitized export.

**Architecture:** Treat `apps/web/src/app/page.tsx` as a temporary migration source, not the target UI. Build small role workspaces around real API contracts and formal runtime modules; move display logic, action orchestration, and form models into feature-owned files; keep technical/provider/runtime/audit evidence out of patient, caregiver, and doctor primary flows and only expose it inside admin/auditor governance where business permissions allow it.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, lucide-react, NestJS, Prisma/PostgreSQL, node:test, tsx TypeScript tests, Jest, Playwright.

---

## Why This Supersedes The Previous UI Plan

The previous plan at `docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md` improved the existing UI incrementally. This plan supersedes it for the UI layer because the current requirement is to push the UI over and rebuild it as a product-quality surface:

- The interface must be minimal, premium, calm, and business-first.
- The page must not look like a demo, technical console, acceptance package, or engineering showcase.
- Extra demonstration and technology-oriented modules must disappear from primary role flows.
- Business logic must continue to use real APIs and formal runtime contracts.
- Existing game work remains; the customer request is more plan variety and better disease-risk/intervention/data-collection framing, not more complex games.
- Training categories stay aligned to the previous classification: `思维训练` and `运动训练`.

## Current Evidence

Read-only exploration and Units 0-5 found these current-state facts:

- `apps/web/src/app/page.tsx` is now a thin 7-line entry that renders `RoleWorkspace`; the remaining migration risk is `apps/web/src/features/session/role-workspace.tsx`, which is still about 10,656 lines and owns many doctor, admin, caregiver, form, and action boundaries that later units must extract.
- Patient feature modules already exist for `今日`, `训练准备`, runtime, result, profile/authorization, and game library. Units 4-5 proved the patient training start/result path still uses the formal API chain and the game library now carries `思维训练` / `运动训练` plus `风险评估辅助` / `干预训练` / `数据采集`.
- `apps/web/src/app/globals.css` and `apps/web/src/components/ui/*` now have the restrained token direction, but later feature modules must keep removing raw colors, nested card stacks, local layout aliases, and technology-heavy visible copy.
- Runtime implementation files must remain technical internally because browser pose and Unity are real adapters. The patient-visible JSX slices and patient preparation errors still need stronger tests so terms such as `Unity loader`, `manifest`, `bridge`, `关键点`, `置信度`, `体感训练状态`, `采集明细`, or raw runtime exceptions never leak into the product surface.
- The real business chain is represented across `apps/web/src/lib/api.ts`, `apps/web/src/types/api.ts`, `apps/api/src/app.service.ts`, `apps/api/src/app.controller.ts`, `packages/db/prisma/seed.ts`, and existing tests. The rebuild must preserve this chain rather than replacing it with local UI state.
- Current environment note: `pnpm db:seed` cannot be proven locally until PostgreSQL on `localhost:55432` is available. `pnpm infra:up` and `colima start` have failed because the Docker/Colima environment is unavailable; this is an environment blocker, not permission to add fallback or fake data.

## Product Direction

Visual and interaction target:

- Quiet clinical premium: off-white surfaces, crisp ink, restrained teal accent, small semantic status colors, compact 8px radius, low shadow, no decorative orbs/blobs/bokeh/glass effects.
- Simple screens with one obvious primary action.
- The patient must always be able to find the next action: after login the four visible entries are exactly `今日`, `训练`, `记录`, and `我的`; training preparation is inside `训练`, and every blocking state explains the next business action in plain language.
- No landing page after login; enter the role workspace immediately.
- No visible feature marketing, keyboard-shortcut explanation, or technical implementation explanation in the app.
- No nested cards. Use full-width bands, sparse panels, compact tables, and stable task rows.
- Text must not overlap, overflow buttons, or scale with viewport width.
- Mobile navigation must remain stable with safe-area padding and no horizontal scroll.

Business target:

- The platform helps measure potential disease-risk signals, supports doctor review, offers multiple rehab/intervention plans, and collects structured training data.
- Games are deliberately simple. The plan library and intervention matching are the value, not game complexity.
- Patient-facing training labels are `思维训练` and `运动训练`, plus purpose labels such as `风险评估辅助`, `干预训练`, and `数据采集`.

## Non-Negotiable Boundaries

- Do not add fallback, mock, demo, local-only, browser-local, generated evidence, fixed-score, hand-filled runtime result, silent downgrade, auto-recovery, or fake-success behavior. If a real dependency is missing and a fallback appears necessary, stop that unit and record the blocker. The fallback must not be implemented unless the user explicitly approves it first.
- Do not delete or weaken the formal runtime path. Training start and result submission must use real API contracts and formal runtime result adapters.
- Patient and caregiver UI must not show: `engine`, `license`, `sensing`, `MediaPipe`, `Phaser`, `Unity loader`, `manifest`, `bridge`, `runtimeType`, `provider`, `Provider`, `Endpoint`, `adapter`, `debug`, `dev`, `local`, `audit ID`, `auditId`, `审计ID`, `审计 Id`, raw evidence, raw payload, original transcript payload, export governance, quality evidence, `质量证据`, acceptance package, `技术验收`, secret reference, `fallback`, `mock`, or `demo`.
- Patient runtime and preparation UI must not show raw runtime/vision details such as `关键点`, `平均置信度`, `采样帧`, `有效帧率`, `姿态帧`, `协议版本`, `资源清单`, `体感训练状态`, `采集明细`, `回传`, or raw `poseError` / exception strings. Show plain blocking copy instead, for example `动作识别不稳定，请调整站位后重试`.
- Doctor UI may show clinical evidence summaries and business quality summaries, but must not show raw provider payloads, endpoint refs, runtime manifests, audit IDs, raw motion metric JSON, raw transcript payloads, hashed payload internals, or acceptance evidence.
- Admin/auditor UI may show governance details, runtime readiness, quality evidence, audit, and export controls, but must not mount patient training runtime components.
- AI draft, speech transcript, and AI conversation outputs cannot become formal assessment records without doctor human review.
- Patient training preparation cannot create a replacement collection batch. It can only read and use ready formal preparation/collection state.
- A formal training loop is incomplete until the doctor reviews the training result.
- `公开社交广场` remains outside this UI rebuild. The customer must first confirm visibility, moderation, reporting, blocking, privacy, clinical review, audit, and retention responsibilities before any public social surface is designed or implemented.
- `穿戴设备生理指标采集` remains outside this UI rebuild. The customer must first confirm device model, SDK/API/protocol, sampling rules, thresholds, authorization scope, and field evidence before wearable physiology data is collected, displayed, or claimed.

## Target Information Architecture

Patient:

- `今日`: next task, blocker state, one primary CTA.
- `训练`: preparation checklist, runtime, result confirmation.
- `记录`: recent history, trend, doctor feedback, plan variety library.
- `我的`: profile, consent, caregiver binding, visible scope.

Patient findability contract:

- `今日` answers "what should I do now?" with one primary CTA: `开始训练准备` when a task is ready, `查看今日训练记录` when today's tasks are complete, or one truthful blocker message.
- `训练` answers "how do I prepare and train?" with the sequence `训练安排 -> 摄像头/设备 -> 动作识别/站位 -> 开始训练`. It may enter runtime after the formal start succeeds, but it must not expose internal runtime setup words.
- `记录` answers "what happened?" with recent result, trend, doctor-safe feedback, and the plan variety library. The library is grouped by `思维训练` and `运动训练`; game complexity stays low and plan variety is the product value.
- `我的` answers "what is shared and authorized?" with profile, consent, caregiver binding, visible scope, and secondary buttons for assessment/device checks. It must not become a technical settings page.
- Assessment, device checks, and game library are secondary flows inside these four entries. They must not expand the patient primary navigation or make the patient search through a console-like feature list.

Doctor:

- `患者队列`: assigned patients, risk, pending work, recent status.
- `评估复核`: MMSE/CDR/AD-8/AI/STT summaries and doctor confirmation.
- `计划管理`: plan recommendation, adjustment, issue, and preparation creation.
- `训练复核`: new, abnormal, or low-quality results requiring doctor review.

Caregiver:

- `照护`: authorized patient summary and today reminder.
- `进展`: desensitized trend and completed training summary.
- `提醒`: doctor precautions and attention items.
- `我的`: binding relation, authorization state, visible-scope explanation.

Admin/operator/auditor:

- `账号治理`: registration requests, role activation, caregiver accounts.
- `内容治理`: cognitive/movement game content, plan library, release status.
- `配置治理`: runtime readiness, collection condition, protocol readiness.
- `安全审计`: audit search, quality evidence, desensitized export.

## Real Business Chain To Preserve

1. Institution login through `api.login` and session restore through `api.me`.
2. Role context loads authorized patient, doctor, caregiver, admin, and auditor scopes.
3. Patient profile, consent, and caregiver bindings are visible only within authorized scope.
4. Admin/operator releases formal training content and collection protocols.
5. Doctor reviews assessment evidence and confirms the current risk grade.
6. Doctor recommends, adjusts, and confirms a current rehab plan.
7. Doctor or authorized staff creates ready training preparation/collection batch records.
8. Patient selects today's training and completes readiness checks.
9. Runtime submits formal metrics and result evidence through `api.submitTrainingResult`.
10. Patient sees a simple result and history.
11. Doctor reviews the new/abnormal/low-quality training result.
12. Caregiver sees only desensitized progress and reminders.
13. Admin/auditor inspects audit and requests desensitized export with a required reason.

Critical API/data fields that must remain intact include:

- Role context: `primaryRole`, `patientIds`, `caregiverPatientIds`, `doctorPatientIds`, `doctorIds`, `organizationIds`, `caregiverScopes`, `adminPermissions`.
- Consent: `consentType`, `status`, `consentVersion`, `evidenceSnapshot`, `grantedAt`, `revokedAt`.
- Training content: `runtimeType`, `manifestUrl`, `buildBaseUrl`, `gameVersion`, `bridgeProtocolVersion`, `buildStatus`, `releaseChannel`, `supportsCamera`, `supportsMicrophone`, `supportedInputModes`, `requiredMetrics`, `difficultyPolicy`, `dynamicDifficultyTriggers`, `requiredPermissions`, `resultSchema`, `publishedStatus`, `status`.
- Collection chain: `conditionId`, `protocolId`, `protocolVersion`, `conditionSnapshot`, `protocolSnapshot`, `consentSnapshot`, `qualityGate`, `samplingConfig`, `qualityRules`.
- Training start: `patientId`, `rehabPlanId`, `planItemId`, `gameContentId`, `collectionBatchId`, `idempotencyKey`, `gameRunId`, `calibrationStatus`, `clientStartedAt`.
- Training result: `score`, `completionRate`, `durationSeconds`, `reactionTimeMs`, `motionAccuracy`, `exerciseIntensity`, `metricsSummary`, `motionMetrics`, `qualityFlag`, `qualityReasons`, `abnormalFlag`.
- Dynamic difficulty evidence: `dynamicDifficultyEvidence`, `startingDifficultyLevel`, `startingLevelSource`, `assessmentSourceId`, `approvedPlanItemId`, `runtimeFrameId`, `runtimeWindowId`, `triggerReason`, `safetyClampReason`.
- Doctor review: `reviewConclusion`, `reviewNote`, `reviewStatus`, `reviewedByUserId`, `reviewedAt`.

## File Responsibility Map

Target ownership:

- `apps/web/src/app/page.tsx`: shell assembly only during the final state. It may own session bootstrap, role home resolution, global action status, and top-level workspace selection. It must not own visible role page markup, runtime adapters, payload builders, admin subforms, or page-local UI primitives.
- `apps/web/src/app/globals.css`: tokens and global layout primitives only.
- `apps/web/src/components/ui/*`: shared primitives with no business logic.
- `apps/web/src/components/layout/*`: role shell and workspace layout only.
- `apps/web/src/features/auth/*`: login and account request.
- `apps/web/src/features/session/*`: session bootstrap, role context, route selection, role data loading, typed action status.
- `apps/web/src/features/patient/*`: patient-facing tasks and copy helpers.
- `apps/web/src/features/doctor/*`: patient queue, assessment review, plan management, training review.
- `apps/web/src/features/caregiver/*`: caregiver summary, progress, reminders, scope.
- `apps/web/src/features/admin/*`: account/content/config/security/audit/export governance.
- `apps/web/src/features/training-runtime/*`: browser pose and Unity runtime wrappers/result adapters.
- `apps/web/src/lib/*`: pure helpers and API contracts. Runtime technical names are allowed in implementation, not patient/caregiver visible copy.
- `scripts/__tests__/*.test.mjs`: source-boundary and workflow-contract tests.
- `apps/web/src/lib/*.test.ts`: pure behavior tests.
- `scripts/web-playwright-regression.spec.mjs`: role smoke and responsive browser regression.

Interim extraction checkpoint:

- After Unit 5, `page.tsx` is thin but `features/session/role-workspace.tsx` remains the large migration file. Units 6-10 must keep reducing it by moving real role screens and action builders into `features/training-runtime`, `features/doctor`, `features/caregiver`, and `features/admin`.
- Do not create a new monolithic replacement file. Each extraction unit must leave `role-workspace.tsx` with fewer visible screen functions or payload builders, while preserving the same real API path and test coverage.

Migration rule:

- Code can be copied out of `page.tsx` into focused modules only when the behavior and API call path are preserved by tests.
- Static explanatory feature modules must either become real API-connected workspace modules or be removed from primary navigation.
- Do not delete existing runtime/library/business helpers merely because they are technical; move the UI exposure to the correct admin or internal layer.

## Execution Rules

- Work one unit at a time.
- For each unit: write/strengthen failing tests first, run and confirm red, implement the smallest complete product change, run focused tests green, run lint/type checks where relevant, then continue.
- Prefer subagents for independent read-only review or disjoint implementation slices.
- Do not let subagents edit overlapping files in the same unit.
- Use `apply_patch` for manual edits.
- Do not revert unrelated dirty worktree changes.
- Add English operational logs only where they help diagnose real API/runtime failures, for example formal training start/result submission/admin export failure paths. Do not add noisy UI logs.
- Performance and stability have priority: small modules, no unnecessary polling, stable dimensions, no layout shifts, no large decorative assets in operational pages.

---

## Unit 0: Freeze Rebuild Scope And Acceptance Tests

**Purpose:** Make the new rebuild plan authoritative and prevent the implementation from drifting back into the old demo/technical console.

**Files:**

- Create: `docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md`
- Modify: `docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md`
- Modify: `docs/rehab-platform-ui-design-spec.md`
- Modify: `docs/rehab-platform-role-flows-and-pages.md`
- Test: `scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`

- [x] **Step 1: Add failing rebuild-scope assertions**

Add these assertions to `scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs`:

```js
const rebuildPlan = await readFile(
  join(rootDir, "docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md"),
  "utf8",
);

for (const phrase of [
  "This plan supersedes it for the UI layer",
  "simple, premium, calm, and business-first",
  "The page must not look like a demo, technical console, acceptance package, or engineering showcase",
  "Games are deliberately simple",
  "`思维训练` and `运动训练`",
  "风险评估辅助",
  "干预训练",
  "数据采集",
  "Do not add fallback, mock, demo",
  "A formal training loop is incomplete until the doctor reviews the training result",
]) {
  assert.match(rebuildPlan, new RegExp(escapeRegExp(phrase)), `missing rebuild scope: ${phrase}`);
}
```

- [x] **Step 2: Run red check**

Run:

```bash
node --test scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs
```

Expected: fail until the new plan and docs are in place.

Evidence captured during execution: after tightening the IA assertions to the total rebuild plan, this command failed because `docs/rehab-platform-role-flows-and-pages.md` still used the old patient order and caregiver labels. The failure was the expected RED state for Unit 0.

- [x] **Step 3: Update docs to point at this rebuild**

Implementation requirements:

- `docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md` must state that it is superseded for UI rebuild execution by `2026-06-08-minimal-premium-ui-total-rebuild.md`, while its completed analysis remains useful.
- `docs/rehab-platform-ui-design-spec.md` must define the current visual direction as `Minimal Premium Clinical Rebuild`.
- `docs/rehab-platform-role-flows-and-pages.md` must describe the four-role IA from this plan and state that technical/runtime/audit evidence belongs to admin/auditor workflows only.

- [x] **Step 4: Run Unit 0 verification**

Run:

```bash
node --test \
  scripts/__tests__/minimal-premium-ui-scope-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
```

Expected: pass.

Evidence captured during execution: the command passed with `5` tests, `0` failures after aligning the rebuild plan, UI design spec, role-flow IA, removing old patient landing/standalone assessment page residue from the target docs, and adding out-of-scope social/wearable capability gates.

---

## Unit 1: Design Tokens And UI Primitive Reset

**Purpose:** Establish the minimal premium visual system before rebuilding role workspaces.

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

- [x] **Step 1: Strengthen failing primitive assertions**

Add assertions:

```js
const globals = await readFile(join(rootDir, "apps/web/src/app/globals.css"), "utf8");
assert.match(globals, /--radius-card:\s*8px/);
assert.match(globals, /--radius-control:\s*8px/);
assert.doesNotMatch(globals, /gradient-orb|bokeh|blob|glassmorphism|purple/i);
assert.doesNotMatch(globals, /letter-spacing:\s*-/i);

const allPrimitiveSource = await Promise.all([
  "Button.tsx",
  "Card.tsx",
  "StatusBadge.tsx",
  "MetricTile.tsx",
  "PageHeader.tsx",
  "EmptyState.tsx",
].map((file) => readFile(join(rootDir, "apps/web/src/components/ui", file), "utf8")));

const combined = allPrimitiveSource.join("\n");
assert.doesNotMatch(combined, /rounded-3xl|rounded-\[2[0-9]px\]|backdrop-blur|shadow-\[0_18px/i);
assert.match(combined, /focus-visible/);
```

Additional assertions added during execution:

- `global-ui-component-boundary.test.mjs` now reflects the current architecture: `page.tsx` imports `RoleShell`, while `RoleShell.tsx` owns `PatientTaskLayout` composition.
- Shared primitives must not contain raw hex colors; status colors must come from semantic CSS variables.
- Status badges, metric tiles, and page-header action rows must keep stable height, safe wrapping, and responsive shrinking constraints.
- The previous test-level feature-file fallback was removed; missing patient feature files now fail directly instead of slicing legacy `page.tsx`.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail if decorative styling, large radii, missing focus states, or inconsistent tokens remain.

Evidence captured during execution:

- First red check failed after updating stale architecture expectations because `globals.css` lacked semantic status tokens such as `--warning-strong`, and `Button.tsx` still contained `hover:bg-[#8f3030]`.
- Second red check, after adding stable-layout assertions, failed because `StatusBadge.tsx` still used raw hex status colors and lacked `min-h-8`, while `PageHeader.tsx` lacked a wrapping action row.

- [x] **Step 3: Implement token and primitive reset**

Implementation requirements:

- Keep component APIs compatible with current callers.
- Use off-white surfaces, ink text, muted lines, restrained teal accent, and semantic status colors.
- Use 8px or smaller radius for normal controls/cards.
- Use stable heights and responsive constraints for buttons, badges, tiles, and action rows.
- Avoid nested cards and heavy shadows in primitives.
- Keep `type="button"` default and loading/busy accessibility behavior in `Button`.

Implementation completed:

- Added semantic status tokens in `globals.css`: `--warning|danger|success-{strong,soft,line}`.
- Replaced raw hex in shared primitives with semantic CSS variables.
- Preserved `Button` public intents, sizes, default `type="button"`, disabled loading state, and `aria-busy`.
- Added stable UI constraints: `StatusBadge` compact height/no-wrap, `MetricTile` min height/responsive shrink/safe value wrapping, and `PageHeader` wrapping action row.

- [x] **Step 4: Run Unit 1 verification**

Run:

```bash
node --test \
  scripts/__tests__/minimal-ui-design-system.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: tests pass and lint has no new errors.

Verification evidence:

```bash
node --test scripts/__tests__/minimal-ui-design-system.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs
```

Passed with `8` tests, `0` failures.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors. The command still reports `16` existing `@typescript-eslint/no-unused-vars` warnings in the legacy `page.tsx` and `CollectionConditionGovernance.tsx`; these were not introduced by Unit 1 and remain scheduled for later extraction/cleanup units.

Review evidence:

- Unit 1 specification review: PASS.
- Unit 1 code-quality review initially found one test-level fallback in `global-ui-component-boundary.test.mjs`; it was removed and verification was rerun green.

---

## Unit 2: Thin App Entry And Role Shell Rebuild

**Purpose:** Replace the current giant entry page with a role shell that delegates real work to feature modules.

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/layout/RoleShell.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/components/layout/PatientTaskLayout.tsx`
- Create: `apps/web/src/features/session/role-navigation.ts`
- Create: `apps/web/src/features/session/role-workspace.tsx`
- Create: `apps/web/src/features/session/useRoleSession.ts`
- Create: `apps/web/src/features/session/useRoleData.ts`
- Test: `scripts/__tests__/role-first-shell-navigation.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Test: `scripts/__tests__/global-ui-component-boundary.test.mjs`

- [x] **Step 1: Add failing thin-entry assertions**

Add assertions to `scripts/__tests__/role-first-shell-navigation.test.mjs`:

```js
const page = await readFile(join(rootDir, "apps/web/src/app/page.tsx"), "utf8");
const roleNavigation = await readFile(
  join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
  "utf8",
);
const workspace = await readFile(
  join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
  "utf8",
);

assert.ok(page.split("\n").length < 1800, "page.tsx must be a thin app entry");
assert.doesNotMatch(page, /function (TodayScreen|PrepScreen|GameScreen|ResultScreen|FamilyScreen|DoctorScreen|AdminScreen|SecurityScreen)\b/);
assert.doesNotMatch(page, /const (patientTaskNavItems|doctorNavItems|adminNavItems|caregiverNavItems)\b/);
assert.doesNotMatch(page, /function (buildGameContentCreatePayload|buildUnityBuildPayload|buildCollectionConditionPayload)\b/);
assert.doesNotMatch(page, /function (GlassCard|PrimaryButton|DashboardShell|FieldLine|SelectField)\b/);
assert.match(roleNavigation, /patientTaskNavItems/);
assert.match(roleNavigation, /doctorNavItems/);
assert.match(roleNavigation, /adminNavItems/);
assert.match(roleNavigation, /caregiverNavItems/);
assert.match(workspace, /RoleWorkspace/);
```

Additional assertions added during execution:

- `page.tsx` must import and render `<RoleWorkspace />` and stay below `1800` lines.
- `RoleWorkspace` must import and call `useRoleSession()` and `useRoleData()`, not keep local top-level `session`/`data` `useState` ownership.
- Existing patient/caregiver/doctor/admin source-boundary tests now scan `role-workspace.tsx` instead of slicing the thin `page.tsx`.
- Tests prevent `page.tsx` from defining local UI primitives, screen functions, navigation arrays, and payload builders.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
```

Expected: fail because `page.tsx` still owns too many role screens and helpers.

Evidence captured during execution: the red check failed because `apps/web/src/features/session/role-workspace.tsx`, `role-navigation.ts`, `useRoleSession.ts`, and `useRoleData.ts` did not exist, and because `page.tsx` still imported role layouts/primitives and owned the full workspace implementation.

- [x] **Step 3: Extract session, navigation, and workspace assembly**

Implementation requirements:

- `page.tsx` keeps only app bootstrap, session restore/login/logout, role context, global action status, and `<RoleWorkspace />`.
- Move role nav configuration and active-nav resolution to `features/session/role-navigation.ts`.
- Move role workspace rendering to `features/session/role-workspace.tsx`.
- Move role data loading to `features/session/useRoleData.ts`; preserve real `api.*` calls and error states.
- Move session bootstrap to `features/session/useRoleSession.ts`; preserve `api.login`, `api.me`, and logout behavior.
- Do not clear real business state as a fake recovery. If a fetch fails, show truthful failed/blocked state.

Implementation completed:

- `apps/web/src/app/page.tsx` is now a 7-line thin entry that renders `<RoleWorkspace />`.
- The previous workspace implementation moved to `apps/web/src/features/session/role-workspace.tsx` as a migration boundary for later role-specific units.
- Role navigation configuration and active nav resolution moved to `features/session/role-navigation.ts`, preserving patient, caregiver anchor, doctor plan/match, and admin duplicate-screen nav behavior.
- `useRoleSession.ts` now owns `api.health`, stored-session restore through `api.me`, login through `api.login`, logout, and 401 session cleanup.
- `useRoleData.ts` now owns the real role-data loading matrix through `api.patient`, role-scoped training/assessment/caregiver/admin calls, `api.adminDashboard`, audit permission gating, and truthful error status.
- Code-quality review found a P1 where `useRoleData` 401 handling was not wired to session cleanup; this was fixed by connecting `onUnauthorized` through `handleUnauthorizedRef` and by setting `登录已过期` status/error in the data hook.

- [x] **Step 4: Run Unit 2 verification**

Run:

```bash
node --test \
  scripts/__tests__/role-first-shell-navigation.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/global-ui-component-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: source tests pass; lint passes; `tsc --noEmit` either passes or reports only pre-existing test-type issues that are recorded with exact file/line evidence before moving on.

Verification evidence:

```bash
node --test scripts/__tests__/role-first-shell-navigation.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/global-ui-component-boundary.test.mjs
```

Passed with `20` tests, `0` failures.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors. It still reports `16` unused warnings in the transitional `role-workspace.tsx` and existing `CollectionConditionGovernance.tsx`; these are not new lint errors and are scheduled for later extraction/cleanup units.

```bash
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Reports only pre-existing test-type issues:

- `apps/web/src/lib/ai-assessment-draft.test.ts:336` (`mmse` property on AD-8 score summary type).
- `apps/web/src/lib/browser-pose-training-result.test.ts:131` (`payload.metricsSummary.profileStats` is `unknown`).

Review evidence:

- Unit 2 specification review: PASS, with P2 notes that non-401 data-load failures currently clear old data truthfully and `role-workspace.tsx` remains a large transition module for later units.
- Unit 2 code-quality review initially found the 401 wiring P1; it was fixed and Unit 2 verification was rerun green.

---

## Unit 3: Quiet Auth Entry

**Purpose:** Make the first screen feel like an institution product, not a demo portal.

**Files:**

- Modify: `apps/web/src/features/auth/LoginPanel.tsx`
- Modify: `apps/web/src/features/auth/AccountRequestPanel.tsx`
- Modify: `apps/web/src/features/session/useRoleSession.ts`
- Test: `scripts/__tests__/minimal-auth-entry.test.mjs`
- Test: `scripts/__tests__/registration-request-ui.test.mjs`

- [x] **Step 1: Add failing auth copy assertions**

Add assertions:

```js
assert.match(loginSource, /机构账号/);
assert.match(loginSource, /登录/);
assert.match(requestSource, /申请开通/);
assert.match(requestSource, /提交审核/);
assert.doesNotMatch(loginSource + requestSource, /演示|demo|mock|测试账号|技术验收|Provider|runtime|manifest|Endpoint|fallback/i);
assert.doesNotMatch(loginSource, /平台能力|功能演示|验收材料|技术模块/);
```

Additional assertions added during execution:

- Unit 3 source tests now read `LoginScreen` and `AdminScreen` from `apps/web/src/features/session/role-workspace.tsx`, while `apps/web/src/app/page.tsx` stays a thin `RoleWorkspace` entry.
- Login entry tests prevent `LoopStrip`, `MetricCard`, and `GlassCard` from returning to the login screen.
- Auth component tests reject raw hex colors in `LoginPanel` and `AccountRequestPanel`.
- Playwright regression source checks now require a browser-level request assertion for `**/auth/registration-requests` and a patient registration request payload.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/minimal-auth-entry.test.mjs \
  scripts/__tests__/registration-request-ui.test.mjs
```

Expected: fail if demo/testing/technical entry copy remains.

Evidence captured during execution:

```bash
node --test scripts/__tests__/minimal-auth-entry.test.mjs scripts/__tests__/registration-request-ui.test.mjs
```

Failed with `2` failing tests after the stronger Unit 3 assertions were added. The expected RED state showed `AccountRequestPanel.tsx` did not yet contain `申请开通` / `提交审核`.

- [x] **Step 3: Implement quiet auth**

Implementation requirements:

- One login panel and one account request panel.
- No technical feature list, no acceptance language, no surfaced demo accounts.
- Preserve existing login and registration request API calls.
- On login success, route to the role home from `features/session/role-navigation.ts`.

Implementation completed:

- `LoginScreen` now renders only `<LoginPanel />` and `<AccountRequestPanel />`; the login-only `LoopStrip`, metric cards, and explanatory `GlassCard` were removed.
- `LoginPanel` copy was tightened to a quiet institution account entry and keeps the real `onLogin(account, password)` callback.
- `AccountRequestPanel` now uses `申请开通` / `提交审核` copy and keeps the real `onSubmit(form)` callback.
- Auth focus rings use design tokens instead of raw hex.
- The account-opening review panel in the migrated admin workspace was tokenized for Unit 3 account-governance styling.
- `scripts/web-playwright-regression.spec.mjs` now includes a real browser request assertion that submitting the visible account-opening form posts to `**/auth/registration-requests` with a structured patient payload and no `fallback|mock|demo` content.

- [x] **Step 4: Run Unit 3 verification**

Run:

```bash
node --test \
  scripts/__tests__/minimal-auth-entry.test.mjs \
  scripts/__tests__/registration-request-ui.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

Verification evidence:

```bash
node --test scripts/__tests__/minimal-auth-entry.test.mjs scripts/__tests__/registration-request-ui.test.mjs
```

Passed with `5` tests, `0` failures.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors. It still reports `16` unused warnings in the transitional `role-workspace.tsx` and existing `CollectionConditionGovernance.tsx`; these match the previously recorded transition warnings and Unit 3 removed the new `LoopStrip` warning it initially caused.

```bash
pnpm --filter @rehab-platform/web exec playwright test --config ../../scripts/playwright-regression.config.mjs --grep "login submits|account request submits"
```

Did not complete because the Playwright web server could not start the API: Prisma reported `P1001` and `Can't reach database server at localhost:55432`, then the web server readiness check timed out after `120000ms`. No fallback or mocked registration success was introduced.

Review evidence:

- Unit 3 specification review: PASS.
- Unit 3 code-quality review initially found raw hex in the related `RegistrationReviewPanel`, a stale unused test read, and missing browser-level registration request coverage; those were fixed.
- Unit 3 code-quality re-review: PASS.

---

## Unit 4: Patient Workspace And Formal Training Journey

**Purpose:** Rebuild patient UI around one task at a time while preserving formal start/result submission.

**Files:**

- Modify: `apps/web/src/features/patient/TodayTrainingPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingResultPage.tsx`
- Modify: `apps/web/src/features/patient/PatientProfilePage.tsx`
- Modify: `apps/web/src/features/patient/patient-training-copy.ts`
- Create: `apps/web/src/features/patient/PatientWorkspacePage.tsx`
- Create: `apps/web/src/features/patient/patient-training-actions.ts`
- Test: `scripts/__tests__/patient-training-flow-ia.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Test: `apps/web/src/lib/training-start-readiness.test.ts`

- [x] **Step 1: Add failing patient workspace assertions**

Add assertions:

```js
const patientWorkspace = await readFile(
  join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
  "utf8",
);
assert.match(patientWorkspace, /今日训练/);
assert.match(patientWorkspace, /训练准备/);
assert.match(patientWorkspace, /训练结果/);
assert.match(patientWorkspace, /我的资料与授权/);
assert.doesNotMatch(patientWorkspace, /Provider|Endpoint|manifest|runtimeType|审计|质量证据|技术验收|fallback|mock|demo/i);
```

Strengthen existing patient-flow assertions:

```js
assert.match(todaySource, /data-testid="patient-today-primary-cta"/);
assert.match(prepSource, /data-testid="patient-prep-primary-cta"/);
assert.match(runtimeSource, /data-testid="patient-training-primary-action"/);
assert.match(resultSource, /返回今日训练/);
assert.doesNotMatch(todaySource + prepSource + runtimeSource + resultSource, /采集批次|采集协议|协议版本|manifest|bridge|runtimeType|provider|审计|质量证据|技术验收|fallback|mock|demo/i);
```

Additional assertions added during execution:

- Patient workspace render is constrained to `primaryRole === "patient"` so doctor `trainingReview/result` is not intercepted by the patient result page.
- Doctor `trainingReview/result` routes render `DoctorScreen`, preserving `TrainingReviewQueue`.
- Training preparation refresh receives the explicit plan item in both auto-entry and manual-sync paths.
- `PatientTrainingSessionFormState` includes formal `metricsSummary` and `motionMetrics`.
- Patient visible feature modules use design tokens instead of raw hex/`rgba`.
- Patient result copy does not pass raw enum values through to visible UI.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/training-start-readiness.test.ts
```

Expected: fail if technical copy leaks or patient workspace is not extracted.

Evidence captured during execution:

- `node --test scripts/__tests__/patient-training-flow-ia.test.mjs` initially failed because `PatientTrainingSessionFormState` was missing `metricsSummary`/`motionMetrics`, patient workspace rendering was not role-constrained, and `handleRefreshTrainingPreparation()` did not accept an explicit plan-item override.
- After adding stricter route coverage, the same test failed because doctor `trainingReview/result` did not yet render `DoctorScreen`.
- After expanding patient-visible raw-color coverage, the same test failed because `GameLibraryPage.tsx`, `AssessmentDialoguePage.tsx`, and `PatientHomeNav.tsx` still contained raw hex/`rgba`.
- These RED failures confirmed the new assertions caught the intended Unit 4 risks before implementation.

- [x] **Step 3: Implement patient journey**

Implementation requirements:

- `PatientWorkspacePage` owns patient screens and receives typed action callbacks.
- `TodayTrainingPage` shows next task, completed state, blockers, and one primary CTA.
- `TrainingPrepChecklist` shows only patient-understandable checks: doctor arrangement, authorization, camera/device, posture/space.
- `TrainingRuntimePage` wraps real runtime surfaces and keeps one primary action region.
- `TrainingResultPage` shows score, completion, duration, simple feedback, history entry, and doctor review status in patient-safe copy.
- `PatientProfilePage` shows profile, consent, caregiver binding, and visible scope without internal IDs or audit words.
- `patient-training-actions.ts` contains patient-facing action state mapping and keeps formal API errors truthful.
- Training cannot start unless `resolveTrainingStartReadiness` permits it.

Implementation completed during execution:

- Created `PatientWorkspacePage` and `patient-training-actions.ts`; moved patient `today/prep/game/result/profile` flow behind a patient-only workspace entry.
- Kept formal training start/result submission in `role-workspace.tsx` using real `api.startTrainingSession` and `api.submitTrainingResult`; no fallback/mock/demo/local fake success was added.
- Added explicit plan-item propagation for training-preparation refresh, including manual "同步训练安排".
- Routed doctor `trainingReview/result` to `DoctorScreen`, preserving the doctor `TrainingReviewQueue`.
- Added `metricsSummary` and `motionMetrics` to the patient runtime form state so runtime draft, workspace state, and formal submit payload remain aligned.
- Tokenized patient-visible modules, including `TodayTrainingPage`, `TrainingTaskPicker`, `TrainingPrepChecklist`, `TrainingRuntimePage`, `TrainingResultPage`, `PatientProfilePage`, `GameLibraryPage`, `AssessmentDialoguePage`, and `PatientHomeNav`.
- Added patient-visible technical-copy coverage for `PatientWorkspacePage` and `PatientProfilePage`.

- [x] **Step 4: Run Unit 4 verification**

Run:

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/training-start-readiness.test.ts
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

Evidence captured during execution:

```bash
node --test \
  scripts/__tests__/patient-training-flow-ia.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
```

Passed with `24` tests, `0` failures.

```bash
node --test apps/web/src/lib/training-start-readiness.test.ts
```

Passed with `4` tests, `0` failures. Node still prints the existing `MODULE_TYPELESS_PACKAGE_JSON` warning for this TypeScript test file.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors and `16` existing `@typescript-eslint/no-unused-vars` warnings in transitional `role-workspace.tsx` and `CollectionConditionGovernance.tsx`.

```bash
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Failed only on the known pre-existing test type issues:

- `apps/web/src/lib/ai-assessment-draft.test.ts:336`
- `apps/web/src/lib/browser-pose-training-result.test.ts:131`

Subagent review evidence:

- Unit 4 spec review: PASS.
- Unit 4 code-quality review initially failed on manual preparation refresh and patient-visible raw color coverage; both issues were fixed.
- Unit 4 code-quality re-review: PASS.

---

## Unit 5: Plan Variety And Game Library Framing

**Purpose:** Add the customer-requested disease-risk/intervention/data-collection framing without making games look complex.

**Files:**

- Modify: `apps/web/src/features/patient/GameLibraryPage.tsx`
- Modify: `apps/web/src/features/patient/TrainingTaskPicker.tsx`
- Modify: `apps/web/src/features/patient/patient-training-copy.ts`
- Modify: `packages/db/prisma/seed.ts`
- Test: `scripts/__tests__/patient-facing-game-library-boundary.test.mjs`
- Test: `scripts/__tests__/patient-training-task-library.test.mjs`
- Test: `scripts/__tests__/browser-pose-game-library-seed.test.mjs`
- Test: `apps/web/src/lib/browser-pose-game-library.test.ts`

- [x] **Step 1: Add failing category and purpose tests**

Add behavior assertions:

```ts
assert.equal(patientTrainingCategoryLabel(["思维训练", "memory", "purpose:risk_assessment"]), "思维训练");
assert.equal(patientTrainingCategoryLabel(["运动训练", "upper_limb", "purpose:data_capture"]), "运动训练");
assert.deepEqual(patientTrainingPurposeLabel([
  "purpose:risk_assessment",
  "purpose:intervention",
  "purpose:data_capture",
]), ["风险评估辅助", "干预训练", "数据采集"]);
assert.deepEqual(patientTrainingPurposeLabel(["unknown-purpose"]), []);
```

Add source assertions:

```js
assert.match(taskPickerSource, /trainingTargets.*tags|tags.*trainingTargets/);
assert.match(gameLibrarySource, /风险评估辅助/);
assert.match(gameLibrarySource, /干预训练/);
assert.match(gameLibrarySource, /数据采集/);
assert.doesNotMatch(taskPickerSource + gameLibrarySource, /engine|license|sensing|runtimeType|manifest|Provider|fallback|mock|demo/i);
```

Additional assertions added during execution:

- `patient-training-task-library.test.mjs` imports the real `patientTrainingCategoryLabel` and `patientTrainingPurposeLabel` helpers and verifies unknown purpose tags return an empty visible list.
- `TrainingTaskPicker` must combine `trainingTargets` and `tags` before deriving patient-visible category, purpose, and tags.
- `GameLibraryPage` must call `groupPatientGamesByCategory`, show category sections, and include older cognitive games `记忆果篮` and `路径寻宝`.
- `browser-pose-game-library-seed.test.mjs` now covers all patient plan-variety game codes, including `rhythm_reach_3d`, the seven browser-pose games, `memory_path`, `memory_basket`, and `path_treasure`.
- Seed tests require one `trainingTargets` property and one `tags` property in both `update` and `create` branches for every patient plan-variety game.
- Formal plan-variety games must carry all three purpose tags and labels: `purpose:risk_assessment` / `风险评估辅助`, `purpose:intervention` / `干预训练`, and `purpose:data_capture` / `数据采集`.
- `apps/web/src/lib/browser-pose-game-library.test.ts` now verifies source browser-pose definitions include a business category and purpose tags.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/browser-pose-game-library.test.ts
```

Expected: fail if categories/purposes are missing, technical, or inconsistent.

Evidence captured during execution:

- The first RED pass failed because seed update branches for existing games lacked the new business `trainingTargets` / `tags`, formal games did not all include risk-assessment purpose metadata, `GameLibraryPage` was not grouped by patient category, `TrainingTaskPicker` did not use the shared purpose helper, and browser-pose source definitions lacked complete category/purpose tags.
- A later RED pass failed because `记忆果篮` and `路径寻宝` were not visible in the patient game library. This caught the customer requirement that existing simple cognitive games stay available while adding plan variety.

- [x] **Step 3: Implement plan-variety framing**

Implementation requirements:

- Patient visible library groups content by `思维训练` and `运动训练`.
- Patient visible purpose labels are `风险评估辅助`, `干预训练`, and `数据采集`.
- Existing games remain available.
- Add formal seed tags for category and purpose in both create and update branches.
- Unknown purpose tags produce no visible purpose label.
- `TrainingTaskPicker` and `GameLibraryPage` use the same copy helper.

Implementation completed during execution:

- `TrainingTaskPicker` now imports `patientTrainingPurposeLabel`, combines `trainingTargets` and `tags`, and shows patient-safe purpose badges in task rows.
- `GameLibraryPage` groups the library by `思维训练` and `运动训练`, uses shared patient copy helpers, keeps `rhythm_reach_3d`, all seven browser-pose games, `memory_path`, `memory_basket`, and `path_treasure`, and shows `风险评估辅助`, `干预训练`, and `数据采集`.
- `apps/web/src/lib/browser-pose-game-library.ts` now carries business category and purpose tags at the game-definition source for the seven browser-pose games.
- `packages/db/prisma/seed.ts` now writes category and purpose tags in both formal create/update branches, and includes `trainingTargets` / `tags` for `memory_basket` and `path_treasure`.
- The patient-facing copy remains free of runtime engine labels; technical tags such as engine/license/sensing stay filtered by the shared copy helper.

- [x] **Step 4: Run Unit 5 verification**

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

Expected: pass and seed remains non-destructive.

Verification evidence:

```bash
node --test \
  scripts/__tests__/patient-facing-game-library-boundary.test.mjs \
  scripts/__tests__/patient-training-task-library.test.mjs \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
```

Passed with `17` tests, `0` failures. Node still prints the existing `MODULE_TYPELESS_PACKAGE_JSON` warning when importing the TypeScript patient copy helper.

```bash
node --test apps/web/src/lib/browser-pose-game-library.test.ts
```

Passed with `7` tests, `0` failures. Node still prints the existing `MODULE_TYPELESS_PACKAGE_JSON` warning for this TypeScript test file.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors and the existing `16` `@typescript-eslint/no-unused-vars` warnings in transitional `role-workspace.tsx` and `CollectionConditionGovernance.tsx`.

```bash
pnpm db:seed
```

Blocked by the real local environment, not by the Unit 5 code: Prisma could not reach PostgreSQL at `localhost:55432`; `pnpm infra:up` could not use Docker because the daemon socket `/Users/thl/.colima/default/docker.sock` was unavailable; `colima start` was attempted with escalation and failed to start the VM. No fallback seed, mock database, or fake success was added.

Subagent review evidence:

- Unit 5 specification review: PASS.
- Unit 5 code-quality re-review: PASS, including confirmation that `memory_basket` and `path_treasure` are included in source and seed coverage.

---

## Unit 6: Runtime Surfaces Stay Real But Patient-Safe

**Purpose:** Keep browser pose and Unity training real while hiding engine details from patient UI.

**Files:**

- Modify: `apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/UnityTrainingSurface.tsx`
- Modify: `apps/web/src/features/training-runtime/runtime-context.ts`
- Modify: `apps/web/src/features/training-runtime/types.ts`
- Modify: `apps/web/src/features/patient/TrainingRuntimePage.tsx`
- Modify: `apps/web/src/features/patient/TrainingPrepChecklist.tsx`
- Modify: `apps/web/src/features/patient/patient-training-copy.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Test: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Test: `apps/web/src/lib/browser-pose-training-result.test.ts`
- Test: `apps/web/src/lib/unity-training-bridge.test.ts`

- [x] **Step 1: Add failing runtime boundary assertions**

Add assertions:

```js
assert.match(browserSurface, /export function BrowserPoseTrainingSurface/);
assert.match(unitySurface, /export function UnityTrainingSurface/);
assert.match(browserSurface, /const capturedRunToken = runTokenRef\.current/);
assert.match(browserSurface, /runTokenRef\.current !== capturedRunToken/);
assert.match(unitySurface, /parseUnityTrainingResultBridgeEvent/);
assert.match(unitySurface, /onResultReady:\s*\(payload:\s*SubmitTrainingResultRequest\)\s*=>\s*void/);
assert.doesNotMatch(runtimePage + browserSurface + unitySurface, /fallback|mock|demo/i);
assert.doesNotMatch(runtimePage, /Unity loader|manifest|bridge|runtime|采样帧|平均置信度|审计|质控/i);
```

Add patient-visible runtime copy assertions:

```js
const browserPoseMarkupSource = sliceFrom(
  sliceBetween(browserSurface, "export function BrowserPoseTrainingSurface", "function PoseRuntimeStat"),
  "return (",
);
const unityMarkupSource = sliceFrom(
  sliceBetween(unitySurface, "export function UnityTrainingSurface", "function UnityPoseCameraPreview"),
  "return (",
);
const prepMarkupSource = sliceFrom(prepSource, "return (");
const patientVisibleRuntimeTerms =
  /Unity loader|Unity runtime|manifest|bridge|runtime|采集明细|采样帧|有效帧率|姿态帧|关键点|平均置信度|置信度|检查点|同步差|协议版本|资源清单|回传|质控|训练监看|体感训练状态|配置|debug|adapter|local|dev/i;

assert.doesNotMatch(browserPoseMarkupSource, patientVisibleRuntimeTerms);
assert.doesNotMatch(unityMarkupSource, patientVisibleRuntimeTerms);
assert.doesNotMatch(prepMarkupSource, /poseError|关键点|置信度|poseModelVersion|poseLandmarkCount|poseAverageVisibility/);
assert.match(prepSource, /动作识别不稳定，请调整站位后重试/);
assert.match(browserPoseMarkupSource + unityMarkupSource, /正在准备训练|训练进行中|训练暂不可开始|站位情况|训练准备状态/);
```

Extend `patient-care-technical-copy-ban.test.mjs`:

```js
const patientVisibleRuntimePaths = [
  "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
  "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
];
for (const path of patientVisibleRuntimePaths) {
  const source = await readFile(join(rootDir, path), "utf8");
  const visibleMarkup = patientVisibleJsx(source);
  assert.doesNotMatch(visibleMarkup, forbidden);
  assert.doesNotMatch(visibleMarkup, /关键点|置信度|采样帧|资源清单|协议版本|debug|adapter|local|dev/i);
}
```

Evidence captured during execution:

- Added patient-visible runtime assertions in `formal-runtime-ui-contract.test.mjs`, `patient-facing-ux-boundary.test.mjs`, and `patient-care-technical-copy-ban.test.mjs`.
- After code-quality review found that JSX-only extraction missed helper-returned patient copy, the tests were strengthened to scan `resolveBrowserPoseGameplayStatsDisplay()` string literals too.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  apps/web/src/lib/browser-pose-training-result.test.ts \
  apps/web/src/lib/unity-training-bridge.test.ts
```

Expected: fail if runtime adapter leaks back into `page.tsx`, stale async cleanup is unsafe, or patient copy exposes technical details.

Evidence captured during execution:

- Initial runtime boundary RED failed on patient-visible technical/runtime copy including raw pose readiness leakage and Unity/browser-pose status wording.
- Strengthened helper-copy RED failed on `稳定窗口`, `当前保持`, `协同窗口`, `偏移/方向`, `平均反应`, `判断速度`, `偏离次数`, and `触达/漏触`, proving the new helper scan caught the prior review gap.
- The TypeScript runtime test command could not run until `tsx` was made explicit in `@rehab-platform/web`; this was fixed as test toolchain work, not a runtime fallback.
- Once the runner executed, the first browser-pose payload test failed because its fixture expected `accuracy_high` even though the real metrics resolved to `clinician_limit` with `safetyClampReason`. The test was corrected and a separate high-accuracy case was added to preserve升档 coverage.

- [x] **Step 3: Harden runtime surfaces**

Implementation requirements:

- Browser pose runtime uses captured run tokens to ignore stale async completion.
- Runtime stop/cleanup must run for sync and async failures.
- Unity bridge message parsing and result adapter stay inside `UnityTrainingSurface`.
- Patient-visible errors are blocking and plain-language; internal exceptions can keep technical messages in logs/admin surfaces.
- `TrainingPrepChecklist` must not render raw `readiness.poseError`. It must map failed pose readiness to a fixed patient-facing blocker such as `动作识别不稳定，请调整站位后重试`.
- Browser pose visible status should use product terms such as `训练准备状态`, `站位情况`, `正在准备训练`, and `训练进行中`, not `体感训练状态`, `采集`, `配置`, or runtime telemetry labels.
- Unity visible status should use product terms such as `正在准备训练`, `训练进行中`, and `训练暂不可开始`, not `Unity runtime`, `Unity loader`, `manifest`, or `bridge`.
- `patient-training-copy.ts` should prefer explicit business-label allowlists for patient-visible tags. Do not introduce a generic "unknown tag -> friendly default" fallback; unknown/internal tags remain hidden.
- Do not add fallback result generation when runtime fails.

Evidence captured during execution:

- `TrainingPrepChecklist` maps failed pose readiness to `动作识别不稳定，请调整站位后重试。` and does not render raw `readiness.poseError`.
- `BrowserPoseTrainingSurface` keeps the real browser-pose runtime and payload builder path, uses captured run tokens for stale async protection, and maps patient-visible runtime/stage errors to blocking plain-language copy.
- `UnityTrainingSurface` keeps manifest loading, Unity bridge parsing, pose forwarding, and formal result submission while patient-visible status uses `正在准备训练`, `训练进行中`, and `训练暂不可开始`.
- Browser-pose live stats display was changed from runtime-stat labels to patient training labels such as `当前进度`, `完成情况`, `保持完成`, `保持状态`, `双手完成`, `路径进度`, `方向状态`, `动作完成`, and `训练节奏`.
- No fallback result generation, mock runtime, demo path, fixed score, or local fake success was added.

- [x] **Step 4: Run Unit 6 verification**

Run:

```bash
node --test \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test \
  apps/web/src/lib/browser-pose-training-result.test.ts \
  apps/web/src/lib/unity-training-bridge.test.ts
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Expected: focused tests pass; lint passes; `tsc` status is recorded with exact evidence.

Evidence captured during execution:

- `node --test scripts/__tests__/formal-runtime-ui-contract.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs` passed with `18` tests, `0` failures.
- `pnpm --filter @rehab-platform/web exec tsx --test src/lib/browser-pose-training-result.test.ts src/lib/unity-training-bridge.test.ts` passed with `15` tests, `0` failures. The command must use `src/lib/...` paths because `pnpm --filter ... exec` runs from the web package root.
- `pnpm --filter @rehab-platform/web lint` passed with `0` errors and `16` existing unused-symbol warnings in transitional `role-workspace.tsx` and `CollectionConditionGovernance.tsx`.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` passed with exit code `0`.

- [x] **Step 5: Run Unit 6 review checkpoint**

Review requirements:

- Spec reviewer must confirm Unit 6 still preserves real browser-pose and Unity runtime paths and hides engine details from patient-visible UI.
- Code-quality reviewer must confirm no fallback/mock/demo/fake success was introduced, the strengthened helper-copy tests close the previous scan gap, and the dynamic-difficulty tests still cover both clinician-limited no-change and high-accuracy升档 evidence.

Evidence captured during execution:

- Spec review result: PASS. The reviewer confirmed `TrainingPrepChecklist` no longer renders `readiness.poseError`, `BrowserPoseTrainingSurface` and `UnityTrainingSurface` keep real runtime/result paths, and the runtime boundary tests cover patient-visible technical-copy leakage.
- Initial code-quality review result: CHANGES_REQUESTED because helper-returned visible stats copy was not scanned. This led to stronger tests and patient-copy changes.
- Final code-quality review result: APPROVED. The reviewer confirmed the helper scan gap is closed, the dynamic-difficulty tests cover both clinician-limited no-change and high-accuracy升档, and no fallback/mock/demo/fake success or replacement runtime was introduced.

---

## Unit 7: Doctor Workbench Rebuild

**Purpose:** Make doctor screens clinically focused and remove patient/admin/demo clutter.

**Files:**

- Modify: `apps/web/src/features/doctor/DoctorWorkspacePage.tsx`
- Modify: `apps/web/src/features/doctor/PatientQueue.tsx`
- Modify: `apps/web/src/features/doctor/PatientClinicalSummary.tsx`
- Modify: `apps/web/src/features/doctor/AssessmentReviewPanel.tsx`
- Modify: `apps/web/src/features/doctor/PlanEditor.tsx`
- Modify: `apps/web/src/features/doctor/TrainingReviewQueue.tsx`
- Create: `apps/web/src/features/doctor/doctor-workbench-actions.ts`
- Create: `apps/web/src/features/doctor/doctor-workbench-model.ts`
- Test: `scripts/__tests__/doctor-workbench-ia.test.mjs`
- Test: `scripts/__tests__/speech-ai-assessment-ui.test.mjs`
- Test: `scripts/__tests__/ai-assessment-acceptance.test.mjs`
- Test: `apps/web/src/lib/ai-assessment-draft.test.ts`

- [x] **Step 1: Add failing doctor IA assertions**

Add assertions:

```js
assert.match(workspaceSource, /data-testid="doctor-primary-workbench"/);
for (const copy of ["患者队列", "评估复核", "计划管理", "训练复核"]) {
  assert.match(workspaceSource + combinedDoctorModules, new RegExp(copy));
}
assert.match(combinedDoctorModules, /确认风险|风险确认/);
assert.match(combinedDoctorModules, /创建训练准备|下发训练准备|确认计划/);
assert.match(combinedDoctorModules, /提交复核|保存复核/);
assert.doesNotMatch(workspaceSource + combinedDoctorModules, /康复激励|patient-task-nav|Unity loader|manifest|Provider|Endpoint|endpointRef|rawPayload|rawEvidence|auditId|审计\s*ID|验收|fallback|mock|demo/i);
```

Additional assertions added during execution:

- `DoctorWorkspacePage` must expose `data-testid="doctor-primary-workbench"`.
- `role-workspace.tsx` must import/call `DoctorWorkspacePage`, `buildDoctorWorkbenchModel`, `doctorWorkbenchActionState`, `buildDoctorPlanConfirmationPayload`, and `buildDoctorTrainingReviewPayload`.
- Doctor feature modules must include the business IA copy `患者队列`, `评估复核`, `计划管理`, and `训练复核`.
- Doctor feature modules must not expose `provider`, `modelVersion`, `callId`, `promptVersion`, `calledAt`, `运行方式`, `runtimeType`, or `manifestUrl`.
- `handleSelectPatient` must reset `collectionBatchForm` so training-preparation plan/protocol choices cannot remain stale when doctors switch patients.
- `speech-ai-assessment-ui.test.mjs` was updated to require clinical evidence summaries and human review status instead of provider/call fields.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/ai-assessment-acceptance.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/ai-assessment-draft.test.ts
```

Expected: fail if doctor workspace lacks real clinical action structure or leaks technical/admin internals.

Evidence captured during execution:

- Initial RED failed with `3` expected failures: missing `data-testid="doctor-primary-workbench"`, missing `计划管理` copy in doctor modules, and stale shell/navigation expectations.
- After aligning the speech UI test to Unit 7, RED also caught `AssessmentReviewPanel.tsx` still showing provider/call/prompt fields and `DataCollectionReviewPanel.tsx` still showing runtime/JSON summaries.
- Quality re-review later identified a stale patient-switch edge: `handleSelectPatient` did not reset `collectionBatchForm`. A new assertion failed until `setCollectionBatchForm(emptyCollectionBatchForm)` was added inside `handleSelectPatient`.

- [x] **Step 3: Implement doctor workbench**

Implementation requirements:

- Queue first, detail second.
- `role-workspace.tsx` must stop owning doctor-visible screen markup after this unit; it should call `DoctorWorkspacePage` and typed doctor action/model helpers.
- Allowed doctor-visible fields: scale score, risk grade, assessment summary, doctor conclusion, review status, completion rate, score, duration, abnormal flag, and quality summary.
- Forbidden doctor-visible fields: provider payload, endpoint ref, manifest URL, runtime bridge fields, audit ID, raw evidence JSON, raw motion metric JSON, raw transcript payload, secret ref, acceptance evidence.
- Plan editor shows current plan, selected content, frequency, duration, difficulty, plan adjustment, and preparation creation action.
- Training review queue shows new/abnormal/low-quality results with doctor action.
- AI/speech/AI conversation suggestions remain pending until doctor human review.

Implementation completed during execution:

- Added `apps/web/src/features/doctor/doctor-workbench-model.ts` for `buildDoctorWorkbenchModel`, current/pending plan selection, doctor-safe assessment summaries, training-preparation protocol matching, ready-batch detection, and business training category labels.
- Added `apps/web/src/features/doctor/doctor-workbench-actions.ts` for `doctorWorkbenchActionState`, `buildDoctorPlanConfirmationPayload`, `buildDoctorCollectionBatchPayload`, and `buildDoctorTrainingReviewPayload`.
- `role-workspace.tsx` now routes doctor `doctor` / `plan` / `result` screens into `DoctorWorkspacePage` through typed doctor helpers while preserving real `api.confirmPlan`, `api.createCollectionBatch`, and `api.reviewTrainingResult` calls.
- Removed the old duplicate doctor visible panels from the doctor primary flow: legacy patient table/alerts, duplicate training-review panel, and duplicate collection-prep panel are no longer mounted after `DoctorWorkspacePage`.
- `DoctorWorkspacePage` now exposes `data-testid="doctor-primary-workbench"` and includes patient queue, patient summary, assessment review, plan management, training-preparation creation, and training review in one clinical workbench.
- `AssessmentReviewPanel` no longer renders provider/model/call/prompt/called-at fields. It renders `评估摘要`, `风险等级`, `医生结论`, and `待医生确认` clinical status.
- `DataCollectionReviewPanel` no longer renders `运行方式`, `Unity WebGL`, raw JSON device requirements, sampling config, or quality gate summaries. It shows business preparation status, training type, device preparation, training arrangement, and quality summary.
- `PlanEditor` now uses `计划管理` copy and business training category labels instead of runtime implementation labels.
- Doctor patient switching now resets `collectionBatchForm` to avoid stale plan-item/protocol choices after switching patients.

- [x] **Step 4: Run Unit 7 verification**

Run:

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/ai-assessment-acceptance.test.mjs
pnpm --filter @rehab-platform/web exec tsx --test apps/web/src/lib/ai-assessment-draft.test.ts
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

Evidence captured during execution:

```bash
node --test \
  scripts/__tests__/doctor-workbench-ia.test.mjs \
  scripts/__tests__/speech-ai-assessment-ui.test.mjs \
  scripts/__tests__/ai-assessment-acceptance.test.mjs
```

Passed with `22` tests, `0` failures.

```bash
pnpm --filter @rehab-platform/web exec tsx --test src/lib/ai-assessment-draft.test.ts
```

Passed with `15` tests, `0` failures.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors. It still reports `20` existing transitional unused-symbol warnings in `role-workspace.tsx` and `CollectionConditionGovernance.tsx`; Unit 7 reduced the doctor-specific legacy warnings and the remaining warnings are scheduled for later caregiver/admin extraction units.

```bash
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Passed with exit code `0`.

Review evidence:

- Unit 7 specification review: PASS. The reviewer confirmed the doctor IA, typed helper usage, real `confirmPlan` / `createCollectionBatch` / `reviewTrainingResult` chain, and AI/STT human-review boundary.
- Unit 7 code-quality review initially returned CHANGES_REQUESTED because switching patients did not reset `collectionBatchForm`; the issue was fixed with a RED assertion and implementation.
- Unit 7 code-quality re-review: APPROVED. The reviewer confirmed no fallback/mock/demo/fake success, no sensitive technical-field leakage in the doctor primary workbench, and no API path breakage.

---

## Unit 8: Caregiver Workspace Rebuild

**Purpose:** Give caregivers a first-class, simple, desensitized workspace.

**Files:**

- Create: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Create: `apps/web/src/features/caregiver/CaregiverSummaryPanel.tsx`
- Create: `apps/web/src/features/caregiver/CaregiverProgressPanel.tsx`
- Create: `apps/web/src/features/caregiver/CaregiverReminderPanel.tsx`
- Create: `apps/web/src/features/caregiver/CaregiverScopePanel.tsx`
- Modify: `apps/web/src/features/session/role-workspace.tsx`
- Test: `scripts/__tests__/care-circle-privacy.test.mjs`
- Test: `scripts/__tests__/patient-care-technical-copy-ban.test.mjs`
- Test: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`

- [x] **Step 1: Add failing caregiver extraction assertions**

Add assertions:

```js
const page = await readFile(join(rootDir, "apps/web/src/app/page.tsx"), "utf8");
const caregiver = await readFile(
  join(rootDir, "apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx"),
  "utf8",
);

assert.doesNotMatch(page, /function FamilyScreen/);
for (const copy of ["照护", "进展", "提醒", "我的", "可见范围"]) {
  assert.match(caregiver, new RegExp(copy));
}
assert.doesNotMatch(caregiver, /account|mobilePhone|authorUserId|actorUserId|原始|payload|审计|导出|Provider|Endpoint|runtime|manifest|质量证据|技术验收|fallback|mock|demo/i);
```

Added during execution:

- `care-circle-privacy.test.mjs` now reads the caregiver feature module, requires `CaregiverWorkspacePage`, requires `buildCaregiverWorkspaceModel`, rejects legacy `FamilyScreen` / `FamilyBinding`, rejects direct `CaregiverSummaryResponse` / `CareCircleResponse` / `TrainingRecordSession` props on the visible page, and requires the caregiver model boundary tests to exist.
- `patient-care-technical-copy-ban.test.mjs` now requires the caregiver feature directory to exist and scans caregiver production `.ts/.tsx` modules while excluding test/spec files from visible-copy scanning.
- `patient-facing-ux-boundary.test.mjs` now requires `CaregiverWorkspacePage`, keeps the caregiver task anchors, and updates Unit 7 doctor helper assertions to `buildDoctorCollectionBatchPayload` / `buildDoctorTrainingReviewPayload`.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
```

Expected: fail until caregiver UI is extracted and privacy copy is clean.

Evidence captured during execution:

```text
node --test scripts/__tests__/care-circle-privacy.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs
```

Failed as expected with `ENOENT` for `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx` / `apps/web/src/features/caregiver`.

Additional RED checks added after code review:

```text
node --test scripts/__tests__/care-circle-privacy.test.mjs
```

Failed as expected with `ENOENT` for `apps/web/src/features/caregiver/caregiver-workspace-model.ts`, then failed as expected with `ENOENT` for `apps/web/src/features/caregiver/caregiver-workspace-model.test.ts`.

- [x] **Step 3: Implement caregiver workspace**

Implementation requirements:

- Show authorized patient summary, today reminder, desensitized trend, doctor precautions, and binding scope.
- `role-workspace.tsx` must stop owning `FamilyScreen` markup after this unit; it should call `CaregiverWorkspacePage` and pass only authorized, desensitized data and callbacks.
- Use real caregiver summary/care circle API data already loaded by role data hooks.
- No raw assessment text, raw motion metrics, audit IDs, export entry, admin terms, internal account IDs, or clinical overclaiming.
- Caregiver cannot modify plans, submit doctor review, or access admin export.

Implementation completed:

- Created `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`.
- Created `CaregiverSummaryPanel.tsx`, `CaregiverProgressPanel.tsx`, `CaregiverReminderPanel.tsx`, and `CaregiverScopePanel.tsx`.
- Created `caregiver-workspace-model.ts` so the caregiver page receives a `CaregiverWorkspaceModel` instead of full API responses. The model builder projects real `data.caregiverSummary` / `data.careCircle` into desensitized display fields, filters unpublished reminders and hidden notes, limits reminders/notes to 4 items, and maps unknown backend enum values to fixed safe copy.
- Created `caregiver-workspace-model.test.ts` covering unknown enum labels, unauthorized empty model state, published/visible filtering, and list limits.
- Modified `role-workspace.tsx` to call `<CaregiverWorkspacePage model={buildCaregiverWorkspaceModel(data.caregiverSummary, data.careCircle)} />` and removed legacy `FamilyScreen` / `FamilyBinding` markup ownership.
- Refactored caregiver panel composition to avoid card-in-card visual nesting; metric/list panels are siblings of section header cards.

- [x] **Step 4: Run Unit 8 verification**

Run:

```bash
node --test \
  scripts/__tests__/care-circle-privacy.test.mjs \
  scripts/__tests__/patient-care-technical-copy-ban.test.mjs \
  scripts/__tests__/patient-facing-ux-boundary.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

Verification evidence:

```text
pnpm --filter @rehab-platform/web exec tsx --test src/features/caregiver/caregiver-workspace-model.test.ts
```

Passed with `4` tests, `0` failures.

```text
node --test scripts/__tests__/care-circle-privacy.test.mjs scripts/__tests__/patient-care-technical-copy-ban.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs
```

Passed with `14` tests, `0` failures.

```text
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Passed with exit code `0`.

```text
pnpm --filter @rehab-platform/web lint
```

Passed with `0` errors. It still reports `20` existing transitional unused-symbol warnings in `role-workspace.tsx` and `CollectionConditionGovernance.tsx`; Unit 8 introduced no new lint errors and removed the caregiver-specific unused helper warnings from the old extracted markup.

Review evidence:

- Unit 8 specification review initially returned CHANGES_REQUESTED because unknown caregiver category/mood/reaction strings could be passed through to visible labels. The implementation was changed to fixed safe labels and a model-boundary RED assertion was added.
- Unit 8 specification re-review: PASS. The reviewer confirmed fixed safe labels, `CaregiverWorkspaceModel` props, real `data.caregiverSummary` / `data.careCircle` input, and Unit 8 scope coverage.
- Unit 8 code-quality review initially returned CHANGES_REQUESTED for unknown enum passthrough, page props accepting full API response objects, nested card composition, and missing model boundary tests. All were fixed.
- Unit 8 code-quality final re-review: APPROVED. The reviewer confirmed `buildCaregiverWorkspaceModel` test coverage, production visible copy scanning remains intact, no direct API response props on `CaregiverWorkspacePage`, and no nested `Card` composition in caregiver panels.

---

## Unit 9: Admin Governance Rebuild

**Purpose:** Keep technical and governance capability, but make it clearly admin/auditor-only and business-operational.

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
- Create: `apps/web/src/features/admin/admin-governance-actions.ts`
- Test: `scripts/__tests__/admin-governance-ia.test.mjs`
- Test: `scripts/__tests__/collection-condition-ui.test.mjs`
- Test: `scripts/__tests__/training-capture-layout.test.mjs`
- Test: `scripts/__tests__/formal-runtime-ui-contract.test.mjs`

- [x] **Step 1: Add failing admin real-workspace assertions**

Add assertions:

```js
for (const copy of ["账号治理", "内容治理", "配置治理", "安全审计"]) {
  assert.match(overviewSource, new RegExp(copy));
}
for (const component of [
  "AccountReviewPanel",
  "TrainingContentGovernance",
  "OperationConfigPanel",
  "CollectionConditionGovernance",
  "StatisticsQueryPanel",
  "DesensitizedExportPanel",
  "SecurityAuditPage",
]) {
  assert.match(overviewSource, new RegExp(`<${component}\\b`));
}
assert.doesNotMatch(overviewSource, /TrainingRuntimePage|BrowserPoseTrainingSurface|UnityTrainingSurface|完成本次训练/);
assert.doesNotMatch(overviewSource, /demo|mock|fallback/i);
```

Evidence captured during execution: `scripts/__tests__/admin-governance-ia.test.mjs` was strengthened to require `AdminOverviewPage` copy for `账号治理` / `内容治理` / `配置治理` / `安全审计`, the real governance components, `AdminGovernanceActions`, `AdminGovernancePermissions`, and removal of `function AdminScreen` / `function SecurityScreen` from `role-workspace.tsx`. `scripts/__tests__/collection-condition-ui.test.mjs` was updated to follow the admin component migration by asserting `CollectionConditionGovernance` inside `AdminOverviewPage` while still requiring session-level form and handler wiring.

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs
```

Expected: fail if admin is still static explanation, broad demo dashboard, or mounts training runtime.

Evidence captured during execution: the red check failed as expected while `role-workspace.tsx` still mounted old `AdminScreen` / `SecurityScreen`, and while the admin governance modules were still partially static. After the doctor collection preparation assertion was aligned, failures centered on missing `<AdminOverviewPage>` ownership and missing doctor preparation copy such as `采集条件摘要`.

- [x] **Step 3: Implement admin governance**

Implementation requirements:

- `AdminOverviewPage` is a real governance workspace, not a feature explanation page.
- `role-workspace.tsx` must stop owning admin/security visible screen markup after this unit except for top-level permission routing and action callback wiring.
- `AccountReviewPanel` uses real registration request review state.
- `TrainingContentGovernance` manages content release and plan-library tags.
- `OperationConfigPanel` and `CollectionConditionGovernance` manage runtime/config/protocol readiness.
- `SecurityAuditPage` and `DesensitizedExportPanel` keep reason-required export and audit search.
- `TrainingQualityEvidenceSection` remains admin/auditor only.
- Preserve permission checks and do not expose admin actions to patient, caregiver, or doctor workspaces.

Implementation evidence captured during execution:

- Added `apps/web/src/features/admin/admin-governance-actions.ts` and `apps/web/src/features/admin/admin-governance-forms.ts` for typed admin actions, busy state, permissions, forms, and handlers.
- Rebuilt `AdminOverviewPage` as the real admin/auditor governance workspace, composed from `AccountReviewPanel`, `TrainingContentGovernance`, `OperationConfigPanel`, `CollectionConditionGovernance`, `StatisticsQueryPanel`, `DesensitizedExportPanel`, `SecurityAuditPage`, and admin-only `TrainingQualityEvidenceSection`.
- Replaced static `OperationConfigPanel`, `StatisticsQueryPanel`, `DesensitizedExportPanel`, and `SecurityAuditPage` with real data/form-driven modules that consume dashboard, audit logs, filters, export form, permissions, busy state, and existing callbacks.
- Updated `role-workspace.tsx` so `active === "admin"` and `active === "security"` both render `<AdminOverviewPage />`; the file now keeps real API handlers and form state wiring but no longer defines `function AdminScreen` or `function SecurityScreen`.
- Preserved real API chains for registration review, caregiver account creation, game content create/status/resource updates, collection condition/protocol creation, audit search, and reason-required desensitized export. No fallback, mock, demo, local-only, or fake success behavior was added.
- Updated `DataCollectionReviewPanel` doctor preparation copy to include `采集条件摘要`, `设备要求`, `质量规则`, and `协议版本`.
- Removed nested-card styling in `CollectionConditionGovernance` after quality review: the two forms and governance summary now use single-card sections with token-based dividers rather than inner card containers.

- [x] **Step 4: Run Unit 9 verification**

Run:

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass.

Evidence captured during execution:

```bash
node --test \
  scripts/__tests__/admin-governance-ia.test.mjs \
  scripts/__tests__/collection-condition-ui.test.mjs \
  scripts/__tests__/training-capture-layout.test.mjs \
  scripts/__tests__/formal-runtime-ui-contract.test.mjs
```

Passed with `19` tests, `0` failures.

```bash
pnpm --filter @rehab-platform/web exec tsc --noEmit
```

Passed with exit code `0`.

```bash
pnpm --filter @rehab-platform/web lint
```

Passed with exit code `0`. It still reports `17` existing transitional unused-symbol warnings in `role-workspace.tsx`; Unit 9 reduced the previous lint warning count and removed the `CollectionConditionGovernance` unused import warning.

Review evidence:

- Unit 9 specification review: APPROVED. The reviewer confirmed `AdminOverviewPage` owns the four governance sections, `role-workspace.tsx` no longer owns `AdminScreen` / `SecurityScreen`, real API/action chains are preserved, patient/caregiver/doctor flows do not expose admin governance details, and no fallback/mock/demo/fake-success behavior was introduced.
- Unit 9 code-quality review initially returned CHANGES_REQUESTED for nested card / over-containerized styling in `CollectionConditionGovernance`. The implementation was changed to divider-based sections and token styles.
- Unit 9 code-quality re-review: APPROVED. The reviewer confirmed the nested-card issue was resolved and no further quality blockers remained.

---

## Unit 10: API Closure And No-Fallback Enforcement

**Purpose:** Prove that rebuilt UI paths still call real APIs and cannot hide broken business states behind local assumptions.

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/features/session/useRoleData.ts`
- Modify: `apps/web/src/features/patient/patient-training-actions.ts`
- Modify: `apps/web/src/features/doctor/doctor-workbench-actions.ts`
- Modify: `apps/web/src/features/admin/admin-governance-actions.ts`
- Modify: `apps/web/src/features/caregiver/CaregiverWorkspacePage.tsx`
- Test: `scripts/__tests__/formal-acceptance-chain.test.mjs`
- Test: `scripts/__tests__/trial-empty-loop-collection-chain.test.mjs`
- Test: `scripts/__tests__/empty-real-loop-orchestrator.test.mjs`
- Test: `apps/api/src/app.controller.spec.ts`

- [x] **Step 1: Add failing no-fallback source assertions**

Add assertions:

```js
const webSources = await readFeatureSources([
  "apps/web/src/app/page.tsx",
  "apps/web/src/features/session/useRoleData.ts",
  "apps/web/src/features/patient/patient-training-actions.ts",
  "apps/web/src/features/doctor/doctor-workbench-actions.ts",
  "apps/web/src/features/admin/admin-governance-actions.ts",
]);

const combined = webSources.join("\n");
assert.doesNotMatch(combined, /localStorage.*trainingResult|Math\.random\(\).*score|mock|demo|fallback|fixedScore|manualResult/i);
assert.match(combined, /startTrainingSession/);
assert.match(combined, /submitTrainingResult/);
assert.match(combined, /reviewTrainingResult/);
assert.match(combined, /confirmPlan/);
assert.match(combined, /exportData/);
```

- [x] **Step 2: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/trial-empty-loop-collection-chain.test.mjs \
  scripts/__tests__/empty-real-loop-orchestrator.test.mjs
pnpm --filter @rehab-platform/api exec jest apps/api/src/app.controller.spec.ts
```

Expected: fail if any UI path bypasses formal APIs or hides errors.

Evidence captured during execution: `scripts/__tests__/formal-acceptance-chain.test.mjs` was strengthened with rebuilt role UI source assertions that reject local substitutes (`localStorage.*trainingResult`, `Math.random().*score`, `mock`, `demo`, `fallback`, `fixedScore`, `manualResult`), require `startTrainingSession`, `submitTrainingResult`, `reviewTrainingResult`, `confirmPlan`, and `exportData`, and require those formal calls to live in feature-owned action files instead of `role-workspace.tsx`. The initial RED run first exposed a test harness `rootDir` bug; after fixing that harness issue, the RED failure was the intended boundary failure because the feature action files did not yet own `api.startTrainingSession` and related formal action calls.

- [x] **Step 3: Implement API closure**

Implementation requirements:

- Training start, result submit, plan confirm, preparation, review, caregiver summary, audit, and export actions use `apps/web/src/lib/api.ts`.
- `role-workspace.tsx` should retain only top-level orchestration that is still genuinely shared across roles. Payload builders and role-specific action state must move into feature-owned action/model files.
- State labels are truthful: blocked, waiting, failed, ready, complete.
- API-facing actions may log concise English operational errors such as `Training start failed`, `Training result submission failed`, or `Desensitized export failed`.
- Do not add local fake success states.
- Do not create missing collection batches from patient UI.

Implementation evidence:

- `apps/web/src/features/patient/patient-training-actions.ts` now owns `refreshTrainingPreparation`, `startTrainingSession`, `submitTrainingResult`, and `buildTrainingResultPayload`, with strict result validation and real calls to `api.collectionBatches`, `api.startTrainingSession`, and `api.submitTrainingResult`.
- `apps/web/src/features/doctor/doctor-workbench-actions.ts` now owns `confirmPlan`, `createCollectionBatch`, `refreshCollectionBatches`, and `reviewTrainingResult`, with real calls to `api.confirmPlan`, `api.createCollectionBatch`, `api.collectionBatches`, and `api.reviewTrainingResult`.
- `apps/web/src/features/admin/admin-governance-actions.ts` now owns `auditLogs` and `exportData`, with real calls to `api.auditLogs` and `api.exportData`.
- `apps/web/src/features/session/role-workspace.tsx` now keeps top-level orchestration and reload/status state, while core formal API calls are routed through feature-owned actions. Patient UI still only refreshes existing collection batches; creating collection batches remains on the doctor path.
- Quality review found two strict-validation issues after the first GREEN pass: blank numeric training result fields could become `0`, and fractional `sampleCount` values were rounded. These were fixed by rejecting blank numeric input and requiring positive integer `sampleCount` without rounding. `scripts/__tests__/patient-training-flow-ia.test.mjs` now protects that behavior.

- [x] **Step 4: Run Unit 10 verification**

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

Evidence captured during execution:

- RED: `node --test scripts/__tests__/formal-acceptance-chain.test.mjs scripts/__tests__/trial-empty-loop-collection-chain.test.mjs scripts/__tests__/empty-real-loop-orchestrator.test.mjs` failed as expected once the harness root path was fixed, because feature-owned action files did not yet contain `api.startTrainingSession` and the other formal action calls.
- GREEN targeted checks: `node --test scripts/__tests__/patient-training-flow-ia.test.mjs scripts/__tests__/patient-facing-ux-boundary.test.mjs` passed with `25` tests, `0` failures after strict validation and source-boundary updates.
- Unit verification: `node --test scripts/__tests__/formal-acceptance-chain.test.mjs scripts/__tests__/trial-empty-loop-collection-chain.test.mjs scripts/__tests__/empty-real-loop-orchestrator.test.mjs` passed with `31` tests, `0` failures.
- TypeScript: `pnpm --filter @rehab-platform/web exec tsc --noEmit` passed.
- API Jest: `pnpm --filter @rehab-platform/api exec jest apps/api/src/app.controller.spec.ts` passed with `23` tests, `0` failures. The command still prints the existing watchman permission warning for an Xcode path outside the repo.
- Web lint: `pnpm --filter @rehab-platform/web lint` exited `0` with `0` errors and `17` existing warnings in `apps/web/src/features/session/role-workspace.tsx`.

Review evidence:

- Unit 10 specification review: APPROVED. The reviewer confirmed training preparation/start/result submit, plan confirm, collection batch, review, audit, and export actions are feature-owned and use `apps/web/src/lib/api.ts`; `role-workspace.tsx` keeps orchestration only for the Unit 10 core APIs; no fallback/mock/demo/local fake success was introduced; patient UI does not create missing collection batches.
- Unit 10 code-quality review initially returned CHANGES_REQUESTED for strict validation in `patient-training-actions.ts`: blank numeric strings were accepted as `0`, and `sampleCount` was rounded. The implementation was changed to reject blank numeric fields and require positive integer `sampleCount` without rounding.
- Unit 10 code-quality re-review: APPROVED. The reviewer confirmed both strict-validation findings were fixed and found no new Unit 10 quality blocker.

---

## Unit 11: Seed Stability And Deterministic Manual Testing

**Purpose:** Ensure repeated setup supports manual testing without duplicating mutable clinical records or relying on fake UI state.

**Files:**

- Modify: `packages/db/prisma/seed.ts`
- Inspect: `packages/db/prisma/schema.prisma`
- Create: `scripts/verify-seed-idempotency.mjs`
- Create: `scripts/__tests__/seed-idempotency-script.test.mjs`
- Test: `scripts/__tests__/browser-pose-game-library-seed.test.mjs`
- Test: `scripts/__tests__/formal-acceptance-chain.test.mjs`

- [x] **Step 1: Add failing seed idempotency assertions**

Add to `scripts/__tests__/browser-pose-game-library-seed.test.mjs`:

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
assert.match(seedSource, /upsert|findFirst/);
assert.match(seedSource, /SEED-/);
```

Create `scripts/__tests__/seed-idempotency-script.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("seed idempotency verifier reads stable seeded clinical counts", async () => {
  const source = await readFile(join(rootDir, "scripts/verify-seed-idempotency.mjs"), "utf8");
  assert.match(source, /PrismaClient/);
  assert.match(source, /SEED-ALZ-0001/);
  assert.match(source, /currentRehabPlans/);
  assert.match(source, /trainingResults/);
  assert.match(source, /console\.log\(JSON\.stringify/);
});
```

- [x] **Step 2: Create seed verifier**

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
  if (!seedPatient) return { seedPatient: false };
  const where = { patientId: seedPatient.id };
  return {
    seedPatient: true,
    consentRecords: await prisma.consentRecord.count({ where }),
    assessmentRecords: await prisma.assessmentRecord.count({ where }),
    riskGradeRecords: await prisma.riskGradeRecord.count({ where }),
    rehabPlans: await prisma.rehabPlan.count({ where }),
    currentRehabPlans: await prisma.rehabPlan.count({ where: { ...where, status: "current" } }),
    trainingSessions: await prisma.trainingSession.count({ where }),
    trainingResults: await prisma.trainingResult.count({ where }),
  };
}
```

- [x] **Step 3: Run red check**

Run:

```bash
node --test \
  scripts/__tests__/browser-pose-game-library-seed.test.mjs \
  scripts/__tests__/formal-acceptance-chain.test.mjs \
  scripts/__tests__/seed-idempotency-script.test.mjs
```

Expected: fail if seed appends duplicate mutable records or verifier is missing.

- [x] **Step 4: Implement deterministic seed**

Implementation requirements:

- Use fixed IDs, unique business keys, upsert, or stable find/update/create-if-missing patterns.
- Do not run destructive deletes or resets.
- Preserve Unit 5 category/purpose tags in create and update paths.
- Keep deterministic seeded credentials for patient, doctor, caregiver, admin, and auditor manual smoke.

- [x] **Step 5: Run Unit 11 verification**

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

Expected: both seed runs succeed and mutable formal counts remain stable.

Evidence captured during execution:

- RED: `node --test scripts/__tests__/browser-pose-game-library-seed.test.mjs scripts/__tests__/formal-acceptance-chain.test.mjs scripts/__tests__/seed-idempotency-script.test.mjs` failed as expected before implementation because `packages/db/prisma/seed.ts` still contained unguarded mutable `prisma.consentRecord.create(` usage and `scripts/verify-seed-idempotency.mjs` did not exist.
- GREEN implementation: `packages/db/prisma/seed.ts` now uses fixed seed IDs, unique keys, or `upsert` for consent, assessment, risk grade, AI analysis, rehab plan, plan items, plan adjustment, training session, training result, motion metrics, and audit logs. The seed keeps the Unit 5 patient-facing category/purpose tags in both update and create paths and throws explicitly when the required `rhythm_reach_3d` game or plan item is missing.
- Verifier implementation: `scripts/verify-seed-idempotency.mjs` locates the seeded patient through `user.account = "patient001"` plus `healthMetrics.medicalRecordNo = "SEED-ALZ-0001"` because `PatientProfile` does not have a top-level `medicalRecordNo` column. It reports stable counts for consent, assessment, risk grade, AI analysis, rehab plans, current rehab plans, plan adjustments, training sessions, and training results.
- Verifier dependency RED/GREEN: after the first real `pnpm db:seed`, `node scripts/verify-seed-idempotency.mjs` failed from the repo root with `ERR_MODULE_NOT_FOUND: Cannot find package '@prisma/client'`. A failing assertion was added to `scripts/__tests__/seed-idempotency-script.test.mjs`; `scripts/verify-seed-idempotency.mjs` now uses `createRequire` from `packages/db/package.json`, and the targeted test then passed.
- Environment recovery evidence: real DB verification was temporarily blocked by Colima/Lima stale disk state. `docker compose -f infra/docker-compose.yml ps` initially could not connect to `/Users/thl/.colima/default/docker.sock`; `colima start` failed with `failed to run attach disk "colima", in use by instance "colima"`. Non-destructive recovery used `LIMA_HOME=/Users/thl/.colima/_lima limactl disk unlock colima`, after which `colima start` succeeded and Docker reported `rehab-platform-postgres` and `rehab-platform-redis` healthy.
- Final source verification: `node --test scripts/__tests__/browser-pose-game-library-seed.test.mjs scripts/__tests__/formal-acceptance-chain.test.mjs scripts/__tests__/seed-idempotency-script.test.mjs` passed with `19` tests, `0` failures.
- TypeScript: `pnpm --filter @rehab-platform/db exec tsc --noEmit` passed.
- Final real DB verification: `pnpm db:seed` succeeded, `node scripts/verify-seed-idempotency.mjs` printed `{"seedPatient":true,"medicalRecordNo":"SEED-ALZ-0001","consentRecords":123,"assessmentRecords":26,"riskGradeRecords":26,"aiAnalysisRecords":26,"rehabPlans":33,"currentRehabPlans":1,"planAdjustmentRecords":25,"trainingSessions":19,"trainingResults":4}`; the second `pnpm db:seed` succeeded and the second verifier output matched exactly.

Review evidence:

- Unit 11 specification review: APPROVED. The reviewer confirmed mutable clinical records use fixed IDs, unique keys, or `upsert`; Unit 5 category/purpose tags are preserved; no fallback/mock/demo/fake success was introduced; missing required game content fails explicitly; and the real DB blocker was environmental rather than a code gap.
- Unit 11 code-quality review: APPROVED. The reviewer confirmed the fixed ID/upsert relationship chain for clinical records, plan items, sessions, results, motion metrics, and audit logs; confirmed the JSON path patient lookup matches the schema; confirmed motion metric upserts avoid duplicate records; and found no immediate blocker. The only reserved risk was future plan-item count precision if released games are later changed to pending, which is outside the current Unit 11 verifier scope.

---

## Unit 12: Browser Regression And Visual QA

**Purpose:** Verify the rebuilt UI in a real browser across roles and screen sizes.

**Files:**

- Modify: `scripts/web-playwright-regression.spec.mjs`
- Modify: `scripts/playwright-regression.config.mjs`
- Create: `scripts/formal-ui-business-chain.spec.mjs`
- Modify: `docs/web-playwright-regression-runbook.md`

- [ ] **Step 1: Add failing role smoke checks**

Add assertions to `scripts/web-playwright-regression.spec.mjs`:

```js
await expect(page.getByRole("button", { name: /登录/ })).toBeVisible();
await expect(page.getByText("今日训练")).toBeVisible();
await expect(page.getByText("患者队列")).toBeVisible();
await expect(page.getByText("账号治理")).toBeVisible();
await expect(page.getByText("照护")).toBeVisible();
await expect(page.getByText(/manifest|Provider|Endpoint|fallback|mock|demo|技术验收/i)).toHaveCount(0);
```

- [ ] **Step 2: Add failing formal UI business-chain browser check**

Create `scripts/formal-ui-business-chain.spec.mjs`:

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

- [ ] **Step 3: Run red check**

Run:

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
```

Expected: fail until role screens, seeded users, real business actions, and copy boundaries are complete.

- [ ] **Step 4: Implement browser-facing fixes**

Implementation requirements:

- Desktop and mobile nav fit without overlap.
- Patient runtime video/canvas areas have stable aspect ratios.
- CTAs remain visible and do not jump during runtime state changes.
- No page reads as a landing page or technology demo.
- Full browser chain performs real login, real doctor risk/plan/preparation action, real patient training submission, real doctor review, real caregiver summary read, and real admin/auditor export request.

- [ ] **Step 5: Run Unit 12 verification**

Run:

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
pnpm --filter @rehab-platform/web lint
```

Expected: pass across configured projects.

---

## Unit 13: Full Regression And Completion Audit

**Purpose:** Prove the UI rebuild is complete before claiming done.

**Files:**

- Modify: `docs/formal-acceptance-chain-runbook.md`
- Modify: `docs/web-playwright-regression-runbook.md`
- Modify: `docs/customer-delivery-progress-and-input-summary.md`
- Test: all affected suites below

- [ ] **Step 1: Run focused source and behavior tests**

Run:

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
  apps/web/src/lib/browser-pose-game-library.test.ts \
  apps/web/src/lib/training-start-readiness.test.ts \
  apps/web/src/lib/browser-pose-training-result.test.ts \
  apps/web/src/lib/unity-training-bridge.test.ts \
  apps/web/src/lib/ai-assessment-draft.test.ts
```

Expected: pass.

- [ ] **Step 2: Run service, seed, and contract verification**

Run:

```bash
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web exec tsc --noEmit
pnpm --filter @rehab-platform/api exec jest
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
pnpm db:seed
node scripts/verify-seed-idempotency.mjs
pnpm verify:contracts
pnpm verify:formal-acceptance-chain
```

Expected: pass. If `tsc --noEmit` reports pre-existing test-type errors, record exact file/line evidence and fix them unless they are proven unrelated and outside this plan's write scope.

- [ ] **Step 3: Run browser regression**

Run:

```bash
pnpm test:playwright
pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs
```

Expected: pass.

- [ ] **Step 4: Manual smoke**

Start the product:

```bash
pnpm infra:up
pnpm db:seed
pnpm dev
```

Manual checks:

- Login as patient and verify `今日 -> 训练 -> 记录 -> 我的`, no technical terms, no demo copy, training journey can reach result.
- Login as doctor and verify `患者队列 -> 评估复核 -> 计划管理 -> 训练复核`, plan and review actions use real API states.
- Login as caregiver and verify `照护 -> 进展 -> 提醒 -> 我的`, desensitized only.
- Login as admin/auditor and verify `账号治理 -> 内容治理 -> 配置治理 -> 安全审计`, export reason required, audit remains admin-only.
- Complete the deterministic seeded formal browser path from doctor preparation through patient result, doctor review, caregiver summary, and admin/auditor export. If a required real dependency is unavailable, record the exact blocker and do not add fallback.

- [ ] **Step 5: Update runbooks and progress docs**

Implementation requirements:

- `docs/web-playwright-regression-runbook.md` records the new role smoke and formal UI chain command.
- `docs/formal-acceptance-chain-runbook.md` records the rebuilt UI path through the formal chain.
- `docs/customer-delivery-progress-and-input-summary.md` states that the UI was rebuilt as minimal premium, technical/demo surfaces were removed from product flows, and customer-requested plan variety/risk/intervention/data-collection framing is included.

- [ ] **Step 6: Final review**

Use `superpowers:requesting-code-review` for a final whole-branch review. The review must check:

- Patient/caregiver visible copy has no forbidden technical terms.
- Doctor pages do not expose raw provider/runtime/evidence internals.
- Admin pages do not mount training runtime.
- Seed is idempotent.
- Formal chain and browser regression pass.
- No fallback/mock/demo/silent-downgrade behavior was introduced.

Only after this review and all commands pass may this plan be marked complete.

## Completion Criteria

This plan is complete only when all of the following are proven by current evidence:

- Units 0 through 13 are checked off.
- All listed focused tests pass.
- `pnpm --filter @rehab-platform/web lint` passes.
- `pnpm --filter @rehab-platform/web exec tsc --noEmit` passes or all remaining errors are fixed/recorded as proven unrelated pre-existing test-type issues.
- `pnpm --filter @rehab-platform/api exec jest` passes.
- `pnpm db:seed` passes twice without duplicate mutable clinical seed records.
- `node scripts/verify-seed-idempotency.mjs` produces stable output across the two seed runs.
- `pnpm verify:contracts` passes.
- `pnpm verify:formal-acceptance-chain` passes.
- `pnpm test:playwright` passes.
- `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs` passes.
- Manual smoke confirms the UI is simple, premium, role-focused, and free of demo/technical product clutter.
- No fallback/mock/demo/silent-downgrade strategy was added, requested, or routed around.
