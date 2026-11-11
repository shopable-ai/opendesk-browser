// Pure, bounded gesture segmentation. No browser APIs, side effects or permissions.
export const SEGMENT_LIMITS=Object.freeze({intentPx:12,activatePx:56,maxCrossPx:28,reversalPx:12,maxSegments:2});
export const DIRECTIONS=Object.freeze(['left','right','up','down']);
export const COMBO_KEYS=Object.freeze([
  'left-up','left-down','right-up','right-down',
  'up-left','up-right','down-left','down-right'
]);
export const ARROWS=Object.freeze({left:'←',right:'→',up:'↑',down:'↓'});
export const DIRECTION_NAMES=Object.freeze({left:'左',right:'右',up:'上',down:'下'});
const horizontal=dir=>dir==='left'||dir==='right';
const progress=(dir,dx,dy)=>dir==='left'?-dx:dir==='right'?dx:dir==='up'?-dy:dy;
const side=(dir,dx,dy)=>horizontal(dir)?dy:dx;
const perpendicular=(dir,value)=>horizontal(dir)?(value<0?'up':'down'):(value<0?'left':'right');
const validMappingKey=key=>COMBO_KEYS.includes(key);

export function normalizeGestureMappings(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result={};
  for(const key of COMBO_KEYS)if(DIRECTIONS.includes(value[key]))result[key]=value[key];
  return result;
}
export function createGestureTrack(x,y){
  return {x,y,lastX:x,lastY:y,points:[[x,y]],intent:false,invalid:false,turning:false,
    segments:[],current:null,stage:'pending'};
}
function invalidate(track){track.invalid=true;track.turning=false;track.stage='invalid';}
export function updateGestureTrack(track,x,y,limits=SEGMENT_LIMITS){
  track.lastX=x;track.lastY=y;
  if(track.points.length>=80)track.points.shift();
  track.points.push([x,y]);
  const dx=x-track.x,dy=y-track.y;
  if(!track.intent&&Math.hypot(dx,dy)<limits.intentPx)return track;
  track.intent=true;
  if(track.invalid)return track;
  if(!track.current){
    let dir=null;
    if(Math.abs(dx)>=limits.intentPx&&Math.abs(dx)>Math.abs(dy)*1.2)
      dir=dx<0?'left':'right';
    else if(Math.abs(dy)>=limits.intentPx&&Math.abs(dy)>Math.abs(dx)*1.2)
      dir=dy<0?'up':'down';
    if(!dir){
      if(Math.abs(dx)>limits.maxCrossPx&&Math.abs(dy)>limits.maxCrossPx)invalidate(track);
      else track.stage='dragging';
      return track;
    }
    track.current={dir,anchorX:track.x,anchorY:track.y,peakX:track.x,peakY:track.y,
      peak:0,maxCross:0,recognized:false};
  }
  const s=track.current;
  const along=progress(s.dir,x-s.anchorX,y-s.anchorY);
  const cross=side(s.dir,x-s.anchorX,y-s.anchorY);
  if(s.peak-along>limits.reversalPx){invalidate(track);return track;}
  if(!s.recognized){
    s.maxCross=Math.max(s.maxCross,Math.abs(cross));
    if(s.maxCross>limits.maxCrossPx||along<0){invalidate(track);return track;}
    if(along>s.peak){s.peak=along;s.peakX=x;s.peakY=y;}
    if(along>=limits.activatePx){
      s.recognized=true;
      track.segments.push({dir:s.dir,x:s.peakX,y:s.peakY});
      track.stage='recognized';
    }else track.stage='dragging';
    return track;
  }
  // A turn is measured from the last peak, not from the original mouse-down.
  // The first accepted segment stays anchored at its actual turning point.
  const off=side(s.dir,x-s.peakX,y-s.peakY);
  if(Math.abs(off)>=limits.intentPx)track.turning=true;
  if(track.turning){
    track.stage='turning';
    if(Math.abs(along-s.peak)>limits.maxCrossPx){invalidate(track);return track;}
    if(Math.abs(off)>=limits.activatePx){
      if(track.segments.length>=limits.maxSegments){invalidate(track);return track;}
      const next=perpendicular(s.dir,off);
      const key=s.dir+'-'+next;
      if(!validMappingKey(key)){invalidate(track);return track;}
      track.segments.at(-1).x=s.peakX;
      track.segments.at(-1).y=s.peakY;
      track.segments.push({dir:next,x,y});
      track.current={dir:next,anchorX:s.peakX,anchorY:s.peakY,peakX:x,peakY:y,
        peak:Math.abs(off),maxCross:Math.abs(along-s.peak),recognized:true};
      track.turning=false;track.stage='recognized';
    }
    return track;
  }
  s.maxCross=Math.max(s.maxCross,Math.abs(cross));
  if(s.maxCross>limits.maxCrossPx){invalidate(track);return track;}
  if(along>s.peak){s.peak=along;s.peakX=x;s.peakY=y;
    const last=track.segments.at(-1);last.x=x;last.y=y;}
  track.stage='recognized';
  return track;
}
export function gestureOutcome(track,mappings={}){
  const dirs=track.segments.map(segment=>segment.dir);
  const sequence=dirs.join('-');
  if(!track.intent||track.invalid||track.turning||dirs.length===0)
    return {sequence,action:null,state:track.invalid?'invalid':track.turning?'incomplete':'pending'};
  if(dirs.length===1)return {sequence,action:dirs[0],state:'mapped'};
  if(dirs.length!==2)return {sequence,action:null,state:'invalid'};
  const action=normalizeGestureMappings(mappings)[sequence]||null;
  return {sequence,action,state:action?'mapped':'unmapped'};
}
