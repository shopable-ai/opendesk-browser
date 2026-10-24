import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiLocaleController,UI_LOCALE_STORE,canonicalUiLocale,resolveGlobalUiLocale}
  from '../../src/ui/app-localization.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(value){
  const callbacks=new Set();
  const emit=(newValue,area='local')=>{for(const fn of [...callbacks])fn({[UI_LOCALE_STORE]:{newValue}},area);};
  const saved={[UI_LOCALE_STORE]:value};
  const api={storage:{local:{async get(){return {...saved};},async set(data){Object.assign(saved,data);emit(data[UI_LOCALE_STORE]);}},
    onChanged:{addListener(fn){callbacks.add(fn);},removeListener(fn){callbacks.delete(fn);}}}};
  return {api,emit,saved,callbacks};
}
const options={languages:['fr-FR','zh-Hant-HK'],storage:()=>undefined,eventTarget:null};

test('global preferences are fixed; auto resolves browser languages; tools keep BCP47',async()=>{
  const f=fixture('auto'),c=createUiLocaleController(f.api,options);
  await c.ready;
  assert.equal(c.getPreference(),'auto');assert.equal(c.getLocale(),'zh-TW');assert.equal(c.getError(),null);
  assert.equal(canonicalUiLocale('de-DE'),'de-DE');assert.equal(canonicalUiLocale('EN-us'),'en-US');
  await assert.rejects(c.setLocale('de-DE'),/E_UI_LOCALE_INVALID/);
  await assert.rejects(c.setLocale('en-US'),/E_UI_LOCALE_INVALID/);
  for(const value of ['en','zh-CN','zh-TW','ja','auto']){await c.setLocale(value);assert.equal(c.getPreference(),value);}
  assert.equal(resolveGlobalUiLocale('auto',['xx','ja-JP']),'ja');
  assert.equal(resolveGlobalUiLocale('auto',['de-DE']),'en');
  c.dispose();
});

test('late startup reads cannot overwrite newer set or storage events',async()=>{
  for(const action of ['set','event']){
    const f=fixture('en'),read=deferred();let reads=0;
    f.api.storage.local.get=()=>++reads===1?read.promise:Promise.resolve({...f.saved});
    const c=createUiLocaleController(f.api,options);
    if(action==='set')await c.setLocale('ja');else f.emit('ja');
    read.resolve({[UI_LOCALE_STORE]:'en'});await c.ready;
    assert.equal(c.getPreference(),'ja');c.dispose();
  }
});

test('writes serialize and stale echoes do not overwrite the latest choice',async()=>{
  const f=fixture('en'),first=deferred(),seen=[];
  let calls=0;
  f.api.storage.local.set=async data=>{if(++calls===1)await first.promise;Object.assign(f.saved,data);f.emit(data[UI_LOCALE_STORE]);};
  const c=createUiLocaleController(f.api,options);await c.ready;
  c.subscribe(value=>seen.push(value));
  const old=c.setLocale('ja'),latest=c.setLocale('zh-CN');
  assert.equal(c.getLocale(),'zh-CN');first.resolve();await Promise.all([old,latest]);
  assert.equal(c.getLocale(),'zh-CN');assert.equal(f.saved[UI_LOCALE_STORE],'zh-CN');
  assert.deepEqual(seen,['ja','zh-CN']);c.dispose();
});

test('failed writes reject and roll back; read failures report errors without losing usable locale',async()=>{
  const f=fixture('en'),c=createUiLocaleController(f.api,options);await c.ready;
  f.api.storage.local.set=async()=>{throw Error('disk');};
  await assert.rejects(c.setLocale('ja'),/E_UI_LOCALE_STORAGE/);
  assert.equal(c.getPreference(),'en');assert.equal(c.getError().code,'E_UI_LOCALE_STORAGE');
  f.api.storage.local.get=async()=>{throw Error('read');};await c.load();
  assert.equal(c.getLocale(),'en');assert.equal(c.getError().cause.message,'read');
  f.emit('auto');assert.equal(c.getError(),null);assert.equal(c.getLocale(),'zh-TW');c.dispose();
  const missing=createUiLocaleController(undefined,options);await missing.ready;
  await assert.rejects(missing.setLocale('ja'),/E_UI_LOCALE_STORAGE/);
  assert.equal(missing.getPreference(),'auto');missing.dispose();
});

