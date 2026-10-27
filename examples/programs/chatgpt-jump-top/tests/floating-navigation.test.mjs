import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installFloatingNavigation} from '../src/floating-navigation.js';

const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
function fixture({mainLeft=320,columnLeft=320,sidebar=false}={}) {
  const {document:doc,window}=parseHTML('<html><body><aside></aside><main><section><article>First</article><article>Last</article><div id="prompt-textarea" contenteditable="true"></div></section></main></body></html>');
  const main=doc.querySelector('main'),column=doc.querySelector('section');
  const first=doc.querySelector('article'),last=main.querySelectorAll('article')[1];
  const editor=doc.querySelector('#prompt-textarea'),nav=doc.querySelector('aside');
  const rects=new Map([[main,box(mainLeft,0,1728-mainLeft,817)],
    [column,box(columnLeft,0,1728-columnLeft,817)],
    [first,box(586,80,800,400)],[last,box(870,500,550,300)],
    [editor,box(640,740,770,54)],[nav,box(0,0,320,817)]]);
  if(!sidebar)nav.hidden=true;
  window.HTMLElement.prototype.getBoundingClientRect=function(){return rects.get(this)||
    box(parseFloat(this.style.left)||0,parseFloat(this.style.top)||0,42,90);};
  const win={innerWidth:1728,innerHeight:817,location:new URL('https://chatgpt.com/c/existing'),
    getComputedStyle:node=>({display:node.hidden?'none':node.style.display||'block',
      visibility:node.style.visibility||'visible',opacity:'1',
      overflowY:node===main?'auto':'visible',position:'static'})};
  Object.assign(main,{scrollTop:400,scrollHeight:8701,clientHeight:817});
  const disposals=[],listeners=new Map();
  const owner={on(target,type,listener){
    const events=listeners.get(target)||new Map();
    events.set(type,listener);listeners.set(target,events);
  },click(target,isTrusted=true){
    listeners.get(target)?.get('click')?.({isTrusted,preventDefault(){},stopPropagation(){}});
  },setTimeout(){},observe(){return {disconnect(){}};},
    onDispose:fn=>disposals.push(fn),dispose:()=>disposals.forEach(fn=>fn())};
  const context={main,first,last,scroller:main,site:'chatgpt',selector:'article'};
  const mount=()=>{
    const dock=installFloatingNavigation({doc,win,owner,resolveConversation:()=>context});
    return {dock,host:doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')};
  };
  return {doc,win,main,column,first,last,editor,nav,rects,owner,context,mount};
}

test('ChatGPT navigation uses the prompt parent gutter without requiring its installation',()=>{
  const f=fixture(),{dock,host}=f.mount();
  // Align the sibling containers: the prompt rail's inner padding is not a gutter.
  assert.equal(host.parentElement,f.doc.documentElement);
  assert.equal(host.style.left,'328px');
  assert.equal(host.shadowRoot.querySelectorAll('button').length,2);
  const prompts=f.doc.createElement('div');
  prompts.setAttribute('data-opendesk-prompts','');prompts.style.left='328px';
  f.doc.documentElement.append(prompts);
  f.rects.set(f.first,box(1000,80,400,400));
  f.rects.set(f.last,box(1100,500,300,300));
  dock.refresh();assert.equal(host.style.left,prompts.style.left,'sibling containers share their left edge');
  assert.equal(host.parentElement,prompts.parentElement);
  f.owner.dispose();assert.equal(host.isConnected,false);
  assert.equal(prompts.isConnected,true,'disposing navigation preserves the prompt owner');
});

test('visible sibling navigation and full-height composer column reserve the left region',()=>{
  const f=fixture({mainLeft:0,sidebar:true}),{dock,host}=f.mount();
  assert.equal(host.style.left,'328px');
  f.nav.hidden=true;
  f.rects.set(f.column,box(0,0,1728,817));
  dock.refresh();assert.equal(host.style.left,'8px','hidden sidebar reserves no gutter');
});

test('native composer collision moves navigation upward within the same left gutter',()=>{
  const f=fixture(),native=f.doc.createElement('button');f.main.append(native);
  f.rects.set(native,box(330,710,80,100));
  const {host}=f.mount();
  assert.equal(host.style.left,'328px');
  assert.ok(parseFloat(host.style.top)+90<=710);
});

test('ChatGPT collision avoidance keeps the shared left gutter after two blocked slots',()=>{
  const f=fixture(),native=f.doc.createElement('button');f.main.append(native);
  f.rects.set(native,box(320,600,100,200));
  const {host}=f.mount();
  assert.equal(host.style.left,'328px');
  assert.ok(parseFloat(host.style.top)+90<=600);
});

test('aligned dock scrolls both directions and updates boundary disabled states',()=>{
  const f=fixture(),{dock,host}=f.mount();
  const [top,bottom]=host.shadowRoot.querySelectorAll('button');
  f.owner.click(top,false);assert.equal(f.main.scrollTop,400,'untrusted click does not scroll');
  f.owner.click(top);dock.refresh();
  assert.equal(f.main.scrollTop,0);assert.equal(top.disabled,true);assert.equal(bottom.disabled,false);
  f.owner.click(bottom);dock.refresh();
  assert.equal(f.main.scrollTop,f.main.scrollHeight-f.main.clientHeight);
  assert.equal(top.disabled,false);assert.equal(bottom.disabled,true);
  assert.equal(host.style.left,'328px');
});

test('custom selected anchor retains its existing positioning',()=>{
  const f=fixture(),anchor=f.doc.createElement('div');f.main.append(anchor);
  f.rects.set(anchor,box(450,100,100,100));
  Object.assign(f.context,{custom:true,anchor});
  const {host}=f.mount();assert.equal(host.style.left,'462px');
});
