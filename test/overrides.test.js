import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PersonalRuleStore,
  matchPersonalRule,
  validatePersonalRulePhrase,
} from '../core/overrides.js';

function memoryStore(options = {}) {
  let value = options.initialValue ?? '[]';
  let tick = 0;
  const store = new PersonalRuleStore({
    read: () => value,
    write: (rules) => { value = JSON.stringify(rules); },
    now: () => new Date(1_800_000_000_000 + tick++),
    ...options,
  });
  return { store, raw: () => value };
}

test('Türkçe ve noktalama farklarına rağmen aynı kapsamdaki ifadeyi eşleştirir', () => {
  const rules = [{
    id: 'one', action: 'hide', scope: 'post', phrase: 'Yazılım sektörü bitmiş',
    normalizedPhrase: 'yazilim sektoru bitmis', createdAt: '2026-08-27T10:00:00.000Z',
  }];
  const match = matchPersonalRule(
    { kind: 'post', title: 'YAZILIM sektörü bitmiş! Ne yapacağım?', body: '' },
    rules,
  );
  assert.equal(match?.id, 'one');
  assert.equal(match?.action, 'hide');
});

test('post ve yorum kuralları birbirini etkilemez', () => {
  const rules = [
    { id: 'post', action: 'hide', scope: 'post', phrase: 'yazılım bitti', normalizedPhrase: 'yazilim bitti' },
    { id: 'comment', action: 'show', scope: 'comment', phrase: 'yazılım bitti', normalizedPhrase: 'yazilim bitti' },
  ];
  assert.equal(matchPersonalRule({ kind: 'post', title: 'Yazılım bitti', body: '' }, rules)?.id, 'post');
  assert.equal(matchPersonalRule({ kind: 'comment', title: '', body: 'Yazılım bitti' }, rules)?.id, 'comment');
});

test('kural kelime sınırını aşarak daha uzun bir kelimenin içinde eşleşmez', () => {
  const rules = [{ id: 'short', action: 'hide', scope: 'comment', phrase: 'iş', normalizedPhrase: 'is' }];
  assert.equal(matchPersonalRule({ kind: 'comment', body: 'İşsiz kalacağım' }, rules), null);
});

test('başlık ile gövde sınırını birleştirip sahte ifade üretmez', () => {
  const rules = [{ id: 'boundary', action: 'hide', scope: 'post', phrase: 'sektör bitti', normalizedPhrase: 'sektor bitti' }];
  assert.equal(matchPersonalRule({ kind: 'post', title: 'Sektör', body: 'Bitti artık.' }, rules), null);
});

test('çakışan kurallarda en uzun, eşitlikte en son tercih kazanır', () => {
  const rules = [
    { id: 'broad', action: 'hide', scope: 'post', phrase: 'yazılım bitti', normalizedPhrase: 'yazilim bitti' },
    { id: 'specific', action: 'show', scope: 'post', phrase: 'yazılım bitti söylemi saçmalık', normalizedPhrase: 'yazilim bitti soylemi sacmalik' },
    { id: 'same-old', action: 'hide', scope: 'comment', phrase: 'ceng boş iş', normalizedPhrase: 'ceng bos is' },
    { id: 'same-new', action: 'show', scope: 'comment', phrase: 'ceng boş iş', normalizedPhrase: 'ceng bos is' },
  ];
  assert.equal(matchPersonalRule({ kind: 'post', title: 'Yazılım bitti söylemi saçmalık' }, rules)?.id, 'specific');
  assert.equal(matchPersonalRule({ kind: 'comment', body: 'CENG boş iş' }, rules)?.id, 'same-new');
});

test('çok kısa ve aşırı genel ifade kaydını reddeder', () => {
  assert.deepEqual(validatePersonalRulePhrase('AI'), {
    valid: false,
    reason: 'İfade en az 4 karakter olmalı.',
  });
  assert.equal(validatePersonalRulePhrase('CENG').valid, true);
});

test('aynı kapsam ve normalize ifadeye verilen yeni karar eskisini değiştirir', () => {
  const { store } = memoryStore();
  store.add('hide', 'Yazılım bitti', 'post');
  store.add('show', 'yazılım   bitti!', 'post');
  store.add('hide', 'Yazılım bitti', 'comment');
  assert.equal(store.list().length, 2);
  assert.equal(store.match({ kind: 'post', title: 'Yazılım bitti' })?.action, 'show');
  assert.equal(store.match({ kind: 'comment', body: 'Yazılım bitti' })?.action, 'hide');
});

