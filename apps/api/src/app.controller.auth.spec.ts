import { createCsrfToken } from './auth-session';
import { UnauthorizedException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

function responseMock() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe('AppController authentication cookies', () => {
  beforeEach(() => {
    process.env.COOKIE_SECURE = 'false';
  });

  it('explicitly issues a CSRF cookie and matching response token', () => {
    const controller = new AppController({} as AppService);
    const response = responseMock();

    const result = controller.csrf({ headers: {} } as never, response as never);

    expect(response.cookie).toHaveBeenCalledWith(
      'rehab_csrf',
      result.csrfToken,
      expect.objectContaining({ httpOnly: false, sameSite: 'lax' }),
    );
    expect(result.csrfToken).toEqual(expect.any(String));
  });

  it('returns an existing valid CSRF cookie without rotating it', () => {
    const controller = new AppController({} as AppService);
    const response = responseMock();
    const existingToken = createCsrfToken();

    const result = controller.csrf(
      { headers: { cookie: `rehab_csrf=${existingToken}` } } as never,
      response as never,
    );

    expect(result).toEqual({ csrfToken: existingToken });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('puts the JWT only in an HttpOnly cookie and returns no token', async () => {
    const service = {
      login: jest.fn().mockResolvedValue({
        status: 'authenticated',
        sessionToken: 'signed-session',
        user: { id: 'user-id' },
        context: { patientIds: [] },
      }),
    };
    const controller = new AppController(service as unknown as AppService);
    const response = responseMock();

    const result = await controller.login(
      { account: 'patient001', password: 'secret' },
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'rehab_session',
      'signed-session',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(response.cookie).not.toHaveBeenCalledWith(
      'rehab_csrf',
      expect.anything(),
      expect.anything(),
    );
    expect(result).toEqual({
      status: 'authenticated',
      user: { id: 'user-id' },
      context: { patientIds: [] },
    });
    expect(JSON.stringify(result)).not.toContain('signed-session');
  });

  it('sets only a short-lived reset cookie when password reset is required', async () => {
    const service = {
      login: jest.fn().mockResolvedValue({
        status: 'password_reset_required',
        resetToken: 'signed-reset-session',
        user: { account: 'patient001', displayName: '患者' },
      }),
    };
    const controller = new AppController(service as unknown as AppService);
    const response = responseMock();

    const result = await controller.login(
      { account: 'patient001', password: 'temporary' },
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'rehab_password_reset',
      'signed-reset-session',
      expect.objectContaining({ httpOnly: true, maxAge: 900_000 }),
    );
    expect(response.cookie).not.toHaveBeenCalledWith(
      'rehab_session',
      expect.anything(),
      expect.anything(),
    );
    expect(result).toMatchObject({ status: 'password_reset_required' });
  });

  it('clears a reset cookie when reset state was consumed before submission', async () => {
    const service = {
      completePasswordReset: jest
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('密码重置凭证已过期，请重新登录。'),
        ),
    };
    const controller = new AppController(service as unknown as AppService);
    const response = responseMock();

    await expect(
      controller.completePasswordReset(
        {
          passwordResetSession: {
            sub: 'user-id',
            authSessionVersion: 2,
            purpose: 'password-reset',
          },
        } as never,
        { newPassword: 'New-Password-253913!' },
        response as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(response.clearCookie).toHaveBeenCalledWith(
      'rehab_password_reset',
      expect.objectContaining({ httpOnly: true, maxAge: 0 }),
    );
  });
});
