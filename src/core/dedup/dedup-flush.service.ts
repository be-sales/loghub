import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DedupService } from './dedup.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { PrismaService } from '@prisma/prisma.service';
import { DEDUP_WINDOW_SECONDS } from '@shared/constants';

@Injectable()
export class DedupFlushService {
  private readonly logger = new Logger(DedupFlushService.name);
  private isRunning = false;

  constructor(
    private readonly dedup: DedupService,
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Каждые 10 секунд проверяет записи дедупликации с count > 1
   * и TTL ≤ порога (near-expiry) — отправляет summary в Telegram.
   *
   * isRunning guard предотвращает параллельный запуск
   * если предыдущий flush ещё не завершился.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async flush(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const entries = await this.dedup.getActiveEntries();

      for (const entry of entries) {
        const { fingerprint, value } = entry;
        const repeatCount = value.count - 1;

        if (repeatCount <= 0) continue;

        try {
          const lastLog = await this.prisma.errorLog.findFirst({
            where: { fingerprint },
            orderBy: { createdAt: 'desc' },
            select: {
              message: true,
              level: true,
              serviceId: true,
              fingerprint: true,
            },
          });

          if (!lastLog) continue;

          await this.telegram.sendDedupSummary(lastLog.serviceId, {
            level: lastLog.level,
            message: lastLog.message,
            repeatCount,
            windowSeconds: DEDUP_WINDOW_SECONDS,
            fingerprint: lastLog.fingerprint,
          });

          await this.dedup.clearEntry(fingerprint);
        } catch (error) {
          this.logger.error(
            `Ошибка flush для fingerprint=${fingerprint.slice(0, 16)}...`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
