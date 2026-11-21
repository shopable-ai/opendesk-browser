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
const syncCode=(await transform(await readFile(new URL('../src/ui/ConnectionSync.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const shellCode=(await transform(await readFile(new URL('../src/ui/OptionsShell.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const profileFavorites={ids:[],ready:true,busy:false,error:false,toggle:()=>{}};
function render(locale,runtime,{config={...domain.freshConfig(),selection:{mode:'direct'}},route='#/rules',stateOverride,presentation='management',onNavigate=()=>{},buttons=[],elements=[],confirm,hookState=[],actions,onError=()=>{},onErrorKey=()=>{}}={}){
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
 const ui={Button:({children,variant,...props})=>{buttons.push({children,...props});return React.createElement('button',props,children);}};
 const syncModule={exports:{}};
 runInNewContext(syncCode,{module:syncModule,exports:syncModule.exports,require:name=>({
  'react/jsx-runtime':jsx,'@opendesk/ui':ui,'../i18n/LocaleProvider':i18n
 })[name]});
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
 runInNewContext(settingsCode,{module,exports:module.exports,AbortController,document:{activeElement:null},require(name){
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return settingsJsx;
  if(name==='./i18n/LocaleProvider')return i18n;
  if(name==='./domain/header-actions')return headerActions;
  if(name==='./domain/config')return domain;if(name==='./ui/optionsRoute')return routes;
  if(name==='./ui/backupImport')return backupValidation;
  if(name==='./ui/OptionsShell')return shellModule.exports;
  if(name==='./ui/Status')return statusModule.exports;
  if(name==='./ui/ProfileFavorites')return {useProfileFavorites:()=>profileFavorites};
  if(name==='./environment')return {getEnvironment:()=>({navigation:{getRoute:()=>route},navigate:onNavigate,isDraftDirty:()=>false,
   confirm:confirm??(()=>assert.fail('preview or selection requested confirmation'))})};
  if(name==='./ui/useProxy')return {useProxy:()=>({state:stateOverride===undefined?{config,runtime,configEtag:'etag-current'}:stateOverride,busy:false,operationBusy:false,syncing:false,slowSync:false,error:'',setError:onError,setErrorKey:onErrorKey,
   act:message=>{assert.ok(actions,'render mutated proxy state');actions.push(message);return Promise.resolve(null);}})};
  if(name==='@opendesk/ui')return ui;
  if(name==='./ui/ConnectionSync')return syncModule.exports;
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
  assert.equal($('.rulesModeHint').length,1);
  assert.equal($('.rulesDefault > h2').text(),translate(locale,'pcDefaultRouteTitle'));
  assert.equal($('.rulesDefault > .hint').text(),translate(locale,'pcDefaultRouteHelp'));
  assert.equal($('.rulesDefault > .hint').attr('title'),translate(locale,'apDefaultRouteHelp'));
  assert.equal($('#default-route').attr('aria-labelledby'),$('.rulesDefault > h2').attr('id'));
 }
});

test('management summary shows confirmed mode and separately labels pending edits',()=>{
 const base={desired:{mode:'direct'},managedIntent:true,control:'controlled_by_this_extension',applied:true,
  pendingChanges:true,activeSelection:{mode:'rules'},browserMode:'rules',proxyError:null};
 for(const locale of ['zh-CN','zh-TW','en']){
  const bar=render(locale,base)('.managementConnectionBar');
  assert.ok(bar.text().includes(translate(locale,'sideCurrentRoute')));
  assert.ok(bar.text().includes(translate(locale,'connectionPendingRoute',{route:translate(locale,'popupModeDirect')})));
  const idle=render(locale,{...base,managedIntent:false,applied:false,control:'controllable_by_this_extension',
   browserMode:'system',activeSelection:null})('.managementConnectionBar');
  assert.equal(idle.find('.managementSelectionLabel').length,0);
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
 assert.equal(row.find('.proxySelect[aria-pressed="true"]').text(),translate('zh-CN','selected'));
 const active={...stopped,state:'enabled',control:'controlled_by_this_extension',canStop:true,
  managedIntent:true,applied:true,pendingChanges:false,activeSelection:{mode:'profile',profileId:profile.id},browserMode:'fixed_servers'};
 const $active=render('zh-CN',active,{config,route:'#/profiles'});
 assert.equal($active('.profileRecords .proxySelect[aria-pressed="true"]').text(),'使用中');
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

test('both settings presentations preselect a named proxy and show an explicit enable action',async()=>{
 for(const presentation of ['management','sidebar']){
  const config=profilesConfig(),buttons=[],actions=[];config.selection={mode:'system'};
  const $=render('en',stoppedRuntime(config),{config,route:'#/profiles',presentation,buttons,actions});
  assert.equal($('.optionsModeGrid button').length,4);
  assert.equal($('#options-profile').length,0);
  const select=buttons.find(b=>b['aria-label']==='Select Previous proxy');
  assert.equal(select.disabled,false);
  await select.onClick({detail:0,currentTarget:{}});
  assert.deepEqual(JSON.parse(JSON.stringify(actions)),[
   {type:'SELECT',ifMatch:'etag-current',selection:{mode:'profile',profileId:'profile-a'}}
  ]);
  const selected=profilesConfig(),controls=[];
  render('en',stoppedRuntime(selected),{config:selected,route:'#/profiles',presentation,buttons:controls,actions});
  await controls.find(b=>b.children==='Enable').onClick({detail:0,currentTarget:{}});
  assert.deepEqual(JSON.parse(JSON.stringify(actions[1])),
   {type:'SWITCH_ROUTE',ifMatch:'etag-current',selection:{mode:'profile',profileId:'profile-a'},approvedPac:false});
 }
});

test('local PAC still requires explicit confirmation when enabling the selected PAC',async()=>{
 const config=profilesConfig(),actions=[],buttons=[];
 config.selection={mode:'profile',profileId:'pac-a'};
 let asked=0;
 render('en',stoppedRuntime(config),{config,route:'#/profiles',actions,buttons,confirm:async()=>{asked++;return false;}});
 await buttons.find(b=>b.children==='Enable').onClick({detail:0,currentTarget:{}});
 assert.equal(asked,1);
 assert.deepEqual(actions,[]);
});

test('PC subscriptions page header import opens the new-subscription route without a configuration action',()=>{
 for(const locale of ['zh-CN','zh-TW','en']){
  const config=domain.freshConfig(),actions=[],buttons=[],visited=[];
  const $=render(locale,stoppedRuntime(config),{config,route:'#/subscriptions',actions,buttons,onNavigate:route=>visited.push(route)});
  const label=translate(locale,'pcAddSubscription');
  assert.equal($('.optionsPageHead .panelHeadActions button').filter((_,node)=>$(node).text()===label).length,1);
  const imports=buttons.filter(button=>Array.isArray(button.children)&&button.children.includes(label));
  assert.equal(imports.length,1);assert.equal(imports[0].disabled,false);
  assert.deepEqual(visited,[]);assert.equal(actions.length,0);
  imports[0].onClick();assert.deepEqual(visited,['#/subscriptions/new']);assert.equal(actions.length,0);
 }
});

test('PC mode summary identifies Chrome system status while a different saved selection is idle',()=>{
 for(const locale of ['zh-CN','zh-TW','en'])for(const mode of ['direct','rules','profile']){
  const config=profilesConfig();config.selection={mode,profileId:'profile-a'};
  const runtime={...stoppedRuntime(config),activeSelection:{mode:'profile',profileId:'profile-a'}};
  const $=render(locale,runtime,{config,route:'#/profiles'}),summary=$('.connectionControls');
  assert.ok(summary.text().includes(translate(locale,'popupModeSystem')));
  assert.equal(summary.find('[data-testid=side-current-route]').text(),translate(locale,'popupModeSystem'));
  assert.ok(summary.text().includes(translate(locale,'connectionEnable')));
 }
});

test('both settings presentations keep active-route controls and avoid a duplicate proxy picker',()=>{
 const config=profilesConfig();
 const appliedRules={...stoppedRuntime(config),state:'enabled',managedIntent:true,
  control:'controlled_by_this_extension',applied:true,canStop:true,activeSelection:{mode:'rules'},browserMode:'rules'};
 for(const presentation of ['management','sidebar']){
  const card=(runtime,selection)=>{
   const $=render('zh-CN',{...runtime,desired:selection},{config:{...config,selection},route:'#/profiles',presentation});
   return $('.connectionControls');
  };
  const pending=card(appliedRules,{mode:'profile',profileId:'profile-a'});
  assert.equal(pending.find('button').length,2);
  assert.ok(pending.find('button').text().includes(translate('zh-CN','connectionApplyChanges')));
  assert.ok(pending.find('button').text().includes(translate('zh-CN','stopManagingProxy')));
  assert.match(pending.text(),/当前线路：按规则/);
  assert.match(pending.text(),/待应用：Previous proxy/);
  assert.doesNotMatch(pending.text(),/技术详情|暂停/);
  const system=card({...stoppedRuntime(config),pendingChanges:false},{mode:'system'});
  assert.equal(system.find('button').length,0);
  assert.equal(system.text(),'正在跟随系统');
  const choosing=card(stoppedRuntime(config),{mode:'profile'});
  assert.equal(choosing.find('button').text(),translate('zh-CN','sideProxyChooseAction'));
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
