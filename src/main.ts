import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { BODY_LIMIT_BYTES } from '@shared/constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // bodyLimit: защита от DoS через огромные payload
    new FastifyAdapter({ logger: false, bodyLimit: BODY_LIMIT_BYTES }),
  );

  // Security headers: X-Content-Type-Options, X-Frame-Options, HSTS и др.
  // CSP отключён в development — Swagger UI требует inline scripts
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // Cookie support — требуется для HttpOnly JWT cookie
  await app.register(fastifyCookie);

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS_ORIGIN обязателен в env (см. env.validation.ts) — без fallback на '*'
  const corsOrigin = process.env.CORS_ORIGIN!;
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Swagger только в development — в production не доступен
  if (process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('LogHub API')
      .setDescription('Централизованный сервис сбора и публикации error-логов')
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`LogHub запущен на порту ${port}`);

  warnProductionSecurityIssues(logger);
}

/**
 * Предупреждает о небезопасной конфигурации в production.
 * Не прерывает запуск — только логирует WARNING.
 */
function warnProductionSecurityIssues(logger: Logger): void {
  if (process.env.NODE_ENV !== 'production') return;

  const redisUrl = process.env.REDIS_URL ?? '';
  try {
    const parsed = new URL(redisUrl);
    if (!parsed.password) {
      logger.warn(
        'SECURITY: REDIS_URL не содержит пароль — рекомендуется аутентификация в production',
      );
    }
  } catch {
    logger.warn('SECURITY: REDIS_URL не является валидным URL');
  }

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('sslmode=require') && !dbUrl.includes('ssl=true')) {
    logger.warn(
      'SECURITY: DATABASE_URL не содержит параметры SSL — рекомендуется ?sslmode=require в production',
    );
  }
}

void bootstrap();
