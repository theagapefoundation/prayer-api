import { Module } from '@nestjs/common';
import { KyselyModule } from 'src/kysely/kysely.module';
import { AuthModule } from 'src/auth/auth.module';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from 'src/storage/storage.module';
import { GroupController } from './group.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    KyselyModule,
    AuthModule,
    StorageModule,
    ConfigModule,
    NotificationsModule,
  ],
  controllers: [GroupsController, GroupController],
  providers: [GroupsService],
})
export class GroupsModule {}
