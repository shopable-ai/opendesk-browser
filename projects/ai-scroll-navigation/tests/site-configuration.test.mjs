import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {installVisualSiteConfiguration,resolveConfiguredConversation,scrollConfiguredEdge} from '../src/site-configuration.js';
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
async function settings(api,prepare=()=>{}) {
  const f=fixture();
  prepare(f);
  const ui=installVisualSiteConfiguration({...f,api});
  await settle();
  const shadow=f.doc.querySelector('[data-opendesk-ai-scroll-navigation="settings"]').shadowRoot;
  const el=id=>shadow.getElementById(id);
  return {...f,ui,el};
}
function storage(){
  let value={version:1,sites:[structuredClone(rule)]},etag='one',writes=0;
  return {get writes(){return writes;},read:async()=>({value:structuredClone(value),etag}),
    async write(next,expected){writes++;assert.equal(expected,etag);value=structuredClone(next);etag='two';return {value:structuredClone(value),etag};}};
}

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
test('one-click save revalidates current DOM before writing',async()=>{
  const api=storage(),f=await settings(api);
  f.main.replaceWith(f.main.cloneNode(true));
  f.click(f.el('save'));await settle();assert.equal(api.writes,0);
});
test('unknown write requires explicit reread before another save',async()=>{
  const api=storage();let attempts=0;
  api.write=async()=>{attempts++;throw Object.assign(Error('reply lost'),{code:'E_CONFIG_UNKNOWN'});};
  const f=await settings(api);f.click(f.el('save'));await settle();
  f.click(f.el('save'));await settle();assert.equal(attempts,1);
  assert.match(f.el('status').textContent,/UNKNOWN/);
  f.click(f.el('reload'));await settle();f.click(f.el('save'));await settle();
  assert.equal(attempts,2);
});
test('CAS conflict preserves draft and persisted configuration; confirmed save restores on refresh',async()=>{
  const api=storage(),f=await settings(api);
  const write=api.write;
  api.write=async()=>{throw Object.assign(Error('conflict'),{code:'E_CONFIG_CONFLICT'});};
  f.click(f.el('save'));await settle();
  assert.match(f.el('status').textContent,/E_CONFIG_CONFLICT/);
  assert.equal(f.el('main').value,'#thread');
  assert.equal(f.ui.activeRule().mainSelector,'#thread');
  api.write=write;f.click(f.el('reload'));await settle();f.click(f.el('save'));await settle();
  assert.match(f.el('status').textContent,/已保存/);
  f.owner.dispose();const fresh=await settings(api);
  assert.equal(fresh.el('main').value,'#thread');assert.deepEqual(fresh.ui.activeRule(),rule);
});
test('dock updates both disabled edges and rejects DOM replacement until refresh',()=>{
  const f=fixture();
  const dock=installFloatingNavigation({...f,resolveConversation:()=>resolveConfiguredConversation(rule,f.doc,f.win)});
  const host=f.doc.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
  const [top,bottom]=host.shadowRoot.querySelectorAll('button');
  assert.equal(top.disabled,false);assert.equal(bottom.disabled,false);
  f.click(top);dock.refresh();assert.equal(top.disabled,true);assert.equal(bottom.disabled,false);
  f.click(bottom);dock.refresh();assert.equal(top.disabled,false);assert.equal(bottom.disabled,true);
  f.main.scrollHeight=f.main.clientHeight;f.main.scrollTop=0;dock.refresh();
  assert.equal(top.disabled,true);assert.equal(bottom.disabled,true);
  f.main.replaceWith(f.main.cloneNode(true));const count=f.calls.length;f.click(top);
  assert.equal(f.calls.length,count);f.owner.dispose();
});

