import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  type SensitiveEncryptionKey,
} from "../src/sensitive-encryption";

const prismaDirectory = __dirname;
const repositoryRoot = resolve(prismaDirectory, "../../..");
const disposableDatabaseUrl =
  process.env.ENCRYPTED_SEED_DISPOSABLE_DATABASE_URL;
const encryptionKey: SensitiveEncryptionKey = {
  kid: "secret-manager://rehab/encrypted-seed-postgres-test",
  key: Buffer.alloc(32, 41),
};
const wrongEncryptionKey = Buffer.alloc(32, 42);

const envelopeFields = [
  ["user", "identityEnvelope"],
  ["patient_profile", "identityEnvelope"],
  ["patient_profile", "contactEnvelope"],
  ["patient_profile", "careDetailsEnvelope"],
  ["registration_request", "identityEnvelope"],
  ["registration_request", "reviewEnvelope"],
  ["assessment_record", "resultEnvelope"],
  ["risk_grade_record", "reasonEnvelope"],
  ["ai_analysis_record", "inputEnvelope"],
  ["ai_analysis_record", "outputEnvelope"],
  ["ai_conversation_session", "summaryEnvelope"],
  ["ai_conversation_session", "reviewEnvelope"],
  ["ai_conversation_message", "contentEnvelope"],
  ["care_circle_post", "contentEnvelope"],
  ["care_circle_post", "moderationEnvelope"],
  ["care_circle_comment", "contentEnvelope"],
  ["care_precaution", "contentEnvelope"],
  ["training_result", "reviewEnvelope"],
] as const;

const legacyFields = [
  ["user", ["displayName", "mobilePhone"]],
  [
    "patient_profile",
    [
      "name",
      "gender",
      "age",
      "mobilePhone",
      "caregiverName",
      "caregiverPhone",
      "healthMetrics",
    ],
  ],
  [
    "registration_request",
    ["displayName", "mobilePhone", "profileSnapshot", "reviewNote"],
  ],
  ["assessment_record", ["scoreSummary", "rawInputSummary"]],
  ["risk_grade_record", ["reasonSummary"]],
  ["ai_analysis_record", ["inputSummary", "outputSummary"]],
  ["ai_conversation_session", ["summary", "reviewNote"]],
  [
    "ai_conversation_message",
    ["content", "contentSnapshot", "evidenceMetadata"],
  ],
  ["care_circle_post", ["body", "mood", "privateMetadata", "moderationReason"]],
  ["care_circle_comment", ["body", "privateMetadata"]],
  ["care_precaution", ["title", "content"]],
  ["training_result", ["reviewNote"]],
] as const;

function requirePostgresUrl(value: string | undefined) {
  assert.match(
    value ?? "",
    /\S/,
    "ENCRYPTED_SEED_DISPOSABLE_DATABASE_URL is required",
  );
  const parsed = new URL(value!);
  assert.ok(
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:",
    "ENCRYPTED_SEED_DISPOSABLE_DATABASE_URL must be a PostgreSQL URL",
  );
  parsed.searchParams.delete("schema");
  return parsed;
}

function withSchema(baseUrl: URL, schemaName: string) {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("schema", schemaName);
  return parsed.toString();
}

function quoteIdentifier(value: string) {
  assert.match(value, /^[A-Za-z][A-Za-z0-9_]*$/);
  return `"${value}"`;
}

