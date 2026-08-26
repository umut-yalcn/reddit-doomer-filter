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

test('Türkçe ve noktalama farklarına rağmen ifadeyi başlıkta eşleştirir', () => {
  const rules = [{
    id: 'one',
    action: 'hide',
    phrase: 'Yazılım sektörü bitmiş',
    normalizedPhrase: 'yazilim sektoru bitmis',
    createdAt: '2026-08-27T10:00:00.000Z',
  }];
  const match = matchPersonalRule(
    { title: 'YAZILIM sektörü bitmiş! Ne yapacağım?', body: '' },
    rules,
  );
  assert.equal(match?.id, 'one');
  assert.equal(match?.action, 'hide');
});

test('kural kelime sınırını aşarak daha uzun bir kelimenin içinde eşleşmez', () => {
  const rules = [{
    id: 'short',
    action: 'hide',
    phrase: 'iş',
    normalizedPhrase: 'is',
    createdAt: '2026-08-27T10:00:00.000Z',
  }];
  assert.equal(matchPersonalRule({ title: 'İşsiz kalacağım', body: '' }, rules), null);
});

test('başlık ile gövde sınırını birleştirip sahte ifade üretmez', () => {
  const rules = [{
    id: 'boundary',
    action: 'hide',
    phrase: 'sektör bitti',
    normalizedPhrase: 'sektor bitti',
    createdAt: '2026-08-27T10:00:00.000Z',
  }];
  assert.equal(matchPersonalRule({ title: 'Sektör', body: 'Bitti artık.' }, rules), null);
});

test('çakışan kurallarda en uzun ve özel ifade kazanır', () => {
  const rules = [
    { id: 'broad', action: 'hide', phrase: 'yazılım bitti', normalizedPhrase: 'yazilim bitti', createdAt: '2026-08-27T10:00:00.000Z' },
    { id: 'specific', action: 'show', phrase: 'yazılım bitti söylemi saçmalık', normalizedPhrase: 'yazilim bitti soylemi sacmalik', createdAt: '2026-08-27T10:01:00.000Z' },
  ];
  const match = matchPersonalRule({ title: 'Yazılım bitti söylemi saçmalık', body: '' }, rules);
  assert.equal(match?.id, 'specific');
  assert.equal(match?.action, 'show');
});

test('aynı uzunluktaki çakışmada en son açık tercih kazanır', () => {
  const rules = [
    { id: 'old', action: 'hide', phrase: 'ceng boş iş', normalizedPhrase: 'ceng bos is', createdAt: '2026-08-27T10:00:00.000Z' },
    { id: 'new', action: 'show', phrase: 'ceng boş iş', normalizedPhrase: 'ceng bos is', createdAt: '2026-08-27T10:01:00.000Z' },
  ];
  assert.equal(matchPersonalRule({ title: 'CENG boş iş', body: '' }, rules)?.action, 'show');
});

test('çok kısa ve aşırı genel ifade kaydını reddeder', () => {
  assert.deepEqual(validatePersonalRulePhrase('AI'), {
    valid: false,
    reason: 'İfade en az 4 karakter olmalı.',
  });
  assert.equal(validatePersonalRulePhrase('CENG').valid, true);
});

test('aynı normalize ifadeye verilen yeni karar eskisini değiştirir', () => {
  const { store } = memoryStore();
  store.add('hide', 'Yazılım bitti');
  store.add('show', 'yazılım   bitti!');
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].action, 'show');
  assert.equal(store.match({ title: 'Yazılım bitti', body: '' })?.action, 'show');
});

test('kural sayısını son 100 kayıtla sınırlar', () => {
  const { store } = memoryStore();
  for (let index = 0; index < 105; index += 1) store.add('hide', `kural ${index}`);
  assert.equal(store.list().length, 100);
  assert.equal(store.list()[0].phrase, 'kural 5');
  assert.equal(store.list().at(-1).phrase, 'kural 104');
});

test('bozuk veya erişilemeyen depoda boş kurallarla fail-open devam eder', () => {
  const errors = [];
  const corrupt = new PersonalRuleStore({ read: () => '{bozuk', write: () => {} });
  assert.deepEqual(corrupt.list(), []);
  assert.equal(corrupt.match({ title: 'Yazılım bitti', body: '' }), null);

  const unavailable = new PersonalRuleStore({
    read: () => { throw new Error('storage unavailable'); },
    write: () => {},
    onError: (error) => errors.push(error.message),
  });
  assert.doesNotThrow(() => unavailable.list());
  assert.deepEqual(errors, ['storage unavailable']);
});

test('yazma hatasını sessiz başarı saymayıp çağırana bildirir', () => {
  const errors = [];
  const store = new PersonalRuleStore({
    read: () => '[]',
    write: () => { throw new Error('quota exceeded'); },
    onError: (error) => errors.push(error.message),
  });
  assert.throws(() => store.add('hide', 'Yazılım bitti'), /quota exceeded/);
  assert.deepEqual(errors, ['quota exceeded']);
});

test('silme, sıfırlama ve dışa aktarma geri alınabilir yönetimi destekler', () => {
  const { store } = memoryStore();
  const first = store.add('show', 'Yazılım bitti');
  store.add('hide', 'Tıp oku dostum');
  assert.equal(store.remove(first.id), true);
  assert.equal(store.remove('olmayan'), false);
  const payload = store.exportPayload();
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ruleCount, 1);
  assert.equal(store.clear(), 1);
  assert.deepEqual(store.list(), []);
});
