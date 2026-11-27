const path=d=>['path',{d}];
const ICON={send:[path('M12 19V5m-6 6 6-6 6 6')],
  now:[path('M12 19V5m-6 6 6-6 6 6M4 20h16')],
  pause:[6,14].map(x=>['rect',{x,y:4,width:4,height:16,rx:1}]),
  resume:[path('M8 5v14l11-7Z')],
  edit:[path('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8.2 17.8l-4.2 1.2 1.2-4.2Z')],
  copy:[['rect',{x:8,y:8,width:12,height:12,rx:2}],path('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2')],
  info:[['circle',{cx:12,cy:12,r:9}],path('M12 11v5m0-8h.01')],
  status:[['circle',{cx:12,cy:12,r:9}],path('M12 7v6m0 4h.01')],
  remove:[path('M18 6 6 18M6 6l12 12')]};
const labelElement=(node,text)=>node.setAttribute('aria-label',text);
const role=(node,name)=>node.setAttribute('role',name);
const bounds=node=>node.getBoundingClientRect();
const important=(node,key,value)=>node.style.setProperty(key,value,'important');
function element(doc,tag,cls,text){
  const node=doc.createElement(tag);if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;return node;
}
function svg(doc,shapes){
  const ns='http://www.w3.org/2000/svg',node=doc.createElementNS(ns,'svg');
  node.setAttribute('viewBox','0 0 24 24');node.setAttribute('aria-hidden','true');
  // Some site documents enforce Trusted Types on HTML setters.
  for(const [tag,attributes] of shapes){
    const shape=doc.createElementNS(ns,tag);
    for(const [name,value] of Object.entries(attributes))shape.setAttribute(name,String(value));
    node.append(shape);
  }
  return node;
}
function action(doc,what,label,id){
  const b=element(doc,'button','sq-action');b.type='button';b.dataset.action=what;
  if(id)b.dataset.id=id;labelElement(b,label);b.title=label;
  b.append(svg(doc,ICON[what]));return b;
}
function unknownMessage(state){
  return '发送结果未知 · '+(state.reason||'尚未确认消息是否已发送')+'；不会自动重试，请核对原对话';
}
function inline(host,width){
  const props={position:'relative',display:'block',top:'auto',right:'auto',
    bottom:'auto',left:'auto',width:typeof width==='number'?width+'px':width,'max-width':'none',
    'min-width':'0',padding:'0',transform:'none','z-index':'1'};
  for(const [p,v] of Object.entries(props))
    important(host,p,v);
}
function visibleRect(node,win){
  if(!node?.isConnected)return null;
  const style=win.getComputedStyle(node),rect=bounds(node);
  if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||
    Number(style.opacity)===0||![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||
    rect.width<=0||rect.height<=0)return null;
  return rect;
}
const clipsOverflow=value=>/^(auto|scroll|hidden|clip)$/.test(value);
function editorViewport(editor,form,win){
  const rect=visibleRect(editor,win);if(!rect)return null;
  let {left,right,top,bottom}=rect;
  // Measure the editable area visible through the native scrollport.
  for(let node=editor.parentElement;node;node=node.parentElement){
    const style=win.getComputedStyle(node);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||
      Number(style.opacity)===0)return null;
    if(style.display!=='contents'){
      const clipX=clipsOverflow(style.overflowX);
      const clipY=clipsOverflow(style.overflowY);
      if(clipX||clipY){
        const box=bounds(node);
        const x=box.left+(node.clientLeft||0),y=box.top+(node.clientTop||0);
        if(clipX){left=Math.max(left,x);right=Math.min(right,x+(node.clientWidth??box.width));}
        if(clipY){top=Math.max(top,y);bottom=Math.min(bottom,y+(node.clientHeight??box.height));}
      }
    }
    if(node===form)break;
  }
  return right>left&&bottom>top?{left,right,top,bottom,width:right-left,height:bottom-top}:null;
}
function fitCrown(button,arrow,crown,toolbar,win){
  let clipTop=-Infinity;
  for(let node=toolbar;node;node=node.parentElement){
    if(clipsOverflow(win.getComputedStyle(node).overflowY)){
      clipTop=Math.max(clipTop,bounds(node).top+(node.clientTop||0));
    }
    if(node===toolbar.ownerDocument.body)break;
  }
  if(Number.isFinite(clipTop)){
    const top=clipTop+1;
    button.style.setProperty('--sq-crown-min-top',top-bounds(button).top+'px');
    crown.style.setProperty('--sq-crown-max-height',Math.max(0,bounds(arrow).top-top-1)+'px');
  }else{
    button.style.removeProperty('--sq-crown-min-top');
    crown.style.removeProperty('--sq-crown-max-height');
  }
}
function topSpan(rect,style,requireRounded=false){
  const length=(value,extent)=>value.endsWith('%')?parseFloat(value)*extent/100:parseFloat(value)||0;
  const [tl,tr,br,bl]=['TopLeft','TopRight','BottomRight','BottomLeft'].map(corner=>{
    const parts=style['border'+corner+'Radius'].trim().split(/\s+/);
    return [length(parts[0],rect.width),length(parts[1]||parts[0],rect.height)];
  });
  if(requireRounded&&(!tl.every(n=>n>0)||!tr.every(n=>n>0)))return null;
  const scale=Math.min(1,rect.width/(tl[0]+tr[0]||1),rect.width/(bl[0]+br[0]||1),
    rect.height/(tl[1]+bl[1]||1),rect.height/(tr[1]+br[1]||1));
  const left=tl[0]*scale,right=tr[0]*scale,width=rect.width-left-right;
  return width>0?{rect,left:rect.left+left,width,
    radius:`${left}px ${right}px 0 0 / ${tl[1]*scale}px ${tr[1]*scale}px 0 0`}:null;
}
function geminiSurface(form,win){
  const rect=visibleRect(form,win);
  return rect&&topSpan(rect,win.getComputedStyle(form));
}
function composerSurface(editor,nativeButton,form,win){
  const input=editorViewport(editor,form,win),button=visibleRect(nativeButton,win);
  if(!input||!button||!form.contains(editor))return null;
  const encloses=(outer,inner)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&
    inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
  for(let node=editor.parentElement;node;node=node.parentElement){
    const rect=visibleRect(node,win),style=win.getComputedStyle(node);
    if(!rect){
      if(style.display==='contents'&&node!==form)continue;
      return null;
    }
    if(node.contains(nativeButton)&&encloses(rect,input)&&encloses(rect,button)){
      const painted=(style.backgroundColor!=='transparent'&&
        !/^(?:rgba\([^)]*,\s*0\)|rgb\([^)]*\/\s*0\))$/.test(style.backgroundColor))||
        style.backgroundImage!=='none'||style.boxShadow!=='none'||
        ['Top','Right','Bottom','Left'].some(side=>parseFloat(style['border'+side+'Width'])>0&&
          !['none','hidden'].includes(style['border'+side+'Style']));
      const span=painted&&topSpan(rect,style,true);
      if(span)return {node,...span};
    }
    if(node===form)break;
  }
  return null;
}
export function createQueueView({owner,createPageUI,assets,engine,actions,getBackup=()=>'',onRecoveryChange=()=>{},
  trustedActions=false,currentRoute=null,getNoticeRoute=()=>null}){
  const doc=owner.content.ownerDocument,css=owner.getAsset('assets/queue.css');
  // Keep one copy of the image in the package.
  const crownImage=owner.getAsset('assets/crown-premium.webp');
  const imageRef='var(--sq-crown-image)';
  const packagedImageRef=`url("${crownImage}")`;
  if(typeof crownImage!=='string'||!/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(crownImage)||
    typeof css!=='string'||!css.includes(imageRef))
    throw new Error('Packaged Send Queue crown image is missing or invalid');
  const buttonCss=css.replace(imageRef,packagedImageRef);
  let list=null,button=null,root=null,blue=null,arrow=null,crown=null,toastNode=null,statusNode=null,toastToken=0;
  let feedback=null,feedbackPanel=null,errorNotice=null,recoveryEditor=null;
  let awaitingConversation=false;
  let lastSignature='',recovery=null,cacheWarning='';
  let info=null,notice=null;
  let expandedScrollTop=0;
  const nativeStyles=new Map();
  let geminiLayout=false;
  async function writeClipboard(text){
    const clipboard=doc.defaultView.navigator?.clipboard;
    if(!clipboard?.writeText)throw Error('clipboard unavailable');
    await clipboard.writeText(text);
  }
  function reset(){
    for(const prop of ['margin-left','margin-bottom'])list?.host.style.removeProperty(prop);
    root?.style.removeProperty('--sq-surface-radius');
  }
  function ensure(){
    if(list && !list.active()){closeInfo();list.destroy();list=null;info=null;lastSignature='';}
    if(button && !button.active()){closeInfo();button.destroy();button=null;}
    if(!list?.active()){
      list=createPageUI({id:'opendesk.chatgpt-send-queue.list',assets,baseStyles:false});
      list.addStyle(css);root=element(doc,'section','sq-panel');lastSignature='';
      labelElement(root,'发送队列');list.content.append(root);
      important(list.host,'display','none');
      list.on(root,'click',e=>{
        if(trustedActions&&e.isTrusted!==true)return;
        const b=e.target.closest?.('button[data-action]');if(!b)return;
        switch(b.dataset.action){
          case 'now':actions.sendNow(b.dataset.id);break;
          case 'pause':actions.pause(b.dataset.id);break;
          case 'resume':actions.resume(b.dataset.id);break;
          case 'edit':{
            const state=engine.view();
            if(state.inFlight?.id===b.dataset.id&&state.inFlight.phase==='unknown'&&actions.saveRecoveryEdit&&
              !engine.canReclaimPrepared(b.dataset.id))
              openRecoveryEditor(state,b);
            else actions.edit(b.dataset.id);
            break;
          }
          case 'remove':actions.remove(b.dataset.id);break;
          case 'info':if(b===info&&infoAvailable())notice?closeInfo(true):showInfo();break;
          case 'more':engine.toggleExpanded();break;
          case 'preview':{
            const preview=b.closest('[data-id-row]')?.querySelector('.sq-preview');
            if(!preview)break;
            preview.hidden=!preview.hidden;
            b.setAttribute('aria-expanded',String(!preview.hidden));
            break;
          }
          case 'status':{
            const state=engine.view();
            if(state.items.some(item=>item.id===b.dataset.id&&item.state==='unknown')||
              (state.inFlight?.id===b.dataset.id&&state.inFlight.phase==='unknown'))
              showError(unknownMessage(state),b);
            break;
          }
        }
        e.stopPropagation();
      });
      list.on(root,'keydown',e=>{
        if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
        const row=e.target.closest?.('[data-id-row]');if(!row)return;
        const index=engine.view().items.findIndex(x=>x.id===row.dataset.idRow);
        if(index<0)return;e.preventDefault();
        engine.move(row.dataset.idRow,index+(e.key==='ArrowUp'?-1:1));
      });
      list.on(root,'dragstart',e=>{
        const row=e.target.closest?.('[data-id-row]');if(!row||!e.dataTransfer)return;
        e.dataTransfer.setData('text/plain',row.dataset.idRow);
        e.dataTransfer.effectAllowed='move';
      });
      list.on(root,'dragover',e=>{if(e.target.closest?.('[data-id-row]'))e.preventDefault();});
      list.on(root,'drop',e=>{
        const row=e.target.closest?.('[data-id-row]');if(!row)return;
        e.preventDefault();
        const id=e.dataTransfer?.getData('text/plain'),idx=engine.view().items.findIndex(x=>x.id===row.dataset.idRow);
        if(id&&idx>=0)engine.move(id,idx);
      });
    }
    if(!button?.active()){
      button=createPageUI({id:'opendesk.chatgpt-send-queue.button',assets,baseStyles:false});
      button.addStyle(buttonCss);
      blue=element(doc,'button','sq-send');
      blue.type='button';labelElement(blue,'加入队列或发送待发消息');
      blue.setAttribute('aria-keyshortcuts','Control+Enter');
      blue.title='空队列且网站就绪时直接发送，否则加入发送队列 · Ctrl + Enter 可直接入队；空输入框时继续发送队列；Shift 点击可暂停入队';
      crown=element(doc,'span','sq-crown');
      crown.setAttribute('aria-hidden','true');
      arrow=svg(doc,ICON.send);
      blue.append(arrow,crown);
      button.content.append(blue);
      toastNode=element(doc,'div','sq-toast');
      statusNode=element(doc,'div','sq-toast-card');statusNode.hidden=true;
      role(statusNode,'status');toastNode.append(statusNode);
      button.content.append(toastNode);
      important(button.host,'display','none');
      button.on(blue,'click',event=>{
        if(!trustedActions||event.isTrusted===true){
          if(event.shiftKey)actions.enqueue({paused:true});
          else actions.enqueue({sendQueuedIfEmpty:true});
        }
      });
      button.on(toastNode,'click',async event=>{
        if(trustedActions&&event.isTrusted!==true)return;
        const b=event.target.closest?.('button[data-action]');if(!b||b.disabled||b.hidden)return;
        event.stopPropagation();
        if(notice?.node.contains(b)&&infoAvailable()){
          if(b.dataset.action==='remove'){closeInfo(true);return;}
          if(b===notice.draft?.done){
            recovery=null;closeInfo(true);syncInfo();onRecoveryChange();
            if(info.hidden)blue.focus?.({preventScroll:true});
            toast('已核对。清空输入框、回复结束后继续发送');return;
          }
          await copyInfo(b);return;
        }
      });
      button.on(toastNode,'keydown',event=>{
        if(event.key==='Escape'&&notice?.node.contains(event.target)){
          event.preventDefault();event.stopPropagation();closeInfo(true);
        }
      });
    }
  }
  const feedbackRoute=()=>currentRoute?currentRoute()?.route??null:engine.view().route;
  function ensureFeedback(){
    if(feedback?.active())return;
    errorNotice=null;recoveryEditor=null;
    feedback=createPageUI({id:'opendesk.chatgpt-send-queue.feedback',assets,baseStyles:false});
    feedback.addStyle(css);
    feedbackPanel=element(doc,'div','sq-feedback');feedback.content.append(feedbackPanel);
    feedback.on(feedbackPanel,'click',async event=>{
      if(trustedActions&&event.isTrusted!==true)return;
      const b=event.target.closest?.('button[data-action]');if(!b||b.disabled)return;
      event.stopPropagation();syncFeedbackRoute();
      if(b===errorNotice?.copy)await copyError(errorNotice);
      else if(b===errorNotice?.close)clearError(undefined,true);
      else if(b===recoveryEditor?.cancel)closeRecoveryEditor(true);
      else if(b===recoveryEditor?.save)await saveRecoveryEditor(recoveryEditor);
    });
    feedback.on(feedbackPanel,'keydown',event=>{
      if(event.key!=='Escape'||event.isComposing||recoveryEditor?.save.disabled)return;
      event.preventDefault();event.stopPropagation();
      if(recoveryEditor)closeRecoveryEditor(true);
      else clearError(undefined,true);
    });
  }
  function syncFeedbackRoute(){
    const route=feedbackRoute();
    if(errorNotice&&errorNotice.route!==route)clearError();
    if(recoveryEditor&&recoveryEditor.route!==route)closeRecoveryEditor();
  }
  function showError(message,trigger){
    ensureFeedback();
    if(errorNotice?.message===message&&errorNotice.route===feedbackRoute()){
      if(trigger)errorNotice.copy.focus?.({preventScroll:true});
      return;
    }
    clearError();
    const node=element(doc,'section','sq-toast-card');
    const copy=action(doc,'copy','复制错误信息'),close=action(doc,'remove','关闭错误提示');
    copy.className='sq-action sq-error-copy';close.className='sq-action sq-error-copy';
    const receipt=element(doc,'div','sq-error-receipt');role(receipt,'status');
    const row=element(doc,'div','sq-error-row');
    const reason=element(doc,'span','sq-error-text',message);role(reason,'status');
    row.append(reason,copy,close);node.append(row,receipt);
    feedbackPanel.insertBefore(node,feedbackPanel.firstElementChild??null);
    errorNotice={message,node,copy,close,receipt,route:feedbackRoute(),trigger};
    if(trigger)copy.focus?.({preventScroll:true});
  }
  async function copyError(error){
    const {copy,message,node,receipt}=error;copy.disabled=true;
    let copied=false;
    try{await writeClipboard(message);copied=true;}catch{}finally{copy.disabled=false;}
    if(error!==errorNotice||error.route!==feedbackRoute()||!feedback?.active())return;
    if(copied){
      error.manual?.remove();error.manual=null;receipt.textContent='已复制错误信息';
    }else{
      if(!error.manual){
        error.manual=element(doc,'textarea','sq-notice-backup');error.manual.readOnly=true;
        labelElement(error.manual,'完整错误信息，请手动复制');node.append(error.manual);
      }
      error.manual.value=message;error.manual.focus?.();error.manual.select?.();
      receipt.textContent='剪贴板不可用，已选中完整错误信息，请手动复制';
    }
  }
  function openRecoveryEditor(state,trigger){
    const item=state.items.find(row=>row.id===trigger.dataset.id);
    if(!item||maskRows(state))return;
    showError(unknownMessage(state));
    if(recoveryEditor){recoveryEditor.input.focus?.();return;}
    const node=element(doc,'section','sq-toast-card sq-recovery-editor');
    role(node,'dialog');labelElement(node,'编辑失败消息');
    const input=element(doc,'textarea','sq-notice-backup');
    input.value=item.text;input.maxLength=8192;labelElement(input,'暂停草稿正文');
    const save=infoAction('edit-save','保存为暂停草稿'),cancel=infoAction('edit-cancel','取消');
    const receipt=element(doc,'div','sq-error-receipt');role(receipt,'status');
    node.append(element(doc,'strong','','编辑失败消息'),element(doc,'div','',
      '原发送记录会保留。编辑稿保存后保持暂停；请核对原对话，再决定是否发送。'),input,save,cancel,receipt);
    recoveryEditor={node,input,save,cancel,receipt,id:item.id,route:state.route,trigger};
    feedbackPanel.append(node);input.focus?.({preventScroll:true});
  }
  function closeRecoveryEditor(restoreFocus=false){
    const editor=recoveryEditor;if(!editor)return;
    recoveryEditor=null;editor.node.remove();
    if(restoreFocus)restoreQueueFocus(editor.trigger);
  }
  function restoreQueueFocus(trigger){
    const target=trigger?.isConnected?trigger:trigger&&root?.querySelector(
      '[data-id="'+trigger.dataset.id+'"][data-action="'+trigger.dataset.action+'"]');
    (target||blue)?.focus?.({preventScroll:true});
  }
  async function saveRecoveryEditor(editor){
    const {id,route,input,save,cancel,receipt}=editor;
    save.disabled=cancel.disabled=input.readOnly=true;
    let result;
    try{result=await actions.saveRecoveryEdit({id,route,text:input.value});}catch{}
    if(recoveryEditor!==editor||route!==feedbackRoute()||!feedback?.active())return;
    if(result?.ok){
      closeRecoveryEditor(true);toast('已保存为暂停草稿。原发送记录仍待核对。',{variant:'success'});
    }else{
      save.disabled=cancel.disabled=input.readOnly=false;
      receipt.textContent=result?.reason||'未能保存，编辑内容仍保留在这里';
      input.focus?.({preventScroll:true});
    }
  }
  function hasRecovery(){return recovery!==null;}
  function offerRecovery(text,reason){
    if(recovery!==null||typeof text!=='string'||!text)return false;
    ensure();recovery={text,reason,route:getNoticeRoute()};
    onRecoveryChange();refreshInfo();return true;
  }
  function clearError(message,restoreFocus=false){
    if(!errorNotice||(message!==undefined&&message!==errorNotice.message))return;
    const {node,trigger}=errorNotice;errorNotice=null;node.remove();
    if(restoreFocus){if(recoveryEditor)recoveryEditor.input.focus?.();else restoreQueueFocus(trigger);}
  }
  function toast(message,{variant='info',duration=3000,copyable=false}={}){
    if(typeof owner.active==='function'&&!owner.active())return;
    if(copyable&&button?.active()){
      showError(message);return;
    }
    if(typeof owner.toast==='function'){
      try{owner.toast({message,variant,duration,position:'top'});return;}catch{}
    }
    if(!statusNode||errorNotice)return;
    statusNode.textContent=message;statusNode.hidden=false;
    const id=++toastToken;
    owner.setTimeout(()=>{if(id===toastToken&&statusNode)statusNode.hidden=true;},3000);
  }
  function maskRows(state=engine.view()){
    if(!currentRoute)return awaitingConversation;
    const current=currentRoute();
    return !current?.route||!!state.route&&current.route!==state.route;
  }
  function maskNotices(){
    const route=recovery?.route||getNoticeRoute();
    return maskRows()||!!(currentRoute&&route&&currentRoute()?.route!==route);
  }
  function infoAvailable(){
    return !!info&&!info.hidden&&list?.active()&&button?.active()&&
      list.host.style.getPropertyValue('display')!=='none'&&!maskNotices();
  }
  function closeInfo(focus){
    if(!notice)return;
    for(const field of notice.node.querySelectorAll('textarea'))field.value='';
    notice.node.remove();notice=null;
    if(focus)info?.focus?.({preventScroll:true});
  }
  function syncInfo(snapshot){
    if(!list?.active())return;
    const available=!!(recovery||cacheWarning)&&!maskNotices();
    if(available&&!info){
      info=action(doc,'info','队列信息：自动发送已暂停');
      info.className='sq-action sq-info-trigger';info.setAttribute('aria-haspopup','dialog');root.append(info);
    }
    if(!info)return;
    info.hidden=!available;
    if(available)root.dataset.info='';else{delete root.dataset.info;closeInfo();}
    if(notice?.cache){
      let hasBackup=false;
      try{hasBackup=!!getBackup({availabilityOnly:true,snapshot});}catch{}
      notice.cache.copy.hidden=!hasBackup;
    }
  }
  function infoAction(what,label){
    const b=element(doc,'button','sq-notice-action',label);b.type='button';b.dataset.action=what;return b;
  }
  function showInfo(){
    const node=element(doc,'section','sq-toast-card sq-notice');
    role(node,'dialog');labelElement(node,'发送队列：自动发送已暂停');
    const close=action(doc,'remove','关闭通知'),header=element(doc,'div','sq-error-row');
    header.append(element(doc,'strong','','自动发送已暂停'),close);node.append(header);
    const add=(reason,what,label)=>{
      const block=element(doc,'div','sq-notice-section'),copy=infoAction(what,label);
      const receipt=element(doc,'div','');role(receipt,'status');
      block.append(element(doc,'div','',reason),copy,receipt);node.append(block);return {block,copy,receipt};
    };
    const draft=recovery&&add(recovery.reason||'请核对原草稿','draft-copy','复制草稿备份');
    if(draft){draft.done=infoAction('draft-done','已备份并核对');draft.done.hidden=true;draft.block.insertBefore(draft.done,draft.receipt);}
    const cache=cacheWarning&&add(cacheWarning,'backup','复制队列备份');
    notice={node,draft,cache};toastNode.append(node);syncInfo();close.focus?.({preventScroll:true});
  }
  function refreshInfo(){
    const reopen=!!notice;closeInfo();syncInfo();if(reopen&&infoAvailable())showInfo();
  }
  function setCacheWarning(message){
    if(cacheWarning!==message){cacheWarning=message;refreshInfo();}
  }
  async function copyInfo(trigger){
    const current=notice,isDraft=trigger===current.draft?.copy;
    const part=isDraft?current.draft:current.cache;
    if(trigger!==part?.copy)return;
    const {block,receipt,done}=part;
    let text;
    try{text=isDraft?recovery.text:getBackup();}catch{receipt.textContent='备份失败，请重试';return;}
    if(!text){syncInfo();return;}
    trigger.disabled=true;
    let copied=false;
    try{await writeClipboard(text);copied=true;}catch{}finally{trigger.disabled=false;}
    if(current!==notice||!infoAvailable())return;
    let manual=block.querySelectorAll('textarea')[0];
    if(copied){
      manual?.remove();receipt.textContent=isDraft?'已复制，请核对输入框和队列':'已复制队列备份';
    }else{
      if(!manual){manual=element(doc,'textarea','sq-notice-backup');manual.readOnly=true;
        labelElement(manual,'备份原文，请手动复制');block.append(manual);}
      manual.value=text;manual.focus?.();manual.select?.();receipt.textContent='剪贴板不可用，请手动复制';
    }
    if(done)done.hidden=false;
  }
  function replaceRows(rows){
    for(const child of [...root.children])if(child!==info)child.remove();
    root.insertBefore(rows,info);
  }
  function render(snapshot){
    syncFeedbackRoute();
    if(!list?.active()||!button?.active())return;
    if(currentRoute&&!currentRoute()){hide();return;}
    syncInfo(snapshot);
    const state=engine.view(),masked=maskRows(state),items=masked?[]:state.items;
    const previousRows=root.querySelector('.sq-rows');
    if(geminiLayout||root.className==='sq-panel sq-expanded')
      expandedScrollTop=Math.max(0,Number(previousRows?.scrollTop)||0);
    if(!items.length){
      expandedScrollTop=0;
      const signature='empty:'+masked+':'+geminiLayout;
      if(lastSignature===signature)return;
      lastSignature=signature;
      root.className='sq-panel sq-empty';
      labelElement(root,'发送队列，暂无待发送消息');
      const rows=element(doc,'div','sq-rows');
      role(rows,'list');
      const cue=element(doc,'span','sq-empty-mark','···');
      cue.setAttribute('aria-hidden','true');
      rows.append(cue);
      replaceRows(rows);
      return;
    }
    const signature=JSON.stringify([geminiLayout,state.expanded,state.reason,state.phase,!!cacheWarning,!!recovery,
      state.inFlight?.phase,!!state.answerGate,items.map(item=>[item.id,item.text,item.state])]);
    if(signature===lastSignature)return;
    lastSignature=signature;
    const active=list.shadowRoot.activeElement;
    const activeRow=active?.closest?.('[data-id-row]')?.dataset.idRow;
    const activeAction=active?.dataset.action;
    const openPreviews=new Set([...root.querySelectorAll('.sq-preview:not([hidden])')]
      .map(node=>node.closest('[data-id-row]').dataset.idRow));
    root.className='sq-panel'+(state.expanded?' sq-expanded':'');
    labelElement(root,'发送队列');
    const rows=element(doc,'div','sq-rows');role(rows,'list');
    const shown=state.expanded?items:items.slice(0,3);
    for(const [i,item] of shown.entries()){
      const uncertain=item.state==='unknown'||
        (state.inFlight?.id===item.id&&state.inFlight.phase==='unknown');
      const row=element(doc,'div','sq-row'+(uncertain?' sq-unknown':'')+
        (item.state==='paused'?' sq-paused':''));
      role(row,'listitem');row.dataset.idRow=item.id;row.tabIndex=0;
      row.draggable=item.state!=='sending'&&!uncertain;
      row.title='Alt + 上下方向键调整顺序';
      const line=geminiLayout?element(doc,'div','sq-row-line'):row;
      if(geminiLayout)row.append(line);
      if(uncertain&&!geminiLayout){
        const warning=action(doc,'status',unknownMessage(state),item.id);
        warning.className='sq-action sq-index sq-warning';line.append(warning);
      }else line.append(element(doc,'span','sq-index',String(i+1)));
      if(geminiLayout){
        const open=openPreviews.has(item.id);
        const text=element(doc,'button','sq-text sq-preview-trigger',item.text);
        text.type='button';text.dataset.action='preview';
        labelElement(text,'第 '+(i+1)+' 条：查看消息全文');
        text.setAttribute('aria-expanded',String(open));
        text.setAttribute('aria-controls','sq-preview-'+i);
        line.append(text);
        if(uncertain||item.state!=='paused'){
          const status=uncertain?'结果未知':item.state==='sending'?'发送中':'待发送';
          const badge=uncertain?element(doc,'button','sq-item-state sq-warning',status):element(doc,'span','sq-item-state',status);
          if(uncertain){badge.type='button';badge.dataset.action='status';badge.dataset.id=item.id;
            labelElement(badge,unknownMessage(state));}
          line.append(badge);
        }
        const preview=element(doc,'div','sq-preview',item.text);
        preview.id='sq-preview-'+i;preview.hidden=!open;row.append(preview);
      }else{
        const text=element(doc,'span','sq-text',item.text);text.title=item.text;line.append(text);
      }
      const ops=element(doc,'div','sq-ops');
      for(const [key,label] of [[item.state==='paused'?'resume':'pause',item.state==='paused'?'恢复此条':'暂停此条'],
        ['now','提前发送'],['edit',uncertain?'编辑失败消息':'取回输入框编辑'],['remove','删除']]){
        const b=action(doc,key,label,item.id);
        if(((item.state==='sending'||uncertain||state.inFlight?.id===item.id)&&
          key!=='remove'&&!(uncertain&&key==='edit'))||
          (item.state==='paused'&&key==='now'))b.disabled=true;
        ops.append(b);
      }
      line.append(ops);rows.append(row);
    }
    replaceRows(rows);
    if(state.reason&&!(cacheWarning&&state.reason==='队列缓存未保存')&&
      !(recovery&&state.reason==='恢复草稿尚待核对')&&
      state.phase!=='unknown'&&!state.inFlight&&items.some(item=>item.state!=='paused')){
      const waiting=element(doc,'div','sq-waiting',state.reason);
      role(waiting,'status');root.append(waiting);
    }
    if(items.length>3){
      const more=element(doc,'button','sq-more',state.expanded?'收起队列':'展开其余 '+(items.length-3)+' 条');
      if(!state.expanded&&items.slice(3).some(item=>item.state==='unknown'||
        (state.inFlight?.id===item.id&&state.inFlight.phase==='unknown'))){
        labelElement(more,more.textContent+' · '+unknownMessage(state));
        more.title=unknownMessage(state);more.textContent='⚠ '+more.textContent;
      }
      more.type='button';more.dataset.action='more';
      more.setAttribute('aria-expanded',String(state.expanded));root.append(more);
    }
    if(geminiLayout||state.expanded)rows.scrollTop=expandedScrollTop;
    if(activeRow){
      const row=[...root.querySelectorAll('[data-id-row]')]
        .find(node=>node.dataset.idRow===activeRow);
      const target=activeAction?[...row?.querySelectorAll('[data-action]')||[]]
        .find(node=>node.dataset.action===activeAction||geminiLayout&&
          ['resume','pause'].includes(activeAction)&&['resume','pause'].includes(node.dataset.action)):row;
      (target||row)?.focus?.({preventScroll:true});
    }
  }
  function restoreNativeStyle(node,property,saved){
    if(node.style.getPropertyValue(property)!==saved.applied||
      node.style.getPropertyPriority(property)!=='important')return;
    if(saved.value)node.style.setProperty(property,saved.value,saved.priority);
    else node.style.removeProperty(property);
  }
  function applyNativeLayout(placement,win){
    const {toolbar,grid,field,leading,trailing,gemini}=placement||{};
    const next=new Map();
    if(toolbar&&win.getComputedStyle(toolbar).display.includes('flex'))
      next.set(toolbar,{'flex-wrap':'wrap','min-width':'0','max-width':'100%'});
    if(grid&&win.getComputedStyle(grid).display==='grid'){
      if(gemini){
        const narrow=bounds(grid).width<400;
        next.set(grid,{'grid-template-areas':narrow?'"file-preview" "text-input" "leading-actions" "trailing-actions"':
          '"file-preview file-preview" "text-input text-input" "leading-actions trailing-actions"',
          'grid-template-columns':narrow?'minmax(0,1fr)':'minmax(0,1fr) minmax(0,max-content)',
          'grid-template-rows':narrow?'auto auto auto auto':'auto auto auto'});
        next.set(trailing,{'min-width':'0','max-width':'100%','flex-wrap':'wrap','justify-content':'flex-end',
          'justify-self':'end'});
      }else{
        const narrow=bounds(grid).width<300;
        next.set(grid,{'grid-template-columns':'minmax(0,1fr) minmax(0,max-content)',
          'grid-template-rows':narrow?'auto auto auto':'auto auto'});
        next.set(field,{'grid-area':'1 / 1 / 2 / -1','min-width':'0'});
        next.set(leading,{'grid-area':narrow?'2 / 1 / 3 / -1':'2 / 1 / 3 / 2'});
        next.set(trailing,{'grid-area':narrow?'3 / 1 / 4 / -1':'2 / 2 / 3 / 3','max-width':'100%'});
      }
    }
    for(const [node,props] of nativeStyles){
      for(const [property,saved] of props){
        if(next.get(node)?.[property]!==undefined)continue;
        restoreNativeStyle(node,property,saved);props.delete(property);
      }
      if(!props.size)nativeStyles.delete(node);
    }
    for(const [node,props] of next){
      if(!nativeStyles.has(node))nativeStyles.set(node,new Map());
      const tracked=nativeStyles.get(node);
      for(const [property,applied] of Object.entries(props)){
        const value=node.style.getPropertyValue(property),priority=node.style.getPropertyPriority(property);
        if(tracked.get(property)?.applied!==value||priority!=='important')tracked.set(property,{value,priority,applied});
        else tracked.get(property).applied=applied;
        if(value!==applied||priority!=='important')important(node,property,applied);
        tracked.get(property).applied=node.style.getPropertyValue(property);
      }
    }
  }
  function bottomSlot(snap){
    const native=snap.stopButton||snap.sendButton||snap.anchorButton;
    const toolbar=snap.placement?snap.placement.toolbar:native?.parentElement;
    if(!native?.isConnected||!toolbar?.isConnected||!snap.form.contains(toolbar)||
      toolbar.contains(snap.editor)||native===toolbar||!toolbar.contains(native))return null;
    let anchor=native;
    while(anchor.parentElement!==toolbar)anchor=anchor.parentElement;
    return {native,anchor,toolbar};
  }
  function hide(){
    syncFeedbackRoute();
    closeInfo();
    if(list)important(list.host,'display','none');
    if(button){
      important(button.host,'display','none');
      applyNativeLayout(null);
    }
    reset();
  }
  function place(snap){
    const fail=reason=>{hide();if(reason)engine.wait(reason);return false;};
    if(!snap?.ok||!snap.form?.isConnected)return fail();
    const slot=bottomSlot(snap);
    if(!slot)return fail();
    const {native,anchor,toolbar}=slot,{form,editor}=snap,win=doc.defaultView;
    const parent=form.parentElement;
    if(!parent||parent.closest('[contenteditable]'))return fail();
    geminiLayout=snap.placement?.gemini===true;
    const measureSurface=()=>geminiLayout?geminiSurface(form,win):composerSurface(editor,native,form,win);
    const prior=measureSurface(),input=editorViewport(editor,form,win);
    if(!prior||!input)return fail();
    const controls=[...form.querySelectorAll(snap.placement?.controls||'button')]
      .map(node=>[node,visibleRect(node,win)]).filter(([,rect])=>rect);
    const width=native.offsetWidth,height=native.offsetHeight;
    if(!(width>0&&height>0))return fail();
    ensure();
    const restoreFocus=button.content.getRootNode?.()?.activeElement===blue;
    awaitingConversation=snap.newConversation===true;
    if(geminiLayout)root.dataset.dock='gemini';else delete root.dataset.dock;
    applyNativeLayout(snap.placement,win);
    inline(button.host,width);
    important(button.host,'overflow','visible');
    important(button.host,'display','inline-flex');
    important(button.host,'flex','0 0 '+width+'px');
    important(button.host,'margin-block-start','0');
    important(button.host,'margin-inline-start','0');
    important(button.host,'margin-inline-end','6px');
    important(button.host,'height',height+'px');
    important(button.host,'align-self','center');
    blue.dataset.nativeSize='';
    blue.style.setProperty('--sq-native-width',width+'px');
    blue.style.setProperty('--sq-native-height',height+'px');
    if(button.host.parentElement!==toolbar||button.host.nextSibling!==anchor)
      toolbar.insertBefore(button.host,anchor);
    reset();
    inline(list.host,prior.width);
    if(list.host.nextSibling!==form)parent.insertBefore(list.host,form);
    if(geminiLayout||!engine.view().items.length)render(snap);
    const surface=measureSurface();
    if(!surface||surface.node!==prior.node)return fail('等待安全显示队列，避免覆盖原生输入区');
    inline(list.host,surface.width);
    root.style.setProperty('--sq-surface-radius',surface.radius);
    important(list.host,'margin-left',surface.left-bounds(list.host).left+'px');
    important(list.host,'margin-bottom',bounds(list.host).bottom-surface.rect.top+'px');
    const finalSurface=measureSurface(),band=bounds(list.host);
    const own=bounds(blue),current=editorViewport(editor,form,win);
    const reference=visibleRect(native,win);
    const sizeMatches=reference&&native.offsetWidth===width&&native.offsetHeight===height&&
      Math.abs(own.width-width)<=1&&Math.abs(own.height-height)<=1&&
      Math.abs(own.top+own.height/2-reference.top-reference.height/2)<=1;
    const overlaps=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
    if(!finalSurface||!current||current.width<input.width-1||!sizeMatches||
      own.top<current.bottom-1||own.left<finalSurface.rect.left-1||own.right>finalSurface.rect.right+1||
      own.bottom>finalSurface.rect.bottom+1||
      controls.some(([node,before])=>{
        const after=visibleRect(node,win);
        return !after||after.width<before.width-1||after.height<before.height-1||overlaps(own,after);
      })||Math.abs(band.left-finalSurface.left)>1||
      Math.abs(band.right-finalSurface.left-finalSurface.width)>1||Math.abs(band.bottom-finalSurface.rect.top)>1)
      return fail('等待安全显示队列，避免覆盖或缩窄原生输入区');
    fitCrown(blue,arrow,crown,toolbar,win);
    if(restoreFocus&&button.content.getRootNode?.()?.activeElement!==blue)blue.focus?.({preventScroll:true});
    return true;
  }
  function destroy(){reset();applyNativeLayout(null);recovery=null;
    closeInfo();closeRecoveryEditor();clearError();feedback?.destroy();feedback=null;
    list?.destroy();button?.destroy();list=null;button=null;info=null;}
  function isPlaced(snap){
    if(!snap?.ok||!list?.active()||!button?.active())return false;
    const slot=bottomSlot(snap),win=doc.defaultView;
    return !!slot&&list.host.nextSibling===snap.form&&button.host.parentElement===slot.toolbar&&
      button.host.nextSibling===slot.anchor&&!!visibleRect(list.host,win)&&
      !!visibleRect(button.host,win)&&!!editorViewport(snap.editor,snap.form,win);
  }
  owner.onDispose(destroy);
  return Object.freeze({place,render,hide,toast,clearError,setCacheWarning,offerRecovery,hasRecovery,isPlaced,
    isRecoveryEditing:()=>!!recoveryEditor?.node.isConnected&&feedback.active()&&recoveryEditor.route===feedbackRoute(),
    recovery:()=>recovery===null?null:{text:recovery.text},destroy});
}
