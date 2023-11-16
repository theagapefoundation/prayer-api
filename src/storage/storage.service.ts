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

  get url() {
    return 'https://storage.googleapis.com/prayer-public_uploads-prod-asia/';
  }
}
