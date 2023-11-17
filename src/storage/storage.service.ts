import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService extends Storage {
  constructor(private configService: ConfigService) {
    super(
      process.env.NODE_ENV === 'development'
        ? {
            keyFilename: './prayer-google-credential.json',
          }
        : undefined,
    );
  }

  get publicBucket() {
    return this.bucket(this.configService.getOrThrow('BUCKET_NAME'));
  }

  getPublicUrl(path: string) {
    return this.publicBucket.file(path).publicUrl();
  }

  async removeFile(path: string) {
    return this.publicBucket.file(path).delete({ ignoreNotFound: true });
  }
}
