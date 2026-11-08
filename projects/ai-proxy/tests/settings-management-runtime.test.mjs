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
const {translate}=await bundle('../src/i18n/locale.ts');
const settingsCode=(await transform(await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const statusCode=(await transform(await readFile(new URL('../src/ui/Status.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
function render(locale,runtime){
 const config={...domain.freshConfig(),selection:{mode:'direct'}};
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
  if(name==='./domain/config')return domain;if(name==='./ui/optionsRoute')return routes;
  if(name==='./ui/Status')return statusModule.exports;
  if(name==='./environment')return {getEnvironment:()=>({navigation:{getRoute:()=>'#/rules'},isDraftDirty:()=>false})};
  if(name==='./ui/useProxy')return {useProxy:()=>({state:{config,runtime},busy:false,error:'',act:()=>assert.fail('render mutated proxy state')})};
  if(name==='@opendesk/ui')return {Button:({children,variant,...props})=>React.createElement('button',props,children)};
  return new Proxy({},{get:()=>()=>null});
 }});
 return load(renderToStaticMarkup(React.createElement(module.exports.default,{presentation:'management'})));
}

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
