import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {installScrollSiteRuntime,resolveConfiguredConversation} from '../src/site-configuration.js';
import {installFloatingNavigation} from '../src/floating-navigation.js';

const flags=Object.freeze({regionTop:false,regionBottom:false,
  conversationTop:false,conversationBottom:false,floatingTop:false,turnPaging:false,showTurnCount:false});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const {document:doc,window}=parseHTML('<html><body><main id="thread" data-ready="yes"><article data-testid="conversation-turn-1">First</article><article data-testid="conversation-turn-2">Last</article></main></body></html>');
  const main=doc.querySelector('main');
  Object.assign(main,{scrollTop:600,scrollHeight:2400,clientHeight:800});
  main.style.overflowY='auto';
  window.HTMLElement.prototype.getBoundingClientRect=function(){
    const top=this===main?20:40;
    return {left:40,right:1040,top,bottom:820,width:1000,height:820-top};
  };
  const win={location:new URL('https://chatgpt.com/c/one'),innerWidth:1200,innerHeight:900,
    getComputedStyle:node=>({display:node.hidden?'none':node.style.display||'block',
      visibility:node.style.visibility||'visible',overflowY:node.style.overflowY||'visible',
      position:node.style.position||'static'})};
  win.top=win;
  const timers=new Map(),disposals=[],observers=[];let serial=0,disposed=false,deliveries=0;
  const owner={host:doc.createElement('div'),
    on(target,type,fn,options){target.addEventListener?.(type,fn,options);
      const off=()=>target.removeEventListener?.(type,fn,options);disposals.push(off);return off;},
    onDispose:fn=>disposals.push(fn),
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},
    observe(target,fn,options){
      const observer=new window.MutationObserver(records=>{deliveries++;fn(records);});
      observer.observe(target,options);observers.push(observer);return observer;
    },
    dispose(){if(disposed)return;disposed=true;disposals.slice().reverse().forEach(fn=>fn());timers.clear();},
    destroy(){owner.dispose();}
  };
  doc.body.append(owner.host);
  const run=async delay=>{
    for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}
    await settle();
  };
  return {doc,win,main,owner,run,timers,observers,get deliveries(){return deliveries;},
    controls:()=>[...doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')?.shadowRoot.querySelectorAll('button')||[]]};
}
async function mountMain(f,api,t){
  const previous=new Map(['window','document','__scrollReliabilityOwner','__openDeskScrollConfig']
    .map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{f.owner.dispose();for(const [key,value] of previous){
    if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  }});
  Object.assign(globalThis,{window:f.win,document:f.doc,
    __scrollReliabilityOwner:f.owner,__openDeskScrollConfig:api});
  let source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  source=source.replace("import {createPageUI} from '@opendesk/ui';",'const createPageUI=()=>globalThis.__scrollReliabilityOwner;')
    .replace(/from '(\.\/[^']+)'/g,(_match,path)=>"from '"+new URL('../src/'+path,import.meta.url).href+"'");
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await module.default();
}

test('refresh with stored all-off flags never mounts navigation while initial read is delayed',async t=>{
  const f=fixture();let complete;
  const stored={value:{version:1,sites:[],navigation:flags},etag:'all-off'};
  await mountMain(f,{read:()=>new Promise(resolve=>{complete=resolve;})},t);
  await settle();
  assert.equal(f.controls().length,0,'known built-in transcript must not start with default arrows');
  await f.run(120);assert.equal(f.controls().length,0);
  complete(stored);await settle();await f.run(120);
  assert.equal(f.controls().length,0,'successful all-off snapshot remains off');
});

