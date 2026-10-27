// Toolbar placement and non-sticky content starts are separate identities.
// Uncertain relationships fail closed; this adapter has no privileged APIs.
const TURN = '[data-testid^="conversation-turn-"],[data-content-search-unit-key],'
  + '[data-message-author-role],[data-message-role]';
const CONTENT = 'pre,textarea,[contenteditable="true"],'
  + '[data-message-author-role],[data-message-role]';
const NATIVE_EDITOR = 'button[aria-label="Open editor"],button[aria-label="打开编辑器"]';
const VIEWER_CLOSE = 'button[aria-label="Close viewer"],button[aria-label="关闭查看器"]';
const SEARCH_TURN = '[data-content-search-unit-key]';
const ASSISTANT_TURN = '[data-content-search-unit-key][data-chatgpt-search-unit-key],'
  + '[data-content-search-unit-key$=":assistant"]';
// Preserve the legacy token for currently installed Mind Map / older Page versions.
const OWN = 'data-opendesk-chatgpt-jump-top';
const MODERN_OWN = 'data-opendesk-ai-scroll-navigation';
const LEGACY_LIFECYCLE = '[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-jump-top.lifecycle"]';
const ANSWER_TOOLS = 'data-opendesk-chatgpt-answer-tools';
const MINDMAP_VIEWER = '[data-opendesk-chatgpt-mindmap="viewer"]';
const EXCLUDED = '[role="dialog"],[aria-modal="true"],[hidden],[inert],[aria-hidden="true"]';
const GAP = 12;
const sessions = new WeakMap(); // doc -> per-owner sessions (Program and trusted tool may coexist)

// A hidden pre-rename lifecycle is not a navigator. Yield only to a live
// legacy ShadowRoot containing a real navigation button. Inert DOM markers,
// empty hosts and React clones must not permanently suppress new Scroll UI.
// This arbitration never transfers, disables or deletes the old installation.
// A hidden legacy ShadowRoot is not an active navigator, even when its DOM
// marker/button survives a previous installation or a stopped lifecycle.
export function legacyNavigationPresent(doc,win=doc.defaultView) {
  return [...doc.querySelectorAll(`[${OWN}]`)].some(node => {
    if(!node.isConnected||node.hasAttribute(MODERN_OWN)||node.closest?.(EXCLUDED))return false;
    const button=node.shadowRoot?.querySelector('button');
    if(!button)return false;
    return [node,button].every(target=>{
      const rect=target.getBoundingClientRect?.();
      const style=win?.getComputedStyle?.(target)||target.style;
      return rect&&rect.width>1&&rect.height>1&&style&&
        style.display!=='none'&&!['hidden','collapse'].includes(style.visibility);
    });
  });
}

function isWritingViewer(element, aside, win) {
  const section = element.closest('section');
  if (!section || !aside.contains(section)) return false;
  const headers = [...section.querySelectorAll('header')];
  const editors = [...section.querySelectorAll('textarea,[contenteditable="true"]')];
  if (headers.length !== 1 || headers[0].parentElement !== section ||
      headers[0].querySelectorAll(VIEWER_CLOSE).length !== 1 || editors.length !== 1 ||
      headers[0].contains(editors[0])) return false;
  // A viewer must have its own scrollport inside the aside. Navigation and
  // ambiguous sidebars remain excluded, even if the outer conversation scrolls.
  for (let node = editors[0]; node && aside.contains(node); node = node.parentElement) {
    if (!/^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowY)) continue;
    if (node === editors[0] && node.scrollHeight <= node.clientHeight + 1) continue;
    return node.scrollHeight > node.clientHeight + 1;
  }
  return false;
}

