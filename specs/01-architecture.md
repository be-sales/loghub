# 01 — Архитектура LogHub

## 1.1 Назначение

LogHub — централизованный микросервис для сбора, дедупликации и публикации error-логов из внешних сервисов (сайты, боты, API) в Telegram-группу формата «Форум». Каждый зарегистрированный сервис-источник получает собственный топик в форуме. Дублирующиеся ошибки подавляются с отправкой summary.

## 1.2 Стек технологий

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Runtime | Node.js 20 LTS | Стабильная LTS версия |
| Framework | NestJS 11 + Fastify adapter | Экосистема Nest + скорость Fastify |
| Язык | TypeScript 5.x, strict mode | Типобезопасность |
| ORM | Prisma 6.x | Миграции, типогенерация |
| БД | PostgreSQL 16 | Надёжность, JSON-поля |
| Кэш / Dedup | Redis 7 (ioredis) | TTL, атомарные операции, Keyspace Notifications |
| Telegram | gramjs или telegraf 4.x | Создание топиков, отправка сообщений |
| Валидация | class-validator + class-transformer | DTO-валидация на границах |
| Конфиг | @nestjs/config + Joi schema | Валидация env при старте |
| Логирование | nestjs-pino (pino) | Structured JSON logging |
| Тесты | Jest + supertest | Unit + Integration |
| Пакетный менеджер | yarn | Согласно CLAUDE.MD |
| Деплой | Railway (Docker) | Согласно CLAUDE.MD |

