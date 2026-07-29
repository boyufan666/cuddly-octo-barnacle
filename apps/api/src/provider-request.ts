export type ProviderErrorKind =
  | 'timeout'
  | 'network'
  | 'upstream_http'
  | 'invalid_response'
  | 'aborted';

export type ProviderJsonValue =
  | null
  | boolean
  | number
  | string
  | ProviderJsonValue[]
  | { [key: string]: ProviderJsonValue };

export const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_PROVIDER_ERROR_BODY_BYTES = 1024;

export const MAX_PROVIDER_TIMEOUT_MS = 2_147_483_647;
export const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES = 16 * 1024;
const REDACTED = '[REDACTED]';
const TRUNCATED = '...[truncated]';
const UPSTREAM_BODY_UNAVAILABLE = '[UNAVAILABLE]';

const providerErrorMessages: Record<ProviderErrorKind, string> = {
  timeout: 'Provider request timed out.',
  network: 'Provider network request failed.',
  upstream_http: 'Provider returned an unsuccessful HTTP status.',
  invalid_response: 'Provider returned an invalid response.',
  aborted: 'Provider request was aborted.',
};

const secretFieldPattern =
  /authorization|api[-_ ]?key|token|secret|password|credential|cookie/i;
const errorMetadataFieldPattern =
  /^(?:code|type|status|request[-_]?id|trace[-_]?id|correlation[-_]?id)$/i;
const requestIdentifierFieldPattern =
  /^(?:request[-_]?id|trace[-_]?id|correlation[-_]?id)$/i;
const safeMetadataValuePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const allowedErrorJsonKeyPattern =
  /^(?:code|type|status|request[-_]?id|trace[-_]?id|correlation[-_]?id|error|errors|message|detail|transcript)$/i;
const unsafeRequestIdPattern =
  /(?:^|[^A-Za-z0-9])(?:bearer|basic|api[-_ ]?key|key|token|secret)(?:[^A-Za-z0-9]|$)/i;
const safeRequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

interface ProviderErrorDetails {
  upstreamStatus?: number;
  upstreamRequestId?: string;
  upstreamBody?: string;
}

interface UpstreamErrorMetadata {
  upstreamStatus: number;
  upstreamRequestId?: string;
}

export class ProviderRequestError extends Error {
  readonly kind: ProviderErrorKind;
  readonly upstreamStatus?: number;
  readonly upstreamRequestId?: string;
  readonly upstreamBody?: string;

  constructor(kind: ProviderErrorKind, details: ProviderErrorDetails = {}) {
    super(providerErrorMessages[kind]);
    this.name = 'ProviderRequestError';
    this.kind = kind;
    this.upstreamStatus = details.upstreamStatus;
    this.upstreamRequestId = details.upstreamRequestId;
    this.upstreamBody = details.upstreamBody;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      ...(this.upstreamStatus === undefined
        ? {}
        : { upstreamStatus: this.upstreamStatus }),
      ...(this.upstreamRequestId === undefined
        ? {}
        : { upstreamRequestId: this.upstreamRequestId }),
      ...(this.upstreamBody === undefined
        ? {}
        : { upstreamBody: this.upstreamBody }),
    };
  }
}

export interface ProviderRequestOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxResponseBytes?: number;
  maxErrorBodyBytes?: number;
}

export interface ReadProviderJsonOptions {
  maxResponseBytes?: number;
  signal?: AbortSignal;
}

interface BoundedBody {
  bytes: Uint8Array;
  truncated: boolean;
}

type AbortKind = 'timeout' | 'aborted';

