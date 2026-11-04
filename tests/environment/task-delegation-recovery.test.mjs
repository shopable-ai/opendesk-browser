import {runInNewContext} from 'node:vm';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {createCloudService} from '../../src/cloud-control/service.js';
import {CONTRACT_VERSION,CONTRACT_HASH,canonical,digest,digestUtf8} from '../../src/platform/protocol.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';
import {createTaskPackage,TASK_MANIFEST_FORMAT,installedKey} from '../../src/platform/tasks/contract.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {readTaskDelegationApp} from '../../src/platform/tasks/delegation-installation.js';
import {createRunHost} from '../../src/run-host.js';
import {setInstalledSidebarToolEnabled} from '../../src/ui/sidebar-tools/installation.js';
import {readAppServiceInstallation} from '../../src/platform/tasks/app-service-installation.js';
import {CLOUD_RUNNER_DOCUMENT_PATH} from '../../src/tool-document-url.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskDelegationHost} from '../../src/platform/host/task-delegation.js';

const err=code=>Object.assign(new Error(code),{code});
const sha='a'.repeat(64);
const pin={taskId:'demo.search',version:'1.0.0',manifestHash:sha,contentHash:sha,
  installationId:'00000000-0000-4000-8000-000000000000',generation:1};
const app={appId:'demo-flow',packageHash:'b'.repeat(64),generation:'epoch-1',
  tasks:[Object.fromEntries(['taskId','version','manifestHash','contentHash'].map(k=>[k,pin[k]]))]};
const resolved={...pin,scriptId:'task:demo.search',revision:1,manifest:{deadlineMs:30000}};
const taskInput={...pin};
const page={tabId:7,frameId:0,documentId:'document-a',
  url:'https://example.com/search',windowId:2};

function fixture(controllerOrOptions=false){
  const controller=controllerOrOptions===true;
  const {onInspect}=controllerOrOptions&&typeof controllerOrOptions==='object'?controllerOrOptions:{};
  const ledger=new Map();
  let starts=0,inspects=0,stops=0,revoked=false;
  const client={async request(method,value){
    if(method==='resolveInstalledTask')return structuredClone(resolved);
    if(method==='prepareDelegatedStep'){
      const id=value.clientRequestId,previous=ledger.get(id);
      if(previous){
        if(previous.cancelled)throw err('E_CANCELLED');
        if(previous.paramsDigest!==value.paramsDigest)throw err('E_REQUEST_CONFLICT');
        return {operationRef:previous.operationRef,state:previous.state,
          runId:previous.runId,deadlineAt:previous.deadlineAt};
      }
      const row={operationRef:'op-'+id,paramsDigest:value.paramsDigest,
        state:'prepared',runId:null,resultId:null,deadlineAt:value.deadlineAt,cancelled:false};
      ledger.set(id,row);
      return {operationRef:row.operationRef,state:row.state,runId:null,deadlineAt:row.deadlineAt};
    }
    if(method==='cancelDelegatedStep'){
      const row=ledger.get(value.clientRequestId)??{operationRef:'op-'+value.clientRequestId,
        state:'cancelled',runId:null,cancelled:true,prepared:false};
      row.cancelled=true;row.state=row.runId?'stopping':'cancelled';ledger.set(value.clientRequestId,row);
      return {operationRef:row.operationRef,state:row.state,runId:row.runId,
        semantic:row.runId?'FOUND_RUNNING':'UNKNOWN'};
    }
    if(method==='inspectDelegatedStep'){
      inspects++;
      await onInspect?.();
      const row=ledger.get(value.clientRequestId);
      if(!row)return {semantic:'UNKNOWN',state:'unknown',runId:null,resultId:null,
        operationRef:null,result:null,retirementState:null};
      return {semantic:row.runId?'FOUND_RESULT':'UNKNOWN',
        state:row.runId?'completed':row.state,runId:row.runId,resultId:row.resultId,
        operationRef:row.operationRef,retirementState:row.runId?'released':null,
        result:row.runId?{resultId:row.resultId,runId:row.runId,
          outcome:{ok:false,error:{code:'E_DEMO'}}}:null};
    }
    throw err('E_SCHEMA');
  }};
  const host={
    async start(request){
      if(controller){
        assert.deepEqual(request.source,{kind:'app-controller',appId:app.appId,
          packageHash:app.packageHash,generation:app.generation});
        assert.equal(request.expectedTaskInstallationId,undefined);
      }
      starts++;
      assert.equal(request.taskDelegationStep.operationRef,'op-'+request.taskDelegationStep.clientRequestId);
      const row=ledger.get(request.taskDelegationStep.clientRequestId);
      assert.equal(row.state,'prepared');
      row.state='submitted';row.runId='run-'+starts;row.resultId='result-'+starts;
      return {runId:row.runId,resultId:row.resultId};
    },
    async stop(){stops++;},
    cancelStart(){return true;},
    controller:{async snapshotControllerRun(){throw err('E_OWNER');}}
  };
  const create=instanceId=>createTaskDelegationHost({api:{},client,host,
    appId:app.appId,instanceId,assertInstance:()=>{},
    readApp:async()=>{if(controller)throw err('UNEXPECTED_TASK_LOOKUP');if(revoked)throw err('E_TOOL_DISABLED');return structuredClone(app);},
    readControllerApp:async()=>{
      if(revoked)throw err('E_TOOL_DISABLED');
      const {tasks,...binding}=structuredClone(app);
      return {binding:{...binding,controller:{sourceHash:sha}},tool:{controller:{sourceHash:sha,deadlineMs:30000}}};
    },
    assertApp:async binding=>{
      if(revoked||binding.appId!==app.appId||binding.generation!==app.generation)
        throw err('E_PERMISSION');
    },
    currentPageTarget:{capture:()=>structuredClone(page),revalidate:async()=>{}},
    clock:()=>1000});
  return {create,ledger,get starts(){return starts;},get inspects(){return inspects;},
    get stops(){return stops;},revoke(){revoked=true;}};
}
const startInput=(clientRequestId,params={query:'OpenDesk'})=>({
  clientRequestId,task:structuredClone(taskInput),params
});

