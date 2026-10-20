import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {initSidebarToolSandbox,sidebarToolRequestTimeout,ADBLOCK_CONFIRM_OPERATIONS} from '../../src/sidebar-tools/bridge.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {browserOperation,normalizeBrowserOperation,BROWSER_HOST_PROTOCOL,BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {SIDEBAR_TOOL_FORMAT_V2,SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {officialFixtureFetch} from '../helpers/official-tools.mjs';

const tool={format:SIDEBAR_TOOL_FORMAT_V2,id:'export-example',version:'1.0.0',title:'Export',
  description:'generic export fixture',capabilities:['user.export'],html:'<main>Export</main>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}};
const copy='browser.clipboard.writeText',download='browser.downloads.text';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(check){
  for(let i=0;i<100;i++){if(check())return;await tick();}
  assert.fail('export fixture did not settle');
}
class Port {
  closed=false;sent=[];onmessage=null;
  postMessage(message){
    if(this.closed)return;
    const data=structuredClone(message);this.sent.push(data);
    // Real port events may be trusted while every data field is hostile.
    queueMicrotask(()=>{if(!this.peer.closed)this.peer.onmessage?.({data,isTrusted:true});});
  }
  close(){this.closed=true;}
}
class Channel {
  constructor(){this.port1=new Port();this.port2=new Port();this.port1.peer=this.port2;this.port2.peer=this.port1;}
}
class Events {
  listeners=new Map();
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(row=>row!==fn));}
  emit(type,event,...args){for(const fn of this.listeners.get(type)||[]){fn(event,...args);if(event.stopped)break;}}
}

// Node cannot manufacture Chromium trusted clicks. This double models the
// unforgeable WebIDL getters and dispatch lifetime; native Chrome is NOT_TESTED.
function sandbox({loaded={protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:'frame-1',tool},port=new Port(),send=()=>{},timers={setTimeout,clearTimeout},clock={now:()=>performance.now()}}={}){
  if(!port.peer){port.peer=new Port();port.peer.peer=port;}
  const states=new WeakMap();let eventSequence=0;
  class NativeEvent {
    constructor(type){states.set(this,{type,trusted:false,currentTarget:null,timeStamp:++eventSequence});
      Object.defineProperty(this,'isTrusted',{get(){return states.get(this).trusted;}});}
    get currentTarget(){return states.get(this).currentTarget;}
    get timeStamp(){return states.get(this).timeStamp;}
    stopImmediatePropagation(){this.stopped=true;}
  }
  const win=new Events(),root=new Events(),status={dataset:{}},publicMessages=[];
  Object.assign(root,{replaceChildren(){},querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0,bottom:100})});
  const parent={postMessage(message){publicMessages.push(message);send(message);}};
  const node=()=>({append(){},addEventListener(){}});
  // Run the real timeout lookup in the tool's realm: passing an outer-realm
  // function would hide mutations to Object.hasOwn used by browserOperation.
  const realm=runInNewContext(`const browserOperation=(${browserOperation.toString()});
    const sidebarToolRequestTimeout=(${sidebarToolRequestTimeout.toString()});
    (${initSidebarToolSandbox.toString()})(); ({Reflect,Function,Promise,Object,Map,Set,Number,globalThis})`,{
    SIDEBAR_TOOL_PROTOCOL,createBrowserSdk,BROWSER_OPERATIONS,ADBLOCK_CONFIRM_OPERATIONS,normalizeBrowserOperation,performance:clock,
    window:win,parent,Event:NativeEvent,MessagePort:Port,
    document:{getElementById:id=>id==='tool-root'?root:status,documentElement:{},head:node(),body:node(),createElement:node},
    Blob,URL:{createObjectURL:()=> 'blob:export-fixture',revokeObjectURL(){}},...timers,requestAnimationFrame:()=>0
  });
  let leaked=false;
  win.addEventListener('message',event=>{if(event.ports?.length)leaked=true;});
  const event=new NativeEvent('message');Object.assign(event,{source:parent,data:loaded,ports:loaded.withoutPort?[]:[port]});
  win.emit('message',event);
  const pending=[];
  // Use an outer-realm observer so deliberate sandbox .then tampering cannot
  // intercept the test observer or hide a Bridge rejection.
  const track=promise=>{
    const observed=new Promise((resolve,reject)=>Reflect.apply(Promise.prototype.then,promise,[resolve,reject]));
    pending.push(observed.catch(()=>{}));return observed;
  };
  const request=(operation=copy,payload={text:'text'})=>{
    const promise=win.OpenDeskTool.request(operation,payload);pending.push(promise.catch(()=>{}));return promise;
  };
  const dispatch=(event,run)=>{
    const state=states.get(event);state.currentTarget=win;
    try{win.emit('click',event);return run(event);}finally{state.currentTarget=null;}
  };
  return {win,port,publicMessages,request,NativeEvent,realm,get leaked(){return leaked;},
    prepare:factory=>track(win.OpenDeskSDK.browser.downloads.prepareText(factory)),
    click(run,timeStamp){const event=new NativeEvent('click');states.get(event).trusted=true;
      if(timeStamp!==undefined)states.get(event).timeStamp=timeStamp;return dispatch(event,run);},
    async dispatchMicrotask(run){
      const event=new NativeEvent('click'),state=states.get(event);state.trusted=true;state.currentTarget=win;
      try{win.emit('click',event);await Promise.resolve().then(run);}finally{state.currentTarget=null;}
    },
    synthetic(run,event=new NativeEvent('click')){states.get(event).trusted=false;return dispatch(event,run);},
    respond(message){win.emit('message',{source:parent,data:message});},
    async dispose(){win.emit('pagehide',{});await Promise.all(pending);}
  };
}

