import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdblockPermissionControls} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PERMISSION,ADBLOCK_STORE}
  from '../../examples/sidebar-tools/adblock/trusted/policy.js';

class Node{
  constructor(){this.children=[];this.listeners={};this.attributes={};this.hidden=false;
    this.disabled=false;this.textContent='';}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this.attributes[name]=value;}
}
function event(){
  const listeners=new Set();
  return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit(...args){for(const fn of [...listeners])fn(...args);}};
}
const tool={id:ADBLOCK_ID,version:'1.3.0',capabilities:[ADBLOCK_CAPABILITY]};
const status=(enabled=true)=>({enabled,exceptions:[],currentHost:'news.example.com',
  permissions:{dnr:true},rules:{verified:true}});
const tick=()=>new Promise(done=>setImmediate(done));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};}
function fixture(){
  const storage=event(),added=event(),removed=event();
  const api={storage:{onChanged:storage},permissions:{onAdded:added,onRemoved:removed,
    request:()=>Promise.resolve(true)}};
  function mount(runOperation){
    const container=new Node(),notices=[];
    const controls=createAdblockPermissionControls({api,doc:{createElement:()=>new Node()},container,
      notice:(...args)=>notices.push(args),runOperation});
    const section=container.children[0];
    return {controls,container,notices,global:section.children[0].children[1],
      site:section.children[1].children[1],info:section.children[2]};
  }
  return {api,storage,added,removed,mount,
    change:()=>storage.emit({[ADBLOCK_STORE]:{newValue:{}}},'local')};
}
function switches(panel,on){
  assert.equal(panel.global.attributes['aria-checked'],String(on));
  assert.equal(panel.site.attributes['aria-checked'],String(on));
  assert.equal(panel.global.textContent,on?'开启':'关闭');
  assert.equal(panel.site.textContent,on?'开启':'关闭');
}
function unknown(panel){
  assert.equal(panel.global.textContent,'状态未确认');
  assert.equal(panel.global.disabled,true);
  assert.equal(panel.global.attributes['aria-checked'],'false');
  assert.equal(panel.site.attributes['aria-checked'],'false');
  assert.equal(panel.site.disabled,true);
}

test('two visible AdBlock panels synchronize both switches and aria after one disables',async()=>{
  const f=fixture();let current=status();
  const run=async op=>{
    if(op==='adblock.disable'){current=status(false);f.change();}
    return structuredClone(current);
  };
  const a=f.mount(run),b=f.mount(run);
  a.controls.render(tool,false,true);b.controls.render(tool,false,true);await tick();
  switches(a,true);switches(b,true);
  a.global.listeners.click({isTrusted:true});
  unknown(b);
  await tick();switches(a,false);switches(b,false);
});

test('only AdBlock local storage and permission changes invalidate visible controls',async()=>{
  const f=fixture();let current=status(),reads=0;
  const panel=f.mount(async()=>{reads++;return structuredClone(current);});
  panel.controls.render(tool,false,true);await tick();
  f.storage.emit({other:{}},'local');f.storage.emit({[ADBLOCK_STORE]:{}},'sync');
  assert.equal(reads,1);switches(panel,true);
  current={...status(false),permissions:{dnr:false}};
  f.removed.emit({permissions:[ADBLOCK_PERMISSION]});unknown(panel);
  await tick();switches(panel,false);
  current=status();f.added.emit({permissions:[ADBLOCK_PERMISSION]});unknown(panel);
  await tick();switches(panel,true);assert.equal(reads,3);
});

test('in-flight reads coalesce invalidations and never paint an older response',async()=>{
  const f=fixture(),first=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(()=>++reads===1?first.promise:latest.promise);
  panel.controls.render(tool,false,true);
  f.change();f.change();f.removed.emit({permissions:[ADBLOCK_PERMISSION]});
  first.resolve(status());await tick();
  assert.equal(reads,2,'one final read must follow all in-flight invalidations');unknown(panel);
  latest.reject(Error('native read unavailable'));await tick();
  unknown(panel);assert.match(panel.info.textContent,/状态读取失败.*native read unavailable/);
  assert.equal(reads,2,'a failed read must remain unknown without a retry loop');
});

test('changes while a trusted operation is busy require a final authoritative read',async()=>{
  const f=fixture(),operation=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(op=>op==='adblock.status'?
    (++reads===1?Promise.resolve(status()):latest.promise):operation.promise);
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});
  f.change();f.added.emit({permissions:[ADBLOCK_PERMISSION]});f.change();unknown(panel);
  operation.resolve(status(false));await tick();
  assert.equal(reads,2);unknown(panel);
  latest.resolve({...status(),exceptions:['news.example.com']});await tick();
  assert.equal(panel.global.attributes['aria-checked'],'true');
  assert.equal(panel.site.attributes['aria-checked'],'false');
  assert.equal(panel.site.textContent,'关闭');
});

