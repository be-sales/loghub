import { Injectable } from '@nestjs/common';
import {
  TELEGRAM_MAX_MESSAGE_LENGTH,
  TELEGRAM_STACK_MAX_LINES,
  TELEGRAM_METADATA_MAX_LENGTH,
  TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH,
} from '@shared/constants';

const DETAIL_LEVELS = new Set(['ERROR', 'FATAL']);
const REQUEST_ID_KEYS = ['requestId', 'correlationId', 'traceId'] as const;
const CONTEXT_KEYS = ['context', 'source', 'module', 'handler'] as const;
const KEY_FACT_KEYS = [
  ...REQUEST_ID_KEYS,
  'userId',
  'chatId',
  'serviceId',
  'jobId',
  'taskId',
  'entityId',
  'slug',
  'path',
  'method',
] as const;
const TRUNCATED_SUFFIX = '...';

type TelegramMetadata = Record<string, unknown>;

export interface TelegramErrorLogFormatPayload {
  serviceName: string;
  serviceSlug: string;
  environment: string;
  logId: string;
  level: string;
  message: string;
  stackTrace?: string | null;
  metadata?: TelegramMetadata | null;
  fingerprint: string;
}

export interface TelegramDedupSummaryFormatPayload {
  serviceName: string;
  serviceSlug: string;
  environment: string;
  level: string;
  message: string;
  repeatCount: number;
  windowSeconds: number;
  fingerprint?: string | null;
}

