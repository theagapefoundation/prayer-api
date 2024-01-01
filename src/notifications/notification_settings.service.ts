import { Injectable } from '@nestjs/common';
import { KyselyService } from 'src/kysely/kysely.service';

@Injectable()
export class NotificationSettingsService {
  constructor(private readonly dbService: KyselyService) {}

  async fetchGroupNotificationSettings(groupId: string, userId: string) {
    return this.dbService
      .selectFrom('notification_group_settings')
      .where('notification_group_settings.group_id', '=', groupId)
      .where('notification_group_settings.user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
  }

  async fetchCorporateNotificationSettings(
    corporateId: string,
    userId: string,
  ) {
    return this.dbService
      .selectFrom('notification_corporate_settings')
      .where('notification_corporate_settings.corporate_id', '=', corporateId)
      .where('notification_corporate_settings.user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
  }

  async cretaeGroupNotificationSettings({
    groupId,
    userId,
    onMemberPost,
    onModeratorPost,
  }: {
    groupId: string;
    userId: string;
    onModeratorPost: boolean;
    onMemberPost: boolean;
  }) {
    return this.dbService
      .insertInto('notification_group_settings')
      .values({
        user_id: userId,
        group_id: groupId,
        on_post: onMemberPost,
        on_moderator_post: onModeratorPost,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'group_id']).doUpdateSet({
          on_post: onMemberPost,
          on_moderator_post: onModeratorPost,
        }),
      )
      .executeTakeFirst();
  }

  async cretaeCorporateNotificationSettings({
    corporateId,
    userId,
    onMemberPost,
    onReminder,
  }: {
    corporateId: string;
    userId: string;
    onReminder: boolean;
    onMemberPost: boolean;
  }) {
    return this.dbService
      .insertInto('notification_corporate_settings')
      .values({
        user_id: userId,
        corporate_id: corporateId,
        on_post: onMemberPost,
        on_reminder: onReminder,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'corporate_id']).doUpdateSet({
          on_post: onMemberPost,
          on_reminder: onReminder,
        }),
      )
      .executeTakeFirst();
  }
}
