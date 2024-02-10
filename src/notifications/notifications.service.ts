import { Injectable } from '@nestjs/common';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { FirebaseService } from 'src/firebase/firebase.service';
import { KyselyService } from 'src/kysely/kysely.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dbService: KyselyService,
    private readonly firebaseService: FirebaseService,
    private readonly storageService: StorageService,
  ) {}

  async fetchNotifications(userId: string, cursor?: number) {
    const data = await this.dbService
      .selectFrom('notifications')
      .leftJoin('users as target', 'target.uid', 'notifications.target_user_id')
      .leftJoin('contents', 'contents.id', 'target.profile_id')
      .selectAll(['notifications'])
      .select((eb) =>
        eb
          .case()
          .when('notifications.target_user_id', 'is not', null)
          .then(
            jsonObjectFrom(
              eb.selectNoFrom([
                'target.uid',
                'target.name',
                'contents.path as profile',
                'target.username',
              ]),
            ),
          )
          .end()
          .as('target_user'),
      )
      .where('notifications.user_id', '=', userId)
      .limit(11)
      .orderBy('notifications.id desc')
      .$if(!!cursor, (eb) => eb.where('notifications.id', '<=', cursor!))
      .execute();
    data.forEach((d) => {
      if (d.target_user?.profile) {
        d.target_user.profile = this.storageService.getPublicUrl(
          d.target_user.profile,
        );
      }
    });
    return data;
  }

  async fetchNotificationsLatestDate(userId: string) {
    const data = await this.dbService
      .selectFrom('users')
      .leftJoin('group_invitations', 'group_invitations.user_id', 'users.uid')
      .leftJoin('notifications', 'notifications.user_id', 'users.uid')
      .where('users.uid', '=', userId)
      .select((eb) =>
        eb.fn.max('group_invitations.created_at').as('latest_invitation'),
      )
      .select((eb) =>
        eb.fn.max('notifications.created_at').as('latest_notification'),
      )
      .executeTakeFirst();
    if (data == null) {
      return null;
    }
    const dates = [data?.latest_invitation, data.latest_notification].filter(
      (v) => v != null,
    ) as Date[];
    dates.sort((a, b) => b.getTime() - a.getTime());
    return dates.shift() ?? null;
  }

  async notifyUserFollowed(followingFrom: string, followingTo: string) {
    const { username } = await this.dbService
      .selectFrom('users')
      .where('users.uid', '=', followingFrom)
      .select('username')
      .executeTakeFirstOrThrow();
    await Promise.all([
      this.dbService
        .insertInto('notifications')
        .values({
          user_id: followingTo,
          target_user_id: followingFrom,
          type: 'followed',
        })
        .executeTakeFirst(),
      this.firebaseService.send({
        userId: [followingTo],
        data: { userId: followingFrom, type: 'followed', username },
      }),
    ]);
  }

  async notifyJoinGroup(groupId: string, userId: string, pending?: boolean) {
    const [{ username }, { name, mods }] = await Promise.all([
      this.dbService
        .selectFrom('users')
        .where('users.uid', '=', userId)
        .select('username')
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('groups')
        .innerJoin('group_members', 'group_members.group_id', 'groups.id')
        .where('groups.id', '=', groupId)
        .where('group_members.moderator', 'is not', null)
        .select((eb) =>
          jsonArrayFrom(eb.selectNoFrom('group_members.user_id')).as('mods'),
        )
        .select('groups.name')
        .executeTakeFirstOrThrow(),
    ]);
    if (mods.length > 0) {
      this.dbService
        .insertInto('notifications')
        .values(
          mods.map(({ user_id }) => ({
            user_id,
            group_id: groupId,
            target_user_id: userId,
            type: pending ? 'group_join_requested' : 'group_joined',
          })),
        )
        .executeTakeFirst();
      this.firebaseService.send({
        userId: mods.map(({ user_id }) => user_id),
        data: {
          groupId,
          username,
          groupName: name,
          type: pending ? 'group_join_requested' : 'group_joined',
        },
      });
    }
  }

  async notifyGroupRequestAccepted(groupId: string, userId: string) {
    const { name } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .select('groups.name')
      .executeTakeFirstOrThrow();
    this.dbService
      .insertInto('notifications')
      .values({
        user_id: userId,
        type: 'group_accepted',
        group_id: groupId,
      })
      .executeTakeFirst();
    this.firebaseService.send({
      userId: [userId],
      data: { groupId, groupName: name, type: 'group_accepted' },
    });
  }

  async notifyMemberPromoted(groupId: string, userId: string) {
    const { name } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .select('groups.name')
      .executeTakeFirstOrThrow();
    this.dbService
      .insertInto('notifications')
      .values({
        user_id: userId,
        type: 'group_promoted',
        group_id: groupId,
      })
      .executeTakeFirst();
    this.firebaseService.send({
      userId: [userId],
      data: { groupId, groupName: name, type: 'group_promoted' },
    });
  }

  async prayForUser({
    prayId,
    prayerId,
    sender,
  }: {
    prayId: number;
    prayerId: string;
    sender: string;
  }) {
    const [{ username: senderUsername }, { uid: writerUid, fellows }] =
      await Promise.all([
        this.dbService
          .selectFrom('users')
          .where('users.uid', '=', sender)
          .select('users.username')
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('prayers')
          .leftJoin('prayer_prays', 'prayer_prays.prayer_id', 'prayers.id')
          .innerJoin('users', 'users.uid', 'prayers.user_id')
          .where('prayers.id', '=', prayerId)
          .select(['users.uid'])
          .select(({ selectNoFrom }) =>
            jsonArrayFrom(selectNoFrom('prayer_prays.user_id')).as('fellows'),
          )
          .executeTakeFirstOrThrow(),
      ]);
    const target = fellows
      .map(({ user_id }) => user_id)
      .filter(
        (value) => value !== writerUid && value !== sender && value != null,
      ) as string[];
    if (target.length > 0) {
      this.dbService
        .insertInto('notifications')
        .values(
          target.map((t) => ({
            user_id: t,
            target_user_id: sender,
            type: 'prayed',
            prayer_id: prayerId,
            pray_id: prayId,
          })),
        )
        .executeTakeFirst();
      this.firebaseService.send({
        userId: target,
        data: { prayerId, type: 'prayed', username: senderUsername },
      });
    }
  }

  async notifyCorporatePrayerCreated({
    groupId,
    prayerId,
    uploaderId,
  }: {
    groupId: string;
    prayerId: string;
    uploaderId: string;
  }) {
    const [data, { username }] = await Promise.all([
      this.dbService
        .selectFrom('group_members')
        .innerJoin('groups', 'groups.id', 'group_members.group_id')
        .where('group_members.group_id', '=', groupId)
        .where('group_members.accepted_at', 'is not', null)
        .select(['group_members.user_id', 'groups.name'])
        .execute(),
      this.dbService
        .selectFrom('users')
        .where('users.uid', '=', uploaderId)
        .select('users.username')
        .executeTakeFirstOrThrow(),
    ]);
    if (data == null) {
      return;
    }
    const userIds = data
      .map(({ user_id }) => user_id)
      .filter((value) => value !== uploaderId && value != null) as string[];
    if (userIds.length > 0) {
      this.dbService
        .insertInto('notifications')
        .values(
          userIds.map((userId) => ({
            user_id: userId,
            target_user_id: uploaderId,
            group_id: groupId,
            type: 'group_corporate_posted',
            corporate_id: prayerId,
          })),
        )
        .executeTakeFirst();
      this.firebaseService.send({
        userId: userIds,
        data: {
          corporateId: prayerId,
          type: 'group_corporate_posted',
          groupName: data[0].name,
          username,
        },
      });
    }
  }

  async notifyPrayerCreated({
    corporateId,
    groupId,
    prayerId,
    userId,
    anon,
  }: {
    corporateId?: string;
    groupId?: string;
    prayerId: string;
    userId: string;
    anon?: boolean;
  }) {
    let _corporateName: string | undefined = undefined;
    let _groupName: string | undefined = undefined;
    let _username: string;
    let _members: string[];
    if (corporateId) {
      const [{ user_id, title, users }, { username }] = await Promise.all([
        this.dbService
          .selectFrom('corporate_prayers')
          .leftJoin(
            'notification_corporate_settings',
            'notification_corporate_settings.corporate_id',
            'corporate_prayers.id',
          )
          .select(['corporate_prayers.user_id', 'corporate_prayers.title'])
          .where('corporate_prayers.id', '=', corporateId)
          .where('notification_corporate_settings.on_post', 'is', true)
          .select((eb) =>
            jsonArrayFrom(eb.selectNoFrom('corporate_prayers.user_id')).as(
              'users',
            ),
          )
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('users')
          .select(['users.username'])
          .where('users.uid', '=', userId)
          .executeTakeFirstOrThrow(),
      ]);
      _corporateName = title;
      _username = username;
      _members = [user_id, ...users.map(({ user_id }) => user_id)].filter(
        (value) => value != null && value !== userId,
      ) as string[];
    } else if (groupId) {
      const { name, members, username } = await this.dbService
        .selectFrom('groups')
        .innerJoin(
          'notification_group_settings',
          'notification_group_settings.group_id',
          'groups.id',
        )
        .innerJoin('group_members', 'group_members.group_id', 'groups.id')
        .where('groups.id', '=', groupId)
        .where(({ and, or, eb, selectFrom }) =>
          or([
            eb('notification_group_settings.on_post', 'is', true),
            and([
              eb(
                selectFrom('group_members')
                  .where('group_members.user_id', '=', userId)
                  .where('group_members.group_id', '=', groupId)
                  .select('moderator'),
                'is not',
                null,
              ),
              eb('notification_group_settings.on_moderator_post', 'is', true),
            ]),
          ]),
        )
        .select('groups.name')
        .select((eb) =>
          jsonArrayFrom(
            eb.selectNoFrom('notification_group_settings.user_id'),
          ).as('members'),
        )
        .select(({ selectFrom }) =>
          selectFrom('users')
            .select('users.username')
            .where('users.uid', '=', userId)
            .as('username'),
        )
        .executeTakeFirstOrThrow();
      _groupName = name;
      _username = username!;
      _members = members
        .map(({ user_id }) => user_id)
        .filter((value) => value !== userId && value != null) as string[];
    } else {
      const data = await this.dbService
        .selectFrom('users')
        .innerJoin('user_follows', 'user_follows.follower_id', 'users.uid')
        .where('users.uid', '=', userId)
        .select('users.username')
        .select((eb) =>
          jsonArrayFrom(eb.selectNoFrom('user_follows.following_id')).as(
            'followings',
          ),
        )
        .executeTakeFirstOrThrow();
      _username = data.username;
      _members = data.followings
        .map(({ following_id }) => following_id)
        .filter((v) => v != null) as string[];
    }
    if (_members.length > 0) {
      this.dbService
        .insertInto('notifications')
        .values(
          _members.map((id) => ({
            user_id: id,
            target_user_id: anon ? null : userId,
            prayer_id: prayerId,
            type: 'prayer_posted',
          })),
        )
        .executeTakeFirst();
      const data = {
        prayerId,
        corporateId,
        groupId,
        username: anon ? null : _username,
        groupName: _groupName,
        corporateName: _corporateName,
      };
      Object.keys(data).forEach((key) =>
        data[key] === undefined ? delete data[key] : {},
      );
      this.firebaseService.send({
        userId: _members,
        data: data as any,
      });
    }
  }

  async cleanupNotification({
    userId,
    groupId,
    prayId,
    prayerId,
    corporateId,
  }: {
    userId?: string;
    groupId?: string;
    prayId?: number;
    prayerId?: string;
    corporateId?: string;
  }) {
    this.dbService
      .deleteFrom('notifications')
      .$if(!!userId, (qb) =>
        qb.where('notifications.target_user_id', '=', userId!),
      )
      .$if(!!groupId, (qb) => qb.where('notifications.group_id', '=', groupId!))
      .$if(!!prayId, (qb) => qb.where('notifications.pray_id', '=', prayId!))
      .$if(!!prayerId, (qb) =>
        qb.where('notifications.prayer_id', '=', prayerId!),
      )
      .$if(!!corporateId, (qb) =>
        qb.where('notifications.corporate_id', '=', corporateId!),
      )
      .executeTakeFirst();
  }
}
