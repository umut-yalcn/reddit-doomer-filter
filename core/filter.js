import { extractPost, findContainingPostElement, findPostElements } from './content-dom.js';
import { normalizeTurkish } from './normalize.js';
import { scorePost } from './scorer.js';

const STYLE_ID = 'rdf-style';
const STATE_ATTR = 'data-rdf-state';

export const DEFAULT_SETTINGS = {
  enabled: true,
  threshold: 4,
  protectQuestions: false,
  debug: false,
  calibrationMode: false,
  personalOverridesEnabled: true,
  subreddits: ['codingtr', 'turkdev', 'engineeringtr'],
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

function signature(post) {
  return normalizeTurkish(`${post.subreddit}|${post.title}|${post.body}`);
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
    const post = findContainingPostElement(node);
    if (post) {
      this.pending.add(post);
      return;
    }

    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (element && findPostElements(element).length > 0) this.pending.add(element);
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
  }

  processPost(element) {
    try {
      const post = extractPost(element);
      if (!post.subreddit || !this.settings.subreddits.includes(post.subreddit)) return;

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
      element.setAttribute(STATE_ATTR, 'error');
      console.warn('[Reddit Karamsarlık Filtresi] Post değerlendirilemedi:', error);
    }
  }

  applyPersonalRule(post, result) {
    if (!this.matchPersonalRule) return result;
    let rule = null;
    try {
      rule = this.matchPersonalRule(post);
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Kişisel kurallar okunamadı:', error);
      return result;
    }
    if (!rule || !['show', 'hide'].includes(rule.action)) return result;

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
        phrase: String(rule.phrase ?? ''),
      },
    };
  }

  emitDecision(post, result) {
    if (!this.onDecision) return null;
    try {
      return this.onDecision({
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

  emitFeedback(decisionId, feedback) {
    if (!decisionId || !this.onFeedback) return false;
    try {
      return this.onFeedback(decisionId, feedback) !== false;
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Geri bildirim kaydedilemedi:', error);
      return false;
    }
  }

  emitPersonalRule(action, post, result) {
    if (!this.onCreatePersonalRule) return false;
    const suggestedPhrase = String(result?.clause || post?.title || '').trim();
    try {
      return this.onCreatePersonalRule({
        action,
        suggestedPhrase,
        post: {
          id: post?.id,
          subreddit: post?.subreddit,
          title: post?.title,
          body: post?.body,
        },
        result,
      }) !== false;
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Kişisel kural kaydedilemedi:', error);
      return false;
    }
  }

  clearPresentation(element) {
    const presentation = this.presentations.get(element);
    if (!presentation) return;
    if (presentation.kind === 'hidden') element.style.display = presentation.previousDisplay;
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
    show.addEventListener('click', () => {
      element.style.display = previousDisplay;
      element.setAttribute(STATE_ATTR, 'overridden');
      bar.remove();
    }, { once: true });

    bar.append(reason, show);
    if (this.onCreatePersonalRule) {
      const alwaysShow = this.doc.createElement('button');
      alwaysShow.type = 'button';
      alwaysShow.textContent = 'Daima göster';
      alwaysShow.addEventListener('click', () => {
        if (!this.emitPersonalRule('show', post, result)) return;
        alwaysShow.disabled = true;
        alwaysShow.textContent = 'Kaydedildi';
      }, { once: true });
      bar.append(alwaysShow);
    }
    if (decisionId && this.onFeedback) {
      const incorrect = this.doc.createElement('button');
      incorrect.type = 'button';
      incorrect.textContent = 'Yanlış gizlendi';
      incorrect.addEventListener('click', () => {
        if (!this.emitFeedback(decisionId, 'false-positive')) return;
        element.style.display = previousDisplay;
        element.setAttribute(STATE_ATTR, 'overridden');
        bar.remove();
      }, { once: true });
      bar.append(incorrect);
    }
    element.parentNode?.insertBefore(bar, element);
    this.presentations.set(element, { kind: 'hidden', bar, previousDisplay });
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
