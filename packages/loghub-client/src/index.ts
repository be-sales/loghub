/**
 * @besales/loghub-client
 *
 * Лёгкий TypeScript-клиент для отправки логов в LogHub.
 * Ноль внешних зависимостей — только нативный fetch (Node.js >= 18).
 */

// ─── Константы ──────────────────────────────────────────────────────────────

/** Таймаут HTTP-запроса по умолчанию (мс) */
const DEFAULT_TIMEOUT = 5_000;

/** Количество повторных попыток по умолчанию */
const DEFAULT_RETRIES = 2;

/** Базовая задержка между повторными попытками (мс) */
const DEFAULT_RETRY_DELAY = 1_000;

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * Уровни логирования.
 * Совпадает с серверным enum LogLevel.
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

/**
 * Параметры конфигурации клиента LogHub.
 */
export interface LogHubClientOptions {
  /** URL LogHub-сервиса (без trailing slash) */
  endpoint: string;

  /** API-ключ сервиса */
  apiKey: string;

  /** Таймаут запроса в мс (по умолчанию 5000) */
  timeout?: number;

  /** Количество retry при сетевых ошибках (по умолчанию 2) */
  retries?: number;

  /** Задержка между retry в мс (по умолчанию 1000) */
  retryDelay?: number;

  /** Callback при ошибке отправки (по умолчанию console.error) */
  onError?: (error: Error) => void;
}

/**
 * Опции отправки лога.
 */
export interface LogOptions {
  /** Stack trace ошибки */
  stackTrace?: string;

  /** Произвольные метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Ответ сервера на приём лога.
 */
export interface LogResponse {
  /** ID созданного лога */
  id: string;

  /** Fingerprint ошибки */
  fingerprint: string;

  /** Был ли лог дедуплицирован */
  deduplicated: boolean;
}

// ─── Client ─────────────────────────────────────────────────────────────────

/**
 * Клиент для отправки логов в LogHub.
 *
 * Использует native fetch (Node.js >= 18).
 * Ноль внешних зависимостей.
 *
 * @example
 * ```typescript
 * const client = new LogHubClient({
 *   endpoint: 'https://loghub.example.com',
 *   apiKey: 'sk_live_a1b2c3d4...',
 * });
 *
 * await client.error('Ошибка подключения к БД', {
 *   stackTrace: error.stack,
 *   metadata: { userId: 'usr_123' },
 * });
 * ```
 */
export class LogHubClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly onError: (error: Error) => void;

  constructor(options: LogHubClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.onError =
      options.onError ?? ((err) => console.error('[LogHub]', err.message));
  }

  /** Отправка лога с произвольным уровнем */
  async log(
    level: LogLevel,
    message: string,
    options?: LogOptions,
  ): Promise<LogResponse> {
    const body = {
      level,
      message,
      ...(options?.stackTrace && { stackTrace: options.stackTrace }),
      ...(options?.metadata && { metadata: options.metadata }),
    };

    return this.sendWithRetry(body);
  }

  /** Shorthand для LogLevel.DEBUG */
  async debug(
    message: string,
    options?: LogOptions,
  ): Promise<LogResponse> {
    return this.log(LogLevel.DEBUG, message, options);
  }

  /** Shorthand для LogLevel.INFO */
  async info(
    message: string,
    options?: LogOptions,
  ): Promise<LogResponse> {
    return this.log(LogLevel.INFO, message, options);
  }

  /** Shorthand для LogLevel.WARN */
  async warn(
    message: string,
    options?: LogOptions,
  ): Promise<LogResponse> {
    return this.log(LogLevel.WARN, message, options);
  }

  /** Shorthand для LogLevel.ERROR */
  async error(
    message: string,
    options?: LogOptions,
  ): Promise<LogResponse> {
    return this.log(LogLevel.ERROR, message, options);
  }

  /** Shorthand для LogLevel.FATAL */
  async fatal(
    message: string,
    options?: LogOptions,
  ): Promise<LogResponse> {
    return this.log(LogLevel.FATAL, message, options);
  }

  /**
   * Отправка с повторными попытками.
   * Retry применяется при сетевых ошибках и 5xx.
   * 4xx не повторяются (клиентская ошибка).
   */
  private async sendWithRetry(
    body: Record<string, unknown>,
  ): Promise<LogResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.send(body);
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));

        // Не ретраим клиентские ошибки (4xx)
        if (
          lastError instanceof LogHubApiError &&
          lastError.statusCode < 500
        ) {
          throw lastError;
        }

        if (attempt < this.retries) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    this.onError(lastError!);
    throw lastError!;
  }

  /**
   * Выполняет один HTTP-запрос к LogHub.
   * Использует AbortController для timeout.
   */
  private async send(
    body: Record<string, unknown>,
  ): Promise<LogResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(
        `${this.endpoint}/api/logs/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new LogHubApiError(response.status, text);
      }

      return (await response.json()) as LogResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Утилитарная задержка */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Ошибка API LogHub.
 * Содержит HTTP status code и тело ответа сервера.
 */
export class LogHubApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`LogHub API error: ${statusCode} - ${responseBody}`);
    this.name = 'LogHubApiError';
  }
}
