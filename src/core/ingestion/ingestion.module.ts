import { Module } from '@nestjs/common';
import { DedupModule } from '@core/dedup/dedup.module';
import { TelegramModule } from '@core/telegram/telegram.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [DedupModule, TelegramModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
