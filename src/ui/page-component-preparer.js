// R24.3: trusted extension-side compiler CLIENT, never an execution engine.
// One job owns one dedicated Worker. Edits, cancellation and failures cannot
// reuse stale successful code. Only exact immutable extension resources load.
import {digestUtf8} from '../platform/protocol.js';
import {PAGE_BROWSER_UI_HELPER} from '../libs/page-frameworks/contract.js';
const MAX_AUTHORING=128*1024,MAX_PAGE=100000;
const typed=(code,message)=>Object.assign(new Error(message),{code});
const bytes=s=>new TextEncoder().encode(s).length;
export function createBrowserPageComponentPreparer({api=globalThis.chrome,
  WorkerClass=globalThis.Worker,fetchImpl=globalThis.fetch,
  timeoutMs=25000}={}){
  if(typeof timeoutMs!=='number'||timeoutMs<1000||timeoutMs>60000)
    throw typed('E_PAGE_COMPILER_CONFIG','Invalid compiler timeout');
  let revision=0,active=null,helperTask=null,disposed=false;
  function cancel(){
    ++revision;
    if(active){
      const old=active;active=null;
      old.reject(typed('E_PAGE_COMPILER_STALE','编译输入已更改，旧结果不会运行'));
      try{old.worker.terminate();}catch{}
    }
  }
  async function loadHelper(){
    if(helperTask)return helperTask;
    helperTask=(async()=>{
      const url=api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output);
      if(typeof url!=='string'||!url.startsWith('chrome-extension://'))
        throw typed('E_PAGE_COMPILER_RESOURCE','Compiler must use an internal extension URL');
      const response=await fetchImpl(url,{cache:'no-store',redirect:'error'});
      if(!response?.ok||response.redirected||response.url!==url)
        throw typed('E_PAGE_COMPILER_RESOURCE','Trusted UI helper could not be loaded');
      const code=await response.text();
      if(bytes(code)!==PAGE_BROWSER_UI_HELPER.bytes||
         await digestUtf8(code)!==PAGE_BROWSER_UI_HELPER.sha256)
        throw typed('E_PAGE_COMPILER_HASH','Trusted UI helper bytes changed');
      return code;
    })();
    try{return await helperTask;}catch(error){helperTask=null;throw error;}
  }
  async function prepare({componentSource,framework,projectId,pageRules}={}){
    if(disposed)throw typed('E_PAGE_COMPILER_CLOSED','Compiler client is closed');
    if(typeof componentSource!=='string'||!componentSource.trim()||
       bytes(componentSource)>MAX_AUTHORING||!['react','vue'].includes(framework))
      throw typed('E_PAGE_COMPONENT_LIMIT','Invalid component source or framework');
    cancel();
    const ticket=revision;
    const helper=await loadHelper();
    if(ticket!==revision||disposed)throw typed('E_PAGE_COMPILER_STALE','Newer compiler input superseded this request');
    if(typeof WorkerClass!=='function')throw typed('E_PAGE_COMPILER_WORKER','Dedicated Worker unavailable');
    const worker=new WorkerClass(api.runtime.getURL('ui/page-component-compiler-worker.js'),{
      type:'classic',name:'OpenDeskPageCompilerR243'});
    let settled=false,stopTimer;
    const payload=await new Promise((resolve,reject)=>{
      const end=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(stopTimer);
        try{worker.terminate();}catch{}
        if(active?.worker===worker)active=null;
        if(error)reject(error);else resolve(value);
      };
      active={worker,reject:error=>end(error)};
      stopTimer=setTimeout(()=>end(typed('E_PAGE_COMPILER_TIMEOUT','编译器超时并已停止')),timeoutMs);
      worker.onerror=event=>{
        event.preventDefault?.();
        end(typed('E_PAGE_COMPILER_WORKER','固定浏览器编译资源加载失败'));
      };
      worker.onmessage=event=>{
        const row=event.data;
        if(!row||row.requestId!==ticket)return;
        if(!row.ok){
          const err=typed(row.error?.code||'E_PAGE_COMPILER_WORKER',
            String(row.error?.message||'组件转换失败').slice(0,400));
          if(row.error?.location)err.location=row.error.location;
          end(err);return;
        }
        end(null,row.result);
      };
      try{worker.postMessage({type:'prepare',requestId:ticket,
        componentSource,framework,projectId,pageRules,uiHelperSource:helper});}
      catch(error){end(typed('E_PAGE_COMPILER_WORKER',String(error?.message||error)));}
    });
    if(disposed||ticket!==revision)
      throw typed('E_PAGE_COMPILER_STALE','Discarded obsolete compiler output');
    if(!payload||payload.framework!==framework||payload.projectId!==projectId||
       payload.entryFormat!=='async-main'||typeof payload.sourceUtf8!=='string'||
       bytes(payload.sourceUtf8)>MAX_PAGE||
       !payload.sourceUtf8.includes('// @opendesk-lib '+framework)||
       !payload.sourceUtf8.includes('async function main()'))
      throw typed('E_PAGE_COMPILER_OUTPUT','Compiled source failed original Page constraints');
    return Object.freeze({...payload,sourceHash:await digestUtf8(payload.sourceUtf8)});
  }
  return Object.freeze({prepare,cancel,dispose(){if(disposed)return;disposed=true;cancel();},
    get busy(){return !!active;}});
}