test('J06: after a new iframe opens, read the original result without calling start',async()=>{
  const f=fixture(),old=f.create('iframe-1');
  const started=await old.request('tasks.start',startInput('step-a'),{verifiedUserActivation:true});
  assert.equal(started.runId,'run-1');
  await old.dispose();
  const newer=f.create('iframe-2');
  const found=await newer.request('tasks.read',{clientRequestId:'step-a'});
  assert.equal(found.semantic,'FOUND_RESULT');
  assert.equal(found.runId,'run-1');
  assert.equal(found.resultId,'result-1');
  assert.equal(found.retirementState,'released');
  assert.equal(f.starts,1);
  assert.equal(f.inspects,1);
});


test('J06: original iframe preserves six-field pin for read and stop compatibility',async()=>{
  const f=fixture(),one=f.create('iframe-live');
  const started=await one.request('tasks.start',startInput('step-live'),{verifiedUserActivation:true});
  assert.equal(started.runId,'run-1');
  const read=await one.request('tasks.read',{clientRequestId:'step-live'});
  assert.equal(read.semantic,'FOUND_RESULT');
  const stopped=await one.request('tasks.stop',{clientRequestId:'step-live'});
  assert.equal(stopped.runId,'run-1');
  assert.equal(stopped.state,'stopping');
  assert.equal(f.starts,1);
  assert.equal(f.stops,1);
});

test('J06: new Host manual start with the same step cannot submit a second Run',async()=>{
  const f=fixture(),old=f.create('iframe-1');
  await old.request('tasks.start',startInput('step-b'),{verifiedUserActivation:true});
  const newer=f.create('iframe-2');
  const result=await newer.request('tasks.start',startInput('step-b'),{verifiedUserActivation:true});
  assert.equal(result.runId,'run-1');
  assert.equal(f.starts,1);
});

test('J06: stop before prepare installs a persistent future-submit fence',async()=>{
  const f=fixture(),one=f.create('iframe-1');
  const stop=await one.request('tasks.stop',{clientRequestId:'step-c'});
  assert.equal(stop.state,'cancelled');
  await assert.rejects(one.request('tasks.start',startInput('step-c'),{verifiedUserActivation:true}),
    error=>error.code==='E_CANCELLED');
  const two=f.create('iframe-2');
  await assert.rejects(two.request('tasks.start',startInput('step-c'),{verifiedUserActivation:true}),
    error=>error.code==='E_CANCELLED');
  assert.equal(f.starts,0);
});

test('J06: same logical step with conflicting parameters is never re-admitted',async()=>{
  const f=fixture(),one=f.create('iframe-1');
  await one.request('tasks.start',startInput('step-d'),{verifiedUserActivation:true});
  const two=f.create('iframe-2');
  await assert.rejects(two.request('tasks.start',startInput('step-d',{query:'different'}),{verifiedUserActivation:true}),
    error=>error.code==='E_REQUEST_CONFLICT');
  assert.equal(f.starts,1);
});

test('J06: removed App authorization prevents cross-Host result disclosure',async()=>{
  const f=fixture(),old=f.create('iframe-1');
  await old.request('tasks.start',startInput('step-e'),{verifiedUserActivation:true});
  f.revoke();
  const newer=f.create('iframe-2');
  await assert.rejects(newer.request('tasks.read',{clientRequestId:'step-e'}),
    error=>error.code==='E_TOOL_DISABLED');
  assert.equal(f.inspects,0);
});

test('J06: missing history is UNKNOWN and never triggers a new prepare or start',async()=>{
  const f=fixture(),fresh=f.create('iframe-2');
  const result=await fresh.request('tasks.read',{clientRequestId:'missing'});
  assert.equal(result.semantic,'UNKNOWN');
  assert.equal(result.runId,null);
  assert.equal(f.starts,0);
  assert.equal(f.ledger.size,0);
});

