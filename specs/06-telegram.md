# 06 — Telegram Integration

## 6.1 Концепция

Бот публикует ошибки в Telegram-группу формата **Forum** (группа с топиками). Каждый зарегистрированный сервис получает свой топик. Топик создаётся автоматически при первой ошибке от сервиса.

## 6.2 Предварительная настройка

### 6.2.1 Создание бота

1. Создать бота через @BotFather → получить `TELEGRAM_BOT_TOKEN`
2. Включить: `/setprivacy` → Disable (бот видит все сообщения, хотя ему это не нужно — просто на всякий)

### 6.2.2 Настройка группы

1. Создать группу в Telegram
2. Включить «Темы» (Topics) в настройках группы → группа становится Forum
3. Добавить бота в группу как **администратора** с правами:
   - `can_manage_topics` — создание/управление топиками
   - `can_post_messages` — отправка сообщений
4. Получить `chat_id` группы (отрицательное число, начинается с `-100...`)
   - Способ: отправить сообщение в группу, затем `https://api.telegram.org/bot{TOKEN}/getUpdates`
5. Записать `TELEGRAM_FORUM_CHAT_ID` в `.env`

## 6.3 Telegram API — используемые методы

### 6.3.1 Создание топика

```
POST https://api.telegram.org/bot{TOKEN}/createForumTopic
{
  "chat_id": TELEGRAM_FORUM_CHAT_ID,
  "name": "🔴 astro-bot",              // Эмодзи + slug сервиса
  "icon_color": 0xFF0000               // Опционально: цвет иконки
}

Response:
{
  "ok": true,
  "result": {
    "message_thread_id": 123,          // ← это topicId, сохраняем в БД
    "name": "🔴 astro-bot",
    "icon_color": 16711680
  }
}
```

### 6.3.2 Отправка сообщения в топик

```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
{
  "chat_id": TELEGRAM_FORUM_CHAT_ID,
  "message_thread_id": 123,            // topicId
  "text": "🔴 ERROR | 2026-03-10 14:32:05\n\nCannot connect to DB...",
  "parse_mode": "HTML"
}
```

### 6.3.3 Используемая библиотека

**Рекомендация: `telegraf` 4.x** — зрелая библиотека, хорошо работает с Forum API.

Альтернатива: прямые HTTP-вызовы через `fetch` / `axios` к Telegram Bot API — проще, меньше зависимостей. **Выбор: прямые HTTP-вызовы через встроенный `fetch`** (Node 20 имеет нативный fetch). Это минимизирует зависимости.

```typescript
// Базовый вызов Telegram API
async function callTelegramApi<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new TelegramApiError(method, data.description, data.error_code);
  }

  return data.result as T;
}
```

## 6.4 TelegramService (core/telegram/telegram.service.ts)

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';
import { TelegramFormatterService } from './telegram-formatter.service';
import {
  TELEGRAM_RATE_LIMIT_PER_SECOND,
  TELEGRAM_RETRY_ATTEMPTS,
  TELEGRAM_RETRY_DELAY_MS,
} from '@shared/constants';

interface SendErrorLogPayload {
  logId: string;
  level: string;
  message: string;
  stackTrace?: string | null;
  metadata?: Record<string, unknown> | null;
  fingerprint: string;
}