test('cross-page notifications, deletion, listener isolation, and disposal',async()=>{
  const f=fixture('en'),a=createUiLocaleController(f.api,options),b=createUiLocaleController(f.api,options);
  await Promise.all([a.ready,b.ready]);
  const seen=[];a.subscribe(()=>{throw Error('broken consumer');});const off=a.subscribe(value=>seen.push(value));
  await b.setLocale('ja');assert.equal(a.getLocale(),'ja');assert.deepEqual(seen,['ja']);
  f.emit('en','sync');assert.equal(a.getLocale(),'ja');
  f.emit('de-DE');assert.equal(a.getPreference(),'auto');assert.equal(a.getLocale(),'zh-TW');
  off();f.emit(undefined);assert.deepEqual(seen,['ja','zh-TW']);
  assert.throws(()=>a.subscribe(null),TypeError);a.dispose();b.dispose();assert.equal(f.callbacks.size,0);
  await assert.rejects(a.setLocale('en'),/E_UI_LOCALE_DISPOSED/);
});

test('localStorage-only pages receive changes and auto follows languagechange',async()=>{
  const events=new EventTarget(),languages=['en-US'],cache=new Map([[UI_LOCALE_STORE,'auto']]);
  const c=createUiLocaleController(undefined,{languages,eventTarget:events,
    storage:()=>({getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)})});
  await c.ready;assert.equal(c.getLocale(),'en');languages[0]='ja-JP';events.dispatchEvent(new Event('languagechange'));
  assert.equal(c.getLocale(),'ja');await c.setLocale('zh-CN');assert.equal(cache.get(UI_LOCALE_STORE),'zh-CN');
  events.dispatchEvent(Object.assign(new Event('storage'),{key:UI_LOCALE_STORE,newValue:'zh-TW'}));
  assert.equal(c.getLocale(),'zh-TW');c.dispose();
});

test('trusted i18n and controller share storage semantics and isolate subscribers',async()=>{
  const i18n=await import('../../src/i18n/index.js');
  const f=fixture('ja');await i18n.loadLocalePreference({api:f.api});
  const seen=[],bad=i18n.subscribeLocale(()=>{throw Error('subscriber');}),off=i18n.subscribeLocale(value=>seen.push(value));
  assert.equal(i18n.getLocale(),'ja');f.saved[UI_LOCALE_STORE]='en';f.emit('en');assert.equal(i18n.getLocale(),'en');
  assert.equal(i18n.setLocalePreference('zh-TW',{persist:false}),'zh-TW');
  assert.deepEqual(seen,['en','zh-TW']);bad();off();
  f.api.storage.local.set=async()=>{throw Error('disk');};
  i18n.setLocalePreference('ja',{api:f.api});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(i18n.getLocale(),'en');assert.equal(i18n.getLocaleError().code,'E_UI_LOCALE_STORAGE');
});

test('durable global preference readback accepts a lost write acknowledgement',async()=>{
  const f=fixture('en'),c=createUiLocaleController(f.api,options);await c.ready;
  f.api.storage.local.set=async data=>{Object.assign(f.saved,data);throw Error('ack lost');};
  await c.setLocale('ja');assert.equal(c.getPreference(),'ja');assert.equal(c.getError(),null);
  const reopened=createUiLocaleController(f.api,options);await reopened.ready;
  assert.equal(reopened.getPreference(),'ja');c.dispose();reopened.dispose();
});

