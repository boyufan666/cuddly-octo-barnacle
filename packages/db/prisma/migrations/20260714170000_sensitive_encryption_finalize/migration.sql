BEGIN;

ALTER TABLE "user"
  ALTER COLUMN "identityEnvelope" SET NOT NULL,
  ADD CONSTRAINT "user_sensitive_legacy_null" CHECK (
    "displayName" IS NULL AND "mobilePhone" IS NULL
  );

ALTER TABLE "patient_profile"
  ALTER COLUMN "identityEnvelope" SET NOT NULL,
  ALTER COLUMN "careDetailsEnvelope" SET NOT NULL,
  ADD CONSTRAINT "patient_profile_sensitive_legacy_null" CHECK (
    "name" IS NULL
    AND "gender" IS NULL
    AND "age" IS NULL
    AND "mobilePhone" IS NULL
    AND "caregiverName" IS NULL
    AND "caregiverPhone" IS NULL
    AND "healthMetrics" IS NULL
  );

ALTER TABLE "registration_request"
  ALTER COLUMN "identityEnvelope" SET NOT NULL,
  ADD CONSTRAINT "registration_request_sensitive_legacy_null" CHECK (
    "displayName" IS NULL
    AND "mobilePhone" IS NULL
    AND "profileSnapshot" IS NULL
    AND "reviewNote" IS NULL
  );

ALTER TABLE "care_circle_post"
  ALTER COLUMN "contentEnvelope" SET NOT NULL,
  ADD CONSTRAINT "care_circle_post_sensitive_legacy_null" CHECK (
    "body" IS NULL
    AND "mood" IS NULL
    AND "privateMetadata" IS NULL
    AND "moderationReason" IS NULL
  );

ALTER TABLE "care_circle_comment"
  ALTER COLUMN "contentEnvelope" SET NOT NULL,
  ADD CONSTRAINT "care_circle_comment_sensitive_legacy_null" CHECK (
    "body" IS NULL AND "privateMetadata" IS NULL
  );

ALTER TABLE "care_precaution"
  ALTER COLUMN "contentEnvelope" SET NOT NULL,
  ADD CONSTRAINT "care_precaution_sensitive_legacy_null" CHECK (
    "title" IS NULL AND "content" IS NULL
  );

ALTER TABLE "assessment_record"
  ALTER COLUMN "resultEnvelope" SET NOT NULL,
  ADD CONSTRAINT "assessment_record_sensitive_legacy_null" CHECK (
    "scoreSummary" IS NULL AND "rawInputSummary" IS NULL
  );

ALTER TABLE "risk_grade_record"
  ALTER COLUMN "reasonEnvelope" SET NOT NULL,
  ADD CONSTRAINT "risk_grade_record_sensitive_legacy_null" CHECK (
    "reasonSummary" IS NULL
  );

ALTER TABLE "ai_analysis_record"
  ALTER COLUMN "inputEnvelope" SET NOT NULL,
  ALTER COLUMN "outputEnvelope" SET NOT NULL,
  ADD CONSTRAINT "ai_analysis_record_sensitive_legacy_null" CHECK (
    "inputSummary" IS NULL AND "outputSummary" IS NULL
  );

ALTER TABLE "ai_conversation_session"
  ADD CONSTRAINT "ai_conversation_session_sensitive_legacy_null" CHECK (
    "summary" IS NULL AND "reviewNote" IS NULL
  );

ALTER TABLE "ai_conversation_message"
  ALTER COLUMN "contentEnvelope" SET NOT NULL,
  ADD CONSTRAINT "ai_conversation_message_sensitive_legacy_null" CHECK (
    "content" IS NULL
    AND "contentSnapshot" IS NULL
    AND "evidenceMetadata" IS NULL
  );

ALTER TABLE "training_result"
  ADD CONSTRAINT "training_result_sensitive_legacy_null" CHECK (
    "reviewNote" IS NULL
  );

DROP INDEX "user_mobilePhone_key";
DROP INDEX "registration_request_mobilePhone_reviewStatus_idx";
DROP INDEX "registration_request_one_pending_mobile";

CREATE UNIQUE INDEX "registration_request_one_pending_mobile_lookup"
  ON "registration_request"("mobilePhoneLookup")
  WHERE "reviewStatus" = 'pending' AND "mobilePhoneLookup" IS NOT NULL;

COMMIT;
