import test from 'node:test';
import assert from 'node:assert/strict';
import {createScheduleService,scheduledHostDocumentIds} from '../../src/platform/tasks/schedule-service.js';
import {createScheduleRepository} from '../../src/platform/tasks/schedule-repository.js';
import {scheduleKey,fireKey,validateScheduleInput,validateInstalledToolScheduleRequest,
  validateTrustedAppServiceScheduleIntent,validateScheduleOwner} from '../../src/platform/tasks/schedule-contract.js';
import {readAppServiceInstallation,APP_SERVICE_OPERATIONS} from '../../src/platform/tasks/app-service-installation.js';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {operationSchemas,validateDirectBrowserValue} from '../../src/framework/sdk/browser-schemas.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../src/sidebar-tools/official-reading-toc.js';
import {digestUtf8,canonical} from '../../src/platform/protocol.js';
import {createTaskPackage,taskKey,installedKey,taskScriptId} from '../../src/platform/tasks/contract.js';
import {SIDEPANEL_DOCUMENT_PATH,CLOUD_RUNNER_DOCUMENT_PATH} from '../../src/tool-document-url.js';

const generation='12345678-1234-4123-8123-123456789abc';
const namespace='tool:service-scheduler-test',session='browser-session';
const serviceRequest={service:'background',schedule:{kind:'interval',expression:'1m'}};
const approved=request=>({kind:'trusted-app-service-schedule-intent-v1',request:structuredClone(request)});
const error=code=>failure=>failure?.code===code;

function memoryStorage(){
  let buckets=new Map(['frameworkKV','commandJournal','runs'].map(name=>[name,new Map()]));
  let tail=Promise.resolve();
  return {
    transaction(names,mode,work){
      const next=tail.then(async()=>{
        const snapshot=structuredClone(buckets);
        const value=await work({
          get:async(store,key)=>structuredClone(snapshot.get(store).get(key)),
          put:async(store,value,key)=>snapshot.get(store).set(key,structuredClone(value)),
          delete:async(store,key)=>snapshot.get(store).delete(key),
          all:async store=>structuredClone([...snapshot.get(store).values()])
        });
        if(mode==='readwrite')buckets=snapshot;
        return value;
      });
      tail=next.catch(()=>{});
      return next;
    }
  };
}
function installerSender(f,{market=false}={}){
  const url=f.api.runtime.getURL(market?'ui/marketplace.html?intent=review#apps':SIDEPANEL_DOCUMENT_PATH+'?hostInstanceId=12345678-1234-4123-8123-123456789abc');
  const sender={id:f.api.runtime.id,url,documentId:'installer-document',frameId:0,documentLifecycle:'active',
    ...(market?{tab:{id:7,incognito:false}}:{})};
  f.contexts.splice(0,f.contexts.length,{documentId:sender.documentId,documentUrl:url,frameId:0,
    incognito:false,contextType:market?'TAB':'SIDE_PANEL',...(market?{tabId:7}:{})});
  return sender;
}
async function pendingUninstall(f){
  f.local[SIDEBAR_TOOL_STORE]=[];
  f.local[TOOL_CLEANUP_STORE]={[f.tool.id]:{version:f.tool.version,createdAt:f.now()}};
}

test('uninstall retirement is confirmed before same-ID reinstall and is idempotent after lost reply',async()=>{
  const f=await fixture();await f.start();const before=await f.repo.definitions();
  await pendingUninstall(f);
  const sender=installerSender(f),request={toolId:f.tool.id};
  const receipt=await f.service.cleanupUninstalledToolSchedules(request,sender);
  assert.deepEqual(receipt,{toolId:f.tool.id,schedulesRetired:true,alarmsCleared:true});
  assert.equal((await f.repo.definitions()).length,0);assert.equal(f.alarms.size,0);
  // Simulate the committed reply being lost: the existing durable intent remains.
  assert.ok(f.local[TOOL_CLEANUP_STORE][f.tool.id]);
  assert.deepEqual(await f.service.cleanupUninstalledToolSchedules(request,sender),receipt);
  const deleted=await f.storage.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',scheduleKey(before[0].scheduleId)));
  assert.equal(deleted.generation,before[0].generation+1);
  f.local[SIDEBAR_TOOL_STORE]=[f.tool];
  await assert.rejects(f.service.cleanupUninstalledToolSchedules(request,sender),error('E_OWNER'));
  assert.equal((await f.start()).status,'active');
  assert.equal((await f.repo.definitions()).length,1);
});

