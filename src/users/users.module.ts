import { Module } from '@nestjs/common';
import { KyselyModule } from 'src/kysely/kysely.module';
import { AuthModule } from 'src/auth/auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [KyselyModule, AuthModule, StorageModule, ConfigModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
