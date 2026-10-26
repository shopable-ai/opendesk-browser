import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceCleanupSite} from '../src/site.js';

function fixture(){
  const form={isConnected:true,querySelector:()=>null,querySelectorAll:()=>[],hasAttribute:()=>false};
  const editor={isConnected:true,isContentEditable:true,readOnly:false,disabled:false,
    innerText:'原草稿',textContent:'原草稿',getClientRects:()=>[{}],
    getBoundingClientRect:()=>({width:100}),querySelector:()=>null,
    hasAttribute:()=>false,getAttribute:()=>null,
    closest:selector=>selector==='form'?form:null,focus:()=>{doc.activeElement=editor}};
  const doc={activeElement:null,querySelectorAll:()=>[editor],
    createRange:()=>({selectNodeContents(){}}),
    execCommand(type,ignored,value){
      if(type!=='insertText')return false;
      editor.innerText=value;editor.textContent=value;return true;
    }};
  const selection={anchorNode:editor,focusNode:editor,rangeCount:1,
    removeAllRanges(){},addRange(){}};
  const win={location:{origin:'https://chatgpt.com',
      href:'https://chatgpt.com/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    getSelection:()=>selection,setTimeout:callback=>{callback();return 1}};
  win.top=win;
  return {site:createVoiceCleanupSite({doc,win}),editor,win,doc};
}
test('native editor safely binds original draft and blocks later edits',()=>{
  const {site,editor,win}=fixture();
  const snap=site.capture();
  assert.equal(snap.ok,true);
  assert.equal(snap.binding.draft,'原草稿');
  editor.innerText='用户新草稿';editor.textContent='用户新草稿';
  assert.equal(site.check(snap.binding,()=>false).ok,false);
  win.location.href='https://chatgpt.com/c/different';
  assert.equal(site.check(snap.binding,()=>false).ok,false);
});
test('IME composing blocks and exact read-back proves only filling',async()=>{
  const {site,editor}=fixture();
  const binding=site.capture().binding;
  assert.equal(site.check(binding,()=>true).ok,false);
  const receipt=await site.fill(binding,'Codex 与 React',()=>false);
  assert.equal(receipt.ok,true);
  assert.equal(receipt.sent,false);
  assert.equal(receipt.readBackVerified,true);
  assert.equal(editor.innerText,'Codex 与 React');
});
test('website draft restored during focus blocks replacement',async()=>{
  const {site,editor}=fixture();
  const binding=site.capture().binding;
  editor.focus=()=>{editor.innerText='官网恢复的新草稿';editor.textContent=editor.innerText;};
  const receipt=await site.fill(binding,'错误覆盖',()=>false);
  assert.equal(receipt.ok,false);
  assert.equal(receipt.outcome,'NOT_DISPATCHED');
  assert.equal(editor.innerText,'官网恢复的新草稿');
});
test('ambiguous or missing editor is refused',()=>{
  const {site,doc}=fixture();
  doc.querySelectorAll=()=>[];
  assert.equal(site.capture().ok,false);
});
