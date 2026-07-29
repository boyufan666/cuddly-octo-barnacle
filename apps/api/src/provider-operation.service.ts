import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  type ProviderOperation as PersistedProviderOperation,
} from '@prisma/client';
import { hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';
import { SENSITIVE_ENCRYPTION_KEY } from './config';
import {
  assertProviderOperationStatusTransition,
  createProviderOperationResponseHmac,
  createProviderOperationRequestIntentHmac,
  createProviderOperationRequestHmac,
  isProviderOperationKind,
  isProviderOperationStatus,
  type ProviderOperationIdentity,
  type ProviderOperationKind,
  type ProviderOperationStatus,
} from './provider-operation';
import { PrismaService } from './prisma.service';
import {
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';

const PROVIDER_OPERATION_TABLE = 'provider_operation';
const PROVIDER_OPERATION_HMAC_SALT = Buffer.from(
  'rehab-provider-operation-hmac-v1',
  'utf8',
);
const PROVIDER_OPERATION_HMAC_INFO = Buffer.from(
  'canonical-request-hmac',
  'utf8',
);
const PROVIDER_OPERATION_INTENT_HMAC_INFO = Buffer.from(
  'canonical-request-intent-hmac',
  'utf8',
);
const PROVIDER_OPERATION_RESPONSE_HMAC_INFO = Buffer.from(
  'canonical-response-hmac',
  'utf8',
);

const providerOperationOutboxEvents = {
  accepted: 'provider_operation_accepted',
  dispatching: 'provider_operation_dispatching',
  finalized: 'provider_operation_finalized',
  outcomeUnknown: 'provider_outcome_unknown',
} as const;

const finalProviderOperationStatuses = [
  'completed',
  'provider_failed',
  'response_rejected',
  'outcome_unknown',
] as const;
const activeProviderOperationIntentStatuses = [
  'accepted',
  'reserved',
  'dispatching',
  'outcome_unknown',
] as const;

type FinalProviderOperationStatus =
  (typeof finalProviderOperationStatuses)[number];

export class ProviderOperationOutcomeUnknownException extends ServiceUnavailableException {
  constructor() {
    super('供应商已响应，但结果证据无法安全保存，等待人工核对后才能继续。');
  }
}

class ProviderOperationResponseEvidencePersistenceError extends Error {
  constructor() {
    super('Provider operation response evidence could not be persisted.');
    this.name = 'ProviderOperationResponseEvidencePersistenceError';
  }
}

export type CreateProviderOperationInput = {
  identity: ProviderOperationIdentity;
  request: unknown;
  provider: string;
  modelVersion: string;
  endpoint: string;
  apiKeyRef: string;
  promptVersion?: string;
  expectedBusinessObject?: {
    type: string;
    id: string;
    version: string;
  };
};

export type FinalizeProviderOperationInput = {
  operationId: string;
  status: FinalProviderOperationStatus;
  providerRespondedAt: Date;
  providerCallId?: string;
  providerRequestId?: string;
  response?: unknown;
  failureCategory?: string;
};

export type ProviderOperationSnapshot = {
  id: string;
  organizationId: string | null;
  patientId: string | null;
  actorUserId: string | null;
  operation: ProviderOperationKind;
  clientIdempotencyKey: string;
  status: ProviderOperationStatus;
  provider: string;
  modelVersion: string;
  endpointHost: string;
  apiKeyRef: string;
  promptVersion: string | null;
  providerCallId: string | null;
  providerRequestId: string | null;
  failureCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AcceptedProviderOperation = ProviderOperationSnapshot & {
  wasCreated: boolean;
};

/**
 * Persists the lifecycle of a single external provider request. It never
 * dispatches a provider request and deliberately has no retry path.
 */
@Injectable()
export class ProviderOperationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SENSITIVE_ENCRYPTION_KEY)
    private readonly sensitiveEncryptionKey: SensitiveEncryptionKey,
  ) {}

  async createOrReadAccepted(
    input: CreateProviderOperationInput,
  ): Promise<AcceptedProviderOperation> {
    const endpointHost = parseHttpsEndpointHost(input.endpoint);
    assertProviderMetadata(input);
    const hmacKey = deriveProviderOperationHmacKey(
      this.sensitiveEncryptionKey,
      PROVIDER_OPERATION_HMAC_INFO,
    );
    const canonicalRequestHmac = createProviderOperationRequestHmac(
      input.identity,
      input.request,
      hmacKey,
    );
    const requestIntentHmac = createProviderOperationRequestIntentHmac(
      input.identity,
      input.request,
      deriveProviderOperationHmacKey(
        this.sensitiveEncryptionKey,
        PROVIDER_OPERATION_INTENT_HMAC_INFO,
      ),
      input.expectedBusinessObject,
    );
    const existing = await this.findByIdentity(input.identity);
    if (existing) {
      assertSameRequest(existing, canonicalRequestHmac);
      assertSameOperationSemantics(existing, input, endpointHost);
      return { ...toSnapshot(existing), wasCreated: false };
    }
    await this.rejectExistingIntentConflict(input.identity, requestIntentHmac);

    const operationId = randomUUID();
    const requestCiphertext = encryptSensitiveJson(
      input.request,
      providerOperationAad(operationId, 'requestCiphertext'),
      this.sensitiveEncryptionKey,
    );

    try {
      const created = await this.prisma.providerOperation.create({
        data: {
          id: operationId,
          organizationId: input.identity.organizationId,
          patientId: input.identity.patientId,
          actorUserId: input.identity.actorUserId,
          operation: input.identity.operation,
          clientIdempotencyKey: input.identity.clientIdempotencyKey,
          canonicalRequestHmac,
          requestIntentHmac,
          requestCiphertext,
          expectedBusinessObjectType: input.expectedBusinessObject?.type,
          expectedBusinessObjectId: input.expectedBusinessObject?.id,
          expectedBusinessObjectVersion: input.expectedBusinessObject?.version,
          provider: input.provider,
          modelVersion: input.modelVersion,
          endpointHost,
          apiKeyRef: input.apiKeyRef,
          promptVersion: input.promptVersion,
          outboxEvents: {
            create: { eventType: providerOperationOutboxEvents.accepted },
          },
        },
      });
      return { ...toSnapshot(created), wasCreated: true };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;

      const raced = await this.findByIdentity(input.identity);
      if (raced) {
        assertSameRequest(raced, canonicalRequestHmac);
        assertSameOperationSemantics(raced, input, endpointHost);
        return { ...toSnapshot(raced), wasCreated: false };
      }
      await this.rejectExistingIntentConflict(
        input.identity,
        requestIntentHmac,
      );
      throw error;
    }
  }

  async reserve(operationId: string): Promise<ProviderOperationSnapshot> {
    return this.transition(operationId, 'accepted', 'reserved');
  }

  async markDispatching(
    operationId: string,
    providerStartedAt: Date,
  ): Promise<ProviderOperationSnapshot> {
    assertValidDate(providerStartedAt, 'providerStartedAt');
    return this.transition(
      operationId,
      'reserved',
      'dispatching',
      { providerStartedAt },
      providerOperationOutboxEvents.dispatching,
    );
  }

  async finalize(
    input: FinalizeProviderOperationInput,
  ): Promise<ProviderOperationSnapshot> {
    try {
      return await this.prisma.$transaction((tx) =>
        this.finalizeInTransaction(tx, input),
      );
    } catch (error) {
      if (
        !(error instanceof ProviderOperationResponseEvidencePersistenceError)
      ) {
        throw error;
      }
      await this.finalize({
        operationId: input.operationId,
        status: 'outcome_unknown',
        providerRespondedAt: input.providerRespondedAt,
        ...(input.providerCallId
          ? { providerCallId: input.providerCallId }
          : {}),
        ...(input.providerRequestId
          ? { providerRequestId: input.providerRequestId }
          : {}),
        failureCategory: 'response_evidence_persistence_failed',
      });
      throw new ProviderOperationOutcomeUnknownException();
    }
  }

  /**
   * Finalizes an operation through the caller's transaction. This is used only
   * where the provider result creates a business effect that must commit or
   * roll back together with its operation ledger state.
   */
  async finalizeInTransaction(
    tx: Prisma.TransactionClient,
    input: FinalizeProviderOperationInput,
  ): Promise<ProviderOperationSnapshot> {
    assertCanonicalUuid(input.operationId, 'operationId');
    assertFinalStatus(input.status);
    assertValidDate(input.providerRespondedAt, 'providerRespondedAt');
    assertFinalizationShape(input);

    let responseCiphertext: Prisma.InputJsonValue | undefined;
    let responseHmac: string | undefined;
    if (input.response !== undefined) {
      try {
        responseCiphertext = encryptSensitiveJson(
          input.response,
          providerOperationAad(input.operationId, 'responseCiphertext'),
          this.sensitiveEncryptionKey,
        );
        responseHmac = createProviderOperationResponseHmac(
          input.operationId,
          input.response,
          deriveProviderOperationHmacKey(
            this.sensitiveEncryptionKey,
            PROVIDER_OPERATION_RESPONSE_HMAC_INFO,
          ),
        );
      } catch {
        throw new ProviderOperationResponseEvidencePersistenceError();
      }
    }
    const finalizedAt = new Date();

    const updated = await tx.providerOperation.updateMany({
      where: { id: input.operationId, status: 'dispatching' },
      data: {
        status: input.status,
        providerCallId: input.providerCallId,
        providerRequestId: input.providerRequestId,
        responseCiphertext,
        responseHmac,
        failureCategory: input.failureCategory,
        providerRespondedAt: input.providerRespondedAt,
        completedAt: input.providerRespondedAt,
        finalizedAt,
      },
    });
    if (updated.count !== 1) {
      return this.throwTransitionConflict(
        tx,
        input.operationId,
        'dispatching',
        input.status,
      );
    }

    await tx.providerOperationOutbox.create({
      data: {
        providerOperationId: input.operationId,
        eventType: providerOperationOutboxEvents.finalized,
      },
    });
    if (input.status === 'outcome_unknown') {
      await tx.providerOutcomeCase.create({
        data: {
          providerOperationId: input.operationId,
          caseType: 'provider_outcome_unknown',
          evidenceReferences: [],
        },
      });
      await tx.providerOperationOutbox.create({
        data: {
          providerOperationId: input.operationId,
          eventType: providerOperationOutboxEvents.outcomeUnknown,
        },
      });
    }

    const operation = await tx.providerOperation.findUnique({
      where: { id: input.operationId },
    });
    if (!operation) {
      throw new NotFoundException('未找到提供方操作记录。');
    }
    return toSnapshot(operation);
  }

  private async transition(
    operationId: string,
    from: ProviderOperationStatus,
    to: ProviderOperationStatus,
    data: Prisma.ProviderOperationUpdateManyMutationInput = {},
    outboxEvent?: string,
  ): Promise<ProviderOperationSnapshot> {
    assertCanonicalUuid(operationId, 'operationId');
    assertProviderOperationStatusTransition(from, to);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerOperation.updateMany({
        where: { id: operationId, status: from },
        data: { ...data, status: to },
      });
      if (updated.count !== 1) {
        return this.throwTransitionConflict(tx, operationId, from, to);
      }
      if (outboxEvent) {
        await tx.providerOperationOutbox.create({
          data: { providerOperationId: operationId, eventType: outboxEvent },
        });
      }

      const operation = await tx.providerOperation.findUnique({
        where: { id: operationId },
      });
      if (!operation) {
        throw new NotFoundException('未找到提供方操作记录。');
      }
      return toSnapshot(operation);
    });
  }

  private async throwTransitionConflict(
    tx: Prisma.TransactionClient,
    operationId: string,
    from: ProviderOperationStatus,
    to: ProviderOperationStatus,
  ): Promise<never> {
    const operation = await tx.providerOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) {
      throw new NotFoundException('未找到提供方操作记录。');
    }
    throw new ConflictException(
      `提供方操作当前状态为 ${operation.status}，不能从 ${from} 迁移至 ${to}。`,
    );
  }

  private findByIdentity(identity: ProviderOperationIdentity) {
    return this.prisma.providerOperation.findFirst({
      where: {
        organizationId: identity.organizationId,
        patientId: identity.patientId,
        actorUserId: identity.actorUserId,
        operation: identity.operation,
        clientIdempotencyKey: identity.clientIdempotencyKey,
      },
    });
  }

  private async rejectExistingIntentConflict(
    identity: ProviderOperationIdentity,
    requestIntentHmac: string,
  ): Promise<void> {
    const existing = await this.prisma.providerOperation.findFirst({
      where: {
        organizationId: identity.organizationId,
        patientId: identity.patientId,
        operation: identity.operation,
        OR: [
          { requestIntentHmac },
          {
            requestIntentHmac: null,
            status: { in: [...activeProviderOperationIntentStatuses] },
          },
        ],
      },
    });
    if (existing) {
      throw new ConflictException(
        '相同高成本调用意图已记录，不能以新幂等键再次外呼。',
      );
    }
  }
}

