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
  assert.equal(dom.window.document.querySelector('.rdf-bar'), null);
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