// Authority and repository fixture adapted from k3-controller-authority.
// Transaction rollback/order are simulated; this is NOT a native IndexedDB test.
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
async function authorityBaseFixture() {
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
  authority = createRunAuthority({cloudFactory:createCloudService,loadBuiltin:async()=>builtinSource,storage,api,session:'browser-session',clock});
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
async function installedTaskFixture({permissions=['page.automation']}={}){
  const f=await authorityBaseFixture(),source='async function main(){return await page.title();}';
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

test('installed-task mutation fences a pending final check before its first await and leaves other tasks independent',async()=>{
  const f=await installedTaskFixture();
  const original=f.authority.captureInstalledTaskFence(f.resolved.taskId);
  const unrelated=f.authority.captureInstalledTaskFence('unrelated-task');
  const change=f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
  assert.throws(original,{code:'E_REVISION'});
  assert.throws(()=>f.authority.captureInstalledTaskFence(f.resolved.taskId),{code:'E_REVISION'});
  unrelated();await change;
  const next=f.authority.captureInstalledTaskFence(f.resolved.taskId);next();
  const unknown=f.authority.uninstallTask({},f.sender);
  assert.throws(next,{code:'E_REVISION'});assert.throws(unrelated,{code:'E_REVISION'});
  await assert.rejects(unknown);
});

async function recoveryAuthorityFixture(){
  const f=await installedTaskFixture();
  const task=Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation']
    .map(key=>[key,f.resolved[key]]));
  const tool={format:'opendesk.sidebar-tool.v2',id:'j06-authority',version:'1.0.0',title:'J06 recovery',
    description:'Delegated Task recovery fixture',capabilities:['tasks.run'],html:'<main>Recovery</main>',
    css:'',js:'void 0;',requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
    delegatedTasks:[Object.fromEntries(['taskId','version','manifestHash','contentHash'].map(key=>[key,task[key]]))]};
  const local={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:'j06-epoch'}};
  f.api.storage={local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
    .map(key=>[key,structuredClone(local[key])])),set:async rows=>Object.assign(local,structuredClone(rows))}};
  const app=await readTaskDelegationApp(f.api,tool.id);
  const binding={...app,instanceId:'iframe-old',task};
  Object.assign(f.tabs.get(2),{windowId:1,active:true});
  f.api.tabs.query=async()=>[f.tabs.get(2)];
  const target={mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top',expectedUrl:'https://a.example/page',expectedWindowId:1};
  const params={no:false,zero:0};
  const sender2={...f.sender,documentId:'host-doc-two',tab:{id:3,incognito:false}};
  f.frames.set(3,[{frameId:0,documentId:sender2.documentId,url:sender2.url}]);
  await f.register(sender2,'host-two');
  const binding2={...app,instanceId:'iframe-new',task:app.tasks[0]};
  const prepare=(id='step-a',extra={},sender=f.sender)=>f.authority.prepareDelegatedStep({binding,
    clientRequestId:id,paramsDigest:undefined,target,deadlineAt:Date.now()+30000,...extra},sender);
  const prepareStep=async(id='step-a',extra={},sender=f.sender)=>prepare(id,{paramsDigest:await digest(params),...extra},sender);
  const request=(prepared,id='step-a',extra={})=>({requestId:crypto.randomUUID(),scriptId:f.resolved.scriptId,
    revision:f.resolved.revision,contentHash:f.resolved.contentHash,paramsWire:encodeValue(params),target,
    deadlineAt:prepared.deadlineAt,expectedTaskGeneration:task.generation,expectedTaskInstallationId:task.installationId,
    taskDelegation:binding,taskDelegationStep:{clientRequestId:id,operationRef:prepared.operationRef},...extra});
  const inspect=(id='step-a',extra={})=>f.authority.inspectDelegatedStep({binding:binding2,clientRequestId:id,...extra},sender2);
  const cancel=(id='step-a')=>f.authority.cancelDelegatedStep({binding:binding2,clientRequestId:id},sender2);
  const runs=async()=>(await f.rows('runs')).filter(row=>row.tag==='controller-run'&&row.taskDelegation);
  return {...f,tool,local,binding,binding2,task,target,params,sender2,prepare:prepareStep,request,inspect,cancel,runs};
}

test('J06 Authority: two Hosts with different request IDs commit one original Run',async t=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare(),
    b=await f.prepare('step-a',{binding:{...f.binding,instanceId:'iframe-new'}},f.sender2);
  assert.equal(a.operationRef,b.operationRef);
  const claims=await Promise.all([
    f.authority.startControllerRun(f.request(a),f.sender),
    f.authority.startControllerRun(f.request(b,'step-a',{taskDelegation:{...f.binding,instanceId:'iframe-new'}}),f.sender2)]);
  assert.equal(claims[0].runId,claims[1].runId);
  assert.equal(claims.filter(row=>row.duplicate).length,1);
  assert.equal((await f.runs()).length,1);
  const journal=await f.rows('commandJournal'),step=journal.find(row=>row.tag==='task-delegation-step');
  assert.equal(step.admissionCount,1);
  assert.equal(journal.filter(row=>row.tag==='controller-start'&&row.runId===step.runId).length,1);
  assert.equal((await f.rows('runs')).find(row=>row.tag==='slot').currentRunId,step.runId);
  t.diagnostic(JSON.stringify({operationRef:step.operationRef,runId:step.runId,resultId:step.resultId,
    admissionCount:step.admissionCount,run:(await f.runs())[0],slot:(await f.rows('runs')).find(row=>row.tag==='slot')}));
});

test('J06 Authority: new Host reads original Result with four or six pin fields and no old iframe Map',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare(),run=await f.authority.startControllerRun(f.request(a),f.sender);
  await f.finish(run);
  const result=await f.inspect();
  assert.equal(result.semantic,'FOUND_RESULT');assert.equal(result.runId,run.runId);
  assert.equal(result.resultId,run.resultId);assert.equal(result.result.outcome.ok,true);
  assert.equal(result.continuationApproved,false);assert.equal(result.slotAvailable,false);
  const six=await f.inspect('step-a',{binding:{...f.binding,instanceId:'iframe-new'}});
  assert.equal(six.resultId,result.resultId);
  assert.equal((await f.runs()).length,1);
});

