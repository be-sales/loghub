import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LogLevel } from '@shared/enums/log-level.enum';
import {
  MAX_MESSAGE_LENGTH,
  MAX_STACK_TRACE_LENGTH,
} from '@shared/constants';

/**
 * DTO для приёма лога ошибки от внешнего сервиса.
 */
export class IngestLogDto {
  @ApiProperty({
    description: 'Уровень ошибки',
    enum: LogLevel,
    example: LogLevel.ERROR,
  })
  @IsEnum(LogLevel)
  level!: LogLevel;

  @ApiProperty({
    description: 'Текст ошибки',
    example: "Cannot read properties of undefined (reading 'id')",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  message!: string;

  @ApiPropertyOptional({
    description: 'Stack trace',
    example: 'TypeError: ...\n    at UserService.findById (...)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_STACK_TRACE_LENGTH)
  stackTrace?: string;

  @ApiPropertyOptional({
    description: 'Произвольные метаданные для контекста ошибки',
    example: {
      userId: 'usr_123',
      requestId: 'req_456',
      url: '/api/users/123',
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
