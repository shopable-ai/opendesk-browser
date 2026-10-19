import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';
import {mountStayFocusReact} from '../helpers/stay-focus-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {focusHost,hostnameMatches,focusRemovedOriginAffectsSite,focusLocalDay,FOCUS_MAX_GAP_MS,FOCUS_PAGE_NOTICE_PROTOCOL} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {installFocusPageNotice} from '../../examples/sidebar-tools/stay-focus/trusted/page-notice.js';
import {emptyFocus,readFocus,focusSite,focusSiteScopesValid,focusSchedule,focusMatchingSite,focusPool,
  focusBudget,focusReason,focusScheduleActive,settleFocus,focusDueReminder,focusSummary} from '../../examples/sidebar-tools/stay-focus/trusted/model.js';
import {FOCUS_CATALOG,focusCatalogMatch,focusDefaultSites} from '../../examples/sidebar-tools/stay-focus/trusted/catalog.js';
import {installStayFocusBlockedPage} from '../../examples/sidebar-tools/stay-focus/trusted/blocked.js';
import {createStayFocusPermissionControls} from '../../examples/sidebar-tools/stay-focus/trusted/host-controls.js';
import {focusRuleForSite,wantedFocusRules,reconcileFocusRules,clearFocusRules,isFocusRuleId}
  from '../../examples/sidebar-tools/stay-focus/trusted/rule-host.js';

const at=new Date(2026,9,13,12,0,0).getTime();
const mkSite=(host,overrides={})=>({host,subdomains:true,enabled:true,mode:'limit',minutes:15,group:'',...overrides});
const tick=(state,time,site=null,options={})=>settleFocus(state,{at:time,session:'this-browser-session',
  current:site?{host:site.host,site,tabId:3,windowId:1}:null,...options});
test('trusted enable requests only optional idle, and denial never enables Focus',async t=>{

  for(const approved of [false,true]){
    const f=settingsReactFixture('stayFocus',t),requests=[],operations=[],notices=[];
    const controls=createStayFocusPermissionControls({
      api:{permissions:{request(options){requests.push(options);return Promise.resolve(approved);}}},
      ui:f.ui,
      notice:(text,error)=>notices.push({text,error}),
      runOperation:async(operation,payload,event)=>operations.push({operation,payload,event})
    });
    const tool={id:'stay-focus',capabilities:['focus.control']};
    controls.render(tool,false,false);
    const grant=f.find('stay-focus-enable-native');
    f.invoke(grant.id,{isTrusted:true});
    assert.equal(requests.length,0,'disabled tool cannot request native access');
    controls.render(tool,false,true);
    f.invoke(grant.id,{isTrusted:false});
    assert.equal(requests.length,0,'synthetic clicks cannot grant idle or enable Focus');
    const click={isTrusted:true};
    f.invoke(grant.id,click);
    assert.deepEqual(requests,[{permissions:['idle']}],
      'required shared DNR must never be requested as an optional permission');
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(operations,approved?[{operation:'focus.enable',payload:{},event:click}]:[]);
    assert.equal(notices.at(-1).error,!approved);
    controls.dispose();await f.close();
    if(!approved){
      assert.match(notices.at(-1).text,/空闲检测/);
      assert.doesNotMatch(notices.at(-1).text,/DNR/);
    }
    assert.equal(grant.disabled,false,'control recovers after approval or denial');
  }
});
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
  const {FOCUS_STORE}=await import('../../examples/sidebar-tools/stay-focus/trusted/policy.js');
  const {TIME_REVIEW_KEY}=await import('../../examples/sidebar-tools/time-review/trusted/model.js');
  assert.notEqual(FOCUS_STORE,TIME_REVIEW_KEY);
  const {FOCUS_ID}=await import('../../examples/sidebar-tools/stay-focus/trusted/policy.js');
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


test('R5.6 React current-site click uses Host catalog, revalidation and one request',async()=>{
  const ui=mountStayFocusReact({url:'https://m.youtube.com/watch?v=sample'});
  await ui.flush();
  assert.ok(ui.button('加入'),'current page has an add button');
  assert.equal(ui.writes.length,0,'recognition alone never writes a rule');
  ui.button('加入').props.onClick();
  await ui.flush();
  assert.deepEqual(ui.writes,[{operation:'focus.site.put',payload:{site:{
    host:'youtube.com',subdomains:true,enabled:true,mode:'limit',minutes:30,
    group:'entertainment'}}}]);
  assert.equal(ui.button('加入'),null,'already managed site cannot be re-added');
  assert.ok(ui.find(node=>node.type==='span'&&ui.text(node)==='已管理'));
  ui.unmount();assert.equal(ui.disposed,true);
});
test('R5.6 forged subdomain and paused site cannot widen or reset a rule',async()=>{
  const forged=mountStayFocusReact({url:'https://youtube.com.attacker.test/',title:'YouTube'});
  await forged.flush();forged.button('加入').props.onClick();await forged.flush();
  assert.equal(forged.writes[0].payload.site.host,'youtube.com.attacker.test',
    'substring/title must never canonicalize an attacker domain');
  forged.unmount();
  const existing={host:'youtube.com',subdomains:true,enabled:false,mode:'always',
    minutes:8,group:''};
  const paused=mountStayFocusReact({url:'https://m.youtube.com/',sites:[existing]});
  await paused.flush();assert.ok(paused.button('恢复'));
  paused.button('恢复').props.onClick();await paused.flush();
  assert.deepEqual(paused.writes[0].payload.site,{...existing,enabled:true},
    'resume preserves the existing mode, scope and independent budget');
  paused.unmount();
});
test('R5.6 daily budget saves only a validated edited value',async()=>{
  const ui=mountStayFocusReact({url:'https://example.com'});
  await ui.flush();
  assert.equal(ui.button('保存'),null,'save is absent until changed');
  ui.field('sf-daily-budget').props.onChange({target:{value:'45'}});
  await ui.flush();
  assert.ok(ui.button('保存'));
  ui.button('保存').props.onClick();await ui.flush();
  assert.deepEqual(ui.writes,[{operation:'focus.group.put',payload:{
    id:'entertainment',minutes:45}}]);
  ui.unmount();
  const invalid=mountStayFocusReact();
  await invalid.flush();
  invalid.field('sf-daily-budget').props.onChange({target:{value:'0'}});
  await invalid.flush();invalid.button('保存').props.onClick();await invalid.flush();
  assert.equal(invalid.writes.length,0);
  invalid.unmount();
});