test('bridge: one synchronous export per native click; private handshake and public fallback',async()=>{
  const b=sandbox();
  try{
    assert.equal(b.leaked,false,'later message listeners cannot steal the transferred port');
    b.click(()=>{void b.request(copy,{text:'first'});void b.request(download,{text:'second',filename:'two.txt'});});
    assert.equal(b.port.sent.length,1);assert.equal(b.port.sent[0].payload.text,'first');
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,1);
    b.click(()=>void b.request(download,{text:'third',filename:'three.txt'}));
    assert.equal(b.port.sent.length,2,'a separate real click has its own delivery');
  }finally{await b.dispose();}
});

test('bridge: a label-forwarded trusted click cannot replenish one consumed input',async()=>{
  const b=sandbox();
  try{
    b.click(()=>void b.request(copy,{text:'label'}),123.5);
    b.click(()=>void b.request(download,{text:'forwarded',filename:'two.txt'}),123.5);
    assert.equal(b.port.sent.length,1);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,1,
      'forwarded control must use the existing Host review');
    b.click(()=>void b.request(copy,{text:'next independent input'}),124);
    assert.equal(b.port.sent.length,2);
  }finally{await b.dispose();}
});

test('bridge: synthetic/replayed events, background and microtasks after dispatch do not attest clicks',async()=>{
  const b=sandbox();
  try{
    void b.request();b.synthetic(()=>void b.request());
    let saved;
    b.click(event=>{saved=event;});
    void b.request();
    b.synthetic(()=>void b.request(),saved);
    await b.click(()=>Promise.resolve().then(()=>void b.request()));
    assert.equal(b.port.sent.length,0);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,5);
    b.click(()=>void b.request('storage.get',{key:'notes'}));
    assert.equal(b.port.sent.length,0,'only the two export operations may use the port');
  }finally{await b.dispose();}
});

test('bridge: a microtask still inside native dispatch may consume that click exactly once',async()=>{
  const b=sandbox();
  try{
    await b.dispatchMicrotask(()=>{void b.request();void b.request();});
    assert.equal(b.port.sent.length,1);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,1);
  }finally{await b.dispose();}
});

test('bridge: captured getters and port functions withstand prototype tampering',async()=>{
  const b=sandbox(),post=Port.prototype.postMessage,close=Port.prototype.close;
  try{
    Object.defineProperty(b.NativeEvent.prototype,'currentTarget',{get:()=>b.win,configurable:true});
    Object.defineProperty(b.NativeEvent.prototype,'timeStamp',{get:()=>Math.random(),configurable:true});
    Object.defineProperty(b.NativeEvent.prototype,'isTrusted',{get:()=>true,configurable:true});
    b.NativeEvent.prototype.stopImmediatePropagation=()=>{};
    b.realm.Reflect.apply=()=>assert.fail('tool intercepted native invocation');
    b.realm.Function.prototype.call=()=>assert.fail('tool intercepted call');
    b.realm.Function.prototype.apply=()=>assert.fail('tool intercepted apply');
    Port.prototype.postMessage=()=>assert.fail('tool intercepted private port');
    Port.prototype.close=()=>assert.fail('tool intercepted private close');
    b.synthetic(()=>void b.request());
    b.click(event=>{
      Object.defineProperty(event,'currentTarget',{value:null});
      void b.request();
    });
    assert.equal(b.port.sent.length,1);
    void b.request();assert.equal(b.port.sent.length,1,'fake getter cannot extend dispatch');
    await b.dispose();assert.equal(b.port.closed,true);
    b.click(()=>void b.request());assert.equal(b.port.sent.length,1,'pagehide permanently revokes the channel');
  }finally{Port.prototype.postMessage=post;Port.prototype.close=close;await b.dispose();}
});

