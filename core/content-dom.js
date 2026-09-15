const NEW_POST_SELECTOR = 'shreddit-post';
const OLD_POST_SELECTOR = '#siteTable > .thing.link, .sitetable > .thing.link';
const POST_SELECTOR = `${NEW_POST_SELECTOR}, ${OLD_POST_SELECTOR}`;
const NEW_COMMENT_SELECTOR = 'shreddit-comment';
const OLD_COMMENT_SELECTOR = '.thing.comment';
const COMMENT_SELECTOR = `${NEW_COMMENT_SELECTOR}, ${OLD_COMMENT_SELECTOR}`;
const MAX_TITLE_LENGTH = 1000;
const MAX_POST_BODY_LENGTH = 50000;
const MAX_COMMENT_BODY_LENGTH = 20000;

function limitText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

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

export function normalizeRedditUsername(value) {
  let username = String(value ?? '').trim();
  const pathMatch = username.match(/(?:^|\/)\/?(?:u|user)\/([^/?#]+)/i);
  if (pathMatch?.[1]) {
    try {
      username = decodeURIComponent(pathMatch[1]);
    } catch {
      username = pathMatch[1];
    }
  }
  return username
    .replace(/^@/, '')
    .replace(/^\/?(?:u|user)\//i, '')
    .replace(/\/$/, '')
    .trim()
    .toLowerCase();
}

function usernameFromProfileLink(link) {
  return normalizeRedditUsername(link?.getAttribute?.('href'));
}

export function detectCurrentUsername(doc = document) {
  const attributeHosts = [
    doc.querySelector?.('shreddit-app'),
    doc.querySelector?.('reddit-header-large'),
    doc.querySelector?.('reddit-header-action-items'),
  ].filter(Boolean);
  const attributeNames = ['logged-in-user', 'username', 'user-name', 'account-name'];
  for (const host of attributeHosts) {
    for (const attribute of attributeNames) {
      const username = normalizeRedditUsername(host.getAttribute?.(attribute));
      if (username) return username;
    }
  }

  const oldRedditLink = doc.querySelector?.(
    '#header-bottom-right .user a[href*="/user/"], #header-bottom-right .user a[href*="/u/"]',
  );
  const oldRedditUsername = usernameFromProfileLink(oldRedditLink);
  if (oldRedditUsername) return oldRedditUsername;

  // Yalnız hesap başlığı içinde arar; içerik yazarlarının profil bağlantıları
  // oturumdaki kullanıcı sanılmamalıdır.
  const headerRoots = [
    doc.querySelector?.('reddit-header-large'),
    doc.querySelector?.('reddit-header-action-items'),
    doc.querySelector?.('header'),
    doc.querySelector?.('[role="banner"]'),
  ].filter(Boolean);
  for (const root of headerRoots) {
    const profileLink = root.querySelector?.(
      '[data-testid="user-dropdown"] a[href*="/user/"], '
      + '[data-testid="account-menu"] a[href*="/user/"], '
      + 'a[aria-label*="profil" i][href*="/user/"], '
      + 'a[aria-label*="profile" i][href*="/user/"]',
    );
    const username = usernameFromProfileLink(profileLink);
    if (username) return username;
  }
  return '';
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
    author: normalizeRedditUsername(
      isNew ? element.getAttribute('author') : element.getAttribute('data-author'),
    ),
    title: limitText(title, MAX_TITLE_LENGTH),
    body: limitText(body, MAX_POST_BODY_LENGTH),
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
    author: normalizeRedditUsername(
      isNew ? element.getAttribute('author') : element.getAttribute('data-author'),
    ),
    title: '',
    body: limitText(textElement?.textContent, MAX_COMMENT_BODY_LENGTH),
    element,
    contentElement,
    actionElements,
  };
}

export const contentDomTesting = {
  MAX_TITLE_LENGTH,
  MAX_POST_BODY_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  limitText,
};
