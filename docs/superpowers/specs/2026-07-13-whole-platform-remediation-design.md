# Whole Platform Remediation Design

## Objective

Repair the audited local Rehabilitation Platform so that its implemented workflows are secure, internally consistent, recoverable, and behaviorally tested. Cloud deployment and Render-specific work are explicitly deferred until the local product passes the complete verification matrix.

## Fixed Decisions

- Remove Redis from the current runtime, local infrastructure, delivery checks, and documentation because no application code uses it.
- Preserve business data while replacing SHA-256 passwords with Argon2id. Existing accounts must reset their passwords; no legacy hash verification remains.
- Replace browser `localStorage` JWT storage with an HttpOnly cookie session, CSRF protection, credentialed CORS, and explicit logout invalidation.
- Encrypt patient identity/contact/care details, AI conversation content, assessment transcripts, AI input/output, and review notes with AES-GCM. Migration must finish before plaintext is removed; there is no plaintext read fallback.
- Patients may submit assessment material, but only the responsible doctor may approve clinical AI conversations and create formal assessments and plans. Doctors may also enter assessment material for patients.
- Interrupted training resumes the same `in_progress` session. Users may explicitly abort it with a reason; aborted sessions do not produce valid results. Parallel sessions for the same plan item are forbidden.
- No provider switching, fabricated results, mock production paths, silent downgrade, compatibility login, or data-encryption fallback may be introduced.

## Delivery Slices

### 1. Security And Data Foundation

Introduce versioned Argon2id credentials, forced-reset state, controlled administrator password reset, HttpOnly sessions, CSRF validation, explicit CORS credentials, field-level encrypted envelopes, and migrations for existing records. Authorization will be permission-specific: operational and audit administrators do not receive blanket access to patient clinical data.

State transitions that currently use read-then-write will use conditional updates and transactions. Database constraints will enforce one current risk record, one current plan, one pending registration identity, valid numeric ranges, and consistent relationships where Prisma and PostgreSQL can express them safely.

### 2. AI, STT, And TTS Clinical Chain

Persist provider calls and AI drafts on the server. Formal assessment creation accepts a server-owned draft identifier rather than client-authored provider evidence. Reviewer identity and review time come from the authenticated doctor.

Provider requests receive hard timeouts, input limits, structured failure classification, and failure auditing. AI conversation turns use explicit pending/completed/failed state and transactional compare-and-set completion so concurrent messages or reviews cannot overwrite one another. No request retries or alternate provider behavior will be added.

STT recording duration and payload limits will agree before upload. TTS UI state will distinguish generation, playback started, playback completed, stopped, and failed, and will release audio resources.

### 3. Role Workflows And User Experience

The doctor workspace gains a reachable new-assessment flow and an AI conversation review queue. Patients can submit assessment materials but cannot approve them. Patient switching is request-sequenced so stale responses cannot replace the currently selected patient.

Core workspace data and optional panels have separate loading/error states. Errors remain visible and actionable without erasing already loaded clinical data. Busy states are operation-specific. Caregivers can select among authorized patients, and navigation is permission-aware.

### 4. Training Runtime Integrity

The prescribed plan-item duration becomes the source of truth for Unity, Browser Pose, and Cognitive runtimes. Unity carries `collectionBatchId` through configuration, C#, bridge, parser, and API submission. Protocol snapshots drive required metrics and quality gates.

Browser Pose and Cognitive difficulty adjustments occur during the session and are recorded from actual runtime changes. Cognitive training presents a real sequence, prevents duplicate selections within a round, and computes results from observable interactions. Camera consent precedes device access, and preflight and runtime use the same selected device.

Training sessions support resume and explicit abort. Submission validates patient, plan item, assessment, batch, runtime identity, timestamps, evidence hash, and idempotency ownership without leaking another patient's records.

### 5. Quality Gates

Tests are added before each behavior change. Static contract checks remain supplementary and cannot substitute for behavior tests. The local release gate must include formatting/lint, type checking, API tests, Web tests, delivery tests, clean database migrations, database-backed concurrency tests, production builds, API/Web start smoke tests, Playwright workflows, and Unity source/build/bridge checks.

## Error Handling

- Security, authorization, encryption, provider, and integrity failures stop the operation and return a specific error.
- Business writes and their audit records share a transaction for clinical and security-sensitive operations.
- Provider failures preserve a failed call/turn record but never create a formal assessment or fabricated assistant response.
- UI retains valid previously loaded data and scopes failures to the affected operation.

## Deferred Work

Render Blueprint, cloud secret injection, production domains, production monitoring, managed backups, and production acceptance evidence are deferred. Local fixes must not claim these deployment items are complete.
