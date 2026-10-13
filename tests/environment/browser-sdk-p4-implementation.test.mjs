import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {executeBrowserToolStorage} from '../../src/ui/sidebar-tools/storage-state.js';
import {sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';

const code=name=>e=>e?.code===name;
function fixture(){
  const records=new Map(),calls=[];let granted=true,afterWrite=null;
  const api={storage:{local:{
    async get(key){calls.push('get');return {[key]:structuredClone(records.get(key))};},
    async set(data){calls.push('set');for(const [key,value] of Object.entries(data))records.set(key,structuredClone(value));afterWrite?.();}
  }}};
  const authorize=async()=>{if(!granted)throw Object.assign(new Error('Revoked'),{code:'E_GRANT_REVOKED'});};
  return {records,calls,
    run:(op,toolId,args={})=>executeBrowserToolStorage({api,operation:'browser.storage.local.'+op,toolId,input:args,authorize}),
    revoke:()=>{granted=false;},onWrite:fn=>{afterWrite=fn;}};
}
test('four official SDK Storage names, typed registry and page denial',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(operation,args)=>{calls.push([operation,args]);return {};}}),ops=['get','set','remove','clear'];
  for(const op of ops)assert.equal(BROWSER_OPERATIONS['browser.storage.local.'+op]?.implementation,'IMPLEMENTED');
  await sdk.storage.local.get({keys:['setting']});
  await sdk.storage.local.set({items:{setting:'yes'}});
  await sdk.storage.local.remove({keys:['setting']});
  await sdk.storage.local.clear({confirm:true});
  assert.deepEqual(calls.map(([name])=>name),ops.map(x=>'browser.storage.local.'+x));
  assert.equal(BROWSER_OPERATIONS['browser.storage.local.clear'].requiresUserGesture,true);
  assert.equal(createBrowserSdk({context:'page-sdk'}).storage,undefined);
});
test('get, set, remove and clear only touch the installed tool namespace',async()=>{
  const f=fixture();
  assert.deepEqual(await f.run('set','alpha-tool',{items:{theme:'dark',options:{size:12}}}),{written:2});
  await f.run('set','beta-tool',{items:{private:'secret'}});
  assert.deepEqual(await f.run('get','alpha-tool',{keys:['theme','private']}),{items:{theme:'dark'}});
  assert.deepEqual(await f.run('get','alpha-tool'),{items:{theme:'dark',options:{size:12}}});
  assert.deepEqual(await f.run('remove','alpha-tool',{keys:['theme','none']}),{removed:1});
  assert.deepEqual(await f.run('clear','alpha-tool',{confirm:true}),{removed:1});
  assert.deepEqual(await f.run('get','alpha-tool'),{items:{}});
  assert.deepEqual(await f.run('get','beta-tool'),{items:{private:'secret'}});
  assert.equal(f.calls.includes('clear'),false);
  assert.equal(f.records.has(sidebarToolStorageKey('beta-tool')),true);
});
test('reject untrusted keys, implicit global clear, excessive quota and response bytes',async()=>{
  for(const [name,args] of [
    ['get',{keys:['__proto__']}],['remove',{keys:['constructor']}],
    ['remove',{keys:['ok','ok']}],['set',{items:{value:undefined}}],
    ['set',{items:{'bad/name':1}}],['clear',{}],['clear',{confirm:false}]
  ])assert.throws(()=>normalizeBrowserOperation('browser.storage.local.'+name,args),code('E_SCHEMA'));
  const f=fixture();
  await assert.rejects(f.run('set','alpha-tool',{items:Object.fromEntries(
    Array.from({length:33},(_,i)=>['key'+i,i]))}),code('E_LIMIT'));
  await assert.rejects(f.run('set','alpha-tool',{items:{tooBig:'X'.repeat(8200)}}),code('E_LIMIT'));
  await f.run('set','alpha-tool',{items:{a:'X'.repeat(7000),b:'Y'.repeat(7000)}});
  await assert.rejects(f.run('get','alpha-tool'),code('E_LIMIT'));
});
test('revocation denies read and unknown post-write outcome never reports success',async()=>{
  const f=fixture();await f.run('set','alpha-tool',{items:{a:1}});
  f.revoke();
  await assert.rejects(f.run('get','alpha-tool'),code('E_GRANT_REVOKED'));
  const g=fixture();g.onWrite(()=>g.revoke());
  await assert.rejects(g.run('set','alpha-tool',{items:{a:2}}),code('E_OUTCOME_UNKNOWN'));
  assert.equal(g.records.get(sidebarToolStorageKey('alpha-tool')).a,2);
});