interface SendDedupSummaryPayload {
  level: string;
  message: string;
  repeatCount: number;
  windowSeconds: number;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private botToken: string;
  private forumChatId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly formatter: TelegramFormatterService,
  ) {}

  onModuleInit(): void {
    this.botToken = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.forumChatId = this.config.getOrThrow<string>('TELEGRAM_FORUM_CHAT_ID');
  }

  /**
   * Отправляет лог ошибки в топик сервиса.
   * Если топик не существует — создаёт автоматически.
   */
  async sendErrorLog(serviceId: string, payload: SendErrorLogPayload): Promise<void> {
    const topicId = await this.ensureTopicExists(serviceId);
    const text = this.formatter.formatErrorLog(payload);

    await this.sendMessageWithRetry(topicId, text);
  }

  /**
   * Отправляет summary дедупликации в топик сервиса.
   */
  async sendDedupSummary(serviceId: string, payload: SendDedupSummaryPayload): Promise<void> {
    const topicId = await this.ensureTopicExists(serviceId);
    const text = this.formatter.formatDedupSummary(payload);

    await this.sendMessageWithRetry(topicId, text);
  }

  /**
   * Гарантирует существование топика для сервиса.
   * Если topicId = null в БД — создаёт новый топик в Telegram.
   */
  private async ensureTopicExists(serviceId: string): Promise<number> {
    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
      select: { topicId: true, name: true, slug: true },
    });

    if (service.topicId !== null) {
      return service.topicId;
    }

    // Создаём топик
    const topicName = `🔴 ${service.name}`;

    const result = await this.callApi<{ message_thread_id: number }>(
      'createForumTopic',
      {
        chat_id: this.forumChatId,
        name: topicName,
        icon_color: 0xFF0000, // Красный — для ошибок
      },
    );

    const topicId = result.message_thread_id;

    // Сохраняем topicId в БД
    await this.prisma.service.update({
      where: { id: serviceId },
      data: { topicId },
    });

    this.logger.log(`Создан топик "${topicName}" (ID: ${topicId}) для сервиса ${service.slug}`);

    // Отправляем приветственное сообщение
    const welcomeText = this.formatter.formatWelcomeMessage(service.name, service.slug);
    await this.sendMessage(topicId, welcomeText);

    return topicId;
  }

  /**
   * Отправка сообщения с retry и rate limiting.
   */
  private async sendMessageWithRetry(topicId: number, text: string): Promise<void> {
    for (let attempt = 1; attempt <= TELEGRAM_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.waitForRateLimit();
        await this.sendMessage(topicId, text);
        return;
      } catch (error) {
        if (error instanceof TelegramApiError && error.errorCode === 429) {
          // Rate limited — ждём указанное время
          const retryAfter = error.retryAfter ?? TELEGRAM_RETRY_DELAY_MS / 1000;
          this.logger.warn(`Telegram rate limit, retry after ${retryAfter}s`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (attempt === TELEGRAM_RETRY_ATTEMPTS) {
          throw error;
        }

        // Exponential backoff
        const delay = TELEGRAM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(`Telegram retry ${attempt}/${TELEGRAM_RETRY_ATTEMPTS}, delay ${delay}ms`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Простой rate limiter через Redis.
   * Ждёт, если превышен лимит сообщений в секунду.
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const key = `tg_rate:${now}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 2); // TTL 2 секунды
    }

    if (count > TELEGRAM_RATE_LIMIT_PER_SECOND) {
      // Ждём до следующей секунды
      const waitMs = 1000 - (Date.now() % 1000);
      await this.sleep(waitMs);
    }
  }

  /**
   * Отправка сообщения в конкретный топик.
   */
  private async sendMessage(topicId: number, text: string): Promise<void> {
    await this.callApi('sendMessage', {
      chat_id: this.forumChatId,
      message_thread_id: topicId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }

  /**
   * Базовый вызов Telegram Bot API.
   */
  private async callApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
    };

    if (!data.ok) {
      throw new TelegramApiError(
        method,
        data.description ?? 'Unknown error',
        data.error_code ?? 0,
        data.parameters?.retry_after,
      );
    }

    return data.result as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Ошибка Telegram API
 */
export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly description: string,
    public readonly errorCode: number,
    public readonly retryAfter?: number,
  ) {
    super(`Telegram API error [${method}]: ${errorCode} - ${description}`);
    this.name = 'TelegramApiError';
  }
}
```

## 6.5 TelegramFormatterService (core/telegram/telegram-formatter.service.ts)

```typescript
import { Injectable } from '@nestjs/common';
import { TELEGRAM_MAX_MESSAGE_LENGTH } from '@shared/constants';

@Injectable()
export class TelegramFormatterService {
  /**
   * Форматирует лог ошибки для Telegram (HTML parse_mode).
   *
   * Формат:
   * 🔴 ERROR | 2026-03-10 14:32:05
   *
   * Cannot connect to database after timeout
   *
   * Stack:
   * <code>Error: Connection timeout
   *     at DbService.connect (/app/src/db.ts:42:10)
   *     at AppModule.onInit (/app/src/app.ts:15:5)</code>
   *
   * 📎 Metadata:
   * <code>{"userId":"usr_123","requestId":"req_456"}</code>
   *
   * 🔑 abc1def2
   */
  formatErrorLog(payload: {
    logId: string;
    level: string;
    message: string;
    stackTrace?: string | null;
    metadata?: Record<string, unknown> | null;
    fingerprint: string;
  }): string {
    const emoji = this.levelEmoji(payload.level);
    const timestamp = this.formatTimestamp(new Date());
    const parts: string[] = [];

    // Header
    parts.push(`${emoji} <b>${this.escapeHtml(payload.level)}</b> | ${timestamp}`);

    // Message
    parts.push('');
    parts.push(this.escapeHtml(payload.message));

    // Stack trace (truncated)
    if (payload.stackTrace) {
      parts.push('');
      parts.push('📋 <b>Stack:</b>');
      const truncatedStack = this.truncateStack(payload.stackTrace);
      parts.push(`<code>${this.escapeHtml(truncatedStack)}</code>`);
    }

    // Metadata
    if (payload.metadata && Object.keys(payload.metadata).length > 0) {
      parts.push('');
      parts.push('📎 <b>Metadata:</b>');
      const metaStr = JSON.stringify(payload.metadata, null, 2);
      const truncatedMeta = metaStr.slice(0, 500);
      parts.push(`<code>${this.escapeHtml(truncatedMeta)}</code>`);
    }

    // Fingerprint (short)
    parts.push('');
    parts.push(`🔑 <code>${payload.fingerprint.slice(0, 8)}</code>`);

    let text = parts.join('\n');

    // Ensure we don't exceed Telegram limit
    if (text.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      text = text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 20) + '\n\n... (обрезано)';
    }

    return text;
  }

  /**
   * Форматирует summary дедупликации.
   *
   * Формат:
   * ⚠️ Ошибка повторилась ещё 47 раз за 3 мин
   *
   * 🔴 ERROR: Cannot connect to database
   */
  formatDedupSummary(payload: {
    level: string;
    message: string;
    repeatCount: number;
    windowSeconds: number;
  }): string {
    const emoji = this.levelEmoji(payload.level);
    const windowMin = Math.round(payload.windowSeconds / 60);
    const truncatedMessage = payload.message.slice(0, 200);

    return [
      `⚠️ <b>Ошибка повторилась ещё ${payload.repeatCount} раз за ${windowMin} мин</b>`,
      '',
      `${emoji} ${this.escapeHtml(payload.level)}: ${this.escapeHtml(truncatedMessage)}`,
    ].join('\n');
  }

  /**
   * Приветственное сообщение при создании нового топика.
   */
  formatWelcomeMessage(serviceName: string, serviceSlug: string): string {
    return [
      `🔧 <b>Топик создан для сервиса "${this.escapeHtml(serviceName)}"</b>`,
      '',
      `Slug: <code>${this.escapeHtml(serviceSlug)}</code>`,
      'Все ошибки этого сервиса будут публиковаться в этот топик.',
    ].join('\n');
  }

  private levelEmoji(level: string): string {
    const emojis: Record<string, string> = {
      DEBUG: '⚪',
      INFO: '🔵',
      WARN: '🟡',
      ERROR: '🔴',
      FATAL: '💀',
    };
    return emojis[level] ?? '❓';
  }

  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Обрезает stack trace до разумного размера для Telegram.
   * Оставляет первые 15 строк (обычно самые полезные).
   */
  private truncateStack(stack: string): string {
    const lines = stack.split('\n');
    const maxLines = 15;

    if (lines.length <= maxLines) return stack;

    return lines.slice(0, maxLines).join('\n') + `\n... ещё ${lines.length - maxLines} строк`;
  }
}
```

## 6.6 Telegram Module

```typescript
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramFormatterService } from './telegram-formatter.service';

@Module({
  providers: [TelegramService, TelegramFormatterService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

## 6.7 Edge Cases

### 6.7.1 Создание топика — race condition

Два запроса от нового сервиса приходят одновременно. Оба видят `topicId = null` и пытаются создать топик.

**Решение:** Redis lock на создание топика:

```typescript
const lockKey = `topic_lock:${serviceId}`;
const locked = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');

if (!locked) {
  // Другой процесс создаёт топик — ждём
  await this.sleep(2000);
  // Перечитываем из БД
  const service = await this.prisma.service.findUniqueOrThrow({ ... });
  if (service.topicId !== null) return service.topicId;
  throw new Error('Не удалось создать топик: lock timeout');
}

try {
  // Создаём топик...
} finally {
  await this.redis.del(lockKey);
}
```

### 6.7.2 Telegram API недоступен

Если Telegram не отвечает:
- Retry с exponential backoff (3 попытки)
- После 3 неудач — логируем ошибку, лог остаётся в БД
- В будущем: retry queue (Bull/BullMQ)

### 6.7.3 Группа-форум переполнена (лимит топиков)

Telegram позволяет до ~32,768 топиков. На практике это не проблема для данного use case.

### 6.7.4 Сообщение превышает 4096 символов

`TelegramFormatterService` обрезает сообщение до `TELEGRAM_MAX_MESSAGE_LENGTH` с пометкой `... (обрезано)`.
