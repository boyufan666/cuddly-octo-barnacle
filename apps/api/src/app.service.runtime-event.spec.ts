import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import type { RequestUser } from './current-user';
import {
  MimoQuotaExceededException,
  type MimoUsageGate,
} from './mimo-usage-gate';
import type { PrismaService } from './prisma.service';
import type {
  ProviderTelemetryRecord,
  ProviderTelemetryService,
} from './provider-telemetry.service';

type RuntimeEventMethods = {
  reserveMimoUsage(
    user: RequestUser,
    patientId: string,
    operation: 'ai' | 'speech' | 'tts',
    idempotencyKey: unknown,
    quantity?: number,
  ): Promise<void>;
  recordProviderTelemetry(record: ProviderTelemetryRecord): Promise<void>;
  auditProviderOperation(
    operation: 'ai' | 'speech' | 'tts',
    writeAudit: () => Promise<void>,
    failureStage?: 'provider_call' | 'provider_response_validation',
  ): Promise<void>;
};

const testEncryptionKey = {
  kid: 'unit-runtime-event-key',
  key: Buffer.alloc(32, 13),
};

const requestUser: RequestUser = {
  id: 'sensitive-user-id-must-not-appear',
  account: 'doctor001',
  displayName: 'Doctor',
  roles: [],
};

function createRuntimeEventService(options?: {
  reserve?: jest.Mock;
  record?: jest.Mock;
  omitProviderTelemetry?: boolean;
}) {
  const reserve = options?.reserve ?? jest.fn().mockResolvedValue(undefined);
  const record = options?.record ?? jest.fn().mockResolvedValue(undefined);
  const prisma = {
    patientProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'sensitive-patient-id-must-not-appear',
        responsibleDoctor: {
          organizationId: 'sensitive-organization-id-must-not-appear',
        },
      }),
    },
  };
  const service = new AppService(
    prisma as unknown as PrismaService,
    testEncryptionKey,
    { reserve } as unknown as MimoUsageGate,
    options?.omitProviderTelemetry
      ? undefined
      : ({ record } as unknown as ProviderTelemetryService),
  ) as unknown as RuntimeEventMethods;
  return { record, reserve, service };
}