// Deliver capture events through the harness; this does not claim real browser
// trusted input or native activation evidence.
test('visual picking consumes a delayed release click without activating the page button',async()=>{
  const f=await settings(storage());
  const native=f.doc.createElement('button');f.main.append(native);
  f.doc.elementFromPoint=()=>native;
  f.click(f.el('pick-main'));
  assert.equal(f.dispatch('pointerdown').prevented,true);
  f.owner.flush(); // A long press can outlive the old 350 ms suppression timer.
  assert.equal(f.dispatch('click').prevented,true);
  assert.equal(f.dispatch('click').prevented,false,'suppression is one-shot');
  f.click(f.el('pick-main'));f.dispatch('pointerdown');f.owner.dispose();
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

test('lost confirmation after a persisted write does not replay and reread recovers',async()=>{
  const api=storage(),read=api.read;
  let reads=0;
  api.read=async()=>{if(++reads===2)throw Error('confirmation lost');return read();};
  const f=await settings(api);f.click(f.el('save'));await settle();
  assert.equal(api.writes,1);assert.match(f.el('status').textContent,/未确认保存/);
  f.click(f.el('save'));await settle();assert.equal(api.writes,1);
  f.click(f.el('reload'));await settle();
  assert.equal(f.ui.activeRule().mainSelector,'#thread');
  assert.match(f.el('status').textContent,/已从可信 Host 读取/);
});
test('save cannot accept an acknowledgement for a different candidate',async()=>{
  const api=storage();
  api.write=async()=>({etag:'one',value:{version:1,sites:[]}});
  const f=await settings(api);f.click(f.el('save'));await settle();
  assert.match(f.el('status').textContent,/E_CONFIG_UNKNOWN/);
  assert.equal(f.ui.activeRule().mainSelector,'#thread');
});

test('startup and settings reads singleflight; unknown writes unlock only after a new explicit read',async()=>{
  let resolveStartup,resolveWrite,reads=0,attempts=0;
  const value={version:1,sites:[structuredClone(rule)]};
  const api={read(){reads++;return reads===1?new Promise(resolve=>{resolveStartup=resolve;}):
    Promise.resolve({value:structuredClone(value),etag:'one'});},
    write(){attempts++;return new Promise(resolve=>{resolveWrite=resolve;});}};
  const f=await settings(api);
  f.click(f.el('launch'));f.click(f.el('launch'));
  const first=f.ui.read(),second=f.ui.read();
  assert.equal(first,second);assert.equal(reads,1,'opening settings joins startup read');
  resolveStartup({value:structuredClone(value),etag:'one'});await first;
  f.click(f.el('save'));await settle();
  await f.ui.read();assert.equal(reads,1,'read cannot overlap write');
  resolveWrite({});await settle();
  await second;f.click(f.el('launch'));f.click(f.el('save'));await settle();
  assert.equal(attempts,1);assert.equal(reads,1,'launch does not clear unknown write fence');
  assert.match(f.el('status').textContent,/E_CONFIG_UNKNOWN/);
  f.click(f.el('reload'));await settle();assert.equal(reads,2);
  f.click(f.el('save'));await settle();assert.equal(attempts,2);
  resolveWrite({});await settle();
  // A completion from an obsolete lifecycle must never publish config changes.
  let finishRead,changes=0;
  const disposed=fixture();
  installVisualSiteConfiguration({...disposed,api:{read:()=>new Promise(resolve=>{finishRead=resolve;})},
    onChange:()=>changes++});
  await settle();disposed.owner.dispose();
  finishRead({value,etag:'late'});await settle();assert.equal(changes,0);
});

test('modifier keydowns during a held pick preserve the pending website click guard',async()=>{
  const f=await settings(storage());
  const button=f.doc.createElement('button');f.main.append(button);f.doc.elementFromPoint=()=>button;
  for(const key of ['Shift','Control','Alt','Meta','AltGraph']){
    f.click(f.el('pick-main'));f.dispatch('pointerdown');
    f.dispatch('keydown',{key});
    assert.equal(f.dispatch('click').prevented,true,key);
    assert.equal(f.dispatch('click').prevented,false,'only the pending click is consumed');
  }
  f.click(f.el('pick-main'));f.dispatch('pointerdown');f.dispatch('keydown',{key:'Tab'});
  assert.equal(f.dispatch('click').prevented,false,'a new non-modifier keyboard gesture releases capture');
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

test('disabling unchanged rules skips DOM checks while edits and enabling require valid DOM',async()=>{
  for(const mode of ['detached','short','conflict','changed','new','enable']){
    const api=storage();
    if(mode==='new')api.read=async()=>({value:{version:1,sites:[]},etag:'one'});
    if(mode==='enable')api.read=async()=>({value:{version:1,sites:[{...rule,enabled:false}]},etag:'one'});
    let attempts=0;
    const write=api.write;
    api.write=async(next,expected)=>{
      attempts++;assert.equal(expected,'one','disable still uses CAS');
      assert.deepEqual(next.sites,[{...rule,enabled:false}]);
      if(mode==='conflict')throw Object.assign(Error('conflict'),{code:'E_CONFIG_CONFLICT'});
      return write(next,expected);
    };
    const f=await settings(api);
    f.el('enabled').checked=mode==='enable';
    if(mode==='short')f.main.scrollHeight=f.main.clientHeight;
    else f.main.remove();
    if(mode==='changed')f.el('messages').value='.changed';
    f.click(f.el('save'));await settle();
    if(['changed','new','enable'].includes(mode)){
      assert.equal(attempts,0,mode);assert.match(f.el('status').textContent,/选择器|匹配|滚动/);
    }else if(mode==='conflict'){
      assert.equal(attempts,1);assert.equal(api.writes,0);assert.match(f.el('status').textContent,/E_CONFIG_CONFLICT/);
      assert.equal(f.ui.activeRule().enabled,true,'conflict preserves existing active rule');
    }else{
      assert.equal(api.writes,1,mode);assert.equal(f.ui.activeRule(),null);
      assert.match(f.el('status').textContent,/已保存/);
      const fresh=await settings(api);assert.equal(fresh.el('enabled').checked,false);
    }
  }
});

test('enabled checkbox has a visible associated label',async()=>{
  const f=await settings(storage()),input=f.el('enabled');
  const label=input.closest('label');
  assert.ok(label,'native enclosing label associates the accessible name');
  assert.equal(label.textContent.trim(),'启用此规则');
  assert.equal(input.getAttribute('type'),'checkbox');
});

test('visual scroll picking resolves the actual document root from legal content while main picking excludes roots',async()=>{
  for(const rootTag of ['html','body']){
    const api=storage(),f=await settings(api,({doc,win,main,calls})=>{
      main.style.overflowY='visible';
      const root=doc.querySelector(rootTag);
      Object.defineProperty(doc,'scrollingElement',{value:root});
      Object.assign(root,{scrollHeight:3200,clientHeight:900,scrollTop:400,scrollLeft:23});
      win.scrollTo=options=>{calls.push(options);root.scrollTop=options.top;};
    });
    const button=f.doc.createElement('button');f.main.firstElementChild.append(button);
    f.doc.elementFromPoint=()=>button;
    f.click(f.el('pick-main'));f.dispatch('pointerdown');f.dispatch('click');
    assert.equal(f.doc.querySelector(f.el('main').value),button,'main pick retains the hit identity');
    f.el('main').value='#thread';
    f.click(f.el('pick-scroll'));f.dispatch('pointermove');
    assert.equal(f.el('outline').style.display,'block');
    for(const type of ['pointermove','pointerdown','click','contextmenu'])
      assert.ok(f.registrations.some(entry=>entry.type===type&&entry.options===true),type+' capture');
    const down=f.dispatch('pointerdown'),click=f.dispatch('click');
    assert.ok(down.prevented&&down.stopped&&click.prevented&&click.stopped);
    assert.equal(f.doc.querySelector(f.el('scroller').value),f.doc.scrollingElement);
    f.click(f.el('save'));await settle();
    assert.equal(api.writes,1);
    assert.deepEqual(f.calls,[],'save cannot scroll the page');
    const stored=(await api.read()).value.sites[0];
    const binding=resolveConfiguredConversation(stored,f.doc,f.win);
    assert.ok(binding);
    assert.equal(scrollConfiguredEdge(binding,'top',f.doc,f.win),true);
    assert.equal(scrollConfiguredEdge(binding,'bottom',f.doc,f.win),true);
    assert.deepEqual(f.calls.map(c=>[c.top,c.left]),[[0,23],[2300,23]]);
    for(const root of [f.doc.documentElement,f.doc.body]){
      f.doc.elementFromPoint=()=>root;
      f.click(f.el('pick-main'));f.dispatch('pointerdown');f.dispatch('click');
      assert.equal(f.el('main').value,'#thread','root cannot become main');
    }
    f.owner.dispose();
  }
});

test('visual scroll picking outlines and selects the nearest enclosing scrollport instead of the hit node',async()=>{
  const f=await settings(storage());
  const outer=f.doc.createElement('div');outer.id='outer';f.main.replaceWith(outer);outer.append(f.main);
  outer.style.overflowY='auto';Object.assign(outer,{scrollHeight:4000,clientHeight:900});
  const button=f.doc.createElement('button');f.main.firstElementChild.append(button);
  f.main.getBoundingClientRect=()=>({left:11,top:22,width:333,height:444});
  f.doc.elementFromPoint=()=>button;
  f.el('scroller').value='';f.click(f.el('pick-scroll'));f.dispatch('pointermove');
  assert.equal(f.el('outline').style.left,'11px');assert.equal(f.el('outline').style.width,'333px');
  f.dispatch('pointerdown');f.dispatch('click');
  assert.equal(f.el('scroller').value,'#thread');
  f.main.style.overflowY='visible';
  f.click(f.el('pick-scroll'));f.dispatch('pointerdown');f.dispatch('click');
  assert.equal(f.el('scroller').value,'#outer');
  f.owner.dispose();
});

test('visual picks reject editor/sidebar hits, ambiguous scrollports and unproven body fallback',async()=>{
  for(const mode of ['textarea','input','contenteditable','aside','nav','split','empty-boundary','body-fallback','root-hit']){
    const f=await settings(storage());let hit=f.main.firstElementChild;
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
    f.el('scroller').value='';f.click(f.el('pick-scroll'));f.dispatch('pointermove');
    assert.equal(f.el('outline').style.display,'none',mode);
    assert.equal(f.dispatch('pointerdown').prevented,true,mode);
    assert.equal(f.dispatch('click').prevented,true,mode);
    assert.equal(f.el('scroller').value,'',mode);
    assert.match(f.el('status').textContent,/未找到/,mode);
    if(['textarea','input','contenteditable','aside','nav'].includes(mode)){
      f.click(f.el('pick-main'));f.dispatch('pointerdown');f.dispatch('click');
      assert.equal(f.el('main').value,'#thread',mode+' cannot become main');
    }
    f.owner.dispose();
  }
});


// Native Node EventTarget delivers real Event objects in sequence. The first
// target models document capture, the second the website's target handlers.
// Only the trusted-input flag is supplied by the fixture; no browser claim.
async function gestureSettings() {
  const f = await settings(storage(), ({doc}) => {
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
  const f = await gestureSettings();
  f.click(f.el('pick-main'));
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
  const f = await gestureSettings();
  f.click(f.el('pick-main'));f.send('pointerdown');
  assert.equal(f.send('pointerup', {pointerId: 8}).reachedTarget, true, 'unrelated pointer release');
  assert.equal(f.send('pointercancel').reachedTarget, false, 'selected pointer cancellation');
  assert.equal(f.send('mouseup').reachedTarget, false, 'compatibility mouseup');
  assert.equal(f.send('click').reachedTarget, false, 'compatibility click');
  assert.equal(f.send('pointerup', {pointerId: 8}).reachedTarget, true);
  f.owner.dispose();
});

test('r6 unrelated new pointer gesture passes without stealing the held selection release', async () => {
  const f = await gestureSettings();
  f.click(f.el('pick-main'));f.send('pointerdown');
  for (const type of ['pointerdown', 'pointerup', 'mouseup', 'click'])
    assert.equal(f.send(type, {pointerId: 8}).reachedTarget, true, type + ' unrelated gesture');
  for (const type of ['pointerup', 'mouseup', 'click'])
    assert.equal(f.send(type).reachedTarget, false, type + ' original gesture');
  f.owner.dispose();
});

test('r6 new same-pointer gesture and dispose release all pending event captures', async () => {
  const f = await gestureSettings();
  f.click(f.el('pick-main'));f.send('pointerdown');
  for (const type of ['pointerdown', 'pointerup', 'mouseup', 'click'])
    assert.equal(f.send(type).reachedTarget, true, 'new gesture ' + type);
  for (const disposedDuringPick of [false, true]) {
    const next = await gestureSettings();next.click(next.el('pick-main'));
    if (!disposedDuringPick) next.send('pointerdown');
    next.owner.dispose();
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mouseup', 'click'])
      assert.equal(next.send(type).reachedTarget, true, 'dispose releases ' + type);
  }
  f.owner.dispose();
});


test('r6 legacy compatibility click is consumed but untrusted down cannot select a node', async () => {
  const f = await gestureSettings();
  f.click(f.el('pick-main'));
  f.send('pointerdown', {isTrusted: false});
  assert.equal(f.el('main').value, '#thread', 'synthetic input cannot update the selection');
  assert.equal(f.el('pick').hidden, false, 'selection still awaits trusted input');
  f.send('pointerdown');
  assert.notEqual(f.el('main').value, '#thread', 'trusted fixture input selects the button');
  assert.equal(f.send('pointerup').reachedTarget, false);
  assert.equal(f.send('mouseup').reachedTarget, false);
  assert.equal(f.send('click', {pointerId: undefined, pointerType: undefined}).reachedTarget, false);
  assert.equal(f.send('click', {pointerId: undefined}).reachedTarget, true);
  f.owner.dispose();
});

for(const end of ['pointerup','pointercancel']){
  test('r7 interleaved selected '+end+' preserves the independent mouse release',async()=>{
    const f=await gestureSettings();f.click(f.el('pick-main'));
    f.send('pointerdown',{pointerType:'touch'});
    assert.equal(f.send('pointerdown',{pointerId:8,pointerType:'mouse'}).reachedTarget,true);
    assert.equal(f.send(end,{pointerType:'touch'}).reachedTarget,false);
    for(const type of ['pointerup','mouseup','click'])
      assert.equal(f.send(type,{pointerId:8,pointerType:'mouse'}).reachedTarget,true,type);
    f.owner.dispose();
  });
}


test('R3.7 one-click save does not scroll and confirms Host readback',async()=>{
  const api=storage(),f=await settings(api);
  const before=f.main.scrollTop;
  f.click(f.el('save'));await settle();
  assert.equal(api.writes,1);
  assert.equal(f.calls.length,0);
  assert.equal(f.main.scrollTop,before);
  assert.match(f.el('status').textContent,/已保存/);
  assert.equal((await api.read()).value.sites[0].mainSelector,'#thread');
  assert.equal(f.el('test-top'),null);
  assert.equal(f.el('test-bottom'),null);
  assert.equal(f.el('pick-messages').getAttribute('aria-label'),'在网页点选消息节点');
  assert.equal(f.el('pick-anchor').getAttribute('aria-label'),'在网页点选按钮锚点');
});
test('R3.7 invalid path, CSS, hidden messages and no scrolling reject save',async()=>{
  for(const mode of ['path','css','hidden','short']){
    const api=storage(),f=await settings(api);
    if(mode==='path')f.el('path').value='/unrelated';
    if(mode==='css')f.el('messages').value='article[';
    if(mode==='hidden'){const article=f.main.firstElementChild.cloneNode(true);
      article.style.display='none';f.main.append(article);}
    if(mode==='short')f.main.scrollHeight=f.main.clientHeight;
    f.click(f.el('save'));await settle();
    assert.equal(api.writes,0,mode);
    assert.equal(f.calls.length,0,mode);
    assert.equal(f.el('status').dataset.error,'true',mode);
  }
});
test('R3.7 real message group and anchor picking persist CSS',async()=>{
  const api=storage(),f=await settings(api);
  f.doc.elementFromPoint=()=>f.main.firstElementChild;
  f.click(f.el('pick-messages'));f.dispatch('pointermove');
  assert.equal(f.el('outline').style.display,'block');
  f.dispatch('pointerdown');f.dispatch('click');
  assert.equal(f.el('messages').value,'article');
  const anchor=f.doc.createElement('button');anchor.id='scroll-action-anchor';f.main.append(anchor);
  f.doc.elementFromPoint=()=>anchor;
  f.click(f.el('pick-anchor'));f.dispatch('pointerdown');f.dispatch('click');
  assert.equal(f.el('anchor').value,'#scroll-action-anchor');
  f.click(f.el('save'));await settle();
  assert.equal(api.writes,1);
  const saved=(await api.read()).value.sites[0];
  assert.equal(saved.messageSelector,'article');
  assert.equal(saved.anchorSelector,'#scroll-action-anchor');
  assert.equal(f.calls.length,0);
});
test('R3.7 Esc cancels picking without clearing the CSS draft',async()=>{
  const f=await settings(storage());
  f.el('messages').value='article';
  f.click(f.el('pick-messages'));
  assert.equal(f.dispatch('keydown',{key:'Escape'}).prevented,true);
  assert.equal(f.el('messages').value,'article');
  assert.equal(f.el('pick').hidden,true);
  assert.equal(f.el('panel').hidden,false);
});
test('R3.7 prohibited editable hits cannot overwrite anchor or message',async()=>{
  const f=await settings(storage()),input=f.doc.createElement('textarea');
  f.main.append(input);f.doc.elementFromPoint=()=>input;
  f.el('anchor').value='#kept';
  f.click(f.el('pick-anchor'));f.dispatch('pointerdown');f.dispatch('click');
  assert.equal(f.el('anchor').value,'#kept');
  f.click(f.el('pick-messages'));f.dispatch('pointerdown');f.dispatch('click');
  assert.equal(f.el('messages').value,'article');
});
test('R3.7 unknown write reread preserves draft instead of silently replacing it',async()=>{
  const api=storage();
  api.write=async()=>{throw Object.assign(Error('lost'),{code:'E_CONFIG_UNKNOWN'});};
  const f=await settings(api);f.el('path').value='/c/one';
  f.click(f.el('save'));await settle();
  assert.match(f.el('status').textContent,/E_CONFIG_UNKNOWN/);
  f.click(f.el('reload'));await settle();
  assert.equal(f.el('path').value,'/c/one');
  assert.match(f.el('status').textContent,/草稿/);
});
test('R3.7 path editing updates old rule instead of creating a second one',async()=>{
  const api=storage(),f=await settings(api);
  f.el('path').value='/c/one';
  f.click(f.el('save'));await settle();
  const saved=(await api.read()).value;
  assert.equal(saved.sites.length,1);
  assert.equal(saved.sites[0].pathScope,'/c/one');
});
