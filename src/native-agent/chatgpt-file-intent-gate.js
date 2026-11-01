import {chatGPTConversationId} from './workspace-chatgpt.js';
import {validateRequestPath} from './workspace-chat-request.js';

// A one-use, non-authorizing UI handoff. It never carries Native sessions,
// Workspace grants, request/binding IDs, file bytes or executable commands.
export const CHATGPT_FILE_INTENT_PROTOCOL='opendesk.chatgpt.file-intent.v1';
const WORKSPACE_PAGE='native-agent/workspace.html';
const TTL_MS=120_000;
const fail=(code,message)=>Object.assign(new Error(message),{code});

function officialConversation(url){
  try{
    const parsed=new URL(url);
    return parsed.origin==='https://chatgpt.com'&&!parsed.username&&!parsed.password&&
      /^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(parsed.pathname)&&
      Boolean(chatGPTConversationId(url));
  }catch{return false;}
}

// A page-supplied filename is only a visual hint; the trusted Workspace
// requires a new explicit file selection and live Native authorization.
export function normalizeChatGPTFileHint(value=''){
  if(value===undefined||value===null||value==='')return '';
  if(typeof value!=='string'||value!==value.trim()||!value.endsWith('.txt'))
    throw fail('E_FILE_HINT','文件提示只能是已授权目录内的相对 .txt 路径');
  try{validateRequestPath(value);}
  catch{throw fail('E_FILE_HINT','文件提示路径无效');}
  return value;
}

// Use after parseFileRequest in the single-file flow, BEFORE files.read.
// The model must not choose another file or change the approved operation.
export function assertLockedChatGPTFileRequest(request,reviewed){
  if(!request||!reviewed||request.operation!=='read'||reviewed.operation!=='read'||
    typeof reviewed.path!=='string'||!reviewed.path.endsWith('.txt'))
    throw fail('E_FILE_SCOPE','只允许经用户审阅的单个 .txt 读取');
  normalizeChatGPTFileHint(reviewed.path);
  if(request.path!==reviewed.path||
    ['workspaceId','requestId','bindingId'].some(key=>request[key]!==reviewed[key]))
    throw fail('E_FILE_SCOPE','文件路径或请求身份已改变，必须重新审阅');
  return request;
}

