import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';
import { v4 } from 'uuid';

@Injectable()
export class GroupsService {
  constructor(
    private dbService: KyselyService,
    private storageService: StorageService,
    private configService: ConfigService,
  ) {}

  async fetchGroup(groupId: string, userId?: string) {
    const data = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .innerJoin('group_members as members', 'members.group_id', 'groups.id')
      .leftJoin('prayers', 'prayers.group_id', 'groups.id')
      .leftJoin('group_invitations', 'group_invitations.group_id', 'groups.id')
      .where('members.accepted_at', 'is not', null)
      .selectAll(['groups'])
      .select(({ fn }) => [
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT members.user_id`),
            sql<string>`0`,
          )
          .as('members_count'),
        fn
          .coalesce(fn.count<string>(sql`DISTINCT prayers.id`), sql<string>`0`)
          .as('prayers_count'),
      ])
      .select('group_invitations.created_at as invited_at')
      .groupBy(['groups.id', 'admin.uid'])
      .groupBy(['groups.id', 'admin.uid', 'invited_at'])
      .select((eb) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'admin.uid',
            'admin.name',
            'admin.profile',
            'admin.username',
          ]),
        ).as('admin'),
      )
      .$if(!!userId, (eb) =>
        eb
          .leftJoin(
            ({ selectFrom }) =>
              selectFrom('group_members')
                .select([
                  'group_members.group_id',
                  'group_members.created_at as joined_at',
                  'group_members.moderator',
                  'group_members.accepted_at',
                ])
                .where('group_members.user_id', '=', userId!)
                .as('user'),
            (join) => join.onRef('user.group_id', '=', 'groups.id'),
          )
          .groupBy([
            'user.group_id',
            'user.joined_at',
            'user.moderator',
            'user.accepted_at',
          ])
          .selectAll('user'),
      )
      .executeTakeFirst();
    if (data == null) {
      return data;
    }
    if (data.banner != null) {
      (data.banner as string) = this.storageService.getPublicUrl(data.banner);
    }
    if (data.admin?.profile) {
      data.admin.profile = this.storageService.publicBucket
        .file(data.admin.profile)
        .publicUrl();
    }
    return {
      ...data,
      members_count: parseInt(data.members_count ?? '0', 10),
      prayers_count: parseInt(data.prayers_count ?? '0', 10),
    };
  }

  async fetchInvitations({
    userId,
    cursor,
  }: {
    userId: string;
    cursor?: number;
  }) {
    const data = await this.dbService
      .selectFrom('group_invitations')
      .innerJoin('groups', 'group_invitations.group_id', 'groups.id')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .innerJoin('group_members', 'group_members.group_id', 'groups.id')
      .groupBy(['group_invitations.id', 'groups.id', 'admin.uid'])
      .where('group_invitations.user_id', '=', userId)
      .$if(!!cursor, (eb) => eb.where('group_invitations.id', '<=', cursor!))
      .where('group_members.accepted_at', 'is not', null)
      .orderBy('group_invitations.id desc')
      .select((eb) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'admin.uid',
            'admin.username',
            'admin.profile',
            'admin.name',
          ]),
        ).as('admin'),
      )
      .select(({ fn }) =>
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT group_members.user_id`),
            sql<string>`0`,
          )
          .as('members_count'),
      )
      .select([
        'group_invitations.id as cursor',
        'groups.id',
        'groups.name',
        'groups.admin_id',
        'groups.membership_type',
        'groups.banner',
      ])
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    data.forEach((d) => {
      (d.cursor as any) = undefined;
      d.banner = this.storageService.publicBucket.file(d.banner).publicUrl();
      if (d.admin?.profile) {
        d.admin.profile = this.storageService.publicBucket
          .file(d.admin.profile)
          .publicUrl();
      }
      (d.members_count as unknown) = parseInt(d.members_count, 10);
    });
    return { data, cursor: newCursor };
  }

  async fetchGroups({
    query,
    cursor,
    userId,
    requestingUserId,
  }: {
    query?: string;
    cursor?: string;
    userId?: string;
    requestingUserId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('groups')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .innerJoin('group_members', 'group_members.group_id', 'groups.id')
      .groupBy(['groups.id', 'admin.uid'])
      .where('groups.membership_type', '!=', 'private')
      .$if(!!requestingUserId, (qb) =>
        qb
          .leftJoin('group_members as requester', (join) =>
            join
              .onRef('requester.group_id', '=', 'groups.id')
              .on('requester.user_id', '=', requestingUserId!),
          )
          .clearWhere()
          .where(({ or, eb }) =>
            or([
              eb('groups.membership_type', '!=', 'private'),
              eb('requester.accepted_at', 'is not', null),
            ]),
          ),
      )
      .$if(!!query, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('groups.name', 'like', `%${query}%`),
            eb('groups.description', 'like', `%${query}%`),
          ]),
        ),
      )
      .$if(!!userId, (eb) => eb.where('group_members.user_id', '=', userId!))
      .$if(!!cursor, (eb) =>
        eb.where(
          sql<string>`CONCAT(EXTRACT(EPOCH FROM groups.created_at), groups.id)`,
          '<=',
          Buffer.from(cursor!, 'base64url').toString(),
        ),
      )
      .where('group_members.accepted_at', 'is not', null)
      .orderBy(['groups.created_at desc', 'groups.id desc'])
      .select(
        sql<string>`CONCAT(EXTRACT(EPOCH FROM groups.created_at), groups.id)`.as(
          'cursor',
        ),
      )
      .select((eb) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'admin.uid',
            'admin.username',
            'admin.profile',
            'admin.name',
          ]),
        ).as('admin'),
      )
      .select(({ fn }) =>
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT group_members.user_id`),
            sql<string>`0`,
          )
          .as('members_count'),
      )
      .select([
        'groups.id',
        'groups.name',
        'groups.admin_id',
        'groups.membership_type',
        'groups.banner',
      ])
      .limit(11)
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor;
    data.forEach((d) => {
      (d.cursor as any) = undefined;
      d.banner = this.storageService.publicBucket.file(d.banner).publicUrl();
      if (d.admin?.profile) {
        d.admin.profile = this.storageService.publicBucket
          .file(d.admin.profile)
          .publicUrl();
      }
      (d.members_count as unknown) = parseInt(d.members_count, 10);
    });
    return {
      data,
      cursor:
        newCursor == null ? null : Buffer.from(newCursor).toString('base64url'),
    };
  }

  async createGroup(body: {
    name: string;
    description: string;
    admin: string;
    membershipType: 'open' | 'restricted' | 'private';
    banner: string;
  }) {
    const newId = v4();
    await this.dbService.transaction().execute(async (trx) => {
      await Promise.all([
        trx
          .insertInto('groups')
          .values({
            id: newId,
            name: body.name,
            admin_id: body.admin,
            description: body.description,
            membership_type: body.membershipType,
            banner: body.banner!,
          })
          .executeTakeFirst(),
        trx
          .insertInto('group_members')
          .values({
            user_id: body.admin,
            group_id: newId,
            moderator: new Date(),
            accepted_at: new Date(),
          })
          .executeTakeFirst(),
      ]);
    });
    return newId;
  }

  async updateGroup(body: {
    groupId: string;
    name?: string;
    description?: string;
    banner?: string;
  }) {
    const { banner } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', body.groupId)
      .select(['banner'])
      .executeTakeFirstOrThrow();
    if (body.banner !== undefined) {
      this.storageService.publicBucket
        .file(banner)
        .delete({ ignoreNotFound: true });
    }
    await this.dbService
      .updateTable('groups')
      .where('groups.id', '=', body.groupId)
      .set({
        name: body.name,
        description: body.description,
        banner: body.banner,
        updated_at: new Date(),
      })
      .executeTakeFirst();
  }

  async joinGroup(body: { groupId: string; userId: string }) {
    const data = await this.dbService
      .insertInto('group_members')
      .values((eb) => ({
        user_id: eb
          .selectFrom('users')
          .where('users.uid', '=', body.userId)
          .select('users.uid'),
        group_id: eb
          .selectFrom('groups')
          .where('groups.id', '=', body.groupId)
          .select('groups.id'),
        accepted_at: eb
          .selectFrom('groups')
          .where('groups.id', '=', body.groupId)
          .select((qb) =>
            qb
              .case()
              .when('groups.membership_type', '=', 'open')
              .then(sql<Date>`timezone('utc', now())`)
              .when(
                sql`
                EXISTS(
                  SELECT gi.id
                  FROM group_invitations gi
                  WHERE gi.group_id = ${body.groupId} AND gi.user_id = ${body.userId}
                )
              `,
              )
              .then(sql<Date>`timezone('utc', now())`)
              .else(sql<null>`NULL`)
              .end()
              .as('accepted_at'),
          ),
      }))
      .onConflict((oc) =>
        oc.columns(['group_id', 'user_id']).doUpdateSet((eb) => ({
          accepted_at: eb
            .selectFrom('groups')
            .where('groups.id', '=', body.groupId)
            .select((qb) =>
              qb
                .case()
                .when('membership_type', '=', 'open')
                .then(sql<Date>`timezone('utc', now())`)
                .else(sql<null>`NULL`)
                .end()
                .as('accepted_at'),
            ),
        })),
      )
      .returning('accepted_at')
      .executeTakeFirstOrThrow();
    this.dbService
      .deleteFrom('group_invitations')
      .where('user_id', '=', body.userId)
      .where('group_id', '=', body.groupId)
      .executeTakeFirst();
    return data;
  }

  async leaveGroup(body: { groupId: string; userId: string }) {
    await this.dbService
      .deleteFrom('group_members')
      .where('group_id', '=', body.groupId)
      .where((eb) =>
        eb.and([
          eb('user_id', '=', body.userId),
          eb.exists(
            eb
              .selectFrom('groups')
              .where('admin_id', '!=', body.userId)
              .where('user_id', '=', body.userId),
          ),
        ]),
      )
      .returning('group_members.id')
      .executeTakeFirstOrThrow();
  }

  async fetchPendingInvites(groupId: string, cursor?: number) {
    const data = await this.dbService
      .selectFrom('group_invitations')
      .innerJoin('users', 'group_invitations.user_id', 'users.uid')
      .where('group_invitations.group_id', '=', groupId)
      .orderBy('group_invitations.id desc')
      .$if(!!cursor, (eb) => eb.where('group_invitations.id', '<=', cursor!))
      .limit(21)
      .select([
        'group_invitations.id',
        'users.uid',
        'users.name',
        'users.profile',
        'users.username',
      ])
      .execute();
    const newCursor = data.length < 21 ? null : data.pop()?.id;
    data.forEach((member) => {
      if (member.profile) {
        member.profile = this.storageService.getPublicUrl(member.profile);
      }
    });
    return { data, cursor: newCursor ?? null };
  }

  async fetchMembers(
    groupId: string,
    {
      cursor,
      moderator,
      requests,
      query,
    }: {
      query?: string;
      cursor?: string;
      moderator?: boolean;
      requests?: boolean;
    },
  ) {
    cursor = !!cursor
      ? Buffer.from(cursor!, 'base64url').toString()
      : undefined;
    const data = await this.dbService
      .selectFrom('group_members')
      .where('group_members.group_id', '=', groupId)
      .innerJoin('users', 'group_members.user_id', 'users.uid')
      .$if(moderator != null, (qb) =>
        qb.where('moderator', moderator ? 'is not' : 'is', null),
      )
      .$if(!!cursor, (qb) =>
        qb.where(
          sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM group_members.accepted_at)::text, 20, '0'), group_members.id)`,
          '>=',
          cursor!,
        ),
      )
      .where('accepted_at', requests ? 'is' : 'is not', null)
      .$if(!!query, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%${query}%`),
          ]),
        ),
      )
      .orderBy(['group_members.accepted_at asc', 'group_members.id asc'])
      .limit(11)
      .select([
        'users.uid',
        'users.name',
        'users.username',
        'users.profile',
        'group_members.moderator',
      ])
      .select(
        sql<string>`CONCAT(LPAD(EXTRACT(EPOCH FROM group_members.accepted_at)::text, 20, '0'), group_members.id)`.as(
          'cursor',
        ),
      )
      .execute();
    const newCursor = data.length < 11 ? null : data.pop()?.cursor ?? null;
    data.forEach((member) => {
      (member.cursor as any) = undefined;
      if (member.profile) {
        member.profile = this.storageService.getPublicUrl(member.profile);
      }
    });
    return {
      data,
      cursor:
        newCursor == null ? null : Buffer.from(newCursor).toString('base64url'),
    };
  }

  async deleteGroup(groupId: string) {
    const files: string[] = [];
    await this.dbService.transaction().execute(async (trx) => {
      const [banners, medias] = await Promise.all([
        trx
          .deleteFrom('groups')
          .where('groups.id', '=', groupId)
          .returning('groups.banner')
          .execute(),
        trx
          .deleteFrom('prayers')
          .where('prayers.group_id', '=', groupId)
          .returning('prayers.media')
          .execute(),
        trx
          .deleteFrom('group_members')
          .where('group_members.group_id', '=', groupId)
          .execute(),
        trx
          .deleteFrom('corporate_prayers')
          .where('corporate_prayers.group_id', '=', groupId)
          .execute(),
      ]);
      files.push(
        ...(banners
          .map(({ banner }) => banner)
          .filter((value) => !!value) as string[]),
        ...(medias
          .map(({ media }) => media)
          .filter((value) => !!value) as string[]),
      );
    });
  }

  async checkModerator(groupId: string, userId: string) {
    const data = await this.dbService
      .selectFrom('group_members')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .select('moderator')
      .executeTakeFirst();
    return data != null && data.moderator != null;
  }

  async handleRequest({
    groupId,
    userId,
  }: {
    groupId: string;
    userId: string;
  }) {
    return this.dbService
      .updateTable('group_members')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .set({ accepted_at: new Date() })
      .executeTakeFirstOrThrow();
  }

  async handleModerator({
    groupId,
    userId,
    value,
  }: {
    groupId: string;
    userId: string;
    value?: boolean;
  }) {
    return this.dbService
      .updateTable('group_members')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .set({ moderator: value ? new Date() : null })
      .executeTakeFirstOrThrow();
  }

  async inviteUser({
    groupId,
    userIds,
    value,
  }: {
    groupId: string;
    userIds: string[];
    value: boolean;
  }) {
    if (value) {
      return this.dbService
        .insertInto('group_invitations')
        .values(
          userIds.map((userId) => ({ group_id: groupId, user_id: userId })),
        )
        .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
        .executeTakeFirst();
    }
    return this.dbService
      .deleteFrom('group_invitations')
      .where('group_id', '=', groupId)
      .where('user_id', 'in', userIds)
      .executeTakeFirst();
  }
}
