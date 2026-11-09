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
import { encryptSensitiveJson } from './sensitive-encryption';

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
  operation: AcceptedProviderOperation['operation'] = 'assessment_draft',
): AcceptedProviderOperation {
  const now = new Date('2026-07-22T12:00:00.000Z');
  return {
    id: '67e55044-10b1-426f-9247-bb680e5fe0c8',
    organizationId: 'organization-id',
    patientId: 'patient-profile-id',
    actorUserId: doctorUser.id,
    operation,
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
    aiConversationSession: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    aiConversationMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
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
        physicalConditions: ['no_known_limitations'],
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

  it('serializes conversation message timestamps before persisting provider evidence', async () => {
    configureProductionAi();
    const { prisma, providerOperations, service } = createService();
    stubAiRuntimeConfig(service);

    const sessionId = '03cf5f98-e250-4e42-87dd-27c40c5433a1';
    const userMessageCreatedAt = new Date('2026-07-23T09:01:00.000Z');
    const assistantMessageCreatedAt = new Date('2026-07-23T09:02:00.000Z');
    prisma.aiConversationSession.findUnique.mockResolvedValue({
      id: sessionId,
      patientId: 'patient-profile-id',
      assessmentType: 'MMSE/CDR',
      status: 'active',
      metadata: {
        turnCount: 0,
        assessmentContext: { physicalConditions: ['no_known_limitations'] },
      },
    });
    prisma.aiConversationMessage.findMany.mockResolvedValue([]);
    prisma.aiConversationSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiConversationMessage.create
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: userMessageCreatedAt }),
      )
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: assistantMessageCreatedAt }),
      );
    providerOperations.createOrReadAccepted.mockResolvedValueOnce(
      acceptedOperation('accepted', 'conversation_turn'),
    );
    providerOperations.reserve.mockResolvedValueOnce(
      acceptedOperation('reserved', 'conversation_turn'),
    );
    providerOperations.markDispatching.mockResolvedValueOnce(
      acceptedOperation('dispatching', 'conversation_turn'),
    );
    providerOperations.finalizeInTransaction.mockImplementationOnce(
      (_tx: unknown, input: { operationId: string; response?: unknown }) => {
        expect(input.response).toBeDefined();
        expect(() =>
          encryptSensitiveJson(
            input.response,
            {
              tableName: 'provider_operation',
              recordId: input.operationId,
              fieldName: 'responseCiphertext',
            },
            sensitiveEncryptionKey,
          ),
        ).not.toThrow();

        const result = (
          input.response as {
            result: {
              userMessage: { createdAt: string };
              assistantMessage: { createdAt: string };
            };
          }
        ).result;
        expect(result.userMessage.createdAt).toBe(
          userMessageCreatedAt.toISOString(),
        );
        expect(result.assistantMessage.createdAt).toBe(
          assistantMessageCreatedAt.toISOString(),
        );
        return acceptedOperation('completed', 'conversation_turn');
      },
    );
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      providerJsonResponse({
        id: 'mimo-conversation-call-001',
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '请继续描述最近一周的睡眠、用药和日常活动情况。',
                evidence: { focus: ['memory'] },
              }),
            },
          },
        ],
      }),
    );

    await expect(
      service.appendAiConversationMessage(doctorUser, sessionId, {
        content: '最近经常忘记日期。',
        idempotencyKey: 'conversation-request-000001',
      }),
    ).resolves.toMatchObject({
      sessionId,
      userMessage: { createdAt: userMessageCreatedAt },
      assistantMessage: { createdAt: assistantMessageCreatedAt },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(providerOperations.finalizeInTransaction).toHaveBeenCalledTimes(1);
  });

  it('records the provider operation ledger in the local customer runtime', async () => {
    configureProductionAi();
    process.env.NODE_ENV = 'development';
    const { providerOperations, reserve, service } = createService();
    stubAiRuntimeConfig(service);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      providerJsonResponse({
        id: 'mimo-local-provider-call-001',
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
                analysisSummary: '建议医生复核本地 AI 评估草稿。',
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
        physicalConditions: ['no_known_limitations'],
        transcript: '患者完成本地演示评估，回忆与执行功能表现下降。',
        idempotencyKey: 'local-assessment-request-000001',
      }),
    ).resolves.toMatchObject({
      patientId: 'patient-profile-id',
      status: 'pending_human_review',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
    expect(providerOperations.createOrReadAccepted).toHaveBeenCalledTimes(1);
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
        providerCallId: 'mimo-local-provider-call-001',
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
        physicalConditions: ['no_known_limitations'],
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
        assessmentType: 'MMSE/CDR',
        physicalConditions: ['no_known_limitations'],
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
        assessmentType: 'MMSE/CDR',
        physicalConditions: ['no_known_limitations'],
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
        assessmentType: 'MMSE/CDR',
        physicalConditions: ['no_known_limitations'],
        transcript: '患者完成量表，回忆与执行功能表现下降。',
        idempotencyKey: 'short',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(providerOperations.createOrReadAccepted).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
