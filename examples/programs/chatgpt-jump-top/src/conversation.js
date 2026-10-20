// ChatGPT DOM-only adapter: toolbar position is deliberately conservative.
// "Open editor" is a semantic hint, never a required or globally unique id.
// Current site markup must still be checked in a logged-in Chrome release.
const TURN = '[data-testid^="conversation-turn-"],[data-content-search-unit-key],'
  + '[data-message-author-role],[data-message-role]';
const NATIVE_EDITOR = 'button[aria-label="Open editor"]';
const OWN = 'data-opendesk-chatgpt-jump-top';

function visible(element, win) {
  if (!element?.isConnected || element.closest?.('[hidden],[inert],[aria-hidden="true"]')) {
    return false;
  }
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width < 1 || rect.height < 1 || rect.bottom <= 0
      || rect.top >= win.innerHeight) return false;
  const style = win.getComputedStyle?.(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden'
    && style.visibility !== 'collapse');
}

export function findConversationMain(doc, win) {
  const matching = [...doc.querySelectorAll('main,[role="main"]')]
    .filter(root => visible(root, win) && root.querySelector(TURN));
  // Nested main elements represent one region, not two conversations.
  const outer = matching.filter(root =>
    !matching.some(other => other !== root && other.contains(root)));
  return outer.length === 1 ? outer[0] : null;
}

export function chooseConversationHeader(doc, win, main) {
  if (!main) return null;
  const region = main.getBoundingClientRect();
  const upperLimit = Math.min(180, Math.max(100, win.innerHeight * 0.28));
  const candidates = [...doc.querySelectorAll('header')].filter(header => {
    if (!visible(header, win) ||
        header.closest('aside,[role="dialog"],[aria-modal="true"]') ||
        header.closest(TURN)) return false;
    const rect = header.getBoundingClientRect();
    return rect.top >= -8 && rect.top < upperLimit
      && rect.left < region.right && rect.right > region.left;
  });
  if (!candidates.length) return null;
  const scoped = candidates.filter(header => main.contains(header));
  const pool = scoped.length ? scoped : candidates;
  // Prefer the specific UI shown by the user, but never choose between two
  // indistinguishable editor headers (e.g. multiple visible panes).
  const withEditor = pool.filter(header =>
    [...header.querySelectorAll(NATIVE_EDITOR)].some(button => visible(button, win)));
  if (withEditor.length === 1) return withEditor[0];
  if (withEditor.length > 1) return null;
  pool.sort((a, b) =>
    b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  if (pool.length === 1) return pool[0];
  return pool[0].getBoundingClientRect().width >
    pool[1].getBoundingClientRect().width * 1.2 ? pool[0] : null;
}

export function findHeaderAction(header, win) {
  if (!header) return null;
  const editor = [...header.querySelectorAll(NATIVE_EDITOR)]
    .filter(button => visible(button, win));
  if (editor.length > 1) return null;
  if (editor.length === 1) return editor[0];
  // Other ChatGPT versions have no "Open editor": place beside the last
  // visible action of the verified conversation header, not at page bottom.
  const actions = [...header.querySelectorAll('button')].filter(button =>
    visible(button, win) && !button.hasAttribute(OWN));
  actions.sort((a, b) =>
    b.getBoundingClientRect().right - a.getBoundingClientRect().right);
  return actions[0] || null;
}

export function findConversationScroller(firstTurn, doc, win) {
  for (let node = firstTurn?.parentElement; node; node = node.parentElement) {
    if (node === doc.body || node === doc.documentElement) break;
    if (node.scrollHeight <= node.clientHeight + 8) continue;
    const overflow = win.getComputedStyle?.(node)?.overflowY || '';
    if (/^(auto|scroll|overlay)$/.test(overflow) || node.scrollTop > 12) {
      return node;
    }
  }
  const root = doc.scrollingElement || doc.documentElement;
  return root && root.scrollHeight > root.clientHeight + 8 ? root : null;
}

export function jumpConversationTop(main, doc, win) {
  const turn = main?.querySelector(TURN);
  if (!turn) return false;
  const scroller = findConversationScroller(turn, doc, win);
  if (!scroller) return false;
  // Instant, not smooth: very long threads should return to the first turn
  // immediately and never scroll a nested code editor or the left sidebar.
  if (scroller === doc.scrollingElement && typeof win.scrollTo === 'function') {
    win.scrollTo({top: 0, behavior: 'instant'});
  } else if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({top: 0, behavior: 'instant'});
  } else {
    scroller.scrollTop = 0;
  }
  return true;
}

function newButton(doc) {
  const host = doc.createElement('span');
  host.setAttribute(OWN, 'host');
  host.style.cssText = 'display:inline-flex;align-items:center;'
    + 'flex:0 0 auto;vertical-align:middle;';
  const shadow = host.attachShadow({mode: 'open'});
  const style = doc.createElement('style');
  style.textContent = `button{width:34px;height:34px;display:inline-flex;
    align-items:center;justify-content:center;cursor:pointer;border:0;
    border-radius:10px;background:transparent;color:inherit;padding:0;
    font:inherit;line-height:1;transition:background-color .12s}
    button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}
    button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;
    stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}`;
  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', '回到对话顶部');
  button.title = '回到对话顶部';
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
  let mounted = null;
  let pending = false;
  function clear() {
    mounted?.unlisten?.();
    mounted?.host.remove();
    mounted = null;
  }
  function refresh() {
    pending = false;
    const main = findConversationMain(doc, win);
    const header = chooseConversationHeader(doc, win, main);
    const anchor = findHeaderAction(header, win);
    if (!anchor) {clear(); return;}
    if (mounted?.host.isConnected && mounted.anchor === anchor
        && mounted.host.nextElementSibling === anchor) return;
    clear();
    const item = newButton(doc);
    const unlisten = owner.on(item.button, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      const currentMain = findConversationMain(doc, win);
      jumpConversationTop(currentMain, doc, win);
    });
    anchor.before(item.host);
    mounted = {...item, anchor, unlisten};
  }
  function schedule() {
    if (pending) return;
    pending = true;
    owner.setTimeout(refresh, 120);
  }
  owner.observe(doc.documentElement, schedule, {subtree: true, childList: true});
  owner.on(win, 'popstate', schedule);
  owner.on(win, 'hashchange', schedule);
  owner.on(win, 'pageshow', schedule);
  owner.onDispose(clear);
  refresh();
  return {refresh, isMounted: () => Boolean(mounted?.host.isConnected)};
}
