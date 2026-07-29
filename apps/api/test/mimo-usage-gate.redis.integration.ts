import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import {
  createMimoUsageGate,
  MimoHighCostRateLimitExceededException,
  MimoQuotaExceededException,
  type MimoUsageGateConfig,
} from '../src/mimo-usage-gate';

const expectedRedisTestUrl = 'redis://127.0.0.1:6379/15';

function requireRedisIntegrationUrl(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE !== 'YES' ||
    env.MIMO_USAGE_GATE_REDIS_TEST_URL !== expectedRedisTestUrl
  ) {
    throw new Error(
      'Redis integration tests require MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE=YES and the dedicated redis://127.0.0.1:6379/15 target.',
    );
  }
  return expectedRedisTestUrl;
}

const redisUrl = requireRedisIntegrationUrl();

function redisClient() {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    connectTimeout: 1_000,
  });
}

function testConfig(keyPrefix: string): MimoUsageGateConfig {
  return {
    url: redisUrl,
    keyPrefix,
    windowMs: 60_000,
    probeTimeoutMs: 150,
    userRequestLimit: 2,
    patientRequestLimit: 10,
    organizationRequestLimit: 10,
    speechSecondsLimit: 600,
    ttsCharactersLimit: 10_000,
    userBudgetUnitsLimit: 10,
    patientBudgetUnitsLimit: 10,
    organizationBudgetUnitsLimit: 10,
    aiCostUnitsPerRequest: 1,
    speechCostUnitsPerSecond: 1,
    ttsCostUnitsPerCharacter: 1,
    highCostUserOperationRequestLimit: 2,
    highCostUserOperationWindowMs: 60_000,
  };
}

async function deletePrefixedKeys(client: Redis, keyPrefix: string) {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      'MATCH',
      `${keyPrefix}:*`,
      'COUNT',
      '100',
    );
    if (keys.length > 0) await client.del(...keys);
    cursor = nextCursor;
  } while (cursor !== '0');
}

describe('MimoUsageGate Redis integration', () => {
  jest.setTimeout(15_000);

  const cleanupClient = redisClient();
  let keyPrefix = '';

  beforeAll(async () => {
    await cleanupClient.connect();
    await cleanupClient.ping();
  });

  beforeEach(() => {
    keyPrefix = `rehab:test:mimo-usage-gate:${randomUUID()}`;
  });

  afterEach(async () => {
    await deletePrefixedKeys(cleanupClient, keyPrefix);
  });

  afterAll(async () => {
    await cleanupClient.quit();
  });

  it('opens each lazy real ioredis client on its first readiness probe', async () => {
    const config = testConfig(keyPrefix);
    const firstGate = createMimoUsageGate(config);
    const secondGate = createMimoUsageGate(config);
    try {
      await expect(firstGate.assertReady()).resolves.toBeUndefined();
      await expect(secondGate.assertReady()).resolves.toBeUndefined();
    } finally {
      await Promise.all([firstGate.close(), secondGate.close()]);
    }
  });

  it('atomically enforces the shared user-operation rate limit across two gate instances', async () => {
    const config = testConfig(keyPrefix);
    const firstGate = createMimoUsageGate(config);
    const secondGate = createMimoUsageGate(config);
    try {
      const attempts = await Promise.allSettled(
        [firstGate, secondGate, firstGate, secondGate].map((gate) =>
          gate.consumeUserOperationRateLimit({
            userId: 'integration-user',
            operation: 'ai',
          }),
        ),
      );
      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(2);
      for (const attempt of attempts.filter(
        (attempt): attempt is PromiseRejectedResult =>
          attempt.status === 'rejected',
      )) {
        expect(attempt.reason).toBeInstanceOf(
          MimoHighCostRateLimitExceededException,
        );
      }
    } finally {
      await Promise.all([firstGate.close(), secondGate.close()]);
    }
  });

  it('atomically enforces the shared request quota across two gate instances', async () => {
    const config = testConfig(keyPrefix);
    const firstGate = createMimoUsageGate(config);
    const secondGate = createMimoUsageGate(config);
    const scope = {
      userId: 'integration-user',
      patientId: 'integration-patient',
      organizationId: 'integration-organization',
    };
    try {
      const attempts = await Promise.allSettled(
        [firstGate, secondGate, firstGate, secondGate].map((gate, index) =>
          gate.reserve({
            operation: 'ai',
            scope,
            idempotencyKey: `integration-quota-${String(index).padStart(4, '0')}`,
          }),
        ),
      );
      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(2);
      for (const attempt of attempts.filter(
        (attempt): attempt is PromiseRejectedResult =>
          attempt.status === 'rejected',
      )) {
        const reason: unknown = attempt.reason;
        expect(reason).toBeInstanceOf(MimoQuotaExceededException);
        if (!(reason instanceof MimoQuotaExceededException)) {
          throw new Error('Expected MimoQuotaExceededException.');
        }
        expect(reason.getStatus()).toBe(429);
      }
    } finally {
      await Promise.all([firstGate.close(), secondGate.close()]);
    }
  });

  it('rejects an idempotency key replay across two gate instances', async () => {
    const config = testConfig(keyPrefix);
    const firstGate = createMimoUsageGate(config);
    const secondGate = createMimoUsageGate(config);
    const request = {
      operation: 'ai' as const,
      scope: {
        userId: 'integration-user',
        patientId: 'integration-patient',
        organizationId: 'integration-organization',
      },
      idempotencyKey: 'integration-idempotency-0001',
    };
    try {
      const attempts = await Promise.allSettled([
        firstGate.reserve(request),
        secondGate.reserve(request),
      ]);
      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = attempts.find(
        (attempt): attempt is PromiseRejectedResult =>
          attempt.status === 'rejected',
      );
      expect(rejected?.reason).toMatchObject({ status: 409 });
    } finally {
      await Promise.all([firstGate.close(), secondGate.close()]);
    }
  });

  it('fails closed when the dedicated Redis target pauses writes beyond the configured timeout', async () => {
    const config = { ...testConfig(keyPrefix), probeTimeoutMs: 100 };
    const gate = createMimoUsageGate(config);
    try {
      await cleanupClient.call('CLIENT', 'PAUSE', '500', 'WRITE');
      await expect(
        gate.reserve({
          operation: 'ai',
          scope: {
            userId: 'integration-user',
            patientId: 'integration-patient',
            organizationId: 'integration-organization',
          },
          idempotencyKey: 'integration-kv-failure-0001',
        }),
      ).rejects.toMatchObject({ status: 503 });
      await new Promise((resolve) => setTimeout(resolve, 550));
    } finally {
      await gate.close();
    }
  });
});
