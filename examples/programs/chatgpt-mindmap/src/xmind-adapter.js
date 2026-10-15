import {mindTreeToXmindBlob} from './xmind-convert.js';

// Read-only subset of Mindbank xmind-renderer.ts, blob
// 6a061bd15c04690d1f5418094a9b942704a1e965 at station@b76abf4b95e34c1234a33927051ea13165d92715.
// Reuses Workbook/Topic/Dumper conversion, createWorkbookEditor, zoom,
// collapseBranch/extendBranch and close. No script injection or alternate engine.
export function requireXmindRuntime(scope=globalThis){
  if(!['JSZip','Workbook','Topic','Dumper'].every(key=>typeof scope[key]==='function')||
    typeof scope._SB_?.createWorkbookEditor!=='function'){
    throw Object.assign(new Error('XMind 固定运行资源尚未接入，导图未启用。'),
      {code:'E_XMIND_RUNTIME_UNAVAILABLE'});
  }
  return scope;
}

export function createXmindRenderer({window,canvas,tree,skinMode='light'}){
  const sdk=requireXmindRuntime(window);
  let controller=null,mount=null,disposed=false,folded=false,closing=null;
  let appliedSkin=skinMode,desiredSkin=skinMode;
  let operations=Promise.resolve();
  const frame=()=>new Promise(resolve=>{
    // Background documents may suspend rAF; Stop must still finish.
    const done=()=>{window.clearTimeout(timer);window.cancelAnimationFrame(id);resolve();};
    const timer=window.setTimeout(done,40),id=window.requestAnimationFrame(done);
  });
  const settled=async()=>{await frame();await frame();};
  async function render(defaultFolded,{preserve=false,mode=appliedSkin}={}){
    if(!canvas.isConnected||canvas.clientWidth<=0||canvas.clientHeight<=0)
      throw Object.assign(new Error('XMind 画布尚不可测量'),{code:'E_XMIND_MOUNT'});
    const previous=controller,previousMount=mount;
    const previousZoom=preserve&&previous?previous.getZoomPencentage():null;
    const scroller=previousMount?.querySelector('.workbook-item');
    const scroll=preserve&&scroller?{left:scroller.scrollLeft,top:scroller.scrollTop}:null;
    const blob=await mindTreeToXmindBlob(sdk,tree,mode,{defaultFolded});
    if(disposed)return;
    // Port of Mindbank's staging-mount/controller swap and scroll restoration.
    const nextMount=canvas.ownerDocument.createElement('div');
    nextMount.style.cssText='position:absolute;inset:0;overflow:hidden;opacity:0;pointer-events:none';
    canvas.append(nextMount);
    let next;
    try{
      next=await sdk._SB_.createWorkbookEditor(blob,nextMount,
        {languageCode:'zh-CN',resourceUrlPrefix:'',password:''});
      if(disposed){await settled();await next.close();nextMount.remove();return;}
      next.switchSheetTo(0);await settled();
      if(previousZoom!==null){next.zoom(previousZoom);await settled();}
      if(disposed){await next.close();nextMount.remove();return;}
      const nextScroller=nextMount.querySelector('.workbook-item');
      if(scroll&&nextScroller){nextScroller.scrollLeft=scroll.left;nextScroller.scrollTop=scroll.top;}
      // Same action-area repair used in Mindbank; no topic geometry is drawn here.
      for(const area of nextMount.querySelectorAll('.collapseextend [data-name="action-area"]')){
        area.style.display='inline';area.style.pointerEvents='all';
      }
      controller=next;mount=nextMount;
      nextMount.style.opacity='1';nextMount.style.pointerEvents='auto';
      if(previous){await settled();await previous.close();}
      previousMount?.remove();
    }catch(error){
      if(next&&next!==controller)await next.close();
      if(nextMount!==mount)nextMount.remove();
      throw error;
    }
  }
  const ready=render(false);
  function command(fn){
    const operation=operations.then(async()=>{
      await ready;
      if(disposed||!controller)return;
      await fn(controller);await settled();
    });
    // A failed UI command does not poison later close; caller receives the error.
    operations=operation.catch(()=>{});
    return operation;
  }
  function fit(){return command(async c=>{
    // This exact SDK has no fitMap/fit/center. Measure its rendered topics and
    // call real SDK zoom, then center its own scroll container. Never redraw.
    const topics=[...mount.querySelectorAll('.topic')].map(n=>n.getBoundingClientRect())
      .filter(r=>r.width&&r.height);
    if(!topics.length)return;
    const width=Math.max(...topics.map(r=>r.right))-Math.min(...topics.map(r=>r.left));
    const height=Math.max(...topics.map(r=>r.bottom))-Math.min(...topics.map(r=>r.top));
    const ratio=Math.min((canvas.clientWidth-32)/width,(canvas.clientHeight-32)/height);
    c.zoom(Math.max(50,Math.min(200,Math.floor(c.getZoomPencentage()*ratio))));
    await settled();
    if(disposed)return;
    const scroller=mount.querySelector('.workbook-item')||canvas;
    const bounds=[...mount.querySelectorAll('.topic')].map(n=>n.getBoundingClientRect())
      .filter(r=>r.width&&r.height);
    if(!bounds.length)return;
    const box=canvas.getBoundingClientRect();
    scroller.scrollLeft+=(Math.min(...bounds.map(r=>r.left))+Math.max(...bounds.map(r=>r.right)))/2-(box.left+box.width/2);
    scroller.scrollTop+=(Math.min(...bounds.map(r=>r.top))+Math.max(...bounds.map(r=>r.bottom)))/2-(box.top+box.height/2);
  });}
  function destroy(){
    if(closing)return closing;
    disposed=true;resize?.disconnect();
    closing=(async()=>{
      try{await ready;}catch{/* Initialization rejection is reported by ready. */}
      await operations;
      const current=controller;controller=null;
      // Drain SDK's deferred actions before closing, including late creation.
      if(current){await settled();await current.close();}
      mount?.remove();mount=null;canvas.replaceChildren();
    })();
    return closing;
  }
  const resize=typeof window.ResizeObserver==='function'?new window.ResizeObserver(()=>{
    if(!disposed)fit().catch(()=>{});
  }):null;
  resize?.observe(canvas);
  return Object.freeze({ready,fit,destroy,
    setTheme(mode){
      if(mode!=='light'&&mode!=='dark')return Promise.reject(new Error('E_XMIND_THEME'));
      if(disposed)return Promise.resolve();
      // Update the requested skin before queuing so rapid light/dark/light
      // switches cannot finish on an obsolete theme.
      desiredSkin=mode;
      return command(async()=>{
        if(appliedSkin===desiredSkin)return;
        const target=desiredSkin;
        await render(folded,{preserve:true,mode:target});
        appliedSkin=target;
      }).then(()=>fit());
    },
    zoomBy:factor=>command(c=>c.zoom(Math.max(50,Math.min(400,c.getZoomPencentage()*factor)))),
    async toggleAll(){
      await command(async c=>{
        const next=!folded;
        // These SDK commands act on selection; selection can be empty in a
        // read-only map. Rebuild with original Workbook branch flags to make
        // the toolbar's ALL-branches promise true, preserving zoom/scroll.
        if(next)c.collapseBranch();else c.extendBranch();await settled();
        await render(next,{preserve:true});folded=next;
      });
      await fit();return folded;
    },
    get nodeCount(){return canvas.querySelectorAll('.topic').length;}
  });
}
