/**
 * Контекст авторизованного сервиса.
 * Устанавливается в request через ApiKeyGuard после валидации X-API-Key.
 */
export interface ServiceContext {
  /** Идентификатор сервиса (CUID) */
  serviceId: string;
  /** Slug сервиса (kebab-case) */
  slug: string;
}
