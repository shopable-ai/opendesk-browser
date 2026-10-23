import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAnalyticsCollector} from '../../src/analytics/collector.js';
import {ANALYTICS_DISCLOSURE_VERSION,ANALYTICS_STATE_KEY} from '../../src/analytics/contract.js';

const BASE=Date.UTC(2026,9,23,12);
function memoryChrome(){
  const values=new Map();
  const api={storage:{local:{
    async get(key){return {[key]:structuredClone(values.get(key))};},
    async set(obj){for(const [key,value] of Object.entries(obj))
      values.set(key,structuredClone(value));}
  }},alarms:{async create(){},async clear(){}}};
  return {api,values};
}
function instance(api,clock,fetcher=async()=>{throw Error('offline')}){
  return createAnalyticsCollector({api,endpoint:'https://analytics.example/v1/events',
    fetcher,now:clock,newId:randomUUID});
}
const savedState=values=>values.get(ANALYTICS_STATE_KEY);
const prompt={event:'prompt.saved',toolId:'prompt-shortcuts',source:'host',channel:'sidepanel'};
const census={event:'app.inventory',toolId:'opendesk',source:'host',
  channel:'extension',installedTools:['cookie-editor','prompt-shortcuts']};
const approve=collector=>collector.setConsent(true,{disclosureVersion:ANALYTICS_DISCLOSURE_VERSION});

test('R1.9 legacy authorization without matching disclosure is quarantined (including queued data)',async()=>{
  const {api,values}=memoryChrome();
  let clock=BASE,transmissions=0;
  const fetcher=async()=>{transmissions++;throw Error('unexpected');};
  const first=instance(api,()=>clock,fetcher);
  assert.equal((await first.status()).consent,false);
  assert.deepEqual(await first.record(prompt),{recorded:false});
  assert.equal(savedState(values),undefined,'opt-out does not even create an identity');
  await assert.rejects(first.setConsent(true),{code:'E_ANALYTICS_DISCLOSURE'});
  assert.equal(savedState(values),undefined);
  await approve(first);
  await first.record(prompt);
  const before=structuredClone(savedState(values));
  assert.equal(before.consentReceipt.disclosureVersion,ANALYTICS_DISCLOSURE_VERSION);
  assert.equal(before.consentReceipt.acceptedAt,BASE);
  assert.equal(before.queue.length,1);
  delete before.consentReceipt; // simulate an R1.1 unversioned grant
  values.set(ANALYTICS_STATE_KEY,before);
  const afterUpgrade=instance(api,()=>clock,fetcher);
  assert.deepEqual(await afterUpgrade.status(),{
    configured:true,consent:false,queued:0,needsReview:true,
    coverageGap:false,coverage:{overflow:0,expired:0}
  });
  assert.deepEqual(await afterUpgrade.record(prompt),{recorded:false});
  assert.deepEqual(await afterUpgrade.flush(),{sent:0});
  await afterUpgrade.ensureWake();
  assert.equal(transmissions,0,'historical queue must never leak after upgrade');
  await approve(afterUpgrade);
  const newState=savedState(values);
  assert.notEqual(newState.installId,before.installId);
  assert.equal(newState.queue.length,0,'unverified events are never carried to a new grant');
  await afterUpgrade.setConsent(false);
  assert.equal(savedState(values).installId,null);
  assert.equal(savedState(values).consentReceipt,null);
});

test('R1.9 matching disclosure survives SW restart without nagging or regenerating identity',async()=>{
  const {api,values}=memoryChrome();
  const first=instance(api,()=>BASE);
  await approve(first);
  const id=savedState(values).installId;
  const other=instance(api,()=>BASE);
  assert.equal((await other.status()).consent,true);
  await approve(other);
  assert.equal(savedState(values).installId,id);
  assert.equal(savedState(values).consentReceipt.acceptedAt,BASE);
  await other.setConsent(false);
  assert.equal((await first.status()).consent,false);
});

test('R1.9 unchanged inventory heartbeat is fresh without inventing active use',async()=>{
  const {api,values}=memoryChrome();
  let clock=BASE;
  const current=instance(api,()=>clock);
  await approve(current);
  assert.equal((await current.record(census)).recorded,true);
  assert.equal((await current.record(census)).recorded,false);
  clock+=23*60*60*1000;
  assert.equal((await current.record(census)).recorded,false);
  clock+=60*60*1000;
  assert.equal((await current.record(census)).recorded,true);
  const snapshot=savedState(values).queue;
  assert.equal(snapshot.length,1,'latest pending census replaces prior pending census');
  assert.equal(snapshot[0].event,'app.inventory');
  assert.equal(snapshot[0].timestamp,new Date(clock).toISOString());
  assert.equal(snapshot.filter(e=>e.event==='app.opened'||e.event==='tool.engaged').length,0);
});

test('R1.9 overflow and expiry are flagged as gaps, never reported as zero coverage',async()=>{
  const {api,values}=memoryChrome();
  let clock=BASE;
  const current=instance(api,()=>clock);
  await approve(current);
  for(let i=0;i<260;i++)await current.record(prompt);
  const before=await current.status();
  assert.equal(before.queued,250);
  assert.equal(before.coverageGap,true);
  assert.equal(before.coverage.overflow,10);
  clock+=8*86400000;
  await current.record(prompt);
  const after=await current.status();
  assert.equal(after.queued,1);
  assert.equal(after.coverageGap,true);
  assert.equal(after.coverage.expired,250);
  assert.equal(savedState(values).coverage.expired,250);
  await current.setConsent(false);
  assert.equal((await current.status()).coverageGap,false);
});

test('R1.9 census exposes monotonic coverage gaps without manufacturing active users',async()=>{
  const {api,values}=memoryChrome();
  let clock=BASE;
  const current=instance(api,()=>clock);
  await approve(current);
  assert.equal((await current.record(census)).recorded,true);
  for(let i=0;i<260;i++)await current.record(prompt);
  assert((await current.status()).coverage.overflow>=10);
  // No 24-hour delay after new gaps, even if tool installations are unchanged.
  assert.equal((await current.record(census)).recorded,true);
  const state=savedState(values),last=state.queue.find(row=>row.event==='app.inventory');
  assert.deepEqual(last.coverage,{...state.coverage,
    version:state.coverage.overflow+state.coverage.expired});
  assert.equal(state.inventoryCoverageVersion,last.coverage.version);
  assert.equal((await current.record(census)).recorded,false);
  assert(!state.queue.some(row=>row.event==='app.opened'||row.event==='tool.engaged'));
  clock+=8*86400000;
  assert.equal((await current.record(census)).recorded,true);
  const next=savedState(values),latest=next.queue.find(row=>row.event==='app.inventory');
  assert(next.coverage.expired>=250);
  assert(latest.coverage.version>last.coverage.version);
  assert.deepEqual(latest.coverage,{...next.coverage,
    version:next.coverage.overflow+next.coverage.expired});
});
test('R1.9 unreviewed v2 grant cannot authorize new loss counter categories',async()=>{
  const {api,values}=memoryChrome();
  const first=instance(api,()=>BASE);
  await approve(first);
  const old=structuredClone(savedState(values));
  old.consentReceipt.disclosureVersion='analytics-disclosure-2026-10-23-v2';
  values.set(ANALYTICS_STATE_KEY,old);
  const changed=instance(api,()=>BASE);
  assert.equal((await changed.status()).consent,false);
  assert.equal((await changed.status()).needsReview,true);
  assert.deepEqual(await changed.record(census),{recorded:false});
});
