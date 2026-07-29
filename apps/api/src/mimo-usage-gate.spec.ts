import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  loadMimoUsageGateConfig,
  MimoUsageGate,
  MimoQuotaExceededException,
  type MimoUsageGateConfig,
} from './mimo-usage-gate';

const config: MimoUsageGateConfig = {
  url: 'redis://key-value.internal:6379',
  keyPrefix: 'rehab:mimo:production',
  windowMs: 60_000,
  probeTimeoutMs: 1_000,
  userRequestLimit: 10,
  patientRequestLimit: 10,
  organizationRequestLimit: 100,
  speechSecondsLimit: 600,
  ttsCharactersLimit: 2_000,
  userBudgetUnitsLimit: 1_000,
  patientBudgetUnitsLimit: 1_000,
  organizationBudgetUnitsLimit: 10_000,
  aiCostUnitsPerRequest: 5,
  speechCostUnitsPerSecond: 2,
  ttsCostUnitsPerCharacter: 1,
  highCostUserOperationRequestLimit: 2,
  highCostUserOperationWindowMs: 60_000,
};

type MockKeyValueClient = {
  status?: string;
  connect?: jest.Mock<Promise<unknown>, []>;
  eval: jest.Mock<Promise<unknown>, [string, number, ...string[]]>;
  quit: jest.Mock<Promise<unknown>, []>;
};

function createGate(result: unknown) {
  const client: MockKeyValueClient = {
    eval: jest.fn<Promise<unknown>, [string, number, ...string[]]>(),
    quit: jest.fn<Promise<unknown>, []>(),
  };
  client.eval.mockResolvedValue(result);
  client.quit.mockResolvedValue(undefined);
  return {
    client,
  };
}

