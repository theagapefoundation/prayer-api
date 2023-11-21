import {
  Body,
  Controller,
  Delete,
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
import { PrayersService } from './prayers.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { User, UserEntity } from 'src/auth/auth.decorator';
import {
  CreateCorporatePrayerDto,
  CreatePrayerDto,
  CreatePrayerPrayDto,
  UpdateCorporatePrayerDto,
} from './prayers.interface';
import { ResponseInterceptor } from 'src/response.interceptor';
import * as moment from 'moment';
import { StorageService } from 'src/storage/storage.service';
import { Timezone } from 'src/timezone.guard';
import {
  BadRequestError,
  OperationNotAllowedError,
  PrivateGroupError,
  TargetNotFoundError,
} from 'src/errors/common.error';
import { GroupsService } from 'src/groups/groups.service';
import { FirebaseService } from 'src/firebase/firebase.service';

@Controller('prayers')
export class PrayersController {
  constructor(
    private appService: PrayersService,
    private groupService: GroupsService,
    private storageService: StorageService,
    private firebaseService: FirebaseService,
  ) {}

  @Get('by/user/:userId')
  async fetchPrayersByUser(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @User() user?: UserEntity,
  ) {
    const data = await this.appService.fetchPrayers({
      userId,
      requestingUserId: user?.sub,
      cursor,
      hideAnonymous: userId !== user?.sub,
    });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseGuards(AuthGuard)
  @Get('by/group')
  async fetchPrayersByUserGroup(
    @User() user: UserEntity,
    @Query('cursor') cursor?: string,
  ) {
    const data = await this.appService.fetchPrayersByUserGroup({
      userId: user?.sub,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get('by/group/:groupId')
  async fetchPrayersByGroup(
    @Param('groupId') groupId: string,
    @Query('cursor') cursor?: string,
    @User() user?: UserEntity,
  ) {
    const group = await this.groupService.fetchGroup(groupId, user?.sub);
    if (group?.membership_type === 'private' && group?.accepted_at == null) {
      throw new PrivateGroupError(
        'You must be a member to see a private group',
      );
    }

    const data = await this.appService.fetchPrayers({
      groupId,
      requestingUserId: user?.sub,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseInterceptors(ResponseInterceptor)
  @Get('corporate/:prayerId')
  async fetchCorporatePrayer(
    @Param('prayerId') prayerId: string,
    @User() user?: UserEntity,
  ) {
    const { canView } =
      await this.appService.fetchJoinStatusFromCorporatePrayer(
        prayerId,
        user?.sub,
      );
    if (!canView) {
      throw new PrivateGroupError(
        'You must be a member to see a private group',
      );
    }
    return this.appService.fetchCorporatePrayer(prayerId);
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Delete('corporate/:prayerId')
  async deleteCorporatePrayer(
    @Param('prayerId') prayerId: string,
    @User() user: UserEntity,
  ) {
    const data = await this.appService.fetchCorporatePrayer(prayerId);
    if (data?.user_id !== user.sub) {
      throw new OperationNotAllowedError('Only owner can delete the post');
    }
    return this.appService.deleteCorporatePrayer(prayerId);
  }

  @Get('corporate/:prayerId/prayers')
  async fetchPrayersFromCorporatePrayer(
    @Param('prayerId') prayerId: string,
    @User() user?: UserEntity,
    @Query('cursor') cursor?: string,
  ) {
    const { canView } =
      await this.appService.fetchJoinStatusFromCorporatePrayer(
        prayerId,
        user?.sub,
      );
    if (!canView) {
      throw new PrivateGroupError(
        'You must be a member to see a private group',
      );
    }
    const data = await this.appService.fetchPrayers({
      corporateId: prayerId,
      requestingUserId: user?.sub,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get('corporate/by/group/:groupId')
  async fetchGroupCorporatePrayers(
    @Param('groupId') groupId: string,
    @Timezone() offset?: number,
    @Query('cursor') cursor?: string,
    @User() user?: UserEntity,
  ) {
    const group = await this.groupService.fetchGroup(groupId, user?.sub);
    if (group == null) {
      throw new TargetNotFoundError('Unable to find the group');
    }
    if (group.membership_type === 'private' && group?.accepted_at == null) {
      throw new PrivateGroupError(
        'You must be a member to see a private group',
      );
    }
    const data = await this.appService.fetchGroupCorporatePrayers({
      groupId,
      cursor,
      offset,
    });
    const newCursor = data.length < 6 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get(':prayerId')
  @UseInterceptors(ResponseInterceptor)
  async fetchPrayer(
    @Param('prayerId') prayerId: string,
    @User() user?: UserEntity,
  ) {
    const { canView } = await this.appService.fetchJoinStatusFromPrayer(
      prayerId,
      user?.sub,
    );
    if (!canView) {
      throw new PrivateGroupError(
        'You must be a member to see a private group',
      );
    }
    return this.appService.fetchPrayer({ prayerId, userId: user?.sub });
  }

  @UseGuards(AuthGuard)
  @Delete(':prayerId')
  @UseInterceptors(ResponseInterceptor)
  async deletePrayer(
    @Param('prayerId') prayerId: string,
    @User() user: UserEntity,
  ) {
    const data = await this.appService.fetchPrayer({
      prayerId,
      userId: user.sub,
    });
    if (data == null) {
      throw new TargetNotFoundError('Unable to find a prayer');
    }
    if (data.user_id !== user.sub) {
      throw new OperationNotAllowedError('Only owner can delete the post');
    }
    if (data.media) {
      this.storageService.removeFile(data.media);
    }
    await this.appService.deletePrayer(prayerId);
    return 'success';
  }

  @Get()
  async fetchRecommendedPrayers(
    @User() user?: UserEntity,
    @Query('cursor') cursor?: string,
  ) {
    const data = await this.appService.fetchHomeFeed({
      userId: user?.sub,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Post()
  async createPrayer(@User() user: UserEntity, @Body() form: CreatePrayerDto) {
    if (!!form.groupId) {
      const data = await this.groupService.fetchGroup(form.groupId, user.sub);
      if (data?.accepted_at == null) {
        throw new OperationNotAllowedError(
          'You have to be a member of the group to post the prayer',
        );
      }
    }

    if (!!form.corporateId && !form.groupId) {
      throw new BadRequestError(
        'group_id must be not null when corporate_id is given',
      );
    }
    const { id } = await this.appService.createPrayer({
      user_id: user.sub,
      group_id: form.groupId,
      corporate_id: form.corporateId,
      anon: form.anon,
      value: form.value,
      media: form.media,
    });
    this.firebaseService.prayerCreated({
      corporateId: form.corporateId,
      groupId: form.groupId,
      userId: user.sub,
      prayerId: id,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Post('corporate')
  async createCorporatePrayer(
    @User() user: UserEntity,
    @Body() form: CreateCorporatePrayerDto,
  ) {
    const group = await this.groupService.fetchGroup(form.groupId, user.sub);
    if (group == null) {
      throw new TargetNotFoundError('Unable to find the group');
    }
    if (group.moderator == null) {
      throw new OperationNotAllowedError(
        'Only moderator can post the corporate prayer',
      );
    }
    let prayers = form.prayers ? JSON.parse(form.prayers) : null;
    if (prayers) {
      if (
        !Array.isArray(prayers) ||
        prayers.some((value) => typeof value !== 'string')
      ) {
        throw new HttpException(
          'prayers must be an array of string',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (prayers.length === 0) {
        prayers = null;
      } else if (prayers.length > 10) {
        throw new HttpException(
          'prayers can have up to 10 prayers',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (form.startedAt != null && form.endedAt != null) {
      if (moment(form.endedAt).isBefore(moment(form.startedAt))) {
        throw new HttpException(
          'endedAt cannot be before startedAt',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const { id } = await this.appService.createCorporatePrayer({
      user_id: user.sub,
      group_id: form.groupId,
      title: form.title,
      description: form.description,
      prayers: JSON.stringify(prayers),
      started_at:
        form.startedAt == null
          ? null
          : moment(form.startedAt).startOf('day').toDate(),
      ended_at:
        form.endedAt == null
          ? null
          : moment(form.endedAt).endOf('day').toDate(),
      created_at: new Date(),
    });
    this.firebaseService.corporatePrayerCreated({
      groupId: form.groupId,
      uploaderId: user.sub,
      prayerId: id,
    });
    return 'success';
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Put('corporate/:corporateId')
  async editCorporatePrayer(
    @Param('corporateId') corporateId: string,
    @User() user: UserEntity,
    @Body() form: UpdateCorporatePrayerDto,
  ) {
    const prayer = await this.appService.fetchCorporatePrayer(corporateId);
    if (prayer == null) {
      throw new TargetNotFoundError('Unable to find the corporate prayer');
    }
    if (prayer.user_id !== user.sub) {
      throw new OperationNotAllowedError(
        'Only a writer of the prayer can edit',
      );
    }
    let prayers = form.prayers ? JSON.parse(form.prayers) : null;
    if (prayers) {
      if (
        !Array.isArray(prayers) ||
        prayers.some((value) => typeof value !== 'string')
      ) {
        throw new HttpException(
          'prayers must be an array of string',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (prayers.length === 0) {
        prayers = null;
      } else if (prayers.length > 10) {
        throw new HttpException(
          'prayers can have up to 10 prayers',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (form.startedAt != null && form.endedAt != null) {
      if (moment(form.endedAt).isBefore(moment(form.startedAt))) {
        throw new HttpException(
          'endedAt cannot be before startedAt',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    await this.appService.updateCorporatePrayer({
      id: corporateId,
      title: form.title,
      description: form.description,
      prayers: JSON.stringify(prayers),
      started_at:
        form.startedAt == null
          ? null
          : moment(form.startedAt).startOf('day').toDate(),
      ended_at:
        form.endedAt == null
          ? null
          : moment(form.endedAt).endOf('day').toDate(),
    });
    return 'success';
  }

  @Get('pray/by/user/:userId')
  async fetchUserPrays(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    const data = await this.appService.fetchPrayersPrayedByUser(userId, cursor);
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @Get('pray/by/prayer/:prayerId')
  async fetchPrayerPrays(
    @Param('prayerId') prayerId: string,
    @Query('cursor') cursor?: number,
  ) {
    const data = await this.appService.fetchPrayerPrays({
      prayerId,
      cursor,
    });
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor?.id,
    };
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Post('pray')
  async createPrayerPray(
    @User() user: UserEntity,
    @Body() { prayerId, value }: CreatePrayerPrayDto,
  ) {
    try {
      const data = await this.appService.fetchLatestPrayerPray(
        prayerId,
        user.sub,
      );
      if (data?.created_at != null) {
        const now = new Date();
        const diff = now.getTime() - data.created_at.getTime();
        if (diff < 1000 * 60 * 5) {
          throw new Error('Need at least 5 minutes to repray');
        }
      }
      await this.appService.createPrayerPray({
        prayerId,
        userId: user.sub,
        value,
      });
      this.firebaseService.prayForUser(prayerId, user.sub, !!value);
      return 'success';
    } catch (e) {
      return 'false';
    }
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(ResponseInterceptor)
  @Delete('pray/:prayId')
  async deletePrayerPray(
    @Param('prayId') prayId: number,
    @User() user: UserEntity,
  ) {
    const data = await this.appService.fetchPrayerPray(prayId);
    if (data == null) {
      return 'failed';
    }
    if (data.user_id !== user.sub) {
      throw new OperationNotAllowedError('You can only delete your pray');
    }
    await this.appService.deletePrayerPray(prayId);
    return 'success';
  }
}
