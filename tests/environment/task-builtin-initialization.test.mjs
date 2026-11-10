import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinIdentity} from '../../src/libs/identity.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {ensureBuiltinTasks,taskMethods,assertInstalledTask,assertRunTaskAuthorization} from '../../src/platform/tasks/service.js';
import {BUILTIN_TASK_RELEASES,loadPackagedTask,taskRemovalKey,builtinTaskStateKey} from '../../src/platform/tasks/builtin-releases.js';
import {taskKey,installedKey,scriptStorageKey,createTaskPackage} from '../../src/platform/tasks/contract.js';
import {canonical,digestUtf8} from '../../src/platform/protocol.js';

const environment=builtinIdentity(fakeBuiltinSource),namespace='tool:builtin-test';
const [baidu,google]=BUILTIN_TASK_RELEASES;
function fixture(){
  const data=new Map();let pending=Promise.resolve(),abort=false,loader=loadPackagedTask;
  const store=name=>{if(!data.has(name))data.set(name,new Map());return data.get(name);};
  const tx={get:async(s,k)=>structuredClone(store(s).get(k)),all:async s=>structuredClone([...store(s).values()]),
    put:async(s,v,k)=>{store(s).set(k,structuredClone(v));},delete:async(s,k)=>{store(s).delete(k);}};
  const storage={transaction:(stores,mode,work)=>{
    const next=pending.then(async()=>{const before=structuredClone(data);
      const scoped=Object.fromEntries(Object.entries(tx).map(([name,fn])=>[name,async(s,...args)=>{
        assert.ok(stores.includes(s),`store ${s} is in transaction`);
        assert.ok(mode==='readwrite'||!['put','delete'].includes(name));return fn(s,...args);
      }]));
      try{const value=await work(scoped);if(abort){abort=false;throw new Error('commit aborted');}return value;}
      catch(error){data.clear();for(const [s,rows] of before)data.set(s,rows);throw error;}
    });pending=next.catch(()=>{});return next;
  }};
  const options={storage,namespace,environment,loadBuiltinTask:r=>loader(r),clock:{now:()=>100}};
  const methods=taskMethods({...options,loadBuiltin:async()=>fakeBuiltinSource,
    assertHost:async()=>({namespace}),currentHost:async()=>true});
  return {tx,storage,methods,ensure:()=>ensureBuiltinTasks(options),
    loader:fn=>{loader=fn;},abort:()=>{abort=true;},
    installed:id=>tx.get('frameworkKV',installedKey(namespace,id)),
    candidate:r=>tx.get('frameworkKV',taskKey(namespace,r.taskId,r.version)),
    snapshot:()=>structuredClone(data)};
}
const send=(f,name,request)=>f.methods[name](request,{});
const catalog=f=>send(f,'listTaskCatalog',{});
const resolve=(f,id)=>send(f,'resolveInstalledTask',{taskId:id});
async function mutation(f,release,name,extra={}){
  const row=await f.installed(release.taskId);
  return send(f,name,{taskId:row.taskId,version:row.version,expectedGeneration:row.authorization.generation,
    expectedInstallationId:row.authorization.installationId,...extra});
}
async function install(f,r){return send(f,'installTask',{taskId:r.taskId,version:r.version,manifestHash:r.manifestHash,expectedInstalledVersion:null});}

test('first list installs each reviewed builtin release with revisions and authorization, without invented runs',async()=>{
  const f=fixture(),result=await catalog(f);
  assert.equal(result.initialization.status,'ready');assert.equal(result.installed.length,BUILTIN_TASK_RELEASES.length);
  assert.doesNotThrow(()=>canonical(result));
  for(const r of BUILTIN_TASK_RELEASES){
    const row=await f.installed(r.taskId),candidate=await f.candidate(r),resolved=await resolve(f,r.taskId);
    assert.equal(row.version,r.version);assert.ok(row.authorization.installationId);assert.equal(row.authorization.generation,1);
    assert.equal(resolved.installationId,row.authorization.installationId);
    assert.equal(candidate.verification.kind,'builtin-release');assert.equal(candidate.verification.source,'packaged');
    for(const k of ['runId','resultId','verifiedAt','nativeReceiptCount'])assert.equal(Object.hasOwn(candidate.verification,k),false);
    const revision=await f.tx.get('scriptRevisions',scriptStorageKey(namespace,row.scriptId,1));
    assert.equal(revision.sourceUtf8,loadPackagedTask(r).sourceUtf8);
    await assertInstalledTask(f.tx,namespace,{scriptId:row.scriptId,contentHash:r.sourceHash,
      origin:candidate.package.manifest.siteOrigins[0],builtinIdentity:environment});
  }
  assert.deepEqual(await f.tx.all('runs'),[]);assert.deepEqual(await f.tx.all('results'),[]);
});

