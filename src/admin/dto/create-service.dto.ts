import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { SLUG_REGEX } from '@shared/constants';

/**
 * DTO для создания нового сервиса.
 */
export class CreateServiceDto {
  @ApiProperty({
    description: 'Название сервиса (отображается в Telegram топике)',
    example: 'Мой сайт',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @Length(2, 100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({
    description: 'Уникальный slug (латиница, цифры, дефис, 3-50 символов)',
    example: 'my-website',
    minLength: 3,
    maxLength: 50,
    pattern: SLUG_REGEX.source,
  })
  @IsString()
  @Matches(SLUG_REGEX, {
    message:
      'slug должен содержать только латиницу, цифры и дефис (3-50 символов)',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  slug!: string;

  @ApiPropertyOptional({
    description: 'Описание сервиса',
    example: 'Основной сайт компании',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;
}