export async function requestProviderJson(
  input: string | URL | Request,
  options: ProviderRequestOptions = {},
): Promise<ProviderJsonValue> {
  const {
    timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_PROVIDER_RESPONSE_BYTES,
    maxErrorBodyBytes = DEFAULT_MAX_PROVIDER_ERROR_BODY_BYTES,
    signal: callerSignal,
    ...requestInit
  } = options;

  requirePositiveInteger(timeoutMs, MAX_PROVIDER_TIMEOUT_MS, 'timeoutMs');
  requirePositiveInteger(
    maxResponseBytes,
    MAX_PROVIDER_RESPONSE_BYTES,
    'maxResponseBytes',
  );
  requirePositiveInteger(
    maxErrorBodyBytes,
    MAX_ERROR_BODY_BYTES,
    'maxErrorBodyBytes',
  );

  if (callerSignal?.aborted) {
    throw new ProviderRequestError('aborted');
  }

  let secretValues: string[];
  try {
    secretValues = collectRequestSecrets(input, requestInit);
  } catch {
    throw new TypeError('Provider request headers are invalid.');
  }

  const providerController = new AbortController();
  let abortKind: AbortKind | undefined;
  let upstreamMetadata: UpstreamErrorMetadata | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let removeCallerAbortListener: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      if (abortKind !== undefined) {
        return;
      }
      abortKind = 'timeout';
      reject(
        interruptedRequestError('timeout', upstreamMetadata, maxErrorBodyBytes),
      );
      providerController.abort();
    }, timeoutMs);
  });

  const contenders: Array<Promise<ProviderJsonValue>> = [timeoutPromise];

  if (callerSignal !== undefined) {
    contenders.push(
      new Promise<never>((_resolve, reject) => {
        const handleCallerAbort = () => {
          if (abortKind !== undefined) {
            return;
          }
          abortKind = 'aborted';
          reject(
            interruptedRequestError(
              'aborted',
              upstreamMetadata,
              maxErrorBodyBytes,
            ),
          );
          providerController.abort();
        };
        callerSignal.addEventListener('abort', handleCallerAbort, {
          once: true,
        });
        removeCallerAbortListener = () =>
          callerSignal.removeEventListener('abort', handleCallerAbort);
      }),
    );
  }

  contenders.push(
    performProviderJsonRequest(
      input,
      requestInit,
      providerController.signal,
      maxResponseBytes,
      maxErrorBodyBytes,
      secretValues,
      () => abortKind,
      (metadata) => {
        upstreamMetadata = metadata;
      },
    ),
  );

  try {
    return await Promise.race(contenders);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    removeCallerAbortListener?.();
  }
}

export async function readProviderJson(
  response: Response,
  options: ReadProviderJsonOptions = {},
): Promise<ProviderJsonValue> {
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_PROVIDER_RESPONSE_BYTES;
  requirePositiveInteger(
    maxResponseBytes,
    MAX_PROVIDER_RESPONSE_BYTES,
    'maxResponseBytes',
  );

  try {
    if (!hasJsonContentType(response)) {
      cancelResponseBody(response);
      throw new ProviderRequestError('invalid_response');
    }

    const contentLength = response.headers.get('content-length');
    if (
      contentLength !== null &&
      /^\d+$/.test(contentLength) &&
      Number(contentLength) > maxResponseBytes
    ) {
      cancelResponseBody(response);
      throw new ProviderRequestError('invalid_response');
    }

    const body = await readBoundedBody(
      response,
      maxResponseBytes,
      options.signal,
    );
    if (body.truncated) {
      throw new ProviderRequestError('invalid_response');
    }

    const text = new TextDecoder('utf-8', { fatal: true }).decode(body.bytes);
    return JSON.parse(text) as ProviderJsonValue;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError('invalid_response');
  }
}

function hasJsonContentType(response: Response) {
  const contentType = response.headers.get('content-type');
  if (contentType === null) {
    return false;
  }

  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    mediaType === 'application/json' ||
    /^application\/[a-z0-9][a-z0-9!#$&^_.+-]*\+json$/.test(mediaType ?? '')
  );
}

