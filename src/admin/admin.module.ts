import { Module } from '@nestjs/common';
import { ServicesModule } from '@core/services/services.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from '@shared/guards/admin.guard';

@Module({
  imports: [ServicesModule],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminGuard],
  exports: [AdminAuthService],
})
export class AdminModule {}
