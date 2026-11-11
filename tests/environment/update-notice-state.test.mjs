import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultUpdateNoticeState,readUpdateNoticeState,trustedUpdateReleaseKey,
  appendTrustedRelease,claimUpdateToast,acknowledgeUpdateToast,actOnUpdateToast,
  noticeEligible,setNoticePreference,updateNoticeSnapshot,formatUpdateBadgeCount,NOTICE_DAY_MS,
  UPDATE_NOTICE_STORE
} from '../../src/platform/chrome/update-notice-state.js';

const packageHash='a'.repeat(64);
const release=(id='prompt-shortcuts',version='1.2.3',sha256=packageHash)=>({
  kind:'sidebar-tool',id,version,sha256,
  key:trustedUpdateReleaseKey({id,version,sha256}),
  fromVersion:'1.2.2',title:id,status:'available',source:'opendesk/'+id,
  newCapabilities:[],requiresReview:true
});
const token=n=>'claim-'+String(n).padStart(8,'0')+'-abcd-4321-bbaa-000000000000';
const claim=(state,tabId,now,number)=>claimUpdateToast(state,{
  now,tabId,documentId:'document-'+tabId+'-same-frame',token:token(number)
});
const ack=(state,tabId,now,number)=>acknowledgeUpdateToast(state,{
  now,token:token(number),tabId,documentId:'document-'+tabId+'-same-frame'
});
const act=(state,tabId,now,number,action)=>actOnUpdateToast(state,{
  now,token:token(number),tabId,documentId:'document-'+tabId+'-same-frame',action
});
const prepare=(time=100000,values=[release()])=>{
  let state=defaultUpdateNoticeState();
  for(const row of values)state=appendTrustedRelease(state,row,time);
  return state;
};

test('update notice storage is profile-scoped, bounded and fail closed',()=>{
  assert.equal(UPDATE_NOTICE_STORE,'opendesk.update-notice.state.v1');
  const initial=readUpdateNoticeState(undefined);
  assert.equal(initial.globalMode,'toast+inbox');
  const s=prepare();
  assert.equal(readUpdateNoticeState(s).records[release().key].impressionCount,0);
  const bad=structuredClone(s);bad.records[release().key].impressionCount=99;
  assert.throws(()=>readUpdateNoticeState(bad),{code:'E_UPDATE_STATE_CORRUPT'});
  assert.throws(()=>readUpdateNoticeState({...s,globalMode:'always-popup'}),{
    code:'E_UPDATE_STATE_CORRUPT'});
});

test('three competing tabs: at most one claim; visible ACK increments once',()=>{
  const initial=prepare();
  const first=claim(initial,11,100001,1);
  assert.ok(first?.claim);
  assert.equal(first.claim.releaseKeys.length,1);
  assert.equal(claim(first.state,12,100002,2),null);
  assert.equal(claim(first.state,13,100003,3),null);
  assert.equal(first.state.records[release().key].impressionCount,0);
  // A tab died before paint: expired claim remains eligible for another owner.
  assert.equal(claim(first.state,12,130002,4)?.claim.tabId,12);
  const acked=ack(first.state,11,100010,1);
  assert.ok(acked&&!acked.duplicate);
  assert.equal(acked.state.records[release().key].impressionCount,1);
  assert.equal(ack(acked.state,11,100011,1).duplicate,true);
  assert.equal(claim(acked.state,13,100012,5),null);
});

test('first explicit snooze permits a single second toast after 24h',()=>{
  const time=100000;
  let state=prepare(time);
  const first=claim(state,1,time+1,1);assert.ok(first);
  state=ack(first.state,1,time+2,1).state;
  const action=act(state,1,time+3,1,'snooze');assert.ok(action);
  state=action;
  const row=state.records[release().key];
  assert.equal(row.snoozeUntil,time+3+NOTICE_DAY_MS);
  assert.equal(claim(state,2,time+3+NOTICE_DAY_MS-1,2),null);
  const second=claim(state,2,time+3+NOTICE_DAY_MS,2);assert.ok(second);
  state=ack(second.state,2,time+4+NOTICE_DAY_MS,2).state;
  assert.equal(state.records[release().key].impressionCount,2);
  state=act(state,2,time+5+NOTICE_DAY_MS,2,'snooze');
  assert.ok(state.records[release().key].dismissedAt);
  assert.equal(claim(state,3,time+NOTICE_DAY_MS*4,3),null);
});

test('closing, viewing and ignoring do not uninstall and do not repeat this version',()=>{
  for(const action of ['close','view','ignore','timeout']){
    const initial=prepare();
    const shown=claim(initial,1,100003,1);
    const state=act(ack(shown.state,1,100004,1).state,1,100005,1,action);
    const row=state.records[release().key];
    assert.equal(row.status,'available');
    assert.equal(row.impressionCount,1);
    assert.equal(claim(state,2,100004+NOTICE_DAY_MS*3,2),null);
    if(action==='view')assert.ok(row.viewedAt);
    if(action==='ignore')assert.ok(row.ignoredAt);
    if(action==='close'||action==='timeout')assert.ok(row.dismissedAt);
  }
});

