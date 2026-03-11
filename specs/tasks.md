# tasks.md — План задач LogHub

> Каждая задача содержит ссылку на параграф спеки, к которому нужно обратиться при реализации.
> Задачи выполняются последовательно. Каждая задача — атомарный инкремент: после неё проект собирается и lint проходит.

---

## Фаза 0: Инициализация проекта

### T-000: Scaffolding проекта
**Спеки:** `01-architecture.md §1.2, §1.4, §1.5` | `10-deployment.md §10.5, §10.6, §10.9`
- [ ] Создать NestJS-проект с Fastify adapter: `nest new loghub`
- [ ] Установить ВСЕ зависимости из `10-deployment.md §10.9` (dependencies + devDependencies)
- [ ] Настроить `tsconfig.json` с path aliases из `01-architecture.md §1.5`
- [ ] Настроить `jest.config.ts` с moduleNameMapper из `09-testing.md §9.2`
- [ ] Создать структуру директорий из `01-architecture.md §1.4` (пустые папки с .gitkeep или index файлами)
- [ ] Настроить ESLint + Prettier
- [ ] Создать `.env.example` из `01-architecture.md §1.11`
- [ ] Создать `main.ts` из `10-deployment.md §10.5`
- [ ] Создать `app.module.ts` заглушку (без импортов модулей — они ещё не созданы)
- [ ] Проверить: `yarn build` проходит, `yarn lint:fix` проходит

### T-001: ConfigModule + Env Validation
**Спеки:** `10-deployment.md §10.7`
- [ ] Установить `joi`
- [ ] Создать `src/config/env.validation.ts` с Joi-схемой из `10-deployment.md §10.7`
- [ ] Создать `src/config/config.module.ts` — `ConfigModule.forRoot({ isGlobal: true, validationSchema })`
- [ ] Импортировать ConfigModule в AppModule
- [ ] Проверить: при отсутствии обязательной env → приложение не запускается с понятной ошибкой

### T-002: Shared — Constants, Enums, Interfaces
**Спеки:** `01-architecture.md §1.9, §1.10`
- [ ] Создать `src/shared/constants/index.ts` — ВСЕ константы из `01-architecture.md §1.9`
- [ ] Создать `src/shared/enums/log-level.enum.ts` из `01-architecture.md §1.10`
- [ ] Создать `src/shared/interfaces/service-context.interface.ts` — интерфейс `ServiceContext { serviceId: string; slug: string }`
- [ ] Создать `src/shared/interfaces/log-entry.interface.ts` — интерфейсы для внутреннего использования (IngestResponseDto и т.д.)
- [ ] Проверить: `yarn build` проходит

---

## Фаза 1: Data Layer

### T-010: PrismaModule + Schema
**Спеки:** `02-database.md §2.1, §2.4`
- [ ] Инициализировать Prisma: `npx prisma init`
- [ ] Записать полную Prisma schema из `02-database.md §2.1` (модели Service, ErrorLog, enum LogLevel)
- [ ] Создать `src/prisma/prisma.service.ts` из `02-database.md §2.4`
- [ ] Создать `src/prisma/prisma.module.ts` из `02-database.md §2.4` (Global)
- [ ] Импортировать PrismaModule в AppModule
- [ ] Запустить `npx prisma generate` — убедиться, что PrismaClient генерируется
- [ ] Создать начальную миграцию: `npx prisma migrate dev --name init`
- [ ] Проверить: `yarn build` проходит, миграция создана

### T-011: Seed (опционально)
**Спеки:** `02-database.md §2.6`
- [ ] Создать `prisma/seed.ts` из `02-database.md §2.6`
- [ ] Добавить `prisma.seed` в `package.json`
- [ ] Проверить: `npx prisma db seed` создаёт тестовый сервис и выводит API key

### T-012: RedisModule
**Спеки:** `10-deployment.md §10.8` | `02-database.md §2.5`
- [ ] Установить `ioredis`
- [ ] Создать `src/redis/redis.service.ts` из `10-deployment.md §10.8`
- [ ] Создать `src/redis/redis.module.ts` из `10-deployment.md §10.8` (Global)
- [ ] Импортировать RedisModule в AppModule
- [ ] Проверить: `yarn build` проходит

---

## Фаза 2: Утилиты и Guard'ы

### T-020: Crypto Utility
**Спеки:** `03-auth-and-services.md §3.2.1, §3.2.2`
- [ ] Создать `src/shared/utils/crypto.util.ts` — функции `generateApiKey()` и `hashApiKey()` из `03-auth-and-services.md §3.2.2`
- [ ] Формат ключа: `sk_live_` + 32 hex символа (§3.2.1)
- [ ] Проверить: `yarn build` проходит

