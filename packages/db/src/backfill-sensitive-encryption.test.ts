import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  SENSITIVE_BACKFILL_TABLES,
  backfillSensitiveEncryption,
  requireSensitiveBackfillKey,
} from "./backfill-sensitive-encryption";
import {
  createPhoneLookupHmac,
  encryptSensitiveJson,
  type SensitiveEncryptionEnvelope,
  type SensitiveEncryptionKey,
} from "./sensitive-encryption";

const UUID_A = "018f5f71-3b9a-7f52-8a9c-2d6f30b4e001";
const UUID_B = "018f5f71-3b9a-7f52-8a9c-2d6f30b4e002";
const EXPECTED_BATCH_SIZE = 100;
const key: SensitiveEncryptionKey = {
  kid: "sensitive-data-key-2026-07",
  key: Buffer.alloc(32, 7),
};

const expectedTableConfiguration = [
  {
    tableName: "user",
    groups: [
      {
        envelopeField: "identityEnvelope",
        sourceFields: ["displayName", "mobilePhone"],
        requiredSourceFields: ["displayName"],
      },
    ],
    phoneLookup: {
      column: "mobilePhoneLookup",
      envelopeField: "identityEnvelope",
      payloadField: "mobilePhone",
    },
  },
  {
    tableName: "patient_profile",
    groups: [
      {
        envelopeField: "identityEnvelope",
        sourceFields: ["name", "gender", "age"],
        requiredSourceFields: ["name", "gender", "age"],
      },
      {
        envelopeField: "contactEnvelope",
        sourceFields: ["mobilePhone", "caregiverName", "caregiverPhone"],
        requiredSourceFields: [],
      },
      {
        envelopeField: "careDetailsEnvelope",
        sourceFields: ["healthMetrics"],
        requiredSourceFields: ["healthMetrics"],
      },
    ],
  },
  {
    tableName: "registration_request",
    groups: [
      {
        envelopeField: "identityEnvelope",
        sourceFields: ["displayName", "mobilePhone", "profileSnapshot"],
        requiredSourceFields: ["displayName", "profileSnapshot"],
      },
      {
        envelopeField: "reviewEnvelope",
        sourceFields: ["reviewNote"],
        requiredSourceFields: [],
      },
    ],
    phoneLookup: {
      column: "mobilePhoneLookup",
      envelopeField: "identityEnvelope",
      payloadField: "mobilePhone",
    },
  },
  {
    tableName: "care_circle_post",
    groups: [
      {
        envelopeField: "contentEnvelope",
        sourceFields: ["body", "mood", "privateMetadata"],
        requiredSourceFields: ["body", "privateMetadata"],
      },
      {
        envelopeField: "moderationEnvelope",
        sourceFields: ["moderationReason"],
        requiredSourceFields: [],
      },
    ],
  },
  {
    tableName: "care_circle_comment",
    groups: [
      {
        envelopeField: "contentEnvelope",
        sourceFields: ["body", "privateMetadata"],
        requiredSourceFields: ["body", "privateMetadata"],
      },
    ],
  },
  {
    tableName: "care_precaution",
    groups: [
      {
        envelopeField: "contentEnvelope",
        sourceFields: ["title", "content"],
        requiredSourceFields: ["title", "content"],
      },
    ],
  },
  {
    tableName: "assessment_record",
    groups: [
      {
        envelopeField: "resultEnvelope",
        sourceFields: ["scoreSummary", "rawInputSummary"],
        requiredSourceFields: ["scoreSummary", "rawInputSummary"],
      },
    ],
  },
  {
    tableName: "risk_grade_record",
    groups: [
      {
        envelopeField: "reasonEnvelope",
        sourceFields: ["reasonSummary"],
        requiredSourceFields: ["reasonSummary"],
      },
    ],
  },
  {
    tableName: "ai_analysis_record",
    groups: [
      {
        envelopeField: "inputEnvelope",
        sourceFields: ["inputSummary"],
        requiredSourceFields: ["inputSummary"],
      },
      {
        envelopeField: "outputEnvelope",
        sourceFields: ["outputSummary"],
        requiredSourceFields: ["outputSummary"],
      },
    ],
  },
  {
    tableName: "ai_conversation_session",
    groups: [
      {
        envelopeField: "summaryEnvelope",
        sourceFields: ["summary"],
        requiredSourceFields: [],
      },
      {
        envelopeField: "reviewEnvelope",
        sourceFields: ["reviewNote"],
        requiredSourceFields: [],
      },
    ],
  },
  {
    tableName: "ai_conversation_message",
    groups: [
      {
        envelopeField: "contentEnvelope",
        sourceFields: ["content", "contentSnapshot", "evidenceMetadata"],
        requiredSourceFields: [
          "content",
          "contentSnapshot",
          "evidenceMetadata",
        ],
      },
    ],
  },
  {
    tableName: "training_result",
    groups: [
      {
        envelopeField: "reviewEnvelope",
        sourceFields: ["reviewNote"],
        requiredSourceFields: [],
      },
    ],
  },
];