test('direct resolve and background export initialize without first visiting catalog',async()=>{
  const f=fixture();await resolve(f,google.taskId);assert.ok(await f.installed(baidu.taskId));
  const background=fixture();assert.equal((await background.ensure()).status,'ready');
  assert.ok(await background.installed(google.taskId));
});

test('concurrent service and background initialization is idempotent across reopened service',async()=>{
  const f=fixture();await Promise.all([f.ensure(),catalog(f),resolve(f,google.taskId),f.ensure()]);
  const before=f.snapshot();await ensureBuiltinTasks({storage:f.storage,namespace,environment});
  assert.deepEqual(f.snapshot(),before);
});

test('existing Baidu identity, authorization and disabled state survive while absent Google is installed',async()=>{
  const f=fixture();await f.ensure();await mutation(f,baidu,'setInstalledTaskEnabled',{enabled:false});
  const old=await f.installed(baidu.taskId),candidate=await f.candidate(baidu);
  await f.tx.delete('frameworkKV',installedKey(namespace,google.taskId));
  await f.tx.delete('frameworkKV',taskKey(namespace,google.taskId,google.version));
  // Model an older database with only Baidu; no Google initialization marker.
  for(const [key] of f.snapshot().get('frameworkKV'))if(key.startsWith('task-builtin-state:')&&key.includes(google.taskId))await f.tx.delete('frameworkKV',key);
  await f.ensure();assert.deepEqual(await f.installed(baidu.taskId),old);assert.deepEqual(await f.candidate(baidu),candidate);
  assert.ok(await f.installed(google.taskId));await assert.rejects(resolve(f,baidu.taskId),{code:'E_TASK_DISABLED'});
});

test('uninstall persists tombstone across restart and runtime upgrade; explicit Available reinstall uses fresh identity',async()=>{
  const f=fixture();await f.ensure();const old=await f.installed(google.taskId);
  await mutation(f,google,'uninstallTask');
  assert.equal((await f.tx.get('frameworkKV',taskRemovalKey(namespace,google.taskId))).tag,'task-removed-v1');
  await f.ensure();await ensureBuiltinTasks({storage:f.storage,namespace,environment:{...environment,bundleSha256:'c'.repeat(64)}});
  assert.equal(await f.installed(google.taskId),undefined);
  await assert.rejects(resolve(f,google.taskId),{code:'E_TASK_REMOVED'});
  await install(f,google);const fresh=await f.installed(google.taskId);
  assert.notEqual(fresh.authorization.installationId,old.authorization.installationId);
  assert.equal(await f.tx.get('frameworkKV',taskRemovalKey(namespace,google.taskId)),undefined);
});

test('legacy candidate without install remains recoverable Available and never auto reinstalls',async()=>{
  const f=fixture();await send(f,'importTaskPackage',{package:loadPackagedTask(baidu)});
  const result=await catalog(f);assert.equal(result.installed.length,BUILTIN_TASK_RELEASES.length-1);
  assert.equal((await f.candidate(baidu)).stage,'available');
  await f.ensure();await assert.rejects(resolve(f,baidu.taskId),{code:'E_TASK_NOT_INSTALLED'});
  await install(f,baidu);assert.ok(await f.installed(baidu.taskId));
});

