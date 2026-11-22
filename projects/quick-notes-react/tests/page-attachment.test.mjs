import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../tests/helpers/extension-center-react-dom.mjs';

const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
// Only shared presentation and the SDK are substituted; mount the production App.
const ui=moduleURL('import {createElement as h} from '+JSON.stringify(import.meta.resolve('react'))+';'+
  'export const Button=p=>h("button",p),IconButton=({label,...p})=>h("button",{"aria-label":label,...p}),Card=p=>h("div",p),CardContent=Card;');
const {code}=await transform(await readFile(new URL('../src/App.jsx',import.meta.url),'utf8'),{loader:'jsx'});
const {default:App}=await import(moduleURL(code.replaceAll('"react"',JSON.stringify(import.meta.resolve('react')))
  .replace('"@opendesk/ui"',JSON.stringify(ui)).replace('"./model.js"',JSON.stringify(new URL('../src/model.js',import.meta.url).href))));
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};

test('navigation during attachment validation blocks the old save and lets a new note save offline',async t=>{
  const page={status:'available',url:'https://example.test/page',title:'Example'};
  let reads=0,completeValidation;
  const writes=[],etag='a'.repeat(64);
  const request=async(operation,payload)=>{
    if(operation==='storage.get')return {value:null,etag};
    if(operation==='currentPage.info')return ++reads===1?page:new Promise(resolve=>{completeValidation=resolve;});
    if(operation==='storage.set'){writes.push(payload);return {saved:true,etag};}
    assert.fail(operation);
  };
  const {doc}=createExtensionCenterDOM(t,{component:()=>React.createElement(App,{request,hostRoot:document.body})});
  await settle();
  const editor=doc.getElementById('note-text'),attach=doc.getElementById('attach-page');
  editor.value='Keep this draft';editor.dispatch('input');
  attach.checked=true;attach.dispatch('click');
  const save=doc.querySelector('[aria-label="保存笔记"]');
  save.dispatch('click');await settle();
  assert.equal(typeof completeValidation,'function');
  doc.body.dispatch('opendesk-page-changed');completeValidation(page);await settle();
  assert.equal(writes.length,0);assert.equal(editor.value,'Keep this draft');
  assert.equal(attach.disabled,false,'the checked attachment can still be cleared');
  attach.checked=false;attach.dispatch('click');
  save.dispatch('click');await settle();
  assert.equal(writes.length,1);assert.equal(writes[0].value[0].pageUrl,'');
});
