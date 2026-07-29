import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(prismaDirectory, "schema.prisma");
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260714090000_sensitive_encryption_envelopes/migration.sql",
);

const expectedSensitiveSchemaFields = [
  "AiAnalysisRecord.inputEnvelope Json",
  "AiAnalysisRecord.outputEnvelope Json",
  "AiConversationMessage.contentEnvelope Json",
  "AiConversationSession.reviewEnvelope Json?",
  "AiConversationSession.summaryEnvelope Json?",
  "AssessmentRecord.resultEnvelope Json",
  "CareCircleComment.contentEnvelope Json",
  "CareCirclePost.contentEnvelope Json",
  "CareCirclePost.moderationEnvelope Json?",
  "CarePrecaution.contentEnvelope Json",
  "PatientProfile.careDetailsEnvelope Json",
  "PatientProfile.contactEnvelope Json?",
  "PatientProfile.identityEnvelope Json",
  "RegistrationRequest.identityEnvelope Json",
  "RegistrationRequest.mobilePhoneLookup String?",
  "RegistrationRequest.reviewEnvelope Json?",
  "RiskGradeRecord.reasonEnvelope Json",
  "TrainingResult.reviewEnvelope Json?",
  "User.identityEnvelope Json",
  "User.mobilePhoneLookup String? @unique",
].sort();

const expectedRemovedLegacySchemaFields = {
  User: {
    displayName: true,
    mobilePhone: true,
  },
  PatientProfile: {
    name: true,
    gender: true,
    age: true,
    mobilePhone: true,
    caregiverName: true,
    caregiverPhone: true,
    healthMetrics: true,
  },
  RegistrationRequest: {
    displayName: true,
    mobilePhone: true,
    profileSnapshot: true,
    reviewNote: true,
  },
  CareCirclePost: {
    body: true,
    mood: true,
    privateMetadata: true,
    moderationReason: true,
  },
  CareCircleComment: {
    body: true,
    privateMetadata: true,
  },
  CarePrecaution: {
    title: true,
    content: true,
  },
  AssessmentRecord: {
    scoreSummary: true,
    rawInputSummary: true,
  },
  RiskGradeRecord: {
    reasonSummary: true,
  },
  AiAnalysisRecord: {
    inputSummary: true,
    outputSummary: true,
  },
  AiConversationSession: {
    summary: true,
    reviewNote: true,
  },
  AiConversationMessage: {
    content: true,
    contentSnapshot: true,
    evidenceMetadata: true,
  },
  TrainingResult: {
    reviewNote: true,
  },
};

const expectedPhysicalTableByModel = {
  User: "user",
  PatientProfile: "patient_profile",
  RegistrationRequest: "registration_request",
  AssessmentRecord: "assessment_record",
  RiskGradeRecord: "risk_grade_record",
  AiAnalysisRecord: "ai_analysis_record",
  AiConversationSession: "ai_conversation_session",
  AiConversationMessage: "ai_conversation_message",
  CareCirclePost: "care_circle_post",
  CareCircleComment: "care_circle_comment",
  CarePrecaution: "care_precaution",
  TrainingResult: "training_result",
};

const expectedAddColumnStatements = [
  `ALTER TABLE "user"
    ADD COLUMN "identityEnvelope" JSONB,
    ADD COLUMN "mobilePhoneLookup" TEXT`,
  `ALTER TABLE "patient_profile"
    ADD COLUMN "identityEnvelope" JSONB,
    ADD COLUMN "contactEnvelope" JSONB,
    ADD COLUMN "careDetailsEnvelope" JSONB`,
  `ALTER TABLE "registration_request"
    ADD COLUMN "identityEnvelope" JSONB,
    ADD COLUMN "reviewEnvelope" JSONB,
    ADD COLUMN "mobilePhoneLookup" TEXT`,
  `ALTER TABLE "assessment_record"
    ADD COLUMN "resultEnvelope" JSONB`,
  `ALTER TABLE "risk_grade_record"
    ADD COLUMN "reasonEnvelope" JSONB`,
  `ALTER TABLE "ai_analysis_record"
    ADD COLUMN "inputEnvelope" JSONB,
    ADD COLUMN "outputEnvelope" JSONB`,
  `ALTER TABLE "ai_conversation_session"
    ADD COLUMN "summaryEnvelope" JSONB,
    ADD COLUMN "reviewEnvelope" JSONB`,
  `ALTER TABLE "ai_conversation_message"
    ADD COLUMN "contentEnvelope" JSONB`,
  `ALTER TABLE "care_circle_post"
    ADD COLUMN "contentEnvelope" JSONB,
    ADD COLUMN "moderationEnvelope" JSONB`,
  `ALTER TABLE "care_circle_comment"
    ADD COLUMN "contentEnvelope" JSONB`,
  `ALTER TABLE "care_precaution"
    ADD COLUMN "contentEnvelope" JSONB`,
  `ALTER TABLE "training_result"
    ADD COLUMN "reviewEnvelope" JSONB`,
];

