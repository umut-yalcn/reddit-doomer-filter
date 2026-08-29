import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PostFilter } from '../core/filter.js';
import { DecisionJournal } from '../core/journal.js';

function withMutedWarnings(callback) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    callback(warnings);
  } finally {
    console.warn = originalWarn;
  }
}

function hiddenPostDom() {
  return new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="error-boundary" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
}

test('karar callback hatası filtre kararını bozmaz ve geri bildirim düğmesi üretmez', () => {
  const dom = hiddenPostDom();
  withMutedWarnings((warnings) => {
    new PostFilter({
      doc: dom.window.document,
      onDecision: () => { throw new Error('sentetik karar hatası'); },
      onFeedback: () => true,
    }).processTree(dom.window.document);

    assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
    assert.equal([...dom.window.document.querySelectorAll('.rdf-bar button')]
      .some((button) => button.textContent === 'Yanlış gizlendi'), false);
    assert.equal(warnings.length, 1);
  });
});

test('kişisel kural okuma hatası otomatik filtreyi fail-open sınırında çalıştırır', () => {
  const dom = hiddenPostDom();
  withMutedWarnings((warnings) => {
    new PostFilter({
      doc: dom.window.document,
      matchPersonalRule: () => { throw new Error('sentetik kural okuma hatası'); },
    }).processTree(dom.window.document);

    assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
    assert.equal(warnings.length, 1);
  });
});

test('geri bildirim callback hatası içeriği yanlışlıkla göstermez', () => {
  const dom = hiddenPostDom();
  withMutedWarnings((warnings) => {
    new PostFilter({
      doc: dom.window.document,
      onDecision: () => 'error-feedback',
      onFeedback: () => { throw new Error('sentetik geri bildirim hatası'); },
    }).processTree(dom.window.document);

    const button = [...dom.window.document.querySelectorAll('.rdf-bar button')]
      .find((candidate) => candidate.textContent === 'Yanlış gizlendi');
    assert.doesNotThrow(() => button.click());
    assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
    assert.equal(warnings.length, 1);
  });
});

test('kişisel kural oluşturma callback hatası gizli sunumu korur', () => {
  const dom = hiddenPostDom();
  withMutedWarnings((warnings) => {
    new PostFilter({
      doc: dom.window.document,
      onCreatePersonalRule: () => { throw new Error('sentetik kural oluşturma hatası'); },
    }).processTree(dom.window.document);

    const button = [...dom.window.document.querySelectorAll('.rdf-bar button')]
      .find((candidate) => candidate.textContent === 'Daima göster');
    assert.doesNotThrow(() => button.click());
    assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
    assert.equal(warnings.length, 1);
  });
});

test('ertelenmiş günlük yazma hatası çağırana taşmadan onError ile bildirilir', () => {
  let scheduled = null;
  const errors = [];
  const journal = new DecisionJournal({
    read: () => [],
    write: () => { throw new Error('sentetik günlük yazma hatası'); },
    deferWrite: (callback) => { scheduled = callback; },
    onError: (error) => errors.push(error.message),
  });

  journal.record(
    { subreddit: 'CodingTR', title: 'Yazılım bitti', body: '' },
    { hidden: true, score: 5, threshold: 4, source: 'title', clause: 'Yazılım bitti', reasons: [] },
  );
  assert.equal(typeof scheduled, 'function');
  assert.doesNotThrow(() => scheduled());
  assert.deepEqual(errors, ['sentetik günlük yazma hatası']);
});
