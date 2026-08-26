import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTurkish, isQuestion } from '../core/normalize.js';

test('Türkçe karakterleri ve büyük harfleri normalize eder', () => {
  assert.equal(normalizeTurkish('MÜHENDİSLİĞİ BİTMİŞ'), 'muhendisligi bitmis');
});

test('sansürlü yazılım ve uzatılmış harfleri normalize eder', () => {
  assert.equal(normalizeTurkish('Y*ZİLİM bittiiii, çöööp!'), 'yazilim bitti cop');
});

test('soru işareti olmadan ayrı soru ekini tanır', () => {
  assert.equal(isQuestion('Sektör bitti mi acaba'), true);
  assert.equal(isQuestion('İşsiz miyim'), true);
  assert.equal(isQuestion('Sektör öldü mü acaba'), true);
  assert.equal(isQuestion('İşsiz muyum'), true);
  assert.equal(isQuestion('Bölüm kötü müymüş'), true);
  assert.equal(isQuestion('Bu doğru muydu'), true);
  assert.equal(isQuestion('Hazır mıydınız'), true);
  assert.equal(isQuestion('Sektör bugün iyi'), false);
});
