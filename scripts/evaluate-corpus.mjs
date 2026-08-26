import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NEGATIVE_EXAMPLES } from '../corpus/negative-examples.js';
import { scorePost } from '../core/scorer.js';

const paths = process.argv.slice(2);
const records = paths.length
  ? []
  : NEGATIVE_EXAMPLES.map((text) => ({ source: 'corpus/negative-examples.js', text }));

for (const relativePath of paths) {
  const path = resolve(relativePath);
  const content = await readFile(path, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const markdown = line.match(/^- "(.+)"$/);
    if (markdown) records.push({ source: relativePath, text: markdown[1] });
  }

  if (relativePath.endsWith('.txt')) {
    for (const line of lines.slice(3)) {
      if (line.trim()) records.push({ source: relativePath, text: line.trim() });
    }
  }
}

const unique = [...new Map(records.map((record) => [record.text, record])).values()];
const evaluated = unique.map((record) => ({
  ...record,
  result: scorePost({ title: record.text, body: '' }),
}));
const hidden = evaluated.filter((item) => item.result.hidden);
const misses = evaluated.filter((item) => !item.result.hidden);

console.log(`Toplam benzersiz örnek: ${evaluated.length}`);
console.log(`Eşik üstü: ${hidden.length}`);
console.log(`Eşik altı: ${misses.length}`);
console.log(`Yakalama oranı: %${((hidden.length / Math.max(1, evaluated.length)) * 100).toFixed(1)}`);

if (misses.length) {
  console.log('\nEşik altı örnekler:');
  for (const item of misses) {
    console.log(`[${item.result.score}] ${item.text}`);
  }
}
