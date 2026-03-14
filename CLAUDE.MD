# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL

### Язык и инструменты

- Отвечать на русском. JSDoc/Swagger комментарии — на русском
- Использовать только `yarn` (не npm) версии berry
- Документацию искать через context7 MCP
- Всегда думай шаг за шагом
- Всегда пиши чистый код, используя лучшие практики TypeScript
- Добавляй новые сервисы/классы сразу во все необходимые модули в провайдерах
- Всегда проверяй, что вы добавил всё необходимое в DTO, интерфейсы, типы и модули
- Прежде чем завершить работу, проверь себя на наличие технического долга и устрани его
- Обязательно сразу делай без TODO и создания тех долга на потом - сразу делай конечное решение, чтобы не нужно было делать рефакторинг
- После каждой исполненой задачи вызывай `yarn lint:fix`
- Каждый файл должен быть не больше 1200 строк
- Обязательно создавай тесты основных функций
- Обязательно создавай человеко-читаемую документацию каждого модуля в docs/ и обновляй её, когда что-то меняешь в логике модуля
- В путях везде используется префикс api
- Не используй barrel exports
- Обязательно используй Path Aliases
- Проект хостится на Railway, учитывай это
- Делай без TODO и незавершённого кода
- Не используй магические цифры — сразу создай константы и переиспользуй существующие
- Не хардкодь текст - сразу используй локализацию
- Сегодня март 2026 года
- accessToken хранить в HttpOnly Secure SameSite cookie
- сразу добавляеть все новые переменные окружения в .env.example
- docker compose и docker локально не используются. Docker файлы только для railway нужны

### Запреты Prisma

- ❌ `npx prisma db push --accept-data-loss`
- ❌ `--reset` в командах миграции
- ✅ `npx prisma migrate dev --name {name}`

### Архитектурные запреты

- Избегать `forwardRef` — выносить зависимости в отдельные модули
- Не создавать гигантские PR — разбивать на инкременты
- ❌ Бизнес-логика в транспортном слое (Telegram scenes/handlers). Транспорт = тонкая обёртка
- ❌ Прямой вызов Prisma/Redis из controllers/transport — только через сервисы

---

## 🏗️ ARCHITECTURE

### Product Overview

**LogHub** — централизованный микросервис для сбора, дедупликации и публикации error-логов из внешних сервисов (сайты, боты, API) в Telegram-группу формата «Форум».

- Внешние сервисы отправляют логи через `POST /api/logs/ingest` с API Key
- Каждый сервис получает свой топик в Telegram-форуме (создаётся автоматически при первой ошибке)
- Дубликаты подавляются (окно 3 мин) с отправкой summary
- Все логи сохраняются в PostgreSQL для аналитики
- Admin API для управления сервисами и просмотра логов
- SDK-клиент `@besales/loghub-client` для интеграции в другие сервисы

**Стек:** NestJS 11 + Fastify adapter, TypeScript 5, Prisma 6 + PostgreSQL 16, Redis 7 (ioredis), нативный fetch для Telegram Bot API


**Структура проекта:**

