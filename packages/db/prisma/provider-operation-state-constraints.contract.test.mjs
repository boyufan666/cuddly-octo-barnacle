import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260723100000_provider_operation_state_constraints/migration.sql",
);

async function readRequired(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    assert.fail(`${label} must exist: ${error.message}`);
  }
}

test("provider operation lifecycle constraints reject invalid direct writes before they reach an application service", async () => {
  const sql = await readRequired(
    migrationPath,
    "provider operation state constraints migration",
  );

  assert.ok(sql.startsWith("BEGIN;\n"));
  assert.ok(sql.trimEnd().endsWith("COMMIT;"));
  assert.equal(sql.match(/^BEGIN;$/gm)?.length, 1);
  assert.equal(sql.match(/^COMMIT;$/gm)?.length, 1);
  assert.match(
    sql,
    /RAISE EXCEPTION 'Provider operation state constraint preflight failed: legacy rows violate the persisted lifecycle contract'/,
  );

  for (const constraint of [
    "provider_operation_kind_check",
    "provider_operation_status_check",
    "provider_operation_request_hmac_format_check",
    "provider_operation_response_hmac_format_check",
    "provider_operation_lifecycle_timestamp_check",
    "provider_operation_completion_evidence_check",
    "provider_operation_failure_category_check",
  ]) {
    assert.match(sql, new RegExp(`CONSTRAINT "${constraint}"`));
  }

  assert.match(
    sql,
    /"operation" IN \([\s\S]*?'assessment_draft',[\s\S]*?'conversation_turn',[\s\S]*?'speech_transcript',[\s\S]*?'tts_output'/,
  );
  assert.match(
    sql,
    /"status" IN \([\s\S]*?'accepted',[\s\S]*?'reserved',[\s\S]*?'dispatching',[\s\S]*?'completed',[\s\S]*?'provider_failed',[\s\S]*?'response_rejected',[\s\S]*?'outcome_unknown',[\s\S]*?'completed_confirmed',[\s\S]*?'closed_unconfirmed'/,
  );
  assert.match(sql, /"canonicalRequestHmac" ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql, /"responseHmac" IS NULL[\s\S]*?OR "responseHmac" ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(
    sql,
    /"status" <> 'completed'[\s\S]*?"responseCiphertext" IS NOT NULL[\s\S]*?"responseHmac" IS NOT NULL[\s\S]*?"failureCategory" IS NULL/,
  );
  assert.match(
    sql,
    /"status" IN \('provider_failed', 'response_rejected', 'outcome_unknown'\)[\s\S]*?"failureCategory" IS NOT NULL/,
  );

  assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/im);
  assert.doesNotMatch(sql, /\b(?:retry|fallback|fetch|http)\b/i);
});
