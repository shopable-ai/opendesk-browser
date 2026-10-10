export function isChatGPTURL(value){
  try{const url=new URL(value);return !url.username&&!url.password&&
    ['https://chatgpt.com','https://chat.openai.com'].includes(url.origin);}catch{return false;}
}
export function chatGPTConversationId(value){
  if(!isChatGPTURL(value))return null;
  return new URL(value).pathname.match(/(?:^|\/)c\/([A-Za-z0-9-]+)\/?$/)?.[1]||null;
}

// Chrome serializes this function into the extension's ISOLATED world. It
// exposes no listener, Native RPC, credentials, or model API to the page.
export function inspectChatGPTEditsOnPage({expectedUrl,requestId,identityOnly=false,
  protocols=['opendesk.workspace.edit.v1'],requestIds,requireUserEcho=false,resultId=null,requireComplete=false}){
  const error=(code,message)=>({ok:false,error:{code,message,outcome:'NOT_DISPATCHED'}});
  const url=location.href;
  if(url!==expectedUrl||!['https://chatgpt.com','https://chat.openai.com'].includes(location.origin))
    return error('E_CHAT_TARGET','对话页面已经切换，请重新绑定当前对话。');
  const hidden=node=>{
    if(node.closest('[hidden],[aria-hidden="true"]'))return true;
    for(let part=node;part;part=part.parentElement){const style=globalThis.getComputedStyle?.(part);
      if(style?.display==='none'||style?.visibility==='hidden'||style?.visibility==='collapse')return true;}
    return false;
  };
  const messages=[...document.querySelectorAll('[data-message-author-role="user"],[data-message-author-role="assistant"]')]
    .filter(node=>!hidden(node)&&!node.parentElement?.closest('[data-message-author-role]'));
  let lastUser=-1;
  for(let index=0;index<messages.length;index++)if(messages[index].getAttribute('data-message-author-role')==='user')lastUser=index;
  const local=globalThis.__opendeskWorkspaceChatV1||(globalThis.__opendeskWorkspaceChatV1={turns:new WeakMap(),counter:0,fills:new Map()});
  const user=messages[lastUser];
  local.userTexts ||= new WeakMap();
  if(user&&(!local.turns.has(user)||local.userTexts.get(user)!==(user.textContent||''))){
    local.turns.set(user,'turn-'+(++local.counter));local.userTexts.set(user,user.textContent||'');
  }
  const turnKey=user?local.turns.get(user):'no-user';
  const userText=user?.textContent||'';
  const stop=[...document.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"]')].some(node=>!hidden(node));
  const answer=lastUser<0?[]:messages.slice(lastUser+1);
  const streaming=stop||answer.some(node=>node.matches('[data-is-streaming="true"],.result-streaming')||node.closest('[data-is-streaming="true"],.result-streaming')||node.querySelector('[data-is-streaming="true"],.result-streaming'));
  // Keep both node identity and its observed text revision. Regenerating an
  // answer under the same user message must not preserve an approved proposal.
  let answerKey=null;
  if(answer.length&&!streaming){
    local.answers ||= new WeakMap();let total=0;
    const keys=[];
    for(const node of answer){
      const text=node.textContent||'';total+=text.length;
      if(total>400*1024)return error('E_CHAT_LIMIT','当前回答过长，无法核对完整版本。');
      let item=local.answers.get(node);
      if(!item){item={id:'answer-'+(++local.counter),revision:0,text};local.answers.set(node,item);}
      else if(item.text!==text){item.revision++;item.text=text;}
      keys.push(item.id+':'+item.revision);
    }
    answerKey=keys.join('/');
  }
  if(identityOnly&&!requireComplete)return {ok:true,url,turnKey,answerKey,answerComplete:!!answerKey,
    ...(resultId?{resultObserved:userText.includes(resultId)}:{})};
  if(streaming)return error('E_CHAT_STREAMING','ChatGPT 仍在生成，请等回答结束再处理。');
  if(lastUser<0)return error('E_CHAT_FORMAT','无法确认本轮回答边界，未执行请求。');
  if(lastUser===messages.length-1)return error('E_CHAT_PENDING','最新问题尚未出现回答，没有读取上一轮内容。');
  if(identityOnly)return {ok:true,url,turnKey,answerKey,answerComplete:true};
  const ids=requestIds||[requestId];
  if(requireUserEcho&&!ids.some(id=>id&&userText.includes(id)))
    return error('E_CHAT_TURN','最新用户消息没有本轮请求身份，未使用旧回答。');
  const blocks=[];let count=0,total=0,unmarkedRequest=false;
  for(const node of answer){
    for(const code of node.querySelectorAll('pre code')){
      if(hidden(code)||code.closest('[data-message-author-role]')!==node||code.closest('blockquote,[data-opendesk-file-data]'))continue;
      if(++count>128)return error('E_CHAT_LIMIT','当前回答代码块过多。');
      const text=code.textContent||'';total+=text.length;
      if(total>400*1024)return error('E_CHAT_LIMIT','当前回答过长，未处理。');
      const label=(code.getAttribute?.('class')||'')+' '+(code.parentElement?.getAttribute?.('data-language')||'');
      let protocol;try{protocol=JSON.parse(text).protocol;}catch{}
      // Count ALL protocol candidates before checking the nonce. Conflicting
      // old/new blocks cannot be hidden by filtering on the expected ID first.
      const marked=/\b(?:language-)?opendesk-(?:edit|request)\b/.test(label);
      if(!marked&&!protocols.includes(protocol)&&
        !(text.trim().startsWith('{')&&protocols.some(p=>text.includes('"'+p+'"'))))continue;
      if(protocol==='opendesk.workspace.request.v1'&&!/\b(?:language-)?opendesk-request\b/.test(label))unmarkedRequest=true;
      blocks.push(text);
      if(blocks.length>1)return error('E_EDIT_AMBIGUOUS','当前回答包含多个请求或提案，请让模型只返回一个。');
    }
  }
  if(blocks.length!==1)return error('E_CHAT_FORMAT','本轮完整回答没有唯一的 OpenDesk 请求或提案。');
  if(unmarkedRequest)return error('E_CHAT_REQUEST_MARKER','读取请求必须在明确标记的 opendesk-request 代码块中，未执行正文中的示例。');
  if(!ids.some(id=>id&&blocks[0].includes(id)))return error('E_REQUEST_CONTEXT','回答的请求身份已过期，未执行。');
  return {ok:true,url,turnKey,answerKey,blocks,assistantFragments:answer.length,resultObserved:!!resultId&&userText.includes(resultId)};
}

// Uses the browser's editing command so the actual contenteditable editor can
// handle the edit. No DOM value assignment, fabricated input event or private
// ChatGPT endpoint. Successful insertion is NOT a message send.
export function fillChatGPTComposerOnPage({expectedUrl,text,operationId,expectedTurnKey}){
  const error=(code,message,outcome='NOT_DISPATCHED')=>({ok:false,error:{code,message,outcome}});
  if(location.href!==expectedUrl||!['https://chatgpt.com','https://chat.openai.com'].includes(location.origin))
    return error('E_CHAT_TARGET','目标对话已经切换，未回填。');
  if(typeof text!=='string'||new TextEncoder().encode(text).length>200*1024||typeof operationId!=='string')
    return error('E_CHAT_LIMIT','待回填结果超出文本预算。');
  const hidden=node=>{
    if(node.closest('[hidden],[aria-hidden="true"]'))return true;
    for(let p=node;p;p=p.parentElement){const s=globalThis.getComputedStyle?.(p);
      if(s?.display==='none'||s?.visibility==='hidden'||s?.visibility==='collapse')return true;}
    return false;
  };
  if([...document.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"],[data-is-streaming="true"],.result-streaming')].some(n=>!hidden(n)))
    return error('E_CHAT_STREAMING','ChatGPT 仍在生成，结果已保留，稍后可重试回填。');
  const local=globalThis.__opendeskWorkspaceChatV1;
  const users=[...document.querySelectorAll('[data-message-author-role="user"]')].filter(n=>!hidden(n)&&!n.parentElement?.closest('[data-message-author-role]'));
  const turnKey=users.length?(local?.userTexts?.get(users.at(-1))===(users.at(-1).textContent||'')?local?.turns.get(users.at(-1)):null):'no-user';
  if(!local||turnKey!==expectedTurnKey)return error('E_CHAT_TURN','对话已进入另一轮，未回填迟到结果。');
  const previous=local.fills.get(operationId);
  if(previous)return error('E_CHAT_REPLAY',previous==='filled'?'本结果已经回填过；不会重复插入或发送。':'上次回填结果未知，请先检查网页输入框。',previous==='filled'?'NOT_DISPATCHED':'OUTCOME_UNKNOWN');
  const editors=[...document.querySelectorAll('#prompt-textarea,textarea[data-testid="prompt-textarea"]')].filter(n=>!hidden(n));
  if(editors.length!==1)return error('E_CHAT_COMPOSER','未找到唯一的 ChatGPT 输入框，结果已保留。');
  const editor=editors[0],textarea=editor.tagName==='TEXTAREA';
  if(!textarea&&editor.getAttribute('contenteditable')!=='true'||editor.disabled||editor.getAttribute('aria-disabled')==='true')
    return error('E_CHAT_COMPOSER','当前输入框不支持安全编辑。');
  const form=editor.closest('form');
  if(!form)return error('E_CHAT_COMPOSER','无法核对输入框所属表单。');
  const hasFiles=[...form.querySelectorAll('input[type="file"]')].some(input=>input.files?.length);
  const attachments=form.querySelector('[data-testid="file-thumbnail"],[data-testid*="attachment-preview"],[data-testid*="file-preview"],[data-file-id],[data-upload-id],button[aria-label="Remove file"],button[aria-label="移除文件"]');
  if((textarea?editor.value:editor.textContent)||hasFiles||attachments||editor.querySelector('img,[contenteditable="false"]'))
    return error('E_CHAT_DRAFT','输入框已有草稿或附件，未覆盖。请先处理原草稿，再重试回填。');
  if(typeof document.execCommand!=='function')return error('E_CHAT_COMPOSER','浏览器不提供受支持的编辑命令。');
  if(local.fills.size>=128)return error('E_CHAT_LIMIT','本页面回填记录已达上限，请重新加载并绑定。');
  editor.focus();
  if(document.activeElement!==editor||location.href!==expectedUrl)
    return error('E_CHAT_COMPOSER','无法可靠聚焦目标输入框，未输入。');
  // focus can synchronously restore a website's saved draft. Recheck AFTER
  // that event before the edit, and confirm this is still the live composer.
  const focused=[...document.querySelectorAll('#prompt-textarea,textarea[data-testid="prompt-textarea"]')].filter(n=>!hidden(n));
  const currentUsers=[...document.querySelectorAll('[data-message-author-role="user"]')].filter(n=>!hidden(n)&&!n.parentElement?.closest('[data-message-author-role]'));
  if(focused.length!==1||focused[0]!==editor||editor.isConnected===false||editor.closest('form')!==form||
    (currentUsers.length?(local.userTexts.get(currentUsers.at(-1))===(currentUsers.at(-1).textContent||'')?local.turns.get(currentUsers.at(-1)):null):'no-user')!==expectedTurnKey||location.href!==expectedUrl)
    return error('E_CHAT_TARGET','聚焦期间页面或输入框发生变化，未输入。');
  if((textarea?editor.value:editor.textContent)||[...form.querySelectorAll('input[type="file"]')].some(i=>i.files?.length)||
    form.querySelector('[data-testid="file-thumbnail"],[data-testid*="attachment-preview"],[data-testid*="file-preview"],[data-file-id],[data-upload-id],button[aria-label="Remove file"],button[aria-label="移除文件"]')||editor.querySelector('img,[contenteditable="false"]'))
    return error('E_CHAT_DRAFT','聚焦时网页恢复了草稿或附件，未覆盖。');
  if(!textarea){
    const selection=document.getSelection?.();
    if(!selection||selection.rangeCount!==1||
      !(selection.anchorNode===editor||editor.contains(selection.anchorNode))||
      !(selection.focusNode===editor||editor.contains(selection.focusNode)))
      return error('E_CHAT_COMPOSER','无法确认光标位于目标输入框内，未输入。');
  }
  local.fills.set(operationId,'unknown');
  let accepted=false;
  try{accepted=document.execCommand('insertText',false,text);}catch{}
  const liveEditors=[...document.querySelectorAll('#prompt-textarea,textarea[data-testid="prompt-textarea"]')].filter(n=>!hidden(n));
  if(liveEditors.length!==1||liveEditors[0]!==editor||editor.isConnected===false)
    return error('E_CHAT_FILL_UNKNOWN','编辑时输入框被替换，不能核对结果；请检查网页。','OUTCOME_UNKNOWN');
  const content=textarea?editor.value:editor.innerText;
  const exact=content===text||(!textarea&&editor.textContent===text)||content===text+'\n';
  if(location.href!==expectedUrl)return error('E_CHAT_TARGET','回填期间对话切换，结果未知，请检查网页。','OUTCOME_UNKNOWN');
  if(!exact){
    if(!accepted&&!(textarea?editor.value:editor.textContent)){local.fills.delete(operationId);return error('E_CHAT_COMPOSER','输入框未接受编辑命令，结果已保留。');}
    return error('E_CHAT_FILL_UNKNOWN','输入框内容未通过读回核对，请手动检查；不会重复插入。','OUTCOME_UNKNOWN');
  }
  local.fills.set(operationId,'filled');
  return {ok:true,url:location.href,turnKey,filled:true,sent:false,interaction:'browser-insertText',readBackVerified:true};
}

// A separate read-only round trip checks the live website editor after the
// insertion task has returned. A framework rollback cannot become "filled".
export function verifyChatGPTComposerOnPage({expectedUrl,text,operationId,expectedTurnKey}){
  const error=()=>({ok:false,error:{code:'E_CHAT_FILL_UNKNOWN',message:'网页输入框未保持已回填内容，请检查原对话；不会自动重试。',outcome:'OUTCOME_UNKNOWN'}});
  if(location.href!==expectedUrl)return error();
  const hidden=node=>{
    if(node.closest('[hidden],[aria-hidden="true"]'))return true;
    for(let p=node;p;p=p.parentElement){const style=globalThis.getComputedStyle?.(p);
      if(style?.display==='none'||style?.visibility==='hidden'||style?.visibility==='collapse')return true;}
    return false;
  };
  const local=globalThis.__opendeskWorkspaceChatV1;
  const users=[...document.querySelectorAll('[data-message-author-role="user"]')].filter(n=>!hidden(n)&&!n.parentElement?.closest('[data-message-author-role]'));
  if(local?.fills.get(operationId)!=='filled'||(users.length?(local.userTexts?.get(users.at(-1))===(users.at(-1).textContent||'')?local.turns.get(users.at(-1)):null):'no-user')!==expectedTurnKey)return error();
  const editors=[...document.querySelectorAll('#prompt-textarea,textarea[data-testid="prompt-textarea"]')].filter(n=>!hidden(n));
  if(editors.length!==1||editors[0].isConnected===false)return error();
  const editor=editors[0],value=editor.tagName==='TEXTAREA'?editor.value:editor.innerText;
  if(value!==text&&value!==text+'\n'&&!(editor.tagName!=='TEXTAREA'&&editor.textContent===text))return error();
  return {ok:true,url:location.href,filled:true,sent:false,readBackVerified:true};
}

export async function assertChatGPTTarget(api,target){
  if(!target||!Number.isInteger(target.tabId)||typeof target.documentId!=='string'||!chatGPTConversationId(target.url))
    throw {code:'E_CHAT_TARGET',message:'请先绑定一个已有的官方 ChatGPT 对话。',outcome:'NOT_DISPATCHED'};
  const frame=await api.webNavigation.getFrame({tabId:target.tabId,frameId:0});
  if(frame?.documentId!==target.documentId||frame.url!==target.url)
    throw {code:'E_CHAT_TARGET',message:'对话已导航或切换，请重新选择并绑定。',outcome:'NOT_DISPATCHED'};
}

export async function readChatGPTEdit(api,target,requestId,{identityOnly=false,...options}={}){
  await assertChatGPTTarget(api,target);
  const rows=await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},
    world:'ISOLATED',func:inspectChatGPTEditsOnPage,args:[{expectedUrl:target.url,requestId,identityOnly,...options}]});
  if(rows?.length!==1||rows[0].documentId!==target.documentId||rows[0].frameId!==0)
    throw {code:'E_CHAT_TARGET',message:'无法核对回答的页面身份，未导入内容。'};
  const result=rows[0].result;
  if(!result?.ok)throw result?.error||{code:'E_CHAT_FORMAT',message:'网页未返回可核对的回答。'};
  if(result.url!==target.url)throw {code:'E_CHAT_TARGET',message:'读取期间对话发生变化，请重新绑定。'};
  await assertChatGPTTarget(api,target);
  if(!identityOnly&&(!Array.isArray(result.blocks)||result.blocks.length!==1||typeof result.blocks[0]!=='string'))
    throw {code:'E_CHAT_FORMAT',message:'回答格式不完整，未处理。'};
  return result;
}

