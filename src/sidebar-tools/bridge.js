// Runs only as an opaque-origin Chrome MV3 sandbox document, never in the privileged Side Panel.
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_SHARED_UI_RUNTIME} from '../ui/sidebar-tools/package.js';
import {createBrowserSdk} from '../framework/sdk/browser.js';
import {browserOperation} from '../framework/sdk/browser-contract.js';
// AdBlock confirmation is an actual separate Side Panel click. The trusted host
// closes unconfirmed reviews after 90 seconds; ordinary tool RPCs stay short.
// Waiting is never an authorization grant or a DNR deadline.
export const ADBLOCK_CONFIRM_OPERATIONS=Object.freeze([
  'adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore'
]);
export function sidebarToolRequestTimeout(operation,toolId){
 return (toolId==='adblock'&&ADBLOCK_CONFIRM_OPERATIONS.includes(operation))||
   (toolId==='stay-focus'&&operation.startsWith('focus.')&&operation!=='focus.status')||
   (toolId==='time-review'&&['time.start','time.clear'].includes(operation))||
   browserOperation(operation)?.requiresUserGesture===true?120000:8000;
}
export function initSidebarToolSandbox() {
  const root=document.getElementById('tool-root');
  const status=document.getElementById('tool-status');
  let instance=null, toolId=null, sequence=0, scriptUrl=null,disposed=false;
  let startupFailed=false;
  let uiLocale='zh-CN';
  const localeListeners=new Set();
  const acceptedLocale=value=>typeof value==='string'&&value.length<=45&&/^[A-Za-z0-9-]+$/.test(value)?
    (()=>{try{return Intl.getCanonicalLocales(value)[0]||'zh-CN';}catch{return 'zh-CN';}})():'zh-CN';
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
    // Classic scripts can report a runtime error and still fire their load event.
    if(state==='error')startupFailed=true;
    if(state==='ready'&&startupFailed)return;
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
      const timeout=setTimeout(()=>{
        waiting.delete(requestId);
        // The host may already have committed a write. Do not interpret loss
        // of transport acknowledgement as cancellation or reissue the write.
        const uncertain=toolId==='adblock'&&ADBLOCK_CONFIRM_OPERATIONS.includes(operation)||
          toolId==='stay-focus'&&operation.startsWith('focus.')&&operation!=='focus.status';
        const error=new Error(uncertain?
          '确认或 DNR 回读超时，结果未知；请重新读取后台状态与 Chrome 规则，不要重复提交':'工具请求超时');
        error.code=uncertain?'E_OUTCOME_UNKNOWN':'E_TOOL_TIMEOUT';
        reject(error);
      },timeoutMs);
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
    if (message.kind==='cookie-grants-changed') {
      if(message.instance===instance&&message.toolId===toolId)
        root.dispatchEvent(new Event('opendesk-cookie-grants-changed'));
      return;
    }
    if (message.kind==='page-changed') {
      if(message.instance===instance&&message.toolId===toolId)
        root.dispatchEvent(new Event('opendesk-page-changed'));
      return;
    }
    if(message.kind==='locale-changed'){
      if(message.instance===instance&&message.toolId===toolId){
        const next=acceptedLocale(message.locale);
        if(next!==uiLocale){uiLocale=next;document.documentElement.lang=next;
          for(const callback of localeListeners)try{callback(next);}catch{/* Isolated tool UI callback. */}
          scheduleSize();
        }
      }
      return;
    }
    // No privileged data or authorization crosses the sandbox boundary.
    if (message.kind==='state-changed') {
      if(message.instance===instance&&message.toolId===toolId)
        root.dispatchEvent(new Event('opendesk-tool-state-changed'));
      return;
    }
    if (message.kind!=='load' || instance || typeof message.instance!=='string' ||
        message.instance.length>90 || !message.tool || typeof message.tool!=='object')return;
    const tool=message.tool;
    if (typeof tool.id!=='string' || typeof tool.html!=='string' || typeof tool.css!=='string' ||
        typeof tool.js!=='string' || tool.html.length>64000 || tool.css.length>120000 || tool.js.length>220000)return;
    instance=message.instance;toolId=tool.id;
    uiLocale=acceptedLocale(message.locale);document.documentElement.lang=uiLocale;
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
    Object.defineProperty(window,'OpenDeskTool',{value:Object.freeze({
      root,request,setState,
      get locale(){return uiLocale;},
      onLocaleChange(callback){
        if(typeof callback!=='function')throw Error('E_UI_LOCALE_CALLBACK');
        localeListeners.add(callback);return ()=>localeListeners.delete(callback);
      }
    }),configurable:false});
    Object.defineProperty(window,'OpenDeskSDK',{value:Object.freeze({browser:createBrowserSdk({request,context:'sidebar-tool'})}),configurable:false});
    // Native/File-first: every dependency is the exact UTF-8 source bundled in
    // the installed v2 package. Verify SHA before creating a local Blob URL.
    // Never create a network script.src, never use privileged extension DOM.
    const fixed=tool.scripts===undefined?[]:tool.scripts;
    if(!Array.isArray(fixed)||fixed.length>8||fixed.some(item=>
      !item||typeof item.code!=='string'||typeof item.name!=='string'||
      !/^[a-f0-9]{64}$/.test(item.sha256)||item.code.length>96000)){
      report('error','E_TOOL_SCRIPTS：工具固定库清单无效，已阻止执行');return;
    }
    async function verifySource(item){
      if(!globalThis.crypto?.subtle)throw Error('E_TOOL_HASH_UNAVAILABLE');
      const raw=new TextEncoder().encode(item.code);
      if(raw.byteLength<1||raw.byteLength>96000)throw Error('E_TOOL_SCRIPT_LIMIT');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
        .map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==item.sha256)throw Error('E_TOOL_SHA：'+item.name);
    }
    function loadLocal(code,name){
      if(disposed)return Promise.reject(Error('E_TOOL_DISPOSED'));
      return new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
        scriptUrl=url;
        const script=document.createElement('script');
        script.src=url;
        const finish=()=>{URL.revokeObjectURL(url);if(scriptUrl===url)scriptUrl=null;};
        script.addEventListener('load',()=>{finish();disposed?reject(Error('E_TOOL_DISPOSED')):resolve();},{once:true});
        script.addEventListener('error',()=>{finish();reject(Error('E_TOOL_SCRIPT_LOAD：'+name));},{once:true});
        document.body.append(script);
      });
    }
    // Fixed browser-owned resources, only for explicitly opted-in tools.
    async function loadSharedUI(){
      if(tool.uiRuntime===undefined)return;
      if(tool.uiRuntime!==SIDEBAR_TOOL_SHARED_UI_RUNTIME)throw Error('E_TOOL_UI_RUNTIME');
      for(const path of ['../libs/page-frameworks/react-19.2.0.js','../sidebar-shared-ui.js']){
        if(disposed)throw Error('E_TOOL_DISPOSED');
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          script.src=new URL(path,document.baseURI).href;
          script.addEventListener('load',()=>disposed?reject(Error('E_TOOL_DISPOSED')):resolve(),{once:true});
          script.addEventListener('error',()=>reject(Error('E_TOOL_SHARED_UI_LOAD: '+path)),{once:true});
          document.body.append(script);
        });
      }
      if(globalThis.OpenDeskPageReact?.version!=='19.2.0'||
        typeof globalThis.OpenDeskPageReact.createRoot!=='function'||
        typeof globalThis.OpenDeskPageReact.jsx!=='function'||
        typeof globalThis.OpenDeskSidebarUI?.Card!=='function'||
        typeof globalThis.OpenDeskSidebarUI?.Switch!=='function')
        throw Error('E_TOOL_SHARED_UI_INCOMPATIBLE');
    }
    void (async()=>{
      await loadSharedUI();
      for(const row of fixed){
        if(disposed)throw Error('E_TOOL_DISPOSED');
        await verifySource(row);
        if(disposed)throw Error('E_TOOL_DISPOSED');
        await loadLocal(row.code,row.name); // strict onload/error before next asset
      }
      if(disposed)throw Error('E_TOOL_DISPOSED');
      scriptUrl=URL.createObjectURL(new Blob([tool.js],{type:'text/javascript'}));
      const url=scriptUrl;
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=url;
        const finish=()=>{URL.revokeObjectURL(url);if(scriptUrl===url)scriptUrl=null;};
        script.addEventListener('load',()=>{finish();resolve();},{once:true});
        script.addEventListener('error',()=>{finish();reject(Error('E_TOOL_MAIN_LOAD'));},{once:true});
        document.body.append(script);
      });
      if(!disposed)report('ready','工具已就绪');
    })().catch(cause=>{if(!disposed)report('error',String(cause?.message||cause).slice(0,260));});
  });
  window.addEventListener('pagehide',()=>{
    disposed=true;localeListeners.clear();if(scriptUrl)URL.revokeObjectURL(scriptUrl);
    for(const {reject,timeout} of waiting.values()){clearTimeout(timeout);reject(new Error('工具已关闭'));}
    waiting.clear();
  },{once:true});
}
