// First-party, local-only DOM fixture adapter. Not a Browser SDK or Provider Host.
// Runs from the admitted trusted knowledge workspace; no sandbox package or page
// can invoke these functions. Chrome executeScript always binds an exact documentId.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const ORIGIN='http://127.0.0.1:43111';
const PATH='/ai-knowledge-chat-demo.html';
const isFixtureUrl=url=>{
  try{const parsed=new URL(url);return parsed.origin===ORIGIN&&parsed.pathname===PATH&&
    !parsed.username&&!parsed.password;}catch{return false;}
};

// Chrome serializes this entire function into the target isolated world: no closure captures.
export function localKnowledgeDemoDOM({operation,replyTo,threadId,answer}={}){
  if(location.origin!=='http://127.0.0.1:43111'||location.pathname!=='/ai-knowledge-chat-demo.html')
    return {ok:false,code:'E_KB_DEMO_SCOPE'};
  const root=document.querySelector('#kb-demo-root[data-kb-demo="v1"]');
  const list=document.getElementById('kb-demo-message-list');
  if(!root||!list)return {ok:false,code:'E_KB_DEMO_CONTRACT'};
  const activeThread=root.dataset.activeThread;
  if(!/^thread_demo_0[12]$/u.test(activeThread||''))
    return {ok:false,code:'E_KB_DEMO_THREAD'};
  const read=()=>[...list.querySelectorAll('[data-message-id][data-thread-id][data-direction]')]
    .slice(-100).map(node=>({
      messageId:node.dataset.messageId,threadId:node.dataset.threadId,
      direction:node.dataset.direction,scope:node.dataset.scope||'',
      replyTo:node.dataset.replyTo||'',
      createdAt:node.dataset.createdAt||'',
      text:node.querySelector('[data-message-text]')?.textContent||''
    }));
  if(operation==='read'){
    root.dataset.kbExtensionObserved='true';
    return {ok:true,threadId:activeThread,messages:read()};
  }
  if(operation==='detach'){
    delete root.dataset.kbExtensionObserved;
    return {ok:true,threadId:activeThread};
  }
  if(operation==='send'){
    if(typeof replyTo!=='string'||!/^kb_msg_[0-9a-f-]{36}$/u.test(replyTo)||
       !/^thread_demo_0[12]$/u.test(threadId||'')||threadId!==activeThread||
       typeof answer!=='string'||!answer.trim()||answer.length>3000)
      return {ok:false,code:'E_KB_DEMO_INPUT'};
    const rows=read(),customer=rows.filter(row=>row.direction==='customer'&&
      row.threadId===threadId&&row.messageId===replyTo);
    if(customer.length!==1)return {ok:false,code:'E_KB_DEMO_STALE'};
    if(rows.some(row=>row.direction==='agent'&&row.threadId===threadId&&row.replyTo===replyTo))
      return {ok:false,code:'E_KB_DEMO_DUPLICATE'};
    const draft=document.getElementById('kb-demo-agent-draft');
    const button=document.getElementById('kb-demo-agent-send');
    if(!draft||draft.tagName!=='TEXTAREA'||!button||button.tagName!=='BUTTON'||
       draft.value||draft.dataset.replyTo||draft.dataset.threadId||button.disabled)
      return {ok:false,code:'E_KB_DEMO_DRAFT_BUSY'};
    draft.value=answer;
    draft.dataset.replyTo=replyTo;
    draft.dataset.threadId=threadId;
    // This exercises the actual SITE handler, rather than appending a fake reply.
    button.click();
    const after=read().filter(row=>row.direction==='agent'&&row.threadId===threadId&&row.replyTo===replyTo);
    if(after.length!==1)return {ok:false,code:'E_KB_DEMO_OUTCOME_UNKNOWN'};
    if(after[0].text!==answer.trim())return {ok:false,code:'E_KB_DEMO_RECEIPT_MISMATCH'};
    return {ok:true,threadId,messageId:after[0].messageId,replyTo,text:after[0].text};
  }
  return {ok:false,code:'E_KB_DEMO_OPERATION'};
}

