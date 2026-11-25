import test from 'node:test';
import assert from 'node:assert/strict';
import {createDetailMemoryObserver} from '../../src/development/detail-memory-observer.js';
import {SIDEBAR_LAST_EXTENSION_DETAIL_KEY as key} from '../../src/ui/sidebar-extension-detail-memory.js';

function fixture(read=async()=>({[key]:'page:detail-a'})){
  const listeners=new Set(),messages=[],reads=[];
  const storage={local:{get(name){reads.push(name);return read();},set(){assert.fail('observer wrote storage');},remove(){assert.fail('observer removed storage');}},
    onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
  let time=100;
  const observer=createDetailMemoryObserver({storage,publish:value=>messages.push(value),now:()=>++time,id:'observer-1'});
  return {observer,messages,reads,listeners,change:(value,area='local',name=key)=>{
    for(const listener of listeners)listener({[name]:{oldValue:'page:detail-a',newValue:value}},area);
  }};
}

test('development observer reads only the original key and observes without a lock or writes',async()=>{
  const f=fixture();
  await f.observer.read();
  assert.deepEqual(f.reads,[key]);
  assert.deepEqual(f.observer.snapshot().current,{state:'known',value:'page:detail-a'});
  f.change('page:detail-b');
  assert.deepEqual(f.messages.at(-1).events.at(-1),{type:'change',observedAt:102,previous:'page:detail-a',value:'page:detail-b'});
  f.change('app:ignored','session');f.change('app:ignored','local','unrelated-key');
  assert.equal(f.messages.length,2);
  f.observer.dispose();assert.equal(f.listeners.size,0);
});

test('development observer preserves a newer change when an older read finishes late',async()=>{
  let finish;
  const f=fixture(()=>new Promise(resolve=>{finish=resolve;})),pending=f.observer.read();
  f.change('page:newer');finish({[key]:'page:older'});await pending;
  assert.deepEqual(f.observer.snapshot().current,{state:'known',value:'page:newer'});
  assert.equal(f.messages.length,1);
  f.observer.dispose();
});

test('development observer reports unknown reads, bounds volatile history and redacts malformed values',async()=>{
  const f=fixture(async()=>{throw Error('unavailable');});
  await f.observer.read();
  assert.deepEqual(f.observer.snapshot().current,{state:'unknown'});
  assert.equal(f.messages.at(-1).events.at(-1).type,'read-failed');
  for(let i=0;i<20;i++)f.change('page:detail-'+i);
  assert.equal(f.observer.snapshot().events.length,16);
  f.change('unexpected private text');
  assert.deepEqual(f.observer.snapshot().current,{state:'known',value:'invalid'});
  assert.equal(JSON.stringify(f.observer.snapshot()).includes('unexpected private text'),false);
  f.observer.dispose();
});

test('disposing the observer suppresses an outstanding read without replaying anything',async()=>{
  let finish;
  const f=fixture(()=>new Promise(resolve=>{finish=resolve;})),pending=f.observer.read();
  f.observer.dispose();finish({[key]:'page:detail-a'});await pending;
  assert.equal(f.messages.length,0);assert.equal(f.listeners.size,0);assert.equal(f.reads.length,1);
});