## 1.3 Архитектура слоёв (Clean Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│  Transport Layer                                             │
│  HTTP endpoints (Fastify), Guards (ApiKey, Admin)            │
├──────────────────────────────────────────────────────────────┤
│  Core Services Layer                                         │
│  IngestionService, DedupService, ServicesService, AdminService│
├──────────────────────────────────────────────────────────────┤
│  Domain Layer                                                │
│  Entities, Interfaces, DTOs, Constants, Enums                │
├──────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                        │
│  PrismaService, RedisService, TelegramService                │
└──────────────────────────────────────────────────────────────┘
```

**Правила:**
- Transport: тонкие контроллеры — парсинг ввода + вызов core-сервисов + форматирование ответа. БЕЗ бизнес-логики.
- Controllers: только guards + DTO + вызов service. Никакого прямого Prisma/Redis.
- Services: вся бизнес-логика. Зависят от interfaces (ports), а не от конкретных реализаций.
- Infrastructure: конкретные реализации портов (Prisma, Redis, Telegram API).

## 1.4 Структура проекта

```
loghub/
├── src/
│   ├── main.ts                          # Bootstrap: NestFactory + FastifyAdapter
│   ├── app.module.ts                    # Root module
│   │
│   ├── config/
│   │   ├── config.module.ts             # ConfigModule.forRoot с Joi
│   │   ├── env.validation.ts            # Joi schema для env
│   │   └── configuration.ts             # Configuration factory
│   │
│   ├── prisma/
│   │   ├── prisma.module.ts             # Global: true
│   │   └── prisma.service.ts            # extends PrismaClient, onModuleInit
│   │
│   ├── redis/
│   │   ├── redis.module.ts              # Global: true
│   │   └── redis.service.ts             # ioredis wrapper
│   │
│   ├── core/
│   │   ├── ingestion/
│   │   │   ├── ingestion.module.ts
│   │   │   ├── ingestion.controller.ts  # POST /api/logs/ingest
│   │   │   ├── ingestion.service.ts     # Orchestration: validate → dedup → persist → publish
│   │   │   └── dto/
│   │   │       └── ingest-log.dto.ts    # Входной DTO
│   │   │
│   │   ├── dedup/
│   │   │   ├── dedup.module.ts
│   │   │   ├── dedup.service.ts         # Fingerprint + Redis throttle
│   │   │   └── dedup-flush.service.ts   # Cron job: flush summary counts
│   │   │
│   │   ├── services/
│   │   │   ├── services.module.ts
│   │   │   └── services.service.ts      # CRUD сервисов + API key generation
│   │   │
│   │   └── telegram/
│   │       ├── telegram.module.ts
│   │       ├── telegram.service.ts      # Отправка сообщений, создание топиков
│   │       └── telegram-formatter.service.ts  # Форматирование сообщений
│   │
│   ├── admin/
│   │   ├── admin.module.ts
│   │   ├── admin.controller.ts          # CRUD endpoints + login
│   │   ├── admin-auth.service.ts        # JWT auth
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       ├── create-service.dto.ts
│   │       ├── update-service.dto.ts
│   │       └── logs-query.dto.ts
│   │
│   └── shared/
│       ├── guards/
│       │   ├── api-key.guard.ts         # Резолвит X-API-Key → serviceId
│       │   └── admin.guard.ts           # Проверка Bearer JWT
│       ├── decorators/
│       │   └── current-service.decorator.ts  # @CurrentService() param decorator
│       ├── interfaces/
│       │   ├── service-context.interface.ts
│       │   └── log-entry.interface.ts
│       ├── constants/
│       │   └── index.ts                 # Все magic numbers → именованные константы
│       ├── enums/
│       │   └── log-level.enum.ts
│       └── utils/
│           ├── fingerprint.util.ts      # Вычисление fingerprint ошибки
│           └── crypto.util.ts           # Генерация/хеширование API key
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docs/
│   ├── ingestion.md                     # Документация модуля ingestion
│   ├── dedup.md                         # Документация модуля dedup
│   ├── services.md                      # Документация модуля services
│   ├── telegram.md                      # Документация модуля telegram
│   ├── admin.md                         # Документация модуля admin
│   └── integration-guide.md            # Гайд по внедрению SDK
│
├── test/
│   ├── unit/
│   │   ├── dedup.service.spec.ts
│   │   ├── ingestion.service.spec.ts
│   │   ├── services.service.spec.ts
│   │   ├── telegram.service.spec.ts
│   │   ├── fingerprint.util.spec.ts
│   │   └── api-key.guard.spec.ts
│   └── e2e/
│       ├── ingestion.e2e-spec.ts
│       └── admin.e2e-spec.ts
│
├── Dockerfile                           # Для Railway
├── .env.example
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── jest.config.ts
└── README.md
```

## 1.5 Path Aliases (tsconfig.json)

```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["src/core/*"],
      "@admin/*": ["src/admin/*"],
      "@shared/*": ["src/shared/*"],
      "@prisma/*": ["src/prisma/*"],
      "@config/*": ["src/config/*"],
      "@redis/*": ["src/redis/*"]
    }
  }
}
```

**Примеры использования:**
```typescript
import { IngestionService } from '@core/ingestion/ingestion.service';
import { DedupService } from '@core/dedup/dedup.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { ServicesService } from '@core/services/services.service';
import { ApiKeyGuard } from '@shared/guards/api-key.guard';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';
```

**ЗАПРЕТ:** Barrel exports НЕ используются. Каждый импорт указывает на конкретный файл.

## 1.6 Data Flow (основной)

```
Внешний сервис
      │
      ▼
POST /api/logs/ingest
  Headers: { X-API-Key: "sk_live_..." }
  Body: { level, message, stackTrace?, metadata? }
      │
      ▼
┌─────────────────┐
│  ApiKeyGuard    │ → Redis кэш ключей (TTL 5 мин)
│                 │   miss → Prisma lookup → cache
│                 │   fail → 401 Unauthorized
└────────┬────────┘
         ▼
┌─────────────────┐
│  ValidationPipe │ → class-validator: whitelist + forbidNonWhitelisted + transform
│                 │   fail → 400 Bad Request
└────────┬────────┘
         ▼
┌─────────────────┐
│ IngestionService│
│                 │
│  1. Compute     │ → fingerprint = sha256(serviceId + level + message + stack_first_3_lines)
│     fingerprint │
│                 │
│  2. Dedup check │ → Redis: GET dedup:{fingerprint}
│                 │   exists → INCR counter, skip Telegram, persist with telegramSent=false
│                 │   not exists → SET dedup:{fingerprint} 1 EX 180 NX
│                 │
│  3. Persist log │ → Prisma: ErrorLog.create(...)
│                 │
│  4. Publish     │ → TelegramService.sendToForum(serviceId, formattedMessage)
│     (if not dup)│   → auto-create topic if topicId is null
└─────────────────┘
         │
         ▼
   Response: 201 Created { id, fingerprint, deduplicated: boolean }
