import assert from 'node:assert/strict';
import test from 'node:test';
import {GESTURE_LIMITS, mountBackGesture} from '../src/page/gesture.js';

function fixture({historyLength=3,selection=false,authorizeGesture=()=>true,gestureMappings={}}={}) {
  const subscribers = new Map(), disposers = [];
  const host = {style:{values:new Map(),setProperty(name,value){this.values.set(name,value);}}};
  const createNode = () => ({style:{},attributes:new Map(),children:[],
    setAttribute(k,v){this.attributes.set(k,v);},append(node){this.children.push(node);}});
  const doc = {createElementNS:() => createNode(), visibilityState:'visible'};
  let back=0, stopped=false;
  const win = {history:{length:historyLength}, getSelection:() => ({isCollapsed:!selection})};
  const ui = {host,content:{children:[],append(n){this.children.push(n);}},
    active:()=>!stopped,
    on(target,type,callback){const key=target===doc?'doc:'+type:'win:'+type;
      const all=subscribers.get(key)||new Set();all.add(callback);subscribers.set(key,all);
      disposers.push(()=>all.delete(callback));},
    onDispose(fn){disposers.push(fn);},
    destroy(){if(stopped)return;stopped=true;for(const fn of disposers.reverse())fn();}};
  const api=mountBackGesture({ui,doc,win,authorizeGesture,gestureMappings,navigateBack(){back++;}});
  const target={closest:()=>false};
  function dispatch(type, options={}) {
    const key=(['blur'].includes(type)?'win:':'doc:')+type;
    const event={isTrusted:true,button:2,buttons:2,clientX:200,clientY:100,
      key:'',target,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,
      prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},
      ...options};
    for(const handler of [...(subscribers.get(key)||[])])handler(event);
    return event;
  }
  return {dispatch,ui,doc,win,api,backCount:()=>back,listenerCount:()=>[...subscribers.values()].reduce((n,s)=>n+s.size,0),host};
}

const rightDown = f => f.dispatch('mousedown');
const moveLeft = (f, x=120, y=100) => f.dispatch('mousemove',{clientX:x,clientY:y});
const rightUp = (f, x=120, y=100) => f.dispatch('mouseup',{clientX:x,clientY:y});

test('real right-left gesture executes one current-document history back', () => {
  const f=fixture();rightDown(f);moveLeft(f);const up=rightUp(f);
  assert.equal(f.backCount(),1);assert.equal(up.prevented,true);
  const menu=f.dispatch('contextmenu',{clientX:120,clientY:100});assert.equal(menu.prevented,true);
  assert.equal(f.host.style.values.get('display'),'none');
  assert.equal(f.api.isActive(),true);
  rightUp(f);assert.equal(f.backCount(),1);
});

test('plain right-click keeps native menu', () => {
  const f=fixture();rightDown(f);
  assert.equal(f.dispatch('contextmenu').prevented,false);
  rightUp(f,200,100);assert.equal(f.dispatch('contextmenu').prevented,false);
  assert.equal(f.backCount(),0);
});

test('sub-intent jitter (<12px) does not navigate or suppress native context menu', () => {
  const f=fixture();rightDown(f);moveLeft(f,200-GESTURE_LIMITS.intentPx+1);
  const up=rightUp(f,200-GESTURE_LIMITS.intentPx+1);
  assert.equal(f.backCount(),0);assert.equal(up.prevented,false);
  assert.equal(f.dispatch('contextmenu').prevented,false);
});

test('Escape and window blur both cancel', () => {
  const f=fixture();rightDown(f);moveLeft(f);
  assert.equal(f.dispatch('keydown',{key:'Escape'}).prevented,true);
  rightUp(f);assert.equal(f.backCount(),0);
  rightDown(f);moveLeft(f);f.dispatch('blur');rightUp(f);
  assert.equal(f.backCount(),0);
});

test('editables, active selection, modifiers and synthetic events are excluded', () => {
  const f=fixture();f.dispatch('mousedown',{target:{closest:()=>true}});moveLeft(f);rightUp(f);
  f.dispatch('mousedown',{ctrlKey:true});moveLeft(f);rightUp(f);
  f.dispatch('mousedown',{isTrusted:false});moveLeft(f);rightUp(f);
  assert.equal(f.backCount(),0);
  const selected=fixture({selection:true});rightDown(selected);moveLeft(selected);rightUp(selected);
  assert.equal(selected.backCount(),0);
});

test('diagonal movement, no previous history, and broken button state cannot back', () => {
  const f=fixture();rightDown(f);moveLeft(f,110,155);rightUp(f,110,155);
  assert.equal(f.backCount(),0);
  const noHistory=fixture({historyLength:1});rightDown(noHistory);moveLeft(noHistory);rightUp(noHistory);
  assert.equal(noHistory.backCount(),0);
  const lost=fixture();rightDown(lost);lost.dispatch('mousemove',{buttons:0});moveLeft(lost);rightUp(lost);
  assert.equal(lost.backCount(),0);
});

test('new right-click clears previous contextmenu guard', () => {
  const f=fixture();rightDown(f);moveLeft(f);rightUp(f);
  rightDown(f);assert.equal(f.dispatch('contextmenu').prevented,false);
});

