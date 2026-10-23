import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canonical} from '../../src/platform/protocol.js';
import {readAnalyticsAuthorityProjection} from '../../src/analytics/authority-projection.js';
import {createAnalyticsCollector} from '../../src/analytics/collector.js';
import {ANALYTICS_DISCLOSURE_VERSION,ANALYTICS_STATE_KEY,
  validateAnalyticsEvent} from '../../src/analytics/contract.js';

const NOW=Date.UTC(2026,9,23,12);
const namespace='tool:analytics-r11-test';
const pageId='custom-page-typed-source';
function authorityDB(){
  const stores={frameworkKV:[
    {tag:'page-installed-v1',namespace,programId:pageId,enabled:true,
      nativeId:'native-page-1',nativeState:'registered',authorization:{status:'active'}},
    {tag:'task-installed-v1',namespace,taskId:'task-1',enabled:true,
      authorization:{installationId:randomUUID(),generation:1,scope:{siteOrigins:['https://example.com']}}},
    {tag:'schedule-definition-v1',namespace,scheduleId:'sched-1',paused:false,deleted:false},
  ],runs:[],results:[]};
  const storage={transaction:async(_names,mode,work)=>{
    assert.equal(mode,'readonly');
    return work({all:async name=>structuredClone(stores[name])});
  }};
  const sidebarTools=[
    {id:'cookie-editor'},
    {id:'adblock',background:{kind:'opendesk.app-service.v1'}}
  ];
  const sidebarEnabled={'adblock':false};
  const api={runtime:{id:'analytics-r11-test'},
    storage:{local:{async get(){return {
      'opendesk.sidebar-tools.installed.v1':structuredClone(sidebarTools),
      'opendesk.sidebar-tools.enabled.v1':structuredClone(sidebarEnabled)
    };}}},
    userScripts:{async getScripts(){return [{id:'native-page-1'}];}},
    permissions:{async contains(){return true;}}};
  return {storage,api,stores,sidebarTools,sidebarEnabled};
}
function memory(){
  const values=new Map();
  return {values,api:{storage:{local:{
    async get(key){return {[key]:structuredClone(values.get(key))};},
    async set(obj){for(const [key,value] of Object.entries(obj))
      values.set(key,structuredClone(value));}
  }},alarms:{async create(){},async clear(){}}}};
}
const daily=(projection,type,metric)=>projection.daily.find(row=>row.type===type&&row.metricType===metric);
const PAGE_MANIFEST_HASH='e'.repeat(64),PAGE_SOURCE_HASH='f'.repeat(64);
const PAGE_INSTALLATION_ID=randomUUID();
const pageAutoReceipt=({createdAt=NOW,dispatchedAt=createdAt,state='completed',
  receiptId=randomUUID(),documentId='document-page-1',...extra}={})=>({
  tag:'page-execution-v1',namespace,programId:pageId,source:'page_auto',
  revision:1,manifestHash:PAGE_MANIFEST_HASH,sourceHash:PAGE_SOURCE_HASH,
  installationId:PAGE_INSTALLATION_ID,grantGeneration:1,installationToken:'a'.repeat(32),
  tabId:12,documentId,
  executionKey:'page-execution:'+canonical([namespace,PAGE_MANIFEST_HASH,documentId]),
  receiptId,createdAt,dispatchedAt,state,...extra
});
const SCHEDULE_SOURCE_HASH='c'.repeat(64),SCHEDULE_MANIFEST_HASH='d'.repeat(64);
const scheduledRun=(runId,resultId,fireId,state='completed')=>({
  tag:'controller-run',namespace,runId,resultId,scheduledFireId:fireId,
  sourceKind:'saved',scriptId:'task:task-1:1.0.0',contentHash:SCHEDULE_SOURCE_HASH,
  revision:{sourceHash:SCHEDULE_SOURCE_HASH},
  installedTaskAuthorization:{taskId:'task-1',version:'1.0.0',
    manifestHash:SCHEDULE_MANIFEST_HASH,
    authorization:{installationId:randomUUID(),generation:1}},
  createdAt:NOW,state
});
const scheduledResult=(runId,resultId,state='completed')=>({
  tag:'controller-result',namespace,runId,resultId,revision:{sourceHash:SCHEDULE_SOURCE_HASH},
  state,outcome:{ok:state==='completed'}
});

