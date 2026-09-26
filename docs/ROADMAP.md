# Roadmap — making this app actually useful

Status quo (verified Sep 2026): `expo-app/` is a **local-first Instagram
rebuild** — feed, stories with progress, reels, DMs/threads, search, profile,
camera capture, contacts import, place tagging, bookmarks, settings, dark
mode, haptics, AsyncStorage persistence. `node scripts/check.mjs` 8/8,
`tsc --noEmit` clean. One problem: almost everything lives in a single
~2,900-line `App.tsx`, and there is **no backend** — all data is seed + local.

The legacy RN 0.62 app (`/src`, `/android`, `/ios`) is kept for reference
only. All new work goes into `expo-app/`.

## Phase 0 — Foundation (do first, ~1–2 sessions)

- [ ] Split `App.tsx` into `src/screens/*` (Feed, Reels, Search, Messages,
  Profile, Camera, Settings) + `src/components/*`. No behavior change.
- [ ] Move business logic out of components into `src/social.ts`-style pure
  modules with `scripts/check.mjs` coverage (likes, follows, threads,
  search).
- [ ] Add `docs/screenshots/` (feed, reels, messages, profile) so the README
  shows the real app.
- [ ] Decide the backend seam: `src/persistence.ts` already abstracts storage
  — define the `BackendProvider` interface against it (see Phase 1).

## Phase 1 — Real backend (makes it a real app)

- [ ] Pick **Supabase** (Postgres + Auth + Storage + Realtime in one box).
  `.env.example`-style config, never commit keys.
- [ ] Auth: email + OAuth (Google/Apple) via Supabase Auth. Replace `ME`
  constant with a session.
- [ ] Tables: `profiles`, `posts`, `stories`, `comments`, `likes`,
  `follows`, `threads`, `messages`, `bookmarks`. Row-Level Security per user.
- [ ] Storage buckets: `avatars`, `posts`, `stories` (replace picsum seeds).
- [ ] Realtime: new posts, likes, and DM messages via Supabase Realtime —
  replace local-only state updates with optimistic UI + subscription.
- [ ] Offline queue: keep AsyncStorage as write-through cache (uploads retry).

## Phase 2 — Missing Instagram essentials

- [ ] Push notifications (`expo-notifications` is already a dependency):
  likes, follows, comments, DMs.
- [ ] Deep links: `instagram-clone://post/:id`, `.../profile/:name`.
- [ ] Video posts + reels playback polish (currently photo-centric).
- [ ] Comments threading + mentions (`@user` with notifications).
- [ ] Privacy controls that actually enforce: private accounts, blocked list
  filtering on the backend, not just the client.

## Phase 3 — Differentiation (pick ONE)

- [ ] **Local-first + E2E encrypted DMs** (Signal protocol via libsignal),
  keeping the offline story as the headline feature.
- [ ] **Creator analytics**: views, retention graphs per post/reel.
- [ ] **Topics/close-friends circles** as first-class sharing scopes.

## Explicit non-goals

- No web support beyond screenshots until mobile is solid.
- No AI classify server dependency (legacy `CLASSIFY_API` stays optional).
- No E2E encryption half-measures — either full Phase 3 or nothing.
- No new native dependencies without checking Expo SDK 57 compat first
  (see `expo-app/AGENTS.md` — read the versioned Expo docs).

## How to propose a change

Open a feature request (`.github/ISSUE_TEMPLATE/feature_request.md`),
reference the phase above, keep scope to one checkbox. Small PRs win.
