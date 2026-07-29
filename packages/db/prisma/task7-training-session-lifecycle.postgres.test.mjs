import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  prismaDirectory,
  'migrations/20260713125000_task7_training_session_lifecycle/migration.sql',
);
const forbiddenDatabaseNames = new Set(['rehab_platform', 'rehab_task4_test']);
const container = process.env.TASK7_POSTGRES_CONTAINER;
const databaseUser = process.env.TASK7_POSTGRES_USER;

function requireDisposablePostgresConfirmation() {
  assert.equal(
    process.env.TASK7_E2E_CONFIRM_DISPOSABLE,
    'YES',
    'TASK7_E2E_CONFIRM_DISPOSABLE=YES is required',
  );
  assert.match(
    container ?? '',
    /\S/,
    'TASK7_POSTGRES_CONTAINER must identify the disposable PostgreSQL container',
  );
  assert.match(
    databaseUser ?? '',
    /\S/,
    'TASK7_POSTGRES_USER must identify the PostgreSQL test administrator',
  );
}

function createDatabaseName() {
  const name = `rehab_task7_test_${process.pid}_${randomBytes(5).toString('hex')}`;
  assert.match(name, /^rehab_task7_test_[a-z0-9_]+$/);
  assert.ok(!forbiddenDatabaseNames.has(name));
  return name;
}

function psqlArgs(databaseName) {
  return [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '--set',
    'ON_ERROR_STOP=1',
    '--username',
    databaseUser,
    '--dbname',
    databaseName,
  ];
}