test('J06 Authority: running row and Host presence never assert Worker liveness',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(a),f.sender);
  const found=await f.inspect();
  assert.equal(found.runId,run.runId);assert.equal(found.semantic,'UNKNOWN');
  const stopped=await f.cancel();
  assert.equal(stopped.semantic,'UNKNOWN');
});

test('J06 Authority: cancel before PREPARE or SUBMIT fences delayed requests durably',async()=>{
  const f=await recoveryAuthorityFixture();
  assert.equal((await f.cancel('before-prepare')).semantic,'UNKNOWN');
  await assert.rejects(f.prepare('before-prepare'),{code:'E_CANCELLED'});
  const prepared=await f.prepare('before-submit');
  assert.equal((await f.cancel('before-submit')).semantic,'NOT_SUBMITTED_FENCED');
  await assert.rejects(f.authority.startControllerRun(f.request(prepared,'before-submit'),f.sender),{code:'E_CANCELLED'});
  assert.equal((await f.runs()).length,0);
});

test('J06 Authority: lost SUBMIT ACK, cancellation and late Result retain one Run and held slot',async t=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender); // Deliberately discard ACK at the caller.
  assert.equal((await f.inspect()).runId,run.runId);
  await f.cancel();
  const fenced=(await f.runs())[0];assert.equal(fenced.cancelSeq,1);assert.equal(fenced.ownerEpoch,2);
  await f.finish(run,'succeeded',{workerRetired:false});
  const late=await f.inspect();
  assert.equal(late.semantic,'FOUND_RESULT');assert.equal(late.result.outcome.ok,false);
  assert.equal(late.result.outcome.error.code,'E_CANCELLED');
  assert.equal(late.workerRetired,false);assert.equal(late.resourceReleased,false);assert.equal(late.slotAvailable,false);
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'pending');
  const b=await f.prepare('step-b');
  await assert.rejects(f.authority.startControllerRun(f.request(b,'step-b'),f.sender2),{code:'E_OWNER'});
  assert.equal((await f.runs()).length,1);
  t.diagnostic(JSON.stringify({runId:late.runId,resultId:late.resultId,cancelSeq:late.cancelSeq,
    ownerEpoch:late.runOwnerEpoch,result:late.result,workerRetired:late.workerRetired,
    retirementState:late.retirementState,slotAvailable:late.slotAvailable}));
});

test('J06 Authority: lost PREPARE ACK keeps the original reference; changed params, target and Task pin conflict',async()=>{
  const f=await recoveryAuthorityFixture();
  const first=await f.prepare();
  assert.equal((await f.prepare()).operationRef,first.operationRef);
  for(const extra of [{paramsDigest:'f'.repeat(64)},
    {target:{...f.target,documentId:'different-document'}},
    {binding:{...f.binding,task:{...f.task,generation:2}}}])
    await assert.rejects(f.prepare('step-a',extra),{code:'E_REQUEST_CONFLICT'});
  const row=(await f.rows('commandJournal')).find(row=>row.tag==='task-delegation-step');
  assert.equal(row.operationRef,first.operationRef);assert.equal(row.admissionCount,0);
  assert.equal((await f.runs()).length,0);
});

test('J06 Authority: delayed old SUBMIT after cancel returns only the original association and RunHost never replays it',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(a),f.sender);
  await f.cancel();
  const duplicate=await f.authority.startControllerRun(f.request(a),f.sender);
  assert.equal(duplicate.runId,run.runId);assert.equal(duplicate.duplicate,true);
  assert.equal((await f.runs()).length,1);
  assert.equal((await f.runs())[0].cancelSeq,1);
  let workers=0;
  const host=createRunHost({api:f.api,client:{ready:Promise.resolve(),controller:{
    startControllerRun:request=>f.authority.startControllerRun(request,f.sender2)}},
    document:null,templateModuleFactory:null,controllerFactory:()=>{workers++;throw Error('Duplicate must never execute');}});
  const request=f.request(a),{paramsWire,...input}=request;
  await assert.rejects(host.start({...input,params:f.params}),{code:'E_EFFECT_UNKNOWN'});
  assert.equal(workers,0);assert.equal(host.executionPending,false);await host.dispose();
});

test('J06 Authority: completed Result cannot free B before Worker, retirement and slot release',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(a),f.sender);
  await f.finish(run,'succeeded',{workerRetired:false});
  const b=await f.prepare('step-b');
  await assert.rejects(f.authority.startControllerRun(f.request(b,'step-b'),f.sender2),{code:'E_OWNER'});
  await f.finish(run,'succeeded',{workerRetired:true});
  await assert.rejects(f.authority.startControllerRun(f.request(b,'step-b'),f.sender2),{code:'E_OWNER'});
  assert.equal((await f.inspect()).continuationApproved,false);
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'released');
  assert.equal((await f.inspect()).slotAvailable,true);
  assert.equal((await f.inspect()).continuationApproved,false);
});