test('read-only Page/Task/Scheduler authority: 100 actual Page receipts; no fake DAU',async()=>{
  const {storage,api,stores}=authorityDB();
  for(let i=0;i<100;i++)stores.frameworkKV.push(
    pageAutoReceipt({createdAt:NOW-1000,documentId:'boot-document-'+i,effectConfirmed:true}));
  const runId=randomUUID(),resultId=randomUUID(),fireId='fire:2026-10-23:1';
  stores.frameworkKV.push({tag:'schedule-fire-v1',namespace,
    fireId,runId,resultId,status:'ADMITTED'});
  stores.runs.push(scheduledRun(runId,resultId,fireId));
  stores.results.push(scheduledResult(runId,resultId));
  const data=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.deepEqual(data.inventoryTypes,{
    sidebar:{installed:2,enabled:1,disabled:1,blocked:0,unknown:0},
    page:{installed:1,enabled:1,disabled:0,blocked:0,unknown:0},
    task:{installed:1,enabled:1,disabled:0,blocked:0,unknown:0},
    scheduler:{definitions:1,active:1,paused:0,unknown:0},
    app_service:{bindings:1,enabled:0,disabled:1,unknown:0}});
  assert.equal(daily(data,'page','attempted')?.total,100);
  assert.equal(daily(data,'page','completed')?.total,100);
  assert.deepEqual(daily(data,'page','completed')?.sourceTotals,{page_auto:100});
  assert.equal(daily(data,'task','attempted')?.total,1);
  assert.equal(daily(data,'task','completed')?.total,1);
  assert.deepEqual(daily(data,'task','completed')?.sourceTotals,{scheduler:1});
  assert(!data.daily.some(row=>row.metricType==='business_effect_verified'),
    'Run completed and effectConfirmed never constitute independent business proof');
  // Browser refused Native User Scripts access: cannot claim an enabled Page.
  api.userScripts.getScripts=async()=>{throw Error('Native User Scripts disabled');};
  const blocked=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(blocked.inventoryTypes.page.unknown,1);
  assert.equal(blocked.inventoryTypes.page.enabled,0);
});
test('Scheduler FireId + bound RunId/ResultId; inconsistent result is UNKNOWN',async()=>{
  const {storage,api,stores}=authorityDB();
  const runId=randomUUID(),resultId=randomUUID();
  stores.frameworkKV.push({tag:'schedule-fire-v1',namespace,fireId:'f-1',runId,resultId});
  stores.runs.push(scheduledRun(runId,resultId,'f-1','paused_unknown'));
  let value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','outcome_unknown')?.total,1);
  stores.results.push({tag:'controller-result',namespace,runId:'forged-other-run',resultId,state:'completed',
    outcome:{ok:true}});
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined);
  assert.equal(value.projectionGap,true);
});
test('Scheduler requires original FireId + RunId + ResultId before counting automatic use',async()=>{
  const {storage,api,stores}=authorityDB();
  const runId=randomUUID(),resultId=randomUUID(),fireId='f-three-ids';
  const fire={tag:'schedule-fire-v1',namespace,fireId,runId,resultId:null,status:'ADMITTED'};
  stores.frameworkKV.push(fire);
  stores.runs.push(scheduledRun(runId,resultId,fireId));
  stores.results.push(scheduledResult(runId,resultId));
  let value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','attempted'),undefined);
  assert.equal(value.projectionGap,true);
  fire.resultId=randomUUID();
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined);
  fire.resultId=resultId;
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','attempted')?.total,1);
  assert.equal(daily(value,'task','completed')?.total,1);
  assert.deepEqual(daily(value,'task','completed')?.sourceTotals,{scheduler:1});
  assert.equal(value.projectionGap,false);
});

