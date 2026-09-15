import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  detectCurrentUsername,
  normalizeRedditUsername,
} from '../core/content-dom.js';
import { PostFilter } from '../core/filter.js';

test('Reddit kullanıcı adını profil yolu, u/ öneki ve büyük harften normalize eder', () => {
  assert.equal(normalizeRedditUsername('u/Example_User'), 'example_user');
  assert.equal(normalizeRedditUsername('/user/Example-User/'), 'example-user');
  assert.equal(
    normalizeRedditUsername('https://www.reddit.com/user/Example_User/?source=header'),
    'example_user',
  );
});

test('modern Reddit hesap niteliğinden ve old Reddit hesap başlığından oturum adını bulur', () => {
  const modern = new JSDOM('<reddit-header-action-items account-name="ExampleUser"></reddit-header-action-items>');
  assert.equal(detectCurrentUsername(modern.window.document), 'exampleuser');

  const old = new JSDOM(`<!doctype html><body>
    <div id="header-bottom-right"><span class="user">
      <a href="https://old.reddit.com/user/OldUser/">OldUser</a>
    </span></div>
  </body>`);
  assert.equal(detectCurrentUsername(old.window.document), 'olduser');
});

test('içerikteki sıradan yazar profilini oturum hesabı sanmaz', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post author="OtherUser">
      <a href="/user/OtherUser/">u/OtherUser</a>
    </shreddit-post>
  </body>`);
  assert.equal(detectCurrentUsername(dom.window.document), '');
});

test('kendi karamsar post ve yorumunu puanlamadan ve günlüğe yazmadan görünür bırakır', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <shreddit-post post-id="own-post" author="ExampleUser" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
    <shreddit-comment thingid="own-comment" author="exampleuser" permalink="/r/CodingTR/comments/post/comment/own/">
      <div slot="comment">CENG bitti, tıp oku.</div>
      <div slot="actionRow">Yanıtla</div>
    </shreddit-comment>
  </body></html>`, { url: 'https://www.reddit.com/r/CodingTR/comments/post/example/' });
  const decisions = [];
  new PostFilter({
    doc: dom.window.document,
    settings: { ownUsername: 'u/EXAMPLEUSER' },
    onDecision: (content) => { decisions.push(content); return content.id; },
  }).processTree(dom.window.document);

  const post = dom.window.document.querySelector('shreddit-post');
  const comment = dom.window.document.querySelector('shreddit-comment');
  assert.equal(post.style.display, '');
  assert.equal(comment.querySelector('[slot="comment"]').style.display, '');
  assert.equal(post.getAttribute('data-rdf-state'), 'shown-own');
  assert.equal(comment.getAttribute('data-rdf-state'), 'shown-own');
  assert.equal(dom.window.document.querySelector('.rdf-bar'), null);
  assert.deepEqual(decisions, []);
});

test('kendi içerik muafiyeti kişisel daima gizle kuralından önce uygulanır', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post author="Owner" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/' });
  new PostFilter({
    doc: dom.window.document,
    settings: { ownUsername: 'owner' },
    matchPersonalRule: () => ({ action: 'hide', scope: 'post', phrase: 'Yazılım bitti' }),
  }).processTree(dom.window.document);
  assert.equal(dom.window.document.querySelector('shreddit-post').style.display, '');
});

test('başka kullanıcının aynı karamsar içeriğini gizlemeye devam eder', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <shreddit-post author="OtherUser" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body>`, { url: 'https://www.reddit.com/r/CodingTR/' });
  new PostFilter({
    doc: dom.window.document,
    settings: { ownUsername: 'Owner' },
  }).processTree(dom.window.document);
  assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
});

test('oturum adı sayfa açıldıktan sonra gelirse önceden gizlenen kendi içeriğini geri açar', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <reddit-header-action-items></reddit-header-action-items>
    <shreddit-post author="LateOwner" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>
  </body></html>`, {
    url: 'https://www.reddit.com/r/CodingTR/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({
    doc: dom.window.document,
    getCurrentUsername: () => detectCurrentUsername(dom.window.document),
  }).start();
  const post = dom.window.document.querySelector('shreddit-post');
  assert.equal(post.style.display, 'none');

  dom.window.document.querySelector('reddit-header-action-items')
    .setAttribute('account-name', 'LateOwner');
  await new Promise((resolve) => dom.window.setTimeout(resolve, 140));

  assert.equal(post.style.display, '');
  assert.equal(post.getAttribute('data-rdf-state'), 'shown-own');
  assert.equal(dom.window.document.querySelector('.rdf-bar'), null);
  filter.stop();
  dom.window.close();
});
