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

  minutesToString(minutes: number) {
    // Determine the sign
    const sign = minutes >= 0 ? '+' : '-';

    // Absolute value to handle negative minutes
    const absMinutes = Math.abs(minutes);

    // Calculate hours and minutes
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;

    // Format hours and minutes with leading zeros if necessary
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = mins.toString().padStart(2, '0');

    // Return the formatted string
    return `${sign}${formattedHours}:${formattedMinutes}`;
  }

  async fetchCorporatePrayer(prayerId: string) {
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .where('corporate_prayers.id', '=', prayerId)
      .innerJoin('users', 'corporate_prayers.user_id', 'users.uid')
      .leftJoin('contents', 'contents.id', 'users.profile')
      .leftJoin('prayers', 'corporate_prayers.id', 'prayers.corporate_id')
      .innerJoin('groups', 'corporate_prayers.group_id', 'groups.id')
      .leftJoin('reminders', 'reminders.id', 'corporate_prayers.reminder_id')
      .selectAll(['corporate_prayers'])
      .groupBy([
        'corporate_prayers.id',
        'users.uid',
        'contents.path',
        'groups.id',
        'reminders.id',
      ])
      .select(({ fn }) =>
        fn
          .coalesce(fn.count<string>('prayers.id'), sql<string>`0`)
          .as('prayers_count'),
      )
      .select((eb) => [
        eb
          .case()
          .when('reminders.id', 'is not', null)
          .then(
            jsonObjectFrom(
              eb.selectNoFrom([
                'reminders.id',
                'reminders.days',
                'reminders.value',
                'reminders.time',
              ]),
            ),
          )
          .else(null)
          .end()
          .as('reminder'),
        jsonObjectFrom(
          eb.selectNoFrom([
            'users.username',
            'users.name',
            'users.uid',
            'contents.path as profile',
          ]),
        ).as('user'),
        jsonObjectFrom(
          eb.selectNoFrom([
            'groups.id',
            'groups.name',
            'groups.admin_id',
            'groups.membership_type',
          ]),
        ).as('group'),
      ])
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
      .innerJoin('users', 'prayers.user_id', 'users.uid')
      .leftJoin('contents as profile', 'profile.id', 'users.profile')
      .leftJoin('prayer_prays', 'prayers.id', 'prayer_prays.prayer_id')
      .leftJoin('groups', 'prayers.group_id', 'groups.id')
      .leftJoin(
        'corporate_prayers',
        'prayers.corporate_id',
        'corporate_prayers.id',
      )
      .leftJoin('prayer_contents', 'prayer_contents.prayer_id', 'prayers.id')
      .leftJoin('contents', 'prayer_contents.content_id', 'contents.id')
      .groupBy([
        'prayers.id',
        'users.uid',
        'groups.id',
        'corporate_prayers.id',
        'profile.path',
      ])
      .selectAll(['prayers'])
      .select(({ fn }) => [
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(prayer_prays.id)`),
            sql<string>`0`,
          )
          .as('prays_count'),
        fn.max('prayer_prays.created_at').as('has_prayed'),
      ])
      .select((eb) => [
        jsonObjectFrom(
          eb.selectNoFrom([
            'users.uid',
            'users.name',
            'users.username',
            'profile.path as profile',
          ]),
        ).as('user'),
        sql<DB['contents'][]>`jsonb_agg(DISTINCT(contents))`.as('contents'),
        jsonObjectFrom(
          eb
            .selectFrom('prayer_prays')
            .leftJoin('users', 'prayer_prays.user_id', 'users.uid')
            .leftJoin('contents as profile', 'profile.id', 'users.profile')
            .select([
              'users.uid',
              'profile.path as profile',
              'users.username',
              'users.name',
              'prayer_prays.created_at',
            ])
            .whereRef('prayer_prays.prayer_id', '=', 'prayers.id')
            .orderBy('prayer_prays.created_at desc')
            .limit(1),
        ).as('pray'),
        eb
          .case()
          .when('groups.id', 'is not', null)
          .then(
            jsonObjectFrom(
              eb.selectNoFrom([
                'groups.id',
                'groups.name',
                'groups.admin_id',
                'groups.membership_type',
              ]),
            ),
          )
          .else(null)
          .end()
          .as('group'),
        eb
          .case()
          .when('corporate_prayers.id', 'is not', null)
          .then(
            jsonObjectFrom(
              eb.selectNoFrom([
                'corporate_prayers.id',
                'corporate_prayers.title',
                'corporate_prayers.user_id',
                'corporate_prayers.group_id',
              ]),
            ),
          )
          .else(null)
          .end()
          .as('corporate'),
      ])
      .executeTakeFirst();
    if (data == null) {
      return data;
    }
    if (data.user?.profile) {
      data.user.profile = this.storageService.getPublicUrl(data.user.profile);
    }
    if (data.pray?.profile) {
      data.pray.profile = this.storageService.getPublicUrl(data.pray.profile);
    }
    return {
      ...data,
      contents: data.contents
        ?.filter((content) => !!content)
        .map((content) => ({
          ...content,
          path: this.storageService.publicBucket
            .file(content?.path ?? '')
            .publicUrl(),
        })),
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
    const orderOnUser = sql<string>`
    CONCAT (
      -- IF PRAYER IS FROM FOLLOWERS
      CASE
        WHEN uf.id IS NOT NULL
        THEN 1
        ELSE 0
      END +

      -- LENGTH OF PRAYER
      CASE
        WHEN LENGTH(prayers.value) < 50 THEN 0
        WHEN LENGTH(prayers.value) < 150 THEN 0.75
        ELSE 1
      END +

      -- USER HAS PRAYED THIS PRAYER OF A USER BEFORE
      CASE
        WHEN COUNT(upp.id) != 0 THEN 0.75
        ELSE 0
      END +

      -- USER HAS PRAYED PRAYERS OF A USER BEFORE
      CASE
        WHEN COUNT(opp.id) != 0 THEN 0.25
        ELSE 0
      END +

      -- NUMBER OF PRAYS AND SUM OF LENGTH OF PRAYS OF MINE
      LEAST(COUNT(upp.id) * 0.05 + SUM(COALESCE(LENGTH(upp.value), 0)) / 1500, 1) +

      -- NUMBER OF PRAYS AND SUM OF LENGTH OF PRAYS OF ALL
      LEAST(COUNT(pp.id) * 0.03 + SUM(COALESCE(LENGTH(pp.value), 0)) / 200, 1) +

      -- TIME PASSES AFTER PRAY POSTED
      CASE
        WHEN EXTRACT(EPOCH FROM NOW() - MAX(pp.created_at)) < (60 * 60 * 24 * 2) THEN 5 -- 2 DAYS
        ELSE -3
      END +

      -- TIME PASSES AFTER PRAYER POSTED
      CASE
        WHEN EXTRACT(EPOCH FROM NOW() - prayers.created_at) < (60 * 60 * 24 * 3) THEN 3 -- 3 DAYS
        ELSE 0
      END,
      '_',
      prayers.id
    )
  `;
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
          .leftJoin('user_follows as uf', (join) =>
            join
              .onRef('uf.follower_id', '=', 'prayers.user_id')
              .on('uf.following_id', '=', userId!),
          )
          .leftJoin('prayer_prays as pp', 'pp.prayer_id', 'prayers.id')
          .leftJoin('prayers as op', (join) =>
            join
              .onRef('op.id', '!=', 'prayers.id')
              .onRef('op.user_id', '=', 'prayers.user_id'),
          )
          .leftJoin('prayer_prays as opp', (join) =>
            join
              .onRef('opp.prayer_id', '=', 'op.id')
              .on('opp.user_id', '=', userId!),
          )
          .leftJoin('prayer_prays as upp', (join) =>
            join
              .onRef('upp.prayer_id', '=', 'prayers.id')
              .on('upp.user_id', '=', userId!),
          )
          .groupBy(['prayers.id', 'uf.id'])
          .clearOrderBy()
          .select(orderOnUser.as('cursor'))
          .orderBy('cursor desc')
          .$if(!!cursor, (eb) => eb.having(orderOnUser, '<=', cursor!)),
      )
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop();
    return {
      data: data.map(({ id }) => id),
      cursor: newCursor?.cursor ?? null,
    };
  }

  async fetchPrayers({
    groupId,
    userId,
    requestUser,
    cursor,
    corporateId,
    hideAnonymous,
  }: {
    groupId?: string;
    requestUser?: string;
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
      .$if(requestUser == null, (eb) =>
        eb.where((qb) =>
          qb.exists(
            qb
              .selectFrom('groups')
              .whereRef('prayers.group_id', '=', 'groups.id')
              .where('groups.membership_type', '=', 'open'),
          ),
        ),
      )
      .$if(!!requestUser, (qb) =>
        qb.where(({ eb, or, exists }) =>
          or([
            eb('prayers.group_id', 'is', null),
            exists(
              eb
                .selectFrom('groups')
                .whereRef('prayers.group_id', '=', 'groups.id')
                .where('groups.membership_type', '=', 'open'),
            ),
            exists(
              eb
                .selectFrom('group_members')
                .whereRef('group_members.group_id', '=', 'prayers.group_id')
                .where('group_members.user_id', '=', requestUser!)
                .where('group_members.accepted_at', 'is not', null),
            ),
          ]),
        ),
      )
      .$if(!!cursor, (eb) =>
        eb.where(
          sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM prayers.created_at)::text, 20, '0'), prayers.id)`,
          '<=',
          cursor!,
        ),
      )
      .orderBy('prayers.created_at desc')
      .select(['prayers.id'])
      .select(
        sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM prayers.created_at)::text, 20, '0'), prayers.id)`.as(
          'cursor',
        ),
      )
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    return { data: data.map(({ id }) => id), cursor: newCursor };
  }

  async fetchPrayersPrayedByUser({
    userId,
    cursor,
    requestingUserId,
  }: {
    userId: string;
    cursor?: string;
    requestingUserId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('prayers')
      .select(['prayers.id'])
      .leftJoin('prayer_prays', 'prayers.id', 'prayer_prays.prayer_id')
      .leftJoin('groups', 'prayers.group_id', 'groups.id')
      .leftJoin('group_members', 'group_members.group_id', 'groups.id')
      .where('prayer_prays.user_id', '=', userId)
      .select((eb) => eb.fn.max('prayer_prays.created_at').as('latest_pray'))
      .groupBy(['prayers.id', 'prayer_prays.prayer_id'])
      .orderBy('latest_pray desc')
      .orderBy('prayers.id desc')
      .select(
        sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM MAX(prayer_prays.created_at))::text, 20, '0'), prayers.id)`.as(
          'cursor',
        ),
      )
      .$if(!requestingUserId, (qb) =>
        qb.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectNoFrom('groups.id')
                .where('groups.membership_type', '!=', 'open'),
            ),
          ),
        ),
      )
      .$if(!!requestingUserId, (qb) =>
        qb.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectNoFrom('group_members.id')
                .where('group_members.user_id', '=', requestingUserId!)
                .where('groups.membership_type', '!=', 'open')
                .where('group_members.accepted_at', 'is', null),
            ),
          ),
        ),
      )
      .$if(!!cursor, (qb) =>
        qb.where(
          sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM MAX(prayer_prays.created_at)), 20, '0'), prayers.id)`,
          '<=',
          cursor!,
        ),
      )
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    return { data: data.map(({ id }) => id), cursor: newCursor };
  }

  async fetchPrayerPrays({
    prayerId,
    cursor,
  }: {
    prayerId: string;
    cursor?: number;
  }) {
    const data = await this.dbService
      .selectFrom('prayer_prays')
      .where('prayer_prays.prayer_id', '=', prayerId)
      .innerJoin('users', 'users.uid', 'prayer_prays.user_id')
      .leftJoin('contents as profile', 'profile.id', 'users.profile')
      .$if(!!cursor, (eb) => eb.where('prayer_prays.id', '<=', cursor!))
      .orderBy('prayer_prays.id desc')
      .select((eb) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'users.uid',
            'users.name',
            'users.username',
            'profile.path as profile',
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
    data.forEach((d) => {
      if (d.user?.profile) {
        d.user.profile = this.storageService.getPublicUrl(d.user.profile);
      }
    });
    return data;
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
      .select(
        sql<string>`CONCAT(EXTRACT(EPOCH FROM prayers.created_at), prayers.id)`.as(
          'cursor',
        ),
      )
      .orderBy('prayers.created_at desc')
      .$if(!!cursor, (eb) =>
        eb.where(
          sql<string>`CONCAT(EXTRACT(EPOCH FROM prayers.created_at), prayers.id)`,
          '<=',
          cursor!,
        ),
      )
      .select(['id'])
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    return { data: data.map(({ id }) => id), cursor: newCursor };
  }

  async fetchGroupCorporatePrayers({
    groupId,
    cursor,
    timezone = 0,
  }: {
    groupId: string;
    cursor?: string;
    timezone?: number;
  }) {
    const offset = 'UTC' + this.minutesToString(-timezone);
    const sortLogic = sql<string>`
    CONCAT(
      CASE
        WHEN corporate_prayers.ended_at IS NULL
        THEN 0
        ELSE (
          CASE
            WHEN corporate_prayers.ended_at >= (NOW() AT TIME ZONE ${offset})
            THEN ABS(EXTRACT(EPOCH FROM (corporate_prayers.ended_at - (NOW() AT TIME ZONE ${offset}))))
            ELSE 10000000000 + ABS(EXTRACT(EPOCH FROM (corporate_prayers.ended_at - (NOW() AT TIME ZONE ${offset}))))
          END
        )
      END + 
      EXTRACT(EPOCH FROM corporate_prayers.created_at),
      corporate_prayers.id
    )
  `;
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .where('corporate_prayers.group_id', '=', groupId)
      .select(sortLogic.as('cursor'))
      .$if(!!cursor, ({ where }) => where(sortLogic, '<=', cursor!))
      .orderBy(['cursor desc'])
      .select(['id'])
      .limit(6)
      .execute();
    const newCursor = data.length < 6 ? null : data.pop();
    return {
      data: data.map(({ id }) => id),
      cursor: newCursor == null ? null : newCursor.cursor,
    };
  }

  async deletePrayer(prayerId: string) {
    await this.dbService.transaction().execute(async (trx) => {
      const paths = await trx
        .selectFrom('contents')
        .innerJoin('prayer_contents', (join) =>
          join
            .onRef('prayer_contents.content_id', '=', 'contents.id')
            .on('prayer_contents.prayer_id', '=', prayerId),
        )
        .innerJoin('contents', 'contents.id', 'prayer_contents.content_id')
        .select('contents.path')
        .execute();
      Promise.all(
        paths.map(({ path }) =>
          this.storageService.publicBucket
            .file(path)
            .delete({ ignoreNotFound: true }),
        ),
      );
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
    contents,
    ...rest
  }: InsertObject<DB, 'prayers'> & { contents?: number[] | null }) {
    return await this.dbService.transaction().execute(async (trx) => {
      const { id } = await trx
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
      if (contents && contents.length > 0) {
        trx
          .insertInto('prayer_contents')
          .values(
            contents.map((content) => ({
              prayer_id: id,
              content_id: content,
            })),
          )
          .executeTakeFirst();
      }
      return { id };
    });
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
    reminders,
    ...rest
  }: InsertObject<DB, 'corporate_prayers'> & {
    reminders?: Omit<InsertObject<DB, 'reminders'>, 'corporate_id'> | null;
  }) {
    let remindersId: number | undefined | null =
      reminders === null ? null : undefined;
    return this.dbService.transaction().execute(async (trx) => {
      if (reminders?.days && reminders.time && reminders.value) {
        const { id: _remindersId } = await trx
          .insertInto('reminders')
          .values({
            days: reminders.days,
            time: reminders.time,
            value: reminders.value,
          })
          .returning('reminders.id')
          .executeTakeFirstOrThrow();
        remindersId = _remindersId;
      }
      if (rest.id != null) {
        const { reminder_id } = await trx
          .selectFrom('corporate_prayers')
          .select('corporate_prayers.reminder_id')
          .where('corporate_prayers.id', '=', rest.id as string)
          .executeTakeFirstOrThrow();
        if (reminder_id != null) {
          trx
            .deleteFrom('reminders')
            .where('reminders.id', '=', reminder_id)
            .executeTakeFirst();
        }
      }
      const { id } = await trx
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
          reminder_id: remindersId,
          ...rest,
        }))
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            description: rest.description,
            started_at: rest.started_at,
            ended_at: rest.ended_at,
            title: rest.title,
            prayers: rest.prayers,
            reminder_id: remindersId,
          }),
        )
        .returning(['corporate_prayers.id'])
        .executeTakeFirstOrThrow();
      return { id };
    });
  }

  async fetchJoinStatusFromPrayer(prayerId: string, userId?: string) {
    const data = await this.dbService
      .selectFrom('prayers')
      .leftJoin('groups', 'prayers.group_id', 'groups.id')
      .leftJoin('group_members', 'prayers.group_id', 'group_members.group_id')
      .leftJoin('prayer_prays', 'prayer_prays.prayer_id', 'prayers.id')
      .where('prayers.id', '=', prayerId)
      .$if(!!userId, (qb) =>
        qb
          .where('prayer_prays.user_id', '=', userId!)
          .where('group_members.user_id', '=', userId!)
          .select('group_members.accepted_at'),
      )
      .groupBy([
        'prayers.id',
        'groups.id',
        'group_members.id',
        'prayer_prays.id',
      ])
      .select([
        'prayers.user_id',
        'prayers.group_id',
        'groups.membership_type',
        'prayer_prays.id as hasPrayed',
      ])
      .executeTakeFirst();
    return {
      canView:
        data?.user_id === userId ||
        data?.group_id == null ||
        !(data?.membership_type !== 'open' && data?.accepted_at == null) ||
        data?.hasPrayed != null,
      canPost: data?.accepted_at == null,
    };
  }

  async fetchJoinStatusFromCorporatePrayer(prayerId: string, userId?: string) {
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .leftJoin('groups', 'corporate_prayers.group_id', 'groups.id')
      .where('corporate_prayers.id', '=', prayerId)
      .$if(!!userId, (qb) =>
        qb
          .leftJoin('group_members', (join) =>
            join
              .onRef(
                'group_members.group_id',
                '=',
                'corporate_prayers.group_id',
              )
              .on('group_members.user_id', '=', userId!),
          )
          .leftJoin('prayers', (join) =>
            join
              .onRef('prayers.group_id', '=', 'corporate_prayers.group_id')
              .on('prayers.user_id', '=', userId!),
          )
          .select(({ fn }) => [
            'group_members.accepted_at',
            fn.count<string>('prayers.id').as('hasPosted'),
          ])
          .groupBy(['group_members.id']),
      )
      .select(['groups.membership_type', 'corporate_prayers.user_id'])
      .groupBy(['corporate_prayers.id', 'groups.id'])
      .executeTakeFirstOrThrow();
    return {
      canView:
        !(data?.membership_type !== 'open' && data?.accepted_at == null) ||
        parseInt(data?.hasPosted ?? '0', 10) > 0 ||
        data.user_id === userId,
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
