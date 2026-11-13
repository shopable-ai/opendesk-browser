import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { SIDEBAR_TOOL_PROTOCOL } from '../../../src/ui/sidebar-tools/package.js';

const bundled = await build({ entryPoints: [new URL('../src/ui/navigation.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { createNavigation } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const headerBundle = await build({entryPoints:[new URL('../src/domain/header-actions.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const headerActions = await import('data:text/javascript;base64,'+Buffer.from(headerBundle.outputFiles[0].text).toString('base64'));

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
function workspaceFixture(preview = false, enhanced = true) {
  const hooks = [], effects = [], events = new EventTarget();
  let cursor = 0, focused = 0;
  const navigation = createNavigation({ initialRoute: '#/rules' });
  let savedHeaderActions=[...headerActions.DEFAULT_HEADER_ACTIONS];
  const headerStore={getSnapshot:()=>({saved:savedHeaderActions,busy:false,unknown:false})};
  const env = { navigation, events, preview, navigate: navigation.navigate, setConfirmHandler() {}, setState() {},
    request:async()=>({ok:true,state:{config:{}}}),hasDrafts:()=>false,clearDrafts(){events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:false}));},markDraftFrom(){events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:true}));} };
  let answer;
  env.confirm=(_text,{signal}={})=>new Promise(resolve=>{
    answer=resolve;signal?.addEventListener('abort',()=>resolve(false),{once:true});
  });
  const snapshots=[],headerListeners=new Set();
  env.toolNavigation={setNavigation(base,headerActions){snapshots.push({...base,...(enhanced?{headerActions}:{})});return enhanced;},
    subscribe(handler){headerListeners.add(handler);return()=>headerListeners.delete(handler);},isLocked:()=>false};
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
  runInNewContext(appCode, { AbortController, module, exports: module.exports,
    require(name) {
      if (name === './domain/header-actions') return headerActions;
      if (name === './ui/header-actions') return {useHeaderActions:()=>headerStore};
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
  return { env, navigation, events, snapshots, async answer(value){answer(value);await new Promise(setImmediate);},
    notifyHeaderConfig(config){savedHeaderActions=config.headerActions??headerActions.DEFAULT_HEADER_ACTIONS;},
    header(detail){for(const fn of [...headerListeners])fn(detail);}, unmount() { for (const hook of hooks) hook?.cleanup?.(); }, get focused() { return focused; }, render() {
    cursor = 0;
    const tree = Workspace({surface:'side-panel'});
    const content = routeContent(tree);
    content.props.ref.current = { focus: () => focused++, contains: () => false };
    while (effects.length) effects.shift()();
    return tree;
  } };
}

test('actual Workspace keeps/cancels draft, then confirms force navigation and resets form owner/focus', async () => {
  const f = workspaceFixture();
  let tree = f.render();
  const initialKey = routeContent(tree).props.key;
  tree.props.onChange({ target: { closest: () => null, matches: () => false } });
  assert.equal(f.navigation.navigate('#/profiles'), false);
  tree = f.render();
  assert.equal(f.navigation.getRoute(), '#/rules');
  await f.answer(false);
  tree = f.render();
  assert.equal(draftDialog(tree), undefined);
  assert.equal(routeContent(tree).props.key, initialKey);
  assert.equal(f.navigation.navigate('#/profiles'), false);
  tree = f.render();
  await f.answer(true);
  tree = f.render();
  assert.equal(f.navigation.getRoute(), '#/profiles');
  assert.notEqual(routeContent(tree).props.key, initialKey);
  assert.equal(f.focused, 1);
  assert.equal(f.navigation.navigate('#/backup'), true);
});

test('actual Workspace ignores global saved events and updates its guard only from draft state', async () => {
  const f = workspaceFixture();
  f.render();
  f.events.dispatchEvent(new CustomEvent('ai-proxy-draft', { detail: true }));
  assert.equal(f.navigation.navigate('#/profiles'), false);
  f.events.dispatchEvent(new Event('ai-proxy-saved'));
  assert.equal(f.navigation.navigate('#/profiles'), false);
  await f.answer(false);
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

test('settings close shares draft protection without adding business tabs',async()=>{
 const f=workspaceFixture();let tree=f.render();
 const settings=()=>routeContent(tree).props.children[0];
 assert.equal(tree.props.children.some(child=>child?.props?.role==='tablist'),false);
 tree.props.onChange({target:{}});
 settings().props.onClose();tree=f.render();
 assert.equal(f.navigation.getRoute(),'#/rules');
 await f.answer(false);tree=f.render();
 assert.equal(f.navigation.getRoute(),'#/rules');
 settings().props.onClose();tree=f.render();
 await f.answer(true);tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
});

test('closing clean settings returns to the proxy panel without resetting navigation identity',()=>{
 const f=workspaceFixture();let tree=f.render();
 routeContent(tree).props.children[0].props.onClose();tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
 assert.equal(draftDialog(tree),undefined);
 f.navigation.navigate('#/diagnostic/ai');tree=f.render();
 routeContent(tree).props.children[0].props.onClose();tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
});

test('busy settings close cannot leave and releases after the operation',()=>{
 const f=workspaceFixture();let tree=f.render();
 const settings=()=>routeContent(tree).props.children[0];
 f.events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:{busy:true}}));tree=f.render();
 assert.equal(settings().props.navigationBusy,true);
 settings().props.onClose();
 assert.equal(f.navigation.getRoute(),'#/rules');
 assert.equal(f.navigation.navigate('#/backup'),false);
 tree=f.render();assert.equal(draftDialog(tree),undefined);
 f.events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:{busy:false}}));tree=f.render();
 assert.equal(settings().props.navigationBusy,false);
 settings().props.onClose();tree=f.render();
 assert.equal(f.navigation.getRoute(),'');
});

