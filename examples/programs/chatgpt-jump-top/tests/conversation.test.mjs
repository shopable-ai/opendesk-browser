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
    parentElement: null, children: [], dataset: {},
    scrollHeight, clientHeight: height, clientTop, scrollTop, scrollLeft,
    style: {display: 'block', visibility: 'visible', overflowY, position,
      top: position === 'sticky' ? '0px' : 'auto'},
    calls: [],
    get ownerDocument() {
      return node.parentElement?.ownerDocument || node.document;
    },
    get childNodes() { return node.children; },
    get lastElementChild() { return node.children.at(-1) || null; },
    get id() { return node.getAttribute('id') || ''; },
    get nextElementSibling() {
      const siblings = node.parentElement?.children || [];
      return siblings[siblings.indexOf(node) + 1] || null;
    },
    getAttribute: name => attrs.get(name) ?? null,
    hasAttribute: name => attrs.has(name),
    removeAttribute: name => attrs.delete(name),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    matches(selector) {
      // The adapter uses simple tag/attribute selector lists, with no combinators.
      return selector.split(',').some(part => {
        const simple = part.trim();
        const tagMatch = simple.match(/^[a-z][a-z0-9-]*/i);
        if (tagMatch && tagMatch[0].toUpperCase() !== node.tagName) return false;
        const attributes = [...simple.matchAll(/\[([\w-]+)(?:([\^$]?=)"([^"]*)")?\]/g)];
        if (!tagMatch && !attributes.length) return false;
        return attributes.every(([, name, operator, value]) => {
          const actual = node.getAttribute(name);
          if (actual === null) return false;
          return !operator || (operator === '^=' ? actual.startsWith(value)
            : operator === '$=' ? actual.endsWith(value) : actual === value);
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
        const connect = item => {
          item.isConnected = node.isConnected;
          item.children.forEach(connect);
        };
        connect(child);
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
  root.document = doc;
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
  const timers = [], disposals = [], listeners = new Map();
  return {
    on(target, type, listener) {
      const events = listeners.get(target) || new Map();
      const handlers = events.get(type) || new Set();
      handlers.add(listener);events.set(type, handlers);listeners.set(target, events);
      return () => handlers.delete(listener);
    },
    click(target) {
      for (const listener of listeners.get(target)?.get('click') || [])
        listener({currentTarget: target, isTrusted: true, preventDefault() {}, stopPropagation() {}});
    },
    onDispose(cleanup) { disposals.push(cleanup); },
    dispose() { disposals.forEach(cleanup => cleanup()); },
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

test('natural-height editable writing block uses its local Chinese action and outer scrollport', () => {
  const {doc, view, root} = environment();
  const main = element({tag: 'main', parent: doc.body, overflowY: 'auto',
    scrollHeight: 17677, scrollTop: 10951, scrollLeft: 63});
  const turn = element({parent: main, contentTop: 5200, height: 11564,
    attributes: {'data-content-search-unit-key': 'writing-turn'}});
  const scope = element({parent: turn, contentTop: 0, height: 11564, position: 'relative'});
  const toolbar = header({parent: scope, top: 100, position: 'sticky', editor: true});
  const anchor = toolbar.querySelector('button');
  anchor.setAttribute('aria-label', '打开编辑器');
  element({tag: 'button', parent: toolbar, height: 34, attributes: {'aria-label': '其他操作'}});
  const target = element({parent: scope, contentTop: 52, height: 11496,
    attributes: {contenteditable: 'true'}});
  element({tag: 'pre', parent: target, height: 800});
  const bindings = conversation.findRegionBindings(doc, view);
  assert.deepEqual(bindings, [{header: toolbar, anchor, target, main, kind: 'region'}]);
  assert.equal(conversation.jumpRegionTop(bindings[0], doc, view), true);
  assert.equal(target.getBoundingClientRect().top, 158, 'content clears the sticky toolbar');
  assert.equal(main.scrollLeft, 63);
  assert.ok(main.scrollTop > 0, 'local content is not the conversation origin');
  assert.deepEqual(target.calls, []);
  assert.deepEqual(root.calls, []);
});

test('Chinese editor toolbar with ambiguous content never becomes a conversation shortcut', () => {
  const {doc, view, main, rows: [{toolbar, anchor, target}]} = controlledEditors();
  anchor.setAttribute('aria-label', '打开编辑器');
  anchor.setAttribute('aria-controls', 'missing-target');
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
  assert.deepEqual(target.calls, []);
  assert.deepEqual(main.calls, []);
  element({tag: 'button', parent: toolbar, height: 34, attributes: {'aria-label': 'Open editor'}});
  assert.equal(findHeaderAction(toolbar, view), null, 'multiple editor actions are ambiguous');
});

test('a self-scrolling contenteditable retains editor scroll isolation', () => {
  const {doc, view, root, main, rows: [{toolbar, anchor, target}]} = controlledEditors();
  target.tagName = 'DIV';
  target.setAttribute('contenteditable', 'true');
  anchor.setAttribute('aria-label', '打开编辑器');
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

function writingViewer() {
  const env = environment();
  const main = element({tag: 'main', parent: env.doc.body, overflowY: 'auto',
    scrollHeight: 17677, scrollTop: 10951, scrollLeft: 63});
  element({tag: 'article', parent: main,
    attributes: {'data-testid': 'conversation-turn-1'}});
  const aside = element({tag: 'aside', parent: main});
  const section = element({tag: 'section', parent: aside});
  const toolbar = header({parent: section, top: 8});
  const close = toolbar.querySelector('button');
  close.setAttribute('aria-label', '关闭查看器');
  for (const label of ['复制', '撤销', '重做', '下载', '全屏']) {
    element({tag: 'button', parent: toolbar, height: 34,
      attributes: {'aria-label': label}});
  }
  const body = element({parent: section});
  const scroller = element({parent: body, top: 60, height: 899,
    scrollHeight: 11846, scrollTop: 8000, scrollLeft: 27, overflowY: 'auto'});
  const target = element({parent: scroller, contentTop: 24, height: 11684,
    attributes: {contenteditable: 'true'}});
  return {...env, main, aside, toolbar, close, scroller, target};
}

test('aside writing viewer scrolls its own body and never supplies the global header', () => {
  const {doc, view, root, main, toolbar, scroller, target} = writingViewer();
  assert.equal(chooseConversationHeader(doc, view, main), null);
  const bindings = conversation.findRegionBindings(doc, view);
  assert.deepEqual(bindings, [{header: toolbar, anchor: toolbar.children.at(-1),
    target, main, kind: 'region'}]);
  assert.equal(scroller.contains(toolbar), false, 'viewer toolbar is outside the scrollport');
  assert.equal(conversation.jumpRegionTop(bindings[0], doc, view), true);
  assertScroll(scroller, 12, 27);
  assert.equal(target.getBoundingClientRect().top, 72);
  assert.deepEqual(target.calls, []);
  assert.equal(main.scrollTop, 10951);
  assert.equal(root.scrollTop, 1200);
  assert.deepEqual(main.calls, []);
  assert.deepEqual(root.calls, []);
  const globalHeader = header({parent: main});
  assert.equal(chooseConversationHeader(doc, view, main), globalHeader);
});

test('ordinary navigation aside stays excluded even with editor content and a scrollport', () => {
  const {doc, view, root, main, toolbar, close, scroller} = writingViewer();
  close.setAttribute('aria-label', '关闭导航');
  assert.equal(findHeaderAction(toolbar, view), null);
  assert.equal(chooseConversationHeader(doc, view, main), null);
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(main.calls, []);
  assert.deepEqual(root.calls, []);
});

test('aside writing viewer rejects ambiguous multiple editors', () => {
  const {doc, view, root, main, toolbar, scroller} = writingViewer();
  element({tag: 'textarea', parent: scroller, height: 400});
  assert.equal(findHeaderAction(toolbar, view), null);
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
  assert.equal(chooseConversationHeader(doc, view, main), null);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(main.calls, []);
  assert.deepEqual(root.calls, []);
});

test('aside writing viewer without an inside scrollport cannot bind to the outer conversation', () => {
  const {doc, view, root, main, toolbar, scroller} = writingViewer();
  scroller.style.overflowY = 'visible';
  assert.equal(findHeaderAction(toolbar, view), null);
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
  assert.equal(chooseConversationHeader(doc, view, main), null);
  assert.deepEqual(main.calls, []);
  assert.deepEqual(root.calls, []);
});

test('aside writing viewer with an empty inner scrollport cannot fall through to a scrolling ancestor', () => {
  const {doc, view, root, main, aside, toolbar, scroller} = writingViewer();
  scroller.scrollHeight = scroller.clientHeight;
  scroller.scrollTop = 0;
  aside.style.overflowY = 'auto';
  aside.scrollHeight = 14000;
  aside.scrollTop = 300;
  assert.equal(findHeaderAction(toolbar, view), null);
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
  assert.equal(chooseConversationHeader(doc, view, main), null);
  assert.deepEqual(scroller.calls, []);
  assert.deepEqual(aside.calls, []);
  assert.deepEqual(main.calls, []);
  assert.deepEqual(root.calls, []);
});

test('no discoverable regions yields an empty binding list', () => {
  const {doc, view} = environment();
  assert.deepEqual(conversation.findRegionBindings(doc, view), []);
});

test('no conversation turns means no scroll', () => {
  const doc = {body: {}, documentElement: {}, scrollingElement: {}};
  assert.equal(jumpConversationTop({querySelector: () => null}, doc, win), false);
});

function nativeMessageActions(parent, labels) {
  const toolbar = element({parent, height: 40});
  const buttons = labels.map(label => {
    const wrapper = element({tag: 'span', parent: toolbar, height: 34});
    return element({tag: 'button', parent: wrapper, height: 34,
      attributes: {'aria-label': label}});
  });
  return {toolbar, buttons, anchor: buttons[0].parentElement};
}

function nativeMessages({assistant = false} = {}) {
  const env = environment();
  const main = element({tag: 'main', parent: env.doc.body, overflowY: 'auto',
    scrollHeight: 5000, scrollTop: 1400, scrollLeft: 63});
  const pair = element({parent: main, contentTop: 500, height: 3000});
  const user = element({parent: pair, contentTop: 0, height: 800,
    attributes: {'data-content-search-unit-key': 'user-message'}});
  const userActions = nativeMessageActions(user, ['复制消息', '共享提示', '编辑消息']);
  if (!assistant) return {...env, main, pair, user, target: user, ...userActions};
  const response = element({parent: pair, contentTop: 900, height: 1800});
  const content = element({parent: response, contentTop: 0, height: 1600});
  const target = element({parent: content, contentTop: 0, height: 1500,
    attributes: {'data-content-search-unit-key': 'assistant-message',
      'data-chatgpt-search-unit-key': 'assistant-message'}});
  const actions = nativeMessageActions(pair, ['复制', '评价回复', '重新生成回复']);
  return {...env, main, pair, user, userActions, target, ...actions};
}

const jumpHostSelector = '[data-opendesk-chatgpt-jump-top]';

test('native user message mounts beside copy wrapper and keeps content root as target', t => {
  const {doc, view, main, target, toolbar, anchor, buttons} = nativeMessages();
  assert.deepEqual(conversation.findRegionBindings(doc, view),
    [{header: toolbar, anchor, target, main, kind: 'region'}]);
  const session = conversation.installJumpToTop({doc, win: view, owner: observerOwner()});
  t.after(() => session.dispose());
  const host = toolbar.querySelector(jumpHostSelector);
  assert.ok(host?.isConnected);
  assert.equal(host.parentElement, toolbar);
  assert.equal(host.nextElementSibling, anchor);
  assert.equal(anchor.querySelector(jumpHostSelector), null, 'preserve native tooltip wrapper');
  session.refresh();
  assert.equal(toolbar.querySelectorAll(jumpHostSelector).length, 1);
  assert.deepEqual(toolbar.querySelectorAll('button'), buttons, 'native actions stay unchanged');
});

test('native user message rejects duplicate copy or editor markers', () => {
  for (const label of ['复制消息', '编辑消息']) {
    const {doc, view, target, toolbar} = nativeMessages();
    assert.equal(conversation.findRegionBindings(doc, view).length, 1);
    const wrapper = element({tag: 'span', parent: toolbar, height: 34});
    const duplicate = element({tag: 'button', parent: wrapper, height: 34,
      attributes: {'aria-label': label}});
    assert.deepEqual(conversation.findRegionBindings(doc, view), [], label);
    duplicate.remove();
    assert.equal(conversation.findRegionBindings(doc, view)[0].target, target);
  }
});

test('native assistant sibling footer targets assistant content instead of preceding user', t => {
  const {doc, view, root, main, pair, user, userActions, target, toolbar, anchor} =
    nativeMessages({assistant: true});
  assert.equal(target.parentElement.parentElement.parentElement, pair);
  assert.equal(pair.contains(user), true);
  assert.equal(target.contains(toolbar), false);
  const bindings = conversation.findRegionBindings(doc, view);
  assert.deepEqual(bindings, [
    {header: userActions.toolbar, anchor: userActions.anchor, target: user, main, kind: 'region'},
    {header: toolbar, anchor, target, main, kind: 'region', answerRoot: target}
  ]);
  const session = conversation.installJumpToTop({doc, win: view, owner: observerOwner()});
  t.after(() => session.dispose());
  assert.equal(toolbar.querySelector(jumpHostSelector)?.parentElement, toolbar.lastElementChild);
  assert.ok(toolbar.lastElementChild.hasAttribute('data-opendesk-chatgpt-answer-tools'));
  assert.equal(conversation.jumpRegionTop(bindings[1], doc, view), true);
  assertScroll(main, 1388);
  assert.equal(target.getBoundingClientRect().top, main.getBoundingClientRect().top + 12);
  assert.notEqual(user.getBoundingClientRect().top, target.getBoundingClientRect().top);
  assert.deepEqual(root.calls, []);
});

test('native assistant footer fails closed for multiple assistant roots or feedback markers', () => {
  for (const ambiguity of ['assistant', 'feedback']) {
    const {doc, view, pair, toolbar, user} = nativeMessages({assistant: true});
    assert.equal(conversation.findRegionBindings(doc, view).length, 2);
    if (ambiguity === 'assistant') {
      element({parent: pair, height: 900,
        attributes: {'data-content-search-unit-key': 'second-assistant',
          'data-chatgpt-search-unit-key': 'second-assistant'}});
    } else {
      element({tag: 'button', parent: toolbar, height: 34,
        attributes: {'aria-label': '评价回复'}});
    }
    assert.deepEqual(conversation.findRegionBindings(doc, view).map(binding => binding.target),
      [user], ambiguity);
  }
});

test('native code copy is not a message footer and TURN descendants invalidate action groups', () => {
  const {doc, view, target, toolbar, anchor} = nativeMessages({assistant: true});
  const code = element({tag: 'pre', parent: target, height: 800});
  const codeActions = nativeMessageActions(code, ['复制', '复制代码']);
  const bindings = conversation.findRegionBindings(doc, view);
  assert.equal(bindings.length, 2);
  assert.equal(bindings[1].header, toolbar);
  assert.equal(bindings[1].anchor, anchor);
  toolbar.remove();
  assert.equal(conversation.findRegionBindings(doc, view).some(binding => binding.target === target), false);
  assert.equal(codeActions.toolbar.querySelector(jumpHostSelector), null);
  for (const attributes of [
    {'data-testid': 'conversation-turn-nested'},
    {'data-content-search-unit-key': 'nested'},
    {'data-message-author-role': 'assistant'},
    {'data-message-role': 'user'}
  ]) {
    const fixture = nativeMessages();
    element({parent: fixture.toolbar, height: 40, attributes});
    assert.deepEqual(conversation.findRegionBindings(fixture.doc, fixture.view), []);
  }
});

test('native message lifecycle revalidates action labels and assistant identity attributes', t => {
  const {doc, view, target, toolbar, buttons, anchor} = nativeMessages();
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner});
  t.after(() => session.dispose());
  assert.equal(session.isMounted(), true);
  buttons[2].setAttribute('aria-label', 'unrelated action');
  owner.emit({type: 'attributes', attributeName: 'aria-label', target: buttons[2]});
  owner.flush();
  assert.equal(toolbar.querySelector(jumpHostSelector), null);
  assert.equal(session.isMounted(), false);
  buttons[2].setAttribute('aria-label', '编辑消息');
  owner.emit({type: 'attributes', attributeName: 'aria-label', target: buttons[2]});
  owner.flush();
  assert.equal(toolbar.querySelector(jumpHostSelector)?.nextElementSibling, anchor);
  target.setAttribute('data-chatgpt-search-unit-key', 'now-assistant');
  owner.emit({type: 'attributes', attributeName: 'data-chatgpt-search-unit-key', target});
  owner.flush();
  assert.equal(toolbar.querySelector(jumpHostSelector), null);
  assert.equal(session.isMounted(), false);
});


for (const sessionKey of ['default', 'prompt-shortcuts']) {
  test(`shared adapter tracks repeated ${sessionKey} install/dispose and retires old listeners`, t => {
    const {doc, view, main, root, rows: [{toolbar, target}]} = controlledEditors();
    const owners = [], sessions = [], buttons = [];
    t.after(() => owners.forEach(owner => owner.dispose()));
    for (let index = 0; index < 3; index++) {
      const owner = observerOwner();owners.push(owner);
      const session = conversation.installJumpToTop({doc, win: view, owner, sessionKey,
        regionDirections: {top: true, bottom: true}});
      sessions.push(session);
      assert.equal(toolbar.querySelectorAll('[data-opendesk-chatgpt-jump-top]').length, 1);
      if (index) assert.equal(sessions[index - 1].isMounted(), false, 'replacement disposes the previous session');
      const host = toolbar.querySelector('[data-opendesk-chatgpt-jump-top]');
      const [top, bottom] = host.shadowRoot.querySelectorAll('button');
      assert.equal(top.dataset.scrollNavKey, 'regionTop');
      assert.equal(bottom.dataset.scrollNavKey, 'regionBottom');
      const beforeStaleClicks = target.calls.length;
      owners.slice(0, -1).forEach((oldOwner, oldIndex) => {
        oldOwner.dispose();oldOwner.flush();oldOwner.click(buttons[oldIndex]);
      });
      assert.equal(target.calls.length, beforeStaleClicks, 'replaced owners have no live click listeners');
      assert.equal(session.isMounted(), true, 'late disposal of an old owner cannot remove its replacement');
      const count = target.calls.length;
      owner.click(bottom);assertScroll(target, 1420, 27);
      owner.click(top);assertScroll(target, 0, 27);
      assert.equal(target.calls.length, count + 2);
      buttons.push(top);
    }
    owners.at(-1).dispose();
    assert.equal(toolbar.querySelectorAll('[data-opendesk-chatgpt-jump-top]').length, 0);
    const count = target.calls.length;
    owners.forEach((owner, index) => {owner.click(buttons[index]);owner.flush();});
    assert.equal(target.calls.length, count, 'disposed controls cannot scroll');
    assert.deepEqual(main.calls, []);assert.deepEqual(root.calls, []);
  });
}

for (const order of [['default', 'prompt-shortcuts'], ['prompt-shortcuts', 'default']]) {
  test(`Program and trusted navigation coexist without duplicate up arrows: ${order.join(' then ')}`, t => {
    const {doc, view, root, main, rows: [{toolbar, target}]} = controlledEditors();
    const owners = new Map(), sessions = new Map();
    t.after(() => owners.forEach(owner => owner.dispose()));
    for (const sessionKey of order) {
      const owner = observerOwner();owners.set(sessionKey, owner);
      sessions.set(sessionKey, conversation.installJumpToTop({doc, win: view, owner, sessionKey,
        regionDirections: {top: true, bottom: sessionKey !== 'default'}}));
    }
    // Deliver the DOM mutation a real observer sees when the other owner mounts.
    owners.get('prompt-shortcuts').emit({type: 'childList', target: toolbar,
      addedNodes: toolbar.querySelectorAll('[data-opendesk-chatgpt-jump-top="host"]'), removedNodes: []});
    owners.get('prompt-shortcuts').flush();
    const controls = () => toolbar.querySelectorAll('[data-opendesk-chatgpt-jump-top]')
      .flatMap(host => host.shadowRoot.querySelectorAll('button'));
    assert.deepEqual(controls().map(button => button.dataset.scrollNavKey).sort(), ['regionBottom', 'regionTop']);
    const top = controls().find(button => button.dataset.scrollNavKey === 'regionTop');
    const bottom = controls().find(button => button.dataset.scrollNavKey === 'regionBottom');
    owners.get('default').click(top);assertScroll(target, 0, 27);
    owners.get('prompt-shortcuts').click(bottom);assertScroll(target, 1420, 27);
    const programHost = toolbar.querySelector('[data-opendesk-chatgpt-jump-top="host"]');
    owners.get('default').dispose();
    owners.get('prompt-shortcuts').emit({type: 'childList', target: toolbar, addedNodes: [],
      removedNodes: [programHost]});
    owners.get('prompt-shortcuts').flush();
    assert.equal(sessions.get('prompt-shortcuts').isMounted(), true);
    assert.deepEqual(controls().map(button => button.dataset.scrollNavKey), ['regionTop', 'regionBottom']);
    const before = target.calls.length;
    owners.get('default').click(top);assert.equal(target.calls.length, before);
    owners.get('prompt-shortcuts').click(controls()[0]);assertScroll(target, 0, 27);
    owners.get('prompt-shortcuts').dispose();
    assert.equal(controls().length, 0);
    assert.deepEqual(main.calls, []);assert.deepEqual(root.calls, []);
  });
}

const answerTools = '[data-opendesk-chatgpt-answer-tools]';
const mindmapViewer = {'data-opendesk-chatgpt-mindmap': 'viewer'};

function dilMindmapReply() {
  const fixture = nativeMessages({assistant: true});
  const original = fixture.target;
  original.setAttribute('data-content-search-unit-key', 'turn:last:assistant');
  original.removeAttribute('data-chatgpt-search-unit-key');
  const content = element({parent: original, height: 1400});
  element({parent: original, attributes: {'data-conversation-role': 'assistant'}});
  element({parent: content, attributes: {'data-d-component': 'markdown'}});
  // Unlike a hidden SEARCH_TURN, the real DIL root stays rendered but shrinks
  // below the long-content threshold when its direct content DIV is concealed.
  const originalRect = original.getBoundingClientRect;
  original.getBoundingClientRect = () => {
    const box = originalRect();
    return content.style.display === 'none' ? {...box, height: 80, bottom: box.top + 80} : box;
  };
  function open() {
    content.style.display = 'none';
    content.setAttribute('aria-hidden', 'true');
    original.scrollHeight = 80;
    const viewer = element({tag: 'section', height: 250, contentTop: 0, attributes: mindmapViewer});
    // insert after the content DIV, before the assistant semantic marker.
    content.nextElementSibling.before(viewer);
    return viewer;
  }
  function close(viewer) {
    content.style.display = 'block';
    content.setAttribute('aria-hidden', 'false');
    original.scrollHeight = 1500;
    viewer.remove();
  }
  return {...fixture, original, content, open, close};
}

test('DIL concealed content keeps exact reply navigation live in mindmap, restore and reopen', t => {
  const f = dilMindmapReply();
  const {doc, view, toolbar, original, content, main, root, buttons} = f;
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner,
    regionDirections: {top: true, bottom: true}});
  t.after(() => session.dispose());
  const host = toolbar.querySelector(jumpHostSelector);
  const group = host.parentElement;
  const [top, bottom] = host.shadowRoot.querySelectorAll('button');
  assert.equal(top.title, 'Back to start of this content');
  assert.equal(bottom.getAttribute('aria-label'), 'Go to end of this content');
  assert.equal(group, toolbar.lastElementChild);
  assert.deepEqual(toolbar.querySelectorAll('button'), buttons, 'native wrapper/button order unchanged');
  const peer = element({tag: 'span', attributes: {'data-opendesk-chatgpt-mindmap': 'button'}});
  conversation.mountAnswerTool(toolbar, peer);
  for (let cycle = 0; cycle < 2; cycle++) {
    const viewer = f.open();
    owner.emit({type: 'attributes', target: content, attributeName: 'style'});
    owner.flush();
    const binding = conversation.findRegionBindings(doc, view).find(item => item.header === toolbar);
    assert.equal(binding.answerRoot, original);
    assert.equal(binding.target, viewer);
    assert.equal(toolbar.querySelector(jumpHostSelector), host, 'mode changes keep one live host');
    const before = main.calls.length;
    owner.click(bottom);
    assert.equal(main.calls.length, before + 1);
    const box = viewer.getBoundingClientRect(), port = main.getBoundingClientRect();
    assert.equal(box.bottom, port.top + main.clientHeight - 12, 'end of the same visible viewer');
    owner.click(top);
    assert.equal(viewer.getBoundingClientRect().top, main.getBoundingClientRect().top + 12);
    for (let i = 0; i < 3; i++) {
      owner.emit({type: 'childList', target: group, addedNodes: [peer], removedNodes: []});
      owner.flush();session.refresh();
    }
    assert.equal(toolbar.querySelector(jumpHostSelector), host, 'peer observer delivery does not reparent');
    assert.equal(toolbar.querySelectorAll(answerTools).length, 1);
    assert.equal(toolbar.querySelectorAll(jumpHostSelector).length, 1);
    f.close(viewer);
    owner.emit({type: 'attributes', target: content, attributeName: 'style'});owner.flush();
    assert.equal(toolbar.querySelector(jumpHostSelector), host);
    assert.equal(conversation.findRegionBindings(doc, view).find(item => item.header === toolbar).target, original);
    owner.click(bottom);
    assert.equal(original.getBoundingClientRect().bottom, main.getBoundingClientRect().top + main.clientHeight - 12);
    owner.click(top);
    assert.equal(original.getBoundingClientRect().top, main.getBoundingClientRect().top + 12);
  }
  const clone = element({tag: 'span', parent: group,
    attributes: {'data-opendesk-chatgpt-jump-top': 'host'}});
  session.refresh();
  assert.equal(clone.isConnected, false, 'remove own inert clone only');
  assert.equal(peer.parentElement, group);
  assert.equal(toolbar.querySelector(jumpHostSelector), host);
  session.dispose();
  assert.equal(peer.parentElement, group, 'navigation disposal preserves independent mindmap host');
  assert.equal(toolbar.querySelectorAll(answerTools).length, 1);
  conversation.unmountAnswerTool(peer);
  assert.equal(toolbar.querySelectorAll(answerTools).length, 0);
  assert.deepEqual(root.calls, []);
});

test('mindmap mapping rejects nonadjacent, nested, duplicate, visible-original and cross-reply viewers', () => {
  for (const ambiguity of ['nonadjacent', 'nested', 'duplicate', 'visible-original', 'cross-reply', 'hidden-root']) {
    const f = dilMindmapReply();
    const viewer = f.open();
    if (ambiguity === 'nonadjacent') viewer.before(element());
    if (ambiguity === 'nested') f.content.append(viewer);
    if (ambiguity === 'duplicate') element({tag: 'section', parent: f.original, attributes: mindmapViewer});
    if (ambiguity === 'visible-original') {
      f.content.style.display = 'block';f.content.setAttribute('aria-hidden', 'false');
    }
    if (ambiguity === 'cross-reply') f.user.append(viewer);
    if (ambiguity === 'hidden-root') f.original.setAttribute('aria-hidden', 'true');
    assert.equal(conversation.findRegionBindings(f.doc, f.view).some(item => item.header === f.toolbar), false,
      ambiguity);
  }
});

test('answer tool group mounts idempotently at right, moves own host and unmounts only empty groups', () => {
  const {doc} = environment();
  const bars = ['flex', 'inline-flex'].map(display => {
    const bar = element({parent: doc.body});bar.style.display = display;
    nativeMessageActions(bar, ['Copy', 'Retry']);
    return bar;
  });
  const host = doc.createElement('span'), peer = doc.createElement('span');
  const group = conversation.mountAnswerTool(bars[0], host);
  conversation.mountAnswerTool(bars[0], peer);
  assert.equal(group, bars[0].lastElementChild);
  assert.match(group.style.cssText, /margin-inline-start:auto/);
  assert.match(group.style.cssText, /border-radius:12px/);
  assert.equal(conversation.mountAnswerTool(bars[0], host), group);
  assert.deepEqual(group.children, [host, peer]);
  const next = conversation.mountAnswerTool(bars[1], host);
  assert.deepEqual(group.children, [peer]);
  conversation.unmountAnswerTool(host);
  assert.equal(next.isConnected, false);
  assert.equal(peer.parentElement, group);
  conversation.unmountAnswerTool(peer);
  assert.equal(group.isConnected, false);
});


test('mindmap transition and uncertain mapping retain disabled controls and restore the same host', t => {
  const f = dilMindmapReply();
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc: f.doc, win: f.view, owner,
    regionDirections: {top: true, bottom: true}});
  t.after(() => session.dispose());
  const host = f.toolbar.querySelector(jumpHostSelector);
  const group = host.parentElement;
  const background = group.style.cssText;
  const controls = host.shadowRoot.querySelectorAll('button');
  const peer = element({tag: 'span', attributes: {'data-opendesk-chatgpt-mindmap': 'button'}});
  conversation.mountAnswerTool(f.toolbar, peer);
  const assertRetained = disabled => {
    assert.equal(f.toolbar.querySelector(jumpHostSelector), host);
    assert.equal(host.parentElement, group);
    assert.equal(group.style.cssText, background);
    assert.deepEqual(group.children, [host, peer]);
    assert.equal(controls.length, 2);
    for (const button of controls) assert.equal(Boolean(button.disabled), disabled);
  };
  const assertNoScroll = () => {
    const before = [f.main.calls.length, f.root.calls.length, f.original.calls.length];
    controls.forEach(button => owner.click(button));
    assert.deepEqual([f.main.calls.length, f.root.calls.length, f.original.calls.length], before);
  };
  for (let cycle = 0; cycle < 2; cycle++) {
    const viewer = f.open();
    viewer.remove(); // concealment was delivered before viewer insertion
    f.original.scrollHeight = 1500; // stale/other layout height cannot revive hidden original content
    assertNoScroll(); // stale enabled controls must fail closed before refresh
    assertRetained(true);
    owner.emit({type: 'attributes', target: f.content, attributeName: 'style'});
    owner.flush();
    assertRetained(true);
    assertNoScroll();
    f.content.nextElementSibling.before(viewer);
    session.refresh();
    assertRetained(false);
    for (const ambiguity of ['duplicate', 'hidden', 'nonadjacent']) {
      let extra;
      if (ambiguity === 'duplicate') extra = element({parent: f.original, attributes: mindmapViewer});
      if (ambiguity === 'hidden') viewer.style.display = 'none';
      if (ambiguity === 'nonadjacent') {extra = element();viewer.before(extra);}
      assertNoScroll();
      session.refresh();
      assertRetained(true);
      assertNoScroll();
      extra?.remove();viewer.style.display = 'block';
      session.refresh();
      assertRetained(false);
    }
    viewer.remove(); // return also spans separate DOM deliveries
    session.refresh();
    assertRetained(true);
    f.close(viewer);
    owner.emit({type: 'attributes', target: f.content, attributeName: 'style'});
    owner.flush();
    assertRetained(false);
    owner.click(controls[1]);
    assert.equal(f.original.getBoundingClientRect().bottom,
      f.main.getBoundingClientRect().top + f.main.clientHeight - 12);
    owner.click(controls[0]);
    assert.equal(f.original.getBoundingClientRect().top, f.main.getBoundingClientRect().top + 12);
  }
  // A replaced native action wrapper must not inherit the old reply's controls.
  f.open();
  f.anchor.remove();
  session.refresh();
  assert.equal(host.isConnected, false);
  assertNoScroll();
  assert.equal(peer.parentElement, group);
});

test('answer navigation precedes mindmap for either mount order and refresh repairs order without remount', t => {
  for (const peerFirst of [true, false]) {
    const f = dilMindmapReply();
    const peer = element({tag: 'span', attributes: {'data-opendesk-chatgpt-mindmap': 'button'}});
    if (peerFirst) conversation.mountAnswerTool(f.toolbar, peer);
    const owner = observerOwner();
    const session = conversation.installJumpToTop({doc: f.doc, win: f.view, owner,
      regionDirections: {top: true, bottom: true}});
    t.after(() => session.dispose());
    if (!peerFirst) conversation.mountAnswerTool(f.toolbar, peer);
    const host = f.toolbar.querySelector(jumpHostSelector), group = peer.parentElement;
    assert.deepEqual(group.children, [host, peer]);
    group.append(host); // a later peer/layout delivery changed order
    f.toolbar.append(element()); // shared group also ceased to be last
    session.refresh();
    assert.equal(f.toolbar.querySelector(jumpHostSelector), host);
    assert.equal(f.toolbar.lastElementChild, group);
    assert.deepEqual(group.children, [host, peer]);
  }
});


test('new Scroll reply host keeps old Mind Map marker and yields immediately to old installed Page', t => {
  const {doc, view, main, toolbar} = nativeMessages({assistant: true});
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner,
    regionDirections: {top: true, bottom: true}});
  t.after(() => owner.dispose());
  const modern = toolbar.querySelector('[data-opendesk-ai-scroll-navigation="reply"]');
  assert.ok(modern?.isConnected);
  assert.equal(modern.getAttribute('data-opendesk-chatgpt-jump-top'), 'host',
    'older installed Mind Map can still recognize its independent peer');
  assert.equal(conversation.legacyNavigationPresent(doc), false);
  const button = modern.shadowRoot.querySelector('button');
  const legacy = element({tag: 'span', parent: toolbar,
    attributes: {'data-opendesk-chatgpt-jump-top': 'host'}});
  legacy.attachShadow({mode: 'open'});
  assert.equal(conversation.legacyNavigationPresent(doc), true);
  const moves = main.calls.length;
  owner.click(button);
  assert.equal(main.calls.length, moves, 'old installed navigator fences a stale new click');
  owner.emit({type: 'childList', target: toolbar, addedNodes: [legacy], removedNodes: []});
  assert.equal(modern.isConnected, false, 'new program withdraws without removing old peer');
  assert.equal(legacy.isConnected, true);
  legacy.remove();
  owner.emit({type: 'childList', target: toolbar, addedNodes: [], removedNodes: [legacy]});
  owner.flush();
  assert.equal(conversation.legacyNavigationPresent(doc), false);
  assert.equal(toolbar.querySelectorAll('[data-opendesk-ai-scroll-navigation="reply"]').length, 1);
  assert.equal(session.isMounted(), true, 'new navigator resumes only after old peer is gone');
});

test('two module-local Scroll owners use the first live same-key reply host', t => {
  const {doc, view, rows: [{toolbar}]} = controlledEditors();
  const incumbent = element({tag: 'span', parent: toolbar,
    attributes: {'data-opendesk-chatgpt-jump-top': 'host',
      'data-opendesk-ai-scroll-navigation': 'reply'}});
  incumbent.attachShadow({mode: 'open'});
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner,
    regionDirections: {top: true, bottom: true}});
  t.after(() => owner.dispose());
  assert.equal(conversation.legacyNavigationPresent(doc), false);
  assert.equal(toolbar.querySelectorAll('[data-opendesk-ai-scroll-navigation="reply"]').length, 1,
    'second owner does not insert another live action bar');
  assert.equal(session.isMounted(), false);
  incumbent.remove();
  owner.emit({type: 'childList', target: toolbar, addedNodes: [], removedNodes: [incumbent]});
  owner.flush();
  assert.equal(session.isMounted(), true);
  assert.equal(toolbar.querySelectorAll('[data-opendesk-ai-scroll-navigation="reply"]').length, 1);
});

test('old installed Page lifecycle blocks a new navigator before an old reply button exists', t => {
  const {doc, view, rows: [{toolbar}]} = controlledEditors();
  const lifecycle = element({tag: 'div', parent: doc.documentElement,
    attributes: {'data-opendesk-ui-owner': 'old-program',
      'data-od-id': 'opendesk.chatgpt-jump-top.lifecycle'}});
  assert.equal(conversation.legacyNavigationPresent(doc), true);
  const owner = observerOwner();
  const session = conversation.installJumpToTop({doc, win: view, owner});
  t.after(() => owner.dispose());
  assert.equal(session.isMounted(), false);
  assert.equal(toolbar.querySelector('[data-opendesk-ai-scroll-navigation="reply"]'), null);
  lifecycle.remove();
  owner.emit({type: 'childList', target: doc.documentElement, addedNodes: [],
    removedNodes: [lifecycle]});
  owner.flush();
  assert.equal(conversation.legacyNavigationPresent(doc), false);
  assert.equal(session.isMounted(), true, 'resumes without transferring any old grant');
});
