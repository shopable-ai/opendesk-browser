import {runInNewContext} from 'node:vm';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {createCloudService} from '../../src/cloud-control/service.js';
import {CONTRACT_VERSION,CONTRACT_HASH,canonical,digest,digestUtf8} from '../../src/platform/protocol.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';
import {createTaskPackage,TASK_MANIFEST_FORMAT,installedKey} from '../../src/platform/tasks/contract.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {createRunHost} from '../../src/run-host.js';
import {controllerMethods} from '../../src/platform/host/controller-methods.js';
import {CLOUD_RUNNER_DOCUMENT_PATH} from '../../src/tool-document-url.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {readTaskDelegationApp} from '../../src/platform/tasks/delegation-installation.js';
import {withWebflowTaskRunRecovery} from '../../projects/webflow/trusted/task-run-recovery.js';
import {createTaskWorkbench} from '../../src/ui/task-workbench.js';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {readFile} from 'node:fs/promises';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {decodeValue as controlDecode} from '../../src/framework/control/value.js';
import {createPackagedPageSession} from '../../src/scripting/packaged/registry.js';
import {createOfflineController} from './offline-controller-support.mjs';
import {createTaskAcceptanceTarget} from '../../src/development/task-acceptance-target.js';
import {BUILTIN_RESOURCE_PATHS,BUILTIN_RUNTIME_CATALOG} from '../../src/libs/runtime-contract.js';
import {ACCEPTANCE_INSTALL,createTaskAcceptanceSession} from '../../src/development/task-acceptance-session.js';
import {createTaskAcceptanceStorage,readTaskAcceptanceSource} from '../../src/development/task-acceptance-storage.js';
import {openTaskAcceptancePage} from '../../src/development/task-acceptance-page.js';
import {ACCEPTANCE_PROTOCOL} from '../../src/development/task-acceptance-contract.js';
import {taskKey,taskScriptId,scriptStorageKey} from '../../src/platform/tasks/contract.js';
function authoritySerialStore() {
  let rows = new Map(), tail = Promise.resolve(); const writes = [];
  return {writes, transaction(names, mode, body) {
    const next = tail.then(async () => {
      const copy = structuredClone(rows), changes = [];
      const store = name => { assert.ok(names.includes(name)); if (!copy.has(name)) copy.set(name, new Map()); return copy.get(name); };
      const cursor = (n,{prefix,offset=0,limit=50,direction='next'},keysOnly=false) => {
        const keys=[...store(n).keys()].filter(key=>typeof key==='string'&&key.startsWith(prefix)).sort();
        if(direction==='prev')keys.reverse();
        return keys.slice(offset,offset+limit).map(key=>keysOnly?key:structuredClone(store(n).get(key)));
      };
      const tx = {get: async (n,k) => structuredClone(store(n).get(k)), all: async n => [...store(n).values()].map(v => structuredClone(v)),
        put: async (n,v,k) => { store(n).set(k, structuredClone(v)); changes.push({store:n, key:k, value:structuredClone(v)}); },
        delete: async (n,k) => store(n).delete(k),
        keys: async (n,options) => cursor(n,options,true),
        scan: async (n,options) => cursor(n,options,false)};
      const result = await body(tx); if (mode === 'readwrite') { rows = copy; writes.push(...changes); } return result;
    }); tail = next.catch(() => {}); return next;
  }};
}
const authorityEvent = () => {
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit:(...args)=>{for(const listener of [...listeners])listener(...args);}};
};
async function authorityBaseFixture(options={}) {
  const storage = authoritySerialStore(), calls = [], frames = new Map([[2, [{frameId:0, documentId:'doc-top', documentLifecycle:'active', errorOccurred:false, url:'https://a.example/page'},
    {frameId:7, documentId:'doc-child', url:'https://b.example/frame', parentFrameId:0}]]]);
  const tabs = new Map([[2, {id:2, incognito:false, url:'https://a.example/page'}]]), clock = {now:() => Date.now()};
  let authority, serial = 0, allowed = true, beforeReply;
  const api = {runtime:{id:'extension', getURL:p => `chrome-extension://extension/${p}`,
    getContexts:async(query={})=>[...frames].flatMap(([tabId,values])=>values.filter(f=>f.url.startsWith('chrome-extension:')).map(f=>({tabId,frameId:f.frameId,documentId:f.documentId,documentUrl:f.url})))
      .filter(context => !query.documentIds || query.documentIds.includes(context.documentId))},
    permissions:{contains:async () => allowed},
    tabs:{get:async tabId => { const tab = tabs.get(tabId); if (!tab) throw new Error('No tab with id'); return tab; },
      create:async options => { const id = ++serial + 20; calls.push({method:'create', id}); tabs.set(id,{id,incognito:false,...options});
        frames.set(id,[{frameId:0,documentId:'bootstrap-'+id,url:options.url}]); return tabs.get(id); },
      update:async (id, options) => { calls.push({method:'update',id}); tabs.get(id).url=options.url;
        frames.set(id,[{frameId:0,documentId:'owned-'+id,url:options.url}]); return tabs.get(id); },
      remove:async id => { calls.push({method:'remove',id}); tabs.delete(id); frames.delete(id); },
      sendMessage(id, message, options, callback) {
        calls.push({method:message.action, id, options}); let reply;
        if (message.action === 'ping') reply = {type:message.type, ready:true};
        else if (message.action === 'execute') { const e = message.envelope; beforeReply?.(e); reply = {requestId:e.requestId,
          runId:e.identity.runId, ownerEpoch:e.identity.ownerEpoch, value:controlEncode(e.target.frameId === 7 ? 'Child' : 'Top')}; }
        else reply = {type:message.type, cancelled:true};
        queueMicrotask(() => callback(reply));
      }, onRemoved:authorityEvent(),onDetached:authorityEvent(),onAttached:authorityEvent()},
    webNavigation:{getAllFrames({tabId}, callback) { const value=(frames.get(tabId) || []).filter(f=>!f.url.startsWith('chrome-extension:')); if (callback) queueMicrotask(() => callback(value)); return Promise.resolve(value); },
      onCommitted:authorityEvent(),onCompleted:authorityEvent(),onDOMContentLoaded:authorityEvent(),onErrorOccurred:authorityEvent()},
    userScripts:{getScripts:async()=>[], execute:async options=>{
      calls.push({method:'userScripts.execute',options});
      const frame=frames.get(options.target.tabId).find(f=>options.target.documentIds.includes(f.documentId));
      return [{frameId:frame.frameId,documentId:frame.documentId,
        // Native Chrome serializes page-realm results before broker delivery.
        // Keep the generated wire unchanged while crossing that JSON boundary.
        result:JSON.parse(JSON.stringify(await runInNewContext(options.js[0].code,{TextEncoder,performance,crypto})))}];
    }}, scripting:{executeScript:(_p,cb)=>cb([])}};
  Object.assign(storage,createStorageMethods(storage,{clock}));
  let builtinSource=fakeBuiltinSource;
  authority = createRunAuthority({cloudFactory:createCloudService,loadBuiltin:async()=>builtinSource,storage,api,session:'browser-session',clock,...options});
  const sender = {id:'extension',url:api.runtime.getURL('sidepanel.html'),documentId:'host-doc',frameId:0,
    documentLifecycle:'active',tab:{id:1,incognito:false}};
  const register = async (actual=sender, instance='host-one') => authority.registerHost({hostInstanceId:instance,
    claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},actual);
  frames.set(1,[{frameId:0,documentId:sender.documentId,url:sender.url}]);
  const registration = await register();
  const rows = name => storage.transaction([name],'readonly',tx=>tx.all(name));
  const commit = (sourceUtf8='return params;',expectedRevision=0) => authority.commitControllerScript({scriptId:'script',sourceUtf8,expectedRevision},sender);
  const start = (revision,target={mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},extra={}) => authority.startControllerRun({requestId:crypto.randomUUID(),
    scriptId:'script',revision:revision.revision,contentHash:revision.contentHash,paramsWire:encodeValue({no:false,zero:0}),target,deadlineAt:Date.now()+30000,...extra},sender);
  const finish = (run,status='succeeded',extra={}) => authority.finishControllerRun({runId:run.runId,requestId:crypto.randomUUID(),status,
    valueWire:encodeValue(false),workerRetired:true,...extra},sender);
  return {storage,api,authority,sender,registration,register,rows,commit,start,finish,calls,frames,tabs,clock,
    setBuiltin:value=>{builtinSource=value;},setAllowed:value=>{allowed=value;},beforeReply:fn=>{beforeReply=fn;}};
}

// Build the proof through the real component Authority and immutable package
// pipeline. The browser callbacks above are doubles, not native acceptance.
async function installedTaskFixture({permissions=['page.automation'],...options}={}){
  const f=await authorityBaseFixture(options),source='async function main(){return await page.title();}';
  const revision=await f.commit(source),proof=await f.start(revision);
  const operation=(run,kind,method,args=[])=>({requestId:crypto.randomUUID(),identity:run.identity,
    revision:run.revision,target:run.target,operation:{kind,method,args:controlEncode(args)}});
  await f.authority.controllerOperation({envelope:operation(proof,'packaged','title')},f.sender);
  await f.finish(proof);await f.authority.retireControllerTarget({runId:proof.runId},f.sender);
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'authorization.demo',version:'1.0.0',title:'Authorization fixture',
    description:'Program authorization component regression',author:'OpenDesk',source:'fixture',siteOrigins:['https://a.example'],
    permissions,entryFormat:'async-main',program:{revision:1,sourceHash:await digestUtf8(source)},
    paramsSchema:{type:'object',properties:{no:{type:'boolean',title:'No'},zero:{type:'number',title:'Zero'}},required:[],additionalProperties:false}};
  async function installPackage(input,expected){
    const pkg=await createTaskPackage(input,source),base={taskId:input.taskId,version:input.version};
    await f.authority.importTaskPackage({package:pkg},f.sender);
    await f.authority.verifyTaskCandidate({...base,runId:proof.runId},f.sender);
    await f.authority.makeTaskAvailable({...base,manifestHash:pkg.manifestHash},f.sender);
    await f.authority.installTask({...base,manifestHash:pkg.manifestHash,expectedInstalledVersion:expected?.version??null,
      expectedGeneration:expected?.generation??null,expectedInstallationId:expected?.installationId??null},f.sender);
    return f.authority.resolveInstalledTask({taskId:input.taskId},f.sender);
  }
  const resolved=await installPackage(manifest),base={taskId:manifest.taskId,version:manifest.version};
  const startTask=(row=resolved,extra={})=>f.start(row,undefined,{scriptId:row.scriptId,
    expectedTaskGeneration:row.generation,expectedTaskInstallationId:row.installationId,...extra});
  const installClaim=row=>({taskId:row.taskId,version:row.version,expectedGeneration:row.generation,expectedInstallationId:row.installationId});
  return {...f,operation,base,resolved,manifest,installPackage,startTask,installClaim};
}


async function fixture(options={}) {
  const f=await installedTaskFixture(options);
  const task=Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation'].map(key=>[key,f.resolved[key]]));
  const target={mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top',expectedUrl:'https://a.example/page'};
  const params={no:false,zero:0};
  const prepare=(preparationId='shared-one',extra={})=>f.authority.prepareTaskRun({preparationId,task,params,target,...extra},f.sender);
  const start=(preparation,extra={},sender=f.sender)=>f.authority.startControllerRun({requestId:crypto.randomUUID(),
    source:preparation.source,paramsWire:encodeValue(preparation.params),target:preparation.target,
    deadlineAt:preparation.deadlineAt??f.clock.now()+preparation.executionDeadlineMs,expectedTaskGeneration:task.generation,expectedTaskInstallationId:task.installationId,
    taskPreparationId:preparation.preparationId,...(preparation.binding?{taskDelegation:preparation.binding}:{}),...extra},sender);
  const inspect=(preparationId)=>f.authority.inspectTaskRun(preparationId===undefined?{}:{preparationId},f.sender);
  const cancel=(preparationId='shared-one')=>f.authority.cancelTaskRun({preparationId},f.sender);
  const runs=async()=>(await f.rows('runs')).filter(row=>row.tag==='controller-run'&&row.scriptId===f.resolved.scriptId);
  return {...f,task,target,params,prepare,start,inspect,cancel,runs};
}

// Installed Page native/execution validation is tested in
// page-installed-programs.test.mjs. Here its trusted callbacks isolate the
// original Authority journal/admission/result behavior, never Chrome evidence.
async function pageTaskFixture(){
  let f,sourceValid=true,projectHook,sourceHook,projected=0;
  const hints=[];
  const pageTaskSource={
    async authorize(source){
      await this.inTransaction(null,source);
      await sourceHook?.(source);
      assert.equal(source.documentId,f.frames.get(2)[0].documentId,'source document changed');
      assert.equal(source.url,f.frames.get(2)[0].url,'source URL changed');return true;
    },
    async inTransaction(_transaction,source){
      if(!sourceValid||source.installationId!==f.pageSource.installationId||source.generation!==f.pageSource.generation||
        source.programId!==f.pageSource.programId)throw Object.assign(Error('Page source revoked'),{code:'E_PAGE_AUTHORIZATION'});
    }
  };
  f=await fixture({pageTaskSource,emitToHost:async(_id,event)=>{hints.push(event);},
    projectPageTaskResult:async(input,{authorize})=>{
      projected++;await authorize();await projectHook?.(input);
      return {originalRunId:input.snapshot.run.runId,originalResultId:input.snapshot.run.resultId};
    }});
  const {installationId,generation,...fixed}=f.task;
  f.pageSource={namespace:'tool:extension',programId:'reviewed.page',revision:1,manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),
    installationId:crypto.randomUUID(),generation:1,tabId:2,frameId:0,documentId:'doc-top',url:'https://a.example/page',windowId:1,
    delegatedTasks:[{...fixed,targetUrl:'https://a.example/new'}]};
  const requestId=crypto.randomUUID(),source=()=>({...f.pageSource,documentId:f.frames.get(2)[0].documentId});
  const request=(id=requestId,extra={})=>f.authority.handlePageTaskRequest({operation:'request',payload:{requestId:id,taskId:f.task.taskId,params:f.params,...extra}},source());
  const read=()=>f.authority.handlePageTaskRequest({operation:'read',payload:{requestId}},source());
  const restore=()=>f.authority.handlePageTaskRequest({operation:'restore',payload:{}},source());
  const hostRead=()=>f.authority.readPageTaskRequest({requestId},f.sender);
  const prepare=async()=>{const {request:r}=await hostRead();return f.authority.prepareTaskRun({preparationId:r.preparationId,
    pageRequestId:r.requestId,task:r.task,params:r.params,target:r.target},f.sender);};
  const start=p=>f.start(p,{requestId:p.preparationId});
  return {...f,requestId,request,read,restore,hostRead,preparePage:prepare,startPage:start,hints,
    revokeSource:()=>{sourceValid=false;},source:fn=>{sourceHook=fn;},project:fn=>{projectHook=fn;},projected:()=>projected};
}

