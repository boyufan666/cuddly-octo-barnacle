import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthGuard } from './auth.guard';
import {
  MIMO_HIGH_COST_OPERATION_METADATA,
  MimoHighCostRateLimitGuard,
} from './mimo-high-cost-rate-limit.guard';
import {
  MimoHighCostRateLimitExceededException,
  type MimoUsageGate,
} from './mimo-usage-gate';

function handlerMetadata(methodName: keyof AppController) {
  return AppController.prototype[methodName];
}

function executionContext(
  handler: (...args: never[]) => unknown,
  userId = 'authenticated-user-1',
) {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('MimoHighCostRateLimitGuard', () => {
  const originalNodeEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  });

  it.each([
    ['createAiAssessmentDraft', 'ai'],
    ['appendAiConversationMessage', 'ai'],
    ['createAssessmentSpeechTranscript', 'speech'],
    ['createTtsSpeechOutput', 'tts'],
  ] as const)(
    'binds AuthGuard and the shared rate limiter to %s as %s',
    (methodName, operation) => {
      const handler = handlerMetadata(methodName);
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as
        | unknown[]
        | undefined;

      expect(guards).toEqual([AuthGuard, MimoHighCostRateLimitGuard]);
      expect(
        Reflect.getMetadata(MIMO_HIGH_COST_OPERATION_METADATA, handler),
      ).toBe(operation);
    },
  );

  it('does not attach the provider-call limit to AI routes that do not call the provider', () => {
    const handler = handlerMetadata('startAiConversation');
    const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as
      | unknown[]
      | undefined;

    expect(guards).toEqual([AuthGuard]);
    expect(
      Reflect.hasMetadata(MIMO_HIGH_COST_OPERATION_METADATA, handler),
    ).toBe(false);
  });

  it('uses the authenticated user and route operation in production', async () => {
    process.env.NODE_ENV = 'production';
    const gate = {
      consumeUserOperationRateLimit: jest.fn().mockResolvedValue(undefined),
    };
    const handler = handlerMetadata('createAssessmentSpeechTranscript');
    const guard = new MimoHighCostRateLimitGuard(
      new Reflector(),
      gate as unknown as MimoUsageGate,
    );

    await expect(guard.canActivate(executionContext(handler))).resolves.toBe(
      true,
    );
    expect(gate.consumeUserOperationRateLimit).toHaveBeenCalledWith({
      userId: 'authenticated-user-1',
      operation: 'speech',
    });
  });

  it('propagates the shared KV 429 before the controller handler runs', async () => {
    process.env.NODE_ENV = 'production';
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const gate = {
      consumeUserOperationRateLimit: jest
        .fn()
        .mockRejectedValue(new MimoHighCostRateLimitExceededException()),
    };
    const guard = new MimoHighCostRateLimitGuard(
      new Reflector(),
      gate as unknown as MimoUsageGate,
    );

    await expect(
      guard.canActivate(
        executionContext(handlerMetadata('createTtsSpeechOutput')),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      eventCode: 'mimo.high_cost.rejected',
      operation: 'tts',
      reasonCode: 'request_rate_exceeded',
    });
  });

  it('fails closed in production when the shared KV gate is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const guard = new MimoHighCostRateLimitGuard(new Reflector(), undefined);

    await expect(
      guard.canActivate(
        executionContext(handlerMetadata('createAiAssessmentDraft')),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      eventCode: 'mimo.high_cost.rejected',
      operation: 'ai',
      reasonCode: 'gate_uninitialized',
    });
  });
});
