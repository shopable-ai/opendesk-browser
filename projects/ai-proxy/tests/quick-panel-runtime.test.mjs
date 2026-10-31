import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build,transform} from 'esbuild';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {runInNewContext} from 'node:vm';
const domainBuild=await build({entryPoints:[new URL('../src/domain/config.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import(`data:text/javascript;base64,${Buffer.from(domainBuild.outputFiles[0].text).toString('base64')}`);
const {code}=await transform(await readFile(new URL('../src/QuickPanel.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
function render({pendingChanges,activeMode='rules',desiredMode='direct'}){
 const config={...domain.freshConfig(),managed:true,selection:{mode:desiredMode}};
 const state={config,runtime:{managedIntent:true,control:'controlled_by_this_extension',canStop:true,
  applied:true,pendingChanges,activeSelection:{mode:activeMode},browserMode:activeMode,proxyError:null}};
 const module={exports:{}};
 const hooks={...React,useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect(){},useMemo:fn=>fn()};
 runInNewContext(code,{exports:module.exports,module,require(name){
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return jsxRuntime;
  if(name==='./ui/useProxy')return {useProxy:()=>({state,error:'',busy:false,act:async()=>{},refresh(){},setError(){},setErrorKey(){}})};
  if(name==='./domain/config')return domain;
  if(name==='./i18n/LocaleProvider')return {useI18n:()=>({t:key=>key})};
  if(name==='./environment')return {getEnvironment:()=>({})};
  if(name==='@opendesk/ui')return {Button:React.forwardRef(({children,variant,...props},ref)=>React.createElement('button',{...props,ref},children))};
  return new Proxy({},{get:()=>()=>null});
 }});
 return renderToStaticMarkup(React.createElement(module.exports.default));
}
test('pending direct selection keeps an explicit Apply entry and never claims Direct is already active',()=>{
 const html=render({pendingChanges:true});
 assert.match(html,/applySelection/);assert.match(html,/sideDirectPendingHint/);
 assert.doesNotMatch(html,/sideDirectAppliedHint/);
});
test('confirmed unchanged Direct removes the pending Apply entry and shows its confirmed hint',()=>{
 const html=render({pendingChanges:false,activeMode:'direct'});
 assert.doesNotMatch(html,/r86ApplyPending/);assert.match(html,/sideDirectAppliedHint/);
});
