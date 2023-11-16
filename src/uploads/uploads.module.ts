import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { StorageModule } from 'src/storage/storage.module';
import { KyselyModule } from 'src/kysely/kysely.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule, KyselyModule, StorageModule],
  providers: [UploadsService],
  controllers: [UploadsController],
})
export class UploadsModule {}