### T-021: Fingerprint Utility
**Спеки:** `04-ingestion.md §4.4`
- [ ] Создать `src/shared/utils/fingerprint.util.ts` — функция `computeFingerprint()` из `04-ingestion.md §4.4.1`
- [ ] Реализовать `normalizeMessage()` и `normalizeStackTrace()` согласно алгоритму из `04-ingestion.md §4.4.1`
- [ ] Проверить: `yarn build` проходит

### T-022: Тесты для Fingerprint
**Спеки:** `09-testing.md §9.3.1`
- [ ] Создать `test/unit/fingerprint.util.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.1`
- [ ] Проверить: `yarn test fingerprint` — все тесты зелёные

### T-023: ApiKeyGuard
**Спеки:** `03-auth-and-services.md §3.3`
- [ ] Создать `src/shared/guards/api-key.guard.ts` — полная реализация из `03-auth-and-services.md §3.3.1`
- [ ] Создать `src/shared/decorators/current-service.decorator.ts` из `03-auth-and-services.md §3.3.2`
- [ ] Проверить: `yarn build` проходит

### T-024: AdminGuard + AdminAuthService
**Спеки:** `03-auth-and-services.md §3.4`
- [ ] Создать `src/admin/admin-auth.service.ts` из `03-auth-and-services.md §3.4.1`
- [ ] Создать `src/shared/guards/admin.guard.ts` из `03-auth-and-services.md §3.4.2`
- [ ] Установить `jsonwebtoken` + `@types/jsonwebtoken`
- [ ] Проверить: `yarn build` проходит

### T-025: Тесты для ApiKeyGuard
**Спеки:** `09-testing.md §9.3.4`
- [ ] Создать `test/unit/api-key.guard.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.4`
- [ ] Использовать моки из `09-testing.md §9.5`
- [ ] Проверить: `yarn test api-key` — все тесты зелёные

### T-026: Тесты для AdminAuthService
**Спеки:** `09-testing.md §9.3.8`
- [ ] Создать `test/unit/admin-auth.service.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.8`
- [ ] Проверить: `yarn test admin-auth` — все тесты зелёные

---

## Фаза 3: Core Services

### T-030: ServicesService + Module
**Спеки:** `03-auth-and-services.md §3.5`
- [ ] Создать `src/core/services/services.service.ts` — ВСЕ методы из `03-auth-and-services.md §3.5.2`
- [ ] Реализовать `create()` с генерацией API key (§3.2.3 — жизненный цикл)
- [ ] Реализовать `findAll()` с `_count.errorLogs`
- [ ] Реализовать `findById()`
- [ ] Реализовать `update()` с инвалидацией Redis-кэша при изменении `isActive` (§3.5.3)
- [ ] Реализовать `remove()` с инвалидацией кэша
- [ ] Реализовать `regenerateKey()` (§3.2.4)
- [ ] Реализовать `findLogs()` с пагинацией из `07-admin-api.md §7.2.8`
- [ ] Slug validation regex из `03-auth-and-services.md §3.5.3`
- [ ] Создать `src/core/services/services.module.ts` — экспорт ServicesService
- [ ] Проверить: `yarn build` проходит

### T-031: Тесты для ServicesService
**Спеки:** `09-testing.md §9.3.7`
- [ ] Создать `test/unit/services.service.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.7`
- [ ] Проверить: `yarn test services` — все тесты зелёные

### T-032: TelegramFormatterService
**Спеки:** `06-telegram.md §6.5`
- [ ] Создать `src/core/telegram/telegram-formatter.service.ts` — полная реализация из `06-telegram.md §6.5`
- [ ] `formatErrorLog()` — emoji + level + timestamp + message + stack (truncated) + metadata + fingerprint
- [ ] `formatDedupSummary()` — summary с количеством повторов
- [ ] `formatWelcomeMessage()` — приветствие при создании топика
- [ ] HTML escaping: `<`, `>`, `&`
- [ ] Truncation до `TELEGRAM_MAX_MESSAGE_LENGTH`
- [ ] Проверить: `yarn build` проходит

### T-033: Тесты для TelegramFormatterService
**Спеки:** `09-testing.md §9.3.6`
- [ ] Создать `test/unit/telegram-formatter.service.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.6`
- [ ] Проверить: `yarn test telegram-formatter` — все тесты зелёные

