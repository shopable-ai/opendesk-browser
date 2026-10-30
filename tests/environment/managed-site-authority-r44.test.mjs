import test from 'node:test';
import assert from 'node:assert/strict';
import {readManagedSiteToolAuthority,assertManagedSiteToolLease}
  from '../../src/platform/host/managed-site-authority.js';
import {focusPackageHash} from '../../projects/stay-focus/trusted/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';

const packageRow=(version='1.0.3')=>({format:'opendesk.sidebar-tool.v1',id:'stay-focus',
  version,title:'Stay Focus',description:'test scoped installed package',
  capabilities:['focus.control'],html:'<main>Focus UI</main>',css:'',js:'void 0;'});
function fixture(rows=[packageRow()],enabled=true,epoch='epoch-r44'){
  const values={
    [SIDEBAR_TOOL_STORE]:rows,[SIDEBAR_TOOL_ENABLE_STORE]:{'stay-focus':enabled},
    [TOOL_REVOCATION_EPOCHS_STORE]:{'stay-focus':epoch},local_focus_state:{usage:{}}
  };
  const api={storage:{local:{get:async keys=>Object.fromEntries(keys.filter(x=>Object.hasOwn(values,x))
    .map(key=>[key,structuredClone(values[key])]))}}};
  return {api,values};
}
const options={toolId:'stay-focus',capability:'focus.control',extraStoreKeys:['local_focus_state']};
test('common Host Authority reads only one validated installed package and exact state keys',async()=>{
  const {api}=fixture();
  const found=await readManagedSiteToolAuthority(api,options);
  assert.equal(found.tool.id,'stay-focus');
  assert.equal(found.tool.version,'1.0.3');
  assert.equal(found.enabled,true);
  assert.equal(found.epoch,'epoch-r44');
  assert.deepEqual(found.saved.local_focus_state,{usage:{}});
  assert.equal((await readManagedSiteToolAuthority(fixture([packageRow(),packageRow()]).api,options)).tool,null);
  assert.equal((await readManagedSiteToolAuthority(fixture([{id:'stay-focus',html:'unsafe'}]).api,options)).tool,null);
  assert.equal((await readManagedSiteToolAuthority(fixture([packageRow()],false).api,options)).enabled,false);
});
test('lease fences stale package hash, install epoch, disable and missing scope',async()=>{
  const {api}=fixture();
  const hash=await focusPackageHash(packageRow());
  const args={...options,packageHash:hash,installEpoch:'epoch-r44',hashPackage:focusPackageHash};
  assert.equal((await assertManagedSiteToolLease(api,args)).tool.version,'1.0.3');
  await assert.rejects(assertManagedSiteToolLease(api,{...args,packageHash:'0'.repeat(64)}),{code:'E_TOOL_CHANGED'});
  await assert.rejects(assertManagedSiteToolLease(api,{...args,installEpoch:'stale'}),{code:'E_TOOL_CHANGED'});
  await assert.rejects(assertManagedSiteToolLease(fixture([packageRow()],false).api,args),{code:'E_TOOL_CHANGED'});
  await assert.rejects(assertManagedSiteToolLease(fixture([packageRow('1.0.4')]).api,args),{code:'E_TOOL_CHANGED'});
  await assert.rejects(assertManagedSiteToolLease(api,{...args,capability:'adblock.control'}),{code:'E_TOOL_CHANGED'});
});
