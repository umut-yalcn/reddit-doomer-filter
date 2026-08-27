const NEW_POST_SELECTOR = 'shreddit-post';
const OLD_POST_SELECTOR = '#siteTable > .thing.link, .sitetable > .thing.link';
const POST_SELECTOR = `${NEW_POST_SELECTOR}, ${OLD_POST_SELECTOR}`;
const NEW_COMMENT_SELECTOR = 'shreddit-comment';
const OLD_COMMENT_SELECTOR = '.thing.comment';
const COMMENT_SELECTOR = `${NEW_COMMENT_SELECTOR}, ${OLD_COMMENT_SELECTOR}`;

function includeSelfAndDescendants(root, selector) {
  const found = [];
  if (root?.nodeType === 1 && root.matches?.(selector)) found.push(root);
  found.push(...(root?.querySelectorAll?.(selector) ?? []));
  return found;
}

export function findPostElements(root = document) {
  return [
    ...includeSelfAndDescendants(root, NEW_POST_SELECTOR),
    ...includeSelfAndDescendants(root, OLD_POST_SELECTOR),
  ];
}

export function findContainingPostElement(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.(POST_SELECTOR) ?? null;
}

export function findCommentElements(root = document) {
  return includeSelfAndDescendants(root, COMMENT_SELECTOR);
}

export function findContainingCommentElement(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.(COMMENT_SELECTOR) ?? null;
}

function firstText(el, selectors) {
  for (const selector of selectors) {
    const node = el.querySelector?.(selector);
    const text = node?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function normalizeSubreddit(value) {
  return String(value ?? '').trim().replace(/^\/?r\//i, '').toLowerCase();
}

function subredditFromPath(value) {
  const match = String(value ?? '').match(/(?:^|\/)r\/([^/]+)/i);
  return normalizeSubreddit(match?.[1]);
}

function firstOwnedDescendant(element, selector, ownerSelector) {
  return [...(element.querySelectorAll?.(selector) ?? [])]
    .find((candidate) => candidate.closest?.(ownerSelector) === element) ?? null;
}

export function extractPost(element) {
  const isNew = element.matches?.(NEW_POST_SELECTOR);

  const title = isNew
    ? element.getAttribute('post-title') || firstText(element, ['[slot="title"]', 'h1', 'h2', 'a[slot="title"]'])
    : firstText(element, ['p.title a.title', 'a.title']);

  const body = isNew
    ? firstText(element, [
        '[slot="text-body"]',
        '[data-post-click-location="text-body"]',
        'div[id$="-post-rtjson-content"]',
      ])
    : firstText(element, ['.expando .md', '.usertext-body .md']);

  const subreddit = normalizeSubreddit(
    isNew
      ? element.getAttribute('subreddit-prefixed-name') || element.getAttribute('subreddit-name')
      : element.getAttribute('data-subreddit'),
  );

  return {
    kind: 'post',
    id: isNew
      ? element.getAttribute('post-id') || element.getAttribute('id') || ''
      : element.getAttribute('data-fullname') || element.getAttribute('id') || '',
    subreddit,
    title: title.trim(),
    body: body.trim(),
    element,
  };
}

export function extractComment(element) {
  const isNew = element.matches?.(NEW_COMMENT_SELECTOR);
  const contentElement = isNew
    ? firstOwnedDescendant(element, '[slot="comment"]', NEW_COMMENT_SELECTOR)
    : element.querySelector?.(':scope > .entry .usertext-body');
  const textElement = isNew
    ? contentElement
    : contentElement?.querySelector?.('.md') ?? contentElement;
  const actionElements = isNew
    ? [...element.querySelectorAll?.('[slot="actionRow"]') ?? []]
      .filter((candidate) => candidate.closest?.(NEW_COMMENT_SELECTOR) === element)
    : [...element.querySelectorAll?.(':scope > .entry .flat-list.buttons') ?? []];
  const permalink = isNew ? element.getAttribute('permalink') : '';
  const subreddit = normalizeSubreddit(
    element.getAttribute('subreddit-prefixed-name')
      || element.getAttribute('subreddit-name')
      || element.getAttribute('data-subreddit'),
  ) || subredditFromPath(permalink) || subredditFromPath(element.ownerDocument?.location?.pathname);

  return {
    kind: 'comment',
    id: isNew
      ? element.getAttribute('thingid') || element.getAttribute('id') || ''
      : element.getAttribute('data-fullname') || element.getAttribute('id') || '',
    subreddit,
    title: '',
    body: textElement?.textContent?.trim() ?? '',
    element,
    contentElement,
    actionElements,
  };
}
