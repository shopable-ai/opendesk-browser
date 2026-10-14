import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {focusHost,hostnameMatches,focusRemovedOriginAffectsSite,focusLocalDay,FOCUS_MAX_GAP_MS,FOCUS_PAGE_NOTICE_PROTOCOL} from '../../src/stay-focus/policy.js';
import {installFocusPageNotice} from '../../src/stay-focus/page-notice.js';
import {emptyFocus,readFocus,focusSite,focusSiteScopesValid,focusSchedule,focusMatchingSite,focusPool,
  focusBudget,focusReason,focusScheduleActive,settleFocus,focusDueReminder,focusSummary} from '../../src/stay-focus/model.js';
import {FOCUS_CATALOG,focusCatalogMatch,focusDefaultSites} from '../../src/stay-focus/catalog.js';
import {installStayFocusBlockedPage} from '../../src/stay-focus/blocked.js';
import {focusRuleForSite,wantedFocusRules,reconcileFocusRules,clearFocusRules,isFocusRuleId}
  from '../../src/stay-focus/rule-host.js';

const at=new Date(2026,9,13,12,0,0).getTime();
const mkSite=(host,overrides={})=>({host,subdomains:true,enabled:true,mode:'limit',minutes:15,group:'',...overrides});
const tick=(state,time,site=null,options={})=>settleFocus(state,{at:time,session:'this-browser-session',
  current:site?{host:site.host,site,tabId:3,windowId:1}:null,...options});
