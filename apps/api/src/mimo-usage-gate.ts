import {
  ConflictException,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

export const MIMO_USAGE_GATE = 'MIMO_USAGE_GATE';

export class MimoQuotaExceededException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class MimoHighCostRateLimitExceededException extends HttpException {
  constructor() {
    super(
      '高成本供应商调用请求过于频繁，请在限流窗口结束后重试。',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export type MimoUsageOperation = 'ai' | 'speech' | 'tts';

export type MimoUsageScope = {
  userId: string;
  patientId: string;
  organizationId: string;
};

export type MimoUsageGateConfig = {
  url: string;
  keyPrefix: string;
  windowMs: number;
  probeTimeoutMs: number;
  userRequestLimit: number;
  patientRequestLimit: number;
  organizationRequestLimit: number;
  speechSecondsLimit: number;
  ttsCharactersLimit: number;
  userBudgetUnitsLimit: number;
  patientBudgetUnitsLimit: number;
  organizationBudgetUnitsLimit: number;
  aiCostUnitsPerRequest: number;
  speechCostUnitsPerSecond: number;
  ttsCostUnitsPerCharacter: number;
  highCostUserOperationRequestLimit: number;
  highCostUserOperationWindowMs: number;
};

type KeyValueClient = {
  status?: string;
  connect?: () => Promise<unknown>;
  eval(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown>;
  quit?: () => Promise<unknown>;
};

type MimoUsageRequest = {
  operation: MimoUsageOperation;
  scope: MimoUsageScope;
  idempotencyKey: string;
  quantity?: number;
};

const validIdempotencyKey = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

/**
 * High-cost operation records and the quota gate must accept exactly the same
 * caller-supplied key, before either side effects are written.
 */
export function requireMimoUsageIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !validIdempotencyKey.test(value)) {
    throw new ConflictException('高成本调用必须使用有效的幂等键。');
  }
  return value;
}

const usageGateLua = `
local idempotencyKey = KEYS[1]
if redis.call('EXISTS', idempotencyKey) == 1 then
  return {2, 'duplicate'}
end

local ttl = tonumber(ARGV[1])
local userRequestLimit = tonumber(ARGV[2])
local patientRequestLimit = tonumber(ARGV[3])
local organizationRequestLimit = tonumber(ARGV[4])
local operationLimit = tonumber(ARGV[5])
local operationQuantity = tonumber(ARGV[6])
local userBudgetLimit = tonumber(ARGV[7])
local patientBudgetLimit = tonumber(ARGV[8])
local organizationBudgetLimit = tonumber(ARGV[9])
local costUnits = tonumber(ARGV[10])

local function overLimit(key, increment, limit)
  if limit <= 0 then
    return false
  end
  local current = tonumber(redis.call('GET', key) or '0')
  return current + increment > limit
end

if overLimit(KEYS[2], 1, userRequestLimit) then return {0, 'user_request_limit'} end
if overLimit(KEYS[3], 1, patientRequestLimit) then return {0, 'patient_request_limit'} end
if overLimit(KEYS[4], 1, organizationRequestLimit) then return {0, 'organization_request_limit'} end
if overLimit(KEYS[5], operationQuantity, operationLimit) then return {0, 'operation_limit'} end
if overLimit(KEYS[6], costUnits, userBudgetLimit) then return {0, 'user_budget_limit'} end
if overLimit(KEYS[7], costUnits, patientBudgetLimit) then return {0, 'patient_budget_limit'} end
if overLimit(KEYS[8], costUnits, organizationBudgetLimit) then return {0, 'organization_budget_limit'} end

redis.call('SET', idempotencyKey, 'reserved', 'PX', ttl)
for _, key in ipairs({KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8]}) do
  redis.call('INCRBY', key, 0)
  redis.call('PEXPIRE', key, ttl)
end
redis.call('INCRBY', KEYS[2], 1)
redis.call('INCRBY', KEYS[3], 1)
redis.call('INCRBY', KEYS[4], 1)
if operationQuantity > 0 then redis.call('INCRBY', KEYS[5], operationQuantity) end
if costUnits > 0 then
  redis.call('INCRBY', KEYS[6], costUnits)
  redis.call('INCRBY', KEYS[7], costUnits)
  redis.call('INCRBY', KEYS[8], costUnits)
end
return {1, 'reserved'}
`;

const readinessProbeLua = `
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return redis.call('GET', KEYS[1])
`;

const highCostUserOperationRateLimitLua = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
  return {0, current}
end
return {1, current}
`;

function requirePositiveSafeInteger(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function requireKeyValueUrl(env: NodeJS.ProcessEnv) {
  const value = env.MIMO_KEY_VALUE_URL;
  if (!value || value.trim() !== value) {
    throw new Error('MIMO_KEY_VALUE_URL must be an exact non-empty URL.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('MIMO_KEY_VALUE_URL must be a valid redis or rediss URL.');
  }
  if (
    (url.protocol !== 'redis:' && url.protocol !== 'rediss:') ||
    !url.hostname
  ) {
    throw new Error('MIMO_KEY_VALUE_URL must be a valid redis or rediss URL.');
  }
  return value;
}

export function loadMimoUsageGateConfig(
  env: NodeJS.ProcessEnv = process.env,
): MimoUsageGateConfig {
  const keyPrefix = env.MIMO_USAGE_KEY_PREFIX;
  if (!keyPrefix || keyPrefix.trim() !== keyPrefix) {
    throw new Error('MIMO_USAGE_KEY_PREFIX must be an exact non-empty value.');
  }
  return {
    url: requireKeyValueUrl(env),
    keyPrefix,
    windowMs: requirePositiveSafeInteger(env, 'MIMO_USAGE_WINDOW_MS'),
    probeTimeoutMs: requirePositiveSafeInteger(
      env,
      'MIMO_KEY_VALUE_PROBE_TIMEOUT_MS',
    ),
    userRequestLimit: requirePositiveSafeInteger(
      env,
      'MIMO_USER_REQUEST_LIMIT',
    ),
    patientRequestLimit: requirePositiveSafeInteger(
      env,
      'MIMO_PATIENT_REQUEST_LIMIT',
    ),
    organizationRequestLimit: requirePositiveSafeInteger(
      env,
      'MIMO_ORGANIZATION_REQUEST_LIMIT',
    ),
    speechSecondsLimit: requirePositiveSafeInteger(
      env,
      'MIMO_SPEECH_SECONDS_LIMIT',
    ),
    ttsCharactersLimit: requirePositiveSafeInteger(
      env,
      'MIMO_TTS_CHARACTERS_LIMIT',
    ),
    userBudgetUnitsLimit: requirePositiveSafeInteger(
      env,
      'MIMO_USER_BUDGET_UNITS_LIMIT',
    ),
    patientBudgetUnitsLimit: requirePositiveSafeInteger(
      env,
      'MIMO_PATIENT_BUDGET_UNITS_LIMIT',
    ),
    organizationBudgetUnitsLimit: requirePositiveSafeInteger(
      env,
      'MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT',
    ),
    aiCostUnitsPerRequest: requirePositiveSafeInteger(
      env,
      'MIMO_AI_COST_UNITS_PER_REQUEST',
    ),
    speechCostUnitsPerSecond: requirePositiveSafeInteger(
      env,
      'MIMO_SPEECH_COST_UNITS_PER_SECOND',
    ),
    ttsCostUnitsPerCharacter: requirePositiveSafeInteger(
      env,
      'MIMO_TTS_COST_UNITS_PER_CHARACTER',
    ),
    highCostUserOperationRequestLimit: requirePositiveSafeInteger(
      env,
      'MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT',
    ),
    highCostUserOperationWindowMs: requirePositiveSafeInteger(
      env,
      'MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS',
    ),
  };
}

export function createMimoUsageGate(
  config: MimoUsageGateConfig,
  client: KeyValueClient = new Redis(config.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    connectTimeout: config.probeTimeoutMs,
  }),
) {
  return new MimoUsageGate(config, client);
}

export class MimoUsageGate implements OnModuleDestroy {
  private connectionAttempt: Promise<void> | undefined;

  constructor(
    private readonly config: MimoUsageGateConfig,
    private readonly client: KeyValueClient,
  ) {}

  async assertReady() {
    const nonce = randomUUID();
    const probeKey = `${this.config.keyPrefix}:readiness:${nonce}`;
    const value = await this.execute(
      readinessProbeLua,
      1,
      probeKey,
      nonce,
      String(this.config.probeTimeoutMs),
    );
    if (value !== nonce) {
      throw new ServiceUnavailableException(
        '共享 AI 配额服务不可用，已阻断高成本供应商调用。',
      );
    }
  }

  async reserve(request: MimoUsageRequest) {
    requireMimoUsageIdempotencyKey(request.idempotencyKey);
    const quantity = this.operationQuantity(request);
    const costUnits = this.costUnits(request.operation, quantity);
    const operationLimit = this.operationLimit(request.operation);
    const operationKey = `${this.config.keyPrefix}:operation:${request.operation}:organization:${request.scope.organizationId}`;
    const keyPrefix = `${this.config.keyPrefix}:window`;
    const response = await this.execute(
      usageGateLua,
      8,
      `${keyPrefix}:idempotency:${request.operation}:organization:${request.scope.organizationId}:patient:${request.scope.patientId}:user:${request.scope.userId}:${request.idempotencyKey}`,
      `${keyPrefix}:request:user:${request.scope.userId}`,
      `${keyPrefix}:request:patient:${request.scope.patientId}`,
      `${keyPrefix}:request:organization:${request.scope.organizationId}`,
      operationKey,
      `${keyPrefix}:budget:user:${request.scope.userId}`,
      `${keyPrefix}:budget:patient:${request.scope.patientId}`,
      `${keyPrefix}:budget:organization:${request.scope.organizationId}`,
      String(this.config.windowMs),
      String(this.config.userRequestLimit),
      String(this.config.patientRequestLimit),
      String(this.config.organizationRequestLimit),
      String(operationLimit),
      String(quantity),
      String(this.config.userBudgetUnitsLimit),
      String(this.config.patientBudgetUnitsLimit),
      String(this.config.organizationBudgetUnitsLimit),
      String(costUnits),
    );
    const [status, reason] = this.parseReservationResponse(response);
    if (status === 1) return;
    if (status === 2) {
      throw new ConflictException('该高成本调用已提交，不能重复执行。');
    }
    throw new MimoQuotaExceededException(
      `高成本调用已被共享配额阻断：${reason}。`,
    );
  }

  async consumeUserOperationRateLimit(input: {
    userId: string;
    operation: MimoUsageOperation;
  }) {
    const response = await this.execute(
      highCostUserOperationRateLimitLua,
      1,
      `${this.config.keyPrefix}:request-rate:user:${input.userId}:operation:${input.operation}`,
      String(this.config.highCostUserOperationRequestLimit),
      String(this.config.highCostUserOperationWindowMs),
    );
    if (
      !Array.isArray(response) ||
      response.length !== 2 ||
      Number(response[0]) !== 1 ||
      !Number.isSafeInteger(Number(response[1]))
    ) {
      if (
        Array.isArray(response) &&
        response.length === 2 &&
        Number(response[0]) === 0 &&
        Number.isSafeInteger(Number(response[1]))
      ) {
        throw new MimoHighCostRateLimitExceededException();
      }
      throw new ServiceUnavailableException(
        '共享高成本请求限流服务响应无效，已阻断供应商调用。',
      );
    }
  }

  async close() {
    await this.client.quit?.();
  }

  async onModuleDestroy() {
    await this.close();
  }

  private operationQuantity(request: MimoUsageRequest) {
    if (request.operation === 'ai') return 0;
    const quantity = request.quantity;
    if (
      !Number.isSafeInteger(quantity) ||
      quantity === undefined ||
      quantity < 1
    ) {
      throw new ConflictException('高成本调用缺少有效计量单位。');
    }
    return quantity;
  }

  private operationLimit(operation: MimoUsageOperation) {
    if (operation === 'speech') return this.config.speechSecondsLimit;
    if (operation === 'tts') return this.config.ttsCharactersLimit;
    return 0;
  }

  private costUnits(operation: MimoUsageOperation, quantity: number) {
    const multiplier =
      operation === 'ai'
        ? this.config.aiCostUnitsPerRequest
        : operation === 'speech'
          ? this.config.speechCostUnitsPerSecond
          : this.config.ttsCostUnitsPerCharacter;
    const units = (operation === 'ai' ? 1 : quantity) * multiplier;
    if (!Number.isSafeInteger(units) || units < 1) {
      throw new ConflictException('高成本调用计费单位无效。');
    }
    return units;
  }

  private parseReservationResponse(value: unknown): [number, string] {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new ServiceUnavailableException(
        '共享 AI 配额服务响应无效，已阻断高成本供应商调用。',
      );
    }
    const status = Number(value[0]);
    const reason = String(value[1]);
    if (!Number.isInteger(status) || !reason) {
      throw new ServiceUnavailableException(
        '共享 AI 配额服务响应无效，已阻断高成本供应商调用。',
      );
    }
    return [status, reason];
  }

  private async execute(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ) {
    try {
      await this.ensureConnected();
      return await this.withTimeout(
        this.client.eval(script, numberOfKeys, ...args),
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        '共享 AI 配额服务不可用，已阻断高成本供应商调用。',
      );
    }
  }

  private async ensureConnected() {
    if (!this.client.connect || this.client.status === undefined) {
      return;
    }
    if (this.client.status === 'ready') return;
    if (this.connectionAttempt) {
      await this.connectionAttempt;
      return;
    }
    if (this.client.status !== 'wait' && this.client.status !== 'end') {
      throw new ServiceUnavailableException(
        '共享 AI 配额服务不可用，已阻断高成本供应商调用。',
      );
    }
    if (!this.connectionAttempt) {
      this.connectionAttempt = this.withTimeout(this.client.connect())
        .then(() => undefined)
        .finally(() => {
          this.connectionAttempt = undefined;
        });
    }
    await this.connectionAttempt;
  }

  private async withTimeout<T>(operation: Promise<T>) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new ServiceUnavailableException(
                  '共享 AI 配额服务不可用，已阻断高成本供应商调用。',
                ),
              ),
            this.config.probeTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}
