# Sensitive Data Encryption Migration Implementation Plan

> **Not the current UI execution plan:** Current UI execution remains governed by `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`. This document is limited to the sensitive-data encryption migration.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Task 3 approved plaintext persistence path with AES-256-GCM envelopes bound to the real database row UUID, migrate existing rows offline with one configured key, and expose only decrypted business DTOs.

**Architecture:** Each sensitive row stores one or more typed JSON envelopes. The envelope AAD is exactly `{ tableName, recordId: row.id, fieldName }`; row IDs are generated before encryption. Searchable phone numbers use a deterministic HMAC lookup made from the same single configured 32-byte key, while plaintext phone columns are nulled and removed from Prisma reads. Additive columns land first, a hard-failing offline command backfills and nulls legacy values in one locked transaction, and final constraints reject incomplete migration. There is no legacy read, dual-read, default key, retry, skipped row, or plaintext fallback.

**Tech Stack:** Prisma 6, PostgreSQL 18, NestJS 11, TypeScript, Node crypto AES-256-GCM/HMAC-SHA256, Jest, node:test.

## Fixed Scope

| Table                     | Envelope field                       | Plaintext payload moved into it                                                 |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `user`                    | `identityEnvelope`                   | `displayName`, `mobilePhone`                                                    |
| `patient_profile`         | `identityEnvelope`                   | `name`, `gender`, `age`                                                         |
| `patient_profile`         | `contactEnvelope`                    | `mobilePhone`, `caregiverName`, `caregiverPhone`                                |
| `patient_profile`         | `careDetailsEnvelope`                | `healthMetrics`                                                                 |
| `registration_request`    | `identityEnvelope`                   | `displayName`, `mobilePhone`, `profileSnapshot`                                 |
| `registration_request`    | `reviewEnvelope`                     | `reviewNote`                                                                    |
| `care_circle_post`        | `contentEnvelope`                    | `body`, `mood`, `privateMetadata`                                               |
| `care_circle_post`        | `moderationEnvelope`                 | `moderationReason`                                                              |
| `care_circle_comment`     | `contentEnvelope`                    | `body`, `privateMetadata`                                                       |
| `care_precaution`         | `contentEnvelope`                    | `title`, `content`                                                              |
| `assessment_record`       | `resultEnvelope`                     | `scoreSummary`, `rawInputSummary` including transcripts and doctor review notes |
| `risk_grade_record`       | `reasonEnvelope`                     | `reasonSummary`                                                                 |
| `ai_analysis_record`      | `inputEnvelope` / `outputEnvelope`   | `inputSummary` / `outputSummary`                                                |
| `ai_conversation_session` | `summaryEnvelope` / `reviewEnvelope` | `summary` / `reviewNote`                                                        |
| `ai_conversation_message` | `contentEnvelope`                    | `content`, `contentSnapshot`, `evidenceMetadata`                                |
| `training_result`         | `reviewEnvelope`                     | `reviewNote`                                                                    |

`user.account` and `registration_request.account` remain plaintext login identifiers. Rehabilitation plans, consent evidence, training metrics, and low-sensitivity category/status fields are outside this approved Task 3 boundary.

---

### Task 1: Inject One Strict Encryption Key And Restore Type Safety

**Files:**

- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/api/src/auth.service.spec.ts`
- Test: `apps/api/src/sensitive-encryption.spec.ts`

- [ ] Add failing tests proving `AppService` receives one explicit `SensitiveEncryptionKey`, does not read environment variables, and fails construction when the provider is absent.
- [ ] Export a Nest injection token and provider whose factory is exactly `requireSensitiveEncryptionKey`; inject it into `AppService` and pass it as the third argument to every `encryptSensitiveJson`/`decryptSensitiveJson` call.
- [ ] Replace every non-UUID test AAD with a canonical UUID fixture; do not weaken `packages/db/src/sensitive-encryption.ts` validation.
- [ ] Fix the three Cognitive fixture typing errors and four auth mock overload errors without changing runtime behavior or weakening assertions.
- [ ] Run:

```bash
pnpm --filter @rehab-platform/api exec jest src/sensitive-encryption.spec.ts src/app.service.spec.ts src/auth.service.spec.ts --runInBand
pnpm --filter @rehab-platform/api exec tsc --noEmit --pretty false
```

Expected: focused tests pass and API typecheck reports zero errors.

### Task 2: Add Envelope Schema, Lookup Columns, And Offline Backfill

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260714090000_sensitive_encryption_envelopes/migration.sql`
- Create: `packages/db/src/backfill-sensitive-encryption.ts`
- Create: `packages/db/src/backfill-sensitive-encryption.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`
- Modify: `package.json`
- Create: `packages/db/prisma/sensitive-encryption-migration.contract.test.mjs`
- Create: `packages/db/prisma/sensitive-encryption-migration.postgres.test.mjs`

