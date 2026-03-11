import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { ServiceContext } from '@shared/interfaces/service-context.interface';

export const CurrentService = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ServiceContext => {
    const request = ctx.switchToHttp().getRequest<{ serviceContext?: ServiceContext }>();

    if (!request.serviceContext) {
      throw new InternalServerErrorException(
        'ServiceContext не установлен — убедитесь, что ApiKeyGuard применён к маршруту',
      );
    }

    return request.serviceContext;
  },
);