test('R3.1 Stay Focus CI resolves the current package version instead of pinning old artifacts',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/stay-focus-r1.yml',import.meta.url),'utf8');
  assert.match(workflow,/examples\/sidebar-tools\/stay-focus\/tool\.config\.json/);
  assert.match(workflow,/artifacts\/sidebar-tools\/stay-focus\/\$version\/stay-focus\.opendesk-tool\.json/);
  assert.doesNotMatch(workflow,/artifacts\/sidebar-tools\/stay-focus\/1\.0\.0\//);
});

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
test('Chrome origin revocation patterns are scoped to affected website rules',()=>{
  const parent=mkSite('example.com'),exact=mkSite('example.com',{subdomains:false});
  assert.equal(focusRemovedOriginAffectsSite('https://example.com/*',parent),true);
  assert.equal(focusRemovedOriginAffectsSite('https://child.example.com/*',parent),true);
  assert.equal(focusRemovedOriginAffectsSite('https://child.example.com/*',exact),false);
  assert.equal(focusRemovedOriginAffectsSite('*://*.example.com/*',exact),true);
  assert.equal(focusRemovedOriginAffectsSite('https://unrelated.test/*',parent),false);
  assert.equal(focusRemovedOriginAffectsSite('<all_urls>',parent),true);
  assert.equal(focusRemovedOriginAffectsSite('*://*/*',parent),true);
  assert.equal(focusRemovedOriginAffectsSite('https://example.com.evil.test/*',parent),false);
  assert.equal(focusRemovedOriginAffectsSite('not-a-host-pattern',parent),false);
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
test('paused sites never create a DNR rule and nested child overrides parent exactly',()=>{
  const parent=mkSite('example.com',{mode:'always',subdomains:true});
  const child=mkSite('docs.example.com',{mode:'always',enabled:false,subdomains:true});
  const state=emptyFocus(at);state.enabled=true;state.sites=[parent,child];
  assert.equal(focusSiteScopesValid(state.sites),true);
  assert.equal(focusMatchingSite(state,'docs.example.com'),null,'paused child protects from parent fallback');
  assert.equal(focusReason(state,child,at),null,'paused always-block site cannot produce a block');
  let rules=wantedFocusRules(state,at);
  assert.equal(rules.length,1,'only enabled parent has a DNR rule');
  assert.deepEqual(rules[0].condition.excludedRequestDomains,['docs.example.com']);
  child.enabled=true;child.mode='limit';
  rules=wantedFocusRules(state,at);
  assert.equal(rules.length,1,'child with remaining time should not be overblocked by parent');
  assert.deepEqual(rules[0].condition.excludedRequestDomains,['docs.example.com']);
  child.mode='always';
  rules=wantedFocusRules(state,at);
  assert.equal(rules.length,2,'child becomes blocked independently once its own rule activates');
  assert.ok(rules.some(r=>r.action.redirect.extensionPath==='/stay-focus/blocked-always.html'));
  child.subdomains=false;
  assert.equal(focusSiteScopesValid(state.sites),false,
    'Chrome domain exclusions cannot safely implement exact-only nested overrides');
  assert.throws(()=>readFocus(state,at),{code:'E_FOCUS_DATA',
    message:/本机策略数据无效；已停止修改以保护原始数据/});
});

test('foreground checkpoint charges one active tab, never double-spends shared group',()=>{
  const a=mkSite('example.com',{group:'social'}),b=mkSite('reddit.com',{group:'social'});
  const s=emptyFocus(at);s.enabled=true;s.groups.social=1;s.sites=[a,b];
  tick(s,at,a);
  tick(s,at+30000,a); // still observed foreground until this checkpoint
  tick(s,at+30000,b); // navigation changes site, but cannot bill two tabs
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
test('hidden tab, idle Chrome and tab switching cannot charge a stale foreground checkpoint',()=>{
  const a=mkSite('example.com'),b=mkSite('reddit.com'),s=emptyFocus(at);
  s.enabled=true;s.sites=[a,b];
  tick(s,at,a);
  tick(s,at+12000,null); // Chrome idle, unfocused or current tab no longer billable
  assert.equal(s.usage['s:example.com'],undefined);
  assert.equal(s.checkpoint,null);
  tick(s,at+20000,a);
  tick(s,at+31000,b); // different foreground host, previous site no longer observed
  assert.equal(s.usage['s:example.com'],undefined);
  tick(s,at+43000,a);
  assert.equal(s.usage['s:reddit.com'],undefined);
  tick(s,at+58000,a);
  assert.equal(s.usage['s:example.com'],15000);
});
test('DNR IDs remain stable when a different configured site activates or pauses',()=>{
  const a=mkSite('alpha.example',{mode:'limit'}),b=mkSite('beta.example',{mode:'always'});
  const s=emptyFocus(at);s.enabled=true;s.sites=[a,b];
  const before=wantedFocusRules(s,at);
  assert.equal(before.length,1);
  const betaId=before[0].id;
  a.mode='always';
  const during=wantedFocusRules(s,at);
  assert.equal(during.length,2);
  assert.equal(during.find(rule=>rule.condition.regexFilter.includes('beta'))?.id,betaId);
  a.enabled=false;
  const after=wantedFocusRules(s,at);
  assert.deepEqual(after.map(rule=>rule.id),[betaId]);
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
test('DNR semantic readback repairs unexpected origin filters and redirect fields',async()=>{
  const wanted=focusRuleForSite(mkSite('youtube.com'),730000,'quota');
  const stored=[structuredClone(wanted)];let writes=0;
  stored[0].condition.requestDomains=['unrelated.example'];
  const api={declarativeNetRequest:{
    getDynamicRules:async()=>structuredClone(stored),
    updateDynamicRules:async({removeRuleIds,addRules})=>{
      assert.deepEqual(removeRuleIds,[730000]);
      writes++;
      stored.splice(0,stored.length,...structuredClone(addRules));
    }
  }};
  const repaired=await reconcileFocusRules(api,[wanted]);
  assert.equal(repaired.changed,true,
    'extra requestDomains narrows the rule and must not be treated as verified');
  assert.equal(writes,1);
  stored[0].action.redirect.url='https://unexpected.example/';
  assert.equal((await reconcileFocusRules(api,[wanted])).changed,true,
    'unexpected redirect settings must be removed');
  stored[0].condition.isUrlFilterCaseSensitive=true;
  assert.equal((await reconcileFocusRules(api,[wanted])).changed,true,
    'a case-sensitive rule can allow differently-cased URL hosts');
  stored[0].condition.isUrlFilterCaseSensitive=false;
  assert.equal((await reconcileFocusRules(api,[wanted])).changed,false,
    'an explicit Chrome default false is semantically equivalent');
  assert.equal(writes,3);
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

test('internal block page uses a real window ID and never defers sidePanel.open past user click',async()=>{
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',handlers:{},
      addEventListener(type,fn){this.handlers[type]=fn;}});
    return elements.get(id);
  };
  const opened=[],visited=[],history={length:1,back(){visited.push('history-back');}};
  const api={windows:{getCurrent:async()=>({id:27})},sidePanel:{open(options){
    opened.push(options);return Promise.resolve();
  }}};
  installStayFocusBlockedPage({doc:{getElementById:get},api,
    locationRef:{pathname:'/stay-focus/blocked-quota.html',replace:url=>visited.push(url)},
    historyRef:history});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(get('reason').textContent,/额度/);
  assert.equal(get('resume').textContent.includes('明天'),true);
  get('settings').handlers.click({isTrusted:false});
  assert.equal(opened.length,0,'a forged click cannot request privileged Side Panel');
  get('settings').handlers.click({isTrusted:true});
  assert.deepEqual(opened,[{windowId:27}],'open must use actual pre-read Chrome window ID');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(get('hint').textContent,/工具/);
  get('back').handlers.click({isTrusted:true});
  assert.deepEqual(visited,['about:blank'],'no previous history must not loop back to blocked URL');
});


test('quick website recommendations use existing trusted save and never auto-install rules',async()=>{
  const {runInNewContext}=await import('node:vm');
  const script=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/main.js',import.meta.url),'utf8');
  function mount(page){
    const dom=new Map(),writes=[];
    class Node{
      constructor(){this.handlers={};this.children=[];this.dataset={};this.style={};
        this.hidden=false;this.value='';this.textContent='';this.checked=false;}
      addEventListener(name,handler){this.handlers[name]=handler;}
      replaceChildren(...nodes){this.children=nodes;}
      append(...nodes){this.children.push(...nodes);}
      setAttribute(){}
      focus(){}
      querySelectorAll(){return [];}
    }
    const root={querySelector:selector=>{
      if(!dom.has(selector))dom.set(selector,new Node());
      return dom.get(selector);
    },querySelectorAll:()=>[]};
    const empty={enabled:false,day:'2026-10-13',permissions:{ready:false},sites:[],
      catalog:FOCUS_CATALOG,dailyBudget:{minutes:30,budgetMs:1800000,usedMs:0,remainingMs:1800000,managedCount:0},
      groups:{},schedule:{enabled:false,days:[],startMinute:540,endMinute:1020},
      focusUntil:null,ruleReceipt:{verified:false}};
    let state=empty;
    const request=async(op,data)=>{
      if(op==='focus.status')return state;
      if(op==='currentPage.info')return page;
      if(op==='focus.disable')
        throw Object.assign(new Error('仅受信任的设置可停用'),{code:'E_FOCUS_TRUSTED_CLICK'});
      if(op==='focus.site.put'){
        writes.push(data.site);
        state={...state,sites:[{...data.site,usedMs:0,remainingMs:data.site.minutes*60000,
          budgetMs:data.site.minutes*60000,reason:null}]};
        return state;
      }
      throw Error('unexpected operation: '+op);
    };
    runInNewContext(script,{globalThis:{OpenDeskTool:{root,request}},
      document:{createElement:()=>new Node()},URL,
      Option:class{constructor(label,value){this.label=label;this.value=value;}},
      setInterval:()=>0});
    return {get:id=>root.querySelector('#'+id),writes};
  }
  const youtube=mount({status:'available',url:'https://m.youtube.com/watch?v=sample',
    title:'Python tutorials on YouTube'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(youtube.get('quick-site').textContent,/youtube.com/);
  assert.match(youtube.get('quick-explanation').textContent,/共享 30 分钟/);
  assert.equal(youtube.writes.length,0,'recognition must not silently apply DNR limits');
  youtube.get('focus-pause').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(youtube.get('message').textContent,/打开外层可信设置.*停止所有 Stay Focus 限制/);
  assert.equal(youtube.get('message').dataset.error,'false',
    'a native-settings redirect cannot report that restrictions were stopped');
  youtube.get('quick-add').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(youtube.writes)),[{
    host:'youtube.com',subdomains:true,enabled:true,mode:'limit',minutes:30,group:'entertainment'
  }],'one click must request the existing Host operation for the ONE shared pool');
  const forged=mount({status:'available',url:'https://youtube.com.attacker.test/',
    title:'Video portal featuring YouTube'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(forged.get('quick-site').textContent,'youtube.com.attacker.test',
    'site title cannot impersonate an official root domain');
  assert.equal(forged.writes.length,0);
  const work=mount({status:'available',url:'https://github.com/shopable-ai/opendesk-browser',
    title:'My development work'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(work.get('quick-explanation').textContent,/默认不限制/);
  assert.equal(work.get('quick-add').hidden,true);
});

test('isolated Stay Focus UI retains narrow-layout, dark-mode, keyboard and status contracts',()=>{
  const css=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/style.css',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/main.js',import.meta.url),'utf8');
  assert.match(css,/@media\(max-width:360px\)/);
  assert.match(css,/@media\(max-width:320px\)/);
  assert.match(css,/@media\(prefers-color-scheme:dark\)/);
  assert.match(css,/:focus-visible/);
  assert.match(main,/浏览器权限未授权/);
  assert.match(main,/规则未核对/);
  assert.match(main,/已暂停/);
});

test('R1.4 fixed trusted classification, single 30-minute pool and old durable records',()=>{
  assert.equal(focusCatalogMatch('m.youtube.com')?.host,'youtube.com');
  assert.equal(focusCatalogMatch('youtube.com.evil.example'),null);
  assert.equal(focusCatalogMatch('foo-youtube.com'),null);
  assert.equal(focusCatalogMatch('docs.google.com')?.auto,false);
  assert.equal(focusCatalogMatch('github.com')?.minutes,0);
  const defaults=focusDefaultSites();
  assert.equal(defaults.length,FOCUS_CATALOG.filter(row=>row.auto).length);
  assert.ok(defaults.length>2&&defaults.length<=60);
  assert.ok(defaults.every(site=>site.group==='entertainment'&&site.minutes===30));
  const s=emptyFocus(at);s.enabled=true;s.groups.entertainment=30;s.sites=defaults;
  const a=focusMatchingSite(s,'youtube.com'),b=focusMatchingSite(s,'www.tiktok.com');
  tick(s,at,a);tick(s,at+30000,a);tick(s,at+30000,b);tick(s,at+60000,b);
  assert.equal(s.usage['g:entertainment'],60000);
  assert.equal(s.usage['s:youtube.com'],undefined);
  assert.equal(s.usage['s:tiktok.com'],undefined);
  assert.equal(focusSummary(s,at+60000).dailyBudget.usedMs,60000);
  assert.equal(focusSummary(s,at+60000).dailyBudget.budgetMs,1800000);
  const {notices,...old}=s,restored=readFocus(old,at+60000);
  assert.deepEqual(restored.usage,s.usage,'older v1 usage is never cleared');
  assert.deepEqual(restored.sites,s.sites,'older custom site rules are never overwritten');
  assert.deepEqual(restored.notices.thresholds,[]);
  assert.throws(()=>readFocus({...s,notices:{...s.notices,thresholds:[1,1]}},at));
});
test('R1.4 reminder thresholds are charged-only, persisted and at most once',()=>{
  const s=emptyFocus(at);s.enabled=true;s.groups.entertainment=30;
  s.sites=focusDefaultSites();const site=s.sites[0];
  assert.equal(focusDueReminder(s,site,0,0),null);
  assert.equal(focusDueReminder(s,site,0,60000),null);
  assert.equal(focusDueReminder(s,site,19*60000,20*60000)?.minutes,10);
  assert.equal(focusDueReminder(s,site,19*60000,20*60000),null);
  assert.equal(focusDueReminder(s,site,24*60000,25*60000)?.minutes,5);
  assert.equal(focusDueReminder(s,site,28*60000,29*60000)?.minutes,1);
  assert.deepEqual(s.notices.thresholds,[10,5,1]);
  assert.equal(focusDueReminder(s,site,29*60000,30*60000),null,'zero means DNR, not an old reminder');
  const persisted=readFocus(s,at);
  assert.deepEqual(persisted.notices.thresholds,[10,5,1]);
  const delayed=emptyFocus(at);delayed.enabled=true;delayed.groups.entertainment=30;delayed.sites=focusDefaultSites();
  assert.equal(focusDueReminder(delayed,delayed.sites[0],19*60000,29*60000)?.minutes,1);
  assert.deepEqual(delayed.notices.thresholds,[10,5,1],'skipped 10/5 are not replayed');
  const short=emptyFocus(at);short.enabled=true;short.groups.entertainment=1;
  short.sites=[{...site,minutes:1}];
  assert.equal(focusDueReminder(short,short.sites[0],0,30000),null,
    'a one-minute native acceptance budget must not fire 10/5/1 immediately');
  const work=FOCUS_CATALOG.find(row=>row.host==='github.com');
  assert.equal(focusCatalogMatch(work.host)?.auto,false);
});

test('R1.4 isolated page notice accepts fixed messages only, never duplicates or trusts HTML',()=>{
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.parent=null;this.textContent='';}
    setAttribute(k,v){this[k]=v;}
    addEventListener(name,fn){this[name]=fn;}
    append(...items){for(const node of items){node.parent=this;this.children.push(node);}}
    attachShadow(){this.shadow=new Element('shadow');return this.shadow;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(row=>row!==this);}
  }
  const root=new Element('html');
  const doc={documentElement:root,visibilityState:'visible',createElement:tag=>new Element(tag)};
  const win={};win.top=win;
  let listener=null,removed=false,timers=0;
  const api={runtime:{onMessage:{
    addListener:fn=>{listener=fn;},removeListener:fn=>{removed=listener===fn;}
  }}};
  const stop=installFocusPageNotice({api,doc,win,
    setTimer:()=>++timers,clearTimer:()=>{}});
  const send=message=>{let result=null;listener(message,{},reply=>{result=reply;});return result;};
  const safe={protocol:FOCUS_PAGE_NOTICE_PROTOCOL,kind:'threshold',day:'2026-10-13',revision:2,minutes:1};
  assert.deepEqual(send({...safe,minutes:2}),{displayed:false});
  assert.deepEqual(send({...safe,html:'<img src=x onerror=alert(1)>'}),{displayed:true});
  assert.equal(root.children.length,1);
  const shadow=root.children[0].shadow;
  assert.equal(shadow.children[1].children[2].textContent.includes('1 分钟'),true);
  assert.equal(shadow.children[1].children[2].textContent.includes('<img'),false);
  assert.deepEqual(send(safe),{displayed:false});
  assert.equal(root.children.length,1,'duplicate delivery must not create a second card');
  assert.deepEqual(send({protocol:FOCUS_PAGE_NOTICE_PROTOCOL,kind:'clear'}),{displayed:false});
  assert.equal(root.children.length,0,'disable/uninstall closes the notice');
  assert.deepEqual(send(safe),{displayed:true},'new active policy may alert after clear');
  stop();
  assert.equal(root.children.length,0);
  assert.equal(removed,true,'listener retired on content-script cleanup');
});

test('R1.4 official budget UI has no required single-site setup wizard',()=>{
  const html=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/index.html',import.meta.url),'utf8');
  for(const id of ['budget-total','total-used','total-remaining','native-state',
    'daily-budget-form','focus-pause','sites','manual-site','advanced'])
    assert.match(html,new RegExp('id="'+id+'"'),'missing the first screen contract: '+id);
  const manual=html.indexOf('<details class="sf-settings sf-manual"');
  const current=html.indexOf('id="total-used"');
  assert.ok(manual>current,'advanced manual setup cannot precede the daily total');
  assert.match(html,/<option value="entertainment">娱乐总额度/);
});

test('R1.6 settings save through button clicks when sandbox denies form submission',()=>{
  const html=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/index.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/main.js',import.meta.url),'utf8');
  const cases=[
    ['daily-budget','focus.group.put',{'daily-budget-minutes':'2'}, {id:'entertainment',minutes:2}],
    ['site','focus.site.put',{'site-host':'localhost','site-minutes':'2','site-mode':'limit',
      'site-group':'entertainment'}, {site:{host:'localhost',minutes:2,subdomains:true,
        enabled:true,mode:'limit',group:'entertainment'}}],
    ['group','focus.group.put',{'group-name':'study','group-minutes':'5'}, {id:'study',minutes:5}],
    ['schedule','focus.schedule.set',{'schedule-from':'09:00','schedule-to':'17:00'},
      {schedule:{enabled:true,days:[1],startMinute:540,endMinute:1020}}],
    ['whitelist','focus.whitelist.set',{'whitelist':'github.com'}, {hosts:['github.com']}]
  ];
  for(const [prefix,operation,values,payload] of cases){
    const nodes=new Map(),requests=[];
    const $=id=>{if(!nodes.has(id))nodes.set(id,{value:values[id]??'',checked:true,
      listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
      querySelectorAll(){return [{value:'1'}];}});return nodes.get(id);};
    // Run the actual registration + validation handler. The sandbox supplies
    // native button clicks, while it intentionally never dispatches submit.
    const start=script.indexOf("$('"+prefix+'-save' +"').addEventListener");
    assert.ok(start>=0,prefix+' must not depend on sandbox-blocked submit');
    const end=script.indexOf('\n  });',start)+7;
    runInNewContext(script.slice(start,end),{$,state:{enabled:true},
      call:(op,data)=>requests.push({op,data}),message:()=>{},escapeHost:focusHost,
      checkTime:value=>Number(value.slice(0,2))*60+Number(value.slice(3))});
    assert.match(html,new RegExp('id="'+prefix+'-save"[^>]*type="button"'));
    $(prefix+'-save').listeners.click({preventDefault(){}});
    assert.deepEqual(JSON.parse(JSON.stringify(requests)),[{op:operation,data:payload}]);
    if(prefix==='daily-budget'){
      $('daily-budget-minutes').value='0';$(prefix+'-save').listeners.click({preventDefault(){}});
      assert.equal(requests.length,1,'invalid budget must never reach the Host');
    }
  }
  assert.doesNotMatch(script,/addEventListener\('submit'/);
});
