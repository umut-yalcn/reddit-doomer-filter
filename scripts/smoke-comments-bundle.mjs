import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const userscript = await readFile(join(ROOT, 'dist', 'reddit-doom-filter.comments-dev.user.js'), 'utf8');

function boot(markup, {
  url = 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  initialStorage = new Map(),
  promptValue,
  provideGM = true,
  forbidLocalStorage = false,
} = {}) {
  const storage = new Map(initialStorage);
  const menus = [];
  const prompts = [];
  const alerts = [];
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(error));
  const dom = new JSDOM(markup, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  if (provideGM) {
    dom.window.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
    dom.window.GM_setValue = (key, value) => storage.set(key, value);
  }
  if (forbidLocalStorage) {
    Object.defineProperty(dom.window, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('localStorage kullanılmamalı'); },
    });
  }
  dom.window.GM_registerMenuCommand = (label, action) => menus.push({ label, action });
  dom.window.prompt = (message, suggested) => {
    prompts.push({ message, suggested });
    return promptValue === undefined ? suggested : promptValue;
  };
  dom.window.alert = (message) => alerts.push(String(message));
  dom.window.confirm = () => true;
  dom.window.eval(userscript);
  return { dom, storage, menus, prompts, alerts, jsdomErrors };
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
assert.ok(first.menus.some((menu) => menu.label === 'Yorum filtresini kapat'));
assert.ok(first.menus.some((menu) => menu.label === 'Kişisel kuralları kapat'));
assert.ok(first.menus.some((menu) => menu.label === 'Kişisel kuralları içe aktar'));
assert.ok(first.menus.some((menu) => menu.label === '✓ r/trgamedeveloper filtresi'));
const migratedSettings = JSON.parse(first.storage.get('rdf_settings_v1'));
assert.equal(migratedSettings.settingsSchemaVersion, 3);
assert.equal(migratedSettings.filterComments, true);
assert.equal(migratedSettings.personalOverridesEnabled, true);
assert.ok(migratedSettings.subreddits.includes('trgamedeveloper'));

const temporaryShowComment = [...parent.querySelectorAll('.rdf-bar--comment button')]
  .find((button) => button.textContent === 'Göster');
assert.ok(temporaryShowComment);
temporaryShowComment.click();
assert.equal(parentBody.style.display, '');
assert.equal(temporaryShowComment.textContent, 'Tekrar gizle');
temporaryShowComment.click();
assert.equal(parentBody.style.display, 'none');
assert.equal(temporaryShowComment.textContent, 'Göster');

const alwaysShowComment = [...parent.querySelectorAll('.rdf-bar--comment button')]
  .find((button) => button.textContent === 'Benzer yorumları daima göster');
assert.ok(alwaysShowComment);
alwaysShowComment.click();
assert.equal(parentBody.style.display, '');
const savedCommentRules = JSON.parse(first.storage.get('rdf_personal_rules_v1'));
assert.equal(savedCommentRules.length, 1);
assert.equal(savedCommentRules[0].action, 'show');
assert.equal(savedCommentRules[0].scope, 'comment');
assert.equal(first.prompts[0].suggested, 'AI ile beraber kod yazma da bitti zaten');

const reappliedComment = boot(nestedMarkup, { initialStorage: first.storage });
assert.equal(reappliedComment.dom.window.document.querySelector('shreddit-comment [slot="comment"]').style.display, '');
assert.equal(reappliedComment.dom.window.document.querySelector('.rdf-bar--comment'), null);

const samePhraseDifferentScope = boot(`<!doctype html><html><head></head><body>
  <shreddit-post post-id="same-post" post-title="AI ile beraber kod yazma da bitti zaten" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
</body></html>`, { initialStorage: first.storage, url: 'https://www.reddit.com/r/CodingTR/new/' });
assert.equal(samePhraseDifferentScope.dom.window.document.querySelector('shreddit-post').style.display, 'none');

const legacyRuleStorage = new Map([
  ['rdf_personal_rules_v1', JSON.stringify([{ action: 'show', phrase: 'Yazılım bitti' }])],
]);
const legacyRuleRun = boot(`<!doctype html><html><head></head><body>
  <shreddit-post post-id="legacy-post" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  <shreddit-comment thingid="legacy-comment" permalink="/r/CodingTR/comments/post/comment/example/"><div slot="comment">Yazılım bitti</div></shreddit-comment>
</body></html>`, { initialStorage: legacyRuleStorage });
assert.equal(legacyRuleRun.dom.window.document.querySelector('shreddit-post').style.display, '');
assert.equal(legacyRuleRun.dom.window.document.querySelector('[slot="comment"]').style.display, 'none');

const calibrationStorage = new Map([
  ['rdf_settings_v1', JSON.stringify({ settingsSchemaVersion: 3, calibrationMode: true })],
]);
const calibration = boot(`<!doctype html><html><head></head><body>
  <shreddit-comment thingid="normal-comment" permalink="/r/CodingTR/comments/post/comment/example/"><div slot="comment">Normal yorum metni</div></shreddit-comment>
</body></html>`, { initialStorage: calibrationStorage });
const alwaysHideComment = [...calibration.dom.window.document.querySelectorAll('.rdf-bar--comment-review button')]
  .find((button) => button.textContent === 'Benzer yorumları daima gizle');
