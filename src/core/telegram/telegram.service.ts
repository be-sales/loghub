import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';
import { TelegramFormatterService } from '@core/telegram/telegram-formatter.service';
import {
  TELEGRAM_RATE_LIMIT_PER_SECOND,
  TELEGRAM_RETRY_ATTEMPTS,
  TELEGRAM_RETRY_DELAY_MS,
  TELEGRAM_RATE_LIMIT_PREFIX,
  TELEGRAM_RATE_LIMIT_TTL_SECONDS,
  TELEGRAM_TOPIC_LOCK_PREFIX,
  TELEGRAM_TOPIC_LOCK_TTL_SECONDS,
  TELEGRAM_TOPIC_LOCK_WAIT_MS,
  TELEGRAM_API_BASE_URL,
  TELEGRAM_TOPIC_ICON_COLOR,
  TELEGRAM_REQUEST_TIMEOUT_MS,
} from '@shared/constants';

/** Данные для отправки лога ошибки в Telegram */
export interface SendErrorLogPayload {
  logId: string;
  level: string;
  message: string;
  stackTrace?: string | null;
  metadata?: Record<string, unknown> | null;
  fingerprint: string;
}

/** Данные для отправки сводки дедупликации в Telegram */
export interface SendDedupSummaryPayload {
  level: string;
  message: string;
  repeatCount: number;
  windowSeconds: number;
  fingerprint?: string | null;
}

interface TopicContext {
  topicId: number;
  serviceName: string;
  serviceSlug: string;
}

