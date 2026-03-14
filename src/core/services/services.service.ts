import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';
import { generateApiKey } from '@shared/utils/crypto.util';
import {
  API_KEY_CACHE_PREFIX,
  API_KEY_CACHE_TTL_SECONDS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SLUG_REGEX,
} from '@shared/constants';
import { LogLevel } from '@shared/enums/log-level.enum';
import { PaginatedResult } from '@shared/interfaces/paginated-result.interface';

// ─── Интерфейсы ────────────────────────────────────────────────────────────────

export interface CreateServiceInput {
  name: string;
  slug: string;
  description?: string;
}

export interface CreateServiceResult {
  id: string;
  name: string;
  slug: string;
  /** Полный API-ключ — показывается один раз */
  apiKey: string;
  apiKeyLast4: string;
  createdAt: Date;
}

export interface ServiceListItem {
  id: string;
  name: string;
  slug: string;
  apiKeyLast4: string;
  topicId: number | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { errorLogs: number };
}

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateServiceResult {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  description: string | null;
  updatedAt: Date;
}

export interface RegenerateKeyResult {
  /** Новый API-ключ — показывается один раз */
  apiKey: string;
  apiKeyLast4: string;
}

export interface FindLogsInput {
  serviceId?: string;
  level?: LogLevel;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Лог с включённой связью service (для ответа findLogs) */
export interface ErrorLogWithService {
  id: string;
  serviceId: string;
  level: string;
  message: string;
  stackTrace: string | null;
  metadata: unknown;
  fingerprint: string;
  telegramSent: boolean;
  createdAt: Date;
  service: { name: string; slug: string };
}

// ─── Сервис ────────────────────────────────────────────────────────────────────

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Создаёт новый сервис и генерирует API-ключ.
   * Ключ возвращается один раз — далее доступен только через перегенерацию.
   */
  async create(input: CreateServiceInput): Promise<CreateServiceResult> {
    this.validateSlug(input.slug);

    const { apiKey, apiKeyHash } = generateApiKey();
    const apiKeyLast4 = apiKey.slice(-4);

    let service: { id: string; name: string; slug: string; createdAt: Date };
    try {
      service = await this.prisma.service.create({
        data: {
          name: input.name,
          slug: input.slug,
          ...(input.description && { description: input.description }),
          apiKeyHash,
          apiKeyLast4,
        },
        select: { id: true, name: true, slug: true, createdAt: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          `Сервис со slug "${input.slug}" уже существует`,
        );
      }
      throw error;
    }

    // Прогрев кэша (§3.2.3 step 5) — best-effort
    await this.cacheServiceInfo(apiKeyHash, service.id, service.slug);

    return {
      id: service.id,
      name: service.name,
      slug: service.slug,
      apiKey,
      apiKeyLast4,
      createdAt: service.createdAt,
    };
  }

  /**
   * Возвращает все сервисы с количеством логов.
   */
  async findAll(): Promise<ServiceListItem[]> {
    return this.prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        apiKeyLast4: true,
        topicId: true,
        isActive: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { errorLogs: true } },
      },
    });
  }

  /**
   * Возвращает сервис по ID с количеством логов.
   * @throws NotFoundException если сервис не найден
   */
  async findById(id: string): Promise<ServiceListItem> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        apiKeyLast4: true,
        topicId: true,
        isActive: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { errorLogs: true } },
      },
    });

    if (!service) {
      throw new NotFoundException('Сервис не найден');
    }

    return service;
  }

  /**
   * Обновляет сервис. При изменении isActive инвалидирует Redis-кэш API-ключа.
   * @throws BadRequestException если не передано ни одного поля
   * @throws NotFoundException если сервис не найден
   */
  async update(
    id: string,
    input: UpdateServiceInput,
  ): Promise<UpdateServiceResult> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException(
        'Необходимо указать хотя бы одно поле для обновления',
      );
    }

    let service: { id: string; apiKeyHash: string; name: string; slug: string; isActive: boolean; description: string | null; updatedAt: Date };
    try {
      service = await this.prisma.service.update({
        where: { id },
        data: input,
        select: {
          id: true,
          apiKeyHash: true,
          name: true,
          slug: true,
          isActive: true,
          description: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Сервис не найден');
      }
      throw error;
    }

    // Инвалидация кэша при изменении isActive (§3.5.3)
    if (input.isActive !== undefined) {
      await this.invalidateCache(service.apiKeyHash);
    }

    return {
      id: service.id,
      name: service.name,
      slug: service.slug,
      isActive: service.isActive,
      description: service.description,
      updatedAt: service.updatedAt,
    };
  }

  /**
   * Удаляет сервис и все его логи (каскадно). Инвалидирует Redis-кэш.
   * @throws NotFoundException если сервис не найден
   */
  async remove(id: string): Promise<{ message: string }> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: { apiKeyHash: true, slug: true },
    });

    if (!service) {
      throw new NotFoundException('Сервис не найден');
    }

    try {
      await this.prisma.service.delete({ where: { id } });
    } catch (error) {
      // Race condition: другой запрос уже удалил сервис
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Сервис не найден');
      }
      throw error;
    }
    await this.invalidateCache(service.apiKeyHash);

    return { message: `Сервис "${service.slug}" удалён` };
  }

  /**
   * Перегенерирует API-ключ. Старый ключ мгновенно перестаёт работать.
   * Новый ключ возвращается один раз.
   * @throws NotFoundException если сервис не найден
   */
  async regenerateKey(id: string): Promise<RegenerateKeyResult> {
    const existing = await this.prisma.service.findUnique({
      where: { id },
      select: { apiKeyHash: true, slug: true },
    });

    if (!existing) {
      throw new NotFoundException('Сервис не найден');
    }

    const { apiKey, apiKeyHash: newApiKeyHash } = generateApiKey();
    const apiKeyLast4 = apiKey.slice(-4);

    await this.prisma.service.update({
      where: { id },
      data: { apiKeyHash: newApiKeyHash, apiKeyLast4 },
    });

    // DEL старого кэша + SET нового (§3.5.2)
    await this.invalidateCache(existing.apiKeyHash);
    await this.cacheServiceInfo(newApiKeyHash, id, existing.slug);

    return { apiKey, apiKeyLast4 };
  }

  /**
   * Поиск сервиса по хешу API-ключа (для Guard).
   * Возвращает null если не найден.
   */
  async findByApiKeyHash(
    hash: string,
  ): Promise<{ id: string; slug: string; isActive: boolean } | null> {
    return this.prisma.service.findUnique({
      where: { apiKeyHash: hash },
      select: { id: true, slug: true, isActive: true },
    });
  }

  /**
   * Возвращает логи с фильтрами и пагинацией.
   * Включает связь service (name, slug) для каждого лога.
   */
  async findLogs(
    query: FindLogsInput,
  ): Promise<PaginatedResult<ErrorLogWithService>> {
    const where: Prisma.ErrorLogWhereInput = {};

    if (query.serviceId) {
      where.serviceId = query.serviceId;
    }
    if (query.level) {
      where.level = query.level;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }
    if (query.search) {
      where.message = { contains: query.search, mode: 'insensitive' };
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const [data, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          service: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return {
      data: data as unknown as ErrorLogWithService[],
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ─── Приватные методы ──────────────────────────────────────────────────────

  /**
   * Валидация slug по регулярному выражению (§3.5.3).
   * @throws BadRequestException при невалидном slug
   */
  private validateSlug(slug: string): void {
    if (!SLUG_REGEX.test(slug)) {
      throw new BadRequestException(
        'Slug должен содержать только латиницу, цифры и дефис (3-50 символов)',
      );
    }
  }

  /**
   * Кэширует маппинг apiKeyHash → serviceInfo в Redis (best-effort).
   * Формат совпадает с CachedServiceInfo из api-key.guard.ts.
   */
  private async cacheServiceInfo(
    apiKeyHash: string,
    serviceId: string,
    slug: string,
  ): Promise<void> {
    try {
      const cacheKey = `${API_KEY_CACHE_PREFIX}${apiKeyHash}`;
      await this.redis.set(
        cacheKey,
        JSON.stringify({ serviceId, slug }),
        'EX',
        API_KEY_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn('Не удалось записать в Redis кэш', error);
    }
  }

  /**
   * Удаляет кэш API-ключа из Redis (best-effort).
   */
  private async invalidateCache(apiKeyHash: string): Promise<void> {
    try {
      const cacheKey = `${API_KEY_CACHE_PREFIX}${apiKeyHash}`;
      await this.redis.del(cacheKey);
    } catch (error) {
      this.logger.warn('Не удалось инвалидировать Redis кэш', error);
    }
  }

  /** Проверяет, является ли ошибка нарушением уникального ограничения Prisma (P2002) */
  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  /** Проверяет, является ли ошибка «запись не найдена» Prisma (P2025) */
  private isRecordNotFoundError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
