import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {createCloudService} from '../../src/cloud-control/service.js';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {CONTRACT_VERSION,CONTRACT_HASH,digestUtf8} from '../../src/platform/protocol.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';
import {createTaskPackage,TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {createNativeAgentHostAdapter} from '../../src/native-agent/host-adapter.js';
import {createRunHost} from '../../src/run-host.js';
import {createNativeAgentService} from '../../src/native-agent/service-worker.js';
import {AGENT_ENABLED_KEY,agentDigest,agentValidateRequest} from '../../src/native-agent/protocol.js';
import {requestShape} from '../../native-agent/wire.mjs';
import {readTaskDelegationApp} from '../../src/platform/tasks/delegation-installation.js';
import {CONTROLLER_SOURCE_LIMIT} from '../../src/platform/source-budgets.js';
import {BUDGETS} from '../../src/platform/protocol.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

// Node component fixture adapted from k3-controller-authority; Chrome callbacks are doubles.
function serialStore() {
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
const event = () => ({addListener() {}, removeListener() {}});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture() {
  const storage = serialStore(), calls = [], frames = new Map([[2, [{frameId:0, documentId:'doc-top', documentLifecycle:'active', errorOccurred:false, url:'https://a.example/page'},
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
      }, onRemoved:event()},
    webNavigation:{getAllFrames({tabId}, callback) { const value=(frames.get(tabId) || []).filter(f=>!f.url.startsWith('chrome-extension:')); if (callback) queueMicrotask(() => callback(value)); return Promise.resolve(value); },
      onCommitted:event(),onCompleted:event(),onDOMContentLoaded:event(),onErrorOccurred:event()},
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
async function installedTaskFixture({permissions=['page.automation'],deadlineMs=60000}={}){
  const f=await fixture(),source='async function main(){return await page.title();}';
  const revision=await f.commit(source),proof=await f.start(revision);
  const operation=(run,kind,method,args=[])=>({requestId:crypto.randomUUID(),identity:run.identity,
    revision:run.revision,target:run.target,operation:{kind,method,args:controlEncode(args)}});
  await f.authority.controllerOperation({envelope:operation(proof,'packaged','title')},f.sender);
  await f.finish(proof);await f.authority.retireControllerTarget({runId:proof.runId},f.sender);
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'authorization.demo',version:'1.0.0',...(deadlineMs===null?{}:{deadlineMs}),title:'Authorization fixture',
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


test('Controller source-specific admission accepts exact large source with bounded metadata',async()=>{
  const sourceOf=bytes=>'/*'+'x'.repeat(bytes-13)+'*/return 1;';
  assert.equal(Buffer.byteLength(sourceOf(1146776)),1146776);
  for(const sourceUtf8 of [
    sourceOf(1146776),
    sourceOf(CONTROLLER_SOURCE_LIMIT),
    '/*'+'\u0001'.repeat(100000)+'*/return 1;'
  ]){
    const f=await fixture();
    const request={requestId:crypto.randomUUID(),source:{kind:'draft',sourceUtf8},paramsWire:encodeValue({}),
      target:{mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},deadlineAt:Date.now()+30000};
    const claim=await f.authority.startControllerRun(request,f.sender);
    assert.equal(claim.sourceUtf8,sourceUtf8);assert.equal(claim.revision.sourceHash,await digestUtf8(sourceUtf8));
    assert.equal((await f.authority.startControllerRun(request,f.sender)).runId,claim.runId);
  }
});

test('Controller source allowance preserves UTF-8, admission metadata and ordinary value limits',async()=>{
  const f=await fixture();
  const request={requestId:crypto.randomUUID(),source:{kind:'draft',sourceUtf8:'return 1;'},paramsWire:encodeValue({}),
    target:{mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},deadlineAt:Date.now()+30000};
  for(const sourceUtf8 of ['x'.repeat(CONTROLLER_SOURCE_LIMIT+1),'中'.repeat(Math.ceil(CONTROLLER_SOURCE_LIMIT/3))])
    await assert.rejects(f.authority.startControllerRun({...request,source:{kind:'draft',sourceUtf8}},f.sender),{code:'E_LIMIT'});
  await assert.rejects(f.authority.startControllerRun({...request,source:{kind:'draft',sourceUtf8:'\u0001'.repeat(800000)}},f.sender),{code:'E_LIMIT'});
  await assert.rejects(f.authority.startControllerRun({...request,source:{kind:'draft',sourceUtf8:'\ud800'}},f.sender),{code:'E_VALUE_SERIALIZATION'});
  await assert.rejects(f.authority.startControllerRun({...request,paramsWire:encodeValue({text:'x'.repeat(BUDGETS.maxRawFrameBytes)})},f.sender),{code:'E_LIMIT'});
  assert.throws(()=>encodeValue('x'.repeat(BUDGETS.maxBatchBytes)),{code:'E_VALUE_SERIALIZATION'});
  assert.equal(BUDGETS.maxRawFrameBytes,131072);assert.equal(BUDGETS.maxBatchBytes,262144);
  assert.equal((await f.rows('runs')).filter(row=>row.tag==='controller-run').length,0);
});

test('fixed Task delegation Authority denies effects and durable results after App revocation and regrant',async()=>{
  const f=await installedTaskFixture();
  const pin=Object.fromEntries(['taskId','version','manifestHash','contentHash'].map(key=>[key,f.resolved[key]]));
  const tool={format:'opendesk.sidebar-tool.v2',id:'delegation-authority-test',version:'1.0.0',title:'Delegation',description:'Authority regression',
    capabilities:['tasks.run'],delegatedTasks:[pin],html:'<main>Run</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}};
  const local={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:'epoch-one'}};
  f.api.storage={local:{get:async keys=>Object.fromEntries(keys.map(key=>[key,structuredClone(local[key])]))}};
  const task=Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation'].map(key=>[key,f.resolved[key]]));
  const binding={...await readTaskDelegationApp(f.api,tool.id),instanceId:'original-opaque-frame',task};
  const run=await f.startTask(f.resolved,{taskDelegation:binding});
  await f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender);
  local[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};
  await assert.rejects(f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender),{code:'E_TOOL_DISABLED'});
  assert.ok((await f.authority.snapshotControllerRun({runId:run.runId},f.sender)).resultDeliveryDenied.includes(run.runId));
  local[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:true};local[TOOL_REVOCATION_EPOCHS_STORE][tool.id]='epoch-two';
  await assert.rejects(f.authority.controllerOperation({envelope:f.operation(run,'packaged','title')},f.sender),{code:'E_PERMISSION'});
  await assert.rejects(f.finish(run),{code:'E_PERMISSION'});
  await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const snapshot=await f.authority.snapshotControllerRun({runId:run.runId},f.sender);
  assert.equal(snapshot.results.length,0);assert.ok(snapshot.resultDeliveryDenied.includes(run.runId));
  const next={...await readTaskDelegationApp(f.api,tool.id),instanceId:'new-opaque-frame',task:{...task,generation:999}};
  await assert.rejects(f.startTask(f.resolved,{taskDelegation:next}),{code:'E_REVISION'});
});

async function adapterFixture(t,options){
  const f=await installedTaskFixture(options);
  const target={status:'available',windowId:5,tabId:2,frameId:0,documentId:'doc-top',url:'https://a.example/page',origin:'https://a.example'};
  f.tabs.get(2).windowId=5;f.tabs.get(2).active=true;
  f.api.tabs.query=async()=>[f.tabs.get(2)];
  const started=[],executed=[];
  const client={ready:Promise.resolve(),registration:f.registration,
    request:(method,params)=>f.authority[method](params,f.sender),
    subscribeNativeAgent:()=>()=>{},replyNativeAgent(){},
    controller:Object.fromEntries(['startControllerRun','stopControllerRun','snapshotControllerRun','finishControllerRun','retireControllerTarget','controllerOperation']
      .map(method=>[method,params=>f.authority[method](params,f.sender)]))};
  let finish;
  const host=createRunHost({client,api:f.api,document:{},controllerFactory:()=>({
    execute:(source,params)=>{executed.push({source,params});return new Promise(resolve=>{finish=resolve;});},stop:()=>finish?.({status:'stopped',workerRetired:true}),retired:Promise.resolve({acknowledged:true}),dispose:async()=>{},
  })});
  const start=host.start;
  host.start=async request=>{started.push(structuredClone(request));return start(request);};
  const currentPageTarget={ready:Promise.resolve(),refresh:async()=>{},capture:()=>({...target}),revalidate:async()=>{}};
  const adapter=createNativeAgentHostAdapter({client,host,currentPageTarget,api:f.api});
  t.after(async()=>{finish?.({status:'succeeded',value:controlEncode(42)});adapter.dispose();await host.dispose();});
  const request={method:'run.start',requestId:crypto.randomUUID(),params:{target,params:{no:false,zero:0},
    source:{kind:'installed-task',taskId:f.resolved.taskId,version:f.resolved.version,sourceHash:f.resolved.contentHash}}};
  return {...f,client,host,adapter,target,request,started,currentPageTarget,executed};
}

test('installed-task uses the real saved RunHost without a sourceProvider and lists metadata only',async t=>{
  const f=await adapterFixture(t);
  const list=await f.adapter.handle({method:'task.list',params:{}});
  assert.deepEqual(list.tasks,[{taskId:f.base.taskId,version:'1.0.0',sourceHash:f.resolved.contentHash,
    manifestHash:f.resolved.manifestHash,permissions:['page.automation'],siteOrigins:['https://a.example'],
    deadlineMs:60000,enabled:true,generation:f.resolved.generation,installationId:f.resolved.installationId}]);
  const before=Date.now();
  f.request.params.expectedTaskGeneration=999;
  f.request.params.expectedTaskInstallationId='forged';
  f.request.params.permissions=['cookies'];
  const claim=await f.adapter.handle(f.request);
  assert.equal(f.executed[0].source,'async function main(){return await page.title();}');
  assert.deepEqual(f.executed[0].params,{no:false,zero:0});
  assert.equal(claim.sourceKind,'saved');assert.equal(claim.completion,'PENDING');
  assert.deepEqual(f.started[0].source,{kind:'saved',scriptId:f.resolved.scriptId,revision:1,contentHash:f.resolved.contentHash});
  assert.equal(f.started[0].expectedTaskGeneration,f.resolved.generation);
  assert.equal(f.started[0].expectedTaskInstallationId,f.resolved.installationId);
  assert.ok(f.started[0].deadlineAt>=before+60000&&f.started[0].deadlineAt<=Date.now()+60000);
  const snapshot=await f.adapter.handle({method:'run.get',params:{runId:claim.runId}});
  assert.equal(snapshot.run.runId,claim.runId);
  await f.adapter.handle({method:'run.stop',requestId:'stop-installed',params:{runId:claim.runId}});
});

for(const change of ['taskId','version','sourceHash','missing-taskId','missing-version','missing-sourceHash','mismatched-resolver-hash','mismatched-manifest-hash'])
 test(`installed pin rejection: ${change}`,async t=>{
  const f=await adapterFixture(t);
  if(change.startsWith('missing-'))delete f.request.params.source[change.slice(8)];
  else if(change==='mismatched-resolver-hash'||change==='mismatched-manifest-hash'){
    const request=f.client.request;
    f.client.request=async(method,p)=>{const result=await request(method,p);if(method==='resolveInstalledTask'){
      if(change==='mismatched-resolver-hash')result.contentHash='f'.repeat(64);
      else result.manifest.program.sourceHash='f'.repeat(64);
    }return result;};
  }else f.request.params.source[change]=change==='sourceHash'?'f'.repeat(64):change==='version'?'9.0.0':'other';
  await assert.rejects(f.adapter.handle(f.request));assert.equal(f.started.length,0);
 });

for(const boundary of ['disabled','upgrade','revoke-regrant','params','origin','document','chrome-permission','slot'])
 test(`real Authority/adaptor rejects ${boundary}`,async t=>{
  const f=await adapterFixture(t),install=f.installClaim(f.resolved);
  if(boundary==='disabled')await f.authority.setInstalledTaskEnabled({...install,enabled:false},f.sender);
  if(boundary==='upgrade'||boundary==='revoke-regrant')f.currentPageTarget.revalidate=async()=>{
    if(boundary==='upgrade')await f.installPackage({...f.manifest,version:'1.0.1'},f.resolved);
    else {
      await f.authority.setInstalledTaskEnabled({...install,enabled:false},f.sender);
      await f.authority.setInstalledTaskEnabled({...install,expectedGeneration:install.expectedGeneration+1,enabled:true},f.sender);
    }
  };
  if(boundary==='params')f.request.params.params={no:'wrong'};
  if(boundary==='origin'){
    f.target.url='https://b.example/page';f.target.origin='https://b.example';
    f.tabs.get(2).url=f.target.url;f.frames.get(2)[0].url=f.target.url;
  }
  if(boundary==='document')f.request.params.target={...f.target,documentId:'other'};
  if(boundary==='chrome-permission')f.setAllowed(false);
  if(boundary==='slot')await f.startTask();
  const expected={disabled:'E_PERMISSION',upgrade:'E_PERMISSION','revoke-regrant':'E_REVISION',params:'E_PARAMS',origin:'E_PERMISSION',document:'E_DOCUMENT_STALE','chrome-permission':'E_PERMISSION_REQUIRED',slot:'E_OWNER'}[boundary];
  await assert.rejects(f.adapter.handle(f.request),{code:expected});
  assert.equal((await f.rows('runs')).filter(row=>row.requestId===f.request.requestId).length,0);
 });

for(const deadline of [1000,20000,60000,60001,120001,999,1.5])test(`reviewed deadline ${deadline}`,async t=>{
  const f=await adapterFixture(t);f.request.params.deadlineMs=deadline;
  if(deadline>=1000&&deadline<=60000&&Number.isSafeInteger(deadline)){
    await f.adapter.handle(f.request);assert.ok(f.started[0].deadlineAt<=Date.now()+deadline);
  }else {await assert.rejects(f.adapter.handle(f.request),{code:'E_SCHEMA'});assert.equal(f.started.length,0);}
});

test('legacy manifest deadline defaults to 30000 and task.list traverses both protocol allowlists',async t=>{
  const f=await adapterFixture(t,{deadlineMs:null});
  await f.adapter.handle(f.request);
  assert.ok(f.started[0].deadlineAt<=Date.now()+30000);
  const envelope={v:1,kind:'request',requestId:'list',method:'task.list',params:{}};
  assert.equal(requestShape(envelope),envelope);assert.equal(agentValidateRequest(envelope),envelope);
});

const nativeEvent=()=>{const callbacks=new Set();return {addListener:cb=>callbacks.add(cb),removeListener:cb=>callbacks.delete(cb),fire:msg=>{for(const cb of callbacks)cb(msg);}};};
async function bridgeFixture(t){
  const f=await adapterFixture(t),responses=[],stored={[AGENT_ENABLED_KEY]:true};
  let dispatches=0;
  const native={onMessage:nativeEvent(),onDisconnect:nativeEvent(),postMessage:reply=>responses.push(reply),disconnect(){}};
  const port={registrationId:f.client.registration.registrationId,postMessage:async msg=>{
    if(msg.type!=='native-agent.request')return;
    dispatches++;
    let result,error;
    try{result=await f.adapter.handle(msg.request);}catch(e){error={code:e.code,message:e.message,outcome:e.outcome??'FAILED_CONFIRMED'};}
    service.acceptHostResponse(port,{type:'native-agent.response',registrationId:port.registrationId,
      requestId:msg.request.dispatchId,...(error?{error}:{result})});
  }};
  const foreign={registrationId:'foreign-host',postMessage(){throw Error('Cross-host dispatch forbidden');}};
  const api={runtime:{id:'extension',getManifest:()=>({version:'0.1.0'}),connectNative:()=>native},
    permissions:{contains:async()=>true,onRemoved:nativeEvent()},
    storage:{local:{get:async key=>({[key]:structuredClone(stored[key])}),set:async rows=>Object.assign(stored,structuredClone(rows))}}};
  const service=createNativeAgentService({api,hostPorts:new Map([['own',port],['foreign',foreign]])});
  t.after(()=>service.dispose());await service.ready;native.onMessage.fire({v:1,kind:'hello'});
  async function send(request){
    const previous=responses.length;native.onMessage.fire({v:1,kind:'request',...request});
    for(let i=0;i<200;i++){
      const reply=responses.slice(previous).find(row=>row.requestId===request.requestId);
      if(reply)return reply;
      await pause(5);
    }
    assert.fail('Native bridge response missing');
  }
  return {...f,send,port,foreign,service,dispatches:()=>dispatches};
}

test('real adapter through Native ledger: duplicate request has no second effect; get/stop/request.get reject crossHost',async t=>{
  const f=await bridgeFixture(t),registrationId=f.port.registrationId;
  const list=await f.send({requestId:'metadata',method:'task.list',params:{registrationId}});
  assert.equal(list.result.tasks[0].taskId,f.base.taskId);
  const request={...f.request,params:{...f.request.params,registrationId}};
  const receipt=await f.send(request);assert.ok(receipt.result?.runId,JSON.stringify(receipt));
  const count=f.dispatches(),executions=f.executed.length;
  assert.deepEqual(await f.send(request),receipt);
  assert.equal(f.dispatches(),count);assert.equal(f.executed.length,executions);
  const conflict=await f.send({...request,params:{...request.params,deadlineMs:1000}});
  assert.equal(conflict.error.code,'E_REQUEST_CONFLICT');assert.equal(f.dispatches(),count);
  const nested=await f.send({...request,requestId:'nested'});
  assert.equal(nested.error.code,'E_OWNER');assert.equal(f.executed.length,executions);
  for(const method of ['run.get','run.stop']){
    const denied=await f.send({method,requestId:'foreign-'+method,params:{runId:receipt.result.runId,registrationId:f.foreign.registrationId}});
    assert.equal(denied.error.code,'E_PERMISSION');
  }
  const requestDigest=await agentDigest({method:request.method,params:request.params,registrationId});
  const admission={admissionRequestId:request.requestId,admissionMethod:'run.start',registrationId,requestDigest};
  const foreign=await f.send({requestId:'foreign-receipt',method:'request.get',params:{...admission,registrationId:f.foreign.registrationId}});
  assert.equal(foreign.error.code,'E_PERMISSION');
  const observed=await f.send({requestId:'receipt',method:'request.get',params:admission});
  assert.equal(observed.result.state,'ACKNOWLEDGED');assert.equal(observed.result.admission.runId,receipt.result.runId);
  const read=await f.send({requestId:'read',method:'run.get',params:{registrationId,runId:receipt.result.runId}});
  assert.equal(read.result.run.runId,receipt.result.runId);
  const stopped=await f.send({requestId:'stop',method:'run.stop',params:{registrationId,runId:receipt.result.runId}});
  assert.ok(stopped.result,JSON.stringify(stopped));
});

test('task.list includes disabled installed metadata without allowing execution',async t=>{
  const f=await adapterFixture(t);
  await f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
  const {tasks}=await f.adapter.handle({method:'task.list',params:{}});
  assert.equal(tasks.length,1);assert.equal(tasks[0].enabled,false);
  assert.equal(tasks[0].generation,f.resolved.generation+1);
  await assert.rejects(f.adapter.handle(f.request),{code:'E_PERMISSION'});
  assert.equal(f.executed.length,0);
});
