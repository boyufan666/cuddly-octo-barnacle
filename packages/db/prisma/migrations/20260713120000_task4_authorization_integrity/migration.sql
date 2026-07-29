BEGIN;

-- Hard-fail all ambiguous pre-existing states. This migration never chooses a
-- winner or silently retires one of multiple business records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "risk_grade_record"
    WHERE "isCurrent" = true
    GROUP BY "patientId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: multiple current risk grades exist for one patient';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "rehab_plan"
    WHERE "isCurrent" = true
    GROUP BY "patientId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: multiple current rehab plans exist for one patient';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "rehab_plan"
    WHERE "status" = 'pending_confirm'
    GROUP BY "patientId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: multiple pending rehab plans exist for one patient';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "registration_request"
    WHERE "reviewStatus" = 'pending'
    GROUP BY "account"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: multiple pending registration requests share an account';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "registration_request"
    WHERE "reviewStatus" = 'pending' AND "mobilePhone" IS NOT NULL
    GROUP BY "mobilePhone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: multiple pending registration requests share a mobile phone';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "patient_profile"
    WHERE "responsibleDoctorId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: patient without a responsible doctor';
  END IF;
END $$;

-- Existing plans have exactly one deterministic owner: their patient's
-- responsible doctor. No doctor is inferred from unrelated records.
UPDATE "rehab_plan" AS plan
SET "doctorId" = patient."responsibleDoctorId"
FROM "patient_profile" AS patient
WHERE plan."patientId" = patient."id"
  AND plan."doctorId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rehab_plan" WHERE "doctorId" IS NULL) THEN
    RAISE EXCEPTION 'Task 4 integrity conflict: rehab plan has no responsible doctor';
  END IF;
END $$;

ALTER TABLE "patient_profile"
  ALTER COLUMN "responsibleDoctorId" SET NOT NULL;

ALTER TABLE "rehab_plan"
  ALTER COLUMN "doctorId" SET NOT NULL;

-- Normalize the former two-part pending state into the explicit state used by
-- the compare-and-set review transition.
UPDATE "ai_conversation_session"
SET "status" = 'pending_human_review'
WHERE "status" = 'completed'
  AND "reviewedByUserId" IS NULL
  AND "reviewedAt" IS NULL
  AND "metadata" #>> '{humanReview,status}' = 'pending_human_review';

CREATE UNIQUE INDEX "risk_grade_record_one_current_per_patient"
  ON "risk_grade_record"("patientId")
  WHERE "isCurrent" = true;

CREATE UNIQUE INDEX "rehab_plan_one_current_per_patient"
  ON "rehab_plan"("patientId")
  WHERE "isCurrent" = true;

CREATE UNIQUE INDEX "rehab_plan_one_pending_per_patient"
  ON "rehab_plan"("patientId")
  WHERE "status" = 'pending_confirm';

CREATE UNIQUE INDEX "registration_request_one_pending_account"
  ON "registration_request"("account")
  WHERE "reviewStatus" = 'pending';

CREATE UNIQUE INDEX "registration_request_one_pending_mobile"
  ON "registration_request"("mobilePhone")
  WHERE "reviewStatus" = 'pending' AND "mobilePhone" IS NOT NULL;

DROP INDEX "collection_batch_idempotencyKey_key";
DROP INDEX "training_session_idempotencyKey_key";

CREATE UNIQUE INDEX "collection_batch_patientId_idempotencyKey_key"
  ON "collection_batch"("patientId", "idempotencyKey");

CREATE UNIQUE INDEX "training_session_patientId_idempotencyKey_key"
  ON "training_session"("patientId", "idempotencyKey");

COMMIT;
