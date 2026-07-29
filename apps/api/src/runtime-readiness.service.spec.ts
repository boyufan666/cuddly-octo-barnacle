import { ServiceUnavailableException } from '@nestjs/common';
import {
  expectedPrismaMigrationChecksums,
  expectedPrismaMigrations,
} from './expected-prisma-migrations';
import { RuntimeReadinessService } from './runtime-readiness.service';

function appliedMigrations() {
  return expectedPrismaMigrations.map((migration_name) => ({
    migration_name,
    checksum: expectedPrismaMigrationChecksums[migration_name],
    finished_at: new Date('2026-07-21T00:00:00.000Z'),
    rolled_back_at: null,
  }));
}

function createRawQueryMock() {
  return jest.fn<Promise<unknown>, [TemplateStringsArray]>();
}

function readyPrisma() {
  const $queryRaw = createRawQueryMock();
  $queryRaw
    .mockResolvedValueOnce([{ ok: 1 }])
    .mockResolvedValueOnce(appliedMigrations());
  return {
    $queryRaw,
  };
}

describe('RuntimeReadinessService', () => {
  const originalNodeEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  });

  it('checks database reachability and every expected migration without provider calls', async () => {
    process.env.NODE_ENV = 'test';
    const $queryRaw = createRawQueryMock();
    $queryRaw
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce(appliedMigrations());
    const prisma = {
      $queryRaw,
    };
    const service = new RuntimeReadinessService(prisma as never, undefined);

    await expect(service.assertReady()).resolves.toEqual({
      status: 'ready',
      service: 'rehab-platform-api',
      migrationCount: expectedPrismaMigrations.length,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    for (const call of prisma.$queryRaw.mock.calls) {
      expect(call).toHaveLength(1);
      expect(Array.isArray(call[0])).toBe(true);
    }
  });

  it('fails closed when the database is unreachable or migrations are incomplete', async () => {
    process.env.NODE_ENV = 'test';
    const unavailableQuery = createRawQueryMock();
    unavailableQuery.mockRejectedValue(new Error('connection refused'));
    const unavailablePrisma = {
      $queryRaw: unavailableQuery,
    };
    await expect(
      new RuntimeReadinessService(
        unavailablePrisma as never,
        undefined,
      ).assertReady(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const incompleteQuery = createRawQueryMock();
    incompleteQuery
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce(appliedMigrations().slice(1));
    const incompletePrisma = {
      $queryRaw: incompleteQuery,
    };
    await expect(
      new RuntimeReadinessService(
        incompletePrisma as never,
        undefined,
      ).assertReady(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const checksumMismatchQuery = createRawQueryMock();
    checksumMismatchQuery
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([
        ...appliedMigrations().slice(0, -1),
        {
          ...appliedMigrations().at(-1),
          checksum: 'tampered-checksum',
        },
      ]);
    const checksumMismatchPrisma = {
      $queryRaw: checksumMismatchQuery,
    };
    await expect(
      new RuntimeReadinessService(
        checksumMismatchPrisma as never,
        undefined,
      ).assertReady(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('requires a working shared Key Value probe only in production', async () => {
    process.env.NODE_ENV = 'production';
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const prisma = readyPrisma();
    const gate = { assertReady: jest.fn().mockResolvedValue(undefined) };

    await expect(
      new RuntimeReadinessService(prisma as never, gate as never).assertReady(),
    ).resolves.toMatchObject({ status: 'ready' });
    expect(gate.assertReady).toHaveBeenCalledTimes(1);

    const missingGatePrisma = readyPrisma();
    await expect(
      new RuntimeReadinessService(
        missingGatePrisma as never,
        undefined,
      ).assertReady(),
    ).rejects.toThrow('共享 AI 配额服务未初始化，已阻断接流。');
    expect(missingGatePrisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
      '"eventCode":"runtime.ready.failed"',
    );
    expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
      '"dependency":"key_value"',
    );
  });

  it('propagates a failed production Key Value probe after database readiness succeeds', async () => {
    process.env.NODE_ENV = 'production';
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const prisma = readyPrisma();
    const keyValueFailure = new ServiceUnavailableException(
      '共享 AI 配额服务不可用，已阻断高成本供应商调用。',
    );
    const gate = { assertReady: jest.fn().mockRejectedValue(keyValueFailure) };

    await expect(
      new RuntimeReadinessService(prisma as never, gate as never).assertReady(),
    ).rejects.toBe(keyValueFailure);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(gate.assertReady).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      eventCode: 'runtime.ready.failed',
      dependency: 'key_value',
      reasonCode: 'blocked',
    });
  });

  it('emits a minimal production ready event for database failure', async () => {
    process.env.NODE_ENV = 'production';
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const $queryRaw = createRawQueryMock();
    $queryRaw.mockRejectedValue(new Error('database URL must not be logged'));
    const prisma = {
      $queryRaw,
    };

    await expect(
      new RuntimeReadinessService(prisma as never, undefined).assertReady(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const line = String(stderr.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      eventCode: 'runtime.ready.failed',
      dependency: 'database',
      reasonCode: 'unavailable',
    });
    expect(line).not.toContain('database URL');
  });
});