describe('MimoUsageGate', () => {
  const scope = {
    userId: 'user-1',
    patientId: 'patient-1',
    organizationId: 'organization-1',
  };

  it('requires all customer-approved quota and budget configuration values', () => {
    const env = {
      MIMO_KEY_VALUE_URL: config.url,
      MIMO_USAGE_KEY_PREFIX: config.keyPrefix,
      MIMO_USAGE_WINDOW_MS: '60000',
      MIMO_KEY_VALUE_PROBE_TIMEOUT_MS: '1000',
      MIMO_USER_REQUEST_LIMIT: '10',
      MIMO_PATIENT_REQUEST_LIMIT: '10',
      MIMO_ORGANIZATION_REQUEST_LIMIT: '100',
      MIMO_SPEECH_SECONDS_LIMIT: '600',
      MIMO_TTS_CHARACTERS_LIMIT: '2000',
      MIMO_USER_BUDGET_UNITS_LIMIT: '1000',
      MIMO_PATIENT_BUDGET_UNITS_LIMIT: '1000',
      MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT: '10000',
      MIMO_AI_COST_UNITS_PER_REQUEST: '5',
      MIMO_SPEECH_COST_UNITS_PER_SECOND: '2',
      MIMO_TTS_COST_UNITS_PER_CHARACTER: '1',
      MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT: '2',
      MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS: '60000',
    };

    expect(loadMimoUsageGateConfig(env)).toMatchObject(config);
    expect(() =>
      loadMimoUsageGateConfig({ ...env, MIMO_TTS_CHARACTERS_LIMIT: '0' }),
    ).toThrow(/MIMO_TTS_CHARACTERS_LIMIT/);
    expect(() =>
      loadMimoUsageGateConfig({
        ...env,
        MIMO_KEY_VALUE_URL: 'https://not-a-key-value-service.example',
      }),
    ).toThrow(/MIMO_KEY_VALUE_URL/);
    for (const name of [
      'MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT',
      'MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS',
    ]) {
      const missing = { ...env };
      delete missing[name as keyof typeof missing];
      expect(() => loadMimoUsageGateConfig(missing)).toThrow(name);
    }
  });

  it('enforces an independent atomic user-operation request limit', async () => {
    const { client } = createGate([1, 2]);
    const gate = new MimoUsageGate(config, client);

    await expect(
      gate.consumeUserOperationRateLimit({
        userId: 'user-1',
        operation: 'speech',
      }),
    ).resolves.toBeUndefined();

    const call = client.eval.mock.calls[0];
    if (!call) throw new Error('Expected atomic rate-limit evaluation.');
    expect(call[0]).toContain("redis.call('INCR', KEYS[1])");
    expect(call[0]).toContain('if current == 1 then');
    expect(call[1]).toBe(1);
    expect(call.slice(2)).toEqual([
      'rehab:mimo:production:request-rate:user:user-1:operation:speech',
      '2',
      '60000',
    ]);
  });

  it('returns 429 after the independent user-operation request limit is exhausted', async () => {
    const { client } = createGate([0, 3]);
    const gate = new MimoUsageGate(config, client);

    await expect(
      gate.consumeUserOperationRateLimit({
        userId: 'user-1',
        operation: 'tts',
      }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('uses distinct shared keys for each authenticated user and operation', async () => {
    const { client } = createGate([1, 1]);
    const gate = new MimoUsageGate(config, client);

    await gate.consumeUserOperationRateLimit({
      userId: 'user-1',
      operation: 'ai',
    });
    await gate.consumeUserOperationRateLimit({
      userId: 'user-1',
      operation: 'speech',
    });
    await gate.consumeUserOperationRateLimit({
      userId: 'user-2',
      operation: 'ai',
    });

    expect(client.eval.mock.calls.map((call) => call[2])).toEqual([
      'rehab:mimo:production:request-rate:user:user-1:operation:ai',
      'rehab:mimo:production:request-rate:user:user-1:operation:speech',
      'rehab:mimo:production:request-rate:user:user-2:operation:ai',
    ]);
  });

  it('performs an atomic readiness probe without contacting MiMo', async () => {
    const { client } = createGate('unused');
    client.eval.mockImplementation(
      (_script: string, _keyCount: number, _key: string, nonce: string) =>
        Promise.resolve(nonce),
    );
    const gate = new MimoUsageGate(config, client);

    await expect(gate.assertReady()).resolves.toBeUndefined();
    expect(client.eval).toHaveBeenCalledTimes(1);
    expect(client.eval.mock.calls[0]?.[1]).toBe(1);
  });

  it('fails closed when the Key Value probe cannot confirm atomic writes', async () => {
    const { client } = createGate('wrong-value');
    const gate = new MimoUsageGate(config, client);

    await expect(gate.assertReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reserves one high-cost request atomically before any provider call', async () => {
    const { client } = createGate([1, 'reserved']);
    const gate = new MimoUsageGate(config, client);

    await expect(
      gate.reserve({
        operation: 'speech',
        scope,
        idempotencyKey: 'speech-request-0001',
        quantity: 42,
      }),
    ).resolves.toBeUndefined();

    expect(client.eval).toHaveBeenCalledTimes(1);
    const args = client.eval.mock.calls[0];
    if (!args) throw new Error('Expected Key Value reservation call.');
    expect(args[1]).toBe(8);
    expect(args[2]).toBe(
      'rehab:mimo:production:window:idempotency:speech:organization:organization-1:patient:patient-1:user:user-1:speech-request-0001',
    );
    expect(args).toContain('42');
    expect(args).toContain('84');
  });

  it('opens a lazy Key Value client before running an atomic reservation', async () => {
    const { client } = createGate([1, 'reserved']);
    client.status = 'wait';
    client.connect = jest.fn().mockImplementation(() => {
      client.status = 'ready';
      return Promise.resolve(undefined);
    });
    const gate = new MimoUsageGate(config, client);

    await expect(
      gate.reserve({
        operation: 'ai',
        scope,
        idempotencyKey: 'ai-request-connection-001',
      }),
    ).resolves.toBeUndefined();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.eval).toHaveBeenCalledTimes(1);
    expect(client.connect.mock.invocationCallOrder[0]).toBeLessThan(
      client.eval.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('shares the first lazy connection attempt across concurrent reservations', async () => {
    const { client } = createGate([1, 'reserved']);
    client.status = 'wait';
    let resolveConnection: (() => void) | undefined;
    client.connect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConnection = () => {
            client.status = 'ready';
            resolve();
          };
        }),
    );
    const gate = new MimoUsageGate(config, client);

    const first = gate.reserve({
      operation: 'ai',
      scope,
      idempotencyKey: 'ai-request-concurrent-001',
    });
    const second = gate.reserve({
      operation: 'ai',
      scope,
      idempotencyKey: 'ai-request-concurrent-002',
    });
    await Promise.resolve();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.eval).not.toHaveBeenCalled();
    if (!resolveConnection) throw new Error('Expected a pending connection.');
    resolveConnection();

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(client.eval).toHaveBeenCalledTimes(2);
  });

  it('fails closed without evaluating quota scripts when the first connection fails', async () => {
    const { client } = createGate([1, 'reserved']);
    client.status = 'wait';
    client.connect = jest
      .fn<Promise<unknown>, []>()
      .mockRejectedValue(new Error('connection refused'));
    const gate = new MimoUsageGate(config, client);

    await expect(
      gate.reserve({
        operation: 'ai',
        scope,
        idempotencyKey: 'ai-request-connection-failed',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('rejects duplicate, exhausted and unavailable reservations without allowing a provider call', async () => {
    const duplicate = createGate([2, 'duplicate']);
    await expect(
      new MimoUsageGate(config, duplicate.client).reserve({
        operation: 'ai',
        scope,
        idempotencyKey: 'ai-request-000001',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const exhausted = createGate([0, 'organization_budget_limit']);
    await expect(
      new MimoUsageGate(config, exhausted.client).reserve({
        operation: 'tts',
        scope,
        idempotencyKey: 'tts-request-00001',
        quantity: 100,
      }),
    ).rejects.toBeInstanceOf(MimoQuotaExceededException);

    const unavailable = createGate([1, 'reserved']);
    unavailable.client.eval.mockRejectedValue(
      new Error('key value unavailable'),
    );
    await expect(
      new MimoUsageGate(config, unavailable.client).reserve({
        operation: 'ai',
        scope,
        idempotencyKey: 'ai-request-000002',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects missing operation quantity or an invalid idempotency key before touching Key Value', async () => {
    const { client } = createGate([1, 'reserved']);
    const gate = new MimoUsageGate(config, client);

    await expect(
      gate.reserve({
        operation: 'speech',
        scope,
        idempotencyKey: 'too-short',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('closes the Key Value client during Nest module shutdown', async () => {
    const { client } = createGate([1, 'reserved']);
    const gate = new MimoUsageGate(config, client);

    await gate.onModuleDestroy();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
