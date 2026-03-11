# 10 — Деплой и инфраструктура

## 10.1 Railway

Проект хостится на Railway. Docker используется ТОЛЬКО для Railway (не для локальной разработки).

## 10.2 Dockerfile

```dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Зависимости
COPY package.json yarn.lock ./
COPY prisma ./prisma/
RUN yarn install --frozen-lockfile

# Генерация Prisma Client
RUN npx prisma generate

# Сборка
COPY . .
RUN yarn build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Только production зависимости
COPY package.json yarn.lock ./
COPY prisma ./prisma/
RUN yarn install --frozen-lockfile --production && \
    npx prisma generate && \
    yarn cache clean

# Копируем собранный код
COPY --from=builder /app/dist ./dist

# Переменные окружения
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Запуск: миграции + сервер
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

## 10.3 Railway-специфичная конфигурация

### 10.3.1 railway.toml (опционально)

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 5
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### 10.3.2 Переменные окружения в Railway

Все переменные из `.env.example` (§1.11) настраиваются через Railway Dashboard → Variables:

| Variable | Источник | Примечание |
|----------|---------|-----------|
| `DATABASE_URL` | Railway PostgreSQL plugin | Автоматически при подключении |
| `REDIS_URL` | Railway Redis plugin | Автоматически при подключении |
| `TELEGRAM_BOT_TOKEN` | BotFather | Ручное |
| `TELEGRAM_FORUM_CHAT_ID` | Telegram group | Ручное |
| `ADMIN_LOGIN` | Ручное | |
| `ADMIN_PASSWORD` | Ручное | Сильный пароль |
| `ADMIN_JWT_SECRET` | Ручное | `openssl rand -hex 32` |
| `PORT` | Railway auto | Обычно 3000, Railway может переопределить |
| `NODE_ENV` | `production` | |
| `LOG_LEVEL` | `info` | |

## 10.4 Health Check Endpoint

```typescript
// Добавить в AppModule или отдельный HealthModule

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check(): Promise<{ status: string; services: Record<string, string> }> {
    const services: Record<string, string> = {};

    // PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database = 'ok';
    } catch {
      services.database = 'error';
    }

    // Redis
    try {
      await this.redis.ping();
      services.redis = 'ok';
    } catch {
      services.redis = 'error';
    }

    const allOk = Object.values(services).every((s) => s === 'ok');

    return {
      status: allOk ? 'healthy' : 'degraded',
      services,
    };
  }
}
```

## 10.5 main.ts (Bootstrap)

```typescript
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Глобальный префикс
  app.setGlobalPrefix('api');

  // Валидация
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

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  });

  // Swagger
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('LogHub API')
      .setDescription('Централизованный сервис сбора и публикации error-логов')
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`LogHub запущен на порту ${port}`);
}

bootstrap();
```

## 10.6 AppModule (app.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@prisma/prisma.module';
import { RedisModule } from '@redis/redis.module';
import { IngestionModule } from '@core/ingestion/ingestion.module';
import { DedupModule } from '@core/dedup/dedup.module';
import { ServicesModule } from '@core/services/services.module';
import { TelegramModule } from '@core/telegram/telegram.module';
import { AdminModule } from '@admin/admin.module';
import { HealthController } from './health.controller';
import { envValidationSchema } from '@config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    IngestionModule,
    DedupModule,
    ServicesModule,
    TelegramModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

## 10.7 Env Validation (config/env.validation.ts)

```typescript
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  TELEGRAM_FORUM_CHAT_ID: Joi.string().required(),
  ADMIN_LOGIN: Joi.string().min(3).required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),
  ADMIN_JWT_SECRET: Joi.string().min(32).required(),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
  CORS_ORIGIN: Joi.string().default('*'),
});
```

## 10.8 RedisModule / RedisService

```typescript
// redis/redis.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}

// redis/redis.module.ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

## 10.9 Зависимости (package.json)

```json
{
  "name": "loghub",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,test}/**/*.ts\" --fix",
    "lint:errors": "eslint \"{src,test}/**/*.ts\" --quiet",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.config.ts",
    "db:generate": "npx prisma generate",
    "db:migrate": "npx prisma migrate dev",
    "db:migrate:prod": "npx prisma migrate deploy",
    "db:seed": "npx prisma db seed",
    "db:studio": "npx prisma studio"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-fastify": "^11.0.0",
    "@nestjs/schedule": "^5.0.0",
    "@nestjs/swagger": "^8.0.0",
    "@prisma/client": "^6.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "ioredis": "^5.4.0",
    "joi": "^17.0.0",
    "jsonwebtoken": "^9.0.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/jest": "^29.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "jest": "^29.0.0",
    "prettier": "^3.0.0",
    "prisma": "^6.0.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.0.0",
    "ts-node": "^10.0.0",
    "typescript": "^5.5.0"
  }
}
```

## 10.10 Логирование (nestjs-pino)

Опционально, но рекомендуется для production:

```bash
yarn add nestjs-pino pino-http pino-pretty
```

```typescript
// В AppModule imports:
LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),
    },
  },
}),
```
