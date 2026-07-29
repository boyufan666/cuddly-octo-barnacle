import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(prismaDirectory, "../../..");
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260714100000_ai_conversation_turn_count_rollout/migration.sql",
);
const databaseUrl = process.env.AI_CONVERSATION_TURN_COUNT_ROLLOUT_DATABASE_URL;

function requirePostgresUrl(value) {
  assert.match(
    value ?? "",
    /\S/,
    "AI_CONVERSATION_TURN_COUNT_ROLLOUT_DATABASE_URL is required",
  );
  const parsed = new URL(value);
  assert.ok(
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:",
    "AI_CONVERSATION_TURN_COUNT_ROLLOUT_DATABASE_URL must be a PostgreSQL URL",
  );
  return parsed;
}

function withSchema(url, schemaName) {
  const parsed = requirePostgresUrl(url);
  parsed.searchParams.set("schema", schemaName);
  return parsed.toString();
}

function runMigration(url) {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@rehab-platform/db",
      "exec",
      "prisma",
      "db",
      "execute",
      "--file",
      migrationPath,
      "--schema",
      resolve(prismaDirectory, "schema.prisma"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url },
    },
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `migration execution failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

test("rollout backfills every session from the maximum persisted message turn", async () => {
  const baseUrl = requirePostgresUrl(databaseUrl).toString();
  const schemaName = `conversation_turn_count_${process.pid}_${randomBytes(6).toString("hex")}`;
  assert.match(schemaName, /^[a-z0-9_]+$/);

  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  const client = new PrismaClient({
    datasources: { db: { url: withSchema(baseUrl, schemaName) } },
  });

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    await client.$executeRawUnsafe(`
      CREATE TABLE "ai_conversation_session" (
        "id" TEXT PRIMARY KEY,
        "status" TEXT NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}'
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE TABLE "ai_conversation_message" (
        "id" TEXT PRIMARY KEY,
        "sessionId" TEXT NOT NULL REFERENCES "ai_conversation_session"("id"),
        "turnIndex" INTEGER NOT NULL,
        UNIQUE ("sessionId", "turnIndex")
      )
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "ai_conversation_session" ("id", "status", "metadata")
      VALUES
        ('no-messages', 'active', '{"turnCount": 91, "keep": "zero"}'),
        ('max-turn', 'completed', '{"turnCount": 1, "keep": "max", "nested": {"ok": true}}'),
        ('already-consistent', 'review_required', '{"turnCount": 2, "keep": "same"}'),
        ('wrong-count', 'archived', '{"turnCount": 77, "keep": "corrected"}'),
        ('missing-count', 'active', '{"keep": "added"}')
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "ai_conversation_message" ("id", "sessionId", "turnIndex")
      VALUES
        ('max-turn-1', 'max-turn', 1),
        ('max-turn-4', 'max-turn', 4),
        ('consistent-1', 'already-consistent', 1),
        ('consistent-2', 'already-consistent', 2),
        ('wrong-3', 'wrong-count', 3),
        ('missing-2', 'missing-count', 2),
        ('missing-6', 'missing-count', 6)
    `);

    const schemaUrl = withSchema(baseUrl, schemaName);
    runMigration(schemaUrl);

    const firstRun = await client.$queryRawUnsafe(`
      SELECT "id", "status", "metadata"
      FROM "ai_conversation_session"
      ORDER BY "id"
    `);
    assert.deepEqual(firstRun, [
      {
        id: "already-consistent",
        status: "review_required",
        metadata: { keep: "same", turnCount: 2 },
      },
      {
        id: "max-turn",
        status: "completed",
        metadata: {
          keep: "max",
          nested: { ok: true },
          turnCount: 4,
        },
      },
      {
        id: "missing-count",
        status: "active",
        metadata: { keep: "added", turnCount: 6 },
      },
      {
        id: "no-messages",
        status: "active",
        metadata: { keep: "zero", turnCount: 0 },
      },
      {
        id: "wrong-count",
        status: "archived",
        metadata: { keep: "corrected", turnCount: 3 },
      },
    ]);

    runMigration(schemaUrl);
    const secondRun = await client.$queryRawUnsafe(`
      SELECT "id", "status", "metadata"
      FROM "ai_conversation_session"
      ORDER BY "id"
    `);
    assert.deepEqual(secondRun, firstRun);
  } finally {
    await client.$disconnect();
    await admin.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
    );
    await admin.$disconnect();
  }
});
