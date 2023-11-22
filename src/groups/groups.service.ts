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
      .select(({ selectFrom }) =>
        selectFrom('group_members')
          .whereRef('group_members.group_id', '=', 'groups.id')
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
        ).as('admin'),
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
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .whereRef('users.uid', '=', 'groups.admin_id')
            .select([
              'users.uid',
              'users.username',
              'users.profile',
              'users.name',
            ]),
        ).as('admin'),
      )
      .select(['id', 'name', 'admin_id', 'membership_type', 'banner'])
      .limit(11)
      .execute();
    data.forEach((d) => {
      if (d.admin?.profile) {
        d.admin.profile = this.storageService.publicBucket
          .file(d.admin.profile)
          .publicUrl();
      }
    });
    return data;
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
    return this.dbService
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
        member.profile = this.storageService.getPublicUrl(member.profile);
      }
    });
    return members;
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
