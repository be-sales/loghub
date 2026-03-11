import * as Joi from 'joi';

/** Joi-схема валидации переменных окружения */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  // Telegram — проверка формата токена и chat ID
  TELEGRAM_BOT_TOKEN: Joi.string()
    .pattern(/^\d+:[A-Za-z0-9_-]{30,}$/)
    .required()
    .messages({
      'string.pattern.base': 'TELEGRAM_BOT_TOKEN должен иметь формат {bot_id}:{token}',
    }),
  TELEGRAM_FORUM_CHAT_ID: Joi.string()
    .pattern(/^-?\d+$/)
    .required()
    .messages({
      'string.pattern.base': 'TELEGRAM_FORUM_CHAT_ID должен быть числом (отрицательным для групп)',
    }),

  // Admin — минимум пароля увеличен до 12 символов
  ADMIN_LOGIN: Joi.string().min(3).required(),
  ADMIN_PASSWORD: Joi.string().min(12).required(),
  ADMIN_JWT_SECRET: Joi.string().min(32).required(),

  // CORS — обязателен, без fallback на '*'
  CORS_ORIGIN: Joi.string().required(),

  // HMAC — секрет для хеширования API-ключей (min 32 символа)
  HMAC_SECRET: Joi.string().min(32).required(),

  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
});
