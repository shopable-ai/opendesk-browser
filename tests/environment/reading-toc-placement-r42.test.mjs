import test from 'node:test';
import assert from 'node:assert/strict';
import {readTocPlacement,tocViewport,tocBounds,tocClampPoint,
  tocPlacementFromPoint,tocPlacementPoint} from '../../src/reading-toc/placement.js';
import {readingTocPlacementKey,READING_TOC_PLACEMENT_PREFIX} from '../../src/reading-toc/policy.js';
import {createReadingTocView} from '../../src/reading-toc/view.js';

test('R4.2 placement math is bounded, proportional, edge-snapped and input-validated',()=>{
  const viewport={left:0,top:0,width:1200,height:800},size={width:254,height:300};
  assert.equal(tocPlacementFromPoint(9,90,size,viewport).dock,'left');
  assert.equal(tocPlacementFromPoint(940,90,size,viewport).dock,'right');
  const free=tocPlacementFromPoint(500,200,size,viewport);
  assert.equal(free.dock,'free','mid-screen is not forced to the edge');
  const stored=tocPlacementPoint(free,{width:220,height:300},
    {left:0,top:0,width:500,height:420});
  assert(stored.left>=8&&stored.left<=272&&stored.top>=8&&stored.top<=112);
  assert.deepEqual(tocClampPoint(-50,2000,size,viewport),{left:8,top:492});
  assert.deepEqual(tocBounds({width:600,height:600},
    {left:30,top:20,width:200,height:100}),{minX:30,maxX:30,minY:20,maxY:20});
  assert.deepEqual(tocViewport({innerWidth:900,innerHeight:700,
    visualViewport:{offsetLeft:30,offsetTop:40,width:320,height:240}}),
  {left:30,top:40,width:320,height:240});
  for(const value of [null,'left',{},[],{v:1,dock:'script',x:0,y:0},
    {v:1,dock:'left',x:Infinity,y:0},{v:1,dock:'right',x:1,y:-1}]){
    assert.equal(readTocPlacement(value),null,'invalid saved placement is ignored');
  }
  assert.deepEqual(readTocPlacement(free),free);
});

test('R4.2 placement preferences are scoped to exact HTTP(S) origin, never URL path',()=>{
  const first=readingTocPlacementKey('https://example.com/a?q=private');
  assert(first.startsWith(READING_TOC_PLACEMENT_PREFIX));
  assert.equal(first,readingTocPlacementKey('https://example.com/b'));
  assert.notEqual(first,readingTocPlacementKey('https://other.example/b'));
  assert.notEqual(first,readingTocPlacementKey('http://example.com/a'));
  assert(!first.includes('private')&&!first.includes('?'));
  assert.equal(readingTocPlacementKey('javascript:alert(1)'),null);
  assert.equal(readingTocPlacementKey('https://user:pass@example.com/'),null);
});