```
loghub/
    ├── src/
    │   ├── main.ts                     # Bootstrap: NestFactory + FastifyAdapter
    │   ├── app.module.ts               # Root module
    │   ├── health.controller.ts        # GET /api/health
    │   ├── config/
    │   │   ├── config.module.ts        # ConfigModule.forRoot с Joi
    │   │   └── env.validation.ts       # Joi schema для env
    │   ├── prisma/
    │   │   ├── prisma.module.ts        # Global: true
    │   │   └── prisma.service.ts       # extends PrismaClient
    │   ├── redis/
    │   │   ├── redis.module.ts         # Global: true
    │   │   └── redis.service.ts        # ioredis wrapper
    │   ├── core/
    │   │   ├── ingestion/
    │   │   │   ├── ingestion.module.ts
    │   │   │   ├── ingestion.controller.ts   # POST /api/logs/ingest
    │   │   │   ├── ingestion.service.ts      # Orchestration
    │   │   │   └── dto/
    │   │   │       ├── ingest-log.dto.ts
    │   │   │       └── ingest-response.dto.ts
    │   │   ├── dedup/
    │   │   │   ├── dedup.module.ts
    │   │   │   ├── dedup.service.ts          # Fingerprint + Redis throttle
    │   │   │   └── dedup-flush.service.ts    # Cron: flush summary counts
    │   │   ├── services/
    │   │   │   ├── services.module.ts
    │   │   │   └── services.service.ts       # CRUD сервисов + API keys
    │   │   └── telegram/
    │   │       ├── telegram.module.ts
    │   │       ├── telegram.service.ts       # Отправка, создание топиков
    │   │       └── telegram-formatter.service.ts
    │   ├── admin/
    │   │   ├── admin.module.ts
    │   │   ├── admin.controller.ts           # Admin CRUD + login
    │   │   ├── admin-auth.service.ts         # JWT auth
    │   │   └── dto/
    │   │       ├── login.dto.ts
    │   │       ├── create-service.dto.ts
    │   │       ├── update-service.dto.ts
    │   │       └── logs-query.dto.ts
    │   └── shared/
    │       ├── guards/
    │       │   ├── api-key.guard.ts          # X-API-Key → serviceId
    │       │   └── admin.guard.ts            # JWT (cookie + Bearer fallback)
    │       ├── decorators/
    │       │   └── current-service.decorator.ts
    │       ├── interfaces/
    │       │   ├── service-context.interface.ts
    │       │   ├── log-entry.interface.ts
    │       │   └── paginated-result.interface.ts
    │       ├── constants/
    │       │   └── index.ts
    │       ├── enums/
    │       │   └── log-level.enum.ts
    │       └── utils/
    │           ├── fingerprint.util.ts
    │           └── crypto.util.ts
    ├── prisma/
    │   ├── schema.prisma
    │   ├── seed.ts
    │   └── migrations/
    ├── docs/                           # Документация модулей
    ├── test/
    │   ├── unit/
    │   └── e2e/
    ├── packages/
    │   └── loghub-client/              # SDK npm-пакет @besales/loghub-client
    ├── Dockerfile                      # Multi-stage build для Railway
    ├── .dockerignore                   # Исключения Docker build context
    ├── railway.toml                    # Railway: builder, healthcheck, restart policy
    ├── .env.example
    └── package.json
```



### Data Flow

**Основной поток (приём ошибки):**

```
Внешний сервис (bot, site, API)
      │
      ▼
POST /api/logs/ingest  [X-API-Key header]
      │
      ▼
ApiKeyGuard → Redis кэш (TTL 5 мин) → miss? → Prisma lookup → cache
      │
      ▼
ValidationPipe → class-validator (whitelist + forbidNonWhitelisted)
      │
      ▼
IngestionService:
  0. validateMetadataSize() → 413 если > 50KB
  1. computeFingerprint(serviceId + level + message + stack_first_3_lines)
  2. DedupService.checkAndMark() → Redis SET NX EX 180
     ├─ NOT exists → SET key, isDuplicate=false
     └─ EXISTS → INCR counter, isDuplicate=true
  3. Prisma ErrorLog.create() (ВСЕГДА, даже дубликаты)
  4. TelegramService.sendErrorLog() (ТОЛЬКО если not duplicate, fire-and-forget)
     └─ ensureTopicExists() → auto-create topic if topicId is null
      │
      ▼
Response 201: { id, fingerprint, deduplicated }
```

**Flush summary (cron каждые 10 сек):**

```
DedupFlushService → SCAN Redis dedup:* → entries с count > 1 и TTL ≤ 10
  → для каждого: lookup last ErrorLog → TelegramService.sendDedupSummary()
  → "⚠️ Ошибка повторилась ещё N раз за 3 мин"
  → clearEntry()
```
### Правила слоёв

- **Transport**: тонкие адаптеры — парсинг ввода + вызов core-сервисов + форматирование ответа. Без бизнес-логики
- **Controllers (Admin)**: тонкие — только guards + DTO + вызов service
- **Use-cases**: для НОВОГО кода (один use-case = одна бизнес-операция)
- **Services**: для СУЩЕСТВУЮЩЕГО кода (не рефакторить без необходимости)
- **Ports**: интерфейсы для абстракции infrastructure от core

### Path Aliases

```typescript
// tsconfig.json paths:
"@core/*":         ["src/core/*"]
"@admin/*":        ["src/admin/*"]
"@shared/*":       ["src/shared/*"]
"@prisma/*":       ["src/prisma/*"]
"@config/*":       ["src/config/*"]
"@redis/*":        ["src/redis/*"]
"@transport/*":    ["src/transport/*"]       // зарезервировано
"@integrations/*": ["src/integrations/*"]    // зарезервировано
"@memory/*":       ["src/memory/*"]          // зарезервировано

// Примеры использования:
import { IngestionService } from '@core/ingestion/ingestion.service';
import { DedupService } from '@core/dedup/dedup.service';
import { ServicesService } from '@core/services/services.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';
import { ApiKeyGuard } from '@shared/guards/api-key.guard';
import { AdminAuthService } from '@admin/admin-auth.service';
```