test('Marketplace recovery rejects missing intent, corrupt state and stale or forged native senders',async()=>{
  const f=await fixture();await f.start();await pendingUninstall(f);
  const sender=installerSender(f,{market:true}),request={toolId:f.tool.id},before=await f.repo.definitions();
  for(const forged of [
    {...sender,id:'another-extension'},{...sender,frameId:1},{...sender,documentId:'stale-document'},
    {...sender,tab:{id:8}},{...sender,tab:{id:7,incognito:true}},
    {...sender,url:f.api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH),tab:undefined},
    {...sender,url:f.api.runtime.getURL('ui/marketplace.html.evil')},
    {...sender,documentLifecycle:'cached'}
  ])await assert.rejects(f.service.cleanupUninstalledToolSchedules(request,forged),error('E_OWNER'));
  await assert.rejects(f.service.cleanupUninstalledToolSchedules({...request,owner:f.owner},sender),error('E_SCHEMA'));
  for(const raw of [undefined,{},null,{[f.tool.id]:{version:'broken'}}]){
    f.local[TOOL_CLEANUP_STORE]=raw;
    await assert.rejects(f.service.cleanupUninstalledToolSchedules(request,sender),
      failure=>['E_OWNER','E_STORAGE_CORRUPT'].includes(failure.code));
  }
  await pendingUninstall(f);
  for(const raw of [undefined,null,[f.tool,f.tool],[{}]]){
    f.local[SIDEBAR_TOOL_STORE]=raw;
    await assert.rejects(f.service.cleanupUninstalledToolSchedules(request,sender),error('E_STORAGE_CORRUPT'));
  }
  assert.deepEqual(await f.repo.definitions(),before);
  await pendingUninstall(f);
  assert.equal((await f.service.cleanupUninstalledToolSchedules(request,sender)).alarmsCleared,true);
});

test('failed native alarm removal retains an unknown cleanup outcome and retry verifies old tombstones',async()=>{
  const f=await fixture();await f.start();await pendingUninstall(f);
  const sender=installerSender(f),request={toolId:f.tool.id},clear=f.api.alarms.clear;
  f.api.alarms.clear=async()=>false;
  await assert.rejects(f.service.cleanupUninstalledToolSchedules(request,sender),error('E_OUTCOME_UNKNOWN'));
  assert.equal((await f.repo.definitions()).length,0);assert.equal(f.alarms.size,1);
  assert.ok(f.local[TOOL_CLEANUP_STORE][f.tool.id]);
  f.api.alarms.clear=clear;
  assert.equal((await f.service.cleanupUninstalledToolSchedules(request,sender)).alarmsCleared,true);
  assert.equal(f.alarms.size,0);
});

