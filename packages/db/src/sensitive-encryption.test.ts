import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import test from "node:test";
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES,
  type SensitiveEncryptionAad,
  type SensitiveEncryptionEnvelope,
  type SensitiveEncryptionKey,
} from "./sensitive-encryption";
import {
  createPhoneLookupHmac as exportedCreatePhoneLookupHmac,
  decryptSensitiveJson as exportedDecryptSensitiveJson,
  encryptSensitiveJson as exportedEncryptSensitiveJson,
} from "./index";

const encryptionKey: SensitiveEncryptionKey = {
  kid: "sensitive-data-key-2026-07",
  key: Buffer.alloc(32, 7),
};

const aad: SensitiveEncryptionAad = {
  tableName: "registration_request",
  recordId: "550e8400-e29b-41d4-a716-446655440000",
  fieldName: "profileSnapshot",
};

function createAuthenticatedTestEnvelope(
  plaintext: Buffer,
): SensitiveEncryptionEnvelope {
  const nonce = Buffer.alloc(12, 5);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey.key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(aad), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    alg: "AES-256-GCM",
    kid: encryptionKey.kid,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    aad,
    contentType: "application/json",
  };
}

test("AES-256-GCM envelope round-trips JSON without exposing plaintext", () => {
  const value = {
    displayName: "李秀兰",
    mobilePhone: "13900000001",
    profile: { age: 72, diagnoses: ["mild", null] },
  };

  const first = encryptSensitiveJson(value, aad, encryptionKey);
  const second = encryptSensitiveJson(value, aad, encryptionKey);

  assert.deepEqual(decryptSensitiveJson(first, aad, encryptionKey), value);
  assert.equal(first.v, 1);
  assert.equal(first.alg, "AES-256-GCM");
  assert.equal(first.kid, encryptionKey.kid);
  assert.equal(first.contentType, "application/json");
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.doesNotMatch(JSON.stringify(first), /李秀兰|13900000001/);
});

test("encryption requires one exact non-empty key id and 32-byte key", () => {
  assert.throws(
    () =>
      encryptSensitiveJson({ ok: true }, aad, { ...encryptionKey, kid: "" }),
    /key id/i,
  );
  assert.throws(
    () =>
      encryptSensitiveJson({ ok: true }, aad, {
        kid: encryptionKey.kid,
        key: Buffer.alloc(31),
      }),
    /32 bytes/i,
  );
});

test("decryption hard-fails for a different key id", () => {
  const envelope = encryptSensitiveJson({ ok: true }, aad, encryptionKey);

  assert.throws(
    () =>
      decryptSensitiveJson(envelope, aad, {
        kid: "sensitive-data-key-other",
        key: encryptionKey.key,
      }),
    /key id/i,
  );
});

test("AAD requires an actual canonical UUID record id", () => {
  for (const recordId of [
    "request-id",
    "550e8400e29b41d4a716446655440000",
    "00000000-0000-0000-0000-000000000000",
  ]) {
    assert.throws(
      () =>
        encryptSensitiveJson({ ok: true }, { ...aad, recordId }, encryptionKey),
      /UUID/i,
    );
  }
});

test("AAD contains exactly non-empty tableName, recordId, and fieldName fields", () => {
  for (const invalidAad of [
    { ...aad, tableName: "" },
    { ...aad, fieldName: "" },
    { ...aad, unexpected: "value" },
  ]) {
    assert.throws(
      () =>
        encryptSensitiveJson(
          { ok: true },
          invalidAad as SensitiveEncryptionAad,
          encryptionKey,
        ),
      /AAD/i,
    );
  }
});

test("AAD rejects accessor properties because they are not JSON data fields", () => {
  const accessorAad = {};
  for (const [key, value] of Object.entries(aad)) {
    Object.defineProperty(accessorAad, key, {
      enumerable: true,
      get: () => value,
    });
  }

  assert.throws(
    () =>
      encryptSensitiveJson(
        { ok: true },
        accessorAad as SensitiveEncryptionAad,
        encryptionKey,
      ),
    /AAD/i,
  );
});

test("AAD comparison is canonical and independent of object key order", () => {
  const uppercaseReorderedAad = {
    fieldName: aad.fieldName,
    recordId: aad.recordId.toUpperCase(),
    tableName: aad.tableName,
  };
  const envelope = encryptSensitiveJson(
    { ok: true },
    uppercaseReorderedAad,
    encryptionKey,
  );

  assert.equal(envelope.aad.recordId, aad.recordId);
  assert.deepEqual(decryptSensitiveJson(envelope, aad, encryptionKey), {
    ok: true,
  });
});

