import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';

/**
 * Контроллер проверки здоровья сервиса.
 * Проверяет подключение к PostgreSQL и Redis.
 */
@ApiTags('Здоровье')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Проверяет здоровье сервиса: подключение к PostgreSQL и Redis.
   * Всегда возвращает HTTP 200. Статус `healthy` или `degraded` в теле ответа.
   */
  @Get()
  @ApiOperation({ summary: 'Проверка здоровья сервиса' })
  @ApiResponse({ status: 200, description: 'Статус здоровья сервиса' })
  async check(): Promise<{ status: string; services: Record<string, string> }> {
    const services: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database = 'ok';
    } catch {
      services.database = 'error';
    }

    try {
      await this.redis.ping();
      services.redis = 'ok';
    } catch {
      services.redis = 'error';
    }

    const allOk = Object.values(services).every((s) => s === 'ok');

    return { status: allOk ? 'healthy' : 'degraded', services };
  }
}
