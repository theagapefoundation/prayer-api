import * as Sentry from '@sentry/node';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { credential, messaging } from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { KyselyService } from 'src/kysely/kysely.service';
import { DB } from 'prisma/generated/types';

function splitArrayIntoChunks(array: string[], chunkSize: number) {
  const result: string[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    result.push(chunk);
  }
  return result;
}

@Injectable()
export class FirebaseService {
  constructor(
    private configService: ConfigService,
    private dbService: KyselyService,
  ) {
    if (process.env.NODE_ENV === 'development') {
      initializeApp({
        credential: credential.cert(
          JSON.parse(configService.getOrThrow('FIREBASE_ADMIN_PRIVATE_KEY')),
        ),
      });
    } else {
      initializeApp();
    }
  }

  async send(params: {
    userId: string[];
    title?: string;
    body?: string;
    imageUrl?: string;
    data?: { [key: string]: string; type: DB['notifications']['type'] };
  }) {
    if (process.env.DISABLE_NOTIFICATION === 'true') {
      return;
    }
    if (params.data != null) {
      Object.keys(params.data).forEach((key) => {
        if (params.data![key] === null) {
          delete params.data![key];
        }
      });
    }
    params.userId = [...new Set(params.userId)];
    try {
      const tokens = (
        await this.dbService
          .selectFrom('user_fcm_tokens')
          .select('user_fcm_tokens.value')
          .distinct()
          .where('user_id', 'in', params.userId)
          .execute()
      ).map(({ value }) => value);
      const res = await Promise.all(
        splitArrayIntoChunks(tokens, 500).map((t) =>
          messaging().sendEachForMulticast({
            tokens: t,
            data: params.data,
            notification:
              params.body == null
                ? undefined
                : {
                    title: params.title,
                    body: params.body,
                    imageUrl: params.imageUrl,
                  },
          }),
        ),
      );
      const responses = res.flatMap(({ responses }) => responses);
      if (!responses.every((v) => v.error == null)) {
        await this.dbService
          .deleteFrom('user_fcm_tokens')
          .where(
            'user_fcm_tokens.value',
            'in',
            responses
              .filter(({ error }) => error != null)
              .map((response, index) => tokens[index]),
          )
          .execute();
      }
    } catch (e) {
      Sentry.captureException(e);
    }
  }
}
