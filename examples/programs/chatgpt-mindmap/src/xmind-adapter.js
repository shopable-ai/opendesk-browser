import {mindTreeToXmindBlob} from './xmind-convert.js';

// Read-only subset of Mindbank xmind-renderer.ts, blob
// 6a061bd15c04690d1f5418094a9b942704a1e965 at station@b76abf4b95e34c1234a33927051ea13165d92715.
// Retains the original Workbook/Topic/Dumper/SDK renderer: never draws a substitute.
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
  let appliedSkin=skinMode,desiredSkin=skinMode,manualViewport=false;
  let operations=Promise.resolve(),lastWidth=0,lastHeight=0;
  const frame=()=>new Promise(resolve=>{
    const done=()=>{window.clearTimeout(timer);window.cancelAnimationFrame(id);resolve();};
    const timer=window.setTimeout(done,40),id=window.requestAnimationFrame(done);
  });
  const settled=async()=>{await frame();await frame();};
  const markManual=()=>{manualViewport=true;};
  canvas.addEventListener('pointerdown',markManual,{passive:true});
  canvas.addEventListener('wheel',markManual,{passive:true});

  function scrollerOf(root=mount){
    const candidate=root?.querySelector('.workbook-item');
    return candidate||canvas;
  }
  async function render(defaultFolded,{preserve=false,mode=appliedSkin}={}){
    if(!canvas.isConnected||canvas.clientWidth<=0||canvas.clientHeight<=0)
      throw Object.assign(new Error('XMind 画布尚不可测量'),{code:'E_XMIND_MOUNT'});
    const previous=controller,previousMount=mount;
    const previousZoom=preserve&&previous?previous.getZoomPencentage():null;
    const scroller=scrollerOf(previousMount);
    const scroll=preserve&&previous?{left:scroller.scrollLeft,top:scroller.scrollTop}:null;
    const blob=await mindTreeToXmindBlob(sdk,tree,mode,{defaultFolded});
    if(disposed)return;
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
      const nextScroller=scrollerOf(nextMount);
      if(scroll){nextScroller.scrollLeft=scroll.left;nextScroller.scrollTop=scroll.top;}
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
    operations=operation.catch(()=>{});
    return operation;
  }
  const rectangles=()=>[...mount.querySelectorAll('.topic')]
    .map(node=>node.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
  const span=rects=>({
    left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),
    top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))
  });
  function fit({resetManual=true}={}){
    if(resetManual)manualViewport=false;
    if(manualViewport)return Promise.resolve();
    return command(async c=>{
      if(disposed||!mount||canvas.clientWidth<100||canvas.clientHeight<100)return;
      const narrow=canvas.clientWidth<420;
      const minimumZoom=narrow?100:50;
      const widthAvailable=Math.max(100,canvas.clientWidth-(narrow?24:36));
      const heightAvailable=Math.max(120,canvas.clientHeight-36);
      // Two geometry corrections use actual laid-out SDK topics AFTER zoom.
      // No arbitrary fixed zoom value is substituted for measurement.
      for(let pass=0;pass<3;pass++){
        const rects=rectangles();
        if(!rects.length||disposed)return;
        const box=span(rects);
        const ratio=Math.min(widthAvailable/Math.max(1,box.right-box.left),
          heightAvailable/Math.max(1,box.bottom-box.top));
        if(pass>0&&ratio>=.98)break;
        const previous=c.getZoomPencentage();
        const desired=Math.round(previous*ratio*(pass===0?1:.98));
        const next=Math.max(minimumZoom,Math.min(narrow?140:180,desired));
        if(Math.abs(next-previous)<2)break;
        c.zoom(next);await settled();
      }
      if(disposed)return;
      const rects=rectangles();
      if(!rects.length)return;
      const bounds=canvas.getBoundingClientRect();
      const scroll=scrollerOf();
      if(narrow){
        const root=mount.querySelector('.topic')?.getBoundingClientRect();
        if(root){
          scroll.scrollLeft+=root.left-(bounds.left+18);
          scroll.scrollTop+=(root.top+root.bottom)/2-(bounds.top+bounds.height/2);
        }
      }else{
        const area=span(rects);
        scroll.scrollLeft+=(area.left+area.right-bounds.left-bounds.right)/2;
        scroll.scrollTop+=(area.top+area.bottom-bounds.top-bounds.bottom)/2;
      }
    }).then(()=>{
      if(!disposed){canvas.dataset.fitReady='true';canvas.dataset.fitWidth=String(canvas.clientWidth);}
    });
  }
  function reflow(){return settled().then(()=>manualViewport?undefined:fit({resetManual:false}));}
  function destroy(){
    if(closing)return closing;
    disposed=true;resize?.disconnect();
    canvas.removeEventListener('pointerdown',markManual);
    canvas.removeEventListener('wheel',markManual);
    closing=(async()=>{
      try{await ready;}catch{/* start reports the original error */}
      await operations;
      const current=controller;controller=null;
      if(current){await settled();await current.close();}
      mount?.remove();mount=null;canvas.replaceChildren();
    })();
    return closing;
  }
  // Only size CHANGES trigger an automatic fit. Manual zoom/drag/wheel is
  // never reset by a subsequent ResizeObserver delivery or theme switch.
  const resize=typeof window.ResizeObserver==='function'?new window.ResizeObserver(()=>{
    if(disposed)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(Math.abs(width-lastWidth)<2&&Math.abs(height-lastHeight)<2)return;
    lastWidth=width;lastHeight=height;
    if(width>=100&&height>=100&&!manualViewport)fit({resetManual:false}).catch(()=>{});
  }):null;
  lastWidth=canvas.clientWidth;lastHeight=canvas.clientHeight;
  resize?.observe(canvas);
  return Object.freeze({ready,fit,reflow,destroy,
    setTheme(mode){
      if(mode!=='light'&&mode!=='dark')return Promise.reject(new Error('E_XMIND_THEME'));
      if(disposed)return Promise.resolve();
      desiredSkin=mode;
      return command(async()=>{
        if(appliedSkin===desiredSkin)return;
        const target=desiredSkin;
        await render(folded,{preserve:true,mode:target});
        appliedSkin=target;
      }).then(()=>reflow());
    },
    zoomBy:factor=>command(c=>{
      manualViewport=true;
      c.zoom(Math.max(50,Math.min(400,c.getZoomPencentage()*factor)));
    }),
    async toggleAll(){
      await command(async c=>{
        const next=!folded;
        if(next)c.collapseBranch();else c.extendBranch();await settled();
        await render(next,{preserve:true});folded=next;
      });
      await reflow();return folded;
    },
    get nodeCount(){return canvas.querySelectorAll('.topic').length;}
  });
}
