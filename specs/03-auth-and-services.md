# 03 — Аутентификация и управление сервисами

## 3.1 Две модели аутентификации

LogHub использует две параллельные модели auth:

| Контекст | Механизм | Guard | Заголовок |
|----------|----------|-------|-----------|
| Внешние сервисы → Ingestion API | API Key | `ApiKeyGuard` | `X-API-Key` |
| Админ → Admin API | JWT Bearer | `AdminGuard` | `Authorization: Bearer {token}` |

## 3.2 API Key — генерация и хранение

### 3.2.1 Формат ключа

```
sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
└─────┘ └──────────────────────────────────┘
prefix   32 hex символа (crypto.randomBytes(16).toString('hex'))
```

Полная длина: `sk_live_` (8) + 32 hex = 40 символов.

### 3.2.2 Утилита генерации (shared/utils/crypto.util.ts)

```typescript
import { createHash, randomBytes } from 'crypto';
import { API_KEY_PREFIX, API_KEY_LENGTH } from '@shared/constants';

/**
 * Генерирует новый API-ключ
 * @returns {{ apiKey: string; apiKeyHash: string; apiKeyLast4: string }}
 */
export function generateApiKey(): {
  apiKey: string;
  apiKeyHash: string;
  apiKeyLast4: string;
} {
  const raw = randomBytes(API_KEY_LENGTH / 2).toString('hex');
  const apiKey = `${API_KEY_PREFIX}${raw}`;
  const apiKeyHash = hashApiKey(apiKey);
  const apiKeyLast4 = apiKey.slice(-4);

  return { apiKey, apiKeyHash, apiKeyLast4 };
}

/**
 * Хеширует API-ключ для хранения/поиска
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}
```

### 3.2.3 Жизненный цикл API Key

1. Админ вызывает `POST /api/admin/services` с `{ name, slug, description? }`
2. `ServicesService.create()` генерирует ключ через `generateApiKey()`
3. В БД сохраняется ТОЛЬКО `apiKeyHash` и `apiKeyLast4`
4. Оригинальный `apiKey` возвращается в ответе **один раз**
5. В Redis кэшируется маппинг `apiKeyHash → serviceInfo` с TTL 5 мин
6. При последующих запросах ключ **невозможно восстановить** — только перегенерировать

### 3.2.4 Перегенерация ключа

Эндпоинт: `POST /api/admin/services/:id/regenerate-key`

1. Генерирует новый ключ
2. Обновляет `apiKeyHash` и `apiKeyLast4` в БД
3. Инвалидирует старый кэш в Redis
4. Возвращает новый `apiKey` один раз
5. Старый ключ перестаёт работать мгновенно (через TTL кэша — максимум через 5 мин; для instant — DEL старого кэша)

## 3.3 ApiKeyGuard (shared/guards/api-key.guard.ts)

### 3.3.1 Полная реализация

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
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
  API_KEY_PREFIX,
} from '@shared/constants';

interface CachedServiceInfo {
  serviceId: string;
  slug: string;
  isActive: boolean;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
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

    if (!apiKey.startsWith(API_KEY_PREFIX)) {
      throw new UnauthorizedException('Неверный формат API-ключа');
    }

    const apiKeyHash = hashApiKey(apiKey);
    const serviceInfo = await this.resolveService(apiKeyHash);

    if (!serviceInfo) {
      throw new UnauthorizedException('Недействительный API-ключ');
    }

    if (!serviceInfo.isActive) {
      throw new UnauthorizedException('Сервис деактивирован');
    }

    // Инжектим serviceId в request для использования в контроллере
    (request as any).serviceContext = {
      serviceId: serviceInfo.serviceId,
      slug: serviceInfo.slug,
    };

    return true;
  }

  private extractApiKey(request: FastifyRequest): string | undefined {
    return request.headers[API_KEY_HEADER] as string | undefined;
  }

  private async resolveService(apiKeyHash: string): Promise<CachedServiceInfo | null> {
    const cacheKey = `${API_KEY_CACHE_PREFIX}${apiKeyHash}`;

    // 1. Проверяем Redis кэш
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CachedServiceInfo;
    }

    // 2. Cache miss → ищем в БД
    const service = await this.prisma.service.findUnique({
      where: { apiKeyHash },
      select: { id: true, slug: true, isActive: true },
    });

    if (!service) {
      return null;
    }

    // 3. Кэшируем результат
    const info: CachedServiceInfo = {
      serviceId: service.id,
      slug: service.slug,
      isActive: service.isActive,
    };
    await this.redis.set(cacheKey, JSON.stringify(info), 'EX', API_KEY_CACHE_TTL_SECONDS);

    return info;
  }
}
```

### 3.3.2 Декоратор @CurrentService()

```typescript
// shared/decorators/current-service.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ServiceContext {
  serviceId: string;
  slug: string;
}

