import assert from 'node:assert/strict';
import test from 'node:test';
import {mountFreeCopy} from '../src/page/unlock.js';

function fixture(){
  const listeners=new Map(),disposers=[];
  let disposed=false,selected=true;
  const element=(excluded=false)=>({nodeType:1,closest:()=>excluded?{}:null});
  const style={isConnected:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},
    remove(){this.isConnected=false;}};
  const doc={activeElement:element(),createElement(){return style;},
    head:{append(node){node.isConnected=true;}}};
  const win={getSelection:()=>({isCollapsed:!selected})};
  const ui={active:()=>!disposed,
    on(target,type,fn){listeners.set(type,fn);},
    onDispose(fn){disposers.push(fn);},
    destroy(){disposed=true;for(const fn of disposers)fn();}};
  const api=mountFreeCopy({ui,doc,win});
  const fire=(type,options={})=>{
    const event={type,isTrusted:true,target:element(),button:2,buttons:2,
      clientX:10,clientY:10,key:'c',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,
      defaultPrevented:false,stopImmediatePropagation(){this.stopped=true;},
      stopPropagation(){this.bubbleStopped=true;},preventDefault(){this.defaultPrevented=true;},...options};
    listeners.get(type)?.(event);return event;
  };
  return {api,fire,ui,style,element,select(v){selected=v;}};
}

test('enabled mode restores native selection and context menu without cancelling defaults',()=>{
  const f=fixture();f.api.setEnabled(true);
  assert.equal(f.style.isConnected,true);
  assert.match(f.style.textContent,/user-select:text!important/);
  const right=f.fire('contextmenu');assert.equal(right.stopped,true);
  assert.equal(right.defaultPrevented,false);
  const select=f.fire('selectstart');assert.equal(select.stopped,true);
  assert.equal(select.defaultPrevented,false);
  const copied=f.fire('copy');assert.equal(copied.stopped,true);
  assert.equal(copied.defaultPrevented,false);
});

test('copy, keyboard and unselected inputs are handled selectively',()=>{
  const f=fixture();f.api.setEnabled(true);
  assert.equal(f.fire('keydown',{metaKey:true}).stopped,true);
  assert.equal(f.fire('keydown',{ctrlKey:true}).stopped,true);
  assert.equal(Boolean(f.fire('keydown',{key:'v',metaKey:true}).stopped),false);
  assert.equal(Boolean(f.fire('keydown',{key:'c',metaKey:true,shiftKey:true}).stopped),false);
  f.select(false);
  assert.equal(Boolean(f.fire('copy').stopped),false);
  assert.equal(Boolean(f.fire('keydown',{metaKey:true}).stopped),false);
  f.select(true);
  assert.equal(Boolean(f.fire('copy',{target:f.element(true)}).stopped),false);
  assert.equal(Boolean(f.fire('contextmenu',{target:f.element(true)}).stopped),false);
  assert.equal(Boolean(f.fire('copy',{isTrusted:false}).stopped),false);
});

test('right-button drag is left to Mouse Gestures, normal right-click is restored',()=>{
  const f=fixture();f.api.setEnabled(true);
  f.fire('mousedown',{clientX:10,clientY:10});
  f.fire('mousemove',{clientX:90,clientY:10});
  assert.equal(Boolean(f.fire('contextmenu').stopped),false);
  f.fire('mousedown',{clientX:20,clientY:10});
  assert.equal(f.fire('contextmenu').stopped,true);
});

test('switch-off and disposal remove style and stop intercepting',()=>{
  const f=fixture();f.api.setEnabled(true);
  f.api.setEnabled(false);
  assert.equal(f.style.isConnected,false);
  assert.equal(Boolean(f.fire('selectstart').stopped),false);
  f.api.setEnabled(true);assert.equal(f.style.isConnected,true);
  f.ui.destroy();
  assert.equal(f.style.isConnected,false);
  f.api.setEnabled(true);
  assert.equal(f.style.isConnected,false);
  assert.equal(f.api.isActive(),false);
});
