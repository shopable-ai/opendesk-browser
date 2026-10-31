import {SIDEBAR_TOOL_PROTOCOL,sidebarToolPackageContractHash} from '../ui/sidebar-tools/package.js';
import {resolveToolSender,isToolSender} from '../environment.js';

const failure=(code,message)=>Object.assign(new Error(message),{code});
const recovery='请等待开发安全更新完成后重新打开侧栏；静态安装请核对扩展 ID 和加载目录，再更新对应的 OpenDesk Browser。原安装和数据保留。';

// Read-only compatibility query on the existing tool protocol. It neither
// installs packages nor grants capabilities; all original admission checks stay.
export function handleSidebarToolRuntimeQuery({api,message,sender,respond,isUpdating=()=>false}){
  if(message?.protocol!==SIDEBAR_TOOL_PROTOCOL||message.kind!=='runtime-contract')return false;
  (async()=>{
    const verified=await resolveToolSender(api,sender);
    if(!isToolSender(api,verified)||Object.keys(message).sort().join(',')!=='kind,protocol')
      throw failure('E_OWNER','仅包内工具窗口可核对运行合同');
    if(isUpdating())throw failure('E_DEV_RELOADING','开发更新正在核对安全刷新；请求未执行。');
    return {extensionId:api.runtime.id,version:api.runtime.getManifest().version,
      contractHash:await sidebarToolPackageContractHash()};
  })().then(data=>respond({ok:true,data}),error=>respond({ok:false,error:{
    code:error.code||'E_TOOL_RUNTIME_UNAVAILABLE',message:error.message
  }}));
  return true;
}

export async function assertSidebarToolRuntime(api){
  const identity='扩展 ID：'+(api.runtime.id||'未知')+'；版本：'+(api.runtime.getManifest?.().version||'未知')+'。';
  let reply,timer;
  try{
    reply=await Promise.race([
      api.runtime.sendMessage({protocol:SIDEBAR_TOOL_PROTOCOL,kind:'runtime-contract'}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Runtime query timed out')),5000);})
    ]);
  }catch{
    throw failure('E_TOOL_RUNTIME_UNAVAILABLE','未能核对当前安装器与实际 Worker 的能力合同。'+identity+recovery);
  }finally{clearTimeout(timer);}
  if(reply?.ok!==true){
    if(reply?.error?.code==='E_DEV_RELOADING')throw failure('E_DEV_RELOADING','正在安全应用开发更新，请稍候再选择安装包。'+identity);
    throw failure('E_TOOL_RUNTIME_UNAVAILABLE','当前 Worker 未提供安装能力合同，无法确认运行版本。'+identity+recovery);
  }
  const data=reply.data;
  if(!data||Object.keys(data).sort().join(',')!=='contractHash,extensionId,version'||
    data.extensionId!==api.runtime.id||data.version!==api.runtime.getManifest?.().version||
    data.contractHash!==await sidebarToolPackageContractHash())
    throw failure('E_TOOL_RUNTIME_MISMATCH','安装器与实际 Worker 的版本或能力合同不一致。'+identity+recovery);
  return data;
}
