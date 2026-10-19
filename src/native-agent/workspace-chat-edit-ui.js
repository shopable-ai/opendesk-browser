import {createEditContext,parseEditProposal,parseStringEnvelope,validateEditProposal,createEditReceipt,EDIT_PROTOCOL} from './workspace-ai-proposal.js';
import {isChatGPTURL,chatGPTConversationId,readChatGPTEdit,fillChatGPTComposer} from './workspace-chatgpt.js';
import {createFileRequestContext,parseFileRequest,formatFileResult,REQUEST_PROTOCOL} from './workspace-chat-request.js';
import {localizeLiteral} from '../i18n/index.js';

export function createWorkspaceChatEdit({api,demo,getRecord,getTarget,readCurrent,setDraft,run,isWritable,
  getAuthority=()=>null,assertAuthority=async()=>{},requestFile}){
  const adopted=new WeakMap(),listeners=new Set();
  let task='',requestPath='',answer='',contextBindingText='',resultState='',status={text:'',error:false},
    busy=false,connected=false,disposed=false,snapshot,previewRevision=0;
  let context=null,contextBinding=null,proposal=null,prompt='',recordKey='',receipt='',binding=null,
    requestContext=null,resultPacket=null,revision=0,proposalTurn=null,promptPacket=null;
  const stages={recognized:'未处理',native:'未执行',fill:'未回填',sent:'未发送'};
  const note=(message,error=false)=>{if(!disposed){status={text:localizeLiteral(message),error};emit();}};
  const fail=(code,message)=>{throw {code,message,outcome:'NOT_DISPATCHED'};};
  const key=record=>record?record.workspaceId+'\0'+record.path:'';
  const sameTarget=(a,b)=>!!a&&!!b&&['tabId','documentId','url'].every(k=>a[k]===b[k]);
  const sameAuthority=(a,b)=>a===null&&b===null||!!a&&!!b&&['workspaceId','sourceId','leaseEpoch','sessionId','access'].every(k=>a[k]===b[k]);
  function controls(){
    const record=getRecord(),clean=!!record&&!record.unknown&&!record.remote&&record.content===record.baseContent;
    const idle=!busy&&!disposed;
    return {
      setTask:idle,setRequestPath:idle,setAnswer:idle,
      prepareEdit:idle&&connected&&clean,
      prepareFileRequest:idle&&connected&&!demo,
      fillContext:!!(idle&&connected&&promptPacket?.binding.live&&promptPacket.state==='ready'&&promptPacket.binding.source&&
        (binding?.mode!=='requests'||requestContext&&prompt.includes(requestContext.request.requestId))),
      refillResult:!!(idle&&connected&&resultPacket?.binding.live&&resultPacket.state==='ready'),
      copyContext:idle&&!!prompt,
      readChatGPT:!!(idle&&!demo&&connected&&binding?.live&&binding.source&&(binding.mode==='requests'||clean)),
      review:idle&&!!context&&clean&&connected,
      demoAnswer:idle&&!!demo&&!!context&&clean&&connected,
      adopt:idle&&!!proposal&&isWritable()&&connected&&clean&&proposal.content!==proposal.before,
      discard:idle,copyReceipt:idle&&!!receipt
    };
  }
  function buildSnapshot(){
    return Object.freeze({task,requestPath,answer,prompt,contextFile:context?.path||'',contextBinding:contextBindingText,
      proposal,proposalBefore:proposal?(proposal.before||'（空文件）'):'',proposalAfter:proposal?(proposal.content||'（将清空文件正文）'):'',
      proposalSummary:proposal?proposal.path+' · '+new TextEncoder().encode(proposal.before).length+' → '+proposal.bytes+' bytes · 完整文件替换':'',
      status:Object.freeze({...status}),stages:Object.freeze({...stages}),resultState,resultText:resultPacket?.text||'',receipt,
      promptState:promptPacket?.state||'empty',resultDeliveryState:resultPacket?.state||'empty',
      controls:Object.freeze(controls()),demo:!!demo,busy,connected});
  }
  function emit(){
    if(disposed)return;
    snapshot=buildSnapshot();
    for(const listener of listeners)listener();
  }
  function invalidatePreview(){previewRevision++;proposal=null;proposalTurn=null;}
  function clearEdit(){context=null;contextBinding=null;answer='';invalidatePreview();}
  function invalidate(message){
    revision++;if(binding)binding.live=false;
    binding=null;requestContext=null;promptPacket=null;prompt='';clearEdit();
    contextBindingText='';
    if(resultPacket)resultState='绑定已失效，结果仅保留供核对，不会转入其他工作区或对话。';
    if(message)note(message,true);else emit();
  }
  async function assertBinding(snapshot,{turnKey,answerKey}={}){
    if(disposed||!snapshot?.live||Date.now()-snapshot.createdAt>30*60*1000)fail('E_REQUEST_CONTEXT','对话绑定已经失效或超过 30 分钟，请重新建立请求上下文。');
    if(!sameAuthority(snapshot.authority,getAuthority())){snapshot.live=false;fail('E_FILES_SESSION','本次目录权限或连接代次已经失效。');}
    if(snapshot.authority)await assertAuthority(snapshot.authority);
    let page=null;
    if(snapshot.source){
      if(!sameTarget(getTarget(),snapshot.source)){snapshot.live=false;fail('E_CHAT_TARGET','选中的对话已变化，旧请求和提案已停用。');}
      page=await readChatGPTEdit(api,snapshot.source,'',{identityOnly:true,...(answerKey?{requireComplete:true}:{})});
      if(turnKey&&page.turnKey!==turnKey)fail('E_CHAT_TURN','对话已进入另一轮，旧提案或迟到结果未被使用。');
      if(answerKey&&page.answerKey!==answerKey)fail('E_CHAT_ANSWER','本轮回答已被重新生成或修改，旧请求和提案未被使用。');
    }
    if(snapshot.authority)await assertAuthority(snapshot.authority);
    if(!snapshot.live||!sameAuthority(snapshot.authority,getAuthority())||snapshot.source&&!sameTarget(getTarget(),snapshot.source))
      fail('E_REQUEST_CONTEXT','异步处理期间绑定已经变化。');
    return page;
  }
  async function makeBinding({required=false,mode='edit'}={}){
    invalidate();const ticket=revision,currentAuthority=getAuthority(),authority=currentAuthority?{...currentAuthority}:null,target=getTarget();let source=null;
    if(required&&(!authority?.sessionId||typeof requestFile!=='function'))fail('E_FILES_SESSION','请先连接并选择一个真实的文件工作区。');
    if(required&&authority.devLeaseEpoch!==1)fail('E_NATIVE_UPDATE_REQUIRED','新请求闭环需要 Go 的 devLeaseEpoch:1 能力，请更新受影响组件后重连。');
    if(!demo&&target&&isChatGPTURL(target.url)){
      if(!chatGPTConversationId(target.url))fail('E_CHAT_TARGET','请先选择一个已经建立的 ChatGPT 对话。');
      source={...target,conversationId:chatGPTConversationId(target.url)};
      const page=await readChatGPTEdit(api,source,'',{identityOnly:true});source.turnKey=page.turnKey;
    }else if(required)fail('E_CHAT_TARGET','请选择用户指定的既有官方 ChatGPT 对话。');
    if(authority)await assertAuthority(authority);
    if(disposed||ticket!==revision||!sameAuthority(authority,getAuthority())||source&&!sameTarget(source,getTarget()))fail('E_REQUEST_CONTEXT','建立绑定时选择已变化。');
    binding={id:crypto.randomUUID(),source,authority,mode,live:true,createdAt:Date.now(),consumed:new Set()};
    contextBindingText=source?'已绑定：'+source.url+' · 工作区 '+(authority?.workspaceId||getRecord()?.workspaceId||''):'手工提案模式 · 当前文件';
    return binding;
  }
  function publishPrompt(text,snapshot,requestId){
    prompt=text;
    promptPacket={text,binding:snapshot,operationId:'context-'+requestId,turnKey:snapshot.source?.turnKey,state:'ready'};
  }
  function active(){
    if(!context)fail('E_EDIT_CONTEXT','请先读取真实文件或为当前文件生成一次新的上下文。');
    validateEditProposal({requestId:context.requestId,path:context.path,baseSha256:context.baseSha256,content:context.baseContent,
      ...(context.bindingId?{bindingId:context.bindingId,workspaceId:context.workspaceId}:{})},context,getRecord());
    return context;
  }
  async function checkSource(){
    const snapshot=active(),guard=contextBinding;
    const page=await assertBinding(guard);
    if(context!==snapshot||contextBinding!==guard)fail('E_EDIT_CONTEXT','处理期间编辑上下文已失效。');
    active();return page;
  }
  async function prepare(){
    createEditContext(getRecord(),{task});
    const guard=await makeBinding(),record=await readCurrent();
    await assertBinding(guard);
    const created=createEditContext(record,{task,source:guard.source,authority:guard.authority});
    context=created.context;contextBinding=guard;publishPrompt(created.prompt,guard,context.requestId);
    note('已生成包含当前文件正文的手工上下文；随机标记首次读取请使用“建立读取请求”。');
  }
  async function prepareRequest(){
    const guard=await makeBinding({required:true,mode:'requests'});
    const path=requestPath.trim()||getRecord()?.path||'README.md';
    requestContext=createFileRequestContext({workspaceId:guard.authority.workspaceId,bindingId:guard.id,path,task});
    publishPrompt(requestContext.prompt,guard,requestContext.request.requestId);
    Object.assign(stages,{recognized:'等待本轮回答',native:'未执行',fill:'尚未回填上下文',sent:'等待用户通过网页发送'});emit();
    note('请求上下文仅含身份、相对路径与协议，没有文件正文。查看后回填到已绑定对话，由你发送。');
  }
  async function fillPacket(packet,{result=false}={}){
    if(!packet||packet.state!=='ready')fail('E_CHAT_REPLAY','没有可重新回填的结果；已回填或结果未知时不会重复输入。');
    // Reserve before awaiting identity checks so two callers cannot insert twice.
    packet.state='filling';emit();
    try{
      await assertBinding(packet.binding,{turnKey:packet.turnKey,answerKey:packet.answerKey});
      await fillChatGPTComposer(api,packet.binding.source,packet.text,{operationId:packet.operationId,turnKey:packet.turnKey});
      packet.state='filled';
      await assertBinding(packet.binding,{turnKey:packet.turnKey,answerKey:packet.answerKey});
      stages.fill=result?'结果已回填并核对':'请求上下文已回填';stages.sent='等待用户检查后在网页发送';
      if(result)resultState='结果已进入绑定对话的输入框，尚未发送。';
      note('已回填到原对话输入框。请检查内容，并使用 ChatGPT 网页的发送按钮。');
    }catch(error){
      if(error.outcome==='OUTCOME_UNKNOWN')packet.state='unknown';
      else if(packet.state==='filling')packet.state='ready';
      stages.fill=packet.state==='unknown'?'结果未知，请检查输入框':packet.state==='filled'?'已回填，但绑定随后失效':error.code||'失败';
      if(result)resultState='结果已保留。'+(packet.state==='ready'?'处理原草稿或页面问题后可仅重试回填，不会重新读取文件。':'请先核对网页；不会重复插入。');
      throw error;
    }finally{emit();}
  }
  async function review(text,answer){
    invalidatePreview();const ticket=previewRevision,page=await checkSource();
    const observed=answer||page;
    if(contextBinding.mode==='requests'&&contextBinding.source&&!observed?.answerKey)fail('E_CHAT_PENDING','没有可核对的完整回答，请等生成结束后重新处理。');
    await assertBinding(contextBinding,observed||{});
    if(ticket!==previewRevision)fail('E_EDIT_CONTEXT','审阅期间提案或上下文已变化，请重新审阅。');
    proposal=validateEditProposal(parseEditProposal(text),context,getRecord());
    proposalTurn=observed?{turnKey:observed.turnKey,answerKey:observed.answerKey}:{};
    note(proposal.content===proposal.before?'提案与当前文件相同，无需保存。':'已核对提案的文件、工作区与读取版本。请审阅后采用，再点击“保存”。');
  }
  async function handleRequest(text,page){
    const guard=binding;
    let raw;try{raw=parseStringEnvelope(text);}catch{fail('E_REQUEST_FORMAT','读取请求不是完整的字符串 JSON。');}
    if(guard?.consumed.has(raw.requestId))fail('E_REQUEST_REPLAY','本请求已经处理过，不会再次执行 Native 读取。');
    const request=parseFileRequest(text,requestContext?.request);
    // Consume BEFORE the first asynchronous dispatch. Errors and late replies
    // never restore this nonce; only refilling a retained result may be retried.
    guard.consumed.add(request.requestId);requestContext=null;clearEdit();
    Object.assign(stages,{recognized:'已核验 '+request.operation,native:'处理中',fill:'未回填',sent:'未发送结果'});emit();
    let data,error,edit;
    try{
      await assertBinding(guard,{turnKey:page.turnKey,answerKey:page.answerKey});
      const result=await requestFile(request,guard.authority);
      await assertBinding(guard,{turnKey:page.turnKey,answerKey:page.answerKey});data=result.data;
      if(result.record){
        const created=createEditContext(result.record,{source:guard.source,authority:guard.authority,bindingId:guard.id});
        context=created.context;contextBinding=guard;
        edit={protocol:EDIT_PROTOCOL,requestId:context.requestId,workspaceId:context.workspaceId,bindingId:guard.id,
          path:context.path,baseSha256:context.baseSha256,content:context.baseContent};
      }
      stages.native='成功 · '+request.path;
    }catch(e){error=e;stages.native=(e.code||'E_FILES_IO')+' · '+(e.outcome==='OUTCOME_UNKNOWN'?'结果未知':'已拒绝或失败');}
    const next=createFileRequestContext({workspaceId:request.workspaceId,bindingId:guard.id,path:request.operation==='read'?request.path:'README.md'});
    requestContext=next;
    const formatted=formatFileResult(request,{data,error,nextRequest:next.request,edit});
    resultPacket={...formatted,binding:guard,operationId:formatted.result.resultId,turnKey:page.turnKey,answerKey:page.answerKey,state:'ready'};
    resultState='Native 结果已保留，准备回填。';emit();
    await fillPacket(resultPacket,{result:true});
  }
  async function readAnswer(){
    invalidatePreview();
    if(binding?.mode==='requests'){
      const guard=binding;await assertBinding(guard);
      if(resultPacket?.binding===guard){
        const delivery=await readChatGPTEdit(api,guard.source,'',{identityOnly:true,resultId:resultPacket.result.resultId});
        if(delivery.resultObserved){stages.sent='已在同一对话用户消息中观察到结果';emit();}
      }
      const ids=[requestContext?.request.requestId,context?.requestId].filter(Boolean);
      if(!ids.length)fail('E_REQUEST_CONTEXT','请建立新的读取请求。');
      const page=await readChatGPTEdit(api,guard.source,ids[0],{protocols:[REQUEST_PROTOCOL,EDIT_PROTOCOL],requestIds:ids,
        requireUserEcho:true,resultId:resultPacket?.result.resultId});
      await assertBinding(guard,{turnKey:page.turnKey,answerKey:page.answerKey});
      if(page.resultObserved){stages.sent='已在同一对话用户消息中观察到结果';emit();}
      const text=page.blocks[0];let protocol;try{protocol=JSON.parse(text).protocol;}catch{}
      if(protocol===EDIT_PROTOCOL){answer=text;await review(text,page);stages.recognized='修改提案已核验';emit();}
      else await handleRequest(text,page);
      return;
    }
    active();if(!context.source)fail('E_CHAT_TARGET','请选择 ChatGPT 对话并生成上下文，或手工粘贴提案。');
    await checkSource();const result=await readChatGPTEdit(api,context.source,context.requestId);
    answer=result.blocks[0];await review(result.blocks[0],result);
  }
  async function adopt(){
    if(!proposal)fail('E_EDIT_CONTEXT','请先读取或粘贴提案并查看修改建议。');
    const approvedProposal=proposal,expectedTurn=proposalTurn;
    await checkSource();await assertBinding(contextBinding,expectedTurn||{});
    if(proposal!==approvedProposal)fail('E_EDIT_CONTEXT','提案已变化或已丢弃，请重新审阅。');
    const approved=validateEditProposal(approvedProposal,context,getRecord()),record=getRecord();
    if(!isWritable())fail('E_FILES_ACCESS','当前工作区只有读取权限，不能采用为可保存提案。');
    if(approved.content===record.content)fail('E_EDIT_UNCHANGED','文件内容没有变化。');
    adopted.set(record,{requestId:context.requestId,approvedContent:approved.content,context,binding:contextBinding,answer:expectedTurn});
    clearEdit();setDraft(record,approved.content);
    note('已采用为本地草稿，尚未写盘。保存前会再次核对原对话、目录租约与文件基准。');
  }
  function copy(text,message){
    if(!text)return;
    const clipboard=globalThis.navigator?.clipboard;
    if(!clipboard?.writeText){note('浏览器不允许复制，请手工选择下方文本。',true);return;}
    return clipboard.writeText(text).then(()=>note(message)).catch(()=>note('复制未完成，请手工选择文本。',true));
  }
  // Keep asynchronous business actions inside the workspace's existing run guard.
  const action=fn=>{
    if(disposed)return;
    return run(async()=>{
      if(disposed)return;
      try{await fn();}
      catch(error){note((error.code||'E_EDIT')+' · '+(error.message||error),true);}
      finally{emit();}
    });
  };
  const actions=Object.freeze({
    setTask(value){if(!disposed){task=String(value??'');emit();}},
    setRequestPath(value){if(!disposed){requestPath=String(value??'');emit();}},
    setAnswer(value){if(!disposed){answer=String(value??'');invalidatePreview();emit();}},
    prepareEdit:()=>action(prepare),prepareFileRequest:()=>action(prepareRequest),
    fillContext:()=>action(()=>fillPacket(promptPacket)),refillResult:()=>action(()=>fillPacket(resultPacket,{result:true})),
    copyContext:()=>disposed?undefined:copy(prompt,'上下文已复制；这不是自动回填或发送。'),
    readChatGPT:()=>action(readAnswer),review:()=>action(()=>review(answer)),adopt:()=>action(adopt),
    discard(){if(!disposed){invalidatePreview();note('已丢弃提案预览，文件与草稿未变。');}},
    copyReceipt:()=>disposed?undefined:copy(receipt,'回执已复制，可贴回原对话；第二轮请建立新的读取请求。'),
    demoAnswer:()=>action(async()=>{
      if(!demo)return;active();
      const content=context.baseContent+(/\.(md|markdown|txt)$/i.test(context.path)?'\n\n本次修改：已走通对话提案、人工审阅、保存和读回流程。\n':/\.html?$/i.test(context.path)?'\n<p>这是一份演示修改提案。</p>\n':'\n// 这是一份演示修改提案。\n');
      answer='```opendesk-edit\n'+JSON.stringify({protocol:EDIT_PROTOCOL,requestId:context.requestId,path:context.path,baseSha256:context.baseSha256,content},null,2)+'\n```';
      await review(answer);
    })
  });
  snapshot=buildSnapshot();
  return {
    getSnapshot:()=>snapshot,
    subscribe(listener){if(disposed)return ()=>{};listeners.add(listener);return ()=>listeners.delete(listener);},
    actions,
    invalidate,
    authorityChanged(){if(!disposed&&binding&&!sameAuthority(binding.authority,getAuthority()))invalidate('本目录授权或连接代次已变化，旧请求和提案已停用。');},
    forgetRecord(record){if(!disposed){adopted.delete(record);clearEdit();emit();}},
    async beforeSave(record){
      const item=adopted.get(record);if(!item)return;
      await assertBinding(item.binding,item.answer||{});
      if(record.workspaceId!==item.context.workspaceId||record.path!==item.context.path||record.sha256!==item.context.baseSha256||record.baseContent!==item.context.baseContent)
        fail('E_EDIT_BASE','提案的读取基准已经变化，请重新读取并审阅。');
    },
    update(options={}){
      if(disposed)return;
      if(Object.hasOwn(options,'busy'))busy=!!options.busy;
      if(Object.hasOwn(options,'connected'))connected=!!options.connected;
      const next=key(getRecord());
      if(recordKey!==next){clearEdit();recordKey=next;if(!binding)status={text:localizeLiteral('绑定工作区和当前对话后建立读取请求；文件读取与提案审阅都不会保存。'),error:false};}
      emit();
    },
    dispose(){
      if(disposed)return;
      listeners.clear();invalidate();disposed=true;snapshot=buildSnapshot();
    },
    async saved(record,committed=record){
      const item=adopted.get(record);if(!item)return;adopted.delete(record);
      // Keep the adoption keyed by the live record, but attribute the receipt
      // only to the immutable version actually written and independently read back.
      const savedVersion=Object.freeze({...committed});
      if(savedVersion.workspaceId!==item.context.workspaceId||savedVersion.path!==item.context.path){
        note('保存版本的文件身份与原提案不符，未生成成功回执。',true);return;
      }
      if(savedVersion.content!==item.approvedContent){note('文件已保存，但内容经过人工调整，未生成原 AI 提案的成功回执。');return;}
      try{await assertBinding(item.binding,item.answer||{});}
      catch{note('文件已保存并读回，但原对话绑定已失效，未生成可回传的提案成功回执。',true);return;}
      receipt=createEditReceipt(savedVersion,item.requestId,{demo});
      if(item.context.bindingId)receipt=JSON.stringify({...JSON.parse(receipt),workspaceId:savedVersion.workspaceId,bindingId:item.context.bindingId,baseSha256:item.context.baseSha256},null,2);
      note(record.content!==savedVersion.content
        ?(demo?'演示提案版本已保存到内存并读回':'保存时的提案版本已写入并读回核对')+'；后续编辑仍是未保存草稿，未计入此回执。'
        :demo?'演示修改已保存到内存并读回。':'修改已保存并读回核对；第二轮请建立新的读取请求，使用本次保存后的真实基准。');
    }
  };
}

export const initWorkspaceChatEdit=createWorkspaceChatEdit;
