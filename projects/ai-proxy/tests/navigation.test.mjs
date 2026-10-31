import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import { runInNewContext } from 'node:vm';

const bundled = await build({ entryPoints: [new URL('../src/ui/navigation.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { createNavigation } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('internal transitions, same route, replace and unsubscribe have deterministic state', () => {
  const navigation = createNavigation({ initialRoute: '#/profiles/add' });
  const seen = [];
  const unsubscribe = navigation.subscribe(route => seen.push(route));
  assert.equal(navigation.getRoute(), '#/profiles/add');
  assert.equal(navigation.navigate('#/rules'), true);
  assert.equal(navigation.navigate('#/rules'), true);
  assert.equal(navigation.navigate('#/subscriptions/source/provider_1', { replace: true }), true);
  assert.deepEqual(seen, ['#/rules', '#/subscriptions/source/provider_1']);
  unsubscribe(); unsubscribe();
  navigation.navigate('');
  assert.equal(navigation.getRoute(), '');
  assert.equal(seen.length, 2);
});

test('guards block before mutation; force bypasses guard and replacement does not', () => {
  const navigation = createNavigation({ initialRoute: '#/rules' });
  const attempts = [], seen = [];
  navigation.subscribe(route => seen.push(route));
  navigation.setGuard(route => { attempts.push(route); return false; });
  assert.equal(navigation.navigate('#/profiles', { replace: true }), false);
  assert.equal(navigation.getRoute(), '#/rules');
  assert.deepEqual(seen, []);
  assert.equal(navigation.navigate('#/profiles', { force: true }), true);
  assert.deepEqual(attempts, ['#/profiles']);
  navigation.setGuard(null);
  assert.equal(navigation.navigate('#/diagnostic/ai'), true);
  assert.deepEqual(seen, ['#/profiles', '#/diagnostic/ai']);
});

test('invalid routes never reach state, guards or listeners, including forced attempts', () => {
  const invalid = ['https://user:secret@example.com/#/rules', '#/rules?token=secret',
    '#/subscriptions/source/a?token=secret', '#/subscriptions/source/a%2Fsecret',
    '#/profiles/add#secret', '#/diagnostic/unknown', '#/unknown', '#/subscriptions/source/' + 'a'.repeat(81),
    '#/rules\n', '#/profiles/add\n', '#/subscriptions/source/a\n', null, undefined, {}, 42];
  for (const initialRoute of invalid) {
    assert.equal(createNavigation({ initialRoute }).getRoute(), '');
    const navigation = createNavigation({ initialRoute: '#/rules' });
    navigation.setGuard(() => assert.fail('invalid input reached guard'));
    navigation.subscribe(() => assert.fail('invalid input reached listener'));
    for (const options of [{}, { force: true }, { replace: true }]) {
      assert.equal(navigation.navigate(initialRoute, options), false);
      assert.equal(navigation.getRoute(), '#/rules');
    }
  }
});

test('independent instances and destroy isolate state, listeners and guards', () => {
  const a = createNavigation(), b = createNavigation();
  let calls = 0;
  a.subscribe(() => calls++);
  a.navigate('#/profiles/rotation');
  assert.equal(b.getRoute(), '');
  a.destroy(); a.destroy();
  a.setGuard(() => assert.fail('destroyed guard'));
  a.subscribe(() => assert.fail('destroyed listener'));
  assert.equal(a.navigate('#/rules', { force: true }), false);
  assert.equal(a.getRoute(), '');
  assert.equal(calls, 1);
  assert.equal(b.navigate('#/subscriptions/new'), true);
});

// Run the actual Workspace with minimal hook scheduling, without mounting a browser.
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const appCode = (await transform(appSource, { loader: 'jsx', format: 'cjs' })).code;
const routeContent = tree => tree.props.children.find(child => child?.props?.className === 'proxy-route');
const draftDialog = tree => tree.props.children.find(child => child?.props?.id === 'proxy-draft');
function workspaceFixture(preview = false) {
  const hooks = [], effects = [], events = new EventTarget();
  let cursor = 0, focused = 0;
  const navigation = createNavigation({ initialRoute: '#/rules' });
  const env = { navigation, events, preview, navigate: navigation.navigate, setConfirmHandler() {}, setState() {},hasDrafts:()=>false,clearDrafts(){events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:false}));},markDraftFrom(){events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:true}));} };
  const react = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++, previous = hooks[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        effects.push(() => { previous?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; });
      }
    }
  };
  const module = { exports: {} };
  runInNewContext(appCode, { module, exports: module.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === './environment') return { getEnvironment: () => env };
      if (name === './i18n/LocaleProvider') return { LocaleProvider: 'locale', useI18n: () => ({ t: key => key }) };
      return { default: name, Button: 'button' };
    },
    addEventListener: () => assert.fail('global listener registered'),
    removeEventListener: () => assert.fail('global listener removed'),
    document: {activeElement:null}
  });
  const Workspace = module.exports.default().props.children[0].type;
  return { navigation, events, unmount() { for (const hook of hooks) hook?.cleanup?.(); }, get focused() { return focused; }, render() {
    cursor = 0;
    const tree = Workspace();
    const content = routeContent(tree);
    content.props.ref.current = { focus: () => focused++, contains: () => false };
    while (effects.length) effects.shift()();
    return tree;
  } };
}

