import { createHmac, randomBytes } from 'crypto';
import { API_KEY_PREFIX, API_KEY_LENGTH } from '@shared/constants';

/**
 * Генерирует новый API-ключ.
 * @returns {{ apiKey: string; apiKeyHash: string }}
 *
 * apiKey — возвращается пользователю один раз, в БД не хранится.
 * apiKeyHash — HMAC-SHA256 хеш, хранится в БД для проверки.
 */
export function generateApiKey(): {
  apiKey: string;
  apiKeyHash: string;
} {
  const raw = randomBytes(API_KEY_LENGTH / 2).toString('hex');
  const apiKey = `${API_KEY_PREFIX}${raw}`;
  const apiKeyHash = hashApiKey(apiKey);

  return { apiKey, apiKeyHash };
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
