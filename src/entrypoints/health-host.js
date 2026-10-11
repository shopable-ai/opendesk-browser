import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {PROTOCOL,createHealthProbe,isToolSender,resolveToolSender,EnvironmentError} from '../environment.js';

// Isolated fixed classic SW resource. Retains the existing environment-health
// protocol, genuine sender checks, tab lifecycle and permissions; no new RPC,
// permissions, or cross-page execution authority is introduced.
export default defineUnlistedScript(()=>{
  const api=chrome,health=createHealthProbe(api);
  api.tabs.onRemoved.addListener(tabId=>health.forgetTab(tabId));
  api.tabs.onUpdated.addListener((tabId,change)=>{
    if(change.status==='loading')health.forgetTab(tabId);
  });
  api.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.protocol!==PROTOCOL)return false;
    (async()=>{
      if(message.type==='AGENT_READY')return health.rememberReady(message,sender);
      const verified=await resolveToolSender(api,sender);
      if(!isToolSender(api,verified))
        throw new EnvironmentError('E_TARGET','仅包内工具窗口可调用环境检查');
      switch(message.type){
        case 'CREATE_HEALTH_TARGET':return health.createTarget(message.url);
        case 'CHECK_HEALTH':return health.ping(message.target);
        case 'CHECK_SOURCE':{
          const {environmentSource}=await api.storage.session.get('environmentSource');
          if(!environmentSource)
            throw new EnvironmentError('E_TARGET','请从 HTTP(S) 原页面点击扩展入口');
          return health.bind(environmentSource.tabId,environmentSource.origin);
        }
        default:throw new EnvironmentError('E_CAPABILITY','环境阶段未实现该操作');
      }
    })().then(data=>sendResponse({ok:true,data}),error=>sendResponse({ok:false,error:{
      code:error.code||'E_TARGET',message:error.message||'环境检查失败'
    }}));
    return true;
  });
});