test('Page requests persist only an approval intent with real installed task pins, never a Run or Host identity',async()=>{
  const f=await pageTaskFixture(),before=f.calls.length;
  const [first,duplicate]=await Promise.all([f.request(),f.request()]);
  assert.deepEqual(first,duplicate);assert.equal(first.state,'pending-approval');
  assert.equal((await f.runs()).length,0);assert.equal(f.calls.length,before);
  assert.equal((await f.rows('commandJournal')).filter(row=>row.tag==='page-task-request').length,1);
  assert.ok(f.hints.some(row=>row.type==='page-task-requested'&&row.requestId===f.requestId));
  const {request}=await f.hostRead();assert.equal(request.approvalAllowed,true);
  assert.deepEqual(request.task,f.task);assert.deepEqual(request.params,f.params);assert.equal(request.pageBinding.documentId,'doc-top');
  await assert.rejects(f.request(f.requestId,{params:{zero:9}}),{code:'E_REQUEST_CONFLICT'});
  await assert.rejects(f.request(crypto.randomUUID()),{code:'E_EFFECT_UNKNOWN'});
  await assert.rejects(f.request(crypto.randomUUID(),{taskId:'not.pinned'}),{code:'E_PERMISSION'});
  await assert.rejects(f.authority.handlePageTaskRequest({operation:'start',payload:{}},f.pageSource),{code:'E_SCHEMA'});
  await assert.rejects(f.authority.readPageTaskRequest({requestId:f.requestId},{...f.sender,url:f.pageSource.url}));
  assert.equal((await f.runs()).length,0);
});

test('Page approval uses the original preparation and one owned B; complete read projects only original durable identities',async()=>{
  const f=await pageTaskFixture();await f.request();
  const {preparation}=await f.preparePage();assert.equal(preparation.pageRequestId,f.requestId);
  await assert.rejects(f.start(preparation),{code:'E_OWNER'},'Page admission ID must be the original preparation ID');
  const replies=await Promise.all([f.startPage(preparation),f.startPage(preparation)]),run=replies.find(row=>!row.duplicate);
  assert.equal(replies[0].runId,replies[1].runId);assert.notEqual(run.target.tabId,2);
  assert.equal(f.calls.filter(row=>row.method==='create').length,1);
  assert.equal((await f.read()).state,'unknown');
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const calls=f.calls.length,writes=f.storage.writes.length;
  const [a,b]=await Promise.all([f.read(),f.restore()]);
  assert.equal(a.requestId,f.requestId);assert.deepEqual(a,b);assert.equal(a.state,'completed');
  assert.deepEqual(a.projection,{originalRunId:run.runId,originalResultId:run.resultId});
  assert.equal(f.calls.length,calls);assert.equal(f.storage.writes.length,writes);
  assert.equal((await f.hostRead()).settled,true);assert.equal((await f.hostRead()).request.approvalAllowed,false);
});

test('refresh and SPA round trips only restore the original Page request and cannot revive its approval source',async()=>{
  for(const change of ['refresh','spa-roundtrip']){
    const f=await pageTaskFixture();await f.request();const {preparation}=await f.preparePage();
    await f.authority.invalidatePageTaskSource({tabId:2,frameId:0,documentId:'doc-top'});
    if(change==='refresh')f.frames.get(2)[0].documentId='new-page-document';
    const before=f.calls.length,restored=await f.restore();
    assert.equal(restored.requestId,f.requestId);assert.equal(restored.state,'source-stale');
    assert.equal((await f.hostRead()).request.approvalAllowed,false);
    await assert.rejects(f.startPage(preparation),{code:'E_DOCUMENT_STALE'});
    await assert.rejects(f.request(crypto.randomUUID()),{code:'E_EFFECT_UNKNOWN'});
    assert.equal(f.calls.length,before);assert.equal((await f.runs()).length,0);
    const durable=(await f.rows('commandJournal')).find(row=>row.tag==='page-task-request');
    assert.equal(durable.pageSource.documentId,'doc-top','recovery never rewrites the approval source');
  }
});

test('expired unadmitted Page request gains a new reviewed preparation, preserving original audit and fencing late starts',async()=>{
  const f=await pageTaskFixture();await f.request();const {preparation:old}=await f.preparePage();
  const sourceBefore=structuredClone((await f.rows('commandJournal')).find(r=>r.tag==='page-task-request').pageSource);
  f.clock.now=()=>old.expiresAt+1;
  await f.restore();
  const before=await f.hostRead();assert.equal(before.request.approvalAllowed,false);assert.equal(before.request.reprepareAllowed,true);
  const request={requestId:f.requestId,expectedPreparationId:old.preparationId};
  const replies=await Promise.allSettled([f.authority.repreparePageTaskRequest(request,f.sender),f.authority.repreparePageTaskRequest(request,f.sender)]);
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);
  const recovered=replies.find(r=>r.status==='fulfilled').value;
  assert.equal(recovered.request.requestId,f.requestId);assert.equal(recovered.request.approvalAllowed,true);
  assert.equal(recovered.preparation.generation,2);assert.notEqual(recovered.preparation.preparationId,old.preparationId);
  assert.equal(recovered.preparation.deadlineAt,null);assert.equal((await f.runs()).length,0);
  assert.deepEqual((await f.rows('commandJournal')).find(r=>r.tag==='page-task-request').pageSource,sourceBefore);
  assert.equal((await f.inspect(old.preparationId)).preparation.state,'superseded');
  await assert.rejects(f.cancel(old.preparationId),{code:'E_REVISION'});
  assert.equal((await f.inspect(old.preparationId)).preparation.state,'superseded');
  assert.equal((await f.hostRead()).preparation.preparationId,recovered.preparation.preparationId,
    'lost reprepare ACK is recovered through the same logical request');
  await assert.rejects(f.startPage(old));
  await assert.rejects(f.authority.repreparePageTaskRequest(request,f.sender),{code:'E_REVISION'});
  const runs=await Promise.all([f.startPage(recovered.preparation),f.startPage(recovered.preparation)]);
  assert.equal(runs[0].runId,runs[1].runId);assert.equal(f.calls.filter(r=>r.method==='create').length,1);
  assert.equal((await f.rows('commandJournal')).filter(r=>r.tag==='page-task-request').length,1);
});

test('explicit Page reprepare revalidates a fresh authenticated document without changing the original source',async()=>{
  const f=await pageTaskFixture();await f.request();const {preparation:old}=await f.preparePage();
  await f.authority.invalidatePageTaskSource({tabId:2});f.frames.get(2)[0].documentId='fresh-document';
  await f.restore();assert.equal((await f.hostRead()).request.approvalAllowed,false);
  const recovered=await f.authority.repreparePageTaskRequest({requestId:f.requestId,expectedPreparationId:old.preparationId},f.sender);
  assert.equal(recovered.request.pageBinding.documentId,'fresh-document');
  assert.equal((await f.rows('commandJournal')).find(r=>r.tag==='page-task-request').pageSource.documentId,'doc-top');
  await assert.rejects(f.startPage(old));assert.equal((await f.runs()).length,0);
  const run=await f.startPage(recovered.preparation);assert.equal(run.taskPreparationId,recovered.preparation.preparationId);
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const read=await f.read();assert.equal(read.state,'completed');assert.equal(read.runId,run.runId);
  const result=(await f.rows('results')).find(r=>r.resultId===run.resultId);
  assert.equal(result.pageRequestId,f.requestId);assert.equal(result.taskPreparationId,recovered.preparation.preparationId);
});

test('SPA return refreshes the observed source epoch while keeping explicit recovery approval',async()=>{
  const f=await pageTaskFixture();await f.request();const {preparation:old}=await f.preparePage();
  await f.restore();await f.authority.invalidatePageTaskSource({tabId:2});await f.restore();
  assert.equal((await f.hostRead()).request.reprepareAllowed,true);
  const recovered=await f.authority.repreparePageTaskRequest({requestId:f.requestId,expectedPreparationId:old.preparationId},f.sender);
  assert.equal(recovered.request.approvalAllowed,true);assert.equal((await f.runs()).length,0);
});

test('A window moves during source validation fence both recovery and admission before any B creation',async()=>{
  for(const operation of ['reprepare','start']){
    const f=await pageTaskFixture();await f.request();const {preparation}=await f.preparePage();
    if(operation==='reprepare'){f.clock.now=()=>preparation.expiresAt+1;await f.restore();}
    f.source(()=>f.api.tabs.onDetached.emit(2,{oldWindowId:1,oldPosition:0}));
    await assert.rejects(operation==='start'?f.startPage(preparation):
      f.authority.repreparePageTaskRequest({requestId:f.requestId,expectedPreparationId:preparation.preparationId},f.sender),{code:'E_DOCUMENT_STALE'});
    assert.equal((await f.runs()).length,0);assert.equal(f.calls.filter(r=>r.method==='create').length,0);
  }
});

test('Page recovery rejects possible admission, unknown state, cancellation and changed or revoked identities',async()=>{
  for(const change of ['start','journal','run','result','legacy-result','unknown','cancel','permission','page','task','navigation']){
    const f=await pageTaskFixture();await f.request();const {preparation:old}=await f.preparePage();await f.restore();
    if(change==='start')await f.startPage(old);
    if(change==='cancel')await f.authority.cancelTaskRun({preparationId:old.preparationId},f.sender);
    if(change==='permission')await f.authority.invalidateControllerTarget({permissionRemoved:true,origins:['https://a.example/*']});
    if(change==='page')f.revokeSource();
    if(change==='task')await f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
    if(change==='navigation')await f.authority.invalidatePageTaskSource({tabId:2});
    if(['journal','run','result','legacy-result','unknown'].includes(change))await f.storage.transaction(['commandJournal','runs','results'],'readwrite',async tx=>{
      if(change==='journal')await tx.put('commandJournal',{tag:'controller-start',runId:'lost-run'},'task-preparation-start:'+canonical(['tool:extension',old.preparationId]));
      if(change==='run')await tx.put('runs',{tag:'controller-run',requestId:old.preparationId,pageRequestId:f.requestId},'orphaned-run');
      if(change==='result')await tx.put('results',{tag:'controller-result',pageRequestId:f.requestId},'orphaned-result');
      if(change==='legacy-result')await tx.put('results',{tag:'controller-result',namespace:'tool:extension',runId:'missing',revision:{scriptId:old.source.scriptId}},'legacy-result');
      if(change==='unknown'){
        const key='task-preparation:'+canonical(['tool:extension',old.preparationId]);
        await tx.put('commandJournal',{...await tx.get('commandJournal',key),state:'unknown'},key);
      }
    });
    f.clock.now=()=>old.expiresAt+1;
    await assert.rejects(f.authority.repreparePageTaskRequest({requestId:f.requestId,expectedPreparationId:old.preparationId},f.sender),undefined,change);
    assert.equal((await f.rows('commandJournal')).filter(r=>r.tag==='task-run-preparation'&&r.pageRequestId===f.requestId).length,1,change);
    assert.ok(f.calls.filter(r=>r.method==='create').length<=Number(change==='start'),change);
  }
});

test('approval waiting does not consume or renew the one admitted execution deadline',async()=>{
  const f=await fixture(),{preparation}=await f.prepare();
  const at=preparation.expiresAt-1000;f.clock.now=()=>at;
  const run=await f.start(preparation);assert.equal(run.deadlineAt,at+preparation.executionDeadlineMs);
  f.clock.now=()=>at+1000;
  const duplicate=await f.start(preparation);assert.equal(duplicate.duplicate,true);
  assert.equal((await f.rows('runs')).find(r=>r.runId===run.runId).deadlineAt,run.deadlineAt);
  assert.equal(f.calls.filter(r=>r.method==='create').length,0);
});

test('asynchronous admission checks do not spend the admitted execution budget',async()=>{
  const f=await fixture(),{preparation}=await f.prepare();let at=preparation.expiresAt-1000;
  f.clock.now=()=>at;const contains=f.api.permissions.contains;
  f.api.permissions.contains=async(...args)=>{at+=100;return contains(...args);};
  const run=await f.start(preparation),row=(await f.rows('runs')).find(r=>r.runId===run.runId);
  assert.equal(row.deadlineAt,row.createdAt+preparation.executionDeadlineMs);
});

