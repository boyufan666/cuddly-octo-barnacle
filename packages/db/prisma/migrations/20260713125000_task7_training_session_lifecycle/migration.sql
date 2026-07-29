BEGIN;

-- Refuse ambiguous historical state before making any schema change. This
-- migration never chooses a winner or changes an existing session lifecycle.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "training_session"
    WHERE "sessionStatus" IN ('started', 'in_progress')
    GROUP BY "planItemId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Task 7 lifecycle conflict: multiple active training sessions exist for one plan item';
  END IF;
END $$;

ALTER TYPE "TrainingSessionStatus" ADD VALUE 'aborted';

ALTER TABLE "training_session"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "abortedAt" TIMESTAMP(3),
  ADD COLUMN "abortedByUserId" TEXT,
  ADD COLUMN "abortReason" TEXT;

ALTER TABLE "training_session"
  ADD CONSTRAINT "training_session_aborted_fields_consistent" CHECK (
    (
      "sessionStatus"::text = 'aborted'
      AND "abortedAt" IS NOT NULL
      AND "abortedByUserId" IS NOT NULL
      AND "abortReason" IS NOT NULL
      AND "abortReason" ~ '[^[:space:]]'
    )
    OR
    (
      "sessionStatus"::text <> 'aborted'
      AND "abortedAt" IS NULL
      AND "abortedByUserId" IS NULL
      AND "abortReason" IS NULL
    )
  );

ALTER TABLE "training_session"
  ADD CONSTRAINT "training_session_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "training_session"
  ADD CONSTRAINT "training_session_abortedByUserId_fkey"
  FOREIGN KEY ("abortedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "training_session_createdByUserId_idx"
  ON "training_session"("createdByUserId");

CREATE INDEX "training_session_abortedByUserId_idx"
  ON "training_session"("abortedByUserId");

CREATE UNIQUE INDEX "training_session_one_active_per_plan_item"
  ON "training_session"("planItemId")
  WHERE "sessionStatus" IN ('started', 'in_progress');

COMMIT;
