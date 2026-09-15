import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractComment,
  findCommentElements,
  findContainingCommentElement,
} from '../core/content-dom.js';

test('yeni Reddit yorumunda yalnız kendi metnini çıkarır, alt yanıtı karıştırmaz', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-comment thingid="t1_parent" author="ParentUser" permalink="/r/CodingTR/comments/post/comment/parent/">
      <details>
        <div slot="commentMeta">parent-user</div>
        <div slot="comment" id="t1_parent-comment-rtjson-content">Yazılım bitti.</div>
        <div slot="actionRow">Yanıtla</div>
        <shreddit-comment thingid="t1_child" permalink="/r/CodingTR/comments/post/comment/child/" slot="children-t1_parent-0">
          <details>
            <div slot="comment">Bu söylem saçmalık, sektör bitmedi.</div>
            <div slot="actionRow">Yanıtla</div>
          </details>
        </shreddit-comment>
      </details>
    </shreddit-comment>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/comments/post/example/' });

  const comments = findCommentElements(dom.window.document);
  assert.equal(comments.length, 2);
  const parent = extractComment(comments[0]);
  assert.equal(parent.id, 't1_parent');
  assert.equal(parent.subreddit, 'codingtr');
  assert.equal(parent.author, 'parentuser');
  assert.equal(parent.body, 'Yazılım bitti.');
  assert.equal(parent.contentElement.id, 't1_parent-comment-rtjson-content');
  assert.equal(parent.actionElements.length, 1);
  assert.equal(extractComment(comments[1]).body, 'Bu söylem saçmalık, sektör bitmedi.');
});

test('old Reddit yorumunda yalnız doğrudan entry metnini çıkarır', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div class="thing comment" data-fullname="t1_old_parent" data-author="OldParent">
      <div class="entry">
        <div class="usertext-body"><div class="md">CENG boş iş, tıp oku.</div></div>
        <ul class="flat-list buttons"><li>reply</li></ul>
      </div>
      <div class="child"><div class="sitetable">
        <div class="thing comment" data-fullname="t1_old_child">
          <div class="entry"><div class="usertext-body"><div class="md">Katılmıyorum.</div></div></div>
        </div>
      </div></div>
    </div>
  </body>`, { url: 'https://old.reddit.com/r/TurkDev/comments/post/example/' });

  const comments = findCommentElements(dom.window.document);
  assert.equal(comments.length, 2);
  const parent = extractComment(comments[0]);
  assert.equal(parent.id, 't1_old_parent');
  assert.equal(parent.subreddit, 'turkdev');
  assert.equal(parent.author, 'oldparent');
  assert.equal(parent.body, 'CENG boş iş, tıp oku.');
  assert.equal(parent.actionElements.length, 1);
  assert.equal(extractComment(comments[1]).body, 'Katılmıyorum.');
});

test('yorum içindeki metin düğümünden en yakın yorum kabuğunu bulur', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-comment thingid="t1_nearest"><div slot="comment"><span>Metin</span></div></shreddit-comment>
  </body>`);
  const text = dom.window.document.querySelector('span').firstChild;
  assert.equal(findContainingCommentElement(text)?.getAttribute('thingid'), 't1_nearest');
});