/**
 * Сервис форматирования сообщений для Telegram (HTML parse_mode).
 *
 * Отвечает за:
 * - Форматирование логов ошибок с emoji, stack trace, metadata
 * - Форматирование summary дедупликации
 * - Приветственные сообщения при создании топиков
 * - HTML escaping для безопасной отправки
 */
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
   * 📋 Stack:
   * <code>Error: Connection timeout
   *     at DbService.connect (/app/src/db.ts:42:10)</code>
   *
   * 📎 Metadata:
   * <code>{"userId":"usr_123"}</code>
   *
   * 🔑 abc1def2
   */
  formatErrorLog(payload: TelegramErrorLogFormatPayload): string {
    const timestamp = this.formatTimestampWithTimezone(new Date());
    const detailMode = DETAIL_LEVELS.has(payload.level);
    const errorType = detailMode
      ? this.extractErrorType(payload.message, payload.stackTrace)
      : null;
    const context = this.extractContext(payload.metadata, payload.stackTrace);
    const httpInfo = this.extractHttpInfo(payload.metadata);
    const requestId = this.extractRequestId(payload.metadata);
    const promotedKeys = new Set<string>();
    const lines: string[] = [
      `${this.levelEmoji(payload.level)} <b>${this.escapeHtml(payload.level)} · ${this.escapeHtml(payload.environment)}</b>`,
      `<b>${this.escapeHtml(payload.serviceName)}</b> · <code>${this.escapeHtml(payload.serviceSlug)}</code>`,
      this.escapeHtml(timestamp),
      '',
    ];

    if (errorType) {
      lines.push(`<b>Тип:</b> ${this.escapeHtml(errorType)}`);
    }

    lines.push(`<b>Сообщение:</b> ${this.escapeHtml(payload.message)}`);

    if (context) {
      const contextKey = this.findMatchingKey(payload.metadata, CONTEXT_KEYS);
      if (contextKey) {
        promotedKeys.add(contextKey);
      }
      lines.push(`<b>Контекст:</b> ${this.escapeHtml(context)}`);
    }

    if (httpInfo) {
      promotedKeys.add('method');
      promotedKeys.add('path');
      lines.push(`<b>HTTP:</b> ${this.escapeHtml(httpInfo)}`);
    }

    if (requestId) {
      const requestKey = this.findMatchingKey(payload.metadata, REQUEST_ID_KEYS);
      if (requestKey) {
        promotedKeys.add(requestKey);
      }
      lines.push(`<b>Request ID:</b> <code>${this.escapeHtml(requestId)}</code>`);
    }

    lines.push(`<b>Log ID:</b> <code>${this.escapeHtml(payload.logId)}</code>`);
    lines.push(
      `<b>Fingerprint:</b> <code>${this.escapeHtml(payload.fingerprint.slice(0, 8))}</code>`,
    );

    let text = lines.join('\n');

    const keyFacts = this.buildKeyFacts(payload.metadata, promotedKeys);
    if (keyFacts) {
      text = this.appendOptionalBlock(
        text,
        'Ключевые данные:',
        keyFacts,
        'pre',
        24,
      );
    }

    if (detailMode && payload.stackTrace) {
      text = this.appendOptionalBlock(
        text,
        'Stack:',
        this.truncateStack(payload.stackTrace),
        'pre',
        40,
      );
    }

    const metadata = this.stripPromotedMetadata(payload.metadata, promotedKeys);
    if (detailMode && metadata) {
      const metadataText = this.stringifyMetadata(metadata, TELEGRAM_METADATA_MAX_LENGTH);
      text = this.appendOptionalBlock(
        text,
        'Metadata:',
        metadataText,
        'pre',
        24,
      );
    }

    return this.ensureWithinLimit(text);
  }

  /**
   * Форматирует summary дедупликации.
   *
   * Формат:
   * ⚠️ Ошибка повторилась ещё 47 раз за 3 мин
   *
   * 🔴 ERROR: Cannot connect to database
   */
  formatDedupSummary(payload: TelegramDedupSummaryFormatPayload): string {
    const emoji = this.levelEmoji(payload.level);
    const windowMin = Math.round(payload.windowSeconds / 60);
    const truncatedMessage = payload.message.slice(
      0,
      TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH,
    );
    const parts = [
      `⚠️ <b>${this.escapeHtml(payload.level)} повторился ещё ${payload.repeatCount} раз за ${windowMin} мин</b>`,
      `<b>${this.escapeHtml(payload.serviceName)}</b> · <code>${this.escapeHtml(payload.serviceSlug)}</code> · ${this.escapeHtml(payload.environment)}`,
      '',
      `<b>Сообщение:</b> ${emoji} ${this.escapeHtml(truncatedMessage)}`,
    ];

    if (payload.fingerprint) {
      parts.push(
        `<b>Fingerprint:</b> <code>${this.escapeHtml(payload.fingerprint.slice(0, 8))}</code>`,
      );
    }

    return this.ensureWithinLimit(parts.join('\n'));
  }

  /**
   * Приветственное сообщение при создании нового топика.
   */
  formatWelcomeMessage(serviceName: string, serviceSlug: string): string {
    return [
      '🔧 <b>Топик подключён</b>',
      '',
      `<b>Сервис:</b> ${this.escapeHtml(serviceName)}`,
      `<b>Slug:</b> <code>${this.escapeHtml(serviceSlug)}</code>`,
      '',
      'Сюда будут публиковаться ошибки и summary дедупликации.',
    ].join('\n');
  }

  /** Возвращает emoji по уровню лога */
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

  /** Форматирует дату в читаемый формат (ISO без T) */
  private formatTimestampWithTimezone(date: Date): string {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(offsetMinutes);
    const offsetHours = Math.floor(absoluteOffset / 60);
    const offsetRemainingMinutes = absoluteOffset % 60;

    return [
      `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`,
      `${this.pad(date.getHours())}:${this.pad(date.getMinutes())}:${this.pad(date.getSeconds())}`,
      `UTC${sign}${this.pad(offsetHours)}:${this.pad(offsetRemainingMinutes)}`,
    ].join(' ');
  }

  /**
   * Экранирует HTML-спецсимволы для Telegram HTML parse_mode.
   * Порядок критичен: & экранируется ПЕРВЫМ, иначе &lt; станет &amp;lt;
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Закрывает незакрытые HTML-теги после обрезки.
   * Предотвращает ошибку парсинга HTML в Telegram Bot API.
   */
  private closeUnclosedTags(text: string): string {
    const openPre = (text.match(/<pre>/g) || []).length;
    const closePre = (text.match(/<\/pre>/g) || []).length;
    if (openPre > closePre) text += '</pre>';

    const openCode = (text.match(/<code>/g) || []).length;
    const closeCode = (text.match(/<\/code>/g) || []).length;
    if (openCode > closeCode) text += '</code>';

    const openB = (text.match(/<b>/g) || []).length;
    const closeB = (text.match(/<\/b>/g) || []).length;
    if (openB > closeB) text += '</b>';

    return text;
  }

  /**
   * Обрезает stack trace до разумного размера для Telegram.
   * Оставляет первые TELEGRAM_STACK_MAX_LINES строк (обычно самые полезные).
   */
  private truncateStack(stack: string): string {
    const lines = stack.split('\n');

    if (lines.length <= TELEGRAM_STACK_MAX_LINES) return stack;

    return (
      lines.slice(0, TELEGRAM_STACK_MAX_LINES).join('\n') +
      `\n... ещё ${lines.length - TELEGRAM_STACK_MAX_LINES} строк`
    );
  }

  private extractErrorType(
    message: string,
    stackTrace?: string | null,
  ): string | null {
    const stackFirstLine = stackTrace?.split('\n')[0]?.trim();
    const stackMatch = stackFirstLine?.match(/^([A-Za-z][\w]*(?:Error|Exception))/);
    if (stackMatch) {
      return stackMatch[1];
    }

    const messageMatch = message.match(/^([A-Za-z][\w]*(?:Error|Exception))/);
    return messageMatch?.[1] ?? null;
  }

  private extractContext(
    metadata?: TelegramMetadata | null,
    stackTrace?: string | null,
  ): string | null {
    for (const key of CONTEXT_KEYS) {
      const value = metadata?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    if (!stackTrace) {
      return null;
    }

    const stackFrame = stackTrace
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at '));

    if (!stackFrame) {
      return null;
    }

    const match = stackFrame.match(/^at\s+([^(]+?)(?:\s+\(|$)/);
    return match?.[1]?.trim() ?? null;
  }

  private extractHttpInfo(metadata?: TelegramMetadata | null): string | null {
    const method = typeof metadata?.method === 'string' ? metadata.method.trim() : '';
    const path = typeof metadata?.path === 'string' ? metadata.path.trim() : '';

    if (method && path) {
      return `${method.toUpperCase()} ${path}`;
    }

    if (method) {
      return method.toUpperCase();
    }

    if (path) {
      return path;
    }

    return null;
  }

  private extractRequestId(metadata?: TelegramMetadata | null): string | null {
    for (const key of REQUEST_ID_KEYS) {
      const value = metadata?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private buildKeyFacts(
    metadata?: TelegramMetadata | null,
    excludedKeys: ReadonlySet<string> = new Set(),
  ): string | null {
    if (!metadata) {
      return null;
    }

    const lines: string[] = [];

    for (const key of KEY_FACT_KEYS) {
      if (excludedKeys.has(key)) {
        continue;
      }

      const value = metadata[key];
      if (value === undefined || value === null) {
        continue;
      }

      lines.push(`${key}=${this.stringifyFactValue(value)}`);
    }

    return lines.length > 0 ? lines.join('\n') : null;
  }

  private stripPromotedMetadata(
    metadata?: TelegramMetadata | null,
    excludedKeys: ReadonlySet<string> = new Set(),
  ): TelegramMetadata | null {
    if (!metadata) {
      return null;
    }

    const result: TelegramMetadata = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (excludedKeys.has(key)) {
        continue;
      }

      if (KEY_FACT_KEYS.includes(key as (typeof KEY_FACT_KEYS)[number])) {
        continue;
      }

      if (CONTEXT_KEYS.includes(key as (typeof CONTEXT_KEYS)[number])) {
        continue;
      }

      result[key] = value;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private appendOptionalBlock(
    baseText: string,
    title: string,
    rawContent: string,
    tag: 'code' | 'pre',
    minContentLength: number,
  ): string {
    if (!rawContent.trim()) {
      return baseText;
    }

    const separator = baseText ? '\n\n' : '';
    const fullBlock = `${separator}${this.renderBlock(title, rawContent, tag)}`;
    if (baseText.length + fullBlock.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      return `${baseText}${fullBlock}`;
    }

    const available = TELEGRAM_MAX_MESSAGE_LENGTH - baseText.length - separator.length;
    if (available <= 0) {
      return baseText;
    }

    let left = minContentLength;
    let right = rawContent.length;
    let best: string | null = null;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      const candidate = `${separator}${this.renderBlock(
        title,
        `${rawContent.slice(0, middle)}${TRUNCATED_SUFFIX}`,
        tag,
      )}`;

      if (candidate.length <= available) {
        best = candidate;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    if (!best) {
      return baseText;
    }

    return `${baseText}${best}`;
  }

  private renderBlock(
    title: string,
    rawContent: string,
    tag: 'code' | 'pre',
  ): string {
    return `<b>${this.escapeHtml(title)}</b>\n<${tag}>${this.escapeHtml(rawContent)}</${tag}>`;
  }

  private ensureWithinLimit(text: string): string {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      return text;
    }

    let truncated = text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 30);
    truncated = this.closeUnclosedTags(truncated);
    return `${truncated}\n\n... (обрезано)`;
  }

  private stringifyMetadata(metadata: TelegramMetadata, maxLength: number): string {
    const json = JSON.stringify(metadata, null, 2);
    if (json.length <= maxLength) {
      return json;
    }

    return `${json.slice(0, maxLength)}${TRUNCATED_SUFFIX}`;
  }

  private stringifyFactValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private findMatchingKey(
    metadata: TelegramMetadata | null | undefined,
    keys: readonly string[],
  ): string | null {
    if (!metadata) {
      return null;
    }

    return keys.find((key) => metadata[key] !== undefined) ?? null;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
