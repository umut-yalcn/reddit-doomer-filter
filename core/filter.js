import {
  extractComment,
  extractPost,
  findCommentElements,
  findContainingCommentElement,
  findContainingPostElement,
  findPostElements,
} from './content-dom.js';
import { normalizeTurkish } from './normalize.js';
import { scorePost } from './scorer.js';

const STYLE_ID = 'rdf-style';
const STATE_ATTR = 'data-rdf-state';

export const DEFAULT_SETTINGS = {
  enabled: true,
  filterComments: true,
  personalOverridesEnabled: true,
  threshold: 4,
  protectQuestions: false,
  debug: false,
  calibrationMode: false,
  subreddits: ['codingtr', 'turkdev', 'engineeringtr', 'trgamedeveloper'],
};

function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rdf-bar {
      display: flex;
      align-items: center;
      gap: .6rem;
      margin: .35rem 0;
      padding: .55rem .75rem;
      border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
      border-radius: 8px;
      font: 500 12px/1.4 system-ui, sans-serif;
      opacity: .72;
    }
    .rdf-bar__reason { flex: 1; }
    .rdf-bar button {
      border: 1px solid currentColor;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      padding: .2rem .55rem;
      cursor: pointer;
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

function signature(content) {
  return normalizeTurkish(`${content.kind ?? 'post'}|${content.subreddit}|${content.title}|${content.body}`);
}

export class PostFilter {
  constructor({
    doc = document,
    settings = {},
    onDecision = null,
    onFeedback = null,
    matchPersonalRule = null,
    onCreatePersonalRule = null,
  } = {}) {
    this.doc = doc;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.settings.subreddits = [...(settings.subreddits ?? DEFAULT_SETTINGS.subreddits)].map((s) => s.toLowerCase());
    this.observer = null;
    this.pending = new Set();
    this.scheduled = false;
    this.signatures = new WeakMap();
    this.presentations = new WeakMap();
    this.onDecision = typeof onDecision === 'function' ? onDecision : null;
    this.onFeedback = typeof onFeedback === 'function' ? onFeedback : null;
    this.matchPersonalRule = typeof matchPersonalRule === 'function' ? matchPersonalRule : null;
    this.onCreatePersonalRule = typeof onCreatePersonalRule === 'function' ? onCreatePersonalRule : null;
  }

  start() {
    injectStyle(this.doc);
    this.processTree(this.doc);

    const Observer = this.doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    if (!Observer) return this;

    this.observer = new Observer((records) => {
      for (const record of records) {
        if (record.type === 'childList') {
          this.enqueueNode(record.target);
          for (const node of record.addedNodes) this.enqueueNode(node);
        } else {
          this.enqueueNode(record.target);
        }
      }
      if (this.pending.size > 0) this.schedule();
    });
    this.observer.observe(this.doc.body || this.doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'post-title',
        'post-id',
        'subreddit-prefixed-name',
        'subreddit-name',
        'data-subreddit',
        'data-fullname',
        'permalink',
        'thingid',
        'slot',
        'data-post-click-location',
        'id',
      ],
    });
    return this;
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
  }

  enqueueNode(node) {
    const comment = findContainingCommentElement(node);
    if (comment) {
      this.pending.add(comment);
      return;
    }
    const post = findContainingPostElement(node);
    if (post) {
      this.pending.add(post);
      return;
    }

    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (element && (findPostElements(element).length > 0 || findCommentElements(element).length > 0)) {
      this.pending.add(element);
    }
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    const win = this.doc.defaultView;
    const run = () => {
      this.scheduled = false;
      const roots = [...this.pending];
      this.pending.clear();
      for (const root of roots) {
        if (root.isConnected) this.processTree(root);
      }
    };
    if (typeof win?.requestIdleCallback === 'function') win.requestIdleCallback(run, { timeout: 250 });
    else (win?.setTimeout ?? setTimeout)(run, 40);
  }

  processTree(root) {
    if (!this.settings.enabled) return;
    injectStyle(this.doc);
    for (const element of findPostElements(root)) this.processPost(element);
    if (this.settings.filterComments) {
      for (const element of findCommentElements(root)) this.processComment(element);
    }
  }

  processPost(element) {
    try {
      const post = extractPost(element);
      if (!post.subreddit || !this.settings.subreddits.includes(post.subreddit)) {
        this.clearPresentation(element);
        this.signatures.delete(element);
        element.setAttribute(STATE_ATTR, 'shown');
        return;
      }

      const currentSignature = signature(post);
      if (this.signatures.get(element) === currentSignature) return;
      this.signatures.set(element, currentSignature);
      this.clearPresentation(element);

      const result = this.applyPersonalRule(post, scorePost(post, this.settings));
      const decisionId = this.emitDecision(post, result);
      element.setAttribute(STATE_ATTR, result.hidden ? 'hidden' : 'shown');
      if (result.hidden) this.hidePost(post, result, decisionId);
      else if (this.settings.calibrationMode && result.personalRule?.action !== 'show') {
        this.addShownFeedback(post, decisionId);
      }
    } catch (error) {
      // Fail-open: filtre hatası hiçbir içeriği görünmez yapmamalı.
      this.clearPresentation(element);
      element.setAttribute(STATE_ATTR, 'error');
      console.warn('[Reddit Karamsarlık Filtresi] Post değerlendirilemedi:', error);
    }
  }

  processComment(element) {
    try {
      const comment = extractComment(element);
      if (!comment.subreddit || !this.settings.subreddits.includes(comment.subreddit) || !comment.body) {
        this.clearPresentation(element);
        this.signatures.delete(element);
        element.setAttribute(STATE_ATTR, 'shown');
        return;
      }

      const currentSignature = signature(comment);
      if (this.signatures.get(element) === currentSignature) return;
      this.signatures.set(element, currentSignature);
      this.clearPresentation(element);

      const result = this.applyPersonalRule(comment, scorePost(comment, this.settings));
      const decisionId = this.emitDecision(comment, result);
      element.setAttribute(STATE_ATTR, result.hidden ? 'hidden' : 'shown');
      if (result.hidden) this.hideComment(comment, result, decisionId);
      else if (this.settings.calibrationMode && result.personalRule?.action !== 'show') {
        this.addShownCommentFeedback(comment, decisionId);
      }
    } catch (error) {
      // Fail-open: yorum filtresi hatası yorum veya alt yanıtlarını görünmez yapmamalı.
      this.clearPresentation(element);
      element.setAttribute(STATE_ATTR, 'error');
      console.warn('[Reddit Karamsarlık Filtresi] Yorum değerlendirilemedi:', error);
    }
  }

  emitDecision(post, result) {
    if (!this.onDecision) return null;
    try {
      return this.onDecision({
        kind: post.kind ?? 'post',
        id: post.id,
        subreddit: post.subreddit,
        title: post.title,
        body: post.body,
      }, result) ?? null;
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Karar günlüğe yazılamadı:', error);
      return null;
    }
  }

  applyPersonalRule(content, result) {
    if (!this.matchPersonalRule) return result;
    let rule = null;
    try {
      rule = this.matchPersonalRule(content);
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Kişisel kurallar okunamadı:', error);
      return result;
    }
    const expectedScope = content.kind === 'comment' ? 'comment' : 'post';
    if (
      !rule
      || !['show', 'hide'].includes(rule.action)
      || (rule.scope !== undefined && rule.scope !== expectedScope)
    ) return result;

    const hidden = rule.action === 'hide';
    const reason = hidden ? 'kişisel daima gizle kuralı' : 'kişisel daima göster kuralı';
    return {
      ...result,
      hidden,
      score: hidden ? Math.max(result.score, result.threshold) : result.score,
      source: 'personal',
      clause: rule.phrase || result.clause,
      reasons: [{ category: 'personal-rule', score: 0, reason }, ...result.reasons],
      personalRule: {
        id: String(rule.id ?? ''),
        action: rule.action,
        scope: content.kind === 'comment' ? 'comment' : 'post',
        phrase: String(rule.phrase ?? ''),
      },
    };
  }

  emitPersonalRule(action, content, result) {
    if (!this.onCreatePersonalRule) return false;
    const scope = content.kind === 'comment' ? 'comment' : 'post';
    const suggestedPhrase = String(result?.clause || content?.title || content?.body || '').trim().slice(0, 500);
    try {
      return this.onCreatePersonalRule({
        action,
        scope,
        suggestedPhrase,
        content: {
          kind: scope,
          id: content?.id,
          subreddit: content?.subreddit,
          title: content?.title,
          body: content?.body,
        },
        result,
      }) !== false;
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Kişisel kural kaydedilemedi:', error);
      return false;
    }
  }

  emitFeedback(decisionId, feedback) {
    if (!decisionId || !this.onFeedback) return false;
    try {
      return this.onFeedback(decisionId, feedback) !== false;
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Geri bildirim kaydedilemedi:', error);
      return false;
    }
  }

  clearPresentation(element) {
    const presentation = this.presentations.get(element);
    if (!presentation) return;
    if (presentation.kind === 'hidden-post') element.style.display = presentation.previousDisplay;
    for (const item of presentation.hiddenNodes ?? []) item.node.style.display = item.previousDisplay;
    presentation.bar.remove();
    this.presentations.delete(element);
  }

  hidePost(post, result, decisionId) {
    const { element } = post;
    const previousDisplay = element.style.display;
    element.style.display = 'none';

    const bar = this.doc.createElement('div');
    bar.className = 'rdf-bar';
    bar.setAttribute('data-rdf-for', post.id || 'unknown');

    const reason = this.doc.createElement('span');
    reason.className = 'rdf-bar__reason';
    const primaryReason = result.reasons[0]?.reason ?? 'eşik üstü içerik';
    reason.textContent = this.settings.debug
      ? `Karamsar içerik gizlendi · ${result.score} puan · ${primaryReason} · “${result.clause}”`
      : `Karamsar içerik gizlendi · ${primaryReason}`;

    const show = this.doc.createElement('button');
    show.type = 'button';
    show.textContent = 'Göster';
    const restore = () => {
      element.style.display = previousDisplay;
      element.setAttribute(STATE_ATTR, 'overridden');
      bar.remove();
      this.presentations.delete(element);
    };
    show.addEventListener('click', restore, { once: true });

    bar.append(reason, show);
    if (this.onCreatePersonalRule) {
      const alwaysShow = this.doc.createElement('button');
      alwaysShow.type = 'button';
      alwaysShow.textContent = 'Daima göster';
      alwaysShow.addEventListener('click', () => {
        if (!this.emitPersonalRule('show', post, result)) return;
        restore();
      }, { once: true });
      bar.append(alwaysShow);
    }
    if (decisionId && this.onFeedback) {
      const incorrect = this.doc.createElement('button');
      incorrect.type = 'button';
      incorrect.textContent = 'Yanlış gizlendi';
      incorrect.addEventListener('click', () => {
        if (!this.emitFeedback(decisionId, 'false-positive')) return;
        restore();
      }, { once: true });
      bar.append(incorrect);
    }
    element.parentNode?.insertBefore(bar, element);
    this.presentations.set(element, { kind: 'hidden-post', bar, previousDisplay });
  }

  hideComment(comment, result, decisionId) {
    const { element, contentElement } = comment;
    if (!contentElement?.parentNode) return;
    const nodes = [...new Set([contentElement, ...comment.actionElements].filter(Boolean))];
    const hiddenNodes = nodes.map((node) => ({ node, previousDisplay: node.style.display }));
    for (const { node } of hiddenNodes) node.style.display = 'none';

    const bar = this.doc.createElement('div');
    bar.className = 'rdf-bar rdf-bar--comment';
    bar.setAttribute('data-rdf-comment-for', comment.id || 'unknown');

    const reason = this.doc.createElement('span');
    reason.className = 'rdf-bar__reason';
    const primaryReason = result.reasons[0]?.reason ?? 'eşik üstü içerik';
    reason.textContent = this.settings.debug
      ? `Karamsar yorum gizlendi · ${result.score} puan · ${primaryReason} · “${result.clause}”`
      : `Karamsar yorum gizlendi · ${primaryReason}`;

    const restore = () => {
      for (const item of hiddenNodes) item.node.style.display = item.previousDisplay;
      element.setAttribute(STATE_ATTR, 'overridden');
      bar.remove();
      this.presentations.delete(element);
    };
    const show = this.doc.createElement('button');
    show.type = 'button';
    show.textContent = 'Göster';
    show.addEventListener('click', restore, { once: true });
    bar.append(reason, show);

    if (this.onCreatePersonalRule) {
      const alwaysShow = this.doc.createElement('button');
      alwaysShow.type = 'button';
      alwaysShow.textContent = 'Benzer yorumları daima göster';
      alwaysShow.addEventListener('click', () => {
        if (!this.emitPersonalRule('show', comment, result)) return;
        restore();
      }, { once: true });
      bar.append(alwaysShow);
    }

    if (decisionId && this.onFeedback) {
      const incorrect = this.doc.createElement('button');
      incorrect.type = 'button';
      incorrect.textContent = 'Yanlış gizlendi';
      incorrect.addEventListener('click', () => {
        if (!this.emitFeedback(decisionId, 'false-positive')) return;
        restore();
      }, { once: true });
      bar.append(incorrect);
    }

    contentElement.parentNode.insertBefore(bar, contentElement);
    this.presentations.set(element, { kind: 'hidden-comment', bar, hiddenNodes });
  }

  addShownCommentFeedback(comment, decisionId) {
    if (!decisionId || !comment.contentElement?.parentNode) return;
    const review = this.doc.createElement('div');
    review.className = 'rdf-bar rdf-bar--review rdf-bar--comment-review';
    review.setAttribute('data-rdf-comment-review-for', comment.id || decisionId);

    const label = this.doc.createElement('span');
    label.className = 'rdf-bar__reason';
    label.textContent = 'Kalibrasyon: Bu yorum görünür bırakıldı.';
    const missed = this.doc.createElement('button');
    missed.type = 'button';
    missed.textContent = 'Gizlenmeliydi';
    missed.addEventListener('click', () => {
      if (!this.emitFeedback(decisionId, 'false-negative')) return;
      missed.disabled = true;
      missed.textContent = 'Kaydedildi';
    }, { once: true });
    review.append(label, missed);
    if (this.onCreatePersonalRule) {
      const alwaysHide = this.doc.createElement('button');
      alwaysHide.type = 'button';
      alwaysHide.textContent = 'Benzer yorumları daima gizle';
      alwaysHide.addEventListener('click', () => {
        if (!this.emitPersonalRule('hide', comment, { clause: comment.body })) return;
        alwaysHide.disabled = true;
        alwaysHide.textContent = 'Kaydedildi';
      }, { once: true });
      review.append(alwaysHide);
    }
    comment.contentElement.parentNode.insertBefore(review, comment.contentElement.nextSibling);
    this.presentations.set(comment.element, { kind: 'review-comment', bar: review, hiddenNodes: [] });
  }

  addShownFeedback(post, decisionId) {
    if (!decisionId || !post.element.parentNode) return;
    const review = this.doc.createElement('div');
    review.className = 'rdf-bar rdf-bar--review';
    review.setAttribute('data-rdf-review-for', post.id || decisionId);

    const label = this.doc.createElement('span');
    label.className = 'rdf-bar__reason';
    label.textContent = 'Kalibrasyon: Bu post görünür bırakıldı.';

    const missed = this.doc.createElement('button');
    missed.type = 'button';
    missed.textContent = 'Gizlenmeliydi';
    missed.addEventListener('click', () => {
      if (!this.emitFeedback(decisionId, 'false-negative')) return;
      missed.disabled = true;
      missed.textContent = 'Kaydedildi';
    }, { once: true });

    review.append(label, missed);
    if (this.onCreatePersonalRule) {
      const alwaysHide = this.doc.createElement('button');
      alwaysHide.type = 'button';
      alwaysHide.textContent = 'Daima gizle';
      alwaysHide.addEventListener('click', () => {
        if (!this.emitPersonalRule('hide', post, { clause: post.title })) return;
        alwaysHide.disabled = true;
        alwaysHide.textContent = 'Kaydedildi';
      }, { once: true });
      review.append(alwaysHide);
    }
    post.element.parentNode.insertBefore(review, post.element.nextSibling);
    this.presentations.set(post.element, { kind: 'review', bar: review, previousDisplay: post.element.style.display });
  }
}
