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
  @Get()
  async getUploadUrl(
    @User() user: UserEntity,
    @Query('fileName') newFileName: string,
  ) {
    if (!newFileName) {
      throw new HttpException(
        'fileName must be provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    const extension = newFileName.split('.').pop();
    const { fileName, url } = await this.appService.createUploadUrl({
      extension: extension ? `.${extension}` : '',
      userId: user.sub,
    });
    return { fileName, url, createdAt: new Date().toISOString() };
  }
}