const requiredLegacyPlaintextColumnsByTable = {
  user: ["displayName"],
  patient_profile: ["name", "gender", "age", "healthMetrics"],
  registration_request: ["displayName", "profileSnapshot"],
  assessment_record: ["scoreSummary", "rawInputSummary"],
  risk_grade_record: ["reasonSummary"],
  ai_analysis_record: ["inputSummary", "outputSummary"],
  ai_conversation_message: ["content", "contentSnapshot", "evidenceMetadata"],
  care_circle_post: ["body", "privateMetadata"],
  care_circle_comment: ["body", "privateMetadata"],
  care_precaution: ["title", "content"],
};

const legacyJsonColumnsWithDefaultsByTable = {
  patient_profile: ["healthMetrics"],
  registration_request: ["profileSnapshot"],
  assessment_record: ["scoreSummary", "rawInputSummary"],
  ai_analysis_record: ["inputSummary", "outputSummary"],
  ai_conversation_message: ["contentSnapshot", "evidenceMetadata"],
  care_circle_post: ["privateMetadata"],
  care_circle_comment: ["privateMetadata"],
};

const expectedDropNotNullStatements = Object.entries(
  requiredLegacyPlaintextColumnsByTable,
).flatMap(([tableName, columnNames]) =>
  columnNames.map(
    (columnName) =>
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP NOT NULL`,
  ),
);

const expectedDropDefaultStatements = Object.entries(
  legacyJsonColumnsWithDefaultsByTable,
).flatMap(([tableName, columnNames]) =>
  columnNames.map(
    (columnName) =>
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP DEFAULT`,
  ),
);

const expectedIndexStatements = [
  `CREATE UNIQUE INDEX "user_mobilePhoneLookup_key" ON "user"("mobilePhoneLookup")`,
  `CREATE INDEX "registration_request_mobilePhoneLookup_idx" ON "registration_request"("mobilePhoneLookup")`,
];

async function readRequired(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    assert.fail(`${label} must exist: ${error.message}`);
  }
}

function modelBlock(schema, modelName) {
  const block = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  )?.[0];
  assert.ok(block, `Prisma model ${modelName} must exist`);
  return block;
}

function extractSensitiveSchemaFields(schema) {
  const fields = [];
  const modelPattern = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;

  for (const modelMatch of schema.matchAll(modelPattern)) {
    const [, modelName, body] = modelMatch;
    for (const line of body.split("\n")) {
      const fieldMatch = line.match(
        /^\s*(\w+Envelope|mobilePhoneLookup)\s+(\S+)(?:\s+.*)?$/,
      );
      if (fieldMatch) {
        fields.push(`${modelName}.${line.trim().replace(/\s+/g, " ")}`);
      }
    }
  }

  return fields.sort();
}

function assertExactSensitiveSchemaFields(schema) {
  assert.deepEqual(
    extractSensitiveSchemaFields(schema),
    expectedSensitiveSchemaFields,
  );
}

function assertRemovedLegacySchemaFields(schema) {
  for (const [modelName, fields] of Object.entries(
    expectedRemovedLegacySchemaFields,
  )) {
    const block = modelBlock(schema, modelName);
    for (const fieldName of Object.keys(fields)) {
      assert.doesNotMatch(
        block,
        new RegExp(`^[ \\t]*${fieldName}[ \\t]+\\S+(?:[ \\t]+.*)?$`, "m"),
        `${modelName}.${fieldName} must be absent after the final migration`,
      );
    }
  }
}