test('bridge: lost export acknowledgement is unknown and never falls back to window delivery',async()=>{
  let expire;
  const b=sandbox({timers:{setTimeout:callback=>{expire=callback;return 1;},clearTimeout(){}}});
  try{
    const result=b.click(()=>b.request());expire();
    await assert.rejects(result,{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(b.port.sent.length,1);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,0);
  }finally{await b.dispose();}
});

test('bridge: a failed private send does not replay through the public channel',async()=>{
  const post=Port.prototype.postMessage;
  let b;
  try{
    Port.prototype.postMessage=()=>{throw Error('delivery unknown');};
    b=sandbox();Port.prototype.postMessage=post;
    await assert.rejects(b.click(()=>b.request()),{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,0);
  }finally{Port.prototype.postMessage=post;await b?.dispose();}
});

function acknowledge(b,message,result={exported:true}){
  b.respond({...message,kind:'response',ok:true,result});
}
function preparedSandbox(options={}){
  const b=sandbox(options);
  b.port.peer.onmessage=({data})=>acknowledge(b,data);
  return b;
}
test('prepareText: fresh async read, single-read getters and one canonical send allocated after reads',async()=>{
  let b,filenameReads=0,textReads=0;
  b=preparedSandbox({send:message=>{
    if(message.kind==='request')queueMicrotask(()=>acknowledge(b,message,{text:'fresh storage bytes'}));
  }});
  try{
    const result=await b.click(()=>b.prepare(async()=>{
      const fresh=await b.win.OpenDeskTool.request('storage.get',{key:'notes'});
      return {get filename(){filenameReads++;return 'notes.json';},get text(){textReads++;return fresh.text;}};
    }));
    assert.deepEqual(result,{exported:true});
    const reads=b.publicMessages.filter(row=>row.kind==='request');
    assert.equal(reads.length,1);assert.equal(reads[0].requestId,'1');
    assert.equal(b.port.sent.length,1);assert.equal(b.port.sent[0].requestId,'2');
    assert.equal(b.port.sent[0].operation,download);
    assert.deepEqual(b.port.sent[0].payload,normalizeBrowserOperation(download,{filename:'notes.json',text:'fresh storage bytes'}));
    assert.equal(filenameReads,1);assert.equal(textReads,1);
  }finally{await b.dispose();}
});

test('prepareText: helper and text share clicks in both directions, including forwarded labels',async()=>{
  const b=preparedSandbox();let called=0;
  try{
    await b.click(async()=>{
      const first=b.prepare(()=>({filename:'one.txt',text:'first'}));
      void b.request(download,{filename:'second.txt',text:'review'});
      await first;
    },100);
    await assert.rejects(b.click(()=>b.prepare(()=>{called++;}),100),{code:'E_EXPORT_GESTURE'});
    let denied;
    b.click(()=>{
      void b.request(download,{filename:'direct.txt',text:'direct'});
      denied=b.prepare(()=>{called++;});
    },101);
    await assert.rejects(denied,{code:'E_EXPORT_GESTURE'});
    await assert.rejects(b.click(()=>b.prepare(()=>{called++;}),101),{code:'E_EXPORT_GESTURE'});
    // An intervening input cannot make an older forwarded label reusable.
    await assert.rejects(b.click(()=>b.prepare(()=>{called++;}),100),{code:'E_EXPORT_GESTURE'});
    assert.equal(called,0);assert.equal(b.port.sent.length,2);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,1);
  }finally{await b.dispose();}
});

test('prepareText: background, synthetic, expired dispatch, missing port and Cookie capability never invoke factory',async()=>{
  let called=0;
  const factory=()=>{called++;return {filename:'no.txt',text:'no'};};
  const b=preparedSandbox();
  try{
    await assert.rejects(b.prepare(factory),{code:'E_EXPORT_GESTURE'});
    await assert.rejects(b.synthetic(()=>b.prepare(factory)),{code:'E_EXPORT_GESTURE'});
    b.click(()=>{});
    await assert.rejects(b.prepare(factory),{code:'E_EXPORT_GESTURE'});
    await assert.rejects(b.click(()=>Promise.resolve().then(()=>b.prepare(factory))),{code:'E_EXPORT_GESTURE'});
    assert.equal(b.port.sent.length,0);
  }finally{await b.dispose();}
  for(const options of [
    {loaded:{protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:'cookies',tool:{...tool,capabilities:['user.export','browser.cookies.read']}}},
    {port:null}
  ]){
    // A handshake with no transferred endpoint is a supported older Host.
    const instance=sandbox(options.port===null?{loaded:{protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:'old-host',tool,withoutPort:true}}:options);
    try{
      await assert.rejects(instance.click(()=>instance.prepare(factory)),{code:'E_EXPORT_GESTURE'});
      assert.equal(instance.port.sent.length,0);
    }finally{await instance.dispose();}
  }
  assert.equal(called,0);
});

test('prepareText: throw, reject, invalid factory, extra keys, unsafe filename and byte overflow never send',async()=>{
  const b=preparedSandbox(),failure=new Error('fresh read failed');
  const factories=[
    ()=>{throw failure;},()=>Promise.reject(failure),null,
    ()=>({filename:'x.txt',text:'bytes',extra:true}),
    ()=>Object.defineProperty({filename:'x.txt',text:'bytes'},'hidden',{value:true}),
    ()=>({filename:'x.txt',text:'bytes',[Symbol('extra')]:true}),
    ()=>({filename:'../x.txt',text:'bytes'}),()=>({filename:'x.txt',text:'中'.repeat(50001)}),
    ()=>({filename:'x.txt',text:''}),()=>undefined,
    ()=>Object.defineProperty({},'then',{get(){throw failure;}}),
    ()=>{const value=Promise.resolve({filename:'x.txt',text:'bytes'});Object.defineProperty(value,'constructor',{get(){throw failure;}});return value;}
  ];
  try{
    for(const factory of factories)await assert.rejects(b.click(()=>b.prepare(factory)));
    assert.equal(b.port.sent.length,0);assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,0);
  }finally{await b.dispose();}
});

