import { ForbiddenException } from '@nestjs/common';
import { createCsrfToken } from './auth-session';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  function context(headers: Record<string, string | undefined>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', headers }),
      }),
    } as never;
  }

  it('accepts an unsafe public request only when cookie and header match', () => {
    const token = createCsrfToken();
    expect(
      new CsrfGuard().canActivate(
        context({
          cookie: `rehab_csrf=${token}`,
          'x-csrf-token': token,
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [{ cookie: 'rehab_csrf=csrf-value' }],
    [
      {
        cookie: 'rehab_csrf=csrf-value',
        'x-csrf-token': 'different-value',
      },
    ],
  ])('rejects missing or mismatched public-request CSRF', (headers) => {
    expect(() => new CsrfGuard().canActivate(context(headers))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a matching but malformed CSRF value', () => {
    expect(() =>
      new CsrfGuard().canActivate(
        context({
          cookie: 'rehab_csrf=csrf-value',
          'x-csrf-token': 'csrf-value',
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
