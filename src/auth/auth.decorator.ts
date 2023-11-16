import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export type UserEntity = {
  iss: 'https://securetoken.google.com/prayer-404014';
  aud: 'prayer-404014';
  auth_time: number;
  user_id: string;
  sub: string;
  iat: number;
  exp: number;
  email: string;
  email_verified: boolean;
  firebase: { [key: string]: any };
};

export const User = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request?.user ?? null;
});
