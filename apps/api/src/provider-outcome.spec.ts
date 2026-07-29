import {
  ProviderResponseRejectedException,
  ProviderUnavailableException,
} from './provider-outcome';
import { ProviderRequestError } from './provider-request';

describe('provider outcome exceptions', () => {
  it('preserves the trusted ProviderRequestError kind without serializing upstream evidence', () => {
    const transportError = new ProviderRequestError('upstream_http', {
      upstreamStatus: 503,
      upstreamRequestId: 'provider-request-001',
      upstreamBody: 'sensitive provider response body',
    });
    const exception = new ProviderUnavailableException(transportError);

    expect(exception.getStatus()).toBe(503);
    expect(exception.providerRequestError).toBe(transportError);
    expect(exception.providerRequestError.kind).toBe('upstream_http');
    expect(exception.getResponse()).toEqual({
      statusCode: 503,
      message: '供应商服务暂不可用，无法完成本次请求。',
      error: 'Service Unavailable',
    });
    expect(JSON.stringify(exception)).not.toContain('sensitive provider');
    expect(JSON.stringify(exception)).not.toContain('provider-request-001');
  });

  it('keeps provider response rejections as a fixed 502 without serializing a call ID', () => {
    const exception = new ProviderResponseRejectedException(
      'provider-call-sensitive-001',
    );

    expect(exception.getStatus()).toBe(502);
    expect(exception.callId).toBe('provider-call-sensitive-001');
    expect(exception.getResponse()).toEqual({
      statusCode: 502,
      message: '供应商返回的数据不符合预期格式，已拒绝处理。',
      error: 'Bad Gateway',
    });
    expect(JSON.stringify(exception)).not.toContain(
      'provider-call-sensitive-001',
    );
  });
});
