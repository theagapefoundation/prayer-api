import { Injectable } from '@nestjs/common';
import { InsertObject, sql } from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { DB } from 'prisma/generated/types';
import { OperationNotAllowedError } from 'src/errors/common.error';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class GroupsService {
  constructor(
    private dbService: KyselyService,
    private storageService: StorageService,
  ) {}

  async fetchGroup(groupId: string, userId?: string) {
    const data = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .innerJoin('contents as banner', 'banner.id', 'groups.banner_id')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .leftJoin(
        'contents as admin_content',
        'admin_content.id',
        'admin.profile_id',
      )
      .innerJoin('group_members as members', (join) =>
        join
          .onRef('members.group_id', '=', 'groups.id')
          .on('members.accepted_at', 'is not', null),
      )
      .leftJoin('group_member_bans as members_bans', (join) =>
        join
          .onRef('members_bans.group_id', '=', 'members.group_id')
          .onRef('members_bans.user_id', '=', 'members.user_id'),
      )
      .leftJoin('group_rules', 'group_rules.group_id', 'groups.id')
      .leftJoin('reminders', 'groups.reminder_id', 'reminders.id')
      .where('members_bans.id', 'is', null)
      .leftJoin('prayers', 'prayers.group_id', 'groups.id')
      .leftJoin('group_bans', 'group_bans.group_id', 'groups.id')
      .selectAll(['groups'])
      .select(({ eb, fn, exists, selectFrom }) => [
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(members.user_id)`),
            sql<string>`0`,
          )
          .as('members_count'),
        fn
          .coalesce(fn.count<string>(sql`DISTINCT(prayers.id)`), sql<string>`0`)
          .as('prayers_count'),
        eb
          .case()
          .when(
            exists(
              selectFrom('group_rules').whereRef(
                'group_rules.group_id',
                '=',
                'groups.id',
              ),
            ),
          )
          .then(
            jsonArrayFrom(
              selectFrom('group_rules')
                .whereRef('group_rules.group_id', '=', 'groups.id')
                .selectAll(),
            ),
          )
          .else(null)
          .end()
          .as('rules'),
      ])
      .select(['banner.path as banner', 'group_bans.created_at as banned_at'])
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
      .select((eb) =>
        eb
          .case()
          .when('reminders.id', 'is not', null)
          .then(
            jsonObjectFrom(
              eb.selectNoFrom([
                'reminders.id',
                'reminders.value',
                'reminders.days',
                'reminders.created_at',
                'reminders.time',
              ]),
            ),
          )
          .else(null)
          .end()
          .as('reminder'),
      )
      .groupBy([
        'groups.id',
        'banner.id',
        'admin.uid',
        'admin_content.path',
        'group_bans.id',
        'reminders.id',
      ])
      .$if(!!userId, (qb) =>
        qb
          .leftJoin('group_members as member', (join) =>
            join
              .on('member.user_id', '=', userId!)
              .onRef('member.group_id', '=', 'groups.id'),
          )
          .leftJoin('group_invitations', (join) =>
            join
              .onRef('group_invitations.group_id', '=', 'groups.id')
              .on('group_invitations.user_id', '=', userId!),
          )
          .leftJoin('group_member_bans', (join) =>
            join
              .onRef('group_member_bans.group_id', '=', 'groups.id')
              .on('group_member_bans.user_id', '=', userId!),
          )
          .select([
            'group_invitations.created_at as invited_at',
            'member.group_id',
            'member.created_at as joined_at',
            'member.moderator',
            'member.accepted_at',
            'group_member_bans.created_at as user_banned_at',
          ])
          .groupBy([
            'member.id',
            'group_invitations.id',
            'group_member_bans.id',
          ]),
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
      .innerJoin('contents as banner', 'banner.id', 'groups.banner_id')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .leftJoin(
        'contents as user_content',
        'user_content.id',
        'admin.profile_id',
      )
      .innerJoin('group_members', 'group_members.group_id', 'groups.id')
      .where('group_invitations.user_id', '=', userId)
      .$if(!!cursor, (eb) => eb.where('group_invitations.id', '<=', cursor!))
      .where('group_members.accepted_at', 'is not', null)
      .orderBy('group_invitations.id desc')
      .select(({ fn }) =>
        fn
          .coalesce(
            fn.count<string>(sql`DISTINCT(group_members.user_id)`),
            sql<string>`0`,
          )
          .as('members_count'),
      )
      .select(({ selectNoFrom }) =>
        jsonObjectFrom(
          selectNoFrom([
            'admin.uid',
            'admin.username',
            'user_content.path as profile',
            'admin.name',
          ]),
        ).as('admin'),
      )
      .select([
        'group_invitations.id as cursor',
        'groups.id',
        'groups.name',
        'groups.admin_id',
        'groups.membership_type',
        'banner.path as banner',
      ])
      .groupBy([
        'group_invitations.id',
        'groups.id',
        'admin.uid',
        'banner.path',
        'user_content.path',
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
    requestUserId,
  }: {
    query?: string;
    cursor?: string;
    userId?: string;
    requestUserId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('groups')
      .innerJoin('users as admin', 'admin.uid', 'groups.admin_id')
      .leftJoin(
        'contents as admin_content',
        'admin_content.id',
        'admin.profile_id',
      )
      .innerJoin('contents as banner', 'banner.id', 'groups.banner_id')
      .innerJoin('group_members as group_members_count', (join) =>
        join
          .onRef('group_members_count.group_id', '=', 'groups.id')
          .on('group_members_count.accepted_at', 'is not', null),
      )
      .leftJoin('group_member_bans as bans_count', (join) =>
        join
          .onRef('bans_count.group_id', '=', 'group_members_count.group_id')
          .onRef('bans_count.user_id', '=', 'group_members_count.user_id'),
      )
      .where('bans_count.id', 'is', null)
      .groupBy(['groups.id', 'admin.uid', 'admin_content.path', 'banner.path'])
      .$if(!requestUserId, (qb) =>
        qb.where('groups.membership_type', '!=', 'private'),
      )
      .$if(!!requestUserId, (qb) =>
        qb
          .leftJoin('group_members as requester', (join) =>
            join
              .onRef('requester.group_id', '=', 'groups.id')
              .on('requester.user_id', '=', requestUserId!),
          )
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
      .$if(!!userId, (eb) =>
        eb.innerJoin('group_members', (join) =>
          join
            .onRef('group_members.group_id', '=', 'groups.id')
            .on('group_members.accepted_at', 'is not', null)
            .on('group_members.user_id', '=', userId!),
        ),
      )
      .$if(!!cursor, (eb) =>
        eb.where(
          sql<string>`CONCAT(EXTRACT(EPOCH FROM groups.created_at), groups.id)`,
          '<=',
          Buffer.from(cursor!, 'base64url').toString(),
        ),
      )
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
            fn.count<string>(sql`DISTINCT(group_members_count.user_id)`),
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
      .orderBy(['groups.created_at desc', 'groups.id desc'])
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
    rules?: { title: string; description: string }[] | null | undefined;
    reminders?: InsertObject<DB, 'reminders'> | null | undefined;
    welcomeTitle?: string;
    welcomeMessage?: string;
  }) {
    const id = await this.dbService.transaction().execute(async (trx) => {
      let reminderId: number | undefined;
      if (body.reminders != null) {
        const { id: r_id } = await trx
          .insertInto('reminders')
          .values({
            days: body.reminders.days,
            time: body.reminders.time,
            value: body.reminders.value,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        reminderId = r_id;
      }
      const { id } = await trx
        .insertInto('groups')
        .values({
          name: body.name,
          admin_id: body.admin,
          description: body.description,
          membership_type: body.membershipType,
          banner_id: body.banner!,
          reminder_id: reminderId,
          welcome_title: body.welcomeTitle,
          welcome_message: body.welcomeMessage,
        })
        .returning('groups.id')
        .executeTakeFirstOrThrow();
      if (body.rules != null && body.rules.length > 0) {
        trx
          .insertInto('group_rules')
          .values(body.rules.map((rule) => ({ ...rule, group_id: id })))
          .executeTakeFirst();
      }
      trx
        .insertInto('group_members')
        .values({
          user_id: body.admin,
          group_id: id,
          moderator: new Date(),
          accepted_at: new Date(),
        })
        .executeTakeFirst();
      trx
        .insertInto('notification_group_settings')
        .values({
          group_id: id,
          user_id: body.admin,
          on_moderator_post: true,
          on_post: true,
        })
        .executeTakeFirst();
      return id;
    });
    return id;
  }

  async updateGroup(body: {
    groupId: string;
    name?: string;
    description?: string;
    banner?: number;
    requestUserId: string;
    rules?: { title: string; description: string }[] | null | undefined;
    reminders?: InsertObject<DB, 'reminders'> | null | undefined;
    welcomeTitle?: string;
    welcomeMessage?: string;
  }) {
    return this.dbService.transaction().execute(async (trx) => {
      let newReminderId: number | null = null;
      const { admin_id, banner, banned_at, reminder_id } = await trx
        .selectFrom('groups')
        .innerJoin('contents', 'contents.id', 'groups.banner_id')
        .leftJoin('group_bans', 'group_bans.group_id', 'groups.id')
        .leftJoin('group_rules', 'group_rules.group_id', 'groups.id')
        .where('groups.id', '=', body.groupId)
        .select([
          'groups.admin_id',
          'contents.path as banner',
          'group_bans.created_at as banned_at',
          'groups.reminder_id',
        ])
        .groupBy(['groups.id', 'contents.id', 'group_bans.created_at'])
        .executeTakeFirstOrThrow();
      newReminderId = reminder_id;
      if (banned_at != null) {
        throw new OperationNotAllowedError('This group has been banned');
      }
      if (admin_id !== body.requestUserId) {
        throw new OperationNotAllowedError('Only admin can make an update');
      }
      if (body.banner !== undefined) {
        this.storageService.publicBucket
          .file(banner)
          .delete({ ignoreNotFound: true });
      }
      await trx
        .deleteFrom('group_rules')
        .where('group_rules.group_id', '=', body.groupId)
        .executeTakeFirst();
      await trx
        .deleteFrom('reminders')
        .where('reminders.id', '=', reminder_id)
        .executeTakeFirst();
      if (body.rules != null && body.rules.length > 0) {
        await trx
          .insertInto('group_rules')
          .values(
            body.rules.map((rule) => ({ ...rule, group_id: body.groupId })),
          )
          .executeTakeFirst();
      }
      if (body.reminders != null) {
        const { id: r_id } = await trx
          .insertInto('reminders')
          .values({
            id: reminder_id ?? undefined,
            days: body.reminders.days,
            time: body.reminders.time,
            value: body.reminders.value,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        newReminderId = r_id;
      } else {
        newReminderId = null;
      }
      await this.dbService
        .updateTable('groups')
        .where('groups.id', '=', body.groupId)
        .set({
          name: body.name,
          description: body.description,
          banner_id: body.banner,
          updated_at: new Date(),
          reminder_id: newReminderId ?? null,
          welcome_title: body.welcomeTitle,
          welcome_message: body.welcomeMessage,
        })
        .executeTakeFirst();
    });
  }

  async joinGroup(body: { groupId: string; userId: string }) {
    const data = await this.dbService.transaction().execute(async (trx) => {
      const { banned_at } = await trx
        .selectFrom('groups')
        .leftJoin('group_bans', 'group_bans.group_id', 'groups.id')
        .groupBy(['groups.id', 'group_bans.id'])
        .where('groups.id', '=', body.groupId)
        .select(['groups.id', 'group_bans.created_at as banned_at'])
        .executeTakeFirstOrThrow();
      if (banned_at != null) {
        throw new OperationNotAllowedError('Group has been banned');
      }
      const data = await trx
        .selectFrom('group_member_bans')
        .where('group_member_bans.group_id', '=', body.groupId)
        .where('group_member_bans.user_id', '=', body.userId)
        .executeTakeFirst();
      if (data) {
        throw new OperationNotAllowedError(
          'You have been banned from the group',
        );
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

  async leaveGroup(body: { groupId: string; requestUserId: string }) {
    return this.dbService.transaction().execute(async (trx) => {
      const { admin_id } = await trx
        .selectFrom('groups')
        .where('groups.id', '=', body.groupId)
        .select('groups.admin_id')
        .executeTakeFirstOrThrow();
      if (admin_id === body.requestUserId) {
        throw new OperationNotAllowedError('Admin cannot leave the group');
      }
      await trx
        .deleteFrom('group_members')
        .where('group_id', '=', body.groupId)
        .where('user_id', '=', body.requestUserId)
        .returning('group_members.id')
        .executeTakeFirstOrThrow();
    });
  }

  async fetchPendingInvites({
    groupId,
    cursor,
    query,
  }: {
    groupId: string;
    cursor?: number;
    query?: string;
  }) {
    const data = await this.dbService
      .selectFrom('group_invitations')
      .innerJoin('users', 'group_invitations.user_id', 'users.uid')
      .leftJoin('contents', 'contents.id', 'users.profile_id')
      .where('group_invitations.group_id', '=', groupId)
      .orderBy('group_invitations.id desc')
      .$if(!!cursor, (eb) => eb.where('group_invitations.id', '<=', cursor!))
      .$if(!!query, (eb) =>
        eb.where(({ or, eb }) =>
          or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%{query}%`),
          ]),
        ),
      )
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

  async fetchMembers({
    groupId,
    cursor,
    moderator,
    requests = false,
    query,
    bans = false,
  }: {
    groupId: string;
    query?: string;
    cursor?: string;
    moderator?: boolean | null;
    requests?: boolean;
    bans: boolean;
  }) {
    cursor = !!cursor
      ? Buffer.from(cursor!, 'base64url').toString()
      : undefined;
    const data = await this.dbService
      .selectFrom('group_members')
      .innerJoin('users', 'group_members.user_id', 'users.uid')
      .leftJoin('contents', 'contents.id', 'users.profile_id')
      .where('group_members.group_id', '=', groupId)
      .where('accepted_at', requests ? 'is' : 'is not', null)
      .$if(bans != null, (qb) =>
        qb
          .leftJoin('group_member_bans', (join) =>
            join
              .onRef('group_member_bans.user_id', '=', 'group_members.user_id')
              .onRef(
                'group_member_bans.group_id',
                '=',
                'group_members.group_id',
              ),
          )
          .$if(bans === true, (rs) =>
            rs.where('group_member_bans.id', 'is not', null),
          )
          .$if(bans === false, (rs) =>
            rs.where('group_member_bans.id', 'is', null),
          ),
      )
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
      .$if(!!query, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%${query}%`),
          ]),
        ),
      )
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
      .orderBy(['group_members.accepted_at asc', 'group_members.id asc'])
      .limit(11)
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

  async deleteGroup(groupId: string, requestUserId: string) {
    await this.dbService
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const { admin_id } = await trx
          .selectFrom('groups')
          .where('groups.id', '=', groupId)
          .select(['groups.admin_id'])
          .executeTakeFirstOrThrow();
        if (admin_id !== requestUserId) {
          throw new OperationNotAllowedError('Only admin can delete a group');
        }
        const { banner, c, p } = await trx
          .selectFrom('groups')
          .where('groups.id', '=', groupId)
          .innerJoin('contents as banner', 'banner.id', 'groups.banner_id')
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
          .groupBy(['groups.id', 'banner.path'])
          .executeTakeFirstOrThrow();
        if (parseInt(c || '0') > 0 || parseInt(p || '0') > 0) {
          throw new OperationNotAllowedError(
            'groups must have no prayers and corporate prayers',
          );
        }
        trx
          .deleteFrom('notification_group_settings')
          .where('notification_group_settings.group_id', '=', groupId)
          .execute();
        trx
          .deleteFrom('group_members')
          .where('group_members.group_id', '=', groupId)
          .execute();
        trx
          .deleteFrom('groups')
          .where('groups.id', '=', groupId)
          .executeTakeFirstOrThrow();

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
    requestUserId,
  }: {
    groupId: string;
    userId: string;
    requestUserId: string;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      const { moderator, banned_at } = await trx
        .selectFrom('group_members')
        .leftJoin('group_bans', 'group_bans.group_id', 'group_members.group_id')
        .where('group_members.group_id', '=', groupId)
        .where('group_members.user_id', '=', requestUserId)
        .select([
          'group_members.moderator',
          'group_bans.created_at as banned_at',
        ])
        .executeTakeFirstOrThrow();
      if (!moderator) {
        throw new OperationNotAllowedError(
          'Only moderators are able to accept the requests',
        );
      }
      if (!!banned_at) {
        throw new OperationNotAllowedError('Group has been banned');
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
    requestUserId,
  }: {
    groupId: string;
    userId: string;
    value?: boolean;
    requestUserId: string;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      const { admin_id, banned_at } = await trx
        .selectFrom('groups')
        .leftJoin('group_bans', 'group_bans.group_id', 'groups.id')
        .where('groups.id', '=', groupId)
        .select(['groups.admin_id', 'group_bans.created_at as banned_at'])
        .executeTakeFirstOrThrow();
      if (!!banned_at) {
        throw new OperationNotAllowedError('Group has been banned');
      }
      if (requestUserId !== admin_id) {
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

  async handleBan({
    groupId,
    userId,
    value,
    requestUserId,
  }: {
    groupId: string;
    userId: string;
    value?: boolean;
    requestUserId: string;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      const { moderator, banned_at, target_moderator } = await trx
        .selectFrom('group_members')
        .leftJoin('group_bans', 'group_bans.group_id', 'group_members.group_id')
        .where('group_members.group_id', '=', groupId)
        .where('group_members.user_id', '=', requestUserId)
        .innerJoin('group_members as target_group_members', (join) =>
          join
            .onRef(
              'target_group_members.group_id',
              '=',
              'group_members.group_id',
            )
            .on('target_group_members.user_id', '=', userId),
        )
        .select([
          'group_members.moderator',
          'group_bans.created_at as banned_at',
          'target_group_members.moderator as target_moderator',
        ])
        .executeTakeFirstOrThrow();
      if (!moderator) {
        throw new OperationNotAllowedError(
          'Only moderators are able to ban the members',
        );
      }
      if (target_moderator) {
        throw new OperationNotAllowedError('Moderator cannot be banned');
      }
      if (banned_at) {
        throw new OperationNotAllowedError('Group has been banned');
      }
      if (value) {
        return trx
          .insertInto('group_member_bans')
          .values({ group_id: groupId, user_id: userId })
          .executeTakeFirstOrThrow();
      }
      return trx
        .deleteFrom('group_member_bans')
        .where('group_id', '=', groupId)
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
    });
  }

  async handleKick({
    groupId,
    userId,
    requestUserId,
  }: {
    groupId: string;
    userId: string;
    requestUserId: string;
  }) {
    return await this.dbService.transaction().execute(async (trx) => {
      if (userId === requestUserId) {
        throw new OperationNotAllowedError('You cannot kick yourself');
      }
      const { moderator, banned_at, admin_id, targetModerator } = await trx
        .selectFrom('groups')
        .innerJoin('group_members', (join) =>
          join
            .on('group_members.user_id', '=', requestUserId)
            .onRef('group_members.group_id', '=', 'groups.id'),
        )
        .innerJoin('group_members as target', (join) =>
          join
            .on('target.user_id', '=', userId)
            .onRef('target.group_id', '=', 'groups.id'),
        )
        .leftJoin('group_bans', 'group_bans.group_id', 'groups.id')
        .where('groups.id', '=', groupId)
        .select([
          'target.moderator as targetModerator',
          'groups.admin_id',
          'group_members.moderator',
          'group_bans.created_at as banned_at',
        ])
        .executeTakeFirstOrThrow();
      if (banned_at != null) {
        throw new OperationNotAllowedError('Group has been banned');
      }
      if (moderator == null) {
        throw new OperationNotAllowedError('Only moderator can kick a user');
      }
      if (targetModerator != null) {
        throw new OperationNotAllowedError('You cannot kick a moderator');
      }
      if (userId === admin_id) {
        throw new OperationNotAllowedError('You cannot kick admin');
      }
      return this.dbService
        .deleteFrom('group_members')
        .where('group_id', '=', groupId)
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
    });
  }

  async inviteUser({
    groupId,
    userIds,
    value,
    requestUserId,
  }: {
    groupId: string;
    userIds: string[];
    value: boolean;
    requestUserId: string;
  }) {
    return this.dbService.transaction().execute(async (trx) => {
      const { moderator, banned_at } = await trx
        .selectFrom('group_members')
        .leftJoin('group_bans', 'group_bans.group_id', 'group_members.group_id')
        .where('group_members.group_id', '=', groupId)
        .where('group_members.user_id', '=', requestUserId)
        .select([
          'group_members.moderator',
          'group_bans.created_at as banned_at',
        ])
        .executeTakeFirstOrThrow();
      if (!!banned_at) {
        throw new OperationNotAllowedError('Group has been banned');
      }
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
