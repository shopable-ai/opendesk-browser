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
const authorityEvent = () => ({addListener() {}, removeListener() {}});
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
      }, onRemoved:authorityEvent()},
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
    deadlineAt:preparation.deadlineAt,expectedTaskGeneration:task.generation,expectedTaskInstallationId:task.installationId,
    taskPreparationId:preparation.preparationId,...(preparation.binding?{taskDelegation:preparation.binding}:{}),...extra},sender);
  const inspect=(preparationId)=>f.authority.inspectTaskRun(preparationId===undefined?{}:{preparationId},f.sender);
  const cancel=(preparationId='shared-one')=>f.authority.cancelTaskRun({preparationId},f.sender);
  const runs=async()=>(await f.rows('runs')).filter(row=>row.tag==='controller-run'&&row.scriptId===f.resolved.scriptId);
  return {...f,task,target,params,prepare,start,inspect,cancel,runs};
}

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
    deadlineAt:preparation.deadlineAt,expectedTaskGeneration:f.task.generation,expectedTaskInstallationId:f.task.installationId,
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
    deadlineAt:preparation.deadlineAt,expectedTaskGeneration:f.task.generation,expectedTaskInstallationId:f.task.installationId,
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