async function performProviderJsonRequest(
  input: string | URL | Request,
  requestInit: RequestInit,
  signal: AbortSignal,
  maxResponseBytes: number,
  maxErrorBodyBytes: number,
  secretValues: string[],
  getAbortKind: () => AbortKind | undefined,
  setUpstreamMetadata: (metadata: UpstreamErrorMetadata) => void,
): Promise<ProviderJsonValue> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...requestInit,
      signal,
      // Endpoint allowlists are valid only when redirects cannot change hosts.
      redirect: 'error',
    });
  } catch {
    const abortKind = getAbortKind();
    if (abortKind !== undefined) {
      throw new ProviderRequestError(abortKind);
    }
    throw new ProviderRequestError('network');
  }

  if (!response.ok) {
    const metadata = {
      upstreamStatus: response.status,
      upstreamRequestId: sanitizeRequestId(response, secretValues),
    };
    setUpstreamMetadata(metadata);
    let upstreamBody: string | undefined;
    try {
      upstreamBody = await readSanitizedUpstreamBody(
        response,
        maxErrorBodyBytes,
        secretValues,
        signal,
      );
    } catch {
      upstreamBody = unavailableUpstreamBody(maxErrorBodyBytes);
    }
    throw new ProviderRequestError('upstream_http', {
      ...metadata,
      upstreamBody,
    });
  }

  return readProviderJson(response, { maxResponseBytes, signal });
}

async function readSanitizedUpstreamBody(
  response: Response,
  maxBytes: number,
  secretValues: string[],
  signal: AbortSignal,
): Promise<string | undefined> {
  const body = await readBoundedBody(response, maxBytes, signal);
  if (body.bytes.byteLength === 0) {
    return undefined;
  }

  const decoded = decodeUtf8Prefix(body.bytes, body.truncated);
  const sanitized = sanitizeUpstreamText(
    decoded,
    secretValues,
    response.headers.get('content-type'),
  );
  return truncateUtf8(
    sanitized.text,
    maxBytes,
    sanitized.text !== REDACTED && (body.truncated || sanitized.isUnstructured),
  );
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<BoundedBody> {
  if (response.body === null) {
    return { bytes: new Uint8Array(0), truncated: false };
  }

  const reader = response.body.getReader();
  let cancelRequested = false;
  let lockReleased = false;
  let removeAbortListener: (() => void) | undefined;

  const cancelReader = () => {
    if (cancelRequested) {
      return;
    }
    cancelRequested = true;
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // Abort classification must not depend on cancellation implementation.
    }
  };
  const releaseReaderLock = () => {
    if (lockReleased) {
      return;
    }
    try {
      reader.releaseLock();
      lockReleased = true;
    } catch {
      // A pending read keeps the lock until that read settles.
    }
  };

  const readPromise = readBoundedBodyFromReader(reader, maxBytes);
  const contenders: Array<Promise<BoundedBody>> = [readPromise];
  if (signal !== undefined) {
    contenders.push(
      new Promise<never>((_resolve, reject) => {
        const handleAbort = () => {
          cancelReader();
          reject(new Error('Provider response body read was aborted.'));
        };
        if (signal.aborted) {
          handleAbort();
          return;
        }
        signal.addEventListener('abort', handleAbort, { once: true });
        removeAbortListener = () =>
          signal.removeEventListener('abort', handleAbort);
      }),
    );
  }

  try {
    const result = await Promise.race(contenders);
    if (result.truncated) {
      cancelReader();
    }
    return result;
  } finally {
    removeAbortListener?.();
    releaseReaderLock();
    void readPromise.then(releaseReaderLock, releaseReaderLock);
  }
}

async function readBoundedBodyFromReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<BoundedBody> {
  const chunks: Uint8Array[] = [];
  const readLimit = maxBytes + 1;
  let byteLength = 0;
  let truncated = false;

  while (byteLength < readLimit) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    const remaining = readLimit - byteLength;
    if (result.value.byteLength > remaining) {
      chunks.push(result.value.subarray(0, remaining));
      byteLength += remaining;
      truncated = true;
      break;
    }

    chunks.push(result.value);
    byteLength += result.value.byteLength;
    if (byteLength === readLimit) {
      truncated = true;
    }
  }

  const bytes = new Uint8Array(Math.min(byteLength, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= maxBytes) {
      break;
    }
    const boundedChunk = chunk.subarray(0, maxBytes - offset);
    bytes.set(boundedChunk, offset);
    offset += boundedChunk.byteLength;
  }
  return { bytes, truncated };
}

function cancelResponseBody(response: Response) {
  if (response.body === null) {
    return;
  }
  void response.body.cancel().catch(() => undefined);
}

