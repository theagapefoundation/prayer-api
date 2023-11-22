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
import { User, UserEntity } from 'src/auth/auth.decorator';
import { ResponseInterceptor } from 'src/response.interceptor';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto } from './groups.interface';
import { AuthGuard } from 'src/auth/auth.guard';
import { OperationNotAllowedError } from 'src/errors/common.error';

@Controller('groups')
export class GroupsController {
  constructor(private readonly appService: GroupsService) {}

  @Get()
  async getGroups(
    @Query('query') query?: string,
    @Query('cursor') cursor?: string,
    @Query('userId') userId?: string,
  ) {
    const data = await this.appService.fetchGroups({ query, cursor, userId });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get('by/user/:userId')
  async getGroupsByUser(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    const data = await this.appService.fetchGroups({ userId, cursor });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor?.id,
    };
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Post()
  async createGroup(@User() user: UserEntity, @Body() body: CreateGroupDto) {
    const groupId = await this.appService.createGroup({
      name: body.name,
      description: body.description,
      admin: user.sub,
      membershipType: body.membershipType,
      banner: body.banner,
    });
    return this.appService.fetchGroup(groupId, user?.sub);
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Put(':groupId')
  async editGroup(
    @User() user: UserEntity,
    @Body() body: UpdateGroupDto,
    @Param('groupId') groupId: string,
  ) {
    const data = await this.appService.fetchGroup(groupId);
    if (data?.admin_id !== user.sub) {
      throw new OperationNotAllowedError('Only admin can make an update');
    }
    await this.appService.updateGroup({
      name: body.name,
      description: body.description,
      banner: body.banner === '' ? null : body.banner,
      groupId,
    });
    return this.appService.fetchGroup(groupId, user?.sub);
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Delete(':groupId')
  async deleteGroup(
    @User() user: UserEntity,
    @Param('groupId') groupId: string,
  ) {
    const data = await this.appService.fetchGroup(groupId);
    if (data?.admin_id !== user.sub) {
      throw new OperationNotAllowedError('Only admin can delete a group');
    }
    await this.appService.deleteGroup(groupId);
    return 'success';
  }
}