### Key Modules

| Модуль | Описание | Global | Transport |
|--------|----------|--------|-----------|
| ConfigModule | Env validation (Joi), configuration factory | ✅ | — |
| PrismaModule | PostgreSQL через Prisma Client | ✅ | — |
| RedisModule | ioredis wrapper | ✅ | — |
| IngestionModule | Приём логов: POST /api/logs/ingest | — | HTTP (Fastify) |
| DedupModule | Дедупликация: Redis fingerprint + flush cron | — | — |
| ServicesModule | CRUD сервисов, API key generation/validation | — | — |
| TelegramModule | Отправка в Telegram Forum, создание топиков | — | — |
| AdminModule | Admin API: login, CRUD services, logs viewer | — | HTTP (Fastify) |

### Module Dependency Graph

```
AppModule
├── AppConfigModule (Global)
├── ScheduleModule.forRoot()
├── ThrottlerModule.forRoot()
├── PrismaModule (Global)
├── RedisModule (Global)
├── AdminModule
│   ├── imports: ServicesModule
│   └── provides: AdminController, AdminAuthService (exported), AdminGuard
├── DedupModule
│   ├── imports: TelegramModule
│   └── provides: DedupService, DedupFlushService
├── IngestionModule
│   ├── imports: DedupModule, TelegramModule
│   └── provides: IngestionController, IngestionService
└── HealthController
```
### Key Domain Concepts

| Concept | Описание | Расположение |
|---------|----------|-------------|
| Service | Внешний сервис-источник логов (бот, сайт, API). Имеет name, slug, apiKeyHash, topicId | `prisma/schema.prisma`, `core/services/` |
| ErrorLog | Лог ошибки от внешнего сервиса. Содержит level, message, stackTrace, metadata, fingerprint | `prisma/schema.prisma`, `core/ingestion/` |
| Fingerprint | SHA-256 от serviceId+level+normalizedMessage+stack_first_3_lines. Для дедупликации | `shared/utils/fingerprint.util.ts` |
| Dedup Window | Окно дедупликации 3 мин (DEDUP_WINDOW_SECONDS=180). Первая ошибка проходит, повторы подавляются | `core/dedup/` |
| API Key | `sk_live_` + 32 hex. Хранится как HMAC-SHA256 hash (HMAC_SECRET). Показывается один раз при создании | `shared/utils/crypto.util.ts` |
| Forum Topic | Топик в Telegram-группе формата Forum. Один топик = один сервис. Создаётся лениво | `core/telegram/` |
| Dedup Summary | Сообщение "Ошибка повторилась ещё N раз за 3 мин". Отправляется cron-job при flush | `core/dedup/dedup-flush.service.ts` |

> Данный микросервис **не использует LLM**. Никаких вызовов OpenAI/Anthropic/OpenRouter.

### Constants (не магические числа)