function runPsql(databaseName, sql, expectedStatus = 0) {
  const result = spawnSync('docker', psqlArgs(databaseName), {
    encoding: 'utf8',
    input: sql,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    expectedStatus,
    `psql status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function runPsqlExpectFailure(databaseName, sql, expectedMessage) {
  const result = spawnSync('docker', psqlArgs(databaseName), {
    encoding: 'utf8',
    input: sql,
  });
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0, `SQL unexpectedly succeeded:\n${sql}`);
  assert.match(result.stderr, expectedMessage);
  return result;
}

function startPsqlSession(databaseName) {
  const child = spawn('docker', psqlArgs(databaseName), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let closed = false;
  const completed = new Promise((resolvePromise, rejectPromise) => {
    child.on('error', rejectPromise);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (status) => {
      closed = true;
      resolvePromise({ status, stdout, stderr });
    });
  });
  return {
    completed,
    end: () => child.stdin.end(),
    get closed() {
      return closed;
    },
    get stderr() {
      return stderr;
    },
    get stdout() {
      return stdout;
    },
    write: (sql) => child.stdin.write(sql),
  };
}

async function waitForSessionOutput(session, pattern, description) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const match = session.stdout.match(pattern);
    if (match) return match;
    if (session.closed) {
      throw new Error(
        `psql exited before ${description}: ${session.stderr || session.stdout}`,
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForBlockedSession(databaseName, backendPid) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = runPsql(
      databaseName,
      `
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM pg_stat_activity
  WHERE pid = ${backendPid}
    AND state = 'active'
    AND wait_event_type = 'Lock'
) THEN 'TASK7_SECOND_BLOCKED' ELSE 'TASK7_SECOND_NOT_BLOCKED' END;
`,
    );
    if (result.stdout.includes('TASK7_SECOND_BLOCKED')) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`Timed out waiting for backend ${backendPid} to block`);
}

const baseSchemaSql = `
CREATE TYPE "TrainingSessionStatus" AS ENUM (
  'started',
  'in_progress',
  'completed',
  'interrupted',
  'upload_failed'
);

CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "training_session" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT,
  "planItemId" TEXT NOT NULL,
  "sessionStatus" "TrainingSessionStatus" NOT NULL DEFAULT 'started'
);
`;

async function withDisposableDatabase(run) {
  requireDisposablePostgresConfirmation();
  const databaseName = createDatabaseName();
  runPsql('postgres', `CREATE DATABASE "${databaseName}";`);
  try {
    await run(databaseName);
  } finally {
    runPsql(
      'postgres',
      `
DO $$
DECLARE
  termination_succeeded boolean;
BEGIN
  SELECT COALESCE(bool_and(pg_terminate_backend(pid, 5000)), true)
  INTO termination_succeeded
  FROM pg_stat_activity
  WHERE datname = '${databaseName}' AND pid <> pg_backend_pid();

  IF NOT termination_succeeded THEN
    RAISE EXCEPTION 'Task 7 cleanup failed to terminate every backend for database ${databaseName}';
  END IF;
END $$;
DROP DATABASE "${databaseName}";
`,
    );
  }
}

test('migration rolls back earlier DDL when a later statement fails', async () => {
  const migrationSql = await readFile(migrationPath, 'utf8');
  let cleanupBackendPid;
  let cleanupDatabaseName;
  let cleanupSession;

  await withDisposableDatabase(async (databaseName) => {
    cleanupDatabaseName = databaseName;
    runPsql(databaseName, baseSchemaSql);
    runPsql(
      databaseName,
      `CREATE INDEX "training_session_createdByUserId_idx" ON "training_session" ("id");`,
    );
    runPsqlExpectFailure(
      databaseName,
      migrationSql,
      /relation "training_session_createdByUserId_idx" already exists/,
    );

    const inspection = runPsql(
      databaseName,
      `
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'training_session'
  AND column_name IN ('createdByUserId', 'abortedAt', 'abortedByUserId', 'abortReason');
SELECT COUNT(*)
FROM pg_enum enum_value
JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
WHERE enum_type.typname = 'TrainingSessionStatus'
  AND enum_value.enumlabel = 'aborted';
SELECT COUNT(*)
FROM pg_constraint
WHERE conrelid = 'training_session'::regclass
  AND conname IN (
    'training_session_aborted_fields_consistent',
    'training_session_createdByUserId_fkey',
    'training_session_abortedByUserId_fkey'
  );
`,
    );
    assert.match(
      inspection.stdout,
      /\n\s*0\s*\n[\s\S]*\n\s*0\s*\n[\s\S]*\n\s*0\s*\n/,
    );

    cleanupSession = startPsqlSession(databaseName);
    cleanupSession.write(
      `SELECT 'TASK7_CLEANUP_BACKEND=' || pg_backend_pid();\n`,
    );
    const cleanupPidMatch = await waitForSessionOutput(
      cleanupSession,
      /TASK7_CLEANUP_BACKEND=(\d+)/,
      'cleanup backend PID',
    );
    cleanupBackendPid = Number(cleanupPidMatch[1]);
  });

  const cleanupInspection = runPsql(
    'postgres',
    `
SELECT COUNT(*) FROM pg_stat_activity WHERE pid = ${cleanupBackendPid};
SELECT COUNT(*) FROM pg_database WHERE datname = '${cleanupDatabaseName}';
`,
  );
  assert.match(cleanupInspection.stdout, /\n\s*0\s*\n[\s\S]*\n\s*0\s*\n/);
  cleanupSession.end();
  await cleanupSession.completed;
});

test('migration preflight hard-fails historical parallel active sessions without partial DDL', async () => {
  const migrationSql = await readFile(migrationPath, 'utf8');

  await withDisposableDatabase(async (databaseName) => {
    runPsql(
      databaseName,
      `${baseSchemaSql}
INSERT INTO "training_session"
  ("id", "idempotencyKey", "planItemId", "sessionStatus")
VALUES
  ('historical-a', 'historical-key-a', 'plan-item-duplicate', 'started'),
  ('historical-b', 'historical-key-b', 'plan-item-duplicate', 'in_progress');
`,
    );

    runPsqlExpectFailure(
      databaseName,
      migrationSql,
      /Task 7 lifecycle conflict: multiple active training sessions exist for one plan item/,
    );
    const inspection = runPsql(
      databaseName,
      `
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'training_session'
  AND column_name IN ('createdByUserId', 'abortedAt', 'abortedByUserId', 'abortReason');
SELECT COUNT(*)
FROM pg_enum enum_value
JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
WHERE enum_type.typname = 'TrainingSessionStatus'
  AND enum_value.enumlabel = 'aborted';
`,
    );
    assert.match(inspection.stdout, /\n\s*0\s*\n[\s\S]*\n\s*0\s*\n/);
  });
});

test('partial unique index allows exactly one concurrent active insert per plan item', async () => {
  const migrationSql = await readFile(migrationPath, 'utf8');

  await withDisposableDatabase(async (databaseName) => {
    runPsql(databaseName, baseSchemaSql);
    runPsql(databaseName, migrationSql);
    runPsql(databaseName, `INSERT INTO "user" ("id") VALUES ('session-owner');`);

    const first = startPsqlSession(databaseName);
    first.write(
      `
BEGIN;
INSERT INTO "training_session"
  ("id", "idempotencyKey", "planItemId", "sessionStatus", "createdByUserId")
VALUES
  ('concurrent-a', 'different-key-a', 'shared-plan-item', 'started', 'session-owner');
\\echo TASK7_FIRST_INSERTED
`,
    );
    await waitForSessionOutput(
      first,
      /TASK7_FIRST_INSERTED/,
      'first insert marker',
    );

    const second = startPsqlSession(databaseName);
    second.write(
      `
SELECT 'TASK7_SECOND_PID=' || pg_backend_pid();
INSERT INTO "training_session"
  ("id", "idempotencyKey", "planItemId", "sessionStatus", "createdByUserId")
VALUES
  ('concurrent-b', 'different-key-b', 'shared-plan-item', 'in_progress', 'session-owner');
`,
    );
    second.end();
    const secondPidMatch = await waitForSessionOutput(
      second,
      /TASK7_SECOND_PID=(\d+)/,
      'second connection backend PID',
    );
    const secondBackendPid = Number(secondPidMatch[1]);
    await waitForBlockedSession(databaseName, secondBackendPid);

    first.write('COMMIT;\n\\q\n');
    first.end();
    const [firstResult, secondResult] = await Promise.all([
      first.completed,
      second.completed,
    ]);

    assert.equal(firstResult.status, 0, firstResult.stderr);
    assert.notEqual(secondResult.status, 0, secondResult.stdout);
    assert.match(secondResult.stderr, /training_session_one_active_per_plan_item/);
    const count = runPsql(
      databaseName,
      `SELECT COUNT(*) FROM "training_session" WHERE "planItemId" = 'shared-plan-item';`,
    );
    assert.match(count.stdout, /\n\s*1\s*\n/);
  });
});

test('aborted lifecycle check accepts complete abort data and rejects inconsistent fields', async () => {
  const migrationSql = await readFile(migrationPath, 'utf8');

  await withDisposableDatabase(async (databaseName) => {
    runPsql(databaseName, baseSchemaSql);
    runPsql(databaseName, migrationSql);
    runPsql(
      databaseName,
      `
INSERT INTO "user" ("id") VALUES ('creator'), ('abort-actor');
INSERT INTO "training_session"
  ("id", "idempotencyKey", "planItemId", "sessionStatus", "createdByUserId", "abortedAt", "abortedByUserId", "abortReason")
VALUES
  ('valid-aborted', 'aborted-key', 'aborted-plan-item', 'aborted', 'creator', CURRENT_TIMESTAMP, 'abort-actor', 'patient requested stop'),
  ('valid-historical', 'historical-null-owner', 'completed-plan-item', 'completed', NULL, NULL, NULL, NULL);
`,
    );

    const invalidStatements = [
      `INSERT INTO "training_session" ("id", "planItemId", "sessionStatus") VALUES ('missing-all', 'invalid-plan-1', 'aborted');`,
      `INSERT INTO "training_session" ("id", "planItemId", "sessionStatus", "abortedAt", "abortedByUserId", "abortReason") VALUES ('blank-reason', 'invalid-plan-2', 'aborted', CURRENT_TIMESTAMP, 'abort-actor', '   ');`,
      `INSERT INTO "training_session" ("id", "planItemId", "sessionStatus", "abortedAt", "abortedByUserId", "abortReason") VALUES ('control-whitespace-reason', 'invalid-plan-3', 'aborted', CURRENT_TIMESTAMP, 'abort-actor', E'\\t\\n\\r');`,
      `INSERT INTO "training_session" ("id", "planItemId", "sessionStatus", "abortedAt", "abortedByUserId", "abortReason") VALUES ('non-aborted-fields', 'invalid-plan-4', 'completed', CURRENT_TIMESTAMP, 'abort-actor', 'not allowed');`,
    ];
    for (const statement of invalidStatements) {
      runPsqlExpectFailure(
        databaseName,
        statement,
        /training_session_aborted_fields_consistent/,
      );
    }
  });
});
