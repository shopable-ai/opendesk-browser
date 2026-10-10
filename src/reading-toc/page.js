import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {READING_TOC_SITE_STORE,READING_TOC_TOOL_ID,READING_TOC_PROTOCOL,
  websiteOrigin,tocGrantAllowed} from './policy.js';
import {createReadingTocIndex} from './model.js';
import {createReadingTocView} from './view.js';

// Verify the actual extension host document, not the raw URL string:
// tool.html deliberately adds a hostInstanceId query on its first navigation.
export function isReadingTocToolSender(api,sender) {
  if(!api?.runtime?.id || sender?.id!==api.runtime.id || typeof sender.url!=='string')return false;
  try {
    const source=new URL(sender.url), shell=new URL(api.runtime.getURL('ui/tool.html'));
    const token=source.searchParams.get('hostInstanceId');
    return source.protocol===shell.protocol && source.host===shell.host && source.pathname===shell.pathname &&
      !source.hash && source.searchParams.size===1 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token||'');
  }catch{return false;}
}

// A single trusted content-script controller lives in the top document only.
// The sandbox package never runs in the webpage and never obtains DOM handles.
export function initReadingToc({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}) {
  if(!api?.storage?.local||!doc||!win||win.top!==win)return null;
  const index=createReadingTocIndex(doc);
  let enabled=false,disposed=false,view=null,observer=null,rebuildTimer=0,spyFrame=0,refreshEpoch=0;
  let activeId='',href=win.location.href,navEpoch=0,settled=null;
  const removers=[];
  const listen=(target,type,fn,option)=>{target.addEventListener(type,fn,option);removers.push(()=>target.removeEventListener(type,fn,option));};
  const scrollRoot=element=>{
    let parent=element.parentElement;
    while(parent&&parent!==doc.body&&parent!==doc.documentElement){
      const overflow=win.getComputedStyle(parent).overflowY;
      if(/auto|scroll|overlay/.test(overflow)&&parent.scrollHeight>parent.clientHeight+6)return parent;
      parent=parent.parentElement;
    }
    return doc.scrollingElement||doc.documentElement;
  };
  const isPageRoot=root=>root===doc.scrollingElement||root===doc.documentElement||root===doc.body;
  const topOf=root=>isPageRoot(root)?0:root.getBoundingClientRect().top;
  const topOffset=root=>isPageRoot(root)?88:20;
  const maxScroll=root=>Math.max(0,root.scrollHeight-root.clientHeight);
  const redraw=()=>{if(view)view.render(index.snapshot(activeId));};
  function updateFromScroll() {
    spyFrame=0;
    if(!enabled||!index.items.length||disposed||settled?.running)return;
    let closest=null;
    for(const item of index.items){
      if(!item.element.isConnected)continue;
      const root=scrollRoot(item.element);
      const top=item.element.getBoundingClientRect().top-topOf(root)-topOffset(root);
      if(top<=8)closest=item;
      else if(!closest)closest=item;
    }
    if(closest&&closest.id!==activeId){activeId=closest.id;redraw();}
  }
  function scheduleSpy(){if(!spyFrame)spyFrame=win.requestAnimationFrame(updateFromScroll);}
  function rebuild() {
    rebuildTimer=0;if(!enabled||disposed)return;
    if(win.location.href!==href){href=win.location.href;activeId='';void refreshPolicy();return;}
    index.rebuild();
    if(!index.items.some(row=>row.id===activeId))activeId=index.items[0]?.id||'';
    redraw();scheduleSpy();
  }
  function scheduleRebuild() {
    if(!enabled||disposed)return;
    win.clearTimeout(rebuildTimer);
    rebuildTimer=win.setTimeout(rebuild,280); // Collapse streaming token bursts.
  }
  function stop() {
    enabled=false;navEpoch++;settled=null;
    observer?.disconnect();observer=null;
    if(view){view.dispose();view=null;}
    win.clearTimeout(rebuildTimer);rebuildTimer=0;
    if(spyFrame)win.cancelAnimationFrame(spyFrame);spyFrame=0;
    for(const remove of removers.splice(0))remove();
    activeId='';
  }
  function start(showWidget) {
    if(!enabled){
      enabled=true;href=win.location.href;
      observer=new MutationObserver(scheduleRebuild);
      observer.observe(doc.body||doc.documentElement,{childList:true,subtree:true,characterData:true,
        attributes:true,attributeFilter:['hidden','aria-hidden']});
      listen(doc,'scroll',scheduleSpy,true);
      listen(win,'scroll',scheduleSpy,{passive:true});
      listen(doc,'wheel',()=>{navEpoch++;settled=null;},{passive:true,capture:true});
      listen(doc,'touchstart',()=>{navEpoch++;settled=null;},{passive:true,capture:true});
      listen(doc,'pointerdown',()=>{navEpoch++;settled=null;},true);
      listen(doc,'keydown',()=>{navEpoch++;settled=null;},true);
      listen(win,'popstate',scheduleRebuild);
      rebuild();
    }else if(href!==win.location.href){
      // SPA navigation replaces document content without recreating the content script.
      // Clear the old selection and regenerate the same trusted index in-place.
      href=win.location.href;activeId='';settled=null;navEpoch++;
      index.rebuild();redraw();scheduleSpy();
    }
    if(showWidget&&!view)view=createReadingTocView({doc,onNavigate:(id,sourceId)=>void navigate(id,sourceId)});
    if(!showWidget&&view){view.dispose();view=null;}
    redraw();
  }
  async function refreshPolicy() {
    const token=++refreshEpoch;
    try{
      const stored=await api.storage.local.get([SIDEBAR_TOOL_STORE,READING_TOC_SITE_STORE]);
      if(disposed||token!==refreshEpoch)return;
      const installed=stored[SIDEBAR_TOOL_STORE],sites=stored[READING_TOC_SITE_STORE];
      const ids=Array.isArray(installed)?installed.filter(row=>row?.capabilities?.includes('page.toc')).map(row=>row.id):[];
      const any=ids.some(id=>tocGrantAllowed(installed,sites,id,win.location.href));
      const official=tocGrantAllowed(installed,sites,READING_TOC_TOOL_ID,win.location.href);
      if(!any){if(enabled)stop();return;}
      start(official);
    }catch{if(enabled)stop();}
  }
  async function navigate(id,sourceId) {
    if(!enabled||disposed||typeof id!=='string'||typeof sourceId!=='string')return {ok:false,error:'目录不可用'};
    const item=index.resolve(id,sourceId);
    if(!item)return {ok:false,error:'章节已更新'};
    // Chrome can suspend requestAnimationFrame in a background tab. A hidden
    // document cannot prove that a requested title is in the readable viewport.
    if(doc.visibilityState==='hidden')return {ok:false,error:'请切回目标网页后再定位章节'};
    const token=++navEpoch,startedHref=win.location.href,root=scrollRoot(item.element);
    const desired=()=>Math.max(0,Math.min(maxScroll(root),root.scrollTop+
      item.element.getBoundingClientRect().top-topOf(root)-topOffset(root)));
    // Bounded frame wait: never keep the Chrome messaging port open indefinitely
    // when rAF is suspended, the page is frozen, or visibility changes.
    const waitForPaint=()=>new Promise(resolve=>{
      let done=false,first=0,second=0;
      const timeout=win.setTimeout(()=>finish(false),650);
      function finish(painted){
        if(done)return;done=true;win.clearTimeout(timeout);
        if(first)win.cancelAnimationFrame(first);
        if(second)win.cancelAnimationFrame(second);
        resolve(painted);
      }
      first=win.requestAnimationFrame(()=>{second=win.requestAnimationFrame(()=>finish(true));});
    });
    settled={running:true,id,token};
    const target=desired();
    if(isPageRoot(root))win.scrollTo({top:target,behavior:'instant'});
    else root.scrollTo({top:target,behavior:'instant'});
    // Scroll acceptance requires a *measured* visible heading, not merely a
    // successful scrollTo call or an attempted correction.
    const revision=index.revision;
    const same=()=>token===navEpoch&&!disposed&&enabled&&win.location.href===startedHref&&
      revision===index.revision&&index.resolve(id,sourceId)===item;
    const visibleTarget=()=>{
      const rect=item.element.getBoundingClientRect();
      const viewport=isPageRoot(root)?{top:0,bottom:win.innerHeight}:root.getBoundingClientRect();
      const readableTop=viewport.top+topOffset(root)-12;
      const readableBottom=viewport.bottom-12;
      return rect.top>=readableTop-3&&rect.top<readableBottom&&rect.bottom>readableTop-18;
    };
    for(let attempt=0;attempt<3;attempt++){
      const painted=await waitForPaint();
      if(!same()||doc.visibilityState==='hidden'){
        if(token===navEpoch)settled=null;
        return {ok:false,error:'网页或章节已变化，已取消定位'};
      }
      if(!painted){
        if(token===navEpoch)settled=null;
        return {ok:false,error:'滚动帧未完成，无法确认章节进入可读区域'};
      }
      if(visibleTarget()){
        activeId=id;settled={running:false,id,position:isPageRoot(root)?win.scrollY??root.scrollTop:root.scrollTop};
        redraw();
        return {ok:true,id,sourceId};
      }
      if(attempt<2){
        const correction=desired();
        if(isPageRoot(root))win.scrollTo({top:correction,behavior:'instant'});
        else root.scrollTo({top:correction,behavior:'instant'});
      }
    }
    if(token===navEpoch)settled=null;
    return {ok:false,error:'未确认目标章节进入可读区域'};
  }
  async function handle(message,sender) {
    if(!isReadingTocToolSender(api,sender)||
       message?.protocol!==READING_TOC_PROTOCOL||message?.expectedUrl!==win.location.href ||
       typeof message?.toolId!=='string')return {ok:false,error:'来源或文档已变化'};
    const before=win.location.href;
    const stored=await api.storage.local.get([SIDEBAR_TOOL_STORE,READING_TOC_SITE_STORE]);
    if(disposed||before!==win.location.href||!tocGrantAllowed(stored[SIDEBAR_TOOL_STORE],
      stored[READING_TOC_SITE_STORE],message.toolId,before))return {ok:false,error:'工具或网站未授权'};
    if(!enabled)start(tocGrantAllowed(stored[SIDEBAR_TOOL_STORE],
      stored[READING_TOC_SITE_STORE],READING_TOC_TOOL_ID,before));
    if(message.operation==='toc.snapshot'){
      if(!index.items.length)index.rebuild();
      return {ok:true,data:{...index.snapshot(activeId),url:win.location.href}};
    }
    if(message.operation==='toc.navigate'){
      if(!/^h-\d{1,8}$/.test(message.id||'')||!/^s-\d{1,8}$/.test(message.sourceId||''))
        return {ok:false,error:'章节身份无效'};
      const result=await navigate(message.id,message.sourceId);
      return {...result,...(result.ok?{data:result}:{})};
    }
    return {ok:false,error:'不支持的目录操作'};
  }
  const messageListener=(message,sender,sendResponse)=>{
    if(message?.protocol!==READING_TOC_PROTOCOL)return false;
    void handle(message,sender).then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message||error).slice(0,150)}));
    return true;
  };
  api.runtime.onMessage.addListener(messageListener);
  const storageListener=(changes,area)=>{
    if(area==='local'&&(Object.hasOwn(changes,READING_TOC_SITE_STORE)||
       Object.hasOwn(changes,SIDEBAR_TOOL_STORE)))void refreshPolicy();
  };
  api.storage.onChanged.addListener(storageListener);
  const close=()=>{
    if(disposed)return;disposed=true;refreshEpoch++;
    api.runtime.onMessage.removeListener(messageListener);
    api.storage.onChanged.removeListener(storageListener);
    stop();win.removeEventListener('pagehide',close);
  };
  win.addEventListener('pagehide',close,{once:true});
  if(doc.body)void refreshPolicy();
  else doc.addEventListener('DOMContentLoaded',()=>void refreshPolicy(),{once:true});
  return Object.freeze({dispose:close,refreshPolicy,read:()=>index.snapshot(activeId)});
}
