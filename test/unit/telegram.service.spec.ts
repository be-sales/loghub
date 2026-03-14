import { ConfigService } from '@nestjs/config';
import {
  TelegramService,
  TelegramApiError,
} from '@core/telegram/telegram.service';
import { TelegramFormatterService } from '@core/telegram/telegram-formatter.service';
import {
  TELEGRAM_RETRY_ATTEMPTS,
  TELEGRAM_RETRY_DELAY_MS,
  TELEGRAM_RATE_LIMIT_PER_SECOND,
  TELEGRAM_TOPIC_LOCK_PREFIX,
  TELEGRAM_TOPIC_ICON_COLOR,
} from '@shared/constants';
import { createPrismaMock } from '../utils/prisma-mock';
import { createRedisMock } from '../utils/redis-mock';

// ─── Константы тестов ──────────────────────────────────────────────────────

const TEST_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
const TEST_CHAT_ID = '-1001234567890';
const TEST_SERVICE_ID = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
const TEST_TOPIC_ID = 42;

// ─── Моки ──────────────────────────────────────────────────────────────────

const fetchMock = jest.fn();
global.fetch = fetchMock;

function createConfigMock(): ConfigService {
  const values: Record<string, string> = {
    TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
    TELEGRAM_FORUM_CHAT_ID: TEST_CHAT_ID,
    NODE_ENV: 'development',
  };
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (!value) throw new Error(`Missing env: ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

function createFormatterMock(): TelegramFormatterService {
  return {
    formatErrorLog: jest.fn().mockReturnValue('<b>ERROR</b> test message'),
    formatDedupSummary: jest
      .fn()
      .mockReturnValue('⚠️ Ошибка повторилась ещё 5 раз'),
    formatWelcomeMessage: jest.fn().mockReturnValue('🔧 Топик создан'),
  } as unknown as TelegramFormatterService;
}

const jsonHeaders = { get: (_: string) => 'application/json' };

function mockFetchSuccess(result: unknown = {}): void {
  fetchMock.mockResolvedValueOnce({
    headers: jsonHeaders,
    json: async () => ({ ok: true, result }),
    status: 200,
  });
}

function mockFetch429(retryAfter: number): void {
  fetchMock.mockResolvedValueOnce({
    headers: jsonHeaders,
    json: async () => ({
      ok: false,
      description: 'Too Many Requests',
      error_code: 429,
      parameters: { retry_after: retryAfter },
    }),
    status: 429,
  });
}

function mockFetchError(code: number, description: string): void {
  fetchMock.mockResolvedValueOnce({
    headers: jsonHeaders,
    json: async () => ({
      ok: false,
      description,
      error_code: code,
    }),
    status: code,
  });
}

function mockFetchNetworkError(): void {
  fetchMock.mockRejectedValueOnce(new Error('Network error'));
}

const basePayload = {
  logId: 'log1',
  level: 'ERROR',
  message: 'fail',
  fingerprint: 'abc12345',
  stackTrace: null,
  metadata: null,
};

// ─── Тесты ─────────────────────────────────────────────────────────────────

describe('TelegramService', () => {
  let service: TelegramService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let redisMock: ReturnType<typeof createRedisMock>;
  let formatterMock: TelegramFormatterService;
  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    redisMock = createRedisMock();
    formatterMock = createFormatterMock();

    service = new TelegramService(
      createConfigMock(),
      prismaMock as never,
      redisMock as never,
      formatterMock,
    );
    service.onModuleInit();

    fetchMock.mockReset();

    // По умолчанию: rate limiter пропускает, del/expire возвращают resolved
    redisMock.incr.mockResolvedValue(1);
    redisMock.del.mockResolvedValue(1);
    redisMock.expire.mockResolvedValue(1);

    // Мокаем sleep → мгновенное выполнение (без реальных таймеров)
    sleepSpy = jest
      .spyOn(service as never, 'sleep' as never)
      .mockResolvedValue(undefined as never);
  });

  describe('sendErrorLog', () => {
    it('должен отправить сообщение в существующий топик', async () => {
      prismaMock.service.findUniqueOrThrow.mockResolvedValue({
        topicId: TEST_TOPIC_ID,
        name: 'Test Service',
        slug: 'test-service',
      });
      mockFetchSuccess();

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      expect(formatterMock.formatErrorLog).toHaveBeenCalledWith({
        ...basePayload,
        serviceName: 'Test Service',
        serviceSlug: 'test-service',
        environment: 'development',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toContain('/sendMessage');
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({
        message_thread_id: TEST_TOPIC_ID,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    });

    it('должен создать новый топик и обновить БД при topicId = null', async () => {
      prismaMock.service.findUniqueOrThrow.mockResolvedValue({
        topicId: null,
        name: 'New Service',
        slug: 'new-svc',
      });
      redisMock.set.mockResolvedValue('OK');

      // createForumTopic → welcome → sendMessage (error log)
      mockFetchSuccess({ message_thread_id: 99 });
      mockFetchSuccess();
      mockFetchSuccess();

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      // DB обновлена с topicId
      expect(prismaMock.service.update).toHaveBeenCalledWith({
        where: { id: TEST_SERVICE_ID },
        data: { topicId: 99 },
      });

      // Lock снят
      expect(redisMock.del).toHaveBeenCalledWith(
        `${TELEGRAM_TOPIC_LOCK_PREFIX}${TEST_SERVICE_ID}`,
      );

      // 3 вызова: createForumTopic + welcome + error log
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendMessageWithRetry', () => {
    beforeEach(() => {
      prismaMock.service.findUniqueOrThrow.mockResolvedValue({
        topicId: TEST_TOPIC_ID,
        name: 'Test Service',
        slug: 'test-service',
      });
    });

    it('должен повторить запрос при 429 с ожиданием retry_after', async () => {
      mockFetch429(1);
      mockFetchSuccess();

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Проверяем что sleep вызван с retry_after * 1000
      expect(sleepSpy).toHaveBeenCalledWith(1000);
    });

    it('должен повторить с экспоненциальным backoff при сетевой ошибке', async () => {
      mockFetchNetworkError();
      mockFetchSuccess();

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      // backoff: TELEGRAM_RETRY_DELAY_MS * 2^0 = 1000ms
      expect(sleepSpy).toHaveBeenCalledWith(TELEGRAM_RETRY_DELAY_MS);
    });

    it('должен бросить ошибку после исчерпания всех попыток', async () => {
      for (let i = 0; i < TELEGRAM_RETRY_ATTEMPTS; i++) {
        mockFetchError(500, 'Internal Server Error');
      }

      await expect(
        service.sendErrorLog(TEST_SERVICE_ID, basePayload),
      ).rejects.toThrow(TelegramApiError);

      expect(fetchMock).toHaveBeenCalledTimes(TELEGRAM_RETRY_ATTEMPTS);
    });

    it('должен бросить ошибку при 3x 429 подряд на последней попытке', async () => {
      for (let i = 0; i < TELEGRAM_RETRY_ATTEMPTS; i++) {
        mockFetch429(1);
      }

      await expect(
        service.sendErrorLog(TEST_SERVICE_ID, basePayload),
      ).rejects.toThrow(TelegramApiError);

      expect(fetchMock).toHaveBeenCalledTimes(TELEGRAM_RETRY_ATTEMPTS);
    });
  });

  describe('waitForRateLimit', () => {
    it('должен ожидать при превышении rate limit', async () => {
      prismaMock.service.findUniqueOrThrow.mockResolvedValue({
        topicId: TEST_TOPIC_ID,
        name: 'Test Service',
        slug: 'test-service',
      });
      redisMock.incr.mockResolvedValue(TELEGRAM_RATE_LIMIT_PER_SECOND + 1);
      mockFetchSuccess();

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      expect(redisMock.incr).toHaveBeenCalled();
      // sleep вызван для ожидания rate limit
      expect(sleepSpy).toHaveBeenCalled();
    });
  });

  describe('ensureTopicExists', () => {
    it('должен вызвать createForumTopic с корректными параметрами', async () => {
      prismaMock.service.findUniqueOrThrow.mockResolvedValue({
        topicId: null,
        name: 'API Gateway',
        slug: 'api-gateway',
      });
      redisMock.set.mockResolvedValue('OK');
      mockFetchSuccess({ message_thread_id: 77 });
      mockFetchSuccess(); // welcome
      mockFetchSuccess(); // error log

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      const [url, options] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toContain('/createForumTopic');
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body).toEqual({
        chat_id: TEST_CHAT_ID,
        name: '🔴 API Gateway',
        icon_color: TELEGRAM_TOPIC_ICON_COLOR,
      });
    });

    it('должен вернуть topicId из БД при занятой блокировке (race condition)', async () => {
      // Первый вызов: topicId = null
      prismaMock.service.findUniqueOrThrow
        .mockResolvedValueOnce({
          topicId: null,
          name: 'Test Service',
          slug: 'test-service',
        })
        // Второй вызов (re-read после sleep): topicId уже создан другим процессом
        .mockResolvedValueOnce({
          topicId: 77,
        });

      // Lock не получен
      redisMock.set.mockResolvedValue(null);

      // sendMessage для error log (не createForumTopic!)
      mockFetchSuccess();

      await service.sendErrorLog(TEST_SERVICE_ID, basePayload);

      // createForumTopic НЕ вызывался — только sendMessage
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/sendMessage');
      expect(url).not.toContain('/createForumTopic');

      // sleep вызван для ожидания lock
      expect(sleepSpy).toHaveBeenCalled();

      // Lock НЕ снимался (он не наш)
      expect(redisMock.del).not.toHaveBeenCalledWith(
        `${TELEGRAM_TOPIC_LOCK_PREFIX}${TEST_SERVICE_ID}`,
      );
    });
  });

  describe('sendDedupSummary', () => {
    it('должен отправить сводку дедупликации', async () => {
      prismaMock.service.findUniqueOrThrow.mockResolvedValue({
        topicId: TEST_TOPIC_ID,
        name: 'Test Service',
        slug: 'test-service',
      });
      mockFetchSuccess();

      await service.sendDedupSummary(TEST_SERVICE_ID, {
        level: 'ERROR',
        message: 'DB error',
        repeatCount: 5,
        windowSeconds: 180,
        fingerprint: 'abcdef1234567890',
      });

      expect(formatterMock.formatDedupSummary).toHaveBeenCalledWith({
        serviceName: 'Test Service',
        serviceSlug: 'test-service',
        environment: 'development',
        level: 'ERROR',
        message: 'DB error',
        repeatCount: 5,
        windowSeconds: 180,
        fingerprint: 'abcdef1234567890',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