test("decryption hard-fails when expected AAD differs", () => {
  const envelope = encryptSensitiveJson({ ok: true }, aad, encryptionKey);

  assert.throws(
    () =>
      decryptSensitiveJson(
        envelope,
        { ...aad, fieldName: "otherField" },
        encryptionKey,
      ),
    /AAD/i,
  );
});

test("all supported JSON values round-trip without type loss", () => {
  const values = [
    null,
    true,
    false,
    0,
    -42.5,
    "",
    "中文 🌿",
    [],
    {},
    { nested: [1, "two", false, null, { leaf: "value" }] },
  ];

  for (const value of values) {
    const envelope = encryptSensitiveJson(value, aad, encryptionKey);
    assert.deepEqual(decryptSensitiveJson(envelope, aad, encryptionKey), value);
  }
});

test("encryption rejects values that are not lossless JSON inputs", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const sparse = new Array(2);
  sparse[1] = "value";
  const invalidValues = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -0,
    1n,
    Symbol("value"),
    () => "value",
    new Date("2026-07-13T00:00:00.000Z"),
    new Map([["key", "value"]]),
    { missing: undefined },
    sparse,
    circular,
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => encryptSensitiveJson(value, aad, encryptionKey),
      /valid JSON/i,
    );
  }
});

test("encryption rejects JSON whose ciphertext would exceed the contract bound", () => {
  assert.throws(
    () =>
      encryptSensitiveJson(
        "x".repeat(SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES),
        aad,
        encryptionKey,
      ),
    /ciphertext.*bound/i,
  );
});

test("envelope survives a JSON serialization boundary", () => {
  const value = { nested: ["value", 3, null] };
  const persisted = JSON.parse(
    JSON.stringify(encryptSensitiveJson(value, aad, encryptionKey)),
  ) as SensitiveEncryptionEnvelope;

  assert.deepEqual(decryptSensitiveJson(persisted, aad, encryptionKey), value);
});

test("decryption checks exact envelope version, algorithm, key id, and content type", () => {
  const envelope = encryptSensitiveJson({ ok: true }, aad, encryptionKey);
  const invalidEnvelopes = [
    { ...envelope, v: 2 },
    { ...envelope, v: "1" },
    { ...envelope, alg: "AES-256-CBC" },
    { ...envelope, kid: `${envelope.kid} ` },
    { ...envelope, contentType: "text/plain" },
  ];

  for (const invalidEnvelope of invalidEnvelopes) {
    assert.throws(
      () =>
        decryptSensitiveJson(
          invalidEnvelope as unknown as SensitiveEncryptionEnvelope,
          aad,
          encryptionKey,
        ),
      /envelope|key id/i,
    );
  }
});

test("decryption rejects malformed envelope objects and unknown fields", () => {
  const envelope = encryptSensitiveJson({ ok: true }, aad, encryptionKey);
  for (const malformed of [
    null,
    [],
    { ...envelope, tag: undefined },
    { ...envelope, unexpected: true },
  ]) {
    assert.throws(
      () =>
        decryptSensitiveJson(
          malformed as unknown as SensitiveEncryptionEnvelope,
          aad,
          encryptionKey,
        ),
      /envelope/i,
    );
  }
});

test("decryption requires strict canonical base64 fields", () => {
  const envelope = encryptSensitiveJson({ ok: true }, aad, encryptionKey);
  const invalidEnvelopes = [
    { ...envelope, nonce: `${envelope.nonce}\n` },
    { ...envelope, tag: envelope.tag.replace(/=+$/, "") },
    { ...envelope, ciphertext: `${envelope.ciphertext} ` },
    { ...envelope, ciphertext: "*" },
  ];

  for (const invalidEnvelope of invalidEnvelopes) {
    assert.throws(
      () => decryptSensitiveJson(invalidEnvelope, aad, encryptionKey),
      /base64/i,
    );
  }
});

