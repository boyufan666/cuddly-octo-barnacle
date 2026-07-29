BEGIN;

ALTER TABLE "provider_telemetry_retention_run"
  ADD COLUMN "executionDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "provider_telemetry_retention_run_attemptCount_check"
    CHECK ("attemptCount" >= 1);

COMMIT;
