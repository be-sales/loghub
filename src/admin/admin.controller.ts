import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { AdminAuthService } from './admin-auth.service';
import {
  ServicesService,
  CreateServiceResult,
  ServiceListItem,
  UpdateServiceResult,
  RegenerateKeyResult,
  ErrorLogWithService,
} from '@core/services/services.service';
import { LoginDto } from './dto/login.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { LogsQueryDto } from './dto/logs-query.dto';
import { AdminGuard } from '@shared/guards/admin.guard';
import { PaginatedResult } from '@shared/interfaces/paginated-result.interface';
import {
  ADMIN_MUTATION_THROTTLE_LIMIT,
  ADMIN_MUTATION_THROTTLE_TTL_SECONDS,
  COOKIE_MAX_AGE_SECONDS,
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_SECONDS,
} from '@shared/constants';

@ApiTags('Администрирование')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly servicesService: ServicesService,
    private readonly config: ConfigService,
  ) {}

  // ─── Аутентификация ──────────────────────────────────────────────────────────

  /**
   * Вход администратора. JWT устанавливается в HttpOnly Secure cookie.
   */
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiOperation({ summary: 'Вход администратора' })
  @ApiResponse({ status: 204, description: 'Успешный вход (токен установлен в cookie)' })
  @ApiResponse({ status: 401, description: 'Неверные учётные данные' })
  @ApiResponse({ status: 429, description: 'Превышен лимит попыток входа' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const { accessToken } = await this.adminAuth.login(dto.login, dto.password);

    void reply.setCookie('access_token', accessToken, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/admin',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  /**
   * Выход администратора. Очищает cookie с токеном.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Выход администратора' })
  @ApiResponse({ status: 204, description: 'Успешный выход' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async logout(@Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    void reply.clearCookie('access_token', {
      path: '/api/admin',
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
    });
  }

  // ─── Управление сервисами ────────────────────────────────────────────────────

  /**
   * Создаёт новый сервис. API-ключ возвращается один раз.
   */
  @Post('services')
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: ADMIN_MUTATION_THROTTLE_LIMIT, ttl: ADMIN_MUTATION_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать новый сервис' })
  @ApiResponse({ status: 201, description: 'Сервис создан (API-ключ в ответе)' })
  @ApiResponse({ status: 400, description: 'Невалидные данные' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 409, description: 'Сервис с таким slug уже существует' })
  async createService(@Body() dto: CreateServiceDto): Promise<CreateServiceResult> {
    return this.servicesService.create(dto);
  }

  /**
   * Возвращает список всех сервисов с количеством логов.
   */
  @Get('services')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить список сервисов' })
  @ApiResponse({ status: 200, description: 'Список сервисов' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async findAllServices(): Promise<ServiceListItem[]> {
    return this.servicesService.findAll();
  }

  /**
   * Возвращает сервис по идентификатору.
   */
  @Get('services/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить сервис по ID' })
  @ApiParam({ name: 'id', description: 'Идентификатор сервиса' })
  @ApiResponse({ status: 200, description: 'Данные сервиса' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 404, description: 'Сервис не найден' })
  async findServiceById(@Param('id') id: string): Promise<ServiceListItem> {
    return this.servicesService.findById(id);
  }

  /**
   * Обновляет сервис. Обновляются только переданные поля.
   */
  @Patch('services/:id')
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: ADMIN_MUTATION_THROTTLE_LIMIT, ttl: ADMIN_MUTATION_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обновить сервис' })
  @ApiParam({ name: 'id', description: 'Идентификатор сервиса' })
  @ApiResponse({ status: 200, description: 'Сервис обновлён' })
  @ApiResponse({ status: 400, description: 'Невалидные данные' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 404, description: 'Сервис не найден' })
  async updateService(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<UpdateServiceResult> {
    return this.servicesService.update(id, dto);
  }

  /**
   * Удаляет сервис и все его логи (каскадно).
   */
  @Delete('services/:id')
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: ADMIN_MUTATION_THROTTLE_LIMIT, ttl: ADMIN_MUTATION_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить сервис' })
  @ApiParam({ name: 'id', description: 'Идентификатор сервиса' })
  @ApiResponse({ status: 200, description: 'Сервис удалён' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 404, description: 'Сервис не найден' })
  async removeService(@Param('id') id: string): Promise<{ message: string }> {
    return this.servicesService.remove(id);
  }

  /**
   * Перегенерирует API-ключ сервиса. Старый ключ перестаёт работать.
   * Новый ключ возвращается один раз.
   */
  @Post('services/:id/regenerate-key')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: ADMIN_MUTATION_THROTTLE_LIMIT, ttl: ADMIN_MUTATION_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Перегенерировать API-ключ сервиса' })
  @ApiParam({ name: 'id', description: 'Идентификатор сервиса' })
  @ApiResponse({ status: 200, description: 'Новый API-ключ (показывается один раз)' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 404, description: 'Сервис не найден' })
  async regenerateKey(@Param('id') id: string): Promise<RegenerateKeyResult> {
    return this.servicesService.regenerateKey(id);
  }

  // ─── Логи ────────────────────────────────────────────────────────────────────

  /**
   * Возвращает логи с фильтрами и пагинацией.
   */
  @Get('logs')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить логи с фильтрами' })
  @ApiResponse({ status: 200, description: 'Список логов с пагинацией' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async findLogs(@Query() query: LogsQueryDto): Promise<PaginatedResult<ErrorLogWithService>> {
    return this.servicesService.findLogs(query);
  }
}
