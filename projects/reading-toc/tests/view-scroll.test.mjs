import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createReadingTocView} from '../trusted/view.js';
import catalog from '../trusted/locales.generated.js';

const ROW=24, HEIGHT=120;
function snapshot({activeId='h-1',adapter='article',revision=1}={}){
 const items=Array.from({length:30},(_,i)=>({id:`h-${i+1}`,label:`Heading ${i+1}`,
  sourceId:adapter==='chatgpt'&&i>=15?'s-2':'s-1',depth:0,topId:`h-${i+1}`}));
 return {items,sources:[{id:'s-1',label:'Article'},{id:'s-2',label:'Second answer'}],activeId,adapter,revision};
}

// jsdom supplies the real DOM, event propagation and closed-shadow focus rules.
// Only layout is simulated: rows flow in DOM order, with long labels wrapping.
// Programmatic scrollTop writes deliberately do not invent trusted input events.
function fixture(t,initial=snapshot()){
 const dom=new JSDOM('<!doctype html><body><main tabindex="0">Article body</main></body>',{url:'https://example.org/article'});
 const win=dom.window,doc=win.document;
 let root;
 const attach=win.Element.prototype.attachShadow;
 win.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
 const rect=(top,height,left=900,width=254)=>({top,bottom:top+height,left,right:left+width,width,height,x:left,y:top,toJSON(){return this;}});
 const rowHeight=node=>(node.textContent.length>50?2:1)*ROW;
 win.HTMLElement.prototype.getBoundingClientRect=function(){
  const nav=root?.querySelector('nav');
  const list=nav?.querySelector('ul');
  const row=this.closest('li');
  if(row&&list?.contains(row)){
   let offset=0;
   for(const sibling of list.children){if(sibling===row)break;offset+=rowHeight(sibling);}
   return rect(150+offset-nav.scrollTop,rowHeight(row));
  }
  if(this===nav||this===list)return rect(150,HEIGHT);
  if(this.classList.contains('edge-toggle'))return rect(105,46);
  return rect(100,200);
 };
 const frames=new Map(),timers=new Map();let serial=0;
 win.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};
 win.cancelAnimationFrame=id=>frames.delete(id);
 win.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;};
 win.clearTimeout=id=>timers.delete(id);
 const observers=[];
 win.ResizeObserver=class{
  constructor(fn){this.fn=fn;this.active=true;observers.push(this);}
  observe(){} unobserve(){} disconnect(){this.active=false;}
 };
 // Track only listeners installed by the view on long-lived page targets.
 const listeners=[];
 for(const target of [doc,win]){
  const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
  target.addEventListener=(type,fn,options)=>{listeners.push({target,type,fn,options,active:true});add(type,fn,options);};
  target.removeEventListener=(type,fn,options)=>{
   const capture=value=>typeof value==='boolean'?value:!!value?.capture;
   for(const entry of listeners)if(entry.target===target&&entry.type===type&&entry.fn===fn&&capture(entry.options)===capture(options))entry.active=false;
   remove(type,fn,options);
  };
 }
 const prior=Object.getOwnPropertyDescriptor(globalThis,'CSSStyleSheet');
 globalThis.CSSStyleSheet=class{replaceSync(){}};
 let view;
 try{view=createReadingTocView({doc,win,onNavigate(){}});}
 finally{if(prior)Object.defineProperty(globalThis,'CSSStyleSheet',prior);else delete globalThis.CSSStyleSheet;}
 const nav=root.querySelector('nav'),list=nav.querySelector('ul');
 Object.defineProperties(nav,{
  clientHeight:{get:()=>HEIGHT},
  scrollHeight:{get:()=>[...list.children].reduce((sum,row)=>sum+rowHeight(row),0)}
 });
 let scrollTop=0;
 Object.defineProperty(nav,'scrollTop',{get:()=>scrollTop,set:value=>{scrollTop=Math.max(0,Math.min(Number(value),nav.scrollHeight-HEIGHT));}});
 const flush=()=>{
  for(let n=0;frames.size&&n<10;n++)for(const [id,fn] of [...frames]){frames.delete(id);fn(0);}
  assert.equal(frames.size,0,'animation work settles');
 };
 const render=value=>{view.render(value);flush();};
 const mode=name=>{root.querySelector(`button[data-mode="${name}"]`).click();flush();};
 render(initial);mode('full');
 const mutations=new win.MutationObserver(()=>{});
 mutations.observe(root,{subtree:true,childList:true,attributes:true,characterData:true});
 t.after(()=>{mutations.disconnect();view.dispose();dom.window.close();});
 const button=id=>list.querySelector(`button[data-id="${id}"]`);
 const offset=id=>button(id).getBoundingClientRect().top-nav.getBoundingClientRect().top;
 const input=kind=>{
  const event=kind==='wheel'?new win.WheelEvent('wheel',{bubbles:true,composed:true,deltaY:120}):
   kind==='key'?new win.KeyboardEvent('keydown',{bubbles:true,composed:true,key:'PageDown'}):
   new win.Event(kind==='pointer'?'pointerdown':'scroll',{bubbles:kind!=='scroll',composed:true});
  (kind==='key'?button('h-10'):nav).dispatchEvent(event);flush();
 };
 return {view,win,doc,root,nav,list,button,offset,render,mode,input,flush,mutations,frames,timers,observers,listeners};
}

