export type User = {
  username: string;
  name: string;
  avatar: string;
  bio: string;
};

export type Comment = {
  id: string;
  username: string;
  text: string;
  createdAt: number;
};

export type Post = {
  id: string;
  username: string;
  image: string;
  caption: string;
  likes: string[];
  comments: Comment[];
  createdAt: number;
};

export type StoryGroup = {
  username: string;
  images: string[];
  seen: boolean;
};

export type Message = {
  id: string;
  from: string;
  to: string;
  text: string;
  createdAt: number;
};

export type ActivityItem = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'post';
  actor: string;
  text: string;
  createdAt: number;
  postId?: string;
};

export const ME = 'vucms';

const AVATAR = (i: number) => `https://i.pravatar.cc/150?img=${i}`;
const PHOTO = (seed: string, w = 600, h = 600) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const SEED_USERS: User[] = [
  { username: 'vucms', name: 'Vu CMS', avatar: AVATAR(5), bio: 'React Native dev. Rebuilding IG offline-first.' },
  { username: 'ana', name: 'Ana', avatar: AVATAR(6), bio: 'Travel + film photography' },
  { username: 'leo', name: 'Leo', avatar: AVATAR(7), bio: 'Coffee first, code later' },
  { username: 'mia', name: 'Mia', avatar: AVATAR(8), bio: 'Design systems nerd' },
  { username: 'kai', name: 'Kai', avatar: AVATAR(9), bio: 'Surf / skate / repeat' },
  { username: 'zoe', name: 'Zoe', avatar: AVATAR(10), bio: 'Plant mom of 40' },
  { username: 'max', name: 'Max', avatar: AVATAR(11), bio: 'Indie hacker' },
  { username: 'ivy', name: 'Ivy', avatar: AVATAR(12), bio: 'Food, cities, night buses' },
];

const now = Date.now();

export const SEED_POSTS: Post[] = Array.from({ length: 12 }, (_, i) => {
  const user = SEED_USERS[i % SEED_USERS.length];
  const tags = i % 3 === 0 ? ' #travel' : i % 3 === 1 ? ' #daily' : ' #photo';
  return {
    id: `p${i}`,
    username: user.username,
    image: PHOTO(`ig${i}`),
    caption: `Post ${i} from ${user.username} — hello from the Expo rebuild${tags}`,
    likes: i % 2 === 0 ? ['ana', 'leo'].slice(0, (i % 2) + 1) : ['mia'],
    comments: [
      {
        id: `p${i}-c0`,
        username: SEED_USERS[(i + 2) % SEED_USERS.length].username,
        text: i % 2 === 0 ? 'Love this!' : 'Great shot',
        createdAt: now - i * 3_600_000 - 600_000,
      },
    ],
    createdAt: now - i * 3_600_000,
  };
});

export const SEED_STORIES: StoryGroup[] = SEED_USERS.slice(0, 6).map((u, gi) => ({
  username: u.username,
  images: [PHOTO(`st${gi}a`, 540, 960), PHOTO(`st${gi}b`, 540, 960)],
  seen: gi > 2,
}));

export const SEED_MESSAGES: Message[] = [
  { id: 'm1', from: 'ana', to: ME, text: 'Hey! Did you see the new build?', createdAt: now - 5_000_000 },
  { id: 'm2', from: ME, to: 'ana', text: 'Just pushed it — feed + stories work now', createdAt: now - 4_000_000 },
  { id: 'm3', from: 'leo', to: ME, text: 'Ship the explore grid next!', createdAt: now - 2_000_000 },
];

export const SEED_FOLLOWS: Record<string, string[]> = {
  vucms: ['ana', 'leo', 'mia'],
};

export function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toDateString();
}

export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\p{L}\p{N}_]+/gu);
  return matches ? Array.from(new Set(matches.map((t) => t.toLowerCase()))) : [];
}

export function searchUsers(users: User[], q: string, exclude?: string): User[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return users.filter((u) => u.username !== exclude);
  return users.filter(
    (u) =>
      u.username !== exclude &&
      (u.username.toLowerCase().includes(needle) ||
        u.name.toLowerCase().includes(needle)),
  );
}

export function searchPosts(posts: Post[], q: string): Post[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return posts;
  return posts.filter(
    (p) =>
      p.caption.toLowerCase().includes(needle) ||
      p.username.toLowerCase().includes(needle),
  );
}

export function buildActivity(
  posts: Post[],
  follows: Record<string, string[]>,
  me: string,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const p of posts) {
    if (p.username !== me) continue;
    for (const u of p.likes) {
      items.push({
        id: `like-${p.id}-${u}`,
        type: 'like',
        actor: u,
        text: `liked your photo.`,
        createdAt: p.createdAt + 60_000,
        postId: p.id,
      });
    }
    for (const c of p.comments) {
      if (c.username === me) continue;
      items.push({
        id: `comment-${c.id}`,
        type: 'comment',
        actor: c.username,
        text: `commented: ${c.text}`,
        createdAt: c.createdAt,
        postId: p.id,
      });
    }
  }
  const followers = Object.entries(follows)
    .filter(([, v]) => v.includes(me))
    .map(([k]) => k);
  for (const f of followers) {
    items.push({
      id: `follow-${f}`,
      type: 'follow',
      actor: f,
      text: `started following you.`,
      createdAt: now - 500_000,
    });
  }
  return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
}

export function conversationWith(messages: Message[], me: string, other: string) {
  return messages
    .filter(
      (m) =>
        (m.from === me && m.to === other) || (m.from === other && m.to === me),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function inboxThreads(messages: Message[], me: string): { other: string; last: Message; unread: number }[] {
  const byOther = new Map<string, Message[]>();
  for (const m of messages) {
    const other = m.from === me ? m.to : m.from;
    if (!byOther.has(other)) byOther.set(other, []);
    byOther.get(other)?.push(m);
  }
  return Array.from(byOther.entries())
    .map(([other, list]) => {
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
      return {
        other,
        last: sorted[0],
        unread: list.filter((m) => m.to === me && m.from !== me).length,
      };
    })
    .sort((a, b) => b.last.createdAt - a.last.createdAt);
}
