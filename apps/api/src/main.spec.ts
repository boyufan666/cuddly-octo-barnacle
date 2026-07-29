import { json, urlencoded } from 'express';
import { NestFactory } from '@nestjs/core';
import {
  bootstrap,
  configureCors,
  configureRequestBodyLimits,
  emitProductionConfigurationFailureEvent,
} from './main';
import {
  API_REQUEST_BODY_LIMIT_BYTES,
  MAX_STT_DECODED_AUDIO_BYTES,
  ProductionRuntimeDependencyConfigurationError,
  STT_REQUEST_METADATA_BUDGET_BYTES,
} from './config';

jest.mock('express', () => ({
  json: jest.fn(() => 'json-parser'),
  urlencoded: jest.fn(() => 'urlencoded-parser'),
}));

describe('configureRequestBodyLimits', () => {
  it('sets explicit request body limits for provider-ready speech audio payloads', () => {
    const app = {
      use: jest.fn(),
    };

    configureRequestBodyLimits(app as never);

    expect(json).toHaveBeenCalledWith({ limit: API_REQUEST_BODY_LIMIT_BYTES });
    expect(urlencoded).toHaveBeenCalledWith({
      extended: true,
      limit: API_REQUEST_BODY_LIMIT_BYTES,
    });
    expect(app.use).toHaveBeenNthCalledWith(1, 'json-parser');
    expect(app.use).toHaveBeenNthCalledWith(2, 'urlencoded-parser');
  });

  it('reserves enough of the 16 MiB JSON boundary for approved audio Base64 expansion', () => {
    const maximumBase64Bytes = 4 * Math.ceil(MAX_STT_DECODED_AUDIO_BYTES / 3);

    expect(maximumBase64Bytes + STT_REQUEST_METADATA_BUDGET_BYTES).toBe(
      API_REQUEST_BODY_LIMIT_BYTES,
    );
  });
});

describe('configureCors', () => {
  it('exposes attachment filename headers for browser data exports', () => {
    const app = {
      enableCors: jest.fn(),
    };

    configureCors(app as never, 'http://localhost:3000');

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'http://localhost:3000',
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    });
  });
});

describe('bootstrap authentication configuration', () => {
  it.each([
    ['sensitive_data_key', 'runtime.required_secret_file.failed'],
    ['mimo_api_key', 'runtime.required_secret_file.failed'],
    ['key_value', 'runtime.key_value.failed'],
  ] as const)(
    'emits a minimal production event for %s configuration failure',
    (dependency, eventCode) => {
      const originalNodeEnvironment = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      try {
        expect(
          emitProductionConfigurationFailureEvent(
            new ProductionRuntimeDependencyConfigurationError(
              dependency,
              new Error('sensitive failure detail must not be logged'),
            ),
          ),
        ).toBe(true);
        expect(stderr).toHaveBeenCalledTimes(1);
        const line = String(stderr.mock.calls[0]?.[0]);
        expect(JSON.parse(line)).toMatchObject({ eventCode });
        expect(line).not.toContain('sensitive failure detail');
      } finally {
        stderr.mockRestore();
        if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnvironment;
      }
    },
  );

  it('hard-fails a weak JWT secret before creating the application', async () => {
    process.env.JWT_SECRET = 'weak-secret';
    const create = jest
      .spyOn(NestFactory, 'create')
      .mockRejectedValue(new Error('NestFactory must not run'));

    await expect(bootstrap()).rejects.toThrow(/32 UTF-8 bytes/);
    expect(create).not.toHaveBeenCalled();

    create.mockRestore();
  });

  it('hard-fails a missing COOKIE_SECURE setting before creating the application', async () => {
    process.env.JWT_SECRET = 'unit-test-session-secret-with-at-least-32-bytes';
    delete process.env.COOKIE_SECURE;
    const create = jest
      .spyOn(NestFactory, 'create')
      .mockRejectedValue(new Error('NestFactory must not run'));

    await expect(bootstrap()).rejects.toThrow(
      /COOKIE_SECURE must be exactly true or false/,
    );
    expect(create).not.toHaveBeenCalled();

    create.mockRestore();
  });

  it('hard-fails missing sensitive encryption key material before creating the application', async () => {
    process.env.JWT_SECRET = 'unit-test-session-secret-with-at-least-32-bytes';
    process.env.COOKIE_SECURE = 'false';
    delete process.env.SENSITIVE_DATA_KEY_REF;
    delete process.env.SENSITIVE_DATA_KEY;
    const create = jest
      .spyOn(NestFactory, 'create')
      .mockRejectedValue(new Error('NestFactory must not run'));

    await expect(bootstrap()).rejects.toThrow(/SENSITIVE_DATA_KEY_REF/);
    expect(create).not.toHaveBeenCalled();

    create.mockRestore();
  });
});
