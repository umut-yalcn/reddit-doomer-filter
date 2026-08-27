import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const userscript = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.comments-dev.user.js'), 'utf8');

function boot(markup, { url = 'https://www.reddit.com/r/CodingTR/comments/post/example/', initialStorage = new Map() } = {}) {
  const storage = new Map(initialStorage);
  const menus = [];
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(error));
  const dom = new JSDOM(markup, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  dom.window.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.GM_registerMenuCommand = (label, action) => menus.push({ label, action });
  dom.window.eval(userscript);
  return { dom, storage, menus, jsdomErrors };
}

const nestedMarkup = `<!doctype html><html><head></head><body>
  <shreddit-post post-id="normal-post" post-title="C++ projem" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  <shreddit-comment thingid="t1_parent" permalink="/r/CodingTR/comments/post/comment/parent/">
    <details>
      <div slot="commentMeta">parent</div>
      <div slot="comment">AI ile beraber kod yazma da bitti zaten.</div>
      <div slot="actionRow">Yanıtla</div>
      <shreddit-comment thingid="t1_child" permalink="/r/CodingTR/comments/post/comment/child/" slot="children-t1_parent-0">
        <details><div slot="comment">AI kod yazma devri bitti derken anlamadım ben.</div><div slot="actionRow">Yanıtla</div></details>
      </shreddit-comment>
    </details>
  </shreddit-comment>
</body></html>`;
const legacySettings = new Map([
  ['rdf_settings_v1', JSON.stringify({ subreddits: ['codingtr', 'turkdev', 'engineeringtr'] })],
]);
const first = boot(nestedMarkup, { initialStorage: legacySettings });
const parent = first.dom.window.document.querySelector('shreddit-comment[thingid="t1_parent"]');
const child = first.dom.window.document.querySelector('shreddit-comment[thingid="t1_child"]');
const parentBody = [...parent.querySelectorAll('[slot="comment"]')]
  .find((node) => node.closest('shreddit-comment') === parent);
assert.equal(first.dom.window.document.querySelector('shreddit-post').style.display, '');
assert.equal(parentBody.style.display, 'none');
assert.equal(child.querySelector('[slot="comment"]').style.display, '');
assert.ok(parent.querySelector('.rdf-bar--comment'));
assert.ok(first.menus.some((menu) => menu.label === 'Yorum filtresini kapat'));
assert.ok(first.menus.some((menu) => menu.label === '✓ r/trgamedeveloper filtresi'));
const migratedSettings = JSON.parse(first.storage.get('rdf_settings_v1'));
assert.equal(migratedSettings.filterComments, true);
assert.ok(migratedSettings.subreddits.includes('trgamedeveloper'));
parent.querySelector('.rdf-bar--comment button').click();
assert.equal(parentBody.style.display, '');

const disabled = boot(nestedMarkup, { initialStorage: new Map([
  ['rdf_settings_v1', JSON.stringify({
    settingsSchemaVersion: 2,
    filterComments: false,
    subreddits: ['codingtr', 'turkdev', 'engineeringtr', 'trgamedeveloper'],
  })],
]) });
assert.equal(disabled.dom.window.document.querySelector('shreddit-comment [slot="comment"]').style.display, '');
assert.ok(disabled.menus.some((menu) => menu.label === 'Yorum filtresini aç'));

const oldReddit = boot(`<!doctype html><html><head></head><body>
  <div class="thing comment" data-fullname="t1_old">
    <div class="entry"><div class="usertext-body"><div class="md">Kodlama bitti.</div></div><ul class="flat-list buttons"><li>reply</li></ul></div>
  </div>
</body></html>`, { url: 'https://old.reddit.com/r/TurkDev/comments/post/example/' });
assert.equal(oldReddit.dom.window.document.querySelector('.usertext-body').style.display, 'none');

for (const run of [first, disabled, oldReddit]) {
  const unexpected = run.jsdomErrors.filter((error) => !/navigation/i.test(error.message));
  assert.deepEqual(unexpected, []);
  run.dom.window.close();
}
console.log('Yorum DEV bundle duman testi geçti · post/yorum ayrımı, nested yanıt, migration ve old Reddit doğrulandı');
