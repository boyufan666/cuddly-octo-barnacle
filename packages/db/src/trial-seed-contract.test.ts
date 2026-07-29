import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { seedEnvelope } from "../prisma/seed";
import { trialEnvelope } from "../prisma/seed-trial";
import {
  decryptSensitiveJson,
  type SensitiveEncryptionKey,
} from "./sensitive-encryption";

const encryptionKey: SensitiveEncryptionKey = {
  kid: "secret-manager://rehab/seed-contract",
  key: Buffer.alloc(32, 23),
};
const recordId = "42b4694d-8b2e-49db-b38a-c3c688c5e301";

function sourceOf(path: string) {
  return readFileSync(resolve(__dirname, path), "utf8");
}

test("seed envelope builders bind ciphertext to the exact real-row AAD", () => {
  const mainEnvelope = seedEnvelope(
    { reviewNote: "只存在于密文中的训练复核说明" },
    "training_result",
    recordId,
    "reviewEnvelope",
    encryptionKey,
  );
  assert.deepEqual(
    decryptSensitiveJson(
      mainEnvelope,
      {
        tableName: "training_result",
        recordId,
        fieldName: "reviewEnvelope",
      },
      encryptionKey,
    ),
    { reviewNote: "只存在于密文中的训练复核说明" },
  );
  assert.doesNotMatch(
    JSON.stringify(mainEnvelope),
    /只存在于密文中的训练复核说明/,
  );

  const trialUserEnvelope = trialEnvelope(
    { displayName: "试点密文医生", mobilePhone: "13900139000" },
    recordId,
    encryptionKey,
  );
  assert.deepEqual(
    decryptSensitiveJson(
      trialUserEnvelope,
      { tableName: "user", recordId, fieldName: "identityEnvelope" },
      encryptionKey,
    ),
    { displayName: "试点密文医生", mobilePhone: "13900139000" },
  );
  assert.doesNotMatch(
    JSON.stringify(trialUserEnvelope),
    /试点密文医生|13900139000/,
  );
});

test("seed scripts require the strict key before their first database write", () => {
  const mainSeed = sourceOf("../prisma/seed.ts");
  const trialSeed = sourceOf("../prisma/seed-trial.ts");
  assert.ok(
    mainSeed.indexOf("requireSensitiveBackfillKey(process.env)") <
      mainSeed.indexOf("prisma.roleDefinition.createMany"),
  );
  assert.ok(
    trialSeed.indexOf("requireSensitiveBackfillKey(process.env)") <
      trialSeed.indexOf("await ensureRoleDefinitions()"),
  );
});

test("main seed sensitive writers use canonical ids, envelopes, lookups, and idempotent row resolution", () => {
  const source = sourceOf("../prisma/seed.ts");
  const canonicalUuidV4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const fixedRowIds = [
    ...source.matchAll(
      /const seed(?:Assessment|RiskGrade|AiAnalysis|TrainingResult|PatientProfile)Id = "([^"]+)"/g,
    ),
  ];
  assert.equal(fixedRowIds.length, 5);
  for (const id of fixedRowIds) {
    assert.match(id[1], canonicalUuidV4);
  }
  const seedUserIds = source.match(
    /const seedUserIds = \{([\s\S]*?)\} as const;/,
  )?.[1];
  assert.ok(seedUserIds);
  const fixedUserIds = [...seedUserIds.matchAll(/:\s*"([^"]+)"/g)];
  assert.equal(fixedUserIds.length, 6);
  for (const id of fixedUserIds) {
    assert.match(id[1], canonicalUuidV4);
  }
  assert.match(source, /createPhoneLookupHmac/);
  assert.match(source, /existing\?\.id \?\? input\.id/);
  assert.match(source, /existingPatient\?\.id \?\? seedPatientProfileId/);
  assert.match(
    source,
    /existingTrainingResult\?\.id \?\? seedTrainingResultId/,
  );
  for (const envelopeField of [
    "identityEnvelope",
    "contactEnvelope",
    "careDetailsEnvelope",
    "resultEnvelope",
    "reasonEnvelope",
    "inputEnvelope",
    "outputEnvelope",
    "reviewEnvelope",
  ]) {
    assert.match(source, new RegExp(`\\b${envelopeField}\\b`));
  }
  assert.doesNotMatch(
    source,
    /id:\s*"seed-(?:assessment|risk-grade|ai-analysis)/,
  );
});

test("main seed never copies the encrypted medical-record sentinel into other JSON columns", () => {
  const source = sourceOf("../prisma/seed.ts");
  const references = source.match(/\bseedMedicalRecordNo\b/g) ?? [];

  assert.equal(references.length, 4);
  assert.doesNotMatch(
    source,
    /(?:evidenceSnapshot|rawSummary|metadata):\s*\{[^}]*medicalRecordNo:\s*seedMedicalRecordNo/,
  );
});

test("seed Prisma sensitive write blocks contain no legacy plaintext columns", () => {
  const mainSeed = sourceOf("../prisma/seed.ts");
  const trialSeed = sourceOf("../prisma/seed-trial.ts");
  const mainUserWrite = mainSeed.match(
    /return prisma\.user\.upsert\(\{[\s\S]*?\n  \}\);/,
  )?.[0];
  const patientWrite = mainSeed.match(
    /const patient = await prisma\.patientProfile\.upsert\(\{[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(mainUserWrite);
  assert.ok(patientWrite);
  assert.doesNotMatch(mainUserWrite, /\bdisplayName\s*:|\bmobilePhone\s*:/);
  assert.doesNotMatch(
    patientWrite,
    /\bname\s*:|\bgender\s*:|\bage\s*:|\bmobilePhone\s*:|\bcaregiverName\s*:|\bcaregiverPhone\s*:|\bhealthMetrics\s*:/,
  );

  const trialUserWrites = [
    ...trialSeed.matchAll(/await tx\.user\.create\(\{[\s\S]*?\n    \}\);/g),
  ];
  assert.equal(trialUserWrites.length, 2);
  for (const write of trialUserWrites) {
    assert.doesNotMatch(write[0], /\bdisplayName\s*:|\bmobilePhone\s*:/);
    assert.match(write[0], /identityEnvelope/);
    assert.match(write[0], /mobilePhoneLookup/);
  }
});

test("trial seed creates organization and identities without update/upsert paths", () => {
  const source = readFileSync(
    resolve(__dirname, "../prisma/seed-trial.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /organization\.upsert/);
  assert.doesNotMatch(source, /user\.upsert/);
  assert.match(source, /organization\.create/);
  assert.match(source, /user\.create/g);
  assert.match(source, /passwordResetRequired:\s*true/g);
});

test("all ordinary main-seed identities require a first-login password reset", () => {
  const source = readFileSync(resolve(__dirname, "../prisma/seed.ts"), "utf8");
  const seedUserCalls = source.match(/await upsertEncryptedSeedUser\(/g) ?? [];
  const helper = source.match(
    /async function upsertEncryptedSeedUser\([\s\S]*?\n\}/,
  )?.[0];

  assert.equal(seedUserCalls.length, 6);
  assert.ok(helper);
  assert.match(helper, /passwordResetRequired:\s*true/);
});

test("database package exposes controlled first-admin and production bootstrap commands", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(__dirname, "../package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts["credential:reset"], undefined);
  assert.equal(
    packageJson.scripts["credential:reset:first-admin"],
    "tsx src/reset-credential.ts",
  );
  assert.equal(
    packageJson.scripts["bootstrap:production"],
    "tsx src/production-bootstrap.ts",
  );
});
