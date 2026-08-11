import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Prisma,
  type ProviderOperation as PersistedProviderOperation,
} from '@prisma/client';
import {
  decryptSensitiveJson,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';
import {
  ProviderOperationOutcomeUnknownException,
  ProviderOperationService,
  type CreateProviderOperationInput,
} from './provider-operation.service';
import { PrismaService } from './prisma.service';

const sensitiveEncryptionKey: SensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-provider-operation-key',
  key: Buffer.alloc(32, 17),
};

const operationId = '67e55044-10b1-426f-9247-bb680e5fe0c8';

const createInput: CreateProviderOperationInput = {
  identity: {
    organizationId: 'organization-001',
    patientId: 'patient-001',
    actorUserId: 'user-001',
    operation: 'assessment_draft',
    clientIdempotencyKey: 'assessment-request-000001',
  },
  request: { prompt: 'screened input', version: 1 },
  provider: 'xiaomi-mimo',
  modelVersion: 'mimo-v2.5-pro',
  endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
  apiKeyRef: 'secret-manager://rehab/unit-mimo-key',
  promptVersion: 'cognitive-assessment-mimo-2026-07',
  expectedBusinessObject: {
    type: 'clinical_assessment',
    id: 'assessment-001',
    version: '1',
  },
};

type PrismaMock = {
  providerOperation: {
    findFirst: AsyncPrismaMock<
      PersistedProviderOperation | null,
      [Prisma.ProviderOperationFindFirstArgs]
    >;
    create: AsyncPrismaMock<
      PersistedProviderOperation,
      [Prisma.ProviderOperationCreateArgs]
    >;
    updateMany: AsyncPrismaMock<
      Prisma.BatchPayload,
      [Prisma.ProviderOperationUpdateManyArgs]
    >;
    findUnique: AsyncPrismaMock<
      PersistedProviderOperation | null,
      [Prisma.ProviderOperationFindUniqueArgs]
    >;
  };
  providerOperationOutbox: {
    create: AsyncPrismaMock<
      { id: string },
      [Prisma.ProviderOperationOutboxCreateArgs]
    >;
  };
  providerOutcomeCase: {
    create: AsyncPrismaMock<
      { id: string },
      [Prisma.ProviderOutcomeCaseCreateArgs]
    >;
  };
  $transaction: jest.Mock;
};

type AsyncPrismaMock<TResult, TArgs extends unknown[]> = jest.Mock<
  Promise<TResult>,
  TArgs
>;

function getOnlyMockCall<TResult, TArg>(
  mock: jest.Mock<Promise<TResult>, [TArg]>,
): TArg {
  const call = mock.mock.calls[0];
  if (!call) throw new Error('Expected one mock call.');
  return call[0];
}

function providerOperation(
  overrides: Partial<PersistedProviderOperation> = {},
): PersistedProviderOperation {
  const now = new Date('2026-07-22T08:00:00.000Z');
  return {
    id: operationId,
    organizationId: 'organization-001',
    patientId: 'patient-001',
    actorUserId: 'user-001',
    operation: 'assessment_draft',
    clientIdempotencyKey: 'assessment-request-000001',
    canonicalRequestHmac: 'a'.repeat(64),
    requestIntentHmac: 'b'.repeat(64),
    requestCiphertext: {
      v: 1,
      alg: 'AES-256-GCM',
      ciphertext: 'encrypted',
    },
    expectedBusinessObjectType: 'clinical_assessment',
    expectedBusinessObjectId: 'assessment-001',
    expectedBusinessObjectVersion: '1',
    provider: 'xiaomi-mimo',
    modelVersion: 'mimo-v2.5-pro',
    endpointHost: 'token-plan-cn.xiaomimimo.com',
    apiKeyRef: 'secret-manager://rehab/unit-mimo-key',
    promptVersion: 'cognitive-assessment-mimo-2026-07',
    providerCallId: null,
    providerRequestId: null,
    status: 'accepted',
    responseCiphertext: null,
    responseHmac: null,
    failureCategory: null,
    providerStartedAt: null,
    providerRespondedAt: null,
    completedAt: null,
    finalizedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    providerOperation: {
      findFirst: jest
        .fn<
          Promise<PersistedProviderOperation | null>,
          [Prisma.ProviderOperationFindFirstArgs]
        >()
        .mockResolvedValue(null),
      create: jest
        .fn<
          Promise<PersistedProviderOperation>,
          [Prisma.ProviderOperationCreateArgs]
        >()
        .mockResolvedValue(providerOperation()),
      updateMany: jest
        .fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.ProviderOperationUpdateManyArgs]
        >()
        .mockResolvedValue({ count: 1 }),
      findUnique: jest
        .fn<
          Promise<PersistedProviderOperation | null>,
          [Prisma.ProviderOperationFindUniqueArgs]
        >()
        .mockResolvedValue(providerOperation()),
    },
    providerOperationOutbox: {
      create: jest
        .fn<
          Promise<{ id: string }>,
          [Prisma.ProviderOperationOutboxCreateArgs]
        >()
        .mockResolvedValue({ id: 'outbox-001' }),
    },
    providerOutcomeCase: {
      create: jest
        .fn<Promise<{ id: string }>, [Prisma.ProviderOutcomeCaseCreateArgs]>()
        .mockResolvedValue({ id: 'case-001' }),
    },
    $transaction: jest.fn<
      Promise<unknown>,
      [
        (
          callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        ) => Promise<unknown>,
      ]
    >(),
  };
  prisma.$transaction.mockImplementation(
    async (
      callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(prisma as unknown as Prisma.TransactionClient),
  );
  return prisma;
}

