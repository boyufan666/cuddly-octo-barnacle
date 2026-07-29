import { AppService } from './app.service';
import { hashCredential } from './credential-security';
import type { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';
import { encryptSensitiveJson } from './sensitive-encryption';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};
const userId = '55cb714a-f849-45a8-8fd5-4331fdca5ce7';
const adminUser: RequestUser = {
  id: userId,
  account: 'admin_query_boundary',
  displayName: '管理员',
  roles: [
    {
      roleCode: 'admin_super',
      relatedObjectType: 'admin',
      relatedObjectId: userId,
    },
  ],
};

function anyDate(): unknown {
  return expect.any(Date) as unknown;
}

describe('auth user update query boundaries', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-jwt-secret-at-least-32-bytes';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('selects only id after updating the successful login timestamp', async () => {
    const password = 'Temp-253913!';
    const userUpdate = jest.fn().mockResolvedValue({ id: userId });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          account: adminUser.account,
          passwordHash: await hashCredential(password),
          credentialVersion: 1,
          passwordResetRequired: false,
          authSessionVersion: 3,
          accountStatus: 'active',
          identityEnvelope: encryptSensitiveJson(
            { displayName: adminUser.displayName, mobilePhone: null },
            {
              tableName: 'user',
              recordId: userId,
              fieldName: 'identityEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
          roleBindings: adminUser.roles.map((role) => ({
            ...role,
            organizationId: null,
          })),
        }),
        update: userUpdate,
      },
      auditLog: { create: jest.fn() },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.login({ account: adminUser.account, password }),
    ).resolves.toMatchObject({ status: 'authenticated' });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: userId },
      data: { lastLoginAt: anyDate() },
      select: { id: true },
    });
  });

  it('selects only id after invalidating sessions during logout', async () => {
    const userUpdate = jest.fn().mockResolvedValue({ id: userId });
    const tx = {
      user: { update: userUpdate },
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

    await expect(service.logout(adminUser)).resolves.toEqual({
      status: 'logged_out',
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: userId },
      data: { authSessionVersion: { increment: 1 } },
      select: { id: true },
    });
  });
});
