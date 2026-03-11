import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Глобальный модуль Redis.
 * Предоставляет RedisService всем модулям приложения без явного импорта.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
