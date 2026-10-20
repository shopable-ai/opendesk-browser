import test from 'node:test';
import assert from 'node:assert/strict';
import * as conversation from '../src/conversation.js';

const {findConversationScroller, jumpConversationTop, chooseConversationHeader,
  findHeaderAction} = conversation;

const rect = (width = 1000, top = 8, left = 0) =>
  ({width, height: 46, top, left, right: left + width, bottom: top + 46});
const win = {innerHeight: 900, innerWidth: 1200, getComputedStyle: node => node.style};

function header({width = 900, top = 8, editor = false, parent = null,
  position = 'static'} = {}) {
  const toolbar = element({tag: 'header', parent, top, position, height: 46});
  toolbar.getBoundingClientRect = () => rect(width, top);
  const editButton = element({tag: 'button', parent: toolbar, height: 34,
    attributes: editor ? {'aria-label': 'Open editor'} : {}});
  editButton.getBoundingClientRect = () => rect(34, top, 780);
  return toolbar;
}

test('multiple headers: prefer the unique header with Open editor', () => {
  const a = header({width: 1100});
  const b = header({width: 700, editor: true});
  const doc = {querySelectorAll: selector => selector === 'header' ? [a, b] : []};
  const main = {contains: () => true, getBoundingClientRect: () => rect(1200)};
  assert.equal(chooseConversationHeader(doc, win, main), b);
  assert.ok(findHeaderAction(b, win));
});

test('ambiguous Open editor headers fail closed, not duplicated', () => {
  const a = header({editor: true});
  const b = header({editor: true});
  const doc = {querySelectorAll: () => [a, b]};
  const main = {contains: () => true, getBoundingClientRect: () => rect(1200)};
  assert.equal(chooseConversationHeader(doc, win, main), null);
});

function element({tag = 'div', attributes = {}, parent = null, top = 100,
  height = 480, contentTop = null,
  scrollHeight = height, scrollTop = 0, scrollLeft = 0, clientTop = 0,
  overflowY = 'visible', position = 'static', connected = true} = {}) {
  const attrs = new Map(Object.entries(attributes));
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), isConnected: connected,
    parentElement: null, children: [],
    scrollHeight, clientHeight: height, clientTop, scrollTop, scrollLeft,
    style: {display: 'block', visibility: 'visible', overflowY, position,
      top: position === 'sticky' ? '0px' : 'auto'},
    calls: [],
    get id() { return node.getAttribute('id') || ''; },
    get nextElementSibling() {
      const siblings = node.parentElement?.children || [];
      return siblings[siblings.indexOf(node) + 1] || null;
    },
    getAttribute: name => attrs.get(name) ?? null,
    hasAttribute: name => attrs.has(name),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    matches(selector) {
      // The adapter uses simple tag/attribute selector lists, with no combinators.
      return selector.split(',').some(part => {
        const simple = part.trim();
        const tagMatch = simple.match(/^[a-z][a-z0-9-]*/i);
        if (tagMatch && tagMatch[0].toUpperCase() !== node.tagName) return false;
        const attributes = [...simple.matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)];
        if (!tagMatch && !attributes.length) return false;
        return attributes.every(([, name, operator, value]) => {
          const actual = node.getAttribute(name);
          if (actual === null) return false;
          return !operator || (operator === '^=' ? actual.startsWith(value) : actual === value);
        });
      });
    },
    closest(selector) {
      for (let current = node; current; current = current.parentElement) {
        if (current.matches?.(selector)) return current;
      }
      return null;
    },
    contains(other) {
      for (let current = other; current; current = current.parentElement) {
        if (current === node) return true;
      }
      return false;
    },
    append(...children) {
      for (const child of children) {
        if (child.parentElement) {
          const siblings = child.parentElement.children;
          siblings.splice(siblings.indexOf(child), 1);
        }
        child.parentElement = node;
        child.isConnected = node.isConnected;
        node.children.push(child);
      }
    },
    before(other) {
      other.remove();
      other.parentElement = node.parentElement;
      other.isConnected = node.isConnected;
      const siblings = node.parentElement.children;
      siblings.splice(siblings.indexOf(node), 0, other);
    },
    remove() {
      if (node.parentElement) {
        const siblings = node.parentElement.children;
        siblings.splice(siblings.indexOf(node), 1);
      }
      node.parentElement = null;
      node.isConnected = false;
    },
    attachShadow: () => (node.shadowRoot = element({connected: node.isConnected})),
    querySelector: selector => node.querySelectorAll(selector)[0] || null,
    querySelectorAll(selector) {
      return node.children.flatMap(child => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
      ]);
    },
    getBoundingClientRect() {
      // Content moves with its scroller; fixed/sticky fixtures use a fixed top.
      const y = contentTop === null ? top :
        node.parentElement.getBoundingClientRect().top + node.parentElement.clientTop +
        contentTop - node.parentElement.scrollTop;
      return {...rect(1000, y), height, bottom: y + height};
    },
    scrollTo(options) {
      node.calls.push({...options});
      if (options.top !== undefined) node.scrollTop = options.top;
      if (options.left !== undefined) node.scrollLeft = options.left;
    }
  };
  parent?.append(node);
  return node;
}

