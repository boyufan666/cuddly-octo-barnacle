import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("seed idempotency verifier reads stable seeded clinical counts", async () => {
  const source = await readFile(
    join(rootDir, "scripts/verify-seed-idempotency.mjs"),
    "utf8",
  );

  assert.match(source, /PrismaClient/);
  assert.match(source, /createRequire/);
  assert.match(source, /packages\/db\/package\.json/);
  assert.match(source, /SEED-ALZ-0001/);
  assert.match(source, /currentRehabPlans/);
  assert.match(source, /trainingResults/);
  assert.match(source, /console\.log\(JSON\.stringify/);
});

test("main seed uses the patient-scoped training session idempotency selector", async () => {
  const source = await readFile(
    join(rootDir, "packages/db/prisma/seed.ts"),
    "utf8",
  );

  assert.match(source, /patientId_idempotencyKey:\s*\{/);
  assert.doesNotMatch(
    source,
    /trainingSession\.upsert\(\{\s*where:\s*\{\s*idempotencyKey:/,
  );
});
