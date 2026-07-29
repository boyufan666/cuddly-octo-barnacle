import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(prismaDirectory, "../../..");
const prismaSchemaPath = resolve(prismaDirectory, "schema.prisma");
const migrationsDirectory = resolve(prismaDirectory, "migrations");
const additiveMigrationName = "20260714090000_sensitive_encryption_envelopes";
const rolloutMigrationName =
  "20260714100000_ai_conversation_turn_count_rollout";
const finalMigrationName = "20260714170000_sensitive_encryption_finalize";
const disposableDatabaseUrl =
  process.env.SENSITIVE_ENCRYPTION_BACKFILL_DISPOSABLE_DATABASE_URL;
const encryptionKey = Buffer.alloc(32, 7);
const keyEnvironment = {
  SENSITIVE_DATA_KEY_REF: "sensitive-backfill-postgres-test",
  SENSITIVE_DATA_KEY: encryptionKey.toString("base64"),
};
const firstUserId = "018f5f71-3b9a-7f52-8a9c-2d6f30b4e101";
const secondUserId = "018f5f71-3b9a-7f52-8a9c-2d6f30b4e102";
const concurrentUserId = "018f5f71-3b9a-7f52-8a9d-2d6f30b4e103";
const advisoryLockId = 718_268_337;
const fixtureIds = Object.freeze({
  organization: "018f5f71-3b9a-7f52-8a10-2d6f30b4e001",
  doctorUser: "018f5f71-3b9a-7f52-8a10-2d6f30b4e002",
  patientUser: "018f5f71-3b9a-7f52-8a10-2d6f30b4e003",
  doctorProfile: "018f5f71-3b9a-7f52-8a10-2d6f30b4e004",
  patientProfile: "018f5f71-3b9a-7f52-8a10-2d6f30b4e005",
  registrationRequest: "018f5f71-3b9a-7f52-8a10-2d6f30b4e006",
  assessmentRecord: "018f5f71-3b9a-7f52-8a10-2d6f30b4e007",
  riskGradeRecord: "018f5f71-3b9a-7f52-8a10-2d6f30b4e008",
  aiAnalysisRecord: "018f5f71-3b9a-7f52-8a10-2d6f30b4e009",
  conversationSession: "018f5f71-3b9a-7f52-8a10-2d6f30b4e00a",
  conversationMessage: "018f5f71-3b9a-7f52-8a10-2d6f30b4e00b",
  carePost: "018f5f71-3b9a-7f52-8a10-2d6f30b4e00c",
  careComment: "018f5f71-3b9a-7f52-8a10-2d6f30b4e00d",
  carePrecaution: "018f5f71-3b9a-7f52-8a10-2d6f30b4e00e",
  gameContent: "018f5f71-3b9a-7f52-8a10-2d6f30b4e00f",
  rehabPlan: "018f5f71-3b9a-7f52-8a10-2d6f30b4e010",
  rehabPlanItem: "018f5f71-3b9a-7f52-8a10-2d6f30b4e011",
  trainingSession: "018f5f71-3b9a-7f52-8a10-2d6f30b4e012",
  trainingResult: "018f5f71-3b9a-7f52-8a10-2d6f30b4e013",
});

const legacyColumns = Object.freeze({
  user: ["displayName", "mobilePhone"],
  patient_profile: [
    "name",
    "gender",
    "age",
    "mobilePhone",
    "caregiverName",
    "caregiverPhone",
    "healthMetrics",
  ],
  registration_request: [
    "displayName",
    "mobilePhone",
    "profileSnapshot",
    "reviewNote",
  ],
  care_circle_post: ["body", "mood", "privateMetadata", "moderationReason"],
  care_circle_comment: ["body", "privateMetadata"],
  care_precaution: ["title", "content"],
  assessment_record: ["scoreSummary", "rawInputSummary"],
  risk_grade_record: ["reasonSummary"],
  ai_analysis_record: ["inputSummary", "outputSummary"],
  ai_conversation_session: ["summary", "reviewNote"],
  ai_conversation_message: ["content", "contentSnapshot", "evidenceMetadata"],
  training_result: ["reviewNote"],
});

const requiredEnvelopes = Object.freeze({
  user: ["identityEnvelope"],
  patient_profile: ["identityEnvelope", "careDetailsEnvelope"],
  registration_request: ["identityEnvelope"],
  care_circle_post: ["contentEnvelope"],
  care_circle_comment: ["contentEnvelope"],
  care_precaution: ["contentEnvelope"],
  assessment_record: ["resultEnvelope"],
  risk_grade_record: ["reasonEnvelope"],
  ai_analysis_record: ["inputEnvelope", "outputEnvelope"],
  ai_conversation_message: ["contentEnvelope"],
});

const optionalEnvelopes = Object.freeze({
  patient_profile: ["contactEnvelope"],
  registration_request: ["reviewEnvelope"],
  care_circle_post: ["moderationEnvelope"],
  ai_conversation_session: ["summaryEnvelope", "reviewEnvelope"],
  training_result: ["reviewEnvelope"],
});

