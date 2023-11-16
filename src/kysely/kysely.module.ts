import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KyselyService } from './kysely.service';

@Module({
  imports: [ConfigModule],
  providers: [KyselyService],
  exports: [KyselyService],
})
export class KyselyModule {}
