import type { ColumnType } from 'kysely';
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const membership_type = {
  open: 'open',
  restricted: 'restricted',
  private: 'private',
} as const;
export type membership_type =
  (typeof membership_type)[keyof typeof membership_type];
export type contents = {
  id: Generated<number>;
  user_id: string;
  created_at: Generated<Timestamp>;
};
export type corporate_prayers = {
  id: Generated<string>;
  user_id: string;
  group_id: string;
  description: string | null;
  started_at: Timestamp | null;
  ended_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  title: string;
  prayers: string | null;
  reminder_id: number | null;
};
export type group_invitations = {
  id: Generated<number>;
  user_id: string;
  group_id: string;
  created_at: Generated<Timestamp>;
};
export type group_members = {
  id: Generated<number>;
  user_id: string;
  group_id: string;
  accepted_at: Timestamp | null;
  moderator: Timestamp | null;
  created_at: Generated<Timestamp>;
};
export type groups = {
  id: Generated<string>;
  name: string;
  description: string;
  admin_id: string;
  banner: string;
  membership_type: membership_type;
  updated_at: Generated<Timestamp>;
  created_at: Generated<Timestamp>;
};
export type notifications = {
  id: Generated<number>;
  user_id: string;
  message: string;
  group_id: string | null;
  prayer_id: string | null;
  corporate_id: string | null;
  target_user_id: string | null;
  created_at: Generated<Timestamp>;
};
export type prayer_prays = {
  id: Generated<number>;
  user_id: string;
  value: string | null;
  created_at: Timestamp;
  prayer_id: string;
};
export type prayers = {
  id: Generated<string>;
  user_id: string;
  group_id: string | null;
  anon: Generated<boolean>;
  value: string;
  media: string | null;
  created_at: Generated<Timestamp>;
  corporate_id: string | null;
};
export type reminders = {
  id: Generated<number>;
  days: string;
  time: Timestamp;
  value: string;
  created_at: Generated<Timestamp>;
};
export type user_fcm_tokens = {
  id: Generated<number>;
  user_id: string;
  value: string;
  created_at: Generated<Timestamp>;
};
export type user_follows = {
  id: Generated<number>;
  follower_id: string;
  following_id: string;
  created_at: Generated<Timestamp>;
};
export type users = {
  uid: string;
  username: string;
  email: string;
  created_at: Generated<Timestamp>;
  bio: string | null;
  profile: string | null;
  name: string;
  updated_at: Generated<Timestamp>;
  banner: string | null;
};
export type DB = {
  contents: contents;
  corporate_prayers: corporate_prayers;
  group_invitations: group_invitations;
  group_members: group_members;
  groups: groups;
  notifications: notifications;
  prayer_prays: prayer_prays;
  prayers: prayers;
  reminders: reminders;
  user_fcm_tokens: user_fcm_tokens;
  user_follows: user_follows;
  users: users;
};
