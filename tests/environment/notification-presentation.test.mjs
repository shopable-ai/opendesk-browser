import test from 'node:test';
import assert from 'node:assert/strict';
import {build,stop} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

// Compile only the real public presentation component and its dependencies.
// No AppShell, Chrome globals, controller, or product build is needed.
const require=createRequire(import.meta.url);
let compiled;
try {
  compiled=await build({entryPoints:[new URL('../../src/ui/react/components/notifications.tsx',import.meta.url).pathname],
    bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',
    plugins:[{name:'notification-test-react',setup(builder){
      builder.onResolve({filter:/^react(?:-dom)?(?:$|\/)/},({path})=>({
        path:pathToFileURL(require.resolve(path)).href,external:true
      }));
    }}]});
} finally {stop();}
const {NotificationViewport}=await import('data:text/javascript;base64,'+
  Buffer.from(compiled.outputFiles[0].text).toString('base64'));

async function fixture(t,{messageHeight=0,captionHeight=0,clientHeight=0,
  locale,lang='',computedStyle=true}={}) {
  const {window,document}=parseHTML('<html><body><button id="origin">原操作</button><div id="mount"></div></body></html>');
  document.documentElement.lang=lang;
  const globals=['window','document','IS_REACT_ACT_ENVIRONMENT','ResizeObserver'];
  const previous=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  globalThis.window=window;globalThis.document=document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const sizes={message:messageHeight,caption:captionHeight,client:clientHeight};
  // Linkedom does not lay out text. Supply measured heights independently of
  // string length; these tests prove reactions to layout, not real CSS layout.
  const prototype=window.HTMLElement.prototype;
  const descriptors=new Map(['scrollHeight','clientHeight','focus'].map(key=>
    [key,Object.getOwnPropertyDescriptor(prototype,key)]));
  Object.defineProperty(prototype,'clientHeight',{configurable:true,get(){return sizes.client;}});
  Object.defineProperty(prototype,'scrollHeight',{configurable:true,get(){
    if(this.classList.contains('sidebar-tool-toast-message'))return sizes.message;
    if(this.classList.contains('sidebar-tool-toast-caption'))return sizes.caption;
    return sizes.client;
  }});
  let active=document.getElementById('origin');
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>active});
  Object.defineProperty(prototype,'focus',{configurable:true,value:function(){
    const before=active;if(before===this)return;
    active=this;
    for(const [target,type,relatedTarget] of [[before,'focusout',this],[this,'focusin',before]]){
      const event=new window.Event(type,{bubbles:true});
      Object.defineProperty(event,'relatedTarget',{value:relatedTarget});
      target?.dispatchEvent(event);
    }
  }});
  const observers=new Set();
  class ResizeObserver {
    constructor(callback){this.callback=callback;this.nodes=new Set();observers.add(this);}
    observe(node){this.nodes.add(node);}
    unobserve(node){this.nodes.delete(node);}
    disconnect(){this.nodes.clear();observers.delete(this);}
  }
  const oldObserver=Object.getOwnPropertyDescriptor(window,'ResizeObserver');
  const oldStyle=Object.getOwnPropertyDescriptor(window,'getComputedStyle');
  window.getComputedStyle=computedStyle?()=>({lineHeight:'18px'}):undefined;
  window.ResizeObserver=ResizeObserver;
  globalThis.ResizeObserver=ResizeObserver;
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('mount')),view=createSidebarToolsView();
  function Viewport(){
    const snapshot=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
    return React.createElement(NotificationViewport,{view,snapshot,locale});
  }
  t.after(async()=>{
    try {await React.act(async()=>root.unmount());view.dispose();}
    finally {
      for(const [key,descriptor] of descriptors){
        if(descriptor)Object.defineProperty(prototype,key,descriptor);else delete prototype[key];
      }
      if(oldObserver)Object.defineProperty(window,'ResizeObserver',oldObserver);else delete window.ResizeObserver;
      if(oldStyle)Object.defineProperty(window,'getComputedStyle',oldStyle);else delete window.getComputedStyle;
      for(const [key,descriptor] of previous){
        if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
      }
    }
  });
  await React.act(async()=>root.render(React.createElement(Viewport)));
  return {view,window,document,sizes,
    toast:()=>document.querySelector('.sidebar-tool-toast'),
    expand:()=>document.querySelector('button.sidebar-tool-toast-expand'),
    show:async(message,options={})=>React.act(async()=>view.showToast(message,options)),
    tick:async(ms)=>React.act(async()=>t.mock.timers.tick(ms)),
    resize:async()=>React.act(async()=>{
      for(const observer of [...observers])observer.callback(
        [...observer.nodes].map(target=>({target})),observer);
    })};
}

for(const height of [0,36])test(`does not add an expand control when measured text fits (${height}px)`,async t=>{
  const f=await fixture(t,{messageHeight:height,clientHeight:height});
  await f.show('短提示');
  assert.equal(f.expand(),null);
  assert.equal(f.toast().querySelectorAll('button').length,1,'only the original close control is needed');
});