function runPnpm(
  args: string[],
  environment: NodeJS.ProcessEnv,
  expectedStatus: number,
) {
  const result = spawnSync("pnpm", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    expectedStatus,
    `pnpm ${args.join(" ")} status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function runSeed(
  script: "seed.ts" | "seed-trial.ts",
  environment: NodeJS.ProcessEnv,
  succeeds: boolean,
) {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@rehab-platform/db", "exec", "tsx", `prisma/${script}`],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (succeeds) {
    assert.equal(
      result.status,
      0,
      `${script} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  } else {
    assert.notEqual(
      result.status,
      0,
      `${script} unexpectedly succeeded\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}

function keyedEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SENSITIVE_DATA_KEY_REF: encryptionKey.kid,
    SENSITIVE_DATA_KEY: Buffer.from(encryptionKey.key).toString("base64"),
  };
}

function invalidKeyEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SENSITIVE_DATA_KEY_REF: encryptionKey.kid,
    SENSITIVE_DATA_KEY: "not-canonical-base64",
  };
}

function missingKeyEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    // Keep the keys defined so seed.ts cannot repopulate them from the
    // developer's root .env while this negative test is running.
    SENSITIVE_DATA_KEY_REF: "",
    SENSITIVE_DATA_KEY: "",
  };
  return environment;
}

function trialEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...keyedEnvironment(databaseUrl),
    TRIAL_ORG_CODE: "encrypted-seed-pg-trial",
    TRIAL_ORG_NAME: "Encrypted Seed PostgreSQL Trial",
    TRIAL_ORG_TYPE: "rehab_test",
    TRIAL_ADMIN_ACCOUNT: "encrypted-seed-trial-admin",
    TRIAL_ADMIN_DISPLAY_NAME: "PG试点管理员唯一哨兵",
    TRIAL_ADMIN_INITIAL_PASSWORD: "trial-admin-password",
    TRIAL_ADMIN_MOBILE_PHONE: "13700006101",
    TRIAL_DOCTOR_ACCOUNT: "encrypted-seed-trial-doctor",
    TRIAL_DOCTOR_DISPLAY_NAME: "PG试点医生唯一哨兵",
    TRIAL_DOCTOR_INITIAL_PASSWORD: "trial-doctor-password",
    TRIAL_DOCTOR_MOBILE_PHONE: "13700006102",
    TRIAL_DOCTOR_TITLE: "试点医生",
    TRIAL_DOCTOR_DEPARTMENT: "测试科室",
  };
}

function trialMissingKeyEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...trialEnvironment(databaseUrl),
    // Keep the keys defined so seed-trial.ts cannot repopulate them from the
    // developer's root .env while this negative test is running.
    SENSITIVE_DATA_KEY_REF: "",
    SENSITIVE_DATA_KEY: "",
  };
}

async function migrate(databaseUrl: string) {
  runPnpm(
    ["--filter", "@rehab-platform/db", "exec", "prisma", "migrate", "deploy"],
    { ...process.env, DATABASE_URL: databaseUrl },
    0,
  );
}

async function dataRowCounts(client: PrismaClient) {
  const tables = await client.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = current_schema()
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename`,
  );
  const counts: Record<string, string> = {};
  for (const { tablename } of tables) {
    const [row] = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS "count" FROM ${quoteIdentifier(tablename)}`,
    );
    counts[tablename] = row.count.toString();
  }
  return counts;
}

async function assertLegacyColumnsAreNull(client: PrismaClient) {
  for (const [tableName, columns] of legacyFields) {
    const predicate = columns
      .map((columnName) => `${quoteIdentifier(columnName)} IS NOT NULL`)
      .join(" OR ");
    const [row] = await client.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS "count"
         FROM ${quoteIdentifier(tableName)}
        WHERE ${predicate}`,
    );
    assert.equal(row.count, 0, `${tableName} contains non-null legacy data`);
  }
}

async function decryptEveryStoredEnvelope(client: PrismaClient) {
  const plaintext: unknown[] = [];
  for (const [tableName, fieldName] of envelopeFields) {
    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; envelope: unknown }>
    >(
      `SELECT "id", ${quoteIdentifier(fieldName)} AS "envelope"
         FROM ${quoteIdentifier(tableName)}
        WHERE ${quoteIdentifier(fieldName)} IS NOT NULL`,
    );
    for (const row of rows) {
      const envelope = row.envelope as {
        kid?: unknown;
        aad?: unknown;
      };
      assert.equal(envelope.kid, encryptionKey.kid);
      assert.deepEqual(envelope.aad, {
        tableName,
        recordId: row.id,
        fieldName,
      });
      plaintext.push(
        decryptSensitiveJson(
          row.envelope,
          { tableName, recordId: row.id, fieldName },
          encryptionKey,
        ),
      );
    }
  }
  return plaintext;
}

async function assertUserPhoneLookups(client: PrismaClient) {
  const rows = await client.$queryRawUnsafe<
    Array<{
      id: string;
      account: string;
      identityEnvelope: unknown;
      mobilePhoneLookup: string | null;
    }>
  >(
    `SELECT "id", "account", "identityEnvelope", "mobilePhoneLookup"
       FROM "user"`,
  );
  for (const row of rows) {
    const identity = decryptSensitiveJson<{ mobilePhone: string | null }>(
      row.identityEnvelope,
      {
        tableName: "user",
        recordId: row.id,
        fieldName: "identityEnvelope",
      },
      encryptionKey,
    );
    const expected = identity.mobilePhone
      ? createPhoneLookupHmac(identity.mobilePhone, encryptionKey.key)
      : null;
    assert.equal(
      row.mobilePhoneLookup,
      expected,
      `${row.account} has an incorrect phone lookup HMAC`,
    );
  }
}

