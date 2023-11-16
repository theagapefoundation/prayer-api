import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { DB } from 'kysely-codegen';
import { Pool } from 'pg';

@Injectable()
export class KyselyService extends Kysely<DB> {
  constructor(private configService: ConfigService) {
    super({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: configService.getOrThrow('DATABASE_URL'),
          ssl: {
            rejectUnauthorized: true,
            ca: configService.getOrThrow('DATABASE_CA_CERT'),
          },
        }),
      }),
    });
  }
}
