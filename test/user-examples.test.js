import test from 'node:test';
import assert from 'node:assert/strict';
import { NEGATIVE_EXAMPLES } from '../corpus/negative-examples.js';
import { scorePost } from '../core/scorer.js';

for (const example of NEGATIVE_EXAMPLES) {
  test(`kullanıcı örneğini gizler: ${example.slice(0, 55)}`, () => {
    const result = scorePost({ title: example, body: '' });
    assert.equal(result.hidden, true, JSON.stringify(result, null, 2));
  });
}