test('uninstall waits for an earlier in-flight native alarm create before confirming removal',async()=>{
  const f=await fixture(),create=f.api.alarms.create;
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const waiting=new Promise(resolve=>{release=resolve;});
  f.api.alarms.create=async(...args)=>{entered();await waiting;return create(...args);};
  const creation=f.start();await started;
  await pendingUninstall(f);const sender=installerSender(f);
  let confirmed=false;
  const cleanup=f.service.cleanupUninstalledToolSchedules({toolId:f.tool.id},sender).then(result=>{confirmed=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(confirmed,false,'cleanup cannot pass a pending stale native create');
  release();await creation;
  assert.equal((await cleanup).alarmsCleared,true);assert.equal(f.alarms.size,0);
  assert.equal((await f.repo.definitions()).length,0);
});

test('an older invalid owner snapshot cannot clear an alarm after a newer valid synchronization',async()=>{
  const f=await fixture();await f.start();
  const get=f.api.storage.local.get;let entered,release,delay=true;
  const started=new Promise(resolve=>{entered=resolve;});
  const waiting=new Promise(resolve=>{release=resolve;});
  f.api.storage.local.get=async keys=>{
    const value=await get(keys);
    if(delay&&Array.isArray(keys)&&keys.includes(SIDEBAR_TOOL_ENABLE_STORE)){
      delay=false;entered();await waiting;
    }
    return value;
  };
  f.local[SIDEBAR_TOOL_ENABLE_STORE][f.tool.id]=false;
  const stale=f.service.reconcile();await started;
  f.local[SIDEBAR_TOOL_ENABLE_STORE][f.tool.id]=true;
  await f.service.reconcile();assert.equal(f.alarms.size,1);
  release();await stale;assert.equal(f.alarms.size,1);
});

test('native alarm synchronization retries after one failure without duplicating definitions',async()=>{
  const f=await fixture(),get=f.api.alarms.getAll;let fail=true;
  f.api.alarms.getAll=async()=>{
    if(fail){fail=false;throw Object.assign(Error('Temporary Chrome API failure'),{code:'E_ALARM_TEST'});}
    return get();
  };
  await assert.rejects(f.start(),error('E_ALARM_TEST'));
  await f.service.reconcile();
  // Failure was before allocation; explicit retry creates only one definition.
  await f.start();assert.equal((await f.repo.definitions()).length,1);assert.equal(f.alarms.size,1);
});
async function fixture(){
  const js='async function main(){return await browser.storage.local.getQuota();}',
    tool={format:'opendesk.sidebar-tool.v2',id:'service-scheduler',version:'1.0.0',
      title:'Background service',description:'Scheduler fixture',capabilities:['browser.storage','browser.scheduler'],
      html:'<main>Service</main>',css:'',js:'void 0;',requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
      background:{kind:'opendesk.app-service.v1',js,sha256:await digestUtf8(js)}};
  const local={[SIDEBAR_TOOL_STORE]:[tool],[SIDEBAR_TOOL_ENABLE_STORE]:{},
    [TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:generation}};
  let time=Date.parse('2026-10-22T00:00:30Z');
  const storage=memoryStorage(),alarms=new Map(),permissionChecks=[],contexts=[];
  const api={runtime:{id:'service-scheduler-test',getURL:path=>'chrome-extension://service-scheduler-test/'+path,
    getContexts:async()=>structuredClone(contexts)},storage:{local:{get:async keys=>
    Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(local[key])]))}},
    permissions:{contains:async request=>{permissionChecks.push(request);return !request.origins;}},
    alarms:{getAll:async()=>[...alarms.values()],create:async(name,{when})=>alarms.set(name,{name,scheduledTime:when}),
      clear:async name=>alarms.delete(name)}};
  const {binding}=await readAppServiceInstallation(api,tool.id);
  const owner={kind:'installed-tool-owned',toolId:tool.id,toolVersion:tool.version,
    packageHash:binding.packageHash,epoch:generation,installEpoch:generation};
  const clock={now:()=>time},repo=createScheduleRepository({storage,clock,namespace,session});
  const service=createScheduleService({storage,clock,api,session,assertHost:async()=>{},emitToHost:async()=>{}});
  const start=async(request=serviceRequest)=>service.create(request,owner,approved(request));
  const due=()=>service.listDueSchedules({profile:'app-service'},{});
  const put=(store,key,value)=>storage.transaction([store],'readwrite',tx=>tx.put(store,value,key));
  const addOffscreen=async()=>{
    contexts.push({contextType:'OFFSCREEN_DOCUMENT',documentId:'offscreen-service',
      documentUrl:api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH)});
    await put('commandJournal','host:service',{tag:'host',namespace,active:true,revoked:false,
      browserSessionIncarnation:session,hostDocumentId:'offscreen-service'});
  };
  const requestFor=fire=>({profile:'app-service',appId:fire.appId,expectedScheduleOwner:fire.expectedScheduleOwner,
    scheduledFireId:fire.fireId,requestId:fire.fireId,deadlineAt:time+30000});
  return {api,storage,repo,service,tool,owner,binding,local,contexts,alarms,permissionChecks,start,due,put,
    addOffscreen,requestFor,advance:milliseconds=>{time+=milliseconds;},now:()=>time};
}
async function installTask(f){
  const source='async function main(){return 1;}',sourceHash=await digestUtf8(source);
  const manifest={format:'opendesk.task.v1',taskId:'test.task',version:'1.0.0',title:'Existing Task',description:'Task isolation fixture',
    author:'OpenDesk',source:'local-developer',siteOrigins:['https://example.com'],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:1,sourceHash},
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}};
  const pkg=await createTaskPackage(manifest,source);
  await f.put('frameworkKV',taskKey(namespace,manifest.taskId,manifest.version),{
    tag:'task-candidate-v1',namespace,taskId:manifest.taskId,version:manifest.version,
    package:pkg,stage:'available',verification:{sourceHash,manifestHash:pkg.manifestHash}});
  await f.put('frameworkKV',installedKey(namespace,manifest.taskId),{tag:'task-installed-v1',namespace,
    taskId:manifest.taskId,version:manifest.version,enabled:true,manifestHash:pkg.manifestHash,
    authorization:{installationId:generation,generation:1}});
  return {title:'Task',taskId:manifest.taskId,version:manifest.version,manifestHash:pkg.manifestHash,
    sourceHash,installationId:generation,taskGeneration:1,params:{},targetUrl:'https://example.com/form',
    openIfMissing:false,timezone:'UTC',triggerKind:'interval',triggerSpec:{anchorAt:0,everyMinutes:1},
    misfirePolicy:'skip',startDeadlineMs:300000,paused:false};
}

