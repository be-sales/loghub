import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../src/health.controller';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from '@redis/redis.service';

// ─── Моки ──────────────────────────────────────────────────────────────────

function createHealthPrismaMock() {
  return { $queryRaw: jest.fn() };
}

function createHealthRedisMock() {
  return { ping: jest.fn() };
}

// ─── Тесты ─────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  let controller: HealthController;
  let prismaMock: ReturnType<typeof createHealthPrismaMock>;
  let redisMock: ReturnType<typeof createHealthRedisMock>;

  beforeEach(async () => {
    prismaMock = createHealthPrismaMock();
    redisMock = createHealthRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('должен вернуть healthy когда PostgreSQL и Redis доступны', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redisMock.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result).toEqual({
      status: 'healthy',
      services: { database: 'ok', redis: 'ok' },
    });
  });

  it('должен вернуть degraded когда PostgreSQL недоступен', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('Connection refused'));
    redisMock.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result).toEqual({
      status: 'degraded',
      services: { database: 'error', redis: 'ok' },
    });
  });

  it('должен вернуть degraded когда Redis недоступен', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redisMock.ping.mockRejectedValue(new Error('Connection refused'));

    const result = await controller.check();

    expect(result).toEqual({
      status: 'degraded',
      services: { database: 'ok', redis: 'error' },
    });
  });

  it('должен вернуть degraded когда оба сервиса недоступны', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('PG down'));
    redisMock.ping.mockRejectedValue(new Error('Redis down'));

    const result = await controller.check();

    expect(result).toEqual({
      status: 'degraded',
      services: { database: 'error', redis: 'error' },
    });
  });
});
