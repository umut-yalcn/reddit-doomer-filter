import test from 'node:test';
import assert from 'node:assert/strict';
import { splitClauses } from '../core/clauses.js';

test('noktalama ve karşıt bağlaçlarda cümleciklere ayırır', () => {
  assert.deepEqual(
    splitClauses('Yazılımı seviyorum. Ama sektör bitti; tıp okuyun!'),
    ['Yazılımı seviyorum', 'sektör bitti', 'tıp okuyun'],
  );
});

test('boş parçaları üretmez', () => {
  assert.deepEqual(splitClauses('... Fakat iş yok?'), ['iş yok']);
});

test('sıra sayısı noktasını cümle sınırı saymaz', () => {
  assert.deepEqual(
    splitClauses('1. yıldır iş arayışım devam ediyor. Bu 2. senem.'),
    ['1. yıldır iş arayışım devam ediyor', 'Bu 2. senem'],
  );
});
