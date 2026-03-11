import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Сервис для работы с PostgreSQL через Prisma ORM.
 * Управляет жизненным циклом подключения к базе данных.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Подключение к БД при инициализации модуля */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Подключение к PostgreSQL установлено');
  }

  /** Отключение от БД при уничтожении модуля */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Подключение к PostgreSQL закрыто');
  }
}
