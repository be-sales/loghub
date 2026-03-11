// ─── Дедупликация ────────────────────────────────────────────────────────────

/** Окно дедупликации в секундах (3 минуты) */
export const DEDUP_WINDOW_SECONDS = 180;

/** Интервал flush cron в миллисекундах (3 минуты) */
export const DEDUP_FLUSH_INTERVAL_MS = 180_000;

/** Префикс Redis-ключей дедупликации */
export const DEDUP_REDIS_PREFIX = 'dedup:';

// ─── API Key ─────────────────────────────────────────────────────────────────

/** Префикс API-ключа */
export const API_KEY_PREFIX = 'sk_live_';

/** Длина hex-части API-ключа (32 hex символа = 16 bytes) */
export const API_KEY_LENGTH = 32;

/** Длина отображаемого префикса ключа (первые N символов случайной части) */
export const API_KEY_DISPLAY_PREFIX_LENGTH = 8;

/** Максимальная допустимая длина API-ключа (защита от oversized input перед хешированием) */
export const API_KEY_MAX_LENGTH = 200;

/** TTL кэша API-ключей в Redis в секундах (5 минут) */
export const API_KEY_CACHE_TTL_SECONDS = 300;

/** Префикс Redis-ключей кэша API-ключей */
export const API_KEY_CACHE_PREFIX = 'apikey:';

/** Имя HTTP-заголовка с API-ключом */
export const API_KEY_HEADER = 'x-api-key';

// ─── Telegram ────────────────────────────────────────────────────────────────

/** Максимальная длина сообщения Telegram (символов) */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Лимит запросов к Telegram API в секунду (консервативнее лимита 30/sec) */
export const TELEGRAM_RATE_LIMIT_PER_SECOND = 20;

/** Количество попыток повторной отправки в Telegram */
export const TELEGRAM_RETRY_ATTEMPTS = 3;

/** Задержка между повторными попытками отправки в Telegram (мс) */
export const TELEGRAM_RETRY_DELAY_MS = 1000;

// ─── Ingestion ───────────────────────────────────────────────────────────────

/** Максимальная длина stack trace (символов) */
export const MAX_STACK_TRACE_LENGTH = 10_000;

/** Максимальная длина текста ошибки (символов) */
export const MAX_MESSAGE_LENGTH = 2_000;

/** Максимальный размер metadata (байт, 50KB) */
export const MAX_METADATA_SIZE_BYTES = 50_000;

/** Количество строк stack trace для вычисления fingerprint */
export const FINGERPRINT_STACK_LINES = 3;

// ─── Admin ───────────────────────────────────────────────────────────────────

/** Время жизни JWT-токена администратора */
export const ADMIN_JWT_EXPIRY = '24h';

/** Размер страницы по умолчанию */
export const DEFAULT_PAGE_SIZE = 50;

/** Максимальный размер страницы */
export const MAX_PAGE_SIZE = 200;

// ─── Redis ───────────────────────────────────────────────────────────────

/** Максимальное количество повторных попыток на запрос к Redis */
export const REDIS_MAX_RETRIES_PER_REQUEST = 3;

/** Шаг задержки между повторными попытками подключения к Redis (мс) */
export const REDIS_RETRY_DELAY_STEP_MS = 200;

/** Максимальная задержка между повторными попытками подключения к Redis (мс) */
export const REDIS_MAX_RETRY_DELAY_MS = 2_000;

// ─── Health ──────────────────────────────────────────────────────────────────

/** Интервал health check (мс) */
export const HEALTH_CHECK_INTERVAL_MS = 30_000;

// ─── Security ────────────────────────────────────────────────────────────────

/** Количество раундов bcrypt для хеширования паролей */
export const BCRYPT_ROUNDS = 12;

/** TTL окна rate limiting для endpoint логина (секунды, 15 минут) */
export const LOGIN_THROTTLE_TTL_SECONDS = 900;

/** Максимальное количество попыток логина за одно окно */
export const LOGIN_THROTTLE_LIMIT = 5;

/** Максимальный размер тела HTTP-запроса (байт, 1MB) */
export const BODY_LIMIT_BYTES = 1_048_576;

/** Время жизни cookie с access токеном (секунды, 24 часа) */
export const COOKIE_MAX_AGE_SECONDS = 86_400;