describe('AppService production runtime events', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it.each([
    {
      error: new MimoQuotaExceededException(
        'quota error with clinical details must not appear',
      ),
      reasonCode: 'quota_exceeded',
    },
    {
      error: new ConflictException(
        'idempotency input with clinical details must not appear',
      ),
      reasonCode: 'duplicate_or_invalid_request',
    },
  ])('emits a sanitized high-cost $reasonCode event', async (fixture) => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const { service } = createRuntimeEventService({
      reserve: jest.fn().mockRejectedValue(fixture.error),
    });

    await expect(
      service.reserveMimoUsage(
        requestUser,
        'sensitive-patient-id-must-not-appear',
        'speech',
        'sensitive-idempotency-key-1234',
        30,
      ),
    ).rejects.toBe(fixture.error);

    expect(stderr).toHaveBeenCalledTimes(1);
    const line = String(stderr.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      schema: 'rehab.production-runtime-event/v1',
      eventCode: 'mimo.high_cost.rejected',
      severity: 'warning',
      component: 'mimo-usage-gate',
      operation: 'speech',
      reasonCode: fixture.reasonCode,
    });
    expect(line).not.toContain('sensitive-');
    expect(line).not.toContain('clinical details');
  });

  it.each(['provider_failure', 'response_rejected'] as const)(
    'persists provider %s telemetry without emitting a duplicate primary event',
    async (statusCategory) => {
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { record, service } = createRuntimeEventService();
      const telemetryRecord: ProviderTelemetryRecord = {
        actorUserId: 'sensitive-user-id-must-not-appear',
        patientId: 'sensitive-patient-id-must-not-appear',
        operation: 'ai',
        provider: 'mimo',
        modelVersion: 'model',
        endpoint: 'https://provider.example/v1',
        apiKeyRef: 'sensitive-secret-reference-must-not-appear',
        requestId: 'sensitive-request-id-must-not-appear',
        statusCategory,
        requestContentHash: 'sensitive-request-hash-must-not-appear',
        responseContentHash: 'sensitive-response-hash-must-not-appear',
      };

      await expect(
        service.recordProviderTelemetry(telemetryRecord),
      ).resolves.toBeUndefined();

      expect(record).toHaveBeenCalledWith(telemetryRecord);
      expect(stderr).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['provider_failure', 'provider_call'],
    ['response_rejected', 'provider_response_validation'],
  ] as const)(
    'emits a sanitized provider %s event before audit persistence, including when the audit write fails',
    async (_statusCategory, failureStage) => {
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { service } = createRuntimeEventService();
      const writeAudit = jest.fn().mockImplementation(() => {
        expect(stderr).toHaveBeenCalledTimes(1);
        return Promise.reject(new Error('sensitive audit database failure'));
      });

      await expect(
        service.auditProviderOperation('ai', writeAudit, failureStage),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(writeAudit).toHaveBeenCalledTimes(1);
      expect(stderr).toHaveBeenCalledTimes(2);
      const primaryEventLine = String(stderr.mock.calls[0]?.[0]);
      expect(JSON.parse(primaryEventLine)).toEqual({
        schema: 'rehab.production-runtime-event/v1',
        eventCode: 'mimo.provider.failed',
        severity: 'error',
        component: 'mimo-provider',
        operation: 'ai',
        failureStage,
      });
      expect(primaryEventLine).not.toContain('sensitive');
      expect(JSON.parse(String(stderr.mock.calls[1]?.[0]))).toEqual({
        schema: 'rehab.production-runtime-event/v1',
        eventCode: 'mimo.provider.audit_write.failed',
        severity: 'error',
        component: 'mimo-provider-audit',
        operation: 'ai',
      });
    },
  );

  it('emits only the telemetry write failure event and returns a fixed 503', async () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const sensitiveProviderFailure = new Error(
      'sensitive provider telemetry database failure',
    );
    const { record, service } = createRuntimeEventService({
      record: jest.fn().mockRejectedValue(sensitiveProviderFailure),
    });
    const telemetryRecord: ProviderTelemetryRecord = {
      actorUserId: 'sensitive-user-id-must-not-appear',
      patientId: 'sensitive-patient-id-must-not-appear',
      operation: 'tts',
      provider: 'mimo',
      modelVersion: 'model',
      endpoint: 'https://provider.example/v1',
      apiKeyRef: 'sensitive-secret-reference-must-not-appear',
      requestId: 'sensitive-request-id-must-not-appear',
      statusCategory: 'provider_success',
      requestContentHash: 'sensitive-request-hash-must-not-appear',
    };

    let caught: unknown;
    try {
      await service.recordProviderTelemetry(telemetryRecord);
    } catch (error) {
      caught = error;
    }

    expect(record).toHaveBeenCalledTimes(1);
    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as ServiceUnavailableException).getResponse()).toEqual({
      statusCode: 503,
      message: '供应商遥测记录失败，已阻断高成本供应商调用。',
      error: 'Service Unavailable',
    });
    expect(JSON.stringify(caught)).not.toContain('sensitive');
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toEqual({
      schema: 'rehab.production-runtime-event/v1',
      eventCode: 'mimo.provider.telemetry_write.failed',
      severity: 'error',
      component: 'mimo-provider-telemetry',
      operation: 'tts',
    });
  });

  it.each(['ai', 'speech', 'tts'] as const)(
    'emits the telemetry write failure event and preserves the fixed 503 when the optional service is unavailable for %s',
    async (operation) => {
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { record, service } = createRuntimeEventService({
        omitProviderTelemetry: true,
      });
      const telemetryRecord: ProviderTelemetryRecord = {
        actorUserId: 'sensitive-user-id-must-not-appear',
        patientId: 'sensitive-patient-id-must-not-appear',
        operation,
        provider: 'mimo',
        modelVersion: 'model',
        endpoint: 'https://provider.example/v1',
        apiKeyRef: 'sensitive-secret-reference-must-not-appear',
        requestId: 'sensitive-request-id-must-not-appear',
        statusCategory: 'provider_success',
        requestContentHash: 'sensitive-request-hash-must-not-appear',
      };

      let caught: unknown;
      try {
        await service.recordProviderTelemetry(telemetryRecord);
      } catch (error) {
        caught = error;
      }

      expect(record).not.toHaveBeenCalled();
      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
      expect((caught as ServiceUnavailableException).getResponse()).toEqual({
        statusCode: 503,
        message: '供应商遥测服务未初始化，已阻断高成本供应商调用。',
        error: 'Service Unavailable',
      });
      expect(JSON.stringify(caught)).not.toContain('sensitive');
      expect(stderr).toHaveBeenCalledTimes(1);
      const line = String(stderr.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toEqual({
        schema: 'rehab.production-runtime-event/v1',
        eventCode: 'mimo.provider.telemetry_write.failed',
        severity: 'error',
        component: 'mimo-provider-telemetry',
        operation,
      });
      expect(line).not.toContain('sensitive-');
    },
  );

  it.each(['ai', 'speech', 'tts'] as const)(
    'emits only the audit write failure event and returns a fixed 503 for %s',
    async (operation) => {
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { service } = createRuntimeEventService();
      const writeAudit = jest
        .fn()
        .mockRejectedValue(new Error('sensitive audit database failure'));

      let caught: unknown;
      try {
        await service.auditProviderOperation(operation, writeAudit);
      } catch (error) {
        caught = error;
      }

      expect(writeAudit).toHaveBeenCalledTimes(1);
      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
      expect((caught as ServiceUnavailableException).getResponse()).toEqual({
        statusCode: 503,
        message: '供应商审计记录失败，已阻断高成本供应商调用。',
        error: 'Service Unavailable',
      });
      expect(JSON.stringify(caught)).not.toContain('sensitive');
      expect(stderr).toHaveBeenCalledTimes(1);
      const line = String(stderr.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toEqual({
        schema: 'rehab.production-runtime-event/v1',
        eventCode: 'mimo.provider.audit_write.failed',
        severity: 'error',
        component: 'mimo-provider-audit',
        operation,
      });
      expect(line).not.toContain('sensitive');
    },
  );
});
