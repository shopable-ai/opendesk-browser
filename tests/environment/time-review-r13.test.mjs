import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyReview,readReview,settleReview,reviewSummary,reviewDay,reviewClassify,
  reviewCategory,reviewExport,localDay,MAX_MINUTE_ROWS
} from '../../src/time-review/model.js';

const checkpoint=(at,host='example.com',session='session')=>({
  at,host,session,tabId:1,windowId:2,offset:new Date(at).getTimezoneOffset()
});
const t=(h=9,m=5,s=0)=>new Date(2026,9,11,h,m,s).getTime();

test('R1.3 migration preserves legacy v1 days and defaults to no minute consent',()=>{
  const legacy=emptyReview();
  legacy.days={'2026-10-11':{'example.com':1001}};
  delete legacy.categories;delete legacy.minuteConsent;delete legacy.minuteDays;
  const restored=readReview(legacy);
  assert.equal(restored.minuteConsent,false);
  assert.deepEqual(restored.minuteDays,{});
  assert.equal(reviewDay(restored,'2026-10-11').totalMs,1001);
  assert.equal(reviewDay(restored,'2026-10-11').minuteCoveredMs,0);
  assert.equal(reviewDay(restored,'2026-10-11').timelineStatus,'unavailable');
});

test('R1.3 a revoked minute-consent snapshot cannot leak orphan minute detail',()=>{
  const at=t(),raw=emptyReview(),day=localDay(at);
  raw.days[day]={'example.com':12000};
  raw.minuteConsent=false;
  raw.minuteDays[day]={offset:new Date(at).getTimezoneOffset(),
    ambiguous:false,truncated:false,entries:[[545,'example.com',12000]]};
  const s=readReview(raw);
  assert.deepEqual(s.minuteDays,{});
  assert.equal(reviewDay(s,day).totalMs,12000);
  assert.equal(reviewDay(s,day).timelineStatus,'unavailable');
  assert.deepEqual(JSON.parse(reviewExport(s,'json').text).minuteDays,{});
  assert.equal(raw.minuteDays[day].entries.length,1,'readReview cannot mutate stored source outside verified write');
});

test('R1.3 does not record future minute slots unless separately opted in',()=>{
  const at=t(),state=emptyReview();state.checkpoint=checkpoint(at);
  const next=settleReview(state,at+10000,{session:'session'});
  assert.equal(next.days[localDay(at)]['example.com'],10000);
  assert.deepEqual(next.minuteDays,{});
  assert.equal(reviewDay(next,localDay(at)).productivityPct,null);
});

test('R1.3 exact sub-minute milliseconds conserve across minute and category changes',()=>{
  const at=t(9,5,50),first=emptyReview();first.minuteConsent=true;first.checkpoint=checkpoint(at);
  let state=settleReview(first,at+20000,{session:'session'});
  assert.equal(state.days[localDay(at)]['example.com'],20000);
  assert.deepEqual(state.minuteDays[localDay(at)].entries,[[545,'example.com',10000],[546,'example.com',10000]]);
  assert.equal(reviewDay(state,localDay(at)).minuteCoveredMs,20000);
  assert.equal(reviewDay(state,localDay(at)).timelineStatus,'complete');
  reviewClassify(state,{host:'example.com',category:1});
  const day=reviewDay(state,localDay(at));
  assert.equal(day.categoryMs[1],20000);
  assert.equal(day.importantMs,20000);
  assert.equal(day.productivityPct,100);
  assert.deepEqual(day.minuteSlots.map(row=>row[1]),[1,1]);
  assert.equal(reviewSummary(state,at+20000).todayImportantMs,20000);
});

test('R1.3 real unclassified is category zero, never an empty timeline minute',()=>{
  const at=t(),state=emptyReview();state.minuteConsent=true;state.checkpoint=checkpoint(at);
  const next=settleReview(state,at+10000,{session:'session'});
  const day=reviewDay(next,localDay(at));
  assert.equal(day.minuteSlots[0][1],0);
  assert.equal(day.categoryMs[0],10000);
  assert.equal(day.timelineStatus,'complete');
  assert.equal(day.productivityPct,null);
});

