import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import {
  API_REQUEST_BODY_LIMIT_BYTES,
  ProductionRuntimeDependencyConfigurationError,
  requireCookieSecure,
  requireEnv,
  requireListenPort,
  requireSensitiveEncryptionKey,
  requireStrongJwtSecret,
  validateProductionRuntimeConfiguration,
} from './config';
import { emitProductionRuntimeEvent } from './production-runtime-event';

export function emitProductionConfigurationFailureEvent(error: unknown) {
  if (!(error instanceof ProductionRuntimeDependencyConfigurationError)) {
    return false;
  }
  if (error.dependency === 'key_value') {
    return emitProductionRuntimeEvent({
      eventCode: 'runtime.key_value.failed',
      stage: 'configuration',
      reasonCode: 'missing_or_invalid',
    });
  }
  return emitProductionRuntimeEvent({
    eventCode: 'runtime.required_secret_file.failed',
    secretFile: error.dependency,
    reasonCode: 'missing_or_invalid',
  });
}

export function configureRequestBodyLimits(app: Pick<INestApplication, 'use'>) {
  app.use(json({ limit: API_REQUEST_BODY_LIMIT_BYTES }));
  app.use(urlencoded({ extended: true, limit: API_REQUEST_BODY_LIMIT_BYTES }));
}

export function configureCors(
  app: Pick<INestApplication, 'enableCors'>,
  origin: string,
) {
  app.enableCors({
    origin,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });
}

export async function bootstrap() {
  requireStrongJwtSecret();
  requireCookieSecure();
  try {
    requireSensitiveEncryptionKey();
  } catch (error) {
    emitProductionConfigurationFailureEvent(
      new ProductionRuntimeDependencyConfigurationError(
        'sensitive_data_key',
        error,
      ),
    );
    throw error;
  }
  try {
    validateProductionRuntimeConfiguration();
  } catch (error) {
    emitProductionConfigurationFailureEvent(error);
    throw error;
  }
  const app = await NestFactory.create(AppModule);
  configureRequestBodyLimits(app);
  configureCors(app, requireEnv('WEB_ORIGIN'));
  const listenHost =
    process.env.DEPLOYMENT_MODE === 'single-host' ? '127.0.0.1' : '0.0.0.0';
  await app.listen(requireListenPort(), listenHost);
}

if (require.main === module) {
  void bootstrap();
}
