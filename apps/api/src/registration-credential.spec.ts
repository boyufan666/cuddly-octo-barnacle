import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppService } from './app.service';
import type { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';
import { encryptSensitiveJson } from './sensitive-encryption';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};
const requestId = '7a8ca481-3acd-4b4d-b0e4-68205a496654';
const expiredRequestId = '07cba3c2-b357-487f-955d-f5a2988a8c09';

function registrationIdentityEnvelope(id = requestId) {
  return encryptSensitiveJson(
    { displayName: '家属', mobilePhone: null, profileSnapshot: {} },
    {
      tableName: 'registration_request',
      recordId: id,
      fieldName: 'identityEnvelope',
    },
    testSensitiveEncryptionKey,
  );
}

function registrationCreateResult(args: { data: Record<string, unknown> }) {
  return {
    ...args.data,
    reviewEnvelope: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdUserId: null,
    createdPatientId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const adminUser: RequestUser = {
  id: 'admin-id',
  account: 'admin',
  displayName: '管理员',
  roles: [
    {
      roleCode: 'admin_super',
      relatedObjectType: 'admin',
      relatedObjectId: 'admin-id',
    },
  ],
};

function objectContaining<T extends object>(value: T): unknown {
  return expect.objectContaining(value);
}

function anyString(): unknown {
  return expect.any(String) as unknown;
}

function userP2002(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('User P2002', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta,
  });
}

describe('registration credential expiry and atomic review', () => {
  afterEach(() => jest.useRealTimers());

  it('sets credential expiry to exactly 24 hours after request creation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      registrationRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(registrationCreateResult),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await service.createRegistrationRequest({
      requestedRole: 'caregiver',
      account: 'caregiver_new',
      initialPassword: 'Temp-253913!',
      displayName: '家属',
    });

    expect(tx.registrationRequest.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          credentialExpiresAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({ action: 'registration_request.create' }),
    });
  });

  it('expires matching pending credentials at the boundary before allowing resubmission', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      registrationRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: expiredRequestId,
            requestedRole: 'caregiver',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(registrationCreateResult),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.createRegistrationRequest({
        requestedRole: 'caregiver',
        account: 'caregiver_new',
        initialPassword: 'Temp-253913!',
        displayName: '家属',
      }),
    ).resolves.toMatchObject({ account: 'caregiver_new' });

    expect(tx.registrationRequest.findMany).toHaveBeenCalledWith({
      where: {
        reviewStatus: 'pending',
        credentialExpiresAt: { lte: new Date('2026-07-14T00:00:00.000Z') },
        OR: [{ account: 'caregiver_new' }],
      },
      select: { id: true, requestedRole: true },
    });
    expect(tx.registrationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: expiredRequestId,
        reviewStatus: 'pending',
        credentialExpiresAt: { lte: new Date('2026-07-14T00:00:00.000Z') },
      },
      data: objectContaining({
        reviewStatus: 'rejected',
        initialPasswordHash: null,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenNthCalledWith(1, {
      data: objectContaining({
        action: 'registration_request.expire',
        targetId: expiredRequestId,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenNthCalledWith(2, {
      data: objectContaining({
        action: 'registration_request.create',
        targetId: anyString(),
      }),
    });
  });

  it('keeps registration request creation and its audit in one transaction', async () => {
    const auditError = new Error('audit unavailable');
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      registrationRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'pending',
        }),
      },
      auditLog: { create: jest.fn().mockRejectedValue(auditError) },
    };
    const prisma = {
      registrationRequest: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.createRegistrationRequest({
        requestedRole: 'caregiver',
        account: 'caregiver_new',
        initialPassword: 'Temp-253913!',
        displayName: '家属',
      }),
    ).rejects.toBe(auditError);
    expect(tx.registrationRequest.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(prisma.registrationRequest.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('treats the exact expiry instant as expired and clears the digest transactionally', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    const tx = {
      registrationRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      registrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'pending',
          initialPasswordHash: '$argon2id$pending',
          credentialExpiresAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
      },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.reviewRegistrationRequest(adminUser, requestId, {
        decision: 'approved',
        decisionReason: '资料完整',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.registrationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        reviewStatus: 'pending',
        credentialExpiresAt: { lte: new Date('2026-07-14T00:00:00.000Z') },
      },
      data: objectContaining({
        reviewStatus: 'rejected',
        initialPasswordHash: null,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({ action: 'registration_request.expire' }),
    });
  });

  it('claims an unexpired request with CAS before creating identity records', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T23:59:59.999Z'));
    const tx = {
      registrationRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      registrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'pending',
          initialPasswordHash: '$argon2id$pending',
          credentialExpiresAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.reviewRegistrationRequest(adminUser, requestId, {
        decision: 'approved',
        decisionReason: '资料完整',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.registrationRequest.updateMany).toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps successful review audit inside the identity transaction', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T23:59:59.999Z'));
    const transactionAudit = jest
      .fn()
      .mockRejectedValue(new Error('audit unavailable'));
    const outerAudit = jest.fn();
    const tx = {
      registrationRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'approved',
        }),
      },
      user: { create: jest.fn().mockResolvedValue({ id: 'created-user-id' }) },
      userRoleBinding: { create: jest.fn() },
      auditLog: { create: transactionAudit },
    };
    const prisma = {
      registrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'pending',
          initialPasswordHash: '$argon2id$pending',
          credentialExpiresAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: outerAudit },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.reviewRegistrationRequest(adminUser, requestId, {
        decision: 'approved',
        decisionReason: '资料完整',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(transactionAudit).toHaveBeenCalledWith({
      data: objectContaining({ action: 'registration_request.review' }),
    });
    expect(outerAudit).not.toHaveBeenCalled();
  });

  it('maps an exact User mobilePhoneLookup conflict and does not retry approval', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T23:59:59.999Z'));
    const conflict = userP2002({
      modelName: 'User',
      target: ['mobilePhoneLookup'],
    });
    const tx = {
      registrationRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      user: { create: jest.fn().mockRejectedValue(conflict) },
      userRoleBinding: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      registrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'pending',
          initialPasswordHash: '$argon2id$pending',
          credentialExpiresAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.reviewRegistrationRequest(adminUser, requestId, {
        decision: 'approved',
        decisionReason: '资料完整',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.registrationRequest.update).not.toHaveBeenCalled();
    expect(tx.userRoleBinding.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rethrows an unrelated approval P2002 unchanged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T23:59:59.999Z'));
    const conflict = userP2002({
      modelName: 'RegistrationRequest',
      target: ['account'],
    });
    const tx = {
      registrationRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      user: { create: jest.fn().mockRejectedValue(conflict) },
      userRoleBinding: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      registrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          requestedRole: 'caregiver',
          account: 'caregiver_new',
          identityEnvelope: registrationIdentityEnvelope(),
          reviewStatus: 'pending',
          initialPasswordHash: '$argon2id$pending',
          credentialExpiresAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.reviewRegistrationRequest(adminUser, requestId, {
        decision: 'approved',
        decisionReason: '资料完整',
      }),
    ).rejects.toBe(conflict);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
