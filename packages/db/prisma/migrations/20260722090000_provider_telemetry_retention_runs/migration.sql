BEGIN;

CREATE TABLE "provider_telemetry_retention_run" (
  "id" TEXT NOT NULL,
  "runDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "retentionDays" INTEGER NOT NULL,
  "cutoff" TIMESTAMP(3) NOT NULL,
  "deletedCount" INTEGER,
  "failureCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_telemetry_retention_run_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_telemetry_retention_run_runDate_key"
  ON "provider_telemetry_retention_run"("runDate");
CREATE INDEX "provider_telemetry_retention_run_status_createdAt_idx"
  ON "provider_telemetry_retention_run"("status", "createdAt");

COMMIT;
