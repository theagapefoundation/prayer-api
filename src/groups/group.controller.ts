import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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
import { AcceptRequestGroupDto, JoinGroupDto } from './groups.interface';
import { NoResultError } from 'kysely';
import {
  OperationNotAllowedError,
  TargetNotFoundError,
} from 'src/errors/common.error';
import { FirebaseService } from 'src/firebase/firebase.service';

@Controller('groups/:groupId')
export class GroupController {
  constructor(
    private readonly appService: GroupsService,
    private readonly firebaseSerivce: FirebaseService,
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
      if (value === 'true') {
        const { accepted_at } = await this.appService.joinGroup({
          groupId,
          userId: user.sub,
        });
        this.firebaseSerivce.joinGroup(groupId, user.sub);
        return accepted_at;
      }
      const data = await this.appService.fetchGroup(groupId);
      if (data == null) {
        throw new TargetNotFoundError('Unable to find the group to join');
      }
      if (data.admin_id === user.sub) {
        throw new OperationNotAllowedError('Admin cannot leave the group');
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
    @Query('cursor') cursor?: number,
  ) {
    const data = await this.appService.fetchMembers(groupId, {
      cursor,
      moderator: true,
    });
    const newCursor = data.length < 21 ? null : data.pop();
    return { createdAt: new Date().toISOString(), data, cursor: newCursor };
  }

  @Get('members')
  async fetchMembers(
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: number,
    @Query('query') query?: string,
  ) {
    const data = await this.appService.fetchMembers(groupId, {
      cursor,
      query,
      moderator: false,
    });
    const newCursor = data.length < 21 ? null : data.pop();
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
    @Query('cursor') cursor?: number,
  ) {
    if (!(await this.appService.checkModerator(groupId, user.sub))) {
      throw new OperationNotAllowedError(
        'Only moderators are able to see the requests',
      );
    }
    const data = await this.appService.fetchMembers(groupId, {
      cursor,
      requests: true,
    });
    const newCursor = data.length < 21 ? null : data.pop();
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
    this.firebaseSerivce.groupRequestAccepted(groupId, userId);
    return 'success';
  }

  @UseGuards(AuthGuard)
  @Post('promote')
  async handleModerators(
    @Param('groupId') groupId: string,
    @Body() { userId }: AcceptRequestGroupDto,
    @User() user: UserEntity,
  ) {
    const data = await this.appService.fetchGroup(groupId);
    if (data?.admin_id !== user.sub) {
      throw new HttpException(
        'Only admin can promote user to moderator',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.appService.handleModerator({ groupId, userId });
    this.firebaseSerivce.memberPromoted(groupId, userId);
    return 'success';
  }
}