function requirePostgresUrl(value) {
  assert.match(
    value ?? "",
    /\S/,
    "SENSITIVE_ENCRYPTION_BACKFILL_DISPOSABLE_DATABASE_URL is required",
  );
  const parsed = new URL(value);
  assert.ok(
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:",
    "SENSITIVE_ENCRYPTION_BACKFILL_DISPOSABLE_DATABASE_URL must be a PostgreSQL URL",
  );
  return parsed;
}

function withSchema(databaseUrl, schemaName) {
  const parsed = requirePostgresUrl(databaseUrl);
  parsed.searchParams.set("schema", schemaName);
  return parsed.toString();
}

function runPnpm(args, environment, expectedStatus) {
  const result = spawnSync("pnpm", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    expectedStatus,
    `pnpm ${args.join(" ")} status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function startPnpm(args, environment) {
  const child = spawn("pnpm", args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const completed = new Promise((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (status) => {
      resolvePromise({ status, stdout, stderr });
    });
  });
  return { completed };
}

function migrationPath(migrationName) {
  return resolve(migrationsDirectory, migrationName, "migration.sql");
}

function runMigration(databaseUrl, migrationName) {
  return runPnpm(
    [
      "--filter",
      "@rehab-platform/db",
      "exec",
      "prisma",
      "db",
      "execute",
      "--file",
      migrationPath(migrationName),
      "--schema",
      prismaSchemaPath,
    ],
    { DATABASE_URL: databaseUrl },
    0,
  );
}

function applyPreAdditiveMigrations(databaseUrl) {
  const migrationNames = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        /^\d+_[a-z0-9_]+$/.test(entry.name) &&
        entry.name < additiveMigrationName,
    )
    .map((entry) => entry.name)
    .sort();
  assert.ok(migrationNames.length > 0, "pre-additive migrations are required");
  assert.equal(
    migrationNames.at(-1),
    "20260713125000_task7_training_session_lifecycle",
  );
  for (const migrationName of migrationNames) {
    runMigration(databaseUrl, migrationName);
  }
}

function decryptEnvelope(envelope, tableName, recordId, fieldName) {
  const expectedAad = { tableName, recordId, fieldName };
  assert.equal(envelope.v, 1);
  assert.equal(envelope.alg, "AES-256-GCM");
  assert.equal(envelope.kid, keyEnvironment.SENSITIVE_DATA_KEY_REF);
  assert.equal(envelope.contentType, "application/json");
  assert.deepEqual(envelope.aad, expectedAad);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(envelope.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(JSON.stringify(expectedAad), "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}

async function insertPopulatedLegacyFixture(client) {
  await client.$executeRawUnsafe(
    `INSERT INTO "organization" ("id", "name", "code", "type", "updatedAt")
     VALUES ($1, '迁移验证机构', 'migration-fixture', 'hospital', CURRENT_TIMESTAMP)`,
    fixtureIds.organization,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "user"
       ("id", "account", "mobilePhone", "passwordHash", "displayName", "updatedAt")
     VALUES
       ($1, 'migration-doctor', '13700137000', 'not-a-real-credential', '迁移医生', CURRENT_TIMESTAMP),
       ($2, 'migration-patient', '13800138000', 'not-a-real-credential', '迁移患者', CURRENT_TIMESTAMP)`,
    fixtureIds.doctorUser,
    fixtureIds.patientUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "doctor_profile"
       ("id", "userId", "organizationId", "title", "department", "updatedAt")
     VALUES ($1, $2, $3, '主任医师', '康复科', CURRENT_TIMESTAMP)`,
    fixtureIds.doctorProfile,
    fixtureIds.doctorUser,
    fixtureIds.organization,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "patient_profile"
       ("id", "userId", "responsibleDoctorId", "name", "gender", "age",
        "mobilePhone", "caregiverName", "caregiverPhone", "healthMetrics", "updatedAt")
     VALUES ($1, $2, $3, '迁移患者档案', 'female', 68, '13800138000',
             '迁移照护者', '13900139000', '{"bloodPressure":"120/80","falls":1}', CURRENT_TIMESTAMP)`,
    fixtureIds.patientProfile,
    fixtureIds.patientUser,
    fixtureIds.doctorProfile,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "registration_request"
       ("id", "requestedRole", "account", "initialPasswordHash", "displayName",
        "mobilePhone", "profileSnapshot", "reviewStatus", "reviewNote",
        "credentialExpiresAt", "updatedAt")
     VALUES ($1, 'caregiver', 'migration-registration', 'not-a-real-credential',
             '迁移申请人', '13600136000', '{"relation":"daughter","age":42}',
             'rejected', '材料需要补充', '2099-01-01T00:00:00.000Z', CURRENT_TIMESTAMP)`,
    fixtureIds.registrationRequest,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "assessment_record"
       ("id", "patientId", "assessmentType", "scoreSummary", "rawInputSummary")
     VALUES ($1, $2, 'balance', '{"score":73,"grade":"moderate"}',
             '{"answers":[1,2,3],"device":"clinic-tablet"}')`,
    fixtureIds.assessmentRecord,
    fixtureIds.patientProfile,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "risk_grade_record"
       ("id", "patientId", "assessmentId", "riskLevel", "systemRiskLevel",
        "isCurrent", "reasonSummary")
     VALUES ($1, $2, $3, 'moderate', 'moderate', true, '平衡能力下降并有跌倒史')`,
    fixtureIds.riskGradeRecord,
    fixtureIds.patientProfile,
    fixtureIds.assessmentRecord,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "ai_analysis_record"
       ("id", "patientId", "assessmentId", "analysisScene", "modelVersion",
        "confidence", "inputSummary", "outputSummary")
     VALUES ($1, $2, $3, 'risk_assessment', 'migration-model-v1', 0.91,
             '{"features":["balance","falls"]}',
             '{"risk":"moderate","actions":["supervision"]}')`,
    fixtureIds.aiAnalysisRecord,
    fixtureIds.patientProfile,
    fixtureIds.assessmentRecord,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "ai_conversation_session"
       ("id", "patientId", "createdByUserId", "assessmentType", "status",
        "provider", "modelVersion", "endpointRef", "summary", "reviewNote",
        "metadata", "updatedAt")
     VALUES ($1, $2, $3, 'balance', 'completed', 'migration-provider',
             'migration-model-v1', 'migration-endpoint', '对话总结', '人工复核通过',
             '{"keep":"preserved","turnCount":99}', CURRENT_TIMESTAMP)`,
    fixtureIds.conversationSession,
    fixtureIds.patientProfile,
    fixtureIds.doctorUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "ai_conversation_message"
       ("id", "sessionId", "turnIndex", "role", "content", "contentSnapshot", "evidenceMetadata")
     VALUES ($1, $2, 3, 'assistant', '请在训练时保持照护者陪同',
             '{"text":"请在训练时保持照护者陪同","locale":"zh-CN"}',
             '{"assessmentId":"018f5f71-3b9a-7f52-8a10-2d6f30b4e007"}')`,
    fixtureIds.conversationMessage,
    fixtureIds.conversationSession,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "care_circle_post"
       ("id", "patientId", "authorUserId", "body", "mood", "moderationReason",
        "privateMetadata", "updatedAt")
     VALUES ($1, $2, $3, '今天完成了全部训练', 'encouraged', '已人工确认内容',
             '{"audience":"care-team","source":"patient"}', CURRENT_TIMESTAMP)`,
    fixtureIds.carePost,
    fixtureIds.patientProfile,
    fixtureIds.patientUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "care_circle_comment"
       ("id", "postId", "authorUserId", "body", "privateMetadata", "updatedAt")
     VALUES ($1, $2, $3, '训练完成度很好', '{"clinical":true}', CURRENT_TIMESTAMP)`,
    fixtureIds.careComment,
    fixtureIds.carePost,
    fixtureIds.doctorUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "care_precaution"
       ("id", "patientId", "createdByUserId", "title", "content", "category", "updatedAt")
     VALUES ($1, $2, $3, '防跌倒提醒', '训练期间需有人陪同并清理地面障碍物', 'safety', CURRENT_TIMESTAMP)`,
    fixtureIds.carePrecaution,
    fixtureIds.patientProfile,
    fixtureIds.doctorUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "game_content"
       ("id", "code", "name", "trainingTargets", "tags", "defaultDuration",
        "defaultDifficulty", "runtimeType", "updatedAt")
     VALUES ($1, 'migration-game', '迁移验证训练', ARRAY['balance'], ARRAY['fixture'],
             10, 'medium', 'unity_webgl', CURRENT_TIMESTAMP)`,
    fixtureIds.gameContent,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "rehab_plan"
       ("id", "patientId", "doctorId", "planName", "status", "weekFrequency",
        "dailyDuration", "recommendationReason", "updatedAt")
     VALUES ($1, $2, $3, '迁移验证计划', 'ended', 3, 20, '用于验证敏感数据迁移', CURRENT_TIMESTAMP)`,
    fixtureIds.rehabPlan,
    fixtureIds.patientProfile,
    fixtureIds.doctorProfile,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "rehab_plan_item"
       ("id", "rehabPlanId", "gameContentId", "sequence", "durationMinutes",
        "frequencyPerWeek", "difficulty")
     VALUES ($1, $2, $3, 1, 10, 3, 'medium')`,
    fixtureIds.rehabPlanItem,
    fixtureIds.rehabPlan,
    fixtureIds.gameContent,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "training_session"
       ("id", "patientId", "rehabPlanId", "planItemId", "gameContentId",
        "createdByUserId", "sessionStatus", "syncStatus", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'synced', CURRENT_TIMESTAMP)`,
    fixtureIds.trainingSession,
    fixtureIds.patientProfile,
    fixtureIds.rehabPlan,
    fixtureIds.rehabPlanItem,
    fixtureIds.gameContent,
    fixtureIds.doctorUser,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "training_result"
       ("id", "sessionId", "source", "gameRunId", "gameVersion",
        "bridgeProtocolVersion", "rawPayloadHash", "score", "completionRate",
        "durationSeconds", "reactionTimeMs", "motionAccuracy", "exerciseIntensity",
        "reviewStatus", "reviewConclusion", "reviewNote")
     VALUES ($1, $2, 'unity_webgl', 'migration-run', '1.0.0', '1.0.0',
             'fixture-payload-hash', 88, 0.95, 600, 420, 0.9, 'moderate',
             'reviewed', 'pass', '训练结果符合预期')`,
    fixtureIds.trainingResult,
    fixtureIds.trainingSession,
  );
}

