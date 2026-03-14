import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ServicesService } from '@core/services/services.service';
import { API_KEY_CACHE_PREFIX, API_KEY_CACHE_TTL_SECONDS } from '@shared/constants';
import { createPrismaMock } from '../utils/prisma-mock';
import { createRedisMock } from '../utils/redis-mock';

const TEST_HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-chars!!';
const TEST_SERVICE_ID = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
const TEST_SLUG = 'my-service';
const TEST_API_KEY_HASH = 'oldhash1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function createPrismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Error', {
    code,
    clientVersion: '6.0.0',
  });
}

describe('ServicesService', () => {
  let service: ServicesService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let redisMock: ReturnType<typeof createRedisMock>;

  beforeAll(() => {
    process.env.HMAC_SECRET = TEST_HMAC_SECRET;
  });

  afterAll(() => {
    delete process.env.HMAC_SECRET;
  });

  beforeEach(() => {
    prismaMock = createPrismaMock();
    redisMock = createRedisMock();
    service = new ServicesService(prismaMock as never, redisMock as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const input = { name: 'Test Service', slug: 'test-service' };

    it('должен генерировать API key, сохранить hash и вернуть plain key', async () => {
      prismaMock.service.create.mockImplementation(
        async (args: { data: { apiKeyHash: string; apiKeyLast4: string }; select: unknown }) => ({
          id: TEST_SERVICE_ID,
          name: input.name,
          slug: input.slug,
          createdAt: new Date(),
          apiKeyHash: args.data.apiKeyHash,
          apiKeyLast4: args.data.apiKeyLast4,
        }),
      );

      const result = await service.create(input);

      // Plain key возвращается
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
      expect(result.apiKeyLast4).toBe(result.apiKey.slice(-4));
      expect(result.id).toBe(TEST_SERVICE_ID);
      expect(result.name).toBe(input.name);
      expect(result.slug).toBe(input.slug);

      // В БД передан hash, не plain key
      const createCall = prismaMock.service.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data).toHaveProperty('apiKeyHash');
      expect(createCall.data).not.toHaveProperty('apiKey');

      // Redis кэш прогрет (§3.2.3 step 5)
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining(API_KEY_CACHE_PREFIX),
        expect.stringContaining(TEST_SERVICE_ID),
        'EX',
        API_KEY_CACHE_TTL_SECONDS,
      );
    });

    it('должен бросить ConflictException при дубликате slug', async () => {
      prismaMock.service.create.mockRejectedValue(
        createPrismaKnownError('P2002'),
      );

      await expect(service.create(input)).rejects.toThrow(ConflictException);
      await expect(service.create(input)).rejects.toThrow(
        `Сервис со slug "${input.slug}" уже существует`,
      );
    });

    it('должен бросить BadRequestException при невалидном slug', async () => {
      // Одна буква — слишком короткий (минимум 3)
      await expect(
        service.create({ ...input, slug: 'a' }),
      ).rejects.toThrow(BadRequestException);

      // Начинается с дефиса
      await expect(
        service.create({ ...input, slug: '-invalid' }),
      ).rejects.toThrow(BadRequestException);

      // Содержит заглавные буквы
      await expect(
        service.create({ ...input, slug: 'Invalid-Slug' }),
      ).rejects.toThrow(BadRequestException);

      // Prisma не должна вызываться при невалидном slug
      expect(prismaMock.service.create).not.toHaveBeenCalled();
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('должен возвращать список сервисов с _count без apiKeyHash', async () => {
      const mockServices = [
        {
          id: TEST_SERVICE_ID,
          name: 'Service 1',
          slug: TEST_SLUG,
          apiKeyLast4: 'ab12',
          _count: { errorLogs: 42 },
        },
      ];
      prismaMock.service.findMany.mockResolvedValue(mockServices);

      const result = await service.findAll();

      expect(result).toEqual(mockServices);
      expect(prismaMock.service.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          apiKeyLast4: true,
          _count: { select: { errorLogs: true } },
        }),
      });
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('должен возвращать сервис с _count при нахождении', async () => {
      const mockService = {
        id: TEST_SERVICE_ID,
        name: 'Service',
        slug: TEST_SLUG,
        _count: { errorLogs: 10 },
      };
      prismaMock.service.findUnique.mockResolvedValue(mockService);

      const result = await service.findById(TEST_SERVICE_ID);

      expect(result).toEqual(mockService);
      expect(prismaMock.service.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_SERVICE_ID },
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          apiKeyLast4: true,
          _count: { select: { errorLogs: true } },
        }),
      });
    });

    it('должен бросить NotFoundException если сервис не найден', async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('nonexistent')).rejects.toThrow(
        'Сервис не найден',
      );
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('должен бросить BadRequestException при пустом теле PATCH', async () => {
      await expect(service.update(TEST_SERVICE_ID, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(TEST_SERVICE_ID, {})).rejects.toThrow(
        'Необходимо указать хотя бы одно поле для обновления',
      );

      // Prisma НЕ вызывалась — ранняя проверка
      expect(prismaMock.service.update).not.toHaveBeenCalled();
    });

    it('должен инвалидировать Redis кэш при изменении isActive', async () => {
      prismaMock.service.update.mockResolvedValue({
        id: TEST_SERVICE_ID,
        apiKeyHash: TEST_API_KEY_HASH,
        name: 'Service',
        slug: TEST_SLUG,
        isActive: false,
        description: null,
        updatedAt: new Date(),
      });

      await service.update(TEST_SERVICE_ID, { isActive: false });

      expect(redisMock.del).toHaveBeenCalledWith(
        `${API_KEY_CACHE_PREFIX}${TEST_API_KEY_HASH}`,
      );
    });

    it('НЕ должен инвалидировать кэш при обновлении без isActive', async () => {
      prismaMock.service.update.mockResolvedValue({
        id: TEST_SERVICE_ID,
        apiKeyHash: TEST_API_KEY_HASH,
        name: 'Updated Name',
        slug: TEST_SLUG,
        isActive: true,
        description: null,
        updatedAt: new Date(),
      });

      await service.update(TEST_SERVICE_ID, { name: 'Updated Name' });

      expect(redisMock.del).not.toHaveBeenCalled();
    });

    it('должен бросить NotFoundException если сервис не найден', async () => {
      prismaMock.service.update.mockRejectedValue(
        createPrismaKnownError('P2025'),
      );

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Сервис не найден');
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('должен удалить сервис каскадно и инвалидировать кэш', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        apiKeyHash: TEST_API_KEY_HASH,
        slug: TEST_SLUG,
      });
      prismaMock.service.delete.mockResolvedValue({});

      const result = await service.remove(TEST_SERVICE_ID);

      expect(result.message).toContain(TEST_SLUG);
      expect(prismaMock.service.delete).toHaveBeenCalledWith({
        where: { id: TEST_SERVICE_ID },
      });
      expect(redisMock.del).toHaveBeenCalledWith(
        `${API_KEY_CACHE_PREFIX}${TEST_API_KEY_HASH}`,
      );
    });

    it('должен бросить NotFoundException если сервис не найден', async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove('nonexistent')).rejects.toThrow(
        'Сервис не найден',
      );
    });
  });

  // ─── regenerateKey ─────────────────────────────────────────────────────────

  describe('regenerateKey', () => {
    it('должен перегенерировать ключ: DEL старого кэша, SET нового', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        apiKeyHash: TEST_API_KEY_HASH,
        slug: TEST_SLUG,
      });
      prismaMock.service.update.mockResolvedValue({});

      const result = await service.regenerateKey(TEST_SERVICE_ID);

      // Новый ключ возвращён
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{32}$/);
      expect(result.apiKeyLast4).toBe(result.apiKey.slice(-4));

      // В БД записан новый hash (отличается от старого)
      const updateCall = prismaMock.service.update.mock.calls[0][0] as {
        data: { apiKeyHash: string };
      };
      expect(updateCall.data.apiKeyHash).not.toBe(TEST_API_KEY_HASH);

      // DEL старого кэша
      expect(redisMock.del).toHaveBeenCalledWith(
        `${API_KEY_CACHE_PREFIX}${TEST_API_KEY_HASH}`,
      );

      // SET нового кэша (§3.5.2)
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining(API_KEY_CACHE_PREFIX),
        expect.stringContaining(TEST_SERVICE_ID),
        'EX',
        API_KEY_CACHE_TTL_SECONDS,
      );
    });

    it('должен бросить NotFoundException если сервис не найден', async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);

      await expect(service.regenerateKey('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.regenerateKey('nonexistent')).rejects.toThrow(
        'Сервис не найден',
      );
    });
  });

  // ─── findByApiKeyHash ──────────────────────────────────────────────────────

  describe('findByApiKeyHash', () => {
    it('должен вернуть сервис при нахождении по хешу', async () => {
      const mockResult = {
        id: TEST_SERVICE_ID,
        slug: TEST_SLUG,
        isActive: true,
      };
      prismaMock.service.findUnique.mockResolvedValue(mockResult);

      const result = await service.findByApiKeyHash(TEST_API_KEY_HASH);

      expect(result).toEqual(mockResult);
      expect(prismaMock.service.findUnique).toHaveBeenCalledWith({
        where: { apiKeyHash: TEST_API_KEY_HASH },
        select: { id: true, slug: true, isActive: true },
      });
    });

    it('должен вернуть null если сервис не найден', async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);

      const result = await service.findByApiKeyHash('nonexistent-hash');

      expect(result).toBeNull();
    });
  });

  // ─── findLogs ──────────────────────────────────────────────────────────────

  describe('findLogs', () => {
    it('должен вернуть логи с пагинацией и связью service', async () => {
      const mockLogs = [
        {
          id: 'log1',
          serviceId: TEST_SERVICE_ID,
          level: 'ERROR',
          message: 'Test error',
          service: { name: 'Service', slug: TEST_SLUG },
        },
      ];
      prismaMock.errorLog.findMany.mockResolvedValue(mockLogs);
      prismaMock.errorLog.count.mockResolvedValue(1);

      const result = await service.findLogs({ page: 1, pageSize: 50 });

      expect(result.data).toEqual(mockLogs);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      });

      // Проверяем include service
      expect(prismaMock.errorLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { service: { select: { name: true, slug: true } } },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('должен корректно строить where с фильтрами', async () => {
      prismaMock.errorLog.findMany.mockResolvedValue([]);
      prismaMock.errorLog.count.mockResolvedValue(0);

      await service.findLogs({
        serviceId: TEST_SERVICE_ID,
        level: 'ERROR' as never,
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-10T23:59:59.999Z',
        search: 'connection',
      });

      const callArgs = prismaMock.errorLog.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where).toEqual({
        serviceId: TEST_SERVICE_ID,
        level: 'ERROR',
        createdAt: {
          gte: new Date('2026-03-01T00:00:00.000Z'),
          lte: new Date('2026-03-10T23:59:59.999Z'),
        },
        message: { contains: 'connection', mode: 'insensitive' },
      });
    });

    it('должен возвращать totalPages = 0 для пустого результата', async () => {
      prismaMock.errorLog.findMany.mockResolvedValue([]);
      prismaMock.errorLog.count.mockResolvedValue(0);

      const result = await service.findLogs({});

      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  // ─── Redis resilience ──────────────────────────────────────────────────────

  describe('Redis resilience', () => {
    it('ошибка Redis при create НЕ должна ронять операцию', async () => {
      prismaMock.service.create.mockResolvedValue({
        id: TEST_SERVICE_ID,
        name: 'Service',
        slug: TEST_SLUG,
        createdAt: new Date(),
      });
      redisMock.set.mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.create({
        name: 'Service',
        slug: TEST_SLUG,
      });

      expect(result.id).toBe(TEST_SERVICE_ID);
    });

    it('ошибка Redis при update НЕ должна ронять операцию', async () => {
      prismaMock.service.update.mockResolvedValue({
        id: TEST_SERVICE_ID,
        apiKeyHash: TEST_API_KEY_HASH,
        name: 'Service',
        slug: TEST_SLUG,
        isActive: false,
        description: null,
        updatedAt: new Date(),
      });
      redisMock.del.mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.update(TEST_SERVICE_ID, {
        isActive: false,
      });

      expect(result.id).toBe(TEST_SERVICE_ID);
    });

    it('ошибка Redis при remove НЕ должна ронять операцию', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        apiKeyHash: TEST_API_KEY_HASH,
        slug: TEST_SLUG,
      });
      prismaMock.service.delete.mockResolvedValue({});
      redisMock.del.mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.remove(TEST_SERVICE_ID);

      expect(result.message).toContain(TEST_SLUG);
    });

    it('ошибка Redis при regenerateKey НЕ должна ронять операцию', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        apiKeyHash: TEST_API_KEY_HASH,
        slug: TEST_SLUG,
      });
      prismaMock.service.update.mockResolvedValue({});
      redisMock.del.mockRejectedValue(new Error('Redis connection refused'));
      redisMock.set.mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.regenerateKey(TEST_SERVICE_ID);

      expect(result.apiKey).toMatch(/^sk_live_/);
    });
  });
});
