import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { ADMIN_JWT_EXPIRY, BCRYPT_ROUNDS } from '@shared/constants';

export interface AdminJwtPayload {
  sub: string;
  role: 'admin';
  jti: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly adminLogin: string;
  private readonly adminLoginHash: Buffer;
  private readonly adminPasswordHash: string;
  private readonly jwtSecret: string;

  constructor(private readonly config: ConfigService) {
    this.adminLogin = this.config.getOrThrow<string>('ADMIN_LOGIN');
    this.jwtSecret = this.config.getOrThrow<string>('ADMIN_JWT_SECRET');

    // Хешируем логин через SHA-256 для constant-time сравнения (одинаковая длина буфера)
    this.adminLoginHash = createHash('sha256').update(this.adminLogin).digest();

    // Хешируем пароль bcrypt при старте — plain text не остаётся в памяти
    const password = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    this.adminPasswordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  }

  /**
   * Логин администратора.
   * - Логин: constant-time сравнение через timingSafeEqual (SHA-256 хеши одинаковой длины)
   * - Пароль: bcrypt.compare — timing-safe по дизайну, защищён от rainbow tables
   * @returns JWT access token
   * @throws UnauthorizedException при неверных учётных данных
   */
  async login(login: string, password: string): Promise<{ accessToken: string }> {
    // Хешируем входной логин → одинаковая длина буфера гарантирована (32 байта SHA-256)
    const inputLoginHash = createHash('sha256').update(login).digest();
    const loginMatches = timingSafeEqual(inputLoginHash, this.adminLoginHash);

    // bcrypt.compare — уже timing-safe, защищён от GPU brute-force
    const passwordMatches = await bcrypt.compare(password, this.adminPasswordHash);

    if (!loginMatches || !passwordMatches) {
      this.logger.warn(`Неудачная попытка входа: login="${login.substring(0, 50)}"`);
      throw new UnauthorizedException('Неверные учётные данные');
    }

    const payload: AdminJwtPayload = {
      sub: login,
      role: 'admin',
      jti: randomUUID(), // Уникальный ID токена — подготовка к token revocation
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: ADMIN_JWT_EXPIRY,
    });

    return { accessToken };
  }

  /**
   * Верифицирует JWT токен.
   * @returns payload токена
   * @throws UnauthorizedException при невалидном или истёкшем токене
   */
  verifyToken(token: string): AdminJwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as AdminJwtPayload;
    } catch {
      throw new UnauthorizedException('Невалидный или истёкший токен');
    }
  }
}