test('concurrent page controllers converge after interleaved preference writes',async()=>{
  const f=fixture('en'),hold=deferred();let calls=0;
  f.api.storage.local.set=async data=>{
    if(++calls===1)await hold.promise;
    Object.assign(f.saved,data);f.emit(data[UI_LOCALE_STORE]);
  };
  const a=createUiLocaleController(f.api,options),b=createUiLocaleController(f.api,options);
  await Promise.all([a.ready,b.ready]);
  const first=a.setLocale('ja'),second=b.setLocale('zh-CN');
  hold.resolve();await Promise.all([first,second]);
  assert.equal(f.saved[UI_LOCALE_STORE],'zh-CN');
  assert.equal(a.getPreference(),'zh-CN');assert.equal(b.getPreference(),'zh-CN');
  a.dispose();b.dispose();
});

test('unknown preference writes block queued mutations until explicit readback recovery',async()=>{
  const f=fixture('en'),c=createUiLocaleController(f.api,options);await c.ready;
  let calls=0;
  f.api.storage.local.set=async data=>{
    calls++;Object.assign(f.saved,data);f.emit(data[UI_LOCALE_STORE]);throw Error('ack lost');
  };
  f.api.storage.local.get=async()=>{throw Error('read unavailable');};
  const results=await Promise.allSettled([c.setLocale('ja'),c.setLocale('zh-CN')]);
  assert.ok(results.every(result=>result.reason?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN'));
  assert.equal(calls,1);assert.equal(c.getError().code,'E_UI_LOCALE_OUTCOME_UNKNOWN');
  f.emit('ja');assert.equal(c.getError().code,'E_UI_LOCALE_OUTCOME_UNKNOWN');
  await c.load();assert.equal(c.getError().code,'E_UI_LOCALE_OUTCOME_UNKNOWN');
  await assert.rejects(c.setLocale('en'),/E_UI_LOCALE_OUTCOME_UNKNOWN/);assert.equal(calls,1);
  f.api.storage.local.get=async()=>({...f.saved});await c.load();
  assert.equal(c.getPreference(),'ja');assert.equal(c.getError(),null);
  f.api.storage.local.set=async data=>{calls++;Object.assign(f.saved,data);f.emit(data[UI_LOCALE_STORE]);};
  await c.setLocale('zh-CN');assert.equal(c.getPreference(),'zh-CN');c.dispose();
});

test('explicit recovery cannot revive a preference request queued before unknown outcome',async t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const waiting=deferred(),entered=deferred();let locks=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{async request(name,work){
    if(++locks===2){entered.resolve();await waiting.promise;}return work();
  }}}});
  t.after(()=>descriptor?Object.defineProperty(globalThis,'navigator',descriptor):delete globalThis.navigator);
  const f=fixture('en'),c=createUiLocaleController(f.api,options);await c.ready;t.after(()=>c.dispose());
  let writes=0;
  f.api.storage.local.set=async data=>{writes++;Object.assign(f.saved,data);throw Error('ack lost');};
  f.api.storage.local.get=async()=>{throw Error('read unavailable');};
  const first=c.setLocale('ja'),second=c.setLocale('zh-CN');
  const both=Promise.allSettled([first,second]);
  await entered.promise;
  f.api.storage.local.get=async()=>({...f.saved});await c.load();
  assert.equal(c.getPreference(),'ja');waiting.resolve();
  const results=await both;
  assert.equal(results[0].reason?.code,'E_UI_LOCALE_OUTCOME_UNKNOWN');
  assert.equal(results[1].reason?.code,'E_UI_LOCALE_RECOVERY_REQUIRED');
  assert.equal(writes,1);assert.equal(f.saved[UI_LOCALE_STORE],'ja');
  f.api.storage.local.set=async data=>{writes++;Object.assign(f.saved,data);f.emit(data[UI_LOCALE_STORE]);};
  await c.setLocale('en');assert.equal(writes,2);assert.equal(c.getPreference(),'en');
});
