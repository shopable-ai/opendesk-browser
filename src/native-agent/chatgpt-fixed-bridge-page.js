import {createChatGPTBridgeSite} from './chatgpt-bridge-site.js';
import {createChatGPTTaskDiscovery} from './chatgpt-task-discovery.js';
import {chatGPTConversationId,inspectChatGPTEditsOnPage} from './workspace-chatgpt.js';
import {validateChatGPTTaskIntent,CHATGPT_TASK_INTENT_PROTOCOL,validateChatGPTTaskRequest,CHATGPT_TASK_REQUEST_PROTOCOL,FIXED_PAGE_TASK_ID,BAIDU_TASK_ID,FIXED_PAGE_URL,baiduSearchTarget} from './chatgpt-task-request.js';
import {CHATGPT_BRIDGE_PROTOCOL} from './chatgpt-bridge-trigger-gate.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const PROBE_INTERVAL_MS=850;
const MAX_DELIVERY_BYTES=8192;
const CONVERSATION_HELP='当前页面尚未建立会话。请先在 ChatGPT 发送一条消息并等待回复，或从左侧选择一个已有对话，再建立浏览器任务请求。';
const REQUEST_HELP='请保持同一窗口的 OpenDesk 侧栏打开。先选择任务并建立请求。官网发送请求后，可手动执行或批准一次自动执行。';
const INSTALLED_CHOICE='__installed__';
// The strict request parser admits flat primitive args/installation fields.
// Storage can reorder their keys without changing the approved scope.
const sameFields=(a,b)=>a===b||Boolean(a&&b&&Object.keys(a).length===Object.keys(b).length&&
  Object.keys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key]));
const sameRequestScope=(a,b)=>a.taskId===b.taskId&&sameFields(a.args,b.args)&&
  a.targetUrl===b.targetUrl&&sameFields(a.installation,b.installation);
const isUserTurn=(snapshot,id)=>snapshot.ok&&snapshot.users.at(-1)?.textContent?.includes(id);

// Focus may synchronously restore a website draft. Inspect after focusing and
// before calling the fixed bridge adapter, so that draft is never replaced.
export function prepareChatGPTBridgeDraft(site,text,initial){
  if(!initial?.ok||!initial.idle||initial.rich||initial.draft!=='')
    return {ok:false,reason:'原生输入框并非空闲空草稿'};
  initial.editor.focus();
  const focused=site.inspect();
  if(!focused.ok||focused.editor!==initial.editor||focused.form!==initial.form||
    focused.route!==initial.route||!focused.idle||focused.rich||focused.draft!==''||
    focused.editor.ownerDocument.activeElement!==focused.editor)
    return {ok:false,reason:'聚焦后官网恢复了草稿或更换了输入框，未覆盖'};
  return site.prepare(text,focused);
}

// Deny-only cooperation with other composer writers. This attribute is public
// DOM state, never admission or proof of Host permission. No finally cleanup:
// an unknown delivery must keep its result out of independent send queues.
export function claimChatGPTBridgeComposer({site,doc,win,snapshot,text}){
  const {form,editor,route}=snapshot;
  const attribute='data-opendesk-composer-owner',owner='chatgpt-fixed-bridge';
  if(form.hasAttribute(attribute))throw fail('E_CHAT_DRAFT','原生输入框已被其他操作占用');
  const url=win.location.href;
  let released=false,writing=true,editIntent=null,editTimer=null,composing=false;
  const clearIntent=()=>{
    editIntent=null;
    if(editTimer!==null){clearTimeout(editTimer);editTimer=null;}
  };
  const clearEditing=()=>{clearIntent();composing=false;};
  const inEditor=event=>event.target===editor||editor.contains?.(event.target);
  const onBlur=event=>{if(inEditor(event))clearEditing();};
  const currentComposer=()=>{
    const current=site.inspect();
    return current.ok&&current.route===route&&current.form===form&&
      current.editor===editor?current:null;
  };
  const release=()=>{
    if(released)return;
    released=true;clearIntent();
    if(form.getAttribute(attribute)===owner)form.removeAttribute(attribute);
    doc.removeEventListener('input',onInput,true);
    doc.removeEventListener('keydown',onKey,true);
    doc.removeEventListener('keyup',clearIntent,true);
    doc.removeEventListener('blur',onBlur,true);
    doc.removeEventListener('focusout',onBlur,true);
    doc.removeEventListener('compositionstart',onCompositionStart,true);
    doc.removeEventListener('compositionend',onCompositionEnd,true);
    win.removeEventListener('blur',clearEditing);
    win.removeEventListener('pagehide',release);
  };
  // execCommand can emit trusted input. A separate native edit intent is
  // required, restricted to this composer and the matching edit type/data.
  const onKey=event=>{
    clearIntent();
    const current=currentComposer();
    if(writing||composing||event.isComposing||event.defaultPrevented||!event.isTrusted||!inEditor(event)||doc.activeElement!==editor||!current)return;
    const shortcut=event.ctrlKey||event.metaKey;
    if(event.key==='Backspace')editIntent={type:/^delete(?:Content|Word|SoftLine)Backward$/};
    else if(event.key==='Delete')editIntent={type:/^delete(?:Content|Word|SoftLine)Forward$/};
    else if(shortcut&&event.key?.toLowerCase()==='v')editIntent={type:/^insertFromPaste$/};
    else if(shortcut&&event.key?.toLowerCase()==='x')editIntent={type:/^deleteByCut$/};
    else if(shortcut&&event.key?.toLowerCase()==='z')editIntent={type:/^history(?:Undo|Redo)$/};
    else if(!shortcut&&!event.altKey&&event.key?.length===1)
      editIntent={type:/^insertText$/,data:event.key};
    if(editIntent){editIntent.before=current.draft;editIntent.keyEvent=event;editTimer=setTimeout(clearIntent,0);}
  };
  const onCompositionStart=event=>{
    clearEditing();
    const current=currentComposer();
    composing=!writing&&event.isTrusted&&inEditor(event)&&
      doc.activeElement===editor&&current?{before:current.draft}:false;
  };
  const onCompositionEnd=event=>{
    const observed=composing;clearEditing();
    const current=currentComposer();
    if(observed&&event.isTrusted&&inEditor(event)&&current&&
      doc.activeElement===editor&&event.data&&event.data===observed.data&&
      current.draft===observed.draft&&current.draft!==observed.before&&current.draft!==text)release();
  };
  const onInput=event=>{
    const intent=editIntent;clearIntent();
    if(writing||!event.isTrusted||!inEditor(event)||doc.activeElement!==editor)return;
    const current=currentComposer();
    if(composing){
      // A start/end pair and a changed string alone do not prove an IME edit.
      // Bind the final nonempty composition data to its actual native input.
      if(current&&event.isComposing&&event.inputType==='insertCompositionText'&&
        typeof event.data==='string'&&event.data){
        composing.data=event.data;composing.draft=current.draft;
      }else composing=false;
      return;
    }
    if(!intent||
      !intent.type.test(event.inputType)||
      (intent.data!==undefined&&intent.data!==event.data))return;
    if(current&&current.draft!==intent.before&&current.draft!==text){
      const draft=current.draft;
      editIntent=intent;
      // Website handlers may cancel keydown after this capture listener or
      // even after issuing an editing command. Wait for dispatch to finish.
      editTimer=setTimeout(()=>{
        clearIntent();
        const latest=currentComposer();
        if(!intent.keyEvent.defaultPrevented&&doc.activeElement===editor&&latest?.draft===draft)release();
      },0);
    }
  };
  form.setAttribute(attribute,owner);
  doc.addEventListener('input',onInput,true);
  doc.addEventListener('keydown',onKey,true);
  doc.addEventListener('keyup',clearIntent,true);
  doc.addEventListener('blur',onBlur,true);
  doc.addEventListener('focusout',onBlur,true);
  doc.addEventListener('compositionstart',onCompositionStart,true);
  doc.addEventListener('compositionend',onCompositionEnd,true);
  win.addEventListener('blur',clearEditing);
  win.addEventListener('pagehide',release,{once:true});
  return {
    isHeld(){return !released&&form.getAttribute(attribute)===owner;},
    written(){writing=false;},
    navigation(){if(win.location.href!==url)release();},
    confirmed(){
      const current=site.inspect();
      if(current.ok && current.route===route && current.form===form &&
        current.editor===editor && current.draft==='' && !current.rich)release();
    }
  };
}

