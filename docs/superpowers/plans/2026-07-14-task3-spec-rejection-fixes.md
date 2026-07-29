# Task 3.3 Spec Rejection Fixes Implementation Plan

> **Not the current UI execution plan:** Current UI execution remains governed by `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. This document is limited to the Task 3.3 encryption fixes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every production change. Git staging and commits are prohibited by the workspace instructions.

**Goal:** Close the five Task 3.3 specification-review findings without fallback, dual reads, retries, raw SQL, or type-assertion bypasses.

**Architecture:** Preserve ciphertext-only persistence and exact AAD. Add database uniqueness at the User lookup boundary, project decrypted identities to each DTO's exact shape, and share strict envelope payload parsers between authorization and service reads.

**Tech Stack:** Prisma schema/migrations, PostgreSQL contract tests, NestJS/Jest, TypeScript.

---

### Task 1: User phone lookup concurrency uniqueness

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/prisma/migrations/20260714090000_sensitive_encryption_envelopes/migration.sql`
- Modify: `packages/db/prisma/sensitive-encryption-migration.contract.test.mjs`
- Modify: `packages/db/prisma/sensitive-encryption-migration.postgres.test.mjs`
- Modify: `apps/api/src/app.service.ts`
- Test: `apps/api/src/app.service.spec.ts`

- [ ] Add schema and SQL contract assertions requiring a unique User lookup index while keeping RegistrationRequest lookup non-unique; run them and record RED.
- [ ] Add an API unit test that injects a Prisma `P2002` with the exact User `mobilePhoneLookup` target and proves the create/review transaction rejects with the existing explicit conflict semantics; prove unrelated unique targets propagate unchanged.
- [ ] Add `@unique` and the additive unique index, then add exact-target P2002 mapping only around User creation transactions.
- [ ] Run contract, database, Prisma generation/validation, and focused API tests; record GREEN.

### Task 2: Audit actor DTO projection

**Files:**

- Modify: `apps/api/src/app.service.ts`
- Test: `apps/api/src/app.service.spec.ts`

- [ ] Add audit-list and dashboard RED assertions requiring exactly `{ account, displayName }` and excluding `id`, `mobilePhone`, and `identityEnvelope`.
- [ ] Keep strict full User identity decryption, then return the exact audit actor projection.
- [ ] Run both focused tests and record GREEN.

### Task 3: Shared strict User identity parser

**Files:**

- Create: `apps/api/src/user-identity.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/auth.guard.ts`
- Test: `apps/api/src/auth.guard.spec.ts`
- Test: `apps/api/src/app.service.spec.ts`

- [ ] Add valid-envelope RED cases for missing/blank `displayName` and wrong-type `mobilePhone` in Guard and service reads.
- [ ] Implement one environment-independent parser that trims and rejects empty display names and accepts phone only as `null` or string under the existing format policy.
- [ ] Route Guard and AppService decrypted payloads through the shared parser and record GREEN.

### Task 4: Strict Patient age decoder

**Files:**

- Modify: `apps/api/src/app.service.ts`
- Test: `apps/api/src/app.service.spec.ts`

- [ ] Add valid-envelope RED cases for `"72"`, `true`, `null`, `0`, `121`, and non-integer ages through detail/caregiver/export read paths.
- [ ] Add an envelope-only decoder requiring a number, integer, and range `1..120`; do not change DTO input coercion.
- [ ] Run all three read-path groups and record GREEN.

### Task 5: Controller integration encryption setup

**Files:**

- Modify: `apps/api/test/auth.controller-integration-spec.ts`

- [ ] Run `test:controller-integration` and record the current RED.
- [ ] Override the same `SENSITIVE_ENCRYPTION_KEY`, use canonical UUID row-bound identity envelopes, save/restore relevant env, and close only initialized applications.
- [ ] Re-run integration tests and record GREEN.

### Final Verification

- [ ] Run migration contract/database tests and Prisma generate/validate.
- [ ] Run AppService 362, Task4/Auth/Guard/controller/credential/query, controller integration, and full API Jest.
- [ ] Run API typecheck and confirm only the three known Task 3.4/3.5 nullable errors remain.
- [ ] Run Prettier, `git diff --check`, legacy scans, and a final requirement-by-requirement review.