test('Scheduler refuses forged original source, task manifest, generation and version',async()=>{
  const {storage,api,stores}=authorityDB(),runId=randomUUID(),resultId=randomUUID(),fireId='f-source';
  const run=scheduledRun(runId,resultId,fireId);
  stores.frameworkKV.push({tag:'schedule-fire-v1',namespace,fireId,runId,resultId});
  stores.runs.push(run);stores.results.push(scheduledResult(runId,resultId));
  assert.equal(daily(await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW}),
    'task','completed')?.total,1);
  const broken=[
    ()=>{run.revision.sourceHash='0'.repeat(64);},
    ()=>{run.installedTaskAuthorization.manifestHash='not-a-hash';},
    ()=>{run.installedTaskAuthorization.authorization.generation=0;},
    ()=>{run.installedTaskAuthorization.authorization.installationId='changed';},
    ()=>{run.installedTaskAuthorization.version='9.0.0';},
    ()=>{stores.results[0].revision.sourceHash='1'.repeat(64);}
  ];
  for(const tamper of broken){
    const originalRun=structuredClone(run),originalResult=structuredClone(stores.results[0]);
    tamper();
    const actual=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
    assert.equal(daily(actual,'task','completed'),undefined);
    assert.equal(actual.projectionGap,true);
    Object.assign(run,originalRun);Object.assign(stores.results[0],originalResult);
  }
  assert.equal(daily(await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW}),
    'task','completed')?.total,1);
});

test('App Service scheduler requires original Sidebar binding and frozen source',async()=>{
  const {storage,api,stores}=authorityDB(),runId=randomUUID(),resultId=randomUUID(),fireId='f-app';
  const binding={appId:'adblock',packageHash:'a'.repeat(64),codeHash:'b'.repeat(64),
    generation:randomUUID(),sourceIdentity:{kind:'local-reviewed'}};
  const fire={tag:'schedule-fire-v1',namespace,fireId,runId,resultId,
    profile:'app-service',appId:binding.appId,appBinding:structuredClone(binding)};
  const run={tag:'controller-run',namespace,runId,resultId,scheduledFireId:fireId,
    profile:'app-service',sourceKind:'app-service',scriptId:'app:adblock',
    appBinding:structuredClone(binding),contentHash:binding.codeHash,
    revision:{sourceHash:binding.codeHash},createdAt:NOW,state:'completed'};
  const result={tag:'controller-result',namespace,runId,resultId,state:'completed',
    revision:{sourceHash:binding.codeHash},outcome:{ok:true}};
  stores.frameworkKV.push(fire);stores.runs.push(run);stores.results.push(result);
  let current=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(current,'app_service','completed')?.total,1);
  assert.deepEqual(daily(current,'app_service','completed')?.sourceTotals,{scheduler:1});
  fire.appBinding.generation=randomUUID();
  current=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(current,'app_service','completed'),undefined);
  assert.equal(current.projectionGap,true);
  fire.appBinding.generation=binding.generation;
  run.revision.sourceHash='0'.repeat(64);
  current=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(current,'app_service','completed'),undefined);
  assert.equal(current.projectionGap,true);
});

