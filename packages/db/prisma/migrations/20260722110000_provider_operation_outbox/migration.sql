BEGIN;

CREATE TABLE "provider_operation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "patientId" TEXT,
  "actorUserId" TEXT,
  "operation" TEXT NOT NULL,
  "clientIdempotencyKey" TEXT NOT NULL,
  "canonicalRequestHmac" TEXT NOT NULL,
  "requestCiphertext" JSONB NOT NULL,
  "expectedBusinessObjectType" TEXT,
  "expectedBusinessObjectId" TEXT,
  "expectedBusinessObjectVersion" TEXT,
  "provider" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "endpointHost" TEXT NOT NULL,
  "apiKeyRef" TEXT NOT NULL,
  "promptVersion" TEXT,
  "providerCallId" TEXT,
  "providerRequestId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "responseCiphertext" JSONB,
  "responseHmac" TEXT,
  "failureCategory" TEXT,
  "providerStartedAt" TIMESTAMP(3),
  "providerRespondedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_operation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "provider_operation"
  ADD CONSTRAINT "provider_operation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "provider_operation_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "provider_operation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "provider_operation_idempotency_scope_key"
  ON "provider_operation"(
    "organizationId",
    "operation",
    "patientId",
    "actorUserId",
    "clientIdempotencyKey"
  ) NULLS NOT DISTINCT;
CREATE INDEX "provider_operation_status_updatedAt_idx"
  ON "provider_operation"("status", "updatedAt");
CREATE INDEX "provider_operation_patientId_createdAt_idx"
  ON "provider_operation"("patientId", "createdAt");
CREATE INDEX "provider_operation_providerCallId_idx"
  ON "provider_operation"("providerCallId");
CREATE INDEX "provider_operation_providerRequestId_idx"
  ON "provider_operation"("providerRequestId");

CREATE TABLE "provider_operation_outbox" (
  "id" TEXT NOT NULL,
  "providerOperationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "failureCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_operation_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_operation_outbox_attemptCount_check"
    CHECK ("attemptCount" >= 0)
);

ALTER TABLE "provider_operation_outbox"
  ADD CONSTRAINT "provider_operation_outbox_providerOperationId_fkey"
  FOREIGN KEY ("providerOperationId") REFERENCES "provider_operation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "provider_operation_outbox_providerOperationId_eventType_key"
  ON "provider_operation_outbox"("providerOperationId", "eventType");
CREATE INDEX "provider_operation_outbox_status_availableAt_idx"
  ON "provider_operation_outbox"("status", "availableAt");

CREATE TABLE "provider_outcome_case" (
  "id" TEXT NOT NULL,
  "providerOperationId" TEXT NOT NULL,
  "caseType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "assignedToUserId" TEXT,
  "slaDueAt" TIMESTAMP(3),
  "evidenceReferences" JSONB NOT NULL DEFAULT '[]',
  "resolutionAction" TEXT,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_outcome_case_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "provider_outcome_case"
  ADD CONSTRAINT "provider_outcome_case_providerOperationId_fkey"
  FOREIGN KEY ("providerOperationId") REFERENCES "provider_operation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "provider_outcome_case_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "provider_outcome_case_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "provider_outcome_case_status_slaDueAt_idx"
  ON "provider_outcome_case"("status", "slaDueAt");
CREATE INDEX "provider_outcome_case_assignedToUserId_status_idx"
  ON "provider_outcome_case"("assignedToUserId", "status");

COMMIT;
