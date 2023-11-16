import { HttpService } from '@nestjs/axios';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private httpService: HttpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      return true;
    }
    try {
      const jwt = this.jwtService.decode(token, { complete: true }) as {
        [key: string]: any;
      };
      const publicKey = await this.httpService.axiosRef.get<{
        [key: string]: string;
      }>(
        'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      );
      if (!(jwt?.header?.kid in publicKey.data)) {
        return true;
      }
      const payload = await this.jwtService.verifyAsync(token, {
        algorithms: ['RS256'],
        publicKey: publicKey.data[jwt.header.kid],
        issuer: 'https://securetoken.google.com/prayer-404014',
        audience: 'prayer-404014',
      });
      request['user'] = payload;
      return true;
    } catch (e) {
      return true;
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
