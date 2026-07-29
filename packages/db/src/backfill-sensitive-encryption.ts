import { isDeepStrictEqual } from "node:util";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionEnvelope,
  type SensitiveEncryptionKey,
} from "./sensitive-encryption";

export type SensitiveBackfillGroup = {
  envelopeField: string;
  sourceFields: readonly string[];
  requiredSourceFields: readonly string[];
};

export type SensitiveBackfillTable = {
  tableName: string;
  groups: readonly SensitiveBackfillGroup[];
  phoneLookup?: {
    column: string;
    envelopeField: string;
    payloadField: string;
  };
};

export const SENSITIVE_BACKFILL_TABLES = [
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
] as const satisfies readonly SensitiveBackfillTable[];

for (const table of SENSITIVE_BACKFILL_TABLES) {
  for (const group of table.groups) {
    Object.freeze(group.sourceFields);
    Object.freeze(group.requiredSourceFields);
    Object.freeze(group);
  }
  Object.freeze(table.groups);
  if ("phoneLookup" in table) {
    Object.freeze(table.phoneLookup);
  }
  Object.freeze(table);
}
Object.freeze(SENSITIVE_BACKFILL_TABLES);

type BackfillTransaction = {
  $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

export type SensitiveBackfillPrisma = {
  $transaction<T>(
    callback: (transaction: BackfillTransaction) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
};

export type SensitiveBackfillSummary = {
  scannedRows: number;
  migratedRows: number;
  validatedRows: number;
};

type BackfillRow = Record<string, unknown> & { id: string };

type BackfillWrite = {
  table: SensitiveBackfillTable;
  rowId: string;
  envelopes: Map<string, SensitiveEncryptionEnvelope | null>;
  phoneLookup: string | null | undefined;
};

type BackfillTableCounts = {
  rows: number;
  unmigrated: number;
  validated: number;
};

const SENSITIVE_BACKFILL_ADVISORY_LOCK_ID = 718_268_337;
const RENDER_SECRET_DIRECTORY = "/etc/secrets";
const SENSITIVE_BACKFILL_BATCH_SIZE = 100;
const SENSITIVE_BACKFILL_TRANSACTION_OPTIONS = Object.freeze({
  maxWait: 60_000,
  timeout: 86_400_000,
});
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
type SensitivePayloadValueType = "integer" | "json" | "string";
const SENSITIVE_PAYLOAD_VALUE_TYPES = Object.freeze<
  Record<string, SensitivePayloadValueType>
>({
  "user.displayName": "string",
  "user.mobilePhone": "string",
  "patient_profile.name": "string",
  "patient_profile.gender": "string",
  "patient_profile.age": "integer",
  "patient_profile.mobilePhone": "string",
  "patient_profile.caregiverName": "string",
  "patient_profile.caregiverPhone": "string",
  "patient_profile.healthMetrics": "json",
  "registration_request.displayName": "string",
  "registration_request.mobilePhone": "string",
  "registration_request.profileSnapshot": "json",
  "registration_request.reviewNote": "string",
  "care_circle_post.body": "string",
  "care_circle_post.mood": "string",
  "care_circle_post.privateMetadata": "json",
  "care_circle_post.moderationReason": "string",
  "care_circle_comment.body": "string",
  "care_circle_comment.privateMetadata": "json",
  "care_precaution.title": "string",
  "care_precaution.content": "string",
  "assessment_record.scoreSummary": "json",
  "assessment_record.rawInputSummary": "json",
  "risk_grade_record.reasonSummary": "string",
  "ai_analysis_record.inputSummary": "json",
  "ai_analysis_record.outputSummary": "json",
  "ai_conversation_session.summary": "string",
  "ai_conversation_session.reviewNote": "string",
  "ai_conversation_message.content": "string",
  "ai_conversation_message.contentSnapshot": "json",
  "ai_conversation_message.evidenceMetadata": "json",
  "training_result.reviewNote": "string",
});

export type SensitiveBackfillKeyOptions = {
  secretDirectory?: string;
};

function requireExactEnvironmentValue(
  environment: Record<string, string | undefined>,
  name: string,
  message: string,
): string {
  const value = environment[name];
  if (!value || value.trim() !== value) {
    throw new Error(message);
  }
  return value;
}

function loadProductionSensitiveBackfillKey(
  environment: Record<string, string | undefined>,
  options: SensitiveBackfillKeyOptions,
): string {
  if (Object.prototype.hasOwnProperty.call(environment, "SENSITIVE_DATA_KEY")) {
    throw new Error(
      "Sensitive backfill must not define SENSITIVE_DATA_KEY in production; configure SENSITIVE_DATA_KEY_FILE instead.",
    );
  }
  const configuredPath = requireExactEnvironmentValue(
    environment,
    "SENSITIVE_DATA_KEY_FILE",
    "Sensitive backfill requires an exact non-empty SENSITIVE_DATA_KEY_FILE in production.",
  );
  if (!isAbsolute(configuredPath)) {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY_FILE must be an absolute Secret File path.",
    );
  }

  const secretDirectory = resolve(
    options.secretDirectory ?? RENDER_SECRET_DIRECTORY,
  );
  const resolvedPath = resolve(configuredPath);
  const pathFromSecretDirectory = relative(secretDirectory, resolvedPath);
  if (
    pathFromSecretDirectory === "" ||
    pathFromSecretDirectory.startsWith("..") ||
    isAbsolute(pathFromSecretDirectory) ||
    pathFromSecretDirectory.includes(sep)
  ) {
    throw new Error(
      `Sensitive backfill SENSITIVE_DATA_KEY_FILE must point directly under ${secretDirectory}.`,
    );
  }

  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(resolvedPath);
  } catch {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY_FILE Secret File is unavailable.",
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY_FILE must point to a regular file.",
    );
  }

  let encodedKey: string;
  try {
    encodedKey = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY_FILE Secret File cannot be read.",
    );
  }
  if (!encodedKey || encodedKey.trim() !== encodedKey) {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY_FILE must contain one exact non-empty secret value.",
    );
  }
  return encodedKey;
}

