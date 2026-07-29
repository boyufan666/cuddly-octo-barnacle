import { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './auth.guard';
import { CsrfGuard } from './csrf.guard';
import { PasswordResetGuard } from './password-reset.guard';
import { PrismaService } from './prisma.service';
import { SENSITIVE_ENCRYPTION_KEY } from './config';

const CREDENTIAL_THROTTLER_NAME = 'public-credential';
const REQUEST_LIMIT = 2;

function guardMetadata(methodName: keyof AppController) {
  const handler = AppController.prototype[methodName];
  return (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];
}

describe('public credential endpoint throttling', () => {
  let app: INestApplication;
  let server: App;
  const originalCookieSecure = process.env.COOKIE_SECURE;

  beforeAll(async () => {
    process.env.COOKIE_SECURE = 'false';
    const appService = {
      login: jest.fn().mockResolvedValue({
        status: 'authenticated',
        sessionToken: 'signed-session',
        user: { id: 'user-id' },
        context: { patientIds: [] },
      }),
      createRegistrationRequest: jest
        .fn()
        .mockResolvedValue({ id: 'registration-id' }),
      completePasswordReset: jest
        .fn()
        .mockResolvedValue({ status: 'password_reset_complete' }),
      me: jest.fn().mockReturnValue({ id: 'clinical-user-id' }),
    };
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: CREDENTIAL_THROTTLER_NAME,
            limit: REQUEST_LIMIT,
            ttl: 60_000,
          },
        ]),
      ],
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
        { provide: PrismaService, useValue: {} },
        {
          provide: SENSITIVE_ENCRYPTION_KEY,
          useValue: {
            kid: 'secret-manager://rehab/unit-sensitive-key',
            key: Buffer.alloc(32, 11),
          },
        },
        ThrottlerGuard,
        AuthGuard,
        CsrfGuard,
        PasswordResetGuard,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PasswordResetGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            passwordResetSession?: {
              sub: string;
              authSessionVersion: number;
              purpose: 'password-reset';
            };
          }>();
          httpRequest.passwordResetSession = {
            sub: 'user-id',
            authSessionVersion: 1,
            purpose: 'password-reset',
          };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }
  });

  it('assigns ThrottlerGuard only to the three public credential handlers', () => {
    for (const methodName of [
      'login',
      'createRegistrationRequest',
      'completePasswordReset',
    ] as const) {
      expect(guardMetadata(methodName)).toContain(ThrottlerGuard);
    }

    expect(guardMetadata('me')).not.toContain(ThrottlerGuard);
    expect(guardMetadata('createAssessment')).not.toContain(ThrottlerGuard);
  });

  it('rate-limits login and does not trust arbitrary forwarded IP headers', async () => {
    await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.1')
      .send({ account: 'patient001', password: 'secret' })
      .expect(201);
    await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.2')
      .send({ account: 'patient001', password: 'secret' })
      .expect(201);
    await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.3')
      .send({ account: 'patient001', password: 'secret' })
      .expect(429);

    const expressApplication = app.getHttpAdapter().getInstance() as {
      get(setting: 'trust proxy'): unknown;
    };
    expect(expressApplication.get('trust proxy')).toBe(false);
  });

  it('rate-limits public registration requests', async () => {
    for (
      let requestNumber = 1;
      requestNumber <= REQUEST_LIMIT;
      requestNumber++
    ) {
      await request(server)
        .post('/auth/registration-requests')
        .send({ account: `applicant-${requestNumber}` })
        .expect(201);
    }

    await request(server)
      .post('/auth/registration-requests')
      .send({ account: 'applicant-blocked' })
      .expect(429);
  });

  it('rate-limits the public password-reset credential endpoint', async () => {
    for (
      let requestNumber = 1;
      requestNumber <= REQUEST_LIMIT;
      requestNumber++
    ) {
      await request(server)
        .post('/auth/password-reset')
        .send({ newPassword: `New-Password-${requestNumber}!` })
        .expect(200);
    }

    await request(server)
      .post('/auth/password-reset')
      .send({ newPassword: 'New-Password-Blocked!' })
      .expect(429);
  });

  it('does not assign the credential limit to authenticated clinical routes', async () => {
    for (
      let requestNumber = 1;
      requestNumber <= REQUEST_LIMIT + 2;
      requestNumber++
    ) {
      await request(server).get('/me').expect(200);
    }
  });

  it('keeps first-admin bootstrap off the public HTTP surface', async () => {
    const controllerPrototype = AppController.prototype as unknown as Record<
      string,
      unknown
    >;
    const routePaths = Object.getOwnPropertyNames(
      AppController.prototype,
    ).flatMap((methodName) => {
      const handler = controllerPrototype[methodName];
      if (
        typeof handler !== 'function' ||
        !Reflect.hasMetadata(PATH_METADATA, handler)
      ) {
        return [];
      }
      return [Reflect.getMetadata(PATH_METADATA, handler) as string];
    });

    expect(routePaths).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/first.*admin|admin.*bootstrap/i),
      ]),
    );
    await request(server)
      .post('/auth/first-admin-bootstrap')
      .send({ password: 'must-not-be-http-accessible' })
      .expect(404);
  });
});
