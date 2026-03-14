import { Module } from '@nestjs/common';
import { DedupService } from './dedup.service';
import { DedupFlushService } from './dedup-flush.service';
import { TelegramModule } from '@core/telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [DedupService, DedupFlushService],
  exports: [DedupService],
})
export class DedupModule {}
