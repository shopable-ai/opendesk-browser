import {isSidebarToolHostSender} from '../sidebar-tools/sender.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolLifecycleChanged} from '../ui/sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {READING_TOC_SITE_STORE,READING_TOC_TOOL_ID,READING_TOC_PROTOCOL,
  websiteOrigin,tocGrantAllowed,readingTocPlacementKey,READING_TOC_VISIBILITY_STORE,
  readingTocDisplayState,READING_TOC_PAGE_RULES_STORE,readingTocPageAllowed} from './policy.js';
import {createReadingTocIndex} from './model.js';
import {createReadingTocView} from './view.js';
import {UI_LOCALE_STORE,canonicalUiLocale,UI_LOCALE_DEFAULT} from '../ui/app-localization.js';

// Verify the actual extension host document, not the raw URL string:
// tool.html deliberately adds a hostInstanceId query on its first navigation.

// A single trusted content-script controller lives in the top document only.
// The sandbox package never runs in the webpage and never obtains DOM handles.
export function initReadingToc({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}) {
  if(!api?.storage?.local||!doc||!win||win.top!==win)return null;
  const index=createReadingTocIndex(doc);
  let enabled=false,disposed=false,suspended=false,view=null,observer=null,rebuildTimer=0,spyFrame=0,refreshEpoch=0;
  let policyRetryTimer=0,policyFailures=0;
  let activeId='',href=win.location.href,navEpoch=0,settled=null,knownIds=[],viewEpoch=null;
  let uiLocale=UI_LOCALE_DEFAULT;
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
  function topOffset(root,element) {
    const baseline=isPageRoot(root)?88:20;
    if(!doc.elementsFromPoint||!element)return baseline;
    const top=topOf(root),bounds=element.getBoundingClientRect();
    const x=Math.max(1,Math.min(win.innerWidth-1,bounds.left+Math.min(20,bounds.width/2)));
    let offset=baseline;
    // Measure actual fixed/sticky chrome at the content's horizontal position.
    // A constant offset cannot account for article headers or inner scrollers.
    for(let pass=0;pass<8;pass++){
      const edge=offset;
      for(const y of [top+4,top+edge-1,top+edge+4])for(const hit of doc.elementsFromPoint(x,y)){
        for(let node=hit,depth=0;node&&depth<12;node=node.parentElement,depth++){
          if(node.closest?.('[data-opendesk-toc-root]'))continue;
          const position=win.getComputedStyle(node).position;
          if(position!=='fixed'&&position!=='sticky')continue;
          const rect=node.getBoundingClientRect();
          if(rect.top<=top+edge+4&&rect.bottom>top&&rect.height<win.innerHeight/2)
            offset=Math.max(offset,rect.bottom-top+12);
        }
      }
      if(offset===edge)break;
    }
    return offset;
  }
  const maxScroll=root=>Math.max(0,root.scrollHeight-root.clientHeight);
  const redraw=()=>{if(view)view.render(index.snapshot(activeId));};
  function updateFromScroll() {
    spyFrame=0;
    if(!enabled||!index.items.length||disposed||settled?.running)return;
    let closest=null;
    const offsets=new Map();
    for(const item of index.items){
      if(!item.element.isConnected)continue;
      const root=scrollRoot(item.element);
      if(!offsets.has(root))offsets.set(root,topOffset(root,item.element));
      const top=item.element.getBoundingClientRect().top-topOf(root)-offsets.get(root);
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
  function start(showWidget,placementKey=null,initialPlacement=null,installEpoch=null) {
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
    if(view&&viewEpoch!==installEpoch){view.dispose();view=null;}
    if(showWidget&&!view){
      viewEpoch=installEpoch;
      const key=placementKey||readingTocPlacementKey(win.location.href);
      view=createReadingTocView({doc,win,initialPlacement,initialLocale:uiLocale,
        onNavigate:(id,sourceId)=>void navigate(id,sourceId,READING_TOC_TOOL_ID,installEpoch),
        onPlacementChange:next=>{
          if(disposed||!enabled||!key||readingTocPlacementKey(win.location.href)!==key)return;
          // Persist only at drag end, keyboard step or explicit reset, never
          // for each pointer move. Position is private to the exact origin.
          try{
            const operation=next?api.storage.local.set({[key]:next}):api.storage.local.remove(key);
            void Promise.resolve(operation).catch(()=>{});
          }catch{/* The TOC remains movable even if preference storage fails. */}
        }});
    }
    if(!showWidget&&view){view.dispose();view=null;}
    redraw();
  }
  async function refreshPolicy() {
    if(suspended||disposed)return;
    win.clearTimeout(policyRetryTimer);policyRetryTimer=0;
    const token=++refreshEpoch;
    try{
      const currentUrl=win.location.href,key=readingTocPlacementKey(currentUrl);
      const keys=[SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE,READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE,
        READING_TOC_PAGE_RULES_STORE,UI_LOCALE_STORE,...(key?[key]:[])];
      const stored=await api.storage.local.get(keys);
      if(disposed||suspended||token!==refreshEpoch)return;
      policyFailures=0;
      uiLocale=canonicalUiLocale(stored[UI_LOCALE_STORE])||UI_LOCALE_DEFAULT;
      view?.setLocale(uiLocale);
      if(win.location.href!==currentUrl){void refreshPolicy();return;}
      const installed=stored[SIDEBAR_TOOL_STORE],sites=stored[READING_TOC_SITE_STORE];
      const ids=Array.isArray(installed)?installed.filter(row=>row?.capabilities?.includes('page.toc')).map(row=>row.id):[];
      knownIds=ids;
      const pageRules=stored[READING_TOC_PAGE_RULES_STORE];
      const any=ids.some(id=>tocGrantAllowed(installed,sites,id,currentUrl,stored[SIDEBAR_TOOL_ENABLE_STORE])&&
        readingTocPageAllowed(pageRules,id,currentUrl));
      const official=tocGrantAllowed(installed,sites,READING_TOC_TOOL_ID,currentUrl,stored[SIDEBAR_TOOL_ENABLE_STORE])&&
        readingTocPageAllowed(pageRules,READING_TOC_TOOL_ID,currentUrl)&&
        readingTocDisplayState(stored[READING_TOC_VISIBILITY_STORE],READING_TOC_TOOL_ID,currentUrl).show;
      if(!any){if(enabled)stop();return;}
      start(official,key,key?stored[key]:null,stored[TOOL_REVOCATION_EPOCHS_STORE]?.[READING_TOC_TOOL_ID]??null);
    }catch{
      if(token!==refreshEpoch||disposed||suspended)return;
      if(enabled)stop(); // Policy storage failed: never serve a stale authorized index.
      const delay=Math.min(8000,600*Math.pow(2,Math.min(policyFailures++,4)));
      policyRetryTimer=win.setTimeout(()=>{policyRetryTimer=0;void refreshPolicy();},delay);
    }
  }
  async function navigate(id,sourceId,toolId=READING_TOC_TOOL_ID,requestEpoch) {
    const permissionEpoch=navEpoch,expectedUrl=win.location.href;
    const grants=await api.storage.local.get([SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE,READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE]);
    if(disposed||suspended||permissionEpoch!==navEpoch||expectedUrl!==win.location.href||
       !tocGrantAllowed(grants[SIDEBAR_TOOL_STORE],grants[READING_TOC_SITE_STORE],toolId,expectedUrl,grants[SIDEBAR_TOOL_ENABLE_STORE])||
       !readingTocPageAllowed(grants[READING_TOC_PAGE_RULES_STORE],toolId,expectedUrl))
      return {ok:false,error:'工具或网站授权已变化'};
    const installEpoch=grants[TOOL_REVOCATION_EPOCHS_STORE]?.[toolId]??null;
    if(requestEpoch!==undefined&&requestEpoch!==installEpoch)return {ok:false,error:'工具请求已撤销'};
    if(!enabled||disposed||typeof id!=='string'||typeof sourceId!=='string')return {ok:false,error:'目录不可用'};
    const item=index.resolve(id,sourceId);
    if(!item)return {ok:false,error:'章节已更新'};
    // Chrome can suspend requestAnimationFrame in a background tab. A hidden
    // document cannot prove that a requested title is in the readable viewport.
    if(doc.visibilityState==='hidden')return {ok:false,error:'请切回目标网页后再定位章节'};
    const token=++navEpoch,startedHref=win.location.href,root=scrollRoot(item.element);
    const desired=()=>Math.max(0,Math.min(maxScroll(root),root.scrollTop+
      item.element.getBoundingClientRect().top-topOf(root)-topOffset(root,item.element)));
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
      const readableTop=viewport.top+topOffset(root,item.element)-12;
      const readableBottom=viewport.bottom-12;
      const positioned=rect.top>=readableTop-3&&rect.top<readableBottom&&rect.bottom>readableTop-18;
      if(!positioned||!doc.elementFromPoint)return positioned;
      let lines=[rect];
      if(doc.createRange){
        const range=doc.createRange();range.selectNodeContents(item.element);
        const textRects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
        if(textRects.length)lines=textRects.slice(0,6);
      }
      return lines.every(line=>{
        const y=line.top+(line.bottom-line.top)/2;
        if(y<readableTop||y>=readableBottom||y<0||y>=win.innerHeight)return false;
        const width=line.width??line.right-line.left;
        return [line.left+Math.min(8,width/4),line.left+width/2,line.left+width-Math.min(8,width/4)].every(x=>{
          if(x<0||x>=win.innerWidth)return false;
          const hit=doc.elementFromPoint(x,y);
          return Boolean(hit&&(hit===item.element||item.element.contains(hit)));
        });
      });
    };
    for(let attempt=0;attempt<3;attempt++){
      const painted=await waitForPaint();
      const confirmed=await api.storage.local.get([SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE,READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE]);
      if(!same()||doc.visibilityState==='hidden'||
        (confirmed[TOOL_REVOCATION_EPOCHS_STORE]?.[toolId]??null)!==installEpoch||
        !tocGrantAllowed(confirmed[SIDEBAR_TOOL_STORE],confirmed[READING_TOC_SITE_STORE],toolId,startedHref,confirmed[SIDEBAR_TOOL_ENABLE_STORE])||
        !readingTocPageAllowed(confirmed[READING_TOC_PAGE_RULES_STORE],toolId,startedHref)){
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
    if(!isSidebarToolHostSender(api,sender,message?.toolId)||
       message?.protocol!==READING_TOC_PROTOCOL||message?.expectedUrl!==win.location.href ||
       typeof message?.toolId!=='string')return {ok:false,error:'来源或文档已变化'};
    const before=win.location.href,permissionEpoch=navEpoch;
    const stored=await api.storage.local.get([SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE,READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE]);
    if(disposed||suspended||permissionEpoch!==navEpoch||before!==win.location.href||!tocGrantAllowed(stored[SIDEBAR_TOOL_STORE],
      stored[READING_TOC_SITE_STORE],message.toolId,before,stored[SIDEBAR_TOOL_ENABLE_STORE])||
      !readingTocPageAllowed(stored[READING_TOC_PAGE_RULES_STORE],message.toolId,before))
      return {ok:false,error:'工具、网站或当前页面未授权'};
    if((message.installEpoch??null)!==(stored[TOOL_REVOCATION_EPOCHS_STORE]?.[message.toolId]??null))
      return {ok:false,error:'工具请求已撤销'};
    if(!enabled)await refreshPolicy();
    if(!enabled)return {ok:false,error:'目录未启用'};
    if(message.operation==='toc.snapshot'){
      if(message.forceRefresh===true||!index.items.length){
        index.rebuild();
        if(!index.items.some(row=>row.id===activeId))activeId=index.items[0]?.id||'';
        redraw();scheduleSpy();
      }
      return {ok:true,data:{...index.snapshot(activeId),url:win.location.href}};
    }
    if(message.operation==='toc.navigate'){
      if(!/^h-\d{1,8}$/.test(message.id||'')||!/^s-\d{1,8}$/.test(message.sourceId||''))
        return {ok:false,error:'章节身份无效'};
      const result=await navigate(message.id,message.sourceId,message.toolId,message.installEpoch??null);
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
    if(area!=='local')return;
    if(Object.hasOwn(changes,UI_LOCALE_STORE)){
      uiLocale=canonicalUiLocale(changes[UI_LOCALE_STORE].newValue)||UI_LOCALE_DEFAULT;
      view?.setLocale(uiLocale); // Presentation-only: no policy or index invalidation.
    }
    if((knownIds.length?knownIds.some(id=>sidebarToolLifecycleChanged(changes,id)):
       [SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE].some(key=>Object.hasOwn(changes,key)))||
       Object.hasOwn(changes,READING_TOC_SITE_STORE)||
       Object.hasOwn(changes,READING_TOC_PAGE_RULES_STORE)||
       Object.hasOwn(changes,SIDEBAR_TOOL_STORE)){navEpoch++;settled=null;stop();void refreshPolicy();return;}
    if(Object.hasOwn(changes,READING_TOC_VISIBILITY_STORE)){
      // Appearance changes never revoke page.toc authority or cancel navigation.
      void refreshPolicy();return;
    }
    const key=readingTocPlacementKey(win.location.href);
    if(key&&Object.hasOwn(changes,key))view?.setPlacement(changes[key].newValue);
  };
  api.storage.onChanged.addListener(storageListener);
  const close=()=>{
    if(disposed)return;disposed=true;refreshEpoch++;
    win.clearTimeout(policyRetryTimer);policyRetryTimer=0;
    api.runtime.onMessage.removeListener(messageListener);
    api.storage.onChanged.removeListener(storageListener);
    stop();win.removeEventListener('pagehide',onPageHide);win.removeEventListener('pageshow',onPageShow);
  };
  const onPageHide=event=>{
    if(event.persisted){suspended=true;refreshEpoch++;win.clearTimeout(policyRetryTimer);policyRetryTimer=0;stop();}else close();
  };
  const onPageShow=event=>{
    if(event.persisted&&!disposed){suspended=false;void refreshPolicy();}
  };
  win.addEventListener('pagehide',onPageHide);win.addEventListener('pageshow',onPageShow);
  if(doc.body)void refreshPolicy();
  else doc.addEventListener('DOMContentLoaded',()=>void refreshPolicy(),{once:true});
  return Object.freeze({dispose:close,refreshPolicy,read:()=>index.snapshot(activeId)});
}
