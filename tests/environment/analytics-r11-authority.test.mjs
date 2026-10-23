import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
    {tag:'schedule-definition-v1',namespace,scheduleId:'sched-1',deleted:false},
  ],runs:[],results:[]};
  const storage={transaction:async(_names,mode,work)=>{
    assert.equal(mode,'readonly');
    return work({all:async name=>structuredClone(stores[name])});
  }};
  const api={runtime:{id:'analytics-r11-test'},
    userScripts:{async getScripts(){return [{id:'native-page-1'}];}},
    permissions:{async contains(){return true;}}};
  return {storage,api,stores};
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
test('read-only Page/Task/Scheduler authority: 100 actual Page receipts; no fake DAU',async()=>{
  const {storage,api,stores}=authorityDB();
  for(let i=0;i<100;i++)stores.frameworkKV.push({
    tag:'page-execution-v1',namespace,programId:pageId,
    receiptId:randomUUID(),createdAt:NOW-1000,state:'completed',effectConfirmed:true,
    dispatchedAt:NOW-1500
  });
  const runId=randomUUID(),resultId=randomUUID(),fireId='fire:2026-10-23:1';
  stores.frameworkKV.push({tag:'schedule-fire-v1',namespace,
    fireId,runId,resultId,status:'ADMITTED'});
  stores.runs.push({tag:'controller-run',namespace,runId,resultId,scheduledFireId:fireId,
    installedTaskAuthorization:{taskId:'task-1'},createdAt:NOW,state:'completed'});
  stores.results.push({tag:'controller-result',namespace,runId,resultId,state:'completed',outcome:{ok:true}});
  const data=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.deepEqual(data.inventoryTypes,{
    page:{installed:1,enabled:1,disabled:0,blocked:0,unknown:0},
    task:{installed:1,enabled:1,disabled:0,blocked:0,unknown:0},
    scheduler:{definitions:1}});
  assert.equal(daily(data,'page','attempted')?.total,100);
  assert.equal(daily(data,'page','completed')?.total,100);
  assert.equal(daily(data,'task','attempted')?.total,1);
  assert.equal(daily(data,'task','completed')?.total,1);
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
  stores.runs.push({tag:'controller-run',namespace,runId,resultId,scheduledFireId:'f-1',
    installedTaskAuthorization:{taskId:'task-1'},createdAt:NOW,state:'paused_unknown'});
  let value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','outcome_unknown')?.total,1);
  stores.results.push({tag:'controller-result',namespace,runId:'forged-other-run',resultId,state:'completed',
    outcome:{ok:true}});
  value=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW});
  assert.equal(daily(value,'task','completed'),undefined);
  assert.equal(value.projectionGap,true);
});
test('consent gates readback and daily version; automatic runs do not invent app.opened',async()=>{
  const {api:ext,values}=memory();const {api,storage,stores}=authorityDB();
  for(let i=0;i<100;i++)stores.frameworkKV.push({tag:'page-execution-v1',namespace,
    programId:pageId,receiptId:randomUUID(),createdAt:NOW,state:'completed',dispatchedAt:NOW});
  const collector=createAnalyticsCollector({api:ext,endpoint:'https://analytics.example/v1/events',
    now:()=>NOW,newId:randomUUID,fetcher:async()=>{throw Error('offline');}});
  // Old execution remains in the original Authority but was never consented.
  stores.frameworkKV.push({tag:'page-execution-v1',namespace,programId:pageId,
    receiptId:randomUUID(),createdAt:NOW-60000,state:'completed',dispatchedAt:NOW-60000});
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
  stores.frameworkKV.push({tag:'page-execution-v1',namespace,
    programId:pageId,receiptId:randomUUID(),createdAt:NOW,state:'completed',dispatchedAt:NOW});
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
    metricType:'completed',total:100,version:1};
  assert.equal(validateAnalyticsEvent(row,{now:NOW}).total,100);
  for(const invalid of [
    {...row,toolId:'custom-secret-script'},
    {...row,source:'tool_reported'},
    {...row,metricType:'business_effect_verified'},
    {...row,url:'https://private.example'},
    {...row,outcome:{success:true}},
    {...row,total:0},
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
  stores.frameworkKV.push({tag:'page-execution-v1',namespace,programId:pageId,
    receiptId:randomUUID(),createdAt:sameDay,state:'completed',dispatchedAt:sameDay});
  stores.frameworkKV.push({tag:'page-execution-v1',namespace,programId:pageId,
    receiptId:randomUUID(),createdAt:NOW+1000,state:'failed',dispatchedAt:NOW+1000});
  const before=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW,since:0});
  const after=await readAnalyticsAuthorityProjection({storage,api,now:()=>NOW,since:NOW});
  assert.equal(before.inventoryTypes.page.installed,1);
  assert.equal(after.inventoryTypes.page.installed,1);
  assert.equal(daily(before,'page','attempted')?.total,2);
  assert.equal(daily(after,'page','attempted')?.total,1);
  assert.equal(daily(after,'page','completed'),undefined);
  assert.equal(daily(after,'page','failed')?.total,1);
});
