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
const backupValidation=await bundle('../src/ui/backupImport.ts');
const {translate}=await bundle('../src/i18n/locale.ts');
const settingsCode=(await transform(await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const statusCode=(await transform(await readFile(new URL('../src/ui/Status.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const shellCode=(await transform(await readFile(new URL('../src/ui/OptionsShell.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const profileFavorites={ids:[],ready:true,busy:false,error:false,toggle:()=>{}};
function render(locale,runtime,{config={...domain.freshConfig(),selection:{mode:'direct'}},route='#/rules',stateOverride,presentation='management',onNavigate=()=>{},buttons=[],elements=[],hookState=[],actions,onError=()=>{},onErrorKey=()=>{}}={}){
 let cursor=0;
 const hooks={...React,useState:initial=>{
  const index=cursor++;if(!(index in hookState))hookState[index]={current:typeof initial==='function'?initial():initial};
  return [hookState[index].current,value=>{hookState[index].current=typeof value==='function'?value(hookState[index].current):value;}];
 },useRef:initial=>{const index=cursor++;return hookState[index]??={current:initial};},useEffect(){}};
 const settingsJsx={...jsx,...Object.fromEntries(['jsx','jsxs'].map(name=>[name,(type,props,...rest)=>{
  if(typeof type==='string')elements.push({type,...props});
  return jsx[name](type,props,...rest);
 }]))};
 const i18n={useI18n:()=>({locale,t:(key,params)=>translate(locale,key,params)})};
 const statusModule={exports:{}};
 runInNewContext(statusCode,{module:statusModule,exports:statusModule.exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;
  if(name==='../i18n/LocaleProvider')return i18n;
  return {};
 }});
 const shellModule={exports:{}};
 runInNewContext(shellCode,{module:shellModule,exports:shellModule.exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;
  return {};
 }});
 const module={exports:{}};
 runInNewContext(settingsCode,{module,exports:module.exports,require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return settingsJsx;
  if(name==='./i18n/LocaleProvider')return i18n;
  if(name==='./domain/header-actions')return headerActions;
  if(name==='./domain/config')return domain;if(name==='./ui/optionsRoute')return routes;
  if(name==='./ui/backupImport')return backupValidation;
  if(name==='./ui/OptionsShell')return shellModule.exports;
  if(name==='./ui/Status')return statusModule.exports;
  if(name==='./ui/ProfileFavorites')return {useProfileFavorites:()=>profileFavorites};
  if(name==='./environment')return {getEnvironment:()=>({navigation:{getRoute:()=>route},navigate:onNavigate,isDraftDirty:()=>false,
   confirm:()=>assert.fail('preview or selection requested confirmation')})};
  if(name==='./ui/useProxy')return {useProxy:()=>({state:stateOverride===undefined?{config,runtime}:stateOverride,busy:false,error:'',setError:onError,setErrorKey:onErrorKey,
   act:message=>{assert.ok(actions,'render mutated proxy state');actions.push(message);return Promise.resolve(null);}})};
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

function profilesConfig(){
 const endpoint={id:'endpoint-a',name:'Previous proxy',sourceId:'manual',scheme:'http',host:'127.0.0.1',port:7890};
 const profile={id:'profile-a',name:'Previous proxy',sourceId:'manual',kind:'endpoint',endpointId:endpoint.id};
 const pac={id:'pac-a',name:'Local PAC',sourceId:'manual',kind:'pac-inline',pacText:'function FindProxyForURL(url,host){return "DIRECT";}'};
 return {...domain.freshConfig(),endpoints:[endpoint],profiles:[profile,pac],selection:{mode:'profile',profileId:profile.id}};
}
function stoppedRuntime(config){
 return {desired:config.selection,state:'disabled',control:'controllable_by_this_extension',managedIntent:false,
  applied:false,pendingChanges:true,activeSelection:null,browserMode:'system',canStop:false,proxyError:null};
}

test('PC profiles use row selection while sidebar retains the complete saved-profile dropdown and SELECT action',async()=>{
 const config=profilesConfig(),actions=[],elements=[];
 const pc=render('en',stoppedRuntime(config),{config,route:'#/profiles'});
 assert.equal(pc('#options-profile').length,0);
 assert.equal(pc('.optionsProfileSelect').length,0);
 const sidebar=render('en',stoppedRuntime(config),{config,route:'#/profiles',presentation:'sidebar',actions,elements});
 assert.equal(sidebar('#options-profile').length,1);
 assert.deepEqual(sidebar('#options-profile option').map((_,node)=>sidebar(node).val()).get(),['','profile-a','pac-a']);
 assert.equal(sidebar('#options-profile').val(),'profile-a');
 assert.equal(actions.length,0);
 await elements.find(element=>element.id==='options-profile').onChange({target:{value:'pac-a'}});
 assert.deepEqual(JSON.parse(JSON.stringify(actions)),[{type:'SELECT',selection:{mode:'profile',profileId:'pac-a'}}]);
});

test('PC proxy and PAC row selection dispatch SELECT only without applying, stopping or changing configuration',async()=>{
 for(const [name,profileId] of [['Previous proxy','profile-a'],['Local PAC','pac-a']]){
  const config=profilesConfig(),actions=[],buttons=[],visited=[];
  config.selection={mode:'direct',profileId:'profile-a'};
  const selectionBefore=JSON.stringify(config);
  const $=render('en',stoppedRuntime(config),{config,route:'#/profiles',actions,buttons,onNavigate:route=>visited.push(route)});
  const row=profileId==='pac-a'?$('.pacRecord'):$('.profileRecords .proxyRecord');
  assert.equal(row.find('.recordActions .proxySelect').length,1);
  const select=buttons.filter(button=>button.className==='proxyIconButton proxySelect'&&button['aria-label']===translate('en','selectNamedProxy',{name}));
  assert.equal(select.length,1);assert.equal(select[0].disabled,false);
  assert.equal(actions.length,0);await select[0].onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(actions)),[{type:'SELECT',selection:{mode:'profile',profileId}}]);
  assert.deepEqual(visited,[]);assert.equal(JSON.stringify(config),selectionBefore);
 }
});

test('PC subscriptions page header import opens the new-subscription route without a configuration action',()=>{
 for(const locale of ['zh-CN','zh-TW','en']){
  const config=domain.freshConfig(),actions=[],buttons=[],visited=[];
  const $=render(locale,stoppedRuntime(config),{config,route:'#/subscriptions',actions,buttons,onNavigate:route=>visited.push(route)});
  const label=translate(locale,'pcImportSubscription');
  assert.equal($('.optionsPageHead .panelHeadActions button').filter((_,node)=>$(node).text()===label).length,1);
  const imports=buttons.filter(button=>button.children===label);
  assert.equal(imports.length,1);assert.equal(imports[0].disabled,false);
  assert.deepEqual(visited,[]);assert.equal(actions.length,0);
  imports[0].onClick();assert.deepEqual(visited,['#/subscriptions/new']);assert.equal(actions.length,0);
 }
});

test('PC mode summary ignores retained proxy identity in Direct, System and Rules, and shows it only in Profile mode',()=>{
 const modeKeys={direct:'popupModeDirect',system:'popupModeSystem',rules:'popupModeRules'};
 for(const locale of ['zh-CN','zh-TW','en'])for(const [mode,key] of Object.entries(modeKeys)){
  const config=profilesConfig();config.selection={mode,profileId:'profile-a'};
  const runtime={...stoppedRuntime(config),activeSelection:{mode:'profile',profileId:'profile-a'}};
  const $=render(locale,runtime,{config,route:'#/profiles'}),summary=$('.managementRouteSummary');
  assert.equal(summary.length,1);
  assert.ok(summary.text().includes(translate(locale,key)),`summary must describe saved ${mode} mode`);
  assert.ok(!summary.text().includes('Previous proxy'),'retained profileId must not name the current route');
  config.selection={mode:'profile',profileId:'profile-a'};
  assert.ok(render(locale,runtime,{config,route:'#/profiles'})('.managementRouteSummary').text().includes('Previous proxy'));
 }
});

test('PC backup preview parses real input without importing; edits and invalid data invalidate the preview',()=>{
 const config=domain.freshConfig(),before=JSON.stringify(config),incoming=profilesConfig();
 incoming.rules=[{id:'rule-a',domain:'example.com',includeSubdomains:true,priority:10,enabled:true,action:'direct'}];
 const actions=[],buttons=[],elements=[],hookState=[],errors=[],visited=[];
 const rerender=()=>{
  buttons.length=0;elements.length=0;
  return render('en',stoppedRuntime(config),{config,route:'#/backup',actions,buttons,elements,hookState,
   onNavigate:route=>visited.push(route),onErrorKey:key=>errors.push(key)});
 };
 let $=rerender();
 assert.equal(buttons.find(button=>button.children===translate('en','pcParsePreview')).disabled,true);
 assert.equal(buttons.find(button=>button.children===translate('en','validateAndImportStopManagingFirst')),undefined);
 const text=JSON.stringify(incoming);
 elements.find(element=>element.id==='import-data').onChange({target:{value:text}});$=rerender();
 const preview=buttons.find(button=>button.children===translate('en','pcParsePreview'));
 assert.equal(preview.disabled,false);preview.onClick();$=rerender();
 assert.equal($('.backupImport [role="status"]').text(),translate('en','pcBackupPreview',{version:2,proxies:1,rules:1}));
 assert.ok(buttons.find(button=>button.children===translate('en','validateAndImportStopManagingFirst')));
 assert.equal($('#import-data').val(),text);
 assert.equal(JSON.stringify(config),before);assert.deepEqual(actions,[]);assert.deepEqual(visited,[]);assert.deepEqual(errors,[]);
 elements.find(element=>element.id==='import-data').onChange({target:{value:'{"schemaVersion":2}'}});$=rerender();
 assert.equal($('.backupImport [role="status"]').length,0);
 assert.equal(buttons.find(button=>button.children===translate('en','validateAndImportStopManagingFirst')),undefined);
 buttons.find(button=>button.children===translate('en','pcParsePreview')).onClick();$=rerender();
 assert.deepEqual(errors,['backupInvalidFormat']);assert.equal($('.backupImport [role="status"]').length,0);
 assert.equal(buttons.find(button=>button.children===translate('en','validateAndImportStopManagingFirst')),undefined);
 assert.equal(JSON.stringify(config),before);assert.deepEqual(actions,[]);assert.deepEqual(visited,[]);
});
