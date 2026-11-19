import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {runInNewContext} from 'node:vm';

const translations=Object.fromEntries(await Promise.all(['zh-CN','zh-TW','en'].map(async lang=>[lang,JSON.parse(await readFile(new URL('../src/i18n/locales/'+lang+'.json',import.meta.url),'utf8'))])));
const source=await readFile(new URL('../src/ui/DiagnosticsPage.tsx',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic'});
const statusSource=await readFile(new URL('../src/ui/Status.tsx',import.meta.url),'utf8');
const {code:statusCode}=await transform(statusSource,{loader:'tsx',format:'cjs',jsx:'automatic'});
const logicModule={exports:{}};
runInNewContext((await transform(await readFile(new URL('../src/diagnostics/logic.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'})).code,
  {module:logicModule,exports:logicModule.exports});
const favoritesModule={exports:{}};
runInNewContext((await transform(await readFile(new URL('../src/diagnostics/favorites.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'})).code,
  {module:favoritesModule,exports:favoritesModule.exports,require:()=>({})});
function render({preview=false,httpDiagnostics=false,panel='ai',busy=false,config:configPatch={},runtime={},presentation='sidebar',snapshot=null,
  language=null,dispatch=null,currentSite=async()=>({status:'available',host:'current.example',diagnosticDomain:'current.example',diagnosticReason:null})}={}){
  const calls=[],commands=[],nodes=[],buttons=[],routes=[],slots=[],effects=[],routeListeners=new Set(),siteListeners=new Set();
  const intervals=new Map();let intervalId=0;
  const setInterval=(fn,delay)=>{intervals.set(++intervalId,{fn,delay});return intervalId;};
  const clearInterval=id=>intervals.delete(id);
  let currentSiteRevision=0;
  let diagnosisInput,route=`#/diagnostic/${panel}`,cursor=0,html,siteReads=0,unmounted=false,lateUpdates=0;
  const navigation={getRoute:()=>route,subscribe:fn=>{routeListeners.add(fn);return()=>routeListeners.delete(fn);}};
  const noopEvents={addListener(){},removeListener(){}};
  const env={preview,httpDiagnostics,navigation,navigate(next){routes.push(next);route=next;for(const fn of routeListeners)fn();},storage:{onChanged:noopEvents},
    currentSite(){siteReads++;return currentSite();},
    events:{addEventListener(name,fn){assert.equal(name,'ai-proxy-page-changed');siteListeners.add(fn);},
      removeEventListener(name,fn){assert.equal(name,'ai-proxy-page-changed');siteListeners.delete(fn);}},
    proxy:{settings:{onChange:noopEvents}},getDraftRevision:()=>0,setDraftDirty:()=>true};
  const config={profiles:[],selection:{mode:'system'},endpoints:[],rules:[],defaultTarget:{action:'direct'},...configPatch};
  const state={config,configEtag:'config-1',runtime:{managedIntent:false,control:'controllable_by_this_extension',
    applied:false,pendingChanges:false,credentialRequired:false,proxyError:null,activeSelection:null,
    browserMode:'system',desired:{mode:'system'},canStop:false,probe:null,...runtime}};
  const module={exports:{}};
  const hooks={...React,useState(initial){const index=cursor++;
      if(!(index in slots))slots[index]=initial===null?snapshot:typeof initial==='function'?initial():initial;
      return [slots[index],value=>{if(unmounted)lateUpdates++;slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial){const index=cursor++;return slots[index]??={current:initial};},
    useEffect(fn,deps){const index=cursor++,previous=effects[index];
      if(!previous||!deps||deps.some((value,i)=>value!==previous.deps?.[i]))effects[index]={fn,deps,pending:true,cleanup:previous?.cleanup};},useMemo:callback=>callback(),
    useCallback(callback,deps){const index=cursor++,previous=slots[index];
      if(!previous||deps.some((value,i)=>value!==previous.deps[i]))slots[index]={callback,deps};
      return slots[index].callback;}};
  const translate=(key,values)=>language?Object.entries(values??{}).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),translations[language][key]??key):key+(values ? ':'+Object.values(values).join('|') : '');
  const statusModule={exports:{}};
  const statusRequire=name=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {...jsxRuntime,jsx:(type,props,key)=>{nodes.push({type,...props});return jsxRuntime.jsx(type,props,key);},jsxs:(type,props,key)=>{nodes.push({type,...props});return jsxRuntime.jsxs(type,props,key);}};
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({locale:'en',t:translate})};
    if(name==='../i18n/errors')return {localizedBackendError:(_locale,error)=>error};
    throw Error('Unhandled Status dependency '+name);
  };
  runInNewContext(statusCode,{exports:statusModule.exports,module:statusModule,require:statusRequire});
  runInNewContext(code,{exports:module.exports,module,
    setInterval,clearInterval,
    window:{setInterval,clearInterval,addEventListener(){},removeEventListener(){}},
    document:{addEventListener(){},removeEventListener(){}},require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {...jsxRuntime,jsx:(type,props,key)=>{nodes.push({type,...props});return jsxRuntime.jsx(type,props,key);},jsxs:(type,props,key)=>{nodes.push({type,...props});return jsxRuntime.jsxs(type,props,key);}};
    if(name==='../environment')return {getEnvironment:()=>env};
    if(name==='@opendesk/ui')return {Button:React.forwardRef(({children,variant,...props},ref)=>
      {
        buttons.push({children,...props});
        return React.createElement('button',{...props,ref},children);
      })};
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({locale:'en',t:translate})};
    if(name==='../domain/messages')return {request:async command=>{commands.push(command);if(dispatch)return dispatch(command);calls.push('request');return {ok:false,error:'E_NOT_CONNECTED'}}};
    if(name==='../diagnostics/catalog')return {AI_SITES:[{id:'chatgpt',name:'ChatGPT',domain:'chatgpt.com'}],PUBLIC_HTTPS_CHECK:{id:'public-https',name:'Cloudflare HTTPS',domain:'www.cloudflare.com'}};
    if(name==='../diagnostics/logic')return {...logicModule.exports,diagnosisCodes:input=>{diagnosisInput=input;return ['limited_evidence'];}};
    if(name==='./Status')return statusModule.exports;
    if(name==='./ProxyEntry')return {ClearableInput:props=>React.createElement('input',{'aria-label':props.fieldLabel,value:props.value,onChange:event=>props.onValueChange(event.target.value)})};
    if(name==='../diagnostics/favorites')return favoritesModule.exports;
    if(name==='./optionsRoute')return {
      diagnosticHash:name=>`#/diagnostic/${name}`,
      parseDiagnosticHash:route=>route.split('/').at(-1)};
    throw Error('Unhandled dependency '+name);
  }});
  function rerender(){cursor=0;buttons.length=0;nodes.length=0;
    html=renderToStaticMarkup(React.createElement(module.exports.DiagnosticsPage,{
      state,busy,presentation,currentSiteRevision,onRefresh:async()=>calls.push('refresh'),
      onProbe:async()=>calls.push('probe'),onStop:async()=>calls.push('stop'),onProfiles:()=>calls.push('profiles')}));return html;}
  function flushEffects(){for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.fn();}}
  rerender();
  return {get html(){return html;},calls,commands,nodes,buttons,routes,rerender,flushEffects,
    poll(){let count=0;for(const timer of intervals.values())if(timer.delay===650){timer.fn();count++;}return count;},
    refreshConfig(configEtag=state.configEtag){state.config=structuredClone(state.config);state.configEtag=configEtag;rerender();flushEffects();},
    refreshSite(){currentSiteRevision++;rerender();flushEffects();},
    pageChanged(){for(const fn of [...siteListeners])void fn();},
    unmount(){unmounted=true;for(const effect of effects)effect?.cleanup?.();},
    get siteReads(){return siteReads;},get siteListeners(){return siteListeners.size;},
    get lateUpdates(){return lateUpdates;},get diagnosisInput(){return diagnosisInput;}};
}
test('installed AI diagnostics disclose unconnected runtime and prevent misleading check/save actions',()=>{
  const {html,calls}=render({preview:false,panel:'ai'});
  assert.match(html,/diagProductionUnavailable/);
  assert.match(html,/diagModelVerification/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>diagCheckSelected/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>diagTestOne/);
  assert.match(html,/<button[^>]*disabled=""[^>]*aria-label="diagAddFavorite"/);
  assert.deepEqual(calls,[],'render must not send network or proxy requests');
});
test('installed priority and speed tabs show an honest unavailable state, not simulated measurements',()=>{
  for(const panel of ['top','speed']){
    const {html,calls}=render({preview:false,panel});
    assert.match(html,/diagProductionUnavailable|diagSpeedNotConnected/);
    assert.doesNotMatch(html,/simulated-usage|diagAttemptSummary/);
    assert.deepEqual(calls,[]);
  }
});
test('isolated preview retains explicitly simulated actions; browser proxy tab keeps explicit controls',()=>{
  const simulated=render({preview:true,panel:'ai'});
  assert.doesNotMatch(simulated.html,/<button[^>]*disabled=""[^>]*>diagCheckSelected/);
  assert.match(simulated.html,/diagLeadExplanation/);
  const installed=render({preview:false,panel:'proxy'});
  assert.match(installed.html,/apFollowingSystem/);
  assert.match(installed.html,/probeApiIpifyOrg/);
  assert.match(installed.html,/stopManagingAndReleaseControl/);
  assert.deepEqual(installed.calls,[],'viewing control status must never APPLY or STOP');
});

