import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const migrationPath = resolve(
  repositoryRoot,
  'packages/db/prisma/migrations/20260713124000_task4_authorization_followup/migration.sql',
);

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .trim();
}

test('Task 4 follow-up hard-fails duplicate current grants before creating the partial unique index', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const raisePosition = sql.indexOf(
    'Task 4 follow-up conflict: multiple current consent grants exist',
  );
  const indexPosition = sql.indexOf(
    'consent_record_one_current_grant_per_patient_type_version',
  );

  assert.ok(raisePosition >= 0, 'missing duplicate current grant hard failure');
  assert.ok(indexPosition > raisePosition, 'index must follow duplicate preflight');
  assert.match(
    sql,
    /WHERE "status" = 'granted'\s+AND "revokedAt" IS NULL[\s\S]*GROUP BY "patientId", "consentType", "consentVersion"[\s\S]*HAVING COUNT\(\*\) > 1/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "consent_record_one_current_grant_per_patient_type_version"[\s\S]*\("patientId", "consentType", "consentVersion"\)[\s\S]*WHERE "status" = 'granted' AND "revokedAt" IS NULL/,
  );
  assert.doesNotMatch(sql, /UPDATE\s+"consent_record"/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+"consent_record"/i);
});

test('Task 4 follow-up hard-fails mismatched owners on current or pending plans without rewriting them', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /plan\."doctorId" IS NOT NULL[\s\S]*plan\."doctorId" <> patient\."responsibleDoctorId"[\s\S]*plan\."isCurrent" = true[\s\S]*plan\."status" = 'pending_confirm'/,
  );
  assert.match(
    sql,
    /RAISE EXCEPTION 'Task 4 follow-up conflict: current or pending rehab plan owner differs from responsible doctor'/,
  );
  assert.doesNotMatch(sql, /UPDATE\s+"rehab_plan"/i);
});

test('Task 4 follow-up migration owns one top-level transaction around every preflight and DDL statement', async () => {
  const sql = stripSqlComments(await readFile(migrationPath, 'utf8'));
  const beginStatements = sql.match(/^BEGIN\s*;/gm) ?? [];
  const commitStatements = sql.match(/^COMMIT\s*;/gm) ?? [];
  const lastPreflightPosition = sql.lastIndexOf('RAISE EXCEPTION');
  const firstDdlPosition = sql.indexOf('CREATE UNIQUE INDEX');

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
