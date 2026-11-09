import {createReadingTocIndex} from '../../trusted/model.js';
import {createReadingTocView} from '../../trusted/view.js';
import {originStorageKey,preferenceState,updateOrigin} from './settings.js';

// Adapted from the existing TOC controller: all DOM algorithms remain shared.
export function createDynamicReadingToc({bridge,owner,doc=globalThis.document,win=doc.defaultView,
  createIndex=createReadingTocIndex,createView=createReadingTocView}={}) {
  const index=createIndex(doc),removers=[],paintCancels=new Set(),writes=new Set();
  let enabled=false,disposed=false,view=null,observer=null,rebuildTimer=0,spyFrame=0,pollTimer=0;
  let activeId='',href=win.location.href,navEpoch=0,settled=null,policyFlight=null;
  let uiLocale='zh-CN',uiCatalog=null,originKey='',visible=false;
  let unsubscribe=null,appliedPlacement='',appliedCollapsed=false;
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);
    removers.push(()=>target.removeEventListener(type,fn,options));};
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
  function cancelNavigation(){navEpoch++;settled=null;for(const cancel of [...paintCancels])cancel();}
  function stop(){
    enabled=false;cancelNavigation();observer?.disconnect();observer=null;
    view?.dispose();view=null;win.clearTimeout(rebuildTimer);rebuildTimer=0;
    if(spyFrame)win.cancelAnimationFrame(spyFrame);spyFrame=0;
    for(const remove of removers.splice(0))remove();activeId='';
  }
  function close(){
    if(disposed)return Promise.allSettled([...writes]);disposed=true;stop();win.clearTimeout(pollTimer);pollTimer=0;
    win.removeEventListener('pagehide',failClosed);
    unsubscribe?.();unsubscribe=null;
    return Promise.allSettled([...writes]);
  }
  function failClosed(){close();owner.destroy();}
  function scheduleSpy(){if(enabled&&!disposed&&!spyFrame)spyFrame=win.requestAnimationFrame(updateFromScroll);}
  async function rebuild(){
    rebuildTimer=0;
    if(!await refreshPolicy()||!enabled||disposed)return;
    index.rebuild();cancelNavigation();
    if(!index.items.some(row=>row.id===activeId))activeId=index.items[0]?.id||'';
    redraw();scheduleSpy();
  }
  function scheduleRebuild(records){
    if(!enabled||disposed)return;
    // Our own render must not cause perpetual reindexing/navigation cancellation.
    if(Array.isArray(records)&&records.length&&records.every(record=>
      record.target?.closest?.('[data-opendesk-toc-root]')||
      (record.type==='childList'&&[...record.addedNodes,...record.removedNodes].length&&
       [...record.addedNodes,...record.removedNodes].every(node=>node.matches?.('[data-opendesk-toc-root]')))))return;
    win.clearTimeout(rebuildTimer);rebuildTimer=win.setTimeout(()=>void rebuild(),280);
  }
  function start(){
    enabled=true;
    observer=new win.MutationObserver(scheduleRebuild);
    observer.observe(doc.body||doc.documentElement,{childList:true,subtree:true,characterData:true,
      attributes:true,attributeFilter:['hidden','aria-hidden']});
    listen(doc,'scroll',scheduleSpy,true);listen(win,'scroll',scheduleSpy,{passive:true});
    for(const type of ['wheel','touchstart','pointerdown','keydown'])
      listen(doc,type,cancelNavigation,{passive:true,capture:true});
    listen(win,'popstate',scheduleRebuild);listen(win,'hashchange',scheduleRebuild);
    index.rebuild();activeId=index.items[0]?.id||'';scheduleSpy();
  }
  function saveOrigin(patch){
    const expected=href,key=originKey,origin=new URL(expected).origin;
    if(disposed||!enabled||win.location.href!==expected)return;
    // The CAS merge preserves migration markers and independent placement/collapse edits.
    const pending=updateOrigin(bridge.storage,key,origin,patch,()=>!disposed&&enabled&&href===expected&&win.location.href===expected)
      .catch(error=>{
        console.warn('[reading-toc] Page preference was not saved:',String(error?.code||error?.message||error).slice(0,180));
      })
      .finally(()=>writes.delete(pending));
    writes.add(pending);
  }
  async function readPolicy(){
    try{
      const expected=win.location.href;
      const context=await bridge.readContext(); // A failed authority read retires all resources.
      if(disposed)return false;
      const stored=await bridge.storage.get({key:'preferences',withEtag:true});
      if(disposed)return false;
      const state=preferenceState(stored.value,expected);
      const key=await originStorageKey(state.origin,win.crypto||globalThis.crypto);
      const record=(await bridge.storage.get({key,withEtag:true})).value;
      if(record&&record.origin!==state.origin)throw Error('Origin storage collision');
      if(disposed)return false;
      if(win.location.href!==expected){stop();return false;}
      if(doc.defaultView!==win||!doc.documentElement.isConnected){failClosed();return false;}
      if(href!==expected){stop();href=expected;}
      uiLocale=context.locale||'zh-CN';uiCatalog=context.catalog||null;
      originKey=key;visible=state.visible;
      if(!state.enabled){if(enabled)stop();return false;}
      if(!enabled)start();
      if(!visible&&view){view.dispose();view=null;}
      const nextPlacement=JSON.stringify(record?.placement??null),nextCollapsed=record?.collapsed===true;
      if(visible&&!view){
        view=createView({doc,win,initialLocale:uiLocale,initialCatalog:uiCatalog,
          initialPlacement:record?.placement,initialCollapsed:record?.collapsed===true,
          onNavigate:(id,sourceId)=>void navigate(id,sourceId),
          onPlacementChange:placement=>saveOrigin({placement}),
          onCollapseChange:collapsed=>saveOrigin({collapsed})});
        appliedPlacement=nextPlacement;appliedCollapsed=nextCollapsed;
      }
      view?.setLocale(uiLocale,uiCatalog);
      // Do not replay stored geometry every poll or fight a local pending write.
      // The shared view also protects active dragging when external values change.
      if(view&&!writes.size){
        if(nextPlacement!==appliedPlacement){view.setPlacement(record?.placement??null);appliedPlacement=nextPlacement;}
        if(nextCollapsed!==appliedCollapsed){view.setCollapsed(nextCollapsed);appliedCollapsed=nextCollapsed;}
      }
      redraw();return true;
    }catch{failClosed();return false;}
  }
  function refreshPolicy(){
    if(disposed)return Promise.resolve(false);
    if(!policyFlight)policyFlight=readPolicy().finally(()=>{policyFlight=null;});
    return policyFlight;
  }
  async function poll(){
    await refreshPolicy();
    if(!disposed)pollTimer=win.setTimeout(()=>void poll(),1500);
  }
  async function navigate(id,sourceId){
    const epoch=navEpoch,expected=win.location.href;
    if(!await refreshPolicy()||disposed||!enabled||epoch!==navEpoch||expected!==win.location.href)
      return {ok:false,error:'网页或权限已变化'};
    const item=index.resolve(id,sourceId);
    if(!item)return {ok:false,error:'章节已更新'};
    if(doc.visibilityState==='hidden')return {ok:false,error:'请切回目标网页后再定位章节'};
    const token=++navEpoch,startedHref=win.location.href,root=scrollRoot(item.element);
    const desired=()=>Math.max(0,Math.min(maxScroll(root),root.scrollTop+
      item.element.getBoundingClientRect().top-topOf(root)-topOffset(root,item.element)));
    // Bounded frame wait: never keep the Chrome messaging port open indefinitely
    // when rAF is suspended, the page is frozen, or visibility changes.
    const waitForPaint=()=>new Promise(resolve=>{
      let done=false,first=0,second=0;
      const timeout=win.setTimeout(()=>finish(false),650);
      paintCancels.add(cancel);
      function cancel(){finish(false);}
      function finish(painted){
        if(done)return;done=true;paintCancels.delete(cancel);win.clearTimeout(timeout);
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
      doc.defaultView===win&&doc.documentElement.isConnected&&
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
      const confirmed=await refreshPolicy();
      if(!confirmed||!same()||doc.visibilityState==='hidden'){
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
  async function handle(request){
    await refreshPolicy();
    if(disposed||href!==win.location.href)throw Error('目录不可用');
    const {operation,payload={}}=request||{};
    if(operation==='toc.snapshot'){
      if(payload.refresh===true&&enabled){await rebuild();if(disposed||href!==win.location.href)throw Error('目录不可用');}
      // Hidden affects only the overlay: sidebar snapshots remain available.
      return {...(enabled?index.snapshot(activeId):{items:[],sources:[],activeId:'',overview:{}}),url:href,settings:{origin:new URL(href).origin,
        page:preferenceState({},href).page,enabled,visible}};
    }
    if(operation==='toc.navigate')return navigate(payload.id,payload.sourceId);
    throw Error('不支持的目录操作');
  }
  owner.onDispose(close);
  win.addEventListener('pagehide',failClosed);
  const ready=(async()=>{
    try{
      unsubscribe=bridge.onRequest(handle);
      if(typeof unsubscribe!=='function')unsubscribe=null;
      await poll();
      return {state:disposed?'disposed':'active'};
    }catch(error){failClosed();throw error;}
  })();
  return Object.freeze({ready,dispose:close,refreshPolicy,navigate,handle});
}