function environment({rootHeight = 3200, rootTop = 1200, rootLeft = 41} = {}) {
  const root = element({tag: 'html', top: 0, height: 900, scrollHeight: rootHeight,
    scrollTop: rootTop, scrollLeft: rootLeft, overflowY: 'auto'});
  const body = element({tag: 'body', parent: root, height: 900});
  const doc = {body, documentElement: root, scrollingElement: root,
    createElement: tag => element({tag, connected: false}),
    createElementNS: (_namespace, tag) => doc.createElement(tag),
    querySelector: selector => doc.querySelectorAll(selector)[0] || null,
    querySelectorAll: selector => [
      ...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)
    ]};
  const view = {
    innerHeight: 900, innerWidth: 1200,
    getComputedStyle: node => node.style,
    scrollTo: options => root.scrollTo(options)
  };
  return {root, doc, view};
}

function controlledEditors(count = 1) {
  const env = environment();
  const main = element({tag: 'main', parent: env.doc.body, overflowY: 'auto',
    scrollHeight: 2400, scrollTop: 940, scrollLeft: 63});
  const rows = Array.from({length: count}, (_, index) => {
    const turn = element({tag: 'article', parent: main, height: 1000,
      attributes: {'data-testid': `conversation-turn-${index + 1}`}});
    const toolbar = header({parent: turn, top: 100, position: 'sticky', editor: true});
    const target = element({tag: 'textarea', parent: turn, height: 180,
      scrollHeight: 1600, scrollTop: 500, scrollLeft: 27, overflowY: 'auto',
      attributes: {id: `long-editor-${index + 1}`}});
    const anchor = toolbar.querySelector('button');
    anchor.setAttribute('aria-controls', target.id);
    return {toolbar, anchor, target};
  });
  return {...env, main, rows};
}

function observerOwner() {
  let callback, options;
  const timers = [];
  return {
    on: () => () => {}, onDispose() {},
    observe(_target, listener, config) {
      callback = listener;
      options = config;
      return {disconnect() { callback = null; }};
    },
    setTimeout: callback => timers.push(callback),
    emit(record) {
      if (record.type === 'attributes' && (!options.attributes ||
          (options.attributeFilter && !options.attributeFilter.includes(record.attributeName)))) return;
      if (record.type === 'childList' && !options.childList) return;
      callback?.([record]);
    },
    flush() { while (timers.length) timers.shift()(); }
  };
}

function region({contentTop = 760, scrollerTop = 100, clientTop = 0,
  scrollHeight = 2400, height = 480, scrollTop = 940, scrollLeft = 63} = {}) {
  const env = environment();
  const scroller = element({tag: 'main', parent: env.doc.body, top: scrollerTop,
    height, clientTop, scrollHeight, scrollTop, scrollLeft, overflowY: 'auto'});
  const target = element({parent: scroller, contentTop, height: 180,
    attributes: {'data-testid': 'conversation-turn-1'}});
  const main = scroller;
  return {...env, scroller, target, main,
    binding: {target, header: null, main, kind: 'region'}};
}

