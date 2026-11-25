import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueCache} from '../src/page/cache.js';
import {deepSeekRoute,geminiRoute} from '../src/page/site.js';
import {memoryStorage} from './helpers/session-storage.mjs';
const route='c/12345678',key='opendesk.ai-send-queue.session.v1:'+route;
const record=()=>({version:1,route,items:[{id:'q1',text:'  原文\n末行\n',state:'paused'}],
  expanded:true,inFlight:null,draft:null});
test('refresh cache keeps exact text and order and strips DOM/receipt fields',()=>{
  const storage=memoryStorage(),a=createQueueCache({storage:()=>storage});
  assert.equal(a.read(route).status,'empty');
  const value=record();value.token={node:'forbidden'};value.items[0].before={node:'forbidden'};
  assert.equal(a.write(value),true);
  const b=createQueueCache({storage:()=>storage}),saved=b.read(route);
  assert.equal(saved.status,'ready');assert.deepEqual(saved.data,record());
  assert.doesNotMatch(storage.getItem(key),/forbidden|token|before/);
});
test('routes and independent tab stores never share or overwrite queues',()=>{
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage});cache.read(route);cache.write(record());
  assert.equal(cache.read('c/87654321').status,'empty');
  assert.equal(createQueueCache({storage:()=>memoryStorage()}).read(route).status,'empty');
  assert.deepEqual(cache.read(route).data,record());
});
test('DeepSeek and Gemini adapter identities open isolated refresh caches',()=>{
  const deepSeek=deepSeekRoute(new URL('https://chat.deepseek.com/a/chat/s/11111111-2222-3333-4444-555555555555')).route;
  const gemini=geminiRoute(new URL('https://gemini.google.com/app/Abc_123')).route;
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage});
  for(const key of [route,deepSeek,gemini]){
    assert.equal(cache.read(key).status,'empty');
    assert.equal(cache.write({...record(),route:key,items:[{id:'q1',text:key,state:'paused'}]}),true);
  }
  const afterRefresh=createQueueCache({storage:()=>storage});
  for(const key of [route,deepSeek,gemini])assert.equal(afterRefresh.read(key).data.items[0].text,key);
  assert.equal(afterRefresh.read('a/chat/s/11111111-2222-3333-4444-555555555556').status,'empty');
  assert.equal(afterRefresh.read('app/abc_123').status,'empty');
  for(const key of ['a/chat/s','a/chat/s/not-an-id',deepSeek.toUpperCase(),deepSeek+'/',deepSeek+'?x','app/']){
    assert.equal(afterRefresh.read(key).status,'invalid');
    assert.equal(afterRefresh.write({...record(),route:key}),false);
  }
});
test('removing the last item clears the cache and does not revive it',()=>{
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage});cache.read(route);cache.write(record());
  assert.equal(cache.write({...record(),items:[]}),true);assert.equal(storage.getItem(key),null);
  assert.equal(createQueueCache({storage:()=>storage}).read(route).status,'empty');
});
test('pending original draft persists even with no queued items',()=>{
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage});cache.read(route);
  const value={...record(),items:[],draft:{text:'完整原文\n'}};
  assert.equal(cache.write(value),true);assert.deepEqual(cache.read(route).data,value);
});
for(const [name,change] of [
  ['future schema',v=>v.version=2],['wrong route',v=>v.route='c/87654321'],
  ['duplicate IDs',v=>v.items.push({...v.items[0]})],['oversize text',v=>v.items[0].text='x'.repeat(8193)],
  ['empty text',v=>v.items[0].text='   '],['invalid state',v=>v.items[0].state='confirmed'],
  ['conflicting flight',v=>{v.items[0].state='unknown';v.items.push({id:'q2',text:'next',state:'paused'});v.inFlight={id:'q2'};}],['orphan flight',v=>v.inFlight={id:'q2'}],
  ['overflow',v=>v.items=Array.from({length:21},(_,i)=>({id:'q'+(i+1),text:'a',state:'queued'}))]
])test('invalid cache is preserved without authorizing overwrite: '+name,()=>{
  const storage=memoryStorage(),value=record();change(value);const raw=JSON.stringify(value);storage.setItem(key,raw);
  const cache=createQueueCache({storage:()=>storage});assert.equal(cache.read(route).status,'invalid');
  assert.equal(cache.write(record()),false);assert.equal(storage.getItem(key),raw);
});
test('corrupt or unavailable storage never throws or removes its original bytes',()=>{
  const storage=memoryStorage();storage.setItem(key,'{broken');
  const cache=createQueueCache({storage:()=>storage});assert.equal(cache.read(route).status,'unavailable');
  assert.equal(cache.write(record()),false);assert.equal(storage.getItem(key),'{broken');
  const denied=createQueueCache({storage:()=>{throw Error('denied');}});
  assert.equal(denied.read(route).status,'unavailable');assert.equal(denied.write(record()),false);
});
test('quota/write failure keeps the last good backup',()=>{
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage});cache.read(route);cache.write(record());
  const original=storage.getItem(key);storage.setItem=()=>{throw Error('quota');};
  assert.equal(cache.write({...record(),draft:{text:'new'}}),false);assert.equal(storage.getItem(key),original);
});
