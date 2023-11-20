import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { credential, messaging } from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { KyselyService } from 'src/kysely/kysely.service';

function splitArrayIntoChunks(array: string[], chunkSize: number) {
  const result: string[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    result.push(chunk);
  }
  return result;
}

@Injectable()
export class FirebaseService {
  constructor(
    private configService: ConfigService,
    private dbService: KyselyService,
  ) {
    initializeApp({
      credential: credential.cert(
        JSON.parse(configService.getOrThrow('FIREBASE_ADMIN_PRIVATE_KEY')),
      ),
    });
  }

  async followUser(followingFrom: string, followingTo: string) {
    const data = await this.dbService
      .selectFrom('users')
      .where('users.uid', '=', followingFrom)
      .select('username')
      .executeTakeFirst();
    if (data == null) {
      return;
    }
    return this.send({
      userId: [followingTo],
      title: 'Prayer',
      body: `${data.username} started following you.`,
      data: { userId: followingFrom },
    });
  }

  async joinGroup(groupId: string, userId: string) {
    const [{ accepted_at }, { username }, { name }, mods] = await Promise.all([
      this.dbService
        .selectFrom('group_members')
        .where('group_members.group_id', '=', groupId)
        .where('group_members.user_id', '=', userId)
        .select('group_members.accepted_at')
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('users')
        .where('users.uid', '=', userId)
        .select('username')
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('groups')
        .where('groups.id', '=', groupId)
        .select('groups.name')
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('group_members')
        .where('group_id', '=', groupId)
        .where('moderator', 'is not', null)
        .select(['group_members.user_id'])
        .execute(),
    ]);
    this.send({
      userId: mods.map(({ user_id }) => user_id),
      title: name,
      body: `${username} has ${
        accepted_at ? 'joined the group' : 'requested to join the group'
      }`,
      data: { groupId },
    });
  }

  async groupRequestAccepted(groupId: string, userId: string) {
    const { name } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .select('groups.name')
      .executeTakeFirstOrThrow();
    this.send({
      userId: [userId],
      title: name,
      body: `Congratulations! You are now the member of ${name}`,
      data: { groupId },
    });
  }

  async memberPromoted(groupId: string, userId: string) {
    const { name } = await this.dbService
      .selectFrom('groups')
      .where('groups.id', '=', groupId)
      .select('groups.name')
      .executeTakeFirstOrThrow();
    this.send({
      userId: [userId],
      title: name,
      body: `You've been promoted to moderator of ${name}`,
      data: { groupId },
    });
  }

  async prayForUser(prayerId: string, sender: string, notifyFellows?: boolean) {
    const [
      { username: senderUsername },
      { uid: writerUid, username: writerUsername },
      fellows,
    ] = await Promise.all([
      this.dbService
        .selectFrom('users')
        .where('users.uid', '=', sender)
        .select('users.username')
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('prayers')
        .where('prayers.id', '=', prayerId)
        .leftJoin('users', 'users.uid', 'prayers.user_id')
        .select(['users.uid', 'users.username'])
        .executeTakeFirstOrThrow(),
      !notifyFellows
        ? []
        : this.dbService
            .selectFrom('prayer_prays')
            .where('prayer_prays.prayer_id', '=', prayerId)
            .select('prayer_prays.user_id')
            .execute(),
    ]);
    if (notifyFellows) {
      this.send({
        userId: fellows
          .map(({ user_id }) => user_id)
          .filter((value) => value !== sender),
        title: 'Prayer',
        body: `${senderUsername} has prayed for ${writerUsername}`,
        data: { prayerId },
      });
    }
    if (sender !== writerUid) {
      this.send({
        userId: [writerUid!],
        title: 'Prayer',
        body: `${senderUsername} has prayed for you`,
        data: { prayerId },
      });
    }
  }

