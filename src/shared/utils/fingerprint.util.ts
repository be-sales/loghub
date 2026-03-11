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
    .replace(/\b\d+(\.\d+)?/g, '')             // числа: \b слева ловит начало числа; trailing \b намеренно отсутствует — '3000' в '3000ms' не имеет границы слова после (между \w-цифрой и \w-буквой)
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