test('prepareText: a factory unknown read outcome is a known unsent export failure',async()=>{
  const b=preparedSandbox(),cause=Object.assign(new Error('read outcome unknown'),{code:'E_OUTCOME_UNKNOWN'});
  try{
    await assert.rejects(b.click(()=>b.prepare(()=>Promise.reject(cause))),error=>{
      assert.equal(error.code,'E_EXPORT_PREPARE');assert.equal(error.cause,cause);return true;
    });
    assert.equal(b.port.sent.length,0);
  }finally{await b.dispose();}
});

test('prepareText: thenable resolves once; getter reentry cannot obtain another reservation',async()=>{
  const b=preparedSandbox();let thenReads=0,reentry,fieldReads=0;
  try{
    await b.click(()=>b.prepare(()=>{
      reentry=b.prepare(()=>assert.fail('nested factory must not run'));
      return {get then(){thenReads++;return (resolve,reject)=>{
        resolve({filename:'first.txt',get text(){fieldReads++;return 'first';}});
        resolve({filename:'second.txt',text:'second'});reject(new Error('late rejection'));
      };}};
    }));
    await assert.rejects(reentry,{code:'E_EXPORT_GESTURE'});
    assert.equal(thenReads,1);assert.equal(fieldReads,1);
    assert.equal(b.port.sent.length,1);assert.equal(b.port.sent[0].payload.text,'first');
  }finally{await b.dispose();}
});

test('prepareText: immutable Promise constructor/species protects private observers from tool prototypes',async()=>{
  const b=preparedSandbox(),P=b.realm.Promise;let stolen=0;
  try{
    Object.defineProperty(P.prototype,'constructor',{configurable:true,get(){stolen++;throw Error('stolen constructor');}});
    Object.defineProperty(P,Symbol.species,{configurable:true,get(){stolen++;throw Error('stolen species');}});
    P.prototype.then=()=>{stolen++;throw Error('stolen private handlers');};
    P.resolve=P.reject=()=>assert.fail('mutable Promise static used');
    b.realm.globalThis.Promise=function(){assert.fail('mutable Promise ctor used');};
    await b.click(()=>b.prepare(()=>({filename:'safe.txt',text:'safe'})));
    assert.equal(stolen,0);assert.equal(b.port.sent.length,1);
  }finally{await b.dispose();}
});

for(const hook of ['then','ownKeys','filename','text'])test('prepareText: '+hook+' getter reentry cannot regain the spent click',async()=>{
  const b=preparedSandbox();let nested,reads=0;
  const reenter=()=>{
    reads++;
    nested=b.prepare(()=>assert.fail('getter reentry obtained a reservation'));
    void b.request(download,{filename:'review.txt',text:'review'});
  };
  try{
    await b.click(()=>b.prepare(()=>{
      const data={filename:'one.txt',text:'one'};
      if(hook==='then')return {get then(){reenter();return resolve=>resolve(data);}};
      if(hook==='ownKeys')return new Proxy(data,{ownKeys(target){reenter();return Reflect.ownKeys(target);}});
      return Object.defineProperty(data,hook,{get(){reenter();return hook==='filename'?'one.txt':'one';}});
    }));
    await assert.rejects(nested,{code:'E_EXPORT_GESTURE'});
    assert.equal(reads,1);assert.equal(b.port.sent.length,1);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,1);
  }finally{await b.dispose();}
});

test('prepareText: concurrent preparations bind payloads and allocate IDs in delivery order',async()=>{
  const b=preparedSandbox();let release;
  try{
    const slow=b.click(()=>b.prepare(()=>new Promise(resolve=>{release=resolve;})));
    await b.click(()=>b.prepare(()=>({filename:'fast.txt',text:'fast'})));
    release({filename:'slow.txt',text:'slow'});await slow;
    assert.deepEqual(b.port.sent.map(row=>[row.requestId,row.payload.filename]),[['1','fast.txt'],['2','slow.txt']]);
  }finally{await b.dispose();}
});

