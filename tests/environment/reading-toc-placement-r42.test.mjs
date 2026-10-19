import test from 'node:test';
import assert from 'node:assert/strict';
import {readTocPlacement,tocViewport,tocBounds,tocClampPoint,
  tocPlacementFromPoint,tocPlacementPoint} from '../../examples/sidebar-tools/reading-toc/trusted/placement.js';
import {readingTocPlacementKey,READING_TOC_PLACEMENT_PREFIX} from '../../examples/sidebar-tools/reading-toc/trusted/policy.js';
import {createReadingTocView} from '../../examples/sidebar-tools/reading-toc/trusted/view.js';

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
  querySelectorAll(selector){
    if(selector!=='button')return [];
    return this.children.flatMap(child=>[child,...child.querySelectorAll(selector)])
      .filter(child=>child.tagName==='BUTTON');
  }
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
  const pointer=(x,y)=>({pointerId:7,button:0,isPrimary:true,clientX:x,clientY:y,
    preventDefault(){}});
  return {doc,win,host,handle,pointer};
}

test('expanded composer above the viewport midpoint keeps the compact card outside the whole form',()=>{
  const oldSheet=globalThis.CSSStyleSheet,oldRect=MockElement.prototype.getBoundingClientRect;
  globalThis.CSSStyleSheet=class {replaceSync(){}};
  try{
    for(const [formTop,inputTop,width] of [[170,180,900],[90,320,900],[40,320,900],[40,320,600]]){
      const f=viewFixture();f.win.innerWidth=width;f.win.innerHeight=400;
      const form={getBoundingClientRect:()=>({top:formTop,bottom:400,left:0,right:900,height:400-formTop})};
      const input={getClientRects:()=>[1],closest:()=>form,
        getBoundingClientRect:()=>({top:inputTop,bottom:inputTop+50,left:0,right:810,height:50})};
      f.doc.querySelector=selector=>selector==='#prompt-textarea'?input:null;
      MockElement.prototype.getBoundingClientRect=function(){
        const base=oldRect.call(this);
        if(this.win!==f.win)return base;
        if(this.attributes.has('data-opendesk-toc-root')){
          const limit=parseFloat(this.style['--toc-scroll-limit']);
          const height=60+Math.min(120,Number.isFinite(limit)?limit:120);
          const bottom=parseFloat(this.style['--toc-bottom']);
          const top=Number.isFinite(bottom)?f.win.innerHeight-bottom-height:base.top;
          return {...base,height,top,bottom:top+height};
        }
        if(this.className==='scroll')return {...base,top:f.host().getBoundingClientRect().top+60};
        return base;
      };
      const view=createReadingTocView({doc:f.doc,win:f.win,onNavigate:()=>{}});
      if(formTop===40)assert.equal(f.host().hidden,true,'float is temporarily hidden when even its header cannot fit');
      else{assert.equal(f.host().hidden,false);assert(f.host().getBoundingClientRect().bottom<=formTop-8,
        'the whole expanded form is avoided even when its height exceeds half the viewport');}
      if(width>720)assert(Number.isFinite(parseFloat(f.host().style['--toc-scroll-limit'])));
      f.doc.querySelector=()=>null;f.win.fire('resize');
      assert.equal(f.host().style['--toc-scroll-limit'],undefined,'normal layout is restored when the composer disappears');
      assert.equal(f.host().style.top,undefined);
      assert.equal(f.host().hidden,false,'float returns when composer no longer consumes the viewport');
      view.dispose();
    }
  }finally{globalThis.CSSStyleSheet=oldSheet;MockElement.prototype.getBoundingClientRect=oldRect;}
});

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
    assert.equal(f.host().shadow.children[0].children[0].children.length,2,
      'in-page toolbar contains only the grab handle and four view modes');
    assert.equal(f.host().shadow.children[0].children[0].children[1].children.length,4,
      'the webpage overlay includes the approved fourth AI icon');
    f.handle().fire('dblclick');
    assert.deepEqual(writes,[writes[0],writes[1],null],
      'double-click on the existing drag handle resets position without a refresh-like icon');
    assert.equal(f.host().attributes.has('data-toc-custom'),false);
    f.handle().fire('keydown',{key:'ArrowDown',preventDefault(){}});
    f.handle().fire('keydown',{key:'Home',preventDefault(){}});
    assert.equal(writes.at(-1),null,'Home keeps existing keyboard reset semantics');
    const original=f.host().getBoundingClientRect();
    f.handle().fire('pointerdown',f.pointer(original.left+25,original.top+20));
    f.handle().fire('pointermove',f.pointer(50,100));
    f.handle().fire('pointercancel',f.pointer(50,100));
    assert.equal(writes.length,5,'canceled drags do not save');
    assert.equal(f.host().attributes.has('data-toc-custom'),false);
    view.setPlacement({v:1,dock:'right',x:0.7,y:0.5});
    assert.equal(f.host().getBoundingClientRect().right,f.win.innerWidth-8);
    assert.equal(writes.length,5,'restoring another tab preference does not re-save');
    view.dispose();view.dispose();
    assert.equal(f.host().removed,true);
    assert.equal(f.win.events.get('resize').size,0,'no window listener leak');
  }finally{globalThis.CSSStyleSheet=oldSheet;}
});

