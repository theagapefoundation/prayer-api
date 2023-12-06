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

@UseGuards(AuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private appService: UploadsService) {}

  @UseGuards(AuthGuard)
  @Get('multiple')
  async getUploadUrls(
    @User() user: UserEntity,
    @Query('name') names: string[],
  ) {
    if (!names) {
      throw new HttpException(
        'fileName must be provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    const extensions = names.map((name) => name.split('.').pop());
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

  @UseGuards(AuthGuard)
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