for(const change of ['identical snapshot','revision only']){
 test(`${change} leaves the rendered DOM untouched`,t=>{
  const value=snapshot(),f=fixture(t,value);f.mutations.takeRecords();
  f.render(change==='revision only'?{...value,revision:2}:structuredClone(value));
  assert.deepEqual(f.mutations.takeRecords().map(record=>({type:record.type,
   target:record.target.nodeName,attribute:record.attributeName})),[]);
 });
 test(`${change} preserves manually chosen scroll position`,t=>{
  const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;
  f.render(change==='revision only'?{...value,revision:2}:structuredClone(value));
  assert.equal(f.nav.scrollTop,211);
 });
 test(`${change} preserves keyboard focus in the closed shadow root`,t=>{
  const value=snapshot(),f=fixture(t,value),focused=f.button('h-10');focused.focus();
  assert.equal(f.root.host.shadowRoot,null,'production shadow root stays closed');
  f.render(change==='revision only'?{...value,revision:2}:structuredClone(value));
  assert.equal(f.root.activeElement,focused);
 });
}

for(const change of ['insert above','insert below','wrap label above']){
 test(`${change} preserves the first visible heading relative to the viewport`,t=>{
  const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;
  const before=f.offset('h-9'),next=structuredClone(value);next.revision++;
  if(change==='wrap label above')next.items[1].label='A streaming heading with a much longer label that wraps to another line';
  else next.items.splice(change==='insert above'?0:25,0,{id:'new',sourceId:'s-1',label:'New heading',depth:0,topId:'new'});
  f.render(next);
  assert.equal(f.offset('h-9'),before);
 });
}

test('editing a heading label retains focus on its existing navigation control',t=>{
 const value=snapshot(),f=fixture(t,value),focused=f.button('h-10');focused.focus();
 const next=structuredClone(value);next.items[9].label='Renamed heading';f.render(next);
 assert.equal(f.root.activeElement,focused);
 assert.equal(focused.textContent,'Renamed heading');
});

test('removing the first visible heading preserves the next visible surviving heading',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;
 const before=f.offset('h-10'),next=structuredClone(value);
 next.items=next.items.filter(item=>item.id!=='h-9');f.render(next);
 assert.equal(f.offset('h-10'),before);
});

test('moving a heading above the viewport preserves the visible anchor',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;
 const before=f.offset('h-9'),next=structuredClone(value);
 next.items.unshift(next.items.splice(25,1)[0]);f.render(next);
 assert.equal(f.offset('h-9'),before);
});

test('a content-identical locale catalog does not rewrite the DOM',t=>{
 const f=fixture(t);f.mutations.takeRecords();
 f.view.setLocale('zh-CN',structuredClone(catalog));
 assert.deepEqual(f.mutations.takeRecords(),[]);
});

test('ChatGPT full mode keeps the same list rows when reading moves to another answer',t=>{
 const value=snapshot({adapter:'chatgpt'}),f=fixture(t,value),rows=[...f.list.children];
 f.render({...value,activeId:'h-20'});
 assert.deepEqual([...f.list.children],rows);
});

test('ChatGPT full mode retains keyboard focus when the active answer changes',t=>{
 const value=snapshot({adapter:'chatgpt'}),f=fixture(t,value),focused=f.button('h-10');focused.focus();
 f.render({...value,activeId:'h-20'});
 assert.equal(f.root.activeElement,focused);
});

function assertVisible(f,id){
 const row=f.button(id).getBoundingClientRect(),nav=f.nav.getBoundingClientRect();
 assert.ok(row.top>=nav.top&&row.bottom<=nav.bottom,`${id} is revealed in the navigation viewport`);
}

