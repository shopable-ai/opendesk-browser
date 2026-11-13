import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../src/ui/DiagnosticsPage.tsx',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic'});
const statusSource=await readFile(new URL('../src/ui/Status.tsx',import.meta.url),'utf8');
const {code:statusCode}=await transform(statusSource,{loader:'tsx',format:'cjs',jsx:'automatic'});
const logicModule={exports:{}};
runInNewContext((await transform(await readFile(new URL('../src/diagnostics/logic.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'})).code,
  {module:logicModule,exports:logicModule.exports});
function render({preview=false,panel='ai',busy=false,config:configPatch={},runtime={},presentation='sidebar',snapshot=null,
  currentSite=async()=>({status:'available',host:'current.example'})}={}){
  const calls=[],buttons=[],routes=[],slots=[],effects=[],routeListeners=new Set(),siteListeners=new Set();
  let diagnosisInput,route=`#/diagnostic/${panel}`,cursor=0,html,siteReads=0,unmounted=false,lateUpdates=0;
  const navigation={getRoute:()=>route,subscribe:fn=>{routeListeners.add(fn);return()=>routeListeners.delete(fn);}};
  const noopEvents={addListener(){},removeListener(){}};
  const env={preview,navigation,navigate(next){routes.push(next);route=next;for(const fn of routeListeners)fn();},storage:{onChanged:noopEvents},
    currentSite(){siteReads++;return currentSite();},
    events:{addEventListener(name,fn){assert.equal(name,'ai-proxy-page-changed');siteListeners.add(fn);},
      removeEventListener(name,fn){assert.equal(name,'ai-proxy-page-changed');siteListeners.delete(fn);}},
    proxy:{settings:{onChange:noopEvents}},getDraftRevision:()=>0,setDraftDirty:()=>true};
  const config={profiles:[],selection:{mode:'system'},endpoints:[],rules:[],defaultTarget:{action:'direct'},...configPatch};
  const state={config,runtime:{managedIntent:false,control:'controllable_by_this_extension',
    applied:false,pendingChanges:false,credentialRequired:false,proxyError:null,activeSelection:null,
    browserMode:'system',desired:{mode:'system'},canStop:false,probe:null,...runtime}};
  const module={exports:{}};
  const hooks={...React,useState(initial){const index=cursor++;
      if(!(index in slots))slots[index]=initial===null?snapshot:typeof initial==='function'?initial():initial;
      return [slots[index],value=>{if(unmounted)lateUpdates++;slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial){const index=cursor++;return slots[index]??={current:initial};},
    useEffect(fn,deps){const index=cursor++,previous=effects[index];
      if(!previous||!deps||deps.some((value,i)=>value!==previous.deps?.[i]))effects[index]={fn,deps,pending:true,cleanup:previous?.cleanup};},useMemo:callback=>callback(),
    useCallback:callback=>callback};
  const translate=(key,values)=>key+(values ? ':'+Object.values(values).join('|') : '');
  const statusModule={exports:{}};
  const statusRequire=name=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return jsxRuntime;
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({locale:'en',t:translate})};
    if(name==='../i18n/errors')return {localizedBackendError:(_locale,error)=>error};
    throw Error('Unhandled Status dependency '+name);
  };
  runInNewContext(statusCode,{exports:statusModule.exports,module:statusModule,require:statusRequire});
  runInNewContext(code,{exports:module.exports,module,
    window:{setInterval:()=>0,clearInterval(){},addEventListener(){},removeEventListener(){}},
    document:{addEventListener(){},removeEventListener(){}},require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return jsxRuntime;
    if(name==='../environment')return {getEnvironment:()=>env};
    if(name==='@opendesk/ui')return {Button:React.forwardRef(({children,variant,...props},ref)=>
      {
        buttons.push({children,...props});
        return React.createElement('button',{...props,ref},children);
      })};
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({locale:'en',t:translate})};
    if(name==='../domain/messages')return {request:async()=>{calls.push('request');return {ok:false,error:'E_NOT_CONNECTED'}}};
    if(name==='../diagnostics/catalog')return {AI_SITES:[{id:'chatgpt',name:'ChatGPT',domain:'chatgpt.com'}]};
    if(name==='../diagnostics/logic')return {...logicModule.exports,diagnosisCodes:input=>{diagnosisInput=input;return ['limited_evidence'];}};
    if(name==='./Status')return statusModule.exports;
    if(name==='./ProxyEntry')return {ClearableInput:()=>React.createElement('input')};
    if(name==='./UsageControls')return {UsageControls:()=>React.createElement('span',null,'simulated-usage'),UsageOverview:()=>null};
    if(name==='./optionsRoute')return {
      diagnosticHash:name=>`#/diagnostic/${name}`,
      parseDiagnosticHash:route=>route.split('/').at(-1)};
    throw Error('Unhandled dependency '+name);
  }});
  function rerender(){cursor=0;buttons.length=0;
    html=renderToStaticMarkup(React.createElement(module.exports.DiagnosticsPage,{
      state,busy,presentation,onRefresh:async()=>calls.push('refresh'),
      onProbe:async()=>calls.push('probe'),onStop:async()=>calls.push('stop'),onProfiles:()=>calls.push('profiles')}));return html;}
  function flushEffects(){for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.fn();}}
  rerender();
  return {get html(){return html;},calls,buttons,routes,rerender,flushEffects,
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

test('management current-site checks remain disabled with an explanation and no dispatch path',()=>{
  for(const preview of [false,true]){
    const result=render({presentation:'management',panel:'overview',preview});
    const check=button(result,'pcDiagCheckCurrent');
    assert.equal(check.disabled,true);assert.equal(check.onClick,undefined);
    assert.equal(check['aria-describedby'],'current-site-check-unavailable');
    assert.match(result.html,/<p[^>]*id="current-site-check-unavailable"[^>]*>pcDiagCurrentUnavailable<\/p>/);
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

test('management current-site reads are display-only, ignore superseded results and clean up on unmount',async()=>{
  const pending=[];
  const result=render({presentation:'management',panel:'overview',currentSite:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
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

test('sidebar presentation does not read or subscribe to management current-site context',()=>{
  const result=render({panel:'overview'});result.flushEffects();
  assert.equal(result.siteReads,0);assert.equal(result.siteListeners,0);assert.deepEqual(result.calls,[]);result.unmount();
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
