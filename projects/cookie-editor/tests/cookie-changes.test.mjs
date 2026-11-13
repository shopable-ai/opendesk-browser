import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {cookieChanges} from '../app/domain/cookie-changes.js';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {createCookieObservation} from '../app/controller/cookie-observation.js';
import {createCookieSdkAdapter} from '../app/adapters/browser-sdk.js';
import {createMockSdk} from '../preview/react/src/mock-sdk.js';

const popoverSource=readFileSync(new URL('../app/components/CookieMonitorPopover.jsx',import.meta.url),'utf8');
const popoverCode=transformSync(popoverSource.replace(/^import .*;\n/gm,'').replace('export default function','function'),
  {loader:'jsx',jsx:'transform'}).code;
const CookieMonitorPopover=new Function('React',popoverCode+';return CookieMonitorPopover;')(React);

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(onObservedChange=()=>{}){
  const mock=createMockSdk(),snapshots=[];
  const adapter=createCookieSdkAdapter({getBrowser:()=>mock.browser,request:mock.request});
  const controller=createCookieController({adapter,onChange:value=>snapshots.push(value)});
  let allowed=true;
  const observer=createCookieObservation({adapter,controller,canRun:()=>allowed,onObservedChange});
  return {mock,adapter,controller,observer,snapshots,block:()=>{allowed=false;},
    dispose:()=>{observer.dispose();controller.dispose();mock.dispose();}};
}
test('value-only overwrite is detected once without publishing values or a false deletion',async()=>{
  const f=fixture();
  try{
    await f.controller.load();assert.deepEqual(f.controller.snapshot().changes,[]);
    await f.observer.start();assert.equal(f.observer.snapshot().phase,'running');
    f.mock.simulateCookieChange('value');await f.observer.poll();
    const [change]=f.controller.snapshot().changes;
    assert.equal(change.name,'theme');assert.equal(change.kind,'updated');
    assert.deepEqual(change.fields,['内容或属性']);
    assert.equal(f.controller.snapshot().changes.length,1);
    await f.observer.poll();assert.equal(f.controller.snapshot().changes[0].revision,change.revision);
    assert.doesNotMatch(JSON.stringify(f.snapshots),/sess_demo_only|secret_preview_never_real|"value"|"light"|"night"/);
    assert.equal(f.mock.inspect().calls.some(({op,args})=>op==='get'||op==='set'||args?.includeValues),false);
  }finally{f.dispose();}
});
test('passive sync marks additions and deletions; clearing marks keeps the current baseline',async()=>{
  const f=fixture();
  try{
    await f.controller.load();await f.controller.syncMetadata();assert.deepEqual(f.controller.snapshot().changes,[]);
    f.mock.simulateCookieChange('added');await f.controller.syncMetadata();
    assert.equal(f.controller.snapshot().changes[0].kind,'added');
    f.mock.simulateCookieChange('removed');await f.controller.syncMetadata();
    const removed=f.controller.snapshot().changes.find(row=>row.name==='live_demo');
    assert.equal(removed.kind,'removed');
    assert.equal(f.controller.snapshot().rows.some(row=>row.id===removed.id),false);
    f.controller.clearChanges();await f.controller.syncMetadata();assert.deepEqual(f.controller.snapshot().changes,[]);
    f.mock.simulateCookieChange('added');await f.controller.syncMetadata();
    f.controller.invalidate();assert.deepEqual(f.controller.snapshot().changes,[]);
  }finally{f.dispose();}
});
test('attribute labels are precise and unpartitioned events cannot highlight other scopes',()=>{
  const row={id:'one',name:'sid',domain:'.example.com',path:'/',secure:false,httpOnly:false,session:true};
  const next={...row,secure:true,httpOnly:true};
  assert.deepEqual(cookieChanges([row],[next])[0].fields,['Secure','HttpOnly']);
  const event={name:'sid',domain:'example.com',path:'/'};
  assert.equal(cookieChanges([row],[row],[event]).length,1);
  for(const other of [{...row,id:'two',path:'/other'},
    {...row,id:'three',partitionKey:{topLevelSite:'https://other.example'}},
    {...row,id:'four',domain:'different.example'}])
    assert.deepEqual(cookieChanges([other],[other],[event]),[]);
  const other={...next,id:'other',name:'other'};
  assert.deepEqual(cookieChanges([row,other],[other,row]),[]);
});
test('an edit that begins during an observation read keeps its draft and rejects the late update',async()=>{
  const f=fixture(),pending=deferred();
  try{
    await f.controller.load();await f.observer.start();
    f.adapter.observeRead=()=>pending.promise;
    const read=f.observer.poll();f.block();
    pending.resolve({sessionRef:f.mock.inspect().observations[0],events:[{name:'theme',domain:'shop.example.com',path:'/'}],nextCursor:'1',gapCount:0});
    await read;assert.deepEqual(f.controller.snapshot().changes,[]);
    await f.observer.poll();assert.equal(f.observer.snapshot().phase,'idle');
    await Promise.resolve();assert.deepEqual(f.mock.inspect().observations,[]);
  }finally{f.dispose();}
});
test('stopping a pending start releases its late session and never begins reading',async()=>{
  const f=fixture(),pending=deferred(),stopped=[];
  try{
    await f.controller.load();
    f.adapter.observeStart=()=>pending.promise;
    f.adapter.observeStop=async(target,ref)=>{stopped.push(ref);};
    const starting=f.observer.start();f.observer.stop();
    pending.resolve({sessionRef:'late',expiresAt:Date.now()+10000});await starting;
    await Promise.resolve();assert.deepEqual(stopped,['late']);
    assert.equal(f.observer.snapshot().phase,'idle');
  }finally{f.dispose();}
});
test('navigation retires observation results, and authorization denial clears old data',async()=>{
  for(const navigate of [true,false]){
    const f=fixture(),pending=deferred();
    try{
      await f.controller.load();await f.observer.start();
      f.adapter.observeRead=()=>pending.promise;
      const reading=f.observer.poll();
      if(navigate)f.controller.invalidate();else f.block();
      pending.reject(Object.assign(Error('denied'),{code:'E_GRANT_REVOKED'}));await reading;
      assert.deepEqual(f.controller.snapshot().rows,[]);
      assert.deepEqual(f.controller.snapshot().changes,[]);
      if(!navigate)assert.equal(f.controller.snapshot().phase,'blocked');
    }finally{f.dispose();}
  }
});
test('event gaps trigger a fresh metadata read and an explicit incomplete-history status',async()=>{
  const f=fixture();
  try{
    await f.controller.load();await f.observer.start();
    const sessionRef=f.mock.inspect().observations[0];
    f.mock.simulateCookieChange('added');
    f.adapter.observeRead=async()=>({sessionRef,events:[],nextCursor:'51',gapCount:50});
    await f.observer.poll();assert.equal(f.observer.snapshot().gap,true);
    assert.equal(f.controller.snapshot().changes[0].name,'live_demo');
  }finally{f.dispose();}
});
test('the observation expires without renewal or background reads',async()=>{
  const f=fixture();let clock=Date.now();
  const observer=createCookieObservation({adapter:f.adapter,controller:f.controller,canRun:()=>true,now:()=>clock});
  try{
    await f.controller.load();clock=Date.now();
    const start=f.adapter.observeStart;
    f.adapter.observeStart=async target=>({...await start(target),expiresAt:clock+30000});
    await observer.start();
    clock=observer.snapshot().expiresAt;await observer.poll();
    assert.equal(observer.snapshot().phase,'ended');
    await Promise.resolve();assert.deepEqual(f.mock.inspect().observations,[]);
  }finally{observer.dispose();f.dispose();}
});
test('change marks stay bounded and snapshot consumers cannot mutate their baseline',async()=>{
  let rows=[];
  const adapter={targetFor:async()=>({target:{hostname:'example.com',origin:'https://example.com',url:'https://example.com/'}}),
    checkRead:async()=>({callableNow:true}),list:async()=>rows,
    getStore:async()=>({storeId:'0'}),
    getPartition:async()=>({partitionKey:{topLevelSite:'https://example.com'}})};
  const controller=createCookieController({adapter});
  try{
    await controller.load();
    rows=Array.from({length:125},(_,index)=>({name:'key_'+index,domain:'example.com',path:'/',hostOnly:true,storeId:'0',session:true}));
    await controller.syncMetadata();
    const snapshot=controller.snapshot();assert.equal(snapshot.changes.length,100);
    snapshot.changes[0].fields.push('mutated');snapshot.changes[0].name='changed';
    assert.equal(controller.snapshot().changes[0].name,'key_0');
    assert.deepEqual(controller.snapshot().changes[0].fields,[]);
    await controller.syncMetadata();assert.equal(controller.snapshot().changes.length,100);
  }finally{controller.dispose();}
});
test('a malformed observer receipt stops cleanly without accepting its events',async()=>{
  const f=fixture();
  try{
    await f.controller.load();await f.observer.start();
    f.adapter.observeRead=async()=>({sessionRef:'another-session',events:[{value:'UNTRUSTED_VALUE'}],nextCursor:'1',gapCount:0});
    await f.observer.poll();assert.equal(f.observer.snapshot().phase,'error');
    assert.deepEqual(f.controller.snapshot().changes,[]);
    assert.doesNotMatch(JSON.stringify(f.snapshots),/UNTRUSTED_VALUE/);
  }finally{f.dispose();}
});
test('clearing marks during a read accepts current rows without restoring retired marks',async()=>{
  const f=fixture(),pending=deferred();
  try{
    await f.controller.load();
    const row=f.controller.snapshot().rows[0];
    f.adapter.list=()=>pending.promise;
    const reading=f.controller.syncMetadata();f.controller.clearChanges();
    pending.resolve([{...row,name:'new_key'}]);await reading;
    assert.equal(f.controller.snapshot().rows[0].name,'new_key');
    assert.deepEqual(f.controller.snapshot().changes,[]);
  }finally{f.dispose();}
});

