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
      .leftJoin('groups', 'groups.id', 'notifications.group_id')
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
                'target.profile',
                'target.username',
              ]),
            ),
          )
          .end()
          .as('target_user'),
      )
      .select((eb) =>
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
                'groups.banner',
              ]),
            ),
          )
          .end()
          .as('group'),
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
      if (d.group?.banner) {
        d.group.banner = this.storageService.getPublicUrl(d.group.banner);
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
    const data = await this.dbService
      .selectFrom('users')
      .where('users.uid', '=', followingFrom)
      .select('username')
      .executeTakeFirst();
    if (data == null) {
      return;
    }
    this.dbService
      .insertInto('notifications')
      .values({
        user_id: followingTo,
        target_user_id: followingFrom,
        message: `${data.username} started following you.`,
      })
      .executeTakeFirst();
    return this.firebaseService.send({
      userId: [followingTo],
      title: 'Prayer',
      body: `${data.username} started following you.`,
      data: { userId: followingFrom },
    });
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
    this.dbService
      .insertInto('notifications')
      .values(
        mods.map(({ user_id }) => ({
          user_id,
          group_id: groupId,
          message: `${username} has ${
            !pending ? 'joined the group' : 'requested to join the group'
          }`,
        })),
      )
      .executeTakeFirst();
    this.firebaseService.send({
      userId: mods.map(({ user_id }) => user_id),
      title: name,
      body: `${username} has ${
        !pending ? 'joined the group' : 'requested to join the group'
      }`,
      data: { groupId },
    });
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
        message: `Congratulations! You are now the member of ${name}`,
        group_id: groupId,
      })
      .executeTakeFirst();
    this.firebaseService.send({
      userId: [userId],
      title: name,
      body: `Congratulations! You are now the member of ${name}`,
      data: { groupId },
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
        message: `You've been promoted to moderator of ${name}`,
        group_id: groupId,
      })
      .executeTakeFirst();
    this.firebaseService.send({
      userId: [userId],
      title: name,
      body: `You've been promoted to moderator of ${name}`,
      data: { groupId },
    });
  }

  async prayForUser(prayerId: string, sender: string, notifyFellows?: boolean) {
    const [
      { username: senderUsername },
      { uid: writerUid, username: writerUsername, fellows },
    ] = await Promise.all([
      this.dbService
        .selectFrom('users')
        .where('users.uid', '=', sender)
        .select('users.username')
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('prayers')
        .leftJoin('prayer_prays', 'prayer_prays.prayer_id', 'prayers.id')
        .leftJoin('users', 'users.uid', 'prayers.user_id')
        .where('prayers.id', '=', prayerId)
        .select(['users.uid', 'users.username'])
        .$if(!!notifyFellows, (qb) =>
          qb.select(({ selectNoFrom }) =>
            jsonArrayFrom(selectNoFrom('prayer_prays.user_id')).as('fellows'),
          ),
        )
        .executeTakeFirstOrThrow(),
    ]);
    if (fellows) {
      const target = fellows
        .map(({ user_id }) => user_id)
        .filter(
          (value) => value !== writerUid && value !== sender && value != null,
        ) as string[];
      this.dbService
        .insertInto('notifications')
        .values(
          target.map((t) => ({
            user_id: t,
            target_user_id: sender,
            message: `${senderUsername} has prayed for you`,
            prayer_id: prayerId,
          })),
        )
        .executeTakeFirst();
      this.firebaseService.send({
        userId: target,
        title: 'Prayer',
        body: `${senderUsername} has prayed for ${writerUsername}`,
        data: { prayerId },
      });
    }
    if (sender !== writerUid) {
      this.dbService
        .insertInto('notifications')
        .values({
          user_id: writerUid!,
          target_user_id: sender,
          message: `${senderUsername} has prayed for you`,
          prayer_id: prayerId,
        })
        .executeTakeFirst();
      this.firebaseService.send({
        userId: [writerUid!],
        title: 'Prayer',
        body: `${senderUsername} has prayed for you`,
        data: { prayerId },
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
    const { name, members } = await this.dbService
      .selectFrom('groups')
      .leftJoin('group_members', 'group_members.group_id', 'groups.id')
      .where('groups.id', '=', groupId)
      .where('group_members.accepted_at', 'is not', null)
      .select('groups.name')
      .select((eb) =>
        jsonArrayFrom(eb.selectNoFrom('group_members.user_id')).as('members'),
      )
      .executeTakeFirstOrThrow();
    const userIds = members
      .map(({ user_id }) => user_id)
      .filter((value) => value !== uploaderId && value != null) as string[];
    this.dbService
      .insertInto('notifications')
      .values(
        userIds.map((userId) => ({
          user_id: userId,
          message: `${name} has a new corporate prayer`,
          group_id: groupId,
          corporate_id: prayerId,
        })),
      )
      .executeTakeFirst();
    this.firebaseService.send({
      userId: userIds,
      title: 'Prayer',
      body: `${name} has a new corporate prayer`,
      data: { corporateId: prayerId },
    });
  }

  async notifyPrayerCreated({
    corporateId,
    groupId,
    prayerId,
    userId,
  }: {
    corporateId?: string;
    groupId?: string;
    prayerId: string;
    userId: string;
  }) {
    if (corporateId) {
      const [{ user_id, title, users }, { username }] = await Promise.all([
        this.dbService
          .selectFrom('corporate_prayers')
          .leftJoin('prayers', 'prayers.corporate_id', 'corporate_prayers.id')
          .select(['corporate_prayers.user_id', 'corporate_prayers.title'])
          .where('corporate_prayers.id', '=', corporateId)
          .select((eb) =>
            jsonArrayFrom(eb.selectNoFrom('prayers.user_id')).as('users'),
          )
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('users')
          .select(['users.username'])
          .where('users.uid', '=', userId)
          .executeTakeFirstOrThrow(),
      ]);
      const target = [user_id, ...users.map(({ user_id }) => user_id)].filter(
        (value) => value != null && value !== userId,
      ) as string[];
      this.dbService
        .insertInto('notifications')
        .values(
          target.map((id) => ({
            user_id: id,
            target_user_id: userId,
            prayer_id: prayerId,
            message: `${username} has posted a prayer`,
          })),
        )
        .executeTakeFirst();
      this.firebaseService.send({
        userId: target,
        title: title,
        body: `${username} has posted a prayer`,
        data: { prayerId },
      });
    } else if (groupId) {
      const [{ name, members }, { username }] = await Promise.all([
        this.dbService
          .selectFrom('groups')
          .leftJoin('group_members', 'group_members.group_id', 'groups.id')
          .where('groups.id', '=', groupId)
          .select('groups.name')
          .select((eb) =>
            jsonArrayFrom(eb.selectNoFrom('group_members.user_id')).as(
              'members',
            ),
          )
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('users')
          .select('users.username')
          .where('users.uid', '=', userId)
          .executeTakeFirstOrThrow(),
      ]);
      const target = members
        .map(({ user_id }) => user_id)
        .filter((value) => value !== userId && value != null) as string[];
      this.dbService
        .insertInto('notifications')
        .values(
          target.map((id) => ({
            user_id: id,
            target_user_id: userId,
            prayer_id: prayerId,
            message: `${username} has posted a prayer`,
          })),
        )
        .executeTakeFirst();
      this.firebaseService.send({
        userId: target,
        title: name,
        body: `${username} has posted a prayer`,
        data: { prayerId },
      });
    } else {
      const data = await this.dbService
        .selectFrom('users')
        .leftJoin('user_follows', 'user_follows.follower_id', 'users.uid')
        .where('users.uid', '=', userId)
        .select('users.username')
        .select((eb) =>
          jsonArrayFrom(eb.selectNoFrom('user_follows.following_id')).as(
            'followings',
          ),
        )
        .executeTakeFirst();
      if (data == null) {
        return;
      }
      const target = data.followings
        .map(({ following_id }) => following_id)
        .filter((v) => v != null) as string[];
      this.dbService.insertInto('notifications').values(
        target.map((following) => ({
          user_id: following,
          message: `${data.username} has posted a prayer`,
          target_user_id: userId,
          prayer_id: prayerId,
        })),
      );
      this.firebaseService.send({
        userId: target,
        title: 'Prayer',
        body: `${data.username} has posted a prayer`,
        data: { corporateId: prayerId },
      });
    }
  }
}