for(const failure of ['rejected','malformed'])for(const stored of ['legacy','all-off'])
test('initial '+failure+' read stays off; recover persisted '+stored+' snapshot',async t=>{
  const f=fixture();let reads=0,recover=false;
  const api={async read(){reads++;
    if(recover)return {value:{version:1,sites:[],...(stored==='all-off'?{navigation:flags}:{})},etag:'saved'};
    if(failure==='rejected')throw Error('storage unavailable');
    return {value:{version:1,sites:[]}};
  }};
  await mountMain(f,api,t);await settle();await f.run(120);
  assert.equal(f.controls().length,0);
  await f.run(1100);await f.run(120);
  assert.equal(f.controls().length,0,'failed retry cannot enable old defaults');
  recover=true;await f.run(1100);await f.run(120);
  assert.ok(reads>=3);assert.equal(f.controls().length,stored==='legacy'?4:0,
    'only successful legacy read enables defaults; stored all-off remains off');
});

test('all seven runtime flags stay false until a successful read, including no bridge',async t=>{
  const f=fixture();t.after(()=>f.owner.dispose());
  const runtime=installScrollSiteRuntime({...f,api:null});
  assert.deepEqual(runtime.navigation(),flags);
  let finish;
  const loading=installScrollSiteRuntime({...f,api:{read:()=>new Promise(resolve=>{finish=resolve;})}});
  await settle();assert.deepEqual(loading.navigation(),flags);
  f.owner.dispose();finish({value:{version:1,sites:[]},etag:'late'});await settle();
  assert.deepEqual(loading.navigation(),flags,'late reply cannot activate a disposed owner');
});

test('custom selector attribute changes refresh through real MutationObserver without own-DOM loops',async t=>{
  const f=fixture();t.after(()=>f.owner.dispose());
  const rule={origin:f.win.location.origin,pathScope:'/c',mainSelector:'[data-ready="yes"]',
    scrollSelector:'#thread',messageSelector:'article',anchorSelector:'',enabled:true};
  let resolutions=0;
  installFloatingNavigation({...f,resolveConversation:()=>{
    resolutions++;return resolveConfiguredConversation(rule,f.doc,f.win);
  }});
  await settle();assert.equal(f.controls().length,4);
  assert.equal([...f.timers.values()].filter(t=>t.delay===120).length,0,'mount mutations schedule no self refresh');
  f.main.setAttribute('data-ready','no');await settle();
  assert.equal([...f.timers.values()].filter(t=>t.delay===120).length,1,'attribute-only mutation schedules a refresh');
  await f.run(120);assert.equal(f.controls().length,0);
  f.main.setAttribute('data-ready','yes');await settle();await f.run(120);
  assert.equal(f.controls().length,4,'attribute restoration remounts without a manual refresh or scroll');
  const stable=resolutions;await f.run(120);await settle();
  assert.equal(resolutions,stable,'dock style/class/children changes cannot perpetuate observer refresh');
  f.owner.dispose();await settle();const deliveries=f.deliveries;
  f.main.setAttribute('data-ready','no');await settle();
  assert.equal(f.deliveries,deliveries,'dispose disconnects observers');
  assert.equal(f.timers.size,0);assert.equal(f.controls().length,0);
});

test('role mutations disable and recover the same four controls without observer loops',async t=>{
  const f=fixture();t.after(()=>f.owner.dispose());
  const [first,last]=f.main.querySelectorAll('article');
  first.setAttribute('data-message-author-role','user');
  last.setAttribute('data-message-author-role','user');
  installFloatingNavigation({...f,resolveConversation:()=>({main:f.main,scroller:f.main,
    site:'chatgpt',selector:'article'})});
  await settle();const controls=f.controls();assert.equal(controls.length,4);
  assert.ok(controls.slice(1,3).some(button=>button.getAttribute('aria-disabled')==='false'));
  for(let i=0;i<3;i++) {
    last.removeAttribute('data-message-author-role');await settle();await f.run(120);
    assert.deepEqual(f.controls(),controls);
    assert.ok(controls.slice(1,3).every(button=>button.getAttribute('aria-disabled')==='true'));
    last.setAttribute('data-message-author-role','user');await settle();await f.run(120);
    assert.deepEqual(f.controls(),controls);
    assert.ok(controls.slice(1,3).some(button=>button.getAttribute('aria-disabled')==='false'));
  }
  assert.equal([...f.timers.values()].filter(timer=>timer.delay===120).length,0,
    'disabled/DOM updates do not schedule endless refreshes');
});
