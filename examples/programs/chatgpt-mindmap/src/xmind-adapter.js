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
    // Use the original SDK zoom and its own scroll container. Do not render a
    // substitute map. On a narrow viewport, legibility takes precedence over
    // fitting an entire multi-branch workbook into illegible microtext.
    const narrow=canvas.clientWidth<420;
    const minimumZoom=narrow?100:50;
    const widthAvailable=Math.max(120,canvas.clientWidth-32);
    const heightAvailable=Math.max(120,canvas.clientHeight-32);
    const bounds=()=>[...mount.querySelectorAll('.topic')]
      .map(node=>node.getBoundingClientRect()).filter(rect=>rect.width&&rect.height);
    const span=rects=>({
      left:Math.min(...rects.map(r=>r.left)),
      right:Math.max(...rects.map(r=>r.right)),
      top:Math.min(...rects.map(r=>r.top)),
      bottom:Math.max(...rects.map(r=>r.bottom))
    });
    for(let pass=0;pass<3;pass++){
      if(disposed)return;
      const rects=bounds();
      if(!rects.length)return;
      const box=span(rects);
      const ratio=Math.min(widthAvailable/(box.right-box.left),
        heightAvailable/(box.bottom-box.top));
      // The first pass computes the normal fit; later passes correct actual
      // SDK geometry after zoom. Do not zoom in again on correction passes.
      if(pass>0&&ratio>=.99)break;
      if(pass>0&&ratio>1)break;
      const previous=c.getZoomPencentage();
      const suggested=Math.floor(previous*ratio*(pass===0?1:.98));
      const next=Math.max(minimumZoom,Math.min(200,suggested));
      if(Math.abs(next-previous)<1)break;
      c.zoom(next);
      await settled();
    }
    if(disposed)return;
    const scroller=mount.querySelector('.workbook-item')||canvas;
    const rects=bounds();
    if(!rects.length)return;
    const box=canvas.getBoundingClientRect();
    if(narrow){
      // Give the root topic and first branches a readable starting position.
      // The rest stays accessible using native XMind drag and wheel scrolling.
      const root=mount.querySelector('.topic')?.getBoundingClientRect();
      if(root){
        scroller.scrollLeft+=root.left-(box.left+16);
        scroller.scrollTop+=(root.top+root.bottom)/2-(box.top+box.height/2);
      }
    }else{
      const union=span(rects);
      scroller.scrollLeft+=(union.left+union.right)/2-(box.left+box.width/2);
      scroller.scrollTop+=(union.top+union.bottom)/2-(box.top+box.height/2);
    }
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
