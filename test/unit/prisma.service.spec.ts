import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@prisma/prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    jest.spyOn(service, '$connect').mockResolvedValue();
    jest.spyOn(service, '$disconnect').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  it('должен подключаться к БД при инициализации модуля', async () => {
    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalledTimes(1);
  });

  it('должен отключаться от БД при уничтожении модуля', async () => {
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalledTimes(1);
  });
});
