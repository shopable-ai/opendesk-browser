import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import * as React from 'react';

// DOM interaction evidence only: no browser layout, trusted user gestures,
// Scheduler mutations or Chrome permissions are simulated or claimed.
const rows=[
  {taskId:'first.task',title:'每日整理',description:'整理当前网站内容',enabled:true,
    version:'1.2.0',linked:2,siteOrigins:['https://example.com']},
  {taskId:'second.task',title:'每周检查',description:'检查待处理内容',enabled:false,
    version:'2.0.0',linked:0,siteOrigins:[]},
];

async function fixture(Component,initialProps={}){
  const dom=new JSDOM('<!doctype html><html><body><div id="mount"></div><button id="outside">外部操作</button></body></html>',
    {pretendToBeVisual:true});
  const {window}=dom,{document}=window;
  // Synthetic geometry keeps the disclosure anchor in view; this does not
  // establish Chromium positioning or overflow evidence.
  window.HTMLElement.prototype.getBoundingClientRect=function(){
    return this.tagName==='SUMMARY'?new window.DOMRect(280,100,34,34):new window.DOMRect();
  };
  const globals={window,document,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,
    IS_REACT_ACT_ENVIRONMENT:true};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  let root,props={rows,...initialProps};
  const unmount=async()=>{if(root){await React.act(async()=>root.unmount());root=null;}};
  const dispose=async()=>{
    try{await unmount();}
    finally{
      window.close();
      for(const [key,descriptor]of previous){
        if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
      }
    }
  };
  try{
    const {createRoot}=await import('react-dom/client');
    root=createRoot(document.getElementById('mount'));
    const render=async changes=>{
      props={...props,...changes};
      await React.act(async()=>root.render(React.createElement(Component,props)));
    };
    await render({});
    const fire=async(node,type,options={})=>{
      assert.ok(node,`target exists for ${type}`);
      const Event=type==='keydown'?window.KeyboardEvent:type==='click'?window.MouseEvent:window.Event;
      const event=new Event(type,{bubbles:true,cancelable:true,...options});
      await React.act(async()=>node.dispatchEvent(event));
      return event;
    };
    const focus=async node=>{await React.act(async()=>node.focus());};
    const frame=async()=>{await React.act(async()=>new Promise(resolve=>window.requestAnimationFrame(resolve)));};
    const card=(id='first.task')=>[...document.querySelectorAll('article')]
      .find(node=>node.getAttribute('data-manager-task-id')===id);
    const menu=id=>card(id)?.querySelector('details');
    const trigger=id=>menu(id)?.querySelector('summary');
    return {document,render,fire,focus,frame,card,menu,trigger,unmount,dispose,
      outside:document.getElementById('outside')};
  }catch(error){await dispose();throw error;}
}

