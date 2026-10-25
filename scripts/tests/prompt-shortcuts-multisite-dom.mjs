import {
  deepSeekConversation,
  findDeepSeekBindings,
} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/conversation-sites.js';
import {
  installJumpToTop,
  isLong,
} from '../../examples/programs/chatgpt-jump-top/src/conversation.js';

const OWN = '[data-opendesk-chatgpt-jump-top]';
const FIXTURE = '[data-prompt-shortcuts-multisite-fixture]';
const CHAT = 'https://chat.deepseek.com/a/chat/s/01234567-89ab-cdef-0123-456789abcdef';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// A test lifecycle owner, not an installation/permission/Authority implementation.
// Normal disposal only runs the program's disposers and cancels owned timers:
// listener/observer leaks remain visible until the final forceCleanup fallback.
function fixtureOwner(win) {
  const listen = new Set();
  const observers = new Set();
  const timers = new Set();
  const disposers = new Set();
  const timeout = win.setTimeout.bind(win);
  const clear = win.clearTimeout.bind(win);
  let disposed = false;
  let scheduled = 0;
  return {
    on(target, type, callback, options) {
      target.addEventListener(type, callback, options);
      const remove = () => {
        target.removeEventListener(type, callback, options);
        listen.delete(remove);
      };
      listen.add(remove);
      return remove;
    },
    observe(target, callback, options) {
      const observer = new win.MutationObserver(callback);
      observer.observe(target, options);
      observers.add(observer);
      return {disconnect() { observer.disconnect(); observers.delete(observer); }};
    },
    setTimeout(callback, delay) {
      scheduled++;
      const id = timeout(() => { timers.delete(id); callback(); }, delay);
      timers.add(id);
      return id;
    },
    onDispose(callback) { disposers.add(callback); },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        for (const callback of disposers) callback();
      } finally {
        disposers.clear();
        for (const id of timers) clear(id);
        timers.clear();
      }
    },
    resources() {
      return {listeners: listen.size, observers: observers.size, timers: timers.size,
        disposers: disposers.size, scheduled};
    },
    forceCleanup() {
      for (const remove of listen) remove();
      for (const observer of observers) observer.disconnect();
      observers.clear();
      for (const id of timers) clear(id);
      timers.clear();
      disposers.clear();
    },
  };
}

