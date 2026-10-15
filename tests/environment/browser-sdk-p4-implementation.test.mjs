import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {executeBrowserToolStorage} from '../../src/ui/sidebar-tools/storage-state.js';
import {sidebarToolStorageKey,validateSidebarToolPackage,sidebarToolPackageHash,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

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
test('six canonical SDK Storage methods, typed registry and page denial',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(operation,args)=>{calls.push([operation,args]);return {};}}),ops=['get','keys','getQuota','set','remove','clear'];
  for(const op of ops)assert.equal(BROWSER_OPERATIONS['browser.storage.local.'+op]?.implementation,'IMPLEMENTED');
  await sdk.storage.local.get({keys:['setting']});
  await sdk.storage.local.keys();
  await sdk.storage.local.getQuota();
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
  assert.deepEqual(await f.run('keys','alpha-tool'),{keys:['options','theme']});
  assert.deepEqual(await f.run('keys','beta-tool'),{keys:['private']});
  assert.deepEqual(await f.run('getQuota','alpha-tool'),{
    usedBytes:Buffer.byteLength(JSON.stringify({theme:'dark',options:{size:12}})),
    maxBytes:32768,keyCount:2,maxKeys:32,maxItemBytes:8192
  });
  assert.deepEqual(await f.run('getQuota','beta-tool'),{
    usedBytes:Buffer.byteLength(JSON.stringify({private:'secret'})),
    maxBytes:32768,keyCount:1,maxKeys:32,maxItemBytes:8192
  });
  assert.deepEqual(await f.run('remove','alpha-tool',{keys:['theme','none']}),{removed:1});
  assert.deepEqual(await f.run('clear','alpha-tool',{confirm:true}),{removed:1});
  assert.deepEqual(await f.run('get','alpha-tool'),{items:{}});
  assert.deepEqual(await f.run('get','beta-tool'),{items:{private:'secret'}});
  assert.equal(f.calls.includes('clear'),false);
  assert.equal(f.records.has(sidebarToolStorageKey('beta-tool')),true);
});
test('reject untrusted keys, implicit global clear, excessive quota and response bytes',async()=>{
  for(const [name,args] of [
    ['keys',{prefix:'other'}],['getQuota',{allTools:true}],
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
  await assert.rejects(f.run('keys','alpha-tool'),code('E_GRANT_REVOKED'));
  await assert.rejects(f.run('getQuota','alpha-tool'),code('E_GRANT_REVOKED'));
  const g=fixture();g.onWrite(()=>g.revoke());
  await assert.rejects(g.run('set','alpha-tool',{items:{a:2}}),code('E_OUTCOME_UNKNOWN'));
  assert.equal(g.records.get(sidebarToolStorageKey('alpha-tool')).a,2);
});

const HOST_INSTANCE='01234567-89ab-4def-8123-456789abcdef';
const STORAGE_SENDER={id:'r114-test',frameId:0,documentId:'storage-panel',documentLifecycle:'active',
  url:'chrome-extension://r114-test/ui/tool.html?hostInstanceId='+HOST_INSTANCE};
async function hostedStorage({caps=['browser.storage']}={}){
  const pkg=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'storage-probe',
    version:'1.0.0',title:'Storage probe',description:'Verified installed scoped service',
    capabilities:caps,html:'<main>storage</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
  const values=new Map([[SIDEBAR_TOOL_STORE,[pkg]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[pkg.id]:'epoch-1'}],
    [sidebarToolStorageKey(pkg.id),{alpha:1,beta:'two'}]]);
  let reads=0;
  const local={get:async keys=>{reads++;
    return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(values.get(k))]));
  },set:async rows=>{for(const [k,v] of Object.entries(rows))values.set(k,structuredClone(v));}};
  const api={runtime:{id:STORAGE_SENDER.id,
    getURL:path=>'chrome-extension://r114-test/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:STORAGE_SENDER.documentId,
      documentUrl:STORAGE_SENDER.url,frameId:0,incognito:false}]},
    storage:{local,session:local,onChanged:{addListener(){}}},
    permissions:{contains:async()=>true},tabs:{},webNavigation:{}};
  const host=createContextMenuHost({api,lockManager:{request:(_k,work)=>work()},logger:{warn(){}}});
  const identity={toolId:pkg.id,toolVersion:pkg.version,packageHash:await sidebarToolPackageHash(pkg),
    installEpoch:'epoch-1',hostInstanceId:HOST_INSTANCE,toolInstance:HOST_INSTANCE};
  const call=(operation,args={},extra={},sender=STORAGE_SENDER)=>host.handleTool({
    ...identity,operation,args,...extra
  },sender);
  return {pkg,values,call,identity,reads:()=>reads,
    sdk:createBrowserSdk({request:call})};
}
test('R11.4 storage reads traverse Facade/Host/Dispatcher and reject stale authority',async()=>{
  const f=await hostedStorage();
  assert.deepEqual(await f.sdk.storage.local.keys(),{keys:['alpha','beta']});
  assert.deepEqual(await f.sdk.storage.local.getQuota(),{
    usedBytes:Buffer.byteLength(JSON.stringify({alpha:1,beta:'two'})),
    maxBytes:32768,keyCount:2,maxKeys:32,maxItemBytes:8192
  });
  assert.equal((await f.sdk.capabilities.getStatus({operation:'browser.storage.local.keys'})).callableNow,true);
  await assert.rejects(f.call('browser.storage.local.keys',{prefix:'other'}),code('E_SCHEMA'));
  await assert.rejects(f.call('browser.storage.local.getQuota',{includeGlobal:true}),code('E_SCHEMA'));
  const denied=await hostedStorage({caps:[]});
  await assert.rejects(denied.call('browser.storage.local.keys'),code('E_TOOL_CAPABILITY_REQUIRED'));
  await assert.rejects(denied.call('browser.storage.local.getQuota'),code('E_TOOL_CAPABILITY_REQUIRED'));
  await assert.rejects(f.call('browser.storage.local.keys',{}, {installEpoch:'epoch-0'}),code('E_TOOL_CHANGED'));
  await assert.rejects(f.call('browser.storage.local.getQuota',{}, {packageHash:'a'.repeat(64)}),code('E_TOOL_CHANGED'));
  await assert.rejects(f.call('browser.storage.local.keys',{}, {}, {...STORAGE_SENDER,id:'foreign'}));
  f.values.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.pkg.id]:'epoch-2'});
  await assert.rejects(f.sdk.storage.local.keys(),code('E_TOOL_CHANGED'));
  await assert.rejects(f.sdk.storage.local.getQuota(),code('E_TOOL_CHANGED'));
});
