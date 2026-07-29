import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { TextDecoder } from "node:util";

export const SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES = 1_048_576;

export type SensitiveEncryptionAad = {
  tableName: string;
  recordId: string;
  fieldName: string;
};

export type SensitiveEncryptionKey = {
  kid: string;
  key: Uint8Array;
};

export type SensitiveEncryptionEnvelope = {
  v: 1;
  alg: "AES-256-GCM";
  kid: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  aad: SensitiveEncryptionAad;
  contentType: "application/json";
};

export function createPhoneLookupHmac(
  phone: string,
  hmacKey: Uint8Array,
): string {
  if (!(hmacKey instanceof Uint8Array) || hmacKey.byteLength !== 32) {
    throw new Error("Phone lookup HMAC key must be exactly 32 bytes.");
  }
  const normalizedPhone = normalizePhoneForLookup(phone);
  return createHmac("sha256", hmacKey)
    .update(normalizedPhone, "utf8")
    .digest("hex");
}

function normalizePhoneForLookup(phone: unknown): string {
  if (typeof phone !== "string") {
    throw new Error("Phone input must be a string.");
  }
  const trimmed = phone.trim();
  if (trimmed.length === 0 || !/^[+0-9 ()-]+$/.test(trimmed)) {
    throw new Error("Phone input contains unsupported characters.");
  }
  const compact = trimmed.replace(/[ ()-]/g, "");
  const mainlandMobile = /^1[3-9][0-9]{9}$/;
  if (mainlandMobile.test(compact)) {
    return `+86${compact}`;
  }
  if (compact.startsWith("0086")) {
    const nationalNumber = compact.slice(4);
    if (mainlandMobile.test(nationalNumber)) {
      return `+86${nationalNumber}`;
    }
    throw new Error("Phone input is not a valid mainland mobile number.");
  }
  if (compact.startsWith("+86")) {
    const nationalNumber = compact.slice(3);
    if (mainlandMobile.test(nationalNumber)) {
      return `+86${nationalNumber}`;
    }
    throw new Error("Phone input is not a valid mainland mobile number.");
  }
  if (/^\+[1-9][0-9]{7,14}$/.test(compact)) {
    return compact;
  }
  throw new Error(
    "Phone input is not a valid E.164 or mainland mobile number.",
  );
}

export function encryptSensitiveJson(
  value: unknown,
  aad: SensitiveEncryptionAad,
  encryptionKey: SensitiveEncryptionKey,
): SensitiveEncryptionEnvelope {
  assertEncryptionKey(encryptionKey);
  const canonicalAad = canonicalizeAad(aad);
  const serializedValue = serializeJsonValue(value);
  const plaintext = Buffer.from(serializedValue, "utf8");
  if (plaintext.byteLength > SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES) {
    throw new Error(
      "Sensitive encryption ciphertext would exceed the contract bound.",
    );
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey.key, nonce);
  cipher.setAAD(aadToBuffer(canonicalAad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    v: 1,
    alg: "AES-256-GCM",
    kid: encryptionKey.kid,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    aad: canonicalAad,
    contentType: "application/json",
  };
}

export function decryptSensitiveJson<T = unknown>(
  envelope: unknown,
  aad: SensitiveEncryptionAad,
  encryptionKey: SensitiveEncryptionKey,
): T {
  assertEncryptionKey(encryptionKey);
  const validatedEnvelope = validateEnvelope(envelope);
  if (validatedEnvelope.envelope.kid !== encryptionKey.kid) {
    throw new Error("Sensitive encryption key id does not match envelope kid.");
  }
  const envelopeAad = canonicalizeAad(validatedEnvelope.envelope.aad);
  const expectedAad = canonicalizeAad(aad);
  if (aadToBuffer(envelopeAad).compare(aadToBuffer(expectedAad)) !== 0) {
    throw new Error(
      "Sensitive encryption AAD does not match the expected record field.",
    );
  }
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey.key,
      validatedEnvelope.nonce,
    );
    decipher.setAAD(aadToBuffer(expectedAad));
    decipher.setAuthTag(validatedEnvelope.tag);
    plaintext = Buffer.concat([
      decipher.update(validatedEnvelope.ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Sensitive encryption authentication failed.");
  }
  let serializedValue: string;
  try {
    serializedValue = new TextDecoder("utf-8", { fatal: true }).decode(
      plaintext,
    );
  } catch {
    throw new Error("Sensitive encryption payload is not valid UTF-8 JSON.");
  }
  try {
    const value = JSON.parse(serializedValue) as unknown;
    assertJsonValue(value, new Set<object>());
    return value as T;
  } catch {
    throw new Error("Sensitive encryption payload is not valid JSON.");
  }
}

function validateEnvelope(envelope: unknown): {
  envelope: SensitiveEncryptionEnvelope;
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
} {
  const expectedKeys = [
    "aad",
    "alg",
    "ciphertext",
    "contentType",
    "kid",
    "nonce",
    "tag",
    "v",
  ];
  if (
    !isPlainRecord(envelope) ||
    !hasExactDataProperties(envelope, expectedKeys)
  ) {
    throw new Error("Sensitive encryption envelope has an invalid shape.");
  }
  if (
    envelope.v !== 1 ||
    envelope.alg !== "AES-256-GCM" ||
    envelope.contentType !== "application/json"
  ) {
    throw new Error(
      "Sensitive encryption envelope version, algorithm, or content type is invalid.",
    );
  }
  assertKeyId(envelope.kid);
  const nonce = decodeCanonicalBase64(envelope.nonce, "nonce", 12);
  if (nonce.byteLength !== 12) {
    throw new Error(
      "Sensitive encryption envelope nonce must be exactly 12 bytes.",
    );
  }
  const tag = decodeCanonicalBase64(envelope.tag, "tag", 16);
  if (tag.byteLength !== 16) {
    throw new Error(
      "Sensitive encryption envelope tag must be exactly 16 bytes.",
    );
  }
  const ciphertext = decodeCanonicalBase64(
    envelope.ciphertext,
    "ciphertext",
    SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES,
  );
  if (ciphertext.byteLength === 0) {
    throw new Error(
      "Sensitive encryption envelope ciphertext must be non-empty.",
    );
  }
  canonicalizeAad(envelope.aad as SensitiveEncryptionAad);

  return {
    envelope: envelope as SensitiveEncryptionEnvelope,
    nonce,
    ciphertext,
    tag,
  };
}

function decodeCanonicalBase64(
  value: unknown,
  field: "nonce" | "ciphertext" | "tag",
  maxBytes: number,
): Buffer {
  if (typeof value !== "string") {
    throw new Error(
      `Sensitive encryption envelope ${field} must be canonical base64.`,
    );
  }
  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
  if (value.length > maxEncodedLength) {
    throw new Error(
      `Sensitive encryption envelope ${field} is not canonical base64 within its byte bound.`,
    );
  }
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error(
      `Sensitive encryption envelope ${field} must be canonical base64.`,
    );
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(
      `Sensitive encryption envelope ${field} must be canonical base64.`,
    );
  }
  if (decoded.byteLength > maxBytes) {
    throw new Error(
      `Sensitive encryption envelope ${field} exceeds its byte bound.`,
    );
  }
  return decoded;
}

function serializeJsonValue(value: unknown): string {
  assertJsonValue(value, new Set<object>());
  return JSON.stringify(value);
}

function assertJsonValue(value: unknown, ancestors: Set<object>): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("Sensitive encryption input must be valid JSON.");
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error("Sensitive encryption input must be valid JSON.");
  }
  if (ancestors.has(value)) {
    throw new Error(
      "Sensitive encryption input must be valid JSON and acyclic.",
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertJsonArray(value, ancestors);
      return;
    }
    if (!isPlainRecord(value)) {
      throw new Error(
        "Sensitive encryption input must be a valid JSON object.",
      );
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new Error(
          "Sensitive encryption input must be a valid JSON object.",
        );
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(
          "Sensitive encryption input must be a valid JSON object.",
        );
      }
      assertJsonValue(descriptor.value, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function assertJsonArray(value: unknown[], ancestors: Set<object>): void {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1 ||
    ownKeys[ownKeys.length - 1] !== "length"
  ) {
    throw new Error("Sensitive encryption input must be a valid JSON array.");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error("Sensitive encryption input must be a valid JSON array.");
    }
    assertJsonValue(descriptor.value, ancestors);
  }
}

