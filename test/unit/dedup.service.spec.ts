import { Test, TestingModule } from '@nestjs/testing';
import { DedupService } from '@core/dedup/dedup.service';
import { RedisService } from '@redis/redis.service';
import { createRedisMock } from '../utils/redis-mock';
import {
  DEDUP_REDIS_PREFIX,
  DEDUP_WINDOW_SECONDS,
} from '@shared/constants';

describe('DedupService', () => {
  let service: DedupService;
  let redisMock: ReturnType<typeof createRedisMock>;

  const fingerprint = 'a'.repeat(64);
  const serviceId = 'svc_123';
  const logId = 'log_456';
  const key = `${DEDUP_REDIS_PREFIX}${fingerprint}`;

  beforeEach(async () => {
    redisMock = createRedisMock();
    redisMock.eval.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DedupService,
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<DedupService>(DedupService);
  });

  // ─── 1. Первый вызов checkAndMark → false ─────────────────────────────────

  it('должен вернуть false при первом вхождении fingerprint', async () => {
    redisMock.set.mockResolvedValue('OK');

    const result = await service.checkAndMark(fingerprint, serviceId, logId);

    expect(result).toBe(false);
  });

  // ─── 2. Повторный fingerprint → true ──────────────────────────────────────

  it('должен вернуть true при дубликате fingerprint', async () => {
    redisMock.set.mockResolvedValue(null);

    const result = await service.checkAndMark(fingerprint, serviceId, logId);

    expect(result).toBe(true);
  });

  // ─── 3. SET NX с правильными параметрами ──────────────────────────────────

  it('должен вызвать SET с EX, NX и правильными параметрами', async () => {
    redisMock.set.mockResolvedValue('OK');

    await service.checkAndMark(fingerprint, serviceId, logId);

    expect(redisMock.set).toHaveBeenCalledWith(
      key,
      expect.any(String),
      'EX',
      DEDUP_WINDOW_SECONDS,
      'NX',
    );

    const storedValue = JSON.parse(
      redisMock.set.mock.calls[0][1] as string,
    );
    expect(storedValue).toEqual({
      count: 1,
      serviceId,
      firstLogId: logId,
    });
  });

  // ─── 4. Lua eval при дубликате ────────────────────────────────────────────

  it('должен вызвать Lua eval для инкремента при дубликате', async () => {
    redisMock.set.mockResolvedValue(null);

    await service.checkAndMark(fingerprint, serviceId);

    expect(redisMock.eval).toHaveBeenCalledWith(
      expect.stringContaining('data.count = data.count + 1'),
      1,
      key,
    );
  });

  // ─── 5. getActiveEntries: только count > 1 ───────────────────────────────

  it('должен вернуть только записи с count > 1', async () => {
    const key1 = `${DEDUP_REDIS_PREFIX}fp1`;
    const key2 = `${DEDUP_REDIS_PREFIX}fp2`;

    redisMock.scan.mockResolvedValue(['0', [key1, key2]]);
    redisMock.ttl
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);
    redisMock.get
      .mockResolvedValueOnce(
        JSON.stringify({ count: 3, serviceId: 'svc1', firstLogId: 'l1' }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ count: 1, serviceId: 'svc2', firstLogId: 'l2' }),
      );

    const entries = await service.getActiveEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].fingerprint).toBe('fp1');
    expect(entries[0].value.count).toBe(3);
  });

  // ─── 6. clearEntry удаляет ключ ───────────────────────────────────────────

  it('должен вызвать redis.del с правильным ключом', async () => {
    redisMock.del.mockResolvedValue(1);

    await service.clearEntry(fingerprint);

    expect(redisMock.del).toHaveBeenCalledWith(key);
  });

  // ─── 7. Redis недоступен → false + logger.error ──────────────────────────

  it('должен вернуть false и залогировать ошибку при недоступности Redis', async () => {
    redisMock.set.mockRejectedValue(new Error('Connection refused'));
    const loggerSpy = jest.spyOn(
      service['logger'],
      'error',
    );

    const result = await service.checkAndMark(fingerprint, serviceId);

    expect(result).toBe(false);
    expect(loggerSpy).toHaveBeenCalledWith(
      'Redis недоступен для дедупликации, пропускаем',
      expect.stringContaining('Connection refused'),
    );
  });

  // ─── 8. getActiveEntries пропускает TTL > threshold ───────────────────────

  it('должен пропускать записи с TTL > порога', async () => {
    const highTtlKey = `${DEDUP_REDIS_PREFIX}fp_high`;
    redisMock.scan.mockResolvedValue(['0', [highTtlKey]]);
    redisMock.ttl.mockResolvedValue(50);

    const entries = await service.getActiveEntries();

    expect(entries).toHaveLength(0);
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  // ─── 9. getActiveEntries пропускает TTL < 0 ──────────────────────────────

  it('должен пропускать записи с TTL < 0 (нет TTL или ключ удалён)', async () => {
    const noTtlKey = `${DEDUP_REDIS_PREFIX}fp_no_ttl`;
    redisMock.scan.mockResolvedValue(['0', [noTtlKey]]);
    redisMock.ttl.mockResolvedValue(-1);

    const entries = await service.getActiveEntries();

    expect(entries).toHaveLength(0);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});
