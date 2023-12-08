import { Module } from '@nestjs/common';
import { KyselyModule } from 'src/kysely/kysely.module';
import { AuthModule } from 'src/auth/auth.module';
import { BiblesService } from './bibles.service';
import { BiblesController } from './bibles.controller';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from 'src/storage/storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    KyselyModule,
    AuthModule,
    StorageModule,
    ConfigModule,
    NotificationsModule,
  ],
  controllers: [BiblesController],
  providers: [BiblesService],
})
export class BiblesModule {}