function assertPostgresCode(expectedCode) {
  return (error) => {
    assert.equal(error?.meta?.code, expectedCode, String(error));
    return true;
  };
}

async function waitForAdvisoryLock(client, granted) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [row] = await client.$queryRawUnsafe(
      `SELECT EXISTS (
         SELECT 1 FROM pg_locks
         WHERE locktype = 'advisory'
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
           AND classid = 0
           AND objid::bigint = $1
           AND granted = $2
       ) AS "present"`,
      advisoryLockId,
      granted,
    );
    if (row.present) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(
    `Timed out waiting for ${granted ? "granted" : "waiting"} sensitive backfill advisory lock`,
  );
}

async function waitForUserTableLock(client) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [row] = await client.$queryRawUnsafe(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_locks lock
         JOIN pg_class relation ON relation.oid = lock.relation
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE lock.locktype = 'relation'
           AND lock.mode = 'ShareRowExclusiveLock'
           AND lock.granted
           AND namespace.nspname = current_schema()
           AND relation.relname = 'user'
       ) AS "present"`,
    );
    if (row.present) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error("Timed out waiting for sensitive backfill user table lock");
}

async function waitForBackendLock(client, backendPid) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [row] = await client.$queryRawUnsafe(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE pid = $1 AND wait_event_type = 'Lock'
       ) AS "present"`,
      backendPid,
    );
    if (row.present) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`Timed out waiting for backend ${backendPid} table lock`);
}