type Row = Record<string, unknown> & { id: string };

type QueryEvent = {
  kind: "query" | "execute" | "lock";
  sql: string;
  values: unknown[];
  resultRowCount?: number;
};

function createPrismaDouble(
  rowsByTable: Record<string, Row[]> = {},
  executeResult: number | ((sql: string, values: unknown[]) => number) = 1,
  queryRows?: (
    tableName: string,
    cursor: string,
    limit: number,
    tableQueryCall: number,
  ) => Row[] | undefined,
) {
  const events: Array<QueryEvent | { kind: "begin" | "commit" | "rollback" }> =
    [];
  let transactionCalls = 0;
  let transactionOptions: unknown;
  const tableQueryCalls = new Map<string, number>();
  const tx = {
    async $queryRawUnsafe(sql: string, ...values: unknown[]) {
      if (sql.includes("pg_advisory_xact_lock")) {
        events.push({ kind: "query" as const, sql, values });
        return [{ pg_advisory_xact_lock: null }];
      }
      const tableName = sql.match(/FROM "([^"]+)"/)?.[1];
      assert.ok(tableName, `unexpected SELECT: ${sql}`);
      const tableRows = rowsByTable[tableName] ?? [];
      const cursor = values[0] as string;
      const limit = values[1] as number;
      const tableQueryCall = (tableQueryCalls.get(tableName) ?? 0) + 1;
      tableQueryCalls.set(tableName, tableQueryCall);
      const overriddenRows = queryRows?.(
        tableName,
        cursor,
        limit,
        tableQueryCall,
      );
      const result =
        overriddenRows ??
        (sql.includes('WHERE "id" > $1')
          ? tableRows
              .filter((row) => row.id > cursor)
              .sort((left, right) => left.id.localeCompare(right.id))
              .slice(0, limit)
          : tableRows);
      events.push({
        kind: "query" as const,
        sql,
        values,
        resultRowCount: result.length,
      });
      return structuredClone(result);
    },
    async $executeRawUnsafe(sql: string, ...values: unknown[]) {
      if (sql.startsWith("LOCK TABLE ")) {
        events.push({ kind: "lock" as const, sql, values });
        return 0;
      }
      events.push({ kind: "execute" as const, sql, values });
      return typeof executeResult === "function"
        ? executeResult(sql, values)
        : executeResult;
    },
  };
  const prisma = {
    async $transaction<T>(
      callback: (transaction: typeof tx) => Promise<T>,
      options?: unknown,
    ) {
      transactionCalls += 1;
      transactionOptions = options;
      events.push({ kind: "begin" as const });
      try {
        const result = await callback(tx);
        events.push({ kind: "commit" as const });
        return result;
      } catch (error) {
        events.push({ kind: "rollback" as const });
        throw error;
      }
    },
  };
  return {
    prisma,
    events,
    get transactionCalls() {
      return transactionCalls;
    },
    get transactionOptions() {
      return transactionOptions;
    },
  };
}

function envelope(
  tableName: string,
  recordId: string,
  fieldName: string,
  value: unknown,
  encryptionKey: SensitiveEncryptionKey = key,
) {
  return encryptSensitiveJson(
    value,
    { tableName, recordId, fieldName },
    encryptionKey,
  );
}

