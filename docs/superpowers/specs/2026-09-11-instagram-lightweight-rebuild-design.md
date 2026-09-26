# Instagram Lightweight Rebuild — Design (B Upgrade-in-Place)

Date: 2026-09-11
Status: Approved (Sections 1-5)
Scope: Full parity v1, phased | Supabase backend | Upgrade-in-place (root `/`) | Reels full editor | Lightweight + every phone + clean collab

## 1. Context

Root app: React Native 0.62.2, React 16.11, Firebase 7.9.0, Redux + thunk + persist, React Navigation 5, 100+ screens under `src/screens/`, 30+ native deps including `gl-react`, `react-native-camera`, `@react-native-community/*`.
Reference: `expo-app/` (Expo 57, RN 0.86, React 19) with single-file prototype `App.tsx` + `src/social.ts`, `device.ts`, `persistence.ts`, `settings.ts` covering Feed/Stories/Reels/Direct/Search/Profile/Settings/Calls/Notes with mock data.
Local dirty files: `App.tsx`, `VideoShower.tsx`, `LiveIGTV.tsx`, `Creator/index.tsx`, `ProfileXMutual.tsx`.
Goal: keep all Instagram pages + DMs/online, clean code for collaboration, lightweight for all phones, add video/reels upload with full editor.

## 2. Architecture (Approved Section 1)

- B Upgrade-in-place: root `/` remains the app. `expo-app/` is UI/behavior reference only.
- Upgrade lane: 0.62 -> 0.73 -> 0.76, Hermes ON, React 16 -> 18, TypeScript strict, React Navigation 5 -> 6, ESLint/Prettier/Husky.
- Dep swap for weight: remove `gl-react`, `gl-react-expo`, `react-native-camera`, old community libs. Use `expo-image`, `expo-video`/`expo-camera`, `@react-native-async-storage/async-storage`, `FlashList`.
- Backend: dual-run Firebase (frozen) + Supabase, then cutover. Supabase: Auth, Postgres, Storage, Realtime.
- Phases:
  - P0 Audit/freeze + CI (`lint`, `typecheck`, `jest`) + clean tree.
  - P1 Toolchain upgrade + Supabase auth/profiles + Feed read + image upload.
  - P2 Full page parity: Feed, Stories/Highlights, Explore (search/users/hashtag/location/ImageClass), Activity, Account/Profile + Setting/*, Direct/* + online, Root modals.
  - P3 Reels full editor + Reels feed + Explore reels tab.
- Lightweight targets: cold start <3s on 2GB Android, 30s 720p reel upload <60s on 4G, small APK via ABI split + R8/Proguard.
- Collab: feature folders, CODEOWNERS, PR template, CONTRIBUTING.

## 3. Components (Approved Section 2)

Keep existing map:
- `AuthStack` (Welcome/Login/Register/ForgotPassword)
- `HomeTab/RootTab` (Feed, Explore, Creator, Activity, Account)
- `Explore/*` (search, ProfileX, FollowTab/*, Hashtag, Location, ImageClass)
- `Account/*` + `Setting/*` (Security, Account, Ads, Friends, Notifications, Privacy, About, AddAccount, Logout)
- `Direct/*` (inbox, Conversation, SharedImages, calls, notes, EmojiOptions, ConversationOptions)
- `Root/*` (Comment, StoryFullView, HighlightFullView, PostDetail)
- `Others/*` (StoryTaker/Processor, ShareToDirect, PostOptions, etc.)

New `src/features/reels/`:
- `Recorder`, `Trimmer`, `Compressor`, `Editor` (filters/audio/drafts), `ReelsFeed` (paging vertical), `UploadQueue`.
- Shared: `src/components/ui` (Avatar, PostCard, VideoPlayer, PermRow, ToggleRow), `src/lib/supabase.ts`, `src/hooks/`, `src/utils/`.
- Refactor targets: `PostList/VideoShower.tsx`, `Home/Creator/index.tsx`.
- Rules: one purpose per file, 200-line soft limit, no cross-feature imports except via `features/<name>/api`, strict TS, no default-export ambiguity.

## 4. Data Flow (Approved Section 3)

Tables: `profiles`, `posts(id,user_id,caption,media[],type,labels,created_at)`, `stories`, `highlights`, `follows`, `likes`, `comments`, `bookmarks`, `collections`, `threads`, `messages`, `presence`, `notifications`, `reels(id,user_id,video_url,thumb_url,status:draft|published,created_at)`.
Storage buckets: `posts/`, `reels/`, `stories/`, `avatars/`.
Flows:
- Upload: picker/camera -> local compress (720p H.264) -> Storage -> insert row -> Realtime fan-out.
- Feed/Reels: paginated (20/page) Supabase queries, thumbnail-first, prefetch next.
- DMs: optimistic send, Realtime sync, read receipts via `readThreads` equivalent server-side.
- Presence: replace `/online/{user}` 60s `AppState.active` heartbeat with Supabase Realtime presence + `last_online` fallback.
- Offline: persist `user` only (as today) + upload queue in AsyncStorage.
- Migration: dual-write Firestore/RTDB -> Supabase, verify counts, cutover, decommission Firebase.

## 5. Lightweight + Error Handling (Approved Section 4)

- Hermes, R8/Proguard, ABI split, remove heavy native libs, FlashList virtualization, image/video caching, 720p cap, paginate all lists, pause presence interval when backgrounded.
- Uploads: resumable, retry queue, background continuation where OS allows.
- Player: thumb placeholder, error -> retry button, auto quality drop.
- DMs: failed flag + resend, typing indicator timeout.
- Permissions: inline guidance (camera/mic/library/location/contacts/notifications) ported from `expo-app/src/device.ts`.
- Boundaries: per-tab ErrorBoundary, global LogBox -> Sentry (optional), no silent catch.
- Degradation: presence -> `last_online` text, Realtime disconnect -> poll 30s.

## 6. Testing + Collab (Approved Section 5)

- Keep `jest` + `__tests__/`, add per-feature tests.
- Smoke (Maestro/Detox): login -> feed -> image upload -> reel record/edit/upload -> DM send -> online dot -> story post.
- CI gates: `yarn lint`, `tsc --noEmit`, `yarn test`.
- Docs: `CONTRIBUTING.md`, PR template, CODEOWNERS per `features/`.
- Done criteria: all 100+ existing pages reachable, DMs realtime, reels full editor works on low-end Android + iOS, lint/test green.

## 7. Non-Goals / Risks

- Non-goals v1: web support, E2E encryption for DMs, advanced analytics, AI classify server (keep `CLASSIFY_API` optional).
- Risks: 0.62->modern upgrade breakage (mitigate stepwise + freeze), Supabase Realtime scale for presence (fallback to polling), full editor scope creep (lock to trim/compress/filter/audio/drafts v1), video size on low-end (enforce 720p + duration cap).

## 8. Next Step

Invoke `writing-plans` skill to create phased implementation plan (P0-P3) with file-level tasks.
