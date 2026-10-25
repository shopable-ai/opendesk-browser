import {createChatGPTBridgeSite} from './chatgpt-bridge-site.js';
import {chatGPTConversationId,inspectChatGPTEditsOnPage} from './workspace-chatgpt.js';
import {validateChatGPTTaskRequest,CHATGPT_TASK_REQUEST_PROTOCOL,FIXED_PAGE_TASK_ID} from './chatgpt-task-request.js';
import {CHATGPT_BRIDGE_PROTOCOL} from './chatgpt-bridge-trigger-gate.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const PROBE_INTERVAL_MS=850;
const MAX_DELIVERY_BYTES=8192;
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
  if(!current?.ok||current.busy||!current.answerComplete||
    current.users.length!==before.users.length+1||current.users.at(-1)!==resultUser||
    before.users.some((node,index)=>current.users[index]!==node)||
    current.assistants.length!==before.assistants.length+1||
    before.assistants.some((node,index)=>current.assistants[index]!==node))return false;
  const order=resultUser.compareDocumentPosition(current.assistants.at(-1));
  return !(order&1)&&Boolean(order&4); // connected, subsequent assistant only
}

export function bridgePrompt(requestId){
  const request={protocol:CHATGPT_TASK_REQUEST_PROTOCOL,kind:'opendesk.task.request',
    version:1,requestId,taskId:FIXED_PAGE_TASK_ID,args:{}};
  return [
    '请在当前官方 ChatGPT 对话中提出一个 OpenDesk 自动化任务候选。这不是你已注册的 MCP 工具，',
    '也不是任何模型或网页可以直接批准执行的权限；真正运行需要我点击 OpenDesk 执行，或由我单独批准一次自动触发。',
    '用户目标：使用 OpenDesk 打开固定 Task 绑定的 httpbingo HTML 示例网页，读取标题与一段正文，',
    '待扩展把真实结果发送回这段原始对话后，再根据实际读取结果总结；不要提前虚构网页内容。',
    '现在只输出下面这一段唯一的 opendesk-request JSON 代码块，不要输出第二个请求、模拟执行结果、授权声称或其他代码块。',
    '不要改变任何字段、requestId、taskId 或 args。扩展会对这一轮回复与原对话身份进行严格核查。',
    '请将下面的 JSON 原样放在唯一的 opendesk-request 代码块中：',JSON.stringify(request)
  ].join(''); // One plain paragraph avoids native markdown/link conversion.
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
  style.textContent=':host{all:initial}*{box-sizing:border-box}.panel{font:12px/1.4 system-ui,-apple-system,sans-serif;background:#fff;color:#263247;border:1px solid #d8dee8;border-radius:12px;box-shadow:0 4px 18px #0002;padding:8px;max-width:330px} .bar{display:flex;gap:5px;align-items:center;flex-wrap:wrap}button{font:inherit;background:#f7f9fb;border:1px solid #d3dbea;border-radius:7px;cursor:pointer;padding:5px 7px;color:inherit}button:focus-visible{outline:2px solid #2563eb}button:disabled{opacity:.45;cursor:default}.run{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.status{margin-top:6px;overflow-wrap:anywhere;max-height:70px;overflow:auto;color:#526070}.error{color:#b42318}@media(prefers-color-scheme:dark){.panel{background:#20242c;color:#e7e9ef;border-color:#444b58}.status{color:#bec8d5}button{background:#303846;border-color:#526073;color:#e7e9ef}.run{background:#346deb;color:white}}';
  const panel=doc.createElement('div');panel.className='panel';
  const bar=doc.createElement('div');bar.className='bar';
  const prepareButton=doc.createElement('button');prepareButton.textContent='建立请求';
  const autoButton=doc.createElement('button');autoButton.textContent='批准本次自动执行';
  const runButton=doc.createElement('button');runButton.className='run';runButton.textContent='执行';
  const status=doc.createElement('div');status.className='status';status.setAttribute('role','status');
  bar.append(prepareButton,autoButton,runButton);panel.append(bar,status);shadow.append(style,panel);
  (doc.body||doc.documentElement).append(root);
  let pending=false,composition=false,closed=false;
  let state=null,composerClaim=null;
  const note=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
  const update=()=>{
    const ready=!!state&&!state.attempted&&!state.deliveryStarted&&win.location.href===state.url;
    prepareButton.disabled=pending||Boolean(state?.attempted);
    autoButton.disabled=pending||!ready||state.mode==='auto';
    runButton.disabled=pending||!ready||state.mode==='auto';
  };
  const validatePage=()=>{
    if(!chatGPTConversationId(win.location.href)||win.location.origin!=='https://chatgpt.com')
      throw fail('E_CHAT_TARGET','请在已打开的 ChatGPT 正式对话中操作');
    if(state&&state.url!==win.location.href)throw fail('E_CHAT_TARGET','会话已更换，请重新建立请求');
  };
  const send=async message=>{
    const reply=await api.runtime.sendMessage({protocol:CHATGPT_BRIDGE_PROTOCOL,...message});
    if(reply?.ok!==true)throw fail(reply?.error?.code||'E_BRIDGE_TRANSPORT',
      reply?.error?.message||'可信 Host 未响应');
    return reply.data;
  };
  const observe=()=>{
    validatePage();
    if(!state)throw fail('E_BRIDGE_REQUEST','尚未建立当前请求');
    const page=readPage({expectedUrl:state.url,requestId:state.requestId,
      protocols:[CHATGPT_TASK_REQUEST_PROTOCOL],requireUserEcho:true});
    if(!page.ok)throw fail(page.error.code,page.error.message);
    const siteSnapshot=site.inspect();
    if(!siteSnapshot.ok||!siteSnapshot.answerComplete||siteSnapshot.busy||
      !isUserTurn(siteSnapshot,state.requestId))
      throw fail('E_CHAT_PENDING','本轮请求尚无完整的官方 AI 回复');
    const request=validateChatGPTTaskRequest(page.blocks[0]);
    if(request.requestId!==state.requestId||request.taskId!==FIXED_PAGE_TASK_ID||
      Object.keys(request.args).length!==0)
      throw fail('E_BRIDGE_CONTEXT','不是当前固定网页读取请求');
    if(state.approvedTurnKey&&state.approvedTurnKey!==page.turnKey)
      throw fail('E_BRIDGE_CONTEXT','批准对应的用户轮次已经改变');
    return {page,request};
  };
  const execute=async mode=>{
    if(!state||state.attempted||pending)return;
    pending=true;update();
    try {
      validatePage();
      const {page}=observe();
      if(mode==='manual')await send({kind:'authorize',requestId:state.requestId,mode});
      if(state.mode==='auto'&&mode!=='auto')throw fail('E_BRIDGE_MODE','已批准自动执行，不可更改触发身份');
      state.attempted=true;state.mode=mode;
      note('已提交受信执行。正在核验固定任务和独立网页结果…');
      update();
      // No local retry after a transport failure. The worker's durable trigger
      // fence and Controller command journal determine whether effects happened.
      const reply=await send({kind:'execute',requestId:state.requestId,mode,
        candidateText:page.blocks[0],sourceUrl:state.url,source:state.source,turnKey:page.turnKey,
        answerKey:page.answerKey});
      note(reply?.sent&&reply?.aiReplyObserved?'真实结果已回传，官方 AI 已完成回复':
        reply?.sent?'原会话已确认收到真实结果，官方 AI 回复仍待核查':
        '任务已返回，但自动发送未获完整回执');
    }catch(error){
      note((error.code||'E_BRIDGE')+'：'+(error.message||'执行失败')+
        (state?.attempted?'；不会自动重放':''),
        true);
    }finally{pending=false;update();}
  };
  prepareButton.addEventListener('click',async event=>{
    if(!event.isTrusted||pending||state?.attempted)return;
    pending=true;update();
    try {
      validatePage();
      const snap=site.inspect();
      if(!snap.ok)throw fail('E_CHAT_COMPOSER',snap.reason||'官网输入框不可用，未覆盖');
      if(composition)throw fail('E_CHAT_IME','输入法仍在编辑，未覆盖');
      if(!snap.idle)throw fail('E_CHAT_PENDING','官网回复尚未确认完成，未覆盖');
      if(snap.rich||snap.draft!=='')throw fail('E_CHAT_DRAFT','官网有草稿或附件，未覆盖');
      const url=win.location.href;
      const prepared=await send({kind:'prepare'});
      if(win.location.href!==url||prepared.source?.url!==url)throw fail('E_CHAT_TARGET','准备期间切换了对话');
      if(composition)throw fail('E_CHAT_IME','准备期间输入法开始编辑，未回填');
      const prompt=bridgePrompt(prepared.requestId);
      const inserted=prepareChatGPTBridgeDraft(site,prompt,snap);
      if(!inserted?.ok)throw fail('E_CHAT_FILL',inserted?.reason||'无法写入原生输入框');
      state={requestId:prepared.requestId,url,source:prepared.source,expiresAt:prepared.expiresAt,
        attempted:false,deliveryStarted:false,mode:null,approvedTurnKey:null};
      note('请求已写入官网输入框；请先由你在官网发送。随后点击“执行”，或批准仅本次自动执行。');
    }catch(error){note((error.code||'E_BRIDGE')+'：'+error.message,true);}
    finally{pending=false;update();}
  });
  autoButton.addEventListener('click',async event=>{
    if(!event.isTrusted||pending||!state||state.mode||state.attempted)return;
    pending=true;update();
    try{
      validatePage();
      const snap=site.inspect();
      if(!snap.ok||!isUserTurn(snap,state.requestId))
        throw fail('E_CHAT_TURN','请先在官网发送包含本次请求身份的用户消息');
      const identity=readPage({expectedUrl:state.url,identityOnly:true,requestId:state.requestId});
      if(!identity.ok||identity.turnKey==='no-user')throw fail('E_CHAT_TURN','无法确认本次用户轮次');
      await send({kind:'authorize',requestId:state.requestId,mode:'auto'});
      state.approvedTurnKey=identity.turnKey;state.mode='auto';
      note('只批准当前固定 Task 与这一轮回复触发一次，不批准任何其他网站、任务或循环。');
    }catch(error){note((error.code||'E_BRIDGE_APPROVAL')+'：'+error.message,true);}
    finally{pending=false;update();}
  });
  runButton.addEventListener('click',event=>{
    if(event.isTrusted)void execute('manual');
  });
  let autoPollBusy=false;
  const poll=win.setInterval(()=>{
    if(closed)return;
    composerClaim?.navigation();
    if(state&&win.location.href!==state.url){
      state.attempted=true;note('原对话已切换；旧授权失效，禁止回传。',true);update();
      return;
    }
    if(state?.mode!=='auto'||state.attempted||pending||autoPollBusy)return;
    autoPollBusy=true;
    try{observe();void execute('auto');}catch{/* Waiting for one complete answer; no execution. */}
    finally{autoPollBusy=false;}
  },PROBE_INTERVAL_MS);
  const beginComposition=()=>{composition=true;},endComposition=()=>{composition=false;};
  doc.addEventListener('compositionstart',beginComposition,true);
  doc.addEventListener('compositionend',endComposition,true);
  // The only sender of this message is the existing trusted Sidebar extension
  // context after durable Controller result verification. This script cannot
  // inspect or forge the Foundation ledger and never authorizes another Run.
  const deliver=async message=>{
    if(!state||!state.attempted||state.deliveryStarted||message.requestId!==state.requestId||
      message.sourceUrl!==state.url||message.mode!==state.mode||win.location.href!==state.url)
      throw fail('E_BRIDGE_DELIVERY','请求身份或会话已变化，禁止回填');
    state.deliveryStarted=true;update();  // ambiguous effects cannot be retried
    const identity=readPage({expectedUrl:state.url,identityOnly:true,requireComplete:true});
    if(!identity.ok||identity.turnKey!==message.turnKey||identity.answerKey!==message.answerKey)
      throw fail('E_CHAT_ANSWER','执行期间官网回答已被改写或重新生成');
    if(composition)throw fail('E_CHAT_IME','输入法仍在编辑，真实结果仅保留在 Host');
    if(typeof message.text!=='string'||!message.text||new TextEncoder().encode(message.text).byteLength>MAX_DELIVERY_BYTES)
      throw fail('E_BRIDGE_LIMIT','结果回传过长或无内容');
    const checkDelivery=async()=>{
      const permission=await send({kind:'check-delivery',requestId:state.requestId,mode:state.mode,
        runId:message.runId,resultId:message.resultId});
      if(permission?.allowed!==true)throw fail('E_BRIDGE_DELIVERY','发送前未获得确定的交付许可');
      if(closed||win.location.href!==state.url||composition)
        throw fail('E_CHAT_DELIVERY_UNKNOWN','交付核验期间会话或输入法已变化');
      if(composerClaim&&!composerClaim.isHeld())
        throw fail('E_CHAT_DRAFT','输入框已被接管，本次发送永久失效；恢复相同文字也不会重发');
      const still=readPage({expectedUrl:state.url,identityOnly:true,requireComplete:true});
      if(!still.ok||still.turnKey!==message.turnKey||still.answerKey!==message.answerKey)
        throw fail('E_CHAT_DELIVERY_UNKNOWN','交付前官方 AI 轮次发生变化');
    };
    await checkDelivery(); // no result bytes enter the website before admission
    const snap=site.inspect();
    if(!snap.ok||snap.busy||!snap.idle||snap.rich||snap.draft!=='')
      throw fail('E_CHAT_DRAFT','原会话有新草稿、附件或正在回复，未覆盖；结果需人工核对');
    note('固定 Task 结果已核实。正在单次提交给原 ChatGPT 对话…');
    composerClaim=claimChatGPTBridgeComposer({site,doc,win,snapshot:snap,text:message.text});
    let prepared;
    try{prepared=prepareChatGPTBridgeDraft(site,message.text,snap);}
    finally{composerClaim.written();} // browser insertText may emit trusted input synchronously
    if(!prepared?.ok)throw fail('E_CHAT_FILL',prepared?.reason||'原生输入框未接受真实结果');
    let committed=false;
    for(let n=0;n<18;n++){
      await delay(250);
      await checkDelivery();
      const outcome=site.commit(prepared.token);
      if(outcome.ok===true){committed=true;break;}
      if(outcome.retry===true)continue; // no native click was attempted
      throw fail('E_CHAT_DELIVERY_UNKNOWN',outcome.reason||'原生发送状态不明');
    }
    if(!committed)throw fail('E_CHAT_DELIVERY_UNKNOWN','原生发送按钮未就绪；结果可能已写入输入框');
    // No second click, even if both the DOM observation and the response time
    // out. The original conversation must prove exactly one new user message.
    let userObserved=false,resultUser=null;
    for(let n=0;n<100;n++){
      await delay(300);
      if(win.location.href!==state.url)throw fail('E_CHAT_DELIVERY_UNKNOWN','发送后原会话导航，发送结果未知');
      const current=site.inspect();
      if(site.confirm(prepared.token.before,message.text,current)){
        userObserved=true;resultUser=current.users.at(-1);break;
      }
    }
    if(!userObserved)throw fail('E_CHAT_DELIVERY_UNKNOWN','未观察到唯一的新增用户消息；禁止重发');
    composerClaim.confirmed(); // only exact user confirmation AND an empty native draft
    note('已在原对话确认新增用户消息。等待官方 AI 继续回复…');
    let aiReplyObserved=false;
    for(let n=0;n<150;n++){
      await delay(400);
      if(win.location.href!==state.url)break;
      const current=site.inspect();
      if(!current.ok||!site.confirm(prepared.token.before,message.text,current)||
        current.users.at(-1)!==resultUser)break;
      composerClaim.confirmed();
      if(isChatGPTBridgeContinuation(snap,current,resultUser)){aiReplyObserved=true;break;}
    }
    note(aiReplyObserved?'原对话已收到结果，且官方 AI 完成新回复':
      '已证实原对话收到结果；官方 AI 是否完成本轮回复尚未证实');
    return {sent:true,userObserved:true,aiReplyObserved};
  };
  const onMessage=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||message.kind!=='deliver')return false;
    if(sender?.id!==api.runtime.id||sender?.tab)return false;
    try{
      const url=new URL(sender.url),origin=new URL(api.runtime.getURL('/')).origin;
      if(url.origin!==origin||url.pathname!=='/sidepanel.html'||
        !url.searchParams.has('hostInstanceId')||['scheduledRunner','toolId','previewId'].some(key=>url.searchParams.has(key)))return false;
    }catch{return false;}
    Promise.resolve().then(()=>deliver(message)).then(data=>reply({ok:true,data}),
      error=>{note((error.code||'E_BRIDGE_DELIVERY')+'：'+(error.message||'回传未确认'),true);
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
  note('OpenDesk 固定网页测试：先建立请求，官网发送后可执行或单次授权自动执行。');
  update();
  return {dispose};
}
