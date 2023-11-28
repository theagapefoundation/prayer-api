import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { User, UserEntity } from 'src/auth/auth.decorator';
import { AuthGuard } from 'src/auth/auth.guard';
import { NotificationsService } from './notifications.service';
import { ResponseInterceptor } from 'src/response.interceptor';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly appService: NotificationsService) {}

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @Get('latest')
  async fetchNotificationsLatestDate(@User() user: UserEntity) {
    const data = await this.appService.fetchNotificationsLatestDate(user.sub);
    return data;
  }

  @UseGuards(AuthGuard)
  @Get()
  async fetchNotifications(
    @User() user: UserEntity,
    @Query('cursor') cursor?: number,
  ) {
    const data = await this.appService.fetchNotifications(user?.sub, cursor);
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      data,
      cursor: newCursor?.id ?? null,
      createdAt: new Date().toISOString(),
    };
  }
}