export function isChatGPTBridgeContinuation(before,current,resultUser){
  // Match the retained history suffix, as site.confirm does for delivery.
  // Keep the latest request/candidate anchors; a reused old reply is not new.
  const appendedAfterSuffix=(prior,nodes)=>{
    if(!prior.length||nodes.length<2)return false;
    const offset=prior.indexOf(nodes[0]);
    return offset>=0&&nodes.length===prior.length-offset+1&&
      prior.slice(offset).every((node,index)=>nodes[index]===node)&&
      !prior.includes(nodes.at(-1));
  };
  const doc=before.editor?.ownerDocument;
  if(!current?.ok||current.busy||!current.answerComplete||
    current.route!==before.route||!doc||current.editor?.ownerDocument!==doc||
    current.users.at(-1)!==resultUser||
    !appendedAfterSuffix(before.users,current.users)||
    !appendedAfterSuffix(before.assistants,current.assistants)||
    [...current.users,...current.assistants].some(node=>!node.isConnected||node.ownerDocument!==doc))return false;
  const order=resultUser.compareDocumentPosition(current.assistants.at(-1));
  return !(order&1)&&Boolean(order&4); // connected, subsequent assistant only
}

// The user chooses the task and parameters; the model can only echo the exact
// candidate. It cannot approve or change a scope minted by the trusted Worker.
export function bridgePrompt(requestId,taskId=FIXED_PAGE_TASK_ID,args={},selection={}){
  const request=validateChatGPTTaskRequest(JSON.stringify({
    protocol:CHATGPT_TASK_REQUEST_PROTOCOL,kind:'opendesk.task.request',
    version:1,requestId,taskId,args,...selection
  }));
  const goal=request.installation?
    '用户目标：调用已安装脚本“'+request.taskId+'”的已选版本，目标网址和参数以如下 JSON 为准。浏览器动作由该脚本决定。':request.taskId===BAIDU_TASK_ID?
    '用户目标：使用已安装的百度搜索 Task 搜索关键词“'+request.args.query+
      '”，只提取真实百度页面中最多三条通过自然结果过滤的标题、摘要和链接。':
    '用户目标：使用 OpenDesk 打开固定 Task 绑定的 httpbingo HTML 示例网页，读取标题与一段正文。';
  return [
    '请在当前官方 ChatGPT 对话中提出一个 OpenDesk 自动化任务候选。这不是你已注册的 MCP 工具，',
    '也不是任何模型或网页可以直接批准执行的权限；真正运行需要我点击 OpenDesk 执行，或由我单独批准一次自动触发。',
    goal,
    '待扩展把真实结果发送回这段原始对话后，再根据实际读取结果总结；不要提前虚构网页内容。',
    '现在只输出下面这一段唯一的 opendesk-request JSON 代码块，不要输出第二个请求、模拟执行结果、授权声称或其他代码块。',
    '不要改变任何字段、requestId、taskId、args、目标或安装版本。扩展会对这一轮回复与原对话身份进行严格核查。',
    '请保留 JSON 字符串转义，不要把网址转换为 Markdown 链接。',
    '请将下面的 JSON 原样放在唯一的 opendesk-request 代码块中：',JSON.stringify(request).replaceAll('/', '\\/')
  ].join(''); // Keep exact JSON bytes intact in one plain paragraph.
}

