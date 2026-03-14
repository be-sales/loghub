import { Test, TestingModule } from '@nestjs/testing';
import { PayloadTooLargeException } from '@nestjs/common';
import { IngestionService } from '@core/ingestion/ingestion.service';
import { PrismaService } from '@prisma/prisma.service';
import { DedupService } from '@core/dedup/dedup.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { createPrismaMock } from '../utils/prisma-mock';
import { LogLevel } from '@shared/enums/log-level.enum';
import { MAX_METADATA_SIZE_BYTES } from '@shared/constants';
import { computeFingerprint } from '@shared/utils/fingerprint.util';

describe('IngestionService', () => {
  let service: IngestionService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let dedupMock: { checkAndMark: jest.Mock };
  let telegramMock: { sendErrorLog: jest.Mock };

  const serviceId = 'svc_test_123';

  const dto = {
    level: LogLevel.ERROR,
    message: "Cannot read properties of undefined (reading 'id')",
    stackTrace: 'TypeError: ...\n    at UserService.findById (...)',
    metadata: { userId: 'usr_123' },
  };

  const expectedFingerprint = computeFingerprint(
    serviceId,
    dto.level,
    dto.message,
    dto.stackTrace,
  );

  const mockLogId = 'log_created_456';

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    dedupMock = { checkAndMark: jest.fn() };
    telegramMock = { sendErrorLog: jest.fn() };

    prismaMock.errorLog.create.mockResolvedValue({
      id: mockLogId,
      serviceId,
      level: dto.level,
      message: dto.message,
      fingerprint: expectedFingerprint,
      telegramSent: false,
      createdAt: new Date(),
    });

    prismaMock.errorLog.update.mockResolvedValue({});
    telegramMock.sendErrorLog.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DedupService, useValue: dedupMock },
        { provide: TelegramService, useValue: telegramMock },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
  });

  // ─── 1. Нормальный flow: persist → dedup → telegram ────────────────────

  it('должен сохранить лог (telegramSent=false), затем обновить после отправки', async () => {
    dedupMock.checkAndMark.mockResolvedValue(false);

    const result = await service.ingest(serviceId, dto);

    // Prisma create с telegramSent: false (флаг ставится только после подтверждения)
    expect(prismaMock.errorLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceId,
        level: dto.level,
        message: dto.message,
        fingerprint: expectedFingerprint,
        telegramSent: false,
      }),
    });

    // Dedup вызван ПОСЛЕ persist с реальным logId
    expect(dedupMock.checkAndMark).toHaveBeenCalledWith(
      expectedFingerprint,
      serviceId,
      mockLogId,
    );

    // Дождаться fire-and-forget
    await new Promise(process.nextTick);

    // Telegram вызван
    expect(telegramMock.sendErrorLog).toHaveBeenCalledWith(
      serviceId,
      expect.objectContaining({
        logId: mockLogId,
        level: dto.level,
        message: dto.message,
        fingerprint: expectedFingerprint,
      }),
    );

    // telegramSent обновлён до true после успешной отправки
    expect(prismaMock.errorLog.update).toHaveBeenCalledWith({
      where: { id: mockLogId },
      data: { telegramSent: true },
    });

    // Ответ корректный
    expect(result).toEqual({
      id: mockLogId,
      fingerprint: expectedFingerprint,
      deduplicated: false,
    });
  });

  // ─── 2. Дедуплицированный flow: persist + checkAndMark → NO telegram ───

  it('должен сохранить лог без Telegram при дубликате', async () => {
    dedupMock.checkAndMark.mockResolvedValue(true);

    const result = await service.ingest(serviceId, dto);

    // Prisma create всегда с telegramSent: false
    expect(prismaMock.errorLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telegramSent: false,
      }),
    });

    // Dedup вызван с logId
    expect(dedupMock.checkAndMark).toHaveBeenCalledWith(
      expectedFingerprint,
      serviceId,
      mockLogId,
    );

    // Telegram НЕ вызван
    await new Promise(process.nextTick);
    expect(telegramMock.sendErrorLog).not.toHaveBeenCalled();

    // telegramSent НЕ обновлялся (дубликат не отправляется)
    expect(prismaMock.errorLog.update).not.toHaveBeenCalled();

    expect(result.deduplicated).toBe(true);
  });

  // ─── 3. Telegram ошибка → лог сохраняется, telegramSent остаётся false ─

  it('должен вернуть результат при ошибке Telegram, telegramSent остаётся false', async () => {
    dedupMock.checkAndMark.mockResolvedValue(false);
    telegramMock.sendErrorLog.mockRejectedValue(
      new Error('Telegram API timeout'),
    );

    const loggerSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.ingest(serviceId, dto);

    // Лог создан
    expect(prismaMock.errorLog.create).toHaveBeenCalled();

    // Ответ успешный (не бросает)
    expect(result.id).toBe(mockLogId);
    expect(result.deduplicated).toBe(false);

    // Дождаться fire-and-forget
    await new Promise(process.nextTick);

    // Logger.error вызван
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Не удалось отправить в Telegram'),
      expect.stringContaining('Telegram API timeout'),
    );

    // telegramSent НЕ обновлялся — Telegram не получил сообщение
    expect(prismaMock.errorLog.update).not.toHaveBeenCalled();
  });

  // ─── 4. Metadata > MAX_METADATA_SIZE_BYTES → 413 ──────────────────────

  it('должен бросить PayloadTooLargeException при metadata > лимита', async () => {
    const oversizedDto = {
      ...dto,
      metadata: { data: 'x'.repeat(MAX_METADATA_SIZE_BYTES + 1) },
    };

    await expect(
      service.ingest(serviceId, oversizedDto),
    ).rejects.toThrow(PayloadTooLargeException);

    // Dedup и Prisma НЕ вызваны (ранняя проверка)
    expect(dedupMock.checkAndMark).not.toHaveBeenCalled();
    expect(prismaMock.errorLog.create).not.toHaveBeenCalled();
  });

  // ─── 5. Корректный IngestResponseDto ───────────────────────────────────

  it('должен вернуть ответ с id, fingerprint и deduplicated', async () => {
    dedupMock.checkAndMark.mockResolvedValue(false);

    const result = await service.ingest(serviceId, dto);

    expect(typeof result.id).toBe('string');
    expect(result.fingerprint).toHaveLength(64);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof result.deduplicated).toBe('boolean');
  });
});
