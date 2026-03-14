import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LogLevel } from '@shared/enums/log-level.enum';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/constants';

/**
 * DTO для запроса логов с фильтрами и пагинацией.
 */
export class LogsQueryDto {
  @ApiPropertyOptional({
    description: 'Идентификатор сервиса для фильтрации',
    example: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Уровень ошибки',
    enum: LogLevel,
    example: LogLevel.ERROR,
  })
  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  @ApiPropertyOptional({
    description: 'Начало временного диапазона (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Конец временного диапазона (ISO 8601)',
    example: '2026-03-14T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Поиск по тексту ошибки (case-insensitive)',
    example: 'TypeError',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    description: 'Номер страницы (начинается с 1)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Размер страницы',
    example: DEFAULT_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}