function button(result,label){
  const found=result.buttons.find(item=>item.children===label);
  assert.ok(found,`Missing button ${label}`);
  return found;
}

test('PROBE stays disabled with a visible explanation even in preview or a managed route',()=>{
  for(const preview of [false,true])for(const applied of [false,true]){
    const result=render({panel:'proxy',preview,runtime:{applied,managedIntent:applied,canStop:applied}});
    const probe=button(result,'probeApiIpifyOrg');
    assert.equal(probe.disabled,true);
    assert.equal(probe.onClick,undefined,'the rejected service action has no dispatch path');
    assert.equal(probe['aria-describedby'],'diagnostic-probe-unavailable');
    assert.match(result.html,/<p id="diagnostic-probe-unavailable"[^>]*>theProbeTargetsApiIpifyOrgExtensionRequestsAlone<\/p>/);
    assert.deepEqual(result.calls,[]);
  }
});

test('STOP is disabled while idle or busy, but stays explicit for recovery and finalization',async()=>{
  const cases=[
    {runtime:{},disabled:true},
    {runtime:{canStop:true,managedIntent:true},disabled:false},
    {runtime:{canStop:true,control:'unknown',outcomeUnknown:true,statusErrorCode:'E_TOOL'},disabled:false},
    {runtime:{canStop:false,control:'unknown',outcomeUnknown:true},disabled:true},
    {runtime:{canStop:false,stopFinalizationPending:true},disabled:false,finalize:true},
    {runtime:{canStop:true},busy:true,disabled:true},
    {runtime:{stopFinalizationPending:true},busy:true,disabled:true,finalize:true}
  ];
  for(const entry of cases){
    const result=render({panel:'proxy',...entry});
    const stop=button(result,entry.finalize?'apFinishStop':'stopManagingAndReleaseControl');
    assert.equal(stop.disabled,entry.disabled);
    assert.deepEqual(result.calls,[],'rendering never stops the proxy');
    if(!stop.disabled){
      await stop.onClick();
      assert.deepEqual(result.calls,['stop'],'explicit STOP uses the existing callback exactly once');
    }
    assert.equal(button(result,'probeApiIpifyOrg').disabled,true);
    assert.equal(button(result,'refreshState').disabled,Boolean(entry.busy));
  }
});

