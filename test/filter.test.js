import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PostFilter } from '../core/filter.js';

test('hedef subredditte karamsar postu geri alınabilir biçimde gizler', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <shreddit-post post-id="abc" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body></html>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;

  const filter = new PostFilter({ doc: dom.window.document });
  filter.processTree(dom.window.document);

  const post = dom.window.document.querySelector('shreddit-post');
  const bar = dom.window.document.querySelector('.rdf-bar');
  assert.equal(post.style.display, 'none');
  assert.ok(bar);
  assert.match(bar.textContent, /Karamsar içerik gizlendi/);

  bar.querySelector('button').click();
  assert.equal(post.style.display, '');
  assert.equal(bar.querySelector('button').textContent, 'Tekrar gizle');
  assert.match(bar.textContent, /geçici olarak gösteriliyor/);

  bar.querySelector('button').click();
  assert.equal(post.style.display, 'none');
  assert.equal(bar.querySelector('button').textContent, 'Göster');
  assert.match(bar.textContent, /Karamsar içerik gizlendi/);
});

test('hedef dışı subreddit ve normal post görünür kalır', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="a" post-title="Yazılım bitti" subreddit-prefixed-name="r/programming"></shreddit-post>
    <shreddit-post post-id="b" post-title="Yeni projeme başladım" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/' });
  globalThis.Node = dom.window.Node;
  const filter = new PostFilter({ doc: dom.window.document });
  filter.processTree(dom.window.document);
  for (const post of dom.window.document.querySelectorAll('shreddit-post')) {
    assert.notEqual(post.style.display, 'none');
  }
});

test('MutationObserver sonradan eklenen postu işler', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'https://www.reddit.com/r/TurkDev/new/',
    pretendToBeVisual: true,
  });
  globalThis.Node = dom.window.Node;

  const filter = new PostFilter({ doc: dom.window.document }).start();
  const post = dom.window.document.createElement('shreddit-post');
  post.setAttribute('post-id', 'dynamic');
  post.setAttribute('post-title', 'Tıp oku, CENG bitti');
  post.setAttribute('subreddit-prefixed-name', 'r/TurkDev');
  dom.window.document.querySelector('main').append(post);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 90));
  assert.equal(post.style.display, 'none');
  assert.ok(dom.window.document.querySelector('.rdf-bar'));
  filter.stop();
});

test('MutationObserver mevcut post kabuğuna sonradan gelen başlık ve gövdeyi yeniden işler', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>
    <shreddit-post id="t3_late" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </main></body></html>`, {
    url: 'https://www.reddit.com/r/CodingTR/new/',
    pretendToBeVisual: true,
  });
  globalThis.Node = dom.window.Node;

  const filter = new PostFilter({ doc: dom.window.document }).start();
  const post = dom.window.document.querySelector('shreddit-post');
  post.setAttribute('post-title', 'Yazılım bitti');
  const body = dom.window.document.createElement('div');
  body.setAttribute('slot', 'text-body');
  body.textContent = 'Tıp oku.';
  post.append(body);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(post.style.display, 'none');
  assert.equal(dom.window.document.querySelectorAll('.rdf-bar').length, 1);
  filter.stop();
});

test('gövde sonradan iddiayı çürütürse gizli postu yeniden değerlendirip gösterir', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>
    <shreddit-post id="t3_rebutted" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </main></body></html>`, {
    url: 'https://www.reddit.com/r/CodingTR/new/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const post = dom.window.document.querySelector('shreddit-post');
  assert.equal(post.style.display, 'none');

  const body = dom.window.document.createElement('div');
  body.setAttribute('slot', 'text-body');
  body.textContent = 'Bence bu söylem saçmalık, sektör gayet iyi.';
  post.append(body);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(post.style.display, '');
  assert.equal(dom.window.document.querySelectorAll('.rdf-bar').length, 0);
  filter.stop();
});

test('SPA benzeri eleman yeniden kullanımında subreddit ve başlık değişimini işler', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>
    <shreddit-post id="t3_reused" post-title="Normal proje" subreddit-prefixed-name="r/programming"></shreddit-post>
  </main></body></html>`, {
    url: 'https://www.reddit.com/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const post = dom.window.document.querySelector('shreddit-post');
  post.setAttribute('subreddit-prefixed-name', 'r/TurkDev');
  post.setAttribute('post-title', 'CENG bitti, tıp oku');

  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(post.style.display, 'none');
  assert.equal(dom.window.document.querySelectorAll('.rdf-bar').length, 1);
  filter.stop();
});

test('gizlenmiş post hedef dışı subreddit için yeniden kullanılırsa geri açılır', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>
    <shreddit-post id="t3_reused_outside" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </main></body></html>`, {
    url: 'https://www.reddit.com/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const post = dom.window.document.querySelector('shreddit-post');
  assert.equal(post.style.display, 'none');
  post.setAttribute('subreddit-prefixed-name', 'r/programming');

  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(post.style.display, '');
  assert.equal(dom.window.document.querySelectorAll('.rdf-bar').length, 0);
  assert.equal(post.getAttribute('data-rdf-state'), 'shown');
  filter.stop();
});

