import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {flushSync} from 'react-dom';

// Compile the actual components in memory; no product build or browser.
const compile=async(path,replacements={})=>{
  const result=await transform(await readFile(new URL(path,import.meta.url),'utf8'),
    {loader:'tsx',format:'esm',jsx:'transform'});
  let code=result.code;
  for(const [from,to] of Object.entries(replacements))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
};
const button=await compile('../../src/ui/react/components/ui/button.tsx',{'react':import.meta.resolve('react')});
const toggle=await compile('../../src/ui/react/components/ui/switch.tsx',{
  'react':import.meta.resolve('react'),
  'react-aria-components':import.meta.resolve('react-aria-components')
});
export const {ExtensionCenterPage,UninstallDialog}=await import(await compile('../../src/ui/react/tabs/tools.tsx',{
  'react':import.meta.resolve('react'),'react-dom':import.meta.resolve('react-dom'),
  '../components/ui/button.tsx':button,
  '../components/ui/switch.tsx':toggle,
  '../../locale-manager-localization.js':new URL('../../src/ui/locale-manager-localization.js',import.meta.url).href
}));
const initial=parseHTML('<html><body></body></html>');
const original={window:globalThis.window,document:globalThis.document};
// React Aria checks actual DOM constructors, including during effect cleanup.
// Keep the matching linkedom constructors available between synchronous tests.
const activateDOM=window=>{
  globalThis.window=window;globalThis.document=window.document;
  for(const key of ['Node','Element','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLTextAreaElement',
    'SVGElement','Event','MutationObserver'])if(window[key])globalThis[key]=window[key];
};
activateDOM(initial.window);
globalThis.window=initial.window;globalThis.document=initial.document;
// React's input-event capability detection runs once, at module initialization.
initial.document.oninput=null;
const {createRoot}=await import('react-dom/client');
// React may flush scheduler work after a test's synchronous cleanup. Keep its
// window fallback alive while leaving document absent for server-render tests.
globalThis.window=original.window||initial.window;globalThis.document=original.document;

export function createExtensionCenterDOM(t,{component=ExtensionCenterPage,props={}}={}){
  const {window,document:doc}=parseHTML('<html><body><main id="workspace-content"><div id="opendesk-react-app"></div></main><input id="sidebar-tool-file"></body></html>');
  const activate=()=>activateDOM(window);
  activate();doc.activeElement=doc.body;
  window.innerWidth=360;window.innerHeight=640;
  // linkedom supplies DOM/events, not browser layout or native focus/inert.
  window.HTMLElement.prototype.focus=function(){
    if(this.disabled||this.closest('[hidden]')||this.closest('[inert]'))return;
    this.ownerDocument.activeElement=this;
    this.dispatchEvent(new window.Event('focusin',{bubbles:true}));
  };
  window.HTMLElement.prototype.getClientRects=function(){return this.isConnected&&!this.closest('[hidden]')?[{}]:[];};
  window.HTMLElement.prototype.getBoundingClientRect=()=>({left:214,right:246,top:488,bottom:524,width:32,height:36});
  Object.defineProperties(window.HTMLElement.prototype,{
    offsetWidth:{configurable:true,get(){return this.getAttribute('role')==='menu'?192:34;}},
    offsetHeight:{configurable:true,get(){return this.getAttribute('role')==='menu'?Math.max(40,this.children.length*38+10):35;}},
    inert:{configurable:true,get(){return this.hasAttribute('inert');},set(value){this.toggleAttribute('inert',Boolean(value));}}
  });
  window.HTMLElement.prototype.scrollTo=function({top}){this.scrollTop=top;};
  const dispatch=function(type,extra={}){
    activate();
    const event=new window.Event(type,{bubbles:true,cancelable:true});
    Object.assign(event,{isTrusted:true,key:'',...extra});
    const target=extra.target||this;
    // Synthetic trusted values exercise controller guards only. They do not
    // establish native Chrome gestures or browser inert/focus behavior.
    if(type==='click'&&target.disabled)return event;
    if(type==='input')target._valueTracker?.setValue('\0');
    flushSync(()=>target.dispatchEvent(event));
    if(event.defaultPrevented)event.prevented=true;
    return event;
  };
  window.HTMLElement.prototype.dispatch=dispatch;doc.dispatch=dispatch;
  const root=createRoot(doc.getElementById('opendesk-react-app'));
  const state={rowsModel:{rows:[]},...props};
  let disposed=false;
  const paint=()=>{if(disposed)return;activate();flushSync(()=>root.render(React.createElement(component,state)));};
  paint();
  const list=doc.getElementById('extension-center-list');
  if(list)list.dataset.opendeskReactOwner='extension-list';
  const adapter={owner:'extension-list'};
  for(const [method,key] of Object.entries({renderRows:'rowsModel',renderToolbar:'toolbarModel',
    renderDetail:'detailModel',renderUninstall:'uninstallModel',renderRecoveries:'recoveryModel',
    renderFeedback:'feedbackModel',renderStatus:'statusModel',renderView:'view',connectBack:'onBack',setMenuKey:'menuKey'}))
    adapter[method]=value=>{state[key]=value;paint();};
  adapter.renderRowMenu=(items,options)=>{state.rowMenuModel=items.length?{...options,items}:null;paint();};
  t.after(()=>{activate();disposed=true;flushSync(()=>root.unmount());
    globalThis.window=original.window||initial.window;globalThis.document=original.document;});
  return {doc,window,adapter,state,paint};
}
