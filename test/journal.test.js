import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionJournal } from '../core/journal.js';

function memoryJournal(options = {}) {
  let value = '[]';
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
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.entryCount, 1);
  assert.equal(payload.entries[0].feedback, 'false-negative');
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
