import {createEditContext,parseEditProposal,validateEditProposal,createEditReceipt,EDIT_PROTOCOL} from './workspace-ai-proposal.js';
import {isChatGPTURL,readChatGPTEdit} from './workspace-chatgpt.js';

export function initWorkspaceChatEdit({api,doc,demo,getRecord,getTarget,readCurrent,setDraft,run,isWritable}){
  const el=id=>doc.getElementById(id);
  let context=null,proposal=null,prompt='',recordKey='',receipt='';
  const adopted=new WeakMap();
  const note=(message,error=false)=>{el('chat-edit-status').textContent=message;el('chat-edit-status').classList.toggle('error',error);};
  const fail=(code,message)=>{throw {code,message,outcome:'NOT_DISPATCHED'};};
  const key=record=>record?record.workspaceId+'\0'+record.path:'';
  function invalidatePreview(){proposal=null;el('edit-review').hidden=true;}
  function clear(){
    context=null;prompt='';el('edit-context').value='';el('edit-answer').value='';
    el('edit-context-panel').hidden=true;invalidatePreview();
  }
  function active(){
    if(!context)fail('E_EDIT_CONTEXT','请先为当前文件生成新的对话上下文。');
    validateEditProposal({requestId:context.requestId,path:context.path,baseSha256:context.baseSha256,content:context.baseContent},context,getRecord());
    return context;
  }
  async function checkSource(){
    const snapshot=active();
    if(!snapshot.source)return;
    const selected=getTarget();
    if(!selected||selected.tabId!==snapshot.source.tabId||selected.documentId!==snapshot.source.documentId)
      fail('E_CHAT_TARGET','目标页面选择已变化，请重新生成上下文。');
    await readChatGPTEdit(api,snapshot.source,snapshot.requestId,{identityOnly:true});
  }
  async function prepare(){
    // Never replace a dirty draft when refreshing the export baseline.
    createEditContext(getRecord(),{task:el('edit-task').value});
    let source=null;const target=getTarget();
    if(!demo&&target&&isChatGPTURL(target.url)){
      const frame=await api.webNavigation.getFrame({tabId:target.tabId,frameId:0});
      if(frame?.documentId!==target.documentId)fail('E_CHAT_TARGET','目标页面已经刷新，请先刷新连接后重新选择。');
      source={tabId:target.tabId,documentId:target.documentId,url:frame.url};
      if(!new URL(source.url).pathname.includes('/c/'))fail('E_CHAT_TARGET','请先在 ChatGPT 建立或打开一个已有对话，再生成上下文；也可以取消目标选择，使用手工粘贴模式。');
      await readChatGPTEdit(api,source,'',{identityOnly:true});
    }
    const record=await readCurrent();
    const created=createEditContext(record,{task:el('edit-task').value,source});
    clear();context=created.context;prompt=created.prompt;
    el('edit-context').value=prompt;el('edit-context-panel').hidden=false;
    el('edit-context-binding').textContent=source?'已绑定：'+source.url:'手工粘贴模式 · 仅关联当前文件和本次请求';
    note('上下文已生成。复制后粘贴到当前 ChatGPT 对话，由你发送。'+(demo?' 当前使用内存演示文件。':''));
  }
  async function review(text){
    // Clear an older preview even when replacement input is malformed.
    invalidatePreview();
    await checkSource();
    proposal=validateEditProposal(parseEditProposal(text),context,getRecord());
    el('edit-before').textContent=proposal.before||'（空文件）';
    el('edit-after').textContent=proposal.content||'（将清空文件正文）';
    el('edit-review-summary').textContent=proposal.path+' · '+new TextEncoder().encode(proposal.before).length+' → '+proposal.bytes+' bytes · 完整文件替换';
    el('edit-review').hidden=false;
    note(proposal.content===proposal.before?'提案与当前文件相同，无需保存。':'已核对文件与版本。请比较原内容和建议内容，采用后再点击「保存」。');
  }
  async function readAnswer(){
    invalidatePreview();
    active();if(!context.source)fail('E_CHAT_TARGET','请先选择 ChatGPT 目标页面，重新生成上下文；也可以手动粘贴回答。');
    await checkSource();
    const result=await readChatGPTEdit(api,context.source,context.requestId);
    el('edit-answer').value=result.blocks[0];
    await review(result.blocks[0]);
  }
  async function adopt(){
    if(!proposal)fail('E_EDIT_CONTEXT','请先读取或粘贴提案并查看修改建议。');
    await checkSource();
    const approved=validateEditProposal(proposal,context,getRecord()),record=getRecord();
    if(!isWritable())fail('E_FILES_ACCESS','当前工作区只有读取权限。');
    if(approved.content===record.content)fail('E_EDIT_UNCHANGED','文件内容没有变化。');
    adopted.set(record,{requestId:context.requestId,approvedContent:approved.content});
    // Consume the request before a draft can be adopted a second time. A
    // successful import has no Native write; the existing Save button owns it.
    clear();setDraft(record,approved.content);
    note('已采用为本地草稿，尚未写入。请检查预览，点击文件上方的「保存」。');
  }
  function copy(text,message){
    if(!text)return;
    const clipboard=globalThis.navigator?.clipboard;
    if(!clipboard?.writeText){note('浏览器不允许复制。请在下方文本框中手工选择并复制。',true);return;}
    clipboard.writeText(text).then(()=>note(message)).catch(()=>note('复制未完成，请手工选择下方文本复制。',true));
  }
  const action=fn=>run(async()=>{try{await fn();}catch(error){note((error.code||'E_EDIT')+' · '+(error.message||error),true);}});
  el('prepare-edit').addEventListener('click',()=>action(prepare));
  el('copy-edit-context').addEventListener('click',()=>copy(prompt,'上下文已复制。请粘贴到当前对话；本操作没有发送消息。'));
  el('read-chatgpt-edit').addEventListener('click',()=>action(readAnswer));
  el('review-edit').addEventListener('click',()=>action(()=>review(el('edit-answer').value)));
  el('adopt-edit').addEventListener('click',()=>action(adopt));
  el('discard-edit').addEventListener('click',()=>{proposal=null;el('edit-review').hidden=true;note('已丢弃这份预览，原文件和草稿未变。');});
  el('edit-answer').addEventListener('input',()=>{proposal=null;el('edit-review').hidden=true;});
  el('copy-edit-receipt').addEventListener('click',()=>copy(receipt,'保存回执已复制，你可以贴回原对话继续修改。'));
  el('demo-edit-answer').hidden=!demo;
  el('demo-edit-answer').addEventListener('click',()=>action(async()=>{
    if(!demo)return;active();
    const content=context.baseContent+(/\.(md|markdown|txt)$/i.test(context.path)?'\n\n本次修改：已走通对话提案、人工审阅、保存和读回流程。\n':/\.html?$/i.test(context.path)?'\n<p>这是一份演示修改提案。</p>\n':'\n// 这是一份演示修改提案。\n');
    const answer='```opendesk-edit\n'+JSON.stringify({protocol:EDIT_PROTOCOL,requestId:context.requestId,path:context.path,baseSha256:context.baseSha256,content},null,2)+'\n```';
    el('edit-answer').value=answer;await review(answer);
  }));
  return {
    controls({busy=false,connected=false}={}){
      const record=getRecord(),next=key(record);
      if(recordKey!==next){clear();recordKey=next;note('选定文件后生成上下文，只处理这一个文件；读取回答不会保存文件。');}
      const clean=!!record&&!record.unknown&&!record.remote&&record.content===record.baseContent;
      el('prepare-edit').disabled=busy||!connected||!clean;
      el('copy-edit-context').disabled=busy||!prompt;
      el('read-chatgpt-edit').disabled=busy||demo||!context?.source||!clean||!connected;
      for(const id of ['review-edit','demo-edit-answer'])el(id).disabled=busy||!context||!clean||!connected;
      el('adopt-edit').disabled=busy||!proposal||!isWritable()||!connected||!clean||proposal.content===proposal.before;
      el('discard-edit').disabled=busy;
      for(const id of ['edit-task','edit-answer'])el(id).disabled=busy;
      el('copy-edit-receipt').disabled=busy||!receipt;
    },
    saved(record){
      const adoptedEdit=adopted.get(record);if(!adoptedEdit)return;
      adopted.delete(record);
      if(record.content!==adoptedEdit.approvedContent){note('文件已保存，但内容经过人工调整，未生成原 AI 提案的成功回执。');return;}
      receipt=createEditReceipt(record,adoptedEdit.requestId,{demo});
      el('edit-receipt').textContent=receipt;el('edit-receipt-panel').hidden=false;
      note(demo?'演示修改已保存到内存并读回。此回执不是本机磁盘写入。':'修改已保存到本地文件，并已读回核对。可以将回执复制回原对话。');
    }
  };
}
