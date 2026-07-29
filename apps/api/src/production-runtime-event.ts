export const PRODUCTION_RUNTIME_EVENT_SCHEMA =
  'rehab.production-runtime-event/v1' as const;

export const PRODUCTION_RUNTIME_EVENT_CODES = [
  'runtime.ready.failed',
  'runtime.required_secret_file.failed',
  'runtime.key_value.failed',
  'mimo.high_cost.rejected',
  'mimo.provider.failed',
  'mimo.provider.audit_write.failed',
  'mimo.provider.telemetry_write.failed',
  'provider_telemetry.retention.failed',
] as const;

type MimoOperation = 'ai' | 'speech' | 'tts';

export type ProductionRuntimeEvent =
  | {
      eventCode: 'runtime.ready.failed';
      dependency: 'database' | 'migration' | 'key_value';
      reasonCode: 'blocked' | 'unavailable';
    }
  | {
      eventCode: 'runtime.required_secret_file.failed';
      secretFile: 'mimo_api_key' | 'sensitive_data_key';
      reasonCode: 'missing_or_invalid';
    }
  | {
      eventCode: 'runtime.key_value.failed';
      stage: 'configuration' | 'readiness';
      reasonCode: 'missing_or_invalid' | 'unavailable';
    }
  | {
      eventCode: 'mimo.high_cost.rejected';
      operation: MimoOperation;
      reasonCode:
        | 'request_rate_exceeded'
        | 'quota_exceeded'
        | 'duplicate_or_invalid_request'
        | 'key_value_unavailable'
        | 'gate_uninitialized'
        | 'scope_unavailable';
    }
  | {
      eventCode: 'mimo.provider.failed';
      operation: MimoOperation;
      failureStage: 'provider_call' | 'provider_response_validation';
    }
  | {
      eventCode: 'mimo.provider.audit_write.failed';
      operation: MimoOperation;
    }
  | {
      eventCode: 'mimo.provider.telemetry_write.failed';
      operation: MimoOperation;
    }
  | {
      eventCode: 'provider_telemetry.retention.failed';
      failureCode:
        | 'database_operation_failed'
        | 'execution_timeout'
        | 'failure_audit_unavailable'
        | 'retention_job_unavailable';
    };

type RuntimeEventOutput = Pick<NodeJS.WriteStream, 'write'>;

type EmitProductionRuntimeEventOptions = {
  environment?: NodeJS.ProcessEnv;
  output?: RuntimeEventOutput;
};

function unsupportedProductionRuntimeEvent(): never {
  throw new Error('Unsupported production runtime event code.');
}

export function serializeProductionRuntimeEvent(
  event: ProductionRuntimeEvent,
): string {
  switch (event.eventCode) {
    case 'runtime.ready.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'api-readiness',
        dependency: event.dependency,
        reasonCode: event.reasonCode,
      });
    case 'runtime.required_secret_file.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'api-bootstrap',
        secretFile: event.secretFile,
        reasonCode: event.reasonCode,
      });
    case 'runtime.key_value.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'mimo-usage-gate',
        stage: event.stage,
        reasonCode: event.reasonCode,
      });
    case 'mimo.high_cost.rejected':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'warning',
        component: 'mimo-usage-gate',
        operation: event.operation,
        reasonCode: event.reasonCode,
      });
    case 'mimo.provider.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'mimo-provider',
        operation: event.operation,
        failureStage: event.failureStage,
      });
    case 'mimo.provider.audit_write.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'mimo-provider-audit',
        operation: event.operation,
      });
    case 'mimo.provider.telemetry_write.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'mimo-provider-telemetry',
        operation: event.operation,
      });
    case 'provider_telemetry.retention.failed':
      return JSON.stringify({
        schema: PRODUCTION_RUNTIME_EVENT_SCHEMA,
        eventCode: event.eventCode,
        severity: 'error',
        component: 'provider-telemetry-retention',
        failureCode: event.failureCode,
      });
    default:
      return unsupportedProductionRuntimeEvent();
  }
}

export function emitProductionRuntimeEvent(
  event: ProductionRuntimeEvent,
  options: EmitProductionRuntimeEventOptions = {},
) {
  if ((options.environment ?? process.env).NODE_ENV !== 'production') {
    return false;
  }
  (options.output ?? process.stderr).write(
    `${serializeProductionRuntimeEvent(event)}\n`,
  );
  return true;
}
