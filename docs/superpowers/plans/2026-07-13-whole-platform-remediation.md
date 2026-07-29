# Whole Platform Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **UI execution authority:** This plan is the orchestration entry point for whole-platform remediation, but it is not the current UI execution plan. Current UI execution remains governed by `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`, including information architecture, visual boundaries, the real business chain, and the rule that no fallback may be added without explicit user approval.

**Goal:** Make every currently implemented local workflow secure, reachable, internally consistent, recoverable, and behaviorally verified before deployment work begins.

**Architecture:** Work in dependency order: database/security contracts, backend clinical state machines, frontend role workflows, training runtimes, then repository-wide verification. Each behavior change follows red-green-refactor and each parallel worker receives a disjoint write set.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 18, Next.js 16, React 19, TypeScript, Jest, node:test, Playwright, Unity WebGL.

---

### Task 1: Freeze Baseline And Remove False Redis Contract

**Files:** root/package scripts, `infra/docker-compose.yml`, `.env.example`, startup/offline scripts, delivery validators/tests, affected runtime and customer documentation.

- [ ] Add failing contract tests proving Redis is not required by local startup, production-input validation, or delivery readiness.
- [ ] Remove the unused Redis container, `REDIS_URL`, image packaging, health gates, and unsupported Redis/BullMQ claims.
- [ ] Run focused delivery tests and repository-wide Redis searches; only historical plan evidence may remain.

### Task 2: Credential And Session Security

**Files:** Prisma schema/migrations, API auth/config/controller/service/guard tests, Web API/session hooks and tests.

- [ ] Add failing tests for Argon2id hashing, forced reset, administrator reset authorization, cookie login/logout, CSRF rejection, and absence of localStorage tokens.
- [ ] Add credential-version/reset fields and migration that invalidates existing SHA-256 credentials without deleting business data.
- [ ] Implement Argon2id account creation/reset and reject legacy credentials.
- [ ] Implement HttpOnly cookie authentication, CSRF validation, credentialed CORS, logout invalidation, and frontend session restoration.
- [ ] Run auth unit tests, API e2e auth tests, Web session tests, lint, and type checks.

### Task 3: Sensitive Data Encryption And Database Integrity

**Files:** encryption service/tests, Prisma schema and new migrations, controlled migration command, affected API serializers.

- [ ] Add failing round-trip, wrong-key, tamper, and no-plaintext persistence tests for every approved sensitive field group.
- [ ] Add encrypted envelope columns and a hard-failing migration/backfill command.
- [ ] Route all writes and reads through typed encryption boundaries; remove plaintext reads after migration.
- [ ] Add partial unique indexes, nullability repairs, range checks, missing foreign keys, and idempotency ownership checks.
- [ ] Verify the complete migration chain on an empty PostgreSQL database and a populated disposable copy.

### Task 4: Authorization And Atomic State Machines

**Files:** API service/controller/guard tests and integrity migration.

- [ ] Add role-matrix tests for patient data, AI review, plan recommendation, training review, registration review, consent withdrawal, and exports.
- [ ] Replace blanket admin and generic patient-access checks with explicit clinical permissions.
- [ ] Bind reviewer identity to the authenticated responsible doctor.
- [ ] Convert review/approval/current-record transitions to conditional transactional updates with audit writes in the same transaction.
- [ ] Add real PostgreSQL concurrency tests for duplicate review, current risk/plan, pending registration, and cross-patient idempotency keys.

### Task 5: AI, STT, And TTS Runtime Contracts

**Files:** provider gateway modules/tests, AI conversation/assessment service tests, Prisma AI models/migrations, Web speech/audio helpers/tests.

- [ ] Add failing tests for server-owned draft evidence, provider timeout, classified failure audit, concurrent turns, consent/session change during calls, input limits, STT payload limits, and TTS completion state.
- [ ] Persist provider calls and assessment drafts; formal assessment creation consumes one matching server-owned draft transactionally.
- [ ] Add hard provider timeouts, call limits, structured failures, and bounded inputs without retries or provider switching.
- [ ] Implement atomic turn state and compare-and-set doctor review.
- [ ] Align browser recording limits with the API and implement managed TTS playback lifecycle.

### Task 6: Assessment And Role User Experience

**Files:** relevant local Next.js 16 docs, role data/session hooks, navigation, doctor/patient/caregiver/admin workspaces, API client and component tests.

- [ ] Read the complete relevant local Next.js 16 documentation before editing frontend code.
- [ ] Add failing tests for stale patient selection, reachable initial assessment, doctor AI review, caregiver patient switching, scoped loading failures, operation-specific busy states, and permission-aware navigation.
- [ ] Add the patient submission and doctor review/approval workflow with clear pending, rejected, approved, empty, loading, and error states.
- [ ] Sequence/cancel patient data loads and preserve valid core data when optional panels fail.
- [ ] Add caregiver patient selection and permission-aware role/navigation behavior.

### Task 7: Training Runtime Integrity And Recovery

**Files:** training runtime components/helpers/tests, API training services/tests, Unity C# scripts/scene/bridge/protocol tests, Prisma migration where needed.

- [ ] Add failing end-to-end contract tests for prescribed duration, Unity `collectionBatchId`, protocol quality gates, runtime dynamic difficulty, valid Cognitive rounds, camera device identity, resume, abort, and duplicate-session rejection.
- [ ] Pass prescribed duration and batch/session identity through all three runtimes.
- [ ] Apply protocol-snapshot metrics and quality gates on submission.
- [ ] Implement real in-session Browser Pose/Cognitive difficulty changes and truthful evidence.
- [ ] Implement valid Cognitive sequence interaction and scoring.
- [ ] Require consent before camera access and reuse the selected device for preflight and runtime.
- [ ] Add resume/abort APIs and UI, and prevent parallel active sessions.

### Task 8: Repository Quality And Final Verification

**Files:** API lint offenders, root/Web package scripts, verification scripts/tests, acceptance documentation.

- [ ] Clear all lint errors without weakening rules.
- [ ] Add unified root test/check scripts covering API, Web, delivery, database, builds, smoke tests, Playwright, and Unity checks.
- [ ] Replace high-risk source-string-only tests with behavior tests where a runnable boundary exists.
- [ ] Run the full clean verification matrix and record exact pass/fail evidence.
- [ ] Report deployment readiness separately; do not mark deferred Render or production evidence complete.