export function requireSensitiveBackfillKey(
  environment: Record<string, string | undefined>,
  options: SensitiveBackfillKeyOptions = {},
): SensitiveEncryptionKey {
  const kid = environment.SENSITIVE_DATA_KEY_REF;
  const isProduction = environment.NODE_ENV === "production";
  const encodedKey = isProduction
    ? loadProductionSensitiveBackfillKey(environment, options)
    : environment.SENSITIVE_DATA_KEY;
  if (
    typeof kid !== "string" ||
    kid.length === 0 ||
    kid.length > 512 ||
    kid.trim() !== kid
  ) {
    throw new Error(
      "Sensitive backfill requires an exact non-empty SENSITIVE_DATA_KEY_REF.",
    );
  }
  if (isProduction && !kid.startsWith("secret-manager://")) {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY_REF must use the secret-manager:// reference form in production.",
    );
  }
  if (
    typeof encodedKey !== "string" ||
    !CANONICAL_BASE64_PATTERN.test(encodedKey)
  ) {
    throw new Error(
      "Sensitive backfill requires canonical base64 SENSITIVE_DATA_KEY.",
    );
  }
  const decodedKey = Buffer.from(encodedKey, "base64");
  if (
    decodedKey.byteLength !== 32 ||
    decodedKey.toString("base64") !== encodedKey
  ) {
    throw new Error(
      "Sensitive backfill SENSITIVE_DATA_KEY must be canonical base64 for exactly 32 bytes.",
    );
  }
  return { kid, key: decodedKey };
}

