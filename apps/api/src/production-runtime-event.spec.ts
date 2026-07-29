import {
  emitProductionRuntimeEvent,
  PRODUCTION_RUNTIME_EVENT_CODES,
  PRODUCTION_RUNTIME_EVENT_SCHEMA,
  serializeProductionRuntimeEvent,
  type ProductionRuntimeEvent,
} from './production-runtime-event';

describe('production runtime events', () => {
  const events: ProductionRuntimeEvent[] = [
    {
      eventCode: 'runtime.ready.failed',
      dependency: 'key_value',
      reasonCode: 'unavailable',
    },
    {
      eventCode: 'runtime.required_secret_file.failed',
      secretFile: 'mimo_api_key',
      reasonCode: 'missing_or_invalid',
    },
    {
      eventCode: 'runtime.key_value.failed',
      stage: 'configuration',
      reasonCode: 'missing_or_invalid',
    },
    {
      eventCode: 'mimo.high_cost.rejected',
      operation: 'speech',
      reasonCode: 'quota_exceeded',
    },
    {
      eventCode: 'mimo.provider.failed',
      operation: 'tts',
      failureStage: 'provider_call',
    },
    {
      eventCode: 'mimo.provider.audit_write.failed',
      operation: 'tts',
    },
    {
      eventCode: 'mimo.provider.telemetry_write.failed',
      operation: 'tts',
    },
    {
      eventCode: 'provider_telemetry.retention.failed',
      failureCode: 'execution_timeout',
    },
  ];

  it('serializes every alert candidate with only its allowlisted dimensions', () => {
    expect(events.map(({ eventCode }) => eventCode)).toEqual(
      PRODUCTION_RUNTIME_EVENT_CODES,
    );

    for (const event of events) {
      const payload = JSON.parse(serializeProductionRuntimeEvent(event)) as {
        schema: string;
        eventCode: string;
        severity: string;
        component: string;
      };
      expect(payload).toMatchObject({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: expect.stringMatching(/^(?:warning|error)$/) as string,
        component: expect.any(String) as string,
      });
    }
  });

  it('drops arbitrary secret, audio, input, and clinical fields instead of serializing them', () => {
    const event = {
      eventCode: 'mimo.provider.failed',
      operation: 'speech',
      failureStage: 'provider_call',
      apiKey: 'secret-value-must-not-appear',
      audio: 'raw-audio-must-not-appear',
      input: 'raw-input-must-not-appear',
      patientRecord: 'clinical-record-must-not-appear',
      error: new Error('provider error with sensitive details'),
    } as ProductionRuntimeEvent;

    expect(serializeProductionRuntimeEvent(event)).toBe(
      JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: 'mimo.provider.failed',
        severity: 'error',
        component: 'mimo-provider',
        operation: 'speech',
        failureStage: 'provider_call',
      }),
    );
  });

  it('writes one JSON line only in production and has no alternate output path', () => {
    const output = { write: jest.fn() };
    const event: ProductionRuntimeEvent = {
      eventCode: 'runtime.ready.failed',
      dependency: 'database',
      reasonCode: 'unavailable',
    };

    expect(
      emitProductionRuntimeEvent(event, {
        environment: { NODE_ENV: 'test' },
        output,
      }),
    ).toBe(false);
    expect(output.write).not.toHaveBeenCalled();

    expect(
      emitProductionRuntimeEvent(event, {
        environment: { NODE_ENV: 'production' },
        output,
      }),
    ).toBe(true);
    expect(output.write).toHaveBeenCalledTimes(1);
    expect(output.write).toHaveBeenCalledWith(
      `${serializeProductionRuntimeEvent(event)}\n`,
    );
  });

  it('fails explicitly for unsupported events and output failures', () => {
    expect(() =>
      serializeProductionRuntimeEvent({
        eventCode: 'unsupported.event',
      } as unknown as ProductionRuntimeEvent),
    ).toThrow('Unsupported production runtime event code.');

    const outputFailure = new Error('fixed output failure sentinel');
    const output = {
      write: jest.fn(() => {
        throw outputFailure;
      }),
    };
    expect(() =>
      emitProductionRuntimeEvent(events[0], {
        environment: { NODE_ENV: 'production' },
        output,
      }),
    ).toThrow(outputFailure);
    expect(output.write).toHaveBeenCalledTimes(1);
  });
});