test('R1.4 create overload is exclusive and trusted intent matches the normalized request',()=>{
  assert.deepEqual(normalizeBrowserOperation('browser.scheduler.create',serviceRequest),serviceRequest);
  assert.deepEqual(validateInstalledToolScheduleRequest(serviceRequest),serviceRequest);
  assert.deepEqual(validateTrustedAppServiceScheduleIntent(approved(serviceRequest),serviceRequest),serviceRequest);
  for(const request of [{...serviceRequest,taskId:'task'},{...serviceRequest,revision:'1'},
    {...serviceRequest,service:'foreground'},{...serviceRequest,appId:'other'},
    {service:'background',schedule:{...serviceRequest.schedule,timezone:'UTC'}}]){
    assert.throws(()=>normalizeBrowserOperation('browser.scheduler.create',request),error('E_SCHEMA'));
    assert.throws(()=>validateInstalledToolScheduleRequest(request),error('E_SCHEMA'));
  }
  const changed={...serviceRequest,schedule:{kind:'interval',expression:'2m'}};
  for(const intent of [null,approved(changed),{...approved(serviceRequest),kind:'trusted-scheduler-create-intent-v1'},
    {...approved(serviceRequest),appId:'injected'}])
    assert.throws(()=>validateTrustedAppServiceScheduleIntent(intent,serviceRequest),error('E_USER_GESTURE_REQUIRED'));
  const task={taskId:'test.task',revision:'1',schedule:serviceRequest.schedule};
  assert.deepEqual(normalizeBrowserOperation('browser.scheduler.create',task),task);
});

test('R1.4 scheduler create schema overload keeps Task fields required and service exclusive',()=>{
  const schema=operationSchemas('browser.scheduler.create').input;
  assert.equal(schema.type,'object');
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(BROWSER_OPERATIONS['browser.scheduler.create'].inputSchema,schema);
  const task={taskId:'test.task',revision:'1',schedule:serviceRequest.schedule};
  for(const request of [task,serviceRequest])
    assert.deepEqual(validateDirectBrowserValue(request,schema),request);
  for(const request of [{schedule:serviceRequest.schedule},
    {taskId:task.taskId,schedule:task.schedule},{revision:task.revision,schedule:task.schedule},
    {...task,revision:1},{...task,revision:'0'},
    {...task,service:'background'},{...serviceRequest,taskId:task.taskId},
    {...serviceRequest,revision:'1'},{...serviceRequest,service:'foreground'},
    {...serviceRequest,appId:'injected'},{...serviceRequest,profile:'app-service'},
    {service:'background'},{...serviceRequest,schedule:{kind:'interval'}},
    {...serviceRequest,schedule:{...serviceRequest.schedule,timezone:'UTC'}}]){
    assert.throws(()=>validateDirectBrowserValue(request,schema),error('E_SCHEMA'));
    assert.throws(()=>normalizeBrowserOperation('browser.scheduler.create',request),error('E_SCHEMA'));
  }
});

test('R1.4 scheduler listOwn schema rows are strict Task or service records',()=>{
  const schema=operationSchemas('browser.scheduler.listOwn').output;
  assert.deepEqual(BROWSER_OPERATIONS['browser.scheduler.listOwn'].outputSchema,schema);
  const task={scheduleRef:'12345678-1234-4123-8123-123456789abc',taskId:'test.task',status:'active'},
    service={scheduleRef:'87654321-4321-4321-8321-cba987654321',profile:'app-service',
      appId:'service-scheduler',service:'background',status:'needs_attention'};
  for(const schedules of [[],[task],[service],[task,service]]){
    const response={schedules};
    assert.deepEqual(validateDirectBrowserValue(response,schema),response);
  }
  const {taskId,...missingTaskId}=task,{profile,...missingProfile}=service,
    {appId,...missingAppId}=service,{service:kind,...missingService}=service;
  for(const row of [missingTaskId,missingProfile,missingAppId,missingService,
    {...task,profile:'app-service'},{...service,taskId:'fake-task'},
    {...service,profile:'task'},{...service,service:'foreground'},
    {...service,appBinding:{}},{...task,extra:true}])
    assert.throws(()=>validateDirectBrowserValue({schedules:[row]},schema),error('E_SCHEMA'));
  assert.throws(()=>validateDirectBrowserValue({schedules:[service],extra:true},schema),error('E_SCHEMA'));
  assert.throws(()=>validateDirectBrowserValue({schedules:Array.from({length:101},()=>({...task}))},schema),error('E_SCHEMA'));
});