test('prepareText: captured timers, monotonic clock receiver, collections and finite check survive replacement',async()=>{
  let time=100;
  const tasks=new Map(),clock={now(){assert.equal(this,clock);return time;}};
  let next=0;
  const b=preparedSandbox({clock,timers:{setTimeout(fn,ms){tasks.set(++next,{fn,ms});return next;},clearTimeout(id){tasks.delete(id);}}});
  try{
    const sabotage=()=>assert.fail('tool mutable intrinsic used for private state');
    b.realm.globalThis.setTimeout=b.realm.globalThis.clearTimeout=sabotage;
    b.realm.globalThis.performance={now:sabotage};clock.now=sabotage;
    b.realm.Number.isFinite=sabotage;
    for(const name of ['get','set','delete','forEach','clear'])b.realm.Map.prototype[name]=sabotage;
    for(const name of ['add','has','delete','forEach','clear'])b.realm.Set.prototype[name]=sabotage;
    let release;
    const result=b.click(()=>b.prepare(()=>new Promise(resolve=>{release=resolve;})));
    assert.equal([...tasks.values()][0].ms,8000);
    time+=5;release({filename:'safe.txt',text:'safe'});await result;
    assert.equal(tasks.size,0);assert.equal(b.port.sent.length,1);
    const pending=b.click(()=>b.prepare(()=>new Promise(()=>{})));
    await b.dispose();await assert.rejects(pending,{code:'E_TOOL_DISPOSED'});
  }finally{await b.dispose();}
});

for(const phase of ['factory-block','getter-block','late-resolve','timer-fired','closed'])
test('prepareText: '+phase+' terminates without sending or fallback',async()=>{
  let time=100,next=0;
  const tasks=new Map(),b=preparedSandbox({clock:{now:()=>time},
    timers:{setTimeout(fn,ms){tasks.set(++next,{fn,ms});return next;},clearTimeout(id){tasks.delete(id);}}});
  let release;
  try{
    const result=b.click(()=>b.prepare(()=>{
      if(phase==='factory-block'){time+=8000;return {filename:'late.txt',text:'late'};}
      if(phase==='getter-block')return {filename:'late.txt',get text(){time+=8000;return 'late';}};
      return new Promise(resolve=>{release=resolve;});
    }));
    if(phase==='late-resolve')time+=8001;
    if(phase==='timer-fired')for(const {fn} of [...tasks.values()])fn();
    if(phase==='closed')await b.dispose();
    release?.({filename:'late.txt',text:'late'});await assert.rejects(result,{code:phase==='closed'?'E_TOOL_DISPOSED':'E_TOOL_TIMEOUT'});
    await tick();assert.equal(b.port.sent.length,0);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,0);
  }finally{await b.dispose();}
});

for(const phase of ['deadline','pagehide','throw'])test(`prepareText: real same-realm timeout lookup ${phase} cannot bypass final send check`,async()=>{
  let time=100,next=0,lookups=0;
  const tasks=new Map(),failure=new Error('timeout lookup failed');
  const b=preparedSandbox({clock:{now:()=>time},timers:{
    setTimeout(fn,ms){tasks.set(++next,{fn,ms});return next;},clearTimeout(id){tasks.delete(id);}
  }});
  const hasOwn=b.realm.Object.hasOwn;
  try{
    b.realm.Object.hasOwn=(object,name)=>{
      const result=hasOwn(object,name);
      if(name===download){
        lookups++;
        if(phase==='deadline')time+=9000;
        if(phase==='pagehide')b.win.emit('pagehide',{});
        if(phase==='throw')throw failure;
      }
      return result;
    };
    const result=b.click(()=>b.prepare(()=>({filename:'blocked.txt',text:'never sent'})));
    await tick();
    assert.equal(lookups,1,'the actual timeout lookup must execute the mutated same-realm Object.hasOwn');
    assert.equal(tasks.size,0,'both preparation and request timers must be cleared');
    await assert.rejects(result,phase==='throw'?error=>error===failure:
      {code:phase==='deadline'?'E_TOOL_TIMEOUT':'E_TOOL_DISPOSED'});
    let responseReads=0;
    b.respond({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'response',instance:'frame-1',toolId:tool.id,requestId:'1',
      get ok(){responseReads++;return true;}});
    assert.equal(responseReads,0,'a blocked request must be removed from waiting');
    await tick();
    assert.equal(b.port.sent.length,0);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,0);
    if(phase!=='pagehide'){
      b.realm.Object.hasOwn=hasOwn;
      await b.click(()=>b.prepare(()=>({filename:'next.txt',text:'fresh click'})));
      assert.equal(b.port.sent.length,1,'a new click may start a new request');
      assert.equal(b.port.sent[0].requestId,'2');
      assert.equal(tasks.size,0);
    }
  }finally{await b.dispose();}
});

for(const operation of [copy,download,'prepareText','tool.storage.get'])test(`bridge: pagehide settles ${operation} with an explicit outcome and no retry`,async()=>{
  let next=0;const tasks=new Map();
  const b=sandbox({timers:{
    setTimeout(fn,ms){tasks.set(++next,{fn,ms});return next;},clearTimeout(id){tasks.delete(id);}
  }});
  try{
    const exported=operation!=='tool.storage.get';
    const result=operation==='prepareText'?
      b.click(()=>b.prepare(()=>({filename:'sent.txt',text:'sent'}))):
      b.click(()=>b.request(operation,operation===download?{filename:'sent.txt',text:'sent'}:{text:'sent'}));
    await tick();
    assert.equal(b.port.sent.length,exported?1:0);
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,exported?0:1);
    assert.equal(tasks.size,1,'only the receipt timer remains');
    const lateTimers=[...tasks.values()];
    await b.dispose();
    await assert.rejects(result,{code:exported?'E_OUTCOME_UNKNOWN':'E_TOOL_DISPOSED'});
    assert.equal(tasks.size,0);
    for(const {fn} of lateTimers)fn();
    for(const message of b.port.sent)acknowledge(b,message);
    await tick();
    assert.equal(b.port.sent.length,exported?1:0,'closing never replays a request');
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,exported?0:1);
  }finally{await b.dispose();}
});