function assertScroll(node, top, left = 63) {
  assert.equal(node.scrollTop, top);
  assert.equal(node.scrollLeft, left, 'horizontal position must be preserved');
  assert.equal(node.calls.at(-1)?.top, top);
  assert.equal(node.calls.at(-1)?.behavior, 'instant');
}

test('conversation jump uses the first turn offset, not container top zero', () => {
  const {target, main, scroller, root, doc, view} = region();
  assert.equal(findConversationScroller(target, doc, view), scroller);
  assert.equal(jumpConversationTop(main, doc, view), true);
  assertScroll(scroller, 748);
  assert.equal(root.scrollTop, 1200);
  assert.deepEqual(root.calls, []);
});

test('region in the middle keeps its absolute content offset', () => {
  const {binding, scroller, root, doc, view} = region();
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
  assert.equal(root.scrollTop, 1200);
  assert.deepEqual(root.calls, []);
});

test('region jump defaults to kind region', () => {
  const {target, main, scroller, doc, view} = region();
  assert.equal(conversation.jumpRegionTop({target, header: null, main}, doc, view), true);
  assertScroll(scroller, 748);
});

for (const position of ['sticky', 'fixed']) {
  test(`${position} header only supplies occlusion, never the target coordinate`, () => {
    const {binding, scroller, doc, view} = region();
    binding.header = element({parent: scroller, top: 100, height: 46, position});
    assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
    assertScroll(scroller, 702);
    assert.equal(binding.header.getBoundingClientRect().top, 100);
    assert.equal(binding.target.getBoundingClientRect().top, 158);
  });
}

test('static header contributes no sticky occlusion', () => {
  const {binding, scroller, doc, view} = region();
  binding.header = element({parent: scroller, top: 100, height: 46});
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
});

test('sticky header below the actual landing point contributes no predicted occlusion', () => {
  const {binding, scroller, doc, view} = region();
  binding.header = element({tag: 'header', parent: scroller, contentTop: 1100,
    height: 46, position: 'sticky'});
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
  assert.ok(binding.header.getBoundingClientRect().top > scroller.getBoundingClientRect().top);
  assert.ok(scroller.calls.length <= 2, 'at most one bounded landing correction');
});

test('later sticky unpins at the content start and repeated clicks keep the same landing', () => {
  const {binding, scroller, doc, view} = region();
  binding.header = element({tag: 'header', parent: scroller, height: 46, position: 'sticky'});
  binding.header.getBoundingClientRect = () =>
    rect(1000, Math.max(100, 100 + 900 - scroller.scrollTop));
  assert.equal(binding.header.getBoundingClientRect().top, 100, 'initially pinned at the old reading position');
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
  assert.equal(binding.header.getBoundingClientRect().top, 252, 'unpinned at the content start');
  const landing = binding.target.getBoundingClientRect();
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
  assert.deepEqual(binding.target.getBoundingClientRect(), landing);
});

test('header in a parallel column does not obstruct the target inside the same scrollport', () => {
  const {binding, target, scroller, doc, view} = region();
  const contentRect = target.getBoundingClientRect;
  target.getBoundingClientRect = () => ({...contentRect(), left: 40, right: 400, width: 360});
  binding.header = element({tag: 'header', parent: scroller, height: 46, position: 'sticky'});
  binding.header.getBoundingClientRect = () => rect(300, 100, 600);
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
  assert.equal(target.getBoundingClientRect().top, 112);
});

test('sticky with an eight-pixel inset covering the first line gets one bounded correction', () => {
  const {binding, target, scroller, doc, view} = region();
  target.style.lineHeight = '20px';
  binding.header = element({tag: 'header', parent: scroller, top: 108,
    height: 46, position: 'sticky'});
  binding.header.style.top = '8px';
  // The canonical first line at y=112..132 overlaps the real bar at y=108..154.
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 694);
  assert.equal(target.getBoundingClientRect().top, binding.header.getBoundingClientRect().bottom + 12);
  assert.ok(scroller.calls.length <= 2, 'at most one bounded landing correction');
});

