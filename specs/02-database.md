# 02 — База данных (Prisma Schema)

## 2.1 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// Зарегистрированный внешний сервис, отправляющий логи
model Service {
  id          String     @id @default(cuid())
  /// Человекочитаемое имя сервиса (отображается в Telegram топике)
  name        String     @db.VarChar(100)
  /// Уникальный slug для идентификации (латиница, kebab-case)
  slug        String     @unique @db.VarChar(50)
  /// Хеш API-ключа (sha256). Оригинальный ключ НЕ хранится
  apiKeyHash  String     @unique @map("api_key_hash") @db.VarChar(64)
  /// Последние 4 символа ключа для отображения в админке
  apiKeyLast4 String     @map("api_key_last4") @db.VarChar(4)
  /// ID топика в Telegram форуме. null = топик ещё не создан
  topicId     Int?       @map("topic_id")
  /// Флаг активности. Неактивный сервис не может отправлять логи
  isActive    Boolean    @default(true) @map("is_active")
  /// Описание сервиса (опционально)
  description String?    @db.VarChar(500)
  /// Дата создания
  createdAt   DateTime   @default(now()) @map("created_at")
  /// Дата последнего обновления
  updatedAt   DateTime   @updatedAt @map("updated_at")

  /// Связь с логами
  errorLogs   ErrorLog[]

  @@map("services")
}

/// Лог ошибки, полученный от внешнего сервиса
model ErrorLog {
  id            String   @id @default(cuid())
  /// Ссылка на сервис-источник
  serviceId     String   @map("service_id")
  /// Уровень ошибки
  level         LogLevel
  /// Текст ошибки
  message       String   @db.VarChar(2000)
  /// Stack trace (опционально)
  stackTrace    String?  @map("stack_trace") @db.Text
  /// Произвольные метаданные (userId, requestId, url и т.д.)
  metadata      Json?    @db.JsonB
  /// SHA-256 fingerprint для дедупликации
  fingerprint   String   @db.VarChar(64)
  /// Было ли сообщение отправлено в Telegram (false = дедуплицировано)
  telegramSent  Boolean  @default(false) @map("telegram_sent")
  /// Дата создания
  createdAt     DateTime @default(now()) @map("created_at")

  /// Связь с сервисом
  service       Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@index([serviceId, createdAt(sort: Desc)], name: "idx_errorlog_service_created")
  @@index([fingerprint, createdAt(sort: Desc)], name: "idx_errorlog_fingerprint_created")
  @@index([level, createdAt(sort: Desc)], name: "idx_errorlog_level_created")
  @@index([createdAt(sort: Desc)], name: "idx_errorlog_created")
  @@map("error_logs")
}

/// Уровни логирования
enum LogLevel {
  DEBUG
  INFO
  WARN
  ERROR
  FATAL

  @@map("log_level")
}
```

## 2.2 Обоснование решений

### 2.2.1 Почему `cuid()` вместо `uuid()`

- Сortable по времени (полезно для пагинации)
- Короче UUID
- Collision-resistant

### 2.2.2 Почему `apiKeyHash` а не `apiKey`

API-ключ хранится только в виде SHA-256 хеша. Оригинальный ключ показывается пользователю **один раз** при создании сервиса и больше нигде не сохраняется. Это стандартная практика безопасности (аналог GitHub tokens, Stripe API keys).

`apiKeyLast4` — последние 4 символа оригинального ключа для отображения в админке: `sk_live_****...abc1`.

### 2.2.3 Почему `topicId: Int?`

Топик в Telegram создаётся лениво — при первой ошибке от сервиса. До этого `topicId = null`. После создания заполняется и больше не меняется.

### 2.2.4 Индексы

| Индекс | Назначение |
|--------|-----------|
| `idx_errorlog_service_created` | Фильтрация логов по сервису + сортировка по дате (основной запрос в админке) |
| `idx_errorlog_fingerprint_created` | Lookup по fingerprint для DedupFlushService (поиск последнего лога с этим fingerprint) |
| `idx_errorlog_level_created` | Фильтрация по уровню ошибки + сортировка |
| `idx_errorlog_created` | Общий список логов с сортировкой по дате |

### 2.2.5 Каскадное удаление

`onDelete: Cascade` на `ErrorLog.service` — при удалении сервиса удаляются все его логи. Это осознанное решение: если сервис удалён, его логи не имеют ценности.

## 2.3 Миграции

### Создание начальной миграции

```bash
npx prisma migrate dev --name init
```

### Генерация Prisma Client

```bash
npx prisma generate
```

**ЗАПРЕТ:** Никогда не использовать `npx prisma db push --accept-data-loss` или `--reset`. Только `migrate dev --name {name}`.

## 2.4 PrismaService (src/prisma/prisma.service.ts)

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

**PrismaModule:**
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

## 2.5 Redis-структуры (не Prisma, но часть data layer)

### 2.5.1 Дедупликация

```
Ключ:    dedup:{fingerprint}
Значение: JSON string { "count": number, "serviceId": string, "firstLogId": string }
TTL:     180 секунд (DEDUP_WINDOW_SECONDS)
```

### 2.5.2 Кэш API-ключей

```
Ключ:    apikey:{apiKeyHash}
Значение: JSON string { "serviceId": string, "slug": string, "isActive": boolean }
TTL:     300 секунд (API_KEY_CACHE_TTL_SECONDS)
```

### 2.5.3 Rate limiter Telegram

```
Ключ:    tg_rate:{second_timestamp}
Значение: counter (INCR)
TTL:     2 секунды
```

## 2.6 Seed (опционально)

Для dev-окружения можно создать seed с тестовым сервисом:

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apiKey = `sk_live_${randomBytes(16).toString('hex')}`;
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

  await prisma.service.upsert({
    where: { slug: 'test-service' },
    update: {},
    create: {
      name: 'Test Service',
      slug: 'test-service',
      apiKeyHash,
      apiKeyLast4: apiKey.slice(-4),
      description: 'Тестовый сервис для разработки',
    },
  });

  console.log(`Test service API key: ${apiKey}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Добавить в `package.json`:
```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```
