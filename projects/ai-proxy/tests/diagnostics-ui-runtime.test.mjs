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
function render({preview=false,panel='ai'}={}){
  const calls=[];
  const navigation={getRoute:()=>`#/diagnostic/${panel}`,subscribe:()=>()=>{}};
  const noopEvents={addListener(){},removeListener(){}};
  const env={preview,navigation,navigate(){calls.push('navigate');},storage:{onChanged:noopEvents},
    proxy:{settings:{onChange:noopEvents}},getDraftRevision:()=>0,setDraftDirty:()=>true};
  const config={profiles:[],selection:{mode:'system'},endpoints:[],rules:[],defaultTarget:{action:'direct'}};
  const state={config,runtime:{managedIntent:false,control:'controllable_by_this_extension',
    applied:false,pendingChanges:false,credentialRequired:false,proxyError:null,activeSelection:null,
    browserMode:'system',desired:{mode:'system'},canStop:false,probe:null}};
  const module={exports:{}};
  const hooks={...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],
    useRef:initial=>({current:initial}),useEffect(){},useMemo:callback=>callback(),
    useCallback:callback=>callback};
  runInNewContext(code,{exports:module.exports,module,require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return jsxRuntime;
    if(name==='../environment')return {getEnvironment:()=>env};
    if(name==='@opendesk/ui')return {Button:React.forwardRef(({children,variant,...props},ref)=>
      React.createElement('button',{...props,ref},children))};
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({locale:'en',t:key=>key})};
    if(name==='../domain/messages')return {request:async()=>{calls.push('request');return {ok:false,error:'E_NOT_CONNECTED'}}};
    if(name==='../diagnostics/catalog')return {AI_SITES:[{id:'chatgpt',name:'ChatGPT',domain:'chatgpt.com'}]};
    if(name==='../diagnostics/logic')return {diagnosisCodes:()=>['limited_evidence'],observationIsCurrent:()=>false};
    if(name==='./Status')return {Status:()=>React.createElement('span',null,'live-status')};
    if(name==='./ProxyEntry')return {ClearableInput:()=>React.createElement('input')};
    if(name==='./UsageControls')return {UsageControls:()=>React.createElement('span',null,'simulated-usage'),UsageOverview:()=>null};
    if(name==='./optionsRoute')return {
      diagnosticHash:name=>`#/diagnostic/${name}`,
      parseDiagnosticHash:route=>route.split('/').at(-1)};
    throw Error('Unhandled dependency '+name);
  }});
  return {html:renderToStaticMarkup(React.createElement(module.exports.DiagnosticsPage,{
    state,busy:false,onRefresh:async()=>calls.push('refresh'),
    onProbe:async()=>calls.push('probe'),onStop:async()=>calls.push('stop'),onProfiles:()=>calls.push('profiles')})),calls};
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
  assert.match(installed.html,/live-status/);
  assert.match(installed.html,/probeApiIpifyOrg/);
  assert.match(installed.html,/stopManagingAndReleaseControl/);
  assert.deepEqual(installed.calls,[],'viewing control status must never APPLY or STOP');
});
