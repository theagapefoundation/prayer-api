import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    if (request['user'] == null) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
