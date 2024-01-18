import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { ResponseInterceptor } from 'src/response.interceptor';
import { User, UserEntity } from 'src/auth/auth.decorator';
import { AuthGuard } from 'src/auth/auth.guard';
import {
  AcceptRequestGroupDto,
  InviteUserToGroupDto,
  UpdateGroupDto,
} from './groups.interface';
import { NoResultError } from 'kysely';
import {
  OperationNotAllowedError,
  TargetNotFoundError,
} from 'src/errors/common.error';
import { NotificationsService } from 'src/notifications/notifications.service';
import { MustUnbanned } from 'src/users/users.guard';
import { Timezone } from 'src/timezone.guard';
import { RemindersService } from 'src/reminders/reminders.service';

@Controller('groups/:groupId')
export class GroupController {
  constructor(
    private readonly appService: GroupsService,
    private readonly notificationService: NotificationsService,
    private readonly remindersService: RemindersService,
  ) {}

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post('join')
  async joinGroup(@User() user: UserEntity, @Param('groupId') groupId: string) {
    try {
      const { accepted_at } = await this.appService.joinGroup({
        groupId,
        userId: user.sub,
      });
      this.notificationService.notifyJoinGroup(
        groupId,
        user.sub,
        accepted_at == null,
      );
      return accepted_at;
    } catch (e) {
      if (e instanceof NoResultError) {
        throw new TargetNotFoundError('Unable to find the group to join');
      }
      throw e;
    }
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Delete('join')
  async leaveGroup(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
  ) {
    try {
      await this.appService.leaveGroup({
        groupId,
        requestUserId: user.sub,
      });
      return 'success';
    } catch (e) {
      if (e instanceof NoResultError) {
        throw new TargetNotFoundError('Unable to find the group');
      }
      throw e;
    }
  }

  @Get('moderators')
  async fetchModerators(
    @Param('groupId') groupId: string,
    @Query('query') query?: string,
    @Query('cursor') cursor?: string,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchMembers({
      groupId,
      query,
      cursor,
      moderator: true,
      bans: false,
    });
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @Get('members')
  async fetchMembers(
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
    @Query('query') query?: string,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchMembers({
      groupId,
      cursor,
      query,
      moderator: false,
      bans: false,
    });
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get('bans')
  @UseGuards(AuthGuard)
  async fetchBans(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
    @Query('query') query?: string,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    const { data, cursor: newCursor } = await this.appService.fetchMembers({
      groupId,
      query,
      cursor,
      bans: true,
    });
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @Get('requests')
  @UseGuards(AuthGuard)
  async fetchRequests(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
    @Query('query') query?: string,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    const { data, cursor: newCursor } = await this.appService.fetchMembers({
      groupId,
      query,
      cursor,
      requests: true,
      bans: false,
    });
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @Get('invites')
  @UseGuards(AuthGuard)
  async fetchInvites(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: number,
    @Query('query') query?: string,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    const { data, cursor: newCursor } =
      await this.appService.fetchPendingInvites({ groupId, cursor, query });
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @UseInterceptors(ResponseInterceptor)
  @Get()
  async getGroup(@Param('groupId') groupId: string, @User() user?: UserEntity) {
    return this.appService.fetchGroup(groupId, user?.sub);
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post('requests')
  async handleRequests(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    await this.appService.handleRequest({
      groupId,
      userId,
      requestUserId: user.sub,
    });
    this.notificationService.notifyGroupRequestAccepted(groupId, userId);
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post('promote')
  async promoteMember(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    await this.appService.handleModerator({
      groupId,
      userId,
      value: true,
      requestUserId: user.sub,
    });
    this.notificationService.notifyMemberPromoted(groupId, userId);
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Delete('promote')
  async revokeModerator(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    await this.appService.handleModerator({
      groupId,
      userId,
      value: false,
      requestUserId: user.sub,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post('bans')
  async banMember(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    await this.appService.handleBan({
      groupId,
      userId,
      value: true,
      requestUserId: user.sub,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Delete('bans')
  async unbanMember(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    await this.appService.handleBan({
      groupId,
      userId,
      value: false,
      requestUserId: user.sub,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post('kick')
  async kickUser(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    await this.appService.handleKick({
      groupId,
      userId,
      requestUserId: user.sub,
    });
    return 'success';
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post('invite')
  async sendInvitation(
    @Param('groupId') groupId: string,
    @User() user: UserEntity,
    @Body() { value }: InviteUserToGroupDto,
  ) {
    await this.appService.inviteUser({
      groupId,
      userIds: value,
      value: true,
      requestUserId: user.sub,
    });
    return 'success';
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Delete('invite')
  async deleteInvitation(
    @Param('groupId') groupId: string,
    @User() user: UserEntity,
    @Body() { value }: InviteUserToGroupDto,
  ) {
    await this.appService.inviteUser({
      groupId,
      userIds: value,
      value: false,
      requestUserId: user.sub,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @UseInterceptors(ResponseInterceptor)
  @Put()
  async editGroup(
    @User() user: UserEntity,
    @Body() body: UpdateGroupDto,
    @Param('groupId') groupId: string,
    @Timezone() timezone: number | null,
  ) {
    await this.appService.updateGroup({
      name: body.name,
      description: body.description,
      banner: body.banner || undefined,
      groupId,
      requestUserId: user.sub,
      rules: body.rules,
      reminders: this.remindersService.buildDataForDb(body, timezone),
      welcomeTitle: body.welcomeTitle,
      welcomeMessage: body.welcomeMessage,
    });
    return this.appService.fetchGroup(groupId, user?.sub);
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Delete()
  async deleteGroup(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
  ) {
    await this.appService.deleteGroup(groupId, user.sub);
    this.notificationService.cleanupNotification({ groupId });
    return 'success';
  }
}