test('J06 Authority: missing step journal, tombstoned Run and unfinished legacy Run never become new executions',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(a),f.sender);
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  await f.storage.transaction(['commandJournal'],'readwrite',tx=>tx.delete('commandJournal',
    'task-delegation-step:'+canonical([f.binding.appId,f.binding.packageHash,f.binding.generation,'step-a'])));
  assert.equal((await f.inspect()).semantic,'UNKNOWN');
  await assert.rejects(f.prepare(),{code:'E_EFFECT_UNKNOWN'});
  await f.storage.transaction(['runs'],'readwrite',async tx=>{
    const row=await tx.get('runs',run.runId);row.tombstoned=true;await tx.put('runs',row,row.runId);
  });
  await assert.rejects(f.prepare(),{code:'E_EFFECT_UNKNOWN'});
  await f.storage.transaction(['runs'],'readwrite',async tx=>{
    const row=await tx.get('runs',run.runId);delete row.taskDelegationStep;
    row.retirementState='fenced';await tx.put('runs',row,row.runId);
  });
  await assert.rejects(f.prepare('new-alias'),{code:'E_EFFECT_UNKNOWN'});
  assert.equal((await f.runs()).length,1);
});

test('J06 Authority: missing Result or admission journal never permits a replacement Run',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);await f.finish(run);
  await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  await f.storage.transaction(['results','commandJournal'],'readwrite',async tx=>{
    await tx.delete('results',run.resultId);
    await tx.delete('commandJournal','delegated-start:'+prepared.operationRef);
  });
  const found=await f.inspect();assert.equal(found.semantic,'UNKNOWN');assert.equal(found.runId,run.runId);
  assert.equal((await f.prepare()).operationRef,prepared.operationRef);
  await assert.rejects(f.authority.startControllerRun(f.request(prepared),f.sender2),{code:'E_CANCELLED'});
  assert.equal((await f.runs()).length,1);
});

test('J06 Authority: expired or backward-clock requests cannot allocate a second Run',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(a),f.sender);
  const original=f.clock.now;
  f.clock.now=()=>a.deadlineAt+1;
  await assert.rejects(f.authority.startControllerRun(f.request(a),f.sender2),{code:'E_TIMEOUT'});
  assert.equal((await f.inspect()).semantic,'UNKNOWN');
  f.clock.now=()=>original()-86400000;
  await assert.rejects(f.prepare(),{code:'E_TIMEOUT'});
  assert.equal((await f.inspect()).runId,run.runId);assert.equal((await f.runs()).length,1);
});

test('J06 Authority: capacity refusal does not prepare a replacement or evict a cancel fence',async()=>{
  const f=await recoveryAuthorityFixture();await f.cancel('cancelled');
  await f.storage.transaction(['runs'],'readwrite',async tx=>{
    for(let i=0;i<2048;i++)await tx.put('runs',{tag:'history-fixture'},'history-'+i);
  });
  await assert.rejects(f.prepare(),{code:'E_BUDGET'});
  await assert.rejects(f.prepare('cancelled'),{code:'E_CANCELLED'});
  assert.equal((await f.rows('commandJournal')).filter(row=>row.tag==='task-delegation-step').length,1);
  assert.equal((await f.runs()).length,0);
});

test('J06 Authority: failed SUBMIT transaction rolls back Run, slot and admission while keeping PREPARE',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const transaction=f.storage.transaction;let fail=true;
  f.storage.transaction=(names,mode,body)=>transaction(names,mode,tx=>body({...tx,put:async(name,value,key)=>{
    await tx.put(name,value,key);
    if(fail&&value.tag==='task-delegation-step'&&value.state==='submitted'){
      fail=false;throw err('E_QUOTA');
    }
  }}));
  await assert.rejects(f.authority.startControllerRun(f.request(prepared),f.sender),{code:'E_QUOTA'});
  assert.equal((await f.runs()).length,0);
  assert.equal((await f.rows('runs')).find(row=>row.tag==='slot').currentRunId,null);
  assert.equal((await f.prepare()).operationRef,prepared.operationRef);
  await f.authority.startControllerRun(f.request(prepared),f.sender2);
  assert.equal((await f.runs()).length,1);
});

test('J06 Authority: missing history and arbitrary Run selectors expose no result and never submit',async()=>{
  const f=await recoveryAuthorityFixture();
  assert.equal((await f.inspect('missing')).semantic,'UNKNOWN');
  await assert.rejects(f.inspect('missing',{runId:'arbitrary-run'}),{code:'E_SCHEMA'});
  assert.equal((await f.runs()).length,0);
});

for(const change of ['disabled','uninstalled','generation','reinstalled','upgrade'])
  test('J06 Authority: Task '+change+' rejects admission and original Result disclosure',async()=>{
    const f=await recoveryAuthorityFixture(),a=await f.prepare();
    const run=await f.authority.startControllerRun(f.request(a),f.sender);await f.finish(run);
    await f.authority.retireControllerTarget({runId:run.runId},f.sender);
    await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const key=installedKey('tool:extension',f.task.taskId),row=await tx.get('frameworkKV',key);
      if(change==='uninstalled')return tx.delete('frameworkKV',key);
      if(change==='disabled')row.enabled=false;
      if(change==='generation')row.authorization.generation++;
      if(change==='reinstalled')row.authorization.installationId=crypto.randomUUID();
      if(change==='upgrade')row.version='1.0.1';
      await tx.put('frameworkKV',row,key);
    });
    await assert.rejects(f.inspect(),{code:'E_PERMISSION'});
    await assert.rejects(f.authority.startControllerRun(f.request(a),f.sender2),
      error=>['E_PERMISSION','E_REVISION'].includes(error.code));
    assert.equal((await f.runs()).length,1);
  });

