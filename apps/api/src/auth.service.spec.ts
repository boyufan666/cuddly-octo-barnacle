import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as credentialSecurity from './credential-security';
import type { RequestUser } from './current-user';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import {
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';

const testSensitiveEncryptionKey: SensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

function encryptedUserIdentity(recordId: string, displayName: string) {
  return encryptSensitiveJson(
    { displayName, mobilePhone: null },
    { tableName: 'user', recordId, fieldName: 'identityEnvelope' },
    testSensitiveEncryptionKey,
  );
}

const superAdmin: RequestUser = {
  id: 'admin-id',
  account: 'admin',
  displayName: '超级管理员',
  roles: [
    {
      roleCode: 'admin_super',
      relatedObjectType: 'admin',
      relatedObjectId: 'admin-id',
    },
  ],
};

const auditor: RequestUser = {
  ...superAdmin,
  id: 'auditor-id',
  roles: [
    {
      roleCode: 'admin_auditor',
      relatedObjectType: 'admin',
      relatedObjectId: 'auditor-id',
    },
  ],
};

const operatorAdmin: RequestUser = {
  ...superAdmin,
  id: 'operator-id',
  account: 'operator001',
  roles: [
    {
      roleCode: 'admin_operator',
      relatedObjectType: 'admin',
      relatedObjectId: 'operator-id',
    },
  ],
};

const standardAdmin: RequestUser = {
  ...superAdmin,
  id: 'standard-admin-id',
  account: 'standard-admin',
  roles: [
    {
      roleCode: 'admin',
      relatedObjectType: 'admin',
      relatedObjectId: 'standard-admin-id',
    },
  ],
};

function objectContaining<T extends object>(value: T): unknown {
  return expect.objectContaining(value);
}

function stringMatching(value: RegExp): unknown {
  return expect.stringMatching(value);
}

function inspectParameterizedSql(query: unknown) {
  const sql = query as { strings: readonly string[]; values: unknown[] };
  return {
    text: sql.strings.join('?').replace(/\s+/g, ' ').trim(),
    values: sql.values,
  };
}

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  );
  return {
    prisma,
    service: new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    ),
  };
}

