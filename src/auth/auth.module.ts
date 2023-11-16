import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    JwtModule.register({
      global: true,
    }),
    HttpModule,
  ],
  providers: [AuthGuard],
  controllers: [],
  exports: [HttpModule],
})
export class AuthModule {}
