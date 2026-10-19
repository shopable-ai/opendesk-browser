import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {createDebugWorkbench,DEBUG_INITIAL_STATE} from '../../src/ui/debug-workbench.js';

// In-memory TSX transform for this test only; no product build or browser.
const require=createRequire(import.meta.url);
const compiled=await build({entryPoints:['src/ui/react/tabs/debug.tsx'],bundle:true,
  write:false,format:'esm',platform:'node',jsx:'transform',
  plugins:[{name:'same-react-instance',setup(builder){
    builder.onResolve({filter:/^react(?:$|\/)/},({path})=>({
      path:pathToFileURL(require.resolve(path)).href,external:true}));
  }}]});
const debugModule=await import('data:text/javascript;base64,'+
  Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const pending=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const forbidden=()=>assert.fail('Debug must never pair, authenticate, claim, approve or execute');
const raw={provider:{token:'TOKEN_PRIVATE',url:'https://private.example'},enabled:true,
  connection:'authenticated',reconciled:true,slotAvailable:true,slotState:'available',
  tasks:[{taskId:'TASK_PRIVATE'}],requests:[{state:'waiting',requestId:'REQUEST_PRIVATE'}],
  executorId:'EXECUTOR_PRIVATE',secret:'<img src=x onerror=alert(1)>'};
function controller(options={}){
  // Mirrors the app's state projection and action connector, without HTML slots.
  let view={model:DEBUG_INITIAL_STATE,actions:null};const listeners=new Set();
  const project=next=>{view={...view,...next};for(const listener of listeners)listener();};
  const reactUI={debugMounted:true,
    renderDebugDiagnostics:next=>project({model:{...view.model,...next}}),
    connectDebugActions:actions=>project({actions})};
  const workbench=createDebugWorkbench({
    client:{cloud:{cloudStatus:async()=>raw,cloudPair:forbidden,cloudNext:forbidden,
      cloudResolve:forbidden,cloudAuthenticate:forbidden}},
    host:{start:forbidden},api:{runtime:{getManifest:()=>({version:'0.1.0'})}},
    now:()=>new Date('2026-10-19T00:00:00Z'),
    document:new Proxy({},{get:forbidden}),reactUI,...options});
  return Object.assign(workbench,{reactUI,getViewSnapshot:()=>view,
    subscribeView(listener){listeners.add(listener);return ()=>listeners.delete(listener);}});
}
async function mount(t,workbench,{debugEnabled=true}={}){
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const previous=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries({window,document,IS_REACT_ACT_ENVIRONMENT:true}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const root=createRoot(document.getElementById('root'));
  let unmounted=false;
  function ConnectedDebug({hidden=false}){
    const {model,actions}=React.useSyncExternalStore(workbench.subscribeView,
      workbench.getViewSnapshot,workbench.getViewSnapshot);
    return React.createElement(debugModule.DebugPage,{model,actions,hidden});
  }
  const render=async(props={})=>React.act(async()=>root.render(
    (props.debugEnabled??debugEnabled)?React.createElement(ConnectedDebug,props):null));
  const unmount=async()=>{if(!unmounted){await React.act(async()=>root.unmount());unmounted=true;}};
  t.after(async()=>{
    await unmount();workbench.dispose();
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  });
  await render();
  return {document,render,unmount,click:async id=>React.act(async()=>{
    const button=document.getElementById(id);assert.ok(button,id);
    if(!button.disabled)button.dispatchEvent(new window.Event('click',{bubbles:true}));
  })};
}

test('R37 controller exposes stable immutable snapshots and subscriptions without any DOM',async()=>{
  const workbench=controller();
  try{
    const initial=workbench.getSnapshot();assert.equal(initial,workbench.getSnapshot());
    assert.ok(Object.isFrozen(initial));assert.equal(initial.refreshing,false);
    let reads=0;const unsubscribe=workbench.subscribe(()=>reads++);
    await workbench.refresh();
    assert.ok(reads>=2);assert.equal(workbench.getSnapshot().connection,'authenticated');
    assert.equal(workbench.getSnapshot().requestCount,'1');
    assert.doesNotMatch(JSON.stringify(workbench.getSnapshot()),/PRIVATE|private\.example|onerror/);
    unsubscribe();const count=reads;await workbench.refresh();assert.equal(reads,count);
  }finally{workbench.dispose();}
});

test('R37 complete React page renders, refreshes and copies the same sanitized state',async t=>{
  const read=pending();let reads=0,copied='';
  const workbench=controller({client:{cloud:{cloudStatus:()=>{reads++;return read.promise;}}},
    clipboard:{writeText:async text=>{copied=text;}}});
  const ui=await mount(t,workbench);
  assert.equal(reads,0,'render must not issue any Host request');
  for(const id of ['workbench-debug','debug-cloud-summary','debug-pairing','debug-connection',
    'debug-reconcile','debug-slot','debug-task-count','debug-request-count','debug-snapshot','debug-feedback'])
    assert.ok(ui.document.getElementById(id),id);
  assert.match(ui.document.getElementById('debug-cloud-summary').textContent,/尚未读取/);
  await ui.click('debug-copy');assert.match(ui.document.getElementById('debug-feedback').textContent,/没有可复制/);
  await ui.click('debug-refresh');assert.equal(reads,1);
  assert.equal(ui.document.getElementById('debug-refresh').disabled,true);
  assert.equal(ui.document.getElementById('debug-copy').disabled,true);
  assert.equal(ui.document.getElementById('workbench-debug').getAttribute('aria-busy'),'true');
  await React.act(async()=>read.resolve(raw));
  assert.equal(ui.document.getElementById('debug-refresh').disabled,false);
  assert.equal(ui.document.getElementById('debug-connection').textContent,'authenticated');
  assert.equal(ui.document.getElementById('debug-pairing').textContent,'已配对');
  assert.equal(ui.document.getElementById('debug-reconcile').textContent,'已对账');
  assert.equal(ui.document.getElementById('debug-slot').textContent,'空闲');
  assert.equal(ui.document.getElementById('debug-task-count').textContent,'1');
  assert.equal(ui.document.getElementById('debug-request-count').textContent,'1');
  await ui.click('debug-copy');
  assert.deepEqual(JSON.parse(copied),JSON.parse(ui.document.getElementById('debug-snapshot').textContent));
  assert.match(ui.document.getElementById('debug-feedback').textContent,/已复制/);
  assert.doesNotMatch(ui.document.body.textContent,/PRIVATE|private\.example|onerror/);
  await ui.render({hidden:true});assert.equal(ui.document.getElementById('workbench-debug').hidden,true);
});

test('R37 rendered read errors clear stale data and clipboard failures stay sanitized',async t=>{
  let fail=false,copyMode='reject',copied='';
  const workbench=controller({client:{cloud:{cloudStatus:async()=>{if(fail)throw Error('TOKEN_PRIVATE');return raw;}}},
    clipboard:{writeText:text=>{copied=text;if(copyMode==='throw')throw Error('TOKEN_PRIVATE');return Promise.reject(Error('TOKEN_PRIVATE'));}}});
  const ui=await mount(t,workbench);
  await ui.click('debug-refresh');await ui.click('debug-copy');
  assert.match(ui.document.getElementById('debug-feedback').textContent,/复制失败/);
  copyMode='throw';await ui.click('debug-copy');
  assert.match(ui.document.getElementById('debug-feedback').textContent,/复制失败/);
  fail=true;await ui.click('debug-refresh');
  for(const id of ['debug-pairing','debug-connection','debug-reconcile','debug-slot','debug-task-count','debug-request-count'])
    assert.equal(ui.document.getElementById(id).textContent,'未知');
  assert.equal(ui.document.getElementById('debug-snapshot').textContent,'未获得可信诊断快照。');
  assert.match(ui.document.getElementById('debug-feedback').textContent,/E_DIAGNOSTICS/);
  copied='';await ui.click('debug-copy');assert.equal(copied,'');
  assert.doesNotMatch(ui.document.body.textContent,/PRIVATE/);
});

test('R37 disabled production page never subscribes and React unmount releases its subscription',async t=>{
  const workbench=controller();const subscribe=workbench.subscribeView;let subscriptions=0;
  workbench.subscribeView=listener=>{subscriptions++;const off=subscribe(listener);return ()=>{subscriptions--;off();};};
  const ui=await mount(t,workbench,{debugEnabled:false});
  assert.equal(ui.document.getElementById('workbench-debug'),null);assert.equal(subscriptions,0);
  await ui.render({debugEnabled:true});assert.equal(subscriptions,1);
  await ui.render({debugEnabled:false});assert.equal(subscriptions,0);
  await ui.render({debugEnabled:true});assert.equal(subscriptions,1);
  await ui.unmount();assert.equal(subscriptions,0);
  await workbench.refresh();assert.equal(ui.document.getElementById('root').childNodes.length,0);
});

test('R37 late reads and clipboard completions cannot overwrite newer state or survive disposal',async()=>{
  const a=pending(),b=pending(),copy=pending();let reads=0,writes=0;
  const workbench=controller({client:{cloud:{cloudStatus:()=>++reads===1?a.promise:b.promise}},
    clipboard:{writeText:()=>{writes++;return copy.promise;}}});
  let notifications=0;workbench.subscribe(()=>notifications++);
  const first=workbench.refresh(),second=workbench.refresh();
  b.resolve({...raw,connection:'offline'});await second;
  a.resolve(raw);await first;assert.equal(workbench.getSnapshot().connection,'offline');
  const copying=workbench.copy();assert.equal(writes,1);
  await workbench.refresh();const state=workbench.getSnapshot();
  copy.resolve();await copying;assert.equal(workbench.getSnapshot(),state);
  const late=pending();
  const disposed=controller({client:{cloud:{cloudStatus:()=>late.promise}},clipboard:null});
  const reading=disposed.refresh();disposed.dispose();
  const last=disposed.getSnapshot();late.resolve(raw);await reading;
  assert.equal(disposed.getSnapshot(),last);assert.equal(last.refreshing,false);
  await disposed.refresh();await disposed.copy();assert.equal(disposed.getSnapshot(),last);
  workbench.dispose();const count=notifications;
  await workbench.refresh();await workbench.copy();assert.equal(notifications,count);assert.equal(writes,1);
});

test('R37 absent clipboard reports a usable fallback and text remains escaped',async t=>{
  const workbench=controller({clipboard:null});const ui=await mount(t,workbench);
  await ui.click('debug-refresh');await ui.click('debug-copy');
  assert.match(ui.document.getElementById('debug-feedback').textContent,/剪贴板不可用/);
  assert.ok(ui.document.getElementById('debug-snapshot').closest('details'));
  assert.equal(ui.document.querySelector('img'),null);
});

test('R37 mounted copy is pending, then unmount and dispose ignore late clipboard feedback',async t=>{
  const copy=pending();let reads=0;
  const workbench=controller({client:{cloud:{cloudStatus:async()=>{reads++;return raw;}}},
    clipboard:{writeText:()=>copy.promise}});
  const ui=await mount(t,workbench);await ui.click('debug-refresh');
  await ui.click('debug-copy');
  assert.equal(ui.document.getElementById('debug-copy').disabled,true);
  assert.equal(ui.document.getElementById('workbench-debug').getAttribute('aria-busy'),'true');
  await ui.unmount();
  // A disposal notification cannot re-enter the Host even from a subscriber.
  workbench.subscribe(()=>{void workbench.refresh();});
  workbench.dispose();const last=workbench.getSnapshot();
  assert.equal(workbench.getViewSnapshot().actions,null);
  assert.equal(workbench.getViewSnapshot().model.disposed,true);
  await React.act(async()=>copy.reject(Error('PRIVATE')));
  assert.equal(workbench.getSnapshot(),last);assert.equal(last.copying,false);
  assert.equal(reads,1);assert.equal(ui.document.getElementById('root').childNodes.length,0);
});

test('R37 React treats diagnostic text as text even if a projection contains markup',async t=>{
  const workbench=controller();
  const state=Object.freeze({...workbench.getSnapshot(),
    summary:'<img src=x onerror=alert(1)>',snapshot:'</pre><script>bad()</script>'});
  workbench.reactUI.renderDebugDiagnostics(state);
  const ui=await mount(t,workbench);
  assert.equal(ui.document.getElementById('debug-cloud-summary').textContent,state.summary);
  assert.equal(ui.document.getElementById('debug-snapshot').textContent,state.snapshot);
  assert.equal(ui.document.querySelector('img,script'),null);
});

test('R37 controller does not project or connect actions into a production app',async()=>{
  const workbench=controller({reactUI:{debugMounted:false,
    renderDebugDiagnostics:forbidden,connectDebugActions:forbidden}});
  await workbench.refresh();workbench.dispose();
  assert.equal(workbench.getSnapshot().disposed,true);
});
