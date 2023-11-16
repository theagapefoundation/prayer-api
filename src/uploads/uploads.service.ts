import { Injectable } from '@nestjs/common';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class UploadsService {
  constructor(
    private storageService: StorageService,
    private dbService: KyselyService,
  ) {}

  async createUploadUrl(params: { extension: string; userId: string }) {
    const { id } = await this.dbService
      .insertInto('contents')
      .values({ user_id: params.userId })
      .returning('contents.id')
      .executeTakeFirstOrThrow();
    const fileName = `${id}${params.extension}`;
    const [url] = await this.storageService.publicBucket
      .file(fileName)
      .getSignedUrl({
        action: 'write',
        expires: Date.now() + 1000 * 60 * 60,
        version: 'v4',
      });
    return { url, fileName };
  }
}
