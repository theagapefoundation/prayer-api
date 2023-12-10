import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import {
  OperationNotAllowedError,
  TargetNotFoundError,
} from 'src/errors/common.error';
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
      .leftJoin('contents as banner', 'banner.id', 'groups.banner')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .leftJoin(
        'contents as admin_content',
        'admin_content.id',
        'admin.profile',
      )
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
      .select([
        'group_invitations.created_at as invited_at',
        'banner.path as banner',
      ])
      .groupBy([
        'groups.id',
        'admin.uid',
        'invited_at',
        'banner.path',
        'admin_content.path',
      ])
      .select((eb) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'admin.uid',
            'admin.name',
            'admin_content.path as profile',
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
      .innerJoin('contents as banner', 'banner.id', 'groups.banner')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .leftJoin('contents as user_content', 'user_content.id', 'admin.profile')
      .innerJoin('group_members', 'group_members.group_id', 'groups.id')
      .groupBy([
        'group_invitations.id',
        'groups.id',
        'admin.uid',
        'banner.path',
        'user_content.path',
      ])
      .where('group_invitations.user_id', '=', userId)
      .$if(!!cursor, (eb) => eb.where('group_invitations.id', '<=', cursor!))
      .where('group_members.accepted_at', 'is not', null)
      .orderBy('group_invitations.id desc')
      .select((eb) =>
        jsonObjectFrom(
          eb.selectNoFrom([
            'admin.uid',
            'admin.username',
            'user_content.path as profile',
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
        'banner.path as banner',
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
      .leftJoin(
        'contents as admin_content',
        'admin_content.id',
        'admin.profile',
      )
      .innerJoin('contents as banner', 'banner.id', 'groups.banner')
      .innerJoin('group_members', 'group_members.group_id', 'groups.id')
      .groupBy(['groups.id', 'admin.uid', 'admin_content.path', 'banner.path'])
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
            'admin_content.path as profile',
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
        'groups.description',
        'groups.admin_id',
        'groups.membership_type',
        'banner.path as banner',
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
    banner: number;
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
    banner?: number;
    requestUser: string;
  }) {
    this.dbService.transaction().execute(async (trx) => {
      const { admin_id, banner } = await trx
        .selectFrom('groups')
        .innerJoin('contents', 'contents.id', 'groups.banner')
        .where('groups.id', '=', body.groupId)
        .select(['groups.admin_id', 'contents.path as banner'])
        .executeTakeFirstOrThrow();
      if (admin_id !== body.requestUser) {
        throw new OperationNotAllowedError('Only admin can make an update');
      }
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
    });
  }

  async joinGroup(body: { groupId: string; userId: string }) {
    const data = await this.dbService.transaction().execute(async (trx) => {
      const groupExists = await trx
        .selectFrom('groups')
        .where('groups.id', '=', body.groupId)
        .select('groups.id')
        .executeTakeFirstOrThrow();
      if (!groupExists) {
        throw new TargetNotFoundError('Unable to find the group');
      }
      const userExists = await trx
        .selectFrom('users')
        .where('users.uid', '=', body.userId)
        .select('users.username')
        .executeTakeFirstOrThrow();
      if (!userExists) {
        throw new TargetNotFoundError('Unable to find the user');
      }
      const result = await trx
        .insertInto('group_members')
        .values((eb) => ({
          user_id: body.userId,
          group_id: body.groupId,
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
        .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
        .returning('accepted_at')
        .executeTakeFirstOrThrow();
      return result;
    });
    this.dbService
      .deleteFrom('group_invitations')
      .where('user_id', '=', body.userId)
      .where('group_id', '=', body.groupId)
      .executeTakeFirst();
    return data;
  }

  async leaveGroup(body: {
    groupId: string;
    userId: string;
    requestUser: string;
  }) {
    this.dbService.transaction().execute(async (trx) => {
      const { admin_id } = await trx
        .selectFrom('groups')
        .where('groups.id', '=', body.groupId)
        .select('groups.admin_id')
        .executeTakeFirstOrThrow();
      if (admin_id === body.requestUser) {
        throw new OperationNotAllowedError('Admin cannot leave the group');
      }
      await trx
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
    });
  }

  async fetchPendingInvites(groupId: string, cursor?: number) {
    const data = await this.dbService
      .selectFrom('group_invitations')
      .innerJoin('users', 'group_invitations.user_id', 'users.uid')
      .leftJoin('contents', 'contents.id', 'users.profile')
      .where('group_invitations.group_id', '=', groupId)
      .orderBy('group_invitations.id desc')
      .$if(!!cursor, (eb) => eb.where('group_invitations.id', '<=', cursor!))
      .limit(21)
      .select([
        'group_invitations.id',
        'users.uid',
        'users.name',
        'contents.path as profile',
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
      .leftJoin('contents', 'contents.id', 'users.profile')
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
        'contents.path as profile',
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

  async deleteGroup(groupId: string, requestUser: string) {
    await this.dbService
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const { admin_id } = await trx
          .selectFrom('groups')
          .where('groups.id', '=', groupId)
          .select(['groups.admin_id'])
          .executeTakeFirstOrThrow();
        if (admin_id !== requestUser) {
          throw new OperationNotAllowedError('Only admin can delete a group');
        }
        const { banner, c, p } = await trx
          .selectFrom('groups')
          .where('groups.id', '=', groupId)
          .innerJoin('contents as banner', 'banner.id', 'groups.banner')
          .leftJoin(
            'corporate_prayers',
            'corporate_prayers.group_id',
            'groups.id',
          )
          .leftJoin('prayers', 'prayers.group_id', 'groups.id')
          .select(({ fn }) => [
            'banner.path as banner',
            fn.count<string>('corporate_prayers.id').as('c'),
            fn.count<string>('prayers.id').as('p'),
          ])
          .groupBy(['banner.path'])
          .executeTakeFirstOrThrow();
        if (parseInt(c || '0') > 0 || parseInt(p || '0') > 0) {
          throw new OperationNotAllowedError(
            'groups must have no prayers and corporate prayers',
          );
        }
        await Promise.all([
          trx
            .deleteFrom('groups')
            .where('groups.id', '=', groupId)
            .executeTakeFirstOrThrow(),
          trx
            .deleteFrom('group_members')
            .where('group_members.group_id', '=', groupId)
            .execute(),
        ]);
        this.storageService.publicBucket
          .file(banner)
          .delete({ ignoreNotFound: true });
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
    requestUser,
  }: {
    groupId: string;
    userId: string;
    requestUser: string;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      const { moderator } = await trx
        .selectFrom('group_members')
        .where('group_members.user_id', '=', requestUser)
        .select(['group_members.moderator'])
        .executeTakeFirstOrThrow();
      if (!moderator) {
        throw new OperationNotAllowedError(
          'Only moderators are able to accept the requests',
        );
      }
      return trx
        .updateTable('group_members')
        .where('group_id', '=', groupId)
        .where('user_id', '=', userId)
        .set({ accepted_at: new Date() })
        .executeTakeFirstOrThrow();
    });
  }

  async handleModerator({
    groupId,
    userId,
    value,
    requestUser,
  }: {
    groupId: string;
    userId: string;
    value?: boolean;
    requestUser: string;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      const { admin_id } = await trx
        .selectFrom('groups')
        .where('groups.id', '=', groupId)
        .select(['groups.admin_id'])
        .executeTakeFirstOrThrow();
      if (requestUser !== admin_id) {
        throw new OperationNotAllowedError(
          'Only admin can promote user to moderator',
        );
      }
      if (userId === admin_id) {
        throw new OperationNotAllowedError(
          'You cannot change admin permission',
        );
      }
      return this.dbService
        .updateTable('group_members')
        .where('group_id', '=', groupId)
        .where('user_id', '=', userId)
        .set({ moderator: value ? new Date() : null })
        .executeTakeFirstOrThrow();
    });
  }

  async inviteUser({
    groupId,
    userIds,
    value,
    requestUser,
  }: {
    groupId: string;
    userIds: string[];
    value: boolean;
    requestUser: string;
  }) {
    return this.dbService.transaction().execute(async (trx) => {
      const { moderator } = await trx
        .selectFrom('group_members')
        .where('group_members.user_id', '=', requestUser)
        .select(['group_members.moderator'])
        .executeTakeFirstOrThrow();
      if (!moderator) {
        throw new OperationNotAllowedError(
          'Only moderator can send invitation',
        );
      }
      if (value) {
        return trx
          .insertInto('group_invitations')
          .values(
            userIds.map((userId) => ({ group_id: groupId, user_id: userId })),
          )
          .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
          .executeTakeFirst();
      }
      return trx
        .deleteFrom('group_invitations')
        .where('group_id', '=', groupId)
        .where('user_id', 'in', userIds)
        .executeTakeFirst();
    });
  }
}
