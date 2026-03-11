import { ConfigService } from '@nestjs/config';
import { RedisService } from '@redis/redis.service';

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.on = jest.fn().mockReturnValue(this);
      this.quit = jest.fn().mockResolvedValue('OK');
      this.status = 'ready';
    }),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;

    service = new RedisService(configService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  it('должен получать REDIS_URL из ConfigService', () => {
    expect(configService.getOrThrow).toHaveBeenCalledWith('REDIS_URL');
  });

  it('должен регистрировать обработчики событий connect и error', () => {
    expect(service.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(service.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('должен корректно закрывать подключение при onModuleDestroy', async () => {
    await service.onModuleDestroy();
    expect(service.quit).toHaveBeenCalledTimes(1);
  });
});
