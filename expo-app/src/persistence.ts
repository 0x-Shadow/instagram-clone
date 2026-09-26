import type { Message, Post, StoryGroup, User } from './social';
import type { SettingsState } from './settings';
import type { Circle } from './circles';

export const STORAGE_KEY = '@circles/v1';
export const STORAGE_VERSION = 2;

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type PersistedState = {
  version: number;
  users: User[];
  posts: Post[];
  stories: StoryGroup[];
  messages: Message[];
  follows: Record<string, string[]>;
  bookmarks: string[];
  invited: string[];
  settings: SettingsState;
  readThreads: string[];
  seenActivityAt: number;
  searchHistory: string[];
  circles?: Circle[];
  activeCircleId?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPersistedState(v: unknown): v is PersistedState {
  if (!isRecord(v)) return false;
  if (
    (v.version !== STORAGE_VERSION && v.version !== 1) ||
    !Array.isArray(v.users) ||
    !Array.isArray(v.posts) ||
    !Array.isArray(v.stories) ||
    !Array.isArray(v.messages) ||
    !isRecord(v.follows) ||
    !Array.isArray(v.bookmarks) ||
    !Array.isArray(v.invited) ||
    !Array.isArray(v.readThreads) ||
    typeof v.seenActivityAt !== 'number' ||
    !Array.isArray(v.searchHistory) ||
    !isRecord(v.settings)
  ) {
    return false;
  }
  const s = v.settings as Record<string, unknown>;
  const listKeys = [
    'muted',
    'blocked',
    'restricted',
    'closeFriends',
    'archived',
    'collections',
    'highlights',
    'followRequests',
  ];
  if (!listKeys.every((k) => Array.isArray(s[k]))) return false;
  if (v.circles !== undefined && !Array.isArray(v.circles)) return false;
  if (
    v.activeCircleId !== undefined &&
    v.activeCircleId !== null &&
    typeof v.activeCircleId !== 'string'
  )
    return false;
  return true;
}

export function createPersistence(storage: KeyValueStorage) {
  return {
    async save(state: PersistedState): Promise<void> {
      try {
        await storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: STORAGE_VERSION }));
      } catch {
        // Storage full or unavailable: app keeps running in memory.
      }
    },
    async load(): Promise<PersistedState | null> {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isPersistedState(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    async clear(): Promise<void> {
      try {
        await storage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do: clearing is best-effort.
      }
    },
  };
}
