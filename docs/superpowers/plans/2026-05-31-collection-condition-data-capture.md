# Collection Condition Data Capture Implementation Plan

> **Historical capability plan:** This file is not the current UI execution plan. Continue current UI/product closure from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`; use this document only as protocol, condition, and batch data-capture groundwork.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal data-collection layer so each training dataset can be traced to an explicit protocol, condition, and batch.

**Architecture:** Add first-class Prisma models for collection conditions, protocols, and batches, then require every training session to bind an existing active batch. Store condition/protocol snapshots on the batch/session so exported data remains explainable even if templates change later.

**Tech Stack:** Prisma/PostgreSQL, NestJS service/controller, Next.js TypeScript client, existing node/Jest/Playwright verification.

---

### Task 1: Data Model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260531193000_collection_conditions/migration.sql`

- [ ] **Step 1: Add failing schema test**

Create or update `scripts/__tests__/collection-condition-schema.test.mjs` to assert `collection_condition`, `collection_protocol`, `collection_batch`, and `collectionBatchId` are present in the schema.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/__tests__/collection-condition-schema.test.mjs`
Expected: fail because models/fields do not exist yet.

- [ ] **Step 3: Add Prisma models and relations**

Add `CollectionCondition`, `CollectionProtocol`, `CollectionBatch`; add nullable `collectionBatchId` relation to `TrainingSession`; add optional `collectionBatchId` to `TrainingResult` and `MotionMetric` for query convenience.

- [ ] **Step 4: Add migration SQL**

Create tables with explicit foreign keys, indexes by patient/status/protocol, and nullable backfill-safe columns on existing training tables.

- [ ] **Step 5: Run schema test and Prisma generate**

Run: `node --test scripts/__tests__/collection-condition-schema.test.mjs` and `pnpm db:generate`.
Expected: pass.

### Task 2: Backend API

**Files:**
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/api/src/app.controller.spec.ts`

- [ ] **Step 1: Write failing service tests**

Add tests for creating conditions/protocols/batches, rejecting mock/demo/fallback markers, requiring `collectionBatchId` in `startTrainingSession`, rejecting batch mismatches, and rejecting training result submissions whose `metricsSummary.collectionBatchId` does not match the session.

- [ ] **Step 2: Run service tests to verify failure**

Run: `pnpm --filter @rehab-platform/api exec jest app.service.spec.ts --runInBand`.
Expected: fail because service methods and fields are missing.

- [ ] **Step 3: Implement DTO parsing and validation**

Add explicit validators for condition/protocol/batch fields. Reject any `mock`, `demo`, `local`, `manual`, or `fallback` marker in formal collection config. Do not create implicit default conditions.

- [ ] **Step 4: Implement service methods and controller routes**

Add routes:
- `GET /collection-protocols`
- `POST /admin/collection-conditions`
- `POST /admin/collection-protocols`
- `POST /collection-batches`
- `GET /patients/:id/collection-batches`

- [ ] **Step 5: Bind training sessions to batches**

Require `collectionBatchId` in `startTrainingSession`; verify patient, plan, plan item, game content, protocol runtime, and active status all match; write `collectionBatchId` and snapshots into the session.

- [ ] **Step 6: Bind training results to batches**

Require `metricsSummary.collectionBatchId`; reject mismatch; write `collectionBatchId` to training result and motion metrics.

- [ ] **Step 7: Run service/controller tests**

Run: `pnpm --filter @rehab-platform/api exec jest app.service.spec.ts app.controller.spec.ts --runInBand`.
Expected: pass.

### Task 3: Frontend Integration

**Files:**
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [ ] **Step 1: Write failing UI/source tests**

Assert patient-facing sections do not show `采集批次`, `采集协议`, `验收`, `审计`; assert `StartTrainingSessionRequest` includes `collectionBatchId`; assert admin/doctor source contains condition/batch management functions.

- [ ] **Step 2: Add API types and client methods**

Add `CollectionCondition`, `CollectionProtocol`, `CollectionBatch`, create/list requests, and API calls.

- [ ] **Step 3: Add admin/doctor UI**

Admin creates protocols/conditions; doctor creates patient collection batches. Patient only sees whether the training is ready.

- [ ] **Step 4: Update training start**

Select the matching ready batch for the current plan item and pass `collectionBatchId`. If missing, block with patient-friendly text, no generated fallback batch.

- [ ] **Step 5: Run UI tests and Playwright**

Run source tests and `pnpm test:playwright`.
Expected: pass.

### Task 4: Delivery Docs

**Files:**
- Create: `docs/collection-condition-data-capture-runbook.md`
- Modify: `docs/formal-delivery-gap-analysis.md`
- Modify: `docs/customer-acceptance-criteria.md`

- [ ] **Step 1: Document what is now collected**

Explain condition/protocol/batch/session/result/metric traceability.

- [ ] **Step 2: Document what remains out of scope**

State that raw long-term video/audio object storage is still not enabled unless customer explicitly approves storage, retention, deletion, and consent rules.

- [ ] **Step 3: Run delivery docs tests**

Run: `node --test scripts/__tests__/delivery-readiness.test.mjs`.
Expected: pass.

### Task 5: Full Verification

- [ ] **Step 1: Run API tests**

Run: `pnpm --filter @rehab-platform/api exec jest app.service.spec.ts app.controller.spec.ts --runInBand`.

- [ ] **Step 2: Run web lint/build**

Run: `pnpm --filter @rehab-platform/web lint` and `pnpm --filter @rehab-platform/web build`.

- [ ] **Step 3: Run delivery tests**

Run: `node --test scripts/__tests__/*.test.mjs`.

- [ ] **Step 4: Run Playwright**

Run: `pnpm test:playwright`.
