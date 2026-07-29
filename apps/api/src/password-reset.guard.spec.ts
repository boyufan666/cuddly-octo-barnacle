import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createCsrfToken, createSessionToken } from './auth-session';
import { PasswordResetGuard } from './password-reset.guard';

describe('PasswordResetGuard', () => {
  const originalCookieSecure = process.env.COOKIE_SECURE;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-session-secret-with-at-least-32-bytes';
    process.env.COOKIE_SECURE = 'false';
  });

  afterAll(() => {
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }
  });

  function context(request: Record<string, unknown>) {
    const response = { clearCookie: jest.fn() };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      response,
    };
  }

  it('accepts only a reset-purpose cookie with matching CSRF', () => {
    const csrfToken = createCsrfToken();
    const token = createSessionToken(
      { sub: 'user-id', authSessionVersion: 2, purpose: 'password-reset' },
      '15m',
    );
    const request = {
      method: 'POST',
      headers: {
        cookie: `rehab_password_reset=${token}; rehab_csrf=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    };

    expect(
      new PasswordResetGuard().canActivate(context(request) as never),
    ).toBe(true);
    expect(request).toHaveProperty('passwordResetSession.sub', 'user-id');
  });

  it('rejects missing CSRF before accepting a reset cookie', () => {
    expect(() =>
      new PasswordResetGuard().canActivate(
        context({
          method: 'POST',
          headers: { cookie: 'rehab_csrf=value' },
        }) as never,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a normal authentication token as a password-reset token', () => {
    const csrfToken = createCsrfToken();
    const token = createSessionToken(
      { sub: 'user-id', authSessionVersion: 2, purpose: 'auth' },
      '8h',
    );
    const invalidContext = context({
      method: 'POST',
      headers: {
        cookie: `rehab_password_reset=${token}; rehab_csrf=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    });
    expect(() =>
      new PasswordResetGuard().canActivate(invalidContext as never),
    ).toThrow(UnauthorizedException);
    expect(invalidContext.response.clearCookie).toHaveBeenCalledWith(
      'rehab_password_reset',
      expect.objectContaining({ httpOnly: true, maxAge: 0 }),
    );
  });
});
