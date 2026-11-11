import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const panelSource=await fs.readFile(new URL('../src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function storeFixture(){
  let value=null,revision=1,fail=false,conflictOnce=false;
  const actions=[];
  const request=async (op,payload)=>{
    actions.push({op,payload});
    if(op==='storage.get')return {value:value===null?null:{...value},etag:'v'+revision};
    if(op==='storage.set'){
      if(fail)throw Error('E_STORAGE');
      if(conflictOnce){conflictOnce=false;revision++;
        const e=Error('stale');e.code='E_STORAGE_CONFLICT';throw e;}
      if(payload.ifMatch!==('v'+revision))throw Error('CAS mismatch');
      value=payload.value;revision++;return {saved:true};
    }
    if(op==='page.request')throw Error('E_PAGE_AUTHORIZATION');
    throw Error('UNEXPECTED_OP');
  };
  return {request,actions,read:()=>value,fail(){fail=true;},conflict(){conflictOnce=true;}};
}
function panel(store){
  const listeners=new Map(),windowHandlers=new Map(),states=[];
  const toggle={checked:true,disabled:true,attributes:new Map(),
    addEventListener(type,fn){listeners.set('enabled:'+type,fn);},
    setAttribute(k,v){this.attributes.set(k,v);}};
  const trigger={value:'right',disabled:true,addEventListener(type,fn){listeners.set('trigger:'+type,fn);}};
  const trace={checked:true,disabled:true,addEventListener(type,fn){listeners.set('trace:'+type,fn);}};
  const hint={textContent:''},error={textContent:'',hidden:true};
  const elements=new Map([['#gesture-enabled',toggle],['#gesture-trigger',trigger],
    ['#gesture-trace',trace],['#gesture-help',hint],['#gesture-error',error]]);
  const root={querySelector(id){return elements.get(id)||null;},
    addEventListener(type,fn){listeners.set('root:'+type,fn);}};
  const window={addEventListener(type,fn){windowHandlers.set(type,fn);}};
  const tool={root,request:store.request,setState(state){states.push(state);}};
  vm.runInNewContext(panelSource,{globalThis:{OpenDeskTool:tool},window});
  const flush=async()=>{await tick();await tick();};
  return {toggle,trigger,trace,hint,error,states,windowHandlers,
    async change(value){toggle.checked=value;listeners.get('enabled:change')();await flush();},
    async changeTrigger(value){trigger.value=value;listeners.get('trigger:change')();await flush();},
    async changeTrace(value){trace.checked=value;listeners.get('trace:change')();await flush();},
    async reload(){listeners.get('root:opendesk-page-changed')();await flush();},
    close(){windowHandlers.get('pagehide')?.();}};
}

test('Side Panel persists switch and restores it after reopening',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();assert.equal(one.toggle.checked,true);assert.equal(one.toggle.disabled,false);
  assert.equal(store.read(),null); // First install must not require a second enable/save.
  await one.change(false);
  assert.equal(store.read().enabled,false);assert.equal(one.toggle.checked,false);
  assert.equal(one.toggle.disabled,false);
  assert.equal(one.states.at(-1).busy,false);
  one.close();
  const two=panel(store);await tick();assert.equal(two.toggle.checked,false);
  await two.change(true);assert.equal(store.read().enabled,true);
  assert.equal(two.toggle.checked,true);
  two.close();
});
test('Side Panel retries only documented ETag conflict and does not overwrite config',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();store.conflict();await one.change(false);
  assert.equal(store.read().enabled,false);
  assert.equal(store.actions.filter(x=>x.op==='storage.set').length,2);
  one.close();
});
test('failed save never changes confirmed state or claims enabled',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();store.fail();await one.change(false);
  assert.equal(store.read(),null);
  assert.equal(one.toggle.checked,true);
  assert.match(one.error.textContent,/未确认/);
  assert.equal(one.toggle.disabled,false); // confirmed old state remains retryable
  one.close();
});
test('synchronization to restricted website is optional, not a false failure',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();await one.change(false);
  assert.equal(one.error.hidden,true);
  assert.equal(store.actions.some(x=>x.op==='page.request'),true);
  one.close();
});

test('preview and installed Side Panel both retain four visible gesture entries',async()=>{
  const expected=['←后退','→前进','↑刷新','↓到底'];
  for(const relative of ['../preview/index.html','../src/index.html']){
    const html=await fs.readFile(new URL(relative,import.meta.url),'utf8');
    const list=html.match(/<ul\b[^>]*class="(?:od-collection|mg-list)"[^>]*>([\s\S]*?)<\/ul>/);
    assert.ok(list,relative+' should expose the gesture list');
    const rows=[...list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
      .map(match=>match[1].replace(/<[^>]*>/g,'').replace(/\s+/g,'').trim());
    assert.deepEqual(rows,expected,relative+' must keep all four direction labels');
  }
});


test('trigger fallback and trace preference persist without resetting enabled state',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  await one.changeTrigger('alt-left');
  await one.changeTrace(false);
  assert.equal(store.read().enabled,undefined);
  assert.equal(store.read().trigger,'alt-left');
  assert.equal(store.read().showTrace,false);
  one.close();
  const again=panel(store);await tick();
  assert.equal(again.toggle.checked,true);
  assert.equal(again.trigger.value,'alt-left');
  assert.equal(again.trace.checked,false);
  assert.match(again.hint.textContent,/Option/);
  await again.change(false);
  assert.equal(store.read().enabled,false);
  assert.equal(store.read().trigger,'alt-left');
  assert.equal(store.read().showTrace,false);
  again.close();
});

test('production panel and standalone preview both mark first-install default ON',async()=>{
  const production=await fs.readFile(new URL('../src/index.html',import.meta.url),'utf8');
  const preview=await fs.readFile(new URL('../preview/index.html',import.meta.url),'utf8');
  for(const html of [production,preview]){
    assert.match(html,/<input[^>]*id="gesture-enabled"[^>]*class="mg-switch"[\s\S]*?checked/);
  }
});
