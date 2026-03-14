import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppConfigModule } from '@config/config.module';
import { PrismaModule } from '@prisma/prisma.module';
import { RedisModule } from '@redis/redis.module';
import { AdminModule } from '@admin/admin.module';
import { DedupModule } from '@core/dedup/dedup.module';
import { IngestionModule } from '@core/ingestion/ingestion.module';
import {
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_SECONDS,
} from '@shared/constants';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    // Глобальный дефолт: 1000 req/min — базовая DoS-защита.
    // Чувствительные endpoints переопределяют лимиты через @Throttle().
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: DEFAULT_THROTTLE_TTL_SECONDS * 1000,
        limit: DEFAULT_THROTTLE_LIMIT,
      },
    ]),
    AdminModule,
    DedupModule,
    IngestionModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerGuard применяется глобально ко всем routes.
    // @Throttle() на конкретном endpoint переопределяет эти лимиты.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
