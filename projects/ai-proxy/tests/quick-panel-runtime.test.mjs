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
function fixture({pendingChanges,activeMode='rules',desiredMode='direct',managedIntent=true,control='controlled_by_this_extension'}){
 const config={...domain.freshConfig(),managed:true,selection:{mode:desiredMode}};
 const state={config,runtime:{managedIntent,control,canStop:managedIntent,
  applied:true,pendingChanges,activeSelection:{mode:activeMode},browserMode:activeMode,proxyError:null}};
 const module={exports:{}};
 const values=[],calls=[];let cursor=0,tree;
 const hooks={...React,useState(value){const index=cursor++;if(!(index in values))values[index]=typeof value==='function'?value():value;
  return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;}];},useRef:value=>({current:value}),useEffect(){},useMemo:fn=>fn()};
 const ProxyEditor=()=>null;
 runInNewContext(code,{exports:module.exports,module,HTMLElement:class {},document:{activeElement:null},requestAnimationFrame:fn=>fn(),require(name){
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return jsxRuntime;
  if(name==='./ui/useProxy')return {useProxy:()=>({state,error:'',busy:false,act:async message=>{calls.push(message);},refresh(){calls.push({type:'GET_STATE'});},setError(){},setErrorKey(){}})};
  if(name==='./ui/ProxyEditor')return {ProxyEditor};
  if(name==='./domain/config')return domain;
  if(name==='./i18n/LocaleProvider')return {useI18n:()=>({t:key=>key})};
  if(name==='./environment')return {getEnvironment:()=>({})};
  if(name==='@opendesk/ui')return {Button:React.forwardRef(({children,variant,...props},ref)=>React.createElement('button',{...props,ref},children))};
  return new Proxy({},{get:()=>()=>null});
 }});
 function render(){cursor=0;tree=module.exports.default();return renderToStaticMarkup(tree);}
 function visit(predicate,node){if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node){const match=visit(predicate,child);if(match)return match;}return;}
  return predicate(node)?node:visit(predicate,node.props?.children);
 }
 render();return {render,find:predicate=>visit(predicate,tree),ProxyEditor,calls,state};
}
const render=options=>fixture(options).render();
test('pending direct selection keeps an explicit Apply entry and never claims Direct is already active',()=>{
 const html=render({pendingChanges:true});
 // Direct's explicit primary action was renamed to a more specific label.
 // The saved pending selection still requires the user to click Apply; STOP
 // remains a distinct action and the runtime continues to show the old route.
 assert.match(html,/data-testid="side-proxy-toggle"[^>]*title="apApplyDirect"/);
 assert.match(html,/sideDirectPendingHint/);
 assert.match(html,/data-testid="side-current-route"[^>]*>sideModeRules</);
 assert.match(html,/<dt>apBrowserSetting<\/dt><dd[^>]*>sideModeRules<\/dd>/);
 assert.doesNotMatch(html,/sideDirectAppliedHint/);
 assert.doesNotMatch(html,/sideDirectAppliedHint/);
});
test('confirmed unchanged Direct removes the pending Apply entry and shows its confirmed hint',()=>{
 const html=render({pendingChanges:false,activeMode:'direct'});
 assert.doesNotMatch(html,/r86ApplyPending/);assert.match(html,/sideDirectAppliedHint/);
});

test('sidebar proxy editor reports save without claiming selection or applying a route',()=>{
 const f=fixture({pendingChanges:false});
 f.find(n=>n.props?.['aria-label']==='sideAddProxyTitle').props.onClick();f.render();
 const editor=f.find(n=>n.type===f.ProxyEditor);assert.ok(editor);
 editor.props.onClose(true);
 const html=f.render();
 assert.match(html,/role="status">apProxySavedNotice</);
 assert.doesNotMatch(html,/sideProxySavedNotApplied/);
 assert.equal(f.state.config.selection.mode,'direct');
 assert.deepEqual(f.calls,[],'closing the saved editor never selects or applies');
});

test('sidebar proxy editor cancellation returns without a save receipt',()=>{
 const f=fixture({pendingChanges:false});
 f.find(n=>n.props?.['aria-label']==='sideAddProxyTitle').props.onClick();f.render();
 f.find(n=>n.type===f.ProxyEditor).props.onClose(false);
 assert.doesNotMatch(f.render(),/apProxySavedNotice|sideProxySavedNotApplied/);
 assert.deepEqual(f.calls,[]);
});

test('confirmed following-system state offers a read and does not claim the selection still needs enabling',()=>{
 const f=fixture({pendingChanges:false,activeMode:'system',desiredMode:'system',managedIntent:false,control:'controllable_by_this_extension'});
 const html=f.render();
 assert.match(html,/data-testid="side-proxy-toggle"[^>]*title="apRefreshStatus"/);
 assert.doesNotMatch(html,/apPendingSelection/);
 f.find(n=>n.props?.['data-testid']==='side-proxy-toggle').props.onClick();
 assert.deepEqual(f.calls,[{type:'GET_STATE'}]);
 for(const changed of [{control:'unknown'},{outcomeUnknown:true},{statusErrorCode:'E_TIMEOUT'},{permission:false},{canStop:true},{pendingChanges:true}]){
  const other=fixture({pendingChanges:false,activeMode:'system',desiredMode:'system',managedIntent:false,control:'controllable_by_this_extension'});
  Object.assign(other.state.runtime,changed);
  assert.match(other.render(),/apPendingSelection/,'unverified system state keeps pending feedback');
 }
});
