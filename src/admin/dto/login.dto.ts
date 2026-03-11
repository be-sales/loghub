import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Логин администратора' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  login!: string;

  @ApiProperty({ description: 'Пароль администратора' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
