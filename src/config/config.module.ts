import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';

/**
 * Модуль конфигурации приложения.
 * Оборачивает ConfigModule.forRoot с Joi-валидацией переменных окружения.
 * configuration.ts (factory) будет добавлен при реализации сервисов.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
