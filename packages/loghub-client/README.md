# @besales/loghub-client

Лёгкий TypeScript-клиент для отправки логов в [LogHub](https://github.com/be-sales/loghub). Ноль внешних зависимостей — только нативный `fetch` (Node.js >= 18).

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

## API

### Конструктор

```typescript
const client = new LogHubClient(options: LogHubClientOptions);
```

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `endpoint` | `string` | — | URL LogHub-сервиса (trailing slash удаляется) |
| `apiKey` | `string` | — | API-ключ сервиса (формат `sk_live_...`) |
| `timeout` | `number` | `5000` | Таймаут HTTP-запроса в мс |
| `retries` | `number` | `2` | Количество повторных попыток при сетевых ошибках |
| `retryDelay` | `number` | `1000` | Базовая задержка между retry в мс |
| `onError` | `(error: Error) => void` | `console.error` | Callback при ошибке отправки |

### Методы

```typescript
class LogHubClient {
  /** Отправка лога с произвольным уровнем */
  log(level: LogLevel, message: string, options?: LogOptions): Promise<LogResponse>;

  /** Shorthand-методы */
  debug(message: string, options?: LogOptions): Promise<LogResponse>;
  info(message: string, options?: LogOptions): Promise<LogResponse>;
  warn(message: string, options?: LogOptions): Promise<LogResponse>;
  error(message: string, options?: LogOptions): Promise<LogResponse>;
  fatal(message: string, options?: LogOptions): Promise<LogResponse>;
}
```

### LogOptions

```typescript
interface LogOptions {
  /** Stack trace ошибки */
  stackTrace?: string;
  /** Произвольные метаданные */
  metadata?: Record<string, unknown>;
}
```

### LogResponse

```typescript
interface LogResponse {
  /** ID созданного лога */
  id: string;
  /** Fingerprint ошибки (SHA-256) */
  fingerprint: string;
  /** Был ли лог дедуплицирован */
  deduplicated: boolean;
}
```

### LogLevel

```typescript
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}
```

| Уровень | Когда использовать |
|---------|-------------------|
| `DEBUG` | Детальные данные для диагностики |
| `INFO` | Значимые события (запуск, миграция) |
| `WARN` | Потенциальные проблемы (высокая нагрузка) |
| `ERROR` | Ошибки, требующие внимания |
| `FATAL` | Сбой, требующий немедленного вмешательства |

### LogHubApiError

```typescript
class LogHubApiError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;
}
```

Выбрасывается при HTTP-ошибках сервера. Содержит код ответа и тело.

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
          userAgent: request.headers['user-agent'],
        },
      }).catch(() => {
        // Не падаем, если LogHub недоступен
      });
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
  }).catch(() => {
    // Не падаем, если LogHub недоступен
  });

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

## Обработка ошибок

### Retry-стратегия

- **5xx ошибки** и **сетевые ошибки** — автоматический retry с exponential backoff (`retryDelay * 2^attempt`)
- **4xx ошибки** — выбрасываются сразу (клиентская ошибка, retry бессмысленен)
- После исчерпания попыток вызывается `onError`, затем ошибка пробрасывается

### Fire-and-forget

Если отправка лога не должна прерывать основной поток:

```typescript
loghub.error('Something failed', {
  stackTrace: error.stack,
}).catch(() => {});
```

### Пользовательский onError

```typescript
const loghub = new LogHubClient({
  endpoint: 'https://loghub.example.com',
  apiKey: 'sk_live_...',
  onError: (error) => {
    // Собственная обработка: Sentry, Winston, etc.
    myLogger.warn('LogHub unavailable', { error: error.message });
  },
});
```

## Конфигурация

| Параметр | Значение по умолчанию | Описание |
|----------|----------------------|----------|
| `timeout` | 5000 мс | Таймаут одного запроса |
| `retries` | 2 | Макс. повторных попыток |
| `retryDelay` | 1000 мс | Базовая задержка (удваивается) |

## Лимиты сервера

| Параметр | Значение |
|----------|----------|
| `message` | Макс. 2 000 символов |
| `stackTrace` | Макс. 10 000 символов |
| `metadata` | Макс. 50 KB (JSON) |
| Размер тела запроса | Макс. 1 MB |
| Окно дедупликации | 3 минуты (одинаковые ошибки подавляются) |

## Лицензия

MIT