test('R1.4 existing facade and published schemas accept actual service create/listOwn receipts',async()=>{
  const f=await fixture(),calls=[];
  const sdk=createBrowserSdk({request:async(operation,args)=>{
    const spec=BROWSER_OPERATIONS[operation];
    validateDirectBrowserValue(args,spec.inputSchema);
    calls.push({operation,args});
    const result=operation==='browser.scheduler.create'?
      await f.service.create(args,f.owner,approved(args)):await f.service.listOwn(args,f.owner);
    validateDirectBrowserValue(result,spec.outputSchema);
    return result;
  }});
  const created=await sdk.scheduler.create(serviceRequest);
  assert.equal(created.status,'active');
  await f.repo.saveOwned(await installTask(f),f.owner);
  const {schedules}=await sdk.scheduler.listOwn();
  assert.equal(schedules.length,2);
  assert.deepEqual(schedules.find(row=>row.profile==='app-service'),{scheduleRef:created.scheduleRef,
    profile:'app-service',appId:f.tool.id,service:'background',status:'active'});
  assert.equal(schedules.find(row=>row.taskId==='test.task').status,'needs_attention');
  assert.deepEqual(calls,[{operation:'browser.scheduler.create',args:serviceRequest},
    {operation:'browser.scheduler.listOwn',args:{}}]);
});

test('R1.4 service context exposes exactly the five existing registry operations',()=>{
  assert.deepEqual(Object.entries(BROWSER_OPERATIONS).filter(([,value])=>
    value.supportedContexts.includes('app-service')).map(([name])=>name).sort(),[...APP_SERVICE_OPERATIONS].sort());
  for(const operation of ['browser.scheduler.create','browser.storage.local.remove','browser.storage.local.clear',
    'browser.tabs.listOwned','browser.network.request'])
    assert.equal(BROWSER_OPERATIONS[operation].supportedContexts.includes('app-service'),false);
});

test('R1.4 creation binds the current app without a Task installation, target or origin grant',async()=>{
  const f=await fixture(),result=await f.start(),[definition]=await f.repo.definitions();
  assert.equal(result.status,'active');
  assert.equal(definition.profile,'app-service');
  assert.equal(definition.appId,f.tool.id);
  assert.deepEqual(definition.appBinding,f.binding);
  assert.equal(definition.targetUrl,null);
  for(const key of ['taskId','version','manifestHash','sourceHash','installationId','taskGeneration','revision'])
    assert.equal(Object.hasOwn(definition,key),false,key);
  assert.equal(f.permissionChecks.some(request=>Object.hasOwn(request,'origins')),false);
  assert.equal(f.alarms.size,1);
  assert.deepEqual(await f.service.listOwn({},f.owner),{schedules:[{scheduleRef:result.scheduleRef,
    profile:'app-service',appId:f.tool.id,service:'background',status:'active'}]});
  const listed=await f.service.listSchedules({},{});
  assert.equal(listed.schedules[0].needsAttention,false);
  const input={profile:'app-service',appId:f.tool.id,appBinding:f.binding,owner:f.owner,
    title:'Service',params:{},targetUrl:null,openIfMissing:false,timezone:'UTC',
    triggerKind:'interval',triggerSpec:{anchorAt:0,everyMinutes:1},misfirePolicy:'skip',startDeadlineMs:300000,paused:false};
  assert.deepEqual(validateScheduleInput(input),input);
  for(const patch of [{targetUrl:'https://example.com/'},{taskId:'fake-task'},
    {appBinding:{...f.binding,generation:1}},{appBinding:{...f.binding,sourceIdentity:'local-reviewed'}}])
    assert.throws(()=>validateScheduleInput({...input,...patch}),error('E_SCHEMA'));
  await assert.rejects(f.service.saveSchedule(input,{}),error('E_USER_GESTURE_REQUIRED'));
});

test('R1.4 Task and service queues stay disjoint and keep bounded chronological selection',async()=>{
  const f=await fixture(),task=await installTask(f);
  for(let index=0;index<13;index++)await f.repo.save(task);
  for(let index=0;index<13;index++)await f.start();
  f.advance(30000);
  const tasks=await f.service.listDueSchedules({},{}),services=await f.due();
  assert.equal(tasks.fires.length,12);
  assert.equal(services.fires.length,12);
  assert.ok(tasks.fires.every(fire=>fire.definition.taskId==='test.task'&&fire.profile===undefined));
  assert.ok(services.fires.every(fire=>fire.profile==='app-service'&&fire.appId===f.tool.id&&
    fire.deadlineAt===fire.scheduledAt+300000&&fire.expectedScheduleOwner.toolId===f.tool.id));
  const first=services.fires[0];
  await f.service.setScheduleFireState({fireId:first.fireId,status:'UNKNOWN'},{});
  const next=await f.due();
  assert.equal(next.fires.length,12);
  assert.ok(next.fires.every(fire=>fire.fireId!==first.fireId));
  await assert.rejects(f.service.listDueSchedules({profile:'task'},{}),error('E_SCHEMA'));
});

