import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { PasswordResetGuard } from './password-reset.guard';
import { CsrfGuard } from './csrf.guard';
import { sensitiveEncryptionKeyProvider } from './config';
import {
  createMimoUsageGate,
  loadMimoUsageGateConfig,
  MIMO_USAGE_GATE,
} from './mimo-usage-gate';
import { RuntimeReadinessService } from './runtime-readiness.service';
import { ProviderTelemetryService } from './provider-telemetry.service';
import { MimoHighCostRateLimitGuard } from './mimo-high-cost-rate-limit.guard';
import { ProviderOperationService } from './provider-operation.service';

const PUBLIC_CREDENTIAL_THROTTLER_NAME = 'public-credential';
const PUBLIC_CREDENTIAL_THROTTLE_LIMIT_ENV = 'PUBLIC_CREDENTIAL_THROTTLE_LIMIT';
const PUBLIC_CREDENTIAL_THROTTLE_TTL_ENV = 'PUBLIC_CREDENTIAL_THROTTLE_TTL_MS';

function requirePositiveSafeInteger(
  env: NodeJS.ProcessEnv,
  name: string,
): number {
  const rawValue = env[name];
  if (rawValue === undefined || !/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(
      `${name} must be a positive safe integer expressed in base-10 digits.`,
    );
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `${name} must be a positive safe integer expressed in base-10 digits.`,
    );
  }
  return value;
}

export function loadPublicCredentialThrottleConfig(env: NodeJS.ProcessEnv) {
  return {
    limit: requirePositiveSafeInteger(
      env,
      PUBLIC_CREDENTIAL_THROTTLE_LIMIT_ENV,
    ),
    ttl: requirePositiveSafeInteger(env, PUBLIC_CREDENTIAL_THROTTLE_TTL_ENV),
  };
}

const mimoUsageGateProvider = {
  provide: MIMO_USAGE_GATE,
  useFactory: () =>
    process.env.NODE_ENV === 'production'
      ? createMimoUsageGate(loadMimoUsageGateConfig(process.env))
      : undefined,
};

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          name: PUBLIC_CREDENTIAL_THROTTLER_NAME,
          ...loadPublicCredentialThrottleConfig(process.env),
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    ThrottlerGuard,
    PasswordResetGuard,
    CsrfGuard,
    sensitiveEncryptionKeyProvider,
    mimoUsageGateProvider,
    RuntimeReadinessService,
    ProviderTelemetryService,
    ProviderOperationService,
    MimoHighCostRateLimitGuard,
  ],
})
export class AppModule {}
