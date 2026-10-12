// Trusted extension-side compiler CLIENT. Dedicated Workers transform source
// data only; every remote byte comes from an explicitly approved fixed graph.
import {digestUtf8} from '../platform/protocol.js';
import {PAGE_BROWSER_UI_HELPER,PAGE_BROWSER_PRIVATE_FILES,PAGE_FRAMEWORK_RUNTIMES} from '../libs/page-frameworks/contract.js';
import {remoteURL,validateRemoteLock,REMOTE_LIMITS} from '../scripting/user-scripts/remote-esm-contract.js';
const MAX_AUTHORING=128*1024,MAX_PAGE=100000;
const compilerIdentity=PAGE_BROWSER_PRIVATE_FILES.map(row=>row.id+':'+row.version+':'+row.sha256).join('|');
const typed=(code,message)=>Object.assign(new Error(message),{code});
const bytes=s=>new TextEncoder().encode(s).length;
async function verifiedModules(modules=[],lock){
  if(!Array.isArray(modules)||modules.length>REMOTE_LIMITS.modules)throw typed('E_REMOTE_LIMIT','远端模块图超过浏览器准备上限');
  if(lock){validateRemoteLock(lock);if(lock.format!=='opendesk.remote-lock.v1')throw typed('E_REMOTE_LOCK','此浏览器组件入口当前只准备 remote-lock.v1');}
  let total=0;const seen=new Set();
  for(const row of modules){
    if(!row||remoteURL(row.url)!==row.url||seen.has(row.url)||typeof row.code!=='string'||
      !Number.isInteger(row.bytes)||row.bytes<1||row.bytes>REMOTE_LIMITS.moduleBytes||
      !/^[a-f0-9]{64}$/.test(row.sha256)||bytes(row.code)!==row.bytes||await digestUtf8(row.code)!==row.sha256)
      throw typed('E_REMOTE_HASH','固定远端模块的原始字节、大小或 SHA-256 不一致');
    seen.add(row.url);total+=row.bytes;
    if(total>REMOTE_LIMITS.totalBytes)throw typed('E_REMOTE_LIMIT','远端模块图超过 256 KiB');
    if(lock&&(lock.modules[row.url]?.sha256!==row.sha256||lock.modules[row.url]?.bytes!==row.bytes))
      throw typed('E_REMOTE_LOCK','模块字节与已批准的远端锁不一致');
  }
  if(lock&&Object.keys(lock.modules).length!==modules.length)throw typed('E_REMOTE_CACHE','固定远端模块缓存缺失');
}
export function createBrowserPageComponentPreparer({api=globalThis.chrome,
  WorkerClass=globalThis.Worker,fetchImpl=globalThis.fetch,timeoutMs=25000}={}){
  if(typeof timeoutMs!=='number'||timeoutMs<1000||timeoutMs>60000)throw typed('E_PAGE_COMPILER_CONFIG','Invalid compiler timeout');
  let revision=0,active=null,pending=0,helperTask=null,cache=null,disposed=false;
  function cancel(){
    ++revision;pending=0;
    if(active){const old=active;active=null;old.reject(typed('E_PAGE_COMPILER_STALE','编译输入已更改或准备已取消，旧结果不会运行'));try{old.worker.terminate();}catch{}}
  }
  async function loadHelper(){
    if(helperTask)return helperTask;
    helperTask=(async()=>{
      const url=api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output);
      if(typeof url!=='string'||!url.startsWith('chrome-extension://'))throw typed('E_PAGE_COMPILER_RESOURCE','Compiler must use an internal extension URL');
      const response=await fetchImpl(url,{cache:'no-store',redirect:'error'});
      if(!response?.ok||response.redirected||response.url!==url)throw typed('E_PAGE_COMPILER_RESOURCE','Trusted UI helper could not be loaded');
      const code=await response.text();
      if(bytes(code)!==PAGE_BROWSER_UI_HELPER.bytes||await digestUtf8(code)!==PAGE_BROWSER_UI_HELPER.sha256)
        throw typed('E_PAGE_COMPILER_HASH','Trusted UI helper bytes changed');
      return code;
    })();
    try{return await helperTask;}catch(error){helperTask=null;throw error;}
  }
  async function job(action,input={}){
    if(disposed)throw typed('E_PAGE_COMPILER_CLOSED','Compiler client is closed');
    const {componentSource,framework,projectId,pageRules}=input;
    if(typeof componentSource!=='string'||!componentSource.trim()||bytes(componentSource)>MAX_AUTHORING||!['react','vue','controller'].includes(framework))
      throw typed('E_PAGE_COMPONENT_LIMIT','Invalid component source or framework');
    // Clone before any async work: callers cannot change a graph during hash
    // checks, Worker preparation or a compiled-cache lookup.
    const remoteModules=structuredClone(action==='inspect'?(input.remoteModules||[]):(input.remoteSnapshot?.modules||[]));
    const remoteLock=action==='prepare'&&input.remoteSnapshot?.lock?structuredClone(input.remoteSnapshot.lock):undefined;
    cancel();const ticket=revision,startedAt=performance.now();pending=ticket;
    const current=()=>{if(disposed||ticket!==revision)throw typed('E_PAGE_COMPILER_STALE','Newer input or cancellation superseded this request');};
    try{
      // Rehash BEFORE using a successful compilation cache. A corrupt/missing
      // source asset must never be hidden by an older compiled result.
      await verifiedModules(remoteModules,remoteLock);current();
      const controller=framework==='controller';
      const key=JSON.stringify({componentSource,framework,projectId,pageRules,remoteLock,remoteModules,
        entryMode:controller?'controller-esm':'component',
        conversion:controller?'babel-cjs-classic-controller-r4':'babel-cjs-classic-jsx-v1',
        generated:controller?'controller-esm-linker-r4':'page-component-entry-r243',
        browserCompiler:compilerIdentity,
        frameworkRuntime:controller?null:PAGE_FRAMEWORK_RUNTIMES[framework].sha256});
      if(action==='prepare'&&cache?.key===key)return Object.freeze({...cache.value,cacheHit:true,prepareMs:0});
      const helper=action==='prepare'&&!controller?await loadHelper():undefined;current();
      if(typeof WorkerClass!=='function')throw typed('E_PAGE_COMPILER_WORKER','Dedicated Worker unavailable');
      const worker=new WorkerClass(api.runtime.getURL('ui/page-component-compiler-worker.js'),{type:'classic',name:'OpenDeskPageCompilerR243'});
      let settled=false,stopTimer;
      const payload=await new Promise((resolve,reject)=>{
        const end=(error,value)=>{
          if(settled)return;settled=true;clearTimeout(stopTimer);try{worker.terminate();}catch{}
          if(active?.worker===worker)active=null;if(error)reject(error);else resolve(value);
        };
        active={worker,reject:error=>end(error)};
        stopTimer=setTimeout(()=>end(typed('E_PAGE_COMPILER_TIMEOUT','编译器超时并已停止')),timeoutMs);
        worker.onerror=event=>{event.preventDefault?.();end(typed('E_PAGE_COMPILER_WORKER','固定浏览器编译资源加载失败'));};
        worker.onmessage=event=>{
          const row=event.data;if(!row||row.requestId!==ticket)return;
          if(!row.ok){const error=typed(row.error?.code||'E_PAGE_COMPILER_WORKER',String(row.error?.message||'组件转换失败').slice(0,400));
            if(row.error?.location)error.location=row.error.location;end(error);return;}
          end(null,row.result);
        };
        try{worker.postMessage({type:'prepare',action,requestId:ticket,componentSource,framework,projectId,pageRules,
          uiHelperSource:helper,remoteModules,remoteLock});}
        catch(error){end(typed('E_PAGE_COMPILER_WORKER',String(error?.message||error)));}
      });
      current();
      if(action==='inspect'){
        if(!payload||payload.framework!==framework||payload.projectId!==projectId||
          !Array.isArray(payload.remoteRoots)||!Array.isArray(payload.missingUrls)||!Array.isArray(payload.modules)||
          payload.remoteRoots.length>REMOTE_LIMITS.modules||payload.missingUrls.length>REMOTE_LIMITS.modules||
          payload.sourceHash!==await digestUtf8(componentSource))throw typed('E_PAGE_COMPILER_OUTPUT','Source inspection identity is invalid');
        current();return Object.freeze(payload);
      }
      if(!payload||payload.framework!==framework||payload.projectId!==projectId||payload.entryFormat!=='async-main'||
        typeof payload.sourceUtf8!=='string'||bytes(payload.sourceUtf8)>(controller?48000:MAX_PAGE)||
        !payload.sourceUtf8.includes('async function main()')||
        (controller?payload.authoringSourceHash!==await digestUtf8(componentSource):
          !payload.sourceUtf8.includes('// @opendesk-lib '+framework)))
        throw typed(controller?'E_CONTROLLER_ESM_OUTPUT':'E_PAGE_COMPILER_OUTPUT',
          'Compiled source failed its immutable execution-world constraints');
      const sourceHash=await digestUtf8(payload.sourceUtf8);current();
      const output=Object.freeze({...payload,sourceHash,cacheHit:false,prepareMs:Math.round((performance.now()-startedAt)*10)/10});
      cache={key,value:output};return output;
    }finally{if(pending===ticket)pending=0;}
  }
  return Object.freeze({prepare:input=>job('prepare',input),inspect:input=>job('inspect',input),cancel,
    dispose(){if(disposed)return;disposed=true;cancel();cache=null;helperTask=null;},get busy(){return pending!==0;}});
}
