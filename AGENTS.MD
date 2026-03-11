# AGENTS.md

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
- Обязательно создавай человеко-читаемую документацию каждого модуля в apps/docs/ и обновляй её, когда что-то меняешь в логике модуля
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


**Структура проекта (monorepo, Turborepo):**

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
    │   │   │       └── ingest-log.dto.ts
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
    │       │   └── admin.guard.ts            # Bearer JWT
    │       ├── decorators/
    │       │   └── current-service.decorator.ts
    │       ├── interfaces/
    │       │   ├── service-context.interface.ts
    │       │   └── log-entry.interface.ts
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
    │   └── loghub-client/              # SDK npm-пакет
    ├── Dockerfile                      # Для Railway
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
// apps/api/tsconfig.json paths:
"@core/*":         ["src/core/*"]
"@transport/*":    ["src/transport/*"]
"@integrations/*": ["src/integrations/*"]
"@shared/*":       ["src/shared/*"]
"@prisma/*":       ["src/prisma/*"]
"@config/*":       ["src/config/*"]
"@admin/*":        ["src/admin/*"]
"@memory/*":       ["src/memory/*"]

// apps/admin/tsconfig.json paths:
"@/*":             ["./src/*"]

// Примеры использования:
import { ChatService } from '@core/chat/chat.service';
import { TokensService } from '@core/tokens/tokens.service';
import { UsersService } from '@core/users/users.service';
import { LlmService } from '@integrations/llm/llm.service';
import { MemoryService } from '@memory/memory.service';
import { PrismaService } from '@prisma/prisma.service';
import { TokensGuard } from '@shared/guards/tokens.guard';
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
├── ConfigModule (Global)
├── ScheduleModule.forRoot()
├── PrismaModule (Global)
├── RedisModule (Global)
├── IngestionModule
│   ├── imports: DedupModule, TelegramModule
│   └── provides: IngestionController, IngestionService
├── DedupModule
│   ├── imports: TelegramModule
│   └── provides: DedupService, DedupFlushService
├── ServicesModule
│   └── provides: ServicesService (exported)
├── TelegramModule
│   └── provides: TelegramService (exported), TelegramFormatterService
├── AdminModule
│   ├── imports: ServicesModule
│   └── provides: AdminController, AdminAuthService (exported)
└── HealthController
```
### Key Domain Concepts

| Concept | Описание | Расположение |
|---------|----------|-------------|
| Service | Внешний сервис-источник логов (бот, сайт, API). Имеет name, slug, apiKeyHash, topicId | `prisma/schema.prisma`, `core/services/` |
| ErrorLog | Лог ошибки от внешнего сервиса. Содержит level, message, stackTrace, metadata, fingerprint | `prisma/schema.prisma`, `core/ingestion/` |
| Fingerprint | SHA-256 от serviceId+level+normalizedMessage+stack_first_3_lines. Для дедупликации | `shared/utils/fingerprint.util.ts` |
| Dedup Window | Окно дедупликации 3 мин (DEDUP_WINDOW_SECONDS=180). Первая ошибка проходит, повторы подавляются | `core/dedup/` |
| API Key | `sk_live_` + 32 hex. Хранится как SHA-256 hash. Показывается один раз при создании | `shared/utils/crypto.util.ts` |
| Forum Topic | Топик в Telegram-группе формата Forum. Один топик = один сервис. Создаётся лениво | `core/telegram/` |
| Dedup Summary | Сообщение "Ошибка повторилась ещё N раз за 3 мин". Отправляется cron-job при flush | `core/dedup/dedup-flush.service.ts` |
### LLM Integration Rules

Данный микросервис **не использует LLM**. Это чисто инфраструктурный сервис (приём логов → дедупликация → Telegram). Никаких вызовов OpenAI/Anthropic/OpenRouter.
### Constants (не магические числа)

```typescript
// shared/constants/index.ts

// Дедупликация
DEDUP_WINDOW_SECONDS = 180;           // 3 минуты — окно дедупликации
DEDUP_FLUSH_INTERVAL_MS = 180_000;    // 3 минуты — интервал flush cron
DEDUP_REDIS_PREFIX = 'dedup:';

// API Key
API_KEY_PREFIX = 'sk_live_';
API_KEY_LENGTH = 32;                  // hex символов (16 bytes)
API_KEY_CACHE_TTL_SECONDS = 300;      // 5 минут — кэш resolved ключей
API_KEY_CACHE_PREFIX = 'apikey:';
API_KEY_HEADER = 'x-api-key';