test('mevcut gövde metni sonradan değiştiğinde postu yeniden değerlendirir', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main>
    <shreddit-post id="t3_text" post-title="Kariyer konuşması" subreddit-prefixed-name="r/EngineeringTR">
      <div slot="text-body">Normal bir paylaşım.</div>
    </shreddit-post>
  </main></body></html>`, {
    url: 'https://www.reddit.com/r/EngineeringTR/new/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const post = dom.window.document.querySelector('shreddit-post');
  post.querySelector('[slot="text-body"]').firstChild.data = 'Tıp oku, mühendislik boş iş.';

  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(post.style.display, 'none');
  filter.stop();
});

test('değişmeyen postu yeniden işlemek kontrol çubuğunu çoğaltmaz', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post id="t3_once" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  const filter = new PostFilter({ doc: dom.window.document });
  const post = dom.window.document.querySelector('shreddit-post');
  filter.processTree(dom.window.document);
  filter.processPost(post);
  filter.processTree(dom.window.document);
  assert.equal(dom.window.document.querySelectorAll('.rdf-bar').length, 1);
});

test('gizlenen post için yanlış pozitif geri bildirimi kaydeder ve postu gösterir', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="feedback-hidden" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  const feedback = [];
  const filter = new PostFilter({
    doc: dom.window.document,
    onDecision: () => 'decision-hidden',
    onFeedback: (id, label) => { feedback.push({ id, label }); return true; },
  });
  filter.processTree(dom.window.document);

  const incorrect = [...dom.window.document.querySelectorAll('.rdf-bar button')]
    .find((button) => button.textContent === 'Yanlış gizlendi');
  incorrect.click();
  assert.deepEqual(feedback, [{ id: 'decision-hidden', label: 'false-positive' }]);
  assert.equal(dom.window.document.querySelector('shreddit-post').style.display, '');
});

test('kalibrasyon modunda görünür post için kaçırıldı geri bildirimi sunar', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="feedback-shown" post-title="Normal bir proje" subreddit-prefixed-name="r/TurkDev"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/TurkDev/new/' });
  const feedback = [];
  const filter = new PostFilter({
    doc: dom.window.document,
    settings: { calibrationMode: true },
    onDecision: () => 'decision-shown',
    onFeedback: (id, label) => { feedback.push({ id, label }); return true; },
  });
  filter.processTree(dom.window.document);

  const button = dom.window.document.querySelector('.rdf-bar--review button');
  assert.equal(button.textContent, 'Gizlenmeliydi');
  button.click();
  assert.deepEqual(feedback, [{ id: 'decision-shown', label: 'false-negative' }]);
  assert.equal(button.textContent, 'Kaydedildi');
  assert.equal(button.disabled, true);
});

test('kişisel göster ve gizle kuralları otomatik post kararının üzerine uygulanır', () => {
  const shown = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="personal-show" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  new PostFilter({
    doc: shown.window.document,
    matchPersonalRule: (content) => content.kind === 'post'
      ? { id: 'show-post', action: 'show', scope: 'post', phrase: 'Yazılım bitti' }
      : null,
  }).processTree(shown.window.document);
  assert.equal(shown.window.document.querySelector('shreddit-post').style.display, '');

  const hidden = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="personal-hide" post-title="Normal bir proje" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  new PostFilter({
    doc: hidden.window.document,
    matchPersonalRule: () => ({ id: 'hide-post', action: 'hide', scope: 'post', phrase: 'Normal bir proje' }),
  }).processTree(hidden.window.document);
  assert.equal(hidden.window.document.querySelector('shreddit-post').style.display, 'none');
  assert.match(hidden.window.document.querySelector('.rdf-bar').textContent, /kişisel daima gizle/);
});

test('posttaki daima göster düğmesi post kapsamlı kural ister ve içeriği geri açar', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="always-show-post" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  const requests = [];
  new PostFilter({
    doc: dom.window.document,
    onCreatePersonalRule: (request) => { requests.push(request); return true; },
  }).processTree(dom.window.document);
  const temporary = [...dom.window.document.querySelectorAll('.rdf-bar button')]
    .find((candidate) => candidate.textContent === 'Göster');
  temporary.click();
  assert.equal(temporary.textContent, 'Tekrar gizle');
  const button = [...dom.window.document.querySelectorAll('.rdf-bar button')]
    .find((candidate) => candidate.textContent === 'Daima göster');
  assert.ok(button);
  button.click();
  assert.equal(requests[0].scope, 'post');
  assert.equal(requests[0].action, 'show');
  assert.equal(requests[0].suggestedPhrase, 'Yazılım bitti');
  assert.equal(dom.window.document.querySelector('shreddit-post').style.display, '');
  assert.equal(dom.window.document.querySelector('.rdf-bar'), null);
});

test('kalibrasyondaki daima gizle düğmesi post kapsamlı kural ister', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="always-hide-post" post-title="Normal proje başlığı" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  const requests = [];
  new PostFilter({
    doc: dom.window.document,
    settings: { calibrationMode: true },
    onDecision: () => 'shown-post',
    onCreatePersonalRule: (request) => { requests.push(request); return true; },
  }).processTree(dom.window.document);
  const button = [...dom.window.document.querySelectorAll('.rdf-bar--review button')]
    .find((candidate) => candidate.textContent === 'Daima gizle');
  assert.ok(button);
  button.click();
  assert.equal(requests[0].scope, 'post');
  assert.equal(requests[0].action, 'hide');
  assert.equal(requests[0].suggestedPhrase, 'Normal proje başlığı');
});

test('uzun post gövdesinin sonundaki karamsar sinyali kesmeden değerlendirir', () => {
  const filler = 'güvenli içerik '.repeat(2200);
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="long-post" post-title="Uzun değerlendirme" subreddit-prefixed-name="r/CodingTR">
      <div slot="text-body">${filler} Yazılım sektörü bitti.</div>
    </shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  const post = dom.window.document.querySelector('shreddit-post');
  new PostFilter({ doc: dom.window.document }).processTree(dom.window.document);
  assert.equal(post.style.display, 'none');
});