test('prepareText: after send a lost acknowledgement remains unknown and never replays',async()=>{
  let next=0;const tasks=new Map();
  const b=sandbox({timers:{setTimeout(fn,ms){tasks.set(++next,{fn,ms});return next;},clearTimeout(id){tasks.delete(id);}}});
  try{
    const result=b.click(()=>b.prepare(()=>({filename:'sent.txt',text:'sent'})));
    await tick();assert.equal(b.port.sent.length,1);
    for(const {fn} of [...tasks.values()])fn();
    await assert.rejects(result,{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(b.publicMessages.filter(row=>row.kind==='request').length,0);
  }finally{await b.dispose();}
});

async function hostFixture(t,{capabilities=tool.capabilities}={}){
  const installed={...tool,capabilities};
  const descriptors=new Map(['window','navigator','location','MessageChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const win=new Events(),copied=[],downloads=[],calls=[],store=new Map([[SIDEBAR_TOOL_STORE,[installed]]]);
  const {document:doc}=parseHTML('<html><body></body></html>');
  const create=doc.createElement.bind(doc);
  doc.createElement=tag=>{
    const node=create(tag);
    if(tag==='iframe')Object.defineProperty(node,'contentWindow',{value:{sent:[],ports:[],postMessage(message,origin,ports=[]){
      this.sent.push(message);this.ports.push(...ports);this.receive?.(message);
    }}});
    return node;
  };
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userActivation:{isActive:true},clipboard:{writeText:async text=>copied.push(text)}}});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'}});
  Object.defineProperty(globalThis,'MessageChannel',{configurable:true,value:Channel});
  const changed=new Events();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p,async sendMessage(message){
    if(message.protocol!==BROWSER_HOST_PROTOCOL)return {ok:true,data:{}};
    calls.push(structuredClone(message));
    if(message.operation==='browser.intent.confirm')return {ok:true,data:{approvalRef:'exact-intent'}};
    assert.equal(message.approvalRef,'exact-intent');return {ok:true,data:{authorized:true}};
  }},downloads:{async download(args){downloads.push(args);return 91;}},storage:{
    session:{async get(){return {};},async remove(){}},
    onChanged:{addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)},
    local:{async get(key){return Object.fromEntries((Array.isArray(key)?key:[key]).map(name=>[name,structuredClone(store.get(name))]));},
      async set(rows){for(const [key,value] of Object.entries(rows))store.set(key,structuredClone(value));},async remove(key){store.delete(key);}}
  }};
  const view=createSidebarToolsView(),runtime={frameRoot:doc.createElement('div'),settingsControl:doc.createElement('button')};
  doc.body.append(runtime.frameRoot,runtime.settingsControl);view.attachRuntime(runtime);
  const host=createSidebarTools({api,doc,view,taskWorkbench:{},lockManager:{request:(_key,run)=>run()},fetcher:officialFixtureFetch});
  t.after(()=>{host.dispose();view.dispose();for(const [key,descriptor] of descriptors){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }});
  await host.ready;host.setVisible(true);host.openTool(tool.id);
  const frame=runtime.frameRoot.children[0];await frame.onload();
  const loaded=frame.contentWindow.sent[0],port=frame.contentWindow.ports[0];
  const envelope=(operation,payload,id)=>({protocol:loaded.protocol,kind:'request',toolId:tool.id,instance:loaded.instance,
    operation,payload,requestId:String(id)});
  return {host,api,store,frame,loaded,port,view,copied,downloads,calls,
    review:()=>!view.fields['sidebar-tool-action-review'].hidden,
    privateRequest(operation,payload,id){port.postMessage(envelope(operation,payload,id));},
    windowRequest(operation,payload,id,extra={}){win.emit('message',{origin:'null',source:frame.contentWindow,
      data:{...envelope(operation,payload,id),...extra}});},
    response(id){return frame.contentWindow.sent.find(row=>row.kind==='response'&&row.requestId===String(id));},
    change(key,value){store.set(key,value);changed.emit('change',{[key]:{newValue:value}},'local');}
  };
}

