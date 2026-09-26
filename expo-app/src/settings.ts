export type SettingsState = {
  notifLikes: boolean;
  notifComments: boolean;
  notifFollows: boolean;
  notifMessages: boolean;
  notifLive: boolean;
  notifEmailSms: boolean;
  privateAccount: boolean;
  activityStatus: boolean;
  muted: string[];
  blocked: string[];
  restricted: string[];
  closeFriends: string[];
  twoFactor: boolean;
  savedLogin: boolean;
  passwordUpdatedAt: number | null;
  theme: 'light' | 'dark' | 'system';
  language: string;
  archived: string[];
  collections: { name: string; ids: string[] }[];
  highlights: { name: string; images: string[] }[];
  followRequests: string[];
};

export const DEFAULT_SETTINGS: SettingsState = {
  notifLikes: true,
  notifComments: true,
  notifFollows: true,
  notifMessages: true,
  notifLive: false,
  notifEmailSms: false,
  privateAccount: false,
  activityStatus: true,
  muted: [],
  blocked: [],
  restricted: [],
  closeFriends: ['ana'],
  twoFactor: false,
  savedLogin: true,
  passwordUpdatedAt: null,
  theme: 'system',
  language: 'English',
  archived: [],
  collections: [{ name: 'Favorites', ids: ['p2'] }],
  highlights: [],
  followRequests: ['zoe', 'max'],
};

export const LANGUAGES = ['English', 'Deutsch', 'Espanol', 'Francais', 'Portugues'];

export const LOGIN_ACTIVITY = [
  { device: 'This device', where: 'Berlin, DE', when: Date.now() - 100_000, current: true },
  { device: 'Chrome · Windows', where: 'Berlin, DE', when: Date.now() - 86400_000 * 2, current: false },
];

export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
