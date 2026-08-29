import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { PostFilter } from '../core/filter.js';
import { matchPersonalRule } from '../core/overrides.js';

const count = Number.parseInt(process.argv[2] ?? '1000', 10);
const personalRuleCount = process.argv[3] === 'with-rules' ? 100 : 0;
const budgetArgument = process.argv.find((argument) => argument.startsWith('--max-average-ms='));
const maxAverageMs = budgetArgument
  ? Number.parseFloat(budgetArgument.slice('--max-average-ms='.length))
  : null;
if (!Number.isFinite(count) || count < 1) throw new Error('Yorum sayısı pozitif bir tam sayı olmalı.');
if (maxAverageMs !== null && (!Number.isFinite(maxAverageMs) || maxAverageMs <= 0)) {
  throw new Error('Ortalama süre bütçesi pozitif bir sayı olmalı.');
}

const markup = Array.from({ length: count }, (_, index) => `
  <shreddit-comment thingid="t1_${index}" permalink="/r/CodingTR/comments/post/comment/example/">
    <div slot="comment">${index % 2 === 0 ? 'Yazılım bitti, bölüm değiştirin.' : 'Yeni projemi yayınladım.'}</div>
    <div slot="actionRow">Yanıtla</div>
  </shreddit-comment>
`).join('');
const dom = new JSDOM(`<!doctype html><html><head></head><body>${markup}</body></html>`, {
  url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
});
const personalRules = Array.from({ length: personalRuleCount }, (_, index) => ({
  id: `benchmark-${index}`,
  action: index % 2 === 0 ? 'show' : 'hide',
  scope: 'comment',
  phrase: `eşleşmeyen performans kuralı ${index}`,
  normalizedPhrase: `eslesmeyen performans kurali ${index}`,
}));

const startedAt = performance.now();
new PostFilter({
  doc: dom.window.document,
  matchPersonalRule: personalRuleCount > 0
    ? (content) => matchPersonalRule(content, personalRules)
    : null,
}).processTree(dom.window.document);
const elapsedMs = performance.now() - startedAt;
const hidden = dom.window.document.querySelectorAll('.rdf-bar--comment').length;
const averageMs = elapsedMs / count;

console.log(JSON.stringify({
  comments: count,
  hidden,
  personalRules: personalRuleCount,
  elapsedMs: Number(elapsedMs.toFixed(1)),
  averageMs: Number(averageMs.toFixed(3)),
  maxAverageMs,
}));

if (maxAverageMs !== null && averageMs > maxAverageMs) {
  throw new Error(`Performans bütçesi aşıldı: ${averageMs.toFixed(3)} ms/yorum > ${maxAverageMs} ms/yorum`);
}
