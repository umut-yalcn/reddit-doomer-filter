const NEW_POST_SELECTOR = 'shreddit-post';
const OLD_POST_SELECTOR = '#siteTable > .thing.link, .sitetable > .thing.link';

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
    id: isNew
      ? element.getAttribute('post-id') || element.getAttribute('id') || ''
      : element.getAttribute('data-fullname') || element.getAttribute('id') || '',
    subreddit,
    title: title.trim(),
    body: body.trim(),
    element,
  };
}