test('approval expiry during durable admission rolls back before any B creation',async()=>{
  const f=await fixture(),{preparation}=await f.prepare('owned',{target:{mode:'owned',url:'https://a.example/new'}});
  let at=preparation.expiresAt-100;f.clock.now=()=>at;
  const transaction=f.storage.transaction;
  f.storage.transaction=(names,mode,body)=>transaction(names,mode,tx=>body({...tx,put:async(name,row,key)=>{
    if(row.tag==='controller-start')at=preparation.expiresAt;
    return tx.put(name,row,key);
  }}));
  await assert.rejects(f.start(preparation),{code:'E_TIMEOUT'});
  assert.equal((await f.runs()).length,0);assert.equal(f.calls.filter(r=>r.method==='create').length,0);
  assert.equal((await f.inspect('owned')).preparation.state,'prepared');
});

test('Page read rechecks source authorization after projection and never reveals a cached success after revocation',async()=>{
  const f=await pageTaskFixture();await f.request();const {preparation}=await f.preparePage();
  const run=await f.startPage(preparation);await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  assert.equal((await f.read()).state,'completed');
  f.project(()=>f.revokeSource());
  await assert.rejects(f.read(),{code:'E_PAGE_AUTHORIZATION'});
  await assert.rejects(f.restore(),{code:'E_PAGE_AUTHORIZATION'});
  assert.equal(f.calls.filter(row=>row.method==='create').length,1);
});

test('Page task failures remain original failed results and never invoke the completion projector',async()=>{
  const f=await pageTaskFixture();await f.request();const {preparation}=await f.preparePage();
  const run=await f.startPage(preparation);await f.finish(run,'error',{error:{code:'E_CONTROL_EXECUTION',message:'fixture failure'}});await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const result=await f.read();assert.equal(result.state,'failed');assert.equal(result.projection,undefined);assert.equal(f.projected(),0);
  assert.equal((await f.hostRead()).settled,true);
});

test('original Cancel tombstone before Page prepare remains readable and cannot be revived by a late save',async()=>{
  const f=await pageTaskFixture();const receipt=await f.request();
  await f.authority.cancelTaskRun({preparationId:receipt.preparationId},f.sender);
  const read=await f.hostRead();assert.equal(read.request.state,'cancelled');assert.equal(read.request.approvalAllowed,false);
  assert.equal(read.preparation.pageRequestId,f.requestId);assert.equal(read.settled,true);
  assert.equal((await f.restore()).state,'cancelled');
  await assert.rejects(f.preparePage(),{code:'E_CANCELLED'});
  assert.equal((await f.runs()).length,0);
});

test('refresh during the first Page request cannot land a late approvable intent after restore observed no row',async()=>{
  const f=await pageTaskFixture();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{entered=resolve;});
  f.source(async source=>{if(source.documentId==='doc-top'){entered();await gate;}});
  const pending=f.request();await waiting;
  await f.authority.invalidatePageTaskSource({tabId:2,frameId:0});
  f.frames.get(2)[0].documentId='replacement-document';
  assert.deepEqual(await f.restore(),{requestId:null,state:'idle'});
  release();await assert.rejects(pending);
  assert.equal((await f.rows('commandJournal')).filter(row=>row.tag==='page-task-request').length,0);
  assert.equal((await f.runs()).length,0);
});

test('Page regrant, reinstall and source upgrades cannot free the original source slot or disclose the old result',async()=>{
  for(const change of ['regrant','reinstall','source-upgrade']){
    const f=await pageTaskFixture();await f.request();
    if(change==='regrant')f.pageSource.generation++;
    if(change==='reinstall')f.pageSource.installationId=crypto.randomUUID();
    if(change==='source-upgrade'){f.pageSource.revision++;f.pageSource.manifestHash='c'.repeat(64);f.pageSource.sourceHash='d'.repeat(64);}
    await assert.rejects(f.restore(),{code:'E_REVISION'});
    await assert.rejects(f.read(),{code:'E_REVISION'});
    await assert.rejects(f.request(crypto.randomUUID()),{code:'E_EFFECT_UNKNOWN'});
    await assert.rejects(f.request(),{code:'E_REQUEST_CONFLICT'});
    assert.equal((await f.rows('commandJournal')).filter(row=>row.tag==='page-task-request').length,1);
    assert.equal((await f.runs()).length,0);assert.equal(f.projected(),0);
  }
});

test('prepare validates actual params and pins immutable inputs without creating a Run; inspection restores prepared record',async()=>{
  const f=await fixture();
  await assert.rejects(f.prepare('bad',{params:{no:'false'}}),{code:'E_PARAMS'});
  const input={...f.params},result=await f.prepare('shared-one',{params:input});input.zero=9;
  assert.equal(result.preparation.state,'prepared');
  assert.deepEqual(result.preparation.params,f.params);
  assert.equal((await f.runs()).length,0);
  assert.deepEqual(await f.inspect(),result);
  assert.deepEqual(await f.prepare(),result);
  await assert.rejects(f.prepare('shared-one',{params:{zero:2}}),{code:'E_REQUEST_CONFLICT'});
  assert.equal((await f.rows('commandJournal')).filter(row=>row.tag==='task-run-preparation').length,1);
});

test('owned preparation pins the approved destination without creating or navigating a tab',async()=>{
  const f=await fixture(),target={mode:'owned',url:'https://a.example/new'},before=structuredClone([...f.tabs]);
  const calls=f.calls.length,result=await f.prepare('owned',{target});
  assert.deepEqual(result.preparation.target,target);
  assert.equal(result.preparation.state,'prepared');assert.equal((await f.runs()).length,0);
  assert.deepEqual([...f.tabs],before);assert.equal(f.calls.length,calls);
  assert.deepEqual(await f.prepare('owned',{target}),result);
  assert.deepEqual(await f.inspect('owned'),result);
  await assert.rejects(f.prepare('owned',{target:{...target,url:'https://a.example/changed'}}),{code:'E_REQUEST_CONFLICT'});
  await assert.rejects(f.prepare('owned',{target:{...target,tabId:2}}),{code:'E_SCHEMA'});
});

test('owned prepared admission creates one inactive B and preserves A across concurrent and lost-ACK retries',async()=>{
  const f=await fixture(),target={mode:'owned',url:'https://a.example/new'};
  const originalA={tab:structuredClone(f.tabs.get(2)),frames:structuredClone(f.frames.get(2))};
  const {preparation}=await f.prepare('owned',{target});
  const replies=await Promise.all([f.start(preparation),f.start(preparation)]);
  const run=replies.find(row=>!row.duplicate);
  assert.equal(replies.filter(row=>row.duplicate).length,1);
  assert.equal(replies[0].runId,replies[1].runId);
  assert.notEqual(run.target.tabId,2);assert.equal(f.tabs.get(run.target.tabId).active,false);
  assert.equal(f.tabs.get(run.target.tabId).url,target.url);
  assert.deepEqual({tab:f.tabs.get(2),frames:f.frames.get(2)},originalA);
  assert.equal(f.calls.filter(row=>row.method==='create').length,1);
  assert.equal(f.calls.filter(row=>row.method==='update').length,1);
  assert.equal((await f.runs()).length,1);
  const calls=f.calls.length,recovered=await f.inspect('owned');
  assert.equal(recovered.preparation.state,'unknown');assert.equal(recovered.preparation.runId,run.runId);
  assert.equal(f.calls.length,calls,'unknown inspection is read-only');
  assert.equal((await f.start(preparation)).duplicate,true);
  assert.equal(f.calls.filter(row=>row.method==='create').length,1);
  assert.equal((await f.runs()).length,1);
  await assert.rejects(f.prepare('owned-b2',{target}),{code:'E_OWNER'});
});

test('owned preparation requires the original trusted Host and installed origin grant',async()=>{
  const f=await fixture(),target={mode:'owned',url:'https://a.example/new'};
  const pageSender={...f.sender,url:'https://a.example/page',documentId:'doc-top',tab:{id:2,incognito:false}};
  await assert.rejects(f.authority.prepareTaskRun({preparationId:'page',task:f.task,params:f.params,target},pageSender));
  await assert.rejects(f.prepare('wrong-site',{target:{mode:'owned',url:'https://unapproved.example/new'}}),{code:'E_PERMISSION'});
  f.setAllowed(false);
  await assert.rejects(f.prepare('no-browser-grant',{target}),{code:'E_PERMISSION'});
  assert.equal((await f.runs()).length,0);
  assert.equal(f.calls.filter(row=>row.method==='create').length,0);
  assert.equal((await f.rows('commandJournal')).filter(row=>row.tag==='task-run-preparation').length,0);
});

test('owned prepared submission rechecks permission, immutable installation, environment and cancellation',async()=>{
  for(const change of ['permission','permission-regranted','disable','version','environment','cancel']){
    const f=await fixture(),{preparation}=await f.prepare('owned',{target:{mode:'owned',url:'https://a.example/new'}});
    if(change==='permission')f.setAllowed(false);
    if(change==='permission-regranted'){
      await f.authority.invalidateControllerTarget({permissionRemoved:true,origins:['https://a.example/*']});
      f.setAllowed(true);
    }
    if(change==='disable')await f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
    if(change==='version')await f.installPackage({...f.manifest,version:'1.0.1'},f.resolved);
    if(change==='environment')f.setBuiltin(fakeBuiltinSource+'\n// changed before owned admission');
    if(change==='cancel')await f.cancel('owned');
    await assert.rejects(f.start(preparation),change==='permission-regranted'?{code:'E_PERMISSION'}:undefined);
    assert.equal((await f.runs()).length,0,change);
    assert.equal(f.calls.filter(row=>row.method==='create').length,0,change);
  }
});

test('owned completed inspection returns the original durable Result without repeating native work',async()=>{
  const f=await fixture(),{preparation}=await f.prepare('owned',{target:{mode:'owned',url:'https://a.example/new'}});
  const run=await f.start(preparation);
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const calls=f.calls.length,writes=f.storage.writes.length;
  const [first,second]=await Promise.all([f.inspect('owned'),f.inspect('owned')]);
  assert.deepEqual(first,second);assert.equal(first.settled,true);
  assert.equal(first.snapshot.run.runId,run.runId);assert.equal(first.snapshot.results[0].resultId,run.resultId);
  assert.equal(first.snapshot.results[0].state,'completed');
  assert.equal(f.calls.length,calls);assert.equal(f.storage.writes.length,writes);
  assert.equal(f.calls.filter(row=>row.method==='create').length,1);
  assert.deepEqual(f.tabs.get(2),{id:2,incognito:false,url:'https://a.example/page'});
});

test('a shared preparation blocks My, drafts, legacy Task admission and other hosts until explicit cancellation',async()=>{
  const f=await fixture(),revision=await f.commit('return params;',1);
  await f.prepare();
  await assert.rejects(f.startTask(),{code:'E_OWNER'});
  await assert.rejects(f.authority.startControllerRun({requestId:crypto.randomUUID(),scriptId:'script',
    revision:revision.revision,contentHash:revision.contentHash,paramsWire:encodeValue({}),target:f.target,deadlineAt:Date.now()+30000},f.sender),{code:'E_OWNER'});
  await assert.rejects(f.authority.startControllerRun({requestId:crypto.randomUUID(),source:{kind:'draft',sourceUtf8:'return 1;'},
    paramsWire:encodeValue({}),target:f.target,deadlineAt:Date.now()+30000},f.sender),{code:'E_OWNER'});
  await assert.rejects(f.prepare('another'),{code:'E_OWNER'});
  const sender={...f.sender,documentId:'host-second',tab:{id:3,incognito:false}};
  f.frames.set(3,[{frameId:0,documentId:sender.documentId,url:sender.url}]);await f.register(sender,'second');
  assert.equal((await f.authority.inspectTaskRun({},sender)).preparation.preparationId,'shared-one');
  await assert.rejects(f.authority.prepareTaskRun({preparationId:'second',task:f.task,params:f.params,target:f.target},sender),{code:'E_OWNER'});
  assert.equal((await f.cancel()).preparation.state,'cancelled');
  assert.equal((await f.inspect()).preparation,null);
  await assert.rejects(f.start((await f.inspect('shared-one')).preparation),{code:'E_CANCELLED'});
  assert.equal((await f.prepare('another')).preparation.state,'prepared');
});

