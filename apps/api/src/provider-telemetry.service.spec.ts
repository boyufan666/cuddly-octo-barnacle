import { ProviderTelemetryService } from './provider-telemetry.service';

describe('ProviderTelemetryService', () => {
  it('stores only minimal provider evidence and derives an endpoint host', async () => {
    const prisma = {
      providerCallTelemetry: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ProviderTelemetryService(prisma as never);

    await service.record({
      actorUserId: 'actor-001',
      patientId: 'patient-001',
      operation: 'tts',
      provider: 'xiaomi-mimo-tts',
      modelVersion: 'mimo-v2.5-tts',
      endpoint: 'https://mimo.customer.example/v1/chat/completions',
      apiKeyRef: 'secret-manager://rehab/mimo-v1',
      callId: 'call-001',
      requestId: 'request-001',
      statusCategory: 'provider_success',
      durationMs: 123,
      requestContentHash: 'request-hash',
      responseContentHash: 'response-hash',
    });

    expect(prisma.providerCallTelemetry.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'actor-001',
        patientId: 'patient-001',
        operation: 'tts',
        provider: 'xiaomi-mimo-tts',
        modelVersion: 'mimo-v2.5-tts',
        endpointHost: 'mimo.customer.example',
        apiKeyRef: 'secret-manager://rehab/mimo-v1',
        promptVersion: undefined,
        callId: 'call-001',
        requestId: 'request-001',
        statusCategory: 'provider_success',
        durationMs: 123,
        requestContentHash: 'request-hash',
        responseContentHash: 'response-hash',
      },
    });
  });
});