### T-034: TelegramService
**Спеки:** `06-telegram.md §6.3, §6.4, §6.7`
- [ ] Создать `src/core/telegram/telegram.service.ts` — полная реализация из `06-telegram.md §6.4`
- [ ] `callApi()` — базовый HTTP-вызов Telegram Bot API через нативный `fetch` (§6.3)
- [ ] `ensureTopicExists()` — ленивое создание топика (§6.4) + Redis lock против race condition (§6.7.1)
- [ ] `sendMessageWithRetry()` — retry с exponential backoff (§6.4)
- [ ] `waitForRateLimit()` — rate limiter через Redis (§6.4)
- [ ] `TelegramApiError` — кастомный класс ошибки
- [ ] Создать `src/core/telegram/telegram.module.ts` из `06-telegram.md §6.6` — экспорт TelegramService
- [ ] Проверить: `yarn build` проходит

### T-035: Тесты для TelegramService
**Спеки:** `09-testing.md §9.3.5`
- [ ] Создать `test/unit/telegram.service.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.5`
- [ ] Мокать global `fetch` через `jest.fn()`
- [ ] Проверить: `yarn test telegram.service` — все тесты зелёные

### T-036: DedupService
**Спеки:** `05-dedup.md §5.2, §5.3, §5.4`
- [ ] Создать `src/core/dedup/dedup.service.ts` — полная реализация из `05-dedup.md §5.4`
- [ ] `checkAndMark()` — SET NX + EX для первого вхождения, Lua INCR для дубликатов (§5.4)
- [ ] `getActiveEntries()` — SCAN по `dedup:*` с count > 1 (§5.4)
- [ ] `clearEntry()` — DEL ключа (§5.4)
- [ ] Lua-скрипт для атомарного инкремента JSON-значения (§5.4)
- [ ] Fallback при недоступности Redis → return false (§5.7.2)
- [ ] Проверить: `yarn build` проходит

### T-037: DedupFlushService
**Спеки:** `05-dedup.md §5.5`
- [ ] Создать `src/core/dedup/dedup-flush.service.ts` — полная реализация из `05-dedup.md §5.5`
- [ ] Cron EVERY_10_SECONDS + проверка TTL ≤ 10 (рекомендация из §5.5.1)
- [ ] `isRunning` guard против параллельного запуска
- [ ] Для каждой записи с count > 1: lookup последний лог → `telegram.sendDedupSummary()`
- [ ] `clearEntry()` после отправки summary
- [ ] Создать `src/core/dedup/dedup.module.ts` из `05-dedup.md §5.6` — экспорт DedupService
- [ ] **Важно:** `ScheduleModule.forRoot()` импортировать в AppModule, НЕ в DedupModule
- [ ] Проверить: `yarn build` проходит

### T-038: Тесты для DedupService
**Спеки:** `09-testing.md §9.3.2`
- [ ] Создать `test/unit/dedup.service.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.2`
- [ ] Использовать Redis mock из `09-testing.md §9.5.2`
- [ ] Проверить: `yarn test dedup` — все тесты зелёные

---

## Фаза 4: HTTP Layer

### T-040: Ingestion DTO
**Спеки:** `04-ingestion.md §4.1`
- [ ] Создать `src/core/ingestion/dto/ingest-log.dto.ts` — полный DTO из `04-ingestion.md §4.1`
- [ ] Декораторы: `@IsEnum(LogLevel)`, `@IsString()`, `@MaxLength(...)`, `@IsOptional()`, `@IsObject()`
- [ ] Swagger-аннотации с `@ApiProperty` и `@example`
- [ ] Проверить: `yarn build` проходит

### T-041: IngestionService
**Спеки:** `04-ingestion.md §4.3`
- [ ] Создать `src/core/ingestion/ingestion.service.ts` — полная оркестрация из `04-ingestion.md §4.3.1`
- [ ] Шаг 1: `computeFingerprint()`
- [ ] Шаг 2: `dedup.checkAndMark()`
- [ ] Шаг 3: `prisma.errorLog.create()`
- [ ] Шаг 4: `telegram.sendErrorLog()` — fire-and-forget (§4.3.2)
- [ ] Validation metadata size (§4.3.2 — `validateMetadataSize()`)
- [ ] Проверить: `yarn build` проходит

### T-042: IngestionController
**Спеки:** `04-ingestion.md §4.2`
- [ ] Создать `src/core/ingestion/ingestion.controller.ts` из `04-ingestion.md §4.2`
- [ ] `POST /logs/ingest` (api prefix добавится автоматически → `/api/logs/ingest`)
- [ ] `@UseGuards(ApiKeyGuard)` + `@CurrentService()` + `@Body() IngestLogDto`
- [ ] Swagger-аннотации: `@ApiTags`, `@ApiOperation`, `@ApiHeader`, `@ApiResponse`
- [ ] Создать `src/core/ingestion/ingestion.module.ts` из `04-ingestion.md §4.7`
- [ ] Импортировать IngestionModule в AppModule
- [ ] Проверить: `yarn build` проходит

