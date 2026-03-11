# 04 — Приём логов (Ingestion)

## 4.1 Endpoint

```
POST /api/logs/ingest
```

### Headers

| Header | Тип | Обязательный | Описание |
|--------|-----|-------------|----------|
| `X-API-Key` | string | ✅ | API-ключ зарегистрированного сервиса |
| `Content-Type` | string | ✅ | `application/json` |

### Request Body (IngestLogDto)

```typescript
import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
  IsObject,
} from 'class-validator';
import { LogLevel } from '@shared/enums/log-level.enum';
import {
  MAX_MESSAGE_LENGTH,
  MAX_STACK_TRACE_LENGTH,
} from '@shared/constants';

export class IngestLogDto {
  /**
   * Уровень ошибки
   * @example "ERROR"
   */
  @IsEnum(LogLevel)
  level: LogLevel;

  /**
   * Текст ошибки
   * @example "Cannot read properties of undefined (reading 'id')"
   */
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  message: string;

  /**
   * Stack trace (опционально)
   * @example "TypeError: Cannot read properties of undefined\n    at UserService.findById (/app/src/user.service.ts:42:15)"
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_STACK_TRACE_LENGTH)
  stackTrace?: string;

  /**
   * Произвольные метаданные для контекста ошибки
   * @example { "userId": "usr_123", "requestId": "req_456", "url": "/api/users/123" }
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
```

### Response — 201 Created

```typescript
interface IngestResponseDto {
  /** ID созданного лога */
  id: string;
  /** Fingerprint ошибки для reference */
  fingerprint: string;
  /** Был ли лог дедуплицирован (true = не отправлен в Telegram) */
  deduplicated: boolean;
}
```

### Response — Ошибки

| Код | Ситуация | Body |
|-----|---------|------|
| 400 | Невалидный body | `{ statusCode: 400, message: ["level must be..."], error: "Bad Request" }` |
| 401 | Нет/неверный API key | `{ statusCode: 401, message: "...", error: "Unauthorized" }` |
| 413 | Metadata > 50KB | `{ statusCode: 413, message: "Metadata exceeds size limit" }` |
| 429 | Rate limit (опционально, на будущее) | `{ statusCode: 429, message: "Too many requests" }` |
| 500 | Internal error | `{ statusCode: 500, message: "Internal server error" }` |

## 4.2 IngestionController (core/ingestion/ingestion.controller.ts)

```typescript
import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ApiKeyGuard } from '@shared/guards/api-key.guard';
import { CurrentService, ServiceContext } from '@shared/decorators/current-service.decorator';
import { IngestionService } from './ingestion.service';
import { IngestLogDto } from './dto/ingest-log.dto';

@ApiTags('Логи')
@Controller('logs')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('ingest')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Приём лога ошибки от внешнего сервиса' })
  @ApiHeader({ name: 'X-API-Key', description: 'API-ключ сервиса', required: true })
  @ApiResponse({ status: 201, description: 'Лог принят' })
  @ApiResponse({ status: 400, description: 'Невалидные данные' })
  @ApiResponse({ status: 401, description: 'Неверный API-ключ' })
  async ingest(
    @CurrentService() service: ServiceContext,
    @Body() dto: IngestLogDto,
  ): Promise<IngestResponseDto> {
    return this.ingestionService.ingest(service.serviceId, dto);
  }
}
```

**ВАЖНО:** Контроллер — тонкий. Никакой бизнес-логики. Только Guard + DTO + вызов сервиса.

## 4.3 IngestionService (core/ingestion/ingestion.service.ts)

### 4.3.1 Оркестрация

`IngestionService` — центральный orchestrator. Он координирует:

