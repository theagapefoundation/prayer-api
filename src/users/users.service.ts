import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auth } from 'firebase-admin';
import { UpdateObject, sql } from 'kysely';
import { DB } from 'prisma/generated/types';
import {
  NotEmptyResource,
  OperationNotAllowedError,
} from 'src/errors/common.error';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class UsersService {
  constructor(
    private dbService: KyselyService,
    private storageService: StorageService,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async handleFollowings({
    follower,
    following,
    value,
  }: {
    following: string;
    follower: string;
    value: boolean;
  }) {
    const block = await this.dbService
      .selectFrom('user_blocks')
      .where(({ or, eb }) =>
        or([
          eb('user_blocks.target_id', '=', following).and(
            eb('user_blocks.user_id', '=', follower),
          ),
          eb('user_blocks.user_id', '=', following).and(
            eb('user_blocks.target_id', '=', follower),
          ),
        ]),
      )
      .executeTakeFirst();
    if (block != null) {
      throw new OperationNotAllowedError('Failed to follow the user');
    }
    if (value) {
      return this.dbService
        .insertInto('user_follows')
        .values({ follower_id: follower, following_id: following })
        .onConflict((oc) =>
          oc.columns(['follower_id', 'following_id']).doNothing(),
        )
        .executeTakeFirst();
    }
    return this.dbService
      .deleteFrom('user_follows')
      .where('following_id', '=', following)
      .where('follower_id', '=', follower)
      .executeTakeFirst();
  }

  async handleBlocks({
    userId,
    targetId,
    value,
  }: {
    userId: string;
    targetId: string;
    value: boolean;
  }) {
    if (value) {
      await this.dbService
        .deleteFrom('user_follows')
        .where('user_follows.following_id', '=', userId)
        .where('user_follows.follower_id', '=', targetId)
        .executeTakeFirst();
      await this.dbService
        .insertInto('user_blocks')
        .values({ user_id: userId, target_id: targetId })
        .executeTakeFirst();
      return;
    }
    return this.dbService
      .deleteFrom('user_blocks')
      .where('user_id', '=', userId)
      .where('target_id', '=', targetId)
      .executeTakeFirst();
  }

  async searchUsers({
    query,
    cursor,
    requestUser,
    excludeGroupId,
  }: {
    query?: string;
    cursor?: string;
    requestUser?: string;
    excludeGroupId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('users')
      .leftJoin('contents as profile', 'profile.id', 'users.profile')
      .$if(!!excludeGroupId, (qb) =>
        qb
          .leftJoin('group_members', (join) =>
            join
              .onRef('group_members.user_id', '=', 'users.uid')
              .on('group_members.group_id', '=', excludeGroupId!),
          )
          .where('group_members.id', 'is', null),
      )
      .$if(!!requestUser, (qb) =>
        qb
          .leftJoin('user_blocks', (join) =>
            join
              .onRef('user_blocks.user_id', '=', 'users.uid')
              .on('user_blocks.target_id', '=', requestUser!),
          )
          .where('user_blocks.id', 'is', null),
      )
      .$if(!!query, (qb) =>
        qb.where(({ or, eb }) =>
          or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%${query}%`),
          ]),
        ),
      )
      .select([
        'profile.path as profile',
        'users.uid',
        'users.username',
        'users.name',
      ])
      .select(
        sql<string>`CONCAT(EXTRACT(EPOCH from users.created_at), users.uid)`.as(
          'cursor',
        ),
      )
      .groupBy(['profile.path'])
      .orderBy(['users.created_at desc', 'users.uid desc'])
      .$if(!!cursor, (qb) =>
        qb.where(
          sql<string>`CONCAT(EXTRACT(EPOCH from users.created_at), users.uid)`,
          '<=',
          Buffer.from(cursor!, 'base64url').toString(),
        ),
      )
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data?.pop()?.cursor;
    data.forEach((d) => {
      (d.cursor as any) = undefined;
      const { profile } = this.fetchPresignedUrl({
        profile: d.profile,
      });
      d.profile = profile;
    });
    return {
      data,
      cursor:
        newCursor == null ? null : Buffer.from(newCursor).toString('base64url'),
    };
  }

  async fetchUser({
    userId,
    requestUserId,
    username,
  }: {
    userId?: string;
    requestUserId?: string;
    username?: string;
  }) {
    const data = await this.dbService
      .selectFrom('users')
      .$if(!!userId, (eb) => eb.where('uid', '=', userId!))
      .$if(!!username, (eb) => eb.where('username', '=', username!))
      .$if(!!requestUserId && requestUserId !== userId, (qb) =>
        qb
          .leftJoin('user_follows', (join) =>
            join
              .onRef('user_follows.follower_id', '=', 'users.uid')
              .on('user_follows.following_id', '=', requestUserId!),
          )
          .leftJoin('user_blocks as my_block', (join) =>
            join
              .onRef('my_block.target_id', '=', 'users.uid')
              .on('my_block.user_id', '=', requestUserId!),
          )
          .leftJoin('user_blocks as target_block', (join) =>
            join
              .onRef('target_block.user_id', '=', 'users.uid')
              .on('target_block.target_id', '=', requestUserId!),
          )
          .select([
            'user_follows.created_at as followed_at',
            'my_block.created_at as blocked_at',
            'target_block.created_at as is_blocked',
          ])
          .groupBy(['user_follows.id', 'my_block.id', 'target_block.id']),
      )
      .leftJoin('contents as profile', 'profile.id', 'users.profile')
      .leftJoin('contents as banner', 'banner.id', 'users.banner')
      .leftJoin('user_bans', 'user_bans.user_id', 'users.uid')
      .leftJoin(
        'user_follows as followers',
        'followers.follower_id',
        'users.uid',
      )
      .leftJoin(
        'user_follows as followings',
        'followings.following_id',
        'users.uid',
      )
      .leftJoin('prayers', 'prayers.user_id', 'users.uid')
      .leftJoin('prayer_prays', 'prayer_prays.user_id', 'users.uid')
      .groupBy([
        'users.uid',
        'profile.path',
        'banner.path',
        'user_bans.created_at',
      ])
      .selectAll(['users'])
      .select([
        'profile.path as profile',
        'banner.path as banner',
        'user_bans.created_at as banned_at',
      ])
      .select(({ fn }) => [
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(followers.id)`),
            sql<string>`0`,
          )
          .as('followers_count'),
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(followings.id)`),
            sql<string>`0`,
          )
          .as('followings_count'),
        fn
          .coalesce(fn.count<string>(sql`DISTINCT(prayers.id)`), sql<string>`0`)
          .as('prayers_count'),
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(prayer_prays.id)`),
            sql<string>`0`,
          )
          .as('prays_count'),
      ])
      .executeTakeFirst();
    if (data == null) {
      return data;
    }
    if (data.is_blocked != null) {
      return null;
    }
    const { profile, banner } = this.fetchPresignedUrl(data);
    return {
      ...data,
      profile,
      banner,
      followers_count: parseInt(data.followers_count ?? '10', 10),
      followings_count: parseInt(data.followings_count ?? '10', 10),
      prayers_count: parseInt(data.prayers_count ?? '10', 10),
      prays_count: parseInt(data.prays_count ?? '10', 10),
    };
  }

  async fetchFollows({
    following,
    follower,
    cursor,
  }: {
    following?: string;
    follower?: string;
    cursor?: number;
  }) {
    const data = await this.dbService
      .selectFrom('user_follows')
      .$if(!!follower, (eb) =>
        eb
          .innerJoin('users', 'users.uid', 'user_follows.following_id')
          .leftJoin('contents as profile', 'profile.id', 'users.profile')
          .where('follower_id', '=', follower!)
          .select([
            'user_follows.id',
            'users.uid',
            'users.name',
            'profile.path as profile',
            'users.username',
          ]),
      )
      .$if(!!following, (eb) =>
        eb
          .innerJoin('users', 'users.uid', 'user_follows.follower_id')
          .leftJoin('contents as profile', 'profile.id', 'users.profile')
          .where('following_id', '=', following!)
          .select([
            'user_follows.id',
            'users.uid',
            'users.name',
            'profile.path as profile',
            'users.username',
          ]),
      )
      .orderBy('user_follows.id desc')
      .limit(11)
      .$if(!!cursor, (eb) => eb.where('id', '<=', cursor!))
      .execute();
    data.forEach((d) => {
      if (d.profile) {
        d.profile = this.storageService.publicBucket
          .file(d.profile)
          .publicUrl();
      }
    });
    return data;
  }

  async createUser({
    uid,
    email,
    name,
    username,
    bio,
  }: {
    uid: string;
    email: string;
    name: string;
    username: string;
    bio?: string;
  }) {
    return this.dbService
      .insertInto('users')
      .values({
        uid,
        email,
        name,
        username,
        bio,
      })
      .executeTakeFirstOrThrow();
  }

  async updateUser({
    uid,
    name,
    username,
    bio,
    profile,
    banner,
    verse_id,
  }: Omit<UpdateObject<DB, 'users'>, 'uid'> & { uid: string }) {
    const data = await this.dbService
      .selectFrom('users')
      .leftJoin('contents as profile', 'profile.id', 'users.profile')
      .leftJoin('contents as banner', 'banner.id', 'users.banner')
      .where('uid', '=', uid)
      .select(['profile.path as profile', 'banner.path as banner'])
      .executeTakeFirstOrThrow();
    if (
      [name, username, bio, profile, banner]
        .map((v) => v === undefined)
        .every((v) => v)
    ) {
      return;
    }
    const [p, b] = await Promise.all([
      profile &&
        this.dbService
          .selectFrom('contents')
          .where('contents.id', '=', profile! as number)
          .select(['contents.user_id'])
          .executeTakeFirstOrThrow(),
      banner &&
        this.dbService
          .selectFrom('contents')
          .where('contents.id', '=', banner! as number)
          .select(['contents.user_id'])
          .executeTakeFirstOrThrow(),
    ]);
    if ((p && p.user_id !== uid) || (b && b.user_id !== uid)) {
      throw new OperationNotAllowedError(
        'You can only use a photo uploaded by you',
      );
    }
    await this.dbService
      .updateTable('users')
      .where('uid', '=', uid)
      .set({
        name,
        username,
        bio,
        profile,
        banner,
        updated_at: new Date(),
        verse_id,
      })
      .executeTakeFirstOrThrow();
    Promise.all([
      profile !== undefined &&
        data.profile &&
        this.storageService.publicBucket
          .file(data.profile)
          .delete({ ignoreNotFound: true }),
      banner !== undefined &&
        data.banner &&
        this.storageService.publicBucket
          .file(data.banner)
          .delete({ ignoreNotFound: true }),
    ]);
  }

  async createNewFcmTokens(userId: string, value: string) {
    return this.dbService
      .insertInto('user_fcm_tokens')
      .values({ user_id: userId, value })
      .onConflict((oc) => oc.columns(['user_id', 'value']).doNothing())
      .execute();
  }

  async deleteUser(userId: string) {
    await this.dbService
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const { g, cp, gm, profile, banner } = await trx
          .selectFrom('users')
          .leftJoin('groups', 'groups.admin_id', 'users.uid')
          .leftJoin(
            'corporate_prayers',
            'corporate_prayers.user_id',
            'users.uid',
          )
          .leftJoin('contents as profile', 'profile.id', 'users.profile')
          .leftJoin('contents as banner', 'banner.id', 'users.banner')
          .leftJoin('group_members', 'group_members.user_id', 'users.uid')
          .where('users.uid', '=', userId)
          .groupBy(['profile.path', 'banner.path'])
          .select(({ fn }) => [
            'profile.path as profile',
            'banner.path as banner',
            fn.countAll<string>('groups').as('g'),
            fn.countAll<string>('corporate_prayers').as('cp'),
            fn.countAll<string>('group_members').as('gm'),
          ])
          .executeTakeFirstOrThrow();
        if (
          parseInt(g ?? '0', 10) > 0 ||
          parseInt(cp ?? '0', 10) > 0 ||
          parseInt(gm ?? '0', 10) > 0
        ) {
          throw new NotEmptyResource();
        }
        profile &&
          this.storageService.publicBucket
            .file(profile)
            .delete({ ignoreNotFound: true });
        banner &&
          this.storageService.publicBucket
            .file(banner)
            .delete({ ignoreNotFound: true });
        trx
          .deleteFrom('user_follows')
          .where(({ or, eb }) =>
            or([
              eb('user_follows.follower_id', '=', userId),
              eb('user_follows.following_id', '=', userId),
            ]),
          )
          .executeTakeFirst();
        trx
          .deleteFrom('user_bans')
          .where('user_bans.user_id', '=', userId)
          .executeTakeFirst();
        trx
          .deleteFrom('user_fcm_tokens')
          .where('user_fcm_tokens.user_id', '=', userId)
          .executeTakeFirst();
        trx
          .deleteFrom('notifications')
          .where('notifications.user_id', '=', userId)
          .executeTakeFirst();
        trx
          .deleteFrom('prayer_prays')
          .where('prayer_prays.user_id', '=', userId)
          .executeTakeFirst();
        trx
          .deleteFrom('prayers')
          .where('prayers.user_id', '=', userId)
          .executeTakeFirst();
        trx
          .deleteFrom('users')
          .where('users.uid', '=', userId)
          .executeTakeFirst();
      });
    await auth().deleteUser(userId);
  }

  async sendFeedback(userId: string, value: string) {
    return this.httpService.axiosRef.post(
      `https://api.telegram.org/bot${this.configService.getOrThrow(
        'TELEGRAM_BOT_TOKEN',
      )}/sendMessage`,
      {
        chat_id: -1001584906039,
        message_thread_id: 7,
        text: `uid:${userId}\n${value}`,
        parse_mode: 'MarkdownV2',
      },
    );
  }

  async sendReport(userId: string, reportId: string, value: string) {
    return this.httpService.axiosRef.post(
      `https://api.telegram.org/bot${this.configService.getOrThrow(
        'TELEGRAM_BOT_TOKEN',
      )}/sendMessage`,
      {
        chat_id: -1001584906039,
        message_thread_id: 36,
        text: `uid:${userId}\nreportId:\n${reportId}\n\n${value}`,
      },
    );
  }

  fetchPresignedUrl(data: { profile?: string | null; banner?: string | null }) {
    return {
      profile: data.profile
        ? this.storageService.getPublicUrl(data.profile)
        : null,
      banner: data.banner
        ? this.storageService.getPublicUrl(data.banner)
        : null,
    };
  }
}
