CREATE TABLE "care_circle_post" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "mood" TEXT,
  "visibilityScope" TEXT NOT NULL DEFAULT 'care_team',
  "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
  "moderationReason" TEXT,
  "moderatedByUserId" TEXT,
  "moderatedAt" TIMESTAMP(3),
  "privateMetadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "care_circle_post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_circle_comment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
  "privateMetadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "care_circle_comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_circle_reaction" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "reactionType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "care_circle_reaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_precaution" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "care_precaution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "care_circle_post_patientId_moderationStatus_createdAt_idx"
  ON "care_circle_post"("patientId", "moderationStatus", "createdAt");

CREATE INDEX "care_circle_post_authorUserId_createdAt_idx"
  ON "care_circle_post"("authorUserId", "createdAt");

CREATE INDEX "care_circle_comment_postId_moderationStatus_createdAt_idx"
  ON "care_circle_comment"("postId", "moderationStatus", "createdAt");

CREATE INDEX "care_circle_comment_authorUserId_createdAt_idx"
  ON "care_circle_comment"("authorUserId", "createdAt");

CREATE UNIQUE INDEX "care_circle_reaction_postId_authorUserId_reactionType_key"
  ON "care_circle_reaction"("postId", "authorUserId", "reactionType");

CREATE INDEX "care_circle_reaction_postId_reactionType_idx"
  ON "care_circle_reaction"("postId", "reactionType");

CREATE INDEX "care_precaution_patientId_status_priority_idx"
  ON "care_precaution"("patientId", "status", "priority");

CREATE INDEX "care_precaution_createdByUserId_createdAt_idx"
  ON "care_precaution"("createdByUserId", "createdAt");

ALTER TABLE "care_circle_post"
  ADD CONSTRAINT "care_circle_post_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_circle_post"
  ADD CONSTRAINT "care_circle_post_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_circle_post"
  ADD CONSTRAINT "care_circle_post_moderatedByUserId_fkey"
  FOREIGN KEY ("moderatedByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "care_circle_comment"
  ADD CONSTRAINT "care_circle_comment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "care_circle_post"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_circle_comment"
  ADD CONSTRAINT "care_circle_comment_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_circle_reaction"
  ADD CONSTRAINT "care_circle_reaction_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "care_circle_post"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_circle_reaction"
  ADD CONSTRAINT "care_circle_reaction_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_precaution"
  ADD CONSTRAINT "care_precaution_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_precaution"
  ADD CONSTRAINT "care_precaution_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