for(const change of ['disabled','uninstalled','epoch','upgrade'])
  test('J06 Authority: App '+change+' rejects new admission and original Result disclosure',async()=>{
    const f=await recoveryAuthorityFixture(),a=await f.prepare();
    const run=await f.authority.startControllerRun(f.request(a),f.sender);await f.finish(run);
    if(change==='disabled')f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
    if(change==='uninstalled')f.local[SIDEBAR_TOOL_STORE]=[];
    if(change==='epoch')f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='new-epoch';
    if(change==='upgrade')f.local[SIDEBAR_TOOL_STORE][0].version='1.0.1';
    await assert.rejects(f.inspect(),error=>['E_TOOL_DISABLED','E_OWNER','E_PERMISSION'].includes(error.code));
    await assert.rejects(f.authority.startControllerRun(f.request(a),f.sender2),
      error=>['E_TOOL_DISABLED','E_OWNER','E_PERMISSION'].includes(error.code));
    assert.equal((await f.runs()).length,1);
  });

test('J06 Authority: large Result refuses one-frame disclosure without replacing the original Run',async()=>{
  const f=await recoveryAuthorityFixture(),a=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(a),f.sender);
  await f.finish(run,'succeeded',{valueWire:encodeValue('x'.repeat(140000))});
  await assert.rejects(f.inspect(),{code:'E_BUDGET'});
  assert.equal((await f.runs()).length,1);
});

test('J06 Host: repeated manual start reauthorizes a recovered Result after Task revocation',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);await f.finish(run);
  const service=createTaskDelegationHost({api:f.api,appId:f.binding.appId,instanceId:'iframe-new',assertInstance:()=>{},
    client:{request:(method,input)=>f.authority[method](input,f.sender2)},
    host:{start:()=>{throw Error('Existing Run must not be started');},stop:async()=>{}},
    currentPageTarget:{capture:()=>({tabId:2,frameId:0,documentId:'doc-top',url:'https://a.example/page',windowId:1}),revalidate:async()=>{}}});
  const input={clientRequestId:'step-a',task:f.task,params:f.params};
  assert.equal((await service.request('tasks.start',input,{verifiedUserActivation:true})).result.outcome.ok,true);
  await f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
  await assert.rejects(service.request('tasks.start',input,{verifiedUserActivation:true}),{code:'E_PERMISSION'});
  assert.equal((await f.runs()).length,1);
});

test('J06 Host: disposed replacement iframe cannot deliver a delayed recovered Result',async()=>{
  let enter,release;
  const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
  const f=fixture({onInspect:()=>{enter();return gate;}}),old=f.create('iframe-old');
  await old.request('tasks.start',startInput('step-a'),{verifiedUserActivation:true});
  const next=f.create('iframe-new'),pending=next.request('tasks.start',startInput('step-a'),{verifiedUserActivation:true});
  await entered;await next.dispose();release();
  await assert.rejects(pending,{code:'E_OWNER'});assert.equal(f.starts,1);
});

test('J06 Authority: Host loss without retirement proof keeps the original Run UNKNOWN and blocks B',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);
  await f.authority.loseHost(f.registration.registrationId);
  const found=await f.inspect();
  assert.equal(found.runId,run.runId);assert.equal(found.semantic,'UNKNOWN');
  assert.equal(found.resourceReleased,false);assert.equal(found.slotAvailable,false);
  const b=await f.prepare('step-b',{binding:{...f.binding,instanceId:'iframe-new'}},f.sender2);
  await assert.rejects(f.authority.startControllerRun(f.request(b,'step-b'),f.sender2),{code:'E_OWNER'});
  assert.equal((await f.runs()).length,1);
});

test('J06 Authority: rebuilding Authority preserves original Run and completed Result with no resubmission',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);await f.finish(run);
  const restarted=createRunAuthority({cloudFactory:createCloudService,storage:f.storage,api:f.api,
    session:'browser-session',clock:f.clock,loadBuiltin:async()=>fakeBuiltinSource});
  const found=await restarted.inspectDelegatedStep({binding:f.binding2,clientRequestId:'step-a'},f.sender2);
  assert.equal(found.semantic,'FOUND_RESULT');assert.equal(found.runId,run.runId);assert.equal(found.resultId,run.resultId);
  assert.equal((await f.runs()).length,1);assert.equal(found.continuationApproved,false);
});

const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
test('J06 lifecycle: one operation verifies its locked installation once and keeps site permission checks',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);
  const get=f.api.storage.local.get,contains=f.api.permissions.contains;
  let installationReads=0,permissionChecks=0;
  f.api.storage.local.get=async keys=>{
    if(keys.includes(SIDEBAR_TOOL_STORE))installationReads++;
    return get(keys);
  };
  f.api.permissions.contains=async query=>{permissionChecks++;return contains(query);};
  await f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender);
  assert.equal(installationReads,1,'The held lifecycle lock keeps the verified package immutable for this operation');
  assert.ok(permissionChecks>1,'Chrome site access must still be checked before and after native dispatch');

  f.beforeReply(()=>f.setAllowed(false));
  await assert.rejects(f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender),
    error=>error.code==='E_PERMISSION');
});

