import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

/** Run on a caller-owned, dedicated about:blank Playwright page. No connection is opened. */
export async function runBrowserChecks(page) {
  const source = await readFile(new URL('../src/conversation.js', import.meta.url), 'utf8');
  const result = await runBrowserChecksWithSource(page, source);
  try {
    for (const item of result.cases) {
      for (const check of item.checks) assert.equal(check.pass, true, `${item.id}: ${check.name}`);
    }
    assert.equal(result.status, 'PASS', 'synthetic browser checks');
  } catch (error) {
    error.browserChecks = result;
    throw error;
  }
  return result;
}

/**
 * Standalone injection entry: serialize this function and pass pre-read source when
 * the orchestration VM cannot import Node ESM. It has no Node or module-scope dependencies.
 * Its only dynamic import executes in the browser's about:blank realm via page.evaluate.
 * The returned checks can also be asserted by the external Node caller.
 */
export async function runBrowserChecksWithSource(page, source) {
  if (page.url() !== 'about:blank') throw new Error('A dedicated about:blank fixture page is required');
  if (typeof source !== 'string' || !source.trim()) throw new Error('Provide conversation.js source');
  const lines = name => Array.from({length: 140}, (_, index) => `synthetic ${name} line ${index}`).join('\n');
  const section = name => `<section id="section-${name}">
    <header class="region-header" id="header-${name}"><button type="button" aria-label="Open editor">Open editor</button></header>
    <pre id="pre-${name}">${lines(name)}</pre></section>`;
  await page.setContent(`<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><title>SYNTHETIC jump-to-top layout checks</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; overflow: hidden; }
      body { font: 14px/1.4 system-ui; color: #172033; background: #f4f6fa; }
      #synthetic-banner { height: 40px; padding: 8px 24px; }
      main { position: relative; height: calc(100vh - 80px); max-height: 420px;
        margin: 12px 24px 0; border: 2px solid #627089; overflow: auto;
        overflow-anchor: none; scroll-behavior: auto; }
      #synthetic-toolbar { position: sticky; top: 0; height: 44px; z-index: 10;
        display: flex; align-items: center; background: #dce6f8; padding: 0 12px; }
      .lead { height: 220px; }
      section { margin: 0; padding: 0 0 72px; }
      .region-header { position: sticky; top: 44px; height: 40px; z-index: 2;
        display: flex; justify-content: flex-end; align-items: center; background: #e7ebf2; }
      .region-header > button { height: 32px; }
      pre { margin: 0; padding: 0; overflow-x: auto; font: 14px/20px monospace; }
      textarea { display: block; width: 100%; height: 180px; resize: none;
        overflow: auto; scroll-behavior: auto; font: 14px/20px monospace; }
      .tail { height: 600px; }
    </style></head><body data-fixture-origin="synthetic">
    <header id="synthetic-banner">SYNTHETIC ONLY — no ChatGPT, installation or Authority evidence</header>
    <main id="synthetic-main"><header id="synthetic-toolbar">Synthetic sticky toolbar</header>
      <div class="lead"></div><article data-testid="conversation-turn-synthetic">
      ${section('a')}${section('b')}
      <section id="section-editor"><header class="region-header" id="header-editor">
        <button type="button" aria-label="Open editor">Open editor</button></header>
        <textarea id="synthetic-editor" spellcheck="false">${lines('editor')}</textarea></section>
      </article><div class="tail"></div></main>
    <aside><header id="unrelated-header"><button aria-label="Open editor">Synthetic unrelated editor</button></header></aside>
    </body></html>`);

  return page.evaluate(async moduleSource => {
    const {findRegionBindings, installJumpToTop, jumpRegionTop} = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`);
    const OWN = '[data-opendesk-chatgpt-jump-top]';
    const ids = {a: 'pre-a', b: 'pre-b', editor: 'synthetic-editor'};
    const get = id => document.getElementById(id);
    const main = () => get('synthetic-main');
    const hosts = () => [...document.querySelectorAll(OWN)];
    const button = name => get(`header-${name}`)?.querySelector(OWN)?.shadowRoot?.querySelector('button');
    const bindings = () => findRegionBindings(document, window);
    const owners = [];
    const retiredButtons = new Set();
    let session;
    let owner;
    let savedEditor;
    const cases = [];
    const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));
    const rect = element => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {top: box.top, bottom: box.bottom, left: box.left, right: box.right,
        width: box.width, height: box.height};
    };
    const visibility = name => {
      const target = get(ids[name]);
      const targetBox = rect(target);
      const portBox = rect(main());
      if (!targetBox || !portBox) return null;
      const port = {top: Math.max(0, portBox.top + main().clientTop),
        bottom: Math.min(window.innerHeight, portBox.top + main().clientTop + main().clientHeight),
        left: Math.max(0, portBox.left + main().clientLeft),
        right: Math.min(window.innerWidth, portBox.left + main().clientLeft + main().clientWidth)};
      // Read actual browser rectangles. A sticky declaration is not evidence that
      // the header is currently pinned; a natural-flow header may touch its pre.
      const pinnedHeaders = [...document.querySelectorAll('header')].flatMap(header => {
        const style = getComputedStyle(header);
        const box = rect(header);
        const inset = parseFloat(style.top);
        const pinned = style.position === 'fixed' || (style.position === 'sticky'
          && Number.isFinite(inset) && box.top <= portBox.top + main().clientTop + inset + 0.5);
        if (!pinned || style.display === 'none' || /^(hidden|collapse)$/.test(style.visibility)
          || box.width <= 0 || box.height <= 0 || box.bottom <= port.top || box.top >= port.bottom
          || box.right <= Math.max(port.left, targetBox.left)
          || box.left >= Math.min(port.right, targetBox.right)) return [];
        return [{id: header.id, rect: box}];
      });
      const obstructionBottom = Math.max(port.top, ...pinnedHeaders
        .filter(item => item.rect.top <= targetBox.top).map(item => item.rect.bottom));
      const left = Math.max(port.left, targetBox.left);
      const right = Math.min(port.right, targetBox.right);
      const first12pxInsidePort = targetBox.top >= port.top && targetBox.top + 12 <= port.bottom && right > left;
      const first12pxPainted = first12pxInsidePort && [0.1, 0.5, 0.9].every(fraction =>
        [0.5, 6, 11.5].every(offset => {
          const painted = document.elementFromPoint(left + (right - left) * fraction, targetBox.top + offset);
          return painted === target || target.contains(painted);
        }));
      return {port, pinnedHeaders, obstructionBottom, clearance: targetBox.top - obstructionBottom,
        first12pxInsidePort, first12pxPainted};
    };
    const snapshot = () => ({
      scrollTop: {document: document.scrollingElement.scrollTop, main: main()?.scrollTop ?? null,
        a: get(ids.a)?.scrollTop ?? null, b: get(ids.b)?.scrollTop ?? null,
        editor: get(ids.editor)?.scrollTop ?? null},
      targetRect: Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, rect(get(id))])),
      headerRect: Object.fromEntries(Object.keys(ids).map(name => [name, rect(get(`header-${name}`))])),
      toolbarRect: rect(get('synthetic-toolbar')),
      visibility: Object.fromEntries(Object.keys(ids).map(name => [name, visibility(name)])),
    });
    const facts = () => bindings().map(binding => ({header: binding.header.id, target: binding.target.id,
      kind: binding.kind, currentMain: binding.main === main()}));
    const click = name => {
      const current = button(name);
      if (!current) throw new Error('Synthetic fixture button missing');
      current.click();
    };
    const positionAt = (name, offset = 600) => {
      const port = main();
      port.scrollTop += get(ids[name]).getBoundingClientRect().top
        - port.getBoundingClientRect().top - port.clientTop + offset;
    };
    const editorState = () => {
      const editor = get(ids.editor);
      return {value: editor.value, start: editor.selectionStart, end: editor.selectionEnd,
        direction: editor.selectionDirection};
    };
    // These are explicit synthetic lifecycle stubs, not OpenDesk Authority/installation.
    // dispose() delegates listener/observer removal to the installed program so leaks
    // stay observable. Only forceCleanup(), used at final teardown, provides a fallback.
    function syntheticOwner() {
      const listeners = new Set();
      const observers = new Set();
      const timers = new Set();
      const disposers = new Set();
      let disposed = false;
      let observerCallbacks = 0;
      let listenerCalls = 0;
      const result = {
        on(target, type, callback, options) {
          const wrapped = event => { listenerCalls++; callback(event); };
          const remove = () => {
            target.removeEventListener(type, wrapped, options);
            listeners.delete(entry);
          };
          const entry = {target, remove};
          target.addEventListener(type, wrapped, options);
          listeners.add(entry);
          return remove;
        },
        observe(target, callback, options) {
          const observer = new MutationObserver(records => { observerCallbacks++; callback(records); });
          const entry = {disconnect: () => { observer.disconnect(); observers.delete(entry); }};
          observer.observe(target, options);
          observers.add(entry);
          return entry;
        },
        setTimeout(callback, delay) {
          const timer = window.setTimeout(() => {
            timers.delete(timer);
            if (!disposed) callback();
          }, delay);
          timers.add(timer);
          return timer;
        },
        onDispose(callback) { disposers.add(callback); return () => disposers.delete(callback); },
        dispose() {
          if (disposed) return;
          disposed = true;
          for (const callback of disposers) callback();
          disposers.clear();
          for (const timer of timers) window.clearTimeout(timer);
          timers.clear();
        },
        stats: () => ({listeners: listeners.size, observers: observers.size, timers: timers.size,
          clickListeners: [...listeners].filter(entry => entry.target !== window).length,
          windowListeners: [...listeners].filter(entry => entry.target === window).length,
          observerCallbacks, listenerCalls}),
        forceCleanup() {
          result.dispose();
          for (const entry of [...listeners]) entry.remove();
          for (const entry of [...observers]) entry.disconnect();
        },
      };
      owners.push(result);
      return result;
    }
    const resources = () => owners.map(item => item.stats());
    const emptyResources = entries => entries.every(item => !item.listeners && !item.observers && !item.timers);
    async function waitForCondition(predicate) {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (predicate()) return;
        await pause(20);
      }
      throw new Error('Synthetic fixture refresh timeout');
    }
    async function waitForFreshButtons() {
      await waitForCondition(() => {
        const current = bindings();
        return current.length === 3 && hosts().length === 3 && current.every(binding => {
          const host = binding.anchor.previousElementSibling;
          const currentButton = host?.shadowRoot?.querySelector('button');
          return host?.matches(OWN) && currentButton && !retiredButtons.has(currentButton);
        });
      });
    }
    async function record(id, {prepare, run, verify, cleanup}) {
      const checks = [];
      const expect = (name, pass) => checks.push({name, pass: Boolean(pass)});
      let before;
      let after;
      let details = {};
      try {
        if (prepare) await prepare();
        before = snapshot();
        details = await run() ?? {};
        after = snapshot();
        verify(before, after, details, expect);
      } catch (error) {
        // Never return source text, textarea values, URLs or arbitrary exception messages.
        details = {errorName: error instanceof Error ? error.name : 'UnknownError'};
        expect('synthetic fixture action and verification completed', false);
      }
      before ??= snapshot();
      after ??= snapshot();
      if (cleanup) {
        try { await cleanup(); }
        catch { expect('synthetic fixture cleanup completed', false); }
      }
      cases.push({id, synthetic: true, status: checks.length && checks.every(item => item.pass) ? 'PASS' : 'FAIL',
        scrollTop: {before: before.scrollTop, after: after.scrollTop},
        targetRect: {before: before.targetRect, after: after.targetRect},
        headerRect: {before: before.headerRect, after: after.headerRect},
        toolbarRect: {before: before.toolbarRect, after: after.toolbarRect},
        visibility: {before: before.visibility, after: after.visibility}, details, checks});
    }
    const unchanged = (before, after, keys) => keys.every(key => before.scrollTop[key] === after.scrollTop[key]);
    function aligned(name, before, after, expect) {
      const visible = after.visibility[name];
      expect('the outer conversation scroll position changes', Math.abs(before.scrollTop.main - after.scrollTop.main) > 1);
      expect('content starts at least 12px below actual pinned or fixed obstructions', visible.clearance >= 12);
      expect('the first 12px of content are inside the visible scrollport', visible.first12pxInsidePort);
      expect('the first 12px of content are painted without a covering element', visible.first12pxPainted);
      expect('document and independent inner scrollers stay unchanged', unchanged(before, after, ['document', 'a', 'b', 'editor']));
    }
    async function replaceAndRecover(kind) {
      const stale = button('a');
      retiredButtons.add(stale);
      const oldHeader = get('header-a');
      const oldTarget = get(ids.a);
      if (kind === 'header') {
        const replacement = document.createElement('header');
        replacement.id = 'header-a';
        replacement.className = 'region-header';
        replacement.innerHTML = '<button type="button" aria-label="Open editor">Open editor</button>';
        oldHeader.replaceWith(replacement);
      } else oldTarget.replaceWith(oldTarget.cloneNode(true));
      const staleConnectedAtClick = stale.isConnected;
      const staleBefore = main().scrollTop;
      stale.click(); // Same task, before MutationObserver or its debounce can retire this handler.
      const staleAfter = main().scrollTop;
      await waitForFreshButtons();
      const freshButtonDifferent = button('a') !== stale;
      click('a');
      return {staleConnectedAtClick, staleScrollTop: {before: staleBefore, after: staleAfter},
        freshButtonDifferent, oldHeaderConnected: oldHeader.isConnected, oldTargetConnected: oldTarget.isConnected};
    }

    try {
      await record('independent-section-bindings', {
        run: () => ({bindings: facts(), preGeometry: ['a', 'b'].map(name => ({
          name, height: get(ids[name]).getBoundingClientRect().height,
          overflowY: getComputedStyle(get(ids[name])).overflowY,
          verticalRange: get(ids[name]).scrollHeight - get(ids[name]).clientHeight,
        }))}),
        verify(before, after, details, expect) {
          expect('each header binds only its own content and the current main',
            JSON.stringify(details.bindings) === JSON.stringify([
              {header: 'header-a', target: 'pre-a', kind: 'region', currentMain: true},
              {header: 'header-b', target: 'pre-b', kind: 'region', currentMain: true},
              {header: 'header-editor', target: 'synthetic-editor', kind: 'editor', currentMain: true},
            ]));
          expect('tall overflow:auto pre blocks have no vertical self-scroll range',
            details.preGeometry.every(item => item.height > 240 && item.overflowY === 'auto' && item.verticalRange <= 1));
          expect('binding discovery does not scroll', unchanged(before, after, Object.keys(before.scrollTop)));
        },
      });
      await record('direct-jump-sticky-toolbar-geometry', {
        prepare: () => positionAt('a'),
        run: () => ({jumped: jumpRegionTop(bindings().find(item => item.target.id === ids.a), document, window)}),
        verify(before, after, details, expect) {
          expect('jumpRegionTop accepts the live region binding', details.jumped === true);
          aligned('a', before, after, expect);
        },
      });
      await record('future-unpinned-header-does-not-add-scroll-compensation', {
        prepare() {
          // Isolate the future header: the target's own header stays in normal flow.
          get('header-a').style.position = 'static';
          const future = document.createElement('header');
          future.id = 'synthetic-future-header';
          future.textContent = 'Synthetic future sticky header, not currently pinned';
          future.style.cssText = 'position:sticky;top:0;height:180px;background:#dce6f8';
          main().querySelector('.tail').before(future);
          positionAt('a');
        },
        run() {
          const futureBefore = rect(get('synthetic-future-header'));
          const jumped = jumpRegionTop(bindings().find(item => item.target.id === ids.a), document, window);
          return {jumped, futureRect: {before: futureBefore, after: rect(get('synthetic-future-header'))},
            expectedTargetTop: rect(get('synthetic-toolbar')).bottom + 12};
        },
        verify(before, after, details, expect) {
          expect('jumpRegionTop accepts the region with a static local header', details.jumped === true);
          expect('the future sticky header remains below the visible scrollport',
            details.futureRect.before.top >= before.visibility.a.port.bottom
              && details.futureRect.after.top >= after.visibility.a.port.bottom);
          expect('the future header contributes no visible obstruction',
            !after.visibility.a.pinnedHeaders.some(item => item.id === 'synthetic-future-header'));
          expect('only the visible toolbar and 12px gap determine the content start',
            Math.abs(after.targetRect.a.top - details.expectedTargetTop) <= 0.5);
          aligned('a', before, after, expect);
        },
        cleanup() {
          get('synthetic-future-header')?.remove();
          get('header-a').style.removeProperty('position');
        },
      });
      await record('repeat-install-deduplicates', {
        run() {
          const previousOwner = syntheticOwner();
          const previousSession = installJumpToTop({doc: document, win: window, owner: previousOwner});
          const firstCount = hosts().length;
          const oldButtons = Object.keys(ids).map(button);
          owner = syntheticOwner();
          session = installJumpToTop({doc: document, win: window, owner});
          oldButtons.forEach(item => { retiredButtons.add(item); item?.click(); });
          const previousResources = previousOwner.stats();
          previousOwner.dispose();
          return {firstCount, secondCount: hosts().length, previousMounted: previousSession.isMounted(),
            currentMounted: session.isMounted(), previousResources, currentResources: owner.stats(),
            placementCorrect: Object.keys(ids).every(name => get(`header-${name}`).querySelector(OWN)
              ?.nextElementSibling?.matches('button[aria-label="Open editor"]')),
            unrelatedCount: document.querySelectorAll(`#synthetic-toolbar ${OWN},#unrelated-header ${OWN},#synthetic-banner ${OWN}`).length};
        },
        verify(before, after, details, expect) {
          expect('both installs have exactly three local buttons', details.firstCount === 3 && details.secondCount === 3);
          expect('the previous session releases its listeners and observer', !details.previousMounted && emptyResources([details.previousResources]));
          expect('only one active session owns three click listeners and one observer', details.currentMounted
            && details.currentResources.clickListeners === 3 && details.currentResources.observers === 1
            && details.currentResources.windowListeners === 4);
          expect('buttons precede their own Open editor action', details.placementCorrect);
          expect('unrelated headers receive no local button', details.unrelatedCount === 0);
          expect('retired buttons do not scroll', unchanged(before, after, Object.keys(before.scrollTop)));
        },
      });
      for (const name of ['a', 'b']) await record(`header-${name}-jumps-only-to-own-region`, {
        prepare: () => positionAt(name),
        run: () => { click(name); return {bindings: facts()}; },
        verify(before, after, details, expect) {
          aligned(name, before, after, expect);
          expect('the two content starts stay distinct', Math.abs(after.targetRect.a.top - after.targetRect.b.top) > 1000);
          expect('the clicked header still binds its own target', details.bindings.some(item =>
            item.header === `header-${name}` && item.target === ids[name]));
        },
      });
      await record('textarea-scroll-preserves-value-and-selection', {
        prepare() {
          const editor = get(ids.editor);
          editor.focus({preventScroll: true});
          editor.setSelectionRange(9, 27, 'backward');
          positionAt('editor', -140);
          editor.scrollTop = 720;
          savedEditor = editorState();
        },
        run() {
          click('editor');
          const current = editorState();
          return {valueUnchanged: current.value === savedEditor.value,
            selectionUnchanged: current.start === savedEditor.start && current.end === savedEditor.end
              && current.direction === savedEditor.direction};
        },
        verify(before, after, details, expect) {
          expect('only textarea scrolls to its own zero', before.scrollTop.editor > 0 && after.scrollTop.editor === 0
            && unchanged(before, after, ['document', 'main', 'a', 'b']));
          expect('textarea value and selection stay byte-for-byte unchanged', details.valueUnchanged && details.selectionUnchanged);
          expect('textarea outer layout is unchanged', JSON.stringify(before.targetRect.editor) === JSON.stringify(after.targetRect.editor));
        },
      });
      for (const kind of ['header', 'target']) await record(`react-${kind}-replacement`, {
        prepare: () => positionAt('a'),
        run: () => replaceAndRecover(kind),
        verify(before, after, details, expect) {
          expect('stale button cannot move the current region before refresh', details.staleScrollTop.before === details.staleScrollTop.after);
          expect('the replacement case exercises the intended stale identity', kind === 'header'
            ? !details.staleConnectedAtClick && !details.oldHeaderConnected && details.oldTargetConnected
            : details.staleConnectedAtClick && details.oldHeaderConnected && !details.oldTargetConnected);
          expect('observer refresh mounts a new working button', details.freshButtonDifferent && hosts().length === 3);
          aligned('a', before, after, expect);
        },
      });
      await record('removed-host-alone-is-restored-without-duplicate-listeners', {
        prepare: () => positionAt('a'),
        async run() {
          const oldButton = button('a');
          const oldHost = get('header-a').querySelector(OWN);
          retiredButtons.add(oldButton);
          // No header/target mutation, click or manual refresh may help recovery.
          oldHost.remove();
          await waitForFreshButtons();
          const callsBefore = owner.stats().listenerCalls;
          const staleBefore = main().scrollTop;
          oldButton.click();
          const staleAfter = main().scrollTop;
          const staleListenerRemoved = owner.stats().listenerCalls === callsBefore;
          const freshButtonDifferent = button('a') !== oldButton;
          click('a');
          return {oldHostConnected: oldHost.isConnected, freshButtonDifferent, staleListenerRemoved,
            staleScrollTop: {before: staleBefore, after: staleAfter}, count: hosts().length, resources: owner.stats()};
        },
        verify(before, after, details, expect) {
          expect('removing only the owned host causes observer-driven recovery',
            !details.oldHostConnected && details.freshButtonDifferent && details.count === 3);
          expect('the removed host leaves no active click listener', details.staleListenerRemoved
            && details.staleScrollTop.before === details.staleScrollTop.after && details.resources.clickListeners === 3);
          aligned('a', before, after, expect);
        },
      });
      await record('spa-main-replacement', {
        prepare: () => positionAt('b'),
        async run() {
          const previous = main();
          const stale = button('b');
          retiredButtons.add(stale);
          const replacement = previous.cloneNode(true);
          replacement.querySelectorAll(OWN).forEach(item => item.remove());
          replacement.dataset.syntheticRoute = 'replacement';
          previous.replaceWith(replacement);
          positionAt('b');
          const staleBefore = main().scrollTop;
          stale.click();
          const staleAfter = main().scrollTop;
          await waitForFreshButtons();
          click('b');
          return {oldMainConnected: previous.isConnected, staleButtonConnected: stale.isConnected,
            staleScrollTop: {before: staleBefore, after: staleAfter}, currentBindings: facts(), count: hosts().length};
        },
        verify(before, after, details, expect) {
          expect('old main and old button are detached', !details.oldMainConnected && !details.staleButtonConnected);
          expect('the old button cannot scroll the replacement main', details.staleScrollTop.before === details.staleScrollTop.after);
          expect('all three bindings recover under the replacement main', details.count === 3
            && details.currentBindings.length === 3 && details.currentBindings.every(item => item.currentMain));
          aligned('b', before, after, expect);
        },
      });
      await record('aria-controls-target-id-change-invalidates-and-recovers', {
        async prepare() {
          get('header-a').querySelector('button[aria-label="Open editor"]').setAttribute('aria-controls', ids.a);
          // Drain this earlier aria-controls notification before changing only id.
          await pause(160);
          await waitForFreshButtons();
          positionAt('a');
        },
        async run() {
          const anchor = get('header-a').querySelector('button[aria-label="Open editor"]');
          const target = get(ids.a);
          const oldButton = button('a');
          retiredButtons.add(oldButton);
          target.id = 'pre-a-renamed';
          ids.a = target.id;
          // Do not click the stale button: its fallback schedule could mask an
          // observer that fails to watch id changes.
          await waitForCondition(() => hosts().length === 2 && !button('a')
            && !bindings().some(item => item.header.id === 'header-a'));
          const invalidatedCount = hosts().length;
          const invalidatedListeners = owner.stats().clickListeners;
          const callsBefore = owner.stats().listenerCalls;
          const staleBefore = main().scrollTop;
          oldButton.click();
          const staleAfter = main().scrollTop;
          const staleListenerRemoved = owner.stats().listenerCalls === callsBefore;
          anchor.setAttribute('aria-controls', ids.a);
          await waitForFreshButtons();
          click('a');
          return {sameTarget: target === get(ids.a), invalidatedCount, invalidatedListeners,
            staleListenerRemoved, staleScrollTop: {before: staleBefore, after: staleAfter},
            freshButtonDifferent: button('a') !== oldButton, currentBindings: facts(), count: hosts().length};
        },
        verify(before, after, details, expect) {
          expect('changing only the controlled target id retires the unresolved binding',
            details.sameTarget && details.invalidatedCount === 2 && details.invalidatedListeners === 2);
          expect('the retired button cannot invoke a listener or scroll', details.staleListenerRemoved
            && details.staleScrollTop.before === details.staleScrollTop.after);
          expect('updating aria-controls restores a new button for the renamed target', details.freshButtonDifferent
            && details.count === 3 && details.currentBindings.some(item => item.header === 'header-a' && item.target === ids.a));
          aligned('a', before, after, expect);
        },
      });
      await record('dispose-cleans-dom-observer-listeners-and-timers', {
        prepare: () => positionAt('b'),
        async run() {
          const stale = button('b');
          window.dispatchEvent(new Event('resize'));
          const pendingTimers = owner.stats().timers;
          owner.dispose();
          owner.dispose();
          const immediately = resources();
          const beforeCallbacks = owner.stats();
          stale.click();
          session.refresh();
          get('header-b').classList.add('synthetic-after-dispose');
          for (const type of ['resize', 'popstate', 'hashchange', 'pageshow']) window.dispatchEvent(new Event(type));
          await pause(160); // Beyond the program's 120ms debounce, including a queued pre-dispose refresh.
          return {pendingTimers, immediately, finalResources: resources(), count: hosts().length,
            mounted: session.isMounted(), callbacksUnchanged: owner.stats().observerCallbacks === beforeCallbacks.observerCallbacks
              && owner.stats().listenerCalls === beforeCallbacks.listenerCalls};
        },
        verify(before, after, details, expect) {
          expect('dispose exercises and cancels a pending refresh', details.pendingTimers > 0);
          expect('program disposal removes all listeners and disconnects observers', emptyResources(details.immediately));
          expect('DOM mutations and events cannot remount after disposal', details.count === 0 && !details.mounted
            && details.callbacksUnchanged && emptyResources(details.finalResources));
          expect('retired button and refresh cannot scroll after disposal', unchanged(before, after, Object.keys(before.scrollTop)));
        },
      });
      await record('short-content-has-no-local-button', {
        prepare() {
          for (const name of ['a', 'b']) get(ids[name]).textContent = `synthetic short ${name}`;
          get(ids.editor).value = 'synthetic short editor';
          main().scrollTop = 0;
        },
        run() {
          owner = syntheticOwner();
          session = installJumpToTop({doc: document, win: window, owner});
          const result = {bindings: facts(), count: hosts().length, mounted: session.isMounted(),
            editorRange: get(ids.editor).scrollHeight - get(ids.editor).clientHeight};
          owner.dispose();
          return {...result, finalResources: resources()};
        },
        verify(before, after, details, expect) {
          expect('short pre and textarea targets produce no binding or button', details.bindings.length === 0
            && details.count === 0 && !details.mounted && details.editorRange <= 1);
          expect('a no-button installation still disposes all resources', emptyResources(details.finalResources));
          expect('short-content checks do not scroll', unchanged(before, after, Object.keys(before.scrollTop)));
        },
      });
    } finally {
      for (const item of owners) item.forceCleanup();
    }
    return {synthetic: true, scope: 'Synthetic DOM layout and explicit owner lifecycle stubs only',
      productAuthority: 'NOT_TESTED', installation: 'NOT_TESTED', liveChatGPT: 'NOT_TESTED',
      sourceBytes: new TextEncoder().encode(moduleSource).length,
      status: cases.length === 14 && cases.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
      cases, harnessTeardown: {remainingHosts: hosts().length, resources: resources()}};
  }, source);
}
