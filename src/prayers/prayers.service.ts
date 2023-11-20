import { Injectable } from '@nestjs/common';
import { InsertObject, sql } from 'kysely';
import { KyselyService } from 'src/kysely/kysely.service';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { StorageService } from 'src/storage/storage.service';
import { DB } from 'prisma/generated/types';

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
    if (data.user?.profile) {
      data.user.profile = this.storageService.getPublicUrl(data.user.profile);
    }
    return {
      ...data,
      prayers_count: parseInt(data?.prayers ?? '0', 10),
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
            .select([
              'corporate_prayers.id',
              'corporate_prayers.title',
              'corporate_prayers.user_id',
              'corporate_prayers.group_id',
            ]),
        ).as('corporate'),
      )
      .executeTakeFirst();
    return {
      ...data,
      media: data?.media
        ? this.storageService.publicBucket.file(data.media).publicUrl()
        : null,
      prays_count: parseInt(data?.prays_count ?? '0', 10),
      user_id: data?.anon && data.user_id !== userId ? null : data?.user_id,
      user: data?.anon && data.user_id !== userId ? null : data?.user,
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
      .where('prayers.group_id', 'is', null)
      .orderBy('prayers.created_at desc')
      .orderBy((eb) =>
        eb
          .selectFrom('prayer_prays')
          .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
          .orderBy('prayer_prays.created_at desc')
          .select('prayer_prays.created_at')
          .limit(1),
      )
      .$if(!!userId, (qb) =>
        qb
          .clearOrderBy()
          .select(
            sql<number>`
        -- IF PRAYER IS FROM FOLLOWERS
        CASE
          WHEN EXISTS (
            SELECT uf.id
            FROM user_follows uf
            WHERE uf.following_id = ${userId}
            AND uf.follower_id = prayers.user_id
          ) THEN 1
          ELSE 0
        END +

        -- LENGTH OF PRAYER
        CASE
          WHEN LENGTH(prayers.value) < 50
          THEN 0
          WHEN LENGTH(prayers.value) < 150
          THEN 0.75
          ELSE 1
        END +

        -- USER HAS PRAYED THIS PRAYER OF A USER BEFORE
        CASE
          WHEN EXISTS ( 
            SELECT id
            FROM prayer_prays
            WHERE prayer_prays.user_id = ${userId} AND prayer_prays.prayer_id = prayers.id
          ) THEN 0.25
          ELSE 0
        END +

        -- USER HAS PRAYED PRAYERS OF A USER BEFORE
        CASE
          WHEN EXISTS ( 
            SELECT (
              SELECT id
              FROM prayer_prays
              WHERE prayer_prays.prayer_id = tp.id AND prayer_prays.user_id = ${userId}
            ) AS pp
            FROM prayers tp
            WHERE tp.id != prayers.id
          ) THEN 0.5
          ELSE 0
        END +

        -- NUMBER OF PRAYS AND SUM OF LENGTH OF PRAYS OF MINE
        (
          SELECT COUNT(prayer_prays.id) * 0.1 + SUM(COALESCE(LENGTH(prayer_prays.value), 0)) / 150
          FROM prayer_prays
          WHERE prayer_prays.prayer_id = prayers.id AND prayer_prays.user_id = prayers.user_id
        ) +

        -- NUMBER OF PRAYS AND SUM OF LENGTH OF PRAYS OF ALL
        (
          SELECT COUNT(prayer_prays.id) * 0.05 + SUM(COALESCE(LENGTH(prayer_prays.value), 0)) / 200
          FROM prayer_prays
          WHERE prayer_prays.prayer_id = prayers.id
        ) +
        
        -- TIME PASSES AFTER PRAY POSTED
        (
          SELECT EXTRACT(EPOCH FROM prayer_prays.created_at - NOW())
          FROM prayer_prays
          WHERE prayer_prays.prayer_id = prayers.id
          ORDER BY prayer_prays.created_at DESC
          LIMIT 1
        ) / (60 * 60 * 24 * 1.5) +

        -- TIME PASSES AFTER PRAYER POSTED
        EXTRACT(EPOCH FROM prayers.created_at - NOW()) / (60 * 60 * 24 * 7)
      `.as('weight'),
          )
          .orderBy('weight desc'),
      )
      .$if(!!cursor, (eb) => eb.where('prayers.id', '=', cursor!))
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
    hideAnonymous,
  }: {
    groupId?: string;
    requestingUserId?: string;
    userId?: string;
    corporateId?: string;
    cursor?: string;
    hideAnonymous?: boolean;
  }) {
    const data = await this.dbService
      .selectFrom('prayers')
      .$if(!!groupId, (eb) => eb.where('group_id', '=', groupId!))
      .$if(!!userId, (eb) => eb.where('user_id', '=', userId!))
      .$if(!!corporateId, (eb) => eb.where('corporate_id', '=', corporateId!))
      .$if(!!hideAnonymous, (eb) => eb.where('anon', '=', false))
      .$if(requestingUserId == null, (eb) =>
        eb.where((qb) =>
          qb.exists(
            qb
              .selectFrom('groups')
              .whereRef('prayers.group_id', '=', 'groups.id')
              .where('groups.membership_type', '!=', 'private'),
          ),
        ),
      )
      .$if(!!requestingUserId, (qb) =>
        qb.where(({ eb, or, exists }) =>
          or([
            eb('prayers.group_id', 'is', null),
            exists(
              eb
                .selectFrom('groups')
                .whereRef('prayers.group_id', '=', 'groups.id')
                .where('groups.membership_type', '!=', 'private'),
            ),
            exists(
              eb
                .selectFrom('group_members')
                .whereRef('group_members.group_id', '=', 'prayers.group_id')
                .where('group_members.user_id', '=', requestingUserId!)
                .where('group_members.accepted_at', 'is not', null),
            ),
          ]),
        ),
      )
      .$if(!!cursor, (eb) => eb.where('id', '=', cursor!))
      .orderBy('prayers.created_at desc')
      .select(['prayers.id'])
      .limit(11)
      .execute();
    return data.map(({ id }) => id);
  }

  async fetchPrayersPrayedByUser(userId: string, cursor?: string) {
    const data = await this.dbService
      .selectFrom('prayers')
      .select(['prayers.id'])
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('prayer_prays')
            .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
            .where('prayer_prays.user_id', '=', userId),
        ),
      )
      .orderBy((eb) =>
        eb
          .selectFrom('prayer_prays')
          .select('prayer_prays.created_at')
          .orderBy('prayer_prays.created_at desc')
          .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
          .where('prayer_prays.user_id', '=', userId)
          .limit(1),
      )
      .$if(!!cursor, (qb) => qb.where('prayers.id', '=', cursor!))
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
      .$if(!!cursor, (eb) => eb.where('prayer_prays.id', '=', cursor!))
      .orderBy('prayer_prays.created_at desc')
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .whereRef('users.uid', '=', 'prayer_prays.user_id')
            .select([
              'users.name',
              'users.uid',
              'users.profile',
              'users.username',
            ]),
        ).as('user'),
      )
      .select([
        'prayer_prays.id',
        'prayer_prays.created_at',
        'prayer_prays.value',
      ])
      .limit(11)
      .execute();
  }

  async fetchPrayersByUserGroup({
    userId,
    cursor,
  }: {
    userId: string;
    cursor?: string;
  }) {
    const data = await this.dbService
      .selectFrom('prayers')
      .where((eb) =>
        eb(
          'group_id',
          'in',
          eb
            .selectFrom('group_members')
            .where('group_members.user_id', '=', userId!)
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
      .$if(!!cursor, (eb) => eb.where('prayers.id', '=', cursor!))
      .select(['id'])
      .limit(11)
      .execute();
    return data.map(({ id }) => id);
  }

  async fetchGroupCorporatePrayers({
    groupId,
    cursor,
    offset,
  }: {
    groupId: string;
    cursor?: string;
    offset?: number;
  }) {
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .where('corporate_prayers.group_id', '=', groupId)
      .$if(!!cursor, ({ where }) => where('id', '=', cursor!))
      .$if(!!offset, (qb) =>
        qb.orderBy((eb) =>
          eb
            .case()
            .when('corporate_prayers.ended_at', 'is', null)
            .then(sql<number>`0`)
            .when(
              sql`corporate_prayers.ended_at >= (NOW() AT TIME ZONE 'UTC' AT TIME ZONE ${offset})`,
            )
            .then(
              sql<number>`ABS(EXTRACT(EPOCH FROM (corporate_prayers.ended_at - (NOW() AT TIME ZONE 'UTC' AT TIME ZONE ${offset}))))`,
            )
            .else(
              sql<number>`10000000000 + ABS(EXTRACT(EPOCH FROM (corporate_prayers.ended_at - (NOW() AT TIME ZONE 'UTC' AT TIME ZONE ${offset}))))`,
            )
            .end(),
        ),
      )
      .orderBy('corporate_prayers.ended_at desc')
      .orderBy('corporate_prayers.created_at desc')
      .select(['id'])
      .limit(6)
      .execute();
    return data.map(({ id }) => id);
  }

  async deletePrayer(prayerId: string) {
    await this.dbService.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('prayers')
        .where('prayers.id', '=', prayerId)
        .executeTakeFirst();

      await trx
        .deleteFrom('prayer_prays')
        .where('prayer_prays.prayer_id', '=', prayerId)
        .executeTakeFirst();
    });
  }

  async deleteCorporatePrayer(prayerId: string) {
    await this.dbService.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('corporate_prayers')
        .where('corporate_prayers.id', '=', prayerId)
        .executeTakeFirst();
      await trx
        .updateTable('prayers')
        .where('prayers.corporate_id', '=', prayerId)
        .set({ corporate_id: null })
        .executeTakeFirst();
    });
  }

  async createPrayer({
    user_id,
    group_id,
    corporate_id,
    ...rest
  }: InsertObject<DB, 'prayers'>) {
    return this.dbService
      .insertInto('prayers')
      .values((eb) => ({
        user_id: eb
          .selectFrom('users')
          .where('users.uid', '=', user_id)
          .select('users.uid'),
        group_id: group_id
          ? eb
              .selectFrom('groups')
              .where('groups.id', '=', group_id)
              .select('groups.id')
          : null,
        corporate_id: corporate_id
          ? eb
              .selectFrom('corporate_prayers')
              .where('corporate_prayers.id', '=', corporate_id)
              .select('corporate_prayers.id')
          : null,
        ...rest,
      }))
      .returning('prayers.id')
      .executeTakeFirstOrThrow();
  }

  async fetchLatestPrayerPray(prayerId: string, userId: string) {
    return this.dbService
      .selectFrom('prayer_prays')
      .where('prayer_prays.prayer_id', '=', prayerId)
      .where('prayer_prays.user_id', '=', userId)
      .orderBy('prayer_prays.created_at desc')
      .select('prayer_prays.created_at')
      .limit(1)
      .executeTakeFirst();
  }

  async createPrayerPray({
    prayerId,
    userId,
    value,
  }: {
    prayerId: string;
    userId: string;
    value?: string;
  }) {
    await this.dbService
      .insertInto('prayer_prays')
      .values({
        prayer_id: prayerId,
        user_id: userId,
        created_at: new Date(),
        value,
      })
      .executeTakeFirst();
  }

  async createCorporatePrayer({
    user_id,
    group_id,
    ...rest
  }: InsertObject<DB, 'corporate_prayers'>) {
    return this.dbService
      .insertInto('corporate_prayers')
      .values((eb) => ({
        user_id: eb
          .selectFrom('users')
          .where('users.uid', '=', user_id)
          .select('users.uid'),
        group_id: eb
          .selectFrom('groups')
          .where('groups.id', '=', group_id)
          .select('groups.id'),
        ...rest,
      }))
      .returning('corporate_prayers.id')
      .executeTakeFirstOrThrow();
  }

  async fetchJoinStatusFromPrayer(prayerId: string, userId?: string) {
    const data = await this.dbService
      .selectFrom('prayers')
      .leftJoin('groups', 'prayers.group_id', 'groups.id')
      .where('prayers.id', '=', prayerId)
      .$if(!!userId, (qb) =>
        qb.select((eb) =>
          eb
            .selectFrom('group_members')
            .whereRef('prayers.group_id', '=', 'group_members.group_id')
            .where('group_members.user_id', '=', userId!)
            .select('group_members.accepted_at')
            .as('accepted_at'),
        ),
      )
      .select(['groups.membership_type'])
      .executeTakeFirst();
    return {
      canView: !(
        data?.membership_type === 'private' && data.accepted_at == null
      ),
      canPost: data?.accepted_at == null,
    };
  }

  async fetchJoinStatusFromCorporatePrayer(prayerId: string, userId?: string) {
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .leftJoin('groups', 'corporate_prayers.group_id', 'groups.id')
      .where('corporate_prayers.id', '=', prayerId)
      .$if(!!userId, (qb) =>
        qb.select((eb) =>
          eb
            .selectFrom('group_members')
            .whereRef(
              'group_members.group_id',
              '=',
              'corporate_prayers.group_id',
            )
            .where('group_members.user_id', '=', userId!)
            .select('group_members.accepted_at')
            .as('accepted_at'),
        ),
      )
      .select(['groups.membership_type'])
      .executeTakeFirst();
    return {
      canView: !(
        data?.membership_type === 'private' && data.accepted_at == null
      ),
      canPost: data?.accepted_at == null,
    };
  }

  fetchPrayerPray(prayId: number) {
    return this.dbService
      .selectFrom('prayer_prays')
      .where('prayer_prays.id', '=', prayId)
      .selectAll()
      .executeTakeFirst();
  }

  deletePrayerPray(prayId: number) {
    return this.dbService
      .deleteFrom('prayer_prays')
      .where('prayer_prays.id', '=', prayId)
      .executeTakeFirst();
  }
}
