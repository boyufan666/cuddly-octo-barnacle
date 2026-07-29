BEGIN;

CREATE TABLE "provider_call_telemetry" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "patientId" TEXT,
  "operation" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "endpointHost" TEXT NOT NULL,
  "apiKeyRef" TEXT NOT NULL,
  "promptVersion" TEXT,
  "callId" TEXT,
  "requestId" TEXT,
  "statusCategory" TEXT NOT NULL,
  "durationMs" INTEGER,
  "requestContentHash" TEXT,
  "responseContentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_call_telemetry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "provider_call_telemetry"
  ADD CONSTRAINT "provider_call_telemetry_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "provider_call_telemetry_createdAt_idx"
  ON "provider_call_telemetry"("createdAt");
CREATE INDEX "provider_call_telemetry_operation_provider_createdAt_idx"
  ON "provider_call_telemetry"("operation", "provider", "createdAt");
CREATE INDEX "provider_call_telemetry_patientId_createdAt_idx"
  ON "provider_call_telemetry"("patientId", "createdAt");
CREATE INDEX "provider_call_telemetry_requestId_operation_idx"
  ON "provider_call_telemetry"("requestId", "operation");

COMMIT;
