import { Injectable } from '@nestjs/common';
import { InsertObject, sql } from 'kysely';
import { KyselyService } from 'src/kysely/kysely.service';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { StorageService } from 'src/storage/storage.service';
import { DB } from 'prisma/generated/types';
import { OperationNotAllowedError } from 'src/errors/common.error';
import { RemindersService } from 'src/reminders/reminders.service';

@Injectable()
export class PrayersService {
  constructor(
    private dbService: KyselyService,
    private storageService: StorageService,
    private remindersService: RemindersService,
  ) {}

  async fetchCorporatePrayer(prayerId: string) {
    const data = await this.dbService
      .selectFrom('corporate_prayers')
      .where('corporate_prayers.id', '=', prayerId)
      .innerJoin('users', 'corporate_prayers.user_id', 'users.uid')
      .leftJoin('contents', 'contents.id', 'users.profile_id')
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
      prayers_count: parseInt(data?.prayers_count ?? '0', 10),
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
      .leftJoin('contents as profile', 'profile.id', 'users.profile_id')
      .leftJoin('groups', 'prayers.group_id', 'groups.id')
      .leftJoin('group_pinned_prayers', (join) =>
        join
          .onRef('group_pinned_prayers.group_id', '=', 'prayers.group_id')
          .onRef('group_pinned_prayers.prayer_id', '=', 'prayers.id'),
      )
      .leftJoin(
        'corporate_prayers',
        'prayers.corporate_id',
        'corporate_prayers.id',
      )
      .leftJoin('prayer_prays', 'prayers.id', 'prayer_prays.prayer_id')
      .leftJoin('prayer_contents', 'prayer_contents.prayer_id', 'prayers.id')
      .leftJoin('contents', 'prayer_contents.content_id', 'contents.id')
      .leftJoin(
        'prayer_bible_verses',
        'prayer_bible_verses.prayer_id',
        'prayers.id',
      )
      .leftJoin(
        'bible_verses',
        'bible_verses.verse_id',
        'prayer_bible_verses.verse_id',
      )
      .groupBy([
        'prayers.id',
        'users.uid',
        'groups.id',
        'group_pinned_prayers.id',
        'corporate_prayers.id',
        'profile.path',
      ])
      .$if(!!userId, (eb) =>
        eb
          .leftJoin('prayer_prays as user_prayed', (join) =>
            join
              .onRef('user_prayed.prayer_id', '=', 'prayers.id')
              .on('prayer_prays.user_id', '=', userId!),
          )
          .leftJoin('group_members', (join) =>
            join
              .onRef('group_members.group_id', '=', 'groups.id')
              .on('group_members.user_id', '=', userId!),
          )
          .groupBy(['group_members.id'])
          .select(({ fn }) => [
            'group_members.moderator as moderator',
            fn.max('user_prayed.created_at').as('has_prayed'),
          ]),
      )
      .selectAll(['prayers'])
      .select(({ fn }) => [
        'group_pinned_prayers.user_id as pinned_by',
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(prayer_prays.id)`),
            sql<string>`0`,
          )
          .as('prays_count'),
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
        sql<DB['bible_verses'][]>`
        array_agg(bible_verses.verse_id ORDER BY prayer_bible_verses.id ASC)
        `.as('verses'),
        sql<DB['contents'][]>`jsonb_agg(DISTINCT(contents))`.as('contents'),
        jsonObjectFrom(
          eb
            .selectFrom('prayer_prays')
            .leftJoin('users', 'prayer_prays.user_id', 'users.uid')
            .leftJoin('contents as profile', 'profile.id', 'users.profile_id')
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
      group: !!data.group ? { ...data.group, moderator: data.moderator } : null,
      contents: data.contents
        ?.filter((content) => !!content)
        .map((content) => ({
          ...content,
          path: this.storageService.publicBucket
            .file(content?.path ?? '')
            .publicUrl(),
        })),
      verses: [...new Set(data.verses?.filter((verse) => !!verse))],
      prays_count: parseInt(data?.prays_count ?? '0', 10),
      user_id: data?.anon && data.user_id !== userId ? null : data?.user_id,
      user: data?.anon && data.user_id !== userId ? null : data?.user,
    };
  }

  async fetchHomeFeed({
    userId,
    cursor,
    mode = 'home',
  }: {
    userId?: string;
    cursor?: string;
    mode?: 'home' | 'followers' | 'neighbor';
  }) {
    const orderOnUser = sql<string>`
    -- TIME PASSES AFTER PRAY POSTED
    EXTRACT(EPOCH FROM(prayers.created_at - NOW()))
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
          .leftJoin('user_blocks', (join) =>
            join
              .onRef('user_blocks.user_id', '=', 'prayers.user_id')
              .on('user_blocks.target_id', '=', userId!),
          )
          .where('user_blocks.id', 'is', null)
          .groupBy(['prayers.id'])
          .clearOrderBy()
          .select(orderOnUser.as('cursor'))
          .orderBy(['cursor desc', 'prayers.id desc'])
          .$if(!!cursor, (eb) => eb.having(orderOnUser, '<=', cursor!)),
      )
      .$if(!!userId && mode === 'followers', (qb) =>
        qb
          .leftJoin('user_follows', (join) =>
            join
              .onRef('user_follows.follower_id', '=', 'prayers.user_id')
              .on('user_follows.following_id', '=', userId!),
          )
          .groupBy('user_follows.id')
          .where('user_follows.id', 'is not', null),
      )
      .$if(!!userId && mode === 'neighbor', (qb) =>
        qb
          .innerJoin(
            'prayers as prayed_prayers',
            'prayed_prayers.user_id',
            'prayers.user_id',
          )
          .innerJoin('prayer_prays', (join) =>
            join
              .on('prayer_prays.user_id', '=', userId!)
              .onRef('prayer_prays.prayer_id', '=', 'prayed_prayers.id'),
          )
          .where('prayers.user_id', '!=', userId!),
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
    requestUserId,
    cursor,
    corporateId,
    hideAnonymous,
  }: {
    groupId?: string;
    requestUserId?: string;
    userId?: string;
    corporateId?: string;
    cursor?: string;
    hideAnonymous?: boolean;
  }) {
    const innerCursor = sql<string>`
      CONCAT(
        CASE
          WHEN group_pinned_prayers.user_id IS NOT NULL THEN
            '1'
          ELSE
            '0'
        END,
        LPAD(EXTRACT(EPOCH FROM prayers.created_at)::text, 20, '0'), 
        prayers.id
      )
    `;
    const data = await this.dbService
      .selectFrom('prayers')
      .leftJoin('group_pinned_prayers', (join) =>
        join
          .onRef('group_pinned_prayers.group_id', '=', 'prayers.group_id')
          .onRef('group_pinned_prayers.prayer_id', '=', 'prayers.id'),
      )
      .$if(!!groupId, (eb) => eb.where('prayers.group_id', '=', groupId!))
      .$if(!!userId, (eb) => eb.where('prayers.user_id', '=', userId!))
      .$if(!!corporateId, (eb) =>
        eb.where('prayers.corporate_id', '=', corporateId!),
      )
      .$if(!!hideAnonymous, (eb) => eb.where('prayers.anon', '=', false))
      .$if(requestUserId == null, (eb) =>
        eb.where((qb) =>
          qb.exists(
            qb
              .selectFrom('groups')
              .whereRef('prayers.group_id', '=', 'groups.id')
              .where('groups.membership_type', '=', 'open'),
          ),
        ),
      )
      .$if(!!requestUserId, (qb) =>
        qb
          .leftJoin('user_blocks', (join) =>
            join
              .onRef('user_blocks.user_id', '=', 'prayers.user_id')
              .on('user_blocks.target_id', '=', requestUserId!),
          )
          .where(({ eb, or, exists, and }) =>
            and([
              eb('user_blocks.id', 'is', null),
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
                    .where('group_members.user_id', '=', requestUserId!)
                    .where('group_members.accepted_at', 'is not', null),
                ),
              ]),
            ]),
          ),
      )
      .orderBy(sql`${innerCursor} desc`)
      .$if(!!cursor, (eb) => eb.where(innerCursor, '<=', cursor!))
      .select(['prayers.id'])
      .select(innerCursor.as('cursor'))
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    return { data: data.map(({ id }) => id), cursor: newCursor };
  }

  async fetchPrayersPrayedByUser({
    userId,
    cursor,
    requestUserId,
  }: {
    userId: string;
    cursor?: string;
    requestUserId?: string;
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
      .$if(!requestUserId, (qb) =>
        qb.where(({ or, eb }) =>
          or([
            eb('prayers.group_id', 'is', null),
            eb('groups.membership_type', '!=', 'open'),
          ]),
        ),
      )
      .$if(!!requestUserId, (qb) =>
        qb
          .leftJoin('user_blocks', (join) =>
            join
              .on('user_blocks.target_id', '=', requestUserId!)
              .onRef('user_blocks.user_id', '=', 'prayers.user_id'),
          )
          .where('user_blocks.id', 'is', null),
      )
      .$if(!!requestUserId, (qb) =>
        qb.where(({ or, eb, exists }) =>
          or([
            eb('prayers.group_id', 'is', null),
            eb('groups.membership_type', '=', 'open'),
            exists(
              eb
                .selectNoFrom('group_members.id')
                .where('group_members.accepted_at', 'is not', null)
                .where('group_members.user_id', '=', requestUserId!),
            ),
          ]),
        ),
      )
      .$if(!!cursor, (qb) =>
        qb.having(
          sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM MAX(prayer_prays.created_at))::text, 20, '0'), prayers.id)`,
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
    requestUserId,
    cursor,
  }: {
    prayerId: string;
    requestUserId?: string;
    cursor?: number;
  }) {
    const data = await this.dbService
      .selectFrom('prayer_prays')
      .where('prayer_prays.prayer_id', '=', prayerId)
      .innerJoin('users', 'users.uid', 'prayer_prays.user_id')
      .leftJoin('contents as profile', 'profile.id', 'users.profile_id')
      .$if(!!cursor, (eb) => eb.where('prayer_prays.id', '<=', cursor!))
      .$if(!!requestUserId, (qb) =>
        qb
          .leftJoin('user_blocks', (join) =>
            join
              .on('user_blocks.target_id', '=', requestUserId!)
              .onRef('user_blocks.user_id', '=', 'prayer_prays.user_id'),
          )
          .where('user_blocks.id', 'is', null),
      )
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
          'prayers.group_id',
          'in',
          eb
            .selectFrom('group_members')
            .where('group_members.user_id', '=', userId!)
            .where('group_members.accepted_at', 'is not', null)
            .distinct()
            .select('group_members.group_id'),
        ),
      )
      .select(
        sql<string>`CONCAT(EXTRACT(EPOCH FROM prayers.created_at), prayers.id)`.as(
          'cursor',
        ),
      )
      .leftJoin('user_blocks', (join) =>
        join
          .on('user_blocks.target_id', '=', userId!)
          .onRef('user_blocks.user_id', '=', 'prayers.user_id'),
      )
      .where('user_blocks.id', 'is', null)
      .orderBy('prayers.created_at desc')
      .$if(!!cursor, (eb) =>
        eb.where(
          sql<string>`CONCAT(EXTRACT(EPOCH FROM prayers.created_at), prayers.id)`,
          '<=',
          cursor!,
        ),
      )
      .select(['prayers.id'])
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    return { data: data.map(({ id }) => id), cursor: newCursor };
  }

  async fetchGroupCorporatePrayers({
    groupId,
    requestUserId,
    cursor,
    timezone = 0,
  }: {
    groupId: string;
    requestUserId?: string;
    cursor?: string;
    timezone?: number;
  }) {
    const offset = 'UTC' + this.remindersService.minutesToString(-timezone);
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
      .$if(!!requestUserId, (qb) =>
        qb
          .leftJoin('user_blocks', (join) =>
            join
              .on('user_blocks.target_id', '=', requestUserId!)
              .onRef('user_blocks.user_id', '=', 'corporate_prayers.user_id'),
          )
          .where('user_blocks.id', 'is', null),
      )
      .select(sortLogic.as('cursor'))
      .$if(!!cursor, ({ where }) => where(sortLogic, '<=', cursor!))
      .orderBy(['cursor desc'])
      .select(['corporate_prayers.id'])
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
        .select('contents.path')
        .execute();
      Promise.all(
        paths.map(({ path }) =>
          this.storageService.publicBucket
            .file(path)
            .delete({ ignoreNotFound: true }),
        ),
      );
      trx
        .deleteFrom('prayer_contents')
        .where('prayer_id', '=', prayerId)
        .executeTakeFirst();
      trx
        .deleteFrom('group_pinned_prayers')
        .where('group_pinned_prayers.prayer_id', '=', prayerId)
        .executeTakeFirst();
      trx
        .deleteFrom('prayer_bible_verses')
        .where('prayer_id', '=', prayerId)
        .executeTakeFirst();
      trx
        .deleteFrom('prayers')
        .where('prayers.id', '=', prayerId)
        .executeTakeFirst();
      trx
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
    verses,
    ...rest
  }: InsertObject<DB, 'prayers'> & {
    contents?: number[] | null;
    verses?: number[] | null;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      if (group_id != null) {
        const hasBanned = await trx
          .selectFrom('group_member_bans')
          .where('group_member_bans.group_id', '=', group_id as string)
          .where('group_member_bans.user_id', '=', user_id as string)
          .executeTakeFirst();
        if (hasBanned != null) {
          throw new OperationNotAllowedError(
            'Member has been banned from the group',
          );
        }
      }
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
      if (verses && verses.length > 0) {
        trx
          .insertInto('prayer_bible_verses')
          .values(
            verses.map((verse) => ({
              prayer_id: id,
              verse_id: verse,
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
    requestUserId,
    value,
  }: {
    prayerId: string;
    userId: string;
    requestUserId: string;
    value?: string | null;
  }) {
    return this.dbService.transaction().execute(async (trx) => {
      const isBanned = await trx
        .selectFrom('prayers')
        .innerJoin('groups', 'prayers.group_id', 'groups.id')
        .innerJoin('group_member_bans', (join) =>
          join
            .onRef('group_member_bans.group_id', '=', 'prayers.group_id')
            .on('group_member_bans.user_id', '=', requestUserId),
        )
        .executeTakeFirst();
      if (isBanned) {
        throw new OperationNotAllowedError(
          'Member has been banned from the group',
        );
      }
      return trx
        .insertInto('prayer_prays')
        .values({
          prayer_id: prayerId,
          user_id: userId,
          created_at: new Date(),
          value,
        })
        .returning('prayer_prays.id')
        .executeTakeFirstOrThrow();
    });
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

      if (rest.id == null) {
        trx
          .insertInto('notification_corporate_settings')
          .values({
            corporate_id: id,
            user_id: user_id as string,
            on_post: true,
            on_reminder: true,
          })
          .executeTakeFirst();
      }

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

  async fetchPrayerPray(prayId: number) {
    const data = await this.dbService
      .selectFrom('prayer_prays')
      .innerJoin('users', 'users.uid', 'prayer_prays.user_id')
      .leftJoin('contents', 'contents.id', 'users.profile_id')
      .where('prayer_prays.id', '=', prayId)
      .selectAll(['prayer_prays'])
      .select(({ eb }) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'users.uid',
            'users.profile_id',
            'users.username',
            'users.name',
          ]),
        ).as('user'),
      )
      .select('contents.path')
      .executeTakeFirst();
    if (data == null) {
      return null;
    }
    return {
      ...data,
      user: {
        ...data.user,
        profile:
          data.path == null
            ? null
            : this.storageService.publicBucket.file(data.path).publicUrl(),
      },
    };
  }

  deletePrayerPray(prayId: number) {
    return this.dbService
      .deleteFrom('prayer_prays')
      .where('prayer_prays.id', '=', prayId)
      .executeTakeFirst();
  }

  pinnedGroupPrayer(prayerId: string, requestUserId: string, value: boolean) {
    return this.dbService.transaction().execute(async (trx) => {
      const { moderator, group_id } = await trx
        .selectFrom('prayers')
        .innerJoin('groups', 'groups.id', 'prayers.group_id')
        .innerJoin('group_members', (join) =>
          join
            .onRef('group_members.group_id', '=', 'prayers.group_id')
            .on('group_members.user_id', '=', requestUserId),
        )
        .where('prayers.id', '=', prayerId)
        .select(['group_members.moderator', 'groups.id as group_id'])
        .executeTakeFirstOrThrow();
      if (moderator == null) {
        throw new OperationNotAllowedError('Only moderators can pin a prayer');
      }
      if (value) {
        return trx
          .insertInto('group_pinned_prayers')
          .values({ group_id, user_id: requestUserId, prayer_id: prayerId })
          .onConflict((oc) =>
            oc
              .column('group_id')
              .doUpdateSet({ prayer_id: prayerId, user_id: requestUserId }),
          )
          .executeTakeFirst();
      }
      return trx
        .deleteFrom('group_pinned_prayers')
        .where('group_id', '=', group_id)
        .where('prayer_id', '=', prayerId)
        .executeTakeFirst();
    });
  }
}
