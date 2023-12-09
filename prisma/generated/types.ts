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
  banner: number;
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
  profile: number | null;
  name: string;
  updated_at: Generated<Timestamp>;
  banner: number | null;
  verse_id: number | null;
};
export type DB = {
  bible_translations: bible_translations;
  bible_verses: bible_verses;
  contents: contents;
  corporate_prayers: corporate_prayers;
  group_invitations: group_invitations;
  group_members: group_members;
  groups: groups;
  notifications: notifications;
  prayer_bible_verses: prayer_bible_verses;
  prayer_contents: prayer_contents;
  prayer_prays: prayer_prays;
  prayers: prayers;
  reminders: reminders;
  user_fcm_tokens: user_fcm_tokens;
  user_follows: user_follows;
  users: users;
};