test('ScheduleManagerRows DOM interactions',async t=>{
  const parent=new URL('../../artifacts/',import.meta.url);
  await mkdir(parent,{recursive:true});
  const artifacts=await mkdtemp(fileURLToPath(new URL('schedule-manager-interaction-',parent)));
  try{
    const outfile=`${artifacts}/schedule.mjs`;
    await build({entryPoints:[fileURLToPath(new URL('../../src/ui/react/tabs/schedule.tsx',import.meta.url))],
      bundle:true,packages:'external',platform:'node',format:'esm',outfile,logLevel:'silent'});
    const {ScheduleManagerRows}=await import(pathToFileURL(outfile));
    const check=async(name,run,props)=>t.test(name,async()=>{
      const f=await fixture(ScheduleManagerRows,props);
      try{await run(f);}finally{await f.dispose();}
    });

    await check('renders visible enabled and disabled status text',async f=>{
      assert.equal(f.card().querySelector('.schedule-manager-state').textContent,'已启用');
      assert.equal(f.card('second.task').querySelector('.schedule-manager-state').textContent,'已停用');
    });
    await check('renders the task description outside the closed disclosure',async f=>{
      const description=f.card().querySelector('.schedule-manager-description');
      assert.equal(description.textContent,rows[0].description);
      assert.equal(description.closest('details'),null);
    });
    await check('keeps toggle and copy actions outside the closed more menu',async f=>{
      const actions=[...f.card().querySelectorAll('button')].filter(button=>!button.closest('details'));
      assert.deepEqual(actions.map(button=>button.getAttribute('aria-label')),['停用「每日整理」','复制「每日整理」到开发']);
      assert.equal(f.menu().open,false);
    });
    await check('clicking the summary opens its details menu',async f=>{
      assert.equal(f.menu().open,false);
      const event=await f.fire(f.trigger(),'click');
      assert.equal(event.defaultPrevented,true,'React suppresses the native details toggle');
      assert.equal(f.menu().open,true);
    });
    await check('clicking the open summary closes its menu',async f=>{
      await f.fire(f.trigger(),'click');
      await f.fire(f.trigger(),'click');
      assert.equal(f.menu().open,false);
    });
    await check('opening another row closes the previously open menu',async f=>{
      await f.fire(f.trigger(),'click');
      await f.fire(f.trigger('second.task'),'click');
      assert.equal(f.menu().open,false);
      assert.equal(f.menu('second.task').open,true);
    });
    await check('Escape from a menu item closes the menu and restores summary focus',async f=>{
      await f.fire(f.trigger(),'click');
      const item=f.menu().querySelector('button');
      await f.focus(item);
      const event=await f.fire(item,'keydown',{key:'Escape'});
      assert.equal(f.menu().open,false);
      assert.equal(f.document.activeElement,f.trigger());
      assert.equal(event.defaultPrevented,true);
    });
    await check('a key other than Escape leaves the open menu intact',async f=>{
      await f.fire(f.trigger(),'click');
      const event=await f.fire(f.menu().querySelector('button'),'keydown',{key:'a'});
      assert.equal(f.menu().open,true);
      assert.equal(event.defaultPrevented,false);
    });
    await check('moving focus between descendants keeps the menu open',async f=>{
      await f.fire(f.trigger(),'click');
      const items=f.menu().querySelectorAll('button');
      await f.focus(items[0]);await f.focus(items[1]);
      assert.equal(f.document.activeElement,items[1]);
      assert.equal(f.menu().open,true);
    });
    await check('focusout toward an internal button keeps the menu open while activeElement is temporarily BODY',async f=>{
      await f.fire(f.trigger(),'click');
      const item=f.menu().querySelector('button');
      const {FocusEvent}=f.document.defaultView;
      // Chromium can run the focusout microtask before committing focusin.
      // Dispatch only that transition here; do not synthesize a trusted click
      // or invoke the menu action's business callback.
      assert.equal(f.document.activeElement,f.document.body);
      await React.act(async()=>{
        f.trigger().dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:item}));
        await Promise.resolve();
      });
      assert.equal(f.document.activeElement,f.document.body);
      assert.equal(f.menu().open,true,'an internal relatedTarget must survive the pre-focusin microtask');
      await f.focus(item);
      assert.equal(f.document.activeElement,item);
      assert.equal(f.menu().open,true);
    });
    await check('moving focus outside closes the menu without stealing focus',async f=>{
      await f.fire(f.trigger(),'click');
      await f.focus(f.menu().querySelector('button'));
      await f.focus(f.outside);
      assert.equal(f.menu().open,false);
      assert.equal(f.document.activeElement,f.outside);
    });
    await check('pointerdown outside closes the menu',async f=>{
      await f.fire(f.trigger(),'click');
      await f.fire(f.outside,'pointerdown');
      assert.equal(f.menu().open,false);
    });
    await check('leaving the document closes the menu when no outside focusin occurs',async f=>{
      await f.fire(f.trigger(),'click');
      const item=f.menu().querySelector('button');
      await f.focus(item);
      await React.act(async()=>{item.blur();await Promise.resolve();});
      assert.equal(f.document.activeElement,f.document.body);
      assert.equal(f.menu().open,false);
    });
    await check('pointerdown inside keeps the menu open',async f=>{
      await f.fire(f.trigger(),'click');
      await f.fire(f.menu().querySelector('button'),'pointerdown');
      assert.equal(f.menu().open,true);
    });
    await check('ArrowDown opens the menu and focuses its first action',async f=>{
      await f.focus(f.trigger());
      const event=await f.fire(f.trigger(),'keydown',{key:'ArrowDown'});
      await f.frame();
      assert.equal(event.defaultPrevented,true);
      assert.equal(f.menu().open,true);
      assert.equal(f.document.activeElement,f.menu().querySelector('button'));
    });
    await check('ArrowDown focuses the first available action when plan creation is unavailable',async f=>{
      await f.focus(f.trigger());
      await f.fire(f.trigger(),'keydown',{key:'ArrowDown'});await f.frame();
      assert.equal(f.document.activeElement.textContent,'卸载固定版本');
      assert.equal(f.document.activeElement,f.menu().querySelector('button'));
    },{canCreatePlan:false});
    await check('removing the open row clears its menu state before the row returns',async f=>{
      await f.fire(f.trigger(),'click');
      await f.render({rows:[rows[1]]});
      assert.equal(f.card(),undefined);
      assert.equal(f.menu('second.task').open,false);
      await f.render({rows});
      assert.equal(f.menu().open,false);
    });
    await check('filtering all rows out clears the open menu before results return',async f=>{
      await f.fire(f.trigger(),'click');
      await f.render({rows:[],emptyText:'没有匹配的任务'});
      assert.equal(f.document.querySelector('[role="status"]').textContent,'没有匹配的任务');
      assert.equal(f.document.querySelector('details'),null);
      await f.render({rows});
      assert.equal(f.menu().open,false);
    });
    await check('rerendering an existing row preserves its open menu',async f=>{
      await f.fire(f.trigger(),'click');
      await f.render({rows:rows.map(row=>({...row,linked:3}))});
      assert.equal(f.menu().open,true);
    });
    await check('unmounting an open menu removes its document Escape handler',async f=>{
      await f.fire(f.trigger(),'click');
      await f.unmount();
      const event=await f.fire(f.outside,'keydown',{key:'Escape'});
      assert.equal(event.defaultPrevented,false);
    });
  }finally{await rm(artifacts,{recursive:true,force:true});}
});