test('R5.6 UI uses one React owner, shared icon controls and responsive styling',()=>{
  const base=new URL('../../examples/sidebar-tools/stay-focus/',import.meta.url);
  const css=readFileSync(new URL('src/style.css',base),'utf8');
  const js=readFileSync(new URL('src/main.js',base),'utf8');
  const html=readFileSync(new URL('src/index.html',base),'utf8');
  const config=JSON.parse(readFileSync(new URL('tool.config.json',base),'utf8'));
  assert.match(css,/@media\(max-width:355px\)/);
  assert.match(css,/@media\(prefers-color-scheme:dark\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/\.sf-popup/);
  assert.match(js,/R\.createRoot\(mount\)/);
  assert.match(js,/root\.unmount\(\)/);
  assert.match(js,/IconButton/);
  assert.match(js,/Switch/);
  assert.match(js,/opendesk-page-changed/);
  assert.doesNotMatch(js,/document\.createElement\(|replaceChildren\(/);
  assert.match(html,/id="tool-app"/);
  assert.equal(config.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(config.files.js,'src/main.js');
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

test('R5.6 first-screen order is shared budget then sites, no preset buttons',()=>{
  const base=new URL('../../examples/sidebar-tools/stay-focus/',import.meta.url);
  const html=readFileSync(new URL('src/index.html',base),'utf8');
  const script=readFileSync(new URL('src/main.js',base),'utf8');
  assert.equal(html.trim(),'<div id="tool-app" aria-label="Stay Focus 应用"></div>');
  assert.ok(script.indexOf('今日娱乐时间')<script.indexOf('管理的网站'));
  assert.match(script,/sf-daily-budget/);
  assert.doesNotMatch(script,/data-budget|sf-budget-presets|budget-presets/);
  assert.match(script,/currentPage\.info/);
});

test('R5.6 React has button-driven budget, site, schedule, group and whitelist writes',()=>{
  const script=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/main.js',import.meta.url),'utf8');
  for(const operation of ['focus.group.put','focus.site.put','focus.site.remove',
    'focus.schedule.set','focus.whitelist.set','focus.session.start','focus.session.stop'])
    assert.ok(script.includes(operation),'missing business operation: '+operation);
  assert.doesNotMatch(script,/addEventListener\('submit'|type=['"]submit['"]/);
  assert.match(script,/request\('currentPage\.info'/);
  assert.match(script,/request\('focus\.status'/);
  assert.match(script,/writing\.current/);
  assert.match(script,/readId\.current\+\+/);
});

test('R5.6 editor locks the domain and preserves paused rule state',async()=>{
  const paused={host:'example.com',subdomains:true,enabled:false,mode:'limit',
    minutes:9,group:'entertainment'};
  const ui=mountStayFocusReact({url:'https://example.com',sites:[paused]});
  await ui.flush();
  const row=ui.find(node=>node.props?.site?.host==='example.com'&&
    typeof node.props?.edit==='function');
  assert.ok(row,'React managed site row must be renderable');
  row.props.edit(paused);
  await ui.flush();
  const editor=ui.find(node=>node.props?.initial?.host==='example.com'&&
    typeof node.props?.save==='function');
  assert.ok(editor,'editing must open the actual React editor');
  assert.equal(editor.props.initial.enabled,false);
  assert.equal(editor.props.initial.host,'example.com');
  ui.unmount();
});

test('R5.1 portable preview embeds the exact installable Stay Focus HTML/CSS/JS',()=>{
  const base=new URL('../../examples/sidebar-tools/stay-focus/',import.meta.url);
  const preview=readFileSync(new URL('preview/index.html',base),'utf8');
  const prefix='<script type="application/json" id="sf-bundle">';
  const begin=preview.indexOf(prefix);
  assert.ok(begin>=0,'preview must carry one source-bound JSON bundle');
  const stop=preview.indexOf('</script>',begin+prefix.length);
  assert.ok(stop>begin,'preview JSON script must terminate');
  const embedded=JSON.parse(preview.slice(begin+prefix.length,stop));
  for(const [key,filename] of Object.entries({
    html:'src/index.html',css:'src/style.css',js:'src/main.js'
  }))assert.equal(embedded.source[key],readFileSync(new URL(filename,base),'utf8'),
    'preview '+key+' must be identical to the package source');
  assert.deepEqual(embedded.config,JSON.parse(
    readFileSync(new URL('tool.config.json',base),'utf8')));
  const runtime=readFileSync(new URL('preview/runtime.js',base),'utf8');
  assert.ok(preview.includes('<script>'+runtime+'</script>'),
    'portable preview must embed its isolated adapter, not depend on network or file siblings');
  assert.equal(JSON.parse(readFileSync(new URL('tool.config.json',base),'utf8')).files.html,'src/index.html',
    'preview-only runtime must not be a user-installable package file');
});