function providerOperationAad(
  operationId: string,
  fieldName: 'requestCiphertext' | 'responseCiphertext',
) {
  return {
    tableName: PROVIDER_OPERATION_TABLE,
    recordId: operationId,
    fieldName,
  };
}

function deriveProviderOperationHmacKey(
  sensitiveEncryptionKey: SensitiveEncryptionKey,
  info: Buffer,
): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      sensitiveEncryptionKey.key,
      PROVIDER_OPERATION_HMAC_SALT,
      info,
      32,
    ),
  );
}

function parseHttpsEndpointHost(endpoint: string): string {
  assertExactIdentifier(endpoint, 'endpoint');
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('提供方 endpoint 必须是有效 HTTPS URL。');
  }
  if (url.protocol !== 'https:' || !url.host || url.username || url.password) {
    throw new BadRequestException('提供方 endpoint 必须是无凭据的 HTTPS URL。');
  }
  return url.host;
}

function assertProviderMetadata(input: CreateProviderOperationInput): void {
  assertExactIdentifier(input.provider, 'provider');
  assertExactIdentifier(input.modelVersion, 'modelVersion');
  assertExactIdentifier(input.apiKeyRef, 'apiKeyRef');
  if (input.promptVersion !== undefined) {
    assertExactIdentifier(input.promptVersion, 'promptVersion');
  }
  if (input.expectedBusinessObject !== undefined) {
    assertExactIdentifier(
      input.expectedBusinessObject.type,
      'expectedBusinessObject.type',
    );
    assertExactIdentifier(
      input.expectedBusinessObject.id,
      'expectedBusinessObject.id',
    );
    assertExactIdentifier(
      input.expectedBusinessObject.version,
      'expectedBusinessObject.version',
    );
  }
}

