// Fixed trusted extension UI: source binding and Native effects belong to the service.
// Text only. A future task/start integration belongs to the service, not this generator.
export function createTaskPrompt(task=''){
  const description=task.trim();
  if(!description)return '';
  return [
    '请协助我完成现有项目中的以下任务：',
    description,
    '先了解项目现状、相关入口和已有实现，复用现有能力，按任务范围完成必要修改，保留其他人的改动。需求存在关键歧义时先说明，再继续能够安全完成的部分。',
    '使用当前实际可用且已获授权的工具；需要访问项目文件或执行操作时，先确认对应访问条件。缺少权限或工具时，说明所需条件，不编造文件内容或执行结果。',
    '完成后进行与本次任务相关的最小验证，报告改动、验证结果以及仍未完成或未验证的事项。'
  ].join('\n\n');
}

export function initChatGPTFilesUI({api=globalThis.chrome,document:doc=globalThis.document,timers=globalThis}={}){
  const root=doc.getElementById('chatgpt-files-root');
  if(!root)return;
  const el=id=>doc.getElementById(`files-${id}`);
  const show=value=>typeof value==='string'?value:value==null?'':JSON.stringify(value,null,2);
  let snapshot={},busy=false,claimed=false,workspaceId='',consent=false;
  let timer,stopped=false,automatic=false;
  const cancelPoll=()=>{if(timer!==undefined)timers.clearTimeout(timer);timer=undefined;};
  const schedule=()=>{
    cancelPoll();
    if(!stopped&&automatic&&snapshot.automation?.active)timer=timers.setTimeout(()=>run('poll'),2500);
  };
  const filled=new Set(),attemptedWrites=new Set();
  const packetKey=packet=>JSON.stringify([packet,snapshot.request,snapshot[packet==='prompt'?'prompt':'resultText']]);
  const proposalKey=()=>JSON.stringify(snapshot.proposal);
  const text=(id,value)=>{el(id).textContent=show(value);};
  function render(){
    root.setAttribute('aria-busy',String(busy));
    text('source',snapshot.source?.url||'尚未检查当前对话；本地生成任务提示词无需绑定对话。');
    text('connection',snapshot.connected===true?'Native 已连接':'Native 未连接或连接状态未确认');
    const picker=el('workspace');
    const placeholder=doc.createElement('option');
    placeholder.value='';placeholder.textContent='请选择目录（不自动选择）';
    picker.replaceChildren(placeholder);
    for(const workspace of snapshot.workspaces||[]){
      const option=doc.createElement('option');
      option.value=workspace.workspaceId;
      option.textContent=`${workspace.name||workspace.workspaceId} · ${show(workspace.access)}`;
      picker.append(option);
    }
    if(!(snapshot.workspaces||[]).some(item=>item.workspaceId===workspaceId))workspaceId='';
    picker.value=workspaceId;
    el('prompt').value=show(snapshot.prompt);
    el('result').value=show(snapshot.resultText);
    text('request',snapshot.request);
    const proposal=snapshot.proposal;
    el('proposal').hidden=!proposal;
    text('proposal-path',proposal?.path);
    text('sha',proposal?`原文件 SHA-256：${show(proposal.baseSha256)}\n请求 ID：${show(proposal.requestId)}`:'');
    el('before').value=show(proposal?.before);
    el('after').value=show(proposal?.content);
    text('result-status',snapshot.resultStatus?`执行状态：${show(snapshot.resultStatus)}`:'尚无执行结果');
    text('delivery',`草稿填入状态：${show(snapshot.delivery)||'未确认'}。填入后仍需用户点击发送。`);
    text('observed',`发送后原对话用户消息中的结果标记：${show(snapshot.observed)||'未确认'}（仅由检查回执确认收到）`);
    text('message',el('error').hidden?(snapshot.proposal?'请审阅并确认具体修改。':automatic&&snapshot.automation?.active?'自动等待原对话的完整协议回答；结果将填入原对话草稿。'+show(snapshot.message):snapshot.message):'');
    for(const control of root.querySelectorAll('button,input,select,textarea:not([readonly])'))control.disabled=busy||!claimed;
    // Local drafting remains available even during a pending or failed bootstrap.
    el('task-description').disabled=false;
    el('generate-task').disabled=false;
    el('state').disabled=busy;
    const project=snapshot.projectConnection;
    text('project-name',project?.name||'尚无已定位项目');
    text('project-target',snapshot.source?.url||'尚未核验原始对话');
    text('project-task',project?.task||'请在 ChatGPT 对话中启动项目任务，再检查连接。');
    text('project-message',project?.message);
    el('connect-project').disabled=busy||!claimed||project?.needsConnection!==true||!project?.workspaceId;
    el('revoke-project').disabled=busy||!claimed||!project?.grantId;
    el('prepare').disabled=busy||!claimed||snapshot.connected!==true||!workspaceId||!consent||
      (el('operation').value!=='list'&&!el('path').value.trim());
    el('approve').disabled=busy||!claimed||snapshot.connected!==true||!proposal||snapshot.automation?.phase==='paused'||attemptedWrites.has(proposalKey());
    for(const packet of ['prompt','result'])el(`fill-${packet}`).disabled=busy||!claimed||
      !snapshot[packet==='prompt'?'prompt':'resultText']||filled.has(packetKey(packet))||
      snapshot[packet==='prompt'?'promptDelivery':'delivery']!=='ready'||snapshot.automation?.phase==='paused';
    el('inspect').disabled=busy||!claimed||!snapshot.request||snapshot.automation?.phase==='paused';
    el('reconcile').disabled=busy||!claimed||(!snapshot.request&&!proposal);
    el('observe').disabled=busy||!claimed||!snapshot.resultText;
  }
  async function send(message){
    const reply=await api.runtime.sendMessage(message);
    if(reply?.ok!==true)throw reply?.error||{code:'E_NO_REPLY',message:'未收到有效回执，操作结果未确认。'};
    if(!reply.data||typeof reply.data!=='object')throw {code:'E_SNAPSHOT',message:'状态回执无效，操作结果未确认。'};
    return reply.data;
  }
  async function run(action,fields={}){
    if(busy||!claimed)return;
    cancelPoll();
    busy=true;el('error').hidden=true;render();
    const key=action==='fill'?packetKey(fields.packet):null;
    // Never replay a write or composer fill after an uncertain response.
    if(action==='approve')attemptedWrites.add(proposalKey());
    if(key)filled.add(key);
    try{
      snapshot=await send({protocol:'opendesk.chatgpt.files.v1',action,...fields});
      if(action==='prepare')automatic=true;
    }
    catch(error){automatic=false;text('error',`${error.code||'E_REQUEST'}：${error.message||'操作失败，结果未确认。'}`);el('error').hidden=false;}
    finally{busy=false;render();schedule();}
  }
  const click=(id,handler)=>el(id).addEventListener('click',event=>{
    if(event.isTrusted&&!busy&&claimed&&!el(id).disabled)handler();
  });
  el('generate-task').addEventListener('click',event=>{
    if(event.isTrusted)el('task-prompt').value=createTaskPrompt(el('task-description').value);
  });
  for(const id of ['workspace','path','operation','task','consent'])el(id).addEventListener(id==='path'||id==='task'?'input':'change',event=>{
    if(!event.isTrusted||busy||!claimed)return;
    automatic=false;cancelPoll();
    if(id==='workspace')workspaceId=el(id).value;
    if(id==='consent')consent=el(id).checked;
    else{consent=false;el('consent').checked=false;}
    render();if(snapshot.request)void run('pause');
  });
  el('state').addEventListener('click',event=>{
    if(event.isTrusted&&!busy)void (claimed?run('state'):bootstrap());
  });
  click('connect-project',()=>run('connect-project',{workspaceId:snapshot.projectConnection.workspaceId}));
  click('revoke-project',()=>run('revoke-project',{grantId:snapshot.projectConnection.grantId}));
  click('prepare',()=>run('prepare',{workspaceId,path:el('path').value,
    operation:el('operation').value,task:el('task').value}));
  for(const action of ['inspect','reconcile','observe'])click(action,()=>run(action));
  click('approve',()=>run('approve',{reviewId:snapshot.proposal?.reviewId}));
  for(const packet of ['prompt','result'])click(`fill-${packet}`,()=>run('fill',{packet,
    packetId:snapshot[packet==='prompt'?'promptPacketId':'resultPacketId']}));
  doc.defaultView?.addEventListener('pagehide',()=>{stopped=true;automatic=false;cancelPoll();},{once:true});
  async function bootstrap(){
    busy=true;render();
    try{
      snapshot=await send({protocol:'opendesk.chatgpt.file-intent.v1',kind:'claim'});
      claimed=true;
      snapshot=await send({protocol:'opendesk.chatgpt.files.v1',action:'state'});
    }catch(error){text('error',`${error.code||'E_CLAIM'}：${error.message||'无法核验文件请求。'}`);el('error').hidden=false;}
    finally{busy=false;render();}
  }
  render();
}