describe('ProviderOperationService', () => {
  it('creates one accepted operation with an encrypted request and accepted outbox event', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    const accepted = await service.createOrReadAccepted(createInput);

    expect(accepted.wasCreated).toBe(true);
    const createCall = getOnlyMockCall(prisma.providerOperation.create);
    expect(createCall.data).toMatchObject({
      organizationId: 'organization-001',
      patientId: 'patient-001',
      actorUserId: 'user-001',
      operation: 'assessment_draft',
      clientIdempotencyKey: 'assessment-request-000001',
      endpointHost: 'token-plan-cn.xiaomimimo.com',
      outboxEvents: {
        create: { eventType: 'provider_operation_accepted' },
      },
    });
    expect(JSON.stringify(createCall.data)).not.toContain('screened input');
    const recordId = createCall.data.id;
    expect(recordId).toEqual(expect.any(String));
    if (!recordId) {
      throw new Error(
        'Provider operation test fixture must provide a record id.',
      );
    }
    expect(
      decryptSensitiveJson(
        createCall.data.requestCiphertext,
        {
          tableName: 'provider_operation',
          recordId,
          fieldName: 'requestCiphertext',
        },
        sensitiveEncryptionKey,
      ),
    ).toEqual(createInput.request);
  });

  it('returns a matching idempotency record without creating or dispatching another operation', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    await service.createOrReadAccepted(createInput);
    const initialCreate = getOnlyMockCall(prisma.providerOperation.create);
    prisma.providerOperation.findFirst.mockResolvedValueOnce(
      providerOperation({
        canonicalRequestHmac: initialCreate.data.canonicalRequestHmac,
        status: 'completed',
      }),
    );

    const accepted = await service.createOrReadAccepted(createInput);

    expect(accepted).toMatchObject({ wasCreated: false, status: 'completed' });
    expect(prisma.providerOperation.create).toHaveBeenCalledTimes(1);
    expect(prisma.providerOperation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a reused idempotency key when the request HMAC differs', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.findFirst.mockResolvedValue(
      providerOperation({ canonicalRequestHmac: 'b'.repeat(64) }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await expect(
      service.createOrReadAccepted(createInput),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).not.toHaveBeenCalled();
  });

  it('rejects a matching request when the idempotency key is bound to a different provider configuration', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    await service.createOrReadAccepted(createInput);
    const initialCreate = getOnlyMockCall(prisma.providerOperation.create);
    prisma.providerOperation.findFirst.mockResolvedValueOnce(
      providerOperation({
        canonicalRequestHmac: initialCreate.data.canonicalRequestHmac,
        modelVersion: 'mimo-v2.5-different',
      }),
    );

    await expect(
      service.createOrReadAccepted(createInput),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a new idempotency key for an active matching request intent before creating another operation', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    const first = await service.createOrReadAccepted(createInput);
    const createCall = getOnlyMockCall(prisma.providerOperation.create);
    const requestIntentHmac = createCall.data.requestIntentHmac;
    prisma.providerOperation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        providerOperation({
          id: first.id,
          requestIntentHmac,
          status: 'outcome_unknown',
        }),
      );

    await expect(
      service.createOrReadAccepted({
        ...createInput,
        identity: {
          ...createInput.identity,
          actorUserId: 'another-doctor-id',
          clientIdempotencyKey: 'assessment-request-000002',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed for a legacy active operation without an intent HMAC', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    prisma.providerOperation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        providerOperation({
          requestIntentHmac: null,
          status: 'dispatching',
        }),
      );

    await expect(
      service.createOrReadAccepted({
        ...createInput,
        identity: {
          ...createInput.identity,
          clientIdempotencyKey: 'assessment-request-000003',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).not.toHaveBeenCalled();
  });

  it('rejects a new idempotency key for a completed matching intent until an approved replay policy exists', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    await service.createOrReadAccepted(createInput);
    const createCall = getOnlyMockCall(prisma.providerOperation.create);
    prisma.providerOperation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        providerOperation({
          requestIntentHmac: createCall.data.requestIntentHmac,
          status: 'completed',
        }),
      );

    await expect(
      service.createOrReadAccepted({
        ...createInput,
        identity: {
          ...createInput.identity,
          clientIdempotencyKey: 'assessment-request-000004',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).toHaveBeenCalledTimes(1);
  });

  it('reads the winning request after a unique-key race and still compares HMAC', async () => {
    const prisma = createPrismaMock();
    const winner = providerOperation({ canonicalRequestHmac: 'a'.repeat(64) });
    prisma.providerOperation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    prisma.providerOperation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await expect(
      service.createOrReadAccepted(createInput),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).toHaveBeenCalledTimes(1);
    expect(prisma.providerOperation.findFirst).toHaveBeenCalledTimes(3);
  });

  it('fails closed when a concurrent different key wins the active intent index', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    prisma.providerOperation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        providerOperation({
          clientIdempotencyKey: 'assessment-request-000002',
          requestIntentHmac: 'a'.repeat(64),
          status: 'dispatching',
        }),
      );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await expect(
      service.createOrReadAccepted(createInput),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperation.create).toHaveBeenCalledTimes(1);
    expect(prisma.providerOperation.findFirst).toHaveBeenCalledTimes(4);
  });

  it('allows only the next persisted state and emits dispatching outbox evidence', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.findUnique.mockResolvedValue(
      providerOperation({ status: 'dispatching' }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    const startedAt = new Date('2026-07-22T08:01:00.000Z');

    const result = await service.markDispatching(operationId, startedAt);

    expect(result.status).toBe('dispatching');
    expect(prisma.providerOperation.updateMany).toHaveBeenCalledWith({
      where: { id: operationId, status: 'reserved' },
      data: { status: 'dispatching', providerStartedAt: startedAt },
    });
    expect(prisma.providerOperationOutbox.create).toHaveBeenCalledWith({
      data: {
        providerOperationId: operationId,
        eventType: 'provider_operation_dispatching',
      },
    });
  });

  it('fails closed when a conditional state update has already changed', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.updateMany.mockResolvedValue({ count: 0 });
    prisma.providerOperation.findUnique.mockResolvedValue(
      providerOperation({ status: 'completed' }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await expect(
      service.markDispatching(
        operationId,
        new Date('2026-07-22T08:01:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.providerOperationOutbox.create).not.toHaveBeenCalled();
  });

  it('finalizes a completed operation with encrypted response evidence and no raw response in the outbox', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.findUnique.mockResolvedValue(
      providerOperation({
        status: 'completed',
        providerCallId: 'provider-call-001',
        responseCiphertext: {
          v: 1,
          alg: 'AES-256-GCM',
          ciphertext: 'encrypted',
        },
      }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );
    const response = { summary: 'clinical response' };
    const respondedAt = new Date('2026-07-22T08:02:00.000Z');

    const result = await service.finalize({
      operationId,
      status: 'completed',
      providerRespondedAt: respondedAt,
      providerCallId: 'provider-call-001',
      response,
    });

    expect(result.status).toBe('completed');
    const updateCall = getOnlyMockCall(prisma.providerOperation.updateMany);
    expect(updateCall.where).toEqual({
      id: operationId,
      status: 'dispatching',
    });
    expect(JSON.stringify(updateCall.data)).not.toContain('clinical response');
    expect(updateCall.data.responseHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(
      decryptSensitiveJson(
        updateCall.data.responseCiphertext,
        {
          tableName: 'provider_operation',
          recordId: operationId,
          fieldName: 'responseCiphertext',
        },
        sensitiveEncryptionKey,
      ),
    ).toEqual(response);
    expect(prisma.providerOperationOutbox.create).toHaveBeenCalledWith({
      data: {
        providerOperationId: operationId,
        eventType: 'provider_operation_finalized',
      },
    });
  });

  it('can finalize through a caller transaction without opening a nested transaction', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.findUnique.mockResolvedValue(
      providerOperation({ status: 'completed' }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    const result = await service.finalizeInTransaction(prisma as never, {
      operationId,
      status: 'completed',
      providerRespondedAt: new Date('2026-07-23T08:02:00.000Z'),
      response: { summary: 'clinical response' },
    });

    expect(result.status).toBe('completed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const updateArgs = getOnlyMockCall(prisma.providerOperation.updateMany);
    expect(updateArgs.where).toEqual({
      id: operationId,
      status: 'dispatching',
    });
    expect(updateArgs.data).toMatchObject({ status: 'completed' });
  });

  it('opens one explicit case and outbox event for an unknown provider outcome', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.findUnique.mockResolvedValue(
      providerOperation({
        status: 'outcome_unknown',
        failureCategory: 'audit_write_failed',
      }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await service.finalize({
      operationId,
      status: 'outcome_unknown',
      providerRespondedAt: new Date('2026-07-22T08:03:00.000Z'),
      failureCategory: 'audit_write_failed',
    });

    expect(prisma.providerOutcomeCase.create).toHaveBeenCalledWith({
      data: {
        providerOperationId: operationId,
        caseType: 'provider_outcome_unknown',
        evidenceReferences: [],
      },
    });
    expect(prisma.providerOperationOutbox.create).toHaveBeenCalledWith({
      data: {
        providerOperationId: operationId,
        eventType: 'provider_operation_finalized',
      },
    });
    expect(prisma.providerOperationOutbox.create).toHaveBeenCalledWith({
      data: {
        providerOperationId: operationId,
        eventType: 'provider_outcome_unknown',
      },
    });
  });

  it('records an unknown-outcome case instead of leaving a dispatched operation when response evidence cannot be encrypted', async () => {
    const prisma = createPrismaMock();
    prisma.providerOperation.findUnique.mockResolvedValue(
      providerOperation({
        status: 'outcome_unknown',
        failureCategory: 'response_evidence_persistence_failed',
      }),
    );
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await expect(
      service.finalize({
        operationId,
        status: 'completed',
        providerRespondedAt: new Date('2026-07-22T08:03:00.000Z'),
        providerCallId: 'provider-call-001',
        response: { providerContent: 'x'.repeat(1_048_577) },
      }),
    ).rejects.toBeInstanceOf(ProviderOperationOutcomeUnknownException);

    const updateCall = getOnlyMockCall(prisma.providerOperation.updateMany);
    expect(updateCall.data).toMatchObject({
      status: 'outcome_unknown',
      failureCategory: 'response_evidence_persistence_failed',
    });
    expect(updateCall.data.responseCiphertext).toBeUndefined();
    expect(JSON.stringify(updateCall.data)).not.toContain('providerContent');
    expect(prisma.providerOutcomeCase.create).toHaveBeenCalledWith({
      data: {
        providerOperationId: operationId,
        caseType: 'provider_outcome_unknown',
        evidenceReferences: [],
      },
    });
  });

  it('requires an encrypted response for completion and a failure category for unknown results', async () => {
    const prisma = createPrismaMock();
    const service = new ProviderOperationService(
      prisma as unknown as PrismaService,
      sensitiveEncryptionKey,
    );

    await expect(
      service.finalize({
        operationId,
        status: 'completed',
        providerRespondedAt: new Date('2026-07-22T08:03:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.finalize({
        operationId,
        status: 'outcome_unknown',
        providerRespondedAt: new Date('2026-07-22T08:03:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.providerOperation.updateMany).not.toHaveBeenCalled();
  });
});
