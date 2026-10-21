// Runs only as an opaque-origin Chrome MV3 sandbox document, never in the privileged Side Panel.
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_SHARED_UI_RUNTIME} from '../ui/sidebar-tools/package.js';
import {createBrowserSdk} from '../framework/sdk/browser.js';
import {browserOperation,normalizeBrowserOperation} from '../framework/sdk/browser-contract.js';
// AdBlock confirmation is an actual separate Side Panel click. The trusted host
// closes unconfirmed reviews after 90 seconds; ordinary tool RPCs stay short.
// Waiting is never an authorization grant or a DNR deadline.
export const ADBLOCK_CONFIRM_OPERATIONS=Object.freeze([
  'adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore',
  'adblock.cosmetic.add','adblock.cosmetic.replace'
]);
export function sidebarToolRequestTimeout(operation,toolId){
 if(toolId==='web-markdown-clipper'&&operation.startsWith('clipNotes.'))
   return ['clipNotes.save','clipNotes.edit','clipNotes.remove','clipNotes.backup'].includes(operation)?60000:30000;
 return (toolId==='adblock'&&ADBLOCK_CONFIRM_OPERATIONS.includes(operation))||
   (toolId==='stay-focus'&&operation.startsWith('focus.')&&operation!=='focus.status')||
   (toolId==='time-review'&&['time.start','time.clear'].includes(operation))||
   browserOperation(operation)?.requiresUserGesture===true?120000:8000;
}
export function initSidebarToolSandbox() {
  const root=document.getElementById('tool-root');
  const status=document.getElementById('tool-status');
  let instance=null, toolId=null, sequence=0, scriptUrl=null,disposed=false;
  // Capture these before any package code runs. The port never enters the
  // public SDK; only this closure can attest a native click still in dispatch.
  const apply=Reflect.apply,NativePromise=Promise,NativeError=Error;
  const promiseThen=NativePromise.prototype.then,promiseResolve=NativePromise.resolve,promiseReject=NativePromise.reject;
  const define=Object.defineProperty,freeze=Object.freeze,create=Object.create,ownKeys=Reflect.ownKeys;
  const finite=Number.isFinite,nativeTimer=setTimeout,nativeClear=clearTimeout,timerReceiver=globalThis;
  const clockReceiver=globalThis.performance,clock=clockReceiver?.now;
  const mapGet=Map.prototype.get,mapSet=Map.prototype.set,mapDelete=Map.prototype.delete;
  const mapForEach=Map.prototype.forEach,mapClear=Map.prototype.clear;
  const setAdd=Set.prototype.add,setHas=Set.prototype.has,setDelete=Set.prototype.delete,setForEach=Set.prototype.forEach,setClear=Set.prototype.clear;
  // Capturing then alone is insufficient: native then consults constructor and
  // @@species. Every carrier has an immutable own constructor whose species
  // creates another protected carrier, so tool prototypes never see handlers.
  const species=create(null);
  function Carrier(executor){
    const promise=new NativePromise(executor);
    define(promise,'constructor',{value:species});
    return promise;
  }
  define(species,Symbol.species,{value:Carrier});freeze(species);freeze(Carrier);
  const rejected=error=>apply(promiseReject,Carrier,[error]);
  const observe=(promise,yes,no)=>apply(promiseThen,promise,[yes,no]);
  const later=(callback,ms)=>apply(nativeTimer,timerReceiver,[callback,ms]);
  const cancelTimer=timer=>apply(nativeClear,timerReceiver,[timer]);
  const now=()=>clock?apply(clock,clockReceiver,[]):NaN;
  const exportError=(code,message)=>{
    const error=new NativeError(message);define(error,'code',{value:code});return error;
  };
  const preparations=new Set();
  let cookieExports=false;
  const eventPrototype=globalThis.Event?.prototype;
  const currentTargetGetter=eventPrototype&&Object.getOwnPropertyDescriptor(eventPrototype,'currentTarget')?.get;
  const timeStampGetter=eventPrototype&&Object.getOwnPropertyDescriptor(eventPrototype,'timeStamp')?.get;
  const trustedGetter=eventPrototype&&(Object.getOwnPropertyDescriptor(new Event('click'),'isTrusted')?.get||
    Object.getOwnPropertyDescriptor(eventPrototype,'isTrusted')?.get);
  const stopImmediate=eventPrototype?.stopImmediatePropagation;
  const portPrototype=globalThis.MessagePort?.prototype;
  const portPost=portPrototype?.postMessage,portClose=portPrototype?.close;
  let exportPort=null,exportClick=null;
  const consumedClickTimeStamps=new Set();
  window.addEventListener('click',event=>{
    if(trustedGetter&&apply(trustedGetter,event,[])===true)exportClick=event;
  },true);
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
  const consumeExportClick=operation=>{
    const clickTimeStamp=exportClick&&timeStampGetter?apply(timeStampGetter,exportClick,[]):null;
    const direct=exportPort&&!disposed&&timeStampGetter&&
      (operation==='browser.clipboard.writeText'||operation==='browser.downloads.text')&&
      exportClick&&apply(trustedGetter,exportClick,[])===true&&
      apply(currentTargetGetter,exportClick,[])!==null&&
      finite(clickTimeStamp)&&!apply(setHas,consumedClickTimeStamps,[clickTimeStamp]);
    // Label activation forwards the same timestamp; both entry points consume
    // it synchronously, before invoking any tool code (including getters).
    if(!direct)return null;
    exportClick=null;apply(setAdd,consumedClickTimeStamps,[clickTimeStamp]);
    return exportPort;
  };
  const sendRequest=(operation,payload,directPort,finalCheck)=>{
    // Allocate only at delivery: unrelated reads may finish during preparation.
    const requestId=''+(++sequence);
    return new Carrier((resolve,reject)=>{
      const timeoutMs=sidebarToolRequestTimeout(operation,toolId);
      const timeout=later(()=>{
        apply(mapDelete,waiting,[requestId]);
        // Once sent the Host may already have committed the effect.
        const exporting=operation==='browser.clipboard.writeText'||operation==='browser.downloads.text';
        const uncertain=exporting||toolId==='web-markdown-clipper'&&
          ['clipNotes.save','clipNotes.edit','clipNotes.remove','clipNotes.backup'].includes(operation)||
          toolId==='adblock'&&ADBLOCK_CONFIRM_OPERATIONS.includes(operation)||
          toolId==='stay-focus'&&operation.startsWith('focus.')&&operation!=='focus.status';
        reject(exportError(uncertain?'E_OUTCOME_UNKNOWN':'E_TOOL_TIMEOUT',
          exporting?'导出回执超时，结果未知；请核对实际结果，勿自动重试':uncertain?
          '确认或 DNR 回读超时，结果未知；请重新读取后台状态与 Chrome 规则，不要重复提交':'工具请求超时'));
      },timeoutMs);
      apply(mapSet,waiting,[requestId,{resolve,reject,timeout,operation}]);
      const message={protocol:SIDEBAR_TOOL_PROTOCOL,kind:'request',instance,toolId,requestId,operation,payload};
      // Timeout discovery and request initialization may run tool-modified
      // intrinsics. Check only after them; nothing tool-controlled may run
      // between this private callback and the captured port post.
      try{if(finalCheck)finalCheck();}
      catch(error){
        apply(mapDelete,waiting,[requestId]);cancelTimer(timeout);reject(error);return;
      }
      if(directPort){
        // A failed/unknown delivery must never fall back and replay the write.
        try{apply(portPost,directPort,[message]);}
        catch{
          apply(mapDelete,waiting,[requestId]);cancelTimer(timeout);
          reject(exportError('E_OUTCOME_UNKNOWN','导出请求未确认，请核对实际结果，勿自动重试'));
        }
      }else parent.postMessage(message,'*');
    });
  };
  const request=(operation,payload={})=>{
    if(!instance)return rejected(new NativeError('工具界面尚未就绪'));
    return sendRequest(operation,payload,consumeExportClick(operation));
  };
  const prepareExport=factory=>{
    const operation='browser.downloads.text';
    // Consume even an invalid factory's opportunity. No caller-controlled
    // property is read until the native dispatch has been checked and spent.
    const port=consumeExportClick(operation);
    const started=now();
    if(!port||cookieExports||!finite(started))
      return rejected(exportError('E_EXPORT_GESTURE','文本准备需要一次有效的原生点击'));
    if(typeof factory!=='function')return rejected(exportError('E_SCHEMA','文本准备需要 factory'));
    const reservation={port,instance,toolId,operation,deadline:started+8000,active:true,timeout:null,cancel:null};
    return new Carrier((resolve,reject)=>{
      const finish=()=>{
        if(!reservation.active)return false;
        reservation.active=false;
        apply(setDelete,preparations,[reservation]);cancelTimer(reservation.timeout);
        return true;
      };
      const fail=error=>{if(finish())reject(error);};
      const preparationFailed=cause=>{
        const error=exportError('E_EXPORT_PREPARE','文本准备失败，未发送');
        define(error,'cause',{value:cause});fail(error);
      };
      // Store only closure-private records. Tool code receives no reservation,
      // port, proof, or callback capable of sending a caller-selected operation.
      reservation.cancel=()=>fail(exportError('E_TOOL_DISPOSED','工具已关闭，文本未发送'));
      apply(setAdd,preparations,[reservation]);
      reservation.timeout=later(()=>fail(exportError('E_TOOL_TIMEOUT','文本准备超时，未发送')),8000);
      const assertValid=()=>{
        const time=now();
        if(!reservation.active||disposed||exportPort!==reservation.port||instance!==reservation.instance||toolId!==reservation.toolId){
          throw exportError('E_TOOL_DISPOSED','工具连接已失效，文本未发送');
        }
        if(!finite(time)||time>=reservation.deadline){
          throw exportError('E_TOOL_TIMEOUT','文本准备超时，未发送');
        }
      };
      const valid=()=>{
        if(!reservation.active)return false;
        try{assertValid();return true;}catch(error){fail(error);return false;}
      };
      let value;
      try{value=apply(factory,undefined,[]);}catch(error){preparationFailed(error);return;}
      // Native resolve performs one thenable assimilation; never call .then
      // on a tool value. Private handlers attach only to our protected carrier.
      try{observe(apply(promiseResolve,Carrier,[value]),result=>{
        if(!valid())return;
        try{
          if(!result||typeof result!=='object')throw exportError('E_SCHEMA','Expected text export arguments');
          const keys=ownKeys(result);
          if(keys.length!==2||
             !((keys[0]==='filename'&&keys[1]==='text')||(keys[0]==='text'&&keys[1]==='filename')))
            throw exportError('E_SCHEMA','Expected only filename and text');
          const data=create(null);
          data.filename=result.filename;data.text=result.text; // each getter exactly once
          freeze(data);
          const payload=normalizeBrowserOperation(reservation.operation,data);
          // Keep the reservation cancellable through timeout discovery and
          // all send initialization, then check immediately before delivery.
          observe(sendRequest(reservation.operation,payload,reservation.port,()=>{
            assertValid();finish();
          }),resolve,error=>{finish();reject(error);});
        }catch(error){finish();reject(error);}
      },preparationFailed);}catch(error){preparationFailed(error);}
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
      const pending=apply(mapGet,waiting,[message.requestId]);
      if (!pending)return;
      apply(mapDelete,waiting,[message.requestId]);cancelTimer(pending.timeout);
      if(message.ok)pending.resolve(message.result);
      else {const error=new Error(message.error?.message||'工具请求被拒绝');error.code=message.error?.code||'E_TOOL';pending.reject(error);}
      return;
    }
    if(message.kind==='layout'){
      // Host-owned dimensions only; untrusted tools receive a CSS constraint,
      // not an API for resizing or changing the trusted Side Panel.
      if(message.instance===instance&&message.toolId===toolId&&
         Number.isInteger(message.availableHeight)&&
         message.availableHeight>=220&&message.availableHeight<=1600){
        const size=message.availableHeight+'px';
        if(root.style.getPropertyValue('--opendesk-host-available-height')!==size){
          root.style.setProperty('--opendesk-host-available-height',size);
          scheduleSize();
        }
      }
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
    // Presentation-only navigation request. Sandbox owns its business history.
    if(message.kind==='navigation-action'){
      if(message.instance===instance&&message.toolId===toolId&&
         toolId==='web-markdown-clipper'&&['back','primary'].includes(message.action))
        root.dispatchEvent(new CustomEvent('opendesk-tool-navigation',{detail:{action:message.action}}));
      return;
    }
    if (message.kind!=='load' || instance || typeof message.instance!=='string' ||
        message.instance.length>90 || !message.tool || typeof message.tool!=='object')return;
    const tool=message.tool;
    if (typeof tool.id!=='string' || typeof tool.html!=='string' || typeof tool.css!=='string' ||
        typeof tool.js!=='string' || tool.html.length>64000 || tool.css.length>120000 || tool.js.length>220000)return;
    // Consume the transferred endpoint before loading scripts. Later tool
    // message listeners must never observe this closure-private capability.
    if(stopImmediate)apply(stopImmediate,event,[]);
    if(currentTargetGetter&&trustedGetter&&portPost&&portClose&&event.ports?.length===1)
      exportPort=event.ports[0];
    instance=message.instance;toolId=tool.id;
    // Snapshot installed capabilities before any package script can run.
    cookieExports=Array.isArray(tool.capabilities)&&tool.capabilities.some(capability=>
      typeof capability==='string'&&capability.startsWith('browser.cookies.'));
    uiLocale=acceptedLocale(message.locale);document.documentElement.lang=uiLocale;
    root.replaceChildren();
    const style=document.createElement('style');
    style.textContent=tool.css;
    document.head.append(style);
    // User HTML and code never enter privileged extension DOM or a browser API world.
    root.innerHTML=tool.html;
    // Bounded first-party visual hint, never a new privilege or route owner.
    const setNavigation=({page}={})=>{
      if(disposed||toolId!=='web-markdown-clipper'||
         !['home','library','reader','edit','new'].includes(page))return;
      parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'navigation-state',instance,toolId,page},'*');
    };
    const setState=({dirty,busy})=>{
      if(typeof dirty!=='boolean'||typeof busy!=='boolean')return;
      if(dirty||busy)sendDraft();
      parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'edit-state',instance,toolId,dirty,busy},'*');
    };
    Object.defineProperty(window,'OpenDeskTool',{value:Object.freeze({
      root,request,setState,
      ...(toolId==='web-markdown-clipper'?{setNavigation}:{}),
      get locale(){return uiLocale;},
      onLocaleChange(callback){
        if(typeof callback!=='function')throw Error('E_UI_LOCALE_CALLBACK');
        localeListeners.add(callback);return ()=>localeListeners.delete(callback);
      }
    }),configurable:false});
    Object.defineProperty(window,'OpenDeskSDK',{value:Object.freeze({browser:createBrowserSdk({request,context:'sidebar-tool',prepareExport})}),configurable:false});
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
    disposed=true;
    apply(setForEach,preparations,[reservation=>reservation.cancel()]);
    if(exportPort)apply(portClose,exportPort,[]);
    exportPort=null;exportClick=null;
    apply(setClear,localeListeners,[]);if(scriptUrl)URL.revokeObjectURL(scriptUrl);
    apply(mapForEach,waiting,[({reject,timeout,operation})=>{
      cancelTimer(timeout);
      const exporting=operation==='browser.clipboard.writeText'||operation==='browser.downloads.text';
      reject(exportError(exporting?'E_OUTCOME_UNKNOWN':'E_TOOL_DISPOSED',
        exporting?'工具已关闭，导出结果未知；请核对实际结果，勿自动重试':'工具已关闭'));
    }]);
    apply(mapClear,waiting,[]);
  },{once:true});
}
