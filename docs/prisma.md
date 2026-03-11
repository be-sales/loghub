# PrismaModule

## Назначение

Глобальный модуль для работы с PostgreSQL через Prisma ORM. Предоставляет `PrismaService` всем модулям приложения без явного импорта.

## Schema

### Модели

#### Service

Зарегистрированный внешний сервис, отправляющий логи.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `String` (cuid) | Первичный ключ |
| `name` | `VarChar(100)` | Человекочитаемое имя |
| `slug` | `VarChar(50)` | Уникальный slug (kebab-case) |
| `apiKeyHash` | `VarChar(64)` | SHA-256 хеш API-ключа |
| `apiKeyLast4` | `VarChar(4)` | Последние 4 символа ключа |
| `topicId` | `Int?` | ID топика в Telegram форуме |
| `isActive` | `Boolean` | Флаг активности |
| `description` | `VarChar(500)?` | Описание сервиса |
| `createdAt` | `DateTime` | Дата создания |
| `updatedAt` | `DateTime` | Дата обновления |

#### ErrorLog

Лог ошибки от внешнего сервиса.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `String` (cuid) | Первичный ключ |
| `serviceId` | `String` | FK → Service |
| `level` | `LogLevel` | Уровень ошибки |
| `message` | `VarChar(2000)` | Текст ошибки |
| `stackTrace` | `Text?` | Stack trace |
| `metadata` | `JsonB?` | Произвольные метаданные |
| `fingerprint` | `VarChar(64)` | SHA-256 fingerprint для дедупликации |
| `telegramSent` | `Boolean` | Отправлено ли в Telegram |
| `createdAt` | `DateTime` | Дата создания |

### Индексы

| Индекс | Поля | Назначение |
|--------|------|-----------|
| `idx_errorlog_service_created` | `serviceId, createdAt DESC` | Фильтр по сервису + сортировка |
| `idx_errorlog_fingerprint_created` | `fingerprint, createdAt DESC` | Lookup для DedupFlushService |
| `idx_errorlog_level_created` | `level, createdAt DESC` | Фильтр по уровню |
| `idx_errorlog_created` | `createdAt DESC` | Общий список с сортировкой |

### Enum LogLevel

`DEBUG` | `INFO` | `WARN` | `ERROR` | `FATAL`

## PrismaService API

Наследует `PrismaClient`. Lifecycle:

- `onModuleInit()` — вызывает `$connect()`, подключается к PostgreSQL
- `onModuleDestroy()` — вызывает `$disconnect()`, закрывает подключение

## Миграции

```bash
yarn prisma migrate dev --name <name>   # Создание миграции (dev)
yarn prisma migrate deploy              # Применение миграций (production)
yarn prisma generate                    # Генерация Prisma Client
```

**Запрещено:** `db push --accept-data-loss`, `--reset`.

## Seed

```bash
yarn prisma db seed
```

Создаёт тестовый сервис `test-service` с API-ключом. Ключ выводится в консоль один раз — сохраните его.

## Использование

```typescript
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class SomeService {
  constructor(private readonly prisma: PrismaService) {}

  async findLogs(serviceId: string) {
    return this.prisma.errorLog.findMany({
      where: { serviceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```
