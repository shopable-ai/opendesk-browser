// Pure geometry for the trusted in-page TOC overlay.
// Store relative positions rather than pixel coordinates so resize/zoom cannot
// strand a previously dragged card outside the readable viewport.
export const TOC_POSITION_GAP=8;
export const TOC_EDGE_SNAP=32;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const ratio=(value,min,max)=>max===min?0:Math.round(clamp((value-min)/(max-min),0,1)*10000)/10000;

export function readTocPlacement(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
     value.v!==1||!['free','left','right'].includes(value.dock)||
     !Number.isFinite(value.x)||!Number.isFinite(value.y)||
     value.x<0||value.x>1||value.y<0||value.y>1)return null;
  return {v:1,dock:value.dock,x:value.x,y:value.y};
}

// visualViewport can be smaller than the layout viewport under pinch zoom.
export function tocViewport(win) {
  const visual=win.visualViewport;
  const width=visual?.width??win.innerWidth;
  const height=visual?.height??win.innerHeight;
  return {
    left:Number.isFinite(visual?.offsetLeft)?visual.offsetLeft:0,
    top:Number.isFinite(visual?.offsetTop)?visual.offsetTop:0,
    width:Math.max(0,Number.isFinite(width)?width:0),
    height:Math.max(0,Number.isFinite(height)?height:0)
  };
}
export function tocBounds(size,viewport) {
  const xGap=viewport.width>=size.width+TOC_POSITION_GAP*2?TOC_POSITION_GAP:0;
  const yGap=viewport.height>=size.height+TOC_POSITION_GAP*2?TOC_POSITION_GAP:0;
  const minX=viewport.left+xGap,minY=viewport.top+yGap;
  return {
    minX,maxX:Math.max(minX,viewport.left+viewport.width-size.width-xGap),
    minY,maxY:Math.max(minY,viewport.top+viewport.height-size.height-yGap)
  };
}
export function tocClampPoint(left,top,size,viewport) {
  const bounds=tocBounds(size,viewport);
  return {left:clamp(left,bounds.minX,bounds.maxX),
    top:clamp(top,bounds.minY,bounds.maxY)};
}
export function tocPlacementFromPoint(left,top,size,viewport) {
  const b=tocBounds(size,viewport),p=tocClampPoint(left,top,size,viewport);
  const towardLeft=p.left-b.minX<=TOC_EDGE_SNAP;
  const towardRight=b.maxX-p.left<=TOC_EDGE_SNAP;
  const dock=towardLeft&&(!towardRight||p.left-b.minX<=b.maxX-p.left)?'left':
    towardRight?'right':'free';
  return {v:1,dock,x:ratio(p.left,b.minX,b.maxX),y:ratio(p.top,b.minY,b.maxY)};
}
export function tocPlacementPoint(saved,size,viewport) {
  const value=readTocPlacement(saved);
  if(!value)return null;
  const b=tocBounds(size,viewport);
  return {left:value.dock==='left'?b.minX:value.dock==='right'?b.maxX:
      b.minX+(b.maxX-b.minX)*value.x,
    top:b.minY+(b.maxY-b.minY)*value.y};
}
