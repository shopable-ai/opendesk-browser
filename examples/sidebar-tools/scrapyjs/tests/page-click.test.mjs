import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {globSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {runClickedInspection} from '../controller/pick-page.js';
import main from '../controller/main.js';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let JSDOM;
try{({JSDOM}=require('jsdom'));}
catch(error){
  const cached=globSync(join(homedir(),'.npm/_npx/*/node_modules/jsdom/package.json'))[0];
  if(!cached)throw error;
  ({JSDOM}=require(dirname(cached)));
}
const url='http://127.0.0.1:43111/inspection.html';
const html='<ul id="books"><li><a class="title" href="/a">A</a></li><li><a class="title" href="/b">B</a></li></ul>';
function fixture(markup=html,clock={setTimeout,clearTimeout}){
  const {window}=new JSDOM('<html><body>'+markup+'<input type="password"></body></html>',{url});
  const registrations=new Set();
  for(const target of [window.document,window]){
    const tracked=new Set(target===window?['pagehide','hashchange','popstate']:['pointermove','click','keydown','visibilitychange']);
    const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
    target.addEventListener=(type,listener,options)=>{
      if(tracked.has(type))registrations.add({target,type,listener});
      return add(type,listener,options);
    };
    target.removeEventListener=(type,listener,options)=>{
      for(const entry of registrations)if(entry.target===target&&entry.type===type&&entry.listener===listener)registrations.delete(entry);
      return remove(type,listener,options);
    };
  }
  const page={evaluate:async(fn,input)=>JSON.parse(JSON.stringify(await vm.runInNewContext('('+fn.toString()+')(input)',{
    input,document:window.document,location:window.location,window,Element:window.Element,...clock
  })))};
  return {window,page,pendingListeners:()=>[...registrations].map(entry=>({type:entry.type,name:entry.listener.name,target:entry.target===window?'window':'document'})),inspect:(kind,scope={})=>runClickedInspection({url,kind,container:'#books',item:'li',...scope},page)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('actual DOM click produces text/href choices with record samples and cleans highlight',async()=>{
  const f=fixture(),pending=f.inspect('fields');await tick();
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,1);
  const event=new f.window.MouseEvent('click',{bubbles:true,cancelable:true});
  f.window.document.querySelector('a').dispatchEvent(event);
  const result=await pending;
  assert.equal(event.defaultPrevented,true);
  assert.equal(result.choices.length,2);
  assert.equal(result.choices[0].rule,'a.title::text');
  assert.equal(result.choices[0].status,'pass');
  assert.deepEqual(result.choices[0].samples.map(sample=>sample.value),['A','B']);
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,0);
});
test('clicking the real list selects its unique container and direct children',async()=>{
  const f=fixture(),pending=f.inspect('lists');await tick();
  f.window.document.querySelector('li').dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  const row=(await pending).choices[0];
  assert.equal(row.container,'#books');assert.equal(row.item,'li');assert.equal(row.count,2);
});
test('sensitive controls are never selected; Escape removes listeners and overlay',async()=>{
  const f=fixture(),pending=f.inspect('fields');await tick();
  const event=new f.window.MouseEvent('click',{bubbles:true,cancelable:true});
  f.window.document.querySelector('input').dispatchEvent(event);
  assert.equal(event.defaultPrevented,false);
  f.window.document.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await assert.rejects(pending,/E_PICK_CANCELLED/);
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,0);
});

function manualClock(){
  const timers=new Map();let sequence=0;
  return {setTimeout(callback){timers.set(++sequence,callback);return sequence;},
    clearTimeout(id){timers.delete(id);},
    expire(){for(const [id,callback] of [...timers]){timers.delete(id);callback();}},
    pending:()=>timers.size};
}
function assertReleased(f){
  assert.deepEqual(f.pendingListeners(),[],'all page listeners must be removed');
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,0);
  const event=new f.window.MouseEvent('click',{bubbles:true,cancelable:true});
  let intercepted;
  const anchor=f.window.document.querySelector('a');
  anchor.addEventListener('click',event=>{
    intercepted=event.defaultPrevented;event.preventDefault();
  },{once:true});
  anchor.dispatchEvent(event);
  assert.equal(intercepted,false,'released picker must not intercept another click');
}