test('R1.4 only the real offscreen runner supplies service host availability',async()=>{
  const f=await fixture(),panel=f.api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH);
  f.contexts.push({contextType:'SIDE_PANEL',documentId:'panel',documentUrl:panel+'?hostInstanceId=panel-host'},
    {contextType:'TAB',documentId:'fake-offscreen',documentUrl:f.api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH)},
    {contextType:'OFFSCREEN_DOCUMENT',documentId:'wrong-url',documentUrl:panel},
    {contextType:'OFFSCREEN_DOCUMENT',documentId:'query',documentUrl:f.api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH)+'?x=1'},
    {contextType:'OFFSCREEN_DOCUMENT',documentId:'inactive',documentLifecycle:'cached',documentUrl:f.api.runtime.getURL(CLOUD_RUNNER_DOCUMENT_PATH)});
  assert.deepEqual([...await scheduledHostDocumentIds(f.api,{profile:'app-service'})],[]);
  await f.addOffscreen();
  assert.deepEqual([...await scheduledHostDocumentIds(f.api,{profile:'app-service'})],['offscreen-service']);
  assert.equal((await scheduledHostDocumentIds(f.api)).has('offscreen-service'),false);
  await f.start();f.advance(30000);
  const [{status}]=(await f.due()).fires;
  assert.equal(status,'READY');
  f.contexts.length=0;
  assert.equal((await f.due()).fires[0].status,'WAITING_HOST');
});

test('R1.4 pending service lifecycle excludes Task fires, expired and terminal occurrences',async()=>{
  const f=await fixture(),task=await installTask(f);
  await f.repo.save(task);f.advance(30000);
  assert.equal(await f.service.hasPendingAppServices(),false);
  await f.start({service:'background',schedule:{kind:'once',expression:new Date(f.now()+60000).toISOString()}});
  f.advance(60000);
  assert.equal(await f.service.hasPendingAppServices(),true);
  const [fire]=(await f.due()).fires;
  await f.service.setScheduleFireState({fireId:fire.fireId,status:'WAITING_SLOT'},{});
  assert.equal(await f.service.hasPendingAppServices(),true);
  await f.service.setScheduleFireState({fireId:fire.fireId,status:'UNKNOWN'},{});
  assert.equal(await f.service.hasPendingAppServices(),false);
  const once={service:'background',schedule:{kind:'once',expression:new Date(f.now()+60000).toISOString()}};
  await f.start(once);f.advance(360001);
  const pending=(await f.due()).fires;
  assert.deepEqual(pending,[]);
});

test('R1.4 owner, package, generation, source and enable changes stop service admission',async()=>{
  const mutations=[
    f=>{f.local[SIDEBAR_TOOL_STORE][0].js='void "changed UI";';},
    f=>{f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='87654321-4321-4321-8321-cba987654321';},
    f=>{f.local[SIDEBAR_TOOL_ENABLE_STORE][f.tool.id]=false;},
    f=>{f.local[MARKET_PROVENANCE_STORE]={[f.tool.id]:{marketId:'official/service',sha256:'a'.repeat(64),version:'1.0.0'}};},
    f=>{f.local[SIDEBAR_TOOL_STORE]=[];}
  ];
  for(const mutate of mutations){
    const f=await fixture();await f.start();f.advance(30000);
    const [fire]=(await f.due()).fires;
    assert.deepEqual(await f.service.prepareAdmission(fire.fireId,f.owner),f.owner);
    mutate(f);
    await assert.rejects(f.service.prepareAdmission(fire.fireId,f.owner));
    assert.deepEqual((await f.due()).fires,[]);
    assert.equal(await f.service.hasPendingAppServices(),false);
    assert.equal((await f.service.listOwn({},f.owner).catch(()=>null))?.schedules?.[0]?.status??'rejected',
      f.local[MARKET_PROVENANCE_STORE]?'needs_attention':'rejected');
    assert.equal(f.alarms.size,0);
  }
});