test('bad second package aborts first install and all revisions, exposes failure and retries',async()=>{
  const f=fixture();f.loader(r=>{const p=loadPackagedTask(r);if(r.taskId===google.taskId)p.sourceUtf8+='tampered';return p;});
  const result=await catalog(f);assert.equal(result.initialization.status,'failed');assert.equal(result.initialization.code,'E_TASK_INITIALIZATION');
  assert.equal(result.initialization.taskId,google.taskId);assert.equal(result.installed.length,0);
  assert.equal((await f.tx.all('scriptRevisions')).length,0);
  await assert.rejects(resolve(f,google.taskId),{code:'E_TASK_INITIALIZATION'});
  f.loader(loadPackagedTask);assert.equal((await catalog(f)).installed.length,BUILTIN_TASK_RELEASES.length);
});

test('aborted commit is retryable without leaking any installation',async()=>{
  const f=fixture();f.abort();assert.equal((await f.ensure()).status,'failed');
  assert.equal((await f.tx.all('frameworkKV')).length,0);assert.equal((await f.ensure()).status,'ready');
});

test('same ID and self-reported official author never confer packaged release trust',async()=>{
  const f=fixture(),original=loadPackagedTask(baidu),source=original.sourceUtf8+'\n// changed';
  const forged=await createTaskPackage({...original.manifest,author:'OpenDesk Browser',
    program:{...original.manifest.program,sourceHash:await digestUtf8(source)}},source);
  f.loader(r=>r.taskId===baidu.taskId?forged:loadPackagedTask(r));
  assert.equal((await f.ensure()).causeCode,'E_VERIFICATION');assert.equal(await f.installed(baidu.taskId),undefined);
  await send(f,'importTaskPackage',{package:forged});f.loader(loadPackagedTask);
  assert.equal((await f.ensure()).causeCode,'E_REQUEST_CONFLICT');
  await assert.rejects(install(f,{...baidu,manifestHash:forged.manifestHash}),{code:'E_VERIFICATION'});
  await assert.rejects(send(f,'verifyTaskCandidate',{taskId:baidu.taskId,version:baidu.version,runId:'fake'}),{code:'E_VERIFICATION'});
});

test('installed older package resolves without current release pin and initialization never rewrites it',async()=>{
  const f=fixture();await f.ensure();const row=await f.installed(baidu.taskId),candidate=await f.candidate(baidu);
  const oldSource=candidate.package.sourceUtf8+'\n// historical packaged release';
  const oldPkg=await createTaskPackage({...candidate.package.manifest,version:'1.0.0',
    siteOrigins:[...candidate.package.manifest.siteOrigins,'https://historical.example'],
    program:{revision:1,sourceHash:await digestUtf8(oldSource)}},oldSource);
  const old={...candidate,version:'1.0.0',package:oldPkg,verification:{sourceHash:oldPkg.manifest.program.sourceHash,manifestHash:oldPkg.manifestHash,
    builtinIdentity:environment,builtinAbi:environment.abi,kind:'builtin-release',source:'packaged'}};
  const installRow={...row,version:'1.0.0',scriptId:'task:'+baidu.taskId+':1.0.0',manifestHash:oldPkg.manifestHash,authorization:{...row.authorization,
      scope:{...row.authorization.scope,siteOrigins:oldPkg.manifest.siteOrigins}}};
  await f.tx.put('frameworkKV',old,taskKey(namespace,baidu.taskId,'1.0.0'));
  await f.tx.put('frameworkKV',installRow,installedKey(namespace,baidu.taskId));
  const priorRevision={tag:'script-revision',namespace,scriptId:installRow.scriptId,revision:1,parentRevision:0,
    sourceUtf8:oldSource,contentHash:oldPkg.manifest.program.sourceHash,builtinIdentity:environment};
  await f.tx.put('scriptRevisions',priorRevision,scriptStorageKey(namespace,installRow.scriptId,1));
  await f.tx.put('scriptHeads',{tag:'script-head',namespace,scriptId:installRow.scriptId,revision:1,
    contentHash:priorRevision.contentHash,tombstoned:false},scriptStorageKey(namespace,installRow.scriptId));
  f.loader(()=>{throw new Error('catalog unavailable');});
  assert.equal((await resolve(f,baidu.taskId)).version,'1.0.0');
  assert.deepEqual(await f.installed(baidu.taskId),installRow);assert.deepEqual(await f.tx.get('frameworkKV',taskKey(namespace,baidu.taskId,'1.0.0')),old);
  await assertInstalledTask(f.tx,namespace,{scriptId:installRow.scriptId,contentHash:priorRevision.contentHash,
    builtinIdentity:environment,origin:'https://historical.example'});
  await send(f,'installTask',{taskId:installRow.taskId,version:installRow.version,manifestHash:oldPkg.manifestHash,
    expectedInstalledVersion:installRow.version,expectedGeneration:installRow.authorization.generation,
    expectedInstallationId:installRow.authorization.installationId});
  assert.equal((await f.installed(baidu.taskId)).authorization.installationId,installRow.authorization.installationId);
});

