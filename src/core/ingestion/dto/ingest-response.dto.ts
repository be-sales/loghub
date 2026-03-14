import { ApiProperty } from '@nestjs/swagger';
import { IngestResponse } from '@shared/interfaces/log-entry.interface';

/**
 * DTO ответа на запрос приёма лога.
 */
export class IngestResponseDto implements IngestResponse {
  @ApiProperty({
    description: 'Идентификатор созданного лога',
    example: 'clxyz123abc',
  })
  id!: string;

  @ApiProperty({
    description: 'SHA-256 fingerprint ошибки',
    example: 'a1b2c3d4e5f6...',
  })
  fingerprint!: string;

  @ApiProperty({
    description: 'Был ли лог дедуплицирован (true = дубликат)',
    example: false,
  })
  deduplicated!: boolean;
}