const settingsSource = await readFile(new URL('../src/Settings.tsx', import.meta.url), 'utf8');
function settingsHandler(start, end, context) {
  const startIndex=settingsSource.indexOf(start),endIndex=settingsSource.indexOf(end,startIndex);
  assert.ok(startIndex>=0&&endIndex>startIndex,'settings handler boundaries must exist');
  const source = settingsSource.slice(startIndex,endIndex);
  assert.ok(source.startsWith(start));
  return transform(source, { loader: 'tsx' }).then(({ code }) => runInNewContext(`${code}; ${/function (\w+)/.exec(start)[1]}`, {editorGeneration:{current:0},...context}));
}

test('actual shared editor close replaces its internal deep link, clears its owner and bypasses the stale guard', async () => {
  const navigation = createNavigation({ initialRoute: '#/profiles/add' });
  navigation.setGuard(() => assert.fail('explicit editor close must bypass dirty guard'));
  const cleared = [];
  const context = { navigation, optionsHash: section => '#/' + section,
    deepLinkedEditor: { current: true }, editorOriginHash: { current: '#/profiles/add' },
    ...Object.fromEntries(['setEditorOpen','setEditingEndpoint','setProxyNotice']
      .map(name => [name, value => cleared.push([name, value])])) };
  const close = await settingsHandler('  function closeEditor(', '  function openEditor(', context);
  close();
  assert.equal(navigation.getRoute(), '#/profiles');
  assert.ok(cleared.some(([key,value])=>key==='setEditingEndpoint'&&value===undefined));
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
    const copy = await settingsHandler('  async function copyCurrentPageLink()', '  const [pacName,', context);
    await copy();
    assert.deepEqual(copied, fail ? [] : ['#/subscriptions/source/provider_1']);
    assert.equal(success.at(-1), !fail);
    assert.equal(failure.at(-1), fail);
  }
});