// Execute current JSX with persistent hook slots and inert effects: no browser,
// timers, host permissions or unrelated business components are mounted.
function appMonitor(){
  const source=readFileSync(new URL('../app/CookieEditorApp.jsx',import.meta.url),'utf8');
  const names=[...source.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from /gm)]
    .flatMap(m=>m[1]?m[1].split(',').map(x=>x.trim()):[m[2]]);
  const deps=Object.fromEntries(names.map(name=>[name,name]));
  const snapshot={phase:'ready',epoch:1,rows:[],changes:[],target:{hostname:'example.com',url:'https://example.com/'}};
  Object.assign(deps,{cookiePackage:{version:'test'},createCookieSdkAdapter:()=>({}),
    createCookieController:()=>({snapshot:()=>snapshot})});
  const slots=[];let cursor=0;
  const React={useRef(value){const i=cursor++;return slots[i]??={current:value};},
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;
      return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useEffect(){},useLayoutEffect(){},
    createElement(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)};}};
  const code=transformSync(source.replace(/^import .*;\n/gm,'').replace('export default function','function'),
    {loader:'jsx',jsx:'transform'}).code;
  const App=new Function('React',...Object.keys(deps),code+';return CookieEditorApp;')(React,...Object.values(deps));
  const nodes=node=>node&&typeof node==='object'?[node,...(node.children||[]).flatMap(nodes)]:[];
  return {render(epoch=1){snapshot.epoch=epoch;cursor=0;
    const tree=App({hostRoot:{},request(){}});
    return nodes(tree).find(n=>n.type==='CookieEditorView').props.monitor.props;
  }};
}
test('first accepted observer event notifies once across polls, restarts and epoch remounts',async()=>{
  const original=globalThis.OpenDeskTool,notices=[];
  globalThis.OpenDeskTool={ui:{notify:notice=>{notices.push(notice);return true;}}};
  const app=appMonitor();
  const f=fixture(app.render().onObservedChange);
  let remounted;
  try{
    await f.controller.load();await f.observer.start();
    await f.observer.poll();assert.equal(notices.length,0,'empty poll');
    const list=f.adapter.list,pending=deferred();
    f.adapter.list=()=>pending.promise;
    f.mock.simulateCookieChange('value');
    const polling=f.observer.poll();
    await Promise.resolve();await Promise.resolve();
    assert.equal(notices.length,0,'metadata receipt is still pending');
    pending.resolve(await list(f.controller.snapshot().target));await polling;
    assert.equal(f.controller.snapshot().changes.length,1);
    assert.equal(notices.length,1);
    assert.equal(notices[0].type,'success');
    f.adapter.list=list;
    f.mock.simulateCookieChange('value');await f.observer.poll();
    f.observer.stop();await f.observer.start();
    f.mock.simulateCookieChange('added');await f.observer.poll();
    f.observer.dispose();
    remounted=createCookieObservation({adapter:f.adapter,controller:f.controller,canRun:()=>true,
      onObservedChange:app.render(2).onObservedChange});
    await remounted.start();f.mock.simulateCookieChange('value');await remounted.poll();
    assert.equal(notices.length,1,'App lifetime outlives the monitor session and epoch');
  }finally{remounted?.dispose();f.dispose();globalThis.OpenDeskTool=original;}
});
test('gap-only refresh does not notify or consume the first actual event',async()=>{
  let notices=0;const f=fixture(()=>notices++);
  try{
    await f.controller.load();await f.observer.start();
    const read=f.adapter.observeRead,sessionRef=f.mock.inspect().observations[0];
    f.mock.simulateCookieChange('added');
    f.adapter.observeRead=async()=>({sessionRef,events:[],nextCursor:'0',gapCount:1});
    await f.observer.poll();
    assert.equal(f.observer.snapshot().gap,true);
    assert.equal(f.controller.snapshot().changes.length,1);
    assert.equal(notices,0);
    f.adapter.observeRead=read;await f.observer.poll();assert.equal(notices,1);
  }finally{f.dispose();}
});
test('cancellation during event reads or metadata sync and rejected sync never notify',async()=>{
  for(const stage of ['read','sync','rejected']){
    let notices=0;const f=fixture(()=>notices++),pending=deferred(),syncEntered=deferred();
    try{
      await f.controller.load();await f.observer.start();
      const sessionRef=f.mock.inspect().observations[0];
      if(stage==='read')f.adapter.observeRead=()=>pending.promise;
      else{
        f.mock.simulateCookieChange('value');
        f.controller.syncMetadata=()=>{syncEntered.resolve();return pending.promise;};
      }
      const polling=f.observer.poll();
      if(stage!=='read')await syncEntered.promise;
      if(stage!=='rejected')f.observer.stop();
      pending.resolve(stage==='read'?{sessionRef,events:[{name:'theme',domain:'shop.example.com',path:'/'}],nextCursor:'1',gapCount:0}:stage!=='rejected');
      await polling;assert.equal(notices,0,stage);
    }finally{f.dispose();}
  }
});

test('idle monitor exposes the toolbar icon without a permanent status block',()=>{
  const source=readFileSync(new URL('../app/components/CookieChangeMonitor.jsx',import.meta.url),'utf8');
  const code=transformSync(source.replace(/^import .*;\n/gm,'').replace('export default function','function'),
    {loader:'jsx',jsx:'transform'}).code;
  const Monitor=new Function('React','createCookieObservation','CookieMonitorPopover',code+';return CookieChangeMonitor;')(React,createCookieObservation,CookieMonitorPopover);
  const props={
    adapter:{supportsObservation:()=>true},controller:{},available:true,onOnlyChanged(){}
  };
  const html=renderToStaticMarkup(React.createElement(Monitor,props));
  assert.equal((html.match(/<button /g)||[]).length,1);
  assert.match(html,/aria-label="更多 Cookie 操作"/);
  assert.doesNotMatch(html,/<p(?:\s|>)|role="dialog"|开始监听 30 秒/);
});
