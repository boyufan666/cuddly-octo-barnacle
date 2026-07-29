BEGIN;

WITH "message_turn_counts" AS (
  SELECT
    session."id" AS "sessionId",
    COALESCE(MAX(message."turnIndex"), 0) AS "turnCount"
  FROM "ai_conversation_session" AS session
  LEFT JOIN "ai_conversation_message" AS message
    ON message."sessionId" = session."id"
  GROUP BY session."id"
)
UPDATE "ai_conversation_session" AS session
SET "metadata" = jsonb_set(
  COALESCE(session."metadata", '{}'::jsonb),
  '{turnCount}',
  to_jsonb(message_turn_counts."turnCount"),
  true
)
FROM "message_turn_counts" AS message_turn_counts
WHERE session."id" = message_turn_counts."sessionId";

COMMIT;
