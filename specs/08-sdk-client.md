# 08 — SDK-клиент для интеграции

## 8.1 Назначение

NPM-пакет `@besales/loghub-client` — лёгкий TypeScript-клиент для отправки логов в LogHub из любого Node.js-сервиса. Нулевые внешние зависимости (только нативный `fetch`).

## 8.2 Установка и использование

### 8.2.1 Установка

```bash
yarn add @besales/loghub-client
```

### 8.2.2 Базовое использование

```typescript
import { LogHubClient, LogLevel } from '@besales/loghub-client';

const loghub = new LogHubClient({
  endpoint: 'https://loghub.example.com',
  apiKey: 'sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
});

// Простая отправка ошибки
await loghub.error('Cannot connect to database', {
  stackTrace: error.stack,
  metadata: { userId: 'usr_123', requestId: 'req_456' },
});

// Отправка с другим уровнем
await loghub.warn('High memory usage detected', {
  metadata: { memoryMB: 1800, threshold: 1500 },
});

// Ручное указание уровня
await loghub.log(LogLevel.FATAL, 'Process crashed', {
  stackTrace: error.stack,
});
```

### 8.2.3 Использование с NestJS (рекомендуемый паттерн)

```typescript
// loghub.module.ts
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

// Использование в сервисе:
@Injectable()
export class PaymentService {
  constructor(
    @Inject(LOGHUB_CLIENT) private readonly loghub: LogHubClient,
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

### 8.2.4 Глобальный exception filter (NestJS)

```typescript
// global-exception-loghub.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Inject } from '@nestjs/common';
import { LogHubClient, LogLevel } from '@besales/loghub-client';

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

## 8.3 API клиента

### 8.3.1 Конструктор

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

### 8.3.2 Методы

```typescript
class LogHubClient {
  constructor(options: LogHubClientOptions);

  /** Отправка лога с произвольным уровнем */
  log(level: LogLevel, message: string, options?: LogOptions): Promise<LogResponse>;

  /** Shorthand для LogLevel.DEBUG */
  debug(message: string, options?: LogOptions): Promise<LogResponse>;

  /** Shorthand для LogLevel.INFO */
  info(message: string, options?: LogOptions): Promise<LogResponse>;

  /** Shorthand для LogLevel.WARN */
  warn(message: string, options?: LogOptions): Promise<LogResponse>;

  /** Shorthand для LogLevel.ERROR */
  error(message: string, options?: LogOptions): Promise<LogResponse>;

  /** Shorthand для LogLevel.FATAL */
  fatal(message: string, options?: LogOptions): Promise<LogResponse>;
}

interface LogOptions {
  /** Stack trace ошибки */
  stackTrace?: string;

  /** Произвольные метаданные */
  metadata?: Record<string, unknown>;
}

interface LogResponse {
  /** ID созданного лога */
  id: string;

  /** Fingerprint ошибки */
  fingerprint: string;

  /** Был ли лог дедуплицирован */
  deduplicated: boolean;
}

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}
```

## 8.4 Реализация клиента

### 8.4.1 Полный исходный код

```typescript
// src/index.ts

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export interface LogHubClientOptions {
  endpoint: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
}

export interface LogOptions {
  stackTrace?: string;
  metadata?: Record<string, unknown>;
}

export interface LogResponse {
  id: string;
  fingerprint: string;
  deduplicated: boolean;
}

const DEFAULT_TIMEOUT = 5_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1_000;

export class LogHubClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly onError: (error: Error) => void;

  constructor(options: LogHubClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.onError = options.onError ?? ((err) => console.error('[LogHub]', err.message));
  }

  async log(level: LogLevel, message: string, options?: LogOptions): Promise<LogResponse> {
    const body = {
      level,
      message,
      ...(options?.stackTrace && { stackTrace: options.stackTrace }),
      ...(options?.metadata && { metadata: options.metadata }),
    };

    return this.sendWithRetry(body);
  }

  async debug(message: string, options?: LogOptions): Promise<LogResponse> {
    return this.log(LogLevel.DEBUG, message, options);
  }

  async info(message: string, options?: LogOptions): Promise<LogResponse> {
    return this.log(LogLevel.INFO, message, options);
  }

  async warn(message: string, options?: LogOptions): Promise<LogResponse> {
    return this.log(LogLevel.WARN, message, options);
  }

  async error(message: string, options?: LogOptions): Promise<LogResponse> {
    return this.log(LogLevel.ERROR, message, options);
  }

  async fatal(message: string, options?: LogOptions): Promise<LogResponse> {
    return this.log(LogLevel.FATAL, message, options);
  }

  private async sendWithRetry(body: Record<string, unknown>): Promise<LogResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.send(body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Не ретраим клиентские ошибки (4xx)
        if (lastError instanceof LogHubApiError && lastError.statusCode < 500) {
          throw lastError;
        }

        if (attempt < this.retries) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    this.onError(lastError!);
    throw lastError!;
  }

  private async send(body: Record<string, unknown>): Promise<LogResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}/api/logs/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new LogHubApiError(response.status, text);
      }

      return (await response.json()) as LogResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class LogHubApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`LogHub API error: ${statusCode} - ${responseBody}`);
    this.name = 'LogHubApiError';
  }
}
```

## 8.5 Структура пакета

```
packages/loghub-client/
├── src/
│   └── index.ts           # Единственный файл с полной реализацией
├── dist/                   # Сборка (не коммитится)
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md              # Документация для npm
└── LICENSE
```

### 8.5.1 package.json

```json
{
  "name": "@besales/loghub-client",
  "version": "1.0.0",
  "description": "Lightweight TypeScript client for LogHub error logging service",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "yarn build"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["logging", "error-tracking", "telegram"],
  "license": "MIT"
}
```

### 8.5.2 tsconfig.build.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

## 8.6 README.md (для пакета)

Содержание README:

1. **Установка** — `yarn add @besales/loghub-client`
2. **Quick Start** — 5 строк до рабочего примера
3. **API Reference** — конструктор, методы, интерфейсы
4. **NestJS Integration** — модуль + exception filter
5. **Express Integration** — middleware пример
6. **Error Handling** — что делать, если LogHub недоступен
7. **Configuration** — все опции с дефолтами

## 8.7 Интеграция с Express (пример в документации)

```typescript
import express from 'express';
import { LogHubClient } from '@besales/loghub-client';

const app = express();
const loghub = new LogHubClient({
  endpoint: process.env.LOGHUB_ENDPOINT!,
  apiKey: process.env.LOGHUB_API_KEY!,
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

## 8.8 Интеграция с Telegram-ботом (пример в документации)

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
