import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from '@shared/guards/admin.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminAuthService, AdminGuard],
  exports: [AdminAuthService],
})
export class AdminModule {}
