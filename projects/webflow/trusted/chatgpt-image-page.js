// Fixed first-party ISOLATED observer. Only the explicitly selected generated
// asset is read; return metadata, never image bytes or page/Native capabilities.
export async function inspectChatGPTImagesOnPage({expectedUrl,selection}){
  if(location.href!==expectedUrl||location.origin!=='https://chatgpt.com')return {ok:false};
  const visible=node=>{
    if(node.closest('[hidden],[aria-hidden="true"]'))return false;
    for(let current=node;current;current=current.parentElement){const style=getComputedStyle(current);
      if(style.display==='none'||['hidden','collapse'].includes(style.visibility))return false;}
    return true;
  };
  const generating=()=>[...document.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"]')].some(visible);
  if(generating())
    return {ok:true,assets:[]};
  const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const messages='[data-message-author-role="assistant"],[data-content-search-unit-key$=":assistant"],[data-chatgpt-search-message-ids]';
  const boundary='[data-message-author-role],[data-chatgpt-search-unit-key],[data-content-search-unit-key],[data-chatgpt-search-message-ids]';
  const assistant=message=>{
    if(message.getAttribute('data-chatgpt-search-unit-key')?.endsWith(':user'))return false;
    const role=message.getAttribute('data-message-author-role');
    if(role)return role==='assistant';
    if(message.getAttribute('data-content-search-unit-key')?.endsWith(':assistant'))return true;
    if(!new RegExp('^'+uuid+'$').test(message.getAttribute('data-chatgpt-search-message-ids')||''))return false;
    const attrs=['data-message-author-role','data-chatgpt-search-unit-key','data-content-search-unit-key'];
    if(attrs.some(attr=>message.getAttribute(attr)!==null))return false;
    // The complete turn contains both roles. Only the immediate message
    // parent, with exactly one visible role heading, proves this wrapper.
    const parent=message.parentElement;
    if(!parent||attrs.some(attr=>parent.getAttribute(attr)!==null)||
      [...parent.querySelectorAll('[data-chatgpt-search-message-ids]')].filter(part=>part.parentElement===parent).length!==1)return false;
    const roles=[...parent.querySelectorAll('[data-conversation-role]')];
    return roles.length===1&&visible(roles[0])&&roles[0].getAttribute('data-conversation-role')==='assistant'&&!message.contains(roles[0]);
  };
  const complete=message=>{
    if(message.isConnected===false||!assistant(message)||!visible(message)||message.parentElement?.closest(boundary)||
      message.closest('blockquote,[data-opendesk-file-data],[aria-busy="true"],[data-is-streaming="true"]'))return false;
    const turn=message.closest('[data-talvt-turn-state]');
    const actions=message.querySelector('[data-testid="copy-turn-action-button"],[data-assistant-message-actions]');
    return turn?.getAttribute('data-talvt-turn-state')==='complete'||!!actions&&visible(actions);
  };
  const generated=(img,message)=>img.isConnected!==false&&visible(img)&&img.complete&&
    img.closest(boundary)===message&&!img.closest('blockquote,[data-opendesk-file-data]')&&
    Number.isSafeInteger(img.naturalWidth)&&img.naturalWidth>0&&Number.isSafeInteger(img.naturalHeight)&&img.naturalHeight>0&&
    img.naturalWidth*img.naturalHeight<=16*1024*1024&&
    !!img.closest('[data-testid="generated-image-preview"]')&&!!img.closest('[data-testid="generated-image-gallery"]');
  const assets=[];
  const candidates=[];
  for(const message of document.querySelectorAll(messages)){
    if(!complete(message))continue;
    const messageId=message.getAttribute('data-message-id')||message.getAttribute('data-content-search-unit-key')||message.getAttribute('data-chatgpt-search-message-ids');
    if(!messageId)continue;
    for(const img of message.querySelectorAll('img')){
      if(!generated(img,message))continue;
      let url;try{url=new URL(img.currentSrc||img.src);}catch{continue;}
      // Current official gallery's blob bytes were independently compared
      // with its official full-image download. No arbitrary page blob/CDN,
      // screenshot, attachment or guessed endpoint is admitted.
      const blob=url.href.match(new RegExp('^blob:https://chatgpt\\.com/('+uuid+')$'));
      const fileId=url.searchParams.get('id');
      if(!blob&&(url.origin!=='https://chatgpt.com'||url.pathname!=='/backend-api/estuary/content'||
        url.searchParams.get('p')!=='fs'||!/^file[-_][A-Za-z0-9_-]+$/.test(fileId||'')||url.username||url.password))continue;
      const asset={messageId,assetId:blob?'blob-'+blob[1]:fileId,width:img.naturalWidth,height:img.naturalHeight,url:url.href};
      assets.push(asset);candidates.push({asset,message,img});
      if(assets.length>32)return {ok:false};
    }
  }
  if(selection){
    const matches=candidates.filter(({asset})=>asset.messageId===selection.messageId&&asset.assetId===selection.assetId);
    if(matches.length!==1)return {ok:false};
    const {asset,message,img}=matches[0],abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
    let reader;
    try{
      const response=await fetch(asset.url,{credentials:'same-origin',redirect:'error',signal:abort.signal});
      const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),limit=8*1024*1024;
      if(!response.ok||!['image/png','image/jpeg'].includes(mime)||!response.body)throw Error('image body');
      const length=response.headers.get('content-length');
      if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw Error('image limit');
      reader=response.body.getReader();const chunks=[];let bytes=0;
      while(true){const {done,value}=await reader.read();if(done)break;
        bytes+=value.byteLength;if(bytes>limit)throw Error('image limit');chunks.push(value);}
      if(!bytes||length&&Number(length)!==bytes)throw Error('image length');
      const buffer=new Uint8Array(bytes);let offset=0;
      for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
      const digest=await crypto.subtle.digest('SHA-256',buffer);
      if(abort.signal.aborted||location.href!==expectedUrl||generating()||!complete(message)||!generated(img,message)||
        (img.currentSrc||img.src)!==asset.url||img.naturalWidth!==asset.width||img.naturalHeight!==asset.height)throw Error('image changed');
      return {ok:true,assets:[{...asset,mime,bytes,sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}]};
    }catch{return {ok:false};}
    finally{clearTimeout(timer);if(reader)await reader.cancel().catch(()=>{});}
  }
  return {ok:true,assets};
}