function assertFinalizationShape(input: FinalizeProviderOperationInput): void {
  if (input.providerCallId !== undefined) {
    assertExactIdentifier(input.providerCallId, 'providerCallId');
  }
  if (input.providerRequestId !== undefined) {
    assertExactIdentifier(input.providerRequestId, 'providerRequestId');
  }
  if (input.status === 'completed') {
    if (input.response === undefined) {
      throw new BadRequestException('完成的提供方操作必须包含加密响应。');
    }
    if (input.failureCategory !== undefined) {
      throw new BadRequestException('完成的提供方操作不能包含失败分类。');
    }
    return;
  }
  if (input.failureCategory === undefined) {
    throw new BadRequestException('失败或未知结果必须包含失败分类。');
  }
  assertExactIdentifier(input.failureCategory, 'failureCategory');
}

function assertFinalStatus(
  status: FinalProviderOperationStatus,
): asserts status is FinalProviderOperationStatus {
  if (!(finalProviderOperationStatuses as readonly string[]).includes(status)) {
    throw new BadRequestException('提供方操作终态无效。');
  }
}

function assertExactIdentifier(value: unknown, field: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value
  ) {
    throw new BadRequestException(`${field} 必须是精确的非空字符串。`);
  }
}

function assertCanonicalUuid(value: unknown, field: string): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(`${field} 必须是规范 UUID。`);
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new BadRequestException(`${field} 必须是有效时间。`);
  }
}

