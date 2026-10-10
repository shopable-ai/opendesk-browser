// Runs only as an opaque-origin Chrome MV3 sandbox document, never in the privileged Side Panel.
import {SIDEBAR_TOOL_PROTOCOL} from '../ui/sidebar-tools/package.js';
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
  const request=(operation,payload={})=>{
    if (!instance) return Promise.reject(new Error('工具界面尚未就绪'));
    const requestId=String(++sequence);
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{waiting.delete(requestId);reject(new Error('工具请求超时'));},8000);
      waiting.set(requestId,{resolve,reject,timeout});
      parent.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'request',instance,toolId,requestId,operation,payload},'*');
    });
  };
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
      else pending.reject(new Error(message.error?.message||'工具请求被拒绝'));
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
    Object.defineProperty(window,'OpenDeskTool',{value:Object.freeze({root,request}),configurable:false});
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