test('fixed header covering the entire scrollport returns false without moving other containers', () => {
  const {binding, scroller: outer, root, doc, view} = region();
  const inner = element({parent: outer, top: 100, height: 480, scrollHeight: 2400,
    scrollTop: 940, scrollLeft: 29, overflowY: 'auto'});
  binding.target = element({parent: inner, contentTop: 760, height: 180});
  binding.header = element({tag: 'header', parent: outer, top: 100,
    height: 480, position: 'fixed'});
  assert.equal(conversation.jumpRegionTop(binding, doc, view), false);
  assert.ok(inner.calls.length <= 2, 'at most two synchronous scrolls');
  assert.ok(inner.calls.every(call => call.behavior === 'instant'));
  assert.equal(inner.scrollLeft, 29);
  assert.equal(outer.scrollTop, 940);
  assert.equal(root.scrollTop, 1200);
  assert.deepEqual(outer.calls, []);
  assert.deepEqual(root.calls, []);
});

test('scroller border clientTop is subtracted from the target viewport rect', () => {
  const {binding, scroller, doc, view} = region({clientTop: 7});
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(scroller, 748);
});

test('nested region scrolls the nearest eligible container only', () => {
  const {binding, scroller: outer, root, doc, view} = region();
  const inner = element({parent: outer, top: 200, height: 240,
    scrollHeight: 1400, scrollTop: 500, scrollLeft: 29, overflowY: 'auto'});
  binding.target = element({parent: inner, contentTop: 430});
  assert.equal(findConversationScroller(binding.target, doc, view), inner);
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(inner, 418, 29);
  assert.equal(outer.scrollTop, 940);
  assert.deepEqual(outer.calls, []);
  assert.deepEqual(root.calls, []);
});

for (const overflowY of ['auto', 'scroll', 'overlay']) {
  test(`nearest overflow ${overflowY} is eligible even at scrollTop zero`, () => {
    const {target, scroller, doc, view} = region({scrollTop: 0});
    scroller.style.overflowY = overflowY;
    assert.equal(findConversationScroller(target, doc, view), scroller);
  });
}

for (const overflowY of ['visible', 'hidden', 'clip']) {
  test(`overflow ${overflowY} with nonzero scrollTop cannot steal the scroll target`, () => {
    const {binding, target, scroller, doc, view} = region();
    const wrapper = element({parent: scroller, scrollHeight: 1800,
      scrollTop: 300, overflowY});
    wrapper.append(target);
    assert.equal(findConversationScroller(target, doc, view), scroller);
    assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
    assert.deepEqual(wrapper.calls, []);
    assert.equal(wrapper.scrollTop, 300);
  });
}

test('includeSelf opts into the target scroller without changing the default', () => {
  const {target, scroller, doc, view} = region();
  Object.assign(target, {scrollHeight: 1600, clientHeight: 180, scrollTop: 500});
  target.style.overflowY = 'auto';
  assert.equal(findConversationScroller(target, doc, view), scroller);
  assert.equal(findConversationScroller(target, doc, view, {includeSelf: true}), target);
});

test('editor scrolls its own content to zero and leaves outer containers alone', () => {
  const {binding, target, scroller, root, doc, view} = region();
  binding.kind = 'editor';
  Object.assign(target, {scrollHeight: 1600, clientHeight: 180,
    scrollTop: 500, scrollLeft: 27});
  target.style.overflowY = 'auto';
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(target, 0, 27);
  assert.equal(scroller.scrollTop, 940);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(root.calls, []);
});

test('editor without its own scroll range returns false instead of scrolling a parent', () => {
  const {binding, target, scroller, root, doc, view} = region();
  binding.kind = 'editor';
  target.style.overflowY = 'auto';
  assert.equal(conversation.jumpRegionTop(binding, doc, view), false);
  assert.deepEqual(target.calls, []);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(root.calls, []);
});