1. Вычисление fingerprint
2. Проверку дедупликации
3. Персистентность лога
4. Отправку в Telegram (если не дедуплицировано)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { DedupService } from '@core/dedup/dedup.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { computeFingerprint } from '@shared/utils/fingerprint.util';
import { IngestLogDto } from './dto/ingest-log.dto';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dedup: DedupService,
    private readonly telegram: TelegramService,
  ) {}

  async ingest(serviceId: string, dto: IngestLogDto): Promise<IngestResponseDto> {
    // 1. Fingerprint
    const fingerprint = computeFingerprint(serviceId, dto.level, dto.message, dto.stackTrace);

    // 2. Dedup check
    const isDuplicate = await this.dedup.checkAndMark(fingerprint, serviceId);

    // 3. Persist (всегда, даже дубликаты — для аналитики)
    const log = await this.prisma.errorLog.create({
      data: {
        serviceId,
        level: dto.level,
        message: dto.message,
        stackTrace: dto.stackTrace ?? null,
        metadata: dto.metadata ?? undefined,
        fingerprint,
        telegramSent: !isDuplicate,
      },
    });

    // 4. Publish to Telegram (only if not duplicate)
    if (!isDuplicate) {
      // Fire-and-forget с логированием ошибок
      // НЕ блокируем ответ клиенту из-за Telegram
      this.publishToTelegram(serviceId, log.id, dto, fingerprint).catch((error) => {
        this.logger.error(
          `Не удалось отправить в Telegram: serviceId=${serviceId}, logId=${log.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    }

    return {
      id: log.id,
      fingerprint,
      deduplicated: isDuplicate,
    };
  }

  private async publishToTelegram(
    serviceId: string,
    logId: string,
    dto: IngestLogDto,
    fingerprint: string,
  ): Promise<void> {
    await this.telegram.sendErrorLog(serviceId, {
      logId,
      level: dto.level,
      message: dto.message,
      stackTrace: dto.stackTrace,
      metadata: dto.metadata,
      fingerprint,
    });

    // Обновляем telegramSent, если отправка по какой-то причине
    // была отложена и пометили как false
    // (В нормальном flow уже true, но для надёжности)
  }
}
```

### 4.3.2 Ключевые решения

**Fire-and-forget для Telegram:** Ответ клиенту (201) НЕ зависит от успеха отправки в Telegram. Лог всегда сохраняется в БД. Telegram-отправка — best effort. Если упала — логируем ошибку, лог остаётся в БД с `telegramSent: false` (но мы ставим true оптимистично). В будущем можно добавить retry queue.

**Metadata size check:** Размер metadata проверяется middleware или custom validator (не в DTO — `class-validator` не проверяет размер JSON). Реализовать как `@ValidateMetadataSize()` custom decorator или проверку в сервисе:

```typescript
private validateMetadataSize(metadata?: Record<string, unknown>): void {
  if (!metadata) return;
  const size = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
  if (size > MAX_METADATA_SIZE_BYTES) {
    throw new PayloadTooLargeException(
      `Metadata превышает лимит ${MAX_METADATA_SIZE_BYTES} байт (получено: ${size})`,
    );
  }
}
```

## 4.4 Fingerprint (shared/utils/fingerprint.util.ts)

### 4.4.1 Алгоритм

Fingerprint — SHA-256 хеш от нормализованных данных ошибки. Цель: одинаковые ошибки от одного сервиса должны давать одинаковый fingerprint, даже если timestamps и dynamic data отличаются.

```typescript
import { createHash } from 'crypto';
import { FINGERPRINT_STACK_LINES } from '@shared/constants';

/**
 * Вычисляет fingerprint ошибки для дедупликации.
 *
 * Формула: SHA-256(serviceId + level + normalizedMessage + first N lines of stack)
 *
 * Нормализация:
 * - Удаляются числа из сообщения (timestamps, IDs)
 * - Stack trace обрезается до первых FINGERPRINT_STACK_LINES строк
 * - Из stack trace удаляются номера строк/колонок
 */
export function computeFingerprint(
  serviceId: string,
  level: string,
  message: string,
  stackTrace?: string | null,
): string {
  const normalizedMessage = normalizeMessage(message);
  const normalizedStack = normalizeStackTrace(stackTrace);

  const input = [serviceId, level, normalizedMessage, normalizedStack].join('|');

  return createHash('sha256').update(input).digest('hex');
}

/**
 * Нормализует сообщение: удаляет dynamic data
 * "User usr_abc123 not found" → "User  not found"
 * "Timeout after 3000ms" → "Timeout after ms"
 */
function normalizeMessage(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8,}\b/gi, '')       // hex IDs
    .replace(/\b\d+(\.\d+)?\b/g, '')          // числа
    .replace(/usr_\w+/g, '')                   // user IDs
    .replace(/req_\w+/g, '')                   // request IDs
    .replace(/\s+/g, ' ')                      // нормализация пробелов
    .trim();
}

/**
 * Нормализует stack trace: берёт первые N строк, убирает line:col
 */
function normalizeStackTrace(stackTrace?: string | null): string {
  if (!stackTrace) return '';

  return stackTrace
    .split('\n')
    .slice(0, FINGERPRINT_STACK_LINES)
    .map((line) => line.replace(/:\d+:\d+/g, ''))   // убираем :line:col
    .join('\n')
    .trim();
}
```

### 4.4.2 Примеры

```
Вход:
  serviceId: "clz1abc..."
  level: "ERROR"
  message: "Cannot connect to DB after 5000ms, attempt 3"
  stackTrace: "Error: Cannot connect to DB\n    at DbService.connect (/app/src/db.ts:42:10)\n    at ..."

Нормализовано:
  message: "Cannot connect to DB after ms, attempt"
  stack: "Error: Cannot connect to DB\n    at DbService.connect (/app/src/db.ts)\n    at ..."

Fingerprint: sha256("clz1abc...|ERROR|Cannot connect to DB after ms, attempt|Error: Cannot connect to DB\n    at DbService.connect (/app/src/db.ts)\n    at ...")
→ "a3f8c1..."
```

## 4.5 Валидация (ValidationPipe)

Настроить глобально в `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,               // Удаляет неизвестные поля
    forbidNonWhitelisted: true,    // Бросает ошибку если неизвестные поля
    transform: true,               // Автоматическая трансформация типов
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

## 4.6 Swagger

Swagger доступен по `/api/docs`. Все комментарии на русском.

```typescript
// main.ts
const swaggerConfig = new DocumentBuilder()
  .setTitle('LogHub API')
  .setDescription('Централизованный сервис сбора и публикации error-логов')
  .setVersion('1.0')
  .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, swaggerConfig);
SwaggerModule.setup('api/docs', app, document);
```

## 4.7 Module (core/ingestion/ingestion.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DedupModule } from '@core/dedup/dedup.module';
import { TelegramModule } from '@core/telegram/telegram.module';

@Module({
  imports: [DedupModule, TelegramModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
```
