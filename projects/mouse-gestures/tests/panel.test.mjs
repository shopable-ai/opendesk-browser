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
  const toggle={checked:false,disabled:false,attributes:new Map(),
    addEventListener(type,fn){listeners.set(type,fn);},setAttribute(k,v){this.attributes.set(k,v);}};
  const error={textContent:'',hidden:true};
  const root={querySelector(id){return id==='#gesture-enabled'?toggle:id==='#gesture-error'?error:null;},
    addEventListener(type,fn){listeners.set(type,fn);}};
  const window={addEventListener(type,fn){windowHandlers.set(type,fn);}};
  const tool={root,request:store.request,setState(state){states.push(state);}};
  vm.runInNewContext(panelSource,{globalThis:{OpenDeskTool:tool},window});
  return {toggle,error,states,windowHandlers,async change(value){toggle.checked=value;listeners.get('change')();await tick();await tick();},
    async reload(){listeners.get('opendesk-page-changed')();await tick();},
    close(){windowHandlers.get('pagehide')?.();}};
}

test('Side Panel persists switch and restores it after reopening',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();assert.equal(one.toggle.checked,false);assert.equal(one.toggle.disabled,false);
  await one.change(true);
  assert.equal(store.read().enabled,true);assert.equal(one.toggle.checked,true);
  assert.equal(one.toggle.disabled,false);
  assert.equal(one.states.at(-1).busy,false);
  one.close();
  const two=panel(store);await tick();assert.equal(two.toggle.checked,true);
  await two.change(false);assert.equal(store.read().enabled,false);
  assert.equal(two.toggle.checked,false);
  two.close();
});
test('Side Panel retries only documented ETag conflict and does not overwrite config',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();store.conflict();await one.change(true);
  assert.equal(store.read().enabled,true);
  assert.equal(store.actions.filter(x=>x.op==='storage.set').length,2);
  one.close();
});
test('failed save never changes confirmed state or claims enabled',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();store.fail();await one.change(true);
  assert.equal(store.read(),null);
  assert.equal(one.toggle.checked,false);
  assert.match(one.error.textContent,/未确认/);
  assert.equal(one.toggle.disabled,false); // confirmed old state remains retryable
  one.close();
});
test('synchronization to restricted website is optional, not a false failure',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();await one.change(true);
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