function updateEvent(
  events: ReturnType<typeof createPrismaDouble>["events"],
  tableName: string,
) {
  const event = events.find(
    (candidate): candidate is QueryEvent =>
      candidate.kind === "execute" &&
      candidate.sql.startsWith(`UPDATE "${tableName}"`),
  );
  assert.ok(event, `expected UPDATE for ${tableName}`);
  return event;
}

function parseEnvelope(value: unknown): SensitiveEncryptionEnvelope {
  return (
    typeof value === "string" ? JSON.parse(value) : value
  ) as SensitiveEncryptionEnvelope;
}

function userUuid(index: number): string {
  return `018f5f71-3b9a-7f52-8a9c-${(0xe100 + index)
    .toString(16)
    .padStart(12, "0")}`;
}

function unmigratedUserRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: userUuid(index),
    displayName: `patient-${index}`,
    mobilePhone: null,
    identityEnvelope: null,
    mobilePhoneLookup: null,
  }));
}

test("backfill owns the exact fixed table and payload group mapping", () => {
  assert.deepEqual(SENSITIVE_BACKFILL_TABLES, expectedTableConfiguration);
  assert.deepEqual(
    SENSITIVE_BACKFILL_TABLES.flatMap((table) =>
      table.groups.map(
        (group) =>
          `${table.tableName}.${group.envelopeField}:${group.sourceFields.join(",")}`,
      ),
    ),
    [
      "user.identityEnvelope:displayName,mobilePhone",
      "patient_profile.identityEnvelope:name,gender,age",
      "patient_profile.contactEnvelope:mobilePhone,caregiverName,caregiverPhone",
      "patient_profile.careDetailsEnvelope:healthMetrics",
      "registration_request.identityEnvelope:displayName,mobilePhone,profileSnapshot",
      "registration_request.reviewEnvelope:reviewNote",
      "care_circle_post.contentEnvelope:body,mood,privateMetadata",
      "care_circle_post.moderationEnvelope:moderationReason",
      "care_circle_comment.contentEnvelope:body,privateMetadata",
      "care_precaution.contentEnvelope:title,content",
      "assessment_record.resultEnvelope:scoreSummary,rawInputSummary",
      "risk_grade_record.reasonEnvelope:reasonSummary",
      "ai_analysis_record.inputEnvelope:inputSummary",
      "ai_analysis_record.outputEnvelope:outputSummary",
      "ai_conversation_session.summaryEnvelope:summary",
      "ai_conversation_session.reviewEnvelope:reviewNote",
      "ai_conversation_message.contentEnvelope:content,contentSnapshot,evidenceMetadata",
      "training_result.reviewEnvelope:reviewNote",
    ],
  );
});

