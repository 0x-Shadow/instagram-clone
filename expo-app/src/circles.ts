export type Circle = {
  id: string;
  name: string;
  members: string[];
};

export const DEFAULT_CIRCLES: Circle[] = [
  { id: 'family', name: 'Family', members: ['vucms', 'ana', 'mia'] },
  { id: 'close', name: 'Close friends', members: ['vucms', 'ana', 'leo'] },
  { id: 'photo', name: 'Photo walks', members: ['vucms', 'leo', 'kai', 'zoe'] },
];

export function circleById(circles: Circle[], id: string | null): Circle | null {
  if (!id) return null;
  return circles.find((c) => c.id === id) ?? null;
}

export function feedForCircle<T extends { username: string }>(
  posts: T[],
  circle: Circle | null,
): T[] {
  if (!circle) return posts;
  const set = new Set(circle.members);
  return posts.filter((p) => set.has(p.username));
}

export function circlesForUser(circles: Circle[], username: string): Circle[] {
  return circles.filter((c) => c.members.includes(username));
}
