import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseService } from './firebase.service';
import { KyselyModule } from 'src/kysely/kysely.module';

@Module({
  imports: [ConfigModule, KyselyModule],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
