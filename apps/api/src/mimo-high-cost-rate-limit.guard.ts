import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestUser } from './current-user';
import {
  MIMO_USAGE_GATE,
  MimoHighCostRateLimitExceededException,
  type MimoUsageGate,
  type MimoUsageOperation,
} from './mimo-usage-gate';
import { emitProductionRuntimeEvent } from './production-runtime-event';

export const MIMO_HIGH_COST_OPERATION_METADATA =
  'mimo-high-cost-operation' as const;

export const MimoHighCostOperation = (operation: MimoUsageOperation) =>
  SetMetadata(MIMO_HIGH_COST_OPERATION_METADATA, operation);

@Injectable()
export class MimoHighCostRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(MIMO_USAGE_GATE)
    private readonly mimoUsageGate: MimoUsageGate | undefined,
  ) {}

  async canActivate(context: ExecutionContext) {
    const operation = this.reflector.get<MimoUsageOperation>(
      MIMO_HIGH_COST_OPERATION_METADATA,
      context.getHandler(),
    );
    if (!operation) {
      throw new ServiceUnavailableException(
        '高成本请求限流操作未配置，已阻断供应商调用。',
      );
    }
    if (process.env.NODE_ENV !== 'production') return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!this.mimoUsageGate) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.high_cost.rejected',
        operation,
        reasonCode: 'gate_uninitialized',
      });
      throw new ServiceUnavailableException(
        '共享高成本请求限流服务未初始化，已阻断供应商调用。',
      );
    }

    try {
      await this.mimoUsageGate.consumeUserOperationRateLimit({
        userId: request.user.id,
        operation,
      });
    } catch (error) {
      emitProductionRuntimeEvent({
        eventCode: 'mimo.high_cost.rejected',
        operation,
        reasonCode:
          error instanceof MimoHighCostRateLimitExceededException
            ? 'request_rate_exceeded'
            : 'key_value_unavailable',
      });
      throw error;
    }
    return true;
  }
}