async function mountTaskSheet(t){
  const React=await import('react'),{parseHTML}=await import('linkedom');
  const {build}=await import('esbuild'),{mkdtemp,rm}=await import('node:fs/promises');
  const temp=await mkdtemp(new URL('../../artifacts/r4-sheet-react-',import.meta.url));
  const {document,window}=parseHTML('<html><body><div id="mount"></div></body></html>');
  document.oninput=null;
  const dialogPrototype=Object.getPrototypeOf(document.createElement('dialog'));
  Object.defineProperty(dialogPrototype,'open',{configurable:true,get(){return this.hasAttribute('open');}});
  dialogPrototype.showModal=function(){this.setAttribute('open','');};
  dialogPrototype.close=function(){
    if(!this.open)return;
    this.removeAttribute('open');
    // Native close dispatches after the synchronous close/reopen transition.
    queueMicrotask(()=>this.dispatchEvent(new window.Event('close')));
  };
  const globals={window,document,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true};
  const previous=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let root;
  t.after(async()=>{
    if(root)await React.act(async()=>root.unmount());
    for(const [key,descriptor]of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
    await rm(temp,{recursive:true,force:true});
  });
  // linkedom supplies events/dialog lifecycle, not native Chrome user gestures.
  await build({entryPoints:['src/ui/react/tabs/task-run-sheet.tsx'],bundle:true,packages:'external',platform:'node',
    format:'esm',outfile:temp+'/sheet.mjs',logLevel:'silent'});
  const {TaskRunSheet}=await import(temp+'/sheet.mjs');
  Object.assign(globalThis,globals);
  const {createRoot}=await import('react-dom/client');
  root=createRoot(document.getElementById('mount'));
  return {React,document,window,render:async view=>React.act(async()=>root.render(React.createElement(TaskRunSheet,{view})))};
}

test('My React double Run for valid task B cannot replace bound task A while discovery is pending', {timeout:10000}, async t=>{
  const f=await boundFixture();
  const b=await f.installPackage({...f.manifest,taskId:'authorization.second',title:'Second installed task'});
  const {preparation}=await f.prepare('original-A',{binding:f.binding});
  const {React,document,window,render}=await mountTaskSheet(t);
  const originalRuns=await f.rows('runs'),writeOffset=f.storage.writes.length;
  let releaseDiscovery,discoveryEntered,admissionFinished,workers=0,discoveryReleased=false;
  const discoveryGate=new Promise(resolve=>{releaseDiscovery=()=>{discoveryReleased=true;resolve();};});
  const entered=new Promise(resolve=>{discoveryEntered=resolve;});
  const admitted=new Promise(resolve=>{admissionFinished=resolve;});
  const admissions=[],discoveries=[];
  // Only delay delivery: every discovery and admission uses the original real
  // Authority. In particular, this adapter never manufactures an E_OWNER.
  const client={ready:Promise.resolve(),async request(method,args){
    const reply=await f.authority[method](args,f.sender);
    if(method==='inspectTaskRun'){
      discoveries.push(reply);discoveryEntered();await discoveryGate;
    }
    return reply;
  }};
  client.controller=Object.fromEntries(['startControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method=>[method,async request=>{
      if(method!=='startControllerRun')return f.authority[method](request,f.sender);
      const attempt={request};admissions.push(attempt);
      try{return await f.authority.startControllerRun(request,f.sender);}
      catch(error){attempt.code=error.code;attempt.message=error.message;throw error;}
      finally{admissionFinished();}
    }]));
  const host=createRunHost({api:f.api,client,document:null,templateModuleFactory:null,
    controllerFactory:()=>{workers++;throw Error('Blocked task must not create a Worker');}});
  f.api.runtime.sendMessage=async()=>({ok:true}); // Workbench usage telemetry only.
  const developerView=createDeveloperView();
  const page={status:'available',tabId:2,windowId:1,documentId:'doc-top',url:'https://a.example/page'};
  Object.assign(f.tabs.get(2),{windowId:page.windowId,active:true});
  f.api.tabs.query=async()=>[f.tabs.get(page.tabId)];
  const workbench=createTaskWorkbench({client,host,api:f.api,document,developerView,
    currentPageTarget:{snapshot:page,capture:()=>page,revalidate:async()=>true,
      subscribe:fn=>{fn(page);return()=>{};}}});
  t.after(async()=>{releaseDiscovery();workbench.dispose();developerView.dispose();await host.dispose();});
  const {myView}=workbench,event={isTrusted:true};
  await render(myView);
  await entered; // Startup recovery is genuinely pending, not an empty stub.
  assert.equal(discoveries[0].preparation.preparationId,preparation.preparationId);
  await React.act(async()=>{assert.equal(myView.actions.taskParametersOpen(b.taskId,event),true);});
  const identity=myView.data.taskRunSheet.identity;
  assert.equal(identity.taskId,b.taskId);
  assert.equal(identity.installationId,b.installationId);
  assert.equal(identity.generation,b.generation);
  await React.act(async()=>{
    myView.actions.taskParamsModeChange('json');
    myView.field('task-params-json').value=JSON.stringify({no:true,zero:7});
    myView.actions.taskParamsFormInput();
  });
  assert.equal(myView.field('task-run').disabled,false,'B must reach admission, not fail an unrelated UI guard');
  const button=document.getElementById('task-run');
  await React.act(async()=>{
    for(let i=0;i<2;i++){
      const click=new window.Event('click',{bubbles:true,cancelable:true});
      Object.defineProperty(click,'isTrusted',{value:true});button.dispatchEvent(click);
    }
    await admitted;await new Promise(resolve=>setImmediate(resolve));
  });
  assert.equal(myView.data.taskRunSheet.identity.installationId,b.installationId,'the My sheet remains open to show its admission result');
  assert.equal(discoveryReleased,false);
  assert.equal(admissions.length,1,'double-click coalesces to one real admission attempt');
  assert.equal(admissions[0].code,'E_OWNER',admissions[0].message);
  assert.match(admissions[0].message,/An unresolved Task preparation owns admission/);
  assert.equal(admissions[0].request.source.scriptId,b.scriptId);
  assert.deepEqual(admissions[0].request.paramsWire,encodeValue({no:true,zero:7}));
  assert.equal(workers,0);
  assert.deepEqual(await f.rows('runs'),originalRuns,'neither A nor B gains a durable Run');
  assert.deepEqual((await f.inspect('original-A')).preparation,preparation,'A identity, params and target remain pinned');
  await React.act(async()=>myView.actions.taskSheetClose());
  await React.act(async()=>{releaseDiscovery();await new Promise(resolve=>setImmediate(resolve));});
  assert.equal(myView.data.taskRunSheet,null,'late discovery cannot revive the closed sheet');
  await React.act(async()=>{
    assert.equal(myView.actions.taskParametersOpen(b.taskId,event),true);
    await new Promise(resolve=>setImmediate(resolve));
  });
  assert.equal(myView.data.taskRunSheet.preparationId,preparation.preparationId);
  assert.deepEqual(myView.data.taskRunSheet.identity,preparation.task);
  assert.deepEqual(myView.data.taskRunSheet.originalParams,preparation.params);
  assert.equal(myView.data.taskRunSheet.phase,'prepared');
  assert.equal(admissions.length,1,'discovery delivery must not auto-execute either task');
  assert.equal(workers,0);
  assert.deepEqual(await f.rows('runs'),originalRuns);
  assert.deepEqual((await f.inspect('original-A')).preparation,preparation);
  assert.equal(f.storage.writes.slice(writeOffset).filter(row=>row.value.tag==='controller-run').length,0);
  // A positive control pins the refusal to A's outstanding preparation, rather
  // than an invalid B package, Schema, target or sender sharing E_OWNER.
  await f.cancel('original-A');
  const admittedB=await f.authority.startControllerRun({...admissions[0].request,requestId:crypto.randomUUID()},f.sender);
  assert.equal(admittedB.revision.scriptId,b.scriptId);
  assert.equal((await f.rows('runs')).length,originalRuns.length+1);
  await f.finish(admittedB);await f.authority.retireControllerTarget({runId:admittedB.runId},f.sender);
});