for(const field of ['message','caption'])test(`${field} overflow can be expanded and collapsed without interpreting text as HTML`,async t=>{
  const f=await fixture(t,{clientHeight:36,
    messageHeight:field==='message'?72:36,captionHeight:field==='caption'?72:36});
  const message='<img src=x onerror="throw 1"> & '+ '完整消息'.repeat(22);
  const caption='<b>完整说明</b> & '+ '说明'.repeat(20);
  const type=field==='message'?'info':'error';
  await f.show(message,{caption,type});
  const button=f.expand();assert.ok(button,'measured overflow exposes the full-text control');
  assert.equal(button.getAttribute('aria-expanded'),'false');
  assert.equal(f.toast().dataset.expanded,'false');
  const content=f.document.getElementById(button.getAttribute('aria-controls'));
  assert.ok(content?.classList.contains('sidebar-tool-toast-content'));
  const live=content.querySelector(type==='error'?'[role="alert"]':'[role="status"]');
  assert.ok(live,'full notification text retains its live-region semantics');
  assert.equal(live.getAttribute('aria-live'),type==='error'?'assertive':'polite');
  await React.act(async()=>button.click());
  assert.equal(f.toast().dataset.expanded,'true');
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(content.querySelector('.sidebar-tool-toast-message').textContent,message);
  assert.equal(content.querySelector('.sidebar-tool-toast-caption').textContent,caption);
  assert.equal(content.querySelector('img,b,script'),null);
  await React.act(async()=>button.click());
  assert.equal(f.toast().dataset.expanded,'false');
  assert.equal(button.getAttribute('aria-expanded'),'false');
});

test('remeasures unchanged text on resize and retains a collapse control after expansion',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:36});
  await f.show('同一正文因视口宽度变化而溢出');
  assert.equal(f.expand(),null);
  f.sizes.message=72;await f.resize();
  assert.ok(f.expand(),'a narrower viewport makes the existing text expandable');
  await React.act(async()=>f.expand().click());
  // Unclamped text fits its expanded box, but still exceeds two lines.
  f.sizes.client=72;await f.resize();
  assert.equal(f.expand()?.getAttribute('aria-expanded'),'true',
    'expanded layout fitting its text must not remove the way to collapse');
  f.sizes.message=36;f.sizes.client=36;
  await React.act(async()=>f.expand().click());
  await f.resize();
  assert.equal(f.expand(),null,'fitting collapsed text no longer needs expansion');
});

test('current-window resize remeasures without a ResizeObserver callback',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:36});
  await f.show('正文未变化');
  assert.equal(f.expand(),null);
  f.sizes.message=72;
  await React.act(async()=>f.window.dispatchEvent(new f.window.Event('resize')));
  assert.ok(f.expand());
  f.sizes.message=36;
  await React.act(async()=>f.window.dispatchEvent(new f.window.Event('resize')));
  assert.equal(f.expand(),null);
});

test('uses measured client height when computed style is unavailable',async t=>{
  const f=await fixture(t,{clientHeight:48,messageHeight:48,computedStyle:false});
  await f.show('环境未提供 computed style');
  assert.equal(f.expand(),null);
  f.sizes.message=96;await f.resize();
  assert.ok(f.expand(),'missing computed style must not hide genuinely overflowing text');
});

for(const {name,locale,lang,expand,collapse} of [
  {name:'explicit locale overrides document language',locale:'en',lang:'ja',expand:'Show details',collapse:'Hide details'},
  {name:'standalone Host falls back to document language',lang:'ja',expand:'詳細を表示',collapse:'詳細を閉じる'}
])test(name,async t=>{
  const f=await fixture(t,{locale,lang,clientHeight:36,messageHeight:72});
  await f.show('业务正文保持原文');
  assert.equal(f.expand()?.textContent,expand);
  await React.act(async()=>f.expand().click());
  assert.equal(f.expand().textContent,collapse);
  assert.equal(f.toast().querySelector('.sidebar-tool-toast-message').textContent,'业务正文保持原文');
});

test('the standalone viewport portals position stacks outside its mounting container',async t=>{
  const f=await fixture(t);
  await f.show('顶部提示',{position:'top-left'});
  await f.show('底部提示',{position:'bottom-right'});
  const stacks=[...f.document.querySelectorAll('.sidebar-tool-toast-stack')];
  assert.deepEqual(stacks.map(node=>node.dataset.position).sort(),['bottom-right','top-left']);
  assert.equal(f.document.getElementById('mount').querySelector('.sidebar-tool-toast'),null);
  for(const stack of stacks)assert.equal(stack.parentElement,f.document.body);
});

