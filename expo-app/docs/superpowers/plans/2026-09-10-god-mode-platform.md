# God-Mode Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn expo-app into a complete, persistent, polished local-first social platform (all tabs/features working, data survives restarts, IG-grade design).

**Architecture:** Local-first with a provider seam: `src/persistence.ts` exposes `createPersistence(storage)` (injectable key-value backend) so a hosted backend can replace AsyncStorage without touching UI. No placeholders, no dead buttons.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, AsyncStorage, expo-haptics. No new native deps beyond these two.

**Spec:** Inline brainstorm (architectural, approval overridden by direct user order): local-first + seam; IG-authentic tokens; signature interaction = double-tap heart burst + haptics.

## Global Constraints

- Expo SDK 57 APIs only (docs at https://docs.expo.dev/versions/v57.0.0/).
- `npx tsc --noEmit` must pass after every task.
- No `console.*` in production code paths.
- Every Pressable does something real; every empty state has a CTA.
- No commits (not requested).

---

### Task 1: Persistence core (TDD)

**Files:**
- Create: `expo-app/scripts/check.mjs`
- Create: `expo-app/src/persistence.ts`

**Interfaces:**
- Consumes: types from `src/social.ts` (`User, Post, StoryGroup, Message`), `src/settings.ts` (`SettingsState`)
- Produces: `createPersistence(storage: KeyValueStorage) => { save(state: PersistedState): Promise<void>, load(): Promise<PersistedState | null>, clear(): Promise<void> }`, `PersistedState { version: 1, users, posts, stories, messages, follows, bookmarks: string[], invited: string[], settings }`, `STORAGE_KEY = '@instagram-clone/v1'`

- [ ] Step 1: Write `scripts/check.mjs` asserting round-trip save/load, corrupt-JSON → null, version mismatch → null, bookmarks array preserved. Run: `node scripts/check.mjs`. Expected: FAIL (module missing).
- [ ] Step 2: Write minimal `src/persistence.ts` (type-only imports, injectable storage, try/catch everywhere).
- [ ] Step 3: Re-run `node scripts/check.mjs`. Expected: PASS (4/4).
- [ ] Step 4: Run `npx tsc --noEmit`. Expected: PASS.

### Task 2: Hydrate + persist + reset in App

**Files:** Modify `expo-app/App.tsx`, `expo-app/src/persistence.ts` (re-export default binding is in App, not the module).

- [ ] Add boot loading gate (`hydrated` state, spinner + logo) loading persisted state or seeds.
- [ ] Debounced persist (500ms) of users/posts/stories/messages/follows/bookmarks/invited/settings on change, skipped until hydrated.
- [ ] Settings → Account → "Clear stored data" resets to seeds + clears storage.
- [ ] Verify: `npx tsc --noEmit` PASS; restart persistence holds (user-verified on device).

### Task 3: Haptics + signature double-tap like

**Files:** Modify `expo-app/App.tsx` (add `src/haptics.ts` with safe `tap()`/`success()` wrappers).

- [ ] `src/haptics.ts`: try/catch wrappers around `expo-haptics` impact/success.
- [ ] Feed image: single tap toggles like both ways + heart-burst overlay 600ms on like; wire `tap()` into like/bookmark/follow/send/publish.
- [ ] Verify tsc PASS.

### Task 4: Dead-interaction fixes (audit list)

**Files:** Modify `expo-app/App.tsx`.

- [ ] Un-nest Follow buttons (rows become View + inner profile Pressable).
- [ ] Activity rows navigate (profile/post); highlights open story viewer via `customStory` state; collections filter Saved grid via `activeCollection`; archive/tag/contact empties get CTAs; story tap zones (tap image = next, last = close) + loop Prev; reels `scrollToIndex` on open; profile-options guards self/null; login activity becomes stateful with per-row Log out; search/tag/profile empties get CTA buttons; composer seed row hidden when device photo set.
- [ ] Follow requests Confirm/Delete → Accept/Decline.
- [ ] Verify tsc PASS.

### Task 5: Trust features

**Files:** Modify `expo-app/App.tsx`.

- [ ] Unread DMs: `readThreads` set (persisted); badge dot on Direct header icon + thread bolding.
- [ ] Activity badge: `seenActivityAt` persisted; dot on Activity tab until opened.
- [ ] Block enforcement: blocked users excluded from feed/search/threads/stories/suggestions.
- [ ] Mute: muted authors' stories hidden from strip.
- [ ] Restricted: their comments collapsed behind "Show hidden comments" toggle in comment sheet.
- [ ] Search history: recent tapped users/tags, shown when query empty, with Clear.
- [ ] Verify tsc PASS.

### Task 6: Copy + a11y + design polish

**Files:** Modify `expo-app/App.tsx`.

- [ ] `IconBtn` component (icon + accessibilityLabel + role) adopted at post actions, header, tabs, chat bar, viewer, composers, modal backs.
- [ ] Naming: sheets dismiss = Close; "Take photo" (system) / "Choose from library" / "In-app camera"; story cell "Add"; avatar "Edit photo"; "Flip camera"; capture disabled "Starting camera…"; camera errors shown with retry; photo-null → permission guidance + open-settings link; remove "seed"/"simulated"/"SDK 53"/build-meta copy; empty captions allowed.
- [ ] Quick-reply chips in empty chat; timestamps stay truthful (no fake Seen).
- [ ] Story rings: gradient (unseen) / green (close friends) / grey (seen); active tab tint black vs `#8E8E93`; sheet drag handles.
- [ ] Verify tsc PASS.

### Task 7: Verify + review

- [ ] Run `node scripts/check.mjs` (PASS), `npx tsc --noEmit` (PASS), `npx expo config --type public` (resolves).
- [ ] Dispatch review subagent (requesting-code-review) with file list; fix Critical/Important; re-verify.
