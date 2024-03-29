import type { ColumnType } from 'kysely';
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const notification_type = {
  followed: 'followed',
  group_join_requested: 'group_join_requested',
  group_joined: 'group_joined',
  group_accepted: 'group_accepted',
  group_promoted: 'group_promoted',
  prayed: 'prayed',
  group_corporate_posted: 'group_corporate_posted',
  prayer_posted: 'prayer_posted',
} as const;
export type notification_type =
  (typeof notification_type)[keyof typeof notification_type];
export const membership_type = {
  open: 'open',
  restricted: 'restricted',
  private: 'private',
} as const;
export type membership_type =
  (typeof membership_type)[keyof typeof membership_type];
export const bible_book = {
  genesis: 'genesis',
  exodus: 'exodus',
  leviticus: 'leviticus',
  numbers: 'numbers',
  deuteronomy: 'deuteronomy',
  joshua: 'joshua',
  judges: 'judges',
  ruth: 'ruth',
  first_samuel: 'first_samuel',
  second_samuel: 'second_samuel',
  first_kings: 'first_kings',
  second_kings: 'second_kings',
  first_chronicles: 'first_chronicles',
  second_chronicles: 'second_chronicles',
  ezra: 'ezra',
  nehemiah: 'nehemiah',
  esther: 'esther',
  job: 'job',
  psalms: 'psalms',
  proverbs: 'proverbs',
  ecclesiastes: 'ecclesiastes',
  song_of_solomon: 'song_of_solomon',
  isaiah: 'isaiah',
  jeremiah: 'jeremiah',
  lamentations: 'lamentations',
  ezekiel: 'ezekiel',
  daniel: 'daniel',
  hosea: 'hosea',
  joel: 'joel',
  amos: 'amos',
  obadiah: 'obadiah',
  jonah: 'jonah',
  micah: 'micah',
  nahum: 'nahum',
  habakkuk: 'habakkuk',
  zephaniah: 'zephaniah',
  haggai: 'haggai',
  zechariah: 'zechariah',
  malachi: 'malachi',
  matthew: 'matthew',
  mark: 'mark',
  luke: 'luke',
  john: 'john',
  acts: 'acts',
  romans: 'romans',
  first_corinthians: 'first_corinthians',
  second_corinthians: 'second_corinthians',
  galatians: 'galatians',
  ephesians: 'ephesians',
  philippians: 'philippians',
  colossians: 'colossians',
  first_thessalonians: 'first_thessalonians',
  second_thessalonians: 'second_thessalonians',
  first_timothy: 'first_timothy',
  second_timothy: 'second_timothy',
  titus: 'titus',
  philemon: 'philemon',
  hebrews: 'hebrews',
  james: 'james',
  first_peter: 'first_peter',
  second_peter: 'second_peter',
  first_john: 'first_john',
  second_john: 'second_john',
  third_john: 'third_john',
  jude: 'jude',
  revelation: 'revelation',
} as const;
export type bible_book = (typeof bible_book)[keyof typeof bible_book];
export type bible_translations = {
  id: Generated<number>;
  lang: string;
  abbreviation: string;
  name: string;
};
export type bible_verses = {
  id: Generated<number>;
  translation_id: number;
  verse_id: Generated<number>;
  book: bible_book;
  chapter: number;
  verse: number;
  value: string;
};
export type contents = {
  id: Generated<number>;
  user_id: string;
  created_at: Generated<Timestamp>;
  path: string;
  alt: string | null;
  processed: Generated<boolean>;
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
export type group_bans = {
  id: Generated<number>;
  group_id: string;
  reason: string;
  created_at: Generated<Timestamp>;
};
export type group_invitations = {
  id: Generated<number>;
  user_id: string;
  group_id: string;
  created_at: Generated<Timestamp>;
};
export type group_member_bans = {
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
export type group_pinned_prayers = {
  id: Generated<number>;
  user_id: string;
  group_id: string;
  prayer_id: string;
  created_at: Generated<Timestamp>;
};
export type group_rules = {
  id: Generated<number>;
  group_id: string;
  title: string;
  description: string;
  created_at: Generated<Timestamp>;
};
export type groups = {
  id: Generated<string>;
  name: string;
  description: string;
  welcome_title: string | null;
  welcome_message: string | null;
  admin_id: string;
  banner_id: number;
  membership_type: membership_type;
  reminder_id: number | null;
  updated_at: Generated<Timestamp>;
  created_at: Generated<Timestamp>;
};
export type notification_corporate_settings = {
  id: Generated<number>;
  user_id: string;
  corporate_id: string;
  on_reminder: Generated<boolean>;
  on_post: Generated<boolean>;
};
export type notification_group_settings = {
  id: Generated<number>;
  user_id: string;
  group_id: string;
  on_moderator_post: Generated<boolean>;
  on_post: Generated<boolean>;
};
export type notifications = {
  id: Generated<number>;
  user_id: string;
  group_id: string | null;
  pray_id: number | null;
  prayer_id: string | null;
  corporate_id: string | null;
  target_user_id: string | null;
  type: notification_type;
  created_at: Generated<Timestamp>;
};
export type prayer_bible_verses = {
  id: Generated<number>;
  verse_id: number;
  prayer_id: string;
};
export type prayer_contents = {
  id: Generated<string>;
  content_id: number;
  prayer_id: string;
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
export type user_bans = {
  id: Generated<number>;
  user_id: string;
  reason: string;
  created_at: Generated<Timestamp>;
};
export type user_blocks = {
  id: Generated<number>;
  user_id: string;
  target_id: string;
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
  profile_id: number | null;
  name: string;
  updated_at: Generated<Timestamp>;
  banner_id: number | null;
  verse_id: number | null;
};
export type DB = {
  bible_translations: bible_translations;
  bible_verses: bible_verses;
  contents: contents;
  corporate_prayers: corporate_prayers;
  group_bans: group_bans;
  group_invitations: group_invitations;
  group_member_bans: group_member_bans;
  group_members: group_members;
  group_pinned_prayers: group_pinned_prayers;
  group_rules: group_rules;
  groups: groups;
  notification_corporate_settings: notification_corporate_settings;
  notification_group_settings: notification_group_settings;
  notifications: notifications;
  prayer_bible_verses: prayer_bible_verses;
  prayer_contents: prayer_contents;
  prayer_prays: prayer_prays;
  prayers: prayers;
  reminders: reminders;
  user_bans: user_bans;
  user_blocks: user_blocks;
  user_fcm_tokens: user_fcm_tokens;
  user_follows: user_follows;
  users: users;
};
