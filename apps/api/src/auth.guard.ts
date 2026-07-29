import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfTokensMatch,
  parseCookies,
  verifySessionToken,
} from './auth-session';
import { RequestUser } from './current-user';
import { SENSITIVE_ENCRYPTION_KEY } from './config';
import { PrismaService } from './prisma.service';
import {
  decryptSensitiveJson,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';
import { parseUserIdentityPayload } from './user-identity';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SENSITIVE_ENCRYPTION_KEY)
    private readonly sensitiveEncryptionKey: SensitiveEncryptionKey,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | undefined>;
      user?: RequestUser;
    }>();
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[AUTH_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Missing session cookie');
    }

    if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
      if (
        !csrfTokensMatch(
          cookies[CSRF_COOKIE_NAME],
          request.headers[CSRF_HEADER_NAME],
        )
      ) {
        throw new ForbiddenException('CSRF token invalid');
      }
    }

    let session;
    try {
      session = verifySessionToken(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (session.purpose !== 'auth') {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.sub },
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

    if (
      !user ||
      user.accountStatus !== 'active' ||
      user.credentialVersion !== 1 ||
      user.passwordResetRequired ||
      user.authSessionVersion !== session.authSessionVersion
    ) {
      throw new UnauthorizedException('Invalid token');
    }
    const identity = parseUserIdentityPayload(
      decryptSensitiveJson<unknown>(
        user.identityEnvelope,
        {
          tableName: 'user',
          recordId: user.id,
          fieldName: 'identityEnvelope',
        },
        this.sensitiveEncryptionKey,
      ),
    );

    request.user = {
      id: user.id,
      account: user.account,
      displayName: identity.displayName,
      roles: user.roleBindings.map((binding) => ({
        roleCode: binding.roleCode,
        relatedObjectType: binding.relatedObjectType,
        relatedObjectId: binding.relatedObjectId,
        organizationId: binding.organizationId ?? undefined,
      })),
    };
    return true;
  }
}