for (const overflowY of ['visible', 'hidden']) {
  test(`editor overflow ${overflowY} with a range neither mounts nor scrolls a parent`, t => {
    const {doc, view, root, main, rows: [{toolbar, anchor, target}]} = controlledEditors();
    target.style.overflowY = overflowY;
    assert.ok(target.scrollHeight > target.clientHeight);
    assert.equal(toolbar.querySelector('button[aria-controls]'), anchor);
    assert.deepEqual(conversation.findRegionBindings(doc, view), []);
    const session = conversation.installJumpToTop({doc, win: view, owner: observerOwner()});
    t.after(() => session.dispose());
    assert.equal(session.isMounted(), false);
    assert.ok(!toolbar.querySelector('[data-opendesk-chatgpt-jump-top]'));
    assert.equal(conversation.jumpRegionTop({target, header: toolbar, main, kind: 'editor'}, doc, view), false);
    assert.equal(target.scrollTop, 500);
    assert.equal(main.scrollTop, 940);
    assert.equal(root.scrollTop, 1200);
    assert.deepEqual(target.calls, []);
    assert.deepEqual(main.calls, []);
    assert.deepEqual(root.calls, []);
  });
}

test('no scroll range returns false without a scroll operation', () => {
  const {binding, target, scroller, root, doc, view} = region({scrollHeight: 480, scrollTop: 0});
  root.scrollHeight = root.clientHeight;
  root.scrollTop = 0;
  assert.equal(findConversationScroller(target, doc, view), scroller);
  assert.equal(conversation.jumpRegionTop(binding, doc, view), false);
  assert.equal(jumpConversationTop(binding.main, doc, view), false);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(root.calls, []);
});

test('empty inner overflow remains a boundary instead of scrolling a parent with range', () => {
  const {binding, target, scroller, root, doc, view} = region();
  const inner = element({parent: scroller, height: 240, scrollHeight: 240, overflowY: 'auto'});
  inner.append(target);
  assert.equal(findConversationScroller(target, doc, view), inner);
  assert.equal(conversation.jumpRegionTop(binding, doc, view), false);
  assert.equal(jumpConversationTop(binding.main, doc, view), false);
  assert.deepEqual(inner.calls, []);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(root.calls, []);
  assert.equal(scroller.scrollTop, 940);
  assert.equal(root.scrollTop, 1200);
});

test('detached target returns false without scrolling connected ancestors', () => {
  const {binding, target, scroller, root, doc, view} = region();
  target.isConnected = false;
  assert.equal(conversation.jumpRegionTop(binding, doc, view), false);
  assert.equal(jumpConversationTop(binding.main, doc, view), false);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(root.calls, []);
});

for (const [contentTop, expected] of [[5, 0], [2600, 1920]]) {
  test(`absolute offset ${contentTop} is clamped to scroll range at ${expected}`, () => {
    const {binding, scroller, doc, view} = region({contentTop});
    assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
    assertScroll(scroller, expected);
  });
}

test('document scrolling preserves horizontal position and uses target geometry', () => {
  const {root, doc, view} = environment();
  const target = element({parent: root, contentTop: 1700});
  const main = root;
  assert.equal(conversation.jumpRegionTop({target, header: null, main}, doc, view), true);
  assertScroll(root, 1688, 41);
});

test('repeated region jumps are idempotent as the target rect moves with scrolling', () => {
  const {binding, target, scroller, doc, view} = region({clientTop: 7});
  binding.header = element({parent: scroller, top: 107, height: 46, position: 'sticky'});
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  const firstTop = scroller.scrollTop;
  const firstRect = target.getBoundingClientRect();
  assert.ok(firstTop > 0, 'this region starts below the container origin');
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assert.equal(scroller.scrollTop, firstTop);
  assert.deepEqual(target.getBoundingClientRect(), firstRect);
  assert.equal(scroller.scrollLeft, 63);
  assert.ok(scroller.calls.every(call => call.behavior === 'instant'));
});