test('Workspace projects saved Header action order and hides an action without exposing any proxy effect',()=>{
 const f=workspaceFixture();f.render();
 assert.deepEqual(Array.from(f.snapshots.at(-1).headerActions,x=>x.id),['add-proxy','diagnostics','subscriptions','settings']);
 f.notifyHeaderConfig({headerActions:['settings','add-proxy']});f.render();
 const now=f.snapshots.at(-1);
 assert.deepEqual(Array.from(now.headerActions,x=>x.id),['settings','add-proxy']);
 f.header({action:'header',actionId:'diagnostics',page:now.page});
 assert.equal(f.navigation.getRoute(),'#/rules');
 f.header({action:'header',actionId:'settings',page:now.page});
 assert.equal(f.navigation.getRoute(),'#/profiles');
 f.unmount();
});

test('R14 Workspace header opens existing routes only, rejects stale pages and releases listeners',()=>{
 const f=workspaceFixture();f.render();
 assert.equal(routeContent(f.render()).props.children[0].props.headerNavigation,true,
  'only accepted enhanced navigation owns the settings return');
 const page=f.snapshots.at(-1).page;
 assert.match(page,/^[a-z][a-z0-9-]{0,31}$/);
 assert.equal(f.snapshots.at(-1).headerActions.length,4);
 f.header({action:'header',actionId:'add-proxy',page:'stale'});
 assert.equal(f.navigation.getRoute(),'#/rules');
 f.header({action:'header',actionId:'apply',page});assert.equal(f.navigation.getRoute(),'#/rules');
 f.header({action:'header',actionId:'add-proxy',page});assert.equal(f.navigation.getRoute(),'#/profiles/add');
 f.header({action:'header',actionId:'settings',page});assert.equal(f.navigation.getRoute(),'#/profiles/add');
 f.render();
 for(const [actionId,target] of [['diagnostics','#/diagnostic'],['subscriptions','#/subscriptions'],['settings','#/profiles']]){
  f.header({action:'header',actionId,page:f.snapshots.at(-1).page});assert.equal(f.navigation.getRoute(),target);f.render();
 }
 f.header({action:'back'});assert.equal(f.navigation.getRoute(),'');f.render();
 f.unmount();f.header({action:'header',actionId:'settings',page:'home'});assert.equal(f.navigation.getRoute(),'');
});

test('R14 Workspace blocks header with drafts/busy and ignores enhanced events on fallback hosts',()=>{
 for(const lock of ['draft','busy','fallback']){
  const f=workspaceFixture(false,lock!=='fallback');f.render();
  if(lock==='draft')f.events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:true}));
  if(lock==='busy')f.events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:{busy:true}}));
  f.render();const snapshot=f.snapshots.at(-1);
  assert.equal(routeContent(f.render()).props.children[0].props.headerNavigation,lock!=='fallback');
  if(lock!=='fallback')assert.ok(snapshot.headerActions.every(action=>action.disabledReason));
  f.header({action:'header',actionId:'add-proxy',page:snapshot.page});assert.equal(f.navigation.getRoute(),'#/rules');
  f.unmount();
 }
});


test('trusted header management actions open the own PC page without changing the sidebar route',async()=>{
 for(const [actionId,section] of [['settings','profiles'],['diagnostics','diagnostic'],['subscriptions','subscriptions']]){
  const f=workspaceFixture();const opened=[];
  f.env.surface='sidebar';f.env.trusted=true;
  f.env.openOwnPage=target=>{opened.push(JSON.parse(JSON.stringify(target)));return Promise.resolve({opened:true});};
  f.render();const page=f.snapshots.at(-1).page;
  f.header({action:'header',actionId,page});
  assert.deepEqual(opened,[{view:'settings',section}],'open before the trusted click callback yields');
  await new Promise(setImmediate);
  assert.equal(f.navigation.getRoute(),'#/rules');
  f.header({action:'header',actionId:'add-proxy',page});
  assert.equal(f.navigation.getRoute(),'#/profiles/add');assert.equal(opened.length,1);
  f.unmount();
 }
});

