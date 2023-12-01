import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder, UpdateObject, sql } from 'kysely';
import { DB } from 'prisma/generated/types';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class UsersService {
  constructor(
    private dbService: KyselyService,
    private storageService: StorageService,
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

  async searchUsers({
    query,
    cursor,
    excludeGroupId,
  }: {
    query?: string;
    cursor?: string;
    excludeGroupId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('users')
      .$if(!!excludeGroupId, (qb) =>
        qb
          .leftJoin('group_members', (join) =>
            join
              .onRef('group_members.user_id', '=', 'users.uid')
              .on('group_members.group_id', '=', excludeGroupId!),
          )
          .where('group_members.id', 'is', null),
      )
      .$if(!!query, (qb) =>
        qb.where(({ or, eb }) =>
          or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%${query}%`),
          ]),
        ),
      )
      .select(['users.profile', 'users.uid', 'users.username', 'users.name'])
      .select(
        sql<string>`CONCAT(EXTRACT(EPOCH from users.created_at), users.uid)`.as(
          'cursor',
        ),
      )
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
          .select('user_follows.created_at as followed_at')
          .groupBy('user_follows.id'),
      )
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
      .groupBy('users.uid')
      .selectAll(['users'])
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
    let query: SelectQueryBuilder<DB, 'users' | 'user_follows', object>;
    if (follower) {
      query = this.dbService
        .selectFrom('user_follows')
        .innerJoin('users', 'user_follows.following_id', 'users.uid')
        .where('follower_id', '=', follower);
    } else if (following) {
      query = this.dbService
        .selectFrom('user_follows')
        .innerJoin('users', 'user_follows.follower_id', 'users.uid')
        .where('following_id', '=', following);
    } else {
      return [];
    }
    const data = await query
      .select([
        'user_follows.id',
        'users.uid',
        'users.name',
        'users.profile',
        'users.username',
      ])
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
    profile,
    banner,
  }: {
    uid: string;
    email: string;
    name: string;
    username: string;
    bio?: string;
    profile?: string;
    banner?: string;
  }) {
    await this.dbService
      .insertInto('users')
      .values({
        uid,
        email,
        name,
        username,
        bio,
        profile,
        banner,
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
  }: Omit<UpdateObject<DB, 'users'>, 'uid'> & { uid: string }) {
    const data = await this.dbService
      .selectFrom('users')
      .where('uid', '=', uid)
      .selectAll()
      .executeTakeFirst();
    if (data == null) {
      return;
    }
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
    if (
      [name, username, bio, profile, banner]
        .map((v) => v === undefined)
        .every((v) => v)
    ) {
      return;
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
      })
      .executeTakeFirstOrThrow();
  }

  async createNewFcmTokens(userId: string, value: string) {
    return this.dbService
      .insertInto('user_fcm_tokens')
      .values({ user_id: userId, value })
      .onConflict((oc) => oc.columns(['user_id', 'value']).doNothing())
      .execute();
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
