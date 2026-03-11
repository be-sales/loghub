import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '@config/config.module';
import { PrismaModule } from '@prisma/prisma.module';
import { RedisModule } from '@redis/redis.module';
import { AdminModule } from '@admin/admin.module';
import { LOGIN_THROTTLE_LIMIT, LOGIN_THROTTLE_TTL_SECONDS } from '@shared/constants';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: LOGIN_THROTTLE_TTL_SECONDS * 1000,
        limit: LOGIN_THROTTLE_LIMIT,
      },
    ]),
    AdminModule,
  ],
  controllers: [],
})
export class AppModule {}
