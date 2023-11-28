import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export const Timezone = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const offset = parseInt(request.headers['x-timezone-offset'], 10);
  return offset || null;
});
