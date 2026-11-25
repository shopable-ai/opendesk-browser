import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionRecovery,RECOVERY_DEVICE_STORE} from '../../src/sidebar-tools/recovery/controller.js';
import {matchesRecoveryRelease,isPortableSidebarPackage} from '../../src/sidebar-tools/recovery/eligibility.js';
import {libraryStorage} from '../../src/sidebar-tools/recovery/library-storage.js';
import {knowledgeAnswersRecoveryData as adapter} from '../../projects/ai-knowledge-answers/trusted/recovery-data.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_OPERATIONS_STORE} from '../../src/ui/sidebar-tools/installation.js';

const id=adapter.id,hash='a'.repeat(64),version='0.1.7';
const entry={kind:'app',id,title:'Sample FAQ',version,hash,source:'official',enabled:true};
const release={toolId:id,id:'opendesk/'+id,version,sha256:hash,installationPolicy:'optional',capabilities:['storage.local']};
const tool={format:'opendesk.sidebar-tool.v1',id,version,title:entry.title,description:'Sample FAQ.',
  capabilities:['storage.local'],html:'<main>FAQ</main>',css:'',js:'void 0;'};
const library={version:1,items:[{id:'qa_sample',question:'Opening hours?',answer:'Nine.',scope:'',aliases:[],enabled:true}]};
const a={id:'fixture-a'},b={id:'fixture-b'};

test('automatic recovery requires the exact optional package and no privileged behavior',()=>{
  assert.equal(matchesRecoveryRelease(entry,release),true);
  assert.equal(isPortableSidebarPackage(tool),true);
  for(const change of [{version:'0.1.8'},{sha256:'b'.repeat(64)},{sourceId:'third-party'},
    {installationPolicy:'default'},{capabilities:['storage.local','page.read']}])
    assert.equal(matchesRecoveryRelease(entry,{...release,...change}),false);
  assert.equal(matchesRecoveryRelease({...entry,enabled:false},release),false);
  assert.equal(matchesRecoveryRelease({...entry,source:'local'},release),false);
  for(const change of [{pageModule:{}},{backgroundPolicy:{}},{controller:{}},{contributes:{contextMenus:[{}]}}])
    assert.equal(isPortableSidebarPackage({...tool,...change}),false);
});

test('claiming an authored library fences account and package, preserving other device keys',()=>{
  const raw={library,other:'unchanged'};
  const saved=libraryStorage(raw,a,{claim:true,hash}).replace(adapter.validate(library));
  assert.equal(saved.other,'unchanged');assert.ok(!Object.hasOwn(saved,'library'));
  assert.deepEqual(libraryStorage(saved,a,{hash}).value,library);
  assert.equal(libraryStorage(saved,b,{hash}).value,null);
  assert.equal(libraryStorage(saved,null,{hash}).value,null);
  assert.equal(libraryStorage(saved,a,{hash:'b'.repeat(64)}).incompatible,true);
  const next=libraryStorage(saved,b,{hash}).replace({version:1,items:[]});
  assert.deepEqual(libraryStorage(next,a,{hash}).value,library);
  assert.throws(()=>adapter.validate({...library,cookies:[]}),{code:'E_KB_VALIDATION'});
});

test('a matching registry row with an unresolved install does not trigger a replay or restore data',async()=>{
  const op=crypto.randomUUID(),key=sidebarToolStorageKey(id),initial={library};
  const values={
    [SIDEBAR_TOOL_STORE]:[tool],
    [MARKET_OPERATIONS_STORE]:{[op]:{toolId:id,marketId:release.id,sha256:hash,version,state:'committing'}},
    [RECOVERY_DEVICE_STORE]:{'account:fixture-a':{auto:true,data:true,attempts:{[id]:op}}},
    [key]:initial
  };
  let reads=0;
  const api={storage:{local:{async get(keys){return Object.fromEntries([keys].flat().map(key=>[key,structuredClone(values[key])]));},
    async set(){assert.fail('unresolved install must not write');}}}};
  const active={...a,isCurrent:async()=>true,async read(){reads++;return {revision:'1',
    value:{entries:[entry],data:{id,hash,version,schema:1,value:library}}};}};
  const controller=createExtensionRecovery({api,lockManager:{request:(_name,work)=>work()},accounts:{current:async()=>active}});
  await controller.run();
  assert.equal(controller.getSnapshot().rows[0].status,'unknown');
  assert.equal(controller.getSnapshot().dataState,'dataWaiting');
  assert.equal(reads,1);
  assert.deepEqual(values[key],initial);
});
