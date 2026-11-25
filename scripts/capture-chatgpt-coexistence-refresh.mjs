// Run with the Page object from Ego's documented Node runtime. This measures
// DOM readiness only; installation identity and Authority receipts are separate.
import { setTimeout as pause } from 'node:timers/promises';

const controls = {
  prompt: ['[data-opendesk-prompts]', 'button.item', true],
  queue: ['[data-od-id="opendesk.chatgpt-send-queue.button"]', 'button.sq-send'],
  mindmap: ['[data-opendesk-chatgpt-mindmap="button"]', 'button'],
  toc: ['[data-opendesk-toc-root]', 'button.link[data-id]', true],
  navigation: ['[data-opendesk-ai-scroll-navigation="dock"]', 'button[data-scroll-nav-key]'],
};
const world = 'OpenDeskCoexistenceReadOnly';
const probe = '__odCoexistenceProbe';
const pollMs = 50;

function observe(controls, expected, probe, pollMs, windowMs) {
  if (window !== window.top || globalThis[probe]) return;
  const editor = '#prompt-textarea,[data-testid="composer-text-input"],[data-testid="composer-input"],form [contenteditable="true"][role="textbox"]';
  const user = '[data-message-author-role="user"],[data-message-role="user"],[data-content-search-unit-key$=":user"]';
  const answer = '[data-message-author-role="assistant"],[data-message-role="assistant"],[data-content-search-unit-key$=":assistant"]';
  const turn = '[data-testid^="conversation-turn"],article,[data-talvt-turn-state]';
  const actions = '[data-assistant-message-actions],[data-testid="copy-turn-action-button"],.turn-action-controls';
  const heading = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  const mindmapOwner = '[data-od-id="app.ai-reply-mindmap.lifecycle"],[data-od-id="opendesk.ai-reply-mindmap.lifecycle"]';
  const stream = '[data-is-streaming="true"],[aria-busy="true"],.result-streaming';
  const points = Object.fromEntries(Object.keys(controls).map(name => [name, { dependencyMs: null,
    mountMs: null, readyMs: null, usable: false, instances: 0, maxInstances: 0 }]));
  const closed = new WeakMap();
  const layout = node => Boolean(node?.getClientRects().length &&
    !node.closest('[hidden],[inert],[aria-hidden="true"]') && getComputedStyle(node).visibility === 'visible');
  function hit(button, host, root) {
    if (!layout(button) || button.matches(':disabled,[aria-disabled="true"]')) return false;
    const rect = button.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || rect.width <= 0 || rect.height <= 0 ||
      document.elementFromPoint(x, y) !== host) return false;
    const target = root.elementFromPoint(x, y);
    return target === button || button.contains(target);
  }
  const startedMs = performance.now();
  let timer, stopped = false, hidden = document.hidden, ticks = 0, workMs = 0, maxWorkMs = 0;
  let previousTick = startedMs, maxGapMs = 0, pendingClosed = [];
  document.addEventListener('visibilitychange', onVisibility);
  function onVisibility() { hidden ||= document.hidden; }
  function stop() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  }
  function sample() {
    const start = performance.now();
    maxGapMs = Math.max(maxGapMs, start - previousTick);
    previousTick = start;
    pendingClosed = [];
    if ((points.prompt.dependencyMs === null || points.queue.dependencyMs === null) &&
      [...document.querySelectorAll(editor)].some(layout)) {
      points.prompt.dependencyMs = points.queue.dependencyMs = performance.now();
    }
    if (['mindmap', 'toc', 'navigation'].some(key => points[key].dependencyMs === null)) {
      const replies = [...document.querySelectorAll(answer)].filter(layout);
      if (points.mindmap.dependencyMs === null && replies.some(reply => {
        const parent = reply.closest(turn) ?? reply;
        return (!parent.hasAttribute('data-talvt-turn-state') || parent.getAttribute('data-talvt-turn-state') === 'complete') &&
          !reply.matches(stream) && !reply.querySelector(stream) &&
          [...parent.querySelectorAll(actions)].some(node => !node.closest(user) && layout(node));
      })) points.mindmap.dependencyMs = performance.now();
      if (points.toc.dependencyMs === null && replies.some(reply => [...reply.querySelectorAll(heading)].some(layout))) {
        points.toc.dependencyMs = performance.now();
      }
      if (points.navigation.dependencyMs === null && replies.length &&
        [...document.querySelectorAll(user)].filter(node => !node.parentElement?.closest(user) && layout(node)).length >= 2) {
        points.navigation.dependencyMs = performance.now();
      }
    }
    for (const [name, [hostSelector, controlSelector, mayBeClosed]] of Object.entries(controls)) {
      const point = points[name];
      const hosts = [...document.querySelectorAll(hostSelector)];
      if (mayBeClosed && expected.includes(name) && hosts.some(host => !host.shadowRoot && !closed.has(host))) pendingClosed.push(name);
      let instances = hosts.length;
      if (name === 'mindmap') {
        // One button per distinct answer; the lifecycle count also catches
        // multiple installations mounting into disjoint replies.
        const perReply = new Map();
        for (const host of hosts) {
          const owner = host.closest(turn) ?? host.closest(answer) ?? host;
          perReply.set(owner, (perReply.get(owner) ?? 0) + 1);
        }
        instances = Math.max(document.querySelectorAll(mindmapOwner).length, ...perReply.values());
      }
      point.instances = instances;
      point.maxInstances = Math.max(point.maxInstances, instances);
      if (hosts.length) point.mountMs ??= performance.now();
      point.usable = hosts.some(host => {
        const root = host.shadowRoot ?? closed.get(host);
        return root && [...root.querySelectorAll(controlSelector)].some(button => hit(button, host, root));
      });
      if (point.usable && point.dependencyMs !== null) point.readyMs ??= performance.now();
    }
    const end = performance.now(), work = end - start;
    ticks++;
    workMs += work;
    maxWorkMs = Math.max(maxWorkMs, work);
    // Early readiness must not hide late duplicates or a supposedly disabled
    // entry in a single-feature group.
    if (end >= windowMs) stop();
    else timer = setTimeout(sample, Math.min(pollMs, Math.max(0, windowMs - end)));
  }
  globalThis[probe] = {
    bind(root) { if (root?.host?.isConnected) closed.set(root.host, root); },
    unboundHost(name) { return [...document.querySelectorAll(controls[name][0])].find(host => !host.shadowRoot && !closed.has(host)); },
    stop,
    read: () => ({ timeOrigin: performance.timeOrigin, viewport: [innerWidth, innerHeight], hidden, stopped,
      navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
      sampler: { startedMs, nowMs: performance.now(), pollMs, ticks, workMs, maxWorkMs, maxGapMs }, pendingClosed, points }),
  };
  sample();
}

