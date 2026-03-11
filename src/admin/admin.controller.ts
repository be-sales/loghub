import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { AdminAuthService } from './admin-auth.service';
import { LoginDto } from './dto/login.dto';
import { AdminGuard } from '@shared/guards/admin.guard';
import {
  COOKIE_MAX_AGE_SECONDS,
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_SECONDS,
} from '@shared/constants';

@ApiTags('Администрирование')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  /**
   * Вход администратора. JWT устанавливается в HttpOnly Secure cookie.
   */
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_SECONDS * 1000 } })
  @ApiOperation({ summary: 'Вход администратора' })
  @ApiResponse({ status: 204, description: 'Успешный вход (токен установлен в cookie)' })
  @ApiResponse({ status: 401, description: 'Неверные учётные данные' })
  @ApiResponse({ status: 429, description: 'Превышен лимит попыток входа' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const { accessToken } = await this.adminAuth.login(dto.login, dto.password);

    void reply.setCookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/admin',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  /**
   * Выход администратора. Очищает cookie с токеном.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Выход администратора' })
  @ApiResponse({ status: 204, description: 'Успешный выход' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async logout(@Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    void reply.clearCookie('access_token', {
      path: '/api/admin',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  }
}
