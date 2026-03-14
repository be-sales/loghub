# IngestionModule

## Назначение

Модуль приёма логов ошибок от внешних сервисов через HTTP API. Оркестрирует поток: fingerprint → дедупликация → сохранение в БД → отправка в Telegram (fire-and-forget).

## Endpoint

```
POST /api/logs/ingest
```

Header: `X-API-Key: sk_live_...`
Guard: `ApiKeyGuard` (resolve serviceId → проверка isActive → inject `ServiceContext`)

## Тело запроса (IngestLogDto)

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `level` | `LogLevel` (DEBUG, INFO, WARN, ERROR, FATAL) | ✅ | Уровень ошибки |
| `message` | `string` (max 2000) | ✅ | Текст ошибки |
| `stackTrace` | `string` (max 10 000) | — | Stack trace |
| `metadata` | `Record<string, unknown>` (max 50KB) | — | Произвольные метаданные |

## Ответ (IngestResponseDto)

HTTP 201:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` (cuid) | ID созданного лога |
| `fingerprint` | `string` (SHA-256 hex, 64 символа) | Fingerprint ошибки |
| `deduplicated` | `boolean` | `true` = дубликат, Telegram не отправлен |

## Поток обработки (IngestionService.ingest)

1. **Валидация metadata size** — `Buffer.byteLength(JSON.stringify(metadata))` > `MAX_METADATA_SIZE_BYTES` → `PayloadTooLargeException` (413)
2. **Fingerprint** — `SHA-256(serviceId|level|normalizedMessage|first3StackLines)` через `computeFingerprint()`
3. **Dedup check** — `DedupService.checkAndMark()` → Redis `SET NX EX 180`
   - `OK` = первое вхождение → `isDuplicate = false`
   - `null` = дубликат → Lua-инкремент счётчика → `isDuplicate = true`
4. **Persist** — `Prisma ErrorLog.create()` — ВСЕГДА, даже дубликаты. Поле `telegramSent = !isDuplicate`
5. **Telegram** — только если `!isDuplicate`. Fire-and-forget через `.catch()` с логированием

## Коды ответов

| Код | Описание |
|-----|----------|
| 201 | Лог принят и сохранён |
| 400 | Невалидные данные (ValidationPipe) |
| 401 | Неверный API-ключ или деактивированный сервис |
| 413 | Metadata превышает лимит 50KB |

## Константы

| Константа | Значение | Описание |
|-----------|----------|----------|
| `MAX_MESSAGE_LENGTH` | `2_000` | Макс. длина сообщения |
| `MAX_STACK_TRACE_LENGTH` | `10_000` | Макс. длина stack trace |
| `MAX_METADATA_SIZE_BYTES` | `50_000` | Макс. размер metadata (50KB) |
| `FINGERPRINT_STACK_LINES` | `3` | Строк stack для fingerprint |

## Расположение

- Контроллер: `src/core/ingestion/ingestion.controller.ts`
- Сервис: `src/core/ingestion/ingestion.service.ts`
- DTO: `src/core/ingestion/dto/ingest-log.dto.ts`, `src/core/ingestion/dto/ingest-response.dto.ts`
- Модуль: `src/core/ingestion/ingestion.module.ts`
- Тесты: `test/unit/ingestion.service.spec.ts`
