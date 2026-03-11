import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AdminAuthService, AdminJwtPayload } from '@admin/admin-auth.service';

type FastifyRequestWithCookies = FastifyRequest & {
  cookies?: Record<string, string>;
  adminPayload?: AdminJwtPayload;
};

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly adminAuth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequestWithCookies>();
    const token = this.extractToken(request);

    if (!token) {
      this.logger.warn('Попытка доступа к защищённому ресурсу без токена авторизации');
      throw new UnauthorizedException('Отсутствует токен авторизации');
    }

    try {
      const payload = this.adminAuth.verifyToken(token);
      // Инжектируем payload в request для использования через @CurrentAdmin декоратор
      request.adminPayload = payload;
    } catch {
      this.logger.warn('Попытка доступа с невалидным или истёкшим токеном');
      throw new UnauthorizedException('Невалидный или истёкший токен');
    }

    return true;
  }

  /**
   * Извлекает JWT токен: приоритет — HttpOnly cookie, fallback — Bearer заголовок.
   */
  private extractToken(request: FastifyRequestWithCookies): string | undefined {
    const cookieToken = request.cookies?.['access_token'];
    if (cookieToken) {
      return cookieToken;
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return undefined;
  }
}
