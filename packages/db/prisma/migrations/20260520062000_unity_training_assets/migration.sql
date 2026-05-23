-- Add formal Unity/WebGL delivery metadata to game content.
ALTER TABLE "game_content"
ADD COLUMN "runtimeType" TEXT NOT NULL DEFAULT 'unity_webgl',
ADD COLUMN "manifestUrl" TEXT,
ADD COLUMN "buildBaseUrl" TEXT,
ADD COLUMN "gameVersion" TEXT,
ADD COLUMN "bridgeProtocolVersion" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN "buildStatus" TEXT NOT NULL DEFAULT 'pending_assets',
ADD COLUMN "releaseChannel" TEXT NOT NULL DEFAULT 'development',
ADD COLUMN "supportsCamera" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "supportsMicrophone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "supportedInputModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "requiredMetrics" JSONB NOT NULL DEFAULT '[]';

-- Capture the exact runtime context used by a training session.
ALTER TABLE "training_session"
ADD COLUMN "gameRunId" TEXT,
ADD COLUMN "clientStartedAt" TIMESTAMP(3),
ADD COLUMN "clientEndedAt" TIMESTAMP(3),
ADD COLUMN "deviceCode" TEXT,
ADD COLUMN "calibrationStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "runtimeConfigSnapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "unityBuildVersion" TEXT,
ADD COLUMN "bridgeProtocolVersion" TEXT,
ADD COLUMN "uploadAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastUploadError" TEXT;

-- Promote key provenance fields out of metricsSummary for audit and query.
ALTER TABLE "training_result"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy_import',
ADD COLUMN "gameRunId" TEXT NOT NULL DEFAULT 'legacy_import',
ADD COLUMN "gameVersion" TEXT NOT NULL DEFAULT 'legacy_import',
ADD COLUMN "bridgeProtocolVersion" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN "submittedByUserId" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "clientGeneratedAt" TIMESTAMP(3),
ADD COLUMN "rawPayloadHash" TEXT NOT NULL DEFAULT 'legacy_import',
ADD COLUMN "qualityReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Preserve sampling and body-part details for future motion analytics.
ALTER TABLE "motion_metric"
ADD COLUMN "gameRunId" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "unit" TEXT,
ADD COLUMN "sampleCount" INTEGER,
ADD COLUMN "windowStartedAt" TIMESTAMP(3),
ADD COLUMN "windowEndedAt" TIMESTAMP(3),
ADD COLUMN "qualityFlag" TEXT NOT NULL DEFAULT 'valid',
ADD COLUMN "bodyPart" TEXT,
ADD COLUMN "jointName" TEXT;

CREATE INDEX "game_content_buildStatus_runtimeType_idx" ON "game_content"("buildStatus", "runtimeType");
CREATE INDEX "training_result_gameRunId_idx" ON "training_result"("gameRunId");
CREATE INDEX "motion_metric_gameRunId_metricType_idx" ON "motion_metric"("gameRunId", "metricType");
