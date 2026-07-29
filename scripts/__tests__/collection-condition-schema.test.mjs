import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("Prisma schema models formal collection conditions, protocols, and batches", async () => {
  const schema = await readFile(
    join(rootDir, "packages/db/prisma/schema.prisma"),
    "utf8",
  );

  assert.match(schema, /model CollectionCondition/);
  assert.match(schema, /@@map\("collection_condition"\)/);
  assert.match(schema, /model CollectionProtocol/);
  assert.match(schema, /@@map\("collection_protocol"\)/);
  assert.match(schema, /model CollectionBatch/);
  assert.match(schema, /@@map\("collection_batch"\)/);
  assert.match(schema, /collectionBatchId\s+String\?/);
  assert.match(schema, /collectionBatch\s+CollectionBatch\?/);
  assert.match(schema, /conditionSnapshot\s+Json\s+@default\("\{}"\)/);
  assert.match(schema, /protocolSnapshot\s+Json\s+@default\("\{}"\)/);
  assert.match(schema, /consentSnapshot\s+Json\s+@default\("\{}"\)/);
});

test("collection schema migration creates traceable collection tables and training links", async () => {
  const migration = await readFile(
    join(
      rootDir,
      "packages/db/prisma/migrations/20260531193000_collection_conditions/migration.sql",
    ),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE "collection_condition"/);
  assert.match(migration, /CREATE TABLE "collection_protocol"/);
  assert.match(migration, /CREATE TABLE "collection_batch"/);
  assert.match(migration, /"consentSnapshot" JSONB NOT NULL DEFAULT '\{}'/);
  assert.match(migration, /ALTER TABLE "training_session"\s+ADD COLUMN "collectionBatchId"/);
  assert.match(migration, /ALTER TABLE "training_result"\s+ADD COLUMN "collectionBatchId"/);
  assert.match(migration, /ALTER TABLE "motion_metric"\s+ADD COLUMN "collectionBatchId"/);
  assert.match(migration, /collection_batch_patientId_status_idx/);
});
