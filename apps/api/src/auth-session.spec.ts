import { decode, sign } from 'jsonwebtoken';
import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  createSessionToken,
  createCsrfToken,
  csrfCookieOptions,
  isCsrfTokenValid,
  sessionCookieOptions,
  verifySessionToken,
} from './auth-session';
import { requireCookieSecure, requireStrongJwtSecret } from './config';

describe('auth session JWT contract', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-session-secret-with-at-least-32-bytes';
    process.env.COOKIE_SECURE = 'false';
  });

  it('signs an HS256 token with the fixed issuer and audience', () => {
    const token = createSessionToken(
      { sub: 'user-id', authSessionVersion: 3, purpose: 'auth' },
      '8h',
    );

    expect(decode(token, { complete: true })).toMatchObject({
      header: { alg: 'HS256' },
      payload: {
        iss: AUTH_TOKEN_ISSUER,
        aud: AUTH_TOKEN_AUDIENCE,
      },
    });
  });

  it.each([
    { issuer: 'wrong-issuer', audience: AUTH_TOKEN_AUDIENCE },
    { issuer: AUTH_TOKEN_ISSUER, audience: 'wrong-audience' },
  ])('rejects a token outside the fixed trust domain', (claims) => {
    const token = sign(
      { sub: 'user-id', authSessionVersion: 3, purpose: 'auth' },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: '8h', ...claims },
    );

    expect(() => verifySessionToken(token)).toThrow();
  });

  it('accepts only the canonical 256-bit CSRF token encoding', () => {
    expect(isCsrfTokenValid(createCsrfToken())).toBe(true);
    expect(isCsrfTokenValid('csrf-value')).toBe(false);
    expect(isCsrfTokenValid(undefined)).toBe(false);
  });

  it.each([
    ['x'.repeat(31), 31],
    ['密'.repeat(10), 30],
  ])('rejects a JWT secret shorter than 32 UTF-8 bytes', (secret) => {
    process.env.JWT_SECRET = secret;

    expect(() => requireStrongJwtSecret()).toThrow(/32 UTF-8 bytes/);
    expect(() =>
      createSessionToken(
        { sub: 'user-id', authSessionVersion: 3, purpose: 'auth' },
        '8h',
      ),
    ).toThrow(/32 UTF-8 bytes/);
  });

  it.each(['x'.repeat(32), '密'.repeat(11)])(
    'accepts a JWT secret with at least 32 UTF-8 bytes',
    (secret) => {
      process.env.JWT_SECRET = secret;

      expect(requireStrongJwtSecret()).toBe(secret);
    },
  );

  it.each([
    ['true', true],
    ['false', false],
  ] as const)(
    'uses the explicit COOKIE_SECURE=%s setting for every auth cookie',
    (value, expected) => {
      process.env.COOKIE_SECURE = value;

      expect(requireCookieSecure()).toBe(expected);
      expect(sessionCookieOptions(1_000).secure).toBe(expected);
      expect(csrfCookieOptions(1_000).secure).toBe(expected);
    },
  );

  it.each([undefined, '', 'TRUE', '1', 'production'])(
    'rejects a missing or non-boolean COOKIE_SECURE value: %p',
    (value) => {
      if (value === undefined) {
        delete process.env.COOKIE_SECURE;
      } else {
        process.env.COOKIE_SECURE = value;
      }

      expect(() => requireCookieSecure()).toThrow(
        /COOKIE_SECURE must be exactly true or false/,
      );
      expect(() => sessionCookieOptions(1_000)).toThrow(
        /COOKIE_SECURE must be exactly true or false/,
      );
    },
  );
});
