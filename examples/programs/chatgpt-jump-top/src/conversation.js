// Toolbar placement and non-sticky content starts are separate identities.
// Uncertain relationships fail closed; this adapter has no privileged APIs.
const TURN = '[data-testid^="conversation-turn-"],[data-content-search-unit-key],'
  + '[data-message-author-role],[data-message-role]';
const CONTENT = 'pre,textarea,[contenteditable="true"],'
  + '[data-message-author-role],[data-message-role]';
const NATIVE_EDITOR = 'button[aria-label="Open editor"]';
const OWN = 'data-opendesk-chatgpt-jump-top';
const EXCLUDED = 'aside,[role="dialog"],[aria-modal="true"],[hidden],[inert],[aria-hidden="true"]';
const GAP = 12;
const sessions = new WeakMap();

function rendered(element, win) {
  if (!element?.isConnected || element.closest?.(EXCLUDED)) return false;
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width < 1 || rect.height < 1) return false;
  const style = win.getComputedStyle(element);
  return style.display !== 'none' && !/^(hidden|collapse)$/.test(style.visibility);
}
function visible(element, win) {
  if (!rendered(element, win)) return false;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < win.innerHeight;
}
export function findConversationMain(doc, win) {
  const matching = [...doc.querySelectorAll('main,[role="main"]')]
    .filter(root => visible(root, win) && root.querySelector(TURN));
  const outer = matching.filter(root =>
    !matching.some(other => other !== root && other.contains(root)));
  return outer.length === 1 ? outer[0] : null;
}
export function chooseConversationHeader(doc, win, main) {
  if (!main) return null;
  const region = main.getBoundingClientRect();
  const upperLimit = Math.min(180, Math.max(100, win.innerHeight * 0.28));
  const candidates = [...doc.querySelectorAll('header')].filter(header => {
    if (!visible(header, win) || header.closest(TURN)) return false;
    const rect = header.getBoundingClientRect();
    return rect.top >= -8 && rect.top < upperLimit
      && rect.left < region.right && rect.right > region.left;
  });
  const scoped = candidates.filter(header => main.contains(header));
  const pool = scoped.length ? scoped : candidates;
  const editors = pool.filter(header => header.querySelector(NATIVE_EDITOR));
  if (editors.length) return editors.length === 1 ? editors[0] : null;
  pool.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  return pool.length === 1 || (pool.length > 1 && pool[0].getBoundingClientRect().width
    > pool[1].getBoundingClientRect().width * 1.2) ? pool[0] : null;
}
export function findHeaderAction(header, win) {
  if (!header) return null;
  const actions = [...header.querySelectorAll('button')]
    .filter(button => rendered(button, win) && !button.closest(`[${OWN}]`));
  const editors = actions.filter(button => button.matches(NATIVE_EDITOR));
  if (editors.length) return editors.length === 1 ? editors[0] : null;
  return actions.at(-1) || null;
}
export function findConversationScroller(target, doc, win, {includeSelf = false} = {}) {
  for (let node = includeSelf ? target : target?.parentElement; node; node = node.parentElement) {
    if (node === doc.body || node === doc.documentElement) break;
    // Even an empty inner scrollport is a boundary, never an excuse to move
    // an unrelated outer region.
    if (/^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowY)) {
      // overflow-x:auto also computes overflow-y:auto on unconstrained code
      // blocks. Their entire height scrolls with the parent document.
      if (node === target && node.scrollHeight <= node.clientHeight + 1) continue;
      return node;
    }
  }
  const root = doc.scrollingElement || doc.documentElement;
  return root && root.scrollHeight > root.clientHeight + 1 ? root : null;
}
function viewport(scroller, doc, win) {
  if (scroller === doc.scrollingElement || scroller === doc.documentElement) {
    return {top: 0, left: 0, right: win.innerWidth, height: win.innerHeight};
  }
  const rect = scroller.getBoundingClientRect();
  return {top: rect.top + (scroller.clientTop || 0), left: rect.left,
    right: rect.right, height: scroller.clientHeight};
}
function obstruction(binding, scroller, doc, win, port) {
  const obstacles = new Set(doc.querySelectorAll('header'));
  for (let node = binding.header; node && node !== doc.body; node = node.parentElement) obstacles.add(node);
  const intervals = [];
  const targetRect = binding.target.getBoundingClientRect();
  const left = Math.max(port.left, targetRect.left);
  const right = Math.min(port.right, targetRect.right);
  const targetStyle = win.getComputedStyle(binding.target);
  const lineHeight = parseFloat(targetStyle.lineHeight) || parseFloat(targetStyle.fontSize) * 1.2 || 20;
  for (const node of obstacles) {
    if (node === binding.target || binding.target.contains?.(node) || !rendered(node, win)) continue;
    const style = win.getComputedStyle(node);
    if (!/^(sticky|fixed)$/.test(style.position)) continue;
    if (style.position === 'sticky' && node.closest(TURN)
        && node !== binding.header && !node.contains(binding.header)) continue;
    const rect = node.getBoundingClientRect();
    if (left >= right || rect.right <= left || rect.left >= right) continue;
    // Read real rectangles, including a bar inset slightly below the port top.
    // A bar in a parallel column or a later unpinned section is not coverage.
    intervals.push({top: rect.top, bottom: rect.bottom});
  }
  intervals.sort((a, b) => a.top - b.top);
  let edge = port.top + GAP;
  for (const interval of intervals) {
    if (interval.top < edge + lineHeight && interval.bottom > edge - GAP) {
      edge = Math.max(edge, interval.bottom + GAP);
    }
  }
  return edge - port.top - GAP;
}
export function jumpRegionTop(binding, doc, win) {
  const {target, header, main, kind} = binding || {};
  if (!target?.isConnected || !main?.isConnected || !main.contains(target)
      || (header && !header.isConnected)) return false;
  if (/^(sticky|fixed)$/.test(win.getComputedStyle(target).position)) return false;
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || (kind === 'editor' && scroller !== target)) return false;
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (!(max > 1)) return false;
  let top = 0;
  if (scroller !== target) {
    const port = viewport(scroller, doc, win);
    top = target.getBoundingClientRect().top - port.top + scroller.scrollTop - GAP;
  }
  top = Math.max(0, Math.min(max, top));
  if (!Number.isFinite(top)) return false;
  const scroll = value => {
    const options = {top: value, left: scroller.scrollLeft || 0, behavior: 'instant'};
    if (scroller === doc.scrollingElement && typeof win.scrollTo === 'function') win.scrollTo(options);
    else if (typeof scroller.scrollTo === 'function') scroller.scrollTo(options);
    else scroller.scrollTop = value;
  };
  scroll(top);
  if (scroller !== target) {
    // Establish a canonical landing before reading sticky geometry. This also
    // discards a later header that was pinned at the old reading position.
    // Make at most one synchronous correction; never animate or chase it.
    const port = viewport(scroller, doc, win);
    const cover = obstruction(binding, scroller, doc, win, port);
    if (cover + GAP >= port.height) return false;
    const missing = port.top + cover + GAP - target.getBoundingClientRect().top;
    if (missing > 1) {
      scroll(Math.max(0, Math.min(max, scroller.scrollTop - missing)));
    }
  }
  return true;
}
export function jumpConversationTop(main, doc, win) {
  return jumpRegionTop({target: main?.querySelector(TURN), main, kind: 'conversation'}, doc, win);
}
function localTarget(header, anchor, main, idIndex, win) {
  const controls = anchor.getAttribute('aria-controls');
  if (controls) {
    const ids = controls.trim().split(/\s+/);
    if (ids.length !== 1) return null;
    const targets = idIndex.get(ids[0]) || [];
    return targets.length === 1 && main.contains(targets[0]) && !targets[0].contains(header)
      && rendered(targets[0], win) ? targets[0] : null;
  }
  const turn = header.closest(TURN);
  for (let scope = header.parentElement; scope && scope !== main; scope = scope.parentElement) {
    const contents = [...scope.querySelectorAll(CONTENT)].filter(node =>
      !node.contains(header) && !header.contains(node) && !node.closest('header') && rendered(node, win));
    const outer = contents.filter(node => !contents.some(other => other !== node && other.contains(node)));
    if (outer.length === 1 && scope.querySelectorAll('header').length === 1) return outer[0];
    if (scope === turn || scope.matches('article,section,form')) break;
  }
  return null;
}
function isLong(target, doc, win) {
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return false;
  const height = Math.max(target.getBoundingClientRect().height, target.scrollHeight || 0);
  return height > Math.max(240, Math.min(win.innerHeight, scroller.clientHeight) * 0.65);
}
export function findRegionBindings(doc, win) {
  const main = findConversationMain(doc, win);
  if (!main) return [];
  const bindings = [];
  const used = new Set();
  const headers = [...main.querySelectorAll('header')];
  const idIndex = new Map();
  if (headers.some(header => header.querySelector('button[aria-controls]'))) {
    for (const node of doc.querySelectorAll('[id]')) {
      const matches = idIndex.get(node.id) || [];
      matches.push(node);
      idIndex.set(node.id, matches);
    }
  }
  for (const header of headers) {
    if (!rendered(header, win)) continue;
    const anchor = findHeaderAction(header, win);
    if (!anchor) continue;
    const target = localTarget(header, anchor, main, idIndex, win);
    if (!target || used.has(target) || !isLong(target, doc, win)) continue;
    const kind = target.matches('textarea,[contenteditable="true"]') ? 'editor' : 'region';
    if (kind === 'editor' && findConversationScroller(target, doc, win, {includeSelf: true}) !== target) continue;
    used.add(target);
    bindings.push({header, anchor, target, main, kind});
  }
  const header = chooseConversationHeader(doc, win, main);
  // An unresolved Open editor does not prove a global conversation relation.
  if (header && !header.querySelector(NATIVE_EDITOR) && !bindings.some(item => item.header === header)) {
    const target = main.querySelector(TURN);
    const scroller = findConversationScroller(target, doc, win);
    const anchor = findHeaderAction(header, win);
    if (anchor && scroller && scroller.scrollHeight - scroller.clientHeight > scroller.clientHeight) {
      bindings.push({header, anchor, target, main, kind: 'conversation'});
    }
  }
  return bindings;
}
function newButton(doc, kind) {
  const host = doc.createElement('span');
  host.setAttribute(OWN, 'host');
  host.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;vertical-align:middle;color:inherit;';
  const shadow = host.attachShadow({mode: 'open'});
  const style = doc.createElement('style');
  style.textContent = `button{width:34px;height:34px;display:inline-flex;
    align-items:center;justify-content:center;cursor:pointer;border:0;
    border-radius:10px;background:transparent;color:inherit;padding:0;
    font:inherit;line-height:1}
    button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}
    button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;
    stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}`;
  const button = doc.createElement('button');
  button.type = 'button';
  const label = kind === 'conversation' ? '回到对话开头' : '回到此内容开头';
  button.setAttribute('aria-label', label);
  button.title = label;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 4h14M12 20V8m-6 6 6-6 6 6');
  svg.append(path);
  button.append(svg);
  shadow.append(style, button);
  return {host, button};
}
export function installJumpToTop({doc, win, owner}) {
  sessions.get(doc)?.dispose();
  const mounted = new Map();
  const cleanups = [];
  let pending = false;
  let disposed = false;
  function remove(header) {
    const item = mounted.get(header);
    item?.unlisten();
    item?.host.remove();
    mounted.delete(header);
  }
  function refresh() {
    pending = false;
    if (disposed) return;
    const bindings = findRegionBindings(doc, win);
    for (const header of mounted.keys()) {
      if (!bindings.some(binding => binding.header === header)) remove(header);
    }
    for (const binding of bindings) {
      const old = mounted.get(binding.header);
      if (old?.host.isConnected && old.anchor === binding.anchor && old.target === binding.target
          && old.host.nextElementSibling === binding.anchor) continue;
      remove(binding.header);
      const item = newButton(doc, binding.kind);
      const unlisten = owner.on(item.button, 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        const current = findRegionBindings(doc, win).find(next => next.header === binding.header
          && next.anchor === binding.anchor && next.target === binding.target);
        if (current) jumpRegionTop(current, doc, win);
        else schedule();
      });
      binding.anchor.before(item.host);
      mounted.set(binding.header, {...item, ...binding, unlisten});
    }
  }
  function schedule() {
    if (disposed || pending) return;
    pending = true;
    owner.setTimeout(refresh, 120);
  }
  const observer = owner.observe(doc.documentElement, records => {
    const relevant = records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(`[${OWN}]`)) return false;
      const inRegion = target?.closest('main,[role="main"],header');
      if (record.type !== 'childList') return Boolean(inRegion);
      if ([...record.removedNodes].some(node => node.hasAttribute?.(OWN)
          && [...mounted.values()].some(item => item.host === node && !node.isConnected))) return true;
      const changed = [...record.addedNodes, ...record.removedNodes].filter(node => !node.hasAttribute?.(OWN));
      return changed.length > 0 && (inRegion || changed.some(node => node.nodeType === 1
        && (node.matches('main,[role="main"],header') || node.querySelector('main,[role="main"],header'))));
    });
    if (relevant) schedule();
  }, {subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-controls', 'id', 'class', 'style']});
  cleanups.push(() => observer.disconnect());
  for (const type of ['popstate', 'hashchange', 'pageshow', 'resize']) cleanups.push(owner.on(win, type, schedule));
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const header of mounted.keys()) remove(header);
    cleanups.forEach(cleanup => cleanup());
    if (sessions.get(doc)?.dispose === dispose) sessions.delete(doc);
  }
  owner.onDispose(dispose);
  const session = {refresh, dispose, isMounted: () => [...mounted.values()].some(item => item.host.isConnected)};
  sessions.set(doc, session);
  refresh();
  return session;
}