test('host + bridge: trusted click uses the same exact Host intent then one frontend sink',async t=>{
  const f=await hostFixture(t);
  const b=sandbox({loaded:f.loaded,port:f.port,send:message=>f.windowRequest(message.operation,message.payload,message.requestId)});
  f.frame.contentWindow.receive=message=>b.respond(message);
  t.after(()=>b.dispose());
  await b.click(()=>b.win.OpenDeskSDK.browser.clipboard.writeText('中文 exact bytes'));
  // The SDK promise is tracked separately here because it calls the real facade.
  assert.deepEqual(f.copied,['中文 exact bytes']);assert.equal(f.review(),false);
  await b.click(()=>b.win.OpenDeskSDK.browser.downloads.text({text:'正文',filename:'notes.md'}));
  assert.equal(f.downloads.length,1);assert.equal(f.downloads[0].saveAs,false);assert.equal(f.review(),false);
  assert.equal(f.calls.length,4);
  for(let i=0;i<4;i+=2){
    assert.equal(f.calls[i].operation,'browser.intent.confirm');
    assert.deepEqual(f.calls[i].targetArgs,f.calls[i+1].args);
    assert.equal(f.calls[i+1].approvalRef,'exact-intent');
    for(const key of ['packageHash','toolInstance','hostInstanceId','installEpoch','toolVersion'])
      assert.equal(f.calls[i][key],f.calls[i+1][key]);
  }
});

test('host + bridge: prepared fresh bytes use canonical exact intent, while old async text still requires review',async t=>{
  const f=await hostFixture(t);
  const b=sandbox({loaded:f.loaded,port:f.port,send:message=>f.windowRequest(message.operation,message.payload,message.requestId)});
  f.frame.contentWindow.receive=message=>b.respond(message);t.after(()=>b.dispose());
  const factory=async()=>{await tick();return {filename:'fresh.json',text:'{"fresh":true}'};};
  await b.click(()=>b.prepare(factory));
  assert.equal(f.review(),false);assert.equal(f.downloads.length,1);
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].targetOperation,download);
  assert.deepEqual(f.calls[0].targetArgs,{filename:'fresh.json',text:'{"fresh":true}'});
  assert.deepEqual(f.calls[0].targetArgs,f.calls[1].args);
  assert.equal(f.calls[1].approvalRef,'exact-intent');
  const legacy=b.click(async()=>{const data=await factory();return b.win.OpenDeskSDK.browser.downloads.text(data);});
  const cancelled=assert.rejects(legacy);
  await settle(f.review);assert.equal(f.downloads.length,1);assert.equal(f.calls.length,2);
  f.view.dispatch(f.view.fields['sidebar-tool-action-cancel'].key,'click',{});await cancelled;
});

for(const change of ['package','epoch'])test('host + bridge: '+change+' revocation during preparation blocks the sink',async t=>{
  const f=await hostFixture(t);
  const b=sandbox({loaded:f.loaded,port:f.port,send:message=>f.windowRequest(message.operation,message.payload,message.requestId)});
  f.frame.contentWindow.receive=message=>b.respond(message);t.after(()=>b.dispose());
  let release;
  const result=b.click(()=>b.prepare(()=>new Promise(resolve=>{release=resolve;})));
  if(change==='package')f.store.set(SIDEBAR_TOOL_STORE,[{...tool,version:'2.0.0'}]);
  else f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'new-epoch'});
  release({filename:'revoked.txt',text:'revoked'});
  await assert.rejects(result,{code:'E_TOOL_CHANGED'});
  assert.equal(f.downloads.length,0);assert.equal(f.calls.length,0);assert.equal(f.review(),false);
});

for(const lifecycle of ['close','second-load','disable'])test('host + bridge: '+lifecycle+' and frame pagehide discard the old preparation',async t=>{
  const f=await hostFixture(t);
  const b=sandbox({loaded:f.loaded,port:f.port,send:message=>f.windowRequest(message.operation,message.payload,message.requestId)});
  f.frame.contentWindow.receive=message=>b.respond(message);t.after(()=>b.dispose());
  let release;
  const result=b.click(()=>b.prepare(()=>new Promise(resolve=>{release=resolve;})));
  if(lifecycle==='close')f.host.closeTool();
  if(lifecycle==='second-load')await f.frame.onload();
  if(lifecycle==='disable'){
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false});await settle(()=>f.port.peer.closed);
  }
  // Removing/replacing the iframe dispatches pagehide in Chromium. The Node
  // fixture drives that lifecycle explicitly; it cannot prove native delivery.
  await b.dispose();
  release({filename:'stale.txt',text:'stale'});
  await assert.rejects(result,{code:'E_TOOL_DISPOSED'});await tick();
  assert.equal(b.port.sent.length,0);assert.equal(f.downloads.length,0);assert.equal(f.calls.length,0);
});

test('host: window gesture flags and ambient activation cannot skip review',async t=>{
  const f=await hostFixture(t);
  f.windowRequest(copy,{text:'spoof'},1,{directExport:true,verifiedGesture:true,userActivation:true,trustedClick:true});
  await settle(f.review);assert.equal(f.calls.length,0);assert.equal(f.copied.length,0);
  f.view.dispatch(f.view.fields['sidebar-tool-action-cancel'].key,'click',{});
  await settle(()=>f.response(1));
});

