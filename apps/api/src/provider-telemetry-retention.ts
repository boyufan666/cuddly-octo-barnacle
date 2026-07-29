import { PrismaClient } from '@prisma/client';
import {
  emitProductionRuntimeEvent,
  type ProductionRuntimeEvent,
} from './production-runtime-event';

const millisecondsPerDay = 24 * 60 * 60 * 1000;
export const MIN_PROVIDER_TELEMETRY_RETENTION_DAYS = 30;
export const MAX_PROVIDER_TELEMETRY_RETENTION_DAYS = 3650;
export const MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS = 2_147_483_647;

type ProviderTelemetryRetentionPrisma = Pick<
  PrismaClient,
  | '$transaction'
  | 'providerCallTelemetry'
  | 'providerTelemetryRetentionRun'
  | 'systemEventLog'
>;

type RetentionFailureCode =
  | 'database_operation_failed'
  | 'execution_timeout'
  | 'failure_audit_unavailable';

type RetentionRunResult =
  | {
      status: 'completed';
      deletedCount: number;
      cutoff: string;
      runDate: string;
    }
  | {
      status: 'already_ran';
      runDate: string;
    };

type RetentionAttemptType = 'initial' | 'retry';
type RetentionRetryCause = 'failed' | 'expired_running';

type AcquiredRetentionRun = {
  id: string;
  runDate: Date;
  retentionDays: number;
  cutoff: Date;
  attemptType: RetentionAttemptType;
  attemptNumber: number;
};

type RetentionRunAcquisition =
  | {
      status: 'acquired';
      run: AcquiredRetentionRun;
    }
  | {
      status: 'already_ran';
      runDate: string;
    };

export class ProviderTelemetryRetentionError extends Error {
  constructor(readonly code: RetentionFailureCode) {
    super(`Provider telemetry retention failed: ${code}.`);
  }
}

export function providerTelemetryRetentionFailureEvent(
  error: unknown,
): ProductionRuntimeEvent {
  return {
    eventCode: 'provider_telemetry.retention.failed',
    failureCode:
      error instanceof ProviderTelemetryRetentionError
        ? error.code
        : 'retention_job_unavailable',
  };
}

function requireBase10PositiveSafeInteger(
  value: string | undefined,
  name: string,
) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

export function requireProviderTelemetryRetentionDays(
  environment: Record<string, string | undefined> = process.env,
) {
  const days = requireBase10PositiveSafeInteger(
    environment.PROVIDER_TELEMETRY_RETENTION_DAYS,
    'PROVIDER_TELEMETRY_RETENTION_DAYS',
  );
  if (
    days < MIN_PROVIDER_TELEMETRY_RETENTION_DAYS ||
    days > MAX_PROVIDER_TELEMETRY_RETENTION_DAYS
  ) {
    throw new Error(
      `PROVIDER_TELEMETRY_RETENTION_DAYS must be an integer from ${MIN_PROVIDER_TELEMETRY_RETENTION_DAYS} to ${MAX_PROVIDER_TELEMETRY_RETENTION_DAYS}.`,
    );
  }
  return days;
}

export function requireProviderTelemetryRetentionTimeoutMs(
  environment: Record<string, string | undefined> = process.env,
) {
  const timeoutMs = requireBase10PositiveSafeInteger(
    environment.PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS,
    'PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS',
  );
  if (timeoutMs > MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS) {
    throw new Error(
      `PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS must not exceed ${MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS}.`,
    );
  }
  return timeoutMs;
}

function requireRetentionDays(retentionDays: number) {
  if (
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < MIN_PROVIDER_TELEMETRY_RETENTION_DAYS ||
    retentionDays > MAX_PROVIDER_TELEMETRY_RETENTION_DAYS
  ) {
    throw new Error(
      `Provider telemetry retention days must be an integer from ${MIN_PROVIDER_TELEMETRY_RETENTION_DAYS} to ${MAX_PROVIDER_TELEMETRY_RETENTION_DAYS}.`,
    );
  }
}

function requireRetentionTimeout(executionTimeoutMs: number) {
  if (
    !Number.isSafeInteger(executionTimeoutMs) ||
    executionTimeoutMs < 1 ||
    executionTimeoutMs > MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS
  ) {
    throw new Error(
      `Provider telemetry retention timeout must be a positive safe integer no greater than ${MAX_PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS}.`,
    );
  }
}

