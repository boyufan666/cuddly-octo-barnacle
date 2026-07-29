BEGIN;

ALTER TABLE "provider_operation"
  ADD COLUMN "requestIntentHmac" TEXT;

ALTER TABLE "provider_operation"
  ADD CONSTRAINT "provider_operation_requestIntentHmac_format_check"
    CHECK (
      "requestIntentHmac" IS NULL
      OR "requestIntentHmac" ~ '^[a-f0-9]{64}$'
    );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "provider_operation"
    WHERE "status" IN ('accepted', 'reserved', 'dispatching', 'outcome_unknown')
    GROUP BY
      "organizationId",
      "patientId",
      "operation",
      "requestIntentHmac"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Provider operation intent guard conflict: multiple active provider operations exist for one intent scope';
  END IF;
END $$;

CREATE UNIQUE INDEX "provider_operation_one_active_per_intent_scope"
  ON "provider_operation"(
    "organizationId",
    "patientId",
    "operation",
    "requestIntentHmac"
  ) NULLS NOT DISTINCT
  WHERE "status" IN ('accepted', 'reserved', 'dispatching', 'outcome_unknown');

COMMIT;