export async function backfillSensitiveEncryption(
  prisma: SensitiveBackfillPrisma,
  encryptionKey: SensitiveEncryptionKey,
): Promise<SensitiveBackfillSummary> {
  assertSensitiveBackfillKey(encryptionKey);

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRawUnsafe(
      'SELECT 1 AS "locked" FROM pg_advisory_xact_lock($1)',
      SENSITIVE_BACKFILL_ADVISORY_LOCK_ID,
    );
    await transaction.$executeRawUnsafe(
      `LOCK TABLE ${SENSITIVE_BACKFILL_TABLES.map((table) =>
        quoteIdentifier(table.tableName),
      ).join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
    );

    const passOneCounts = new Map<string, BackfillTableCounts>();
    let scannedRows = 0;

    for (const table of SENSITIVE_BACKFILL_TABLES) {
      const counts = createEmptyTableCounts();
      await visitTableBatches(transaction, table, async (rows) => {
        counts.rows += rows.length;
        scannedRows += rows.length;
        for (const row of rows) {
          counts[validateRowState(table, row, encryptionKey)] += 1;
        }
      });
      passOneCounts.set(table.tableName, counts);
    }

    let migratedRows = 0;
    let validatedRows = 0;
    for (const table of SENSITIVE_BACKFILL_TABLES) {
      const counts = createEmptyTableCounts();
      await visitTableBatches(transaction, table, async (rows) => {
        counts.rows += rows.length;
        for (const row of rows) {
          const state = validateRowState(table, row, encryptionKey);
          counts[state] += 1;
          if (state === "validated") {
            validatedRows += 1;
            continue;
          }
          const write = prepareUnmigratedRow(table, row, encryptionKey);
          await updateRow(transaction, write);
          migratedRows += 1;
        }
      });
      assertMatchingPassCounts(
        table,
        passOneCounts.get(table.tableName),
        counts,
      );
    }

    return {
      scannedRows,
      migratedRows,
      validatedRows,
    };
  }, SENSITIVE_BACKFILL_TRANSACTION_OPTIONS);
}

function createEmptyTableCounts(): BackfillTableCounts {
  return { rows: 0, unmigrated: 0, validated: 0 };
}

function assertMatchingPassCounts(
  table: SensitiveBackfillTable,
  passOne: BackfillTableCounts | undefined,
  passTwo: BackfillTableCounts,
): void {
  if (passOne === undefined || !isDeepStrictEqual(passTwo, passOne)) {
    throw new Error(
      `Sensitive backfill pass count drift detected in ${table.tableName}.`,
    );
  }
}

async function visitTableBatches(
  transaction: BackfillTransaction,
  table: SensitiveBackfillTable,
  visit: (rows: BackfillRow[]) => Promise<void>,
): Promise<void> {
  let cursor = "";
  while (true) {
    const rows = await selectRowsForUpdate(transaction, table, cursor);
    if (rows.length === 0) return;
    await visit(rows);
    cursor = rows[rows.length - 1].id;
  }
}

async function selectRowsForUpdate(
  transaction: BackfillTransaction,
  table: SensitiveBackfillTable,
  cursor: string,
): Promise<BackfillRow[]> {
  const columns = unique([
    "id",
    ...table.groups.flatMap((group) => group.sourceFields),
    ...table.groups.map((group) => group.envelopeField),
    ...(table.phoneLookup ? [table.phoneLookup.column] : []),
  ]);
  const query = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table.tableName)} WHERE "id" > $1 ORDER BY "id" LIMIT $2 FOR UPDATE`;
  const result = await transaction.$queryRawUnsafe(
    query,
    cursor,
    SENSITIVE_BACKFILL_BATCH_SIZE,
  );
  if (!Array.isArray(result)) {
    throw new Error(
      `Sensitive backfill SELECT for ${table.tableName} returned an invalid result.`,
    );
  }
  if (result.length > SENSITIVE_BACKFILL_BATCH_SIZE) {
    throw new Error(
      `Sensitive backfill SELECT for ${table.tableName} exceeded the fixed batch size.`,
    );
  }
  const rows = result.map((value) => assertBackfillRow(table, columns, value));
  let previousId = cursor;
  for (const row of rows) {
    assertCanonicalRowId(table, row.id);
    if (row.id <= previousId) {
      throw new Error(
        `Sensitive backfill keyset order is invalid in ${table.tableName}.`,
      );
    }
    previousId = row.id;
  }
  return rows;
}

function validateRowState(
  table: SensitiveBackfillTable,
  row: BackfillRow,
  encryptionKey: SensitiveEncryptionKey,
): "unmigrated" | "validated" {
  const sourceFields = unique(
    table.groups.flatMap((group) => group.sourceFields),
  );
  const allLegacyNull = sourceFields.every((field) => row[field] === null);
  const allEnvelopesNull = table.groups.every(
    (group) => row[group.envelopeField] === null,
  );
  const requiredEnvelopesPresent = table.groups.every(
    (group) =>
      group.requiredSourceFields.length === 0 ||
      row[group.envelopeField] !== null,
  );

  if (allLegacyNull && requiredEnvelopesPresent) {
    validateMigratedRow(table, row, encryptionKey);
    return "validated";
  }

  if (
    !allLegacyNull &&
    allEnvelopesNull &&
    (!table.phoneLookup || row[table.phoneLookup.column] === null)
  ) {
    for (const group of table.groups) {
      for (const field of group.requiredSourceFields) {
        if (row[field] === null) {
          throw new Error(
            `Sensitive backfill found missing required legacy field ${table.tableName}.${field} on row ${row.id}; row is partial.`,
          );
        }
      }
    }
    validateUnmigratedPayloads(table, row);
    return "unmigrated";
  }

  throw new Error(
    `Sensitive backfill found partial state in ${table.tableName} row ${row.id}.`,
  );
}

function validateUnmigratedPayloads(
  table: SensitiveBackfillTable,
  row: BackfillRow,
): void {
  for (const group of table.groups) {
    if (
      group.requiredSourceFields.length === 0 &&
      group.sourceFields.every((field) => row[field] === null)
    ) {
      continue;
    }
    const payload = Object.fromEntries(
      group.sourceFields.map((field) => [field, row[field]]),
    );
    assertPayloadValueTypes(table, group, row.id, payload);
  }
}

function prepareUnmigratedRow(
  table: SensitiveBackfillTable,
  row: BackfillRow,
  encryptionKey: SensitiveEncryptionKey,
): BackfillWrite {
  const envelopes = new Map<string, SensitiveEncryptionEnvelope | null>();
  const decryptedPayloads = new Map<string, Record<string, unknown> | null>();

  for (const group of table.groups) {
    const payload = Object.fromEntries(
      group.sourceFields.map((field) => [field, row[field]]),
    );
    if (
      group.requiredSourceFields.length === 0 &&
      group.sourceFields.every((field) => row[field] === null)
    ) {
      envelopes.set(group.envelopeField, null);
      decryptedPayloads.set(group.envelopeField, null);
      continue;
    }
    assertPayloadValueTypes(table, group, row.id, payload);

    const aad = {
      tableName: table.tableName,
      recordId: row.id,
      fieldName: group.envelopeField,
    };
    const encrypted = encryptSensitiveJson(payload, aad, encryptionKey);
    const decrypted = decryptSensitiveJson(encrypted, aad, encryptionKey);
    if (!isDeepStrictEqual(decrypted, payload)) {
      throw new Error(
        `Sensitive backfill encryption verification failed for ${table.tableName}.${group.envelopeField} row ${row.id}.`,
      );
    }
    envelopes.set(group.envelopeField, encrypted);
    decryptedPayloads.set(group.envelopeField, payload);
  }

  return {
    table,
    rowId: row.id,
    envelopes,
    phoneLookup: table.phoneLookup
      ? phoneLookupFromPayload(
          table,
          decryptedPayloads.get(table.phoneLookup.envelopeField),
          encryptionKey,
          row.id,
        )
      : undefined,
  };
}

function validateMigratedRow(
  table: SensitiveBackfillTable,
  row: BackfillRow,
  encryptionKey: SensitiveEncryptionKey,
): void {
  const decryptedPayloads = new Map<string, Record<string, unknown> | null>();
  for (const group of table.groups) {
    const envelope = row[group.envelopeField];
    if (envelope === null) {
      if (group.requiredSourceFields.length > 0) {
        throw new Error(
          `Sensitive backfill found partial state in ${table.tableName} row ${row.id}.`,
        );
      }
      decryptedPayloads.set(group.envelopeField, null);
      continue;
    }
    const payload = decryptSensitiveJson(
      envelope,
      {
        tableName: table.tableName,
        recordId: row.id,
        fieldName: group.envelopeField,
      },
      encryptionKey,
    );
    assertExactPayloadShape(table, group, row.id, payload);
    assertPayloadValueTypes(table, group, row.id, payload);
    const decryptedPayload = payload as Record<string, unknown>;
    if (
      group.requiredSourceFields.length === 0 &&
      group.sourceFields.every((field) => decryptedPayload[field] === null)
    ) {
      throw new Error(
        `Sensitive backfill optional all-null payload for ${table.tableName}.${group.envelopeField} row ${row.id} requires a null envelope.`,
      );
    }
    decryptedPayloads.set(group.envelopeField, decryptedPayload);
  }

  if (table.phoneLookup) {
    const expectedLookup = phoneLookupFromPayload(
      table,
      decryptedPayloads.get(table.phoneLookup.envelopeField),
      encryptionKey,
      row.id,
    );
    if (row[table.phoneLookup.column] !== expectedLookup) {
      throw new Error(
        `Sensitive backfill phone lookup mismatch in ${table.tableName} row ${row.id}.`,
      );
    }
  }
}

async function updateRow(
  transaction: BackfillTransaction,
  write: BackfillWrite,
): Promise<void> {
  const values: unknown[] = [];
  const assignments: string[] = [];

  for (const group of write.table.groups) {
    values.push(
      write.envelopes.get(group.envelopeField) === null
        ? null
        : JSON.stringify(write.envelopes.get(group.envelopeField)),
    );
    assignments.push(
      `${quoteIdentifier(group.envelopeField)} = $${values.length}::jsonb`,
    );
  }
  if (write.table.phoneLookup) {
    values.push(write.phoneLookup ?? null);
    assignments.push(
      `${quoteIdentifier(write.table.phoneLookup.column)} = $${values.length}`,
    );
  }
  for (const field of unique(
    write.table.groups.flatMap((group) => group.sourceFields),
  )) {
    assignments.push(`${quoteIdentifier(field)} = NULL`);
  }
  values.push(write.rowId);
  const query = `UPDATE ${quoteIdentifier(write.table.tableName)} SET ${assignments.join(", ")} WHERE "id" = $${values.length}`;
  const affectedRows = await transaction.$executeRawUnsafe(query, ...values);
  if (affectedRows !== 1) {
    throw new Error(
      `Sensitive backfill unexpected row count ${affectedRows} while updating ${write.table.tableName} row ${write.rowId}.`,
    );
  }
}

function phoneLookupFromPayload(
  table: SensitiveBackfillTable,
  payload: Record<string, unknown> | null | undefined,
  encryptionKey: SensitiveEncryptionKey,
  rowId: string,
): string | null {
  if (!table.phoneLookup) {
    throw new Error(
      `Sensitive backfill internal phone lookup configuration error for ${table.tableName}.`,
    );
  }
  if (payload === null || payload === undefined) {
    return null;
  }
  const phone = payload[table.phoneLookup.payloadField];
  if (phone === null) {
    return null;
  }
  if (typeof phone !== "string") {
    throw new Error(
      `Sensitive backfill phone payload is invalid in ${table.tableName} row ${rowId}.`,
    );
  }
  return createPhoneLookupHmac(phone, encryptionKey.key);
}

function assertExactPayloadShape(
  table: SensitiveBackfillTable,
  group: SensitiveBackfillGroup,
  rowId: string,
  payload: unknown,
): asserts payload is Record<string, unknown> {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype
  ) {
    throw new Error(
      `Sensitive backfill payload shape is invalid for ${table.tableName}.${group.envelopeField} row ${rowId}.`,
    );
  }
  const keys = Object.keys(payload as Record<string, unknown>).sort();
  const expectedKeys = [...group.sourceFields].sort();
  if (!isDeepStrictEqual(keys, expectedKeys)) {
    throw new Error(
      `Sensitive backfill payload fields are invalid for ${table.tableName}.${group.envelopeField} row ${rowId}.`,
    );
  }
}

