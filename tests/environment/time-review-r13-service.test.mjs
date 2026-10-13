import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeReviewService} from '../../src/time-review/service.js';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {timeReviewPackageHash,TIME_REVIEW_PROTOCOL,TIME_REVIEW_SESSION} from '../../src/time-review/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {TIME_REVIEW_KEY,emptyReview} from '../../src/time-review/model.js';

function emitter(){
  const listeners=new Set();
  return {addListener:callback=>listeners.add(callback),removeListener:callback=>listeners.delete(callback),emit(...args){for(const fn of listeners)fn(...args);}};
}
function locks(){
  const inflight=new Map();
  return {request(key,fn){const next=(inflight.get(key)||Promise.resolve()).then(fn);inflight.set(key,next.catch(()=>{}));return next;}};
}
async function makeFixture(){
  let clock=new Date(2026,9,11,10).getTime(),permission=true;
  const tool=await createSidebarToolPackage('examples/sidebar-tools/time-review'),hash=await timeReviewPackageHash(tool);
  const local={[SIDEBAR_TOOL_STORE]:[tool],
    [TIME_REVIEW_KEY]:{...emptyReview(),siteGrants:{allSites:true,origins:[]}}},session={},alarms=new Map();
  const area=data=>({
    async get(keys){return structuredClone(Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])));},
    async set(rows){Object.assign(data,structuredClone(rows));}
  });
  const sender={
    id:'abcdefghijklmnopabcdefghijklmnop',
    url:'chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?hostInstanceId=11111111-1111-4111-8111-111111111111&toolId=time-review',
    documentId:'doc-live',frameId:0,documentLifecycle:'active',tab:{id:99,incognito:false}
  };
  let contexts=[{contextType:'TAB',documentUrl:sender.url,documentId:sender.documentId,tabId:99,frameId:0,incognito:false}];
  const api={
    runtime:{id:sender.id,getURL:path=>'chrome-extension://'+sender.id+'/'+path,async getContexts(){return contexts;}},
    storage:{local:area(local),session:area(session),onChanged:emitter()},
    idle:{async queryState(){return 'active';},setDetectionInterval(){}},
    windows:{async getLastFocused(){return {id:2,type:'normal',focused:true,incognito:false};}},
    tabs:{async query(){return [{id:11,windowId:2,url:'https://example.com/?q=private',incognito:false}];}},
    permissions:{async contains(q){return q.permissions?permission:true;}},
    alarms:{async get(name){return alarms.get(name);},async create(name,value){alarms.set(name,value);},async clear(name){alarms.delete(name);}},
    downloads:{async download(){return 1;}}
  };
  const service=createTimeReviewService({api,lockManager:locks(),now:()=>clock});
  const call=(operation,payload={},override={})=>service.dispatch({
    protocol:TIME_REVIEW_PROTOCOL,toolId:'time-review',packageHash:hash,installEpoch:null,operation,payload,...override
  },sender);
  return {call,local,session,service,sender,api,advance:n=>{clock+=n;},setDocumentId:id=>{
    contexts=[{...contexts[0],documentId:id}];
  },setPermission:value=>{permission=value;}};
}

test('R1.3 minute opt-in records only future live intervals and opt-out purges detail',async()=>{
  const f=await makeFixture();
  assert.equal((await f.call('time.status')).minuteConsent,false);
  await f.call('time.start');f.advance(1000);
  const legacy=await f.call('time.day',{date:'2026-10-11'});
  assert.equal(legacy.totalMs,1000);
  assert.equal(legacy.minuteSlots.length,0);
  const enabled=await f.call('time.minuteConsent',{enabled:true});
  assert.equal(enabled.minuteConsent,true);
  f.advance(2200);
  const day=await f.call('time.day',{date:'2026-10-11'});
  assert.equal(day.totalMs,3200);
  assert.equal(day.minuteCoveredMs,2200);
  assert.equal(day.timelineStatus,'partial');
  assert.equal(f.local[TIME_REVIEW_KEY].minuteDays['2026-10-11'].entries.length,1);
  await f.call('time.minuteConsent',{enabled:false});
  assert.equal(f.local[TIME_REVIEW_KEY].minuteConsent,false);
  assert.deepEqual(f.local[TIME_REVIEW_KEY].minuteDays,{});
  assert.equal((await f.call('time.day',{date:'2026-10-11'})).totalMs,3200);
});

test('R1.3 classification updates real state/summary/day and export without altering ms',async()=>{
  const f=await makeFixture();await f.call('time.start');f.advance(9000);await f.call('time.pause');
  const before=await f.call('time.day',{date:'2026-10-11'});
  assert.equal(before.categoryMs[0],9000);
  const after=await f.call('time.classify',{host:'example.com',category:2});
  assert.equal(after.todayImportantMs,9000);
  assert.equal(after.todayProductivityPct,100);
  assert.equal((await f.call('time.day',{date:'2026-10-11'})).categoryMs[2],9000);
  assert.equal(f.local[TIME_REVIEW_KEY].days['2026-10-11']['example.com'],9000);
});

test('R1.3 new APIs validate payload, package identity and pinned document',async()=>{
  const f=await makeFixture();
  for(const payload of [{host:'unknown.example',category:1},{host:'example.com/path',category:1},{host:'example.com',category:8}])
    await assert.rejects(f.call('time.classify',payload),{code:'E_TIME_DATA'});
  await assert.rejects(f.call('time.minuteConsent',{enabled:'yes'}),{code:'E_TIME_DATA'});
  await assert.rejects(f.call('time.day',{date:'2010-01-01'}),{code:'E_TIME_DATA'});
  await assert.rejects(f.call('time.minuteConsent',{enabled:true},{packageHash:'0'.repeat(64)}),{code:'E_TOOL_CHANGED'});
  f.setDocumentId('new-doc');
  await assert.rejects(f.call('time.minuteConsent',{enabled:true}),{code:'E_TIME_AUTHORITY'});
  assert.equal(f.local[TIME_REVIEW_KEY]?.minuteConsent,false);
});

test('R1.3 restart never generates unobserved minute history',async()=>{
  const f=await makeFixture();await f.call('time.minuteConsent',{enabled:true});
  await f.call('time.start');f.advance(5000);
  await f.service.tick();f.advance(5000);
  await f.service.tick({boot:true});
  assert.equal((await f.call('time.day',{date:'2026-10-11'})).minuteCoveredMs,10000);
});
