import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RoleCode } from '@prisma/client';

export type RequestUser = {
  id: string;
  account: string;
  displayName: string;
  roles: Array<{
    roleCode: RoleCode;
    relatedObjectType: string;
    relatedObjectId: string;
    organizationId?: string;
  }>;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
