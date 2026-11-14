import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyChatGPTBackgroundTask} from '../../../src/native-agent/chatgpt-background-adapter.js';
import {validateWebFlowTaskIntent} from '../../../src/native-agent/chatgpt-task-request.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {storageError} from '../../../src/platform/storage/idb.js';
import {installedKey,taskKey,taskScriptId} from '../../../src/platform/tasks/contract.js';
import {taskRemovalKey} from '../../../src/platform/tasks/builtin-releases.js';
import {loadBuiltinWorkerSource} from '../../../src/libs/loader.js';
import {builtinIdentity} from '../../../src/libs/identity.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog,BUILTIN_RESOURCE_PATHS as paths} from '../../../src/libs/runtime-contract.js';

// Component fixture: exercise the real loader and installed Task verifier,
// with local resources and the storage boundary's real error projection.
// This neither executes a Task nor proves Chrome/IndexedDB behavior.
async function fixture(t){
  const assets=new Map(paths.map(path=>[path,'/* component fixture */']));
  for(const path of [catalog.bootstrap,catalog.libraries.myUtils.output])
    assets.set(path,await readFile(new URL('../../../src/'+path,import.meta.url),'utf8'));
  const resources=await Promise.all(paths.map(async path=>{
    const pin=Object.values(catalog.libraries).find(row=>row.output===path&&row.sha256);
    return {path,bytes:pin?.bytes??Buffer.byteLength(assets.get(path)),sha256:pin?.sha256??await digestUtf8(assets.get(path))};
  }));
  assets.set(catalog.resourceManifest,JSON.stringify({format:'opendesk.builtin-resources.v2',abi:BUILTIN_ABI,
    catalogSha256:await digestUtf8(JSON.stringify(catalog)),resources}));
  const runtime={id:'fixture',getURL:path=>'chrome-extension://fixture/'+path};
  t.mock.method(globalThis,'fetch',async url=>{
    assert.ok(url.startsWith(runtime.getURL('')));
    const value=assets.get(url.slice(runtime.getURL('').length));
    return {ok:value!==undefined,url,text:async()=>value};
  });
  const environment=builtinIdentity(await loadBuiltinWorkerSource({runtime}));
  const pkg=JSON.parse(await readFile(new URL('../../../task-packs/baidu.search/releases/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  const {taskId,version}=pkg.manifest,namespace='tool:'+runtime.id;
  const installed={tag:'task-installed-v1',namespace,taskId,version,enabled:true,
    scriptId:taskScriptId(taskId,version),manifestHash:pkg.manifestHash,builtinIdentity:environment,
    authorization:{tag:'task-install-authorization-v1',installationId:'11111111-1111-4111-8111-111111111111',generation:2,
      scope:{capabilities:pkg.manifest.permissions,siteOrigins:pkg.manifest.siteOrigins,networkOrigins:[]}}};
  const candidate={tag:'task-candidate-v1',namespace,taskId,version,stage:'available',package:pkg,builtinIdentity:environment,
    verification:{builtinAbi:BUILTIN_ABI,builtinIdentity:environment,sourceHash:pkg.manifest.program.sourceHash,manifestHash:pkg.manifestHash}};
  const rows=new Map([[installedKey(namespace,taskId),installed],[taskKey(namespace,taskId,version),candidate]]);
  const storesByName=new Map([['frameworkKV',rows],...['scriptHeads','scriptRevisions','runs','commandJournal'].map(name=>[name,new Map()])]);
  const broker={storage:{transaction:async(stores,mode,work)=>{
    const store=name=>{assert.ok(stores.includes(name));return storesByName.get(name);};
    try{return await work({get:async(name,key)=>structuredClone(store(name).get(key)),
      all:async name=>[...store(name).values()].map(v=>structuredClone(v)),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');store(name).set(key,structuredClone(value));},
      delete:async(name,key)=>{assert.equal(mode,'readwrite');store(name).delete(key);}});}
    catch(error){throw storageError(error);}
  }}};
  const scope=validateWebFlowTaskIntent(JSON.stringify({protocol:'webflow.task.intent.v1',
    candidateId:'wf-11111111-1111-4111-8111-111111111111',taskId,targetUrl:'https://www.baidu.com/',
    args:{query:'OpenDesk Browser',limit:3}}));
  const verify=value=>verifyChatGPTBackgroundTask({api:{runtime},broker,scope:value??scope});
  return {verify,scope,installed,rows,namespace,storesByName,manifest:pkg.manifest};
}

test('a complete new candidate verifies its installed Task regardless of parameter key order',async t=>{
  const f=await fixture(t);
  assert.deepEqual(Object.keys(f.scope.args),['limit','query']);
  assert.deepEqual(Object.keys(f.manifest.paramsSchema.properties),['query','limit','showExecutionTab']);
  const checked=await f.verify();
  assert.deepEqual(checked.paramsSchema,f.manifest.paramsSchema);
  assert.equal(checked.installation.installationId,f.installed.authorization.installationId);
  assert.equal(checked.installation.generation,2);
  assert.deepEqual(f.scope.args,{limit:3,query:'OpenDesk Browser'});
});

test('an omitted defaulted parameter is rejected as incomplete without a misleading storage error',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.verify({...f.scope,args:{query:'OpenDesk Browser'}}),{code:'E_BRIDGE_CONTEXT'});
});

test('optional execution visibility defaults preserve original candidate arguments and reject non-booleans',async t=>{
  const f=await fixture(t);
  for(const args of [f.scope.args,{...f.scope.args,showExecutionTab:true},{...f.scope.args,showExecutionTab:false}]) {
    const original=structuredClone(args);
    const task=await f.verify({...f.scope,args});
    assert.equal(task.paramsSchema.properties.showExecutionTab.default,true);
    assert.deepEqual(args,original,'verification cannot rewrite witnessed candidate bytes');
  }
  for(const showExecutionTab of ['false',0,1,null])
    await assert.rejects(f.verify({...f.scope,args:{...f.scope.args,showExecutionTab}}),{code:'E_PARAMS'});
});

test('a changed installation pin is still rejected with its original review error',async t=>{
  const f=await fixture(t),checked=await f.verify();
  await assert.rejects(f.verify({...f.scope,installation:{...checked.installation,generation:3}}),{code:'E_BRIDGE_REVISION'});
});

test('site, closed parameters, fixed limit, installation absence and revocation still fail closed',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.verify({...f.scope,targetUrl:'https://example.com/'}),{code:'E_PERMISSION'});
  await assert.rejects(f.verify({...f.scope,args:{...f.scope.args,admin:true}}),{code:'E_SCHEMA'});
  await assert.rejects(f.verify({...f.scope,args:{...f.scope.args,limit:4}}),{code:'E_PARAMS'});
  f.installed.enabled=false;
  await assert.rejects(f.verify(),{code:'E_TASK_DISABLED'});
  f.rows.delete(installedKey(f.namespace,f.scope.taskId));
  await assert.rejects(f.verify(),{code:'E_TASK_NOT_INSTALLED'});
  f.rows.set(taskRemovalKey(f.namespace,f.scope.taskId),{tag:'task-removed-v1'});
  await assert.rejects(f.verify(),{code:'E_TASK_REMOVED'});
});

test('a fresh ordinary candidate initializes both real packaged Tasks before admission without a developer Run',async t=>{
  const f=await fixture(t);f.rows.clear();
  const checked=await f.verify();
  assert.equal(checked.taskId,'baidu.search.top3');
  assert.ok(checked.installation.installationId);
  const installed=[...f.rows.values()].filter(row=>row.tag==='task-installed-v1');
  assert.deepEqual(installed.map(row=>row.taskId).sort(),['baidu.search.top3','google.search.top3']);
  for(const row of installed){
    const candidate=f.rows.get(taskKey(f.namespace,row.taskId,row.version));
    assert.equal(candidate.verification.kind,'builtin-release');
    assert.equal(candidate.verification.runId,undefined);
    assert.equal(candidate.verification.resultId,undefined);
  }
  assert.equal(f.storesByName.get('runs').size,0);
  const identities=installed.map(row=>row.authorization);
  await f.verify();
  assert.deepEqual([...f.rows.values()].filter(row=>row.tag==='task-installed-v1').map(row=>row.authorization),identities);
});