export async function fillChatGPTComposer(api,target,text,{operationId,turnKey}={}){
  await assertChatGPTTarget(api,target);
  let rows;
  try{rows=await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'ISOLATED',
    func:fillChatGPTComposerOnPage,args:[{expectedUrl:target.url,text,operationId,expectedTurnKey:turnKey}]});}
  catch{throw {code:'E_CHAT_FILL_UNKNOWN',message:'未收到回填结果，请先检查网页输入框。',outcome:'OUTCOME_UNKNOWN'};}
  const result=rows?.[0]?.result;
  if(rows?.length!==1||rows[0].documentId!==target.documentId||rows[0].frameId!==0||!result)
    throw {code:'E_CHAT_FILL_UNKNOWN',message:'回填响应无法核对，请检查原输入框。',outcome:'OUTCOME_UNKNOWN'};
  if(!result.ok)throw result.error;
  try{await assertChatGPTTarget(api,target);}catch{throw {code:'E_CHAT_TARGET',message:'回填后页面身份变化，请检查原对话；不会重试。',outcome:'OUTCOME_UNKNOWN'};}
  if(result.url!==target.url||result.filled!==true||result.sent!==false||result.readBackVerified!==true)
    throw {code:'E_CHAT_FILL_UNKNOWN',message:'未收到已验证的回填结果。',outcome:'OUTCOME_UNKNOWN'};
  let verification;
  try{verification=await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'ISOLATED',
    func:verifyChatGPTComposerOnPage,args:[{expectedUrl:target.url,text,operationId,expectedTurnKey:turnKey}]});}
  catch{throw {code:'E_CHAT_FILL_UNKNOWN',message:'未能独立核对网页输入框，请先检查原对话。',outcome:'OUTCOME_UNKNOWN'};}
  if(verification?.length!==1||verification[0].documentId!==target.documentId||verification[0].frameId!==0||
    verification[0].result?.ok!==true||verification[0].result?.url!==target.url)
    throw verification?.[0]?.result?.error||{code:'E_CHAT_FILL_UNKNOWN',message:'输入框独立读回不匹配。',outcome:'OUTCOME_UNKNOWN'};
  try{await assertChatGPTTarget(api,target);}catch{throw {code:'E_CHAT_TARGET',message:'最终回填核对期间页面已变化，请检查原对话。',outcome:'OUTCOME_UNKNOWN'};}
  return result;
}
