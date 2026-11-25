import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionDetailMemory,SIDEBAR_LAST_EXTENSION_DETAIL_KEY as LAST,
  detailMemoryPreferenceKey as pref} from '../../src/ui/sidebar-extension-detail-memory.js';

const deferred=()=>Promise.withResolvers();
function fixture(values={}){
  let tail=Promise.resolve();
  const locks={request(_name,work){const next=tail.then(work);tail=next.catch(()=>{});return next;}};
  const store={...values},writes=[];
  const storage={
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in store).map(key=>[key,store[key]]));},
    async set(values){writes.push(values);Object.assign(store,values);},
    async remove(key){delete store[key];}
  };
  const create=()=>createExtensionDetailMemory({storage,locks});
  return {store,writes,storage,locks,create,memory:create()};
}

test('details participate by default; App and Page opt-outs are separate and enabling waits for a future entry',async()=>{
  const {memory,store}=fixture();
  assert.equal(await memory.readPreference('app:reader'),true);
  assert.equal(await memory.readPreference('page:reader'),true);
  await memory.record('app:reader');
  assert.equal(store[LAST],'app:reader');
  await memory.setEnabled('app:reader',false);
  assert.equal(store[LAST],null);
  assert.equal(await memory.readPreference('page:reader'),true);
  await memory.record('page:reader');
  assert.equal(store[LAST],'page:reader');
  await memory.record('app:reader');
  assert.equal(store[LAST],null,'an opted-out visit cannot expose the older Page on reopen');
  await memory.setEnabled('app:reader',true);
  assert.equal(store[LAST],null,'enabling is not a detail navigation');
  await memory.record('app:reader');
  assert.equal(store[LAST],'app:reader');
});

test('changing or uninstalling one extension never clears a newer extension record or the other type preference',async()=>{
  const {memory,store}=fixture({[LAST]:'page:newer',[pref('app:reader')]:false,[pref('page:reader')]:false});
  await memory.setEnabled('app:reader',false);
  assert.equal(store[LAST],'page:newer');
  await memory.forget('app:reader');
  assert.equal(store[LAST],'page:newer');
  assert.equal(pref('app:reader') in store,false);
  assert.equal(store[pref('page:reader')],false);
  await memory.forget('page:newer');
  assert.equal(store[LAST],null);
});

test('different panel documents serialize a delayed record, opt-out, and newer navigation under one lock',async()=>{
  const f=fixture(),older=f.memory,newer=f.create(),read=deferred(),entered=deferred();
  const original=f.storage.get;
  let held=false;
  f.storage.get=async keys=>{
    if(keys===pref('page:reader')&&!held){held=true;entered.resolve();await read.promise;}
    return original(keys);
  };
  const first=older.record('page:reader');
  await entered.promise;
  const optOut=newer.setEnabled('page:reader',false);
  const latest=newer.record('page:newer');
  read.resolve();
  await Promise.all([first,optOut,latest]);
  assert.equal(f.store[pref('page:reader')],false);
  assert.equal(f.store[LAST],'page:newer');
  await older.record('page:reader');
  assert.equal(f.store[LAST],null,'an old document must re-read the opt-out before recording');
});

test('same-document newer navigation supersedes a record still reading its preference',async()=>{
  const f=fixture(),read=deferred(),entered=deferred(),original=f.storage.get;
  f.storage.get=async keys=>{
    if(keys===pref('page:reader')){entered.resolve();await read.promise;}
    return original(keys);
  };
  const old=f.memory.record('page:reader');await entered.promise;
  const latest=f.memory.record('page:newer');read.resolve();
  await Promise.all([old,latest]);
  assert.deepEqual(f.writes,[{[LAST]:'page:newer'}]);
});

test('restore rechecks the current key, opt-out and user navigation before opening',async()=>{
  const f=fixture({[LAST]:'page:reader'}),opened=[];
  const restore=()=>f.memory.restore('page:reader',()=>true,()=>opened.push('reader'));
  await f.memory.record('page:newer');
  assert.equal(await restore(),false);assert.deepEqual(opened,[]);
  await f.memory.record('page:reader');
  assert.equal(await f.memory.restore('page:reader',()=>false,()=>opened.push('reader')),false);
  f.store[pref('page:reader')]=false;
  assert.equal(await restore(),false);assert.equal(f.store[LAST],null);
  assert.deepEqual(opened,[]);
});

test('invalid installation cleanup is atomic with its decision and cannot erase a queued same-key navigation',async()=>{
  const f=fixture({[LAST]:'page:reader'}),release=deferred(),entered=deferred();
  const set=f.storage.set;
  f.storage.set=async values=>{
    if(values[LAST]===null){entered.resolve();await release.promise;}
    await set(values);
  };
  const invalid=f.memory.restore('page:reader',()=>'invalid',()=>assert.fail('removed detail cannot open'));
  await entered.promise;
  const newer=f.create().record('page:reader');
  release.resolve();
  assert.equal(await invalid,'invalid');await newer;
  assert.equal(f.store[LAST],'page:reader');
  assert.deepEqual(f.writes,[{[LAST]:null},{[LAST]:'page:reader'}]);
});

test('read failures and malformed preferences preserve the saved detail and reject rather than defaulting to enabled',async()=>{
  const f=fixture({[LAST]:'page:newer'}),original=f.storage.get;
  f.storage.get=async()=>{throw Error('offline');};
  await assert.rejects(f.memory.record('page:reader'),/offline/);
  await assert.rejects(f.memory.setEnabled('page:reader',false),/offline/);
  await assert.rejects(f.memory.readPreference('page:reader'),/offline/);
  assert.equal(f.store[LAST],'page:newer');assert.deepEqual(f.writes,[]);
  f.storage.get=original;f.store[pref('page:reader')]='false';
  await assert.rejects(f.memory.record('page:reader'),/PREFERENCE/);
  assert.equal(f.store[LAST],'page:newer');
});

test('a save without readback confirmation reports unknown and never automatically repeats the write',async()=>{
  const f=fixture({[LAST]:'page:reader'}),original=f.storage.get;
  f.storage.get=async keys=>{
    if(Array.isArray(keys))throw Error('readback unavailable');
    return original(keys);
  };
  await assert.rejects(f.memory.setEnabled('page:reader',false),/readback unavailable/);
  assert.equal(f.store[pref('page:reader')],false);
  assert.equal(f.store[LAST],null);
  assert.equal(f.writes.length,1);
  f.storage.get=original;
  assert.equal(await f.memory.readPreference('page:reader'),false);
  assert.equal(f.writes.length,1);
});

test('missing coordination, failed restore reads and cancelled clear cannot silently mutate the preference',async()=>{
  const f=fixture({[LAST]:'page:reader'});
  const unlocked=createExtensionDetailMemory({storage:f.storage});
  await assert.rejects(unlocked.record('page:reader'),/LOCK/);
  assert.equal(await f.memory.clear(()=>true,()=>false),false);
  f.storage.get=async()=>{throw Error('offline');};
  await assert.rejects(f.memory.restore('page:reader',()=>true,()=>assert.fail('must not open')),/offline/);
  assert.equal(f.store[LAST],'page:reader');assert.deepEqual(f.writes,[]);
  assert.throws(()=>pref('reader'),/KEY/);
});