function assertExactTargetPhysicalTables(schema) {
  for (const [modelName, expectedTableName] of Object.entries(
    expectedPhysicalTableByModel,
  )) {
    const block = modelBlock(schema, modelName);
    const mapDeclarations = [...block.matchAll(/^\s*@@map\("([^"]+)"\)\s*$/gm)];
    assert.equal(
      mapDeclarations.length,
      1,
      `${modelName} must have exactly one plain @@map declaration`,
    );
    assert.equal(
      mapDeclarations[0][1],
      expectedTableName,
      `${modelName} must map to ${expectedTableName}`,
    );
  }
}

function assertExactSensitiveSchemaContract(schema) {
  assertExactSensitiveSchemaFields(schema);
  assertRemovedLegacySchemaFields(schema);
  assertExactTargetPhysicalTables(schema);
}

function normalizeSqlStatement(statement) {
  return statement.replace(/\s+/g, " ").trim();
}

function splitCompleteSqlStatements(sql) {
  const fragments = sql.split(";");
  assert.equal(
    fragments.at(-1)?.trim(),
    "",
    "migration must terminate every SQL statement with a semicolon",
  );

  const statements = fragments.slice(0, -1);
  assert.ok(
    statements.every((statement) => statement.trim().length > 0),
    "migration must not contain empty SQL statements",
  );
  return statements.map(normalizeSqlStatement);
}

function assertExactMigrationStatements(sql) {
  const expectedStatements = [
    "BEGIN",
    ...expectedAddColumnStatements,
    ...expectedDropNotNullStatements,
    ...expectedDropDefaultStatements,
    ...expectedIndexStatements,
    "COMMIT",
  ].map(normalizeSqlStatement);
  assert.deepEqual(splitCompleteSqlStatements(sql), expectedStatements);
}

test("Prisma schema has the exact complete envelope and lookup field set", async () => {
  const schema = await readRequired(schemaPath, "Prisma schema");
  assertExactSensitiveSchemaContract(schema);

  const user = modelBlock(schema, "User");
  assert.match(
    user,
    /^\s*mobilePhoneLookup\s+String\?\s+@unique\s*$/m,
    "User.mobilePhoneLookup must be unique",
  );
  assert.doesNotMatch(
    user,
    /^\s*@@index\(\[mobilePhoneLookup\]\)\s*$/m,
    "User.mobilePhoneLookup must not retain a redundant ordinary index",
  );

  const registrationRequest = modelBlock(schema, "RegistrationRequest");
  assert.match(
    registrationRequest,
    /^\s*mobilePhoneLookup\s+String\?\s*$/m,
    "RegistrationRequest.mobilePhoneLookup must remain non-unique",
  );
  assert.match(
    registrationRequest,
    /^\s*@@index\(\[mobilePhoneLookup\]\)\s*$/m,
    "RegistrationRequest.mobilePhoneLookup must retain its ordinary index",
  );
});

test("schema contract rejects sensitive declaration and physical map mutations", async (context) => {
  const schema = await readRequired(schemaPath, "Prisma schema");
  const mutations = {
    "missing User lookup uniqueness": schema.replace(
      /^(\s*mobilePhoneLookup\s+String\?)\s+@unique\s*$/m,
      "$1",
    ),
    "RegistrationRequest lookup made unique": schema.replace(
      /(model RegistrationRequest \{[\s\S]*?^\s*mobilePhoneLookup\s+String\?)\s*$/m,
      "$1 @unique",
    ),
    "additional envelope field": schema.replace(
      /^(\s*identityEnvelope\s+Json\s*)$/m,
      "$1\n  unexpectedEnvelope Json?",
    ),
    "field @map attribute": schema.replace(
      /^(\s*identityEnvelope\s+Json)\s*$/m,
      '$1 @map("identity_envelope")',
    ),
    "model @@map physical table": schema.replace(
      '@@map("user")',
      '@@map("user_mutation")',
    ),
  };

  for (const [label, mutatedSchema] of Object.entries(mutations)) {
    await context.test(label, () => {
      assert.notEqual(
        mutatedSchema,
        schema,
        `${label} mutation must be applied`,
      );
      assert.throws(() => assertExactSensitiveSchemaContract(mutatedSchema), {
        name: "AssertionError",
      });
    });
  }
});

test("migration contains only the exact additive statements", async () => {
  const sql = await readRequired(
    migrationPath,
    "Sensitive encryption migration",
  );
  assertExactMigrationStatements(sql);

  const addColumnTableNames = splitCompleteSqlStatements(sql)
    .filter((statement) => statement.includes(" ADD COLUMN "))
    .map((statement) => statement.match(/^ALTER TABLE "([^"]+)"/)?.[1])
    .sort();
  assert.deepEqual(
    addColumnTableNames,
    Object.values(expectedPhysicalTableByModel).sort(),
    "migration table names must match the exact Prisma physical table maps",
  );
});

test("migration rejects missing or nested transaction boundaries", async (context) => {
  const sql = await readRequired(
    migrationPath,
    "Sensitive encryption migration",
  );
  const mutations = {
    "missing BEGIN": sql.replace(/^BEGIN;\s*/, ""),
    "missing COMMIT": sql.replace(/\s*COMMIT;\s*$/, "\n"),
    "nested BEGIN": sql.replace(/^BEGIN;/, "BEGIN;\nBEGIN;"),
    "nested COMMIT": sql.replace(/COMMIT;\s*$/, "COMMIT;\nCOMMIT;"),
  };

  for (const [label, mutatedSql] of Object.entries(mutations)) {
    await context.test(label, () => {
      assert.notEqual(mutatedSql, sql, `${label} mutation must be applied`);
      assert.throws(() => assertExactMigrationStatements(mutatedSql), {
        name: "AssertionError",
      });
    });
  }
});

test("migration allowlist rejects every forbidden full-statement mutation", async (context) => {
  const sql = await readRequired(
    migrationPath,
    "Sensitive encryption migration",
  );
  const mutations = {
    "CREATE TABLE": `CREATE TABLE "unexpected_mutation" ("id" TEXT);`,
    RENAME: `ALTER TABLE "user" RENAME COLUMN "displayName" TO "display_name";`,
    TYPE: `CREATE TYPE "UnexpectedType" AS ENUM ('unexpected');`,
    "other ALTER": `ALTER TABLE "user" ADD COLUMN "unexpectedColumn" TEXT;`,
    "CTE DML": `WITH affected AS (SELECT "id" FROM "user")
      UPDATE "user"
      SET "displayName" = NULL
      WHERE "id" IN (SELECT "id" FROM affected);`,
    "extra statement": `SELECT 1;`,
  };

  for (const [label, mutation] of Object.entries(mutations)) {
    await context.test(label, () => {
      assert.throws(
        () => assertExactMigrationStatements(`${sql}\n${mutation}\n`),
        { name: "AssertionError" },
      );
    });
  }
});