test('consent gates readback and daily version; automatic runs do not invent app.opened',async()=>{
  const {api:ext,values}=memory();const {api,storage,stores}=authorityDB();
  for(let i=0;i<100;i++)stores.frameworkKV.push(pageAutoReceipt({documentId:'consented-document-'+i}));
  const collector=createAnalyticsCollector({api:ext,endpoint:'https://analytics.example/v1/events',
    now:()=>NOW,newId:randomUUID,fetcher:async()=>{throw Error('offline');}});
  // Old execution remains in the original Authority but was never consented.
  stores.frameworkKV.push(pageAutoReceipt({createdAt:NOW-60000,documentId:'pre-consent-document'}));
  let reads=0;
  const load=({since}={})=>{reads++;return readAnalyticsAuthorityProjection({storage,api,now:()=>NOW,since});};
  assert.equal((await collector.reportAuthority(load)).recorded,false);
  assert.equal(reads,0);assert.equal(values.get(ANALYTICS_STATE_KEY),undefined);
  await collector.setConsent(true,{disclosureVersion:ANALYTICS_DISCLOSURE_VERSION});
  const report=await collector.reportAuthority(load);
  assert.equal(report.autoSnapshots,2,'attempted & completed are distinct cumulative series');
  const state=values.get(ANALYTICS_STATE_KEY);
  const dailyEvents=state.queue.filter(row=>row.event==='tool.auto_daily');
  assert.equal(dailyEvents.length,2);
  assert(dailyEvents.every(row=>row.total===100&&row.version===1&&
    /^anon-[a-f0-9]{24}$/.test(row.toolId)));
  assert(!JSON.stringify(state.queue).includes(pageId),'private script identity cannot leave collector');
  assert(!state.queue.some(row=>row.event==='app.opened'||row.event==='tool.engaged'));
  assert.equal((await collector.reportAuthority(load)).autoSnapshots,0);
  assert.equal(values.get(ANALYTICS_STATE_KEY).queue.filter(row=>row.event==='tool.auto_daily').length,2);
  stores.frameworkKV.push(pageAutoReceipt({documentId:'new-consented-document'}));
  assert.equal((await collector.reportAuthority(load)).autoSnapshots,2);
  const latest=values.get(ANALYTICS_STATE_KEY).queue.filter(row=>row.event==='tool.auto_daily');
  assert(latest.every(row=>row.version===2&&row.total===101));
  await collector.setConsent(false);
  assert.equal(values.get(ANALYTICS_STATE_KEY).identitySalt,null);
  assert.equal(values.get(ANALYTICS_STATE_KEY).installId,null);
  assert.equal((await collector.reportAuthority(load)).recorded,false);
  assert.equal(reads,3,'no readback after explicit revocation');
});
test('strict transport refuses raw custom IDs and untrusted completed-success claims',()=>{
  const row={eventId:randomUUID(),installId:randomUUID(),event:'tool.auto_daily',
    toolId:'anon-0123456789ab0123456789ab',source:'host',channel:'extension',
    timestamp:new Date(NOW).toISOString(),toolType:'page',utcDate:'2026-10-23',
    metricType:'completed',total:100,version:1,sourceTotals:{page_auto:100}};
  assert.equal(validateAnalyticsEvent(row,{now:NOW}).total,100);
  for(const invalid of [
    {...row,toolId:'custom-secret-script'},
    {...row,source:'tool_reported'},
    {...row,metricType:'business_effect_verified'},
    {...row,url:'https://private.example'},
    {...row,outcome:{success:true}},
    {...row,total:0},
    {...row,sourceTotals:{scheduler:100}},
    {...row,sourceTotals:{page_auto:99}},
  ])assert.throws(()=>validateAnalyticsEvent(invalid,{now:NOW}));
});

test('trusted manual Task failure is DAU-eligible; RunId stays local and deduplicated',async()=>{
  const {api,values}=memory();
  const collector=createAnalyticsCollector({api,endpoint:'https://analytics.example/v1/events',
    now:()=>NOW,newId:randomUUID});
  const rawIdentity='Private Task Label: Example User Input',runId=randomUUID();
  assert.equal((await collector.recordManualTask({event:'tool.manual_attempt',
    identity:rawIdentity})).recorded,false);
  assert.equal(values.get(ANALYTICS_STATE_KEY),undefined);
  await collector.setConsent(true,{disclosureVersion:ANALYTICS_DISCLOSURE_VERSION});
  assert.equal((await collector.recordManualTask({event:'tool.manual_attempt',
    identity:rawIdentity})).recorded,true);
  assert.equal((await collector.recordManualTask({event:'tool.manual_result',
    identity:rawIdentity,runId,runStatus:'failed'})).recorded,true);
  assert.equal((await collector.recordManualTask({event:'tool.manual_result',
    identity:rawIdentity,runId,runStatus:'completed'})).recorded,false,
    'a RunId cannot switch state by replaying a newer synthetic claim');
  const rows=values.get(ANALYTICS_STATE_KEY).queue;
  assert(rows.some(row=>row.event==='tool.manual_attempt'));
  assert(rows.some(row=>row.event==='tool.manual_result'&&row.runStatus==='failed'));
  assert(!rows.some(row=>row.event==='app.opened'));
  assert(!JSON.stringify(rows).includes(rawIdentity));
  assert(!JSON.stringify(rows).includes(runId));
  await collector.setConsent(false);
  assert.equal((await collector.recordManualTask({event:'tool.manual_attempt',
    identity:rawIdentity})).recorded,false);
});
test('consent epoch excludes pre-consent history without hiding current installed state',async()=>{
  const {api,storage,stores}=authorityDB();
  const sameDay=NOW-15000;
  stores.frameworkKV.push(pageAutoReceipt({createdAt:sameDay,documentId:'epoch-old-document'}));
  stores.frameworkKV.push(pageAutoReceipt({createdAt:NOW+1000,state:'failed',documentId:'epoch-new-document'}));
  const before=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW,since:0});
  const after=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW,since:NOW});
  assert.equal(before.inventoryTypes.page.installed,1);
  assert.equal(after.inventoryTypes.page.installed,1);
  assert.equal(daily(before,'page','attempted')?.total,2);
  assert.equal(daily(after,'page','attempted')?.total,1);
  assert.equal(daily(after,'page','completed'),undefined);
  assert.equal(daily(after,'page','failed')?.total,1);
});