```typescript
// shared/constants/index.ts — полный список

// Дедупликация
DEDUP_WINDOW_SECONDS = 180;                    // 3 мин — окно дедупликации
DEDUP_FLUSH_INTERVAL_MS = 180_000;             // 3 мин — интервал flush cron
DEDUP_REDIS_PREFIX = 'dedup:';
DEDUP_FLUSH_TTL_THRESHOLD_SECONDS = 10;        // порог TTL для flush
DEDUP_SCAN_COUNT = 100;                        // ключей за один SCAN

// API Key
API_KEY_PREFIX = 'sk_live_';
API_KEY_LENGTH = 32;                           // hex символов (16 bytes)
API_KEY_DISPLAY_PREFIX_LENGTH = 8;
API_KEY_MAX_LENGTH = 200;                      // защита от oversized input
API_KEY_CACHE_TTL_SECONDS = 300;               // 5 мин — кэш resolved ключей
API_KEY_CACHE_PREFIX = 'apikey:';
API_KEY_HEADER = 'x-api-key';

// Services
SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

// Telegram
TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
TELEGRAM_RATE_LIMIT_PER_SECOND = 20;           // консервативнее лимита 30/sec
TELEGRAM_RETRY_ATTEMPTS = 3;
TELEGRAM_RETRY_DELAY_MS = 1000;
TELEGRAM_STACK_MAX_LINES = 15;
TELEGRAM_METADATA_MAX_LENGTH = 500;
TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH = 200;
TELEGRAM_TOPIC_LOCK_PREFIX = 'topic_lock:';
TELEGRAM_TOPIC_LOCK_TTL_SECONDS = 30;
TELEGRAM_TOPIC_LOCK_WAIT_MS = 2000;
TELEGRAM_RATE_LIMIT_PREFIX = 'tg_rate:';
TELEGRAM_RATE_LIMIT_TTL_SECONDS = 2;
TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
TELEGRAM_TOPIC_ICON_COLOR = 0xfb6f5f;

// Ingestion
MAX_STACK_TRACE_LENGTH = 10_000;
MAX_MESSAGE_LENGTH = 2_000;
MAX_METADATA_SIZE_BYTES = 50_000;              // 50KB
FINGERPRINT_STACK_LINES = 3;

// Admin
ADMIN_JWT_EXPIRY = '24h';
DEFAULT_PAGE_SIZE = 50;
MAX_PAGE_SIZE = 200;

// Redis
REDIS_MAX_RETRIES_PER_REQUEST = 3;
REDIS_RETRY_DELAY_STEP_MS = 200;
REDIS_MAX_RETRY_DELAY_MS = 2_000;

// Health
HEALTH_CHECK_INTERVAL_MS = 30_000;

// Security
BCRYPT_ROUNDS = 12;
LOGIN_THROTTLE_TTL_SECONDS = 900;              // 15 мин
LOGIN_THROTTLE_LIMIT = 5;
BODY_LIMIT_BYTES = 1_048_576;                  // 1MB
COOKIE_MAX_AGE_SECONDS = 86_400;               // 24 часа
```
---

## 🛠️ COMMANDS

### Команды

```bash
# Разработка
yarn dev                    # Запуск dev сервера (port 3000)
yarn build                  # Production сборка
yarn start:prod             # Запуск production

# База данных
yarn db:generate            # Генерация Prisma Client
yarn db:migrate             # Создание миграции
yarn db:migrate:prod        # Применение миграций (production)
yarn db:seed                # Seed данных (создание тестового сервиса)
yarn db:studio              # Prisma Studio GUI

# Линтинг
yarn lint                   # ESLint проверка
yarn lint:fix               # ESLint с авто-исправлением
yarn lint:errors            # Только ошибки (без warnings)
yarn format                 # Prettier форматирование

# Тесты
yarn test                   # Unit тесты
yarn test:watch             # Тесты в watch режиме
yarn test:cov               # Тесты с coverage
yarn test:e2e               # E2E тесты
```

---

## 🧪 TESTING

**Запуск:**

```bash
yarn test                   # Все unit тесты
yarn test auth              # Тесты для auth модуля
yarn test:e2e               # E2E тесты (нужна БД)
```

### Backend Unit тесты

- При добавлении сервиса в constructor — добавлять mock в тесты
- Jest moduleNameMapper: паттерн `^@prisma/(.*)$` ловит node_modules, использовать `^@prisma/prisma\\.(.*)$`

### Что обязательно покрыть тестами (backend)

- `fingerprint.util.ts` — нормализация message/stack, коллизии, edge cases
- `dedup.service.ts` — checkAndMark (first/duplicate), getActiveEntries, Redis fallback
- `ingestion.service.ts` — полный flow (persist + dedup + telegram), fire-and-forget, metadata size
- `api-key.guard.ts` — валидация ключа, кэш hit/miss, деактивированный сервис
- `admin-auth.service.ts` — login success/fail, JWT verify/expired
- `telegram.service.ts` — отправка, auto-create topic, retry 429, rate limiting
- `telegram-formatter.service.ts` — форматы сообщений, HTML escaping, truncation
- `services.service.ts` — CRUD, API key generation/regeneration, Redis invalidation
### Admin Panel (рекомендации)

> Примечание: LogHub в текущей версии не имеет frontend admin panel (только REST API). При добавлении UI:

- Тестировать формы создания/редактирования сервисов
- Тестировать таблицу логов с фильтрами и пагинацией
- Тестировать auth flow (login → JWT → protected routes)
- Тестировать отображение API key при создании (показать один раз → скрыть)
**Рекомендуемый стек:**

- Vitest (вместо Jest для Vite)
- React Testing Library
- MSW (Mock Service Worker)

---

## 📐 TYPESCRIPT & CLEAN CODE

### Обязательно

