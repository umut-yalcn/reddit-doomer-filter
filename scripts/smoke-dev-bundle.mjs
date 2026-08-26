import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const userscript = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.dev.user.js'), 'utf8');

function boot(markup, initialStorage = new Map(), promptValue = null) {
  const storage = new Map(initialStorage);
  const menus = [];
  const prompts = [];
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(error));
  const dom = new JSDOM(markup, {
    url: 'https://www.reddit.com/r/CodingTR/new/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.window.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.GM_registerMenuCommand = (label, action) => menus.push({ label, action });
  dom.window.prompt = (message, suggested) => {
    prompts.push({ message, suggested });
    return promptValue ?? suggested;
  };
  dom.window.alert = () => {};
  dom.window.confirm = () => true;
  dom.window.eval(userscript);
  return { dom, storage, menus, prompts, jsdomErrors };
}

const hiddenMarkup = `<!doctype html><html><head></head><body>
  <shreddit-post post-id="bundle-hidden" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
</body></html>`;
const first = boot(hiddenMarkup, new Map(), 'Yazılım bitti');
const hiddenPost = first.dom.window.document.querySelector('shreddit-post');
assert.equal(hiddenPost.style.display, 'none');
assert.ok(first.menus.some((menu) => menu.label.startsWith('Kişisel kuralları yönet')));
const alwaysShow = [...first.dom.window.document.querySelectorAll('.rdf-bar button')]
  .find((button) => button.textContent === 'Daima göster');
assert.ok(alwaysShow);
alwaysShow.click();
assert.equal(first.prompts[0].suggested, 'Yazılım bitti');
const savedRules = JSON.parse(first.storage.get('rdf_personal_rules_v1'));
assert.equal(savedRules.length, 1);
assert.equal(savedRules[0].action, 'show');

const second = boot(hiddenMarkup, first.storage);
assert.equal(second.dom.window.document.querySelector('shreddit-post').style.display, '');
assert.equal(second.dom.window.document.querySelector('[data-rdf-state]').getAttribute('data-rdf-state'), 'shown');
second.dom.window.prompt = () => '1';
second.menus.find((menu) => menu.label.startsWith('Kişisel kuralları yönet')).action();
assert.deepEqual(JSON.parse(second.storage.get('rdf_personal_rules_v1')), []);

const calibrationStorage = new Map([
  ['rdf_settings_v1', JSON.stringify({ calibrationMode: true })],
]);
const shownMarkup = `<!doctype html><html><head></head><body>
  <shreddit-post post-id="bundle-shown" post-title="Sunucu projem" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
</body></html>`;
const third = boot(shownMarkup, calibrationStorage, 'Sunucu projem');
const alwaysHide = [...third.dom.window.document.querySelectorAll('.rdf-bar--review button')]
  .find((button) => button.textContent === 'Daima gizle');
assert.ok(alwaysHide);
alwaysHide.click();
const hideRules = JSON.parse(third.storage.get('rdf_personal_rules_v1'));
assert.equal(hideRules[0].action, 'hide');

const legacySettings = new Map([
  ['rdf_settings_v1', JSON.stringify({
    subreddits: ['codingtr', 'turkdev', 'engineeringtr'],
  })],
]);
const migrated = boot(`<!doctype html><html><head></head><body>
  <shreddit-post post-id="bundle-tr-game" post-title="Oyun sektörü bitti, bölüm değiştirin" subreddit-prefixed-name="r/TrGameDeveloper"></shreddit-post>
</body></html>`, legacySettings);
assert.equal(migrated.dom.window.document.querySelector('shreddit-post').style.display, 'none');
const migratedSettings = JSON.parse(migrated.storage.get('rdf_settings_v1'));
assert.equal(migratedSettings.settingsSchemaVersion, 2);
assert.ok(migratedSettings.subreddits.includes('trgamedeveloper'));
assert.ok(migrated.menus.some((menu) => menu.label === '✓ r/trgamedeveloper filtresi'));

for (const run of [first, second, third, migrated]) {
  const unexpected = run.jsdomErrors.filter((error) => !/navigation/i.test(error.message));
  assert.deepEqual(unexpected, []);
  run.dom.window.close();
}

console.log('DEV bundle duman testi geçti · göster/gizle kaydı ve yeniden uygulama doğrulandı');
