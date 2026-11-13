import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {runInNewContext} from 'node:vm';

const code=(await transform(await readFile(new URL('../src/ui/ProfileFavorites.tsx',import.meta.url),'utf8'),
  {loader:'tsx',format:'cjs'})).code;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// Run the actual hook with controlled React scheduling and deferred storage.
// Any access outside storage fails, including service/request/proxy commands.
function fixture(){
  const slots=[],effects=[],reads=[],writes=[],listeners=new Set(),forbidden=[];
  let cursor=0,unmounted=false,lateUpdates=0,cleanups=[];
  const hooks={
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;
      return [slots[index],next=>{if(unmounted)lateUpdates++;slots[index]=typeof next==='function'?next(slots[index]):next;}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useEffect(effect){const index=cursor++;if(!(index in slots)){slots[index]=true;effects.push(effect);}}
  };
  const env=new Proxy({storage:{local:{
    get(key){const task={key,...deferred()};reads.push(task);return task.promise;},
    set(items){const task={items,...deferred()};writes.push(task);return task.promise;}
  },onChanged:{addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);}}}},
  {get(target,key){if(key in target)return target[key];forbidden.push(key);throw Error(`Unexpected access: ${String(key)}`);}});
  const module={exports:{}};
  runInNewContext(code,{module,exports:module.exports,require(name){
    if(name==='react')return hooks;
    if(name==='../environment')return {getEnvironment:()=>env};
    throw Error(`Unexpected dependency: ${name}`);
  }});
  const render=()=>{cursor=0;return module.exports.useProfileFavorites();};
  const initial=render();cleanups=effects.map(effect=>effect());
  const key=module.exports.PROFILE_FAVORITES_KEY;
  return {render,initial,key,reads,writes,listeners,forbidden,
    emit(value,area='local'){for(const listener of [...listeners])listener({[key]:{newValue:value}},area);},
    async load(value){reads.at(-1).resolve({[key]:value});await tick();},
    restartEffects(){cleanups.forEach(fn=>fn());cleanups=effects.map(fn=>fn());},
    unmount(){unmounted=true;cleanups.forEach(fn=>fn());},
    get lateUpdates(){return lateUpdates;}};
}
const ids=f=>Array.from(f.render().ids);

test('default empty; hydrate only the favorites key and normalize stored UI metadata',async()=>{
  for(const [stored,expected] of [[undefined,[]],[null,[]],['invalid',[]],
    [['a','a',null,3,'','  ','b'],['a','b']]]){
    const f=fixture();assert.equal(f.key,'ai-proxy.profile-favorites.v1');
    assert.deepEqual(ids(f),[]);assert.equal(f.initial.ready,false);
    await f.initial.toggle('a');assert.equal(f.writes.length,0);
    assert.equal(f.reads.length,1);assert.equal(f.reads[0].key,f.key);
    await f.load(stored);assert.deepEqual(ids(f),expected);
    assert.equal(f.render().ready,true);assert.equal(f.render().error,false);
    assert.deepEqual(f.forbidden,[]);f.unmount();assert.equal(f.listeners.size,0);
  }
});

test('toggle is single-flight, persists endpoint IDs, and never writes proxy config or applies a route',async()=>{
  const f=fixture();await f.load(['a']);const stale=f.render();
  const first=stale.toggle('b');await stale.toggle('c');
  assert.equal(f.writes.length,1);assert.equal(f.render().busy,true);
  assert.deepEqual(ids(f),['a'],'do not claim success before the receipt');
  assert.deepEqual(Object.keys(f.writes[0].items),[f.key]);
  assert.deepEqual(Array.from(f.writes[0].items[f.key]),['a','b']);
  f.writes[0].resolve();await first;
  assert.equal(f.render().busy,false);assert.deepEqual(ids(f),['a','b']);
  const second=stale.toggle('a');
  assert.deepEqual(Array.from(f.writes[1].items[f.key]),['b'],'stale handler uses current IDs');
  f.writes[1].resolve();await second;assert.deepEqual(ids(f),['b']);
  const persisted=Array.from(f.writes[1].items[f.key]);f.unmount();
  const remount=fixture();await remount.load(persisted);assert.deepEqual(ids(remount),['b']);
  assert.deepEqual(f.forbidden,[]);assert.deepEqual(remount.forbidden,[]);remount.unmount();
});

