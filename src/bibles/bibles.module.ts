import { Module } from '@nestjs/common';
import { KyselyModule } from 'src/kysely/kysely.module';
import { BiblesService } from './bibles.service';
import { BiblesController } from './bibles.controller';

@Module({
  imports: [KyselyModule],
  controllers: [BiblesController],
  providers: [BiblesService],
})
export class BiblesModule {}