### T-043: Тесты для IngestionService
**Спеки:** `09-testing.md §9.3.3`
- [ ] Создать `test/unit/ingestion.service.spec.ts` — ВСЕ кейсы из `09-testing.md §9.3.3`
- [ ] Проверить: `yarn test ingestion` — все тесты зелёные

### T-044: Admin DTOs
**Спеки:** `07-admin-api.md §7.2`
- [ ] Создать `src/admin/dto/login.dto.ts` из `07-admin-api.md §7.2.1`
- [ ] Создать `src/admin/dto/create-service.dto.ts` из `07-admin-api.md §7.2.2` (с Matches regex для slug)
- [ ] Создать `src/admin/dto/update-service.dto.ts` из `07-admin-api.md §7.2.5`
- [ ] Создать `src/admin/dto/logs-query.dto.ts` из `07-admin-api.md §7.2.8` (с пагинацией, фильтрами)
- [ ] Проверить: `yarn build` проходит

### T-045: AdminController + AdminModule
**Спеки:** `07-admin-api.md §7.3, §7.4`
- [ ] Создать `src/admin/admin.controller.ts` — ВСЕ endpoints из `07-admin-api.md §7.3`
  - `POST /admin/login` (без guard)
  - `POST /admin/services` (AdminGuard)
  - `GET /admin/services` (AdminGuard)
  - `GET /admin/services/:id` (AdminGuard)
  - `PATCH /admin/services/:id` (AdminGuard)
  - `DELETE /admin/services/:id` (AdminGuard)
  - `POST /admin/services/:id/regenerate-key` (AdminGuard)
  - `GET /admin/logs` (AdminGuard)
- [ ] Swagger-аннотации для каждого endpoint
- [ ] Создать `src/admin/admin.module.ts` из `07-admin-api.md §7.4`
- [ ] Экспорт AdminAuthService (нужен для AdminGuard)
- [ ] Импортировать AdminModule в AppModule
- [ ] Проверить: `yarn build` проходит

### T-046: Health Check
**Спеки:** `10-deployment.md §10.4`
- [ ] Создать `src/health.controller.ts` из `10-deployment.md §10.4`
- [ ] `GET /api/health` — проверка PostgreSQL + Redis
- [ ] Добавить HealthController в AppModule controllers
- [ ] Проверить: `yarn build` проходит

### T-047: Swagger Setup
**Спеки:** `04-ingestion.md §4.6`
- [ ] Настроить SwaggerModule в `main.ts` из `04-ingestion.md §4.6`
- [ ] Проверить: Swagger UI доступен по `/api/docs` в dev mode

### T-048: GlobalValidationPipe
**Спеки:** `04-ingestion.md §4.5`
- [ ] Убедиться, что ValidationPipe настроен в `main.ts` из `04-ingestion.md §4.5` (whitelist + forbidNonWhitelisted + transform)
- [ ] Проверить: невалидный body → 400 с понятными ошибками

---

## Фаза 5: E2E тесты и финальная сборка

### T-050: E2E тест Ingestion
**Спеки:** `09-testing.md §9.4.1`
- [ ] Создать `test/e2e/ingestion.e2e-spec.ts` — ВСЕ сценарии из `09-testing.md §9.4.1`
- [ ] Мокать Telegram API (не вызываем реальный)
- [ ] Проверить: `yarn test:e2e` проходит

### T-051: E2E тест Admin
**Спеки:** `09-testing.md §9.4.2`
- [ ] Создать `test/e2e/admin.e2e-spec.ts` — ВСЕ сценарии из `09-testing.md §9.4.2`
- [ ] Проверить: `yarn test:e2e` проходит

### T-052: Полная сборка + lint
- [ ] `yarn build` — без ошибок
- [ ] `yarn lint:fix` — без ошибок
- [ ] `yarn lint:errors` — без ошибок
- [ ] `yarn test` — все unit тесты зелёные
- [ ] `yarn test:e2e` — все E2E тесты зелёные
- [ ] Проверить: все modules подключены в AppModule из `10-deployment.md §10.6`

---

## Фаза 6: Документация

