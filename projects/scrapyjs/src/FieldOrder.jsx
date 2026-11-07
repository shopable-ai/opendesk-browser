import * as React from 'react';
import {IconButton} from '@opendesk/ui';

// Shared mouse/keyboard interaction; callers decide whether order is persisted.
export default function FieldOrder({keys,onOrderChange,locked,active=true,id='field-order',label='调整字段顺序：',renderItem,renderKey=key=>key,onMovingChange}){
  const [moving,setMoving]=React.useState(null),current=React.useRef(null);
  const handles=React.useRef(new Map()),list=React.useRef(null),pointer=React.useRef(null);
  const [announcement,setAnnouncement]=React.useState('');
  const ordered=moving?.mode==='keyboard'?moving.order:keys;
  function stage(next){current.current=next;setMoving(next);onMovingChange?.(Boolean(next));}
  function focus(key){requestAnimationFrame(()=>handles.current.get(key)?.focus({preventScroll:true}));}
  function pickup(key,mode){
    stage({key,order:[...keys],mode});
    setAnnouncement(`已拾起 ${key}，方向键移动，Enter 放下，Escape 取消。`);
  }
  function place(index){
    const value=current.current;if(!value)return;
    const order=value.order.filter(key=>key!==value.key);order.splice(index,0,value.key);stage({...value,order});
    setAnnouncement(`${value.key} 将放在第 ${index+1} / ${order.length} 项`);
    if(value.mode==='keyboard')requestAnimationFrame(()=>handles.current.get(value.key)?.scrollIntoView({block:'nearest'}));
  }
  function finish(commit){
    const value=current.current;pointer.current=null;if(!value)return;
    if(commit)onOrderChange(value.order);
    stage(null);setAnnouncement(commit?'已更新顺序':'已取消移动，顺序未更改');focus(value.key);
  }
  const identity=JSON.stringify(keys);
  React.useLayoutEffect(()=>{
    if(moving?.mode==='keyboard')handles.current.get(moving.key)?.focus({preventScroll:true});
  },[moving]);
  React.useEffect(()=>{if(current.current&&(locked||!active||current.current.order.some(key=>!keys.includes(key))||current.current.order.length!==keys.length))finish(false);},[locked,active,identity]);
  function keyboard(event,key){
    if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
    if(event.key==='Escape'&&current.current){event.preventDefault();event.stopPropagation();finish(false);return;}
    if(event.key===' '||event.key==='Enter'){event.preventDefault();if(current.current)finish(true);else pickup(key,'keyboard');return;}
    const value=current.current;if(!value||value.key!==key)return;
    const index=value.order.indexOf(key),next={ArrowUp:Math.max(0,index-1),ArrowDown:Math.min(value.order.length-1,index+1),Home:0,End:value.order.length-1}[event.key];
    if(next!==undefined){event.preventDefault();place(next);}
  }
  function pointerMove(event){
    const gesture=pointer.current;if(!gesture||gesture.id!==event.pointerId)return;
    if(event.buttons===0){finish(false);return;}
    if(!gesture.started){if(Math.abs(event.clientY-gesture.y)<4)return;gesture.started=true;pickup(gesture.key,'mouse');}
    const bounds=list.current.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom){finish(false);return;}
    const items=[...list.current.children];let index=items.findIndex(item=>event.clientY<item.getBoundingClientRect().bottom);if(index<0)index=items.length-1;
    if(current.current?.order.indexOf(gesture.key)!==index)place(index);
    const scroll=list.current.closest('.capture-business'),edge=scroll?.getBoundingClientRect();
    if(edge){if(event.clientY>edge.bottom-32)scroll.scrollBy(0,12);else if(event.clientY<edge.top+32)scroll.scrollBy(0,-12);}
  }
  function pointerEnd(event){
    const gesture=pointer.current;if(!gesture||gesture.id!==event.pointerId)return;
    const bounds=list.current.getBoundingClientRect();
    finish(gesture.started&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom);
  }
  React.useEffect(()=>{
    const doc=list.current?.ownerDocument;if(!doc)return;
    const cancel=()=>finish(false);
    doc.addEventListener('pointermove',pointerMove);doc.addEventListener('pointerup',pointerEnd);doc.addEventListener('pointercancel',cancel);doc.addEventListener('pointerleave',cancel);doc.defaultView.addEventListener('blur',cancel);
    return ()=>{doc.removeEventListener('pointermove',pointerMove);doc.removeEventListener('pointerup',pointerEnd);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('pointerleave',cancel);doc.defaultView.removeEventListener('blur',cancel);};
  });
  function handle(key){return <IconButton className="field-order-handle" ref={node=>{if(node)handles.current.set(key,node);else handles.current.delete(key);}} label={label+key} title="拖动排序；空格拾起，方向键移动，Enter 放下" aria-pressed={moving?.key===key} aria-describedby={id+'-help'} disabled={locked||keys.length<2||(Boolean(moving)&&moving.key!==key)}
    onKeyDown={event=>keyboard(event,key)} onPointerDown={event=>{if(event.button!==0||current.current)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});pointer.current={id:event.pointerId,y:event.clientY,key,started:false};}}>
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M7 3h3v3H7zm7 0h3v3h-3zM7 10h3v3H7zm7 0h3v3h-3zM7 17h3v3H7zm7 0h3v3h-3z"/></svg>
  </IconButton>;}
  return <div className="field-order">
    <div id={id} className="field-order-list" ref={list} role="group" aria-label={label.replace('：','')}>{ordered.map((key,index)=><div className="field-order-item" key={renderKey(key,index)} data-field-key={key} data-moving={moving?.key===key} data-drop-target={moving?.mode==='mouse'&&moving.order.indexOf(moving.key)===index}>
      {renderItem?renderItem(key,index,handle(key)):<div className="field-order-row">{handle(key)}<code>{key}</code></div>}
    </div>)}</div>
    <p id={id+'-help'} className={moving?'secondary':'sr-only'} role="status" aria-live="polite" aria-atomic="true">{announcement||'拖动手柄排序；空格拾起，方向键移动，Enter 放下，Escape 取消。'}</p>
  </div>;
}
