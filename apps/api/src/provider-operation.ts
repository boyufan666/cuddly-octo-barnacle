import { createHash, createHmac } from 'node:crypto';

export const providerOperationKinds = [
  'assessment_draft',
  'conversation_turn',
  'speech_transcript',
  'tts_output',
] as const;

export type ProviderOperationKind = (typeof providerOperationKinds)[number];

export const providerOperationStatuses = [
  'accepted',
  'reserved',
  'dispatching',
  'completed',
  'provider_failed',
  'response_rejected',
  'outcome_unknown',
  'completed_confirmed',
  'closed_unconfirmed',
] as const;

export type ProviderOperationStatus =
  (typeof providerOperationStatuses)[number];

export type ProviderOperationIdentity = {
  organizationId: string;
  patientId: string;
  actorUserId: string;
  operation: ProviderOperationKind;
  clientIdempotencyKey: string;
};

const canonicalRequestVersion = 'provider-operation-request-v1';
const canonicalRequestIntentVersion = 'provider-operation-intent-v1';
const canonicalResponseVersion = 'provider-operation-response-v1';

const allowedStatusTransitions: Readonly<
  Record<ProviderOperationStatus, readonly ProviderOperationStatus[]>
> = {
  accepted: ['reserved'],
  reserved: ['dispatching'],
  dispatching: [
    'completed',
    'provider_failed',
    'response_rejected',
    'outcome_unknown',
  ],
  completed: [],
  provider_failed: [],
  response_rejected: [],
  outcome_unknown: ['completed_confirmed', 'closed_unconfirmed'],
  completed_confirmed: [],
  closed_unconfirmed: [],
};

/**
 * Returns the deterministic operation identity representation used only for
 * hashing and HMAC input. It must not be persisted in place of its columns.
 */
export function canonicalizeProviderOperationIdentity(
  identity: ProviderOperationIdentity,
): string {
  assertProviderOperationIdentity(identity);
  return canonicalizeJson({
    actorUserId: identity.actorUserId,
    clientIdempotencyKey: identity.clientIdempotencyKey,
    operation: identity.operation,
    organizationId: identity.organizationId,
    patientId: identity.patientId,
  });
}

/**
 * Creates a non-secret fingerprint of the operation identity for correlation
 * only. Request payloads must use the keyed HMAC function below instead.
 */
export function createProviderOperationIdentityHash(
  identity: ProviderOperationIdentity,
): string {
  return createHash('sha256')
    .update(canonicalizeProviderOperationIdentity(identity), 'utf8')
    .digest('hex');
}

/**
 * Creates the value for ProviderOperation.canonicalRequestHmac. The HMAC
 * binds a request to its full identity without retaining its raw payload.
 */
export function createProviderOperationRequestHmac(
  identity: ProviderOperationIdentity,
  request: unknown,
  hmacKey: Uint8Array,
): string {
  assertHmacKey(hmacKey);
  const canonicalRequest = `{"identity":${canonicalizeProviderOperationIdentity(
    identity,
  )},"request":${canonicalizeJson(request)},"version":${JSON.stringify(
    canonicalRequestVersion,
  )}}`;

  return createHmac('sha256', hmacKey)
    .update(canonicalRequest, 'utf8')
    .digest('hex');
}

/**
 * Creates a request-intent HMAC that deliberately excludes the caller key,
 * actor, and provider configuration. It prevents a pending high-cost intent
 * from being sent again by changing any of those fields.
 */
export function createProviderOperationRequestIntentHmac(
  identity: ProviderOperationIdentity,
  request: unknown,
  hmacKey: Uint8Array,
  expectedBusinessObject?: {
    type: string;
    id: string;
    version: string;
  },
): string {
  assertProviderOperationIdentity(identity);
  assertHmacKey(hmacKey);
  if (expectedBusinessObject !== undefined) {
    assertExpectedBusinessObject(expectedBusinessObject);
  }
  const canonicalIntent = `{"expectedBusinessObject":${canonicalizeJson(
    expectedBusinessObject ?? null,
  )},"request":${canonicalizeJson(request)},"scope":${canonicalizeJson({
    operation: identity.operation,
    organizationId: identity.organizationId,
    patientId: identity.patientId,
  })},"version":${JSON.stringify(canonicalRequestIntentVersion)}}`;

  return createHmac('sha256', hmacKey)
    .update(canonicalIntent, 'utf8')
    .digest('hex');
}

/**
 * Creates the value for ProviderOperation.responseHmac. The response remains
 * encrypted at rest; this keyed fingerprint makes its exact canonical value
 * independently tamper-evident without storing it in clear text.
 */
