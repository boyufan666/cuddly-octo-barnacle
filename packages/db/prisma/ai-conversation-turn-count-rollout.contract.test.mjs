import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260714100000_ai_conversation_turn_count_rollout/migration.sql",
);

async function readRequired(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    assert.fail(`${label} must exist: ${error.message}`);
  }
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

test("conversation turn-count rollout has an exact transactional allowlist", async () => {
  const sql = await readRequired(
    migrationPath,
    "AI conversation turn-count rollout migration",
  );
  const statements = sql.split(";").map(normalizeSql).filter(Boolean);

  assert.deepEqual(statements, [
    "BEGIN",
    normalizeSql(`
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
      WHERE session."id" = message_turn_counts."sessionId"
    `),
    "COMMIT",
  ]);
});

test("conversation turn-count rollout only derives metadata from message facts", async () => {
  const sql = await readRequired(
    migrationPath,
    "AI conversation turn-count rollout migration",
  );

  assert.match(sql, /COALESCE\(MAX\(message\."turnIndex"\), 0\)/);
  assert.match(sql, /jsonb_set\([\s\S]*?'\{turnCount\}'[\s\S]*?true/);
  assert.doesNotMatch(sql, /session\."status"/);
  assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DELETE|INSERT|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\b(?:seed|constraint)\b/i);
});
