import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AdminAuthService } from '@admin/admin-auth.service';

// Мокаем bcrypt для быстрых тестов (без вычислительно дорогого хеширования)
jest.mock('bcrypt', () => ({
  hashSync: (password: string) => `bcrypt_hash:${password}`,
  compare: async (plain: string, hashed: string) =>
    Promise.resolve(hashed === `bcrypt_hash:${plain}`),
}));

const TEST_LOGIN = 'admin';
const TEST_PASSWORD = 'secret123password';
const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';

function createConfigMock(): ConfigService {
  const values: Record<string, string> = {
    ADMIN_LOGIN: TEST_LOGIN,
    ADMIN_PASSWORD: TEST_PASSWORD,
    ADMIN_JWT_SECRET: TEST_JWT_SECRET,
  };

  return {
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (!value) throw new Error(`Missing env: ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

describe('AdminAuthService', () => {
  let service: AdminAuthService;

  beforeEach(() => {
    service = new AdminAuthService(createConfigMock());
  });

  it('должен вернуть accessToken при правильных credentials', async () => {
    const result = await service.login(TEST_LOGIN, TEST_PASSWORD);

    expect(result).toHaveProperty('accessToken');
    expect(typeof result.accessToken).toBe('string');
    expect(result.accessToken.length).toBeGreaterThan(0);
  });

  it('должен бросить UnauthorizedException при неверном пароле', async () => {
    await expect(service.login(TEST_LOGIN, 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.login(TEST_LOGIN, 'wrong-password')).rejects.toThrow(
      'Неверные учётные данные',
    );
  });

  it('должен бросить UnauthorizedException при неверном логине', async () => {
    await expect(service.login('wrong-login', TEST_PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.login('wrong-login', TEST_PASSWORD)).rejects.toThrow(
      'Неверные учётные данные',
    );
  });

  it('должен верифицировать валидный токен и вернуть payload', async () => {
    const { accessToken } = await service.login(TEST_LOGIN, TEST_PASSWORD);
    const payload = service.verifyToken(accessToken);

    expect(payload.sub).toBe(TEST_LOGIN);
    expect(payload.role).toBe('admin');
    expect(typeof payload.jti).toBe('string');
  });

  it('должен бросить UnauthorizedException для невалидного токена', () => {
    expect(() => service.verifyToken('invalid.token.here')).toThrow(UnauthorizedException);
    expect(() => service.verifyToken('invalid.token.here')).toThrow(
      'Невалидный или истёкший токен',
    );
  });

  it('должен бросить UnauthorizedException для истёкшего токена', () => {
    const expiredToken = jwt.sign(
      { sub: TEST_LOGIN, role: 'admin', jti: 'test-jti' },
      TEST_JWT_SECRET,
      { expiresIn: '0s' },
    );

    expect(() => service.verifyToken(expiredToken)).toThrow(UnauthorizedException);
    expect(() => service.verifyToken(expiredToken)).toThrow(
      'Невалидный или истёкший токен',
    );
  });
});
