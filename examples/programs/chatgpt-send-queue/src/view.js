// Managed Shadow DOM UI; never replace or resize ChatGPT's original composer.
const ICON={send:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
  now:'<path d="M12 19V5m-6 6 6-6 6 6M4 20h16"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8.2 17.8l-4.2 1.2 1.2-4.2Z"/>',
  status:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  remove:'<path d="M18 6 6 18M6 6l12 12"/>'};
// Crown artwork is a declared, packaged transparent WebP (assets/queue.css).
function element(doc,tag,cls,text){
  const node=doc.createElement(tag);if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;return node;
}
function svg(doc,markup){
  const node=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  node.setAttribute('viewBox','0 0 24 24');node.setAttribute('aria-hidden','true');
  node.innerHTML=markup;return node;
}
function action(doc,what,label,id){
  const b=element(doc,'button','sq-action');b.type='button';b.dataset.action=what;
  if(id)b.dataset.id=id;b.setAttribute('aria-label',label);b.title=label;
  b.append(svg(doc,ICON[what]));return b;
}
function unknownMessage(state){
  return '发送结果未知 · '+(state.reason||'请核对原对话')+'；队列不会自动重试';
}
function inline(host,width){
  const props={position:'relative',display:'block',top:'auto',right:'auto',
    bottom:'auto',left:'auto',width:width+'px',maxWidth:'none',
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
function composerSurface(editor,nativeButton,form,win){
  // site.inspect() exposes editor, not composer. Transparent layout wrappers
  // and rounded editor-only shells are not the shared visible input surface.
  const input=visibleRect(editor,win),button=visibleRect(nativeButton,win);
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
      const length=(value,extent)=>value.endsWith('%')?parseFloat(value)*extent/100:parseFloat(value)||0;
      const corners=['TopLeft','TopRight','BottomRight','BottomLeft'].map(corner=>{
        const parts=style['border'+corner+'Radius'].trim().split(/\s+/);
        return [length(parts[0],rect.width),length(parts[1]||parts[0],rect.height)];
      });
      // CSS scales all radii together when adjacent corners exceed an edge.
      const [tl,tr,br,bl]=corners;
      const scale=Math.min(1,rect.width/(tl[0]+tr[0]||1),rect.width/(bl[0]+br[0]||1),
        rect.height/(tl[1]+bl[1]||1),rect.height/(tr[1]+br[1]||1));
      const painted=(style.backgroundColor!=='transparent'&&
        !/^(?:rgba\([^)]*,\s*0\)|rgb\([^)]*\/\s*0\))$/.test(style.backgroundColor))||
        style.backgroundImage!=='none'||style.boxShadow!=='none'||
        ['Top','Right','Bottom','Left'].some(side=>parseFloat(style['border'+side+'Width'])>0&&
          !['none','hidden'].includes(style['border'+side+'Style']));
      if(painted&&tl.every(n=>n>0)&&tr.every(n=>n>0)){
        const left=tl[0]*scale,right=tr[0]*scale,width=rect.width-left-right;
        if(width>0)return {node,rect,left:rect.left+left,width,
          radius:`${left}px ${right}px 0 0 / ${tl[1]*scale}px ${tr[1]*scale}px 0 0`};
      }
    }
    if(node===form)break;
  }
  return null;
}
export function createQueueView({owner,createPageUI,assets,engine,actions}){
  const doc=owner.content.ownerDocument,css=owner.getAsset('assets/queue.css');
  let list=null,button=null,root=null,blue=null,toastNode=null,toastToken=0;
  let lastSignature='',recoveryText=null,recoveryReason='';
  function reset(){
    for(const prop of ['margin-left','margin-bottom'])list?.host.style.removeProperty(prop);
    root?.style.removeProperty('--sq-surface-radius');
  }
  function ensure(){
    if(list && !list.active()){list.destroy();list=null;lastSignature='';}
    if(button && !button.active()){button.destroy();button=null;}
    if(!list?.active()){
      list=createPageUI({id:'opendesk.chatgpt-send-queue.list',assets,baseStyles:false});
      list.addStyle(css);root=element(doc,'section','sq-panel');lastSignature='';
      root.setAttribute('aria-label','发送队列');list.content.append(root);
      list.host.style.setProperty('display','none','important');
      list.on(root,'click',e=>{
        const b=e.target.closest?.('button[data-action]');if(!b)return;
        switch(b.dataset.action){
          case 'now':actions.sendNow(b.dataset.id);break;
          case 'edit':actions.edit(b.dataset.id);break;
          case 'remove':actions.remove(b.dataset.id);break;
          case 'more':engine.toggleExpanded();break;
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
      button.addStyle(css);
      blue=element(doc,'button','sq-send');
      blue.type='button';blue.setAttribute('aria-label','当前草稿加入发送队列');
      blue.title='OpenDesk 队列 · 当前草稿加入发送队列 · 皇冠仅为装饰';
      const crown=element(doc,'span','sq-crown');
      crown.setAttribute('aria-hidden','true');
      blue.append(svg(doc,ICON.send),crown);
      button.content.append(blue);
      toastNode=element(doc,'div','sq-toast');
      toastNode.setAttribute('role','status');toastNode.hidden=true;
      button.content.append(toastNode);
      button.host.style.setProperty('display','none','important');
      button.on(blue,'click',actions.enqueue);
      // Recovery content is transient and never auto-enqueued or auto-sent.
      // Clipboard access happens only after an explicit user gesture.
      button.on(toastNode,'click',async event=>{
        const target=event.target.closest?.('button[data-recovery]');
        if(!target||recoveryText===null)return;
        event.stopPropagation();
        if(target.dataset.recovery==='done'){
          recoveryText=null;recoveryReason='';
          toast('请核对原生草稿；输入框清空且回复结束后队列自动继续');return;
        }
        if(target.dataset.recovery!=='copy')return;
        const original=recoveryText;
        try{
          const clipboard=doc.defaultView.navigator?.clipboard;
          if(!clipboard?.writeText)throw Error('clipboard unavailable');
          await clipboard.writeText(original);
          if(recoveryText!==original)return;
          recoveryText=null;recoveryReason='';
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
          manual.focus();manual.select();
        }
      });
      if(recoveryText!==null)showRecovery();
    }
  }
  function showRecovery(){
    if(recoveryText===null||!toastNode)return;
    const copy=element(doc,'button','sq-more','复制未入列原草稿');
    copy.type='button';copy.dataset.recovery='copy';
    copy.setAttribute('aria-label','复制未入列的原始草稿');
    toastToken++;
    toastNode.replaceChildren(element(doc,'div','sq-recovery-label',
      recoveryReason||'原生草稿未入队，请先备份原文'),copy);
    toastNode.hidden=false;
  }
  function hasRecovery(){return recoveryText!==null;}
  function offerRecovery(text,reason){
    if(recoveryText!==null||typeof text!=='string'||!text)return false;
    ensure();recoveryText=text;recoveryReason=reason;
    showRecovery();return true;
  }
  function toast(message){
    if(!toastNode||recoveryText!==null)return;
    toastNode.textContent=message;toastNode.hidden=false;
    const id=++toastToken;
    owner.setTimeout(()=>{if(id===toastToken&&toastNode)toastNode.hidden=true;},3000);
  }
  function render(){
    if(!list?.active()||!button?.active())return;
    const state=engine.view(),items=state.items;
    if(!items.length){
      lastSignature='';
      list.host.style.setProperty('display','none','important');reset();
      return;
    }
    const signature=JSON.stringify([state.expanded,state.reason,state.phase,state.inFlight?.phase,!!state.answerGate,
      items.map(item=>[item.id,item.text,item.state])]);
    if(signature===lastSignature)return;
    lastSignature=signature;
    const active=list.shadowRoot.activeElement;
    const activeRow=active?.closest?.('[data-id-row]')?.dataset.idRow;
    const activeAction=active?.dataset.action;
    root.replaceChildren();
    const rows=element(doc,'div','sq-rows');rows.setAttribute('role','list');
    const shown=state.expanded?items:items.slice(0,3);
    for(const [i,item] of shown.entries()){
      const unknown=item.state==='unknown'||
        (state.inFlight?.id===item.id&&state.inFlight.phase==='unknown');
      const row=element(doc,'div','sq-row'+(unknown?' sq-unknown':''));
      row.setAttribute('role','listitem');row.dataset.idRow=item.id;row.tabIndex=0;
      row.draggable=item.state!=='sending'&&!unknown;
      row.title='Alt + 上下方向键调整顺序';
      // Keep exceptional feedback with the affected message, never as a footer
      // between the waiting list and the website's composer.
      if(unknown){
        const warning=action(doc,'status',unknownMessage(state),item.id);
        warning.className='sq-action sq-index sq-warning';row.append(warning);
      }else row.append(element(doc,'span','sq-index',String(i+1)));
      const text=element(doc,'span','sq-text',item.text);text.title=item.text;row.append(text);
      const ops=element(doc,'div','sq-ops');
      for(const [key,label] of [['now','强制发送'],['edit','取回输入框编辑'],['remove','删除']]){
        const b=action(doc,key,label,item.id);
        if((item.state==='sending'||unknown)&&key!=='remove')b.disabled=true;
        ops.append(b);
      }
      row.append(ops);rows.append(row);
    }
    root.append(rows);
    if(items.length>3){
      const more=element(doc,'button','sq-more',state.expanded?'收起队列':'展开其余 '+(items.length-3)+' 条');
      if(!state.expanded&&items.slice(3).some(item=>item.state==='unknown'||
        (state.inFlight?.id===item.id&&state.inFlight.phase==='unknown'))){
        more.setAttribute('aria-label',more.textContent+' · '+unknownMessage(state));
        more.title=unknownMessage(state);more.textContent='⚠ '+more.textContent;
      }
      more.type='button';more.dataset.action='more';more.setAttribute('aria-expanded',String(state.expanded));root.append(more);
    }
    if(activeRow){
      const row=[...root.querySelectorAll('[data-id-row]')]
        .find(node=>node.dataset.idRow===activeRow);
      const target=activeAction?[...row?.querySelectorAll('[data-action]')||[]]
        .find(node=>node.dataset.action===activeAction):row;
      target?.focus?.({preventScroll:true});
    }
  }
  function hide(){
    if(list)list.host.style.setProperty('display','none','important');
    if(button){
      if(recoveryText!==null){
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
    const nativeButton=snap.stopButton||snap.sendButton||snap.anchorButton;
    if(!nativeButton||!snap.form.contains(nativeButton)||!nativeButton.parentElement)return fail();
    const form=snap.form,win=doc.defaultView,prior=form.getBoundingClientRect();
    const size=win.matchMedia('(pointer:coarse)').matches?42:34;
    const surface=composerSurface(snap.editor,nativeButton,form,win);
    if(!surface)return fail();
    const input=snap.editor.getBoundingClientRect();
    const controls=[...form.querySelectorAll('button')].map(node=>[node,visibleRect(node,win)])
      .filter(([,rect])=>rect);
    const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const safe=()=>{
      const current=visibleRect(snap.editor,win),own=blue.getBoundingClientRect();
      return form.getBoundingClientRect().width>=prior.width-1&&current&&
      // Single-line composers share their row with the action controls. The
      // added button may consume its own width and gap, but no more space.
      current.width>=Math.min(input.width,Math.max(120,input.width-size-6))-1&&
      current.height>=input.height-1&&!overlaps(own,current)&&
      controls.every(([node,before])=>{
        const after=visibleRect(node,win);
        return after&&after.width>=before.width-1&&after.height>=before.height-1&&
          !overlaps(own,after);
      });
    };
    ensure();
    inline(button.host,size);button.host.style.setProperty('overflow','visible','important');
    blue.hidden=false;toastNode.style.removeProperty('bottom');
    button.host.style.setProperty('display','inline-flex','important');
    button.host.style.setProperty('flex','0 0 '+size+'px','important');
    button.host.style.setProperty('margin-right','6px','important');
    if(button.host.nextSibling!==nativeButton)nativeButton.parentElement.insertBefore(button.host,nativeButton);
    if(!safe())return fail('等待安全显示队列按钮，避免缩窄原生输入框或遮挡原生按钮');
    const state=engine.view();
    if(!state.items.length){list.host.style.setProperty('display','none','important');reset();return true;}
    const parent=form.parentElement;if(!parent||parent.closest('[contenteditable]'))return fail();
    reset();
    inline(list.host,surface.width);
    list.host.style.setProperty('display','block','important');
    if(list.host.nextSibling!==form)parent.insertBefore(list.host,form);
    // Dock to the top tangent span, leaving the website's rounded shoulders
    // untouched. Measure again after flow insertion; no parent-width guesses.
    const updated=composerSurface(snap.editor,nativeButton,form,win);
    if(!updated||updated.node!==surface.node||!safe())
      return fail('等待安全显示队列，避免改变原生输入宽度');
    inline(list.host,updated.width);
    root.style.setProperty('--sq-surface-radius',updated.radius);
    const offset=updated.left-list.host.getBoundingClientRect().left;
    list.host.style.setProperty('margin-left',offset+'px','important');
    const gap=updated.rect.top-list.host.getBoundingClientRect().bottom;
    list.host.style.setProperty('margin-bottom',-gap+'px','important');
    const finalSurface=composerSurface(snap.editor,nativeButton,form,win);
    const placed=list.host.getBoundingClientRect();
    if(!finalSurface||!safe()||Math.abs(placed.left-finalSurface.left)>1||
      Math.abs(placed.bottom-finalSurface.rect.top)>1)
      return fail('等待安全显示队列，避免覆盖原生输入区');
    return true;
  }
  function destroy(){reset();recoveryText=null;list?.destroy();button?.destroy();list=null;button=null;}
  owner.onDispose(destroy);
  return Object.freeze({place,render,hide,toast,offerRecovery,hasRecovery,destroy});
}
