import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { credential, messaging } from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { KyselyService } from 'src/kysely/kysely.service';

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
    initializeApp({
      credential: credential.cert(
        JSON.parse(configService.getOrThrow('FIREBASE_ADMIN_PRIVATE_KEY')),
      ),
    });
  }

  async send(params: {
    userId: string[];
    title: string;
    body: string;
    imageUrl?: string;
    data: { [key: string]: string };
  }) {
    if (process.env.DISABLE_NOTIFICATION === 'true') {
      return;
    }
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
            notification: {
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
    } catch (e) {}
  }
}
