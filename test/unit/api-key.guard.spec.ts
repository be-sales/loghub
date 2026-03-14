import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from '@shared/guards/api-key.guard';
import { hashApiKey } from '@shared/utils/crypto.util';
import { API_KEY_CACHE_PREFIX, API_KEY_CACHE_TTL_SECONDS } from '@shared/constants';
import { createPrismaMock } from '../utils/prisma-mock';
import { createRedisMock } from '../utils/redis-mock';

const TEST_HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-chars!!';
const TEST_API_KEY = 'sk_live_' + '0'.repeat(32);
const TEST_SERVICE_ID = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
const TEST_SLUG = 'my-service';

// HMAC_SECRET нужен при загрузке модуля — устанавливаем до вычисления TEST_API_KEY_HASH
let TEST_API_KEY_HASH: string;

function createMockExecutionContext(
  headers: Record<string, string | undefined>,
): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let redisMock: ReturnType<typeof createRedisMock>;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeAll(() => {
    process.env.HMAC_SECRET = TEST_HMAC_SECRET;
    TEST_API_KEY_HASH = hashApiKey(TEST_API_KEY);
  });

  afterAll(() => {
    delete process.env.HMAC_SECRET;
  });

  beforeEach(() => {
    redisMock = createRedisMock();
    prismaMock = createPrismaMock();
    guard = new ApiKeyGuard(redisMock as never, prismaMock as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('должен вернуть 401, если нет заголовка X-API-Key', async () => {
    const context = createMockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Отсутствует API-ключ в заголовке X-API-Key',
    );
  });

  it('должен вернуть 401, если формат ключа неверный (без sk_live_)', async () => {
    const context = createMockExecutionContext({ 'x-api-key': 'invalid_key_format' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Неверный формат API-ключа');
  });

  it('должен вернуть 401, если ключ не существует', async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.service.findUnique.mockResolvedValue(null);

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Недействительный API-ключ');
  });

  it('должен вернуть 401, если сервис деактивирован', async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.service.findUnique.mockResolvedValue({
      id: TEST_SERVICE_ID,
      slug: TEST_SLUG,
      isActive: false,
    });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    // Деактивированный сервис возвращает тот же generic message, чтобы не раскрывать статус
    await expect(guard.canActivate(context)).rejects.toThrow('Недействительный API-ключ');
  });

  it('должен пропустить запрос с валидным ключом из Redis кэша', async () => {
    // isActive не хранится в кэше — только неизменяемые идентификаторы
    const cachedInfo = JSON.stringify({
      serviceId: TEST_SERVICE_ID,
      slug: TEST_SLUG,
    });
    redisMock.get.mockResolvedValue(cachedInfo);
    // isActive читается из БД при каждом cache hit
    prismaMock.service.findUnique.mockResolvedValue({ isActive: true });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // При cache hit Prisma вызывается один раз — только для проверки isActive по PK
    expect(prismaMock.service.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.service.findUnique).toHaveBeenCalledWith({
      where: { id: TEST_SERVICE_ID },
      select: { isActive: true },
    });
  });

  it('должен при cache miss найти в БД, закэшировать и пропустить', async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.service.findUnique.mockResolvedValue({
      id: TEST_SERVICE_ID,
      slug: TEST_SLUG,
      isActive: true,
    });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(prismaMock.service.findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: TEST_API_KEY_HASH },
      select: { id: true, slug: true, isActive: true },
    });
    // В кэш записываем без isActive
    expect(redisMock.set).toHaveBeenCalledWith(
      `${API_KEY_CACHE_PREFIX}${TEST_API_KEY_HASH}`,
      expect.not.stringContaining('"isActive"'),
      'EX',
      API_KEY_CACHE_TTL_SECONDS,
    );
  });

  it('должен установить правильный serviceContext в request', async () => {
    const cachedInfo = JSON.stringify({
      serviceId: TEST_SERVICE_ID,
      slug: TEST_SLUG,
    });
    redisMock.get.mockResolvedValue(cachedInfo);
    prismaMock.service.findUnique.mockResolvedValue({ isActive: true });

    const request: Record<string, unknown> = { headers: { 'x-api-key': TEST_API_KEY } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await guard.canActivate(context);

    expect(request['serviceContext']).toEqual({
      serviceId: TEST_SERVICE_ID,
      slug: TEST_SLUG,
    });
  });

  it('должен сделать fallback на DB при повреждённом JSON в кэше', async () => {
    redisMock.get.mockResolvedValue('invalid_json{{{');
    prismaMock.service.findUnique.mockResolvedValue({
      id: TEST_SERVICE_ID,
      slug: TEST_SLUG,
      isActive: true,
    });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // Должен был удалить повреждённый кэш и обратиться в БД
    expect(redisMock.del).toHaveBeenCalled();
    expect(prismaMock.service.findUnique).toHaveBeenCalled();
  });

  // P1: Redis resilience

  it('P1: при ошибке redis.get должен сделать fallback на Prisma и пропустить запрос', async () => {
    redisMock.get.mockRejectedValue(new Error('Redis connection refused'));
    prismaMock.service.findUnique.mockResolvedValue({
      id: TEST_SERVICE_ID,
      slug: TEST_SLUG,
      isActive: true,
    });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // Полный DB lookup по apiKeyHash
    expect(prismaMock.service.findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: TEST_API_KEY_HASH },
      select: { id: true, slug: true, isActive: true },
    });
  });

  it('P1: при ошибке redis.set запрос всё равно должен пройти успешно', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockRejectedValue(new Error('Redis write failed'));
    prismaMock.service.findUnique.mockResolvedValue({
      id: TEST_SERVICE_ID,
      slug: TEST_SLUG,
      isActive: true,
    });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  // P2: isActive не кэшируется

  it('P2: при cache hit и isActive=false в БД должен вернуть 401', async () => {
    const cachedInfo = JSON.stringify({ serviceId: TEST_SERVICE_ID, slug: TEST_SLUG });
    redisMock.get.mockResolvedValue(cachedInfo);
    // Сервис деактивирован — это актуальное состояние из БД
    prismaMock.service.findUnique.mockResolvedValue({ isActive: false });

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Недействительный API-ключ');
  });

  it('P2: при cache hit, но сервис удалён из БД — должен вернуть 401', async () => {
    const cachedInfo = JSON.stringify({ serviceId: TEST_SERVICE_ID, slug: TEST_SLUG });
    redisMock.get.mockResolvedValue(cachedInfo);
    // Сервис удалён
    prismaMock.service.findUnique.mockResolvedValue(null);

    const context = createMockExecutionContext({ 'x-api-key': TEST_API_KEY });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Недействительный API-ключ');
  });
});
