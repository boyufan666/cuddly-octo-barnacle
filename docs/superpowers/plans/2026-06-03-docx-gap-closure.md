# Customer DOCX Gap Closure Implementation Plan

> **Historical capability plan:** This file is not the current UI execution plan. Continue current UI/product closure from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`; use this document only as customer DOCX software-gap groundwork.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the software-side gaps from the customer DOCX without adding fallback behavior.

**Architecture:** Add first-class data models and APIs for registration review, continuous AI dialogue, family care circle, rewards, and sensitive encryption envelopes. Then expose coordinated patient/family/admin UI that hides technical evidence from patient-facing surfaces. Wearable integration and production deployment remain gated by customer-supplied external details.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js, React, TypeScript, Tailwind CSS, Jest, Node test runner, Playwright.

---

### Task 1: Registration Requests And Approval

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [ ] **Step 1: Write failing API tests**

Add tests proving `createRegistrationRequest` stores a pending request without creating a user, `reviewRegistrationRequest` creates the account only on approved review, and rejection never creates accounts.

- [ ] **Step 2: Run API test and verify red**

Run: `pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts`

Expected: fails because registration request methods and Prisma delegates do not exist.

- [ ] **Step 3: Add Prisma model and service/controller methods**

Add `RegistrationRequest` with role, account, display name, contact, encrypted profile payload, status, reviewer, reviewedAt, decisionReason, createdAt, updatedAt. Add public `POST /auth/registration-requests`, guarded `GET /admin/registration-requests`, and guarded `PATCH /admin/registration-requests/:id/review`.

- [ ] **Step 4: Run API test and verify green**

Run: `pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts`

Expected: registration tests pass.

- [ ] **Step 5: Add front-end registration request form**

Add an unauthenticated login-page section for "申请开通账号"; admin/security panel lists and reviews requests. Use clear labels, loading states, and no patient-facing audit language.

- [ ] **Step 6: Add Playwright coverage**

Update Playwright to assert registration request entry exists and patient-facing language remains non-technical.

### Task 2: Continuous AI Conversation

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Add: `scripts/__tests__/ai-conversation-boundary.test.mjs`

- [ ] **Step 1: Write failing tests**

Test that starting a conversation requires patient access and consent, appending a message records a user turn and a supplier-backed assistant turn, completing a session sets `pending_human_review`, and audit metadata excludes raw provider payloads.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts`

Expected: fails because conversation methods/models are missing.

- [ ] **Step 3: Implement conversation schema and APIs**

Add `AiConversationSession` and `AiConversationMessage`. Add `POST /ai/conversations`, `POST /ai/conversations/:id/messages`, `PATCH /ai/conversations/:id/complete`, and `GET /patients/:id/ai-conversations`.

- [ ] **Step 4: Wire existing Xiaomi provider path**

Reuse the existing provider configuration and strict failure behavior. Do not add local or browser fallback answers. If provider configuration is incomplete, the API must fail with a clear error.

- [ ] **Step 5: Add front-end AI dialogue screen**

Add a conversational UI for guided assessment. Show turns, provider evidence summary, and "提交给医生复核"; do not create formal assessments directly from chat.

- [ ] **Step 6: Verify**

Run API Jest and `pnpm test:delivery`.

### Task 3: Family Care Circle And Precautions

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Add: `scripts/__tests__/care-circle-privacy.test.mjs`

- [ ] **Step 1: Write failing privacy tests**

Test that authorized caregivers can list desensitized care-circle posts, revoked caregivers are denied, posts/comments create audit logs, and moderation hides inappropriate posts.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts`

Expected: fails because care-circle methods/models are missing.

- [ ] **Step 3: Implement models and APIs**

Add `CareCirclePost`, `CareCircleComment`, `CareCircleReaction`, and `CarePrecaution`. Add list/create/comment/moderate APIs with patient/caregiver/doctor/admin authorization.

- [ ] **Step 4: Implement family UI**

Add family care center sections: progress summary, precautions, care circle, encouragement comments. Keep raw assessment/action metrics hidden.

- [ ] **Step 5: Verify**

Run API Jest, delivery tests, and Playwright.

### Task 4: Rewards And Achievements

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.controller.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Add: `scripts/__tests__/reward-eligibility.test.mjs`

- [ ] **Step 1: Write failing reward tests**

Test that a valid non-abnormal training result issues a reward once, duplicate submissions do not issue duplicate rewards, and abnormal or low-quality results do not issue rewards.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts`

