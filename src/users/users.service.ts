import { Injectable } from '@nestjs/common';
import { UpdateObject, sql } from 'kysely';
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

  async searchUsers({ query, cursor }: { query?: string; cursor?: string }) {
    const data = await this.dbService
      .selectFrom('users')
      .select(['profile', 'uid', 'username', 'name'])
      .$if(!!query, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%${query}%`),
          ]),
        ),
      )
      .orderBy('created_at desc')
      .$if(!!cursor, (qb) => qb.where('uid', '=', cursor!))
      .limit(21)
      .execute();
    data.forEach((d) => {
      const { profile } = this.fetchPresignedUrl({
        profile: d.profile,
      });
      d.profile = profile;
    });
    return data;
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
      .selectAll()
      .$if(!!requestUserId && requestUserId !== userId, (qb) =>
        qb.select((eb) =>
          eb
            .selectFrom('user_follows')
            .whereRef('user_follows.follower_id', '=', 'users.uid')
            .where('user_follows.following_id', '=', requestUserId!)
            .select('user_follows.created_at')
            .as('followed_at'),
        ),
      )
      .select(({ selectFrom }) => [
        selectFrom('user_follows')
          .whereRef('user_follows.follower_id', '=', 'users.uid')
          .select(({ fn }) =>
            fn
              .coalesce(fn.count<string>('user_follows.id'), sql<string>`0`)
              .as('value'),
          )
          .as('followers_count'),
        selectFrom('user_follows')
          .whereRef('user_follows.following_id', '=', 'users.uid')
          .select(({ fn }) =>
            fn
              .coalesce(fn.count<string>('user_follows.id'), sql<string>`0`)
              .as('value'),
          )
          .as('followings_count'),
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
    if (!follower && !following) {
      return null;
    }
    let query: any;
    if (follower) {
      query = this.dbService
        .selectFrom('user_follows')
        .leftJoin('users', 'user_follows.following_id', 'users.uid')
        .where('follower_id', '=', follower);
    } else if (following) {
      query = this.dbService
        .selectFrom('user_follows')
        .leftJoin('users', 'user_follows.follower_id', 'users.uid')
        .where('following_id', '=', following);
    }
    const data = await query
      .select([
        'user_follows.id',
        'users.uid',
        'users.name',
        'users.profile',
        'users.username',
      ])
      .orderBy('user_follows.created_at desc')
      .limit(11)
      .$if(!!cursor, (eb) => eb.where('id', '=', cursor))
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