test('header management keeps old Host fallback and never replays failed or unknown openings',async()=>{
 for(const kind of ['missing','unsupported','failed','unknown']){
  const f=workspaceFixture();let attempts=0;
  f.env.surface='sidebar';f.env.trusted=true;
  if(kind!=='missing')f.env.openOwnPage=()=>{attempts++;return kind==='unsupported'?null:Promise.reject(Error(kind));};
  f.render();f.header({action:'header',actionId:'settings',page:f.snapshots.at(-1).page});
  await new Promise(setImmediate);
  assert.equal(f.navigation.getRoute(),['missing','unsupported'].includes(kind)?'#/profiles':'#/rules');
  assert.equal(attempts,kind==='missing'?0:1);
  if(['failed','unknown'].includes(kind))assert.ok(f.render().props.children.some(n=>n?.props?.role==='alert'));
  f.unmount();
 }
});

test('header opening distinguishes an unknown outcome from a confirmed failure without replay',async()=>{
 for(const [code,messageKey] of [['E_OUTCOME_UNKNOWN','apOwnPageOutcomeUnknown'],['E_PAGE_UNAVAILABLE','couldNotOpenTheSettingsTabOpenItFrom']]){
  const f=workspaceFixture();let attempts=0;
  f.env.surface='sidebar';f.env.trusted=true;
  f.env.openOwnPage=()=>{attempts++;return Promise.reject(Object.assign(Error('internal detail'),{code}));};
  f.render();f.header({action:'header',actionId:'settings',page:f.snapshots.at(-1).page});
  await new Promise(setImmediate);
  const alert=f.render().props.children.find(n=>n?.props?.role==='alert');
  assert.equal(alert?.props.children[0],messageKey);
  assert.equal(f.navigation.getRoute(),'#/rules');
  assert.equal(attempts,1,'an error message must not replay or fall back to another opening');
  f.unmount();
 }
});

test('a successful internal navigation clears the previous header opening notice',async()=>{
 const f=workspaceFixture();f.env.surface='sidebar';f.env.trusted=true;
 f.env.openOwnPage=()=>Promise.reject(Object.assign(Error('unavailable'),{code:'E_PAGE_UNAVAILABLE'}));
 f.render();f.header({action:'header',actionId:'settings',page:f.snapshots.at(-1).page});
 await new Promise(setImmediate);
 assert.ok(f.render().props.children.some(n=>n?.props?.role==='alert'));
 assert.equal(f.navigation.navigate('#/profiles/add'),true);
 assert.equal(f.render().props.children.some(n=>n?.props?.role==='alert'),false);
 f.unmount();
});

test('a late opening rejection cannot put its notice on a different page',async()=>{
 const f=workspaceFixture();let rejectOpening,attempts=0;
 f.env.surface='sidebar';f.env.trusted=true;
 f.env.openOwnPage=()=>{attempts++;return new Promise((_resolve,reject)=>{rejectOpening=reject;});};
 f.render();f.header({action:'header',actionId:'settings',page:f.snapshots.at(-1).page});
 f.navigation.navigate('#/profiles/add');f.render();
 rejectOpening(Object.assign(Error('late internal detail'),{code:'E_OUTCOME_UNKNOWN'}));
 await new Promise(setImmediate);
 assert.equal(f.render().props.children.some(n=>n?.props?.role==='alert'),false);
 assert.equal(f.navigation.getRoute(),'#/profiles/add');assert.equal(attempts,1);
 f.unmount();
});

test('leaving and returning home invalidates an old opening even before a render',async()=>{
 const f=workspaceFixture();let rejectOpening;
 f.env.surface='sidebar';f.env.trusted=true;
 f.env.openOwnPage=()=>new Promise((_resolve,reject)=>{rejectOpening=reject;});
 f.navigation.navigate('');f.render();
 f.header({action:'header',actionId:'settings',page:f.snapshots.at(-1).page});
 f.navigation.navigate('#/profiles/add');f.navigation.navigate('');
 rejectOpening(Object.assign(Error('late home request'),{code:'E_OUTCOME_UNKNOWN'}));
 await new Promise(setImmediate);
 assert.equal(f.render().props.children.some(n=>n?.props?.role==='alert'),false);
 assert.equal(f.navigation.getRoute(),'');f.unmount();
});