test('an active-only reading update follows the newly read heading',t=>{
 const value=snapshot(),f=fixture(t,value);f.render({...value,activeId:'h-25'});
 assertVisible(f,'h-25');
 assert.equal(f.button('h-25').getAttribute('aria-current'),'location');
});

for(const kind of ['wheel','scroll','key','pointer']){
 test(`navigation ${kind} prevents active updates from stealing the browsing position`,t=>{
  const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input(kind);
  f.render({...value,activeId:'h-25'});
  assert.equal(f.nav.scrollTop,211);
 });
 test(`navigation ${kind} prevents new headings from stealing the visible anchor`,t=>{
  const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input(kind);
  const before=f.offset('h-9'),next=structuredClone(value);
  next.items.unshift({id:'new',label:'New heading',depth:0,sourceId:'s-1',topId:'new'});
  next.activeId='h-25';f.render(next);
  assert.equal(f.offset('h-9'),before);
 });
}

test('wheel input in the article followed by scrolling resumes following after manual navigation browsing',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input('wheel');
 f.render({...value,activeId:'h-25'});assert.equal(f.nav.scrollTop,211,'manual browsing is initially respected');
 const article=f.doc.querySelector('main');
 article.dispatchEvent(new f.win.WheelEvent('wheel',{bubbles:true,composed:true,deltaY:120}));
 article.dispatchEvent(new f.win.Event('scroll',{bubbles:false,composed:true}));f.flush();
 f.render({...value,activeId:'h-26'});assertVisible(f,'h-26');
});

test('layout or programmatic article scroll does not resume following after manual navigation browsing',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input('wheel');
 const before=f.offset('h-9');
 // Content insertion above the article can make native scroll anchoring emit
 // scroll without a new reading gesture. Scroll alone must not steal the TOC.
 f.doc.querySelector('main').dispatchEvent(new f.win.Event('scroll',{bubbles:false,composed:true}));
 f.doc.dispatchEvent(new f.win.Event('scroll'));f.flush();
 const next=structuredClone(value);
 next.items.unshift({id:'new',label:'Inserted above',depth:0,sourceId:'s-1',topId:'new'});
 next.activeId='h-25';f.render(next);
 assert.equal(f.offset('h-9'),before);
});

test('an explicit mode choice resumes following after manual navigation browsing',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input('wheel');
 f.render({...value,activeId:'h-25'});assert.equal(f.nav.scrollTop,211,'manual browsing is initially respected');
 f.mode('top');assertVisible(f,'h-25');
});

test('choosing the current mode again explicitly resumes following',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input('wheel');
 f.render({...value,activeId:'h-25'});assert.equal(f.nav.scrollTop,211);
 f.mode('full');assertVisible(f,'h-25');
});

test('polling while collapsed and after expansion preserves the browsing position',t=>{
 const value=snapshot(),f=fixture(t,value);f.nav.scrollTop=211;f.input('wheel');
 f.view.setCollapsed(true);assert.equal(f.root.querySelector('.panel').hidden,true);
 const next={...value,activeId:'h-25',revision:2};f.render(next);
 assert.equal(f.nav.scrollTop,211,'hidden polling does not scroll');
 f.view.setCollapsed(false);f.flush();assert.equal(f.root.querySelector('.panel').hidden,false);
 f.render({...next,revision:3});assert.equal(f.nav.scrollTop,211,'expanded polling does not scroll');
});

test('dispose releases page listeners, observers and scheduled follow work',t=>{
 const f=fixture(t);f.input('wheel');
 f.doc.dispatchEvent(new f.win.Event('scroll'));f.view.dispose();
 assert.equal(f.root.host.isConnected,false);
 assert.deepEqual(f.listeners.filter(entry=>entry.active&&['scroll','wheel','touchstart','keydown','pointerdown','resize'].includes(entry.type)).map(entry=>entry.type),[]);
 assert.ok(f.observers.every(observer=>!observer.active));
 assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
 f.view.dispose();
});

test('render after disposal leaves the retired view untouched',t=>{
 const f=fixture(t);f.view.dispose();f.mutations.takeRecords();
 const before=f.nav.scrollTop;
 f.render(snapshot({activeId:'h-25',revision:2}));
 assert.deepEqual(f.mutations.takeRecords(),[]);
 assert.equal(f.nav.scrollTop,before);
 assert.equal(f.root.host.isConnected,false);
});
