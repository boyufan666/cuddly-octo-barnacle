-- DropIndex
DROP INDEX "game_content_buildStatus_runtimeType_idx";

-- DropIndex
DROP INDEX "motion_metric_gameRunId_metricType_idx";

-- DropIndex
DROP INDEX "training_result_gameRunId_idx";

-- AlterTable
ALTER TABLE "training_result" ALTER COLUMN "source" DROP DEFAULT,
ALTER COLUMN "gameRunId" DROP DEFAULT,
ALTER COLUMN "gameVersion" DROP DEFAULT,
ALTER COLUMN "bridgeProtocolVersion" DROP DEFAULT,
ALTER COLUMN "rawPayloadHash" DROP DEFAULT;