test('module disable/dispose clears all listeners and trace resources', () => {
  const f=fixture();rightDown(f);moveLeft(f);
  assert.ok(f.listenerCount()>0);
  f.ui.destroy();assert.equal(f.listenerCount(),0);
  assert.equal(f.host.style.values.get('display'),'none');
  assert.equal(f.api.isActive(),false);
  moveLeft(f);rightUp(f);assert.equal(f.backCount(),0);
});

test('hidden document cancels pending gesture', () => {
  const f=fixture();rightDown(f);moveLeft(f);f.doc.visibilityState='hidden';
  f.dispatch('visibilitychange');rightUp(f);assert.equal(f.backCount(),0);
});


test('menu emitted before movement is preserved and current gesture is abandoned (Mac timing)',()=>{
  const f=fixture();rightDown(f);
  assert.equal(f.dispatch('contextmenu').prevented,false);
  moveLeft(f);rightUp(f);assert.equal(f.backCount(),0);
  rightDown(f);moveLeft(f);rightUp(f);assert.equal(f.backCount(),1);
});

test('release guard intercepts only matching mouse menu, never keyboard or unrelated target',()=>{
  const f=fixture();rightDown(f);moveLeft(f);rightUp(f);
  assert.equal(f.dispatch('contextmenu',{button:0,clientX:120}).prevented,false);
  assert.equal(f.dispatch('contextmenu',{clientX:120,target:{closest:()=>false}}).prevented,false);
  assert.equal(f.dispatch('contextmenu',{clientX:200}).prevented,false);
  assert.equal(f.dispatch('contextmenu',{clientX:120}).prevented,true);
  assert.equal(f.dispatch('contextmenu',{clientX:120}).prevented,false);
});

test('12px intent suppresses matching menu but does not execute 56px action',()=>{
  const f=fixture();rightDown(f);moveLeft(f,182);rightUp(f,182);
  assert.equal(f.backCount(),0);
  assert.equal(f.dispatch('contextmenu',{clientX:182}).prevented,true);
});

test('backtracking beyond 12px invalidates recognized movement without crossing origin',()=>{
  const f=fixture();rightDown(f);moveLeft(f,100);moveLeft(f,126);rightUp(f,126);
  assert.equal(f.backCount(),0);
});

test('Alt/Option plus left-button is a selectable fallback, without stealing right clicks',()=>{
  const f=fixture();f.api.setOptions({trigger:'alt-left'});
  rightDown(f);moveLeft(f);rightUp(f);assert.equal(f.backCount(),0);
  const alt={button:0,buttons:1,altKey:true};
  f.dispatch('mousedown',alt);
  f.dispatch('mousemove',{...alt,clientX:120});
  f.dispatch('mouseup',{...alt,clientX:120});
  assert.equal(f.backCount(),1);
  assert.equal(f.dispatch('contextmenu').prevented,false);
});

test('visual feedback can be disabled without disabling the gesture',()=>{
  const f=fixture();f.api.setOptions({showTrace:false});
  rightDown(f);moveLeft(f);assert.equal(f.host.style.values.get('display'),'none');
  rightUp(f);assert.equal(f.backCount(),1);
});

test('stop/disposal or newer gesture revokes an asynchronous action decision',async()=>{
  let resolve;
  const f=fixture({authorizeGesture:()=>new Promise(r=>{resolve=r;})});
  rightDown(f);moveLeft(f);rightUp(f);
  rightDown(f);resolve(true);await Promise.resolve();await Promise.resolve();
  assert.equal(f.backCount(),0);
  f.api.setEnabled(false);moveLeft(f);rightUp(f);
  assert.equal(f.backCount(),0);
});

test('arrow overlay shows exactly one rounded-square glyph per recognized segment',()=>{
  const f=fixture();const svg=f.ui.content.children[0];
  const [line,first,second]=svg.children;
  rightDown(f);moveLeft(f,110,100);
  assert.equal(first.attributes.get('visibility'),'visible');
  assert.equal(first.children[0].attributes.get('rx'),'9');
  assert.equal(first.children[1].textContent,'←');
  assert.equal(second.attributes.get('visibility'),'hidden');
  f.dispatch('mousemove',{clientX:110,clientY:170});
  assert.equal(first.attributes.get('visibility'),'visible');
  assert.equal(second.attributes.get('visibility'),'visible');
  assert.equal(second.children[1].textContent,'↓');
  assert.ok(line.attributes.get('d').includes('L'));
  rightUp(f,110,170);assert.equal(f.backCount(),0);
  assert.equal(first.attributes.get('visibility'),'hidden');
  assert.equal(second.attributes.get('visibility'),'hidden');
});
test('mapped two-segment gesture executes once, unmapped combo never falls back',()=>{
  const off=fixture();rightDown(off);moveLeft(off,110,100);
  off.dispatch('mousemove',{clientX:110,clientY:170});rightUp(off,110,170);
  assert.equal(off.backCount(),0);
  const on=fixture({gestureMappings:{'left-down':'left'}});
  rightDown(on);moveLeft(on,110,100);
  on.dispatch('mousemove',{clientX:110,clientY:170});rightUp(on,110,170);
  assert.equal(on.backCount(),1);
  rightUp(on,110,170);assert.equal(on.backCount(),1);
});
test('an unfinished second segment cannot execute the first segment',()=>{
  const f=fixture();rightDown(f);moveLeft(f,110,100);
  f.dispatch('mousemove',{clientX:110,clientY:118});rightUp(f,110,118);
  assert.equal(f.backCount(),0);
});
