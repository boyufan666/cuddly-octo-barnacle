import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import type { RequestUser } from './current-user';
import type { MimoUsageGate } from './mimo-usage-gate';
import type { PrismaService } from './prisma.service';
import type {
  AcceptedProviderOperation,
  CreateProviderOperationInput,
  ProviderOperationService,
} from './provider-operation.service';
import type { ProviderTelemetryService } from './provider-telemetry.service';

const sensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-provider-operation-app-key',
  key: Buffer.alloc(32, 19),
};

const doctorUser: RequestUser = {
  id: 'doctor-user-id',
  account: 'doctor001',
  displayName: '王医生',
  roles: [
    {
      roleCode: 'doctor',
      relatedObjectType: 'doctor',
      relatedObjectId: 'doctor-profile-id',
    },
  ],
};

const aiEnvNames = [
  'NODE_ENV',
  'AI_REQUIRED_FOR_LAUNCH',
  'AI_PROVIDER',
  'AI_MODEL_VERSION',
  'AI_MODEL_ENDPOINT',
  'MIMO_API_KEY_REF',
  'MIMO_API_KEY',
  'AI_PROVIDER_TIMEOUT_MS',
  'AI_PROVIDER_MAX_RESPONSE_BYTES',
  'AI_PROMPT_VERSION',
  'AI_HUMAN_REVIEW_REQUIRED',
] as const;

const environmentSnapshot = { ...process.env };

function configureProductionAi() {
  process.env.NODE_ENV = 'production';
  process.env.AI_REQUIRED_FOR_LAUNCH = 'true';
  process.env.AI_PROVIDER = 'xiaomi-mimo';
  process.env.AI_MODEL_VERSION = 'mimo-v2.5-pro';
  process.env.AI_MODEL_ENDPOINT = 'https://token-plan-cn.xiaomimimo.com/v1';
  process.env.MIMO_API_KEY_REF = 'secret-manager://rehab/unit-mimo-key';
  process.env.MIMO_API_KEY = 'unit-runtime-secret';
  process.env.AI_PROVIDER_TIMEOUT_MS = '15000';
  process.env.AI_PROVIDER_MAX_RESPONSE_BYTES = '1048576';
  process.env.AI_PROMPT_VERSION = 'cognitive-assessment-mimo-2026-07';
  process.env.AI_HUMAN_REVIEW_REQUIRED = 'true';
}

