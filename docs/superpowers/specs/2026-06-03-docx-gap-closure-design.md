# Customer DOCX Gap Closure Design

## Goal

Close the customer DOCX gaps that can be completed in software now: registration review, continuous AI dialogue, family social/care guidance, reward achievements, sensitive-field encryption, and coordinated UI polish. Wearable device integration and production deployment are explicitly out of this implementation batch until the customer provides device/API and infrastructure details.

## Scope

### In Scope

- Institution-reviewed registration requests for patients and caregivers.
- Multi-turn AI conversation sessions that keep dialogue context, supplier evidence, consent snapshots, and audit events.
- Family care circle social features: posts, comments, reactions, moderation, privacy-safe visibility, and care precautions.
- Reward and achievement records generated from valid training results and plan completion signals.
- Sensitive-field encryption framework for newly written identity/contact/health payloads, with key reference metadata and no plaintext in audit metadata.
- UI/UX updates using a clinical future-feeling style while hiding audit/evidence/technical terms from patient-facing screens.
- Tests and verification scripts for the new formal capabilities.

### Out Of Scope For This Batch

- Wearable device vendor integration, because the customer must provide device model, SDK/API, indicator list, sampling frequency, thresholds, and field evidence.
- Production deployment, because the customer must provide server, domain, HTTPS, database, Redis, backup, monitoring, and operations ownership.
- Any fallback behavior for AI, STT, TTS, registration approval, social moderation, reward issuance, or encryption.

## Product Decisions

### Registration

Use an institution-reviewed registration model instead of fully open self-registration. A patient or caregiver can submit a registration request, but an admin/doctor must approve it before a login account is created. This satisfies the DOCX "user registration/login" requirement without allowing unverified users into health-data flows.

### Continuous AI Dialogue

Add AI conversation sessions as a formal capability separate from one-shot assessment drafts. Sessions store turn order, user/assistant roles, assessment type, model evidence, consent snapshot, and human review status. AI-generated output can prefill assessment drafts only after the user explicitly ends the session and a clinician reviews it.

### Family Social And Precautions

Implement a privacy-safe care circle, not a public patient social feed. Patients and authorized caregivers can post encouragement, check-in notes, and questions. Doctors/admins can moderate and publish care precautions. Family users can see only authorized, desensitized summaries.

### Rewards

Rewards are generated from backend-verified events only: valid training result, plan streak, weekly completion, and clinician-accepted review. Abnormal, duplicate, low-quality, or unreviewed data cannot issue rewards.

### Sensitive Data Encryption

Add an application-level encryption envelope for new sensitive payload fields. Existing clear fields remain for compatibility until a migration strategy is approved; new sensitive snapshots and extended payloads are stored as encrypted envelopes with key reference and algorithm metadata. No fallback plaintext storage is allowed when encryption is required.

## Data Model Additions

- `RegistrationRequest`: self-submitted request with requested role, contact, patient/caregiver profile data, review status, reviewer, and audit trail.
- `AiConversationSession`: patient-scoped multi-turn session with assessment type, status, model/provider metadata, consent snapshot, and review linkage.
- `AiConversationMessage`: turn-level messages with role, content envelope, model call evidence, turn index, and created time.
- `CareCirclePost`, `CareCircleComment`, `CareCircleReaction`: privacy-safe family/social interaction records.
- `CarePrecaution`: doctor/admin-authored care guidance visible to patient/family according to scope.
- `RewardRule`, `RewardLedger`, `Achievement`: reward configuration and issued reward evidence.
- `SensitiveDataEnvelope`: reusable JSON shape for encrypted payloads.

## API Additions

- `POST /auth/registration-requests`: submit registration request.
- `GET /admin/registration-requests`: list pending/reviewed requests.
- `PATCH /admin/registration-requests/:id/review`: approve or reject, creating accounts only on approval.
- `POST /ai/conversations`: start conversation.
- `POST /ai/conversations/:id/messages`: append user turn and request assistant answer.
- `PATCH /ai/conversations/:id/complete`: close session for clinician review.
- `GET /patients/:id/ai-conversations`: list conversation summaries.
- `GET /care-circle/patients/:id/posts`: list visible care-circle posts.
- `POST /care-circle/patients/:id/posts`: create patient/caregiver post.
- `POST /care-circle/posts/:id/comments`: comment.
- `PATCH /care-circle/posts/:id/moderate`: doctor/admin moderation.
- `GET /patients/:id/rewards`: reward ledger and achievements.
- `POST /admin/reward-rules`: create/update reward rules.

## UI Direction

Use the existing clinical future-feeling visual language, but reduce patient cognitive load:

- Patient navigation: primary patient flow uses large task cards and bottom navigation; no audit/evidence/export/manifest wording on patient screens.
- AI dialogue: conversational card with progress, clear "continue/finish for clinician review" actions, and plain language.
- Family: care circle, care precautions, progress summary, and encouragement are grouped into a family care center.
- Rewards: patient sees simple achievements and streaks; clinicians/admins see evidence and eligibility details.
- Admin/security: technical terms stay in admin panels only.

## Acceptance Criteria

- Registration requests cannot create active accounts until an authorized reviewer approves them.
- Duplicate account/mobile requests are rejected or kept pending without creating accounts.
- AI conversations require `privacy_policy` and `ai_processing` consent and must write audit logs for start/message/complete.
- AI conversation messages must not store raw request/response bodies in audit metadata.
- Social posts must enforce authorization and desensitization; revoked caregiver access blocks visibility.
- Rewards must be issued once per qualifying backend event and must not issue for abnormal or duplicate training results.
- Sensitive payloads marked as encrypted must include algorithm, key reference, ciphertext, IV, tag, and version metadata.
- Patient-facing UI must not contain evidence JSON, audit IDs, manifest, loader, API JSON, or export language.

## Verification

- API Jest tests for registration, AI conversations, care circle, rewards, and sensitive envelope validation.
- Node delivery tests for schema/API boundary and patient-facing UX terms.
- Playwright regression for the updated patient, family, AI dialogue, registration, and rewards entries.
- Existing delivery checks remain required: `pnpm test:delivery`, `pnpm delivery:check`, API Jest, web lint/build, and Playwright.