test('a shorter same-ID update transfers expand-button focus to close and gets the new revision timeout',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  let id;
  await React.act(async()=>{id=f.view.addToolToast('需要展开的旧内容',{},'owner');});
  await f.tick(2000);
  await React.act(async()=>f.expand().focus());
  f.sizes.message=36;
  await React.act(async()=>assert.equal(f.view.updateToolToast(id,'最新短内容',{},'owner'),true));
  assert.equal(f.view.getSnapshot().toast.id,id);
  assert.equal(f.toast().querySelector('.sidebar-tool-toast-message').textContent,'最新短内容');
  assert.equal(f.expand(),null);
  assert.equal(f.document.activeElement,f.toast().querySelector('button[aria-label="关闭提示"]'));
  await React.act(async()=>f.document.getElementById('origin').focus());
  await f.tick(4999);assert.ok(f.toast());
  await f.tick(1);assert.equal(f.toast(),null);
});

test('ordinary expansion focus pauses only the remaining default timeout',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  await f.show('普通通知');
  await f.tick(2000);
  await React.act(async()=>{f.expand().focus();f.expand().click();});
  await f.tick(10000);assert.ok(f.toast(),'focused expanded text remains readable');
  await React.act(async()=>f.document.getElementById('origin').focus());
  await f.tick(2999);assert.ok(f.toast());
  await f.tick(1);assert.equal(f.toast(),null,'expanding must not restart the five-second interval');
});

test('trusted success expires at five seconds even with its expansion control focused',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  await f.show('可信成功',{type:'success',pauseOnInteraction:false,timeout:5000});
  await f.tick(2000);
  await React.act(async()=>{f.expand().focus();f.expand().click();});
  await f.tick(2999);assert.ok(f.toast());
  await f.tick(1);assert.equal(f.toast(),null);
  assert.equal(f.document.activeElement,f.document.getElementById('origin'));
});

test('owner cleanup removes an expanded notice without reviving it on resize or late update',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  let id;
  await React.act(async()=>{
    id=f.view.addToolToast('即将结束的实例',{timeout:0},'old-owner');
    f.view.addToolToast('其他实例仍保留',{timeout:0},'other-owner');
  });
  await React.act(async()=>f.expand().click());
  await React.act(async()=>f.view.clearToastsByOwner('old-owner'));
  await f.resize();
  await React.act(async()=>assert.equal(f.view.updateToolToast(id,'迟到更新',{},'old-owner'),false));
  assert.deepEqual(f.view.getSnapshot().toasts.map(row=>row.message),['其他实例仍保留']);
  assert.equal(f.document.querySelectorAll('.sidebar-tool-toast').length,1);
  assert.equal(f.document.body.textContent.includes('即将结束的实例'),false);
});

test('passive owner cleanup returns expansion focus before removing the notification',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  await React.act(async()=>f.view.addToolToast('实例即将关闭',{timeout:0},'owner'));
  const button=f.expand(),origin=f.document.getElementById('origin');
  await React.act(async()=>{button.focus();button.click();});
  let restoredBeforeRemoval=false;
  const focus=origin.focus;
  t.mock.method(origin,'focus',function(...args){
    restoredBeforeRemoval=button.isConnected;
    return focus.apply(this,args);
  });
  await React.act(async()=>f.view.clearToastsByOwner('owner'));
  assert.equal(f.toast(),null);
  assert.equal(f.document.activeElement,origin);
  assert.equal(restoredBeforeRemoval,true,'focus must leave the notice before its DOM is detached');
});

test('zero-layout notifications retain expansion and focus until visible dimensions can be measured',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  await f.show('隐藏期间仍需保留的正文',{timeout:0});
  const toast=f.toast(),button=f.expand();
  let visible=true;
  toast.getClientRects=()=>visible?[{width:300,height:100}]:[];
  await React.act(async()=>{button.focus();button.click();});
  visible=false;f.sizes.message=0;f.sizes.client=0;
  await f.resize();
  assert.equal(toast.dataset.expanded,'true');
  assert.equal(f.expand(),button);
  assert.equal(f.document.activeElement,button,'hidden zero sizes cannot remove the focused control');
  visible=true;f.sizes.message=36;f.sizes.client=36;
  await f.resize();
  assert.equal(toast.dataset.expanded,'false','real visible sizes can retire unnecessary expansion');
  assert.equal(f.expand(),null);
  assert.equal(f.document.activeElement,toast.querySelector('button[aria-label="关闭提示"]'));
});

test('modal-hidden zero sizes do not collapse a focused notice when the review closes',async t=>{
  const f=await fixture(t,{clientHeight:36,messageHeight:72});
  await f.show('审阅后继续阅读',{timeout:0});
  const button=f.expand();
  // Keep valid client rects to exercise the modal pause independently of the
  // no-layout guard tested above. Linkedom does not implement modal focus.
  f.toast().getClientRects=()=>[{width:300,height:100}];
  await React.act(async()=>{button.focus();button.click();});
  const dialog=f.document.createElement('div');dialog.setAttribute('aria-modal','true');
  f.sizes.message=0;f.sizes.client=0;
  await React.act(async()=>{f.document.body.append(dialog);await Promise.resolve();});
  await f.resize();
  assert.equal(f.expand(),button);
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(f.document.activeElement,button);
  f.sizes.message=72;f.sizes.client=36;
  await React.act(async()=>{dialog.remove();await Promise.resolve();});
  assert.equal(f.expand(),button);
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(f.document.activeElement,button);
});