test('host: private port rejects replay, unrelated operations and mismatched correlation',async t=>{
  const f=await hostFixture(t);
  f.privateRequest(copy,{text:'once'},1);await settle(()=>f.response(1));
  f.privateRequest(copy,{text:'replay'},1);
  f.privateRequest('browser.cookies.getAll',{url:'https://example.com'},2);
  f.port.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'request',toolId:tool.id,instance:'other-frame',
    requestId:'3',operation:copy,payload:{text:'wrong frame'}});
  f.port.postMessage({protocol:'spoof',kind:'request',toolId:tool.id,instance:f.loaded.instance,
    requestId:'4',operation:copy,payload:{text:'wrong protocol'}});
  const rogue=new Channel();rogue.port2.postMessage({operation:copy,payload:{text:'unmounted'}});
  await tick();await tick();assert.deepEqual(f.copied,['once']);assert.equal(f.calls.length,2);
});

test('host: direct exports still require capability, schema and byte budgets',async t=>{
  const f=await hostFixture(t,{capabilities:[]});
  f.privateRequest(copy,{text:'no capability'},1);await settle(()=>f.response(1));
  assert.equal(f.response(1).error.code,'E_TOOL_CAPABILITY_REQUIRED');assert.equal(f.calls.length,0);
  f.privateRequest(download,{text:'x',filename:'../escape.txt'},2);await settle(()=>f.response(2));
  assert.equal(f.response(2).ok,false);assert.equal(f.downloads.length,0);
  f.privateRequest(copy,{text:'x'.repeat(200000)},3);await settle(()=>f.response(3));
  assert.equal(f.response(3).error.code,'E_LIMIT');assert.equal(f.calls.length,0);
});

test('host: Cookie-capable tools retain the existing site-bound export review',async t=>{
  const f=await hostFixture(t,{capabilities:['user.export','browser.cookies.read']});
  f.privateRequest(copy,{text:'cookie bytes'},1);await settle(f.review);
  assert.equal(f.calls.length,0);assert.equal(f.copied.length,0);
  f.view.dispatch(f.view.fields['sidebar-tool-action-cancel'].key,'click',{});await settle(()=>f.response(1));
});

for(const lifecycle of ['close','second-load','disable'])test(`host: ${lifecycle} revokes the mounted private port`,async t=>{
  const f=await hostFixture(t),old=f.port.peer;
  if(lifecycle==='close')f.host.closeTool();
  if(lifecycle==='second-load')await f.frame.onload();
  if(lifecycle==='disable'){
    f.change(SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false});await settle(()=>old.closed);
  }
  assert.equal(old.closed,true);
  f.privateRequest(copy,{text:'stale'},2);await tick();await tick();assert.equal(f.copied.length,0);assert.equal(f.calls.length,0);
});

for(const change of ['package','epoch'])test(`host: ${change} change before sink is rejected without an export`,async t=>{
  const f=await hostFixture(t),send=f.api.runtime.sendMessage;
  f.api.runtime.sendMessage=async message=>{
    const response=await send(message);
    if(message.kind==='tool'){
      if(change==='package')f.store.set(SIDEBAR_TOOL_STORE,[{...tool,version:'2.0.0'}]);
      else f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'new-epoch'});
    }
    return response;
  };
  f.privateRequest(copy,{text:'revoked'},1);await settle(()=>f.response(1));
  assert.equal(f.response(1).error.code,'E_TOOL_CHANGED');assert.equal(f.copied.length,0);
});

test('host: denied exact authorization never reaches a sink; unknown sink result never replays',async t=>{
  const f=await hostFixture(t),send=f.api.runtime.sendMessage;
  f.api.runtime.sendMessage=async message=>message.kind==='tool'?{ok:true,data:{authorized:false}}:send(message);
  f.privateRequest(copy,{text:'denied'},1);await settle(()=>f.response(1));
  assert.equal(f.response(1).error.code,'E_OWNER');assert.equal(f.copied.length,0);
  f.api.runtime.sendMessage=send;
  f.api.downloads.download=async args=>{f.downloads.push(args);throw Error('lost receipt');};
  f.privateRequest(download,{text:'unknown',filename:'one.txt'},2);await settle(()=>f.response(2));
  assert.equal(f.response(2).error.code,'E_OUTCOME_UNKNOWN');
  f.privateRequest(download,{text:'unknown',filename:'one.txt'},2);await tick();await tick();
  assert.equal(f.downloads.length,1);
});

test('host: disposing while exact intent is pending prevents the frontend effect',async t=>{
  const f=await hostFixture(t),send=f.api.runtime.sendMessage;
  let resume,entered=false;
  f.api.runtime.sendMessage=async message=>{
    if(message.operation==='browser.intent.confirm'){
      entered=true;await new Promise(resolve=>{resume=resolve;});
    }
    return send(message);
  };
  f.privateRequest(copy,{text:'closed'},1);await settle(()=>entered);
  f.host.dispose();resume();await tick();await tick();
  assert.equal(f.port.peer.closed,true);assert.equal(f.copied.length,0);
  assert.equal(f.calls.filter(row=>row.kind==='tool').length,0);
});
