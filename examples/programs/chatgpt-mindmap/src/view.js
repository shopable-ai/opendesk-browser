import {createXmindRenderer} from './xmind-adapter.js';

// All graphics are fixed, local path geometry; no runtime icon package or CDN.
const ICONS={
  original:['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','M14 2v6h6','M8 13h8','M8 17h6'],
  zoomOut:['M21 21l-4.3-4.3','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0','M8 11h6'],
  zoomIn:['M21 21l-4.3-4.3','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0','M8 11h6','M11 8v6'],
  fit:['M8 3H5a2 2 0 0 0-2 2v3','M16 3h3a2 2 0 0 1 2 2v3','M3 16v3a2 2 0 0 0 2 2h3','M21 16v3a2 2 0 0 1-2 2h-3'],
  fold:['M4 6h16','M4 12h16','M4 18h16','m8 9 4 3 4-3'],
  unfold:['M4 6h16','M4 12h16','M4 18h16','m8 15 4-3 4 3'],
  expand:['M8 8 3 3','M3 8V3h5','M16 8l5-5','M21 8V3h-5',
    'M8 16l-5 5','M3 16v5h5','M16 16l5 5','M21 16v5h-5'],
  shrink:['M3 3l6 6','M9 4v5H4','M21 3l-6 6','M15 4v5h5',
    'M3 21l6-6','M9 20v-5H4','M21 21l-6-6','M15 20v-5h5'],
  refresh:['M20 11a8 8 0 0 0-14-5L3 9','M3 3v6h6','M4 13a8 8 0 0 0 14 5l3-3','M21 21v-6h-6'],
  more:['M5 12h.01','M12 12h.01','M19 12h.01']
};
function icon(document,name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  for(const d of ICONS[name]){
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);
    if(name==='more')path.setAttribute('stroke-width','3.6');
    svg.append(path);
  }
  return svg;
}