test('J06 lifecycle: operation verification remains serialized with the actual App disable writer',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);
  const entered=gate(),release=gate(),send=f.api.tabs.sendMessage,set=f.api.storage.local.set;
  let wrote=false;
  f.api.tabs.sendMessage=(id,message,options,callback)=>{
    if(message.action==='execute'){
      entered.resolve();
      release.promise.then(()=>send(id,message,options,callback));
    }else send(id,message,options,callback);
  };
  f.api.storage.local.set=async rows=>{wrote=true;return set(rows);};
  const pending=f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender);
  await entered.promise;
  const disabled=setInstalledSidebarToolEnabled({api:f.api,lockManager:navigator.locks,tool:f.tool,enabled:false});
  try{await new Promise(setImmediate);assert.equal(wrote,false);}
  finally{release.resolve();await pending;await disabled;}
  await assert.rejects(f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender),
    error=>error.code==='E_TOOL_DISABLED');
});

test('J06 lifecycle: actual App disable writer fences a waiting SUBMIT under the same Web Lock',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare(),entered=gate(),release=gate();
  const set=f.api.storage.local.set;let settled=false;
  f.api.storage.local.set=async rows=>{
    if(Object.hasOwn(rows,SIDEBAR_TOOL_ENABLE_STORE)){entered.resolve();await release.promise;}
    return set(rows);
  };
  const disabled=setInstalledSidebarToolEnabled({api:f.api,lockManager:navigator.locks,tool:f.tool,enabled:false});
  await entered.promise;
  const pending=f.authority.startControllerRun(f.request(prepared),f.sender2);
  pending.then(()=>settled=true,()=>settled=true);
  try{await new Promise(setImmediate);assert.equal(settled,false);}
  finally{release.resolve();}
  await disabled;await assert.rejects(pending,{code:'E_TOOL_DISABLED'});
  assert.equal((await f.runs()).length,0);
});

for(const method of ['inspectDelegatedStep','snapshotControllerRun'])
  test('J06 lifecycle: '+method+' serializes result authorization with the actual App disable writer',async()=>{
    const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
    const run=await f.authority.startControllerRun(f.request(prepared),f.sender);await f.finish(run);
    const entered=gate(),release=gate(),transaction=f.storage.transaction;
    let blocked=false,wrote=false;
    f.storage.transaction=(names,mode,body)=>transaction(names,mode,tx=>body({...tx,get:async(name,key)=>{
      const row=await tx.get(name,key);
      if(!blocked&&name==='frameworkKV'&&mode==='readonly'&&key===installedKey('tool:extension',f.task.taskId)){
        blocked=true;entered.resolve();await release.promise;
      }
      return row;
    }}));
    const set=f.api.storage.local.set;
    f.api.storage.local.set=async rows=>{wrote=true;return set(rows);};
    const pending=method==='inspectDelegatedStep'?f.inspect():f.authority.snapshotControllerRun({runId:run.runId},f.sender2);
    await entered.promise;
    const disabled=setInstalledSidebarToolEnabled({api:f.api,lockManager:navigator.locks,tool:f.tool,enabled:false});
    try{await new Promise(setImmediate);assert.equal(wrote,false,'Result delivery must share the writer lifecycle lock');}
    finally{release.resolve();await pending;await disabled;}
    await assert.rejects(f.inspect(),{code:'E_TOOL_DISABLED'});
    const after=await f.authority.snapshotControllerRun({runId:run.runId},f.sender2);
    assert.equal(after.results.length,0);assert.ok(after.resultDeliveryDenied.includes(run.runId));
  });

test('J06 lifecycle: a single unrelated Result does not reacquire a held App lock from delegated history',async t=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);await f.finish(run);
  const unrelated=(await f.rows('runs')).find(row=>row.tag==='controller-run'&&!row.taskDelegation);
  const name='opendesk.sidebar-tools:tool:'+f.tool.id,request=navigator.locks.request.bind(navigator.locks);
  let held=false;
  // App-service settlement already owns this non-reentrant lifecycle lock.
  // Fail an attempted nested acquisition immediately instead of hanging Node.
  t.mock.method(navigator.locks,'request',(key,...args)=>{
    if(held&&key===name)return Promise.reject(err('E_TEST_REENTRANT_LOCK'));
    return request(key,...args);
  });
  const snapshot=await request(name,async()=>{
    held=true;try{return await f.authority.snapshotControllerRun({runId:unrelated.runId},f.sender2);}
    finally{held=false;}
  });
  assert.equal(snapshot.results.length,1);assert.equal(snapshot.results[0].runId,unrelated.runId);
});

test('J06 lifecycle: single-run settlement and read do not query unrelated historical grants',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const run=await f.authority.startControllerRun(f.request(prepared),f.sender);
  const historical=(await f.rows('runs')).find(row=>row.tag==='controller-run'&&!row.taskDelegation);
  await f.storage.transaction(['runs'],'readwrite',async tx=>{
    const old=await tx.get('runs',historical.runId);
    old.networkOrigins=['https://unrelated-history.example'];
    await tx.put('runs',old,old.runId);
  });
  const contains=f.api.permissions.contains,queries=[];
  f.api.permissions.contains=async query=>{queries.push(query);return contains(query);};
  const settled=await f.finish(run);
  assert.equal(settled.result.outcome.ok,true);
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'released');
  const snapshot=await f.authority.snapshotControllerRun({runId:run.runId},f.sender);
  assert.equal(snapshot.results.length,1);
  assert.equal(snapshot.results[0].runId,run.runId);
  assert.equal(queries.some(query=>query.origins.includes('https://unrelated-history.example/*')),false);

  // The requested Run still loses its result when its own site grant is gone.
  f.setAllowed(false);
  const denied=await f.authority.snapshotControllerRun({runId:run.runId},f.sender);
  assert.equal(denied.results.length,0);
  assert.ok(denied.resultDeliveryDenied.includes(run.runId));
});

