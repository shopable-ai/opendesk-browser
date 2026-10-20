import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,serializeSidebarToolPackage,sidebarToolPackageHash,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {FOCUS_PROTOCOL,FOCUS_STORE,focusPackageHash} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {focusCatalogForPackage,FOCUS_CATALOG} from '../../examples/sidebar-tools/stay-focus/trusted/catalog.js';
import {createStayFocusService} from '../../examples/sidebar-tools/stay-focus/trusted/service.js';
import {installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';
import {requestStayFocusOperation} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const suggestion={host:'pinterest.com',name:'Pinterest',category:'社交娱乐',suggestLimit:true,quick:true};
const policy={kind:'site-budget.v1',suggestions:[suggestion]};
const old=()=>({format:'opendesk.sidebar-tool.v1',id:'stay-focus',version:'1.0.1',
  title:'Stay Focus',description:'Existing installed version',capabilities:['focus.control'],
  html:'<main>Stay Focus</main>',css:'',js:'void 0;'});
const next=()=>({...old(),version:'1.0.2',backgroundPolicy:policy});
const site=(host,mode='limit',minutes=1)=>({host,subdomains:true,enabled:true,mode,minutes,group:''});
const at=new Date(2026,9,18,10,0,0).getTime();

test('real Stay Focus install package carries bounded data, no privileged JS',async()=>{
  const tool=await createSidebarToolPackage('examples/sidebar-tools/stay-focus');
    const config=JSON.parse(readFileSync(
    new URL('../../examples/sidebar-tools/stay-focus/tool.config.json',import.meta.url),'utf8'));
  assert.equal(tool.version,config.version);
  assert.ok(tool.backgroundPolicy.defaultSites.includes('pinterest.com'));
  assert.equal(tool.backgroundPolicy.kind,'site-budget.v2');
  assert.equal(tool.backgroundPolicy.dailyMinutes,30);
  assert.ok(tool.backgroundPolicy.defaultSites.includes('youtube.com'));
  assert.ok(tool.backgroundPolicy.suggestions.some(row=>row.host==='pinterest.com'));
  assert.ok(!Object.hasOwn(tool,'backgroundJs')&&!Object.hasOwn(tool,'trusted'));
  assert.deepEqual(validateSidebarToolPackage(JSON.parse(serializeSidebarToolPackage(tool))),tool);
});
test('policy admission, canonical package identity, legacy digest and rejection',async()=>{
  const base=old(),modern=next();
  assert.notEqual(await focusPackageHash(base),await focusPackageHash(modern));
  assert.notEqual(await sidebarToolPackageHash(base),await sidebarToolPackageHash(modern));
  const reorder={...modern,backgroundPolicy:{suggestions:[{
    quick:true,suggestLimit:true,category:'社交娱乐',name:'Pinterest',host:'pinterest.com'
  }],kind:'site-budget.v1'}};
  assert.equal(await focusPackageHash(modern),await focusPackageHash(reorder));
  assert.equal(serializeSidebarToolPackage(modern),serializeSidebarToolPackage(reorder));
  for(const invalid of [
    {...modern,capabilities:[]},
    {...modern,backgroundPolicy:{kind:'arbitrary-js.v1',suggestions:[]}},
    {...modern,backgroundPolicy:{...policy,suggestions:[suggestion,suggestion]}},
    {...modern,backgroundPolicy:{...policy,suggestions:[{...suggestion,host:'https://bad.com'}]}},
    {...modern,backgroundPolicy:{...policy,suggestions:[{...suggestion,code:'eval()'}]}},
    {...modern,backgroundPolicy:{...policy,suggestions:[{...suggestion,suggestLimit:false}]}}
  ])assert.throws(()=>validateSidebarToolPackage(invalid),{code:'E_TOOL_POLICY'});
});
test('new catalog data does not automatically enroll sites or modify old catalog',()=>{
  const original=structuredClone(FOCUS_CATALOG);
  const catalog=focusCatalogForPackage(next());
  const row=catalog.find(entry=>entry.host==='pinterest.com');
  assert.equal(row.quick,true);
  assert.equal(row.auto,false);
  assert.equal(catalog.find(entry=>entry.host==='github.com').minutes,0);
  assert.deepEqual(FOCUS_CATALOG,original);
  assert.strictEqual(focusCatalogForPackage(old()),FOCUS_CATALOG);
});
function fixture(){
  const stored=new Map([[SIDEBAR_TOOL_STORE,[old()]],[SIDEBAR_TOOL_ENABLE_STORE,{}],
    [TOOL_REVOCATION_EPOCHS_STORE,{'stay-focus':'epoch-1'}]]);
  const session=new Map(),alarms=new Map(),rules=[],writes=[];
  let clock=at,url='https://existing.example.com/watch';
  const sender={id:'abcdefghijklmnopabcdefghijklmnop',
    url:'chrome-extension://abcdefghijklmnopabcdefghijklmnop/sidepanel.html?hostInstanceId=123e4567-e89b-42d3-a456-426614174000',
    frameId:0,documentId:'doc-r41',documentLifecycle:'active'};
  const storage=map=>({
    async get(keys){
      const names=keys===null?[...map.keys()]:Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(names.filter(k=>map.has(k)).map(k=>[k,structuredClone(map.get(k))]));
    },
    async set(values){for(const [k,v] of Object.entries(values))map.set(k,structuredClone(v));},
    async remove(key){map.delete(key);}
  });
  const api={
    runtime:{id:sender.id,getURL:path=>'chrome-extension://'+sender.id+'/'+path,
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
        documentId:sender.documentId,frameId:0,incognito:false}]},
    storage:{local:storage(stored),session:storage(session)},
    permissions:{contains:async({permissions,origins})=>Boolean(origins?.length)||
      Boolean(permissions?.length)&&permissions.every(v=>
        ['idle','declarativeNetRequestWithHostAccess'].includes(v))},
    idle:{queryState:async()=> 'active'},
    windows:{getLastFocused:async()=>({id:1,focused:true,type:'normal',incognito:false})},
    tabs:{query:async()=>[{id:42,windowId:1,url,incognito:false}],
      update:async(_id,options)=>{url=options.url;},
      get:async id=>({id,windowId:1,active:true,url,incognito:false}),
      sendMessage:async()=>{}},
    alarms:{get:async k=>alarms.get(k),create:async(k,v)=>{alarms.set(k,v);},
      clear:async k=>{alarms.delete(k);}},
    declarativeNetRequest:{getDynamicRules:async()=>structuredClone(rules),
      updateDynamicRules:async({addRules=[],removeRuleIds=[]})=>{
        writes.push({addRules,removeRuleIds});
        for(const id of removeRuleIds){
          const index=rules.findIndex(row=>row.id===id);
          if(index>=0)rules.splice(index,1);
        }
        rules.push(...structuredClone(addRules));
      }}
  };
  const focus=createStayFocusService({api,
    lockManager:{request:async(_name,work)=>work()},now:()=>clock});
  const msg=async(tool,operation,payload={})=>({protocol:FOCUS_PROTOCOL,
    toolId:'stay-focus',operation,payload,
    packageHash:await focusPackageHash(tool),installEpoch:'epoch-1'});
  api.runtime.sendMessage=async message=>{
    try{return {ok:true,data:await focus.dispatch(message,sender)};}
    catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
  };
  return {stored,focus,api,rules,writes,sender,msg,
    setTime:value=>{clock=value;},setUrl:value=>{url=value;}};
}
test('same Host SHA / only app package changes: no silent rules, direct edits, native DNR readback',async()=>{
  const f=fixture(),base=old(),modern=next();
  await f.focus.dispatch(await f.msg(base,'focus.site.put',
    {site:site('existing.example.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg(base,'focus.group.put',{id:'custom',minutes:37}),f.sender);
  await f.focus.dispatch(await f.msg(base,'focus.enable'),f.sender);
  assert.equal(f.rules.length,1);
  const install=await installReviewedSidebarTool({api:f.api,
    lockManager:{request:async(_key,run)=>run()},candidate:modern,baseline:base,
    reviewApproved:true,approveUpdate:async()=>true});
  assert.equal(install.state,'installed','real installer performs same-ID package-only upgrade');
  assert.equal(f.stored.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.2');
  f.focus.invalidate({revoke:true});
  const upgraded=await f.focus.tick({boot:true});
  assert.equal(upgraded.enabled,false);
  assert.equal(upgraded.ruleReceipt.verified,true);
  assert.equal(f.rules.length,0,'old owned DNR is removed on package change');
  assert.equal(upgraded.groups.custom,37);
  assert.deepEqual(upgraded.sites.map(row=>row.host),['existing.example.com']);
  assert.ok(upgraded.catalog.some(row=>row.host==='pinterest.com'));
  assert.equal(f.stored.get(FOCUS_STORE).authorizedHash,null);
  await assert.rejects(f.focus.dispatch(await f.msg(base,'focus.status'),f.sender),
    {code:'E_TOOL_CHANGED'});
  let repeatedReview=false;
  await requestStayFocusOperation({api:f.api,tool:modern,operation:'focus.site.put',
    payload:{site:site('pinterest.com')},revocationEpoch:'epoch-1',assertCurrent(){},
    requestBrowserClick(){repeatedReview=true;throw Error('unexpected second approval');},
    openSettings(){throw Error('not expected');}});
  assert.equal(repeatedReview,false);
  assert.equal(f.rules.length,0,'an added site never enables DNR by itself');
  const enabled=await f.focus.dispatch(await f.msg(modern,'focus.enable'),f.sender);
  assert.equal(enabled.enabled,true);
  f.setUrl('https://pinterest.com/new');await f.focus.tick();
  f.setTime(at+30000);await f.focus.tick();
  f.setTime(at+60000);const result=await f.focus.tick();
  assert.equal(result.ruleReceipt.verified,true);
  assert.ok(f.rules.some(row=>
    row.action.redirect.extensionPath==='/stay-focus/blocked-quota.html'&&
    row.condition.regexFilter.includes('pinterest\\.com')));
  assert.equal(result.groups.custom,37);
  assert.ok(f.writes.length>1);
});

test('R4.3 v2 policy rejects unreviewed default scopes and malformed time data',async()=>{
  const tool=await createSidebarToolPackage('examples/sidebar-tools/stay-focus');
  const policy=tool.backgroundPolicy;
  for(const candidate of [
    {...policy,defaultSites:[...policy.defaultSites,'unreviewed.example']},
    {...policy,defaultSites:[...policy.defaultSites,policy.defaultSites[0]]},
    {...policy,dailyMinutes:0},
    {...policy,schedule:{...policy.schedule,startMinute:500,endMinute:500}},
    {...policy,schedule:{...policy.schedule,days:[1,1]}},
    {...policy,suggestions:[...policy.suggestions,{host:'evil.example',name:'E',category:'C',suggestLimit:true,quick:true,code:'alert(1)'}]}
  ])assert.throws(()=>validateSidebarToolPackage({...tool,backgroundPolicy:candidate}),{code:'E_TOOL_POLICY'});
  const reordered={...tool,backgroundPolicy:{...policy,
    schedule:{startMinute:policy.schedule.startMinute,days:policy.schedule.days,
      enabled:policy.schedule.enabled,endMinute:policy.schedule.endMinute}}};
  assert.equal(await focusPackageHash(tool),await focusPackageHash(reordered));
});
test('R5.9 first-use v2 recommendations require explicit site add; upgrade keeps preferences',async()=>{
  const f=fixture(),app=await createSidebarToolPackage('examples/sidebar-tools/stay-focus');
  f.stored.set(SIDEBAR_TOOL_STORE,[app]);
  const before=await f.focus.dispatch(await f.msg(app,'focus.status'),f.sender);
  assert.equal(before.dailyBudget.minutes,app.backgroundPolicy.dailyMinutes);
  assert.deepEqual(before.sites,[]);
  const first=await f.focus.dispatch(await f.msg(app,'focus.enable'),f.sender);
  assert.equal(first.enabled,true);
  assert.deepEqual(first.sites,[],'package defaultSites are recommendations, not implicit DNR scopes');
  assert.ok(first.catalog.some(row=>row.host==='youtube.com'));
  assert.deepEqual(first.schedule,app.backgroundPolicy.schedule);
  assert.equal(first.groups.entertainment,30);
  await f.focus.dispatch(await f.msg(app,'focus.group.put',
    {id:'entertainment',minutes:51}),f.sender);
  await f.focus.dispatch(await f.msg(app,'focus.site.put',
    {site:site('user-choice.example.com')}),f.sender);
  const upgraded={...app,version:'1.0.6',backgroundPolicy:{
    ...app.backgroundPolicy,dailyMinutes:71,
    suggestions:app.backgroundPolicy.suggestions.map(row=>row.host==='github.com'?
      {...row,suggestLimit:true}:row),
    defaultSites:[...app.backgroundPolicy.defaultSites,'github.com'],
    schedule:{...app.backgroundPolicy.schedule,enabled:true}
  }};
  const installed=await installReviewedSidebarTool({api:f.api,
    lockManager:{request:async(_key,run)=>run()},candidate:upgraded,baseline:app,
    reviewApproved:true,approveUpdate:async()=>true});
  assert.equal(installed.state,'installed');
  f.focus.invalidate({revoke:true});
  const stopped=await f.focus.tick({boot:true});
  assert.equal(stopped.enabled,false,'a new signed package is not silently reauthorized');
  assert.equal(stopped.ruleReceipt.verified,true);
  assert.equal(stopped.groups.entertainment,51,'user quota overrides new default');
  assert.deepEqual(stopped.schedule,app.backgroundPolicy.schedule,'existing schedule retained');
  assert.ok(stopped.sites.some(row=>row.host==='user-choice.example.com'));
  assert.ok(!stopped.sites.some(row=>row.host==='github.com'));
  assert.ok(stopped.catalog.some(row=>row.host==='pinterest.com'));
  await assert.rejects(f.focus.dispatch(await f.msg(app,'focus.status'),f.sender),
    {code:'E_TOOL_CHANGED'});
  const resumed=await f.focus.dispatch(await f.msg(upgraded,'focus.enable'),f.sender);
  assert.equal(resumed.enabled,true);
  assert.equal(resumed.groups.entertainment,51);
  assert.ok(!resumed.sites.some(row=>row.host==='github.com'),
    'new default must not enroll during reauthorization');
});

test('R5.4 older package to 1.0.5: same worker, package-only upgrade and explicit Pinterest enrollment',async()=>{
  const app=await createSidebarToolPackage('examples/sidebar-tools/stay-focus');
  const previous={...app,version:'1.0.3',backgroundPolicy:{...app.backgroundPolicy,
    defaultSites:app.backgroundPolicy.defaultSites.filter(host=>host!=='pinterest.com')}};
  const f=fixture();f.stored.set(SIDEBAR_TOOL_STORE,[previous]);
  const baseline=await f.focus.dispatch(await f.msg(previous,'focus.enable'),f.sender);
  assert.ok(!baseline.sites.some(row=>row.host==='pinterest.com'));
  const savedSchedule={enabled:true,days:[1,2],startMinute:420,endMinute:600};
  await f.focus.dispatch(await f.msg(previous,'focus.schedule.set',{schedule:savedSchedule}),f.sender);
  await f.focus.dispatch(await f.msg(previous,'focus.group.put',{id:'entertainment',minutes:43}),f.sender);
  await f.focus.dispatch(await f.msg(previous,'focus.whitelist.set',{hosts:['docs.google.com']}),f.sender);
  assert.deepEqual(baseline.sites,[],'an older 1.0.3 package also starts without silent enrollment');
  await f.focus.dispatch(await f.msg(previous,'focus.site.put',{site:{
    ...site('youtube.com'),group:'entertainment',enabled:false}}),f.sender);
  const install=await installReviewedSidebarTool({api:f.api,
    lockManager:{request:async(_key,run)=>run()},candidate:app,baseline:previous,
    reviewApproved:true,approveUpdate:async()=>true});
  assert.equal(install.state,'installed');
  assert.equal(f.stored.get(SIDEBAR_TOOL_STORE)[0].version,app.version);
  f.focus.invalidate({revoke:true});
  const waiting=await f.focus.tick({boot:true});
  assert.equal(waiting.enabled,false);
  assert.equal(waiting.ruleReceipt.verified,true);
  assert.equal(waiting.groups.entertainment,43);
  assert.deepEqual(waiting.schedule,savedSchedule);
  assert.deepEqual(waiting.whitelist,['docs.google.com']);
  assert.equal(waiting.sites.find(row=>row.host==='youtube.com').enabled,false);
  assert.ok(!waiting.sites.some(row=>row.host==='pinterest.com'));
  assert.equal(waiting.catalog.find(row=>row.host==='pinterest.com').auto,true);
  await assert.rejects(f.focus.dispatch(await f.msg(previous,'focus.status'),f.sender),
    {code:'E_TOOL_CHANGED'});
  await f.focus.dispatch(await f.msg(app,'focus.enable'),f.sender);
  const result=await requestStayFocusOperation({api:f.api,tool:app,
    operation:'focus.site.put',payload:{site:site('pinterest.com','always')},
    revocationEpoch:'epoch-1',assertCurrent(){},
    requestBrowserClick(){throw Error('unexpected second approval');},
    openSettings(){throw Error('unexpected');}});
  assert.equal(result.enabled,true);
  assert.equal(result.ruleReceipt.verified,true);
  assert.ok(f.rules.some(rule=>rule.condition.regexFilter.includes('pinterest\\.com')));
  assert.equal(result.groups.entertainment,43);
  assert.equal(result.sites.find(row=>row.host==='youtube.com').enabled,false);
});
