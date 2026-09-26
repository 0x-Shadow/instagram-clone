# Instagram P0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish clean collaborative baseline for B upgrade-in-place without breaking RN 0.62 app.

**Architecture:** Freeze root `/` app, add collab docs + Supabase client scaffold + pure-TS media validation for future Reels upload. No RN upgrade or Firebase removal in P0.

**Tech Stack:** React Native 0.62.2, TypeScript 3.8, Jest 24 (react-native preset), Supabase JS v2 (new dep), ESLint @react-native-community.

**Spec:** `docs/superpowers/specs/2026-09-11-instagram-lightweight-rebuild-design.md`

## Global Constraints

- Do not upgrade `react-native`, `react`, `firebase` versions in P0.
- Do not modify `src/screens/`, `src/navigations/`, `src/reducers/`, `App.tsx` behavior in P0.
- TypeScript `strict: true` must stay green via `npx tsc --noEmit`.
- All new TS must pass `yarn lint` (@react-native-community).
- Lightweight budget: new JS deps only `supabase-js`, no new native modules in P0.
- Naming: `src/lib/`, `src/features/reels/` per spec Section 2.

---
**Scope note:** Full spec needs 4 plans. This is Plan 1/4 (P0 foundation). Next: Plan 2/4 P1 toolchain+Supabase auth/feed, Plan 3/4 P2 page parity, Plan 4/4 P3 Reels full editor. Each produces working testable software alone.

## File Structure

- `CONTRIBUTING.md` — how to collaborate (setup with yarn, branch, lint/test, no direct native adds in P0).
- `.github/CODEOWNERS` — ownership per `src/features/`, `src/lib/`.
- `docs/superpowers/plans/` — this plan lives here.
- `src/lib/supabase.ts` — creates Supabase client from env, single responsibility: client singleton. No Firebase import.
- `src/lib/__tests__/supabase.test.ts` — verifies env validation + singleton.
- `src/features/reels/media.ts` — pure functions: `validateReelFile()`, `pickReelProfile()`. No native imports, testable in Jest.
- `src/features/reels/__tests__/media.test.ts` — unit tests for duration/size/type rules.
- `.env.example` — documents `SUPABASE_URL`, `SUPABASE_ANON_KEY` (no secrets committed).

---

### Task 1: Collab baseline docs

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `.github/CODEOWNERS`
- Create: `.env.example`
- Test: `__tests__/App-test.tsx` (existing, must stay green)

**Interfaces:**
- Consumes: existing `package.json:scripts` (`yarn`, `yarn lint`, `yarn test`), `README.md` install notes.
- Produces: documented `yarn install`, `yarn lint`, `yarn test`, `npx tsc --noEmit` workflow for later tasks.

- [ ] **Step 1: Write the failing test**

No new code test — verify baseline is green before docs. Create `src/lib/__tests__/baseline.test.ts`:

```ts
describe('P0 baseline', () => {
  it('has yarn test infrastructure', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (baseline check)**

Run: `yarn test src/lib/__tests__/baseline.test.ts --no-coverage 2>&1 | head -40`
Expected: PASS (or file-not-found before creation → create file first, then PASS). If `yarn test` fails on existing `__tests__/App-test.tsx`, record failure and fix import only, no behavior change.

- [ ] **Step 3: Write minimal implementation (docs only)**

Create `CONTRIBUTING.md`:

```md
# Contributing
## Setup
yarn
cd ios && pod install
## Checks (must be green)
yarn lint
npx tsc --noEmit
yarn test --no-coverage
## Rules (P0)
- Do not upgrade RN/Firebase in P0.
- Do not add native modules.
- New code in `src/lib/` or `src/features/<name>/` with `__tests__/`.
- 200-line soft file limit.
```

Create `.github/CODEOWNERS`:

```
src/features/reels/ @team-reels
src/lib/ @team-core
src/screens/ @team-feed
```

Create `.env.example`:

```
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_ANON_KEY=anon-key-here
```

Then delete `src/lib/__tests__/baseline.test.ts` (it was scaffold only).

- [ ] **Step 4: Run tests to verify still green**

Run: `yarn test --no-coverage 2>&1 | tail -20`
Expected: PASS, existing `__tests__/App-test.tsx` green.

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no output (clean) or only pre-existing errors — record them, do not fix in P0 beyond new files.

- [ ] **Step 5: Commit**

```bash
git add CONTRIBUTING.md .github/CODEOWNERS .env.example
git commit -m "docs: add P0 collab baseline"
```

---

### Task 2: Supabase client scaffold

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/__tests__/supabase.test.ts`
- Modify: `package.json` (add `@supabase/supabase-js`)
- Test: `src/lib/__tests__/supabase.test.ts`

**Interfaces:**
- Consumes: `process.env.SUPABASE_URL`, `process.env.SUPABASE_ANON_KEY`
- Produces: `getSupabase(): SupabaseClient | null`, `isSupabaseConfigured(): boolean`
  - `isSupabaseConfigured(): boolean` — true when both env vars non-empty.
  - `getSupabase(): object | null` — singleton client or null when unconfigured. Later tasks rely on these exact names.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/supabase.test.ts
import { isSupabaseConfigured, getSupabase } from '../supabase';

