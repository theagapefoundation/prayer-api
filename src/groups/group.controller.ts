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

@Controller('groups/:groupId')
export class GroupController {
  constructor(private readonly appService: GroupsService) {}

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
    if (value === 'true') {
      const date = await this.appService.joinGroup({
        groupId,
        userId: user.sub,
      });
      return date;
    }
    await this.appService.leaveGroup({ groupId, userId: user.sub });
    return 'success';
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
      throw new HttpException(
        'Only moderators are able to see the requests',
        HttpStatus.BAD_REQUEST,
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
      throw new HttpException(
        'Only moderators are able to see the requests',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.appService.handleRequest({ groupId, userId });
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
    return 'success';
  }
}
