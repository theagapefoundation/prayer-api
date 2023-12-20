import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { User, UserEntity } from 'src/auth/auth.decorator';
import { AuthGuard } from 'src/auth/auth.guard';
import { MustUnbanned } from 'src/users/users.guard';

@UseGuards(AuthGuard)
@UseGuards(MustUnbanned)
@Controller('uploads')
export class UploadsController {
  constructor(private appService: UploadsService) {}

  @Get('multiple')
  async getUploadUrls(
    @User() user: UserEntity,
    @Query('name') names: string | string[],
  ) {
    if (!names) {
      throw new HttpException(
        'fileName must be provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    const extensions = Array.isArray(names)
      ? names.map((name) => name.split('.').pop())
      : [names.split('.').pop()];
    const data = await Promise.all(
      extensions.map((extension) =>
        this.appService.createUploadUrl({
          extension: extension ? `.${extension}` : '',
          userId: user.sub,
        }),
      ),
    );
    return { data, createdAt: new Date().toISOString() };
  }

  @Get()
  async getUploadUrl(
    @User() user: UserEntity,
    @Query('name') newFileName: string,
  ) {
    if (!newFileName) {
      throw new HttpException(
        'fileName must be provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    const extension = newFileName.split('.').pop();
    const { path, url, id } = await this.appService.createUploadUrl({
      extension: extension ? `.${extension}` : '',
      userId: user.sub,
    });
    return { path, url, id, createdAt: new Date().toISOString() };
  }
}