function createFixture(doc, win) {
  const element = (tag, css, text) => {
    const node = doc.createElement(tag);
    node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = element('div', 'position:absolute;top:16px;left:16px;width:600px;'
    + 'margin:0;padding:0;border:0;font:14px/20px sans-serif;');
  root.setAttribute('data-prompt-shortcuts-multisite-fixture', 'synthetic-only');
  const main = element('main', 'display:block;position:relative;box-sizing:border-box;'
    + 'width:600px;height:320px;overflow:auto;overflow-anchor:none;'
    + 'scroll-behavior:auto;scroll-snap-type:none;border:2px solid #555;padding:0;margin:0;');
  root.append(main);
  main.append(element('div', 'height:180px;'));
  const nativeAction = text => {
    // DeepSeek uses div.ds-button[role=button], rather than HTML buttons.
    const action = element('div', 'display:inline-flex;align-items:center;'
      + 'justify-content:center;width:48px;height:32px;flex:0 0 auto;', text);
    action.className = 'ds-button';
    action.setAttribute('role', 'button');
    action.tabIndex = 0;
    return action;
  };
  const turn = name => {
    const container = element('div', 'display:block;margin:0 0 80px;padding:0;');
    const message = element('div', 'display:block;box-sizing:border-box;'
      + 'height:820px;margin:0;padding:0;overflow:visible;position:static;');
    message.className = 'ds-message';
    message.append(element('p', 'margin:0;height:24px;', `Synthetic message ${name}`));
    const codeCopy = nativeAction('Code');
    const code = element('pre', 'margin:0;');
    code.append(codeCopy);
    message.append(code);
    const row = element('div', 'display:flex;position:static;align-items:center;'
      + 'height:40px;margin:0;padding:0;');
    const copy = nativeAction('Copy');
    const anchor = nativeAction('Retry');
    row.append(copy, anchor);
    container.append(message, row);
    main.append(container);
    return {container, message, row, copy, anchor, codeCopy};
  };
  const a = turn('A');
  const b = turn('B');
  main.append(element('div', 'height:600px;'));
  doc.body.append(root);

  let href = CHAT;
  // Only the site resolver sees a simulated location. Native Window methods
  // retain their receiver; scrolling, events, timers and layout use the real win.
  const resolverWin = new Proxy(win, {
    get(target, key) {
      if (key === 'location') return {href};
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const owner = fixtureOwner(win);
  const bindings = () => findDeepSeekBindings(doc, resolverWin, main);
  const hosts = () => [...root.querySelectorAll(OWN)];
  const button = item => item.row.querySelector(OWN)?.shadowRoot?.querySelector('button');
  const mount = () => installJumpToTop({doc, win, owner,
    resolveBindings: bindings, regionSelector: `${FIXTURE},.ds-message,.ds-button[role="button"]`});
  return {root, main, a, b, owner, bindings, hosts, button, mount, element, nativeAction,
    setHref(value) { href = value; }};
}

/**
 * Browser ESM usage on a caller-owned, otherwise empty fixture page served from
 * the repository root:
 *   const {run} = await import('/scripts/tests/prompt-shortcuts-multisite-dom.mjs');
 *   const result = await run(document, window);
 *   if (result.status !== 'PASS') throw new Error(JSON.stringify(result));
 *
 * Creates real laid-out DOM; never navigates, starts a server or launches Chrome.
 * PASS means synthetic DOM checks only. Installation and live sites are NOT_TESTED.
 * Every case, including failures, removes its DOM and owned resources.
 */
export async function run(doc = document, win = window) {
  assert(doc?.body && doc.defaultView === win, 'A real browser Document and its Window are required');
  assert(!doc.querySelector(`${OWN},${FIXTURE}`), 'Use a dedicated fixture document with no active jump-to-top session');
  const actualHref = win.location.href;
  const documentScroll = () => ({top: doc.scrollingElement?.scrollTop || 0,
    left: doc.scrollingElement?.scrollLeft || 0});
  const originalScroll = documentScroll();
  const delay = ms => new Promise(resolve => win.setTimeout.bind(win)(resolve, ms));
  const until = async (predicate, message) => {
    const deadline = win.performance.now() + 1500;
    do {
      if (predicate()) return;
      await delay(20);
    } while (win.performance.now() < deadline);
    assert(false, message);
  };
  const cases = [];
  const check = async (id, test) => {
    let fixture;
    const result = {id, pass: true};
    try {
      fixture = createFixture(doc, win);
      const box = fixture.main.getBoundingClientRect();
      assert(box.width > 500 && box.height >= 300 && fixture.main.clientHeight > 0
        && fixture.main.scrollHeight > fixture.main.clientHeight, 'Fixture requires real overflow and layout');
      await test(fixture);
    } catch (error) {
      result.pass = false;
      result.error = error?.message || String(error);
    } finally {
      if (fixture) {
        try {
          fixture.owner.dispose();
          result.resourcesAfterDispose = fixture.owner.resources();
          const {listeners, observers, timers, disposers} = result.resourcesAfterDispose;
          assert(!listeners && !observers && !timers && !disposers, 'Lifecycle disposal leaked owned resources');
          assert(fixture.hosts().length === 0, 'Lifecycle disposal left a jump-to-top entry');
        } catch (error) {
          result.pass = false;
          result.cleanupError = error?.message || String(error);
        } finally {
          fixture.owner.forceCleanup();
          fixture.root.remove();
        }
      }
      cases.push(result);
    }
  };
  const exactBindings = f => {
    const bindings = f.bindings();
    assert(bindings.length === 2, 'Two independent native rows must yield exactly two bindings');
    for (const item of [f.a, f.b]) {
      const binding = bindings.find(candidate => candidate.target === item.message);
      assert(binding?.header === item.row && binding.anchor === item.anchor
        && binding.main === f.main && binding.kind === 'region', 'Native row bound to the wrong message or anchor');
      assert(binding.anchor !== item.codeCopy, 'Code-block copy must not act as the native row anchor');
    }
  };
  const entries = f => {
    assert(f.hosts().length === 2, 'Each long message needs exactly one entry');
    for (const item of [f.a, f.b]) {
      const host = item.row.querySelector(OWN);
      assert(item.row.querySelectorAll(OWN).length === 1 && host?.nextElementSibling === item.anchor,
        'Entry must stay immediately beside its own native anchor');
      assert(f.button(item)?.getAttribute('aria-label') === 'Back to start of this content', 'Accessible content-top button missing');
    }
  };
  const atContentStart = (f, item) => {
    const box = item.message.getBoundingClientRect();
    const port = f.main.getBoundingClientRect();
    const offset = box.top - port.top - f.main.clientTop;
    // Assert the visible landing, without reimplementing the shared scroll math.
    assert(offset >= -1 && offset <= 40 && box.left < port.right && box.right > port.left,
      `Wrong content start after jump (offset ${offset})`);
    assert(item.row.getBoundingClientRect().top > port.top + f.main.clientHeight,
      'Jump landed on the trailing toolbar instead of the long content start');
  };

  await check('deepseek-native-sibling-rows', f => {
    assert(deepSeekConversation(CHAT) && deepSeekConversation(`${CHAT}/`), 'Exact DeepSeek conversation URL rejected');
    assert(isLong(f.a.message, doc, win) && isLong(f.b.message, doc, win), 'Shared isLong must accept real long content');
    exactBindings(f);
    f.mount();
    entries(f);
  });

  await check('refresh-observer-and-reinstall-do-not-duplicate', async f => {
    const session = f.mount();
    const originalHosts = f.hosts();
    for (let index = 0; index < 3; index++) session.refresh();
    entries(f);
    assert(f.hosts().every((host, index) => host === originalHosts[index]), 'Refresh replaced stable entries');
    const scheduled = f.owner.resources().scheduled;
    f.a.message.append(doc.createTextNode(' streaming update'));
    await until(() => f.owner.resources().scheduled > scheduled && !f.owner.resources().timers,
      'Real MutationObserver did not refresh streamed content');
    entries(f);
    assert(f.hosts().every((host, index) => host === originalHosts[index]), 'Stream refresh replaced stable entries');
    originalHosts[0].remove();
    await until(() => f.a.row.querySelector(OWN)?.isConnected, 'Removed entry was not restored');
    entries(f);
    f.mount();
    entries(f);
    assert(!originalHosts[1].isConnected, 'Reinstall must dispose the preceding session');
    const before = f.main.scrollTop = 500;
    originalHosts[1].shadowRoot.querySelector('button').click();
    assert(f.main.scrollTop === before, 'Replaced session retained a live click listener');
  });

  await check('long-content-jumps-to-the-same-message', f => {
    f.mount();
    f.main.scrollTop = f.main.scrollHeight - f.main.clientHeight - 100;
    const before = f.main.scrollTop;
    f.button(f.b).click();
    assert(f.main.scrollTop < before && f.main.scrollTop > 500, 'Second message jump moved to conversation top or did not scroll');
    atContentStart(f, f.b);
    assert(f.a.message.getBoundingClientRect().bottom < f.main.getBoundingClientRect().top,
      'Second message jump landed on the first message');
    const landed = f.main.scrollTop;
    f.button(f.b).click();
    assert(Math.abs(f.main.scrollTop - landed) <= 1, 'Repeated click moved away from the same target');
    f.button(f.a).click();
    atContentStart(f, f.a);
    assert(f.b.message.getBoundingClientRect().top > f.main.getBoundingClientRect().bottom,
      'First message jump landed on the second message');
    assert(JSON.stringify(documentScroll()) === JSON.stringify(originalScroll), 'Message jump moved the outer document');
  });

  await check('self-scrolling-long-message-keeps-parent-and-peer', f => {
    f.b.message.style.height = '280px';
    f.b.message.style.overflow = 'auto';
    f.b.message.append(f.element('div', 'height:1000px;', 'Synthetic inner content'));
    exactBindings(f);
    f.mount();
    f.main.scrollTop = 500;
    f.b.message.scrollTop = 350;
    const before = f.main.scrollTop;
    assert(f.b.message.scrollTop > 0, 'Inner message must actually overflow');
    f.button(f.b).click();
    assert(f.b.message.scrollTop === 0 && f.main.scrollTop === before && f.a.message.scrollTop === 0,
      'Self-scrolling message redirected the jump to a parent or peer');
  });

  await check('short-message-and-in-content-controls-do-not-bind', f => {
    f.a.message.style.height = '80px';
    assert(!isLong(f.a.message, doc, win), 'Shared isLong accepted short content');
    assert(f.bindings().length === 1 && f.bindings()[0].target === f.b.message, 'Short message received an entry');
    f.b.row.remove();
    assert(f.bindings().length === 0, 'Code-block control must not substitute for an adjacent native row');
    f.mount();
    assert(f.hosts().length === 0, 'Unbound content received an entry');
  });

  await check('two-messages-sharing-parent-reject-stale-entries', async f => {
    f.mount();
    const stale = [f.button(f.a), f.button(f.b)];
    f.a.container.append(f.b.message, f.b.row);
    f.b.container.remove();
    assert(f.bindings().length === 0, 'Shared parent was ambiguously associated with one of its messages');
    const before = f.main.scrollTop = 500;
    stale.forEach(button => button.click());
    assert(f.main.scrollTop === before, 'Click-time revalidation accepted an ambiguous message parent');
    await until(() => f.hosts().length === 0, 'Observer did not remove ambiguous entries');
  });

  await check('mixed-native-toolbars-fail-closed-per-message', async f => {
    f.mount();
    const extraRow = f.element('div', 'display:flex;height:40px;');
    extraRow.append(f.nativeAction('Other copy'), f.nativeAction('Other retry'));
    f.a.container.append(extraRow);
    const bindings = f.bindings();
    assert(bindings.length === 1 && bindings[0].target === f.b.message,
      'Controls from separate native toolbars were merged or rejected the unrelated valid message');
    await until(() => !f.a.row.querySelector(OWN), 'Mixed toolbar kept a stale entry');
    assert(f.hosts().length === 1 && f.button(f.b), 'Valid neighboring message lost its entry');
  });

  await check('wrong-origin-and-login-path-reject-before-scroll', f => {
    const rejected = [
      CHAT.replace('https:', 'http:'),
      CHAT.replace('chat.deepseek.com', 'chat.deepseek.com.evil.example'),
      CHAT.replace('chat.deepseek.com', 'deepseek.com'),
      CHAT.replace('chat.deepseek.com', 'chatgpt.com'),
      CHAT.replace('chat.deepseek.com', 'chat.deepseek.com:8443'),
      CHAT.replace('https://', 'https://user:password@'),
      'https://chat.deepseek.com/',
      'https://chat.deepseek.com/login',
      'https://chat.deepseek.com/sign_in',
      'https://chat.deepseek.com/a/login',
      'https://chat.deepseek.com/a/chat',
      'https://chat.deepseek.com/a/chat/s/not-a-chat-id',
    ];
    const session = f.mount();
    for (const href of rejected) {
      const stale = f.button(f.b);
      assert(stale, 'Valid conversation entry missing before URL transition');
      f.setHref(href);
      assert(!deepSeekConversation(href) && f.bindings().length === 0, `Resolver accepted ${href}`);
      const before = f.main.scrollTop = 500;
      stale.click();
      assert(f.main.scrollTop === before, `Stale entry scrolled on rejected URL ${href}`);
      session.refresh();
      assert(f.hosts().length === 0, `Rejected URL retained entries: ${href}`);
      f.setHref(CHAT);
      session.refresh();
      entries(f);
    }
    assert(win.location.href === actualHref, 'URL simulation changed the real browser location');
  });

  await check('removed-message-rejects-click-and-cleans-only-own-entry', async f => {
    f.mount();
    const stale = f.button(f.a);
    f.a.message.remove();
    const before = f.main.scrollTop = 300;
    stale.click();
    assert(f.main.scrollTop === before, 'Removed message retained a scrolling target');
    await until(() => !f.a.row.querySelector(OWN), 'Removed message retained a stale entry');
    assert(f.hosts().length === 1 && f.button(f.b), 'Removing one message affected the valid peer');
  });

  await check('dispose-cleans-entries-observers-listeners-and-pending-timer', async f => {
    const session = f.mount();
    const stale = [f.button(f.a), f.button(f.b)];
    f.a.message.append(doc.createTextNode(' pending refresh'));
    await until(() => f.owner.resources().timers > 0, 'Expected an owned pending observer refresh');
    session.dispose();
    session.dispose();
    assert(!session.isMounted() && f.hosts().length === 0, 'Session disposal left mounted entries');
    assert(!f.owner.resources().listeners && !f.owner.resources().observers,
      'Session disposal did not release click/window listeners and MutationObserver');
    f.owner.dispose();
    f.owner.dispose();
    const {timers, disposers, scheduled} = f.owner.resources();
    assert(!timers && !disposers, 'Owner disposal left a queued refresh or disposal callback');
    const before = f.main.scrollTop = 500;
    stale.forEach(button => button.click());
    session.refresh();
    f.a.message.append(doc.createTextNode(' after dispose'));
    win.dispatchEvent(new win.Event('resize'));
    await delay(180);
    assert(f.main.scrollTop === before && f.hosts().length === 0, 'Disposed session still scrolled or remounted');
    assert(f.owner.resources().scheduled === scheduled, 'Disposed observer or window listener scheduled work');
  });

  const cleanup = {fixtureRemoved: !doc.querySelector(FIXTURE),
    entriesRemoved: !doc.querySelector(OWN), locationUnchanged: win.location.href === actualHref,
    documentScrollUnchanged: JSON.stringify(documentScroll()) === JSON.stringify(originalScroll)};
  const passed = cases.filter(result => result.pass).length;
  return {
    status: passed === cases.length && Object.values(cleanup).every(Boolean) ? 'PASS' : 'FAIL',
    scope: 'synthetic browser DOM fixture only',
    evidence: {installation: 'NOT_TESTED', liveDeepSeek: 'NOT_TESTED', liveChatGPT: 'NOT_TESTED'},
    passed, total: cases.length, cases, cleanup,
  };
}
