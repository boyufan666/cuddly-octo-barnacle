import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(prismaDirectory, "schema.prisma");
const migrationPath = resolve(
  prismaDirectory,
  "migrations/20260722110000_provider_operation_outbox/migration.sql",
);

async function readRequired(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    assert.fail(`${label} must exist: ${error.message}`);
  }
}

function modelBlock(schema, name) {
  const block = schema.match(
    new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`),
  )?.[0];
  assert.ok(block, `${name} Prisma model must exist`);
  return block;
}

function assertSchemaField(model, field) {
  const pattern = field
    .split(" ")
    .map((part) => part.replace(/[?()[\]{}.+*^$|\\]/g, "\\$&"))
    .join("\\s+");
  assert.match(model, new RegExp(`^\\s*${pattern}\\s*$`, "m"));
}

test("provider operation schema persists the minimum operation, outbox, and case contract", async () => {
  const schema = await readRequired(schemaPath, "Prisma schema");
  const operation = modelBlock(schema, "ProviderOperation");
  const outbox = modelBlock(schema, "ProviderOperationOutbox");
  const outcomeCase = modelBlock(schema, "ProviderOutcomeCase");

  for (const field of [
    "organizationId String?",
    "patientId String?",
    "actorUserId String?",
    "operation String",
    "clientIdempotencyKey String",
    "canonicalRequestHmac String",
    "requestCiphertext Json",
    "expectedBusinessObjectType String?",
    "expectedBusinessObjectId String?",
    "expectedBusinessObjectVersion String?",
    "provider String",
    "modelVersion String",
    "endpointHost String",
    "apiKeyRef String",
    "promptVersion String?",
    "providerCallId String?",
    "providerRequestId String?",
    'status String @default("accepted")',
    "responseCiphertext Json?",
    "responseHmac String?",
    "failureCategory String?",
    "providerStartedAt DateTime?",
    "providerRespondedAt DateTime?",
    "completedAt DateTime?",
    "finalizedAt DateTime?",
  ]) {
    assertSchemaField(operation, field);
  }
  assert.match(
    operation,
    /@@unique\(\[organizationId, operation, patientId, actorUserId, clientIdempotencyKey\], map: "provider_operation_idempotency_scope_key"\)/,
  );
  assert.match(operation, /@@map\("provider_operation"\)/);

  for (const field of [
    "providerOperationId String",
    "eventType String",
    'status String @default("pending")',
    "availableAt DateTime @default(now())",
    "claimToken String?",
    "claimedAt DateTime?",
    "processedAt DateTime?",
    "attemptCount Int @default(0)",
    "failureCategory String?",
  ]) {
    assertSchemaField(outbox, field);
  }
  assert.match(outbox, /@@unique\(\[providerOperationId, eventType\]\)/);
  assert.match(outbox, /@@map\("provider_operation_outbox"\)/);

  for (const field of [
    "providerOperationId String",
    "caseType String",
    'status String @default("open")',
    "assignedToUserId String?",
    "slaDueAt DateTime?",
    'evidenceReferences Json @default("[]")',
    "resolutionAction String?",
    "resolvedByUserId String?",
    "resolvedAt DateTime?",
  ]) {
    assertSchemaField(outcomeCase, field);
  }
  assert.match(outcomeCase, /@@map\("provider_outcome_case"\)/);

  assert.doesNotMatch(schema, /model ProviderAsset \{/);
  assert.doesNotMatch(schema, /model ProviderFinancialReservation \{/);
});

test("provider operation migration fails closed for nullable idempotency scope and never embeds replay behavior", async () => {
  const sql = await readRequired(
    migrationPath,
    "provider operation outbox migration",
  );

  assert.ok(sql.startsWith("BEGIN;\n"));
  assert.ok(sql.trimEnd().endsWith("COMMIT;"));
  assert.equal(sql.match(/^BEGIN;$/gm)?.length, 1);
  assert.equal(sql.match(/^COMMIT;$/gm)?.length, 1);

  for (const table of [
    "provider_operation",
    "provider_operation_outbox",
    "provider_outcome_case",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "provider_operation_idempotency_scope_key"[\s\S]*?ON "provider_operation"\([\s\S]*?"organizationId",[\s\S]*?"operation",[\s\S]*?"patientId",[\s\S]*?"actorUserId",[\s\S]*?"clientIdempotencyKey"[\s\S]*?\) NULLS NOT DISTINCT;/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "provider_operation_outbox_providerOperationId_eventType_key"[\s\S]*?\("providerOperationId", "eventType"\);/,
  );
  assert.match(sql, /CHECK \("attemptCount" >= 0\)/);
  for (const constraint of [
    "provider_operation_organizationId_fkey",
    "provider_operation_patientId_fkey",
    "provider_operation_actorUserId_fkey",
    "provider_operation_outbox_providerOperationId_fkey",
    "provider_outcome_case_providerOperationId_fkey",
    "provider_outcome_case_assignedToUserId_fkey",
    "provider_outcome_case_resolvedByUserId_fkey",
  ]) {
    assert.match(sql, new RegExp(`CONSTRAINT "${constraint}"`));
  }
  assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/im);
  assert.doesNotMatch(sql, /\b(?:retry|fallback|fetch|http)\b/i);
});
