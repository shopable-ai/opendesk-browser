import assert from 'node:assert/strict';
import test from 'node:test';
import {mountGestures} from '../src/page/gesture.js';

function setup({gate=()=>true}={}){
  const listeners=new Map(),disposers=[];
  const host={style:{setProperty(){}}};
  const node=()=>({style:{},setAttribute(){},append(){}});
  const doc={createElementNS:node,visibilityState:'visible',scrollingElement:{scrollHeight:900}};
  let disposed=false;
  const actions=[];
  const win={history:{length:3},getSelection:()=>({isCollapsed:true}),scrollTo(){actions.push('bottom');}};
  const ui={host,content:{append(){}},active:()=>!disposed,
    on(target,type,fn){const key=(target===doc?'d':'w')+':'+type;
      if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key).add(fn);
      disposers.push(()=>listeners.get(key).delete(fn));},
    onDispose(fn){disposers.push(fn);},destroy(){if(disposed)return;disposed=true;disposers.reverse().forEach(fn=>fn());}};
  const api=mountGestures({ui,doc,win,authorizeGesture:gate,
    navigateBack:()=>actions.push('back'),navigateForward:()=>actions.push('forward'),
    reloadPage:()=>actions.push('reload')});
  const fire=(type,overrides={})=>{
    const e={button:2,buttons:2,isTrusted:true,clientX:200,clientY:100,key:'',target:{closest:()=>false},
      preventDefault(){this.prevented=true;},stopPropagation(){},...overrides};
    for(const fn of [...(listeners.get((type==='blur'?'w':'d')+':'+type)||[])])fn(e);
    return e;
  };
  const swipe=(x,y)=>{fire('mousedown');fire('mousemove',{clientX:x,clientY:y});
    return fire('mouseup',{clientX:x,clientY:y});};
  return {fire,swipe,api,ui,actions,listeners};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
for(const [label,x,y,action] of [
  ['left',110,100,'back'],['right',290,100,'forward'],
  ['up',200,10,'reload'],['down',200,190,'bottom']]){
  test('new '+label+' gesture executes '+action+' once',()=>{
    const f=setup(),event=f.swipe(x,y);
    assert.deepEqual(f.actions,[action]);assert.equal(event.prevented,true);
    f.fire('mouseup',{clientX:x,clientY:y});assert.deepEqual(f.actions,[action]);
  });
}
test('all four directions are blocked by the real switch gate',()=>{
  const f=setup();f.api.setEnabled(false);
  for(const [x,y] of [[110,100],[290,100],[200,10],[200,190]])f.swipe(x,y);
  assert.deepEqual(f.actions,[]);
  f.api.setEnabled(true);f.swipe(200,190);assert.deepEqual(f.actions,['bottom']);
});
test('diagonal, mixed-axis and reversed paths do not execute',()=>{
  const f=setup();f.swipe(110,155);
  f.fire('mousedown');f.fire('mousemove',{clientX:242,clientY:100});
  f.fire('mousemove',{clientX:200,clientY:10});f.fire('mouseup',{clientX:200,clientY:10});
  f.fire('mousedown');f.fire('mousemove',{clientX:110,clientY:100});
  f.fire('mousemove',{clientX:290,clientY:100});f.fire('mouseup',{clientX:290,clientY:100});
  assert.deepEqual(f.actions,[]);
});
test('an active gesture cannot survive pending authority, blur or disposal',async()=>{
  let resolve;
  const f=setup({gate:()=>new Promise(r=>{resolve=r;})});
  f.swipe(110,100);assert.deepEqual(f.actions,[]);
  f.fire('blur');resolve(true);await settle();assert.deepEqual(f.actions,[]);
  f.swipe(290,100);f.ui.destroy();resolve(true);await settle();
  assert.deepEqual(f.actions,[]);
  assert.equal([...f.listeners.values()].reduce((n,set)=>n+set.size,0),0);
});
test('Escape cancels an authority check pending after right-button release',async()=>{
  let resolve;
  const f=setup({gate:()=>new Promise(r=>{resolve=r;})});
  f.swipe(110,100);assert.deepEqual(f.actions,[]);
  f.fire('keydown',{key:'Escape'});
  resolve(true);await settle();assert.deepEqual(f.actions,[]);
  f.swipe(290,100);resolve(true);await settle();
  assert.deepEqual(f.actions,['forward']);
});
test('right-click without a directional gesture never blocks contextmenu',()=>{
  const f=setup();f.fire('mousedown');
  assert.equal(Boolean(f.fire('contextmenu').prevented),false);
  f.fire('mouseup');assert.equal(Boolean(f.fire('contextmenu').prevented),false);
  assert.deepEqual(f.actions,[]);
});
