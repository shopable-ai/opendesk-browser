import {installChatGPTFileIntentGate} from './chatgpt-file-intent-gate.js';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_FILES_PAGE} from './chatgpt-files-controller.js';

export function installChatGPTFilesService({api,files,development}){
  const controller=createChatGPTFilesController({api,files});
  const gate=installChatGPTFileIntentGate({api,targetPage:CHATGPT_FILES_PAGE,onClaim:controller.claim});
  const onMessage=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_FILES_PROTOCOL)return false;
    const finish=development?.nativeStarted();
    const action=development?.held?Promise.reject({code:'E_DEV_RELOADING',message:'开发更新正在核对空闲状态，请稍后刷新',outcome:'NOT_DISPATCHED'}):
      controller.handle(message,sender);
    action.then(data=>reply({ok:true,data}),error=>reply({ok:false,error:{
      code:error.code||'E_FILES_IO',message:error.message||'文件请求失败',outcome:error.outcome||'NOT_DISPATCHED'}})).finally(()=>finish?.());
    return true;
  };
  const onNavigation=event=>{if(event.frameId===0)controller.drop(event.tabId);};
  const onRemoved=tabId=>controller.drop(tabId);
  api.runtime.onMessage.addListener(onMessage);
  api.webNavigation.onCommitted.addListener(onNavigation);
  api.webNavigation.onHistoryStateUpdated?.addListener(onNavigation);
  api.tabs.onRemoved.addListener(onRemoved);
  return {dispose(){gate.dispose();controller.dispose();api.runtime.onMessage.removeListener(onMessage);
    api.webNavigation.onCommitted.removeListener(onNavigation);api.webNavigation.onHistoryStateUpdated?.removeListener(onNavigation);
    api.tabs.onRemoved.removeListener(onRemoved);}};
}