// Fixed, first-party, isolated extension content script. No page-provided
// event, model text, site JS or USER_SCRIPT receives a Chrome authority object.
export function initChatGPTFixedBridgePage({api=chrome,doc=document,win=window,
  site=createChatGPTBridgeSite({doc,win}),readPage=inspectChatGPTEditsOnPage}={}){
  if(win!==win.top||win.location.origin!=='https://chatgpt.com')return null;
  if(doc.getElementById('opendesk-fixed-bridge-r12'))return null;
  const root=doc.createElement('div');
  root.id='opendesk-fixed-bridge-r12';
  root.setAttribute('data-opendesk-ui-owner','fixed-chat-bridge-r12');
  root.style.cssText='position:fixed;right:14px;top:72px;z-index:2147483645;max-width:min(330px,calc(100vw - 28px))';
  const shadow=root.attachShadow({mode:'closed'});
  const style=doc.createElement('style');
  // Isolated page UI maps the canonical token values; never inject host CSS.
  style.textContent=':host{all:initial}*{box-sizing:border-box}.panel{font:12px/1.45 system-ui,-apple-system,sans-serif;background:#fff;color:#1b2c49;border:1px solid #e1e8f1;border-radius:12px;box-shadow:0 4px 16px #0002;padding:12px;max-width:330px;max-height:calc(100vh - 96px);overflow:auto}.heading{font-weight:650;font-size:13px;margin-bottom:8px}.fields{display:grid;gap:8px;margin-bottom:8px}.field{display:grid;gap:4px}.field[hidden]{display:none}.field span,.hint,.status,.selection{color:#53647e}.hint,.selection{margin:8px 0;overflow-wrap:anywhere;white-space:pre-wrap}select,input,textarea{font:inherit;width:100%;min-width:0;min-height:36px;padding:8px;border:1px solid #7f8da1;border-radius:8px;background:inherit;color:inherit}textarea{resize:vertical;min-height:64px}select:focus-visible,input:focus-visible,textarea:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #365eda;outline-offset:2px}.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button{font:inherit;min-height:36px;background:#f5f7fb;border:1px solid #7f8da1;border-radius:8px;cursor:pointer;padding:8px;color:inherit}button:disabled,select:disabled,input:disabled,textarea:disabled{opacity:.55;cursor:default}.run{background:#365eda;color:#fff;border-color:#365eda}.status{margin-top:8px;overflow-wrap:anywhere;white-space:pre-wrap}.error{color:#ae3d4b}details{margin-top:8px}summary{cursor:pointer}pre{font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto}@media(prefers-color-scheme:dark){.panel{background:#151c28;color:#e9eef7;border-color:#374457}.status,.field span,.hint,.selection{color:#b3c1d3}button{background:#222d3e;border-color:#6d809b;color:#e9eef7}select,input,textarea{border-color:#6d809b}.run{background:#3566ba;color:white}.error{color:#ff9ea6}}';
  const panel=doc.createElement('div');panel.className='panel';
  const heading=doc.createElement('div');heading.className='heading';
  heading.textContent='OpenDesk · 浏览器任务';
  const fields=doc.createElement('div');fields.className='fields';
  const taskField=doc.createElement('label');taskField.className='field';
  const taskCaption=doc.createElement('span');taskCaption.textContent='选择已安装脚本';
  const taskSelect=doc.createElement('select');taskSelect.setAttribute('aria-label','选择浏览器任务');
  const fixedOption=doc.createElement('option');fixedOption.value=FIXED_PAGE_TASK_ID;
  fixedOption.textContent='读取示例网页 · page.read.fixed';
  const baiduOption=doc.createElement('option');baiduOption.value=BAIDU_TASK_ID;
  baiduOption.textContent='百度搜索前三条 · baidu.search.top3';
  const installedOption=doc.createElement('option');installedOption.value=INSTALLED_CHOICE;
  installedOption.textContent='从已安装脚本中选择…';
  taskSelect.append(fixedOption,baiduOption,installedOption);taskSelect.value=FIXED_PAGE_TASK_ID;
  taskField.append(taskCaption,taskSelect);
  const queryField=doc.createElement('label');queryField.className='field';
  const queryCaption=doc.createElement('span');queryCaption.textContent='百度搜索关键词';
  const queryInput=doc.createElement('input');queryInput.type='text';queryInput.maxLength=120;
  queryInput.value='OpenDesk Browser';queryInput.placeholder='输入搜索关键词';
  queryInput.setAttribute('aria-label','百度搜索关键词');
  queryField.append(queryCaption,queryInput);
  const targetField=doc.createElement('label');targetField.className='field';
  const targetCaption=doc.createElement('span');targetCaption.textContent='打开的目标网址';
  const targetInput=doc.createElement('input');targetInput.type='url';targetInput.maxLength=2048;
  targetInput.setAttribute('aria-label','打开的目标网址');targetInput.placeholder='填写脚本要操作的完整网址';
  targetField.append(targetCaption,targetInput);
  const argsField=doc.createElement('label');argsField.className='field';
  const argsCaption=doc.createElement('span');argsCaption.textContent='脚本参数（JSON）';
  const argsInput=doc.createElement('textarea');argsInput.value='{}';argsInput.maxLength=2048;
  argsInput.setAttribute('aria-label','脚本参数 JSON');
  const argsHelp=doc.createElement('span');
  argsField.append(argsCaption,argsInput,argsHelp);fields.append(taskField,queryField,targetField,argsField);
  const selection=doc.createElement('div');selection.className='selection';
  const hint=doc.createElement('div');hint.className='hint';
  hint.textContent='由 OpenDesk 自动化脚本操作浏览器，结果发送到当前聊天。请先核对脚本、网址和参数。';
  const bar=doc.createElement('div');bar.className='bar';
  const prepareButton=doc.createElement('button');prepareButton.textContent='建立请求';
  const autoButton=doc.createElement('button');autoButton.textContent='批准本次自动执行';
  const runButton=doc.createElement('button');runButton.className='run';runButton.textContent='执行';
  const cancelButton=doc.createElement('button');cancelButton.textContent='停止/取消';
  const status=doc.createElement('div');status.className='status';status.setAttribute('role','status');
  const details=doc.createElement('details');
  const summary=doc.createElement('summary');summary.textContent='执行详情';
  const identity=doc.createElement('pre');details.append(summary,identity);
  const adoptButton=doc.createElement('button');adoptButton.textContent='采用对话任务';
  const viewButton=doc.createElement('button');viewButton.textContent='查看执行页面';
  const preapproveButton=doc.createElement('button');preapproveButton.textContent='预批准一次 · 5 分钟';
  bar.append(prepareButton,autoButton,runButton,cancelButton,adoptButton,viewButton,preapproveButton);
  panel.append(heading,hint,fields,selection,bar,status,details);shadow.append(style,panel);
  (doc.body||doc.documentElement).append(root);
  let pending=false,preparing=false,cancelPending=false,deliveryPending=false,composition=false,closed=false;
  let state=null,composerClaim=null; // latest claim for navigation cleanup only
  let conversationReady=null,loadingTasks=false;
  const installedTasks=new Map(),installedOptions=[];
  const discovery=createChatGPTTaskDiscovery();
  discovery.reset(site.inspect());
  const selectedTask=()=>installedTasks.get(taskSelect.value);
  const taskLabel=owner=>owner?.taskId||selectedTask()?.taskId||taskSelect.value;
  const targetLabel=owner=>owner?.targetUrl||(owner?.taskId===BAIDU_TASK_ID?
    baiduSearchTarget({protocol:CHATGPT_TASK_REQUEST_PROTOCOL,kind:'opendesk.task.request',version:1,
      requestId:owner.requestId,taskId:owner.taskId,args:owner.args}):FIXED_PAGE_URL);
  const showIdentity=()=>{identity.textContent=state?[
    'requestId: '+state.requestId,
    ...(state.candidate?['candidateId: '+state.candidate.candidateId]:[]),
    ...(state.installation?['scriptId: '+state.installation.scriptId,'revision: '+state.installation.revision,
      'sourceHash: '+state.installation.contentHash,'installationId: '+state.installation.installationId,
      'generation: '+state.installation.generation]:[]),
    ...(state.future?['有效期至: '+new Date(state.expiresAt).toLocaleString()]:[]),
    ...(state.runId?['runId: '+state.runId]:[]),...(state.resultId?['resultId: '+state.resultId]:[])
  ].join('\n'):'';details.hidden=!state;};
  const note=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
  const update=()=>{
    const hasConversation=win.location.origin==='https://chatgpt.com'&&Boolean(chatGPTConversationId(win.location.href));
    if(!state&&conversationReady!==hasConversation){
      conversationReady=hasConversation;
      note(hasConversation?REQUEST_HELP:CONVERSATION_HELP);
    }
    const busy=pending||cancelPending||deliveryPending;
    const ready=!!state&&!state.future&&!state.cancelled&&!state.attempted&&!state.deliveryStarted&&win.location.href===state.url;
    adoptButton.disabled=busy||loadingTasks||!hasConversation||Boolean(state&&!state.cancelled&&!state.attempted);
    prepareButton.disabled=busy||loadingTasks||!hasConversation||taskSelect.value===INSTALLED_CHOICE||
      (taskSelect.value.startsWith('installed:')&&!selectedTask());
    preapproveButton.disabled=busy||loadingTasks||!hasConversation||!selectedTask()||Boolean(state&&!state.cancelled&&!state.attempted);
    autoButton.disabled=busy||!ready||state.mode==='auto';
    runButton.disabled=busy||!ready||state.mode==='auto';
    cancelButton.disabled=preparing||!state||state.cancelled||state.sendSubmitted||state.settled;
    viewButton.disabled=!state?.runId||state.cancelled||state.executionFinished||state.settled||
      state.deliveryStarted||state.progressRank!==2||state.viewPending||win.location.href!==state.url;
    const editing=busy||Boolean(state&&!state.attempted);
    taskSelect.disabled=editing||loadingTasks;queryInput.disabled=editing;
    targetInput.disabled=editing;argsInput.disabled=editing;
    queryField.hidden=taskSelect.value!==BAIDU_TASK_ID;
    targetField.hidden=!selectedTask()&&!state?.candidate;argsField.hidden=targetField.hidden;
    if(state?.candidate){
      selection.textContent='本次脚本：'+state.taskId+'\n目标：'+state.targetUrl+'\n参数：'+JSON.stringify(state.args);
    }else if(!state||state.attempted){
      const task=selectedTask();
      selection.textContent=task?'将调用：'+task.taskId+' @ '+task.version+'\n'+(task.description||'浏览器动作由已安装脚本决定。'):
        taskSelect.value===INSTALLED_CHOICE?'正在读取已安装脚本…':
        '将调用：'+taskSelect.value+'\n'+(taskSelect.value===BAIDU_TASK_ID?'打开百度，读取最多三条自然结果。':'打开 '+FIXED_PAGE_URL+'，读取标题和正文。');
    }
    showIdentity();
  };
  const assertActive=owner=>{
    if(owner!==state||owner.cancelled)throw fail('E_BRIDGE_CANCELLED','本次请求已取消，禁止继续执行或回传');
  };
  const validatePage=()=>{
    if(!chatGPTConversationId(win.location.href)||win.location.origin!=='https://chatgpt.com')
      throw fail('E_CHAT_TARGET',CONVERSATION_HELP);
    if(state&&state.url!==win.location.href)throw fail('E_CHAT_TARGET','会话已更换，请重新建立请求');
  };
  const send=async message=>{
    const reply=await api.runtime.sendMessage({protocol:CHATGPT_BRIDGE_PROTOCOL,...message});
    if(reply?.ok!==true)throw fail(reply?.error?.code||'E_BRIDGE_TRANSPORT',
      reply?.error?.message||'可信任务宿主未响应，请确认同一窗口的 OpenDesk 侧栏保持打开；本次回执为 UNKNOWN，请按原请求核查');
    return reply.data;
  };
  const adoptedMessage=()=>({adoptedRequest:state.adoptedRequest,candidateText:state.candidate.text,
    turnKey:state.candidate.turnKey,answerKey:state.candidate.answerKey});
  const observe=()=>{
    validatePage();
    if(!state)throw fail('E_BRIDGE_REQUEST','尚未建立当前请求');
    if(state.candidate){
      const page=readPage({expectedUrl:state.url,protocols:[CHATGPT_TASK_INTENT_PROTOCOL],taskIntent:true,requireComplete:true});
      if(!page.ok)throw fail(page.error.code,page.error.message);
      if(page.blocks?.length!==1||page.blocks[0]!==state.candidate.text||
        page.turnKey!==state.candidate.turnKey||page.answerKey!==state.candidate.answerKey)
        throw fail('E_BRIDGE_CONTEXT','采用的对话任务、轮次或回答已改变');
      validateChatGPTTaskIntent(page.blocks[0]);
      return {page,request:state.adoptedRequest};
    }
    const page=readPage({expectedUrl:state.url,requestId:state.requestId,
      protocols:[CHATGPT_TASK_REQUEST_PROTOCOL],requireUserEcho:true});
    if(!page.ok)throw fail(page.error.code,page.error.message);
    const siteSnapshot=site.inspect();
    if(!siteSnapshot.ok||!siteSnapshot.answerComplete||siteSnapshot.busy||
      !isUserTurn(siteSnapshot,state.requestId))
      throw fail('E_CHAT_PENDING','本轮请求尚无完整的官方 AI 回复');
    const request=validateChatGPTTaskRequest(page.blocks[0]);
    if(request.requestId!==state.requestId||!sameRequestScope(request,state))
      throw fail('E_BRIDGE_CONTEXT','模型给出的任务或关键词与本次用户选择不一致');
    if(state.approvedTurnKey&&state.approvedTurnKey!==page.turnKey)
      throw fail('E_BRIDGE_CONTEXT','批准对应的用户轮次已经改变');
    return {page,request};
  };
  const execute=async mode=>{
    if(!state||state.cancelled||state.attempted||pending||cancelPending||deliveryPending)return;
    const owner=state;
    pending=true;update();
    try {
      validatePage();
      const {page}=observe();
      if(mode==='manual'){
        await send({kind:state.candidate?'authorize-task':'authorize',requestId:state.requestId,mode,
          ...(state.candidate?adoptedMessage():{})});
        assertActive(owner);
      }
      if(state.mode==='auto'&&mode!=='auto')throw fail('E_BRIDGE_MODE','已批准自动执行，不可更改触发身份');
      state.attempted=true;state.mode=mode;
      note('已识别 '+taskLabel(state)+'，参数 '+JSON.stringify(state.args)+'。\n正在核验安装版本；尚未确认开始运行。');
      update();
      // No local retry after a transport failure. The worker's durable trigger
      // fence and Controller command journal determine whether effects happened.
      const reply=await send({kind:'execute',requestId:state.requestId,mode,
        ...(state.candidate?{adoptedRequest:state.adoptedRequest}:{}),
        candidateText:page.blocks[0],sourceUrl:state.url,source:state.source,turnKey:page.turnKey,
        answerKey:page.answerKey});
      assertActive(owner);
      state.settled=true;
      state.runId=reply?.runId||state.runId;state.resultId=reply?.resultId;
      const baiduStatus=reply?.taskId===BAIDU_TASK_ID&&reply.taskStatus?
        ('；百度结果：'+({success:'成功',no_results:'无自然搜索结果',
          blocked:'访问受阻或验证码',dom_unavailable:'搜索区域不可用',
          dom_changed:'页面结构未匹配'}[reply.taskStatus]||'状态未知')+
          '（'+String(reply.resultCount??0)+' 条）'):'';
      note((reply?.sent&&reply?.aiReplyObserved?'真实结果已回传，官方 AI 已完成回复':
        reply?.sent?'原会话已确认收到真实结果，官方 AI 回复仍待核查':
        '任务已返回，但自动发送未获完整回执')+baiduStatus);
    }catch(error){
      if(owner.cancelled)return;
      note((error.code||'E_BRIDGE')+'：'+(error.message||'执行失败')+
        (state?.attempted?'；不会自动重放':''),
        true);
    }finally{owner.executionFinished=true;pending=false;update();}
  };
  viewButton.addEventListener('click',async event=>{
    if(!event.isTrusted||viewButton.disabled)return;
    const owner=state;owner.viewPending=true;update();
    try{
      const receipt=await send({kind:'show-execution-page',requestId:owner.requestId,runId:owner.runId,
        source:owner.source,sourceUrl:owner.url});
      assertActive(owner);
      if(receipt?.shown!==true||receipt.runId!==owner.runId)throw fail('E_BRIDGE_TARGET','查看回执未知');
      if(!owner.executionFinished&&owner.progressRank===2)
        note('已切换到本次运行的真实目标页面。任务继续执行，结果仍回到这段原聊天。');
    }catch(error){
      if(owner===state&&!owner.cancelled&&!owner.executionFinished&&owner.progressRank===2)
        note((error.code||'E_BRIDGE_TARGET')+'：'+error.message+'；不会另开页面或重跑任务',true);
    }finally{owner.viewPending=false;update();}
  });
  const adoptLatest=async({automatic=false,grant=null}={})=>{
    if(pending||cancelPending||deliveryPending||closed)return;
    pending=true;preparing=true;update();
    try{
      validatePage();const url=win.location.href;
      const snap=site.inspect();
      if(!snap.ok||snap.busy||!snap.idle||!snap.answerComplete)
        throw fail('E_CHAT_STREAMING','等待官网完整回复后才可准备任务');
      const page=readPage({expectedUrl:url,protocols:[CHATGPT_TASK_INTENT_PROTOCOL],taskIntent:true,requireComplete:true});
      if(!page.ok){
        // Ordinary replies, including the AI continuation after our result,
        // are not task proposals and must not replace an execution receipt.
        if(automatic&&page.error?.code==='E_CHAT_FORMAT')return;
        throw fail(page.error.code,page.error.message);
      }
      const intent=validateChatGPTTaskIntent(page.blocks[0]);
      if(grant){
        assertActive(grant);
        if(!grant.future||grant.bindingAttempted||Date.now()>=grant.expiresAt||
          page.turnKey===grant.baseline.turnKey||page.answerKey===grant.baseline.answerKey)
          throw fail('E_BRIDGE_APPROVAL','不是预批准后产生的新完整任务');
        grant.bindingAttempted=true; // A lost bind ACK is never automatically retried.
      }
      const prepared=await send({kind:grant?'bind-preapproved-task':'adopt-task',
        ...(grant?{requestId:grant.requestId}:{}),candidateText:page.blocks[0],turnKey:page.turnKey,answerKey:page.answerKey});
      if(grant){
        assertActive(grant);
        if(prepared.requestId!==grant.requestId||prepared.expiresAt!==grant.expiresAt||!sameRequestScope(prepared,grant))
          throw fail('E_BRIDGE_CONTEXT','预批准范围或期限已改变');
      }
      if(win.location.href!==url||prepared.source?.url!==url||prepared.candidate?.text!==page.blocks[0]||
        prepared.candidate?.turnKey!==page.turnKey||prepared.candidate?.answerKey!==page.answerKey)
        throw fail('E_BRIDGE_CONTEXT','采用期间对话或候选身份已改变');
      const adoptedRequest=validateChatGPTTaskRequest(JSON.stringify({protocol:CHATGPT_TASK_REQUEST_PROTOCOL,
        kind:'opendesk.task.request',version:1,requestId:prepared.requestId,taskId:prepared.taskId,
        args:prepared.args,targetUrl:prepared.targetUrl,installation:prepared.installation}));
      if(adoptedRequest.taskId!==intent.taskId||adoptedRequest.targetUrl!==intent.targetUrl)
        throw fail('E_BRIDGE_CONTEXT','采用回执与对话任务不匹配');
      state={...adoptedRequest,url,source:prepared.source,expiresAt:prepared.expiresAt,candidate:prepared.candidate,
        adoptedRequest,attempted:false,cancelled:false,sendSubmitted:false,settled:false,deliveryStarted:false,
        mode:grant?'auto':null,approvedTurnKey:page.turnKey};
      // Show the accepted request in the controls too, rather than leaving a
      // previous manual selection above the correct execution summary.
      const key='installed:'+state.taskId;
      let option=installedOptions.find(item=>item.value===key);
      if(!option){
        option=doc.createElement('option');option.value=key;
        taskSelect.append(option);installedOptions.push(option);
      }
      const name=installedTasks.get(key)?.name;
      option.textContent=(name?name+' · ':'')+state.taskId+' @ '+state.installation.version;
      taskSelect.value=key;targetInput.value=state.targetUrl;argsInput.value=JSON.stringify(state.args);
      argsHelp.textContent='';
      selection.textContent='本次脚本：'+state.taskId+'\n目标：'+state.targetUrl+'\n参数：'+JSON.stringify(state.args);
      observe();note(grant?'已匹配预批准的新任务，将自动执行一次。':automatic?
        '已自动识别待执行任务。请核对脚本、网址和参数，只需点击一次“执行”。':
        '已采用对话任务，尚未执行。请核对脚本、网址和参数，点击“执行”或批准本次自动执行。');
    }catch(error){
      if(grant)grant.attempted=true;
      note((error.code||'E_BRIDGE')+'：'+error.message+'；未自动重试。',true);
    }
    finally{pending=false;preparing=false;update();}
    if(grant&&state!==grant&&state?.mode==='auto')void execute('auto');
  };
  adoptButton.addEventListener('click',event=>{
    if(!event.isTrusted||adoptButton.disabled)return;
    return adoptLatest();
  });
  preapproveButton.addEventListener('click',async event=>{
    if(!event.isTrusted||preapproveButton.disabled||pending||cancelPending||deliveryPending)return;
    pending=true;preparing=true;update();
    try{
      validatePage();const url=win.location.href,selected=selectedTask(),choice=taskSelect.value;
      const snap=site.inspect();
      if(!selected)throw fail('E_BRIDGE_INSTALL','请从已安装脚本中选择准确版本');
      if(composition||!snap.ok||!snap.idle||snap.busy||!snap.answerComplete||snap.rich||snap.draft!=='')
        throw fail('E_CHAT_PENDING','请在官网空闲且无草稿、附件或输入法编辑时预批准；正在生成的回复不能预批准');
      const baseline=readPage({expectedUrl:url,identityOnly:true,taskIntent:true,requireComplete:true});
      if(!baseline.ok||!baseline.answerKey||baseline.turnKey==='no-user')
        throw fail('E_CHAT_TURN','请先建立正式对话并等待上一条回答完成');
      const inputArgs=argsInput.value,targetUrl=targetInput.value.trim();
      let args;try{args=JSON.parse(inputArgs);}catch{throw fail('E_BRIDGE_FORMAT','脚本参数必须是完整 JSON 对象');}
      const prepared=await send({kind:'preapprove-next-task',taskId:selected.taskId,args,targetUrl,installation:selected.installation});
      const current=site.inspect();
      const after=readPage({expectedUrl:url,identityOnly:true,taskIntent:true,requireComplete:true});
      if(win.location.href!==url||taskSelect.value!==choice||inputArgs!==argsInput.value||targetInput.value.trim()!==targetUrl||
        !current.ok||!current.idle||current.busy||!current.answerComplete||current.rich||current.draft!==''||composition||
        !after.ok||after.turnKey!==baseline.turnKey||after.answerKey!==baseline.answerKey||
        prepared.baseline?.turnKey!==baseline.turnKey||prepared.baseline?.answerKey!==baseline.answerKey||
        prepared.source?.url!==url||prepared.taskId!==selected.taskId||prepared.targetUrl!==targetUrl||
        !sameFields(prepared.installation,selected.installation)||
        !Number.isFinite(prepared.expiresAt)||prepared.expiresAt<=Date.now()||prepared.expiresAt>Date.now()+300000)
        throw fail('E_BRIDGE_CONTEXT','预批准期间会话、回答或安装范围已改变；不会绑定旧生成');
      state={...prepared,url,future:true,attempted:false,cancelled:false,mode:'auto'};
      discovery.reset(current);
      selection.textContent='预批准脚本：'+state.taskId+'\n目标：'+state.targetUrl+'\n参数：'+JSON.stringify(state.args);
      note('已预批准一次，5 分钟内有效。请现在向官网发送新指令；仅匹配此脚本、网址、参数和安装版本的新完整回复可自动运行。');
    }catch(error){note((error.code||'E_BRIDGE_APPROVAL')+'：'+error.message+'；不会自动重试。',true);}
    finally{pending=false;preparing=false;update();}
  });
  prepareButton.addEventListener('click',async event=>{
    if(!event.isTrusted||pending||cancelPending||deliveryPending)return;
    pending=true;preparing=true;update();
    try {
      validatePage();
      const snap=site.inspect();
      if(!snap.ok)throw fail('E_CHAT_COMPOSER',snap.reason||'官网输入框不可用，未覆盖');
      if(composition)throw fail('E_CHAT_IME','输入法仍在编辑，未覆盖');
      if(!snap.idle)throw fail('E_CHAT_PENDING','官网回复尚未确认完成，未覆盖');
      if(snap.rich||snap.draft!=='')throw fail('E_CHAT_DRAFT','官网有草稿或附件，未覆盖');
      const selected=selectedTask(),choice=taskSelect.value;
      if(choice===INSTALLED_CHOICE)throw fail('E_BRIDGE_REQUEST','请先选择一个已安装脚本');
      const taskId=selected?.taskId||choice;
      let args=taskId===BAIDU_TASK_ID&&!selected?{query:String(queryInput.value||'').trim(),limit:3}:{};
      let scope={};
      if(selected){
        const inputArgs=argsInput.value;
        try{args=JSON.parse(inputArgs);}catch{throw fail('E_BRIDGE_FORMAT','脚本参数必须是完整 JSON 对象');}
        const targetUrl=targetInput.value.trim();
        const checked=await send({kind:'prepare-task',taskId,args,targetUrl,installation:selected.installation});
        if(taskSelect.value!==choice||argsInput.value!==inputArgs||targetInput.value.trim()!==targetUrl)
          throw fail('E_BRIDGE_CONTEXT','核验期间脚本、参数或网址发生变化');
        if(checked.taskId!==taskId||checked.targetUrl!==targetUrl||
          !sameFields(checked.installation,selected.installation))
          throw fail('E_BRIDGE_CONTEXT','可信宿主返回的安装版本或目标不匹配');
        args=checked.args;scope={targetUrl:checked.targetUrl,installation:checked.installation};
      }
      // Refuse malformed queries before minting a one-use Worker nonce.
      validateChatGPTTaskRequest(JSON.stringify({protocol:CHATGPT_TASK_REQUEST_PROTOCOL,
        kind:'opendesk.task.request',version:1,
        requestId:'00000000-0000-4000-8000-000000000000',taskId,args,...scope}));
      const url=win.location.href;
      const prepared=await send({kind:'prepare',taskId,args,...scope});
      if(taskSelect.value!==choice||(!selected&&taskId===BAIDU_TASK_ID&&String(queryInput.value||'').trim()!==args.query))
        throw fail('E_BRIDGE_CONTEXT','准备期间任务或关键词已改变，请重新建立请求');
      if(prepared.taskId!==undefined&&!sameRequestScope(prepared,{taskId,args,...scope}))
        throw fail('E_BRIDGE_CONTEXT','可信准备回执的任务和参数不匹配');
      if(selected&&!sameRequestScope(prepared,{taskId,args,...scope}))
        throw fail('E_BRIDGE_CONTEXT','已安装脚本未获得完整的一次性版本和目标绑定');
      if(taskId===BAIDU_TASK_ID&&prepared.taskId!==BAIDU_TASK_ID)
        throw fail('E_BRIDGE_CONTEXT','百度请求未获得可信 Worker 的任务参数绑定');
      if(win.location.href!==url||prepared.source?.url!==url)throw fail('E_CHAT_TARGET','准备期间切换了对话');
      if(composition)throw fail('E_CHAT_IME','准备期间输入法开始编辑，未回填');
      const prompt=bridgePrompt(prepared.requestId,taskId,args,scope);
      const inserted=prepareChatGPTBridgeDraft(site,prompt,snap);
      if(!inserted?.ok)throw fail('E_CHAT_FILL',inserted?.reason||'无法写入原生输入框');
      state={requestId:prepared.requestId,taskId,args,...scope,url,source:prepared.source,expiresAt:prepared.expiresAt,
        attempted:false,cancelled:false,sendSubmitted:false,settled:false,deliveryStarted:false,mode:null,approvedTurnKey:null};
      selection.textContent='本次脚本：'+taskId+'\n目标：'+targetLabel(state)+'\n参数：'+JSON.stringify(args);
      note('已建立请求，尚未执行。\n请先在 ChatGPT 发送，待识别到任务标记后点击“执行”，或批准本次自动执行。');
    }catch(error){note((error.code||'E_BRIDGE')+'：'+error.message,true);}
    finally{pending=false;preparing=false;update();}
  });
  autoButton.addEventListener('click',async event=>{
    if(!event.isTrusted||pending||cancelPending||deliveryPending||!state||state.cancelled||state.mode||state.attempted)return;
    const owner=state;
    pending=true;update();
    try{
      validatePage();
      if(state.candidate){
        const {page}=observe();
        await send({kind:'authorize-task',requestId:state.requestId,mode:'auto',...adoptedMessage()});
        assertActive(owner);state.approvedTurnKey=page.turnKey;state.mode='auto';
        note('已批准本次采用的对话任务，尚未运行；候选核验通过后只执行一次。');return;
      }
      const snap=site.inspect();
      if(!snap.ok||!isUserTurn(snap,state.requestId))
        throw fail('E_CHAT_TURN','请先在官网发送包含本次请求身份的用户消息');
      const identity=readPage({expectedUrl:state.url,identityOnly:true,requestId:state.requestId});
      if(!identity.ok||identity.turnKey==='no-user')throw fail('E_CHAT_TURN','无法确认本次用户轮次');
      await send({kind:'authorize',requestId:state.requestId,mode:'auto'});
      assertActive(owner);
      state.approvedTurnKey=identity.turnKey;state.mode='auto';
      note('已批准 '+taskLabel(state)+' 本次自动执行，尚未运行。\n正在等待本轮 AI 完整返回任务标记；匹配后只运行一次，结果回到当前聊天。');
    }catch(error){if(owner.cancelled)return;note((error.code||'E_BRIDGE_APPROVAL')+'：'+error.message,true);}
    finally{pending=false;update();}
  });
  cancelButton.addEventListener('click',async event=>{
    if(!event.isTrusted||preparing||!state||state.cancelled||state.sendSubmitted||state.settled)return;
    const owner=state,attempted=owner.attempted;
    // Fence synchronously, before either transport can yield. Keep the original
    // operation pending until its own promise settles; cancellation is not Run release.
    owner.cancelled=true;owner.attempted=true;cancelPending=true;
    note('已在本页取消后续执行与回传；正在核查撤销和停止请求…');update();
    const revoke=send({kind:'revoke-request',requestId:owner.requestId});
    const stop=attempted?send({kind:'cancel',requestId:owner.requestId,
      source:owner.source,sourceUrl:owner.url}):Promise.resolve(null);
    try{
      const results=await Promise.allSettled([revoke,stop]);
      const revoked=results[0].status==='fulfilled'&&results[0].value?.requestId===owner.requestId&&
        results[0].value?.revoked===true;
      const receipt=results[1].status==='fulfilled'?results[1].value:null;
      const runHint=typeof receipt?.runId==='string'?'；运行 ID：'+receipt.runId:'';
      const stopped=!attempted||(receipt?.cancelled===true&&
        (receipt.runId===null||typeof receipt.runId==='string')&&
        ['stop-requested','awaiting-run-identity','settled'].includes(receipt.executionState)&&
        receipt.deliveryState==='cancelled');
      if(!revoked||!stopped||owner.deliveryStarted){
        note('UNKNOWN：本页已禁止继续执行与回传；停止或交付状态未确认，不保证已停止、释放或撤回。'+runHint,true);
      }else{
        note(attempted?'已取消后续回传；停止请求已登记，执行停止和资源释放仍待核查。'+runHint:
          '本次请求已取消，授权已撤销；不会执行。');
      }
    }finally{cancelPending=false;update();}
  });
  runButton.addEventListener('click',event=>{
    if(event.isTrusted)void execute('manual');
  });
  let autoPollBusy=false;
  const poll=win.setInterval(()=>{
    if(closed)return;
    const snapshot=site.inspect();
    const discovered=discovery.observe(snapshot);
    if(!state)update(); // ChatGPT creates the first /c/... route without reloading.
    composerClaim?.navigation();
    if(state&&win.location.href!==state.url){
      // Fence the old owner before releasing the new conversation's UI. Its
      // in-flight callbacks retain this cancelled object and cannot deliver
      // into a replacement state. The SW navigation fence owns revocation.
      state.cancelled=true;state.attempted=true;
      if(pending||cancelPending||deliveryPending){
        note('原对话已切换；旧请求正在收尾，禁止回传。',true);update();return;
      }
      state=null;conversationReady=null;discovery.reset(snapshot);update();
      return;
    }
    if(discovered&&!pending&&!cancelPending&&!deliveryPending&&
      (!state||state.cancelled||state.settled||state.future&&!state.attempted)){
      void adoptLatest({automatic:true,grant:state?.future&&!state.cancelled&&!state.attempted?state:null});
      return;
    }
    if(state?.future){
      if(!state.attempted&&Date.now()>=state.expiresAt){
        state.attempted=true;note('预批准已过期，未运行。请重新审阅并预批准。',true);update();
      }
      return;
    }
    if(!state||state.cancelled||state.attempted||pending||autoPollBusy)return;
    if(state.expiresAt&&Date.now()>=state.expiresAt){
      state.attempted=true;note('本次请求已过期，未触发运行。请重新建立请求。',true);update();return;
    }
    autoPollBusy=true;
    try{
      observe();
      if(state.mode==='auto')void execute('auto');
      else if(!state.candidateSeen){
        state.candidateSeen=true;
        note('已识别任务标记：'+taskLabel(state)+'\n参数：'+JSON.stringify(state.args)+'\n尚未运行。点击“执行”将操作浏览器，并把返回值发送到当前聊天。');
      }
    }catch(error){
      if(['E_BRIDGE_CONTEXT','E_BRIDGE_SCHEMA','E_BRIDGE_FORMAT','E_BRIDGE_LIMIT'].includes(error.code))
        note('候选无法执行：'+error.code+'：'+error.message+'；未执行。',true);
      // Incomplete streaming output cannot trigger execution.
    }
    finally{autoPollBusy=false;}
  },PROBE_INTERVAL_MS);
  const beginComposition=()=>{composition=true;},endComposition=()=>{composition=false;};
  doc.addEventListener('compositionstart',beginComposition,true);
  doc.addEventListener('compositionend',endComposition,true);
  // The only sender of this message is the existing trusted Sidebar extension
  // context after durable Controller result verification. This script cannot
  // inspect or forge the Foundation ledger and never authorizes another Run.
  const deliver=async message=>{
    if(!state||state.cancelled||!state.attempted||state.deliveryStarted||message.requestId!==state.requestId||
      message.sourceUrl!==state.url||message.mode!==state.mode||win.location.href!==state.url)
      throw fail('E_BRIDGE_DELIVERY','请求身份或会话已变化，禁止回填');
    const owner=state;
    state.deliveryStarted=true;deliveryPending=true;update();  // ambiguous effects cannot be retried
    try{
    const identity=readPage({expectedUrl:state.url,identityOnly:true,requireComplete:true,...(state.candidate?{taskIntent:true}:{})});
    if(!identity.ok||identity.turnKey!==message.turnKey||identity.answerKey!==message.answerKey)
      throw fail('E_CHAT_ANSWER','执行期间官网回答已被改写或重新生成');
    if(composition)throw fail('E_CHAT_IME','输入法仍在编辑，真实结果仅保留在 Host');
    if(typeof message.text!=='string'||!message.text||new TextEncoder().encode(message.text).byteLength>MAX_DELIVERY_BYTES)
      throw fail('E_BRIDGE_LIMIT','结果回传过长或无内容');
    let deliveryClaim=null; // loss permanently fences this delivery, never a later request
    const checkDelivery=async()=>{
      const permission=await send({kind:'check-delivery',requestId:state.requestId,mode:state.mode,
        runId:message.runId,resultId:message.resultId});
      assertActive(owner);
      if(permission?.allowed!==true)throw fail('E_BRIDGE_DELIVERY','发送前未获得确定的交付许可');
      if(closed||win.location.href!==state.url||composition)
        throw fail('E_CHAT_DELIVERY_UNKNOWN','交付核验期间会话或输入法已变化');
      if(deliveryClaim&&!deliveryClaim.isHeld())
        throw fail('E_CHAT_DRAFT','输入框已被接管，本次发送永久失效；恢复相同文字也不会重发');
      const still=readPage({expectedUrl:state.url,identityOnly:true,requireComplete:true,...(state.candidate?{taskIntent:true}:{})});
      if(!still.ok||still.turnKey!==message.turnKey||still.answerKey!==message.answerKey)
        throw fail('E_CHAT_DELIVERY_UNKNOWN','交付前官方 AI 轮次发生变化');
    };
    await checkDelivery();
    assertActive(owner); // no result bytes enter the website before admission
    const snap=site.inspect();
    if(!snap.ok||snap.busy||!snap.idle||snap.rich||snap.draft!=='')
      throw fail('E_CHAT_DRAFT','原会话有新草稿、附件或正在回复，未覆盖；结果需人工核对');
    note('真实 Task 结果已核实。正在单次提交给原 ChatGPT 对话…');
    deliveryClaim=claimChatGPTBridgeComposer({site,doc,win,snapshot:snap,text:message.text});
    composerClaim=deliveryClaim;
    let prepared;
    try{prepared=prepareChatGPTBridgeDraft(site,message.text,snap);}
    finally{deliveryClaim.written();} // browser insertText may emit trusted input synchronously
    if(!prepared?.ok)throw fail('E_CHAT_FILL',prepared?.reason||'原生输入框未接受真实结果');
    let committed=false;
    for(let n=0;n<18;n++){
      await delay(250);
      assertActive(owner);
      await checkDelivery();
      assertActive(owner);
      state.sendSubmitted=true;update();
      const outcome=site.commit(prepared.token);
      if(outcome.ok===true){committed=true;break;}
      if(outcome.retry===true){state.sendSubmitted=false;update();continue;} // no native click was attempted
      throw fail('E_CHAT_DELIVERY_UNKNOWN',outcome.reason||'原生发送状态不明');
    }
    if(!committed)throw fail('E_CHAT_DELIVERY_UNKNOWN','原生发送按钮未就绪；结果可能已写入输入框');
    // No second click, even if both the DOM observation and the response time
    // out. The original conversation must prove exactly one new user message.
    let userObserved=false,resultUser=null;
    for(let n=0;n<100;n++){
      await delay(300);
      assertActive(owner);
      if(win.location.href!==state.url)throw fail('E_CHAT_DELIVERY_UNKNOWN','发送后原会话导航，发送结果未知');
      const current=site.inspect();
      if(site.confirm(prepared.token.before,message.text,current)){
        userObserved=true;resultUser=current.users.at(-1);break;
      }
    }
    if(!userObserved)throw fail('E_CHAT_DELIVERY_UNKNOWN','未观察到唯一的新增用户消息；禁止重发');
    deliveryClaim.confirmed(); // only exact user confirmation AND an empty native draft
    note('已在原对话确认新增用户消息。等待官方 AI 继续回复…');
    let aiReplyObserved=false;
    for(let n=0;n<150;n++){
      await delay(400);
      assertActive(owner);
      if(win.location.href!==state.url)break;
      const current=site.inspect();
      if(!current.ok||!site.confirm(prepared.token.before,message.text,current)||
        current.users.at(-1)!==resultUser)break;
      deliveryClaim.confirmed();
      if(isChatGPTBridgeContinuation(snap,current,resultUser)){aiReplyObserved=true;break;}
    }
    note(aiReplyObserved?'原对话已收到结果，且官方 AI 完成新回复':
      '已证实原对话收到结果；官方 AI 是否完成本轮回复尚未证实');
    return {sent:true,userObserved:true,aiReplyObserved};
    }finally{deliveryPending=false;update();}
  };
  const onMessage=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||!['deliver','progress'].includes(message.kind))return false;
    if(sender?.id!==api.runtime.id||sender?.tab)return false;
    try{
      const url=new URL(sender.url),origin=new URL(api.runtime.getURL('/')).origin;
      if(url.origin!==origin||url.pathname!=='/sidepanel.html'||
        !url.searchParams.has('hostInstanceId')||['scheduledRunner','toolId','previewId'].some(key=>url.searchParams.has(key)))return false;
    }catch{return false;}
    if(message.kind==='progress'){
      const owner=state;
      if(!owner||owner.cancelled||!owner.attempted||owner.settled||owner.deliveryStarted||
        message.requestId!==owner.requestId||message.sourceUrl!==owner.url||win.location.href!==owner.url||
        message.mode!==owner.mode||message.taskId!==owner.taskId)return false;
      const stages=['validating','starting','running','result-ready'],rank=stages.indexOf(message.stage);
      if(rank<0||rank<(owner.progressRank??-1))return false;
      if(owner.installation&&(message.scriptId!==owner.installation.scriptId||
        message.revision!==owner.installation.revision||message.targetUrl!==owner.targetUrl))return false;
      if(message.runId&&owner.runId&&owner.runId!==message.runId)return false;
      owner.progressRank=rank;
      if(typeof message.runId==='string')owner.runId=message.runId;
      const progress={validating:'正在核验已安装脚本、参数和网站权限。',
        starting:'版本核验通过，正在申请自动化运行；尚未确认开始。',
        running:'自动化已开始：打开目标网页并执行脚本。',
        'result-ready':'脚本已完成，持久结果已核实；正在准备回传当前聊天。'};
      note(progress[message.stage]+'\n脚本：'+owner.taskId+
        (message.scriptId?'（'+message.scriptId+' · r'+message.revision+'）':'')+
        '\n目标：'+targetLabel(owner));
      update();reply({ok:true,data:{observed:true}});return false;
    }
    const owner=state;
    Promise.resolve().then(()=>deliver(message)).then(data=>reply({ok:true,data}),
      error=>{if(!owner?.cancelled&&owner===state)note((error.code||'E_BRIDGE_DELIVERY')+'：'+(error.message||'回传未确认'),true);
        reply({ok:false,error:{code:error.code||'E_BRIDGE_DELIVERY',message:error.message||'回传未知',
          outcome:'OUTCOME_UNKNOWN'}});});
    return true;
  };
  api.runtime.onMessage.addListener(onMessage);
  const dispose=()=>{if(closed)return;closed=true;win.clearInterval(poll);
    api.runtime.onMessage.removeListener(onMessage);
    doc.removeEventListener('compositionstart',beginComposition,true);
    doc.removeEventListener('compositionend',endComposition,true);root.remove();};
  win.addEventListener('pagehide',dispose,{once:true});
  taskSelect.addEventListener('change',async()=>{
    if(pending||cancelPending||deliveryPending||loadingTasks)return;
    if(taskSelect.value===INSTALLED_CHOICE){
      loadingTasks=true;update();
      try{
        const catalog=await send({kind:'list-tasks'});
        if(!Array.isArray(catalog?.tasks))throw fail('E_BRIDGE_INSTALL','未能读取已安装脚本');
        // Refresh future selections, never mutate an already prepared request.
        for(const option of installedOptions)option.remove();
        installedOptions.length=0;installedTasks.clear();
        for(const task of catalog.tasks){
          const key='installed:'+task.taskId;
          installedTasks.set(key,task);
          const option=doc.createElement('option');option.value=key;
          option.textContent=(task.name||task.taskId)+' · '+task.taskId+' @ '+task.version;
          taskSelect.append(option);installedOptions.push(option);
        }
        const unavailable=(catalog.unavailable||[]).map(row=>row.taskId+'：'+row.reason).join('\n');
        if(!catalog.tasks.length)throw fail('E_BRIDGE_INSTALL','没有可运行的已安装脚本。'+
          (unavailable?'\n'+unavailable:'请先在“我的”安装任务；主动停用的任务需恢复。'));
        taskSelect.value='installed:'+catalog.tasks[0].taskId;
        note('已读取已安装脚本。请核对脚本，填写准确的目标网址和参数，再建立请求。'+
          (unavailable?'\n以下安装当前不可用：\n'+unavailable:''));
      }catch(error){taskSelect.value=FIXED_PAGE_TASK_ID;note((error.code||'E_BRIDGE_INSTALL')+'：'+error.message,true);}
      finally{loadingTasks=false;}
    }
    const task=selectedTask();
    if(task){
      targetInput.value='';argsInput.value=JSON.stringify(Object.fromEntries(
        Object.entries(task.paramsSchema?.properties||{}).filter(([,spec])=>'default' in spec).map(([key,spec])=>[key,spec.default])
      ));
      argsHelp.textContent='允许网站：'+(task.siteOrigins||[]).join('、')+
        '；参数：'+(Object.entries(task.paramsSchema?.properties||{}).map(([key,spec])=>
          key+' ('+spec.type+(task.paramsSchema.required?.includes(key)?'，必填':'')+')').join('、')||'无');
    }
    update();
  });
  update();
  return {dispose};
}
