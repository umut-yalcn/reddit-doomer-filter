import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionJournal } from '../core/journal.js';

function memoryJournal(options = {}) {
  let value = options.initialValue ?? '[]';
  const journal = new DecisionJournal({
    read: () => value,
    write: (entries) => { value = JSON.stringify(entries); },
    now: () => new Date('2026-08-26T10:00:00.000Z'),
    ...options,
  });
  return { journal, raw: () => value };
}

const result = {
  hidden: true,
  score: 4,
  threshold: 4,
  source: 'title',
  clause: 'Yazılım bitti',
  reasons: [{ category: 'terminal', score: 5, reason: 'bitiş hükmü' }],
  question: false,
};

test('aynı post kararını tekilleştirir ve görülme sayısını artırır', () => {
  const { journal } = memoryJournal();
  const post = { subreddit: 'CodingTR', title: 'Yazılım bitti', body: '' };
  const first = journal.record(post, result);
  const second = journal.record(post, result);
  assert.equal(first, second);
  assert.equal(journal.list().length, 1);
  assert.equal(journal.list()[0].occurrences, 2);
});

test('Reddit kimliği aynı postun değişen gövdesini tek kayıt altında günceller', () => {
  const { journal } = memoryJournal();
  const first = journal.record({ id: 't3_abc', subreddit: 'CodingTR', title: 'Başlık', body: 'Kısa' }, result);
  const second = journal.record({ id: 't3_abc', subreddit: 'CodingTR', title: 'Başlık', body: 'Sonradan açılmış uzun gövde' }, result);
  assert.equal(first, second);
  assert.equal(journal.list().length, 1);
  assert.equal(journal.list()[0].body, 'Sonradan açılmış uzun gövde');
  assert.equal(journal.list()[0].occurrences, 2);
});

test('geri bildirimi karara bağlar ve dışa aktarır', () => {
  const { journal } = memoryJournal();
  const id = journal.record({ subreddit: 'TurkDev', title: 'Normal post', body: '' }, { ...result, hidden: false, score: 0 });
  assert.equal(journal.mark(id, 'false-negative'), true);
  assert.equal(journal.mark(id, 'geçersiz'), false);
  const payload = journal.exportPayload();
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.entryCount, 1);
  assert.equal(payload.entries[0].feedback, 'false-negative');
});

test('yorum kararını postlardan ayrı tür ve kimlikle saklar', () => {
  const { journal } = memoryJournal();
  const postId = journal.record({ id: 'shared', subreddit: 'CodingTR', title: 'Başlık', body: '' }, result);
  const commentId = journal.record({ kind: 'comment', id: 'shared', subreddit: 'CodingTR', title: '', body: 'Yazılım bitti' }, result);
  assert.notEqual(commentId, postId);
  assert.deepEqual(journal.list().map((entry) => entry.kind), ['post', 'comment']);
});

test('karar değiştiğinde önceki karara ait geri bildirimi taşımaz', () => {
  const { journal } = memoryJournal();
  const post = { id: 't3_changed', subreddit: 'CodingTR', title: 'Yazılım bitti', body: '' };
  const id = journal.record(post, result);
  assert.equal(journal.mark(id, 'false-positive'), true);
  journal.record(
    { ...post, body: 'Bu söylem saçmalık, sektör gayet iyi.' },
    { ...result, hidden: false, score: 0, source: null, clause: '', reasons: [] },
  );
  assert.equal(journal.list()[0].feedback, null);
});

test('v1 kaydındaki geri bildirimi karar değişmediyse kayıpsız taşır', () => {
  const first = memoryJournal();
  const post = { id: 't3_legacy', subreddit: 'CodingTR', title: 'Yazılım bitti', body: '' };
  const id = first.journal.record(post, result);
  first.journal.mark(id, 'false-positive');
  const legacyEntries = JSON.parse(first.raw());
  delete legacyEntries[0].decisionFingerprint;

  const migrated = memoryJournal({ initialValue: JSON.stringify(legacyEntries) });
  migrated.journal.record(post, result);
  assert.equal(migrated.journal.list()[0].feedback, 'false-positive');
  assert.ok(migrated.journal.list()[0].decisionFingerprint);
});

test('günlük sınırında etiketli kaydı etiketsiz kayıttan önce korur', () => {
  const { journal } = memoryJournal({ maxEntries: 2 });
  const first = journal.record({ subreddit: 'CodingTR', title: 'Bir', body: '' }, result);
  assert.equal(journal.mark(first, 'false-positive'), true);
  journal.record({ subreddit: 'CodingTR', title: 'İki', body: '' }, result);
  journal.record({ subreddit: 'CodingTR', title: 'Üç', body: '' }, result);
  assert.deepEqual(journal.list().map((entry) => entry.title), ['Bir', 'Üç']);
});

test('ertelenmiş depolamada çok sayıda kararı tek yazımda toplar', () => {
  let writes = 0;
  let scheduled = null;
  const { journal } = memoryJournal({
    write: () => { writes += 1; },
    deferWrite: (callback) => { scheduled = callback; },
  });
  journal.record({ subreddit: 'CodingTR', title: 'Bir', body: '' }, result);
  journal.record({ subreddit: 'CodingTR', title: 'İki', body: '' }, result);
  journal.record({ subreddit: 'CodingTR', title: 'Üç', body: '' }, result);
  assert.equal(writes, 0);
  assert.equal(typeof scheduled, 'function');
  scheduled();
  assert.equal(writes, 1);
  assert.equal(journal.flush(), false);
});

test('depolama okuması hata verirse boş günlükle fail-open devam eder', () => {
  const errors = [];
  const journal = new DecisionJournal({
    read: () => { throw new Error('storage unavailable'); },
    write: () => {},
    onError: (error) => errors.push(error.message),
  });
  assert.doesNotThrow(() => journal.record({ subreddit: 'CodingTR', title: 'Bir', body: '' }, result));
  assert.deepEqual(errors, ['storage unavailable']);
  assert.equal(journal.list().length, 1);
});

test('bozuk depolamayı fail-open ele alır ve günlük boyutunu sınırlar', () => {
  let value = '{bozuk';
  const journal = new DecisionJournal({
    read: () => value,
    write: (entries) => { value = JSON.stringify(entries); },
    now: () => new Date('2026-08-26T10:00:00.000Z'),
    maxEntries: 2,
  });
  journal.record({ subreddit: 'CodingTR', title: 'Bir', body: '' }, result);
  journal.record({ subreddit: 'CodingTR', title: 'İki', body: '' }, result);
  journal.record({ subreddit: 'CodingTR', title: 'Üç', body: '' }, result);
  assert.deepEqual(journal.list().map((entry) => entry.title), ['İki', 'Üç']);
});

test('yerel karar günlüğünü açıkça sıfırlar', () => {
  const state = memoryJournal();
  state.journal.record({ subreddit: 'CodingTR', title: 'Bir', body: '' }, result);
  assert.equal(state.journal.clear(), true);
  assert.deepEqual(state.journal.list(), []);
  assert.equal(state.journal.clear(), false);
});