// Each answer owns one controller. Its DOM stays inside the existing reply.
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
  const makeGroup=(label,extra='')=>{
    const group=el('div','odmm-group '+extra);
    group.setAttribute('role','group');group.setAttribute('aria-label',label);
    toolbar.append(group);return group;
  };
  const originalGroup=makeGroup('返回原文');
  const zoomGroup=makeGroup('缩放');
  const branchGroup=makeGroup('分支','odmm-desktop-only');
  const fullGroup=makeGroup('全屏');
  const refreshGroup=makeGroup('更新','odmm-desktop-only');
  const menuGroup=makeGroup('更多','odmm-mobile-only odmm-menu-wrap');
  const menu=el('div','odmm-menu');menu.id='odmm-more-menu';
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','更多导图操作');
  menu.hidden=true;
  const removers=[],renderButtons=[],buttons=new Map();
  let renderer=null,fullscreen=false,disposed=false,closing=null,inlineParent=null,inlineNext=null;
  let preferredSkin=null,menuOpen=false;
  function remember(id,button){
    if(!buttons.has(id))buttons.set(id,[]);
    buttons.get(id).push(button);
  }
  function update(id,{glyph,label,disabled,pressed,hidden}={}){
    for(const button of buttons.get(id)||[]){
      if(glyph)button.replaceChildren(icon(document,glyph));
      if(label){button.title=label;button.setAttribute('aria-label',label);}
      if(disabled!==undefined)button.disabled=disabled;
      if(pressed!==undefined){
        if(button.getAttribute('role')==='menuitem')button.removeAttribute('aria-pressed');
        else button.setAttribute('aria-pressed',String(pressed));
      }
      if(hidden!==undefined)button.hidden=hidden;
    }
  }
  const closeMenu=({restoreFocus=false}={})=>{
    if(!menuOpen)return;
    menuOpen=false;menu.hidden=true;more.setAttribute('aria-expanded','false');
    if(restoreFocus)more.focus();
  };
  function action({id,glyph,label,run,group,render=false,menuItem=false}){
    const button=el('button',menuItem?'odmm-tool odmm-menu-action':'odmm-tool');
    button.type='button';button.title=label;button.setAttribute('aria-label',label);
    if(menuItem)button.setAttribute('role','menuitem');
    button.setAttribute('data-action',id);
    button.append(icon(document,glyph));remember(id,button);
    if(render){button.disabled=true;renderButtons.push(button);}
    removers.push(owner.on(button,'click',async()=>{
      if(disposed||button.disabled)return;
      if(menuItem)closeMenu();
      const groupButtons=buttons.get(id)||[];
      groupButtons.forEach(item=>{
        item.disabled=true;item.setAttribute('aria-busy','true');
      });
      try{await run();}
      catch(error){await onError(error);}
      finally{
        if(!disposed)groupButtons.forEach(item=>{
          item.disabled=false;item.removeAttribute('aria-busy');
        });
      }
    }));
    group.append(button);
    return button;
  }
  const original=action({id:'original',glyph:'original',label:'恢复本条回复原文',
    run:onOriginal,group:originalGroup});
  action({id:'zoom-out',glyph:'zoomOut',label:'缩小导图',
    run:()=>renderer.zoomBy(.8),group:zoomGroup,render:true});
  action({id:'zoom-in',glyph:'zoomIn',label:'放大导图',
    run:()=>renderer.zoomBy(1.25),group:zoomGroup,render:true});
  action({id:'fit',glyph:'fit',label:'适配导图画布',
    run:()=>renderer.fit(),group:zoomGroup,render:true});
  let folded=false;
  const toggleFold=async()=>{
    const next=await renderer.toggleAll();
    folded=next;
    update('fold',{glyph:next?'unfold':'fold',
      label:next?'展开所有分支':'折叠所有分支',pressed:next});
  };
  action({id:'fold',glyph:'fold',label:'折叠所有分支',
    run:toggleFold,group:branchGroup,render:true});
  action({id:'fullscreen',glyph:'expand',label:'进入全屏',
    run:onFullscreen,group:fullGroup,render:true});
  action({id:'refresh',glyph:'refresh',label:'重新读取本条回复',
    run:onRefresh,group:refreshGroup});
  const more=el('button','odmm-tool odmm-more');
  more.type='button';more.title='更多导图操作';more.setAttribute('aria-label','更多导图操作');
  more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls',menu.id);
  more.setAttribute('aria-expanded','false');more.append(icon(document,'more'));
  menuGroup.append(more);
  action({id:'fold',glyph:'fold',label:'折叠所有分支',
    run:toggleFold,group:menu,render:true,menuItem:true});
  action({id:'refresh',glyph:'refresh',label:'重新读取本条回复',
    run:onRefresh,group:menu,menuItem:true});
  menuGroup.append(menu);
  update('refresh',{hidden:true});
  update('fold',{pressed:false});
  update('fullscreen',{pressed:false});
  removers.push(owner.on(more,'click',()=>{
    menuOpen=!menuOpen;menu.hidden=!menuOpen;
    more.setAttribute('aria-expanded',String(menuOpen));
    if(menuOpen)menu.querySelector('button:not([hidden])')?.focus();
  }));
  removers.push(owner.on(shadow,'keydown',event=>{
    if(!menuOpen)return;
    if(event.key==='Escape'){
      closeMenu({restoreFocus:true});event.stopPropagation();event.preventDefault();
      return;
    }
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const items=[...menu.querySelectorAll('button:not([hidden]):not(:disabled)')];
    if(!items.length)return;
    const index=items.indexOf(shadow.activeElement);
    const target=event.key==='Home'?0:event.key==='End'?items.length-1:
      event.key==='ArrowDown'?(index+1)%items.length:
      (index<0?0:index-1+items.length)%items.length;
    items[target].focus();event.preventDefault();
  }));
  removers.push(owner.on(document,'pointerdown',event=>{
    if(menuOpen&&!event.composedPath().includes(menuGroup))closeMenu();
  }));
  const canvas=el('div','odmm-canvas');canvas.tabIndex=0;
  canvas.setAttribute('aria-label','XMind 只读画布，可拖动和滚动浏览分支');
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
    renderButtons.forEach(button=>{button.disabled=false;});
    status.textContent='';status.hidden=true;host.dataset.ready='true';
    host.dataset.layoutReady='inline';
    if(!host.dataset.skinPending)host.dataset.skinReady=preferredSkin;
  }
  async function setTheme(isDark){
    if(disposed)return;
    const next=isDark?'dark':'light';
    if(preferredSkin===next)return;
    preferredSkin=next;
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
    closeMenu();fullscreen=value;host.dataset.layoutReady='pending';
    if(value){
      inlineParent=host.parentNode;inlineNext=host.nextSibling;
      host.classList.add('odmm-fullscreen');document.body.append(host);
    }else{
      host.classList.remove('odmm-fullscreen');
      if(inlineParent?.isConnected){
        if(inlineNext?.parentNode===inlineParent)inlineParent.insertBefore(host,inlineNext);
        else inlineParent.append(host);
      }
    }
    update('fullscreen',{glyph:value?'shrink':'expand',
      label:value?'退出全屏':'进入全屏',pressed:value});
    // The actual canvas geometry changes after DOM relocation. Respect a
    // user-adjusted viewport instead of resetting zoom merely on relocation.
    await renderer?.reflow();
    if(!disposed&&fullscreen===value)host.dataset.layoutReady=value?'fullscreen':'inline';
  }
  function markStale(){
    status.hidden=false;status.textContent='原回复已更新，请刷新导图';
    status.setAttribute('data-stale','true');
    update('refresh',{hidden:false});
    more.classList.add('odmm-stale');
    more.setAttribute('aria-label','更多导图操作，有可刷新的内容');
  }
  function destroy(){
    if(closing)return closing;
    disposed=true;closeMenu();for(const remove of removers)remove();
    host.hidden=true;
    closing=(async()=>{try{await renderer?.destroy();}finally{host.remove();}})();
    return closing;
  }
  return Object.freeze({host,start,destroy,setFull,setTheme,markStale,
    focusPrimary:()=>original.focus(),
    focusFullscreen:()=>buttons.get('fullscreen')?.[0]?.focus(),
    get fullscreen(){return fullscreen;},nodeCount});
}