function rendered(element, win) {
  if (!element?.isConnected || element.closest?.(EXCLUDED)) return false;
  const aside = element.closest?.('aside');
  if (aside && !isWritingViewer(element, aside, win)) return false;
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
    if (!visible(header, win) || header.closest(TURN) || header.closest('aside')) return false;
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
  // Keep an identified transcript's edge controls disabled even when the
  // document has no scroll range. Scroll actions still check their own max.
  return root || null;
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

// Reuse the same bounded scrollport resolution for both directions. Never
// allow a nested code block/editor to replace the conversation scrollport.
function scrollPort(scroller, doc, win, top) {
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (!(max > 1) || !Number.isFinite(top)) return false;
  const options = {top: Math.max(0, Math.min(max, top)),
    left: scroller.scrollLeft || 0, behavior: 'instant'};
  if (scroller === doc.scrollingElement && typeof win.scrollTo === 'function') win.scrollTo(options);
  else if (typeof scroller.scrollTo === 'function') scroller.scrollTo(options);
  else scroller.scrollTop = options.top;
  return true;
}
export function jumpRegionEnd(binding, doc, win) {
  const {target, main, header, kind} = binding || {};
  if (!target?.isConnected || !main?.isConnected || !main.contains(target) ||
      (header && !header.isConnected) ||
      /^(sticky|fixed)$/.test(win.getComputedStyle(target).position)) return false;
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || (kind === 'editor' && scroller !== target)) return false;
  if (scroller === target) return scrollPort(scroller, doc, win,
    scroller.scrollHeight - scroller.clientHeight);
  const port = viewport(scroller, doc, win);
  const rect = target.getBoundingClientRect();
  if (rect.left >= port.right || rect.right <= port.left) return false;
  return scrollPort(scroller, doc, win,
    scroller.scrollTop + rect.bottom - (port.top + port.height) + GAP);
}
// Fixed, audited site adapters provide the transcript container and turn
// selector. Empty/ambiguous turns fail closed; recognized transcripts with
// zero scroll range keep disabled controls instead of vanishing.
export function findConversationNavigation(main, turnSelector, doc, win) {
  if (!main?.isConnected || !rendered(main, win) ||
      typeof turnSelector !== 'string' || !turnSelector) return null;
  const candidates = [...main.querySelectorAll(turnSelector)].filter(node=>rendered(node, win));
  const turns = candidates.filter(node=>!candidates.some(parent=>parent!==node&&parent.contains(node)));
  if (!turns.length) return null;
  const first = turns[0], last = turns.at(-1);
  const scroller = findConversationScroller(first, doc, win, {includeSelf: true});
  if (!scroller || turns.includes(scroller) ||
      turns.some(turn => findConversationScroller(turn, doc, win, {includeSelf: true}) !== scroller))
    return null;
  // Do not accept a scrollport inside a single message, code editor, or aside.
  if (scroller !== doc.scrollingElement && scroller !== doc.documentElement &&
      (!scroller.contains(first) || !scroller.contains(last) || scroller.closest('aside')))
    return null;
  return {scroller, main, first, last};
}
export function jumpConversationEdge(main, turnSelector, direction, doc, win) {
  if (direction !== 'top' && direction !== 'bottom') return false;
  const navigation = findConversationNavigation(main, turnSelector, doc, win);
  if (!navigation) return false;
  const {scroller} = navigation;
  return scrollPort(scroller, doc, win,
    direction === 'top' ? 0 : scroller.scrollHeight - scroller.clientHeight);
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
export function isLong(target, doc, win) {
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return false;
  const height = Math.max(target.getBoundingClientRect().height, target.scrollHeight || 0);
  return height > Math.max(240, Math.min(win.innerHeight, scroller.clientHeight) * 0.65);
}
function messageActions(marker, copySelector, peerSelector, boundary, win) {
  for (let group = marker.parentElement; group && group !== boundary; group = group.parentElement) {
    if (group.matches('header') || group.querySelector(TURN)) return null;
    const copies = [...group.querySelectorAll(copySelector)];
    const peers = [...group.querySelectorAll(peerSelector)];
    if (copies.length > 1 || peers.length > 1) return null;
    if (copies.length !== 1 || peers.length !== 1) continue;
    if (!rendered(group, win) || !rendered(copies[0], win) || !rendered(peers[0], win)) return null;
    // Insert beside the native action wrapper, preserving its tooltip ownership.
    let anchor = copies[0];
    while (anchor.parentElement !== group) anchor = anchor.parentElement;
    return {header: group, anchor};
  }
  return null;
}

function assistantActions(original, main, win) {
  // Never associate an action bar across a second assistant reply.
  for (let scope = original.parentElement; scope && scope !== main; scope = scope.parentElement) {
    if (scope.querySelectorAll(ASSISTANT_TURN).length !== 1) break;
    const markers = [...scope.querySelectorAll('button[aria-label="评价回复"]')]
      .filter(button => !original.contains(button) && !button.closest('header'));
    if (markers.length > 1) break;
    if (markers.length === 1) return messageActions(markers[0], 'button[aria-label="复制"]',
      'button[aria-label="重新生成回复"]', scope, win);
  }
  return null;
}

function messageBindings(main, doc, win) {
  const bindings = [];
  for (const original of main.querySelectorAll(SEARCH_TURN)) {
    let target = original;
    const assistant = original.matches(ASSISTANT_TURN);
    if (!rendered(original, win)) continue;
    if (assistant) {
      const viewers = [...original.children].filter(node => node.matches(MINDMAP_VIEWER));
      const contents = [...original.children].filter(node => node.tagName === 'DIV'
        && !node.matches('[data-opendesk-chatgpt-mindmap]')
        && node.querySelector('[data-d-component]'));
      if (!viewers.length && contents.some(node => !rendered(node, win))) continue;
      if (viewers.length) {
        // DIL keeps the assistant root visible and conceals only its content
        // DIV. The sole adjacent viewer replaces that exact content, not a
        // user turn, nested writing block, or another reply.
        if (viewers.length !== 1 || contents.length !== 1
            || contents[0].nextElementSibling !== viewers[0]
            || rendered(contents[0], win) || !rendered(viewers[0], win)
            || viewers[0].querySelector(SEARCH_TURN)) continue;
        target = viewers[0];
      }
    }
    // The explicit replacement can be compact even for a long answer. Its
    // own height must not retire the reply's navigation while mindmap is open.
    if (target === original && !isLong(target, doc, win)) continue;
    let actions = null;
    if (!assistant) {
      const copies = [...target.querySelectorAll('button[aria-label="复制消息"]')];
      if (copies.length === 1) actions = messageActions(copies[0],
        'button[aria-label="复制消息"]', 'button[aria-label="编辑消息"]', target, win);
    } else {
      actions = assistantActions(original, main, win);
    }
    if (actions) bindings.push({...actions, target, main, kind: 'region',
      ...(assistant ? {answerRoot: original} : {})});
  }
  return bindings;
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
    let kind = 'region';
    if (target.matches('textarea,[contenteditable="true"]')) {
      if (findConversationScroller(target, doc, win, {includeSelf: true}) === target) {
        kind = 'editor';
      } else {
        // Writing blocks may be editable, natural-height conversation content.
        // Clipped/overflowing editors still must never redirect to a parent.
        if (!target.matches('[contenteditable="true"]') ||
            target.scrollHeight > target.clientHeight + 1 ||
            /^(hidden|clip)$/.test(win.getComputedStyle(target).overflowY)) continue;
      }
    }
    used.add(target);
    bindings.push({header, anchor, target, main, kind});
  }
  for (const binding of messageBindings(main, doc, win)) {
    if (!used.has(binding.target) && !bindings.some(item => item.header === binding.header)) {
      used.add(binding.target);
      bindings.push(binding);
    }
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
// Both reply navigation and mindmap own their live host; the shared group
// owns layout only. Repeated mounts do not move an already correctly placed host.
// Resolving the same verified assistant footer as Mind Map prevents creating
// two background groups when the native DIL action buttons sit one level deeper.
function answerToolScope(bar) {
  return bar.closest?.('.turn-action-controls') || bar;
}
export function mountAnswerTool(bar, host) {
  if (!bar?.isConnected || !host || host === bar || host.contains(bar)) return null;
  const scope = answerToolScope(bar);
  const groups = [...scope.querySelectorAll(`[${ANSWER_TOOLS}]`)];
  if (groups.length > 1) return null; // Do not mutate ambiguous foreign groups.
  let group = groups[0];
  const target = group?.parentElement || scope;
  if (!target?.isConnected || !scope.contains(target)) return null;
  if (!group) {
    group = bar.ownerDocument.createElement('span');
    group.setAttribute(ANSWER_TOOLS, '');
    group.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:2px;'
      + 'border-radius:12px;background:color-mix(in srgb,currentColor 6%,transparent);'
      + 'border:1px solid color-mix(in srgb,currentColor 10%,transparent);'
      + 'max-width:100%;flex-wrap:wrap;flex:0 0 auto;';
  }
  // A peer may have created the group with the former right-aligned margin.
  // Update layout only, and avoid style mutations on every observer refresh.
  if (group.style.marginInlineStart !== '0px') group.style.marginInlineStart = '0px';
  if (group.style.marginInlineEnd !== 'auto') group.style.marginInlineEnd = 'auto';
  if (group.style.justifyContent !== 'flex-start') group.style.justifyContent = 'flex-start';
  const previous = host.parentElement;
  if (previous !== group) group.append(host);
  if (previous !== group && previous?.hasAttribute(ANSWER_TOOLS) && !previous.childNodes.length)
    previous.remove();
  // The two Apps retain their own listeners. Order navigation before Mind Map
  // and never replace the shared group, native controls or a peer's host.
  const mindmap = [...group.children].find(node =>
    node.matches('[data-opendesk-chatgpt-mindmap="button"]'));
  if (mindmap) {
    const navigators = [...group.children].filter(node => node.hasAttribute(OWN));
    for (const navigation of navigators) {
      if ([...group.children].indexOf(navigation) > [...group.children].indexOf(mindmap))
        mindmap.before(navigation);
    }
  }
  if (target.lastElementChild !== group) target.append(group);
  return group;
}

export function unmountAnswerTool(host) {
  const group = host?.parentElement;
  host?.remove();
  if (group?.hasAttribute(ANSWER_TOOLS) && !group.childNodes.length) group.remove();
}

function newButton(doc, kind, directions, sessionKey) {
  const host = doc.createElement('span');
  host.setAttribute(OWN, sessionKey === 'default' ? 'host' : sessionKey);
  host.setAttribute(MODERN_OWN, 'reply');
  host.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;vertical-align:middle;color:inherit;';
  const shadow = host.attachShadow({mode: 'open'});
  const style = doc.createElement('style');
  style.textContent = `button{width:34px;height:34px;display:inline-flex;
    align-items:center;justify-content:center;cursor:pointer;border:0;
    border-radius:10px;background:transparent;color:inherit;padding:0;
    font:inherit;line-height:1}
    button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}
    button:disabled{opacity:.45;cursor:default}
    button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;
    stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}`;
  shadow.append(style);
  const controls = directions.map(direction => {
    const button = doc.createElement('button');
    button.type = 'button';
    const label = kind === 'conversation'
      ? (direction === 'top' ? 'Back to start of this conversation' : 'Go to end of this conversation')
      : (direction === 'top' ? 'Back to start of this content' : 'Go to end of this content');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.scrollNavKey = kind === 'conversation'
      ? (direction === 'top' ? 'conversationTop' : 'conversationBottom')
      : (direction === 'top' ? 'regionTop' : 'regionBottom');
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'top'
      ? 'M5 4h14M12 20V8m-6 6 6-6 6 6'
      : 'M5 20h14M12 4v12m-6-6 6 6 6-6');
    svg.append(path);
    button.append(svg);
    shadow.append(button);
    return {button, direction};
  });
  return {host, controls};
}
export function installJumpToTop({doc, win, owner, resolveBindings = findRegionBindings,
  regionSelector = 'main,[role="main"],header', sessionKey = 'default',
  regionDirections = {top: true, bottom: false},
  conversationDirections = {top: true, bottom: false}}) {
  // An old session may delete the WeakMap entry when it was the last owner.
  // Reacquire after disposing, or a repeated install becomes untracked.
  sessions.get(doc)?.get(sessionKey)?.dispose();
  let active = sessions.get(doc);
  if (!active) {active = new Map();sessions.set(doc, active);}
  const mounted = new Map();
  const cleanups = [];
  let pending = false;
  let disposed = false;
  function remove(header) {
    const item = mounted.get(header);
    item?.unlisten();
    unmountAnswerTool(item?.host);
    mounted.delete(header);
  }
  function refresh() {
    pending = false;
    if (disposed) return;
    // A still-active old install is the incumbent. Its buttons remain owned
    // by the old script; this program yields without touching that owner.
    if (legacyNavigationPresent(doc)) {
      for (const header of [...mounted.keys()]) remove(header);
      return;
    }
    const resolved = resolveBindings(doc, win);
    for (const old of mounted.values()) {
      const root = old.answerRoot;
      if (!root || resolved.some(binding => binding.header === old.header)
          || !old.main.isConnected || !old.main.contains(root)
          || findConversationMain(doc, win) !== old.main || !rendered(root, win)
          || !root.matches(ASSISTANT_TURN)
          || root.getAttribute('data-content-search-unit-key') !== old.answerKey) continue;
      // Concealment and viewer insertion/removal can arrive in separate refreshes.
      // Keep only an already proven reply/action relationship, with no scroll target.
      const replacing = root.querySelector(MINDMAP_VIEWER) || [...root.children].some(node =>
        node.tagName === 'DIV' && node.querySelector('[data-d-component]') && !rendered(node, win));
      const actions = replacing && assistantActions(root, old.main, win);
      if (actions?.header === old.header && actions.anchor === old.anchor)
        resolved.push({...old, target: null});
    }
    const bindings = resolved.map(binding => {
      const options = binding.kind === 'conversation' ? conversationDirections : regionDirections;
      const programTop = sessionKey !== 'default' &&
        [...binding.header.querySelectorAll(`[${OWN}="host"]`)].some(host => host.isConnected);
      const directions = ['top', 'bottom'].filter(direction =>
        options[direction] === true && !(direction === 'top' && programTop));
      return {...binding, directions};
    }).filter(binding => binding.directions.length);
    for (const header of mounted.keys()) {
      if (!bindings.some(binding => binding.header === header)) remove(header);
    }
    for (const binding of bindings) {
      // Two distinct versions can share a document even when each has its
      // own module-local WeakMap. The first connected live host wins; a
      // second install cannot create a second effective reply navigator.
      const incumbent = [...answerToolScope(binding.header).querySelectorAll(`[${MODERN_OWN}="reply"]`)]
        .find(node => node.isConnected && node.shadowRoot &&
          node.getAttribute(OWN) === (sessionKey === 'default' ? 'host' : sessionKey));
      if (incumbent && incumbent !== mounted.get(binding.header)?.host) {
        remove(binding.header);
        continue;
      }
      // React cloneNode copies the marker, not the ShadowRoot/listeners.
      // Clean only inert copies owned by this navigation session.
      for (const clone of answerToolScope(binding.header).querySelectorAll(
        `[${OWN}="${sessionKey === 'default' ? 'host' : sessionKey}"]`)) {
        if (!clone.shadowRoot) unmountAnswerTool(clone);
      }
      const old = mounted.get(binding.header);
      if (old?.host.isConnected && old.anchor === binding.anchor
          && (old.answerRoot || old.target) === (binding.answerRoot || binding.target)
          && old.directions.join(',') === binding.directions.join(',') &&
          (binding.answerRoot
            ? old.host.parentElement?.hasAttribute(ANSWER_TOOLS)
              && answerToolScope(binding.header).contains(old.host.parentElement)
            : old.host.nextElementSibling === binding.anchor)) {
        if (binding.answerRoot) mountAnswerTool(binding.header, old.host);
        for (const {button} of old.controls) button.disabled = !binding.target;
        continue;
      }
      remove(binding.header);
      const item = newButton(doc, binding.kind, binding.directions, sessionKey);
      const cleanups = item.controls.map(({button, direction})=>owner.on(button, 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        const active = [...answerToolScope(binding.header).querySelectorAll(`[${MODERN_OWN}="reply"]`)]
          .find(node => node.isConnected && node.shadowRoot &&
            node.getAttribute(OWN) === (sessionKey === 'default' ? 'host' : sessionKey));
        // The old Page can mount between scheduled refresh and a click.
        // Revalidate the DOM owner before any scroll side effect.
        if (button.disabled || legacyNavigationPresent(doc) || active !== item.host) {
          schedule();return;
        }
        const current = resolveBindings(doc, win).find(next => next.header === binding.header
          && next.anchor === binding.anchor
          && (next.answerRoot || next.target) === (binding.answerRoot || binding.target));
        if (current) {
          if (direction === 'bottom') jumpRegionEnd(current, doc, win);
          else jumpRegionTop(current, doc, win);
        } else {
          // A click can beat the debounced refresh during a mode transition.
          for (const {button: control} of item.controls) control.disabled = true;
          schedule();
        }
      }));
      if (binding.answerRoot) mountAnswerTool(binding.header, item.host);
      else binding.anchor.before(item.host);
      mounted.set(binding.header, {...item, ...binding,
        answerKey: binding.answerRoot?.getAttribute('data-content-search-unit-key'),
        unlisten:()=>cleanups.forEach(off=>off())});
    }
  }
  function schedule() {
    if (disposed || pending) return;
    pending = true;
    owner.setTimeout(refresh, 120);
  }
  const observer = owner.observe(doc.documentElement, records => {
    // A pre-rename installation can mount after this Page has mounted.
    // Do not debounce its takeover or ignore it as our own DOM mutation.
    const peerChanged = records.some(record => record.type === 'childList' &&
      [...record.addedNodes, ...record.removedNodes].some(node =>
        (node.matches?.(LEGACY_LIFECYCLE)) ||
        (node.hasAttribute?.(OWN) && node.shadowRoot &&
          ![...mounted.values()].some(item => item.host === node))));
    if (peerChanged) { refresh(); return; }
    const relevant = records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(`[${OWN}="${sessionKey === 'default' ? 'host' : sessionKey}"]`)) return false;
      const inRegion = target?.closest(regionSelector);
      if (record.type !== 'childList') return Boolean(inRegion);
      if ([...record.removedNodes].some(node => node.hasAttribute?.(OWN)
          && [...mounted.values()].some(item => item.host === node && !node.isConnected))) return true;
      const changed = [...record.addedNodes, ...record.removedNodes]
        .filter(node => node.getAttribute?.(OWN) !== (sessionKey === 'default' ? 'host' : sessionKey));
      return changed.length > 0 && (inRegion || changed.some(node => node.nodeType === 1
        && (node.matches(regionSelector) || node.querySelector(regionSelector))));
    });
    if (relevant) schedule();
  }, {subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-controls', 'aria-label', 'id', 'class', 'style',
      'data-content-search-unit-key', 'data-chatgpt-search-unit-key']});
  cleanups.push(() => observer.disconnect());
  for (const type of ['popstate', 'hashchange', 'pageshow', 'resize']) cleanups.push(owner.on(win, type, schedule));
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const header of mounted.keys()) remove(header);
    cleanups.forEach(cleanup => cleanup());
    if (sessions.get(doc)?.get(sessionKey)?.dispose === dispose) {
      sessions.get(doc).delete(sessionKey);
      if (!sessions.get(doc).size) sessions.delete(doc);
    }
  }
  owner.onDispose(dispose);
  const session = {refresh, dispose, isMounted: () => [...mounted.values()].some(item => item.host.isConnected)};
  active.set(sessionKey, session);
  refresh();
  return session;
}
