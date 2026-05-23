ALTER TABLE "training_result"
ADD COLUMN "reviewStatus" TEXT,
ADD COLUMN "reviewConclusion" TEXT,
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "training_result"
ADD CONSTRAINT "training_result_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "training_result_reviewStatus_idx"
ON "training_result"("reviewStatus");