test('R1.4 admission checks immutable profile/app/owner and binds one original Run/Result',async()=>{
  const f=await fixture();await f.start();await f.addOffscreen();f.advance(30000);
  const [fire]=(await f.due()).fires,request=f.requestFor(fire);
  const admit=(value,origin=null)=>f.storage.transaction(['frameworkKV'],'readwrite',tx=>
    f.service.admit(tx,fire.fireId,value,origin,f.now()));
  for(const patch of [{profile:undefined},{appId:'foreign-app'},{requestId:'other'},
    {expectedScheduleOwner:{...f.owner,packageHash:'0'.repeat(64)}},
    {appBinding:{...f.binding,codeHash:'0'.repeat(64)}},{contentHash:'0'.repeat(64)},
    {target:{mode:'owned',url:'https://example.com/'}},{expectedTaskInstallationId:generation}])
    await assert.rejects(admit({...request,...patch}));
  await assert.rejects(admit(request,'https://example.com'),error('E_PERMISSION'));
  await assert.rejects(f.service.prepareAdmission(fire.fireId,{...f.owner,toolId:'foreign-app'}),error('E_OWNER'));
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const admitted=await f.service.admit(tx,fire.fireId,request,null,f.now());
    await f.service.bind(tx,admitted,{runId:'original-run',resultId:'original-result'});
  });
  await assert.rejects(admit(request),error('E_PERMISSION'));
  assert.equal(await f.service.hasPendingAppServices(),false);
  await f.service.setScheduleFireState({fireId:fire.fireId,status:'WAITING_SLOT'},{});
  const history=await f.repo.history({scheduleId:fire.scheduleId});
  assert.equal(history.history[0].status,'ADMITTED');
  assert.equal(history.history[0].runId,'original-run');
  assert.equal(history.history[0].resultId,'original-result');
  const [taskFire]=await f.repo.ready();
  assert.equal(taskFire,undefined);
});

test('R1.4 pause/delete and expired admission invalidate outstanding service fires',async()=>{
  for(const action of ['pause','delete','expire']){
    const f=await fixture(),created=await f.start();f.advance(30000);
    const [fire]=(await f.due()).fires;
    if(action==='expire')f.advance(300001);
    else await f.service.changeSchedule({scheduleId:created.scheduleRef,expectedGeneration:1,action},{});
    await assert.rejects(f.service.prepareAdmission(fire.fireId,f.owner),error('E_PERMISSION'));
    assert.ok((await f.due()).fires.every(row=>row.fireId!==fire.fireId));
  }
});

test('R1.4 a service occurrence cannot change its frozen installation snapshot',async()=>{
  const f=await fixture();await f.start();f.advance(30000);
  const [fire]=(await f.due()).fires,request=f.requestFor(fire);
  const [definition]=await f.repo.definitions();
  await f.put('frameworkKV',scheduleKey(definition.scheduleId),{...definition,
    appBinding:{...definition.appBinding,sourceIdentity:{kind:'market',marketId:'other/source',sha256:'a'.repeat(64),version:'1.0.0'}}});
  await assert.rejects(f.storage.transaction(['frameworkKV'],'readwrite',tx=>
    f.repo.admit(tx,fire.fireId,request,null,f.now())),error('E_PERMISSION'));
  const persisted=await f.storage.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',fireKey(fire.fireId)));
  assert.equal(persisted.runId,null);
  assert.equal(persisted.resultId,null);
});

test('R1.4 a Task occurrence cannot be admitted as an app service',async()=>{
  const f=await fixture(),task=await installTask(f);
  const definition=await f.repo.save(task);f.advance(30000);await f.service.reconcile();
  const [fire]=await f.repo.ready();
  await assert.rejects(f.storage.transaction(['frameworkKV'],'readwrite',tx=>f.repo.admit(tx,fire.fireId,
    {...f.requestFor(fire),profile:'app-service',appId:f.tool.id},null,f.now())),error('E_PERMISSION'));
  // The original Task contract still admits its exact website and installed revision.
  await f.storage.transaction(['frameworkKV'],'readwrite',tx=>f.repo.admit(tx,fire.fireId,{
    requestId:fire.fireId,expectedTaskInstallationId:generation,expectedTaskGeneration:1,
    source:{contentHash:task.sourceHash,scriptId:taskScriptId(task.taskId,task.version)},paramsDecoded:{},
    target:{mode:'borrowed',expectedUrl:task.targetUrl}},'https://example.com',f.now()));
  assert.equal((await f.repo.definitions()).find(row=>row.scheduleId===definition.scheduleId).profile,undefined);
});

function uninstallScheduleInput(f,{owner=f.owner,binding=f.binding}={}){
  return {profile:'app-service',appId:binding.appId,appBinding:binding,owner,
    title:'Uninstall capacity regression',params:{},targetUrl:null,openIfMissing:false,timezone:'UTC',
    triggerKind:'interval',triggerSpec:{anchorAt:0,everyMinutes:1},misfirePolicy:'skip',startDeadlineMs:300000,paused:false};
}
const uninstallOwnerKey=owner=>canonical(validateScheduleOwner(owner));

