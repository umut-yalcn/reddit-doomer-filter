import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PostFilter } from '../core/filter.js';

function newCommentMarkup({
  id = 't1_comment',
  subreddit = 'CodingTR',
  body = 'Yazılım bitti.',
  child = '',
} = {}) {
  return `<!doctype html><html><head></head><body>
    <shreddit-comment thingid="${id}" permalink="/r/${subreddit}/comments/post/comment/example/">
      <details>
        <div slot="commentMeta">user</div>
        <div slot="comment">${body}</div>
        <div slot="actionRow">Yanıtla</div>
        ${child}
      </details>
    </shreddit-comment>
  </body></html>`;
}

test('karamsar yeni Reddit yorumunun yalnız kendi içeriğini gizler ve geri getirir', () => {
  const child = `<shreddit-comment thingid="t1_child" permalink="/r/CodingTR/comments/post/comment/child/" slot="children-t1_comment-0">
    <details><div slot="comment">Normal bir cevap.</div><div slot="actionRow">Yanıtla</div></details>
  </shreddit-comment>`;
  const dom = new JSDOM(newCommentMarkup({ child }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const filter = new PostFilter({ doc: dom.window.document });
  filter.processTree(dom.window.document);

  const parent = dom.window.document.querySelector('shreddit-comment[thingid="t1_comment"]');
  const ownBody = [...parent.querySelectorAll('[slot="comment"]')]
    .find((node) => node.closest('shreddit-comment') === parent);
  const childBody = dom.window.document.querySelector('shreddit-comment[thingid="t1_child"] [slot="comment"]');
  const ownActions = [...parent.querySelectorAll('[slot="actionRow"]')]
    .find((node) => node.closest('shreddit-comment') === parent);
  const bar = parent.querySelector('.rdf-bar--comment');
  assert.equal(parent.style.display, '');
  assert.equal(ownBody.style.display, 'none');
  assert.equal(ownActions.style.display, 'none');
  assert.equal(childBody.style.display, '');
  assert.ok(bar);
  assert.match(bar.textContent, /Karamsar yorum gizlendi/);

  bar.querySelector('button').click();
  assert.equal(ownBody.style.display, '');
  assert.equal(ownActions.style.display, '');
  assert.equal(parent.querySelector('.rdf-bar--comment'), null);
});

test('normal ebeveyn yorumu altındaki karamsar yanıt ebeveyni etkilemeden gizlenir', () => {
  const child = `<shreddit-comment thingid="t1_negative_child" permalink="/r/CodingTR/comments/post/comment/child/" slot="children-t1_comment-0">
    <details><div slot="comment">Kodlama bitti, artık dilden bağımsızız.</div><div slot="actionRow">Yanıtla</div></details>
  </shreddit-comment>`;
  const dom = new JSDOM(newCommentMarkup({ body: 'Ben C++ öğrenmeyi seviyorum.', child }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  new PostFilter({ doc: dom.window.document }).processTree(dom.window.document);
  const parent = dom.window.document.querySelector('shreddit-comment[thingid="t1_comment"]');
  const childElement = dom.window.document.querySelector('shreddit-comment[thingid="t1_negative_child"]');
  const parentBody = [...parent.querySelectorAll('[slot="comment"]')]
    .find((node) => node.closest('shreddit-comment') === parent);
  assert.equal(parentBody.style.display, '');
  assert.equal(childElement.querySelector('[slot="comment"]').style.display, 'none');
  assert.equal(parent.querySelectorAll(':scope > .rdf-bar--comment').length, 0);
});

test('normal yorum görünür kalır ve hedef dışı subreddit yorumu işlenmez', () => {
  const normal = new JSDOM(newCommentMarkup({ body: 'Yeni oyun motoru projemi yayınladım.' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const outside = new JSDOM(newCommentMarkup({ subreddit: 'programming', body: 'Yazılım bitti.' }), {
    url: 'https://www.reddit.com/r/programming/comments/post/example/',
  });
  new PostFilter({ doc: normal.window.document }).processTree(normal.window.document);
  new PostFilter({ doc: outside.window.document }).processTree(outside.window.document);
  assert.equal(normal.window.document.querySelector('[slot="comment"]').style.display, '');
  assert.equal(outside.window.document.querySelector('[slot="comment"]').style.display, '');
});

test('old Reddit karamsar yorum içeriğini gizler, alt yanıtı görünür bırakır', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="thing comment" data-fullname="t1_old">
      <div class="entry">
        <div class="usertext-body"><div class="md">Tıp oku, CENG boş iş.</div></div>
        <ul class="flat-list buttons"><li>reply</li></ul>
      </div>
      <div class="child"><div class="sitetable">
        <div class="thing comment" data-fullname="t1_old_child">
          <div class="entry"><div class="usertext-body"><div class="md">Normal cevap.</div></div></div>
        </div>
      </div></div>
    </div>
  </body></html>`, { url: 'https://old.reddit.com/r/EngineeringTR/comments/post/example/' });
  new PostFilter({ doc: dom.window.document }).processTree(dom.window.document);
  const parentBody = dom.window.document.querySelector('[data-fullname="t1_old"] > .entry .usertext-body');
  const childBody = dom.window.document.querySelector('[data-fullname="t1_old_child"] > .entry .usertext-body');
  assert.equal(parentBody.style.display, 'none');
  assert.equal(childBody.style.display, '');
});

test('sonradan eklenen yorum MutationObserver ile işlenir', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const host = dom.window.document.createElement('div');
  host.innerHTML = newCommentMarkup({ id: 't1_dynamic', body: 'Yazılım sektörü bitti.' });
  dom.window.document.querySelector('main').append(host.querySelector('shreddit-comment'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(dom.window.document.querySelector('[slot="comment"]').style.display, 'none');
  filter.stop();
});

test('yorum metni sonradan karamsarlığı reddederse yeniden görünür olur', async () => {
  const dom = new JSDOM(newCommentMarkup(), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const body = dom.window.document.querySelector('[slot="comment"]');
  assert.equal(body.style.display, 'none');
  body.textContent = 'Yazılım bitti diyenlere katılmıyorum, sektör gayet iyi.';
  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(body.style.display, '');
  assert.equal(dom.window.document.querySelector('.rdf-bar--comment'), null);
  filter.stop();
});

test('gizlenmiş yorum boşalırsa önceki sunum temizlenir ve fail-open görünür kalır', async () => {
  const dom = new JSDOM(newCommentMarkup(), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const body = dom.window.document.querySelector('[slot="comment"]');
  assert.equal(body.style.display, 'none');
  body.textContent = '';
  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(body.style.display, '');
  assert.equal(dom.window.document.querySelector('.rdf-bar--comment'), null);
  assert.equal(dom.window.document.querySelector('shreddit-comment').getAttribute('data-rdf-state'), 'shown');
  filter.stop();
});

test('gizlenmiş yorum hedef dışı permalink ile yeniden kullanılırsa geri açılır', async () => {
  const dom = new JSDOM(newCommentMarkup(), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
    pretendToBeVisual: true,
  });
  const filter = new PostFilter({ doc: dom.window.document }).start();
  const comment = dom.window.document.querySelector('shreddit-comment');
  const body = dom.window.document.querySelector('[slot="comment"]');
  assert.equal(body.style.display, 'none');
  comment.setAttribute('permalink', '/r/programming/comments/post/comment/example/');
  await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
  assert.equal(body.style.display, '');
  assert.equal(comment.querySelector('.rdf-bar--comment'), null);
  assert.equal(comment.getAttribute('data-rdf-state'), 'shown');
  filter.stop();
});

test('aynı yorum yeniden işlendiğinde yer tutucu çoğalmaz', () => {
  const dom = new JSDOM(newCommentMarkup(), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const filter = new PostFilter({ doc: dom.window.document });
  filter.processTree(dom.window.document);
  filter.processTree(dom.window.document);
  filter.processTree(dom.window.document.querySelector('shreddit-comment'));
  assert.equal(dom.window.document.querySelectorAll('.rdf-bar--comment').length, 1);
});

test('yeniden değerlendirme hatası daha önce gizlenen yorumu fail-open geri açar', () => {
  const dom = new JSDOM(newCommentMarkup(), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const filter = new PostFilter({ doc: dom.window.document });
  const comment = dom.window.document.querySelector('shreddit-comment');
  const body = dom.window.document.querySelector('[slot="comment"]');
  filter.processTree(dom.window.document);
  assert.equal(body.style.display, 'none');

  comment.querySelectorAll = () => { throw new Error('sentetik DOM hatası'); };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    filter.processComment(comment);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(body.style.display, '');
  assert.equal(comment.getAttribute('data-rdf-state'), 'error');
});

test('yorum kararını türüyle günlüğe yollar ve yanlış gizlendi geri bildirimi çalışır', () => {
  const dom = new JSDOM(newCommentMarkup({ id: 't1_feedback' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const decisions = [];
  const feedback = [];
  const filter = new PostFilter({
    doc: dom.window.document,
    onDecision: (content, result) => { decisions.push({ content, result }); return 'comment-decision'; },
    onFeedback: (id, label) => { feedback.push({ id, label }); return true; },
  });
  filter.processTree(dom.window.document);
  assert.equal(decisions[0].content.kind, 'comment');
  assert.equal(decisions[0].content.id, 't1_feedback');
  const incorrect = [...dom.window.document.querySelectorAll('.rdf-bar--comment button')]
    .find((button) => button.textContent === 'Yanlış gizlendi');
  incorrect.click();
  assert.deepEqual(feedback, [{ id: 'comment-decision', label: 'false-positive' }]);
  assert.equal(dom.window.document.querySelector('[slot="comment"]').style.display, '');
});

test('yorum filtresi ayardan bağımsız kapatılabilir', () => {
  const dom = new JSDOM(newCommentMarkup().replace(
    '<body>',
    '<body><shreddit-post post-id="post-stays-active" post-title="Yazılım bitti" subreddit-prefixed-name="r/CodingTR"></shreddit-post>',
  ), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  new PostFilter({ doc: dom.window.document, settings: { filterComments: false } })
    .processTree(dom.window.document);
  assert.equal(dom.window.document.querySelector('[slot="comment"]').style.display, '');
  assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
});

test('kalibrasyon modunda görünür yorum için geri bildirim sunar', () => {
  const dom = new JSDOM(newCommentMarkup({ body: 'Yeni oyun motoru projemi yayınladım.' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const feedback = [];
  new PostFilter({
    doc: dom.window.document,
    settings: { calibrationMode: true },
    onDecision: () => 'visible-comment',
    onFeedback: (id, label) => { feedback.push({ id, label }); return true; },
  }).processTree(dom.window.document);
  const button = dom.window.document.querySelector('.rdf-bar--comment-review button');
  assert.equal(button.textContent, 'Gizlenmeliydi');
  button.click();
  assert.deepEqual(feedback, [{ id: 'visible-comment', label: 'false-negative' }]);
  assert.equal(button.textContent, 'Kaydedildi');
});

test('r/TrGameDeveloper post ve yorumları varsayılan hedef kapsamındadır', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <shreddit-post post-id="trgame-post" post-title="Oyun sektörü bitti" subreddit-prefixed-name="r/TrGameDeveloper"></shreddit-post>
    <shreddit-comment thingid="trgame-comment" permalink="/r/TrGameDeveloper/comments/post/comment/example/">
      <details><div slot="comment">Oyun geliştirme bitti, bölüm değiştirin.</div><div slot="actionRow">Yanıtla</div></details>
    </shreddit-comment>
  </body></html>`, { url: 'https://www.reddit.com/r/TrGameDeveloper/comments/post/example/' });
  new PostFilter({ doc: dom.window.document }).processTree(dom.window.document);
  assert.equal(dom.window.document.querySelector('shreddit-post').style.display, 'none');
  assert.equal(dom.window.document.querySelector('[slot="comment"]').style.display, 'none');
});

test('kişisel göster ve gizle kuralları otomatik yorum kararının üzerine uygulanır', () => {
  const shown = new JSDOM(newCommentMarkup({ body: 'Yazılım bitti.' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  new PostFilter({
    doc: shown.window.document,
    matchPersonalRule: (content) => content.kind === 'comment'
      ? { id: 'show-comment', action: 'show', scope: 'comment', phrase: 'Yazılım bitti' }
      : null,
  }).processTree(shown.window.document);
  assert.equal(shown.window.document.querySelector('[slot="comment"]').style.display, '');

  const hidden = new JSDOM(newCommentMarkup({ body: 'Normal bir teknoloji yorumu.' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  new PostFilter({
    doc: hidden.window.document,
    matchPersonalRule: () => ({ id: 'hide-comment', action: 'hide', scope: 'comment', phrase: 'Normal bir teknoloji yorumu' }),
  }).processTree(hidden.window.document);
  assert.equal(hidden.window.document.querySelector('[slot="comment"]').style.display, 'none');
  assert.match(hidden.window.document.querySelector('.rdf-bar--comment').textContent, /kişisel daima gizle/);
});

test('yorum daima göster düğmesi comment kapsamlı kural ister ve yalnız yorumu geri açar', () => {
  const dom = new JSDOM(newCommentMarkup({ body: 'Yazılım bitti.' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const requests = [];
  new PostFilter({
    doc: dom.window.document,
    onCreatePersonalRule: (request) => { requests.push(request); return true; },
  }).processTree(dom.window.document);
  const button = [...dom.window.document.querySelectorAll('.rdf-bar--comment button')]
    .find((candidate) => candidate.textContent === 'Benzer yorumları daima göster');
  assert.ok(button);
  button.click();
  assert.equal(requests[0].scope, 'comment');
  assert.equal(requests[0].action, 'show');
  assert.equal(requests[0].suggestedPhrase, 'Yazılım bitti');
  assert.equal(dom.window.document.querySelector('[slot="comment"]').style.display, '');
  assert.equal(dom.window.document.querySelector('.rdf-bar--comment'), null);
});

test('kalibrasyondaki yorum daima gizle düğmesi comment kapsamlı kural ister', () => {
  const dom = new JSDOM(newCommentMarkup({ body: 'Normal yorum metni.' }), {
    url: 'https://www.reddit.com/r/CodingTR/comments/post/example/',
  });
  const requests = [];
  new PostFilter({
    doc: dom.window.document,
    settings: { calibrationMode: true },
    onDecision: () => 'shown-comment',
    onCreatePersonalRule: (request) => { requests.push(request); return true; },
  }).processTree(dom.window.document);
  const button = [...dom.window.document.querySelectorAll('.rdf-bar--comment-review button')]
    .find((candidate) => candidate.textContent === 'Benzer yorumları daima gizle');
  assert.ok(button);
  button.click();
  assert.equal(requests[0].scope, 'comment');
  assert.equal(requests[0].action, 'hide');
  assert.equal(requests[0].suggestedPhrase, 'Normal yorum metni.');
});