describe('supabase lib', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });
  it('returns false when env missing', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabase()).toBeNull();
  });
  it('returns true when env present', () => {
    process.env.SUPABASE_URL = 'https://xyz.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabase()).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/lib/__tests__/supabase.test.ts --no-coverage 2>&1 | tail -30`
Expected: FAIL with "Cannot find module '../supabase'".

- [ ] **Step 3: Write minimal implementation**

Run first: `yarn add @supabase/supabase-js`

Create `src/lib/supabase.ts`:

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;
  cached = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_ANON_KEY as string,
  );
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/lib/__tests__/supabase.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS, 2 tests.

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors in `src/lib/supabase.ts`.

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock src/lib/supabase.ts src/lib/__tests__/supabase.test.ts
git commit -m "feat: add Supabase client scaffold"
```

---

### Task 3: Reels media validation (pure TS, no native)

**Files:**
- Create: `src/features/reels/media.ts`
- Create: `src/features/reels/__tests__/media.test.ts`
- Test: `src/features/reels/__tests__/media.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2 (pure to stay testable on Jest 24 without native).
- Produces:
  - `type ReelFile = { uri: string; sizeBytes: number; durationSec: number; mime: string }`
  - `validateReelFile(f: ReelFile): { ok: boolean; reason?: string }` — rules: mime in `video/mp4,video/quicktime`, size <= 150MB, duration 3..180s.
  - `pickReelProfile(durationSec: number): { maxHeight: 1280 | 720; bitrate: string }` — <=60s → 720p/3Mbps, >60s → 720p/2Mbps (lightweight cap, never 1080p in v1).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/reels/__tests__/media.test.ts
import { validateReelFile, pickReelProfile } from '../media';

describe('validateReelFile', () => {
  it('accepts valid mp4 30s 50MB', () => {
    expect(
      validateReelFile({ uri: 'file://a.mp4', sizeBytes: 50 * 1024 * 1024, durationSec: 30, mime: 'video/mp4' }).ok,
    ).toBe(true);
  });
  it('rejects wrong mime', () => {
    const r = validateReelFile({ uri: 'file://a.png', sizeBytes: 1000, durationSec: 10, mime: 'image/png' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mime/i);
  });
  it('rejects too long', () => {
    const r = validateReelFile({ uri: 'file://a.mp4', sizeBytes: 10 * 1024 * 1024, durationSec: 200, mime: 'video/mp4' });
    expect(r.ok).toBe(false);
  });
  it('rejects too large', () => {
    const r = validateReelFile({ uri: 'file://a.mp4', sizeBytes: 200 * 1024 * 1024, durationSec: 30, mime: 'video/mp4' });
    expect(r.ok).toBe(false);
  });
});

describe('pickReelProfile', () => {
  it('picks lightweight 720p', () => {
    expect(pickReelProfile(30).maxHeight).toBe(720);
    expect(pickReelProfile(120).maxHeight).toBe(720);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/features/reels/__tests__/media.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL with "Cannot find module '../media'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/reels/media.ts
export type ReelFile = {
  uri: string;
  sizeBytes: number;
  durationSec: number;
  mime: string;
};

const ALLOWED = ['video/mp4', 'video/quicktime'];
const MAX_BYTES = 150 * 1024 * 1024;
const MIN_SEC = 3;
const MAX_SEC = 180;

export function validateReelFile(f: ReelFile): { ok: boolean; reason?: string } {
  if (!ALLOWED.includes(f.mime)) return { ok: false, reason: `unsupported mime ${f.mime}` };
  if (f.durationSec < MIN_SEC || f.durationSec > MAX_SEC)
    return { ok: false, reason: `duration ${f.durationSec}s must be ${MIN_SEC}..${MAX_SEC}s` };
  if (f.sizeBytes > MAX_BYTES) return { ok: false, reason: `size ${f.sizeBytes} exceeds 150MB` };
  if (!f.uri) return { ok: false, reason: 'missing uri' };
  return { ok: true };
}

export function pickReelProfile(durationSec: number): { maxHeight: 720 | 1280; bitrate: string } {
  if (durationSec <= 60) return { maxHeight: 720, bitrate: '3Mbps' };
  return { maxHeight: 720, bitrate: '2Mbps' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/features/reels/__tests__/media.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS, 5 tests.

Run: `yarn lint src/features/reels/media.ts src/features/reels/__tests__/media.test.ts src/lib/supabase.ts 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/reels/media.ts src/features/reels/__tests__/media.test.ts
git commit -m "feat: add reels media validation"
```

---
## Plan self-review

- Spec coverage: P0 covers spec Sections 2 (folders `src/lib/`, `src/features/reels/`), 5 (collab docs, CI checks), 4 (720p lightweight cap via `pickReelProfile`). P1-P3 intentionally deferred to Plans 2-4.
- No placeholders: all steps have exact file paths, code blocks, commands, expected outputs.
- Type consistency: `isSupabaseConfigured(): boolean`, `getSupabase(): SupabaseClient | null`, `validateReelFile(f: ReelFile): {ok, reason?}`, `pickReelProfile(n: number): {maxHeight, bitrate}` used identically in tests and impl.
