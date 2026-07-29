import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(prismaDirectory, "schema.prisma");
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260722120000_provider_operation_intent_guard/migration.sql",
);

async function readRequired(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    assert.fail(`${label} must exist: ${error.message}`);
  }
}

function modelBlock(schema, name) {
  const block = schema.match(
    new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
  )?.[0];
  assert.ok(block, `${name} Prisma model must exist`);
  return block;
}

test("provider operation schema persists a request-intent HMAC while preserving historical nulls", async () => {
  const schema = await readRequired(schemaPath, "Prisma schema");
  const operation = modelBlock(schema, "ProviderOperation");

  assert.match(operation, /^\s*requestIntentHmac\s+String\?\s*$/m);
  assert.doesNotMatch(operation, /^\s*intentHmac\s+/m);
});

test("provider operation intent migration preserves old nulls and only blocks duplicate active intents", async () => {
  const sql = await readRequired(
    migrationPath,
    "provider operation intent guard migration",
  );

  assert.ok(sql.startsWith("BEGIN;\n"));
  assert.ok(sql.trimEnd().endsWith("COMMIT;"));
  assert.equal(sql.match(/^BEGIN;$/gm)?.length, 1);
  assert.equal(sql.match(/^COMMIT;$/gm)?.length, 1);

  assert.match(sql, /ADD COLUMN "requestIntentHmac" TEXT;/);
  assert.match(
    sql,
    /CONSTRAINT "provider_operation_requestIntentHmac_format_check"[\s\S]*?CHECK \([\s\S]*?"requestIntentHmac" IS NULL[\s\S]*?OR "requestIntentHmac" ~ '\^\[a-f0-9\]\{64\}\$'[\s\S]*?\)/,
  );
  assert.doesNotMatch(sql, /"requestIntentHmac"\s+TEXT[^;\n]*DEFAULT/i);
  assert.doesNotMatch(sql, /ALTER COLUMN "requestIntentHmac" SET NOT NULL/);

  const preflightPosition = sql.indexOf("DO $$");
  const uniqueIndexPosition = sql.indexOf(
    'CREATE UNIQUE INDEX "provider_operation_one_active_per_intent_scope"',
  );
  assert.ok(preflightPosition >= 0, "active intent preflight must exist");
  assert.ok(
    uniqueIndexPosition > preflightPosition,
    "active intent index must follow its preflight",
  );
  assert.match(
    sql,
    /IF EXISTS \([\s\S]*?FROM "provider_operation"[\s\S]*?WHERE "status" IN \('accepted', 'reserved', 'dispatching', 'outcome_unknown'\)[\s\S]*?GROUP BY[\s\S]*?"organizationId",[\s\S]*?"patientId",[\s\S]*?"operation",[\s\S]*?"requestIntentHmac"[\s\S]*?HAVING COUNT\(\*\) > 1[\s\S]*?RAISE EXCEPTION 'Provider operation intent guard conflict: multiple active provider operations exist for one intent scope'/,
  );

  assert.match(
    sql,
    /CREATE UNIQUE INDEX "provider_operation_one_active_per_intent_scope"[\s\S]*?ON "provider_operation"\([\s\S]*?"organizationId",[\s\S]*?"patientId",[\s\S]*?"operation",[\s\S]*?"requestIntentHmac"[\s\S]*?\) NULLS NOT DISTINCT[\s\S]*?WHERE "status" IN \('accepted', 'reserved', 'dispatching', 'outcome_unknown'\);/,
  );
  const uniqueIndex = sql.slice(
    sql.indexOf(
      'CREATE UNIQUE INDEX "provider_operation_one_active_per_intent_scope"',
    ),
  );
  assert.doesNotMatch(uniqueIndex, /"actorUserId"/);
  assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/im);
  assert.doesNotMatch(sql, /\b(?:retry|fallback)\b/i);
});
