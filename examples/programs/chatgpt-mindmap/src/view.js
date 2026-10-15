import {createXmindRenderer} from './xmind-adapter.js';

// One answer owns one controller. The renderer starts only after the host mounts.
export function createAnswerView({document,window,owner,css,tree,nodeCount,truncated,
  onOriginal,onRefresh,onFullscreen,onError}){
  const el=(tag,className,label)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(label!==undefined)node.textContent=label;
    return node;
  };
  const host=el('section');host.setAttribute('data-opendesk-chatgpt-mindmap','viewer');
  const shadow=host.attachShadow({mode:'open'});
  const style=el('style');style.textContent=css;
  const shell=el('div','odmm-shell'),toolbar=el('div','odmm-toolbar');
  toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','思维导图操作');
  const actions=[],renderActions=[];
  let renderer=null,fullscreen=false,disposed=false,closing=null,inlineParent=null,inlineNext=null;
  let preferredSkin=null;
  function action(label,fn,title,{render=false}={}){
    const button=el('button','odmm-tool',label);button.type='button';
    button.title=title;button.setAttribute('aria-label',title);
    actions.push(owner.on(button,'click',async()=>{
      try{await fn();}catch(error){await onError(error);}
    }));
    if(render){button.disabled=true;renderActions.push(button);}
    toolbar.append(button);return button;
  }
  action('原文',onOriginal,'恢复本条回复原文');
  const full=action('全屏',onFullscreen,'切换全屏');
  action('−',()=>renderer.zoomBy(.8),'缩小',{render:true});
  action('+',()=>renderer.zoomBy(1.25),'放大',{render:true});
  action('适配',()=>renderer.fit(),'适配画布',{render:true});
  const fold=action('折叠',async()=>{
    fold.disabled=true;
    try{const folded=await renderer.toggleAll();fold.textContent=folded?'展开':'折叠';
      fold.setAttribute('aria-pressed',String(folded));}
    finally{if(!disposed)fold.disabled=false;}
  },'展开或折叠分支',{render:true});
  const refresh=action('刷新',onRefresh,'重新读取本条回复');refresh.hidden=true;
  const canvas=el('div','odmm-canvas');canvas.tabIndex=0;
  canvas.setAttribute('aria-label','XMind 只读画布');
  const status=el('div','odmm-status','正在打开 XMind…');status.setAttribute('role','status');
  if(truncated){const warning=el('div','odmm-warning','内容超出导图上限，原文保持完整。');shell.append(warning);}
  shell.append(toolbar,canvas,status);shadow.append(style,shell);
  async function start(){
    if(disposed)return;
    preferredSkin=host.getAttribute('data-dark')==='true'?'dark':'light';
    renderer=createXmindRenderer({window,canvas,tree,skinMode:preferredSkin});
    await renderer.ready;
    if(disposed)return;
    await renderer.fit();
    if(disposed)return;
    renderActions.forEach(button=>{button.disabled=false;});
    status.textContent='';status.hidden=true;host.dataset.ready='true';
    host.dataset.layoutReady='inline';
    if(!host.dataset.skinPending)host.dataset.skinReady=preferredSkin;
  }
  async function setTheme(isDark){
    if(disposed)return;
    const next=isDark?'dark':'light';
    if(preferredSkin===next)return;
    preferredSkin=next;
    // A still-loading renderer accepts a queued skin switch after ready.
    // Do not dispose/reopen this answer, or affect any sibling viewer.
    if(renderer){
      host.dataset.skinPending=next;
      await renderer.setTheme(next);
      if(!disposed&&preferredSkin===next){
        host.dataset.skinReady=next;
        delete host.dataset.skinPending;
      }
    }
  }
  async function setFull(value){
    if(disposed||fullscreen===value)return;
    fullscreen=value;
    host.dataset.layoutReady='pending';
    if(value){
      inlineParent=host.parentNode;inlineNext=host.nextSibling;
      host.classList.add('odmm-fullscreen');document.body.append(host);
      full.textContent='退出全屏';
    }else{
      host.classList.remove('odmm-fullscreen');
      if(inlineParent?.isConnected){
        if(inlineNext?.parentNode===inlineParent)inlineParent.insertBefore(host,inlineNext);
        else inlineParent.append(host);
      }
      full.textContent='全屏';
    }
    full.setAttribute('aria-pressed',String(value));
    await renderer?.fit();
    if(!disposed&&fullscreen===value){
      host.dataset.layoutReady=value?'fullscreen':'inline';
    }
  }
  function markStale(){
    status.hidden=false;refresh.hidden=false;
    status.textContent='原回复已更新，请刷新导图';status.setAttribute('data-stale','true');
  }
  function destroy(){
    if(closing)return closing;
    disposed=true;for(const remove of actions)remove();
    // Hide immediately, but retain the mount until pending SDK work drains.
    host.hidden=true;
    closing=(async()=>{try{await renderer?.destroy();}finally{host.remove();}})();
    return closing;
  }
  return Object.freeze({host,start,destroy,setFull,setTheme,markStale,
    get fullscreen(){return fullscreen;},nodeCount});
}
