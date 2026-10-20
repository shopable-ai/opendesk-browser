import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createExtensionCenterDOM,UninstallDialog} from '../helpers/extension-center-react-dom.mjs';

function dialog(t,{busy=false}={}){
  const events=[];
  const f=createExtensionCenterDOM(t,{component:UninstallDialog,props:{open:false,busy,
    title:'卸载「同名笔记」？',description:'清理此应用的本地数据与网站授权，无法撤销。',
    identity:{key:'app:notes-two',kind:'app',version:'2.0.0'},
    children:React.createElement('button',{'data-uninstall-cancel':true},'取消')}});
  const trigger=f.doc.createElement('button');trigger.textContent='卸载入口';f.doc.body.append(trigger);trigger.focus();
  f.state.onCancel=event=>{events.push(event);f.state.open=false;f.paint();};
  f.state.open=true;f.paint();
  return {...f,events,trigger,panel:()=>f.doc.querySelector('[role="dialog"]')};
}

test('uninstall dialog identifies the exact object, describes data loss and has a safe close control',t=>{
  const f=dialog(t),panel=f.panel();
  assert.match(panel.textContent,/notes-two/,'same-name objects are distinguished by their real ID');
  assert.match(panel.textContent,/2\.0\.0/);
  assert.match(f.doc.getElementById(panel.getAttribute('aria-describedby')).textContent,/无法撤销/);
  const close=panel.querySelector('[aria-label="关闭卸载确认"]');
  assert.ok(close,'a visible close control supplements Cancel, Escape and backdrop');
  const event=close.dispatch('click');
  assert.equal(f.events[0],event,'the original native event reaches the trusted controller');
  assert.equal(f.panel(),null);assert.equal(f.doc.activeElement,f.trigger);
});

test('uninstall dialog isolates background siblings, contains focus and restores prior isolation',async t=>{
  const f=dialog(t),panel=f.panel(),root=f.doc.getElementById('workspace-content');
  assert.equal(root.inert,true);assert.equal(root.getAttribute('aria-hidden'),'true');
  assert.equal(f.doc.activeElement,panel.querySelector('[data-uninstall-cancel]'));
  const outside=f.doc.createElement('button');f.doc.body.append(outside);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(outside.inert,true,'late body portals cannot become an interactive background');
  f.doc.activeElement=f.doc.body;f.doc.dispatch('focusin');
  assert.equal(f.doc.activeElement,panel.querySelector('[data-uninstall-cancel]'));
  f.doc.dispatch('keydown',{key:'Tab'});
  assert.equal(f.doc.activeElement,panel.querySelector('[aria-label="关闭卸载确认"]'));
  f.doc.dispatch('keydown',{key:'Tab',shiftKey:true});
  assert.equal(f.doc.activeElement,panel.querySelector('[data-uninstall-cancel]'));
  f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(f.events.length,1);assert.equal(root.inert,false);
  assert.equal(root.getAttribute('aria-hidden'),null);assert.equal(outside.inert,false);
  assert.equal(f.doc.body.style.overflow,'');
});

test('busy uninstall keeps focus inside and blocks all dismissal paths until the operation settles',t=>{
  const f=dialog(t),cancel=f.panel().querySelector('[data-uninstall-cancel]');
  f.state.busy=true;cancel.disabled=true;f.paint();
  assert.equal(f.doc.activeElement,f.panel(),'disabled action focus moves to the dialog');
  assert.match(f.panel().querySelector('[role="status"]').textContent,/正在卸载/);
  f.doc.dispatch('keydown',{key:'Escape'});
  f.doc.querySelector('.od-uninstall-backdrop').dispatch('click');
  f.panel().querySelector('[aria-label="关闭卸载确认"]').dispatch('click');
  assert.equal(f.events.length,0);assert.ok(f.panel());
  f.state.busy=false;cancel.disabled=false;f.paint();
  f.doc.querySelector('.od-uninstall-backdrop').dispatch('click');
  assert.equal(f.events.length,1);assert.equal(f.panel(),null);
});
