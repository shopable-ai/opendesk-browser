import assert from 'node:assert/strict';
import test from 'node:test';
import {GESTURE_LIMITS, mountBackGesture} from '../src/page/gesture.js';

function fixture({historyLength=3,selection=false}={}) {
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
  const api=mountBackGesture({ui,doc,win,navigateBack(){back++;}});
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
  const menu=f.dispatch('contextmenu');assert.equal(menu.prevented,true);
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

test('small movement does not navigate or suppress context menu', () => {
  const f=fixture();rightDown(f);moveLeft(f,200-GESTURE_LIMITS.activatePx+1);
  const up=rightUp(f,200-GESTURE_LIMITS.activatePx+1);
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