assert.ok(alwaysHideComment);
alwaysHideComment.click();
const savedHideRules = JSON.parse(calibration.storage.get('rdf_personal_rules_v1'));
assert.equal(savedHideRules[0].action, 'hide');
assert.equal(savedHideRules[0].scope, 'comment');

const reappliedHide = boot(`<!doctype html><html><head></head><body>
  <shreddit-comment thingid="normal-comment-2" permalink="/r/CodingTR/comments/post/comment/example/"><div slot="comment">Normal yorum metni</div></shreddit-comment>
</body></html>`, { initialStorage: calibration.storage });
assert.equal(reappliedHide.dom.window.document.querySelector('[slot="comment"]').style.display, 'none');
assert.match(reappliedHide.dom.window.document.querySelector('.rdf-bar--comment').textContent, /kişisel daima gizle/);

const disabled = boot(nestedMarkup, { initialStorage: new Map([
  ['rdf_settings_v1', JSON.stringify({
    settingsSchemaVersion: 3,
    filterComments: false,
    personalOverridesEnabled: false,
    subreddits: ['codingtr', 'turkdev', 'engineeringtr', 'trgamedeveloper'],
  })],
  ['rdf_personal_rules_v1', JSON.stringify([{ action: 'show', scope: 'post', phrase: 'C++ projem' }])],
]) });
assert.equal(disabled.dom.window.document.querySelector('shreddit-comment [slot="comment"]').style.display, '');
assert.ok(disabled.menus.some((menu) => menu.label === 'Yorum filtresini aç'));
assert.ok(disabled.menus.some((menu) => menu.label === 'Kişisel kuralları aç'));

const trGameExplicitlyDisabledAtV2 = boot(`<!doctype html><html><head></head><body>
  <shreddit-post post-id="trgame-disabled" post-title="Oyun sektörü bitti" subreddit-prefixed-name="r/TrGameDeveloper"></shreddit-post>
</body></html>`, { initialStorage: new Map([
  ['rdf_settings_v1', JSON.stringify({
    settingsSchemaVersion: 2,
    subreddits: ['codingtr', 'turkdev', 'engineeringtr'],
  })],
]) });
assert.equal(trGameExplicitlyDisabledAtV2.dom.window.document.querySelector('shreddit-post').style.display, '');
assert.ok(trGameExplicitlyDisabledAtV2.menus.some((menu) => menu.label === '○ r/trgamedeveloper filtresi'));
assert.equal(JSON.parse(trGameExplicitlyDisabledAtV2.storage.get('rdf_settings_v1')).settingsSchemaVersion, 3);

const oldReddit = boot(`<!doctype html><html><head></head><body>
  <div class="thing comment" data-fullname="t1_old">
    <div class="entry"><div class="usertext-body"><div class="md">Kodlama bitti.</div></div><ul class="flat-list buttons"><li>reply</li></ul></div>
  </div>
</body></html>`, { url: 'https://old.reddit.com/r/TurkDev/comments/post/example/' });
assert.equal(oldReddit.dom.window.document.querySelector('.usertext-body').style.display, 'none');

const noGrantFallback = boot(`<!doctype html><html><head></head><body>
  <shreddit-post post-id="fallback-post" post-title="Yazılım sektörü bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
</body></html>`, { provideGM: false, forbidLocalStorage: true });
assert.equal(noGrantFallback.dom.window.document.querySelector('shreddit-post').style.display, 'none');
assert.equal('__redditDoomFilter' in noGrantFallback.dom.window, false);

const journalReset = boot('<!doctype html><html><head></head><body></body></html>', {
  initialStorage: new Map([
    ['rdf_settings_v1', JSON.stringify({ settingsSchemaVersion: 3, enabled: false })],
    ['rdf_journal_v1', JSON.stringify([{ id: 'local-entry' }])],
  ]),
});
const resetJournalMenu = journalReset.menus.find((menu) => menu.label === 'Karar günlüğünü sıfırla');
assert.ok(resetJournalMenu);
resetJournalMenu.action();
assert.deepEqual(JSON.parse(journalReset.storage.get('rdf_journal_v1')), []);
assert.ok(journalReset.alerts.includes('Yerel karar günlüğü silindi.'));

for (const run of [
  first, reappliedComment, samePhraseDifferentScope, legacyRuleRun,
  calibration, reappliedHide, disabled, trGameExplicitlyDisabledAtV2, oldReddit,
  noGrantFallback, journalReset,
]) {
  const unexpected = run.jsdomErrors.filter((error) => !/navigation/i.test(error.message));
  assert.deepEqual(unexpected, []);
  run.dom.window.close();
}

console.log('Birleşik DEV bundle duman testi geçti · post/yorum kapsamı, eski kurallar ve yeniden uygulama doğrulandı');
