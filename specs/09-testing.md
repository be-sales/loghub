# 09 — Тестирование

## 9.1 Стратегия

| Уровень | Инструмент | Что покрываем | Моки |
|---------|-----------|--------------|------|
| Unit | Jest | Сервисы, утилиты, guards | Prisma, Redis, Telegram API |
| Integration (E2E) | Jest + Supertest | HTTP endpoints целиком | Telegram API, реальная БД (test) |

## 9.2 Настройка Jest

### jest.config.ts

```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@admin/(.*)$': '<rootDir>/src/admin/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@prisma/(.*)$': '<rootDir>/src/prisma/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@redis/(.*)$': '<rootDir>/src/redis/$1',
  },
};

export default config;
```

## 9.3 Обязательные Unit тесты

### 9.3.1 fingerprint.util.spec.ts

```typescript
// Что тестировать:
// 1. Одинаковые входные данные → одинаковый fingerprint
// 2. Разные serviceId → разные fingerprints
// 3. Разные level → разные fingerprints
// 4. Нормализация message: числа убираются → fingerprint одинаковый
//    "Timeout after 3000ms" и "Timeout after 5000ms" → одинаковый
// 5. Нормализация stack: line:col убираются → fingerprint одинаковый
//    "at foo.ts:42:10" и "at foo.ts:99:3" → одинаковый
// 6. Stack trace null vs undefined → одинаковый
// 7. Только первые FINGERPRINT_STACK_LINES строк stack используются
// 8. Пустой message → не падает, возвращает валидный hash
// 9. Очень длинный message → не падает
```

**Полный пример теста:**

```typescript
import { computeFingerprint } from '@shared/utils/fingerprint.util';

describe('computeFingerprint', () => {
  const serviceId = 'svc_test_123';
  const level = 'ERROR';

  it('должен возвращать одинаковый fingerprint для одинаковых данных', () => {
    const fp1 = computeFingerprint(serviceId, level, 'DB error', 'at db.ts:1:1');
    const fp2 = computeFingerprint(serviceId, level, 'DB error', 'at db.ts:1:1');
    expect(fp1).toBe(fp2);
  });

  it('должен возвращать разные fingerprints для разных сервисов', () => {
    const fp1 = computeFingerprint('svc_a', level, 'error', null);
    const fp2 = computeFingerprint('svc_b', level, 'error', null);
    expect(fp1).not.toBe(fp2);
  });

  it('должен нормализовать числа в message', () => {
    const fp1 = computeFingerprint(serviceId, level, 'Timeout after 3000ms', null);
    const fp2 = computeFingerprint(serviceId, level, 'Timeout after 5000ms', null);
    expect(fp1).toBe(fp2);
  });

  it('должен нормализовать line:col в stack trace', () => {
    const fp1 = computeFingerprint(serviceId, level, 'err', 'at foo.ts:42:10');
    const fp2 = computeFingerprint(serviceId, level, 'err', 'at foo.ts:99:3');
    expect(fp1).toBe(fp2);
  });

  it('должен использовать только первые N строк stack trace', () => {
    const stack1 = 'line1\nline2\nline3\nline4\nline5';
    const stack2 = 'line1\nline2\nline3\ndifferent4\ndifferent5';
    const fp1 = computeFingerprint(serviceId, level, 'err', stack1);
    const fp2 = computeFingerprint(serviceId, level, 'err', stack2);
    expect(fp1).toBe(fp2); // Потому что FINGERPRINT_STACK_LINES = 3
  });

  it('должен корректно обрабатывать null stack trace', () => {
    const fp1 = computeFingerprint(serviceId, level, 'err', null);
    const fp2 = computeFingerprint(serviceId, level, 'err', undefined);
    expect(fp1).toBe(fp2);
  });

  it('должен возвращать hex string длиной 64', () => {
    const fp = computeFingerprint(serviceId, level, 'err', null);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

### 9.3.2 dedup.service.spec.ts

```typescript
// Что тестировать:
// 1. Первый вызов checkAndMark → возвращает false (не дубликат)
// 2. Второй вызов с тем же fingerprint → возвращает true (дубликат)
// 3. SET NX вызывается с правильными параметрами (EX, NX)
// 4. INCR вызывается при дубликате (через Lua script)
// 5. getActiveEntries возвращает только записи с count > 1
// 6. clearEntry удаляет ключ
// 7. Redis недоступен → checkAndMark возвращает false (fallback)

// Моки:
// - RedisService: mockSet, mockGet, mockDel, mockScan, mockEval, mockIncr
```

### 9.3.3 ingestion.service.spec.ts

```typescript
// Что тестировать:
// 1. Нормальный flow: compute fingerprint → dedup check → persist → publish
// 2. Дедуплицированный flow: persist с telegramSent=false, telegram НЕ вызывается
// 3. Telegram ошибка → лог всё равно сохраняется, ответ 201
// 4. Metadata size validation (> MAX_METADATA_SIZE_BYTES → 413)
// 5. Возвращает корректный IngestResponseDto

// Моки:
// - PrismaService: mockErrorLogCreate
// - DedupService: mockCheckAndMark
// - TelegramService: mockSendErrorLog
```

### 9.3.4 api-key.guard.spec.ts

```typescript
// Что тестировать:
// 1. Нет заголовка X-API-Key → 401
// 2. Неверный формат (без sk_live_ prefix) → 401
// 3. Несуществующий ключ → 401
// 4. Деактивированный сервис → 401
// 5. Валидный ключ из Redis кэша → пропускает, serviceContext установлен
// 6. Cache miss → Prisma lookup → кэш → пропускает
// 7. Установка request.serviceContext после успешной авторизации