export function installChatGPTFileIntentGate({api=chrome,clock=()=>Date.now()}={}){
  const pending=new Map(),sourceEpochs=new Map();
  let disposed=false;
  const epoch=tabId=>sourceEpochs.get(tabId)||0;
  const currentSource=async(tabId,documentId)=>{
    const [tab,frame]=await Promise.all([
      api.tabs.get(tabId),api.webNavigation.getFrame({tabId,frameId:0})
    ]);
    if(!tab||tab.id!==tabId||tab.incognito||tab.pendingUrl||
      !Number.isSafeInteger(tab.windowId)||typeof documentId!=='string'||
      !frame||frame.documentId!==documentId||frame.frameId!==undefined&&frame.frameId!==0||
      frame.documentLifecycle!=='active'||frame.errorOccurred||
      tab.url!==frame.url||!officialConversation(frame.url))
      throw fail('E_FILE_SOURCE','原 ChatGPT 对话已改变、关闭或不可验证');
    return Object.freeze({tabId,documentId,url:frame.url,
      conversationId:chatGPTConversationId(frame.url),windowId:tab.windowId});
  };
  const pageSender=async sender=>{
    if(sender?.id!==api.runtime.id||sender.frameId!==0||sender.tab?.incognito||
      !Number.isSafeInteger(sender.tab?.id)||typeof sender.documentId!=='string'||
      !officialConversation(sender.url))
      throw fail('E_FILE_SENDER','仅接受官方 ChatGPT 主文档的第一方入口');
    return currentSource(sender.tab.id,sender.documentId);
  };
  const workspaceSender=sender=>{
    const url=api.runtime.getURL(WORKSPACE_PAGE);
    if(sender?.id!==api.runtime.id||sender.url!==url||sender.frameId!==0||
      sender.tab?.incognito||!Number.isSafeInteger(sender.tab?.id)||
      typeof sender.documentId!=='string'||!sender.documentId||
      !Number.isSafeInteger(sender.tab?.windowId))
      throw fail('E_FILE_OWNER','只有正式扩展的可信 Workspace 页面可以领取意图');
    return sender.tab;
  };
  const dropTab=(tabId,sourceNavigation=false)=>{
    if(sourceNavigation)sourceEpochs.set(tabId,epoch(tabId)+1);
    for(const [workspaceTabId,item] of pending){
      if(item.source.tabId===tabId||!sourceNavigation&&workspaceTabId===tabId)
        pending.delete(workspaceTabId);
    }
  };
  const onMessage=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_FILE_INTENT_PROTOCOL||
      !['open','claim'].includes(message.kind))return false;
    const process=async()=>{
      if(disposed)throw fail('E_FILE_CLOSED','入口已关闭');
      if(message.kind==='open'){
        if(Object.keys(message).some(key=>!['protocol','kind','pathHint'].includes(key)))
          throw fail('E_FILE_SCHEMA','网页入口不能提交任何授权或绑定字段');
        const hint=normalizeChatGPTFileHint(message.pathHint);
        const source=await pageSender(sender),generation=epoch(source.tabId);
        const tab=await api.tabs.create({url:api.runtime.getURL(WORKSPACE_PAGE),
          windowId:source.windowId,openerTabId:source.tabId,active:true});
        if(!Number.isSafeInteger(tab?.id)||tab.windowId!==source.windowId)
          throw fail('E_FILE_OPEN','未能打开可信文件工作区');
        const fresh=await currentSource(source.tabId,source.documentId);
        if(disposed||generation!==epoch(source.tabId)||fresh.url!==source.url)
          throw fail('E_FILE_SOURCE','打开工作区期间原会话发生变化');
        pending.set(tab.id,{source,pathHint:hint,createdAt:clock()});
        return {opened:true}; // No token, credential or Native RPC to the page.
      }
      if(Object.keys(message).some(key=>!['protocol','kind'].includes(key)))
        throw fail('E_FILE_SCHEMA','领取请求不接受网页或文件权限参数');
      const workspaceTab=workspaceSender(sender),item=pending.get(workspaceTab.id);
      if(!item)throw fail('E_FILE_REPLAY','没有可领取的单次文件意图');
      pending.delete(workspaceTab.id); // Consume before any asynchronous check.
      if(item.source.windowId!==workspaceTab.windowId||clock()-item.createdAt>TTL_MS)
        throw fail('E_FILE_EXPIRED','文件入口已失效，请从原对话重新打开');
      const fresh=await currentSource(item.source.tabId,item.source.documentId);
      if(disposed||fresh.url!==item.source.url||fresh.windowId!==item.source.windowId)
        throw fail('E_FILE_SOURCE','原 ChatGPT 对话已经切换');
      return {source:item.source,pathHint:item.pathHint,
        requiresWorkspaceSelection:true,requiresFileReview:true,requiresDisclosureConsent:true};
    };
    Promise.resolve().then(process).then(data=>reply({ok:true,data}),
      error=>reply({ok:false,error:{code:error.code||'E_FILE_HANDOFF',
        message:error.message||'文件入口无法核验'}}));
    return true;
  };
  const onCommitted=event=>{if(event?.frameId===0)dropTab(event.tabId,true);};
  const onHistory=event=>{if(event?.frameId===0)dropTab(event.tabId,true);};
  const onRemoved=tabId=>dropTab(tabId);
  api.runtime.onMessage.addListener(onMessage);
  api.webNavigation.onCommitted.addListener(onCommitted);
  api.webNavigation.onHistoryStateUpdated?.addListener(onHistory);
  api.tabs.onRemoved.addListener(onRemoved);
  return Object.freeze({dispose(){
    if(disposed)return;disposed=true;pending.clear();sourceEpochs.clear();
    api.runtime.onMessage.removeListener(onMessage);
    api.webNavigation.onCommitted.removeListener(onCommitted);
    api.webNavigation.onHistoryStateUpdated?.removeListener(onHistory);
    api.tabs.onRemoved.removeListener(onRemoved);
  }});
}