describe('AppService credential lifecycle', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-session-secret-with-at-least-32-bytes';
  });

  it('signs a normal session only after Argon2id verification', async () => {
    const { prisma, service } = createService();
    const userId = 'c6832fa0-c60d-42cf-8027-0aa011133293';
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      account: 'admin',
      identityEnvelope: encryptedUserIdentity(userId, '超级管理员'),
      passwordHash: await credentialSecurity.hashCredential(
        'Correct-Horse-253913!',
      ),
      credentialVersion: 1,
      passwordResetRequired: false,
      authSessionVersion: 4,
      accountStatus: 'active',
      roleBindings: superAdmin.roles,
    });

    const result = await service.login({
      account: 'admin',
      password: 'Correct-Horse-253913!',
    });

    expect(result).toMatchObject({ status: 'authenticated' });
    expect(result).toHaveProperty('sessionToken');
    expect(result).not.toHaveProperty('accessToken');
  });

  it('returns a reset-only state and does not issue a normal session', async () => {
    const { prisma, service } = createService();
    const userId = '8507b2b6-35e4-472e-a3e0-163c3481e3b4';
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      account: 'patient001',
      identityEnvelope: encryptedUserIdentity(userId, '患者'),
      passwordHash:
        await credentialSecurity.hashCredential('Temporary-253913!'),
      credentialVersion: 1,
      passwordResetRequired: true,
      authSessionVersion: 2,
      accountStatus: 'active',
      roleBindings: [
        {
          roleCode: 'patient',
          relatedObjectType: 'patient',
          relatedObjectId: 'patient-id',
        },
      ],
    });

    const result = await service.login({
      account: 'patient001',
      password: 'Temporary-253913!',
    });

    expect(result).toMatchObject({ status: 'password_reset_required' });
    expect(result).toHaveProperty('resetToken');
    expect(result).not.toHaveProperty('sessionToken');
  });

  it('does not verify a legacy SHA-256 credential', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash:
        'ab89db279a359801e5e6596142e8a8a430b61c8d67c11e8a4b307b5b6c45f569',
      accountStatus: 'active',
      roleBindings: [],
    });

    await expect(
      service.login({ account: 'patient001', password: 'Legacy-253913' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the generic login failure for a migrated legacy account without success audit', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      account: 'patient001',
      displayName: '患者',
      passwordHash:
        'ab89db279a359801e5e6596142e8a8a430b61c8d67c11e8a4b307b5b6c45f569',
      credentialVersion: 0,
      passwordResetRequired: true,
      authSessionVersion: 1,
      accountStatus: 'active',
      roleBindings: [],
    });

    await expect(
      service.login({ account: 'patient001', password: 'anything' }),
    ).rejects.toEqual(new UnauthorizedException('账号或密码错误'));
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not disclose a disabled migrated legacy account before administrator reset', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      account: 'patient001',
      displayName: '患者',
      passwordHash:
        'ab89db279a359801e5e6596142e8a8a430b61c8d67c11e8a4b307b5b6c45f569',
      credentialVersion: 0,
      passwordResetRequired: true,
      authSessionVersion: 1,
      accountStatus: 'suspended',
      roleBindings: [],
    });

    await expect(
      service.login({ account: 'patient001', password: 'Legacy-253913' }),
    ).rejects.toEqual(new UnauthorizedException('账号或密码错误'));
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    { account: 'patient001', password: undefined },
    { account: 'patient001', password: 12345678 },
    { account: 1234, password: 'Valid-Password-253913!' },
  ])('returns 400 for an invalid login body: %p', async (body) => {
    const { prisma, service } = createService();

    await expect(service.login(body as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('locks the target and all role bindings in one ReadCommitted transaction before resetting and auditing', async () => {
    const { prisma, service } = createService();
    const queries: unknown[] = [];
    const transaction = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockImplementationOnce((query) => {
          queries.push(query);
          return Promise.resolve([{ id: 'target-id', account: 'patient001' }]);
        })
        .mockImplementationOnce((query) => {
          queries.push(query);
          return Promise.resolve([
            { roleCode: 'patient', bindingStatus: 'active' },
            { roleCode: 'admin', bindingStatus: 'inactive' },
          ]);
        }),
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'target-id',
          account: 'patient001',
        }),
      },
      auditLog: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const hashCredentialSpy = jest.spyOn(credentialSecurity, 'hashCredential');

    const result = await service.adminResetPassword(superAdmin, 'patient001', {
      newPassword: 'Temporary-Reset-253913!',
    });

    expect(result).toEqual({
      status: 'password_reset_required',
      user: { id: 'target-id', account: 'patient001' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    expect(hashCredentialSpy.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(inspectParameterizedSql(queries[0])).toEqual({
      text: 'SELECT "id", "account" FROM "user" WHERE "account" = ? FOR UPDATE',
      values: ['patient001'],
    });
    expect(inspectParameterizedSql(queries[1])).toEqual({
      text: 'SELECT "roleCode", "bindingStatus" FROM "user_role_binding" WHERE "userId" = ? FOR UPDATE',
      values: ['target-id'],
    });
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.$queryRaw.mock.invocationCallOrder[1],
    );
    expect(transaction.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      transaction.user.update.mock.invocationCallOrder[0],
    );
    expect(transaction.user.update.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.auditLog.create.mock.invocationCallOrder[0],
    );
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 'target-id' },
      data: objectContaining({
        passwordHash: stringMatching(/^\$argon2id\$/),
        passwordResetRequired: true,
        authSessionVersion: { increment: 1 },
      }),
      select: { id: true, account: true },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'admin-id',
        action: 'auth.password.admin_reset',
        targetId: 'target-id',
        result: 'success',
      }),
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    hashCredentialSpy.mockRestore();
  });

  it('rejects the ReadCommitted transaction when the success audit fails after the password update', async () => {
    const { prisma, service } = createService();
    const auditError = new Error('audit unavailable');
    const transaction = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockResolvedValueOnce([{ id: 'target-id', account: 'patient001' }])
        .mockResolvedValueOnce([
          { roleCode: 'patient', bindingStatus: 'active' },
        ]),
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'target-id',
          account: 'patient001',
        }),
      },
      auditLog: { create: jest.fn().mockRejectedValue(auditError) },
    };
    prisma.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    await expect(
      service.adminResetPassword(superAdmin, 'patient001', {
        newPassword: 'Temporary-Reset-253913!',
      }),
    ).rejects.toBe(auditError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.user.update).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('commits a denied audit after locked active administrator detection and then throws forbidden', async () => {
    const { prisma, service } = createService();
    const queries: unknown[] = [];
    const transaction = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockImplementationOnce((query) => {
          queries.push(query);
          return Promise.resolve([{ id: 'target-id', account: 'patient001' }]);
        })
        .mockImplementationOnce((query) => {
          queries.push(query);
          return Promise.resolve([
            { roleCode: 'patient', bindingStatus: 'active' },
            { roleCode: 'admin_operator', bindingStatus: 'active' },
            { roleCode: 'admin', bindingStatus: 'inactive' },
          ]);
        }),
      user: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    let transactionCompleted = false;
    prisma.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        const result = await callback(transaction);
        transactionCompleted = true;
        return result;
      },
    );

    const error = await service
      .adminResetPassword(superAdmin, 'patient001', {
        newPassword: 'Temporary-Reset-253913!',
      })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(transactionCompleted).toBe(true);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(inspectParameterizedSql(queries[1])).toEqual({
      text: 'SELECT "roleCode", "bindingStatus" FROM "user_role_binding" WHERE "userId" = ? FOR UPDATE',
      values: ['target-id'],
    });
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-id',
        actorRole: 'admin_super',
        action: 'auth.password.admin_reset',
        targetType: 'user',
        targetId: 'target-id',
        result: 'denied',
        metadata: {
          reason: 'administrator_password_reset_forbidden',
          targetRoleCodes: ['patient', 'admin_operator'],
        },
      },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns not found only after the ReadCommitted transaction completes without a locked target', async () => {
    const { prisma, service } = createService();
    const queries: unknown[] = [];
    const transaction = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockImplementationOnce((query) => {
          queries.push(query);
          return Promise.resolve([]);
        }),
      user: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    let transactionCompleted = false;
    prisma.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        const result = await callback(transaction);
        transactionCompleted = true;
        return result;
      },
    );

    await expect(
      service.adminResetPassword(superAdmin, 'missing-user', {
        newPassword: 'Temporary-Reset-253913!',
      }),
    ).rejects.toEqual(new NotFoundException('目标账号不存在。'));

    expect(transactionCompleted).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(inspectParameterizedSql(queries[0])).toEqual({
      text: 'SELECT "id", "account" FROM "user" WHERE "account" = ? FOR UPDATE',
      values: ['missing-user'],
    });
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { actorLabel: 'operator', actor: operatorAdmin, targetRole: 'admin_super' },
    { actorLabel: 'operator', actor: operatorAdmin, targetRole: 'admin' },
    {
      actorLabel: 'operator',
      actor: operatorAdmin,
      targetRole: 'admin_operator',
    },
    {
      actorLabel: 'operator',
      actor: operatorAdmin,
      targetRole: 'admin_auditor',
    },
    {
      actorLabel: 'standard admin',
      actor: standardAdmin,
      targetRole: 'admin_super',
    },
    { actorLabel: 'standard admin', actor: standardAdmin, targetRole: 'admin' },
  ] as const)(
    'rejects $actorLabel credential reset against active $targetRole and audits denial',
    async ({ actor, targetRole }) => {
      const { prisma, service } = createService();
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { id: 'target-admin-id', account: 'target_admin' },
        ])
        .mockResolvedValueOnce([
          { roleCode: targetRole, bindingStatus: 'active' },
        ]);

      await expect(
        service.adminResetPassword(actor, 'target_admin', {
          newPassword: 'Temporary-Reset-253913!',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: actor.id,
          actorRole: actor.roles[0]?.roleCode,
          action: 'auth.password.admin_reset',
          targetType: 'user',
          targetId: 'target-admin-id',
          result: 'denied',
          metadata: {
            reason: 'administrator_password_reset_forbidden',
            targetRoleCodes: [targetRole],
          },
        }),
      });
    },
  );

  it('rejects an auditor from resetting credentials', async () => {
    const { prisma, service } = createService();

    await expect(
      service.adminResetPassword(auditor, 'patient001', {
        newPassword: 'Temporary-Reset-253913!',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('completes a reset-only session with Argon2id and invalidates the reset cookie version', async () => {
    const { prisma, service } = createService();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.completePasswordReset('target-id', 5, {
        newPassword: 'New-Private-Password-253913!',
      }),
    ).resolves.toEqual({ status: 'password_reset_complete' });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'target-id',
        passwordResetRequired: true,
        authSessionVersion: 5,
      },
      data: objectContaining({
        passwordHash: stringMatching(/^\$argon2id\$/),
        credentialVersion: 1,
        passwordResetRequired: false,
        authSessionVersion: { increment: 1 },
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        action: 'auth.password.required_reset_complete',
        targetId: 'target-id',
      }),
    });
  });

  it('rejects a reset token after its state was already consumed', async () => {
    const { prisma, service } = createService();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.completePasswordReset('target-id', 5, {
        newPassword: 'New-Private-Password-253913!',
      }),
    ).rejects.toEqual(
      new UnauthorizedException('密码重置凭证已过期，请重新登录。'),
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
