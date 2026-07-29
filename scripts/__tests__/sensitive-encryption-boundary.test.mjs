import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProductionEnvironment } from "../check-delivery-readiness.mjs";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("API uses the strict shared crypto contract without an environment-reading adapter", async () => {
  const adapterSource = await readFile(
    join(rootDir, "apps/api/src/sensitive-encryption.ts"),
    "utf8",
  );
  const sharedSource = await readFile(
    join(rootDir, "packages/db/src/sensitive-encryption.ts"),
    "utf8",
  );

  assert.match(adapterSource, /from '@rehab-platform\/db'/);
  assert.doesNotMatch(adapterSource, /process\.env|SENSITIVE_DATA_KEY|createCipheriv/);
  assert.match(sharedSource, /createCipheriv\("aes-256-gcm"/);
  assert.match(sharedSource, /createDecipheriv\(\s*"aes-256-gcm"/);
  assert.match(sharedSource, /byteLength !== 32/);
  assert.match(sharedSource, /recordId must be a canonical UUID/);
  assert.doesNotMatch(`${adapterSource}\n${sharedSource}`, /fallback|明文兜底/i);
});

test("care circle private metadata is encrypted before storage", async () => {
  const serviceSource = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );
  const postSource = sliceBetween(
    serviceSource,
    "async createCareCirclePost",
    "async createCareCircleComment",
  );
  const commentSource = sliceBetween(
    serviceSource,
    "async createCareCircleComment",
    "async moderateCareCirclePost",
  );

  assert.match(postSource, /privateMetadata/);
  assert.match(postSource, /encryptSensitiveJsonField/);
  assert.match(postSource, /tableName:\s*'care_circle_post'/);
  assert.match(commentSource, /privateMetadata/);
  assert.match(commentSource, /encryptSensitiveJsonField/);
  assert.match(commentSource, /tableName:\s*'care_circle_comment'/);
});

test("production readiness requires key references and rejects raw sensitive data key material", () => {
  const baseProductionEnv = {
    DATABASE_URL:
      "postgresql://rehab_prod:strong-password@db.prod.internal:5432/rehab_platform?schema=public",
    JWT_SECRET:
      "prod_secret_7u9v8w3x6y5z4a2b1c0d9e8f7g6h5j4k3l2m1n0p",
    WEB_ORIGIN: "https://rehab.example.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example.com",
    DEFAULT_PATIENT_PASSWORD: "initial-password-managed-by-ops",
    AI_REQUIRED_FOR_LAUNCH: "false",
    SPEECH_REQUIRED_FOR_LAUNCH: "false",
    TTS_REQUIRED_FOR_LAUNCH: "false",
  };

  assert.match(
    checkProductionEnvironment(baseProductionEnv).failures.join("\n"),
    /SENSITIVE_DATA_KEY_REF/,
  );
  assert.doesNotMatch(
    checkProductionEnvironment(baseProductionEnv).failures.join("\n"),
    /REDIS_URL/,
  );

  const rawKeyResult = checkProductionEnvironment({
    ...baseProductionEnv,
    SENSITIVE_DATA_KEY_REF: "secret-manager://rehab-prod/sensitive-data-key",
    SENSITIVE_DATA_KEY: Buffer.alloc(32, 4).toString("base64"),
  });

  assert.match(rawKeyResult.failures.join("\n"), /SENSITIVE_DATA_KEY.*明文/);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
