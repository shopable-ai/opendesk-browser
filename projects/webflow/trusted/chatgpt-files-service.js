import {installChatGPTFileIntentGate} from './chatgpt-file-intent-gate.js';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_FILES_PAGE,CHATGPT_PROJECT_PROTOCOL} from './chatgpt-files-controller.js';

// Fixed first-party feature over the original Native workspace transport.
// A Web Flow sandbox installation cannot replace this source or grant file access.
export function installChatGPTFilesService({api,files,development}){
  const controller=createChatGPTFilesController({api,files});
  const gate=installChatGPTFileIntentGate({api,targetPage:CHATGPT_FILES_PAGE,onClaim:controller.claim});
  const summary=data=>({needsConnection:data.needsConnection??data.projectConnection?.needsConnection??false,
    message:data.message,phase:data.automation?.phase,delivery:data.delivery,observed:data.observed,
    projectConnection:data.projectConnection?{name:data.projectConnection.name}:null,
    comparison:data.comparison||null,
    resultText:data.resultText||'',resultStatus:data.resultStatus||'',resultPacketId:data.resultPacketId,result:data.result||null});
  const onMessage=(message,sender,reply)=>{
    if(![CHATGPT_FILES_PROTOCOL,CHATGPT_PROJECT_PROTOCOL].includes(message?.protocol))return false;
    const finish=development?.nativeStarted();
    const action=development?.held?Promise.reject({code:'E_DEV_RELOADING',message:'开发更新正在核对空闲状态，请稍后刷新',outcome:'NOT_DISPATCHED'}):
      (async()=>{
        if(message.protocol===CHATGPT_FILES_PROTOCOL)return controller.handle(message,sender);
        if(Object.keys(message).some(key=>!['protocol','action',...(['start','conversation'].includes(message.action)?['task']:message.action==='configure'?['preferences']:[])].includes(key)))
          throw {code:'E_FILE_SCHEMA',message:'网页任务不接受项目权限或文件参数'};
        if(message.action==='settings')return controller.settings(sender);
        if(message.action==='configure')return controller.configure(message.preferences,sender);
        if(message.action==='conversation')return summary(await controller.conversationTask({task:message.task},sender));
        if(message.action==='start')return summary(await controller.projectTask({task:message.task},sender));
        if(message.action==='stop')return summary(await controller.projectStop(sender));
        if(message.action==='wake'){await controller.projectStatus(sender);await controller.tick();return summary(await controller.projectStatus(sender));}
        if(message.action==='status')return summary(await controller.projectStatus(sender));
        throw {code:'E_FILE_SCHEMA',message:'不支持的项目任务操作'};
      })();
    action.then(data=>reply({ok:true,data}),error=>reply({ok:false,error:{
      code:error.code||'E_FILES_IO',message:error.message||'文件请求失败',outcome:error.outcome||'NOT_DISPATCHED'}})).finally(()=>finish?.());
    return true;
  };
  const onNavigation=event=>{if(event.frameId===0)controller.drop(event.tabId);};
  const onRemoved=tabId=>controller.drop(tabId);
  const alarmName='opendesk.chatgpt.files.tasks';
  const wake=()=>{
    if(development?.held)return;
    const finish=development?.nativeStarted();
    controller.tick().catch(()=>{}).finally(()=>finish?.());
  };
  const onAlarm=alarm=>{if(alarm.name===alarmName)wake();};
  api.alarms?.onAlarm.addListener(onAlarm);
  // Chrome alarms wake this service even with all settings documents closed.
  // Recreating the alarm on installation also repairs browser-restart loss.
  Promise.resolve(api.alarms?.create(alarmName,{periodInMinutes:0.5})).catch(()=>{});
  api.runtime.onMessage.addListener(onMessage);
  api.webNavigation.onCommitted.addListener(onNavigation);
  api.webNavigation.onHistoryStateUpdated?.addListener(onNavigation);
  api.tabs.onRemoved.addListener(onRemoved);
  return {dispose(){gate.dispose();controller.dispose();api.runtime.onMessage.removeListener(onMessage);
    api.alarms?.onAlarm.removeListener(onAlarm);
    api.webNavigation.onCommitted.removeListener(onNavigation);api.webNavigation.onHistoryStateUpdated?.removeListener(onNavigation);
    api.tabs.onRemoved.removeListener(onRemoved);}};
}
