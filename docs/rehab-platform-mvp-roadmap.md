# Rehabilitation Platform MVP Roadmap

## Recommendation

Build a new project.

Do not start with high-fidelity UI or page implementation first.

Use this order instead:

1. Requirement analysis
2. Core business flow design
3. Data model and module boundaries
4. Information architecture and low-fidelity UI
5. Technical architecture
6. MVP development
7. High-fidelity UI polish
8. Testing and pilot rollout

## Why

This project is not a normal content website.

Its core value depends on a closed loop:

- patient onboarding
- AI assessment
- risk grading
- rehab plan matching
- game training
- process data collection
- doctor/family/admin review
- plan adjustment

If we start from UI only, we will almost certainly rework:

- user roles
- permissions
- data fields
- AI result structure
- game data schema
- backend interfaces

## Phase 1: Requirement Analysis

Define these first:

- target users for MVP: patient, doctor, admin, family
- primary usage scenario: home rehab, institution rehab, or both
- MVP closed loop
- AI boundary: assistant decision or recommendation only
- hardware route: camera-only first, or camera + Unity/other sensors
- compliance baseline: login, privacy consent, audit log, data encryption

Deliverables:

- MVP scope list
- non-MVP list
- role matrix
- functional priority list

## Phase 2: Core Flows

Design the main flows before drawing final UI:

1. Patient flow
   - register/login
   - profile and consent
   - AI assessment
   - risk result
   - recommended plan
   - game training
   - training result

2. Doctor flow
   - patient list
   - view assessment result
   - adjust rehab plan
   - review training history

3. Family flow
   - view progress
   - receive reminders
   - view suggestions

4. Admin flow
   - account and role management
   - game library management
   - AI record management
   - model result review
   - statistics and audit

Deliverables:

- main flow diagrams
- exception flow diagrams
- page inventory

## Phase 3: Data Model

Define these entities early:

- user
- role
- patient_profile
- consent_record
- assessment_record
- ai_conversation
- risk_grade
- rehab_plan
- rehab_plan_item
- game
- game_session
- game_event
- realtime_motion_metric
- report
- audit_log

Also define:

- which fields are sensitive
- which fields must be encrypted
- which data belongs to patient/doctor/admin/family visibility

Deliverables:

- domain model
- data dictionary
- permission matrix

## Phase 4: UI/UX

Do UI in two passes.

First pass: low fidelity

- patient home
- assessment
- result
- training page
- doctor patient detail
- doctor plan editor
- family overview
- admin dashboard

Second pass: high fidelity

- only after main flow and fields are stable
- prioritize patient and doctor core pages first
- polish secondary pages later

## Phase 5: Technical Architecture

Suggested modules:

- web app for patient/family
- web app for doctor/admin
- backend API
- auth and RBAC
- AI service layer
- game integration layer
- data and analytics layer
- audit and privacy layer

Must define before development:

- API contract
- AI response schema
- game data upload schema
- identity and permission design

## Phase 6: MVP Development Order

Recommended MVP build sequence:

1. Auth and role system
2. Patient profile and consent
3. AI assessment
4. Structured assessment result
5. Risk grading and rehab plan generation
6. One game integration
7. Game result upload
8. Doctor review page
9. Admin basic management

## First Week Output

Week 1 should produce these three artifacts:

1. MVP requirements document
2. role flows and page list
3. core data model and module map

Only after these are stable should we begin low-fidelity UI and project scaffolding.

## Practical Rule

Anything that changes:

- target user
- responsibility boundary
- core process
- data structure
- AI output
- compliance requirement

must be decided before UI implementation.

Anything about:

- visual polish
- gamification
- branding
- secondary admin pages
- extra reports

can be improved later.

## Next Suggested Step

Start from:

1. a clean MVP requirement document
2. a role-by-role page list
3. a database/domain model draft

Then we can scaffold the new project on top of that.
