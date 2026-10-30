import test from 'node:test';
import assert from 'node:assert/strict';
import {initAdblockCosmetics} from '../../projects/adblock/trusted/page.js';
import {ADBLOCK_STORE,ADBLOCK_PAGE_PROTOCOL} from '../../projects/adblock/trusted/policy.js';

function event(){
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit:(...args)=>{for(const fn of [...listeners])fn(...args);},get size(){return listeners.size;}};
}
function fixture(){
  const messages=event(),changes=event(),pending=[],timeouts=new Map(),intervals=new Map();
  let serial=0;
  const events=new Map();
  const win={location:new URL('https://www.javbus.com/'),
    setTimeout:fn=>{const id=++serial;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:fn=>{const id=++serial;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
    addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
  win.top=win;
  const head={children:[],appendChild(node){node.remove();this.children.push(node);node.parentNode=this;}};
  const doc={head,createElement:tag=>({tagName:tag,parentNode:null,
    remove(){if(this.parentNode){const nodes=this.parentNode.children;nodes.splice(nodes.indexOf(this),1);this.parentNode=null;}}}),
    addEventListener(){},removeEventListener(){}};
  const api={runtime:{id:'extension-id',onMessage:messages,sendMessage(message){
    assert.deepEqual(message,{protocol:ADBLOCK_PAGE_PROTOCOL});
    return new Promise((resolve,reject)=>pending.push({resolve,reject}));
  }},storage:{onChanged:changes}};
  const instance=initAdblockCosmetics({api,doc,win});
  const resolve=async(index,enabled=true)=>{
    pending[index].resolve({ok:true,data:{version:1,host:'www.javbus.com',enabled}});
    await Promise.resolve();await Promise.resolve();
  };
  return {api,win,doc,instance,messages,changes,pending,timeouts,intervals,events,resolve,
    styles:()=>head.children.length};
}

test('page CSS starts denied, accepts only a verified reply and is idempotent per document',async()=>{
  const f=fixture();assert.equal(f.styles(),0);
  assert.equal(initAdblockCosmetics({api:f.api,doc:f.doc,win:f.win}),f.instance);
  assert.equal(f.pending.length,1);
  await f.resolve(0);assert.equal(f.styles(),1);
  f.instance.dispose();assert.equal(f.styles(),0);
  assert.equal(f.changes.size,0);assert.equal(f.messages.size,0);assert.equal(f.intervals.size,0);
});
test('revocation immediately restores ads and an older pending reply cannot hide them again',async()=>{
  const f=fixture();await f.resolve(0);assert.equal(f.styles(),1);
  void f.instance.refresh();
  f.changes.emit({[ADBLOCK_STORE]:{}},'local');assert.equal(f.styles(),0);
  await f.resolve(1);assert.equal(f.styles(),0,'pre-revocation response is stale');
  await f.resolve(2,false);assert.equal(f.styles(),0);
  f.instance.dispose();
});
test('permission notifications must come from this extension background and failures restore CSS',async()=>{
  const f=fixture();await f.resolve(0);
  const message={protocol:ADBLOCK_PAGE_PROTOCOL,type:'invalidate'};
  f.messages.emit(message,{id:'forged'});assert.equal(f.styles(),1);
  f.messages.emit(message,{id:f.api.runtime.id,tab:{id:1}});assert.equal(f.styles(),1);
  f.messages.emit(message,{id:f.api.runtime.id});assert.equal(f.styles(),0);
  f.pending[1].reject(Error('origin permission removed'));await Promise.resolve();
  assert.equal(f.styles(),0);f.instance.dispose();
});
test('BFCache suspends CSS and requires a fresh approval after restoration',async()=>{
  const f=fixture();await f.resolve(0);
  f.events.get('pagehide')({persisted:true});assert.equal(f.styles(),0);
  f.events.get('pageshow')({persisted:true});assert.equal(f.styles(),0);
  await f.resolve(1);assert.equal(f.styles(),1);
  f.events.get('pagehide')({persisted:false});assert.equal(f.styles(),0);
  assert.equal(f.intervals.size,0);
});
test('late replies after navigation or extension invalidation do not leave CSS behind',async()=>{
  const f=fixture();f.win.location.href='https://www.javbus.com/page/2';
  await f.resolve(0);assert.equal(f.styles(),0);
  void f.instance.refresh();await f.resolve(1);assert.equal(f.styles(),1);
  f.api.runtime.id=undefined;
  for(const check of f.intervals.values())check();
  assert.equal(f.styles(),0);assert.equal(f.intervals.size,0);
});
test('an unanswered policy query expires and its late positive reply cannot reapply CSS',async()=>{
  const f=fixture();await f.resolve(0);assert.equal(f.styles(),1);
  void f.instance.refresh();
  for(const timeout of [...f.timeouts.values()])timeout();
  assert.equal(f.styles(),0);
  await f.resolve(1);assert.equal(f.styles(),0);
  f.instance.dispose();assert.equal(f.timeouts.size,0);
});

test('historical locate follows a scrolling target and cancels its frame on timeout or revocation',async()=>{
  const f=fixture(),frames=new Map(),markers=[];
  let frameId=0,top=2400;
  const target={isConnected:true,scrollIntoView(){},
    getBoundingClientRect:()=>({left:24,top,width:280,height:100})};
  f.doc.querySelector=selector=>selector==='#saved-ad'?target:null;
  f.doc.querySelectorAll=selector=>selector==='#saved-ad'?[target]:[];
  f.doc.documentElement={append(node){markers.push(node);node.isConnected=true;}};
  const create=f.doc.createElement;
  f.doc.createElement=tag=>tag!=='div'?create(tag):{style:{},setAttribute(){},
    remove(){this.isConnected=false;}};
  f.win.requestAnimationFrame=fn=>{const id=++frameId;frames.set(id,fn);return id;};
  f.win.cancelAnimationFrame=id=>frames.delete(id);
  await f.resolve(0);
  const locate=()=>{
    let reply;
    f.messages.emit({protocol:ADBLOCK_PAGE_PROTOCOL,type:'locate-selector',selector:'#saved-ad'},
      {id:f.api.runtime.id},value=>{reply=value;});
    assert.equal(reply.ok,true);
    return markers.at(-1);
  };
  const marker=locate();assert.equal(marker.style.top,'2400px');
  top=220;
  const [id,follow]=frames.entries().next().value;frames.delete(id);follow();
  assert.equal(marker.style.top,'220px','fixed blue frame tracks the new viewport coordinates');
  assert.equal(frames.size,1);
  for(const timeout of [...f.timeouts.values()])timeout();
  assert.equal(marker.isConnected,false);assert.equal(frames.size,0);
  locate();assert.equal(frames.size,1);
  f.changes.emit({[ADBLOCK_STORE]:{}},'local');
  assert.equal(markers.at(-1).isConnected,false);assert.equal(frames.size,0);
  await f.resolve(1,false);f.instance.dispose();assert.equal(frames.size,0);
});
