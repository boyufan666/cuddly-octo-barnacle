import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ProviderRequestError } from './provider-request';

const providerUnavailableMessage = '供应商服务暂不可用，无法完成本次请求。';
const providerResponseRejectedMessage =
  '供应商返回的数据不符合预期格式，已拒绝处理。';

/**
 * Keeps the sanitized transport classification available to trusted service
 * code while exposing only a fixed 503 response to API callers.
 */
export class ProviderUnavailableException extends ServiceUnavailableException {
  declare readonly providerRequestError: ProviderRequestError;

  constructor(providerRequestError: ProviderRequestError) {
    super(providerUnavailableMessage);
    Object.defineProperty(this, 'providerRequestError', {
      value: providerRequestError,
      enumerable: false,
      writable: false,
    });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Marks a successful HTTP response as unusable when it violates the provider
 * response contract. It intentionally stores no raw provider payload.
 */
export class ProviderResponseRejectedException extends BadGatewayException {
  declare readonly callId?: string;

  constructor(callId?: string) {
    super(providerResponseRejectedMessage);
    Object.defineProperty(this, 'callId', {
      value: callId,
      enumerable: false,
      writable: false,
    });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
