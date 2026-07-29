import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaPath = resolve(repositoryRoot, 'packages/db/prisma/schema.prisma');
const migrationPath = resolve(
  repositoryRoot,
  'packages/db/prisma/migrations/20260713120000_task4_authorization_integrity/migration.sql',
);

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .trim();
}

test('Task 4 schema scopes idempotency keys to the patient', async () => {
  const schema = await readFile(schemaPath, 'utf8');
  const collectionBatch = schema.match(/model CollectionBatch \{[\s\S]*?\n\}/)?.[0] ?? '';
  const trainingSession = schema.match(/model TrainingSession \{[\s\S]*?\n\}/)?.[0] ?? '';

  assert.doesNotMatch(collectionBatch, /idempotencyKey\s+String\?\s+@unique/);
  assert.doesNotMatch(trainingSession, /idempotencyKey\s+String\?\s+@unique/);
  assert.match(collectionBatch, /@@unique\(\[patientId, idempotencyKey\]\)/);
  assert.match(trainingSession, /@@unique\(\[patientId, idempotencyKey\]\)/);
});

test('Task 4 migration hard-fails duplicates before partial unique indexes', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const indexName of [
    'risk_grade_record_one_current_per_patient',
    'rehab_plan_one_current_per_patient',
    'rehab_plan_one_pending_per_patient',
    'registration_request_one_pending_account',
    'registration_request_one_pending_mobile',
  ]) {
    assert.match(sql, new RegExp(`CREATE UNIQUE INDEX "${indexName}"`));
  }
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /GROUP BY "patientId"[\s\S]*HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /GROUP BY "account"[\s\S]*HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /DROP INDEX "collection_batch_idempotencyKey_key"/);
  assert.match(sql, /DROP INDEX "training_session_idempotencyKey_key"/);
  assert.match(sql, /collection_batch_patientId_idempotencyKey_key/);
  assert.match(sql, /training_session_patientId_idempotencyKey_key/);
});

test('Task 4 integrity migration owns one top-level transaction around every preflight and DDL statement', async () => {
  const sql = stripSqlComments(await readFile(migrationPath, 'utf8'));
  const beginStatements = sql.match(/^BEGIN\s*;/gm) ?? [];
  const commitStatements = sql.match(/^COMMIT\s*;/gm) ?? [];
  const lastPreflightPosition = sql.lastIndexOf('RAISE EXCEPTION');
  const firstDdlPosition = Math.min(
    ...['ALTER TABLE', 'CREATE UNIQUE INDEX', 'DROP INDEX']
      .map((statement) => sql.indexOf(statement))
      .filter((position) => position >= 0),
  );

  assert.equal(beginStatements.length, 1);
  assert.equal(commitStatements.length, 1);
  assert.match(sql, /^BEGIN\s*;/);
  assert.match(sql, /COMMIT\s*;$/);
  assert.ok(lastPreflightPosition >= 0, 'missing hard-fail preflight');
  assert.ok(
    firstDdlPosition > lastPreflightPosition,
    'all hard-fail preflights must run before the first DDL statement',
  );
});
