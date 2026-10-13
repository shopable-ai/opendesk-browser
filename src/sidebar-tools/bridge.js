// Runs only as an opaque-origin Chrome MV3 sandbox document, never in the privileged Side Panel.
import {SIDEBAR_TOOL_PROTOCOL} from '../ui/sidebar-tools/package.js';
import {createBrowserSdk} from '../framework/sdk/browser.js';
// The sandbox waits for a separate real Side Panel click; ordinary tool RPCs
// remain 8 seconds. This duration is UX only, never an authorization or grant.
const TOOL_CONSENT_OPS=new Set(['browser.tabs.create','browser.tabs.activateOwned','browser.tabs.removeOwned',
 'browser.network.request','browser.sidePanel.openSelf',
 'browser.network.observe.start','browser.network.observe.export',
 'browser.screenshot.captureVisible']);
export function sidebarToolRequestTimeout(operation,toolId){
 return (toolId==='stay-focus'&&operation.startsWith('focus.')&&operation!=='focus.status')||
   (toolId==='time-review'&&['time.start','time.clear'].includes(operation))||
   TOOL_CONSENT_OPS.has(operation)?120000:8000;
}
export function initSidebarToolSandbox() {
  const root=document.getElementById('tool-root');
  const status=document.getElementById('tool-status');
  let instance=null, toolId=null, sequence=0, scriptUrl=null;
  const waiting=new Map();
  let resizePending=false,lastHeight=0;
  const sendSize=()=>{
    if(!instance)return;
    const bounds=root.getBoundingClientRect();
    // Do not measure documentElement.scrollHeight: viewport height prevents shrinking.
    const height=Math.max(80,Math.min(4000,Math.ceil(Math.max(bounds.bottom,bounds.top+root.scrollHeight)+8)));
    if(height===lastHeight)return;
    lastHeight=height;
    parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'resize',instance,toolId,height},'*');
  };
  const scheduleSize=()=>{
    if(!instance||resizePending)return;
    resizePending=true;
    requestAnimationFrame(()=>{resizePending=false;sendSize();});
  };
  if(typeof ResizeObserver==='function')new ResizeObserver(scheduleSize).observe(root);
  window.addEventListener('resize',scheduleSize);
  const report=(state,message)=>{
    status.textContent=message || '';
    status.dataset.state=state;
    status.hidden=state==='ready';
    scheduleSize();
    parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'status',instance,toolId,state,message:String(message||'').slice(0,300)},'*');
  };
  // Sandboxed user tools must not open synchronous browser dialogs.
  // They cannot inherit popup/approval rights from the trusted host. Missing
  // approval fails closed; tools should provide their own inline controls.
  for(const [method,fallback] of [['alert',undefined],['confirm',false],['prompt',null],
    ['open',null],['print',undefined]]){
    const blocked=()=>{
      if(instance)report('error','此工具的浏览器弹窗已被阻止，请使用工具页面内的操作控件。');
      return fallback;
    };
    try{Object.defineProperty(window,method,{value:blocked,writable:false,configurable:false});}
    catch{try{window[method]=blocked;}catch{/* Browser-level controls still apply. */}}
  }
  const request=(operation,payload={})=>{
    if (!instance) return Promise.reject(new Error('工具界面尚未就绪'));
    const requestId=String(++sequence);
    return new Promise((resolve,reject)=>{
      // Time Review start/clear await a real trusted-host confirmation dialog.
      // Keep ordinary reads/writes short while allowing time to read that dialog.
      const timeoutMs=sidebarToolRequestTimeout(operation,toolId);
      const timeout=setTimeout(()=>{waiting.delete(requestId);reject(new Error('工具请求超时'));},timeoutMs);
      waiting.set(requestId,{resolve,reject,timeout});
      parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'request',instance,toolId,requestId,operation,payload},'*');
    });
  };
  // A real user input means refreshing this preview could discard unsaved work.
  // This is a UX signal only; no security decision relies on untrusted code.
  const sendDraft=()=>{
    if(!instance)return;
    let text='',truncated=false;
    for(const node of root.querySelectorAll?.('textarea,input:not([type="password"]),[contenteditable]:not([contenteditable="false"])')||[]){
      // Sensitive fields may hold session secrets. Never mirror their values
      // into host draft recovery, even for a manually installed untrusted tool.
      if(node.hasAttribute?.('data-sensitive')||node.closest?.('[data-sensitive]'))continue;
      const value=node.isContentEditable?node.textContent:node.value;
      if(typeof value!=='string'||!value)continue;
      const entry=(node.getAttribute?.('aria-label')||node.id||node.name||'编辑内容')+'\n'+value+'\n\n';
      text+=entry.slice(0,150000-text.length);
      if(text.length>=150000){truncated=true;break;}
    }
    parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'draft',instance,toolId,text,truncated},'*');
  };
  root.addEventListener('input',event=>{
    if(instance&&event.isTrusted){sendDraft();parent.postMessage({
      protocol:SIDEBAR_TOOL_PROTOCOL,kind:'dirty',instance,toolId
    },'*');}
  },true);
  window.addEventListener('error',event=>{
    if (instance) report('error','工具运行错误：'+String(event.message||'unknown').slice(0,200));
  });
  window.addEventListener('unhandledrejection',event=>{
    if (instance) report('error','工具异步错误：'+String(event.reason?.message||event.reason||'unknown').slice(0,200));
  });
  window.addEventListener('message',event=>{
    if (event.source!==parent || !event.data || event.data.protocol!==SIDEBAR_TOOL_PROTOCOL)return;
    const message=event.data;
    if (message.kind==='response') {
      if (message.instance!==instance || message.toolId!==toolId)return;
      const pending=waiting.get(message.requestId);
      if (!pending)return;
      waiting.delete(message.requestId);clearTimeout(pending.timeout);
      if(message.ok)pending.resolve(message.result);
      else {const error=new Error(message.error?.message||'工具请求被拒绝');error.code=message.error?.code||'E_TOOL';pending.reject(error);}
      return;
    }
    if (message.kind==='page-changed') {
      if(message.instance===instance&&message.toolId===toolId)
        root.dispatchEvent(new Event('opendesk-page-changed'));
      return;
    }
    if (message.kind!=='load' || instance || typeof message.instance!=='string' ||
        message.instance.length>90 || !message.tool || typeof message.tool!=='object')return;
    const tool=message.tool;
    if (typeof tool.id!=='string' || typeof tool.html!=='string' || typeof tool.css!=='string' ||
        typeof tool.js!=='string' || tool.html.length>64000 || tool.css.length>120000 || tool.js.length>220000)return;
    instance=message.instance;toolId=tool.id;
    root.replaceChildren();
    const style=document.createElement('style');
    style.textContent=tool.css;
    document.head.append(style);
    // User HTML and code never enter privileged extension DOM or a browser API world.
    root.innerHTML=tool.html;
    const setState=({dirty,busy})=>{
      if(typeof dirty!=='boolean'||typeof busy!=='boolean')return;
      if(dirty||busy)sendDraft();
      parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'edit-state',instance,toolId,dirty,busy},'*');
    };
    Object.defineProperty(window,'OpenDeskTool',{value:Object.freeze({root,request,setState}),configurable:false});
    Object.defineProperty(window,'OpenDeskSDK',{value:Object.freeze({browser:createBrowserSdk({request,context:'sidebar-tool'})}),configurable:false});
    scriptUrl=URL.createObjectURL(new Blob([tool.js],{type:'text/javascript'}));
    const script=document.createElement('script');
    script.src=scriptUrl;
    script.addEventListener('load',()=>{URL.revokeObjectURL(scriptUrl);scriptUrl=null;report('ready','工具已就绪');},{once:true});
    script.addEventListener('error',()=>{URL.revokeObjectURL(scriptUrl);scriptUrl=null;report('error','工具脚本加载失败');},{once:true});
    document.body.append(script);
  });
  window.addEventListener('pagehide',()=>{
    if(scriptUrl)URL.revokeObjectURL(scriptUrl);
    for(const {reject,timeout} of waiting.values()){clearTimeout(timeout);reject(new Error('工具已关闭'));}
    waiting.clear();
  },{once:true});
}
