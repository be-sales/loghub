import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '@shared/guards/api-key.guard';
import { CurrentService } from '@shared/decorators/current-service.decorator';
import { ServiceContext } from '@shared/interfaces/service-context.interface';
import {
  INGEST_THROTTLE_LIMIT,
  INGEST_THROTTLE_TTL_SECONDS,
} from '@shared/constants';
import { IngestionService } from './ingestion.service';
import { IngestLogDto } from './dto/ingest-log.dto';
import { IngestResponseDto } from './dto/ingest-response.dto';

/**
 * Контроллер приёма логов от внешних сервисов.
 */
@ApiTags('Логи')
@Controller('logs')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Принимает лог ошибки от внешнего сервиса.
   * Аутентификация через API-ключ в заголовке X-API-Key.
   */
  @Post('ingest')
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { limit: INGEST_THROTTLE_LIMIT, ttl: INGEST_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Приём лога ошибки от внешнего сервиса' })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API-ключ сервиса',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Лог принят',
    type: IngestResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Невалидные данные' })
  @ApiResponse({ status: 401, description: 'Неверный API-ключ' })
  @ApiResponse({ status: 413, description: 'Metadata превышает лимит размера' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов' })
  async ingest(
    @CurrentService() service: ServiceContext,
    @Body() dto: IngestLogDto,
  ): Promise<IngestResponseDto> {
    return this.ingestionService.ingest(service.serviceId, dto);
  }
}
