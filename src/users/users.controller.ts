import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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

@Controller('users')
export class UsersController {
  constructor(private readonly appService: UsersService) {}

  @Get()
  async searchUser(
    @Query('query') query?: string,
    @Query('cursor') cursor?: string,
  ) {
    const data = await this.appService.searchUsers({ query, cursor });
    const newCursor = data.length < 21 ? null : data?.pop();
    return { data, cursor: newCursor?.uid };
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
          'duplicate key value violates unique constraint "users_uid_key"'
        ) {
          return {
            message: 'Username already taken',
            createdAt: new Date().toISOString(),
          };
        }
        return { message: e.message, createdAt: new Date().toISOString() };
      }
      return { message: 'Unknown error', createdAt: new Date().toISOString() };
    }
  }

  @UseGuards(AuthGuard)
  @Put()
  async updateUser(@User() user: UserEntity, @Body() form: UpdateUserDto) {
    try {
      await this.appService.updateUser({
        ...form,
        profile: form.profile == 'null' ? null : form.profile,
        banner: form.banner == 'null' ? null : form.banner,
        uid: user.sub,
      });
      return { data: 'success', createdAt: new Date().toISOString() };
    } catch (e) {
      if (e instanceof Error) {
        if (
          e.message ===
          'duplicate key value violates unique constraint "users_uid_key"'
        ) {
          return {
            message: 'Username already taken',
            createdAt: new Date().toISOString(),
          };
        }
        return { message: e.message, createdAt: new Date().toISOString() };
      }
      return { message: 'Unknown error', createdAt: new Date().toISOString() };
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
        throw new HttpException(
          "You can't follow yourself",
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.appService.handleFollowings({
        following: user.sub,
        follower: userId,
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

  @UseInterceptors(ResponseInterceptor)
  @Get(':userId/groups')
  async fetchUserGroups(@Param('userId') userId: string) {
    const groups = await this.appService.fetchUserGroups(userId);
    return groups.map(({ group_id }) => group_id);
  }
}
