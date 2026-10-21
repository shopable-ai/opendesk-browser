import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {readAppServiceInstallation} from '../../src/platform/tasks/app-service-installation.js';
import {validateSidebarToolPackage,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {executeBrowserToolStorage} from '../../src/ui/sidebar-tools/storage-state.js';

async function fixture(){
  const js='async function main(){return 1;}';
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'service-probe',title:'Service probe',description:'Background host validation',version:'1.0.0',
    capabilities:['browser.storage','browser.scheduler'],html:'<main>probe</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
    background:{kind:'opendesk.app-service.v1',js,sha256:createHash('sha256').update(js).digest('hex')}});
  const values=new Map([[SIDEBAR_TOOL_STORE,[tool]],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'generation-one'}],
    [sidebarToolStorageKey('foreign-app'),{secret:42}]]);
  let afterRead=()=>{},afterWrite=()=>{};
  const local={async get(keys){const result=Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(values.get(k))]));afterRead(keys);return result;},
    async set(rows){for(const [k,v] of Object.entries(rows))values.set(k,structuredClone(v));afterWrite();}};
  const api={runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p},
    storage:{local,session:local,onChanged:{addListener(){}}},permissions:{contains:async()=>true},tabs:{},webNavigation:{}};
  const host=createContextMenuHost({api,lockManager:{request:(_key,run)=>run()},logger:{warn(){}}});
  const {binding}=await readAppServiceInstallation(api,tool.id);
  return {api,values,tool,binding,host,afterRead:fn=>{afterRead=fn;},afterWrite:fn=>{afterWrite=fn;},
    call:(operation,args={},extra={})=>host.handleService({operation,args,binding,authorize:async()=>true,...extra})};
}

test('app Host uses the existing owned storage and rejects caller-chosen ownership and forbidden SDK',async()=>{
  const f=await fixture();
  await f.call('browser.storage.local.set',{items:{answer:5050}});
  assert.deepEqual(await f.call('browser.storage.local.get'),{items:{answer:5050}});
  assert.deepEqual(f.values.get(sidebarToolStorageKey('foreign-app')),{secret:42});
  for(const operation of ['browser.tabs.create','browser.storage.local.clear','browser.network.request'])
    await assert.rejects(f.call(operation),{code:'E_CAPABILITY'});
  await assert.rejects(f.call('browser.storage.local.get',{owner:'foreign-app'}),{code:'E_SCHEMA'});
  for(const field of ['appId','packageHash','codeHash','generation'])
    await assert.rejects(f.call('browser.storage.local.set',{items:{bad:true}},{binding:{...f.binding,[field]:'forged'}}));
  assert.equal(f.values.get(sidebarToolStorageKey(f.tool.id)).bad,undefined);
});

test('run stop during asynchronous installation verification blocks the impending write',async()=>{
  const f=await fixture();let stopped=false;
  f.afterRead(keys=>{if(Array.isArray(keys)&&keys.includes(SIDEBAR_TOOL_STORE))stopped=true;});
  await assert.rejects(f.call('browser.storage.local.set',{items:{bad:true}},
    {authorize:async()=>{if(stopped)throw Object.assign(Error('stopped'),{code:'E_CANCELLED'});}}),{code:'E_CANCELLED'});
  assert.equal(f.values.has(sidebarToolStorageKey(f.tool.id)),false);
});

test('confirmed storage effects are recorded before a concurrent stop fences delivery',async()=>{
  const f=await fixture();let stopped=false,receipt,dispatched=false;
  f.afterWrite(()=>{stopped=true;});
  await assert.rejects(f.call('browser.storage.local.set',{items:{answer:5050}},
    {authorize:async()=>{if(stopped)throw Object.assign(Error('stopped'),{code:'E_CANCELLED'});},
      onDispatch:()=>{dispatched=true;},recordEffect:async value=>{receipt=value;}}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(dispatched,true);assert.deepEqual(receipt,{written:1});
  assert.equal(f.values.get(sidebarToolStorageKey(f.tool.id)).answer,5050);
});

test('lost storage acknowledgement is reconciled; missing readback remains unknown without a fabricated receipt',async()=>{
  const f=await fixture();const set=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{await set(rows);throw Error('lost acknowledgement');};
  let receipt;
  assert.deepEqual(await f.call('browser.storage.local.set',{items:{answer:5050}},{recordEffect:async value=>{receipt=value;}}),{written:1});
  assert.deepEqual(receipt,{written:1});
  const g=await fixture();let reads=0,dispatched=false;
  await assert.rejects(executeBrowserToolStorage({api:{storage:{local:{
    get:async()=>{if(reads++)throw Error('lost readback');return {};},set:async()=>{}}}},operation:'browser.storage.local.set',
    toolId:g.tool.id,input:{items:{answer:1}},authorize:async()=>true,onDispatch:()=>{dispatched=true;},
    recordEffect:async()=>assert.fail('unconfirmed write cannot be a durable receipt')}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(dispatched,true);
});