```

## 1.7 Data Flow (flush summary)

```
Cron: каждые 3 минуты
      │
      ▼
┌─────────────────┐
│DedupFlushService│
│                 │
│  1. SCAN Redis  │ → ключи dedup:* с counter > 1
│                 │
│  2. Для каждого │ → Получить service + error info по fingerprint
│     ключа       │   (из последнего ErrorLog с этим fingerprint)
│                 │
│  3. Telegram    │ → "⚠️ Ошибка повторилась ещё {N} раз за 3 мин"
│     summary     │   Отправить в соответствующий топик
│                 │
│  4. Reset       │ → DEL ключа (TTL сам сбросит, но для чистоты)
└─────────────────┘
```

## 1.8 Модульная зависимость (NestJS Modules)

```
AppModule
├── ConfigModule (Global)        — env validation + configuration
├── PrismaModule (Global)        — database access
├── RedisModule (Global)         — Redis connection
├── IngestionModule              — приём логов
│   ├── depends: DedupModule, TelegramModule, ServicesModule (через imports)
│   └── provides: IngestionController, IngestionService
├── DedupModule
│   ├── depends: RedisModule (Global), TelegramModule
│   └── provides: DedupService, DedupFlushService
├── ServicesModule
│   ├── depends: PrismaModule (Global), RedisModule (Global)
│   └── provides: ServicesService (exported)
├── TelegramModule
│   ├── depends: PrismaModule (Global), ConfigModule (Global)
│   └── provides: TelegramService, TelegramFormatterService (exported)
└── AdminModule
    ├── depends: ServicesModule, PrismaModule (Global)
    └── provides: AdminController, AdminAuthService
```

## 1.9 Константы (shared/constants/index.ts)

```typescript
// Дедупликация
export const DEDUP_WINDOW_SECONDS = 180;           // 3 минуты
export const DEDUP_FLUSH_INTERVAL_MS = 180_000;    // 3 минуты (cron)
export const DEDUP_REDIS_PREFIX = 'dedup:';

// API Key
export const API_KEY_PREFIX = 'sk_live_';
export const API_KEY_LENGTH = 32;
export const API_KEY_CACHE_TTL_SECONDS = 300;      // 5 минут
export const API_KEY_CACHE_PREFIX = 'apikey:';
export const API_KEY_HEADER = 'x-api-key';

// Telegram
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
export const TELEGRAM_RATE_LIMIT_PER_SECOND = 20;  // консервативнее лимита 30/sec
export const TELEGRAM_RETRY_ATTEMPTS = 3;
export const TELEGRAM_RETRY_DELAY_MS = 1000;

// Ingestion
export const MAX_STACK_TRACE_LENGTH = 10_000;       // символов
export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_METADATA_SIZE_BYTES = 50_000;      // 50KB
export const FINGERPRINT_STACK_LINES = 3;

// Admin
export const ADMIN_JWT_EXPIRY = '24h';
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

// Health
export const HEALTH_CHECK_INTERVAL_MS = 30_000;
```

## 1.10 Enums (shared/enums/log-level.enum.ts)

```typescript
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}
```

## 1.11 Переменные окружения (.env.example)

```env
# App
NODE_ENV=production
PORT=3000
API_PREFIX=api

# Database
DATABASE_URL=postgresql://user:pass@host:5432/loghub

# Redis
REDIS_URL=redis://default:pass@host:6379

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234...
TELEGRAM_FORUM_CHAT_ID=-1001234567890

# Admin
ADMIN_LOGIN=admin
ADMIN_PASSWORD=<strong-password>
ADMIN_JWT_SECRET=<random-secret-32-chars>

# Logging
LOG_LEVEL=info
```
