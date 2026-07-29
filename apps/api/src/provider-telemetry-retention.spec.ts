import {
  ProviderTelemetryRetentionError,
  providerTelemetryRetentionFailureEvent,
  purgeExpiredProviderTelemetry,
  requireProviderTelemetryRetentionDays,
  requireProviderTelemetryRetentionTimeoutMs,
} from './provider-telemetry-retention';

function retentionPrisma() {
  const transaction = {
    providerCallTelemetry: {
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    providerTelemetryRetentionRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: 'existing-run-1',
        status: 'failed',
        retentionDays: 30,
        cutoff: new Date('2026-06-21T12:00:00.000Z'),
        executionDeadlineAt: new Date('2026-07-21T12:02:00.000Z'),
        attemptCount: 1,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    systemEventLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const $transaction = jest.fn<
    Promise<unknown>,
    [
      (value: typeof transaction) => unknown,
      { maxWait: number; timeout: number },
    ]
  >();
  const transactionOptions: Array<{ maxWait: number; timeout: number }> = [];
  $transaction.mockImplementation((callback, options) => {
    transactionOptions.push(options);
    return Promise.resolve(callback(transaction));
  });
  const prisma = {
    $transaction,
    ...transaction,
  };
  return { prisma, transaction, transactionOptions };
}

describe('provider telemetry retention', () => {
  it('maps retention failures to an allowlisted event without error details', () => {
    expect(
      providerTelemetryRetentionFailureEvent(
        new ProviderTelemetryRetentionError('execution_timeout'),
      ),
    ).toEqual({
      eventCode: 'provider_telemetry.retention.failed',
      failureCode: 'execution_timeout',
    });
    expect(
      providerTelemetryRetentionFailureEvent(
        new Error('database URL and row details must not be logged'),
      ),
    ).toEqual({
      eventCode: 'provider_telemetry.retention.failed',
      failureCode: 'retention_job_unavailable',
    });
  });

  it('requires a customer-approved 30 to 3650 day retention period', () => {
    expect(
      requireProviderTelemetryRetentionDays({
        PROVIDER_TELEMETRY_RETENTION_DAYS: '30',
      }),
    ).toBe(30);
    expect(
      requireProviderTelemetryRetentionDays({
        PROVIDER_TELEMETRY_RETENTION_DAYS: '3650',
      }),
    ).toBe(3650);
    for (const value of [
      undefined,
      '0',
      '29',
      '3651',
      '1.5',
      ' 180',
      '9007199254740992',
    ]) {
      expect(() =>
        requireProviderTelemetryRetentionDays({
          PROVIDER_TELEMETRY_RETENTION_DAYS: value,
        }),
      ).toThrow(/PROVIDER_TELEMETRY_RETENTION_DAYS/);
    }
  });

  it('requires a finite retention execution timeout without a default', () => {
    expect(
      requireProviderTelemetryRetentionTimeoutMs({
        PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: '120000',
      }),
    ).toBe(120000);
    for (const value of [undefined, '0', '1.5', ' 1000', '2147483648']) {
      expect(() =>
        requireProviderTelemetryRetentionTimeoutMs({
          PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: value,
        }),
      ).toThrow(/PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS/);
    }
  });

  it('creates one UTC run record and atomically deletes only expired telemetry with its success event', async () => {
    const { prisma, transaction, transactionOptions } = retentionPrisma();
    const result = await purgeExpiredProviderTelemetry(
      prisma as never,
      30,
      120000,
      new Date('2026-07-21T12:00:00.000Z'),
    );

    expect(result).toEqual({
      status: 'completed',
      deletedCount: 3,
      cutoff: '2026-06-21T12:00:00.000Z',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(
      transaction.providerTelemetryRetentionRun.create,
    ).toHaveBeenCalledWith({
      data: {
        runDate: new Date('2026-07-21T00:00:00.000Z'),
        status: 'running',
        retentionDays: 30,
        cutoff: new Date('2026-06-21T12:00:00.000Z'),
        executionDeadlineAt: new Date('2026-07-21T12:02:00.000Z'),
        attemptCount: 1,
      },
      select: { id: true },
    });
    expect(transaction.providerCallTelemetry.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-06-21T12:00:00.000Z') } },
    });
    expect(transaction.systemEventLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'provider_telemetry.retention_purge',
        severity: 'info',
        message: 'Provider telemetry retention purge completed.',
        metadata: {
          runDate: '2026-07-21T00:00:00.000Z',
          retentionDays: 30,
          cutoff: '2026-06-21T12:00:00.000Z',
          deletedCount: 3,
          attemptType: 'initial',
          attemptNumber: 1,
        },
      },
    });
    expect(
      transaction.providerTelemetryRetentionRun.update,
    ).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'completed',
        deletedCount: 3,
        failureCode: null,
        executionDeadlineAt: null,
        completedAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    for (const options of transactionOptions) {
      expect(options.maxWait).toEqual(expect.any(Number));
      expect(options.timeout).toEqual(expect.any(Number));
      expect(options.maxWait).toBeGreaterThan(0);
      expect(options.maxWait).toBeLessThanOrEqual(120000);
      expect(options.timeout).toBe(options.maxWait);
    }
  });

  it('uses one total execution deadline across all retention transactions', async () => {
    const dateNow = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(90);
    const { prisma, transactionOptions } = retentionPrisma();
    try {
      await purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        100,
        new Date('2026-07-21T12:00:00.000Z'),
      );
      expect(transactionOptions[0]).toEqual({
        maxWait: 100,
        timeout: 100,
      });
      expect(transactionOptions[1]).toEqual({
        maxWait: 10,
        timeout: 10,
      });
    } finally {
      dateNow.mockRestore();
    }
  });

  it('does not delete anything when an existing UTC run cannot be atomically claimed from failed', async () => {
    const { prisma, transaction } = retentionPrisma();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T23:59:59.999Z'),
      ),
    ).resolves.toEqual({
      status: 'already_ran',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(transaction.providerCallTelemetry.deleteMany).not.toHaveBeenCalled();
    expect(transaction.systemEventLog.create).not.toHaveBeenCalled();
    expect(
      transaction.providerTelemetryRetentionRun.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'existing-run-1',
        runDate: new Date('2026-07-21T00:00:00.000Z'),
        status: 'failed',
      },
      data: {
        status: 'running',
        failureCode: null,
        completedAt: null,
        executionDeadlineAt: new Date('2026-07-22T00:01:59.999Z'),
        attemptCount: { increment: 1 },
      },
    });
  });

  it('preserves completed daily retention idempotency', async () => {
    const { prisma, transaction } = retentionPrisma();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    transaction.providerTelemetryRetentionRun.findUnique.mockResolvedValueOnce({
      id: 'completed-run-1',
      status: 'completed',
      retentionDays: 30,
      cutoff: new Date('2026-06-21T12:00:00.000Z'),
      executionDeadlineAt: null,
      attemptCount: 1,
    });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      status: 'already_ran',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(
      transaction.providerTelemetryRetentionRun.updateMany,
    ).not.toHaveBeenCalled();
    expect(transaction.providerCallTelemetry.deleteMany).not.toHaveBeenCalled();
    expect(transaction.systemEventLog.create).not.toHaveBeenCalled();
  });

  it('keeps a legacy or unexpired running record closed to replay', async () => {
    const { prisma, transaction } = retentionPrisma();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    transaction.providerTelemetryRetentionRun.findUnique.mockResolvedValueOnce({
      id: 'legacy-running-run-1',
      status: 'running',
      retentionDays: 30,
      cutoff: new Date('2026-06-21T12:00:00.000Z'),
      executionDeadlineAt: null,
      attemptCount: 1,
    });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      status: 'already_ran',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(
      transaction.providerTelemetryRetentionRun.updateMany,
    ).not.toHaveBeenCalled();
    expect(transaction.providerCallTelemetry.deleteMany).not.toHaveBeenCalled();
    expect(transaction.systemEventLog.create).not.toHaveBeenCalled();
  });

  it('atomically retries a failed UTC run with its original retention boundary', async () => {
    const { prisma, transaction } = retentionPrisma();
    const originalCutoff = new Date('2026-06-11T12:00:00.000Z');
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    transaction.providerTelemetryRetentionRun.findUnique.mockResolvedValueOnce({
      id: 'failed-run-1',
      status: 'failed',
      retentionDays: 40,
      cutoff: originalCutoff,
      executionDeadlineAt: new Date('2026-07-21T11:59:00.000Z'),
      attemptCount: 1,
    });
    transaction.providerTelemetryRetentionRun.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      status: 'completed',
      deletedCount: 3,
      cutoff: '2026-06-11T12:00:00.000Z',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(
      transaction.providerTelemetryRetentionRun.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'failed-run-1',
        runDate: new Date('2026-07-21T00:00:00.000Z'),
        status: 'failed',
      },
      data: {
        status: 'running',
        failureCode: null,
        completedAt: null,
        executionDeadlineAt: new Date('2026-07-21T12:02:00.000Z'),
        attemptCount: { increment: 1 },
      },
    });
    expect(transaction.systemEventLog.create).toHaveBeenNthCalledWith(1, {
      data: {
        eventType: 'provider_telemetry.retention_purge_retry_started',
        severity: 'warning',
        message: 'Provider telemetry retention purge retry started.',
        metadata: {
          runDate: '2026-07-21T00:00:00.000Z',
          retentionDays: 40,
          cutoff: '2026-06-11T12:00:00.000Z',
          retryCause: 'failed',
          attemptNumber: 2,
        },
      },
    });
    expect(transaction.providerCallTelemetry.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: originalCutoff } },
    });
    expect(transaction.systemEventLog.create).toHaveBeenNthCalledWith(2, {
      data: {
        eventType: 'provider_telemetry.retention_purge',
        severity: 'info',
        message: 'Provider telemetry retention purge completed.',
        metadata: {
          runDate: '2026-07-21T00:00:00.000Z',
          retentionDays: 40,
          cutoff: '2026-06-11T12:00:00.000Z',
          deletedCount: 3,
          attemptType: 'retry',
          attemptNumber: 2,
        },
      },
    });
    expect(
      transaction.providerTelemetryRetentionRun.update,
    ).toHaveBeenCalledWith({
      where: { id: 'failed-run-1' },
      data: {
        status: 'completed',
        deletedCount: 3,
        failureCode: null,
        executionDeadlineAt: null,
        completedAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    });
  });

  it('atomically takes over only a persisted running attempt after its deadline expires', async () => {
    const { prisma, transaction } = retentionPrisma();
    const originalCutoff = new Date('2026-06-11T12:00:00.000Z');
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    transaction.providerTelemetryRetentionRun.findUnique.mockResolvedValueOnce({
      id: 'expired-running-run-1',
      status: 'running',
      retentionDays: 40,
      cutoff: originalCutoff,
      executionDeadlineAt: new Date('2026-07-21T11:59:59.999Z'),
      attemptCount: 3,
    });
    transaction.providerTelemetryRetentionRun.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      status: 'completed',
      deletedCount: 3,
      cutoff: '2026-06-11T12:00:00.000Z',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(
      transaction.providerTelemetryRetentionRun.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'expired-running-run-1',
        runDate: new Date('2026-07-21T00:00:00.000Z'),
        status: 'running',
        executionDeadlineAt: {
          lte: new Date('2026-07-21T12:00:00.000Z'),
        },
      },
      data: {
        status: 'running',
        failureCode: null,
        completedAt: null,
        executionDeadlineAt: new Date('2026-07-21T12:02:00.000Z'),
        attemptCount: { increment: 1 },
      },
    });
    expect(transaction.systemEventLog.create).toHaveBeenNthCalledWith(1, {
      data: {
        eventType: 'provider_telemetry.retention_purge_retry_started',
        severity: 'warning',
        message: 'Provider telemetry retention purge retry started.',
        metadata: {
          runDate: '2026-07-21T00:00:00.000Z',
          retentionDays: 40,
          cutoff: '2026-06-11T12:00:00.000Z',
          retryCause: 'expired_running',
          attemptNumber: 4,
        },
      },
    });
  });

  it('fails closed when another worker claims the failed UTC run first', async () => {
    const { prisma, transaction } = retentionPrisma();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    transaction.providerTelemetryRetentionRun.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      status: 'already_ran',
      runDate: '2026-07-21T00:00:00.000Z',
    });
    expect(transaction.providerCallTelemetry.deleteMany).not.toHaveBeenCalled();
    expect(transaction.systemEventLog.create).not.toHaveBeenCalled();
  });

  it('returns a failed retry to failed with an auditable retry failure event', async () => {
    const { prisma, transaction } = retentionPrisma();
    const originalCutoff = new Date('2026-06-11T12:00:00.000Z');
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce((callback) =>
        Promise.resolve(callback(transaction)),
      )
      .mockRejectedValueOnce({ code: 'P2028' })
      .mockImplementationOnce((callback) =>
        Promise.resolve(callback(transaction)),
      );
    transaction.providerTelemetryRetentionRun.findUnique.mockResolvedValueOnce({
      id: 'failed-run-1',
      status: 'failed',
      retentionDays: 40,
      cutoff: originalCutoff,
      executionDeadlineAt: new Date('2026-07-21T11:59:00.000Z'),
      attemptCount: 1,
    });
    transaction.providerTelemetryRetentionRun.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).rejects.toEqual(new ProviderTelemetryRetentionError('execution_timeout'));
    expect(
      transaction.providerTelemetryRetentionRun.update,
    ).toHaveBeenCalledWith({
      where: { id: 'failed-run-1' },
      data: {
        status: 'failed',
        failureCode: 'execution_timeout',
        completedAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    });
    expect(transaction.systemEventLog.create).toHaveBeenLastCalledWith({
      data: {
        eventType: 'provider_telemetry.retention_purge_failed',
        severity: 'error',
        message: 'Provider telemetry retention purge failed.',
        metadata: {
          runDate: '2026-07-21T00:00:00.000Z',
          retentionDays: 40,
          cutoff: '2026-06-11T12:00:00.000Z',
          failureCode: 'execution_timeout',
          attemptType: 'retry',
          attemptNumber: 2,
        },
      },
    });
  });

  it('records a sanitized failure event after a bounded transaction failure', async () => {
    const { prisma, transaction } = retentionPrisma();
    prisma.$transaction
      .mockImplementationOnce((callback) =>
        Promise.resolve(callback(transaction)),
      )
      .mockRejectedValueOnce({ code: 'P2028' })
      .mockImplementationOnce((callback) =>
        Promise.resolve(callback(transaction)),
      );

    await expect(
      purgeExpiredProviderTelemetry(
        prisma as never,
        30,
        120000,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).rejects.toEqual(new ProviderTelemetryRetentionError('execution_timeout'));
    expect(transaction.providerCallTelemetry.deleteMany).not.toHaveBeenCalled();
    expect(
      transaction.providerTelemetryRetentionRun.update,
    ).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'failed',
        failureCode: 'execution_timeout',
        completedAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    });
    expect(transaction.systemEventLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'provider_telemetry.retention_purge_failed',
        severity: 'error',
        message: 'Provider telemetry retention purge failed.',
        metadata: {
          runDate: '2026-07-21T00:00:00.000Z',
          retentionDays: 30,
          cutoff: '2026-06-21T12:00:00.000Z',
          failureCode: 'execution_timeout',
          attemptType: 'initial',
          attemptNumber: 1,
        },
      },
    });
  });
});