test('header PC openings retain draft, busy, unknown and stale-page guards',()=>{
 for(const lock of ['draft','busy','unknown','stale']){
  const f=workspaceFixture();f.env.surface='sidebar';f.env.trusted=true;
  f.env.openOwnPage=()=>assert.fail('locked header opened a page');
  f.render();
  if(lock==='draft')f.events.dispatchEvent(new CustomEvent('ai-proxy-draft',{detail:true}));
  if(lock==='busy')f.events.dispatchEvent(new CustomEvent('ai-proxy-operation',{detail:{busy:true}}));
  if(lock==='unknown')f.env.toolNavigation.isLocked=()=>true;
  f.render();f.header({action:'header',actionId:'settings',page:lock==='stale'?'stale':f.snapshots.at(-1).page});
  assert.equal(f.navigation.getRoute(),'#/rules');f.unmount();
 }
});

test('sandbox header notifications keep internal routes with the actual gesture-protected Bridge',async()=>{
 const bundle=await build({entryPoints:[new URL('../../../src/sidebar-tools/bridge.js',import.meta.url).pathname],
  bundle:true,write:false,platform:'browser',format:'iife',globalName:'ActualToolBridge',define:{'import.meta.env':'{"MODE":"test"}'}});
 for(const [actionId,route] of [['settings','#/profiles'],['diagnostics','#/diagnostic'],['subscriptions','#/subscriptions']]){
  const win=new EventTarget(),root=new EventTarget(),sent=[];
  Object.assign(root,{replaceChildren(){},querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0,bottom:100})});
  const parent={postMessage:message=>sent.push(message)};
  class Port{postMessage(message){sent.push(message);}close(){}}
  const node=()=>({append(){},addEventListener(){}});
  runInNewContext(bundle.outputFiles[0].text+';ActualToolBridge.initSidebarToolSandbox();',{
   window:win,parent,Event,CustomEvent,MessagePort:Port,performance,crypto:globalThis.crypto,
   Blob,TextEncoder,URL,structuredClone,setTimeout,clearTimeout,requestAnimationFrame:()=>0,
   document:{getElementById:id=>id==='tool-root'?root:{dataset:{}},documentElement:{},head:node(),body:node(),createElement:node}
  });
  win.dispatchEvent(Object.assign(new Event('message'),{source:parent,ports:[new Port()],data:{
   protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:'test-bridge',navigationAllowed:true,
   headerActionsAllowed:true,displaySurface:'sidebar',tool:{id:'ai-proxy',html:'',css:'',js:'void 0;',capabilities:[]}
  }}));
  const f=workspaceFixture();
  try{
   assert.equal(typeof win.OpenDeskTool.openOwnPage,'function');
   await assert.rejects(win.OpenDeskTool.openOwnPage({view:'settings',section:'profiles'}),{code:'E_USER_GESTURE_REQUIRED'});
   f.env.surface='sidebar';f.env.trusted=false;f.env.openOwnPage=win.OpenDeskTool.openOwnPage;
   f.render();f.header({action:'header',actionId,page:f.snapshots.at(-1).page});
   await new Promise(setImmediate);
   assert.equal(f.navigation.getRoute(),route,'an asynchronous Header notification retains ordinary navigation');
   assert.equal(f.render().props.children.some(n=>n?.props?.role==='alert'),false);
   assert.equal(sent.some(row=>row.operation==='tool.page.open'),false,'Header notification does not forge a native click');
  }finally{f.unmount();win.dispatchEvent(new Event('pagehide'));}
 }
});
