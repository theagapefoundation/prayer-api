import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from 'prisma/generated/types';

@Injectable()
export class KyselyService extends Kysely<DB> {
  constructor(private configService: ConfigService) {
    super({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString:
            process.env.JEST_WORKER_ID == null
              ? configService.getOrThrow('DATABASE_URL')
              : '',
        }),
      }),
    });
  }
}