export function createLocalKnowledgeDemoAdapter({api,currentPageTarget}={}){
  if(typeof api?.scripting?.executeScript!=='function'||
     typeof currentPageTarget?.capture!=='function'||
     typeof currentPageTarget?.revalidate!=='function')
    throw fail('E_KB_DEMO_HOST','没有可用的原始 Chrome 文档绑定能力');
  let captured=null;
  async function invoke(operation,payload={},beforeDispatch=null){
    if(!captured)throw fail('E_KB_DEMO_STOPPED','尚未批准本地测试网页');
    const bound=captured;
    await currentPageTarget.revalidate(bound);
    if(captured!==bound)throw fail('E_KB_DEMO_STOPPED','测试网页已停止或文档已替换');
    if(!isFixtureUrl(captured.url))throw fail('E_KB_DEMO_SCOPE','超出了固定本地测试网页');
    let received;
    // After revalidation, check the latest pause state before Chrome dispatch.
    // A click that already started cannot be revoked.
    beforeDispatch?.();
    try{
      received=await api.scripting.executeScript({
        target:{tabId:captured.tabId,documentIds:[captured.documentId]},
        world:'ISOLATED',func:localKnowledgeDemoDOM,args:[{operation,...payload}]
      });
    }catch(error){throw fail('E_KB_DEMO_INJECT','无法访问已核准测试文档：'+String(error?.message||error));}
    if(!Array.isArray(received)||received.length!==1||
       received[0].frameId!==0||received[0].documentId!==captured.documentId||
       !received[0].result||received[0].result.ok!==true)
      throw fail(received?.[0]?.result?.code||'E_KB_DEMO_IDENTITY',
        '测试文档身份、网页合同或操作回执未通过检查');
    await currentPageTarget.revalidate(captured);
    return received[0].result;
  }
  return Object.freeze({
    async start(){
      if(captured)throw fail('E_KB_DEMO_RUNNING','本地测试已经在运行');
      await currentPageTarget.refresh();
      const target=currentPageTarget.capture();
      if(!isFixtureUrl(target.url)||target.frameId!==0)
        throw fail('E_KB_DEMO_SCOPE','请在当前窗口打开 127.0.0.1:43111 的指定客服测试页');
      captured=target;
      try{const first=await invoke('read');return {
        target:{tabId:target.tabId,documentId:target.documentId,url:target.url},
        ...first
      };}catch(error){captured=null;throw error;}
    },
    read(){return invoke('read');},
    // Never retry after an unknown click result. A separate read confirms the same reply.
    async send({messageId,threadId,answer,assertBeforeClick}){
      const receipt=await invoke('send',{replyTo:messageId,threadId,answer},assertBeforeClick);
      const observed=await invoke('read');
      const matches=observed.messages.filter(row=>row.direction==='agent'&&
        row.threadId===threadId&&row.replyTo===messageId&&
        row.messageId===receipt.messageId&&row.text===answer.trim());
      if(matches.length!==1)throw fail('E_KB_DEMO_OUTCOME_UNKNOWN',
        '发送后未取得唯一匹配的 DOM 回执；结果未知，禁止自动重试');
      return {status:'CONFIRMED',messageId:receipt.messageId,threadId,replyTo:messageId};
    },
    async stop(){
      const owned=captured;captured=null;
      if(!owned)return;
      try{
        // Cleanup is scoped to the retired exact document, never a replacement tab.
        await api.scripting.executeScript({
          target:{tabId:owned.tabId,documentIds:[owned.documentId]},
          world:'ISOLATED',func:localKnowledgeDemoDOM,args:[{operation:'detach'}]
        });
      }catch{/* Navigation or revocation already removed the old fixture document. */}
    },
    drop(){captured=null;},
    get target(){return captured?{url:captured.url,documentId:captured.documentId}:null;}
  });
}
