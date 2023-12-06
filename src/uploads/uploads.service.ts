import { Injectable } from '@nestjs/common';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';
import { v4 } from 'uuid';

@Injectable()
export class UploadsService {
  constructor(
    private storageService: StorageService,
    private dbService: KyselyService,
  ) {}

  async createUploadUrl(params: { extension: string; userId: string }) {
    const newPath = v4();
    const { id, path } = await this.dbService
      .insertInto('contents')
      .values({
        user_id: params.userId,
        processed: true,
        path: `${newPath}${params.extension}`,
      })
      .returning(['contents.id', 'contents.path'])
      .executeTakeFirstOrThrow();
    const [url] = await this.storageService.publicBucket
      .file(path)
      .getSignedUrl({
        action: 'write',
        expires: Date.now() + 1000 * 60 * 60,
        version: 'v4',
      });
    return { url, path, id };
  }
}