// Telegram
TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
TELEGRAM_RATE_LIMIT_PER_SECOND = 20;  // консервативнее лимита 30/sec
TELEGRAM_RETRY_ATTEMPTS = 3;
TELEGRAM_RETRY_DELAY_MS = 1000;

// Ingestion
MAX_STACK_TRACE_LENGTH = 10_000;
MAX_MESSAGE_LENGTH = 2_000;
MAX_METADATA_SIZE_BYTES = 50_000;     // 50KB
FINGERPRINT_STACK_LINES = 3;

// Admin
ADMIN_JWT_EXPIRY = '24h';
DEFAULT_PAGE_SIZE = 50;
MAX_PAGE_SIZE = 200;
```
---

## 🛠️ COMMANDS

### Backend (apps/api)

```bash
# Разработка
yarn dev                    # Запуск dev сервера (port 3001)
yarn build                  # Production сборка
yarn start:prod             # Запуск production

# База данных
yarn db:generate            # Генерация Prisma Client
yarn db:migrate             # Создание миграции
yarn db:migrate:prod        # Применение миграций (production)
yarn db:seed                # Seed данных (создание админа)
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

### Admin Panel (apps/admin)

```bash
# Разработка
yarn dev                    # Запуск dev сервера (port 3000)
yarn build                  # Production сборка
yarn preview                # Preview production сборки

# Линтинг
yarn lint                   # ESLint проверка
yarn lint:fix               # ESLint с авто-исправлением
yarn lint:errors            # Только ошибки
yarn format                 # Prettier форматирование
```

### Monorepo (root)

```bash
yarn dev                    # Запуск всех apps (Turborepo)
yarn build                  # Build всех apps
yarn db:generate            # Proxy → apps/api db:generate
yarn db:migrate             # Proxy → apps/api db:migrate
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
- pgvector: мокать embedding-запросы в тестах (не вызывать OpenAI)
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

- `unknown` вместо `any` на границах системы (HTTP, queue, webhook, Astrology API responses)
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
- Astrology API responses: валидировать перед сохранением в кэш

### Ошибки

- Ожидаемые → Result/Either паттерн
- Неожиданные → throw + логирование
- Публичные use-cases: перечислять коды ошибок в JSDoc/Swagger
- Astrology API ошибки: classify (auth → refresh key, rate_limit → backoff, other → fallback)
- LLM ошибки: primary (OpenRouter) fail → fallback (OpenAI)

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
- pgvector: использовать raw SQL для similarity search (`<=>` оператор)

### Трассировка

- Каждый запрос/job имеет `correlationId`
- Логировать события домена + ошибки (не всё подряд)
- Не логировать секреты/PII, маскировать токены

---

## 🔐 AUTH & ACCESS

### Admin Panel (HTTP)

- `POST /api/admin/login` — логин/пароль → JWT token
- `AdminGuard` — проверка Bearer token на защищённых endpoints
- Credentials из env: `ADMIN_LOGIN`, `ADMIN_PASSWORD`

### Ingestion API (HTTP)

- `POST /api/logs/ingest` — приём логов от внешних сервисов
- `ApiKeyGuard` — проверка `X-API-Key` заголовка → resolve serviceId
- API Key: формат `sk_live_` + 32 hex, хранится как SHA-256 hash
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
- Admin API DTOs: `LoginDto`, `GrantTokensDto`, `SetSubscriptionDto`, `UsersQueryDto`, `MessagesQueryDto`

  
---

## 🖥️ FRONTEND

###  Panel (Next.js 16)

- **Framework**: Next.js 16 (App Router) + React 19
- **State**: Zustand 5 (auth store с persist) + TanStack React Query 5 (server state)
- **UI**: Shadcn UI + Radix + Tailwind CSS 4 + Lucide icons + Sonner toasts
- **Auth**: JWT в localStorage, auto-inject в API client
- Functional components с TypeScript interfaces
- Prefer interfaces over types; avoid enums (use maps)
- Mobile-first responsive design
- Named exports для компонентов
- Директории: lowercase-with-dashes (`components/auth-wizard`)
- Error Boundaries для обработки ошибок
- i18n через context для локализации (en, ru)

### Key  Components

> LogHub v1 не имеет frontend admin panel. Управление через REST API (`/api/admin/*`).
> При добавлении UI потребуются:

- **LoginForm** — аутентификация админа (POST /api/admin/login → JWT)
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
- [ ] Документация модуля в appsdocs/ обновлена