test('resolve distinguishes unknown and removal; runtime admission retains origin, identity and revocation fences',async()=>{
  const f=fixture();await f.ensure();await assert.rejects(resolve(f,'unknown.task'),{code:'E_TASK_NOT_INSTALLED'});
  const row=await f.installed(baidu.taskId),candidate=await f.candidate(baidu);
  const args={scriptId:row.scriptId,contentHash:baidu.sourceHash,origin:candidate.package.manifest.siteOrigins[0],builtinIdentity:environment};
  await assert.rejects(assertInstalledTask(f.tx,namespace,{...args,origin:'https://evil.example'}),{code:'E_PERMISSION'});
  await assert.rejects(assertInstalledTask(f.tx,namespace,{...args,builtinIdentity:{...environment,bundleSha256:'f'.repeat(64)}}),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
  const run={scriptId:row.scriptId,namespace,builtinAbi:environment.abi,installedTaskAuthorization:{taskId:row.taskId,
    version:row.version,manifestHash:row.manifestHash,authorization:row.authorization}};
  await assertRunTaskAuthorization(f.tx,run);await mutation(f,baidu,'setInstalledTaskEnabled',{enabled:false});
  await assert.rejects(assertRunTaskAuthorization(f.tx,run),{code:'E_PERMISSION'});
  await assert.rejects(assertInstalledTask(f.tx,namespace,args),{code:'E_PERMISSION'});
});

test('uninstall racing initialization cannot restore the removed installation; concurrent reinstall uses original CAS',async()=>{
  const f=fixture();await f.ensure();await Promise.all([mutation(f,google,'uninstallTask'),f.ensure(),catalog(f)]);
  assert.equal(await f.installed(google.taskId),undefined);
  const results=await Promise.allSettled([install(f,google),install(f,google)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'E_REVISION');
});


test('first observation adopts existing installations durably without changing installed identity',async()=>{
  const f=fixture();await f.ensure();
  const row=await f.installed(baidu.taskId);
  await f.tx.delete('frameworkKV',builtinTaskStateKey(namespace,baidu.taskId));
  await f.ensure();assert.equal((await f.tx.get('frameworkKV',builtinTaskStateKey(namespace,baidu.taskId))).status,'adopted');
  assert.deepEqual(await f.installed(baidu.taskId),row);
  await f.tx.delete('frameworkKV',installedKey(namespace,baidu.taskId));
  await f.tx.delete('frameworkKV',taskKey(namespace,baidu.taskId,baidu.version));
  await f.ensure();assert.equal(await f.installed(baidu.taskId),undefined);
});

test('explicit recovery refuses corrupted immutable revision bytes without losing removal history',async()=>{
  const f=fixture();await f.ensure();const row=await f.installed(google.taskId);
  await mutation(f,google,'uninstallTask');await f.ensure();
  const key=scriptStorageKey(namespace,row.scriptId,1),revision=await f.tx.get('scriptRevisions',key);
  await f.tx.put('scriptRevisions',{...revision,sourceUtf8:'tampered'},key);
  await assert.rejects(install(f,google),{code:'E_HASH'});
  assert.equal(await f.installed(google.taskId),undefined);
  assert.ok(await f.tx.get('frameworkKV',taskRemovalKey(namespace,google.taskId)));
});

test('initialization never replays or rewrites UNKNOWN task operations',async()=>{
  const f=fixture(),run={tag:'controller-run',runId:'unknown-run',namespace,state:'unknown',scriptId:'task:'+baidu.taskId+':'+baidu.version};
  const op={tag:'controller-operation',runId:run.runId,state:'unknown'};
  await f.tx.put('runs',run,run.runId);await f.tx.put('commandJournal',op,'unknown-op');
  await f.ensure();await catalog(f);
  assert.deepEqual(await f.tx.get('runs',run.runId),run);
  assert.deepEqual(await f.tx.get('commandJournal','unknown-op'),op);
});

test('failed missing Google initialization remains visible while existing Baidu can still resolve',async()=>{
  const f=fixture();await f.ensure();const old=await f.installed(baidu.taskId);
  await f.tx.delete('frameworkKV',installedKey(namespace,google.taskId));
  await f.tx.delete('frameworkKV',taskKey(namespace,google.taskId,google.version));
  await f.tx.delete('frameworkKV',builtinTaskStateKey(namespace,google.taskId));
  f.loader(r=>{if(r.taskId===google.taskId)throw new Error('packaged source unavailable');return loadPackagedTask(r);});
  const result=await catalog(f);assert.equal(result.initialization.status,'failed');assert.equal(result.installed.length,BUILTIN_TASK_RELEASES.length-1);
  assert.equal((await resolve(f,baidu.taskId)).installationId,old.authorization.installationId);
  assert.deepEqual(await f.installed(baidu.taskId),old);
  f.loader(loadPackagedTask);assert.equal((await catalog(f)).installed.length,BUILTIN_TASK_RELEASES.length);
});

test('old ChatGPT draft installation stages 0.2 as available, but never silently grants sending',async()=>{
  const f=fixture();await f.ensure();
  const latest=BUILTIN_TASK_RELEASES.find(row=>row.taskId==='chatgpt.conversation.create');
  assert.ok(latest);
  const oldPkg=loadPackagedTask({taskId:latest.taskId,version:'0.1.0',
    manifestHash:'9cc34831cf5ea39654534219baef90ef2eccf3c274f5f20ce4c10eb2bb864bec',
    sourceHash:'6ae168d4039ac2ef12dceb7888125f4a5561a3f44dcb8bfdf78d43836678fd9d'});
  assert.ok(oldPkg,'historical immutable version remains loadable');
  const current=await f.installed(latest.taskId),currentCandidate=await f.candidate(latest);
  await f.tx.put('frameworkKV',{...currentCandidate,version:'0.1.0',package:oldPkg,
    verification:{...currentCandidate.verification,sourceHash:oldPkg.manifest.program.sourceHash,
      manifestHash:oldPkg.manifestHash}},taskKey(namespace,latest.taskId,'0.1.0'));
  await send(f,'installTask',{taskId:latest.taskId,version:'0.1.0',manifestHash:oldPkg.manifestHash,
    expectedInstalledVersion:latest.version,expectedGeneration:current.authorization.generation,
    expectedInstallationId:current.authorization.installationId});
  const old=await f.installed(latest.taskId);
  await f.tx.delete('frameworkKV',taskKey(namespace,latest.taskId,latest.version));
  const view=await catalog(f);
  assert.equal(view.initialization.status,'ready');
  assert.equal(view.initialization.tasks.find(x=>x.taskId===latest.taskId).updateAvailable,latest.version);
  assert.deepEqual(await f.installed(latest.taskId),old);
  const staged=await f.candidate(latest);
  assert.equal(staged.stage,'available');
  assert.equal(staged.package.manifestHash,latest.manifestHash);
  assert.equal(view.catalog.find(x=>x.taskId===latest.taskId&&x.version===latest.version).installed,false);
  // Only a separate explicit install CAS can replace the immutable old draft.
  await send(f,'installTask',{taskId:latest.taskId,version:latest.version,manifestHash:latest.manifestHash,
    expectedInstalledVersion:'0.1.0',expectedGeneration:old.authorization.generation,
    expectedInstallationId:old.authorization.installationId});
  const upgraded=await f.installed(latest.taskId);
  assert.equal(upgraded.version,latest.version);
  assert.notEqual(upgraded.authorization.generation,old.authorization.generation);
});