test('Baidu v1.1.5 My Run rejects invalid JSON and settles the corrected request once offline', {timeout:32000}, async t=>{
  const {React,document,window,render}=await mountTaskSheet(t);
  const guardFailures=[],dispatches=[],pageCalls=[],cleanups=[],networkAttempts=[];
  const pkg=JSON.parse(await readFile(new URL('../../task-packs/baidu.search/releases/baidu.search.top3.1.1.5.opendesk-task.json',import.meta.url),'utf8'));
  const {taskId,version}=pkg.manifest,manifestHash=pkg.manifestHash;
  const f=await authorityBaseFixture();
  const input={query:'界面验收 B',limit:3,showExecutionTab:false};
  const url='https://www.baidu.com/s?wd='+encodeURIComponent(input.query);
  const page={status:'available',tabId:2,windowId:1,documentId:'doc-top',url};
  const target={mode:'borrowed',tabId:2,frameId:0,documentId:page.documentId,expectedUrl:url,expectedWindowId:page.windowId};
  Object.assign(f.tabs.get(2),{url,windowId:page.windowId,active:true});
  f.frames.get(2)[0].url=url;
  f.api.tabs.query=async()=>[structuredClone(f.tabs.get(2))];
  f.api.runtime.sendMessage=async()=>({ok:true}); // Local usage telemetry double.
  for(const method of ['create','update','remove'])f.api.tabs[method]=async()=>{
    networkAttempts.push(method);throw Error('Unexpected tab mutation in offline borrowed-target test');
  };
  const {parseHTML}=await import('linkedom');
  const results=[1,2,3,4].map(i=>
    '<div class="result c-container" id="'+i+'" tpl="se_com_default"><h3><a href="https://example.test/'+i+'">标题 '+i+'</a></h3><div class="c-abstract">摘要 '+i+'</div></div>');
  const serp=parseHTML('<html><body><div id="content_left">'+results.join('')+'</div></body></html>');
  for(const el of serp.document.querySelectorAll('*'))el.getBoundingClientRect=()=>({width:100,height:20});
  const content=createPackagedPageSession({document:serp.document,window:{location:{href:url},getComputedStyle:()=>({})}});
  t.after(()=>content.dispose());
  f.api.tabs.sendMessage=(id,message,options,callback)=>{
    void (async()=>{
      assert.equal(id,page.tabId);
      assert.equal(options.documentId,page.documentId);
      if(message.action==='ping')return {type:message.type,ready:true};
      if(message.action==='cancel'){
        const {runId,target:bound}=message.run;
        assert.equal(bound.tabId,page.tabId);
        assert.equal(bound.documentId,page.documentId);
        assert.ok(pageCalls.some(call=>call.runId===runId));
        cleanups.push(runId);
        return {type:message.type,cancelled:true};
      }
      assert.equal(message.action,'execute');
      const e=message.envelope;
      assert.equal(e.operation.kind,'packaged');
      assert.ok(['url','locatorObserve','locatorRead'].includes(e.operation.method),e.operation.method);
      assert.equal(e.target.allowedOrigin,'https://www.baidu.com');
      pageCalls.push({runId:e.identity.runId,requestId:e.requestId,method:e.operation.method});
      const value=await content.execute(e.operation.method,controlDecode(e.operation.args),{documentId:page.documentId,url});
      return {requestId:e.requestId,runId:e.identity.runId,ownerEpoch:e.identity.ownerEpoch,value:controlEncode(value)};
    })().then(callback,error=>{guardFailures.push(error);callback();});
  };
  const client={ready:Promise.resolve(),request:(name,args)=>f.authority[name](args,f.sender)};
  const controls=['startControllerRun','snapshotControllerRun','controllerOperation','finishControllerRun','retireControllerTarget','stopControllerRun'];
  client.controller=Object.fromEntries(controls.map(name=>[name,async args=>{
    const reply=await client.request(name,args);
    if(name==='startControllerRun')dispatches.push({requestId:args.requestId,runId:reply.runId});
    return reply;
  }]));
  const workers=[];
  const host=createRunHost({api:f.api,client,document:null,templateModuleFactory:null,controllerFactory:({context})=>{
    workers.push(context.identity.runId);return createOfflineController({context,networkAttempts});
  }});
  t.after(()=>host.dispose());
  await client.request('importTaskPackage',{package:pkg});
  const trial=await host.start({source:{kind:'draft',sourceUtf8:pkg.sourceUtf8},params:input,target,deadlineAt:Date.now()+20000});
  const verificationRun=await host.completion;
  assert.equal(verificationRun.state,'completed',JSON.stringify({verificationRun,guardFailures:guardFailures.map(e=>e.message)}));
  assert.equal(decodeValue(verificationRun.result.outcome.valueWire).status,'success');
  const verified=await client.request('verifyTaskCandidate',{taskId,version,runId:trial.runId});
  assert.equal(verified.verification.runId,trial.runId);
  await client.request('makeTaskAvailable',{taskId,version,manifestHash});
  await client.request('installTask',{taskId,version,manifestHash,expectedInstalledVersion:null,expectedGeneration:null,expectedInstallationId:null});
  const installed=await client.request('resolveInstalledTask',{taskId});
  assert.equal(installed.version,version);

  const developerView=createDeveloperView();
  const attempts=[];
  const workbench=createTaskWorkbench({client,host,api:f.api,document,developerView,
    observeManualAttempt:(requestId,phase)=>attempts.push({requestId,phase}),
    currentPageTarget:{snapshot:page,capture:()=>page,revalidate:async()=>true,subscribe:fn=>{fn(page);return()=>{};}}});
  t.after(()=>{workbench.dispose();developerView.dispose();});
  const {myView}=workbench;
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  async function click(node){
    const event=new window.Event('click',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'isTrusted',{value:true});node.dispatchEvent(event);
  }
  await render(myView);
  await React.act(async()=>{await workbench.refresh(taskId);await tick();});
  await React.act(async()=>{assert.equal(myView.actions.taskParametersOpen(taskId,{isTrusted:true}),true);});
  assert.equal(myView.data.taskRunSheet.identity.installationId,installed.installationId);
  assert.equal(myView.data.taskHistory.length,0,'draft verification is not installed-task history');
  await React.act(async()=>myView.actions.taskParamsModeChange('json'));
  const editor=document.getElementById('task-params-json');
  const edit=raw=>React.act(async()=>{
    editor.value=raw;
    editor.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
  const bad='{ "query": "界面验收 B",';
  await edit(bad);
  const button=document.getElementById('task-run');assert.ok(button);
  const baseline=await client.controller.snapshotControllerRun({});
  const journals=await f.rows('commandJournal');
  assert.equal(baseline.slotAvailable,true);
  await React.act(async()=>{await click(button);await tick();});
  assert.equal(editor.value,bad);
  assert.equal(editor.getAttribute('aria-invalid'),'true');
  assert.match(editor.getAttribute('aria-describedby'),/task-params-json-error/);
  assert.ok(document.getElementById('task-params-json-error').textContent);
  assert.equal(host.currentRun,null);
  assert.deepEqual(await client.controller.snapshotControllerRun({}),baseline);
  assert.deepEqual(await f.rows('commandJournal'),journals);
  assert.deepEqual(myView.data.taskHistory,[]);
  assert.equal(dispatches.length,1,'the invalid click did not dispatch after the earlier trial');
  assert.deepEqual(attempts.map(event=>event.phase),['submitted','rejected-before-dispatch']);
  assert.equal(attempts[0].requestId,attempts[1].requestId);
  assert.ok(dispatches.every(event=>event.requestId!==attempts[0].requestId));
  await edit(JSON.stringify(input));
  assert.equal(editor.getAttribute('aria-invalid'),null);
  assert.equal(document.getElementById('task-run'),button);
  const dispatched=new Promise(resolve=>{
    const remove=host.subscribe(claim=>{if(claim.runId!==trial.runId&&claim.sourceUtf8){remove();resolve(claim);}});
  });
  let claim,completion;
  await React.act(async()=>{await click(button);claim=await dispatched;completion=await host.completion;await tick();});
  assert.equal(completion.state,'completed',JSON.stringify({
    error:completion.result?.outcome?.error,retirement:completion.retirement,
    guardFailures:guardFailures.map(error=>error.message),networkAttempts,pageCalls,
  }));
  assert.equal(completion.retirement.state,'released');
  assert.equal(completion.result.runId,claim.runId);
  assert.equal(attempts.length,3);
  assert.deepEqual(attempts[2],{requestId:dispatches[1].requestId,phase:'submitted'});
  assert.notEqual(attempts[2].requestId,attempts[0].requestId);
  assert.deepEqual(workers,[trial.runId,claim.runId]);
  assert.deepEqual(cleanups,workers);
  assert.equal(dispatches.length,2);
  assert.equal(myView.data.taskHistory.length,1);
  const [receipt]=myView.data.taskHistory;
  assert.equal(receipt.runId,claim.runId);
  assert.equal(receipt.installation.installationId,installed.installationId);
  const stored=await client.controller.snapshotControllerRun({runId:claim.runId});
  assert.equal(stored.run.requestId,dispatches[1].requestId);
  const result=decodeValue(completion.result.outcome.valueWire);
  assert.equal(result.status,'success');assert.equal(result.sourceUrl,url);
  assert.equal(result.query,input.query);
  assert.deepEqual(result.results.map(row=>row.title),['标题 1','标题 2','标题 3']);
  assert.ok(pageCalls.some(call=>call.runId===claim.runId&&call.method==='locatorRead'));
  assert.deepEqual(networkAttempts,[]);
  assert.deepEqual(guardFailures,[]);
});

test('serve acceptance rejects mismatched native window or context before connecting',async t=>{
  const {parseHTML}=await import('linkedom');
  for(const scenario of ['window mismatch','wrong document URL','duplicate context','missing document id']){
    await t.test(scenario,async()=>{
      const {document}=parseHTML('<html><body></body></html>');
      const hostInstanceId=crypto.randomUUID();
      const ownUrl='chrome-extension://extension/sidepanel.html?hostInstanceId='+hostInstanceId;
      Object.defineProperty(document,'location',{value:{href:ownUrl}});
      const row={contextType:'SIDE_PANEL',contextId:'native-context',documentId:'native-doc',
        documentUrl:ownUrl,windowId:-1,frameId:0,incognito:false};
      if(scenario==='wrong document URL')row.documentUrl+='&toolId=demo-tool';
      if(scenario==='missing document id')delete row.documentId;
      let connected=0;
      const api={windows:{getCurrent:async()=>({id:scenario==='window mismatch'?8:7,incognito:false})},
        runtime:{getURL:path=>'chrome-extension://extension/'+path,
          getContexts:async()=>scenario==='duplicate context'?[row,{...row,contextId:'duplicate'}]:[row],
          connect(){connected++;throw Error('Must reject before connecting');}}};
      await assert.rejects(openTaskAcceptancePage({api,document,hostInstanceId,expectedWindowId:7}),{code:'E_OWNER'});
      assert.equal(connected,0);
    });
  }
});

test('serve acceptance rechecks window ownership before publishing or sending later requests',async t=>{
  const {parseHTML}=await import('linkedom');
  for(const stage of ['delayed open reply','workbench ready','published scope']){
    await t.test(stage,async t=>{
      const {document}=parseHTML('<html><body></body></html>');
      const hostInstanceId=crypto.randomUUID(),revision='a'.repeat(64);
      const ownUrl='chrome-extension://extension/sidepanel.html?hostInstanceId='+hostInstanceId;
      Object.defineProperty(document,'location',{value:{href:ownUrl}});
      const proof={windowId:7,contextId:'native-context',documentId:'native-doc'};
      const row={...proof,windowId:-1,contextType:'SIDE_PANEL',documentUrl:ownUrl,frameId:0,incognito:false};
      // Window 7 remains live while this trusted document moves to window 8.
      const windows=new Map([[7,{id:7,incognito:false}],[8,{id:8,incognito:false}]]);
      let currentWindowId=7,disconnected=false,client,replyToOpen,openEntered,workbenchEntered,ready;
      const openPosted=new Promise(resolve=>{openEntered=resolve;});
      const workbenchCreated=new Promise(resolve=>{workbenchEntered=resolve;});
      const workbenchReady=new Promise(resolve=>{ready=resolve;});
      t.after(()=>ready());
      const posted=[],onMessage=authorityEvent(),onDisconnect=authorityEvent();
      const port={onMessage,onDisconnect,disconnect(){disconnected=true;onDisconnect.emit();},
        postMessage(message){
          posted.push(message);
          const reply=data=>queueMicrotask(()=>onMessage.emit({id:message.id,ok:true,data}));
          if(message.type==='open'){
            replyToOpen=()=>reply({identity:{hostInstanceId,revision,...proof},
              page:{status:'available',windowId:7,tabId:11,documentId:'fixture-doc',url:'https://www.baidu.com/s?wd=fixture'},
              registration:{registrationId:'isolated-panel'}});
            openEntered();if(stage!=='delayed open reply')replyToOpen();
          }else if(message.type==='request'){
            const values={listControllerScripts:[],listPagePrograms:{catalog:[],installed:[]},
              snapshotControllerRun:{runs:[],results:[],slotAvailable:true}};
            assert.ok(Object.hasOwn(values,message.payload.method),message.payload.method);
            reply(values[message.payload.method]);
          }else assert.fail('Unexpected scoped message: '+message.type);
        }};
      t.after(()=>port.disconnect());
      const api={windows:{getCurrent:async()=>({...windows.get(currentWindowId)}),get:async id=>({...windows.get(id)})},
        runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
          getContexts:async()=>[{...row}],connect(){return port;}}};
      let published=false;
      const opening=openTaskAcceptancePage({api,document,hostInstanceId,registrationId:'live-panel',revision,expectedWindowId:7,
        createTaskWorkbench(options){
          client=options.client;workbenchEntered();
          return {ready:workbenchReady,dispose(){}};
        }}).then(scope=>{published=true;return scope;});
      if(stage==='delayed open reply'){
        const rejected=assert.rejects(opening,{code:'E_OWNER'});
        await openPosted;currentWindowId=8;ready();replyToOpen();
        await rejected;
      }else if(stage==='workbench ready'){
        const rejected=assert.rejects(opening,{code:'E_OWNER'});
        await workbenchCreated;currentWindowId=8;ready();
        await rejected;
      }else{
        ready();const scope=await opening;
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(disconnected,false,'scope must remain connected until ownership changes');
        const count=posted.length;
        currentWindowId=8;
        await assert.rejects(client.request('listPagePrograms'),{code:'E_OWNER'});
        assert.equal(posted.length,count,'ownership drift must reject before postMessage/dispatch');
        await assert.rejects(scope.inspect(),{code:'E_HOST_CLOSED'});
        assert.equal(posted.length,count,'closed scope must not send another message');
      }
      assert.equal(disconnected,true);
      assert.equal(published,stage==='published scope','stale scope must never be published');
      assert.equal(windows.get(7).id,7);assert.equal(row.windowId,-1);
    });
  }
});

test('serve acceptance bounds initial and final native proof reads and ignores late completion',async t=>{
  const {parseHTML}=await import('linkedom');
  for(const stage of ['initial read','final read after workbench ready']){
    await t.test(stage,async t=>{
      const {document}=parseHTML('<html><body></body></html>');
      const hostInstanceId=crypto.randomUUID(),revision='a'.repeat(64);
      const ownUrl='chrome-extension://extension/sidepanel.html?hostInstanceId='+hostInstanceId;
      Object.defineProperty(document,'location',{value:{href:ownUrl}});
      const proof={windowId:7,contextId:'native-context',documentId:'native-doc'};
      const nativeWindow={id:7,incognito:false};
      const contexts=[{...proof,windowId:-1,contextType:'SIDE_PANEL',documentUrl:ownUrl,frameId:0,incognito:false}];
      let finishNativeRead,readEntered,workbenchEntered,ready,client;
      let hangFinalRead=false,connected=0,disconnected=false,published=false,settled=false,disposed=0;
      const lateNativeRead=new Promise(resolve=>{finishNativeRead=resolve;});
      const nativeReadPending=new Promise(resolve=>{readEntered=resolve;});
      const workbenchCreated=new Promise(resolve=>{workbenchEntered=resolve;});
      const workbenchReady=new Promise(resolve=>{ready=resolve;});
      const posted=[],onMessage=authorityEvent(),onDisconnect=authorityEvent();
      const port={onMessage,onDisconnect,disconnect(){disconnected=true;onDisconnect.emit();},
        postMessage(message){
          posted.push(message);
          const reply=data=>queueMicrotask(()=>onMessage.emit({id:message.id,ok:true,data}));
          if(message.type==='open')reply({identity:{hostInstanceId,revision,...proof},
            page:{status:'available',windowId:7,tabId:11,documentId:'fixture-doc',url:'https://www.baidu.com/s?wd=fixture'},
            registration:{registrationId:'isolated-panel'}});
          else if(message.type==='request'){
            const values={listControllerScripts:[],listPagePrograms:{catalog:[],installed:[]},
              snapshotControllerRun:{runs:[],results:[],slotAvailable:true}};
            assert.ok(Object.hasOwn(values,message.payload.method),message.payload.method);
            reply(values[message.payload.method]);
          }else assert.fail('Unexpected scoped message: '+message.type);
        }};
      const api={windows:{getCurrent:async()=>{
        if(stage==='initial read'){readEntered();return lateNativeRead;}
        return nativeWindow;
      }},runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
        getContexts:async()=>{
          if(hangFinalRead){readEntered();return lateNativeRead;}
          return contexts;
        },connect(){connected++;return port;}}};
      t.mock.timers.enable({apis:['setTimeout']});
      t.after(()=>{ready();port.disconnect();t.mock.timers.reset();});
      const opening=openTaskAcceptancePage({api,document,hostInstanceId,registrationId:'live-panel',revision,expectedWindowId:7,
        createTaskWorkbench(options){
          client=options.client;workbenchEntered();return {ready:workbenchReady,dispose(){disposed++;}};
        }}).then(scope=>{published=true;settled=true;return scope;},error=>{settled=true;throw error;});
      const rejected=assert.rejects(opening,{code:'E_OWNER_TIMEOUT'});
      if(stage!=='initial read'){
        await workbenchCreated;
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(client.resourceSnapshot().pending,0,'only the final proof read should be outstanding');
        hangFinalRead=true;ready();
      }
      await nativeReadPending;
      t.mock.timers.tick(14999);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(settled,false,'native read must remain pending until its 15-second deadline');
      assert.equal(disconnected,false);
      t.mock.timers.tick(1);
      await rejected;
      assert.equal(published,false);assert.equal(connected,stage==='initial read'?0:1);
      assert.equal(disconnected,stage!=='initial read');assert.equal(disposed,stage==='initial read'?0:1);
      const count=posted.length;
      finishNativeRead(stage==='initial read'?nativeWindow:contexts);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(published,false,'late valid native metadata must never publish the expired scope');
      assert.equal(posted.length,count,'late native completion must not post or dispatch');
      assert.equal(connected,stage==='initial read'?0:1);
      if(client)await assert.rejects(client.request('listPagePrograms'),{code:'E_HOST_CLOSED'});
      assert.equal(posted.length,count);
    });
  }
});

