# 07 — Admin API

## 7.1 Обзор

Admin API позволяет управлять зарегистрированными сервисами и просматривать логи. Все эндпоинты (кроме login) защищены `AdminGuard` (Bearer JWT).

Базовый путь: `/api/admin`

## 7.2 Эндпоинты

### 7.2.1 POST /api/admin/login

**Описание:** Аутентификация админа. Возвращает JWT.

**Guard:** Нет (публичный)

**Request Body:**

```typescript
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  login: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 401:**
```json
{
  "statusCode": 401,
  "message": "Неверные учётные данные",
  "error": "Unauthorized"
}
```

---

### 7.2.2 POST /api/admin/services

**Описание:** Регистрация нового сервиса. Возвращает API-ключ (показывается один раз).

**Guard:** `AdminGuard`

**Request Body:**

```typescript
export class CreateServiceDto {
  /**
   * Имя сервиса (отображается в Telegram топике)
   * @example "Astro Bot"
   */
  @IsString()
  @Length(2, 100)
  name: string;

  /**
   * Уникальный slug (латиница, цифры, дефис)
   * @example "astro-bot"
   */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/, {
    message: 'slug должен содержать только латиницу, цифры и дефис (2-50 символов)',
  })
  slug: string;

  /**
   * Описание сервиса (опционально)
   * @example "Telegram-бот для астрологических консультаций"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
```

**Response 201:**
```json
{
  "id": "clz1abc...",
  "name": "Astro Bot",
  "slug": "astro-bot",
  "apiKey": "sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "apiKeyLast4": "o5p6",
  "createdAt": "2026-03-10T14:30:00.000Z"
}
```

**⚠️ ВАЖНО:** Поле `apiKey` возвращается ТОЛЬКО в этом ответе. Сохранить его в безопасном месте. Повторный просмотр невозможен — только перегенерация.

**Response 409 (slug уже существует):**
```json
{
  "statusCode": 409,
  "message": "Сервис со slug 'astro-bot' уже существует",
  "error": "Conflict"
}
```

---

### 7.2.3 GET /api/admin/services

**Описание:** Список всех зарегистрированных сервисов.

**Guard:** `AdminGuard`

**Response 200:**
```json
[
  {
    "id": "clz1abc...",
    "name": "Astro Bot",
    "slug": "astro-bot",
    "apiKeyLast4": "o5p6",
    "topicId": 123,
    "isActive": true,
    "description": "Telegram-бот для астрологических консультаций",
    "createdAt": "2026-03-10T14:30:00.000Z",
    "updatedAt": "2026-03-10T14:30:00.000Z",
    "_count": {
      "errorLogs": 1542
    }
  }
]
```

---

### 7.2.4 GET /api/admin/services/:id

**Описание:** Детали конкретного сервиса.

**Guard:** `AdminGuard`

**Response 200:** Аналогично элементу из списка.

**Response 404:**
```json
{
  "statusCode": 404,
  "message": "Сервис не найден",
  "error": "Not Found"
}
```

---

### 7.2.5 PATCH /api/admin/services/:id

**Описание:** Обновление сервиса (имя, описание, активность).

**Guard:** `AdminGuard`

**Request Body:**

```typescript
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

**Response 200:** Обновлённый объект сервиса.

**Побочный эффект:** Если `isActive` изменился — инвалидация Redis-кэша API-ключа (см. §3.5.3).

---

### 7.2.6 DELETE /api/admin/services/:id

**Описание:** Удаление сервиса и всех его логов (каскадно).

**Guard:** `AdminGuard`

**Response 200:**
```json
{
  "message": "Сервис 'astro-bot' удалён"
}
```

**Побочный эффект:** Каскадное удаление всех `ErrorLog` записей. Инвалидация Redis-кэша.

---

### 7.2.7 POST /api/admin/services/:id/regenerate-key

**Описание:** Перегенерация API-ключа. Старый ключ перестаёт работать.

**Guard:** `AdminGuard`

**Response 200:**
```json
{
  "apiKey": "sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "apiKeyLast4": "l5k4"
}
```

**⚠️ ВАЖНО:** Аналогично созданию — ключ показывается один раз. Старый ключ мгновенно деактивируется (DEL Redis-кэша + update БД).

---

### 7.2.8 GET /api/admin/logs

**Описание:** Просмотр логов с фильтрами и пагинацией.

**Guard:** `AdminGuard`

**Query Parameters:**

```typescript
export class LogsQueryDto {
  /**
   * Фильтр по сервису
   */
  @IsOptional()
  @IsString()
  serviceId?: string;

  /**
   * Фильтр по уровню ошибки
   */
  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  /**
   * Начало периода
   * @example "2026-03-01T00:00:00.000Z"
   */
  @IsOptional()
  @IsDateString()
  from?: string;

  /**
   * Конец периода
   * @example "2026-03-10T23:59:59.999Z"
   */
  @IsOptional()
  @IsDateString()
  to?: string;

  /**
   * Поиск по тексту сообщения (ILIKE)
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Номер страницы (начинается с 1)
   * @default 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * Размер страницы
   * @default 50
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}
```

**Response 200:**
```json
{
  "data": [
    {
      "id": "clz2def...",
      "serviceId": "clz1abc...",
      "level": "ERROR",
      "message": "Cannot connect to DB",
      "stackTrace": "Error: ...",
      "metadata": { "userId": "usr_123" },
      "fingerprint": "a3f8c1d2...",
      "telegramSent": true,
      "createdAt": "2026-03-10T14:32:05.000Z",
      "service": {
        "name": "Astro Bot",
        "slug": "astro-bot"
      }
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 1542,
    "totalPages": 31
  }
}
```

**Реализация пагинации в сервисе:**
```typescript
async findLogs(query: LogsQueryDto): Promise<PaginatedResult<ErrorLog>> {
  const where: Prisma.ErrorLogWhereInput = {};

  if (query.serviceId) where.serviceId = query.serviceId;
  if (query.level) where.level = query.level;
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
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

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
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
```

---

### 7.2.9 GET /api/admin/stats (бонусный, опциональный)

**Описание:** Статистика по логам.

**Guard:** `AdminGuard`

**Response 200:**
```json
{
  "totalLogs": 15420,
  "totalServices": 5,
  "activeServices": 4,
  "logsByLevel": {
    "ERROR": 12000,
    "WARN": 2500,
    "FATAL": 120,
    "INFO": 800
  },
  "logsLast24h": 342,
  "topServices": [
    { "slug": "astro-bot", "count": 8000 },
    { "slug": "payment-api", "count": 4000 }
  ]
}
```

## 7.3 AdminController (admin/admin.controller.ts)

```typescript
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminGuard } from '@shared/guards/admin.guard';
import { AdminAuthService } from './admin-auth.service';
import { ServicesService } from '@core/services/services.service';
import { LoginDto } from './dto/login.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { LogsQueryDto } from './dto/logs-query.dto';

@ApiTags('Админ')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly services: ServicesService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Логин администратора' })
  login(@Body() dto: LoginDto) {
    return this.adminAuth.login(dto.login, dto.password);
  }

  @Post('services')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Регистрация нового сервиса' })
  @ApiResponse({ status: 201, description: 'Сервис создан, API-ключ в ответе' })
  createService(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Get('services')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Список всех сервисов' })
  findAllServices() {
    return this.services.findAll();
  }

  @Get('services/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Детали сервиса' })
  findOneService(@Param('id') id: string) {
    return this.services.findById(id);
  }

  @Patch('services/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обновление сервиса' })
  updateService(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(id, dto);
  }

  @Delete('services/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удаление сервиса (каскадно с логами)' })
  removeService(@Param('id') id: string) {
    return this.services.remove(id);
  }

  @Post('services/:id/regenerate-key')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Перегенерация API-ключа' })
  regenerateKey(@Param('id') id: string) {
    return this.services.regenerateKey(id);
  }

  @Get('logs')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Просмотр логов с фильтрами' })
  findLogs(@Query() query: LogsQueryDto) {
    return this.services.findLogs(query);
  }
}
```

## 7.4 AdminModule (admin/admin.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { ServicesModule } from '@core/services/services.module';

@Module({
  imports: [ServicesModule],
  controllers: [AdminController],
  providers: [AdminAuthService],
  exports: [AdminAuthService], // Для AdminGuard
})
export class AdminModule {}
```

**ВАЖНО:** `AdminAuthService` экспортируется — нужен для `AdminGuard`, который может использоваться в других модулях. Альтернатива: сделать `AdminGuard` частью `AdminModule` и экспортировать.
