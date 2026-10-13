import {digestUtf8} from '../platform/protocol.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const size=value=>new TextEncoder().encode(value).length;
export function createStaticESMPreparer({api=globalThis.chrome,WorkerClass=globalThis.Worker,timeoutMs=25000}={}){
  if(!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw fail('E_STATIC_ESM_CONFIG','无效编译超时');
  let sequence=0,active=null,disposed=false;
  function cancel(){sequence++;active?.reject(fail('E_STATIC_ESM_STALE','源码或执行模式已改变，旧编译结果不会运行'));}
  async function prepare({sourceUtf8,entries,sourceFormat,lockId,manifestDigest}={}){
    if(disposed)throw fail('E_STATIC_ESM_CLOSED','编译器已关闭');
    if(typeof sourceUtf8!=='string'||size(sourceUtf8)>128*1024||!['esm-page','esm-controller'].includes(sourceFormat)||
      !Array.isArray(entries)||entries.length>16||
      (entries.length?!/^dep-lock-[a-f0-9]{64}$/.test(lockId):lockId!==null)||!/^[a-f0-9]{64}$/.test(manifestDigest))
      throw fail('E_STATIC_ESM_INPUT','缺少当前源码的批准模块和锁身份');
    entries=structuredClone(entries);
    cancel();const ticket=sequence;
    const authorSourceHash=await digestUtf8(sourceUtf8);
    for(const row of entries){
      if(typeof row.code!=='string'||size(row.code)>128*1024||await digestUtf8(row.code)!==row.sha256)
        throw fail('E_DEPENDENCY_HASH','编译输入与已批准模块 SHA-256 不一致');
    }
    if(ticket!==sequence||disposed)throw fail('E_STATIC_ESM_STALE','校验期间编译输入已更改');
    const url=api.runtime.getURL('ui/static-esm-compiler-worker.js');
    if(typeof url!=='string'||!url.startsWith('chrome-extension://')||typeof WorkerClass!=='function')
      throw fail('E_STATIC_ESM_RESOURCE','固定扩展编译资源不可用');
    const worker=new WorkerClass(url,{type:'classic',name:'OpenDeskStaticESM'});
    const payload=await new Promise((resolve,reject)=>{
      let settled=false;const end=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);worker.terminate();
        if(active?.worker===worker)active=null;
        if(error)reject(error);else resolve(value);
      };
      const timer=setTimeout(()=>end(fail('E_STATIC_ESM_TIMEOUT','离线编译超时并已停止')),timeoutMs);
      active={worker,reject:error=>end(error)};
      worker.onerror=event=>{event.preventDefault?.();end(fail('E_STATIC_ESM_RESOURCE','固定扩展编译资源加载失败'));};
      worker.onmessage=event=>{
        const row=event.data;if(row?.requestId!==ticket)return;
        if(!row.ok){end(fail(row.error?.code||'E_STATIC_ESM_COMPILE',String(row.error?.message||'编译失败').slice(0,400)));return;}
        end(null,row.result);
      };
      try{worker.postMessage({type:'compile',requestId:ticket,input:{sourceUtf8,entries,sourceFormat}});}
      catch(error){end(fail('E_STATIC_ESM_WORKER',String(error.message)));}
    });
    if(ticket!==sequence||disposed)throw fail('E_STATIC_ESM_STALE','旧编译输出已丢弃');
    if(payload?.entryFormat!=='async-main'||payload.sourceFormat!==sourceFormat||payload.compilerVersion!=='7.29.9'||
      typeof payload.sourceUtf8!=='string'||size(payload.sourceUtf8)>100000||hasUnbuiltESM(payload.sourceUtf8)||
      !payload.sourceUtf8.startsWith('async function main(){'))throw fail('E_STATIC_ESM_OUTPUT','编译输出未闭合');
    const sourceHash=await digestUtf8(payload.sourceUtf8);
    if(ticket!==sequence||disposed)throw fail('E_STATIC_ESM_STALE','输出校验期间源码已改变');
    return Object.freeze({...payload,sourceHash,authorSourceHash,lockId,manifestDigest});
  }
  return {prepare,cancel,dispose(){disposed=true;cancel();}};
}