test('R4.3 webpage view shows adaptive summary and opens full outline only on request',()=>{
  const oldSheet=globalThis.CSSStyleSheet;
  globalThis.CSSStyleSheet=class {replaceSync(){}};
  try{
    const f=viewFixture(),nav=[];
    const view=createReadingTocView({doc:f.doc,win:f.win,onNavigate:(id)=>nav.push(id)});
    const heading=(id,depth,parentId)=>({id,sourceId:'s-1',label:'章节 '+id,
      depth,parentId,topId:'h-1'});
    const items=[heading('h-1',0,null),
      ...Array.from({length:24},(_,i)=>heading('h-'+(i+2),1,'h-1'))];
    const overview={ids:items.slice(0,12).map(item=>item.id),
      representedId:'h-1',hiddenCount:13,depth:1};
    view.render({items,sources:[{id:'s-1',label:'当前网页'}],activeId:'h-25',
      overview:{'s-1':overview}});
    const scroll=f.host().shadow.children[0].children[1];
    const list=scroll.children[0],ai=f.host().shadow.children[0].children[2];
    assert.equal(scroll.children.length,2,'no extra see-all button can be mounted');
    assert.equal(f.host().shadow.children[0].children[0].children[1].hidden,false,
      'all four modes remain visible on long outlines');
    const modes=f.host().shadow.children[0].children[0].children[1].children;
    assert.equal(modes[1].attributes.get('aria-pressed'),'true','current chapter is selected by default');
    assert.equal(modes[0].attributes.get('aria-pressed'),'false');
    assert.equal(list.children.length,25,'current chapter expands its children by default');
    assert.equal(list.children.at(-1).children[0].attributes.get('aria-current'),'location',
      'default view highlights the active chapter rather than the overview root');
    modes[0].fire('click');
    assert.equal(list.children.length,12,'long overview is a real twelve-heading sample');
    assert.equal(scroll.children.length,2,'long overview adds no redundant action');
    list.children[1].children[0].fire('click');
    assert.deepEqual(nav,['h-2'],'real visible child remains navigable');
    modes[2].fire('click');
    assert.equal(list.children.length,25,'existing full icon reveals all headings');
    modes[3].fire('click');
    assert.equal(scroll.hidden,true,'AI view hides the free navigation');
    assert.equal(ai.hidden,false,'fourth icon opens the real unavailable AI surface');
    assert.equal(ai.children.length,2,'member and partner cards only');
    assert.equal(ai.querySelectorAll('button').length,0,'no fake AI or purchase buttons');
    assert.equal(ai.children[0].children[2].textContent,'服务暂未开放');
    assert.equal(ai.children[1].children[1].textContent,'广告位开放合作');
    modes[2].fire('click');
    assert.equal(ai.hidden,true);
    assert.equal(scroll.hidden,false);
    assert.equal(list.children.length,25,'switching back keeps all real headings');
    view.dispose();
  }finally{globalThis.CSSStyleSheet=oldSheet;}
});

test('R4.7 webpage TOC follows the active answer without a source selector',()=>{
  const original=globalThis.CSSStyleSheet;
  globalThis.CSSStyleSheet=class {replaceSync(){}};
  try{
    const f=viewFixture(),nav=[];
    const view=createReadingTocView({doc:f.doc,win:f.win,
      onNavigate:(id,sourceId)=>nav.push([id,sourceId])});
    const sources=[{id:'s-a',label:'回答 1'},{id:'s-b',label:'回答 2'}];
    const items=[
      {id:'h-a',sourceId:'s-a',depth:0,topId:'h-a',label:'第一条回答'},
      {id:'h-b',sourceId:'s-b',depth:0,topId:'h-b',label:'第二条回答'}
    ];
    const overview={
      's-a':{ids:['h-a'],representedId:'h-a',hiddenCount:0,depth:0},
      's-b':{ids:['h-b'],representedId:'h-b',hiddenCount:0,depth:0}
    };
    const panel=f.host().shadow.children[0];
    const modes=panel.children[0].children[1],list=panel.children[1].children[0];
    const show=activeId=>view.render({items,sources,activeId,overview});
    const shown=()=>list.children[0]?.children[0]?.dataset?.id;
    assert.equal(panel.children.length,3,'header, free outline and hidden AI cards, without a source picker');
    assert.equal(panel.children.some(x=>x.tagName==='SELECT'),false);
    show('h-a');
    assert.equal(shown(),'h-a');
    assert.equal(modes.hidden,false,'four mode icons remain visible even for one heading');
    assert.equal(modes.children.length,4);
    show('h-b');
    assert.equal(shown(),'h-b','overlay automatically follows the currently read answer');
    list.children[0].children[0].fire('click');
    assert.deepEqual(nav,[['h-b','s-b']],'navigation remains scoped to the correct answer');
    show('h-a');
    assert.equal(shown(),'h-a','scrolling back follows the preceding answer without manual input');
    view.dispose();
  }finally{globalThis.CSSStyleSheet=original;}
});

