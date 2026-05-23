import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { requireEnv } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: requireEnv('WEB_ORIGIN'),
    credentials: true,
  });
  await app.listen(Number(requireEnv('PORT')));
}
void bootstrap();