test('serve acceptance mounts the real workbench on the scoped port and fences exit while a request is pending',async t=>{
  const {parseHTML}=await import('linkedom');
  const {document}=parseHTML('<html><body></body></html>');
  const hostInstanceId=crypto.randomUUID(),revision='a'.repeat(64),registrationId='live-panel';
  const page={status:'available',windowId:7,tabId:11,documentId:'fixture-doc',
    url:'https://www.baidu.com/s?wd=fixture',title:'离线验收网页'};
  const ownUrl='chrome-extension://extension/sidepanel.html?hostInstanceId='+hostInstanceId;
  Object.defineProperty(document,'location',{value:{href:ownUrl}});
  const windowProof={windowId:7,contextId:'native-context',documentId:'native-doc'};
  const identity={hostInstanceId,revision,...windowProof,installation:ACCEPTANCE_INSTALL};
  const onMessage=authorityEvent(),onDisconnect=authorityEvent(),views=[];
  const unexpected=[];
  let finishInspection,inspectionEntered,scopedApi,disconnected=false;
  const inspectionPosted=new Promise(resolve=>{inspectionEntered=resolve;});
  const port={onMessage,onDisconnect,disconnect(){disconnected=true;onDisconnect.emit();},
    postMessage({id,type,payload}){
      const reply=data=>queueMicrotask(()=>onMessage.emit({id,ok:true,data}));
      if(type==='open'){
        assert.deepEqual(payload,{hostInstanceId,revision,registrationId,windowProof});
        reply({identity,page,registration:{registrationId:'isolated-panel'}});
      }else if(type==='request'){
        const data={listControllerScripts:[],snapshotControllerRun:{runs:[],results:[],slotAvailable:true},
          listTaskCatalog:{catalog:[],installed:[]},listPagePrograms:{catalog:[],installed:[]},inspectTaskRun:null};
        if(!Object.hasOwn(data,payload.method))unexpected.push(payload.method);
        reply(data[payload.method]);
      }else if(type==='inspect'){finishInspection=reply;inspectionEntered();}
      else assert.fail('Unexpected scoped message: '+type);
    }};
  const api={windows:{getCurrent:async()=>({id:7,incognito:false})},
    runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
    getContexts:async query=>{
      assert.deepEqual(query,{contextTypes:['SIDE_PANEL'],documentUrls:[ownUrl]});
      return [{...windowProof,windowId:-1,contextType:'SIDE_PANEL',documentUrl:ownUrl,frameId:0,incognito:false}];
    },
    connect({name}){assert.equal(name,ACCEPTANCE_PROTOCOL);return port;}}};
  const scope=await openTaskAcceptancePage({api,document,hostInstanceId,registrationId,revision,expectedWindowId:7,
    createTaskWorkbench(options){scopedApi=options.api;return createTaskWorkbench(options);},
    onNavigate:()=>views.push('selected')});
  t.after(()=>scope.disconnect());
  assert.equal(scope.view,'tasks');
  assert.deepEqual(unexpected,[]);
  assert.equal(scope.developerView.fields['script-allow-cookies'].checked,false);
  assert.equal(scope.developerView.getSnapshot().fields['script-allow-cookies'].checked,false);
  const ordinaryDeveloperView=createDeveloperView();
  t.after(()=>ordinaryDeveloperView.dispose());
  assert.equal(ordinaryDeveloperView.fields['script-allow-cookies'].checked,true);
  assert.equal(ordinaryDeveloperView.getSnapshot().fields['script-allow-cookies'].checked,true);
  assert.equal(scope.developerView.fields['script-current-page-title'].textContent,page.title);
  assert.equal(scope.developerView.fields['script-current-page-url'].textContent,page.url);
  assert.equal(scope.navigate('develop'),true);
  assert.equal(scope.view,'develop');
  assert.equal(scope.navigate('tools'),false);
  assert.equal(scope.view,'develop');
  assert.equal(views.length,2);
  const inspection=scope.inspect();
  assert.equal(scope.busy,true);
  await assert.rejects(scope.selectQuery('测试'),/等待当前离线操作结算/);
  await inspectionPosted;
  const record={identity,runs:[],results:[],activeRunId:null,events:[{type:'existing-observation'}]};
  finishInspection(record);
  assert.deepEqual(await inspection,{...record,draftStorage:{kind:'session-map',entries:0,committedWrites:0}});
  assert.equal(scope.busy,false);
  await scopedApi.storage.session.set({'acceptance-draft':{query:'界面验收 A'}});
  await scopedApi.storage.session.set({'acceptance-draft':{query:'界面验收 B'}});
  assert.deepEqual(await scopedApi.storage.session.get('acceptance-draft'),{'acceptance-draft':{query:'界面验收 B'}});
  const changedDraft=scope.inspect();
  await new Promise(resolve=>setImmediate(resolve));
  finishInspection(record);
  assert.deepEqual(await changedDraft,{...record,draftStorage:{kind:'session-map',entries:1,committedWrites:2}});
  assert.equal(api.storage,undefined,'draft writes must stay inside the scoped session map');
  scope.disconnect();
  assert.equal(disconnected,true);
  await assert.rejects(scope.inspect(),{code:'E_HOST_CLOSED'});
});

test('serve acceptance target resolves builtin resources and rejects escaped paths or foreign roots',t=>{
  const root='chrome-extension://extension/',delegated=[],events=[];
  const manifest={manifest_version:3,name:'Offline target fixture',version:'2.0.0'};
  let returnedRoot=root;
  const runtime={id:'extension',getURL:path=>{delegated.push(path);return returnedRoot+path;},
    getManifest:()=>manifest};
  const target=createTaskAcceptanceTarget({runtime,windowId:7,checkPermission:async()=>true,
    onEvent:event=>events.push(event)});
  t.after(()=>target.close());
  for(const path of ['',BUILTIN_RUNTIME_CATALOG.resourceManifest,...BUILTIN_RESOURCE_PATHS]){
    assert.equal(target.api.runtime.getURL(path),root+path,path);
  }
  const readback=target.api.runtime.getManifest();
  assert.deepEqual(readback,manifest);
  readback.version='mutated';
  assert.equal(target.api.runtime.getManifest().version,manifest.version,'manifest reads must be isolated copies');
  const validCalls=delegated.length;
  for(const path of [
    '.','..','./libs/runtime/bootstrap.js','libs/./runtime/bootstrap.js','libs/../manifest.json',
    'libs/vendor/../../manifest.json','/libs/runtime/bootstrap.js','//foreign/libs/runtime/bootstrap.js',
    'https://foreign.test/index.js','chrome-extension://foreign/libs/runtime/bootstrap.js',
    'libs\\vendor\\index.js','%2e%2e/manifest.json','libs/%2E%2E/manifest.json',
    'libs/%252e%252e/manifest.json','libs/..%2fmanifest.json','libs%2fvendor/index.js',
    'libs/%2fmanifest.json','libs/%5cmanifest.json'
  ]){
    assert.throws(()=>target.api.runtime.getURL(path),{code:'E_CAPABILITY'},path);
  }
  assert.equal(delegated.length,validCalls,'invalid paths must be rejected before delegating to runtime');
  for(const foreignRoot of ['chrome-extension://foreign/','https://extension/','chrome-extension://extension/other/']){
    returnedRoot=foreignRoot;
    for(const path of ['',BUILTIN_RUNTIME_CATALOG.resourceManifest,BUILTIN_RUNTIME_CATALOG.libraries.myUtils.output]){
      assert.throws(()=>target.api.runtime.getURL(path),{code:'E_CAPABILITY'},foreignRoot+path);
    }
  }
  assert.ok(events.filter(event=>event.type==='blocked').every(event=>event.call==='runtime.getURL'));
});

test('serve acceptance storage diagnostics count committed mutations and exclude rollback or reads',async t=>{
  const storage=createTaskAcceptanceStorage();t.after(()=>storage.close());
  const initial=storage.diagnostics();
  assert.ok(initial.instanceId);
  assert.deepEqual(initial,{instanceId:initial.instanceId,kind:'memory-map',entries:{},committedTransactions:0,committedWrites:0});
  await storage.transaction(['drafts'],'readwrite',async tx=>{
    await tx.put('drafts',{value:'original'},'keep');await tx.put('drafts',{value:'remove'},'drop');
  });
  const committed=storage.diagnostics();
  assert.deepEqual(committed,{...initial,entries:{drafts:2},committedTransactions:1,committedWrites:2});
  await assert.rejects(storage.transaction(['drafts'],'readwrite',async tx=>{
    await tx.put('drafts',{value:'overwritten'},'keep');await tx.put('drafts',{value:'new'},'uncommitted');
    await tx.delete('drafts','drop');throw Error('Rollback fixture');
  }),/Rollback fixture/);
  assert.deepEqual(storage.diagnostics(),committed);
  assert.deepEqual(await storage.transaction(['drafts'],'readonly',tx=>tx.all('drafts')),[{value:'original'},{value:'remove'}]);
  await assert.rejects(storage.transaction(['drafts'],'readonly',tx=>tx.put('drafts',{},'denied')),{code:'E_SCHEMA'});
  assert.deepEqual(storage.diagnostics(),committed,'readonly and rejected writes must not change commit counters');
  await storage.transaction(['drafts'],'readwrite',async tx=>{
    await tx.delete('drafts','drop');await tx.put('drafts',{value:'updated'},'keep');
  });
  assert.deepEqual(storage.diagnostics(),{...initial,entries:{drafts:1},committedTransactions:2,committedWrites:4});
});

