import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RedisService } from '@redis/redis.service';
import { PrismaService } from '@prisma/prisma.service';
import { hashApiKey } from '@shared/utils/crypto.util';
import {
  API_KEY_HEADER,
  API_KEY_CACHE_PREFIX,
  API_KEY_CACHE_TTL_SECONDS,
  API_KEY_FORMAT_REGEX,
  API_KEY_MAX_LENGTH,
} from '@shared/constants';
import { ServiceContext } from '@shared/interfaces/service-context.interface';

/** Только неизменяемые поля — isActive не кэшируется (мутабельное auth-состояние) */
interface CachedServiceInfo {
  serviceId: string;
  slug: string;
}

type ServiceResolutionResult = CachedServiceInfo & { isActive: boolean };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('Отсутствует API-ключ в заголовке X-API-Key');
    }

    // Быстрая проверка длины перед regex (защита от oversized input)
    if (apiKey.length > API_KEY_MAX_LENGTH || !API_KEY_FORMAT_REGEX.test(apiKey)) {
      throw new UnauthorizedException('Неверный формат API-ключа');
    }

    const apiKeyHash = hashApiKey(apiKey);
    const serviceInfo = await this.resolveService(apiKeyHash);

    if (!serviceInfo) {
      this.logger.warn(
        `Попытка доступа с недействительным API-ключом (hash prefix: ${apiKeyHash.substring(0, 8)}...)`,
      );
      throw new UnauthorizedException('Недействительный API-ключ');
    }

    if (!serviceInfo.isActive) {
      // Не раскрываем клиенту, что ключ реален — только логируем
      this.logger.warn(
        `Попытка доступа с ключом деактивированного сервиса: "${serviceInfo.slug}"`,
      );
      throw new UnauthorizedException('Недействительный API-ключ');
    }

    // Инжектим serviceContext в request для использования через @CurrentService декоратор
    (request as FastifyRequest & { serviceContext: ServiceContext }).serviceContext = {
      serviceId: serviceInfo.serviceId,
      slug: serviceInfo.slug,
    };

    return true;
  }

  private extractApiKey(request: FastifyRequest): string | undefined {
    return request.headers[API_KEY_HEADER] as string | undefined;
  }

  private async resolveService(apiKeyHash: string): Promise<ServiceResolutionResult | null> {
    const cacheKey = `${API_KEY_CACHE_PREFIX}${apiKeyHash}`;

    // 1. Пробуем Redis кэш (best-effort — сбой Redis не должен ронять авторизацию)
    let cachedInfo: CachedServiceInfo | null = null;
    try {
      const raw = await this.redis.get(cacheKey);
      if (raw) {
        cachedInfo = this.parseCachedServiceInfo(raw, cacheKey);
        if (cachedInfo === null) {
          // Повреждённый кэш — удаляем и делаем полный DB lookup
          await this.redis.del(cacheKey);
        }
      }
    } catch (error) {
      this.logger.warn('Redis недоступен, fallback на Prisma для разрешения API-ключа', error);
    }

    // 2. Cache hit — isActive всегда читаем из БД (не кэшируется)
    if (cachedInfo !== null) {
      const row = await this.prisma.service.findUnique({
        where: { id: cachedInfo.serviceId },
        select: { isActive: true },
      });
      if (!row) return null;
      return { ...cachedInfo, isActive: row.isActive };
    }

    // 3. Cache miss → полный lookup в БД
    const service = await this.prisma.service.findUnique({
      where: { apiKeyHash },
      select: { id: true, slug: true, isActive: true },
    });

    if (!service) {
      return null;
    }

    // 4. Кэшируем только неизменяемые идентификаторы (без isActive)
    try {
      const info: CachedServiceInfo = { serviceId: service.id, slug: service.slug };
      await this.redis.set(cacheKey, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn('Не удалось записать в Redis кэш', error);
    }

    return { serviceId: service.id, slug: service.slug, isActive: service.isActive };
  }

  /**
   * Безопасный парсинг и валидация кэшированных данных.
   * При ошибке — возвращает null для fallback на DB lookup.
   */
  private parseCachedServiceInfo(cached: string, cacheKey: string): CachedServiceInfo | null {
    try {
      const parsed = JSON.parse(cached) as unknown;
      const obj = parsed as Record<string, unknown>;

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof obj.serviceId !== 'string' ||
        typeof obj.slug !== 'string'
      ) {
        this.logger.warn(`Повреждённая структура в Redis кэше: ${cacheKey}`);
        return null;
      }

      return { serviceId: obj.serviceId as string, slug: obj.slug as string };
    } catch {
      this.logger.warn(`Ошибка парсинга Redis кэша: ${cacheKey}`);
      return null;
    }
  }
}
