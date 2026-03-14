import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
 
import { Transform } from 'class-transformer';

/**
 * DTO для обновления сервиса.
 * Все поля опциональны — обновляются только переданные.
 */
export class UpdateServiceDto {
  @ApiPropertyOptional({
    description: 'Название сервиса',
    example: 'Новое название',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({
    description: 'Описание сервиса',
    example: 'Обновлённое описание',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiPropertyOptional({
    description: 'Статус активности сервиса',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
