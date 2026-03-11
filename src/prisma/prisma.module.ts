import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Глобальный модуль Prisma.
 * Предоставляет PrismaService всем модулям приложения без явного импорта.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