- [ ] Write contract RED tests asserting every additive envelope/lookup column exists and plaintext columns become nullable legacy-only SQL columns. Final completion constraints are intentionally deferred to Task 6 after every API/seed writer has switched.
- [ ] Add JSONB envelope columns from the fixed-scope table and `mobilePhoneLookup` columns on `user` and `registration_request`; add indexes required by current phone duplicate queries.
- [ ] Write backfill RED tests for missing/noncanonical key, wrong key, tamper, AAD mismatch, non-UUID row, partial envelope state, concurrent execution, and rollback on any failed row.
- [ ] Implement `pnpm db:sensitive:backfill` using one `SENSITIVE_DATA_KEY_REF` plus one canonical base64 32-byte `SENSITIVE_DATA_KEY`. Acquire one PostgreSQL advisory transaction lock, preflight every row, encrypt using the row UUID, verify decrypt equality, update envelopes/lookups, and set migrated plaintext columns to null in the same transaction.
- [ ] Reject a second execution unless every row is already fully migrated, every plaintext legacy column is null, every envelope uses the configured kid and exact AAD, and every lookup matches decrypted phone data.
- [ ] Keep additive envelope columns nullable during this task so the controlled backfill can run on a populated copy. Optional source values use nullable envelopes, not fabricated empty data.
- [ ] Run:

```bash
pnpm --filter @rehab-platform/db test
node --test packages/db/prisma/sensitive-encryption-migration.contract.test.mjs
pnpm db:validate
```

Expected: all unit/contract tests pass; no PostgreSQL test is claimed unless its disposable URL is configured.

### Task 3: Encrypt User, Patient, And Registration Workflows

**Files:**

- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/api/src/registration-credential.spec.ts`
- Modify: `apps/api/src/app.controller.spec.ts`

- [ ] Add persistence RED tests that inspect Prisma create/update arguments and prove no display name, phone, patient identity/contact/care value, profile snapshot, or registration review note appears outside ciphertext.
- [ ] Generate each target UUID before encryption. Encrypt the fixed payload groups with exact table/row/field AAD and persist only envelopes plus phone HMAC lookups.
- [ ] Replace phone equality queries with the HMAC lookup. Keep account lookup unchanged. Never decrypt rows merely to search.
- [ ] Add read RED tests for list/detail/login/session/registration approval/caregiver/export serializers. Decrypt exact envelopes into current business DTOs; missing/tampered/wrong-key envelopes hard-fail.
- [ ] Remove all reads and writes of the legacy fields from Prisma application code; do not retain a plaintext branch.
- [ ] Run focused registration, credential, role, patient and controller suites plus API typecheck.

### Task 4: Encrypt Care Circle And Precaution Workflows

**Files:**

- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/api/src/app.controller.spec.ts`

- [ ] Add RED tests for post/comment/precaution/moderation persistence proving plaintext and envelope JSON never appear in API output or audit metadata.
- [ ] Pre-generate UUIDs and encrypt content/moderation groups with exact row AAD before each create/update.
- [ ] Decrypt through one typed serializer per model for list/create/update responses. A missing or invalid envelope rejects the request.
- [ ] Run only care-circle/precaution focused tests, API typecheck, Prettier and diff checks.

### Task 5: Encrypt Assessment, AI, Conversation, And Review Workflows

**Files:**

- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/api/src/provider-request.spec.ts`

- [ ] Add RED persistence tests for assessment transcripts/summaries, risk reasons, AI inputs/outputs, conversation messages/session summaries, and training review notes. Assert provider/audit metadata contains no plaintext.
- [ ] Pre-generate assessment, risk, AI analysis, conversation message and review target UUIDs; encrypt every fixed-scope payload with exact row AAD in the same business transaction.
- [ ] Replace all list/detail/review response paths with typed decrypting serializers. Provider failure records remain classified evidence but never retain raw clinical content.
- [ ] Re-run provider, AI, speech, assessment, conversation, training review, authorization and transaction suites; run API typecheck.

### Task 6: Make Seeds And Full Migration Chain Ciphertext-Only

**Files:**

- Modify: `packages/db/prisma/seed.ts`
- Modify: `packages/db/prisma/seed-trial.ts`
- Modify: `packages/db/src/trial-seed-contract.test.ts`
- Modify: `packages/db/src/first-admin-bootstrap.test.ts`
- Modify: `.env.example`
- Modify: relevant local delivery documentation and validation tests
- Create: `packages/db/prisma/migrations/20260714170000_sensitive_encryption_finalize/migration.sql`

- [ ] Add RED tests proving seed/trial rows use real UUID AAD and contain no fixed plaintext sentinel in any migrated column or JSON payload.
- [ ] Make seeds require the same single key and write only envelopes/lookups. Missing key hard-fails before any seed write.
- [ ] Add the final migration only after all API/seed writers are ciphertext-only: set required envelopes `NOT NULL`, add checks that every legacy plaintext column is null, and remove legacy fields from the Prisma model. Do not drop or constrain optional business values into fabricated data.
- [ ] On an empty disposable PostgreSQL database, run the complete Prisma migration chain, encrypted seed, API start, and representative decrypting reads.
- [ ] On a populated disposable copy, apply the additive migration, run the backfill command, apply final constraints, and verify every fixed-scope row decrypts exactly while all legacy plaintext columns are null.
- [ ] Run the Task 3 focused matrix, API/db typechecks, Prisma validation, Prettier and `git diff --check`.

Expected: no plaintext read fallback exists; wrong key/tamper/missing envelope stops the operation; empty and populated migration paths have exact evidence.
