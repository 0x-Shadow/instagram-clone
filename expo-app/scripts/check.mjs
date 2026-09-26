// Zero-dependency TDD harness for pure-logic modules.
// Run: node scripts/check.mjs   (from expo-app/)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTs(rel) {
  const file = path.join(__dirname, '..', rel);
  const src = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(m, m.exports, require);
  return m.exports;
}

let pass = 0;
let fail = 0;
function assert(name, cond) {
  if (cond) {
    pass++;
    console.log('  ok - ' + name);
  } else {
    fail++;
    console.log('  FAIL - ' + name);
  }
}
function memStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

async function main() {
  console.log('persistence:');
  const { createPersistence, STORAGE_KEY } = loadTs('src/persistence.ts');
  assert('exports createPersistence + STORAGE_KEY', typeof createPersistence === 'function' && typeof STORAGE_KEY === 'string');

  const sample = {
    version: 1,
    users: [{ username: 'vucms', name: 'Vu', avatar: 'a', bio: 'b' }],
    posts: [{ id: 'p1', username: 'vucms', image: 'i', caption: 'c', likes: ['ana'], comments: [], createdAt: 1 }],
    stories: [{ username: 'ana', images: ['s'], seen: false }],
    messages: [{ id: 'm1', from: 'ana', to: 'vucms', text: 'hi', createdAt: 2 }],
    follows: { vucms: ['ana'] },
    bookmarks: ['p1'],
    invited: ['c9'],
    settings: {
      language: 'English',
      muted: [],
      blocked: [],
      restricted: [],
      closeFriends: [],
      archived: [],
      collections: [],
      highlights: [],
      followRequests: [],
    },
    readThreads: ['ana'],
    seenActivityAt: 3,
    searchHistory: ['#travel'],
  };
  console.log('settings shape guard:');
  const thin = memStorage();
  const pThin = createPersistence(thin);
  await pThin.save({ ...sample, settings: { language: 'English' } });
  assert('thin settings rejected (no crash shape)', (await pThin.load()) === null);

  const store = memStorage();
  const p = createPersistence(store);
  await p.save(sample);
  const back = await p.load();
  assert('round-trip preserves state', JSON.stringify(back) === JSON.stringify(sample));
  assert('bookmarks stay an array', Array.isArray(back && back.bookmarks) && back.bookmarks[0] === 'p1');

  const corrupt = memStorage({ [STORAGE_KEY]: '{not json' });
  assert('corrupt JSON loads as null', (await createPersistence(corrupt).load()) === null);

  const wrongVer = memStorage({ [STORAGE_KEY]: JSON.stringify({ ...sample, version: 999 }) });
  assert('version mismatch loads as null', (await createPersistence(wrongVer).load()) === null);

  assert('missing key loads as null', (await createPersistence(memStorage()).load()) === null);

  await p.clear();
  assert('clear removes stored state', (await p.load()) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.log('HARNESS ERROR: ' + (e && e.message));
  process.exit(1);
});
