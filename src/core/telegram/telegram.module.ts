import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramFormatterService } from './telegram-formatter.service';

@Module({
  providers: [TelegramService, TelegramFormatterService],
  exports: [TelegramService],
})
export class TelegramModule {}
