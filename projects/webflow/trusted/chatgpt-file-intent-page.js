import {CHATGPT_FILE_INTENT_PROTOCOL,normalizeChatGPTFileHint} from './chatgpt-file-intent-gate.js';
import {createTaskPrompt} from './chatgpt-files-ui.js';
import {createChatGPTBridgeSite} from '../../../src/native-agent/chatgpt-bridge-site.js';
import {CHATGPT_FILES_CONFIG_KEY,normalizeChatGPTFilesPreferences} from './chatgpt-files-config.js';
import {isChatGPTFileTask} from './chatgpt-conversation-route.js';
import {inspectChatGPTEditsOnPage} from '../../../src/native-agent/workspace-chatgpt.js';
import {showPageToast} from '../../../src/scripting/user-scripts/page-toast.js';

const PROJECT_PROTOCOL='opendesk.chatgpt.project.v1';
const isFixedFilePrompt=text=>typeof text==='string'&&/opendesk\.workspace\.(?:request|edit)\.v1/.test(
  text.replace(/\\u([a-f0-9]{4})/gi,(_escape,unit)=>String.fromCharCode(parseInt(unit,16))));
const sha256=async text=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),
  byte=>byte.toString(16).padStart(2,'0')).join('');

// First-party ISOLATED UI. Project authority and execution stay in the service;
// this page only submits trusted intents and never sends the ChatGPT composer.
export function initChatGPTFileIntentPage({api=chrome,doc=document,win=window,site=createChatGPTBridgeSite({doc,win}),notify=showPageToast,retireObservation=()=>{}}={}){
  if(win!==win.top||win.location.origin!=='https://chatgpt.com')return null;
  if(doc.getElementById('opendesk-chatgpt-files-entry'))return null;
  const root=doc.createElement('div');
  root.id='opendesk-chatgpt-files-entry';
  root.setAttribute('data-opendesk-ui-owner','chatgpt-files-entry');
  root.hidden=true;
  // Only active task controls or explicitly requested diagnostics/details live
  // here. Never attach business feedback to the site's composer/layout.
  root.style.cssText='position:fixed;top:72px;right:16px;z-index:2147483646;max-width:360px;width:calc(100vw - 32px)';
  const shadow=root.attachShadow({mode:'closed'});
  const style=doc.createElement('style');
  style.textContent=`:host{all:initial}:host([hidden]){display:none!important}*{box-sizing:border-box}
    .card{font:13px/1.5 system-ui,-apple-system,sans-serif;color:#1b2c49;background:#fff;border:1px solid #e1e8f1;border-radius:12px;padding:12px;box-shadow:0 4px 16px #0002;max-height:calc(100dvh - 88px);overflow:auto}
    .toolbar{display:flex;align-items:center;gap:8px}.title{flex:1;min-width:0;font-size:13px}
    .head{display:flex;align-items:flex-start;gap:8px;margin-top:8px;flex-wrap:wrap}.head .status{flex:1;min-width:140px}
    [hidden]{display:none!important}a{color:inherit}.diagnostic{margin-top:12px;border-top:1px solid #e1e8f1;padding-top:8px}
    summary{cursor:pointer;padding:8px 0;color:#52647c}details>details,details>label,details>button,details>.note{margin-top:8px}
    button{font:inherit;border-radius:8px;min-height:34px;cursor:pointer;padding:6px 10px;border:1px solid #8795a9;background:#f5f7fb;color:inherit}
    button.close{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;padding:0;border-color:transparent;background:transparent;font-size:22px;line-height:1}
    button.close:hover{background:#edf1f6}button.primary{background:#365eda;border-color:#365eda;color:#fff}
    button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid #365eda;outline-offset:2px}
    .detail{margin-top:8px;display:grid;gap:8px}label{display:grid;gap:4px;color:#4b5e77}
    input,textarea{font:inherit;min-height:34px;width:100%;min-width:0;border:1px solid #8795a9;border-radius:8px;padding:7px;background:inherit;color:inherit}textarea{resize:vertical}
    .note,.status{overflow-wrap:anywhere;color:#52647c}.status.error,.title.error{color:#a8243f}.feedback{white-space:pre-wrap;margin:0;font:inherit}
    .compact{padding:8px 12px}.compact .title{font-weight:500}
    @media(max-width:480px){:host{top:12px!important;right:12px!important;width:calc(100vw - 24px)!important}.card{max-height:calc(100dvh - 24px)}}
    @media(prefers-color-scheme:dark){.card{color:#ebf1f9;background:#182233;border-color:#374457}button{color:inherit;background:#28374c;border-color:#71849c}button.close{background:transparent}button.close:hover{background:#28374c}button.primary{color:#fff;background:#365eda;border-color:#365eda}input,textarea{border-color:#71849c}.diagnostic{border-color:#374457}.note,.status,label,summary{color:#bbc8db}.status.error,.title.error{color:#ff9fae}}`;
  const card=doc.createElement('section');card.className='card';
  card.setAttribute('aria-label','项目文件');
  const toolbar=doc.createElement('div');toolbar.className='toolbar';
  const title=doc.createElement('strong');title.className='title';title.textContent='项目文件';
  const panel=doc.createElement('div');panel.id='opendesk-project-panel';
  const restore=doc.createElement('button');restore.type='button';restore.id='opendesk-project-restore';restore.textContent='展开';restore.hidden=true;
  restore.setAttribute('aria-label','展开项目文件面板');restore.setAttribute('aria-controls',panel.id);
  const head=doc.createElement('div');head.className='head';
  const toggle=doc.createElement('button');toggle.type='button';
  toggle.textContent='查看回执';toggle.id='opendesk-project-details-toggle';
  toggle.setAttribute('aria-expanded','false');
  const detail=doc.createElement('div');detail.className='detail';detail.hidden=true;detail.id='opendesk-project-details';
  toggle.setAttribute('aria-controls',detail.id);
  const dismiss=doc.createElement('button');dismiss.type='button';dismiss.id='opendesk-project-dismiss';dismiss.className='close';dismiss.textContent='×';
  dismiss.setAttribute('aria-label','关闭项目文件面板');dismiss.title='关闭面板；进行中的任务保留停止入口';
  const diagnostic=doc.createElement('details');diagnostic.id='opendesk-project-diagnostics';diagnostic.className='diagnostic';diagnostic.hidden=true;diagnostic.open=false;
  const diagnosticTitle=doc.createElement('summary');diagnosticTitle.textContent='更多文件操作';
  const settings=doc.createElement('a');settings.href=api.runtime.getURL('native-agent/settings.html#chatgpt-files-controls');settings.target='_blank';settings.rel='noopener';settings.textContent='文件处理设置';
  settings.className='note';
  const entryNote=doc.createElement('p');entryNote.className='note';entryNote.textContent='在原对话提出文件需求；授权与文件审阅在扩展页完成。';
  const taskLabel=doc.createElement('label');taskLabel.textContent='项目任务';
  const task=doc.createElement('textarea');task.id='opendesk-project-task';task.rows=3;
  task.placeholder='例如：读取当前项目 README.md，说明需要修改的内容';taskLabel.append(task);
  const start=doc.createElement('button');start.type='button';start.className='primary';start.textContent='处理项目任务';
  const stop=doc.createElement('button');stop.type='button';stop.textContent='停止项目任务';
  const receipt=doc.createElement('pre');receipt.id='opendesk-project-receipt';receipt.hidden=true;
  receipt.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:32vh;overflow:auto;margin:0';
  const feedback=doc.createElement('pre');feedback.id='opendesk-project-feedback';feedback.className='note feedback';feedback.hidden=true;
  const generate=doc.createElement('button');generate.type='button';generate.textContent='生成任务提示词';
  const promptLabel=doc.createElement('label');promptLabel.textContent='本地提示词（可选中复制）';promptLabel.hidden=true;
  const prompt=doc.createElement('textarea');prompt.id='opendesk-project-prompt';prompt.rows=6;prompt.readOnly=true;promptLabel.append(prompt);
  const taskNote=doc.createElement('div');taskNote.className='note';
  taskNote.textContent='直接在 ChatGPT 输入并发送，例如“读取当前项目 demo.txt，只读不修改”。完成结果使用框架通知；长内容与真实回执可按需展开查看。修改上下文只填入原输入框，由你发送；保存后无需再发送回执。';
  const optional=doc.createElement('details');
  const optionalSummary=doc.createElement('summary');optionalSummary.textContent='可选：本地提示词与手动任务';
  optional.append(optionalSummary,taskLabel,start,generate,promptLabel);
  const legacy=doc.createElement('details');
  const legacySummary=doc.createElement('summary');legacySummary.textContent='高级：固定协议请求';
  const caption=doc.createElement('label');caption.textContent='.txt 文件名（可选，仅作提示）';
  const filename=doc.createElement('input');filename.type='text';filename.maxLength=512;
  filename.placeholder='例如 demo.txt';
  caption.append(filename);
  const note=doc.createElement('div');note.className='note';
  note.textContent='在可信扩展页选择已有授权目录和文件，批准读取范围或具体修改。无需先进入 Workspace；网页文字本身不会授权。';
  const open=doc.createElement('button');open.type='button';open.className='primary';
  open.textContent='审阅当前对话的文件请求';
  const status=doc.createElement('div');status.className='status';status.setAttribute('role','status');
  legacy.append(legacySummary,caption,note,open);
  toolbar.append(title,stop,restore,dismiss);head.append(status,toggle);detail.append(feedback,taskNote,receipt);
  diagnostic.append(diagnosticTitle,optional,legacy);panel.append(head,detail,entryNote,diagnostic,settings);card.append(toolbar,panel);
  shadow.append(style,card);(doc.body||doc.documentElement).append(root);
  let disposed=false,pending=false,projectPending=false,taskActive=false,projectExists=false,taskUrl='',awaitingTask=false,stopRequested=false,stopPending=false;
  let preferences=normalizeChatGPTFilesPreferences(),preferencesReady=false,dismissed=false,panelClosed=false,panelRequested=false,lastData=null,preferencesRevision=0;
  let notificationUnavailable=false,taskSequence=0;
  let awaitingFixed=false,fixedEvent=null;
  const announced=new Set();
  const dismissNotification=()=>{try{notify({id:'chatgpt-files'},'dismiss');}catch{/* Display cleanup never dispatches file operations. */}};
  const active=()=>{
    if(win.location.origin!=='https://chatgpt.com')return false;
    return /^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(win.location.pathname);
  };
  const update=()=>{
    if(disposed)return;
    if(taskUrl&&taskUrl!==win.location.href){
      if(awaitingFixed||fixedEvent)retireFixed(true);
      taskActive=false;projectExists=false;awaitingTask=false;stopRequested=false;taskUrl='';
      receipt.textContent='';receipt.hidden=true;status.textContent='';dismissed=false;lastData=null;
      announced.clear();notificationUnavailable=false;dismissNotification();
      detail.hidden=true;toggle.setAttribute('aria-expanded','false');
    }
    const running=preferencesReady&&preferences.enabled;
    const activeWork=pending||projectPending||stopPending||taskActive||awaitingTask||projectExists&&!stopRequested;
    const attentionNeeded=!!taskUrl&&status.classList.contains('error')&&!dismissed;
    const controlsNeeded=activeWork||attentionNeeded||
      !!(lastData?.result||lastData?.resultText)&&!dismissed;
    root.hidden=!active()||panelClosed&&!activeWork||(!preferences.diagnosticsVisible&&!controlsNeeded&&
      (dismissed||detail.hidden&&!notificationUnavailable));
    // Persisted diagnostic opt-in offers a small launcher, never an expanded
    // developer panel. File activity still owns its status/Stop independently.
    const idleEntry=!activeWork&&!status.textContent&&!panelRequested;
    const compact=panelClosed&&activeWork||idleEntry;
    root.style.maxWidth=idleEntry?'220px':'360px';
    panel.hidden=compact;restore.hidden=!compact;dismiss.hidden=compact&&activeWork;card.classList.toggle('compact',compact);
    restore.textContent=idleEntry?'打开':'展开';
    restore.setAttribute('aria-expanded',String(!compact));
    title.textContent=compact&&activeWork?(status.classList.contains('error')?'项目文件 · 需核对状态':stopRequested?'项目文件 · 正在停止':'项目文件 · 处理中'):'项目文件';
    title.classList.toggle('error',compact&&status.classList.contains('error'));
    diagnostic.hidden=!preferencesReady||!preferences.diagnosticsVisible;
    open.disabled=pending||projectPending||stopPending||!active()||!running;
    start.disabled=pending||projectPending||stopPending||!active()||!running;
    stop.disabled=!active()||!projectExists||stopRequested||stopPending;stop.hidden=!projectExists;
    head.hidden=!status.textContent;toggle.hidden=!status.textContent;toggle.textContent=feedback.hidden?'查看回执':'查看详情';
  };
  const say=(value,error=false,{key,variant=error?'error':'info',persistent=error,details=''}={})=>{
    status.textContent=value;status.classList.toggle('error',error);
    feedback.textContent=details;feedback.hidden=!details;
    if(key!==undefined&&announced.has(key))return;
    dismissed=false;
    // Record before rendering. A failed/dismissed notification cannot replay or
    // reannounce the same file result on the next wake/preferences update.
    if(key!==undefined)announced.add(key);
    try{
      notify({id:'chatgpt-files',message:value.slice(0,240),variant,
        duration:persistent?0:8000,countdown:!persistent,dismissible:true,position:'top'});
      notificationUnavailable=false;
    }catch{notificationUnavailable=true;}
  };
  const showResult=(data,{announce=true}={})=>{
    lastData=data;const r=data.result,d=r?.data;
    const outcome=r?.status||data.resultStatus;
    const unknown=outcome==='unknown'||r?.error?.outcome==='OUTCOME_UNKNOWN';
    const failed=!!outcome&&!['success','unknown'].includes(outcome);
    let message=data.message||'文件任务状态已更新';
    if(unknown)message='结果未知 · 请核对文件，勿重复执行'+(r?.path?' · '+r.path:'');
    else if(failed)message='文件任务失败'+(r?.error?.message?' · '+r.error.message:'');
    else if(r?.status==='success'){
      if(r.operation==='read')message=taskActive?(data.message||'已读取 '+r.path+'，等待本轮后续操作。'):'已读取 '+r.path+' · 仅显示在本机，尚未发送给 ChatGPT';
      else if(d?.saved===true&&d.readBackVerified===true)message='已保存 '+r.path+' · 独立读回核验通过';
      else message='写入回执尚未核验 · 请查看详情';
    }
    const unverified=r?.operation==='write'&&r.status==='success'&&!(d?.saved===true&&d.readBackVerified===true);
    if(announce)say(message,unknown||failed,{key:r?'result:'+(r.resultId||data.resultPacketId||JSON.stringify(r))+':'+outcome+':'+d?.saved+':'+d?.readBackVerified:'status:'+taskSequence+':'+message,
      variant:unknown||unverified?'warning':failed?'error':r?.status==='success'?'success':'info',
      persistent:unknown||failed||unverified});
    const projectName=typeof data.projectConnection?.name==='string'&&data.projectConnection.name.trim()?data.projectConnection.name:'（未提供）';
    if(r){
      const comparison=data.comparison;
      const section=(label,value)=>label+'：\n'+(typeof value==='string'?(value||'（空文件）'):'（未提供）');
      receipt.textContent=[`项目：${projectName}`,`相对路径：${typeof r.path==='string'?r.path:'（未提供）'}`,`状态：${unknown?'结果未知':failed?'失败':unverified?'写入未核验':'成功'}`,
        r.operation==='write'&&d?`已保存：${d.saved===true} · 独立读回通过：${d.readBackVerified===true}`:'',
        preferences.diagnosticsVisible&&d?.sha256?`SHA-256：${d.sha256}`:'',
        r.error?`${r.error.code} · ${r.error.message} · ${r.error.outcome}`:'',
        ...(r.operation==='write'?[section('修改前',comparison?.before),section('提案后',comparison?.proposed),
          section(r.error?.code==='E_FILE_RECONCILED'?'当前读回（原回执仍未知）':unknown||failed||unverified?'当前读回（写入结果未确认）':'独立读回',comparison?.readBack)]:[]),
        typeof d?.content==='string'?'文件内容（本机显示，未自动发送给模型）：\n'+d.content:''].filter(Boolean).join('\n');
      receipt.hidden=false;
    }else if(data.resultText){receipt.textContent=`项目：${projectName}\n相对路径：（未提供）\n${data.resultText}`;receipt.hidden=false;}
  };
  const validSource=url=>!disposed&&active()&&win.location.href===url;
  async function request(message){
    let reply;
    try{reply=await api.runtime.sendMessage(message);}
    catch(error){throw Object.assign(error,{transport:true,outcome:error.outcome||'OUTCOME_UNKNOWN'});}
    if(reply?.ok!==true)throw Object.assign(new Error(reply?.error?.message||'未收到有效任务回执'),{
      code:reply?.error?.code||'E_PROJECT_TASK',outcome:reply?.error?.outcome||'OUTCOME_UNKNOWN'});
    return reply.data||{};
  }
  async function projectRun(action,description){
    const stopping=action==='stop';
    if(disposed||pending||(!stopping&&(projectPending||stopPending))||stopping&&stopPending||!active())return;
    if(!preferencesReady||!preferences.enabled&&action!=='stop'&&action!=='status')return;
    const initiating=action==='start'||action==='conversation';
    if(!initiating&&!validSource(taskUrl)){update();return;}
    const url=win.location.href;
    if(stopping){stopPending=true;stopRequested=true;taskActive=false;}else projectPending=true;
    if(initiating){stopRequested=false;taskSequence++;if(action==='start')panelClosed=false;}
    if(initiating){taskUrl=url;projectExists=true;receipt.textContent='';receipt.hidden=true;detail.hidden=true;toggle.setAttribute('aria-expanded','false');lastData=null;}
    if(action==='conversation'){
      awaitingTask=false;say('正在通过 Native 处理文件需求…');
    }
    update();
    try{
      // Deferral also catches a synchronous retired-extension-context throw.
      await Promise.resolve();
      if(!validSource(url)||initiating&&(!preferences.enabled||stopRequested))return;
      const data=await request({protocol:PROJECT_PROTOCOL,action,...(initiating?{task:description}:{})});
      if(!validSource(url))return;
      // Observing a read or an older packet does not complete the project.
      taskActive=preferences.enabled&&!stopRequested&&action!=='stop'&&!['paused','stopped','completed','failed'].includes(data.phase);
      if(action==='stop'||['paused','stopped','completed','failed'].includes(data.phase))projectExists=false;
      showResult(data);
      // Only this trusted start may open one connection page. Wake never opens
      // or replays a handoff, including after an uncertain open response.
      if(initiating&&preferences.enabled&&!stopRequested&&data.needsConnection===true){
        await request({protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint:''});
        if(validSource(url))say((data.message||'首次连接此项目')+' · 已打开可信项目连接页，请审阅后连接。');
      }
    }catch(error){
      taskActive=false;
      if(validSource(url))say(/Extension context invalidated/i.test(error.message)?'连接已失效，请查看恢复指引。':
        error.outcome==='OUTCOME_UNKNOWN'?'任务回执未知，请查看详情。':'文件任务失败，请查看详情。',true,{details:
        (error.code||'E_PROJECT_TASK')+' · '+error.message+
        '。请先查看已有文件审阅页并核对真实回执；确未打开时，保存原对话草稿后刷新本页。不会自动重发文件操作。'});
    }finally{
      if(stopping)stopPending=false;else projectPending=false;
      update();
    }
  }
  // Fixed events retain the original discovery nodes, never a reconstructed
  // historic turn. They cannot enter projectRun/conversation or its wake path.
  const retireFixed=(notifyStop=false)=>{
    const exists=awaitingFixed||!!fixedEvent;
    if(fixedEvent)fixedEvent.retired=true;
    fixedEvent=null;awaitingFixed=false;
    if(exists){
      awaitingTask=false;
      retireObservation();taskActive=false;projectExists=false;
      if(notifyStop)void request({protocol:PROJECT_PROTOCOL,action:'stop'}).catch(()=>{
        if(!disposed)say('停止回执未知 · 请在可信文件审阅页核对；不会重发固定事件。',true);
      });
    }
    return exists;
  };
  const fixedSnapshot=record=>{
    if(record.retired||fixedEvent!==record||!preferences.enabled||!validSource(record.url))throw Error('原页面见证已失效');
    const snapshot=inspectChatGPTEditsOnPage({expectedUrl:record.url,identityOnly:true,requireComplete:true,
      fileRequest:true,readUserMessage:true,eventText:true,witness:{user:record.user,answer:record.answer}});
    if(!snapshot?.ok||snapshot.answerComplete!==true||snapshot.taskIntentPresent||
      !snapshot.readerEpoch||!snapshot.turnKey||!snapshot.answerKey||typeof snapshot.userText!=='string'||typeof snapshot.answerText!=='string')
      throw Error(snapshot?.error?.message||'无法核对原固定回答见证');
    if(record.snapshot&&['readerEpoch','turnKey','answerKey','userText','answerText'].some(key=>snapshot[key]!==record.snapshot[key]))
      throw Error('原节点、原文或回答版本已改变');
    return snapshot;
  };
  const pauseFixed=(record,error)=>{
    record.retired=true;taskActive=false;awaitingTask=false;
    say('文件事件已暂停，请查看详情；不会自动补跑。',true,{details:error.message+
      '。请先查看已有文件审阅页并核对真实回执；确未打开时，保存原对话草稿后刷新本页。'});update();
  };
  async function dispatchFixed(record){
    try{
      record.snapshot=fixedSnapshot(record);
      const [userSha256,answerSha256]=await Promise.all([sha256(record.snapshot.userText),sha256(record.snapshot.answerText)]);
      fixedSnapshot(record);
      record.message={protocol:PROJECT_PROTOCOL,action:'fixed-complete',readerEpoch:record.snapshot.readerEpoch,
        turnKey:record.snapshot.turnKey,answerKey:record.snapshot.answerKey,userSha256,answerSha256};
      let data;
      try{data=await request(record.message);}
      catch(error){
        if(!error.transport)throw error;
        if(record.retired||fixedEvent!==record||!validSource(record.url))return;
        // Lost ACK is not permission to replay. Query the same seven-field
        // identity first; only a proved non-acceptance permits one retry.
        data=await request({...record.message,action:'fixed-status'});
        fixedSnapshot(record);
        if(data.status==='not-accepted'){
          data=await request(record.message);
        }else if(!['accepted','in-flight','completed'].includes(data.status)){
          throw Error(data.message||'接纳状态未知');
        }
      }
      if(record.retired||fixedEvent!==record||!validSource(record.url))return;
      if(!['accepted','in-flight','completed'].includes(data.status)||['unknown','paused','failed','stopped'].includes(data.phase))
        throw Error(data.message||'固定事件状态未知或已暂停');
      record.acknowledged=true;
      projectExists=!['completed','paused','stopped','failed'].includes(data.phase)&&data.status!=='completed';
      showResult(data);
      if(data.phase==='review')say(data.message||'修改提案已生成 · 请在可信文件审阅页确认；尚未写入。');
      update();
    }catch(error){
      if(!record.retired&&fixedEvent===record&&validSource(record.url))pauseFixed(record,error);
    }
  }
  // Called only by the original Web Flow discovery after its native gesture
  // and complete-turn checks. This adapter has NO independent send observer.
  const submission=snap=>{
    if(disposed||!preferencesReady||!preferences.enabled||!active()||(!isFixedFilePrompt(snap.draft)&&!isChatGPTFileTask(snap.draft)))return;
    if(fixedEvent&&!fixedEvent.acknowledged){say('原固定事件尚未核对，已暂停；不会采用新回答。',true);retireFixed(true);return;}
    fixedEvent=null;awaitingFixed=isFixedFilePrompt(snap.draft);
    panelClosed=false;
    awaitingTask=true;taskUrl=win.location.href;projectExists=true;
    detail.hidden=true;toggle.setAttribute('aria-expanded','false');
    say('等待本轮回答后处理文件需求…');update();
  };
  const cancellation=()=>{
    if(disposed)return;
    if(retireFixed(true)){update();return;}
    awaitingTask=false;update();
    if(projectExists&&(taskActive||projectPending))void projectRun('stop');
    else{projectExists=false;update();}
  };
  const conversation=observed=>{
    if(disposed||!awaitingTask||!preferencesReady||!preferences.enabled||!validSource(taskUrl))return false;
    const content=observed.user.querySelector?.('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap')||observed.user;
    const description=content.innerText??content.textContent??'';
    if(awaitingFixed){
      if(!isFixedFilePrompt(description))return false;
      awaitingFixed=false;awaitingTask=false;
      fixedEvent={url:taskUrl,user:observed.user,answer:observed.answer,retired:false,acknowledged:false};
      say('正在核对固定文件回答…');update();void dispatchFixed(fixedEvent);return true;
    }
    if(!isChatGPTFileTask(description))return false;
    awaitingTask=false;
    void projectRun('conversation',description);return true;
  };
  const conflict=()=>{
    retireFixed(false);
    awaitingTask=false;projectExists=taskActive||projectPending;
    say('任务路由冲突：本轮同时包含文件需求和网页 Task 候选；两者均未启动。请明确一种操作后提出新请求。',true);update();
  };
  start.addEventListener('click',event=>{
    if(!event.isTrusted||disposed||pending||projectPending||!preferencesReady||!preferences.enabled||!active())return;
    const description=task.value.trim();
    if(!description){say('请先填写项目任务。',true);return;}
    void projectRun('start',description);
  });
  stop.addEventListener('click',event=>{
    if(!event.isTrusted||stop.disabled)return;
    if(retireFixed(true)){say('固定文件事件已停止；已派发操作以实际回执为准。');update();return;}
    if(awaitingTask){
      retireObservation();awaitingTask=false;
      if(!taskActive&&!projectPending){projectExists=false;say('本次项目需求已停止，未启动文件访问。');update();return;}
    }
    say('正在停止；已派发操作将保留实际回执。');
    void projectRun('stop');
  });
  generate.addEventListener('click',event=>{
    if(!event.isTrusted||disposed)return;
    prompt.value=createTaskPrompt(task.value);promptLabel.hidden=!prompt.value;
  });
  toggle.addEventListener('click',event=>{
    if(!event.isTrusted||disposed)return;
    detail.hidden=!detail.hidden;
    toggle.setAttribute('aria-expanded',String(!detail.hidden));
    update();
  });
  const closePanel=()=>{
    const ownedFocus=!!shadow.activeElement;
    panelClosed=true;panelRequested=false;dismissed=true;detail.hidden=true;diagnostic.open=false;
    toggle.setAttribute('aria-expanded','false');dismissNotification();update();
    // Keep keyboard focus reachable when the expanded controls disappear.
    if(!root.hidden)restore.focus();else if(ownedFocus)site.inspect?.().editor?.focus?.();
  };
  dismiss.addEventListener('click',event=>{if(event.isTrusted&&!disposed)closePanel();});
  restore.addEventListener('click',event=>{
    if(!event.isTrusted||disposed)return;
    panelClosed=false;panelRequested=true;dismissed=false;update();dismiss.focus();
  });
  card.addEventListener('keydown',event=>{
    if(event.isTrusted&&!disposed&&event.key==='Escape'&&!event.isComposing){event.preventDefault();closePanel();}
  });
  open.addEventListener('click',event=>{
    if(!event.isTrusted||disposed||pending||projectPending||!preferencesReady||!preferences.enabled||!active())return;
    let pathHint;
    try{pathHint=normalizeChatGPTFileHint(filename.value);}
    catch(error){say(error.message,true);return;}
    pending=true;update();say('正在打开可信文件审阅页…');
    // Chrome can throw synchronously when this document's extension context
    // has retired. Keep that failure inside the same error/pending cleanup.
    Promise.resolve().then(()=>{
      if(disposed)return;
      return api.runtime.sendMessage({protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint});
    }).then(reply=>{
      if(disposed)return;
      if(reply?.ok!==true)throw Object.assign(new Error(reply?.error?.message||'可信入口未接线'),{
        code:reply?.error?.code||'E_FILE_HANDOFF'});
      say('已打开文件审阅页。请在扩展中批准精确目录和路径；本次没有读取或共享文件。');
    }).catch(error=>{if(!disposed)say(/Extension context invalidated/i.test(error.message)?
      '连接已失效，请查看恢复指引。':'文件审阅页未能确认打开，请查看详情。',true,{details:
      (error.code||'E_FILE_HANDOFF')+' · '+error.message+
      '。请先查看是否已有文件审阅页；若未打开，保存原对话草稿后刷新本页，再手动打开入口。'});})
      .finally(()=>{pending=false;update();});
  });
  const applyPreferences=value=>{
    const next=normalizeChatGPTFilesPreferences(value),changed=!preferencesReady||next.enabled!==preferences.enabled;
    if(preferencesReady&&!preferences.diagnosticsVisible&&next.diagnosticsVisible){panelClosed=false;panelRequested=false;}
    preferences=next;preferencesReady=true;
    if(changed){
      if(awaitingTask)retireObservation();awaitingTask=false;
      if(!next.enabled){
        retireFixed(true);
        const needsStop=projectExists&&(taskActive||projectPending);taskActive=false;
        if(needsStop){
          void projectRun('stop');
          say('已关闭项目文件处理；已派发操作以实际回执为准。');
        }else projectExists=false;
      }
    }
    if(lastData)showResult(lastData,{announce:false});
    update();
  };
  const onPreferences=(changes,area)=>{
    if(disposed||area!=='local'||!Object.hasOwn(changes,CHATGPT_FILES_CONFIG_KEY))return;
    preferencesRevision++;
    try{applyPreferences(changes[CHATGPT_FILES_CONFIG_KEY].newValue);}
    catch{
      applyPreferences({enabled:false,diagnosticsVisible:false});preferencesReady=false;
      say('文件处理设置无效，已停止新任务；请在设置中核对。',true);update();
    }
  };
  api.storage.onChanged.addListener(onPreferences);
  const ready=Promise.resolve().then(()=>api.storage.local.get(CHATGPT_FILES_CONFIG_KEY)).then(value=>{
    if(!disposed&&preferencesRevision===0&&!preferencesReady)applyPreferences(value[CHATGPT_FILES_CONFIG_KEY]);
  }).catch(error=>{if(!disposed&&preferencesRevision===0){preferencesReady=false;say('无法读取文件处理设置 · '+error.message,true);update();}});
  update();
  const poll=win.setInterval(()=>{
    update();
    if(disposed||projectPending||stopPending||!preferencesReady||!preferences.enabled)return;
    if(taskActive&&validSource(taskUrl))void projectRun('wake');
  },2500);
  const dispose=()=>{
    if(disposed)return;retireFixed(true);disposed=true;win.clearInterval(poll);root.remove();
    dismissNotification();
    api.storage.onChanged.removeListener(onPreferences);
    win.removeEventListener('pagehide',dispose);
  };
  win.addEventListener('pagehide',dispose,{once:true});
  return Object.freeze({dispose,ready,submission,cancellation,conversation,conflict,
    busy:()=>projectPending||stopPending||taskActive||projectExists&&!stopRequested});
}
