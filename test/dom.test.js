import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { findPostElements, extractPost } from '../core/content-dom.js';

test('yeni Reddit postundan başlık, gövde ve subreddit çıkarır', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post post-id="abc" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR">
      <div slot="text-body">Tıp okuyun.</div>
    </shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/new/' });
  globalThis.Node = dom.window.Node;
  const posts = findPostElements(dom.window.document);
  assert.equal(posts.length, 1);
  assert.deepEqual(extractPost(posts[0]), {
    id: 'abc',
    subreddit: 'codingtr',
    title: 'Yazılım bitti',
    body: 'Tıp okuyun.',
    element: posts[0],
  });
});

test('old Reddit postundan metin çıkarır', () => {
  const dom = new JSDOM(`<!doctype html><body><div id="siteTable">
    <div class="thing link" data-fullname="t3_old" data-subreddit="TurkDev">
      <p class="title"><a class="title">Normal başlık</a></p>
      <div class="expando"><div class="md">Normal gövde</div></div>
    </div>
  </div></body>`, { url: 'https://old.reddit.com/r/TurkDev/' });
  globalThis.Node = dom.window.Node;
  const post = findPostElements(dom.window.document)[0];
  assert.equal(extractPost(post).subreddit, 'turkdev');
  assert.equal(extractPost(post).body, 'Normal gövde');
});
