import { createHmac, randomBytes } from 'crypto';
import { API_KEY_PREFIX, API_KEY_LENGTH, API_KEY_DISPLAY_PREFIX_LENGTH } from '@shared/constants';

/**
 * Генерирует новый API-ключ.
 * @returns {{ apiKey: string; apiKeyHash: string; apiKeyDisplayPrefix: string }}
 *
 * apiKeyDisplayPrefix — первые N символов случайной части для идентификации ключа
 * в UI (аналог последних 4 цифр карты). Хранится в БД для отображения пользователю.
 */
export function generateApiKey(): {
  apiKey: string;
  apiKeyHash: string;
  apiKeyDisplayPrefix: string;
} {
  const raw = randomBytes(API_KEY_LENGTH / 2).toString('hex');
  const apiKey = `${API_KEY_PREFIX}${raw}`;
  const apiKeyHash = hashApiKey(apiKey);
  // Берём первые символы случайной части — стандартная практика для display prefix
  const apiKeyDisplayPrefix = `${API_KEY_PREFIX}${raw.substring(0, API_KEY_DISPLAY_PREFIX_LENGTH)}...`;

  return { apiKey, apiKeyHash, apiKeyDisplayPrefix };
}

/**
 * Хеширует API-ключ для хранения и поиска.
 * Использует HMAC-SHA256 с HMAC_SECRET для защиты от атак на хеш.
 *
 * ⚠️ Смена HMAC_SECRET требует перегенерации всех API-ключей в БД.
 */
export function hashApiKey(apiKey: string): string {
  const secret = process.env.HMAC_SECRET;

  if (!secret) {
    throw new Error('HMAC_SECRET не настроен — проверьте переменные окружения');
  }

  return createHmac('sha256', secret).update(apiKey).digest('hex');
}
