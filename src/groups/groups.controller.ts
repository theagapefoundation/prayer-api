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
import { ResponseInterceptor } from 'src/response.interceptor';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './groups.interface';
import { AuthGuard } from 'src/auth/auth.guard';
import { MustUnbanned } from 'src/users/users.guard';
import { BadRequestError } from 'src/errors/common.error';
import { Timezone } from 'src/timezone.guard';
import { RemindersService } from 'src/reminders/reminders.service';

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly appService: GroupsService,
    private readonly remindersService: RemindersService,
  ) {}

  @Get('by/user/:userId')
  async getGroupsByUser(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @User() user?: UserEntity,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchGroups({
      userId,
      cursor,
      requestUserId: user?.sub,
    });
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseGuards(AuthGuard)
  @Get('invitation')
  async fetchInvitations(
    @User() user: UserEntity,
    @Query('cursor') cursor?: number,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchInvitations({
      userId: user.sub,
      cursor,
    });
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get()
  async getGroups(
    @Query('query') query?: string,
    @Query('cursor') cursor?: string,
    @Query('userId') userId?: string,
    @User() user?: UserEntity,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchGroups({
      query,
      cursor,
      userId,
      requestUserId: user?.sub,
    });
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @UseInterceptors(ResponseInterceptor)
  @Post()
  async createGroup(
    @User() user: UserEntity,
    @Body() body: CreateGroupDto,
    @Timezone() timezone?: number | null,
  ) {
    if (body.rules != null) {
      body.rules.forEach((rule) => {
        if (!rule['description'] || !rule['title']) {
          throw new BadRequestError('Wrong Format for Group Rules');
        }
      });
    }
    this.remindersService.validateParams(body);
    const groupId = await this.appService.createGroup({
      name: body.name,
      description: body.description,
      admin: user.sub,
      membershipType: body.membershipType,
      banner: body.banner,
      rules: body.rules,
      reminders: this.remindersService.buildDataForDb(body, timezone),
    });
    return this.appService.fetchGroup(groupId, user?.sub);
  }
}
