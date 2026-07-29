BEGIN;

ALTER TABLE "user"
  ADD COLUMN "identityEnvelope" JSONB,
  ADD COLUMN "mobilePhoneLookup" TEXT;

ALTER TABLE "patient_profile"
  ADD COLUMN "identityEnvelope" JSONB,
  ADD COLUMN "contactEnvelope" JSONB,
  ADD COLUMN "careDetailsEnvelope" JSONB;

ALTER TABLE "registration_request"
  ADD COLUMN "identityEnvelope" JSONB,
  ADD COLUMN "reviewEnvelope" JSONB,
  ADD COLUMN "mobilePhoneLookup" TEXT;

ALTER TABLE "assessment_record"
  ADD COLUMN "resultEnvelope" JSONB;

ALTER TABLE "risk_grade_record"
  ADD COLUMN "reasonEnvelope" JSONB;

ALTER TABLE "ai_analysis_record"
  ADD COLUMN "inputEnvelope" JSONB,
  ADD COLUMN "outputEnvelope" JSONB;

ALTER TABLE "ai_conversation_session"
  ADD COLUMN "summaryEnvelope" JSONB,
  ADD COLUMN "reviewEnvelope" JSONB;

ALTER TABLE "ai_conversation_message"
  ADD COLUMN "contentEnvelope" JSONB;

ALTER TABLE "care_circle_post"
  ADD COLUMN "contentEnvelope" JSONB,
  ADD COLUMN "moderationEnvelope" JSONB;

ALTER TABLE "care_circle_comment"
  ADD COLUMN "contentEnvelope" JSONB;

ALTER TABLE "care_precaution"
  ADD COLUMN "contentEnvelope" JSONB;

ALTER TABLE "training_result"
  ADD COLUMN "reviewEnvelope" JSONB;

ALTER TABLE "user" ALTER COLUMN "displayName" DROP NOT NULL;

ALTER TABLE "patient_profile" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "patient_profile" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "patient_profile" ALTER COLUMN "age" DROP NOT NULL;
ALTER TABLE "patient_profile" ALTER COLUMN "healthMetrics" DROP NOT NULL;

ALTER TABLE "registration_request" ALTER COLUMN "displayName" DROP NOT NULL;
ALTER TABLE "registration_request" ALTER COLUMN "profileSnapshot" DROP NOT NULL;

ALTER TABLE "assessment_record" ALTER COLUMN "scoreSummary" DROP NOT NULL;
ALTER TABLE "assessment_record" ALTER COLUMN "rawInputSummary" DROP NOT NULL;

ALTER TABLE "risk_grade_record" ALTER COLUMN "reasonSummary" DROP NOT NULL;

ALTER TABLE "ai_analysis_record" ALTER COLUMN "inputSummary" DROP NOT NULL;
ALTER TABLE "ai_analysis_record" ALTER COLUMN "outputSummary" DROP NOT NULL;

ALTER TABLE "ai_conversation_message" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "ai_conversation_message" ALTER COLUMN "contentSnapshot" DROP NOT NULL;
ALTER TABLE "ai_conversation_message" ALTER COLUMN "evidenceMetadata" DROP NOT NULL;

ALTER TABLE "care_circle_post" ALTER COLUMN "body" DROP NOT NULL;
ALTER TABLE "care_circle_post" ALTER COLUMN "privateMetadata" DROP NOT NULL;

ALTER TABLE "care_circle_comment" ALTER COLUMN "body" DROP NOT NULL;
ALTER TABLE "care_circle_comment" ALTER COLUMN "privateMetadata" DROP NOT NULL;

ALTER TABLE "care_precaution" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "care_precaution" ALTER COLUMN "content" DROP NOT NULL;

ALTER TABLE "patient_profile" ALTER COLUMN "healthMetrics" DROP DEFAULT;
ALTER TABLE "registration_request" ALTER COLUMN "profileSnapshot" DROP DEFAULT;
ALTER TABLE "assessment_record" ALTER COLUMN "scoreSummary" DROP DEFAULT;
ALTER TABLE "assessment_record" ALTER COLUMN "rawInputSummary" DROP DEFAULT;
ALTER TABLE "ai_analysis_record" ALTER COLUMN "inputSummary" DROP DEFAULT;
ALTER TABLE "ai_analysis_record" ALTER COLUMN "outputSummary" DROP DEFAULT;
ALTER TABLE "ai_conversation_message" ALTER COLUMN "contentSnapshot" DROP DEFAULT;
ALTER TABLE "ai_conversation_message" ALTER COLUMN "evidenceMetadata" DROP DEFAULT;
ALTER TABLE "care_circle_post" ALTER COLUMN "privateMetadata" DROP DEFAULT;
ALTER TABLE "care_circle_comment" ALTER COLUMN "privateMetadata" DROP DEFAULT;

CREATE UNIQUE INDEX "user_mobilePhoneLookup_key" ON "user"("mobilePhoneLookup");
CREATE INDEX "registration_request_mobilePhoneLookup_idx" ON "registration_request"("mobilePhoneLookup");

COMMIT;
