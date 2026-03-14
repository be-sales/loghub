import {
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { DedupService } from '@core/dedup/dedup.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { computeFingerprint } from '@shared/utils/fingerprint.util';
import { MAX_METADATA_SIZE_BYTES } from '@shared/constants';
import { IngestLogDto } from './dto/ingest-log.dto';
import { IngestResponseDto } from './dto/ingest-response.dto';

/**
 * Сервис-оркестратор приёма логов.
 *
 * Поток:
 * 1. Валидация metadata size
 * 2. Вычисление fingerprint
 * 3. Сохранение в БД (всегда, telegramSent=false)
 * 4. Проверка дедупликации (Redis) — после persist, чтобы передать logId
 * 5. Отправка в Telegram (fire-and-forget, только если не дубликат)
 *    → после успешной отправки telegramSent обновляется до true
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dedup: DedupService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Принимает лог ошибки от внешнего сервиса.
   *
   * @param serviceId — идентификатор сервиса (из ApiKeyGuard)
   * @param dto — валидированные данные лога
   * @returns id лога, fingerprint и флаг дедупликации
   * @throws PayloadTooLargeException если metadata > MAX_METADATA_SIZE_BYTES
   */
  async ingest(
    serviceId: string,
    dto: IngestLogDto,
  ): Promise<IngestResponseDto> {
    // 0. Валидация размера metadata
    this.validateMetadataSize(dto.metadata);

    // 1. Fingerprint
    const fingerprint = computeFingerprint(
      serviceId,
      dto.level,
      dto.message,
      dto.stackTrace,
    );

    // 2. Persist (ВСЕГДА, даже дубликаты). telegramSent обновляется позже — после реальной отправки.
    const log = await this.prisma.errorLog.create({
      data: {
        serviceId,
        level: dto.level,
        message: dto.message,
        stackTrace: dto.stackTrace ?? null,
        ...(dto.metadata && {
          metadata:
            dto.metadata as unknown as Prisma.InputJsonValue,
        }),
        fingerprint,
        telegramSent: false,
      },
    });

    // 3. Dedup check ПОСЛЕ persist — чтобы передать реальный logId для firstLogId в Redis
    const isDuplicate = await this.dedup.checkAndMark(
      fingerprint,
      serviceId,
      log.id,
    );

    // 4. Telegram (fire-and-forget, только если не дубликат)
    if (!isDuplicate) {
      this.publishToTelegram(serviceId, log.id, dto, fingerprint).catch(
        (error) => {
          this.logger.error(
            `Не удалось отправить в Telegram: serviceId=${serviceId}, logId=${log.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      );
    }

    return {
      id: log.id,
      fingerprint,
      deduplicated: isDuplicate,
    };
  }

  /**
   * Отправка лога в Telegram (отдельный метод для fire-and-forget).
   * Обновляет telegramSent=true только после подтверждённой отправки.
   */
  private async publishToTelegram(
    serviceId: string,
    logId: string,
    dto: IngestLogDto,
    fingerprint: string,
  ): Promise<void> {
    await this.telegram.sendErrorLog(serviceId, {
      logId,
      level: dto.level,
      message: dto.message,
      stackTrace: dto.stackTrace,
      metadata: dto.metadata,
      fingerprint,
    });

    // Флаг выставляется только после успешной доставки
    await this.prisma.errorLog.update({
      where: { id: logId },
      data: { telegramSent: true },
    });
  }

  /**
   * Проверяет размер metadata (JSON в байтах).
   * @throws PayloadTooLargeException если превышен лимит
   */
  private validateMetadataSize(
    metadata?: Record<string, unknown>,
  ): void {
    if (!metadata) return;

    const size = Buffer.byteLength(JSON.stringify(metadata), 'utf8');

    if (size > MAX_METADATA_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        `Metadata превышает лимит ${MAX_METADATA_SIZE_BYTES} байт (получено: ${size})`,
      );
    }
  }
}
