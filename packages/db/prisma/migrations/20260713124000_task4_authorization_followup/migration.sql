BEGIN;

-- Refuse ambiguous historical authorization state. This migration never
-- chooses a grant, revokes consent, or rewrites a clinical plan owner.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "consent_record"
    WHERE "status" = 'granted'
      AND "revokedAt" IS NULL
    GROUP BY "patientId", "consentType", "consentVersion"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 4 follow-up conflict: multiple current consent grants exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "rehab_plan" AS plan
    INNER JOIN "patient_profile" AS patient
      ON patient."id" = plan."patientId"
    WHERE plan."doctorId" IS NOT NULL
      AND plan."doctorId" <> patient."responsibleDoctorId"
      AND (
        plan."isCurrent" = true
        OR plan."status" = 'pending_confirm'
      )
  ) THEN
    RAISE EXCEPTION 'Task 4 follow-up conflict: current or pending rehab plan owner differs from responsible doctor';
  END IF;
END $$;

CREATE UNIQUE INDEX "consent_record_one_current_grant_per_patient_type_version"
  ON "consent_record"("patientId", "consentType", "consentVersion")
  WHERE "status" = 'granted' AND "revokedAt" IS NULL;

COMMIT;