function phoneLookup(phone) {
  return createHmac("sha256", encryptionKey)
    .update(`+86${phone}`, "utf8")
    .digest("hex");
}

test("offline backfill rolls back a prior update and serializes concurrent PostgreSQL commands", async () => {
  const baseUrl = requirePostgresUrl(disposableDatabaseUrl).toString();
  const schemaName = `sensitive_backfill_${process.pid}_${randomBytes(6).toString("hex")}`;
  assert.match(schemaName, /^[a-z0-9_]+$/);
  const databaseUrl = withSchema(baseUrl, schemaName);
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  let client;
  let dmlClient;

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    applyPreAdditiveMigrations(databaseUrl);
    runMigration(databaseUrl, additiveMigrationName);
    client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    dmlClient = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    const duplicateLookup = "duplicate-user-mobile-lookup";
    await client.$executeRawUnsafe(
      `INSERT INTO "user"
          ("id", "account", "passwordHash", "mobilePhoneLookup", "updatedAt")
         VALUES
          ('018f5f71-3b9a-7f52-8a20-2d6f30b4e001', 'lookup-unique-a',
           'not-a-real-credential', $1, CURRENT_TIMESTAMP)`,
      duplicateLookup,
    );
    await assert.rejects(
      client.$executeRawUnsafe(
        `INSERT INTO "user"
            ("id", "account", "passwordHash", "mobilePhoneLookup", "updatedAt")
           VALUES
            ('018f5f71-3b9a-7f52-8a20-2d6f30b4e002', 'lookup-unique-b',
             'not-a-real-credential', $1, CURRENT_TIMESTAMP)`,
        duplicateLookup,
      ),
      assertPostgresCode("23505"),
    );
    await client.$executeRawUnsafe(
      `DELETE FROM "user" WHERE "account" LIKE 'lookup-unique-%'`,
    );

    const duplicateRequestLookup = "duplicate-request-mobile-lookup";
    await client.$executeRawUnsafe(
      `INSERT INTO "registration_request"
          ("id", "requestedRole", "account", "initialPasswordHash",
           "credentialExpiresAt", "mobilePhoneLookup", "updatedAt")
         VALUES
          ('018f5f71-3b9a-7f52-8a20-2d6f30b4e003', 'caregiver',
           'request-lookup-a', 'not-a-real-credential',
           '2099-01-01T00:00:00.000Z', $1, CURRENT_TIMESTAMP),
          ('018f5f71-3b9a-7f52-8a20-2d6f30b4e004', 'caregiver',
           'request-lookup-b', 'not-a-real-credential',
           '2099-01-01T00:00:00.000Z', $1, CURRENT_TIMESTAMP)`,
      duplicateRequestLookup,
    );
    const [requestLookupCount] = await client.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count" FROM "registration_request"
         WHERE "mobilePhoneLookup" = $1`,
      duplicateRequestLookup,
    );
    assert.equal(requestLookupCount.count, 2);
    await client.$executeRawUnsafe(
      `DELETE FROM "registration_request" WHERE "mobilePhoneLookup" = $1`,
      duplicateRequestLookup,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "user"
          ("id", "account", "mobilePhone", "passwordHash", "displayName", "identityEnvelope", "updatedAt")
        VALUES
          ($1, 'backfill-user-a', '13800138000', 'not-a-real-credential', '患者甲', NULL, CURRENT_TIMESTAMP),
          ($2, 'backfill-user-b', '13900139000', 'not-a-real-credential', '患者乙', NULL, CURRENT_TIMESTAMP)`,
      firstUserId,
      secondUserId,
    );

    await client.$executeRawUnsafe(
      `CREATE FUNCTION "${schemaName}"."reject_second_sensitive_update"()
         RETURNS trigger AS $$
         BEGIN
           IF NEW."id" = '${secondUserId}' THEN
             RAISE EXCEPTION 'forced second user update failure';
           END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
    );
    await client.$executeRawUnsafe(
      `CREATE TRIGGER "reject_second_sensitive_update"
         BEFORE UPDATE ON "user"
         FOR EACH ROW EXECUTE FUNCTION "${schemaName}"."reject_second_sensitive_update"()`,
    );

    const rejected = runPnpm(
      ["db:sensitive:backfill"],
      { DATABASE_URL: databaseUrl, ...keyEnvironment },
      1,
    );
    assert.match(rejected.stderr, /forced second user update failure/i);
    const afterRejected = await client.$queryRawUnsafe(
      `SELECT "id", "displayName", "identityEnvelope"
         FROM "user" WHERE "id" IN ($1, $2) ORDER BY "id"`,
      firstUserId,
      secondUserId,
    );
    assert.deepEqual(afterRejected, [
      {
        id: firstUserId,
        displayName: "患者甲",
        identityEnvelope: null,
      },
      {
        id: secondUserId,
        displayName: "患者乙",
        identityEnvelope: null,
      },
    ]);

    await client.$executeRawUnsafe(
      `DROP TRIGGER "reject_second_sensitive_update" ON "user"`,
    );
    await client.$executeRawUnsafe(
      `DROP FUNCTION "${schemaName}"."reject_second_sensitive_update"()`,
    );
    await client.$executeRawUnsafe(
      `CREATE FUNCTION "${schemaName}"."delay_sensitive_update"()
         RETURNS trigger AS $$
         BEGIN
           PERFORM pg_sleep(2);
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
    );
    await client.$executeRawUnsafe(
      `CREATE TRIGGER "delay_sensitive_update"
         BEFORE UPDATE ON "user"
         FOR EACH ROW EXECUTE FUNCTION "${schemaName}"."delay_sensitive_update"()`,
    );

    const firstBackfill = startPnpm(["db:sensitive:backfill"], {
      DATABASE_URL: databaseUrl,
      ...keyEnvironment,
    });
    await waitForAdvisoryLock(client, true);
    await waitForUserTableLock(client);

    let resolveDmlBackendPid;
    const dmlBackendPid = new Promise((resolvePromise) => {
      resolveDmlBackendPid = resolvePromise;
    });
    const ordinaryInsert = dmlClient.$transaction(
      async (transaction) => {
        const [backend] = await transaction.$queryRawUnsafe(
          `SELECT pg_backend_pid()::int AS "pid"`,
        );
        resolveDmlBackendPid(backend.pid);
        await transaction.$executeRawUnsafe(
          `INSERT INTO "user"
              ("id", "account", "mobilePhone", "passwordHash", "displayName", "identityEnvelope", "updatedAt")
             VALUES
              ($1, 'concurrent-ordinary-insert', NULL, 'not-a-real-credential', '并发新增患者', NULL, CURRENT_TIMESTAMP)`,
          concurrentUserId,
        );
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    await waitForBackendLock(client, await dmlBackendPid);

    const secondBackfill = startPnpm(["db:sensitive:backfill"], {
      DATABASE_URL: databaseUrl,
      ...keyEnvironment,
    });
    await waitForAdvisoryLock(client, false);
    const [migrated, , validated] = await Promise.all([
      firstBackfill.completed,
      ordinaryInsert,
      secondBackfill.completed,
    ]);
    assert.equal(migrated.status, 0, migrated.stderr);
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(
      migrated.stdout,
      /\{"scannedRows":2,"migratedRows":2,"validatedRows":0\}/,
    );
    assert.match(
      validated.stdout,
      /\{"scannedRows":3,"migratedRows":1,"validatedRows":2\}/,
    );

    await client.$executeRawUnsafe(
      `DROP TRIGGER "delay_sensitive_update" ON "user"`,
    );
    await client.$executeRawUnsafe(
      `DROP FUNCTION "${schemaName}"."delay_sensitive_update"()`,
    );

    const rows = await client.$queryRawUnsafe(
      `SELECT "id", "displayName", "mobilePhone", "identityEnvelope", "mobilePhoneLookup"
         FROM "user" WHERE "id" IN ($1, $2) ORDER BY "id"`,
      firstUserId,
      secondUserId,
    );
    assert.equal(rows.length, 2);
    for (const [index, row] of rows.entries()) {
      const expectedId = index === 0 ? firstUserId : secondUserId;
      const expectedPhone = index === 0 ? "13800138000" : "13900139000";
      assert.equal(row.id, expectedId);
      assert.equal(row.displayName, null);
      assert.equal(row.mobilePhone, null);
      assert.equal(row.mobilePhoneLookup, phoneLookup(expectedPhone));
      assert.equal(
        row.identityEnvelope.kid,
        keyEnvironment.SENSITIVE_DATA_KEY_REF,
      );
      assert.deepEqual(row.identityEnvelope.aad, {
        tableName: "user",
        recordId: expectedId,
        fieldName: "identityEnvelope",
      });
      assert.doesNotMatch(
        JSON.stringify(row.identityEnvelope),
        /患者甲|患者乙|13800138000|13900139000/,
      );
    }

    await client.$executeRawUnsafe(
      `INSERT INTO "user"
          ("id", "account", "mobilePhone", "passwordHash", "displayName", "identityEnvelope", "updatedAt")
         SELECT
          '018f5f71-3b9a-7f52-8a9e-' || lpad(to_hex(series), 12, '0'),
          'backfill-batch-' || series,
          NULL,
          'not-a-real-credential',
          'batch-patient-' || series,
          NULL,
          CURRENT_TIMESTAMP
         FROM generate_series(1, 101) AS series`,
    );
    const batched = runPnpm(
      ["db:sensitive:backfill"],
      { DATABASE_URL: databaseUrl, ...keyEnvironment },
      0,
    );
    assert.match(
      batched.stdout,
      /\{"scannedRows":104,"migratedRows":101,"validatedRows":3\}/,
    );
    const [batchInspection] = await client.$queryRawUnsafe(
      `SELECT
           COUNT(*)::int AS "rows",
           COUNT(*) FILTER (
             WHERE "displayName" IS NULL
               AND "identityEnvelope" IS NOT NULL
           )::int AS "migratedRows"
         FROM "user"
         WHERE "account" LIKE 'backfill-batch-%'`,
    );
    assert.deepEqual(batchInspection, { rows: 101, migratedRows: 101 });
  } finally {
    await dmlClient?.$disconnect();
    await client?.$disconnect();
    await admin.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
    );
    await admin.$disconnect();
  }
});

