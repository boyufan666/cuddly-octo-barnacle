CREATE TYPE "RegistrationReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "registration_request" (
    "id" TEXT NOT NULL,
    "requestedRole" "RoleCode" NOT NULL,
    "account" TEXT NOT NULL,
    "initialPasswordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mobilePhone" TEXT,
    "profileSnapshot" JSONB NOT NULL DEFAULT '{}',
    "reviewStatus" "RegistrationReviewStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdUserId" TEXT,
    "createdPatientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registration_request_reviewStatus_createdAt_idx" ON "registration_request"("reviewStatus", "createdAt");
CREATE INDEX "registration_request_account_reviewStatus_idx" ON "registration_request"("account", "reviewStatus");
CREATE INDEX "registration_request_mobilePhone_reviewStatus_idx" ON "registration_request"("mobilePhone", "reviewStatus");

ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