  async corporatePrayerCreated({
    groupId,
    prayerId,
    uploaderId,
  }: {
    groupId: string;
    prayerId: string;
    uploaderId: string;
  }) {
    const [{ name }, t, { username }] = await Promise.all([
      this.dbService
        .selectFrom('groups')
        .select('groups.name')
        .where('groups.id', '=', groupId)
        .executeTakeFirstOrThrow(),
      this.dbService
        .selectFrom('group_members')
        .select('group_members.user_id')
        .where('group_members.group_id', '=', groupId)
        .execute(),
      this.dbService
        .selectFrom('users')
        .select('users.username')
        .where('users.uid', '=', uploaderId)
        .executeTakeFirstOrThrow(),
    ]);

    this.send({
      userId: t
        .map(({ user_id }) => user_id)
        .filter((value) => value !== uploaderId),
      title: name,
      body: `${username} has posted a corporate prayer`,
      data: { corporateId: prayerId },
    });
  }

  async prayerCreated({
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
      const [{ user_id, title }, { username }, users] = await Promise.all([
        this.dbService
          .selectFrom('corporate_prayers')
          .select(['corporate_prayers.user_id', 'corporate_prayers.title'])
          .where('corporate_prayers.id', '=', corporateId)
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('users')
          .select(['users.username'])
          .where('users.uid', '=', userId)
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('prayers')
          .select('prayers.user_id')
          .where('prayers.corporate_id', '=', corporateId)
          .execute(),
      ]);
      const target = [user_id, ...users.map(({ user_id }) => user_id)].filter(
        (value) => value !== userId,
      );
      this.send({
        userId: target,
        title: title,
        body: `${username} has posted a prayer`,
        data: { prayerId },
      });
    } else if (groupId) {
      const [{ name }, members, { username }] = await Promise.all([
        this.dbService
          .selectFrom('groups')
          .where('groups.id', '=', groupId)
          .select('groups.name')
          .executeTakeFirstOrThrow(),
        this.dbService
          .selectFrom('group_members')
          .where('group_members.group_id', '=', groupId)
          .select('group_members.user_id')
          .execute(),
        this.dbService
          .selectFrom('users')
          .select('users.username')
          .where('users.uid', '=', userId)
          .executeTakeFirstOrThrow(),
      ]);
      this.send({
        userId: members
          .map(({ user_id }) => user_id)
          .filter((value) => value !== userId),
        title: name,
        body: `${username} has posted a corporate prayer`,
        data: { prayerId },
      });
    } else {
      const [followings, { username }] = await Promise.all([
        this.dbService
          .selectFrom('user_follows')
          .select('user_follows.following_id')
          .where('user_follows.follower_id', '=', userId)
          .execute(),
        this.dbService
          .selectFrom('users')
          .select('users.username')
          .where('users.uid', '=', userId)
          .executeTakeFirstOrThrow(),
      ]);
      this.send({
        userId: followings.map(({ following_id }) => following_id),
        title: 'Prayer',
        body: `${username} has posted a corporate prayer`,
        data: { corporateId: prayerId },
      });
    }
  }

  async send(params: {
    userId: string[];
    title: string;
    body: string;
    imageUrl?: string;
    data: { [key: string]: string };
  }) {
    try {
      const tokens = (
        await this.dbService
          .selectFrom('user_fcm_tokens')
          .select('user_fcm_tokens.value')
          .distinct()
          .where('user_id', 'in', params.userId)
          .execute()
      ).map(({ value }) => value);
      const res = await Promise.all(
        splitArrayIntoChunks(tokens, 500).map((t) =>
          messaging().sendEachForMulticast({
            tokens: t,
            data: params.data,
            notification: {
              title: params.title,
              body: params.body,
              imageUrl: params.imageUrl,
            },
          }),
        ),
      );
      const responses = res.flatMap(({ responses }) => responses);
      if (!responses.every((v) => v.error == null)) {
        await this.dbService
          .deleteFrom('user_fcm_tokens')
          .where(
            'user_fcm_tokens.value',
            'in',
            responses
              .filter(({ error }) => error != null)
              .map((response, index) => tokens[index]),
          )
          .execute();
      }
    } catch (e) {}
  }
}