test('region bindings retain a content target distinct from the sticky header', () => {
  const {doc, view} = environment();
  const main = element({tag: 'main', parent: doc.body, overflowY: 'auto',
    scrollHeight: 3000, scrollTop: 600, scrollLeft: 63});
  const turn = element({tag: 'article', parent: main, contentTop: 650, height: 1000,
    attributes: {'data-testid': 'conversation-turn-1'}});
  const toolbar = header({parent: turn, top: 100, position: 'sticky', editor: true});
  const target = element({tag: 'pre', parent: turn, contentTop: 60, height: 800,
    attributes: {id: 'long-local-content'}});
  const anchor = toolbar.querySelector('button[aria-label="Open editor"]');
  assert.equal(toolbar.querySelector('button[aria-controls]'), null);
  const query = doc.querySelectorAll;
  let scans = 0;
  doc.querySelectorAll = selector => {
    if (selector === '[id]') scans++;
    return query(selector);
  };
  const bindings = conversation.findRegionBindings(doc, view);
  assert.equal(scans, 0, 'without controls, local discovery must not scan document IDs');
  assert.deepEqual(bindings, [{header: toolbar, anchor, target, main, kind: 'region'}]);
  const [binding] = bindings;
  assert.equal(binding.anchor, findHeaderAction(toolbar, view));
  assert.notEqual(binding.target, toolbar, 'sticky visual position is not content position');
  assert.equal(conversation.jumpRegionTop(binding, doc, view), true);
  assertScroll(main, 652);
});

test('region bindings resolve an explicitly controlled editor and scroll only its content', () => {
  const {doc, view, root, main, rows: [{toolbar, anchor, target}]} = controlledEditors();
  const bindings = conversation.findRegionBindings(doc, view);
  assert.deepEqual(bindings, [{header: toolbar, anchor, target, main, kind: 'editor'}]);
  assert.equal(conversation.jumpRegionTop(bindings[0], doc, view), true);
  assertScroll(target, 0, 27);
  assert.equal(main.scrollTop, 940);
  assert.deepEqual(main.calls, []);
  assert.deepEqual(root.calls, []);
});

test('removing only the injected host schedules its restoration beside the same anchor', t => {
  const {doc, view, rows: [{toolbar, anchor}]} = controlledEditors();
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner});
  t.after(() => session.dispose());
  const selector = '[data-opendesk-chatgpt-jump-top]';
  const previous = toolbar.querySelector(selector);
  assert.ok(previous?.isConnected);
  previous.remove();
  owner.emit({type: 'childList', target: toolbar, addedNodes: [], removedNodes: [previous]});
  owner.flush();
  const restored = toolbar.querySelector(selector);
  assert.ok(restored?.isConnected, 'React removing the host must trigger a remount');
  assert.notEqual(restored, previous);
  assert.equal(restored.nextElementSibling, anchor);
  assert.equal(toolbar.querySelectorAll(selector).length, 1);
});

test('target id changes retire and restore the aria-controls binding through observation', t => {
  const {doc, view, rows: [{toolbar, target}]} = controlledEditors();
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner});
  t.after(() => session.dispose());
  const selector = '[data-opendesk-chatgpt-jump-top]';
  const originalId = target.id;
  assert.ok(toolbar.querySelector(selector));
  target.setAttribute('id', 'unreferenced-editor');
  owner.emit({type: 'attributes', attributeName: 'id', target});
  owner.flush();
  assert.ok(!toolbar.querySelector(selector), 'id changes must retire the stale binding');
  assert.equal(session.isMounted(), false);
  target.setAttribute('id', originalId);
  owner.emit({type: 'attributes', attributeName: 'id', target});
  owner.flush();
  assert.ok(toolbar.querySelector(selector)?.isConnected);
  assert.equal(session.isMounted(), true);
});

test('multiple aria-controls bindings share one document ID index per discovery', () => {
  const {doc, view, rows} = controlledEditors(2);
  const query = doc.querySelectorAll;
  let scans = 0;
  doc.querySelectorAll = selector => {
    if (selector === '[id]') scans++;
    return query(selector);
  };
  const bindings = conversation.findRegionBindings(doc, view);
  assert.deepEqual(bindings.map(binding => binding.target), rows.map(row => row.target));
  assert.equal(scans, 1);
});

test('no discoverable regions yields an empty binding list', () => {
  const {doc, view} = environment();
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
});

test('no conversation turns means no scroll', () => {
  const doc = {body: {}, documentElement: {}, scrollingElement: {}};
  assert.equal(jumpConversationTop({querySelector: () => null}, doc, win), false);
});
