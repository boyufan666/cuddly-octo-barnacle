import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(prismaDirectory, 'schema.prisma');
const migrationPath = resolve(
  prismaDirectory,
  'migrations/20260713125000_task7_training_session_lifecycle/migration.sql',
);
const postgresTestPath = resolve(
  prismaDirectory,
  'task7-training-session-lifecycle.postgres.test.mjs',
);

async function readRequired(path, label) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    assert.fail(`${label} must exist: ${error.message}`);
  }
}

test('Task 7 schema models explicit ownership and aborted lifecycle fields', async () => {
  const schema = await readRequired(schemaPath, 'Prisma schema');
  const statusEnum =
    schema.match(/enum TrainingSessionStatus \{[\s\S]*?\n\}/)?.[0] ?? '';
  const userModel = schema.match(/model User \{[\s\S]*?\n\}/)?.[0] ?? '';
  const trainingSession =
    schema.match(/model TrainingSession \{[\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(statusEnum, /^\s*aborted\s*$/m);
  assert.match(trainingSession, /^\s*createdByUserId\s+String\?\s*$/m);
  assert.doesNotMatch(trainingSession, /createdByUserId\s+String\?[^\n]*@default/);
  assert.match(trainingSession, /^\s*abortedAt\s+DateTime\?\s*$/m);
  assert.match(trainingSession, /^\s*abortedByUserId\s+String\?\s*$/m);
  assert.match(trainingSession, /^\s*abortReason\s+String\?\s*$/m);
  assert.match(
    trainingSession,
    /createdBy\s+User\?\s+@relation\("TrainingSessionCreatedBy", fields: \[createdByUserId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.match(
    trainingSession,
    /abortedBy\s+User\?\s+@relation\("TrainingSessionAbortedBy", fields: \[abortedByUserId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.match(trainingSession, /@@index\(\[createdByUserId\]\)/);
  assert.match(trainingSession, /@@index\(\[abortedByUserId\]\)/);
  assert.match(
    userModel,
    /createdTrainingSessions\s+TrainingSession\[\]\s+@relation\("TrainingSessionCreatedBy"\)/,
  );
  assert.match(
    userModel,
    /abortedTrainingSessions\s+TrainingSession\[\]\s+@relation\("TrainingSessionAbortedBy"\)/,
  );
});

test('Task 7 migration hard-fails historical active duplicates before any DDL', async () => {
  const sql = await readRequired(migrationPath, 'Task 7 migration');
  const gatePosition = sql.indexOf('DO $$');
  const enumPosition = sql.indexOf('ALTER TYPE "TrainingSessionStatus"');
  const tablePosition = sql.indexOf('ALTER TABLE "training_session"');

  assert.ok(gatePosition >= 0, 'migration must contain a preflight DO block');
  assert.ok(sql.startsWith('BEGIN;\n'), 'migration must begin its own transaction');
  assert.ok(
    sql.trimEnd().endsWith('COMMIT;'),
    'migration must commit its own transaction',
  );
  assert.equal(sql.match(/^BEGIN;$/gm)?.length, 1);
  assert.equal(sql.match(/^COMMIT;$/gm)?.length, 1);
  assert.ok(enumPosition > gatePosition, 'enum DDL must follow the preflight gate');
  assert.ok(tablePosition > gatePosition, 'table DDL must follow the preflight gate');
  assert.match(
    sql,
    /WHERE "sessionStatus" IN \('started', 'in_progress'\)[\s\S]*?GROUP BY "planItemId"[\s\S]*?HAVING COUNT\(\*\) > 1/,
  );
  assert.match(
    sql,
    /RAISE EXCEPTION 'Task 7 lifecycle conflict: multiple active training sessions exist for one plan item'/,
  );
  assert.doesNotMatch(sql, /^\s*(?:DELETE|UPDATE)\s/m);
  assert.doesNotMatch(sql, /\bCOALESCE\b|\bROW_NUMBER\b/i);
});

test('Task 7 migration enforces aborted consistency and active-session uniqueness', async () => {
  const sql = await readRequired(migrationPath, 'Task 7 migration');
  const postgresTest = await readRequired(postgresTestPath, 'Task 7 PostgreSQL test');

  assert.match(sql, /ALTER TYPE "TrainingSessionStatus" ADD VALUE 'aborted'/);
  assert.match(sql, /ADD COLUMN\s+"createdByUserId" TEXT/);
  assert.doesNotMatch(sql, /"createdByUserId" TEXT[^,;\n]*DEFAULT/i);
  assert.match(sql, /ADD COLUMN\s+"abortedAt" TIMESTAMP\(3\)/);
  assert.match(sql, /ADD COLUMN\s+"abortedByUserId" TEXT/);
  assert.match(sql, /ADD COLUMN\s+"abortReason" TEXT/);
  assert.match(
    sql,
    /CONSTRAINT "training_session_aborted_fields_consistent" CHECK[\s\S]*?"sessionStatus"::text = 'aborted'[\s\S]*?"abortedAt" IS NOT NULL[\s\S]*?"abortedByUserId" IS NOT NULL[\s\S]*?"abortReason" IS NOT NULL[\s\S]*?"sessionStatus"::text <> 'aborted'[\s\S]*?"abortedAt" IS NULL[\s\S]*?"abortedByUserId" IS NULL[\s\S]*?"abortReason" IS NULL/,
  );
  assert.ok(
    sql.includes(`"abortReason" ~ '[^[:space:]]'`),
    'abort reason must contain at least one non-whitespace character',
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "training_session_one_active_per_plan_item"[\s\S]*?ON "training_session"\("planItemId"\)[\s\S]*?WHERE "sessionStatus" IN \('started', 'in_progress'\)/,
  );
  assert.match(sql, /CREATE INDEX "training_session_createdByUserId_idx"/);
  assert.match(sql, /CREATE INDEX "training_session_abortedByUserId_idx"/);
  assert.match(
    sql,
    /training_session_createdByUserId_fkey[\s\S]*?FOREIGN KEY \("createdByUserId"\) REFERENCES "user"\("id"\) ON DELETE RESTRICT/,
  );
  assert.match(
    sql,
    /training_session_abortedByUserId_fkey[\s\S]*?FOREIGN KEY \("abortedByUserId"\) REFERENCES "user"\("id"\) ON DELETE RESTRICT/,
  );
  assert.doesNotMatch(
    postgresTest,
    /\$\{migrationSql\}/,
    'PostgreSQL tests must execute the complete migration without wrapping it',
  );
  assert.doesNotMatch(postgresTest, /pg_sleep\s*\(/);
  assert.match(postgresTest, /TASK7_FIRST_INSERTED/);
  assert.match(postgresTest, /TASK7_SECOND_PID=/);
  assert.match(postgresTest, /wait_event_type\s*=\s*'Lock'/);
  assert.match(postgresTest, /pg_terminate_backend\(pid, 5000\)/);
  assert.match(
    postgresTest,
    /COALESCE\(bool_and\(pg_terminate_backend\(pid, 5000\)\), true\)/,
  );
  assert.match(
    postgresTest,
    /IF NOT termination_succeeded THEN[\s\S]*?RAISE EXCEPTION/,
  );
  assert.doesNotMatch(postgresTest, /pg_terminate_backend\(pid\)/);
  assert.match(postgresTest, /FROM pg_constraint/);
  for (const constraintName of [
    'training_session_aborted_fields_consistent',
    'training_session_createdByUserId_fkey',
    'training_session_abortedByUserId_fkey',
  ]) {
    assert.match(postgresTest, new RegExp(`'${constraintName}'`));
  }
  const terminationPosition = postgresTest.indexOf(
    'pg_terminate_backend(pid, 5000)',
  );
  const dropPosition = postgresTest.indexOf('DROP DATABASE');
  assert.ok(
    terminationPosition >= 0 && dropPosition > terminationPosition,
    'cleanup must wait for verified backend termination before dropping the database',
  );
  const blockedPosition = postgresTest.indexOf('await waitForBlockedSession');
  const commitPosition = postgresTest.indexOf("first.write('COMMIT;");
  assert.ok(blockedPosition >= 0, 'test must confirm the second insert is blocked');
  assert.ok(
    commitPosition > blockedPosition,
    'test must explicitly commit the first connection only after blocking is confirmed',
  );
});