test('serve acceptance revalidates the exact installation and runs on the isolated target', {timeout:32000},async t=>{
  const {taskId,version,installationId,generation,manifestHash,sourceHash}=ACCEPTANCE_INSTALL;
  const pkg=JSON.parse(await readFile(new URL('../../task-packs/baidu.search/releases/baidu.search.top3.1.1.5.opendesk-task.json',import.meta.url),'utf8'));
  const runtime={id:'extension',getURL:path=>'chrome-extension://extension/'+path};
  const hostInstanceId=crypto.randomUUID(),namespace='tool:extension',scriptId=taskScriptId(taskId,version);
  const sender={id:runtime.id,url:runtime.getURL('sidepanel.html?hostInstanceId='+hostInstanceId),documentId:'native-doc',frameId:0};
  const live=createTaskAcceptanceStorage(),stores=['frameworkKV','scriptHeads','scriptRevisions'];
  const {abi,sha256:bundleSha256,catalogSha256}=fakeBuiltinSource;
  const builtinIdentity={abi,bundleSha256,catalogSha256};
  const base={taskId,version},candidate={tag:'task-candidate-v1',namespace,...base,package:pkg,stage:'available',builtinIdentity,
    verification:{manifestHash,sourceHash,builtinIdentity,builtinAbi:abi,origin:pkg.manifest.siteOrigins[0]}};
  const row={tag:'task-installed-v1',namespace,...base,scriptId,manifestHash,builtinIdentity,enabled:true,
    authorization:{tag:'task-install-authorization-v1',installationId,generation,
      scope:{capabilities:pkg.manifest.permissions,siteOrigins:pkg.manifest.siteOrigins,networkOrigins:[]}}};
  await live.transaction(stores,'readwrite',async tx=>{
    await tx.put('frameworkKV',row,installedKey(namespace,taskId));
    await tx.put('frameworkKV',candidate,taskKey(namespace,taskId,version));
    await tx.put('scriptHeads',{tag:'script-head',namespace,scriptId,revision:1,contentHash:sourceHash},scriptStorageKey(namespace,scriptId));
    await tx.put('scriptRevisions',{tag:'script-revision',namespace,scriptId,revision:1,contentHash:sourceHash,
      sourceUtf8:pkg.sourceUtf8,builtinIdentity},scriptStorageKey(namespace,scriptId,1));
  });
  const liveBaseline=live.diagnostics();
  const liveRecords=()=>live.transaction(stores,'readonly',async tx=>
    Object.fromEntries(await Promise.all(stores.map(async name=>[name,await tx.all(name)]))));
  const originalRecords=await liveRecords();
  const reads=[];
  const source=await readTaskAcceptanceSource({transaction(names,mode,work){
    assert.deepEqual(names,stores);assert.equal(mode,'readonly');reads.push(mode);return live.transaction(names,mode,work);
  }},namespace,ACCEPTANCE_INSTALL);
  const events=[],networkAttempts=[];
  const target=createTaskAcceptanceTarget({runtime,windowId:7,checkPermission:async request=>{
    assert.deepEqual(request,{origins:['https://www.baidu.com/*']});return true;
  },onEvent:event=>events.push(event)});
  const scope=await createTaskAcceptanceSession({source,sender,hostInstanceId,target,
    audit:event=>events.push(event),loadBuiltin:async()=>fakeBuiltinSource});
  const client={ready:Promise.resolve(scope.registration),registration:scope.registration,request:scope.request};
  client.controller=Object.fromEntries(['startControllerRun','snapshotControllerRun','controllerOperation','finishControllerRun',
    'retireControllerTarget','stopControllerRun'].map(name=>[name,args=>scope.request(name,args)]));
  const host=createRunHost({api:target.api,client,document:null,templateModuleFactory:null,
    controllerFactory:({context})=>createOfflineController({context,networkAttempts})});
  t.after(async()=>{await host.dispose();scope.close();live.close();});
  const before=await scope.inspect();
  assert.deepEqual(await scope.request('listPagePrograms'),{catalog:[],installed:[]});
  assert.deepEqual(before.installation,{installationId,generation,version,manifestHash});
  assert.deepEqual(before.results,[]);
  assert.equal(before.storage.kind,'memory-map');
  assert.notEqual(before.storage.instanceId,liveBaseline.instanceId);
  assert.deepEqual(before.storage.baseline,{instanceId:before.storage.instanceId,kind:'memory-map',
    entries:{frameworkKV:2,scriptHeads:1,scriptRevisions:1},committedTransactions:1,committedWrites:4});
  assert.ok(before.storage.committedTransactions>before.storage.baseline.committedTransactions);
  assert.ok(before.storage.committedWrites>before.storage.baseline.committedWrites);
  assert.deepEqual((await scope.inspect()).storage,before.storage,'inspection must not count as a committed write');
  assert.deepEqual(before.candidate,{taskId,version,stage:'available',
    builtinIdentity:{...builtinIdentity,bundleSha256:'0'.repeat(64)},verification:candidate.verification});
  await assert.rejects(scope.request('resolveInstalledTask',{taskId}),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
  const input={query:'界面验收 B',limit:3,showExecutionTab:false};
  const page=target.selectQuery(input.query);
  assert.equal(page.title,'百度搜索 · 离线验收');
  const borrowed={mode:'borrowed',tabId:page.tabId,frameId:0,documentId:page.documentId,expectedUrl:page.url,expectedWindowId:page.windowId};
  const trial=await host.start({source:{kind:'draft',sourceUtf8:pkg.sourceUtf8},params:input,target:borrowed});
  const proof=await host.completion;
  assert.equal(proof.state,'completed',JSON.stringify(proof));
  assert.equal(proof.retirement.state,'released');
  const verified=await scope.request('verifyTaskCandidate',{...base,runId:trial.runId});
  assert.equal(verified.verification.runId,trial.runId);
  const verifiedState=await scope.inspect();
  assert.ok(verifiedState.journal.some(e=>e.runId===trial.runId&&e.resultReceipt&&e.state==='durable'));
  assert.equal(verifiedState.candidate.stage,'verified');
  assert.deepEqual(verifiedState.candidate.builtinIdentity,builtinIdentity);
  const verification={runId:trial.runId,resultId:proof.result.resultId,sourceHash,manifestHash};
  for(const [key,value] of Object.entries(verification))assert.equal(verifiedState.candidate.verification[key],value,key);
  assert.deepEqual(verifiedState.candidate.verification.builtinIdentity,builtinIdentity);
  assert.ok(verifiedState.candidate.verification.nativeReceiptCount>0);
  const available=await scope.request('makeTaskAvailable',{...base,manifestHash});
  const update=await scope.request('installTask',{...base,manifestHash,expectedInstallationId:installationId,expectedGeneration:generation,expectedInstalledVersion:version});
  const installed=await scope.request('resolveInstalledTask',{taskId});
  assert.equal(installed.generation,generation+1);assert.equal(installed.installationId,installationId);
  const operationEvents=events.filter(event=>event.type==='authority-task-operation');
  assert.deepEqual(operationEvents.map(event=>event.method),['verifyTaskCandidate','makeTaskAvailable','installTask']);
  assert.equal(new Set(operationEvents.map(event=>event.operationId)).size,3);
  for(const event of operationEvents){
    assert.match(event.operationId,/^[a-f0-9-]{36}$/);
    assert.equal(event.session,scope.session);assert.equal(event.ok,true);
    assert.equal(event.taskId,taskId);assert.equal(event.version,version);
  }
  for(const [event,response] of [[operationEvents[0],verified],[operationEvents[1],available]]){
    assert.equal(event.stage,response.stage);assert.deepEqual(event.verification,response.verification);
    for(const [key,value] of Object.entries(verification))assert.equal(event.verification[key],value,key);
  }
  assert.deepEqual(operationEvents[2].installation,update);
  assert.equal(operationEvents[2].installation.manifestHash,manifestHash);
  const requestId=crypto.randomUUID();
  const claim=await host.start({source:{kind:'saved',scriptId,revision:1,contentHash:sourceHash},params:input,target:borrowed,
    expectedTaskInstallationId:installationId,expectedTaskGeneration:installed.generation,requestId});
  const pending=await scope.inspect();
  assert.equal(pending.activeRunId,claim.runId);
  assert.ok(!pending.results.some(e=>e.runId===claim.runId));
  const completed=await host.completion,after=await scope.inspect();
  assert.equal(completed.state,'completed',JSON.stringify(completed));
  assert.equal(completed.retirement.state,'released');
  assert.equal(after.activeRunId,null);
  assert.equal(after.candidate.stage,'available');
  assert.deepEqual(after.candidate.builtinIdentity,builtinIdentity);
  assert.deepEqual(after.candidate.verification,verifiedState.candidate.verification);
  assert.deepEqual(after.installation,{installationId,generation:generation+1,version,manifestHash});
  assert.deepEqual(after.storage.baseline,before.storage.baseline);
  assert.equal(after.storage.instanceId,before.storage.instanceId);
  assert.ok(pending.storage.committedWrites>before.storage.committedWrites);
  assert.ok(after.storage.committedWrites>pending.storage.committedWrites);
  assert.ok(after.storage.committedTransactions>pending.storage.committedTransactions);
  assert.ok(after.storage.entries.runs>=2);assert.ok(after.storage.entries.results>=2);
  assert.deepEqual(events.filter(e=>e.type==='runhost-dispatched'&&e.requestId===requestId).map(e=>e.runId),[claim.runId]);
  assert.deepEqual(events.filter(e=>e.runId===claim.runId&&['finishControllerRun','retireControllerTarget'].includes(e.type))
    .map(e=>e.type),['finishControllerRun','retireControllerTarget']);
  assert.ok(after.journal.some(e=>e.runId===claim.runId&&e.resultReceipt&&e.state==='durable'));
  assert.ok(after.results.some(e=>e.runId===claim.runId&&e.ok));
  const result=decodeValue(completed.result.outcome.valueWire);
  assert.deepEqual(result.results.map(entry=>entry.title),['入门指南','常见问题','参考资料']);
  assert.equal(result.sourceUrl,page.url);
  assert.deepEqual(networkAttempts,[]);
  assert.deepEqual(reads,['readonly']);
  assert.deepEqual(await live.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',installedKey(namespace,taskId))),row);
  assert.deepEqual(await liveRecords(),originalRecords,'all live package and script records must remain unchanged');
  assert.deepEqual(live.diagnostics(),liveBaseline,'isolated work must not increment live storage counters');
});

test('atomic preparation admission permits only one durable Run across retries and new request IDs',async()=>{
  const f=await fixture(),{preparation}=await f.prepare();
  const results=await Promise.all([f.start(preparation),f.start(preparation)]);
  assert.equal(results.filter(row=>row.duplicate).length,1);
  assert.equal(results[0].runId,results[1].runId);
  assert.equal((await f.runs()).length,1);
  assert.equal((await f.start(preparation)).duplicate,true);
  assert.equal((await f.inspect()).preparation.state,'unknown');
  await assert.rejects(f.prepare('blocked'),{code:'E_OWNER'});
  const restored=await f.inspect('shared-one');
  assert.equal(restored.preparation.runId,results[0].runId);
  assert.equal(restored.preparation.resultId,results[0].resultId??results[1].resultId);
  assert.equal(restored.snapshot.results.length,0);
});

test('atomic identity rejects changed params, source, deadline, target, installation and preparation binding',async()=>{
  for(const change of ['params','target','source','deadline','installation','binding']){
    const f=await fixture(),{preparation}=await f.prepare();
    const extra=change==='params'?{paramsWire:encodeValue({zero:1})}:change==='target'?{target:{...f.target,expectedUrl:undefined}}:
      change==='source'?{source:{...preparation.source,revision:2}}:change==='deadline'?{deadlineAt:preparation.deadlineAt-1}:
      change==='installation'?{expectedTaskGeneration:f.task.generation+1}:{taskDelegation:{appId:'fake'}};
    await assert.rejects(f.start(preparation,extra));assert.equal((await f.runs()).length,0);
    assert.equal((await f.inspect()).preparation.state,'prepared');
  }
});

test('revocation, replacement version, environment and document changes block prepared submission without releasing it',async()=>{
  for(const change of ['permission','disable','version','environment','document']){
    const f=await fixture(),{preparation}=await f.prepare();
    if(change==='permission')f.setAllowed(false);
    if(change==='disable')await f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
    if(change==='version')await f.installPackage({...f.manifest,version:'1.0.1'},f.resolved);
    if(change==='environment')f.setBuiltin(fakeBuiltinSource+'\n// altered environment');
    if(change==='document')f.frames.get(2)[0].documentId='replacement';
    await assert.rejects(f.start(preparation));
    assert.equal((await f.runs()).length,0);
    assert.equal((await f.inspect()).preparation.preparationId,preparation.preparationId);
  }
});

test('expired preparation never starts or silently unlocks; explicit cancel is required',async()=>{
  const f=await fixture(),{preparation}=await f.prepare();
  const original=f.clock.now;f.clock.now=()=>preparation.expiresAt+1;
  await assert.rejects(f.start(preparation),{code:'E_TIMEOUT'});
  await assert.rejects(f.startTask());await assert.rejects(f.prepare('other'),{code:'E_OWNER'});
  assert.equal((await f.inspect()).preparation.state,'prepared');
  await f.cancel();f.clock.now=original;
  assert.equal((await f.prepare('other')).preparation.state,'prepared');
});

test('submitted cancellation stops original Run, does not roll back success or release unfinished resources',async()=>{
  const f=await fixture(),{preparation}=await f.prepare(),run=await f.start(preparation);
  const cancelled=await f.cancel();
  assert.equal(cancelled.snapshot.run.state,'stopping');
  assert.equal(cancelled.preparation.state,'unknown');
  await assert.rejects(f.prepare('blocked'),{code:'E_OWNER'});
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const settled=await f.inspect('shared-one');
  assert.equal(settled.preparation.state,'submitted');assert.equal(settled.snapshot.results[0].state,'stopped');
  assert.equal((await f.inspect()).preparation,null);
  const next=(await f.prepare('success')).preparation,done=await f.start(next);await f.finish(done);
  await f.cancel('success');
  assert.equal((await f.inspect('success')).snapshot.results[0].state,'completed');
  await assert.rejects(f.prepare('blocked-again'),{code:'E_OWNER'});
  await f.authority.retireControllerTarget({runId:done.runId},f.sender);
  assert.equal((await f.prepare('released')).preparation.state,'prepared');
});

test('Stop notification reaches the original RunHost from another host without replay or early release',async()=>{
  const notifications=[];let listener,workers=0,stops=0,context,complete,retire;
  const terminal=new Promise(resolve=>{complete=resolve;}),retired=new Promise(resolve=>{retire=resolve;});
  const f=await fixture({emitToHost:async(registrationId,event)=>{
    if(event.type!=='controller-fenced')return;
    const run=(await f.rows('runs')).find(row=>row.runId===event.runId);
    assert.equal(run.state,'stopping','notification follows the durable fence');
    notifications.push({registrationId,event});
    if(registrationId===f.registration.registrationId)listener?.(event);
  }});
  const {preparation}=await f.prepare();
  const controls=Object.fromEntries(['startControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method=>[method,request=>f.authority[method](request,f.sender)]));
  const host=createRunHost({api:f.api,document:null,templateModuleFactory:null,
    client:{ready:Promise.resolve(),controller:controls,subscribeRun:fn=>{listener=fn;return()=>{listener=null;};}},
    controllerFactory:options=>{workers++;context=options.context;return {
      execute:()=>terminal,result:terminal,retired,resourceReleased:retired,stop:()=>{stops++;},
    };}});
  const run=await host.start({source:preparation.source,params:preparation.params,target:preparation.target,
    deadlineAt:preparation.deadlineAt??f.clock.now()+preparation.executionDeadlineMs,expectedTaskGeneration:f.task.generation,expectedTaskInstallationId:f.task.installationId,
    taskPreparationId:preparation.preparationId});
  try{
    const sender={...f.sender,documentId:'drawer-host',tab:{id:3,incognito:false}};
    f.frames.set(3,[{frameId:0,documentId:sender.documentId,url:sender.url}]);
    const other=await f.register(sender,'drawer');
    assert.notEqual(other.registrationId,f.registration.registrationId);
    const cancel=()=>f.authority.cancelTaskRun({preparationId:preparation.preparationId},sender);
    await cancel();await cancel();
    assert.deepEqual(notifications,Array.from({length:2},()=>({registrationId:f.registration.registrationId,
      event:{type:'controller-fenced',runId:run.runId,reasonCode:'E_CANCELLED'}})));
    assert.equal(stops,2);assert.equal(context.signal.aborted,true);assert.equal(context.signal.reason.code,'E_CANCELLED');
    assert.equal((await f.inspect()).settled,false);
    assert.equal((await f.start(preparation)).duplicate,true);
    assert.equal(workers,1);assert.equal((await f.runs()).length,1);
    await assert.rejects(f.prepare('blocked-after-ack'),{code:'E_OWNER'});
    await f.finish(run,'stopped');
    assert.equal((await f.inspect()).settled,false,'terminal Result is not resource release');
    await assert.rejects(f.prepare('blocked-after-terminal'),{code:'E_OWNER'});
  }finally{
    complete({status:'stopped'});retire({acknowledged:true});
    await host.completion;await host.dispose();
  }
  assert.equal((await f.inspect('shared-one')).settled,true);
});

test('Stop notification failure preserves the durable fence and repeated Stop never readmits execution',async()=>{
  for(const reasonCode of ['E_CANCELLED','E_TIMEOUT']){
    const notifications=[];
    const f=await fixture({emitToHost:async(registrationId,event)=>{
      if(event.type!=='controller-fenced')return;
      notifications.push({registrationId,event});throw Error('Host transport unavailable');
    }});
    const {preparation}=await f.prepare(),run=await f.start(preparation);
    const request={runId:run.runId,requestId:'original-stop',reason:reasonCode};
    const stopped=await f.authority.stopControllerRun(request,f.sender);
    assert.deepEqual(await f.authority.stopControllerRun(request,f.sender),stopped);
    assert.deepEqual(notifications,Array.from({length:2},()=>({registrationId:f.registration.registrationId,
      event:{type:'controller-fenced',runId:run.runId,reasonCode}})));
    const durable=(await f.runs())[0];
    assert.equal(durable.state,'stopping');assert.equal(durable.cancelSeq,stopped.cancelSeq);
    assert.equal(durable.runRevision,stopped.runRevision);assert.equal(durable.terminalReason,reasonCode);
    assert.equal((await f.inspect()).settled,false);
    assert.equal((await f.start(preparation)).duplicate,true);assert.equal((await f.runs()).length,1);
    await assert.rejects(f.prepare('blocked'),{code:'E_OWNER'});
  }
});

test('unknown durable submission is observed after a lost reply and never readmitted or replayed',async()=>{
  const f=await fixture(),{preparation}=await f.prepare();
  const run=await f.start(preparation); // Simulate losing this successful RPC reply.
  const sender={...f.sender,documentId:'replacement-host',tab:{id:3,incognito:false}};
  f.frames.set(3,[{frameId:0,documentId:sender.documentId,url:sender.url}]);await f.register(sender,'replacement');
  const recovered=await f.authority.inspectTaskRun({},sender);
  assert.equal(recovered.preparation.state,'unknown');assert.equal(recovered.preparation.runId,run.runId);
  assert.equal((await f.start(preparation,{},sender)).duplicate,true);
  assert.equal((await f.runs()).length,1);
  await f.authority.cancelTaskRun({preparationId:'shared-one'},sender);
  assert.equal((await f.inspect()).snapshot.run.state,'stopping');
});

async function boundFixture(){
  const f=await fixture();
  const tool={format:'opendesk.sidebar-tool.v2',id:'shared-consumer',version:'1.0.0',title:'Shared consumer',
    description:'Shared Task preparation fixture',capabilities:['tasks.run'],html:'<main>Task</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
    delegatedTasks:[Object.fromEntries(['taskId','version','manifestHash','contentHash'].map(key=>[key,f.task[key]]))]};
  const local={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:'epoch'}};
  f.api.storage={local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(local[key])]))}};
  const app=await readTaskDelegationApp(f.api,tool.id);
  const binding={appId:app.appId,packageHash:app.packageHash,generation:app.generation,instanceId:'original-frame',task:f.task};
  return {...f,tool,local,binding};
}

