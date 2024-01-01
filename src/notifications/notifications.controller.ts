import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { User, UserEntity } from 'src/auth/auth.decorator';
import { AuthGuard } from 'src/auth/auth.guard';
import { NotificationsService } from './notifications.service';
import { ResponseInterceptor } from 'src/response.interceptor';
import { NotificationSettingsService } from './notification_settings.service';
import {
  CreateCorporateNotificationSettingsDto,
  CreateGroupNotificationSettingsDto,
} from './notification_settings.interface';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationsService,
    private readonly settingsService: NotificationSettingsService,
  ) {}

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @Get('latest')
  async fetchNotificationsLatestDate(@User() user: UserEntity) {
    const data = await this.notificationService.fetchNotificationsLatestDate(
      user.sub,
    );
    return data;
  }

  @UseGuards(AuthGuard)
  @Get()
  async fetchNotifications(
    @User() user: UserEntity,
    @Query('cursor') cursor?: number,
  ) {
    const data = await this.notificationService.fetchNotifications(
      user?.sub,
      cursor,
    );
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      data,
      cursor: newCursor?.id ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Get('groups/:groupId')
  async fetchGroupNotificationSettings(
    @Param('groupId') groupId: string,
    @User() user: UserEntity,
  ) {
    return this.settingsService.fetchGroupNotificationSettings(
      groupId,
      user.sub,
    );
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Get('prayers/corporate/:corporateId')
  async fetchCorporateNotificationSettings(
    @Param('corporateId') corporateId: string,
    @User() user: UserEntity,
  ) {
    return this.settingsService.fetchCorporateNotificationSettings(
      corporateId,
      user.sub,
    );
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Post('groups/:groupId')
  async createGroupNotificationSettings(
    @Param('groupId') groupId: string,
    @User() user: UserEntity,
    @Body() body: CreateGroupNotificationSettingsDto,
  ) {
    if (body.onMemberPost) {
      body.onModeratorPost = true;
    }
    if (!body.onModeratorPost) {
      body.onMemberPost = false;
    }
    await this.settingsService.cretaeGroupNotificationSettings({
      groupId,
      userId: user.sub,
      ...body,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Post('prayers/corporate/:corporateId')
  async createCorporateNotificationSettings(
    @Param('corporateId') corporateId: string,
    @User() user: UserEntity,
    @Body() body: CreateCorporateNotificationSettingsDto,
  ) {
    await this.settingsService.cretaeCorporateNotificationSettings({
      corporateId,
      userId: user.sub,
      ...body,
    });
    return 'success';
  }
}