function sanitizeUpstreamText(
  text: string,
  secretValues: string[],
  contentType: string | null,
) {
  const sanitized = stripControlCharacters(text, true);

  try {
    const parsed = JSON.parse(sanitized) as unknown;
    return {
      text: JSON.stringify(
        sanitizeJsonValue(parsed, 0, undefined, secretValues),
      ),
      isUnstructured: false,
    };
  } catch {
    const firstCharacter = sanitized.trimStart()[0];
    if (
      /(?:^|[+/])json(?:$|\s*;)/i.test(contentType ?? '') ||
      firstCharacter === '{' ||
      firstCharacter === '['
    ) {
      return { text: REDACTED, isUnstructured: false };
    }
  }

  return { text: REDACTED, isUnstructured: false };
}

function sanitizeJsonValue(
  value: unknown,
  depth: number,
  fieldName?: string,
  secretValues: string[] = [],
): ProviderJsonValue {
  if (depth >= 5) {
    return TRUNCATED;
  }
  if (fieldName !== undefined && secretFieldPattern.test(fieldName)) {
    return REDACTED;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (typeof value === 'string') {
    return fieldName !== undefined &&
      isSafeErrorMetadataString(fieldName, value, secretValues)
      ? value
      : REDACTED;
  }
  if (Array.isArray(value)) {
    const entries = value
      .slice(0, 10)
      .map((entry) =>
        sanitizeJsonValue(entry, depth + 1, undefined, secretValues),
      );
    if (value.length > entries.length) {
      entries.push(TRUNCATED);
    }
    return entries;
  }
  if (typeof value !== 'object') {
    return REDACTED;
  }

  const sanitized: { [key: string]: ProviderJsonValue } = {};
  const entries = Object.entries(value).slice(0, 20);
  for (const [index, [key, entry]] of entries.entries()) {
    const sanitizedKey = allowedErrorJsonKeyPattern.test(key)
      ? key
      : `_redacted_${index + 1}`;
    sanitized[sanitizedKey] = sanitizeJsonValue(
      entry,
      depth + 1,
      key,
      secretValues,
    );
  }
  if (Object.keys(value).length > entries.length) {
    sanitized._truncated = true;
  }
  return sanitized;
}

function collectRequestSecrets(
  input: string | URL | Request,
  requestInit: RequestInit,
) {
  const secrets = new Set<string>();
  const headers = new Headers(requestInit.headers);
  if (input instanceof Request) {
    for (const [name, value] of input.headers) {
      if (secretFieldPattern.test(name)) {
        addSecretValue(secrets, value);
      }
    }
  }
  for (const [name, value] of headers) {
    if (secretFieldPattern.test(name)) {
      addSecretValue(secrets, value);
    }
  }

  collectUrlSecrets(input, secrets);
  if (typeof requestInit.body === 'string') {
    collectJsonSecrets(requestInit.body, secrets);
  } else if (requestInit.body instanceof URLSearchParams) {
    for (const [name, value] of requestInit.body) {
      if (secretFieldPattern.test(name)) {
        addSecretValue(secrets, value);
      }
    }
  }
  return [...secrets].sort((left, right) => right.length - left.length);
}

function collectUrlSecrets(
  input: string | URL | Request,
  secrets: Set<string>,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input instanceof Request ? input.url : input);
  } catch {
    return;
  }
  for (const [name, value] of parsedUrl.searchParams) {
    if (secretFieldPattern.test(name)) {
      addSecretValue(secrets, value);
    }
  }
}

function collectJsonSecrets(body: string, secrets: Set<string>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return;
  }

  const visit = (value: unknown, sensitiveParent: boolean, depth: number) => {
    if (depth > 8) {
      return;
    }
    if (typeof value === 'string') {
      if (sensitiveParent) {
        addSecretValue(secrets, value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 100)) {
        visit(entry, sensitiveParent, depth + 1);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, entry] of Object.entries(value).slice(0, 100)) {
      visit(entry, sensitiveParent || secretFieldPattern.test(key), depth + 1);
    }
  };
  visit(parsed, false, 0);
}

