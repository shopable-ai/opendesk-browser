import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {transformSync} from 'esbuild';
import * as React from 'react';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../app/components/CookieMonitorPopover.jsx',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'jsx',format:'cjs',jsx:'transform'}).code;
const module={exports:{}};
new Function('require','module','exports',compiled)(createRequire(import.meta.url),module,module.exports);
const CookieMonitorPopover=module.exports.default;

function mount(t,initial={}){
  const dom=new JSDOM('<!doctype html><div id="root"></div><button id="outside">Other action</button>',
    {url:'https://example.com/'});
  const {window}=dom,{document}=window;
  const globals={window,document,IS_REACT_ACT_ENVIRONMENT:true};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,globals);
  const container=document.getElementById('root'),outside=document.getElementById('outside');
  const root=createRoot(container);
  const calls={start:0,stop:0};
  let props={onStart:()=>calls.start++,onStop:()=>calls.stop++,...initial};
  t.after(()=>{
    try{act(()=>root.unmount());}
    finally{
      dom.window.close();
      for(const [key,descriptor] of previous){
        if(descriptor)Object.defineProperty(globalThis,key,descriptor);
        else delete globalThis[key];
      }
    }
  });
  const update=next=>{props={...props,...next};act(()=>root.render(React.createElement(CookieMonitorPopover,props)));};
  const button=name=>{
    const found=[...container.querySelectorAll('button')].find(node=>
      (node.getAttribute('aria-label')||node.textContent).trim()===name);
    assert.ok(found,`button available: ${name}`);
    return found;
  };
  const click=node=>act(()=>node.click());
  const focus=node=>act(()=>node.focus());
  const trigger=()=>container.querySelector('button[aria-haspopup="dialog"]');
  const dialog=()=>container.querySelector('[role="dialog"]');
  const open=()=>{click(trigger());assert.ok(dialog());};
  const escape=()=>act(()=>document.activeElement.dispatchEvent(
    new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  update({});
  return {window,document,container,outside,calls,update,button,click,focus,trigger,dialog,open,escape};
}

test('default is a collapsed More action with no counters or change controls',t=>{
  const ui=mount(t,{changes:[{kind:'updated',name:'sample'}],onlyChanged:true});
  assert.equal(ui.dialog(),null);
  assert.equal(ui.trigger().getAttribute('aria-label'),'更多 Cookie 操作');
  assert.equal(ui.container.textContent.trim(),'');
  ui.open();
  assert.equal(ui.dialog().querySelectorAll('button').length,1);
  assert.match(ui.dialog().textContent,/列表默认自动同步/);
  assert.doesNotMatch(ui.container.textContent,/新增|更新|删除|仅看变化|清除标记/);
});

test('opening focuses the sole action; starting once dismisses and restores focus',t=>{
  const ui=mount(t);ui.open();
  const start=ui.button('监听 Cookie 变化（30 秒）');
  assert.equal(ui.document.activeElement,start);
  assert.equal(ui.calls.start,0,'opening must not activate listening');
  ui.click(start);
  assert.equal(ui.calls.start,1);assert.equal(ui.calls.stop,0);
  assert.equal(ui.dialog(),null);assert.equal(ui.document.activeElement,ui.trigger());
});

test('running stays visible without color and stopping is one action',t=>{
  const ui=mount(t,{phase:'running',remaining:24});
  assert.match(ui.trigger().getAttribute('aria-label'),/监听中/);
  assert.equal(ui.trigger().querySelector('.cookie-monitor-badge').textContent.trim(),'■');
  ui.open();
  assert.match(ui.dialog().textContent,/24 秒后自动停止/);
  const announcement=ui.container.querySelector('[aria-live]').textContent;
  ui.update({remaining:23});
  assert.equal(ui.container.querySelector('[aria-live]').textContent,announcement,'countdown is not announced every second');
  ui.click(ui.button('停止监听'));
  assert.equal(ui.calls.stop,1);assert.equal(ui.calls.start,0);
  assert.equal(ui.dialog(),null);assert.equal(ui.document.activeElement,ui.trigger());
});

for(const dismissal of ['Escape','trigger','outside pointer','outside focus','window blur']){
  test(`${dismissal} dismisses without stopping a running observer`,t=>{
    const ui=mount(t,{phase:'running',remaining:20});ui.open();
    if(dismissal==='Escape')ui.escape();
    else if(dismissal==='trigger')ui.click(ui.trigger());
    else if(dismissal==='outside pointer')act(()=>ui.outside.dispatchEvent(new ui.window.Event('pointerdown',{bubbles:true})));
    else if(dismissal==='outside focus')ui.focus(ui.outside);
    else act(()=>ui.window.dispatchEvent(new ui.window.Event('blur')));
    assert.equal(ui.dialog(),null);assert.equal(ui.calls.stop,0);assert.equal(ui.calls.start,0);
    if(dismissal==='Escape')assert.equal(ui.document.activeElement,ui.trigger());
    if(dismissal==='outside focus')assert.equal(ui.document.activeElement,ui.outside);
  });
}

for(const [reason,props] of [['starting',{phase:'starting'}],['unsupported',{supported:false}],['editing',{available:false}]]){
  test(`${reason} prevents a start callback and remains keyboard dismissible`,t=>{
    const ui=mount(t,props);ui.open();
    const action=ui.dialog().querySelector('button');
    assert.equal(action.disabled,true);ui.click(action);assert.equal(ui.calls.start,0);
    assert.equal(ui.document.activeElement,ui.dialog());
    ui.escape();assert.equal(ui.document.activeElement,ui.trigger());
  });
}

test('failed listening leaves a persistent warning and an explicit retry',t=>{
  const ui=mount(t,{phase:'error'});
  assert.equal(ui.trigger().querySelector('.cookie-monitor-badge').textContent.trim(),'!');
  ui.open();assert.match(ui.dialog().textContent,/监听未完成/);
  ui.escape();ui.open();
  ui.click(ui.button('重试监听（30 秒）'));
  assert.equal(ui.calls.start,1);assert.equal(ui.dialog(),null);
});

test('expiry removes the active badge, never reopens or restarts listening',t=>{
  const ui=mount(t,{phase:'running',remaining:1});
  ui.update({phase:'ended',remaining:0});
  assert.equal(ui.dialog(),null);assert.equal(ui.trigger().querySelector('.cookie-monitor-badge'),null);
  assert.match(ui.container.querySelector('[aria-live]').textContent,/监听已结束/);
  assert.equal(ui.calls.start,0);assert.equal(ui.calls.stop,0);
});
