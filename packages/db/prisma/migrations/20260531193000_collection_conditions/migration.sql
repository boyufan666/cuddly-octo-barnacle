CREATE TABLE "collection_condition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" JSONB NOT NULL DEFAULT '{}',
    "deviceRequirements" JSONB NOT NULL DEFAULT '{}',
    "taskParameters" JSONB NOT NULL DEFAULT '{}',
    "qualityRules" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_condition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_protocol" (
    "id" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "gameContentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "runtimeType" TEXT NOT NULL,
    "requiredConsentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredInputModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredMetrics" JSONB NOT NULL DEFAULT '[]',
    "conditionRules" JSONB NOT NULL DEFAULT '{}',
    "samplingConfig" JSONB NOT NULL DEFAULT '{}',
    "qualityGate" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_protocol_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_batch" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "rehabPlanId" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "gameContentId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "idempotencyKey" TEXT,
    "conditionSnapshot" JSONB NOT NULL DEFAULT '{}',
    "protocolSnapshot" JSONB NOT NULL DEFAULT '{}',
    "consentSnapshot" JSONB NOT NULL DEFAULT '{}',
    "operatorNotes" TEXT,
    "createdByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_batch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "training_session"
ADD COLUMN "collectionBatchId" TEXT;

ALTER TABLE "training_result"
ADD COLUMN "collectionBatchId" TEXT;

ALTER TABLE "motion_metric"
ADD COLUMN "collectionBatchId" TEXT;

CREATE UNIQUE INDEX "collection_condition_code_key" ON "collection_condition"("code");
CREATE UNIQUE INDEX "collection_protocol_code_version_key" ON "collection_protocol"("code", "version");
CREATE UNIQUE INDEX "collection_batch_idempotencyKey_key" ON "collection_batch"("idempotencyKey");

CREATE INDEX "collection_condition_status_idx" ON "collection_condition"("status");
CREATE INDEX "collection_protocol_conditionId_status_idx" ON "collection_protocol"("conditionId", "status");
CREATE INDEX "collection_protocol_runtimeType_status_idx" ON "collection_protocol"("runtimeType", "status");
CREATE INDEX "collection_batch_patientId_status_idx" ON "collection_batch"("patientId", "status");
CREATE INDEX "collection_batch_protocolId_status_idx" ON "collection_batch"("protocolId", "status");
CREATE INDEX "collection_batch_rehabPlanId_planItemId_gameContentId_idx" ON "collection_batch"("rehabPlanId", "planItemId", "gameContentId");
CREATE INDEX "training_session_collectionBatchId_idx" ON "training_session"("collectionBatchId");
CREATE INDEX "motion_metric_collectionBatchId_metricType_idx" ON "motion_metric"("collectionBatchId", "metricType");

ALTER TABLE "collection_condition"
ADD CONSTRAINT "collection_condition_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collection_protocol"
ADD CONSTRAINT "collection_protocol_conditionId_fkey"
FOREIGN KEY ("conditionId") REFERENCES "collection_condition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_protocol"
ADD CONSTRAINT "collection_protocol_gameContentId_fkey"
FOREIGN KEY ("gameContentId") REFERENCES "game_content"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collection_protocol"
ADD CONSTRAINT "collection_protocol_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_rehabPlanId_fkey"
FOREIGN KEY ("rehabPlanId") REFERENCES "rehab_plan"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_planItemId_fkey"
FOREIGN KEY ("planItemId") REFERENCES "rehab_plan_item"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_gameContentId_fkey"
FOREIGN KEY ("gameContentId") REFERENCES "game_content"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_protocolId_fkey"
FOREIGN KEY ("protocolId") REFERENCES "collection_protocol"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_conditionId_fkey"
FOREIGN KEY ("conditionId") REFERENCES "collection_condition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_batch"
ADD CONSTRAINT "collection_batch_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_session"
ADD CONSTRAINT "training_session_collectionBatchId_fkey"
FOREIGN KEY ("collectionBatchId") REFERENCES "collection_batch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_result"
ADD CONSTRAINT "training_result_collectionBatchId_fkey"
FOREIGN KEY ("collectionBatchId") REFERENCES "collection_batch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "motion_metric"
ADD CONSTRAINT "motion_metric_collectionBatchId_fkey"
FOREIGN KEY ("collectionBatchId") REFERENCES "collection_batch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