class MockElement {
  constructor(tag,win){
    this.tagName=tag.toUpperCase();this.win=win;this.children=[];this.options=[];
    this.events=new Map();this.attributes=new Map();this.dataset={};
    this.style={removeProperty(key){delete this[key];},setProperty(key,value){this[key]=value;}};
    this.scrollTop=0;
  }
  setAttribute(key,value){this.attributes.set(key,value);}
  removeAttribute(key){this.attributes.delete(key);}
  append(...nodes){
    this.children.push(...nodes);
    if(this.tagName==='SELECT')this.options.push(...nodes);
  }
  replaceChildren(...nodes){
    this.children=nodes.flatMap(node=>node.tagName==='FRAGMENT'?node.children:[node]);
    if(this.tagName==='SELECT')this.options=[...this.children];
  }
  attachShadow(){return this.shadow=new MockElement('shadow',this.win);}
  addEventListener(type,handler){
    if(!this.events.has(type))this.events.set(type,new Set());
    this.events.get(type).add(handler);
  }
  removeEventListener(type,handler){this.events.get(type)?.delete(handler);}
  fire(type,event={}){for(const fn of [...(this.events.get(type)||[])])fn(event);}
  setPointerCapture(id){this.pointerCapture=id;}
  hasPointerCapture(id){return this.pointerCapture===id;}
  releasePointerCapture(id){if(this.pointerCapture===id)this.pointerCapture=null;}
  getBoundingClientRect(){
    if(this.attributes.has('data-opendesk-toc-root')){
      const width=this.win.innerWidth<=1100?220:254,height=180;
      const left=this.style.left!==undefined?parseFloat(this.style.left):this.win.innerWidth-width-8;
      const top=this.style.top!==undefined?parseFloat(this.style.top):8;
      return {width,height,left,top,right:left+width,bottom:top+height};
    }
    return {width:220,height:160,left:0,top:0,right:220,bottom:160};
  }
  querySelectorAll(){return [];}
  querySelector(){return null;}
  remove(){this.removed=true;}
}
function viewFixture(){
  const win={
    innerWidth:800,innerHeight:600,events:new Map(),
    addEventListener(type,fn){
      if(!this.events.has(type))this.events.set(type,new Set());
      this.events.get(type).add(fn);
    },
    removeEventListener(type,fn){this.events.get(type)?.delete(fn);},
    fire(type){for(const fn of this.events.get(type)||[])fn();}
  };
  const doc={body:new MockElement('body',win),defaultView:win,
    createElement:tag=>new MockElement(tag,win),
    createDocumentFragment:()=>new MockElement('fragment',win)};
  const host=()=>doc.body.children[0];
  const handle=()=>host().shadow.children[0].children[0].children[0];
  const reset=()=>host().shadow.children[0].children[0].children[2];
  const pointer=(x,y)=>({pointerId:7,button:0,isPrimary:true,clientX:x,clientY:y,
    preventDefault(){}});
  return {doc,win,host,handle,reset,pointer};
}

test('R4.2 real view controls drag only from handle, persist at release, reset and dispose',()=>{
  const oldSheet=globalThis.CSSStyleSheet;
  globalThis.CSSStyleSheet=class {replaceSync(){}};
  try{
    const f=viewFixture(),writes=[];
    const view=createReadingTocView({doc:f.doc,win:f.win,onNavigate:()=>{},
      onPlacementChange:value=>writes.push(value)});
    const start=f.host().getBoundingClientRect();
    f.handle().fire('pointerdown',f.pointer(start.left+28,start.top+25));
    f.handle().fire('pointermove',f.pointer(36,start.top+100));
    assert.equal(writes.length,0,'moving never triggers storage writes');
    f.handle().fire('pointerup',f.pointer(36,start.top+100));
    assert.equal(writes.length,1,'save once at drop');
    assert.equal(writes[0].dock,'left');
    assert.equal(f.host().getBoundingClientRect().left,8);
    f.win.innerWidth=400;f.win.fire('resize');
    assert.equal(f.host().getBoundingClientRect().left,8,'edge stays visible on resize');
    f.handle().fire('keydown',{key:'ArrowDown',shiftKey:true,preventDefault(){}});
    assert.equal(writes.length,2);
    assert(writes[1].y>writes[0].y,'keyboard moves in 32px increments with Shift');
    f.reset().fire('click');
    assert.deepEqual(writes,[writes[0],writes[1],null],'reset clears stored preference');
    assert.equal(f.host().attributes.has('data-toc-custom'),false);
    const original=f.host().getBoundingClientRect();
    f.handle().fire('pointerdown',f.pointer(original.left+25,original.top+20));
    f.handle().fire('pointermove',f.pointer(50,100));
    f.handle().fire('pointercancel',f.pointer(50,100));
    assert.equal(writes.length,3,'canceled drags do not save');
    assert.equal(f.host().attributes.has('data-toc-custom'),false);
    view.setPlacement({v:1,dock:'right',x:0.7,y:0.5});
    assert.equal(f.host().getBoundingClientRect().right,f.win.innerWidth-8);
    assert.equal(writes.length,3,'restoring another tab preference does not re-save');
    view.dispose();view.dispose();
    assert.equal(f.host().removed,true);
    assert.equal(f.win.events.get('resize').size,0,'no window listener leak');
  }finally{globalThis.CSSStyleSheet=oldSheet;}
});