- Следовать **SOLID** принципам
- Следовать **Clean Code** практикам
- Композиция > наследование

### Типизация

- `unknown` вместо `any` на границах системы (HTTP, queue, webhook)
- `never` для невозможных веток + `assertUnreachable()`
- Явный return type для публичных методов/use-cases
- Generics/abstract — только когда реально уменьшают дублирование

### Классы

- `private` по умолчанию, наружу только необходимое
- DTO — отдельные типы (не переиспользовать entity)

### Функции

- Чистые (functional core) или явно побочные (imperative shell)
- Дублирование кода ≥2 мест → выносить в utils/helpers
- Дублирование типов ≥2 мест → выносить тип

---

## 🛡️ RELIABILITY & SECURITY

### Валидация

- На границах: class-validator + понятные ошибки
- ValidationPipe: `whitelist + forbidNonWhitelisted + transform`

### Ошибки

- Ожидаемые → Result/Either паттерн
- Неожиданные → throw + логирование
- Публичные use-cases: перечислять коды ошибок в JSDoc/Swagger

### Идемпотентность

- Webhook/queue handlers ОБЯЗАНЫ быть идемпотентны
- Ретраи: dead-letter queue + exponential backoff
- Side-effects после записи факта

### Redis

- TTL обязателен для кэша
- Конкурентный доступ: `SET key value NX PX` / Lua scripts
- Атомарные операции где возможно

### Prisma

- Нет N+1: осознанно использовать `select`/`include`
- Batching где нужно (createMany, updateMany)
- Пагинация по умолчанию для списков + лимиты
- Nullable Json поля: использовать spread `...(value && { field: value as unknown as Prisma.InputJsonValue })`

### Трассировка

- Каждый запрос/job имеет `correlationId`
- Логировать события домена + ошибки (не всё подряд)
- Не логировать секреты/PII, маскировать токены

---

## 🔐 AUTH & ACCESS

### Admin Panel (HTTP)

- `POST /api/admin/login` — логин/пароль → JWT в HttpOnly cookie
- `POST /api/admin/logout` — очистка cookie
- `AdminGuard` — проверка JWT из cookie (fallback: Bearer header)
- Credentials из env: `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`

### Ingestion API (HTTP)

- `POST /api/logs/ingest` — приём логов от внешних сервисов
- `ApiKeyGuard` — проверка `X-API-Key` заголовка → resolve serviceId
- API Key: формат `sk_live_` + 32 hex, хранится как HMAC-SHA256 hash (HMAC_SECRET)
- Кэш ключей в Redis (TTL 5 мин) для performance
- Деактивированный сервис → 401 даже с валидным ключом
- Перегенерация ключа: `POST /api/admin/services/:id/regenerate-key`
---

## 📝 API & DOCUMENTATION

### Swagger (обязательно для новых endpoints)

- `@ApiTags`, `@ApiOperation`, `@ApiResponse`
- `@ApiParam`, `@ApiQuery` при наличии параметров
- Комментарии на русском
- Swagger доступен: `/api/docs`

### DTO

- Входные данные всегда через DTO с валидацией
- Обновлять DTO/types в том же PR что и код
- DTOs: `LoginDto`, `CreateServiceDto`, `UpdateServiceDto`, `LogsQueryDto`, `IngestLogDto`, `IngestResponseDto`

  
---

## 🖥️ FRONTEND

> LogHub v1 не имеет frontend admin panel. Управление через REST API (`/api/admin/*`).

При добавлении UI потребуются:

- **LoginForm** — аутентификация админа (POST /api/admin/login → JWT в cookie)
- **ServicesTable** — список сервисов с _count логов, статусом, actions (edit/delete/regenerate key)
- **ServiceCreateDialog** — форма создания сервиса (name, slug, description) + отображение API key один раз
- **LogsTable** — таблица логов с фильтрами (service, level, date range, search) и пагинацией
- **ApiKeyRevealCard** — показ ключа при создании/перегенерации с copy-to-clipboard + предупреждение
---

## ✅ DEFINITION OF DONE

- [ ] TS компиляция без ошибок
- [ ] использован `yarn lint:fix`
- [ ] `yarn lint:errors` проходит
- [ ] Миграции не ломают данные
- [ ] DTO/types/interfaces обновлены
- [ ] Providers добавлены в modules
- [ ] Локали обновлены (en, ru)
- [ ] Swagger актуален
- [ ] Нет технического долга
- [ ] Unit тесты для критических путей
- [ ] Документация модуля в docs/ обновлена