test('R1.4 uninstall reclaims the 128 schedule capacity without touching another app or unowned Task',async()=>{
  const f=await fixture();await f.start();
  const task=await f.repo.save(await installTask(f));
  while((await f.repo.definitions()).length<128)await f.repo.saveOwned(uninstallScheduleInput(f),f.owner);
  const before=await f.repo.definitions(),other={...f.tool,id:'service-other'};
  f.local[SIDEBAR_TOOL_STORE]=[other];
  f.local[TOOL_REVOCATION_EPOCHS_STORE][other.id]='22345678-1234-4123-8123-123456789abc';
  const {binding}=await readAppServiceInstallation(f.api,other.id),owner={...f.owner,toolId:other.id,
    packageHash:binding.packageHash,epoch:binding.generation,installEpoch:binding.generation};
  const created=await f.service.create(serviceRequest,owner,approved(serviceRequest));
  const after=await f.repo.definitions();assert.equal(after.length,2);
  assert.deepEqual(after.find(x=>x.scheduleId===task.scheduleId),task);
  assert.equal(after.find(x=>x.scheduleId===created.scheduleRef).owner.toolId,other.id);
  const original=before.find(x=>x.owner?.toolId===f.tool.id);
  const retired=await f.storage.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',scheduleKey(original.scheduleId)));
  assert.equal(retired.deleted,true);assert.equal(retired.paused,true);assert.equal(retired.nextDueAt,null);
  assert.equal(retired.generation,original.generation+1);
});

test('R1.4 uninstall cleanup preserves installed apps during disable, generation change and capability removal',async()=>{
  const f=await fixture(),created=await f.start(),before=await f.repo.definitions();
  f.local[SIDEBAR_TOOL_ENABLE_STORE][f.tool.id]=false;await f.service.reconcile();
  assert.deepEqual(await f.repo.definitions(),before);
  f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='22345678-1234-4123-8123-123456789abc';
  await f.service.reconcile();assert.deepEqual(await f.repo.definitions(),before);
  const tool={...f.tool,version:'1.1.0',capabilities:['browser.scheduler']};delete tool.background;
  f.local[SIDEBAR_TOOL_STORE]=[tool];await f.service.reconcile();
  assert.equal((await f.repo.definitions())[0].scheduleId,created.scheduleRef);
  assert.deepEqual(await f.repo.definitions(),before);
});

test('R1.4 uninstall cleanup never infers removal from missing, corrupt or unreadable registry data',async()=>{
  for(const kind of ['missing','null','object','duplicate','invalid','unreadable']){
    const f=await fixture();await f.start();const before=await f.repo.definitions();
    if(kind==='missing'){delete f.local[SIDEBAR_TOOL_STORE];await f.service.reconcile();}
    else if(kind==='unreadable'){
      f.api.storage.local.get=async()=>{throw Object.assign(Error('Unreadable registry'),{code:'E_STORAGE_TEST'});};
      await assert.rejects(f.service.reconcile(),error('E_STORAGE_TEST'));
    }else{
      f.local[SIDEBAR_TOOL_STORE]=kind==='null'?null:kind==='object'?{}:kind==='duplicate'?[f.tool,f.tool]:[{}];
      await assert.rejects(f.service.reconcile(),error('E_STORAGE_CORRUPT'));
    }
    assert.deepEqual(await f.repo.definitions(),before,kind);
  }
});

test('R1.4 uninstall snapshots cancel only old pending fires and retain new generations and admitted audit',async()=>{
  const f=await fixture();await f.start();await f.start();f.advance(30000);
  const {fires}=await f.due();assert.equal(fires.length,2);
  const auditRun={runId:'uninstall-audit-run',resultId:'uninstall-audit-result',state:'running'};
  await f.put('runs',auditRun.runId,auditRun);
  await f.storage.transaction(['frameworkKV'],'readwrite',tx=>f.repo.bind(tx,fires[1],auditRun));
  const admittedBefore=await f.storage.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',fireKey(fires[1].fireId)));
  const nextGeneration='22345678-1234-4123-8123-123456789abc',binding={...f.binding,generation:nextGeneration},
    owner={...f.owner,epoch:nextGeneration,installEpoch:nextGeneration};
  const input=uninstallScheduleInput(f,{owner,binding});input.triggerSpec.anchorAt=f.now()+60000;
  const current=await f.repo.saveOwned(input,owner);
  await f.repo.reconcile({uninstalledOwners:new Set([uninstallOwnerKey(f.owner)])});
  assert.deepEqual(await f.repo.definitions(),[current]);
  const state=await f.storage.transaction(['frameworkKV','runs'],'readonly',async tx=>({
    pending:await tx.get('frameworkKV',fireKey(fires[0].fireId)),
    admitted:await tx.get('frameworkKV',fireKey(fires[1].fireId)),run:await tx.get('runs',auditRun.runId)}));
  assert.equal(state.pending.status,'CANCELLED');assert.equal(state.pending.runId,null);
  assert.deepEqual(state.admitted,admittedBefore);assert.deepEqual(state.run,auditRun);
  await assert.rejects(f.repo.reconcile({uninstalledOwners:[]}),error('E_SCHEMA'));
});