test('cloud bound Run/Result is automatic, manual Run is not; source totals cannot merge with Scheduler',async()=>{
  const {api,storage,stores}=authorityDB();
  const add=(source,state='completed')=>{
    const runId=randomUUID(),resultId=randomUUID(),requestId='cloud:'+randomUUID();
    const sourceHash='a'.repeat(64),manifestHash='b'.repeat(64),
      installationId=randomUUID(),generation=1,grantId='grant-test';
    const grant={taskId:'task-1',version:'1.0.0',manifestHash,
      authorization:{installationId,generation}};
    const run={tag:'controller-run',namespace,runId,resultId,createdAt:NOW,
      state,scriptId:'task:task-1:1.0.0',revision:{sourceHash},
      contentHash:sourceHash,installedTaskAuthorization:grant};
    if(source==='cloud'){
      run.cloudRequestId=requestId;run.cloudRequestKey='cloud-key:'+requestId;
      stores.frameworkKV.push({tag:'cloud-request-v1',namespace,requestId,runId,
        storageKey:run.cloudRequestKey,grantId,
        task:{taskId:'task-1',version:'1.0.0',scriptId:'task:task-1:1.0.0',
          manifestHash,contentHash:sourceHash,installationId,generation},
        runRef:{runId,resultId,requestId,sourceHash,manifestHash,grantId}});
    }else if(source==='scheduler'){
      run.scheduledFireId=requestId;
      run.sourceKind='saved';
      run.scriptId='task:task-1:1.0.0';
      run.installedTaskAuthorization={...grant,version:'1.0.0'};
      stores.frameworkKV.push({tag:'schedule-fire-v1',namespace,fireId:requestId,runId,resultId});
    }
    stores.runs.push(run);
    if(state==='completed')stores.results.push({tag:'controller-result',namespace,runId,
      resultId,revision:{sourceHash},state:'completed',outcome:{ok:true}});
    return run;
  };
  add('manual');add('cloud');add('scheduler');add('cloud','preparing');
  let value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','attempted')?.total,2);
  assert.deepEqual(daily(value,'task','completed')?.sourceTotals,{scheduler:1,cloud:1});
  assert(!value.daily.some(row=>row.metricType==='business_effect_verified'));
  const cloud=stores.runs.find(row=>row.cloudRequestId);
  stores.frameworkKV=stores.frameworkKV.filter(row=>row.requestId!==cloud.cloudRequestId);
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','attempted')?.total,1);
  assert.equal(value.projectionGap,true,'broken cloud binding is coverage uncertainty');
});
test('Sidebar installation/enable is original authority; corrupt readback is failure, not zero',async()=>{
  const {storage,api,sidebarTools,sidebarEnabled}=authorityDB();
  sidebarEnabled.adblock=true;
  sidebarTools.push({id:'prompt-shortcuts'});
  let value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(value.inventoryTypes.sidebar.installed,3);
  assert.equal(value.inventoryTypes.sidebar.enabled,3);
  assert.equal(value.inventoryTypes.app_service.bindings,1);
  assert.equal(value.inventoryTypes.app_service.unknown,1,
    'a package field alone cannot prove the original App Service binding');
  assert.equal(value.projectionGap,true);
  sidebarTools.splice(0,sidebarTools.length);
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(value.inventoryTypes.sidebar.installed,0);
  sidebarTools.push({id:'a'}, {id:'a'});
  await assert.rejects(readAnalyticsAuthorityProjection({storage,api,now:()=>NOW}),
    /Sidebar installation authority/);
});


test('R1.12 manual Page receipt stays out of automatic UTC totals, including same-document automatic boot',async()=>{
  const {storage,api,stores}=authorityDB();
  stores.frameworkKV.push({tag:'page-execution-v1',namespace,programId:pageId,
    receiptId:randomUUID(),createdAt:NOW,state:'completed',dispatchedAt:NOW,
    source:'manual',manualHostDocumentId:'real-host'});
  stores.frameworkKV.push(pageAutoReceipt());
  const value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'page','attempted')?.total,1);
  assert.equal(daily(value,'page','completed')?.total,1);
  assert.deepEqual(daily(value,'page','completed')?.sourceTotals,{page_auto:1});
  assert.equal(value.projectionGap,false);
});

