import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { KyselyModule } from 'src/kysely/kysely.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [KyselyModule, StorageModule, FirebaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
