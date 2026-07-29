import {
  ProviderRequestError,
  readProviderJson,
  requestProviderJson,
} from './provider-request';

describe('provider request', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns Unicode JSON and clears the hard-timeout timer', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: '调用-1', content: '康复建议' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    await expect(
      requestProviderJson('https://provider.example/v1/chat', {
        method: 'POST',
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual({ id: '调用-1', content: '康复建议' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('refuses redirects even when a caller requests follow behavior', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'provider-call-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      requestProviderJson('https://provider.example/v1/chat', {
        redirect: 'follow',
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual({ id: 'provider-call-1' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://provider.example/v1/chat',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('enforces a hard timeout, aborts fetch, and does not retry', async () => {
    let providerSignal: AbortSignal | undefined;
    fetchSpy.mockImplementation((_input, init) => {
      providerSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const request = requestProviderJson('https://provider.example/v1/chat', {
      timeoutMs: 250,
    });
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'timeout',
      message: 'Provider request timed out.',
    });

    await jest.advanceTimersByTimeAsync(250);
    await rejection;

    expect(providerSignal?.aborted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the hard timeout active while the response body is being read', async () => {
    let providerSignal: AbortSignal | undefined;
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
      },
    });
    fetchSpy.mockImplementation((_input, init) => {
      providerSignal = init?.signal ?? undefined;
      return Promise.resolve(
        new Response(stalledBody, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const request = requestProviderJson('https://provider.example/v1/chat', {
      timeoutMs: 250,
    });
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'timeout',
    });

    await jest.advanceTimersByTimeAsync(250);
    await rejection;

    expect(providerSignal?.aborted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('supports caller abort and classifies it separately from timeout', async () => {
    const caller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    fetchSpy.mockImplementation((_input, init) => {
      providerSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const request = requestProviderJson('https://provider.example/v1/chat', {
      timeoutMs: 5_000,
      signal: caller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'aborted',
      message: 'Provider request was aborted.',
    });

    caller.abort('navigation');
    await rejection;

    expect(providerSignal?.aborted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not call fetch when the caller signal is already aborted', async () => {
    const caller = new AbortController();
    caller.abort();

    await expect(
      requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 5_000,
        signal: caller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'aborted' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('classifies a network failure without exposing credentials or retrying', async () => {
    const apiKey = 'sk-sensitive-provider-key';
    fetchSpy.mockRejectedValue(
      new TypeError(`socket failed with Authorization: Bearer ${apiKey}`),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'api-key': apiKey,
        },
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderRequestError);
    expect(caught).toMatchObject({
      kind: 'network',
      message: 'Provider network request failed.',
    });
    expect(JSON.stringify(caught)).not.toContain(apiKey);
    expect(String(caught)).not.toContain(apiKey);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('preserves status and request ID while bounding and redacting a JSON error body', async () => {
    const apiKey = 'sk-sensitive-provider-key';
    const clinicalText = '患者完整临床正文：'.repeat(200);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'UPSTREAM_BUSY',
            authorization: `Bearer ${apiKey}`,
            transcript: clinicalText,
          },
        }),
        {
          status: 502,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'provider-request-123',
          },
        },
      ),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 1_000,
        maxErrorBodyBytes: 180,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderRequestError);
    expect(caught).toMatchObject({
      kind: 'upstream_http',
      upstreamStatus: 502,
      upstreamRequestId: 'provider-request-123',
    });
    const serialized = JSON.stringify(caught);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain(clinicalText);
    expect(
      Buffer.byteLength(
        (caught as ProviderRequestError).upstreamBody ?? '',
        'utf8',
      ),
    ).toBeLessThanOrEqual(180);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('only preserves strictly formatted allowlisted JSON string metadata', async () => {
    const clinicalText = '患者李某的完整临床正文';
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'UPSTREAM_BUSY',
          type: 'provider_error',
          status: 'temporarily-unavailable',
          request_id: 'request-123',
          trace_id: 'secret/provider-secret',
          error: clinicalText,
          message: clinicalText,
          detail: clinicalText,
          transcript: clinicalText,
          unknown: clinicalText,
        }),
        { status: 502 },
      ),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    const upstreamBody = (caught as ProviderRequestError).upstreamBody ?? '';
    expect(upstreamBody).toContain('UPSTREAM_BUSY');
    expect(upstreamBody).toContain('provider_error');
    expect(upstreamBody).toContain('temporarily-unavailable');
    expect(upstreamBody).toContain('request-123');
    expect(upstreamBody).not.toContain('secret/provider-secret');
    expect(upstreamBody).not.toContain(clinicalText);
    expect(upstreamBody.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it('redacts a short clinical string stored directly in an error field', async () => {
    const clinicalText = '患者完整临床正文';
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: clinicalText }), { status: 400 }),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(clinicalText);
    expect(serialized).toContain('[REDACTED]');
  });

  it('parses JSON before redacting credential fields without leaking values', async () => {
    const apiKey = 'sk-sensitive-provider-key';
    const upstreamSecret = 'upstream-authorization-secret';
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'UPSTREAM_REJECTED',
          authorization: `Bearer ${upstreamSecret}`,
          apiKey,
          unknown: 'arbitrary provider string',
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    const upstreamBody = (caught as ProviderRequestError).upstreamBody ?? '';
    expect(() => JSON.parse(upstreamBody) as unknown).not.toThrow();
    expect(upstreamBody).toContain('UPSTREAM_REJECTED');
    expect(upstreamBody).not.toContain(apiKey);
    expect(upstreamBody).not.toContain(upstreamSecret);
    expect(upstreamBody).not.toContain('arbitrary provider string');
  });

  it('redacts numeric values in secret-bearing JSON fields', async () => {
    const numericSecrets = [987654321, 246813579, 135792468];
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          apiKey: numericSecrets[0],
          token: numericSecrets[1],
          authorization: numericSecrets[2],
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    const upstreamBody = (caught as ProviderRequestError).upstreamBody ?? '';
    for (const secret of numericSecrets) {
      expect(upstreamBody).not.toContain(String(secret));
    }
    expect(upstreamBody.match(/\[REDACTED\]/g)).toHaveLength(3);
  });

  it('keeps upstream HTTP classification when reading the error body fails', async () => {
    const failedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('body read failed with clinical text'));
      },
    });
    fetchSpy.mockResolvedValue(
      new Response(failedBody, {
        status: 502,
        headers: { 'x-request-id': 'body-read-failure-1' },
      }),
    );

    await expect(
      requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      kind: 'upstream_http',
      upstreamStatus: 502,
      upstreamRequestId: 'body-read-failure-1',
      upstreamBody: '[UNAVAILABLE]',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps upstream HTTP metadata and cancels a stalled error body at deadline', async () => {
    const cancel = jest.fn(() => new Promise<void>(() => undefined));
    let providerSignal: AbortSignal | undefined;
    const stalledBody = new ReadableStream<Uint8Array>({ cancel });
    fetchSpy.mockImplementation((_input, init) => {
      providerSignal = init?.signal ?? undefined;
      return Promise.resolve(
        new Response(stalledBody, {
          status: 504,
          headers: { 'x-request-id': 'stalled-upstream-1' },
        }),
      );
    });

    const request = requestProviderJson('https://provider.example/v1/chat', {
      timeoutMs: 250,
    });
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'upstream_http',
      upstreamStatus: 504,
      upstreamRequestId: 'stalled-upstream-1',
      upstreamBody: '[UNAVAILABLE]',
    });

    await jest.advanceTimersByTimeAsync(250);
    await rejection;
    await Promise.resolve();

    expect(providerSignal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('classifies caller abort during an upstream error body read as aborted', async () => {
    const caller = new AbortController();
    const cancel = jest.fn();
    let providerSignal: AbortSignal | undefined;
    const stalledBody = new ReadableStream<Uint8Array>({ cancel });
    fetchSpy.mockImplementation((_input, init) => {
      providerSignal = init?.signal ?? undefined;
      return Promise.resolve(
        new Response(stalledBody, {
          status: 429,
          headers: { 'x-request-id': 'caller-aborted-upstream-1' },
        }),
      );
    });

    const request = requestProviderJson('https://provider.example/v1/chat', {
      timeoutMs: 5_000,
      signal: caller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'aborted',
      message: 'Provider request was aborted.',
      upstreamStatus: 429,
      upstreamRequestId: 'caller-aborted-upstream-1',
      upstreamBody: '[UNAVAILABLE]',
    });

    await Promise.resolve();
    caller.abort();
    await rejection;
    await Promise.resolve();

    expect(providerSignal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('replaces arbitrary non-JSON upstream prose with a bounded safe placeholder', async () => {
    const apiKey = 'unicode-provider-secret';
    const body = `上游暂时不可用。api-key=${apiKey}。${'临床正文'.repeat(500)}`;
    fetchSpy.mockResolvedValue(
      new Response(body, {
        status: 503,
        headers: { 'x-request-id': 'unicode-error-1' },
      }),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/audio', {
        headers: { 'api-key': apiKey },
        timeoutMs: 1_000,
        maxErrorBodyBytes: 96,
      });
    } catch (error) {
      caught = error;
    }

    const error = caught as ProviderRequestError;
    expect(error.kind).toBe('upstream_http');
    expect(error.upstreamBody).toBe('[REDACTED]');
    expect(error.upstreamBody).not.toContain('上游暂时不可用');
    expect(error.upstreamBody).not.toContain(apiKey);
    expect(error.upstreamBody).not.toContain(body);
    expect(
      Buffer.byteLength(error.upstreamBody ?? '', 'utf8'),
    ).toBeLessThanOrEqual(96);
  });

  it('rejects malformed UTF-8 error-body evidence without a decoding downgrade', async () => {
    const copiedPrefix = 'patient-clinical-prefix';
    const malformedBody = new Uint8Array([
      ...new TextEncoder().encode(copiedPrefix),
      0xff,
      ...new TextEncoder().encode('-suffix'),
    ]);
    fetchSpy.mockResolvedValue(
      new Response(malformedBody, {
        status: 502,
        headers: { 'x-request-id': 'malformed-utf8-1' },
      }),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      kind: 'upstream_http',
      upstreamStatus: 502,
      upstreamRequestId: 'malformed-utf8-1',
      upstreamBody: '[UNAVAILABLE]',
    });
    expect(JSON.stringify(caught)).not.toContain(copiedPrefix);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('never retains a complete short unstructured clinical error body', async () => {
    const clinicalText = '患者李某的完整临床正文与逐字转写';
    fetchSpy.mockResolvedValue(
      new Response(clinicalText, {
        status: 400,
        headers: { 'x-request-id': 'clinical-error-1' },
      }),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(clinicalText);
    expect(serialized).toContain('[REDACTED]');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels a stalled body and removes the caller listener on caller abort', async () => {
    const caller = new AbortController();
    const removeListener = jest.spyOn(caller.signal, 'removeEventListener');
    const cancel = jest.fn();
    const stalledBody = new ReadableStream<Uint8Array>({ cancel });
    fetchSpy.mockResolvedValue(new Response(stalledBody, { status: 200 }));

    const request = requestProviderJson('https://provider.example/v1/chat', {
      timeoutMs: 5_000,
      signal: caller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({
      kind: 'aborted',
    });

    caller.abort();
    await rejection;
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stalledBody.locked).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    'Bearer dG9rZW4=',
    'Basic dXNlcjpwYXNz',
    'api-key=provider-secret',
    'request-key-123',
    'token:provider-token',
    'secret/provider-secret',
    'unsafe\u0001request',
    'caf\u00e9-request',
    'x'.repeat(129),
  ])('redacts an unsafe upstream request ID: %p', async (requestId) => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 'UPSTREAM_ERROR' }), {
        status: 500,
        headers: { 'x-request-id': requestId },
      }),
    );

    await expect(
      requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      kind: 'upstream_http',
      upstreamStatus: 500,
      upstreamRequestId: '[REDACTED]',
    });
  });

  it('classifies non-JSON and oversized success bodies as invalid responses', async () => {
    await expect(
      readProviderJson(new Response('<html>bad gateway</html>')),
    ).rejects.toMatchObject({
      kind: 'invalid_response',
      message: 'Provider returned an invalid response.',
    });

    await expect(
      readProviderJson(
        new Response(JSON.stringify({ content: '康'.repeat(100) })),
        { maxResponseBytes: 32 },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('requires a JSON success content type before accepting a provider body', async () => {
    await expect(
      readProviderJson(
        new Response(JSON.stringify({ content: 'unexpected MIME' }), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      ),
    ).rejects.toMatchObject({ kind: 'invalid_response' });

    await expect(
      readProviderJson(
        new Response(JSON.stringify({ content: 'missing MIME' })),
      ),
    ).rejects.toMatchObject({ kind: 'invalid_response' });

    await expect(
      readProviderJson(
        new Response(JSON.stringify({ content: 'vendor JSON' }), {
          headers: {
            'content-type': 'application/vnd.mimo+json; charset=utf-8',
          },
        }),
      ),
    ).resolves.toEqual({ content: 'vendor JSON' });
  });

  it('classifies malformed UTF-8 HTTP 2xx JSON as invalid_response without decoded body leakage', async () => {
    const decodedPrefix = 'patient-clinical-prefix';
    const decodedSuffix = 'patient-clinical-suffix';
    const malformedBody = new Uint8Array([
      ...new TextEncoder().encode(`{"transcript":"${decodedPrefix}`),
      0xff,
      ...new TextEncoder().encode(`${decodedSuffix}"}`),
    ]);
    fetchSpy.mockResolvedValue(
      new Response(malformedBody, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    let caught: unknown;
    try {
      await requestProviderJson('https://provider.example/v1/chat', {
        timeoutMs: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderRequestError);
    expect(caught).toMatchObject({
      kind: 'invalid_response',
      message: 'Provider returned an invalid response.',
    });
    expect((caught as ProviderRequestError).upstreamBody).toBeUndefined();
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain('upstreamBody');
    expect(serialized).not.toContain(decodedPrefix);
    expect(serialized).not.toContain(decodedSuffix);
    expect(serialized).not.toContain('\uFFFD');
    expect(String(caught)).not.toContain(decodedPrefix);
    expect(String(caught)).not.toContain(decodedSuffix);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps invalid response errors free of the complete clinical body', async () => {
    const clinicalText = '患者李某的完整临床正文与逐字转写';
    let caught: unknown;

    try {
      await readProviderJson(new Response(clinicalText));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderRequestError);
    expect(JSON.stringify(caught)).not.toContain(clinicalText);
    expect(String(caught)).not.toContain(clinicalText);
  });
});
