import {CHATGPT_FILES_CONFIG_KEY,normalizeChatGPTFilesPreferences} from './chatgpt-files-config.js';
import {createChatGPTBridgeSite} from '../../../src/native-agent/chatgpt-bridge-site.js';
import {isChatGPTFileTask} from './chatgpt-conversation-route.js';
import {inspectChatGPTEditsOnPage} from '../../../src/native-agent/workspace-chatgpt.js';

const PROJECT_PROTOCOL='opendesk.chatgpt.project.v1';
const documents=new WeakSet();
const isFixedFilePrompt=text=>typeof text==='string'&&/opendesk\.workspace\.(?:request|edit)\.v1/.test(
  text.replace(/\\u([a-f0-9]{4})/gi,(_escape,unit)=>String.fromCharCode(parseInt(unit,16))));
const sha256=async text=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),
  byte=>byte.toString(16).padStart(2,'0')).join('');

// Headless, first-party ISOLATED adapter for the original WebFlow discovery.
// No DOM, page toast, Native authority, independent observer, or file ledger.
// Status, Stop and review are owned by the trusted extension service.
export function initChatGPTFileIntentPage({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window,
  site=createChatGPTBridgeSite({doc,win}),retireObservation=()=>{}}={}){
  if(!win||win!==win.top||win.location.origin!=='https://chatgpt.com'||documents.has(doc))return null;
  documents.add(doc);
  let disposed=false,preferences=normalizeChatGPTFilesPreferences(),preferencesReady=false,preferencesRevision=0;
  let awaitingTask=false,awaitingFixed=false,fixedEvent=null,taskUrl='',taskActive=false,projectExists=false;
  let projectPending=false,stopPending=false,stopRequested=false;
  const active=()=>win.location.origin==='https://chatgpt.com'&&
    /^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(win.location.pathname);
  const validSource=url=>!disposed&&active()&&win.location.href===url;
  async function request(message){
    let response;
    try{response=await api.runtime.sendMessage(message);}
    catch(error){throw Object.assign(error,{transport:true,outcome:error?.outcome||'OUTCOME_UNKNOWN'});}
    if(response?.ok!==true)throw Object.assign(new Error(response?.error?.message||'文件任务未收到有效回执'),{
      code:response?.error?.code||'E_PROJECT_TASK',outcome:response?.error?.outcome||'OUTCOME_UNKNOWN'});
    return response.data||{};
  }
  const retireFixed=(stop=false)=>{
    const existed=awaitingFixed||!!fixedEvent;
    if(fixedEvent)fixedEvent.retired=true;
    fixedEvent=null;awaitingFixed=false;
    if(existed){
      awaitingTask=false;taskActive=false;projectExists=false;
      retireObservation();
      if(stop)void request({protocol:PROJECT_PROTOCOL,action:'stop'}).catch(()=>{});
    }
    return existed;
  };
  const syncSource=()=>{
    if(taskUrl&&!validSource(taskUrl)){
      if(awaitingFixed||fixedEvent)retireFixed(true);
      awaitingTask=false;taskActive=false;projectExists=false;stopRequested=false;taskUrl='';
    }
  };
  async function projectRun(action,description){
    const stopping=action==='stop',initiating=action==='conversation';
    if(disposed||(!stopping&&projectPending)||stopPending||!active())return;
    if(!preferencesReady||!preferences.enabled&&!stopping)return;
    if(!initiating&&!validSource(taskUrl))return;
    const url=win.location.href;
    if(stopping){stopPending=true;stopRequested=true;taskActive=false;}
    else projectPending=true;
    if(initiating){stopRequested=false;taskUrl=url;projectExists=true;}
    try{
      await Promise.resolve();
      if(!validSource(url)||initiating&&(!preferences.enabled||stopRequested))return;
      const data=await request({protocol:PROJECT_PROTOCOL,action,...(initiating?{task:description}:{})});
      if(!validSource(url))return;
      taskActive=preferences.enabled&&!stopRequested&&!stopping&&!['paused','stopped','completed','failed'].includes(data.phase);
      if(stopping||['paused','stopped','completed','failed'].includes(data.phase))projectExists=false;
      // A new witnessed user turn may open one connection page. Wake or
      // uncertain handoff never opens/retries it.
      if(initiating&&preferences.enabled&&!stopRequested&&data.needsConnection===true)
        await request({protocol:'opendesk.chatgpt.file-intent.v1',kind:'open',pathHint:''});
    }catch{
      // The durable controller is authoritative; a transport failure does
      // not permit replaying the file operation or inserting website UI.
      taskActive=false;
    }finally{if(stopping)stopPending=false;else projectPending=false;}
  }
  const fixedSnapshot=record=>{
    if(record.retired||fixedEvent!==record||!preferences.enabled||!validSource(record.url))throw Error('原页面见证已失效');
    const snapshot=inspectChatGPTEditsOnPage({expectedUrl:record.url,identityOnly:true,requireComplete:true,
      fileRequest:true,readUserMessage:true,eventText:true,witness:{user:record.user,answer:record.answer}});
    if(!snapshot?.ok||snapshot.answerComplete!==true||snapshot.taskIntentPresent||
      !snapshot.readerEpoch||!snapshot.turnKey||!snapshot.answerKey||
      typeof snapshot.userText!=='string'||typeof snapshot.answerText!=='string')
      throw Error(snapshot?.error?.message||'固定文件见证无效');
    if(record.snapshot&&['readerEpoch','turnKey','answerKey','userText','answerText'].some(key=>snapshot[key]!==record.snapshot[key]))
      throw Error('原节点或回答身份已改变');
    return snapshot;
  };
  async function dispatchFixed(record){
    try{
      record.snapshot=fixedSnapshot(record);
      const [userSha256,answerSha256]=await Promise.all([sha256(record.snapshot.userText),sha256(record.snapshot.answerText)]);
      fixedSnapshot(record);
      const message={protocol:PROJECT_PROTOCOL,action:'fixed-complete',readerEpoch:record.snapshot.readerEpoch,
        turnKey:record.snapshot.turnKey,answerKey:record.snapshot.answerKey,userSha256,answerSha256};
      let data;
      try{data=await request(message);}
      catch(error){
        if(!error.transport)throw error;
        if(record.retired||fixedEvent!==record||!validSource(record.url))return;
        data=await request({...message,action:'fixed-status'});
        fixedSnapshot(record);
        if(data.status==='not-accepted')data=await request(message);
        else if(!['accepted','in-flight','completed'].includes(data.status))throw Error('固定文件接纳状态未知');
      }
      if(record.retired||fixedEvent!==record||!validSource(record.url))return;
      if(!['accepted','in-flight','completed'].includes(data.status)||
        ['unknown','paused','failed','stopped'].includes(data.phase))throw Error('固定文件状态不可继续');
      record.acknowledged=true;
      projectExists=data.status!=='completed'&&!['completed','paused','stopped','failed'].includes(data.phase);
    }catch{
      if(!record.retired&&fixedEvent===record&&validSource(record.url))retireFixed(true);
    }
  }
  const submission=snapshot=>{
    syncSource();
    if(disposed||!preferencesReady||!preferences.enabled||!active()||
      (!isFixedFilePrompt(snapshot.draft)&&!isChatGPTFileTask(snapshot.draft)))return;
    if(fixedEvent&&!fixedEvent.acknowledged){retireFixed(true);return;}
    fixedEvent=null;awaitingFixed=isFixedFilePrompt(snapshot.draft);
    awaitingTask=true;taskUrl=win.location.href;projectExists=true;
  };
  const cancellation=()=>{
    if(disposed)return;
    if(retireFixed(true))return;
    awaitingTask=false;
    if(projectExists&&(taskActive||projectPending))void projectRun('stop');
    else projectExists=false;
  };
  const conversation=observed=>{
    syncSource();
    if(disposed||!awaitingTask||!preferencesReady||!preferences.enabled||!validSource(taskUrl))return false;
    const content=observed.user.querySelector?.('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap')||observed.user;
    const description=content.innerText??content.textContent??'';
    if(awaitingFixed){
      if(!isFixedFilePrompt(description))return false;
      awaitingFixed=false;awaitingTask=false;
      fixedEvent={url:taskUrl,user:observed.user,answer:observed.answer,retired:false,acknowledged:false};
      void dispatchFixed(fixedEvent);return true;
    }
    if(!isChatGPTFileTask(description))return false;
    awaitingTask=false;void projectRun('conversation',description);return true;
  };
  const conflict=()=>{retireFixed(false);awaitingTask=false;projectExists=taskActive||projectPending;};
  const applyPreferences=value=>{
    const next=normalizeChatGPTFilesPreferences(value),changed=!preferencesReady||next.enabled!==preferences.enabled;
    preferences=next;preferencesReady=true;
    if(changed){
      if(awaitingTask)retireObservation();
      awaitingTask=false;
      if(!next.enabled){
        retireFixed(true);
        if(projectExists&&(taskActive||projectPending))void projectRun('stop');
        else projectExists=false;
      }
    }
  };
  const onPreferences=(changes,area)=>{
    if(disposed||area!=='local'||!Object.hasOwn(changes,CHATGPT_FILES_CONFIG_KEY))return;
    preferencesRevision++;
    try{applyPreferences(changes[CHATGPT_FILES_CONFIG_KEY].newValue);}
    catch{preferencesReady=false;preferences={enabled:false,diagnosticsVisible:false};
      if(awaitingFixed||fixedEvent)retireFixed(true);awaitingTask=false;taskActive=false;}
  };
  api.storage.onChanged.addListener(onPreferences);
  const ready=Promise.resolve().then(()=>api.storage.local.get(CHATGPT_FILES_CONFIG_KEY)).then(value=>{
    if(!disposed&&preferencesRevision===0&&!preferencesReady)applyPreferences(value[CHATGPT_FILES_CONFIG_KEY]);
  }).catch(()=>{if(!disposed&&preferencesRevision===0){preferencesReady=false;awaitingTask=false;}});
  const poll=win.setInterval(()=>{
    if(disposed)return;
    syncSource();
    if(projectPending||stopPending||!preferencesReady||!preferences.enabled)return;
    if(taskActive&&validSource(taskUrl))void projectRun('wake');
  },2500);
  const dispose=()=>{
    if(disposed)return;
    retireFixed(true);disposed=true;win.clearInterval(poll);
    api.storage.onChanged.removeListener(onPreferences);
    win.removeEventListener('pagehide',dispose);
    documents.delete(doc);
  };
  win.addEventListener('pagehide',dispose,{once:true});
  return Object.freeze({dispose,ready,submission,cancellation,conversation,conflict,
    busy:()=>projectPending||stopPending||taskActive||projectExists&&!stopRequested});
}
