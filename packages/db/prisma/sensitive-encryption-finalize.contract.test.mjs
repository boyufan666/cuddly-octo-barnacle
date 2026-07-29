import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260714170000_sensitive_encryption_finalize/migration.sql",
);

const requiredEnvelopes = {
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
};

const optionalEnvelopes = {
  patient_profile: ["contactEnvelope"],
  registration_request: ["reviewEnvelope"],
  care_circle_post: ["moderationEnvelope"],
  ai_conversation_session: ["summaryEnvelope", "reviewEnvelope"],
  training_result: ["reviewEnvelope"],
};

const legacyColumns = {
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
};

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function statements(sql) {
  const fragments = sql.split(";");
  assert.equal(fragments.at(-1)?.trim(), "");
  return fragments.slice(0, -1).map(normalize);
}

function alterForTable(sqlStatements, tableName) {
  const statement = sqlStatements.find((candidate) =>
    candidate.startsWith(`ALTER TABLE "${tableName}" `),
  );
  assert.ok(statement, `missing ALTER TABLE for ${tableName}`);
  return statement;
}

test("final migration enforces every required envelope and preserves business optionality", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const sqlStatements = statements(sql);

  assert.equal(sqlStatements[0], "BEGIN");
  assert.equal(sqlStatements.at(-1), "COMMIT");
  assert.equal(sqlStatements.filter((value) => value === "BEGIN").length, 1);
  assert.equal(sqlStatements.filter((value) => value === "COMMIT").length, 1);

  for (const [tableName, fields] of Object.entries(requiredEnvelopes)) {
    const alter = alterForTable(sqlStatements, tableName);
    for (const field of fields) {
      assert.match(
        alter,
        new RegExp(`ALTER COLUMN "${field}" SET NOT NULL`),
        `${tableName}.${field} must be required`,
      );
    }
  }

  for (const [tableName, fields] of Object.entries(optionalEnvelopes)) {
    const alter = alterForTable(sqlStatements, tableName);
    for (const field of fields) {
      assert.doesNotMatch(
        alter,
        new RegExp(`ALTER COLUMN "${field}" SET NOT NULL`),
        `${tableName}.${field} must remain optional`,
      );
    }
  }
});

test("final migration rejects every fixed-scope legacy plaintext column", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const sqlStatements = statements(sql);

  for (const [tableName, fields] of Object.entries(legacyColumns)) {
    const alter = alterForTable(sqlStatements, tableName);
    assert.match(
      alter,
      new RegExp(
        `ADD CONSTRAINT "${tableName}_sensitive_legacy_null" CHECK \\(`,
      ),
    );
    for (const field of fields) {
      assert.match(
        alter,
        new RegExp(`"${field}" IS NULL`),
        `${tableName}.${field} must be constrained null`,
      );
    }
  }
});

test("final migration replaces every obsolete plaintext phone index without data mutation", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const sqlStatements = statements(sql);
  const drops = sqlStatements.filter((statement) =>
    statement.startsWith("DROP "),
  );
  const creates = sqlStatements.filter((statement) =>
    statement.startsWith("CREATE "),
  );

  assert.deepEqual(drops, [
    'DROP INDEX "user_mobilePhone_key"',
    'DROP INDEX "registration_request_mobilePhone_reviewStatus_idx"',
    'DROP INDEX "registration_request_one_pending_mobile"',
  ]);
  assert.deepEqual(creates, [
    'CREATE UNIQUE INDEX "registration_request_one_pending_mobile_lookup" ON "registration_request"("mobilePhoneLookup") WHERE "reviewStatus" = \'pending\' AND "mobilePhoneLookup" IS NOT NULL',
  ]);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /DROP\s+(?:COLUMN|TABLE|CONSTRAINT)\b/i);
  assert.doesNotMatch(
    sql,
    /\b(?:COALESCE|DEFAULT|retry|fallback|legacy read)\b/i,
  );
});
