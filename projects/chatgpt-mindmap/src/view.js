import {createXmindRenderer} from './xmind-adapter.js';
import {buildOutlineMarkdown,exportFileBase,verifyXmindZip,verifyPngBlob} from './export.js';
import {annotateMindmapError} from './diagnostics.js';

// All graphics are fixed, local path geometry; no runtime icon package or CDN.
const ICONS={
  original:['M15 18l-6-6 6-6'],
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
  sun:['M12 2v2','M12 20v2','M4.93 4.93l1.42 1.42','M17.65 17.65l1.42 1.42','M2 12h2','M20 12h2','M6.35 17.65l-1.42 1.42','M19.07 4.93l-1.42 1.42','M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  moon:['M20.985 12.486A9 9 0 0 1 11.514 3.015a7 7 0 1 0 9.471 9.471Z'],
  more:['M5 12h.01','M12 12h.01','M19 12h.01'],
  download:['M12 3v12','m-5-5 5 5 5-5','M5 17v3h14v-3']
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
  onOriginal,onRefresh,onFullscreen,onToggleTheme,onError,identity,rendererFactory=createXmindRenderer}){
  const el=(tag,className,label)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(label!==undefined)node.textContent=label;
    return node;
  };
  const host=el('section');host.setAttribute('data-opendesk-chatgpt-mindmap','viewer');
  host.setAttribute('data-dark','true');
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
  const themeGroup=makeGroup('导图主题','odmm-desktop-only');
  const exportGroup=makeGroup('导出','odmm-desktop-only odmm-export-wrap');
  const refreshGroup=makeGroup('更新','odmm-desktop-only');
  const menuGroup=makeGroup('更多','odmm-mobile-only odmm-menu-wrap');
  const menu=el('div','odmm-menu');menu.id='odmm-more-menu';
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','更多导图操作');
  menu.hidden=true;
  const removers=[],renderButtons=[],buttons=new Map();
  let renderer=null,fullscreen=false,disposed=false,closing=null,inlineParent=null,inlineNext=null;
  let preferredSkin='dark',menuOpen=false,exportOpen=false,exportBusy=false,exportReturn=null;
  const exportUrls=new Set(),exportTimers=new Set();
  function syncThemeButton(){
    const dark=preferredSkin==='dark';
    update('theme',{glyph:dark?'sun':'moon',
      label:dark?'切换为浅色导图':'切换为深色导图'});
  }
  function remember(id,button){
    if(!buttons.has(id))buttons.set(id,[]);
    buttons.get(id).push(button);
  }
  function update(id,{glyph,label,disabled,pressed,hidden}={}){
    for(const button of buttons.get(id)||[]){
      if(glyph)button.replaceChildren(icon(document,glyph));
      if(label){
        button.setAttribute('aria-label',label);
        if(button.getAttribute('role')==='menuitem')button.setAttribute('data-label',label);
        const tip=button.querySelector('.odmm-tooltip');
        if(tip)tip.textContent=label;else button.title=label;
      }
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
  function addTooltip(button,label){
    const tip=el('span','odmm-tooltip',label);tip.setAttribute('aria-hidden','true');button.append(tip);
    button.removeAttribute('title');
    const reset=()=>button.removeAttribute('data-tooltip-dismissed');
    removers.push(owner.on(button,'pointerenter',reset),owner.on(button,'focus',reset));
    return tip;
  }
  function action({id,glyph,label,run,group,render=false,menuItem=false}){
    const button=el('button',menuItem?'odmm-tool odmm-menu-action':'odmm-tool');
    button.type='button';button.title=label;button.setAttribute('aria-label',label);
    if(menuItem){button.setAttribute('role','menuitem');button.setAttribute('data-label',label);}
    button.setAttribute('data-action',id);
    button.append(icon(document,glyph));remember(id,button);
    if(id==='refresh'&&!menuItem)addTooltip(button,label);
    if(render){button.disabled=true;renderButtons.push(button);}
    removers.push(owner.on(button,'click',async()=>{
      if(disposed||button.disabled)return;
      const focus=document.activeElement===host;
      if(menuItem)closeMenu({restoreFocus:true});
      const groupButtons=buttons.get(id)||[];
      groupButtons.forEach(item=>{
        item.disabled=true;item.setAttribute('aria-busy','true');
      });
      try{await run(id==='refresh'?{focus}:undefined);}
      catch(error){await onError(annotateMindmapError(error,`view.${id}`));}
      finally{
        if(!disposed){
          groupButtons.forEach(item=>{item.disabled=false;item.removeAttribute('aria-busy');});
          if(id==='refresh'&&focus&&(document.activeElement===document.body||
            (document.activeElement===host&&(!shadow.activeElement||
              shadow.activeElement===button||shadow.activeElement===more)))){
            (menuItem?more:button).focus();
          }
        }
      }
    }));
    group.append(button);
    return button;
  }
  const original=action({id:'original',glyph:'original',label:'返回完整原文',
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
  const toggleTheme=()=>onToggleTheme?onToggleTheme():setTheme(preferredSkin!=='dark');
  action({id:'theme',glyph:'sun',label:'切换为浅色导图',
    run:toggleTheme,group:themeGroup,render:true});
  const refreshMap=async({focus=false}={})=>{
    const result=await onRefresh({focus});
    if(result===false&&!disposed){
      const message='Refresh mind map · Reply is still updating';
      status.textContent=message;update('refresh',{label:message});
      for(const button of buttons.get('refresh')||[])button.setAttribute('data-label','Refresh mind map');
    }
  };
  action({id:'refresh',glyph:'refresh',label:'Refresh mind map',
    run:refreshMap,group:refreshGroup});
  const more=el('button','odmm-tool odmm-more');
  more.type='button';more.title='More actions';more.setAttribute('aria-label','More actions');
  more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls',menu.id);
  more.setAttribute('aria-expanded','false');more.append(icon(document,'more'));
  const moreTip=addTooltip(more,'More actions');
  menuGroup.append(more);
  action({id:'fold',glyph:'fold',label:'折叠所有分支',
    run:toggleFold,group:menu,render:true,menuItem:true});
  action({id:'theme',glyph:'sun',label:'切换为浅色导图',
    run:toggleTheme,group:menu,render:true,menuItem:true});
  action({id:'refresh',glyph:'refresh',label:'Refresh mind map',
    run:refreshMap,group:menu,menuItem:true});
  action({id:'export-open',glyph:'download',label:'Export',
    run:()=>openExport(true),group:menu,menuItem:true,render:true});
  menuGroup.append(menu);
  // The desktop Download icon and the mobile More -> Export entry share
  // exactly one format menu and one in-flight operation.
  const exportToggle=el('button','odmm-tool odmm-export-toggle');
  exportToggle.type='button';exportToggle.title='Export';
  exportToggle.setAttribute('aria-label','Export');
  exportToggle.setAttribute('aria-haspopup','menu');
  exportToggle.setAttribute('aria-expanded','false');
  exportToggle.append(icon(document,'download'));exportToggle.disabled=true;
  exportGroup.append(exportToggle);renderButtons.push(exportToggle);
  const exportMenu=el('div','odmm-export-menu');exportMenu.hidden=true;
  exportMenu.id='odmm-export-menu';exportMenu.setAttribute('role','menu');
  exportMenu.setAttribute('aria-label','Export formats');
  exportToggle.setAttribute('aria-controls',exportMenu.id);
  const exportOptions=[
    {id:'png',label:'PNG',extension:'.png'},
    {id:'xmind',label:'XMind',extension:'.xmind'},
    {id:'outline',label:'Markdown',extension:'-大纲.md'}
  ];
  const exportButtons=[];
  const exportStatus=el('div','odmm-export-status');exportStatus.hidden=true;
  exportStatus.setAttribute('role','status');
  function setExportStatus(message,error=false){
    if(disposed)return;
    exportStatus.hidden=false;exportStatus.textContent=message;
    exportStatus.setAttribute('role',error?'alert':'status');
  }
  function closeExport(focus=false){
    if(!exportOpen)return;
    exportOpen=false;exportMenu.hidden=true;
    exportToggle.setAttribute('aria-expanded','false');
    const target=exportReturn;exportReturn=null;
    if(focus)target?.focus();
  }
  function openExport(mobile=false){
    if(disposed||exportBusy||exportToggle.disabled)return;
    if(menuOpen)closeMenu();
    exportReturn=mobile?more:exportToggle;
    // One menu; anchor it to the actual trigger in either toolbar layout.
    const anchor=mobile?menuGroup:exportGroup;
    if(exportMenu.parentNode!==anchor)anchor.append(exportMenu);
    exportOpen=true;exportMenu.hidden=false;
    exportToggle.setAttribute('aria-expanded','true');
    exportButtons[0]?.focus();
  }
  function startDownload(blob,filename){
    const api=window.URL||globalThis.URL;
    if(typeof api?.createObjectURL!=='function'||
      typeof api?.revokeObjectURL!=='function')
      throw Object.assign(new Error('当前浏览器不支持文件下载'),{code:'E_XMIND_DOWNLOAD'});
    const url=api.createObjectURL(blob);
    exportUrls.add(url);
    const link=el('a');link.href=url;link.download=filename;
    try{host.append(link);link.click();}
    catch(error){exportUrls.delete(url);api.revokeObjectURL(url);throw error;}
    finally{link.remove();}
    const timer=window.setTimeout(()=>{
      exportTimers.delete(timer);exportUrls.delete(url);api.revokeObjectURL(url);
    },30000);
    exportTimers.add(timer);
  }
  async function runExport(option){
    if(disposed||exportBusy)return;
    closeExport(true);
    if(!renderer){setExportStatus('Mind map is not ready yet',true);return;}
    exportBusy=true;exportToggle.disabled=true;
    for(const button of exportButtons)button.disabled=true;
    setExportStatus('Preparing '+option.label+'…');
    try{
      let blob;
      if(option.id==='xmind')blob=await verifyXmindZip(await renderer.exportXmind());
      else if(option.id==='outline')blob=new Blob(
        [buildOutlineMarkdown(tree)],{type:'text/markdown;charset=utf-8'});
      else if(option.id==='png')blob=await verifyPngBlob(await renderer.exportPng());
      else throw Object.assign(new Error('当前格式不可用'),
        {code:'E_XMIND_EXPORT_UNAVAILABLE'});
      if(disposed)return;
      if(!blob.size)throw Object.assign(new Error('文件内容为空'),{code:'E_XMIND_EXPORT_EMPTY'});
      startDownload(blob,exportFileBase(tree.title)+option.extension);
      setExportStatus(truncated?'Download started · Mind map truncated':'Download started');
    }catch(error){
      if(!disposed)setExportStatus('Export failed: '+String(error?.code||error?.message||'Unknown error'),true);
    }finally{
      exportBusy=false;
      if(!disposed){
        exportToggle.disabled=false;
        for(const button of exportButtons)button.disabled=false;
      }
    }
  }
  for(const option of exportOptions){
    const button=el('button','odmm-export-item');button.type='button';
    button.setAttribute('role','menuitem');button.setAttribute('data-export',option.id);
    button.textContent=option.label;
    button.setAttribute('aria-label',option.label);
    exportMenu.append(button);exportButtons.push(button);
    removers.push(owner.on(button,'click',()=>runExport(option)));
  }
  exportGroup.append(exportMenu);
  removers.push(owner.on(exportToggle,'click',()=>{
    if(exportOpen)closeExport(true);else openExport();
  }));
  // A breakpoint/orientation change invalidates the previous menu anchor.
  removers.push(owner.on(window,'resize',()=>closeExport()));
  update('refresh',{hidden:true});
  update('fold',{pressed:false});
  update('fullscreen',{pressed:false});
  syncThemeButton();
  removers.push(owner.on(more,'click',()=>{
    closeExport();menuOpen=!menuOpen;menu.hidden=!menuOpen;
    more.setAttribute('aria-expanded',String(menuOpen));
    if(menuOpen)focusMenu();
  }));
  const focusMenu=(last=false)=>{
    const items=[...menu.querySelectorAll('button:not([hidden]):not(:disabled)')];
    (last?items.at(-1):items[0])?.focus();
  };
  removers.push(owner.on(more,'keydown',event=>{
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    if(!menuOpen){
      menuOpen=true;menu.hidden=false;more.setAttribute('aria-expanded','true');
    }
    focusMenu(event.key==='ArrowUp');event.preventDefault();event.stopPropagation();
  }));
  removers.push(owner.on(shadow,'keydown',event=>{
    if(event.key==='Escape'){
      let dismissed=false;
      for(const tip of shadow.querySelectorAll('.odmm-tooltip')){
        if(window.getComputedStyle?.(tip).display==='block'){
          tip.parentElement.setAttribute('data-tooltip-dismissed','true');dismissed=true;
        }
      }
      if(dismissed){event.stopPropagation();event.preventDefault();return;}
    }
    if(exportOpen){
      if(event.key==='Escape'){
        closeExport(true);event.stopPropagation();event.preventDefault();return;
      }
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        const index=exportButtons.indexOf(shadow.activeElement);
        const target=event.key==='Home'?0:event.key==='End'?exportButtons.length-1:
          event.key==='ArrowDown'?(index+1)%exportButtons.length:
          (index<0?0:index-1+exportButtons.length)%exportButtons.length;
        exportButtons[target]?.focus();event.preventDefault();return;
      }
      if(event.key==='Tab')closeExport();
      return;
    }
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
    const path=event.composedPath();
    if(menuOpen&&!path.includes(menuGroup))closeMenu();
    if(exportOpen&&!path.includes(exportMenu)&&!path.includes(exportToggle))closeExport();
  }));
  const canvas=el('div','odmm-canvas');canvas.tabIndex=0;
  canvas.setAttribute('aria-label','XMind 只读画布，可拖动和滚动浏览分支');
  const status=el('div','odmm-status odmm-sr-only');status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const loading=el('div','odmm-loading');loading.title='Loading mind map…';
  loading.setAttribute('aria-hidden','true');loading.append(icon(document,'refresh'));
  shell.append(toolbar,exportStatus,canvas,loading,status);shadow.append(style,shell);
  async function start(){
    if(disposed)return;
    if(!status.hasAttribute('data-stale'))status.textContent='Loading mind map…';
    preferredSkin=host.getAttribute('data-dark')==='false'?'light':'dark';
    syncThemeButton();
    let stage='renderer.create';
    try{
      renderer=rendererFactory({window,canvas,tree,skinMode:preferredSkin,identity});
      stage='renderer.ready';await renderer.ready;
      if(disposed)return;
      stage='renderer.fit';await renderer.fit();
      if(disposed)return;
      renderButtons.forEach(button=>{button.disabled=false;});
      loading.hidden=true;
      if(!status.hasAttribute('data-stale'))status.textContent='';
      host.dataset.ready='true';
      host.dataset.layoutReady='inline';
      if(!host.dataset.skinPending)host.dataset.skinReady=preferredSkin;
    }catch(error){throw annotateMindmapError(error,stage);}
  }
  async function setTheme(isDark){
    if(disposed)return;
    const next=isDark?'dark':'light';
    if(preferredSkin===next){syncThemeButton();return;}
    preferredSkin=next;
    syncThemeButton();
    if(renderer){
      host.dataset.skinPending=next;
      try{await renderer.setTheme(next);}
      catch(error){throw annotateMindmapError(error,'renderer.setTheme');}
      if(!disposed&&preferredSkin===next){
        host.dataset.skinReady=next;
        delete host.dataset.skinPending;
      }
    }
  }
  async function setFull(value){
    if(disposed||fullscreen===value)return;
    closeExport();
    const previousParent=host.parentNode,previousNext=host.nextSibling;
    const destination=value?document.body:inlineParent;
    const reference=!value&&inlineNext?.parentNode===destination?inlineNext:null;
    if(destination?.isConnected){
      // A remove+insert reloads even an iframe nested in this shadow tree.
      // Check the return path too, before entering fullscreen or changing UI.
      if(shadow.querySelector('iframe')&&(!host.isConnected||
        typeof destination.moveBefore!=='function'||
        (value&&typeof previousParent?.moveBefore!=='function'))){
        throw Object.assign(new Error('当前浏览器无法在全屏切换时保留 XMind 子框架。'),
          {code:'E_XMIND_FULLSCREEN_UNSUPPORTED'});
      }
      if(typeof destination.moveBefore==='function')destination.moveBefore(host,reference);
      else if(reference)destination.insertBefore(host,reference);
      else destination.append(host);
    }
    closeMenu();fullscreen=value;host.dataset.layoutReady='pending';
    if(value){
      inlineParent=previousParent;inlineNext=previousNext;
      host.classList.add('odmm-fullscreen');
    }else{
      host.classList.remove('odmm-fullscreen');
    }
    update('fullscreen',{glyph:value?'shrink':'expand',
      label:value?'退出全屏':'进入全屏',pressed:value});
    // The actual canvas geometry changes after DOM relocation. Respect a
    // user-adjusted viewport instead of resetting zoom merely on relocation.
    await renderer?.reflow();
    if(!disposed&&fullscreen===value)host.dataset.layoutReady=value?'fullscreen':'inline';
  }
  function markStale(){
    if(disposed||status.hasAttribute('data-stale'))return;
    status.textContent='Reply updated. Refresh mind map to sync.';
    status.setAttribute('data-stale','true');
    update('refresh',{hidden:false,label:'Reply updated · Refresh mind map'});
    for(const button of [...buttons.get('refresh')||[],more]){
      const dot=el('span','odmm-update-dot');dot.setAttribute('aria-hidden','true');button.append(dot);
      if(button.getAttribute('role')==='menuitem')button.setAttribute('data-label','Refresh mind map');
    }
    more.setAttribute('aria-label','More actions · Reply updated');
    moreTip.textContent='More actions · Reply updated';
  }
  function destroy(){
    if(closing)return closing;
    disposed=true;closeMenu();closeExport();
    const api=window.URL||globalThis.URL;
    for(const timer of exportTimers)window.clearTimeout(timer);
    exportTimers.clear();
    for(const url of exportUrls)api?.revokeObjectURL?.(url);
    exportUrls.clear();
    for(const remove of removers)remove();
    host.hidden=true;
    closing=(async()=>{try{await renderer?.destroy();}finally{host.remove();}})();
    return closing;
  }
  return Object.freeze({host,start,destroy,setFull,setTheme,markStale,
    focusPrimary:()=>original.focus(),
    focusFullscreen:()=>buttons.get('fullscreen')?.[0]?.focus(),
    get fullscreen(){return fullscreen;},nodeCount});
}
