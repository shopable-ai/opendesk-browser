import {createChatGPTSite} from '../../examples/programs/chatgpt-send-queue/src/site.js';
import {chatGPTConversationId,inspectChatGPTEditsOnPage} from './workspace-chatgpt.js';
import {validateChatGPTTaskRequest,CHATGPT_TASK_REQUEST_PROTOCOL,FIXED_PAGE_TASK_ID,FIXED_PAGE_URL} from './chatgpt-task-request.js';
import {CHATGPT_BRIDGE_PROTOCOL} from './chatgpt-bridge-trigger-gate.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const PROBE_INTERVAL_MS=850;
const MAX_DELIVERY_BYTES=8192;
const isUserTurn=(snapshot,id)=>snapshot.ok&&snapshot.users.at(-1)?.textContent?.includes(id);

export function bridgePrompt(requestId){
  const request={protocol:CHATGPT_TASK_REQUEST_PROTOCOL,kind:'opendesk.task.request',
    version:1,requestId,taskId:FIXED_PAGE_TASK_ID,args:{}};
  return [
    '请在当前官方 ChatGPT 对话中提出一个 OpenDesk 自动化任务候选。这不是你已注册的 MCP 工具，',
    '也不是任何模型或网页可以直接批准执行的权限；真正运行需要我点击 OpenDesk 执行，或由我单独批准一次自动触发。',
    '用户目标：使用 OpenDesk 打开固定测试网页 '+FIXED_PAGE_URL+'，读取标题与一段正文，',
    '待扩展把真实结果发送回这段原始对话后，再根据实际读取结果总结；不要提前虚构网页内容。',
    '现在只输出下面这一段唯一的 opendesk-request JSON 代码块，不要输出第二个请求、模拟执行结果、授权声称或其他代码块。',
    '不要改变任何字段、requestId、taskId 或 args。扩展会对这一轮回复与原对话身份进行严格核查。',
    '```opendesk-request',JSON.stringify(request,null,2),'```'
  ].join('\n\n');
}

// Fixed, first-party, isolated extension content script. No page-provided
// event, model text, site JS or USER_SCRIPT receives a Chrome authority object.
export function initChatGPTFixedBridgePage({api=chrome,doc=document,win=window,
  site=createChatGPTSite({doc,win})}={}){
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
  let state=null;
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
    const page=inspectChatGPTEditsOnPage({expectedUrl:state.url,requestId:state.requestId,
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
      if(!snap.ok||!snap.idle||snap.rich||snap.draft!=='')
        throw fail('E_CHAT_COMPOSER','官网仍在回复、有草稿／附件或输入框不可用，未覆盖');
      const url=win.location.href;
      const prepared=await send({kind:'prepare'});
      if(win.location.href!==url||prepared.source?.url!==url)throw fail('E_CHAT_TARGET','准备期间切换了对话');
      const prompt=bridgePrompt(prepared.requestId);
      const inserted=site.prepare(prompt,snap);
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
      const identity=inspectChatGPTEditsOnPage({expectedUrl:state.url,identityOnly:true,requestId:state.requestId});
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
    const identity=inspectChatGPTEditsOnPage({expectedUrl:state.url,identityOnly:true,requireComplete:true});
    if(!identity.ok||identity.turnKey!==message.turnKey||identity.answerKey!==message.answerKey)
      throw fail('E_CHAT_ANSWER','执行期间官网回答已被改写或重新生成');
    if(composition)throw fail('E_CHAT_IME','输入法仍在编辑，真实结果仅保留在 Host');
    if(typeof message.text!=='string'||!message.text||new TextEncoder().encode(message.text).byteLength>MAX_DELIVERY_BYTES)
      throw fail('E_BRIDGE_LIMIT','结果回传过长或无内容');
    const snap=site.inspect();
    if(!snap.ok||snap.busy||!snap.idle||snap.rich||snap.draft!=='')
      throw fail('E_CHAT_DRAFT','原会话有新草稿、附件或正在回复，未覆盖；结果需人工核对');
    note('固定 Task 结果已核实。正在单次提交给原 ChatGPT 对话…');
    const prepared=site.prepare(message.text,snap);
    if(!prepared?.ok)throw fail('E_CHAT_FILL',prepared?.reason||'原生输入框未接受真实结果');
    let committed=false;
    for(let n=0;n<18;n++){
      await delay(250);
      if(win.location.href!==state.url||composition)
        throw fail('E_CHAT_DELIVERY_UNKNOWN','准备发送期间会话或输入法已变化');
      const still=inspectChatGPTEditsOnPage({expectedUrl:state.url,identityOnly:true,requireComplete:true});
      if(!still.ok||still.turnKey!==message.turnKey||still.answerKey!==message.answerKey)
        throw fail('E_CHAT_DELIVERY_UNKNOWN','发送前官方 AI 轮次发生变化，输入框可能已有回填内容');
      const outcome=site.commit(prepared.token);
      if(outcome.ok===true){committed=true;break;}
      if(outcome.retry===true)continue; // no native click was attempted
      throw fail('E_CHAT_DELIVERY_UNKNOWN',outcome.reason||'原生发送状态不明');
    }
    if(!committed)throw fail('E_CHAT_DELIVERY_UNKNOWN','原生发送按钮未就绪；结果可能已写入输入框');
    // No second click, even if both the DOM observation and the response time
    // out. The original conversation must prove exactly one new user message.
    let userObserved=false;
    for(let n=0;n<100;n++){
      await delay(300);
      if(win.location.href!==state.url)throw fail('E_CHAT_DELIVERY_UNKNOWN','发送后原会话导航，发送结果未知');
      if(site.confirm(prepared.token.before,message.text,site.inspect())){userObserved=true;break;}
    }
    if(!userObserved)throw fail('E_CHAT_DELIVERY_UNKNOWN','未观察到唯一的新增用户消息；禁止重发');
    note('已在原对话确认新增用户消息。等待官方 AI 继续回复…');
    let aiReplyObserved=false;
    for(let n=0;n<150;n++){
      await delay(400);
      if(win.location.href!==state.url)break;
      const current=site.inspect();
      if(!current.ok)break;
      if(current.assistants.length>prepared.token.before.assistantCount&&
        current.answerComplete&&!current.busy){aiReplyObserved=true;break;}
    }
    note(aiReplyObserved?'原对话已收到结果，且官方 AI 完成新回复':
      '已证实原对话收到结果；官方 AI 是否完成本轮回复尚未证实');
    return {sent:true,userObserved:true,aiReplyObserved};
  };
  const onMessage=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||message.kind!=='deliver')return false;
    if(sender?.id!==api.runtime.id||sender?.tab)return false;
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
