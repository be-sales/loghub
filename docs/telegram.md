# TelegramModule

## Назначение

Отправка логов ошибок и dedup summary в Telegram Forum group. Ленивое создание топиков (один топик = один сервис). Rate limiting, retry с exponential backoff, HTML formatting. Использует нативный `fetch` (без SDK).

## TelegramService API

| Метод | Описание |
|-------|----------|
| `sendErrorLog(serviceId, payload)` | Форматирует и отправляет лог ошибки в топик сервиса |
| `sendDedupSummary(serviceId, payload)` | Отправляет summary дедупликации в топик |

Оба метода автоматически создают топик через `ensureTopicExists()`, если он ещё не существует.

## Создание топиков (ensureTopicExists)

1. Чтение `service.topicId` из БД
2. Если `topicId !== null` → вернуть (топик уже есть)
3. Redis lock: `SET topic_lock:{serviceId} 1 EX 30 NX`
   - **Lock acquired** → Telegram API `createForumTopic` → сохранить `topicId` в БД → welcome message (best-effort)
   - **Lock NOT acquired** → wait `TELEGRAM_TOPIC_LOCK_WAIT_MS` (2s) → re-check БД → throw если всё ещё `null`
4. Lock снимается в `finally` (только захватившим инстансом)

**Имя топика:** `🔴 {serviceName}`
**Цвет иконки:** `TELEGRAM_TOPIC_ICON_COLOR = 0xfb6f5f`

## Rate Limiting

Redis-based rate limiter:

```
Ключ:    tg_rate:{second_timestamp}
Операция: INCR + EXPIRE (TTL 2s)
Лимит:   TELEGRAM_RATE_LIMIT_PER_SECOND = 20
```

При превышении лимита — ожидание до следующей секунды.

## Retry

| Параметр | Значение | Описание |
|----------|----------|----------|
| Попыток | `TELEGRAM_RETRY_ATTEMPTS = 3` | Макс. количество попыток |
| 429 (rate limit) | `retry_after` из ответа Telegram | Задержка при throttle |
| Другие ошибки | `TELEGRAM_RETRY_DELAY_MS * 2^(attempt-1)` | Exponential backoff |
| Последняя попытка | `throw` | Не глотаем ошибку |

## TelegramFormatterService

### formatErrorLog

```
🔴 ERROR | 2026-03-10 14:32:05

Cannot connect to database after timeout

📋 Stack:
<code>Error: Connection timeout
    at DbService.connect (/app/src/db.ts:42:10)</code>

📎 Metadata:
<code>{"userId":"usr_123"}</code>

🔑 abc1def2
```

- Emoji по уровню: DEBUG ⚪, INFO 🔵, WARN 🟡, ERROR 🔴, FATAL 💀
- Stack trace: макс. `TELEGRAM_STACK_MAX_LINES = 15` строк
- Metadata: макс. `TELEGRAM_METADATA_MAX_LENGTH = 500` символов
- Fingerprint: первые 8 символов
- Общая обрезка до `TELEGRAM_MAX_MESSAGE_LENGTH = 4096` с корректным закрытием HTML-тегов

### formatDedupSummary

```
⚠️ Ошибка повторилась ещё 47 раз за 3 мин

🔴 ERROR: Cannot connect to database
```

Message обрезается до `TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH = 200`.

### formatWelcomeMessage

```
🔧 Топик создан для сервиса "Мой сайт"

Slug: my-website
Все ошибки этого сервиса будут публиковаться в этот топик.
```

### HTML escaping

Порядок критичен: `&` экранируется ПЕРВЫМ, затем `<`, затем `>`.

## Конфигурация

| Переменная | Описание | Пример |
|------------|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Токен бота (формат `{bot_id}:{token}`) | `123456789:AABBCCDDEEFFaabb...` |
| `TELEGRAM_FORUM_CHAT_ID` | ID чата-форума (отрицательное число для групп) | `-1001234567890` |

## Константы

| Константа | Значение | Описание |
|-----------|----------|----------|
| `TELEGRAM_MAX_MESSAGE_LENGTH` | `4096` | Макс. длина сообщения |
| `TELEGRAM_RATE_LIMIT_PER_SECOND` | `20` | Лимит сообщений в секунду |
| `TELEGRAM_RETRY_ATTEMPTS` | `3` | Количество попыток отправки |
| `TELEGRAM_RETRY_DELAY_MS` | `1000` | Базовая задержка retry (мс) |
| `TELEGRAM_STACK_MAX_LINES` | `15` | Макс. строк stack в сообщении |
| `TELEGRAM_METADATA_MAX_LENGTH` | `500` | Макс. символов metadata |
| `TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH` | `200` | Макс. символов message в summary |
| `TELEGRAM_TOPIC_LOCK_PREFIX` | `'topic_lock:'` | Префикс Redis-блокировки |
| `TELEGRAM_TOPIC_LOCK_TTL_SECONDS` | `30` | TTL блокировки (сек) |
| `TELEGRAM_TOPIC_LOCK_WAIT_MS` | `2000` | Ожидание при занятом lock (мс) |
| `TELEGRAM_RATE_LIMIT_PREFIX` | `'tg_rate:'` | Префикс Redis rate limiter |
| `TELEGRAM_RATE_LIMIT_TTL_SECONDS` | `2` | TTL rate limiter (сек) |
| `TELEGRAM_API_BASE_URL` | `'https://api.telegram.org'` | Базовый URL API |
| `TELEGRAM_TOPIC_ICON_COLOR` | `0xfb6f5f` | Цвет иконки топика |

## Расположение

- TelegramService: `src/core/telegram/telegram.service.ts`
- TelegramFormatterService: `src/core/telegram/telegram-formatter.service.ts`
- Модуль: `src/core/telegram/telegram.module.ts`
- Тесты: `test/unit/telegram.service.spec.ts`, `test/unit/telegram-formatter.service.spec.ts`