export const CurrentService = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ServiceContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.serviceContext;
  },
);
```

**Использование в контроллере:**
```typescript
@Post('ingest')
@UseGuards(ApiKeyGuard)
async ingest(
  @CurrentService() service: ServiceContext,
  @Body() dto: IngestLogDto,
): Promise<IngestResponseDto> {
  return this.ingestionService.ingest(service.serviceId, dto);
}
```

## 3.4 Admin JWT Auth

### 3.4.1 AdminAuthService (admin/admin-auth.service.ts)

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { ADMIN_JWT_EXPIRY } from '@shared/constants';

interface AdminJwtPayload {
  sub: string;
  role: 'admin';
}

@Injectable()
export class AdminAuthService {
  private readonly adminLogin: string;
  private readonly adminPasswordHash: string;
  private readonly jwtSecret: string;

  constructor(private readonly config: ConfigService) {
    this.adminLogin = this.config.getOrThrow<string>('ADMIN_LOGIN');
    // Хешируем пароль из env для сравнения (не храним plain text в памяти)
    const password = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    this.adminPasswordHash = createHash('sha256').update(password).digest('hex');
    this.jwtSecret = this.config.getOrThrow<string>('ADMIN_JWT_SECRET');
  }

  /**
   * Логин админа. Возвращает JWT или бросает UnauthorizedException.
   */
  login(login: string, password: string): { accessToken: string } {
    const passwordHash = createHash('sha256').update(password).digest('hex');

    if (login !== this.adminLogin || passwordHash !== this.adminPasswordHash) {
      throw new UnauthorizedException('Неверные учётные данные');
    }

    const payload: AdminJwtPayload = { sub: login, role: 'admin' };
    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: ADMIN_JWT_EXPIRY,
    });

    return { accessToken };
  }

  /**
   * Верифицирует JWT токен. Возвращает payload или бросает.
   */
  verifyToken(token: string): AdminJwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as AdminJwtPayload;
    } catch {
      throw new UnauthorizedException('Невалидный или истёкший токен');
    }
  }
}
```

### 3.4.2 AdminGuard (shared/guards/admin.guard.ts)

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AdminAuthService } from '@admin/admin-auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Отсутствует Bearer токен');
    }

    const token = authHeader.slice(7);
    this.adminAuth.verifyToken(token); // throws if invalid

    return true;
  }
}
```

## 3.5 ServicesService (core/services/services.service.ts)

### 3.5.1 Интерфейс

```typescript
interface CreateServiceInput {
  name: string;
  slug: string;
  description?: string;
}

interface CreateServiceResult {
  id: string;
  name: string;
  slug: string;
  apiKey: string;        // Показывается один раз
  apiKeyLast4: string;
  createdAt: Date;
}

interface ServiceListItem {
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

interface UpdateServiceInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

interface RegenerateKeyResult {
  apiKey: string;        // Новый ключ, показывается один раз
  apiKeyLast4: string;
}
```

### 3.5.2 Методы

| Метод | Описание | Invalidation |
|-------|----------|-------------|
| `create(input)` | Создаёт сервис + генерирует API key | — |
| `findAll()` | Все сервисы с `_count.errorLogs` | — |
| `findById(id)` | Один сервис по ID | — |
| `update(id, input)` | Обновляет name/description/isActive | Инвалидирует Redis кэш apikey если isActive изменился |
| `remove(id)` | Удаляет сервис (каскадно логи) | DEL кэша apikey |
| `regenerateKey(id)` | Перегенерирует API key | DEL старого кэша, SET нового |
| `findByApiKeyHash(hash)` | Поиск по хешу ключа (для Guard) | — |

### 3.5.3 Важные детали реализации

**Slug validation:**
- Только латиница, цифры, дефис: `/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/`
- Уникальный (Prisma constraint)
- Используется как имя Telegram-топика при создании

**Инвалидация кэша при деактивации:**
```typescript
async update(id: string, input: UpdateServiceInput): Promise<Service> {
  const service = await this.prisma.service.update({
    where: { id },
    data: input,
  });

  // Если изменили isActive — инвалидируем кэш
  if (input.isActive !== undefined) {
    const cacheKey = `${API_KEY_CACHE_PREFIX}${service.apiKeyHash}`;
    await this.redis.del(cacheKey);
  }

  return service;
}
```
