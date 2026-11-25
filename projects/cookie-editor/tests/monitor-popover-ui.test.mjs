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
  const trigger=()=>container.querySelector('.cookie-monitor > button');
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
  assert.match(ui.dialog().textContent,/列表会自动同步.*当前页面.*最长 30 秒/);
  assert.doesNotMatch(ui.container.textContent,/新增|更新|删除|仅看变化|清除标记/);
});

test('opening focuses the sole action; starting once dismisses and restores focus',t=>{
  const ui=mount(t);ui.open();
  const start=ui.button('监听当前网站');
  assert.equal(ui.document.activeElement,start);
  assert.equal(ui.calls.start,0,'opening must not activate listening');
  ui.click(start);
  assert.equal(ui.calls.start,1);assert.equal(ui.calls.stop,0);
  assert.equal(ui.dialog(),null);assert.equal(ui.document.activeElement,ui.trigger());
});

test('the same More button stays in place but cannot open during a clear and re-read',t=>{
  const ui=mount(t,{epoch:1});
  const trigger=ui.trigger();
  ui.open();
  ui.update({disabled:true,available:false});
  assert.equal(ui.trigger(),trigger);
  assert.equal(trigger.disabled,true);
  assert.equal(ui.dialog(),null);
  ui.click(trigger);
  assert.equal(ui.dialog(),null);
  ui.update({epoch:2});
  assert.equal(ui.trigger(),trigger);
  assert.equal(trigger.disabled,true);
  ui.update({disabled:false,available:true});
  assert.equal(ui.trigger(),trigger);
  assert.equal(ui.dialog(),null);
  ui.open();
  assert.equal(ui.button('监听当前网站').disabled,false);
});

test('running shows the countdown and stops from the toolbar in one action',t=>{
  const ui=mount(t,{phase:'running',remaining:24});
  assert.equal(ui.trigger().textContent,'监听中 24 秒');
  const announcement=ui.container.querySelector('[aria-live]').textContent;
  ui.update({remaining:23});
  assert.equal(ui.trigger().textContent,'监听中 23 秒');
  assert.equal(ui.container.querySelector('[aria-live]').textContent,announcement,'countdown is not announced every second');
  ui.focus(ui.trigger());ui.click(ui.button('监听中，停止监听'));
  assert.equal(ui.calls.stop,1);assert.equal(ui.calls.start,0);
  ui.update({phase:'stopped',detected:true});
  assert.equal(ui.dialog(),null);assert.equal(ui.document.activeElement,ui.trigger());
  ui.open();assert.match(ui.dialog().textContent,/已检测到 Cookie 变化/);
});

for(const dismissal of ['Escape','trigger','outside pointer','outside focus','window blur']){
  test(`${dismissal} dismisses the result without starting another session`,t=>{
    const ui=mount(t,{phase:'ended'});ui.open();
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

test('starting retains keyboard focus and blocks duplicate starts',t=>{
  const ui=mount(t);ui.focus(ui.trigger());ui.update({phase:'starting'});
  assert.equal(ui.document.activeElement,ui.trigger());
  assert.equal(ui.trigger().getAttribute('aria-disabled'),'true');
  ui.click(ui.trigger());
  assert.equal(ui.dialog(),null);assert.equal(ui.calls.start,0);assert.equal(ui.calls.stop,0);
});

for(const [reason,props] of [['unsupported',{supported:false}],['editing',{available:false}]]){
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
  assert.equal(ui.trigger().textContent,'监听中断');
  ui.open();assert.match(ui.dialog().textContent,/检查网站权限/);
  ui.escape();ui.open();
  ui.click(ui.button('重试监听'));
  assert.equal(ui.calls.start,1);assert.equal(ui.dialog(),null);
});

test('expiry keeps a result and requires an explicit restart',t=>{
  const ui=mount(t,{phase:'running',remaining:1});
  ui.update({phase:'ended',remaining:0});
  assert.equal(ui.dialog(),null);assert.equal(ui.trigger().textContent,'监听结束');
  assert.match(ui.container.querySelector('[aria-live]').textContent,/监听结束.*未检测到 Cookie 变化/);
  assert.equal(ui.calls.start,0);assert.equal(ui.calls.stop,0);
  ui.open();assert.match(ui.dialog().textContent,/本次未检测到 Cookie 变化/);
  ui.click(ui.button('再次监听'));assert.equal(ui.calls.start,1);
});

test('an incomplete observation never reports that no changes were found',t=>{
  const ui=mount(t,{phase:'ended',gap:true});ui.open();
  assert.match(ui.dialog().textContent,/监听记录不完整/);
  assert.doesNotMatch(ui.dialog().textContent,/未检测到/);
});
