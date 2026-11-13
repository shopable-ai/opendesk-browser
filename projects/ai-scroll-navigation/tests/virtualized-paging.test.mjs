import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installFloatingNavigation} from '../src/floating-navigation.js';

const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
const disabled=button=>button.getAttribute('aria-disabled')==='true';
const positions=[80,960,2200];
const landings=positions.map(top=>top-12);

function fixture(t,{href='https://chatgpt.com/c/virtualized',site='chatgpt',stable=true}={}) {
  const {document:doc,window}=parseHTML('<html><body><main></main></body></html>');
  const main=doc.querySelector('main');
  const context={main,scroller:main,site,selector:'[data-content-search-unit-key]'};
  const dimensions={width:1000,height:800};
  window.HTMLElement.prototype.getBoundingClientRect=function(){
    return box(parseFloat(this.style.left)||0,parseFloat(this.style.top)||0,42,42);
  };
  function scrollport(node) {
    Object.assign(node,{scrollTop:0,scrollHeight:3600,clientHeight:800,clientWidth:1000});
    node.getBoundingClientRect=()=>box(0,0,dimensions.width,dimensions.height);
    return node;
  }
  scrollport(main);
  const win={innerWidth:1000,innerHeight:800,location:new URL(href),
    getComputedStyle:node=>({display:node.hidden?'none':'block',visibility:node.style.visibility||'visible',
      opacity:'1',position:node.style.position||'static',overflowY:node===context.scroller?'auto':'visible'})};
  const rounds=positions.map((top,index)=>['user','assistant'].map((role,offset)=>{
    const node=doc.createElement('article');
    node.setAttribute('data-content-search-unit-key',stable?`fallback-turn-${index}:0:${role}`:role);
    node.textContent=`${role} ${index+1}`;
    node.getBoundingClientRect=()=>box(100,top+offset*160-context.scroller.scrollTop,700,120);
    main.append(node);
    return node;
  }));
  const listeners=new Map(),disposals=[],timers=[];
  const owner={
    on(target,type,listener){
      const events=listeners.get(target)||new Map();
      events.set(type,listener);listeners.set(target,events);
    },
    // Same trusted-event seam as floating-navigation.test.mjs; no native input.
    click(target,isTrusted=true){
      assert.ok(target,'navigation control exists');
      listeners.get(target)?.get('click')?.({target,isTrusted,preventDefault(){},stopPropagation(){}});
    },
    setTimeout(callback,delay){timers.push({callback,delay});},observe(){return {disconnect(){}};},
    emit(target,type,event={}){listeners.get(target)?.get(type)?.(event);},
    onDispose:callback=>disposals.push(callback),
    dispose(){disposals.forEach(callback=>callback());}
  };
  const dock=installFloatingNavigation({doc,win,owner,resolveConversation:()=>context,
    resolveNavigation:()=>({turnPaging:true})});
  t.after(()=>owner.dispose());
  const host=doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
  assert.ok(host,'fixture mounts the public floating navigation');
  const controls=[...host.shadowRoot.querySelectorAll('button')];
  const [top,previous,next,bottom]=controls;
  function at(position){context.scroller.scrollTop=position;dock.refresh();}
  function observeRounds(){
    for(const landing of landings)at(landing);
    at(0);
  }
  function keepRound(index){
    for(const [i,nodes] of rounds.entries())if(i!==index)for(const node of nodes){
      node.remove();
      // A removed message must never supply geometry for a remembered jump.
      node.getBoundingClientRect=()=>{throw new Error('detached message geometry read');};
    }
    dock.refresh();
  }
  function cannotPage(button){
    const before=context.scroller.scrollTop;
    owner.click(button);
    assert.equal(context.scroller.scrollTop,before,'invalid memory cannot move the scrollport');
    dock.refresh();
    assert.equal(disabled(button),true,'invalid memory leaves no paging destination');
  }
  return {doc,win,main,context,dimensions,rounds,owner,dock,host,top,previous,next,bottom,
    at,observeRounds,keepRound,cannotPage,scrollport,
    settle(delay){for(let i=timers.length-1;i>=0;i--)if(timers[i].delay===delay)
      timers.splice(i,1)[0].callback();},
    restoreRound(index){
      for(const [offset,node] of rounds[index].entries()){
        node.getBoundingClientRect=()=>box(100,positions[index]+offset*160-context.scroller.scrollTop,700,120);
        main.append(node);
      }
    }};
}

test('re-aligns a remounted question after the virtualizer shifts the first scroll landing',t=>{
  const f=fixture(t);f.observeRounds();f.keepRound(0);f.owner.click(f.next);
  f.main.scrollTop=2800;f.restoreRound(1);f.settle(180);
  assert.equal(f.main.scrollTop,landings[1]);
});

for(const cancel of ['wheel','route','resize','dispose'])
test(`does not re-align a virtual question after ${cancel}`,t=>{
  const f=fixture(t);f.observeRounds();f.keepRound(0);f.owner.click(f.next);
  f.main.scrollTop=2800;f.restoreRound(1);
  if(cancel==='wheel')f.owner.emit(f.doc,'wheel');
  if(cancel==='route')f.win.location=new URL('https://chatgpt.com/c/other');
  if(cancel==='resize')f.win.innerWidth=900;
  if(cancel==='dispose')f.owner.dispose();
  f.settle(180);assert.equal(f.main.scrollTop,2800);
});