test('minimal original App binding remains pinned and uses its lifecycle lock; revoked App cannot submit or disclose Result',async()=>{
  for(const revoke of ['before-start','after-result']){
    const f=await boundFixture(),{preparation}=await f.prepare('bound',{binding:f.binding});
    assert.deepEqual(preparation.binding,f.binding);
    if(revoke==='before-start'){
      f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='revoked';
      await assert.rejects(f.start(preparation),{code:'E_PERMISSION'});
      assert.equal((await f.runs()).length,0);
    }else{
      const run=await f.start(preparation);await f.finish(run);
      assert.equal((await f.inspect('bound')).snapshot.results[0].state,'completed');
      f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='revoked';
      const revoked=await f.inspect('bound');
      assert.equal(revoked.preparation.state,'unknown');assert.deepEqual(revoked.snapshot.results,[]);
      assert.equal((await f.cancel('bound')).snapshot.run.state,'completed');
    }
  }
});

test('bound Result disclosure rejects changed document while retaining original preparation and Run',async()=>{
  const f=await boundFixture(),{preparation}=await f.prepare('bound',{binding:f.binding});
  const run=await f.start(preparation);await f.finish(run);f.frames.get(2)[0].documentId='new-document';
  const answer=await f.inspect('bound');
  assert.equal(answer.preparation.state,'unknown');assert.deepEqual(answer.snapshot.results,[]);
  assert.equal(answer.preparation.runId,run.runId);
});

test('injected business recovery fence holds through durable prepare and admission, failures block every entry',async()=>{
  let blocked=false,inside=false;const calls=[];
  const f=await fixture({withTaskRunRecovery:async(work,options)=>{
    calls.push(options);if(blocked)throw Object.assign(new Error('Legacy state unresolved'),{code:'E_RECOVERY'});
    inside=true;try{return await work();}finally{inside=false;}
  }});
  const transaction=f.storage.transaction;
  f.storage.transaction=(names,mode,body)=>transaction(names,mode,tx=>body({...tx,put:async(name,row,key)=>{
    if(row.tag==='task-run-preparation'||row.tag==='controller-start')assert.equal(inside,true);
    return tx.put(name,row,key);
  }}));
  blocked=true;await assert.rejects(f.prepare(),{code:'E_RECOVERY'});
  await assert.rejects(f.startTask(),{code:'E_RECOVERY'});assert.equal((await f.runs()).length,0);
  blocked=false;const {preparation}=await f.prepare();blocked=true;
  await assert.rejects(f.start(preparation),{code:'E_RECOVERY'});assert.equal((await f.runs()).length,0);
  blocked=false;await f.start(preparation);assert.ok(calls.length>=5);assert.equal(inside,false);
});

test('missing Run or admission journal remains UNKNOWN and cannot be replaced by the same preparation',async()=>{
  for(const missing of ['run','admission']){
    const f=await fixture(),{preparation}=await f.prepare(),run=await f.start(preparation);
    await f.storage.transaction(['runs','commandJournal'],'readwrite',async tx=>{
      if(missing==='run')await tx.delete('runs',run.runId);
      else await tx.delete('commandJournal',`task-preparation-start:${canonical(['tool:extension',preparation.preparationId])}`);
    });
    assert.equal((await f.inspect()).preparation.state,'unknown');
    await assert.rejects(f.start(preparation));await assert.rejects(f.prepare('replacement'),{code:'E_OWNER'});
  }
});

test('RunHost forwards taskPreparationId and never creates a Worker for a durable duplicate',async()=>{
  const f=await fixture(),{preparation}=await f.prepare();await f.start(preparation);
  let workers=0,observed;
  const host=createRunHost({api:f.api,client:{ready:Promise.resolve(),controller:{startControllerRun:request=>{
    observed=request;return f.authority.startControllerRun(request,f.sender);
  }}},document:null,templateModuleFactory:null,controllerFactory:()=>{workers++;throw Error('No replay');}});
  await assert.rejects(host.start({source:preparation.source,params:preparation.params,target:preparation.target,
    deadlineAt:preparation.deadlineAt??f.clock.now()+preparation.executionDeadlineMs,expectedTaskGeneration:f.task.generation,expectedTaskInstallationId:f.task.installationId,
    taskPreparationId:preparation.preparationId}),{code:'E_EFFECT_UNKNOWN'});
  assert.equal(observed.taskPreparationId,preparation.preparationId);assert.equal(workers,0);await host.dispose();
});

test('unreleased original Run still blocks after a damaged or missing slot, including a tombstoned Run',async()=>{
  for(const tombstoned of [false,true]){
    const f=await fixture(),run=await f.startTask();await f.finish(run);
    await f.storage.transaction(['runs'],'readwrite',async tx=>{
      await tx.delete('runs','@slot');const row=await tx.get('runs',run.runId);row.tombstoned=tombstoned;await tx.put('runs',row,run.runId);
    });
    await assert.rejects(f.prepare(),{code:'E_OWNER'});await assert.rejects(f.startTask(),{code:'E_OWNER'});
  }
});


test('cancelling an absent preparation writes a durable tombstone and blocks a late prepare/save ACK',async()=>{
  const f=await fixture();
  const cancelled=await f.cancel('lost-save');
  assert.equal(cancelled.preparation.state,'cancelled');assert.equal(cancelled.preparation.runId,null);
  assert.deepEqual(await f.inspect('lost-save'),cancelled);
  assert.equal((await f.inspect()).preparation,null);
  await assert.rejects(f.prepare('lost-save'),{code:'E_CANCELLED'});
  assert.deepEqual(await f.cancel('lost-save'),cancelled);
  assert.equal((await f.runs()).length,0);
  assert.equal((await f.prepare('new-id')).preparation.state,'prepared');
});


test('App-service admission uses consistently ordered recovery lifecycle locks without reacquiring them', {timeout:3000}, async()=>{
  const f=await boundFixture(),js='async function main(){return true;}';
  Object.assign(f.tool,{capabilities:['tasks.run','browser.storage','browser.scheduler'],
    background:{kind:'opendesk.app-service.v1',js,sha256:await digestUtf8(js)}});
  const sender={id:f.api.runtime.id,url:f.api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH),
    documentId:'service-document',frameId:0,documentLifecycle:'active'};
  f.api.runtime.getContexts=async()=>[{contextType:'OFFSCREEN_DOCUMENT',documentId:sender.documentId,
    documentUrl:sender.url,frameId:0,incognito:false}];
  let observed=false;
  const methods=controllerMethods({storage:f.storage,api:f.api,session:'browser-session',clock:f.clock,
    withTaskRunRecovery:async(work,options)=>withWebflowTaskRunRecovery(f.api,async held=>{
      assert.equal(options.appId,f.tool.id);
      const state=await navigator.locks.query();
      assert.ok(state.held.some(lock=>lock.name==='opendesk.sidebar-tools:tool:'+f.tool.id));
      assert.ok(!state.held.some(lock=>lock.name==='opendesk.run-admission.v1'));
      observed=true;return work(held);
    },options),scheduled:{prepareAdmission:async()=>{throw Object.assign(new Error('Expected schedule check'),{code:'E_SCHEDULE'});}}});
  await assert.rejects(methods.startControllerRun({profile:'app-service',appId:f.tool.id,scheduledFireId:'service-fire',
    expectedScheduleOwner:{},requestId:'service-fire',deadlineAt:Date.now()+30000},sender),{code:'E_SCHEDULE'});
  assert.equal(observed,true);
});

test('terminal released Run without its matching durable Result cannot unlock either entry',async()=>{
  for(const changed of ['missing','state','principal','runId','resultId','preparation']){
    const f=await fixture(),{preparation}=await f.prepare(),run=await f.start(preparation);
    await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
    await f.storage.transaction(['runs','results'],'readwrite',async tx=>{
      if(changed==='preparation'){
        const row=await tx.get('runs',run.runId);row.taskPreparationId='unrelated';await tx.put('runs',row,row.runId);return;
      }
      if(changed==='missing'){await tx.delete('results',run.resultId);return;}
      const result=await tx.get('results',run.resultId);
      result[changed]=changed==='state'?'failed':changed==='principal'?{unrelated:true}:'unrelated';
      await tx.put('results',result,run.resultId);
    });
    assert.equal((await f.inspect()).preparation.preparationId,preparation.preparationId,changed);
    await assert.rejects(f.prepare('next'),{code:'E_OWNER'});
    await assert.rejects(f.startTask(),{code:'E_OWNER'});
    assert.equal((await f.runs()).length,1);
  }
});

test('legacy AppStorage release flags require original matching delegation journal and Run/Result',async()=>{
  const data={},key='opendesk.sidebar-tools.data.v1:webflow';
  const legacyApi={storage:{local:{get:async()=>({[key]:structuredClone(data)})}}};
  const f=await fixture({withTaskRunRecovery:(work,options)=>withWebflowTaskRunRecovery(legacyApi,work,options)});
  const id='webflow:legacy-locator';
  data['webflow.pending.v1']={clientRequestId:id,retirementState:'released',notSubmittedFenced:true};
  await assert.rejects(f.prepare(),{code:'E_TASK_RECOVERY_REQUIRED'});
  delete data['webflow.pending.v1'];
  const run=await f.startTask();await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  let originalRun;
  await f.storage.transaction(['runs','commandJournal'],'readwrite',async tx=>{
    originalRun=await tx.get('runs',run.runId);
    originalRun.taskDelegationStep={clientRequestId:id,operationRef:'original-operation'};
    await tx.put('runs',originalRun,run.runId);
    await tx.put('commandJournal',{tag:'task-delegation-step',appId:'webflow',clientRequestId:id,
      securityPartition:originalRun.namespace,principalRef:originalRun.principal,operationRef:'original-operation',
      runId:run.runId,resultId:run.resultId},'original-legacy-step');
  });
  data['webflow.pending.v1']={clientRequestId:id,state:'unknown',retirementState:'held'};
  assert.equal((await f.prepare()).preparation.state,'prepared','cached UNKNOWN is settled only by original authority');
  await f.cancel();
  await f.storage.transaction(['results'],'readwrite',tx=>tx.delete('results',run.resultId));
  data['webflow.pending.v1'].retirementState='released';
  await assert.rejects(f.prepare('next'),{code:'E_TASK_RECOVERY_REQUIRED'});
  assert.equal(data['webflow.pending.v1'].clientRequestId,id,'never delete legacy identity');
});

test('non-occupying SDK service history does not block prepare or direct Task admission',async()=>{
  const f=await fixture();
  await f.storage.transaction(['runs'],'readwrite',async tx=>{
    for(const state of ['completed','preparing','unknown'])await tx.put('runs',{
      tag:'sdk-service',driver:'framework.sdk-service.v1',runId:'sdk-'+state,state},'sdk-'+state);
  });
  assert.equal((await f.prepare()).preparation.state,'prepared');await f.cancel();
  assert.ok((await f.startTask()).runId);
});

test('authoritative settlement survives Result disclosure denial without exposing Result',async()=>{
  const f=await fixture(),{preparation}=await f.prepare(),run=await f.start(preparation);
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  f.setAllowed(false);
  const reply=await f.inspect(preparation.preparationId);
  assert.equal(reply.settled,true);assert.deepEqual(reply.snapshot.results,[]);
  assert.equal((await f.inspect()).preparation,null);
});

test('shared history locators are original Authority rows scoped to current App and exact installed Task',async()=>{
  const f=await boundFixture(),{preparation}=await f.prepare('owned-prep',{binding:f.binding});
  const list=binding=>f.authority.listTaskRunPreparations({binding},f.sender);
  const {preparations}=await list({...f.binding,instanceId:'reopened-frame'});
  assert.equal(preparations.length,1);assert.equal(preparations[0].preparationId,preparation.preparationId);
  assert.equal(preparations[0].settled,false);assert.equal('params'in preparations[0],false);
  assert.equal('target'in preparations[0],false);assert.equal('result'in preparations[0],false);
  assert.deepEqual(await list({...f.binding,task:{...f.task,installationId:'22222222-2222-4222-8222-222222222222'}}),{preparations:[]});
  await f.cancel('owned-prep');assert.equal((await list(f.binding)).preparations[0].settled,true);
  await assert.rejects(list({...f.binding,generation:'revoked'}),{code:'E_PERMISSION'});
});