test('R4.6 narrow viewports keep viewport-adaptive scroll height instead of fixed 160/125px',()=>{
  const oldSheet=globalThis.CSSStyleSheet;
  let css='';
  globalThis.CSSStyleSheet=class {replaceSync(value){css=value;}};
  try{
    const f=viewFixture(),view=createReadingTocView({doc:f.doc,win:f.win,onNavigate:()=>{}});
    assert.match(css,/\.scroll\{max-height:min\(68dvh,calc\(100dvh - 150px\),var\(--toc-scroll-limit,10000px\)\)/);
    assert.doesNotMatch(css,/\.scroll\{max-height:min\(160px/);
    assert.doesNotMatch(css,/\.scroll\{max-height:min\(125px/);
    assert.match(css,/@media\(max-width:1100px\)/);
    assert.match(css,/@media\(max-width:720px\)/);
    assert.match(css,/--toc-scroll-limit/,'existing composer collision adjustment remains active');
    view.dispose();
  }finally{globalThis.CSSStyleSheet=oldSheet;}
});

test('R1.8.4 nine-section webpage overview renders directly; AI is fail-closed and localized',()=>{
  const previousSheet=globalThis.CSSStyleSheet;
  globalThis.CSSStyleSheet=class {replaceSync(){}};
  try{
    const f=viewFixture(),navigated=[];
    const view=createReadingTocView({doc:f.doc,win:f.win,
      onNavigate:(id,sourceId)=>navigated.push([id,sourceId])});
    const items=Array.from({length:9},(_,i)=>({
      id:'h-'+(i+1),label:'章节 '+(i+1),sourceId:'s-1',
      depth:i%3===0?0:1,topId:'h-'+(Math.floor(i/3)*3+1)
    }));
    const panel=f.host().shadow.children[0];
    const modes=panel.children[0].children[1].children;
    const caption=panel.children[0].children[0].children[0];
    assert.equal(caption.textContent,'CONTENTS','webpage and Side Panel use the same approved heading');
    const scroll=panel.children[1],list=scroll.children[0],ai=panel.children[2];
    view.render({adapter:'article',items,activeId:'h-2',
      sources:[{id:'s-1',label:'当前文章'}],
      overview:{'s-1':{ids:['h-1','h-4','h-7'],hiddenCount:6,representedId:'h-1'}}});
    assert.equal(list.children.length,9,'nine-heading article is complete on first render without another click');
    assert.equal(modes[0].attributes.get('aria-pressed'),'true','short outlines default to the complete overview');
    modes[0].fire('click');
    assert.equal(list.children.length,9,'overview directly displays all nine actual sections');
    assert.equal(scroll.children.length,2,'no extra see-all button exists');
    assert.equal(list.children[1].children[0].attributes.get('aria-current'),'location',
      'active real heading is highlighted when all are shown');
    modes[3].fire('click');
    assert.equal(ai.hidden,false);
    assert.equal(scroll.hidden,true);
    assert.equal(ai.querySelectorAll('button').length,0);
    view.setLocale('en');
    assert.equal(caption.textContent,'CONTENTS','language switching preserves the approved visual heading');
    assert.equal(ai.children[0].children[2].textContent,'Not yet available',
      'English member unavailability comes from reviewed source locales');
    assert.equal(ai.children[1].children[1].textContent,'Sponsorship space available');
    modes[2].fire('click');
    assert.equal(list.children.length,9,'free chapters persist after visiting AI');
    list.children[2].children[0].fire('click');
    assert.deepEqual(navigated,[['h-3','s-1']]);
    view.dispose();
  }finally{globalThis.CSSStyleSheet=previousSheet;}
});
