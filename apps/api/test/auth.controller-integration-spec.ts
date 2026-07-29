import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SENSITIVE_ENCRYPTION_KEY } from '../src/config';
import { hashCredential } from '../src/credential-security';
import { PrismaService } from '../src/prisma.service';
import { encryptSensitiveJson } from '../src/sensitive-encryption';

const adminUserId = 'f66f8b1c-c98d-4a87-b90f-b67ffb29d175';
const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/controller-integration-test-key',
  key: Buffer.alloc(32, 29),
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('cookie authentication controller integration', () => {
  let app: INestApplication | undefined;
  let server: App;
  let authSessionVersion = 1;
  let originalJwtSecret: string | undefined;
  let originalCookieSecure: string | undefined;
  let originalThrottleLimit: string | undefined;
  let originalThrottleTtl: string | undefined;

  beforeAll(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    originalCookieSecure = process.env.COOKIE_SECURE;
    originalThrottleLimit = process.env.PUBLIC_CREDENTIAL_THROTTLE_LIMIT;
    originalThrottleTtl = process.env.PUBLIC_CREDENTIAL_THROTTLE_TTL_MS;

    process.env.JWT_SECRET = 'e2e-cookie-session-secret-with-at-least-32-bytes';
    process.env.COOKIE_SECURE = 'false';
    process.env.PUBLIC_CREDENTIAL_THROTTLE_LIMIT = '100';
    process.env.PUBLIC_CREDENTIAL_THROTTLE_TTL_MS = '60000';

    const passwordHash = await hashCredential('Correct-Horse-253913!');
    const identityEnvelope = encryptSensitiveJson(
      { displayName: '超级管理员', mobilePhone: null },
      {
        tableName: 'user',
        recordId: adminUserId,
        fieldName: 'identityEnvelope',
      },
      testSensitiveEncryptionKey,
    );
    const prisma = {
      user: {
        findUnique: jest.fn(
          ({ where }: { where: { account?: string; id?: string } }) => ({
            id: where.id ?? adminUserId,
            account: where.account ?? 'admin',
            identityEnvelope,
            passwordHash,
            credentialVersion: 1,
            passwordResetRequired: false,
            authSessionVersion,
            accountStatus: 'active',
            roleBindings: [
              {
                roleCode: 'admin_super',
                relatedObjectType: 'admin',
                relatedObjectId: adminUserId,
                organizationId: null,
              },
            ],
          }),
        ),
        update: jest.fn(
          ({
            data,
          }: {
            data: { authSessionVersion?: { increment: number } };
          }) => {
            if (data.authSessionVersion)
              authSessionVersion += data.authSessionVersion.increment;
            return { id: adminUserId };
          },
        ),
      },
      auditLog: { create: jest.fn(() => ({})) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(SENSITIVE_ENCRYPTION_KEY)
      .useValue(testSensitiveEncryptionKey)
      .compile();
    const candidate = module.createNestApplication();
    await candidate.init();
    app = candidate;
    server = candidate.getHttpServer() as App;
  });

  afterAll(async () => {
    await app?.close();
    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('COOKIE_SECURE', originalCookieSecure);
    restoreEnv('PUBLIC_CREDENTIAL_THROTTLE_LIMIT', originalThrottleLimit);
    restoreEnv('PUBLIC_CREDENTIAL_THROTTLE_TTL_MS', originalThrottleTtl);
  });

  it('uses Cookie + CSRF, clears on logout, and invalidates the old JWT version', async () => {
    const agent = request.agent(server);
    const csrf = await agent.get('/auth/csrf').expect(200);
    const csrfToken = (csrf.body as { csrfToken: string }).csrfToken;
    const login = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ account: 'admin', password: 'Correct-Horse-253913!' })
      .expect(201);
    expect(login.body).toMatchObject({ status: 'authenticated' });
    expect(login.body).not.toHaveProperty('accessToken');
    const setCookies = login.headers['set-cookie'] as unknown as string[];
    expect(setCookies.join(';')).toContain('rehab_session=');
    expect(setCookies.join(';')).toContain('HttpOnly');
    const allSetCookies = [
      ...((csrf.headers['set-cookie'] as unknown as string[]) ?? []),
      ...setCookies,
    ];
    const cookieHeader = allSetCookies
      .map((cookie) => cookie.split(';')[0])
      .join('; ');

    await agent.get('/me').expect(200);
    await agent.post('/auth/logout').expect(403);
    const logout = await agent
      .post('/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(200);
    const clearedCookies = logout.headers['set-cookie'];
    expect(
      (Array.isArray(clearedCookies) ? clearedCookies : [clearedCookies]).join(
        ';',
      ),
    ).toContain('rehab_session=;');

    await request(server).get('/me').set('Cookie', cookieHeader).expect(401);
  });

  it('assigns only a successfully initialized application to afterAll ownership', () => {
    const source = readFileSync(__filename, 'utf8');
    const beforeAllSource = source.slice(
      source.indexOf('beforeAll(async () => {'),
      source.indexOf('  afterAll(async () => {'),
    );

    expect(beforeAllSource).toContain(
      'const candidate = module.createNestApplication();',
    );
    expect(beforeAllSource).toMatch(
      /const candidate = module\.createNestApplication\(\);\s+await candidate\.init\(\);\s+app = candidate;\s+server = candidate\.getHttpServer\(\) as App;/,
    );
  });
});
