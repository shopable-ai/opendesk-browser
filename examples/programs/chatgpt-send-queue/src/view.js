// Managed Shadow DOM UI; never replace or resize ChatGPT's original composer.
const ICON={send:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
  now:'<path d="M12 19V5m-6 6 6-6 6 6M4 20h16"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8.2 17.8l-4.2 1.2 1.2-4.2Z"/>',
  remove:'<path d="M18 6 6 18M6 6l12 12"/>',
  play:'<path d="m8 5 11 7-11 7z"/>'};
const CROWN=`<defs>
  <linearGradient id="sq-gold" x1="0" y1="0" x2=".95" y2="1">
    <stop offset="0" stop-color="#fffbdc"/><stop offset=".28" stop-color="#ffe185"/>
    <stop offset=".6" stop-color="#f5ad2f"/><stop offset="1" stop-color="#be7214"/>
  </linearGradient>
  <linearGradient id="sq-band" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff4b9"/><stop offset=".55" stop-color="#f6ba40"/>
    <stop offset="1" stop-color="#b76d15"/>
  </linearGradient>
  <radialGradient id="sq-ruby"><stop offset="0" stop-color="#ffb7aa"/>
    <stop offset=".45" stop-color="#f34b67"/><stop offset="1" stop-color="#a51e44"/>
  </radialGradient>
</defs>
<path d="M3.6 16.8 2.6 6.5l5.45 3.95L12 3.2l3.95 7.25L21.4 6.5l-1 10.3Z"
  fill="url(#sq-gold)" stroke="#ad6c19" stroke-width="1.15" stroke-linejoin="round"/>
<path d="M4 16.5c5.7 1.15 10.3 1.15 16 0l-.2 3.1c-5.4 1.65-10.2 1.65-15.6 0Z"
  fill="url(#sq-band)" stroke="#985711" stroke-width="1" stroke-linejoin="round"/>
<path d="m4.25 9.7 3.5 2.75L12 5.25l4.25 7.2 3.5-2.75"
  fill="none" stroke="#fff6ba" stroke-width="1" opacity=".85"/>
<path d="M5.5 18.05q6.5 1.15 13 0" fill="none" stroke="#fff8d4" stroke-width=".75"/>
<path d="m12 11.2 2.15 2.15L12 15.5l-2.15-2.15Z"
  fill="url(#sq-ruby)" stroke="#a72b3b" stroke-width=".6"/>
<circle cx="6.6" cy="16.1" r=".8" fill="#fff4cb"/>
<circle cx="17.4" cy="16.1" r=".8" fill="#fff4cb"/>
<circle cx="2.6" cy="6.5" r="1.05" fill="#ffeb98" stroke="#ae721c" stroke-width=".6"/>
<circle cx="12" cy="3.2" r="1.1" fill="#fff3b4" stroke="#ae721c" stroke-width=".6"/>
<circle cx="21.4" cy="6.5" r="1.05" fill="#ffeb98" stroke="#ae721c" stroke-width=".6"/>`;
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
function inline(host,width){
  const props={position:'relative',display:'block',top:'auto',right:'auto',
    bottom:'auto',left:'auto',width:width+'px',maxWidth:'none',
    minWidth:'0',padding:'0',transform:'none',zIndex:'1'};
  for(const [p,v] of Object.entries(props))
    host.style.setProperty(p.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v,'important');
}
export function createQueueView({owner,createPageUI,assets,engine,actions}){
  const doc=owner.content.ownerDocument,css=owner.getAsset('assets/queue.css');
  let list=null,button=null,root=null,blue=null,toastNode=null,toastToken=0;
  let native=null,restore=null,lastSignature='';
  function reset(){
    restore?.();restore=null;native=null;
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
          case 'play':actions.togglePause();break;
          case 'more':engine.toggleExpanded();break;
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
      blue.title='OpenDesk 队列 · Shift + 点击暂停/恢复 · 皇冠仅为装饰';
      const crown=element(doc,'span','sq-crown');
      crown.setAttribute('aria-hidden','true');
      crown.append(svg(doc,CROWN));blue.append(svg(doc,ICON.send),crown);
      button.content.append(blue);
      toastNode=element(doc,'div','sq-toast');
      toastNode.setAttribute('role','status');toastNode.hidden=true;
      button.content.append(toastNode);
      button.host.style.setProperty('display','none','important');
      button.on(blue,'click',actions.enqueue);
    }
  }
  function toast(message){
    if(!toastNode)return;
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
    const signature=JSON.stringify([state.paused,state.expanded,state.reason,state.phase,state.inFlight?.phase,!!state.answerGate,
      items.map(item=>[item.id,item.text,item.state])]);
    if(signature===lastSignature)return;
    lastSignature=signature;
    const active=list.shadowRoot.activeElement;
    const activeRow=active?.closest?.('[data-id-row]')?.dataset.idRow;
    const activeAction=active?.dataset.action;
    root.replaceChildren();
    const rows=element(doc,'div','sq-rows');rows.setAttribute('role','list');
    const shown=state.expanded?items:items.slice(0,2);
    for(const [i,item] of shown.entries()){
      const row=element(doc,'div','sq-row'+(item.state==='unknown'?' sq-unknown':''));
      row.setAttribute('role','listitem');row.dataset.idRow=item.id;row.tabIndex=0;
      row.draggable=item.state!=='sending'&&item.state!=='unknown';
      row.title='Alt + 上下方向键调整顺序';
      row.append(element(doc,'span','sq-index',String(i+1)));
      const text=element(doc,'span','sq-text',item.text);text.title=item.text;row.append(text);
      const ops=element(doc,'div','sq-ops');
      for(const [key,label] of [['now','提前发送'],['edit','取回输入框编辑'],['remove','删除']]){
        const b=action(doc,key,label,item.id);
        if((item.state==='sending'||item.state==='unknown')&&key!=='remove')b.disabled=true;
        ops.append(b);
      }
      row.append(ops);rows.append(row);
    }
    root.append(rows);
    if(items.length>2){
      const more=element(doc,'button','sq-more',state.expanded?'收起队列':'展开其余 '+(items.length-2)+' 条');
      more.type='button';more.dataset.action='more';root.append(more);
    }
    {
      const note=element(doc,'div','sq-note');
      note.setAttribute('role','status');
      const unknown=state.phase==='unknown'||items.some(item=>item.state==='unknown')||
        state.inFlight?.phase==='unknown';
      const flight=state.inFlight?.phase;
      const uncertain=unknown||['await-confirm','await-stop'].includes(flight);
      // Describe the actual fence, without a countdown or inferring completion.
      const status=unknown?'发送结果未知 · '+(state.reason||'请核对原对话，队列不会自动重试'):
        flight==='await-confirm'?'正在发送 · 等待官网确认消息入站':
        flight==='await-stop'?'等待停止结果 · 尚未发送下一条':
        state.paused?'已暂停 · '+(state.reason||'等待用户恢复'):
        flight?'正在准备发送 · 其余消息等待中':
        state.answerGate?'等待中 · 等待上一条回复完成':
        '等待中 · '+(state.reason||'等待网页就绪');
      note.append(element(doc,'span','sq-note-text',status));
      if(state.paused&&!uncertain)note.append(action(doc,'play','恢复队列'));
      root.append(note);
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
    if(button)button.host.style.setProperty('display','none','important');
    reset();
  }
  function place(snap){
    if(!snap?.ok||!snap.form?.isConnected)return false;
    const nativeButton=snap.stopButton||snap.sendButton||snap.anchorButton;
    if(!nativeButton||!snap.form.contains(nativeButton)||!nativeButton.parentElement)return false;
    const form=snap.form,prior=form.getBoundingClientRect();
    if(!Number.isFinite(prior.width)||prior.width<200)return false;
    ensure();
    const size=doc.defaultView.matchMedia('(pointer:coarse)').matches?42:34;
    inline(button.host,size);button.host.style.setProperty('overflow','visible','important');
    button.host.style.setProperty('display','inline-flex','important');
    button.host.style.setProperty('flex','0 0 '+size+'px','important');
    button.host.style.setProperty('margin-right','6px','important');
    if(button.host.nextSibling!==nativeButton)nativeButton.parentElement.insertBefore(button.host,nativeButton);
    if(form.getBoundingClientRect().width<prior.width-1){
      doc.body.append(button.host);button.host.style.setProperty('display','none','important');
      engine.pause('队列按钮会使原生输入框缩窄，已暂停');return false;
    }
    const state=engine.view();
    if(!state.items.length){list.host.style.setProperty('display','none','important');reset();return true;}
    const parent=form.parentElement;if(!parent||parent.closest('[contenteditable]'))return false;
    inline(list.host,form.getBoundingClientRect().width);
    list.host.style.setProperty('display','block','important');
    if(list.host.nextSibling!==form)parent.insertBefore(list.host,form);
    const updated=form.getBoundingClientRect();
    if(updated.width<prior.width-1){
      doc.body.append(list.host);list.host.style.setProperty('display','none','important');
      engine.pause('队列改变了原生输入宽度，已暂停');return false;
    }
    const parentRect=parent.getBoundingClientRect(), offset=updated.left-parentRect.left;
    if(Number.isFinite(offset)&&Math.abs(offset)<600)
      list.host.style.setProperty('margin-left',Math.max(0,offset)+'px','important');
    const gap=updated.top-list.host.getBoundingClientRect().bottom;
    if(Number.isFinite(gap)&&Math.abs(gap)<80){
      const prev=Number.parseFloat(list.host.style.marginBottom)||0;
      if(Math.abs(gap)>.5)list.host.style.setProperty('margin-bottom',(prev-gap)+'px','important');
    }
    if(native!==form){
      reset();native=form;
      const originals=['border-top-left-radius','border-top-right-radius'].map(prop=>
        [prop,form.style.getPropertyValue(prop),form.style.getPropertyPriority(prop)]);
      restore=()=>{for(const [prop,value,priority] of originals){
        if(value)form.style.setProperty(prop,value,priority);else form.style.removeProperty(prop);
      }};
    }
    form.style.setProperty('border-top-left-radius','0','important');
    form.style.setProperty('border-top-right-radius','0','important');
    return true;
  }
  function destroy(){reset();list?.destroy();button?.destroy();list=null;button=null;}
  owner.onDispose(destroy);
  return Object.freeze({place,render,hide,toast,destroy});
}
