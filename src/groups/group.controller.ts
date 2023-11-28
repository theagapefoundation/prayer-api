import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
  JoinGroupDto,
} from './groups.interface';
import { NoResultError } from 'kysely';
import {
  BadRequestError,
  OperationNotAllowedError,
  TargetNotFoundError,
} from 'src/errors/common.error';
import { NotificationsService } from 'src/notifications/notifications.service';

@Controller('groups/:groupId')
export class GroupController {
  constructor(
    private readonly appService: GroupsService,
    private readonly notificationService: NotificationsService,
  ) {}

  @UseInterceptors(ResponseInterceptor)
  @Get()
  async getGroup(@Param('groupId') groupId: string, @User() user?: UserEntity) {
    return this.appService.fetchGroup(groupId, user?.sub);
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @Post('join')
  async joinGroup(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
    @Body() { value }: JoinGroupDto,
  ) {
    try {
      const data = await this.appService.fetchGroup(groupId);
      if (data == null) {
        throw new TargetNotFoundError('Unable to find the group to join');
      }
      if (data.admin_id === user.sub) {
        throw new OperationNotAllowedError('Admin cannot leave the group');
      }
      if (value === 'true') {
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
      }
      await this.appService.leaveGroup({ groupId, userId: user.sub });
      return 'success';
    } catch (e) {
      if (e instanceof NoResultError) {
        throw new TargetNotFoundError('Unable to find the group to join');
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
    const { data, cursor: newCursor } = await this.appService.fetchMembers(
      groupId,
      {
        query,
        cursor,
        moderator: true,
      },
    );
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @Get('members')
  async fetchMembers(
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
    @Query('query') query?: string,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchMembers(
      groupId,
      {
        cursor,
        query,
        moderator: false,
      },
    );
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get('requests')
  @UseGuards(AuthGuard)
  async fetchRequests(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    const { data, cursor: newCursor } = await this.appService.fetchMembers(
      groupId,
      {
        cursor,
        requests: true,
      },
    );
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @Get('invites')
  @UseGuards(AuthGuard)
  async fetchInvites(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: number,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    const { data, cursor: newCursor } =
      await this.appService.fetchPendingInvites(groupId, cursor);
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @UseGuards(AuthGuard)
  @Post('requests')
  async handleRequests(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    await this.appService.handleRequest({ groupId, userId });
    this.notificationService.notifyGroupRequestAccepted(groupId, userId);
    return 'success';
  }

  @UseGuards(AuthGuard)
  @Post('promote')
  async handleModerators(
    @Param('groupId') groupId: string,
    @Body() { userId, value }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    const data = await this.appService.fetchGroup(groupId);
    if (data?.admin_id !== user.sub) {
      throw new OperationNotAllowedError(
        'Only admin can promote user to moderator',
      );
    }
    if (userId === data?.admin_id) {
      throw new OperationNotAllowedError('You cannot change admin permission');
    }
    await this.appService.handleModerator({
      groupId,
      userId,
      value,
    });
    this.notificationService.notifyMemberPromoted(groupId, userId);
    return 'success';
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @Post('invite')
  async sendInvitation(
    @Param('groupId') groupId: string,
    @User() user: UserEntity,
    @Body() { value }: InviteUserToGroupDto,
  ) {
    const data = await this.appService.fetchGroup(groupId, user.sub);
    if (data?.moderator == null) {
      throw new OperationNotAllowedError('Only moderator can send invitation');
    }
    value = JSON.parse(value);
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new BadRequestError('`value` must be an array of uid');
    }
    await this.appService.inviteUser({ groupId, userIds: value, value: true });
    return 'success';
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @Delete('invite')
  async deleteInvitation(
    @Param('groupId') groupId: string,
    @User() user: UserEntity,
    @Body() { value }: InviteUserToGroupDto,
  ) {
    const data = await this.appService.fetchGroup(groupId, user.sub);
    if (data?.moderator == null) {
      throw new OperationNotAllowedError('Only moderator can send invitation');
    }
    value = JSON.parse(value);
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new BadRequestError('`value` must be an array of uid');
    }
    await this.appService.inviteUser({ groupId, userIds: value, value: false });
    return 'success';
  }
}