test('J06 lifecycle: real successful app-service finish and retirement work with the same App delegated history',async()=>{
  const f=await recoveryAuthorityFixture(),prepared=await f.prepare();
  const history=await f.authority.startControllerRun(f.request(prepared),f.sender);
  await f.finish(history);await f.authority.retireControllerTarget({runId:history.runId},f.sender);
  const js='async function main(){return await browser.storage.local.getQuota();}';
  Object.assign(f.tool,{capabilities:['tasks.run','browser.storage','browser.scheduler'],
    background:{kind:'opendesk.app-service.v1',js,sha256:await digestUtf8(js)}});
  const epoch=crypto.randomUUID();f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]=epoch;
  f.api.storage.session=f.api.storage.local;f.api.storage.onChanged=authorityEvent();
  const alarms=new Map();
  f.api.alarms={getAll:async()=>[...alarms.values()],create:async(name,{when})=>alarms.set(name,{name,scheduledTime:when}),
    clear:async name=>alarms.delete(name)};
  const sender={...f.sender,url:f.api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH),documentId:'service-host-doc'};
  delete sender.tab;
  const contexts=f.api.runtime.getContexts;
  f.api.runtime.getContexts=async query=>[...await contexts(query),{contextType:'OFFSCREEN_DOCUMENT',
    documentId:sender.documentId,documentUrl:sender.url,frameId:0,incognito:false}];
  await f.register(sender,'service-host');
  const {binding}=await readAppServiceInstallation(f.api,f.tool.id);
  const owner={kind:'installed-tool-owned',toolId:f.tool.id,toolVersion:f.tool.version,
    packageHash:binding.packageHash,epoch,installEpoch:epoch};
  let time=Date.now();f.clock.now=()=>time;
  const request={service:'background',schedule:{kind:'interval',expression:'1m'}};
  await f.authority.schedules.create(request,owner,{kind:'trusted-app-service-schedule-intent-v1',request});
  time+=61000;
  const {fires:[fire]}=await f.authority.listDueSchedules({profile:'app-service'},sender);assert.ok(fire);
  const run=await f.authority.startControllerRun({profile:'app-service',appId:f.tool.id,scheduledFireId:fire.fireId,
    expectedScheduleOwner:fire.expectedScheduleOwner,requestId:fire.fireId,deadlineAt:time+30000},sender);
  const settled=await f.authority.finishControllerRun({runId:run.runId,requestId:'service-finish',
    status:'succeeded',valueWire:encodeValue(true),workerRetired:true},sender);
  assert.equal(settled.result.outcome.ok,true);
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},sender)).state,'released');
  assert.equal((await f.rows('runs')).find(row=>row.tag==='slot').currentRunId,null);
  assert.equal((await f.rows('results')).filter(row=>row.runId===history.runId).length,1);
});
test('App Controller starts and recovers the original result without any Task lookup',async()=>{
  const f=fixture(true),one=f.create('app-frame-1');
  assert.deepEqual(await one.request('controllers.read',{}),{controller:{sourceHash:sha}});
  const input={clientRequestId:'app-step',params:{query:'OpenDesk'}};
  await assert.rejects(one.request('controllers.start',input),{code:'E_USER_GESTURE_REQUIRED'});
  const started=await one.request('controllers.start',input,{verifiedUserActivation:true});
  assert.equal(started.runId,'run-1');
  const two=f.create('app-frame-2');
  const result=await two.request('controllers.read',{clientRequestId:'app-step'});
  assert.equal(result.runId,started.runId);assert.equal(result.semantic,'FOUND_RESULT');
  await two.request('controllers.stop',{clientRequestId:'app-step'});
  assert.equal(f.starts,1);
  f.revoke();
  await assert.rejects(two.request('controllers.read',{clientRequestId:'app-step'}),{code:'E_TOOL_DISABLED'});
});

test('App Controller stop before prepare survives a new frame and never dispatches',async()=>{
  const f=fixture(true),one=f.create('app-frame-1');
  await one.request('controllers.stop',{clientRequestId:'early'});
  const two=f.create('app-frame-2');
  await assert.rejects(two.request('controllers.start',{clientRequestId:'early',params:{}},
    {verifiedUserActivation:true}),{code:'E_CANCELLED'});
  assert.equal(f.starts,0);
});

test('a live request cannot change between Task and App Controller operations',async()=>{
  const f=fixture(true),one=f.create('app-frame-1');
  await one.request('controllers.start',{clientRequestId:'same',params:{}},{verifiedUserActivation:true});
  await assert.rejects(one.request('tasks.stop',{clientRequestId:'same'}),{code:'E_REQUEST_CONFLICT'});
  assert.equal(f.starts,1);assert.equal(f.stops,0);
});