test('R1.3 old summary plus new opted-in interval stays partial, never fabricates older minutes',()=>{
  const at=t(),state=emptyReview();
  state.days[localDay(at)]={'example.com':15000};
  state.minuteConsent=true;state.checkpoint=checkpoint(at);
  const next=settleReview(state,at+5000,{session:'session'});
  const day=reviewDay(next,localDay(at));
  assert.equal(day.totalMs,20000);
  assert.equal(day.minuteCoveredMs,5000);
  assert.equal(day.timelineStatus,'partial');
});

test('R1.3 user classification recalculates all retained daily totals and exports',()=>{
  const at=t(),state=emptyReview();
  const today=localDay(at),yesterday=localDay(at-86400000);
  state.days[today]={'example.com':2000,'other.example':5000};
  state.days[yesterday]={'example.com':8000};
  reviewClassify(state,{host:'example.com',category:2});
  reviewClassify(state,{host:'other.example',category:5});
  assert.equal(reviewDay(state,today).importantMs,2000);
  assert.equal(reviewDay(state,today).productivityPct,Math.round(2000/7000*100));
  assert.equal(reviewSummary(state,at).weekCategories.importantMs,10000);
  assert.equal(reviewCategory(state,'example.com'),2);
  assert.match(reviewExport(state,'csv').text,/"example.com",2000,2\.000,2/);
  const parsed=JSON.parse(reviewExport(state,'json').text);
  assert.equal(parsed.categories['example.com'],2);
  reviewClassify(state,{host:'example.com',category:0});
  assert.equal(reviewDay(state,today).productivityPct,null);
  assert.equal(reviewCategory(state,'example.com'),0);
});

test('R1.3 minute color uses dominant actual duration when multiple sites share a minute',()=>{
  const at=t(),s=emptyReview();s.minuteConsent=true;s.checkpoint=checkpoint(at,'first.example');
  let state=settleReview(s,at+15000,{session:'session'});
  state.checkpoint=checkpoint(at+15000,'second.example');
  state=settleReview(state,at+22000,{session:'session'});
  reviewClassify(state,{host:'first.example',category:1});
  reviewClassify(state,{host:'second.example',category:4});
  const [slot]=reviewDay(state,localDay(at)).minuteSlots;
  assert.equal(slot[1],1);
  assert.equal(slot[2],22000);
  assert.equal(slot[3],'多个网站');
});

test('R1.3 opt-out removal and time clear do not keep orphan categories/slots',()=>{
  const at=t(),s=emptyReview();s.minuteConsent=true;s.checkpoint=checkpoint(at);
  const a=settleReview(s,at+3000,{session:'session'});
  reviewClassify(a,{host:'example.com',category:1});
  a.minuteConsent=false;a.minuteDays={};
  assert.equal(reviewDay(a,localDay(at)).timelineStatus,'unavailable');
  assert.equal(reviewDay(a,localDay(at)).importantMs,3000);
  a.days={};a.minuteDays={};a.categories={};a.discardedMs=0;
  assert.equal(reviewDay(a,localDay(at)).totalMs,0);
  assert.deepEqual(a.categories,{});
});

test('R1.3 bounds invalid categories, private fields, fabricated detail and unsafe hosts',()=>{
  const s=emptyReview();s.days['2026-10-11']={'example.com':2000};
  assert.throws(()=>reviewClassify(s,{host:'https://example.com/private?q=secret',category:1}));
  assert.throws(()=>reviewClassify(s,{host:'unknown.example',category:1}));
  assert.throws(()=>reviewClassify(s,{host:'example.com',category:6}));
  assert.throws(()=>readReview({...s,categories:{'example.com':7}}));
  assert.throws(()=>readReview({...s,minuteConsent:'yes'}));
  const invalid=structuredClone(s);
  invalid.minuteDays['2026-10-11']={offset:0,ambiguous:false,truncated:false,entries:[[1440,'example.com',1000]]};
  assert.throws(()=>readReview(invalid));
  assert.ok(MAX_MINUTE_ROWS<10000);
});
