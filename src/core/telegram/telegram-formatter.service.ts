import { Injectable } from '@nestjs/common';
import {
  TELEGRAM_MAX_MESSAGE_LENGTH,
  TELEGRAM_STACK_MAX_LINES,
  TELEGRAM_METADATA_MAX_LENGTH,
  TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH,
} from '@shared/constants';

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

    // Заголовок
    parts.push(
      `${emoji} <b>${this.escapeHtml(payload.level)}</b> | ${timestamp}`,
    );

    // Сообщение ошибки
    parts.push('');
    parts.push(this.escapeHtml(payload.message));

    // Stack trace (обрезанный)
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
      const isTruncated = metaStr.length > TELEGRAM_METADATA_MAX_LENGTH;
      const truncatedMeta = isTruncated
        ? metaStr.slice(0, TELEGRAM_METADATA_MAX_LENGTH) + '...'
        : metaStr;
      parts.push(`<code>${this.escapeHtml(truncatedMeta)}</code>`);
    }

    // Fingerprint (первые 8 символов)
    parts.push('');
    parts.push(`🔑 <code>${payload.fingerprint.slice(0, 8)}</code>`);

    let text = parts.join('\n');

    // Обрезка до лимита Telegram с корректным закрытием HTML-тегов
    if (text.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      text = text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 30);
      text = this.closeUnclosedTags(text);
      text += '\n\n... (обрезано)';
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
    const truncatedMessage = payload.message.slice(
      0,
      TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH,
    );

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
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 19);
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
}
