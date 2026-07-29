ALTER TABLE "registration_request"
  ADD COLUMN "credentialExpiresAt" TIMESTAMP(3);

UPDATE "registration_request"
SET "credentialExpiresAt" = "createdAt" + INTERVAL '24 hours';

ALTER TABLE "registration_request"
  ALTER COLUMN "credentialExpiresAt" SET NOT NULL;