test('clicked field samples follow document order across nested list containers',async()=>{
  const f=fixture('<section class="scope"><article class="row"><b>A</b></article><div class="scope"><article class="row"><b>B</b></article><article class="row"><b>C</b></article></div><article class="row"><b>D</b></article></section>');
  const pending=f.inspect('fields',{container:'.scope',item:'.row'});await tick();
  f.window.document.querySelector('b').dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  const choice=(await pending).choices[0];
  assert.equal(choice.total,4);
  assert.deepEqual(choice.samples.map(row=>row.value),['A','B','C']);
});

test('timeout and pagehide release the original picker and do not intercept later clicks',async()=>{
  for(const reason of ['timeout','pagehide']){
    const clock=manualClock(),f=fixture(html,clock);
    const outcome=f.inspect('fields').then(value=>({value}),error=>({error}));
    await tick();
    if(reason==='timeout')clock.expire();
    else f.window.dispatchEvent(new f.window.Event('pagehide'));
    assert.match((await outcome).error.message,reason==='timeout'?/E_PICK_TIMEOUT/:/E_INSPECTION_URL/);
    assert.equal(clock.pending(),0);assertReleased(f);
  }
});

test('same-document navigation immediately invalidates and releases click inspection',async()=>{
  for(const eventName of ['hashchange','popstate']){
    const clock=manualClock(),f=fixture(html,clock);
    const outcome=f.inspect('fields').then(value=>({value}),error=>({error}));await tick();
    f.window.history.pushState(null,'',url+'#moved');
    f.window.dispatchEvent(new f.window.Event(eventName));
    clock.expire();
    assert.match((await outcome).error.message,/E_INSPECTION_URL/);
    assertReleased(f);
  }
});

test('SDK inspection parameters reach the fixed Controller source and return the clicked record choices',async()=>{
  const f=fixture(),task={taskId:'scrapyjs.capture',version:'0.6.2',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),installationId:'00000000-0000-4000-8000-000000000000',generation:1};
  const context=vm.createContext({TextEncoder});
  vm.runInContext(await readFile(new URL('../adapters/app-sdk.js',import.meta.url),'utf8'),context);
  let starts=0;
  const sdk=context.ScrapyAppSdk.createSdk(async(operation,payload)=>{
    if(operation==='tasks.read'&&payload.taskId)return {task};
    assert.equal(operation,'tasks.start');starts++;
    assert.deepEqual(payload.task,task);
    assert.equal(payload.clientRequestId,'source-click-1');
    assert.equal(payload.params.configJson,'{}');
    assert.equal('code' in payload,false);assert.equal('tabId' in payload,false);
    const previousPage=globalThis.page,previousParams=globalThis.params;
    try{
      globalThis.page={...f.page,url:async()=>url};globalThis.params=payload.params;
      return {clientRequestId:payload.clientRequestId,runId:'source-run-1',state:'completed',
        retirementState:'released',value:await main()};
    }finally{
      if(previousPage===undefined)delete globalThis.page;else globalThis.page=previousPage;
      if(previousParams===undefined)delete globalThis.params;else globalThis.params=previousParams;
    }
  });
  await sdk.prepare();
  const pending=sdk.inspect({url,kind:'fields',container:'#books',item:'li',mode:'click'},'source-click-1');
  await tick();
  assert.equal(f.window.document.querySelectorAll('[data-opendesk-scrapyjs-picker]').length,1);
  f.window.document.querySelector('a').dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  const result=await pending;
  assert.equal(starts,1);assert.equal(result.retired,true);assert.equal(result.status,'completed');
  assert.equal(result.result.choices[0].rule,'a.title::text');
  assert.deepEqual(result.result.choices[0].samples.map(row=>row.value),['A','B']);
  assertReleased(f);
});

test('switching away from the target tab releases the picker without waiting for timeout',async()=>{
  const clock=manualClock(),f=fixture(html,clock);
  const outcome=f.inspect('fields').then(value=>({value}),error=>({error}));await tick();
  Object.defineProperty(f.window.document,'hidden',{configurable:true,value:true});
  f.window.document.dispatchEvent(new f.window.Event('visibilitychange'));
  clock.expire();
  assert.match((await outcome).error.message,/E_INSPECTION_URL/);
  assert.equal(clock.pending(),0);assertReleased(f);
});
