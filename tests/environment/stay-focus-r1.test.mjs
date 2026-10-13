import test from 'node:test';
import assert from 'node:assert/strict';
import {focusHost,hostnameMatches,focusLocalDay,FOCUS_MAX_GAP_MS} from '../../src/stay-focus/policy.js';
import {emptyFocus,readFocus,focusSite,focusSchedule,focusMatchingSite,focusPool,
  focusBudget,focusReason,focusScheduleActive,settleFocus} from '../../src/stay-focus/model.js';
import {focusRuleForSite,wantedFocusRules,reconcileFocusRules,clearFocusRules,isFocusRuleId}
  from '../../src/stay-focus/rule-host.js';

const at=new Date(2026,9,13,12,0,0).getTime();
const mkSite=(host,overrides={})=>({host,subdomains:true,enabled:true,mode:'limit',minutes:15,group:'',...overrides});
const tick=(state,time,site=null,options={})=>settleFocus(state,{at:time,session:'this-browser-session',
  current:site?{host:site.host,site,tabId:3,windowId:1}:null,...options});
test('strict hostname and IDN do not substring-match attacker domains',()=>{
  assert.equal(focusHost('HTTPS://YouTube.com/watch?v=secret'),'youtube.com');
  assert.equal(focusHost('https://例子.测试/path?token=secret'),'xn--fsqu00a.xn--0zwm56d');
  assert.equal(focusHost('http://localhost:43111/demo'),'localhost');
  assert.equal(focusHost('file:///etc/passwd'),null);
  assert.equal(focusHost('https://good.com@evil.com/x'),null);
  assert.equal(focusHost('chrome-extension://abcdefghijklmnop/path'),null);
  assert.equal(hostnameMatches('youtube.com','youtube.com',false),true);
  assert.equal(hostnameMatches('m.youtube.com','youtube.com',false),false);
  assert.equal(hostnameMatches('m.youtube.com','youtube.com',true),true);
  assert.equal(hostnameMatches('notyoutube.com','youtube.com',true),false);
  assert.equal(hostnameMatches('youtube.com.evil.test','youtube.com',true),false);
});
test('strict model schema, per-site enable and white-list exception',()=>{
  const s=emptyFocus(at);s.enabled=true;s.sites=[mkSite('example.com')];
  assert.equal(focusMatchingSite(s,'a.example.com')?.host,'example.com');
  assert.equal(focusMatchingSite(s,'badexample.com'),null);
  s.whitelist=['docs.example.com'];
  assert.equal(focusMatchingSite(s,'docs.example.com'),null);
  assert.equal(focusMatchingSite(s,'deep.docs.example.com'),null);
  assert.equal(focusMatchingSite(s,'video.example.com')?.host,'example.com');
  assert.equal(focusSite(mkSite('example.com',{enabled:false})).enabled,false);
  assert.throws(()=>focusSite(mkSite('example.com',{minutes:-5})));
  assert.throws(()=>focusSite(mkSite('example.com',{host:'example.com.evil',mode:'random'})));
  assert.throws(()=>readFocus({...s,extra:true},at));
});
test('foreground checkpoint charges one active tab, never double-spends shared group',()=>{
  const a=mkSite('example.com',{group:'social'}),b=mkSite('reddit.com',{group:'social'});
  const s=emptyFocus(at);s.enabled=true;s.groups.social=1;s.sites=[a,b];
  tick(s,at,a);
  tick(s,at+30000,b);
  assert.equal(s.usage['g:social'],30000);
  assert.equal(s.usage['s:example.com'],undefined);
  tick(s,at+59000,b);
  assert.equal(s.usage['g:social'],59000);
  assert.equal(focusReason(s,b,at+59000),null);
  tick(s,at+61000,b);
  assert.equal(s.usage['g:social'],61000);
  assert.equal(focusReason(s,a,at+61000),'quota');
  assert.equal(focusReason(s,b,at+61000),'quota');
  assert.equal(focusBudget(s,b),60000);
});
test('idle, worker boot, long sleep, backwards clock and time zone shifts never invent elapsed',()=>{
  const a=mkSite('example.com'),s=emptyFocus(at);s.enabled=true;s.sites=[a];
  tick(s,at,a);
  tick(s,at+20000,null,{boot:true}); // a revived SW cannot charge stale last timestamp
  assert.equal(s.usage['s:example.com'],undefined);
  tick(s,at+30000,a);
  tick(s,at+30000+FOCUS_MAX_GAP_MS+1,a);
  assert.equal(s.usage['s:example.com'],undefined);
  const rollback=tick(s,at+10000,a);
  assert.equal(rollback.clockRollback,true);
  assert.equal(s.usage['s:example.com'],undefined);
  assert.equal(s.checkpoint,null);
});
test('new local day clears usage, schedule handles workdays and overnight intervals',()=>{
  const a=mkSite('example.com'),s=emptyFocus(at);s.enabled=true;s.sites=[a];
  s.usage['s:example.com']=a.minutes*60000;s.day=focusLocalDay(at);
  assert.equal(focusReason(s,a,at),'quota');
  const midnight=new Date(at);midnight.setHours(0,0,0,0);midnight.setDate(midnight.getDate()+1);
  tick(s,midnight.getTime()+10000,a);
  assert.equal(s.usage['s:example.com'],undefined);
  assert.equal(focusReason(s,a,midnight.getTime()+10000),null);
  const work=focusSchedule({enabled:true,days:[2],startMinute:540,endMinute:1020});
  assert.equal(focusScheduleActive(work,new Date(2026,9,13,11,0,0).getTime()),true);
  assert.equal(focusScheduleActive(work,new Date(2026,9,13,20,0,0).getTime()),false);
  const night=focusSchedule({enabled:true,days:[2],startMinute:1320,endMinute:360});
  assert.equal(focusScheduleActive(night,new Date(2026,9,14,1,0,0).getTime()),true);
  assert.equal(focusScheduleActive(night,new Date(2026,9,14,7,0,0).getTime()),false);
});
test('session > work schedule > always blocked > exhausted budget',()=>{
  const s=emptyFocus(at),a=mkSite('example.com');
  s.enabled=true;s.sites=[a];s.usage['s:example.com']=900000;
  assert.equal(focusReason(s,a,at),'quota');
  a.mode='always';assert.equal(focusReason(s,a,at),'always');
  s.schedule={enabled:true,days:[new Date(at).getDay()],startMinute:0,endMinute:1440};
  assert.equal(focusReason(s,a,at),'schedule');
  s.focusUntil=at+60000;
  assert.equal(focusReason(s,a,at),'session');
  s.enabled=false;assert.equal(focusReason(s,a,at),null);
});
test('DNR rule uses exact regex main_frame and extension-owned block page',()=>{
  const exact=focusRuleForSite(mkSite('example.com',{subdomains:false}),730000,'quota');
  assert.deepEqual(exact.condition.resourceTypes,['main_frame']);
  assert.match(exact.condition.regexFilter,/example\\\.com/);
  assert.ok(new RegExp(exact.condition.regexFilter).test('https://example.com/path'));
  assert.ok(!new RegExp(exact.condition.regexFilter).test('https://example.com.evil.test/'));
  assert.ok(new RegExp(exact.condition.regexFilter).test('https://example.com./'),
    'canonical equivalent trailing-dot hostname must not bypass a restriction');
  assert.ok(!new RegExp(exact.condition.regexFilter).test('https://sub.example.com/'));
  const sub=focusRuleForSite(mkSite('example.com'),730001,'schedule',['docs.example.com']);
  assert.ok(new RegExp(sub.condition.regexFilter).test('https://sub.example.com/'));
  assert.equal(sub.action.redirect.extensionPath,'/stay-focus/blocked-schedule.html');
  assert.deepEqual(sub.condition.excludedRequestDomains,['docs.example.com']);
  assert.equal(isFocusRuleId(729999),false);
  assert.equal(isFocusRuleId(730000),true);
  assert.equal(isFocusRuleId(730200),false);
});
test('overlapping parent and child domains favor the more specific restriction',()=>{
  const parent=focusRuleForSite(mkSite('example.com',{subdomains:true}),730000,'quota');
  const child=focusRuleForSite(mkSite('docs.example.com',{subdomains:false}),730001,'always');
  assert.ok(new RegExp(parent.condition.regexFilter).test('https://docs.example.com/'));
  assert.ok(new RegExp(child.condition.regexFilter).test('https://docs.example.com/'));
  assert.ok(child.priority>parent.priority,'DNR must not choose an arbitrary parent reason');
  assert.ok(!new RegExp(child.condition.regexFilter).test('https://sub.docs.example.com/'));
});
test('DNR reconcile never modifies foreign rules and verifies actual committed bytes',async()=>{
  const foreign={id:55,priority:1,action:{type:'block'},condition:{urlFilter:'ads'}};
  const current=[foreign],writes=[];
  const api={declarativeNetRequest:{
    getDynamicRules:async()=>structuredClone(current),
    updateDynamicRules:async({removeRuleIds,addRules})=>{
      writes.push({removeRuleIds,addRules});for(const id of removeRuleIds){
        const index=current.findIndex(row=>row.id===id);if(index>=0)current.splice(index,1);
      }current.push(...structuredClone(addRules));
    }
  }};
  const wanted=[focusRuleForSite(mkSite('example.com'),730000,'always')];
  const receipt=await reconcileFocusRules(api,wanted);
  assert.equal(receipt.verified,true);
  assert.deepEqual(current.map(row=>row.id).sort((a,b)=>a-b),[55,730000]);
  assert.deepEqual(writes[0].removeRuleIds,[]);
  assert.equal((await reconcileFocusRules(api,wanted)).changed,false);
  await clearFocusRules(api);
  assert.deepEqual(current.map(row=>row.id),[55]);
});
test('DNR write failure and readback corruption are not called successful',async()=>{
  const wanted=[focusRuleForSite(mkSite('example.com'),730000,'quota')];
  const rejecting={declarativeNetRequest:{getDynamicRules:async()=>[],
    updateDynamicRules:async()=>{throw Error('forced DNR failure');}}};
  await assert.rejects(reconcileFocusRules(rejecting,wanted),/forced DNR failure/);
  const noPersist={declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async()=>{}}};
  await assert.rejects(reconcileFocusRules(noPersist,wanted),error=>error.code==='E_FOCUS_DNR_MISMATCH');
});
test('independent Time Review never imported as model state or authority',async()=>{
  const {FOCUS_STORE}=await import('../../src/stay-focus/policy.js');
  const {TIME_REVIEW_KEY}=await import('../../src/time-review/model.js');
  assert.notEqual(FOCUS_STORE,TIME_REVIEW_KEY);
  const {FOCUS_ID}=await import('../../src/stay-focus/policy.js');
  assert.equal(FOCUS_ID,'stay-focus');
});