test('a failed final read after busy drift cannot retain a successful mutation snapshot',async()=>{
  const f=fixture(),operation=deferred();let reads=0;
  const panel=f.mount(op=>op==='adblock.status'?++reads===1?Promise.resolve(status()):
    Promise.reject(Error('final read failed')):operation.promise);
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});f.change();
  operation.resolve(status(false));await tick();
  unknown(panel);assert.match(panel.info.textContent,/final read failed/);assert.equal(reads,2);
});

test('hide and tool changes release listeners and reject old reads across reopening',async()=>{
  const f=fixture(),first=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(()=>++reads===1?first.promise:latest.promise);
  panel.controls.render(null);assert.equal(f.storage.listeners.size,0);
  panel.controls.render(tool,false,true);panel.controls.render(tool,false,true);
  assert.equal(f.storage.listeners.size,1);assert.equal(f.added.listeners.size,1);
  panel.controls.render(null);
  assert.equal(f.storage.listeners.size,0);assert.equal(f.added.listeners.size,0);
  assert.equal(f.removed.listeners.size,0);assert.equal(panel.container.hidden,true);
  f.change();assert.equal(reads,1);
  panel.controls.render(tool,false,true);first.resolve(status());await tick();unknown(panel);
  assert.equal(reads,2);latest.resolve(status(false));await tick();switches(panel,false);
  panel.controls.render({...tool,version:'1.3.1'},false,true);await tick();
  assert.equal(f.storage.listeners.size,1);
  panel.controls.render({id:'other',version:'1.0.0',capabilities:[]},false,true);
  assert.equal(f.storage.listeners.size,0);assert.equal(f.removed.listeners.size,0);
});

test('a pending mutation cannot revive state in a new tool generation',async()=>{
  const f=fixture(),operation=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(op=>op==='adblock.status'?++reads===1?Promise.resolve(status()):
    latest.promise:operation.promise);
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});panel.controls.render(null);
  panel.controls.render(tool,false,true);operation.resolve(status(false));await tick();
  unknown(panel);assert.equal(reads,2);
  latest.resolve(status());await tick();switches(panel,true);
});

test('permission requests stay synchronous and stale grants cannot enable another generation',async()=>{
  const f=fixture(),grant=deferred();let requests=0;const operations=[];
  f.api.permissions.request=()=>{requests++;f.added.emit({permissions:[ADBLOCK_PERMISSION]});
    return grant.promise;};
  const panel=f.mount(async op=>{operations.push(op);return status(false);});
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:false});assert.equal(requests,0);
  panel.global.listeners.click({isTrusted:true});assert.equal(requests,1);
  panel.controls.render(null);panel.controls.render(tool,false,true);
  grant.resolve(true);await tick();
  assert.equal(operations.includes('adblock.enable'),false);switches(panel,false);
});

test('a permission event inside request still ends with a fresh read after enable',async()=>{
  const f=fixture(),grant=deferred();let current=status(false),requests=0,reads=0;
  f.api.permissions.request=()=>{requests++;f.added.emit({permissions:[ADBLOCK_PERMISSION]});
    return grant.promise;};
  const panel=f.mount(async op=>{
    if(op==='adblock.enable')current=status();else reads++;
    return structuredClone(current);
  });
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});assert.equal(requests,1);unknown(panel);
  assert.equal(reads,1,'the permission event must wait for the busy action');
  grant.resolve(true);await tick();switches(panel,true);assert.equal(reads,2);
});

test('preview and dispose release only their own listeners and suppress stale read errors',async()=>{
  const f=fixture(),pending=deferred();let reads=0;
  const a=f.mount(()=>pending.promise),b=f.mount(async()=>{reads++;return status();});
  a.controls.render(tool,false,true);b.controls.render(tool,false,true);await tick();
  assert.equal(f.storage.listeners.size,2);
  a.controls.render(tool,true,true);
  assert.equal(f.storage.listeners.size,1);assert.equal(f.added.listeners.size,1);
  pending.reject(Error('obsolete read'));await tick();assert.equal(a.notices.length,0);
  f.change();await tick();assert.equal(reads,2);switches(b,true);
  b.controls.dispose();
  assert.equal(f.storage.listeners.size,0);assert.equal(f.added.listeners.size,0);
  assert.equal(f.removed.listeners.size,0);assert.equal(b.container.hidden,true);
});


test('first optional DNR grant explains Chrome restart without presenting active filtering',async()=>{
  const f=fixture();let requests=0;
  f.api.permissions.request=()=>{requests++;return Promise.resolve(true);};
  const panel=f.mount(async()=>({...status(false),restartRequired:true,rules:{verified:false}}));
  panel.controls.render(tool,false,true);await tick();
  assert.equal(panel.global.attributes['aria-checked'],'false');
  assert.equal(panel.global.textContent,'需重启 Chrome');
  assert.equal(panel.global.disabled,true);assert.equal(panel.site.disabled,true);
  assert.match(panel.global.textContent,/重启 Chrome/);
  assert.match(panel.info.textContent,/尚未开启/);
  panel.global.listeners.click({isTrusted:false});assert.equal(requests,0);
});
