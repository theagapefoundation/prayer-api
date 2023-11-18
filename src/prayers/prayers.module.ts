import { Module } from '@nestjs/common';
import { KyselyModule } from 'src/kysely/kysely.module';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from 'src/storage/storage.module';
import { PrayersController } from './prayers.controller';
import { PrayersService } from './prayers.service';
import { GroupsService } from 'src/groups/groups.service';

@Module({
  imports: [KyselyModule, AuthModule, StorageModule, ConfigModule],
  controllers: [PrayersController],
  providers: [PrayersService, GroupsService],
})
export class PrayersModule {}
