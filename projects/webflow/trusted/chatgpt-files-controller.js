import {CHATGPT_FILES_CONFIG_KEY,normalizeChatGPTFilesPreferences,readChatGPTFilesPreferences} from './chatgpt-files-config.js';
import {createFileRequestContext,parseFileRequest,formatFileResult,REQUEST_PROTOCOL,WORKSPACE_ID} from '../../../src/native-agent/workspace-chat-request.js';
import {createEditContext,parseEditProposal,validateEditProposal,EDIT_PROTOCOL} from '../../../src/native-agent/workspace-ai-proposal.js';
import {readChatGPTEdit,fillChatGPTComposer,assertChatGPTTarget} from '../../../src/native-agent/workspace-chatgpt.js';
import {validateWorkspaceRead,sameWorkspaceAuthority,verifyWorkspaceWriteReceipt,verifyWorkspaceWriteReadBack} from '../../../src/native-agent/workspace-domain.js';
import {validateWorkspaceTreeListing} from '../../../src/native-agent/workspace-file-tree.js';
import {agentDigest} from '../../../src/native-agent/protocol.js';
import {resolveProjectTask,assertOrdinaryProjectEdit} from './chatgpt-project-policy.js';

export const CHATGPT_FILES_PROTOCOL='opendesk.chatgpt.files.v1';
export const CHATGPT_FILES_PAGE='native-agent/settings.html#chatgpt-files';
const LEDGER='opendesk.chatgpt.files.writes.v1';
const PROJECT_TASKS='opendesk.chatgpt.files.tasks.v1';
const PROJECT_GRANTS='opendesk.chatgpt.files.grants.v1';
const PROJECT_OWNERS='opendesk.chatgpt.files.owners.v1';
const FIXED_SESSIONS='opendesk.chatgpt.files.fixed.v1';
const WRITE_FENCES=['dispatching','unknown','confirmed-pending','readback-matched'];
export const CHATGPT_PROJECT_PROTOCOL='opendesk.chatgpt.project.v1';
const fail=(code,message,outcome='NOT_DISPATCHED')=>{throw {code,message,outcome};};
const hash=async content=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,'0')).join('');
const sameProjectIdentity=(a,b)=>!!a&&!!b&&a.workspaceId===b.workspaceId&&a.sourceId===b.sourceId;
// Keep JSON string values equivalent while making the user prompt invariant
// under Markdown rendering (including escaped quotes and nested paths).
const promptJSON=value=>JSON.stringify(value).replace(/"(?:\\.|[^"\\])*"/g,quoted=>
  quoted.replace(/\\(["\\])|[\/<>&`*_~\[\]]/g,(character,escaped)=>
    '\\u'+(escaped||character).charCodeAt(0).toString(16).padStart(4,'0')));

// The page adapter owns no Native authority. The service validates every task;
// only the packaged review document can establish or revoke disclosure grants.
export function createChatGPTFilesController({api,files,readAnswer=readChatGPTEdit,fillComposer=fillChatGPTComposer,clock=()=>Date.now()}={}){
  const sessions=new Map(),pendingOperations=new Set(),invalidatedTabs=new Set(),stoppedSources=new Set();
  let sequence=Promise.resolve(),disposed=false,restored=false,storageFailed=false,activeTicket;
  const enqueue=fn=>{const next=sequence.then(fn);sequence=next.catch(()=>{});return next;};
  const projectKey=source=>'project:'+source.tabId;
  const stored=async key=>{const value=(await api.storage.local.get(key))[key];return value&&typeof value==='object'&&!Array.isArray(value)?value:{};};
  let stopGeneration=0,admissionClosed=false,configuration=Promise.resolve();
  function pauseAll(){
    stopGeneration++;
    for(const s of sessions.values()){s.lifecycle=(s.lifecycle||0)+1;s.paused=true;s.pauseReason='disabled';s.message='本地文件运行已停用；旧任务不会自动恢复。';}
  }
  const assertGeneration=generation=>{if(generation!==stopGeneration)fail('E_FILE_PAUSED','任务排队后已停用，不会恢复旧操作');};
  const sourceIdentity=source=>JSON.stringify([source.tabId,source.documentId,source.url,source.windowId]);
  function senderIdentity(sender){
    if(sender?.id!==api.runtime.id||sender.frameId!==0||!Number.isSafeInteger(sender.tab?.id)||sender.tab.incognito||
      !Number.isSafeInteger(sender.tab.windowId)||typeof sender.documentId!=='string'||!sender.documentId||
      sender.documentLifecycle&&sender.documentLifecycle!=='active')return null;
    try{const url=new URL(sender.url);if(url.origin!=='https://chatgpt.com'||!/^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(url.pathname))return null;}catch{return null;}
    return sourceIdentity({tabId:sender.tab.id,documentId:sender.documentId,url:sender.url,windowId:sender.tab.windowId});
  }
  const assertPending=ticket=>{if(ticket?.stopped)fail('E_FILE_PAUSED','原对话已停止等待中的文件任务');};
  function enqueueOperation(fn,sender){
    if(admissionClosed)return Promise.reject({code:'E_FILES_DISABLED',message:'本地文件运行已停用',outcome:'NOT_DISPATCHED'});
    const generation=stopGeneration,ticket={source:senderIdentity(sender),senderTab:sender?.tab?.id,documentId:sender?.documentId,stopped:false};
    pendingOperations.add(ticket);
    return enqueue(async()=>{assertPending(ticket);if(generation!==stopGeneration){await enabled();assertGeneration(generation);}
      activeTicket=ticket;try{return await fn(generation,ticket);}finally{activeTicket=null;}})
      .finally(()=>pendingOperations.delete(ticket));
  }
  async function enabled(){
    if(storageFailed)fail('E_FILE_STORAGE','文件状态保存失败，已停止新操作');
    const preferences=await readChatGPTFilesPreferences(api);
    admissionClosed=!preferences.enabled;
    if(!preferences.enabled){pauseAll();fail('E_FILES_DISABLED','本地文件运行已停用');}
    return preferences;
  }
  const dispatchGuard=(s,{recovery=false}={})=>{
    assertPending(activeTicket);
    if(disposed||storageFailed||s.sourceRetired||invalidatedTabs.has(s.source.tabId)||s.fixed&&invalidatedTabs.has(s.ownerId)||
      !recovery&&(admissionClosed||s.paused||stoppedSources.has(sourceIdentity(s.source))))
      fail('E_FILE_PAUSED','文件操作已失效，未派发');
  };
  async function running(s){await enabled();dispatchGuard(s);}
  async function fixedStorage(){
    if(!api.storage.session?.setAccessLevel)fail('E_FILE_STORAGE','无法确认固定文件会话的可信存储');
    await api.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  }
  async function ownerLive(s){
    if(!s.fixed)return true;
    if(!Number.isSafeInteger(s.ownerId)||!s.documentId)return false;
    const url=api.runtime.getURL(CHATGPT_FILES_PAGE);
    if(typeof api.runtime.getContexts==='function'){
      const rows=await api.runtime.getContexts({contextTypes:['TAB'],documentIds:[s.documentId],documentUrls:[url]});
      return rows?.length===1&&rows[0].documentId===s.documentId&&rows[0].documentUrl===url&&
        rows[0].tabId===s.ownerId&&rows[0].frameId===0&&!rows[0].incognito;
    }
    const [tab,frame]=await Promise.all([api.tabs.get(s.ownerId),api.webNavigation.getFrame({tabId:s.ownerId,frameId:0})]);
    return tab?.id===s.ownerId&&!tab.incognito&&!tab.pendingUrl&&tab.url===url&&tab.windowId===s.source.windowId&&
      frame?.documentId===s.documentId&&frame.url===url&&frame.documentLifecycle==='active'&&!frame.errorOccurred;
  }
  async function settingsSource(sender){
    const urls=['native-agent/settings.html','native-agent/settings.html#chatgpt-files','native-agent/settings.html#chatgpt-files-controls'].map(path=>api.runtime.getURL(path));
    if(disposed||sender?.id!==api.runtime.id||!urls.includes(sender.url)||
      sender.frameId!==undefined&&sender.frameId!==0||!sender.documentId||sender.tab?.incognito||
      sender.documentLifecycle&&sender.documentLifecycle!=='active')fail('E_FILE_OWNER','只有可信扩展设置页可以修改文件偏好');
    let tabId=sender.tab?.id,frame;
    if(typeof api.runtime.getContexts==='function'){
      // Extension documents are not reliably enumerated by webNavigation.
      // Chrome's live context is authoritative even when MessageSender has no tab.
      const contexts=await api.runtime.getContexts({contextTypes:['TAB'],documentUrls:[sender.url],documentIds:[sender.documentId]});
      const context=Array.isArray(contexts)&&contexts.length===1?contexts[0]:null;
      if(!context||context.contextType!=='TAB'||context.documentId!==sender.documentId||context.documentUrl!==sender.url||
        context.frameId!==0||context.incognito||!Number.isSafeInteger(context.tabId)||context.tabId<0||
        tabId!==undefined&&tabId!==context.tabId)fail('E_FILE_OWNER','设置文档身份已变化');
      tabId=context.tabId;
    }else{
      if(!Number.isSafeInteger(tabId)||tabId<0)fail('E_FILE_OWNER','无法核对设置文档');
      frame=await api.webNavigation.getFrame({tabId,frameId:0});
      if(frame?.documentId!==sender.documentId||frame.url!==sender.url||frame.documentLifecycle!=='active'||
        frame.frameId!==undefined&&frame.frameId!==0||frame.errorOccurred)fail('E_FILE_OWNER','设置文档身份已变化');
    }
    const tab=await api.tabs.get(tabId);
    if(disposed||tab?.id!==tabId||tab.incognito||tab.pendingUrl||tab.url!==sender.url||
      sender.tab&&tab.windowId!==sender.tab.windowId)fail('E_FILE_OWNER','设置文档身份已变化');
    return tab;
  }
  function preferencesChanged(changes,area){
    if(area!=='local'||!Object.hasOwn(changes,CHATGPT_FILES_CONFIG_KEY))return;
    let disabled;
    try{disabled=!normalizeChatGPTFilesPreferences(changes[CHATGPT_FILES_CONFIG_KEY].newValue).enabled;}catch{disabled=true;}
    admissionClosed=disabled;
    if(disabled){pauseAll();enqueue(async()=>{await restore();pauseAll();await persist();}).catch(()=>{});}
  }
  api.storage?.onChanged?.addListener(preferencesChanged);
  async function persist(){
    const rows={},owners={};
    for(const [key,s] of sessions)if(s.project)rows[key]={...s,consumed:[...s.consumed],pollKeys:[...(s.pollKeys||[])]};
    for(const [key,s] of sessions)if(Number.isSafeInteger(key)&&rows[projectKey(s.source)])
      owners[key]={source:s.source,documentId:s.documentId,createdAt:s.createdAt};
    try{
      await api.storage.local.set({[PROJECT_TASKS]:rows,[PROJECT_OWNERS]:owners});
      const fixed=[...sessions.values()].filter(s=>s.fixed).map(s=>({...s,consumed:[...s.consumed],pollKeys:[...(s.pollKeys||[])]}));
      if(fixed.length){
        await fixedStorage();
        if(fixed.filter(s=>!s.completed).length>4||fixed.some(s=>new TextEncoder().encode(JSON.stringify(s)).length>512*1024))
          fail('E_FILES_LIMIT','固定会话存储已达上限，未截断正文');
        await api.storage.session.set({[FIXED_SESSIONS]:{version:1,rows:fixed}});
      }else if(api.storage.session)await api.storage.session.set({[FIXED_SESSIONS]:{version:1,rows:[]}});
    }catch(error){storageFailed=true;pauseAll();throw error;}
  }
  async function restore(){
    if(restored)return;
    for(const [key,value] of Object.entries(await stored(PROJECT_TASKS))){
      if(!value?.project||key!==projectKey(value.source)||sessions.has(key))continue;
      const s={...value,consumed:new Set(value.consumed),pollKeys:new Set(value.pollKeys)};
      // An interrupted registration/read/proposal may not become a new write.
      // A dispatched mutation is reconciled by the existing durable ledger.
      if(['reading','dispatching'].includes(s.project.phase)||s.proposal){s.paused=true;s.message='任务中断，已停止新操作；已派发写入只允许只读核对。';}
      sessions.set(key,s);
    }
    let preferences;try{preferences=await readChatGPTFilesPreferences(api);}catch{pauseAll();throw {code:'E_FILES_DISABLED',message:'文件偏好不可验证'};}
    admissionClosed=!preferences.enabled;
    if(!preferences.enabled)pauseAll();
    for(const [key,value] of Object.entries(await stored(PROJECT_OWNERS))){
      const id=Number(key),project=sessions.get(projectKey(value.source||{}));
      if(!Number.isSafeInteger(id)||!project||!value.documentId||sessions.has(id)||
        value.source?.documentId!==project.source.documentId||value.source.url!==project.source.url)continue;
      sessions.set(id,{...value,workspaces:[],consumed:new Set(),connected:false});
    }
    if(api.storage.session){
      await fixedStorage();
      const fixed=(await api.storage.session.get(FIXED_SESSIONS))[FIXED_SESSIONS];
      if(fixed!==undefined&&(!fixed||fixed.version!==1||!Array.isArray(fixed.rows)||fixed.rows.length>128))
        fail('E_FILE_STORAGE','固定文件会话记录不可验证');
      for(const value of fixed?.rows||[]){
        if(!value?.fixed||!Number.isSafeInteger(value.ownerId)||!value.source||!Array.isArray(value.consumed)||
          !Array.isArray(value.fixed.events)||new TextEncoder().encode(JSON.stringify(value)).length>512*1024)
          fail('E_FILE_STORAGE','固定文件会话记录损坏');
        const s={...value,consumed:new Set(value.consumed),pollKeys:new Set(value.pollKeys||[])};
        if(s.proposal)s.proposal.reviewId=null;
        if(s.fixed.phase==='review-ready'&&!s.paused){s.paused=true;s.pauseReason='review-restored';
          s.message='审阅会话已恢复；请重新核对当前提案，旧确认已失效。';}
        if(['read-in-flight','fill-in-flight','write-reserved'].includes(s.fixed.phase)){
          s.paused=true;s.pauseReason='interrupted';s.message='文件操作中断；结果未知，不会自动重派。';
        }
        sessions.set(s.ownerId,s);
      }
    }
    restored=true;
  }
  async function pageSource(sender){
    if(disposed||sender?.id!==api.runtime.id||sender.frameId!==0||sender.tab?.incognito||
      !Number.isSafeInteger(sender.tab?.id)||!sender.documentId)fail('E_FILE_SOURCE','仅接受原 ChatGPT 主文档');
    const url=new URL(sender.url);
    if(url.origin!=='https://chatgpt.com'||!/^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(url.pathname))fail('E_FILE_SOURCE','请在具体 ChatGPT 对话内发起任务');
    const source={tabId:sender.tab.id,windowId:sender.tab.windowId,documentId:sender.documentId,url:sender.url};
    await assertChatGPTTarget(api,source);return source;
  }
  async function projectAuthority(s,{recovery=false}={}){
    const grants=await stored(PROJECT_GRANTS),g=grants[s.project.grantId];
    if(!g||g.revoked||g.version!==s.project.grantVersion||g.sourceUrl!==s.source.url||g.service!=='https://chatgpt.com'||
      g.scope!=='task-named-existing-text'||!g.operations?.includes(!recovery&&s.project.write?'write':'read')||
      !sameProjectIdentity(g.authority,s.authority))fail('E_PROJECT_GRANT','项目连接已撤销或变化，任务已停止');
    await sourceLive(s);return g;
  }
  const connection=s=>s?.project?{task:s.project.task,name:s.project.workspace.name,workspaceId:s.project.workspace.workspaceId,
    needsConnection:!s.project.grantId&&!s.paused,grantId:s.project.grantId,message:s.message}:null;
  function owner(sender){
    if(disposed||sender?.id!==api.runtime.id||sender.url!==api.runtime.getURL(CHATGPT_FILES_PAGE)||
      sender.frameId!==0||!sender.documentId||!Number.isSafeInteger(sender.tab?.id)||sender.tab.incognito||
      sender.documentLifecycle&&sender.documentLifecycle!=='active')fail('E_FILE_OWNER','只有可信文件审阅页可以操作');
    return sender.tab.id;
  }
  function claim({source,workspaceTab},sender){
    const id=owner(sender);
    if(id!==workspaceTab.id||workspaceTab.windowId!==source.windowId)fail('E_FILE_OWNER','审阅窗口不匹配');
    return enqueue(async()=>{
      await restore();
      const existing=[...sessions.entries()].filter(([,s])=>s.fixed&&!s.completed&&sourceIdentity(s.source)===sourceIdentity(source));
      if(existing.length>1)fail('E_FILE_OWNER','原对话存在多个固定会话，已停止');
      if(existing.length){
        const [previousId,s]=existing[0];
        if(await ownerLive(s)){
          if(previousId===id&&s.documentId===sender.documentId)return;
          fail('E_FILE_OWNER','原对话已有活动的可信文件审阅页');
        }
        sessions.delete(previousId);s.ownerId=id;s.documentId=sender.documentId;
        s.paused=true;s.pauseReason=s.pauseReason||'owner';
        if(s.proposal)s.proposal.reviewId=null;
        s.message='已重新领取原会话；旧确认已失效，未知操作不会重派。';sessions.set(id,s);await persist();return;
      }
      if([...sessions.values()].filter(s=>s.fixed&&!s.completed).length>=4)fail('E_FILES_LIMIT','请先完成已有固定文件会话');
      invalidatedTabs.delete(id);invalidatedTabs.delete(source.tabId);
      sessions.set(id,{source:Object.freeze({...source}),ownerId:id,fixed:{phase:'approved',events:[],active:null},documentId:sender.documentId,createdAt:clock(),
        workspaces:[],connected:false,consumed:new Set(),promptPacket:null,resultPacket:null,proposal:null,observed:false,message:''});
      await persist();
    });
  }
  async function sourceLive(s){
    if(disposed||![...sessions.values()].includes(s)||clock()-s.createdAt>30*60*1000)fail('E_FILE_EXPIRED','文件会话已过期，请从原对话重新打开');
    await assertChatGPTTarget(api,s.source);
    const [tab,frame]=await Promise.all([api.tabs.get(s.source.tabId),api.webNavigation.getFrame({tabId:s.source.tabId,frameId:0})]);
    if(tab.incognito||tab.pendingUrl||tab.url!==s.source.url||tab.windowId!==s.source.windowId)
      fail('E_FILE_SOURCE','原对话或窗口已改变');
    if(frame?.documentLifecycle!=='active'||frame.errorOccurred)fail('E_FILE_SOURCE','原对话文档已经退休');
    if(s.sourceRetired)fail('E_FILE_SOURCE','原对话已退休，不能重新绑定');
    if(s.fixed&&!await ownerLive(s)){
      s.paused=true;s.pauseReason=s.pauseReason||'owner';fail('E_FILE_OWNER','可信文件审阅页已关闭，原会话已暂停');
    }
  }
  const expected=(a,s,options)=>{
    const lifecycle=s?.lifecycle||0;
    return {sessionId:a.sessionId,...(s?{beforeDispatch:()=>{
      if((s.lifecycle||0)!==lifecycle)fail('E_FILE_PAUSED','等待权限时文件会话已失效');
      dispatchGuard(s,options);
    }}:{})};
  };
  const params=(a,path,extra={})=>({workspaceId:a.workspaceId,path,leaseEpoch:a.leaseEpoch,...extra});
  async function discover(s,options){
    await sourceLive(s);
    const state=await files.state();s.connected=!!state.connected;
    if(!state.connected){s.workspaces=[];return state;}
    if(state.devLeaseEpoch!==1)fail('E_NATIVE_UPDATE_REQUIRED','文件请求需要支持租约代次的 Native 服务');
    const data=await files.request('workspaces.list',{},expected(state,s,options));
    if(!Array.isArray(data?.workspaces)||data.workspaces.length>32)fail('E_FILES_PROTOCOL','目录列表无效');
    s.workspaces=data.workspaces.map(row=>{
      if(!WORKSPACE_ID.test(row?.workspaceId||'')||typeof row.name!=='string'||row.name.length>160||
        !['read-only','read-write'].includes(row.access)||row.sourceId!==undefined&&typeof row.sourceId!=='string'||
        row.leaseEpoch!==undefined&&row.leaseEpoch!==''&&!/^[A-Za-z0-9._:-]{16,100}$/.test(row.leaseEpoch))fail('E_FILES_PROTOCOL','目录身份无效');
      return {...row,sourceId:row.sourceId||'',leaseEpoch:row.leaseEpoch||'',sessionId:state.sessionId};
    });
    return state;
  }
  async function authority(s,a,options){
    if(s.project)await projectAuthority(s,options);
    await discover(s,options);
    const current=s.workspaces.find(row=>row.workspaceId===a.workspaceId);
    if(!sameWorkspaceAuthority(a,current))fail('E_FILES_SESSION','目录权限、租约或 Native 连接已改变');
  }
  async function disk(s,a,path,options){
    await authority(s,a,options);
    if(!options?.recovery)await running(s);
    const data=validateWorkspaceRead(await files.request('files.read',params(a,path),expected(a,s,options)),a.workspaceId,path);
    if(await hash(data.content)!==data.sha256)fail('E_FILES_PROTOCOL','读取正文与 SHA 不一致');
    await authority(s,a,options);return data;
  }
  const snapshot=s=>({source:{url:s.source.url},workspaces:s.workspaces.map(({workspaceId,name,access})=>({workspaceId,name,access})),
    connected:s.connected,prompt:s.promptPacket?.text||'',request:s.request?.request||null,
    promptPacketId:s.promptPacket?.id,promptDelivery:s.promptPacket?.delivery,
    resultPacketId:s.resultPacket?.result.resultId,result:s.resultPacket?.result||null,
    comparison:s.resultPacket?.result.operation==='write'?s.comparison||null:null,
    automation:{active:!!s.request&&!s.completed&&!s.paused&&!s.proposal&&!s.unknown,
      phase:s.completed||s.project?.phase==='completed'?'completed':s.paused?'paused':s.proposal?'review':s.project?.phase||s.fixed?.phase||'watching'},
    canApprove:!!(s.allowEdit&&s.connected&&s.proposal?.reviewId&&!s.unknown&&!s.completed&&!s.sourceRetired&&
      (!s.paused||s.fixed?.phase==='review-ready'&&['owner','review-restored'].includes(s.pauseReason))),
    proposal:s.proposal?{path:s.proposal.path,before:s.proposal.before,content:s.proposal.content,
      baseSha256:s.proposal.baseSha256,requestId:s.proposal.requestId,reviewId:s.proposal.reviewId}:null,
    resultText:s.resultPacket?.text||'',resultStatus:s.resultPacket?.result.status||'',
    delivery:s.resultPacket?.delivery||'ready',observed:s.observed,message:s.message,
    projectConnection:connection(s.project?s:sessions.get(projectKey(s.source)))});
  async function answer(s,options){
    await authority(s,s.authority,options);
    const candidate=await readAnswer(api,s.source,s.request.request.requestId,{requireComplete:true,fileRequest:true,requireUserEcho:true,
      protocols:[REQUEST_PROTOCOL,EDIT_PROTOCOL],requestIds:[s.request.request.requestId,s.edit?.context.requestId].filter(Boolean)});
    // The file parser deliberately selects only file blocks. Independently
    // reject a Task in the SAME complete reply rather than letting either
    // consumer execute its own block from a mixed response.
    const identity=await readAnswer(api,s.source,'',{identityOnly:true,requireComplete:true,readUserMessage:true,fileRequest:true});
    if(identity.taskIntentPresent===true)fail('E_CHAT_ROUTE','同一回答包含文件协议和网页 Task；两者均不得执行');
    if(identity.turnKey!==candidate.turnKey||identity.answerKey!==candidate.answerKey)
      fail('E_CHAT_ANSWER','文件回答在协议解析与路由核对之间改变，未执行');
    if(s.fixed){
      const event=s.fixed.events.find(row=>row.key===s.fixed.active);
      if(!event)fail('E_FILE_EVENT','尚未接纳原监听器的完整回答事件');
      await verifyEvent(s,event.message);
      if(event.message.turnKey!==candidate.turnKey||event.message.answerKey!==candidate.answerKey)
        fail('E_CHAT_ANSWER','回答与原监听见证不一致');
    }
    return candidate;
  }
  async function sameAnswer(s,candidate,options){
    const current=await answer(s,options);
    if(current.turnKey!==candidate.turnKey||current.answerKey!==candidate.answerKey||current.blocks[0]!==candidate.blocks[0])
      fail('E_CHAT_ANSWER','完整回答或轮次已改变，请重新审阅');
  }
  function packet(s,request,options,candidate){
    const value=formatFileResult(request,{...options,automatic:s.project?.write===true});
    // Fixed replies pass through the same exact-send witness as preparation.
    // Keep prose in one source paragraph without changing serialized file data
    // or increasing the existing bounded packet's encoded size.
    if(s.fixed)value.text=value.text.replaceAll('\n\n','');
    if(s.project)value.text='项目任务：'+s.project.task+'\n\n'+value.text;
    const terminal=s.project?.entryTurn&&(request.operation==='write'||!s.project.write);
    s.resultPacket={...value,turnKey:candidate.turnKey,delivery:terminal?'inline':'ready'};s.observed=false;
    if(terminal){s.paused=true;s.project.phase='completed';}
    return value;
  }
  function conversationError(s,error){
    if(!s.project?.entryTurn||!s.request)return;
    const proposal=s.proposal||s.unknown?.proposal;
    const request=proposal?{...proposal,operation:'write'}:s.request.request;
    packet(s,request,{error:{code:error.code||'E_FILES_IO',message:error.message||'文件任务失败',
      outcome:s.unknown?'OUTCOME_UNKNOWN':error.outcome}}, {turnKey:s.project.entryTurn});
    s.resultPacket.delivery='inline';s.project.phase='completed';s.paused=true;s.proposal=null;
  }
  const ledger=async()=>{
    const data=(await api.storage.local.get(LEDGER))[LEDGER];if(data===undefined)return {};
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.values(data).some(row=>
      !row||typeof row!=='object'||!['dispatching','unknown','confirmed-pending','readback-matched','confirmed','failed'].includes(row.state)||
      typeof row.requestId!=='string'||typeof row.workspaceId!=='string'||typeof row.path!=='string'||
      row.kind!==undefined&&row.kind!=='fill'))fail('E_FILE_STORAGE','文件副作用账本损坏；不会当作空记录');
    return data;
  };
  async function reserve(s,p){
    const rows=await ledger(),id=p.requestId;
    if(Object.hasOwn(rows,id))fail('E_FILE_REPLAY','这个稳定写入 ID 已处理；只能读回对账');
    if(Object.values(rows).some(row=>row.workspaceId===p.workspaceId&&row.path===p.path&&
      row.kind!=='fill'&&WRITE_FENCES.includes(row.state)))fail('E_FILE_UNKNOWN','此文件仍有未知写入，请先读回核对，不能换 ID 重放');
    if(Object.keys(rows).length>=128)fail('E_FILES_LIMIT','写入记录已达上限；未自动删除未知回执');
    const entry={requestId:id,workspaceId:p.workspaceId,path:p.path,sourceUrl:s.source.url,sourceId:s.authority.sourceId,
      digest:await agentDigest(p),targetSha256:await hash(p.content),state:'dispatching',createdAt:clock(),
      ...(s.project?{taskId:s.project.id,taskVersion:s.project.version,grantId:s.project.grantId,grantVersion:s.project.grantVersion,sourceDocument:s.source.documentId}: {})};
    await api.storage.local.set({[LEDGER]:{...rows,[id]:entry}});return entry;
  }
  async function settle(id,state,facts={}){const rows=await ledger();if(rows[id])await api.storage.local.set({[LEDGER]:{...rows,[id]:{...rows[id],...facts,state}}});}
  const eventKey=message=>JSON.stringify([message.readerEpoch,message.turnKey,message.answerKey,message.userSha256,message.answerSha256]);
  function eventSchema(message){
    const fields=['protocol','action','readerEpoch','turnKey','answerKey','userSha256','answerSha256'];
    if(!message||Object.keys(message).length!==fields.length||fields.some(key=>!Object.hasOwn(message,key))||
      message.protocol!==CHATGPT_PROJECT_PROTOCOL||!['fixed-complete','fixed-status'].includes(message.action)||
      !/^[A-Za-z0-9-]{16,100}$/.test(message.readerEpoch||'')||
      !['turnKey','answerKey'].every(key=>typeof message[key]==='string'&&message[key].length>0&&message[key].length<=2048)||
      !['userSha256','answerSha256'].every(key=>/^[a-f0-9]{64}$/.test(message[key]||'')))fail('E_FILE_SCHEMA','固定发现事件字段无效');
  }
  async function verifyEvent(s,message){
    const page=await readAnswer(api,s.source,'',{identityOnly:true,readUserMessage:true,fileRequest:true,requireComplete:true,eventText:true});
    if(page.taskIntentPresent===true)fail('E_CHAT_ROUTE','同一回答包含文件与Task，未执行');
    if(page.readerEpoch!==message.readerEpoch||page.turnKey!==message.turnKey||page.answerKey!==message.answerKey||
      !page.answerComplete||typeof page.userText!=='string'||typeof page.answerText!=='string'||
      await hash(page.userText)!==message.userSha256||await hash(page.answerText)!==message.answerSha256)
      fail('E_CHAT_ANSWER','完整回答已改变或不是原发送见证');
    return page;
  }
  async function fixedSource(message,sender){
    eventSchema(message);await restore();await enabled();const source=await pageSource(sender);
    const all=[...sessions.values()].filter(s=>s.fixed&&s.request&&sourceIdentity(s.source)===sourceIdentity(source));
    const known=all.filter(s=>s.fixed.events.some(row=>row.key===eventKey(message)));
    const matches=known.length?known:all.filter(s=>!s.completed);
    if(matches.length!==1)fail('E_FILE_OWNER','没有唯一已批准的原对话文件会话');
    const s=matches[0];if(!s.completed)await sourceLive(s);return s;
  }
  function fixedSnapshot(s,message){
    const event=s.fixed.events.find(row=>row.key===eventKey(message));
    if(s.completed)return {status:'completed',automation:{phase:'completed'},message:'旧事件已完成，不会再次读取、写入或回填。'};
    return {...snapshot(s),status:s.paused?'unknown':event?.status||'not-accepted'};
  }
  async function fixedComplete(message,sender,admissionCheck){
    const s=await fixedSource(message,sender),key=eventKey(message);
    if(s.fixed.events.some(row=>row.key===key))return fixedSnapshot(s,message);
    await running(s);
    if(s.completed)fail('E_FILE_COMPLETED','本轮已完成，请批准新请求');
    if(s.proposal||s.unknown||s.fixed.events.length>=2)fail('E_FILE_REVIEW','已有提案或未知操作，不能接纳新事件');
    const page=await verifyEvent(s,message);
    if(page.turnKey===s.baselineTurn)fail('E_CHAT_TURN','原批准之前的轮次不能作为新发送见证');
    if(s.resultPacket){
      if(!s.allowEdit)fail('E_FILES_ACCESS','本轮只读，不允许编辑');
      if(s.resultPacket.result.operation!=='read'||s.resultPacket.delivery==='unknown')
        fail('E_FILE_REPLAY','旧结果尚未完成，不接受新事件');
      const observed=await readAnswer(api,s.source,'',{identityOnly:true,resultId:s.resultPacket.result.resultId});
      if(!observed.resultObserved)fail('E_EDIT_CONTEXT','真实读取结果尚未发送，不能消费编辑上下文');
      s.observed=true;
    }
    const candidate=await readAnswer(api,s.source,s.request.request.requestId,{requireComplete:true,fileRequest:true,requireUserEcho:true,
      protocols:[REQUEST_PROTOCOL,EDIT_PROTOCOL],requestIds:[s.request.request.requestId,s.edit?.context.requestId].filter(Boolean)});
    if(candidate.turnKey!==message.turnKey||candidate.answerKey!==message.answerKey)fail('E_CHAT_ANSWER','发现与解析之间回答改变');
    let protocol;try{protocol=JSON.parse(candidate.blocks[0]).protocol;}catch{fail('E_REQUEST_FORMAT','回答不是完整JSON');}
    if(protocol===REQUEST_PROTOCOL){
      const request=parseFileRequest(candidate.blocks[0],s.request.request);
      if(request.operation!==s.request.request.operation||request.path!==s.request.request.path)fail('E_FILE_SCOPE','模型改变批准范围');
      if(s.consumed.has(request.requestId))fail('E_FILE_REPLAY','本轮读取已处理');
    }else if(protocol===EDIT_PROTOCOL){
      if(!s.allowEdit)fail('E_FILES_ACCESS','本轮只读，不接受编辑');
      if(!s.edit)fail('E_EDIT_CONTEXT','没有真实读取上下文');
      validateEditProposal(parseEditProposal(candidate.blocks[0]),s.edit.context,
        {...s.edit.context,sha256:s.edit.context.baseSha256,content:s.edit.context.baseContent,baseContent:s.edit.context.baseContent});
    }else fail('E_REQUEST_FORMAT','只接受固定文件协议');
    admissionCheck?.();dispatchGuard(s);s.fixed.events.push({key,message:{...message,action:'fixed-complete'},status:'accepted'});
    s.fixed.active=key;s.fixed.phase='accepted';await persist();return fixedSnapshot(s,message);
  }
  async function run(message,sender,internal){
    let s=internal||sessions.get(owner(sender));
    if(!s||!internal&&s.documentId!==sender.documentId)fail('E_FILE_OWNER','没有当前文档的一次性对话绑定');
    if(!internal&&!s.request&&message.action!=='prepare'){
      const project=sessions.get(projectKey(s.source));
      if(project?.project&&project.source.documentId===s.source.documentId)s=project;
    }
    const fields={state:[],prepare:['workspaceId','path','operation','task','allowEdit'],inspect:[],approve:['reviewId'],reconcile:[],fill:['packet','packetId'],observe:[],poll:[],pause:[],
      'connect-project':['workspaceId'],'revoke-project':['grantId']};
    if(!Object.hasOwn(fields,message.action)||Object.keys(message).some(key=>!['protocol','action',...fields[message.action]].includes(key)))
      fail('E_FILE_SCHEMA','不支持的文件操作或字段');
    const generation=stopGeneration;
    await sourceLive(s);
    if(!['state','pause','revoke-project','reconcile','observe'].includes(message.action))await enabled();
    if(message.action==='state'){
      await restore();await discover(s,{recovery:true});
      if(s.fixed?.phase==='review-ready'&&['owner','review-restored'].includes(s.pauseReason)&&s.proposal&&!s.proposal.reviewId){
        await sameAnswer(s,s.proposal.candidate,{recovery:true});
        const before=await disk(s,s.authority,s.proposal.path,{recovery:true});
        if(before.content!==s.proposal.before||before.sha256!==s.proposal.baseSha256)fail('E_FILES_CONFLICT','原文件改变，不能恢复旧提案');
        s.proposal.reviewId=crypto.randomUUID();s.message='请重新审阅并确认当前提案；旧确认已失效。';
      }
      return snapshot(s);
    }
    if(message.action==='connect-project'){
      const task=sessions.get(projectKey(s.source));
      if(!task||task.paused||task.source.documentId!==s.source.documentId||task.project.workspace.workspaceId!==message.workspaceId||task.project.grantId)
        fail('E_PROJECT_GRANT','没有属于当前对话的待连接项目');
      await running(task);await discover(task);
      const a=task.workspaces.find(row=>sameWorkspaceAuthority(row,task.project.workspace));
      if(!a)fail('E_FILES_SESSION','待连接项目的权限或身份已变化');
      const grants=await stored(PROJECT_GRANTS),id=crypto.randomUUID();
      if(Object.keys(grants).length>=128)fail('E_FILES_LIMIT','项目连接记录已达上限');
      grants[id]={id,version:1,service:'https://chatgpt.com',sourceUrl:task.source.url,authority:{...a},createdAt:clock(),
        scope:'task-named-existing-text',operations:a.access==='read-write'?['read','write']:['read']};
      await api.storage.local.set({[PROJECT_GRANTS]:grants});
      task.project.grantId=id;task.project.grantVersion=1;task.authority={...a};await persist();
      try{await beginProject(task);}
      catch(error){
        task.paused=true;task.message=error.message;conversationError(task,error);await persist();throw error;
      }
      return snapshot(task);
    }
    if(message.action==='revoke-project'){
      const grants=await stored(PROJECT_GRANTS),grant=grants[message.grantId];
      if(!grant||grant.sourceUrl!==s.source.url)fail('E_PROJECT_GRANT','连接不属于当前对话');
      grants[grant.id]={...grant,revoked:true,version:grant.version+1};
      await api.storage.local.set({[PROJECT_GRANTS]:grants});
      for(const task of sessions.values())if(task.project?.grantId===grant.id){task.paused=true;task.message='项目连接已撤销。';}
      await persist();return snapshot(s);
    }
    if(message.action==='pause'){s.paused=true;s.pauseReason='stop';s.message='自动处理已暂停；重新批准精确范围后才能继续。';return snapshot(s);}
    if(message.action==='prepare'){
      if(message.allowEdit!==undefined&&typeof message.allowEdit!=='boolean'||message.allowEdit===true&&message.operation!=='read')
        fail('E_FILE_SCHEMA','编辑选择必须由可信页面明确绑定到读取请求');
      if(s.promptPacket?.delivery==='unknown'||s.resultPacket?.delivery==='unknown'||
        s.promptPacket?.attempted&&s.promptPacket.delivery!=='filled')
        fail('E_FILE_DELIVERY_UNKNOWN','原草稿回填结果未知；请核对原对话，不会换身份重放');
      const records=Object.values(await ledger());
      if(records.some(row=>row.kind==='fill'&&row.sourceUrl===s.source.url&&row.state!=='confirmed'))
        fail('E_FILE_DELIVERY_UNKNOWN','原对话有持久回填屏障，不能换身份补填');
      if(records.some(row=>row.kind!=='fill'&&row.workspaceId===message.workspaceId&&row.path===message.path&&WRITE_FENCES.includes(row.state)))
        fail('E_FILE_UNKNOWN','此文件仍有未知写入，不允许换身份');
      const request=createFileRequestContext({workspaceId:message.workspaceId,bindingId:crypto.randomUUID(),
        path:message.path,operation:message.operation,task:message.task||''});
      await discover(s,{recovery:true});const a=s.workspaces.find(row=>row.workspaceId===message.workspaceId);
      if(!a)fail('E_FILES_ACCESS','请选择 Native 当前已授权的目录');
      if(s.unknown)fail('E_FILE_UNKNOWN','原写入结果未知，请先对账');
      const page=await readAnswer(api,s.source,'',{identityOnly:true});
      await enabled();if(generation!==stopGeneration)fail('E_FILE_PAUSED','任务已停止');
      s.authority=Object.freeze({...a});s.request=request;s.edit=null;s.proposal=null;s.resultPacket=null;
      s.paused=false;s.pauseReason=null;s.completed=false;s.observed=false;s.allowEdit=message.allowEdit===true;
      assertPending(activeTicket);stoppedSources.delete(sourceIdentity(s.source));
      if(s.fixed)s.fixed={phase:'approved',events:[],active:null};
      s.comparison=null;s.comparisonRequestId=null;s.pollKeys=new Set();s.baselineTurn=page.turnKey;
      // Only the trusted choice grants proposal staging. The model echoes the
      // same six-field request, with no permission or dispatch decisions.
      const prompt=[
        '请将下方 JSON 原样放入唯一的 opendesk-request 代码块，所有字段和值保持不变，不添加解释、不调用工具。文件操作由现有 OpenDesk 扩展执行；不要声称已经读取。',
        s.allowEdit?'本轮先读取文件。收到真实结果后，仅使用其中的 editProposal 提出完整新正文；写入仍须我在可信页面确认。':'本轮只读，结果回填后结束，不生成修改提案。',
        ...(message.task?.trim()?['任务说明（JSON 字符串）：'+promptJSON(message.task.trim())+'。']:[]),
        '请保留 JSON 转义，将下面 JSON 原样放入回答代码块：',promptJSON(request.request)
      ].join(''); // User-message Markdown rendering must not alter the send witness.
      s.promptPacket={text:prompt,id:crypto.randomUUID(),turnKey:page.turnKey,delivery:'ready'};
      s.message='已选择精确目录和路径；尚未读取文件。请求只回当前对话。';return snapshot(s);
    }
    if(!s.request)fail('E_REQUEST_CONTEXT','请先选择目录并批准具体读取范围');
    if(s.completed&&['inspect','approve','fill'].includes(message.action))fail('E_FILE_COMPLETED','本轮已完成；请批准新请求，不会重放旧操作');
    if(s.paused&&['inspect','approve','fill'].includes(message.action)&&
      !(message.action==='approve'&&['owner','review-restored'].includes(s.pauseReason)&&s.fixed?.phase==='review-ready'&&s.proposal?.reviewId))
      fail('E_FILE_PAUSED','处理已暂停，请重新批准当前范围');
    if(message.action==='poll'){
      if(s.completed||s.paused||s.proposal||s.unknown)return snapshot(s);
      if(s.fixed){
        try{
          if(s.fixed.phase==='accepted')await run({action:'inspect'},sender,s);
          if(s.fixed.phase==='result-ready'&&s.resultPacket?.delivery==='ready')
            await run({action:'fill',packet:'result',packetId:s.resultPacket.result.resultId},sender,s);
          return snapshot(s);
        }catch(error){s.paused=true;s.pauseReason='failure';s.message=error.message;
          if(['E_CHAT_STREAMING','E_CHAT_PENDING','E_CHAT_INCOMPLETE'].includes(error.code)&&s.fixed.phase==='read-in-flight')
            fail('E_FILE_READ_CHANGED','读取后回答改变，已暂停且不会重新读取');
          throw error;}
      }
      let key;
      const readWasConsumed=s.consumed.has(s.request.request.requestId);
      try{
        const p=s.resultPacket;
        if(p?.delivery==='ready')return await run({action:'fill',packet:'result',packetId:p.result.resultId},sender,s);
        if(p?.delivery==='unknown'){s.paused=true;return snapshot(s);}
        const page=await readAnswer(api,s.source,'',{identityOnly:true,fileRequest:true,resultId:p?.result.resultId});
        if(p&&page.resultObserved===true){
          s.observed=true;
          if(p.result.operation!=='read'||s.project&&!s.project.write){
            s.paused=true;if(s.project)s.project.phase='completed';
            s.message='原对话已收到本轮结果。';return snapshot(s);
          }
        }
        if(!page.answerComplete||!page.answerKey||page.turnKey===s.baselineTurn)return snapshot(s);
        // Never consume a reply to an unsent local result, or repeatedly act on
        // the same assistant revision. Changing revision does not bypass IDs.
        if(p&&!s.observed)return snapshot(s);
        key=JSON.stringify([s.request.request.requestId,page.turnKey,page.answerKey]);
        if(s.pollKeys.has(key))return snapshot(s);
        if(s.pollKeys.size>=128)fail('E_FILES_LIMIT','回答变化过多，请重新批准本次范围');
        s.pollKeys.add(key);
        await run({action:'inspect'},sender,s);
        const next=s.resultPacket;
        if(!s.proposal&&next?.delivery==='ready')await run({action:'fill',packet:'result',packetId:next.result.resultId},sender,s);
        return snapshot(s);
      }catch(error){
        // Completion markers may settle between the cheap probe and full read.
        if(['E_CHAT_STREAMING','E_CHAT_PENDING','E_CHAT_INCOMPLETE'].includes(error.code)){
          if(!readWasConsumed&&s.consumed.has(s.request.request.requestId)){
            s.paused=true;
            fail('E_FILE_READ_CHANGED','读取已处理，但回答随后变化；已暂停，未回填，也不会重新读取。请核对后重新批准新轮次。');
          }
          if(key)s.pollKeys.delete(key);return snapshot(s);
        }
        s.paused=true;throw error;
      }
    }
    if(message.action==='inspect'){
      if(s.fixed&&s.fixed.phase!=='accepted')fail('E_FILE_EVENT','只能检查原监听器已接纳的本轮事件');
      if(s.proposal)fail('E_FILE_REVIEW','已有待确认提案，不能静默替换');
      const candidate=await answer(s);let protocol;
      try{protocol=JSON.parse(candidate.blocks[0]).protocol;}catch{fail('E_REQUEST_FORMAT','回答不是完整 JSON');}
      if(protocol===REQUEST_PROTOCOL){
        const request=parseFileRequest(candidate.blocks[0],s.request.request);
        if(request.operation!==s.request.request.operation||request.path!==s.request.request.path)fail('E_FILE_SCOPE','模型改变了批准的路径或操作');
        if(s.consumed.has(request.requestId))fail('E_FILE_REPLAY','本轮读取已处理，请使用已有结果');
        await sameAnswer(s,candidate);s.consumed.add(request.requestId);
        if(s.fixed){s.fixed.phase='read-in-flight';s.fixed.events.find(row=>row.key===s.fixed.active).status='in-flight';await persist();}
        let data;
        if(request.operation==='read'){
          data=await disk(s,s.authority,request.path);
          const record={...data,baseContent:data.content};
          s.edit=s.allowEdit?createEditContext(record,{bindingId:request.bindingId,authority:s.authority,source:s.source}):null;
        }else{
          data=await files.request('files.list',params(s.authority,request.path),expected(s.authority,s));
          validateWorkspaceTreeListing(data,request.workspaceId,request.path);await authority(s,s.authority);
        }
        await sameAnswer(s,candidate);
        const edit=s.edit?{protocol:EDIT_PROTOCOL,requestId:s.edit.context.requestId,bindingId:request.bindingId,
          workspaceId:request.workspaceId,path:request.path,baseSha256:data.sha256,content:data.content}:undefined;
        packet(s,request,{data,edit},candidate);s.message='Native 读取成功，结果尚未发送。';
        if(s.fixed){s.fixed.phase='result-ready';await persist();}
      }else if(protocol===EDIT_PROTOCOL){
        if(!s.project&&!s.allowEdit)fail('E_FILES_ACCESS','本轮只读，不允许生成或执行编辑提案');
        if(!s.edit)fail('E_EDIT_CONTEXT','请先成功读取当前文件');
        const p=validateEditProposal(parseEditProposal(candidate.blocks[0]),s.edit.context,
          {...s.edit.context,sha256:s.edit.context.baseSha256,content:s.edit.context.baseContent,baseContent:s.edit.context.baseContent});
        if(s.consumed.has(p.requestId))fail('E_FILE_REPLAY','这份写入提案已处理');
        if(s.authority.access!=='read-write')fail('E_FILES_ACCESS','当前目录没有写入权限');
        s.proposal={...p,candidate,reviewId:crypto.randomUUID()};s.message='仅生成审阅提案，尚未写入。请核对原文、新文与 SHA。';
        if(s.fixed){s.fixed.phase='review-ready';s.fixed.events.find(row=>row.key===s.fixed.active).status='completed';await persist();}
        if(s.project){
          if(!s.project.write)fail('E_PROJECT_REVIEW','本次用户任务只要求读取，不允许写入');
          assertOrdinaryProjectEdit({path:p.path,before:p.before,content:p.content});
          await projectAuthority(s);await persist();
          return run({action:'approve',reviewId:s.proposal.reviewId},sender,s);
        }
      }else fail('E_REQUEST_FORMAT','只接受固定文件请求或修改提案');
      return snapshot(s);
    }
    if(message.action==='approve'){
      if(!s.project&&!s.allowEdit)fail('E_FILES_ACCESS','本轮只读，不允许写入');
      const p=s.proposal;if(!p||s.consumed.has(p.requestId))fail('E_FILE_REPLAY','没有可确认的新提案');
      if(message.reviewId!==p.reviewId)fail('E_FILE_REVIEW','确认不属于当前显示的具体提案，请重新核对');
      if(['owner','review-restored'].includes(s.pauseReason)){s.paused=false;s.pauseReason=null;}
      if(s.authority.access!=='read-write')fail('E_FILES_ACCESS','目录没有写入权限');
      await sameAnswer(s,p.candidate);
      const before=await disk(s,s.authority,p.path);
      if(before.sha256!==p.baseSha256||before.content!==p.before)fail('E_FILES_CONFLICT','原文件已变化，未写入');
      await sameAnswer(s,p.candidate);
      // Keep comparison out of the model-facing result packet. Each value is
      // tied to this proposal; a missing readback stays missing on failure.
      s.comparison={before:before.content,proposed:p.content};
      s.comparisonRequestId=p.requestId;
      const entry=await reserve(s,p);s.consumed.add(p.requestId);s.unknown={proposal:p,entry};
      if(s.project){s.project.phase='dispatching';await persist();}
      if(s.fixed){s.fixed.phase='write-reserved';await persist();}
      const request={...p,operation:'write'};let receipt;
      try{
        await sameAnswer(s,p.candidate);
        await running(s);
        receipt=await files.request('files.write',params(s.authority,p.path,{content:p.content,expectedSha256:p.baseSha256}),
          {...expected(s.authority,s),requestId:p.requestId});
        verifyWorkspaceWriteReceipt(receipt,{workspaceId:p.workspaceId,path:p.path,sha256:entry.targetSha256});
        const after=await disk(s,s.authority,p.path,{recovery:true});
        s.comparison.readBack=after.content;
        if(!verifyWorkspaceWriteReadBack(after,{workspaceId:p.workspaceId,path:p.path,content:p.content,sha256:entry.targetSha256}))
          fail('E_FILE_READBACK','写入回执后读回不一致','OUTCOME_UNKNOWN');
        await settle(p.requestId,'confirmed-pending',{receipt,readBackVerified:true});
        if(s.project)s.project.phase='confirmed';if(s.fixed)s.fixed.phase='result-ready';
        packet(s,request,{data:{...receipt,readBackVerified:true}},p.candidate);s.message='已取得真实写入回执并独立读回核对 SHA。';
        s.unknown=null;
        s.proposal=null;await persist();await settle(p.requestId,'confirmed');
      }catch(error){
        const unknown=receipt||error.outcome==='OUTCOME_UNKNOWN'||!error.outcome;
        await settle(p.requestId,unknown?'unknown':'failed');if(!unknown)s.unknown=null;
        packet(s,request,{error:{...error,outcome:unknown?'OUTCOME_UNKNOWN':error.outcome}},p.candidate);
        s.message=unknown?'写入结果未知；只允许读回对账，不会重试。':'写入未完成，原提案不会再次执行。';
      }
      s.proposal=null;return snapshot(s);
    }
    if(message.action==='reconcile'){
      const pending=s.unknown;
      const rows=await ledger();
      const entry=pending?.entry||Object.values(rows).find(row=>row.workspaceId===s.authority.workspaceId&&row.path===s.request.request.path&&
        row.kind!=='fill'&&row.sourceId===s.authority.sourceId&&row.sourceUrl===s.source.url&&WRITE_FENCES.includes(row.state));
      if(!entry)fail('E_FILE_UNKNOWN','没有当前文件的未知写入');
      // Reconnect may legitimately rotate the Native session or lease. Acquire
      // current read authority for the SAME directory identity, never revive a
      // write proposal or dispatch the old mutation on that new authority.
      if(s.project){await projectAuthority(s,{recovery:true});s.paused=true;}
      await discover(s,{recovery:true});
      const current=s.workspaces.find(row=>row.workspaceId===entry.workspaceId&&row.sourceId===entry.sourceId);
      if(!current||entry.sourceUrl!==s.source.url)fail('E_FILES_ACCESS','原目录已撤权或身份已改变，不能对账');
      s.authority=Object.freeze({...current});s.edit=null;s.proposal=null;
      const read=await disk(s,s.authority,entry.path,{recovery:true}),matches=read.sha256===entry.targetSha256;
      s.comparison={...(s.comparisonRequestId===entry.requestId?s.comparison:{}),readBack:read.content};
      s.comparisonRequestId=entry.requestId;
      // Readback proves current bytes, never attribution or an original ACK.
      const candidate=await readAnswer(api,s.source,'',{identityOnly:true});
      packet(s,{...s.request.request,requestId:entry.requestId,operation:'write',path:entry.path},
        {error:{code:'E_FILE_RECONCILED',message:matches?'当前内容已匹配目标 SHA；原回执仍未知':'当前内容不匹配，未重放写入',outcome:'OUTCOME_UNKNOWN'},
          data:undefined},candidate);
      s.resultPacket.text+='\n\n'+JSON.stringify({readBackVerified:matches,currentSha256:read.sha256,targetSha256:entry.targetSha256,writeReceiptObserved:false});
      if(matches)await settle(entry.requestId,'readback-matched');
      s.message=matches?'读回匹配；仅证明当前文件内容，不冒称收到原写入回执。':'读回不匹配；原结果仍未知，禁止自动重放。';return snapshot(s);
    }
    if(message.action==='fill'){
      const p=message.packet==='prompt'?s.promptPacket:message.packet==='result'?s.resultPacket:null;
      if(!p)fail('E_FILE_SCHEMA','没有可回填内容');
      if(message.packetId!==(p.id||p.result.resultId))fail('E_FILE_PACKET','草稿标识已变化，未回填其他内容');
      if(p.delivery!=='ready')fail('E_FILE_REPLAY','已回填或结果未知，请检查原对话，禁止重复插入');
      await authority(s,s.authority);
      if(s.fixed&&message.packet==='result')await answer(s);
      const fillId='fill:'+(p.id||p.result.resultId),rows=s.fixed?await ledger():null;
      if(rows){
        const previous=rows[fillId];
        if(p.attempted&&!previous)fail('E_FILE_DELIVERY_UNKNOWN','原草稿回填记录缺失，不能将重试当作首次填入');
        // Only a recorded NOT_DISPATCHED acknowledgement permits another
        // explicit attempt of this SAME prompt in the SAME source document.
        // Historical unknown entries have no such proof and remain fenced.
        if(previous&&!(p===s.promptPacket&&previous.kind==='fill'&&previous.requestId===fillId&&
          previous.state==='failed'&&previous.failure?.outcome==='NOT_DISPATCHED'&&
          previous.workspaceId===s.authority.workspaceId&&previous.path===s.request.request.path&&
          previous.sourceUrl===s.source.url&&previous.sourceDocument===s.source.documentId))
          fail('E_FILE_DELIVERY_UNKNOWN','此结果已有回填记录，不能重派');
        if(!previous&&Object.keys(rows).length>=128)fail('E_FILES_LIMIT','文件副作用记录已达上限');
        await api.storage.local.set({[LEDGER]:{...rows,[fillId]:{...previous,kind:'fill',requestId:fillId,workspaceId:s.authority.workspaceId,
          path:s.request.request.path,sourceUrl:s.source.url,sourceDocument:s.source.documentId,state:'unknown',
          createdAt:previous?.createdAt??clock()}}});
      }
      p.attempted=true;p.delivery='unknown';if(s.fixed)s.fixed.phase='fill-in-flight';await persist();
      try{
        await running(s);
        await fillComposer(api,s.source,p.text,{operationId:p.id||p.result.resultId,turnKey:p.turnKey,
          beforeInsert:async()=>{await authority(s,s.authority);await running(s);},beforeDispatch:()=>dispatchGuard(s)});
      }catch(error){
        if(s.fixed&&p===s.promptPacket&&error?.outcome==='NOT_DISPATCHED'){
          // Persist the trusted failure proof before making the packet ready.
          // Neither an empty composer nor an error code alone proves this.
          await settle(fillId,'failed',{failure:{outcome:'NOT_DISPATCHED',code:error.code||'E_CHAT_COMPOSER',at:clock()}});
          p.delivery='ready';s.fixed.phase='approved';
          s.message=`${error.code||'E_CHAT_COMPOSER'}：提示词未插入（未派发）。${error.message||''} 恢复原对话输入框后，可再次点击“填入原对话草稿”；沿用本次请求，不要重新准备。`;
          await persist();return snapshot(s);
        }
        throw error;
      }
      p.delivery='filled';s.message='已回填原对话草稿，请在 ChatGPT 点击发送。尚不能认定对话已收到。';
      if(!s.project&&p===s.resultPacket&&(p.result.operation!=='read'||!s.allowEdit)){
        if(p.result.status==='success'){
          s.completed=true;
          s.message=p.result.operation==='write'?'本轮修改已完成：保存与独立读回均已确认，回执已填入草稿。':'本轮只读已完成：真实结果已填入草稿。';
          s.message+='尚未发送给 ChatGPT；需要模型查看时可自行发送。';
        }else{s.paused=true;s.message='本轮未成功完成；结果已填入草稿，自动处理已停止。';}
      }
      if(s.fixed){
        s.fixed.phase=s.completed?'completed':p===s.promptPacket?'approved':'read-result-filled';
        if(p===s.resultPacket)s.fixed.events.find(row=>row.key===s.fixed.active).status='completed';
        await persist();await settle(fillId,'confirmed');
      }
      return snapshot(s);
    }
    if(message.action==='observe'){
      if(!s.resultPacket)fail('E_REQUEST_CONTEXT','没有本轮结果');
      const page=await readAnswer(api,s.source,'',{identityOnly:true,resultId:s.resultPacket.result.resultId});
      s.observed=page.resultObserved===true;
      s.message=s.completed||s.project?.phase==='completed'?
        '本轮已结束，无需再发送。本次可选检查：'+(s.observed?'原对话用户消息已包含结果 ID。':'尚未观察到结果发送。'):
        s.observed?'原对话用户消息已包含本轮结果 ID。':'原对话尚未观察到本轮结果，请检查草稿并发送。';
      return snapshot(s);
    }
  }
  async function beginProject(s){
    await projectAuthority(s);await running(s);
    s.authority={...s.project.workspace};s.pollKeys=new Set();
    const page=await readAnswer(api,s.source,'',{identityOnly:true,readUserMessage:true});
    if(page.taskIntentPresent===true)fail('E_CHAT_ROUTE','当前回答包含 Task 意图，未读取文件');
    if(s.project.entryTurn&&(page.turnKey!==s.project.entryTurn||page.userText!==s.project.task||!page.answerComplete))
      fail('E_CHAT_TURN','发起任务的用户轮次已改变，未读取文件');
    if(s.project.entryTurn&&(!s.project.entryAnswerKey||page.answerKey!==s.project.entryAnswerKey))
      fail('E_CHAT_ANSWER','发起任务的回答未绑定或已改变，未读取文件');
    s.baselineTurn=page.turnKey;
    s.request=createFileRequestContext({workspaceId:s.authority.workspaceId,bindingId:crypto.randomUUID(),path:s.project.path,task:s.project.task});
    s.project.phase='reading';await persist();
    const data=await disk(s,s.authority,s.project.path);s.consumed.add(s.request.request.requestId);
    s.edit=s.project.write?createEditContext({...data,baseContent:data.content},{bindingId:s.request.request.bindingId,authority:s.authority,source:s.source}):null;
    const edit=s.edit?{protocol:EDIT_PROTOCOL,requestId:s.edit.context.requestId,bindingId:s.request.request.bindingId,
      workspaceId:data.workspaceId,path:data.path,baseSha256:data.sha256,content:data.content}:undefined;
    packet(s,s.request.request,{data,edit},page);
    if(s.project.entryTurn&&!s.project.write){s.message='Native 读取完成，结果已保留在当前对话工具中。';await persist();return;}
    s.project.phase='watching';s.message='已按项目连接读取；请发送原对话草稿，普通修改将自动核验并保存。';
    await persist();await run({action:'fill',packet:'result',packetId:s.resultPacket.result.resultId},null,s);await persist();
  }
  async function startProject(message,sender,entryTurn,ticket,entryAnswerKey){
    if(Object.keys(message).some(key=>!['task'].includes(key)))fail('E_FILE_SCHEMA','任务不接受网页授权字段');
    const generation=stopGeneration;
    await restore();await enabled();const source=await pageSource(sender),key=projectKey(source),previous=sessions.get(key);
    assertGeneration(generation);assertPending(ticket);
    invalidatedTabs.delete(source.tabId);stoppedSources.delete(sourceIdentity(source));
    const s={source,createdAt:clock(),workspaces:[],connected:false,consumed:new Set(),pollKeys:new Set(),observed:false,message:''};
    sessions.set(key,s);
    try{
      await discover(s);
      const grants=await stored(PROJECT_GRANTS);
      const matching=Object.values(grants).filter(g=>!g.revoked&&g.sourceUrl===source.url&&g.service==='https://chatgpt.com'&&
        g.scope==='task-named-existing-text'&&g.operations?.includes('read')&&
        s.workspaces.some(a=>sameProjectIdentity(g.authority,a)));
      const mapping=matching.length===1?{workspaceId:matching[0].authority.workspaceId,sourceId:matching[0].authority.sourceId}:null;
      const resolved=resolveProjectTask({task:message.task,workspaces:s.workspaces,mapping});
      if(Object.values(await ledger()).some(row=>row.kind!=='fill'&&row.workspaceId===resolved.workspace.workspaceId&&row.path===resolved.path&&WRITE_FENCES.includes(row.state)))
        fail('E_FILE_UNKNOWN','此文件仍有未知写入，只允许只读核对，不会换 ID 重试');
      if(previous?.project&&previous.request&&!previous.paused)fail('E_PROJECT_BUSY','请先发送并核对上一项任务结果，或停止该任务');
      // Consent covers a stable directory and recipient. A new explicit task
      // captures CURRENT Native authority; no old proposal survives reconnect.
      const grant=matching.find(g=>sameProjectIdentity(g.authority,resolved.workspace)&&g.operations.includes(resolved.write?'write':'read'));
      s.project={id:crypto.randomUUID(),version:1,...(entryTurn?{entryTurn,entryAnswerKey,entrySource:{...source}}:{}),
        entryTurns:[...(previous?.source.documentId===source.documentId&&previous.source.url===source.url?previous.project?.entryTurns||[]:[]),...(entryTurn?[entryTurn]:[])],task:entryTurn?message.task:resolved.task,path:resolved.path,write:resolved.write,workspace:{...resolved.workspace},
        phase:'planned',...(grant?{grantId:grant.id,grantVersion:grant.version}:{})};
      s.authority={...resolved.workspace};s.message=grant?'正在处理项目任务':'当前对话没有有效的项目连接；审阅并连接后才能继续，取消不会读写文件。';
      await running(s);await persist();if(grant)await beginProject(s);
      return {...snapshot(s),needsConnection:!grant};
    }catch(error){
      if(!s.project){
        const stoppedPrevious=previous&&ticket?.stopped&&ticket.source===sourceIdentity(previous.source);
        if(stoppedPrevious){previous.paused=true;previous.message='停止请求已接收；已派发写入须以原真实回执结算，不会重放。';}
        if(previous)sessions.set(key,previous);else sessions.delete(key);
        // The prior task was hidden from Stop by this tentative session. Save
        // its exact-source stop fence before the next queued wake can run.
        if(stoppedPrevious)await persist();
      }else{s.paused=true;s.message=error.message;conversationError(s,error);await persist();}
      throw error;
    }
  }
  async function tick(){
    await restore();
    try{await enabled();}catch(error){pauseAll();await persist();throw error;}
    for(const s of sessions.values())if(s.project?.grantId&&s.request&&!s.paused&&!s.unknown){
      try{await authority(s,s.authority);await run({action:'poll'},null,s);}catch(error){s.paused=true;s.message=error.message;conversationError(s,error);}
    }
    for(const s of sessions.values())if(s.fixed&&s.request&&!s.paused&&!s.completed&&['accepted','result-ready'].includes(s.fixed.phase)){
      try{await sourceLive(s);await run({action:'poll'},null,s);}catch(error){s.paused=true;s.pauseReason=s.pauseReason||'failure';s.message=error.message;}
    }
    await persist();
  }
  // An optional manual review source needs no prior project task, but it is
  // bound to a live same-window official ChatGPT main document. The existing
  // one-use review gate independently revalidates the selected source.
  async function activeReviewSources(windowId){
    if(typeof api.tabs.query!=='function')return [];
    const rows=await api.tabs.query({windowId,url:'https://chatgpt.com/*'});
    if(!Array.isArray(rows))fail('E_FILE_SOURCE','无法验证 ChatGPT 页签');
    const selected=[];
    for(const tab of rows.slice(0,32)){
      if(!Number.isSafeInteger(tab?.id)||tab.id<0||tab.incognito||tab.pendingUrl||
        tab.windowId!==windowId||typeof tab.url!=='string')continue;
      let parsed;
      try{parsed=new URL(tab.url);}catch{continue;}
      if(parsed.origin!=='https://chatgpt.com'||parsed.username||parsed.password||
        !/^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(parsed.pathname))continue;
      const frame=await api.webNavigation.getFrame({tabId:tab.id,frameId:0}).catch(()=>null);
      if(frame?.url!==tab.url||frame?.documentLifecycle!=='active'||frame.errorOccurred||
        typeof frame.documentId!=='string'||!frame.documentId||
        frame.frameId!==undefined&&frame.frameId!==0)continue;
      selected.push({sourceTabId:tab.id,sourceDocumentId:frame.documentId,
        sourceUrl:tab.url,sourceWindowId:windowId});
    }
    return selected;
  }
  // Trusted settings is a first-party extension TAB, not a sandbox tool or
  // forged page sender. Its selected identity must match the exact persisted
  // original source document and project ID before any projection or Stop.
  function selectedProject(message,s=sessions.get(projectKey({tabId:message?.sourceTabId}))){
    if(!Number.isSafeInteger(message?.sourceTabId)||message.sourceTabId<0||
      typeof message.sourceDocumentId!=='string'||!message.sourceDocumentId||
      typeof message.projectId!=='string'||!message.projectId)fail('E_FILE_SCHEMA','请选择已列出的原文件任务');
    if(!s?.project||s.project.id!==message.projectId||
      s.source.documentId!==message.sourceDocumentId||
      s.source.tabId!==message.sourceTabId)fail('E_PROJECT_SOURCE','原文件任务身份已改变，重新读取任务列表');
    return s;
  }
  const taskPhase=s=>s.completed||s.project?.phase==='completed'?'completed':
    s.paused?'paused':s.proposal?'review':s.project?.phase||'watching';
  const taskRef=s=>({sourceTabId:s.source.tabId,sourceDocumentId:s.source.documentId,
    projectId:s.project.id,sourceUrl:s.source.url,phase:taskPhase(s)});
  const concealed=s=>({source:{url:s.source.url},automation:{phase:taskPhase(s),active:false},
    message:'当前仅显示任务摘要；授权、源文档或会话已失效，文件正文与历史回执不再披露。',
    projectConnection:{name:s.project?.workspace?.name||''}});
  async function trustedProjection(s){
    // No Native read or wake on a status query. In particular, revocation
    // must never return cached resultText, comparison, prompt or file bytes.
    try{
      const current=await readChatGPTFilesPreferences(api);
      if(!current.enabled||!s.project.grantId)return concealed(s);
      await projectAuthority(s);
      // Native authority is metadata, not a file read or a wake. A stable
      // disclosure grant alone cannot authorize cached bytes after reconnect.
      const state=await files.state();
      if(!state.connected||state.devLeaseEpoch!==1||state.sessionId!==s.authority?.sessionId)return concealed(s);
      const data=await files.request('workspaces.list',{},expected(state));
      const matches=Array.isArray(data?.workspaces)?data.workspaces.filter(row=>
        sameWorkspaceAuthority(s.authority,{...row,sourceId:row.sourceId||'',leaseEpoch:row.leaseEpoch||'',sessionId:state.sessionId})):[];
      if(matches.length!==1)return concealed(s);
      await enabled();await projectAuthority(s);
      // Source/grant validation also awaits Chrome. Native can disconnect in
      // that window, so its final observation must follow those checks.
      const currentState=await files.state();
      if(!currentState.connected||currentState.sessionId!==state.sessionId||currentState.devLeaseEpoch!==1)return concealed(s);
      return snapshot(s);
    }catch{return concealed(s);}
  }
  function stopProjectSource(s){
    const identity=sourceIdentity(s.source);
    stoppedSources.add(identity);
    for(const ticket of pendingOperations)if(ticket.source===identity)ticket.stopped=true;
    for(const item of sessions.values())if(sourceIdentity(item.source)===identity){
      item.lifecycle=(item.lifecycle||0)+1;item.paused=true;item.pauseReason='stop';
    }
  }
  return {claim,
    projectList(sender){return enqueue(async()=>{
      const settingTab=await settingsSource(sender);await restore();
      // A list is metadata only, even after grant revocation. It never emits
      // task prompts, file paths, Native authority or cached file contents.
      return {tasks:[...sessions.values()].filter(s=>s.project).map(taskRef),
        sources:await activeReviewSources(settingTab.windowId)};
    });},
    reviewManualSource(message,sender){return enqueue(async()=>{
      const settingTab=await settingsSource(sender);
      if(!Number.isSafeInteger(message.sourceTabId)||message.sourceTabId<0||
        typeof message.sourceDocumentId!=='string'||!message.sourceDocumentId)
        fail('E_FILE_SCHEMA','请从当前可信页面选择有效原对话');
      const sources=await activeReviewSources(settingTab.windowId);
      const row=sources.find(row=>row.sourceTabId===message.sourceTabId&&
        row.sourceDocumentId===message.sourceDocumentId);
      if(!row)fail('E_FILE_SOURCE','原对话已关闭、切换或不属于当前窗口');
      return {tabId:row.sourceTabId,documentId:row.sourceDocumentId,
        url:row.sourceUrl,windowId:row.sourceWindowId};
    });},
    projectStatusTrusted(message,sender){return enqueue(async()=>{
      await settingsSource(sender);await restore();
      const s=selectedProject(message);
      return {...taskRef(s),...await trustedProjection(s)};
    });},
    projectReviewTrusted(message,sender){return enqueue(async()=>{
      await settingsSource(sender);await restore();
      const s=selectedProject(message);
      await sourceLive(s); // Reverify the actual ChatGPT tab/document/URL.
      return {...s.source};
    });},
    projectStopTrusted(message,sender){
      return (async()=>{
        await settingsSource(sender);
        // Fence an already live request before waiting behind its queued
        // write/read; the sent task identity can never select another tab.
        const key=projectKey({tabId:message?.sourceTabId});
        let present=sessions.get(key);
        if(present?.project){selectedProject(message,present);stopProjectSource(present);}
        else{
          // Restore and tentative start can hide the old task from sessions.
          // Validate its exact durable identity before installing any fence.
          const previous=selectedProject(message,(await stored(PROJECT_TASKS))[key]);
          await settingsSource(sender);
          present=sessions.get(key);
          if(present?.project){selectedProject(message,present);stopProjectSource(present);}
          else stopProjectSource(previous);
        }
        return enqueue(async()=>{
          await restore();
          const s=selectedProject(message);
          stopProjectSource(s);
          s.message='停止请求已接收；已阻止后续文件操作；已派发副作用仍以原真实回执结算，不会重放。';
          await persist();
          return {...taskRef(s),...await trustedProjection(s)};
        });
      })();
    },
    async settings(sender){
      if(sender?.url?.startsWith('https://chatgpt.com/'))await pageSource(sender);else await settingsSource(sender);
      return {preferences:await readChatGPTFilesPreferences(api)};
    },
    configure(patch,sender){
      const change=configuration.then(async()=>{
        if(patch===undefined)fail('E_FILE_SCHEMA','缺少文件偏好');
        normalizeChatGPTFilesPreferences(patch);await settingsSource(sender);
        const preferences={...await readChatGPTFilesPreferences(api),...patch};
        await settingsSource(sender);
        await api.storage.local.set({[CHATGPT_FILES_CONFIG_KEY]:preferences});
        admissionClosed=!preferences.enabled;
        if(!preferences.enabled)pauseAll();
        await enqueue(async()=>{await restore();if(!preferences.enabled)pauseAll();await persist();});
        return {preferences};
      });configuration=change.catch(()=>{});return change;
    },handle(message,sender){
      if(message.action==='pause'){
        for(const ticket of pendingOperations)if(ticket.senderTab===sender?.tab?.id&&ticket.documentId===sender.documentId)ticket.stopped=true;
        const s=sessions.get(owner(sender));if(s?.documentId===sender.documentId){s.lifecycle=(s.lifecycle||0)+1;s.paused=true;s.pauseReason='stop';}
      }
      const operation=['prepare','inspect','approve','fill','poll','connect-project'].includes(message.action);
      return (operation?enqueueOperation:enqueue)(async (generation,ticket)=>{await restore();if(operation){assertGeneration(generation);assertPending(ticket);}try{return await run(message,sender);}finally{await persist();}},sender);
    },
    fixedComplete(message,sender){return enqueueOperation(async(generation,ticket)=>{
      assertGeneration(generation);assertPending(ticket);return fixedComplete(message,sender,()=>{assertGeneration(generation);assertPending(ticket);});
    },sender);},
    fixedStatus(message,sender){return enqueue(async()=>{
      const s=await fixedSource(message,sender),known=s.fixed.events.some(row=>row.key===eventKey(message));
      if(!known){await verifyEvent(s,message);if(s.completed||s.paused||s.unknown)return {...snapshot(s),status:'unknown'};}
      return fixedSnapshot(s,message);
    });},
    projectTask(message,sender){return enqueueOperation((_generation,ticket)=>startProject(message,sender,undefined,ticket),sender);},
    conversationTask(message,sender){return enqueueOperation(async (generation,ticket)=>{
      if(Object.keys(message).some(key=>key!=='task')||typeof message.task!=='string'||!message.task.trim()||new TextEncoder().encode(message.task).length>32*1024)
        fail('E_FILE_SCHEMA','只接受已发送的有界用户任务原文');
      await restore();await enabled();const source=await pageSource(sender);
      const page=await readAnswer(api,source,'',{identityOnly:true,readUserMessage:true,fileRequest:true});
      if(page.taskIntentPresent===true)fail('E_CHAT_ROUTE','当前回答包含 Task 意图，不接入文件任务');
      if(page.userText!==message.task||!page.turnKey||page.turnKey==='no-user')fail('E_CHAT_TURN','任务与最新已发送的用户原文不一致');
      if(!page.answerComplete)fail('E_CHAT_INCOMPLETE','请等待当前轮次完整结束');
      if(!page.answerKey)fail('E_CHAT_ANSWER','无法绑定当前回答，不接入文件任务');
      const previous=sessions.get(projectKey(source));
      if(previous?.source.documentId===source.documentId&&previous.source.url===source.url&&
        (previous.project?.entryTurn===page.turnKey||previous.project?.entryTurns?.includes(page.turnKey)))
        fail('E_FILE_REPLAY','这个用户轮次已处理，不会重复读取、回填或写入');
      if((previous?.project?.entryTurns?.length||0)>=128)fail('E_FILES_LIMIT','当前对话任务记录已达上限');
      assertGeneration(generation);assertPending(ticket);return startProject(message,sender,page.turnKey,ticket,page.answerKey);
    },sender);},
    projectStatus(sender){return enqueue(async()=>{await restore();const source=await pageSource(sender),s=sessions.get(projectKey(source));
      if(!s||s.source.documentId!==source.documentId||s.source.url!==source.url||s.source.windowId!==source.windowId)return {message:'当前没有文件任务'};
      if(s.project.grantId)await projectAuthority(s);return snapshot(s);});},
    projectStop(sender){
      // Stop admission is immediate; receipt reconciliation remains on the same
      // serialized owner queue. Only the matching original sender can pause it.
      const identity=senderIdentity(sender);
      if(identity){
        stoppedSources.add(identity);
        for(const ticket of pendingOperations)if(ticket.source===identity)ticket.stopped=true;
        for(const s of sessions.values())if(sourceIdentity(s.source)===identity){s.lifecycle=(s.lifecycle||0)+1;s.paused=true;s.pauseReason='stop';}
      }
      return enqueue(async()=>{await restore();const source=await pageSource(sender),s=sessions.get(projectKey(source));
      for(const row of sessions.values())if(sourceIdentity(row.source)===sourceIdentity(source)){row.paused=true;row.pauseReason='stop';}
      if(!s||s.source.documentId!==source.documentId||s.source.url!==source.url||s.source.windowId!==source.windowId){await persist();return {message:'已阻止同来源后续文件操作；没有当前来源可展示的任务，已派发操作仍须核对原回执。',automation:{phase:'paused'}};}
      s.paused=true;s.message='停止请求已接收；已派发写入须以原真实回执结算，不会重放。';await persist();
      // Stop remains effective after revocation, but cannot disclose a prior
      // receipt or file contents without the still-current project grant.
      if(s.project?.grantId){try{await projectAuthority(s);}catch{return {message:'停止请求已接收；项目授权不可用，文件详情已隐藏；已派发副作用仍须核对真实回执。',automation:{phase:'paused'}};}}
      return snapshot(s);});},
    tick(){return enqueue(tick);},
    drop(tabId){
      invalidatedTabs.add(tabId);
      for(const ticket of pendingOperations)if(ticket.senderTab===tabId)ticket.stopped=true;
      for(const s of sessions.values())if(s.ownerId===tabId||s.source.tabId===tabId){
        s.lifecycle=(s.lifecycle||0)+1;s.paused=true;s.pauseReason=s.source.tabId===tabId?'source':s.pauseReason||'owner';
        if(s.source.tabId===tabId)s.sourceRetired=true;
        if(s.proposal)s.proposal.reviewId=null;
      }
      return enqueue(async()=>{
      await restore();
      for(const [id,s] of sessions)if(id===tabId||s.source.tabId===tabId){
        if(s.fixed){s.paused=true;s.pauseReason=s.source.tabId===tabId?'source':s.pauseReason||'owner';
          if(s.source.tabId===tabId)s.sourceRetired=true;if(s.proposal)s.proposal.reviewId=null;
        }else sessions.delete(id);
      }
      await persist();
    }).catch(()=>{});},
    dispose(){disposed=true;for(const ticket of pendingOperations)ticket.stopped=true;pendingOperations.clear();api.storage?.onChanged?.removeListener(preferencesChanged);sessions.clear();}};
}
