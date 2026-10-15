// Lightweight local SVG renderer. No foreignObject, innerHTML, CDN, dynamic
// JavaScript or XMind runtime. Nodes and labels are always textContent.
const SVG='http://www.w3.org/2000/svg';
const W=196,STEP=244,GAP=18,YPAD=14,MAX_SCALE=2.5,MIN_SCALE=.16;
const svgEl=(doc,tag,attrs={})=>{
  const node=doc.createElementNS(SVG,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function linesOf(value){
  const units=Array.from(String(value||''));
  const lines=[];let line='',width=0;
  for(const char of units){
    const weight=/[^\x00-\x7F]/.test(char)?2:1;
    if(width+weight>27&&line){lines.push(line);line='';width=0;}
    line+=char;width+=weight;
  }
  if(line)lines.push(line);
  return lines.slice(0,4);
}

export function layoutMindTree(root,collapsed=new Set()) {
  const sizes=new Map(),coords=[],edges=[];
  let maxRight=0;
  function measure(node){
    const visible=node.children.length&&!collapsed.has(node.id)?node.children:[];
    const height=Math.max(54,Math.min(4,linesOf(node.title).length)*18+22);
    const childSizes=visible.map(measure);
    const span=Math.max(height,childSizes.reduce((sum,row)=>sum+row.span,0)+
      GAP*Math.max(0,childSizes.length-1));
    const result={height,span,visible,childSizes};sizes.set(node,result);
    return result;
  }
  measure(root);
  function position(node,start,depth,parent){
    const m=sizes.get(node),x=20+depth*STEP;
    const y=start+(m.span-m.height)/2;
    coords.push({node,x,y,width:W,height:m.height});
    maxRight=Math.max(maxRight,x+W);
    if(parent)edges.push({from:parent,to:{x,y:y+m.height/2}});
    let next=start+(m.span-m.childSizes.reduce((s,c)=>s+c.span,0)-
      GAP*Math.max(0,m.childSizes.length-1))/2;
    for(let i=0;i<m.visible.length;i++){
      const child=m.visible[i],size=m.childSizes[i];
      position(child,next,depth+1,{x:x+W,y:y+m.height/2});
      next+=size.span+GAP;
    }
  }
  position(root,18,0,null);
  return {coords,edges,width:maxRight+32,height:sizes.get(root).span+36};
}

export function createMindMapRenderer({document,window,canvas,tree,onSelection}){
  const svg=svgEl(document,'svg',{class:'odmm-svg',role:'group',
    'aria-label':'本条回复的只读思维导图'});
  const scene=svgEl(document,'g');svg.append(scene);canvas.append(svg);
  const folded=new Set();let tx=24,ty=24,scale=1,layout=null,destroyed=false,userAdjusted=false;
  const cleanups=[];
  const on=(target,event,fn,options)=>{
    target.addEventListener(event,fn,options);
    cleanups.push(()=>target.removeEventListener(event,fn,options));
  };
  function apply(){scene.setAttribute('transform',`translate(${tx} ${ty}) scale(${scale})`);}
  function zoomBy(factor,x,y){
    const next=clamp(scale*factor,MIN_SCALE,MAX_SCALE),ratio=next/scale;
    tx=x-(x-tx)*ratio;ty=y-(y-ty)*ratio;scale=next;userAdjusted=true;apply();
  }
  function fit(){
    if(!layout)return;
    const box=canvas.getBoundingClientRect();
    const width=Math.max(320,box.width||760),height=Math.max(220,box.height||400);
    scale=clamp(Math.min((width-44)/layout.width,(height-44)/layout.height),MIN_SCALE,1.35);
    tx=(width-layout.width*scale)/2;
    ty=(height-layout.height*scale)/2;
    userAdjusted=false;apply();
  }
  function render({refit=false}={}){
    if(destroyed)return;
    layout=layoutMindTree(tree,folded);
    const fragment=document.createDocumentFragment();
    for(const {from,to} of layout.edges){
      const d=`M ${from.x} ${from.y} C ${from.x+24} ${from.y}, ${to.x-24} ${to.y}, ${to.x} ${to.y}`;
      fragment.append(svgEl(document,'path',{d,class:'odmm-edge'}));
    }
    for(const {node,x,y,width,height} of layout.coords){
      const group=svgEl(document,'g',{class:'odmm-node',transform:`translate(${x} ${y})`,
        'data-mm-node':node.id,tabindex:'0',role:'button',
        'aria-label':node.title+(node.children.length?'，点击展开或折叠':'，查看正文备注')});
      if(node.children.length)group.setAttribute('aria-expanded',String(!folded.has(node.id)));
      const kind=node.kind==='root'?' root':node.kind==='heading'?' heading':'';
      const box=svgEl(document,'rect',{x:0,y:0,width,height,rx:11,class:'odmm-topic'+kind});
      group.append(box);
      const text=svgEl(document,'text',{class:'odmm-topic-label'});
      const rows=linesOf(node.title);
      rows.forEach((line,index)=>{
        const span=svgEl(document,'tspan',{x:12,y:(height-rows.length*18)/2+15+index*18});
        span.textContent=line;text.append(span);
      });
      group.append(text);
      if(node.children.length){
        const mark=svgEl(document,'text',{x:width-17,y:height-9,class:'odmm-fold'});
        mark.textContent=folded.has(node.id)?'+':'−';group.append(mark);
      }else if(node.content){
        const mark=svgEl(document,'circle',{cx:width-12,cy:height-12,r:3,class:'odmm-note-mark'});
        group.append(mark);
      }
      const title=svgEl(document,'title');title.textContent=node.title;group.append(title);
      function select(){
        onSelection?.(node);
        if(node.children.length){
          if(folded.has(node.id))folded.delete(node.id);else folded.add(node.id);
          render();
        }
      }
      group.addEventListener('click',select);
      group.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}
      });
      fragment.append(group);
    }
    scene.replaceChildren(fragment);
    if(refit)fit();else apply();
  }
  let pointer=null;
  on(svg,'pointerdown',e=>{
    if(e.button!==0||e.target.closest?.('[data-mm-node]'))return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
    svg.setPointerCapture?.(e.pointerId);
  });
  on(svg,'pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    tx+=e.clientX-pointer.x;ty+=e.clientY-pointer.y;
    pointer.x=e.clientX;pointer.y=e.clientY;userAdjusted=true;apply();
  });
  const release=e=>{if(pointer?.id===e.pointerId)pointer=null;};
  on(svg,'pointerup',release);on(svg,'pointercancel',release);
  on(svg,'wheel',e=>{
    // Ordinary scrolling of ChatGPT is never hijacked by an inline canvas.
    if(!(e.ctrlKey||e.metaKey||e.altKey))return;
    e.preventDefault();
    const rect=svg.getBoundingClientRect();
    zoomBy(e.deltaY<0?1.10:.90,e.clientX-rect.left,e.clientY-rect.top);
  },{passive:false});
  let resize=null;
  if(typeof window.ResizeObserver==='function'){
    resize=new window.ResizeObserver(()=>{if(!destroyed&&layout&&canvas.isConnected){
      if(userAdjusted)apply();else fit();
    }});
    resize.observe(canvas);
  }
  function toggleAll(){
    const anyFolded=folded.size>0;folded.clear();
    if(!anyFolded){
      const walk=n=>{if(n.children.length)folded.add(n.id);n.children.forEach(walk);};
      walk(tree);
    }
    render({refit:true});return folded.size>0;
  }
  function destroy(){
    if(destroyed)return;destroyed=true;resize?.disconnect();
    for(const fn of cleanups.splice(0).reverse())fn();svg.remove();
  }
  render({refit:true});
  return Object.freeze({fit,zoomBy,render,toggleAll,destroy,
    get collapsed(){return new Set(folded);},get nodeCount(){return layout?.coords.length||0;}});
}
