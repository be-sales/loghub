import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  REDIS_MAX_RETRIES_PER_REQUEST,
  REDIS_RETRY_DELAY_STEP_MS,
  REDIS_MAX_RETRY_DELAY_MS,
} from '@shared/constants';

/**
 * Сервис для работы с Redis.
 * Наследует ioredis Redis и управляет жизненным циклом подключения.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    super(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
      retryStrategy: (times: number): number =>
        Math.min(times * REDIS_RETRY_DELAY_STEP_MS, REDIS_MAX_RETRY_DELAY_MS),
    });

    this.on('connect', () => {
      this.logger.log('Подключение к Redis установлено');
    });

    this.on('reconnecting', () => {
      this.logger.warn('Переподключение к Redis...');
    });

    this.on('error', (error: Error) => {
      this.logger.error('Ошибка Redis', error);
    });
  }

  /** Корректное закрытие подключения при уничтожении модуля */
  async onModuleDestroy(): Promise<void> {
    await this.quit();
    this.logger.log('Подключение к Redis закрыто');
  }
}