test('kapsamsız eski kuralları yalnız post kapsamına geçirir', () => {
  const { store } = memoryStore({ initialValue: JSON.stringify([
    { id: 'legacy', action: 'show', phrase: 'Yazılım bitti', createdAt: '2026-08-27T10:00:00.000Z' },
  ]) });
  assert.equal(store.list()[0].scope, 'post');
  assert.equal(store.match({ kind: 'post', title: 'Yazılım bitti' })?.id, 'legacy');
  assert.equal(store.match({ kind: 'comment', body: 'Yazılım bitti' }), null);
});

test('kapsamı açıkça geçersiz bozuk depolama kuralını post kuralına çevirmeden yok sayar', () => {
  const { store } = memoryStore({ initialValue: JSON.stringify([
    { id: 'corrupt', action: 'show', scope: 'all', phrase: 'Yazılım bitti' },
  ]) });
  assert.deepEqual(store.list(), []);
});

test('kural sayısını son 100 kayıtla sınırlar', () => {
  const { store } = memoryStore();
  for (let index = 0; index < 105; index += 1) store.add('hide', `kural ${index}`, index % 2 ? 'post' : 'comment');
  assert.equal(store.list().length, 100);
  assert.equal(store.list()[0].phrase, 'kural 5');
  assert.equal(store.list().at(-1).phrase, 'kural 104');
});

test('bozuk veya erişilemeyen depoda boş kurallarla fail-open devam eder', () => {
  const errors = [];
  const corrupt = new PersonalRuleStore({ read: () => '{bozuk', write: () => {} });
  assert.deepEqual(corrupt.list(), []);
  const unavailable = new PersonalRuleStore({
    read: () => { throw new Error('storage unavailable'); }, write: () => {},
    onError: (error) => errors.push(error.message),
  });
  assert.doesNotThrow(() => unavailable.list());
  assert.deepEqual(errors, ['storage unavailable']);
});

test('yazma hatasını sessiz başarı saymayıp çağırana bildirir', () => {
  const errors = [];
  const store = new PersonalRuleStore({
    read: () => '[]', write: () => { throw new Error('quota exceeded'); },
    onError: (error) => errors.push(error.message),
  });
  assert.throws(() => store.add('hide', 'Yazılım bitti', 'post'), /quota exceeded/);
  assert.deepEqual(errors, ['quota exceeded']);
});

test('dışa aktarma kapsamı korur ve eski şema içe aktarımını posta geçirir', () => {
  const { store } = memoryStore();
  store.add('show', 'Yazılım bitti', 'comment');
  const payload = store.exportPayload();
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.rules[0].scope, 'comment');

  const imported = memoryStore();
  const result = imported.store.importPayload({
    schemaVersion: 1,
    rules: [{ action: 'hide', phrase: 'Tıp oku dostum' }],
  });
  assert.deepEqual(result, { imported: 1, total: 1 });
  assert.equal(imported.store.list()[0].scope, 'post');
});

test('içe aktarma mevcut kurallarla birleşir ve aynı kapsam-ifade için içe aktarılan kazanır', () => {
  const { store } = memoryStore();
  store.add('hide', 'Yazılım bitti', 'post');
  store.add('show', 'Normal yorum', 'comment');
  const result = store.importPayload(JSON.stringify({
    schemaVersion: 2,
    rules: [
      { action: 'show', scope: 'post', phrase: 'yazılım bitti!' },
      { action: 'hide', scope: 'comment', phrase: 'Tıp oku' },
    ],
  }));
  assert.deepEqual(result, { imported: 2, total: 3 });
  assert.equal(store.match({ kind: 'post', title: 'Yazılım bitti' })?.action, 'show');
});

test('bozuk, gelecekteki veya kısmen geçersiz içe aktarmayı hiçbir şeyi değiştirmeden reddeder', () => {
  const { store } = memoryStore();
  store.add('show', 'Geçerli kural', 'post');
  const before = store.list();
  assert.throws(() => store.importPayload('{bozuk'), /JSON/);
  assert.throws(() => store.importPayload({ schemaVersion: 99, rules: [] }), /şema/i);
  assert.throws(() => store.importPayload({ schemaVersion: 2, rules: [
    { action: 'show', scope: 'post', phrase: 'Geçerli ifade' },
    { action: 'sil', scope: 'post', phrase: 'Geçersiz ifade' },
  ] }), /geçersiz/i);
  assert.deepEqual(store.list(), before);
});

test('silme ve sıfırlama kapsamlı kuralları yönetir', () => {
  const { store } = memoryStore();
  const first = store.add('show', 'Yazılım bitti', 'post');
  store.add('hide', 'Tıp oku dostum', 'comment');
  assert.equal(store.remove(first.id), true);
  assert.equal(store.remove('olmayan'), false);
  assert.equal(store.clear(), 1);
  assert.deepEqual(store.list(), []);
});
