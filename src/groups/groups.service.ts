import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
      .select(({ selectFrom }) =>
        selectFrom('group_members')
          .where('accepted_at', 'is not', null)
          .select(({ fn }) =>
            fn
              .coalesce(fn.count<string>('group_members.id'), sql<string>`0`)
              .as('value'),
          )
          .as('members_count'),
      )
      .select(({ selectFrom }) =>
        selectFrom('prayers')
          .whereRef('prayers.group_id', '=', 'groups.id')
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
            .whereRef('users.uid', '=', 'groups.admin_id'),
        ).as('user'),
      )
      .selectAll(['groups'])
      .$if(!!userId, (eb) =>
        eb.select(({ selectFrom }) => [
          selectFrom('group_members')
            .whereRef('group_members.group_id', '=', 'groups.id')
            .where('group_members.user_id', '=', userId!)
            .select('group_members.created_at')
            .as('joined_at'),
          selectFrom('group_members')
            .whereRef('group_members.group_id', '=', 'groups.id')
            .where('group_members.user_id', '=', userId!)
            .select('group_members.accepted_at')
            .as('accepted_at'),
          selectFrom('group_members')
            .whereRef('group_members.group_id', '=', 'groups.id')
            .where('group_members.user_id', '=', userId!)
            .select('group_members.moderator')
            .as('moderator'),
        ]),
      )
      .executeTakeFirst();
    if (data == null) {
      return data;
    }
    if (data.banner != null) {
      (data.banner as string) = this.storageService.publicBucket
        .file(data.banner)
        .publicUrl();
    }
    if (data.user?.profile) {
      data.user.profile = this.storageService.publicBucket
        .file(data.user.profile)
        .publicUrl();
    }
    return {
      ...data,
      members_count: parseInt(data.members_count ?? '0', 10),
      prayers_count: parseInt(data.prayers_count ?? '0', 10),
    };
  }

  async fetchGroups({
    query,
    cursor,
    userId,
  }: {
    query?: string;
    cursor?: string;
    userId?: string;
  }) {
    const data = await this.dbService
      .selectFrom('groups')
      .$if(!!query, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('groups.name', 'like', `%${query}%`),
            eb('groups.description', 'like', `%${query}%`),
          ]),
        ),
      )
      .$if(!!cursor, (eb) => eb.where('id', '=', cursor!))
      .$if(!!userId, (eb) =>
        eb.where(({ exists }) =>
          exists(({ selectFrom }) =>
            selectFrom('group_members')
              .whereRef('group_members.group_id', '=', 'groups.id')
              .where('group_members.user_id', '=', userId!),
          ),
        ),
      )
      .orderBy('created_at desc')
      .select(['id'])
      .limit(11)
      .execute();
    return data.map(({ id }) => id);
  }

  async createGroup(body: {
    name: string;
    description: string;
    admin: string;
    membershipType: 'open' | 'restricted' | 'private';
    banner?: string;
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
            banner: body.banner,
          })
          .executeTakeFirstOrThrow(),
        trx
          .insertInto('group_members')
          .values({
            user_id: body.admin,
            group_id: newId,
            moderator: new Date(),
            accepted_at: new Date(),
          })
          .executeTakeFirstOrThrow(),
      ]);
    });
    return newId;
  }

  async updateGroup(body: {
    groupId: string;
    name?: string;
    description?: string;
    banner?: string;
    requestUser: string;
  }) {
    const { admin_id, banner } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', body.groupId)
      .select(['admin_id', 'banner'])
      .executeTakeFirstOrThrow();
    if (admin_id !== body.requestUser) {
      throw new HttpException(
        'Only admin can edit the group',
        HttpStatus.FORBIDDEN,
      );
    }
    if (banner != null) {
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
      })
      .executeTakeFirstOrThrow();
  }

  async joinGroup(body: { groupId: string; userId: string }) {
    const [group, member] = await Promise.all([
      this.dbService
        .selectFrom('groups')
        .where('groups.id', '=', body.groupId)
        .select('membership_type')
        .executeTakeFirst(),
      this.dbService
        .selectFrom('group_members')
        .where('group_members.group_id', '=', body.groupId)
        .where('group_members.user_id', '=', body.userId)
        .select(['group_members.accepted_at', 'group_members.created_at'])
        .executeTakeFirst(),
    ]);
    if (member?.created_at) {
      return member?.accepted_at ?? null;
    }
    if (group == null) {
      throw new HttpException('Group does not exist', HttpStatus.BAD_REQUEST);
    }
    await this.dbService
      .insertInto('group_members')
      .values({
        user_id: body.userId,
        group_id: body.groupId,
        accepted_at: group.membership_type === 'open' ? new Date() : null,
      })
      .executeTakeFirstOrThrow();

    return group.membership_type === 'open' ? new Date() : null;
  }

  async leaveGroup(body: { groupId: string; userId: string }) {
    const group = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', body.groupId)
      .select(['membership_type', 'admin_id'])
      .executeTakeFirst();
    if (group == null) {
      throw new HttpException('Group does not exist', HttpStatus.BAD_REQUEST);
    }
    if (group.admin_id === body.userId) {
      throw new HttpException(
        'Admin cannot leave the group',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.dbService
      .deleteFrom('group_members')
      .where('group_id', '=', body.groupId)
      .where('user_id', '=', body.userId)
      .executeTakeFirstOrThrow();
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
      cursor?: number;
      moderator?: boolean;
      requests?: boolean;
    },
  ) {
    const members = await this.dbService
      .selectFrom('group_members')
      .where('group_members.group_id', '=', groupId)
      .$if(!!cursor, (qb) => qb.where('id', '=', cursor!))
      .$if(moderator != null, (qb) =>
        qb.where('moderator', moderator ? 'is not' : 'is', null),
      )
      .where('accepted_at', requests ? 'is' : 'is not', null)
      .leftJoin('users', 'group_members.user_id', 'users.uid')
      .$if(!!query, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('name', 'like', `%${query}%`),
            eb('username', 'like', `%${query}%`),
          ]),
        ),
      )
      .orderBy('group_members.moderator')
      .orderBy('group_members.accepted_at desc')
      .limit(21)
      .select([
        'users.uid',
        'users.name',
        'users.username',
        'users.profile',
        'group_members.moderator',
      ])
      .execute();
    members.forEach((member) => {
      if (member.profile) {
        member.profile = this.storageService.publicBucket
          .file(member.profile)
          .publicUrl();
      }
    });
    return members;
  }

  async deleteGroup(groupId: string) {
    const [data, prayer_media] = await Promise.all([
      this.dbService
        .selectFrom('groups')
        .selectAll()
        .where('groups.id', '=', groupId)
        .executeTakeFirst(),
      this.dbService
        .selectFrom('prayers')
        .select(['prayers.media'])
        .where('prayers.group_id', '=', groupId)
        .execute(),
    ]);
    if (data == null) {
      throw Error('Unable to find the group');
    }
    await Promise.all([
      ...prayer_media.map(({ media }) =>
        media
          ? this.storageService.publicBucket
              .file(media)
              .delete({ ignoreNotFound: true })
          : null,
      ),
      this.dbService
        .deleteFrom('group_members')
        .where('group_id', '=', groupId)
        .execute(),
      this.dbService.deleteFrom('groups').where('id', '=', groupId).execute(),
      this.dbService
        .deleteFrom('corporate_prayers')
        .where('group_id', '=', groupId)
        .execute(),
      this.dbService
        .deleteFrom('prayers')
        .where('group_id', '=', groupId)
        .execute(),
    ]);
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
  }: {
    groupId: string;
    userId: string;
  }) {
    return this.dbService
      .updateTable('group_members')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .set({ moderator: new Date() })
      .executeTakeFirstOrThrow();
  }
}
