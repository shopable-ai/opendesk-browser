import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {installScrollSiteRuntime,resolveConfiguredConversation,scrollConfiguredEdge} from '../src/site-configuration.js';
import {installFloatingNavigation} from '../src/floating-navigation.js';

const rule={origin:'https://chatgpt.com',pathScope:'/c',mainSelector:'#thread',
  scrollSelector:'#thread',messageSelector:'article',anchorSelector:'',enabled:true};
function fixture() {
  const {document:doc,window}=parseHTML('<html><body><main id="thread"><article>First</article><article>Last</article></main></body></html>');
  const box={left:40,right:1040,top:20,bottom:820,width:1000,height:800};
  window.HTMLElement.prototype.getBoundingClientRect=function(){return box;};
  const win={location:new URL('https://chatgpt.com/c/one'),innerWidth:1200,innerHeight:900,
    getComputedStyle:node=>({display:node.style.display||'block',visibility:node.style.visibility||'visible',overflowY:node.style.overflowY||'visible'})};
  const main=doc.querySelector('main');
  Object.assign(main,{scrollHeight:2400,clientHeight:800,scrollTop:300,scrollLeft:17});
  main.style.overflowY='auto';
  const calls=[];
  main.scrollTo=options=>{calls.push(options);main.scrollTop=options.top;};
  const capture=new Map(),registrations=[];
  doc.addEventListener=(type,fn,options)=>{registrations.push({type,options});if(!capture.has(type))capture.set(type,new Set());capture.get(type).add(fn);};
  doc.removeEventListener=(type,fn)=>capture.get(type)?.delete(fn);
  const dispatch=(type,props={})=>{const event={type,isTrusted:true,clientX:100,clientY:100,
    prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};
    for(const fn of [...capture.get(type)||[]]){fn(event);if(event.stopped)break;}return event;};
  const listeners=new Map(),timers=[],disposals=[],observers=[];
  const owner={on(target,type,fn){let entries=listeners.get(target);if(!entries)listeners.set(target,entries=new Map());
    let handlers=entries.get(type);if(!handlers)entries.set(type,handlers=new Set());handlers.add(fn);return()=>handlers.delete(fn);},
    onDispose:fn=>disposals.push(fn),setTimeout:fn=>timers.push(fn),
    observe(_target,fn){observers.push(fn);return{disconnect(){}};},
    dispose(){disposals.forEach(fn=>fn());},
    flush(){const batch=timers.splice(0);batch.forEach(fn=>fn());}};
  const click=node=>{for(const fn of listeners.get(node)?.get('click')||[])fn({isTrusted:true,preventDefault(){},stopPropagation(){}});};
  return{doc,win,main,calls,owner,click,observers,dispatch,registrations};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

async function runtimeFixture(api=storage(),prepare=()=>{},onChange) {
  const f=fixture();
  f.win.top=f.win;
  const timers=new Map();let nextTimer=0;
  f.win.setTimeout=fn=>{const id=++nextTimer;timers.set(id,fn);return id;};
  f.win.clearTimeout=id=>timers.delete(id);
  prepare(f);
  const runtime=installScrollSiteRuntime({...f,api,onChange});
  await settle();
  const editor=globalThis.__opendeskAiScrollEditorV1;
  assert.ok(editor);
  const overlay=()=>f.doc.querySelector('[data-opendesk-ai-scroll-navigation="picker"]');
  const outline=()=>overlay()?.shadowRoot.querySelector('.outline');
  const pick=(field,mainSelector='#thread')=>editor.pick({field,mainSelector});
  const select=async(field,mainSelector='#thread')=>{
    const pending=pick(field,mainSelector);
    f.dispatch('pointerdown');f.dispatch('click');
    return pending;
  };
  const expire=()=>{for(const fn of [...timers.values()])fn();};
  return {...f,runtime,editor,overlay,outline,pick,select,expire};
}

function storage(){
  let value={version:1,sites:[structuredClone(rule)]},etag='one',writes=0;
  return {get writes(){return writes;},read:async()=>({value:structuredClone(value),etag}),
    async write(next,expected){writes++;assert.equal(expected,etag);value=structuredClone(next);etag='two';return {value:structuredClone(value),etag};}};
}

test('R4 Page runtime has no old settings panel and keeps a one-shot real element picker',async()=>{
  const f=fixture(),api=storage();
  f.win.top=f.win;f.win.setTimeout=setTimeout;f.win.clearTimeout=clearTimeout;
  f.doc.elementFromPoint=()=>f.main;
  const installed=installScrollSiteRuntime({...f,api});
  await settle();
  assert.equal(f.doc.querySelector('[data-opendesk-ai-scroll-navigation="settings"]'),null,
    'old page settings gear and form are not mounted');
  assert.deepEqual(installed.activeRule(),rule,'stored rule loads without Side Panel');
  const editor=globalThis.__opendeskAiScrollEditorV1;
  assert.equal(typeof editor?.validate,'function');
  assert.equal(typeof editor?.pick,'function');
  const result=editor.pick({field:'main',mainSelector:''});
  const overlay=f.doc.querySelector('[data-opendesk-ai-scroll-navigation="picker"]');
  assert.ok(overlay,'temporary highlighter appears only during selection');
  assert.equal(overlay.shadowRoot.querySelector('#panel'),null);
  f.dispatch('pointermove');f.dispatch('pointerdown');
  assert.deepEqual(await result,{state:'selected',field:'main',selector:'#thread',count:1});
  assert.equal(f.doc.querySelector('[data-opendesk-ai-scroll-navigation="picker"]'),null);
  f.owner.dispose();
  assert.equal(globalThis.__opendeskAiScrollEditorV1,undefined,'dispose removes the bridge');
});

test('configured selectors reject zero, multiple, hidden and detached targets',()=>{
  for(const mode of ['zero','multiple','hidden','detached']){
    const f=fixture();
    if(mode==='zero')f.main.id='other';
    if(mode==='multiple')f.doc.body.append(f.main.cloneNode(true));
    if(mode==='hidden')f.main.hidden=true;
    if(mode==='detached')f.main.remove();
    assert.equal(resolveConfiguredConversation(rule,f.doc,f.win),null,mode);
  }
});
test('configured edges preserve horizontal scroll and reject stale detached bindings',()=>{
  const f=fixture(),binding=resolveConfiguredConversation(rule,f.doc,f.win);
  assert.ok(binding);
  assert.equal(scrollConfiguredEdge(binding,'top',f.doc,f.win),true);
  assert.equal(scrollConfiguredEdge(binding,'bottom',f.doc,f.win),true);
  assert.deepEqual(f.calls.map(c=>[c.top,c.left]),[[0,17],[1600,17]]);
  f.main.remove();assert.equal(scrollConfiguredEdge(binding,'top',f.doc,f.win),false);
});
test('configured click rejects selector ambiguity or SPA scope change after resolution',()=>{
  for(const mode of ['duplicate','hidden','route']){
    const f=fixture(),binding=resolveConfiguredConversation(rule,f.doc,f.win);
    if(mode==='duplicate')f.doc.body.append(f.main.cloneNode(true));
    if(mode==='hidden')f.main.hidden=true;
    if(mode==='route')f.win.location=new URL('https://chatgpt.com/elsewhere');
    assert.equal(scrollConfiguredEdge(binding,'top',f.doc,f.win),false,mode);
    assert.equal(f.calls.length,0);
  }
});

test('Page validates live selectors without mounting settings or writing config',async()=>{
  for(const mode of ['valid','replacement','path','css','hidden','short']){
    const api=storage(),f=await runtimeFixture(api);
    try{
      let candidate={...rule};
      if(mode==='replacement')f.main.replaceWith(f.main.cloneNode(true));
      if(mode==='path')candidate.pathScope='/unrelated';
      if(mode==='css')candidate.messageSelector='article[';
      if(mode==='hidden'){const article=f.main.firstElementChild.cloneNode(true);
        article.style.display='none';f.main.append(article);}
      if(mode==='short')f.main.scrollHeight=f.main.clientHeight;
      assert.equal(f.editor.validate(candidate).ok,mode==='valid',mode);
      assert.equal(api.writes,0);
      assert.equal(f.calls.length,0);
      assert.equal(f.doc.querySelector('[data-opendesk-ai-scroll-navigation="settings"]'),null);
    }finally{f.owner.dispose();}
  }
});

test('Page consumer coalesces reads and ignores obsolete lifecycle completions',async()=>{
  let finishRead,reads=0,changes=0;
  const value={version:1,sites:[structuredClone(rule)]};
  const api={read(){reads++;return new Promise(resolve=>{finishRead=resolve;});},
    write(){assert.fail('Page runtime must never write');}};
  const f=await runtimeFixture(api,()=>{},()=>changes++);
  const first=f.runtime.read(),second=f.runtime.read();
  assert.equal(first,second);assert.equal(reads,1);
  finishRead({value,etag:'one'});await first;
  assert.equal(changes,1);assert.deepEqual(f.runtime.activeRule(),rule);
  const late=f.runtime.read();await settle();
  f.owner.dispose();
  finishRead({value:{version:1,sites:[]},etag:'late'});
  assert.equal(await late,null);assert.equal(changes,1);
});

test('dock updates both disabled edges and rejects DOM replacement until refresh',()=>{
  const f=fixture();
  const dock=installFloatingNavigation({...f,resolveConversation:()=>resolveConfiguredConversation(rule,f.doc,f.win)});
  const host=f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
  const top=host.shadowRoot.querySelector('[data-scroll-nav-key="floatingTop"],[data-scroll-nav-key="conversationTop"]'),
    bottom=host.shadowRoot.querySelector('[data-scroll-nav-key="conversationBottom"]');
  assert.equal(top.getAttribute('aria-disabled'),'false');assert.equal(bottom.getAttribute('aria-disabled'),'false');
  f.click(top);dock.refresh();assert.equal(top.getAttribute('aria-disabled'),'true');assert.equal(bottom.getAttribute('aria-disabled'),'false');
  f.click(bottom);dock.refresh();assert.equal(top.getAttribute('aria-disabled'),'false');assert.equal(bottom.getAttribute('aria-disabled'),'true');
  f.main.scrollHeight=f.main.clientHeight;f.main.scrollTop=0;dock.refresh();
  assert.equal(top.getAttribute('aria-disabled'),'true');assert.equal(bottom.getAttribute('aria-disabled'),'true');
  f.main.replaceWith(f.main.cloneNode(true));const count=f.calls.length;f.click(top);
  assert.equal(f.calls.length,count);f.owner.dispose();
});

// The harness delivers capture events; this is not native browser input.
test('Page picking consumes delayed release clicks and disposal releases capture',async()=>{
  const f=await runtimeFixture();
  const native=f.doc.createElement('button');f.main.append(native);
  f.doc.elementFromPoint=()=>native;
  const pending=f.pick('main');
  assert.equal(f.dispatch('pointerdown').prevented,true);
  assert.equal((await pending).state,'selected');
  f.owner.flush();
  assert.equal(f.dispatch('click').prevented,true);
  assert.equal(f.dispatch('click').prevented,false,'suppression is one-shot');
  const next=f.pick('main');f.dispatch('pointerdown');await next;
  f.owner.dispose();
  assert.equal(f.dispatch('click').prevented,false,'dispose releases pending capture');
});

test('Page entry resolves the built-in adapter without configuration',async()=>{
  const f=fixture();f.owner.host=f.doc.createElement('div');f.doc.body.append(f.owner.host);
  f.owner.destroy=()=>f.owner.dispose();f.win.top=f.win;
  const previous=new Map(['window','document','__scrollTestOwner','__openDeskScrollConfig'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    Object.assign(globalThis,{window:f.win,document:f.doc,__scrollTestOwner:f.owner,__openDeskScrollConfig:null});
    let source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
    source=source.replace("import {createPageUI} from '@opendesk/ui';",'const createPageUI=()=>globalThis.__scrollTestOwner;')
      .replace(/from '(\.\/[^']+)'/g,(_match,path)=>"from '"+new URL('../src/'+path,import.meta.url).href+"'");
    const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    assert.equal((await module.default()).status,'active');
  }finally{
    f.owner.dispose();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});

test('modifier keydowns during a held pick preserve the pending website click guard',async()=>{
  const f=await runtimeFixture();
  const button=f.doc.createElement('button');f.main.append(button);f.doc.elementFromPoint=()=>button;
  for(const key of ['Shift','Control','Alt','Meta','AltGraph']){
    const pending=f.pick('main');f.dispatch('pointerdown');await pending;
    f.dispatch('keydown',{key});
    assert.equal(f.dispatch('click').prevented,true,key);
    assert.equal(f.dispatch('click').prevented,false,'only the pending click is consumed');
  }
  const pending=f.pick('main');f.dispatch('pointerdown');await pending;
  f.dispatch('keydown',{key:'Tab'});
  assert.equal(f.dispatch('click').prevented,false,'a new non-modifier keyboard gesture releases capture');
  f.owner.dispose();
});

test('configured conversation rejects a middle message across a real inner scroll boundary',()=>{
  for(const mode of ['nested','self','empty-boundary','implicit-messages']){
    const f=fixture(),middle=f.doc.createElement('article');middle.textContent='Middle';
    let boundary=middle;
    if(mode!=='self'){
      boundary=f.doc.createElement('div');boundary.append(middle);
    }
    boundary.style.overflowY='auto';
    Object.assign(boundary,{scrollHeight:mode==='empty-boundary'?100:600,clientHeight:100});
    f.main.insertBefore(boundary,f.main.lastElementChild);
    const configured={...rule,messageSelector:mode==='implicit-messages'?'':'article'};
    assert.equal(resolveConfiguredConversation(configured,f.doc,f.win),null,mode);
    boundary.style.overflowY='visible';
    assert.ok(resolveConfiguredConversation(configured,f.doc,f.win),mode+' unified scrollport');
  }
});

test('Page picker resolves the document scroll root but excludes roots as main targets',async()=>{
  for(const rootTag of ['html','body']){
    const api=storage(),f=await runtimeFixture(api,({doc,win,main,calls})=>{
      main.style.overflowY='visible';
      const root=doc.querySelector(rootTag);
      Object.defineProperty(doc,'scrollingElement',{value:root});
      Object.assign(root,{scrollHeight:3200,clientHeight:900,scrollTop:400,scrollLeft:23});
      win.scrollTo=options=>{calls.push(options);root.scrollTop=options.top;};
    });
    try{
      const button=f.doc.createElement('button');f.main.firstElementChild.append(button);
      f.doc.elementFromPoint=()=>button;
      const mainPick=await f.select('main');
      assert.equal(f.doc.querySelector(mainPick.selector),button);
      const pending=f.pick('scroller');f.dispatch('pointermove');
      assert.equal(f.outline().hidden,false);
      for(const type of ['pointermove','pointerdown','click','contextmenu'])
        assert.ok(f.registrations.some(entry=>entry.type===type&&entry.options===true),type+' capture');
      const down=f.dispatch('pointerdown'),click=f.dispatch('click');
      assert.ok(down.prevented&&down.stopped&&click.prevented&&click.stopped);
      const result=await pending;
      assert.equal(result.state,'selected');
      assert.equal(f.doc.querySelector(result.selector),f.doc.scrollingElement);
      const candidate={...rule,scrollSelector:result.selector};
      assert.equal(f.editor.validate(candidate).ok,true);
      assert.equal(api.writes,0);
      assert.deepEqual(f.calls,[],'validation cannot scroll the page');
      const binding=resolveConfiguredConversation(candidate,f.doc,f.win);
      assert.ok(binding);
      assert.equal(scrollConfiguredEdge(binding,'top',f.doc,f.win),true);
      assert.equal(scrollConfiguredEdge(binding,'bottom',f.doc,f.win),true);
      assert.deepEqual(f.calls.map(c=>[c.top,c.left]),[[0,23],[2300,23]]);
      for(const root of [f.doc.documentElement,f.doc.body]){
        f.doc.elementFromPoint=()=>root;
        assert.equal((await f.select('main')).state,'invalid','root cannot become main');
      }
    }finally{f.owner.dispose();}
  }
});

test('Page picker outlines and selects the nearest enclosing scrollport',async()=>{
  const f=await runtimeFixture();
  const outer=f.doc.createElement('div');outer.id='outer';f.main.replaceWith(outer);outer.append(f.main);
  outer.style.overflowY='auto';Object.assign(outer,{scrollHeight:4000,clientHeight:900});
  const button=f.doc.createElement('button');f.main.firstElementChild.append(button);
  f.main.getBoundingClientRect=()=>({left:11,top:22,width:333,height:444});
  f.doc.elementFromPoint=()=>button;
  const pending=f.pick('scroller');f.dispatch('pointermove');
  assert.equal(f.outline().style.left,'11px');assert.equal(f.outline().style.width,'333px');
  f.dispatch('pointerdown');f.dispatch('click');
  assert.equal((await pending).selector,'#thread');
  f.main.style.overflowY='visible';
  assert.equal((await f.select('scroller')).selector,'#outer');
  f.owner.dispose();
});

test('Page picks reject editor/sidebar hits, ambiguous scrollports and unproven body fallback',async()=>{
  for(const mode of ['textarea','input','contenteditable','aside','nav','split','empty-boundary','body-fallback','root-hit']){
    const f=await runtimeFixture();let hit=f.main.firstElementChild;
    if(['textarea','input','contenteditable','aside','nav'].includes(mode)){
      const excluded=f.doc.createElement(mode==='contenteditable'?'div':mode);
      if(mode==='contenteditable')excluded.setAttribute('contenteditable','true');
      f.main.append(excluded);
      hit=excluded;
      if(['aside','nav'].includes(mode)){hit=f.doc.createElement('button');excluded.append(hit);}
    }else if(['split','empty-boundary'].includes(mode)){
      const inner=f.doc.createElement('div');inner.style.overflowY='auto';
      Object.assign(inner,{scrollHeight:mode==='split'?600:100,clientHeight:100});
      f.main.insertBefore(inner,f.main.lastElementChild);inner.append(hit);
    }else if(mode==='body-fallback'){
      f.main.style.overflowY='visible';
      Object.assign(f.doc.body,{scrollHeight:4000,clientHeight:900});
    }else hit=f.doc.documentElement;
    f.doc.elementFromPoint=()=>hit;
    const pending=f.pick('scroller');f.dispatch('pointermove');
    assert.equal(f.outline().hidden,true,mode);
    assert.equal(f.dispatch('pointerdown').prevented,true,mode);
    assert.equal(f.dispatch('click').prevented,true,mode);
    assert.equal((await pending).state,'invalid',mode);
    assert.equal(f.overlay(),null,mode);
    if(['textarea','input','contenteditable','aside','nav'].includes(mode))
      assert.equal((await f.select('main')).state,'invalid',mode+' cannot become main');
    f.owner.dispose();
  }
});

// Native Node EventTarget delivers real Event objects in sequence. The first
// target models document capture, the second the website's target handlers.
// Only the trusted-input flag is supplied by the fixture; no browser claim.
async function gestureRuntime() {
  const f = await runtimeFixture(storage(), ({doc}) => {
    const capture = new EventTarget();
    const options = value => typeof value === 'boolean' ? {capture: value} : value;
    doc.addEventListener = (type, fn, value) => capture.addEventListener(type, fn, options(value));
    doc.removeEventListener = (type, fn, value) => capture.removeEventListener(type, fn, options(value));
    doc.__capture = capture;
  });
  const website = new EventTarget(), seen = [];
  const types = ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click'];
  for (const type of types) website.addEventListener(type, event => seen.push(event.type));
  const button = f.doc.createElement('button');f.main.append(button);
  f.doc.elementFromPoint = () => button;
  const send = (type, props = {}) => {
    const event = new Event(type, {cancelable: true, bubbles: true});
    const values = {isTrusted: true, pointerId: 7, pointerType: 'mouse',
      button: 0, clientX: 100, clientY: 100, ...props};
    // Compatibility MouseEvents carry no pointer identity.
    if (type === 'mouseup' || type === 'mousedown') {delete values.pointerId;delete values.pointerType;}
    Object.defineProperties(event, Object.fromEntries(Object.entries(values)
      .map(([key, value]) => [key, {value}])));
    let reachedTarget = false;
    const reach = () => {reachedTarget = true;};
    f.doc.addEventListener(type, reach, true);
    f.doc.__capture.dispatchEvent(event);
    f.doc.removeEventListener(type, reach, true);
    if (reachedTarget) website.dispatchEvent(new Event(type));
    return {prevented: event.defaultPrevented, reachedTarget};
  };
  return {...f, seen, send};
}

test('r6 selecting gesture consumes release and compatibility events before website handlers', async () => {
  const f = await gestureRuntime();
  void f.pick('main');
  for (const type of ['pointerdown', 'pointerup', 'mouseup', 'click']) {
    const event = f.send(type);
    assert.equal(event.prevented, true, type + ' prevents activation');
    assert.equal(event.reachedTarget, false, type + ' never reaches website handler');
  }
  assert.deepEqual(f.seen, []);
  assert.equal(f.send('click').reachedTarget, true, 'following independent click is allowed');
  f.owner.dispose();
});

test('r6 cancellation consumes only the selected pointer and its compatibility tail', async () => {
  const f = await gestureRuntime();
  void f.pick('main');f.send('pointerdown');
  assert.equal(f.send('pointerup', {pointerId: 8}).reachedTarget, true, 'unrelated pointer release');
  assert.equal(f.send('pointercancel').reachedTarget, false, 'selected pointer cancellation');
  assert.equal(f.send('mouseup').reachedTarget, false, 'compatibility mouseup');
  assert.equal(f.send('click').reachedTarget, false, 'compatibility click');
  assert.equal(f.send('pointerup', {pointerId: 8}).reachedTarget, true);
  f.owner.dispose();
});

test('r6 unrelated new pointer gesture passes without stealing the held selection release', async () => {
  const f = await gestureRuntime();
  void f.pick('main');f.send('pointerdown');
  for (const type of ['pointerdown', 'pointerup', 'mouseup', 'click'])
    assert.equal(f.send(type, {pointerId: 8}).reachedTarget, true, type + ' unrelated gesture');
  for (const type of ['pointerup', 'mouseup', 'click'])
    assert.equal(f.send(type).reachedTarget, false, type + ' original gesture');
  f.owner.dispose();
});

test('r6 new same-pointer gesture and dispose release all pending event captures', async () => {
  const f = await gestureRuntime();
  void f.pick('main');f.send('pointerdown');
  for (const type of ['pointerdown', 'pointerup', 'mouseup', 'click'])
    assert.equal(f.send(type).reachedTarget, true, 'new gesture ' + type);
  for (const disposedDuringPick of [false, true]) {
    const next = await gestureRuntime();void next.pick('main');
    if (!disposedDuringPick) next.send('pointerdown');
    next.owner.dispose();
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mouseup', 'click'])
      assert.equal(next.send(type).reachedTarget, true, 'dispose releases ' + type);
  }
  f.owner.dispose();
});


test('r6 legacy compatibility click is consumed but untrusted down cannot select a node', async () => {
  const f = await gestureRuntime();
  const pending=f.pick('main');
  f.send('pointerdown', {isTrusted: false});
  assert.ok(f.overlay(), 'selection still awaits trusted input');
  f.send('pointerdown');
  const result=await pending;
  assert.equal(result.state,'selected');
  assert.equal(f.doc.querySelector(result.selector),f.doc.elementFromPoint(),
    'trusted fixture input selects the button');
  assert.equal(f.send('pointerup').reachedTarget, false);
  assert.equal(f.send('mouseup').reachedTarget, false);
  assert.equal(f.send('click', {pointerId: undefined, pointerType: undefined}).reachedTarget, false);
  assert.equal(f.send('click', {pointerId: undefined}).reachedTarget, true);
  f.owner.dispose();
});

for(const end of ['pointerup','pointercancel']){
  test('r7 interleaved selected '+end+' preserves the independent mouse release',async()=>{
    const f=await gestureRuntime();void f.pick('main');
    f.send('pointerdown',{pointerType:'touch'});
    assert.equal(f.send('pointerdown',{pointerId:8,pointerType:'mouse'}).reachedTarget,true);
    assert.equal(f.send(end,{pointerType:'touch'}).reachedTarget,false);
    for(const type of ['pointerup','mouseup','click'])
      assert.equal(f.send(type,{pointerId:8,pointerType:'mouse'}).reachedTarget,true,type);
    f.owner.dispose();
  });
}

test('Page picks message groups and anchors without writing CSS',async()=>{
  const api=storage(),f=await runtimeFixture(api);
  f.doc.elementFromPoint=()=>f.main.firstElementChild;
  const pending=f.pick('messages');f.dispatch('pointermove');
  assert.equal(f.outline().hidden,false);
  f.dispatch('pointerdown');f.dispatch('click');
  assert.deepEqual(await pending,{state:'selected',field:'messages',selector:'article',count:2});
  const anchor=f.doc.createElement('button');anchor.id='scroll-action-anchor';f.main.append(anchor);
  f.doc.elementFromPoint=()=>anchor;
  const selected=await f.select('anchor');
  assert.equal(selected.selector,'#scroll-action-anchor');
  assert.equal(f.editor.validate({...rule,anchorSelector:selected.selector}).ok,true);
  assert.equal(api.writes,0);
  assert.equal(f.calls.length,0);
  f.owner.dispose();
});

test('Page picker cancellation, timeout and disposal remove the transient overlay',async()=>{
  const f=await runtimeFixture();
  const pending=f.pick('messages');
  assert.ok(f.overlay());
  assert.equal(f.dispatch('keydown',{key:'Escape'}).prevented,true);
  assert.deepEqual(await pending,{state:'cancelled'});
  assert.equal(f.overlay(),null);
  const expired=f.pick('main');f.expire();
  assert.deepEqual(await expired,{state:'timeout'});
  assert.equal(f.overlay(),null);
  const closed=f.pick('anchor');f.owner.dispose();
  assert.deepEqual(await closed,{state:'closed'});
  assert.equal(f.overlay(),null);
  assert.equal(globalThis.__opendeskAiScrollEditorV1,undefined);
});

test('Page picker refuses editable hits and leaves the stored rule untouched',async()=>{
  const api=storage(),f=await runtimeFixture(api),input=f.doc.createElement('textarea');
  f.main.append(input);f.doc.elementFromPoint=()=>input;
  for(const field of ['anchor','messages'])
    assert.equal((await f.select(field)).state,'invalid');
  assert.deepEqual(f.runtime.activeRule(),rule);
  assert.equal(api.writes,0);
  f.owner.dispose();
});

test('Page consumer observes trusted rule edits, disabling and deletion without losing flags',async()=>{
  const api=storage(),navigation={regionTop:false,regionBottom:true,conversationTop:false,
    conversationBottom:true,floatingTop:false,turnPaging:true};
  await api.write({version:1,sites:[rule],navigation},'one');
  const f=await runtimeFixture(api);
  assert.deepEqual(f.runtime.navigation(),navigation);
  const narrower={...rule,pathScope:'/c/one'};
  await api.write({version:1,sites:[narrower],navigation},'two');
  await f.runtime.read();assert.deepEqual(f.runtime.activeRule(),narrower);
  await api.write({version:1,sites:[{...narrower,enabled:false}],navigation},'two');
  await f.runtime.read();assert.equal(f.runtime.activeRule(),null);
  await api.write({version:1,sites:[],navigation},'two');
  await f.runtime.read();assert.equal(f.runtime.activeRule(),null);
  assert.deepEqual(f.runtime.navigation(),navigation);
  f.owner.dispose();
});

test('production entry and frozen package contain no retired website settings mount',async()=>{
  const source=await readFile(new URL('../src/site-configuration.js',import.meta.url),'utf8');
  const entry=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const pkg=JSON.parse(await readFile(new URL('../ai-scroll-navigation.opendesk-page.json',import.meta.url),'utf8'));
  for(const code of [source,entry,pkg.sourceUtf8]){
    assert.doesNotMatch(code,/installVisualSiteConfiguration|打开 AI 滚动导航的网站适配设置/);
    assert.doesNotMatch(code,/setAttribute\([^,]+,\s*['"]settings['"]\)/);
  }
  assert.match(entry,/installScrollSiteRuntime\(/);
});

test('formal Page consumer observes persisted flags, updates dock and restores after restart',async()=>{
  const api=storage(),f=fixture();f.win.top=f.win;
  let dock;
  const runtime=installScrollSiteRuntime({...f,api,onChange:()=>dock?.refresh()});
  dock=installFloatingNavigation({...f,resolveNavigation:()=>runtime.navigation(),
    resolveConversation:()=>resolveConfiguredConversation(runtime.activeRule(),f.doc,f.win)});
  await settle();
  const controls=()=>[...f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')?.shadowRoot.querySelectorAll('button')||[]];
  assert.equal(controls().length,4);
  const navigation={regionTop:false,regionBottom:false,conversationTop:false,conversationBottom:false,floatingTop:false,turnPaging:false};
  await api.write({version:1,sites:[rule],navigation},'one');
  f.owner.flush();await settle();
  assert.equal(controls().length,0,'poll removes an existing dock after persistence');
  assert.deepEqual(runtime.navigation(),navigation);
  f.owner.dispose();
  const fresh=fixture();fresh.win.top=fresh.win;
  const restored=installScrollSiteRuntime({...fresh,api});await settle();
  assert.deepEqual(restored.navigation(),navigation,'new document recovers the same flags');
  fresh.owner.dispose();
});

test('main wires the formal snapshot to live navigation and subsequent persistence',async()=>{
  const f=fixture(),api=storage();f.win.top=f.win;
  f.owner.host=f.doc.createElement('div');f.doc.body.append(f.owner.host);
  f.owner.destroy=()=>f.owner.dispose();
  const previous=new Map(['window','document','__scrollTestOwner','__openDeskScrollConfig'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    Object.assign(globalThis,{window:f.win,document:f.doc,__scrollTestOwner:f.owner,__openDeskScrollConfig:api});
    let source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
    source=source.replace("import {createPageUI} from '@opendesk/ui';",'const createPageUI=()=>globalThis.__scrollTestOwner;')
      .replace(/from '(\.\/[^']+)'/g,(_match,path)=>"from '"+new URL('../src/'+path,import.meta.url).href+"'");
    const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    assert.equal((await module.default()).status,'active');await settle();
    const controls=()=>[...f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')?.shadowRoot.querySelectorAll('button')||[]];
    assert.equal(controls().length,4);
    await api.write({version:1,sites:[rule],navigation:{conversationTop:false,floatingTop:false,conversationBottom:true}},'one');
    f.owner.flush();await settle();
    assert.deepEqual(controls().map(button=>button.dataset.scrollNavKey),
      ['turnPrevious','turnNext','conversationBottom']);
    assert.ok(controls().slice(0,2).every(button=>button.getAttribute('aria-disabled')==='true'));
  }finally{
    f.owner.dispose();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
