import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';

const get=path=>readFile(path,'utf8');
test('Sidebar separates dynamic result from technical/history details and offers explicit copy', async()=>{
  const [html,editor,task,css]=await Promise.all([
    renderSidebarFixture(),get('src/ui/script-editor.js'),
    get('src/ui/task-workbench.js'),get('src/ui/tool-shell.css')]);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['script-result-kind','script-copy-result','script-history-panel','task-result-reveal',
    'page-preview-technical-panel','page-preview-technical'])assert(ids.includes(id),id);
  assert.match(html,/<summary>运行结果<\/summary>/);
  assert.match(html,/<summary>运行记录与技术信息<\/summary>/);
  assert.match(editor,/formatControllerRunResult\(values, focused\?\.runId/);
  assert.match(editor,/clipboard\.writeText\(output\.textContent\)/);
  assert.match(editor,/result\.resultText \?\? 'undefined'/);
  assert.doesNotMatch(editor,/result\.resultText\+' \\n源码 SHA-256/);
  assert.match(task,/presentTaskValue\(decoded\)/);
  assert.match(task,/task-result-reveal/);
  assert.match(css,/\.result-toolbar/);
});

// Exercise production components, store subscription and action forwarding.
// Clipboard service behavior remains the original ScriptEditor owner's test.
test('R37 result/history projection renders text safely, forwards copy and unmounts cleanly',async t=>{
  const {DeveloperPage,DeveloperDock,createDeveloperView}=await loadSidebarReact();
  const view=createDeveloperView(),calls=[];
  view.actions['script-copy-result']=event=>calls.push(event);
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const previous=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window,document,IS_REACT_ACT_ENVIRONMENT:true}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const root=createRoot(document.getElementById('root'));
  let unmounted=false;
  const unmount=async()=>{if(!unmounted){await React.act(async()=>root.unmount());unmounted=true;}};
  t.after(async()=>{
    await unmount();view.dispose();
    for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  });
  const get=id=>document.getElementById(id);
  await React.act(async()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(DeveloperPage,{view}),React.createElement(DeveloperDock,{view}))));
  assert.ok(view.resourceSnapshot().subscriptions>0);
  const payload='<img src=x onerror=alert(1)>';
  await React.act(async()=>{
    view.patch('script-result',{textContent:payload});
    view.patch('script-result-kind',{textContent:'持久结果'});
    view.patch('script-history',{textContent:'run-one / revision-two'});
    view.patch('script-history-panel',{open:true});
    view.patch('script-copy-result',{disabled:false});
  });
  assert.equal(get('script-result').textContent,payload);
  assert.equal(get('script-result').querySelector('img'),null);
  assert.equal(get('script-result-kind').textContent,'持久结果');
  assert.equal(get('script-history').textContent,'run-one / revision-two');
  assert.equal(get('script-history-panel').hasAttribute('open'),true);
  assert.equal(calls.length,0,'rendering results never copies automatically');
  const event=new window.Event('click',{bubbles:true});
  await React.act(async()=>get('script-copy-result').dispatchEvent(event));
  assert.deepEqual(calls,[event],'the real React control forwards its native event');
  await React.act(async()=>view.patch('script-copy-result',{disabled:true}));
  await React.act(async()=>get('script-copy-result').dispatchEvent(new window.Event('click',{bubbles:true})));
  assert.equal(calls.length,1,'disabled copy is inert');
  await unmount();
  assert.equal(view.resourceSnapshot().subscriptions,0);
  assert.equal(get('root').childNodes.length,0);
  view.patch('script-result',{textContent:'late update'});
  await Promise.resolve();
  assert.equal(get('root').childNodes.length,0);
});
