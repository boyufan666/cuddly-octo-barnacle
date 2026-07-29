import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type ProviderTelemetryRecord = {
  actorUserId?: string;
  patientId?: string;
  operation: 'ai' | 'speech' | 'tts';
  provider: string;
  modelVersion: string;
  endpoint: string;
  apiKeyRef: string;
  promptVersion?: string;
  callId?: string;
  requestId?: string;
  statusCategory:
    | 'provider_success'
    | 'provider_failure'
    | 'response_rejected'
    | 'quota_blocked';
  durationMs?: number;
  requestContentHash?: string;
  responseContentHash?: string;
};

@Injectable()
export class ProviderTelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(record: ProviderTelemetryRecord) {
    const endpointHost = new URL(record.endpoint).host;
    await this.prisma.providerCallTelemetry.create({
      data: {
        actorUserId: record.actorUserId,
        patientId: record.patientId,
        operation: record.operation,
        provider: record.provider,
        modelVersion: record.modelVersion,
        endpointHost,
        apiKeyRef: record.apiKeyRef,
        promptVersion: record.promptVersion,
        callId: record.callId,
        requestId: record.requestId,
        statusCategory: record.statusCategory,
        durationMs: record.durationMs,
        requestContentHash: record.requestContentHash,
        responseContentHash: record.responseContentHash,
      },
    });
  }
}
