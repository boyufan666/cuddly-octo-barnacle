import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { requireEnv } from './config';
import { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: RequestUser;
    }>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);
    try {
      const tokenUser = verify(token, requireEnv('JWT_SECRET')) as RequestUser;
      const user = await this.prisma.user.findUnique({
        where: { id: tokenUser.id },
        include: { roleBindings: { where: { bindingStatus: 'active' } } },
      });

      if (!user || user.accountStatus !== 'active') {
        throw new UnauthorizedException('Invalid token');
      }

      request.user = {
        id: user.id,
        account: user.account,
        displayName: user.displayName,
        roles: user.roleBindings.map((binding) => ({
          roleCode: binding.roleCode,
          relatedObjectType: binding.relatedObjectType,
          relatedObjectId: binding.relatedObjectId,
          organizationId: binding.organizationId ?? undefined,
        })),
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
