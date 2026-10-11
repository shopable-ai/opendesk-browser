// Deliberately independent from the installed reading-toc tool. This is a
// page-local demo: read only real DOM headings and never modify page IDs/HTML.
const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
const SKIP_SELECTOR = [
  'nav', 'aside', 'footer', 'pre', 'code', 'template', '[hidden]', '[inert]',
  '[aria-hidden="true"]', '[role="navigation"]', '[contenteditable="true"]',
  '[data-opendesk-ui-owner]'
].join(',');
const MAX_HEADINGS = 160;

function primaryContentRoot(doc) {
  // Prefer one meaningful article; otherwise use the page's main content.
  // Unlike the official tool, this small demo does not implement AI-answer
  // source switching or website-specific adapters.
  let best = null;
  let bestCount = 0;
  const roots = doc.querySelectorAll('main,[role="main"],article');
  for (const root of roots) {
    if (!root.isConnected || root.closest?.('[data-opendesk-ui-owner]')) continue;
    const count = root.querySelectorAll(HEADING_SELECTOR).length;
    const preferred = root.matches?.('article') ? 0.25 : 0;
    if (count + preferred > bestCount) {
      best = root;
      bestCount = count + preferred;
    }
  }
  return best || doc.body || doc.documentElement;
}

function visibleHeading(heading, doc) {
  if (!heading.isConnected || heading.closest?.(SKIP_SELECTOR)) return false;
  if (!heading.getClientRects?.().length) return false;
  const style = doc.defaultView?.getComputedStyle?.(heading);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

// Pure model; separate from DOM lookup so it can be tested without a browser.
export function buildTocTree(rows) {
  const stack = [];
  return rows.map(row => {
    while (stack.length && stack[stack.length - 1].level >= row.level) stack.pop();
    const parent = stack[stack.length - 1];
    const item = {
      ...row,
      depth: stack.length,
      parentId: parent?.id || null,
      topId: parent?.topId || row.id
    };
    stack.push(item);
    return item;
  });
}

export function createTocScanner(doc) {
  const keys = new WeakMap();
  let serial = 0;
  return function scan() {
    const root = primaryContentRoot(doc);
    if (!root?.querySelectorAll) return [];
    const rows = [];
    for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
      if (rows.length >= MAX_HEADINGS) break;
      if (!visibleHeading(heading, doc)) continue;
      const label = (heading.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!label) continue;
      let id = keys.get(heading);
      if (!id) {
        id = 'toc-demo-' + (++serial);
        keys.set(heading, id);
      }
      rows.push({id, element: heading, label, level: Number(heading.tagName.slice(1))});
    }
    return buildTocTree(rows);
  };
}

export function sameToc(a, b) {
  return a.length === b.length && a.every((item, i) =>
    item.id === b[i].id && item.element === b[i].element &&
    item.label === b[i].label && item.level === b[i].level &&
    item.depth === b[i].depth && item.parentId === b[i].parentId &&
    item.topId === b[i].topId);
}

export function chooseActiveTocItem(items, top = 112) {
  let passed = null;
  let next = null;
  for (const item of items) {
    if (!item.element?.isConnected) continue;
    const rect = item.element.getBoundingClientRect?.();
    if (!rect) continue;
    if (rect.top <= top) passed = item;
    else if (!next) next = item;
  }
  return passed?.id || next?.id || items[0]?.id || '';
}

function nearestPresentedId(items, choices, activeId) {
  const indexed = new Map(items.map(item => [item.id, item]));
  let item = indexed.get(activeId);
  while (item && !choices.has(item.id)) item = indexed.get(item.parentId);
  return item?.id || '';
}

function aroundActive(items, activeId, limit = 12) {
  if (items.length <= limit) return items;
  const activeIndex = Math.max(0, items.findIndex(item => item.id === activeId));
  const start = Math.max(0, Math.min(activeIndex - 5, items.length - limit));
  const segment = items.slice(start, start + limit);
  // Always keep the actual top-level heading in the compact view.
  if (segment[0] !== items[0]) return [items[0], ...segment.slice(1)];
  return segment;
}

// Small demo of three official-style views, not the official overview algorithm.
export function selectTocItems(items, activeId, mode = 'focus') {
  if (mode === 'full' || !items.length) return items;
  const active = items.find(item => item.id === activeId) || items[0];
  if (mode === 'focus') {
    const group = items.filter(item => item.topId === active.topId);
    return aroundActive(group, active.id);
  }
  const roots = items.filter(item => item.depth === 0);
  let candidates = roots;
  for (let depth = 1; candidates.length < 5 && depth <= 3; depth++) {
    const expanded = items.filter(item => item.depth <= depth);
    if (expanded.length === candidates.length) break;
    candidates = expanded;
  }
  const ids = new Set(candidates.map(item => item.id));
  const represented = nearestPresentedId(items, ids, active.id);
  return aroundActive(candidates, represented);
}