function assertPayloadValueTypes(
  table: SensitiveBackfillTable,
  group: SensitiveBackfillGroup,
  rowId: string,
  payload: Record<string, unknown>,
): void {
  for (const field of group.sourceFields) {
    const value = payload[field];
    const isRequired = group.requiredSourceFields.includes(field);
    if (value === null) {
      if (isRequired) {
        throw new Error(
          `Sensitive backfill required payload field ${table.tableName}.${field} is null on row ${rowId}.`,
        );
      }
      continue;
    }
    const expectedType =
      SENSITIVE_PAYLOAD_VALUE_TYPES[`${table.tableName}.${field}`];
    if (expectedType === undefined) {
      throw new Error(
        `Sensitive backfill payload type configuration is missing for ${table.tableName}.${field}.`,
      );
    }
    const valid =
      expectedType === "json" ||
      (expectedType === "string" && typeof value === "string") ||
      (expectedType === "integer" &&
        typeof value === "number" &&
        Number.isInteger(value));
    if (!valid) {
      throw new Error(
        `Sensitive backfill payload field ${table.tableName}.${field} has an invalid ${expectedType} type on row ${rowId}.`,
      );
    }
  }
}

function assertBackfillRow(
  table: SensitiveBackfillTable,
  columns: readonly string[],
  value: unknown,
): BackfillRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Sensitive backfill SELECT for ${table.tableName} returned an invalid row.`,
    );
  }
  const row = value as Record<string, unknown>;
  for (const column of columns) {
    if (!Object.prototype.hasOwnProperty.call(row, column)) {
      throw new Error(
        `Sensitive backfill SELECT for ${table.tableName} omitted column ${column}.`,
      );
    }
  }
  if (typeof row.id !== "string") {
    throw new Error(
      `Sensitive backfill row id in ${table.tableName} must be a canonical UUID.`,
    );
  }
  return row as BackfillRow;
}

function assertCanonicalRowId(
  table: SensitiveBackfillTable,
  rowId: string,
): void {
  if (!CANONICAL_UUID_PATTERN.test(rowId)) {
    throw new Error(
      `Sensitive backfill row id in ${table.tableName} must be a canonical UUID.`,
    );
  }
}

function assertSensitiveBackfillKey(
  encryptionKey: SensitiveEncryptionKey,
): void {
  if (
    typeof encryptionKey !== "object" ||
    encryptionKey === null ||
    typeof encryptionKey.kid !== "string" ||
    encryptionKey.kid.length === 0 ||
    encryptionKey.kid.length > 512 ||
    encryptionKey.kid.trim() !== encryptionKey.kid ||
    !(encryptionKey.key instanceof Uint8Array) ||
    encryptionKey.key.byteLength !== 32
  ) {
    throw new Error(
      "Sensitive backfill requires one exact key id and one 32-byte key.",
    );
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export async function runSensitiveEncryptionBackfillCli(
  environment: Record<string, string | undefined> = process.env,
): Promise<SensitiveBackfillSummary> {
  const encryptionKey = requireSensitiveBackfillKey(environment);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const summary = await backfillSensitiveEncryption(prisma, encryptionKey);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return summary;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runSensitiveEncryptionBackfillCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Sensitive encryption backfill failed: ${message}\n`);
    process.exitCode = 1;
  });
}