/**
 * Ошибка Telegram API.
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

/**
 * Сервис взаимодействия с Telegram Bot API.
 *
 * Отвечает за:
 * - Отправку логов ошибок в топики Telegram Forum
 * - Отправку сводок дедупликации
 * - Ленивое создание топиков (с Redis lock против race condition)
 * - Retry с exponential backoff и rate limiting
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private botToken!: string;
  private forumChatId!: string;
  private environment = 'development';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly formatter: TelegramFormatterService,
  ) {}

  onModuleInit(): void {
    this.botToken = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.forumChatId = this.config.getOrThrow<string>(
      'TELEGRAM_FORUM_CHAT_ID',
    );
    this.environment = this.config.get<string>('NODE_ENV') ?? 'development';
  }

  /**
   * Отправляет лог ошибки в топик сервиса.
   * Если топик не существует — создаёт автоматически.
   */
  async sendErrorLog(
    serviceId: string,
    payload: SendErrorLogPayload,
  ): Promise<void> {
    const topic = await this.ensureTopicExists(serviceId);
    const text = this.formatter.formatErrorLog({
      ...payload,
      serviceName: topic.serviceName,
      serviceSlug: topic.serviceSlug,
      environment: this.environment,
    });

    await this.sendMessageWithRetry(topic.topicId, text);
  }

  /**
   * Отправляет summary дедупликации в топик сервиса.
   */
  async sendDedupSummary(
    serviceId: string,
    payload: SendDedupSummaryPayload,
  ): Promise<void> {
    const topic = await this.ensureTopicExists(serviceId);
    const text = this.formatter.formatDedupSummary({
      ...payload,
      serviceName: topic.serviceName,
      serviceSlug: topic.serviceSlug,
      environment: this.environment,
    });

    await this.sendMessageWithRetry(topic.topicId, text);
  }

  /**
   * Гарантирует существование топика для сервиса.
   * Использует Redis-блокировку для предотвращения гонок при создании (§6.7.1).
   */
  private async ensureTopicExists(serviceId: string): Promise<TopicContext> {
    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
      select: { topicId: true, name: true, slug: true },
    });

    if (service.topicId !== null) {
      return {
        topicId: service.topicId,
        serviceName: service.name,
        serviceSlug: service.slug,
      };
    }

    // Попытка захватить Redis-блокировку
    const lockKey = `${TELEGRAM_TOPIC_LOCK_PREFIX}${serviceId}`;
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      TELEGRAM_TOPIC_LOCK_TTL_SECONDS,
      'NX',
    );

    if (acquired === null) {
      // Блокировка занята другим процессом — ждём с повторными проверками.
      // Максимальное ожидание = TTL блокировки: если захватчик упал, блокировка
      // истечёт за TELEGRAM_TOPIC_LOCK_TTL_SECONDS и мы не потеряем данные.
      // Lock не снимаем — он не наш.
      const maxWaitMs = TELEGRAM_TOPIC_LOCK_TTL_SECONDS * 1000;
      let waitedMs = 0;

      while (waitedMs < maxWaitMs) {
        await this.sleep(TELEGRAM_TOPIC_LOCK_WAIT_MS);
        waitedMs += TELEGRAM_TOPIC_LOCK_WAIT_MS;

        const updated = await this.prisma.service.findUniqueOrThrow({
          where: { id: serviceId },
          select: { topicId: true },
        });

        if (updated.topicId !== null) {
          return {
            topicId: updated.topicId,
            serviceName: service.name,
            serviceSlug: service.slug,
          };
        }
      }

      throw new Error(
        `Не удалось создать топик для сервиса ${serviceId}: таймаут ожидания блокировки`,
      );
    }

    try {
      // Создание топика через Telegram API
      const topicName = `🔴 ${service.name}`;

      const result = await this.callApi<{ message_thread_id: number }>(
        'createForumTopic',
        {
          chat_id: this.forumChatId,
          name: topicName,
          icon_color: TELEGRAM_TOPIC_ICON_COLOR,
        },
      );

      const topicId = result.message_thread_id;

      // Сохранение topicId в БД
      await this.prisma.service.update({
        where: { id: serviceId },
        data: { topicId },
      });

      this.logger.log(
        `Создан топик "${topicName}" (ID: ${topicId}) для сервиса ${service.slug}`,
      );

      // Приветственное сообщение (best-effort — не блокирует основной лог)
      try {
        const welcomeText = this.formatter.formatWelcomeMessage(
          service.name,
          service.slug,
        );
        await this.sendMessage(topicId, welcomeText);
      } catch (error) {
        this.logger.warn(
          `Не удалось отправить приветствие в топик ${topicId}: ${(error as Error).message}`,
        );
      }

      return {
        topicId,
        serviceName: service.name,
        serviceSlug: service.slug,
      };
    } finally {
      // Снятие блокировки — только захватившим инстансом
      await this.redis.del(lockKey).catch((error: Error) => {
        this.logger.warn(
          `Не удалось снять блокировку ${lockKey}: ${error.message}`,
        );
      });
    }
  }

  /**
   * Отправка сообщения с retry и rate limiting.
   * На 429 — ждёт retry_after из ответа.
   * На другие ошибки — exponential backoff.
   * На последней попытке — throw (включая 429).
   */
  private async sendMessageWithRetry(
    topicId: number,
    text: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= TELEGRAM_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.waitForRateLimit();
        await this.sendMessage(topicId, text);
        return;
      } catch (error) {
        const isLastAttempt = attempt === TELEGRAM_RETRY_ATTEMPTS;

        if (error instanceof TelegramApiError && error.errorCode === 429) {
          // На последней попытке — не молчим, бросаем ошибку
          if (isLastAttempt) {
            throw error;
          }

          const retryAfter =
            error.retryAfter ?? TELEGRAM_RETRY_DELAY_MS / 1000;
          this.logger.warn(
            `Telegram rate limit, retry after ${retryAfter}s (попытка ${attempt}/${TELEGRAM_RETRY_ATTEMPTS})`,
          );
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (isLastAttempt) {
          throw error;
        }

        // Exponential backoff
        const delay = TELEGRAM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Telegram retry ${attempt}/${TELEGRAM_RETRY_ATTEMPTS}, delay ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }
  }

  /**
   * Простой rate limiter через Redis.
   * Ждёт, если превышен лимит сообщений в секунду.
   */
  private async waitForRateLimit(): Promise<void> {
    const currentSecond = Math.floor(Date.now() / 1000);
    const key = `${TELEGRAM_RATE_LIMIT_PREFIX}${currentSecond}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, TELEGRAM_RATE_LIMIT_TTL_SECONDS);
    }

    if (count > TELEGRAM_RATE_LIMIT_PER_SECOND) {
      const waitMs = 1000 - (Date.now() % 1000);
      this.logger.debug(
        `Rate limit достигнут (${count}/${TELEGRAM_RATE_LIMIT_PER_SECOND}), ожидание ${waitMs}ms`,
      );
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
   * Базовый вызов Telegram Bot API через нативный fetch.
   * - Таймаут TELEGRAM_REQUEST_TIMEOUT_MS через AbortController
   * - Проверка Content-Type до JSON.parse (защита от non-JSON ответов)
   * @throws TelegramApiError при ошибке от API или таймауте
   */
  private async callApi<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = `${TELEGRAM_API_BASE_URL}/bot${this.botToken}/${method}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TelegramApiError(method, `Таймаут запроса (${TELEGRAM_REQUEST_TIMEOUT_MS}ms)`, 408);
      }
      // Оборачиваем сетевую ошибку — URL содержит токен бота и не должен попадать в логи
      throw new TelegramApiError(
        method,
        `Сетевая ошибка: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Telegram Bot API всегда отвечает JSON.
    // При не-JSON ответе (например, 5xx Cloudflare HTML-страница) бросаем понятную ошибку.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new TelegramApiError(
        method,
        `Неожиданный Content-Type: ${contentType} (HTTP ${response.status})`,
        response.status,
      );
    }

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
