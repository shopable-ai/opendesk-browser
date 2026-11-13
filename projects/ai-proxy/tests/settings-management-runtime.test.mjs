import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build,transform} from 'esbuild';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {runInNewContext} from 'node:vm';
import {load} from 'cheerio';

async function bundle(path){
 const result=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const domain=await bundle('../src/domain/config.ts'),routes=await bundle('../src/ui/optionsRoute.ts');
const headerActions=await bundle('../src/domain/header-actions.ts');
const {translate}=await bundle('../src/i18n/locale.ts');
const settingsCode=(await transform(await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const statusCode=(await transform(await readFile(new URL('../src/ui/Status.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
function render(locale,runtime,{config={...domain.freshConfig(),selection:{mode:'direct'}},route='#/rules',stateOverride,presentation='management',onNavigate=()=>{},buttons=[]}={}){
 const hooks={...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial}),useEffect(){}};
 const i18n={useI18n:()=>({locale,t:(key,params)=>translate(locale,key,params)})};
 const statusModule={exports:{}};
 runInNewContext(statusCode,{module:statusModule,exports:statusModule.exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;
  if(name==='../i18n/LocaleProvider')return i18n;
  return {};
 }});
 const module={exports:{}};
 runInNewContext(settingsCode,{module,exports:module.exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;
  if(name==='./i18n/LocaleProvider')return i18n;
  if(name==='./domain/header-actions')return headerActions;
  if(name==='./domain/config')return domain;if(name==='./ui/optionsRoute')return routes;
  if(name==='./ui/Status')return statusModule.exports;
  if(name==='./environment')return {getEnvironment:()=>({navigation:{getRoute:()=>route},navigate:onNavigate,isDraftDirty:()=>false})};
  if(name==='./ui/useProxy')return {useProxy:()=>({state:stateOverride===undefined?{config,runtime}:stateOverride,busy:false,error:'',act:()=>assert.fail('render mutated proxy state')})};
  if(name==='@opendesk/ui')return {Button:({children,variant,...props})=>{buttons.push({children,...props});return React.createElement('button',props,children);}};
  if(name==='./ui/FormField')return {FormField:({id,label,className,children})=>React.createElement('div',{className},React.createElement('label',{htmlFor:id},label),typeof children==='function'?children({id}):children)};
  return new Proxy({},{get:()=>()=>null});
 }});
 return load(renderToStaticMarkup(React.createElement(module.exports.default,{presentation})));
}

test('PC rules explain save-only routing once whether rules mode is selected or not',()=>{
 for(const locale of ['zh-CN','zh-TW','en'])for(const mode of ['direct','rules']){
  const config={...domain.freshConfig(),selection:{mode}};
  const $=render(locale,{desired:config.selection,control:'controllable_by_this_extension',applied:false},{config});
  const note=translate(locale,'apRuleSaveNote');
  assert.equal($('.rulesPage .hint').toArray().filter(element=>$(element).text()===note).length,1);
  assert.equal($('.rulesModeHint').length,mode==='rules'?0:1);
  assert.equal($('.rulesDefault > h2').text(),translate(locale,'whenNoRuleMatches'));
  assert.equal($('.rulesDefault > .hint').text(),translate(locale,'apDefaultRouteHelp'));
 }
});

test('management summary labels saved Direct as a selection independently from confirmed Rules, system, errors and unknown runtime',()=>{
 const base={desired:{mode:'direct'},managedIntent:true,control:'controlled_by_this_extension',applied:true,
  pendingChanges:true,activeSelection:{mode:'rules'},browserMode:'rules',proxyError:null};
 const cases=[
  [base,'proxyPendingShort',true],
  [{...base,pendingChanges:false,activeSelection:{mode:'direct'},browserMode:'direct'},'appliedToChrome',false],
  [{...base,managedIntent:false,applied:false,control:'controllable_by_this_extension',browserMode:'system',activeSelection:null},'browserProxyNotManaged',true],
  [{...base,proxyError:'E_FAILURE'},'proxyOperationFailedShort',true],
  [{...base,applied:false,control:'unknown',browserMode:null,activeSelection:null,statusErrorCode:'E_TOOL',outcomeUnknown:true},'apProxyStatusUnavailable',true]
 ];
 for(const locale of ['zh-CN','zh-TW','en'])for(const [runtime,status,pending] of cases){
  const $=render(locale,runtime),bar=$('.managementConnectionBar');
  assert.equal(bar.find('.controlChip').text(),translate(locale,status));
  assert.ok(bar.text().includes(translate(locale,'popupModeDirect')));
  assert.ok(bar.text().includes(translate(locale,pending?'apPendingSelection':'selectedModeLabel',{mode:translate(locale,'popupModeDirect')})));
  assert.ok(!bar.text().includes(translate(locale,'browserRoutingMode')),'saved mode must not be labelled as browser runtime');
  assert.equal(bar.find('.controlChip').hasClass('isApplied'),!pending);
  assert.doesNotMatch(bar.text(),/\b(?:IP|exit|reachable|connected)\b/i);
 }
});

test('the management control-status shortcut uses guarded navigation directly to basic proxy diagnostics',()=>{
 const buttons=[],visited=[];
 render('zh-CN',{desired:{mode:'direct'},control:'controllable_by_this_extension',applied:false,pendingChanges:true},
  {buttons,onNavigate:route=>visited.push(route)});
 const shortcut=buttons.find(button=>button.children===translate('zh-CN','viewActualControlStatus'));
 assert.ok(shortcut);
 shortcut.onClick();
 assert.deepEqual(visited,['#/diagnostic/proxy']);
});

test('the real PC proxy table distinguishes saved choice, browser-applied identity and empty states',()=>{
 const baseConfig=domain.freshConfig();
 const endpoint={id:'endpoint-a',name:'Test proxy A',sourceId:'manual',scheme:'http',host:'127.0.0.1',port:7890};
 const profile={id:'profile-a',name:'Test proxy A',sourceId:'manual',kind:'endpoint',endpointId:'endpoint-a'};
 const config={...baseConfig,endpoints:[endpoint],profiles:[profile],
  selection:{mode:'profile',profileId:profile.id}};
 const stopped={state:'disabled',control:'controllable_by_this_extension',canStop:false,desired:config.selection,managedIntent:false,
  applied:false,pendingChanges:true,activeSelection:null,browserMode:'system',proxyError:null};
 const $=render('zh-CN',stopped,{config,route:'#/profiles'});
 assert.equal($('.managementNav button').length,7,'keep the existing seven real management routes');
 assert.equal($('.managementNav button[aria-current="page"]').length,1,'deep linked profiles stays highlighted');
 const row=$('.profileRecords .proxyRecord');
 assert.equal(row.length,1);
 assert.match(row.text(),/Test proxy A/);
 assert.equal(row.find('.managementProtocolLetter').text(),'H');
 assert.equal(row.find('.proxySelect[aria-pressed="true"]').length,1);
 assert.equal(row.find('.managementRecordTag:not(.managementAppliedTag)').length,1);
 assert.equal(row.find('.managementAppliedTag').length,0,'selected is not applied');
 const active={...stopped,state:'enabled',control:'controlled_by_this_extension',canStop:true,
  managedIntent:true,applied:true,pendingChanges:false,activeSelection:{mode:'profile',profileId:profile.id},browserMode:'fixed_servers'};
 const $active=render('zh-CN',active,{config,route:'#/profiles'});
 assert.equal($active('.profileRecords .managementAppliedTag').length,1,'confirmed applied is an additional label');
 assert.equal($active('.profileRecords .managementRecordTag').length,2);
 const $empty=render('zh-CN',stopped,{config:baseConfig,route:'#/profiles'});
 assert.equal($empty('.managementEmptyState').length,1);
 assert.equal($empty('.profileRecords .proxyRecord').length,0);
});

test('PC initial state retains workbench identity and honest loading/retry instead of a blank page',()=>{
 const $=render('zh-CN',{}, {route:'#/profiles',stateOverride:null});
 assert.equal($('.managementIdentity').length,1);
 assert.equal($('.managementLoadingState[role="status"]').length,1);
 assert.match($('.managementLoadingState').text(),/读取|正在|状态/);
 assert.ok($('.managementLoadingState button').length);
});

test('both settings presentations mount the shared proxy editor only after an explicit edit intent',()=>{
 const config=domain.freshConfig();
 const runtime={state:'disabled',control:'controllable_by_this_extension',canStop:false,
  desired:config.selection,managedIntent:false,applied:false,pendingChanges:false,
  activeSelection:null,browserMode:'system',proxyError:null};
 for(const presentation of ['management','sidebar']){
  const buttons=[];
  const $=render('zh-CN',runtime,{config,route:'#/profiles',presentation,buttons});
  assert.equal($('.proxyEditorDialog').length,0,'no hidden editor or draft is mounted during browsing');
  assert.ok(buttons.some(button=>button.children===translate('zh-CN','addProxy2')),
   'the real add entry remains available');
 }
});

test('PC website rules expose preview-style route/priority columns while Side Panel stays compact',()=>{
 const base=domain.freshConfig();
 const config={...base,rules:[{id:'rule-1',domain:'chat.example',includeSubdomains:true,
  priority:20,enabled:true,action:'direct'}]};
 const runtime={state:'disabled',control:'controllable_by_this_extension',canStop:false,
  desired:config.selection,managedIntent:false,applied:false,pendingChanges:false,
  activeSelection:null,browserMode:'system',proxyError:null};
 const pc=render('zh-CN',runtime,{config,route:'#/rules'});
 assert.equal(pc('.managementRulesHeader').length,1);
 assert.equal(pc('.ruleRecord .managementRuleTarget').text(),translate('zh-CN','directConnection2'));
 assert.equal(pc('.ruleRecord .managementRulePriority').val(),'20');
 assert.match(pc('.ruleRecordText small').text(),/子域/);
 const side=render('zh-CN',runtime,{config,route:'#/rules',presentation:'sidebar'});
 assert.equal(side('.managementRulesHeader').length,0);
 assert.equal(side('.managementRuleTarget,.managementRulePriority').length,0);
 assert.match(side('.ruleRecordText small').text(),/20/);
});