test('actual Workspace keeps/cancels draft, then confirms force navigation and resets form owner/focus', () => {
  const f = workspaceFixture();
  let tree = f.render();
  const initialKey = routeContent(tree).props.key;
  tree.props.onChange({ target: { closest: () => null, matches: () => false } });
  assert.equal(f.navigation.navigate('#/profiles'), false);
  tree = f.render();
  assert.equal(f.navigation.getRoute(), '#/rules');
  draftDialog(tree).props.onDone(false);
  tree = f.render();
  assert.equal(draftDialog(tree), undefined);
  assert.equal(routeContent(tree).props.key, initialKey);
  assert.equal(f.navigation.navigate('#/profiles'), false);
  tree = f.render();
  draftDialog(tree).props.onDone(true);
  tree = f.render();
  assert.equal(f.navigation.getRoute(), '#/profiles');
  assert.notEqual(routeContent(tree).props.key, initialKey);
  assert.equal(f.focused, 1);
  assert.equal(f.navigation.navigate('#/backup'), true);
});

test('actual Workspace ignores global saved events and updates its guard only from draft state', () => {
  const f = workspaceFixture();
  f.render();
  f.events.dispatchEvent(new CustomEvent('ai-proxy-draft', { detail: true }));
  assert.equal(f.navigation.navigate('#/profiles'), false);
  f.events.dispatchEvent(new Event('ai-proxy-saved'));
  assert.equal(f.navigation.navigate('#/profiles'), false);
  f.events.dispatchEvent(new CustomEvent('ai-proxy-draft', { detail: false }));
  assert.equal(f.navigation.navigate('#/profiles'), true);
});

test('Workspace events stay per instance and effect cleanup removes its draft listener', () => {
  const a = workspaceFixture(), b = workspaceFixture();
  a.render(); b.render();
  a.events.dispatchEvent(new CustomEvent('ai-proxy-draft', { detail: true }));
  assert.equal(a.navigation.navigate('#/profiles'), false);
  assert.equal(b.navigation.navigate('#/profiles'), true);
  b.events.dispatchEvent(new Event('ai-proxy-saved'));
  assert.equal(a.navigation.navigate('#/backup'), false);
  const removed = [];
  const remove = a.events.removeEventListener.bind(a.events);
  a.events.removeEventListener = (type, fn) => { removed.push(type); remove(type, fn); };
  a.unmount();
  assert.deepEqual(removed.sort(), ['ai-proxy-draft','ai-proxy-operation']);
  assert.equal(a.navigation.navigate('#/backup'), true);
});

test('workspace view tabs share draft protection and track selection without leaving the tool',()=>{
 const f=workspaceFixture();let tree=f.render();
 const tabs=()=>tree.props.children.find(child=>child?.props?.role==='tablist');
 assert.equal(tabs().props.children[1].props['aria-selected'],true);
 tabs().props.children[0].props.onClick();tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
 assert.equal(tabs().props.children[0].props['aria-selected'],true);
 tree.props.onChange({target:{}});
 tabs().props.children[1].props.onClick();tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
 draftDialog(tree).props.onDone(false);tree=f.render();
 assert.equal(tabs().props.children[0].props['aria-selected'],true);
 tabs().props.children[1].props.onClick();tree=f.render();
 draftDialog(tree).props.onDone(true);tree=f.render();
 assert.equal(f.navigation.getRoute(),'#/rules');
 assert.equal(tabs().props.children[1].props['aria-selected'],true);
});