test("decryption requires 12-byte nonce, 16-byte tag, and non-empty bounded ciphertext", () => {
  const envelope = encryptSensitiveJson({ ok: true }, aad, encryptionKey);
  const invalidEnvelopes = [
    { ...envelope, nonce: Buffer.alloc(11).toString("base64") },
    { ...envelope, tag: Buffer.alloc(15).toString("base64") },
    { ...envelope, ciphertext: "" },
    {
      ...envelope,
      ciphertext: Buffer.alloc(
        SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES + 1,
      ).toString("base64"),
    },
  ];

  for (const invalidEnvelope of invalidEnvelopes) {
    assert.throws(
      () => decryptSensitiveJson(invalidEnvelope, aad, encryptionKey),
      /nonce|tag|ciphertext/i,
    );
  }
});

test("same kid with wrong key material and authenticated-field tampering hard-fail", () => {
  const envelope = encryptSensitiveJson(
    { secret: "value" },
    aad,
    encryptionKey,
  );
  const tamperedCiphertext = Buffer.from(envelope.ciphertext, "base64");
  tamperedCiphertext[0] ^= 1;

  assert.throws(
    () =>
      decryptSensitiveJson(envelope, aad, {
        kid: encryptionKey.kid,
        key: Buffer.alloc(32, 8),
      }),
    /authentication/i,
  );
  assert.throws(
    () =>
      decryptSensitiveJson(
        { ...envelope, ciphertext: tamperedCiphertext.toString("base64") },
        aad,
        encryptionKey,
      ),
    /authentication/i,
  );
  assert.throws(
    () =>
      decryptSensitiveJson(
        { ...envelope, tag: Buffer.alloc(16, 1).toString("base64") },
        aad,
        encryptionKey,
      ),
    /authentication/i,
  );
});

test("decryption rejects authenticated payloads outside the supported JSON domain", () => {
  const nonFiniteJsonNumber = createAuthenticatedTestEnvelope(
    Buffer.from("1e400", "utf8"),
  );
  const invalidUtf8JsonString = createAuthenticatedTestEnvelope(
    Buffer.from([0x22, 0xc3, 0x28, 0x22]),
  );

  assert.throws(
    () => decryptSensitiveJson(nonFiniteJsonNumber, aad, encryptionKey),
    /valid JSON/i,
  );
  assert.throws(
    () => decryptSensitiveJson(invalidUtf8JsonString, aad, encryptionKey),
    /UTF-8|valid JSON/i,
  );
});

test("phone lookup HMAC is deterministic canonical lowercase hex and hides the phone", () => {
  const hmacKey = Buffer.alloc(32, 9);
  const digest = createPhoneLookupHmac("13800138000", hmacKey);

  assert.equal(
    digest,
    "b5a655a18948ae28b9955e1ea6d01c898b2e6f5ce9fdb65b7572449f9259e640",
  );
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(digest, /13800138000|8613800138000/);
  assert.equal(createPhoneLookupHmac("13800138000", hmacKey), digest);
});

test("phone lookup canonicalizes supported mainland mobile representations", () => {
  const hmacKey = Buffer.alloc(32, 9);
  const expected = createPhoneLookupHmac("13800138000", hmacKey);

  assert.equal(createPhoneLookupHmac("+86 138-0013-8000", hmacKey), expected);
  assert.equal(
    createPhoneLookupHmac("0086 (138) 0013 8000", hmacKey),
    expected,
  );
});

test("phone lookup validates phone input before hashing", () => {
  const hmacKey = Buffer.alloc(32, 9);
  for (const invalidPhone of [
    null,
    13800138000,
    "",
    "12345678",
    "12800138000",
    "+86 128 0013 8000",
    "+86 138 0013 8000 ext 2",
    "+86++13800138000",
  ]) {
    assert.throws(
      () => createPhoneLookupHmac(invalidPhone as string, hmacKey),
      /phone input/i,
    );
  }
});

test("phone lookup requires a separately supplied exact 32-byte HMAC key", () => {
  assert.throws(
    () => createPhoneLookupHmac("13800138000", Buffer.alloc(31)),
    /32 bytes/i,
  );
  assert.notEqual(
    createPhoneLookupHmac("13800138000", Buffer.alloc(32, 9)),
    createPhoneLookupHmac("13800138000", Buffer.alloc(32, 10)),
  );
});

test("database package index exports the shared crypto contract", () => {
  assert.equal(exportedEncryptSensitiveJson, encryptSensitiveJson);
  assert.equal(exportedDecryptSensitiveJson, decryptSensitiveJson);
  assert.equal(exportedCreatePhoneLookupHmac, createPhoneLookupHmac);
});
