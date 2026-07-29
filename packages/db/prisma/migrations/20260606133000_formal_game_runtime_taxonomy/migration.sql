ALTER TABLE "game_content"
ADD COLUMN "difficultyPolicy" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "dynamicDifficultyTriggers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "requiredPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "resultSchema" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "publishedStatus" TEXT NOT NULL DEFAULT 'draft';
