export function isChatGPTURL(value){
  try{const url=new URL(value);return !url.username&&!url.password&&
    ['https://chatgpt.com','https://chat.openai.com'].includes(url.origin);}catch{return false;}
}

// Self-contained because Chrome serializes this function into an ISOLATED
// world. This reads text on an explicit click; it exposes no listener, file
// method, credential, model API or automatic message-send action to the page.
export function inspectChatGPTEditsOnPage({expectedUrl,requestId,identityOnly=false}){
  const error=(code,message)=>({ok:false,error:{code,message,outcome:'NOT_DISPATCHED'}});
  const url=location.href;
  if(url!==expectedUrl||!['https://chatgpt.com','https://chat.openai.com'].includes(location.origin))
    return error('E_CHAT_TARGET','对话页面已经切换，请重新生成文件上下文。');
  if(identityOnly)return {ok:true,url};
  const hidden=node=>{
    if(node.closest('[hidden],[aria-hidden="true"]'))return true;
    for(let part=node;part;part=part.parentElement){const style=globalThis.getComputedStyle?.(part);
      if(style?.display==='none'||style?.visibility==='hidden'||style?.visibility==='collapse')return true;}
    return false;
  };
  const stop=[...document.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"]')].some(node=>!hidden(node));
  if(stop)return error('E_CHAT_STREAMING','ChatGPT 仍在生成，请等回答结束再读取。');
  const messages=[...document.querySelectorAll('[data-message-author-role="user"],[data-message-author-role="assistant"]')]
    .filter(node=>!hidden(node)&&!node.parentElement?.closest('[data-message-author-role]'));
  let lastUser=-1;
  for(let index=0;index<messages.length;index++)if(messages[index].getAttribute('data-message-author-role')==='user')lastUser=index;
  if(lastUser<0)return error('E_CHAT_FORMAT','无法确认当前回答的边界，请手动粘贴提案代码块。');
  if(lastUser===messages.length-1)return error('E_CHAT_PENDING','最新问题尚未出现回答，没有读取上一轮内容。');
  const answer=messages.slice(lastUser+1);
  if(answer.some(node=>node.matches('[data-is-streaming="true"],.result-streaming')||node.closest('[data-is-streaming="true"],.result-streaming')||node.querySelector('[data-is-streaming="true"],.result-streaming')))
    return error('E_CHAT_STREAMING','当前回答尚未完成，请稍后再读取。');
  const blocks=[];let count=0,total=0;
  for(const node of answer){
    // Aggregate all assistant fragments after the latest user message. Do not
    // inspect user code, tool outputs, earlier answers or the input composer.
    for(const code of node.querySelectorAll('pre code')){
      if(hidden(code)||code.closest('[data-message-author-role]')!==node)continue;
      if(++count>128)return error('E_CHAT_LIMIT','当前回答代码块过多，请手动选择提案。');
      const text=code.textContent||'';total+=text.length;
      if(total>400*1024)return error('E_CHAT_LIMIT','当前回答过长，请手动选择提案。');
      if(!text.includes('opendesk.workspace.edit.v1')||!text.includes(requestId))continue;
      blocks.push(text);
      if(blocks.length>1)return error('E_EDIT_AMBIGUOUS','当前回答包含多个相关提案，请明确粘贴其中一个。');
    }
  }
  if(blocks.length!==1)return error('E_CHAT_FORMAT','最新回答中没有本次文件提案。请检查是否粘贴了上下文，或手动导入代码块。');
  return {ok:true,url,blocks,assistantFragments:answer.length};
}

export async function assertChatGPTTarget(api,target){
  if(!target||!Number.isInteger(target.tabId)||typeof target.documentId!=='string'||!isChatGPTURL(target.url))
    throw {code:'E_CHAT_TARGET',message:'请先选择官方 ChatGPT 网页，并生成文件上下文。'};
  const frame=await api.webNavigation.getFrame({tabId:target.tabId,frameId:0});
  if(frame?.documentId!==target.documentId||frame.url!==target.url)
    throw {code:'E_CHAT_TARGET',message:'对话已导航或切换，请重新选择并生成上下文。'};
}

export async function readChatGPTEdit(api,target,requestId,{identityOnly=false}={}){
  await assertChatGPTTarget(api,target);
  const rows=await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},
    world:'ISOLATED',func:inspectChatGPTEditsOnPage,args:[{expectedUrl:target.url,requestId,identityOnly}]});
  if(rows?.length!==1||rows[0].documentId!==target.documentId||rows[0].frameId!==0)
    throw {code:'E_CHAT_TARGET',message:'无法核对回答的页面身份，未导入内容。'};
  const result=rows[0].result;
  if(!result?.ok)throw result?.error||{code:'E_CHAT_FORMAT',message:'网页未返回可核对的回答。'};
  if(result.url!==target.url)throw {code:'E_CHAT_TARGET',message:'读取期间对话发生变化，请重新生成上下文。'};
  await assertChatGPTTarget(api,target);
  if(!identityOnly&&(!Array.isArray(result.blocks)||result.blocks.length!==1||typeof result.blocks[0]!=='string'))
    throw {code:'E_CHAT_FORMAT',message:'回答格式不完整，请手动选择提案。'};
  return result;
}
