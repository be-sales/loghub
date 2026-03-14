import {
  LogHubClient,
  LogHubApiError,
  LogLevel,
} from '@besales/loghub-client';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_ENDPOINT = 'https://loghub.example.com';
const MOCK_API_KEY = 'sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const INGEST_URL = `${MOCK_ENDPOINT}/api/logs/ingest`;

const MOCK_RESPONSE: { id: string; fingerprint: string; deduplicated: boolean } = {
  id: 'clxyz123',
  fingerprint: 'abc123def456',
  deduplicated: false,
};

function createSuccessResponse(): Response {
  return {
    ok: true,
    status: 201,
    json: () => Promise.resolve(MOCK_RESPONSE),
    text: () => Promise.resolve(JSON.stringify(MOCK_RESPONSE)),
  } as unknown as Response;
}

function createErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function createClient(
  overrides?: Partial<ConstructorParameters<typeof LogHubClient>[0]>,
): LogHubClient {
  return new LogHubClient({
    endpoint: MOCK_ENDPOINT,
    apiKey: MOCK_API_KEY,
    retries: 0,
    ...overrides,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LogHubClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Конструктор ─────────────────────────────────────────────────────────

  describe('конструктор', () => {
    it('должен нормализовать endpoint (удалить trailing slashes)', async () => {
      const client = createClient({ endpoint: 'https://example.com///' });
      fetchMock.mockResolvedValue(createSuccessResponse());

      await client.info('test');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/api/logs/ingest',
        expect.any(Object),
      );
    });

    it('должен использовать значения по умолчанию для retries (2 попытки)', () => {
      // retries=2 по умолчанию → 3 вызова fetch (0, 1, 2). retryDelay=1 для скорости.
      const client = new LogHubClient({
        endpoint: MOCK_ENDPOINT,
        apiKey: MOCK_API_KEY,
        retryDelay: 1,
      });

      fetchMock
        .mockResolvedValueOnce(createErrorResponse(500, 'err'))
        .mockResolvedValueOnce(createErrorResponse(500, 'err'))
        .mockResolvedValueOnce(createSuccessResponse());

      return expect(client.info('test')).resolves.toEqual(MOCK_RESPONSE);
    });
  });

  // ── log() ───────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('должен отправить POST на /api/logs/ingest с правильными заголовками', async () => {
      const client = createClient();
      fetchMock.mockResolvedValue(createSuccessResponse());

      await client.log(LogLevel.ERROR, 'test message');

      expect(fetchMock).toHaveBeenCalledWith(INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': MOCK_API_KEY,
        },
        body: expect.any(String),
        signal: expect.any(AbortSignal),
      });
    });

    it('должен отправить level и message в теле запроса', async () => {
      const client = createClient();
      fetchMock.mockResolvedValue(createSuccessResponse());

      await client.log(LogLevel.WARN, 'warning message');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toEqual({ level: 'WARN', message: 'warning message' });
    });

    it('должен включить stackTrace и metadata при наличии', async () => {
      const client = createClient();
      fetchMock.mockResolvedValue(createSuccessResponse());

      await client.log(LogLevel.ERROR, 'error', {
        stackTrace: 'Error: test\n    at foo.ts:1',
        metadata: { userId: 'usr_123' },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toEqual({
        level: 'ERROR',
        message: 'error',
        stackTrace: 'Error: test\n    at foo.ts:1',
        metadata: { userId: 'usr_123' },
      });
    });

    it('не должен включать stackTrace/metadata если не переданы', async () => {
      const client = createClient();
      fetchMock.mockResolvedValue(createSuccessResponse());

      await client.log(LogLevel.INFO, 'info');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toEqual({ level: 'INFO', message: 'info' });
      expect(body).not.toHaveProperty('stackTrace');
      expect(body).not.toHaveProperty('metadata');
    });

    it('должен вернуть LogResponse при успешном ответе', async () => {
      const client = createClient();
      fetchMock.mockResolvedValue(createSuccessResponse());

      const result = await client.log(LogLevel.ERROR, 'test');

      expect(result).toEqual(MOCK_RESPONSE);
    });
  });

  // ── Shorthand методы ───────────────────────────────────────────────────

  describe('shorthand методы', () => {
    let client: LogHubClient;

    beforeEach(() => {
      client = createClient();
      fetchMock.mockResolvedValue(createSuccessResponse());
    });

    it('debug() должен вызвать log() с LogLevel.DEBUG', async () => {
      await client.debug('msg');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.level).toBe('DEBUG');
    });

    it('info() должен вызвать log() с LogLevel.INFO', async () => {
      await client.info('msg');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.level).toBe('INFO');
    });

    it('warn() должен вызвать log() с LogLevel.WARN', async () => {
      await client.warn('msg');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.level).toBe('WARN');
    });

    it('error() должен вызвать log() с LogLevel.ERROR', async () => {
      await client.error('msg');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.level).toBe('ERROR');
    });

    it('fatal() должен вызвать log() с LogLevel.FATAL', async () => {
      await client.fatal('msg');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.level).toBe('FATAL');
    });
  });

  // ── Retry логика ──────────────────────────────────────────────────────

  describe('retry логика', () => {
    it('должен повторить при 500 ответе', async () => {
      const client = createClient({ retries: 1, retryDelay: 1 });
      fetchMock
        .mockResolvedValueOnce(createErrorResponse(500, 'Internal'))
        .mockResolvedValueOnce(createSuccessResponse());

      const result = await client.error('test');

      expect(result).toEqual(MOCK_RESPONSE);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('должен повторить при сетевой ошибке', async () => {
      const client = createClient({ retries: 1, retryDelay: 1 });
      fetchMock
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(createSuccessResponse());

      const result = await client.error('test');

      expect(result).toEqual(MOCK_RESPONSE);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('НЕ должен повторить при 400 ответе', async () => {
      const client = createClient({ retries: 2, retryDelay: 1 });
      fetchMock.mockResolvedValue(createErrorResponse(400, 'Bad Request'));

      await expect(client.error('test')).rejects.toThrow(LogHubApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('НЕ должен повторить при 401 ответе', async () => {
      const client = createClient({ retries: 2, retryDelay: 1 });
      fetchMock.mockResolvedValue(createErrorResponse(401, 'Unauthorized'));

      await expect(client.error('test')).rejects.toThrow(LogHubApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('НЕ должен повторить при 413 ответе', async () => {
      const client = createClient({ retries: 2, retryDelay: 1 });
      fetchMock.mockResolvedValue(
        createErrorResponse(413, 'Payload Too Large'),
      );

      await expect(client.error('test')).rejects.toThrow(LogHubApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('должен использовать exponential backoff между попытками', async () => {
      const retryClient = new LogHubClient({
        endpoint: MOCK_ENDPOINT,
        apiKey: MOCK_API_KEY,
        retries: 2,
        retryDelay: 100,
        timeout: 99_999, // Отличается от retry delays для фильтрации
        onError: jest.fn(),
      });

      const sleepDelays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: TimerHandler, ms?: number) => {
          // AbortController timeout = 99999, sleep = 100/200
          if (ms !== undefined && ms < 99_999) {
            sleepDelays.push(ms);
          }
          if (typeof fn === 'function') {
            fn();
          }
          return 0 as unknown as ReturnType<typeof setTimeout>;
        });

      fetchMock
        .mockResolvedValueOnce(createErrorResponse(500, 'err'))
        .mockResolvedValueOnce(createErrorResponse(500, 'err'))
        .mockResolvedValueOnce(createSuccessResponse());

      await retryClient.error('test');

      // retryDelay * 2^0 = 100, retryDelay * 2^1 = 200
      expect(sleepDelays).toEqual([100, 200]);

      jest.restoreAllMocks();
      global.setTimeout = originalSetTimeout;
    });

    it('должен бросить после исчерпания попыток', async () => {
      const client = createClient({
        retries: 1,
        retryDelay: 1,
        onError: jest.fn(),
      });
      fetchMock.mockResolvedValue(createErrorResponse(500, 'Server Error'));

      await expect(client.error('test')).rejects.toThrow(LogHubApiError);
      expect(fetchMock).toHaveBeenCalledTimes(2); // 1 + 1 retry
    });
  });

  // ── Timeout ───────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('должен прервать запрос по таймауту через AbortController', async () => {
      const client = createClient({ timeout: 50 });

      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            // Слушаем abort signal
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      await expect(client.error('test')).rejects.toThrow();
    });
  });

  // ── onError ───────────────────────────────────────────────────────────

  describe('onError callback', () => {
    it('должен вызвать onError при исчерпании попыток', async () => {
      const onError = jest.fn();
      const client = createClient({ retries: 0, onError });
      fetchMock.mockResolvedValue(createErrorResponse(500, 'err'));

      await expect(client.error('test')).rejects.toThrow();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(LogHubApiError));
    });

    it('должен использовать console.error по умолчанию', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const client = createClient({ retries: 0 });
      fetchMock.mockResolvedValue(createErrorResponse(500, 'err'));

      await expect(client.error('test')).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[LogHub]',
        expect.stringContaining('500'),
      );
    });
  });

  // ── LogHubApiError ────────────────────────────────────────────────────

  describe('LogHubApiError', () => {
    it('должен содержать statusCode и responseBody', () => {
      const error = new LogHubApiError(422, '{"message":"Invalid"}');

      expect(error.statusCode).toBe(422);
      expect(error.responseBody).toBe('{"message":"Invalid"}');
      expect(error.message).toContain('422');
      expect(error.message).toContain('{"message":"Invalid"}');
    });

    it('должен иметь name = "LogHubApiError"', () => {
      const error = new LogHubApiError(500, 'err');

      expect(error.name).toBe('LogHubApiError');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
