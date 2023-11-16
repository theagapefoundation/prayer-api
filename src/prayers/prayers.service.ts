import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InsertObject, sql } from 'kysely';
import { DB } from 'kysely-codegen';
import { KyselyService } from 'src/kysely/kysely.service';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { StorageService } from 'src/storage/storage.service';
import { TooManyPrays } from './prayers.error';

@Injectable()
export class PrayersService {
  constructor(
    private dbService: KyselyService,
    private storageService: StorageService,
  ) {}

  async fetchCorporatePrayer(prayerId: string) {
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .where('corporate_prayers.id', '=', prayerId)
      .selectAll(['corporate_prayers'])
      .select(({ selectFrom }) =>
        selectFrom('prayers')
          .whereRef('prayers.corporate_id', '=', 'corporate_prayers.id')
          .select(({ fn }) =>
            fn
              .coalesce(fn.count<string>('prayers.id'), sql<string>`0`)
              .as('value'),
          )
          .as('prayers_count'),
      )
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select([
              'users.profile',
              'users.uid',
              'users.name',
              'users.username',
            ])
            .whereRef('users.uid', '=', 'corporate_prayers.user_id'),
        ).as('user'),
      )
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('groups')
            .select([
              'groups.id',
              'groups.name',
              'groups.admin_id',
              'groups.membership_type',
            ])
            .whereRef('groups.id', '=', 'corporate_prayers.group_id'),
        ).as('group'),
      )
      .executeTakeFirst();
    if (data == null) {
      return data;
    }
    return {
      ...data,
      prayers_count: parseInt(data.prayers, 10),
      user: {
        ...data.user,
        profile: data.user.profile
          ? this.storageService.publicBucket.file(data.user.profile).publicUrl()
          : null,
      },
    };
  }

  async fetchPrayer({
    prayerId,
    userId,
  }: {
    prayerId: string;
    userId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('prayers')
      .where('prayers.id', '=', prayerId)
      .selectAll()
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select([
              'users.profile',
              'users.uid',
              'users.name',
              'users.username',
            ])
            .whereRef('users.uid', '=', 'prayers.user_id'),
        ).as('user'),
      )
      .select(({ selectFrom }) =>
        selectFrom('prayer_prays')
          .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
          .select(({ fn }) =>
            fn
              .coalesce(fn.count<string>('prayer_prays.id'), sql<string>`0`)
              .as('value'),
          )
          .as('prays_count'),
      )
      .select(({ selectFrom }) =>
        selectFrom('prayer_prays')
          .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
          .select(['prayer_prays.created_at'])
          .orderBy('prayer_prays.created_at desc')
          .limit(1)
          .as('has_prayed'),
      )
      .select(({ selectFrom }) =>
        jsonObjectFrom(
          selectFrom('prayer_prays')
            .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
            .leftJoin('users', 'users.uid', 'prayer_prays.user_id')
            .select([
              'users.uid',
              'users.profile',
              'users.username',
              'users.name',
              'prayer_prays.created_at',
            ])
            .orderBy('created_at desc')
            .limit(1),
        ).as('pray'),
      )
      .select(({ selectFrom }) =>
        jsonObjectFrom(
          selectFrom('groups')
            .whereRef('groups.id', '=', 'prayers.group_id')
            .select([
              'groups.id',
              'groups.name',
              'groups.admin_id',
              'groups.membership_type',
            ]),
        ).as('group'),
      )
      .select(({ selectFrom }) =>
        jsonObjectFrom(
          selectFrom('corporate_prayers')
            .whereRef('corporate_prayers.id', '=', 'prayers.corporate_id')
            .select(['corporate_prayers.id', 'corporate_prayers.title']),
        ).as('corporate'),
      )
      .executeTakeFirst();
    return {
      ...data,
      media: data.media
        ? this.storageService.publicBucket.file(data.media).publicUrl()
        : null,
      prays_count: parseInt(data.prays_count, 10),
      user_id: data.anon && data.user_id !== userId ? null : data.user_id,
      user: data.anon && data.user_id !== userId ? null : data.user,
    };
  }

  async fetchHomeFeed({
    userId,
    cursor,
  }: {
    userId?: string;
    cursor?: string;
  }) {
    const data = await this.dbService
      .selectFrom('prayers')
      .select('prayers.id')
      .orderBy('prayers.created_at desc')
      .orderBy((eb) =>
        eb
          .selectFrom('prayer_prays')
          .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
          .orderBy('prayer_prays.created_at desc')
          .select('prayer_prays.created_at')
          .limit(1),
      )
      .$if(!!cursor, (eb) => eb.where('prayers.id', '=', cursor))
      .limit(11)
      .execute();
    return data.map(({ id }) => id);
  }

  async fetchPrayers({
    groupId,
    userId,
    requestingUserId,
    cursor,
    corporateId,
  }: {
    groupId?: string;
    requestingUserId?: string;
    userId?: string;
    corporateId?: string;
    cursor?: string;
  }) {
    if (groupId != null) {
      const { membership_type, accepted_at } = await this.dbService
        .selectFrom('groups')
        .where('groups.id', '=', groupId)
        .$if(!!userId, (qb) =>
          qb.select((eb) =>
            eb
              .selectFrom('group_members')
              .whereRef('group_members.group_id', '=', 'groups.id')
              .where('group_members.user_id', '=', requestingUserId)
              .select('group_members.accepted_at')
              .as('accepted_at'),
          ),
        )
        .select(['groups.membership_type'])
        .executeTakeFirstOrThrow();
      if (membership_type === 'private' && accepted_at == null) {
        throw new HttpException(
          'Only accepted members can see the private',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    const data = await this.dbService
      .selectFrom('prayers')
      .$if(!!groupId, (eb) => eb.where('group_id', '=', groupId))
      .$if(!!userId, (eb) => eb.where('user_id', '=', userId))
      .$if(!!corporateId, (eb) => eb.where('corporate_id', '=', corporateId))
      .$if(userId !== requestingUserId || requestingUserId == null, (eb) =>
        eb.where('anon', '=', false),
      )
      .$if(!!cursor, (eb) => eb.where('id', '=', cursor))
      .orderBy('prayers.created_at desc')
      .select(['id'])
      .limit(11)
      .execute();
    return data.map(({ id }) => id);
  }

  async fetchPrayerPrays({
    prayerId,
    cursor,
  }: {
    prayerId: string;
    cursor?: number;
  }) {
    return this.dbService
      .selectFrom('prayer_prays')
      .where('prayer_prays.prayer_id', '=', prayerId)
      .$if(!!cursor, (eb) => eb.where('prayer_prays.id', '=', cursor))
      .leftJoin('users', 'users.uid', 'prayer_prays.user_id')
      .orderBy('prayer_prays.created_at desc')
      .select([
        'prayer_prays.id',
        'prayer_prays.created_at',
        'users.name',
        'users.uid',
        'users.profile',
        'users.username',
      ])
      .limit(11)
      .execute();
  }

  async fetchPrayersByUserGroup({
    userId,
    cursor,
  }: {
    userId?: string;
    cursor?: string;
  }) {
    return this.dbService
      .selectFrom('prayers')
      .where((eb) =>
        eb(
          'group_id',
          'in',
          eb
            .selectFrom('group_members')
            .where('group_members.user_id', '=', userId)
            .distinct()
            .select('group_members.group_id'),
        ),
      )
      .orderBy('prayers.created_at desc')
      .orderBy((eb) =>
        eb
          .selectFrom('prayer_prays')
          .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
          .orderBy('prayer_prays.created_at desc')
          .select('prayer_prays.created_at')
          .limit(1),
      )
      .$if(!!cursor, (eb) => eb.where('prayers.id', '=', cursor))
      .select(['id'])
      .limit(11)
      .execute();
  }

  async fetchGroupCorporatePrayers({
    groupId,
    userId,
    cursor,
  }: {
    groupId: string;
    userId?: string;
    cursor?: string;
  }) {
    const { membership_type, accepted_at } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .$if(!!userId, (qb) =>
        qb.select((eb) =>
          eb
            .selectFrom('group_members')
            .whereRef('group_members.group_id', '=', 'groups.id')
            .where('group_members.user_id', '=', userId)
            .select('group_members.accepted_at')
            .as('accepted_at'),
        ),
      )
      .select(['groups.membership_type'])
      .executeTakeFirstOrThrow();
    if (membership_type === 'private' && accepted_at == null) {
      throw new HttpException(
        'Only accepted members can see the private',
        HttpStatus.FORBIDDEN,
      );
    }
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .where('corporate_prayers.group_id', '=', groupId)
      .$if(!!cursor, ({ where }) => where('id', '=', cursor))
      .orderBy('corporate_prayers.ended_at desc')
      .orderBy('corporate_prayers.created_at desc')
      .select(['id'])
      .limit(6)
      .execute();
    return data.map(({ id }) => id);
  }

  async createPrayer(data: InsertObject<DB, 'prayers'>) {
    if (data.group_id) {
      const { accepted_at } = await this.dbService
        .selectFrom('group_members')
        .select(['accepted_at'])
        .where('group_members.group_id', '=', data.group_id as string)
        .where('group_members.user_id', '=', data.user_id as string)
        .executeTakeFirstOrThrow();
      if (accepted_at == null) {
        throw new HttpException(
          'Only a member of the group can post a prayer',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return this.dbService.insertInto('prayers').values(data).executeTakeFirst();
  }

  async createPrayerPray({
    prayerId,
    userId,
  }: {
    prayerId: string;
    userId: string;
  }) {
    const data = await this.dbService
      .selectFrom('prayer_prays')
      .select('created_at')
      .where('prayer_id', '=', prayerId)
      .where('user_id', '=', userId)
      .orderBy('created_at desc')
      .limit(1)
      .executeTakeFirst();
    if (data?.created_at != null) {
      const now = new Date();
      const diff = now.getTime() - data.created_at.getTime();
      if (diff < 1000 * 60 * 5) {
        throw new TooManyPrays();
      }
    }
    await this.dbService
      .insertInto('prayer_prays')
      .values({ prayer_id: prayerId, user_id: userId, created_at: new Date() })
      .executeTakeFirst();
  }

  async createCorporatePrayer(data: InsertObject<DB, 'corporate_prayers'>) {
    const { moderator } = await this.dbService
      .selectFrom('group_members')
      .select(['moderator'])
      .where('group_members.group_id', '=', data.group_id as string)
      .where('group_members.user_id', '=', data.user_id as string)
      .executeTakeFirstOrThrow();
    if (moderator == null) {
      throw new HttpException(
        'Only moderators can post the corporate prayers',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.dbService
      .insertInto('corporate_prayers')
      .values(data)
      .executeTakeFirst();
  }
}