test('next reaches observed second and third questions after virtualization leaves only the first round',t=>{
  const f=fixture(t);
  f.observeRounds();f.keepRound(0);
  assert.equal(f.main.scrollHeight,3600,'virtualization preserves the scroll range');
  assert.equal(disabled(f.next),false,'removed later questions remain reachable');
  f.owner.click(f.next);assert.equal(f.main.scrollTop,landings[1]);
  f.owner.click(f.next);assert.equal(f.main.scrollTop,landings[2]);
});

test('previous reaches observed second and first questions after virtualization leaves only the last round',t=>{
  const f=fixture(t);
  f.observeRounds();f.at(landings[2]);f.keepRound(2);
  f.owner.click(f.previous);assert.equal(f.main.scrollTop,landings[1]);
  f.owner.click(f.previous);assert.equal(f.main.scrollTop,landings[0]);
});

test('bottom then previous twice still permits next to the virtualized last question',t=>{
  const f=fixture(t);
  f.observeRounds();f.owner.click(f.bottom);
  f.owner.click(f.previous);assert.equal(f.main.scrollTop,landings[2]);
  f.owner.click(f.previous);assert.equal(f.main.scrollTop,landings[1]);
  f.keepRound(1);
  assert.equal(disabled(f.next),false);
  f.owner.click(f.next);assert.equal(f.main.scrollTop,landings[2]);
});

test('top preserves next access to observed questions that have left the DOM',t=>{
  const f=fixture(t);
  f.observeRounds();f.at(landings[1]);f.keepRound(1);
  f.owner.click(f.top);assert.equal(f.main.scrollTop,0);
  f.owner.click(f.next);assert.equal(f.main.scrollTop,landings[1]);
});

test('remembered paging requires a trusted click',t=>{
  const f=fixture(t);
  f.observeRounds();f.keepRound(0);
  assert.equal(disabled(f.next),false,'exercise an available remembered destination');
  f.owner.click(f.next,false);assert.equal(f.main.scrollTop,0);
  f.owner.click(f.next,true);assert.equal(f.main.scrollTop,landings[1]);
});

for(const [name,change] of [
  ['SPA conversation path',f=>{f.win.location=new URL('https://chatgpt.com/c/other');}],
  ['main element',f=>{
    const replacement=f.scrollport(f.doc.createElement('main'));
    replacement.append(...f.main.children);f.main.replaceWith(replacement);
    f.context.main=f.context.scroller=replacement;
  }],
  ['scroll container',f=>{
    const replacement=f.scrollport(f.doc.createElement('section'));
    replacement.append(...f.main.children);f.main.append(replacement);f.context.scroller=replacement;
  }],
  ['turn selector',f=>{f.context.selector='article[data-content-search-unit-key]';}],
  ['scroll height',f=>{f.main.scrollHeight+=400;}],
  ['viewport height',f=>{f.main.clientHeight=700;f.dimensions.height=700;f.win.innerHeight=700;}],
  ['content width',f=>{f.main.clientWidth=900;f.dimensions.width=900;}],
  ['question identity without a shared anchor',f=>{
    f.rounds[0][0].setAttribute('data-content-search-unit-key','fallback-turn-99:0:user');
  }],
  ['an unverified question key format',f=>{
    f.rounds[0][0].setAttribute('data-content-search-unit-key','arbitrary:user');
  }],
  ['observed question reflow',f=>{
    const question=f.rounds[0][0];
    question.getBoundingClientRect=()=>box(100,280-f.main.scrollTop,700,120);
  }]
])test(`does not reuse removed question coordinates after a change to ${name}`,t=>{
  const f=fixture(t);
  f.observeRounds();f.keepRound(0);
  change(f);f.dock.refresh();
  f.cannotPage(f.next);
});

for(const [name,change] of [
  ['unknown',node=>node.setAttribute('data-content-search-unit-key','fallback-turn-0:0:unknown')],
  ['contradictory',node=>node.setAttribute('data-message-author-role','assistant')]
])test(`does not restore paging from memory when a live question role is ${name}`,t=>{
  const f=fixture(t);
  f.observeRounds();f.keepRound(0);
  change(f.rounds[0][0]);
  // Revalidate even when a previously enabled control was retained by the UI.
  f.cannotPage(f.next);
});

for(const [name,options] of [
  ['a different origin',{href:'https://example.com/c/virtualized'}],
  ['a different site adapter',{site:'custom'}],
  ['role-only keys without stable message identity',{stable:false}]
])test(`does not remember virtualized questions with ${name}`,t=>{
  const f=fixture(t,options);
  f.observeRounds();f.keepRound(0);
  f.cannotPage(f.next);
});

test('does not invent a next question that was never observed',t=>{
  const f=fixture(t);
  // Forgetting later DOM before the initial observation requires a fresh owner.
  f.owner.dispose();
  for(const nodes of f.rounds.slice(1))for(const node of nodes)node.remove();
  const dock=installFloatingNavigation({doc:f.doc,win:f.win,owner:f.owner,
    resolveConversation:()=>f.context,resolveNavigation:()=>({turnPaging:true})});
  t.after(()=>dock.dispose());
  const next=f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('[data-scroll-nav-key="turnNext"]');
  f.cannotPage(next);
});

test('disposed navigation cannot operate retained buttons or remount on refresh',t=>{
  const f=fixture(t);
  f.observeRounds();f.keepRound(0);f.owner.dispose();
  for(const button of [f.top,f.previous,f.next,f.bottom])f.owner.click(button);
  f.dock.refresh();
  assert.equal(f.main.scrollTop,0);
  assert.equal(f.host.isConnected,false);
  assert.equal(f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]'),null);
});
