# Руководство по интеграции

## Статус SDK

Пакет `@besales/loghub-client` реализован в репозитории (`packages/loghub-client/`). Подробная документация — в [README пакета](../packages/loghub-client/README.md). После публикации на npm станет доступен через `yarn add`. Для интеграции без SDK см. раздел [HTTP-интеграция](#http-интеграция-альтернатива-без-sdk) в конце документа.

## Установка

```bash
yarn add @besales/loghub-client
# или
npm install @besales/loghub-client
```

## Quick Start

```typescript
import { LogHubClient } from '@besales/loghub-client';

const loghub = new LogHubClient({
  endpoint: 'https://loghub.example.com',
  apiKey: 'sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // ← ваш API-ключ
});

await loghub.error('Cannot connect to database', {
  stackTrace: error.stack,
  metadata: { userId: 'usr_123', requestId: 'req_456' },
});
```

## Конфигурация

```typescript
interface LogHubClientOptions {
  /** URL LogHub-сервиса (без trailing slash) */
  endpoint: string;
  /** API-ключ сервиса */
  apiKey: string;
  /** Таймаут запроса в мс (по умолчанию 5000) */
  timeout?: number;
  /** Количество retry при сетевых ошибках (по умолчанию 2) */
  retries?: number;
  /** Задержка между retry в мс (по умолчанию 1000) */
  retryDelay?: number;
  /** Callback при ошибке отправки (по умолчанию console.error) */
  onError?: (error: Error) => void;
}
```

## API методы

```typescript
class LogHubClient {
  log(level: LogLevel, message: string, options?: LogOptions): Promise<LogResponse>;
  debug(message: string, options?: LogOptions): Promise<LogResponse>;
  info(message: string, options?: LogOptions): Promise<LogResponse>;
  warn(message: string, options?: LogOptions): Promise<LogResponse>;
  error(message: string, options?: LogOptions): Promise<LogResponse>;
  fatal(message: string, options?: LogOptions): Promise<LogResponse>;
}

interface LogOptions {
  stackTrace?: string;
  metadata?: Record<string, unknown>;
}

interface LogResponse {
  id: string;
  fingerprint: string;
  deduplicated: boolean;
}
```

## NestJS интеграция

### Модуль

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogHubClient } from '@besales/loghub-client';

const LOGHUB_CLIENT = 'LOGHUB_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: LOGHUB_CLIENT,
      useFactory: (config: ConfigService) => {
        return new LogHubClient({
          endpoint: config.getOrThrow('LOGHUB_ENDPOINT'),
          apiKey: config.getOrThrow('LOGHUB_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [LOGHUB_CLIENT],
})
export class LogHubModule {}
```

### Использование в сервисе

```typescript
@Injectable()
export class PaymentService {
  constructor(
    @Inject('LOGHUB_CLIENT') private readonly loghub: LogHubClient,
  ) {}

  async processPayment(dto: PaymentDto): Promise<void> {
    try {
      // ... бизнес-логика ...
    } catch (error) {
      await this.loghub.error('Payment processing failed', {
        stackTrace: error instanceof Error ? error.stack : undefined,
        metadata: { paymentId: dto.id, amount: dto.amount },
      });
      throw error;
    }
  }
}
```

### Глобальный exception filter

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Inject } from '@nestjs/common';
import { LogHubClient } from '@besales/loghub-client';

@Catch()
export class GlobalExceptionLogHubFilter implements ExceptionFilter {
  constructor(
    @Inject('LOGHUB_CLIENT') private readonly loghub: LogHubClient,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : 500;

    // Отправляем в LogHub только 5xx ошибки
    if (status >= 500) {
      const error = exception instanceof Error ? exception : new Error(String(exception));

      // Fire-and-forget: не блокируем ответ
      this.loghub.error(error.message, {
        stackTrace: error.stack,
        metadata: {
          method: request.method,
          url: request.url,
          statusCode: status,
        },
      }).catch(() => {});
    }

    response.status(status).send({
      statusCode: status,
      message: exception instanceof HttpException
        ? exception.message
        : 'Internal server error',
    });
  }
}
```

## Express интеграция

```typescript
import express from 'express';
import { LogHubClient } from '@besales/loghub-client';

const app = express();
const loghub = new LogHubClient({
  endpoint: process.env.LOGHUB_ENDPOINT!,
  apiKey: process.env.LOGHUB_API_KEY!,
});

// Global error handler (должен быть последним middleware)
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  loghub.error(err.message, {
    stackTrace: err.stack,
    metadata: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    },
  }).catch(() => {});

  res.status(500).json({ error: 'Internal server error' });
});
```

## Telegram-бот интеграция

```typescript
import { Telegraf } from 'telegraf';
import { LogHubClient } from '@besales/loghub-client';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const loghub = new LogHubClient({
  endpoint: process.env.LOGHUB_ENDPOINT!,
  apiKey: process.env.LOGHUB_API_KEY!,
});

bot.catch((error, ctx) => {
  loghub.error(error instanceof Error ? error.message : 'Unknown bot error', {
    stackTrace: error instanceof Error ? error.stack : undefined,
    metadata: {
      updateType: ctx.updateType,
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
    },
  }).catch(() => {});
});
```

## Уровни логирования

| Уровень | Описание | Когда использовать |
|---------|----------|--------------------|
| `DEBUG` | Отладочная информация | Детальные данные для диагностики |
| `INFO` | Информационное сообщение | Значимые события (запуск, миграция) |
| `WARN` | Предупреждение | Потенциальные проблемы (высокая нагрузка) |
| `ERROR` | Ошибка | Ошибки, требующие внимания |
| `FATAL` | Критическая ошибка | Сбой, требующий немедленного вмешательства |

## Лимиты

| Параметр | Значение |
|----------|----------|
| `message` | Макс. 2000 символов |
| `stackTrace` | Макс. 10 000 символов |
| `metadata` | Макс. 50KB (JSON) |
| Окно дедупликации | 3 минуты (одинаковые ошибки подавляются) |
| Размер тела запроса | Макс. 1MB |

## HTTP-интеграция (альтернатива без SDK)

Для интеграции без установки SDK-пакета можно использовать прямые HTTP-вызовы.

### Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `LOGHUB_ENDPOINT` | URL сервиса LogHub | `https://loghub.example.com` |
| `LOGHUB_API_KEY` | API-ключ сервиса | `sk_live_a1b2c3d4...` |

### curl

```bash
curl -X POST https://loghub.example.com/api/logs/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "level": "ERROR",
    "message": "Connection timeout",
    "stackTrace": "Error: Connection timeout\n    at DbService.connect",
    "metadata": { "userId": "usr_123" }
  }'
```

### TypeScript (fetch)

```typescript
const response = await fetch(`${process.env.LOGHUB_ENDPOINT}/api/logs/ingest`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.LOGHUB_API_KEY!,
  },
  body: JSON.stringify({
    level: 'ERROR',
    message: error.message,
    stackTrace: error.stack,
    metadata: { requestId: 'req_123' },
  }),
});

const result = await response.json();
// { id: "clxyz...", fingerprint: "a1b2c3...", deduplicated: false }
```
