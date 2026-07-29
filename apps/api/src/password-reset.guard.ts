import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  RESET_COOKIE_NAME,
  SessionTokenPayload,
  csrfTokensMatch,
  parseCookies,
  sessionCookieOptions,
  verifySessionToken,
} from './auth-session';

export type PasswordResetRequest = {
  method: string;
  headers: Record<string, string | undefined>;
  passwordResetSession?: SessionTokenPayload;
};

@Injectable()
export class PasswordResetGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<PasswordResetRequest>();
    const response = context.switchToHttp().getResponse<{
      clearCookie: (
        name: string,
        options: ReturnType<typeof sessionCookieOptions>,
      ) => void;
    }>();
    const cookies = parseCookies(request.headers.cookie);
    if (
      !csrfTokensMatch(
        cookies[CSRF_COOKIE_NAME],
        request.headers[CSRF_HEADER_NAME],
      )
    ) {
      throw new ForbiddenException('CSRF token invalid');
    }
    const token = cookies[RESET_COOKIE_NAME];
    if (!token) {
      response.clearCookie(RESET_COOKIE_NAME, sessionCookieOptions(0));
      throw new UnauthorizedException('Missing password reset cookie');
    }
    try {
      const payload = verifySessionToken(token);
      if (payload.purpose !== 'password-reset')
        throw new Error('Wrong purpose');
      request.passwordResetSession = payload;
      return true;
    } catch {
      response.clearCookie(RESET_COOKIE_NAME, sessionCookieOptions(0));
      throw new UnauthorizedException('Invalid password reset cookie');
    }
  }
}