test('active workspace tab keeps its section and switching back restores the last settings route',()=>{
 const f=workspaceFixture();let tree=f.render();
 const tabs=()=>tree.props.children.find(child=>child?.props?.role==='tablist');
 tree.props.onChange({target:{}});
 tabs().props.children[1].props.onClick();tree=f.render();
 assert.equal(f.navigation.getRoute(),'#/rules');
 assert.equal(draftDialog(tree),undefined);
 f.events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:false}));
 f.navigation.navigate('#/diagnostic/ai');tree=f.render();
 tabs().props.children[0].props.onClick();tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
 tabs().props.children[1].props.onClick();tree=f.render();
 assert.equal(f.navigation.getRoute(),'#/diagnostic/ai');
});

test('busy view tabs cannot switch with arrow keys and release after the operation',()=>{
 const f=workspaceFixture();let tree=f.render();
 const tabs=()=>tree.props.children.find(child=>child?.props?.role==='tablist');
 f.events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:{busy:true}}));tree=f.render();
 assert.equal(tabs().props.children[0].props.disabled,true);
 assert.equal(f.navigation.navigate('#/backup'),false);
 tree=f.render();assert.equal(draftDialog(tree),undefined);
 tabs().props.onKeyDown({key:'Home',preventDefault:()=>assert.fail('busy tabs handled navigation')});
 assert.equal(f.navigation.getRoute(),'#/rules');
 f.events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:{busy:false}}));tree=f.render();
 assert.equal(tabs().props.children[0].props.disabled,false);
 let focused=-1;
 tabs().props.onKeyDown({key:'Home',preventDefault(){},currentTarget:{querySelectorAll:()=>[0,1].map(index=>({focus:()=>focused=index}))}});
 assert.equal(f.navigation.getRoute(),'');assert.equal(focused,0);
});

const settingsSource = await readFile(new URL('../src/Settings.tsx', import.meta.url), 'utf8');
function settingsHandler(start, end, context) {
  const source = settingsSource.slice(settingsSource.indexOf(start), settingsSource.indexOf(end));
  assert.ok(source.startsWith(start));
  return transform(source, { loader: 'tsx' }).then(({ code }) => runInNewContext(`${code}; ${/function (\w+)/.exec(start)[1]}`, context));
}

test('actual editor close replaces its internal deep link, clears drafts and bypasses the stale guard', async () => {
  const navigation = createNavigation({ initialRoute: '#/profiles/add' });
  navigation.setGuard(() => assert.fail('explicit editor close must bypass dirty guard'));
  const cleared = [];
  const context = { navigation, getEnvironment: () => ({ setDraftDirty: value => cleared.push(['dirty', value]) }),
    optionsHash: section => '#/' + section, emptyEndpoint: {},
    deepLinkedEditor: { current: true }, editorOriginHash: { current: '#/profiles/add' },
    ...Object.fromEntries(['setError', 'setEditorOpen', 'setEditingId', 'setProxy', 'setUsername', 'setPassword', 'setAddressPasteError']
      .map(name => [name, value => cleared.push([name, value])])) };
  const close = await settingsHandler('  function closeEditor()', '  function openEditor(', context);
  close();
  assert.equal(navigation.getRoute(), '#/profiles');
  for (const name of ['setUsername', 'setPassword', 'setEditingId']) assert.ok(cleared.some(([key, value]) => key === name && value === ''));
  assert.ok(cleared.some(([key, value]) => key === 'setEditorOpen' && value === false));
  assert.equal(context.deepLinkedEditor.current, false);
  assert.equal(context.editorOriginHash.current, null);
});

test('actual copy action copies only an internal route and reports clipboard failure honestly', async () => {
  for (const fail of [false, true]) {
    const navigation = createNavigation({ initialRoute: '#/subscriptions/source/provider_1' });
    const copied = [], success = [], failure = [];
    const context = { navigation, pageLinkCopyRequest: { current: 0 },
      copyableOptionsHash: route => route,
      setCopiedPageLink: value => success.push(value), setPageLinkCopyFailed: value => failure.push(value),
      navigator: { clipboard: { async writeText(text) { if (fail) throw Error('denied'); copied.push(text); } } },
      document: { createElement: () => ({ style: {}, select() {}, remove() {} }), body: { appendChild() {} }, execCommand: () => false } };
    const copy = await settingsHandler('  async function copyCurrentPageLink()', '  const [editingId,', context);
    await copy();
    assert.deepEqual(copied, fail ? [] : ['#/subscriptions/source/provider_1']);
    assert.equal(success.at(-1), !fail);
    assert.equal(failure.at(-1), fail);
  }
});
