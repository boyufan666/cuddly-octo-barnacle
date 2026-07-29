-- Preserve all users and business records while making every pre-migration
-- credential unusable until an administrator performs a controlled reset.
ALTER TABLE "user"
  ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "authSessionVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "user"
SET
  "credentialVersion" = 0,
  "passwordResetRequired" = true,
  "passwordUpdatedAt" = NULL;

-- Pending applications created before this migration contain SHA-256 digests.
-- They must never be copied into a login credential as if they were Argon2id.
ALTER TABLE "registration_request"
  ALTER COLUMN "initialPasswordHash" DROP NOT NULL;

UPDATE "registration_request"
SET "initialPasswordHash" = NULL;