test("populated PostgreSQL chain encrypts every legacy field before final constraints", async () => {
  const baseUrl = requirePostgresUrl(disposableDatabaseUrl).toString();
  const schemaName = `sensitive_finalize_${process.pid}_${randomBytes(6).toString("hex")}`;
  assert.match(schemaName, /^[a-z0-9_]+$/);
  const databaseUrl = withSchema(baseUrl, schemaName);
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  const rowIds = {
    user: fixtureIds.doctorUser,
    patient_profile: fixtureIds.patientProfile,
    registration_request: fixtureIds.registrationRequest,
    care_circle_post: fixtureIds.carePost,
    care_circle_comment: fixtureIds.careComment,
    care_precaution: fixtureIds.carePrecaution,
    assessment_record: fixtureIds.assessmentRecord,
    risk_grade_record: fixtureIds.riskGradeRecord,
    ai_analysis_record: fixtureIds.aiAnalysisRecord,
    ai_conversation_session: fixtureIds.conversationSession,
    ai_conversation_message: fixtureIds.conversationMessage,
    training_result: fixtureIds.trainingResult,
  };

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    applyPreAdditiveMigrations(databaseUrl);
    await insertPopulatedLegacyFixture(client);

    runMigration(databaseUrl, additiveMigrationName);
    const backfill = runPnpm(
      ["db:sensitive:backfill"],
      { DATABASE_URL: databaseUrl, ...keyEnvironment },
      0,
    );
    assert.match(
      backfill.stdout,
      /\{"scannedRows":13,"migratedRows":13,"validatedRows":0\}/,
    );
    runMigration(databaseUrl, rolloutMigrationName);
    runMigration(databaseUrl, finalMigrationName);

    const expectedPayloads = [
      [
        "user",
        fixtureIds.doctorUser,
        "identityEnvelope",
        { displayName: "迁移医生", mobilePhone: "13700137000" },
      ],
      [
        "user",
        fixtureIds.patientUser,
        "identityEnvelope",
        { displayName: "迁移患者", mobilePhone: "13800138000" },
      ],
      [
        "patient_profile",
        fixtureIds.patientProfile,
        "identityEnvelope",
        { name: "迁移患者档案", gender: "female", age: 68 },
      ],
      [
        "patient_profile",
        fixtureIds.patientProfile,
        "contactEnvelope",
        {
          mobilePhone: "13800138000",
          caregiverName: "迁移照护者",
          caregiverPhone: "13900139000",
        },
      ],
      [
        "patient_profile",
        fixtureIds.patientProfile,
        "careDetailsEnvelope",
        { healthMetrics: { bloodPressure: "120/80", falls: 1 } },
      ],
      [
        "registration_request",
        fixtureIds.registrationRequest,
        "identityEnvelope",
        {
          displayName: "迁移申请人",
          mobilePhone: "13600136000",
          profileSnapshot: { relation: "daughter", age: 42 },
        },
      ],
      [
        "registration_request",
        fixtureIds.registrationRequest,
        "reviewEnvelope",
        { reviewNote: "材料需要补充" },
      ],
      [
        "assessment_record",
        fixtureIds.assessmentRecord,
        "resultEnvelope",
        {
          scoreSummary: { score: 73, grade: "moderate" },
          rawInputSummary: {
            answers: [1, 2, 3],
            device: "clinic-tablet",
          },
        },
      ],
      [
        "risk_grade_record",
        fixtureIds.riskGradeRecord,
        "reasonEnvelope",
        { reasonSummary: "平衡能力下降并有跌倒史" },
      ],
      [
        "ai_analysis_record",
        fixtureIds.aiAnalysisRecord,
        "inputEnvelope",
        { inputSummary: { features: ["balance", "falls"] } },
      ],
      [
        "ai_analysis_record",
        fixtureIds.aiAnalysisRecord,
        "outputEnvelope",
        {
          outputSummary: {
            risk: "moderate",
            actions: ["supervision"],
          },
        },
      ],
      [
        "ai_conversation_session",
        fixtureIds.conversationSession,
        "summaryEnvelope",
        { summary: "对话总结" },
      ],
      [
        "ai_conversation_session",
        fixtureIds.conversationSession,
        "reviewEnvelope",
        { reviewNote: "人工复核通过" },
      ],
      [
        "ai_conversation_message",
        fixtureIds.conversationMessage,
        "contentEnvelope",
        {
          content: "请在训练时保持照护者陪同",
          contentSnapshot: {
            text: "请在训练时保持照护者陪同",
            locale: "zh-CN",
          },
          evidenceMetadata: {
            assessmentId: fixtureIds.assessmentRecord,
          },
        },
      ],
      [
        "care_circle_post",
        fixtureIds.carePost,
        "contentEnvelope",
        {
          body: "今天完成了全部训练",
          mood: "encouraged",
          privateMetadata: {
            audience: "care-team",
            source: "patient",
          },
        },
      ],
      [
        "care_circle_post",
        fixtureIds.carePost,
        "moderationEnvelope",
        { moderationReason: "已人工确认内容" },
      ],
      [
        "care_circle_comment",
        fixtureIds.careComment,
        "contentEnvelope",
        { body: "训练完成度很好", privateMetadata: { clinical: true } },
      ],
      [
        "care_precaution",
        fixtureIds.carePrecaution,
        "contentEnvelope",
        {
          title: "防跌倒提醒",
          content: "训练期间需有人陪同并清理地面障碍物",
        },
      ],
      [
        "training_result",
        fixtureIds.trainingResult,
        "reviewEnvelope",
        { reviewNote: "训练结果符合预期" },
      ],
    ];

    for (const [
      tableName,
      recordId,
      fieldName,
      expectedPayload,
    ] of expectedPayloads) {
      const [row] = await client.$queryRawUnsafe(
        `SELECT "${fieldName}" AS "envelope" FROM "${tableName}" WHERE "id" = $1`,
        recordId,
      );
      assert.deepEqual(
        decryptEnvelope(row.envelope, tableName, recordId, fieldName),
        expectedPayload,
        `${tableName}.${fieldName} decrypted payload`,
      );
    }

    const [conversation] = await client.$queryRawUnsafe(
      `SELECT "metadata" FROM "ai_conversation_session" WHERE "id" = $1`,
      fixtureIds.conversationSession,
    );
    assert.deepEqual(conversation.metadata, {
      keep: "preserved",
      turnCount: 3,
    });

    for (const [tableName, columns] of Object.entries(legacyColumns)) {
      const [physicalColumns, nonNullLegacy] = await Promise.all([
        client.$queryRawUnsafe(
          `SELECT "column_name" AS "columnName"
             FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = $1
               AND column_name = ANY($2::text[])
             ORDER BY "column_name"`,
          tableName,
          columns,
        ),
        client.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS "count" FROM "${tableName}"
             WHERE ${columns.map((column) => `"${column}" IS NOT NULL`).join(" OR ")}`,
        ),
      ]);
      assert.deepEqual(
        physicalColumns.map((row) => row.columnName),
        [...columns].sort(),
        `${tableName} legacy physical columns`,
      );
      assert.equal(nonNullLegacy[0].count, 0, `${tableName} legacy values`);
    }

    for (const [tableName, columns] of Object.entries(requiredEnvelopes)) {
      const rows = await client.$queryRawUnsafe(
        `SELECT "column_name" AS "columnName", "is_nullable" AS "isNullable"
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = $1
             AND column_name = ANY($2::text[])
           ORDER BY "column_name"`,
        tableName,
        columns,
      );
      assert.deepEqual(
        rows,
        [...columns]
          .sort()
          .map((columnName) => ({ columnName, isNullable: "NO" })),
      );
      for (const column of columns) {
        await assert.rejects(
          client.$executeRawUnsafe(
            `UPDATE "${tableName}" SET "${column}" = NULL WHERE "id" = $1`,
            rowIds[tableName],
          ),
          assertPostgresCode("23502"),
        );
      }
    }

    for (const [tableName, columns] of Object.entries(optionalEnvelopes)) {
      const rows = await client.$queryRawUnsafe(
        `SELECT "column_name" AS "columnName", "is_nullable" AS "isNullable"
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = $1
             AND column_name = ANY($2::text[])
           ORDER BY "column_name"`,
        tableName,
        columns,
      );
      assert.deepEqual(
        rows,
        [...columns]
          .sort()
          .map((columnName) => ({ columnName, isNullable: "YES" })),
      );
      await client.$executeRawUnsafe(
        `UPDATE "${tableName}" SET ${columns
          .map((column) => `"${column}" = NULL`)
          .join(", ")} WHERE "id" = $1`,
        rowIds[tableName],
      );
    }

    const legacyConstraintProbes = {
      user: "\"displayName\" = 'plaintext'",
      patient_profile: "\"name\" = 'plaintext'",
      registration_request: "\"displayName\" = 'plaintext'",
      care_circle_post: "\"body\" = 'plaintext'",
      care_circle_comment: "\"body\" = 'plaintext'",
      care_precaution: "\"title\" = 'plaintext'",
      assessment_record: "\"scoreSummary\" = '{}'::jsonb",
      risk_grade_record: "\"reasonSummary\" = 'plaintext'",
      ai_analysis_record: "\"inputSummary\" = '{}'::jsonb",
      ai_conversation_session: "\"summary\" = 'plaintext'",
      ai_conversation_message: "\"content\" = 'plaintext'",
      training_result: "\"reviewNote\" = 'plaintext'",
    };
    for (const [tableName, assignment] of Object.entries(
      legacyConstraintProbes,
    )) {
      await assert.rejects(
        client.$executeRawUnsafe(
          `UPDATE "${tableName}" SET ${assignment} WHERE "id" = $1`,
          rowIds[tableName],
        ),
        assertPostgresCode("23514"),
      );
    }

    const indexRows = await client.$queryRawUnsafe(
      `SELECT "indexname", "indexdef"
         FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = ANY($1::text[])
         ORDER BY "indexname"`,
      [
        "registration_request_mobilePhoneLookup_idx",
        "registration_request_one_pending_mobile",
        "registration_request_one_pending_mobile_lookup",
        "registration_request_mobilePhone_reviewStatus_idx",
        "user_mobilePhoneLookup_key",
        "user_mobilePhone_key",
      ],
    );
    assert.deepEqual(
      indexRows.map((row) => row.indexname),
      [
        "registration_request_mobilePhoneLookup_idx",
        "registration_request_one_pending_mobile_lookup",
        "user_mobilePhoneLookup_key",
      ],
    );
    assert.doesNotMatch(indexRows[0].indexdef, /UNIQUE/);
    assert.match(indexRows[1].indexdef, /CREATE UNIQUE INDEX/);
    assert.match(
      indexRows[1].indexdef,
      /WHERE \(\("reviewStatus" = 'pending'::"RegistrationReviewStatus"\) AND \("mobilePhoneLookup" IS NOT NULL\)\)/,
    );
    assert.match(indexRows[2].indexdef, /CREATE UNIQUE INDEX/);
    await assert.rejects(
      client.$executeRawUnsafe(
        `UPDATE "user" SET "mobilePhoneLookup" = $1 WHERE "id" = $2`,
        phoneLookup("13800138000"),
        fixtureIds.doctorUser,
      ),
      assertPostgresCode("23505"),
    );
  } finally {
    await client.$disconnect();
    await admin.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
    );
    await admin.$disconnect();
  }
});