Expected: fails because reward models/services are missing.

- [ ] **Step 3: Implement rewards**

Add `RewardRule`, `RewardLedger`, and `Achievement`. Call reward issuance after successful `submitTrainingResult` only when result is valid and not abnormal.

- [ ] **Step 4: Implement UI**

Add patient achievement/streak cards and admin rule overview. Keep evidence details in admin only.

- [ ] **Step 5: Verify**

Run API Jest and delivery tests.

### Task 5: Sensitive Encryption Envelope

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/app.service.ts`
- Modify: `apps/api/src/app.service.spec.ts`
- Modify: `scripts/check-delivery-readiness.mjs`
- Add: `apps/api/src/sensitive-encryption.ts`
- Add: `apps/api/src/sensitive-encryption.spec.ts`
- Add: `scripts/__tests__/sensitive-encryption-boundary.test.mjs`

- [ ] **Step 1: Write failing encryption tests**

Test that encryption requires `SENSITIVE_DATA_KEY_REF` and runtime key material, produces envelope metadata, rejects missing key config, decrypts only through service helpers, and audit metadata never contains plaintext sensitive fields.

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/sensitive-encryption.spec.ts apps/api/src/app.service.spec.ts`

Expected: fails because encryption helper does not exist.

- [ ] **Step 3: Implement encryption helper**

Use Node `crypto` AES-256-GCM with explicit key material from environment and `SENSITIVE_DATA_KEY_REF`. Do not add fallback plaintext storage when encryption is required.

- [ ] **Step 4: Store new sensitive extension payloads as envelopes**

Use encrypted envelopes for registration profile payloads, AI conversation message content snapshots, and care-circle private metadata. Keep current compatibility fields untouched.

- [ ] **Step 5: Extend delivery checks**

Add production readiness checks for key reference and raw secret boundaries. Raw key material must not be required in docs or frontend.

- [ ] **Step 6: Verify**

Run API Jest, delivery tests, and `pnpm delivery:check`.

### Task 6: Coordinated UI/UX Polish

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/types/api.ts`
- Modify: `scripts/__tests__/patient-facing-ux-boundary.test.mjs`
- Modify: `scripts/web-playwright-regression.spec.mjs`

- [ ] **Step 1: Write failing UI boundary tests**

Assert patient-facing page source does not expose `evidence JSON`, `manifest`, `loader`, `audit ID`, `只读验真`, or `脱敏导出` in patient and family sections.

- [ ] **Step 2: Run tests and verify red if violations remain**

Run: `pnpm test:delivery`

Expected: fails if patient/family sections still contain technical terms.

- [ ] **Step 3: Apply UI/UX Pro Max guidance**

Refine patient/family navigation to large, clear tasks; bottom nav max five items; accessible labels; visible loading and error states; clinical future-feeling cards without backend jargon.

- [ ] **Step 4: Verify UI**

Run: `pnpm test:delivery`, `pnpm --filter @rehab-platform/web lint`, `pnpm --filter @rehab-platform/web build`, and `pnpm test:playwright`.

### Task 7: Final Regression

**Files:**
- No direct edits unless verification finds defects.

- [ ] **Step 1: Run full delivery checks**

Run:

```bash
pnpm test:delivery
pnpm delivery:check
pnpm --filter @rehab-platform/api exec jest --runInBand
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
pnpm test:playwright
git diff --check
```

- [ ] **Step 2: Fix only verified defects**

If a command fails, identify root cause before editing. Do not add fallback behavior.

- [ ] **Step 3: Summarize status**

Report implemented capabilities, external dependencies still intentionally out of scope, and exact verification evidence.