const profiles=[
  {id:'A',name:'Old profile A',kind:'endpoint',endpointId:'remote'},
  {id:'B',name:'New local B',kind:'endpoint',endpointId:'local'}
];
const endpoints=[{id:'remote',host:'proxy.example'},{id:'local',host:'127.0.0.1'}];

test('pending B is selected separately from confirmed A without claiming B was applied',()=>{
  for(const panel of ['overview','proxy']){
    const result=render({panel,config:{profiles,endpoints,selection:{mode:'profile',profileId:'B'}},
      runtime:{managedIntent:true,applied:true,pendingChanges:true,canStop:true,
        desired:{mode:'profile',profileId:'B'},activeSelection:{mode:'profile',profileId:'A'}}});
    assert.match(result.html,/diagnosticCurrentRoute">selected: New local B/);
    assert.match(result.html,/diagnosticActiveRoute">chromeStillUsingLastConfirmedMode:useAProfile \(A\)/);
    assert.doesNotMatch(result.html,/chromeStillUsingLastConfirmedMode:[^<]*New local B/);
    assert.match(result.html,/configurationStatus<\/small><strong>proxyPendingShort<\/strong>/);
    assert.doesNotMatch(result.html,/diagProxyAppliedCaveat|<strong>appliedToChrome<\/strong>/);
    assert.equal(result.diagnosisInput.localEndpoint,false,'new local B is not the applied endpoint');
    assert.deepEqual(result.calls,[]);
  }
});

test('same selection with edited content remains pending and never invents a historical profile name',()=>{
  const result=render({panel:'overview',config:{profiles:[{...profiles[1],name:'Edited B'}],endpoints,
      selection:{mode:'profile',profileId:'B'}},
    runtime:{managedIntent:true,applied:true,pendingChanges:true,
      desired:{mode:'profile',profileId:'B'},activeSelection:{mode:'profile',profileId:'B'}}});
  assert.match(result.html,/diagnosticCurrentRoute">selected: Edited B/);
  assert.match(result.html,/diagnosticActiveRoute">chromeStillUsingLastConfirmedMode:useAProfile \(B\)/);
  assert.match(result.html,/configurationStatus<\/small><strong>proxyPendingShort<\/strong>/);
  assert.doesNotMatch(result.html,/diagProxyAppliedCaveat/);
  assert.equal(result.diagnosisInput.localEndpoint,false);
});

test('unverified control and absent active selection do not claim the selected route is confirmed',()=>{
  const result=render({panel:'overview',config:{selection:{mode:'direct'}},
    runtime:{control:'unknown',outcomeUnknown:true,statusErrorCode:'E_TOOL',canStop:true,
      desired:{mode:'direct'},managedIntent:true,pendingChanges:true}});
  assert.match(result.html,/diagnosticCurrentRoute">selected: popupModeDirect/);
  assert.match(result.html,/configurationStatus<\/small><strong>apProxyStatusUnavailable<\/strong>/);
  assert.match(result.html,/diagnosticActiveRoute">chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot/);
  assert.doesNotMatch(result.html,/chromeStillUsingLastConfirmedMode|diagProxyAppliedCaveat/);
  assert.deepEqual(result.calls,[]);
});

test('local endpoint diagnosis uses the current endpoint only when applied with no pending changes',()=>{
  for(const applied of [false,true])for(const pendingChanges of [false,true]){
    const result=render({config:{profiles,endpoints,selection:{mode:'profile',profileId:'B'}},
      runtime:{managedIntent:true,applied,pendingChanges,desired:{mode:'profile',profileId:'B'},
        activeSelection:{mode:'profile',profileId:'B'}}});
    assert.equal(result.diagnosisInput.localEndpoint,applied&&!pendingChanges);
  }
  const remote=render({config:{profiles,endpoints,selection:{mode:'profile',profileId:'A'}},
    runtime:{applied:true,pendingChanges:false}});
  assert.equal(remote.diagnosisInput.localEndpoint,false);
});


test('installed overview prioritizes real control and marks unconnected features as secondary',()=>{
  const result=render({panel:'overview'});
  assert.match(result.html, /diagnosticLeadState" aria-label="configurationStatus"><strong>apFollowingSystem<\/strong>/);
  const primary=result.html.match(/<article class="diagnosticFeature diagnosticFeaturePrimary">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(primary,'real control has its own primary card');
  assert.match(primary, /basicProxyDiagnostics/);
  assert.match(primary, /apFollowingSystem/);
  assert.match(primary, /controlOwner:notManagingYet/);
  assert.match(primary, /viewActualControlStatus/);
  assert.equal((result.html.match(/diagnosticFeatureSecondary/g)??[]).length,3);
  for(const card of result.html.matchAll(/<article class="diagnosticFeature diagnosticFeatureSecondary">([\s\S]*?)<\/article>/g)){
    assert.match(card[1], /notAvailable/);
    assert.doesNotMatch(card[1], /diagProductionUnavailable|diagAttemptSummary|simulated-usage/);
  }
  assert.doesNotMatch(result.html, /<strong>diagIdle<\/strong>/,'unconnected diagnostics are not an idle operational service');
  assert.deepEqual(result.calls,[]);
});

test('each installed category discloses the runtime boundary once and keeps all five categories',()=>{
  for(const panel of ['overview','ai','top','speed','proxy']){
    const result=render({panel});
    assert.equal((result.html.match(/diagProductionUnavailable/g)??[]).length,1,panel);
    assert.equal((result.html.match(/role="tab"/g)??[]).length,5,panel);
    assert.deepEqual(result.calls,[]);
  }
});

test('only boolean preview true retains simulated diagnostics and the preview overview',()=>{
  const preview=render({panel:'overview',preview:true});
  assert.doesNotMatch(preview.html,/diagnosticFeaturePrimary|diagnosticFeatureSecondary|diagProductionUnavailable/);
  assert.match(preview.html,/diagAiFirstFive/);
  assert.equal(button(preview,'diagStartFive').disabled,false);
  for(const value of [false,undefined,null,1,'true']){
    const installed=render({panel:'overview',preview:value});
    assert.match(installed.html,/diagnosticFeaturePrimary/);
    assert.equal(button(installed,'diagStartFive').disabled,true);
    assert.deepEqual(installed.calls,[]);
  }
});

test('management explains the page-sidebar entry without offering a misleading current-site check',()=>{
  for(const preview of [false,true]){
    const result=render({presentation:'management',panel:'overview',preview});
    assert.equal(result.buttons.some(item=>item.children==='pcDiagCheckCurrent'),false);
    assert.match(result.html,/diagCurrentSidebarHelp/);
    assert.match(result.html,/pcDiagModel<\/small><strong>notTested<\/strong>/);
    assert.deepEqual(result.calls,[]);
  }
});

test('management overview exposes real Status warnings for denied permissions and unknown control',()=>{
  for(const runtime of [{permission:false},{control:'unknown'},{control:'unknown',statusErrorCode:'E_TOOL',outcomeUnknown:true}]){
    const result=render({presentation:'management',panel:'overview',runtime});
    assert.match(result.html,/<section class="status statusCompact"/,'real Status is present outside the inactive proxy subpage');
    if(runtime.permission===false)assert.match(result.html,/apProxyPermissionLabel:apNotGranted/);
    else{assert.match(result.html,/controlOwner:unableToVerify/);if(runtime.statusErrorCode)assert.match(result.html,/apProxyStatusUnavailable/);}
    assert.deepEqual(result.calls,[]);
  }
});

test('management tabs navigate every diagnostic subroute locally without proxy or diagnostic commands',()=>{
  const result=render({presentation:'management',panel:'overview'});
  result.flushEffects();
  for(const panel of ['ai','top','speed','proxy','overview']){
    const tab=result.buttons.find(item=>item.id==='diagnostic-tab-'+panel);
    assert.ok(tab);tab.onClick();result.rerender();
    assert.equal(result.routes.at(-1),'#/diagnostic/'+panel);
    assert.match(result.html,new RegExp('aria-labelledby="diagnostic-tab-'+panel+'"'));
    assert.equal(result.buttons.find(item=>item.id==='diagnostic-tab-'+panel)['aria-selected'],true);
    assert.deepEqual(result.calls,[]);
  }
  result.unmount();
});

test('management overview shortcuts use the same local subroutes and never run tests implicitly',()=>{
  for(const [label,panel] of [['pcDiagProxySettings','proxy'],['pcDiagViewAll','ai'],['pcDiagView','top'],['pcDiagTest','speed']]){
    const result=render({presentation:'management',panel:'overview'});result.flushEffects();
    button(result,label).onClick();result.rerender();
    assert.deepEqual(result.routes,['#/diagnostic/'+panel]);
    assert.equal(result.buttons.find(item=>item.id==='diagnostic-tab-'+panel)['aria-selected'],true);
    assert.deepEqual(result.calls,[]);result.unmount();
  }
});

test('quick current-site reads are display-only, ignore superseded results and clean up on unmount',async()=>{
  const pending=[];
  const result=render({presentation:'quick',panel:'overview',currentSite:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
  assert.equal(result.siteReads,0,'render itself does not read browser context');
  result.flushEffects();assert.equal(result.siteReads,1);assert.equal(result.siteListeners,1);
  result.pageChanged();assert.equal(result.siteReads,2);
  pending[1].resolve({status:'available',host:'new.example'});await new Promise(resolve=>setImmediate(resolve));
  pending[0].resolve({status:'available',host:'old.example'});await new Promise(resolve=>setImmediate(resolve));
  result.rerender();assert.match(result.html,/new\.example/);assert.doesNotMatch(result.html,/old\.example/);
  result.pageChanged();pending[2].reject(Error('context unavailable'));await new Promise(resolve=>setImmediate(resolve));
  result.rerender();assert.doesNotMatch(result.html,/new\.example/);
  result.pageChanged();result.unmount();pending[3].resolve({status:'available',host:'late.example'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(result.lateUpdates,0);assert.equal(result.siteListeners,0);
  result.pageChanged();assert.equal(result.siteReads,4);assert.deepEqual(result.calls,[]);
});

test('sidebar also reads and subscribes to display-only current-site context',()=>{
  const result=render({panel:'overview'});result.flushEffects();
  assert.equal(result.siteReads,1);assert.equal(result.siteListeners,1);assert.deepEqual(result.calls,[]);result.unmount();
});

test('management favorite count excludes non-favorites, duplicate observations and stale revisions',()=>{
  const observation=(siteId,configRevision='r')=>({siteId,configRevision,checkedAt:Date.now(),kind:'network_error',httpStatus:null,elapsedMs:null});
  const result=render({presentation:'management',panel:'overview',preview:true,snapshot:{configRevision:'r',
    favorites:[{id:'chatgpt',kind:'ai',priority:'P0'},{id:'unmeasured',kind:'custom',priority:'P1'}],
    observations:[observation('chatgpt'),observation('chatgpt'),observation('other'),observation('unmeasured','old')],
    activeRun:null,statistics:{}}});
  assert.match(result.html,/pcDiagFavoriteTests<\/small><strong>1 \/ 2<\/strong>/);
  assert.doesNotMatch(result.html,/expectedRoute/,'selected mode is not presented as a site-resolved route');
  assert.deepEqual(result.calls,[]);
});

test('live HTTP checks and favorite writes are explicit while usage stays unavailable',async()=>{
 const ai=render({httpDiagnostics:true,panel:'ai'});
 assert.match(ai.html,/diagLiveBoundary/);
 assert.match(ai.html,/diagLiveChecksHelp/);
 assert.equal(button(ai,'diagTestOne').disabled,false);
 const loaded=render({httpDiagnostics:true,panel:'ai',snapshot:{favorites:[],observations:[],statistics:{},activeRun:null}});
 assert.equal(loaded.buttons.find(item=>item['aria-label']==='diagAddFavorite').disabled,false);
 assert.deepEqual(ai.calls,[], 'render does not send network requests');
 const basic=render({httpDiagnostics:true,panel:'proxy'});
 assert.equal(button(basic,'diagPublicHttps').disabled,false);
 assert.match(basic.html,/diagLiveBoundary/);
 const speed=render({httpDiagnostics:true,panel:'speed'});
 assert.match(speed.html,/diagLiveTiming/);
 assert.doesNotMatch(speed.html,/diagSpeedCaveat|simulated-usage/);
});

test('diagnostic overview names its priority websites without promising a usage ranking',()=>{
 for(const presentation of ['management','sidebar']){
  const result=render({httpDiagnostics:true,panel:'overview',presentation,language:'zh-CN'});
  assert.match(result.html,/<h3>关键网站<\/h3>/);
  assert.doesNotMatch(result.html,/Top 5\/10/);
  assert.match(result.html,/使用统计尚未接入/);
  const open=result.buttons.find(item=>item['data-testid']==='usage-manage');
  assert.ok(open);
  result.flushEffects();
  open.onClick();
  result.rerender();
  assert.match(result.html,/<h3>我的收藏<\/h3>/);
  result.unmount();
 }
});

test('translated live evidence is neutral while preview results retain an explicit simulation prefix',()=>{
 for(const language of Object.keys(translations)){
  const snapshot={configRevision:'r',favorites:[],observations:[{siteId:'chatgpt',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:3}],statistics:{},activeRun:null};
  const live=render({httpDiagnostics:true,panel:'ai',language,snapshot}).html;
  const result=live.match(/class="diagnosticResultLabel">([^<]+)/)?.[1];assert.ok(result);assert.doesNotMatch(result,/模拟|模擬|Simulated/);
  assert.match(live,/HTTP 200/);assert.doesNotMatch(live,/title="[^"]*(?:模拟|模擬|Simulated)/);
  const preview=render({preview:true,panel:'ai',language,snapshot}).html;
  assert.match(preview.match(/class="diagnosticResultLabel">([^<]+)/)?.[1]??'',/模拟|模擬|Simulated/);
  const timing=render({httpDiagnostics:true,panel:'speed',language,snapshot}).html;
  assert.doesNotMatch(timing.match(/<h3>([^<]+)<\/h3>/)?.[1]??'',/模拟|模擬|Simulated/);
 }
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const emptySnapshot=()=>({configRevision:'r',favorites:[],observations:[],statistics:{},activeRun:null});
const favorite=(domain,priority='P1',provenance='user')=>({id:'custom:'+domain,domain,name:domain,priority,provenance,pinnedByUser:priority==='P0',kind:'custom'});
const node=(result,predicate)=>{const value=result.nodes.find(predicate);assert.ok(value,'missing rendered control');return value;};

test('all 30 persisted favorites remain accessible in stable groups without any usage calls',async()=>{
 const data=emptySnapshot();data.favorites=Array.from({length:30},(_,i)=>favorite(`site${i}.example`,i%3===0?'P0':'P1'));
 const result=render({panel:'top',httpDiagnostics:true,dispatch:async()=>({ok:true,diagnostics:data})});
 result.flushEffects();await tick();result.rerender();
 const order=[...result.html.matchAll(/data-site-id="([^"]+)"/g)].map(item=>item[1]);
 assert.deepEqual(order,Array.from(favoritesModule.exports.prioritizeFavorites(data.favorites),item=>item.id));
 assert.equal(order.length,30);assert.equal(button(result,'diagSaveSite').disabled,true);
 assert.equal(button(result,'diagCheckSaved').disabled,false);
 assert.ok(result.commands.every(item=>item.type==='GET_DIAGNOSTICS'));
 assert.doesNotMatch(result.html,/usage-controls|usage-toggle|simulated-usage/);result.unmount();
});

test('favorite form, priority, moves, removal and single/batch checks use explicit persisted requests',async()=>{
 let data=emptySnapshot();data.favorites=[favorite('first.example','P0'),favorite('second.example','P0'),favorite('last.example')];
 const result=render({panel:'top',httpDiagnostics:true,snapshot:data,dispatch:async command=>{
  if(command.type==='SAVE_DIAGNOSTIC_SITE'){
   const old=data.favorites.find(item=>item.domain===command.domain);
   data={...data,favorites:old?data.favorites.map(item=>item===old?{...item,priority:command.priority,pinnedByUser:command.priority==='P0'}:item):[...data.favorites,favorite(command.domain,command.priority)]};
  } else if(command.type==='REMOVE_DIAGNOSTIC_SITE')data={...data,favorites:data.favorites.filter(item=>item.id!==command.id)};
  else if(command.type==='MOVE_DIAGNOSTIC_SITE'){
   const list=[...data.favorites],i=list.findIndex(item=>item.id===command.id),j=i+(command.direction==='up'?-1:1);
   [list[i],list[j]]=[list[j],list[i]];data={...data,favorites:list};
  }
  return {ok:true,diagnostics:data};
 }});
 assert.deepEqual(result.commands,[]);
 node(result,item=>item.id==='diag-add-domain').onValueChange('new.example');result.rerender();
 await node(result,item=>item.type==='form').onSubmit({preventDefault(){}});await tick();result.rerender();
 assert.equal(result.commands.at(-1).type,'SAVE_DIAGNOSTIC_SITE');assert.match(result.html,/new.example/);
 const move=result.buttons.find(item=>item['aria-label']==='usageMoveUpFor:second.example');assert.equal(move.disabled,false);await move.onClick();await tick();result.rerender();
 assert.equal([...result.html.matchAll(/data-site-id="([^"]+)"/g)][0][1],'custom:second.example');
 await node(result,item=>item.type==='select'&&item['aria-label']==='diagPriorityFor:last.example').onChange({target:{value:'P0'}});await tick();result.rerender();
 assert.equal(data.favorites.find(item=>item.domain==='last.example').priority,'P0');
 await button(result,'diagTestOne').onClick();await tick();result.rerender();
 assert.equal(result.commands.at(-1).type,'RUN_DIAGNOSTICS');assert.equal(result.commands.at(-1).siteIds.length,1);
 await button(result,'diagCheckSaved').onClick();await tick();result.rerender();
 assert.deepEqual([...result.commands.at(-1).siteIds],Array.from(favoritesModule.exports.prioritizeFavorites(data.favorites),item=>item.id));
 await result.buttons.find(item=>item['aria-label']==='usageRemoveFor:new.example').onClick();await tick();result.rerender();
 assert.doesNotMatch(result.html,/data-site-id="custom:new.example"/);result.unmount();
});

test('GET failure is visible and retry restores saved sites without probing',async()=>{
 let fail=true;const data=emptySnapshot();data.favorites=[favorite('saved.example')];
 const result=render({panel:'top',httpDiagnostics:true,dispatch:async()=>fail?{ok:false,error:'denied'}:{ok:true,diagnostics:data}});
 result.flushEffects();await tick();result.rerender();assert.match(result.html,/role="alert"[^>]*><p>diagLoadFailed/);
 fail=false;await button(result,'usageRetry').onClick();await tick();result.rerender();
 assert.doesNotMatch(result.html,/diagLoadFailed/);assert.match(result.html,/saved.example/);
 assert.ok(result.commands.every(item=>item.type==='GET_DIAGNOSTICS'));result.unmount();
});

test('current website safe root is display-only in quick and sidebar diagnostics until explicit check',async()=>{
 for(const presentation of ['quick','sidebar']){
  const result=render({panel:'overview',presentation,httpDiagnostics:true,dispatch:async command=>{
   const data=emptySnapshot();if(command.type==='RUN_CURRENT_DIAGNOSTIC')data.observations=[{siteId:'current:current.example',domain:'current.example',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:8}];
   return {ok:true,diagnostics:data};
  }});
  result.flushEffects();await tick();result.rerender();assert.match(result.html,/https:\/\/current.example\//);
  assert.equal(button(result,'pcDiagCheckCurrent').disabled,false);
  assert.ok(result.commands.every(item=>item.type==='GET_DIAGNOSTICS'));
  await button(result,'pcDiagCheckCurrent').onClick();await tick();result.rerender();
  assert.deepEqual(JSON.parse(JSON.stringify(result.commands.at(-1))),{type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:'current.example'});
  assert.match(result.html,/HTTP 200/);result.unmount();
 }
});

test('management keeps favorites and batch diagnostics while directing current-page checks to the sidebar',async()=>{
 const result=render({panel:'overview',presentation:'management',httpDiagnostics:true,dispatch:async()=>({ok:true,diagnostics:emptySnapshot()})});
 result.flushEffects();await tick();result.rerender();
 assert.match(result.html,/diagCurrentSidebarHelp/);
 assert.equal(result.siteReads,0,'management must not pretend its active extension tab is the previous website');
 assert.equal(result.buttons.some(item=>item.children==='pcDiagCheckCurrent'),false);
 assert.ok(result.buttons.some(item=>item.children==='diagStartFive'));
 assert.ok(result.commands.every(item=>item.type==='GET_DIAGNOSTICS'));result.unmount();
});

test('quick diagnostics only exposes the current-site check, clears late receipts on page change, and cleans up',async()=>{
 let host='old.example',finish;const data=emptySnapshot();
 const result=render({presentation:'quick',httpDiagnostics:true,currentSite:async()=>({status:'available',host,diagnosticDomain:host}),dispatch:async command=>{
  if(command.type==='RUN_CURRENT_DIAGNOSTIC')return new Promise(resolve=>{finish=resolve;});
  return {ok:true,diagnostics:data};
 }});
 result.flushEffects();await tick();result.rerender();
 assert.doesNotMatch(result.html,/diagnosticTabs|diagStartFive|diagCheckSelected|diagAddFavorite/);
 const run=button(result,'pcDiagCheckCurrent').onClick();await tick();
 host='new.example';result.pageChanged();await tick();result.rerender();
 finish({ok:true,diagnostics:{...data,observations:[{siteId:'current:old.example',domain:'old.example',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:8}]}});
 await run;await tick();result.rerender();assert.match(result.html,/https:\/\/new.example\//);assert.doesNotMatch(result.html,/HTTP 200|old.example/);
 result.unmount();assert.equal(result.commands.at(-1).type,'CANCEL_DIAGNOSTICS');assert.equal(result.siteListeners,0);assert.equal(result.lateUpdates,0);
});

test('unsafe or unavailable current contexts have a reason and cannot dispatch a current check',async()=>{
 for(const reason of ['unavailable','https-required','public-host-required']){
  const result=render({panel:'overview',httpDiagnostics:true,currentSite:async()=>({status:'available',host:'display.example',diagnosticDomain:null,diagnosticReason:reason}),dispatch:async()=>({ok:true,diagnostics:emptySnapshot()})});
  result.flushEffects();await tick();result.rerender();assert.equal(button(result,'pcDiagCheckCurrent').disabled,true);
  assert.match(result.html,new RegExp(reason==='https-required'?'diagCurrentHttpsRequired':reason==='public-host-required'?'diagCurrentPublicRequired':'diagCurrentUnavailable'));
  button(result,'pcDiagCheckCurrent').onClick();await tick();assert.ok(result.commands.every(item=>item.type==='GET_DIAGNOSTICS'));result.unmount();
 }
});
test('current result appears after the active run completes through polling',async()=>{
 let snapshot={...emptySnapshot(),observations:[{siteId:'current:current.example',domain:'current.example',configRevision:'r',checkedAt:Date.now()-1000,kind:'http_ok',httpStatus:200,elapsedMs:8}]};
 const result=render({panel:'overview',httpDiagnostics:true,dispatch:async command=>{
  if(command.type==='RUN_CURRENT_DIAGNOSTIC')snapshot={...snapshot,activeRun:{startedAt:Date.now(),completed:0,total:1}};
  return {ok:true,diagnostics:snapshot};
 }});
 result.flushEffects();await tick();result.rerender();
 button(result,'pcDiagCheckCurrent').onClick();await tick();result.rerender();result.flushEffects();
 assert.doesNotMatch(result.html,/HTTP 200/);
 snapshot={...snapshot,activeRun:null,observations:[{siteId:'current:current.example',domain:'current.example',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:8}]};
 assert.equal(result.poll(),1);await tick();result.rerender();assert.match(result.html,/HTTP 200/);result.unmount();
});

test('page change clears the target immediately and drops late current checks even on the same domain',async()=>{
 let finish,resolveSite,reads=0;
 const result=render({panel:'overview',httpDiagnostics:true,currentSite:()=>++reads===1?Promise.resolve({status:'available',host:'same.example',diagnosticDomain:'same.example',diagnosticReason:null}):new Promise(resolve=>{resolveSite=resolve;}),dispatch:command=>command.type==='RUN_CURRENT_DIAGNOSTIC'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({ok:true,diagnostics:emptySnapshot()})});
 result.flushEffects();await tick();result.rerender();button(result,'pcDiagCheckCurrent').onClick();
 result.pageChanged();result.rerender();assert.doesNotMatch(result.html,/https:\/\/same.example/);assert.equal(button(result,'pcDiagCheckCurrent').disabled,true);
 resolveSite({status:'available',host:'same.example',diagnosticDomain:'same.example',diagnosticReason:null});await tick();
 const data=emptySnapshot();data.observations=[{siteId:'current:same.example',domain:'same.example',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:1}];
 finish({ok:true,diagnostics:data});await tick();result.rerender();assert.doesNotMatch(result.html,/HTTP 200/);result.unmount();assert.equal(result.lateUpdates,0);
});

test('cancel supersedes a pending run, and unmount ignores late command and GET replies',async()=>{
 let finish;
 const result=render({panel:'ai',httpDiagnostics:true,snapshot:emptySnapshot(),dispatch:command=>command.type==='RUN_DIAGNOSTICS'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({ok:true,diagnostics:emptySnapshot()})});
 button(result,'diagTestOne').onClick();result.rerender();await button(result,'diagCancel').onClick();await tick();
 const data=emptySnapshot();data.observations=[{siteId:'chatgpt',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:1}];
 finish({ok:true,diagnostics:data});await tick();result.rerender();assert.doesNotMatch(result.html,/HTTP 200/);result.unmount();
 const pending=[];const late=render({panel:'top',httpDiagnostics:true,dispatch:command=>command.type==='GET_DIAGNOSTICS'?new Promise(resolve=>pending.push(resolve)):Promise.resolve({ok:true})});
 late.flushEffects();late.unmount();for(const resolve of pending)resolve({ok:true,diagnostics:data});await tick();assert.equal(late.lateUpdates,0);
});

test('GET replies older than an explicit favorite save cannot overwrite its persisted receipt',async()=>{
 const pending=[],data=emptySnapshot();data.favorites=[favorite('saved.example')];
 const result=render({panel:'ai',httpDiagnostics:true,snapshot:emptySnapshot(),dispatch:command=>command.type==='GET_DIAGNOSTICS'
  ?new Promise(resolve=>pending.push(resolve)):Promise.resolve({ok:true,diagnostics:data})});
 result.flushEffects();
 await result.buttons.find(item=>item['aria-label']==='diagAddFavorite').onClick();await tick();result.rerender();
 assert.equal(result.buttons.find(item=>item['aria-label']==='diagAddFavorite').disabled,false);
 // Navigate via the real tab handler to inspect the saved list.
 result.buttons.find(item=>item.id==='diagnostic-tab-top').onClick();result.rerender();assert.match(result.html,/saved.example/);
 for(const resolve of pending)resolve({ok:true,diagnostics:emptySnapshot()});await tick();result.rerender();
 assert.match(result.html,/saved.example/);assert.doesNotMatch(result.html,/diagLoadFailed/);result.unmount();
});

test('same-revision status refresh preserves a running diagnostic and its polling',async()=>{
 const data={...emptySnapshot(),activeRun:{startedAt:Date.now(),completed:0,total:1}};
 const result=render({panel:'ai',httpDiagnostics:true,dispatch:async()=>({ok:true,diagnostics:data})});
 result.flushEffects();await tick();result.rerender();result.flushEffects();
 assert.match(result.html,/diagnosticRunProgress/);
 const reads=result.commands.length;
 result.refreshConfig();result.rerender();
 assert.match(result.html,/diagnosticRunProgress/);
 assert.equal(result.commands.length,reads);
 result.refreshConfig('config-2');
 assert.equal(result.commands.at(-1).type,'GET_DIAGNOSTICS');
 assert.equal(result.commands.length,reads+1);
 await tick();result.unmount();
});

test('cancel invalidates old GET observations as well as the pending run response',async()=>{
 const pending=[],data=emptySnapshot();let finish;
 const result=render({panel:'proxy',httpDiagnostics:true,snapshot:data,dispatch:command=>{
  if(command.type==='GET_DIAGNOSTICS')return new Promise(resolve=>pending.push(resolve));
  if(command.type==='RUN_DIAGNOSTICS')return new Promise(resolve=>{finish=resolve;});
  return Promise.resolve({ok:true,diagnostics:data});
 }});
 result.flushEffects();button(result,'diagPublicHttps').onClick();result.rerender();
 await button(result,'diagCancel').onClick();await tick();
 const old={...data,observations:[{siteId:'public-https',configRevision:'r',checkedAt:Date.now(),kind:'http_ok',httpStatus:200,elapsedMs:1}]};
 for(const resolve of pending)resolve({ok:true,diagnostics:old});finish({ok:true,diagnostics:old});await tick();result.rerender();
 assert.doesNotMatch(result.html,/HTTP 200/);result.unmount();
});

test('favorite failure stays visible, duplicate writes are locked, and late writes after unmount do not update',async()=>{
 let finish,count=0;
 const result=render({panel:'ai',httpDiagnostics:true,snapshot:emptySnapshot(),dispatch:command=>{if(command.type!=='SAVE_DIAGNOSTIC_SITE')return Promise.resolve({ok:true,diagnostics:emptySnapshot()});count++;return new Promise(resolve=>{finish=resolve;});}});
 result.flushEffects();await tick();result.rerender();
 const save=result.buttons.find(item=>item['aria-label']==='diagAddFavorite');save.onClick();save.onClick();
 assert.equal(count,1);result.rerender();assert.equal(result.buttons.find(item=>item['aria-label']==='diagAddFavorite').disabled,true);
 finish({ok:false,error:'storage failed'});await tick();result.rerender();assert.match(result.html,/role="alert">diagOperationFailed/);
 result.buttons.find(item=>item['aria-label']==='diagAddFavorite').onClick();result.unmount();finish({ok:true,diagnostics:emptySnapshot()});await tick();assert.equal(result.lateUpdates,0);
});

for(const presentation of ['quick','sidebar','management'])test(`${presentation} busy-only operations disable checks without inventing a diagnostic run`,async()=>{
 const result=render({presentation,panel:'ai',busy:true,httpDiagnostics:true,dispatch:async()=>({ok:true,diagnostics:emptySnapshot()})});
 result.flushEffects();await tick();result.rerender();
 assert.equal(button(result,presentation==='quick'?'pcDiagCheckCurrent':'diagTestOne').disabled,true);
 assert.doesNotMatch(result.html,/diagRunning|diagCancel|diagnosticRunProgress/);
 assert.ok(result.commands.every(command=>command.type==='GET_DIAGNOSTICS'));result.unmount();
});

for(const presentation of ['quick','sidebar','management'])for(const busy of [false,true])test(`${presentation} active diagnostics retain cancellation with busy=${busy}`,async()=>{
 const snapshot={...emptySnapshot(),activeRun:{startedAt:Date.now(),completed:0,total:1}};
 const result=render({presentation,panel:'ai',busy,httpDiagnostics:true,snapshot,dispatch:async()=>({ok:true,diagnostics:emptySnapshot()})});
 assert.equal(button(result,presentation==='quick'?'pcDiagCheckCurrent':'diagTestOne').disabled,true);
 assert.notEqual(button(result,'diagCancel').disabled,true);
 assert.match(result.html,/diagRunning/);
 assert.deepEqual(result.commands,[],'rendering an active run must not start another request');
 button(result,'diagCancel').onClick();await tick();
 assert.deepEqual(result.commands.map(command=>command.type),['CANCEL_DIAGNOSTICS']);result.unmount();
});

test('quick manual site refresh recovers an unavailable diagnostic target without a page event or HTTP check',async()=>{
 let available=false;
 const result=render({presentation:'quick',httpDiagnostics:true,currentSite:async()=>available
  ?{status:'available',host:'recovered.example',diagnosticDomain:'recovered.example'}:{status:'unavailable'},
  dispatch:async()=>({ok:true,diagnostics:emptySnapshot()})});
 result.flushEffects();await tick();result.rerender();assert.equal(button(result,'pcDiagCheckCurrent').disabled,true);
 available=true;result.refreshSite();await tick();result.rerender();
 assert.equal(button(result,'pcDiagCheckCurrent').disabled,false);assert.match(result.html,/https:\/\/recovered.example\//);
 assert.ok(result.commands.every(command=>command.type==='GET_DIAGNOSTICS'));result.unmount();
});
