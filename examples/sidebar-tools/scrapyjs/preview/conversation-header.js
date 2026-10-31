// Offline outer shell adapter. No authority or privileged Host objects.
export function installPreviewConversationHeader(frame,button){
  if(!frame||!button)throw Error('E_PREVIEW_CONVERSATION_HEADER_MISSING');
  let open=false;
  button.hidden=true;
  button.setAttribute('aria-controls',frame.parentElement.id||frame.id);
  const action=()=>frame.contentWindow.postMessage({type:'scrapyjs-preview-conversation-action',action:'toggle'},'*');
  button.addEventListener('click',action);
  const reset=()=>{open=false;button.hidden=true;button.setAttribute('aria-expanded','false');button.setAttribute('aria-pressed','false');};
  frame.addEventListener('load',()=>{
    reset();
    frame.contentWindow.postMessage({type:'scrapyjs-preview-conversation-sync'},'*');
  });
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!=='null')return;
    const data=event.data;
    if(data?.type!=='scrapyjs-preview-conversation-state'||typeof data.visible!=='boolean'||typeof data.open!=='boolean')return;
    const closing=open&&!data.open;
    open=data.open;
    button.hidden=!data.visible;
    button.setAttribute('aria-expanded',String(open));
    button.setAttribute('aria-pressed',String(open));
    if(closing&&data.visible&&(document.activeElement===frame||document.activeElement===button))button.focus({preventScroll:true});
  });
}
