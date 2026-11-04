// Mount the production App Shell and shared Workflow composer in a live React
// DOM. SSR alone cannot materialize the split-target conversation portals.
// Service responses remain fixtures; never call this a Chrome/Native E2E.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {build,stop} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
let compilation;
// Compile only in memory, preserving production ?raw CSS strings and sharing
// React/ReactDOM with the mounted test renderer. No listener or output writer.
function loadSidebarReact(){
  return compilation??=(async()=>{
    let result;
    try{
      result=await build({stdin:{resolveDir:process.cwd(),contents:`
        export {SidebarAppShell} from './src/ui/react/app-shell.tsx';
        export {createDeveloperView} from './src/ui/develop-view.js';
        export {createMyWorkbenchView} from './src/ui/my-workbench-view.js';
        export {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
        export {TrustedConversationWorkspace} from './src/ui/react/components/conversation.tsx';
      `},bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',
      plugins:[{name:'mounted-production-imports',setup(builder){
        builder.onResolve({filter:/^react(?:-dom)?(?:$|\/)/},({path})=>({
          path:pathToFileURL(require.resolve(path)).href,external:true}));
        builder.onLoad({filter:/\.css$/},async({path})=>({
          contents:'export default '+JSON.stringify(await readFile(path,'utf8')),
          loader:'js'}));
      }}]});
    }finally{stop();}
    return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  })();
}
import {workflowFixture,tick} from './workflow-react-fixture.mjs';

export async function mountWorkflowClient({steps=[],activeTab='workflow',...options}={}){
  const f=await workflowFixture({steps,...options});
  const {SidebarAppShell,createDeveloperView,createMyWorkbenchView,
    createSidebarToolsView,TrustedConversationWorkspace}=await loadSidebarReact();
  const {window,document}=parseHTML('<html><body><div id="opendesk-react-app"></div></body></html>');
  const previous=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>
    [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window,document,IS_REACT_ACT_ENVIRONMENT:true}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  Object.defineProperty(document,'activeElement',{value:document.body,writable:true,configurable:true});
  const proto=window.HTMLElement.prototype;
  proto.focus=function(){if(this.isConnected&&!this.disabled)document.activeElement=this;};
  proto.getClientRects=function(){return this.isConnected&&!this.closest('[hidden],[inert]')?[{width:1,height:1}]:[];};
  Object.defineProperty(proto,'inert',{configurable:true,
    get(){return this.hasAttribute('inert');},
    set(value){this.toggleAttribute('inert',Boolean(value));}});
  const keys=new Set();
  const add=document.addEventListener.bind(document);
  const remove=document.removeEventListener.bind(document);
  document.addEventListener=(type,listener,...rest)=>{
    if(type==='keydown')keys.add(listener);
    return add(type,listener,...rest);
  };
  document.removeEventListener=(type,listener,...rest)=>{
    if(type==='keydown')keys.delete(listener);
    return remove(type,listener,...rest);
  };
  let subscriptions=0,unmounted=false;
  const controller={...f.view,subscribe(listener){
    subscriptions++;
    const off=f.view.subscribe(listener);
    return ()=>{subscriptions--;off();};
  }};
  let snapshot=Object.freeze({source:'local_codex',endpoint:'',model:'',hasApiKey:false,generation:0});
  const listeners=new Set();
  const providerSettings={
    settingsSnapshot:()=>snapshot,
    subscribeSettings:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
    updateSettings:patch=>{
      snapshot=Object.freeze({...snapshot,...patch,generation:snapshot.generation+1});
      for(const listener of listeners)listener();
    }
  };
  const views=[createDeveloperView(),createMyWorkbenchView(),createSidebarToolsView()];
  const root=createRoot(document.getElementById('opendesk-react-app'));
  function App(){
    const [settingsOpen,setSettingsOpen]=React.useState(false);
    return React.createElement(SidebarAppShell,{
      activeTab,workflowController:controller,providerSettings,
      providerSettingsOpen:settingsOpen,
      onOpenProviderSettings:()=>setSettingsOpen(true),
      onCloseProviderSettings:()=>setSettingsOpen(false),
      onOpenNativeSettings:()=>{},
      developerView:views[0],myView:views[1],toolView:views[2]
    });
  }
  const dispatch=async(node,type='click',fields={},trusted=true)=>{
    if(!node)throw new Error('Mounted Workflow control not found');
    const event=new window.Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(event,'isTrusted',{configurable:true,value:trusted});
    for(const [key,value] of Object.entries(fields))
      Object.defineProperty(event,key,{configurable:true,value});
    await React.act(async()=>{node.dispatchEvent(event);await tick();});
    return event;
  };
  const click=(id,trusted=true)=>dispatch(document.getElementById(id),'click',{},trusted);
  const clickNode=(node,trusted=true)=>dispatch(node,'click',{},trusted);
  const keydown=(key,shiftKey=false)=>dispatch(document,'keydown',{key,shiftKey},true);
  const openSettings=async()=>{
    await click('workflow-provider-toggle');
    const advanced=document.querySelector('#workflow-source-menu [role="menuitem"]');
    if(!advanced)throw new Error('Shared source menu has no advanced settings action');
    await clickNode(advanced);
  };
  const close=async()=>{
    if(unmounted)return;
    unmounted=true;
    try{
      await React.act(async()=>{root.unmount();await tick();});
    }finally{
      f.view.dispose();
      for(const view of views)view.dispose?.();
      for(const [key,value] of previous){
        if(value)Object.defineProperty(globalThis,key,value);
        else delete globalThis[key];
      }
    }
  };
  await React.act(async()=>{root.render(React.createElement(App));await tick();});
  await tick();
  return {document,window,source:f,controller,providerSettings,keys,TrustedConversationWorkspace,
    subscriptions:()=>subscriptions,html:()=>document.toString(),
    toolView:views[2],click,clickNode,keydown,openSettings,close};
}
