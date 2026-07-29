import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfTokensMatch,
  parseCookies,
} from './auth-session';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | undefined>;
    }>();
    if (['GET', 'HEAD'].includes(request.method.toUpperCase())) return true;
    const cookies = parseCookies(request.headers.cookie);
    if (
      !csrfTokensMatch(
        cookies[CSRF_COOKIE_NAME],
        request.headers[CSRF_HEADER_NAME],
      )
    ) {
      throw new ForbiddenException('CSRF token invalid');
    }
    return true;
  }
}