function restoreEnvironment() {
  for (const name of aiEnvNames) {
    if (environmentSnapshot[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = environmentSnapshot[name];
    }
  }
}

function acceptedOperation(
  status: AcceptedProviderOperation['status'] = 'accepted',
): AcceptedProviderOperation {
  const now = new Date('2026-07-22T12:00:00.000Z');
  return {
    id: '67e55044-10b1-426f-9247-bb680e5fe0c8',
    organizationId: 'organization-id',
    patientId: 'patient-profile-id',
    actorUserId: doctorUser.id,
    operation: 'assessment_draft',
    clientIdempotencyKey: 'assessment-request-000001',
    status,
    provider: 'xiaomi-mimo',
    modelVersion: 'mimo-v2.5-pro',
    endpointHost: 'token-plan-cn.xiaomimimo.com',
    apiKeyRef: 'secret-manager://rehab/unit-mimo-key',
    promptVersion: 'cognitive-assessment-mimo-2026-07',
    providerCallId: null,
    providerRequestId: null,
    failureCategory: null,
    createdAt: now,
    updatedAt: now,
    wasCreated: status === 'accepted',
  };
}

function createService(
  status: AcceptedProviderOperation['status'] = 'accepted',
) {
  const prisma = {
    patientProfile: {
      findUnique: jest.fn(({ select }: { select: Record<string, unknown> }) => {
        if ('responsibleDoctor' in select) {
          return Promise.resolve({
            id: 'patient-profile-id',
            responsibleDoctor: { organizationId: 'organization-id' },
          });
        }
        return Promise.resolve({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
      }),
    },
    consentRecord: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'privacy-consent-id',
          patientId: 'patient-profile-id',
          consentType: 'privacy_policy',
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'ai-consent-id',
          patientId: 'patient-profile-id',
          consentType: 'ai_processing',
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  );
  const reserve = jest.fn().mockResolvedValue(undefined);
  const providerOperations = {
    createOrReadAccepted: jest
      .fn<Promise<AcceptedProviderOperation>, [CreateProviderOperationInput]>()
      .mockResolvedValue(acceptedOperation(status)),
    reserve: jest.fn().mockResolvedValue(acceptedOperation('reserved')),
    markDispatching: jest
      .fn()
      .mockResolvedValue(acceptedOperation('dispatching')),
    finalize: jest.fn().mockResolvedValue(acceptedOperation('completed')),
    finalizeInTransaction: jest
      .fn()
      .mockResolvedValue(acceptedOperation('completed')),
  };
  const telemetry = { record: jest.fn().mockResolvedValue(undefined) };

  return {
    prisma,
    reserve,
    providerOperations,
    telemetry,
    service: new AppService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
      { reserve } as unknown as MimoUsageGate,
      telemetry as unknown as ProviderTelemetryService,
      providerOperations as unknown as ProviderOperationService,
    ),
  };
}

function stubAiRuntimeConfig(service: AppService) {
  const methods = service as unknown as {
    requireAiRuntimeConfig: () => unknown;
  };
  jest.spyOn(methods, 'requireAiRuntimeConfig').mockReturnValue({
    provider: 'xiaomi-mimo',
    modelVersion: 'mimo-v2.5-pro',
    endpoint: 'https://token-plan-cn.xiaomimimo.com/v1',
    chatCompletionsEndpoint:
      'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    apiKey: 'unit-runtime-secret',
    apiKeyRef: 'secret-manager://rehab/unit-mimo-key',
    promptVersion: 'cognitive-assessment-mimo-2026-07',
    requestLimits: { timeoutMs: 15000, maxResponseBytes: 1048576 },
  });
}

function providerJsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AppService production provider operation ledger', () => {
  afterEach(() => {
    restoreEnvironment();
    jest.restoreAllMocks();
  });

  it('records, reserves, dispatches, and finalizes one AI draft before returning it', async () => {
    configureProductionAi();
    const { providerOperations, reserve, service } = createService();
    stubAiRuntimeConfig(service);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      providerJsonResponse({
        id: 'mimo-provider-call-001',
        choices: [
          {
            message: {
              content: JSON.stringify({
                scoreSummary: {
                  mmse: 22,
                  cdr: 1,
                  memory: 48,
                  orientation: 58,
                  executive: 52,
                  language: 73,
                },
                analysisSummary: '建议医生复核认知评估草稿。',
                confidence: 0.84,
              }),
            },
          },
        ],
      }),
    );

    await expect(
      service.createAiAssessmentDraft(doctorUser, {
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        transcript: '患者完成量表，回忆与执行功能表现下降。',
        idempotencyKey: 'assessment-request-000001',
      }),
    ).resolves.toMatchObject({
      patientId: 'patient-profile-id',
      status: 'pending_human_review',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(providerOperations.createOrReadAccepted).toHaveBeenCalledTimes(1);
    const [acceptedInput] =
      providerOperations.createOrReadAccepted.mock.calls[0] ?? [];
    expect(acceptedInput?.identity).toMatchObject({
      organizationId: 'organization-id',
      operation: 'assessment_draft',
      clientIdempotencyKey: 'assessment-request-000001',
    });
    expect(providerOperations.reserve).toHaveBeenCalledWith(
      '67e55044-10b1-426f-9247-bb680e5fe0c8',
    );
    expect(providerOperations.markDispatching).toHaveBeenCalledWith(
      '67e55044-10b1-426f-9247-bb680e5fe0c8',
      expect.any(Date),
    );
    expect(providerOperations.finalizeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operationId: '67e55044-10b1-426f-9247-bb680e5fe0c8',
        status: 'completed',
        providerCallId: 'mimo-provider-call-001',
      }),
    );
  });

  it('marks an AI draft outcome unknown when the completed transaction audit fails without another provider call', async () => {
    configureProductionAi();
    const { prisma, providerOperations, service } = createService();
    stubAiRuntimeConfig(service);
    prisma.auditLog.create.mockRejectedValueOnce(
      new Error('audit transaction write failed'),
    );
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      providerJsonResponse({
        id: 'mimo-provider-call-001',
        choices: [
          {
            message: {
              content: JSON.stringify({
                scoreSummary: {
                  mmse: 22,
                  cdr: 1,
                  memory: 48,
                  orientation: 58,
                  executive: 52,
                  language: 73,
                },
                analysisSummary: '建议医生复核认知评估草稿。',
                confidence: 0.84,
              }),
            },
          },
        ],
      }),
    );

    await expect(
      service.createAiAssessmentDraft(doctorUser, {
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        transcript: '患者完成量表，回忆与执行功能表现下降。',
        idempotencyKey: 'assessment-request-000001',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(providerOperations.finalizeInTransaction).toHaveBeenCalledTimes(1);
    expect(providerOperations.finalize).toHaveBeenCalledTimes(1);
    expect(providerOperations.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: '67e55044-10b1-426f-9247-bb680e5fe0c8',
        status: 'outcome_unknown',
        failureCategory: 'business_effect_or_audit_commit_failed',
      }),
    );
  });

  it('allows a business transaction to finalize a provider operation through that same transaction client', async () => {
    configureProductionAi();
    const { providerOperations, service } = createService();
    const transaction = { providerOperation: {} };
    const appService = service as unknown as {
      finalizeProviderOperationInTransaction: (
        tx: unknown,
        operation: AcceptedProviderOperation,
        input: {
          status: 'completed';
          providerRespondedAt: Date;
          response: unknown;
        },
      ) => Promise<unknown>;
    };

    await appService.finalizeProviderOperationInTransaction(
      transaction,
      acceptedOperation(),
      {
        status: 'completed',
        providerRespondedAt: new Date('2026-07-23T08:02:00.000Z'),
        response: { providerContent: 'approved response' },
      },
    );

    expect(providerOperations.finalizeInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        operationId: '67e55044-10b1-426f-9247-bb680e5fe0c8',
        status: 'completed',
      }),
    );
    expect(providerOperations.finalize).not.toHaveBeenCalled();
  });

  it('rejects a terminal prior operation without reserving or calling MiMo again', async () => {
    configureProductionAi();
    const { providerOperations, reserve, service } =
      createService('outcome_unknown');
    stubAiRuntimeConfig(service);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error('must not dispatch another provider request'),
      );

    await expect(
      service.createAiAssessmentDraft(doctorUser, {
        patientId: 'patient-profile-id',
        transcript: '患者完成量表，回忆与执行功能表现下降。',
        idempotencyKey: 'assessment-request-000001',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(providerOperations.createOrReadAccepted).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(providerOperations.markDispatching).not.toHaveBeenCalled();
    expect(providerOperations.finalize).not.toHaveBeenCalled();
  });

  it('fails closed for a persisted reservation because the shared quota reservation cannot be recovered safely', async () => {
    configureProductionAi();
    const { providerOperations, reserve, service } = createService('reserved');
    stubAiRuntimeConfig(service);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error('must not dispatch after a persisted reservation'),
      );

    await expect(
      service.createAiAssessmentDraft(doctorUser, {
        patientId: 'patient-profile-id',
        transcript: '患者完成量表，回忆与执行功能表现下降。',
        idempotencyKey: 'assessment-request-000001',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(providerOperations.createOrReadAccepted).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(providerOperations.markDispatching).not.toHaveBeenCalled();
  });

  it('rejects an invalid high-cost idempotency key before writing an operation or reserving quota', async () => {
    configureProductionAi();
    const { providerOperations, reserve, service } = createService();
    stubAiRuntimeConfig(service);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('must not dispatch invalid input'));

    await expect(
      service.createAiAssessmentDraft(doctorUser, {
        patientId: 'patient-profile-id',
        transcript: '患者完成量表，回忆与执行功能表现下降。',
        idempotencyKey: 'short',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(providerOperations.createOrReadAccepted).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