function assertSameRequest(
  operation: PersistedProviderOperation,
  canonicalRequestHmac: string,
): void {
  const persisted = Buffer.from(operation.canonicalRequestHmac, 'utf8');
  const incoming = Buffer.from(canonicalRequestHmac, 'utf8');
  if (
    persisted.byteLength !== incoming.byteLength ||
    !timingSafeEqual(persisted, incoming)
  ) {
    throw new ConflictException('幂等键已用于不同的提供方请求。');
  }
}

/**
 * The request HMAC intentionally covers only the request and operation
 * identity. The provider configuration and target business object are stored
 * separately, so a reused key cannot silently dispatch under changed intent.
 */
function assertSameOperationSemantics(
  operation: PersistedProviderOperation,
  input: CreateProviderOperationInput,
  endpointHost: string,
): void {
  const expected = input.expectedBusinessObject;
  if (
    operation.provider !== input.provider ||
    operation.modelVersion !== input.modelVersion ||
    operation.endpointHost !== endpointHost ||
    operation.apiKeyRef !== input.apiKeyRef ||
    operation.promptVersion !== (input.promptVersion ?? null) ||
    operation.expectedBusinessObjectType !== (expected?.type ?? null) ||
    operation.expectedBusinessObjectId !== (expected?.id ?? null) ||
    operation.expectedBusinessObjectVersion !== (expected?.version ?? null)
  ) {
    throw new ConflictException('幂等键已绑定到不同的提供方配置或业务对象。');
  }
}

function toSnapshot(
  operation: PersistedProviderOperation,
): ProviderOperationSnapshot {
  if (!isProviderOperationStatus(operation.status)) {
    throw new ConflictException('提供方操作记录包含未识别的状态。');
  }
  if (!isProviderOperationKind(operation.operation)) {
    throw new ConflictException('提供方操作记录包含未识别的操作类型。');
  }
  return {
    id: operation.id,
    organizationId: operation.organizationId,
    patientId: operation.patientId,
    actorUserId: operation.actorUserId,
    operation: operation.operation,
    clientIdempotencyKey: operation.clientIdempotencyKey,
    status: operation.status,
    provider: operation.provider,
    modelVersion: operation.modelVersion,
    endpointHost: operation.endpointHost,
    apiKeyRef: operation.apiKeyRef,
    promptVersion: operation.promptVersion,
    providerCallId: operation.providerCallId,
    providerRequestId: operation.providerRequestId,
    failureCategory: operation.failureCategory,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
