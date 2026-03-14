// ─── Дедупликация ────────────────────────────────────────────────────────────

/** Окно дедупликации в секундах (3 минуты) */
export const DEDUP_WINDOW_SECONDS = 180;

/** Интервал flush cron в миллисекундах (3 минуты) */
export const DEDUP_FLUSH_INTERVAL_MS = 180_000;

/** Префикс Redis-ключей дедупликации */
export const DEDUP_REDIS_PREFIX = 'dedup:';

/** Порог TTL для flush: обрабатывать записи с TTL ≤ этого значения (секунды) */
export const DEDUP_FLUSH_TTL_THRESHOLD_SECONDS = 10;

/** Количество ключей за один проход SCAN */
export const DEDUP_SCAN_COUNT = 100;

// ─── API Key ─────────────────────────────────────────────────────────────────

/** Префикс API-ключа */
export const API_KEY_PREFIX = 'sk_live_';

/** Длина hex-части API-ключа (32 hex символа = 16 bytes) */
export const API_KEY_LENGTH = 32;

/** Максимальная допустимая длина API-ключа (защита от oversized input перед хешированием) */
export const API_KEY_MAX_LENGTH = 200;

/** TTL кэша API-ключей в Redis в секундах (5 минут) */
export const API_KEY_CACHE_TTL_SECONDS = 300;

/** Префикс Redis-ключей кэша API-ключей */
export const API_KEY_CACHE_PREFIX = 'apikey:';

/** Имя HTTP-заголовка с API-ключом */
export const API_KEY_HEADER = 'x-api-key';

// ─── Services ──────────────────────────────────────────────────────────────────

/** Регулярное выражение для slug сервиса (латиница, цифры, дефис, 3-50 символов) */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

// ─── Telegram ────────────────────────────────────────────────────────────────

/** Максимальная длина сообщения Telegram (символов) */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Лимит запросов к Telegram API в секунду (консервативнее лимита 30/sec) */
export const TELEGRAM_RATE_LIMIT_PER_SECOND = 20;

/** Количество попыток повторной отправки в Telegram */
export const TELEGRAM_RETRY_ATTEMPTS = 3;

/** Задержка между повторными попытками отправки в Telegram (мс) */
export const TELEGRAM_RETRY_DELAY_MS = 1000;

/** Максимальное количество строк stack trace в Telegram-сообщении */
export const TELEGRAM_STACK_MAX_LINES = 15;

/** Максимальная длина metadata в Telegram-сообщении (символов) */
export const TELEGRAM_METADATA_MAX_LENGTH = 500;

/** Максимальная длина message в dedup summary (символов) */
export const TELEGRAM_DEDUP_MESSAGE_MAX_LENGTH = 200;

/** Префикс Redis-ключа блокировки создания топика */
export const TELEGRAM_TOPIC_LOCK_PREFIX = 'topic_lock:';

/** TTL блокировки создания топика (секунды) */
export const TELEGRAM_TOPIC_LOCK_TTL_SECONDS = 30;

/** Задержка ожидания при заблокированном создании топика (мс) */
export const TELEGRAM_TOPIC_LOCK_WAIT_MS = 2000;

/** Префикс Redis-ключа rate limiting Telegram API */
export const TELEGRAM_RATE_LIMIT_PREFIX = 'tg_rate:';

/** TTL счётчика rate limiting (секунды) */
export const TELEGRAM_RATE_LIMIT_TTL_SECONDS = 2;

/** Базовый URL Telegram Bot API */
export const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

/** Цвет иконки нового топика (красно-оранжевый, из допустимых Telegram API) */
export const TELEGRAM_TOPIC_ICON_COLOR = 0xfb6f5f;

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

/** Глобальный дефолтный лимит rate limiting (запросов в окне) — базовая защита от DoS */
export const DEFAULT_THROTTLE_LIMIT = 1000;

/** Глобальный дефолтный TTL окна rate limiting (секунды, 1 минута) */
export const DEFAULT_THROTTLE_TTL_SECONDS = 60;

/** Лимит запросов на ingest endpoint (запросов в минуту) */
export const INGEST_THROTTLE_LIMIT = 300;

/** TTL окна rate limiting для ingest endpoint (секунды, 1 минута) */
export const INGEST_THROTTLE_TTL_SECONDS = 60;

/** Лимит мутирующих запросов в Admin API (запросов в минуту) */
export const ADMIN_MUTATION_THROTTLE_LIMIT = 20;

/** TTL окна rate limiting для мутирующих Admin API endpoints (секунды, 1 минута) */
export const ADMIN_MUTATION_THROTTLE_TTL_SECONDS = 60;

/** Regex для валидации формата API-ключа: sk_live_ + 32 hex символа */
export const API_KEY_FORMAT_REGEX = /^sk_live_[a-f0-9]{32}$/;

/** Таймаут запроса к Telegram Bot API (мс) */
export const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;

/** Максимальный размер тела HTTP-запроса (байт, 1MB) */
export const BODY_LIMIT_BYTES = 1_048_576;

/** Время жизни cookie с access токеном (секунды, 24 часа) */
export const COOKIE_MAX_AGE_SECONDS = 86_400;
