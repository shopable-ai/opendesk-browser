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
const statusBundle=await build({
 entryPoints:[new URL('../src/ui/Status.tsx',import.meta.url).pathname],bundle:true,write:false,
 platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','../i18n/LocaleProvider']
});
const i18n={useI18n:()=>({t:(key,params)=>params?.route ? key+':'+params.route : key})};
const ui={Button:React.forwardRef(({children,variant,...props},ref)=>React.createElement('button',{...props,ref},children))};
const {code:syncCode}=await transform(await readFile(new URL('../src/ui/ConnectionSync.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
const syncModule={exports:{}};
runInNewContext(syncCode,{module:syncModule,exports:syncModule.exports,require:name=>({
 'react/jsx-runtime':jsxRuntime,'@opendesk/ui':ui,'../i18n/LocaleProvider':i18n
})[name]});
const statusModule={exports:{}};
runInNewContext(statusBundle.outputFiles[0].text,{module:statusModule,exports:statusModule.exports,require(name){
 if(name==='react')return React;
 if(name==='react/jsx-runtime')return jsxRuntime;
 if(name==='../i18n/LocaleProvider')return i18n;
 throw Error(name);
}});
function fixture({pendingChanges,activeMode='rules',desiredMode='direct',managedIntent=true,control='controlled_by_this_extension',savedProxy=false,profileId,activeProfileId,profiles=[]}){
 const config={...domain.freshConfig(),managed:managedIntent,profiles,selection:{mode:desiredMode,profileId}};
 const state={config,configEtag:'etag-current',runtime:{desired:config.selection,managedIntent,control,canStop:managedIntent,
  applied:managedIntent,pendingChanges,activeSelection:managedIntent?{mode:activeMode,profileId:activeProfileId}:undefined,browserMode:activeMode,proxyError:null}};
 const event={detail:0,currentTarget:{}};
 const module={exports:{}};
 const values=[],calls=[];let cursor=0,tree;
 const hooks={...React,useState(value){const index=cursor++;if(!(index in values))values[index]=typeof value==='function'?value():value;
  return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;}];},useRef:value=>({current:value}),useEffect(){},useMemo:fn=>fn()};
 const ProxyEditor=()=>null;
 runInNewContext(code,{exports:module.exports,module,HTMLElement:class {},document:{activeElement:null},requestAnimationFrame:fn=>fn(),require(name){
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return jsxRuntime;
  if(name==='./ui/PcPreferences')return {useStatusDisplay:()=>({show:true})};
  if(name==='./ui/useProxy')return {useProxy:()=>({state,error:'',busy:false,operationBusy:false,syncing:false,slowSync:false,act:async message=>{calls.push(message);},refresh(){calls.push({type:'GET_STATE'});},setError(){},setErrorKey(){}})};
  if(name==='./ui/ProxyEditor')return {ProxyEditor};
  if(name==='./domain/config')return domain;
  if(name==='./i18n/LocaleProvider')return i18n;
  if(name==='./ui/Status')return statusModule.exports;
  if(name==='./environment')return {getEnvironment:()=>({})};
  if(name==='@opendesk/ui')return ui;
  if(name==='./ui/ConnectionSync')return syncModule.exports;
  return new Proxy({},{get:()=>()=>null});
 }});
 function render(){cursor=0;tree=module.exports.default({savedProxy});return renderToStaticMarkup(tree);}
 function visit(predicate,node){if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node){const match=visit(predicate,child);if(match)return match;}return;}
  return predicate(node)?node:visit(predicate,node.props?.children);
 }
 render();return {render,find:predicate=>visit(predicate,tree),ProxyEditor,calls,state,event};
}
const render=options=>fixture(options).render();
test('Direct only preselects; applying the saved mode uses the rendered ETag',async()=>{
 const f=fixture({pendingChanges:true}),html=f.render();
 assert.match(html,/data-testid="side-proxy-toggle"[^>]*>connectionApplyChanges</);
 assert.match(html,/apDirectScope/);
 assert.match(html,/stopManagingProxy/);
 assert.match(html,/data-testid="side-current-route"[^>]*>sideModeRules</);
 assert.match(html,/<dt>apBrowserSetting<\/dt><dd[^>]*>sideModeRules</);
 assert.equal((html.match(/connectionPendingRoute:sideModeDirect/g)??[]).length,1);
 assert.doesNotMatch(html,/sideDirectAppliedHint|r86StatusDetails|connectionEndDirect/);
 assert.deepEqual(f.calls,[]);
 await f.find(n=>n.props?.['data-testid']==='side-proxy-toggle').props.onClick(f.event);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{type:'SWITCH_ROUTE',ifMatch:'etag-current',selection:{mode:'direct'},approvedPac:false}]);
 const other=fixture({pendingChanges:false,desiredMode:'rules'});
 await other.find(n=>n.props?.['aria-label']==='sideModeDirect').props.onClick(other.event);
 assert.deepEqual(JSON.parse(JSON.stringify(other.calls)),[{type:'SELECT',ifMatch:'etag-current',selection:{mode:'direct'}}]);
});
test('confirmed Direct offers only End direct connection and issues one explicit STOP',async()=>{
 const f=fixture({pendingChanges:false,activeMode:'direct'}),html=f.render();
 assert.match(html,/data-testid="side-proxy-toggle"[^>]*>connectionEndDirect</);
 assert.match(html,/sideDirectAppliedHint/);
 assert.doesNotMatch(html,/applySelection|connectionPendingRoute/);
 await f.find(n=>n.props?.['data-testid']==='side-proxy-toggle').props.onClick(f.event);
 assert.deepEqual(f.calls.map(x=>x.type),['STOP']);
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

test('confirmed following-system shows only status; uncertain state has a read-only retry',async()=>{
 const options={pendingChanges:false,activeMode:'system',desiredMode:'system',managedIntent:false,control:'controllable_by_this_extension'};
 const f=fixture(options),html=f.render();
 assert.match(html,/apFollowingSystem/);
 assert.doesNotMatch(html,/side-proxy-toggle|connectionPendingRoute|side-current-route/);
 assert.deepEqual(f.calls,[]);
 for (const changed of [{control:'unknown'},{outcomeUnknown:true},{statusErrorCode:'E_TIMEOUT'},{permission:false}]){
  const other=fixture(options);
  Object.assign(other.state.runtime,changed);
  assert.match(other.render(),/data-testid="side-proxy-toggle"[^>]*>refreshStatus</);
  await other.find(n=>n.props?.['data-testid']==='side-proxy-toggle').props.onClick(other.event);
  assert.deepEqual(other.calls.map(x=>x.type),['GET_STATE']);
 }
});

test('Header saved receipt remains visible after mounting the quick panel without proxy effects',()=>{
 const f=fixture({pendingChanges:false,savedProxy:true});
 assert.match(f.render(),/role="status">apProxySavedNotice</);
 assert.deepEqual(f.calls,[]);
});

const profileA={id:'a',name:'Proxy A',kind:'endpoint',endpointId:'endpoint-a'};
const profileB={id:'b',name:'Proxy B',kind:'endpoint',endpointId:'endpoint-b'};
const stopped={activeMode:'system',managedIntent:false,control:'controllable_by_this_extension',profiles:[profileA,profileB]};

test('R18 shows four modes; selecting a paused proxy does not request native routing',async()=>{
 const f=fixture({...stopped,desiredMode:'system',pendingChanges:false}),html=f.render();
 assert.deepEqual([...html.matchAll(/class="modeButton [^"]*"[^>]*aria-label="([^"]+)/g)].map(m=>m[1]),
  ['sideModeProfile','sideModeRules','sideModeDirect','popupModeSystem']);
 await f.find(n=>n.props?.id==='quick-use-b').props.onClick(f.event);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{type:'SELECT',selection:{mode:'profile',profileId:'b'},ifMatch:'etag-current'}]);
 assert.doesNotMatch(f.render(),/connectionApplied|sideUsing/);
 const chosen=fixture({...stopped,desiredMode:'profile',profileId:'b',pendingChanges:true});
 assert.match(chosen.render(),/sideSelectedInactive:Proxy B/);
 assert.match(chosen.render(),/data-testid="side-proxy-toggle"[^>]*>connectionEnable</);
 await chosen.find(n=>n.props?.['data-testid']==='side-proxy-toggle').props.onClick(chosen.event);
 assert.deepEqual(JSON.parse(JSON.stringify(chosen.calls)),[{type:'SWITCH_ROUTE',selection:{mode:'profile',profileId:'b'},ifMatch:'etag-current',approvedPac:false}]);
});

test('R18 switches a running proxy through the protected route action and pauses explicitly',async()=>{
 const f=fixture({profiles:[profileA,profileB],desiredMode:'profile',profileId:'a',activeMode:'profile',activeProfileId:'a',pendingChanges:false});
 assert.match(f.render(),/data-testid="side-current-route"[^>]*>Proxy A</);
 assert.match(f.render(),/data-testid="side-proxy-toggle"[^>]*>connectionPause</);
 await f.find(n=>n.props?.id==='quick-use-b').props.onClick(f.event);
 await f.find(n=>n.props?.['data-testid']==='side-proxy-toggle').props.onClick(f.event);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[
  {type:'SWITCH_ROUTE',selection:{mode:'profile',profileId:'b'},ifMatch:'etag-current',approvedPac:false},{type:'STOP'}]);
});