test('three distinct releases aggregate to one claim but require separate review',()=>{
  const rows=[release('prompt-shortcuts'),release('reading-toc'),release('webflow')];
  const s=prepare(100000,rows);
  const result=claim(s,21,100010,1);
  assert.equal(result.claim.count,3);
  assert.match(result.claim.message,/3 项扩展有更新/);
  assert.equal(claim(result.state,22,100015,2),null);
  const next=ack(result.state,21,100020,1).state;
  assert.equal(Object.values(next.records).filter(row=>row.impressionCount===1).length,3);
});

test('per-tool inbox-only preference and global silence fence new web claims',()=>{
  const item=release();
  const initial=prepare();
  const local=setNoticePreference(initial,{mode:'inbox-only',toolId:item.id},101000);
  assert.equal(noticeEligible(local,local.records[item.key],101100),false);
  assert.equal(updateNoticeSnapshot(local).newCount,1);
  const global=setNoticePreference(local,{mode:'silent'},102000);
  assert.equal(claim(global,1,102100,1),null);
  assert.equal(global.globalMode,'silent');
});

test('unknown or applied never prompts; real applied state retains history',()=>{
  let state=prepare();
  const key=release().key;
  state=appendTrustedRelease(state,{...release(),status:'unknown'},100010);
  assert.equal(claim(state,1,100020,1),null);
  state=appendTrustedRelease(state,{...release(),status:'applied'},100030);
  assert.equal(state.records[key].status,'applied');
  assert.equal(updateNoticeSnapshot(state).newCount,0);
  assert.equal(claim(state,1,100040,2),null);
});

test('same semantic version with different package fingerprint is rejected',()=>{
  const initial=prepare();
  assert.throws(()=>appendTrustedRelease(initial,
    release('prompt-shortcuts','1.2.3','b'.repeat(64)),100200),
  {code:'E_UPDATE_RELEASE_CONFLICT'});
  const higher=appendTrustedRelease(initial,release('prompt-shortcuts','1.2.4','b'.repeat(64)),100300);
  assert.equal(Object.keys(higher.records).length,2);
});

test('invalid claim ownership and unknown action fail closed',()=>{
  const original=prepare();
  assert.throws(()=>claim(original,1,-1,1),{code:'E_UPDATE_CLAIM'});
  const first=claim(original,1,100001,1);
  assert.equal(ack(first.state,2,100005,1),null);
  assert.equal(act(first.state,2,100005,1,'ignore'),null);
  assert.throws(()=>act(first.state,1,100006,1,'install'),{code:'E_UPDATE_ACTION'});
});

test('badge counts reflect distinct actionable tools, not unread notices or browser apply',()=>{
  const releases=Array.from({length:10},(_,i)=>release('tool-'+i));
  let state=prepare(100000,releases);
  assert.equal(updateNoticeSnapshot(state).actionableCount,10);
  assert.equal(updateNoticeSnapshot(state).badgeCount,10);
  assert.equal(formatUpdateBadgeCount(10),'9+');
  assert.equal(formatUpdateBadgeCount(3),'3');
  assert.equal(formatUpdateBadgeCount(0),'');
  assert.throws(()=>formatUpdateBadgeCount(-1));
  const [first]=releases;
  state=actOnUpdateToast(state,{now:100100,action:'view',token:null,key:first.key});
  assert.equal(updateNoticeSnapshot(state).unreadCount,9);
  assert.equal(updateNoticeSnapshot(state).badgeCount,10,'viewed must still count');
  state=actOnUpdateToast(state,{now:100101,action:'ignore',token:null,key:first.key});
  assert.equal(updateNoticeSnapshot(state).badgeCount,9);
  state=setNoticePreference(state,{mode:'silent'},100102);
  assert.equal(updateNoticeSnapshot(state).actionableCount,9,'silent is not installed');
  assert.equal(updateNoticeSnapshot(state).badgeCount,0);
  state=setNoticePreference(state,{mode:'inbox-only'},100103);
  assert.equal(updateNoticeSnapshot(state).badgeCount,9);
  state=appendTrustedRelease(state,{
    kind:'browser',id:'a'.repeat(32),version:'1.2.3',
    key:'browser:'+('a'.repeat(32))+':1.2.3',title:'OpenDesk Browser',
    status:'pending_browser_apply'
  },100104);
  assert.equal(updateNoticeSnapshot(state).browserPendingCount,1);
  assert.equal(updateNoticeSnapshot(state).badgeCount,9,'browser apply does not count as Tool install');
  state=appendTrustedRelease(state,{...releases[1],status:'applied'},100105);
  assert.equal(updateNoticeSnapshot(state).badgeCount,8);
});

test('per-tool silent hides only that tool badge, with history still queryable',()=>{
  const a=release('tool-alpha'),b=release('tool-beta');
  let state=prepare(100000,[a,b]);
  state=setNoticePreference(state,{mode:'silent',toolId:a.id},100010);
  assert.equal(updateNoticeSnapshot(state).actionableCount,2);
  assert.equal(updateNoticeSnapshot(state).badgeCount,1);
  assert.equal(updateNoticeSnapshot(state).records.length,2);
});