test('Page automatic receipts need original Native install, source and Document identity',async()=>{
  const {storage,api,stores}=authorityDB();
  const valid=pageAutoReceipt();
  stores.frameworkKV.push(valid);
  const read=()=>readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(await read(),'page','completed')?.total,1);
  const tamper=[
    ['missing source',row=>{delete row.source;}],
    ['manifest hash',row=>{row.manifestHash='0'.repeat(64);}],
    ['source hash',row=>{row.sourceHash='not-a-hash';}],
    ['installation',row=>{row.installationId='forged';}],
    ['generation',row=>{row.grantGeneration=0;}],
    ['native token',row=>{row.installationToken='changed';}],
    ['wrong document key',row=>{row.documentId='replaced';}],
    ['dispatch precedes admission',row=>{row.dispatchedAt=row.createdAt-1;}]
  ];
  for(const [name,change] of tamper){
    const original=structuredClone(valid);change(valid);
    const actual=await read();
    assert.equal(daily(actual,'page','completed'),undefined,name);
    assert.equal(actual.projectionGap,true,name);
    Object.assign(valid,original);
  }
  stores.frameworkKV.push({tag:'page-execution-v1',namespace,
    programId:pageId,receiptId:randomUUID(),source:'page_auto',
    createdAt:NOW,state:'completed',dispatchedAt:NOW});
  const gap=await read();
  assert.equal(daily(gap,'page','completed')?.total,1);
  assert.equal(gap.projectionGap,true,'legacy row cannot become a second execution');
});

test('R1.12 Cloud forged installation/version/Result mapping is not counted',async()=>{
  const {storage,api,stores}=authorityDB();
  const runId=randomUUID(),resultId=randomUUID(),requestId='cloud:'+randomUUID(),
    sourceHash='a'.repeat(64),manifestHash='b'.repeat(64),installationId=randomUUID(),grantId='g1';
  const run={tag:'controller-run',namespace,runId,resultId,state:'completed',createdAt:NOW,
    scriptId:'task:task-1:1.0.0',revision:{sourceHash},contentHash:sourceHash,
    cloudRequestId:requestId,cloudRequestKey:'key:'+requestId,
    installedTaskAuthorization:{taskId:'task-1',version:'1.0.0',manifestHash,
      authorization:{installationId,generation:1}}};
  stores.runs.push(run);
  stores.results.push({tag:'controller-result',namespace,runId,resultId,
    revision:{sourceHash},state:'completed',outcome:{ok:true}});
  const request={tag:'cloud-request-v1',namespace,requestId,runId,
    storageKey:run.cloudRequestKey,grantId,
    task:{taskId:'task-1',version:'1.0.0',scriptId:'task:task-1:1.0.0',
      manifestHash,contentHash:sourceHash,installationId,generation:1},
    runRef:{runId,resultId,requestId,sourceHash,manifestHash,grantId}};
  stores.frameworkKV.push(request);
  let value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed')?.total,1);
  request.runRef.resultId=randomUUID();
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined);
  assert.equal(value.projectionGap,true);
  request.runRef.resultId=resultId;
  request.task.generation=2;
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined);
  assert.equal(value.projectionGap,true);
  request.task.generation=1;
  request.task.version='2.0.0';
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined,'wrong immutable task version');
  request.task.version='1.0.0';
  request.task.scriptId='replaced-script';
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined,'wrong installed script ID');
  request.task.scriptId='task:task-1:1.0.0';
  run.revision.sourceHash='c'.repeat(64);
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined,'run source not pinned to Cloud request');
  run.revision.sourceHash=sourceHash;
  stores.results[0].revision.sourceHash='c'.repeat(64);
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined,'forged terminal result source');
  stores.results[0].revision.sourceHash=sourceHash;
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed')?.total,1,
    'real Cloud Task semver and immutable script ID must be counted');
  request.task.version=3;
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined,
    'numeric fixture must not pass for a real installed Task version');
  assert.equal(value.projectionGap,true);
});
