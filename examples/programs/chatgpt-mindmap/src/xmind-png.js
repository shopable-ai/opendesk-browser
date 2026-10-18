import {mindTreeToXmindBlob} from './xmind-convert.js';
import {retireXmindMount} from './xmind-adapter.js';

// Rasterize only the original, fully expanded XMind DOM. This is NOT a second
// topic renderer, SVG export or a viewport screenshot. Fail closed whenever a
// complete, safe DOM snapshot cannot be proved in the installed Chromium.
const MAX_PIXELS=24_000_000, MAX_EDGE=8192, MAX_ELEMENTS=8000;
const failure=(code,message=code)=>Object.assign(new Error(message),{code});
const pause=window=>new Promise(resolve=>{
  const timer=window.setTimeout(resolve,65);
  window.requestAnimationFrame(()=>{window.clearTimeout(timer);resolve();});
});
function expectedTopics(tree){
  const headings=tree.children.filter(item=>item.kind==='heading');
  const heading=headings.length===1?headings[0]:null;
  const title=tree.title||'回答概览';
  const at=heading?tree.children.indexOf(heading):-1;
  const matches=heading&&(heading.title===title||
    (title.endsWith('…')&&heading.title.startsWith(title.slice(0,-1))));
  const safe=at>=0&&tree.children.every((item,index)=>index===at||
    (index<at&&item.kind==='paragraph'));
  let count=1;
  const scan=items=>{for(const node of items){count++;scan(node.children||[]);}};
  scan(matches&&safe?
    [...tree.children.slice(0,at),...(heading.children||[])]:tree.children);
  return count;
}
function copyComputedStyles(window,source,clone){
  const old=[source,...source.querySelectorAll('*')];
  const fresh=[clone,...clone.querySelectorAll('*')];
  if(old.length!==fresh.length||old.length>MAX_ELEMENTS)
    throw failure('E_XMIND_PNG_DOM_LIMIT');
  for(let i=0;i<old.length;i++){
    const from=old[i],to=fresh[i],tag=from.localName;
    if(['script','iframe','canvas','object','embed','video','audio','link'].includes(tag))
      throw failure('E_XMIND_PNG_UNSUPPORTED_DOM');
    if(tag==='img'||tag==='image')throw failure('E_XMIND_PNG_EXTERNAL_IMAGE');
    const style=window.getComputedStyle(from);
    if(!style)throw failure('E_XMIND_PNG_STYLE');
    for(let j=0;j<style.length;j++){
      const name=style[j],value=style.getPropertyValue(name);
      if(name==='background-image'&&value!=='none'&&value.includes('url('))
        throw failure('E_XMIND_PNG_EXTERNAL_STYLE');
      to.style.setProperty(name,value,style.getPropertyPriority(name));
    }
    // Export is a screenshot of the entire generated workbook, never its
    // viewport. Scroll-only clipping must not delete out-of-view topics.
    to.style.setProperty('overflow','visible','important');
    to.style.setProperty('overflow-x','visible','important');
    to.style.setProperty('overflow-y','visible','important');
    to.style.setProperty('clip-path','none','important');
    const href=to.getAttribute('href')||to.getAttribute('xlink:href');
    if(href&&!href.startsWith('#')){
      if(tag==='a'){to.removeAttribute('href');to.removeAttribute('xlink:href');}
      else throw failure('E_XMIND_PNG_EXTERNAL_RESOURCE');
    }
    to.removeAttribute('onclick');
    to.removeAttribute('onload');
    if(tag==='input'||tag==='textarea')to.removeAttribute('value');
  }
  return clone;
}
// Verify painted pixels inside EVERY XMind topic, not just the PNG signature
// or a global color sample. A clipped/shifted foreignObject could otherwise
// produce a plausible-looking but incomplete image.
function verifyTopicPixels(context,topics,width,height,background){
  const base=background==='#282828'?[40,40,40]:[255,255,255];
  for(const box of topics){
    const x0=Math.max(0,Math.floor(box.left));
    const y0=Math.max(0,Math.floor(box.top));
    const x1=Math.min(width,Math.ceil(box.right));
    const y1=Math.min(height,Math.ceil(box.bottom));
    if(x1-x0<2||y1-y0<2)throw failure('E_XMIND_PNG_INCOMPLETE');
    const w=x1-x0,h=y1-y0;
    const rgba=context.getImageData(x0,y0,w,h).data;
    let ink=0;
    outer:for(let y=1;y<h;y+=2){
      for(let x=1;x<w;x+=2){
        const i=(y*w+x)*4;
        if(rgba[i+3]>80&&(Math.abs(rgba[i]-base[0])>28||
          Math.abs(rgba[i+1]-base[1])>28||
          Math.abs(rgba[i+2]-base[2])>28)){
          if(++ink>=8)break outer;
        }
      }
    }
    if(ink<8)throw failure('E_XMIND_PNG_INCOMPLETE',
      '完整 XMind 导图有节点未成功栅格化');
  }
}
async function decodeSVG(window,svg,width,height,topics,background){
  // In Chromium, foreignObject via blob: taints canvas even for local bytes.
  // A self-contained data: SVG can be drawn and read without that taint.
  if(svg.length>18_000_000)throw failure('E_XMIND_PNG_DOM_LIMIT');
  const svgUrl='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  try{
    const image=new window.Image();
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(failure('E_XMIND_PNG_RASTERIZE'));
      image.src=svgUrl;
    });
    const canvas=window.document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw failure('E_XMIND_PNG_CANVAS');
    context.drawImage(image,0,0);
    // Detect blank serialization, tainted canvases and missing workbook paint.
    const sample=window.document.createElement('canvas');
    sample.width=64;sample.height=64;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(canvas,0,0,64,64);
    const rgba=ctx.getImageData(0,0,64,64).data;
    const colors=new Set();
    for(let i=0;i<rgba.length;i+=32)
      colors.add([rgba[i],rgba[i+1],rgba[i+2],rgba[i+3]].join(','));
    if(colors.size<3)throw failure('E_XMIND_PNG_BLANK');
    verifyTopicPixels(context,topics,width,height,background);
    return await new Promise((resolve,reject)=>canvas.toBlob(
      blob=>blob?resolve(blob):reject(failure('E_XMIND_PNG_ENCODING')),'image/png'));
  }finally{/* data: SVG is self-contained and has no object URL to revoke. */}
}
export async function captureXmindPng({sdk,window,canvas,tree,skinMode='dark'}){
  const document=canvas.ownerDocument;
  if(!document?.body||typeof window.XMLSerializer!=='function'||
     typeof window.Image!=='function'||!window.URL?.createObjectURL)
    throw failure('E_XMIND_PNG_UNSUPPORTED');
  if(!tree||!Array.isArray(tree.children))throw failure('E_XMIND_PNG_TREE');
  const stage=document.createElement('div');
  // Keep the existing renderer alive and untouched. Stage is not displayed to
  // the user; it uses the same SDK with every branch expanded in a new Workbook.
  stage.style.cssText='position:fixed;left:-100000px;top:0;width:4096px;'+
    'height:3072px;overflow:visible;opacity:1;pointer-events:none;z-index:-1';
  document.body.append(stage);
  let editor;
  let result;
  let primaryError=null;
  try{
    const workbook=await mindTreeToXmindBlob(sdk,tree,skinMode,{defaultFolded:false});
    editor=await sdk._SB_.createWorkbookEditor(workbook,stage,
      {languageCode:'zh-CN',resourceUrlPrefix:'',password:''});
    editor.switchSheetTo(0);
    await pause(window);await pause(window);await pause(window);
    await document.fonts?.ready;
    const topics=[...stage.querySelectorAll('.topic')];
    if(topics.length!==expectedTopics(tree))
      throw failure('E_XMIND_PNG_INCOMPLETE',
        '展开的 XMind 节点数量与当前回复不一致');
    // A DOM-only capture cannot reproduce painting from canvas/WebGL. Explicit
    // failure is safer than a seemingly complete PNG with missing connectors.
    if(stage.querySelector('canvas,iframe,object,embed,img,svg image'))
      throw failure('E_XMIND_PNG_UNSUPPORTED_DOM');
    // A live XMind SVG is laid out INSIDE nested scrollers. Serializing DOM
    // does not preserve scroll offsets, so normalize them BEFORE taking topic
    // bounds. The previous order measured scrolled topics, reset scroll and
    // cloned shifted topics: the resulting PNG contained background only.
    for(const item of stage.querySelectorAll('*')){
      if(item.scrollLeft)item.scrollLeft=0;
      if(item.scrollTop)item.scrollTop=0;
    }
    await pause(window);await pause(window);
    const bounds=topics.map(node=>node.getBoundingClientRect());
    if(bounds.some(r=>!Number.isFinite(r.left)||!Number.isFinite(r.top)||
      r.width<1||r.height<1))throw failure('E_XMIND_PNG_LAYOUT');
    const stageBounds=stage.getBoundingClientRect();
    const margin=80;
    const left=Math.floor(Math.min(...bounds.map(r=>r.left))-stageBounds.left-margin);
    const top=Math.floor(Math.min(...bounds.map(r=>r.top))-stageBounds.top-margin);
    const right=Math.ceil(Math.max(...bounds.map(r=>r.right))-stageBounds.left+margin);
    const bottom=Math.ceil(Math.max(...bounds.map(r=>r.bottom))-stageBounds.top+margin);
    const width=right-left,height=bottom-top;
    if(width<100||height<100||width>MAX_EDGE||height>MAX_EDGE||
      width*height>MAX_PIXELS)throw failure('E_XMIND_PNG_DIMENSIONS');
    const clone=copyComputedStyles(window,stage,stage.cloneNode(true));
    // Expand/collapse and note buttons belong to the interactive editor.
    // Their Snowbrush icon fonts are unavailable in the self-contained SVG
    // image on some Chromium platforms (CI produced boxed note glyphs).
    // Hide only these cloned controls; keep topic text, paths and workbook
    // notes intact, and never change the live editor.
    for(const control of clone.querySelectorAll(
      '.collapseextend [data-name="action-area"], .icon-information'))
      control.style.setProperty('display','none','important');
    clone.style.setProperty('position','relative','important');
    clone.style.setProperty('left','0','important');
    clone.style.setProperty('top','0','important');
    clone.style.setProperty('opacity','1','important');
    clone.style.setProperty('pointer-events','none','important');
    clone.style.setProperty('z-index','auto','important');
    const wrapper=document.createElement('div');
    wrapper.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
    wrapper.style.cssText='position:relative;overflow:visible;'+
      'transform:translate('+(-left)+'px,'+(-top)+'px);'+
      'width:4096px;height:3072px';
    wrapper.append(clone);
    const markup=new window.XMLSerializer().serializeToString(wrapper);
    const background=skinMode==='dark'?'#282828':'#ffffff';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+
      '" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
      '<rect width="100%" height="100%" fill="'+background+'"/>'+
      '<foreignObject width="'+width+'" height="'+height+'">'+markup+
      '</foreignObject></svg>';
    const exportedBoxes=bounds.map(r=>({
      left:r.left-stageBounds.left-left,
      top:r.top-stageBounds.top-top,
      right:r.right-stageBounds.left-left,
      bottom:r.bottom-stageBounds.top-top
    }));
    result=await decodeSVG(window,svg,width,height,exportedBoxes,background);
    if(result.size<512||result.size>30*1024*1024)
      throw failure('E_XMIND_PNG_SIZE');
  }catch(error){primaryError=error;}
  try{await retireXmindMount(editor,stage);}
  catch(error){if(!primaryError)primaryError=error;}
  if(primaryError)throw primaryError;
  return result;
}
