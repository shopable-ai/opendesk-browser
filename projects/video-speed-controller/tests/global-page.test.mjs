import test from 'node:test';
import assert from 'node:assert/strict';
import {initGlobalVideoSpeed} from '../trusted/page.js';

const eventBus=()=>{const listeners=new Map();return {
  addListener(fn){listeners.set(fn,true);},removeListener(fn){listeners.delete(fn);},
  fire(...args){for(const fn of listeners.keys())fn(...args);}
};};
function fixture(){
  const events=new Map(),windowEvents=new Map(),timers=new Map(),calls=[];
  let next=0,mutate;
  const doc={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),
    removeEventListener:name=>events.delete(name)};
  const win={top:{},setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
    addEventListener:(name,fn)=>windowEvents.set(name,fn),MutationObserver:class{
      constructor(fn){mutate=fn;}observe(){}disconnect(){mutate=null;}
    }};
  const changed=eventBus(),messages=eventBus();
  const api={runtime:{sendMessage:async message=>{calls.push(message);},onMessage:messages},storage:{onChanged:changed}};
  const controller=initGlobalVideoSpeed({api,doc,win});
  const flush=async()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)await fn();};
  return {doc,events,windowEvents,timers,calls,changed,messages,controller,flush,
    media:(type,tagName='VIDEO')=>events.get(type)?.({type,target:{tagName}}),
    replace:()=>mutate?.([{addedNodes:[{nodeType:1,tagName:'VIDEO'}]}])};
}
test('visible frame coalesces new media events into scalar-only signals without media writes',async()=>{
  const f=fixture();f.media('play');f.media('loadedmetadata');f.replace();
  assert.equal(f.timers.size,1);await f.flush();
  assert.deepEqual(f.calls,[{protocol:'opendesk.video-speed.global.v1',operation:'page.apply'}]);
  assert.equal(f.events.has('ratechange'),false,'player overrides never trigger reapplication');
  f.media('play','AUDIO');await f.flush();assert.equal(f.calls.length,1);
  f.media('emptied');await f.flush();assert.equal(f.calls.length,2);
});
test('hidden pages and pagehide cannot send a queued write signal; BFCache return can recheck',async()=>{
  const f=fixture();f.doc.visibilityState='hidden';await f.flush();assert.equal(f.calls.length,0);
  f.media('play');assert.equal(f.timers.size,0);
  f.doc.visibilityState='visible';f.media('visibilitychange');assert.equal(f.timers.size,1);
  f.windowEvents.get('pagehide')();await f.flush();assert.equal(f.calls.length,0);
  f.windowEvents.get('pageshow')();await f.flush();assert.equal(f.calls.length,1);
  f.controller.dispose();f.media('play');f.replace();await f.flush();assert.equal(f.calls.length,1);
});
test('permission recheck and preference changes wake frames; unrelated storage is ignored',async()=>{
  const f=fixture();await f.flush();
  f.changed.fire({'unrelated':{}},'local');assert.equal(f.timers.size,0);
  f.messages.fire({protocol:'opendesk.video-speed.global.v1',operation:'recheck'});
  f.changed.fire({'opendesk.video-speed.global.v1':{}},'local');await f.flush();assert.equal(f.calls.length,2);
  f.changed.fire({'opendesk.market.provenance.v1':{}},'local');await f.flush();assert.equal(f.calls.length,3);
});
