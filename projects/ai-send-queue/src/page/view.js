// Managed Shadow DOM UI; native composers retain ownership of their editors.
const path=d=>['path',{d}];
const ICON={send:[path('M12 19V5m-6 6 6-6 6 6')],
  now:[path('M12 19V5m-6 6 6-6 6 6M4 20h16')],
  pause:[6,14].map(x=>['rect',{x,y:4,width:4,height:16,rx:1}]),
  resume:[path('M8 5v14l11-7Z')],
  edit:[path('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8.2 17.8l-4.2 1.2 1.2-4.2Z')],
  status:[['circle',{cx:12,cy:12,r:9}],path('M12 7v6m0 4h.01')],
  remove:[path('M18 6 6 18M6 6l12 12')]};
// Crown artwork is a declared, packaged transparent WebP (assets/queue.css).
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
  if(id)b.dataset.id=id;b.setAttribute('aria-label',label);b.title=label;
  b.append(svg(doc,ICON[what]));return b;
}
function unknownMessage(state){
  return '发送结果未知 · '+(state.reason||'尚未确认消息是否已发送')+'；不会自动重试，请核对原对话';
}
function inline(host,width){
  const props={position:'relative',display:'block',top:'auto',right:'auto',
    bottom:'auto',left:'auto',width:typeof width==='number'?width+'px':width,maxWidth:'none',
    minWidth:'0',padding:'0',transform:'none',zIndex:'1'};
  for(const [p,v] of Object.entries(props))
    host.style.setProperty(p.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v,'important');
}
function visibleRect(node,win){
  if(!node?.isConnected)return null;
  const style=win.getComputedStyle(node),rect=node.getBoundingClientRect();
  if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||
    Number(style.opacity)===0||![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||
    rect.width<=0||rect.height<=0)return null;
  return rect;
}
const clipsOverflow=value=>/^(auto|scroll|hidden|clip)$/.test(value);
function editorViewport(editor,form,win){
  const rect=visibleRect(editor,win);if(!rect)return null;
  let {left,right,top,bottom}=rect;
  // A contenteditable can be thousands of pixels tall inside a small native
  // scrollport. Measure its visible portion, without resizing or scrolling it.
  for(let node=editor.parentElement;node;node=node.parentElement){
    const style=win.getComputedStyle(node);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||
      Number(style.opacity)===0)return null;
    if(style.display!=='contents'){
      const clipX=clipsOverflow(style.overflowX);
      const clipY=clipsOverflow(style.overflowY);
      // Overflow-visible wrappers may legitimately have no layout height.
      if(clipX||clipY){
        const box=node.getBoundingClientRect();
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
      clipTop=Math.max(clipTop,node.getBoundingClientRect().top+(node.clientTop||0));
    }
    if(node===toolbar.ownerDocument.body)break;
  }
  // Keep the decoration inside clipping ancestors, leaving room for its rotation.
  // If headroom is tight, contain the artwork above the arrow instead of moving the button.
  if(Number.isFinite(clipTop)){
    const top=clipTop+1;
    button.style.setProperty('--sq-crown-min-top',top-button.getBoundingClientRect().top+'px');
    crown.style.setProperty('--sq-crown-max-height',Math.max(0,arrow.getBoundingClientRect().top-top-1)+'px');
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
  // CSS scales all radii together when adjacent corners exceed an edge.
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
  // site.inspect() exposes editor, not composer. Transparent layout wrappers
  // and rounded editor-only shells are not the shared visible input surface.
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
  trustedActions=false,currentRoute=null}){
  const doc=owner.content.ownerDocument,css=owner.getAsset('assets/queue.css');
  // Reference the declared image at runtime so the frozen source contains its
  // data URL once, rather than duplicating it inside both CSS and image assets.
  const crownImage=owner.getAsset('assets/crown-premium.webp');
  const imageRef='var(--sq-crown-image)';
  const packagedImageRef=`url("${crownImage}")`;
  if(typeof crownImage!=='string'||!/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(crownImage)||
    typeof css!=='string'||!css.includes(imageRef))
    throw new Error('Packaged Send Queue crown image is missing or invalid');
  const buttonCss=css.replace(imageRef,packagedImageRef);
  let list=null,button=null,root=null,blue=null,arrow=null,crown=null,toastNode=null,toastToken=0;
  let awaitingConversation=false;
  let lastSignature='',recoveryText=null,recoveryReason='';
  let cacheWarning='',cacheNotice=null,copyingBackup=false;
  let expandedScrollTop=0;
  const nativeStyles=new Map();
  let geminiLayout=false;
  function reset(){
    for(const prop of ['margin-left','margin-bottom'])list?.host.style.removeProperty(prop);
    root?.style.removeProperty('--sq-surface-radius');
  }
  function ensure(){
    if(list && !list.active()){list.destroy();list=null;cacheNotice=null;lastSignature='';}
    if(button && !button.active()){button.destroy();button=null;}
    if(!list?.active()){
      list=createPageUI({id:'opendesk.chatgpt-send-queue.list',assets,baseStyles:false});
      list.addStyle(css);root=element(doc,'section','sq-panel');lastSignature='';
      root.setAttribute('aria-label','发送队列');list.content.append(root);
      list.host.style.setProperty('display','none','important');
      list.on(root,'toggle',e=>{if(e.target===cacheNotice?.node)syncBackup();},true);
      list.on(root,'click',e=>{
        if(trustedActions&&e.isTrusted!==true)return;
        const b=e.target.closest?.('button[data-action]');if(!b)return;
        switch(b.dataset.action){
          case 'now':actions.sendNow(b.dataset.id);break;
          case 'pause':actions.pause(b.dataset.id);break;
          case 'resume':actions.resume(b.dataset.id);break;
          case 'edit':actions.edit(b.dataset.id);break;
          case 'remove':actions.remove(b.dataset.id);break;
          case 'backup':copyBackup(b);break;
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
              toast(unknownMessage(state));
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
      blue.type='button';blue.setAttribute('aria-label','当前草稿加入发送队列');
      blue.setAttribute('aria-keyshortcuts','Control+Enter');
      blue.title='加入发送队列 · Ctrl + Enter；Shift 点击可暂停入队';
      crown=element(doc,'span','sq-crown');
      crown.setAttribute('aria-hidden','true');
      arrow=svg(doc,ICON.send);
      blue.append(arrow,crown);
      button.content.append(blue);
      toastNode=element(doc,'div','sq-toast');
      toastNode.setAttribute('role','status');toastNode.hidden=true;
      button.content.append(toastNode);
      button.host.style.setProperty('display','none','important');
      button.on(blue,'click',event=>{
        if(!trustedActions||event.isTrusted===true)actions.enqueue({paused:event.shiftKey===true});
      });
      // Recovery content is transient and never auto-enqueued or auto-sent.
      // Clipboard access happens only after an explicit user gesture.
      button.on(toastNode,'click',async event=>{
        if(trustedActions&&event.isTrusted!==true)return;
        const target=event.target.closest?.('button[data-recovery]');
        if(!target||recoveryText===null||currentRoute&&maskRows())return;
        event.stopPropagation();
        if(target.dataset.recovery==='done'){
          completeRecovery();
          toast('请核对原生草稿；输入框清空且回复结束后队列自动继续');return;
        }
        if(target.dataset.recovery!=='copy')return;
        const original=recoveryText;
        try{
          const clipboard=doc.defaultView.navigator?.clipboard;
          if(!clipboard?.writeText)throw Error('clipboard unavailable');
          await clipboard.writeText(original);
          if(recoveryText!==original)return;
          completeRecovery();
          toast('原草稿已复制；输入框清空且回复结束后队列自动继续');
        }catch{
          if(recoveryText!==original)return;
          const manual=element(doc,'textarea','sq-recovery-text');
          manual.readOnly=true;manual.value=original;
          manual.setAttribute('aria-label','未入列原草稿，请手动复制');
          manual.style.width='100%';manual.style.minHeight='76px';
          manual.style.boxSizing='border-box';manual.style.resize='vertical';
          const done=element(doc,'button','sq-more','我已复制');
          done.type='button';done.dataset.recovery='done';
          toastNode.replaceChildren(
            element(doc,'div','sq-recovery-label','浏览器拒绝复制，请手动选中并复制原文'),manual,done);
          if(!currentRoute||!maskRows()){manual.focus();manual.select();}
        }
      });
      if(recoveryText!==null)showRecovery();
    }
  }
  function showRecovery(){
    if(recoveryText===null||!toastNode)return;
    const copy=element(doc,'button','sq-more','复制备份原文');
    copy.type='button';copy.dataset.recovery='copy';
    copy.setAttribute('aria-label','复制需要人工核对的原始草稿备份');
    toastToken++;
    toastNode.replaceChildren(element(doc,'div','sq-recovery-label',
      recoveryReason||'原生草稿交接未能确认，已保留原文，请核对输入框与队列'),copy);
    toastNode.hidden=!!currentRoute&&maskRows();
  }
  function hasRecovery(){return recoveryText!==null;}
  function completeRecovery(){
    recoveryText=null;recoveryReason='';toastToken++;
    toastNode.replaceChildren();toastNode.hidden=true;
    onRecoveryChange();
  }
  function offerRecovery(text,reason){
    if(recoveryText!==null||typeof text!=='string'||!text)return false;
    ensure();recoveryText=text;recoveryReason=reason;
    onRecoveryChange();showRecovery();return true;
  }
  function toast(message,{variant='info',duration=3000}={}){
    if(typeof owner.active==='function'&&!owner.active())return;
    // Page USER_SCRIPT uses its public Page UI, independently of the sidebar.
    // Keep the local status as a compatibility fallback, never a native dialog.
    if(typeof owner.toast==='function'){
      try{owner.toast({message,variant,duration,position:'top'});return;}catch{}
    }
    if(!toastNode||recoveryText!==null)return;
    toastNode.textContent=message;toastNode.hidden=false;
    const id=++toastToken;
    owner.setTimeout(()=>{if(id===toastToken&&toastNode)toastNode.hidden=true;},3000);
  }
  function appendCacheWarning(){
    if(!cacheWarning||!list?.active()||cacheNotice)return;
    const node=element(doc,'details','sq-cache-warning');
    const summary=element(doc,'summary','sq-cache-summary');
    const status=element(doc,'span','','自动发送已暂停');
    status.setAttribute('role','status');summary.append(status);
    const body=element(doc,'div','sq-cache-details');
    const copy=element(doc,'button','sq-cache-copy','复制备份');
    copy.type='button';copy.dataset.action='backup';copy.hidden=true;
    body.append(element(doc,'p','',cacheWarning),copy);
    node.append(summary,body);root.append(node);
    cacheNotice={node,body,copy};
  }
  function maskRows(state=engine.view()){
    if(!currentRoute)return awaitingConversation;
    const current=currentRoute();
    return !current?.route||!!state.route&&current.route!==state.route;
  }
  function syncBackup(snapshot){
    if(!cacheNotice)return;
    const {node,copy}=cacheNotice;
    const masked=maskRows();
    node.hidden=masked;
    let available=false;
    if(node.open&&!masked){
      try{available=!!getBackup({availabilityOnly:true,snapshot});}catch{}
    }
    copy.hidden=!available;
  }
  function setCacheWarning(message){
    if(cacheWarning===message)return;
    cacheWarning=message;cacheNotice?.node.remove();cacheNotice=null;
    appendCacheWarning();
  }
  async function copyBackup(trigger){
    const notice=cacheNotice;
    if(copyingBackup||!notice?.node.open||notice.copy!==trigger||trigger.hidden||
      maskRows()||!list?.active())return;
    let text;
    try{text=getBackup();}catch{toast('暂时无法生成备份，请保留网页后重试',{variant:'warning'});return;}
    if(!list?.active()||notice!==cacheNotice)return;
    if(!text){syncBackup();return;}
    copyingBackup=true;trigger.disabled=true;
    try{
      const clipboard=doc.defaultView.navigator?.clipboard;
      if(!clipboard?.writeText)throw Error('clipboard unavailable');
      await clipboard.writeText(text);
      if(list?.active()&&notice===cacheNotice)toast('已复制备份',{variant:'success'});
    }catch{
      if(!list?.active()||notice!==cacheNotice)return;
      let manual=notice.body.querySelectorAll('textarea')[0];
      if(!manual){
        manual=element(doc,'textarea','sq-cache-backup');manual.readOnly=true;
        manual.setAttribute('aria-label','队列与草稿备份，请手动复制');notice.body.append(manual);
      }
      manual.value=text;
      if(notice.node.open&&!maskRows()){manual.focus?.();manual.select?.();}
      toast('浏览器未允许复制，可在暂停详情中手动复制备份',{variant:'warning'});
    }finally{copyingBackup=false;trigger.disabled=false;}
  }
  function replaceRows(rows){
    // Keep the disclosure and its focus anchored while queue rows change.
    for(const child of [...root.children])if(child!==cacheNotice?.node)child.remove();
    root.insertBefore(rows,cacheNotice?.node??null);
  }
  function render(snapshot){
    if(!list?.active()||!button?.active())return;
    if(currentRoute&&!currentRoute()){hide();return;}
    appendCacheWarning();syncBackup(snapshot);
    // A different composer must never show the queue held for the previous route.
    const state=engine.view(),masked=maskRows(state),items=masked?[]:state.items;
    if(currentRoute&&recoveryText!==null)toastNode.hidden=masked;
    const previousRows=[...root.children].find(node=>node.className==='sq-rows');
    if(geminiLayout||root.className==='sq-panel sq-expanded')
      expandedScrollTop=Math.max(0,Number(previousRows?.scrollTop)||0);
    if(!items.length){
      expandedScrollTop=0;
      const signature='empty:'+masked+':'+geminiLayout;
      if(lastSignature===signature)return;
      lastSignature=signature;
      root.className='sq-panel sq-empty';
      root.setAttribute('aria-label','发送队列，暂无待发送消息');
      const rows=element(doc,'div','sq-rows');
      rows.setAttribute('role','list');
      const cue=element(doc,'span','sq-empty-mark','···');
      cue.setAttribute('aria-hidden','true');
      rows.append(cue);
      replaceRows(rows);
      return;
    }
    const signature=JSON.stringify([geminiLayout,state.expanded,state.reason,state.phase,!!cacheWarning,
      state.inFlight?.phase,!!state.answerGate,items.map(item=>[item.id,item.text,item.state])]);
    if(signature===lastSignature)return;
    lastSignature=signature;
    const active=list.shadowRoot.activeElement;
    const activeRow=active?.closest?.('[data-id-row]')?.dataset.idRow;
    const activeAction=active?.dataset.action;
    const openPreviews=new Set([...root.querySelectorAll('.sq-preview:not([hidden])')]
      .map(node=>node.closest('[data-id-row]').dataset.idRow));
    root.className='sq-panel'+(state.expanded?' sq-expanded':'');
    root.setAttribute('aria-label','发送队列');
    const rows=element(doc,'div','sq-rows');rows.setAttribute('role','list');
    const shown=state.expanded?items:items.slice(0,3);
    for(const [i,item] of shown.entries()){
      const uncertain=item.state==='unknown'||
        (state.inFlight?.id===item.id&&state.inFlight.phase==='unknown');
      const row=element(doc,'div','sq-row'+(uncertain?' sq-unknown':'')+
        (item.state==='paused'?' sq-paused':''));
      row.setAttribute('role','listitem');row.dataset.idRow=item.id;row.tabIndex=0;
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
        text.setAttribute('aria-label','第 '+(i+1)+' 条：查看消息全文');
        text.setAttribute('aria-expanded',String(open));
        text.setAttribute('aria-controls','sq-preview-'+i);
        line.append(text);
        if(uncertain||item.state!=='paused'){
          const status=uncertain?'结果未知':item.state==='sending'?'发送中':'待发送';
          const badge=uncertain?element(doc,'button','sq-item-state sq-warning',status):element(doc,'span','sq-item-state',status);
          if(uncertain){badge.type='button';badge.dataset.action='status';badge.dataset.id=item.id;
            badge.setAttribute('aria-label',unknownMessage(state));}
          line.append(badge);
        }
        const preview=element(doc,'div','sq-preview',item.text);
        preview.id='sq-preview-'+i;preview.hidden=!open;row.append(preview);
      }else{
        const text=element(doc,'span','sq-text',item.text);text.title=item.text;line.append(text);
      }
      const ops=element(doc,'div','sq-ops');
      for(const [key,label] of [[item.state==='paused'?'resume':'pause',item.state==='paused'?'恢复此条':'暂停此条'],
        ['now','提前发送'],['edit','取回输入框编辑'],['remove','删除']]){
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
      state.phase!=='unknown'&&!state.inFlight&&items.some(item=>item.state!=='paused')){
      const waiting=element(doc,'div','sq-waiting',state.reason);
      waiting.setAttribute('role','status');root.insertBefore(waiting,cacheNotice?.node??null);
    }
    if(items.length>3){
      const more=element(doc,'button','sq-more',state.expanded?'收起队列':'展开其余 '+(items.length-3)+' 条');
      if(!state.expanded&&items.slice(3).some(item=>item.state==='unknown'||
        (state.inFlight?.id===item.id&&state.inFlight.phase==='unknown'))){
        more.setAttribute('aria-label',more.textContent+' · '+unknownMessage(state));
        more.title=unknownMessage(state);more.textContent='⚠ '+more.textContent;
      }
      more.type='button';more.dataset.action='more';
      more.setAttribute('aria-expanded',String(state.expanded));root.insertBefore(more,cacheNotice?.node??null);
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
    const set=(node,props)=>next.set(node,props);
    if(toolbar&&win.getComputedStyle(toolbar).display.includes('flex'))
      set(toolbar,{'flex-wrap':'wrap','min-width':'0','max-width':'100%'});
    if(grid&&win.getComputedStyle(grid).display==='grid'){
      if(gemini){
        // Keep the native attachment area; move the whole action row below the editor.
        const narrow=grid.getBoundingClientRect().width<400;
        set(grid,{'grid-template-areas':narrow?'"file-preview" "text-input" "leading-actions" "trailing-actions"':
          '"file-preview file-preview" "text-input text-input" "leading-actions trailing-actions"',
          'grid-template-columns':narrow?'minmax(0,1fr)':'minmax(0,1fr) minmax(0,max-content)',
          'grid-template-rows':narrow?'auto auto auto auto':'auto auto auto'});
        set(trailing,{'min-width':'0','max-width':'100%','flex-wrap':'wrap','justify-content':'flex-end',
          'justify-self':'end'});
      }else{
        // Small composers can't fit every native control and the crown on one line.
        const narrow=grid.getBoundingClientRect().width<300;
        set(grid,{'grid-template-columns':'minmax(0,1fr) minmax(0,max-content)',
          'grid-template-rows':narrow?'auto auto auto':'auto auto'});
        set(field,{'grid-area':'1 / 1 / 2 / -1','min-width':'0'});
        set(leading,{'grid-area':narrow?'2 / 1 / 3 / -1':'2 / 1 / 3 / 2'});
        set(trailing,{'grid-area':narrow?'3 / 1 / 4 / -1':'2 / 2 / 3 / 3','max-width':'100%'});
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
        if(value!==applied||priority!=='important')node.style.setProperty(property,applied,'important');
        tracked.get(property).applied=node.style.getPropertyValue(property);
      }
    }
  }
  function bottomSlot(snap){
    const native=snap.stopButton||snap.sendButton||snap.anchorButton;
    const toolbar=snap.placement?snap.placement.toolbar:native?.parentElement;
    if(!native?.isConnected||!toolbar?.isConnected||!snap.form.contains(toolbar)||
      toolbar.contains(snap.editor)||native===toolbar||!toolbar.contains(native))return null;
    // Treat a native wrapper and a direct button as the same kind of toolbar slot.
    let anchor=native;
    while(anchor.parentElement!==toolbar)anchor=anchor.parentElement;
    return {native,anchor,toolbar};
  }
  function hide(){
    if(list)list.host.style.setProperty('display','none','important');
    if(button){
      button.host.style.setProperty('display','none','important');
      applyNativeLayout(null);
      if(recoveryText!==null&&(!currentRoute||!maskRows())){
        // Keep recovery accessible if React replaces or removes the composer.
        if(doc.body&&button.host.parentElement!==doc.body)doc.body.append(button.host);
        button.host.style.setProperty('position','fixed','important');
        button.host.style.setProperty('right','18px','important');
        button.host.style.setProperty('bottom','18px','important');
        button.host.style.setProperty('z-index','2147483646','important');
        button.host.style.setProperty('display','inline-flex','important');
        blue.hidden=true;toastNode.style.setProperty('bottom','0','important');
      }else button.host.style.setProperty('display','none','important');
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
    // Use layout dimensions so the site's transient button animations don't resize ours.
    const width=native.offsetWidth,height=native.offsetHeight;
    if(!(width>0&&height>0))return fail();
    ensure();
    const restoreFocus=button.content.getRootNode?.()?.activeElement===blue;
    awaitingConversation=snap.newConversation===true;
    if(geminiLayout)root.dataset.dock='gemini';else delete root.dataset.dock;
    applyNativeLayout(snap.placement,win);
    inline(button.host,width);
    button.host.style.setProperty('overflow','visible','important');
    button.host.style.setProperty('display','inline-flex','important');
    button.host.style.setProperty('flex','0 0 '+width+'px','important');
    button.host.style.setProperty('margin-block-start','0','important');
    button.host.style.setProperty('margin-inline-start','0','important');
    button.host.style.setProperty('margin-inline-end','6px','important');
    button.host.style.setProperty('height',height+'px','important');
    button.host.style.setProperty('align-self','center','important');
    blue.dataset.nativeSize='';
    blue.style.setProperty('--sq-native-width',width+'px');
    blue.style.setProperty('--sq-native-height',height+'px');
    blue.hidden=false;toastNode.style.removeProperty('bottom');
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
    list.host.style.setProperty('margin-left',surface.left-list.host.getBoundingClientRect().left+'px','important');
    list.host.style.setProperty('margin-bottom',list.host.getBoundingClientRect().bottom-surface.rect.top+'px','important');
    const finalSurface=measureSurface(),band=list.host.getBoundingClientRect();
    const own=blue.getBoundingClientRect(),current=editorViewport(editor,form,win);
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
    toastNode.style.setProperty('--sq-toast-right',Math.max(8,win.innerWidth-own.right)+'px');
    toastNode.style.setProperty('--sq-toast-bottom',Math.max(8,win.innerHeight-finalSurface.rect.top+8)+'px');
    if(restoreFocus&&button.content.getRootNode?.()?.activeElement!==blue)blue.focus?.({preventScroll:true});
    return true;
  }
  function destroy(){reset();applyNativeLayout(null);recoveryText=null;
    list?.destroy();button?.destroy();list=null;button=null;cacheNotice=null;}
  function isPlaced(snap){
    if(!snap?.ok||!list?.active()||!button?.active())return false;
    const slot=bottomSlot(snap),win=doc.defaultView;
    return !!slot&&list.host.nextSibling===snap.form&&button.host.parentElement===slot.toolbar&&
      button.host.nextSibling===slot.anchor&&!blue.hidden&&!!visibleRect(list.host,win)&&
      !!visibleRect(button.host,win)&&!!editorViewport(snap.editor,snap.form,win);
  }
  owner.onDispose(destroy);
  return Object.freeze({place,render,hide,toast,setCacheWarning,offerRecovery,hasRecovery,isPlaced,
    recovery:()=>recoveryText===null?null:{text:recoveryText},destroy});
}