// Моки:
// - RedisService: mockGet, mockSet
// - PrismaService: mockServiceFindUnique
```

### 9.3.5 telegram.service.spec.ts

```typescript
// Что тестировать:
// 1. sendErrorLog → если topicId есть, отправляет в существующий
// 2. sendErrorLog → если topicId null, создаёт новый топик, обновляет БД
// 3. Retry при 429 (rate limit) → ждёт retry_after, повторяет
// 4. Retry при сетевой ошибке → exponential backoff
// 5. Все 3 retry failed → бросает ошибку (не зацикливается)
// 6. Rate limiter: не отправляет > TELEGRAM_RATE_LIMIT_PER_SECOND за секунду
// 7. createForumTopic вызывается с правильными параметрами (name, icon_color)
// 8. sendDedupSummary → форматирует и отправляет summary

// Моки:
// - global fetch (jest.fn())
// - PrismaService: mockServiceFindUniqueOrThrow, mockServiceUpdate
// - RedisService: mockIncr, mockExpire
// - TelegramFormatterService: mockFormatErrorLog, mockFormatDedupSummary
```

### 9.3.6 telegram-formatter.service.spec.ts

```typescript
// Что тестировать:
// 1. formatErrorLog → содержит emoji, level, timestamp, message
// 2. formatErrorLog → stack trace обрезается до 15 строк
// 3. formatErrorLog → metadata форматируется как JSON
// 4. formatErrorLog → общая длина ≤ TELEGRAM_MAX_MESSAGE_LENGTH
// 5. formatErrorLog → HTML escaping (< > & → &lt; &gt; &amp;)
// 6. formatDedupSummary → содержит repeatCount и windowSeconds
// 7. formatWelcomeMessage → содержит имя и slug сервиса
// 8. levelEmoji → правильные эмодзи для каждого уровня
```

### 9.3.7 services.service.spec.ts

```typescript
// Что тестировать:
// 1. create → генерирует API key, сохраняет hash, возвращает plain key
// 2. create → дубликат slug → ConflictException
// 3. findAll → возвращает список с _count
// 4. update с isActive=false → инвалидирует Redis кэш
// 5. remove → каскадное удаление + инвалидация кэша
// 6. regenerateKey → новый hash в БД, старый кэш удалён

// Моки:
// - PrismaService
// - RedisService
```

### 9.3.8 admin-auth.service.spec.ts

```typescript
// Что тестировать:
// 1. login с правильными credentials → JWT
// 2. login с неправильными → UnauthorizedException
// 3. verifyToken → валидный токен → payload
// 4. verifyToken → истёкший токен → UnauthorizedException
// 5. verifyToken → невалидный токен → UnauthorizedException
```

## 9.4 E2E тесты

### 9.4.1 ingestion.e2e-spec.ts

```typescript
// Тестовый сценарий:
// 1. Setup: создать тестовый сервис с API key
// 2. POST /api/logs/ingest с валидным ключом → 201
// 3. POST /api/logs/ingest без ключа → 401
// 4. POST /api/logs/ingest с невалидным body → 400
// 5. POST /api/logs/ingest дважды за 3 мин → первый 201 deduplicated=false, второй 201 deduplicated=true
// 6. Teardown: удалить тестовый сервис

// Моки:
// - Telegram API (не вызываем реальный Telegram в тестах)
// - Redis: реальный (если доступен) или mock
```

### 9.4.2 admin.e2e-spec.ts

```typescript
// Тестовый сценарий:
// 1. POST /api/admin/login → получить JWT
// 2. POST /api/admin/services → создать сервис, получить API key
// 3. GET /api/admin/services → сервис в списке
// 4. PATCH /api/admin/services/:id → обновить name
// 5. POST /api/admin/services/:id/regenerate-key → новый ключ
// 6. GET /api/admin/logs → пустой список (или после ingestion)
// 7. DELETE /api/admin/services/:id → удалён
// 8. Все endpoints без JWT → 401
```

## 9.5 Тестовые утилиты

### 9.5.1 Фабрика моков для Prisma

```typescript
// test/utils/prisma-mock.ts
export function createPrismaMock() {
  return {
    service: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    errorLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}
```

### 9.5.2 Фабрика моков для Redis

```typescript
// test/utils/redis-mock.ts
export function createRedisMock() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    scan: jest.fn().mockResolvedValue(['0', []]),
    eval: jest.fn(),
    ttl: jest.fn(),
  };
}
```

## 9.6 Команды запуска

```bash
# Все unit тесты
yarn test

# Конкретный файл
yarn test fingerprint
yarn test dedup

# Watch mode
yarn test:watch

# Coverage
yarn test:cov

# E2E (нужна тестовая БД)
yarn test:e2e
```

## 9.7 Что НЕ тестируем

- `main.ts` (bootstrap) — конфигурация, не логика
- `*.module.ts` — декларативные NestJS модули
- `*.dto.ts` — декораторы class-validator (проверяются через E2E)
- Прямые вызовы Prisma/Redis (мокаем, не тестируем инфраструктуру)