async function assertNonEnvelopeJsonExcludes(
  client: PrismaClient,
  sentinels: string[],
) {
  const columns = await client.$queryRawUnsafe<
    Array<{ tableName: string; columnName: string }>
  >(
    `SELECT table_name AS "tableName", column_name AS "columnName"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND data_type = 'jsonb'
        AND column_name NOT LIKE '%Envelope'
      ORDER BY table_name, ordinal_position`,
  );
  for (const { tableName, columnName } of columns) {
    const rows = await client.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT ${quoteIdentifier(columnName)}::text AS "value"
         FROM ${quoteIdentifier(tableName)}
        WHERE ${quoteIdentifier(columnName)} IS NOT NULL`,
    );
    for (const row of rows) {
      for (const sentinel of sentinels) {
        assert.ok(
          !row.value.includes(sentinel),
          `${tableName}.${columnName} contains sensitive sentinel ${sentinel}`,
        );
      }
    }
  }
}

async function tamperFirstUserEnvelope(client: PrismaClient) {
  const [before] = await client.$queryRawUnsafe<
    Array<{ id: string; envelope: Record<string, unknown> }>
  >(
    `SELECT "id", "identityEnvelope" AS "envelope" FROM "user" ORDER BY "account" LIMIT 1`,
  );
  assert.ok(before);
  const tampered = {
    ...before.envelope,
    tag: Buffer.alloc(16, 1).toString("base64"),
  };
  await client.$executeRawUnsafe(
    `UPDATE "user" SET "identityEnvelope" = $1::jsonb WHERE "id" = $2`,
    JSON.stringify(tampered),
    before.id,
  );
  return { id: before.id, tampered };
}

async function storedUserEnvelope(client: PrismaClient, id: string) {
  const [row] = await client.$queryRawUnsafe<Array<{ envelope: unknown }>>(
    `SELECT "identityEnvelope" AS "envelope" FROM "user" WHERE "id" = $1`,
    id,
  );
  return row.envelope;
}

test(
  "main and trial seeds enforce encrypted PostgreSQL storage and reject unsafe reruns",
  { timeout: 240_000 },
  async (context) => {
    const baseUrl = requirePostgresUrl(disposableDatabaseUrl);
    const admin = new PrismaClient({
      datasources: { db: { url: baseUrl.toString() } },
    });
    const schemas: string[] = [];

    async function createIsolatedClient(label: string) {
      const schemaName = `encrypted_seed_${label}_${process.pid}_${randomBytes(5).toString("hex")}`;
      assert.match(schemaName, /^[a-z0-9_]+$/);
      await admin.$executeRawUnsafe(
        `CREATE SCHEMA ${quoteIdentifier(schemaName)}`,
      );
      schemas.push(schemaName);
      const databaseUrl = withSchema(baseUrl, schemaName);
      await migrate(databaseUrl);
      return {
        databaseUrl,
        client: new PrismaClient({ datasources: { db: { url: databaseUrl } } }),
      };
    }

    try {
      const main = await createIsolatedClient("main");
      await context.test(
        "missing and invalid keys fail before the main seed writes",
        async () => {
          const before = await dataRowCounts(main.client);
          const missingFailure = runSeed(
            "seed.ts",
            {
              ...missingKeyEnvironment(main.databaseUrl),
              DEFAULT_PATIENT_PASSWORD: "main-seed-password",
            },
            false,
          );
          assert.match(missingFailure.stderr, /requires an exact non-empty/);
          assert.deepEqual(await dataRowCounts(main.client), before);

          const invalidFailure = runSeed(
            "seed.ts",
            {
              ...invalidKeyEnvironment(main.databaseUrl),
              DEFAULT_PATIENT_PASSWORD: "main-seed-password",
            },
            false,
          );
          assert.match(invalidFailure.stderr, /requires canonical base64/);
          assert.deepEqual(await dataRowCounts(main.client), before);
        },
      );

      await context.test(
        "main seed persists only authenticated envelopes",
        async () => {
          runSeed(
            "seed.ts",
            {
              ...keyedEnvironment(main.databaseUrl),
              DEFAULT_PATIENT_PASSWORD: "main-seed-password",
            },
            true,
          );
          const plaintext = JSON.stringify(
            await decryptEveryStoredEnvelope(main.client),
          );
          for (const sentinel of [
            "SEED-ALZ-0001",
            "李秀兰",
            "李明",
            "13800006721",
            "13900008206",
          ]) {
            assert.ok(plaintext.includes(sentinel));
          }
          await assertUserPhoneLookups(main.client);
          await assertLegacyColumnsAreNull(main.client);
          await assertNonEnvelopeJsonExcludes(main.client, [
            "SEED-ALZ-0001",
            "李秀兰",
            "李明",
            "13800006721",
            "13900008206",
          ]);
        },
      );

      await context.test(
        "main seed rejects wrong-key and tampered reruns",
        async () => {
          const [firstUser] = await main.client.$queryRawUnsafe<
            Array<{ id: string; envelope: unknown }>
          >(
            `SELECT "id", "identityEnvelope" AS "envelope" FROM "user" ORDER BY "account" LIMIT 1`,
          );
          const wrongKeyFailure = runSeed(
            "seed.ts",
            {
              ...keyedEnvironment(main.databaseUrl),
              SENSITIVE_DATA_KEY: wrongEncryptionKey.toString("base64"),
              DEFAULT_PATIENT_PASSWORD: "main-seed-password",
            },
            false,
          );
          assert.match(
            wrongKeyFailure.stderr,
            /key id does not match|authentication failed/,
          );
          assert.deepEqual(
            await storedUserEnvelope(main.client, firstUser.id),
            firstUser.envelope,
          );

          const { id, tampered } = await tamperFirstUserEnvelope(main.client);
          const tamperFailure = runSeed(
            "seed.ts",
            {
              ...keyedEnvironment(main.databaseUrl),
              DEFAULT_PATIENT_PASSWORD: "main-seed-password",
            },
            false,
          );
          assert.match(tamperFailure.stderr, /authentication failed/);
          assert.deepEqual(await storedUserEnvelope(main.client, id), tampered);
        },
      );
      await main.client.$disconnect();

      const trial = await createIsolatedClient("trial");
      await context.test(
        "missing and invalid keys fail before the trial seed writes",
        async () => {
          const before = await dataRowCounts(trial.client);
          const missingFailure = runSeed(
            "seed-trial.ts",
            trialMissingKeyEnvironment(trial.databaseUrl),
            false,
          );
          assert.match(missingFailure.stderr, /requires an exact non-empty/);
          assert.deepEqual(await dataRowCounts(trial.client), before);

          const invalidFailure = runSeed(
            "seed-trial.ts",
            {
              ...trialEnvironment(trial.databaseUrl),
              ...invalidKeyEnvironment(trial.databaseUrl),
            },
            false,
          );
          assert.match(invalidFailure.stderr, /requires canonical base64/);
          assert.deepEqual(await dataRowCounts(trial.client), before);
        },
      );

      await context.test(
        "trial seed persists only authenticated envelopes",
        async () => {
          runSeed("seed-trial.ts", trialEnvironment(trial.databaseUrl), true);
          const plaintext = JSON.stringify(
            await decryptEveryStoredEnvelope(trial.client),
          );
          for (const sentinel of [
            "PG试点管理员唯一哨兵",
            "PG试点医生唯一哨兵",
            "13700006101",
            "13700006102",
          ]) {
            assert.ok(plaintext.includes(sentinel));
          }
          await assertUserPhoneLookups(trial.client);
          await assertLegacyColumnsAreNull(trial.client);
          await assertNonEnvelopeJsonExcludes(trial.client, [
            "PG试点管理员唯一哨兵",
            "PG试点医生唯一哨兵",
            "13700006101",
            "13700006102",
          ]);
        },
      );

      await context.test(
        "trial seed rejects wrong-key and tampered reruns",
        async () => {
          const [firstUser] = await trial.client.$queryRawUnsafe<
            Array<{ id: string; envelope: unknown }>
          >(
            `SELECT "id", "identityEnvelope" AS "envelope" FROM "user" ORDER BY "account" LIMIT 1`,
          );
          const wrongKeyFailure = runSeed(
            "seed-trial.ts",
            {
              ...trialEnvironment(trial.databaseUrl),
              SENSITIVE_DATA_KEY: wrongEncryptionKey.toString("base64"),
            },
            false,
          );
          assert.match(
            wrongKeyFailure.stderr,
            /key id does not match|authentication failed/,
          );
          assert.deepEqual(
            await storedUserEnvelope(trial.client, firstUser.id),
            firstUser.envelope,
          );

          const { id, tampered } = await tamperFirstUserEnvelope(trial.client);
          const tamperFailure = runSeed(
            "seed-trial.ts",
            trialEnvironment(trial.databaseUrl),
            false,
          );
          assert.match(tamperFailure.stderr, /authentication failed/);
          assert.deepEqual(
            await storedUserEnvelope(trial.client, id),
            tampered,
          );
        },
      );
      await trial.client.$disconnect();
    } finally {
      for (const schemaName of schemas.reverse()) {
        await admin.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
        );
      }
      await admin.$disconnect();
    }
  },
);
