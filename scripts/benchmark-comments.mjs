import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { PostFilter } from '../core/filter.js';

const count = Number.parseInt(process.argv[2] ?? '1000', 10);
if (!Number.isFinite(count) || count < 1) throw new Error('Yorum sayısı pozitif bir tam sayı olmalı.');

const markup = Array.from({ length: count }, (_, index) => `
  <shreddit-comment thingid="t1_${index}" permalink="/r/CodingTR/comments/post/comment/example/">
    <div slot="comment">${index % 2 === 0 ? 'Yazılım bitti, bölüm değiştirin.' : 'Yeni projemi yayınladım.'}</div>
    <div slot="actionRow">Yanıtla</div>
  </shreddit-comment>
`).join('');
const dom = new JSDOM(`<!doctype html><html><head></head><body>${markup}</body></html>`, {
  url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
});

const startedAt = performance.now();
new PostFilter({ doc: dom.window.document }).processTree(dom.window.document);
const elapsedMs = performance.now() - startedAt;
const hidden = dom.window.document.querySelectorAll('.rdf-bar--comment').length;

console.log(JSON.stringify({
  comments: count,
  hidden,
  elapsedMs: Number(elapsedMs.toFixed(1)),
  averageMs: Number((elapsedMs / count).toFixed(3)),
}));