### T-060: Документация модулей
**Спеки:** Каждый модуль описывается на основе соответствующей спеки
- [ ] Создать `docs/ingestion.md` — описание модуля ingestion (API, flow, DTO) на основе `04-ingestion.md`
- [ ] Создать `docs/dedup.md` — описание модуля дедупликации (алгоритм, Redis структуры) на основе `05-dedup.md`
- [ ] Создать `docs/services.md` — описание CRUD сервисов, API keys на основе `03-auth-and-services.md`
- [ ] Создать `docs/telegram.md` — описание Telegram интеграции на основе `06-telegram.md`
- [ ] Создать `docs/admin.md` — описание Admin API на основе `07-admin-api.md`

### T-061: Integration Guide
**Спеки:** `08-sdk-client.md §8.2, §8.6, §8.7, §8.8`
- [ ] Создать `docs/integration-guide.md`:
  - Установка SDK
  - Quick Start (5 строк до рабочего примера)
  - NestJS интеграция (module + exception filter) из `08-sdk-client.md §8.2.3, §8.2.4`
  - Express интеграция из `08-sdk-client.md §8.7`
  - Telegram-бот интеграция из `08-sdk-client.md §8.8`
  - Список всех env переменных, необходимых для подключения

### T-062: CLAUDE.MD для LogHub
**Спеки:** Обновить/заполнить CLAUDE.MD для данного сервиса
- [ ] Заполнить Product Overview, Data Flow, Module Dependency Graph, Key Domain Concepts
- [ ] Добавить команды из контекста этого проекта
- [ ] Убедиться, что CLAUDE.MD отражает финальную архитектуру

---

## Фаза 7: SDK Client

### T-070: SDK Package — реализация
**Спеки:** `08-sdk-client.md §8.3, §8.4, §8.5`
- [ ] Создать директорию `packages/loghub-client/`
- [ ] Создать `packages/loghub-client/package.json` из `08-sdk-client.md §8.5.1`
- [ ] Создать `packages/loghub-client/tsconfig.build.json` из `08-sdk-client.md §8.5.2`
- [ ] Создать `packages/loghub-client/src/index.ts` — ПОЛНАЯ реализация из `08-sdk-client.md §8.4.1`
  - `LogHubClient` класс с конструктором (§8.3.1)
  - Методы: `log()`, `debug()`, `info()`, `warn()`, `error()`, `fatal()` (§8.3.2)
  - Retry с exponential backoff
  - Timeout через AbortController
  - `LogHubApiError` класс
  - Нулевые внешние зависимости (нативный fetch)
- [ ] `yarn build` в packages/loghub-client — проходит

### T-071: SDK Package — README
**Спеки:** `08-sdk-client.md §8.6`
- [ ] Создать `packages/loghub-client/README.md` по структуре из `08-sdk-client.md §8.6`
  - Установка
  - Quick Start
  - API Reference
  - NestJS Integration
  - Express Integration
  - Error Handling
  - Configuration

---

## Фаза 8: Деплой

### T-080: Dockerfile
**Спеки:** `10-deployment.md §10.2`
- [ ] Создать `Dockerfile` — multi-stage build из `10-deployment.md §10.2`
- [ ] Build stage → Production stage
- [ ] CMD: `prisma migrate deploy && node dist/main.js`
- [ ] HEALTHCHECK на `/api/health`

### T-081: Railway Config
**Спеки:** `10-deployment.md §10.3`
- [ ] Создать `railway.toml` из `10-deployment.md §10.3.1` (опционально)
- [ ] Документировать настройку переменных окружения из `10-deployment.md §10.3.2`

---

## Порядок и зависимости задач

```
T-000 ─┬─ T-001 ── T-002
       │
       └─ T-010 ── T-011
          T-012
              │
              ▼
T-020 ── T-021 ── T-022
T-023 ── T-024 ── T-025 ── T-026
              │
              ▼
T-030 ── T-031
T-032 ── T-033
T-034 ── T-035
T-036 ── T-037 ── T-038
              │
              ▼
T-040 ── T-041 ── T-042 ── T-043
T-044 ── T-045
T-046 ── T-047 ── T-048
              │
              ▼
T-050 ── T-051 ── T-052
              │
              ▼
T-060 ── T-061 ── T-062
              │
              ▼
T-070 ── T-071
              │
              ▼
T-080 ── T-081
```

---

## Чеклист Definition of Done (по каждой фазе)

- [ ] TypeScript компиляция без ошибок (`yarn build`)
- [ ] `yarn lint:fix` выполнен
- [ ] `yarn lint:errors` проходит
- [ ] Миграции не ломают существующие данные
- [ ] DTO / types / interfaces обновлены
- [ ] Providers добавлены в modules
- [ ] Swagger актуален (для HTTP endpoints)
- [ ] Нет TODO или незавершённого кода
- [ ] Unit тесты для критических путей написаны и зелёные
- [ ] Документация модуля в `docs/` обновлена
