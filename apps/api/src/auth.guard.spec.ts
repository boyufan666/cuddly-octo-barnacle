import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createSessionToken } from './auth-session';
import { AuthGuard } from './auth.guard';
import { PrismaService } from './prisma.service';
import { encryptSensitiveJson } from './sensitive-encryption';

const userId = '0e193e2e-f69a-4d40-8cb2-a8d984488ac3';
const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/auth-guard-test-key',
  key: Buffer.alloc(32, 17),
};

function encryptedUserIdentity(encryptionKey = testSensitiveEncryptionKey) {
  return encryptSensitiveJson(
    { displayName: '患者', mobilePhone: '13800138000' },
    { tableName: 'user', recordId: userId, fieldName: 'identityEnvelope' },
    encryptionKey,
  );
}

function encryptedUserIdentityPayload(payload: Record<string, unknown>) {
  return encryptSensitiveJson(
    payload,
    { tableName: 'user', recordId: userId, fieldName: 'identityEnvelope' },
    testSensitiveEncryptionKey,
  );
}

describe('AuthGuard cookie sessions', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-session-secret-with-at-least-32-bytes';
  });

  function createGuard(request: {
    method: string;
    headers: Record<string, string | undefined>;
    user?: unknown;
  }) {
    const prisma = {
      user: { findUnique: jest.fn() },
    };
    const guard = new AuthGuard(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return { guard, prisma, context };
  }

  function sessionCookie(version = 3) {
    const token = createSessionToken(
      { sub: userId, authSessionVersion: version, purpose: 'auth' },
      '8h',
    );
    return `rehab_session=${token}`;
  }

  it('authenticates an HttpOnly-cookie JWT bound to the database session version', async () => {
    const request: {
      method: string;
      headers: Record<string, string | undefined>;
      user?: unknown;
    } = { method: 'GET', headers: { cookie: sessionCookie() } };
    const { guard, prisma, context } = createGuard(request);
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      account: 'patient001',
      identityEnvelope: encryptedUserIdentity(),
      accountStatus: 'active',
      credentialVersion: 1,
      authSessionVersion: 3,
      passwordResetRequired: false,
      roleBindings: [
        {
          roleCode: 'patient',
          relatedObjectType: 'patient',
          relatedObjectId: 'patient-id',
          organizationId: null,
        },
      ],
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      id: userId,
      account: 'patient001',
      displayName: '患者',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: userId },
      select: {
        id: true,
        account: true,
        accountStatus: true,
        credentialVersion: true,
        passwordResetRequired: true,
        authSessionVersion: true,
        identityEnvelope: true,
        roleBindings: {
          where: { bindingStatus: 'active' },
          select: {
            roleCode: true,
            relatedObjectType: true,
            relatedObjectId: true,
            organizationId: true,
          },
        },
      },
    });
  });

  it.each([
    ['missing', null],
    [
      'tampered',
      {
        ...encryptedUserIdentity(),
        tag: Buffer.alloc(16, 1).toString('base64'),
      },
    ],
    [
      'wrong-key',
      encryptedUserIdentity({
        kid: 'secret-manager://rehab/auth-guard-wrong-key',
        key: Buffer.alloc(32, 23),
      }),
    ],
  ])(
    'hard-fails %s user identity envelopes',
    async (_label, identityEnvelope) => {
      const request: {
        method: string;
        headers: Record<string, string | undefined>;
        user?: unknown;
      } = { method: 'GET', headers: { cookie: sessionCookie() } };
      const { guard, prisma, context } = createGuard(request);
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        account: 'patient001',
        identityEnvelope,
        accountStatus: 'active',
        credentialVersion: 1,
        authSessionVersion: 3,
        passwordResetRequired: false,
        roleBindings: [],
      });

      await expect(guard.canActivate(context as never)).rejects.toThrow();
      expect(request.user).toBeUndefined();
    },
  );

  it.each([
    ['missing displayName', { mobilePhone: null }],
    ['blank displayName', { displayName: '   ', mobilePhone: null }],
    [
      'wrong-type mobilePhone',
      { displayName: '患者', mobilePhone: 13800138000 },
    ],
  ])(
    'rejects %s in a valid user identity envelope',
    async (_label, payload) => {
      const request: {
        method: string;
        headers: Record<string, string | undefined>;
        user?: unknown;
      } = { method: 'GET', headers: { cookie: sessionCookie() } };
      const { guard, prisma, context } = createGuard(request);
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        account: 'patient001',
        identityEnvelope: encryptedUserIdentityPayload(payload),
        accountStatus: 'active',
        credentialVersion: 1,
        authSessionVersion: 3,
        passwordResetRequired: false,
        roleBindings: [],
      });

      await expect(guard.canActivate(context as never)).rejects.toThrow(
        'User identity envelope payload is invalid.',
      );
      expect(request.user).toBeUndefined();
    },
  );

  it('rejects a cookie immediately after authSessionVersion changes', async () => {
    const { guard, prisma, context } = createGuard({
      method: 'GET',
      headers: { cookie: sessionCookie(2) },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      accountStatus: 'active',
      credentialVersion: 1,
      authSessionVersion: 3,
      passwordResetRequired: false,
      roleBindings: [],
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('requires matching CSRF cookie and header for mutating cookie-authenticated requests', async () => {
    const { guard, context } = createGuard({
      method: 'POST',
      headers: { cookie: `${sessionCookie()}; rehab_csrf=cookie-token` },
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('never accepts Authorization Bearer credentials', async () => {
    const { guard, context } = createGuard({
      method: 'GET',
      headers: { authorization: 'Bearer legacy-token' },
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not rewrite database failures as authentication failures', async () => {
    const databaseError = new Error('database unavailable');
    const { guard, prisma, context } = createGuard({
      method: 'GET',
      headers: { cookie: sessionCookie() },
    });
    prisma.user.findUnique.mockRejectedValue(databaseError);

    await expect(guard.canActivate(context as never)).rejects.toBe(
      databaseError,
    );
  });
});
