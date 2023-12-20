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
import { UsersService } from 'src/users/users.service';
import {
  CreateFcmDto,
  CreateUserDto,
  FollowUserDto,
  UpdateUserDto,
} from './users.interface';
import { AuthGuard } from 'src/auth/auth.guard';
import {
  FollowMyselfError,
  UsernameDuplicatedError,
} from 'src/errors/common.error';
import { NotificationsService } from 'src/notifications/notifications.service';
import { MustUnbanned } from './users.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly appService: UsersService,
    private readonly notificationService: NotificationsService,
  ) {}

  @Get()
  async searchUser(
    @Query('query') query?: string,
    @Query('cursor') oldCursor?: string,
    @Query('excludeGroupId') excludeGroupId?: string,
    @User() user?: UserEntity,
  ) {
    const { data, cursor } = await this.appService.searchUsers({
      query,
      cursor: oldCursor,
      excludeGroupId,
      requestUser: user?.sub,
    });
    return {
      data,
      cursor,
    };
  }

  @Delete()
  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  async deleteUser(@User() user: UserEntity) {
    await this.appService.deleteUser(user.sub);
    return 'success';
  }

  @UseInterceptors(ResponseInterceptor)
  @Get(':id')
  async fetchUser(@Param('id') userId: string, @User() user?: UserEntity) {
    return this.appService.fetchUser({ userId, requestUserId: user?.sub });
  }

  @UseGuards(AuthGuard)
  @Post('fcmToken')
  @UseInterceptors(ResponseInterceptor)
  async uploadFcmTokens(
    @User() user: UserEntity,
    @Body() { value }: CreateFcmDto,
  ) {
    await this.appService.createNewFcmTokens(user.sub, value);
    return 'success';
  }

  @UseGuards(AuthGuard)
  @Post()
  async createUser(@User() user: UserEntity, @Body() form: CreateUserDto) {
    try {
      await this.appService.createUser({
        ...form,
        uid: user.sub,
      });
      return { data: 'success', createdAt: new Date().toISOString() };
    } catch (e) {
      if (e instanceof Error) {
        if (
          e.message ===
          'duplicate key value violates unique constraint "users_username_key"'
        ) {
          throw new UsernameDuplicatedError();
        }
      }
      throw e;
    }
  }

  @UseInterceptors(ResponseInterceptor)
  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Put()
  async updateUser(@User() user: UserEntity, @Body() form: UpdateUserDto) {
    try {
      await this.appService.updateUser({
        ...form,
        profile: form.profile === -1 ? null : form.profile,
        banner: form.banner === -1 ? null : form.banner,
        uid: user.sub,
        verse_id: form.verseId,
      });
      return 'success';
    } catch (e) {
      if (e instanceof Error) {
        if (
          e.message ===
          'duplicate key value violates unique constraint "users_username_key"'
        ) {
          throw new UsernameDuplicatedError();
        }
      }
      throw e;
    }
  }

  @UseInterceptors(ResponseInterceptor)
  @Get('by/username/:username')
  async fetchUserByUsername(
    @Param('username') username: string,
    @User() user?: UserEntity,
  ) {
    return this.appService.fetchUser({ username, requestUserId: user?.sub });
  }

  @UseGuards(AuthGuard)
  @Post(':userId/follows')
  async followUser(
    @User() user: UserEntity,
    @Param('userId') userId: string,
    @Body() { value }: FollowUserDto,
  ) {
    try {
      if (user.sub === userId) {
        throw new FollowMyselfError();
      }
      await this.appService.handleFollowings({
        following: user.sub,
        follower: userId,
        value,
      });
      if (value) {
        this.notificationService.notifyUserFollowed(user.sub, userId);
      }
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  }

  @UseGuards(AuthGuard)
  @UseGuards(MustUnbanned)
  @Post(':userId/blocks')
  async blockUsers(
    @User() user: UserEntity,
    @Param('userId') userId: string,
    @Body() { value }: FollowUserDto,
  ) {
    try {
      if (user.sub === userId) {
        throw new FollowMyselfError();
      }
      await this.appService.handleBlocks({
        userId: user.sub,
        targetId: userId,
        value,
      });
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  }

  @Get(':userId/followings')
  async fetchFollowings(
    @Param('userId') userId: string,
    @Query('target') target?: string,
    @Query('cursor') cursor?: number,
  ) {
    const data = await this.appService.fetchFollows({
      following: userId,
      follower: target,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data?.pop()?.id;
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get(':userId/followers')
  async fetchFollowers(
    @Param('userId') userId: string,
    @Query('target') target?: string,
    @Query('cursor') cursor?: number,
  ) {
    const data = await this.appService.fetchFollows({
      follower: userId,
      following: target,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data?.pop()?.id;
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseGuards(AuthGuard)
  @Post('feedback')
  async createFeedback(
    @User() user: UserEntity,
    @Body() { value }: { value: string },
  ) {
    await this.appService.sendFeedback(user.sub, value ?? '');
  }

  @UseGuards(AuthGuard)
  @Post('report')
  async createReport(
    @User() user: UserEntity,
    @Body() { reportId, value }: { reportId: string; value: string },
  ) {
    await this.appService.sendReport(user.sub, reportId, value ?? '');
  }
}
