import {CHATGPT_FILE_INTENT_PROTOCOL,normalizeChatGPTFileHint} from './chatgpt-file-intent-gate.js';
import {createTaskPrompt} from './chatgpt-files-ui.js';
import {createChatGPTBridgeSite} from '../../../src/native-agent/chatgpt-bridge-site.js';
import {CHATGPT_FILES_CONFIG_KEY,normalizeChatGPTFilesPreferences} from './chatgpt-files-config.js';
import {isChatGPTFileTask} from './chatgpt-conversation-route.js';
import {showPageToast} from '../../../src/scripting/user-scripts/page-toast.js';

const PROJECT_PROTOCOL='opendesk.chatgpt.project.v1';

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
  root.style.cssText='position:fixed;top:72px;right:16px;z-index:2147483646;max-width:400px;width:calc(100vw - 32px)';
  const shadow=root.attachShadow({mode:'closed'});
  const style=doc.createElement('style');
  style.textContent=':host{all:initial}:host([hidden]){display:none!important}*{box-sizing:border-box}.card{font:12px/1.45 system-ui,-apple-system,sans-serif;color:#1b2c49;background:#fff;border:1px solid #e1e8f1;border-radius:12px;padding:9px;box-shadow:0 4px 16px #0002}.head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.head .status{flex:1;min-width:140px}.card[hidden],[hidden]{display:none!important}a{color:inherit}.diagnostic{margin-top:8px;display:grid;gap:8px}button{font:inherit;border-radius:8px;min-height:34px;cursor:pointer;padding:7px 10px;border:1px solid #8795a9;background:#f5f7fb;color:inherit}button.primary{background:#365eda;border-color:#365eda;color:#fff}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #365eda;outline-offset:2px}.detail{margin-top:8px;display:grid;gap:8px;max-height:70vh;overflow:auto}.detail[hidden]{display:none}label{display:grid;gap:4px;color:#4b5e77}input,textarea{font:inherit;min-height:34px;width:100%;min-width:0;border:1px solid #8795a9;border-radius:8px;padding:7px;background:inherit;color:inherit}textarea{resize:vertical}.note,.status{overflow-wrap:anywhere;color:#52647c}.status.error{color:#a8243f}@media(prefers-color-scheme:dark){.card{color:#ebf1f9;background:#182233;border-color:#374457}button{color:inherit;background:#28374c;border-color:#71849c}button.primary{color:#fff;background:#365eda;border-color:#365eda}input,textarea{border-color:#71849c}.note,.status,label{color:#bbc8db}.status.error{color:#ff9fae}}';
  const card=doc.createElement('section');card.className='card';
  const head=doc.createElement('div');head.className='head';
  const toggle=doc.createElement('button');toggle.type='button';
  toggle.textContent='查看回执';toggle.id='opendesk-project-details-toggle';
  toggle.setAttribute('aria-expanded','false');
  const detail=doc.createElement('div');detail.className='detail';detail.hidden=true;detail.id='opendesk-project-details';
  toggle.setAttribute('aria-controls',detail.id);
  const dismiss=doc.createElement('button');dismiss.type='button';dismiss.id='opendesk-project-dismiss';dismiss.textContent='收起状态';
  const diagnostic=doc.createElement('div');diagnostic.id='opendesk-project-diagnostics';diagnostic.className='diagnostic';diagnostic.hidden=true;
  const diagnosticTitle=doc.createElement('strong');diagnosticTitle.textContent='项目文件诊断';
  const settings=doc.createElement('a');settings.href=api.runtime.getURL('native-agent/settings.html#chatgpt-files-controls');settings.target='_blank';settings.rel='noopener';settings.textContent='文件处理设置';
  const taskLabel=doc.createElement('label');taskLabel.textContent='项目任务';
  const task=doc.createElement('textarea');task.id='opendesk-project-task';task.rows=3;
  task.placeholder='例如：读取当前项目 README.md，说明需要修改的内容';taskLabel.append(task);
  const start=doc.createElement('button');start.type='button';start.className='primary';start.textContent='处理项目任务';
  const stop=doc.createElement('button');stop.type='button';stop.textContent='停止项目任务';
  const receipt=doc.createElement('pre');receipt.id='opendesk-project-receipt';receipt.hidden=true;
  receipt.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:32vh;overflow:auto;margin:0';
  const generate=doc.createElement('button');generate.type='button';generate.textContent='生成任务提示词';
  const promptLabel=doc.createElement('label');promptLabel.textContent='本地提示词（可选中复制）';promptLabel.hidden=true;
  const prompt=doc.createElement('textarea');prompt.id='opendesk-project-prompt';prompt.rows=6;prompt.readOnly=true;promptLabel.append(prompt);
  const taskNote=doc.createElement('div');taskNote.className='note';
  taskNote.textContent='直接在 ChatGPT 输入并发送，例如“读取当前项目 demo.txt，只读不修改”。完成结果使用框架通知；长内容与真实回执可按需展开查看。修改上下文只填入原输入框，由你发送；保存后无需再发送回执。';
  const optional=doc.createElement('details');
  const optionalSummary=doc.createElement('summary');optionalSummary.textContent='可选：本地提示词与手动任务';
  optional.append(optionalSummary,taskLabel,start,generate,promptLabel);
  const legacy=doc.createElement('details');
  const legacySummary=doc.createElement('summary');legacySummary.textContent='可选：旧版文件请求';
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
  head.append(status,stop,toggle,dismiss);detail.append(taskNote,receipt,settings);
  diagnostic.append(diagnosticTitle,optional,legacy);card.append(head,detail,diagnostic);
  shadow.append(style,card);(doc.body||doc.documentElement).append(root);
  let disposed=false,pending=false,projectPending=false,taskActive=false,projectExists=false,taskUrl='',awaitingTask=false,stopRequested=false,stopPending=false;
  let preferences=normalizeChatGPTFilesPreferences(),preferencesReady=false,dismissed=false,lastData=null,preferencesRevision=0;
  let notificationUnavailable=false,taskSequence=0;
  const announced=new Set();
  const dismissNotification=()=>{try{notify({id:'chatgpt-files'},'dismiss');}catch{/* Display cleanup never dispatches file operations. */}};
  const active=()=>{
    if(win.location.origin!=='https://chatgpt.com')return false;
    return /^\/(?:g\/g-p-[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+\/?$/.test(win.location.pathname);
  };
  const update=()=>{
    if(disposed)return;
    if(taskUrl&&taskUrl!==win.location.href){
      taskActive=false;projectExists=false;awaitingTask=false;stopRequested=false;taskUrl='';
      receipt.textContent='';receipt.hidden=true;status.textContent='';dismissed=false;lastData=null;
      announced.clear();notificationUnavailable=false;dismissNotification();
      detail.hidden=true;toggle.setAttribute('aria-expanded','false');
    }
    const running=preferencesReady&&preferences.enabled;
    const controlsNeeded=projectPending||stopPending||taskActive||awaitingTask||projectExists&&!stopRequested||
      !!(lastData?.result||lastData?.resultText)&&!dismissed;
    root.hidden=!active()||(!preferences.diagnosticsVisible&&!controlsNeeded&&
      (dismissed||detail.hidden&&!notificationUnavailable));
    diagnostic.hidden=!preferencesReady||!preferences.diagnosticsVisible;
    open.disabled=pending||projectPending||stopPending||!active()||!running;
    start.disabled=pending||projectPending||stopPending||!active()||!running;
    stop.disabled=!active()||!projectExists||stopRequested||stopPending;stop.hidden=!projectExists;
    dismiss.hidden=projectPending||stopPending||taskActive||awaitingTask;toggle.hidden=!status.textContent;
  };
  const say=(value,error=false,{key,variant=error?'error':'info',persistent=error}={})=>{
    status.textContent=value;status.classList.toggle('error',error);
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
    catch(error){throw Object.assign(error,{outcome:error.outcome||'OUTCOME_UNKNOWN'});}
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
    if(initiating){stopRequested=false;taskSequence++;}
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
      if(validSource(url))say((error.outcome==='OUTCOME_UNKNOWN'?'任务回执未知 · ':'文件任务失败 · ')+(error.code||'E_PROJECT_TASK')+' · '+error.message+'。请核对任务状态；扩展失效时保存草稿后刷新。',true);
    }finally{
      if(stopping)stopPending=false;else projectPending=false;
      update();
    }
  }
  // Called only by the original Web Flow discovery after its native gesture
  // and complete-turn checks. This adapter has NO independent send observer.
  const submission=snap=>{
    if(disposed||!preferencesReady||!preferences.enabled||!active()||!isChatGPTFileTask(snap.draft))return;
    awaitingTask=true;taskUrl=win.location.href;projectExists=true;
    detail.hidden=true;toggle.setAttribute('aria-expanded','false');
    say('等待本轮回答后处理文件需求…');update();
  };
  const cancellation=()=>{
    if(disposed)return;
    awaitingTask=false;update();
    if(projectExists&&(taskActive||projectPending))void projectRun('stop');
    else{projectExists=false;update();}
  };
  const conversation=observed=>{
    if(disposed||!awaitingTask||!preferencesReady||!preferences.enabled||!validSource(taskUrl))return false;
    const content=observed.user.querySelector?.('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap')||observed.user;
    const description=content.innerText??content.textContent??'';
    if(!isChatGPTFileTask(description))return false;
    awaitingTask=false;
    void projectRun('conversation',description);return true;
  };
  const conflict=()=>{
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
  dismiss.addEventListener('click',event=>{
    if(!event.isTrusted||disposed||projectPending||stopPending||taskActive||awaitingTask)return;
    dismissed=true;detail.hidden=true;toggle.setAttribute('aria-expanded','false');update();
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
    }).catch(error=>{if(!disposed)say((error.code||'E_FILE_HANDOFF')+' · '+error.message+
      '。请先查看是否已有文件审阅页；若未打开，保存原对话草稿后刷新本页，再手动打开入口。',true);})
      .finally(()=>{pending=false;update();});
  });
  const applyPreferences=value=>{
    const next=normalizeChatGPTFilesPreferences(value),changed=!preferencesReady||next.enabled!==preferences.enabled;
    preferences=next;preferencesReady=true;
    if(changed){
      if(awaitingTask)retireObservation();awaitingTask=false;
      if(!next.enabled){
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
    if(disposed)return;disposed=true;win.clearInterval(poll);root.remove();
    dismissNotification();
    api.storage.onChanged.removeListener(onPreferences);
    win.removeEventListener('pagehide',dispose);
  };
  win.addEventListener('pagehide',dispose,{once:true});
  return Object.freeze({dispose,ready,submission,cancellation,conversation,conflict,
    busy:()=>projectPending||stopPending||taskActive||projectExists&&!stopRequested});
}