export function createProviderOperationResponseHmac(
  operationId: string,
  response: unknown,
  hmacKey: Uint8Array,
): string {
  assertCanonicalOperationId(operationId);
  assertHmacKey(hmacKey);
  const canonicalResponse = `{"operationId":${JSON.stringify(
    operationId,
  )},"response":${canonicalizeJson(response)},"version":${JSON.stringify(
    canonicalResponseVersion,
  )}}`;

  return createHmac('sha256', hmacKey)
    .update(canonicalResponse, 'utf8')
    .digest('hex');
}

export function isProviderOperationKind(
  value: unknown,
): value is ProviderOperationKind {
  return (
    typeof value === 'string' &&
    (providerOperationKinds as readonly string[]).includes(value)
  );
}

export function isProviderOperationStatus(
  value: unknown,
): value is ProviderOperationStatus {
  return (
    typeof value === 'string' &&
    (providerOperationStatuses as readonly string[]).includes(value)
  );
}

/**
 * Evaluates only the explicit state diagram. It intentionally does not allow
 * no-op, terminal, retry, or status-skipping transitions.
 */
export function canTransitionProviderOperationStatus(
  from: ProviderOperationStatus,
  to: ProviderOperationStatus,
): boolean {
  if (!isProviderOperationStatus(from) || !isProviderOperationStatus(to)) {
    return false;
  }
  return allowedStatusTransitions[from].includes(to);
}

export function assertProviderOperationStatusTransition(
  from: ProviderOperationStatus,
  to: ProviderOperationStatus,
): void {
  if (!isProviderOperationStatus(from) || !isProviderOperationStatus(to)) {
    throw new Error('Provider operation status must be recognized.');
  }
  if (!canTransitionProviderOperationStatus(from, to)) {
    throw new Error(
      `Provider operation status cannot transition from ${from} to ${to}.`,
    );
  }
}

function assertProviderOperationIdentity(
  identity: ProviderOperationIdentity,
): void {
  if (!isPlainRecord(identity)) {
    throw new Error('Provider operation identity must be a plain object.');
  }
  for (const field of [
    'organizationId',
    'patientId',
    'actorUserId',
    'clientIdempotencyKey',
  ] as const) {
    assertExactIdentifier(identity[field], field);
  }
  if (!isProviderOperationKind(identity.operation)) {
    throw new Error(
      'Provider operation identity has an unsupported operation.',
    );
  }
}

function assertExactIdentifier(value: unknown, field: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value
  ) {
    throw new Error(
      `Provider operation identity ${field} must be an exact non-empty string.`,
    );
  }
}

function assertCanonicalOperationId(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(
      'Provider operation response operationId must be a canonical UUID.',
    );
  }
}

function assertHmacKey(hmacKey: Uint8Array): void {
  if (!(hmacKey instanceof Uint8Array) || hmacKey.byteLength !== 32) {
    throw new Error('Provider operation HMAC key must be exactly 32 bytes.');
  }
}

function assertExpectedBusinessObject(value: {
  type: string;
  id: string;
  version: string;
}): void {
  if (!isPlainRecord(value)) {
    throw new Error('Expected business object must be a plain object.');
  }
  for (const field of ['type', 'id', 'version'] as const) {
    assertExactIdentifier(value[field], `expectedBusinessObject.${field}`);
  }
}

function canonicalizeJson(value: unknown): string {
  return canonicalizeJsonValue(value, new Set<object>());
}

function canonicalizeJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error('Provider operation request must be valid JSON.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new Error('Provider operation request must be valid JSON.');
  }
  if (ancestors.has(value)) {
    throw new Error(
      'Provider operation request must be valid JSON and acyclic.',
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return canonicalizeJsonArray(value, ancestors);
    }
    if (!isPlainRecord(value)) {
      throw new Error(
        'Provider operation request must be a plain JSON object.',
      );
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new Error(
        'Provider operation request must be a plain JSON object.',
      );
    }
    return `{${(keys as string[])
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error(
            'Provider operation request must be a plain JSON object.',
          );
        }
        return `${JSON.stringify(key)}:${canonicalizeJsonValue(
          descriptor.value,
          ancestors,
        )}`;
      })
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalizeJsonArray(
  value: unknown[],
  ancestors: Set<object>,
): string {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1 ||
    ownKeys[ownKeys.length - 1] !== 'length'
  ) {
    throw new Error('Provider operation request must be a valid JSON array.');
  }
  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new Error('Provider operation request must be a valid JSON array.');
    }
    items.push(canonicalizeJsonValue(descriptor.value, ancestors));
  }
  return `[${items.join(',')}]`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