test('local event wins over late hydration; unrelated events do not suppress the read',async()=>{
  const f=fixture();f.emit(['new']);await f.render().toggle('x');assert.equal(f.writes.length,0);
  await f.load(['old']);assert.deepEqual(ids(f),['new']);assert.equal(f.render().ready,true);
  f.emit(undefined);assert.deepEqual(ids(f),[]);assert.equal(f.writes.length,0);f.unmount();
  const g=fixture();g.emit(['wrong-area'],'sync');
  for(const fn of g.listeners)fn({other:{newValue:['other']}},'local');
  await g.load(['stored']);assert.deepEqual(ids(g),['stored']);g.unmount();
});

test('late write receipt cannot overwrite newer events, including a deletion',async()=>{
  for(const newer of [['external'],undefined]){
    const f=fixture();await f.load(['a']);const pending=f.render().toggle('b');
    f.emit(['a','b']);f.emit(newer);f.writes[0].resolve();await pending;
    assert.deepEqual(ids(f),newer??[]);assert.equal(f.render().busy,false);
    assert.equal(f.writes.length,1);f.unmount();
  }
});

test('read/write failures expose persistent error and block replay even through stale handlers and events',async()=>{
  for(const kind of ['read','write']){
    const f=fixture();let stale=f.render();
    if(kind==='read'){f.reads[0].reject(Error('read failed'));await tick();}
    else{
      await f.load(['a']);stale=f.render();const pending=stale.toggle('b');
      f.writes[0].reject(Error('unknown write result'));await pending;
    }
    assert.equal(f.render().error,true);assert.equal(f.render().ready,false);
    assert.equal(f.render().busy,false);const count=f.writes.length;
    f.emit(['external']);await stale.toggle('c');await f.render().toggle('d');
    assert.equal(f.writes.length,count);assert.equal(f.render().error,true);
    assert.equal(f.render().ready,false);assert.deepEqual(ids(f),kind==='write'?['a']:[]);
    assert.deepEqual(f.forbidden,[]);f.unmount();
    const remount=fixture();await remount.load(['confirmed']);
    const retry=remount.render().toggle('b');assert.equal(remount.writes.length,1);
    remount.writes[0].resolve();await retry;assert.equal(remount.render().error,false);remount.unmount();
  }
});

test('late reads, writes, saved callbacks and stale toggles cannot update or write after unmount',async()=>{
  for(const kind of ['read','write'])for(const reject of [false,true]){
    const f=fixture();let pending;
    if(kind==='write'){await f.load(['a']);pending=f.render().toggle('b');}
    const stale=f.render(),listener=[...f.listeners][0],count=f.writes.length;
    f.unmount();listener({[f.key]:{newValue:['late']}},'local');await stale.toggle('c');
    const task=kind==='read'?f.reads[0]:f.writes[0];
    if(reject)task.reject(Error('late failure'));else task.resolve(kind==='read'?{[f.key]:['late']}:undefined);
    await pending;await tick();assert.equal(f.lateUpdates,0);assert.equal(f.listeners.size,0);
    assert.equal(f.writes.length,count);assert.deepEqual(f.forbidden,[]);
  }
});

test('effect lifecycle restart isolates old reads, writes and listeners from the fresh session',async()=>{
  const f=fixture();await f.load(['a']);const old=f.render().toggle('b'),listener=[...f.listeners][0];
  f.restartEffects();assert.equal(f.listeners.size,1);assert.equal(f.render().ready,false);
  listener({[f.key]:{newValue:['stale']}},'local');await f.load(['fresh']);
  const current=f.render().toggle('c');assert.equal(f.render().busy,true);
  f.writes[0].reject(Error('old write'));await old;
  assert.equal(f.render().busy,true);assert.equal(f.render().error,false);
  f.writes[1].resolve();await current;assert.deepEqual(ids(f),['fresh','c']);f.unmount();
  const g=fixture();g.restartEffects();await g.load(['new-read']);
  g.reads[0].resolve({[g.key]:['old-read']});await tick();assert.deepEqual(ids(g),['new-read']);g.unmount();
});
