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
      visibility:node.style.visibility||'visible',opacity:node.style.opacity||'1',
      overflowY:node===main?'auto':'visible',position:node.style.position||'static'})};
  Object.assign(main,{scrollTop:400,scrollHeight:8701,clientHeight:817});
  const disposals=[],listeners=new Map();
  const owner={on(target,type,listener){
    const events=listeners.get(target)||new Map();
    events.set(type,listener);listeners.set(target,events);
  },click(target,isTrusted=true){
    listeners.get(target)?.get('click')?.({isTrusted,preventDefault(){},stopPropagation(){}});
  },dispatch(target,type){listeners.get(target)?.get(type)?.();},
  setTimeout(){},observe(){return {disconnect(){}};},
    onDispose:fn=>disposals.push(fn),dispose:()=>disposals.forEach(fn=>fn())};
  const context={main,first,last,scroller:main,site:'chatgpt',selector:'article'};
  const mount=(resolveNavigation=()=>({}))=>{
    const dock=installFloatingNavigation({doc,win,owner,resolveNavigation,resolveConversation:()=>context});
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

test('native composer collision moves navigation sideways before moving upward',()=>{
  const f=fixture(),native=f.doc.createElement('button');f.main.append(native);
  f.rects.set(native,box(330,710,80,100));
  const {host}=f.mount();
  assert.equal(host.style.left,'422px');
  assert.equal(host.style.top,'707px');
});

test('tall native controls do not push the dock to the upper half',()=>{
  const f=fixture(),native=f.doc.createElement('button');f.main.append(native);
  f.rects.set(native,box(320,600,100,200));
  const {host}=f.mount();
  assert.equal(host.style.left,'432px');
  assert.equal(host.style.top,'707px');
});

test('transparent sidebar action parents do not hide the conversation dock',()=>{
  const f=fixture({sidebar:true});
  for(const y of [707,605,503]) {
    const parent=f.doc.createElement('span'),button=f.doc.createElement('button');
    parent.style.opacity='0';parent.append(button);f.nav.append(parent);
    f.rects.set(button,box(320,y,50,40));
  }
  const {host}=f.mount();
  assert.ok(host);
  assert.equal(host.style.left,'328px');
  assert.equal(host.style.top,'707px');
});

test('visible shadow controls reserve space while the dock stays near the bottom',()=>{
  const f=fixture(),peer=f.doc.createElement('div');f.doc.documentElement.append(peer);
  const shadow=peer.attachShadow({mode:'open'}),button=f.doc.createElement('button');
  shadow.append(button);f.rects.set(button,box(328,400,52,400));
  const {host}=f.mount();
  assert.ok(host);
  assert.equal(host.style.left,'392px');
  assert.equal(host.style.top,'707px');
  assert.equal(peer.isConnected,true);
});

test('closed fixed peer hosts reserve their whole rectangle without reading private controls',()=>{
  const f=fixture(),peer=f.doc.createElement('div');
  peer.style.position='fixed';f.doc.documentElement.append(peer);
  peer.attachShadow({mode:'closed'}).append(f.doc.createElement('button'));
  f.rects.set(peer,box(328,400,52,400));
  const {host}=f.mount();
  assert.ok(host);
  assert.equal(host.style.left,'392px');
  assert.equal(host.style.top,'707px');
});

test('configured conversation avoids crowded controls without jumping above the prompt rail',()=>{
  const f=fixture();
  Object.assign(f.win,{innerWidth:1031,innerHeight:703});
  Object.assign(f.context,{custom:true,site:'custom'});
  f.rects.set(f.main,box(340,0,691,703));
  f.rects.set(f.first,box(365.75,-17000,640,1200));
  f.rects.set(f.last,box(365.75,-12000,640,12500));
  f.rects.set(f.editor,box(417.75,635,410,36));
  for(const rect of [box(373.75,635,36,36),box(359.75,507.8,64,32),box(961.75,635,36,36)]) {
    const button=f.doc.createElement('button');f.main.append(button);f.rects.set(button,rect);
  }
  const peer=f.doc.createElement('div');peer.style.position='fixed';
  peer.attachShadow({mode:'closed'});f.doc.documentElement.append(peer);
  f.rects.set(peer,box(349,261.5,52,181));
  const {host}=f.mount();
  assert.ok(host,'navigation remains available without moving or covering a peer');
  assert.equal(host.style.left,'436px');
  assert.equal(host.style.top,'539px');
  assert.equal(host.shadowRoot.querySelectorAll('button').length,2);
  assert.equal(peer.isConnected,true);
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

test('configured dock ignores message indentation and stays in the visible scroller',()=>{
  const f=fixture();
  Object.assign(f.context,{custom:true});
  f.rects.set(f.first,box(900,-10000,400,500));
  f.rects.set(f.last,box(1000,-500,300,800));
  const scroller=f.doc.createElement('div');f.main.append(scroller);
  Object.assign(scroller,{scrollTop:400,scrollHeight:9000,clientHeight:500});
  f.rects.set(scroller,box(360,100,900,500));f.context.scroller=scroller;
  const {dock,host}=f.mount();
  assert.equal(host.style.left,'368px');
  assert.equal(host.style.top,'490px');
  f.rects.set(f.first,box(600,0,400,500));dock.refresh();
  assert.equal(host.style.left,'368px','scrolling messages never moves the dock horizontally');
});

test('fully blocked bottom-left area hides instead of moving to the top or right edge',()=>{
  const f=fixture(),obstacle=f.doc.createElement('button');f.main.append(obstacle);
  f.rects.set(obstacle,box(320,550,400,267));
  const {host}=f.mount();
  assert.ok(!host||host.style.visibility==='hidden');
});

test('element client area excludes borders and scrollbar space, including scaled containers',()=>{
  for(const scale of [1,1.5]){
    const f=fixture(),scroller=f.doc.createElement('div'),anchor=f.doc.createElement('div');
    f.main.append(scroller,anchor);
    Object.assign(scroller,{scrollTop:400,scrollHeight:9000,clientWidth:285,clientHeight:496,
      clientLeft:2,clientTop:2,offsetWidth:300,offsetHeight:500});
    f.rects.set(scroller,box(360,0,300*scale,500*scale));
    f.rects.set(anchor,box(650*scale,100,100,100));
    Object.assign(f.context,{custom:true,scroller,anchor});
    const {host}=f.mount();
    const right=360+(2+285)*scale,bottom=(2+496)*scale;
    assert.equal(parseFloat(host.style.left)+42,Math.floor(right-8));
    assert.equal(parseFloat(host.style.top)+90,Math.floor(bottom-20));
  }
});

test('document scroller uses the viewport instead of its moving document rectangle',()=>{
  const f=fixture();Object.assign(f.context,{custom:true,scroller:f.doc.documentElement});
  f.doc.scrollingElement=f.doc.documentElement;
  Object.assign(f.doc.documentElement,{scrollTop:9000,scrollHeight:10000,clientHeight:817});
  f.rects.set(f.doc.documentElement,box(0,-9000,1728,10000));
  const {host}=f.mount();
  assert.equal(host.style.left,'328px');assert.equal(host.style.top,'707px');
});

test('empty or undersized visible scroller intersection never places a dock outside it',()=>{
  for(const rect of [box(320,900,1000,500),box(320,0,35,817),box(320,0,1000,70)]){
    const f=fixture(),scroller=f.doc.createElement('div');f.main.append(scroller);
    Object.assign(scroller,{scrollTop:400,scrollHeight:9000,clientHeight:rect.height});
    f.context.scroller=scroller;f.rects.set(scroller,rect);
    const {host}=f.mount();assert.ok(!host||host.style.visibility==='hidden');
  }
});

test('compact horizontal dock remains fully inside the narrow bottom-left viewport',()=>{
  const f=fixture({mainLeft:0,columnLeft:0});
  Object.assign(f.win,{innerWidth:390,innerHeight:600});
  f.rects.set(f.main,box(0,0,390,600));
  const {host}=f.mount();
  assert.equal(host.style.left,'8px');assert.equal(host.style.top,'538px');
  assert.equal(host.shadowRoot.querySelector('.stack').classList.contains('compact'),true);
});

test('container resize schedules repositioning and disposal disconnects the observer',()=>{
  const f=fixture();let resized,disconnected=0;const observed=[],timers=[];
  f.win.ResizeObserver=class {
    constructor(callback){resized=callback;}
    observe(target){observed.push(target);}
    disconnect(){disconnected++;}
  };
  f.owner.setTimeout=(callback,delay)=>{if(delay===120)timers.push(callback);};
  const {host}=f.mount();assert.deepEqual(observed,[f.main]);
  f.rects.set(f.main,box(320,0,1408,600));resized();timers.shift()();
  assert.equal(host.style.top,'490px');
  f.owner.dispose();assert.equal(disconnected,1);
});

test('resize observer follows replacement scrollers and queued work cannot remount after disposal',()=>{
  const f=fixture(),observed=[],timers=[];let resized,disconnected=0;
  f.win.ResizeObserver=class {
    constructor(callback){resized=callback;}
    observe(target){observed.push(target);}
    disconnect(){disconnected++;}
  };
  f.owner.setTimeout=(callback,delay)=>{if(delay===120)timers.push(callback);};
  const {dock,host}=f.mount();
  const scroller=f.doc.createElement('div');f.main.append(scroller);
  Object.assign(scroller,{scrollTop:400,scrollHeight:9000,clientHeight:500});
  f.rects.set(scroller,box(360,100,900,500));f.context.scroller=scroller;dock.refresh();
  assert.deepEqual(observed,[f.main,f.main,scroller]);assert.equal(disconnected,1);
  assert.equal(host.style.top,'490px');
  resized();f.owner.dispose();timers.shift()();
  assert.equal(disconnected,2);assert.equal(host.isConnected,false);
  assert.equal(f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]'),null);
});

test('visual viewport resize and scroll listeners reposition above the keyboard',()=>{
  const f=fixture(),timers=[];
  const viewport={offsetLeft:0,offsetTop:100,width:1728,height:500};
  f.win.visualViewport=viewport;
  f.owner.setTimeout=(callback,delay)=>{if(delay===120)timers.push(callback);};
  const {host}=f.mount();assert.equal(host.style.top,'490px');
  viewport.height=350;
  f.owner.dispatch(viewport,'resize');timers.shift()();assert.equal(host.style.top,'340px');
  viewport.offsetTop=50;f.owner.dispatch(viewport,'scroll');timers.shift()();
  assert.equal(host.style.top,'290px');
});

test('conversation and floating top flags share one button across every combination and threshold',()=>{
  for(const conversationTop of [false,true])for(const floatingTop of [false,true]){
    const f=fixture();let flags={conversationTop,floatingTop,conversationBottom:false};
    const {dock}=f.mount(()=>flags);
    const buttons=()=>[...f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')?.shadowRoot.querySelectorAll('button')||[]];
    for(const position of [0,1000,0]){
      f.main.scrollTop=position;dock.refresh();
      const expected=conversationTop||(floatingTop&&position===1000);
      assert.equal(buttons().length,expected?1:0,JSON.stringify({flags,position}));
      if(expected)assert.equal(buttons()[0].dataset.scrollNavKey,
        floatingTop&&position===1000?'floatingTop':'conversationTop');
    }
    flags={conversationTop:true,conversationBottom:true,floatingTop:true};dock.refresh();
    assert.equal(buttons().length,2,'restoring flags reuses the dock');
    const stale=buttons()[0];flags={conversationTop:false,conversationBottom:false,floatingTop:false};
    f.main.scrollTop=1000;f.owner.click(stale);
    assert.equal(f.main.scrollTop,1000,'disabled intent cannot act before refresh');
    dock.refresh();assert.equal(buttons().length,0);
    f.owner.dispose();
  }
});

test('bottom can remain enabled when both top modes are disabled',()=>{
  const f=fixture(),{host}=f.mount(()=>({conversationTop:false,floatingTop:false}));
  const controls=host.shadowRoot.querySelectorAll('button');
  assert.equal(controls.length,1);assert.equal(controls[0].dataset.scrollNavKey,'conversationBottom');
  f.owner.click(controls[0]);assert.equal(f.main.scrollTop,f.main.scrollHeight-f.main.clientHeight);
  f.owner.dispose();
});

test('question pager groups explicit user/assistant messages into rounds, tracks progress and respects settings',()=>{
  const f=fixture();f.main.scrollTop=0;
  f.first.setAttribute('data-turn','user');f.last.setAttribute('data-turn','assistant');
  const longReply=f.doc.createElement('article');
  const secondUser=f.doc.createElement('article'),secondAnswer=f.doc.createElement('article');
  longReply.setAttribute('data-turn','assistant');
  secondUser.setAttribute('data-turn','user');secondAnswer.setAttribute('data-turn','assistant');
  f.main.append(longReply,secondUser,secondAnswer);
  f.rects.set(longReply,box(586,760,800,200));
  f.rects.set(secondUser,box(586,960,800,200));
  f.rects.set(secondAnswer,box(586,1200,800,300));
  let flags={turnPaging:true};
  const {dock,host}=f.mount(()=>flags);
  const controls=()=>[...host.shadowRoot.querySelectorAll('button')];
  assert.equal(controls().length,4,'two edge buttons plus previous and next');
  assert.equal(host.shadowRoot.querySelector('.counter'),null,'counter is off by default and has no layout slot');
  const previous=controls().find(b=>b.dataset.scrollNavKey==='turnPrevious');
  const next=controls().find(b=>b.dataset.scrollNavKey==='turnNext');
  assert.equal(previous.disabled,true);assert.equal(next.disabled,false);
  f.owner.click(next,false);assert.equal(f.main.scrollTop,0,'untrusted click cannot page');
  f.owner.click(previous);assert.equal(f.main.scrollTop,0,'first round has no predecessor');
  f.owner.click(next);assert.equal(f.main.scrollTop,948,'next page targets user prompt, not assistant text');
  f.rects.set(f.first,box(586,-868,800,400));
  f.rects.set(f.last,box(870,-448,550,300));
  f.rects.set(secondUser,box(586,12,800,200));
  f.rects.set(secondAnswer,box(586,252,800,300));
  dock.refresh();
  assert.equal(host.shadowRoot.querySelector('.counter'),null,'paging works while counter is hidden');
  assert.equal(next.disabled,true,'last round has no successor');
  flags={turnPaging:true,showTurnCount:true};dock.refresh();
  assert.equal(host.shadowRoot.querySelector('.counter').textContent,'2/2');
  assert.equal(controls().length,4,'counter is informational, not a fifth button');
  flags={turnPaging:true,showTurnCount:false};dock.refresh();
  assert.equal(host.shadowRoot.querySelector('.counter'),null,'turning the counter off removes its slot');
  assert.equal(controls().length,4);
  f.owner.click(previous);
  assert.ok(f.main.scrollTop<948,'previous still navigates when the number is hidden');
  const beforeDisabled=f.main.scrollTop;
  flags={turnPaging:false,showTurnCount:true};
  f.owner.click(previous);assert.equal(f.main.scrollTop,beforeDisabled,'disabled intent rejects stale control before refresh');
  dock.refresh();
  assert.equal(controls().length,2,'disabling the pager preserves existing edge buttons');
  flags={turnPaging:true};secondUser.removeAttribute('data-turn');dock.refresh();
  assert.equal(controls().length,2,'ambiguous author roles do not fabricate a round count');
  f.owner.dispose();
});

test('question pager can operate with both whole-conversation edge buttons disabled',()=>{
  const f=fixture();f.first.setAttribute('data-turn','user');f.last.setAttribute('data-turn','user');
  const {host}=f.mount(()=>({turnPaging:true,showTurnCount:true,
    conversationTop:false,conversationBottom:false,floatingTop:false}));
  assert.equal(host.shadowRoot.querySelectorAll('button').length,2);
  assert.equal(host.shadowRoot.querySelector('.counter').textContent,'1/2');
  f.owner.dispose();
});


test('last-turn bottom boundary keeps back navigation usable',()=>{
  const f=fixture();
  f.first.setAttribute('data-turn','user');
  f.last.setAttribute('data-turn','user');
  f.main.scrollTop=f.main.scrollHeight-f.main.clientHeight;
  const {dock,host}=f.mount();
  const get=key=>host.shadowRoot.querySelector('[data-scroll-nav-key="'+key+'"]');
  const top=get('conversationTop'),previous=get('turnPrevious');
  const next=get('turnNext'),bottom=get('conversationBottom');
  assert.ok(top&&previous&&next&&bottom,'four physical buttons stay mounted');
  assert.equal(top.disabled,false,'top remains available at the bottom');
  assert.equal(previous.disabled,false,'previous question remains available at the bottom');
  assert.equal(next.disabled,true,'there is no question after the last loaded one');
  assert.equal(bottom.disabled,true,'already at the end of the scrollport');
  f.main.scrollTop=0;dock.refresh();
  assert.equal(top.disabled,true);
  assert.equal(previous.disabled,true);
  assert.equal(next.disabled,false);
  assert.equal(bottom.disabled,false);
  f.owner.dispose();
});
