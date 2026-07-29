ALTER TABLE "ai_conversation_session"
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "ai_conversation_message"
ADD COLUMN "turnIndex" INTEGER;

WITH ordered_messages AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "sessionId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "nextTurnIndex"
    FROM "ai_conversation_message"
)
UPDATE "ai_conversation_message" AS message
SET "turnIndex" = ordered_messages."nextTurnIndex"
FROM ordered_messages
WHERE message."id" = ordered_messages."id";

ALTER TABLE "ai_conversation_message"
ALTER COLUMN "turnIndex" SET NOT NULL;

CREATE INDEX "ai_conversation_session_reviewedByUserId_reviewedAt_idx"
ON "ai_conversation_session"("reviewedByUserId", "reviewedAt");

CREATE UNIQUE INDEX "ai_conversation_message_sessionId_turnIndex_key"
ON "ai_conversation_message"("sessionId", "turnIndex");

CREATE INDEX "ai_conversation_message_sessionId_turnIndex_idx"
ON "ai_conversation_message"("sessionId", "turnIndex");

ALTER TABLE "ai_conversation_session"
ADD CONSTRAINT "ai_conversation_session_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