test("db exports and package scripts expose one side-effect-free backfill command", async () => {
  const dbExports = (await import("./index")) as Record<string, unknown>;
  assert.equal(
    dbExports.backfillSensitiveEncryption,
    backfillSensitiveEncryption,
  );
  assert.equal(
    dbExports.requireSensitiveBackfillKey,
    requireSensitiveBackfillKey,
  );

  const dbPackage = JSON.parse(
    await readFile(resolve(__dirname, "../package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  const rootPackage = JSON.parse(
    await readFile(resolve(__dirname, "../../../package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.equal(
    dbPackage.scripts["sensitive:backfill"],
    "tsx src/backfill-sensitive-encryption.ts",
  );
  assert.equal(
    rootPackage.scripts["db:sensitive:backfill"],
    "pnpm --filter @rehab-platform/db sensitive:backfill",
  );
});

test("key parsing requires one exact kid and one canonical base64 32-byte key", () => {
  const canonicalKey = Buffer.alloc(32, 251).toString("base64");
  assert.deepEqual(
    requireSensitiveBackfillKey({
      SENSITIVE_DATA_KEY_REF: "sensitive-key-primary",
      SENSITIVE_DATA_KEY: canonicalKey,
    }),
    {
      kid: "sensitive-key-primary",
      key: Buffer.alloc(32, 251),
    },
  );

  for (const environment of [
    {},
    { SENSITIVE_DATA_KEY: canonicalKey },
    { SENSITIVE_DATA_KEY_REF: "sensitive-key-primary" },
    {
      SENSITIVE_DATA_KEY_REF: " sensitive-key-primary",
      SENSITIVE_DATA_KEY: canonicalKey,
    },
    {
      SENSITIVE_DATA_KEY_REF: "sensitive-key-primary",
      SENSITIVE_DATA_KEY: Buffer.alloc(31, 1).toString("base64"),
    },
    {
      SENSITIVE_DATA_KEY_REF: "sensitive-key-primary",
      SENSITIVE_DATA_KEY: canonicalKey.replace(/=+$/, ""),
    },
    {
      SENSITIVE_DATA_KEY_REF: "sensitive-key-primary",
      SENSITIVE_DATA_KEY: ` ${canonicalKey}`,
    },
  ]) {
    assert.throws(() => requireSensitiveBackfillKey(environment), /sensitive/i);
  }
});

test("production backfill reads only one direct Secret File and rejects raw or unsafe sources", () => {
  const secretDirectory = mkdtempSync(resolve(tmpdir(), "rehab-backfill-key-"));
  const secretFile = resolve(secretDirectory, "sensitive_data_key");
  const canonicalKey = Buffer.alloc(32, 19).toString("base64");
  writeFileSync(secretFile, canonicalKey, "utf8");

  try {
    assert.deepEqual(
      requireSensitiveBackfillKey(
        {
          NODE_ENV: "production",
          SENSITIVE_DATA_KEY_REF:
            "secret-manager://rehab-prod/sensitive-data-key-v1",
          SENSITIVE_DATA_KEY_FILE: secretFile,
        },
        { secretDirectory },
      ),
      {
        kid: "secret-manager://rehab-prod/sensitive-data-key-v1",
        key: Buffer.alloc(32, 19),
      },
    );

    assert.throws(
      () =>
        requireSensitiveBackfillKey(
          {
            NODE_ENV: "production",
            SENSITIVE_DATA_KEY_REF:
              "secret-manager://rehab-prod/sensitive-data-key-v1",
            SENSITIVE_DATA_KEY_FILE: secretFile,
            SENSITIVE_DATA_KEY: canonicalKey,
          },
          { secretDirectory },
        ),
      /must not define SENSITIVE_DATA_KEY/i,
    );
    assert.throws(
      () =>
        requireSensitiveBackfillKey(
          {
            NODE_ENV: "production",
            SENSITIVE_DATA_KEY_REF: "local-kid",
            SENSITIVE_DATA_KEY_FILE: secretFile,
          },
          { secretDirectory },
        ),
      /secret-manager/i,
    );
    assert.throws(
      () =>
        requireSensitiveBackfillKey(
          {
            NODE_ENV: "production",
            SENSITIVE_DATA_KEY_REF:
              "secret-manager://rehab-prod/sensitive-data-key-v1",
            SENSITIVE_DATA_KEY_FILE: resolve(secretDirectory, "nested", "key"),
          },
          { secretDirectory },
        ),
      /directly under/i,
    );

    const symlinkPath = resolve(secretDirectory, "sensitive_data_key_link");
    symlinkSync(secretFile, symlinkPath);
    assert.throws(
      () =>
        requireSensitiveBackfillKey(
          {
            NODE_ENV: "production",
            SENSITIVE_DATA_KEY_REF:
              "secret-manager://rehab-prod/sensitive-data-key-v1",
            SENSITIVE_DATA_KEY_FILE: symlinkPath,
          },
          { secretDirectory },
        ),
      /regular file/i,
    );
  } finally {
    rmSync(secretDirectory, { recursive: true, force: true });
  }
});

test("one interactive transaction runs two ordered keyset passes after the advisory lock", async () => {
  const database = createPrismaDouble();

  await backfillSensitiveEncryption(database.prisma, key);

  assert.equal(database.transactionCalls, 1);
  assert.deepEqual(database.transactionOptions, {
    maxWait: 60_000,
    timeout: 86_400_000,
  });
  assert.deepEqual(
    database.events.map((event) => event.kind),
    [
      "begin",
      "query",
      "lock",
      ...SENSITIVE_BACKFILL_TABLES.flatMap(() => ["query", "query"]),
      "commit",
    ],
  );
  const queries = database.events.filter(
    (event): event is QueryEvent => event.kind === "query",
  );
  assert.equal(
    queries[0].sql,
    'SELECT 1 AS "locked" FROM pg_advisory_xact_lock($1)',
  );
  assert.equal(queries[0].values.length, 1);
  assert.equal(typeof queries[0].values[0], "number");
  const lock = database.events.find(
    (event): event is QueryEvent => event.kind === "lock",
  );
  assert.ok(lock);
  assert.equal(
    lock.sql,
    `LOCK TABLE ${SENSITIVE_BACKFILL_TABLES.map(
      (table) => `"${table.tableName}"`,
    ).join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
  );
  assert.deepEqual(lock.values, []);
  assert.deepEqual(
    queries.slice(1).map((event) => event.sql.match(/FROM "([^"]+)"/)?.[1]),
    [
      ...SENSITIVE_BACKFILL_TABLES.map((table) => table.tableName),
      ...SENSITIVE_BACKFILL_TABLES.map((table) => table.tableName),
    ],
  );
  for (const event of queries.slice(1)) {
    assert.match(
      event.sql,
      / WHERE "id" > \$1 ORDER BY "id" LIMIT \$2 FOR UPDATE$/,
    );
    assert.deepEqual(event.values, ["", EXPECTED_BATCH_SIZE]);
    assert.doesNotMatch(event.sql, /OFFSET/i);
  }
});

test("two-pass batching bounds retained rows and envelopes while globally preflighting before any update", async () => {
  const rowCount = EXPECTED_BATCH_SIZE * 2 + 1;
  const database = createPrismaDouble({ user: unmigratedUserRows(rowCount) });

  const summary = await backfillSensitiveEncryption(database.prisma, key);

  assert.deepEqual(summary, {
    scannedRows: rowCount,
    migratedRows: rowCount,
    validatedRows: 0,
  });
  const firstExecuteIndex = database.events.findIndex(
    (event) => event.kind === "execute",
  );
  assert.ok(firstExecuteIndex > 0);
  const beforeFirstUpdate = database.events.slice(0, firstExecuteIndex);
  const passOneSelects = beforeFirstUpdate.filter(
    (event): event is QueryEvent =>
      event.kind === "query" && !event.sql.includes("pg_advisory_xact_lock"),
  );
  assert.deepEqual(
    passOneSelects.map((event) => event.sql.match(/FROM "([^"]+)"/)?.[1]),
    [
      "user",
      "user",
      "user",
      "user",
      ...SENSITIVE_BACKFILL_TABLES.slice(1).map((table) => table.tableName),
      "user",
    ],
    "all pass-one pages and tables must complete before the first pass-two update",
  );
  const pagedSelects = database.events.filter(
    (event): event is QueryEvent =>
      event.kind === "query" && !event.sql.includes("pg_advisory_xact_lock"),
  );
  for (const event of pagedSelects) {
    assert.doesNotMatch(event.sql, /OFFSET/i);
    assert.equal(event.values[1], EXPECTED_BATCH_SIZE);
    assert.ok((event.resultRowCount ?? Infinity) <= EXPECTED_BATCH_SIZE);
  }

  const passTwoEvents = database.events.slice(
    database.events.indexOf(passOneSelects.at(-1)!),
    -1,
  );
  let retainedInCurrentBatch = 0;
  let maximumRetained = 0;
  for (const event of passTwoEvents) {
    if (event.kind === "query") {
      assert.equal(
        retainedInCurrentBatch,
        0,
        "the prior plaintext/envelope batch must be released before the next SELECT",
      );
      retainedInCurrentBatch = event.resultRowCount ?? 0;
      maximumRetained = Math.max(maximumRetained, retainedInCurrentBatch);
    } else if (event.kind === "execute") {
      retainedInCurrentBatch -= 1;
      assert.ok(retainedInCurrentBatch >= 0);
    }
  }
  assert.equal(retainedInCurrentBatch, 0);
  assert.equal(maximumRetained, EXPECTED_BATCH_SIZE);
});

test("a partial row in a later preflight batch aborts before every update", async () => {
  const rows = unmigratedUserRows(EXPECTED_BATCH_SIZE + 1);
  rows.at(-1)!.identityEnvelope = envelope(
    "user",
    rows.at(-1)!.id,
    "identityEnvelope",
    { displayName: "already-encrypted", mobilePhone: null },
  );
  const database = createPrismaDouble({ user: rows });

  await assert.rejects(
    backfillSensitiveEncryption(database.prisma, key),
    /partial/i,
  );

  const userSelects = database.events.filter(
    (event): event is QueryEvent =>
      event.kind === "query" && event.sql.includes('FROM "user"'),
  );
  assert.equal(userSelects.length, 2);
  assert.deepEqual(
    userSelects.map((event) => event.resultRowCount),
    [EXPECTED_BATCH_SIZE, 1],
  );
  assert.equal(
    database.events.some((event) => event.kind === "execute"),
    false,
  );
  assert.equal(database.events.at(-1)?.kind, "rollback");
});

test("a later pass-two batch failure propagates after earlier batch writes and rolls back", async () => {
  let updateCalls = 0;
  const database = createPrismaDouble(
    { user: unmigratedUserRows(EXPECTED_BATCH_SIZE + 1) },
    () => {
      updateCalls += 1;
      return updateCalls === EXPECTED_BATCH_SIZE + 1 ? 0 : 1;
    },
  );

  await assert.rejects(
    backfillSensitiveEncryption(database.prisma, key),
    /unexpected row count/i,
  );

  assert.equal(updateCalls, EXPECTED_BATCH_SIZE + 1);
  const userSelects = database.events.filter(
    (event): event is QueryEvent =>
      event.kind === "query" && event.sql.includes('FROM "user"'),
  );
  assert.deepEqual(
    userSelects.map((event) => event.resultRowCount),
    [EXPECTED_BATCH_SIZE, 1, 0, EXPECTED_BATCH_SIZE, 1],
  );
  assert.equal(database.events.at(-1)?.kind, "rollback");
});

test("per-table pass-two count drift hard-fails the transaction", async () => {
  const row = unmigratedUserRows(1)[0];
  const database = createPrismaDouble(
    { user: [row] },
    1,
    (tableName, _cursor, _limit, tableQueryCall) => {
      if (tableName !== "user") return undefined;
      if (tableQueryCall === 1) return [row];
      return [];
    },
  );

  await assert.rejects(
    backfillSensitiveEncryption(database.prisma, key),
    /count|drift|pass/i,
  );

  assert.equal(
    database.events.some((event) => event.kind === "execute"),
    false,
  );
  assert.equal(database.events.at(-1)?.kind, "rollback");
});

test("unmigrated rows use the real UUID AAD, same-key phone HMAC, verified envelopes, and null every scoped legacy column", async () => {
  const database = createPrismaDouble({
    user: [
      {
        id: UUID_A,
        displayName: "患者甲",
        mobilePhone: "+86 138-0013-8000",
        identityEnvelope: null,
        mobilePhoneLookup: null,
      },
    ],
  });

  await backfillSensitiveEncryption(database.prisma, key);

  const update = updateEvent(database.events, "user");
  assert.match(update.sql, /"identityEnvelope" = \$1::jsonb/);
  assert.match(update.sql, /"mobilePhoneLookup" = \$2/);
  assert.match(update.sql, /"displayName" = NULL/);
  assert.match(update.sql, /"mobilePhone" = NULL/);
  assert.match(update.sql, /WHERE "id" = \$3/);
  assert.equal(
    update.values[1],
    createPhoneLookupHmac("+86 138-0013-8000", key.key),
  );
  assert.equal(update.values[2], UUID_A);
  const identityEnvelope = parseEnvelope(update.values[0]);
  assert.deepEqual(identityEnvelope.aad, {
    tableName: "user",
    recordId: UUID_A,
    fieldName: "identityEnvelope",
  });
  assert.equal(identityEnvelope.kid, key.kid);
});

test("optional groups stay null instead of fabricating empty encrypted payloads", async () => {
  const database = createPrismaDouble({
    care_circle_post: [
      {
        id: UUID_A,
        body: "今天完成训练",
        mood: null,
        privateMetadata: { audience: "care_team" },
        moderationReason: null,
        contentEnvelope: null,
        moderationEnvelope: null,
      },
    ],
    training_result: [
      {
        id: UUID_B,
        reviewNote: null,
        reviewEnvelope: null,
      },
    ],
  });

  await backfillSensitiveEncryption(database.prisma, key);

  const postUpdate = updateEvent(database.events, "care_circle_post");
  assert.ok(parseEnvelope(postUpdate.values[0]));
  assert.equal(postUpdate.values[1], null);
  assert.equal(
    database.events.some(
      (event) =>
        event.kind === "execute" &&
        event.sql.startsWith('UPDATE "training_result"'),
    ),
    false,
  );
});

test("partial rows and non-UUID row ids abort before any write", async (context) => {
  const cases: Record<string, Row> = {
    "partial envelope state": {
      id: UUID_A,
      displayName: "仍有明文",
      mobilePhone: null,
      identityEnvelope: envelope("user", UUID_A, "identityEnvelope", {
        displayName: "患者甲",
        mobilePhone: null,
      }),
      mobilePhoneLookup: null,
    },
    "non-UUID id": {
      id: "legacy-user-id",
      displayName: "患者甲",
      mobilePhone: null,
      identityEnvelope: null,
      mobilePhoneLookup: null,
    },
  };

  for (const [label, row] of Object.entries(cases)) {
    await context.test(label, async () => {
      const database = createPrismaDouble({ user: [row] });
      await assert.rejects(
        backfillSensitiveEncryption(database.prisma, key),
        /partial|UUID/i,
      );
      assert.equal(
        database.events.some((event) => event.kind === "execute"),
        false,
      );
      assert.equal(database.events.at(-1)?.kind, "rollback");
    });
  }
});

test("fully migrated rows hard-fail wrong kid, wrong key, AAD mismatch, and tamper", async (context) => {
  const wrongKidKey: SensitiveEncryptionKey = {
    kid: "other-kid",
    key: Buffer.alloc(32, 9),
  };
  const wrongBytesKey: SensitiveEncryptionKey = {
    kid: key.kid,
    key: Buffer.alloc(32, 9),
  };
  const validPayload = { displayName: "患者甲", mobilePhone: "13800138000" };
  const valid = envelope("user", UUID_A, "identityEnvelope", validPayload);
  const tampered: SensitiveEncryptionEnvelope = {
    ...valid,
    ciphertext: `${valid.ciphertext[0] === "A" ? "B" : "A"}${valid.ciphertext.slice(1)}`,
  };
  const cases: Record<string, SensitiveEncryptionEnvelope> = {
    "wrong key": envelope(
      "user",
      UUID_A,
      "identityEnvelope",
      validPayload,
      wrongBytesKey,
    ),
    "AAD mismatch": envelope("user", UUID_B, "identityEnvelope", validPayload),
    tamper: tampered,
    "wrong kid": envelope(
      "user",
      UUID_A,
      "identityEnvelope",
      validPayload,
      wrongKidKey,
    ),
  };

  for (const [label, identityEnvelope] of Object.entries(cases)) {
    await context.test(label, async () => {
      const database = createPrismaDouble({
        user: [
          {
            id: UUID_A,
            displayName: null,
            mobilePhone: null,
            identityEnvelope,
            mobilePhoneLookup: createPhoneLookupHmac("13800138000", key.key),
          },
        ],
      });
      await assert.rejects(
        backfillSensitiveEncryption(database.prisma, key),
        /kid|authentication|AAD/i,
      );
      assert.equal(
        database.events.some((event) => event.kind === "execute"),
        false,
      );
      assert.equal(database.events.at(-1)?.kind, "rollback");
    });
  }
});

test("fully migrated reruns validate phone lookup and make no writes", async () => {
  const payload = { displayName: "患者甲", mobilePhone: "13800138000" };
  const database = createPrismaDouble({
    user: [
      {
        id: UUID_A,
        displayName: null,
        mobilePhone: null,
        identityEnvelope: envelope("user", UUID_A, "identityEnvelope", payload),
        mobilePhoneLookup: createPhoneLookupHmac(payload.mobilePhone, key.key),
      },
    ],
  });

  const summary = await backfillSensitiveEncryption(database.prisma, key);

  assert.deepEqual(summary, {
    scannedRows: 1,
    migratedRows: 0,
    validatedRows: 1,
  });
  assert.equal(
    database.events.some((event) => event.kind === "execute"),
    false,
  );

  const invalidLookupDatabase = createPrismaDouble({
    user: [
      {
        id: UUID_A,
        displayName: null,
        mobilePhone: null,
        identityEnvelope: envelope("user", UUID_A, "identityEnvelope", payload),
        mobilePhoneLookup: "0".repeat(64),
      },
    ],
  });
  await assert.rejects(
    backfillSensitiveEncryption(invalidLookupDatabase.prisma, key),
    /phone lookup/i,
  );
});

test("fully migrated rows reject null or incorrectly typed required payload values", async (context) => {
  const cases = {
    "null required value": {
      tableName: "user",
      row: {
        id: UUID_A,
        displayName: null,
        mobilePhone: null,
        identityEnvelope: envelope("user", UUID_A, "identityEnvelope", {
          displayName: null,
          mobilePhone: null,
        }),
        mobilePhoneLookup: null,
      },
    },
    "incorrect required type": {
      tableName: "patient_profile",
      row: {
        id: UUID_A,
        name: null,
        gender: null,
        age: null,
        mobilePhone: null,
        caregiverName: null,
        caregiverPhone: null,
        healthMetrics: null,
        identityEnvelope: envelope(
          "patient_profile",
          UUID_A,
          "identityEnvelope",
          { name: "患者甲", gender: "female", age: "63" },
        ),
        contactEnvelope: null,
        careDetailsEnvelope: envelope(
          "patient_profile",
          UUID_A,
          "careDetailsEnvelope",
          { healthMetrics: {} },
        ),
      },
    },
  };

  for (const [label, fixture] of Object.entries(cases)) {
    await context.test(label, async () => {
      const database = createPrismaDouble({
        [fixture.tableName]: [fixture.row],
      });
      await assert.rejects(
        backfillSensitiveEncryption(database.prisma, key),
        /payload|required|type/i,
      );
      assert.equal(
        database.events.some((event) => event.kind === "execute"),
        false,
      );
    });
  }
});

test("fully migrated optional all-null payloads require a null envelope", async () => {
  const database = createPrismaDouble({
    training_result: [
      {
        id: UUID_A,
        reviewNote: null,
        reviewEnvelope: envelope("training_result", UUID_A, "reviewEnvelope", {
          reviewNote: null,
        }),
      },
    ],
  });

  await assert.rejects(
    backfillSensitiveEncryption(database.prisma, key),
    /optional|all-null|null envelope/i,
  );
  assert.equal(
    database.events.some((event) => event.kind === "execute"),
    false,
  );
});

test("any failed row or unexpected update count propagates and rolls back the transaction", async (context) => {
  await context.test("later preflight failure", async () => {
    const database = createPrismaDouble({
      user: [
        {
          id: UUID_A,
          displayName: "患者甲",
          mobilePhone: null,
          identityEnvelope: null,
          mobilePhoneLookup: null,
        },
      ],
      patient_profile: [
        {
          id: UUID_B,
          name: "患者乙",
          gender: null,
          age: 63,
          mobilePhone: null,
          caregiverName: null,
          caregiverPhone: null,
          healthMetrics: {},
          identityEnvelope: null,
          contactEnvelope: null,
          careDetailsEnvelope: null,
        },
      ],
    });

    await assert.rejects(
      backfillSensitiveEncryption(database.prisma, key),
      /partial|required/i,
    );
    assert.equal(
      database.events.some((event) => event.kind === "execute"),
      false,
    );
    assert.equal(database.events.at(-1)?.kind, "rollback");
  });

  await context.test("unexpected update count", async () => {
    const database = createPrismaDouble(
      {
        user: [
          {
            id: UUID_A,
            displayName: "患者甲",
            mobilePhone: null,
            identityEnvelope: null,
            mobilePhoneLookup: null,
          },
        ],
      },
      0,
    );

    await assert.rejects(
      backfillSensitiveEncryption(database.prisma, key),
      /unexpected row count/i,
    );
    assert.equal(database.events.at(-1)?.kind, "rollback");
  });
});