function addSecretValue(secrets: Set<string>, value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 4) {
    return;
  }
  secrets.add(trimmed);
  const authorizationMatch = /^(?:Bearer|Basic)\s+(.+)$/i.exec(trimmed);
  if (authorizationMatch?.[1] && authorizationMatch[1].length >= 4) {
    secrets.add(authorizationMatch[1]);
  }
}

function sanitizeRequestId(response: Response, secretValues: string[]) {
  const rawRequestId =
    response.headers.get('x-request-id') ??
    response.headers.get('request-id') ??
    undefined;
  if (rawRequestId === undefined) {
    return undefined;
  }

  return sanitizeRequestIdValue(rawRequestId, secretValues);
}

function sanitizeRequestIdValue(rawRequestId: string, secretValues: string[]) {
  const requestId = stripControlCharacters(rawRequestId, false).trim();
  if (requestId !== rawRequestId.trim()) {
    return REDACTED;
  }
  for (const secretValue of secretValues) {
    if (secretValue.length >= 4 && requestId.includes(secretValue)) {
      return REDACTED;
    }
  }
  if (
    !safeRequestIdPattern.test(requestId) ||
    unsafeRequestIdPattern.test(requestId)
  ) {
    return REDACTED;
  }
  return requestId;
}

function isSafeErrorMetadataString(
  fieldName: string,
  value: string,
  secretValues: string[],
) {
  if (
    !errorMetadataFieldPattern.test(fieldName) ||
    !safeMetadataValuePattern.test(value) ||
    secretValues.some(
      (secretValue) => secretValue.length >= 4 && value.includes(secretValue),
    )
  ) {
    return false;
  }
  return (
    !requestIdentifierFieldPattern.test(fieldName) ||
    sanitizeRequestIdValue(value, secretValues) === value
  );
}

function interruptedRequestError(
  kind: AbortKind,
  upstreamMetadata: UpstreamErrorMetadata | undefined,
  maxErrorBodyBytes: number,
) {
  return upstreamMetadata === undefined
    ? new ProviderRequestError(kind)
    : new ProviderRequestError(kind === 'aborted' ? kind : 'upstream_http', {
        ...upstreamMetadata,
        upstreamBody: unavailableUpstreamBody(maxErrorBodyBytes),
      });
}

function unavailableUpstreamBody(maxBytes: number) {
  return truncateUtf8(UPSTREAM_BODY_UNAVAILABLE, maxBytes, false);
}

function decodeUtf8Prefix(bytes: Uint8Array, truncated: boolean) {
  const maximumTrimmedBytes = truncated ? 3 : 0;
  for (
    let trimmedBytes = 0;
    trimmedBytes <= maximumTrimmedBytes;
    trimmedBytes += 1
  ) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(0, bytes.byteLength - trimmedBytes),
      );
    } catch {
      // A bounded body can end inside a multi-byte character.
    }
  }
  throw new TypeError('Provider error body is not valid UTF-8.');
}

function stripControlCharacters(value: string, preserveWhitespace: boolean) {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const preservedWhitespace =
      preserveWhitespace && [9, 10, 13].includes(codePoint);
    if ((codePoint <= 31 || codePoint === 127) && !preservedWhitespace) {
      continue;
    }
    result += character;
  }
  return result;
}

function truncateUtf8(value: string, maxBytes: number, truncated: boolean) {
  const encodedLength = Buffer.byteLength(value, 'utf8');
  if (!truncated && encodedLength <= maxBytes) {
    return value;
  }

  const marker =
    Buffer.byteLength(TRUNCATED, 'utf8') <= maxBytes ? TRUNCATED : '';
  const contentLimit = maxBytes - Buffer.byteLength(marker, 'utf8');
  const characters = [...value];
  if (truncated && encodedLength <= contentLimit && characters.length > 0) {
    characters.pop();
  }
  let result = '';
  let resultBytes = 0;
  for (const character of characters) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (resultBytes + characterBytes > contentLimit) {
      break;
    }
    result += character;
    resultBytes += characterBytes;
  }
  return `${result}${marker}`;
}

function requirePositiveInteger(value: number, maximum: number, name: string) {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }
}