function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function transactionOptions(executionDeadlineMs: number) {
  const remainingTimeoutMs = executionDeadlineMs - Date.now();
  if (remainingTimeoutMs < 1) {
    throw new ProviderTelemetryRetentionError('execution_timeout');
  }
  return {
    maxWait: remainingTimeoutMs,
    timeout: remainingTimeoutMs,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function classifyFailure(error: unknown): RetentionFailureCode {
  if (error instanceof ProviderTelemetryRetentionError) {
    return error.code;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2028'
  ) {
    return 'execution_timeout';
  }
  return 'database_operation_failed';
}

function failureEventData(input: {
  runDate: Date;
  retentionDays: number;
  cutoff: Date;
  failureCode: RetentionFailureCode;
  attemptType: RetentionAttemptType;
  attemptNumber: number;
}) {
  return {
    eventType: 'provider_telemetry.retention_purge_failed',
    severity: 'error',
    message: 'Provider telemetry retention purge failed.',
    metadata: {
      runDate: input.runDate.toISOString(),
      retentionDays: input.retentionDays,
      cutoff: input.cutoff.toISOString(),
      failureCode: input.failureCode,
      attemptType: input.attemptType,
      attemptNumber: input.attemptNumber,
    },
  };
}

function retryStartedEventData(input: {
  runDate: Date;
  retentionDays: number;
  cutoff: Date;
  retryCause: RetentionRetryCause;
  attemptNumber: number;
}) {
  return {
    eventType: 'provider_telemetry.retention_purge_retry_started',
    severity: 'warning',
    message: 'Provider telemetry retention purge retry started.',
    metadata: {
      runDate: input.runDate.toISOString(),
      retentionDays: input.retentionDays,
      cutoff: input.cutoff.toISOString(),
      retryCause: input.retryCause,
      attemptNumber: input.attemptNumber,
    },
  };
}

async function recordFailedRun(
  prisma: ProviderTelemetryRetentionPrisma,
  input: {
    runId?: string;
    runDate: Date;
    retentionDays: number;
    cutoff: Date;
    completedAt: Date;
    failureCode: RetentionFailureCode;
    attemptType: RetentionAttemptType;
    attemptNumber: number;
    executionDeadlineAt: Date;
    executionDeadlineMs: number;
  },
) {
  return prisma.$transaction(async (transaction) => {
    if (input.runId) {
      await transaction.providerTelemetryRetentionRun.update({
        where: { id: input.runId },
        data: {
          status: 'failed',
          failureCode: input.failureCode,
          completedAt: input.completedAt,
        },
      });
    } else {
      await transaction.providerTelemetryRetentionRun.create({
        data: {
          runDate: input.runDate,
          status: 'failed',
          retentionDays: input.retentionDays,
          cutoff: input.cutoff,
          failureCode: input.failureCode,
          executionDeadlineAt: input.executionDeadlineAt,
          attemptCount: input.attemptNumber,
          completedAt: input.completedAt,
        },
      });
    }
    await transaction.systemEventLog.create({
      data: failureEventData(input),
    });
  }, transactionOptions(input.executionDeadlineMs));
}

async function claimFailedRun(
  prisma: ProviderTelemetryRetentionPrisma,
  input: {
    runDate: Date;
    now: Date;
    nextExecutionDeadlineAt: Date;
    executionDeadlineMs: number;
  },
): Promise<RetentionRunAcquisition> {
  try {
    const claimedRun = await prisma.$transaction(async (transaction) => {
      const existingRun =
        await transaction.providerTelemetryRetentionRun.findUnique({
          where: { runDate: input.runDate },
          select: {
            id: true,
            status: true,
            retentionDays: true,
            cutoff: true,
            executionDeadlineAt: true,
            attemptCount: true,
          },
        });
      if (!existingRun) {
        throw new ProviderTelemetryRetentionError('database_operation_failed');
      }

      const retryCause =
        existingRun.status === 'failed'
          ? 'failed'
          : existingRun.status === 'running' &&
              existingRun.executionDeadlineAt !== null &&
              existingRun.executionDeadlineAt <= input.now
            ? 'expired_running'
            : null;
      if (!retryCause) {
        return null;
      }

      const claimed =
        await transaction.providerTelemetryRetentionRun.updateMany({
          where:
            retryCause === 'failed'
              ? {
                  id: existingRun.id,
                  runDate: input.runDate,
                  status: 'failed',
                }
              : {
                  id: existingRun.id,
                  runDate: input.runDate,
                  status: 'running',
                  executionDeadlineAt: { lte: input.now },
                },
          data: {
            status: 'running',
            failureCode: null,
            completedAt: null,
            executionDeadlineAt: input.nextExecutionDeadlineAt,
            attemptCount: { increment: 1 },
          },
        });
      if (claimed.count !== 1) {
        return null;
      }

      await transaction.systemEventLog.create({
        data: retryStartedEventData({
          runDate: input.runDate,
          retentionDays: existingRun.retentionDays,
          cutoff: existingRun.cutoff,
          retryCause,
          attemptNumber: existingRun.attemptCount + 1,
        }),
      });
      return { ...existingRun, retryCause };
    }, transactionOptions(input.executionDeadlineMs));

    if (!claimedRun) {
      return {
        status: 'already_ran',
        runDate: input.runDate.toISOString(),
      };
    }
    return {
      status: 'acquired',
      run: {
        id: claimedRun.id,
        runDate: input.runDate,
        retentionDays: claimedRun.retentionDays,
        cutoff: claimedRun.cutoff,
        attemptType: 'retry',
        attemptNumber: claimedRun.attemptCount + 1,
      },
    };
  } catch (error) {
    if (error instanceof ProviderTelemetryRetentionError) {
      throw error;
    }
    throw new ProviderTelemetryRetentionError(classifyFailure(error));
  }
}

async function acquireRetentionRun(
  prisma: ProviderTelemetryRetentionPrisma,
  input: {
    runDate: Date;
    retentionDays: number;
    cutoff: Date;
    now: Date;
    executionDeadlineAt: Date;
    executionDeadlineMs: number;
  },
): Promise<RetentionRunAcquisition> {
  try {
    const run = await prisma.$transaction(
      (transaction) =>
        transaction.providerTelemetryRetentionRun.create({
          data: {
            runDate: input.runDate,
            status: 'running',
            retentionDays: input.retentionDays,
            cutoff: input.cutoff,
            executionDeadlineAt: input.executionDeadlineAt,
            attemptCount: 1,
          },
          select: { id: true },
        }),
      transactionOptions(input.executionDeadlineMs),
    );
    return {
      status: 'acquired',
      run: {
        id: run.id,
        runDate: input.runDate,
        retentionDays: input.retentionDays,
        cutoff: input.cutoff,
        attemptType: 'initial',
        attemptNumber: 1,
      },
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return claimFailedRun(prisma, {
        runDate: input.runDate,
        now: input.now,
        nextExecutionDeadlineAt: input.executionDeadlineAt,
        executionDeadlineMs: input.executionDeadlineMs,
      });
    }

    const failureCode = classifyFailure(error);
    try {
      await recordFailedRun(prisma, {
        runDate: input.runDate,
        retentionDays: input.retentionDays,
        cutoff: input.cutoff,
        completedAt: input.now,
        failureCode,
        attemptType: 'initial',
        attemptNumber: 1,
        executionDeadlineAt: input.executionDeadlineAt,
        executionDeadlineMs: input.executionDeadlineMs,
      });
    } catch (failureAuditError) {
      if (failureAuditError instanceof ProviderTelemetryRetentionError) {
        throw failureAuditError;
      }
      throw new ProviderTelemetryRetentionError('failure_audit_unavailable');
    }
    throw new ProviderTelemetryRetentionError(failureCode);
  }
}

export async function purgeExpiredProviderTelemetry(
  prisma: ProviderTelemetryRetentionPrisma,
  retentionDays: number,
  executionTimeoutMs: number,
  now = new Date(),
): Promise<RetentionRunResult> {
  requireRetentionDays(retentionDays);
  requireRetentionTimeout(executionTimeoutMs);

  const runDate = utcDayStart(now);
  const cutoff = new Date(now.getTime() - retentionDays * millisecondsPerDay);
  const executionDeadlineAt = new Date(now.getTime() + executionTimeoutMs);
  const executionDeadlineMs = Date.now() + executionTimeoutMs;
  const acquisition = await acquireRetentionRun(prisma, {
    runDate,
    retentionDays,
    cutoff,
    now,
    executionDeadlineAt,
    executionDeadlineMs,
  });
  if (acquisition.status === 'already_ran') {
    return acquisition;
  }
  const run = acquisition.run;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const deletion = await transaction.providerCallTelemetry.deleteMany({
        where: { createdAt: { lt: run.cutoff } },
      });
      await transaction.systemEventLog.create({
        data: {
          eventType: 'provider_telemetry.retention_purge',
          severity: 'info',
          message: 'Provider telemetry retention purge completed.',
          metadata: {
            runDate: runDate.toISOString(),
            retentionDays: run.retentionDays,
            cutoff: run.cutoff.toISOString(),
            deletedCount: deletion.count,
            attemptType: run.attemptType,
            attemptNumber: run.attemptNumber,
          },
        },
      });
      await transaction.providerTelemetryRetentionRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          deletedCount: deletion.count,
          failureCode: null,
          executionDeadlineAt: null,
          completedAt: now,
        },
      });
      return deletion;
    }, transactionOptions(executionDeadlineMs));
    return {
      status: 'completed',
      deletedCount: result.count,
      cutoff: run.cutoff.toISOString(),
      runDate: runDate.toISOString(),
    };
  } catch (error) {
    const failureCode = classifyFailure(error);
    try {
      await recordFailedRun(prisma, {
        runId: run.id,
        runDate,
        retentionDays: run.retentionDays,
        cutoff: run.cutoff,
        completedAt: now,
        failureCode,
        attemptType: run.attemptType,
        attemptNumber: run.attemptNumber,
        executionDeadlineAt,
        executionDeadlineMs,
      });
    } catch (failureAuditError) {
      if (failureAuditError instanceof ProviderTelemetryRetentionError) {
        throw failureAuditError;
      }
      throw new ProviderTelemetryRetentionError('failure_audit_unavailable');
    }
    throw new ProviderTelemetryRetentionError(failureCode);
  }
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Provider telemetry retention can run only in production.');
  }
  const prisma = new PrismaClient();
  try {
    const result = await purgeExpiredProviderTelemetry(
      prisma,
      requireProviderTelemetryRetentionDays(),
      requireProviderTelemetryRetentionTimeoutMs(),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    emitProductionRuntimeEvent(providerTelemetryRetentionFailureEvent(error));
    process.exitCode = 1;
  });
}