function canonicalizeAad(aad: SensitiveEncryptionAad): SensitiveEncryptionAad {
  if (!isPlainRecord(aad)) {
    throw new Error("Sensitive encryption AAD must be a plain object.");
  }
  if (!hasExactDataProperties(aad, ["fieldName", "recordId", "tableName"])) {
    throw new Error(
      "Sensitive encryption AAD must contain exactly tableName, recordId, and fieldName.",
    );
  }
  assertAadName(aad.tableName, "tableName");
  assertAadName(aad.fieldName, "fieldName");
  if (
    typeof aad.recordId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      aad.recordId,
    )
  ) {
    throw new Error(
      "Sensitive encryption AAD recordId must be a canonical UUID.",
    );
  }
  return {
    tableName: aad.tableName,
    recordId: aad.recordId.toLowerCase(),
    fieldName: aad.fieldName,
  };
}

function assertAadName(value: unknown, field: "tableName" | "fieldName"): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value
  ) {
    throw new Error(
      `Sensitive encryption AAD ${field} must be an exact non-empty string.`,
    );
  }
}

function assertEncryptionKey(
  encryptionKey: SensitiveEncryptionKey,
): asserts encryptionKey is SensitiveEncryptionKey {
  if (typeof encryptionKey !== "object" || encryptionKey === null) {
    throw new Error("Sensitive encryption key must be an object.");
  }
  assertKeyId(encryptionKey.kid);
  if (
    !(encryptionKey.key instanceof Uint8Array) ||
    encryptionKey.key.byteLength !== 32
  ) {
    throw new Error("Sensitive encryption key must be exactly 32 bytes.");
  }
}

function assertKeyId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value
  ) {
    throw new Error(
      "Sensitive encryption key id must be an exact non-empty string.",
    );
  }
}

function hasExactDataProperties(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key) => typeof key !== "string")
  ) {
    return false;
  }
  const stringKeys = (ownKeys as string[]).sort();
  if (stringKeys.some((key, index) => key !== expectedKeys[index])) {
    return false;
  }
  return stringKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function aadToBuffer(aad: SensitiveEncryptionAad): Buffer {
  return Buffer.from(
    JSON.stringify({
      tableName: aad.tableName,
      recordId: aad.recordId,
      fieldName: aad.fieldName,
    }),
    "utf8",
  );
}