export async function captureRefresh(page, group) {
  const windowMs = 15000;
  const names = Object.keys(controls);
  const expected = group === 'all' || group === 'slow' ? names : names.filter(name => group === 'single:' + name);
  if (!expected.length) throw new Error('Unknown refresh group: ' + group);
  const call = (method, params) => page.cdp(method, params, { timeout: 5000 });
  const before = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, href: location.href }));
  const source = '(' + observe.toString() + ')(' + [controls, expected, probe, pollMs, windowMs].map(x => JSON.stringify(x)).join(',') + ')';
  const { identifier } = await call('Page.addScriptToEvaluateOnNewDocument', { source, worldName: world });
  let contextId;
  const checkedRoots = new Set();
  async function evaluate(expression, returnByValue = true) {
    const { result, exceptionDetails } = await call('Runtime.evaluate', { contextId, expression,
      returnByValue, objectGroup: world });
    if (exceptionDetails) throw new Error('Refresh probe unavailable in the new document: ' + exceptionDetails.text);
    return returnByValue ? result.value : result.objectId;
  }
  try {
    await page.reload({ waitUntil: 'commit', timeout: 15000 });
    const deadline = Date.now() + windowMs + 5000;
    const { frameTree } = await call('Page.getFrameTree');
    const committed = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, href: location.href }));
    if (committed.href !== before.href || committed.timeOrigin === before.timeOrigin) {
      throw new Error('Refresh did not commit a new document for the same route');
    }
    ({ executionContextId: contextId } = await call('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: world }));
    while (Date.now() < deadline) {
      const result = await evaluate(probe + '.read()');
      if (result.timeOrigin !== committed.timeOrigin) throw new Error('Refresh probe document changed');
      if (result.stopped) return { group, ...result };
      for (const name of result.pendingClosed) {
        const remote = await evaluate(probe + '.unboundHost(' + JSON.stringify(name) + ')', false);
        if (!remote) continue;
        const { node } = await call('DOM.describeNode', { objectId: remote, depth: 1, pierce: true });
        const root = node.shadowRoots?.find(node => node.shadowRootType === 'closed');
        if (!root || checkedRoots.has(root.backendNodeId)) continue;
        const { object } = await call('DOM.resolveNode', { backendNodeId: root.backendNodeId, executionContextId: contextId, objectGroup: world });
        const bound = await call('Runtime.callFunctionOn', { objectId: object.objectId,
          functionDeclaration: 'function () { globalThis.' + probe + '.bind(this); }', returnByValue: true });
        if (bound.exceptionDetails) throw new Error('Could not observe the existing closed shadow root');
        checkedRoots.add(root.backendNodeId);
      }
      await pause(pollMs);
    }
    throw new Error('Refresh probe did not finish within the capture window');
  } finally {
    await call('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    if (contextId !== undefined) {
      await evaluate('globalThis.' + probe + '?.stop(); delete globalThis.' + probe).catch(() => {});
      await call('Runtime.releaseObjectGroup', { objectGroup: world }).catch(() => {});
    }
  }
}
